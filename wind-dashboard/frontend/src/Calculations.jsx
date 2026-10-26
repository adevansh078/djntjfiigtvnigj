import FormulaHint from './FormulaHint';

const format = value => value == null ? '—' : new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2}).format(value);
const clock = value => new Date(value).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
const signed = value => value == null ? '—' : `${value > 0 ? '+' : ''}${format(value)}`;
const utcTimestamp = value => new Date(value).toISOString().replace('.000Z', 'Z');

function ForecastMessage({point}) {
  if (!point.publishTime || point.forecast == null) return <span className="no-message">No eligible forecast record</span>;
  const message = {
    dataset: 'WINDFOR',
    publishTime: utcTimestamp(point.publishTime),
    startTime: utcTimestamp(point.startTime),
    generation: point.forecast,
  };
  return <pre className="forecast-message"><code>{JSON.stringify(message, null, 2)}</code></pre>;
}

export default function Calculations({data, overviewUrl}) {
  const matched = data.points.filter(p => p.forecast != null && p.actual != null);
  const errors = matched.map(p => p.forecast - p.actual);
  const total = errors.reduce((sum, error) => sum + error, 0);
  const squaredTotal = errors.reduce((sum, error) => sum + error ** 2, 0);
  const count = matched.length;
  return <section className="calculation-details">
    <div className="details-heading"><div><h2>Every period, every calculation.</h2><p>Delivery {data.delivery_date} · Cutoff {data.decision_date} at {clock(data.cutoff)} UTC</p></div><a href={overviewUrl} className="view-all">← Back to overview</a></div>
    <p className="calculation-explainer">The summary cards above describe all {count} matched timestamps for this delivery day. Each error is forecast minus actual. Unmatched rows remain visible but are excluded from MAE, bias, and RMSE. Displayed values are rounded; calculations use the underlying values.</p>
    {count === 0 && <p className="empty-note">There are no matched pairs. The averages are undefined, so they are shown as — rather than zero.</p>}
    <div className="additional-calculations"><p><strong>Peak forecast:</strong> max of the available forecasts = {format(data.metrics.peak_forecast)} MW.</p><p><strong>Half-hour grid match:</strong> {count} ÷ {data.points.length} × 100 = {format(data.metrics.coverage_percent)}%. This measures grid alignment, not completeness of the hourly forecast source.</p></div>
    <div className="full-table-card"><div className="table-title"><h2>Complete delivery-day table</h2><span>{data.points.length} periods · {count} matched</span></div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="All delivery periods and error calculations, horizontally scrollable">
        <table className="full-table message-table"><caption>Each message shows the selected WINDFOR record for that delivery timestamp. Publication times can repeat across records; startTime identifies the target of each prediction. Timestamps are normalized to UTC (Z); generation is MW. Hover or focus the error heading for its formula.</caption><colgroup><col className="col-period"/><col className="col-start"/><col className="col-message"/><col className="col-power"/><col className="col-power"/><col className="col-error"/><col className="col-square"/><col className="col-status"/></colgroup><thead><tr><th scope="col">Period</th><th scope="col">Delivery start</th><th scope="col">Complete selected forecast message</th><th scope="col">Forecast<br/>MW</th><th scope="col">Actual<br/>MW</th><th scope="col"><FormulaHint formula="Error = forecast − actual (MW). Positive means overestimated wind; negative means underestimated wind.">Error (MW)</FormulaHint></th><th scope="col"><FormulaHint formula="Squared error = (forecast − actual)² (MW²). RMSE = √(sum of squared errors ÷ matched periods).">Error² (MW²)</FormulaHint></th><th scope="col">Included?</th></tr></thead>
          <tbody>{data.points.map((point, index) => {
            const error = point.forecast != null && point.actual != null ? point.forecast - point.actual : null;
            return <tr key={point.startTime} className={error == null ? 'unmatched-row' : ''}><th scope="row">{String(index + 1).padStart(2, '0')}</th><td>{clock(point.startTime)}</td><td><ForecastMessage point={point}/></td><td>{format(point.forecast)}</td><td>{format(point.actual)}</td><td className={error > 0 ? 'positive' : ''} title={error == null ? 'Excluded: a forecast or actual is unavailable.' : `${format(point.forecast)} − ${format(point.actual)} = ${signed(error)} MW`}>{signed(error)}</td><td title={error == null ? undefined : `(${format(point.forecast)} − ${format(point.actual)})² = ${format(error ** 2)} MW²`}>{error == null ? '—' : format(error ** 2)}</td><td><span className={`row-status ${error == null ? 'excluded' : ''}`}>{error != null ? 'Matched' : point.forecast == null && point.actual == null ? 'No values' : point.forecast == null ? 'No forecast' : 'No actual'}</span></td></tr>;
          })}</tbody><tfoot><tr><th scope="row" colSpan={5}>Totals across {count} matched periods</th><td>{signed(total)}</td><td>{format(squaredTotal)}</td><td>N = {count}</td></tr></tfoot>
        </table>
      </div>
    </div>
  </section>;
}



