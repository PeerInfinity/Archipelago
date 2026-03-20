"""ANIMAL WELL game-specific export handler.

ANIMAL WELL uses a list-of-lists rule format where rules are expressed as:
    any(state.has_all(sublist, player) for sublist in [[item1, item2], [item3], ...])

This means "(item1 AND item2) OR (item3) OR ..."

The world converts helper items and tech tricks to actual items during rule creation,
so by the time rules are exported, most helpers have already been expanded.

The remaining helpers that may appear in exported rules are handled by the
world_generator's rule_codegen.py, which converts them to Rule Builder format.

This handler primarily:
1. Provides game identification for automatic handler discovery
2. Can be extended in the future if specific export-time transformations are needed
"""

from typing import Dict, Any
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class AnimalWellGameExportHandler(GenericGameExportHandler):
    """Export handler for ANIMAL WELL.

    Currently minimal - the world does most helper expansion during rule creation.
    The world_generator handles any remaining transformations during code generation.
    """

    GAME_NAME = 'ANIMAL WELL'

    # Disable auto-export of discovered helpers - ANIMAL WELL handles this internally
    AUTO_EXPORT_DISCOVERED_HELPERS = False

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            logger.debug(f"Initialized ANIMAL WELL export handler for player {world.player}")
