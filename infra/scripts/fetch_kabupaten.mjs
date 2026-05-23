#!/usr/bin/env node
// Fetch GeoJSON batas 14 kabupaten/kota Kalimantan Barat.
// Sumber utama: https://github.com/mahendrayudha/indonesia-geojson (CC-BY)
// Output: infra/data/kabupaten_kalbar.geojson (FeatureCollection)
//
// Usage: node infra/scripts/fetch_kabupaten.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'data', 'kabupaten_kalbar.geojson');

const BASE = 'https://raw.githubusercontent.com/mahendrayudha/indonesia-geojson/main/Kalimantan%20Barat/Kabupaten-Kota';

// `folder_candidates` accommodates old vs new naming
// Kabupaten Pontianak was renamed to Kabupaten Mempawah in 2014 — some sources lag
const KABUPATEN_KALBAR = [
  { id: 'sambas',       kode_bps: '6101', nama: 'Kabupaten Sambas',       jenis: 'kabupaten', folders: ['Sambas'] },
  { id: 'bengkayang',   kode_bps: '6102', nama: 'Kabupaten Bengkayang',   jenis: 'kabupaten', folders: ['Bengkayang'] },
  { id: 'landak',       kode_bps: '6103', nama: 'Kabupaten Landak',       jenis: 'kabupaten', folders: ['Landak'] },
  { id: 'mempawah',     kode_bps: '6104', nama: 'Kabupaten Mempawah',     jenis: 'kabupaten', folders: ['Mempawah', 'Pontianak'] },
  { id: 'sanggau',      kode_bps: '6105', nama: 'Kabupaten Sanggau',      jenis: 'kabupaten', folders: ['Sanggau'] },
  { id: 'ketapang',     kode_bps: '6106', nama: 'Kabupaten Ketapang',     jenis: 'kabupaten', folders: ['Ketapang'] },
  { id: 'sintang',      kode_bps: '6107', nama: 'Kabupaten Sintang',      jenis: 'kabupaten', folders: ['Sintang'] },
  { id: 'kapuas-hulu',  kode_bps: '6108', nama: 'Kabupaten Kapuas Hulu',  jenis: 'kabupaten', folders: ['Kapuas Hulu', 'Kapuas%20Hulu'] },
  { id: 'sekadau',      kode_bps: '6109', nama: 'Kabupaten Sekadau',      jenis: 'kabupaten', folders: ['Sekadau'] },
  { id: 'melawi',       kode_bps: '6110', nama: 'Kabupaten Melawi',       jenis: 'kabupaten', folders: ['Melawi'] },
  { id: 'kayong-utara', kode_bps: '6111', nama: 'Kabupaten Kayong Utara', jenis: 'kabupaten', folders: ['Kayong Utara', 'Kayong%20Utara'] },
  { id: 'kubu-raya',    kode_bps: '6112', nama: 'Kabupaten Kubu Raya',    jenis: 'kabupaten', folders: ['Kubu Raya', 'Kubu%20Raya'] },
  { id: 'pontianak',    kode_bps: '6171', nama: 'Kota Pontianak',         jenis: 'kota',      folders: ['Kota Pontianak', 'Kota%20Pontianak'] },
  { id: 'singkawang',   kode_bps: '6172', nama: 'Kota Singkawang',        jenis: 'kota',      folders: ['Singkawang'] }
];

function bboxFromGeometry(geometry) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) walk(c);
    }
  };
  walk(geometry.coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

async function tryFetch(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

async function fetchOne(meta) {
  for (const folder of meta.folders) {
    const folderEnc = encodeURI(folder).replace(/%25/g, '%'); // already-encoded safe
    // Filename usually matches folder basename
    const baseName = folder.replace(/%20/g, ' ').trim();
    const candidates = [
      `${BASE}/${folderEnc}/${encodeURIComponent(baseName)}.geojson`,
      `${BASE}/${folderEnc}/${encodeURIComponent(baseName.replace(/\s+/g, '_'))}.geojson`,
      `${BASE}/${folderEnc}/${encodeURIComponent(baseName.replace(/\s+/g, '-'))}.geojson`
    ];
    for (const url of candidates) {
      const gj = await tryFetch(url);
      if (gj) {
        const feature = gj.type === 'FeatureCollection' ? gj.features?.[0] : gj;
        if (feature?.geometry) {
          let geom = feature.geometry;
          if (geom.type === 'Polygon') {
            geom = { type: 'MultiPolygon', coordinates: [geom.coordinates] };
          }
          if (geom.type !== 'MultiPolygon') {
            console.warn(`  ! ${meta.kode_bps} got ${geom.type}, skip`);
            continue;
          }
          return {
            feature: {
              type: 'Feature',
              geometry: geom,
              properties: {
                id: meta.id,
                kode_bps: meta.kode_bps,
                nama: meta.nama,
                jenis: meta.jenis,
                bbox: bboxFromGeometry(geom)
              }
            },
            source: url
          };
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log(`Fetching ${KABUPATEN_KALBAR.length} kabupaten/kota Kalbar boundaries...`);
  const features = [];
  for (const meta of KABUPATEN_KALBAR) {
    const result = await fetchOne(meta);
    if (result) {
      features.push(result.feature);
      console.log(`  ✓ ${meta.kode_bps} ${meta.nama}`);
    } else {
      console.error(`  ✗ ${meta.kode_bps} ${meta.nama} — semua kandidat URL gagal`);
    }
  }

  if (features.length !== KABUPATEN_KALBAR.length) {
    console.warn(`Got ${features.length}/${KABUPATEN_KALBAR.length} features.`);
  }

  const fc = { type: 'FeatureCollection', name: 'kabupaten_kalbar', features };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(fc, null, 2));
  console.log(`Wrote ${OUT_PATH} (${features.length} features, ${(JSON.stringify(fc).length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
