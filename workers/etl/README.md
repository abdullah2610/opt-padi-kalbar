# Sentinel-2 ETL Worker

Pipeline Python untuk mengambil citra Sentinel-2 L2A via Copernicus Data Space Ecosystem (openEO),
menghitung indeks vegetasi (NDVI, NDWI, MNDWI, NDMI, MSI, EVI), simpan COG ke Supabase Storage,
dan agregat statistik per kabupaten ke Postgres.

## Setup

```bash
# install uv kalau belum
curl -LsSf https://astral.sh/uv/install.sh | sh

# install deps
uv sync

# masuk lingkungan
source .venv/bin/activate

# env
cp ../../.env.example .env
# isi CDSE_CLIENT_ID, CDSE_CLIENT_SECRET, SUPABASE_*
```

## Cara pakai

```bash
# Single kabupaten, satu composite window
uv run python main.py composite \
  --kabupaten pontianak \
  --start 2026-04-01 --end 2026-04-10 \
  --upload

# Dry-run (tidak upload)
uv run python main.py composite --kabupaten sambas --start 2026-04-01 --end 2026-04-10

# Semua kabupaten, 10 hari terakhir
uv run python main.py batch-all --period last-10d --upload
```

## GitHub Actions Cron

Trigger harian via `.github/workflows/etl.yml` — scan apakah ada scene Sentinel-2 baru per kabupaten dan composite kalau cukup pixel bersih.

## Output

1. `composites/{kabupaten}/{YYYY-MM-DD}/ndvi.tif` (COG di Supabase Storage)
2. Row di tabel `sentinel_composites` (metadata: cog_path, scl_clear_pct, indices_stats)
3. Row di tabel `vegetation_indices` (mean, p10, p50, p90, std per index per kabupaten per tanggal)

## Modul

| File | Tujuan |
|---|---|
| `main.py` | CLI (click) — entrypoint |
| `openeo_pipeline.py` | openEO connection + process graph builder + batch job orchestrator |
| `indices.py` | Formula NDVI/NDWI/MNDWI/NDMI/MSI/EVI sebagai openEO datacube ops |
| `cloudmask.py` | SCL cloud mask (kelas 3, 8, 9, 10, 11 ditolak) |
| `storage.py` | Upload COG → Supabase Storage, insert row → Postgres |
| `stats.py` | Hitung statistik raster (mean, p10, p50, p90, std) dengan rasterio |
| `kabupaten.py` | Loader GeoJSON 14 kab/kota + bbox helper |
