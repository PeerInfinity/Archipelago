"""Kingdom Hearts 2 specific helper expander."""

import re
from typing import Dict, Any
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class KH2GameExportHandler(GenericGameExportHandler):
    """KH2-specific expander that handles Kingdom Hearts 2 rules."""

    # GenericGameExportHandler already has AUTO_EXPORT_DISCOVERED_HELPERS = True
    # HELPER_MODULES is auto-discovered by AUTO_DISCOVER_WORLD_HELPER_MODULES = True

    # Module paths containing item name constants and other resolvable variables
    ITEM_NAME_MODULES = ['worlds.kh2.Names', 'worlds.kh2.Logic', 'worlds.kh2.Items']

    # Module-level variables to inject into closure_vars for helper analysis
    CLOSURE_VAR_IMPORTS = {
        'worlds.kh2.Logic': [
            'auto_form_dict', 'summons', 'form_list', 'form_list_without_final',
            'gap_closer', 'defensive_tool', 'ground_finisher', 'party_limit',
            'donald_limit', 'aerial_move', 'black_magic', 'magic', 'three_proofs',
            'final_leveling_access', 'drive_form_list'
        ],
        'worlds.kh2.Items': ['visit_locking_dict'],
        'worlds.kh2.Names': ['ItemName', 'RegionName', 'LocationName'],
    }

    # Mapping of self.<attr> to setting configuration for the analyzer
    # This enables conversion of patterns like self.fight_logic to setting_value rules
    # Values can be:
    #   - str: setting name (uses numeric value)
    #   - dict: {'setting': name, 'use_current_key': True} (uses string key from name_lookup)
    SELF_ATTR_TO_SETTING = {
        # self.fight_logic = world.options.FightLogic.current_key
        # The current_key returns the string key ("easy", "normal", "hard") not the numeric value
        'fight_logic': {'setting': 'FightLogic', 'use_current_key': True},
    }

    # Helpers too complex for automatic export
    HELPERS_TO_EXPORT_BLACKLIST = {
        # Form-related helpers - expanded via expand_helper when called
        # Keep in blacklist to prevent export of complex imperative definitions
        # When called, expand_helper generates equivalent declarative rules
        'form_list_unlock',           # Expanded to conditional has_any + get_form_level_requirement
        'get_form_level_requirement', # Expanded to form count comparison with FinalFormLogic
        'final_form_region_access',   # Expanded to sorted or(location_check, ...) via expand_helper

        # Static methods that return True - handled via CONSTANT_HELPER_EXPANSIONS
        'limit_form_region_access', 'multi_form_region_access',
    }

    # Constant helper expansions - helpers that always return a constant value
    # These are automatically expanded by the base class expand_helper method
    CONSTANT_HELPER_EXPANSIONS = {
        # Region access helpers that always return True
        'limit_form_region_access': True,
        'multi_form_region_access': True,
        # Static fight rule methods that return True (no parameters needed)
        'get_axel_one_rules': True,
        'get_axel_two_rules': True,
        'get_twilight_thorn_rules': True,
        'get_beast_rules': True,
        'get_grim_reaper1_rules': True,
        'get_old_pete_rules': True,
        'get_oogie_rules': True,
    }

    # Helper to rule type mappings - helpers that map directly to standard rule types
    # kh2_can_reach(loc) checks if a location is reachable (region + access rule)
    # location_check uses isLocationAccessible which checks both region reachability AND access rule
    HELPER_TO_RULE_MAPPINGS = {
        'kh2_can_reach': {'type': 'location_check', 'field': 'location'},
    }


    def prepare_closure_vars(self, rule_func, closure_vars: Dict[str, Any]) -> Dict[str, Any]:
        """Inject KH2 module-level data structures into closure_vars for helper analysis.

        Static imports are handled by CLOSURE_VAR_IMPORTS. This override only handles
        the dynamic fight rule dicts that are discovered at runtime.
        """
        # Let base class handle static imports from CLOSURE_VAR_IMPORTS
        enhanced_closure = super().prepare_closure_vars(rule_func, closure_vars)

        try:
            # Dynamically import all fight rule dicts from Logic.py
            # These have prefixes like easy_, normal_, hard_, not_hard_, transport_
            from worlds.kh2 import Logic
            for name in dir(Logic):
                if name.startswith(('easy_', 'normal_', 'hard_', 'not_hard_', 'transport_')):
                    if name not in enhanced_closure:
                        value = getattr(Logic, name)
                        if isinstance(value, dict):
                            enhanced_closure[name] = value
                            logger.debug(f"Injected {name} into closure_vars for KH2 helper analysis")
        except ImportError as e:
            logger.warning(f"Could not import KH2 Logic module for closure injection: {e}")

        return enhanced_closure

    def expand_helper(self, helper_name: str, args=None):
        """Expand KH2-specific helper functions."""
        # Let base class handle CONSTANT_HELPER_EXPANSIONS first
        base_result = super().expand_helper(helper_name, args)
        if base_result is not None:
            return base_result

        # form_list_unlock(state, parent_form_list, level_required, fight_logic=False)
        # Expands the set mutation logic into a conditional rule structure
        if helper_name == 'form_list_unlock' and args and len(args) >= 2:
            from worlds.kh2.Logic import auto_form_dict
            from worlds.kh2.Names import ItemName

            parent_form_arg = args[0]  # e.g., {'type': 'constant', 'value': 'Valor Form'}
            level_required_arg = args[1]  # e.g., {'type': 'constant', 'value': 3}
            fight_logic_arg = args[2] if len(args) >= 3 else {'type': 'constant', 'value': False}

            # Extract the parent form value if it's a constant
            parent_form_value = None
            if isinstance(parent_form_arg, dict) and parent_form_arg.get('type') == 'constant':
                parent_form_value = parent_form_arg.get('value')

            # Get the auto form for this parent form
            auto_form_value = None
            if parent_form_value:
                # Find the matching entry in auto_form_dict
                for form_item, auto_item in auto_form_dict.items():
                    if form_item == parent_form_value or str(form_item) == parent_form_value:
                        auto_form_value = str(auto_item) if hasattr(auto_item, '__str__') else auto_item
                        break

            # Build the has_any(form_access) part with conditional logic
            # Base case: just check parent form
            base_form_check = {'type': 'item_check', 'item': parent_form_arg.get('value') if isinstance(parent_form_arg, dict) else parent_form_arg}

            # With auto form: or(item_check(parent_form), item_check(auto_form))
            # Using 'or' instead of 'has_any' since has_any isn't supported in ruleEngine
            if auto_form_value:
                with_auto_form_check = {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': parent_form_value},
                        {'type': 'item_check', 'item': auto_form_value}
                    ]
                }
            else:
                with_auto_form_check = base_form_check

            # Determine if this is MasterForm
            is_master_form = parent_form_value == str(ItemName.MasterForm) if parent_form_value else False

            # Build the conditional form access logic
            # If fight_logic is a constant False, we can simplify
            fight_logic_is_false = (isinstance(fight_logic_arg, dict) and
                                    fight_logic_arg.get('type') == 'constant' and
                                    fight_logic_arg.get('value') == False)

            if fight_logic_is_false:
                # No fight_logic, so just check AutoFormLogic AND SecondChance
                if is_master_form:
                    # MasterForm requires DriveConverter for auto form
                    form_access_rule = {
                        'type': 'conditional',
                        'test': {
                            'type': 'and',
                            'conditions': [
                                {'type': 'setting_value', 'setting': 'AutoFormLogic'},
                                {'type': 'item_check', 'item': 'Second Chance'},
                                {'type': 'item_check', 'item': 'Drive Converter'}
                            ]
                        },
                        'if_true': with_auto_form_check,
                        'if_false': base_form_check
                    }
                else:
                    # Non-MasterForm: auto form if AutoFormLogic AND SecondChance
                    form_access_rule = {
                        'type': 'conditional',
                        'test': {
                            'type': 'and',
                            'conditions': [
                                {'type': 'setting_value', 'setting': 'AutoFormLogic'},
                                {'type': 'item_check', 'item': 'Second Chance'}
                            ]
                        },
                        'if_true': with_auto_form_check,
                        'if_false': base_form_check
                    }
            else:
                # fight_logic could be True, need to include NOT fight_logic in condition
                # For simplicity, if fight_logic is True, just use base form check
                if isinstance(fight_logic_arg, dict) and fight_logic_arg.get('type') == 'constant' and fight_logic_arg.get('value') == True:
                    form_access_rule = base_form_check
                else:
                    # fight_logic is dynamic parameter - use full conditional
                    if is_master_form:
                        form_access_rule = {
                            'type': 'conditional',
                            'test': {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'setting_value', 'setting': 'AutoFormLogic'},
                                    {'type': 'item_check', 'item': 'Second Chance'},
                                    {'type': 'not', 'condition': fight_logic_arg},
                                    {'type': 'item_check', 'item': 'Drive Converter'}
                                ]
                            },
                            'if_true': with_auto_form_check,
                            'if_false': base_form_check
                        }
                    else:
                        form_access_rule = {
                            'type': 'conditional',
                            'test': {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'setting_value', 'setting': 'AutoFormLogic'},
                                    {'type': 'item_check', 'item': 'Second Chance'},
                                    {'type': 'not', 'condition': fight_logic_arg}
                                ]
                            },
                            'if_true': with_auto_form_check,
                            'if_false': base_form_check
                        }

            # Combine with get_form_level_requirement
            return {
                'type': 'and',
                'conditions': [
                    form_access_rule,
                    {'type': 'helper', 'name': 'get_form_level_requirement', 'args': [level_required_arg]}
                ]
            }

        # get_form_level_requirement(state, amount)
        # Checks if player has enough forms to meet the level requirement
        # Logic varies based on FinalFormLogic setting
        if helper_name == 'get_form_level_requirement' and args and len(args) >= 1:
            from worlds.kh2.Names import ItemName

            amount_arg = args[0]  # e.g., {'type': 'constant', 'value': 3}

            # Form names
            all_forms = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form', 'Final Form']
            forms_without_final = ['Valor Form', 'Wisdom Form', 'Limit Form', 'Master Form']

            # Helper to build form count sum
            def build_form_count_sum(forms):
                """Build a sum of item_checks for the given forms."""
                return {
                    'type': 'sum',
                    'iterable': {
                        'type': 'list',
                        'value': [{'type': 'item_check', 'item': form} for form in forms]
                    }
                }

            # Case 1: no_light_and_darkness - count all 5 forms
            no_ld_check = {
                'type': 'comparison',
                'op': '>=',  # ruleEngine uses 'op' not 'operator'
                'left': build_form_count_sum(all_forms),
                'right': amount_arg
            }

            # Helper to build or(item_check, item_check, ...) for has_any
            def build_has_any_as_or(forms):
                """Convert has_any to or of item_checks since has_any isn't supported."""
                if len(forms) == 1:
                    return {'type': 'item_check', 'item': forms[0]}
                return {
                    'type': 'or',
                    'conditions': [{'type': 'item_check', 'item': form} for form in forms]
                }

            # Case 2: light_and_darkness
            # If has L&D + any form: bonus=1, count 4 forms (without Final)
            # If NOT (has L&D + any form): bonus=0, count ALL 5 forms (including Final!)
            # Python removes Final from list only when L&D condition is met
            ld_condition = {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Light & Darkness'},
                    build_has_any_as_or(all_forms)
                ]
            }
            ld_check = {
                'type': 'conditional',
                'test': ld_condition,
                'if_true': {
                    # Has L&D + any form: bonus=1, count 4 forms without Final
                    'type': 'comparison',
                    'op': '>=',
                    'left': {
                        'type': 'binary_op',
                        'op': '+',
                        'left': {'type': 'constant', 'value': 1},
                        'right': build_form_count_sum(forms_without_final)
                    },
                    'right': amount_arg
                },
                'if_false': {
                    # No L&D condition: bonus=0, count ALL 5 forms including Final
                    'type': 'comparison',
                    'op': '>=',
                    'left': build_form_count_sum(all_forms),
                    'right': amount_arg
                }
            }

            # Case 3: just a form - bonus if has any of 4 forms, count 4 forms
            # forms_available = (1 if has_any(4 forms) else 0) + count(4 forms without Final)
            just_form_bonus = {
                'type': 'conditional',
                'test': build_has_any_as_or(forms_without_final),
                'if_true': {'type': 'constant', 'value': 1},
                'if_false': {'type': 'constant', 'value': 0}
            }
            just_form_check = {
                'type': 'comparison',
                'op': '>=',  # ruleEngine uses 'op' not 'operator'
                'left': {
                    'type': 'binary_op',
                    'op': '+',
                    'left': just_form_bonus,
                    'right': build_form_count_sum(forms_without_final)
                },
                'right': amount_arg
            }

            # Build the full conditional based on FinalFormLogic setting
            # FinalFormLogic options: 0 = no_light_and_darkness, 1 = light_and_darkness, 2 = just_a_form
            # Note: Settings are exported as integer values from Choice options
            return {
                'type': 'conditional',
                'test': {
                    'type': 'comparison',
                    'op': '!=',  # ruleEngine uses 'op' not 'operator'
                    'left': {'type': 'setting_value', 'setting': 'FinalFormLogic'},
                    'right': {'type': 'constant', 'value': 0}  # no_light_and_darkness = 0
                },
                'if_true': {
                    # FinalFormLogic is either 1 (light_and_darkness) or 2 (just_a_form)
                    'type': 'conditional',
                    'test': {
                        'type': 'comparison',
                        'op': '==',  # ruleEngine uses 'op' not 'operator'
                        'left': {'type': 'setting_value', 'setting': 'FinalFormLogic'},
                        'right': {'type': 'constant', 'value': 1}  # light_and_darkness = 1
                    },
                    'if_true': ld_check,
                    'if_false': just_form_check
                },
                'if_false': no_ld_check
            }

        # kh2_can_reach is now handled by HELPER_TO_RULE_MAPPINGS (base class)

        # Handle kh2_can_reach_any - convert to OR of location_checks
        if helper_name == 'kh2_can_reach_any' and args and len(args) >= 1:
            loc_list_arg = args[0]
            # If loc_list_arg is a constant list, expand it inline
            if isinstance(loc_list_arg, dict) and loc_list_arg.get('type') == 'constant':
                locations = loc_list_arg.get('value', [])
                if isinstance(locations, (list, set, tuple)):
                    conditions = [{'type': 'location_check', 'location': {'type': 'constant', 'value': loc}} for loc in locations]
                    if len(conditions) == 1:
                        return conditions[0]
                    return {'type': 'or', 'conditions': conditions}
            # Otherwise preserve as any_of pattern
            return None

        # Handle kh2_can_reach_all - convert to AND of location_checks
        if helper_name == 'kh2_can_reach_all' and args and len(args) >= 1:
            loc_list_arg = args[0]
            # If loc_list_arg is a constant list, expand it inline
            if isinstance(loc_list_arg, dict) and loc_list_arg.get('type') == 'constant':
                locations = loc_list_arg.get('value', [])
                if isinstance(locations, (list, set, tuple)):
                    conditions = [{'type': 'location_check', 'location': {'type': 'constant', 'value': loc}} for loc in locations]
                    if len(conditions) == 1:
                        return conditions[0]
                    return {'type': 'and', 'conditions': conditions}
            # Otherwise preserve as all_of pattern
            return None

        # Handle final_form_region_access - expands to any() over final_leveling_access locations
        # Uses location_check which checks both region reachability AND location access rule
        if helper_name == 'final_form_region_access':
            try:
                from worlds.kh2.Logic import final_leveling_access
                # final_leveling_access is a set of location names - sort for deterministic output
                locations = sorted(list(final_leveling_access))
                conditions = [{'type': 'location_check', 'location': {'type': 'constant', 'value': loc}} for loc in locations]
                if len(conditions) == 1:
                    return conditions[0]
                return {'type': 'or', 'conditions': conditions}
            except ImportError:
                logger.warning("Could not import final_leveling_access for final_form_region_access expansion")
                return None

        # For now, preserve helper nodes as-is until we identify specific helpers
        return None

    def get_world_attributes(self, world, multiworld, player) -> Dict[str, Any]:
        """Strip the run-specific timestamp from mod_yml.description for deterministic output.

        KH2's generate_output() embeds the current datetime in mod_yml["description"]
        (e.g., "... at 18Feb2026-051325 UTC. Have fun!"). Removing it keeps the
        exported JSON consistent across runs with the same seed.
        """
        attrs = super().get_world_attributes(world, multiworld, player)
        if 'mod_yml' in attrs and isinstance(attrs['mod_yml'], dict):
            desc = attrs['mod_yml'].get('description', '')
            if isinstance(desc, str):
                attrs['mod_yml']['description'] = re.sub(r' at \S+ UTC', '', desc)
        return attrs
        
