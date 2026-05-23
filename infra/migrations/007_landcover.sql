-- 007_landcover.sql — klasifikasi tutupan lahan per kabupaten
-- Sumber: ESA WorldCover 2021 (10m) + Dynamic World near-realtime

CREATE TABLE IF NOT EXISTS landcover (
  id              bigserial PRIMARY KEY,
  kabupaten_id    text NOT NULL REFERENCES kabupaten(id) ON DELETE CASCADE,
  observation_date date NOT NULL,
  source          text NOT NULL CHECK (source IN ('esa_worldcover', 'dynamic_world')),
  class_code      int  NOT NULL,
  class_name      text NOT NULL,                -- e.g. 'cropland', 'tree_cover', 'water'
  area_ha         double precision NOT NULL CHECK (area_ha >= 0),
  area_pct        real NOT NULL CHECK (area_pct >= 0 AND area_pct <= 100),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kabupaten_id, observation_date, source, class_code)
);

CREATE INDEX IF NOT EXISTS landcover_kab_date_idx
  ON landcover (kabupaten_id, observation_date DESC);

ALTER TABLE landcover ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS landcover_read_public ON landcover;
CREATE POLICY landcover_read_public ON landcover FOR SELECT USING (true);

-- Map class_code → human label, scoped per source
CREATE TABLE IF NOT EXISTS landcover_classes (
  source      text NOT NULL CHECK (source IN ('esa_worldcover', 'dynamic_world')),
  class_code  int  NOT NULL,
  class_name  text NOT NULL,
  hex_color   text,                            -- e.g. '#1f7837'
  PRIMARY KEY (source, class_code)
);

INSERT INTO landcover_classes (source, class_code, class_name, hex_color) VALUES
  ('esa_worldcover', 10, 'tree_cover',       '#006400'),
  ('esa_worldcover', 20, 'shrubland',        '#ffbb22'),
  ('esa_worldcover', 30, 'grassland',        '#ffff4c'),
  ('esa_worldcover', 40, 'cropland',         '#f096ff'),
  ('esa_worldcover', 50, 'built_up',         '#fa0000'),
  ('esa_worldcover', 60, 'bare_sparse_veg',  '#b4b4b4'),
  ('esa_worldcover', 70, 'snow_ice',         '#f0f0f0'),
  ('esa_worldcover', 80, 'permanent_water',  '#0064c8'),
  ('esa_worldcover', 90, 'herbaceous_wet',   '#0096a0'),
  ('esa_worldcover', 95, 'mangroves',        '#00cf75'),
  ('esa_worldcover', 100, 'moss_lichen',     '#fae6a0'),
  ('dynamic_world', 0, 'water',              '#419bdf'),
  ('dynamic_world', 1, 'trees',              '#397d49'),
  ('dynamic_world', 2, 'grass',              '#88b053'),
  ('dynamic_world', 3, 'flooded_vegetation', '#7a87c6'),
  ('dynamic_world', 4, 'crops',              '#e49635'),
  ('dynamic_world', 5, 'shrub_and_scrub',    '#dfc35a'),
  ('dynamic_world', 6, 'built',              '#c4281b'),
  ('dynamic_world', 7, 'bare',               '#a59b8f'),
  ('dynamic_world', 8, 'snow_and_ice',       '#b39fe1')
ON CONFLICT (source, class_code) DO NOTHING;

ALTER TABLE landcover_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS landcover_classes_read_public ON landcover_classes;
CREATE POLICY landcover_classes_read_public ON landcover_classes FOR SELECT USING (true);
