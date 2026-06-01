"""Raster statistics dengan rasterio."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

MIN_VALID_PIXELS = int(os.getenv("ETL_MIN_VALID_PIXELS", "1000"))


def compute_index_stats(cog_path: Path, min_valid_pixels: int = MIN_VALID_PIXELS) -> dict:
    """Return mean, p10, p50, p90, std, area_clear_pct from a raster file.

    Returns None values if valid pixel count < min_valid_pixels (guard for sparse
    cropland masks where stats would be meaningless).
    """
    import rasterio

    with rasterio.open(cog_path) as src:
        data = src.read(1, masked=True)

    valid = data.compressed()
    total = data.size
    if valid.size == 0 or valid.size < min_valid_pixels:
        if valid.size > 0:
            log.warning(
                "compute_index_stats: %s has only %d valid pixels < min=%d — returning null stats",
                cog_path.name, valid.size, min_valid_pixels,
            )
        return {
            "mean": None,
            "p10": None,
            "p50": None,
            "p90": None,
            "std": None,
            "area_clear_pct": float(100 * valid.size / total) if total > 0 else 0.0,
        }

    return {
        "mean": float(valid.mean()),
        "p10": float(np.percentile(valid, 10)),
        "p50": float(np.percentile(valid, 50)),
        "p90": float(np.percentile(valid, 90)),
        "std": float(valid.std()),
        "area_clear_pct": float(100 * valid.size / total),
    }
