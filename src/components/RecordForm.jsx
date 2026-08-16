import { useMemo, useState } from 'react';
import { Camera, Loader2, Save, X } from 'lucide-react';
import { api } from '../lib/api';
import { today } from '../lib/format';

const DEFAULTS = {
  source: 'PRODUCTION', material_code: '', supplier: '', lot_id: '', po_number: '',
  defect_category: 'Surface / Paint', defect_description: '', detail: '', defect_level: 'MAJOR',
  ng_quantity: 1, inspected_quantity: '', functional_impact: false, safety_impact: false,
  occurrence_date: today(), image_urls: []
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function RecordForm({ initial, source, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial ? {
    ...DEFAULTS, ...initial.record,
    lot_id: initial.record.lot_id || '', po_number: initial.record.po_number || '',
    inspected_quantity: initial.record.inspected_quantity || ''
  } : { ...DEFAULTS, source: source || 'PRODUCTION' });
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const title = useMemo(() => `${initial ? 'Edit' : 'New'} ${form.source === 'INCOMING' ? 'Incoming' : 'Production'} NG`, [initial, form.source]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const uploaded = [];
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file);
        const result = await api.uploadImage(dataUrl);
        uploaded.push(result.url);
      }
      const payload = {
        ...form,
        ng_quantity: Number(form.ng_quantity),
        inspected_quantity: form.inspected_quantity ? Number(form.inspected_quantity) : null,
        image_urls: [...(form.image_urls || []), ...uploaded]
      };
      const result = initial ? await api.updateRecord(initial.record.id, payload) : await api.createRecord(payload);
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="record-form-title">
        <div className="modal-header">
          <div><span className="eyebrow">NG DATABASE</span><h2 id="record-form-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <form onSubmit={submit} className="record-form">
          {error && <div className="error-banner">{error}</div>}
          <div className="segmented">
            <button type="button" className={form.source === 'INCOMING' ? 'active' : ''} onClick={() => set('source', 'INCOMING')}>Incoming NG</button>
            <button type="button" className={form.source === 'PRODUCTION' ? 'active' : ''} onClick={() => set('source', 'PRODUCTION')}>Production NG</button>
          </div>
          <div className="form-grid">
            <label><span>Material Code *</span><input value={form.material_code} onChange={(e) => set('material_code', e.target.value.toUpperCase())} required placeholder="B0KI0271" /></label>
            <label><span>Supplier *</span><input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} required placeholder="Supplier name" /></label>
            <label><span>Occurrence Date *</span><input type="date" value={form.occurrence_date} onChange={(e) => set('occurrence_date', e.target.value)} required /></label>
            <label><span>Defect Level *</span><select value={form.defect_level} onChange={(e) => set('defect_level', e.target.value)}><option>MINOR</option><option>MAJOR</option><option>CRITICAL</option></select></label>
            <label><span>Defect Category *</span><select value={form.defect_category} onChange={(e) => set('defect_category', e.target.value)}><option>Surface / Paint</option><option>Dimension</option><option>Assembly / Fastener</option><option>Packaging</option><option>Label / Marking</option><option>Corrosion</option><option>Other</option></select></label>
            <label><span>Defect *</span><input value={form.defect_description} onChange={(e) => set('defect_description', e.target.value)} required placeholder="Edge Paint Chipping" /></label>
            <label><span>NG Quantity (PCS) *</span><input type="number" min="1" value={form.ng_quantity} onChange={(e) => set('ng_quantity', e.target.value)} required /></label>
            <label><span>Inspected Quantity</span><input type="number" min="1" value={form.inspected_quantity} onChange={(e) => set('inspected_quantity', e.target.value)} placeholder="Optional" /></label>
            <label><span>Lot ID</span><input value={form.lot_id} onChange={(e) => set('lot_id', e.target.value)} placeholder="Optional" /></label>
            <label><span>PO Number</span><input value={form.po_number} onChange={(e) => set('po_number', e.target.value)} placeholder="Optional" /></label>
            <label className="span-2"><span>Detail / Evidence *</span><textarea value={form.detail} onChange={(e) => set('detail', e.target.value)} rows="4" required placeholder="Describe the observed condition and impact. Do not enter an assumed root cause." /></label>
          </div>
          <div className="impact-row">
            <label className="check"><input type="checkbox" checked={form.functional_impact} onChange={(e) => set('functional_impact', e.target.checked)} /><span><strong>Functional Impact</strong><small>Affects function or assembly</small></span></label>
            <label className="check danger-check"><input type="checkbox" checked={form.safety_impact} onChange={(e) => set('safety_impact', e.target.checked)} /><span><strong>Safety Impact</strong><small>Immediate HIGH override</small></span></label>
          </div>
          <label className="upload-zone"><Camera size={22} /><span><strong>Add evidence pictures</strong><small>JPEG, PNG or WEBP · Max 1.5 MB each · Lot ID is not required</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles([...e.target.files].slice(0, 5))} /></label>
          {(files.length > 0 || form.image_urls?.length > 0) && <p className="file-note">{form.image_urls?.length || 0} saved · {files.length} ready to upload</p>}
          <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? <Loader2 className="spin" /> : <Save />}{saving ? 'Saving…' : 'Save & assess risk'}</button></div>
        </form>
      </section>
    </div>
  );
}
