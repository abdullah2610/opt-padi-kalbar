#!/usr/bin/env node
/**
 * Smoke test API endpoints lokal tanpa `vercel dev`.
 * Import setiap module dan call GET(new Request(...)).
 *
 * Usage: node infra/scripts/smoke_api.mjs
 * Exit 0 jika semua OK, 1 jika ada gagal.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://localhost/api';

const cases = [
  { path: '/api/kabupaten',                 module: 'api/kabupaten.js',        expect: (d) => Array.isArray(d) && d.length === 14 },
  { path: '/api/kabupaten?id=pontianak',    module: 'api/kabupaten.js',        expect: (d) => d?.id === 'pontianak' },
  { path: '/api/kabupaten?format=geojson',  module: 'api/kabupaten.js',        expect: (d) => d?.type === 'FeatureCollection' },
  { path: '/api/indices?kabupaten=pontianak&index=ndvi', module: 'api/indices.js',     expect: (d) => Array.isArray(d) },
  { path: '/api/alerts?kabupaten=pontianak', module: 'api/alerts.js',          expect: (d) => Array.isArray(d) },
  { path: '/api/yield?kabupaten=pontianak',  module: 'api/yield.js',           expect: (d) => d?.kabupaten_id === 'pontianak' || d === null },
  { path: '/api/landcover?kabupaten=pontianak', module: 'api/landcover.js',    expect: (d) => Array.isArray(d) || d === null },
  { path: '/api/composite-meta?kabupaten=pontianak', module: 'api/composite-meta.js', expect: (d) => Array.isArray(d) },
  { path: '/api/disease-risk?kabupaten=pontianak', module: 'api/disease-risk.js', expect: (d) => d?.risk && ['blast', 'hdb', 'wereng'].every((k) => k in d.risk), network: true },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const url = `http://localhost${c.path}`;
  let label = `${c.path}`;
  try {
    const mod = await import(join(root, c.module));
    if (typeof mod.GET !== 'function') throw new Error('no GET export');
    const res = await mod.GET(new Request(url));
    const json = await res.json();
    const ok = res.status === 200 && json?.success === true && c.expect(json.data);
    if (ok) {
      console.log(`✓ ${label}`);
      pass++;
    } else {
      console.log(`✗ ${label}  status=${res.status} success=${json?.success} dataKind=${Array.isArray(json?.data) ? 'array' : typeof json?.data}`);
      fail++;
    }
  } catch (err) {
    if (c.network && /fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/.test(err.message)) {
      console.log(`⚠ ${label}  network unreachable — skipped`);
    } else {
      console.log(`✗ ${label}  threw: ${err.message}`);
      fail++;
    }
  }
}

console.log(`\n${pass}/${cases.length} pass`);
if (fail > 0) process.exit(1);
