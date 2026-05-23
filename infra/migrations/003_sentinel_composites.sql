-- 003_sentinel_composites.sql — metadata per composite window per kabupaten
-- Satu row = satu kabupaten × satu rentang 10-hari composite

CREATE TABLE IF NOT EXISTS sentinel_composites (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kabupaten_id    text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  period_start    date NOT NULL,
  period_end      date NOT NULL CHECK (period_end >= period_start),
  cog_paths       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { ndvi:"composites/.../ndvi.tif", ndwi:..., ... }
  scl_clear_pct   real CHECK (scl_clear_pct >= 0 AND scl_clear_pct <= 100),
  indices_stats   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { ndvi:{mean,p10,p50,p90,std}, ... }
  scene_count     int CHECK (scene_count >= 0),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kabupaten_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS sentinel_composites_kab_date_idx
  ON sentinel_composites (kabupaten_id, period_end DESC);

CREATE INDEX IF NOT EXISTS sentinel_composites_status_idx
  ON sentinel_composites (status) WHERE status IN ('pending', 'running', 'failed');

ALTER TABLE sentinel_composites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sentinel_composites_read_public ON sentinel_composites;
CREATE POLICY sentinel_composites_read_public
  ON sentinel_composites FOR SELECT
  USING (status = 'completed');

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sentinel_composites_touch ON sentinel_composites;
CREATE TRIGGER sentinel_composites_touch
  BEFORE UPDATE ON sentinel_composites
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
