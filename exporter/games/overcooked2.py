"""Overcooked! 2 game-specific export handler."""

from typing import Dict, Any, List, Optional
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Overcooked2GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Overcooked! 2'

    def __init__(self):
        super().__init__()
        self.overworld_region_logic_mapping = {}
        self.level_logic = {}
        self.ramp_tricks_enabled = False

    def get_settings_data(self, world, multiworld, player):
        """Extract Overcooked! 2 settings including ramp_tricks option."""
        settings = super().get_settings_data(world, multiworld, player)

        # Extract ramp_tricks setting
        try:
            if hasattr(world, 'options') and hasattr(world.options, 'ramp_tricks'):
                self.ramp_tricks_enabled = bool(world.options.ramp_tricks.value)
                settings['ramp_tricks'] = self.ramp_tricks_enabled
            else:
                self.ramp_tricks_enabled = False
                settings['ramp_tricks'] = False
        except Exception as e:
            logger.error(f"Error extracting ramp_tricks option: {e}")
            self.ramp_tricks_enabled = False
            settings['ramp_tricks'] = False

        return settings

    def get_game_info(self, world):
        """Extract game info including level_logic."""
        game_info = super().get_game_info(world)

        # Add level_logic to game info (keep shortname keys as-is)
        try:
            from worlds.overcooked2 import Logic

            if hasattr(Logic, 'level_logic'):
                # Use the level_logic dictionary as-is (with shortname keys)
                game_info['level_logic'] = Logic.level_logic
                logger.info(f"Added level_logic with {len(Logic.level_logic)} entries to game_info")
        except Exception as e:
            logger.error(f"Error adding level_logic to game_info: {e}")

        return game_info

    def initialize_game_data(self, world):
        """Initialize game-specific data from the world object."""
        super().initialize_game_data(world)

        # Import the overworld region logic and level logic from the game's Logic module
        try:
            from worlds.overcooked2 import Logic
            from worlds.overcooked2.Overcooked2Levels import OverworldRegion, overworld_region_by_level

            # Store the overworld region logic mapping
            self.overworld_region_logic = Logic.overworld_region_logic
            self.overworld_region_by_level = overworld_region_by_level
            self.level_logic = Logic.level_logic

            logger.info(f"Initialized Overcooked! 2 game data with {len(self.level_logic)} level logic entries")
        except Exception as e:
            logger.error(f"Error initializing Overcooked! 2 game data: {e}")

    def override_rule_analysis(self, rule_func, rule_target_name: str = None):
        """Override rule analysis to properly handle Overcooked! 2 helper functions."""
        if not hasattr(rule_func, '__code__'):
            return None

        code = rule_func.__code__


        # Extract closure variables
        closure_vars = {}
        if hasattr(rule_func, '__closure__') and rule_func.__closure__:
            var_names = code.co_freevars
            for i, cell in enumerate(rule_func.__closure__):
                if i < len(var_names):
                    try:
                        closure_vars[var_names[i]] = cell.cell_contents
                    except ValueError:
                        pass

        # Extract default arguments (for lambdas with default params like level_name=...)
        if hasattr(rule_func, '__defaults__') and rule_func.__defaults__:
            # Get argument names (excluding 'state' which is the first positional arg)
            arg_names = code.co_varnames[1:code.co_argcount]  # Skip 'state'
            defaults = rule_func.__defaults__
            # Match defaults to their argument names (defaults are right-aligned)
            start_index = len(arg_names) - len(defaults)
            for i, default_value in enumerate(defaults):
                arg_name = arg_names[start_index + i]
                closure_vars[arg_name] = default_value


        # Handle entrance rules (has_requirements_for_level_access)
        if 'has_requirements_for_level_access' in code.co_names:
            if rule_target_name and ' -> ' in rule_target_name:
                _, level_name = rule_target_name.split(' -> ', 1)

                # Get the captured parameters
                level_name_val = closure_vars.get('level_name', level_name)
                previous_level = closure_vars.get('previous_level_completed_event_name')
                required_stars = closure_vars.get('required_star_count', 0)
                allow_tricks = closure_vars.get('allow_ramp_tricks', self.ramp_tricks_enabled)

                # Create a helper rule and EXPAND IT IMMEDIATELY
                # (because override results bypass the normal expansion flow)
                helper_rule = {
                    'type': 'helper',
                    'name': 'has_requirements_for_level_access',
                    'args': [
                        {'type': 'constant', 'value': level_name_val},
                        {'type': 'constant', 'value': previous_level},
                        {'type': 'constant', 'value': required_stars},
                        {'type': 'constant', 'value': allow_tricks}
                    ]
                }
                # Expand the helper immediately
                return self._expand_level_access_rule(helper_rule)

        # Handle location rules (has_requirements_for_level_star)
        if 'has_requirements_for_level_star' in code.co_names:
            # Extract level information from closure
            level_obj = closure_vars.get('level')
            stars = closure_vars.get('stars', 1)

            # Extract shortname from the level object (used for level_logic lookup)
            if level_obj:
                # level_obj is an Overcooked2GenericLevel instance
                if hasattr(level_obj, 'shortname'):
                    shortname = level_obj.shortname
                    logger.info(f"[{rule_target_name}] Extracted shortname={shortname}, stars={stars}")
                else:
                    # Fallback: try to parse from location name
                    shortname = None

                # Create a helper rule with the shortname
                return {
                    'type': 'helper',
                    'name': 'has_requirements_for_level_star',
                    'args': [
                        {'type': 'constant', 'value': shortname} if shortname else {'type': 'constant', 'value': None},
                        {'type': 'constant', 'value': stars}
                    ]
                }

        # Return None to use default analysis
        return None

    def expand_helper(self, helper_name: str):
        """Expand Overcooked! 2 helper functions."""
        # For now, preserve helpers as-is - they'll be implemented in frontend
        if helper_name in ['has_requirements_for_level_star', 'has_requirements_for_level_access',
                          'meets_requirements', 'has_enough_stars']:
            return None  # Keep as helper

        return super().expand_helper(helper_name)

    def postprocess_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process analyzed rules to expand Overcooked! 2-specific helpers."""
        if not rule:
            return rule

        # First expand any helpers and resolve variables
        rule = self._resolve_variables_in_rule(rule)

        # Then call expand_rule to expand any Overcooked! 2-specific helpers
        return self.expand_rule(rule)

    def _resolve_variables_in_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve variable references in rules by removing them or replacing with actual checks."""
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Handle name type - these are variable references that should be resolved
        if rule_type == 'name':
            var_name = rule.get('name')
            # Variables like 'visited' should be ignored (they're internal tracking)
            if var_name == 'visited':
                # Return a constant true since visited is just for recursion prevention
                return {'type': 'constant', 'value': []}
            # These variables should have been resolved by lambda capture but weren't
            # We'll return them as-is and let them cause errors if they're actually used
            return rule

        # Recursively process conditional rules
        if rule_type == 'conditional':
            return {
                'type': 'conditional',
                'test': self._resolve_variables_in_rule(rule.get('test')),
                'if_true': self._resolve_variables_in_rule(rule.get('if_true')),
                'if_false': self._resolve_variables_in_rule(rule.get('if_false'))
            }

        # Recursively process and/or rules
        if rule_type in ['and', 'or']:
            return {
                'type': rule_type,
                'conditions': [self._resolve_variables_in_rule(cond) for cond in rule.get('conditions', [])]
            }

        # Recursively process not rules
        if rule_type == 'not':
            return {
                'type': 'not',
                'condition': self._resolve_variables_in_rule(rule.get('condition'))
            }

        # Recursively process compare rules
        if rule_type == 'compare':
            return {
                'type': 'compare',
                'left': self._resolve_variables_in_rule(rule.get('left')),
                'op': rule.get('op'),
                'right': self._resolve_variables_in_rule(rule.get('right'))
            }

        # Recursively process helper rules
        if rule_type == 'helper':
            helper_name = rule.get('name', '')
            # Expand overworld_logic helper
            if helper_name == 'overworld_logic':
                # The overworld_logic helper is actually a check that should always pass
                # since we're checking if we can reach a region from Menu/Overworld
                # For now, return constant true - the actual region checks will be
                # handled by the proper level access logic
                return {'type': 'constant', 'value': True}
            # For has_requirements_for_level_star, if the first arg is a 'name' type (unresolved variable),
            # we can't use it directly. Keep the rule as a helper but mark the variable for special handling
            if helper_name == 'has_requirements_for_level_star':
                args = rule.get('args', [])
                if args and args[0].get('type') == 'name' and args[0].get('name') == 'level':
                    # The JavaScript helper can't evaluate this without the actual level object
                    # Since we don't have the level_id at this point, we need to leave it as-is
                    # The frontend will need to handle this differently
                    pass
            # Process args
            resolved_args = [self._resolve_variables_in_rule(arg) for arg in rule.get('args', [])]
            rule = dict(rule)
            rule['args'] = resolved_args
            return rule

        # Recursively process item_check with name-type items
        if rule_type == 'item_check':
            item = rule.get('item')
            if isinstance(item, dict) and item.get('type') == 'name':
                # Can't resolve the name, keep as-is
                return rule
            return rule

        # Recursively process function_call
        if rule_type == 'function_call':
            return {
                'type': 'function_call',
                'function': self._resolve_variables_in_rule(rule.get('function')),
                'args': [self._resolve_variables_in_rule(arg) for arg in rule.get('args', [])]
            }

        # Return rule as-is for other types
        return rule

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Overcooked! 2-specific handling."""
        if not rule:
            return rule

        rule_type = rule.get('type')

        # Handle helper functions
        if rule_type == 'helper':
            helper_name = rule.get('name', '')

            # Keep certain helpers as-is (don't let generic exporter convert them to items)
            if helper_name in ['has_enough_stars', 'has_requirements_for_level_star',
                              'has_requirements_for_level_access', 'meets_requirements']:
                # Don't call super().expand_rule() - this would convert has_* to items
                # Just recursively process the args if any
                if 'args' in rule:
                    rule = dict(rule)  # Make a copy
                    rule['args'] = [self.expand_rule(arg) if isinstance(arg, dict) else arg
                                   for arg in rule.get('args', [])]
                return rule

            # Handle has_requirements_for_level_access (shouldn't reach here due to override)
            if helper_name == 'has_requirements_for_level_access':
                return self._expand_level_access_rule(rule)

            # Handle has_requirements_for_level_star (shouldn't reach here due to override)
            if helper_name == 'has_requirements_for_level_star':
                return self._expand_level_star_rule(rule)

            # Handle meets_requirements
            if helper_name == 'meets_requirements':
                return self._expand_meets_requirements(rule)

        # Standard recursive processing
        return super().expand_rule(rule)

    def _expand_level_access_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand has_requirements_for_level_access helper into explicit rules.

        Args from the helper:
        - state: CollectionState (provided by rule engine)
        - level_name: str - name of the level (e.g., "1-1")
        - previous_level_completed_event_name: str or None
        - required_star_count: int
        - allow_ramp_tricks: bool
        - player: int (implicit)
        """
        args = rule.get('args', [])
        if len(args) < 4:
            logger.warning(f"has_requirements_for_level_access called with insufficient args: {args}")
            return rule

        # Extract arguments (skip state which is index 0)
        level_name_rule = args[0] if len(args) > 0 else None
        previous_level_rule = args[1] if len(args) > 1 else None
        star_count_rule = args[2] if len(args) > 2 else None
        allow_tricks_rule = args[3] if len(args) > 3 else None

        # Resolve constant values
        level_name = self._resolve_constant(level_name_rule)
        previous_level_event = self._resolve_constant(previous_level_rule)
        required_stars = self._resolve_constant(star_count_rule)
        allow_tricks = self._resolve_constant(allow_tricks_rule)

        if level_name is None:
            logger.warning(f"Could not resolve level_name in has_requirements_for_level_access")
            return rule

        # Build the combined access rule
        conditions = []

        # 1. Overworld region access (ramp requirements)
        overworld_rule = self._build_overworld_access_rule(level_name, allow_tricks)
        if overworld_rule:
            conditions.append(overworld_rule)

        # 2. Kevin levels need the Kevin item
        if level_name.startswith('K') or level_name.startswith('Kevin'):
            conditions.append({
                'type': 'item_check',
                'item': level_name.replace(' ', '-') if ' ' in level_name else level_name
            })

        # 3. Star count requirement
        if required_stars and required_stars > 0:
            # Note: Star and Bonus Star are different items, so we need to check if either has enough
            # The original Python code does: state.count("Star", player) + state.count("Bonus Star", player)
            # For now, use a helper that can handle this additive count logic
            conditions.append({
                'type': 'helper',
                'name': 'has_enough_stars',
                'args': [
                    {'type': 'constant', 'value': required_stars}
                ]
            })

        # 4. Previous level completion requirement
        # Filter out variable names that weren't properly resolved
        if (previous_level_event and
            previous_level_event not in [None, 'None', 'null', 'previous_level_completed_event_name'] and
            not previous_level_event.endswith('_event_name')):
            conditions.append({
                'type': 'item_check',
                'item': previous_level_event
            })

        # Combine all conditions
        if len(conditions) == 0:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {
                'type': 'and',
                'conditions': conditions
            }

    def _build_overworld_access_rule(self, level_name: str, allow_tricks: bool) -> Optional[Dict[str, Any]]:
        """Build the overworld region access rule for a given level."""
        try:
            from worlds.overcooked2.Overcooked2Levels import OverworldRegion, overworld_region_by_level

            # Get the overworld region for this level
            overworld_region = overworld_region_by_level.get(level_name)

            if overworld_region is None:
                logger.warning(f"Unknown overworld region for level {level_name}")
                return None

            # Build the rule based on the overworld region
            if overworld_region == OverworldRegion.main:
                # Main region is always accessible - no requirement
                return None

            elif overworld_region == OverworldRegion.yellow_island:
                return {'type': 'item_check', 'item': 'Yellow Ramp'}

            elif overworld_region == OverworldRegion.dark_green_mountain:
                return {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Dark Green Ramp'},
                        {'type': 'item_check', 'item': 'Kevin-1'}
                    ]
                }

            elif overworld_region == OverworldRegion.stonehenge_mountain:
                # Blue Ramp OR (out of bounds access via dash + dark green mountain)
                if allow_tricks:
                    return {
                        'type': 'or',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Blue Ramp'},
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Progressive Dash'},
                                    {'type': 'item_check', 'item': 'Dark Green Ramp'},
                                    {'type': 'item_check', 'item': 'Kevin-1'}
                                ]
                            }
                        ]
                    }
                else:
                    return {'type': 'item_check', 'item': 'Blue Ramp'}

            elif overworld_region == OverworldRegion.sky_shelf:
                # Green Ramp OR (5-1 Complete + Purple Ramp) OR tricks
                conditions = [
                    {'type': 'item_check', 'item': 'Green Ramp'},
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': '5-1 Level Complete'},
                            {'type': 'item_check', 'item': 'Purple Ramp'}
                        ]
                    }
                ]
                if allow_tricks:
                    # Can dash from pink island
                    conditions.append({
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Progressive Dash'},
                            {'type': 'item_check', 'item': 'Pink Ramp'}
                        ]
                    })
                return {'type': 'or', 'conditions': conditions}

            elif overworld_region == OverworldRegion.pink_island:
                # Pink Ramp OR (dash from sky shelf with tricks)
                if allow_tricks:
                    return {
                        'type': 'or',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Pink Ramp'},
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Progressive Dash'},
                                    {'type': 'item_check', 'item': 'Green Ramp'}  # Need green ramp to reach sky shelf
                                ]
                            }
                        ]
                    }
                else:
                    return {'type': 'item_check', 'item': 'Pink Ramp'}

            elif overworld_region == OverworldRegion.tip_of_the_map:
                # (5-1 Complete + Purple Ramp) OR out of bounds tricks
                conditions = [
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': '5-1 Level Complete'},
                            {'type': 'item_check', 'item': 'Purple Ramp'}
                        ]
                    }
                ]
                if allow_tricks:
                    conditions.extend([
                        # Out of bounds via dark green mountain
                        {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Progressive Dash'},
                                {'type': 'item_check', 'item': 'Dark Green Ramp'},
                                {'type': 'item_check', 'item': 'Kevin-1'}
                            ]
                        },
                        # Or from sky shelf
                        {'type': 'item_check', 'item': 'Green Ramp'}
                    ])
                return {'type': 'or', 'conditions': conditions}

            elif overworld_region == OverworldRegion.mars_shelf:
                # Requires tip of the map access first
                base_conditions = [
                    # Can reach tip of the map via (5-1 Complete + Purple Ramp)
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': '5-1 Level Complete'},
                            {'type': 'item_check', 'item': 'Purple Ramp'}
                        ]
                    }
                ]

                if allow_tricks:
                    # With tricks, just reaching tip of the map is enough
                    return {'type': 'or', 'conditions': base_conditions}
                else:
                    # Without tricks, need 6-1 Complete + Red Ramp in addition to tip access
                    return {
                        'type': 'and',
                        'conditions': base_conditions + [
                            {'type': 'item_check', 'item': '6-1 Level Complete'},
                            {'type': 'item_check', 'item': 'Red Ramp'}
                        ]
                    }

            elif overworld_region == OverworldRegion.kevin_eight_island:
                # Requires mars shelf access - same as mars shelf rules
                return self._build_overworld_access_rule_for_mars_shelf(allow_tricks)

            else:
                logger.warning(f"Unhandled overworld region {overworld_region} for level {level_name}")
                return None

        except Exception as e:
            logger.error(f"Error building overworld access rule for {level_name}: {e}", exc_info=True)
            return None

    def _build_overworld_access_rule_for_mars_shelf(self, allow_tricks: bool) -> Dict[str, Any]:
        """Build access rule specifically for mars shelf / kevin eight island."""
        base_conditions = [
            {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': '5-1 Level Complete'},
                    {'type': 'item_check', 'item': 'Purple Ramp'}
                ]
            }
        ]

        if allow_tricks:
            return {'type': 'or', 'conditions': base_conditions}
        else:
            return {
                'type': 'and',
                'conditions': base_conditions + [
                    {'type': 'item_check', 'item': '6-1 Level Complete'},
                    {'type': 'item_check', 'item': 'Red Ramp'}
                ]
            }

    def _expand_level_star_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand has_requirements_for_level_star helper.

        This checks if the player can earn a specific number of stars on a level.
        """
        args = rule.get('args', [])
        if len(args) < 2:
            return rule

        # If the first arg is still a variable reference, we can't expand it here
        # Instead, keep it as a helper but the frontend will need to handle it
        level_arg = args[0]
        stars_arg = args[1]

        if level_arg.get('type') == 'name':
            # Can't expand without knowing the level - keep as helper
            return rule

        # Extract level_id and stars
        level_id = self._resolve_constant(level_arg)
        stars = self._resolve_constant(stars_arg)

        if level_id is None or stars is None:
            return rule

        # Look up the level in level_logic to get its shortname
        # The level_logic uses shortnames like "Story 1-1", not level numbers
        # We need to figure out the shortname from the level_id
        # For now, keep as helper - this would require more context
        return rule

    def _expand_meets_requirements(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand meets_requirements helper.

        This checks the level_logic dictionary for specific requirements.
        """
        # Keep as helper for now - will be implemented in frontend
        return rule

    def _resolve_constant(self, rule: Dict[str, Any]) -> Any:
        """Resolve a rule to a constant value if possible."""
        if not rule:
            return None

        if rule.get('type') == 'constant':
            return rule.get('value')

        if rule.get('type') == 'name':
            # Try to resolve the name - for now just return the name
            return rule.get('name')

        return None
