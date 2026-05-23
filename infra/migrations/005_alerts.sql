-- 005_alerts.sql — alert stres/banjir/kekeringan/penyakit per kabupaten

CREATE TYPE alert_type AS ENUM (
  'stress',
  'flood',
  'drought',
  'disease_blast',
  'disease_hdb',
  'disease_wereng',
  'disease_bercak_coklat'
);

CREATE TYPE alert_severity AS ENUM ('low', 'med', 'high');

CREATE TABLE IF NOT EXISTS alerts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kabupaten_id    text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  type            alert_type NOT NULL,
  severity        alert_severity NOT NULL,
  started_at      timestamptz NOT NULL,
  resolved_at     timestamptz,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- threshold values, contributing signals, NDVI/MNDWI snapshots
  created_by      uuid,                                 -- prep for Phase-2 auth
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (resolved_at IS NULL OR resolved_at >= started_at)
);

CREATE INDEX IF NOT EXISTS alerts_kab_active_idx
  ON alerts (kabupaten_id, type, started_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS alerts_severity_idx
  ON alerts (severity, started_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alerts_read_public ON alerts;
CREATE POLICY alerts_read_public ON alerts FOR SELECT USING (true);
