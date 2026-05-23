-- 008_seed_rpc.sql — RPC helper dipakai seed_kabupaten.mjs utk upsert MultiPolygon dari WKT

CREATE OR REPLACE FUNCTION upsert_kabupaten(
  p_id        text,
  p_kode_bps  text,
  p_nama      text,
  p_jenis     text,
  p_geom_wkt  text,
  p_bbox      double precision[],
  p_area_ha   double precision
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO kabupaten (id, kode_bps, nama, jenis, geom, bbox, area_ha)
  VALUES (
    p_id, p_kode_bps, p_nama, p_jenis,
    ST_Multi(ST_GeomFromText(p_geom_wkt, 4326)),
    p_bbox, p_area_ha
  )
  ON CONFLICT (id) DO UPDATE SET
    kode_bps = EXCLUDED.kode_bps,
    nama     = EXCLUDED.nama,
    jenis    = EXCLUDED.jenis,
    geom     = EXCLUDED.geom,
    bbox     = EXCLUDED.bbox,
    area_ha  = EXCLUDED.area_ha;
END
$$;

REVOKE ALL ON FUNCTION upsert_kabupaten FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_kabupaten TO service_role;
