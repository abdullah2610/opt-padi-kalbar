#!/usr/bin/env bash
# Jalankan migration 009_analytics.sql
# Usage (dari root repo):
#   export SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres'
#   bash infra/scripts/run_migration_009.sh
#
# Atau simpan URL di .env.local:
#   SUPABASE_DB_URL=postgresql://...

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL belum di-set." >&2
  echo "  Buat .env.local di root repo dengan baris:" >&2
  echo "  SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" >&2
  echo "" >&2
  echo "  Ambil dari Supabase Dashboard → Project Settings → Database → Connection string (URI)" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql tidak ditemukan. Install: sudo apt install postgresql-client" >&2
  exit 1
fi

echo "→ Running infra/migrations/009_analytics.sql ..."
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f infra/migrations/009_analytics.sql

echo "→ Verifying functions ..."
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
  "SELECT proname FROM pg_proc WHERE proname IN ('detect_stress','compute_anomaly_z') ORDER BY 1;"

echo "✓ Migration 009 selesai."
