"""Yoshi's Island game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class YoshisIslandGameExportHandler(GenericGameExportHandler):
    """Export handler for Yoshi's Island.

    Inherits from GenericGameExportHandler for default behavior.
    Override methods here only when custom behavior is needed.
    """
    GAME_NAME = "Yoshi's Island"

    # Define Yoshi's Island-specific helpers that should NOT be auto-expanded
    YOSHI_HELPERS = {
        'has_midring',
        'reconstitute_luigi',
        'bandit_bonus',
        'item_bonus',
        'combat_item',
        'melon_item',
        'default_vis',
        'cansee_clouds',
        'bowserdoor_1',
        'bowserdoor_2',
        'bowserdoor_3',
        'bowserdoor_4',
    }

    def _is_common_helper_pattern(self, helper_name):
        """
        Override to prevent auto-expansion of Yoshi's Island-specific helpers.
        These helpers have custom implementations in JavaScript and should not be
        automatically converted to item checks or other inferred rules.
        """
        # Don't auto-expand Yoshi's Island helpers
        if helper_name in self.YOSHI_HELPERS:
            return False

        # Don't auto-expand level-specific helpers (pattern: _[0-9][0-9][A-Za-z]+)
        # Examples: _14Clear, _17Game, _27Game, _47Game, etc.
        import re
        if re.match(r'^_\d{2}[A-Z][a-z]+$', helper_name):
            return False

        # Fall back to parent implementation for other patterns
        return super()._is_common_helper_pattern(helper_name)

    def _transform_logic_attribute_access(self, rule: Any) -> Any:
        """
        Recursively transform logic.method and bosses.method attribute access patterns to helper calls.

        Converts patterns like:
            {"type": "attribute", "object": {"type": "name", "name": "logic"}, "attr": "method_name"}
            {"type": "attribute", "object": {"type": "name", "name": "bosses"}, "attr": "method_name"}
        Into:
            {"type": "helper", "name": "method_name", "args": []}

        This handles a bug in the Python code where logic/bosses methods are accessed
        as attributes instead of being called as functions.
        """
        if not isinstance(rule, dict):
            return rule

        # Check if this is a logic or bosses attribute access pattern
        if (rule.get('type') == 'attribute' and
            isinstance(rule.get('object'), dict) and
            rule['object'].get('type') == 'name' and
            rule['object'].get('name') in ['logic', 'bosses']):
            # Convert to helper call
            method_name = rule.get('attr')
            module_name = rule['object'].get('name')
            logger.debug(f"Converting {module_name}.{method_name} attribute access to helper call")
            return {
                'type': 'helper',
                'name': method_name,
                'args': []
            }

        # Recursively process nested structures
        if rule.get('type') in ['and', 'or']:
            if 'conditions' in rule:
                rule['conditions'] = [self._transform_logic_attribute_access(cond)
                                     for cond in rule['conditions']]
        elif rule.get('type') == 'not':
            if 'condition' in rule:
                rule['condition'] = self._transform_logic_attribute_access(rule['condition'])
        elif rule.get('type') == 'conditional':
            if 'test' in rule:
                rule['test'] = self._transform_logic_attribute_access(rule['test'])
            if 'if_true' in rule:
                rule['if_true'] = self._transform_logic_attribute_access(rule['if_true'])
            if 'if_false' in rule:
                rule['if_false'] = self._transform_logic_attribute_access(rule['if_false'])
        elif rule.get('type') == 'function_call':
            # Transform function_call with bosses/logic attribute access to helper
            if 'function' in rule:
                func = rule['function']
                if (isinstance(func, dict) and
                    func.get('type') == 'attribute' and
                    isinstance(func.get('object'), dict) and
                    func['object'].get('type') == 'name' and
                    func['object'].get('name') in ['logic', 'bosses']):
                    # Convert to helper call
                    method_name = func.get('attr')
                    module_name = func['object'].get('name')
                    logger.debug(f"Converting {module_name}.{method_name} function_call to helper call")
                    return {
                        'type': 'helper',
                        'name': method_name,
                        'args': []
                    }

        return rule

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process exported data to fix logic attribute access patterns.
        """
        # Transform logic attribute access in all location and exit rules
        if 'regions' in data:
            for player_id, player_regions in data['regions'].items():
                for region_name, region_data in player_regions.items():
                    # Process location access rules
                    if 'locations' in region_data:
                        for location in region_data['locations']:
                            if 'access_rule' in location and location['access_rule']:
                                location['access_rule'] = self._transform_logic_attribute_access(
                                    location['access_rule']
                                )
                    # Process exit access rules
                    if 'exits' in region_data:
                        for exit_data in region_data['exits']:
                            if 'access_rule' in exit_data and exit_data['access_rule']:
                                exit_data['access_rule'] = self._transform_logic_attribute_access(
                                    exit_data['access_rule']
                                )

        return data

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extract Yoshi's Island settings."""
        settings_dict = {'game': multiworld.game[player]}

        # Set assume_bidirectional_exits to false for Yoshi's Island
        settings_dict['assume_bidirectional_exits'] = False

        # Helper to safely extract option values
        def extract_option(option_name):
            option = getattr(world.options, option_name, None)
            # Check if the option has a 'value' attribute (like Option objects)
            # Otherwise, return the option itself (might be a direct value like bool/int)
            return getattr(option, 'value', option)

        # Yoshi's Island specific settings needed for helper functions
        if hasattr(world, 'options'):
            # Stage Logic (needed for cansee_clouds, combat_item, etc.)
            settings_dict['StageLogic'] = extract_option('stage_logic')

            # Hidden Object Visibility (needed for cansee_clouds)
            settings_dict['HiddenObjectVisibility'] = extract_option('hidden_object_visibility')

            # Shuffle Middle Rings (needed for has_midring)
            settings_dict['ShuffleMiddleRings'] = extract_option('shuffle_midrings')

            # Item Logic / Consumable Logic (needed for combat_item, melon_item)
            settings_dict['ItemLogic'] = extract_option('item_logic')

            # Bowser Door Mode (needed for bowser door helpers)
            settings_dict['BowserDoorMode'] = extract_option('bowser_door_mode')

            # Luigi Pieces Required (needed for reconstitute_luigi)
            settings_dict['LuigiPiecesRequired'] = extract_option('luigi_pieces_required')

            # Castle Clear Condition (needed for castle_clear)
            settings_dict['CastleClearCondition'] = extract_option('castle_clear_condition')

            # Castle Open Condition (needed for castle_access)
            settings_dict['CastleOpenCondition'] = extract_option('castle_open_condition')

        return settings_dict
