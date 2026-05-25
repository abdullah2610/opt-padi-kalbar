# Implementation Plan: Option B — ESA WorldCover Cropland Mask

Versi: 1.0 — 2026-05-25 (draft, butuh konfirmasi user sebelum eksekusi)

## Overview

Integrasi ESA WorldCover 10m 2021 v200 (class 40 = cropland) sebagai mask tambahan ke pipeline Sentinel-2 ETL. Tujuan: hitung statistik indeks vegetasi (NDVI/NDWI/MNDWI/NDMI/MSI/EVI) **hanya pada pixel cropland** (sawah + tanaman semusim), menghindari kontaminasi hutan/perkebunan/pemukiman dalam agregat per-kabupaten.

Strategi: **side-by-side** — index lama (`ndvi`) tetap dipertahankan, indeks baru disimpan dengan suffix `_crop` (`ndvi_crop`, `ndwi_crop`, dst), sehingga 18 composites + 108 indices rows existing tidak perlu di-rewrite dan UI bisa toggle "All land" vs "Cropland-only".

## Requirements

- Mask non-cropland pixels (class != 40) sebelum reduce stats
- Pakai WorldCover 10m via openEO CDSE collection `ESA_WORLDCOVER_10M_2021_V200`
- Sejajarkan grid: WorldCover 10m → resample ke 100m (mode/majority untuk kategorikal)
- Tetap simpan agregat all-land sebagai metric utama (backwards compat)
- Tambah agregat cropland-only sebagai metric kedua per index
- Tidak mengganggu backfill historical Pontianak yang sedang berjalan
- Hemat kuota CDSE (≤5 batch jobs/jam target — bundle WorldCover ke cube yang sama jika memungkinkan)
- Populate tabel `landcover` (yang ada tapi kosong) sebagai by-product

## Architecture Changes

### Backend ETL (`workers/etl/`)

| File | Action |
|---|---|
| `worldcover.py` | **NEW** — load WorldCover collection, resample ke grid target, return DataCube mask |
| `mask_cropland.py` | **NEW** — apply cropland mask ke S2 cube + helper dual-stats |
| `openeo_pipeline.py` | **MODIFY** — branch dual: per-index cube + masked variant, atau merge dalam 1 cube + simpan 2 GTiff |
| `stats.py` | **MODIFY** — `compute_index_stats` tambah parameter `mask_path` untuk recompute (backup); tambah `MIN_VALID_PIXELS` guard |
| `storage.py` | **MODIFY** — adapt naming `{idx}_crop.tif`, insert dual rows ke `vegetation_indices`, populate `landcover` |
| `indices.py` | **MODIFY** — extend `INDEX_RENDERING` untuk variants `_crop` |

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
| `_lib/validate.js` | Extend `indexNameSchema` untuk 12 nama |
| `indices.js` | Accept `?mask=all|cropland`, map ke index_name suffix |
| `composite-meta.js` | Return both `cog_paths.ndvi` & `cog_paths.ndvi_crop` + cropland_area_ha |
| `_lib/data.js` | `fetchIndicesSeries` filter `index_name` per mask param |

### Frontend (`web/src/`)

| File | Action |
|---|---|
| `lib/types.ts` | Tambah `MaskKind = 'all' \| 'cropland'` |
| `store/mapStore.ts` | Tambah `maskKind` state + setter |
| `components/LayerSwitcher.tsx` | Toggle segmented control "Semua lahan / Sawah saja" |
| `components/IndexTimeseries.tsx` | Caption mask kind aktif |
| `components/InfoTooltip.tsx` | Copy update sumber WorldCover 2021 + class 40 |
| `hooks/useApi.ts` | Pass `mask` param ke fetch |
| `pages/HelpPage.tsx` | Section baru "Apa beda NDVI All-Land vs Cropland?" |
| `components/MapView.tsx` | Ganti tile URL `_crop` saat maskKind='cropland' |

## Implementation Phases

### Phase 0 — Spike & Validation (0.5 dev-day, BLOCKING)

| # | Step | File | Risk | Output |
|---|---|---|---|---|
| 1 | Spike WorldCover collection availability | `workers/etl/spike_worldcover.py` (throwaway) | HIGH (collection ID validation) | Catat `WORLDCOVER_COLLECTION_ID`, verify class 40 |
| 2 | Verify mask alignment overlay | `workers/etl/spike_alignment.py` (throwaway) | MEDIUM (CRS offset) | Confirm `resample_spatial(method="mode")` works untuk categorical |

**Blocker risk:** kalau collection tidak ada di CDSE → fallback: Terrascope STAC, AWS S3 public bucket, atau static download + reupload Supabase Storage as `assets/worldcover_kalbar.tif`.

### Phase 1 — ETL Core Integration (2.5 dev-day)

| # | Step | File | Risk |
|---|---|---|---|
| 3 | Create WorldCover loader (`load_cropland_mask`) | `workers/etl/worldcover.py` | MEDIUM (categorical resample) |
| 4 | Cropland masking helper (`apply_cropland`, `compute_cropland_area_ha`) | `workers/etl/mask_cropland.py` | LOW |
| 5 | Extend `build_composite` — dual save dari 1 cube (6 jobs total, 2 output each) | `workers/etl/openeo_pipeline.py` | HIGH (dual-save research) |
| 6 | Schema migration 011 | `infra/migrations/011_cropland_mask.sql` | LOW (additive) |
| 7 | Update `storage.insert_composite_row` untuk 12 keys | `workers/etl/storage.py` | MEDIUM |
| 8 | `MIN_VALID_PIXELS` guard di stats | `workers/etl/stats.py` | LOW |

**Mitigation Step 5:** kalau dual-save dari 1 cube tidak supported openEO, fallback ke 2 batch jobs per index (12 total = lewat kuota free), atau env `ETL_CROPLAND_ONLY=true` untuk eksklusif masked saja.

### Phase 2 — Backfill & Baseline Recompute (0.5 dev-day code + 1-2 minggu wallclock CDSE)

| # | Step | File | Risk |
|---|---|---|---|
| 9 | Smoke test 1 kab 1 window | manual `workflow_dispatch` | MEDIUM |
| 10 | Recompute historical 18 composites (skip raw, build _crop only) | `workers/etl/main.py` add `recompute-crop` command | HIGH (kuota) |
| 11 | Baseline recompute untuk `_crop` indices | `.github/workflows/baseline.yml` extend | HIGH (jangan ganggu Pontianak backfill yang sedang jalan) |

**Mitigation Step 11:** tambah `--skip-crop` flag ke backfill workflow agar Pontianak per-year compute raw only. Phase 3 kerjakan crop terpisah setelah backfill done.

### Phase 3 — API & Frontend Toggle (2 dev-day, paralel P2)

| # | Step | File | Risk |
|---|---|---|---|
| 12 | API validation extend 12 nama | `api/_lib/validate.js` | LOW |
| 13 | `indices.js` mask param + cache key | `api/indices.js` | LOW |
| 14 | `composite-meta.js` crop paths | `api/composite-meta.js` | LOW |
| 15 | Frontend types `MaskKind` | `web/src/lib/types.ts` | LOW |
| 16 | Store maskKind + setter | `web/src/store/mapStore.ts` | LOW |
| 17 | LayerSwitcher segmented control | `web/src/components/LayerSwitcher.tsx` | LOW |
| 18 | IndexTimeseries caption | `web/src/components/IndexTimeseries.tsx` | LOW |
| 19 | useApi pass mask | `web/src/hooks/useApi.ts` | LOW |
| 20 | InfoTooltip + HelpPage copy update | `web/src/components/InfoTooltip.tsx`, `web/src/pages/HelpPage.tsx` | LOW |
| 21 | MapView tile URL switch | `web/src/components/MapView.tsx` | MEDIUM (TiTiler path resolution) |

### Phase 4 — Monitoring & Cleanup (0.5 dev-day)

| # | Step | File | Risk |
|---|---|---|---|
| 22 | Dashboard view `v_indices_dual` | `infra/migrations/012_cropland_views.sql` | LOW |
| 23 | Update docs ARCHITECTURE.md + PROGRESS.md | dst | LOW |
| 24 | Cleanup spike files | hapus Phase 0 throwaways | LOW |

## Backwards Compatibility Strategy

| Aspect | Decision | Reasoning |
|---|---|---|
| Existing 6 indices rows | **Keep as-is** (all-land) | 18 composites historical tidak rewrite |
| New cropland metrics | **Suffix `_crop`** di kolom `index_name` | Tidak butuh schema redesign |
| `index_name` CHECK constraint | **Expand** (additive) | Migration 011 non-breaking |
| Existing API consumers | Default `mask=all` | Tidak ganti behaviour eksternal |
| Frontend default | `maskKind = 'all'` initial state | Existing screenshots/docs tetap akurat |
| Baselines | Compute baru untuk `_crop` parallel | Tidak overwrite raw baselines |

**Alternative dipertimbangkan & ditolak:**
- *Kolom baru `mean_crop, p10_crop, ...`*: bloat schema, sulit baseline join
- *Tabel baru `vegetation_indices_crop`*: duplikasi index + RLS policy + RPC copy
- *Replace existing rows in-place*: data loss, tidak bisa A/B compare

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
| Collection ID WorldCover tidak ada di CDSE | HIGH | Phase 0 spike; fallback Terrascope STAC / AWS S3 / static download reupload Supabase |
| Dual-save dari 1 cube tidak supported openEO | HIGH | Fallback 2 batch jobs per index, batasi kabupaten/hari, scheduled multi-day |
| Kuota CDSE jebol saat recompute historical | HIGH | Workflow `recompute-crop.yml` throttled 5 windows/6jam, monitor header response |
| Backfill Pontianak per-year ganggu | MEDIUM | Tambah `--skip-crop` ke backfill workflow; recompute crop sebagai phase terpisah |
| Mask alignment off (1-pixel shift) | MEDIUM | Phase 0 validation; `resample_cube_spatial(target=s2_cube, method="mode")` exact grid match |
| Kabupaten <1000 cropland pixels | MEDIUM | `MIN_VALID_PIXELS` guard, return null stats + log warning |
| Frontend cache stale saat user toggle | LOW | Cache key include `maskKind`; React Query staleTime 5 min |
| anomaly_z null untuk `_crop` sampai baseline ready | LOW | UI tampilkan "Baseline sedang dihitung" badge |
| WorldCover 2021 tidak refleksi sawah baru/abandoned 2024-2025 | LOW (accept) | Help page documentation; future switch ke Dynamic World |

## Success Criteria

- [ ] Migration 011 deployed, CHECK constraint accept `_crop` variants
- [ ] Smoke test Pontianak 1 window: 12 vegetation_indices rows + 2 COG per index + landcover row populated
- [ ] Historical 18 composites all have `_crop` siblings (108 new rows)
- [ ] API `/api/indices?kabupaten=pontianak&index=ndvi&mask=cropland` returns valid time-series
- [ ] Frontend toggle "Sawah saja" re-renders chart dengan mean berbeda terlihat
- [ ] Baselines `_crop` computed
- [ ] No regression pada existing all-land queries (tested via `mask=all`)
- [ ] Help page menjelaskan source WorldCover 2021 + class 40
- [ ] Test coverage ≥80% untuk modul ETL baru
- [ ] Pontianak backfill historical (yang sedang jalan) selesai tanpa interferensi

## Effort Estimate

| Phase | Effort | Calendar Time | Blocking? |
|---|---|---|---|
| P0 Spike | 0.5 dev-day | 1-2 hari | YES (blocking semua) |
| P1 ETL Core | 2.5 dev-day | 3-4 hari | YES |
| P2 Backfill | 0.5 dev-day code + 1-2 minggu wallclock CDSE | 1-2 minggu | NO (background) |
| P3 API+Frontend | 2 dev-day | 2-3 hari | NO (paralel P2) |
| P4 Cleanup | 0.5 dev-day | 1 hari | NO |
| **Total** | **~6 dev-day** | **~3 minggu (paralel)** | — |

## Open Questions (perlu konfirmasi sebelum mulai)

1. **Suffix `_crop` vs kolom `mask_kind`?** — Plan default suffix; konfirmasi.
2. **Recompute historical 18 composites sekarang atau tunggu backfill Pontianak selesai?** — Plan default tunggu backfill (mitigasi risk MEDIUM).
3. **Dual-save dari 1 cube vs 2 cube terpisah?** — Hasil Phase 0 spike menentukan.
4. **WorldCover sebagai static asset (download 1x, reupload Supabase) atau load dari CDSE setiap run?** — Static lebih hemat kuota; rekomendasi: 14 file clipped per-kabupaten ~5MB each, total ~70MB.

## Status

**🟡 DRAFT — WAITING FOR CONFIRMATION**

Konfirmasi 4 open questions di atas + approve plan sebelum eksekusi.
