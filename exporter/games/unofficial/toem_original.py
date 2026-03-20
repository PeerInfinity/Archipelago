"""TOEM game-specific export handler.

TOEM's location groups are stored as sets (set[str]), so locations are added
to regions in non-deterministic set iteration order. Enabling
SORT_REGION_LOCATIONS_BY_NAME ensures a deterministic output without modifying
the world code.

This handler covers both toem_original and toem_original_worldgen (the latter
falls back to this handler via the _worldgen suffix stripping in __init__.py).
"""

from ..base import GenericGameExportHandler


class ToemOriginalExportHandler(GenericGameExportHandler):
    """Export handler for TOEM."""

    SORT_REGION_LOCATIONS_BY_NAME: bool = True
