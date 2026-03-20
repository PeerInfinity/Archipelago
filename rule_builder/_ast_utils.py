"""
Shared AST parsing utilities for the rule_builder module.

This module provides common utilities for working with AST-format rules,
used by ast_format.py, ast_explain.py, and external consumers like the exporter.
"""

from typing import Any, List, Optional, FrozenSet


def extract_constant_value(value: Any, default: Any = None) -> Any:
    """
    Extract a value from a potential AST constant wrapper.

    AST format often wraps primitive values in {"type": "constant", "value": X}.
    This function unwraps such values, returning the inner value directly.

    Args:
        value: The value to potentially unwrap
        default: Default value if the result would be None

    Returns:
        The unwrapped value, or the original value if not a constant wrapper
    """
    if isinstance(value, dict) and value.get('type') == 'constant':
        return value.get('value', default)
    return value if value is not None else default


def get_arg_from_list(args: List[Any], index: int, default: Any = None) -> Any:
    """
    Extract an argument value from a list, unwrapping constant wrappers.

    This is commonly used when parsing state_method or function call arguments
    where each argument may be wrapped in a constant node.

    Args:
        args: List of arguments (may contain constant wrappers)
        index: Index of the argument to extract
        default: Default value if index is out of bounds or value is None

    Returns:
        The unwrapped argument value, or default if not available
    """
    if index < len(args):
        return extract_constant_value(args[index], default)
    return default


def extract_items_from_collection(arg: Any, default: Optional[List] = None) -> Optional[List]:
    """
    Extract a list of items from various AST collection formats.

    Handles:
    - Plain lists
    - {"type": "set", "elements": [...]}
    - {"type": "tuple", "elements": [...]}
    - {"type": "list", "value": [...]}

    Args:
        arg: The collection argument (may be list, set, tuple, or list node)
        default: Default value if extraction fails

    Returns:
        List of extracted item values, or default if not a recognized format
    """
    if isinstance(arg, list):
        return arg

    if isinstance(arg, dict):
        node_type = arg.get('type')

        if node_type in ('set', 'tuple'):
            # Extract item values from elements
            elements = arg.get('elements', [])
            return [
                extract_constant_value(el) for el in elements
            ]

        if node_type == 'list':
            # Extract item values from list value
            values = arg.get('value', [])
            return [
                extract_constant_value(v) for v in values
            ]

    return default


# Registry of known AST rule types for validation and documentation
KNOWN_AST_RULE_TYPES: FrozenSet[str] = frozenset({
    # Primitive/constant types
    'constant',
    'True_',
    'False_',

    # Item checks
    'item_check',
    'count_check',
    'group_check',
    'group_count_check',

    # Logical operators
    'and',
    'or',
    'not',

    # Comparisons
    'compare',
    'comparison',

    # Conditionals
    'conditional',
    'if_else',

    # State methods
    'state_method',

    # Reach checks
    'can_reach',
    'can_reach_region',
    'can_reach_location',
    'can_reach_entrance',
    'region_check',
    'location_check',
    'entrance_check',

    # Helper/function calls
    'helper',
    'helper_call',
    'function_call',
    'call',

    # Binary operations
    'binary_op',
    'binop',

    # Attribute/value access
    'attribute',
    'attr',
    'option_value',
    'setting_value',
    'world_attribute',
    'param_ref',
    'variable',
    'name',

    # Collections
    'set',
    'list',
    'tuple',
    'dict',

    # Subscript/index
    'subscript',
    'index',

    # Special
    'lambda',
    'comprehension',
    'generator_expression',
})


def is_known_ast_type(rule_type: str) -> bool:
    """
    Check if a rule type is a known AST type.

    This can be used for validation or to determine if a type
    needs special handling vs. being passed through as-is.

    Args:
        rule_type: The type string to check

    Returns:
        True if the type is known, False otherwise
    """
    return rule_type in KNOWN_AST_RULE_TYPES
