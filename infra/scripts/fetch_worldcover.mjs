#!/usr/bin/env node
/**
 * Download ESA WorldCover 2021 v200 tile covering Kalimantan Barat extent.
 *
 * Kalbar bbox: ~108.0–118.1°E, 0.0–3.1°N  (approx)
 * WorldCover tiles are 3°×3° at 10m resolution.
 * Relevant tiles: N00E108, N00E111, N00E114, N00E117, N03E108, N03E111, N03E114, N03E117
 *
 * Source: Zenodo DOI 10.5281/zenodo.5571936 (WorldCover 2021 v200)
 * Tile naming: ESA_WorldCover_10m_2021_v200_{lat}{lon}_Map.tif
 *
 * Usage:
 *   node infra/scripts/fetch_worldcover.mjs [--out-dir infra/data/worldcover_raw]
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const outDirArg = args[args.indexOf('--out-dir') + 1] ?? null;
const OUT_DIR = outDirArg ? outDirArg : join(REPO_ROOT, 'infra', 'data', 'worldcover_raw');

// WorldCover 2021 v200 tiles covering Kalbar (108-118E, 0-3N)
// Tile naming: ESA_WorldCover_10m_2021_v200_{LAT}{LON}_Map.tif
// Lat prefix: N00 or N03; Lon prefix: E108, E111, E114, E117
const TILES = [
  { lat: 'N00', lon: 'E108' }, { lat: 'N00', lon: 'E111' }, { lat: 'N00', lon: 'E114' }, { lat: 'N00', lon: 'E117' },
  { lat: 'N03', lon: 'E108' }, { lat: 'N03', lon: 'E111' }, { lat: 'N03', lon: 'E114' }, { lat: 'N03', lon: 'E117' },
  { lat: 'S03', lon: 'E108' }, { lat: 'S03', lon: 'E111' },
];

// ESA WorldCover 2021 v200 — AWS S3 Open Data
// Source: https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/
function tileFilename({ lat, lon }) {
  return `ESA_WorldCover_10m_2021_v200_${lat}${lon}_Map.tif`;
}

function tileUrl({ lat, lon }) {
  const fn = tileFilename({ lat, lon });
  return `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/${fn}`;
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, { timeout: 60000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const fileSize = res.headers['content-length'];
        let downloaded = 0;
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (fileSize) {
            const pct = ((downloaded / parseInt(fileSize)) * 100).toFixed(0);
            process.stdout.write(`\r  ${pct}% (${(downloaded / 1e6).toFixed(1)} MB)`);
          }
        });
        pipeline(res, createWriteStream(dest))
          .then(() => { process.stdout.write('\n'); resolve(); })
          .catch(reject);
      }).on('error', reject);
    }
    get(url);
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Downloading WorldCover 2021 tiles → ${OUT_DIR}`);
  console.log(`Tiles: ${TILES.length}`);

  for (const tile of TILES) {
    const fn = tileFilename(tile);
    const dest = join(OUT_DIR, fn);
    if (existsSync(dest)) {
      console.log(`  SKIP (exists): ${fn}`);
      continue;
    }
    const url = tileUrl(tile);
    console.log(`  Downloading ${fn} ...`);
    console.log(`  URL: ${url}`);
    try {
      await download(url, dest);
      console.log(`  OK: ${fn}`);
    } catch (err) {
      console.error(`  FAIL: ${fn}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nDone. Next: run clip_worldcover.py to clip per-kabupaten.');
}

main();
