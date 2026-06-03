#!/usr/bin/env node
/**
 * Probe Supabase pooler region by trying each AWS region until tenant lookup succeeds.
 * Usage: node infra/scripts/probe_pooler_region.mjs
 * Reads SUPABASE_DB_URL from .env.local. Writes SUPABASE_REGION back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

const REGIONS = [
  'ap-southeast-3', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-south-1', 'ap-east-1',
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3',
  'eu-north-1', 'eu-south-1',
  'sa-east-1', 'ca-central-1',
  'me-south-1', 'af-south-1'
];

function readEnvFile() {
  try { return readFileSync(join(root, '.env.local'), 'utf8'); } catch { return ''; }
}

function getKey(text, key) {
  const m = text.split('\n').find((l) => l.startsWith(`${key}=`));
  return m ? m.slice(key.length + 1).trim() : null;
}

function parseDirectUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):(.*)@db\.([a-z0-9-]+)\.supabase\.co:\d+(\/.*)?$/);
  if (!m) return null;
  const [, user, pass, projectRef, rest = '/postgres'] = m;
  return { user, pass, projectRef, rest };
}

async function tryHost(parsed, host) {
  const postgres = (await import('postgres')).default;
  const url = `postgresql://${parsed.user}.${parsed.projectRef}:${encodeURIComponent(parsed.pass)}@${host}:5432${parsed.rest}`;
  const sql = postgres(url, { ssl: 'require', max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    await sql`SELECT 1`;
    await sql.end({ timeout: 1 });
    return true;
  } catch (err) {
    try { await sql.end({ timeout: 1 }); } catch {}
    const msg = err.message || '';
    if (/Tenant.*not found|ENOTFOUND|EAI_AGAIN/i.test(msg)) return false;
    throw err;
  }
}

async function main() {
  const envText = readEnvFile();
  const directUrl = getKey(envText, 'SUPABASE_DB_URL');
  if (!directUrl) { console.error('SUPABASE_DB_URL missing'); process.exit(1); }
  const parsed = parseDirectUrl(directUrl);
  if (!parsed) { console.error('SUPABASE_DB_URL not in direct format db.PROJECT.supabase.co'); process.exit(1); }

  const PREFIXES = ['aws-0', 'aws-1', 'aws-2'];
  console.log(`Probing pooler regions for project ${parsed.projectRef} ...`);
  for (const prefix of PREFIXES) {
    for (const r of REGIONS) {
      const host = `${prefix}-${r}.pooler.supabase.com`;
      process.stdout.write(`  ${host} ... `);
      try {
        const ok = await tryHost(parsed, host);
        if (ok) {
          console.log('OK');
          const next = envText
            .split('\n')
            .filter((l) => !l.startsWith('SUPABASE_REGION=') && !l.startsWith('SUPABASE_POOLER_HOST='))
            .concat([`SUPABASE_REGION=${r}`, `SUPABASE_POOLER_HOST=${host}`, ''])
            .join('\n');
          writeFileSync(join(root, '.env.local'), next);
          console.log(`\n✓ Match: ${host} — written to .env.local`);
          console.log('Now run: pnpm migrate:pooler');
          return;
        }
        console.log('miss');
      } catch (err) {
        console.log(`err (${err.message.slice(0, 60)})`);
      }
    }
  }
  console.error('\n✗ No host matched. Copy exact pooler URI from Supabase Dashboard → Connect.');
  process.exit(1);
}

main();
