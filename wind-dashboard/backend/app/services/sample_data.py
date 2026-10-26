"""Deterministic synthetic fixtures. These are NOT Elexon observations."""
from datetime import date, datetime, time, timedelta, timezone
from math import sin, cos


def generate_sample_data(decision_date: date) -> tuple[list[dict], dict]:
    delivery_date = decision_date + timedelta(days=1)
    start = datetime.combine(delivery_date, time(), tzinfo=timezone.utc)
    forecasts, actuals = [], {}
    day = decision_date.day
    for period in range(48):
        target = (start + timedelta(minutes=30 * period)).isoformat()
        baseline = 8200 + 2600 * sin(period / 9 + day / 5) + 650 * cos(period / 3)
        actuals[target] = round(baseline + 700 * sin(period / 4 + day), 1)
        for hour in (5, 8, 10, 12, 16, 23):
            published = datetime.combine(decision_date, time(hour), tzinfo=timezone.utc)
            error = (24 - hour) * 48 * sin(period / 7 + day / 3) + 260
            forecasts.append({'startTime': target, 'publishTime': published.isoformat(), 'generation': round(baseline + error, 1)})
    return forecasts, actuals
