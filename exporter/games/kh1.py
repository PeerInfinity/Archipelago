"""Kingdom Hearts 1 specific helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)

class KH1GameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Kingdom Hearts'
    """KH1-specific expander that handles Kingdom Hearts 1 rules."""

    def __init__(self, world=None):
        """Initialize with optional world reference."""
        super().__init__()
        self.world = world
        self.options_cache = {}
    
    def preprocess_world_data(self, world, export_data: Dict[str, Any], player: int) -> None:
        """Populate options cache before region processing."""
        if hasattr(world, 'options'):
            self.options_cache = {}
            options = world.options

            # Extract all KH1-specific options
            kh1_option_names = [
                'goal', 'end_of_the_world_unlock', 'final_rest_door',
                'required_reports_eotw', 'required_reports_door', 'reports_in_pool',
                'super_bosses', 'atlantica', 'hundred_acre_wood', 'cups',
                'puppies', 'starting_worlds', 'keyblades_unlock_chests',
                'interact_in_battle', 'exp_multiplier', 'advanced_logic',
                'extra_shared_abilities', 'exp_zero_in_pool', 'vanilla_emblem_pieces',
                'donald_death_link', 'goofy_death_link', 'randomize_keyblade_stats',
                'bad_starting_weapons', 'keyblade_min_str', 'keyblade_max_str',
                'keyblade_min_mp', 'keyblade_max_mp', 'level_checks',
                'force_stats_on_levels', 'strength_increase', 'defense_increase',
                'hp_increase', 'ap_increase', 'mp_increase',
                'accessory_slot_increase', 'item_slot_increase'
            ]

            for option_name in kh1_option_names:
                if hasattr(options, option_name):
                    option_obj = getattr(options, option_name)
                    # Get the value attribute if it exists, otherwise use the object itself
                    value = getattr(option_obj, 'value', option_obj)
                    # Cache for options resolution
                    self.options_cache[option_name] = value
                    logger.debug(f"Cached KH1 option: {option_name} = {value}")

    def expand_helper(self, helper_name: str, args=None):
        """Expand KH1-specific helper functions."""
        # Map of KH1 helper functions to their simplified rules
        helper_map = {
            # Add specific KH1 helpers as we discover them
        }

        if helper_name in helper_map:
            return helper_map[helper_name]

        # For now, preserve helper nodes as-is until we identify specific helpers
        return None
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions for KH1."""
        if not rule:
            return rule

        # First, resolve any options references
        rule = self._resolve_options_in_rule(rule)

        # Special handling for function_call with self methods
        if rule.get('type') == 'function_call':
            func = rule.get('function', {})
            # Check if this is a self.method_name pattern
            if func.get('type') == 'attribute' and isinstance(func.get('object'), dict):
                obj = func.get('object', {})
                if obj.get('type') == 'name' and obj.get('name') == 'self':
                    # This is a self.method_name call
                    method_name = func.get('attr')
                    args = rule.get('args', [])
                    if method_name:
                        # Try to expand this as a helper with args
                        expanded = self.expand_helper(method_name, args)
                        if expanded:
                            return self.expand_rule(expanded)  # Recursively expand the result
                        # If not expandable, convert to a helper node with args
                        return {'type': 'helper', 'name': method_name, 'args': args}

        # Special handling for __analyzed_func__
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
            return self._infer_rule_type(rule)

        # Special handling for helper nodes
        if rule.get('type') == 'helper':
            # Resolve options in args first
            if 'args' in rule and rule['args']:
                rule['args'] = [self._resolve_options_in_rule(arg) for arg in rule['args']]
            expanded = self.expand_helper(rule.get('name'), rule.get('args'))
            if expanded:
                return self.expand_rule(expanded)  # Recursively expand
            return rule

        # Handle and/or conditions recursively
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        # Handle not condition
        if rule.get('type') == 'not':
            rule['condition'] = self.expand_rule(rule.get('condition'))

        return rule
    
    def _analyze_original_rule(self, original_rule):
        """
        Attempt to analyze the original rule structure before it became __analyzed_func__.
        """
        # Look for state method calls in the original rule
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])
            
            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                item_check = {
                    'type': 'item_check',
                    'item': args[0]
                }
                # Add count if specified
                if len(args) >= 2:
                    item_check['count'] = {'type': 'constant', 'value': args[1]}
                return item_check
                
            # Handle other known state methods
            if method in ['can_reach', 'has_group', 'has_any']:
                return {
                    'type': 'game_specific_check',
                    'method': method,
                    'args': args,
                    'description': f"Requires {method}({', '.join(str(a) for a in args)})"
                }
        
        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed due to game-specific implementation'
        }
    
    def _infer_rule_type(self, rule):
        """
        Attempt to infer rule type based on context clues.
        """
        args = rule.get('args', [])
        
        # Look for keywords in rule name or source code if available
        rule_str = str(rule)
        
        # Item check patterns
        if 'has(' in rule_str.lower() or 'state.has' in rule_str.lower():
            item_match = re.search(r"has\(['\"](.*?)['\"]\s*,", rule_str)
            if item_match:
                return {
                    'type': 'item_check',
                    'item': item_match.group(1),
                    'inferred': True
                }
        
        # Location access patterns
        if 'can_reach' in rule_str.lower():
            return {
                'type': 'can_reach',
                'inferred': True,
                'description': 'Requires reaching a specific location'
            }
        
        # Return a more descriptive generic rule
        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed but may involve item requirements'
        }
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return KH1-specific item data with classification flags.
        """
        from BaseClasses import ItemClassification
        
        item_data = {}
        
        # Get items from world.item_name_to_id if available
        if hasattr(world, 'item_name_to_id'):
            for item_name, item_id in world.item_name_to_id.items():
                # Try to get classification from item class
                is_advancement = False
                is_useful = False
                is_trap = False
                
                try:
                    # Try to get classification from item pool
                    if hasattr(world, 'multiworld'):
                        for item in world.multiworld.itempool:
                            if item.player == world.player and item.name == item_name:
                                is_advancement = item.classification == ItemClassification.progression
                                is_useful = item.classification == ItemClassification.useful
                                is_trap = item.classification == ItemClassification.trap
                                break
                        
                        # Additional check: scan placed items in locations
                        if not (is_advancement or is_useful or is_trap):
                            for location in world.multiworld.get_locations(world.player):
                                if (location.item and location.item.player == world.player and 
                                    location.item.name == item_name and location.item.code is not None):
                                    is_advancement = location.item.classification == ItemClassification.progression
                                    is_useful = location.item.classification == ItemClassification.useful
                                    is_trap = location.item.classification == ItemClassification.trap
                                    break
                except Exception as e:
                    logger.debug(f"Could not determine classification for {item_name}: {e}")
                
                # Get groups if available
                groups = []
                if hasattr(world, 'item_name_groups'):
                    groups = [
                        group_name for group_name, items in world.item_name_groups.items()
                        if item_name in items
                    ]
                
                item_data[item_name] = {
                    'name': item_name,
                    'id': item_id,
                    'groups': sorted(groups),
                    'advancement': is_advancement,
                    'useful': is_useful,
                    'trap': is_trap,
                    'event': False,  # Regular items are not events
                    'type': None,
                    'max_count': 1
                }
        
        # Handle dynamically created event items by scanning locations
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID) that we haven't seen
                    if (location.item.code is None and 
                        item_name not in item_data and
                        hasattr(location.item, 'classification')):
                        
                        item_data[item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['Event'],
                            'advancement': location.item.classification == ItemClassification.progression,
                            'useful': location.item.classification == ItemClassification.useful,
                            'trap': location.item.classification == ItemClassification.trap,
                            'event': True,
                            'type': 'Event',
                            'max_count': 1
                        }

        return item_data

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts KH1-specific game settings for export."""
        # Get base settings
        settings_dict = super().get_settings_data(world, multiworld, player)

        settings_dict['use_resolved_items'] = True

        # Add cached KH1 options to settings
        # (options were already cached in preprocess_world_data)
        for option_name, value in self.options_cache.items():
            settings_dict[option_name] = value
            logger.debug(f"Exported KH1 option: {option_name} = {value}")

        return settings_dict

    def _resolve_options_in_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively resolve options.* attribute references to their constant values.

        This method finds patterns like:
        {
          "type": "attribute",
          "object": {"type": "name", "name": "options"},
          "attr": "keyblades_unlock_chests"
        }

        And replaces them with:
        {
          "type": "constant",
          "value": False  # or whatever the actual option value is
        }
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check if this is an options attribute access
        if rule.get('type') == 'attribute':
            obj = rule.get('object', {})
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'options':
                attr_name = rule.get('attr')
                if attr_name and attr_name in self.options_cache:
                    value = self.options_cache[attr_name]
                    logger.debug(f"Resolved options.{attr_name} to constant value: {value}")
                    return {'type': 'constant', 'value': value}
                else:
                    logger.warning(f"Could not resolve options.{attr_name} - not in cache")

        # Recursively process nested structures
        if 'conditions' in rule and isinstance(rule['conditions'], list):
            rule['conditions'] = [self._resolve_options_in_rule(cond) for cond in rule['conditions']]

        if 'condition' in rule:
            rule['condition'] = self._resolve_options_in_rule(rule['condition'])

        if 'args' in rule and isinstance(rule['args'], list):
            rule['args'] = [self._resolve_options_in_rule(arg) for arg in rule['args']]

        if 'test' in rule:
            rule['test'] = self._resolve_options_in_rule(rule['test'])

        if 'if_true' in rule:
            rule['if_true'] = self._resolve_options_in_rule(rule['if_true'])

        if 'if_false' in rule:
            rule['if_false'] = self._resolve_options_in_rule(rule['if_false'])

        if 'left' in rule:
            rule['left'] = self._resolve_options_in_rule(rule['left'])

        if 'right' in rule:
            rule['right'] = self._resolve_options_in_rule(rule['right'])

        if 'object' in rule:
            rule['object'] = self._resolve_options_in_rule(rule['object'])

        return rule

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process the exported data to fix KH1-specific issues.

        This handles cases where the analyzer couldn't fully resolve rules,
        particularly for has_all_counts which appears with empty args due to
        variable resolution issues in has_all_magic_lvx.
        """
        # Fix has_all_counts state_method calls with empty args
        # These come from has_all_magic_lvx(state, player, level) which calls
        # state.has_all_counts({...}, player) with a dict that references 'level'
        # The analyzer can't resolve 'level' so it outputs empty args

        if 'regions' in data:
            for player_id, player_regions in data['regions'].items():
                for region_name, region in player_regions.items():
                    # Fix location access rules
                    for location in region.get('locations', []):
                        location_name = location.get('name', '')
                        access_rule = location.get('access_rule')

                        if access_rule and isinstance(access_rule, dict):
                            # Special handling for Level locations in the Levels region
                            if region_name == 'Levels' and self._is_level_location(location_name):
                                location['access_rule'] = self._fix_level_location_rule(access_rule, location_name)
                            # Special handling for locations that require additional checks
                            elif self._needs_additional_check(location_name):
                                location['access_rule'] = self._fix_has_all_counts_rule(access_rule, location_name)
                                location['access_rule'] = self._add_missing_check(location['access_rule'], location_name)
                            else:
                                # Fix the access rule normally
                                location['access_rule'] = self._fix_has_all_counts_rule(access_rule, location_name)

                    # Fix exit access rules
                    for exit_data in region.get('exits', []):
                        exit_name = exit_data.get('name', '')
                        access_rule = exit_data.get('access_rule')

                        if access_rule and isinstance(access_rule, dict):
                            # Special handling for World Map exits - fix broken has_x_worlds
                            if region_name == 'World Map' and self._is_world_map_exit(exit_name):
                                exit_data['access_rule'] = self._fix_world_map_exit_rule(access_rule, exit_name)
                            else:
                                # Fix the access rule normally
                                exit_data['access_rule'] = self._fix_has_all_counts_rule(access_rule, exit_name)

        return data

    def _fix_world_map_exit_rule(self, rule: Dict[str, Any], exit_name: str) -> Dict[str, Any]:
        """
        Fix World Map exit access rules that contain broken has_x_worlds conditionals.

        The Python rule for most world exits is:
        state.has("WorldName", player) and has_x_worlds(state, player, N, ...)

        The analyzer produces:
        {
            "type": "and",
            "conditions": [
                {broken_has_x_worlds_conditional},
                {"type": "item_check", "item": "WorldName"}
            ]
        }

        For End of the World, the rule is more complex with lucky emblems:
        {
            "type": "and",
            "conditions": [
                {broken_has_x_worlds_conditional},
                {"type": "or", "conditions": [lucky_emblem_check, item_check]}
            ]
        }

        We replace the broken conditional with a proper helper call.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check if this is the expected pattern
        if rule.get('type') == 'and' and 'conditions' in rule:
            conditions = rule['conditions']
            if len(conditions) == 2:
                first, second = conditions
                # Check if first condition is the broken conditional
                if self._is_broken_has_x_worlds_conditional(first):
                    # Case 1: second is a direct item_check for the world
                    if second.get('type') == 'item_check' and second.get('item') == exit_name:
                        num_of_worlds = self._get_world_map_exit_num_worlds(exit_name)
                        logger.info(f"Fixing World Map exit to {exit_name} -> has_x_worlds({num_of_worlds}) AND item_check")
                        return {
                            'type': 'and',
                            'conditions': [
                                {
                                    'type': 'helper',
                                    'name': 'has_x_worlds',
                                    'args': [
                                        {'type': 'constant', 'value': num_of_worlds},
                                        {'type': 'constant', 'value': self.options_cache.get('keyblades_unlock_chests', False)}
                                    ]
                                },
                                second  # Keep the item_check
                            ]
                        }

                    # Case 2: second is an 'or' containing the item_check (e.g., End of the World with lucky emblems)
                    if second.get('type') == 'or' and 'conditions' in second:
                        or_conditions = second['conditions']
                        # Check if any of the or conditions is an item_check for the exit
                        has_item_check = any(
                            isinstance(c, dict) and c.get('type') == 'item_check' and c.get('item') == exit_name
                            for c in or_conditions
                        )
                        if has_item_check:
                            num_of_worlds = self._get_world_map_exit_num_worlds(exit_name)
                            logger.info(f"Fixing World Map exit to {exit_name} -> has_x_worlds({num_of_worlds}) AND (or conditions)")
                            return {
                                'type': 'and',
                                'conditions': [
                                    {
                                        'type': 'helper',
                                        'name': 'has_x_worlds',
                                        'args': [
                                            {'type': 'constant', 'value': num_of_worlds},
                                            {'type': 'constant', 'value': self.options_cache.get('keyblades_unlock_chests', False)}
                                        ]
                                    },
                                    second  # Keep the 'or' conditions as-is
                                ]
                            }

        return rule

    def _is_broken_has_x_worlds_conditional(self, rule: Dict[str, Any]) -> bool:
        """
        Detect the broken has_x_worlds conditional pattern.

        The pattern is:
        {
            "type": "conditional",
            "test": {"type": "compare", "left": {"type": "constant", "value": X}, "op": ">=", "right": {"type": "constant", "value": 15}},
            "if_true": {"type": "constant", "value": true},
            "if_false": {"type": "constant", "value": 0.0}
        }

        Where X is the difficulty value (typically 5) and 15 is LOGIC_MINIMAL.
        """
        if not isinstance(rule, dict) or rule.get('type') != 'conditional':
            return False

        test = rule.get('test', {})
        if_true = rule.get('if_true', {})
        if_false = rule.get('if_false', {})

        # Check the structure
        if test.get('type') != 'compare':
            return False
        if test.get('op') != '>=':
            return False

        # Check left side is a constant (difficulty value)
        left = test.get('left', {})
        if left.get('type') != 'constant':
            return False

        # Check right side is constant 15 (LOGIC_MINIMAL)
        right = test.get('right', {})
        if right.get('type') != 'constant' or right.get('value') != 15:
            return False

        # Check if_true is constant True
        if if_true.get('type') != 'constant' or if_true.get('value') is not True:
            return False

        # Check if_false is constant 0.0 (the broken part)
        if if_false.get('type') != 'constant' or if_false.get('value') != 0.0:
            return False

        return True

    def _fix_has_all_counts_rule(self, rule: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """
        Recursively fix has_all_counts state_method calls in rules.

        When we find a state_method with has_all_counts and empty args,
        we convert it to a helper call to has_all_magic_lvx with the
        appropriate level extracted from the location name.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # First, recursively process nested structures to fix all has_all_counts
        if 'conditions' in rule and isinstance(rule['conditions'], list):
            rule['conditions'] = [self._fix_has_all_counts_rule(cond, location_name) for cond in rule['conditions']]

        if 'condition' in rule:
            rule['condition'] = self._fix_has_all_counts_rule(rule['condition'], location_name)

        if 'test' in rule:
            rule['test'] = self._fix_has_all_counts_rule(rule['test'], location_name)

        if 'if_true' in rule:
            rule['if_true'] = self._fix_has_all_counts_rule(rule['if_true'], location_name)

        if 'if_false' in rule:
            rule['if_false'] = self._fix_has_all_counts_rule(rule['if_false'], location_name)

        if 'left' in rule:
            rule['left'] = self._fix_has_all_counts_rule(rule['left'], location_name)

        if 'right' in rule:
            rule['right'] = self._fix_has_all_counts_rule(rule['right'], location_name)

        # Now check for patterns AFTER nested fixes

        # Check if this is a has_all_counts state_method with empty or missing args
        if (rule.get('type') == 'state_method' and
            rule.get('method') == 'has_all_counts' and
            not rule.get('args')):

            # Extract level from location name
            # Level 3 locations
            if 'LV3 Magic' in location_name or 'All LV3 Magic' in location_name:
                level = 3
            # Level 2 locations - specific Neverland locations and superboss-related checks
            elif ('Clock Tower' in location_name or
                  'Phantom' in location_name or
                  ('Final Rest' in location_name and 'superboss' in location_name.lower())):
                level = 2
            # Level 2 magic explicitly
            elif 'LV2 Magic' in location_name or 'All LV2 Magic' in location_name:
                level = 2
            # Default to level 1 for all other cases
            # This includes "Obtained All Arts Items" and similar locations
            else:
                level = 1

            logger.info(f"Fixing has_all_counts rule for {location_name} -> has_all_magic_lvx({level})")
            return {
                'type': 'helper',
                'name': 'has_all_magic_lvx',
                'args': [{'type': 'constant', 'value': level}]
            }

        # Check for has_defensive_tools pattern:
        # An 'and' condition containing has_all_magic_lvx and has_any_count
        # This occurs when has_defensive_tools is inlined
        if rule.get('type') == 'and' and 'conditions' in rule:
            conditions = rule['conditions']
            has_magic_lvx = any(
                isinstance(c, dict) and c.get('type') == 'helper' and c.get('name') == 'has_all_magic_lvx'
                for c in conditions
            )
            has_any_count = any(
                isinstance(c, dict) and c.get('type') == 'state_method' and c.get('method') == 'has_any_count'
                for c in conditions
            )

            if has_magic_lvx and has_any_count:
                # This is the has_defensive_tools pattern - replace the entire 'and' with a helper call
                logger.info(f"Detected has_defensive_tools pattern in {location_name}, converting to helper call")
                return {
                    'type': 'helper',
                    'name': 'has_defensive_tools',
                    'args': []
                }

        # Fix "name" type references to functions like has_basic_tools
        # In Python, function references used without calling them are truthy,
        # so "or has_basic_tools" (without parentheses) is effectively "or True"
        # This is a bug in the upstream Python code but we need to match its behavior
        if rule.get('type') == 'name':
            func_name = rule.get('name')
            # List of known function names that are mistakenly used without calling them
            truthy_function_names = [
                'has_basic_tools',  # Used in Oogie's Manor rules without calling it
            ]
            if func_name in truthy_function_names:
                logger.info(f"Converting function reference '{func_name}' to constant True (function refs are truthy in Python)")
                return {'type': 'constant', 'value': True}

            # Fix "worlds" parameter reference in has_parasite_cage
            # The analyzer couldn't inline has_x_worlds call, so it outputs the parameter name
            # has_parasite_cage is always called with has_x_worlds(state, player, 3, ...) for the worlds param
            if func_name == 'worlds':
                logger.info(f"Converting 'worlds' parameter reference to has_x_worlds(3) for {location_name}")
                return {
                    'type': 'helper',
                    'name': 'has_x_worlds',
                    'args': [
                        {'type': 'constant', 'value': 3},
                        {'type': 'constant', 'value': self.options_cache.get('keyblades_unlock_chests', False)}
                    ]
                }

        # Fix any remaining broken has_x_worlds conditionals (not in special regions)
        # These occur in various locations with rules like "has_x_worlds(6) or ..."
        if self._is_broken_has_x_worlds_conditional(rule):
            # Infer num_of_worlds from the location name context
            num_of_worlds = self._infer_num_of_worlds_general(location_name)
            logger.info(f"Fixing broken has_x_worlds conditional in {location_name} -> has_x_worlds({num_of_worlds})")
            return {
                'type': 'helper',
                'name': 'has_x_worlds',
                'args': [
                    {'type': 'constant', 'value': num_of_worlds},
                    {'type': 'constant', 'value': self.options_cache.get('keyblades_unlock_chests', False)}
                ]
            }

        return rule

    def _infer_num_of_worlds_general(self, location_name: str) -> int:
        """
        Infer the num_of_worlds for a general location.

        This is used for locations that aren't World Map exits or Level locations.
        Based on the Python code, most locations use 3 or 6 worlds.
        """
        # Locations that typically require 6 worlds
        if any(keyword in location_name for keyword in [
            'Hollow Bastion', 'End of the World', 'Defeat Heartless 3',
            'Secret Waterway Navi', 'Kairi Secret Waterway Oathkeeper'
        ]):
            return 6
        # Locations that typically require 8 worlds
        if 'Final Ansem' in location_name or 'End of the World' in location_name:
            return 8
        # Default to 3 for most other locations
        return 3

    def _is_world_map_exit(self, location_name: str) -> bool:
        """Check if this is a World Map exit to a world region."""
        # World Map exit names are just the world names
        world_names = [
            'Wonderland', 'Olympus Coliseum', 'Deep Jungle', 'Agrabah',
            'Monstro', 'Atlantica', 'Halloween Town', 'Neverland',
            'Hollow Bastion', 'End of the World', 'Destiny Islands'
        ]
        return location_name in world_names

    def _get_world_map_exit_num_worlds(self, exit_name: str) -> int:
        """Get the num_of_worlds requirement for a World Map exit."""
        # Based on worlds/kh1/Rules.py lines 1766-1786
        if exit_name == 'Neverland':
            return 4
        elif exit_name == 'Hollow Bastion':
            return 6
        elif exit_name == 'End of the World':
            return 8
        else:
            return 3  # Default for most worlds

    def _is_level_location(self, location_name: str) -> bool:
        """Check if this is a Level-up location."""
        import re
        return bool(re.match(r'^Level \d{3} \(Slot [12]\)$', location_name))

    def _get_level_num_worlds(self, location_name: str) -> int:
        """
        Get the num_of_worlds requirement for a Level location.

        Based on worlds/kh1/Rules.py lines 1694-1703:
        min(((level_num//10)*2), 8)

        For Level 002-009: level_num is 1-8, (//10)*2 = 0
        For Level 010-019: level_num is 9-18, (//10)*2 = 0 or 2
        etc.
        """
        import re
        match = re.match(r'^Level (\d{3})', location_name)
        if match:
            level_display = int(match.group(1))  # e.g., "002" -> 2
            level_num = level_display - 1  # The Python code uses level_num = i, where display is i+1
            num_worlds = min((level_num // 10) * 2, 8)
            return num_worlds
        return 0

    def _fix_level_location_rule(self, rule: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """
        Fix Level location access rules that contain broken has_x_worlds conditionals.

        The Python rule for Level locations is:
        has_x_worlds(state, player, min(((level_num//10)*2), 8), ...)

        For early levels (2-9), this requires 0 worlds - always True.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check if this is the broken conditional pattern
        if self._is_broken_has_x_worlds_conditional(rule):
            num_of_worlds = self._get_level_num_worlds(location_name)
            logger.info(f"Fixing Level location {location_name} -> has_x_worlds({num_of_worlds})")
            return {
                'type': 'helper',
                'name': 'has_x_worlds',
                'args': [
                    {'type': 'constant', 'value': num_of_worlds},
                    {'type': 'constant', 'value': self.options_cache.get('keyblades_unlock_chests', False)}
                ]
            }

        return rule

    def _needs_additional_check(self, location_name: str) -> bool:
        """
        Check if a location needs an additional check that the analyzer may have dropped.
        """
        # Locations that require has_all_summons
        if "Geppetto All Summons" in location_name:
            return True
        # Locations that require has_all_arts
        if "Obtained All Arts Items" in location_name:
            return True
        return False

    def _add_missing_check(self, rule: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """
        Add missing checks that the analyzer dropped for specific locations.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Add has_all_summons for Geppetto All Summons Reward
        if "Geppetto All Summons" in location_name:
            logger.info(f"Adding missing has_all_summons check for {location_name}")
            # has_all_summons requires: Simba, Bambi, Genie, Dumbo, Mushu, Tinker Bell
            has_all_summons_check = {
                'type': 'state_method',
                'method': 'has_all',
                'args': [
                    {
                        'type': 'constant',
                        'value': ["Simba", "Bambi", "Genie", "Dumbo", "Mushu", "Tinker Bell"]
                    }
                ]
            }
            return {
                'type': 'and',
                'conditions': [rule, has_all_summons_check]
            }

        # Add has_all_arts for Obtained All Arts Items
        if "Obtained All Arts Items" in location_name:
            logger.info(f"Adding missing has_all_arts check for {location_name}")
            # has_all_arts requires: Fire Arts, Blizzard Arts, Thunder Arts, Cure Arts, Gravity Arts, Stop Arts, Aero Arts
            has_all_arts_check = {
                'type': 'state_method',
                'method': 'has_all',
                'args': [
                    {
                        'type': 'constant',
                        'value': ["Fire Arts", "Blizzard Arts", "Thunder Arts", "Cure Arts", "Gravity Arts", "Stop Arts", "Aero Arts"]
                    }
                ]
            }
            return {
                'type': 'and',
                'conditions': [rule, has_all_arts_check]
            }

        return rule