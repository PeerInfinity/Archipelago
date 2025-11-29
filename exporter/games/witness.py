"""The Witness game-specific export handler."""

from typing import Dict, Any, Optional, List
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class WitnessGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'The Witness'

    # Mapping of laser activation locations to the regions containing their panels
    LASER_ACTIVATION_TO_REGION = {
        'Bunker Laser Activated': 'Bunker Laser Platform',
        'Swamp Laser Activated': 'Swamp Laser Area',
        'Town Laser Activated': 'Town Tower Top',
        'Treehouse Laser Activated': 'Treehouse Laser Room',
        'Quarry Laser Activated': 'Outside Quarry',
        'Symmetry Island Laser Activated': 'Symmetry Island Upper',
        'Jungle Laser Activated': 'Jungle',
        'Monastery Laser Activated': 'Outside Monastery',
        'Shadows Laser Activated': 'Shadows Laser Room',
        'Desert Laser Activated': 'Desert Outside',
        # Keep has two panels (Hedges or Pressure Plates), both in Keep Tower
        'Keep Laser Activated': 'Keep Tower',
    }

    def __init__(self):
        super().__init__()
        self._current_location_name = None

    def set_context(self, location_name: str):
        """Store the current location name for context-aware processing."""
        self._current_location_name = location_name

    def _is_all_of_comprehension_with_only_bound_methods(self, rule: Optional[Dict[str, Any]]) -> bool:
        """
        Check if a rule is an "all_of" comprehension pattern where ALL iterator values are bound methods.

        This pattern is safe to simplify to True because it ONLY checks region reachability,
        with no other conditions (like item checks).

        This pattern looks like:
        {
          "type": "all_of",
          "element_rule": {"type": "helper", "name": "condition", "args": []},
          "iterator_info": {
            "type": "comprehension_details",
            "target": {"type": "name", "name": "condition"},
            "iterator": {
              "type": "constant",
              "value": ["<bound method Region.can_reach of Keep Tower>", ...]
            }
          }
        }
        """
        if not rule or not isinstance(rule, dict):
            return False

        if rule.get('type') != 'all_of':
            return False

        iterator_info = rule.get('iterator_info', {})
        if iterator_info.get('type') != 'comprehension_details':
            return False

        iterator = iterator_info.get('iterator', {})
        if iterator.get('type') != 'constant':
            return False

        values = iterator.get('value', [])
        if not isinstance(values, list) or not values:
            return False

        # Check if ALL values are bound methods (not just at least one)
        # This is safe to simplify to True only when the ENTIRE iterator is region reachability checks
        # Values can be either actual method objects (during analysis) or string representations (in JSON)
        def is_bound_method(v):
            return (isinstance(v, str) and '<bound method' in v) or \
                   (hasattr(v, '__self__') and hasattr(v, '__name__'))

        return all(is_bound_method(v) for v in values)

    def _simplify_all_of_with_mixed_conditions(self, rule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Handle all_of comprehension patterns that contain BOTH bound methods (region reachability)
        AND other conditions (like item checks). Convert bound methods to can_reach_region helpers
        and analyze the remaining lambdas.

        Returns None if this rule is not a mixed all_of pattern.
        """
        from ..analyzer import analyze_rule

        if not rule or not isinstance(rule, dict):
            return None

        if rule.get('type') != 'all_of':
            return None

        iterator_info = rule.get('iterator_info', {})
        if iterator_info.get('type') != 'comprehension_details':
            return None

        iterator = iterator_info.get('iterator', {})
        if iterator.get('type') != 'constant':
            return None

        values = iterator.get('value', [])
        if not isinstance(values, list) or not values:
            return None

        def is_bound_method(v):
            return (isinstance(v, str) and '<bound method' in v) or \
                   (hasattr(v, '__self__') and hasattr(v, '__name__'))

        # Check if there are both bound methods and non-bound methods
        bound_methods = [v for v in values if is_bound_method(v)]
        other_conditions = [v for v in values if not is_bound_method(v)]

        if not bound_methods or not other_conditions:
            # Either all bound methods (handled elsewhere) or no bound methods (not our pattern)
            return None

        logger.debug(f"Simplifying all_of with {len(bound_methods)} bound methods and {len(other_conditions)} other conditions")

        analyzed_conditions = []

        # Convert bound methods to can_reach rule types
        for bm in bound_methods:
            if hasattr(bm, '__self__') and hasattr(bm.__self__, 'name'):
                # Extract region name from the bound method's self (Region object)
                region_name = bm.__self__.name
                logger.debug(f"Converting bound method to can_reach rule for '{region_name}'")
                analyzed_conditions.append({
                    'type': 'can_reach',
                    'region': region_name
                })
            elif isinstance(bm, str) and '<bound method Region.can_reach of ' in bm:
                # Extract region name from string representation
                # Format: "<bound method Region.can_reach of RegionName>"
                try:
                    region_name = bm.split(' of ')[1].rstrip('>')
                    logger.debug(f"Converting bound method string to can_reach rule for '{region_name}'")
                    analyzed_conditions.append({
                        'type': 'can_reach',
                        'region': region_name
                    })
                except (IndexError, AttributeError):
                    logger.warning(f"Could not extract region name from bound method string: {bm}")
                    return None
            else:
                logger.warning(f"Unknown bound method format: {bm}")
                return None

        # Analyze each non-bound-method condition
        for condition in other_conditions:
            if callable(condition):
                # Analyze the lambda function
                analyzed = analyze_rule(rule_func=condition, game_handler=self)
                if analyzed and analyzed.get('type') != 'error':
                    analyzed_conditions.append(analyzed)
                else:
                    # If we can't analyze a condition, we can't simplify
                    logger.warning(f"Could not analyze condition in all_of: {condition}")
                    return None
            else:
                # Non-callable, non-bound-method - we don't know how to handle this
                logger.warning(f"Unknown condition type in all_of: {type(condition)}")
                return None

        if not analyzed_conditions:
            # All conditions were filtered out (shouldn't happen)
            return {'type': 'constant', 'value': True}

        if len(analyzed_conditions) == 1:
            # Single condition remaining - return it directly
            return analyzed_conditions[0]

        # Multiple conditions - combine with AND
        return {'type': 'and', 'conditions': analyzed_conditions}

    def _is_region_reachability_pattern(self, rule: Optional[Dict[str, Any]]) -> bool:
        """
        Check if a rule matches the region.can_reach pattern:
        if state.stale[player]:
            state.update_reachable_regions(player)
        return self in state.reachable_regions[player]

        This pattern is exported as:
        {
          "type": "conditional",
          "test": {
            "type": "subscript",
            "value": {"type": "attribute", "object": {"type": "name", "name": "state"}, "attr": "stale"},
            "index": {"type": "constant", "value": player_id}
          },
          "if_true": {
            "type": "state_method",
            "method": "update_reachable_regions",
            "args": []
          },
          "if_false": {
            "type": "compare",
            "left": {"type": "name", "name": "self"},
            "op": "in",
            "right": {
              "type": "subscript",
              "value": {"type": "attribute", "object": {"type": "name", "name": "state"}, "attr": "reachable_regions"},
              "index": {"type": "constant", "value": player_id}
            }
          }
        }
        """
        if not rule or not isinstance(rule, dict):
            return False

        # Check if it's a conditional
        if rule.get('type') != 'conditional':
            return False

        # Check if test is checking state.stale[player]
        test = rule.get('test', {})
        if test.get('type') != 'subscript':
            return False
        test_value = test.get('value', {})
        if (test_value.get('type') != 'attribute' or
            test_value.get('attr') != 'stale' or
            test_value.get('object', {}).get('type') != 'name' or
            test_value.get('object', {}).get('name') != 'state'):
            return False

        # Check if if_true calls update_reachable_regions
        if_true = rule.get('if_true', {})
        if (if_true.get('type') != 'state_method' or
            if_true.get('method') != 'update_reachable_regions'):
            return False

        # Check if if_false checks self in state.reachable_regions[player]
        if_false = rule.get('if_false', {})
        if if_false.get('type') != 'compare' or if_false.get('op') != 'in':
            return False
        left = if_false.get('left', {})
        if left.get('type') != 'name' or left.get('name') != 'self':
            return False
        right = if_false.get('right', {})
        if right.get('type') != 'subscript':
            return False
        right_value = right.get('value', {})
        if (right_value.get('type') != 'attribute' or
            right_value.get('attr') != 'reachable_regions' or
            right_value.get('object', {}).get('type') != 'name' or
            right_value.get('object', {}).get('name') != 'state'):
            return False

        return True

    def _simplify_region_reachability_pattern(self, rule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Recursively simplify the region reachability pattern.

        For location rules, the pattern is simplified to True (locations are only
        checked when their region is reachable).

        For exit rules, if we have extracted region names, we convert the pattern
        to reach_region rules to properly track region dependencies.

        This method recursively processes compound rules (and, or) to simplify
        nested region reachability patterns.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check if this is the pattern itself
        if self._is_region_reachability_pattern(rule):
            # For exit rules, try to use extracted region names
            if hasattr(self, '_exit_region_names') and self._exit_region_names:
                # Pop the first region name from the list
                region_name = self._exit_region_names.pop(0)
                logger.debug(f"Converting region reachability pattern to can_reach('{region_name}')")
                return {'type': 'can_reach', 'region': region_name}
            # Otherwise, simplify to True (for location rules or if no region names available)
            logger.debug(f"Simplifying region reachability pattern to constant true")
            return {'type': 'constant', 'value': True}

        # Check if this is an all_of comprehension where ALL values are bound methods
        # For laser activation locations, this represents checking if any of multiple
        # regions can be reached (e.g., Keep Tower via hedges or pressure plates)
        # Only simplify to True if ALL conditions are region reachability checks
        if self._is_all_of_comprehension_with_only_bound_methods(rule):
            logger.debug(f"Simplifying all_of comprehension with only bound methods to constant true")
            return {'type': 'constant', 'value': True}

        # Check if this is an all_of comprehension with mixed bound methods and other lambdas
        # In this case, filter out the bound methods and analyze the remaining lambdas
        simplified_all_of = self._simplify_all_of_with_mixed_conditions(rule)
        if simplified_all_of is not None:
            return simplified_all_of

        # Recursively process compound rules
        rule_type = rule.get('type')

        if rule_type in ('and', 'or'):
            # Recursively simplify all conditions
            conditions = rule.get('conditions', [])
            simplified_conditions = [
                self._simplify_region_reachability_pattern(cond)
                for cond in conditions
            ]


            # Filter out constant True values from 'and' rules
            if rule_type == 'and':
                simplified_conditions = [
                    cond for cond in simplified_conditions
                    if cond.get('type') != 'constant' or cond.get('value') is not True
                ]
                # If all conditions were True, return True
                if not simplified_conditions:
                    return {'type': 'constant', 'value': True}
                # If only one condition remains, return it directly
                if len(simplified_conditions) == 1:
                    return simplified_conditions[0]

            # Filter out constant False values from 'or' rules
            elif rule_type == 'or':
                simplified_conditions = [
                    cond for cond in simplified_conditions
                    if cond.get('type') != 'constant' or cond.get('value') is not False
                ]
                # Check if any condition is True (entire OR is True)
                if any(cond.get('type') == 'constant' and cond.get('value') is True
                       for cond in simplified_conditions):
                    return {'type': 'constant', 'value': True}
                # If all conditions were False, return False
                if not simplified_conditions:
                    return {'type': 'constant', 'value': False}
                # If only one condition remains, return it directly
                if len(simplified_conditions) == 1:
                    return simplified_conditions[0]

            return {**rule, 'conditions': simplified_conditions}

        elif rule_type == 'not':
            # Recursively simplify the condition
            condition = rule.get('condition')
            simplified = self._simplify_region_reachability_pattern(condition)
            # If the simplified condition is a constant, negate it
            if simplified and simplified.get('type') == 'constant':
                return {'type': 'constant', 'value': not simplified.get('value')}
            return {**rule, 'condition': simplified}

        # For other rule types, return as-is
        return rule

    def _convert_region_reach_to_helper(self, rule: Optional[Dict[str, Any]], region_name: str = None) -> Optional[Dict[str, Any]]:
        """
        Convert region.can_reach patterns to can_reach helper calls.

        The pattern checks region reachability using a conditional that tests state.stale
        and state.reachable_regions. We convert this to a simpler can_reach helper call
        that takes the region name as a parameter.

        To extract the region name, we need to track which region object the method is
        bound to. For now, we look for the region name in the surrounding context or
        accept it as a parameter.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check if this is a region reachability pattern
        if self._is_region_reachability_pattern(rule):
            # For now, we can't extract the region name from the pattern itself
            # because it's a bound method. We would need analyzer-level changes.
            # As a workaround, we return the pattern as-is and let the frontend
            # handle it, OR we could try to extract context from the calling location.

            # TODO: Implement proper region name extraction
            # For now, just log that we found the pattern
            logger.debug(f"Found region reachability pattern but cannot extract region name")
            return rule

        # Recursively process compound rules
        rule_type = rule.get('type')

        if rule_type in ('and', 'or'):
            conditions = rule.get('conditions', [])
            simplified_conditions = [
                self._convert_region_reach_to_helper(cond, region_name)
                for cond in conditions
            ]
            return {**rule, 'conditions': simplified_conditions}

        elif rule_type == 'not':
            condition = rule.get('condition')
            simplified = self._convert_region_reach_to_helper(condition, region_name)
            return {**rule, 'condition': simplified}

        return rule

    def postprocess_rule(self, rule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Post-process location access rules to handle region reachability patterns.

        For laser activation locations, ensure the rule includes region reachability.
        The laser can only be activated if the player can REACH the region containing
        the laser panel AND has any required symbols/items.
        """
        # First, recursively simplify any region reachability patterns
        simplified_rule = self._simplify_region_reachability_pattern(rule)

        # Check if this is a laser activation location
        if self._current_location_name and self._current_location_name in self.LASER_ACTIVATION_TO_REGION:
            region_name = self.LASER_ACTIVATION_TO_REGION[self._current_location_name]
            can_reach_rule = {
                'type': 'helper',
                'name': 'can_reach_region',
                'args': [{'type': 'constant', 'value': region_name}]
            }

            # Check if the simplified rule is a region reachability pattern or constant True
            if self._is_region_reachability_pattern(simplified_rule):
                # Already a region reachability pattern - just convert to can_reach_region
                logger.info(f"Converting {self._current_location_name} to can_reach_region('{region_name}')")
                return can_reach_rule
            elif simplified_rule and simplified_rule.get('type') == 'constant' and simplified_rule.get('value') is True:
                # Constant True - use can_reach_region
                logger.info(f"Converting {self._current_location_name} (simplified to True) to can_reach_region('{region_name}')")
                return can_reach_rule
            elif simplified_rule and simplified_rule.get('type') == 'helper' and simplified_rule.get('name') == 'can_reach_region':
                # Already a can_reach_region helper - keep it
                logger.info(f"Keeping existing can_reach_region for {self._current_location_name}")
                return simplified_rule
            elif simplified_rule and simplified_rule.get('type') != 'constant':
                # Has item requirements but no region check - combine with AND
                # The item requirements capture what symbols are needed, but we also need
                # to be able to reach the region containing the laser panel
                logger.info(f"Combining {self._current_location_name} item requirements with can_reach_region('{region_name}')")
                return {
                    'type': 'and',
                    'conditions': [can_reach_rule, simplified_rule]
                }

        return simplified_rule

    def _extract_region_names_from_lambda(self, rule_func) -> List[str]:
        """
        Extract region names from bound methods in a lambda function's closure.

        This is used to preserve region names before analysis, since the analyzer
        may lose this information when expanding bound methods to conditionals.
        """
        region_names = []

        # Check if the lambda has free variables that are closures
        if not hasattr(rule_func, '__code__'):
            return region_names

        # Get the closure values
        closure = rule_func.__closure__
        if not closure:
            return region_names

        def extract_from_item(item):
            """Check if an item is a bound method with a Region object and extract its name."""
            if hasattr(item, '__self__') and hasattr(item.__self__, 'name'):
                # Verify it's a Region by checking for 'entrances' attribute
                if hasattr(item.__self__, 'entrances'):
                    return item.__self__.name
            return None

        def extract_from_list(lst, depth=0):
            """Recursively extract region names from lists."""
            if depth > 3:  # Prevent infinite recursion
                return
            for item in lst:
                if isinstance(item, (list, tuple)):
                    # Nested list - recurse
                    extract_from_list(item, depth + 1)
                else:
                    # Check if it's a bound method
                    region_name = extract_from_item(item)
                    if region_name:
                        region_names.append(region_name)

        for cell in closure:
            try:
                value = cell.cell_contents
                if isinstance(value, (list, tuple)):
                    extract_from_list(value)
            except ValueError:
                # Empty cell
                pass

        return region_names

    def handle_complex_exit_rule(self, exit_name: str, rule_func) -> Optional[Dict[str, Any]]:
        """
        Handle complex exit rules by analyzing them and then post-processing.
        This allows us to simplify region reachability patterns in exit access rules.
        """
        from ..analyzer import analyze_rule

        # Extract region names from the lambda before analysis
        # This preserves the region information that might be lost during analysis
        region_names = self._extract_region_names_from_lambda(rule_func)

        # Store region names for use during post-processing
        self._exit_region_names = list(region_names)  # Make a copy

        # Analyze the rule
        analysis_result = analyze_rule(rule_func=rule_func, game_handler=self)

        # Post-process to simplify region reachability patterns
        result = None
        if analysis_result and analysis_result.get('type') != 'error':
            result = self._simplify_region_reachability_pattern(analysis_result)
        else:
            result = analysis_result

        # Clear the region names after processing
        self._exit_region_names = []

        return result
