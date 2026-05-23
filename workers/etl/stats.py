"""Raster statistics dengan rasterio."""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)


def compute_index_stats(cog_path: Path) -> dict:
    """Return mean, p10, p50, p90, std, area_clear_pct from a raster file."""
    import rasterio

    with rasterio.open(cog_path) as src:
        data = src.read(1, masked=True)

    valid = data.compressed()
    total = data.size
    if valid.size == 0:
        return {
            "mean": None,
            "p10": None,
            "p50": None,
            "p90": None,
            "std": None,
            "area_clear_pct": 0.0,
        }

    return {
        "mean": float(valid.mean()),
        "p10": float(np.percentile(valid, 10)),
        "p50": float(np.percentile(valid, 50)),
        "p90": float(np.percentile(valid, 90)),
        "std": float(valid.std()),
        "area_clear_pct": float(100 * valid.size / total),
    }
