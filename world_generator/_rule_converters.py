"""
Rule converter mixin — individual rule type converter methods.
"""

import copy
import logging
import sys
from typing import Any, Dict, List, Set, Tuple, Optional

from rule_builder import BOOLEAN_RULE_TYPES

from ._codegen_utils import (
    is_placement_lookup,
    extract_placement_location,
    check_placement_comparison,
    extract_items_from_list,
    escape_string,
    extract_constant,
    get_helper_function_name,
    generate_world_attribute_expr,
)

logger = logging.getLogger(__name__)


class RuleConverterMixin:
    """Mixin providing individual rule type converter methods."""

    # These attributes are expected to be defined on the main class.
    settings: Dict[str, Any]
    option_definitions: Dict[str, Any]
    required_imports: Set[str]
    known_helpers: Set[str]
    helper_bodies: Dict[str, Dict[str, Any]]
    helper_params: Dict[str, List[str]]
    helper_defaults: Dict[str, Dict[str, Any]]
    game_name: str
    game_name_lower: str
    obtainable_items: Optional[Set[str]]
    placements: Dict[str, str]
    entrance_regions: Dict[str, str]
    entrance_connections: Dict[str, str]
    _current_location: Optional[str]
    _current_entrance: Optional[str]

    def _convert_item_check(self, rule: Dict[str, Any]) -> str:
        """Convert item_check to Has()."""
        self.required_imports.add('Has')

        item_raw = rule.get('item', '')
        # Use _extract_constant to handle binary_op (e.g., "Letter " + letter -> "Letter O")
        item = self._extract_constant(item_raw, '')
        count_raw = rule.get('count', 1)
        count = self._extract_constant(count_raw, 1)

        item_escaped = self._escape_string(item)

        if count == 1:
            return f'Has("{item_escaped}")'
        else:
            return f'Has("{item_escaped}", {count})'

    def _convert_item_check_any(self, rule: Dict[str, Any]) -> str:
        """Convert item_check_any to HasAny().

        item_check_any represents "has any of these items" checks.
        Used by game-specific exporters like Soul Blazer.
        """
        items_raw = rule.get('items', [])
        items = [self._extract_constant_value(item, str(item)) for item in items_raw]

        if not items:
            self.required_imports.add('False_')
            return 'False_()'

        if len(items) == 1:
            self.required_imports.add('Has')
            item_escaped = self._escape_string(items[0])
            return f'Has("{item_escaped}")'

        self.required_imports.add('HasAny')
        items_str = ', '.join(repr(item) for item in items)
        return f'HasAny({items_str})'

    def _convert_item_check_all(self, rule: Dict[str, Any]) -> str:
        """Convert item_check_all to HasAll().

        item_check_all represents "has all of these items" checks.
        Used by game-specific exporters like Soul Blazer.
        """
        items_raw = rule.get('items', [])
        items = [self._extract_constant_value(item, str(item)) for item in items_raw]

        if not items:
            self.required_imports.add('True_')
            return 'True_()'

        if len(items) == 1:
            self.required_imports.add('Has')
            item_escaped = self._escape_string(items[0])
            return f'Has("{item_escaped}")'

        self.required_imports.add('HasAll')
        items_str = ', '.join(repr(item) for item in items)
        return f'HasAll({items_str})'

    def _convert_count_check(self, rule: Dict[str, Any]) -> str:
        """Convert count_check to Has().

        count_check is similar to item_check but typically has a count > 1.
        Common in dungeon key checks like 'has 5 small keys'.
        """
        self.required_imports.add('Has')

        item_raw = rule.get('item', '')
        item = self._extract_constant_value(item_raw, '')
        count_raw = rule.get('count', 1)
        count = self._extract_constant_value(count_raw, 1)

        item_escaped = self._escape_string(item)

        if count == 1:
            return f'Has("{item_escaped}")'
        else:
            return f'Has("{item_escaped}", {count})'

    def _convert_group_check(self, rule: Dict[str, Any]) -> str:
        """Convert group_check to HasGroup()."""
        self.required_imports.add('HasGroup')

        group_raw = rule.get('group', '')
        group = self._extract_constant_value(group_raw, '')
        count_raw = rule.get('count', 1)
        count = self._extract_constant_value(count_raw, 1)

        group_escaped = self._escape_string(group)

        if count == 1:
            return f'HasGroup("{group_escaped}")'
        else:
            return f'HasGroup("{group_escaped}", {count})'

    def _convert_ast_group_count(self, rule: Dict[str, Any]) -> str:
        """Convert AST_group_count to CountGroup().

        This handles state.count_group() calls from access rules, converting
        them to CountGroup rules that return the count of items in a group.
        Used in arithmetic expressions like score calculations.
        """
        self.required_imports.add('CountGroup')

        # Handle both AST format and Rule Builder format
        args = rule.get('args', {})
        group = args.get('group', '') if args else rule.get('group', '')
        group = self._extract_constant_value(group, '')

        group_escaped = self._escape_string(group)
        return f'CountGroup("{group_escaped}")'

    def _convert_and(self, rule: Dict[str, Any]) -> str:
        """Convert and rule to & expression."""
        conditions = rule.get('conditions', [])

        if not conditions:
            self.required_imports.add('True_')
            return 'True_()'

        if len(conditions) == 1:
            return self._convert_rule(conditions[0])

        # Convert each condition and join with &
        converted = [self._convert_rule(c) for c in conditions]

        # Wrap each in parens for safety, then join
        return ' & '.join(f'({c})' for c in converted)

    def _convert_or(self, rule: Dict[str, Any]) -> str:
        """Convert or rule to | expression."""
        conditions = rule.get('conditions', [])

        if not conditions:
            self.required_imports.add('False_')
            return 'False_()'

        if len(conditions) == 1:
            return self._convert_rule(conditions[0])

        # Convert each condition and join with |
        converted = [self._convert_rule(c) for c in conditions]

        # Wrap each in parens for safety, then join
        return ' | '.join(f'({c})' for c in converted)

    def _convert_count_true(self, rule: Dict[str, Any]) -> str:
        """Convert count_true rule (AST format with 'type' key).

        count_true checks if at least 'count' of the 'conditions' evaluate to true.
        Structure: {"type": "count_true", "count": N, "conditions": [...]}
        """
        count = rule.get('count', 0)
        conditions = rule.get('conditions', [])
        return self._convert_count_true_logic(count, conditions)

    def _convert_count_true_from_args(self, args: Dict[str, Any]) -> str:
        """Convert AST_count_true rule (Rule Builder format with 'rule' key).

        AST_count_true is exported from AST format by the converter.
        Structure: {"rule": "AST_count_true", "args": {"count": N, "conditions": [...]}}
        """
        count = args.get('count', 0)
        conditions = args.get('conditions', [])
        return self._convert_count_true_logic(count, conditions)

    def _convert_count_true_logic(self, count: int, conditions: List[Dict[str, Any]]) -> str:
        """Core logic for converting count_true rules.

        Converts "at least count of conditions must be true" to Rule Builder code.

        Optimizations:
        - count == 0: Always true (True_())
        - count == 1: Any condition must be true (Or of all conditions)
        - count == len(conditions): All must be true (And of all conditions)
        - count > len(conditions): Never possible (False_())
        - General case: Generate combinations using Or/And

        For the general case with many conditions, we generate Python code that
        counts conditions. If all conditions are simple item_checks, we use a
        more efficient list comprehension.
        """
        n = len(conditions)

        # Edge cases
        if count <= 0:
            self.required_imports.add('True_')
            return 'True_()'

        if n == 0 or count > n:
            self.required_imports.add('False_')
            return 'False_()'

        # count == 1: Any one condition is enough (Or)
        if count == 1:
            if n == 1:
                return self._convert_rule(conditions[0])
            converted = [self._convert_rule(c) for c in conditions]
            return ' | '.join(f'({c})' for c in converted)

        # count == n: All conditions must be true (And)
        if count == n:
            if n == 1:
                return self._convert_rule(conditions[0])
            converted = [self._convert_rule(c) for c in conditions]
            return ' & '.join(f'({c})' for c in converted)

        # General case: count > 1 and count < n
        # Check if all conditions are simple item_checks - if so, use HasFromList
        all_item_checks = all(
            isinstance(c, dict) and c.get('type') == 'item_check'
            for c in conditions
        )

        if all_item_checks:
            # Extract item names
            # Use HasFromListUnique because count_true with item_checks means
            # "at least N different items from this list", not "at least N total items"
            items = [c.get('item', '') for c in conditions]
            items_str = ', '.join(repr(item) for item in items)
            self.required_imports.add('HasFromListUnique')
            return f'HasFromListUnique({items_str}, count={count})'

        # For mixed conditions, we need to generate combinations
        # "At least count of n conditions" = Or of all ways to choose count conditions
        # Each way is an And of those count conditions
        #
        # Calculate the number of combinations: C(n, count)
        from math import comb
        from itertools import combinations

        num_combos = comb(n, count)

        # Reasonable limit to avoid code explosion
        # 120 covers common cases like 5-of-6 (6 combos), 4-of-6 (15), 5-of-7 (21), 6-of-8 (28)
        if num_combos <= 120:
            combos = list(combinations(range(n), count))
            combo_exprs = []
            for combo in combos:
                combo_conditions = [conditions[i] for i in combo]
                converted = [self._convert_rule(c) for c in combo_conditions]
                and_expr = ' & '.join(f'({c})' for c in converted)
                combo_exprs.append(f'({and_expr})')
            return ' | '.join(combo_exprs)

        # Fallback for truly complex cases: generate True_() with a warning
        # This is conservative - locations will be accessible earlier than they should be
        import logging
        logging.getLogger(__name__).warning(
            f"count_true rule with count={count} of {n} conditions ({num_combos} combinations) "
            f"is too complex to expand, falling back to True_() - tracking may be inaccurate"
        )
        self.required_imports.add('True_')
        return 'True_()'

    def _convert_can_reach_region(self, rule: Dict[str, Any]) -> str:
        """Convert can_reach to CanReachRegion()."""
        self.required_imports.add('CanReachRegion')

        region_raw = rule.get('region', '')
        region = self._extract_constant_value(region_raw, '')
        region_escaped = self._escape_string(region)

        return f'CanReachRegion("{region_escaped}")'

    def _convert_location_check(self, rule: Dict[str, Any]) -> str:
        """Convert location_check to CanReachLocation()."""
        self.required_imports.add('CanReachLocation')

        location_raw = rule.get('location', '')
        location = self._extract_constant_value(location_raw, '')
        location_escaped = self._escape_string(location)

        return f'CanReachLocation("{location_escaped}")'

    def _convert_location_rule_ref(self, rule: Dict[str, Any]) -> str:
        """Convert location_rule_ref to CanReachLocation().

        location_rule_ref checks if a location's access rule is satisfied,
        which is equivalent to CanReachLocation (checking if the location is accessible).
        """
        self.required_imports.add('CanReachLocation')

        location_raw = rule.get('location', '')
        location = self._extract_constant_value(location_raw, '')
        location_escaped = self._escape_string(location)

        return f'CanReachLocation("{location_escaped}")'

    def _convert_can_reach_entrance(self, rule: Dict[str, Any]) -> str:
        """Convert can_reach_entrance to CanReachEntrance()."""
        self.required_imports.add('CanReachEntrance')

        entrance_raw = rule.get('entrance', '')
        entrance = self._extract_constant_value(entrance_raw, '')
        entrance_escaped = self._escape_string(entrance)

        return f'CanReachEntrance("{entrance_escaped}")'

    def _convert_state_method(self, rule: Dict[str, Any]) -> str:
        """Convert state_method calls to appropriate Rule Builder classes."""
        method = rule.get('method', '')
        args = rule.get('args', [])

        # Handle can_reach state method - check second arg for type (Region, Location, or Entrance)
        if method in ('can_reach', 'can_reach_region'):
            if args and isinstance(args[0], dict):
                target = self._extract_constant_value(args[0], '')
                # Check if second argument specifies "Location" or "Entrance" type
                reach_type = self._extract_constant_value(args[1], 'Region') if len(args) > 1 else 'Region'
                if target:
                    target_escaped = self._escape_string(target)
                    if reach_type == 'Location':
                        self.required_imports.add('CanReachLocation')
                        return f'CanReachLocation("{target_escaped}")'
                    elif reach_type == 'Entrance':
                        self.required_imports.add('CanReachEntrance')
                        return f'CanReachEntrance("{target_escaped}")'
                    else:
                        self.required_imports.add('CanReachRegion')
                        return f'CanReachRegion("{target_escaped}")'
            return 'True_()'

        # Handle can_reach_location state method
        if method == 'can_reach_location':
            if args and isinstance(args[0], dict):
                location = self._extract_constant_value(args[0], '')
                if location:
                    self.required_imports.add('CanReachLocation')
                    location_escaped = self._escape_string(location)
                    return f'CanReachLocation("{location_escaped}")'
            return 'True_()'

        # Handle basic has state method
        if method == 'has':
            if args:
                item = self._extract_constant_value(args[0], '') if args else ''
                count = self._extract_constant_value(args[1], 1) if len(args) > 1 else 1
                if item:
                    self.required_imports.add('Has')
                    item_escaped = self._escape_string(item)
                    if count == 1:
                        return f'Has("{item_escaped}")'
                    return f'Has("{item_escaped}", {count})'
            return 'True_()'

        method_map = {
            'has_all': ('HasAll', self._extract_item_list),
            'has_any': ('HasAny', self._extract_item_list),
            'has_all_counts': ('HasAllCounts', self._extract_item_dict),
            'has_from_list': ('HasFromList', self._extract_item_list_with_count),
            'has_from_list_unique': ('HasFromListUnique', self._extract_item_list_with_count),
            'has_group_unique': ('HasGroupUnique', self._extract_group_with_count),
        }

        if method in method_map:
            class_name, extractor = method_map[method]
            self.required_imports.add(class_name)
            return extractor(class_name, args)

        # Handle count_from_list - returns a count, used in arithmetic expressions
        # count_from_list([]) returns 0, count_from_list([items]) returns CountFromList(*items)
        if method == 'count_from_list':
            items = self._extract_items_from_args(args)
            if not items:
                # Empty list means count is always 0
                return '0'
            # For non-empty lists, use CountFromList which returns the count
            self.required_imports.add('CountFromList')
            items_str = ', '.join(f"'{self._escape_string(str(item), chr(39))}'" for item in items)
            return f'CountFromList({items_str})'

        # Unknown state method - return True_() as placeholder
        return 'True_()'

    def _extract_items_from_args(self, args: List[Any]) -> List[str]:
        """Extract item list from state method arguments.

        Handles various formats:
        - {"type": "constant", "value": ["item1", "item2"]}
        - {"rule": "Constant", "args": {"value": ["item1", "item2"]}}
        - [{"type": "constant", "value": "item1"}, ...]

        Returns an empty list if items cannot be extracted.
        """
        if not args:
            return []

        first_arg = args[0]
        if not isinstance(first_arg, dict):
            return []

        # Handle AST format constant: {"type": "constant", "value": [...]}
        if first_arg.get('type') == 'constant':
            value = first_arg.get('value', [])
            if isinstance(value, list):
                return [str(item) for item in value]

        # Handle Rule Builder format: {"rule": "Constant", "args": {"value": [...]}}
        if first_arg.get('rule') == 'Constant':
            value = first_arg.get('args', {}).get('value', [])
            if isinstance(value, list):
                return [str(item) for item in value]

        return []

    def _extract_item_list(self, class_name: str, args: List[Dict[str, Any]]) -> str:
        """Extract item list for HasAll/HasAny.

        Note: HasAll/HasAny expect unpacked arguments (*item_names), not a list.
        Empty HasAny should return True_ (vacuously satisfied - any of nothing).
        Empty HasAll should return True_ (trivially satisfied - all of nothing).
        """
        if not args:
            # Empty item checks are trivially satisfied
            self.required_imports.add('True_')
            return 'True_()'

        first_arg = args[0]

        # Handle 'set' or 'tuple' type with 'elements' array (AST format)
        # Example: {"type": "set", "elements": [{"type": "constant", "value": "Item1"}, ...]}
        # Example: {"type": "tuple", "elements": [{"type": "constant", "value": "Item1"}, ...]}
        if first_arg.get('type') in ('set', 'tuple'):
            elements = first_arg.get('elements', [])
            items = []
            for elem in elements:
                if elem.get('type') == 'constant':
                    items.append(elem.get('value'))
            if not items:
                # Empty item checks are trivially satisfied
                self.required_imports.add('True_')
                return 'True_()'
            # Unpack the items as separate arguments
            items_repr = ', '.join(repr(item) for item in items)
            return f'{class_name}({items_repr})'

        # Handle 'constant' type with the list directly
        if first_arg.get('type') == 'constant':
            items = first_arg.get('value', [])
            if not items:
                # Empty item checks are trivially satisfied
                self.required_imports.add('True_')
                return 'True_()'
            # Unpack the items as separate arguments
            items_repr = ', '.join(repr(item) for item in items)
            return f'{class_name}({items_repr})'

        # Handle 'subscript' type (e.g., item_groups["Axes"])
        # This extracts the value using _extract_constant which handles
        # subscript with binary_op index (like item_groups["Axe" + "s"])
        if first_arg.get('type') == 'subscript':
            items = self._extract_constant(first_arg, [])
            if isinstance(items, list) and items:
                items_repr = ', '.join(repr(item) for item in items)
                return f'{class_name}({items_repr})'
            # If extraction failed or returned empty, fall through to True_()

        # Handle generator expressions like [m.name for m in match]
        # where match is a constant list of objects with a 'name' attribute
        if first_arg.get('type') == 'generator_expression':
            items = self._evaluate_generator_expression(first_arg)
            if items is not None and items:
                items_repr = ', '.join(repr(item) for item in items)
                return f'{class_name}({items_repr})'
            # If evaluation failed or returned empty, fall through to True_()

        # Unknown format - return True_ as safe fallback
        self.required_imports.add('True_')
        return 'True_()'

    def _evaluate_generator_expression(self, gen_expr: Dict[str, Any]) -> Optional[List[str]]:
        """
        Evaluate a generator expression with a constant iterator.

        Handles patterns like [m.name for m in match] where match is a constant
        list of objects with a 'name' attribute. This is common in has_any/has_all
        calls with pre-resolved item lists (e.g., Vehicle rules in Shadow The Hedgehog).

        Args:
            gen_expr: A generator_expression dict with 'element' and 'comprehension' keys

        Returns:
            A list of extracted string values if evaluation succeeds, None otherwise.
        """
        element = gen_expr.get('element', {})
        comprehension = gen_expr.get('comprehension', {})

        # Check if this is a simple attribute access pattern: m.name for m in items
        if element.get('type') != 'attribute':
            return None

        attr_name = element.get('attr')
        target_obj = element.get('object', {})

        # The target should be a name reference (e.g., 'm')
        if target_obj.get('type') != 'name':
            return None

        target_name = target_obj.get('name')

        # Check comprehension structure
        comp_details = comprehension
        if comp_details.get('type') != 'comprehension_details':
            return None

        # Check that the comprehension target matches the attribute object
        comp_target = comp_details.get('target', {})
        if comp_target.get('type') != 'name' or comp_target.get('name') != target_name:
            return None

        # Get the iterator value
        iterator = comp_details.get('iterator', {})
        if iterator.get('type') != 'constant':
            return None

        iterator_value = iterator.get('value', [])
        if not isinstance(iterator_value, list):
            return None

        # Evaluate the element expression for each item in the iterator
        result = []
        for item in iterator_value:
            # Get the attribute from the item
            if hasattr(item, attr_name):
                value = getattr(item, attr_name)
                result.append(str(value))
            elif isinstance(item, dict) and attr_name in item:
                result.append(str(item[attr_name]))
            else:
                # Can't evaluate this expression
                return None

        return result

    def _extract_item_dict(self, class_name: str, args: List[Dict[str, Any]]) -> str:
        """Extract item dict for HasAllCounts."""
        if not args:
            return f'{class_name}({{}})'

        first_arg = args[0]
        if first_arg.get('type') == 'constant':
            items = first_arg.get('value', {})
            items_repr = repr(items)
            return f'{class_name}({items_repr})'

        return f'{class_name}({{}})'

    def _extract_item_list_with_count(self, class_name: str, args: List[Dict[str, Any]]) -> str:
        """Extract item list and count for HasFromList.

        HasFromList expects (*item_names: str, count: int = 1), so we need
        to expand items as positional args and use count= keyword arg.
        """
        items = []
        count = 1

        if len(args) >= 1 and args[0].get('type') == 'constant':
            items = args[0].get('value', [])
        if len(args) >= 2 and args[1].get('type') == 'constant':
            count = args[1].get('value', 1)

        # Expand items as positional args, use count= as keyword arg
        items_str = ', '.join(repr(item) for item in items)
        return f'{class_name}({items_str}, count={count})'

    def _extract_group_with_count(self, class_name: str, args: List[Dict[str, Any]]) -> str:
        """Extract group and count for HasGroupUnique."""
        group = ''
        count = 1

        if len(args) >= 1 and args[0].get('type') == 'constant':
            group = args[0].get('value', '')
        if len(args) >= 2 and args[1].get('type') == 'constant':
            count = args[1].get('value', 1)

        return f'{class_name}("{group}", {count})'

    def _convert_compare(self, rule: Dict[str, Any]) -> str:
        """
        Convert compare rule to Has() if it matches the prog_items pattern,
        otherwise to Compare().

        Pattern: state.prog_items[player][item_name] OP count
        Converts to: Has(item_name, count)
        """
        left = rule.get('left', {})
        op = rule.get('op', '')
        right = rule.get('right', {})

        # Try to recognize the pattern: state.prog_items[player][item_name] >= count
        result = self._try_convert_prog_items_compare(left, op, right)
        if result is not None:
            return result

        # Try to recognize count_from_list_unique pattern:
        # state.count_from_list_unique(items, player) >= count
        # Converts to: HasFromListUnique(*items, count=count)
        result = self._try_convert_count_from_list_unique_compare(left, op, right)
        if result is not None:
            return result

        # Try to recognize count_from_list pattern:
        # state.count_from_list(items, player) >= count
        # Also handles: state.count_from_list(items, player) + 0 >= count
        # Converts to: HasFromList(*items, count=count)
        result = self._try_convert_count_from_list_compare(left, op, right)
        if result is not None:
            return result

        # Try to recognize AST_sum_of pattern (sum comprehension counting items):
        # sum(state.has(item, player) for item in items) >= count
        # Converts to: HasFromListUnique(*items, count=count)
        result = self._try_convert_ast_sum_of_compare(left, op, right)
        if result is not None:
            return result

        # Check if this is a comparison between list constants (resolved placement lookups)
        # JavaScript can't compare arrays by value, so we must statically evaluate these
        left_list_val = self._get_list_constant_value(left)
        right_list_val = self._get_list_constant_value(right)

        if left_list_val is not None and right_list_val is not None:
            # Both sides are list constants - statically evaluate
            if op in ('==', 'eq'):
                static_result = left_list_val == right_list_val
            elif op in ('!=', 'ne'):
                static_result = left_list_val != right_list_val
            else:
                # Unsupported comparison for lists - fall through to Compare
                static_result = None

            if static_result is not None:
                if static_result:
                    self.required_imports.add('True_')
                    return 'True_()'
                else:
                    self.required_imports.add('False_')
                    return 'False_()'

        # Check if either side is a placement_lookup
        # Placement lookups (location_item_name checks) depend on actual item placements.
        # We now check the actual placements to determine the correct result.
        # This correctly handles self-locking rules: if the key IS placed in the locked region,
        # the placement check should return True, making the region accessible without the key.
        if self._is_placement_lookup(left) or self._is_placement_lookup(right):
            # Try to resolve the comparison using actual placements
            placement_result = self._check_placement_comparison(left, right, op)
            if placement_result is True:
                self.required_imports.add('True_')
                return 'True_()'
            elif placement_result is False:
                self.required_imports.add('False_')
                return 'False_()'
            # If placement_result is None, fall back to False for safety
            if op in ('==', 'eq'):
                self.required_imports.add('False_')
                return 'False_()'
            elif op in ('!=', 'ne'):
                self.required_imports.add('True_')
                return 'True_()'

        # Use Compare class for all other patterns
        # binary_op operands are now handled by _convert_compare_operand -> _convert_binary_op
        self.required_imports.add('Compare')
        left_code = self._convert_compare_operand(left)
        right_code = self._convert_compare_operand(right)

        # For 'in' and 'not in' operators, check if operands are valid
        # If either operand is True_() or False_() (unresolvable), the comparison is invalid
        # (e.g., "enemy_health in ['easy', 'default']" can't be evaluated without game options)
        # Default to True_() for 'in' (assume option check passes) and False_() for 'not in'
        if op in ('in', 'not in'):
            if left_code in ('True_()', 'False_()') or right_code in ('True_()', 'False_()'):
                # Can't perform membership test with boolean values
                # Return sensible default based on operator
                if op == 'in':
                    self.required_imports.add('True_')
                    return 'True_()'
                else:  # 'not in'
                    self.required_imports.add('False_')
                    return 'False_()'

            # Detect type mismatch: numeric option value vs string list.
            # The exporter resolves Choice option values to integers (e.g., enemy_health=1
            # for "default"), but the comparison targets are string key names
            # (e.g., ["easy", "default"]). Since int will never match strings at runtime,
            # resolve statically: look up the option's string key for the integer value
            # using the game's option class definitions, then evaluate the comparison.
            static_result = self._try_resolve_option_in_comparison(left, right, op)
            if static_result is not None:
                if static_result:
                    self.required_imports.add('True_')
                    return 'True_()'
                else:
                    self.required_imports.add('False_')
                    return 'False_()'

        return f'Compare({left_code}, "{op}", {right_code})'

    @staticmethod
    def _try_resolve_option_in_comparison(left: Any, right: Any, op: str) -> Optional[bool]:
        """Try to statically resolve an int-vs-string-list 'in'/'not in' comparison.

        The exporter resolves Choice option values to integers (e.g., enemy_health=0
        for "easy"), but comparison targets remain as string key names (["easy",
        "default"]).  Since ``0 in ["easy", "default"]`` is always False at runtime
        (int != str), we resolve statically by looking up the option's string key for
        the integer value via the Choice class ``name_lookup`` table.

        Returns True/False if resolvable, None otherwise.
        """
        # Only applies when left is an integer and right is a list of strings
        if not isinstance(left, (int, float)) or isinstance(left, bool):
            return None
        if not isinstance(right, list) or not right or not all(isinstance(s, str) for s in right):
            return None

        # The string targets are option key names (e.g., "easy", "default").
        # Try to find the matching Choice class by checking which Archipelago
        # option class has these exact key names.
        try:
            from Options import Choice
            import worlds  # noqa: F811
            # Search all loaded option classes for one that has all the target keys
            for option_cls in Choice.__subclasses__():
                # Check if all target strings are valid option keys for this class
                options_dict = getattr(option_cls, 'options', {})
                if all(key in options_dict for key in right):
                    # Found the matching option class - look up the key for our value
                    name_lookup = getattr(option_cls, 'name_lookup', {})
                    int_value = int(left)
                    if int_value in name_lookup:
                        key_name = name_lookup[int_value]
                        result = key_name in right
                        if op == 'not in':
                            result = not result
                        return result
        except Exception:
            pass

        return None

    def _is_placement_lookup(self, operand: Any) -> bool:
        """Check if an operand is a placement_lookup rule."""
        return is_placement_lookup(operand)

    def _extract_placement_location(self, operand: Any) -> Optional[str]:
        """Extract the location name from a placement_lookup expression."""
        return extract_placement_location(operand)

    def _check_placement_comparison(self, left: Any, right: Any, op: str) -> Optional[bool]:
        """Check if a placement comparison can be resolved using actual placements."""
        placements = self.placements if hasattr(self, 'placements') else {}
        return check_placement_comparison(left, right, op, placements)

    def _extract_items_from_list(self, operand: Any) -> Optional[set]:
        """Extract item names from a list of tuples for 'in' operator comparisons."""
        return extract_items_from_list(operand)

    def _get_list_constant_value(self, operand: Any) -> Optional[tuple]:
        """
        Extract a tuple/list constant value from an operand for static comparison.
        Returns a tuple if the operand can be resolved, None otherwise.

        Placement lookups return (item_name, player) tuples to match Tuple rules.
        """
        if not isinstance(operand, dict):
            return None

        op_type = operand.get('type', '')

        if op_type == 'list':
            # Extract values from list type
            value_list = operand.get('value', [])
            result = []
            for item in value_list:
                if isinstance(item, dict) and item.get('type') == 'constant':
                    result.append(item.get('value'))
                else:
                    # Non-constant item in list - can't statically evaluate
                    return None
            return tuple(result)

        if op_type == 'tuple':
            # Extract values from tuple type
            elements = operand.get('elements', [])
            result = []
            for item in elements:
                if isinstance(item, dict) and item.get('type') == 'constant':
                    result.append(item.get('value'))
                else:
                    # Non-constant item in tuple - can't statically evaluate
                    return None
            return tuple(result)

        if op_type == 'placement_lookup':
            # Don't resolve placement_lookup statically - we want runtime lookup
            # via location_item_name() calls
            return None

        # Handle Rule Builder format
        rb_rule = operand.get('rule', '')

        if rb_rule == 'AST_placement_lookup':
            # Don't resolve placement_lookup statically - we want runtime lookup
            # via location_item_name() calls
            return None

        # Handle Rule Builder format Tuple (e.g., {"rule": "Tuple", "args": {"value": [...]}})
        if rb_rule == 'Tuple':
            args = operand.get('args', {})
            value_list = args.get('value', args.get('elements', []))
            result = []
            for item in value_list:
                if isinstance(item, dict):
                    # Check for Rule Builder format Constant
                    if item.get('rule') == 'Constant':
                        result.append(item.get('args', {}).get('value'))
                    elif item.get('type') == 'constant':
                        result.append(item.get('value'))
                    else:
                        # Non-constant item in tuple - can't statically evaluate
                        return None
                else:
                    result.append(item)
            return tuple(result)

        # Handle Rule Builder format List (e.g., {"rule": "List", "args": {"value": [...]}})
        if rb_rule == 'List':
            args = operand.get('args', {})
            value_list = args.get('value', [])
            result = []
            for item in value_list:
                if isinstance(item, dict):
                    # Check for Rule Builder format Constant
                    if item.get('rule') == 'Constant':
                        result.append(item.get('args', {}).get('value'))
                    elif item.get('type') == 'constant':
                        result.append(item.get('value'))
                    else:
                        # Non-constant item in list - can't statically evaluate
                        return None
                else:
                    result.append(item)
            return tuple(result)

        return None

    def _convert_sum(self, rule: Dict[str, Any]) -> str:
        """Convert a sum rule to an Arithmetic addition chain.

        A sum rule adds up boolean checks (treated as 0 or 1) for items.
        Example: sum of [has(Valor Form), has(Wisdom Form), ...]
        becomes: Arithmetic(Arithmetic(..., "+", Has("Valor Form")), "+", Has("Wisdom Form"))
        """
        # Get the iterable to sum over
        iterable = rule.get('iterable', {})

        # If it's a list, convert each element and chain with Arithmetic
        if iterable.get('type') == 'list':
            items = iterable.get('value', [])
            if not items:
                return '0'  # Empty sum is 0

            # Convert each item in the list
            item_exprs = [self._convert_rule(item) for item in items]

            if len(item_exprs) == 1:
                # Single item - wrap in conditional to convert bool to int
                self.required_imports.add('Conditional')
                return f'Conditional(test={item_exprs[0]}, if_true=1, if_false=0)'

            # Multiple items - chain with Arithmetic additions
            # Each Has() evaluates to True/False which Python treats as 1/0 in arithmetic
            self.required_imports.add('Arithmetic')
            result = item_exprs[0]
            for expr in item_exprs[1:]:
                result = f'Arithmetic({result}, "+", {expr})'
            return result

        # For other iterable types, try to convert
        return self._convert_rule(iterable)

    def _convert_setting_value(self, rule: Dict[str, Any]) -> str:
        """Convert a setting_value reference to its resolved value.

        Settings are resolved at generation time since worldgen worlds
        don't have access to the original game options at runtime.
        """
        setting = rule.get('setting', '')

        # Look up the setting value in our resolved settings
        if setting in self.settings:
            value = self.settings[setting]
            # Handle boolean values
            if isinstance(value, bool):
                self.required_imports.add('True_' if value else 'False_')
                return 'True_()' if value else 'False_()'
            # Handle string 'true'/'false' which are boolean-like
            elif isinstance(value, str):
                if value.lower() == 'true':
                    self.required_imports.add('True_')
                    return 'True_()'
                elif value.lower() == 'false':
                    self.required_imports.add('False_')
                    return 'False_()'
                # For other strings (like 'normal', 'light_and_darkness'), return as string literal
                return repr(value)
            # Handle integer values - return as-is for use in count/arithmetic contexts
            # In cases where they're used in boolean contexts (like Not()), the caller
            # is responsible for appropriate handling via Compare(value, ">", 0)
            elif isinstance(value, int):
                return repr(value)
            else:
                return repr(value)

        # Setting not found - return False as safe default
        self.required_imports.add('False_')
        return 'False_()'

    def _expr_world_attribute(self, expr: Dict[str, Any]) -> str:
        """Generate code to access a world attribute at runtime."""
        return generate_world_attribute_expr(expr)

    def _expr_option_value(self, expr: Dict[str, Any]) -> str:
        """Generate code to access an option at runtime.

        For Rule Builder context, we generate OptionValue('option_name') which is a
        proper Rule Builder object that can be composed with And/Or operators.
        This allows options to be checked at rule evaluation time.
        """
        option = expr.get('option', '')

        # Handle indexed access (not common for options, use raw Python for this case)
        if 'index' in expr:
            index = expr['index']
            base_path = f'state.multiworld.worlds[player].options.{option}'
            if isinstance(index, int):
                return f'{base_path}[{index}]'
            elif isinstance(index, str):
                return f'{base_path}[{repr(index)}]'

        # Generate OptionValue for proper Rule Builder composition
        self.required_imports.add('OptionValue')
        return f"OptionValue({repr(option)})"

    def _convert_not(self, rule: Dict[str, Any]) -> str:
        """Convert not rule to Not()."""
        self.required_imports.add('Not')

        # Handle both 'condition' and 'operand' keys
        inner = rule.get('condition', rule.get('operand', rule.get('value', {})))
        inner_code = self._convert_rule(inner)

        return f'Not({inner_code})'

    def _convert_helper(self, rule: Dict[str, Any]) -> str:
        """Convert helper rule to HelperCall()."""
        helper_name = rule.get('name', '')
        args = rule.get('args', [])
        kwargs = rule.get('kwargs', {})

        # If we know about this helper, generate a proper HelperCall
        if helper_name in self.known_helpers:
            self.required_imports.add('HelperCall')
            func_name = self.get_function_name(helper_name)

            # Pre-process args to resolve Name references that can be inferred from adjacent dict args
            # This handles patterns like: helper(keys, data, ...) where keys=data.keys()
            # Common in apworlds like Shadow The Hedgehog's CountRegionAccessibility helper
            processed_args = self._infer_keys_from_dict_args(args)

            # Extract compound rule args (And/Or) that can't be represented as simple values.
            # These get converted to wrapping conditions ANDed with the HelperCall.
            processed_args, wrapping_conditions = self._extract_compound_args(processed_args)

            # Convert arguments to Python code
            arg_strs = []
            for arg in processed_args:
                arg_strs.append(self._convert_helper_arg(arg))

            # Convert keyword arguments to Python code
            kwarg_strs = []
            for kw_name, kw_value in kwargs.items():
                kw_value_str = self._convert_helper_arg(kw_value)
                # Skip None values that represent filtered args
                if kw_value_str != 'None' or not isinstance(kw_value, dict):
                    kwarg_strs.append(f'"{kw_name}": {kw_value_str}')

            # Filter out None values from arg_strs (which represent skipped args like 'world')
            arg_strs = [a for a in arg_strs if a is not None]

            # Build HelperCall with helper_func reference
            # Try to convert the helper body to a Rule Builder expression for Tier 1 support
            # This enables full state-aware explain for simple helpers
            body_rule_code = self._try_convert_helper_body_to_rule(helper_name, args)

            parts = [f'helper_func={func_name}', f'helper_name="{helper_name}"']

            if arg_strs:
                parts.append(f'args=({", ".join(arg_strs)},)')

            if kwarg_strs:
                # Pass kwargs as a dict to HelperCall
                parts.append(f'kwargs={{{", ".join(kwarg_strs)}}}')

            if body_rule_code:
                # Tier 1: Include body_rule for full explain support
                parts.append(f'body_rule={body_rule_code}')

            helper_call = f'HelperCall({", ".join(parts)})'

            # If compound args were extracted, wrap with And()
            if wrapping_conditions:
                self.required_imports.add('And')
                all_parts = [f'({helper_call})'] + [f'({c})' for c in wrapping_conditions]
                return ' & '.join(all_parts)

            return helper_call

        # Unknown helper - return True_() as placeholder
        # Returning True makes locations more accessible, which is appropriate for worldgen
        # since unknown helpers are typically progression checks that evaluate to true
        # under default/normal game settings
        self.required_imports.add('True_')
        return 'True_()'

    def _infer_keys_from_dict_args(self, args: List[Any]) -> List[Any]:
        """Infer 'keys' parameter values from adjacent dict arguments.

        Some apworlds use patterns like:
            lambda state, keys=some_dict.keys(), data=some_dict: helper(state, keys, data, ...)

        When the analyzer exports this, it captures 'keys' as a Name reference instead of
        evaluating some_dict.keys(). This method detects such patterns and replaces the
        Name reference with the actual keys from the adjacent dict constant.

        Pattern detected:
            - arg[i] is a Name reference with name 'keys'
            - arg[i+1] is a dict constant (the 'data' parameter)
            => Replace arg[i] with a constant containing data.keys()

        Handles both AST format and Rule Builder format:
            AST format: {"type": "name", "name": "keys"}
            Rule Builder format: {"rule": "Name", "args": {"name": "keys"}}

        Args:
            args: List of arguments to the helper function

        Returns:
            Processed list of arguments with inferred keys
        """
        if len(args) < 2:
            return args

        def get_name_value(arg: Any) -> Optional[str]:
            """Extract name from either AST or Rule Builder format Name node."""
            if not isinstance(arg, dict):
                return None
            # AST format: {"type": "name", "name": "keys"}
            if arg.get('type') == 'name':
                return arg.get('name')
            # Rule Builder format: {"rule": "Name", "args": {"name": "keys"}}
            if arg.get('rule') == 'Name':
                return arg.get('args', {}).get('name')
            return None

        def get_dict_value(arg: Any) -> Optional[dict]:
            """Extract dict value from either AST or Rule Builder format Constant node."""
            if not isinstance(arg, dict):
                return None
            # AST format: {"type": "constant", "value": {...}}
            if arg.get('type') == 'constant':
                val = arg.get('value')
                if isinstance(val, dict):
                    return val
            # Rule Builder format: {"rule": "Constant", "args": {"value": {...}}}
            if arg.get('rule') == 'Constant':
                val = arg.get('args', {}).get('value')
                if isinstance(val, dict):
                    return val
            return None

        result = []
        i = 0
        while i < len(args):
            arg = args[i]
            name_value = get_name_value(arg)

            # Check if this is a Name reference to 'keys' followed by a dict constant
            if name_value == 'keys' and i + 1 < len(args):
                dict_value = get_dict_value(args[i + 1])
                if dict_value is not None:
                    # Replace the Name reference with the dict keys
                    result.append({'type': 'constant', 'value': list(dict_value.keys())})
                else:
                    # Keep original if we couldn't extract dict keys
                    result.append(arg)
            else:
                result.append(arg)
            i += 1

        return result

    def _extract_compound_args(self, args: List[Any]) -> Tuple[List[Any], List[str]]:
        """Extract compound rule args (And/Or) from helper argument lists.

        When a helper argument is itself a compound rule (And/Or containing
        nested helper calls), it cannot be represented as a simple argument value.
        Instead, we extract it as a wrapping condition that gets ANDed with the
        HelperCall, and replace the arg with True_.

        Args:
            args: List of helper arguments (may contain dicts with rule info)

        Returns:
            Tuple of (modified_args, wrapping_conditions) where:
            - modified_args has compound rules replaced with {'rule': 'True_'}
            - wrapping_conditions is a list of converted code strings
        """
        modified = list(args)
        wrapping_conditions = []

        for i, arg in enumerate(modified):
            if isinstance(arg, dict) and arg.get('rule') in ('And', 'Or'):
                # Convert the compound rule via the normal rule converter
                condition_code = self._convert_rule(arg)
                wrapping_conditions.append(condition_code)
                # Replace with True_ so _convert_helper_arg emits 'True'
                modified[i] = {'rule': 'True_'}

        return modified, wrapping_conditions

    def _convert_helper_arg(self, arg: Any) -> str:
        """Convert a single helper argument to Python code string.

        This is the unified method for converting helper arguments from both
        AST format and Rule Builder format. It handles all argument types
        including constants, settings, options, world attributes, nested helpers,
        and special references.

        Args:
            arg: The argument value (can be a dict with type info or a raw value)

        Returns:
            Python code string representation of the argument, or None if it should be skipped
        """
        if not isinstance(arg, dict):
            return repr(arg)

        # Get rule type (Rule Builder format) and ast type (AST format)
        rule_type = arg.get('rule', '')
        ast_type = arg.get('type', '')

        # ===== Constants =====
        if ast_type == 'constant':
            return repr(arg.get('value'))
        if rule_type == 'Constant':
            return repr(arg.get('args', {}).get('value'))

        # ===== Boolean Constants =====
        if rule_type == 'True_':
            return 'True'
        if rule_type == 'False_':
            return 'False'

        # ===== Setting/Option/WorldAttribute Values =====
        # AST format
        if ast_type == 'setting_value':
            setting = arg.get('setting', '')
            if setting in self.settings:
                return repr(self.settings[setting])
            return 'None'
        if ast_type == 'option_value':
            option = arg.get('option', '')
            if option in self.settings:
                return repr(self.settings[option])
            return 'None'
        if ast_type == 'world_attribute':
            attribute = arg.get('attribute', '')
            if attribute in self.world_attributes:
                return repr(self.world_attributes[attribute])
            return 'None'

        # Rule Builder format
        if rule_type == 'SettingValue':
            setting = arg.get('args', {}).get('setting', '')
            if setting in self.settings:
                return repr(self.settings[setting])
            return 'None'
        if rule_type == 'AST_setting_value':
            setting = arg.get('args', {}).get('setting', '')
            if setting in self.settings:
                return repr(self.settings[setting])
            return 'None'
        if rule_type == 'OptionValue':
            option = arg.get('args', {}).get('option', '')
            if option in self.settings:
                return repr(self.settings[option])
            return 'None'
        if rule_type == 'WorldAttribute':
            attribute = arg.get('args', {}).get('attribute', '')
            if attribute in self.world_attributes:
                return repr(self.world_attributes[attribute])
            return 'None'

        # ===== Arithmetic Expressions =====
        if rule_type == 'Arithmetic':
            arith_result = self._evaluate_arithmetic_constant(arg)
            return arith_result if arith_result else 'None'
        if ast_type == 'binary_op':
            binop_result = self._evaluate_binary_op_constant(arg)
            return binop_result if binop_result else 'None'

        # ===== Compare Expressions =====
        if rule_type == 'Compare' or ast_type == 'compare':
            compare_result = self._evaluate_compare_rule(arg)
            return compare_result if compare_result is not None else 'None'

        # ===== Name References =====
        if ast_type == 'name':
            name = arg.get('name', '')
            if name in ('self', 'world'):
                return None  # Signal to skip this argument
            return 'None'
        if rule_type == 'Name':
            name = arg.get('args', {}).get('name', '')
            if name == 'location' and self._current_location:
                escaped = self._current_location.replace('\\', '\\\\').replace('"', '\\"')
                return f'multiworld.get_location("{escaped}", player)'
            if name == 'entrance' and self._current_entrance:
                escaped = self._current_entrance.replace('\\', '\\\\').replace('"', '\\"')
                return f'multiworld.get_entrance("{escaped}", player)'
            if name in ('self', 'world'):
                return None  # Signal to skip this argument
            return 'None'

        # ===== Attribute Access =====
        if ast_type == 'attribute':
            obj = arg.get('object', {})
            if obj.get('type') == 'setting_value' and arg.get('attr') == 'value':
                setting = obj.get('setting', '')
                if setting in self.settings:
                    return repr(self.settings[setting])
                return 'None'
            return 'None'
        if rule_type == 'Attribute':
            obj_info = arg.get('args', {}).get('object', {})
            attr_name = arg.get('args', {}).get('attr', '')
            if obj_info.get('rule') == 'Name' and attr_name == 'parent_region':
                entrance_var = obj_info.get('args', {}).get('name', '')
                entrance_key = entrance_var.lower().replace(' ', '')
                if entrance_key in self.entrance_regions:
                    region_name = self.entrance_regions[entrance_key]
                    return repr(region_name)
                return 'None'
            return 'None'

        # ===== Nested Helper Calls =====
        if arg.get('_original_ast_type', '').endswith('helper') or rule_type in self.known_helpers:
            nested_helper = rule_type
            if nested_helper in self.known_helpers:
                helper_body = self.helper_bodies.get(nested_helper, {})
                if isinstance(helper_body, dict) and helper_body.get('type') == 'constant':
                    const_val = helper_body.get('value')
                    return repr(const_val)
                else:
                    # Complex helper - evaluate to True as approximation
                    return 'True'
            else:
                # Unknown nested helper - assume True
                return 'True'

        # ===== Compound Rules (And/Or) =====
        # Safety net: if a compound rule reaches here (not pre-extracted),
        # return True rather than None to avoid breaking the helper call
        if rule_type in ('And', 'Or'):
            return 'True'

        # ===== Fallback =====
        return 'None'

    def _convert_weighted_sum(self, rule: Dict[str, Any]) -> str:
        """Convert weighted_sum helper to WeightedSum rule.

        weighted_sum checks if the sum of (item_count * weight) for a list of items
        meets or exceeds a threshold. Used by Overcooked 2 for star-based progression.

        Format expected:
        {
            "rule": "weighted_sum",
            "_original_ast_type": "helper",
            "args": [
                {"rule": "Constant", "args": {"value": 1.0}},  # threshold
                {"rule": "Constant", "args": {"value": [["Item1", 0.4], ["Item2", 0.3], ...]}}  # items
            ]
        }
        """
        args = rule.get('args', [])

        # Extract threshold (first arg)
        threshold = 1.0
        if len(args) >= 1:
            arg0 = args[0]
            if isinstance(arg0, dict):
                if arg0.get('rule') == 'Constant':
                    threshold = arg0.get('args', {}).get('value', 1.0)
                elif arg0.get('type') == 'constant':
                    threshold = arg0.get('value', 1.0)

        # Extract items with weights (second arg)
        items = []
        if len(args) >= 2:
            arg1 = args[1]
            if isinstance(arg1, dict):
                if arg1.get('rule') == 'Constant':
                    raw_items = arg1.get('args', {}).get('value', [])
                elif arg1.get('type') == 'constant':
                    raw_items = arg1.get('value', [])
                else:
                    raw_items = []

                # Convert raw items to list of tuples
                if isinstance(raw_items, list):
                    for item in raw_items:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            items.append((item[0], item[1]))

        # Generate WeightedSum rule
        self.required_imports.add('WeightedSum')

        # Build the items list as Python code
        items_str = ', '.join(f'({repr(name)}, {weight})' for name, weight in items)

        return f'WeightedSum(threshold={threshold}, items=[{items_str}])'

    def _convert_unique_count(self, rule: Dict[str, Any]) -> str:
        """Convert unique_count helper to UniqueCount rule.

        unique_count checks if the count of unique items (item present >= 1) from a list
        meets or exceeds a threshold. Unlike weighted_sum which counts total items,
        this only counts whether each item type is present (1 if count > 0, else 0).

        Used by A Hat in Time for Enemy/Boss counting where the game tracks unique types
        collected, not total items.

        Format expected:
        {
            "rule": "unique_count",
            "_original_ast_type": "helper",
            "args": [
                {"rule": "Constant", "args": {"value": 12.0}},  # threshold
                {"rule": "Constant", "args": {"value": [["Enemy1", 1.0], ["Enemy2", 1.0], ...]}}  # items
            ]
        }
        """
        args = rule.get('args', [])

        # Extract threshold (first arg)
        threshold = 1.0
        if len(args) >= 1:
            arg0 = args[0]
            if isinstance(arg0, dict):
                if arg0.get('rule') == 'Constant':
                    threshold = arg0.get('args', {}).get('value', 1.0)
                elif arg0.get('type') == 'constant':
                    threshold = arg0.get('value', 1.0)

        # Extract items with weights (second arg)
        items = []
        if len(args) >= 2:
            arg1 = args[1]
            if isinstance(arg1, dict):
                if arg1.get('rule') == 'Constant':
                    raw_items = arg1.get('args', {}).get('value', [])
                elif arg1.get('type') == 'constant':
                    raw_items = arg1.get('value', [])
                else:
                    raw_items = []

                # Convert raw items to list of tuples
                if isinstance(raw_items, list):
                    for item in raw_items:
                        if isinstance(item, (list, tuple)) and len(item) >= 2:
                            items.append((item[0], item[1]))

        # Generate UniqueCount rule
        self.required_imports.add('UniqueCount')

        # Build the items list as Python code
        items_str = ', '.join(f'({repr(name)}, {weight})' for name, weight in items)

        return f'UniqueCount(threshold={threshold}, items=[{items_str}])'

    def _convert_rule_builder_helper(self, rule: Dict[str, Any], helper_name: str) -> str:
        """Convert Rule Builder format helper rule to HelperCall().

        This handles helpers that come from the exporter in Rule Builder format
        with a 'rule' key containing the helper name (e.g., {'rule': 'ultra', 'args': [], ...})
        instead of AST format with 'type': 'helper'.
        """
        args = rule.get('args', [])
        kwargs = rule.get('kwargs', {})

        # Pre-process args to resolve Name references that can be inferred from adjacent dict args
        # This handles patterns like: helper(keys, data, ...) where keys=data.keys()
        # Common in apworlds like Shadow The Hedgehog's CountRegionAccessibility helper
        args = self._infer_keys_from_dict_args(args)

        # Extract compound rule args (And/Or) that can't be represented as simple values.
        # These get converted to wrapping conditions ANDed with the HelperCall.
        args, wrapping_conditions = self._extract_compound_args(args)

        # If we know about this helper, generate a proper HelperCall
        if helper_name in self.known_helpers:
            self.required_imports.add('HelperCall')
            func_name = self.get_function_name(helper_name)

            # Convert arguments to Python code using the shared method
            arg_strs = []
            for arg in args:
                arg_str = self._convert_helper_arg(arg)
                if arg_str is not None:  # None means skip this argument
                    arg_strs.append(arg_str)

            # Convert keyword arguments using the same shared method
            kwarg_strs = []
            for kw_name, kw_value in kwargs.items():
                kw_value_str = self._convert_helper_arg(kw_value)
                if kw_value_str is not None:
                    kwarg_strs.append(f'"{kw_name}": {kw_value_str}')

            # Build HelperCall with helper_func reference
            # Try to convert the helper body to a Rule Builder expression for Tier 1 support
            body_rule_code = self._try_convert_helper_body_to_rule(helper_name, args)

            parts = [f'helper_func={func_name}', f'helper_name="{helper_name}"']

            if arg_strs:
                parts.append(f'args=({", ".join(arg_strs)},)')

            if kwarg_strs:
                # Pass kwargs as a dict to HelperCall
                parts.append(f'kwargs={{{", ".join(kwarg_strs)}}}')

            if body_rule_code:
                # Tier 1: Include body_rule for full explain support
                parts.append(f'body_rule={body_rule_code}')

            helper_call = f'HelperCall({", ".join(parts)})'

            # If compound args were extracted, wrap with And()
            if wrapping_conditions:
                self.required_imports.add('And')
                all_parts = [f'({helper_call})'] + [f'({c})' for c in wrapping_conditions]
                return ' & '.join(all_parts)

            return helper_call

        # Handle Python built-in functions that can be evaluated at generation time
        if helper_name == 'int':
            # Evaluate the int() call - typically used for int(x / y) floor division patterns
            args = rule.get('args', [])
            if args and len(args) == 1:
                arg = args[0]
                if isinstance(arg, dict):
                    # Try to evaluate arithmetic expression
                    if arg.get('rule') == 'Arithmetic':
                        arith_result = self._evaluate_arithmetic_constant(arg)
                        if arith_result and arith_result != 'None':
                            try:
                                # Apply int() to the arithmetic result
                                int_result = int(eval(arith_result))
                                return repr(int_result)
                            except (ValueError, TypeError, SyntaxError):
                                pass
                    # Handle nested int() or other patterns by extracting constant
                    elif arg.get('rule') == 'Constant':
                        value = arg.get('args', {}).get('value')
                        if isinstance(value, (int, float)):
                            return repr(int(value))
                elif isinstance(arg, (int, float)):
                    return repr(int(arg))
            # If we can't evaluate, return 0 as a conservative default
            # This is better than True_() which would make rules always pass
            return repr(0)

        if helper_name == 'len':
            # len() on collections - try to evaluate if we have a constant list/dict
            args = rule.get('args', [])
            if args and len(args) == 1:
                arg = args[0]
                if isinstance(arg, (list, tuple)):
                    return repr(len(arg))
                elif isinstance(arg, dict) and arg.get('rule') == 'Constant':
                    value = arg.get('args', {}).get('value')
                    if isinstance(value, (list, tuple, dict, str)):
                        return repr(len(value))
            # Can't evaluate - return 0 as conservative default
            return repr(0)

        # Unknown helper - return True_() as placeholder
        # Returning True makes locations more accessible, which is appropriate for worldgen
        # since unknown helpers are typically progression checks that evaluate to true
        # under default/normal game settings
        # (This matches the behavior of _convert_helper for consistency)
        print(
            f"LOSSY FALLBACK: Unknown helper '{helper_name}' in _convert_rule_builder_helper, "
            f"using True_() (always accessible) as fallback",
            file=sys.stderr
        )
        self.required_imports.add('True_')
        return 'True_()'

    def _convert_placement_lookup(self, rule: Dict[str, Any]) -> str:
        """Convert placement_lookup to a location_item_name() call.

        Placement lookups check what item is at a specific location.
        We generate a call to location_item_name(state, location, player) which
        preserves the original pattern and allows proper re-export.
        """
        location_rule = rule.get('location', {})

        # Get the location name expression
        if isinstance(location_rule, dict) and location_rule.get('type') == 'constant':
            location_name = location_rule.get('value', '')
            # Generate call to location_item_name for runtime lookup
            return f'location_item_name(state, {repr(location_name)}, player)'

        # For non-constant locations, generate the expression
        return 'None'

    def _convert_ast_function_call(self, rule: Dict[str, Any]) -> str:
        """Convert AST_function_call to resolved constant or nested rule.

        This handles function calls like options.open_pyramid.to_bool()
        by extracting the option name and resolving it from settings.

        It also handles cases where the function is itself a Rule Builder rule
        (like And, Or, Has) - these are produced by bunny rule analysis in
        ALttP where path_to_access_rule returns nested rule expressions.
        """
        from ._codegen_utils import ANALYZER_RUNTIME_TYPES

        args = rule.get('args', {})
        function = args.get('function', {})

        # Check if function is a state_method or item_check type (has 'type' key)
        # These produce complete boolean expressions and should be converted directly
        # to Rule Builder format without wrapping in an additional function call.
        # This happens when the analyzer wraps state.has_all(), state.has_any(), etc.
        # in AST_function_call.
        if isinstance(function, dict) and function.get('type') in ANALYZER_RUNTIME_TYPES - {'helper'}:
            return self._convert_rule(function)

        # Check if function is a Rule Builder rule (has 'rule' key with known rule types)
        # This happens when bunny rules are analyzed and the inner rule is a valid
        # Rule Builder expression (e.g., And(CanReachEntrance(...), Has(...)))
        if isinstance(function, dict) and function.get('rule'):
            func_rule = function.get('rule')
            # Check for Rule Builder types that produce complete boolean expressions,
            # plus 'helper' which is a special AST marker for helper references
            if func_rule in BOOLEAN_RULE_TYPES or func_rule == 'helper':
                # Special case: And(CanReachEntrance(...), ...) from bunny rules
                # The bunny rules code creates rules like:
                #   can_reach(entrance) AND entrance.access_rule(state)
                # But CanReachEntrance already checks the entrance's access_rule
                # at runtime (see BaseClasses.Entrance.can_reach), so conditions
                # that are part of the entrance's access rule are redundant.
                #
                # HOWEVER, bunny rules also add additional conditions like Mirror
                # that are NOT part of the entrance's access rule and MUST be preserved.
                # Example: path_to_access_rule(new_path, entrance)(state) and state.has('Magic Mirror', player)
                #
                # We preserve item checks (Has, HasAll, HasAny, etc.) because they
                # are definitely not entrance access rules. We only drop conditions
                # that look like they came from entrance.access_rule (like Or/And with
                # option checks, or CanReachRegion that would be redundant).
                if func_rule == 'And':
                    children = function.get('children', [])
                    can_reach_entrance = None
                    non_entrance_conditions = []
                    for child in children:
                        if isinstance(child, dict):
                            child_rule = child.get('rule', '')
                            # Check if this is the CanReachEntrance condition
                            if child_rule == 'CanReachEntrance':
                                can_reach_entrance = child
                            # Preserve item checks - these are definitely additional requirements
                            elif child_rule in ('Has', 'HasAll', 'HasAny', 'HasGroup',
                                               'HasFromList', 'HasFromListUnique'):
                                non_entrance_conditions.append(child)
                            # Preserve helper calls - these might be important game-specific checks
                            elif child_rule in ('HelperCall', 'helper'):
                                non_entrance_conditions.append(child)
                            # Other conditions (Or, And, OptionValue, etc.) might be from
                            # entrance access rules, so we skip them as potentially redundant
                    if can_reach_entrance:
                        if non_entrance_conditions:
                            # Preserve CanReachEntrance AND the non-entrance conditions
                            preserved = [can_reach_entrance] + non_entrance_conditions
                            if len(preserved) == 1:
                                return self._convert_rule(preserved[0])
                            return self._convert_rule({'rule': 'And', 'children': preserved})
                        else:
                            # No additional conditions to preserve, just use CanReachEntrance
                            return self._convert_rule(can_reach_entrance)
                # Recursively convert the nested Rule Builder rule
                return self._convert_rule(function)

        # Try to extract the option name from the function expression
        # Structure: world.worlds[1].options.<option_name>.to_bool()
        option_name = self._extract_option_name_from_function(function)

        if option_name:
            # Check if we have this setting
            if option_name in self.settings:
                value = self.settings[option_name]
                # Convert to boolean
                if isinstance(value, bool):
                    return self._make_bool_constant(value)
                elif isinstance(value, (int, float)):
                    return self._make_bool_constant(bool(value))
                elif isinstance(value, str):
                    # Common string values that mean "enabled"
                    return self._make_bool_constant(value.lower() in ('true', 'on', 'yes', '1'))
                else:
                    return self._make_bool_constant(False)

        # Unknown function call - default to True (accessible)
        # This is for things like boss.can_defeat() which should be True
        # if you can reach the location (progression will handle item requirements)
        return self._make_bool_constant(True)

    def _extract_option_name_from_function(self, function: Dict[str, Any]) -> Optional[str]:
        """Extract option name from a function call structure.

        Handles patterns like:
        - world.worlds[1].options.<option_name>.to_bool()
        - self.options.<option_name>.to_bool()
        - options.<option_name>
        """
        if not isinstance(function, dict):
            return None

        func_type = function.get('type', '')

        # Handle attribute access: obj.attr
        if func_type == 'attribute':
            obj = function.get('object', {})
            attr = function.get('attr', '')

            # If attr is 'to_bool', look at the object for the option name
            if attr == 'to_bool':
                return self._extract_option_name_from_function(obj)

            # If the object is 'options' or ends with '.options', the attr is the option name
            obj_name = self._get_attribute_chain_name(obj)
            if obj_name and (obj_name == 'options' or obj_name.endswith('.options')):
                return attr

            # Otherwise, keep traversing
            return attr

        return None

    def _get_attribute_chain_name(self, expr: Dict[str, Any]) -> Optional[str]:
        """Get the full attribute chain name from an expression."""
        if not isinstance(expr, dict):
            return None

        expr_type = expr.get('type', '')

        if expr_type == 'name':
            return expr.get('name', '')

        if expr_type == 'attribute':
            obj_name = self._get_attribute_chain_name(expr.get('object', {}))
            attr = expr.get('attr', '')
            if obj_name:
                return f"{obj_name}.{attr}"
            return attr

        if expr_type == 'subscript':
            # Skip subscripts like [1] - just return the value part
            return self._get_attribute_chain_name(expr.get('value', {}))

        return None

    def _convert_conditional(self, rule: Dict[str, Any]) -> str:
        """Convert conditional rule to Conditional()."""
        self.required_imports.add('Conditional')

        test = rule.get('test', {})
        if_true = rule.get('if_true', {})
        if_false = rule.get('if_false')

        # Handle None or missing if_false - default to True (always pass)
        if if_false is None:
            if_false = {'type': 'constant', 'value': True}

        # Check if if_false is just True (option-filtered rules)
        if_false_is_true = (
            isinstance(if_false, dict) and
            if_false.get('type') == 'constant' and
            if_false.get('value') is True
        )

        if if_false_is_true:
            # Option-filtered rule - just return the if_true branch
            return self._convert_rule(if_true)

        # Try to evaluate the test to a constant if we have settings
        test_result = self._try_evaluate_conditional_test(test)
        if test_result is True:
            return self._convert_rule(if_true)
        elif test_result is False:
            return self._convert_rule(if_false)

        # Check if test is an OptionValue - generate OptionValue rule for runtime evaluation
        test_rb_rule = test.get('rule', '') if isinstance(test, dict) else ''
        test_type = test.get('type', '') if isinstance(test, dict) else ''
        if test_rb_rule == 'OptionValue' or test_type == 'option_value':
            # Get the option name and generate OptionValue rule
            test_args = test.get('args', {}) if isinstance(test, dict) else {}
            option_name = test_args.get('option', '') or test.get('option', '')
            self.required_imports.add('OptionValue')
            test_code = f"OptionValue('{option_name}')"
        else:
            test_code = self._convert_rule(test)
        if_true_code = self._convert_rule(if_true)
        if_false_code = self._convert_rule(if_false)

        return f'Conditional(test={test_code}, if_true={if_true_code}, if_false={if_false_code})'

    def _convert_dict_lambda_lookup(self, rule: Dict[str, Any]) -> str:
        """Convert dict_lambda_lookup rule to Python code.

        This handles patterns like: rule_map.get(key, default)(state)
        where rule_map contains lambda values that have been analyzed.

        When we can resolve the key expression (e.g., for vanilla entrance shuffle),
        we return just the matching case's rule. Otherwise, we fall back to OR'ing
        all cases together (permissive approach).

        Args:
            rule: Dict with 'cases' (analyzed rules for each key), 'key', 'default'

        Returns:
            Python Rule Builder expression
        """
        cases = rule.get('cases', {})
        default = rule.get('default', {'rule': 'False_'})
        key_expr = rule.get('key', {})

        if not cases:
            # No cases - just use the default
            return self._convert_rule(default)

        # Try to resolve the key expression if it's a world.get_entrance(X).connected_region.name pattern
        resolved_key = self._try_resolve_entrance_connected_region(key_expr)
        if resolved_key is not None:
            # We resolved the key - return just the matching case or default
            if resolved_key in cases:
                return self._convert_rule(cases[resolved_key])
            else:
                return self._convert_rule(default)

        # If there's only one case, we can simplify
        if len(cases) == 1:
            key_name, case_rule = list(cases.items())[0]
            # Return just the case rule - if the key matches, this is what would execute
            return self._convert_rule(case_rule)

        # Multiple cases - create an Or of all case rules
        # This is permissive but correct: at runtime only one key matches,
        # but we don't know which at export time, so we allow any matching rule
        self.required_imports.add('Or')

        case_rules = []
        for key_name, case_rule in cases.items():
            # Convert each case's rule
            case_code = self._convert_rule(case_rule)
            # Skip False_ rules - they don't contribute anything
            if case_code in ('False_()', 'False_'):
                continue
            case_rules.append(case_code)

        # Also include the default if it's not False_
        default_code = self._convert_rule(default)
        if default_code not in ('False_()', 'False_'):
            case_rules.append(default_code)

        if not case_rules:
            # All cases were False_ - return False_
            self.required_imports.add('False_')
            return 'False_()'

        if len(case_rules) == 1:
            # Only one non-False_ rule
            return case_rules[0]

        # Multiple rules - Or them together
        return f'Or({", ".join(case_rules)})'

    def _try_resolve_entrance_connected_region(self, key_expr: Dict[str, Any]) -> Optional[str]:
        """Try to resolve a key expression that accesses entrance.connected_region.name.

        Handles patterns like:
            world.get_entrance('Tower of Hera').connected_region.name

        If we have the entrance connections data (set via set_entrance_connections),
        we can resolve this to the actual connected region name.

        Args:
            key_expr: The key expression from dict_lambda_lookup

        Returns:
            The resolved region name, or None if we can't resolve it
        """
        if not self.entrance_connections:
            return None

        if not isinstance(key_expr, dict):
            return None

        # Pattern: {type: 'attribute', attr: 'name', object: {type: 'attribute', attr: 'connected_region', object: ...}}
        if key_expr.get('type') != 'attribute' or key_expr.get('attr') != 'name':
            return None

        inner = key_expr.get('object', {})
        if inner.get('type') != 'attribute' or inner.get('attr') != 'connected_region':
            return None

        # Now look for world.get_entrance('X') pattern
        func_call = inner.get('object', {})
        if func_call.get('type') != 'function_call':
            return None

        func = func_call.get('function', {})
        if func.get('type') != 'attribute' or func.get('attr') != 'get_entrance':
            return None

        # Get the entrance name from the first argument
        args = func_call.get('args', [])
        if not args:
            return None

        first_arg = args[0]
        entrance_name = None
        if isinstance(first_arg, dict):
            if first_arg.get('type') == 'constant':
                entrance_name = first_arg.get('value')
        elif isinstance(first_arg, str):
            entrance_name = first_arg

        if not entrance_name:
            return None

        # Look up the connected region
        return self.entrance_connections.get(entrance_name)

    def _try_evaluate_conditional_test(self, test: Dict[str, Any]) -> Optional[bool]:
        """Try to evaluate a conditional test to a constant boolean.

        Returns True, False, or None if the test can't be evaluated.
        """
        if not isinstance(test, dict):
            return None

        test_type = test.get('type', '')
        test_rb_rule = test.get('rule', '')

        # Handle option_value - look up in settings
        if test_type == 'option_value' or test_rb_rule == 'OptionValue':
            option_name = test.get('option', '') or test.get('args', {}).get('option', '')
            if option_name in self.settings:
                value = self.settings[option_name]
                return bool(value)
            return None

        # Handle not - negate inner result
        if test_type == 'not':
            inner = test.get('condition') or test.get('operand', {})
            inner_result = self._try_evaluate_conditional_test(inner)
            if inner_result is not None:
                return not inner_result
            return None

        # Handle constant
        if test_type == 'constant':
            return bool(test.get('value'))

        # Handle compare with option_value operands
        if test_type == 'compare':
            left = test.get('left', {})
            right = test.get('right', {})
            op = test.get('op', '')

            left_val = self._try_evaluate_conditional_operand(left)
            right_val = self._try_evaluate_conditional_operand(right)

            if left_val is not None and right_val is not None:
                try:
                    if op == '==':
                        return left_val == right_val
                    elif op == '!=':
                        return left_val != right_val
                    elif op == '<':
                        return left_val < right_val
                    elif op == '<=':
                        return left_val <= right_val
                    elif op == '>':
                        return left_val > right_val
                    elif op == '>=':
                        return left_val >= right_val
                except:
                    pass
            return None

        return None

    def _try_evaluate_conditional_test_expr(self, test: Dict[str, Any], var_expressions: Dict[str, str]) -> Optional[bool]:
        """Try to evaluate a conditional test expression to a constant boolean.

        This is similar to _try_evaluate_conditional_test but works in the context
        of _expr_to_rule_builder where we also have var_expressions.

        Returns True, False, or None if the test can't be evaluated.
        """
        if not isinstance(test, dict):
            return None

        test_type = test.get('type', '')

        # Handle option_value - look up in settings
        if test_type == 'option_value':
            option_name = test.get('option', '')
            if option_name in self.settings:
                value = self.settings[option_name]
                return bool(value)
            return None

        # Handle not - negate inner result
        if test_type == 'not':
            inner = test.get('condition') or test.get('operand', {})
            inner_result = self._try_evaluate_conditional_test_expr(inner, var_expressions)
            if inner_result is not None:
                return not inner_result
            return None

        # Handle constant
        if test_type == 'constant':
            value = test.get('value')
            return bool(value) if value is not None else None

        # Handle compare
        if test_type == 'compare':
            left = test.get('left', {})
            right = test.get('right', {})
            op = test.get('op', '')

            left_val = self._try_evaluate_conditional_operand(left)
            right_val = self._try_evaluate_conditional_operand(right)

            if left_val is not None and right_val is not None:
                try:
                    if op == '==':
                        return left_val == right_val
                    elif op == '!=':
                        return left_val != right_val
                    elif op == '<':
                        return left_val < right_val
                    elif op == '<=':
                        return left_val <= right_val
                    elif op == '>':
                        return left_val > right_val
                    elif op == '>=':
                        return left_val >= right_val
                except:
                    pass
            return None

        return None

    def _try_evaluate_conditional_operand(self, operand: Dict[str, Any]) -> Optional[Any]:
        """Try to evaluate a conditional operand to a constant value."""
        if not isinstance(operand, dict):
            return operand

        operand_type = operand.get('type', '')
        operand_rb_rule = operand.get('rule', '')

        if operand_type == 'constant':
            return operand.get('value')

        if operand_type == 'option_value' or operand_rb_rule == 'OptionValue':
            option_name = operand.get('option', '') or operand.get('args', {}).get('option', '')
            if option_name in self.settings:
                return self.settings[option_name]
            return None

        return None
