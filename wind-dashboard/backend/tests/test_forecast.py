from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.forecast import calculate_metrics, select_forecasts
from app.services.elexon import get_provider
from app.services.sample_data import generate_sample_data

client = TestClient(app)


@pytest.fixture(autouse=True)
def sample_provider():
    class SampleProvider:
        def load(self, decision_date):
            forecasts, actuals = generate_sample_data(decision_date)
            return {'forecasts': forecasts, 'actuals': actuals, 'warnings': [], 'cached': False,
                    'fetched_at': '2026-10-26T00:00:00+00:00', 'publication_window_start': '2026-01-01T00:00:00+00:00'}
    app.dependency_overrides[get_provider] = SampleProvider
    yield
    app.dependency_overrides.clear()


def test_never_uses_forecast_published_after_cutoff():
    records = [{'startTime': 'target', 'publishTime': f'2026-01-10T{hour}:00:00Z', 'generation': value}
               for hour, value in [('12', 100), ('08', 300), ('10', 200)]]
    selected = select_forecasts(records, datetime(2026, 1, 10, 11, tzinfo=timezone.utc))
    assert selected['target']['generation'] == 200


def test_metrics_ignore_missing_values_but_keep_zero():
    metrics = calculate_metrics([{'forecast': 100, 'actual': 0}, {'forecast': 0, 'actual': 50}, {'forecast': None, 'actual': 50}])
    assert metrics['mae'] == 75
    assert metrics['bias'] == 25
    assert metrics['matched_periods'] == 2


def test_latest_publication_is_selected_per_target_not_globally():
    records = [
        {'startTime': '2026-01-11T16:00:00Z', 'publishTime': '2026-01-10T07:30:00Z', 'generation': 100},
        {'startTime': '2026-01-11T16:00:00Z', 'publishTime': '2026-01-10T09:30:00Z', 'generation': 200},
        {'startTime': '2026-01-11T17:00:00Z', 'publishTime': '2026-01-10T07:30:00Z', 'generation': 300},
        {'startTime': '2026-01-11T17:00:00Z', 'publishTime': '2026-01-10T11:30:00Z', 'generation': 400},
    ]
    selected = select_forecasts(records, datetime(2026, 1, 10, 11, tzinfo=timezone.utc))
    assert selected['2026-01-11T16:00:00Z']['publishTime'] == '2026-01-10T09:30:00Z'
    assert selected['2026-01-11T17:00:00Z']['publishTime'] == '2026-01-10T07:30:00Z'
    assert selected['2026-01-11T17:00:00Z']['generation'] == 300


def test_january_boundary_and_no_forecasts_before_first_publication():
    result = client.get('/api/dashboard?decision_date=2026-01-31&cutoff=04:00').json()
    assert result['delivery_date'] == '2026-02-01'
    assert len(result['points']) == 48
    assert result['metrics']['mae'] is None
    assert result['metrics']['coverage_percent'] == 0


def test_invalid_inputs():
    assert client.get('/api/dashboard?decision_date=2026-02-01').status_code == 422
    assert client.get('/api/dashboard?cutoff=bad').status_code == 422
    assert client.get('/api/dashboard?cutoff=11:00%2B01:00').status_code == 422
