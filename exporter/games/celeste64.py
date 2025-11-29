"""Celeste 64 helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Celeste64GameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Celeste 64'
    """Celeste 64 expander that handles game-specific rules."""

    def __init__(self, world=None):
        """Initialize with world instance to access options."""
        super().__init__()
        self.world = world

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """
        Get Celeste 64 settings including the logic mappings.

        This overrides the base get_settings_data to include the location
        and region logic mappings that are needed for rule evaluation.
        """
        # Get base settings from parent class
        settings_dict = super().get_settings_data(world, multiworld, player)

        try:
            # Import the Rules module to get the logic mappings
            from worlds.celeste64 import Rules

            # Export the location logic mappings
            settings_dict['location_standard_moves_logic'] = self._convert_logic_mapping(
                Rules.location_standard_moves_logic
            )
            settings_dict['location_hard_moves_logic'] = self._convert_logic_mapping(
                Rules.location_hard_moves_logic
            )

            # Export the region connection logic mappings
            settings_dict['region_standard_moves_logic'] = self._convert_region_logic_mapping(
                Rules.region_standard_moves_logic
            )
            settings_dict['region_hard_moves_logic'] = self._convert_region_logic_mapping(
                Rules.region_hard_moves_logic
            )

            logger.info(f"Successfully exported Celeste 64 logic mappings for player {player}")

        except Exception as e:
            logger.warning(f"Could not export Celeste 64 logic mappings: {e}")

        return settings_dict

    def _convert_logic_mapping(self, logic_dict: Dict[str, List[List[str]]]) -> Dict[str, List[List[str]]]:
        """
        Convert the Python logic mapping to JSON-serializable format.
        """
        # The logic mapping should already be in the right format (strings and lists)
        # Just return it as-is
        return dict(logic_dict)

    def _convert_region_logic_mapping(self, logic_dict: Dict[tuple, List[List[str]]]) -> Dict[str, List[List[str]]]:
        """
        Convert the region logic mapping from tuple keys to string keys for JSON.
        """
        result = {}
        for region_tuple, requirements in sorted(logic_dict.items()):
            # Convert tuple (from_region, to_region) to string key "from_region,to_region"
            key = f"{region_tuple[0]},{region_tuple[1]}"
            result[key] = requirements
        return result

    def expand_helper(self, helper_name: str, args: List[Any] = None):
        """Expand Celeste 64 specific helper functions."""
        if args is None:
            args = []

        # Celeste 64 uses location_rule and region_connection_rule as helpers
        # These are handled in the JavaScript frontend, so we don't expand them here
        if helper_name in ['location_rule', 'region_connection_rule', 'goal_rule']:
            return None  # Keep as helper nodes

        return None  # Preserve other helper nodes as-is

    def handle_special_function_call(self, func_name: str, processed_args: list) -> dict:
        """
        Handle Celeste 64 specific function calls that should be converted to helpers.

        Convert calls to location_rule, region_connection_rule, and goal_rule into
        helper nodes instead of inlining them.
        """
        if func_name in ['location_rule', 'region_connection_rule', 'goal_rule']:
            # Convert to helper node
            return {
                'type': 'helper',
                'name': func_name,
                'args': processed_args
            }

        return None

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Celeste 64-specific analysis."""
        if not rule:
            return rule

        # Let the base class handle most of the expansion
        return super().expand_rule(rule)
