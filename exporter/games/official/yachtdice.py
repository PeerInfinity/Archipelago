"""Yacht Dice game-specific export handler."""

from typing import Dict, Any, Set
from ..base import GenericGameExportHandler


class YachtDiceGameExportHandler(GenericGameExportHandler):
    """Yacht Dice specific rule expander."""

    # dice_simulation_state_change is too complex to export because:
    # 1. It uses state.prog_items which is not available in JavaScript
    # 2. It has complex loops, probability distributions, and caching
    # 3. The JavaScript helper function must be called directly
    HELPERS_TO_EXPORT_BLACKLIST: Set[str] = {
        'dice_simulation_state_change',
    }

    # Enable upfront item adding for sphere test compatibility
    # Yacht Dice calculates the maximum achievable score based on collected items.
    # This ensures the comparison happens with the exact items from the sphere log
    # rather than accumulating items as locations are checked.
    ADD_SPHERE_ITEMS_UPFRONT = True
