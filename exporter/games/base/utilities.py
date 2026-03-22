"""Static utility methods for game export handlers.

This module contains standalone utility functions that don't depend on
handler instance state.
"""

import re
from typing import Any, Callable, Dict, Optional

try:
    from world_generator._sanitization import sanitize_for_helper_name
except (ImportError, AttributeError):
    # Fallback when world_generator's package init triggers imports that require
    # the fork's extended rule_builder (which may not be installed).
    # Replicates sanitize_for_helper_name from world_generator/_sanitization.py.
    def sanitize_for_helper_name(name: str) -> str:
        result = re.sub(r'[^a-zA-Z0-9_]', '_', name)
        result = re.sub(r'_+', '_', result)
        result = result.strip('_')
        if result and not result[0].isalpha():
            result = 'item_' + result
        return result.lower()


def extract_closure_vars(rule_func: Callable) -> Dict[str, Any]:
    """Extract closure variables from a function.

    This utility method extracts the values of free variables (closure variables)
    from a function. It's useful for analyzing rule functions that capture values
    from their enclosing scope.

    Args:
        rule_func: The function to extract closure variables from

    Returns:
        A dictionary mapping variable names to their captured values
    """
    closure_vars = {}
    if hasattr(rule_func, '__closure__') and rule_func.__closure__:
        if hasattr(rule_func, '__code__'):
            freevars = rule_func.__code__.co_freevars
            for i, var_name in enumerate(freevars):
                if i < len(rule_func.__closure__):
                    cell = rule_func.__closure__[i]
                    try:
                        closure_vars[var_name] = cell.cell_contents
                    except ValueError:
                        pass
    return closure_vars


def count_rule_nodes(rule: Optional[Dict[str, Any]]) -> int:
    """
    Count the number of nodes in a rule tree.

    This is used to decide whether to inline a helper or preserve it as a
    helper call based on HELPER_INLINE_THRESHOLD.

    Args:
        rule: The rule structure to count nodes in

    Returns:
        The number of nodes in the rule tree
    """
    if not rule or not isinstance(rule, dict):
        return 0

    count = 1  # Count this node
    rule_type = rule.get('type')

    if rule_type in ['and', 'or']:
        for condition in rule.get('conditions', []):
            count += count_rule_nodes(condition)
    elif rule_type == 'not':
        count += count_rule_nodes(rule.get('condition'))
    elif rule_type == 'conditional':
        count += count_rule_nodes(rule.get('test'))
        count += count_rule_nodes(rule.get('if_true'))
        count += count_rule_nodes(rule.get('if_false'))
    elif rule_type == 'helper':
        for arg in rule.get('args', []):
            if isinstance(arg, dict):
                count += count_rule_nodes(arg)
    elif rule_type == 'state_method':
        for arg in rule.get('args', []):
            if isinstance(arg, dict):
                count += count_rule_nodes(arg)
    elif rule_type == 'block':
        for stmt in rule.get('statements', []):
            if isinstance(stmt, dict):
                count += count_rule_nodes(stmt)

    return count


# Use the shared sanitization function
sanitize_helper_name = sanitize_for_helper_name
