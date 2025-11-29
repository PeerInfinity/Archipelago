"""Timespinner game-specific export handler."""

from .generic import GenericGameExportHandler
from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)

class TimespinnerGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Timespinner'

    def __init__(self, world=None):
        super().__init__()
        # Timespinner-specific helpers from LogicExtensions.py
        self.known_helpers = {
            'has_timestop',
            'has_doublejump',
            'has_forwarddash_doublejump',
            'has_doublejump_of_npc',
            'has_fastjump_on_npc',
            'has_multiple_small_jumps_of_npc',
            'has_upwarddash',
            'has_fire',
            'has_pink',
            'has_keycard_A',
            'has_keycard_B',
            'has_keycard_C',
            'has_keycard_D',
            'can_break_walls',
            'can_kill_all_3_bosses',
            'has_teleport',
            'can_teleport_to',
        }

        # Create a logic instance if we have a world with options
        self.world = world
        self.logic = None
        if world and hasattr(world, 'options') and hasattr(world, 'precalculated_weights'):
            try:
                from worlds.timespinner.LogicExtensions import TimespinnerLogic
                self.logic = TimespinnerLogic(world.player, world.options, world.precalculated_weights)
                # Attach logic to world so resolve_attribute_nodes_in_rule can find it
                world.logic = self.logic
                logger.debug("Created TimespinnerLogic instance and attached to world")
            except Exception as e:
                logger.warning(f"Could not create TimespinnerLogic instance: {e}")

    def replace_name(self, name: str) -> str:
        """Replace variable names with their world equivalents."""
        # 'flooded' is a local variable that references precalculated_weights
        if name == 'flooded':
            return 'precalculated_weights'
        # 'logic' references are exported as 'self' by the analyzer, map to 'logic'
        if name == 'self':
            return 'logic'
        return name

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Timespinner-specific settings including precalculated weights."""
        # Get base settings
        settings_dict = super().get_settings_data(world, multiworld, player)

        # Export option flags needed by helper functions
        if hasattr(world, 'options'):
            options = world.options
            settings_dict['specific_keycards'] = getattr(options.specific_keycards, 'value', False)
            settings_dict['eye_spy'] = getattr(options.eye_spy, 'value', False)
            settings_dict['unchained_keys'] = getattr(options.unchained_keys, 'value', False)
            settings_dict['prism_break'] = getattr(options.prism_break, 'value', False)

        # Export precalculated weights (warp gate unlocks)
        if hasattr(world, 'precalculated_weights'):
            weights = world.precalculated_weights
            settings_dict['pyramid_keys_unlock'] = getattr(weights, 'pyramid_keys_unlock', None)
            settings_dict['present_keys_unlock'] = getattr(weights, 'present_key_unlock', None)
            settings_dict['past_keys_unlock'] = getattr(weights, 'past_key_unlock', None)
            settings_dict['time_keys_unlock'] = getattr(weights, 'time_key_unlock', None)

        return settings_dict

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and expand Timespinner-specific rules."""
        if not rule:
            return rule

        # Handle name nodes - replace special variable names
        if rule.get('type') == 'name':
            original_name = rule.get('name')
            if original_name:
                new_name = self.replace_name(original_name)
                if new_name != original_name:
                    rule['name'] = new_name
                    logger.debug(f"Replaced name '{original_name}' with '{new_name}'")

        # Handle attribute nodes - replace names in object references
        if rule.get('type') == 'attribute':
            obj = rule.get('object')
            if isinstance(obj, dict) and obj.get('type') == 'name':
                original_name = obj.get('name')
                if original_name:
                    new_name = self.replace_name(original_name)
                    if new_name != original_name:
                        obj['name'] = new_name
                        logger.debug(f"Replaced attribute object name '{original_name}' with '{new_name}'")

        if rule.get('type') == 'helper':
            helper_name = rule.get('name')
            if helper_name and helper_name not in self.known_helpers:
                logger.warning(f"Unknown Timespinner helper found: {helper_name}")
            # Recursively process helper arguments
            args = rule.get('args', [])
            if args:
                rule['args'] = [self.expand_rule(arg) if isinstance(arg, dict) else arg for arg in args]
            return rule

        # Recursively check nested conditions
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule.get('conditions', []) if cond
            ]

        if rule.get('type') == 'not':
            cond = rule.get('condition')
            if cond:
                rule['condition'] = self.expand_rule(cond)

        return rule
