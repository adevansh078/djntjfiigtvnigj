import { useEffect, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Wind, LayoutDashboard, ArrowUpRight, ArrowRight, Info, Clock3, Download, Check, Activity, CalendarDays, RefreshCw } from 'lucide-react';
import Calculations from './Calculations';
import './calculations.css';
import FormulaHint from './FormulaHint';

const number = value => value == null ? '—' : new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0}).format(value);
const time = value => new Date(value).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
const day = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'});
const cutoffOptions = Array.from({length: 48}, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);

function exportCSV(data) {
  const rows = [['start_time_utc', 'forecast_mw', 'actual_mw', 'error_mw', 'published_utc', 'source'], ...data.points.map(p => [p.startTime, p.forecast, p.actual, p.error, p.publishTime, data.data_source])];
  const url = URL.createObjectURL(new Blob([rows.map(row => row.join(',')).join('\n')], {type: 'text/csv;charset=utf-8;'}));
  const link = document.createElement('a'); link.href = url; link.download = `${data.data_source}-wind-${data.delivery_date}.csv`; link.click(); URL.revokeObjectURL(url);
}

export default function App() {
  const [date, setDate] = useState(() => new URLSearchParams(window.location.search).get('decision_date') || '2026-01-10');
  const [cutoff, setCutoff] = useState(() => new URLSearchParams(window.location.search).get('cutoff') || '11:00');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [showActual, setShowActual] = useState(true);
  const isCalculations = window.location.pathname === '/calculations';
  const selectionQuery = new URLSearchParams({decision_date: date, cutoff}).toString();
  const overviewUrl = `/?${selectionQuery}`;
  const calculationsUrl = `/calculations?${selectionQuery}`;
  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}?${selectionQuery}${window.location.hash}`);
  }, [selectionQuery]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetch(`/api/dashboard?decision_date=${date}&cutoff=${cutoff}`, {signal: controller.signal})
      .then(async response => {const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Please check your date and cutoff.'); return body;})
      .then(setData).catch(e => {if (e.name !== 'AbortError') setError(e.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [date, cutoff, revision]);
  const metrics = data?.metrics;
  const chart = data?.points.map(p => ({...p, label: time(p.startTime)})) || [];
  return <div className="shell">
    <aside className="sidebar">
      <a href={overviewUrl} className="brand"><span className="brand-mark"><Wind size={25}/></span>windwise<span className="brand-dot">.</span></a>
      <div className="workspace-label">WORKSPACE</div>
      <a className={`nav-item ${!isCalculations ? 'active' : ''}`} href={overviewUrl}><LayoutDashboard size={18}/> Overview <span className="nav-count">01</span></a>
      <a className={`nav-item calculations-nav ${isCalculations ? 'active' : ''}`} href={calculationsUrl}><Activity size={20}/> Full calculations</a>
      <div className="sidebar-note"><span className="small-label">BUILT FOR THE DAY AHEAD</span><Wind size={40} strokeWidth={1}/><p>A clearer view of wind.<br/>A more informed decision.</p><span>UK wind generation intelligence</span></div>
      <div className="profile"><span className="avatar">W</span><div>Research workspace<small>Elexon · January 2026</small></div></div>
    </aside>
    <main id="overview">
      <header className="topbar"><span>Workspace <span className="slash">/</span> <strong>{isCalculations ? 'Full calculations' : 'Overview'}</strong></span><span className="prototype"><span/> Historical Elexon data</span></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">WIND GENERATION INTELLIGENCE</div><h1>{isCalculations ? 'Every Forecast, Explained.' : 'Tomorrow, with perspective.'}</h1><p>{isCalculations ? 'Every delivery period and the calculations behind your daily summary.' : 'Understand the forecast. See the uncertainty. Plan with confidence.'}</p></div><button className="export" disabled={!data || loading} onClick={() => exportCSV(data)}><Download size={16}/> Export data</button></div>
        <div className="demo-banner"><Info size={17}/><div><strong>{data ? 'Connected to Elexon Insights.' : 'Elexon Insights data source.'}</strong> WINDFOR forecasts and FUELHH wind actuals. {data ? `${data.cached ? 'Cached response' : 'Fetched from source'} · Retrieved ${new Date(data.fetched_at).toLocaleString('en-GB', {timeZone: 'UTC'})} UTC.` : 'Historical records load when you select a decision window.'}</div><span>REAL DATA</span></div>
        <section className="controls" aria-label="Decision controls"><div className="control-heading"><CalendarDays size={20}/><div><strong>Your decision window</strong><small>Explore forecasts available as of your chosen time</small></div></div><label>Decision date<input type="date" value={date} min="2026-01-01" max="2026-01-31" required onChange={e => {if(e.target.value) setDate(e.target.value);}}/></label><label>Decision cutoff<select value={cutoff} onChange={e => setCutoff(e.target.value)}>{cutoffOptions.map(t => <option key={t}>{t}</option>)}</select></label><span className="timezone"><Clock3 size={14}/> UK time · UTC</span></section>
        {error && <div className="error" role="alert"><strong>Couldn’t load the dashboard.</strong><p>{error}</p><p>Please retry. If the backend is unavailable, start FastAPI on port 8000.</p><button onClick={() => setRevision(r => r + 1)}><RefreshCw size={15}/> Try again</button></div>}
        {loading && <div className="loading" role="status">Loading Elexon records and preparing your decision window… The first request for a date may take a little longer.</div>}
        {data && !loading && <>
          <div className="section-line"><h2>{isCalculations ? 'Daily summary' : 'At a glance'}</h2><span>Delivery on {day(data.delivery_date)} <ArrowRight size={14}/></span></div>
          <section className="metrics">
            <Metric label="PEAK WIND FORECAST" value={number(metrics.peak_forecast)} unit="MW" icon={<Wind size={19}/>} note="Highest forecast half-hour" featured/>
            <Metric label="MEAN ABSOLUTE ERROR" value={number(metrics.mae)} unit="MW" icon={<Activity size={19}/>} note="Average size of forecast error"/>
            <Metric label="FORECAST BIAS" value={`${metrics.bias > 0 ? '+' : ''}${number(metrics.bias)}`} unit="MW" icon={<ArrowUpRight size={19}/>} note={metrics.bias == null ? 'No matched periods at this cutoff' : metrics.bias >= 0 ? 'Wind was overestimated on average' : 'Wind was underestimated on average'}/>
            <Metric label="HALF-HOUR GRID MATCH" value={number(metrics.coverage_percent)} unit="%" icon={<Check size={19}/>} note={`${metrics.matched_periods} of ${metrics.total_periods} slots · not source completeness`}/>
          </section>
          {isCalculations ? <Calculations data={data} overviewUrl={overviewUrl}/> : <>
          <section className="chart-card" id="analysis"><div className="chart-heading"><div><h2>Expectation meets reality</h2><p>Hourly forecast targets · Half-hourly actuals · Exact timestamp comparisons</p></div><div className="legend"><span><i className="forecast-dot"/> Forecast</span><label><input type="checkbox" checked={showActual} onChange={e => setShowActual(e.target.checked)}/> Actual generation</label></div></div>
            <div className="axis-label">GENERATION (MW)</div>
            {metrics.matched_periods === 0 && <p className="empty-note">No matched forecast and actual pairs are available for this decision window. Try another date or cutoff.</p>}
            <div className="chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chart} margin={{top: 12, right: 16, left: 0, bottom: 8}}><defs><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2b8061" stopOpacity={0.16}/><stop offset="100%" stopColor="#2b8061" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e7ebe7"/><XAxis dataKey="label" interval={7} tickLine={false} axisLine={false} tick={{fontSize: 11, fill: '#7a8580'}} dy={12}/><YAxis tickFormatter={v => `${v/1000}k`} tickLine={false} axisLine={false} tick={{fontSize: 11, fill: '#7a8580'}} width={45}/><Tooltip formatter={(value, name) => [`${number(value)} MW`, name === 'forecast' ? 'Forecast' : 'Actual']} contentStyle={{borderRadius: 10, border: '1px solid #dce5df', fontSize: 12}} labelFormatter={label => `${label} UTC · ${data.delivery_date}`}/><Area type="monotone" dataKey="forecast" stroke="#287555" strokeWidth={2.5} fill="url(#forecastFill)" dot={{r: 3, fill: '#287555', strokeWidth: 0}} connectNulls={false}/>{showActual && <Line type="monotone" dataKey="actual" stroke="#b29153" strokeWidth={2} strokeDasharray="5 4" dot={false}/>}</ComposedChart></ResponsiveContainer></div>
            <div className="chart-footer"><span><Clock3 size={14}/> 30-minute grid · Forecast dots show available samples · UTC</span><span>Forecasts published by {time(data.cutoff)} on {day(data.decision_date)}</span></div>
          </section>
          <div className="bottom-grid"><section className="method-card" id="methodology"><span className="eyebrow">BEHIND THE NUMBERS</span><h2>The right forecast, at the right time.</h2><p>For each delivery half-hour, we select the most recent forecast published on or before your decision cutoff. Later updates are excluded from the comparison.</p><div className="method-tags"><span><Check size={13}/> No future information</span><span><Check size={13}/> Missing ≠ zero</span></div><small>Cutoff is a configurable prototype assumption. National wind data alone does not determine a utility’s purchase volume.</small></section><section className="table-card"><div className="table-title"><h2>A closer look</h2><span>First 4 periods · MW</span></div><table><thead><tr><th scope="col">Time</th><th scope="col">Forecast</th><th scope="col">Actual</th><th scope="col">Error</th></tr></thead><tbody>{chart.slice(0,4).map(p => <tr key={p.startTime}><td>{p.label}</td><td>{number(p.forecast)}</td><td>{number(p.actual)}</td><td className={p.error > 0 ? 'positive' : ''}>{p.error > 0 ? '+' : ''}{number(p.error)}</td></tr>)}</tbody></table><small>Error = forecast − actual. Positive means overestimated wind.</small><div className="table-detail-link"><a href={calculationsUrl} className="view-all">View all calculations <ArrowRight size={14}/></a></div></section></div>
          </>}
        </>}
        <footer>windwise <span>Source: <a href="https://bmrs.elexon.co.uk" target="_blank" rel="noreferrer">Elexon Insights</a></span><span>January 2026 · Historical analysis</span></footer>
      </div>
    </main>
  </div>;
}

const metricFormulas = {
  'PEAK WIND FORECAST': 'Peak forecast = maximum available selected forecast for the delivery day (MW).',
  'MEAN ABSOLUTE ERROR': 'MAE = Σ |forecast − actual| ÷ N (MW). N is the number of matched timestamps for this delivery day.',
  'FORECAST BIAS': 'Bias = Σ (forecast − actual) ÷ N (MW). Positive means overestimated wind. N is the number of matched timestamps.',
  'HALF-HOUR GRID MATCH': 'Grid match = matched timestamps ÷ 48 delivery slots × 100%. This is not source-data completeness.',
};
function Metric({label, value, unit, icon, note, featured}) {return <article className={`metric ${featured ? 'featured' : ''}`}><div className="metric-top"><FormulaHint formula={metricFormulas[label]}>{label}</FormulaHint>{icon}</div><div className="metric-value">{value}<span>{unit}</span></div><p>{note}</p></article>;}




