import { useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, LockKeyhole, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { EmptyState } from '../components/EmptyState';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../lib/api';
import { formatDate, frequencySummary } from '../lib/format';

export function PublicRiskPage() {
  const [code, setCode] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search(event) {
    event.preventDefault(); setLoading(true); setError('');
    try { const result = await api.publicRisk(code.trim()); setRows(result.rows); }
    catch (err) { setError(err.message); setRows(null); }
    finally { setLoading(false); }
  }

  const latest = rows?.find((item) => item.risk) || rows?.[0];

  return <div className="public-page"><header className="public-header"><Brand /><Link to="/login" className="admin-link"><LockKeyhole size={16} />Admin Login</Link></header><main>
    <section className="public-hero"><div className="hero-copy"><span className="eyebrow light">RISK-BASED INCOMING QUALITY CONTROL</span><h1>Know the risk before<br />the next inspection.</h1><p>Search by Material Code to review current risk, repeat history and the exact characteristic that needs additional IQC attention.</p><div className="principle"><ShieldCheck size={18} /><span><strong>Explainable risk.</strong> Every level comes from transparent rules—not AI prediction.</span></div></div><form className="search-card" onSubmit={search}><div className="search-icon"><ClipboardCheck /></div><h2>Material Risk Search</h2><p>Scan or enter a Material Code</p><label><span>Material Code</span><div className="search-input"><Search /><input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. B0KI0271" required minLength="2" /><button disabled={loading}>{loading ? 'Searching…' : <ArrowRight />}</button></div></label><small>Lot ID is not required</small></form></section>
    <section className="public-results" aria-live="polite">{error && <div className="error-banner">{error}</div>}{rows && rows.length === 0 && <EmptyState title="No risk record found" text={`No NG history is available for ${code.toUpperCase()}.`} />}{latest && <><div className="result-heading"><div><span className="eyebrow">LATEST RISK RESULT</span><h2>{latest.record.material_code}</h2><p>{latest.record.supplier}</p></div><RiskBadge level={latest.risk?.risk_level || 'PENDING'} large /></div><div className="public-risk-grid"><article className="result-card primary-result"><span>DEFECT</span><h3>{latest.record.defect_description}</h3><p>{latest.record.detail}</p><dl><div><dt>Trigger</dt><dd>{latest.risk?.risk_trigger || 'PROCESSING'}</dd></div><div><dt>Frequency</dt><dd>{latest.risk ? `${frequencySummary(latest.record, latest.risk)} · ${latest.risk.repeat_qty} PCS impact` : '—'}</dd></div><div><dt>Last record</dt><dd>{formatDate(latest.record.occurrence_date)}</dd></div></dl></article><article className="result-card"><span>RISK REASON</span><p className="reason-copy">{latest.risk?.risk_reason || 'Risk processing is pending.'}</p><span>RISK-BASED INSPECTION FOCUS</span><ul className="focus-list">{(latest.risk?.inspection_focus || []).map((focus) => <li key={focus}><CheckCircle2 />{focus}</li>)}</ul><small className="internal-note">For IQC internal inspection use</small></article></div>{rows.length > 1 && <div className="history-strip"><div><span>NG HISTORY</span><strong>{rows.length} records found</strong></div>{rows.slice(0, 5).map((item) => <div key={item.record.id}><span>{formatDate(item.record.occurrence_date)}</span><strong>{item.record.defect_description}</strong><small>{item.record.ng_quantity} PCS · {item.risk?.risk_level || 'PENDING'}</small></div>)}</div>}</>}</section>
  </main><footer className="public-footer"><span>IQC provides quality risk information and supplier attention recommendations.</span><strong>This system does not replace SQE corrective action management.</strong></footer></div>;
}
