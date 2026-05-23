# Progress — opt-padi-kalbar

Status pengerjaan aplikasi web mobile-first pemantauan padi 14 kab/kota Kalbar dgn Sentinel-2.

**Tanggal update:** 2026-05-23 (sesi ke-3: ETL pertama sukses — Pontianak 2026-05-01..2026-05-10)
**Plan asli:** `.claude/plans/streamed-imagining-thunder.md`
**Arsitektur:** `ARCHITECTURE.md`

## Perubahan Sesi Ini

- Hapus 21 file stale `.js` di `web/src/` (sisa dari `tsc --noEmit false` build lama).
- Fix `web/package.json` build script → `tsc -b --noEmit && vite build` (cegah emit ulang).
- `pnpm install` di `web/` — `@sentry/react` ter-resolve, typecheck + build hijau.
- Tambah `infra/scripts/run_migrations.mjs` — generic runner all/range/only + auto IPv4 pooler fallback saat `ENETUNREACH`.
- Tambah `infra/scripts/smoke_api.mjs` — uji 9 endpoint lokal tanpa `vercel dev`. **9/9 pass** termasuk live Open-Meteo `/api/disease-risk`.
- npm scripts baru di root: `pnpm migrate`, `pnpm migrate:pooler`, `pnpm migrate:009`, `pnpm probe:region`, `pnpm smoke`, `pnpm seed:kab`.
- **Migrations 001–009 ter-apply** ke Supabase via pooler `aws-1-ap-northeast-1.pooler.supabase.com`. RPC `detect_stress`, `compute_anomaly_z`, `upsert_kabupaten` aktif.
- **14 kabupaten/kota seeded** via `pnpm seed:kab` (pakai postgres lib + pooler, tidak butuh service_role key).
- `probe_pooler_region.mjs` — scan 21 region × 3 prefix (aws-0/1/2) untuk auto-detect pooler host.
- **ETL Pontianak pertama sukses:**
  - 6 batch jobs CDSE openEO (NDVI/NDWI/MNDWI/NDMI/MSI/EVI) → 6 GeoTIFF → COG → upload Supabase Storage `composites/composites/pontianak/2026-05-10/*.tif`
  - 1 row `sentinel_composites` (status=completed, scl_clear_pct=96.4%)
  - 6 row `vegetation_indices` obs_date=2026-05-05 (mid window)
  - NDVI mean 0.506, NDMI 0.096, EVI 1.615 → tanaman sehat moderate, no alerts
- **Fix bug ETL (sesi ke-3):**
  - `yield.py` → `yield_model.py` (Python keyword conflict)
  - `connect()` openEO: `authenticate_oidc()` pakai cached refresh token, fallback device flow (no CLIENT_ID/SECRET needed)
  - Retry decorator: `retry_if_not_exception_type(KeyError, ClickException, ValueError)` — config error tidak retry (avoid burning CDSE quota)
  - Fail-fast `SUPABASE_URL`/`SERVICE_ROLE_KEY` validation sebelum submit batch jobs

---

## Ringkasan Status

| Phase | Nama | Status | Estimasi sisa |
|---|---|---|---|
| 0 | Scaffold monorepo | ✅ Done | — |
| 1 | GeoJSON kabupaten + DB migrations | ✅ 001-009 applied + 14 kabupaten seeded | — |
| 2 | Python ETL openEO Sentinel-2 | ✅ Implemented + **first run Pontianak sukses** (96% clear, NDVI mean 0.506) | run 13 kab sisa |
| 3 | TiTiler tile serving | ✅ Scaffold + proxy API | deploy Fly.io |
| 4 | Analytics modules | ✅ API + SQL (fallback dummy) | butuh data ETL |
| 5 | Vercel REST API endpoints | ✅ Done — **smoke 9/9 pass** | — |
| 6 | Mobile-first React frontend | ✅ Done MVP — typecheck + build hijau, PWA OK | polish opsional |
| 7 | Deploy & observability | 🟡 Sentry wired (deps installed) | deploy Vercel manual |
| 8 | Auth multi-role | 🔒 Deferred Phase-2 | — |

**Total sisa user-only:** CDSE OAuth + ETL run pertama, deploy TiTiler Fly.io, deploy Vercel production (~½–1 hari kerja).

---

## ✅ Phase 0 — Scaffold (Done)

Monorepo terbentuk:
```
opt-padi-kalbar/
├── api/                  Vercel Functions (Node 22, Web standard signature)
│   ├── _lib/             supabase, validate (zod), response, thresholds, dummy, kabupaten loader
│   └── tile/             tile proxy stub
├── web/                  Vite + React 18 + TS + Tailwind + MapLibre + PWA
├── workers/etl/          Python skeleton (openEO, indices, cloudmask, storage, stats)
├── infra/migrations/     9 SQL files (001–009)
├── infra/scripts/        fetch/seed kabupaten, run_migration_009.{sh,mjs}
├── infra/data/           kabupaten_kalbar.geojson (2.4 MB, 14 features)
├── .github/workflows/    etl.yml cron harian 02:00 UTC
└── legacy/               codebase vanilla lama
```

Konfigurasi:
- `package.json` root: `type: module`, deps `@supabase/supabase-js`, `zod`
- `vercel.json`: rewrite `/api/*`, function memory 1024/512 MB, Cache-Control tile 1 hari immutable
- `.env.example`: Supabase + CDSE + TiTiler + Open-Meteo placeholders
- `.gitignore`: `node_modules`, `dist`, `.env*`, Python `.venv`

---

## ✅ Phase 1 — Data + DB (Done)

**Migrations (`infra/migrations/`):**
| File | Isi |
|---|---|
| 001_postgis.sql | enable PostGIS + uuid-ossp |
| 002_kabupaten.sql | 14 kab/kota MultiPolygon + bbox + RLS public read |
| 003_sentinel_composites.sql | metadata composite + status enum + trigger updated_at |
| 004_vegetation_indices.sql | time-series 6 indeks + baseline DOY |
| 005_alerts.sql | enum type/severity + index aktif |
| 006_yield_estimates.sql | estimasi + tabel referensi BPS |
| 007_landcover.sql | data + lookup class (ESA WorldCover + Dynamic World) |
| 008_seed_rpc.sql | RPC `upsert_kabupaten()` utk seeder |
| 009_analytics.sql | `detect_stress()`, `compute_anomaly_z()` — **belum di-apply** (2026-05-23) |

**Eksekusi migrations:**
```bash
# Simpan di .env.local (WAJIB format KEY=value, bukan URL mentah saja):
#   SUPABASE_DB_URL=postgresql://postgres:PASSWORD@db.[PROJECT].supabase.co:5432/postgres
# Jika password mengandung @ → encode jadi %40 (contoh: pa@ss → pa%40ss)

set -a && source .env.local && set +a

for f in infra/migrations/00{1..9}_*.sql; do
  echo "→ $f"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# atau hanya 009 (setelah 001–008):
pnpm install && pnpm migrate:009
# log: .migration-run.log (harus berisi "Migration 009 OK")

# verify PostGIS + fungsi analytics
psql "$SUPABASE_DB_URL" -c "SELECT COUNT(*) FROM pg_extension WHERE extname='postgis';"
psql "$SUPABASE_DB_URL" -c "SELECT proname FROM pg_proc WHERE proname IN ('detect_stress','compute_anomaly_z');"
```

### ⚠️ Migrations belum ter-apply — IPv6 ENETUNREACH

**Status:** File SQL 001–009 + runner generic siap. Eksekusi terakhir log:
```
ERROR: connect ENETUNREACH 2406:da14:... :5432 - Local (:::0)
```
**Penyebab:** Supabase `db.PROJECT.supabase.co:5432` cuma punya record AAAA (IPv6). WSL2 abdum sering tidak punya rute IPv6 keluar.

**Fix tunggal — gunakan IPv4 Session Pooler:**

```bash
cd ~/opt-padi-kalbar
pnpm install
# .env.local sudah punya SUPABASE_DB_URL direct. Cukup tambahkan region:
echo "SUPABASE_REGION=ap-southeast-1" >> .env.local   # ganti jika project bukan Singapore

pnpm migrate:pooler                          # ← apply 001..009 via pooler IPv4
cat .migration-run.log                       # expect: All migrations OK + detect_stress, compute_anomaly_z
```

Runner generic `infra/scripts/run_migrations.mjs` mendukung:
- `pnpm migrate` — semua migrations (001..009)
- `pnpm migrate -- --only 009` — single file
- `pnpm migrate -- --from 005` — dari 005 ke akhir
- `pnpm migrate:pooler` — auto-rewrite URL direct → `aws-0-<region>.pooler.supabase.com:5432`

**Region pooler:** cek di Supabase Dashboard → Project Settings → General → Region. Set di `.env.local`:
```
SUPABASE_REGION=ap-southeast-1   # Singapore (default)
# atau: us-east-1, eu-central-1, dll
```

**Alternatif:** copy connection string Session Pooler langsung dari dashboard ke `.env.local`:
```
SUPABASE_DB_URL=postgresql://postgres.PROJECT:PWD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```
lalu jalankan `pnpm migrate` (tanpa `:pooler`).

**Error umum:**
| Error | Solusi |
|---|---|
| `password authentication failed` | Reset password di Supabase Dashboard → Database; update `.env.local` (encode `@` → `%40`) |
| `relation "vegetation_indices" does not exist` | Order salah — jalankan `pnpm migrate` (full) bukan `:009` saja |
| `ENETUNREACH` (IPv6) | Pakai `pnpm migrate:pooler` |
| Timeout | VPN/firewall — cek `nc -zv aws-0-ap-southeast-1.pooler.supabase.com 5432` |

**Seed kabupaten:**
```bash
# 1. download GeoJSON (sudah dijalankan, hasil ada di infra/data/)
node infra/scripts/fetch_kabupaten.mjs

# 2. insert ke DB
SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... \
  node infra/scripts/seed_kabupaten.mjs

# verify
psql "$SUPABASE_DB_URL" -c "SELECT id, kode_bps, nama FROM kabupaten ORDER BY kode_bps;"
# → 14 rows
```

---

## ✅ Phase 5 — REST API (Done dgn dummy data)

**8 endpoints (Vercel Functions, signature `export function GET(request)`):**

| Path | Query | Output |
|---|---|---|
| `GET /api/kabupaten` | `?id=…` atau `?format=geojson` | list 14 / single / FeatureCollection |
| `GET /api/indices` | `?kabupaten=…&index=ndvi&from=&to=` | time-series 10-hari composite |
| `GET /api/alerts` | `?kabupaten=&type=&severity=` | array alerts sorted desc |
| `GET /api/yield` | `?kabupaten=…&season=2026-MT1` | estimasi panen |
| `GET /api/landcover` | `?kabupaten=…&date=` | distribusi tutupan lahan |
| `GET /api/disease-risk` | `?kabupaten=…` | gabung Open-Meteo + NDMI satelit |
| `GET /api/composite-meta` | `?kabupaten=…` | list composite tersedia (untuk date slider) |
| `GET /api/tile/[index]` | `?date=&z=&x=&y=` | tile PNG (stub, Phase 3) |

**Response envelope:** `{ success, data, meta? }` atau `{ success: false, error }`.

**Disease risk endpoint** sudah port `computeCumulativeMetrics()` dari `soil-moisture-dashboard/api/weather.js` lines 41–95, ditambah faktor satelit NDMI canopy moisture (boost blast +1 level kalau `ndmi_p10 < 0.1`).

**Cara test lokal:**
```bash
# install root deps
pnpm install

# smoke test langsung via Node (tanpa vercel dev)
node -e "
import('./api/kabupaten.js').then(async m => {
  const res = await m.GET(new Request('http://x/api/kabupaten'));
  console.log(await res.json());
});
"

# atau full Vercel preview (install vercel CLI dulu)
npm i -g vercel@latest
vercel dev   # port 3000
curl http://localhost:3000/api/disease-risk?kabupaten=pontianak | jq
```

---

## ✅ Phase 6 — Mobile-First Frontend (Done MVP)

**Tech:** Vite + React 18 + TypeScript + Tailwind + MapLibre GL + Chart.js + React Query + Zustand + vite-plugin-pwa.

**File yang dibuat (`web/src/`):**
```
components/
  AppShell.tsx              bottom-nav mobile / sidebar desktop
  MapView.tsx               MapLibre map + 14 kabupaten polygon overlay + raster tile layer
  LayerSwitcher.tsx         FAB ganti indeks NDVI/NDWI/MNDWI/NDMI/MSI/EVI
  DateSlider.tsx            range slider composite date
  KabupatenSheet.tsx        bottom-sheet (mobile) / sidebar (desktop) detail kabupaten
  IndexTimeseries.tsx       Chart.js line chart dgn p10-p90 band
  DiseaseRiskBadge.tsx      badge low/med/high
  YieldCard.tsx             estimasi panen
  AlertList.tsx             list alert dgn ikon emoji
  LandcoverDonut.tsx        donut chart custom SVG
pages/
  MapPage.tsx               full-screen map + overlay
  DashboardPage.tsx         detail per-kabupaten + selector
  AlertsPage.tsx            filter type + severity
  AboutPage.tsx             info versi
hooks/
  useKabupaten.ts, useApi.ts   React Query wrappers
store/
  mapStore.ts               Zustand: selected kabupaten, active index, composite date, sheet open
lib/
  api.ts                    fetch wrapper + envelope unwrap
  types.ts                  TS types semua entitas
```

**Build sudah hijau:**
```
dist/index-Bx7s3zjM.js      56 kB  (17 gzip)
dist/react-CHRRA-kZ.js     164 kB  (53 gzip)
dist/chart-BwIVwkgd.js     164 kB  (57 gzip)
dist/maplibre-C3OIpWBo.js  801 kB  (217 gzip)
dist/index-1yqeY7ny.css     80 kB  (12 gzip)
```

**PWA:** service worker (Workbox) auto-cache:
- tile XYZ → CacheFirst 7 hari
- /api/kabupaten → StaleWhileRevalidate
- /api/* lainnya → NetworkFirst (timeout 5s)

**Cara coba lokal:**
```bash
cd web
pnpm install
pnpm dev          # http://localhost:5173 — proxy /api ke localhost:3000
# atau:
pnpm build && pnpm preview --port 5174
```

---

## ✅ Phase 2 — Python ETL openEO (Implemented)

**Lokasi:** `workers/etl/`
**Bahasa:** Python 3.11+
**Sumber data:** Copernicus Data Space Ecosystem (CDSE) openEO

### Yang sudah ada (skeleton)
| File | Status |
|---|---|
| `pyproject.toml` | ✅ deps tertulis (openeo, rasterio, rio-cogeo, geopandas, supabase, click) |
| `main.py` | ✅ CLI shell (click) dgn 3 sub-command: composite, batch-all, baseline |
| `indices.py` | ✅ formula 6 indeks NDVI/NDWI/MNDWI/NDMI/MSI/EVI sebagai openEO ops |
| `cloudmask.py` | ✅ SCL mask (kelas 3, 8, 9, 10, 11 ditolak) |
| `openeo_pipeline.py` | ✅ `build_composite()` — 6 batch jobs per window |
| `storage.py` | ✅ `upload_cog()`, `insert_composite_row()`, anomaly_z RPC |
| `stats.py` | ✅ `compute_index_stats()` |
| `kabupaten.py` | ✅ `bbox_for()` via shapely |
| `yield.py` | ✅ `train_yield_v0()` linreg-v0 |

### Setup
```bash
# install uv (kalau belum)
curl -LsSf https://astral.sh/uv/install.sh | sh

cd workers/etl
uv sync                         # buat .venv + install deps

# register OAuth client di CDSE
# https://dataspace.copernicus.eu → Settings → Personal Access Tokens (atau create OAuth client)
cp ../../.env.example .env
# isi CDSE_CLIENT_ID, CDSE_CLIENT_SECRET
# isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# dry-run (tidak submit batch job)
uv run python main.py composite \
  --kabupaten pontianak \
  --start 2026-04-01 --end 2026-04-10 \
  --dry-run
```

### Tugas implementasi penuh (Phase 2 sebenarnya)

**1. `openeo_pipeline.build_composite(req)`** — bangun datacube + submit batch:
```python
def build_composite(req: CompositeRequest):
    import openeo
    from indices import INDEX_FUNCTIONS
    from cloudmask import mask_clouds
    from kabupaten import bbox_for

    conn = connect()
    bbox = bbox_for(req.kabupaten_id)  # {west, south, east, north}

    cube = conn.load_collection(
        S2_COLLECTION,
        spatial_extent=bbox,
        temporal_extent=[req.start_date, req.end_date],
        bands=S2_BANDS,
        max_cloud_cover=req.max_cloud_cover,
    )
    cube = mask_clouds(cube)

    # Reduce temporal — 10-day median composite
    cube = cube.reduce_dimension(dimension="t", reducer="median")

    # Hitung 6 indeks → satu datacube per indeks
    results = {}
    for name, fn in INDEX_FUNCTIONS.items():
        idx_cube = fn(cube)
        results[name] = idx_cube

    # Submit batch jobs (1 per indeks — atau merge jadi 1 multiband)
    jobs = []
    for name, idx_cube in results.items():
        job = idx_cube.save_result(format="GTiff").create_job(
            title=f"{req.kabupaten_id}-{name}-{req.end_date}"
        )
        jobs.append((name, job))

    return jobs
```

**2. `storage.upload_cog()`** — cek COG validity + upload:
```python
def upload_cog(local_path: Path, remote_path: str) -> str:
    import rasterio
    from rio_cogeo.cogeo import cog_translate, cog_info
    from rio_cogeo.profiles import cog_profiles

    cog_path = local_path.with_suffix(".cog.tif")
    cog_translate(
        str(local_path), str(cog_path),
        cog_profiles.get("deflate"),
        in_memory=False,
        quiet=True,
    )

    client = get_supabase_client()
    with cog_path.open("rb") as f:
        client.storage.from_(BUCKET).upload(
            path=remote_path,
            file=f.read(),
            file_options={"content-type": "image/tiff", "upsert": "true"},
        )
    return remote_path
```

**3. `stats.compute_index_stats(cog_path)`** — extract statistik:
```python
def compute_index_stats(cog_path: Path) -> dict:
    import rasterio, numpy as np
    with rasterio.open(cog_path) as src:
        data = src.read(1, masked=True)
    valid = data.compressed()
    if valid.size == 0:
        return {"mean": None, ...}
    return {
        "mean": float(valid.mean()),
        "p10":  float(np.percentile(valid, 10)),
        "p50":  float(np.percentile(valid, 50)),
        "p90":  float(np.percentile(valid, 90)),
        "std":  float(valid.std()),
        "area_clear_pct": float(100 * valid.size / data.size),
    }
```

**4. `storage.insert_composite_row()`** — Postgres upsert:
```python
def insert_composite_row(kabupaten_id, period_start, period_end, cog_paths, scl_clear_pct, indices_stats):
    client = get_supabase_client()
    client.table("sentinel_composites").upsert({
        "kabupaten_id": kabupaten_id,
        "period_start": period_start,
        "period_end": period_end,
        "cog_paths": cog_paths,
        "scl_clear_pct": scl_clear_pct,
        "indices_stats": indices_stats,
        "status": "completed",
        "scene_count": indices_stats.get("scene_count"),
    }, on_conflict="kabupaten_id,period_start,period_end").execute()

    # Flatten ke vegetation_indices
    obs_date = midpoint_date(period_start, period_end)
    for index_name, stats in indices_stats.items():
        client.table("vegetation_indices").upsert({
            "kabupaten_id": kabupaten_id,
            "observation_date": obs_date,
            "index_name": index_name,
            **stats,
        }, on_conflict="kabupaten_id,observation_date,index_name").execute()
```

**5. `main.composite()` — orchestrator lengkap:**
```python
def composite(kabupaten, start, end, upload, dry_run):
    from openeo_pipeline import CompositeRequest, build_composite
    from storage import upload_cog, insert_composite_row
    from stats import compute_index_stats
    import tempfile, time

    req = CompositeRequest(kabupaten, start, end)
    if dry_run:
        log.info("dry-run: %s", req); return

    jobs = build_composite(req)
    cog_paths, indices_stats = {}, {}
    for name, job in jobs:
        job.start_job()
        while True:
            status = job.status()
            log.info("%s job %s: %s", name, job.job_id, status)
            if status in ("finished", "error"): break
            time.sleep(20)
        if status == "error":
            raise RuntimeError(f"openEO job failed: {job.logs()}")

        with tempfile.NamedTemporaryFile(suffix=".tif") as tmp:
            job.get_results().download_file(tmp.name)
            stats = compute_index_stats(Path(tmp.name))
            indices_stats[name] = stats
            if upload:
                remote = f"composites/{kabupaten}/{end}/{name}.tif"
                cog_paths[name] = upload_cog(Path(tmp.name), remote)

    if upload:
        scl_clear_pct = indices_stats["ndvi"].get("area_clear_pct")
        insert_composite_row(kabupaten, start, end, cog_paths, scl_clear_pct, indices_stats)
        log.info("✓ composite uploaded + inserted")
```

**6. Baseline historical (sekali jalan):**
```python
@cli.command()
@click.option("--years", default="2019,2020,2021,2022,2023")
def baseline(years):
    """Build mean/std NDVI per Day-of-Year per kabupaten."""
    # Loop 5 tahun × 14 kabupaten × 366 DOY
    # Aggregate ke index_baselines table
    # ETA: ~12 jam batch jobs CDSE (free quota)
```

### Tips eksekusi Phase 2
- **CDSE free tier quota:** ~5 batch jobs/jam. Strategi: tunda 5 menit antar kabupaten, retry exponential dgn `tenacity`.
- **Musim awan Kalbar (Sep-Apr):** banyak pixel awan → `scl_clear_pct < 30%` skip composite, fallback ke window 20-hari.
- **Memory rasterio:** untuk full Kalbar (~3000 km²) per kabupaten 10 m resolusi → tile size 10240×10240 px = 400 MB float32. Pakai `windowed read` atau downsample ke 30 m.
- **Testing:** mulai dari kabupaten kecil (Kota Pontianak ~107 km², ~10 menit batch job) sebelum Ketapang (terbesar).

### Trigger GitHub Actions
File `.github/workflows/etl.yml` sudah siap:
```bash
# satu kabupaten via UI atau gh CLI
gh workflow run etl.yml -f kabupaten=pontianak -f period=last-10d

# semua kabupaten (default cron)
gh workflow run etl.yml -f period=last-10d
```

Set secrets di GH repo: `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## ✅ Phase 3 — TiTiler Tile Serving (scaffold + API proxy)

**Tujuan:** render COG dari Supabase Storage jadi XYZ tile PNG dgn colormap on-the-fly.

### Pilihan deploy
| Provider | Free tier | Kelebihan |
|---|---|---|
| Fly.io | 3 shared-cpu-1x VM 256 MB | gratis, region SG dekat ke Indonesia |
| Render | 750 jam/bulan free | mudah deploy via git |
| Cloud Run | 2M req/bulan | scale-to-zero, region asia-southeast2 |

**Rekomendasi:** Fly.io (latensi terbaik dari Indonesia).

### Setup TiTiler di Fly.io

**1. Buat folder `workers/titiler/`:**
```dockerfile
# workers/titiler/Dockerfile
FROM ghcr.io/developmentseed/titiler:latest
ENV PORT=8000
EXPOSE 8000
CMD ["uvicorn", "titiler.application.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**2. fly.toml:**
```toml
app = "opt-padi-titiler"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

**3. Deploy:**
```bash
cd workers/titiler
fly launch --no-deploy
fly secrets set AWS_NO_SIGN_REQUEST=YES   # untuk akses publik
fly deploy
# URL: https://opt-padi-titiler.fly.dev
```

**4. Update Vercel function `api/tile/[index].js`** ganti stub dgn proxy:
```js
import { preflight } from '../_lib/response.js';

const TITILER = process.env.TITILER_BASE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;

export function OPTIONS() { return preflight(); }

export async function GET(request) {
  const url = new URL(request.url);
  const index = url.pathname.split('/').at(-1).replace('.png', '');
  const date = url.searchParams.get('date');
  const kabupaten = url.searchParams.get('kabupaten');
  const z = url.searchParams.get('z');
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');

  const cogUrl = `${SUPABASE_URL}/storage/v1/object/public/composites/${kabupaten}/${date}/${index}.tif`;
  const rescale = { ndvi: '-0.2,0.9', ndwi: '-0.5,0.5', mndwi: '-0.5,0.8',
                     ndmi: '-0.5,0.5', msi: '0.0,2.0', evi: '-0.2,0.9' }[index];
  const colormap = { ndvi: 'rdylgn', ndwi: 'brbg', mndwi: 'blues',
                      ndmi: 'rdbu', msi: 'viridis', evi: 'rdylgn' }[index];

  const titilerUrl = `${TITILER}/cog/tiles/WebMercatorQuad/${z}/${x}/${y}.png?url=${encodeURIComponent(cogUrl)}&rescale=${rescale}&colormap_name=${colormap}`;
  const res = await fetch(titilerUrl);
  return new Response(res.body, {
    status: res.status,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, immutable'
    }
  });
}
```

**5. Verifikasi:** buka MapLibre, ganti `sentinel-tiles` source ke URL tile baru. Pastikan zoom 6–14 render.

---

## ✅ Phase 4 — Analytics Modules (API + SQL, fallback dummy)

Endpoint membaca Supabase jika ada data; fallback ke dummy jika DB kosong / env belum di-set.

**SQL analytics (`009_analytics.sql`):** `detect_stress()`, `compute_anomaly_z()` — dipanggil dari ETL (`storage.insert_composite_row`). **Belum aktif di DB** sampai migrasi 009 dijalankan manual (lihat Phase 1 troubleshooting).

### Tugas

**1. Migrasi endpoint `/api/indices.js` ke Supabase:**
```js
import { supabaseAnon } from './_lib/supabase.js';

export async function GET(request) {
  const q = getQuery(request);
  const id = kabupatenIdSchema.parse(q.kabupaten);
  const index = indexNameSchema.parse(q.index ?? 'ndvi');
  const from = q.from ?? defaultFrom();
  const to = q.to ?? today();

  const sb = supabaseAnon();
  const { data, error } = await sb
    .from('vegetation_indices')
    .select('observation_date, mean, p10, p50, p90, std, anomaly_z, area_clear_pct')
    .eq('kabupaten_id', id)
    .eq('index_name', index)
    .gte('observation_date', from)
    .lte('observation_date', to)
    .order('observation_date');
  if (error) return fail(500, error);

  return ok(data, { count: data.length, source: 'sentinel' });
}
```

**2. Stress detection (`/api/alerts` background):**
```sql
-- function di Postgres, dipanggil setiap composite baru
CREATE OR REPLACE FUNCTION detect_stress(p_kab text)
RETURNS void AS $$
DECLARE
  recent_z real[];
BEGIN
  SELECT array_agg(anomaly_z ORDER BY observation_date DESC)
  INTO recent_z
  FROM vegetation_indices
  WHERE kabupaten_id = p_kab AND index_name='ndvi'
  ORDER BY observation_date DESC LIMIT 2;

  IF recent_z[1] < -1.5 AND recent_z[2] < -1.5 THEN
    INSERT INTO alerts (kabupaten_id, type, severity, started_at, payload)
    VALUES (p_kab, 'stress', 'med', NOW(),
            jsonb_build_object('z_scores', recent_z))
    ON CONFLICT DO NOTHING;
  END IF;
END
$$ LANGUAGE plpgsql;
```

**3. Drought combine signals:** gabung NDVI z-score + NDMI p50 + Open-Meteo 30-hari precipitation di endpoint atau worker.

**4. Flood:** MNDWI > 0.3 di pixel class "cropland" → simpan area_ha banjir di `alerts.payload`.

**5. Land cover import:** lewat openEO load_collection `ESA_WORLDCOVER_10M_2021_V200` → reduce_spatial → klasifikasi area per kabupaten → insert `landcover` table.

**6. Yield regresi linear v0:**
```python
# workers/etl/yield.py
import numpy as np
from supabase import create_client

def train_yield_v0():
    client = create_client(...)
    # join bps_yield_reference + vegetation_indices (NDVI peak per season)
    bps = client.table('bps_yield_reference').select('*').execute().data
    # ... fetch NDVI peak per kabupaten per season
    # X = NDVI_peak, EVI_grain_filling, area_sawah_ha
    # y = ton_produksi
    coef, intercept = np.linalg.lstsq(X, y, rcond=None)[:2]
    # Save coef ke yield_model table (atau hardcode di endpoint)
```

Endpoint `/api/yield` baca dari `yield_estimates` table (worker populate setiap akhir musim tanam).

---

## 🟡 Phase 7 — Deploy & Observability (partial)

### Vercel

```bash
# install CLI (versi terbaru per session-startup)
npm i -g vercel@latest

cd /home/abdum/opt-padi-kalbar

# link project (sudah ada .vercel/ — cek dulu)
vercel link

# set env vars (di dashboard atau CLI)
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add TITILER_BASE_URL production
vercel env add CRON_SECRET production

# deploy preview
vercel

# deploy production
vercel --prod
```

### Supabase RLS verify

Semua tabel sudah punya policy `... FOR SELECT USING (true)` (public read). Verifikasi:
```bash
psql "$SUPABASE_DB_URL" -c "
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies WHERE schemaname='public';"
# Harus list 8 policies (1 per tabel)
```

### Observability

**Sentry (frontend):** sudah di-wire di `web/src/main.tsx` (aktif jika `VITE_SENTRY_DSN` di-set). Dep: `@sentry/react`.

**Vercel function logs:** sudah otomatis di Vercel dashboard → Deployments → Functions tab.

**Uptime ping:** BetterUptime / UptimeRobot free hit `/api/kabupaten` setiap 5 menit.

### Smoke test production

```bash
BASE=https://opt-padi-kalbar.vercel.app

curl -fsS $BASE/api/kabupaten | jq '.data | length'              # expect 14
curl -fsS "$BASE/api/disease-risk?kabupaten=pontianak" | jq '.data.risk'
curl -fsS "$BASE/api/indices?kabupaten=sambas&index=ndvi" | jq '.meta.count'

# Lighthouse PWA
npx lighthouse $BASE --preset=desktop --only-categories=performance,pwa
# Mobile
npx lighthouse $BASE --form-factor=mobile --only-categories=performance,pwa
# Target: PWA ≥90, Performance ≥80
```

---

## 🔒 Phase 8 — Auth Multi-Role (Deferred)

Skema sudah siap (`alerts.created_by uuid`, dst). Saat butuh:

1. Aktifkan Supabase Auth (email + Google OAuth)
2. Ubah RLS policies dari `USING (true)` ke role-based:
   ```sql
   CREATE POLICY alerts_write_admin ON alerts FOR INSERT
     WITH CHECK (auth.jwt() ->> 'role' = 'admin_dinas');
   ```
3. Tambah halaman `/login`, `/admin/upload-parsel` di frontend
4. Tambah role custom claim via Supabase Edge Function

---

## Cara Eksekusi Lengkap dari Nol

Skenario: di mesin baru, dari clone repo sampai live.

```bash
# 1. Clone & install
git clone <repo-url> opt-padi-kalbar
cd opt-padi-kalbar
pnpm install
cd web && pnpm install && cd ..

# 2. Setup Supabase project
# - Buat project baru di https://supabase.com
# - Copy URL + anon key + service_role key ke .env.local
# - Aktifkan PostGIS extension di Database → Extensions

cp .env.example .env.local
# edit .env.local — WAJIB: SUPABASE_DB_URL=postgresql://... (encode @ di password → %40)

# 3. Run migrations (paling andal di WSL: pooler IPv4)
pnpm install
echo "SUPABASE_REGION=ap-southeast-1" >> .env.local
pnpm migrate:pooler
# atau via psql langsung kalau punya IPv6:
# for f in infra/migrations/00{1..9}_*.sql; do psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done

# 4. Seed kabupaten
node infra/scripts/fetch_kabupaten.mjs
node infra/scripts/seed_kabupaten.mjs

# 5. Test API + frontend lokal dgn dummy data
vercel dev   # one terminal: localhost:3000
cd web && pnpm dev   # other terminal: localhost:5173 (proxy /api ke 3000)

# 6. (Opsional) Setup ETL Python
cd workers/etl
uv sync
# register OAuth client di CDSE, isi .env
uv run python main.py composite --kabupaten pontianak --start 2026-04-01 --end 2026-04-10 --dry-run

# 7. (Opsional) Deploy TiTiler ke Fly.io
# lihat section Phase 3

# 8. Deploy Vercel
vercel env add SUPABASE_URL production
# ... env lainnya
vercel --prod

# 9. Setup GH Actions secrets
gh secret set CDSE_CLIENT_ID
gh secret set CDSE_CLIENT_SECRET
gh secret set SUPABASE_URL
gh secret set SUPABASE_SERVICE_ROLE_KEY

# 10. Trigger first ETL run
gh workflow run etl.yml -f kabupaten=pontianak

# 11. Monitor
# - Vercel dashboard → Deployments
# - Supabase dashboard → Database → Tables
# - GH Actions → workflows runs
```

---

## File Penting Per Phase

| Phase | File Kritis |
|---|---|
| 0 | `package.json`, `vercel.json`, `.env.example`, `web/vite.config.ts` |
| 1 | `infra/migrations/00{1..9}_*.sql`, `infra/scripts/run_migration_009.mjs`, `.env.local` |
| 2 | `workers/etl/openeo_pipeline.py`, `storage.py`, `stats.py`, `main.py` |
| 3 | `workers/titiler/Dockerfile`, `fly.toml`, `api/tile/[index].js` |
| 4 | `api/indices.js`, `api/alerts.js`, `workers/etl/yield.py`, SQL stored functions |
| 5 | `api/*.js`, `api/_lib/*.js` |
| 6 | `web/src/components/*.tsx`, `pages/*.tsx`, `hooks/*.ts`, `store/mapStore.ts` |
| 7 | `vercel.json`, `web/src/main.tsx` (Sentry), `.github/workflows/etl.yml` |

---

## Catatan Penting

- **Migrations belum ter-apply:** `pnpm migrate:pooler` belum dijalankan sukses (IPv6 ENETUNREACH terakhir). Jalankan dari terminal WSL user — agent shell kadang tidak bisa keluar IPv4 ke Supabase pooler dengan andal.
- **`.env.local` untuk migrate:** wajib format `SUPABASE_DB_URL=postgresql://...`. Password `@` di-encode `%40`. Tambahkan `SUPABASE_REGION=ap-southeast-1` (atau region project) supaya pooler conversion benar.
- **Smoke test:** `pnpm smoke` jalankan 9 endpoint langsung via Node `Request` — tidak butuh `vercel dev`. Cocok di CI atau pre-commit.
- **Dummy data deterministic:** `api/_lib/dummy.js` pakai seeded random (hash kabupaten_id). Reload bertubi-tubi tampilan tetap sama. Cocok utk demo.
- **Open-Meteo dipakai real:** `/api/disease-risk` benar-benar fetch cuaca live ke `api.open-meteo.com`. Cukup test fungsi epidemiologi tanpa ETL.
- **MapLibre tile XYZ:** sumber OSM standar (`tile.openstreetmap.org`). Layer NDVI overlay sekarang return PNG transparan (Phase 3 nanti diisi).
- **PWA install:** Chrome Mobile → menu → "Add to Home screen". Service worker cache aset + tile, app jalan offline (degraded — hanya data ter-cache).
- **Tidak ada Vercel CLI di mesin user saat ini:** `npm i -g vercel@latest` dulu utk `vercel dev` & deploy.
- **Bundle MapLibre 801 kB** wajar — ini library terbesar. Kalau perlu dikurangi: lazy-load via React.lazy(() => import('./components/MapView')) di route MapPage saja.

---

## Kontak Pengembangan

Plan asli + keputusan teknis: `.claude/plans/streamed-imagining-thunder.md`
Riset sumber: lihat section "Sumber Riset" di plan.
Pertanyaan: `ARCHITECTURE.md` punya gambar arsitektur ASCII.
