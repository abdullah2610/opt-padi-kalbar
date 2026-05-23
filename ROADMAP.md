# Roadmap — Saran Peningkatan opt-padi-kalbar

Saran fitur + peningkatan pasca-MVP. Prioritas berdasar dampak × effort. Update terakhir: 2026-05-23.

---

## 🔥 High Impact

### 1. Baseline historical NDVI 5 tahun (Phase 2 finish)
- `python main.py baseline --years 2019,2020,2021,2022,2023`
- Aktifkan z-score anomaly + alert otomatis (`detect_stress` RPC sudah ada)
- ETA ~12 jam batch jobs CDSE, sekali jalan
- **Impact:** alert stress otomatis jadi akurat (saat ini baseline kosong → z-score NULL)

### 2. Phase 8 Auth + role
- Supabase Auth (email magic link + Google OAuth)
- Role: `admin_dinas`, `penyuluh`, `petani`, `public`
- Petani upload boundary parsel sendiri → drill-down dari kabupaten ke plot 100m × 100m
- Penyuluh acknowledge/resolve alert (`alerts.resolved_at`)
- **Impact:** transformasi dari read-only ke collaborative platform

### 3. Cron GHA aktif
- `.github/workflows/etl.yml` sudah ada
- Set secrets: `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, `SUPABASE_*`
- Daily 02:00 UTC otomatis fetch composite terbaru
- **Impact:** data app selalu fresh tanpa intervensi manual

### 4. Time-series longer + comparison
- Bandingkan tahun ini vs musim lalu (overlay 2 line di IndexTimeseries)
- Tren tahunan per kabupaten → identifikasi degradasi multi-tahun
- **Impact:** insight strategis vs operasional

---

## 📊 UX / Analytics

### 5. Drill-down kecamatan
- GeoJSON kecamatan Kalbar dari BPS (~170 kecamatan)
- Click kabupaten → zoom + show kecamatan polygons + NDVI per kecamatan
- Resolusi data 100m cukup untuk kecamatan-level

### 6. Compare mode (split-screen)
- Pilih 2 kabupaten side-by-side → bandingkan NDVI / cuaca / alerts
- Atau bandingkan 1 kabupaten 2 tanggal (sebelum-sesudah event)

### 7. Notifikasi push PWA
- Subscribe per kabupaten → push notif saat alert baru (Web Push API + Service Worker)
- Email digest mingguan via Resend / SendGrid

### 8. Export PDF/CSV
- Tombol "Download report PDF" per kabupaten — chart + tabel + alerts (jsPDF / react-pdf)
- CSV export untuk integrasi BPS / Dinas Pertanian

---

## 🌐 Coverage Expansion

### 9. Provinsi lain
- Tambah GeoJSON Kalsel / Kaltim / Kalteng → seed kabupaten baru
- ETL sudah generic (`kabupaten.py`) — tinggal update `KABUPATEN_IDS`
- Storage cost linear

### 10. Multi-musim tracking
- Musim Tanam 1 (Okt-Mar) vs MT2 (Apr-Sep) — tag `yield_estimates` per season
- Visual: histogram NDVI peak per kabupaten per MT, year-over-year

---

## 🤖 ML / Advanced

### 11. Yield model v1
- Replace linreg → XGBoost
- Features: NDVI/EVI peak + cumulative GDD + curah hujan total + LAI + tipologi lahan
- Train pakai BPS data lengkap multi-tahun
- Tambah confidence interval (quantile regression)

### 12. Disease ML model
- Saat ini cuma threshold heuristic
- Upgrade: train classifier (Random Forest) dengan label kasus penyakit historis dari Dinas Pertanian
- Per kabupaten → probability % blast / HDB / wereng

### 13. Plot-level detection (no downsample)
- Native 10m via openEO `aggregate_spatial` (stats per polygon di server) + tile raster reduced
- Petani upload boundary → ekstrak stats khusus plot mereka
- Storage tetap efisien (cuma stats, bukan raster full)

---

## 🏗 Performance / Ops

### 14. Lazy-load MapLibre
- Bundle MapLibre 217 KB gzip — terbesar
```tsx
const MapView = lazy(() => import('./components/MapView'));
```
- Map page hanya load saat user buka → improve First Contentful Paint di mobile

### 15. TiTiler tile cache
- Tambah Cloudflare di depan Fly.io (free CDN)
- Cache 7-day per tile (XYZ deterministic key)
- Cut origin requests ~90%

### 16. Sentry DSN aktif
- Wired sudah di frontend (`@sentry/react`)
- Tinggal set `VITE_SENTRY_DSN=...` di Vercel env
- Error tracking real-time

### 17. Lighthouse audit + Web Vitals
- Target: LCP < 2.5s, CLS < 0.1, FID < 100ms
- Optimize MapLibre lazy + critical CSS inline

---

## 🔧 Data Quality

### 18. Cloud mask quality flag
- Saat ini cuma `scl_clear_pct`
- Tambah `outlier_pct` (pixel value > 99.5 percentile = sensor noise)
- Filter alert: jangan trigger `stress` kalau `outlier_pct > 10%`

### 19. Multi-source validation
- Tambah MODIS NDVI 250m harian sebagai cross-check (saat Sentinel-2 awan)
- Land-use temporal: ESA WorldCover 2021 vs Dynamic World near-real-time

### 20. Edge case handling
- Composite empty (semua pixel masked) → show "Data tidak tersedia (awan)" di card, bukan crash
- Time-series gap > 30 hari → warning visual

---

## 📱 Mobile-Specific

### 21. GPS-aware
- `navigator.geolocation` → auto-detect kabupaten user → buka Dashboard kabupaten itu
- "Lokasi saya: Kab. Pontianak" banner

### 22. Offline-first dengan IndexedDB
- Sync data terbaru saat online → query lokal saat offline
- Sekarang cuma cache HTTP (Workbox NetworkFirst)
- Upgrade ke data-aware sync (Dexie atau idb-keyval)

---

## 🎯 Quick Wins (1-2 jam masing-masing)

- **Search kabupaten** di selector (filter typing — 14 item fine, useful saat tambah kecamatan)
- **Dark/light mode toggle** (saat ini dark-only)
- **Share URL deep-link** (`/dashboard/pontianak?index=ndvi&date=2026-05-10` — copy/paste)
- **Skeleton loader** (saat ini text "Memuat..." → ganti shimmer card Tailwind)
- **Empty states** lebih ramah (icon + "Belum ada data" + CTA "Lihat panduan")
- **Tour mode** (react-joyride) — first-time user diajak tour 5 langkah keliling app
- **Keyboard shortcuts** (`j/k` next/prev kabupaten, `/` focus search, `?` help modal)
- **Print stylesheet** — landscape A4 per kabupaten untuk laporan fisik

---

## Rekomendasi Urutan Sprint

### Sprint 1 — Quality & Automation (1 minggu)
- #1 Baseline historical 5 tahun
- #3 Cron GHA aktif (secrets set + workflow_dispatch test)
- #14 Lazy-load MapLibre
- #16 Sentry DSN
- #17 Lighthouse audit
- 3-5 Quick Wins

### Sprint 2 — Collaboration & Coverage (2-3 minggu)
- #2 Auth + role-based access
- #5 Drill-down kecamatan
- #4 Time-series comparison
- #20 Edge case handling
- #21 GPS-aware location

### Sprint 3 — ML & Advanced (4-6 minggu)
- #11 Yield model v1 (XGBoost)
- #12 Disease ML model
- #13 Plot-level detection
- #7 Push notification PWA

### Sprint 4 — Scale (ongoing)
- #9 Provinsi lain
- #10 Multi-musim tracking
- #15 Cloudflare tile cache
- #19 Multi-source validation

---

## Catatan Implementasi

- **Storage cost:** Supabase Free 1 GB → tambah 13 kab × 6 indices × ~25 MB = ~2 GB. Pro plan ($25/mo) atau pindah ke Cloudflare R2 (S3-compat).
- **CDSE quota:** Free ~5 batch jobs/jam. Baseline 5-tahun = 14 kab × 5 tahun × 36 DOY × 6 indices = 15.120 jobs → ~125 hari sequential. Strategi: parallel limit 5, prioritas DOY mid-season.
- **Vercel function timeout:** Default 300s. Disease-risk + composite-meta safe. ETL trigger → pakai GHA, bukan Vercel function.
- **Map perf:** MapLibre dengan 14 polygon + raster tile = ~60 fps. Kalau scale ke kecamatan (170 polygon Kalbar), pakai vector tile (Tippecanoe → PMTiles) bukan GeoJSON langsung.

---

## Referensi

- [Sentinel-2 documentation](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2)
- [openEO Python client](https://open-eo.github.io/openeo-python-client/)
- [TiTiler docs](https://developmentseed.org/titiler/)
- [Supabase Storage limits](https://supabase.com/docs/guides/storage/limits)
- [BPS Statistik Pertanian Kalbar](https://kalbar.bps.go.id/)
