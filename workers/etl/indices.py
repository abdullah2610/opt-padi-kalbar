"""Formula indeks vegetasi sebagai openEO datacube operations.

Sentinel-2 bands:
  B02 (blue 490 nm), B03 (green 560 nm), B04 (red 665 nm),
  B08 (NIR 842 nm), B11 (SWIR1 1610 nm), B12 (SWIR2 2190 nm)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openeo.rest.datacube import DataCube


def ndvi(cube: "DataCube") -> "DataCube":
    """(B08 - B04) / (B08 + B04)"""
    b08 = cube.band("B08")
    b04 = cube.band("B04")
    return (b08 - b04) / (b08 + b04)


def ndwi(cube: "DataCube") -> "DataCube":
    """(B03 - B08) / (B03 + B08) — McFeeters 1996, vegetation water content."""
    b03 = cube.band("B03")
    b08 = cube.band("B08")
    return (b03 - b08) / (b03 + b08)


def mndwi(cube: "DataCube") -> "DataCube":
    """(B03 - B11) / (B03 + B11) — Xu 2006, open water / flood detection."""
    b03 = cube.band("B03")
    b11 = cube.band("B11")
    return (b03 - b11) / (b03 + b11)


def ndmi(cube: "DataCube") -> "DataCube":
    """(B08 - B11) / (B08 + B11) — canopy moisture / drought."""
    b08 = cube.band("B08")
    b11 = cube.band("B11")
    return (b08 - b11) / (b08 + b11)


def msi(cube: "DataCube") -> "DataCube":
    """B11 / B08 — Moisture Stress Index, > 1.2 = water stress."""
    return cube.band("B11") / cube.band("B08")


def evi(cube: "DataCube") -> "DataCube":
    """2.5 * (B08 - B04) / (B08 + 6*B04 - 7.5*B02 + 1) — Enhanced VI."""
    b02 = cube.band("B02")
    b04 = cube.band("B04")
    b08 = cube.band("B08")
    return 2.5 * (b08 - b04) / (b08 + 6 * b04 - 7.5 * b02 + 1)


INDEX_FUNCTIONS = {
    "ndvi": ndvi,
    "ndwi": ndwi,
    "mndwi": mndwi,
    "ndmi": ndmi,
    "msi": msi,
    "evi": evi,
}

# Rescale + colormap untuk TiTiler tile rendering
INDEX_RENDERING = {
    "ndvi": {"rescale": (-0.2, 0.9), "colormap_name": "rdylgn"},
    "ndwi": {"rescale": (-0.5, 0.5), "colormap_name": "brbg"},
    "mndwi": {"rescale": (-0.5, 0.8), "colormap_name": "blues"},
    "ndmi": {"rescale": (-0.5, 0.5), "colormap_name": "rdbu"},
    "msi": {"rescale": (0.0, 2.0), "colormap_name": "viridis"},
    "evi": {"rescale": (-0.2, 0.9), "colormap_name": "rdylgn"},
}
