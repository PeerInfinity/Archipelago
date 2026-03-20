"""
Shared code generation utilities for RuleCodeGenerator and HelperCodeGenerator.

This module provides common functions for code generation tasks,
extracted to reduce duplication between the two generator classes.
"""

from typing import Any, Dict, Optional

# AST analyzer output types that produce complete boolean expressions
# and can be converted to Rule Builder format.
ANALYZER_BOOL_TYPES: frozenset[str] = frozenset({
    'and', 'or', 'not', 'constant',
    'item_check', 'item_check_any', 'item_check_all',
    'count_check', 'group_check',
    'state_method',
    'can_reach', 'region_check', 'location_check', 'can_reach_entrance',
    'compare', 'comparison',
})

# Subset: types that depend on runtime player state
# (cannot be evaluated at compile time, need lambda wrappers in conditionals)
ANALYZER_RUNTIME_TYPES: frozenset[str] = frozenset({
    'state_method',
    'item_check', 'item_check_any', 'item_check_all',
    'count_check', 'group_check',
    'helper',
})


def is_placement_lookup(operand: Any) -> bool:
    """
    Check if an operand is a placement_lookup rule.

    Placement lookups (location_item_name checks) depend on actual item placements
    which are not available during tracking. These checks should be treated as False
    during code generation so that tracking works correctly.

    This is used to fix self-locking rules like:
        OR(location_item_name(state, loc, player) == (item, 1), state.has(item, player))
    Which should simplify to just Has(item) for tracking purposes.
    """
    if not isinstance(operand, dict):
        return False

    # Check for placement_lookup type
    if operand.get('type') == 'placement_lookup':
        return True

    # Check for Rule Builder format AST_placement_lookup
    if operand.get('rule') == 'AST_placement_lookup':
        return True

    return False


def extract_placement_location(operand: Any) -> Optional[str]:
    """
    Extract the location name from a placement_lookup expression.
    Returns the location name as a string, or None if it cannot be extracted.
    """
    if not isinstance(operand, dict):
        return None

    # Handle placement_lookup type
    if operand.get('type') == 'placement_lookup':
        location_rule = operand.get('location', {})
        if isinstance(location_rule, dict):
            if location_rule.get('type') == 'constant':
                return location_rule.get('value', '')
        elif isinstance(location_rule, str):
            return location_rule
        return None

    # Handle Rule Builder format AST_placement_lookup
    if operand.get('rule') == 'AST_placement_lookup':
        args = operand.get('args', {})
        return args.get('location', None)

    return None


def extract_items_from_list(operand: Any) -> Optional[set]:
    """
    Extract item names from a list of tuples for 'in' operator comparisons.

    Expected formats:
    - [('Item1', player), ('Item2', player), ...]
    - {"type": "list", "value": [{"type": "tuple", "elements": [...]}, ...]}

    Returns a set of item names, or None if the format is unrecognized.
    """
    if not isinstance(operand, dict):
        return None

    if operand.get('type') != 'list':
        return None

    values = operand.get('value', [])
    items = set()

    for item in values:
        if isinstance(item, dict):
            item_type = item.get('type', '')
            if item_type == 'tuple':
                # {"type": "tuple", "elements": [{"type": "constant", "value": "ItemName"}, ...]}
                elements = item.get('elements', [])
                if elements and len(elements) >= 1:
                    first_elem = elements[0]
                    if isinstance(first_elem, dict) and first_elem.get('type') == 'constant':
                        items.add(first_elem.get('value'))
                    elif isinstance(first_elem, str):
                        items.add(first_elem)
            elif item_type == 'list':
                # Nested list format
                nested_values = item.get('value', [])
                if nested_values and len(nested_values) >= 1:
                    first_val = nested_values[0]
                    if isinstance(first_val, dict) and first_val.get('type') == 'constant':
                        items.add(first_val.get('value'))
                    elif isinstance(first_val, str):
                        items.add(first_val)
        elif isinstance(item, (list, tuple)) and len(item) >= 1:
            # Direct tuple/list: ('ItemName', player)
            items.add(item[0])

    return items if items else None


def check_placement_comparison(
    left: Any,
    right: Any,
    op: str,
    placements: Dict[str, str],
    is_placement_fn=None,
    extract_location_fn=None,
    extract_items_fn=None
) -> Optional[bool]:
    """
    Check if a placement comparison can be resolved to a boolean using actual placements.

    For self-locking rules like:
        location_item_name(state, "Location A", player) == ("Left Tower Key", 1)

    We check if the actual item placed at "Location A" matches the expected item.
    Returns True/False if the comparison can be resolved, None otherwise.

    Args:
        left: Left operand of the comparison
        right: Right operand of the comparison
        op: Comparison operator (==, !=, in, not in, etc.)
        placements: Dict mapping location names to placed item names
        is_placement_fn: Optional custom function to check if operand is placement_lookup
        extract_location_fn: Optional custom function to extract location from placement_lookup
        extract_items_fn: Optional custom function to extract items from list
    """
    # Use default functions if not provided
    if is_placement_fn is None:
        is_placement_fn = is_placement_lookup
    if extract_location_fn is None:
        extract_location_fn = extract_placement_location
    if extract_items_fn is None:
        extract_items_fn = extract_items_from_list

    # Determine which side is the placement_lookup
    placement_operand = None
    expected_operand = None

    if is_placement_fn(left):
        placement_operand = left
        expected_operand = right
    elif is_placement_fn(right):
        placement_operand = right
        expected_operand = left
    else:
        return None

    # Extract the location name from the placement_lookup
    location_name = extract_location_fn(placement_operand)
    if not location_name:
        return None

    # Get the actual item placed at this location
    actual_item = placements.get(location_name) if placements else None

    # Extract the expected item from the comparison value
    # Expected format is typically [item_name, player] or (item_name, player)
    expected_item = None
    if isinstance(expected_operand, list) and len(expected_operand) >= 1:
        expected_item = expected_operand[0]
    elif isinstance(expected_operand, dict):
        # Could be a Tuple or list type in AST format
        if expected_operand.get('type') == 'list':
            values = expected_operand.get('value', [])
            if values and len(values) >= 1:
                first_val = values[0]
                if isinstance(first_val, dict) and first_val.get('type') == 'constant':
                    expected_item = first_val.get('value')
                elif isinstance(first_val, str):
                    expected_item = first_val
        elif expected_operand.get('rule') == 'Tuple':
            values = expected_operand.get('args', {}).get('value', [])
            if values and len(values) >= 1:
                first_val = values[0]
                if isinstance(first_val, str):
                    expected_item = first_val
        elif expected_operand.get('type') == 'tuple':
            # Handle tuple type with 'elements' key: {"type": "tuple", "elements": [...]}
            elements = expected_operand.get('elements', [])
            if elements and len(elements) >= 1:
                first_val = elements[0]
                if isinstance(first_val, dict) and first_val.get('type') == 'constant':
                    expected_item = first_val.get('value')
                elif isinstance(first_val, str):
                    expected_item = first_val

    if expected_item is None:
        return None

    # Now compare actual vs expected
    if op in ('==', 'eq'):
        if actual_item is None:
            return False  # No item placed means comparison fails
        return actual_item == expected_item
    elif op in ('!=', 'ne'):
        if actual_item is None:
            return True  # No item placed means inequality succeeds
        return actual_item != expected_item
    elif op in ('in', 'In'):
        # For 'in' operator, expected_operand is a list of tuples like [('Item', player), ...]
        # We need to extract all item names and check if actual_item is in that set
        expected_items = extract_items_fn(expected_operand)
        if expected_items is None:
            return None
        if actual_item is None:
            return False  # No item placed means not in the list
        return actual_item in expected_items
    elif op in ('not in', 'NotIn'):
        # For 'not in' operator, check if actual_item is NOT in the expected list
        expected_items = extract_items_fn(expected_operand)
        if expected_items is None:
            return None
        if actual_item is None:
            return True  # No item placed means not in the list
        return actual_item not in expected_items

    return None


def escape_string(s: str, quote_char: str = '"') -> str:
    """Escape a string for use in generated Python code.

    Args:
        s: The string to escape
        quote_char: The quote character to escape (" or ')

    Returns:
        The escaped string (without surrounding quotes)
    """
    escaped = s.replace('\\', '\\\\')
    if quote_char == '"':
        return escaped.replace('"', '\\"')
    else:
        return escaped.replace("'", "\\'")


def generate_world_attribute_expr(expr: Dict[str, Any]) -> str:
    """Generate code to access a world attribute at runtime.

    World attributes are properties on the world object that are set
    during game generation. Examples include logic settings like
    'logic_obscure_1' in The Wind Waker.

    Always generates: state.multiworld.worlds[player].<name>
    This pattern is recognized by the exporter's pattern detection.
    """
    attribute = expr.get('attribute', '')
    base_path = f'state.multiworld.worlds[player].{attribute}'

    # Handle indexed access (e.g., required_medallions[0])
    if 'index' in expr:
        index = expr['index']
        if isinstance(index, int):
            return f'{base_path}[{index}]'
        elif isinstance(index, str):
            return f'{base_path}[{repr(index)}]'

    return base_path


def extract_constant(value: Any, default: Any = None, settings: Dict[str, Any] = None) -> Any:
    """Extract constant value from complex expressions.

    Handles constants, binary operations (like 'Axe' + 's' -> 'Axes'),
    and subscript operations (like item_groups["Axes"]).

    Args:
        value: The value to extract a constant from
        default: Default value if extraction fails
        settings: Optional settings dict for attribute lookups (HelperCodeGenerator behavior)

    Returns:
        The extracted constant value, or default if not extractable
    """
    if isinstance(value, dict):
        if value.get('type') == 'constant':
            return value.get('value', default)
        if value.get('type') == 'value':
            return value.get('value', default)
        if value.get('type') == 'set':
            elements = value.get('elements', [])
            return [extract_constant(elem, None, settings) for elem in elements
                    if extract_constant(elem, None, settings) is not None]

        # Handle binary operations on constants (e.g., 'Axe' + 's' -> 'Axes')
        if value.get('type') in ('binary_op', 'binop'):
            left = extract_constant(value.get('left', {}), None, settings)
            right = extract_constant(value.get('right', {}), None, settings)
            op = value.get('op', '+')
            op_map = {'Add': '+', 'Sub': '-', 'Mult': '*', 'Div': '/', 'FloorDiv': '//'}
            op = op_map.get(op, op)
            if left is not None and right is not None:
                try:
                    if op == '+':
                        return left + right
                    elif op == '-':
                        return left - right
                    elif op == '*':
                        return left * right
                    elif op == '/':
                        return left / right
                    elif op == '//':
                        return left // right
                except TypeError:
                    pass
            return default

        # Handle subscript (e.g., item_groups["Axes"])
        if value.get('type') == 'subscript':
            base_value = extract_constant(value.get('value', {}), None, settings)
            index = extract_constant(value.get('index', {}), None, settings)
            if base_value is not None and index is not None:
                try:
                    return base_value[index]
                except (IndexError, KeyError, TypeError):
                    pass
            return default

        # Handle attribute access on self (HelperCodeGenerator behavior)
        # This is only used when settings is provided
        if settings is not None and value.get('type') == 'attribute':
            obj = value.get('object', {})
            attr = value.get('attr', '')
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'self':
                if attr in settings:
                    return settings[attr]
            return default

        return default
    return value if value is not None else default


def get_helper_function_name(helper_name: str) -> str:
    """Get the Python function name for a helper.

    Returns the helper name as-is, without any prefix. The helpers are
    defined in the world's Rules.py module, so they're already namespaced
    and don't need a game-specific prefix.
    """
    return helper_name
