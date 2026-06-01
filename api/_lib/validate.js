import { z } from 'zod';

export const kabupatenIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/i, 'invalid kabupaten id');

// Backend supports both raw (all-land) and cropland variants for debug/analytics.
// Frontend default always requests raw base names; API layer auto-appends _crop suffix.
export const indexNameSchema = z.enum([
  'ndvi', 'ndwi', 'mndwi', 'ndmi', 'msi', 'evi',
  'ndvi_crop', 'ndwi_crop', 'mndwi_crop', 'ndmi_crop', 'msi_crop', 'evi_crop',
]);

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid date YYYY-MM-DD');

export const alertTypeSchema = z.enum([
  'stress',
  'flood',
  'drought',
  'disease_blast',
  'disease_hdb',
  'disease_wereng'
]);

export const alertSeveritySchema = z.enum(['low', 'med', 'high']);

export function parseQuery(schema, query) {
  const result = schema.safeParse(query);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`validation: ${issues}`);
  }
  return result.data;
}
