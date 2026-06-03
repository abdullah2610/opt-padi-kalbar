# Pending — opt-padi-kalbar

Daftar pekerjaan belum tuntas per 2026-06-03 sesi ke-5.

---

## ✅ Completed

### Baseline NDVI 2025 — SELESAI (2026-06-03)
- **Status:** ✅ 384 DOY buckets di `index_baselines` untuk 14 kabupaten
- **6 indeks:** ndvi, ndwi, mndwi, ndmi, msi, evi
- **Per kabupaten:**
  | Kab | Buckets | Sampel |
  |---|---|---|
  | bengkayang, kubu-raya, mempawah | 42 | 7 windows |
  | pontianak, sambas | 36 | 6 windows |
  | landak | 30 | 5 windows |
  | ketapang, sanggau, sekadau | 24 | 4 windows |
  | kapuas-hulu, melawi, singkawang, sintang | 18 | 3 windows |
  | kayong-utara | 12 | 2 windows |
- **Catatan:** sparse baseline (1 sampel per DOY → std fallback 0.05). `compute_anomaly_z` RPC bisa lookup untuk semua kab.
- **Dampak:** `detect_stress` trigger alert aktif untuk composite baru.

### Backfill 2025 partial — SELESAI (dihentikan karena CDSE tidak reliable)
- **Status:** ⚪ Dihentikan 2026-06-01 — 35 composite sukses dari 132 attempt (27%)
- **CDSE free tier:** 73% failure rate (ReadTimeout + TokenInvalid), tidak feasible untuk 13 kab paralel
- **Data tersimpan:** 696 vegetation_indices rows untuk 2025 (digunakan build baseline)
- **Strategi alternatif:** baseline dari data 2025 sudah cukup untuk compute z-score awal. Data akan terisi natural via ETL cron kedepan.

### ETL batch-all 13 kab @100m
- **Task ID:** `b5z6a5mpn` (started 2026-05-23 20:44)
- **Status:** ✅ **SELESAI** — 44 composite rows, semua `completed`
- **Verified:** 2026-05-25 via DB query
- **Output:** 14 kabupaten (termasuk Pontianak) punya `sentinel_composites` + `vegetation_indices` @100m
- **Detail per kab:**
  | Kabupaten | Composite windows | Vegetation indices |
  |---|---|---|
  | pontianak | 22 | 132 (2022-2026) |
  | kayong-utara | 3 | 18 (Mei 2026) |
  | 10 kab lain | 2/window | 12 masing-masing |
  | kapuas-hulu, melawi, sintang, kubu-raya, singkawang | 1 | 6 masing-masing |

---

## 🟡 Belum Dieksekusi (Code Siap)

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

---

## 🟢 Option B — ESA WorldCover Cropland Mask (Track A: DONE ✅)

### Status Track A — SELESAI (2026-05-25)

| Step | Status | Detail |
|---|---|---|
| P0-1 Download WorldCover | ✅ | 10 tile dari ESA S3 (138 MB) |
| P0-2 Clip per-kabupaten | ✅ | 14 file GeoTIFF, total ~800 KB |
| P0-3 Upload Supabase | ✅ | `assets/worldcover/{kab}.tif` (HTTP 200 all 14 kab) |
| P1-9 Migration 011 | ✅ | 3 kolom baru + CHECK constraint 12 nama index |
| P3 Vercel deploy | ✅ | `sipopt.agroinovasi.my.id` — `VITE_DISPLAY_CROPLAND_DEFAULT=false` |
| P0-5 Alignment validate | ✅ | Validasi via P0-4 — grid reprojection berfungsi otomatis |
| P0-4 Dual-save spike | ✅ | **Pipeline works!** 2 kab di-test |

### Hasil Dual-save Spike

#### Pontianak (urban, 2026-04-01..10)
- WorldCover: 42×124 px, **0 cropland pixels** (0.0%) — expected, Pontianak kota
- 12 rows terinsert (6 raw + 6 _crop), semua `_crop` mean NULL (no cropland)
- `cropland_pixel_count=0`, `cropland_area_ha=0`

#### Mempawah (agraris, 2026-04-20..30) ✅ **BERHASIL**
- WorldCover: 749×607 px, **3.672 cropland pixels** (0.8%) — 3.672 ha sawah
- 12 rows terinsert, 12 COG terupload (6 raw + 6 _crop)

**Perbandingan NDVI raw vs cropland (Mempawah):**

| Index | Raw (all-land) | Crop (sawah-only) | Diff |
|---|---|---|---|
| ndvi | 0.328 | **0.544** | +65% |
| ndwi | -0.234 | **-0.507** | sawah lebih basah |
| mndwi | -0.111 | **-0.417** | — |
| ndmi | 0.177 | 0.115 | -35% |
| msi | 0.738 | 0.828 | +12% |
| evi | 2.020 | **2.867** | +42% |

**Interpretasi:** NDVI cropland 65% lebih tinggi — sawah memang lebih hijau. NDWI cropland lebih rendah (basah) — expected, sawah digenangi. EVI lebih tinggi — vegetasi lebih padat.

### Cropland Coverage per Kabupaten (sample)

| Kabupaten | Shape | Crop px | % | Area (ha) |
|---|---|---|---|---|
| mempawah | 749×607 | 3.672 | 0.8% | 3.672 |
| sambas | 1235×942 | 17.541 | 3.0% | 17.541 |
| bengkayang | 1113×1610 | 1.559 | 0.3% | 1.559 |
| kubu-raya | 283×1025 | 35 | 0.0% | 35 |
| **pontianak** | 42×124 | **0** | 0.0% | 0 |

### Bugs ditemukan & difix selama Track A
- URL download WorldCover salah (Zenodo timeout) → ganti ke ESA S3 bucket
- `clip_worldcover.py` bug — referensi variabel, merge error → rewrite
- `ETL_CROPLAND_MASK_ENABLED` belum diset di `.env` → sudah ditambah
- ETL harus pakai `uv run` bukan `python3` langsung

### Track B — Menunggu
- Recompute-crop 108 jobs + baseline `_crop` ← tunggu backfill 13 kab 2025 selesai
- Pontianak **diskip** dari backfill (0 cropland, @10m inkonsisten) — tidak memblokir Track B
- Setelah backfill selesai + baseline terbentuk, flip `VITE_DISPLAY_CROPLAND_DEFAULT=true` di Vercel

### Rollback path
- Frontend: flip `VITE_DISPLAY_CROPLAND_DEFAULT=false` → redeploy ~2 menit
- ETL: flip `ETL_CROPLAND_MASK_ENABLED=false` → next run pakai behavior existing

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

### 2. ETL Pontianak @10m, kab lain @100m
- **Status:** **Diskip dari backfill** — 0 piksel cropland, resolusi inkonsisten. Tidak memblokir apa pun.
- Biarkan @10m sebagai high-res anchor, tidak perlu re-run @100m.

### 3. Build chunk warning >500 KB
- **Cause:** MapLibre 801 KB minified (217 KB gzip)
- **Status:** non-blocking warning. Fix via lazy-load (Quick Win item).

---

## 📋 Action Plan (Next Session)

### Sprint 1 — Backfill & Baseline (SEDANG BERJALAN)
1. ~~Backfill paralel 13 kabupaten 2025~~ 🔵 Berjalan — estimasi 8 hari
2. Build baseline 2025 setelah backfill selesai
3. Verify z-score anomaly muncul
4. Recompute-crop 108 composites + baseline `_crop`

### Sprint 2 — Polish & Deploy
5. Set GH Actions secrets + test workflow_dispatch
6. Set Sentry DSN di Vercel
7. Flip `VITE_DISPLAY_CROPLAND_DEFAULT=true` setelah baseline _crop siap
8. Lazy-load MapLibre
9. Quick wins (search, deep-link, skeleton)

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
