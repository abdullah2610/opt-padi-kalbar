"""Sentinel-2 process graph orchestrator via openEO (CDSE)."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from cloudmask import mask_clouds
from indices import INDEX_FUNCTIONS
from kabupaten import bbox_for

log = logging.getLogger(__name__)

CDSE_OPENEO_URL = os.getenv("CDSE_OPENEO_URL", "https://openeo.dataspace.copernicus.eu")
S2_COLLECTION = "SENTINEL2_L2A"
S2_BANDS = ["B02", "B03", "B04", "B08", "B11", "B12", "SCL"]


@dataclass(frozen=True)
class CompositeRequest:
    kabupaten_id: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    max_cloud_cover: int = 60


def connect():
    """Connect ke CDSE openEO.

    Auth priority:
    1. Client credentials (server/CI) — kalau CDSE_CLIENT_ID + CDSE_CLIENT_SECRET di-set.
    2. Device code flow + refresh token cache — interaktif sekali, subsequent runs otomatis.
       Cache: ~/.config/openeo-python-client/refresh-tokens.json
    """
    import openeo

    conn = openeo.connect(CDSE_OPENEO_URL)
    client_id = os.getenv("CDSE_CLIENT_ID")
    client_secret = os.getenv("CDSE_CLIENT_SECRET")

    if client_id and client_secret:
        log.info("openEO auth: client_credentials")
        conn.authenticate_oidc_client_credentials(
            client_id=client_id,
            client_secret=client_secret,
        )
    else:
        log.info("openEO auth: refresh-token / device-flow fallback")
        def _display(msg: str) -> None:
            print(f"\n>>> {msg}\n", flush=True)
            log.info(msg)
        # High-level helper: try cached refresh_token first; if missing/expired,
        # fall back to device flow and persist refresh token to disk.
        conn.authenticate_oidc(
            display=_display,
            max_poll_time=900,
            store_refresh_token=True,
        )
    return conn


def build_composite(req: CompositeRequest) -> list[tuple[str, object]]:
    """Build openEO datacube, submit one batch job per index. Returns [(name, BatchJob), ...]."""
    bbox = bbox_for(req.kabupaten_id)
    if not bbox:
        raise ValueError(f"unknown kabupaten: {req.kabupaten_id}")

    conn = connect()
    cube = conn.load_collection(
        S2_COLLECTION,
        spatial_extent=bbox,
        temporal_extent=[req.start_date, req.end_date],
        bands=S2_BANDS,
        max_cloud_cover=req.max_cloud_cover,
    )
    cube = mask_clouds(cube)
    cube = cube.reduce_dimension(dimension="t", reducer="median")
    # Downsample 10m → 100m sebelum save: file 1/100 (Ketapang ~25MB ≤ Supabase Free 50MB hard limit),
    # cukup viz zoom 5-11 dan stats kabupaten-level. Set RESOLUTION_M=60 (Pro) / 20 (akurat) override.
    resolution_m = int(os.getenv("ETL_RESOLUTION_M", "100"))
    if resolution_m > 10:
        cube = cube.resample_spatial(resolution=resolution_m, method="average")

    jobs: list[tuple[str, object]] = []
    for name, fn in INDEX_FUNCTIONS.items():
        idx_cube = fn(cube)
        title = f"{req.kabupaten_id}-{name}-{req.end_date}"
        job = idx_cube.save_result(format="GTiff").execute_batch(
            title=title,
            description=f"opt-padi-kalbar composite {req.start_date}..{req.end_date}",
        )
        jobs.append((name, job))
        log.info("submitted batch job %s: %s", name, getattr(job, "job_id", job))

    return jobs
