"""Overcooked! 2 game-specific export handler."""

from typing import Dict, Any, List, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Overcooked2GameExportHandler(GenericGameExportHandler):
    """
    Overcooked! 2 exports complex level access rules based on:
    - Overworld region traversal with ramp requirements
    - Level star requirements with weighted sum calculations
    - Ramp tricks logic for alternate paths
    """
    # Preserve these helpers during rule analysis - they're expanded in expand_helper
    HELPERS_TO_PRESERVE = {'has_requirements_for_level_star', 'has_requirements_for_level_access'}

    # Constant helper expansions - helpers that always return a constant value
    # overworld_logic is a check that should always pass since region access is
    # handled by the proper level access logic
    CONSTANT_HELPER_EXPANSIONS = {
        'overworld_logic': True,
    }

    def get_game_info(self, world):
        """Export level_logic to frontend for star requirement calculations."""
        game_info = super().get_game_info(world)

        try:
            from worlds.overcooked2 import Logic
            if hasattr(Logic, 'level_logic'):
                game_info['level_logic'] = Logic.level_logic
        except Exception as e:
            logger.error(f"Error adding level_logic to game_info: {e}")

        return game_info

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None):
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

                # Get allow_tricks from world options (not from closure - it's passed directly)
                # The original lambda passes self.options.ramp_tricks.result to the helper function
                allow_tricks = False
                if self.world and hasattr(self.world, 'options') and hasattr(self.world.options, 'ramp_tricks'):
                    allow_tricks = bool(self.world.options.ramp_tricks.result)
                    logger.info(f"[{rule_target_name}] Using ramp_tricks from world options: {allow_tricks}")

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

    def postprocess_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process analyzed rules to expand helpers.

        This is needed because override_rule_analysis results are passed through
        postprocess_rule for expansion. The base class expand_rule will call
        our expand_helper to handle game-specific helpers.
        """
        if not rule:
            return rule
        return self.expand_rule(rule)

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand Overcooked! 2-specific helpers.

        The base class expand_rule calls expand_helper for helper nodes and recursively
        expands the result, so we don't need a custom expand_rule override.
        """
        # Check base class expansions first (CONSTANT_HELPER_EXPANSIONS)
        result = super().expand_helper(helper_name, args)
        if result:
            return result

        # Game-specific helper expansions
        if helper_name == 'has_requirements_for_level_star':
            rule = {'type': 'helper', 'name': helper_name, 'args': args or []}
            return self._expand_level_star_rule(rule)

        if helper_name == 'has_requirements_for_level_access':
            rule = {'type': 'helper', 'name': helper_name, 'args': args or []}
            return self._expand_level_access_rule(rule)

        return None

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
            # Sum Star and Bonus Star counts using binary_op addition
            # Original Python: state.count("Star", player) + state.count("Bonus Star", player)
            conditions.append({
                'type': 'compare',
                'left': {
                    'type': 'binary_op',
                    'op': '+',
                    'left': {'type': 'count_item', 'item': 'Star'},
                    'right': {'type': 'count_item', 'item': 'Bonus Star'}
                },
                'op': '>=',
                'right': {'type': 'constant', 'value': required_stars}
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
                # Original logic from can_reach_sky_shelf:
                # 1. Green Ramp
                # 2. 5-1 Level Complete + Purple Ramp (always, not just with tricks)
                # 3. (with tricks) Pink Island access + Progressive Dash
                #    -> Pink Ramp + Progressive Dash (pink_island's base case)
                # 4. Tip of the map access - only via Purple Ramp path without tricks,
                #    or via out_of_bounds with tricks
                # The visited list in Python prevents infinite recursion
                conditions = [
                    {'type': 'item_check', 'item': 'Green Ramp'},
                    # Path 2: via Purple Ramp + 5-1 completion
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': '5-1 Level Complete'},
                            {'type': 'item_check', 'item': 'Purple Ramp'}
                        ]
                    }
                ]
                if allow_tricks:
                    # Path 3: via Pink Island + Dash (pink_island's base case is Pink Ramp)
                    conditions.append({
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Progressive Dash'},
                            {'type': 'item_check', 'item': 'Pink Ramp'}
                        ]
                    })
                    # Path 4: via out_of_bounds (requires tricks!)
                    # out_of_bounds = allow_tricks AND Dash AND Dark Green Ramp AND Kevin-1
                    conditions.append({
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Progressive Dash'},
                            {'type': 'item_check', 'item': 'Dark Green Ramp'},
                            {'type': 'item_check', 'item': 'Kevin-1'}
                        ]
                    })
                return {'type': 'or', 'conditions': conditions}

            elif overworld_region == OverworldRegion.pink_island:
                # Original logic from can_reach_pink_island:
                # 1. Pink Ramp
                # 2. (with tricks) Progressive Dash + can_reach_sky_shelf
                #    sky_shelf can be reached via:
                #    - Green Ramp
                #    - 5-1 Level Complete + Purple Ramp
                #    - out_of_bounds (Dash + Dark Green Ramp + Kevin-1)
                if allow_tricks:
                    return {
                        'type': 'or',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Pink Ramp'},
                            # Via sky_shelf: Green Ramp + Dash
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Progressive Dash'},
                                    {'type': 'item_check', 'item': 'Green Ramp'}
                                ]
                            },
                            # Via sky_shelf: 5-1 + Purple + Dash
                            {
                                'type': 'and',
                                'conditions': [
                                    {'type': 'item_check', 'item': 'Progressive Dash'},
                                    {'type': 'item_check', 'item': '5-1 Level Complete'},
                                    {'type': 'item_check', 'item': 'Purple Ramp'}
                                ]
                            },
                            # Via sky_shelf via out_of_bounds: Dash + Dark Green Ramp + Kevin-1
                            # (Dash already required, so just need Dark Green Ramp + Kevin-1)
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
                    return {'type': 'item_check', 'item': 'Pink Ramp'}

            elif overworld_region == OverworldRegion.tip_of_the_map:
                # Original logic:
                # 1. 5-1 Level Complete + Purple Ramp, OR
                # 2. can_reach_out_of_bounds (requires allow_tricks!), OR
                # 3. (with tricks) can_reach_sky_shelf
                # Note: out_of_bounds REQUIRES allow_tricks in Python!
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
                    # Out of bounds path (REQUIRES tricks!)
                    # out_of_bounds = allow_tricks AND Dash AND Dark Green Ramp AND Kevin-1
                    conditions.append({
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Progressive Dash'},
                            {'type': 'item_check', 'item': 'Dark Green Ramp'},
                            {'type': 'item_check', 'item': 'Kevin-1'}
                        ]
                    })
                    # From sky shelf (which requires Green Ramp OR Dash + Pink Ramp)
                    conditions.extend([
                        {'type': 'item_check', 'item': 'Green Ramp'},
                        {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Progressive Dash'},
                                {'type': 'item_check', 'item': 'Pink Ramp'}
                            ]
                        }
                    ])
                return {'type': 'or', 'conditions': conditions}

            elif overworld_region == OverworldRegion.mars_shelf:
                # Requires tip of the map access first
                return self._build_mars_shelf_access_rule(allow_tricks)

            elif overworld_region == OverworldRegion.kevin_eight_island:
                # Requires mars shelf access - same as mars shelf rules
                return self._build_mars_shelf_access_rule(allow_tricks)

            else:
                logger.warning(f"Unhandled overworld region {overworld_region} for level {level_name}")
                return None

        except Exception as e:
            logger.error(f"Error building overworld access rule for {level_name}: {e}", exc_info=True)
            return None

    def _build_tip_of_the_map_access_conditions(self, allow_tricks: bool) -> list:
        """Build the list of access conditions for tip_of_the_map region.

        Original logic:
        1. 5-1 Level Complete + Purple Ramp, OR
        2. out_of_bounds (REQUIRES allow_tricks!), OR
        3. (with tricks) sky_shelf access

        Note: out_of_bounds REQUIRES allow_tricks in Python!
        """
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
            # Out of bounds path (REQUIRES tricks!)
            conditions.append({
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': 'Progressive Dash'},
                    {'type': 'item_check', 'item': 'Dark Green Ramp'},
                    {'type': 'item_check', 'item': 'Kevin-1'}
                ]
            })
            # From sky shelf (which requires Green Ramp OR Dash + Pink Ramp)
            conditions.extend([
                {'type': 'item_check', 'item': 'Green Ramp'},
                {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Progressive Dash'},
                        {'type': 'item_check', 'item': 'Pink Ramp'}
                    ]
                }
            ])
        return conditions

    def _build_mars_shelf_access_rule(self, allow_tricks: bool) -> Dict[str, Any]:
        """Build access rule for mars shelf / kevin eight island regions.

        Original logic:
        1. tip_of_the_map access + allow_tricks, OR
        2. tip_of_the_map access + 6-1 Level Complete + Red Ramp
        """
        tip_conditions = self._build_tip_of_the_map_access_conditions(allow_tricks)

        if allow_tricks:
            # With tricks, just need tip_of_the_map access
            return {'type': 'or', 'conditions': tip_conditions}
        else:
            # Without tricks, need tip_of_the_map + 6-1 + Red Ramp
            # Create: (tip_path_1 OR tip_path_2) AND 6-1 AND Red Ramp
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'or', 'conditions': tip_conditions},
                    {'type': 'item_check', 'item': '6-1 Level Complete'},
                    {'type': 'item_check', 'item': 'Red Ramp'}
                ]
            }

    def _expand_level_star_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand has_requirements_for_level_star helper into explicit rules.

        This checks if the player can earn a specific number of stars on a level.
        The helper checks:
        1. Global requirements ("*") for all stars up to the target
        2. Level-specific requirements for all stars up to the target

        Each check involves:
        - Exclusive requirements (must have ALL items)
        - Additive requirements (weighted sum >= 1.0)
        """
        # Ensure level_logic is loaded
        if not hasattr(self, 'level_logic') or not self.level_logic:
            try:
                from worlds.overcooked2 import Logic
                self.level_logic = Logic.level_logic
                logger.info(f"Loaded level_logic with {len(self.level_logic)} entries")
            except Exception as e:
                logger.error(f"Error loading level_logic: {e}")
                return {'type': 'constant', 'value': True}

        args = rule.get('args', [])
        if len(args) < 2:
            logger.warning(f"has_requirements_for_level_star called with insufficient args: {args}")
            return {'type': 'constant', 'value': True}

        level_arg = args[0]
        stars_arg = args[1]

        # Extract shortname and stars from constant args
        shortname = self._resolve_constant(level_arg)
        stars = self._resolve_constant(stars_arg)

        if shortname is None or stars is None:
            logger.warning(f"Could not resolve has_requirements_for_level_star args: shortname={shortname}, stars={stars}")
            return {'type': 'constant', 'value': True}

        # Build the combined requirements
        conditions = []

        # Check global requirements ("*") for stars 1 through target_stars
        global_rule = self._build_level_logic_rule("*", stars)
        if global_rule:
            conditions.append(global_rule)

        # Check level-specific requirements for stars 1 through target_stars
        level_rule = self._build_level_logic_rule(shortname, stars)
        if level_rule:
            conditions.append(level_rule)

        # Combine all conditions
        if len(conditions) == 0:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}

    def _build_level_logic_rule(self, shortname: str, target_stars: int) -> Optional[Dict[str, Any]]:
        """Build a rule that checks level_logic requirements for a given shortname and star count.

        This checks requirements for all stars from 1 up to target_stars (inclusive).
        """
        if shortname not in self.level_logic:
            # No logic for this level - no requirements
            return None

        level_reqs = self.level_logic[shortname]
        conditions = []

        # Check requirements for each star level up to target_stars
        for star_idx in range(min(target_stars, len(level_reqs))):
            star_logic = level_reqs[star_idx]
            if len(star_logic) < 2:
                continue

            exclusive_reqs = star_logic[0]
            additive_reqs = star_logic[1]

            # Add exclusive requirements (must have ALL)
            if exclusive_reqs:
                # Convert to a list if it's a set
                exclusive_list = list(exclusive_reqs) if isinstance(exclusive_reqs, (set, frozenset)) else exclusive_reqs
                if exclusive_list:
                    # Create has_all check for exclusive requirements
                    for item_name in exclusive_list:
                        conditions.append({'type': 'item_check', 'item': item_name})

            # Add additive requirements (weighted sum >= 1.0)
            if additive_reqs:
                additive_list = list(additive_reqs) if isinstance(additive_reqs, (set, frozenset)) else additive_reqs
                if additive_list:
                    # Build a weighted sum check
                    # We need: sum(weight for item, weight in additive if has(item)) >= 1.0
                    # Approximation: require enough items to sum to >= 1.0
                    additive_rule = self._build_additive_rule(additive_list)
                    if additive_rule:
                        conditions.append(additive_rule)

        # Combine all conditions
        if len(conditions) == 0:
            return None
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}

    def _build_additive_rule(self, additive_reqs: List) -> Optional[Dict[str, Any]]:
        """Build a rule for additive requirements (weighted sum >= 1.0).

        For additive requirements, we need the weighted sum of owned items to be >= 1.0.
        We export this as a compact 'weighted_sum' helper that the frontend evaluates.
        """
        if not additive_reqs:
            return None

        # Convert to list of (item, weight) tuples
        items = []
        for req in additive_reqs:
            if len(req) >= 2:
                items.append((req[0], req[1]))

        if not items:
            return None

        # Sort by weight descending for optimization (check high-weight items first)
        # Secondary sort by item name for deterministic ordering when weights are equal
        items.sort(key=lambda x: (-x[1], x[0]))

        # Export as a compact weighted_sum helper - frontend calculates if sum >= 1.0
        # This is MUCH more compact than expanding to all valid combinations
        return {
            'type': 'helper',
            'name': 'weighted_sum',
            'args': [
                {'type': 'constant', 'value': 1.0},  # threshold
                {'type': 'constant', 'value': [[item, weight] for item, weight in items]}  # items with weights
            ]
        }

    def _resolve_constant(self, rule: Optional[Dict[str, Any]]) -> Any:
        """Resolve a rule to a constant value if possible."""
        if not rule:
            return None

        if rule.get('type') == 'constant':
            return rule.get('value')

        if rule.get('type') == 'name':
            # Try to resolve the name - for now just return the name
            return rule.get('name')

        return None
