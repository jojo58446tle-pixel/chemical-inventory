import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, BarChart3, Database, Download, FileWarning, LogOut, Menu, Plus, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { EmptyState } from '../components/EmptyState';
import { RecordDetail } from '../components/RecordDetail';
import { RecordForm } from '../components/RecordForm';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../lib/api';
import { formatDate, frequencyUnit } from '../lib/format';

export function AdminPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      await api.me();
      const result = await api.records();
      setRows(result.rows);
    } catch (err) {
      if (err.status === 401) navigate('/login', { replace: true });
      else setError(err.message);
    } finally { setLoading(false); }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((item) => {
    const haystack = `${item.record.material_code} ${item.record.supplier} ${item.record.defect_description}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) &&
      (riskFilter === 'ALL' || item.risk?.risk_level === riskFilter) &&
      (sourceFilter === 'ALL' || item.record.source === sourceFilter);
  }), [rows, query, riskFilter, sourceFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    high: rows.filter((item) => item.risk?.risk_level === 'HIGH').length,
    repeat: rows.filter((item) => Number(item.risk?.repeat_occurrences || 0) >= 2).length,
    aiFallback: rows.filter((item) => item.recommendation?.status === 'FALLBACK').length
  }), [rows]);

  async function logout() { await api.logout(); navigate('/login', { replace: true }); }
  async function remove(item) {
    if (!window.confirm(`Delete ${item.record.material_code} — ${item.record.defect_description}? Risk history will be recalculated.`)) return;
    try { await api.deleteRecord(item.record.id); setSelected(null); await load(); }
    catch (err) { setError(err.message); }
  }

  function updateSelected(updated) {
    setSelected(updated);
    setRows((current) => current.map((item) => item.record.id === updated.record.id ? updated : item));
  }

  return <div className="admin-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}><div className="sidebar-top"><Brand /><button className="mobile-close" onClick={() => setMenuOpen(false)}><X /></button></div><nav><a href="#dashboard" className="active"><BarChart3 />Risk Dashboard</a><a href="#records"><Database />NG Database</a><a href="#high-risk"><AlertTriangle />High Risk</a><a href="#ai"><ShieldCheck />AI Analysis</a></nav><div className="sidebar-bottom"><Link to="/" target="_blank">Public Risk Search <ArrowUpRight /></Link><button onClick={logout}><LogOut />Sign out</button></div></aside>
    {menuOpen && <div className="mobile-overlay" onClick={() => setMenuOpen(false)} />}
    <main className="admin-main"><header className="admin-header"><button className="menu-button" onClick={() => setMenuOpen(true)}><Menu /></button><div><span className="eyebrow">IQC QUALITY OPERATIONS</span><h1>Risk Assessment</h1></div><div className="header-actions"><button className="button secondary" onClick={load}><RefreshCw />Refresh</button><a className="button secondary export-button" href="/api/export.xlsx"><Download />Export Excel</a><button className="button primary" onClick={() => setForm({ source: 'PRODUCTION' })}><Plus />New NG</button></div></header>
      <div className="admin-content" id="dashboard">{error && <div className="error-banner">{error}</div>}
        <section className="principle-banner"><ShieldCheck /><div><strong>Risk Engine answers: HOW RISKY IS THIS?</strong><span>Rule-based and explainable · Source of truth</span></div><div><strong>AI answers: WHICH CONTROL AREAS SHOULD BE REVIEWED?</strong><span>Recommendation only · Never confirms root cause</span></div></section>
        <section className="stats-grid"><article><span>Total NG Records</span><strong>{stats.total}</strong><small>Incoming + Production</small><Database /></article><article className="stat-danger"><span>High Risk</span><strong>{stats.high}</strong><small>Current record results</small><AlertTriangle /></article><article><span>Repeat Triggers</span><strong>{stats.repeat}</strong><small>Batch / Occurrence frequency only</small><FileWarning /></article><article><span>AI Fallback Used</span><strong>{stats.aiFallback}</strong><small>NG and risk remain saved</small><ShieldCheck /></article></section>
        <section className="records-section" id="records"><div className="section-head"><div><span className="eyebrow">NG DATABASE</span><h2>Risk events</h2></div><div className="quick-add"><button onClick={() => setForm({ source: 'INCOMING' })}><Plus />Incoming NG</button><button onClick={() => setForm({ source: 'PRODUCTION' })}><Plus />Production NG</button></div></div>
          <div className="filters"><label className="filter-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Material, supplier or defect" /></label><select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}><option value="ALL">All Sources</option><option value="INCOMING">Incoming</option><option value="PRODUCTION">Production</option></select><select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}><option value="ALL">All Risk Levels</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></div>
          {loading ? <div className="loading-panel"><RefreshCw className="spin" />Loading risk records…</div> : filtered.length === 0 ? <EmptyState /> : <div className="table-wrap"><table><thead><tr><th>Date / Source</th><th>Material / Supplier</th><th>Defect</th><th>Frequency / Impact</th><th>Risk</th><th>AI</th><th></th></tr></thead><tbody>{filtered.map((item) => <tr key={item.record.id} onClick={() => setSelected(item)}><td data-label="Date / Source"><strong>{formatDate(item.record.occurrence_date)}</strong><small>{item.record.source}</small></td><td data-label="Material / Supplier"><strong className="material-code">{item.record.material_code}</strong><small>{item.record.supplier}</small></td><td data-label="Defect"><strong>{item.record.defect_description}</strong><small>{item.record.defect_level} · {item.record.ng_quantity} PCS</small></td><td data-label="Frequency / Impact"><strong>{item.risk ? `${item.risk.repeat_occurrences} ${frequencyUnit(item.record.source, item.risk.repeat_occurrences)}` : '—'}</strong><small>{item.risk ? `${item.risk.repeat_qty} PCS impact · ${item.risk.window_days} days` : 'Processing'}</small></td><td data-label="Risk"><RiskBadge level={item.risk?.risk_level || 'PENDING'} /><small className="trigger-text">{item.risk?.risk_trigger || 'PROCESSING'}</small></td><td data-label="AI"><span className={`ai-table-status ai-${item.recommendation?.status?.toLowerCase() || 'idle'}`}>{item.recommendation?.status === 'FALLBACK' ? 'FALLBACK USED' : item.recommendation?.status || '—'}</span></td><td><button className="row-button" aria-label="Open record"><ArrowUpRight /></button></td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </main>
    {form && <RecordForm initial={form.initial} source={form.source} onClose={() => setForm(null)} onSaved={async () => { setForm(null); setSelected(null); await load(); }} />}
    {selected && <RecordDetail item={selected} onClose={() => setSelected(null)} onEdit={(item) => { setSelected(null); setForm({ initial: item }); }} onDelete={remove} onUpdated={updateSelected} />}
  </div>;
}
