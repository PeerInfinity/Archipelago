"""Yu-Gi-Oh! 2006 game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Yugioh06GameExportHandler(GenericGameExportHandler):
    """Export handler for Yu-Gi-Oh! 2006.

    Uses the GenericGameExportHandler which intelligently handles
    rule analysis and helper function detection.
    """

    GAME_NAME = 'Yu-Gi-Oh! 2006'

    # List of custom helper functions defined in worlds/yugioh06/rules.py and fusions.py
    CUSTOM_HELPERS = {
        'only_light',
        'only_dark',
        'only_earth',
        'only_water',
        'only_fire',
        'only_wind',
        'only_fairy',
        'only_warrior',
        'only_zombie',
        'only_dragon',
        'only_spellcaster',
        'equip_unions',
        'can_gain_lp_every_turn',
        'only_normal',
        'only_level',
        'spell_counter',
        'take_control',
        'only_toons',
        'only_spirit',
        'pacman_deck',
        'quick_plays',
        'counter_traps',
        'back_row_removal',
        'count_has_materials',
    }

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Preserve Yu-Gi-Oh! 2006 custom helper functions as helper calls.

        These helpers are implemented in JavaScript and should not be inlined.
        """
        return func_name in self.CUSTOM_HELPERS
