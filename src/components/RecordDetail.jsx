import { useState } from 'react';
import { Bot, Check, Clipboard, Edit3, Loader2, RefreshCw, ShieldAlert, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, frequencySummary, supplierMessage } from '../lib/format';
import { RiskBadge } from './RiskBadge';

export function RecordDetail({ item, onClose, onEdit, onDelete, onUpdated }) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const { record, risk, recommendation } = item;

  async function copyMessage() {
    await navigator.clipboard.writeText(supplierMessage(item));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function regenerate() {
    setRegenerating(true); setError('');
    try {
      const result = await api.regenerateAI(risk.id);
      onUpdated({ ...item, recommendation: result.recommendation });
    } catch (err) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="modal-backdrop detail-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal detail-modal" role="dialog" aria-modal="true" aria-label="Risk detail">
        <div className="modal-header detail-title">
          <div><span className="eyebrow">{record.source} NG · {formatDate(record.occurrence_date)}</span><h2>{record.material_code}</h2><p>{record.supplier}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>

        <div className="detail-content">
          <section className={`risk-hero risk-panel-${risk?.risk_level?.toLowerCase() || 'pending'}`}>
            <div><span className="section-kicker"><ShieldAlert size={15} />RULE-BASED RISK</span><RiskBadge level={risk?.risk_level || 'PENDING'} large /></div>
            <div className="risk-facts"><span><small>DEFECT</small><strong>{record.defect_description}</strong></span><span><small>TRIGGER</small><strong>{risk?.risk_trigger || 'PROCESSING'}</strong></span><span><small>FREQUENCY / IMPACT</small><strong>{risk ? `${frequencySummary(record, risk)} · ${risk.repeat_qty} PCS impact` : '—'}</strong></span></div>
            <p className="risk-reason">{risk?.risk_reason || 'The NG record was saved. Risk processing requires attention from the administrator.'}</p>
          </section>

          <div className="detail-grid">
            <section className="detail-card"><h3>NG Evidence</h3><dl><div><dt>Category</dt><dd>{record.defect_category}</dd></div><div><dt>Level</dt><dd>{record.defect_level}</dd></div><div><dt>NG Quantity</dt><dd>{record.ng_quantity} PCS</dd></div><div><dt>Lot ID</dt><dd>{record.lot_id || 'Not required / N/A'}</dd></div><div className="full"><dt>Detail</dt><dd>{record.detail}</dd></div></dl>{record.image_urls?.length > 0 && <div className="evidence-grid">{record.image_urls.map((url) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt="NG evidence" /></a>)}</div>}</section>
            <section className="detail-card internal-card"><span className="internal-label">IQC INTERNAL</span><h3>Risk-Based Inspection Focus</h3><ul className="focus-list">{(risk?.inspection_focus || []).map((focus) => <li key={focus}>{focus}</li>)}</ul><p className="muted">This inspection focus is not included in the supplier message.</p></section>
          </div>

          <section className="ai-panel">
            <div className="ai-header"><div className="ai-icon"><Bot /></div><div><span className="section-kicker">AI QUALITY ANALYSIS</span><h3>Control areas to review</h3></div><span className={`ai-status ai-${recommendation?.status?.toLowerCase() || 'idle'}`}>{recommendation?.status === 'FALLBACK' ? 'FALLBACK USED' : recommendation?.status || 'NOT TRIGGERED'}</span></div>
            {error && <div className="error-banner">{error}</div>}
            {recommendation ? <>
              {recommendation.status === 'FALLBACK' && <div className="fallback-note">AI provider was unavailable or returned invalid data. Safe fallback recommendation is being used; the NG and rule-based risk remain valid.</div>}
              <div className="control-list">{recommendation.control_areas.map((area) => <article key={`${area.priority}-${area.area}`}><span>{area.priority}</span><div><strong>{area.area}</strong><p>{area.reason}</p></div></article>)}</div>
              <div className="supplier-box"><span>RECOMMENDED SUPPLIER ATTENTION</span><ul>{recommendation.supplier_recommendation.map((text) => <li key={text}>{text}</li>)}</ul><small>Confidence: {recommendation.confidence} · Prompt {recommendation.prompt_version}</small></div>
            </> : <div className="ai-empty"><p>AI was not triggered for this risk event. Risk remains determined by the rule engine.</p></div>}
            <div className="ai-actions">
              <button className="button primary" onClick={copyMessage} disabled={!risk}>{copied ? <Check /> : <Clipboard />}{copied ? 'Copied' : 'Copy supplier message'}</button>
              {risk && <button className="button secondary" onClick={regenerate} disabled={regenerating}>{regenerating ? <Loader2 className="spin" /> : <RefreshCw />}{regenerating ? 'Regenerating…' : 'Regenerate AI'}</button>}
            </div>
          </section>
        </div>
        <footer className="detail-footer"><button className="text-button" onClick={() => onEdit(item)}><Edit3 />Edit record</button><button className="text-button danger" onClick={() => onDelete(item)}><Trash2 />Delete record</button></footer>
      </section>
    </div>
  );
}
