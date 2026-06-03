#!/usr/bin/env node
/**
 * Run Supabase Postgres migrations (default: all in infra/migrations).
 *
 * Usage:
 *   node infra/scripts/run_migrations.mjs                # 001..009
 *   node infra/scripts/run_migrations.mjs --only 009     # single file
 *   node infra/scripts/run_migrations.mjs --from 005     # 005..end
 *   node infra/scripts/run_migrations.mjs --pooler       # convert direct URL → IPv4 pooler
 *
 * Reads SUPABASE_DB_URL from .env.local (or env).
 * Handles `@` in password (encodes → %40).
 * On ENETUNREACH (IPv6 unreachable), prints pooler suggestion + retries with --pooler if requested.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = join(root, 'infra/migrations');
const logPath = join(root, '.migration-run.log');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

function log(msg) {
  writeFileSync(logPath, `${new Date().toISOString()} ${msg}\n`, { flag: 'a' });
  console.log(msg);
}

function readEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envText = readFileSync(join(root, '.env.local'), 'utf8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && m[1] === name) return m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* no .env.local */
  }
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

/** Convert direct URL → Supabase Session pooler URL (IPv4, port 5432, region auto).
 * Direct:  postgres:PWD@db.PROJECT.supabase.co:5432/postgres
 * Pooler:  postgres.PROJECT:PWD@aws-0-<region>.pooler.supabase.com:5432/postgres
 *
 * Region must be set via SUPABASE_REGION env (e.g. ap-southeast-1).
 * Falls back to ap-southeast-1 (Singapore — common for Indonesia).
 */
function toPoolerUrl(url) {
  const m = url.match(/^postgresql:\/\/([^:]+):(.*)@db\.([a-z0-9-]+)\.supabase\.co:(\d+)(\/.*)?$/);
  if (!m) return null;
  const [, user, pass, projectRef, , rest = '/postgres'] = m;
  const explicitHost = readEnv('SUPABASE_POOLER_HOST');
  const region = readEnv('SUPABASE_REGION') || 'ap-southeast-1';
  const host = explicitHost || `aws-0-${region}.pooler.supabase.com`;
  return `postgresql://${user}.${projectRef}:${encodeURIComponent(pass)}@${host}:5432${rest}`;
}

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
}

function selectFiles() {
  const all = listMigrations();
  const only = opt('--only');
  const from = opt('--from');
  if (only) {
    const found = all.filter((f) => f.startsWith(only.padStart(3, '0') + '_'));
    if (!found.length) throw new Error(`migration ${only} not found`);
    return found;
  }
  if (from) {
    const fromN = parseInt(from, 10);
    return all.filter((f) => parseInt(f.slice(0, 3), 10) >= fromN);
  }
  return all;
}

async function runOne(sql, file) {
  const text = readFileSync(join(migrationsDir, file), 'utf8');
  log(`→ ${file}`);
  // Wrap in a transaction so a partial failure rolls back (avoid half-applied DDL).
  await sql.begin(async (tx) => {
    await tx.unsafe(text);
  });
  log(`✓ ${file}`);
}

async function connect(url) {
  const postgres = (await import('postgres')).default;
  return postgres(url, { ssl: 'require', max: 1, idle_timeout: 10 });
}

function printIpv6Help(url) {
  const pooler = toPoolerUrl(url);
  console.error('');
  console.error('⚠  IPv6 unreachable (ENETUNREACH). Supabase direct connection only routes IPv6.');
  console.error('   Fix options:');
  console.error('   1) Re-run with --pooler flag (uses IPv4 Session pooler).');
  console.error('   2) Update .env.local to pooler URL:');
  if (pooler) console.error(`        SUPABASE_DB_URL=${pooler}`);
  else console.error('        SUPABASE_DB_URL=postgresql://postgres.PROJECT:PWD@aws-0-<region>.pooler.supabase.com:5432/postgres');
  console.error('   Set SUPABASE_REGION=ap-southeast-1 (or your project region) if different.');
  console.error('');
}

async function main() {
  writeFileSync(logPath, '');
  let url = readEnv('SUPABASE_DB_URL');
  if (!url) {
    console.error('ERROR: SUPABASE_DB_URL belum diisi di .env.local atau environment');
    process.exit(1);
  }
  url = fixPasswordEncoding(url);

  if (flag('--pooler')) {
    const p = toPoolerUrl(url);
    if (p) {
      log('Using IPv4 Session pooler URL');
      url = p;
    } else {
      log('URL bukan format direct supabase — pooler conversion skipped');
    }
  }

  const files = selectFiles();
  log(`Connecting to Supabase Postgres (SSL) — ${files.length} migration(s)`);

  let sql;
  try {
    sql = await connect(url);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    if (/ENETUNREACH|EHOSTUNREACH/.test(err.message)) printIpv6Help(url);
    process.exit(1);
  }

  try {
    for (const f of files) await runOne(sql, f);
    const rows = await sql`
      SELECT proname FROM pg_proc
      WHERE proname IN ('detect_stress', 'compute_anomaly_z')
      ORDER BY 1
    `;
    log(`Functions: ${rows.map((r) => r.proname).join(', ') || '(none)'}`);
    log('All migrations OK');
  } catch (err) {
    log(`ERROR: ${err.message}`);
    if (/ENETUNREACH|EHOSTUNREACH/.test(err.message)) printIpv6Help(url);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exitCode = 1;
});
