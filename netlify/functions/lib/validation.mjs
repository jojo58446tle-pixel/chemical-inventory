import { z } from 'zod';

const optionalText = z.string().trim().max(200).optional().nullable().transform((value) => value || null);

export const ngRecordSchema = z.object({
  source: z.enum(['INCOMING', 'PRODUCTION']),
  material_code: z.string().trim().min(2).max(80).transform((value) => value.toUpperCase()),
  supplier: z.string().trim().min(2).max(180),
  lot_id: optionalText,
  po_number: optionalText,
  defect_category: z.string().trim().min(2).max(120),
  defect_description: z.string().trim().min(2).max(240),
  detail: z.string().trim().max(3000).default(''),
  defect_level: z.enum(['MINOR', 'MAJOR', 'CRITICAL']),
  ng_quantity: z.coerce.number().int().positive().max(1000000),
  inspected_quantity: z.union([z.coerce.number().int().positive().max(100000000), z.null()]).optional().transform((value) => value || null),
  functional_impact: z.boolean().default(false),
  safety_impact: z.boolean().default(false),
  occurrence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  image_urls: z.array(z.string().max(1200)).max(5).default([])
}).strict();

export const loginSchema = z.object({
  password: z.string().min(1).max(240)
}).strict();

export function parseNgRecord(input) {
  return ngRecordSchema.parse(input);
}
