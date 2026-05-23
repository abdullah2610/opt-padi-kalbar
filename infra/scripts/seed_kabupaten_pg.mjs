#!/usr/bin/env node
/**
 * Seed 14 kabupaten via direct Postgres (pakai SUPABASE_DB_URL + pooler).
 * Tidak butuh SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage: node infra/scripts/seed_kabupaten_pg.mjs
 */
import { readFile, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile as readFileAsync } from 'node:fs/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const txt = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* skip */ }
  return null;
}

function fixPasswordEncoding(url) {
  if (!url.startsWith('postgresql://')) return url;
  const m = url.match(/^postgresql:\/\/([^:]+):(.*)@([^/?]+)(\/.*)?$/);
  if (!m) return url;
  const [, user, pass, hostPort, rest = ''] = m;
  if (!pass.includes('@')) return url;
  return `postgresql://${user}:${encodeURIComponent(pass)}@${hostPort}${rest}`;
}

function toPoolerUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):(.*)@db\.([a-z0-9-]+)\.supabase\.co:(\d+)(\/.*)?$/);
  if (!m) return null;
  const [, user, pass, projectRef, , rest = '/postgres'] = m;
  const host = readEnv('SUPABASE_POOLER_HOST');
  const region = readEnv('SUPABASE_REGION') || 'ap-southeast-1';
  const poolerHost = host || `aws-0-${region}.pooler.supabase.com`;
  return `postgresql://${user}.${projectRef}:${pass}@${poolerHost}:5432${rest}`;
}

function ringToWkt(ring) {
  return `(${ring.map(([lon, lat]) => `${lon} ${lat}`).join(',')})`;
}
function polygonRings(rings) { return `(${rings.map(ringToWkt).join(',')})`; }
function geometryToWkt(geom) {
  if (geom.type === 'Polygon')      return `MULTIPOLYGON(${polygonRings(geom.coordinates)})`;
  if (geom.type === 'MultiPolygon') return `MULTIPOLYGON(${geom.coordinates.map(polygonRings).join(',')})`;
  throw new Error(`Unsupported geometry: ${geom.type}`);
}

function approxAreaHa(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const meanLat = (minLat + maxLat) / 2;
  const wKm = (maxLon - minLon) * 111 * Math.cos((meanLat * Math.PI) / 180);
  const hKm = (maxLat - minLat) * 111;
  return wKm * hKm * 100;
}

async function main() {
  let url = readEnv('SUPABASE_DB_URL');
  if (!url) { console.error('Missing SUPABASE_DB_URL'); process.exit(1); }
  url = fixPasswordEncoding(url);
  const pooler = toPoolerUrl(url);
  if (pooler) url = pooler;

  const postgres = (await import('postgres')).default;
  const sql = postgres(url, { ssl: 'require', max: 1 });

  const gj = JSON.parse(await readFileAsync(join(root, 'infra/data/kabupaten_kalbar.geojson'), 'utf8'));
  console.log(`Seeding ${gj.features.length} kabupaten/kota ...`);

  let ok = 0, fail = 0;
  for (const feat of gj.features) {
    const p = feat.properties;
    const wkt = geometryToWkt(feat.geometry);
    const area = p.area_ha ?? approxAreaHa(p.bbox);
    try {
      await sql`
        SELECT upsert_kabupaten(
          ${p.id}::text,
          ${p.kode_bps}::text,
          ${p.nama}::text,
          ${p.jenis}::text,
          ${wkt}::text,
          ${p.bbox}::float8[],
          ${area}::float8
        )
      `;
      console.log(`  ✓ ${p.id} (${p.kode_bps})`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${p.id}: ${err.message.slice(0, 120)}`);
      fail++;
    }
  }
  const rows = await sql`SELECT COUNT(*)::int AS n FROM kabupaten`;
  console.log(`\nKabupaten in DB: ${rows[0].n} (seeded ${ok}, failed ${fail})`);
  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
