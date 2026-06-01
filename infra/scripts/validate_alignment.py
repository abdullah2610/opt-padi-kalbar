#!/usr/bin/env python3
"""P0-5: Validate WorldCover mask alignment with NDVI COG for Pontianak."""
from pathlib import Path
import rasterio
import numpy as np
from rasterio.warp import transform_bounds

# WorldCover mask (local)
MASK_PATH = Path("/home/abdum/opt-padi-kalbar/infra/data/worldcover/pontianak.tif")
# NDVI COG (download from Supabase if needed)
NDVI_URL = "https://prrxzfmcgkwhrsuuiyox.supabase.co/storage/v1/object/public/composites/pontianak/2026-05-10/ndvi.tif"

import requests, tempfile

print("1. Loading WorldCover mask (UTM49S @100m)...")
with rasterio.open(MASK_PATH) as src:
    mask_data = src.read(1)
    mask_crs = src.crs
    mask_transform = src.transform
    mask_bounds = src.bounds
    mask_nodata = src.nodata
print(f"   Shape: {mask_data.shape}, CRS: {mask_crs}")
print(f"   Bounds: {mask_bounds}")
print(f"   Cropland px (class 40): {int((mask_data == 40).sum())}")

print("\n2. Fetching Pontianak NDVI COG (EPSG:4326 @100m)...")
resp = requests.get(NDVI_URL, timeout=60)
resp.raise_for_status()
with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
    tmp.write(resp.content)
    tmp_path = tmp.name

try:
    with rasterio.open(tmp_path) as src:
        ndvi_data = src.read(1)
        ndvi_crs = src.crs
        ndvi_transform = src.transform
        ndvi_bounds = src.bounds
    print(f"   Shape: {ndvi_data.shape}, CRS: {ndvi_crs}")
    print(f"   Bounds: {ndvi_bounds}")
    valid_px = int((~np.isnan(ndvi_data)).sum())
    print(f"   Valid NDVI pixels: {valid_px}")

    # Reproject mask to NDVI grid (EPSG:4326)
    print("\n3. Reprojecting WorldCover mask → EPSG:4326 (match NDVI grid)...")
    mask_4326 = np.zeros(ndvi_data.shape, dtype=np.uint8)
    mask_bool = (mask_data == 40).astype(np.uint8)

    with (
        rasterio.MemoryFile() as src_mf,
        rasterio.MemoryFile() as dst_mf,
    ):
        # Source: mask in UTM49S (100m)
        mh, mw = mask_data.shape
        src_meta = {"driver": "GTiff", "count": 1, "dtype": "uint8",
                    "width": mw, "height": mh, "crs": mask_crs,
                    "transform": mask_transform, "nodata": 0}
        with src_mf.open(**src_meta) as src_ds:
            src_ds.write(mask_bool, 1)
            # Dest: match NDVI grid (EPSG:4326, 100m)
            nh, nw = ndvi_data.shape
            dst_meta = {"driver": "GTiff", "count": 1, "dtype": "uint8",
                       "width": nw, "height": nh, "crs": ndvi_crs,
                       "transform": ndvi_transform, "nodata": 0}
            with dst_mf.open(**dst_meta) as dst_ds:
                from rasterio.warp import reproject, Resampling
                reproject(
                    source=rasterio.band(src_ds, 1),
                    destination=rasterio.band(dst_ds, 1),
                    resampling=Resampling.nearest,
                )
                aligned = dst_ds.read(1).astype(bool)

    cropland_in_ndvi = int(aligned.sum())
    aligned_valid = aligned & ~np.isnan(ndvi_data)
    matched_px = int(aligned_valid.sum())
    print(f"   Cropland pixels in NDVI extent: {cropland_in_ndvi}")
    print(f"   Cropland + valid NDVI: {matched_px}")

    if matched_px == 0:
        print("\n⚠️  PROBLEM: Zero cropland pixels overlap with valid NDVI!")
        print("   Grids likely misaligned. Check CRS mismatch between COG (4326) vs mask (32749).")
    else:
        ndvi_cropland = ndvi_data[aligned_valid]
        ndvi_mean = np.nanmean(ndvi_cropland)
        ndvi_std = np.nanstd(ndvi_cropland)
        ndvi_all_mean = np.nanmean(ndvi_data)
        print(f"   Cropland NDVI mean: {ndvi_mean:.4f} (std: {ndvi_std:.4f})")
        print(f"   All-land NDVI mean: {ndvi_all_mean:.4f}")
        diff = ndvi_mean - ndvi_all_mean
        print(f"   Δ (crop - all): {diff:+.4f}")
        if abs(diff) > 0.001:
            print("   ✓ Mask works — cropland values differ from all-land (expected)")
        else:
            print("   ⚠ Mask may not be working — values nearly identical")

    # Summary
    print(f"\n4. Summary:")
    print(f"   Mask bounds (UTM49S): {mask_bounds}")
    print(f"   NDVI bounds (4326):  {ndvi_bounds}")
    mask_bounds_4326 = transform_bounds(mask_crs, "EPSG:4326", *mask_bounds)
    ndvi_b_4326 = ndvi_bounds
    overlap = (
        max(mask_bounds_4326[0], ndvi_b_4326[0]) < min(mask_bounds_4326[2], ndvi_b_4326[2])
        and max(mask_bounds_4326[1], ndvi_b_4326[1]) < min(mask_bounds_4326[3], ndvi_b_4326[3])
    )
    print(f"   Bounds overlap (EPSG:4326): {'✓ YES' if overlap else '✗ NO'}")

finally:
    Path(tmp_path).unlink(missing_ok=True)
