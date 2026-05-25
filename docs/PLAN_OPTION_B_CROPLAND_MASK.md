# Implementation Plan: Option B — ESA WorldCover Cropland Mask

Versi: 1.2 — 2026-05-25 (CONFIRMED + paralel execution path defined)

## Eksekusi Paralel (tidak block backfill)

Bagi pekerjaan berdasar kebutuhan CDSE quota:

| Kategori | Bisa sekarang? | Alasan |
|---|---|---|
| Static asset download/clip/upload WorldCover | ✅ YA | Sumber Zenodo/Terrascope, bukan CDSE |
| Schema migration 011 | ✅ YA | Hanya Postgres ALTER, no CDSE |
| ETL code changes (worldcover.py, mask_cropland.py, dst) | ✅ YA | Code only, run via dry-run lokal |
| API code changes (validate, indices, data, composite-meta) | ✅ YA | No CDSE |
| Frontend changes (caption, HelpPage, MapView tile URL) | ✅ YA | No CDSE |
| Build + deploy code ke Vercel | ✅ YA | No CDSE |
| Phase 0 Step 4 dual-save spike (1 batch job test) | ⚠️ Minor CDSE cost | 6 jobs Pontianak test — acceptable burst |
| Phase 0 Step 5 mask alignment overlay | ✅ YA | Pakai existing Pontianak COG di Supabase |
| Smoke test full (1 kab 1 window) Phase 2 Step 12 | ⚠️ TUNGGU backfill | 6-12 jobs CDSE bentrok Pontianak per-year |
| Recompute historical 108 jobs (Phase 2 Step 13) | 🚫 TUNGGU backfill | Heavy quota usage |
| Baseline recompute `_crop` (Phase 2 Step 14) | 🚫 TUNGGU Step 13 | Butuh data hasil recompute |

**Plan execution:**

```
DAY 1-2 (now, paralel dengan Pontianak backfill):
├─ Static asset WorldCover → Supabase Storage (P0 Step 1-3)
├─ Mask alignment overlay validate (P0 Step 5)
├─ ETL code (worldcover.py, mask_cropland.py, storage.py changes)
├─ Migration 011 deploy
├─ API + Frontend code changes
├─ Build + Vercel deploy (data sementara cuma raw NDVI tampil)
└─ Dual-save spike (P0 Step 4) — 1 micro-test pakai Pontianak (~30 menit, 6 jobs)

DAY 3+ (setelah Pontianak backfill selesai):
├─ Smoke test 1 kab 1 window (P2 Step 12)
├─ Recompute historical 18 composites (P2 Step 13, ~4 hari)
├─ Baseline recompute _crop (P2 Step 14)
└─ Switch frontend default ke _crop (feature flag flip)
```

**Feature flag strategy:**
- Deploy code dengan env `ETL_CROPLAND_MASK_ENABLED=false` default → ETL tetap save raw saja (existing behavior)
- Frontend env `VITE_DISPLAY_CROPLAND_DEFAULT=false` → tetap render `ndvi` (existing rows)
- Setelah recompute historical done: flip kedua flag → `true` di Vercel + GH Actions secrets
- Rollback instant: flip flag back

Code di-deploy tapi behavior tidak berubah sampai data siap.



## Keputusan Final (dari konfirmasi user)

| # | Pertanyaan | Pilihan | Detail |
|---|---|---|---|
| Q1 | Suffix `_crop` atau kolom `mask_kind`? | **Suffix `_crop`** | Plus: **UI hanya display cropland values**. All-land tetap dihitung sebagai backup data di DB, tidak dirender di frontend. Tidak ada toggle "Semua lahan / Sawah saja". |
| Q2 | Recompute sekarang atau tunggu Pontianak backfill? | **Tunggu Pontianak backfill selesai** | Hindari kuota CDSE bentrok |
| Q3 | Dual-save (1 batch job → 2 output) atau 2 batch terpisah? | **Dual-save** | Target hemat kuota; Phase 0 spike validasi |
| Q4 | WorldCover load CDSE tiap run atau static asset Supabase? | **Static asset** | Download 1x, clip per-kabupaten (14 file ~5MB each), reupload Supabase Storage `assets/worldcover/{kab}.tif` |

**Implikasi konsolidasi:**
- Frontend `LayerSwitcher` tidak butuh toggle mask (Step 17 simplified)
- Frontend store tidak butuh `maskKind` state (Step 16 dropped)
- API default `?mask=cropland` (bukan `all`)
- Raw all-land data tetap exists di DB sebagai data backup/comparison untuk debug & analytics future
- ETL load WorldCover via Supabase Storage URL (bukan openEO collection) — Phase 0 spike fokus validate clip + upload workflow, bukan CDSE collection discovery

## Overview

Integrasi ESA WorldCover 10m 2021 v200 (class 40 = cropland) sebagai mask ke pipeline Sentinel-2 ETL. Tujuan: hitung statistik indeks vegetasi (NDVI/NDWI/MNDWI/NDMI/MSI/EVI) **hanya pada pixel cropland** (sawah + tanaman semusim).

Strategi: **dual-save backend, display cropland-only frontend** — backend simpan dua versi (raw + masked) via 1 batch job dual-output untuk hemat kuota CDSE; row DB pakai suffix `_crop` (`ndvi_crop`, dst); frontend cuma render values cropland (`ndvi_crop`) — raw `ndvi` tetap exists sebagai data backup/comparison untuk debug & analytics future tapi tidak displayed.

WorldCover di-fetch sekali sebagai static asset, di-clip per-kabupaten, di-reupload ke Supabase Storage `assets/worldcover/{kab}.tif`, lalu ETL load mask dari Supabase (bukan CDSE openEO collection).

## Requirements

- Mask non-cropland pixels (class != 40) sebelum reduce stats
- WorldCover 10m → static asset di Supabase Storage (1x download awal), clip per-kabupaten, resample 100m (mode/majority)
- ETL load mask dari Supabase URL public via openEO `load_url` atau rasterio sisi worker
- Dual-save dalam 1 batch job: simpan raw `{idx}.tif` + masked `{idx}_crop.tif`
- DB row pakai suffix `_crop` untuk masked stats
- Frontend cuma render `_crop` values — raw tetap di DB sebagai backup
- Tidak ada toggle UI (drop LayerSwitcher mask segment)
- Tunggu backfill historical Pontianak selesai sebelum recompute crop (hindari kuota bentrok)
- Hemat kuota CDSE (≤5 batch jobs/jam target)
- Populate tabel `landcover` (yang ada tapi kosong) sebagai by-product

## Architecture Changes

### Backend ETL (`workers/etl/`)

| File | Action |
|---|---|
| `worldcover.py` | **NEW** — load mask GeoTIFF dari Supabase URL public, return DataCube boolean mask (`class == 40`) di grid 100m |
| `mask_cropland.py` | **NEW** — `apply_cropland(cube, mask)` + helper `compute_cropland_area_ha(mask_path)` |
| `openeo_pipeline.py` | **MODIFY** — branch dual-save: per-index simpan raw + masked via `merge_cubes` atau dual `save_result` chain |
| `stats.py` | **MODIFY** — `compute_index_stats` tambah `MIN_VALID_PIXELS` guard (default 1000); fallback recompute dari raster yang di-mask di sisi worker kalau dual-save openEO tidak supported |
| `storage.py` | **MODIFY** — upload 2 GTiff `{idx}.tif` + `{idx}_crop.tif`, insert dual rows ke `vegetation_indices`, populate `landcover` |
| `indices.py` | **MODIFY** — extend `INDEX_RENDERING` untuk variants `_crop` (sama rescale, beda metadata) |

### Schema (`infra/migrations/`)

**NEW** `011_cropland_mask.sql`:

```sql
ALTER TABLE vegetation_indices DROP CONSTRAINT vegetation_indices_index_name_check;
ALTER TABLE vegetation_indices ADD CONSTRAINT vegetation_indices_index_name_check
  CHECK (index_name IN (
    'ndvi','ndwi','mndwi','ndmi','msi','evi',
    'ndvi_crop','ndwi_crop','mndwi_crop','ndmi_crop','msi_crop','evi_crop'
  ));

ALTER TABLE sentinel_composites ADD COLUMN cropland_mask_path text;
ALTER TABLE sentinel_composites ADD COLUMN cropland_pixel_count int;
ALTER TABLE sentinel_composites ADD COLUMN cropland_area_ha real;

-- index_baselines: extend constraint sama (12 nama)
ALTER TABLE index_baselines DROP CONSTRAINT IF EXISTS index_baselines_index_name_check;
ALTER TABLE index_baselines ADD CONSTRAINT index_baselines_index_name_check
  CHECK (index_name IN (
    'ndvi','ndwi','mndwi','ndmi','msi','evi',
    'ndvi_crop','ndwi_crop','mndwi_crop','ndmi_crop','msi_crop','evi_crop'
  ));
```

### API (`api/`)

| File | Action |
|---|---|
| `_lib/validate.js` | Extend `indexNameSchema` untuk 12 nama (backend tetap support kedua varian untuk future flexibility / debug) |
| `indices.js` | Default behavior: return `_crop` rows. Tambah `?raw=true` opsional untuk debug akses all-land |
| `composite-meta.js` | Return `cog_paths.{idx}_crop` (default) + `cog_paths.{idx}` (raw, hidden field) + cropland_area_ha |
| `_lib/data.js` | `fetchIndicesSeries(kab, index)` otomatis filter ke `${index}_crop` rows |

### Frontend (`web/src/`)

| File | Action |
|---|---|
| `lib/types.ts` | Tambah `INDEX_NAMES_CROP` (suffix automatic) — frontend tetap pakai nama base (`ndvi`), API layer yang convert |
| `store/mapStore.ts` | Tidak berubah (no maskKind state) |
| `components/LayerSwitcher.tsx` | Tidak berubah (no mask toggle) — tetap 6 indeks button |
| `components/IndexTimeseries.tsx` | Caption update: subtitle "Cropland-only (sawah + tanaman semusim)" |
| `components/InfoTooltip.tsx` | Copy update sumber WorldCover 2021 + class 40 + cara baca cropland |
| `hooks/useApi.ts` | Tidak ada perubahan signature — backend yang handle suffix |
| `pages/HelpPage.tsx` | Section "Apa itu cropland mask?" + jelaskan cara data dihitung post-mask |
| `components/MapView.tsx` | Tile URL otomatis pakai `{idx}_crop.tif` path |

## Implementation Phases

### Phase 0 — Static Asset Setup + Dual-Save Validation (1 dev-day, BLOCKING)

| # | Step | File | Risk | Output |
|---|---|---|---|---|
| 1 | Download WorldCover 2021 untuk extent Kalbar | `infra/scripts/fetch_worldcover.mjs` (new) — fetch via Terrascope STAC / Zenodo (1 file 2.4°×4.8° ~50MB GeoTIFF) | LOW (sumber stabil) | `infra/data/worldcover_kalbar.tif` |
| 2 | Clip per-kabupaten + resample 100m mode | `infra/scripts/clip_worldcover.py` (new) — rasterio per kab boundary, output 14 file ~3-5MB each | LOW | `infra/data/worldcover/{kab}.tif` (14 file) |
| 3 | Upload ke Supabase Storage bucket baru `assets/worldcover/` | `infra/scripts/upload_worldcover.mjs` (new) | LOW | URL public per kab |
| 4 | Spike dual-save openEO API support | `workers/etl/spike_dualsave.py` (throwaway) — test `merge_cubes` + multi-output `save_result` | HIGH | Confirm whether dual-save feasible atau fallback Plan B (single-save cropland-only) |
| 5 | Verify mask alignment overlay | `workers/etl/spike_alignment.py` (throwaway) — overlay clipped WorldCover + NDVI 100m existing Pontianak | MEDIUM | Confirm grid match exact, no 1-pixel shift |

**Blocker risk Step 4:** kalau dual-save tidak supported → fallback ke single-save `_crop` only mode (set `ETL_DUAL_SAVE=false`). Raw NDVI tidak ter-update di future ETL runs; pakai snapshot existing 108 rows untuk reference saja.

### Phase 1 — ETL Core Integration (2.5 dev-day)

| # | Step | File | Risk |
|---|---|---|---|
| 6 | Create WorldCover loader (`load_cropland_mask`) — fetch dari Supabase Storage URL via openEO `load_url` atau rasterio | `workers/etl/worldcover.py` | MEDIUM |
| 7 | Cropland masking helper (`apply_cropland`, `compute_cropland_area_ha`) | `workers/etl/mask_cropland.py` | LOW |
| 8 | Extend `build_composite` — dual-save dari 1 cube (6 jobs total, 2 output each) | `workers/etl/openeo_pipeline.py` | HIGH (Phase 0 Step 4 dependent) |
| 9 | Schema migration 011 | `infra/migrations/011_cropland_mask.sql` | LOW (additive) |
| 10 | Update `storage.insert_composite_row` untuk 12 keys | `workers/etl/storage.py` | MEDIUM |
| 11 | `MIN_VALID_PIXELS` guard di stats | `workers/etl/stats.py` | LOW |

**Mitigation Step 8:** kalau dual-save tidak supported (hasil Phase 0 Step 4), fallback: `ETL_DUAL_SAVE=false` mode — submit 6 batch jobs single-output cropland only. Raw NDVI tidak ter-update di run baru (existing snapshot tetap intact di DB).

### Phase 2 — Backfill & Baseline Recompute (0.5 dev-day code + 1-2 minggu wallclock CDSE)

**TUNGGU sampai Pontianak per-year backfill selesai (task `bzidgs1jv` complete).** Konfirmasi via `gh run list --workflow=backfill.yml` semua success sebelum lanjut.

| # | Step | File | Risk |
|---|---|---|---|
| 12 | Smoke test 1 kab 1 window dual-save | manual `workflow_dispatch` | MEDIUM |
| 13 | Recompute existing composites — build `_crop` variants saja (skip raw karena sudah ada) | `workers/etl/main.py` add `recompute-crop` command | HIGH (kuota CDSE 108 jobs) |
| 14 | Baseline recompute untuk 6 `_crop` indices | `.github/workflows/baseline.yml` extend | LOW (cuma agregasi SQL, tidak panggil CDSE) |

**Mitigation Step 13:** workflow `recompute-crop.yml` throttled 5 windows/6 jam (4-day total untuk 18 windows). Atau eksekusi local background jika user prefer.

### Phase 3 — API & Frontend Cropland-Default (1 dev-day, paralel P2)

| # | Step | File | Risk |
|---|---|---|---|
| 15 | API validation extend 12 nama (backend support kedua untuk debug) | `api/_lib/validate.js` | LOW |
| 16 | `indices.js` default ke `_crop` rows | `api/indices.js` | LOW |
| 17 | `composite-meta.js` return `_crop` paths default | `api/composite-meta.js` | LOW |
| 18 | `_lib/data.js` `fetchIndicesSeries` auto-append `_crop` suffix | `api/_lib/data.js` | LOW |
| 19 | IndexTimeseries subtitle "Cropland-only (sawah + tanaman semusim)" | `web/src/components/IndexTimeseries.tsx` | LOW |
| 20 | InfoTooltip + HelpPage copy update — jelaskan source WorldCover + cara baca | `web/src/components/InfoTooltip.tsx`, `web/src/pages/HelpPage.tsx` | LOW |
| 21 | MapView tile URL pakai `{idx}_crop.tif` default | `web/src/components/MapView.tsx` | MEDIUM (TiTiler path) |
| 22 | KabupatenSheet + DashboardPage caption + cropland_area_ha tampilan opsional | `web/src/components/KabupatenSheet.tsx`, `pages/DashboardPage.tsx` | LOW |

**Tidak ada perubahan:** `LayerSwitcher.tsx`, `store/mapStore.ts`, `hooks/useApi.ts` signature, `lib/types.ts` (cuma docs).

### Phase 4 — Monitoring & Cleanup (0.5 dev-day)

| # | Step | File | Risk |
|---|---|---|---|
| 22 | Dashboard view `v_indices_dual` | `infra/migrations/012_cropland_views.sql` | LOW |
| 23 | Update docs ARCHITECTURE.md + PROGRESS.md | dst | LOW |
| 24 | Cleanup spike files | hapus Phase 0 throwaways | LOW |

## Backwards Compatibility Strategy

| Aspect | Decision | Reasoning |
|---|---|---|
| Existing 6 indices rows | **Keep as-is** (all-land) di DB | Tidak displayed di UI, tapi exists untuk debug/analytics future |
| New cropland metrics | **Suffix `_crop`** di kolom `index_name` | Schema additive, query trivial |
| `index_name` CHECK constraint | **Expand** dari 6 ke 12 names | Migration 011 non-breaking |
| API behavior change | **Default ke `_crop` rows** (breaking minor — UI dapat values berbeda) | User keputusan: tidak butuh all-land display |
| Raw all-land data accessibility | API endpoint `?raw=true` untuk debug akses | Future flexibility kalau perlu A/B compare |
| Baselines | Compute baru untuk `_crop` parallel | Tidak overwrite raw baselines |
| Existing screenshots/docs | **Outdated** setelah deploy — perlu refresh | User aware, dokumentasi update di HelpPage |

**Alternative dipertimbangkan & ditolak:**
- *Kolom baru `mean_crop, p10_crop, ...`*: bloat schema, sulit baseline join
- *Tabel baru `vegetation_indices_crop`*: duplikasi index + RLS policy + RPC copy
- *Replace existing rows in-place*: data loss, raw historical lenyap, tidak bisa rollback
- *Frontend toggle* (rejected per keputusan user): UI simpler tanpa toggle, displayed data jelas konteks (sawah-only)

## Testing Strategy

### Unit Tests (pytest ≥80%)
- `tests/test_worldcover.py` — `load_cropland_mask` shape + class 40 + resample mode correctness
- `tests/test_mask_cropland.py` — `apply_cropland` zeros non-cropland, edge case all-zero mask
- `tests/test_stats.py` — `MIN_VALID_PIXELS` guard returns None stats

### Integration Tests
- `tests/integration/test_pipeline_crop.py` — full build_composite mocked CDSE → 2 COG + 12 DB rows
- `tests/integration/test_api_indices_crop.py` — GET `/api/indices?mask=cropland` returns `_crop` rows

### E2E Tests (Playwright)
- `tests/e2e/cropland_toggle.spec.ts` — user toggle → chart re-renders → tooltip "Mask: Sawah"

### Manual QA Checks
- [ ] Pontianak: cropland mean > all-land (sawah hijau dominan)
- [ ] Ketapang: cropland mean < all-land (hutan dominan)
- [ ] Singkawang kota: cropland_area_ha < 5000 ha (jika >20000 = bug mask)
- [ ] Disk usage Supabase: 18 × 14 × 6 × 2 = 3024 COG potential; verify <50MB each

## Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Dual-save 1 cube tidak supported openEO | HIGH | Phase 0 Step 4 spike validate; fallback ke single-save `_crop` only mode (`ETL_DUAL_SAVE=false`) |
| Kuota CDSE jebol saat recompute historical | HIGH | Workflow `recompute-crop.yml` throttled 5 windows/6jam (4-day total untuk 18 windows) |
| Pontianak backfill bentrok | HIGH | **WAJIB tunggu** Pontianak backfill selesai sebelum trigger recompute-crop |
| WorldCover static asset download fail | MEDIUM | Phase 0 Step 1 download retry; fallback source Zenodo / AWS Open Data |
| Mask alignment off (1-pixel shift) | MEDIUM | Phase 0 Step 5 validation; clip + resample dengan target grid match exact |
| Kabupaten <1000 cropland pixels | MEDIUM | `MIN_VALID_PIXELS` guard, return null stats + log warning + show "Data tidak cukup" di UI |
| User shock — values NDVI berubah drastis | MEDIUM | HelpPage banner prominent: "NDVI berubah karena sekarang dihitung hanya pada sawah/cropland (bukan seluruh wilayah)" |
| anomaly_z null untuk `_crop` sampai baseline ready | LOW | UI badge "Baseline sedang dihitung" |
| WorldCover 2021 tidak refleksi sawah baru/abandoned 2024-2025 | LOW (accept) | Help page documentation; future switch ke Dynamic World sebagai phase terpisah |
| Storage Supabase Free 1GB usage naik (18 × 14 × 6 × 2 = 3024 COG potential) | MEDIUM | Cleanup raw COG lama (>3 bulan); compress lebih agresif via ZSTD; atau upgrade Pro |

## Success Criteria

- [ ] WorldCover static asset 14 file ter-upload ke Supabase `assets/worldcover/{kab}.tif`
- [ ] Phase 0 spike: dual-save openEO confirmed supported ATAU fallback `ETL_DUAL_SAVE=false` documented
- [ ] Migration 011 deployed, CHECK constraint accept `_crop` variants
- [ ] Smoke test Pontianak 1 window: 12 vegetation_indices rows + 2 COG per index + landcover row populated
- [ ] Historical 18 composites all have `_crop` siblings (108 new rows)
- [ ] API `/api/indices?kabupaten=pontianak&index=ndvi` returns `_crop` values default
- [ ] Frontend menampilkan cropland-only values dengan caption jelas
- [ ] Baselines `_crop` computed (6 × 14 × ~36 DOY buckets max)
- [ ] No regression pada raw all-land query (tested via `?raw=true` debug endpoint)
- [ ] Help page menjelaskan source WorldCover 2021 + class 40 + perubahan interpretation
- [ ] Test coverage ≥80% untuk modul ETL baru
- [ ] Pontianak backfill historical (yang sedang jalan) selesai tanpa interferensi
- [ ] User-visible banner saat first deploy: "NDVI sekarang dihitung hanya pada area sawah/cropland"

## Effort Estimate

| Phase | Effort | Calendar Time | Blocking? |
|---|---|---|---|
| P0 Static asset + spike | 1 dev-day | 1-2 hari | YES (blocking semua) |
| P1 ETL Core | 2.5 dev-day | 3-4 hari | YES |
| P2 Backfill | 0.5 dev-day code + 4 hari wallclock CDSE (throttled) | 1 minggu | NO (background, tunggu Pontianak) |
| P3 API+Frontend (no toggle) | 1 dev-day (lebih sedikit dari draft v1) | 1-2 hari | NO (paralel P2) |
| P4 Cleanup | 0.5 dev-day | 1 hari | NO |
| **Total** | **~5.5 dev-day** | **~2 minggu (paralel)** | — |

## Eksekusi Workflow (paralel)

### Track A — Code & Static Asset (NOW, paralel backfill)

1. **P0 Step 1-3 + 5** — WorldCover static asset (download + clip 14 kab + upload Supabase + alignment validate)
2. **P0 Step 4** — Dual-save micro spike (1 small test Pontianak, ~30 menit CDSE acceptable)
3. **P1 Step 6-11** — ETL code (worldcover.py, mask_cropland.py, storage.py, stats.py, openeo_pipeline.py)
4. **P1 Step 9** — Schema migration 011 deploy
5. **P3 Step 15-22** — API + Frontend code changes
6. **Build + Vercel deploy** dengan feature flag `ETL_CROPLAND_MASK_ENABLED=false` (behavior unchanged)
7. **GH Actions workflow update** — workflow `recompute-crop.yml` baru (dispatch-only, idle sampai flag aktif)

### Track B — Data Backfill (TUNGGU Pontianak backfill task `bzidgs1jv` selesai)

8. Flip ETL flag → `true` di GH Actions secrets
9. **P2 Step 12** — Smoke test 1 kab 1 window via workflow_dispatch dual-save
10. **P2 Step 13** — Trigger `recompute-crop.yml` (~4 hari background, throttled)
11. **P2 Step 14** — Baseline recompute `_crop`
12. Flip frontend flag → `true` di Vercel env
13. **P4 Step 23-26** — Cleanup + docs

### Rollback path

Kalau ada bug ditemukan setelah flag flip:
- Frontend: flip `VITE_DISPLAY_CROPLAND_DEFAULT=false` → redeploy ~2 min
- ETL: flip `ETL_CROPLAND_MASK_ENABLED=false` → next cron pakai existing behavior
- DB: tetap intact (raw + crop side-by-side)

## Status

**🟢 CONFIRMED — paralel execution path defined**

Semua 4 open questions terjawab:
- Q1: Suffix `_crop` + display cropland-only (no toggle)
- Q2: Tunggu Pontianak backfill (untuk data recompute saja — code bisa paralel)
- Q3: Dual-save (validate via Phase 0 spike)
- Q4: Static asset Supabase

**Eksekusi:** Track A (code + static asset) bisa mulai sekarang paralel Pontianak backfill. Track B (data recompute + flag flip) menunggu backfill selesai. Feature flag jamin behavior tidak berubah sampai siap.

User instruction: **MENUNGGU GO-AHEAD** untuk mulai Track A.
