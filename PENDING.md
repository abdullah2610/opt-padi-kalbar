# Pending — opt-padi-kalbar

Daftar pekerjaan belum tuntas per 2026-05-23 sesi ke-4.

---

## 🔴 In Progress (Background)

### ETL batch-all 13 kab @100m
- **Task ID:** `b5z6a5mpn` (started 20:44)
- **Status:** ~7/13 kab selesai (Sambas, Bengkayang in progress)
- **ETA:** ~3-4 jam dari mulai (selesai ~24:00 WIB)
- **Output:** populate `sentinel_composites` + `vegetation_indices` untuk 13 kab dengan resample 100m
- **Verify:**
  ```bash
  node -e "import('postgres').then(async ({default:pg})=>{const fs=await import('fs');const e=fs.readFileSync('.env.local','utf8');const u=e.match(/SUPABASE_DB_URL=(.+)/)[1];const h=e.match(/SUPABASE_POOLER_HOST=(.+)/)[1];const m=u.match(/postgres:(.+)@db\\.([a-z0-9]+)\\./);const sql=pg('postgresql://postgres.'+m[2]+':'+m[1]+'@'+h+':5432/postgres',{ssl:'require',max:1});console.log(await sql\`SELECT kabupaten_id, status FROM sentinel_composites ORDER BY kabupaten_id\`);await sql.end();});"
  ```

---

## 🟡 Belum Dieksekusi (Code Siap)

### 1. Backfill historical 5 tahun untuk baseline NDVI
- **Code:** ✅ `workers/etl/main.py` baseline + backfill commands
- **SQL:** ✅ migration 010 applied
- **Data:** ❌ `vegetation_indices` historical kosong, `index_baselines` kosong
- **Cara jalankan** (setelah ETL batch-all #12 selesai):
  ```bash
  cd workers/etl

  # Demo 1 kab 1 tahun (~3 hari CDSE Free quota)
  uv run python main.py backfill --years 2025 --kabupaten pontianak

  # Production full (~40 hari Free / 1-2 minggu Paid)
  for year in 2025 2024 2023 2022 2021; do
    for kab in pontianak singkawang kayong-utara mempawah landak sambas \
               bengkayang sanggau sintang kapuas-hulu sekadau melawi \
               kubu-raya ketapang; do
      uv run python main.py backfill --years $year --kabupaten $kab
      sleep 600
    done
  done

  # Build baseline setelah backfill
  uv run python main.py baseline --years 2021,2022,2023,2024,2025
  ```
- **Optimasi:** skip cloudy months Sep-Apr, mulai musim kering Apr-Sep
- **Dampak setelah selesai:** z-score anomaly aktif, `detect_stress` trigger alert otomatis

### 2. GitHub Actions cron daily ETL
- **File:** `.github/workflows/etl.yml` sudah ada
- **Pending:** set secrets di GH repo
  ```bash
  gh secret set CDSE_CLIENT_ID -b "..."
  gh secret set CDSE_CLIENT_SECRET -b "..."
  gh secret set SUPABASE_URL -b "https://prrxzfmcgkwhrsuuiyox.supabase.co"
  gh secret set SUPABASE_SERVICE_ROLE_KEY -b "eyJ..."
  ```
- **Note:** CI butuh OAuth client credentials (device flow tidak bisa di CI)
- **Test:** `gh workflow run etl.yml -f period=last-10d`

### 3. CDSE OAuth Client (untuk CI)
- **Pending:** register OAuth client di CDSE dashboard
  - https://identity.dataspace.copernicus.eu/auth/realms/CDSE/account/clients
  - Create Client → catat CLIENT_ID + CLIENT_SECRET
- **Note:** local dev pakai device flow refresh token (tidak butuh ini)

### 4. Sentry DSN production
- **Code:** ✅ wired di `web/src/main.tsx`
- **Pending:** set `VITE_SENTRY_DSN` di Vercel env production
  ```bash
  vercel env add VITE_SENTRY_DSN production
  # value: https://...@sentry.io/...
  ```

---

## ⚪ Belum Diimplementasi (di ROADMAP.md)

### High Impact
- [ ] Auth multi-role (Phase 8) — Supabase Auth + RLS role-based
- [ ] Time-series comparison (overlay 2 tahun)
- [ ] Drill-down kecamatan (~170 polygons Kalbar)

### UX
- [ ] Compare mode split-screen 2 kabupaten
- [ ] Push notification PWA (Web Push API)
- [ ] Export PDF/CSV report per kabupaten

### Coverage
- [ ] Provinsi lain (Kalsel/Kaltim/Kalteng)
- [ ] Multi-musim tracking (MT1 vs MT2)

### ML
- [ ] Yield model v1 — XGBoost dengan features lengkap
- [ ] Disease ML classifier — Random Forest dengan label historis
- [ ] Plot-level detection 10m via `aggregate_spatial`

### Performance
- [ ] Lazy-load MapLibre (`React.lazy` di MapPage)
- [ ] Cloudflare CDN di depan TiTiler Fly.io
- [ ] Lighthouse audit + Web Vitals target

### Data Quality
- [ ] Cloud mask quality flag `outlier_pct`
- [ ] MODIS NDVI cross-check saat S2 awan
- [ ] Edge case handling composite empty

### Mobile
- [ ] GPS-aware auto-detect kabupaten user
- [ ] IndexedDB offline-first sync

### Quick Wins (1-2 jam each)
- [ ] Search kabupaten di selector
- [ ] Dark/light mode toggle
- [ ] Share URL deep-link (`/dashboard/pontianak?index=ndvi&date=...`)
- [ ] Skeleton loader
- [ ] Empty states ramah
- [ ] Tour mode (react-joyride)
- [ ] Keyboard shortcuts
- [ ] Print stylesheet A4

---

## 🐛 Known Issues

### 1. RPC `compute_anomaly_z` HTTP 400 di ETL log
- **Cause:** PostgREST schema cache (migration 010 belum reload saat ETL pertama submit)
- **Status:** ✅ Fixed — `NOTIFY pgrst, 'reload schema'` sudah dikirim
- **Verify next ETL run:** error 400 hilang. Saat ini z return NULL karena baseline kosong (expected).

### 2. ETL Pontianak first run @10m, kab lain @100m
- **Cause:** sebelum fix Supabase 50MB limit, Pontianak (small) sudah upload @10m sukses
- **Impact:** stats Pontianak lebih akurat tapi inkonsisten dengan 13 kab lain
- **Fix:** re-run Pontianak @100m setelah batch-all 13 kab selesai, atau leave as-is

### 3. Build chunk warning >500 KB
- **Cause:** MapLibre 801 KB minified (217 KB gzip)
- **Status:** non-blocking warning. Fix via lazy-load (Quick Win item).

---

## 📋 Action Plan (Next Session)

### Sprint 0 — Cleanup & Stabilize (Hari ini-besok)
1. Tunggu ETL batch-all #12 selesai (~3-4 jam)
2. Verify 14 kab semua punya composite via DB query
3. Optional re-run Pontianak @100m utk konsistensi (atau biarkan @10m sebagai high-res anchor)
4. Set GH Actions secrets + test workflow_dispatch
5. Set Sentry DSN di Vercel

### Sprint 1 — Baseline Setup (1-2 minggu)
6. Register CDSE OAuth client
7. Run `backfill --years 2025 --kabupaten pontianak` (demo end-to-end)
8. Build baseline 1 tahun + verify z-score muncul
9. Run backfill multi-day untuk 5 tahun (paralel sessions)

### Sprint 2 — Polish (1 minggu)
10. Lazy-load MapLibre
11. Quick wins (search, deep-link, skeleton)
12. Lighthouse audit + optimize

### Sprint 3 — Advanced (multi-minggu)
13. Auth multi-role
14. ML models
15. Provinsi lain

---

## 🔗 References

- Live App: https://opt-padi-kalbar.vercel.app
- TiTiler: https://opt-padi-titiler.fly.dev
- Supabase: https://supabase.com/dashboard/project/prrxzfmcgkwhrsuuiyox
- GitHub: https://github.com/abdullah2610/opt-padi-kalbar
- ROADMAP: `ROADMAP.md`
- BASELINE workflow: `workers/etl/BASELINE.md`
- ARCHITECTURE: `ARCHITECTURE.md`
- PROGRESS: `PROGRESS.md`
