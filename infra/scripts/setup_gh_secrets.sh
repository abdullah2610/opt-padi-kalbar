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

# CDSE auth — refresh token (preferred) atau client credentials
echo ""
echo "─── CDSE Auth ───"

TOKEN_CACHE="$HOME/.local/share/openeo-python-client/refresh-tokens.json"
if [[ -f "$TOKEN_CACHE" ]]; then
  TOKEN=$(TOKEN_CACHE="$TOKEN_CACHE" python3 -c "
import json, os, sys
data = json.load(open(os.environ['TOKEN_CACHE']))
for issuer, clients in data.items():
    if 'copernicus' not in issuer: continue
    for cid, info in clients.items():
        print(info.get('refresh_token', ''))
        sys.exit(0)
" 2>/dev/null || echo "")
  if [[ -n "$TOKEN" ]]; then
    gh secret set CDSE_REFRESH_TOKEN --body "$TOKEN"
    echo "✓ CDSE_REFRESH_TOKEN (dari local cache $TOKEN_CACHE)"
  else
    echo "⚠  cache file ada tapi tidak ditemukan refresh_token CDSE"
    echo "   Jalankan dulu: cd workers/etl && uv run python main.py login"
  fi
else
  echo "⚠  Tidak ada refresh token cache di $TOKEN_CACHE"
  echo "   Jalankan dulu: cd workers/etl && uv run python main.py login"
  echo ""
  echo "   Alternatif: OAuth client credentials"
  if [[ -n "${CDSE_CLIENT_ID:-}" && -n "${CDSE_CLIENT_SECRET:-}" ]]; then
    gh secret set CDSE_CLIENT_ID --body "$CDSE_CLIENT_ID"
    gh secret set CDSE_CLIENT_SECRET --body "$CDSE_CLIENT_SECRET"
    echo "✓ CDSE_CLIENT_ID + CDSE_CLIENT_SECRET (dari .env.local)"
  else
    echo "✗ CDSE_CLIENT_ID atau CDSE_CLIENT_SECRET missing di .env.local"
  fi
fi

echo ""
echo "─── Status ───"
gh secret list

echo ""
echo "Next:"
echo "  gh workflow run etl.yml -f kabupaten=pontianak    # test 1 kab"
echo "  gh run watch                                       # monitor"
