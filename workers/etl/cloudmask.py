"""Cloud / shadow masking via Sentinel-2 SCL band.

SCL class codes:
  0  NO_DATA
  1  SATURATED_OR_DEFECTIVE
  2  DARK_AREA_PIXELS
  3  CLOUD_SHADOWS         <- reject
  4  VEGETATION            <- keep
  5  BARE_SOIL             <- keep
  6  WATER                 <- keep
  7  UNCLASSIFIED          <- keep
  8  CLOUD_MEDIUM_PROB     <- reject
  9  CLOUD_HIGH_PROB       <- reject
  10 THIN_CIRRUS           <- reject
  11 SNOW_ICE              <- reject (tropis, jarang)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openeo.rest.datacube import DataCube

REJECT_CLASSES = (3, 8, 9, 10, 11)
KEEP_CLASSES = (4, 5, 6, 7)


def mask_clouds(cube: "DataCube") -> "DataCube":
    """Apply SCL-based cloud mask to a Sentinel-2 datacube."""
    scl = cube.band("SCL")
    mask = scl == REJECT_CLASSES[0]
    for cls in REJECT_CLASSES[1:]:
        mask = mask | (scl == cls)
    return cube.mask(mask)
