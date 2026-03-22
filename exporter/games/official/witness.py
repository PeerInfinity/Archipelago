"""The Witness game-specific export handler.

Handles unique patterns in The Witness's rule implementations:
1. Bound method references: region.can_reach passed directly in closures
2. Region reachability patterns: standard Archipelago region.can_reach AST pattern
3. Laser activation locations: event locations needing explicit region reachability
"""

from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class WitnessGameExportHandler(GenericGameExportHandler):
    """Export handler for The Witness."""

    # Enable upfront item adding for sphere test compatibility
    ADD_SPHERE_ITEMS_UPFRONT = True

    # Easter Egg accumulator: items like "+1 Easter Egg", "+6 Easter Eggs"
    # add their numeric value to the "Egg" counter used by Has("Egg", count=N) rules
    ACCUMULATOR_RULES = [{
        'pattern': r'^\+(\d+) Easter Eggs?$',
        'extract_value': True,
        'target': 'Egg',
        'discriminator': None,
    }]

    PROG_ITEMS_INIT = {'Egg': 0}

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
        'Keep Laser Activated': 'Keep Tower',  # Has two panels, both in Keep Tower
    }

    def set_context(self, location_name: Optional[str]):
        """Store the current location name for context-aware processing."""
        self._current_location_name = location_name

    # =========================================================================
    # Bound method detection and extraction
    # =========================================================================

    @staticmethod
    def _is_bound_method(v) -> bool:
        """Check if value is a bound method (object or string representation)."""
        if isinstance(v, str) and '<bound method' in v:
            return True
        return hasattr(v, '__self__') and hasattr(v, '__name__')

    @staticmethod
    def _extract_region_name(item) -> Optional[str]:
        """Extract region name from a bound method or its string representation."""
        # Actual bound method object
        if hasattr(item, '__self__') and hasattr(item.__self__, 'name'):
            if hasattr(item.__self__, 'entrances'):  # Verify it's a Region
                return item.__self__.name
        # String representation from serialization
        if isinstance(item, str) and '<bound method Region.can_reach of ' in item:
            try:
                return item.split(' of ')[1].rstrip('>')
            except (IndexError, AttributeError):
                pass
        return None

    # =========================================================================
    # Comprehension pattern handlers
    # =========================================================================

    def _handle_all_of_only_bound_methods(self, rule: Dict[str, Any]) -> bool:
        """Check if rule is all_of where ALL iterator values are bound methods."""
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
        return all(self._is_bound_method(v) for v in values)

    def _handle_any_of_nested_bound_methods(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle any_of with nested lists containing bound methods."""
        if rule.get('type') != 'any_of':
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
        if not all(isinstance(item, (list, tuple)) for item in values):
            return None

        # Extract region names from bound methods in each inner list
        outer_conditions = []
        for inner_list in values:
            inner_can_reach = []
            for item in inner_list:
                region_name = self._extract_region_name(item)
                if region_name:
                    inner_can_reach.append({'type': 'can_reach', 'region': region_name})
                # Skip lambda functions
            if inner_can_reach:
                if len(inner_can_reach) == 1:
                    outer_conditions.append(inner_can_reach[0])
                else:
                    outer_conditions.append({'type': 'and', 'conditions': inner_can_reach})

        if not outer_conditions:
            return None
        if len(outer_conditions) == 1:
            return outer_conditions[0]
        return {'type': 'or', 'conditions': outer_conditions}

    def _handle_all_of_mixed_conditions(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Handle all_of with both bound methods and other conditions."""
        from exporter.analyzer import analyze_rule

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

        bound_methods = [v for v in values if self._is_bound_method(v)]
        other_conditions = [v for v in values if not self._is_bound_method(v)]
        if not bound_methods or not other_conditions:
            return None

        analyzed = []
        # Convert bound methods to can_reach rules
        for bm in bound_methods:
            region_name = self._extract_region_name(bm)
            if not region_name:
                return None
            analyzed.append({'type': 'can_reach', 'region': region_name})

        # Analyze other conditions
        for cond in other_conditions:
            if callable(cond):
                result = analyze_rule(rule_func=cond, game_handler=self)
                if result and result.get('type') != 'error':
                    analyzed.append(result)
                else:
                    return None
            else:
                return None

        if not analyzed:
            return {'type': 'constant', 'value': True}
        if len(analyzed) == 1:
            return analyzed[0]
        return {'type': 'and', 'conditions': analyzed}

    # =========================================================================
    # Region reachability pattern handling
    # =========================================================================

    def _is_region_reachability_pattern(self, rule: Optional[Dict[str, Any]]) -> bool:
        """Check if rule matches the standard region.can_reach AST pattern."""
        if not rule or rule.get('type') != 'conditional':
            return False

        # Test: state.stale[player]
        test = rule.get('test', {})
        if test.get('type') != 'subscript':
            return False
        test_value = test.get('value', {})
        if (test_value.get('type') != 'attribute' or
            test_value.get('attr') != 'stale' or
            test_value.get('object', {}).get('name') != 'state'):
            return False

        # if_true: state.update_reachable_regions
        if_true = rule.get('if_true', {})
        if (if_true.get('type') != 'state_method' or
            if_true.get('method') != 'update_reachable_regions'):
            return False

        # if_false: self in state.reachable_regions[player]
        if_false = rule.get('if_false', {})
        if if_false.get('type') != 'compare' or if_false.get('op') != 'in':
            return False
        if if_false.get('left', {}).get('name') != 'self':
            return False
        right = if_false.get('right', {})
        if right.get('type') != 'subscript':
            return False
        right_value = right.get('value', {})
        if (right_value.get('type') != 'attribute' or
            right_value.get('attr') != 'reachable_regions'):
            return False

        return True

    def _simplify_region_reachability(self, rule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Recursively simplify region reachability patterns."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle the pattern itself
        if self._is_region_reachability_pattern(rule):
            if hasattr(self, '_exit_region_names') and self._exit_region_names:
                region_name = self._exit_region_names.pop(0)
                return {'type': 'can_reach', 'region': region_name}
            return {'type': 'constant', 'value': True}

        # Handle all_of with only bound methods
        if self._handle_all_of_only_bound_methods(rule):
            return {'type': 'constant', 'value': True}

        # Handle all_of with mixed conditions
        result = self._handle_all_of_mixed_conditions(rule)
        if result is not None:
            return result

        # Handle any_of with nested bound methods
        result = self._handle_any_of_nested_bound_methods(rule)
        if result is not None:
            return result

        # Recursively process compound rules
        rule_type = rule.get('type')

        if rule_type in ('and', 'or'):
            simplified = [self._simplify_region_reachability(c) for c in rule.get('conditions', [])]
            if rule_type == 'and':
                # Filter out True values
                simplified = [c for c in simplified
                              if c and (c.get('type') != 'constant' or c.get('value') is not True)]
                if not simplified:
                    return {'type': 'constant', 'value': True}
            else:  # or
                # Filter out False values
                simplified = [c for c in simplified
                              if c and (c.get('type') != 'constant' or c.get('value') is not False)]
                if any(c and c.get('type') == 'constant' and c.get('value') is True for c in simplified):
                    return {'type': 'constant', 'value': True}
                if not simplified:
                    return {'type': 'constant', 'value': False}
            if len(simplified) == 1:
                return simplified[0]
            return {**rule, 'conditions': simplified}

        if rule_type == 'not':
            simplified = self._simplify_region_reachability(rule.get('condition'))
            if simplified and simplified.get('type') == 'constant':
                return {'type': 'constant', 'value': not simplified.get('value')}
            return {**rule, 'condition': simplified}

        if rule_type in ('any_of', 'all_of'):
            element_rule = rule.get('element_rule')
            if element_rule:
                simplified = self._simplify_region_reachability(element_rule)
                if simplified != element_rule:
                    rule = {**rule, 'element_rule': simplified}

        return rule

    # =========================================================================
    # Public API
    # =========================================================================

    def postprocess_rule(self, rule: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Post-process rules to handle region reachability and laser activations."""
        simplified = self._simplify_region_reachability(rule)

        # Handle laser activation locations
        current_loc = getattr(self, '_current_location_name', None)
        if current_loc and current_loc in self.LASER_ACTIVATION_TO_REGION:
            region_name = self.LASER_ACTIVATION_TO_REGION[current_loc]
            can_reach = {'type': 'can_reach', 'region': region_name}

            if (self._is_region_reachability_pattern(simplified) or
                (simplified and simplified.get('type') == 'constant' and simplified.get('value') is True)):
                return can_reach
            if simplified and simplified.get('type') == 'can_reach':
                return simplified
            if simplified and simplified.get('type') != 'constant':
                return {'type': 'and', 'conditions': [can_reach, simplified]}

        return simplified

    def _extract_region_names_from_closure(self, rule_func) -> List[str]:
        """Extract region names from bound methods in a lambda's closure."""
        region_names = []
        if not hasattr(rule_func, '__closure__') or not rule_func.__closure__:
            return region_names

        def extract_from_list(lst, depth=0):
            if depth > 3:
                return
            for item in lst:
                if isinstance(item, (list, tuple)):
                    extract_from_list(item, depth + 1)
                else:
                    region_name = self._extract_region_name(item)
                    if region_name:
                        region_names.append(region_name)

        for cell in rule_func.__closure__:
            try:
                value = cell.cell_contents
                if isinstance(value, (list, tuple)):
                    extract_from_list(value)
            except ValueError:
                pass

        return region_names

    def handle_complex_exit_rule(self, exit_name: str, exit_rule) -> Optional[Dict[str, Any]]:  # noqa: ARG002
        """Handle complex exit rules with bound method patterns."""
        from exporter.analyzer import analyze_rule

        # Extract region names before analysis
        self._exit_region_names = self._extract_region_names_from_closure(exit_rule)

        # Analyze and post-process
        result = analyze_rule(rule_func=exit_rule, game_handler=self)
        if result and result.get('type') != 'error':
            result = self._simplify_region_reachability(result)

        self._exit_region_names = []
        return result
