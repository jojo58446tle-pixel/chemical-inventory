import { describe, expect, it } from 'vitest';
import {
  calculateRisk,
  calculateRiskSeries,
  RISK_ENGINE_VERSION,
  shouldAlertRiskEvent,
  shouldGenerateAI
} from '../netlify/functions/lib/risk-engine.mjs';
import { normalizeDefect } from '../netlify/functions/lib/defect-normalization.mjs';

const base = {
  id: 'current', source: 'PRODUCTION', material_code: 'B0KI0271', supplier: 'JINDA PRECISION (THAILAND)',
  lot_id: null, defect_category: 'Surface / Paint', defect_description: 'Edge Paint Chipping',
  detail: 'Paint chipping was found along the edge with exposed base metal.', defect_level: 'MAJOR',
  ng_quantity: 1, functional_impact: false, safety_impact: false, occurrence_date: '2026-08-15'
};

function history(id, date, qty = 1, overrides = {}) {
  return { ...base, id, occurrence_date: date, ng_quantity: qty, ...overrides };
}

describe('rule-based risk engine V2: frequency, not PCS', () => {
  it('uses the V2 engine marker', () => {
    expect(calculateRisk(base, []).risk_source).toBe(RISK_ENGINE_VERSION);
  });

  it('applies the critical override immediately', () => {
    const result = calculateRisk({ ...base, defect_level: 'CRITICAL' }, []);
    expect(result.risk_level).toBe('HIGH');
    expect(result.risk_trigger).toBe('CRITICAL_DEFECT');
    expect(result.risk_reason).toContain('NG Quantity: 1 PCS');
  });

  it('applies the safety override immediately', () => {
    const result = calculateRisk({ ...base, safety_impact: true }, []);
    expect(result.risk_level).toBe('HIGH');
    expect(result.risk_trigger).toBe('SAFETY_IMPACT');
    expect(result.risk_reason).toContain('Safety-related');
  });

  it('keeps one production occurrence LOW even when NG quantity is 70 PCS', () => {
    const result = calculateRisk({ ...base, ng_quantity: 70 }, []);
    expect(result.risk_level).toBe('LOW');
    expect(result.risk_trigger).toBe('PRODUCTION_OBSERVE');
    expect(result.repeat_occurrences).toBe(1);
    expect(result.repeat_qty).toBe(70);
    expect(result.risk_reason).toContain('not used to increase Risk');
  });

  it('sets two production occurrences to MEDIUM regardless of PCS', () => {
    const result = calculateRisk({ ...base, ng_quantity: 70 }, [history('a', '2026-08-10', 50)]);
    expect(result.risk_level).toBe('MEDIUM');
    expect(result.risk_trigger).toBe('PRODUCTION_REPEAT');
    expect(result.repeat_occurrences).toBe(2);
    expect(result.repeat_qty).toBe(120);
  });

  it('sets three production occurrences to HIGH', () => {
    const result = calculateRisk(base, [history('a', '2026-08-05', 1), history('b', '2026-08-10', 1)]);
    expect(result.risk_level).toBe('HIGH');
    expect(result.risk_trigger).toBe('PRODUCTION_REPEAT');
    expect(result.repeat_occurrences).toBe(3);
    expect(result.repeat_qty).toBe(3);
    expect(result.risk_reason).toContain('3 occurrences');
    expect(result.risk_reason).toContain('Risk is based on frequency, not PCS');
  });

  it('keeps a single Incoming Major at MEDIUM even with high PCS', () => {
    const incoming = { ...base, source: 'INCOMING', defect_level: 'MAJOR', ng_quantity: 70 };
    const result = calculateRisk(incoming, []);
    expect(result.risk_level).toBe('MEDIUM');
    expect(result.risk_trigger).toBe('MAJOR_DEFECT');
    expect(result.repeat_occurrences).toBe(1);
  });

  it('keeps a single Incoming Minor at LOW', () => {
    const result = calculateRisk({ ...base, source: 'INCOMING', defect_level: 'MINOR', ng_quantity: 70 }, []);
    expect(result.risk_level).toBe('LOW');
    expect(result.risk_trigger).toBe('INCOMING_OBSERVE');
  });

  it('counts one Incoming row as one Batch: 2 batches MEDIUM, 3 batches HIGH', () => {
    const incoming = { ...base, source: 'INCOMING', defect_level: 'MINOR', ng_quantity: 99 };
    const first = history('a', '2026-08-01', 20, { source: 'INCOMING', defect_level: 'MINOR' });
    const second = history('b', '2026-08-10', 30, { source: 'INCOMING', defect_level: 'MINOR' });

    const two = calculateRisk(incoming, [first]);
    expect(two.risk_level).toBe('MEDIUM');
    expect(two.risk_trigger).toBe('INCOMING_REPEAT');
    expect(two.repeat_occurrences).toBe(2);

    const three = calculateRisk(incoming, [first, second]);
    expect(three.risk_level).toBe('HIGH');
    expect(three.risk_trigger).toBe('INCOMING_REPEAT');
    expect(three.repeat_occurrences).toBe(3);
  });

  it('does not mix Incoming batches with Production occurrences', () => {
    const incomingSameDefect = history('incoming', '2026-08-10', 100, { source: 'INCOMING' });
    const result = calculateRisk(base, [incomingSameDefect]);
    expect(result.repeat_occurrences).toBe(1);
    expect(result.risk_level).toBe('LOW');
  });

  it('matches only the same Material + normalized Defect', () => {
    const differentMaterial = history('m', '2026-08-10', 1, { material_code: 'OTHER' });
    const differentDefect = history('d', '2026-08-10', 1, { defect_description: 'Scratch' });
    const same = history('s', '2026-08-10', 1, { defect_description: 'Paint chip edge' });
    const result = calculateRisk(base, [differentMaterial, differentDefect, same]);
    expect(result.repeat_occurrences).toBe(2);
    expect(result.risk_level).toBe('MEDIUM');
  });

  it('excludes history older than 30 days', () => {
    const result = calculateRisk({ ...base, ng_quantity: 70 }, [history('old', '2026-07-01', 100)]);
    expect(result.risk_level).toBe('LOW');
    expect(result.repeat_occurrences).toBe(1);
  });

  it('does not require a Lot ID', () => {
    const result = calculateRisk({ ...base, lot_id: null, defect_level: 'CRITICAL' }, []);
    expect(result.risk_level).toBe('HIGH');
  });

  it('recalculates to LOW when related production history is removed', () => {
    const beforeDelete = calculateRisk(base, [history('a', '2026-08-10', 1), history('b', '2026-08-12', 1)]);
    const afterDelete = calculateRisk(base, []);
    expect(beforeDelete.risk_level).toBe('HIGH');
    expect(afterDelete.risk_level).toBe('LOW');
  });

  it('calculates chronological series without future rows raising earlier risk', () => {
    const rows = [
      history('1', '2026-08-01', 70, { created_at: '2026-08-01T01:00:00Z' }),
      history('2', '2026-08-02', 70, { created_at: '2026-08-02T01:00:00Z' }),
      history('3', '2026-08-03', 70, { created_at: '2026-08-03T01:00:00Z' })
    ];
    const series = calculateRiskSeries(rows);
    expect(series.map((item) => item.risk.risk_level)).toEqual(['LOW', 'MEDIUM', 'HIGH']);
  });
});

describe('normalization, AI trigger and alert deduplication', () => {
  it('normalizes paint-in-thread descriptions consistently', () => {
    expect(normalizeDefect('Paint inside thread')).toBe('PAINT_IN_THREAD');
    expect(normalizeDefect('Thread paint prevents assembly')).toBe('PAINT_IN_THREAD');
  });

  it('triggers AI for a Production repeat event at MEDIUM', () => {
    const risk = calculateRisk(base, [history('a', '2026-08-10', 50)]);
    expect(risk.risk_level).toBe('MEDIUM');
    expect(risk.risk_trigger).toBe('PRODUCTION_REPEAT');
    expect(shouldGenerateAI(base, risk)).toBe(true);
  });

  it('does not trigger AI for an Incoming MEDIUM repeat unless another AI trigger applies', () => {
    const incoming = { ...base, source: 'INCOMING', defect_level: 'MINOR' };
    const risk = calculateRisk(incoming, [history('a', '2026-08-10', 1, { source: 'INCOMING', defect_level: 'MINOR' })]);
    expect(risk.risk_level).toBe('MEDIUM');
    expect(risk.risk_trigger).toBe('INCOMING_REPEAT');
    expect(shouldGenerateAI(incoming, risk)).toBe(false);
  });

  it('prevents repeat HIGH spam for the same source-specific repeat trigger', () => {
    const risk = calculateRisk(base, [history('a', '2026-08-10', 1), history('b', '2026-08-12', 1)]);
    expect(shouldAlertRiskEvent(base, risk, [{ ...risk, risk_level: 'HIGH' }])).toBe(false);
  });

  it('does not let an Incoming HIGH repeat suppress a Production HIGH repeat alert', () => {
    const risk = calculateRisk(base, [history('a', '2026-08-10', 1), history('b', '2026-08-12', 1)]);
    expect(shouldAlertRiskEvent(base, risk, [{ ...risk, risk_trigger: 'INCOMING_REPEAT', risk_level: 'HIGH' }])).toBe(true);
  });

  it('allows every new critical event to alert', () => {
    const critical = { ...base, defect_level: 'CRITICAL' };
    const risk = calculateRisk(critical, []);
    expect(shouldAlertRiskEvent(critical, risk, [{ ...risk, ng_record_id: 'older' }])).toBe(true);
  });
});
