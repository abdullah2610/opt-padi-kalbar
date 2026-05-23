// Loader 14 kabupaten/kota Kalbar dari GeoJSON file di infra/data/.
// Cache di module scope (Vercel Fluid Compute reuse warm instance).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const GEOJSON_PATH = join(__dirname, '..', '..', 'infra', 'data', 'kabupaten_kalbar.geojson');

let cached = null;

export function loadAllKabupaten() {
  if (cached) return cached;
  const raw = readFileSync(GEOJSON_PATH, 'utf8');
  const gj = JSON.parse(raw);
  cached = gj.features.map((f) => {
    const p = f.properties;
    const [minLon, minLat, maxLon, maxLat] = p.bbox;
    return {
      id: p.id,
      kode_bps: p.kode_bps,
      nama: p.nama,
      jenis: p.jenis,
      bbox: p.bbox,
      centroid: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
      geometry: f.geometry
    };
  });
  return cached;
}

export function getKabupaten(id) {
  return loadAllKabupaten().find((k) => k.id === id) ?? null;
}

export function listKabupatenSummary() {
  return loadAllKabupaten().map(({ geometry: _g, ...rest }) => rest);
}

export function getGeoJSONFeatureCollection() {
  return {
    type: 'FeatureCollection',
    features: loadAllKabupaten().map((k) => ({
      type: 'Feature',
      geometry: k.geometry,
      properties: {
        id: k.id,
        kode_bps: k.kode_bps,
        nama: k.nama,
        jenis: k.jenis,
        bbox: k.bbox,
        centroid: k.centroid
      }
    }))
  };
}
