# Architecture

Mobile-first web app pemantauan padi 14 kab/kota Kalbar pakai Sentinel-2 L2A via Copernicus Data Space Ecosystem (CDSE).

## Data Flow

```
┌────────────────────────────┐     ┌────────────────────────────┐
│ CDSE openEO + STAC          │     │ Open-Meteo (cuaca)         │
│ (Sentinel-2 L2A bands)      │     │ Forecast + Archive         │
└──────────────┬──────────────┘     └──────────────┬─────────────┘
               │                                    │
               ▼                                    ▼
   ┌──────────────────────────────────────────────────────────┐
   │ Python ETL worker (workers/etl)                          │
   │ - openEO process graph: NDVI, NDWI, MNDWI, NDMI, MSI,EVI │
   │ - SCL cloud mask, 10-day median composite per kabupaten   │
   │ - Upload COG → Supabase Storage (composites bucket)       │
   │ - Insert stats → Postgres (vegetation_indices)            │
   │ - GH Actions cron: 0 2 * * * (harian, scan scene baru)    │
   └──────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │ Supabase Postgres + PostGIS (pooler IPv4)         │
        │ aws-1-ap-northeast-1 (soal IPv6 direct)           │
        │ kabupaten / sentinel_composites /                 │
        │ vegetation_indices / alerts / yield / landcover   │
        └──────────────────────────────┬───────────────────┘
                                       │
                                       ▼
                ┌──────────────────────────────────────┐
                │ Vercel Serverless Functions (Node 22) │
                │ 9 endpoints (all passing smoke test)  │
                │ /api/kabupaten, /api/indices,        │
                │ /api/alerts, /api/yield, /api/tile   │
                │ /api/landcover, /api/disease-risk    │
                │ /api/composite-meta, /api/ping       │
                └──────────────────┬───────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │ Frontend: React + Vite + MapLibre + Tailwind PWA │
        │ - Mobile-first bottom-nav, desktop sidebar        │
        │ - Map overlay (NDVI / banjir / stres / landcover) │
        │ - Service worker tile cache (offline preview)     │
        │ - Build: vercel.json, pnpm build:web              │
        └───────────────────────────────────────────────────┘
```

## Database Connectivity

**Pooler (Development & Production):** Supabase pooler menggunakan IPv4 (aws-1-ap-northeast-1). Direct IPv6 tidak stabil di Vercel Functions, maka semua koneksi via pooler.  
**Migration Scripts:** `pnpm migrate:pooler` menggunakan `SUPABASE_POOLER_URL` (bukan direct `SUPABASE_DB_URL`).

## ETL Authentication

**Device Flow (Development):** openEO CDSE pakai device flow + refresh token caching (`~/.local/share/openeo-python-client/refresh-tokens.json`). Tidak perlu `CDSE_CLIENT_ID`/`SECRET` untuk dev lokal.  
**Client Credentials (CI/GHA):** GHA workflows pakai `CDSE_CLIENT_ID` & `CDSE_CLIENT_SECRET` via Vercel secrets.  
**Login:** `uv run python main.py login` otomatis setup device flow saat pertama kali.

## API Testing & Smoke Tests

**Smoke Test:** `pnpm smoke` menjalankan 9 endpoint tests untuk verify setup. Passing 9/9 berarti DB, migrations, seed, & API semua OK.  
**Test Path:** `infra/scripts/smoke_api.mjs` — lihat untuk endpoint list.

## Indices

| Index | Formula | Use case |
|---|---|---|
| NDVI | (B08-B04)/(B08+B04) | vegetation vigor, phenology, stress |
| NDWI | (B03-B08)/(B03+B08) | water content in vegetation |
| MNDWI | (B03-B11)/(B03+B11) | open water / flood mapping |
| NDMI | (B08-B11)/(B08+B11) | canopy moisture / drought |
| MSI | B11/B08 | moisture stress (>1.2 = water stress) |
| EVI | 2.5(B08-B04)/(B08+6B04-7.5B02+1) | high-biomass vegetation, yield |

## Phenology Thresholds (Padi)

Referensi: paper Subang (Universitas Indonesia, 2020) — *Model of paddy rice phenology using Sentinel 2-A imagery*:

| NDVI range | Fase |
|---|---|
| < 0.18 | persiapan lahan / bera |
| 0.18 – 0.40 | vegetatif awal |
| 0.40 – 0.65 | vegetatif lanjut |
| 0.65 – 0.80 | generatif (anakan-bunting) |
| > 0.50 turun | menua / siap panen |

## Disease Risk Thresholds

Port dari `soil-moisture-dashboard/ml/THRESHOLDS.md`:

| Penyakit | RH | Suhu | Hujan 7-hari | Logic |
|---|---|---|---|---|
| Blast (HIGH) | ≥85% | 24–28°C | ≥20mm | AND, boost +1 jika NDMI p10 < 0.1 |
| HDB | ≥85% (72h) | — | heavy_rain_hours > 4 | AND |
| Wereng | ≥78% | 22–32°C | warm_humid_hours_7d ≥ 24 | AND |
| Bercak Coklat (MED) | ≥85% | 25–30°C | ≥15mm | AND |

## Anomaly Detection (Stres)

z-score per kabupaten per Day-of-Year:
```
z = (ndvi_current - baseline_doy_mean) / baseline_doy_std
```

Baseline = mean/std NDVI 2019-2023 per DOY. Stres flagged jika z < -1.5 selama ≥ 2 composite berturut.

## Drought

Combine 3 sinyal:
- NDVI z-score < -1.5
- NDMI p50 < 0.0
- Open-Meteo cumulative precipitation 30 hari < 100 mm

Severity:
- low: 1 sinyal
- med: 2 sinyal
- high: 3 sinyal

## Flood

`MNDWI > 0.3` di pixel yg masuk class "Cropland" (Dynamic World) atau "Permanent water" → flag flood.

Note: Sentinel-1 SAR fallback untuk musim hujan berawan (out of scope MVP).

## Land Cover

MVP: import ESA WorldCover 2021 (10m) + Dynamic World near-realtime via openEO. Tidak training model sendiri.

## Yield Estimation (v0)

Regresi linear:
```
yield_ton = β0 + β1 * NDVI_peak_avg + β2 * EVI_grain_filling_avg + β3 * area_sawah_ha
```

Label dari BPS Kalbar (produksi padi per kabupaten 2019-2024). Roadmap v1: XGBoost (Valencia paper R² = 0.85).

## Tile Pipeline

```
COG di Supabase Storage (signed URL)
   ↓
TiTiler (Fly.io, FastAPI)
   ↓  /cog/tiles/{z}/{x}/{y}.png?url=…&rescale=…&colormap_name=…
Vercel function /api/tile/{index}/{date}/{kabupaten}/{z}/{x}/{y}.png
   ↓  reverse proxy + Cache-Control: max-age=86400 immutable
MapLibre raster source
```

## Risks

Lihat `.claude/plans/streamed-imagining-thunder.md` untuk daftar lengkap risiko + mitigasi.
