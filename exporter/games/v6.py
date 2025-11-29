"""VVVVVV game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class V6GameExportHandler(GenericGameExportHandler):
    """Export handler for VVVVVV that exports door_cost and area_cost_map."""

    GAME_NAME = 'VVVVVV'

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts VVVVVV-specific settings including door_cost and area_cost_map."""
        # Get base settings from parent class
        settings_dict = super().get_settings_data(world, multiworld, player)

        # Add VVVVVV-specific settings
        try:
            # Export door_cost option value
            if hasattr(world, 'options') and hasattr(world.options, 'door_cost'):
                door_cost_value = world.options.door_cost.value
                settings_dict['door_cost'] = door_cost_value
                logger.debug(f"Exported door_cost = {door_cost_value}")

            # Export area_cost_map if it exists on the world
            if hasattr(world, 'area_cost_map'):
                # Convert to regular dict for JSON serialization
                area_cost_map = dict(world.area_cost_map)
                settings_dict['area_cost_map'] = area_cost_map
                logger.debug(f"Exported area_cost_map = {area_cost_map}")
            else:
                logger.warning("area_cost_map not found on world instance")

        except Exception as e:
            logger.error(f"Error exporting VVVVVV settings: {e}")

        return settings_dict
