"""Forecast selection and evaluation, independent of the data source."""
from datetime import datetime
from math import sqrt


def select_forecasts(records: list[dict], cutoff: datetime) -> dict:
    selected = {}
    for record in records:
        published = datetime.fromisoformat(record['publishTime'].replace('Z', '+00:00'))
        target = record['startTime']
        if published <= cutoff and (
            target not in selected or published > selected[target][0]
        ):
            selected[target] = (published, record)
    return {target: record for target, (_, record) in selected.items()}


def calculate_metrics(points: list[dict]) -> dict:
    paired = [p for p in points if p['actual'] is not None and p['forecast'] is not None]
    errors = [p['forecast'] - p['actual'] for p in paired]
    count = len(errors)
    return {
        'mae': round(sum(abs(e) for e in errors) / count, 1) if count else None,
        'bias': round(sum(errors) / count, 1) if count else None,
        'rmse': round(sqrt(sum(e * e for e in errors) / count), 1) if count else None,
        'matched_periods': count,
        'total_periods': len(points),
        'coverage_percent': round(count / len(points) * 100, 1) if points else 0,
        'peak_forecast': max((p['forecast'] for p in points if p['forecast'] is not None), default=None),
    }
