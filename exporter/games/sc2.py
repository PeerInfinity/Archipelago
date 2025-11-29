"""Starcraft 2 game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class SC2GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Starcraft 2'
    """Export handler for Starcraft 2 game-specific rules and items."""

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively expand rule functions with SC2-specific logic pattern recognition.

        SC2 uses a logic object with helper methods (e.g., logic.terran_early_tech())
        and attributes (e.g., logic.take_over_ai_allies, logic.advanced_tactics).
        These need to be converted to helper calls or settings access.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check for the pattern: function_call with function being attribute access on "logic"
        # This pattern looks like:
        # {
        #   "type": "function_call",
        #   "function": {
        #     "type": "attribute",
        #     "object": {"type": "name", "name": "logic"},
        #     "attr": "method_name"
        #   },
        #   "args": [...]
        # }
        if rule.get('type') == 'function_call':
            function = rule.get('function', {})
            if function.get('type') == 'attribute':
                obj = function.get('object', {})
                if obj.get('type') == 'name' and obj.get('name') == 'logic':
                    # This is a logic.method_name() call - convert to helper
                    method_name = function.get('attr')
                    # Recursively process args first
                    args = [self.expand_rule(arg) for arg in rule.get('args', [])]

                    logger.debug(f"[SC2] Converting logic.{method_name}() to helper call")

                    # Convert to helper format
                    converted_rule = {
                        'type': 'helper',
                        'name': method_name,
                        'args': args
                    }

                    # Continue expanding the converted rule
                    return super().expand_rule(converted_rule)

            # For other function_calls, recursively process args
            if 'args' in rule:
                rule['args'] = [self.expand_rule(arg) for arg in rule['args']]

        # Check for the pattern: attribute access on "logic" (not a function call)
        # This pattern looks like:
        # {
        #   "type": "attribute",
        #   "object": {"type": "name", "name": "logic"},
        #   "attr": "attribute_name"
        # }
        # These could be either:
        # 1. SC2Logic helper methods accessed without parentheses (should become helper calls)
        # 2. SC2Logic instance attributes that map to world settings (should become self.attribute)
        if rule.get('type') == 'attribute':
            obj = rule.get('object', {})
            if obj.get('type') == 'name' and obj.get('name') == 'logic':
                attr_name = rule.get('attr')

                # List of known helper method names that might be accessed without parentheses
                # These should be converted to helper calls, not self attributes
                known_helpers = {
                    'terran_common_unit', 'terran_early_tech', 'terran_air', 'terran_air_anti_air',
                    'terran_competent_ground_to_air', 'terran_competent_anti_air', 'terran_bio_heal',
                    'terran_basic_anti_air', 'terran_defense_rating', 'terran_competent_comp',
                    'terran_mobile_detector', 'terran_beats_protoss_deathball', 'terran_base_trasher',
                    'terran_can_rescue', 'terran_cliffjumper', 'terran_able_to_snipe_defiler',
                    'terran_respond_to_colony_infestations', 'terran_survives_rip_field',
                    'terran_sustainable_mech_heal',
                    'protoss_common_unit', 'protoss_basic_anti_air', 'protoss_competent_anti_air',
                    'protoss_basic_splash', 'protoss_anti_armor_anti_air', 'protoss_anti_light_anti_air',
                    'protoss_can_attack_behind_chasm', 'protoss_has_blink', 'protoss_heal',
                    'protoss_stalker_upgrade', 'protoss_static_defense', 'protoss_fleet',
                    'protoss_competent_comp', 'protoss_hybrid_counter',
                    'zerg_common_unit', 'zerg_competent_anti_air', 'zerg_basic_anti_air',
                    'zerg_competent_comp', 'zerg_competent_defense', 'zerg_pass_vents',
                    'spread_creep', 'morph_brood_lord', 'morph_impaler_or_lurker', 'morph_viper',
                    'basic_kerrigan', 'kerrigan_levels', 'two_kerrigan_actives',
                    'marine_medic_upgrade', 'can_nuke'
                }

                if attr_name in known_helpers:
                    # This is a helper method accessed without parentheses
                    # Convert to a helper call
                    logger.debug(f"[SC2] Converting logic.{attr_name} to helper call (method accessed as attribute)")

                    converted_rule = {
                        'type': 'helper',
                        'name': attr_name,
                        'args': []
                    }

                    # Continue expanding the converted rule
                    return super().expand_rule(converted_rule)
                else:
                    # This is a settings attribute - convert to self.attribute_name
                    # The rule engine knows how to resolve self.attribute from settings
                    logger.debug(f"[SC2] Converting logic.{attr_name} to self.{attr_name} (settings access)")

                    converted_rule = {
                        'type': 'attribute',
                        'object': {'type': 'name', 'name': 'self'},
                        'attr': attr_name
                    }

                    # Continue expanding
                    return super().expand_rule(converted_rule)

        # Handle compare operations - recursively process left and right operands
        if rule.get('type') == 'compare':
            if 'left' in rule:
                rule['left'] = self.expand_rule(rule['left'])
            if 'right' in rule:
                rule['right'] = self.expand_rule(rule['right'])

        # For all other rule types, use the parent class's expand_rule
        return super().expand_rule(rule)

    def expand_helper(self, helper_name: str):
        """Expand Starcraft 2-specific helper functions."""
        # For now, just use the generic implementation
        # We'll add specific helper expansions as needed during testing
        # Most helpers will be implemented in the JavaScript helper file
        return super().expand_helper(helper_name)

    def get_settings_data(self, world, multiworld, player: int) -> Dict[str, Any]:
        """Extract Starcraft 2 settings for export."""
        settings_dict = super().get_settings_data(world, multiworld, player)

        # Export all SC2 options
        if hasattr(world, 'options'):
            for option_name in dir(world.options):
                # Skip private attributes and methods
                if option_name.startswith('_'):
                    continue

                option = getattr(world.options, option_name, None)
                if option is None:
                    continue

                # Extract the value from the option
                # Options typically have a 'value' attribute
                if hasattr(option, 'value'):
                    settings_dict[option_name] = option.value
                elif isinstance(option, (bool, int, str, float)):
                    settings_dict[option_name] = option

        # Also export computed logic properties that are used in rules
        # These are computed from options but accessed as attributes on the logic object
        try:
            from worlds.sc2.Rules import SC2Logic
            logic = SC2Logic(world)

            # Export computed boolean properties that are referenced in access rules
            logic_properties = [
                'advanced_tactics',
                'story_tech_granted',
                'story_levels_granted',
                'take_over_ai_allies',
                'kerrigan_unit_available'
            ]

            for prop_name in logic_properties:
                if hasattr(logic, prop_name):
                    prop_value = getattr(logic, prop_name)
                    # Only export simple types
                    if isinstance(prop_value, (bool, int, str, float)):
                        settings_dict[prop_name] = prop_value
        except Exception as e:
            logger.warning(f"Could not export SC2 logic properties: {e}")

        return settings_dict
