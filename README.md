# opt-padi-kalbar

Aplikasi web mobile-first untuk memantau kesehatan tanaman padi di 14 kabupaten/kota Kalimantan Barat menggunakan citra Sentinel-2 (Copernicus Data Space Ecosystem).

## Fitur

- Deteksi stres tanaman (NDVI/NDMI anomali vs baseline 2019-2023)
- Risiko hama-penyakit padi (blast, HDB, wereng) — gabungan indeks vegetasi + cuaca Open-Meteo
- Klasifikasi tutupan lahan (ESA WorldCover + Dynamic World)
- Deteksi kekeringan & banjir (NDWI/MNDWI/NDMI + curah hujan)
- Estimasi hasil panen (regresi linear pada NDVI peak + label BPS, roadmap XGBoost)
- 14 wilayah: Sambas, Bengkayang, Landak, Mempawah, Sanggau, Ketapang, Sintang, Kapuas Hulu, Sekadau, Melawi, Kayong Utara, Kubu Raya, Kota Pontianak, Kota Singkawang

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + MapLibre GL JS + PWA |
| Backend | Vercel Functions (Node.js 22) + Supabase Postgres + PostGIS |
| ETL | Python 3.11 + openEO + rasterio + rio-cogeo |
| Tile server | TiTiler (FastAPI) di Fly.io |
| Cron heavy | GitHub Actions |
| Cron light | Vercel Cron |

## Struktur

```
opt-padi-kalbar/
├── api/                  Vercel serverless functions (Node.js)
│   ├── _lib/             shared helpers (supabase client, thresholds, validate)
│   ├── tile/             tile proxy ke TiTiler
│   └── *.js              REST endpoints
├── web/                  React + Vite + TS frontend (mobile-first PWA)
├── workers/etl/          Python ETL Sentinel-2 (CDSE openEO)
├── infra/
│   ├── migrations/       Supabase SQL migrations
│   ├── data/             static GeoJSON kabupaten Kalbar
│   └── scripts/          seeders & ops scripts
├── .github/workflows/    GH Actions (ETL cron)
├── legacy/               codebase lama (referensi, akan dihapus setelah migrasi)
├── vercel.json
└── package.json
```

## Setup Lokal

### Database & Seed (Satu Kali)

```bash
# 1. Install deps
pnpm install
cd web && pnpm install && cd ..

# 2. Copy env
cp .env.example .env.local
# Edit .env.local: 
#   SUPABASE_URL, SUPABASE_KEY, SUPABASE_POOLER_URL (aws-1-ap-northeast-1)
#   Database direct URL via pooler (tidak support IPv6 direct)

# 3. Run all 9 migrations (pooler mode)
pnpm migrate:pooler
# Output: [MIGRATE] Running 009_indices.sql... ✓ (misal)

# 4. Verify region connectivity (opsional, debugging pooler)
pnpm probe:region

# 5. Seed 14 kabupaten/kota boundaries ke Postgres
pnpm seed:kab

# 6. Smoke test semua 9 REST endpoints (opsional, verify setup)
pnpm smoke
# Output: [9/9] endpoints OK (kabupaten, indices, alerts, yield, landcover, disease-risk, composite-meta, tile, ping)
```

### Development

```bash
# Frontend (React + Vite, localhost:5173)
pnpm dev:web

# Full Vercel preview (frontend + API emulation, localhost:3000)
pnpm vercel:dev

# Check TypeScript & Linting
pnpm typecheck:web
pnpm lint:web
```

### ETL (Python, Sentinel-2 Sentinel Composites)

```bash
# 1. Setup
cd workers/etl
uv sync

# 2. Login (device flow, tidak perlu CLIENT_ID/SECRET untuk dev lokal)
uv run python main.py login

# 3. Run ETL per kabupaten (dry-run test)
uv run python main.py \
  --kabupaten=pontianak \
  --period=2026-04-01:2026-04-10 \
  --dry-run

# 4. Actual run (upload COG ke Supabase Storage, insert stats ke Postgres)
uv run python main.py \
  --kabupaten=pontianak \
  --period=2026-04-01:2026-04-10

# Hasil: composites/{kab}/{date}/ndvi.tif, ndwi.tif, etc. di Supabase Storage bucket
```

**ETL Auth Note:** openEO CDSE sekarang pakai device flow + refresh token cache (`~/.local/share/openeo-python-client/refresh-tokens.json`). Otomatis login di `main.py login`; GHA perlu `CDSE_CLIENT_ID` & `CDSE_CLIENT_SECRET`.

## Deployment

**Frontend & API:** Auto-deploy via Vercel (linked di `.vercel/`).  
**ETL:** GH Actions cron harian (lihat `.github/workflows/etl.yml`); credentials: `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` di Vercel/GHA secrets.  
**Tile Server:** TiTiler (FastAPI) di Fly.io (pending deploy).

## Lisensi

MIT — sources & researchers credited in `ARCHITECTURE.md`.
