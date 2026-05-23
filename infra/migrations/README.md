# Migrations

Jalankan berurutan:

```bash
export SUPABASE_DB_URL='postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'

for f in infra/migrations/0{01..9}_*.sql; do
  echo "→ $f"
  psql "$SUPABASE_DB_URL" -f "$f"
done
```

| # | File | Buat |
|---|---|---|
| 001 | postgis | extension PostGIS + uuid-ossp |
| 002 | kabupaten | tabel 14 kab/kota dgn geom MultiPolygon |
| 003 | sentinel_composites | metadata composite Sentinel-2 |
| 004 | vegetation_indices | time-series statistik NDVI/NDWI/MNDWI/NDMI/MSI/EVI + baseline DOY |
| 005 | alerts | alert stres/banjir/kekeringan/penyakit |
| 006 | yield_estimates | estimasi panen + tabel referensi BPS |
| 007 | landcover | ESA WorldCover + Dynamic World |
| 008 | seed_rpc | RPC `upsert_kabupaten()` utk seeder |
| 009 | analytics | `detect_stress()`, `compute_anomaly_z()` |

Lalu seed:

```bash
node infra/scripts/fetch_kabupaten.mjs   # download GeoJSON ke infra/data/
node infra/scripts/seed_kabupaten.mjs    # insert ke tabel kabupaten

# verifikasi
psql "$SUPABASE_DB_URL" -c "SELECT id, kode_bps, nama, ST_NPoints(geom) FROM kabupaten ORDER BY kode_bps;"
# Harus 14 baris
```

## Rollback

Migrasi ini idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`). Untuk rollback total:

```sql
DROP TABLE IF EXISTS landcover, landcover_classes, yield_estimates, bps_yield_reference,
                     alerts, vegetation_indices, index_baselines, sentinel_composites, kabupaten CASCADE;
DROP TYPE  IF EXISTS alert_type, alert_severity;
DROP FUNCTION IF EXISTS upsert_kabupaten, touch_updated_at;
```
