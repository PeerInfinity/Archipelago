"""Bomb Rush Cyberfunk helper expander."""

from typing import Set
from ..base import GenericGameExportHandler


class BombRushCyberfunkGameExportHandler(GenericGameExportHandler):
    """Export handler for Bomb Rush Cyberfunk.

    Simplifications:
    - HELPERS_TO_EXPORT_BLACKLIST: Complex helpers that use loops/globals()
      and require JavaScript implementations in the frontend.
    - ACCUMULATOR_RULES + PROG_ITEMS_INIT: Declarative REP accumulation using
      pattern matching (extracts numeric value from "N REP" item names).
    """

    # Complex helpers that use loops/globals() and need JavaScript implementations
    # These are excluded from auto-export and automatically preserved as helper calls
    # JS implementations: frontend/modules/shared/gameLogic/bomb_rush_cyberfunk/
    HELPERS_TO_EXPORT_BLACKLIST: Set[str] = {
        'graffiti_spots',
        'build_access_cache',
        'spots_s_glitchless',
        'spots_s_glitched',
        'spots_m_glitchless',
        'spots_m_glitched',
        'spots_l_glitchless',
        'spots_l_glitched',
        'spots_xl_glitchless',
        'spots_xl_glitched',
    }

    # REP accumulator configuration: extracts numeric value from item names like "8 REP"
    # and adds to the "rep" counter in prog_items (checked by the rep() helper)
    ACCUMULATOR_RULES = [{
        'pattern': r'^(\d+) REP$',
        'extract_value': True,
        'target': 'rep',
    }]

    PROG_ITEMS_INIT = {'rep': 0}
