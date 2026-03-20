"""
Rule analysis mixin — static evaluation, variable manipulation, and AST block codegen.
"""

import copy
import logging
from typing import Any, Dict, List, Set, Optional

from ._codegen_utils import (
    ANALYZER_RUNTIME_TYPES,
    is_placement_lookup,
    extract_placement_location,
    check_placement_comparison,
    extract_items_from_list,
    escape_string,
    extract_constant,
    get_helper_function_name,
    generate_world_attribute_expr,
)


class RuleAnalysisMixin:
    """Mixin providing rule analysis and static evaluation methods."""

    # These attributes are expected to be defined on the main class.
    settings: Dict[str, Any]
    option_definitions: Dict[str, Any]
    required_imports: Set[str]
    known_helpers: Set[str]
    helper_bodies: Dict[str, Dict[str, Any]]
    game_name: str
    game_name_lower: str
    obtainable_items: Optional[Set[str]]
    placements: Dict[str, str]
    entrance_regions: Dict[str, str]
    entrance_connections: Dict[str, str]
    _current_location: Optional[str]
    _current_entrance: Optional[str]

    def _is_placement_comparison(self, rule: Dict[str, Any]) -> bool:
        """
        Check if a rule is a comparison involving placement data (list constants).

        Placement lookups get resolved to list constants like [item_name, player].
        These need static evaluation because JavaScript can't compare arrays by value.
        """
        if not isinstance(rule, dict):
            return False

        if rule.get('type') != 'compare':
            return False

        left = rule.get('left', {})
        right = rule.get('right', {})

        # Check if either side is a list constant (from resolved placement_lookup)
        def is_list_constant(r):
            return isinstance(r, dict) and r.get('type') == 'list'

        return is_list_constant(left) or is_list_constant(right)

    def _try_static_eval(self, rule: Dict[str, Any]) -> Optional[bool]:
        """
        Try to statically evaluate a rule to a boolean value.

        This is used to optimize conditionals at worldgen time when the test
        can be fully evaluated. Returns True, False, or None if can't evaluate.

        Args:
            rule: Rule dict to evaluate

        Returns:
            True, False, or None if the rule can't be statically evaluated
        """
        if not isinstance(rule, dict):
            return None

        rule_type = rule.get('type', '')

        if rule_type == 'constant':
            value = rule.get('value')
            if isinstance(value, bool):
                return value
            return None

        if rule_type == 'compare':
            left = self._try_static_value(rule.get('left', {}))
            right = self._try_static_value(rule.get('right', {}))
            op = rule.get('op', '==')

            if left is None or right is None:
                return None

            # Do deep comparison for lists/tuples
            if op == '==':
                return self._deep_equals(left, right)
            elif op == '!=':
                return not self._deep_equals(left, right)

            return None

        return None

    def _try_static_value(self, rule: Dict[str, Any]) -> Any:
        """
        Try to extract a static value from a rule.

        Returns the value or None if not statically evaluable.
        """
        if not isinstance(rule, dict):
            return None

        rule_type = rule.get('type', '')

        if rule_type == 'constant':
            return rule.get('value')

        if rule_type == 'list':
            values = []
            for item in rule.get('value', []):
                val = self._try_static_value(item)
                if val is None:
                    return None
                values.append(val)
            return values

        return None

    def _evaluate_compare_rule(self, arg: Dict[str, Any]) -> Optional[str]:
        """
        Evaluate a Compare rule to a boolean repr string if possible.

        Handles comparisons where one or both sides can be resolved to constants
        at generation time. This is particularly useful for option comparisons
        like `options.logic == "glitched"` which can be evaluated based on the
        settings values available during generation.

        Returns:
            'True' or 'False' if the comparison can be evaluated,
            None if the comparison cannot be fully resolved.
        """
        if not isinstance(arg, dict):
            return None

        # Handle both AST format (type='compare') and Rule Builder format (rule='Compare')
        arg_rule = arg.get('rule', '')
        arg_type = arg.get('type', '')

        if arg_rule == 'Compare':
            args = arg.get('args', {})
            left = args.get('left')
            op = args.get('op', '==')
            right = args.get('right')
        elif arg_type == 'compare':
            left = arg.get('left')
            op = arg.get('op', '==')
            right = arg.get('right')
        else:
            return None

        # Resolve left operand
        left_val = self._resolve_compare_operand(left)
        # Resolve right operand
        right_val = self._resolve_compare_operand(right)

        if left_val is None or right_val is None:
            return None

        # Handle Choice option comparisons where the setting value is numeric
        # but the comparison is against a string option key (e.g., logic == "glitched")
        # In this case, we need to convert the string to its numeric value
        if isinstance(left_val, int) and isinstance(right_val, str):
            # First try to get the setting name from the operand
            setting_name = self._get_setting_name_from_operand(left)
            if setting_name:
                converted = self._convert_option_key_to_value(setting_name, right_val)
                if converted is not None:
                    right_val = converted
            else:
                # If the operand was already resolved to a raw value, try all option definitions
                converted = self._try_convert_option_key_all_defs(left_val, right_val)
                if converted is not None:
                    right_val = converted
        elif isinstance(right_val, int) and isinstance(left_val, str):
            # Same for reversed operands
            setting_name = self._get_setting_name_from_operand(right)
            if setting_name:
                converted = self._convert_option_key_to_value(setting_name, left_val)
                if converted is not None:
                    left_val = converted
            else:
                # If the operand was already resolved to a raw value, try all option definitions
                converted = self._try_convert_option_key_all_defs(right_val, left_val)
                if converted is not None:
                    left_val = converted

        # Evaluate the comparison
        try:
            if op in ('==', 'eq'):
                result = left_val == right_val
            elif op in ('!=', 'ne', 'noteq'):
                result = left_val != right_val
            elif op in ('<', 'lt'):
                result = left_val < right_val
            elif op in ('<=', 'le', 'lte'):
                result = left_val <= right_val
            elif op in ('>', 'gt'):
                result = left_val > right_val
            elif op in ('>=', 'ge', 'gte'):
                result = left_val >= right_val
            elif op == 'in':
                result = left_val in right_val
            elif op in ('not in', 'notin'):
                result = left_val not in right_val
            else:
                return None
            return repr(result)
        except (TypeError, ValueError):
            return None

    def _get_setting_name_from_operand(self, operand: Any) -> Optional[str]:
        """Extract the setting name from a SettingValue/OptionValue operand."""
        if not isinstance(operand, dict):
            return None
        rule_type = operand.get('rule', '')
        ast_type = operand.get('type', '')

        if rule_type == 'SettingValue':
            return operand.get('args', {}).get('setting', '')
        if rule_type == 'OptionValue':
            return operand.get('args', {}).get('option', '')
        if ast_type == 'setting_value':
            return operand.get('setting', '')
        if ast_type == 'option_value':
            return operand.get('option', '')
        if rule_type == 'AST_setting_value':
            return operand.get('args', {}).get('setting', '')
        return None

    def _convert_option_key_to_value(self, setting_name: str, key: str) -> Optional[int]:
        """
        Convert an option key string (like 'glitched') to its numeric value.

        For Choice options, keys map to values via option_<key> = <value> pattern.
        This looks up the option definition to find the mapping.
        """
        # Check option_definitions if available
        if hasattr(self, 'option_definitions') and setting_name in self.option_definitions:
            opt_def = self.option_definitions[setting_name]
            # name_lookup maps int -> string, so we need to reverse it
            name_lookup = opt_def.get('name_lookup', {})
            for int_val, str_key in name_lookup.items():
                if str_key == key:
                    return int(int_val)
            # Also try choices format (string -> int) for compatibility
            choices = opt_def.get('choices', {})
            if key in choices:
                return choices[key]
        return None

    def _try_convert_option_key_all_defs(self, int_val: int, str_key: str) -> Optional[int]:
        """
        Try to convert a string option key to its numeric value by checking all option definitions.

        This is used when the Compare operand was already resolved to a raw integer value
        (e.g., the exporter resolved options.logic to 1), and we need to find if the string
        matches this value in any option definition.

        Returns the integer value if a match is found, None otherwise.
        """
        if not hasattr(self, 'option_definitions'):
            return None

        for setting_name, opt_def in self.option_definitions.items():
            # Check name_lookup (int -> string mapping)
            name_lookup = opt_def.get('name_lookup', {})
            for defined_int, defined_str in name_lookup.items():
                if defined_str == str_key and int(defined_int) == int_val:
                    # Found a match: the string key maps to the same int value
                    return int_val
            # Also try choices format (string -> int)
            choices = opt_def.get('choices', {})
            if str_key in choices and choices[str_key] == int_val:
                return int_val
        return None

    def _resolve_compare_operand(self, operand: Any) -> Any:
        """
        Resolve a compare operand to a concrete value if possible.

        Handles:
        - Raw values (strings, numbers, bools)
        - Constant rules (AST and Rule Builder formats)
        - SettingValue rules (resolves from self.settings)
        - OptionValue rules (resolves from self.settings)
        - WorldAttribute rules (resolves from self.world_attributes)
        """
        if operand is None:
            return None

        # Raw value
        if not isinstance(operand, dict):
            return operand

        rule_type = operand.get('rule', '')
        ast_type = operand.get('type', '')

        # Constant values
        if rule_type == 'Constant':
            return operand.get('args', {}).get('value')
        if ast_type == 'constant':
            return operand.get('value')

        # Setting/Option values
        if rule_type == 'SettingValue':
            setting = operand.get('args', {}).get('setting', '')
            return self.settings.get(setting)
        if rule_type == 'OptionValue':
            option = operand.get('args', {}).get('option', '')
            return self.settings.get(option)
        if ast_type == 'setting_value':
            setting = operand.get('setting', '')
            return self.settings.get(setting)
        if ast_type == 'option_value':
            option = operand.get('option', '')
            return self.settings.get(option)
        if rule_type == 'AST_setting_value':
            setting = operand.get('args', {}).get('setting', '')
            return self.settings.get(setting)

        # World attributes
        if rule_type == 'WorldAttribute':
            attribute = operand.get('args', {}).get('attribute', '')
            return self.world_attributes.get(attribute)
        if ast_type == 'world_attribute':
            attribute = operand.get('attribute', '')
            return self.world_attributes.get(attribute)

        return None

    def _evaluate_arithmetic_constant(self, arg: Dict[str, Any]) -> Optional[str]:
        """
        Evaluate an Arithmetic rule to a constant repr string if possible.

        Returns repr(result) if both operands are numeric constants,
        'None' if evaluation fails or operands aren't constants,
        or None if arg is not an Arithmetic rule.
        """
        if not isinstance(arg, dict):
            return None
        if arg.get('rule') != 'Arithmetic':
            return None

        arith_args = arg.get('args', {})
        left = arith_args.get('left')
        op = arith_args.get('op', '+')
        right = arith_args.get('right')

        # Try to evaluate if both operands are numeric constants
        if not (isinstance(left, (int, float)) and isinstance(right, (int, float))):
            return 'None'

        try:
            if op == '+':
                result = left + right
            elif op == '-':
                result = left - right
            elif op == '*':
                result = left * right
            elif op == '/':
                result = left / right
            elif op == '//':
                result = left // right
            elif op == '%':
                result = left % right
            elif op == '**':
                result = left ** right
            else:
                return 'None'
            return repr(result)
        except (ZeroDivisionError, TypeError, ValueError):
            return 'None'

    def _evaluate_binary_op_constant(self, arg: Dict[str, Any]) -> Optional[str]:
        """
        Evaluate an AST-format binary_op to a constant repr string if possible.

        This handles the AST format:
        {"type": "binary_op", "left": {...}, "op": "*", "right": {...}}

        Returns repr(result) if both operands are numeric constants,
        'None' if evaluation fails or operands aren't constants,
        or None if arg is not a binary_op.
        """
        if not isinstance(arg, dict):
            return None
        if arg.get('type') != 'binary_op':
            return None

        left_node = arg.get('left', {})
        op = arg.get('op', '+')
        right_node = arg.get('right', {})

        # Extract values from operand nodes
        left = self._extract_constant_value(left_node)
        right = self._extract_constant_value(right_node)

        # Both operands must be numeric constants
        if not (isinstance(left, (int, float)) and isinstance(right, (int, float))):
            return 'None'

        try:
            if op == '+':
                result = left + right
            elif op == '-':
                result = left - right
            elif op == '*':
                result = left * right
            elif op == '/':
                result = left / right
            elif op == '//':
                result = left // right
            elif op == '%':
                result = left % right
            elif op == '**':
                result = left ** right
            else:
                return 'None'
            return repr(result)
        except (ZeroDivisionError, TypeError, ValueError):
            return 'None'

    def _deep_equals(self, a: Any, b: Any) -> bool:
        """Deep equality comparison that works with lists."""
        if type(a) != type(b):
            return False
        if isinstance(a, list):
            if len(a) != len(b):
                return False
            return all(self._deep_equals(x, y) for x, y in zip(a, b))
        return a == b

    def _substitute_names(self, rule: Dict[str, Any], name_map: Dict[str, Any]) -> Dict[str, Any]:
        """
        Substitute name references in a rule with the corresponding expressions.

        This is used when inlining helper functions to replace parameter names
        with the actual argument expressions.

        Args:
            rule: Rule dict to process
            name_map: Mapping from name strings to their replacement expressions

        Returns:
            Rule dict with name references substituted
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type', '')

        # If this is a name reference and it's in our map, replace it
        if rule_type == 'name':
            name = rule.get('name', '')
            if name in name_map:
                # Return a deep copy of the replacement to avoid shared references
                return copy.deepcopy(name_map[name])
            return rule

        # For other rule types, recursively substitute in nested rules
        result = dict(rule)
        for key, value in rule.items():
            if isinstance(value, dict):
                result[key] = self._substitute_names(value, name_map)
            elif isinstance(value, list):
                result[key] = [
                    self._substitute_names(item, name_map) if isinstance(item, dict) else item
                    for item in value
                ]
        return result

    def _find_assigned_names(self, rule: Dict[str, Any]) -> Set[str]:
        """
        Find all variable names that are assigned in a rule.

        This is used when inlining helpers to identify local variables
        that need to be renamed to avoid collision with the outer scope.

        Args:
            rule: Rule dict to scan

        Returns:
            Set of variable names that are assigned
        """
        assigned = set()

        if not isinstance(rule, dict):
            return assigned

        rule_type = rule.get('type', '')

        # Check for assign statements
        if rule_type == 'assign':
            var_name = rule.get('var') or rule.get('name')
            if var_name:
                assigned.add(var_name)

        # Check for augmented assign statements (+=, -=, etc.)
        if rule_type == 'aug_assign':
            var_name = rule.get('target')
            if var_name:
                assigned.add(var_name)

        # Recursively scan nested rules
        for key, value in rule.items():
            if isinstance(value, dict):
                assigned.update(self._find_assigned_names(value))
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        assigned.update(self._find_assigned_names(item))

        return assigned

    def _rename_local_variables(self, rule: Dict[str, Any], prefix: str) -> Dict[str, Any]:
        """
        Rename all local variables in a rule to avoid collisions when inlining.

        This finds all assigned variable names and renames both the assignments
        and all references to those variables.

        Args:
            rule: Rule dict to process
            prefix: Unique prefix to add to variable names

        Returns:
            Rule dict with renamed variables
        """
        # Find all assigned variable names
        assigned_names = self._find_assigned_names(rule)

        if not assigned_names:
            return rule

        # Create rename map
        rename_map = {name: f"{prefix}{name}" for name in assigned_names}

        # Apply renaming to both assignments and references
        return self._apply_rename(rule, rename_map)

    def _apply_rename(self, rule: Dict[str, Any], rename_map: Dict[str, str]) -> Dict[str, Any]:
        """
        Apply variable renaming to a rule.

        Args:
            rule: Rule dict to process
            rename_map: Mapping from old names to new names

        Returns:
            Rule dict with renamed variables
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type', '')
        result = dict(rule)

        # Handle assign statements - rename the target variable
        if rule_type == 'assign':
            var_name = result.get('var') or result.get('name')
            if var_name and var_name in rename_map:
                if 'var' in result:
                    result['var'] = rename_map[var_name]
                if 'name' in result:
                    result['name'] = rename_map[var_name]

        # Handle augmented assign statements - rename the target variable
        if rule_type == 'aug_assign':
            var_name = result.get('target')
            if var_name and var_name in rename_map:
                result['target'] = rename_map[var_name]

        # Handle name references
        if rule_type == 'name':
            name = result.get('name', '')
            if name in rename_map:
                result['name'] = rename_map[name]

        # Recursively process nested rules
        for key, value in rule.items():
            if key in ('var', 'name') and rule_type in ('assign', 'name'):
                # Already handled above
                continue
            if key == 'target' and rule_type == 'aug_assign':
                # Already handled above
                continue
            if isinstance(value, dict):
                result[key] = self._apply_rename(value, rename_map)
            elif isinstance(value, list):
                result[key] = [
                    self._apply_rename(item, rename_map) if isinstance(item, dict) else item
                    for item in value
                ]

        return result

    def _convert_ast_block(self, rule: Dict[str, Any]) -> str:
        """Convert an AST_block rule to Python Rule Builder expression.

        AST_block represents Python code blocks with statements. Common patterns include:
        - is_auto_scroll checks: assigns level_id, checks Cancel Auto Scroll, returns comparison
        - has_level_progression checks: counts items with x2 multipliers

        For worldgen worlds, we need to evaluate these blocks at generation time since
        they often reference game options that won't exist at runtime.

        Strategy:
        1. Look for return statements and try to evaluate them
        2. If the block references a missing setting_value, default to False
        3. For unknown patterns, default to False (conservative - makes locations accessible)
        """
        args = rule.get('args', {})
        statements = args.get('statements', [])

        # Try to find and evaluate the block
        return self._evaluate_ast_block_statements(statements)

    def _evaluate_ast_block_statements(self, statements: List[Dict[str, Any]]) -> str:
        """Evaluate a list of AST statements and return the result.

        For blocks that reference missing settings (like sprite_data, auto_scroll_levels),
        we default to True_() (accessible) since:
        - Most setting checks are "is feature X enabled" type checks
        - Defaulting to True means locations are accessible when we can't evaluate
        - This matches the original game behavior with default settings
        """
        # Check if this block contains state_method calls that need runtime evaluation
        if self._contains_state_method(statements):
            result = self._generate_runtime_ast_block(statements)
            if result is not None:
                return result

        # Track variable assignments for substitution
        local_vars: Dict[str, Any] = {}
        # Track if block references missing settings
        has_missing_settings = False

        for stmt in statements:
            stmt_type = stmt.get('type', '')

            if stmt_type == 'assign':
                # Track variable assignment
                name = stmt.get('name', '')
                value = stmt.get('value', {})
                value_type = value.get('type', '')

                if value_type == 'constant':
                    local_vars[name] = value.get('value')
                elif value_type == 'setting_value':
                    # Look up setting value from resolved settings
                    setting_name = value.get('setting', '')
                    if setting_name in self.settings:
                        local_vars[name] = self.settings[setting_name]
                    else:
                        has_missing_settings = True
                        local_vars[name] = 0
                elif value_type == 'subscript':
                    # Evaluate subscript (e.g., [200, 400, 600][swim_rule % 3])
                    subscript_value = value.get('value', {})
                    subscript_index = value.get('index', {})

                    # Get the array/value
                    arr = None
                    if subscript_value.get('type') == 'constant':
                        arr = subscript_value.get('value')

                    # Get the index
                    idx = self._try_evaluate_expr(subscript_index, local_vars)

                    # Handle binary_op index (e.g., swim_rule % 3)
                    if idx is None and subscript_index.get('type') == 'binary_op':
                        left = self._try_evaluate_expr(subscript_index.get('left', {}), local_vars)
                        right = self._try_evaluate_expr(subscript_index.get('right', {}), local_vars)
                        op = subscript_index.get('op', '')
                        if left is not None and right is not None:
                            try:
                                if op == '%':
                                    idx = left % right
                                elif op == '+':
                                    idx = left + right
                                elif op == '-':
                                    idx = left - right
                                elif op == '*':
                                    idx = left * right
                                elif op == '//':
                                    idx = left // right
                            except (TypeError, ZeroDivisionError):
                                pass

                    if arr is not None and idx is not None:
                        try:
                            if isinstance(arr, (list, tuple)):
                                local_vars[name] = arr[int(idx)]
                            elif isinstance(arr, dict):
                                local_vars[name] = arr[idx]
                        except (IndexError, KeyError, TypeError):
                            local_vars[name] = 0
                    else:
                        local_vars[name] = 0
                else:
                    # Complex assignment - check if it references missing settings
                    if self._references_missing_setting(value):
                        has_missing_settings = True
                        # For variables like 'sharks' that count from sprite_data,
                        # assume 0 (no blocking elements)
                        local_vars[name] = 0

            elif stmt_type == 'aug_assign':
                # Handle augmented assignment: {"type": "aug_assign", "target": ..., "op": ..., "value": ...}
                name = stmt.get('target', '')
                op = stmt.get('op', '+')
                value = stmt.get('value', {})

                # Try to evaluate the value
                eval_value = self._try_evaluate_expr(value, local_vars)

                if name in local_vars and eval_value is not None:
                    try:
                        if op == '+':
                            local_vars[name] = local_vars[name] + eval_value
                        elif op == '-':
                            local_vars[name] = local_vars[name] - eval_value
                        elif op == '*':
                            local_vars[name] = local_vars[name] * eval_value
                        elif op == '/':
                            local_vars[name] = local_vars[name] / eval_value
                        elif op == '//':
                            local_vars[name] = local_vars[name] // eval_value
                        elif op == '%':
                            local_vars[name] = local_vars[name] % eval_value
                    except (TypeError, ZeroDivisionError):
                        pass

            elif stmt_type == 'if_statement':
                # Try to evaluate if statements that return early
                test = stmt.get('test', {})
                body = stmt.get('body', [])

                # Check for patterns like: if has_item or not variable
                # If variable is 0 (our default), "not variable" is True
                if self._can_evaluate_if_test(test, local_vars):
                    test_result = self._evaluate_if_test(test, local_vars)
                    if test_result:
                        # If test is true, evaluate the body
                        for body_stmt in body:
                            if body_stmt.get('type') == 'return':
                                return self._evaluate_ast_return_value(body_stmt.get('value', {}), local_vars)

            elif stmt_type == 'return':
                # Evaluate the return value
                result = self._evaluate_ast_return_value(stmt.get('value', {}), local_vars)
                # If the result is False and we have missing settings,
                # that might be incorrect - but keep it for now
                return result

        # No return statement found or couldn't evaluate
        # Default to True (accessible) when we can't determine
        self.required_imports.add('True_')
        return 'True_()'

    def _references_missing_setting(self, value: Dict[str, Any]) -> bool:
        """Check if an expression references a missing setting."""
        if not isinstance(value, dict):
            return False

        if value.get('type') == 'setting_value':
            setting_name = value.get('setting', '')
            return setting_name not in self.settings

        # Check nested structures
        for v in value.values():
            if isinstance(v, dict) and self._references_missing_setting(v):
                return True
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, dict) and self._references_missing_setting(item):
                        return True
        return False

    def _can_evaluate_if_test(self, test: Dict[str, Any], local_vars: Dict[str, Any]) -> bool:
        """Check if we can evaluate an if statement test."""
        test_type = test.get('type', '')

        if test_type == 'or':
            # Can evaluate if any condition can be evaluated to True
            conditions = test.get('conditions', [])
            for cond in conditions:
                if cond.get('type') == 'not':
                    inner = cond.get('condition') or cond.get('operand', {})
                    if inner.get('type') == 'name' and inner.get('name') in local_vars:
                        return True
                elif cond.get('type') == 'item_check':
                    return True
            return False

        if test_type == 'not':
            inner = test.get('condition') or test.get('operand', {})
            if inner.get('type') == 'name' and inner.get('name') in local_vars:
                return True

        # Handle compare type (e.g., swim_rule > 2)
        if test_type == 'compare':
            left = test.get('left', {})
            right = test.get('right', {})
            # Can evaluate if both operands can be resolved
            left_val = self._try_evaluate_expr(left, local_vars)
            right_val = self._try_evaluate_expr(right, local_vars)
            if left_val is not None and right_val is not None:
                return True

        return False

    def _evaluate_if_test(self, test: Dict[str, Any], local_vars: Dict[str, Any]) -> bool:
        """Evaluate an if statement test."""
        test_type = test.get('type', '')

        if test_type == 'or':
            conditions = test.get('conditions', [])
            for cond in conditions:
                if cond.get('type') == 'not':
                    inner = cond.get('condition') or cond.get('operand', {})
                    if inner.get('type') == 'name':
                        var_name = inner.get('name')
                        var_val = local_vars.get(var_name, 0)
                        if not var_val:  # not 0 = True
                            return True
                # For item_check conditions, assume player doesn't have items
                # This makes us continue to check other paths
            return False

        if test_type == 'not':
            inner = test.get('condition') or test.get('operand', {})
            if inner.get('type') == 'name':
                var_name = inner.get('name')
                var_val = local_vars.get(var_name, 0)
                return not var_val

        # Handle compare type (e.g., swim_rule > 2)
        if test_type == 'compare':
            left = test.get('left', {})
            right = test.get('right', {})
            op = test.get('op', '')
            left_val = self._try_evaluate_expr(left, local_vars)
            right_val = self._try_evaluate_expr(right, local_vars)
            if left_val is not None and right_val is not None:
                return self._evaluate_comparison(left_val, op, right_val)

        return False

    def _evaluate_ast_return_value(self, value: Dict[str, Any], local_vars: Dict[str, Any]) -> str:
        """Evaluate an AST return value expression."""
        value_type = value.get('type', '')

        if value_type == 'constant':
            const_val = value.get('value')
            if isinstance(const_val, bool):
                self.required_imports.add('True_' if const_val else 'False_')
                return 'True_()' if const_val else 'False_()'
            return repr(const_val)

        # Handle variable references - look up in local_vars
        if value_type == 'name':
            var_name = value.get('name', '')
            if var_name in local_vars:
                var_val = local_vars[var_name]
                if isinstance(var_val, bool):
                    self.required_imports.add('True_' if var_val else 'False_')
                    return 'True_()' if var_val else 'False_()'
                elif isinstance(var_val, (int, float)):
                    return repr(var_val)
            # Variable not found - return 0 as safe numeric default
            return '0'

        if value_type == 'compare':
            # Comparison like: auto_scroll_levels[level_id] > 0
            left = value.get('left', {})
            op = value.get('op', '')
            right = value.get('right', {})

            # Check if this is a setting_value subscript comparison
            if left.get('type') == 'subscript':
                subscript_value = left.get('value', {})

                # Check for setting_value (like auto_scroll_levels)
                if subscript_value.get('type') == 'setting_value':
                    setting_name = subscript_value.get('setting', '')

                    # If the setting exists, try to evaluate
                    if setting_name in self.settings:
                        setting_data = self.settings[setting_name]
                        # Get the index
                        index = left.get('index', {})
                        index_val = None
                        if index.get('type') == 'constant':
                            index_val = index.get('value')
                        elif index.get('type') == 'name':
                            index_val = local_vars.get(index.get('name'))

                        if index_val is not None and isinstance(setting_data, (dict, list)):
                            try:
                                actual_value = setting_data[index_val] if isinstance(setting_data, dict) else setting_data[int(index_val)]
                                right_val = right.get('value', 0) if right.get('type') == 'constant' else 0

                                # Evaluate the comparison
                                result = self._evaluate_comparison(actual_value, op, right_val)
                                self.required_imports.add('True_' if result else 'False_')
                                return 'True_()' if result else 'False_()'
                            except (KeyError, IndexError, TypeError):
                                pass

                    # Setting not found or can't evaluate - default to False
                    # For auto_scroll checks, False means no auto-scroll, which is the most accessible case
                    self.required_imports.add('False_')
                    return 'False_()'

            # Try to evaluate other comparisons
            left_val = self._try_evaluate_expr(left, local_vars)
            right_val = self._try_evaluate_expr(right, local_vars)

            if left_val is not None and right_val is not None:
                result = self._evaluate_comparison(left_val, op, right_val)
                self.required_imports.add('True_' if result else 'False_')
                return 'True_()' if result else 'False_()'

        # Can't evaluate - default to True (accessible) to avoid blocking locations
        # Note: This may allow access to locations that should have stricter rules,
        # but it's better than permanently blocking locations the player should reach.
        self.required_imports.add('True_')
        return 'True_()'

    def _try_evaluate_expr(self, expr: Dict[str, Any], local_vars: Dict[str, Any]) -> Any:
        """Try to evaluate an expression to a constant value."""
        expr_type = expr.get('type', '')

        if expr_type == 'constant':
            return expr.get('value')

        if expr_type == 'name':
            return local_vars.get(expr.get('name'))

        return None

    def _evaluate_comparison(self, left: Any, op: str, right: Any) -> bool:
        """Evaluate a comparison operation."""
        try:
            if op == '>':
                return left > right
            elif op == '<':
                return left < right
            elif op == '>=':
                return left >= right
            elif op == '<=':
                return left <= right
            elif op == '==' or op == 'eq':
                return left == right
            elif op == '!=' or op == 'ne':
                return left != right
        except TypeError:
            pass
        return False

    def _contains_state_method(self, statements: List[Dict[str, Any]]) -> bool:
        """Check if any statement contains runtime-dependent checks like item_check or state_method."""
        def check_value(value: Any) -> bool:
            if not isinstance(value, dict):
                return False
            if value.get('type') in ANALYZER_RUNTIME_TYPES:
                return True
            # Check nested structures
            for v in value.values():
                if isinstance(v, dict) and check_value(v):
                    return True
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, dict) and check_value(item):
                            return True
            return False

        for stmt in statements:
            stmt_type = stmt.get('type', '')
            if stmt_type == 'for_range':
                # Check count expression and body
                if check_value(stmt.get('count', {})):
                    return True
                for body_stmt in stmt.get('body', []):
                    if check_value(body_stmt):
                        return True
            elif stmt_type == 'assign':
                if check_value(stmt.get('value', {})):
                    return True
            elif stmt_type == 'return':
                if check_value(stmt.get('value', {})):
                    return True
        return False

    def _generate_runtime_ast_block(self, statements: List[Dict[str, Any]],
                                       initial_vars: Dict[str, str] = None,
                                       is_nested: bool = False) -> Optional[str]:
        """Generate a Rule Builder expression for AST blocks with runtime-dependent state_method calls.

        This handles patterns like shapez belt speed calculation:
        - multiplier = 1.0
        - for _ in range(count("Rising Belt Upgrade")): multiplier *= 2
        - multiplier += count("Gigantic Belt Upgrade") * 10
        - multiplier += count("Big Belt Upgrade")
        - multiplier += count("Small Belt Upgrade") * 0.1
        - return multiplier >= 1.6

        This is converted to:
        Compare(
            Arithmetic(Arithmetic(2, "**", CountItem("Rising Belt Upgrade")), "+", ...),
            ">=",
            1.6
        )

        Args:
            statements: List of statement dicts in AST format
            initial_vars: Optional dict of variable names to their current expression values
                         (for processing nested blocks that need access to outer scope)
            is_nested: If True, this is a nested block within an expression. In this case,
                      we should NOT accumulate conditions from "if condition: return False" patterns,
                      as those only make sense at the top level for accessibility rules.
        """
        # Track symbolic expressions for variables
        # Each variable maps to a string representing its Rule Builder expression
        var_expressions: Dict[str, str] = dict(initial_vars) if initial_vars else {}

        for stmt in statements:
            stmt_type = stmt.get('type', '')

            if stmt_type == 'assign':
                name = stmt.get('name', '')
                value = stmt.get('value', {})
                op = stmt.get('op', None)  # None for =, "*=" for *=, "+=" for +=

                if op is None:
                    # Simple assignment: var = expr
                    expr = self._expr_to_rule_builder(value, var_expressions)
                    if expr is None:
                        return None
                    var_expressions[name] = expr
                elif op == '+=':
                    # Augmented addition: var += expr
                    if name not in var_expressions:
                        return None
                    right_expr = self._expr_to_rule_builder(value, var_expressions)
                    if right_expr is None:
                        return None
                    self.required_imports.add('Arithmetic')
                    var_expressions[name] = f'Arithmetic({var_expressions[name]}, "+", {right_expr})'
                elif op == '*=':
                    # Augmented multiplication: var *= expr
                    if name not in var_expressions:
                        return None
                    right_expr = self._expr_to_rule_builder(value, var_expressions)
                    if right_expr is None:
                        return None
                    self.required_imports.add('Arithmetic')
                    var_expressions[name] = f'Arithmetic({var_expressions[name]}, "*", {right_expr})'
                else:
                    # Unsupported operator
                    return None

            elif stmt_type == 'aug_assign':
                # Handle augmented assignment in separate format: {"type": "aug_assign", "target": ..., "op": ..., "value": ...}
                name = stmt.get('target', '')
                op = stmt.get('op', '+')  # +, -, *, /
                value = stmt.get('value', {})

                if name not in var_expressions:
                    return None
                right_expr = self._expr_to_rule_builder(value, var_expressions)
                if right_expr is None:
                    return None
                self.required_imports.add('Arithmetic')
                var_expressions[name] = f'Arithmetic({var_expressions[name]}, "{op}", {right_expr})'

            elif stmt_type == 'for_range':
                # Handle: for _ in range(count): body
                # Special case: for _ in range(count("Item")): var *= constant
                # This is equivalent to: var = var * (constant ** count("Item"))
                count_expr = stmt.get('count', {})
                body = stmt.get('body', [])
                loop_var = stmt.get('var', '_')

                # We only handle simple bodies with a single *= assignment
                if len(body) != 1:
                    return None
                body_stmt = body[0]
                if body_stmt.get('type') != 'assign' or body_stmt.get('op') != '*=':
                    return None

                var_name = body_stmt.get('name', '')
                mult_value = body_stmt.get('value', {})

                if mult_value.get('type') != 'constant':
                    return None

                multiplier = mult_value.get('value')
                if var_name not in var_expressions:
                    return None

                # Convert: var *= multiplier (n times) to: var = (multiplier ** n) * initial_value
                # But we need the base value before the for loop
                # Since for_range multiplies n times, the result is: initial * (multiplier ** n)
                # If initial is a constant (like 1.0), this simplifies to: multiplier ** n

                count_rule = self._expr_to_rule_builder(count_expr, var_expressions)
                if count_rule is None:
                    return None

                # Check if current var value is a simple constant we can handle
                current_expr = var_expressions[var_name]
                try:
                    initial_val = float(current_expr)
                except (ValueError, TypeError):
                    # Current expression is not a simple constant
                    # Generate: initial_expr * (multiplier ** count)
                    self.required_imports.add('Arithmetic')
                    var_expressions[var_name] = f'Arithmetic({current_expr}, "*", Arithmetic({multiplier}, "**", {count_rule}))'
                    continue

                # Initial value is a constant
                if initial_val == 1.0:
                    # 1.0 * (multiplier ** n) = multiplier ** n
                    self.required_imports.add('Arithmetic')
                    var_expressions[var_name] = f'Arithmetic({multiplier}, "**", {count_rule})'
                else:
                    # initial * (multiplier ** n)
                    self.required_imports.add('Arithmetic')
                    var_expressions[var_name] = f'Arithmetic({initial_val}, "*", Arithmetic({multiplier}, "**", {count_rule}))'

            elif stmt_type == 'if_statement':
                # Handle if_statement with early returns
                # We need to check if the condition can be evaluated at codegen time
                # If the condition involves only constants and known variables, evaluate it
                # If it involves item_checks, generate a conditional rule
                test = stmt.get('test', {})
                body = stmt.get('body', [])
                orelse = stmt.get('orelse', [])

                # Try to evaluate the test as a constant
                test_result = self._try_evaluate_if_test_constant(test, var_expressions)

                if test_result is True:
                    # Test is always true, process the body
                    for body_stmt in body:
                        if body_stmt.get('type') == 'return':
                            return self._expr_to_rule_builder(body_stmt.get('value', {}), var_expressions)
                    # Continue to process remaining statements if no return in body
                elif test_result is False:
                    # Test is always false, skip the body and process orelse
                    for orelse_stmt in orelse:
                        if orelse_stmt.get('type') == 'return':
                            return self._expr_to_rule_builder(orelse_stmt.get('value', {}), var_expressions)
                    # Continue to process remaining statements
                else:
                    # Test contains runtime-dependent parts, we need to generate conditional logic
                    # Check if body contains a return False
                    body_returns_false = (
                        len(body) == 1 and
                        body[0].get('type') == 'return' and
                        body[0].get('value', {}).get('type') == 'constant' and
                        body[0].get('value', {}).get('value') is False
                    )

                    if body_returns_false and not is_nested:
                        # Pattern: if condition: return False
                        # This means: not condition is required for accessibility
                        # Note: only accumulate conditions at top level, not in nested blocks
                        test_expr = self._expr_to_rule_builder(test, var_expressions)
                        if test_expr is not None:
                            # We'll need to incorporate this check later
                            # For now, store it as a required condition (negated)
                            self.required_imports.add('Not')
                            if 'required_conditions' not in var_expressions:
                                var_expressions['required_conditions'] = []
                            # Add the negated condition to requirements
                            var_expressions.setdefault('_conditions', []).append(f'Not({test_expr})')

            elif stmt_type == 'return':
                value = stmt.get('value', {})
                # Use the general expression converter
                result_expr = self._expr_to_rule_builder(value, var_expressions)
                if result_expr is not None:
                    # If we accumulated conditions, combine them with the result
                    # but only at top level (not in nested blocks)
                    conditions = var_expressions.get('_conditions', [])
                    if conditions and not is_nested:
                        # Combine all conditions with And, filtering True/False values
                        all_conditions = conditions + [result_expr]
                        # Filter out True values and short-circuit on False
                        filtered = []
                        for c in all_conditions:
                            if c == 'False' or c == 'False_()':
                                self.required_imports.add('False_')
                                return 'False_()'
                            if c == 'True' or c == 'True_()':
                                continue
                            filtered.append(c)
                        if not filtered:
                            self.required_imports.add('True_')
                            return 'True_()'
                        if len(filtered) == 1:
                            return filtered[0]
                        return ' & '.join(f'({c})' for c in filtered)
                    return result_expr
                return None

        # No return statement found
        return None

    def _try_evaluate_if_test_constant(self, test: Dict[str, Any], var_expressions: Dict[str, str]) -> Optional[bool]:
        """Try to evaluate an if test as a constant boolean.

        Returns True if test is always true, False if always false, None if it depends on runtime state.
        """
        test_type = test.get('type', '')

        if test_type == 'constant':
            return bool(test.get('value'))

        if test_type == 'name':
            name = test.get('name', '')
            if name in var_expressions:
                # Try to evaluate the variable's value as a constant
                try:
                    val = eval(var_expressions[name])
                    return bool(val)
                except:
                    pass
            return None

        if test_type == 'and':
            conditions = test.get('conditions', [])
            all_true = True
            for cond in conditions:
                result = self._try_evaluate_if_test_constant(cond, var_expressions)
                if result is False:
                    return False  # Short-circuit: any False means and is False
                if result is None:
                    all_true = False  # Can't determine this condition
            return True if all_true else None

        if test_type == 'or':
            conditions = test.get('conditions', [])
            all_false = True
            for cond in conditions:
                result = self._try_evaluate_if_test_constant(cond, var_expressions)
                if result is True:
                    return True  # Short-circuit: any True means or is True
                if result is None:
                    all_false = False  # Can't determine this condition
            return False if all_false else None

        if test_type == 'not':
            inner = self._try_evaluate_if_test_constant(test.get('condition') or test.get('operand', {}), var_expressions)
            if inner is None:
                return None
            return not inner

        if test_type == 'compare':
            left = self._try_eval_constant(test.get('left', {}), var_expressions)
            right = self._try_eval_constant(test.get('right', {}), var_expressions)
            op = test.get('op', '')
            if left is None or right is None:
                return None
            try:
                if op == '==':
                    return left == right
                elif op == '!=':
                    return left != right
                elif op == '<':
                    return left < right
                elif op == '<=':
                    return left <= right
                elif op == '>':
                    return left > right
                elif op == '>=':
                    return left >= right
            except:
                pass
            return None

        # Types that depend on runtime state
        if test_type in ANALYZER_RUNTIME_TYPES:
            return None

        return None

    def _try_eval_constant(self, expr: Dict[str, Any], var_expressions: Dict[str, str]) -> Optional[Any]:
        """Try to evaluate an expression to a Python value at codegen time.

        Returns the evaluated value, or None if the expression contains runtime dependencies.
        This is used for compile-time evaluation of constant expressions like math.sqrt(x**2 + z**2).
        """
        if not isinstance(expr, dict):
            return expr

        expr_type = expr.get('type', '')

        if expr_type == 'constant':
            return expr.get('value')

        if expr_type == 'name':
            name = expr.get('name', '')
            if name in var_expressions:
                try:
                    return eval(var_expressions[name])
                except:
                    pass
            # Also check settings for name lookups (for setting names like 'swim_rule')
            if name in self.settings:
                return self.settings[name]
            return None

        if expr_type == 'binary_op':
            left = self._try_eval_constant(expr.get('left', {}), var_expressions)
            right = self._try_eval_constant(expr.get('right', {}), var_expressions)
            if left is None or right is None:
                return None
            op = expr.get('op', '')
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
                elif op == '%':
                    return left % right
                elif op == '**':
                    return left ** right
            except:
                pass
            return None

        if expr_type == 'negate':
            operand = self._try_eval_constant(expr.get('operand', {}), var_expressions)
            if operand is not None:
                return -operand
            return None

        if expr_type == 'subscript':
            value = self._try_eval_constant(expr.get('value', {}), var_expressions)
            index = self._try_eval_constant(expr.get('index', {}), var_expressions)
            if value is not None and index is not None:
                try:
                    return value[index]
                except:
                    pass
            return None

        if expr_type == 'setting_value':
            setting_name = expr.get('setting', '')
            if setting_name in self.settings:
                return self.settings[setting_name]
            return 0

        if expr_type == 'attribute':
            # Handle attribute access like options.first_person_mode_glitch_in_logic
            obj = expr.get('object', {})
            attr = expr.get('attr', '')

            # Check if object is a name referencing 'options' (from get_options helper)
            if obj.get('type') == 'name':
                obj_name = obj.get('name', '')
                if obj_name in var_expressions:
                    var_val = var_expressions[obj_name]
                    # If var_val is the options path, look up the attribute in settings
                    if 'options' in var_val and attr in self.settings:
                        return self.settings[attr]

            # Try to evaluate the object and access the attribute
            obj_val = self._try_eval_constant(obj, var_expressions)
            if obj_val is not None and hasattr(obj_val, attr):
                return getattr(obj_val, attr)
            return None

        # For item_check, state_method, etc. - these are runtime dependent
        return None

    def _expr_to_rule_builder(self, expr: Dict[str, Any], var_expressions: Dict[str, str]) -> Optional[str]:
        """Convert an AST expression to a Rule Builder expression string.

        Returns None if the expression cannot be converted.
        """
        if not isinstance(expr, dict):
            return repr(expr)

        expr_type = expr.get('type', '')

        if expr_type == 'constant':
            value = expr.get('value')
            return repr(value)

        if expr_type == 'name':
            name = expr.get('name', '')
            if name in var_expressions:
                return var_expressions[name]
            return None

        if expr_type == 'state_method':
            method = expr.get('method', '')
            args = expr.get('args', [])

            if method == 'count' and len(args) == 1:
                item_arg = args[0]
                if item_arg.get('type') == 'constant':
                    item_name = item_arg.get('value', '')
                    self.required_imports.add('CountItem')
                    return f'CountItem("{item_name}")'

            if method == 'has_any' and len(args) == 1:
                items_arg = args[0]
                if items_arg.get('type') == 'constant':
                    items = items_arg.get('value', [])
                    if isinstance(items, list):
                        self.required_imports.add('HasAny')
                        items_str = ', '.join(f'"{self._escape_string(item, chr(34))}"' for item in items)
                        return f'HasAny({items_str})'

            if method == 'has_all' and len(args) == 1:
                items_arg = args[0]
                if items_arg.get('type') == 'constant':
                    items = items_arg.get('value', [])
                    if isinstance(items, list):
                        self.required_imports.add('HasAll')
                        items_str = ', '.join(f'"{self._escape_string(item, chr(34))}"' for item in items)
                        return f'HasAll({items_str})'

            # Unsupported state_method
            return None

        if expr_type == 'binary_op':
            left = expr.get('left', {})
            op = expr.get('op', '')
            right = expr.get('right', {})

            left_expr = self._expr_to_rule_builder(left, var_expressions)
            right_expr = self._expr_to_rule_builder(right, var_expressions)

            if left_expr is None or right_expr is None:
                return None

            self.required_imports.add('Arithmetic')
            return f'Arithmetic({left_expr}, "{op}", {right_expr})'

        # Handle item_check - convert to Has()
        if expr_type == 'item_check':
            item = expr.get('item', '')
            count = expr.get('count')
            item_escaped = self._escape_string(item, '"')
            self.required_imports.add('Has')

            if count is not None:
                # Handle count which could be a dict (expression) or a value
                if isinstance(count, dict):
                    count_expr = self._expr_to_rule_builder(count, var_expressions)
                    if count_expr is None:
                        return None
                    return f'Has("{item_escaped}", {count_expr})'
                else:
                    return f'Has("{item_escaped}", {count})'
            else:
                return f'Has("{item_escaped}")'

        # Handle conditional - convert to Conditional() or short-circuit if test is known
        if expr_type == 'conditional':
            test = expr.get('test', {})
            if_true = expr.get('if_true', {})
            if_false = expr.get('if_false', {})

            # Try to evaluate the test to a constant boolean
            test_result = self._try_evaluate_conditional_test_expr(test, var_expressions)
            if test_result is True:
                # Short-circuit to true branch
                return self._expr_to_rule_builder(if_true, var_expressions)
            elif test_result is False:
                # Short-circuit to false branch
                return self._expr_to_rule_builder(if_false, var_expressions)

            # Fall back to generating a Conditional
            test_expr = self._expr_to_rule_builder(test, var_expressions)
            true_expr = self._expr_to_rule_builder(if_true, var_expressions)
            false_expr = self._expr_to_rule_builder(if_false, var_expressions)

            if test_expr is None or true_expr is None or false_expr is None:
                return None

            self.required_imports.add('Conditional')
            return f'Conditional(test={test_expr}, if_true={true_expr}, if_false={false_expr})'

        # Handle max - convert to MaxValue()
        if expr_type == 'max':
            args = expr.get('args', [])
            if not args:
                return '0'

            arg_exprs = []
            for arg in args:
                arg_expr = self._expr_to_rule_builder(arg, var_expressions)
                if arg_expr is None:
                    return None
                arg_exprs.append(arg_expr)

            # Build nested MaxValue calls for multiple args
            self.required_imports.add('MaxValue')
            if len(arg_exprs) == 1:
                return arg_exprs[0]
            elif len(arg_exprs) == 2:
                return f'MaxValue({arg_exprs[0]}, {arg_exprs[1]})'
            else:
                # Nest MaxValue calls: MaxValue(MaxValue(a, b), c)
                result = f'MaxValue({arg_exprs[0]}, {arg_exprs[1]})'
                for i in range(2, len(arg_exprs)):
                    result = f'MaxValue({result}, {arg_exprs[i]})'
                return result

        # Handle compare - convert to Compare()
        if expr_type == 'compare':
            left = expr.get('left', {})
            op = expr.get('op', '')
            right = expr.get('right', {})

            left_expr = self._expr_to_rule_builder(left, var_expressions)
            right_expr = self._expr_to_rule_builder(right, var_expressions)

            if left_expr is None or right_expr is None:
                return None

            self.required_imports.add('Compare')
            return f'Compare({left_expr}, "{op}", {right_expr})'

        # Handle and - convert to And() or & operator
        if expr_type == 'and':
            conditions = expr.get('conditions', [])
            if not conditions:
                self.required_imports.add('True_')
                return 'True_()'

            cond_exprs = []
            for cond in conditions:
                cond_expr = self._expr_to_rule_builder(cond, var_expressions)
                if cond_expr is None:
                    return None
                # Short-circuit on False (False & X = False)
                if cond_expr == 'False' or cond_expr == 'False_()':
                    self.required_imports.add('False_')
                    return 'False_()'
                # Skip True conditions (True & X = X)
                if cond_expr == 'True' or cond_expr == 'True_()':
                    continue
                cond_exprs.append(cond_expr)

            if not cond_exprs:
                # All conditions were True
                self.required_imports.add('True_')
                return 'True_()'

            if len(cond_exprs) == 1:
                return cond_exprs[0]

            # Use & operator for combining
            return ' & '.join(f'({c})' for c in cond_exprs)

        # Handle or - convert to Or() or | operator
        if expr_type == 'or':
            conditions = expr.get('conditions', [])
            if not conditions:
                self.required_imports.add('False_')
                return 'False_()'

            cond_exprs = []
            for cond in conditions:
                cond_expr = self._expr_to_rule_builder(cond, var_expressions)
                if cond_expr is None:
                    return None
                # Short-circuit on True (True | X = True)
                if cond_expr == 'True' or cond_expr == 'True_()':
                    self.required_imports.add('True_')
                    return 'True_()'
                # Skip False conditions (False | X = X)
                if cond_expr == 'False' or cond_expr == 'False_()':
                    continue
                cond_exprs.append(cond_expr)

            if not cond_exprs:
                # All conditions were False
                self.required_imports.add('False_')
                return 'False_()'

            if len(cond_exprs) == 1:
                return cond_exprs[0]

            # Use | operator for combining
            return ' | '.join(f'({c})' for c in cond_exprs)

        # Handle not - convert to Not()
        if expr_type == 'not':
            # Try 'condition' first, then 'operand' for compatibility with different export formats
            condition = expr.get('condition') or expr.get('operand', {})
            cond_expr = self._expr_to_rule_builder(condition, var_expressions)
            if cond_expr is None:
                return None

            # Simplify Not(True) → False and Not(False) → True
            if cond_expr == 'True' or cond_expr == 'True_()':
                self.required_imports.add('False_')
                return 'False_()'
            if cond_expr == 'False' or cond_expr == 'False_()':
                self.required_imports.add('True_')
                return 'True_()'

            self.required_imports.add('Not')
            return f'Not({cond_expr})'

        # Handle negate - convert to negative number
        if expr_type == 'negate':
            operand = expr.get('operand', {})
            operand_expr = self._expr_to_rule_builder(operand, var_expressions)
            if operand_expr is None:
                return None

            # If operand is a simple number, just negate it
            try:
                val = float(operand_expr)
                return repr(-val)
            except (ValueError, TypeError):
                # Need to use arithmetic
                self.required_imports.add('Arithmetic')
                return f'Arithmetic(0, "-", {operand_expr})'

        # Handle block - evaluate statements and return result
        if expr_type == 'block':
            statements = expr.get('statements', [])
            # Process the block recursively, passing current scope for variable access
            # Mark as nested so we don't accumulate conditions (only make sense at top level)
            return self._generate_runtime_ast_block(statements, var_expressions.copy(), is_nested=True)

        # Handle function_call - specifically for dict.get() and math.sqrt patterns
        if expr_type == 'function_call':
            function = expr.get('function', {})
            args = expr.get('args', [])

            # Check for attribute access pattern like constant_dict.get(key, default)
            if function.get('type') == 'attribute':
                attr = function.get('attr', '')
                obj = function.get('object', {})

                if attr == 'get' and obj.get('type') == 'constant' and len(args) >= 1:
                    constant_dict = obj.get('value', {})
                    # Get the key
                    key_arg = args[0]
                    if key_arg.get('type') == 'constant':
                        key = key_arg.get('value')
                        # Get the default value (if provided)
                        default = None
                        if len(args) >= 2 and args[1].get('type') == 'constant':
                            default = args[1].get('value')
                        # Lookup the value
                        if isinstance(constant_dict, dict):
                            result = constant_dict.get(key, default)
                            return repr(result)

                # Handle math.sqrt pattern
                if attr == 'sqrt' and obj.get('type') == 'name' and obj.get('name') == 'math' and len(args) == 1:
                    # Try to evaluate the argument as a constant
                    val = self._try_eval_constant(args[0], var_expressions)
                    if val is not None:
                        import math
                        result = math.sqrt(val)
                        return repr(result)
            return None

        # Handle subscript - dict/array element access
        if expr_type == 'subscript':
            value = expr.get('value', {})
            index = expr.get('index', {})

            # First try to evaluate both as constants
            val = self._try_eval_constant(value, var_expressions)
            idx = self._try_eval_constant(index, var_expressions)

            if val is not None and idx is not None:
                try:
                    if isinstance(val, (dict, list)):
                        result = val[idx]
                        return repr(result)
                except:
                    pass

            # If constant evaluation failed, try to convert to Rule Builder expressions
            value_expr = self._expr_to_rule_builder(value, var_expressions)
            index_expr = self._expr_to_rule_builder(index, var_expressions)

            if value_expr is None or index_expr is None:
                return None

            # Try to evaluate if both produce evaluable strings
            try:
                val = eval(value_expr)
                idx = eval(index_expr)
                if isinstance(val, (dict, list)):
                    result = val[idx]
                    return repr(result)
            except:
                pass

            # Can't evaluate, return as expression
            return f'{value_expr}[{index_expr}]'

        # Handle setting_value - lookup game option values
        if expr_type == 'setting_value':
            setting_name = expr.get('setting', '')
            if setting_name in self.settings:
                return repr(self.settings[setting_name])
            # Default to 0 if setting not found
            return '0'

        # Handle world_attribute - access world properties at runtime
        if expr_type == 'world_attribute':
            attribute = expr.get('attribute', '')
            # For 'options' attribute, we can't directly convert to Rule Builder
            # Return the path string which may be used in var_expressions
            base_path = f'state.multiworld.worlds[player].{attribute}'
            if 'index' in expr:
                index = expr['index']
                if isinstance(index, int):
                    base_path = f'{base_path}[{index}]'
                elif isinstance(index, str):
                    base_path = f'{base_path}[{repr(index)}]'
            return base_path

        # Handle helper - helper function calls
        if expr_type == 'helper':
            name = expr.get('name', '')
            args = expr.get('args', [])

            # First try to evaluate the helper with constant args
            arg_vals = []
            all_constants = True
            for arg in args:
                val = self._try_eval_constant(arg, var_expressions)
                if val is not None:
                    arg_vals.append(val)
                else:
                    all_constants = False
                    break

            # Try to evaluate if this is a known helper with all constant args
            # For is_radiated helper with coordinates
            if all_constants and name == 'is_radiated' and len(arg_vals) == 3:
                try:
                    x = float(arg_vals[0])
                    y = float(arg_vals[1])
                    z = float(arg_vals[2])
                    # Calculate is_radiated: aurora_dist < 950
                    import math
                    aurora_dist = math.sqrt((x - 1038.0) ** 2 + y ** 2 + (z - -163.1) ** 2)
                    return repr(aurora_dist < 950)
                except:
                    pass

            # For other helpers or non-constant args, generate a HelperCall
            # Use the same logic as _convert_helper for proper Rule Builder format
            if name in self.known_helpers:
                self.required_imports.add('HelperCall')
                func_name = self.get_function_name(name)

                # Convert arguments to Python code (simplified for AST context)
                arg_strs = []
                for arg in args:
                    if isinstance(arg, dict) and arg.get('type') == 'constant':
                        arg_strs.append(repr(arg.get('value')))
                    elif isinstance(arg, dict) and arg.get('type') == 'setting_value':
                        setting = arg.get('setting', '')
                        if setting in self.settings:
                            arg_strs.append(repr(self.settings[setting]))
                        else:
                            arg_strs.append('None')
                    else:
                        arg_expr = self._expr_to_rule_builder(arg, var_expressions)
                        if arg_expr is None:
                            arg_strs.append('None')
                        else:
                            arg_strs.append(arg_expr)

                # Build HelperCall with helper_func reference
                body_rule_code = self._try_convert_helper_body_to_rule(name, args)

                parts = [f'helper_func={func_name}', f'helper_name="{name}"']

                if arg_strs:
                    parts.append(f'args=({", ".join(arg_strs)},)')

                if body_rule_code:
                    parts.append(f'body_rule={body_rule_code}')

                return f'HelperCall({", ".join(parts)})'
            else:
                # Unknown helper - return None to signal we can't convert
                return None

        # Unsupported expression type
        return None
