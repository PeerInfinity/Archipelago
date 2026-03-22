"""
Converter from AST format to Rule Builder format (PR #5048).

AST Format (A):
    {
        "type": "item_check",
        "item": "Sword",
        "count": 1
    }

Rule Builder Format (B):
    {
        "rule": "Has",
        "options": [],
        "args": {"item_name": "Sword", "count": 1}
    }

This converter supports round-trip conversion, preserving metadata from
previous B → A conversions to enable lossless round-trips.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from rule_builder._ast_utils import (
    extract_constant_value,
    get_arg_from_list,
    extract_items_from_collection,
)

logger = logging.getLogger(__name__)


@dataclass
class ConversionResult:
    """Result of a rule conversion operation."""
    rule: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return len(self.errors) == 0


class ASTToRuleBuilder:
    """
    Converter from AST format to Rule Builder format.

    Handles conversion of:
    - Constants (true/false)
    - Item checks (item_check, count_check, group_check)
    - State methods (has_all, has_any, etc.)
    - Composite rules (and, or, not)
    - Reachability checks (can_reach, location_check, can_reach_entrance)
    - Conditionals (conditional → Filtered with options)
    - Helpers (preserved with metadata for round-trip)

    Round-trip support:
    - Detects `_converted_from_rule_builder` metadata
    - Uses `_original_args` to restore original Rule Builder format
    """

    # Mapping of AST types to converter methods
    TYPE_CONVERTERS = {}

    def __init__(self):
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self._init_converters()

    def _init_converters(self):
        """Initialize the type converter mapping."""
        self.TYPE_CONVERTERS = {
            # Constants
            'constant': self._convert_constant,

            # Item rules
            'item_check': self._convert_item_check,
            'count_check': self._convert_count_check,
            'group_check': self._convert_group_check,

            # State methods
            'state_method': self._convert_state_method,

            # Composite rules
            'and': self._convert_and,
            'or': self._convert_or,
            'not': self._convert_not,

            # Reachability
            'can_reach': self._convert_can_reach,
            'location_check': self._convert_location_check,
            'can_reach_entrance': self._convert_can_reach_entrance,

            # Conditionals (option filters)
            'conditional': self._convert_conditional,

            # Helpers (game-specific or custom)
            'helper': self._convert_helper,

            # Complex expressions (limited support)
            'compare': self._convert_compare,
            'binary_op': self._convert_binary_op,

            # Preserved types
            'attribute': self._convert_attribute,
            'name': self._convert_name,
            'list': self._convert_list,
            'tuple': self._convert_tuple,

            # Function calls
            'function_call': self._convert_function_call,

            # Placement types
            'placement_search': self._convert_placement_search,
            'placement_lookup': self._convert_placement_lookup,

            # Setting/option/attribute value types
            'setting_value': self._convert_setting_value,  # Legacy
            'option_value': self._convert_option_value,
            'world_attribute': self._convert_world_attribute,

            # Region references (from multiworld.get_region() calls)
            'region_reference': self._convert_region_reference,
        }

    def convert(self, rule: Dict[str, Any]) -> ConversionResult:
        """
        Convert an AST format rule to Rule Builder format.

        Args:
            rule: Rule in AST format

        Returns:
            ConversionResult with converted rule and any warnings/errors
        """
        self.warnings = []
        self.errors = []

        try:
            converted = self._convert_rule(rule)
            return ConversionResult(
                rule=converted,
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )
        except Exception as e:
            self.errors.append(f"Conversion failed: {str(e)}")
            return ConversionResult(
                rule=self._make_custom_rule('ConversionError', {'error': str(e), 'original': rule}),
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )

    def _convert_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Internal method to convert a single rule.

        Args:
            rule: Rule in AST format

        Returns:
            Rule in Rule Builder format
        """
        if not isinstance(rule, dict):
            # Handle primitive values as constants
            return self._make_rule('True_' if rule else 'False_', {}) if isinstance(rule, bool) else \
                   self._make_custom_rule('Constant', {'value': rule})

        # Check for round-trip metadata first
        if rule.get('_converted_from_rule_builder'):
            return self._restore_from_round_trip(rule)

        # Check if already in Rule Builder format
        # A rule is in Rule Builder format if it has 'rule' key but no 'type' key
        if 'rule' in rule and 'type' not in rule:
            return rule

        rule_type = rule.get('type')
        if not rule_type:
            self.warnings.append(f"Rule missing 'type' field: {rule}")
            return self._make_custom_rule('Unknown', {'original': rule})

        # Look up converter
        converter = self.TYPE_CONVERTERS.get(rule_type)
        if converter:
            return converter(rule)

        # Unknown type - preserve as custom rule
        return self._convert_unknown(rule)

    def _restore_from_round_trip(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Restore original Rule Builder format from round-trip metadata.

        This enables lossless B → A → B conversion.
        Empty 'options' and 'args' fields are omitted to reduce JSON size.
        """
        rule_name = rule.get('name', 'Unknown')
        original_args = rule.get('_original_args', {})

        # Reconstruct the original Rule Builder format
        # Empty options and args are omitted
        result: Dict[str, Any] = {'rule': rule_name}
        if original_args:
            result['args'] = original_args

        # Check if there were children (for composite rules)
        if 'args' in rule:
            for arg in rule['args']:
                if isinstance(arg, dict) and arg.get('type') == 'list':
                    # This might be children from a composite rule
                    children = arg.get('value', [])
                    if children and all(isinstance(c, dict) for c in children):
                        result['children'] = [self._convert_rule(c) for c in children]
                        if 'args' in result:
                            del result['args']
                        break

        return result

    def _make_rule(self, rule_name: str, args: Dict[str, Any], options: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Create a Rule Builder format rule.

        Empty 'options' and 'args' fields are omitted to reduce JSON size.
        HasAll/HasAny items are sorted for canonical, deterministic output.
        """
        result: Dict[str, Any] = {'rule': rule_name}
        if options:
            result['options'] = options
        # Include args if non-empty (handles both dict and list)
        if args:
            # Sort items in HasAll/HasAny for canonical, deterministic output
            if rule_name in ('HasAll', 'HasAny') and isinstance(args.get('items'), list):
                args = dict(args, items=sorted(args['items']))
            result['args'] = args
        return result

    def _make_composite_rule(self, rule_name: str, children: List[Dict], options: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Create a composite Rule Builder format rule (And/Or).

        Empty 'options' field is omitted to reduce JSON size.
        """
        result: Dict[str, Any] = {
            'rule': rule_name,
            'children': children
        }
        if options:
            result['options'] = options
        return result

    def _make_custom_rule(self, rule_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create a custom rule that preserves AST format data for round-trip."""
        result = self._make_rule(rule_name, args)
        result['_converted_from_ast'] = True
        return result

    def _evaluate_generator_expression(self, gen_expr: Dict[str, Any]) -> Optional[List[Any]]:
        """
        Evaluate a generator expression with a constant iterator.

        Handles patterns like [m.name for m in match] where match is a constant
        list of objects with a 'name' attribute. This is common in has_any/has_all
        calls with pre-resolved item lists.

        Args:
            gen_expr: A generator_expression dict with 'element' and 'comprehension' keys

        Returns:
            A list of extracted values if evaluation succeeds, None otherwise.
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
                result.append(value)
            elif isinstance(item, dict) and attr_name in item:
                result.append(item[attr_name])
            else:
                # Can't evaluate this expression
                return None

        return result

    def _extract_constant_value(self, value: Any) -> Tuple[Any, bool]:
        """
        Extract the value from a constant wrapper if present.

        Args:
            value: Either a primitive value or a dict with {type: "constant", value: X}

        Returns:
            Tuple of (extracted_value, was_constant)
            - If value is {type: "constant", value: X}, returns (X, True)
            - Otherwise returns (value, False)
        """
        if isinstance(value, dict) and value.get('type') == 'constant':
            return value.get('value'), True
        return value, False

    def _try_extract_constant(self, value: Any) -> Any:
        """
        Try to extract a constant value, returning the original if not a constant.

        Convenience wrapper around _extract_constant_value.
        """
        extracted, _ = self._extract_constant_value(value)
        return extracted

    # -------------------------------------------------------------------------
    # Constant Converters
    # -------------------------------------------------------------------------

    def _convert_constant(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert constant rule.

        AST: {"type": "constant", "value": true}
        RB: {"rule": "True_", "options": [], "args": {}}
        """
        value = rule.get('value')

        if value is True:
            return self._make_rule('True_', {})
        elif value is False:
            return self._make_rule('False_', {})
        else:
            # Non-boolean constant - preserve as custom rule
            return self._make_custom_rule('Constant', {'value': value})

    # -------------------------------------------------------------------------
    # Item Rule Converters
    # -------------------------------------------------------------------------

    def _convert_item_check(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert item_check rule.

        AST: {"type": "item_check", "item": "Sword", "count": 2}
        RB: {"rule": "Has", "options": [], "args": {"item_name": "Sword", "count": 2}}

        Also handles wrapped constants:
        AST: {"type": "item_check", "item": {"type": "constant", "value": "Sword"}}
        RB: {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        """
        item = rule.get('item', '')
        count = rule.get('count', 1)

        # Try to extract constant values
        item_value, item_was_constant = self._extract_constant_value(item)
        count_value, count_was_constant = self._extract_constant_value(count)

        # If item resolved to a simple value, use standard Has rule
        if isinstance(item_value, str):
            args: Dict[str, Any] = {'item_name': item_value}
            if isinstance(count_value, (int, float)) and count_value != 1:
                args['count'] = count_value
            elif isinstance(count, dict) and not count_was_constant:
                # Count is a complex expression - preserve it
                args['count'] = self._convert_rule(count)
            return self._make_rule('Has', args)

        # Complex item reference that couldn't be resolved - preserve as custom rule
        if isinstance(item, dict):
            return self._make_custom_rule('ItemCheck', {
                'item': self._convert_rule(item),
                'count': self._convert_rule(count) if isinstance(count, dict) else count,
                '_original_ast_type': 'item_check'
            })

        # Simple string item
        args = {'item_name': item}
        if count != 1:
            args['count'] = count

        return self._make_rule('Has', args)

    def _convert_count_check(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert count_check rule.

        AST: {"type": "count_check", "item": "Arrow", "count": 10}
        RB: {"rule": "Has", "options": [], "args": {"item_name": "Arrow", "count": 10}}

        Also handles wrapped constants:
        AST: {"type": "count_check", "item": {"type": "constant", "value": "Arrow"}, "count": {"type": "constant", "value": 10}}
        RB: {"rule": "Has", "options": [], "args": {"item_name": "Arrow", "count": 10}}
        """
        item = rule.get('item', '')
        count = rule.get('count', 1)

        # Try to extract constant values
        item_value, item_was_constant = self._extract_constant_value(item)
        count_value, count_was_constant = self._extract_constant_value(count)

        # If both resolved to simple values, use standard Has rule
        if isinstance(item_value, str) and isinstance(count_value, (int, float)):
            return self._make_rule('Has', {'item_name': item_value, 'count': count_value})

        # If item resolved but count is complex
        if isinstance(item_value, str):
            return self._make_rule('Has', {
                'item_name': item_value,
                'count': self._convert_rule(count) if isinstance(count, dict) else count
            })

        # Complex item/count that couldn't be fully resolved - preserve as custom rule
        if isinstance(item, dict) or isinstance(count, dict):
            return self._make_custom_rule('CountCheck', {
                'item': self._convert_rule(item) if isinstance(item, dict) else item,
                'count': self._convert_rule(count) if isinstance(count, dict) else count,
                '_original_ast_type': 'count_check'
            })

        return self._make_rule('Has', {'item_name': item, 'count': count})

    def _convert_group_check(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert group_check rule.

        AST: {"type": "group_check", "group": "Keys", "count": 3}
        RB: {"rule": "HasGroup", "options": [], "args": {"group": "Keys", "count": 3}}
        """
        group = rule.get('group', '')
        count = rule.get('count', 1)

        args = {'group': group}
        if count != 1:
            args['count'] = count

        return self._make_rule('HasGroup', args)

    # -------------------------------------------------------------------------
    # State Method Converters
    # -------------------------------------------------------------------------

    def _convert_state_method(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert state_method rules.

        Handles: has_all, has_any, has_all_counts, has_from_list, has_group_unique, etc.
        """
        method = rule.get('method', '')
        args = rule.get('args', [])

        # Helper to extract item list from a set, list, or tuple argument
        # Note: This extends extract_items_from_collection with generator_expression handling
        def get_items_from_arg(arg, default=None):
            # First try the shared utility for standard collection types
            result = extract_items_from_collection(arg, None)
            if result is not None:
                return result

            # Handle generator expressions (requires self for method call)
            if isinstance(arg, dict) and arg.get('type') == 'generator_expression':
                result = self._evaluate_generator_expression(arg)
                if result is not None:
                    return result

            return default

        if method == 'has_all':
            items = get_items_from_arg(get_arg_from_list(args, 0, []), [])
            if isinstance(items, list):
                if len(items) == 0:
                    # has_all([]) is vacuously true
                    return self._make_rule('True_', {})
                return self._make_rule('HasAll', {'items': items})

        elif method == 'has_any':
            items = get_items_from_arg(get_arg_from_list(args, 0, []), [])
            if isinstance(items, list):
                if len(items) == 0:
                    # has_any([]) is always false - can't have any of nothing
                    return self._make_rule('False_', {})
                return self._make_rule('HasAny', {'items': items})

        elif method == 'has_all_counts':
            items = get_arg_from_list(args, 0, {})
            if isinstance(items, dict):
                return self._make_rule('HasAllCounts', {'items': items})

        elif method == 'has_from_list':
            items = get_arg_from_list(args, 0, [])
            count = get_arg_from_list(args, 1, 1)
            return self._make_rule('HasFromList', {'items': items, 'count': count})

        elif method == 'has_from_list_unique':
            items = get_arg_from_list(args, 0, [])
            count = get_arg_from_list(args, 1, 1)
            return self._make_rule('HasFromListUnique', {'items': items, 'count': count})

        elif method == 'has_group_unique':
            group = get_arg_from_list(args, 0, '')
            count = get_arg_from_list(args, 1, 1)
            return self._make_rule('HasGroupUnique', {'group': group, 'count': count})

        elif method == 'has':
            # Simple has call
            item = get_arg_from_list(args, 0, '')
            count = get_arg_from_list(args, 1, 1)
            args_dict = {'item_name': item}
            if count != 1:
                args_dict['count'] = count
            return self._make_rule('Has', args_dict)

        elif method == 'can_reach':
            # can_reach state method
            # Handle Location/Region/Entrance objects passed directly (without type hint)
            name = get_arg_from_list(args, 0, '')
            reach_type = get_arg_from_list(args, 1, None)  # None means not specified

            # Check for _object_type marker from comprehension substitution
            # This is set when Location/Region/Entrance objects are substituted in comprehensions
            first_arg = args[0] if args else {}
            object_type = first_arg.get('_object_type') if isinstance(first_arg, dict) else None

            # Debug logging to trace Location/Region/Entrance object handling
            if object_type:
                logger.debug(f"can_reach handler: detected object_type={object_type} for name={name}")

            # If reach_type is explicitly specified, use it
            if reach_type == 'Location':
                # Extract name if it's a Location object
                if hasattr(name, 'name') and isinstance(name.name, str):
                    name = name.name
                return self._make_rule('CanReachLocation', {'location_name': name})
            elif reach_type == 'Entrance':
                # Extract name if it's an Entrance object
                if hasattr(name, 'name') and isinstance(name.name, str):
                    name = name.name
                return self._make_rule('CanReachEntrance', {'entrance_name': name})
            elif reach_type == 'Region':
                # Extract name if it's a Region object
                if hasattr(name, 'name') and isinstance(name.name, str):
                    name = name.name
                return self._make_rule('CanReachRegion', {'region_name': name})

            # Check for _object_type marker (set during comprehension expansion)
            if object_type == 'Location':
                return self._make_rule('CanReachLocation', {'location_name': name})
            elif object_type == 'Entrance':
                return self._make_rule('CanReachEntrance', {'entrance_name': name})
            elif object_type == 'Region':
                return self._make_rule('CanReachRegion', {'region_name': name})

            # No explicit type - infer from object type
            # Check if name is an Entrance object (has 'connected_region' and 'parent_region')
            # This must be checked BEFORE Location since both have parent_region
            if hasattr(name, 'connected_region') and hasattr(name, 'parent_region'):
                entrance_name = name.name if hasattr(name, 'name') else str(name)
                return self._make_rule('CanReachEntrance', {'entrance_name': entrance_name})

            # Check if name is a Location object (has parent_region but not entrances)
            if hasattr(name, 'parent_region') and not hasattr(name, 'entrances'):
                location_name = name.name if hasattr(name, 'name') else str(name)
                return self._make_rule('CanReachLocation', {'location_name': location_name})

            # Check if name is a Region object (has entrances)
            if hasattr(name, 'entrances'):
                region_name = name.name if hasattr(name, 'name') else str(name)
                return self._make_rule('CanReachRegion', {'region_name': region_name})

            # Default: treat as region name (string or unknown)
            return self._make_rule('CanReachRegion', {'region_name': name})

        elif method == 'can_reach_region':
            # can_reach_region state method (direct region name)
            name = get_arg_from_list(args, 0, '')
            if isinstance(name, str):
                return self._make_rule('CanReachRegion', {'region_name': name})
            # Fall through to custom rule if name is complex

        elif method == 'can_reach_location':
            # can_reach_location state method (direct location name)
            name = get_arg_from_list(args, 0, '')
            if isinstance(name, str):
                return self._make_rule('CanReachLocation', {'location_name': name})
            # Fall through to custom rule if name is complex

        elif method == 'can_reach_entrance':
            # can_reach_entrance state method
            name = get_arg_from_list(args, 0, '')
            if isinstance(name, str):
                return self._make_rule('CanReachEntrance', {'entrance_name': name})
            # Fall through to custom rule if name is complex

        elif method == 'count':
            # count state method - returns item count
            item = get_arg_from_list(args, 0, '')
            if isinstance(item, str):
                return self._make_rule('CountItem', {'item_name': item})
            # Fall through to custom rule if item is complex

        elif method == 'count_group':
            # count_group state method - returns group count
            group = get_arg_from_list(args, 0, '')
            if isinstance(group, str):
                return self._make_rule('CountGroup', {'group': group})
            # Fall through to custom rule if group is complex

        elif method == 'count_group_unique':
            # count_group_unique state method - returns unique group count
            group = get_arg_from_list(args, 0, '')
            if isinstance(group, str):
                return self._make_rule('CountGroupUnique', {'group': group})
            # Fall through to custom rule if group is complex

        # Unknown state method - preserve as custom rule
        self.warnings.append(f"Unknown state method '{method}' preserved as custom rule")
        return self._make_custom_rule('StateMethod', {
            'method': method,
            'args': args,
            '_original_ast_type': 'state_method'
        })

    # -------------------------------------------------------------------------
    # Composite Rule Optimizations
    # -------------------------------------------------------------------------

    def _flatten_composite(self, rule_name: str, children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Flatten nested And/Or of the same type.

        And(A, And(B, C)) -> And(A, B, C)
        Or(A, Or(B, C)) -> Or(A, B, C)
        """
        flattened = []
        for child in children:
            if isinstance(child, dict) and child.get('rule') == rule_name:
                # Same type - flatten its children
                nested_children = child.get('children', [])
                flattened.extend(nested_children)
            else:
                flattened.append(child)
        return flattened

    def _remove_identity_elements(self, rule_name: str, children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Remove identity elements from And/Or.

        And(..., True_) -> And(...)  (True_ is identity for And)
        Or(..., False_) -> Or(...)   (False_ is identity for Or)
        """
        identity = 'True_' if rule_name == 'And' else 'False_'
        return [c for c in children if not (isinstance(c, dict) and c.get('rule') == identity)]

    def _check_absorbing_element(self, rule_name: str, children: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Check for absorbing elements in And/Or.

        And(..., False_) -> False_  (False_ absorbs And)
        Or(..., True_) -> True_     (True_ absorbs Or)

        Returns the absorbing element if found, None otherwise.
        """
        absorbing = 'False_' if rule_name == 'And' else 'True_'
        for child in children:
            if isinstance(child, dict) and child.get('rule') == absorbing:
                return child
        return None

    def _combine_has_rules(self, rule_name: str, children: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Combine multiple simple Has rules into HasAll/HasAny.

        And(Has(A), Has(B), Has(C)) -> And(HasAll([A, B, C]))
        Or(Has(A), Has(B), Has(C)) -> Or(HasAny([A, B, C]))

        Also merges simple Has rules with existing HasAll/HasAny:
        And(Has(A), HasAll([B, C])) -> And(HasAll([A, B, C]))

        Only combines Has rules without count (or count=1).
        """
        target_rule = 'HasAll' if rule_name == 'And' else 'HasAny'

        simple_has_items = []
        existing_items = []  # Items from existing HasAll/HasAny
        other_children = []

        for child in children:
            if isinstance(child, dict):
                # Collect items from simple Has rules
                if child.get('rule') == 'Has':
                    args = child.get('args', {})
                    count = args.get('count', 1)
                    item_name = args.get('item_name')
                    # Only combine simple Has (count=1 or no count)
                    if count == 1 and item_name and isinstance(item_name, str):
                        simple_has_items.append(item_name)
                        continue
                # Also collect items from existing HasAll/HasAny (matching target)
                elif child.get('rule') == target_rule:
                    args = child.get('args', {})
                    items = args.get('items', [])
                    if isinstance(items, list) and all(isinstance(i, str) for i in items):
                        existing_items.extend(items)
                        continue
            other_children.append(child)

        # Combine all items from Has and existing HasAll/HasAny
        all_items = simple_has_items + existing_items

        # Deduplicate while preserving order
        unique_items = list(dict.fromkeys(all_items))

        if len(unique_items) >= 2:
            other_children.append(self._make_rule(target_rule, {'items': unique_items}))
        elif len(unique_items) == 1:
            other_children.append(self._make_rule('Has', {'item_name': unique_items[0]}))

        return other_children

    def _optimize_composite(self, rule_name: str, children: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Apply all optimizations to a composite rule (And/Or).

        1. Flatten nested same-type composites
        2. Check for absorbing elements (False_ in And, True_ in Or)
        3. Remove identity elements (True_ in And, False_ in Or)
        4. Combine simple Has rules into HasAll/HasAny
        5. Unwrap single-child composites
        """
        # 1. Flatten nested
        children = self._flatten_composite(rule_name, children)

        # 2. Check absorbing element
        absorbing = self._check_absorbing_element(rule_name, children)
        if absorbing:
            return absorbing

        # 3. Remove identity elements
        children = self._remove_identity_elements(rule_name, children)

        # 4. Combine Has rules
        children = self._combine_has_rules(rule_name, children)

        # 5. Handle edge cases
        if not children:
            # Empty And -> True_, Empty Or -> False_
            return self._make_rule('True_' if rule_name == 'And' else 'False_', {})

        if len(children) == 1:
            return children[0]

        return self._make_composite_rule(rule_name, children)

    # -------------------------------------------------------------------------
    # Composite Rule Converters
    # -------------------------------------------------------------------------

    def _convert_and(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert and rule.

        AST: {"type": "and", "conditions": [...]}
        RB: {"rule": "And", "children": [...]}

        Optimizations applied:
        1. Collect simple item_check rules with count=1 and combine into HasAll
        2. Flatten nested And rules
        3. Remove True_ identity elements
        4. Check for False_ absorbing element
        5. Combine already-converted Has rules into HasAll
        6. Unwrap single-child And
        """
        conditions = rule.get('conditions', [])

        if not conditions:
            return self._make_rule('True_', {})

        # First pass: collect simple item_checks before conversion
        simple_item_checks = []
        other_conditions = []
        for cond in conditions:
            if cond.get('type') == 'item_check':
                count_raw = cond.get('count', 1)
                count, _ = self._extract_constant_value(count_raw)
                if count == 1:
                    item_raw = cond.get('item', '')
                    item, _ = self._extract_constant_value(item_raw)
                    if isinstance(item, str) and item:
                        simple_item_checks.append(item)
                        continue
            other_conditions.append(cond)

        # Convert remaining conditions
        converted_children = [self._convert_rule(cond) for cond in other_conditions]

        # Add pre-conversion item checks as HasAll/Has
        unique_items = list(dict.fromkeys(simple_item_checks))
        if len(unique_items) >= 2:
            converted_children.append(self._make_rule('HasAll', {'items': unique_items}))
        elif len(unique_items) == 1:
            converted_children.append(self._make_rule('Has', {'item_name': unique_items[0]}))

        # Apply post-conversion optimizations
        return self._optimize_composite('And', converted_children)

    def _convert_or(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert or rule.

        AST: {"type": "or", "conditions": [...]}
        RB: {"rule": "Or", "children": [...]}

        Optimizations applied:
        1. Collect simple item_check rules with count=1 and combine into HasAny
        2. Flatten nested Or rules
        3. Remove False_ identity elements
        4. Check for True_ absorbing element
        5. Combine already-converted Has rules into HasAny
        6. Unwrap single-child Or
        """
        conditions = rule.get('conditions', [])

        if not conditions:
            return self._make_rule('False_', {})

        # First pass: collect simple item_checks before conversion
        simple_item_checks = []
        other_conditions = []
        for cond in conditions:
            if cond.get('type') == 'item_check':
                count_raw = cond.get('count', 1)
                count, _ = self._extract_constant_value(count_raw)
                if count == 1:
                    item_raw = cond.get('item', '')
                    item, _ = self._extract_constant_value(item_raw)
                    if isinstance(item, str) and item:
                        simple_item_checks.append(item)
                        continue
            other_conditions.append(cond)

        # Convert remaining conditions
        converted_children = [self._convert_rule(cond) for cond in other_conditions]

        # Add pre-conversion item checks as HasAny/Has
        unique_items = list(dict.fromkeys(simple_item_checks))
        if len(unique_items) >= 2:
            converted_children.append(self._make_rule('HasAny', {'items': unique_items}))
        elif len(unique_items) == 1:
            converted_children.append(self._make_rule('Has', {'item_name': unique_items[0]}))

        # Apply post-conversion optimizations
        return self._optimize_composite('Or', converted_children)

    def _convert_not(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert not rule.

        AST: {"type": "not", "condition": {...}}
        RB: {"rule": "Not", "args": {"condition": {...}}}

        Optimization: Not(Not(X)) -> X
        """
        condition = rule.get('condition', {})
        converted_condition = self._convert_rule(condition)

        # Optimization: Not(Not(X)) -> X
        if (isinstance(converted_condition, dict) and
            converted_condition.get('rule') == 'Not' and
            'args' in converted_condition and
            'condition' in converted_condition['args']):
            return converted_condition['args']['condition']

        return self._make_rule('Not', {'condition': converted_condition})

    # -------------------------------------------------------------------------
    # Reachability Converters
    # -------------------------------------------------------------------------

    def _convert_can_reach(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert can_reach rule.

        AST: {"type": "can_reach", "region": "Castle"}
        RB: {"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}}
        """
        region = rule.get('region', '')
        return self._make_rule('CanReachRegion', {'region_name': region})

    def _convert_location_check(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert location_check rule.

        AST: {"type": "location_check", "location": "Chest1"}
        RB: {"rule": "CanReachLocation", "options": [], "args": {"location_name": "Chest1"}}
        """
        location = rule.get('location', '')
        return self._make_rule('CanReachLocation', {'location_name': location})

    def _convert_can_reach_entrance(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert can_reach_entrance rule.

        AST: {"type": "can_reach_entrance", "entrance": "Door1"}
        RB: {"rule": "CanReachEntrance", "options": [], "args": {"entrance_name": "Door1"}}
        """
        entrance = rule.get('entrance', '')
        return self._make_rule('CanReachEntrance', {'entrance_name': entrance})

    # -------------------------------------------------------------------------
    # Conditional Converters (Option Filters)
    # -------------------------------------------------------------------------

    def _convert_conditional(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert conditional rule (typically from option filter).

        AST: {"type": "conditional", "test": {...}, "if_true": {...}, "if_false": {...}}
        RB: Rule with options array (if test is an option comparison)
        """
        test = rule.get('test', {})
        if_true = rule.get('if_true', {})
        if_false = rule.get('if_false', {})

        # Try to extract option filter from test
        options = self._extract_options_from_test(test)

        if options:
            # Check if if_false is just True (typical for option-filtered rules)
            if_false_is_true = (
                isinstance(if_false, dict) and
                if_false.get('type') == 'constant' and
                if_false.get('value') is True
            )

            if if_false_is_true:
                # This is a simple option-filtered rule
                converted_inner = self._convert_rule(if_true)
                converted_inner['options'] = options
                return converted_inner

        # Complex conditional - preserve as custom rule
        self.warnings.append("Complex conditional preserved as custom rule")
        return self._make_custom_rule('Conditional', {
            'test': self._convert_rule(test) if isinstance(test, dict) else test,
            'if_true': self._convert_rule(if_true) if isinstance(if_true, dict) else if_true,
            'if_false': self._convert_rule(if_false) if isinstance(if_false, dict) else if_false,
            '_original_ast_type': 'conditional'
        })

    def _extract_options_from_test(self, test: Dict[str, Any]) -> Optional[List[Dict]]:
        """
        Try to extract option filters from a test condition.

        Looks for patterns like:
        {"type": "compare", "left": {"type": "attribute", "object": {"name": "options"}, "attr": "X"}, ...}
        """
        if not isinstance(test, dict):
            return None

        test_type = test.get('type')

        if test_type == 'compare':
            option = self._extract_single_option(test)
            if option:
                return [option]

        elif test_type == 'and':
            # Multiple option conditions
            options = []
            conditions = test.get('conditions', [])
            for cond in conditions:
                option = self._extract_single_option(cond)
                if option:
                    options.append(option)
                else:
                    # Not all conditions are option comparisons
                    return None
            return options if options else None

        return None

    def _extract_single_option(self, compare: Dict[str, Any]) -> Optional[Dict]:
        """Extract a single option filter from a compare rule."""
        if compare.get('type') != 'compare':
            return None

        left = compare.get('left', {})
        op = compare.get('op', '==')
        right = compare.get('right', {})

        # Check if left is options.X attribute access
        if (left.get('type') == 'attribute' and
            isinstance(left.get('object'), dict) and
            left['object'].get('type') == 'name' and
            left['object'].get('name') == 'options'):

            option_name = left.get('attr', '')

            # Get value from right
            value = right.get('value') if right.get('type') == 'constant' else right

            # Map operator back
            op_map = {
                '==': 'eq',
                '!=': 'ne',
                '>': 'gt',
                '<': 'lt',
                '>=': 'ge',
                '<=': 'le',
                'in': 'contains',
            }

            return {
                'option': option_name,
                'op': op_map.get(op, 'eq'),
                'value': value
            }

        return None

    # -------------------------------------------------------------------------
    # Helper Converters
    # -------------------------------------------------------------------------

    def _convert_helper(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert helper rule.

        If the helper was originally converted from Rule Builder format,
        restore it. Otherwise, convert to Rule Builder format with flattened args.

        Output format (empty 'options', 'args', and 'kwargs' omitted):
            {
                "rule": "helper_name",
                "args": [arg1, arg2, ...],  # Flattened list, not nested; omitted if empty
                "kwargs": {"key": value, ...},  # Keyword arguments; omitted if empty
                "_original_ast_type": "helper",
                "_converted_from_ast": true
            }
        """
        helper_name = rule.get('name', 'Unknown')
        args = rule.get('args', [])
        kwargs = rule.get('kwargs', {})

        # Check for round-trip metadata
        if rule.get('_converted_from_rule_builder'):
            return self._restore_from_round_trip(rule)

        # Convert args (they may be nested rule dicts)
        converted_args = [
            self._convert_rule(arg) if isinstance(arg, dict) else arg
            for arg in args
        ]

        # Convert kwargs values (they may be nested rule dicts)
        converted_kwargs = {
            key: (self._convert_rule(value) if isinstance(value, dict) else value)
            for key, value in kwargs.items()
        }

        # Build flattened structure - args is a list at top level, not nested in a dict
        # Empty options, args, and kwargs are omitted to reduce JSON size
        result: Dict[str, Any] = {
            'rule': helper_name,
            '_original_ast_type': 'helper',
            '_converted_from_ast': True
        }
        if converted_args:
            result['args'] = converted_args
        if converted_kwargs:
            result['kwargs'] = converted_kwargs
        return result

    # -------------------------------------------------------------------------
    # Expression Converters (Limited Support)
    # -------------------------------------------------------------------------

    def _convert_compare_operand(self, operand: Any) -> Any:
        """
        Convert a compare/arithmetic operand.

        Unlike _convert_rule, this extracts raw values from constants instead
        of wrapping them in Constant rules. This produces cleaner output:
          {"left": 1, "right": ('a', 'b')} instead of
          {"left": {"rule": "Constant", "args": {"value": 1}}, ...}

        For complex operands (rules), it still converts them normally.
        """
        if not isinstance(operand, dict):
            return operand

        op_type = operand.get('type', '')

        # Extract raw values from constants
        if op_type == 'constant':
            return operand.get('value')

        # Convert tuple to Python tuple of values
        if op_type == 'tuple':
            elements = operand.get('elements', operand.get('value', []))
            result = []
            for elem in elements:
                result.append(self._convert_compare_operand(elem))
            return tuple(result)

        # Convert list to Python list of values
        if op_type == 'list':
            elements = operand.get('elements', operand.get('value', []))
            result = []
            for elem in elements:
                result.append(self._convert_compare_operand(elem))
            return result

        # For complex operands, convert as rule
        return self._convert_rule(operand)

    def _convert_compare(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert compare rule.

        AST: {"type": "compare", "left": {...}, "op": ">=", "right": {...}}
        RB: {"rule": "Compare", "args": {"left": ..., "op": ">=", "right": ...}}

        Uses _convert_compare_operand to extract raw values from constants
        instead of wrapping them in Constant rules.
        """
        left = rule.get('left', {})
        op = rule.get('op', '==')
        right = rule.get('right', {})

        self.warnings.append("Compare expression preserved as custom rule")
        return self._make_custom_rule('Compare', {
            'left': self._convert_compare_operand(left),
            'op': op,
            'right': self._convert_compare_operand(right),
            '_original_ast_type': 'compare'
        })

    def _convert_binary_op(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert binary_op rule to Arithmetic.

        AST: {"type": "binary_op", "left": {...}, "op": "+", "right": {...}}
        RB: {"rule": "Arithmetic", "args": {"left": ..., "op": "+", "right": ...}}

        Uses _convert_compare_operand to extract raw values from constants.
        """
        left = rule.get('left', {})
        op = rule.get('op', '+')
        right = rule.get('right', {})

        # Normalize operator names from Python AST
        op_map = {
            'Add': '+', 'Sub': '-', 'Mult': '*', 'Div': '/',
            'FloorDiv': '//', 'Mod': '%', 'Pow': '**',
        }
        op = op_map.get(op, op)

        return self._make_rule('Arithmetic', {
            'left': self._convert_compare_operand(left),
            'op': op,
            'right': self._convert_compare_operand(right),
        })

    def _convert_attribute(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert attribute access rule.

        Handles common patterns:
        - setting_value.value → SettingValue(setting_name) (legacy)
        - option_value.value → OptionValue(option_name)
        - options.X → SettingValue(X)
        - self.options.X → SettingValue(X)
        """
        obj = rule.get('object', {})
        attr = rule.get('attr', '')

        # Pattern 1a: setting_value.value → SettingValue (legacy)
        # {"type": "attribute", "object": {"type": "setting_value", "setting": "X"}, "attr": "value"}
        if isinstance(obj, dict) and obj.get('type') == 'setting_value' and attr == 'value':
            setting_name = obj.get('setting', '')
            return self._make_rule('SettingValue', {'setting': setting_name})

        # Pattern 1b: option_value.value → OptionValue
        # {"type": "attribute", "object": {"type": "option_value", "option": "X"}, "attr": "value"}
        if isinstance(obj, dict) and obj.get('type') == 'option_value' and attr == 'value':
            option_name = obj.get('option', '')
            return self._make_rule('OptionValue', {'option': option_name})

        # Pattern 2: options.X → SettingValue
        # {"type": "attribute", "object": {"type": "name", "name": "options"}, "attr": "X"}
        if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'options':
            return self._make_rule('SettingValue', {'setting': attr})

        # Pattern 3: self.options.X → SettingValue (nested attribute)
        # Need to handle {"type": "attribute", "object": {"type": "attribute", "object": {"type": "name", "name": "self"}, "attr": "options"}, "attr": "X"}
        if isinstance(obj, dict) and obj.get('type') == 'attribute':
            inner_obj = obj.get('object', {})
            inner_attr = obj.get('attr', '')
            if (isinstance(inner_obj, dict) and inner_obj.get('type') == 'name' and
                inner_obj.get('name') == 'self' and inner_attr == 'options'):
                return self._make_rule('SettingValue', {'setting': attr})

        # Pattern 4: world.X → WorldAttribute
        # Handles world instance attributes that are NOT options (logic_in_swordless_mode, logic_obscure_1, etc.)
        # These come from worldgen rules where state.multiworld.worlds[player].X is converted to world.X
        # {"type": "attribute", "object": {"type": "name", "name": "world"}, "attr": "X"}
        if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'world':
            return self._make_rule('WorldAttribute', {'attribute': attr})

        # Default: preserve as custom Attribute rule
        return self._make_custom_rule('Attribute', {
            'object': self._convert_rule(obj) if isinstance(obj, dict) else obj,
            'attr': attr,
            '_original_ast_type': 'attribute'
        })

    def _convert_name(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert name reference rule."""
        return self._make_custom_rule('Name', {
            'name': rule.get('name'),
            '_original_ast_type': 'name'
        })

    def _convert_list(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert list rule."""
        value = rule.get('value', [])
        converted_value = [
            self._convert_rule(item) if isinstance(item, dict) else item
            for item in value
        ]
        return self._make_custom_rule('List', {
            'value': converted_value,
            '_original_ast_type': 'list'
        })

    def _convert_tuple(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert tuple rule."""
        # Support both 'elements' (preferred) and 'value' (legacy) keys
        value = rule.get('elements', rule.get('value', []))
        converted_value = [
            self._convert_rule(item) if isinstance(item, dict) else item
            for item in value
        ]
        return self._make_custom_rule('Tuple', {
            'value': converted_value,
            '_original_ast_type': 'tuple'
        })

    def _convert_function_call(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert function call rule.

        Handles common patterns:
        - options.X.to_bool() → bool(SettingValue(X))
        - self.options.X.to_bool() → bool(SettingValue(X))
        - world.worlds[player].options.X.to_bool() → bool(SettingValue(X))
        """
        function = rule.get('function', {})
        args = rule.get('args', [])

        # Pattern: *.to_bool() or *.value with option access
        if isinstance(function, dict) and function.get('type') == 'attribute':
            func_attr = function.get('attr', '')
            func_obj = function.get('object', {})

            # Check for to_bool() method call on an option
            if func_attr == 'to_bool':
                # Extract the setting name from the option access chain
                setting_name = self._extract_setting_name(func_obj)
                if setting_name:
                    # Create a bool helper with the setting value as argument
                    result = {
                        'rule': 'bool',
                        '_original_ast_type': 'helper',
                        '_converted_from_ast': True,
                        'args': [
                            self._make_custom_rule('AST_setting_value', {
                                'setting': setting_name,
                                '_original_ast_type': 'setting_value'
                            })
                        ]
                    }
                    return result

        # Default: preserve as custom rule without converting nested structures
        # This keeps the raw AST format for function calls that we don't handle
        result_args = {
            'function': function,
            '_original_ast_type': 'function_call'
        }
        # Only include args if non-empty (matches WorldGen format)
        if args:
            result_args['args'] = args
        return self._make_custom_rule('AST_function_call', result_args)

    def _extract_setting_name(self, obj: Dict[str, Any]) -> Optional[str]:
        """
        Extract setting name from an option access chain.

        Handles patterns like:
        - options.X → 'X'
        - self.options.X → 'X'
        - world.worlds[player].options.X → 'X'
        - {type: 'option_value', option: 'X'} → 'X'
        - {type: 'setting_value', setting: 'X'} → 'X'
        """
        if not isinstance(obj, dict):
            return None

        obj_type = obj.get('type')

        # Handle option_value type (created by expression_visitors.py)
        if obj_type == 'option_value':
            return obj.get('option')

        # Handle setting_value type (legacy format)
        if obj_type == 'setting_value':
            return obj.get('setting')

        # Direct name reference
        if obj_type == 'name':
            return obj.get('name')

        # Attribute access
        if obj_type == 'attribute':
            attr = obj.get('attr', '')
            inner_obj = obj.get('object', {})

            # Check if parent is 'options'
            if isinstance(inner_obj, dict):
                if inner_obj.get('type') == 'name' and inner_obj.get('name') == 'options':
                    return attr
                if inner_obj.get('type') == 'attribute' and inner_obj.get('attr') == 'options':
                    return attr

            # Recurse to find options.X pattern
            if attr == 'options':
                # We're at the 'options' attribute, so the setting is the parent's attr
                return None

            # Check if we've found the setting name (after options)
            inner_attr = inner_obj.get('attr', '') if isinstance(inner_obj, dict) else ''
            if inner_attr == 'options':
                return attr

            # Continue searching
            return self._extract_setting_name(inner_obj)

        return None

    # -------------------------------------------------------------------------
    # Placement Converters
    # -------------------------------------------------------------------------

    def _flatten_locations(self, locations: Any) -> List[List[Any]]:
        """
        Flatten location list to simple [[name, player], ...] format.

        Handles various input formats:
        - {"type": "constant", "value": [[loc1, 1], [loc2, 1]]}
        - {"type": "list", "value": [{"type": "list", "value": [...]}]}
        - Direct list: [[loc1, 1], [loc2, 1]]
        """
        if not locations:
            return []

        # Already a simple list
        if isinstance(locations, list):
            result = []
            for item in locations:
                if isinstance(item, list) and len(item) >= 2:
                    # Already [name, player] format
                    result.append(item)
                elif isinstance(item, dict):
                    # Nested structure - extract values
                    flattened = self._flatten_single_location(item)
                    if flattened:
                        result.append(flattened)
            return result

        if not isinstance(locations, dict):
            return []

        loc_type = locations.get('type')
        value = locations.get('value')

        if loc_type == 'constant' and isinstance(value, list):
            # Pre-evaluated constant - value is already [[name, player], ...]
            return value

        if loc_type == 'list' and isinstance(value, list):
            # Nested list structure - recursively flatten
            result = []
            for item in value:
                if isinstance(item, dict):
                    if item.get('type') == 'list':
                        # Inner list - extract [name, player]
                        inner = item.get('value', [])
                        flattened = self._flatten_inner_list(inner)
                        if flattened:
                            result.append(flattened)
                    elif item.get('type') == 'tuple':
                        # Handle tuple format: {"type": "tuple", "elements": [...]}
                        elements = item.get('elements', [])
                        if len(elements) >= 2:
                            loc_name = elements[0].get('value') if isinstance(elements[0], dict) and elements[0].get('type') == 'constant' else elements[0]
                            player = elements[1].get('value') if isinstance(elements[1], dict) and elements[1].get('type') == 'constant' else elements[1]
                            result.append([loc_name, player])
                    elif item.get('type') == 'constant':
                        # Constant value
                        inner_val = item.get('value')
                        if isinstance(inner_val, list):
                            result.append(inner_val)
                elif isinstance(item, list):
                    result.append(item)
            return result

        return []

    def _flatten_inner_list(self, inner: List[Any]) -> Optional[List[Any]]:
        """Flatten an inner list [name_obj, player_obj] to [name, player]."""
        if len(inner) < 2:
            return None

        name = inner[0]
        player = inner[1]

        # Extract name
        if isinstance(name, dict) and name.get('type') == 'constant':
            name = name.get('value')

        # Extract player
        if isinstance(player, dict) and player.get('type') == 'constant':
            player = player.get('value')

        return [name, player]

    def _flatten_single_location(self, item: Dict[str, Any]) -> Optional[List[Any]]:
        """Flatten a single location entry."""
        if item.get('type') == 'list':
            return self._flatten_inner_list(item.get('value', []))
        elif item.get('type') == 'tuple':
            # Handle tuple format: {"type": "tuple", "elements": [...]}
            elements = item.get('elements', [])
            if len(elements) >= 2:
                # Extract values from constant elements
                loc_name = elements[0].get('value') if isinstance(elements[0], dict) and elements[0].get('type') == 'constant' else elements[0]
                player = elements[1].get('value') if isinstance(elements[1], dict) and elements[1].get('type') == 'constant' else elements[1]
                return [loc_name, player]
        elif item.get('type') == 'constant':
            val = item.get('value')
            if isinstance(val, list) and len(val) >= 2:
                return val
        return None

    def _convert_placement_search(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert placement_search rule.

        AST: {"type": "placement_search", "item": {...}, "player": {...}, "locations": {...}}
        RB: {"rule": "AST_placement_search", "args": {"item": "X", "player": 1, "locations": [[loc, player], ...]}}
        """
        item = rule.get('item', '')
        player = rule.get('player', {'type': 'constant', 'value': 1})
        locations = rule.get('locations', [])

        # Extract item value if constant
        if isinstance(item, dict) and item.get('type') == 'constant':
            item = item.get('value')

        # Extract player value if constant
        if isinstance(player, dict) and player.get('type') == 'constant':
            player = player.get('value')

        # Flatten locations to simple format
        flattened_locations = self._flatten_locations(locations)

        return {
            'rule': 'AST_placement_search',
            'args': {
                'item': item,
                'player': player,
                'locations': flattened_locations,
                '_original_ast_type': 'placement_search'
            },
            '_converted_from_ast': True
        }

    def _convert_placement_lookup(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert placement_lookup rule.

        AST: {"type": "placement_lookup", "location": "LocationName"}
        RB: {"rule": "AST_placement_lookup", "args": {"location": "LocationName"}}
        """
        location = rule.get('location', '')

        # Extract location value if constant
        if isinstance(location, dict) and location.get('type') == 'constant':
            location = location.get('value')

        return {
            'rule': 'AST_placement_lookup',
            'args': {
                'location': location,
                '_original_ast_type': 'placement_lookup'
            },
            '_converted_from_ast': True
        }

    # -------------------------------------------------------------------------
    # Setting/Option/Attribute Value Converters
    # -------------------------------------------------------------------------

    def _convert_setting_value(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert setting_value to SettingValue rule (legacy, for backward compat)."""
        setting = rule.get('setting', '')
        args = {'setting': setting}
        if 'index' in rule:
            args['index'] = rule['index']
        if rule.get('use_current_key'):
            args['use_current_key'] = True
        return self._make_rule('SettingValue', args)

    def _convert_option_value(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert option_value to OptionValue rule."""
        option = rule.get('option', '')
        args = {'option': option}
        if rule.get('use_current_key'):
            args['use_current_key'] = True
        return self._make_rule('OptionValue', args)

    def _convert_world_attribute(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert world_attribute to WorldAttribute rule."""
        attribute = rule.get('attribute', '')
        args = {'attribute': attribute}
        if 'index' in rule:
            args['index'] = rule['index']
        if rule.get('use_current_key'):
            args['use_current_key'] = True
        return self._make_rule('WorldAttribute', args)

    def _convert_region_reference(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert region_reference to a Constant with the region name string.

        Region references come from multiworld.get_region('Region Name', player) calls.
        When used as arguments to helper functions (like can_bomb_clip), the helper
        already handles string-to-region conversion, so we just need the name.
        """
        region = rule.get('region', '')
        return self._make_custom_rule('Constant', {'value': region})

    # -------------------------------------------------------------------------
    # Unknown Type Handler
    # -------------------------------------------------------------------------

    def _convert_unknown(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Handle unknown AST types by preserving them as custom rules."""
        rule_type = rule.get('type', 'unknown')
        self.warnings.append(f"Unknown AST type '{rule_type}' preserved as custom rule")

        # Preserve all fields except 'type', and skip empty 'args' arrays
        args = {
            k: v for k, v in rule.items()
            if k != 'type' and not (k == 'args' and isinstance(v, list) and len(v) == 0)
        }
        args['_original_ast_type'] = rule_type

        return self._make_custom_rule(f'AST_{rule_type}', args)


# -------------------------------------------------------------------------
# Convenience Functions
# -------------------------------------------------------------------------

def convert_ast_to_rule_builder(rule: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert a single rule from AST format to Rule Builder format.

    Args:
        rule: Rule in AST format

    Returns:
        Tuple of (converted_rule, warnings)
    """
    converter = ASTToRuleBuilder()
    result = converter.convert(rule)
    return result.rule, result.warnings + result.errors


def convert_rules_file_to_rule_builder(data: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert an entire rules file from AST format to Rule Builder format.

    This handles the full file structure including regions, locations, etc.

    Args:
        data: Full rules file data in AST format

    Returns:
        Tuple of (converted_data, all_warnings)
    """
    converter = ASTToRuleBuilder()
    all_warnings = []

    def convert_access_rule(rule):
        """Convert an access_rule field if it exists."""
        if rule is None:
            return None
        result = converter.convert(rule)
        all_warnings.extend(result.warnings)
        all_warnings.extend(result.errors)
        return result.rule

    # Deep copy the data structure
    import copy
    converted_data = copy.deepcopy(data)

    # Convert rules in regions
    if 'regions' in converted_data:
        for player_id, regions in converted_data['regions'].items():
            for region_name, region_data in regions.items():
                # Convert exit rules
                if 'exits' in region_data:
                    for exit_data in region_data['exits']:
                        if 'access_rule' in exit_data and exit_data['access_rule']:
                            exit_data['access_rule'] = convert_access_rule(exit_data['access_rule'])

                # Convert entrance rules
                if 'entrances' in region_data:
                    for entrance_data in region_data['entrances']:
                        if 'access_rule' in entrance_data and entrance_data['access_rule']:
                            entrance_data['access_rule'] = convert_access_rule(entrance_data['access_rule'])

                # Convert location rules
                if 'locations' in region_data:
                    for location_data in region_data['locations']:
                        if 'access_rule' in location_data and location_data['access_rule']:
                            location_data['access_rule'] = convert_access_rule(location_data['access_rule'])
                        if 'item_rule' in location_data and location_data['item_rule']:
                            location_data['item_rule'] = convert_access_rule(location_data['item_rule'])

    # Convert dungeon rules if present
    if 'dungeons' in converted_data:
        for player_id, dungeons in converted_data['dungeons'].items():
            for dungeon_name, dungeon_data in dungeons.items():
                if 'medallion_check' in dungeon_data and dungeon_data['medallion_check']:
                    dungeon_data['medallion_check'] = convert_access_rule(dungeon_data['medallion_check'])

                if 'bosses' in dungeon_data:
                    for boss_key, boss_data in dungeon_data['bosses'].items():
                        if 'defeat_rule' in boss_data and boss_data['defeat_rule']:
                            boss_data['defeat_rule'] = convert_access_rule(boss_data['defeat_rule'])

    return converted_data, all_warnings
