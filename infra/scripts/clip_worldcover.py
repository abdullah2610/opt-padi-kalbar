#!/usr/bin/env python3
"""
Clip ESA WorldCover 2021 tiles per kabupaten Kalbar + resample 100m (mode).

Input:  infra/data/worldcover_raw/*.tif  (downloaded by fetch_worldcover.mjs)
Output: infra/data/worldcover/{kabupaten_id}.tif  (clipped + resampled to 100m)

Requirements: rasterio numpy shapely

Usage:
  python infra/scripts/clip_worldcover.py [--out-dir infra/data/worldcover] [--kabupaten pontianak]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.mask import mask as rasterio_mask
from rasterio.warp import calculate_default_transform, reproject, Resampling
from rasterio.transform import from_origin
from rasterio.io import MemoryFile
from shapely.geometry import mapping, shape

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
log = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
GEOJSON_PATH = REPO_ROOT / "infra" / "data" / "kabupaten_kalbar.geojson"

TARGET_RES_M = 100
CRS_UTM49S = "EPSG:32749"


def load_kabupaten_features() -> list[dict]:
    with GEOJSON_PATH.open(encoding="utf-8") as f:
        return json.load(f)["features"]


def resample_categorical(src: np.ndarray, src_transform, src_crs,
                          dst_shape: tuple, dst_transform, nodata: int) -> np.ndarray:
    """Mode (majority) resample for categorical raster."""
    from rasterio.warp import reproject
    dst = np.full(dst_shape, nodata, dtype=np.uint8)
    src_uint8 = src.astype(np.uint8) if src.dtype != np.uint8 else src

    with (
        MemoryFile() as src_mf,
        MemoryFile() as dst_mf,
    ):
        h, w = src.shape
        src_meta = {"driver": "GTiff", "count": 1, "dtype": "uint8",
                    "width": w, "height": h, "crs": src_crs,
                    "transform": src_transform, "nodata": nodata}
        with src_mf.open(**src_meta) as src_ds:
            src_ds.write(src_uint8, 1)

            dh, dw = dst_shape
            dst_meta = {"driver": "GTiff", "count": 1, "dtype": "uint8",
                       "width": dw, "height": dh, "crs": CRS_UTM49S,
                       "transform": dst_transform, "nodata": nodata}
            with dst_mf.open(**dst_meta) as dst_ds:
                reproject(
                    source=rasterio.band(src_ds, 1),
                    destination=rasterio.band(dst_ds, 1),
                    resampling=Resampling.mode,
                )
                dst = dst_ds.read(1)
    return dst


def clip_kabupaten(kab_id: str, geom: dict, raw_dir: Path, out_dir: Path) -> Path | None:
    """Clip WorldCover tiles to kab boundary, output UTM49S @100m."""
    out_path = out_dir / f"{kab_id}.tif"
    if out_path.exists():
        log.info("SKIP %s (exists)", kab_id)
        return out_path

    log.info("%s: finding intersecting tiles...", kab_id)

    all_tifs = sorted(raw_dir.glob("*.tif"))
    bbox_4326 = shape(geom).bounds

    intersecting = []
    nodata_val = 0
    for p in all_tifs:
        with rasterio.open(p) as ds:
            tb = ds.bounds
            if tb.left <= bbox_4326[2] and tb.right >= bbox_4326[0] and \
               tb.bottom <= bbox_4326[3] and tb.top >= bbox_4326[1]:
                intersecting.append(p)
            nodata_val = ds.nodata or 0

    if not intersecting:
        log.warning("%s: no tiles intersect — skipping", kab_id)
        return None

    log.info("%s: %d/%d tiles, clipping...", kab_id, len(intersecting), len(all_tifs))

    # Clip + merge intersecting tiles
    mem_files = []  # keep alive until after merge
    pieces = []
    for p in intersecting:
        ds = rasterio.open(p)
        try:
            clipped, ctf = rasterio_mask(ds, [geom], crop=True, nodata=nodata_val)
        except ValueError:
            ds.close()
            continue

        # Write clipped piece to MemoryFile so merge can use as dataset
        mf = MemoryFile()
        ch, cw = clipped.shape[1], clipped.shape[2]
        meta = {"driver": "GTiff", "count": 1, "dtype": "uint8",
                "width": cw, "height": ch, "crs": ds.crs,
                "transform": ctf, "nodata": nodata_val}
        with mf.open(**meta) as tmp:
            tmp.write(clipped)
        mem_files.append(mf)
        ds.close()

    if not mem_files:
        log.warning("%s: no valid data after clip — skipping", kab_id)
        return None

    if len(mem_files) == 1:
        with mem_files[0].open() as src:
            data = src.read(1)
            ctf = src.transform
            crs = src.crs
    else:
        open_ds = [mf.open() for mf in mem_files]
        try:
            merged, mtf = merge(open_ds, nodata=nodata_val, method="first")
            data = merged[0] if merged.ndim == 3 else merged
            ctf = mtf
            crs = open_ds[0].crs
        finally:
            for ds in open_ds:
                ds.close()

    h, w = data.shape
    log.info("%s: clipped %dx%d px (EPSG:4326)", kab_id, w, h)

    # Calculate UTM 49S bounds at 100m
    bbox_utm = rasterio.warp.transform_bounds(crs, CRS_UTM49S, *rasterio.transform.array_bounds(h, w, ctf))
    out_w = max(1, int((bbox_utm[2] - bbox_utm[0]) / TARGET_RES_M))
    out_h = max(1, int((bbox_utm[3] - bbox_utm[1]) / TARGET_RES_M))
    out_transform = from_origin(bbox_utm[0], bbox_utm[3], TARGET_RES_M, TARGET_RES_M)

    # Resample
    log.info("%s: resampling → %dx%d @100m (UTM49S)", kab_id, out_w, out_h)
    data_100m = resample_categorical(data, ctf, crs, (out_h, out_w), out_transform, int(nodata_val))

    out_dir.mkdir(parents=True, exist_ok=True)
    out_meta = {
        "driver": "GTiff", "count": 1, "dtype": "uint8",
        "width": out_w, "height": out_h,
        "crs": CRS_UTM49S, "transform": out_transform,
        "nodata": int(nodata_val), "compress": "deflate",
    }
    with rasterio.open(out_path, "w", **out_meta) as dst:
        dst.write(data_100m, 1)

    cropland_px = int((data_100m == 40).sum())
    total_px = int((data_100m != nodata_val).sum())
    cropland_pct = 100 * cropland_px / total_px if total_px > 0 else 0
    log.info("  OK %s: %dx%d, cropland=%d px (%.1f%%)", kab_id, out_w, out_h,
             cropland_px, cropland_pct)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default=str(REPO_ROOT / "infra" / "data" / "worldcover_raw"))
    parser.add_argument("--out-dir", default=str(REPO_ROOT / "infra" / "data" / "worldcover"))
    parser.add_argument("--kabupaten", default=None)
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    out_dir = Path(args.out_dir)
    features = load_kabupaten_features()

    if args.kabupaten:
        features = [f for f in features if f["properties"]["id"] == args.kabupaten]
        if not features:
            log.error("kabupaten not found: %s", args.kabupaten)
            sys.exit(1)

    log.info("Clipping %d kabupaten → %s", len(features), out_dir)
    ok = fail = 0
    for feat in features:
        kid = feat["properties"]["id"]
        geom = mapping(shape(feat["geometry"]))
        try:
            result = clip_kabupaten(kid, geom, raw_dir, out_dir)
        except Exception as exc:
            log.error("%s: FAIL — %s", kid, exc)
            fail += 1
            continue
        if result:
            ok += 1
        else:
            fail += 1

    log.info("Done: ok=%d fail=%d", ok, fail)
    if fail:
        log.info("Fix failures then run upload_worldcover.mjs")
        sys.exit(1)
    else:
        log.info("Next: node infra/scripts/upload_worldcover.mjs")


if __name__ == "__main__":
    main()
