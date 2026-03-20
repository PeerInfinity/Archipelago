"""Yu-Gi-Oh! 2006 game-specific export handler."""

from ..base import GenericGameExportHandler


class Yugioh06GameExportHandler(GenericGameExportHandler):
    """Export handler for Yu-Gi-Oh! 2006.

    Uses the GenericGameExportHandler which intelligently handles
    rule analysis and helper function detection.
    """

    # Disable automatic helper export (use old behavior)
    AUTO_EXPORT_DISCOVERED_HELPERS = False

    # Custom helper functions defined in worlds/yugioh06/rules.py and fusions.py
    # These helpers are implemented in JavaScript and should not be inlined.
    # Using HELPERS_TO_PRESERVE instead of overriding should_preserve_as_helper()
    HELPERS_TO_PRESERVE = {
        'yugioh06_difficulty',  # Wraps has_from_list with core_booster
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
