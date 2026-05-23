"""Yield estimation v0 — linear regression on NDVI peak + BPS reference."""

from __future__ import annotations

import logging
import os

import numpy as np

log = logging.getLogger(__name__)

MODEL_VERSION = "linreg-v0"


def get_supabase_client():
    from supabase import create_client

    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def train_yield_v0(season: str) -> dict | None:
    """Fit linreg-v0 from bps_yield_reference + vegetation_indices NDVI peak."""
    client = get_supabase_client()
    bps = client.table("bps_yield_reference").select("*").execute().data or []
    if len(bps) < 3:
        log.warning("insufficient BPS reference rows (%d)", len(bps))
        return None

    X_rows, y_rows, kab_ids = [], [], []
    for row in bps:
        kid = row["kabupaten_id"]
        year = row["year"]
        vi = (
            client.table("vegetation_indices")
            .select("mean, observation_date")
            .eq("kabupaten_id", kid)
            .eq("index_name", "ndvi")
            .gte("observation_date", f"{year}-01-01")
            .lte("observation_date", f"{year}-12-31")
            .order("mean", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if not vi or vi[0].get("mean") is None or not row.get("ton_produksi"):
            continue
        X_rows.append([vi[0]["mean"], row.get("hektar_panen") or 0])
        y_rows.append(row["ton_produksi"])
        kab_ids.append(kid)

    if len(X_rows) < 3:
        log.warning("insufficient training pairs (%d)", len(X_rows))
        return None

    X = np.array(X_rows, dtype=np.float64)
    y = np.array(y_rows, dtype=np.float64)
    X_aug = np.column_stack([X, np.ones(len(X))])
    coef, _, _, _ = np.linalg.lstsq(X_aug, y, rcond=None)

    model = {
        "coef_ndvi": float(coef[0]),
        "coef_area": float(coef[1]),
        "intercept": float(coef[2]),
        "n_samples": len(X_rows),
    }
    log.info("linreg-v0 fitted: %s", model)

    for kid in kab_ids:
        peak = (
            client.table("vegetation_indices")
            .select("mean")
            .eq("kabupaten_id", kid)
            .eq("index_name", "ndvi")
            .order("observation_date", desc=True)
            .limit(1)
            .execute()
            .data
        )
        ndvi_peak = peak[0]["mean"] if peak else None
        if ndvi_peak is None:
            continue
        area = next((r.get("hektar_panen") for r in bps if r["kabupaten_id"] == kid), 0) or 0
        ton = float(model["coef_ndvi"] * ndvi_peak + model["coef_area"] * area + model["intercept"])
        ton = max(0.0, ton)
        ton_per_ha = ton / area if area else None
        client.table("yield_estimates").upsert(
            {
                "kabupaten_id": kid,
                "season": season,
                "ton_estimated": ton,
                "ton_per_ha": ton_per_ha,
                "area_sawah_ha": area,
                "model_version": MODEL_VERSION,
                "confidence": min(0.95, 0.5 + 0.05 * model["n_samples"]),
                "features_used": {"ndvi_peak": ndvi_peak, "area_sawah_ha": area},
            },
            on_conflict="kabupaten_id,season,model_version",
        ).execute()

    return model
