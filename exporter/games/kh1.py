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
                    for location in region.get('locations', []):
                        location_name = location.get('name', '')
                        access_rule = location.get('access_rule')

                        if access_rule and isinstance(access_rule, dict):
                            # Fix the access rule
                            location['access_rule'] = self._fix_has_all_counts_rule(access_rule, location_name)

        return data

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

        return rule