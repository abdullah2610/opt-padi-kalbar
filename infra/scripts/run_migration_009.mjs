#!/usr/bin/env node
/**
 * Run 009_analytics.sql using connection string from .env.local
 * Usage: node infra/scripts/run_migration_009.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const logPath = join(root, '.migration-run.log');

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  writeFileSync(logPath, line, { flag: 'a' });
  console.log(msg);
}

function loadDbUrl() {
  const raw = readFileSync(join(root, '.env.local'), 'utf8').trim();
  let url = raw;
  if (raw.includes('SUPABASE_DB_URL=')) {
    url = raw.split('SUPABASE_DB_URL=')[1].split('\n')[0].trim();
  } else if (raw.includes('=') && !raw.startsWith('postgresql')) {
    const line = raw.split('\n').find((l) => l.startsWith('SUPABASE_DB_URL='));
    if (line) url = line.replace('SUPABASE_DB_URL=', '').trim();
  }
  return fixPostgresUrl(url);
}

/** Password with @ breaks URI — encode pass between user: and @db.*.supabase.co */
function fixPostgresUrl(url) {
  if (!url.startsWith('postgresql://')) return url;
  const m = url.match(/@(db\.[a-z0-9.-]+\.supabase\.co:\d+\/\w+)/i);
  if (!m) return url;
  const atHost = url.indexOf(`@${m[1]}`);
  const prefix = url.slice(0, atHost);
  const suffix = url.slice(atHost + 1);
  const userMatch = prefix.match(/^postgresql:\/\/([^:]+):(.+)$/);
  if (!userMatch) return url;
  const [, user, pass] = userMatch;
  if (!pass.includes('@')) return url;
  return `postgresql://${user}:${encodeURIComponent(pass)}@${suffix}`;
}

async function main() {
  writeFileSync(logPath, '');
  const url = loadDbUrl();
  log('Connecting to Supabase Postgres (SSL)...');

  const postgres = (await import('postgres')).default;
  const sql = postgres(url, { ssl: 'require', max: 1 });

  const migrationSql = readFileSync(join(root, 'infra/migrations/009_analytics.sql'), 'utf8');
  log('Running 009_analytics.sql ...');
  await sql.unsafe(migrationSql);

  const rows = await sql`
    SELECT proname FROM pg_proc
    WHERE proname IN ('detect_stress', 'compute_anomaly_z')
    ORDER BY 1
  `;
  log(`Functions: ${rows.map((r) => r.proname).join(', ') || '(none)'}`);
  if (rows.length < 2) {
    throw new Error('Expected detect_stress and compute_anomaly_z');
  }
  await sql.end();
  log('Migration 009 OK');
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  process.exitCode = 1;
});
