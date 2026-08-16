import { normalizeDefect } from '../defect-normalization.mjs';
import { buildRecommendationInput, QUALITY_RECOMMENDATION_PROMPT_VERSION, QUALITY_RECOMMENDATION_SYSTEM_PROMPT } from './prompt.mjs';
import { getProvider } from './provider.mjs';

const FALLBACKS = {
  PAINT_IN_THREAD: {
    areas: ['Thread protection', 'Masking effectiveness', 'Post-paint thread inspection', 'Final inspection effectiveness'],
    recommendation: 'Please review painting controls related to thread protection, including masking effectiveness and post-paint thread inspection, and take appropriate preventive action to avoid recurrence.'
  },
  EDGE_PAINT_CHIPPING: {
    areas: ['Edge coating coverage', 'Edge protection', 'Post-paint handling/contact condition', 'Final inspection of critical edge areas'],
    recommendation: 'Please review painting controls related to edge coverage and protection, handling/contact conditions after coating, and final inspection of critical edge areas.'
  }
};

export function buildFallbackRecommendation(record) {
  const normalized = normalizeDefect(record.defect_description || record.defect_category);
  const specific = FALLBACKS[normalized];
  const areaNames = specific?.areas || ['Related production process', 'Handling condition', 'Final inspection'];
  const recommendations = specific ? [
    specific.recommendation,
    'Please strengthen inspection of the affected area before delivery.',
    'Please take appropriate preventive action to avoid recurrence.'
  ] : [
    'Please review the related production and quality control process.',
    'Please strengthen inspection of the affected area before delivery.',
    'Please take appropriate preventive action to avoid recurrence.'
  ];

  return {
    controlAreas: areaNames.map((area, index) => ({
      priority: index + 1,
      area,
      reason: 'This area is relevant to the reported defect and should be verified without assuming a confirmed root cause.'
    })),
    supplierRecommendation: recommendations,
    confidence: specific ? 'MEDIUM' : 'LOW'
  };
}

export async function generateQualityRecommendation({ record, risk, history = [], env = process.env, providerOverride }) {
  const providerName = env.AI_PROVIDER || 'compatible';
  const base = {
    ng_record_id: record.id,
    material_code: record.material_code,
    defect_category: record.defect_category,
    prompt_version: QUALITY_RECOMMENDATION_PROMPT_VERSION,
    ai_provider: providerName,
    ai_model: env.AI_MODEL || null
  };

  try {
    const provider = providerOverride || getProvider(env);
    const result = await provider.generate({
      systemPrompt: QUALITY_RECOMMENDATION_SYSTEM_PROMPT,
      input: buildRecommendationInput(record, risk, history)
    });
    return {
      ...base,
      control_areas: result.controlAreas,
      supplier_recommendation: result.supplierRecommendation,
      confidence: result.confidence,
      status: 'SUCCESS',
      error_message: null
    };
  } catch (error) {
    const fallback = buildFallbackRecommendation(record);
    return {
      ...base,
      control_areas: fallback.controlAreas,
      supplier_recommendation: fallback.supplierRecommendation,
      confidence: fallback.confidence,
      status: 'FALLBACK',
      error_message: String(error?.message || error).slice(0, 500)
    };
  }
}
