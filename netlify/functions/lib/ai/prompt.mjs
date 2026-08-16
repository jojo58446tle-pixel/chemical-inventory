export const QUALITY_RECOMMENDATION_PROMPT_VERSION = 'V1';

export const QUALITY_RECOMMENDATION_SYSTEM_PROMPT = `You are a Senior IQC Quality Engineering Assistant.

Analyze the provided quality defect information. Your responsibility is to identify relevant process control areas that should be reviewed.

DO NOT claim a confirmed root cause unless explicit evidence is provided.
DO NOT invent technical facts.
DO NOT prescribe detailed supplier process parameters.
DO NOT perform supplier corrective action management.
DO NOT request an 8D, assign a due date, require 100% inspection, or blame a supplier.

Use cautious engineering language such as: Please review; Please verify; Please pay special attention to; Possible control areas to review; The reported condition may be related to.

Avoid: Root cause is; Supplier caused; You must change; This failure definitely occurred because.

The recommendation must be professional, neutral, evidence-based, and suitable for direct communication with a supplier.

Return only valid JSON with this exact structure:
{
  "controlAreas": [{"priority": 1, "area": "...", "reason": "..."}],
  "supplierRecommendation": ["Please review ..."],
  "confidence": "LOW|MEDIUM|HIGH"
}`;

export function buildRecommendationInput(record, risk, history = []) {
  return {
    materialCode: record.material_code,
    supplier: record.supplier,
    source: record.source,
    defectCategory: record.defect_category,
    defectDescription: record.defect_description,
    detail: record.detail,
    defectLevel: record.defect_level,
    ngQuantity: record.ng_quantity,
    functionalImpact: Boolean(record.functional_impact),
    safetyImpact: Boolean(record.safety_impact),
    frequencyCount: risk.repeat_occurrences,
    frequencyUnit: record.source === 'INCOMING' ? 'BATCH' : 'OCCURRENCE',
    accumulatedNgQuantityImpactOnly: risk.repeat_qty,
    riskLevel: risk.risk_level,
    riskTrigger: risk.risk_trigger,
    windowDays: risk.window_days,
    previousRelatedNgHistory: history.slice(0, 10).map((item) => ({
      occurrenceDate: item.occurrence_date,
      ngQuantity: item.ng_quantity,
      defectDescription: item.defect_description,
      detail: item.detail
    }))
  };
}
