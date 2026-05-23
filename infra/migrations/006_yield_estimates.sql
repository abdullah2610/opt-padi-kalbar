-- 006_yield_estimates.sql — estimasi hasil panen per kabupaten per musim tanam

CREATE TABLE IF NOT EXISTS yield_estimates (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kabupaten_id        text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  season              text NOT NULL,           -- e.g. '2026-MT1' (musim tanam 1), '2026-MT2'
  ton_estimated       real NOT NULL CHECK (ton_estimated >= 0),
  ton_per_ha          real CHECK (ton_per_ha >= 0),
  area_sawah_ha       real CHECK (area_sawah_ha >= 0),
  model_version       text NOT NULL,           -- e.g. 'linreg-v0', 'xgboost-v1'
  confidence          real CHECK (confidence >= 0 AND confidence <= 1),
  features_used       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- snapshot input features
  computed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kabupaten_id, season, model_version)
);

CREATE INDEX IF NOT EXISTS yield_estimates_kab_season_idx
  ON yield_estimates (kabupaten_id, season, model_version);

ALTER TABLE yield_estimates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS yield_estimates_read_public ON yield_estimates;
CREATE POLICY yield_estimates_read_public ON yield_estimates FOR SELECT USING (true);

-- BPS reference (ground truth label utk train + validation)
CREATE TABLE IF NOT EXISTS bps_yield_reference (
  kabupaten_id        text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  year                int  NOT NULL CHECK (year BETWEEN 2010 AND 2100),
  ton_produksi        real,
  hektar_panen        real,
  ton_per_ha          real GENERATED ALWAYS AS (
    CASE WHEN hektar_panen > 0 THEN ton_produksi / hektar_panen ELSE NULL END
  ) STORED,
  source              text NOT NULL DEFAULT 'BPS Kalbar',
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kabupaten_id, year)
);

ALTER TABLE bps_yield_reference ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bps_yield_reference_read_public ON bps_yield_reference;
CREATE POLICY bps_yield_reference_read_public ON bps_yield_reference FOR SELECT USING (true);
