"""Loader GeoJSON 14 kabupaten/kota Kalbar."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

from shapely.geometry import shape

log = logging.getLogger(__name__)

# workers/etl → repo root
GEOJSON_PATH = Path(__file__).resolve().parents[2] / "infra" / "data" / "kabupaten_kalbar.geojson"

KABUPATEN_IDS = (
    "sambas", "bengkayang", "landak", "mempawah", "sanggau", "ketapang",
    "sintang", "kapuas-hulu", "sekadau", "melawi", "kayong-utara", "kubu-raya",
    "pontianak", "singkawang",
)


@lru_cache(maxsize=1)
def load_features() -> list[dict]:
    if not GEOJSON_PATH.exists():
        log.warning("GeoJSON not found at %s — run infra/scripts/fetch_kabupaten.mjs", GEOJSON_PATH)
        return []
    with GEOJSON_PATH.open(encoding="utf-8") as f:
        gj = json.load(f)
    return gj.get("features", [])


def bbox_for(kabupaten_id: str) -> dict[str, float] | None:
    """Return openEO spatial_extent dict {west, south, east, north}."""
    for feat in load_features():
        if feat.get("properties", {}).get("id") == kabupaten_id:
            geom = shape(feat["geometry"])
            minx, miny, maxx, maxy = geom.bounds
            return {
                "west": float(minx),
                "south": float(miny),
                "east": float(maxx),
                "north": float(maxy),
            }
    log.error("kabupaten not found in GeoJSON: %s", kabupaten_id)
    return None
