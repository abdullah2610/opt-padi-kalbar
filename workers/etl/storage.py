"""Upload COG ke Supabase Storage + insert row ke Postgres."""

from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path

log = logging.getLogger(__name__)

BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "composites")


def get_supabase_client():
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


def midpoint_date(period_start: str, period_end: str) -> str:
    d0 = date.fromisoformat(period_start)
    d1 = date.fromisoformat(period_end)
    mid = d0 + (d1 - d0) / 2
    return mid.isoformat()


def upload_cog(local_path: Path, remote_path: str) -> str:
    """Convert to COG and upload to Supabase Storage."""
    from rio_cogeo.cogeo import cog_translate
    from rio_cogeo.profiles import cog_profiles

    cog_path = local_path.with_suffix(".cog.tif")
    cog_translate(
        str(local_path),
        str(cog_path),
        cog_profiles.get("deflate"),
        in_memory=False,
        quiet=True,
    )

    client = get_supabase_client()
    with cog_path.open("rb") as f:
        client.storage.from_(BUCKET).upload(
            path=remote_path,
            file=f.read(),
            file_options={"content-type": "image/tiff", "upsert": "true"},
        )
    log.info("uploaded COG → %s/%s", BUCKET, remote_path)
    return remote_path


def insert_composite_row(
    kabupaten_id: str,
    period_start: str,
    period_end: str,
    cog_paths: dict[str, str],
    scl_clear_pct: float | None,
    indices_stats: dict[str, dict],
    scene_count: int | None = None,
    cropland_mask_path: str | None = None,
    cropland_pixel_count: int | None = None,
    cropland_area_ha: float | None = None,
) -> None:
    """Upsert sentinel_composites + vegetation_indices rows.

    indices_stats may contain both raw ("ndvi") and cropland ("ndvi_crop") keys.
    Both are inserted as separate vegetation_indices rows with the appropriate index_name.
    """
    client = get_supabase_client()
    obs_date = midpoint_date(period_start, period_end)

    composite_row = {
        "kabupaten_id": kabupaten_id,
        "period_start": period_start,
        "period_end": period_end,
        "cog_paths": cog_paths,
        "scl_clear_pct": scl_clear_pct,
        "indices_stats": indices_stats,
        "status": "completed",
        "scene_count": scene_count,
    }
    # Optional cropland metadata columns (added by migration 011)
    if cropland_mask_path is not None:
        composite_row["cropland_mask_path"] = cropland_mask_path
    if cropland_pixel_count is not None:
        composite_row["cropland_pixel_count"] = cropland_pixel_count
    if cropland_area_ha is not None:
        composite_row["cropland_area_ha"] = cropland_area_ha

    res = (
        client.table("sentinel_composites")
        .upsert(composite_row, on_conflict="kabupaten_id,period_start,period_end")
        .execute()
    )
    composite_id = res.data[0]["id"] if res.data else None

    for index_name, stats in indices_stats.items():
        if not isinstance(stats, dict):
            continue
        mean = stats.get("mean")
        anomaly_z = None
        if mean is not None:
            try:
                z_res = client.rpc(
                    "compute_anomaly_z",
                    {
                        "p_kab": kabupaten_id,
                        "p_index": index_name,
                        "p_obs_date": obs_date,
                        "p_mean": mean,
                    },
                ).execute()
                if z_res.data is not None:
                    anomaly_z = z_res.data
            except Exception:
                pass
        row = {
            "composite_id": composite_id,
            "kabupaten_id": kabupaten_id,
            "observation_date": obs_date,
            "index_name": index_name,
            "mean": mean,
            "p10": stats.get("p10"),
            "p50": stats.get("p50"),
            "p90": stats.get("p90"),
            "std": stats.get("std"),
            "anomaly_z": anomaly_z,
            "area_clear_pct": stats.get("area_clear_pct"),
        }
        client.table("vegetation_indices").upsert(
            row,
            on_conflict="kabupaten_id,observation_date,index_name",
        ).execute()

    try:
        client.rpc("detect_stress", {"p_kab": kabupaten_id}).execute()
    except Exception as exc:
        log.warning("detect_stress RPC skipped: %s", exc)

    log.info("inserted composite + %d index rows for %s", len(indices_stats), kabupaten_id)


def insert_landcover_row(
    kabupaten_id: str,
    observation_date: str,
    class_code: int,
    class_name: str,
    area_ha: float,
    total_ha: float,
    source: str = "worldcover_2021",
) -> None:
    """Upsert landcover row (by-product of WorldCover mask processing)."""
    client = get_supabase_client()
    area_pct = round(100 * area_ha / total_ha, 4) if total_ha > 0 else 0.0
    client.table("landcover").upsert(
        {
            "kabupaten_id": kabupaten_id,
            "observation_date": observation_date,
            "class_code": class_code,
            "class_name": class_name,
            "area_ha": round(area_ha, 2),
            "area_pct": area_pct,
            "source": source,
        },
        on_conflict="kabupaten_id,observation_date,class_code",
    ).execute()
    log.debug("landcover upserted: %s %s class=%d %.0f ha (%.1f%%)",
              kabupaten_id, observation_date, class_code, area_ha, area_pct)


def mark_composite_failed(kabupaten_id: str, period_start: str, period_end: str, message: str) -> None:
    client = get_supabase_client()
    client.table("sentinel_composites").upsert(
        {
            "kabupaten_id": kabupaten_id,
            "period_start": period_start,
            "period_end": period_end,
            "status": "failed",
            "error_message": message[:2000],
            "cog_paths": {},
            "indices_stats": {},
        },
        on_conflict="kabupaten_id,period_start,period_end",
    ).execute()
