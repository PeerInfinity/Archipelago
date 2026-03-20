# exporter/games/pokemon_emerald.py

from ..base import GenericGameExportHandler
from typing import Any, Dict, Optional
from BaseClasses import ItemClassification
import logging

logger = logging.getLogger(__name__)


class PokemonEmeraldGameExportHandler(GenericGameExportHandler):
    """Pokemon Emerald specific export handler."""

    # Disable automatic helper export (use old behavior)
    AUTO_EXPORT_DISCOVERED_HELPERS = False

    # Mapping of HM names to helper function names
    HM_TO_HELPER = {
        "HM01 Cut": "can_cut",
        "HM02 Fly": "can_fly",
        "HM03 Surf": "can_surf",
        "HM04 Strength": "can_strength",
        "HM05 Flash": "can_flash",
        "HM06 Rock Smash": "can_rock_smash",
        "HM07 Waterfall": "can_waterfall",
        "HM08 Dive": "can_dive",
    }

    def get_game_info(self, world) -> Dict[str, Any]:
        """Export Pokemon Emerald specific game information."""
        game_info = super().get_game_info(world)

        # Export hm_requirements which maps HM names to badge requirements
        # This is used to build hm_rules in the frontend
        if hasattr(world, 'hm_requirements'):
            game_info['hm_requirements'] = world.hm_requirements
        else:
            game_info['hm_requirements'] = {}

        return game_info

    def get_world_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Pokemon Emerald specific world data."""
        # Get base world data
        world_data = super().get_world_data(world, multiworld, player)

        # Also include hm_requirements in world data for easy access
        if hasattr(world, 'hm_requirements'):
            world_data['hm_requirements'] = world.hm_requirements

        return world_data

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return Pokemon Emerald-specific item table data.

        Updates items that were converted to events at runtime (item.code = None)
        but were already in item_name_to_id. New event items are handled by
        GenericGameExportHandler.
        """
        # Get base item data from parent (handles new event items)
        item_data = super().get_item_data(world)

        # Update existing items that have been converted to events at runtime
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    # Check if this is an event item that exists but isn't marked as event
                    if (location.item.code is None and
                        item_name in item_data and
                        not item_data[item_name]['event']):
                        logger.info(f"Correcting {item_name} to event based on runtime placement")
                        item_classification = location.item.classification
                        item_data[item_name]['event'] = True
                        item_data[item_name]['type'] = 'Event'
                        item_data[item_name]['id'] = None
                        item_data[item_name]['advancement'] = item_classification == ItemClassification.progression
                        item_data[item_name]['useful'] = item_classification == ItemClassification.useful
                        item_data[item_name]['trap'] = item_classification == ItemClassification.trap
                        if 'Event' not in item_data[item_name]['groups']:
                            item_data[item_name]['groups'].append('Event')
                            item_data[item_name]['groups'].sort()

        return item_data

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """
        Expand Pokemon Emerald specific rule patterns.

        Specifically handles hm_rules["HM_NAME"]() pattern and converts it
        to helper function calls like can_surf(), can_cut(), etc.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle function_call with subscript accessing hm_rules
        if rule.get('type') == 'function_call':
            func = rule.get('function', {})
            if (isinstance(func, dict) and
                func.get('type') == 'subscript' and
                isinstance(func.get('value'), dict) and
                func['value'].get('type') == 'name' and
                func['value'].get('name') == 'hm_rules' and
                isinstance(func.get('index'), dict) and
                func['index'].get('type') == 'constant'):

                # Extract the HM name from the subscript index
                hm_name = func['index'].get('value')

                # Convert to helper function call
                if hm_name in self.HM_TO_HELPER:
                    helper_name = self.HM_TO_HELPER[hm_name]
                    logger.debug(f"Converting hm_rules['{hm_name}']() to helper '{helper_name}'")
                    return {
                        'type': 'helper',
                        'name': helper_name,
                        'args': []
                    }
                else:
                    logger.warning(f"Unknown HM in hm_rules: {hm_name}")

        # Recursively expand nested rules
        return super().expand_rule(rule, _depth)
