import { z } from 'zod';

export const recommendationSchema = z.object({
  controlAreas: z.array(z.object({
    priority: z.number().int().min(1).max(10),
    area: z.string().min(3).max(160),
    reason: z.string().min(8).max(500)
  })).min(1).max(6),
  supplierRecommendation: z.array(z.string().min(10).max(500)).min(1).max(6),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH'])
}).strict();

export function validateRecommendation(value) {
  const result = recommendationSchema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid AI recommendation JSON: ${message}`);
  }
  return {
    ...result.data,
    controlAreas: [...result.data.controlAreas].sort((a, b) => a.priority - b.priority)
  };
}
