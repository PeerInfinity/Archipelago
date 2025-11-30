"""Starcraft 2 game-specific export handler."""

from typing import Dict, Any, Optional, Callable
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class SC2GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Starcraft 2'
    """Export handler for Starcraft 2 game-specific rules and items."""

    def _extract_closure_vars(self, rule_func: Callable) -> Dict[str, Any]:
        """Extract closure variables from a function."""
        closure_vars = {}
        if hasattr(rule_func, '__closure__') and rule_func.__closure__:
            if hasattr(rule_func, '__code__'):
                freevars = rule_func.__code__.co_freevars
                for i, var_name in enumerate(freevars):
                    if i < len(rule_func.__closure__):
                        cell = rule_func.__closure__[i]
                        try:
                            closure_vars[var_name] = cell.cell_contents
                        except ValueError:
                            pass
        return closure_vars

    # Complex helper methods that should be kept as helper calls rather than expanded
    COMPLEX_HELPERS = {
        'terran_competent_comp', 'protoss_competent_comp', 'zerg_competent_comp',
        'terran_defense_rating', 'protoss_defense_rating', 'zerg_defense_rating',
        'terran_power_rating', 'protoss_power_rating', 'zerg_power_rating',
        'terran_havens_fall_requirement', 'terran_great_train_robbery_train_stopper',
        'terran_welcome_to_the_jungle_requirement', 'zerg_welcome_to_the_jungle_requirement',
        'protoss_welcome_to_the_jungle_requirement', 'terran_night_terrors_requirement',
        'terran_engine_of_destruction_requirement', 'engine_of_destruction_requirement',
        'terran_trouble_in_paradise_requirement', 'terran_media_blitz_requirement',
        'terran_gates_of_hell_requirement', 'terran_all_in_requirement',
        'basic_kerrigan', 'kerrigan_levels', 'two_kerrigan_actives',
        'terran_competent_ground_to_air', 'protoss_competent_ground_to_air',
        'zerg_competent_ground_to_air', 'terran_beats_protoss_deathball',
        'terran_base_trasher', 'terran_can_rescue', 'terran_cliffjumper',
        'terran_able_to_snipe_defiler', 'terran_respond_to_colony_infestations',
        'terran_survives_rip_field', 'terran_sustainable_mech_heal',
    }

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Override rule analysis for SC2 mission entry rules.

        SC2 uses complex entry rule patterns that the generic analyzer can't handle:
        - CountMissionsEntryRule: count_missions closure with target_amount and beat_items list
        - SubRuleEntryRule: count_rules closure with sub_lambdas
        - BeatMissionsEntryRule: has_all closure with missions_to_beat
        - Complex helper methods: should be kept as helper calls, not expanded
        """
        func_name = getattr(rule_func, '__name__', '')
        logger.debug(f"[SC2] override_rule_analysis called for '{rule_target_name}' with func_name='{func_name}'")

        # Check if this is a complex helper method that should not be expanded
        if func_name in self.COMPLEX_HELPERS:
            logger.debug(f"[SC2] Converting complex helper method '{func_name}' to helper call")
            return {'type': 'helper', 'name': func_name, 'args': []}

        # Handle count_missions pattern (from CountMissionsEntryRule.to_lambda)
        if func_name == 'count_missions':
            return self._handle_count_missions_rule(rule_func, rule_target_name)

        # Handle count_rules pattern (from SubRuleEntryRule.to_lambda)
        if func_name == 'count_rules':
            return self._handle_count_rules_rule(rule_func, rule_target_name)

        # Handle lambda patterns - could be BeatMissionsEntryRule or combined rules
        if func_name == '<lambda>':
            # First try BeatMissionsEntryRule pattern (lambda with self.missions_to_beat)
            result = self._handle_beat_missions_lambda(rule_func, rule_target_name)
            if result:
                logger.debug(f"[SC2] BeatMissionsEntryRule handler returned result for '{rule_target_name}'")
                return result

            # Then try combined rules that contain count_missions patterns
            result = self._handle_lambda_with_count_missions(rule_func, rule_target_name)
            if result:
                logger.debug(f"[SC2] lambda handler returned result for '{rule_target_name}'")
                return result

        return None

    def _handle_count_missions_rule(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Handle the count_missions closure function from CountMissionsEntryRule.

        The function has closure variables:
        - beat_items: list of item names to check
        - self: the CountMissionsEntryRule object which has target_amount
        """
        closure_vars = self._extract_closure_vars(rule_func)

        beat_items = closure_vars.get('beat_items', [])
        entry_rule = closure_vars.get('self')

        if not beat_items:
            logger.warning(f"[SC2] count_missions rule missing beat_items for '{rule_target_name}'")
            return None

        target_amount = getattr(entry_rule, 'target_amount', len(beat_items)) if entry_rule else len(beat_items)

        if target_amount == 0:
            return {'type': 'constant', 'value': True}

        # Use count_true rule type - counts how many conditions are true
        return {
            'type': 'count_true',
            'conditions': [{'type': 'item_check', 'item': item} for item in beat_items],
            'count': target_amount
        }

    def _handle_count_rules_rule(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Handle the count_rules closure function from SubRuleEntryRule.

        The function has closure variables:
        - sub_lambdas: list of rule functions to evaluate
        - self: the SubRuleEntryRule object which has target_amount
        """
        closure_vars = self._extract_closure_vars(rule_func)

        sub_lambdas = closure_vars.get('sub_lambdas', [])
        entry_rule = closure_vars.get('self')

        if not sub_lambdas:
            logger.warning(f"[SC2] count_rules rule missing sub_lambdas for '{rule_target_name}'")
            return None

        target_amount = getattr(entry_rule, 'target_amount', len(sub_lambdas)) if entry_rule else len(sub_lambdas)

        if target_amount == 0:
            return {'type': 'constant', 'value': True}

        # Recursively process each sub_lambda
        sub_rules = []
        for i, sub_lambda in enumerate(sub_lambdas):
            sub_rule = self._process_sub_rule(sub_lambda, f"{rule_target_name}:sub{i}")
            if sub_rule:
                sub_rules.append(sub_rule)
            else:
                logger.warning(f"[SC2] Failed to process sub_rule {i} for '{rule_target_name}'")

        if not sub_rules:
            return {'type': 'constant', 'value': True}

        if len(sub_rules) == 1 and target_amount == 1:
            return sub_rules[0]

        return {
            'type': 'count_true',
            'conditions': sub_rules,
            'count': target_amount
        }

    def _process_sub_rule(self, rule_func: Callable, context: str) -> Optional[Dict[str, Any]]:
        """Process a sub-rule function, dispatching to appropriate handler."""
        func_name = getattr(rule_func, '__name__', '')

        if func_name == 'count_missions':
            return self._handle_count_missions_rule(rule_func, context)
        elif func_name == 'count_rules':
            return self._handle_count_rules_rule(rule_func, context)
        elif func_name == '<lambda>':
            # Try BeatMissionsEntryRule pattern first
            result = self._handle_beat_missions_lambda(rule_func, context)
            if result:
                return result
            # Then try lambda with count patterns
            return self._handle_lambda_with_count_missions(rule_func, context)

        return None

    def _handle_beat_missions_lambda(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Handle lambdas from BeatMissionsEntryRule.to_lambda.

        The lambda is: lambda state: state.has_all([mission.beat_item() for mission in self.missions_to_beat], player)
        Closure has 'self' which is the BeatMissionsEntryRule with missions_to_beat attribute.
        """
        closure_vars = self._extract_closure_vars(rule_func)
        entry_rule = closure_vars.get('self')

        if not entry_rule:
            return None

        missions_to_beat = getattr(entry_rule, 'missions_to_beat', None)
        if not missions_to_beat:
            return None

        try:
            beat_items = [mission.beat_item() for mission in missions_to_beat]
        except Exception as e:
            logger.warning(f"[SC2] Could not extract beat items from BeatMissionsEntryRule for '{rule_target_name}': {e}")
            return None

        if len(beat_items) == 0:
            return {'type': 'constant', 'value': True}

        return {
            'type': 'state_method',
            'method': 'has_all',
            'args': [{'type': 'constant', 'value': beat_items}]
        }

    def _handle_lambda_with_count_missions(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Handle lambdas that combine count_missions with other rules.

        These typically look like:
        lambda state, campaign_rule=..., layout_rule=..., mission_rule=...:
            campaign_rule(state) and layout_rule(state) and mission_rule(state)
        """
        closure_vars = self._extract_closure_vars(rule_func)

        # Check if any closure vars are count_missions or other handled functions
        handled_rules = []

        for var_name, var_value in closure_vars.items():
            if callable(var_value):
                func_name = getattr(var_value, '__name__', '')
                if func_name == 'count_missions':
                    result = self._handle_count_missions_rule(var_value, f"{rule_target_name}:{var_name}")
                    if result:
                        handled_rules.append(result)
                elif func_name == 'count_rules':
                    result = self._handle_count_rules_rule(var_value, f"{rule_target_name}:{var_name}")
                    if result:
                        handled_rules.append(result)
                elif func_name == '<lambda>':
                    # Try BeatMissionsEntryRule pattern
                    result = self._handle_beat_missions_lambda(var_value, f"{rule_target_name}:{var_name}")
                    if result:
                        handled_rules.append(result)

        if not handled_rules:
            return None

        if len(handled_rules) == 1:
            return handled_rules[0]

        return {
            'type': 'and',
            'conditions': handled_rules
        }

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
