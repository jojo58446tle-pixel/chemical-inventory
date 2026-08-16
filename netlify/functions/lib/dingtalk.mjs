import { createHmac } from 'node:crypto';

export function defectImpactSummary(record) {
  if (record.safety_impact) return 'The reported condition has a safety impact and requires priority review of the relevant controls.';
  if (record.functional_impact) return 'The reported condition affects product function or assembly.';
  const detail = String(record.detail || '').trim();
  return detail ? detail.slice(0, 420) : 'The reported condition affects the identified quality characteristic.';
}

export function buildSupplierMessage({ record, risk, recommendation }) {
  const recs = recommendation?.supplier_recommendation?.length
    ? recommendation.supplier_recommendation
    : [
        'Please review the related production and quality control process.',
        'Please strengthen inspection of the affected area before delivery.',
        'Please take appropriate preventive action to avoid recurrence.'
      ];
  return [
    '🚨 IQC HIGH RISK ALERT',
    '',
    `Material Code: ${record.material_code}`,
    `Defect: ${record.defect_description}`,
    `Risk Level: 🔴 ${risk.risk_level}`,
    '',
    'Reason:',
    risk.risk_reason,
    '',
    'Impact:',
    defectImpactSummary(record),
    '',
    'Recommended Supplier Attention:',
    ...recs.slice(0, 3).map((item) => `• ${item}`),
    '',
    'Thank you for your support.'
  ].join('\n');
}

export async function sendDingTalk(message, env = process.env) {
  if (!env.DINGTALK_WEBHOOK_URL) throw new Error('DINGTALK_WEBHOOK_URL is missing');
  const url = new URL(env.DINGTALK_WEBHOOK_URL);
  if (env.DINGTALK_SECRET) {
    const timestamp = Date.now();
    const sign = createHmac('sha256', env.DINGTALK_SECRET)
      .update(`${timestamp}\n${env.DINGTALK_SECRET}`)
      .digest('base64');
    url.searchParams.set('timestamp', String(timestamp));
    url.searchParams.set('sign', sign);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: message } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (payload.errcode !== undefined && payload.errcode !== 0)) {
    throw new Error(`DingTalk failed: ${payload.errmsg || response.status}`);
  }
  return payload;
}
