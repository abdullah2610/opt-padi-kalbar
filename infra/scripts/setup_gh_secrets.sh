#!/usr/bin/env bash
# Setup GitHub Actions secrets dari .env.local + prompt CDSE OAuth.
# Usage: bash infra/scripts/setup_gh_secrets.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI tidak ditemukan. Install: https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Login dulu: gh auth login"
  exit 1
fi

# Load .env.local
if [[ ! -f .env.local ]]; then
  echo "ERROR: .env.local tidak ada" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

# Required Supabase secrets dari .env.local
echo "─── Supabase secrets ───"
if [[ -n "${SUPABASE_URL:-}" ]]; then
  gh secret set SUPABASE_URL --body "$SUPABASE_URL"
  echo "✓ SUPABASE_URL"
else
  echo "✗ SUPABASE_URL missing di .env.local"
fi

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
  echo "✓ SUPABASE_SERVICE_ROLE_KEY"
else
  echo "✗ SUPABASE_SERVICE_ROLE_KEY missing di .env.local"
fi

# CDSE OAuth — prompt user
echo ""
echo "─── CDSE OAuth Client ───"
echo "Belum punya? Buat di:"
echo "  https://identity.dataspace.copernicus.eu/auth/realms/CDSE/account/clients"
echo ""

if [[ -n "${CDSE_CLIENT_ID:-}" ]]; then
  gh secret set CDSE_CLIENT_ID --body "$CDSE_CLIENT_ID"
  echo "✓ CDSE_CLIENT_ID (dari .env.local)"
else
  read -rp "CDSE_CLIENT_ID (skip = enter kosong): " cid
  if [[ -n "$cid" ]]; then
    gh secret set CDSE_CLIENT_ID --body "$cid"
    echo "✓ CDSE_CLIENT_ID"
  else
    echo "⚠  skipped — workflow akan fail tanpa ini"
  fi
fi

if [[ -n "${CDSE_CLIENT_SECRET:-}" ]]; then
  gh secret set CDSE_CLIENT_SECRET --body "$CDSE_CLIENT_SECRET"
  echo "✓ CDSE_CLIENT_SECRET (dari .env.local)"
else
  read -rsp "CDSE_CLIENT_SECRET (skip = enter kosong, input hidden): " cs
  echo ""
  if [[ -n "$cs" ]]; then
    gh secret set CDSE_CLIENT_SECRET --body "$cs"
    echo "✓ CDSE_CLIENT_SECRET"
  else
    echo "⚠  skipped"
  fi
fi

echo ""
echo "─── Status ───"
gh secret list

echo ""
echo "Next:"
echo "  gh workflow run etl.yml -f kabupaten=pontianak    # test 1 kab"
echo "  gh run watch                                       # monitor"
