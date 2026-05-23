# Baseline Historical NDVI 5 Tahun

Workflow membangun baseline anomaly detection (z-score) untuk 14 kabupaten × 6 indices × DOY buckets.

## Apa yang sudah diimplementasi

### Code

| File | Perubahan |
|---|---|
| `workers/etl/main.py` | + `backfill` command (submit historical composites N tahun) |
| `workers/etl/main.py` | `baseline` command: 6 indices (bukan NDVI-only), DOY bucketing, min_samples filter |
| `infra/migrations/010_baseline_buckets.sql` | Fix bug `compute_anomaly_z` (var shadow `doy = doy`), DOY bucket helper, baseline_summary view |

### Database (sudah applied)

- `index_baselines (kabupaten_id, index_name, doy, mean, std, sample_count)` — sudah dari migration 004
- `doy_bucket(p_doy int)` → DOY → midpoint 10-day bucket (1-10 → 5, 11-20 → 15, ...)
- `doy_bucket_from_date(p_date date)` → convenience
- `compute_anomaly_z(p_kab, p_index, p_obs_date, p_mean)` → fixed + bucket lookup + ±20 day fallback
- `baseline_summary` view → ringkasan per kabupaten + index

## Workflow Eksekusi

### Step 1 — Backfill historical composites

```bash
cd workers/etl

# Demo: 1 kabupaten (Pontianak terkecil), 1 tahun
uv run python main.py backfill --years 2025 --kabupaten pontianak
# → 12 composites × 6 indices = 72 batch jobs CDSE
# → ~14 jam quota free tier (~5 jobs/jam)

# Production: 14 kabupaten × 5 tahun
uv run python main.py backfill --years 2021,2022,2023,2024,2025
# → 14 × 5 × 12 = 840 composites × 6 = 5040 jobs
# → ~1000 jam (~42 hari) CDSE free → butuh paid tier atau split multi-session

# Stratagi praktis: per-kabupaten + per-tahun, multi-day session
for year in 2025 2024 2023 2022 2021; do
  for kab in pontianak singkawang kayong-utara mempawah landak sambas bengkayang \
             sanggau sintang kapuas-hulu sekadau melawi kubu-raya ketapang; do
    uv run python main.py backfill --years $year --kabupaten $kab
    sleep 600   # 10 min cooldown antar kabupaten
  done
done
```

### Step 2 — Aggregate ke baseline

```bash
# Setelah vegetation_indices terisi untuk tahun-tahun target:
uv run python main.py baseline --years 2021,2022,2023,2024,2025

# Output:
# ✓ baseline upserted N total bucket rows
```

Per kabupaten × index → ~36 DOY buckets (kalau data lengkap full year). Min samples 2 (default) untuk filter bucket dengan data terlalu sedikit.

### Step 3 — Verifikasi

```bash
# Cek baseline_summary view
psql "$PG_URL" -c "SELECT * FROM baseline_summary ORDER BY kabupaten_id, index_name;"

# Cek z-score otomatis terhitung untuk composite terbaru
# Buka /api/indices?kabupaten=pontianak&index=ndvi → field `anomaly_z` harus terisi (bukan null)
```

### Step 4 — Update rolling per tahun

Awal tiap tahun (Jan), backfill tahun yang baru selesai + re-aggregate dengan window 5 tahun shifted:

```bash
# Misal awal 2027:
uv run python main.py backfill --years 2026
uv run python main.py baseline --years 2022,2023,2024,2025,2026   # drop 2021, add 2026
```

## Optimasi

### Cuaca Kalbar — skip cloudy months

Musim hujan Kalbar Sep–Apr. Composite di periode itu sering `scl_clear_pct < 30%` → ETL skip insert.

Strategi: prioritas backfill bulan **Apr–Sep** (musim kering), data lebih reliable:

```bash
uv run python main.py backfill --years 2025 --start-month 4 --end-month 9
# 6 bulan × 1 = 6 composites/kab/tahun = ~50% waktu
```

### Hemat CDSE quota — 1 indeks dulu

ETL fetch ke 6 indeks. Untuk MVP baseline, mulai dengan NDVI saja (yang dipakai `detect_stress`):

Tweak `workers/etl/indices.py` — temp override INDEX_FUNCTIONS hanya `{"ndvi": ...}` saat backfill. Reduce jobs 6× → quota 6× lebih cepat.

### CDSE tier upgrade

Free tier ~5 jobs/jam. Paid tier (€0.30/scene) bisa puluhan paralel. Untuk backfill 5 tahun × 14 kab dalam 1-2 minggu, butuh paid.

## Konfigurasi compute_anomaly_z

DOY bucket lookup priority:
1. Exact bucket match (`doy = doy_bucket_from_date(obs_date)`)
2. Fallback ke bucket terdekat ±20 hari
3. NULL kalau tidak ada baseline

ETL pipeline call `compute_anomaly_z` saat insert vegetation_indices (di `storage.py`). Anomaly z otomatis terisi.

`detect_stress(p_kab)` trigger setelah insert: kalau 2 composite NDVI terakhir z < -1.5 → insert alert tipe `stress`, severity `med`.

## State Saat Ini

- ✅ Code lengkap di repo
- ✅ Migration 010 applied
- ❌ vegetation_indices historical 5 tahun **kosong** (cuma current week ada)
- ❌ index_baselines **kosong**
- ❌ z-score di vegetation_indices = NULL untuk semua row

Next action: run `backfill` untuk minimal 1 kabupaten + 1 tahun sebagai demo end-to-end.
