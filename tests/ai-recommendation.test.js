import { describe, expect, it } from 'vitest';
import { buildFallbackRecommendation, generateQualityRecommendation } from '../netlify/functions/lib/ai/recommendation.mjs';
import { validateRecommendation } from '../netlify/functions/lib/ai/schema.mjs';

const record = {
  id: 'r1', source: 'PRODUCTION', material_code: 'B0KI0271', supplier: 'JINDA',
  defect_category: 'Surface / Paint', defect_description: 'Edge Paint Chipping',
  detail: 'Paint chipping was found along the edge with exposed base metal.', defect_level: 'CRITICAL',
  ng_quantity: 1, functional_impact: false, safety_impact: false
};
const risk = { id: 'risk1', risk_level: 'HIGH', risk_trigger: 'CRITICAL_DEFECT', repeat_qty: 1, repeat_occurrences: 1, window_days: 30 };

describe('AI structured output and fallback', () => {
  it('accepts valid structured JSON and sorts priorities', () => {
    const result = validateRecommendation({
      controlAreas: [
        { priority: 2, area: 'Final inspection', reason: 'The defect escaped to production and should be reviewed.' },
        { priority: 1, area: 'Edge protection', reason: 'Exposed base metal was observed at the edge.' }
      ],
      supplierRecommendation: ['Please review edge protection and final inspection controls.'],
      confidence: 'MEDIUM'
    });
    expect(result.controlAreas[0].priority).toBe(1);
  });

  it('rejects invalid free text output', () => {
    expect(() => validateRecommendation('Root cause is poor paint thickness.')).toThrow('Invalid AI recommendation JSON');
  });

  it('saves a successful provider result without changing risk', async () => {
    const providerOverride = { name: 'test', generate: async () => ({
      controlAreas: [{ priority: 1, area: 'Edge coating coverage', reason: 'The reported edge condition makes this control relevant for review.' }],
      supplierRecommendation: ['Please review edge coating coverage and protection controls.'],
      confidence: 'MEDIUM'
    }) };
    const result = await generateQualityRecommendation({ record, risk, providerOverride, env: { AI_PROVIDER: 'test', AI_MODEL: 'model' } });
    expect(result.status).toBe('SUCCESS');
    expect(risk.risk_level).toBe('HIGH');
  });

  it('uses safe fallback when no AI API key is configured', async () => {
    const result = await generateQualityRecommendation({ record, risk, env: { AI_PROVIDER: 'compatible', AI_MODEL: 'model' } });
    expect(result.status).toBe('FALLBACK');
    expect(result.control_areas.map((area) => area.area)).toContain('Edge protection');
    expect(result.error_message).toContain('AI_API_KEY');
  });

  it('uses conservative LOW-confidence controls for an unknown defect', () => {
    const fallback = buildFallbackRecommendation({ ...record, defect_description: 'Other', defect_category: 'Other' });
    expect(fallback.confidence).toBe('LOW');
    expect(fallback.controlAreas.map((area) => area.area)).toEqual(['Related production process', 'Handling condition', 'Final inspection']);
  });

  it('never states a confirmed root cause in paint-thread fallback', () => {
    const fallback = buildFallbackRecommendation({ ...record, defect_description: 'Paint in Thread' });
    const text = fallback.supplierRecommendation.join(' ');
    expect(text).toContain('Please review');
    expect(text.toLowerCase()).not.toContain('root cause is');
  });
});
