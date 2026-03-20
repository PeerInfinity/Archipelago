"""
AST Format Rule Explanation Functions.

This module provides functions to generate human-readable explanations
for AST format rules. These explanations are used by the Rule Builder's
explain_json() method when handling AST format rules that can't be
converted to native Rule Builder classes.

The explain functions return JSONMessagePart lists compatible with
Archipelago's printJSON system.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ._ast_utils import extract_constant_value

if TYPE_CHECKING:
    from BaseClasses import CollectionState

from NetUtils import JSONMessagePart


def explain_ast_rule(
    rule: dict[str, Any],
    state: "CollectionState | None",
    player: int,
    depth: int = 0
) -> list[JSONMessagePart]:
    """
    Generate explain output for any AST format rule.

    Args:
        rule: AST format rule dict
        state: Current collection state (or None for static explanation)
        player: Player ID
        depth: Recursion depth (for cycle prevention)

    Returns:
        List of JSONMessagePart dicts for display
    """
    if depth > 50:
        return [{"type": "text", "text": "[max depth]"}]

    if not isinstance(rule, dict):
        return [{"type": "text", "text": str(rule)}]

    rule_type = rule.get('type', '')

    # Dispatch to specific handlers
    handlers = {
        'constant': _explain_constant,
        'item_check': _explain_item_check,
        'count_check': _explain_count_check,
        'group_check': _explain_group_check,
        'and': _explain_and,
        'or': _explain_or,
        'not': _explain_not,
        'compare': _explain_compare,
        'comparison': _explain_compare,
        'conditional': _explain_conditional,
        'helper': _explain_helper,
        'state_method': _explain_state_method,
        'setting_value': _explain_setting_value,  # Legacy
        'option_value': _explain_option_value,
        'world_attribute': _explain_world_attribute,
        'can_reach': _explain_can_reach,
        'region_check': _explain_region_check,
        'location_check': _explain_location_check,
        'can_reach_entrance': _explain_can_reach_entrance,
        'binary_op': _explain_binary_op,
        'sum': _explain_sum,
        'min': _explain_min,
        'max': _explain_max,
        'attribute': _explain_attribute,
        'subscript': _explain_subscript,
        'name': _explain_name,
        'function_call': _explain_function_call,
        'block': _explain_block,
        'return': _explain_return,
        'list': _explain_list,
        'tuple': _explain_tuple,
        'for_range': _explain_for_range,
        'for_iter': _explain_for_iter,
        'len': _explain_len,
        'any': _explain_any,
        'all': _explain_all,
    }

    handler = handlers.get(rule_type)
    if handler:
        return handler(rule, state, player, depth)

    # Fallback for unknown types
    return [{"type": "text", "text": f"[{rule_type or 'unknown'}]"}]


# Alias for backwards compatibility within this module
_extract_value = extract_constant_value


def _explain_constant(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a constant rule."""
    value = rule.get('value')
    if value is True:
        return [{"type": "color", "color": "green", "text": "True"}]
    elif value is False:
        return [{"type": "color", "color": "salmon", "text": "False"}]
    else:
        return [{"type": "text", "text": str(value)}]


def _explain_item_check(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an item_check rule."""
    item = _extract_value(rule.get('item', ''))
    count = _extract_value(rule.get('count', 1))

    if state is not None:
        has_count = state.count(item, player)
        has_enough = has_count >= count
        color = "green" if has_enough else "salmon"
        prefix = "Has" if has_enough else "Missing"

        if count == 1:
            return [
                {"type": "text", "text": f"{prefix} "},
                {"type": "color", "color": color, "text": item},
            ]
        else:
            return [
                {"type": "text", "text": f"{prefix} "},
                {"type": "color", "color": color, "text": f"{item} ({has_count}/{count})"},
            ]
    else:
        if count == 1:
            return [{"type": "text", "text": f"Has {item}"}]
        else:
            return [{"type": "text", "text": f"Has {item} x{count}"}]


def _explain_count_check(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a count_check rule (same as item_check)."""
    return _explain_item_check(rule, state, player, depth)


def _explain_group_check(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a group_check rule."""
    group = _extract_value(rule.get('group', ''))
    count = _extract_value(rule.get('count', 1))

    if state is not None:
        try:
            has_count = state.count_group(group, player)
            has_enough = has_count >= count
            color = "green" if has_enough else "salmon"
            prefix = "Has" if has_enough else "Missing"

            return [
                {"type": "text", "text": f"{prefix} "},
                {"type": "color", "color": color, "text": f"{has_count}/{count}"},
                {"type": "text", "text": f" from group "},
                {"type": "color", "color": "cyan", "text": group},
            ]
        except (KeyError, AttributeError):
            pass

    return [{"type": "text", "text": f"Has {count} from group '{group}'"}]


def _explain_and(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an AND rule."""
    conditions = rule.get('conditions', [])
    if not conditions:
        return [{"type": "color", "color": "green", "text": "True"}]

    messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
    for i, cond in enumerate(conditions):
        if i > 0:
            messages.append({"type": "text", "text": " & "})
        messages.extend(explain_ast_rule(cond, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_or(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an OR rule."""
    conditions = rule.get('conditions', [])
    if not conditions:
        return [{"type": "color", "color": "salmon", "text": "False"}]

    messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
    for i, cond in enumerate(conditions):
        if i > 0:
            messages.append({"type": "text", "text": " | "})
        messages.extend(explain_ast_rule(cond, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_not(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a NOT rule."""
    condition = rule.get('condition') or rule.get('operand', {})
    messages: list[JSONMessagePart] = [{"type": "text", "text": "NOT ("}]
    messages.extend(explain_ast_rule(condition, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_compare(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a compare/comparison rule."""
    left = rule.get('left', {})
    op = rule.get('op', '==')
    right = rule.get('right', {})

    messages: list[JSONMessagePart] = []
    messages.extend(explain_ast_rule(left, state, player, depth + 1))
    messages.append({"type": "text", "text": f" {op} "})
    messages.extend(explain_ast_rule(right, state, player, depth + 1))
    return messages


def _explain_conditional(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a conditional (ternary) rule.

    When state is available, we can evaluate the test and show which branch is active.
    """
    test = rule.get('test', {})
    if_true = rule.get('if_true', {})
    if_false = rule.get('if_false', {})

    # If we can evaluate the test, just show the active branch
    if state is not None and depth < 10:
        # Try to evaluate the test condition to determine which branch applies
        # For now, we just show the full conditional but could be enhanced
        pass

    messages: list[JSONMessagePart] = [{"type": "text", "text": "If ("}]
    messages.extend(explain_ast_rule(test, state, player, depth + 1))
    messages.append({"type": "text", "text": ") then ("})
    messages.extend(explain_ast_rule(if_true, state, player, depth + 1))
    messages.append({"type": "text", "text": ") else ("})
    messages.extend(explain_ast_rule(if_false, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_helper(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a helper function call.

    If the helper has a 'body' field, we recursively explain the body.
    Otherwise, we just show the helper name and arguments.
    """
    helper_name = rule.get('name', 'unknown')
    args = rule.get('args', [])
    body = rule.get('body')

    # If we have the helper body, explain it directly (best explain)
    if body is not None and isinstance(body, dict):
        # Check if it's a simple body that we can explain inline
        body_type = body.get('type', '')
        if body_type == 'block':
            # Complex block - show helper name with note about body
            messages: list[JSONMessagePart] = [
                {"type": "color", "color": "magenta", "text": helper_name},
            ]
            if args:
                messages.append({"type": "text", "text": "("})
                for i, arg in enumerate(args):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    if isinstance(arg, dict):
                        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
                    else:
                        messages.append({"type": "text", "text": str(arg)})
                messages.append({"type": "text", "text": ")"})
            return messages
        else:
            # Simple body - explain it directly
            return explain_ast_rule(body, state, player, depth + 1)

    # Fallback: show helper name and args
    messages = [
        {"type": "text", "text": "Helper: "},
        {"type": "color", "color": "magenta", "text": helper_name},
    ]

    if args:
        messages.append({"type": "text", "text": "("})
        for i, arg in enumerate(args):
            if i > 0:
                messages.append({"type": "text", "text": ", "})
            if isinstance(arg, dict):
                messages.extend(explain_ast_rule(arg, state, player, depth + 1))
            else:
                messages.append({"type": "text", "text": str(arg)})
        messages.append({"type": "text", "text": ")"})

    return messages


def _explain_state_method(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a state method call."""
    method = rule.get('method', '')
    args = rule.get('args', [])

    # Handle common state methods
    if method == 'has':
        item = _extract_value(args[0]) if args else ''
        count = _extract_value(args[1]) if len(args) > 1 else 1
        return _explain_item_check({'item': item, 'count': count}, state, player, depth)

    elif method == 'has_all':
        items = _extract_value(args[0]) if args else []
        if isinstance(items, list):
            if state is not None:
                has_all = state.has_all(items, player)
                missing = [item for item in items if not state.has(item, player)]
                if has_all:
                    return [
                        {"type": "color", "color": "green", "text": "Has all of: "},
                        {"type": "text", "text": ", ".join(items)},
                    ]
                else:
                    return [
                        {"type": "color", "color": "salmon", "text": "Missing from all: "},
                        {"type": "text", "text": ", ".join(missing)},
                    ]
            return [{"type": "text", "text": f"Has all of: {', '.join(items)}"}]

    elif method == 'has_any':
        items = _extract_value(args[0]) if args else []
        if isinstance(items, list):
            if state is not None:
                has_any = state.has_any(items, player)
                owned = [item for item in items if state.has(item, player)]
                if has_any:
                    return [
                        {"type": "color", "color": "green", "text": "Has: "},
                        {"type": "text", "text": ", ".join(owned)},
                        {"type": "text", "text": f" (from {len(items)} options)"},
                    ]
                else:
                    return [
                        {"type": "color", "color": "salmon", "text": "Has none of: "},
                        {"type": "text", "text": ", ".join(items[:3])},
                        {"type": "text", "text": f"..." if len(items) > 3 else ""},
                    ]
            return [{"type": "text", "text": f"Has any of: {', '.join(items)}"}]

    elif method == 'count':
        item = _extract_value(args[0]) if args else ''
        if state is not None:
            count = state.count(item, player)
            return [
                {"type": "text", "text": f"Count("},
                {"type": "color", "color": "yellow", "text": item},
                {"type": "text", "text": f"): {count}"},
            ]
        return [{"type": "text", "text": f"Count({item})"}]

    elif method == 'can_reach' or method == 'can_reach_region':
        region = _extract_value(args[0]) if args else ''
        return _explain_can_reach({'region': region}, state, player, depth)

    elif method == 'count_group':
        group = _extract_value(args[0]) if args else ''
        if state is not None:
            count = state.count_group(group, player)
            return [
                {"type": "text", "text": f"Count group("},
                {"type": "color", "color": "cyan", "text": group},
                {"type": "text", "text": f"): {count}"},
            ]
        return [{"type": "text", "text": f"Count group({group})"}]

    # Generic state method display
    args_str = ', '.join(str(_extract_value(a)) for a in args)
    return [{"type": "text", "text": f"state.{method}({args_str})"}]


def _explain_setting_value(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a setting_value rule (legacy, for backward compat)."""
    setting = rule.get('setting', '')
    return [
        {"type": "text", "text": "Setting: "},
        {"type": "color", "color": "cyan", "text": setting},
    ]


def _explain_option_value(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an option_value rule."""
    option = rule.get('option', '')
    return [
        {"type": "text", "text": "Option: "},
        {"type": "color", "color": "cyan", "text": option},
    ]


def _explain_world_attribute(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a world_attribute rule."""
    attribute = rule.get('attribute', '')
    index = rule.get('index')
    if index is not None:
        return [
            {"type": "text", "text": "World attribute: "},
            {"type": "color", "color": "cyan", "text": f"{attribute}[{index}]"},
        ]
    return [
        {"type": "text", "text": "World attribute: "},
        {"type": "color", "color": "cyan", "text": attribute},
    ]


def _explain_can_reach(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a can_reach rule."""
    region = rule.get('region', '')

    if state is not None:
        try:
            can_reach = state.can_reach_region(region, player)
            if can_reach:
                return [
                    {"type": "color", "color": "green", "text": "Can reach region "},
                    {"type": "color", "color": "yellow", "text": region},
                ]
            else:
                return [
                    {"type": "color", "color": "salmon", "text": "Cannot reach region "},
                    {"type": "color", "color": "yellow", "text": region},
                ]
        except (KeyError, AttributeError):
            pass

    return [{"type": "text", "text": f"Can reach region: {region}"}]


def _explain_region_check(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a region_check rule."""
    region = rule.get('region', '')

    if state is not None:
        try:
            can_reach = state.can_reach_region(region, player)
            if can_reach:
                return [
                    {"type": "color", "color": "green", "text": "Region accessible: "},
                    {"type": "color", "color": "yellow", "text": region},
                ]
            else:
                return [
                    {"type": "color", "color": "salmon", "text": "Region not accessible: "},
                    {"type": "color", "color": "yellow", "text": region},
                ]
        except (KeyError, AttributeError):
            pass

    return [{"type": "text", "text": f"Region accessible: {region}"}]


def _explain_location_check(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a location_check rule."""
    location = rule.get('location', '')

    if state is not None:
        try:
            can_reach = state.can_reach_location(location, player)
            if can_reach:
                return [
                    {"type": "color", "color": "green", "text": "Can reach location: "},
                    {"type": "color", "color": "yellow", "text": location},
                ]
            else:
                return [
                    {"type": "color", "color": "salmon", "text": "Cannot reach location: "},
                    {"type": "color", "color": "yellow", "text": location},
                ]
        except (KeyError, AttributeError):
            pass

    return [{"type": "text", "text": f"Can reach location: {location}"}]


def _explain_can_reach_entrance(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a can_reach_entrance rule."""
    entrance = rule.get('entrance', '')

    if state is not None:
        try:
            can_reach = state.can_reach_entrance(entrance, player)
            if can_reach:
                return [
                    {"type": "color", "color": "green", "text": "Can reach entrance: "},
                    {"type": "color", "color": "yellow", "text": entrance},
                ]
            else:
                return [
                    {"type": "color", "color": "salmon", "text": "Cannot reach entrance: "},
                    {"type": "color", "color": "yellow", "text": entrance},
                ]
        except (KeyError, AttributeError):
            pass

    return [{"type": "text", "text": f"Can reach entrance: {entrance}"}]


def _explain_binary_op(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a binary operation."""
    left = rule.get('left', {})
    op = rule.get('op', '+')
    right = rule.get('right', {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
    messages.extend(explain_ast_rule(left, state, player, depth + 1))
    messages.append({"type": "text", "text": f" {op} "})
    messages.extend(explain_ast_rule(right, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_sum(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a sum rule."""
    args = rule.get('args', [])
    if args:
        messages: list[JSONMessagePart] = [{"type": "text", "text": "sum("}]
        messages.extend(explain_ast_rule(args[0], state, player, depth + 1))
        messages.append({"type": "text", "text": ")"})
        return messages
    return [{"type": "text", "text": "sum()"}]


def _explain_min(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a min rule."""
    args = rule.get('args', [])
    messages: list[JSONMessagePart] = [{"type": "text", "text": "min("}]
    for i, arg in enumerate(args):
        if i > 0:
            messages.append({"type": "text", "text": ", "})
        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_max(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a max rule."""
    args = rule.get('args', [])
    messages: list[JSONMessagePart] = [{"type": "text", "text": "max("}]
    for i, arg in enumerate(args):
        if i > 0:
            messages.append({"type": "text", "text": ", "})
        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_attribute(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an attribute access."""
    obj = rule.get('object', rule.get('value', {}))
    attr = rule.get('attr', '')

    messages: list[JSONMessagePart] = []
    messages.extend(explain_ast_rule(obj, state, player, depth + 1))
    messages.append({"type": "text", "text": f".{attr}"})
    return messages


def _explain_subscript(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a subscript/index access."""
    value = rule.get('value', {})
    index = rule.get('index', {})

    messages: list[JSONMessagePart] = []
    messages.extend(explain_ast_rule(value, state, player, depth + 1))
    messages.append({"type": "text", "text": "["})
    messages.extend(explain_ast_rule(index, state, player, depth + 1))
    messages.append({"type": "text", "text": "]"})
    return messages


def _explain_name(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a variable name reference."""
    name = rule.get('name', rule.get('id', ''))
    return [{"type": "text", "text": name}]


def _explain_function_call(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a function call."""
    func = rule.get('func', rule.get('name', ''))
    args = rule.get('args', [])

    # Handle func as a rule (e.g., attribute access)
    if isinstance(func, dict):
        messages = explain_ast_rule(func, state, player, depth + 1)
    else:
        messages = [{"type": "text", "text": str(func)}]

    messages.append({"type": "text", "text": "("})
    for i, arg in enumerate(args):
        if i > 0:
            messages.append({"type": "text", "text": ", "})
        if isinstance(arg, dict):
            messages.extend(explain_ast_rule(arg, state, player, depth + 1))
        else:
            messages.append({"type": "text", "text": str(arg)})
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_block(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a block of statements."""
    statements = rule.get('statements', [])
    if not statements:
        return [{"type": "text", "text": "[empty block]"}]

    # Just show that it's a complex block
    return [{"type": "text", "text": f"[block with {len(statements)} statements]"}]


def _explain_return(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a return statement."""
    value = rule.get('value', {})
    messages: list[JSONMessagePart] = [{"type": "text", "text": "return "}]
    messages.extend(explain_ast_rule(value, state, player, depth + 1))
    return messages


def _explain_list(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a list literal."""
    elements = rule.get('elements', [])
    if not elements:
        return [{"type": "text", "text": "[]"}]

    messages: list[JSONMessagePart] = [{"type": "text", "text": "["}]
    for i, elem in enumerate(elements):
        if i > 0:
            messages.append({"type": "text", "text": ", "})
        if isinstance(elem, dict):
            messages.extend(explain_ast_rule(elem, state, player, depth + 1))
        else:
            messages.append({"type": "text", "text": str(elem)})
    messages.append({"type": "text", "text": "]"})
    return messages


def _explain_tuple(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a tuple literal."""
    elements = rule.get('elements', [])
    if not elements:
        return [{"type": "text", "text": "()"}]

    messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
    for i, elem in enumerate(elements):
        if i > 0:
            messages.append({"type": "text", "text": ", "})
        if isinstance(elem, dict):
            messages.extend(explain_ast_rule(elem, state, player, depth + 1))
        else:
            messages.append({"type": "text", "text": str(elem)})
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_for_range(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a for-range loop."""
    var = rule.get('variable', rule.get('var', 'i'))
    start = rule.get('start', 0)
    end = rule.get('end', {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": f"for {var} in range("}]
    if isinstance(start, dict):
        messages.extend(explain_ast_rule(start, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(start)})
    messages.append({"type": "text", "text": ", "})
    if isinstance(end, dict):
        messages.extend(explain_ast_rule(end, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(end)})
    messages.append({"type": "text", "text": ")..."})
    return messages


def _explain_for_iter(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a for-iterator loop."""
    var = rule.get('variable', rule.get('var', 'item'))
    iterable = rule.get('iterable', {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": f"for {var} in "}]
    if isinstance(iterable, dict):
        messages.extend(explain_ast_rule(iterable, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(iterable)})
    messages.append({"type": "text", "text": "..."})
    return messages


def _explain_len(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain a len() call."""
    arg = rule.get('arg', rule.get('args', [{}])[0] if rule.get('args') else {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": "len("}]
    if isinstance(arg, dict):
        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(arg)})
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_any(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an any() call."""
    arg = rule.get('arg', rule.get('args', [{}])[0] if rule.get('args') else {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": "any("}]
    if isinstance(arg, dict):
        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(arg)})
    messages.append({"type": "text", "text": ")"})
    return messages


def _explain_all(
    rule: dict, state: "CollectionState | None", player: int, depth: int
) -> list[JSONMessagePart]:
    """Explain an all() call."""
    arg = rule.get('arg', rule.get('args', [{}])[0] if rule.get('args') else {})

    messages: list[JSONMessagePart] = [{"type": "text", "text": "all("}]
    if isinstance(arg, dict):
        messages.extend(explain_ast_rule(arg, state, player, depth + 1))
    else:
        messages.append({"type": "text", "text": str(arg)})
    messages.append({"type": "text", "text": ")"})
    return messages
