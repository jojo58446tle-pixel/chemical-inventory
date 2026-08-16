import {
  deleteRows,
  getRecommendationForRisk,
  getRiskEventByRecord,
  getSuccessfulAlert,
  insertRow,
  listNgRecords,
  listRiskEvents,
  selectRows,
  updateRows,
  upsertRow,
  upsertRows
} from './database.mjs';
import {
  calculateRisk,
  calculateRiskSeries,
  makeAlertFingerprint,
  RISK_ENGINE_VERSION,
  shouldAlertRiskEvent,
  shouldGenerateAI
} from './risk-engine.mjs';
import { generateQualityRecommendation } from './ai/recommendation.mjs';
import { buildSupplierMessage, sendDingTalk } from './dingtalk.mjs';
import { normalizeDefect } from './defect-normalization.mjs';

function nowIso() {
  return new Date().toISOString();
}

function aiConfig(env) {
  return {
    high: env.AI_TRIGGER_HIGH,
    repeat: env.AI_TRIGGER_REPEAT,
    critical: env.AI_TRIGGER_CRITICAL,
    safety: env.AI_TRIGGER_SAFETY
  };
}

async function writeAudit({ entityType, entityId, action, actor, beforeData, afterData }, env) {
  try {
    await insertRow('audit_logs', {
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor,
      before_data: beforeData || null,
      after_data: afterData || null
    }, env);
  } catch (error) {
    console.error('Audit logging failed', error);
  }
}

// Risk frequency is source-specific:
// INCOMING row = one Batch, PRODUCTION row = one Occurrence.
async function relatedRecords(record, env) {
  return listNgRecords({
    materialCode: record.material_code,
    source: record.source,
    limit: 1000
  }, env);
}

function riskEventRow(record, risk, { alertable = false, existingId } = {}) {
  return {
    ...(existingId ? { id: existingId } : {}),
    ng_record_id: record.id,
    material_code: risk.material_code,
    supplier: risk.supplier,
    normalized_defect: risk.normalized_defect,
    risk_level: risk.risk_level,
    risk_source: risk.risk_source,
    risk_trigger: risk.risk_trigger,
    risk_reason: risk.risk_reason,
    repeat_occurrences: risk.repeat_occurrences,
    repeat_qty: risk.repeat_qty,
    window_days: risk.window_days,
    inspection_focus: risk.inspection_focus,
    alertable,
    updated_at: nowIso()
  };
}

async function saveRisk(record, allRecords, { allowAlert = true } = {}, env) {
  const risk = calculateRisk(record, allRecords);
  let alertable = false;

  if (allowAlert) {
    const previousEvents = await listRiskEvents({
      materialCode: risk.material_code,
      normalizedDefect: risk.normalized_defect,
      limit: 500
    }, env);
    alertable = shouldAlertRiskEvent(
      record,
      risk,
      previousEvents.filter((item) => item.ng_record_id !== record.id)
    );
  }

  const existing = await getRiskEventByRecord(record.id, env);
  const riskEvent = await upsertRow(
    'risk_events',
    riskEventRow(record, risk, { alertable, existingId: existing?.id }),
    'ng_record_id',
    env
  );

  return { ...risk, id: riskEvent.id, ng_record_id: record.id, alertable };
}

async function persistRiskSeries(records, env) {
  const series = calculateRiskSeries(records);
  if (series.length === 0) return [];

  const savedRows = await upsertRows(
    'risk_events',
    series.map(({ record, risk }) => riskEventRow(record, risk, { alertable: false })),
    'ng_record_id',
    env
  );
  const savedByRecord = new Map(savedRows.map((row) => [row.ng_record_id, row]));

  return series.map(({ record, risk }) => ({
    ...risk,
    id: savedByRecord.get(record.id)?.id,
    ng_record_id: record.id,
    alertable: false
  }));
}

async function saveAI(record, risk, env) {
  if (!shouldGenerateAI(record, risk, aiConfig(env))) return null;
  const result = await generateQualityRecommendation({
    record,
    risk,
    history: risk.related_history || [],
    env
  });
  return insertRow('ai_recommendations', {
    ...result,
    risk_event_id: risk.id
  }, env);
}

async function alertIfNeeded(record, risk, recommendation, env) {
  if (!risk.alertable) return { status: 'SKIPPED', reason: 'No new HIGH trigger' };
  const fingerprint = makeAlertFingerprint(risk.id, risk.risk_trigger);
  const existing = await getSuccessfulAlert(fingerprint, env);
  if (existing) return { status: 'SKIPPED', reason: 'Duplicate alert prevented' };

  const message = buildSupplierMessage({ record, risk, recommendation });
  let status = 'SUCCESS';
  let errorMessage = null;
  try {
    await sendDingTalk(message, env);
  } catch (error) {
    status = 'FAILED';
    errorMessage = String(error?.message || error).slice(0, 500);
  }
  return insertRow('alert_history', {
    risk_event_id: risk.id,
    ai_recommendation_id: recommendation?.id || null,
    alert_fingerprint: fingerprint,
    status,
    message,
    error_message: errorMessage
  }, env);
}

export async function createNgRecord(data, actor, env = process.env) {
  const record = await insertRow('ng_records', { ...data, created_by: actor }, env);
  await writeAudit({ entityType: 'NG_RECORD', entityId: record.id, action: 'CREATE', actor, afterData: record }, env);

  try {
    const records = await relatedRecords(record, env);
    const risk = await saveRisk(record, records, { allowAlert: true }, env);
    const recommendation = await saveAI(record, risk, env);
    const alert = await alertIfNeeded(record, risk, recommendation, env);
    return { record, risk, recommendation, alert };
  } catch (error) {
    return { record, risk: null, recommendation: null, alert: null, processing_error: String(error?.message || error) };
  }
}

async function recalculateMaterialSeries(materialCode, env) {
  const records = await listNgRecords({ materialCode, limit: 1000 }, env);
  return persistRiskSeries(records, env);
}

export async function recalculateAllRiskEvents(env = process.env) {
  const records = await listNgRecords({ limit: 5000 }, env);
  return persistRiskSeries(records, env);
}

export async function updateNgRecord(id, data, actor, env = process.env) {
  const beforeRows = await selectRows('ng_records', { id: `eq.${id}`, limit: 1 }, env);
  const before = beforeRows[0];
  if (!before) throw new Error('NG record not found');

  const rows = await updateRows('ng_records', { id: `eq.${id}` }, { ...data, updated_at: nowIso() }, env);
  const record = rows[0];
  await writeAudit({ entityType: 'NG_RECORD', entityId: id, action: 'UPDATE', actor, beforeData: before, afterData: record }, env);

  await recalculateMaterialSeries(before.material_code, env);
  if (record.material_code !== before.material_code) await recalculateMaterialSeries(record.material_code, env);

  const records = await relatedRecords(record, env);
  const risk = await saveRisk(record, records, { allowAlert: true }, env);
  const recommendation = await saveAI(record, risk, env);
  const alert = await alertIfNeeded(record, risk, recommendation, env);
  return { record, risk, recommendation, alert };
}

export async function deleteNgRecord(id, actor, env = process.env) {
  const rows = await selectRows('ng_records', { id: `eq.${id}`, limit: 1 }, env);
  const before = rows[0];
  if (!before) throw new Error('NG record not found');

  await deleteRows('ng_records', { id: `eq.${id}` }, env);
  await writeAudit({ entityType: 'NG_RECORD', entityId: id, action: 'DELETE', actor, beforeData: before }, env);
  await recalculateMaterialSeries(before.material_code, env);
  return { deleted: true, id };
}

export async function regenerateRecommendation(riskEventId, env = process.env) {
  const events = await selectRows('risk_events', { id: `eq.${riskEventId}`, limit: 1 }, env);
  const risk = events[0];
  if (!risk) throw new Error('Risk event not found');

  const records = await selectRows('ng_records', { id: `eq.${risk.ng_record_id}`, limit: 1 }, env);
  const record = records[0];
  if (!record) throw new Error('NG record not found');

  const related = await relatedRecords(record, env);
  const calculated = calculateRisk(record, related);
  return saveAI(record, { ...risk, ...calculated, id: risk.id }, env);
}

export async function getAdminRecords(env = process.env) {
  const records = await listNgRecords({ limit: 5000 }, env);
  let risks = await selectRows('risk_events', { order: 'created_at.desc', limit: 5000 }, env);

  // One-time self-heal after deploying V2, and automatic recalculation after a
  // historical import. No alert or AI call is generated by this migration step.
  const riskRowsAreStale =
    risks.length !== records.length ||
    risks.some((risk) => risk.risk_source !== RISK_ENGINE_VERSION);

  if (riskRowsAreStale && records.length > 0) {
    await persistRiskSeries(records, env);
    risks = await selectRows('risk_events', { order: 'created_at.desc', limit: 5000 }, env);
  }

  const aiRows = await selectRows('ai_recommendations', { order: 'created_at.desc', limit: 5000 }, env);
  const riskByRecord = new Map(risks.map((risk) => [risk.ng_record_id, risk]));
  const aiByRisk = new Map();
  for (const row of aiRows) if (!aiByRisk.has(row.risk_event_id)) aiByRisk.set(row.risk_event_id, row);

  return records.map((record) => {
    const risk = riskByRecord.get(record.id) || null;
    const recommendation = risk && shouldGenerateAI(record, risk, aiConfig(env))
      ? aiByRisk.get(risk.id) || null
      : null;
    return { record, risk, recommendation };
  });
}

export async function getPublicRisk(materialCode, env = process.env) {
  const records = await listNgRecords({ materialCode: materialCode.toUpperCase(), limit: 1000 }, env);
  const calculated = calculateRiskSeries(records);
  return calculated
    .map(({ record, risk }) => ({ record, risk }))
    .sort((a, b) =>
      String(b.record.occurrence_date).localeCompare(String(a.record.occurrence_date)) ||
      String(b.record.created_at || '').localeCompare(String(a.record.created_at || '')) ||
      String(b.record.id || '').localeCompare(String(a.record.id || ''))
    );
}

export async function getRecommendation(riskEventId, env = process.env) {
  return getRecommendationForRisk(riskEventId, env);
}

export { normalizeDefect };
