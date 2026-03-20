"""
Helper statement mixin — statement generators, expression dispatcher, and _indent.
"""

import sys
from typing import Any, Dict, Set, Optional

from rule_builder import BOOLEAN_RULE_TYPES
from ._codegen_utils import (
    ANALYZER_BOOL_TYPES,
    get_helper_function_name,
)


class HelperStatementMixin:
    """Mixin providing statement generators and the expression dispatcher."""

    # These attributes are expected to be defined on the main class.
    game_name: str
    game_name_lower: str
    settings: Dict[str, Any]
    option_definitions: Dict[str, Any]
    known_helpers: Set[str]
    helper_data: Dict[str, Any]
    placements: Dict[str, str]
    uses_math: bool
    uses_placement_lookup: bool
    uses_logging: bool
    namedtuple_types: Dict[tuple, str]
    namedtuple_names: Dict[str, tuple]
    _current_location: Optional[str]
    _current_entrance: Optional[str]
    _current_helper_params: Set[str]

    def _indent(self, code: str, level: int = 1) -> str:
        """Indent code by the specified number of levels (4 spaces each)."""
        indent = '    ' * level
        lines = code.split('\n')
        return '\n'.join(indent + line if line.strip() else line for line in lines)

    def _generate_body(self, rule: Dict[str, Any]) -> str:
        """
        Generate Python code for a rule body (may be expression or block).

        Returns code suitable for a function body (includes return if needed).
        """
        if not isinstance(rule, dict):
            return f"return {repr(rule)}"

        rule_type = rule.get('type', '')

        # Handle block (multi-statement body)
        if rule_type == 'block':
            return self._generate_block(rule)

        # For single expressions, wrap in return
        expr = self._generate_expression(rule)
        return f"return {expr}"

    def _generate_block(self, rule: Dict[str, Any]) -> str:
        """Generate Python code for a block of statements."""
        statements = rule.get('statements', [])
        if not statements:
            return "pass"

        lines = []
        for stmt in statements:
            stmt_code = self._generate_statement(stmt)
            lines.append(stmt_code)

        return '\n'.join(lines)

    def _generate_statement(self, stmt: Dict[str, Any]) -> str:
        """Generate Python code for a single statement."""
        if not isinstance(stmt, dict):
            return str(stmt)

        stmt_type = stmt.get('type', '')

        if stmt_type == 'assign':
            return self._generate_assign(stmt)
        elif stmt_type == 'aug_assign':
            return self._generate_aug_assign(stmt)
        elif stmt_type == 'tuple_assign':
            return self._generate_tuple_assign(stmt)
        elif stmt_type == 'return':
            return self._generate_return(stmt)
        elif stmt_type == 'for_range':
            return self._generate_for_range(stmt)
        elif stmt_type == 'for_iter':
            return self._generate_for_iter(stmt)
        elif stmt_type == 'if_statement':
            return self._generate_if_statement(stmt)
        elif stmt_type == 'while_loop':
            return self._generate_while_loop(stmt)
        elif stmt_type == 'break':
            return 'break'
        elif stmt_type == 'continue':
            return 'continue'
        else:
            # Treat as expression statement
            return self._generate_expression(stmt)

    def _generate_assign(self, stmt: Dict[str, Any]) -> str:
        """Generate Python assignment statement."""
        name = stmt.get('name', '_')
        value = self._generate_expression(stmt.get('value', {'type': 'constant', 'value': None}))
        op = stmt.get('op', '=')

        # Handle augmented assignment (+=, -=, *=, etc.)
        if op != '=':
            return f"{name} {op} {value}"
        return f"{name} = {value}"

    def _generate_aug_assign(self, stmt: Dict[str, Any]) -> str:
        """Generate Python augmented assignment statement (+=, -=, *=, /=, etc.).

        The aug_assign format uses:
        - 'target': the variable name being modified
        - 'op': the operator (+, -, *, /, etc.) - note: without the '='
        - 'value': the expression to apply
        """
        target = stmt.get('target', '_')
        op = stmt.get('op', '+')
        value = self._generate_expression(stmt.get('value', {'type': 'constant', 'value': 0}))

        # Convert operator to augmented assignment form
        return f"{target} {op}= {value}"

    def _generate_tuple_assign(self, stmt: Dict[str, Any]) -> str:
        """Generate Python tuple unpacking assignment statement (e.g., a, b = func())."""
        targets = stmt.get('targets', [])
        value = self._generate_expression(stmt.get('value', {'type': 'constant', 'value': None}))

        if not targets:
            return f"_ = {value}"

        target_str = ', '.join(targets)
        return f"{target_str} = {value}"

    def _generate_return(self, stmt: Dict[str, Any]) -> str:
        """Generate Python return statement."""
        value = stmt.get('value')
        if value is None:
            return "return"
        return f"return {self._generate_expression(value)}"

    def _generate_for_range(self, stmt: Dict[str, Any]) -> str:
        """Generate Python for loop over range.

        Supports:
        - range(count) - old format with 'count' key
        - range(start, stop) - new format with 'start' and 'stop' keys
        - range(start, stop, step) - new format with 'start', 'stop', and 'step' keys
        """
        var = stmt.get('var', '_')
        body = stmt.get('body', [])

        # Determine range() arguments
        if 'start' in stmt and 'stop' in stmt:
            # New format: range(start, stop) or range(start, stop, step)
            start = self._generate_expression(stmt['start'])
            stop = self._generate_expression(stmt['stop'])
            if 'step' in stmt:
                step = self._generate_expression(stmt['step'])
                range_code = f"range({start}, {stop}, {step})"
            else:
                range_code = f"range({start}, {stop})"
        else:
            # Old format: range(count)
            count = self._generate_expression(stmt.get('count', {'type': 'constant', 'value': 0}))
            range_code = f"range({count})"

        body_lines = []
        for s in body:
            body_lines.append(self._generate_statement(s))

        body_code = '\n'.join(body_lines) if body_lines else 'pass'

        return f"for {var} in {range_code}:\n{self._indent(body_code)}"

    def _generate_for_iter(self, stmt: Dict[str, Any]) -> str:
        """Generate Python for loop over iterable."""
        var = stmt.get('var', '_')
        iterable = self._generate_expression(stmt.get('iterable', {'type': 'constant', 'value': []}))
        body = stmt.get('body', [])

        # Handle 'vars' array format (used for tuple unpacking like "for item, rating in dict.items()")
        vars_array = stmt.get('vars')
        if vars_array and isinstance(vars_array, list):
            var = ', '.join(vars_array)
        # Handle tuple unpacking in var (if var is a dict with type 'tuple')
        elif isinstance(var, dict) and var.get('type') == 'tuple':
            elements = var.get('elements', [])
            var_names = [self._generate_expression(e) for e in elements]
            var = ', '.join(var_names)

        body_lines = []
        for s in body:
            body_lines.append(self._generate_statement(s))

        body_code = '\n'.join(body_lines) if body_lines else 'pass'

        return f"for {var} in {iterable}:\n{self._indent(body_code)}"

    def _generate_if_statement(self, stmt: Dict[str, Any]) -> str:
        """Generate Python if statement."""
        test = self._generate_expression(stmt.get('test', {'type': 'constant', 'value': True}))
        body = stmt.get('body', [])
        orelse = stmt.get('orelse', [])

        body_lines = [self._generate_statement(s) for s in body]
        body_code = '\n'.join(body_lines) if body_lines else 'pass'

        result = f"if {test}:\n{self._indent(body_code)}"

        if orelse:
            orelse_lines = [self._generate_statement(s) for s in orelse]
            orelse_code = '\n'.join(orelse_lines) if orelse_lines else 'pass'
            result += f"\nelse:\n{self._indent(orelse_code)}"

        return result

    def _generate_while_loop(self, stmt: Dict[str, Any]) -> str:
        """Generate Python while loop."""
        condition = self._generate_expression(stmt.get('condition', {'type': 'constant', 'value': True}))
        body = stmt.get('body', [])
        orelse = stmt.get('orelse', [])

        body_lines = [self._generate_statement(s) for s in body]
        body_code = '\n'.join(body_lines) if body_lines else 'pass'

        result = f"while {condition}:\n{self._indent(body_code)}"

        if orelse:
            orelse_lines = [self._generate_statement(s) for s in orelse]
            orelse_code = '\n'.join(orelse_lines)
            result += f"\nelse:\n{self._indent(orelse_code)}"

        return result

    def _generate_expression(self, expr: Any) -> str:
        """Generate Python expression from a rule."""
        # Handle None
        if expr is None:
            return 'None'

        # Handle primitives
        if not isinstance(expr, dict):
            if isinstance(expr, bool):
                return 'True' if expr else 'False'
            elif isinstance(expr, str):
                return repr(expr)
            elif isinstance(expr, list):
                # Convert lists to tuples for compatibility with location_item_name()
                # which returns tuples. Python requires matching types for == comparison.
                items = [self._generate_expression(e) for e in expr]
                if len(items) == 1:
                    return f"({items[0]},)"
                return f"({', '.join(items)})"
            return str(expr)

        expr_type = expr.get('type', '')

        # Dispatch based on expression type
        handlers = {
            'constant': self._expr_constant,
            'value': self._expr_constant,  # alias
            'name': self._expr_name,
            'param_ref': self._expr_name,  # alias for helper parameter references
            'variable': self._expr_name,  # alias
            'call': self._expr_call,  # for built-in function calls like min, max, len
            'item_check': self._expr_item_check,
            'item_check_count': self._expr_item_check_count,  # for SM helpers
            'item_check_with_mapping': self._expr_item_check_with_mapping,  # for SM item name mapping
            'count_check': self._expr_count_check,
            'group_check': self._expr_group_check,
            'and': self._expr_and,
            'or': self._expr_or,
            'all_of': self._expr_all_of,  # alias for AND with conditions list
            'any_of': self._expr_any_of,  # alias for OR with conditions list
            'not': self._expr_not,
            'compare': self._expr_compare,
            'comparison': self._expr_compare,  # alias
            'binary_op': self._expr_binary_op,
            'binop': self._expr_binary_op,  # alias
            'conditional': self._expr_conditional,
            'helper': self._expr_helper,
            'state_method': self._expr_state_method,
            'subscript': self._expr_subscript,
            'index': self._expr_subscript,  # alias
            'attribute': self._expr_attribute,
            'function_call': self._expr_function_call,
            'method_call': self._expr_method_call,
            'list': self._expr_list,
            'tuple': self._expr_tuple,
            'set': self._expr_set,
            'negate': self._expr_negate,
            'can_reach': self._expr_can_reach,
            'region_check': self._expr_can_reach,  # alias for can_reach
            'can_reach_entrance': self._expr_can_reach_entrance,
            'location_check': self._expr_location_check,
            'count_item': self._expr_count_item,
            'group_count': self._expr_group_count,
            'setting_value': self._expr_setting_value,  # Legacy
            'option_value': self._expr_option_value,
            'world_attribute': self._expr_world_attribute,
            'prog_item_count': self._expr_prog_item_count,
            'sum_of': self._expr_sum_of,
            'sum': self._expr_sum,
            'min': self._expr_min,
            'max': self._expr_max,
            'block': self._expr_block,
            'placement_lookup': self._expr_placement_lookup,
            'f_string': self._expr_f_string,
            'formatted_value': self._expr_formatted_value,
            'generator_expression': self._expr_generator_expression,
            'region_reference': self._expr_region_reference,
            'region_attribute': self._expr_region_attribute,
            'map': self._expr_map,
            'lambda': self._expr_lambda,
            'dict_lambda_lookup': self._expr_dict_lambda_lookup,
        }

        handler = handlers.get(expr_type)
        if handler:
            return handler(expr)

        # Handle 'rule' key format (Rule Builder format from exporter)
        rule_type = expr.get('rule', '')
        if rule_type:
            # Handle AST_region_check
            if rule_type == 'AST_region_check':
                args = expr.get('args', {})
                region = args.get('region', '')
                if isinstance(region, str):
                    return f'state.can_reach({repr(region)}, "Region", player)'
                elif isinstance(region, dict) and region.get('type') == 'constant':
                    region_name = region.get('value', '')
                    return f'state.can_reach({repr(region_name)}, "Region", player)'
                # Fallback for complex region expressions
                region_expr = self._generate_expression(region)
                return f'state.can_reach({region_expr}, "Region", player)'

            # Handle And/Or rules
            if rule_type in ('And', 'and'):
                children = expr.get('children', [])
                if not children:
                    return 'True'
                parts = [self._generate_expression(c) for c in children]
                return '(' + ' and '.join(f'({p})' for p in parts) + ')'

            if rule_type in ('Or', 'or'):
                children = expr.get('children', [])
                if not children:
                    return 'False'
                parts = [self._generate_expression(c) for c in children]
                return '(' + ' or '.join(f'({p})' for p in parts) + ')'

            # Handle Compare rules (Rule Builder format)
            if rule_type == 'Compare':
                args = expr.get('args', {})
                left = args.get('left')
                op = args.get('op', '==')
                right = args.get('right')
                # Check if either side is a placement_lookup
                # Placement lookups (location_item_name checks) depend on actual item placements.
                # We check the actual placements to determine the correct result.
                # This correctly handles self-locking rules: if the key IS placed in the locked region,
                # the placement check should return True, making the region accessible without the key.
                if self._is_placement_lookup(left) or self._is_placement_lookup(right):
                    # Try to resolve the comparison using actual placements
                    placement_result = self._check_placement_comparison(left, right, op)
                    if placement_result is True:
                        return 'True'
                    elif placement_result is False:
                        return 'False'
                    # If placement_result is None, fall back to False for safety
                    if op in ('==', 'eq'):
                        return 'False'
                    elif op in ('!=', 'ne'):
                        return 'True'
                # Always use _generate_expression to properly handle lists -> tuples
                left_expr = self._generate_expression(left)
                right_expr = self._generate_expression(right)
                return f'({left_expr} {op} {right_expr})'

            # Handle Constant rules (Rule Builder format)
            if rule_type == 'Constant':
                args = expr.get('args', {})
                value = args.get('value')
                if value is None:
                    return 'None'
                if isinstance(value, bool):
                    return 'True' if value else 'False'
                # Delegate to _expr_constant for proper handling of dicts and lists.
                # This converts numeric string keys to integers (JSON uses string keys
                # but the original Python code may have used integer keys).
                if isinstance(value, (dict, list)):
                    return self._expr_constant({'value': value})
                return repr(value)

            # Handle Has rules (Rule Builder format)
            if rule_type == 'Has':
                args = expr.get('args', {})
                item_name = args.get('item_name', '')
                count = args.get('count', 1)
                if count == 1:
                    return f"state.has({repr(item_name)}, player)"
                # Handle dict counts (e.g., OptionValue rules)
                if isinstance(count, dict):
                    count_rule = count.get('rule', '')
                    count_args = count.get('args', {})
                    if count_rule == 'OptionValue':
                        option = count_args.get('option', '')
                        return f"state.has({repr(item_name)}, player, state.multiworld.worlds[player].options.{option}.value)"
                    # For other complex expressions, use _generate_expression
                    count_expr = self._generate_expression(count)
                    return f"state.has({repr(item_name)}, player, {count_expr})"
                return f"state.has({repr(item_name)}, player, {count})"

            # Handle HasAll rules (Rule Builder format)
            if rule_type == 'HasAll':
                args = expr.get('args', {})
                items = args.get('items', [])
                # Use list literal to match original ALTTP style
                return f"state.has_all({items!r}, player)"

            # Handle HasAny rules (Rule Builder format)
            if rule_type == 'HasAny':
                args = expr.get('args', {})
                items = args.get('items', [])
                # Use list literal to match original ALTTP style
                return f"state.has_any({items!r}, player)"

            # Handle HasFromList rules (Rule Builder format)
            if rule_type == 'HasFromList':
                args = expr.get('args', {})
                items_raw = args.get('items', [])
                count = args.get('count', 1)
                # Resolve items if they're a complex expression (e.g., list(dict.values()))
                items = self._resolve_items_for_has_from_list(items_raw)
                # Generate count expression
                count_expr = self._generate_expression(count) if isinstance(count, dict) else str(count)
                return f"state.has_from_list({items!r}, player, {count_expr})"

            # Handle HasFromListUnique rules (Rule Builder format)
            if rule_type == 'HasFromListUnique':
                args = expr.get('args', {})
                items_raw = args.get('items', [])
                count = args.get('count', 1)
                # Resolve items if they're a complex expression
                items = self._resolve_items_for_has_from_list(items_raw)
                # Generate count expression
                count_expr = self._generate_expression(count) if isinstance(count, dict) else str(count)
                return f"state.has_from_list_unique({items!r}, player, {count_expr})"

            # Handle Not rules (Rule Builder format)
            if rule_type == 'Not':
                args = expr.get('args', {})
                condition = args.get('condition', {})
                condition_expr = self._generate_expression(condition)
                return f"not ({condition_expr})"

            # Handle True_/False_ rules
            if rule_type == 'True_':
                return 'True'
            if rule_type == 'False_':
                return 'False'

            # Handle OptionValue rules (Rule Builder format) - preserve as runtime check
            # This is critical for boss defeat rules that depend on game options like 'swordless'
            if rule_type == 'OptionValue':
                args = expr.get('args', {})
                option = args.get('option', '')
                return f'state.multiworld.worlds[player].options.{option}'

            # Handle SettingValue rules (Rule Builder format - legacy)
            if rule_type == 'SettingValue':
                args = expr.get('args', {})
                setting = args.get('setting', '')
                return self._expr_setting_value({'setting': setting})

            # Handle Tuple rules (Rule Builder format)
            if rule_type == 'Tuple':
                args = expr.get('args', {})
                # Support both 'value' (current format) and 'elements' (legacy)
                elements = args.get('value', args.get('elements', []))
                items = [self._generate_expression(e) for e in elements]
                if len(items) == 1:
                    return f"({items[0]},)"
                return f"({', '.join(items)})"

            # Handle List rules (Rule Builder format) - generate as tuple for
            # compatibility with location_item_name() which returns tuples
            if rule_type == 'List':
                args = expr.get('args', {})
                # Support both 'value' and 'elements' keys
                elements = args.get('value', args.get('elements', []))
                items = [self._generate_expression(e) for e in elements]
                if len(items) == 1:
                    return f"({items[0]},)"
                return f"({', '.join(items)})"

            # Handle Conditional rules (Rule Builder format)
            if rule_type == 'Conditional':
                args = expr.get('args', {})
                test = args.get('test')
                if_true = args.get('if_true')
                if_false = args.get('if_false')
                test_expr = self._generate_expression(test) if isinstance(test, dict) else repr(test)
                true_expr = self._generate_expression(if_true) if isinstance(if_true, dict) else repr(if_true)
                false_expr = self._generate_expression(if_false) if isinstance(if_false, dict) else repr(if_false)
                return f'(({true_expr}) if ({test_expr}) else ({false_expr}))'

            # Handle List rules (Rule Builder format for list comparisons)
            # Generate as tuple for compatibility with location_item_name()
            if rule_type == 'List':
                args = expr.get('args', {})
                value = args.get('value', [])
                elements = [self._generate_expression(v) if isinstance(v, dict) else repr(v) for v in value]
                if len(elements) == 1:
                    return f'({elements[0]},)'
                return f'({", ".join(elements)})'

            # Handle Python built-in functions that may have _original_ast_type marker
            # These should NOT be treated as helpers that take state/player args
            builtin_funcs = ('any', 'all', 'len', 'sum', 'min', 'max', 'sorted', 'list',
                           'set', 'tuple', 'iter', 'next', 'bool', 'int', 'str', 'float')
            if rule_type in builtin_funcs:
                args = expr.get('args', [])
                if args and isinstance(args, list):
                    arg_exprs = [self._generate_expression(a) for a in args]
                    return f'{rule_type}({", ".join(arg_exprs)})'
                return f'{rule_type}()'

            # Handle helper calls with _original_ast_type marker
            if expr.get('_original_ast_type', '').endswith('helper') or rule_type in self.known_helpers:
                helper_name = rule_type
                # Only generate function call if helper is known (has a definition)
                # Unknown helpers should return True as a placeholder to avoid NameError
                if helper_name in self.known_helpers:
                    func_name = self.get_function_name(helper_name)
                    # Check for args - this can be a list of arguments to pass to the helper
                    args = expr.get('args', [])
                    if args and isinstance(args, list):
                        arg_exprs = [self._generate_expression(a) for a in args]
                        return f'{func_name}(state, player, {", ".join(arg_exprs)})'
                    return f'{func_name}(state, player)'
                else:
                    # Unknown helper - return True as placeholder
                    # This makes locations more accessible, which is appropriate for worldgen
                    # since unknown helpers are typically progression checks
                    print(
                        f"LOSSY FALLBACK: Unknown helper '{helper_name}' in lambda expression, "
                        f"using True (always accessible) as fallback",
                        file=sys.stderr
                    )
                    return 'True'

            # Handle AST_placement_search (check if item is at any of listed locations)
            if rule_type == 'AST_placement_search':
                args = expr.get('args', {})
                item_name = args.get('item', '')
                locations = args.get('locations', [])
                # Build location pairs list for item_name_in_location_names
                self.uses_placement_lookup = True  # Also need this import
                loc_pairs = []
                for loc in locations:
                    if isinstance(loc, list) and loc:
                        loc_name = loc[0]
                        loc_player = loc[1] if len(loc) > 1 else 1
                        loc_pairs.append(f'({repr(loc_name)}, {loc_player})')
                    elif isinstance(loc, str):
                        loc_pairs.append(f'({repr(loc)}, player)')
                # Generate call to item_name_in_location_names for runtime lookup
                locs_str = f'[{", ".join(loc_pairs)}]'
                return f'item_name_in_location_names(state, {repr(item_name)}, player, {locs_str})'

            # Handle AST_setting_value (Rule Builder format for setting_value)
            if rule_type == 'AST_setting_value':
                args = expr.get('args', {})
                setting = args.get('setting', '')
                index = args.get('index')
                # Build a setting_value dict and use the existing handler
                setting_expr = {'setting': setting}
                if index is not None:
                    setting_expr['index'] = index
                return self._expr_setting_value(setting_expr)

            # Handle OptionValue (Rule Builder format for option_value)
            if rule_type == 'OptionValue':
                args = expr.get('args', {})
                option = args.get('option', '')
                index = args.get('index')
                # Build an option_value dict and use the existing handler
                option_expr = {'option': option}
                if index is not None:
                    option_expr['index'] = index
                return self._expr_option_value(option_expr)

            # Handle WorldAttribute (Rule Builder format for world_attribute)
            if rule_type == 'WorldAttribute':
                args = expr.get('args', {})
                attribute = args.get('attribute', '')
                index = args.get('index')
                # Build a world_attribute dict and use the existing handler
                attr_expr = {'attribute': attribute}
                if index is not None:
                    attr_expr['index'] = index
                return self._expr_world_attribute(attr_expr)

            # Handle Arithmetic rules (Rule Builder format for binary operations)
            if rule_type == 'Arithmetic':
                args = expr.get('args', {})
                left = args.get('left', 0)
                op = args.get('op', '+')
                right = args.get('right', 0)
                # Recursively generate expressions for operands
                left_expr = self._generate_expression(left) if isinstance(left, dict) else str(left)
                right_expr = self._generate_expression(right) if isinstance(right, dict) else str(right)
                return f"({left_expr} {op} {right_expr})"

            # Handle AST_placement_lookup (Rule Builder format for placement_lookup)
            if rule_type == 'AST_placement_lookup':
                args = expr.get('args', {})
                location = args.get('location', '')
                # Generate call to location_item_name for runtime lookup
                self.uses_placement_lookup = True
                return f'location_item_name(state, {repr(location)}, player)'

            # Handle AST_function_call - try to simplify or preserve structure
            if rule_type == 'AST_function_call':
                # This represents complex function call patterns
                args = expr.get('args', {})
                function = args.get('function', {})
                # Try to generate the function call expression
                if isinstance(function, dict):
                    # Special case: if the function is a helper, it already includes
                    # state and player in its signature and returns a bool directly.
                    # Original code like wizpig_1(world)(state) becomes wizpig_1(state, player)
                    # so we don't need to add extra () call.
                    if function.get('type') == 'helper':
                        helper_name = function.get('name', '')
                        if helper_name in self.known_helpers:
                            # The helper function already returns bool, not a callable
                            # Just generate the helper call directly
                            return self._generate_expression(function)

                    # Special case: if the function is a Rule Builder type that already
                    # produces a complete boolean expression (like CanReachEntrance,
                    # CanReachRegion, Has, And, Or, etc.), generate it directly without adding ().
                    # This happens when the analyzer wraps path_to_access_rule results.
                    func_rule = function.get('rule', '')
                    func_type = function.get('type', '')
                    # Check for Rule Builder types, 'helper' AST marker, or analyzer types
                    if func_rule in BOOLEAN_RULE_TYPES or func_rule == 'helper' or func_type in ANALYZER_BOOL_TYPES:
                        # These types already produce complete boolean expressions
                        return self._generate_expression(function)

                    # Check if this is a math or logging module function call
                    # and set the appropriate flags for imports
                    if function.get('type') == 'attribute':
                        obj = function.get('object', {})
                        if isinstance(obj, dict) and obj.get('type') == 'name':
                            obj_name = obj.get('name')
                            if obj_name == 'math':
                                self.uses_math = True
                            elif obj_name == 'logging':
                                self.uses_logging = True

                    func_expr = self._generate_expression(function)
                    # Function call arguments may be in 'call_args' or 'args' (nested)
                    call_args = args.get('call_args', []) or args.get('args', [])
                    arg_exprs = [self._generate_expression(a) for a in call_args]

                    # Special case: can_defeat() needs state as first argument
                    # The original ALTTP Boss.can_defeat(state) takes state as parameter
                    if func_expr.endswith('.can_defeat') and not arg_exprs:
                        arg_exprs = ['state']

                    # Special case: can_reach() on Region objects needs state as first argument
                    # Region.can_reach(state) takes state as parameter
                    if func_expr.endswith('.can_reach') and not arg_exprs:
                        arg_exprs = ['state']

                    # Special case: .to_bool() calls on options
                    # Original ALTTP code uses option.to_bool() but Archipelago options don't have this method.
                    # Convert to checking the option's truthiness by wrapping in bool().
                    if func_expr.endswith('.to_bool') and not arg_exprs:
                        # Remove '.to_bool' from the end and wrap in bool()
                        obj_expr = func_expr[:-8]  # len('.to_bool') == 8
                        return f'bool({obj_expr})'

                    return f'{func_expr}({", ".join(arg_exprs)})'
                return 'True'

            # Handle AST_capability (converts to helper function call)
            # Original: {"rule": "AST_capability", "args": {"capability": "defeat_enough_rbms", ...}}
            # Converts to: can_defeat_enough_rbms(state, player, ...)
            if rule_type == 'AST_capability':
                args = expr.get('args', {})
                capability = args.get('capability', '')
                if capability:
                    helper_name = f'can_{capability}'
                    func_name = self.get_function_name(helper_name)

                    # Check if helper_args were preserved from the original helper call
                    # This is critical for helpers like can_use_hat(state, player, hat_id)
                    # where the specific argument value matters
                    helper_args = args.get('helper_args', [])
                    if helper_args:
                        # Use the preserved helper arguments
                        arg_exprs = [self._generate_expression(arg) for arg in helper_args]
                        return f'{func_name}(state, player, {", ".join(arg_exprs)})'

                    # Fall back to param_mappings for helpers that use world attributes
                    helper_info = self.helper_data.get(helper_name, {})
                    params = helper_info.get('params', [])
                    param_mappings = helper_info.get('param_mappings', {})

                    # Build argument list based on param_mappings
                    # All param_mapping values are accessed as world attributes (not inlined)
                    # to enable proper param_mapping discovery during re-export.
                    # Option values referenced in param_mappings are stored as world
                    # attributes during extraction (see extract_all in extractors.py).
                    arg_exprs = []
                    for param in params:
                        if param in param_mappings:
                            setting_name = param_mappings[param]
                            # Access as world attribute for all param_mapping values
                            arg_exprs.append(f'state.multiworld.worlds[player].{setting_name}')
                        else:
                            # No mapping and no preserved args - use None as default
                            arg_exprs.append('None')

                    if arg_exprs:
                        return f'{func_name}(state, player, {", ".join(arg_exprs)})'
                    return f'{func_name}(state, player)'
                return 'True'

            # Handle CanReachRegion rules (Rule Builder format)
            # This is critical for lambda-based rules that contain region checks
            if rule_type == 'CanReachRegion':
                args = expr.get('args', {})
                region = args.get('region_name', '')
                if isinstance(region, dict):
                    # Region name is an expression, generate it
                    region_expr = self._generate_expression(region)
                    return f'state.can_reach_region({region_expr}, player)'
                return f'state.can_reach_region({repr(region)}, player)'

            # Handle CanReachLocation rules (Rule Builder format)
            if rule_type == 'CanReachLocation':
                args = expr.get('args', {})
                location = args.get('location_name', '')
                if isinstance(location, dict):
                    location_expr = self._generate_expression(location)
                    return f'state.can_reach_location({location_expr}, player)'
                return f'state.can_reach_location({repr(location)}, player)'

            # Handle CanReachEntrance rules (Rule Builder format)
            if rule_type == 'CanReachEntrance':
                args = expr.get('args', {})
                entrance = args.get('entrance_name', '')
                if isinstance(entrance, dict):
                    entrance_expr = self._generate_expression(entrance)
                    return f'state.can_reach({entrance_expr}, "Entrance", player)'
                return f'state.can_reach({repr(entrance)}, "Entrance", player)'

            # Handle AST_group_count rules (Rule Builder format for count_group)
            # These come from state.count_group() calls in access rules
            if rule_type == 'AST_group_count':
                args = expr.get('args', {})
                group = args.get('group', '')
                if isinstance(group, dict):
                    group_expr = self._generate_expression(group)
                    return f'state.count_group({group_expr}, player)'
                return f'state.count_group({repr(group)}, player)'

            # Handle CountGroup rules (Rule Builder format)
            if rule_type == 'CountGroup':
                args = expr.get('args', {})
                group = args.get('group', '')
                if isinstance(group, dict):
                    group_expr = self._generate_expression(group)
                    return f'state.count_group({group_expr}, player)'
                return f'state.count_group({repr(group)}, player)'

        # Unknown type - return True as placeholder
        # Returning True makes locations more accessible, which is appropriate for worldgen
        # since unknown types are typically progression checks that evaluate to true
        # under default/normal game settings
        return 'True'
