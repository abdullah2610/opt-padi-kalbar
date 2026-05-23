#!/usr/bin/env node
// Insert / upsert 14 kabupaten/kota dari infra/data/kabupaten_kalbar.geojson ke Postgres.
// Membutuhkan SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY di env.
//
// Usage: node infra/scripts/seed_kabupaten.mjs

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_PATH = join(__dirname, '..', 'data', 'kabupaten_kalbar.geojson');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function approximateAreaHa(bbox) {
  // crude: bbox area * 111km/deg lon (cos lat) * 111km/deg lat → ha
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const meanLat = (minLat + maxLat) / 2;
  const widthKm = (maxLon - minLon) * 111 * Math.cos((meanLat * Math.PI) / 180);
  const heightKm = (maxLat - minLat) * 111;
  return widthKm * heightKm * 100; // km² → ha
}

async function main() {
  const gj = JSON.parse(await readFile(GEOJSON_PATH, 'utf8'));
  if (gj.type !== 'FeatureCollection') throw new Error('expected FeatureCollection');

  console.log(`Seeding ${gj.features.length} kabupaten/kota → Supabase...`);

  for (const feat of gj.features) {
    const p = feat.properties;
    const wkt = geometryToWkt(feat.geometry);

    const { error } = await supabase.rpc('upsert_kabupaten', {
      p_id: p.id,
      p_kode_bps: p.kode_bps,
      p_nama: p.nama,
      p_jenis: p.jenis,
      p_geom_wkt: wkt,
      p_bbox: p.bbox,
      p_area_ha: p.area_ha ?? approximateAreaHa(p.bbox)
    });

    if (error) {
      // Fallback: pakai raw SQL via PostgREST belum mungkin utk geom, jadi anjurkan RPC
      console.error(`  ✗ ${p.id}: ${error.message}`);
      console.error('  Pastikan RPC upsert_kabupaten sudah dibuat — lihat infra/migrations/008_seed_rpc.sql (opsional, atau pakai psql langsung).');
      continue;
    }
    console.log(`  ✓ ${p.id} (${p.kode_bps})`);
  }
}

function geometryToWkt(geom) {
  if (geom.type === 'Polygon') {
    return `MULTIPOLYGON(${polygonRings(geom.coordinates)})`;
  }
  if (geom.type === 'MultiPolygon') {
    return `MULTIPOLYGON(${geom.coordinates.map(polygonRings).join(',')})`;
  }
  throw new Error(`Unsupported geometry type: ${geom.type}`);
}

function polygonRings(rings) {
  return `(${rings.map(ringToWkt).join(',')})`;
}

function ringToWkt(ring) {
  return `(${ring.map(([lon, lat]) => `${lon} ${lat}`).join(',')})`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
