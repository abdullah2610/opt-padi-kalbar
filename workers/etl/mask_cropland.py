"""Apply cropland mask ke raster COG dan hitung stats.

Dua path:
1. apply_cropland_to_array()  — numpy (setelah download), mask non-40 pixels → NaN/nodata
2. apply_cropland_to_file()   — baca file .tif, tulis file baru *_crop.tif dengan mask applied

Worldcover mask (boolean array, True=cropland) harus sudah di-align ke grid raster target.
Alignment validate dulu via spike_alignment.py sebelum production run.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

WORLDCOVER_NODATA = 0
ETL_NODATA_F32 = float("nan")


def align_mask_to_raster(mask: np.ndarray, mask_transform, mask_crs,
                          raster_shape: tuple[int, int], raster_transform, raster_crs) -> np.ndarray:
    """Reproject + resample WorldCover boolean mask ke grid raster target.

    Returns boolean array shape == raster_shape, True=cropland.
    Gunakan bila CRS atau resolution berbeda (biasanya UTM vs EPSG:4326 native openEO output).
    """
    import rasterio
    from rasterio.warp import reproject, Resampling

    mask_uint8 = mask.astype(np.uint8)
    aligned = np.zeros(raster_shape, dtype=np.uint8)

    with (
        rasterio.MemoryFile() as src_mf,
        rasterio.MemoryFile() as dst_mf,
    ):
        src_h, src_w = mask.shape
        src_meta = {
            "driver": "GTiff",
            "count": 1,
            "dtype": "uint8",
            "height": src_h,
            "width": src_w,
            "crs": mask_crs,
            "transform": mask_transform,
        }
        with src_mf.open(**src_meta) as src:
            src.write(mask_uint8, 1)
            dst_h, dst_w = raster_shape
            dst_meta = {
                "driver": "GTiff",
                "count": 1,
                "dtype": "uint8",
                "height": dst_h,
                "width": dst_w,
                "crs": raster_crs,
                "transform": raster_transform,
            }
            with dst_mf.open(**dst_meta) as dst:
                reproject(
                    source=rasterio.band(src, 1),
                    destination=rasterio.band(dst, 1),
                    resampling=Resampling.nearest,
                )
                aligned = dst.read(1)

    return aligned.astype(bool)


def apply_cropland_to_array(data: np.ndarray, mask: np.ndarray,
                             nodata_in=None, nodata_out=ETL_NODATA_F32) -> np.ndarray:
    """Mask non-cropland pixels, return float32 array dengan nodata_out di non-cropland.

    data: float32 (H, W) — raster nilai indeks
    mask: bool (H, W) — True = cropland (keep), False = non-cropland (set nodata_out)
    """
    if data.shape != mask.shape:
        raise ValueError(
            f"Shape mismatch: raster {data.shape} vs mask {mask.shape}. "
            "Call align_mask_to_raster() dulu."
        )

    result = data.astype(np.float32)

    # Mask nodata_in pixels
    if nodata_in is not None and not np.isnan(nodata_in):
        existing_nodata = data == nodata_in
    else:
        existing_nodata = np.isnan(data)

    # Non-cropland → set nodata
    non_crop = ~mask
    result[non_crop] = nodata_out if not np.isnan(nodata_out) else np.nan
    result[existing_nodata] = nodata_out if not np.isnan(nodata_out) else np.nan

    cropland_valid = mask & ~existing_nodata
    log.debug(
        "apply_cropland: %d cropland px, %d valid after mask (%.1f%%)",
        mask.sum(), cropland_valid.sum(),
        100 * cropland_valid.sum() / mask.size if mask.size > 0 else 0,
    )
    return result


def apply_cropland_to_file(src_path: Path, mask: np.ndarray, mask_transform, mask_crs) -> Path:
    """Read src_path, apply cropland mask, write {stem}_crop.tif next to src.

    Returns path to masked output file.
    align_mask_to_raster() called internally if grids differ.
    """
    import rasterio

    out_path = src_path.with_name(f"{src_path.stem}_crop{src_path.suffix}")

    with rasterio.open(src_path) as src:
        data = src.read(1)
        meta = src.meta.copy()
        raster_transform = src.transform
        raster_crs = src.crs
        nodata_in = src.nodata

    raster_shape = data.shape

    # Align mask if needed
    same_grid = (
        mask.shape == raster_shape
        and str(mask_crs) == str(raster_crs)
        # Basic transform check (origin + res)
        and abs(mask_transform.c - raster_transform.c) < 1e-6
        and abs(mask_transform.f - raster_transform.f) < 1e-6
        and abs(mask_transform.a - raster_transform.a) < 1e-6
    )

    if not same_grid:
        log.info("Grid mismatch — reprojecting WorldCover mask to raster grid")
        aligned_mask = align_mask_to_raster(
            mask, mask_transform, mask_crs,
            raster_shape, raster_transform, raster_crs,
        )
    else:
        aligned_mask = mask

    nodata_val = nodata_in if nodata_in is not None else np.nan
    masked_data = apply_cropland_to_array(data.astype(np.float32), aligned_mask,
                                          nodata_in=nodata_in, nodata_out=nodata_val)

    meta.update({"dtype": "float32", "nodata": nodata_val})
    with rasterio.open(out_path, "w", **meta) as dst:
        dst.write(masked_data, 1)

    log.info("Wrote masked raster: %s", out_path)
    return out_path


def count_cropland_pixels(mask: np.ndarray) -> int:
    return int(mask.sum())
