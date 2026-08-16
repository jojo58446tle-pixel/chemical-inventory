import { describe, expect, it } from 'vitest';
import { buildSupplierMessage } from '../netlify/functions/lib/dingtalk.mjs';

describe('DingTalk supplier message', () => {
  it('keeps frequency and PCS impact as separate real numbers', () => {
    const message = buildSupplierMessage({
      record: { material_code: 'B0KI0271', defect_description: 'Edge Paint Chipping', detail: 'Exposed base metal affects corrosion protection.', functional_impact: false, safety_impact: false },
      risk: { risk_level: 'HIGH', risk_reason: 'The same Material + Defect has been detected in 3 occurrences within the last 30 days. Total NG Quantity: 70 PCS (impact only; Risk is based on frequency, not PCS).' },
      recommendation: { supplier_recommendation: ['Please review edge coating coverage.', 'Please review post-paint handling.', 'Please strengthen final inspection of critical edges.'] }
    });
    expect(message).toContain('3 occurrences');
    expect(message).toContain('70 PCS');
    expect(message).toContain('30 days');
    expect(message).toContain('Risk is based on frequency, not PCS');
    expect(message).not.toContain('8D');
  });
});
