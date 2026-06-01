-- Migration 011: Extend schema for cropland mask (_crop) index variants
-- Additive only — no data loss, no backfill required.
-- After this migration: ETL can insert ndvi_crop, ndwi_crop, etc. alongside existing ndvi, ndwi, etc.

-- 1. Extend vegetation_indices.index_name CHECK constraint (6 → 12 names)
ALTER TABLE vegetation_indices DROP CONSTRAINT IF EXISTS vegetation_indices_index_name_check;
ALTER TABLE vegetation_indices ADD CONSTRAINT vegetation_indices_index_name_check
  CHECK (index_name IN (
    'ndvi', 'ndwi', 'mndwi', 'ndmi', 'msi', 'evi',
    'ndvi_crop', 'ndwi_crop', 'mndwi_crop', 'ndmi_crop', 'msi_crop', 'evi_crop'
  ));

-- 2. Extend index_baselines.index_name CHECK constraint (6 → 12 names)
ALTER TABLE index_baselines DROP CONSTRAINT IF EXISTS index_baselines_index_name_check;
ALTER TABLE index_baselines ADD CONSTRAINT index_baselines_index_name_check
  CHECK (index_name IN (
    'ndvi', 'ndwi', 'mndwi', 'ndmi', 'msi', 'evi',
    'ndvi_crop', 'ndwi_crop', 'mndwi_crop', 'ndmi_crop', 'msi_crop', 'evi_crop'
  ));

-- 3. Add cropland metadata columns to sentinel_composites
ALTER TABLE sentinel_composites
  ADD COLUMN IF NOT EXISTS cropland_mask_path text,
  ADD COLUMN IF NOT EXISTS cropland_pixel_count integer,
  ADD COLUMN IF NOT EXISTS cropland_area_ha real;

-- 4. Index for fast _crop queries
CREATE INDEX IF NOT EXISTS idx_vegetation_indices_crop
  ON vegetation_indices (kabupaten_id, index_name, observation_date)
  WHERE index_name LIKE '%_crop';
