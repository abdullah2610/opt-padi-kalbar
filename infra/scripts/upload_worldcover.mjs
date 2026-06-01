#!/usr/bin/env node
/**
 * Upload clipped WorldCover GeoTIFFs to Supabase Storage bucket `assets`.
 *
 * Path pattern: assets/worldcover/{kabupaten_id}.tif
 *
 * Prerequisites:
 *   1. Run fetch_worldcover.mjs → infra/data/worldcover_raw/
 *   2. Run clip_worldcover.py → infra/data/worldcover/
 *   3. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env / .env.local
 *
 * Usage:
 *   node infra/scripts/upload_worldcover.mjs [--dry-run] [--kabupaten pontianak]
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// Load env from .env.local manually (avoid dotenv dependency)
const envPath = join(REPO_ROOT, '.env.local');
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.startsWith('#')) {
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'assets';
const WC_DIR = join(REPO_ROOT, 'infra', 'data', 'worldcover');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const KABUPATEN_FILTER = args[args.indexOf('--kabupaten') + 1] ?? null;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function ensureBucket(sb) {
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);
  if (!exists) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true });
    if (error) throw new Error(`Create bucket ${BUCKET}: ${error.message}`);
    console.log(`Created bucket: ${BUCKET}`);
  }
}

async function main() {
  if (!existsSync(WC_DIR)) {
    console.error(`WorldCover dir not found: ${WC_DIR}`);
    console.error('Run clip_worldcover.py first.');
    process.exit(1);
  }

  const files = readdirSync(WC_DIR).filter((f) => f.endsWith('.tif'));
  const filtered = KABUPATEN_FILTER
    ? files.filter((f) => f === `${KABUPATEN_FILTER}.tif`)
    : files;

  if (filtered.length === 0) {
    console.error(`No .tif files in ${WC_DIR}${KABUPATEN_FILTER ? ` for ${KABUPATEN_FILTER}` : ''}`);
    process.exit(1);
  }

  console.log(`Uploading ${filtered.length} WorldCover tiles → ${BUCKET}/worldcover/`);
  if (DRY_RUN) console.log('DRY RUN — no actual upload');

  let sb;
  if (!DRY_RUN) {
    sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    await ensureBucket(sb);
  }

  const results = [];
  for (const fn of filtered) {
    const kabId = basename(fn, '.tif');
    const remotePath = `worldcover/${fn}`;
    const localPath = join(WC_DIR, fn);
    const fileBytes = readFileSync(localPath);
    const sizeMB = (fileBytes.length / 1e6).toFixed(2);

    console.log(`  ${kabId}: ${sizeMB} MB → ${BUCKET}/${remotePath}`);

    if (DRY_RUN) {
      results.push({ kabId, remotePath, ok: true, dry: true });
      continue;
    }

    const { error } = await sb.storage.from(BUCKET).upload(remotePath, fileBytes, {
      contentType: 'image/tiff',
      upsert: true,
    });

    if (error) {
      console.error(`  FAIL ${kabId}: ${error.message}`);
      results.push({ kabId, remotePath, ok: false, error: error.message });
    } else {
      const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(remotePath);
      console.log(`  OK   ${kabId}: ${urlData?.publicUrl}`);
      results.push({ kabId, remotePath, ok: true, url: urlData?.publicUrl });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nDone: ok=${ok} fail=${fail}`);

  if (!DRY_RUN && ok > 0) {
    console.log('\nPublic URL pattern:');
    console.log(`  ${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/worldcover/{kabupaten_id}.tif`);
  }

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
