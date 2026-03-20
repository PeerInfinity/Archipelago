"""Starcraft 2 game-specific export handler."""

from typing import Dict, Any, Optional, Callable, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

# Import SC2 rating dictionaries for export
try:
    from worlds.sc2.rules import (
        tvx_defense_ratings, tvz_defense_ratings, tvx_air_defense_ratings,
        zvx_defense_ratings, zvx_air_defense_ratings,
        pvx_defense_ratings, pvz_defense_ratings,
        terran_passive_ratings, zerg_passive_ratings, protoss_passive_ratings,
        soa_energy_ratings, soa_passive_ratings, soa_ultimate_ratings
    )
    SC2_RATING_DICTS_AVAILABLE = True
except ImportError:
    SC2_RATING_DICTS_AVAILABLE = False
    tvx_defense_ratings = tvz_defense_ratings = tvx_air_defense_ratings = {}
    zvx_defense_ratings = zvx_air_defense_ratings = {}
    pvx_defense_ratings = pvz_defense_ratings = {}
    terran_passive_ratings = zerg_passive_ratings = protoss_passive_ratings = {}
    soa_energy_ratings = soa_passive_ratings = soa_ultimate_ratings = {}
    logger.debug("Could not import SC2 rating dictionaries - static data export disabled")

# Import SC2 item groups for kerrigan helpers
try:
    from worlds.sc2.item.item_groups import (
        kerrigan_non_ulimates, kerrigan_logic_active_abilities,
        kerrigan_abilities, kerrigan_passives, kerrigan_active_abilities,
        protoss_generic_upgrades
    )
    SC2_KERRIGAN_GROUPS_AVAILABLE = True
except ImportError:
    SC2_KERRIGAN_GROUPS_AVAILABLE = False
    kerrigan_non_ulimates = kerrigan_logic_active_abilities = kerrigan_abilities = set()
    kerrigan_passives = kerrigan_active_abilities = protoss_generic_upgrades = set()
    logger.debug("Could not import SC2 kerrigan item groups - kerrigan helper export disabled")

# Import SC2 upgrade bundle lookup for weapon_armor_upgrade_count helper
upgrade_bundle_inverted_lookup: Dict[str, Any] = {}
try:
    from worlds.sc2.item.item_tables import upgrade_bundle_inverted_lookup  # type: ignore[assignment]
    SC2_UPGRADE_BUNDLES_AVAILABLE = True
except ImportError:
    SC2_UPGRADE_BUNDLES_AVAILABLE = False
    logger.debug("Could not import SC2 upgrade bundles - weapon_armor_upgrade_count helper disabled")

class SC2GameExportHandler(GenericGameExportHandler):
    """Export handler for Starcraft 2 game-specific rules and items."""

    # Include 'logic' for SC2Logic method calls (e.g., logic.terran_early_tech())
    HELPER_OBJECT_NAMES = {'self', 'world', 'logic'}

    # Helpers too complex for automatic export (loops, closures, complex calculations)
    # NOTE: defense_rating helpers now work with game_info export for rating dictionaries
    # NOTE: weapon_armor_upgrade_count now works with upgrade_bundle_inverted_lookup export
    HELPERS_TO_EXPORT_BLACKLIST = {
        # is_item_placement - state check method, not applicable in frontend
        'is_item_placement',
        # Kerrigan helpers - kerrigan_levels uses get_full_item_list(), two_kerrigan_actives has a bug
        'kerrigan_levels', 'two_kerrigan_actives',
        # Helpers with multiple early-return patterns - analyzer now chains these correctly
        # But these helpers depend on complex world settings that aren't fully exported
        'terran_competent_comp', 'protoss_competent_comp', 'zerg_competent_comp',
        'terran_competent_ground_to_air', 'protoss_competent_ground_to_air',
        'zerg_competent_ground_to_air', 'terran_beats_protoss_deathball',
        'terran_base_trasher', 'terran_respond_to_colony_infestations',
        # Mission requirement helpers that depend on the above
        'terran_havens_fall_requirement', 'terran_great_train_robbery_train_stopper',
        'terran_welcome_to_the_jungle_requirement', 'zerg_welcome_to_the_jungle_requirement',
        'protoss_welcome_to_the_jungle_requirement', 'terran_night_terrors_requirement',
        'terran_engine_of_destruction_requirement', 'engine_of_destruction_requirement',
        'terran_trouble_in_paradise_requirement', 'terran_media_blitz_requirement',
        'terran_gates_of_hell_requirement', 'terran_all_in_requirement',
    }

    # SC2Logic method names that may be accessed without parentheses (logic.attr instead of logic.attr())
    # These should be converted to helper calls, not settings. Attribute access that's NOT in this
    # set is assumed to be a settings attribute and resolved via _resolve_logic_attribute.
    KNOWN_LOGIC_METHODS = {
        # Terran helpers
        'terran_common_unit', 'terran_early_tech', 'terran_air', 'terran_air_anti_air',
        'terran_competent_ground_to_air', 'terran_competent_anti_air', 'terran_bio_heal',
        'terran_basic_anti_air', 'terran_defense_rating', 'terran_competent_comp',
        'terran_mobile_detector', 'terran_beats_protoss_deathball', 'terran_base_trasher',
        'terran_can_rescue', 'terran_cliffjumper', 'terran_able_to_snipe_defiler',
        'terran_respond_to_colony_infestations', 'terran_survives_rip_field',
        'terran_sustainable_mech_heal', 'terran_mineral_dump',
        # Protoss helpers
        'protoss_common_unit', 'protoss_basic_anti_air', 'protoss_competent_anti_air',
        'protoss_basic_splash', 'protoss_anti_armor_anti_air', 'protoss_anti_light_anti_air',
        'protoss_can_attack_behind_chasm', 'protoss_has_blink', 'protoss_heal',
        'protoss_stalker_upgrade', 'protoss_static_defense', 'protoss_fleet',
        'protoss_competent_comp', 'protoss_hybrid_counter',
        # Zerg helpers
        'zerg_common_unit', 'zerg_competent_anti_air', 'zerg_basic_anti_air',
        'zerg_competent_comp', 'zerg_competent_defense', 'zerg_pass_vents',
        'spread_creep', 'morph_brood_lord', 'morph_impaler_or_lurker', 'morph_viper',
        # Kerrigan and misc helpers
        'basic_kerrigan', 'kerrigan_levels', 'two_kerrigan_actives',
        'marine_medic_upgrade', 'can_nuke',
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
        # Keep as helper reference - the frontend will implement these
        if func_name in self.HELPERS_TO_EXPORT_BLACKLIST:
            logger.debug(f"[SC2] Blacklisted helper '{func_name}' - keeping as helper reference")
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

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """
        Recursively expand rule functions with SC2-specific logic pattern recognition.

        SC2Logic uses both methods and computed properties. The base class already
        handles logic.attr -> helper conversion (since 'logic' is in HELPER_OBJECT_NAMES).
        This method handles self.attr patterns that appear in helper method bodies.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle self.attr patterns in helper method bodies
        # The base class excludes 'self' from helper conversion, so we handle it here
        if rule.get('type') == 'attribute':
            obj = rule.get('object', {})
            if obj.get('type') == 'name' and obj.get('name') == 'self':
                attr_name = rule.get('attr')
                # Convert to helper call - expand_helper will resolve settings to constants
                converted_rule = {'type': 'helper', 'name': attr_name, 'args': []}
                return super().expand_rule(converted_rule, _depth)

        # Let the base class handle standard recursion
        return self._recursively_expand_rule_children(rule, _depth)

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """
        Expand helper functions, resolving SC2Logic properties to constants.

        SC2Logic has both methods (like terran_common_unit) and computed properties
        (like advanced_tactics). Methods stay as helper calls; properties are
        resolved to constant values at export time.
        """
        # First check base class handling (CONSTANT_HELPER_EXPANSIONS, HELPER_TO_RULE_MAPPINGS)
        base_result = super().expand_helper(helper_name, args)
        if base_result:
            return base_result

        # If this is NOT a known logic method, try to resolve as a computed property
        if helper_name not in self.KNOWN_LOGIC_METHODS:
            resolved = self._resolve_logic_attribute(helper_name)
            if resolved is not None:
                logger.debug(f"[SC2] Resolving {helper_name} to constant: {resolved}")
                # Convert sets to lists for JSON serialization
                if isinstance(resolved, (set, frozenset)):
                    resolved = sorted(list(resolved))
                return {'type': 'constant', 'value': resolved}

        # Otherwise, keep as helper call
        return None

    def _resolve_logic_attribute(self, attr: str) -> Any:
        """
        Resolve a SC2Logic attribute to its actual value based on world options.

        This handles attributes from SC2Logic that are computed from world options
        at runtime. By resolving them at export time, the world generator can use
        the values without any SC2-specific code.

        Args:
            attr: The attribute name (e.g., 'advanced_tactics', 'basic_terran_units')

        Returns:
            The resolved value, or None if the attribute cannot be resolved.
        """
        if not self.world or not hasattr(self.world, 'options'):
            return None

        options = self.world.options

        # Direct option lookups - attributes that map directly to option values
        direct_options = {
            'spear_of_adun_presence': 'spear_of_adun_presence',
            'spear_of_adun_passive_presence': 'spear_of_adun_passive_ability_presence',
            'kerrigan_presence': 'kerrigan_presence',
            'logic_level': 'required_tactics',
            'kerrigan_levels_per_mission_completed': 'kerrigan_levels_per_mission_completed',
            'kerrigan_levels_per_mission_completed_cap': 'kerrigan_levels_per_mission_completed_cap',
            'kerrigan_total_level_cap': 'kerrigan_total_level_cap',
            'grant_story_tech': 'grant_story_tech',
            'generic_upgrade_missions': 'generic_upgrade_missions',
            'all_in_map': 'all_in_map',
            'mission_order': 'mission_order',
        }

        if attr in direct_options:
            option_name = direct_options[attr]
            if hasattr(options, option_name):
                option = getattr(options, option_name)
                return option.value if hasattr(option, 'value') else option

        # Computed attributes - derived from other options
        if attr == 'advanced_tactics':
            # advanced_tactics = required_tactics != RequiredTactics.option_standard (which is 0)
            if hasattr(options, 'required_tactics'):
                return options.required_tactics.value != 0
            return False

        if attr == 'base_power_rating':
            # base_power_rating = 2 if advanced_tactics else 0
            if hasattr(options, 'required_tactics'):
                advanced_tactics = options.required_tactics.value != 0
                return 2 if advanced_tactics else 0
            return 0

        if attr == 'take_over_ai_allies':
            if hasattr(options, 'take_over_ai_allies'):
                return bool(options.take_over_ai_allies.value)
            return False

        if attr == 'kerrigan_unit_available':
            # Complex computation - use exported setting if available, else True for safety
            return True

        if attr == 'morphling_enabled':
            # morphling_enabled = enable_morphling == 1 (option_true)
            if hasattr(options, 'enable_morphling'):
                return options.enable_morphling.value == 1
            return False

        if attr == 'story_levels_granted':
            # story_levels_granted = grant_story_levels != 0 (disabled)
            if hasattr(options, 'grant_story_levels'):
                return options.grant_story_levels.value != 0
            return False

        if attr == 'war_council_upgrades':
            # war_council_upgrades = not war_council_nerfs
            if hasattr(options, 'war_council_nerfs'):
                return not bool(options.war_council_nerfs.value)
            return True

        # Boolean attributes that default to True for safety (won't block progression)
        safe_true_attrs = {
            'nova_used', 'has_barracks_unit', 'has_factory_unit', 'has_starport_unit',
            'has_zerg_melee_unit', 'has_zerg_ranged_unit', 'has_zerg_air_unit',
            'has_protoss_gateway_unit', 'has_protoss_core_unit', 'has_protoss_robo_unit',
            'has_protoss_stargate_unit'
        }
        if attr in safe_true_attrs:
            return True

        if attr == 'total_mission_count':
            return 1  # Safe default

        # Unit lists - computed based on required_tactics option
        required_tactics = 0
        if hasattr(options, 'required_tactics'):
            required_tactics = options.required_tactics.value

        if attr == 'basic_terran_units':
            # Standard units (required_tactics == 0)
            base_units = {'Marine', 'Marauder', 'Dominion Trooper', 'Goliath', 'Hellion', 'Vulture', 'Warhound'}
            if required_tactics >= 1:  # Advanced tactics
                base_units.update({'Reaper', 'Diamondback', 'Viking', 'Siege Tank', 'Banshee'})
            if required_tactics >= 2:  # No logic
                base_units.update({'Firebat', 'Medic', 'Medivac', 'Wraith', 'Thor', 'Liberator',
                                  'Raven', 'Cyclone', 'Widow Mine', 'Ghost', 'Spectre', 'Battlecruiser'})
            return base_units

        if attr == 'basic_zerg_units':
            base_units = {'Swarm Queen', 'Roach', 'Hydralisk'}
            if required_tactics >= 1:
                base_units.update({'Zergling', 'Infestor', 'Aberration', 'Mutalisk', 'Corruptor'})
            if required_tactics >= 2:
                base_units.update({'Swarm Host', 'Ultralisk', 'Brood Lord', 'Viper', 'Ravager',
                                  'Lurker', 'Impaler', 'Guardian', 'Devourer', 'Brutalisk', 'Leviathan'})
            return base_units

        if attr == 'basic_protoss_units':
            base_units = {'Zealot', 'Centurion', 'Sentinel', 'Stalker', 'Instigator', 'Slayer', 'Adept'}
            if required_tactics >= 1:
                base_units.update({'Dragoon', 'Sentry', 'High Templar', 'Dark Templar', 'Immortal',
                                  'Annihilator', 'Vanguard', 'Reaver', 'Phoenix', 'Mirage', 'Corsair'})
            if required_tactics >= 2:
                base_units.update({'Archon', 'Colossus', 'Wrathwalker', 'Ascendant', 'Dark Archon',
                                  'Supplicant', 'Tempest', 'Arbiter', 'Carrier', 'Mothership'})
            return base_units

        # Attribute not recognized
        return None

    def get_world_data(self, world, multiworld, player: int) -> Dict[str, Any]:
        """Extract Starcraft 2 settings for export."""
        settings_dict = super().get_world_data(world, multiworld, player)

        # Export computed SC2Logic properties that are used in rules
        # Note: base class already exports all world.options, so we only add computed properties
        try:
            from worlds.sc2.rules import SC2Logic
            logic = SC2Logic(world)

            # Export computed boolean properties that are referenced in access rules
            logic_properties = [
                'advanced_tactics',
                'grant_story_tech',  # Used by helpers as story_tech_granted check
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

            # Export unit lists that are computed from required_tactics option
            # These are used in helper functions like terran_common_unit
            unit_list_properties = [
                'basic_terran_units',
                'basic_zerg_units',
                'basic_protoss_units'
            ]

            for prop_name in unit_list_properties:
                if hasattr(logic, prop_name):
                    prop_value = getattr(logic, prop_name)
                    # Convert sets to sorted lists for JSON serialization
                    if isinstance(prop_value, (set, frozenset)):
                        settings_dict[prop_name] = sorted(list(prop_value))
                    elif isinstance(prop_value, (list, tuple)):
                        settings_dict[prop_name] = list(prop_value)

            # Export option values that JS helpers access directly
            # These are accessed via settings?.option_name in the helpers
            option_exports = [
                'all_in_map',  # Used by terran_all_in_requirement
                'spear_of_adun_presence',  # Used by SoA helpers
                'spear_of_adun_passive_presence',  # Used by SoA helpers
                'mission_order',  # Used by the_escape_stuff_granted
                'enabled_campaigns',  # Used by the_escape_stuff_granted
            ]

            for option_name in option_exports:
                if hasattr(logic, option_name):
                    option_value = getattr(logic, option_name)
                    if isinstance(option_value, (bool, int, str, float)):
                        settings_dict[option_name] = option_value
                    elif isinstance(option_value, (set, frozenset)):
                        # Convert sets/frozensets to sorted lists for JSON
                        settings_dict[option_name] = sorted(list(option_value))

            # Also export story_tech_granted as a boolean for JS helpers
            # JS helpers check: settings?.story_tech_granted as a boolean
            # Python has: grant_story_tech as an enum (0=no_grant, 1=grant, 2=allow_substitutes)
            if hasattr(logic, 'grant_story_tech'):
                # story_tech_granted is True when grant_story_tech == 1 (option_grant)
                settings_dict['story_tech_granted'] = (logic.grant_story_tech == 1)
        except Exception as e:
            logger.warning(f"Could not export SC2 logic properties: {e}")

        return settings_dict

    def get_game_info(self, world) -> Dict[str, Any]:
        """
        Get SC2 game info including rating dictionaries.

        Exports the defense/power rating dictionaries so they can be
        used by helpers at runtime in the frontend.
        """
        game_info = super().get_game_info(world)

        # Export rating dictionaries if available
        if SC2_RATING_DICTS_AVAILABLE:
            rating_dicts = {
                'tvx_defense_ratings': dict(tvx_defense_ratings),
                'tvz_defense_ratings': dict(tvz_defense_ratings),
                'tvx_air_defense_ratings': dict(tvx_air_defense_ratings),
                'zvx_defense_ratings': dict(zvx_defense_ratings),
                'zvx_air_defense_ratings': dict(zvx_air_defense_ratings),
                'pvx_defense_ratings': dict(pvx_defense_ratings),
                'pvz_defense_ratings': dict(pvz_defense_ratings),
                'terran_passive_ratings': dict(terran_passive_ratings),
                'zerg_passive_ratings': dict(zerg_passive_ratings),
                'protoss_passive_ratings': dict(protoss_passive_ratings),
                'soa_energy_ratings': dict(soa_energy_ratings),
                'soa_passive_ratings': dict(soa_passive_ratings),
                'soa_ultimate_ratings': dict(soa_ultimate_ratings),
            }
            game_info['rating_tables'] = rating_dicts
            logger.debug(f"[SC2] Exported {len(rating_dicts)} rating dictionaries to game_info")

        # Export kerrigan item groups for kerrigan helpers
        if SC2_KERRIGAN_GROUPS_AVAILABLE:
            kerrigan_groups = {
                'kerrigan_non_ulimates': list(kerrigan_non_ulimates),
                'kerrigan_logic_active_abilities': list(kerrigan_logic_active_abilities),
                'kerrigan_abilities': list(kerrigan_abilities),
                'kerrigan_passives': list(kerrigan_passives),
                'kerrigan_active_abilities': list(kerrigan_active_abilities),
            }
            game_info['kerrigan_groups'] = kerrigan_groups
            # Export protoss_generic_upgrades for weapon_armor_upgrade_count helper
            game_info['protoss_generic_upgrades'] = list(protoss_generic_upgrades)
            logger.debug(f"[SC2] Exported {len(kerrigan_groups)} kerrigan item groups to game_info")

        # Export upgrade bundle lookup for weapon_armor_upgrade_count helper
        if SC2_UPGRADE_BUNDLES_AVAILABLE:
            game_info['upgrade_bundle_inverted_lookup'] = {
                k: list(v) for k, v in upgrade_bundle_inverted_lookup.items()
            }
            logger.debug(f"[SC2] Exported upgrade_bundle_inverted_lookup with {len(upgrade_bundle_inverted_lookup)} entries")

        return game_info
