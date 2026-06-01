"""Load ESA WorldCover 2021 cropland mask dari Supabase Storage.

WorldCover class 40 = Cropland (sawah, ladang, tanaman semusim).
Mask di-cache per-session; satu file ~5 MB per kabupaten.
"""

from __future__ import annotations

import logging
import os
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
WORLDCOVER_BUCKET = "assets"
WORLDCOVER_PREFIX = "worldcover"
WORLDCOVER_CLASS_CROPLAND = 40

MIN_CROPLAND_PIXELS = int(os.getenv("ETL_MIN_CROPLAND_PIXELS", "1000"))


def worldcover_public_url(kabupaten_id: str) -> str:
    """Construct public URL untuk WorldCover clipped tile dari Supabase Storage."""
    base = SUPABASE_URL.rstrip("/")
    return f"{base}/storage/v1/object/public/{WORLDCOVER_BUCKET}/{WORLDCOVER_PREFIX}/{kabupaten_id}.tif"


@lru_cache(maxsize=20)
def load_cropland_mask(kabupaten_id: str) -> tuple[np.ndarray, object, object]:
    """Fetch WorldCover tile dari Supabase Storage, return (mask_bool, transform, crs).

    mask_bool: numpy bool array True=cropland (class 40), shape (H, W)
    Cached per kabupaten_id per session (file ~5 MB → fits in memory).

    Raises:
        RuntimeError: jika URL 404 atau file corrupt
    """
    import requests
    import rasterio

    url = worldcover_public_url(kabupaten_id)
    log.info("WorldCover: fetching mask for %s from %s", kabupaten_id, url)

    resp = requests.get(url, timeout=60)
    if resp.status_code == 404:
        raise RuntimeError(
            f"WorldCover tile not found for {kabupaten_id}: {url}\n"
            "Run: node infra/scripts/fetch_worldcover.mjs && "
            "python infra/scripts/clip_worldcover.py && "
            "node infra/scripts/upload_worldcover.mjs"
        )
    resp.raise_for_status()

    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp.write(resp.content)
        tmp_path = tmp.name

    try:
        with rasterio.open(tmp_path) as src:
            data = src.read(1)
            transform = src.transform
            crs = src.crs
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    mask = data == WORLDCOVER_CLASS_CROPLAND
    cropland_px = int(mask.sum())
    log.info(
        "WorldCover %s: shape=%s cropland=%d px (%.1f%%)",
        kabupaten_id, mask.shape, cropland_px,
        100 * cropland_px / mask.size if mask.size > 0 else 0,
    )

    if cropland_px < MIN_CROPLAND_PIXELS:
        log.warning(
            "WorldCover %s: only %d cropland pixels < MIN_CROPLAND_PIXELS=%d — "
            "stats will return None (check WorldCover tile alignment)",
            kabupaten_id, cropland_px, MIN_CROPLAND_PIXELS,
        )

    return mask, transform, crs


def cropland_area_ha(kabupaten_id: str, pixel_size_m: int = 100) -> float | None:
    """Hitung luas cropland dalam hektar dari WorldCover mask.

    pixel_size_m: resolusi pixel dalam meter (default 100m → 1 ha/pixel).
    """
    try:
        mask, _, _ = load_cropland_mask(kabupaten_id)
    except Exception as exc:
        log.warning("cropland_area_ha: cannot load mask for %s: %s", kabupaten_id, exc)
        return None
    px_count = int(mask.sum())
    ha_per_px = (pixel_size_m ** 2) / 10_000  # 10m²/ha conversion
    return float(px_count * ha_per_px)
