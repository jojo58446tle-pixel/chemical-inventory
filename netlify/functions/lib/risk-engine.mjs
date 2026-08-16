import { createHash } from 'node:crypto';
import { inspectionFocusFor, normalizeDefect } from './defect-normalization.mjs';

export const RISK_WINDOW_DAYS = 30;
export const RISK_ENGINE_VERSION = 'RULE_ENGINE_V2';

function dayNumber(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.getTime() / 86400000;
}

function sameRecordGroup(a, b) {
  return (
    a.source === b.source &&
    String(a.material_code).trim().toUpperCase() === String(b.material_code).trim().toUpperCase() &&
    normalizeDefect(a.defect_description || a.defect_category) === normalizeDefect(b.defect_description || b.defect_category)
  );
}

function isNotAfterCurrent(item, record) {
  const itemDate = String(item.occurrence_date || '').slice(0, 10);
  const recordDate = String(record.occurrence_date || '').slice(0, 10);
  if (itemDate < recordDate) return true;
  if (itemDate > recordDate) return false;

  // When both rows are on the same day, use created_at when available so
  // historical recalculation does not let a later row raise an earlier row's risk.
  if (item.created_at && record.created_at) {
    if (String(item.created_at) < String(record.created_at)) return true;
    if (String(item.created_at) > String(record.created_at)) return false;
    return String(item.id || '') < String(record.id || '');
  }

  // Unit tests / imported objects may not have created_at. In that case the caller
  // is expected to pass only prior history; keep the row eligible.
  return true;
}

export function relatedRiskHistory(record, allRecords, windowDays = RISK_WINDOW_DAYS) {
  const recordDay = dayNumber(record.occurrence_date);
  if (recordDay === null) return [];

  return allRecords
    .filter((item) => item.id !== record.id)
    .filter((item) => sameRecordGroup(item, record))
    .filter((item) => isNotAfterCurrent(item, record))
    .filter((item) => {
      const itemDay = dayNumber(item.occurrence_date);
      const difference = recordDay - itemDay;
      return itemDay !== null && difference >= 0 && difference <= windowDays;
    })
    .sort((a, b) =>
      String(b.occurrence_date).localeCompare(String(a.occurrence_date)) ||
      String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      String(b.id || '').localeCompare(String(a.id || ''))
    );
}

function frequencyTerms(record, count) {
  const incoming = record.source === 'INCOMING';
  const unit = incoming ? (count === 1 ? 'batch' : 'batches') : (count === 1 ? 'occurrence' : 'occurrences');
  const label = incoming ? 'incoming batch' : 'production occurrence';
  return { incoming, unit, label };
}

export function calculateRisk(record, allRecords = [], windowDays = RISK_WINDOW_DAYS) {
  const normalizedDefect = normalizeDefect(record.defect_description || record.defect_category);
  const prior = relatedRiskHistory(record, allRecords, windowDays);
  const frequencyCount = prior.length + 1;
  const totalNgQty = prior.reduce((sum, item) => sum + Number(item.ng_quantity || 0), Number(record.ng_quantity || 0));
  const inspectionFocus = inspectionFocusFor(normalizedDefect);
  const { incoming, unit, label } = frequencyTerms(record, frequencyCount);

  let riskLevel = 'LOW';
  let riskTrigger = incoming ? 'INCOMING_OBSERVE' : 'PRODUCTION_OBSERVE';
  let riskReason = `1 ${label} recorded for the same Material + Defect within ${windowDays} days. NG Quantity: ${Number(record.ng_quantity || 0)} PCS (impact only; not used to increase Risk).`;

  // Highest-priority overrides.
  if (record.safety_impact === true) {
    riskLevel = 'HIGH';
    riskTrigger = 'SAFETY_IMPACT';
    riskReason = `Safety-related quality issue detected. Frequency: ${frequencyCount} ${unit} within ${windowDays} days. NG Quantity: ${totalNgQty} PCS (impact only).`;
  } else if (record.defect_level === 'CRITICAL') {
    riskLevel = 'HIGH';
    riskTrigger = 'CRITICAL_DEFECT';
    riskReason = `Critical defect detected during ${incoming ? 'incoming inspection' : 'production'}. Frequency: ${frequencyCount} ${unit} within ${windowDays} days. NG Quantity: ${totalNgQty} PCS (impact only).`;
  } else if (frequencyCount >= 3) {
    riskLevel = 'HIGH';
    riskTrigger = incoming ? 'INCOMING_REPEAT' : 'PRODUCTION_REPEAT';
    riskReason = `The same Material + Defect has been detected in ${frequencyCount} ${unit} within the last ${windowDays} days. Total NG Quantity: ${totalNgQty} PCS (impact only; Risk is based on frequency, not PCS).`;
  } else if (frequencyCount === 2) {
    riskLevel = 'MEDIUM';
    riskTrigger = incoming ? 'INCOMING_REPEAT' : 'PRODUCTION_REPEAT';
    riskReason = `The same Material + Defect has been detected in 2 ${unit} within the last ${windowDays} days. Total NG Quantity: ${totalNgQty} PCS (impact only; Risk is based on frequency, not PCS).`;
  } else if (incoming && record.defect_level === 'MAJOR') {
    riskLevel = 'MEDIUM';
    riskTrigger = 'MAJOR_DEFECT';
    riskReason = `Major defect detected during incoming inspection. Frequency: 1 batch within ${windowDays} days. NG Quantity: ${Number(record.ng_quantity || 0)} PCS (impact only; not used to increase Risk).`;
  }

  return {
    material_code: record.material_code,
    supplier: record.supplier,
    normalized_defect: normalizedDefect,
    risk_level: riskLevel,
    risk_source: RISK_ENGINE_VERSION,
    risk_trigger: riskTrigger,
    risk_reason: riskReason,
    // Kept for database/API compatibility. For INCOMING this means Batch count;
    // for PRODUCTION it means Occurrence count.
    repeat_occurrences: frequencyCount,
    repeat_qty: totalNgQty,
    window_days: windowDays,
    inspection_focus: inspectionFocus,
    related_history: prior
  };
}

export function calculateRiskSeries(records = [], windowDays = RISK_WINDOW_DAYS) {
  const chronological = [...records].sort((a, b) =>
    String(a.occurrence_date).localeCompare(String(b.occurrence_date)) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''))
  );

  return chronological.map((record, index) => ({
    record,
    risk: calculateRisk(record, chronological.slice(0, index), windowDays)
  }));
}

export function isRepeatTrigger(risk) {
  return ['INCOMING_REPEAT', 'PRODUCTION_REPEAT'].includes(risk?.risk_trigger);
}

export function shouldGenerateAI(record, risk, config = {}) {
  const enabled = (value, fallback = true) => value === undefined ? fallback : String(value).toLowerCase() !== 'false';
  return (
    (risk.risk_level === 'HIGH' && enabled(config.high)) ||
    (record.source === 'PRODUCTION' && risk.risk_trigger === 'PRODUCTION_REPEAT' && enabled(config.repeat)) ||
    (record.defect_level === 'CRITICAL' && enabled(config.critical)) ||
    (record.safety_impact === true && enabled(config.safety))
  );
}

export function shouldAlertRiskEvent(record, risk, previousRiskEvents = []) {
  if (risk.risk_level !== 'HIGH') return false;
  if (['CRITICAL_DEFECT', 'SAFETY_IMPACT'].includes(risk.risk_trigger)) return true;

  const priorSameHigh = previousRiskEvents.some((event) =>
    event.risk_level === 'HIGH' &&
    event.material_code === risk.material_code &&
    event.normalized_defect === risk.normalized_defect &&
    event.risk_trigger === risk.risk_trigger
  );
  return !priorSameHigh;
}

export function makeAlertFingerprint(riskEventId, trigger) {
  return createHash('sha256').update(`${riskEventId}|${trigger}`).digest('hex');
}
