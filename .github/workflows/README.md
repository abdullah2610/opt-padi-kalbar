# GitHub Actions Workflows

3 workflow untuk otomasi ETL Sentinel-2 + baseline analytics.

## Workflows

| File | Trigger | Tujuan | Durasi |
|---|---|---|---|
| `etl.yml` | Daily 02:00 UTC + manual | Composite 10-hari terbaru semua 14 kab | ~5 jam |
| `backfill.yml` | Manual only | Historical composites multi-tahun | sampai 5 jam per run |
| `baseline.yml` | Monthly tanggal 1 + manual | Aggregate vegetation_indices → index_baselines | <30 menit |

## Setup Sekali (Required Secrets)

### 1. CDSE OAuth Client

Device flow (local dev) tidak bisa di CI. Wajib client credentials.

1. Login https://dataspace.copernicus.eu
2. Buka https://identity.dataspace.copernicus.eu/auth/realms/CDSE/account/clients
3. **Create Client** → nama bebas (e.g. `opt-padi-ci`)
4. Type: **Confidential** (atau Service Account)
5. Catat `client_id` + `client_secret` (secret cuma muncul sekali)

### 2. Supabase service role key

Dashboard https://supabase.com/dashboard/project/prrxzfmcgkwhrsuuiyox/settings/api-keys → copy `service_role` (secret).

### 3. Set GH Secrets

```bash
gh secret set CDSE_CLIENT_ID --body "sh-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
gh secret set CDSE_CLIENT_SECRET --body "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
gh secret set SUPABASE_URL --body "https://prrxzfmcgkwhrsuuiyox.supabase.co"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "eyJhbGciOiJI..."

# Verify
gh secret list
```

## Penggunaan

### Trigger manual

```bash
# Daily ETL — semua kab last-10d
gh workflow run etl.yml

# Daily ETL — 1 kabupaten saja
gh workflow run etl.yml -f kabupaten=pontianak

# Daily ETL — custom period
gh workflow run etl.yml -f period=2025-04-01:2025-04-30

# Backfill 1 tahun 1 kab (test)
gh workflow run backfill.yml -f years=2025 -f kabupaten=pontianak

# Backfill 5 tahun semua kab (LONG — split per kab disarankan)
gh workflow run backfill.yml -f years=2021,2022,2023,2024,2025 -f kabupaten=pontianak

# Build baseline (setelah backfill ada data)
gh workflow run baseline.yml

# Monitor
gh run list --workflow=etl.yml --limit 5
gh run watch
```

### Default Schedule

- `etl.yml` daily 02:00 UTC (09:00 WIB): composite last-10d semua 14 kab
- `baseline.yml` monthly tanggal 1 jam 04:00 UTC: aggregate vegetation_indices ke baseline

Pas Sentinel-2 revisit ~5 hari → composite 10-hari pasti dapat ≥1 scene per kab (kecuali cuaca buruk).

## Quota CDSE Free Tier

~5 batch jobs/jam = 120 jobs/hari per user.

- Daily ETL: 14 kab × 6 indices = 84 jobs → ~17 jam (fit GH Actions timeout 350 menit jika delay disesuaikan)
  → kalau timeout: split per-batch atau bump `ETL_KAB_DELAY_SEC` lebih panjang
- Backfill 1 tahun semua kab: 14 × 12 × 6 = 1008 jobs → ~10 hari → **split per-kabupaten** via workflow_dispatch loop

## Troubleshooting

### Secret missing
- Workflow gagal step "Verify secrets"
- Cek `gh secret list`. Re-set yang missing

### CDSE quota habis
- Job stuck di "Job created (progress 0%)" lama
- Bukti: openEO dashboard https://openeo.dataspace.copernicus.eu/processes
- Solusi: bump `ETL_KAB_DELAY_SEC` ke 600+, atau upgrade tier

### Storage 413 Payload Too Large
- Supabase Free 50 MB hard limit
- Solusi: naikkan `resolution_m` (default 100m). 60m = 36x bigger, 30m = 144x bigger.

### Timeout 350 menit
- Default cukup utk 14 kab dengan delay 180s + ~5 menit per job
- Kalau tetap timeout: kurangi scope (per-kab) atau bump `timeout-minutes` ke 360+

### compute_anomaly_z 400
- PostgREST schema cache stale setelah migration baru
- Solusi: SQL `NOTIFY pgrst, 'reload schema'` via Supabase SQL Editor

## Cara Test Workflow Tanpa Tunggu Cron

```bash
# Validate YAML lokal
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/etl.yml'))"

# Dry-run check workflow_dispatch input validation
gh workflow run etl.yml -f kabupaten='INVALID_$'  # harus fail di step Validate inputs

# Quick run 1 kab small (Pontianak) — verify pipeline end-to-end
gh workflow run etl.yml -f kabupaten=pontianak -f period=last-10d
gh run watch
```
