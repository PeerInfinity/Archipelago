"""Yacht Dice game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class YachtDiceGameExportHandler(GenericGameExportHandler):
    """Yacht Dice specific rule expander."""

    GAME_NAME = 'Yacht Dice'

    # Inherit all default behavior from GenericGameExportHandler
    # Only override methods when custom behavior is needed

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Determine if a function should be preserved as a helper call rather than inlined.

        For Yacht Dice, dice_simulation_state_change must be preserved as a helper because:
        1. It uses state.prog_items which is not available in JavaScript
        2. It performs complex caching and simulation logic
        3. The JavaScript helper function needs to be called directly

        Args:
            func_name: The name of the function being called

        Returns:
            True if the function should be preserved as a helper, False otherwise
        """
        # Preserve dice_simulation_state_change as a helper function call
        if func_name == 'dice_simulation_state_change':
            logger.debug(f"Preserving {func_name} as helper function")
            return True

        # Use default behavior for other functions
        return False
