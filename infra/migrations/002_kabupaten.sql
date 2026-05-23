-- 002_kabupaten.sql — 14 kabupaten/kota Kalimantan Barat dgn geometry MultiPolygon
-- Diisi via infra/scripts/seed_kabupaten.mjs

CREATE TABLE IF NOT EXISTS kabupaten (
  id          text PRIMARY KEY,                  -- slug, e.g. 'pontianak', 'kapuas-hulu'
  kode_bps    text UNIQUE NOT NULL,              -- BPS regency code (4-digit)
  nama        text NOT NULL,
  jenis       text NOT NULL CHECK (jenis IN ('kabupaten', 'kota')),
  geom        geometry(MultiPolygon, 4326) NOT NULL,
  centroid    geometry(Point, 4326) GENERATED ALWAYS AS (ST_Centroid(geom)) STORED,
  area_ha     double precision,
  bbox        double precision[] CHECK (array_length(bbox, 1) = 4), -- [minLon, minLat, maxLon, maxLat]
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kabupaten_geom_gix ON kabupaten USING GIST (geom);
CREATE INDEX IF NOT EXISTS kabupaten_centroid_gix ON kabupaten USING GIST (centroid);

ALTER TABLE kabupaten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kabupaten_read_public ON kabupaten;
CREATE POLICY kabupaten_read_public ON kabupaten FOR SELECT USING (true);

COMMENT ON TABLE  kabupaten IS '14 kabupaten/kota Kalimantan Barat';
COMMENT ON COLUMN kabupaten.id IS 'slug lowercase + hyphen, dipakai sebagai route + storage path';
COMMENT ON COLUMN kabupaten.bbox IS 'pre-computed bbox utk openEO spatial_extent (hemat ST_Envelope)';
