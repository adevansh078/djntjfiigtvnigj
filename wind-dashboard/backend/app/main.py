from datetime import date, datetime, time, timedelta, timezone
from fastapi import Depends, FastAPI, HTTPException, Query
from .services.forecast import calculate_metrics, select_forecasts
from .services.elexon import ElexonError, get_provider

app = FastAPI(title='Windwise API', version='0.2.0', description='Historical Elexon wind forecasts and actual generation. No simulated fallback.')


@app.get('/api/health')
def health():
    return {'status': 'ok', 'data_source': 'elexon', 'upstream_checked': False}


@app.get('/api/dashboard')
def dashboard(decision_date: date = Query(default=date(2026, 1, 10)), cutoff: str = Query(default='11:00'), source=Depends(get_provider)):
    if not date(2026, 1, 1) <= decision_date <= date(2026, 1, 31):
        raise HTTPException(422, 'Choose a purchasing decision date in January 2026.')
    try:
        cutoff_time = time.fromisoformat(cutoff)
        if cutoff_time.tzinfo is not None:
            raise ValueError()
    except ValueError:
        raise HTTPException(422, 'Cutoff must be a local time such as 11:00, without a timezone offset.')
    cutoff_at = datetime.combine(decision_date, cutoff_time, tzinfo=timezone.utc)
    try:
        source_data = source.load(decision_date)
    except ElexonError as exc:
        raise HTTPException(502, str(exc)) from exc
    actuals = source_data['actuals']
    selected = select_forecasts(source_data['forecasts'], cutoff_at)
    delivery_start = datetime.combine(decision_date + timedelta(days=1), time(), tzinfo=timezone.utc)
    points = []
    for period in range(48):
        target = (delivery_start + timedelta(minutes=period * 30)).isoformat()
        actual = actuals.get(target)
        forecast = selected.get(target)
        predicted = forecast['generation'] if forecast else None
        points.append({'startTime': target, 'forecast': predicted, 'actual': actual,
                       'publishTime': forecast['publishTime'] if forecast else None,
                       'error': round(predicted - actual, 1) if predicted is not None and actual is not None else None})
    warnings = list(source_data['warnings'])
    missing_forecasts = sum(p['forecast'] is None for p in points)
    missing_actuals = sum(p['actual'] is None for p in points)
    if missing_forecasts:
        warnings.append(f'{missing_forecasts} half-hour grid slots have no exact forecast match at this cutoff. Hourly source sampling can account for these gaps; this does not measure source completeness.')
    if missing_actuals:
        warnings.append(f'{missing_actuals} half-hours have no recorded wind actual.')
    return {'decision_date': decision_date.isoformat(), 'delivery_date': (decision_date + timedelta(days=1)).isoformat(),
            'cutoff': cutoff_at.isoformat(), 'timezone': 'Europe/London (UTC in January)',
            'data_source': 'elexon', 'notice': 'Source: Elexon Insights · WINDFOR forecasts and FUELHH wind actuals.',
            'fetched_at': source_data['fetched_at'], 'cached': source_data['cached'], 'warnings': warnings,
            'publication_window_start': source_data['publication_window_start'],
            'missing_forecasts': missing_forecasts, 'missing_actuals': missing_actuals,
            'metrics': calculate_metrics(points), 'points': points}
