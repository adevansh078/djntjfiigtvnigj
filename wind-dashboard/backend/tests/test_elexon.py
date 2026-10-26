from datetime import date
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.elexon import ElexonError, ElexonProvider, get_provider


def test_real_response_normalization_cache_and_latest_actual_revision(tmp_path):
    calls = []
    def handler(request):
        calls.append(request)
        if 'WINDFOR' in request.url.path:
            assert request.url.params['publishDateTimeFrom'] == '2026-01-04T00:00:00+00:00'
            return httpx.Response(200, json=[
                {'startTime': '2026-01-11T01:00:00+01:00', 'publishTime': '2026-01-10T09:30:00Z', 'generation': 100},
                {'startTime': '2026-01-11T00:00:00Z', 'publishTime': '2026-01-10T12:30:00Z', 'generation': 200},
                {'startTime': '2026-01-10T00:00:00Z', 'publishTime': '2026-01-10T09:30:00Z', 'generation': 900},
                {'startTime': 'invalid', 'generation': 4}])
        assert request.url.params['fuelType'] == 'WIND'
        assert request.url.params['settlementDateFrom'] == '2026-01-11'
        return httpx.Response(200, json=[
            {'startTime': '2026-01-11T00:00:00Z', 'publishTime': '2026-01-12T00:00:00Z', 'fuelType': 'WIND', 'generation': 0},
            {'startTime': '2026-01-11T00:00:00Z', 'publishTime': '2026-01-11T00:30:00Z', 'fuelType': 'WIND', 'generation': 50},
            {'startTime': '2026-01-11T00:30:00Z', 'publishTime': '2026-01-11T01:00:00Z', 'fuelType': 'GAS', 'generation': 999}])
    provider = ElexonProvider(tmp_path, httpx.MockTransport(handler))
    app.dependency_overrides[get_provider] = lambda: provider
    try:
        client = TestClient(app)
        response = client.get('/api/dashboard?decision_date=2026-01-10&cutoff=11:00')
        assert response.status_code == 200
        result = response.json()
        assert result['data_source'] == 'elexon'
        assert len(result['points']) == 48
        assert result['points'][0]['forecast'] == 100
        assert result['points'][0]['actual'] == 0
        assert result['points'][0]['error'] == 100
        assert result['points'][1]['actual'] is None
        assert result['metrics']['matched_periods'] == 1
        assert result['missing_actuals'] == 47
        assert result['warnings']
        cached = client.get('/api/dashboard?decision_date=2026-01-10&cutoff=13:00').json()
        assert cached['cached'] is True
        assert cached['points'][0]['forecast'] == 200
        assert len(calls) == 2
    finally:
        app.dependency_overrides.clear()


def test_upstream_failure_is_not_replaced_with_sample_data(tmp_path):
    provider = ElexonProvider(tmp_path, httpx.MockTransport(lambda r: httpx.Response(403)))
    app.dependency_overrides[get_provider] = lambda: provider
    try:
        response = TestClient(app).get('/api/dashboard')
        assert response.status_code == 502
        assert '403' in response.json()['detail']
        assert 'points' not in response.json()
    finally:
        app.dependency_overrides.clear()


def test_corrupt_cache_and_invalid_payload(tmp_path):
    (tmp_path / 'v1-2026-01-10.json').write_text('broken json')
    provider = ElexonProvider(tmp_path, httpx.MockTransport(lambda r: httpx.Response(200, json={'unexpected': []})))
    with pytest.raises(ElexonError, match='unexpected response'):
        provider.load(date(2026, 1, 10))
