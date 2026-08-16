export function riskClass(level) {
  return `risk-${String(level || 'pending').toLowerCase()}`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function frequencyUnit(source, count = 0) {
  if (source === 'INCOMING') return Number(count) === 1 ? 'Batch' : 'Batches';
  return Number(count) === 1 ? 'Occurrence' : 'Occurrences';
}

export function frequencySummary(record, risk) {
  if (!risk) return '—';
  return `${risk.repeat_occurrences} ${frequencyUnit(record.source, risk.repeat_occurrences)} / ${risk.window_days} Days`;
}

export function supplierMessage(item) {
  const { record, risk, recommendation } = item;
  const high = risk?.risk_level === 'HIGH';
  const recommendations = recommendation?.supplier_recommendation?.length
    ? recommendation.supplier_recommendation
    : [
        'Please review the related production and quality control process.',
        'Please strengthen inspection of the affected area before delivery.',
        'Please take appropriate preventive action to avoid recurrence.'
      ];
  const impact = record.safety_impact
    ? 'The reported condition has a safety impact and requires priority review of the relevant controls.'
    : record.functional_impact
      ? 'The reported condition affects product function or assembly.'
      : record.detail || 'The reported condition affects the identified quality characteristic.';
  return [
    high ? '🚨 IQC HIGH RISK ALERT' : '⚠️ IQC QUALITY RISK NOTICE', '',
    `Material Code: ${record.material_code}`,
    `Defect: ${record.defect_description}`,
    `Risk Level: ${high ? '🔴' : '🟠'} ${risk?.risk_level || 'PENDING'}`, '',
    'Reason:', risk?.risk_reason || 'Risk processing is pending.', '',
    'Impact:', impact, '',
    'Recommended Supplier Attention:',
    ...recommendations.slice(0, 3).map((text) => `• ${text}`), '',
    'Thank you for your support.'
  ].join('\n');
}

export function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}
