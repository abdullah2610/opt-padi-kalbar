-- 004_vegetation_indices.sql — flat time-series statistik indeks per kabupaten
-- Memudahkan query time-series tanpa parsing jsonb di sentinel_composites

CREATE TABLE IF NOT EXISTS vegetation_indices (
  id                   bigserial PRIMARY KEY,
  composite_id         uuid REFERENCES sentinel_composites(id) ON DELETE CASCADE,
  kabupaten_id         text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  observation_date     date NOT NULL,        -- midpoint of composite window
  index_name           text NOT NULL CHECK (index_name IN ('ndvi','ndwi','mndwi','ndmi','msi','evi')),
  mean                 real,
  p10                  real,
  p50                  real,
  p90                  real,
  std                  real,
  anomaly_z            real,                 -- z-score vs baseline 2019-2023 per DOY
  area_clear_pct       real CHECK (area_clear_pct >= 0 AND area_clear_pct <= 100),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kabupaten_id, observation_date, index_name)
);

CREATE INDEX IF NOT EXISTS vegetation_indices_kab_date_idx
  ON vegetation_indices (kabupaten_id, index_name, observation_date DESC);

CREATE INDEX IF NOT EXISTS vegetation_indices_anomaly_idx
  ON vegetation_indices (kabupaten_id, observation_date DESC)
  WHERE anomaly_z IS NOT NULL AND anomaly_z < -1.5;

ALTER TABLE vegetation_indices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vegetation_indices_read_public ON vegetation_indices;
CREATE POLICY vegetation_indices_read_public ON vegetation_indices FOR SELECT USING (true);

-- Baseline statistics per DOY (computed once from 2019-2023 historical data)
CREATE TABLE IF NOT EXISTS index_baselines (
  kabupaten_id  text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  index_name    text NOT NULL CHECK (index_name IN ('ndvi','ndwi','mndwi','ndmi','msi','evi')),
  doy           int  NOT NULL CHECK (doy BETWEEN 1 AND 366),
  mean          real NOT NULL,
  std           real NOT NULL,
  sample_count  int  NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kabupaten_id, index_name, doy)
);

ALTER TABLE index_baselines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS index_baselines_read_public ON index_baselines;
CREATE POLICY index_baselines_read_public ON index_baselines FOR SELECT USING (true);
