"""Elexon Insights provider with bounded historical queries and a disk cache."""
import json
import logging
import os
from datetime import date, datetime, time, timedelta, timezone
from math import isfinite
from pathlib import Path
from threading import Lock
from time import sleep
from uuid import uuid4

import httpx

BASE_URL = 'https://data.elexon.co.uk/bmrs/api/v1'
LOGGER = logging.getLogger(__name__)


class ElexonError(Exception):
    pass


def timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Expected a timezone-aware timestamp')
    return parsed.astimezone(timezone.utc)


def normalize_records(rows: list, start: datetime, end: datetime, actual=False):
    normalized, skipped = [], 0
    for row in rows:
        try:
            if actual and row.get('fuelType') != 'WIND':
                continue
            target = timestamp(row['startTime'])
            if not start <= target < end:
                continue
            published = timestamp(row['publishTime'])
            value = row['generation']
            if value is None:
                continue
            if isinstance(value, bool) or not isfinite(float(value)):
                raise ValueError('Invalid generation value')
            normalized.append({'startTime': target.isoformat(), 'publishTime': published.isoformat(), 'generation': float(value)})
        except (KeyError, TypeError, ValueError, AttributeError):
            skipped += 1
    return normalized, skipped


class ElexonProvider:
    def __init__(self, cache_dir: Path | None = None, transport=None):
        self.cache_dir = cache_dir or Path(os.getenv('ELEXON_CACHE_DIR', Path(__file__).resolve().parents[2] / '.cache' / 'elexon'))
        self.transport = transport
        self.lock = Lock()

    def _request(self, client, dataset, params):
        for attempt in range(3):
            try:
                response = client.get(f'/datasets/{dataset}/stream', params=params)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < 2:
                        sleep(0.5 * (attempt + 1))
                        continue
                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list):
                    raise ElexonError(f'Elexon returned an unexpected response for {dataset}.')
                return rows
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                if attempt < 2:
                    continue
                raise ElexonError('Elexon could not be reached. Please try again shortly.') from exc
            except httpx.HTTPStatusError as exc:
                raise ElexonError(f'Elexon returned HTTP {exc.response.status_code} for {dataset}. Please try again shortly.') from exc
            except (ValueError, httpx.HTTPError) as exc:
                raise ElexonError(f'Elexon returned an unreadable response for {dataset}.') from exc

    def load(self, decision_date: date) -> dict:
        # A single lock prevents simultaneous React requests from fetching the same day twice.
        with self.lock:
            return self._load(decision_date)

    def _load(self, decision_date: date) -> dict:
        now = datetime.now(timezone.utc)
        cache_file = self.cache_dir / f'v1-{decision_date.isoformat()}.json'
        try:
            cached = json.loads(cache_file.read_text(encoding='utf-8'))
            if (cached['version'] == 1 and cached['decision_date'] == decision_date.isoformat()
                    and 0 <= (now - timestamp(cached['fetched_at'])).total_seconds() < 86400
                    and isinstance(cached['forecasts'], list) and isinstance(cached['actuals'], dict)
                    and isinstance(cached['warnings'], list)):
                return {**cached, 'cached': True}
        except (OSError, ValueError, KeyError, TypeError):
            pass

        decision_start = datetime.combine(decision_date, time(), tzinfo=timezone.utc)
        delivery_start = decision_start + timedelta(days=1)
        delivery_end = delivery_start + timedelta(days=1)
        # Seven publication days includes prior-day forecasts for early cutoffs.
        publication_start = decision_start - timedelta(days=6)
        with httpx.Client(base_url=BASE_URL, timeout=httpx.Timeout(30, connect=10), transport=self.transport,
                          headers={'Accept': 'application/json', 'User-Agent': 'Windwise-assignment/0.2'}) as client:
            forecast_rows = self._request(client, 'WINDFOR', {
                'publishDateTimeFrom': publication_start.isoformat(), 'publishDateTimeTo': delivery_start.isoformat()})
            actual_rows = self._request(client, 'FUELHH', {
                'settlementDateFrom': delivery_start.date().isoformat(),
                'settlementDateTo': delivery_start.date().isoformat(), 'fuelType': 'WIND'})
        forecasts, bad_forecasts = normalize_records(forecast_rows, delivery_start, delivery_end)
        actual_records, bad_actuals = normalize_records(actual_rows, delivery_start, delivery_end, actual=True)
        # Latest actual revision is used for retrospective evaluation, independently of forecast cutoff.
        actuals = {}
        for row in sorted(actual_records, key=lambda r: timestamp(r['publishTime'])):
            actuals[row['startTime']] = row['generation']
        warnings = []
        if bad_forecasts + bad_actuals:
            warnings.append(f'{bad_forecasts + bad_actuals} malformed source records were skipped.')
        payload = {'version': 1, 'decision_date': decision_date.isoformat(), 'forecasts': forecasts, 'actuals': actuals,
                   'fetched_at': now.isoformat(), 'warnings': warnings,
                   'publication_window_start': publication_start.isoformat()}
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            temporary = cache_file.with_suffix(f'.{uuid4().hex}.tmp')
            temporary.write_text(json.dumps(payload), encoding='utf-8')
            temporary.replace(cache_file)
        except OSError:
            LOGGER.warning('Could not write Elexon cache; serving fetched data without caching.')
        return {**payload, 'cached': False}


provider = ElexonProvider()


def get_provider():
    return provider
