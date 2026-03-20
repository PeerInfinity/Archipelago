"""
Rule expression mixin — complex expression conversion methods.
"""

import logging
from typing import Any, Dict, List, Set, Tuple, Optional

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


class RuleExpressionMixin:
    """Mixin providing complex expression conversion methods."""

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

    def _convert_rule_builder_format(self, rule: Dict[str, Any], rb_rule: str, rule_type: str) -> str:
        """Convert Rule Builder format rules (with 'rule' key) to Python expressions."""
        args = rule.get('args', {})
        # Support both 'children' at top level and 'rules' inside args (exporter format)
        children = rule.get('children', [])
        if not children and isinstance(args, dict):
            children = args.get('rules', [])

        if rb_rule == 'True_':
            return self._make_bool_constant(True)

        if rb_rule == 'False_':
            return self._make_bool_constant(False)

        if rb_rule == 'Has':
            item_name = args.get('item_name', '')
            count = args.get('count', 1)

            # Check if this rule references an item that can never be obtained.
            # If the item is not in the obtainable items set, Has() can never be satisfied,
            # so use False_() (never accessible). This handles:
            # - Phantom items used as permanent blocks (e.g., Messenger's closed portal items)
            # - Event items that are never created (e.g., Landstalker's event_visited_tibor
            #   when teleport_tree_requirements != clear_tibor)
            if (self.obtainable_items is not None
                    and item_name
                    and item_name not in self.obtainable_items
                    and isinstance(count, int) and count > 0):
                import sys
                print(f"LOSSY FALLBACK: Has('{item_name}', {count}) references unobtainable item, "
                      f"using False_() (never accessible) as fallback", file=sys.stderr)
                self.required_imports.add('False_')
                return 'False_()'

            self.required_imports.add('Has')

            # If count is a complex expression (dict), pass it as a rule reference
            if isinstance(count, dict):
                # Convert the count expression to code
                # Use _convert_compare_operand to preserve numeric values
                count_expr = self._convert_compare_operand(count)
                return f'Has({repr(item_name)}, {count_expr})'

            # Preserve the exact count from the original rule, including count=0
            # This ensures round-trip fidelity when comparing exports
            # Always include count to preserve original rule structure
            return f'Has({repr(item_name)}, {count})'

        if rb_rule == 'And':
            if not children:
                return self._make_bool_constant(True)
            if len(children) == 1:
                # Handle single Constant child with integer value in boolean context
                single_child = children[0]
                if single_child.get('rule') == 'Constant':
                    const_val = single_child.get('args', {}).get('value')
                    if isinstance(const_val, (int, float)) and not isinstance(const_val, bool):
                        return self._make_bool_constant(const_val != 0)
                return self._convert_rule(single_child)
            # Optimization: If all children are simple Has rules with count=1,
            # use HasAll instead of And(Has(...), Has(...), ...)
            # This matches the Rule Builder's _simplify_and behavior
            simple_has_items = []
            other_children = []
            for child in children:
                child_rule = child.get('rule', '')
                child_args = child.get('args', {})
                # Handle Constant children specially - these come from option checks like
                # `options.wheel_tricks` that resolve to integers at export time.
                # In boolean context: non-zero = True (skip in And), zero = False (whole And is False)
                if child_rule == 'Constant':
                    const_value = child_args.get('value')
                    if isinstance(const_value, (int, float)) and not isinstance(const_value, bool):
                        if const_value == 0:
                            # And with False = False
                            return self._make_bool_constant(False)
                        else:
                            # And with True = skip (no effect)
                            continue
                    elif const_value is False:
                        return self._make_bool_constant(False)
                    elif const_value is True:
                        continue  # True in And has no effect
                if child_rule == 'Has' and child_args.get('count', 1) == 1:
                    item_name = child_args.get('item_name', '')
                    if item_name:
                        simple_has_items.append(item_name)
                    else:
                        other_children.append(child)
                else:
                    other_children.append(child)

            # Convert other children
            child_exprs = [self._convert_rule(child) for child in other_children]
            # If any child returns None (needs lambda mode), propagate that signal
            if any(expr is None for expr in child_exprs):
                return None

            # Add simple Has items as HasAll (if 2+) or Has (if 1)
            if len(simple_has_items) >= 2:
                self.required_imports.add('HasAll')
                items_str = ', '.join(repr(item) for item in simple_has_items)
                child_exprs.append(f'HasAll({items_str})')
            elif len(simple_has_items) == 1:
                self.required_imports.add('Has')
                child_exprs.append(f'Has({repr(simple_has_items[0])})')

            if len(child_exprs) == 1:
                return child_exprs[0]

            self.required_imports.add('And')
            return f'And({", ".join(child_exprs)})'

        if rb_rule == 'Or':
            if not children:
                return self._make_bool_constant(False)
            if len(children) == 1:
                # Handle single Constant child with integer value in boolean context
                single_child = children[0]
                if single_child.get('rule') == 'Constant':
                    const_val = single_child.get('args', {}).get('value')
                    if isinstance(const_val, (int, float)) and not isinstance(const_val, bool):
                        return self._make_bool_constant(const_val != 0)
                return self._convert_rule(single_child)
            # Optimization: If all children are simple Has rules with count=1,
            # use HasAny instead of Or(Has(...), Has(...), ...)
            # This matches the Rule Builder's _simplify_or behavior
            simple_has_items = []
            other_children = []
            for child in children:
                child_rule = child.get('rule', '')
                child_args = child.get('args', {})
                # Handle Constant children specially - these come from option checks like
                # `options.wheel_tricks` that resolve to integers at export time.
                # In boolean context: non-zero = True (whole Or is True), zero = False (skip in Or)
                if child_rule == 'Constant':
                    const_value = child_args.get('value')
                    if isinstance(const_value, (int, float)) and not isinstance(const_value, bool):
                        if const_value == 0:
                            # Or with False = skip (no effect)
                            continue
                        else:
                            # Or with True = True
                            return self._make_bool_constant(True)
                    elif const_value is True:
                        return self._make_bool_constant(True)
                    elif const_value is False:
                        continue  # False in Or has no effect
                if child_rule == 'Has' and child_args.get('count', 1) == 1:
                    item_name = child_args.get('item_name', '')
                    if item_name:
                        simple_has_items.append(item_name)
                    else:
                        other_children.append(child)
                else:
                    other_children.append(child)

            # Convert other children
            child_exprs = [self._convert_rule(child) for child in other_children]
            # If any child returns None (needs lambda mode), propagate that signal
            if any(expr is None for expr in child_exprs):
                return None

            # Add simple Has items as HasAny (if 2+) or Has (if 1)
            if len(simple_has_items) >= 2:
                self.required_imports.add('HasAny')
                items_str = ', '.join(repr(item) for item in simple_has_items)
                child_exprs.append(f'HasAny({items_str})')
            elif len(simple_has_items) == 1:
                self.required_imports.add('Has')
                child_exprs.append(f'Has({repr(simple_has_items[0])})')

            if len(child_exprs) == 1:
                return child_exprs[0]

            self.required_imports.add('Or')
            return f'Or({", ".join(child_exprs)})'

        if rb_rule == 'Not':
            # Not can have child in children list or in args.condition
            if children:
                child_expr = self._convert_rule(children[0])
            elif 'condition' in args:
                # Handle Rule Builder format from AST exporter (args.condition)
                child_expr = self._convert_rule(args['condition'])
            else:
                child_expr = self._make_bool_constant(True)
            self.required_imports.add('Not')
            return f'Not({child_expr})'

        if rb_rule == 'Count':
            item_name = args.get('item_name', '')
            count = args.get('count', 1)
            self.required_imports.add('Compare')
            self.required_imports.add('CountItem')
            return f'Compare(CountItem({repr(item_name)}), ">=", {count})'

        if rb_rule == 'HasAll':
            items = args.get('items', [])
            if not items:
                return self._make_bool_constant(True)
            self.required_imports.add('HasAll')
            # HasAll expects variadic arguments, not a list
            items_str = ', '.join(repr(item) for item in items)
            return f'HasAll({items_str})'

        if rb_rule == 'HasAny':
            items = args.get('items', [])
            if not items:
                return self._make_bool_constant(False)
            self.required_imports.add('HasAny')
            # HasAny expects variadic arguments, not a list
            items_str = ', '.join(repr(item) for item in items)
            return f'HasAny({items_str})'

        if rb_rule == 'HasAllCounts':
            items = args.get('items', {})
            if not items:
                return self._make_bool_constant(True)
            self.required_imports.add('HasAllCounts')
            # HasAllCounts expects a dict of {item_name: count}
            return f'HasAllCounts({repr(items)})'

        if rb_rule == 'HasGroup':
            group = args.get('group', '')
            count_raw = args.get('count', 1)
            count = self._extract_constant_value(count_raw, 1)
            self.required_imports.add('HasGroup')
            if count == 1:
                return f'HasGroup({repr(group)})'
            else:
                return f'HasGroup({repr(group)}, {count})'

        if rb_rule == 'HasGroupUnique':
            group = args.get('group', '')
            count_raw = args.get('count', 1)
            count = self._extract_constant_value(count_raw, 1)
            self.required_imports.add('HasGroupUnique')
            if count == 1:
                return f'HasGroupUnique({repr(group)})'
            else:
                return f'HasGroupUnique({repr(group)}, {count})'

        if rb_rule == 'HasFromList':
            items_raw = args.get('items', [])
            count = args.get('count', 1)
            if not items_raw:
                return self._make_bool_constant(True)
            # HasFromList expects count to be an int, not a complex expression
            # If count is a dict (expression), return None to signal lambda mode needed
            if isinstance(count, dict):
                return None  # Signal that lambda mode is needed
            # Try to resolve items if it's a complex expression (e.g., list(dict.values()))
            if isinstance(items_raw, dict):
                resolved_items = self._resolve_items_list_expression(items_raw)
                if resolved_items is None:
                    return None  # Can't resolve, need lambda mode
                items = resolved_items
            else:
                items = items_raw
            if not items:
                return self._make_bool_constant(True)
            self.required_imports.add('HasFromList')
            # HasFromList expects (*item_names: str, count: int = 1)
            items_str = ', '.join(repr(item) for item in items)
            return f'HasFromList({items_str}, count={count})'

        if rb_rule == 'HasFromListUnique':
            items_raw = args.get('items', [])
            count = args.get('count', 1)
            if not items_raw:
                return self._make_bool_constant(True)
            # HasFromListUnique expects count to be an int, not a complex expression
            # If count is a dict (expression), return None to signal lambda mode needed
            if isinstance(count, dict):
                return None  # Signal that lambda mode is needed
            # Try to resolve items if it's a complex expression (e.g., list(dict.values()))
            if isinstance(items_raw, dict):
                resolved_items = self._resolve_items_list_expression(items_raw)
                if resolved_items is None:
                    return None  # Can't resolve, need lambda mode
                items = resolved_items
            else:
                items = items_raw
            if not items:
                return self._make_bool_constant(True)
            self.required_imports.add('HasFromListUnique')
            # HasFromListUnique expects (*item_names: str, count: int = 1)
            items_str = ', '.join(repr(item) for item in items)
            return f'HasFromListUnique({items_str}, count={count})'

        if rb_rule == 'CanReachRegion':
            region = self._extract_constant_value(args.get('region_name', ''), '')
            self.required_imports.add('CanReachRegion')
            return f'CanReachRegion({repr(region)})'

        if rb_rule == 'CanReachLocation':
            location = self._extract_constant_value(args.get('location_name', ''), '')
            self.required_imports.add('CanReachLocation')
            return f'CanReachLocation({repr(location)})'

        if rb_rule == 'CanReachEntrance':
            entrance = self._extract_constant_value(args.get('entrance_name', ''), '')
            self.required_imports.add('CanReachEntrance')
            return f'CanReachEntrance({repr(entrance)})'

        if rb_rule == 'EntranceAccessRule':
            # EntranceAccessRule looks up an entrance's access_rule and evaluates it
            # This is used for ALttP underworld glitch rules where dungeon_entrance.access_rule()
            # is called with potentially a fake pearl state
            entrance_name = self._extract_constant_value(args.get('entrance_name', ''), '')
            fake_pearl = args.get('fake_pearl', False)
            # Generate a call to EntranceAccessRuleCall which evaluates the entrance's access_rule
            # The fake_pearl handling adds Moon Pearl to state before evaluation
            self.required_imports.add('EntranceAccessRuleCall')
            return f'EntranceAccessRuleCall({repr(entrance_name)}, fake_pearl={fake_pearl})'

        if rb_rule == 'Helper':
            # Convert to the format expected by _convert_helper
            helper_rule = {
                'type': 'helper',
                'name': args.get('name', ''),
                'args': args.get('args', [])
            }
            return self._convert_helper(helper_rule)

        if rb_rule == 'StateMethod':
            # Convert to the format expected by _convert_state_method
            state_rule = {
                'method': args.get('method', ''),
                'args': args.get('args', [])
            }
            return self._convert_state_method(state_rule)

        if rb_rule == 'Compare':
            # Convert Rule Builder format Compare to AST format
            compare_rule = {
                'type': 'compare',
                'left': args.get('left', {}),
                'op': args.get('op', ''),
                'right': args.get('right', {})
            }
            return self._convert_compare(compare_rule)

        if rb_rule == 'Arithmetic':
            # Convert Rule Builder format Arithmetic to binary_op format
            binary_op_rule = {
                'type': 'binary_op',
                'left': args.get('left', {}),
                'op': args.get('op', '+'),
                'right': args.get('right', {})
            }
            return self._convert_binary_op(binary_op_rule)

        if rb_rule == 'SettingValue':
            # Convert Rule Builder format SettingValue (legacy)
            setting_rule = {
                'type': 'setting_value',
                'setting': args.get('setting', '')
            }
            return self._convert_setting_value(setting_rule)

        if rb_rule == 'OptionValue':
            # Convert Rule Builder format OptionValue to OptionValue Rule
            # This allows runtime evaluation of options in set_rules context
            option_name = args.get('option', '')
            self.required_imports.add('OptionValue')
            return f"OptionValue('{option_name}')"

        if rb_rule == 'WorldAttribute':
            # Convert Rule Builder format WorldAttribute
            attr_rule = {
                'type': 'world_attribute',
                'attribute': args.get('attribute', '')
            }
            if 'index' in args:
                attr_rule['index'] = args['index']
            return self._expr_world_attribute(attr_rule)

        if rb_rule == 'Conditional':
            # Convert Rule Builder format Conditional
            conditional_rule = {
                'type': 'conditional',
                'test': args.get('test', {}),
                'if_true': args.get('if_true', {}),
                'if_false': args.get('if_false', {})
            }
            return self._convert_conditional(conditional_rule)

        if rb_rule == 'Constant':
            # Handle Constant rule
            # Values can be booleans (True/False) or integers
            value = args.get('value')
            if value is True:
                self.required_imports.add('True_')
                return 'True_()'
            elif value is False:
                self.required_imports.add('False_')
                return 'False_()'
            elif isinstance(value, int):
                # Only treat 0/1 as boolean, preserve larger integers as numeric literals
                # This handles:
                # - Settings that resolve to 0/1 instead of False/True (boolean context)
                # - Actual count values like 2, 3, 4 in Conditional branches (numeric context)
                if value == 0:
                    self.required_imports.add('False_')
                    return 'False_()'
                elif value == 1:
                    self.required_imports.add('True_')
                    return 'True_()'
                else:
                    # Preserve as numeric literal for count/arithmetic contexts
                    return repr(value)
            else:
                return repr(value)

        if rb_rule == 'AST_all_of':
            # Delegate to the dedicated converter
            return self._convert_ast_all_of(rule)

        if rb_rule == 'AST_any_of':
            # Delegate to the dedicated converter
            return self._convert_ast_any_of(rule)

        # Handle AST_count_true rules (count N of M conditions as true)
        if rb_rule == 'AST_count_true':
            return self._convert_count_true_from_args(args)

        # Handle CountItem rule (item count for comparisons)
        if rb_rule == 'CountItem':
            item_name = args.get('item_name', '')
            return self._make_count_item(item_name)

        # Handle AST_min rule (min operation from AST export)
        if rb_rule == 'AST_min':
            # The args are nested under args.args
            min_args = args.get('args', [])
            if len(min_args) >= 2:
                self.required_imports.add('MinValue')
                left_code = self._convert_arithmetic_operand(min_args[0])
                right_code = self._convert_arithmetic_operand(min_args[1])
                return f'MinValue({left_code}, {right_code})'
            return 'MinValue(0, 0)'

        # Handle AST_max rule (max operation from AST export)
        if rb_rule == 'AST_max':
            # The args are nested under args.args
            max_args = args.get('args', [])
            if len(max_args) >= 2:
                self.required_imports.add('MaxValue')
                # Chain multiple args: MaxValue(MaxValue(a, b), c)
                result = self._convert_arithmetic_operand(max_args[0])
                for arg in max_args[1:]:
                    arg_code = self._convert_arithmetic_operand(arg)
                    result = f'MaxValue({result}, {arg_code})'
                return result
            elif len(max_args) == 1:
                return self._convert_arithmetic_operand(max_args[0])
            return '0'

        # Handle AST_prog_item_count rule (for state counter items like coins)
        # This converts {"rule": "AST_prog_item_count", "args": {"key": " coins"}}
        # to CountItem(" coins") for use in Compare expressions
        if rb_rule == 'AST_prog_item_count':
            key = args.get('key', '')
            return self._make_count_item(key)

        # Handle AST_count_item rule (from AST format, counts items for arithmetic)
        if rb_rule == 'AST_count_item':
            item_name = args.get('item', '')
            return self._make_count_item(item_name)

        # Handle AST_group_count rule (from AST format, counts items in a group)
        # This comes from state.count_group() calls in access rules
        if rb_rule == 'AST_group_count':
            group = args.get('group', '')
            self.required_imports.add('CountGroup')
            return f'CountGroup({repr(group)})'

        if rb_rule == 'AST_block':
            # Convert AST block to evaluated result
            return self._convert_ast_block(rule)

        if rb_rule == 'List':
            # Convert Rule Builder format List to Python list literal
            # Structure: {"rule": "List", "args": {"value": [...]}}
            value_list = args.get('value', [])
            converted_items = []
            for item in value_list:
                if isinstance(item, dict):
                    # Check for Rule Builder format Constant
                    if item.get('rule') == 'Constant':
                        converted_items.append(repr(item.get('args', {}).get('value')))
                    elif item.get('type') == 'constant':
                        converted_items.append(repr(item.get('value')))
                    else:
                        # Other rule types - convert recursively
                        converted_items.append(self._convert_rule(item))
                else:
                    # Raw value
                    converted_items.append(repr(item))
            return f'[{", ".join(converted_items)}]'

        if rb_rule == 'Name':
            # The name is in args.name for Rule Builder format
            name = args.get('name', '')
            # Check for location/entrance context substitution
            # When generating rules for a specific location, substitute 'location' with
            # the actual location object lookup
            if name == 'location' and self._current_location:
                escaped = self._current_location.replace('\\', '\\\\').replace('"', '\\"')
                return f'multiworld.get_location("{escaped}", player)'
            if name == 'entrance' and self._current_entrance:
                escaped = self._current_entrance.replace('\\', '\\\\').replace('"', '\\"')
                return f'multiworld.get_entrance("{escaped}", player)'
            # Otherwise treat as a setting reference and resolve to constant
            return self._resolve_setting_to_bool(name, default=False)

        # Unknown Rule Builder rule - return True_() as placeholder
        self.required_imports.add('True_')
        return 'True_()'

    def _convert_compare_operand(self, operand: Any) -> str:
        """Convert a compare operand to Python code.

        Note: Raw lists are converted to tuples because placement_lookup
        comparisons use location_item_name() which returns tuples.
        """
        if not isinstance(operand, dict):
            # Convert lists to tuples for proper comparison with location_item_name()
            if isinstance(operand, list):
                return repr(tuple(operand))
            return repr(operand)

        op_type = operand.get('type', '')

        if op_type == 'constant':
            return repr(operand.get('value'))

        # Handle Rule Builder format Constant (e.g., {"rule": "Constant", "args": {"value": 6}})
        # These are numeric constants used in comparisons (e.g., quest_points > 6)
        # and must be preserved as numbers, not converted to booleans
        rb_rule = operand.get('rule', '')
        if rb_rule == 'Constant':
            value = operand.get('args', {}).get('value')
            return repr(value)

        if op_type == 'count_item':
            # Handle count_item type from rules.json export
            item_name = operand.get('item', '')
            return self._make_count_item(item_name)

        if op_type == 'state_method':
            method = operand.get('method', '')
            args = operand.get('args', [])

            # Handle count method specially
            if method == 'count':
                if args and isinstance(args[0], dict) and args[0].get('type') == 'constant':
                    item_name = args[0].get('value', '')
                    return self._make_count_item(item_name)

        if op_type == 'binary_op':
            return self._convert_binary_op(operand)

        if op_type == 'min':
            return self._convert_min(operand)

        # Check for Rule Builder format (has 'rule' key instead of 'type')
        rb_rule = operand.get('rule', '')
        rb_args = operand.get('args', {})

        if rb_rule == 'CountItem':
            item_name = rb_args.get('item_name', '')
            return self._make_count_item(item_name)

        if rb_rule == 'AST_count_item':
            # Handle AST_count_item from CC converter (e.g., {"rule": "AST_count_item", "args": {"item": "..."}})
            item_name = rb_args.get('item', '')
            return self._make_count_item(item_name)

        if rb_rule == 'AST_min':
            # Handle AST_min with nested args
            min_args = rb_args.get('args', [])
            if len(min_args) >= 2:
                self.required_imports.add('MinValue')
                left_code = self._convert_arithmetic_operand(min_args[0])
                right_code = self._convert_arithmetic_operand(min_args[1])
                return f'MinValue({left_code}, {right_code})'
            return 'MinValue(0, 0)'

        if rb_rule == 'AST_max':
            # Handle AST_max with nested args
            max_args = rb_args.get('args', [])
            if len(max_args) >= 2:
                self.required_imports.add('MaxValue')
                # Chain multiple args: MaxValue(MaxValue(a, b), c)
                result = self._convert_arithmetic_operand(max_args[0])
                for arg in max_args[1:]:
                    arg_code = self._convert_arithmetic_operand(arg)
                    result = f'MaxValue({result}, {arg_code})'
                return result
            elif len(max_args) == 1:
                return self._convert_arithmetic_operand(max_args[0])
            return '0'

        if rb_rule == 'SettingValue':
            # Handle SettingValue in Compare operand - preserve numeric value
            # Unlike _convert_setting_value which converts to boolean rules,
            # Compare operands need the actual numeric value for arithmetic comparisons
            setting = rb_args.get('setting', '')
            if setting in self.settings:
                value = self.settings[setting]
                # For numeric settings in Compare context, return the raw value
                if isinstance(value, (int, float)):
                    return repr(value)
                # For boolean-like settings, convert to True_/False_
                if isinstance(value, bool):
                    self.required_imports.add('True_' if value else 'False_')
                    return 'True_()' if value else 'False_()'
                if isinstance(value, str):
                    if value.lower() == 'true':
                        self.required_imports.add('True_')
                        return 'True_()'
                    elif value.lower() == 'false':
                        self.required_imports.add('False_')
                        return 'False_()'
                # Other values (strings, etc.) - return as string literal
                return repr(value)
            # Unknown setting - return 0 as safe fallback
            return '0'

        if rb_rule == 'OptionValue':
            # Handle OptionValue in Compare operand - use OptionValue rule for runtime evaluation
            option_name = rb_args.get('option', '')
            self.required_imports.add('OptionValue')
            return f"OptionValue('{option_name}')"

        if rb_rule == 'WorldAttribute':
            # Handle WorldAttribute in Compare operand - preserve value
            attribute = rb_args.get('attribute', '')
            if attribute in self.world_attributes:
                value = self.world_attributes[attribute]
                if isinstance(value, (int, float)):
                    return repr(value)
                if isinstance(value, bool):
                    self.required_imports.add('True_' if value else 'False_')
                    return 'True_()' if value else 'False_()'
                return repr(value)
            return '0'

        if rb_rule == 'Arithmetic':
            # Handle Rule Builder format Arithmetic in Compare operand
            binary_op_rule = {
                'type': 'binary_op',
                'left': rb_args.get('left', {}),
                'op': rb_args.get('op', '+'),
                'right': rb_args.get('right', {})
            }
            return self._convert_binary_op(binary_op_rule)

        # Handle Tuple operand (e.g., for 'in' operator: value in ('a', 'b', 'c'))
        if rb_rule == 'Tuple':
            args = operand.get('args', {})
            value_list = args.get('value', args.get('elements', []))
            items = []
            for item in value_list:
                if isinstance(item, dict):
                    if item.get('rule') == 'Constant':
                        items.append(repr(item.get('args', {}).get('value')))
                    elif item.get('type') == 'constant':
                        items.append(repr(item.get('value')))
                    else:
                        # Recursively convert complex items
                        items.append(self._convert_compare_operand(item))
                else:
                    items.append(repr(item))
            return f"({', '.join(items)})"

        # Handle List operand - convert to tuple for consistency with location_item_name()
        # which returns tuples. This ensures comparisons work correctly.
        if rb_rule == 'List':
            args = operand.get('args', {})
            value_list = args.get('value', args.get('elements', []))
            items = []
            for item in value_list:
                if isinstance(item, dict):
                    if item.get('rule') == 'Constant':
                        items.append(repr(item.get('args', {}).get('value')))
                    elif item.get('type') == 'constant':
                        items.append(repr(item.get('value')))
                    else:
                        items.append(self._convert_compare_operand(item))
                else:
                    items.append(repr(item))
            # Use tuple format to match location_item_name() return type
            return f"({', '.join(items)},)" if len(items) == 1 else f"({', '.join(items)})"

        # Handle integer-returning helpers used as Compare operands
        # These are helpers that count items and return an integer (e.g., weapon_armor_upgrade_count)
        # They are blacklisted from normal helper export but need to be converted to CountItem
        if operand.get('_original_ast_type', '').endswith('helper'):
            helper_name = operand.get('rule', '')
            args = operand.get('args', [])

            # First, try to convert simple item-counting helpers to CountItem
            if args and isinstance(args[0], dict):
                arg = args[0]
                # Extract item name from Constant or constant format
                if arg.get('rule') == 'Constant':
                    item_name = arg.get('args', {}).get('value', '')
                elif arg.get('type') == 'constant':
                    item_name = arg.get('value', '')
                else:
                    item_name = ''

                if item_name and isinstance(item_name, str):
                    # Convert helper call to CountItem for the item
                    return self._make_count_item(item_name)

            # Handle get_item_perc_amount helper statically
            # This helper calculates floor(items * (perc / 100)) when multiworld is None
            # Pizza Tower and other games use this pattern for boss entrance requirements
            if helper_name == 'get_item_perc_amount' and len(args) >= 3:
                # Extract constant arguments: multiworld (ignored), items, perc
                def _extract_constant(arg):
                    if arg is None:
                        return None
                    if isinstance(arg, (int, float)):
                        return arg
                    if isinstance(arg, dict):
                        if arg.get('rule') == 'Constant':
                            return arg.get('args', {}).get('value')
                        if arg.get('type') == 'constant':
                            return arg.get('value')
                    return None

                # Args: [multiworld (None), items (int), perc (int)]
                items = _extract_constant(args[1])
                perc = _extract_constant(args[2])

                if items is not None and perc is not None:
                    # Calculate: floor(items * (perc / 100))
                    # This matches the original helper behavior when multiworld is None
                    import math
                    result = math.floor(items * (perc / 100))
                    return repr(result)

            # For other helpers (like get_item_perc_amount), generate a HelperCall
            # These are integer-returning helpers used as count arguments
            if helper_name and helper_name in self.known_helpers:
                self.required_imports.add('HelperCall')
                func_name = self.get_function_name(helper_name)

                # Convert arguments to Python code
                arg_strs = []
                for arg in args:
                    if arg is None:
                        arg_strs.append('None')
                    elif isinstance(arg, dict):
                        if arg.get('rule') == 'Constant':
                            arg_strs.append(repr(arg.get('args', {}).get('value')))
                        elif arg.get('type') == 'constant':
                            arg_strs.append(repr(arg.get('value')))
                        elif arg.get('rule') == 'SettingValue':
                            setting = arg.get('args', {}).get('setting', '')
                            if setting in self.settings:
                                arg_strs.append(repr(self.settings[setting]))
                            else:
                                arg_strs.append('None')
                        else:
                            # For other complex expressions, try to convert
                            arg_strs.append(self._convert_arithmetic_operand(arg))
                    else:
                        arg_strs.append(repr(arg))

                args_tuple = f"({', '.join(arg_strs)},)" if arg_strs else "()"
                return f'HelperCall(helper_func={func_name}, helper_name="{helper_name}", args={args_tuple})'

        # For other types, try to convert as a rule
        return self._convert_rule(operand)

    def _convert_binary_op(self, operand: Dict[str, Any]) -> str:
        """Convert a binary_op to Arithmetic rule."""
        self.required_imports.add('Arithmetic')

        left = operand.get('left', {})
        op = operand.get('op', '+')
        right = operand.get('right', {})

        # Normalize operator names from Python AST
        op_map = {
            'Add': '+', 'Sub': '-', 'Mult': '*', 'Div': '/',
            'FloorDiv': '//', 'Mod': '%', 'Pow': '**',
        }
        op = op_map.get(op, op)

        left_code = self._convert_arithmetic_operand(left)
        right_code = self._convert_arithmetic_operand(right)

        return f'Arithmetic({left_code}, "{op}", {right_code})'

    def _convert_arithmetic_operand(self, operand: Any) -> str:
        """Convert an arithmetic operand to Python code."""
        if not isinstance(operand, dict):
            return repr(operand)

        op_type = operand.get('type', '')

        if op_type == 'constant':
            return repr(operand.get('value'))

        # Handle Rule Builder format Constant (e.g., {"rule": "Constant", "args": {"value": 6}})
        # These are numeric constants used in arithmetic and must be preserved as numbers
        rb_rule = operand.get('rule', '')
        if rb_rule == 'Constant':
            value = operand.get('args', {}).get('value')
            return repr(value)

        # Handle Rule Builder format AST_count_item (e.g., {"rule": "AST_count_item", "args": {"item": "Star"}})
        if rb_rule == 'AST_count_item':
            item_name = operand.get('args', {}).get('item', '')
            return self._make_count_item(item_name)

        # Handle Rule Builder format Arithmetic in arithmetic operand
        if rb_rule == 'Arithmetic':
            rb_args = operand.get('args', {})
            binary_op_rule = {
                'type': 'binary_op',
                'left': rb_args.get('left', {}),
                'op': rb_args.get('op', '+'),
                'right': rb_args.get('right', {})
            }
            return self._convert_binary_op(binary_op_rule)

        # Handle Name expressions (e.g., multiworld reference)
        # When a helper function expects multiworld as a parameter, it's passed as None
        # at worldgen time because we don't have access to the actual multiworld object
        if rb_rule == 'Name':
            name = operand.get('args', {}).get('name', '')
            # multiworld, state, player are runtime values - return None or appropriate default
            if name in ('multiworld', 'state', 'player', 'world'):
                return 'None'
            # For other names, return as variable reference
            return name

        # Handle Rule Builder format SettingValue in arithmetic operand
        if rb_rule == 'SettingValue':
            rb_args = operand.get('args', {})
            setting = rb_args.get('setting', '')
            if setting in self.settings:
                value = self.settings[setting]
                # For numeric settings in arithmetic context, return the raw value
                if isinstance(value, (int, float)):
                    return repr(value)
            # Unknown or non-numeric setting - return 0 as safe fallback
            return '0'

        # Handle Rule Builder format OptionValue in arithmetic operand
        if rb_rule == 'OptionValue':
            rb_args = operand.get('args', {})
            option_name = rb_args.get('option', '')
            self.required_imports.add('OptionValue')
            return f"OptionValue('{option_name}')"

        # Handle Rule Builder format WorldAttribute in arithmetic operand
        if rb_rule == 'WorldAttribute':
            rb_args = operand.get('args', {})
            attribute = rb_args.get('attribute', '')
            if attribute in self.world_attributes:
                value = self.world_attributes[attribute]
                if isinstance(value, (int, float)):
                    return repr(value)
            return '0'

        if op_type == 'count_item':
            # Handle count_item type from rules.json export
            item_name = operand.get('item', '')
            return self._make_count_item(item_name)

        if op_type == 'state_method':
            method = operand.get('method', '')
            args = operand.get('args', [])

            if method == 'count':
                if args and isinstance(args[0], dict) and args[0].get('type') == 'constant':
                    item_name = args[0].get('value', '')
                    return self._make_count_item(item_name)

        if op_type == 'binary_op':
            return self._convert_binary_op(operand)

        if op_type == 'min':
            return self._convert_min(operand)

        # Handle Rule Builder format rules with 'rule' key (for arithmetic operands)
        rb_rule = operand.get('rule', '')
        rb_args = operand.get('args', {})

        if rb_rule == 'AST_min':
            # Handle AST_min with nested args
            min_args = rb_args.get('args', [])
            if len(min_args) >= 2:
                self.required_imports.add('MinValue')
                left_code = self._convert_arithmetic_operand(min_args[0])
                right_code = self._convert_arithmetic_operand(min_args[1])
                return f'MinValue({left_code}, {right_code})'
            return 'MinValue(0, 0)'

        if rb_rule == 'AST_max':
            # Handle AST_max with nested args
            max_args = rb_args.get('args', [])
            if len(max_args) >= 2:
                self.required_imports.add('MaxValue')
                # Chain multiple args: MaxValue(MaxValue(a, b), c)
                result = self._convert_arithmetic_operand(max_args[0])
                for arg in max_args[1:]:
                    arg_code = self._convert_arithmetic_operand(arg)
                    result = f'MaxValue({result}, {arg_code})'
                return result
            elif len(max_args) == 1:
                return self._convert_arithmetic_operand(max_args[0])
            return '0'

        # Fall back to converting as a rule
        return self._convert_rule(operand)

    def _convert_min(self, operand: Dict[str, Any]) -> str:
        """Convert a min() operation to MinValue rule."""
        self.required_imports.add('MinValue')

        args = operand.get('args', [])
        if len(args) < 2:
            # Not enough arguments, return as-is with default
            return 'MinValue(0, 0)'

        left = args[0]
        right = args[1]

        left_code = self._convert_arithmetic_operand(left)
        right_code = self._convert_arithmetic_operand(right)

        return f'MinValue({left_code}, {right_code})'

    def _convert_ast_all_of(self, rule: Dict[str, Any]) -> str:
        """Convert an AST_all_of rule to Python Rule Builder expression.

        AST_all_of represents Python's all(...) comprehension expressions like:
            all(state.has(technology.name, player) for technology in required_technologies[ingredient])

        The exported format includes:
        - element_rule: The rule to apply to each element (e.g., item_check)
        - iterator_info: Details about what to iterate over
          - iterator: A subscript with a constant dict and index
          - target: The variable name used in the comprehension

        For Factorio, this is used to check that the player has all required
        technologies for a given ingredient.
        """
        args = rule.get('args', {})
        element_rule = args.get('element_rule', {})
        iterator_info = args.get('iterator_info', {})

        # Get the iterator which should be a subscript into a constant dict
        iterator = iterator_info.get('iterator', {})

        if iterator.get('type') == 'subscript':
            value_dict = iterator.get('value', {})
            index_node = iterator.get('index', {})

            # Check if value is a constant dict (the required_technologies mapping)
            if value_dict.get('type') == 'constant' and isinstance(value_dict.get('value'), dict):
                tech_dict = value_dict.get('value')

                # Get the index (ingredient name)
                if index_node.get('type') == 'constant':
                    ingredient = index_node.get('value', '')

                    # Look up the required technologies for this ingredient
                    required_techs = tech_dict.get(ingredient, [])

                    if not required_techs:
                        # No technologies required - always accessible
                        self.required_imports.add('True_')
                        return 'True_()'

                    # Generate HasAll check for required technologies
                    if len(required_techs) == 1:
                        tech = required_techs[0]
                        tech_escaped = self._escape_string(tech, "'")
                        self.required_imports.add('Has')
                        return f"Has('{tech_escaped}')"
                    else:
                        # Multiple technologies - use And with Has for each
                        has_checks = []
                        for tech in required_techs:
                            tech_escaped = self._escape_string(tech, "'")
                            has_checks.append(f"Has('{tech_escaped}')")
                        self.required_imports.add('Has')
                        self.required_imports.add('And')
                        return f'And({", ".join(has_checks)})'

        # Handle constant iterator type (a direct list of items to check)
        # This occurs when the comprehension iterates over a static list like:
        #   all(state.has(tech.name, player) for tech in ["tech1", "tech2", ...])
        elif iterator.get('type') == 'constant' and isinstance(iterator.get('value'), list):
            required_items = iterator.get('value', [])

            if not required_items:
                # Empty list - all() of nothing is True
                self.required_imports.add('True_')
                return 'True_()'

            # Check the element_rule to determine how to process each item
            # Case 1: state_method with can_reach - use CanReachLocation
            if element_rule.get('type') == 'state_method' and element_rule.get('method') == 'can_reach':
                checks = []
                for loc in required_items:
                    loc_escaped = self._escape_string(str(loc), "'")
                    checks.append(f"CanReachLocation('{loc_escaped}')")
                self.required_imports.add('CanReachLocation')
                if len(checks) == 1:
                    return checks[0]
                else:
                    self.required_imports.add('And')
                    return f'And({", ".join(checks)})'

            # Case 2: item_check with f_string - substitute values into the template
            if element_rule.get('type') == 'item_check':
                item_node = element_rule.get('item', {})
                if item_node.get('type') == 'f_string':
                    # Get the template string (e.g., "Automated {ingredient}")
                    template = item_node.get('value', '')
                    # Get the target variable name (e.g., "ingredient")
                    target = iterator_info.get('target', {})
                    target_name = target.get('name', '') if target.get('type') == 'name' else ''

                    if template and target_name:
                        # Substitute each iterator value into the template
                        checks = []
                        for value in required_items:
                            # Replace {target_name} with the actual value
                            item_name = template.replace(f'{{{target_name}}}', str(value))
                            item_escaped = self._escape_string(item_name, "'")
                            checks.append(f"Has('{item_escaped}')")
                        self.required_imports.add('Has')
                        if len(checks) == 1:
                            return checks[0]
                        else:
                            self.required_imports.add('And')
                            return f'And({", ".join(checks)})'

            # Default: Generate HasAll check for required items directly
            if len(required_items) == 1:
                item = required_items[0]
                item_escaped = self._escape_string(str(item), "'")
                self.required_imports.add('Has')
                return f"Has('{item_escaped}')"
            else:
                # Multiple items - use And with Has for each
                has_checks = []
                for item in required_items:
                    item_escaped = self._escape_string(str(item), "'")
                    has_checks.append(f"Has('{item_escaped}')")
                self.required_imports.add('Has')
                self.required_imports.add('And')
                return f'And({", ".join(has_checks)})'

        # Handle constant iterator type with dict (recipe ingredients)
        # This occurs when iterating over a dict like:
        #   all(...for sub_ingredient in recipe.ingredients)
        # where recipe.ingredients = {"iron-plate": 1, "copper-plate": 1}
        elif iterator.get('type') == 'constant' and isinstance(iterator.get('value'), dict):
            recipe_ingredients = iterator.get('value', {})

            if not recipe_ingredients:
                # Empty dict - all() of nothing is True
                self.required_imports.add('True_')
                return 'True_()'

            # Check if element_rule is a nested all_of comprehension (common in Factorio)
            # This handles patterns like:
            #   all(all(state.has(tech.name, player) for tech in required_technologies[ingredient])
            #       for ingredient in recipe.ingredients)
            if element_rule.get('type') == 'all_of':
                inner_element_rule = element_rule.get('element_rule', {})
                inner_iterator_info = element_rule.get('iterator_info', {})
                inner_iterator = inner_iterator_info.get('iterator', {})

                # Check if inner iterator is a subscript into required_technologies
                if inner_iterator.get('type') == 'subscript':
                    inner_value = inner_iterator.get('value', {})
                    if inner_value.get('type') == 'constant' and isinstance(inner_value.get('value'), dict):
                        tech_dict = inner_value.get('value')

                        # For each recipe ingredient, look up required technologies
                        all_checks = []
                        for ingredient in recipe_ingredients.keys():
                            required_techs = tech_dict.get(ingredient, [])
                            if required_techs:
                                for tech in required_techs:
                                    tech_escaped = self._escape_string(str(tech), "'")
                                    all_checks.append(f"Has('{tech_escaped}')")

                        if not all_checks:
                            self.required_imports.add('True_')
                            return 'True_()'

                        # Remove duplicates while preserving order
                        seen = set()
                        unique_checks = []
                        for check in all_checks:
                            if check not in seen:
                                seen.add(check)
                                unique_checks.append(check)

                        self.required_imports.add('Has')
                        if len(unique_checks) == 1:
                            return unique_checks[0]
                        else:
                            self.required_imports.add('And')
                            return f'And({", ".join(unique_checks)})'

            # Fallback: iterate over dict keys and apply element_rule
            self.required_imports.add('True_')
            return 'True_()'

        # Couldn't resolve statically - fall back to True_()
        # This shouldn't happen for properly exported Factorio rules
        self.required_imports.add('True_')
        return 'True_()'

    def _convert_ast_any_of(self, rule: Dict[str, Any]) -> str:
        """Convert an AST_any_of rule to Python Rule Builder expression.

        AST_any_of represents Python's any(...) comprehension expressions.
        Similar to AST_all_of but uses Or instead of And.
        """
        args = rule.get('args', {})
        element_rule = args.get('element_rule', {})
        iterator_info = args.get('iterator_info', {})

        # Get the iterator which should be a subscript into a constant dict
        iterator = iterator_info.get('iterator', {})

        if iterator.get('type') == 'subscript':
            value_dict = iterator.get('value', {})
            index_node = iterator.get('index', {})

            # Check if value is a constant dict
            if value_dict.get('type') == 'constant' and isinstance(value_dict.get('value'), dict):
                item_dict = value_dict.get('value')

                # Get the index (key name)
                if index_node.get('type') == 'constant':
                    key = index_node.get('value', '')

                    # Look up the items for this key
                    items = item_dict.get(key, [])

                    if not items:
                        # No items - always false for any()
                        self.required_imports.add('False_')
                        return 'False_()'

                    # Generate Or check for items
                    if len(items) == 1:
                        item = items[0]
                        item_escaped = self._escape_string(item, "'")
                        self.required_imports.add('Has')
                        return f"Has('{item_escaped}')"
                    else:
                        # Multiple items - use Or with Has for each
                        has_checks = []
                        for item in items:
                            item_escaped = self._escape_string(item, "'")
                            has_checks.append(f"Has('{item_escaped}')")
                        self.required_imports.add('Has')
                        self.required_imports.add('Or')
                        return f'Or({", ".join(has_checks)})'

        # Handle constant iterator type (a direct list of items to check)
        # This occurs when the comprehension iterates over a static list like:
        #   any(state.has(item.name, player) for item in ["item1", "item2", ...])
        elif iterator.get('type') == 'constant' and isinstance(iterator.get('value'), list):
            items = iterator.get('value', [])

            if not items:
                # Empty list - any() of nothing is False
                self.required_imports.add('False_')
                return 'False_()'

            # Check the element_rule to determine how to process each item
            # Case 1: state_method with can_reach - use CanReachLocation
            if element_rule.get('type') == 'state_method' and element_rule.get('method') == 'can_reach':
                checks = []
                for loc in items:
                    loc_escaped = self._escape_string(str(loc), "'")
                    checks.append(f"CanReachLocation('{loc_escaped}')")
                self.required_imports.add('CanReachLocation')
                if len(checks) == 1:
                    return checks[0]
                else:
                    self.required_imports.add('Or')
                    return f'Or({", ".join(checks)})'

            # Case 2: item_check with f_string - substitute values into the template
            if element_rule.get('type') == 'item_check':
                item_node = element_rule.get('item', {})
                if item_node.get('type') == 'f_string':
                    # Get the template string (e.g., "Automated {ingredient}")
                    template = item_node.get('value', '')
                    # Get the target variable name (e.g., "ingredient")
                    target = iterator_info.get('target', {})
                    target_name = target.get('name', '') if target.get('type') == 'name' else ''

                    if template and target_name:
                        # Substitute each iterator value into the template
                        checks = []
                        for value in items:
                            # Replace {target_name} with the actual value
                            item_name = template.replace(f'{{{target_name}}}', str(value))
                            item_escaped = self._escape_string(item_name, "'")
                            checks.append(f"Has('{item_escaped}')")
                        self.required_imports.add('Has')
                        if len(checks) == 1:
                            return checks[0]
                        else:
                            self.required_imports.add('Or')
                            return f'Or({", ".join(checks)})'

            # Case 3: state_method with has_all_counts - handle item requirement dicts
            # Pattern: any(state.has_all_counts(sublist) for sublist in [{item: count, ...}, ...])
            if element_rule.get('type') == 'state_method' and element_rule.get('method') == 'has_all_counts':
                # Filter out empty dicts - has_all_counts({}) is always True
                non_empty_items = [item for item in items if isinstance(item, dict) and item]

                if not non_empty_items:
                    # All dicts are empty - always True (has_all_counts({}) is always True)
                    self.required_imports.add('True_')
                    return 'True_()'

                # Generate HasAllCounts for each non-empty dict
                # HasAllCounts expects a dict: {'item_name': count, ...}
                checks = []
                for item_dict in non_empty_items:
                    if isinstance(item_dict, dict):
                        # Convert {item: count, ...} to HasAllCounts dict format
                        items_dict_str = "{" + ", ".join(
                            f"'{self._escape_string(k, chr(39))}': {v}" for k, v in item_dict.items()
                        ) + "}"
                        checks.append(f"HasAllCounts({items_dict_str})")
                self.required_imports.add('HasAllCounts')
                if len(checks) == 1:
                    return checks[0]
                else:
                    self.required_imports.add('Or')
                    return f'Or({", ".join(checks)})'

            # Case 4: state_method with has_all - handle list of lists of item names
            # Pattern: any(state.has_all(sublist, player) for sublist in [[item1, item2], [item3], ...])
            # This is commonly used in ANIMAL WELL and similar worlds
            if element_rule.get('type') == 'state_method' and element_rule.get('method') == 'has_all':
                # Check if all items in the iterator are lists (list of lists pattern)
                if all(isinstance(item, list) for item in items):
                    # Filter out empty lists - has_all([]) is always True
                    non_empty_sublists = [item for item in items if item]

                    if not non_empty_sublists:
                        # All sublists are empty - always True (has_all([]) is always True)
                        self.required_imports.add('True_')
                        return 'True_()'

                    # Generate HasAll or Has for each sublist
                    checks = []
                    for sublist in non_empty_sublists:
                        if len(sublist) == 1:
                            # Single item - use Has
                            item = sublist[0]
                            # Skip None items
                            if item is None:
                                continue
                            item_escaped = self._escape_string(str(item), "'")
                            self.required_imports.add('Has')
                            checks.append(f"Has('{item_escaped}')")
                        else:
                            # Multiple items - use HasAll
                            # Filter out None values
                            valid_items = [item for item in sublist if item is not None]
                            if not valid_items:
                                continue
                            items_str = ', '.join(
                                f"'{self._escape_string(str(item), chr(39))}'" for item in valid_items
                            )
                            self.required_imports.add('HasAll')
                            checks.append(f'HasAll({items_str})')

                    if not checks:
                        # All sublists only contained None - always True
                        self.required_imports.add('True_')
                        return 'True_()'

                    if len(checks) == 1:
                        return checks[0]
                    else:
                        self.required_imports.add('Or')
                        return f'Or({", ".join(checks)})'

            # Case 5: element_rule is a helper with name "rule" - items ARE the rules to evaluate
            # This pattern: any(rule(state) for rule in [rule1_ast, rule2_ast, ...])
            # Where each rule in the list is itself an AST expression (or Rule Builder format)
            if (element_rule.get('type') == 'helper' and element_rule.get('name') == 'rule' and
                    all(isinstance(item, dict) and ('type' in item or 'rule' in item) for item in items)):
                # Each item is an AST/Rule Builder rule - recursively process them
                checks = []
                for item in items:
                    check = self._convert_rule(item)
                    if check and check not in ('True', 'True_()'):
                        checks.append(check)
                    elif check in ('True', 'True_()'):
                        # If any condition is always true, the any() is always true
                        self.required_imports.add('True_')
                        return 'True_()'

                if not checks:
                    # All conditions were True - any() is True
                    self.required_imports.add('True_')
                    return 'True_()'

                if len(checks) == 1:
                    return checks[0]
                else:
                    self.required_imports.add('Or')
                    return f'Or({", ".join(checks)})'

            # Case 6: element_rule is a constant true and items are rule dicts
            # This pattern: any(rule for rule in [rule1, rule2, ...])
            # Where iterator items ARE the rules to evaluate (bunny revival pattern)
            # The element_rule being constant True means "evaluate the rule value"
            if (element_rule.get('type') == 'constant' and element_rule.get('value') is True and
                    all(isinstance(item, dict) and ('type' in item or 'rule' in item) for item in items)):
                # Each item is a rule - recursively process them
                checks = []
                for item in items:
                    check = self._convert_rule(item)
                    if check and check not in ('True', 'True_()'):
                        checks.append(check)
                    elif check in ('True', 'True_()'):
                        # If any condition is always true, the any() is always true
                        self.required_imports.add('True_')
                        return 'True_()'

                if not checks:
                    # All conditions were True - any() is True
                    self.required_imports.add('True_')
                    return 'True_()'

                if len(checks) == 1:
                    return checks[0]
                else:
                    self.required_imports.add('Or')
                    return f'Or({", ".join(checks)})'

            # Default: Generate Or check for items directly
            if len(items) == 1:
                item = items[0]
                # Check if item is an AST expression (dict with 'type' key)
                # or Rule Builder format (dict with 'rule' key)
                if isinstance(item, dict) and ('type' in item or 'rule' in item):
                    return self._convert_rule(item)
                item_escaped = self._escape_string(str(item), "'")
                self.required_imports.add('Has')
                return f"Has('{item_escaped}')"
            else:
                # Multiple items - use Or with Has for each
                has_checks = []
                for item in items:
                    # Check if item is an AST expression (dict with 'type' key)
                    # or Rule Builder format (dict with 'rule' key)
                    if isinstance(item, dict) and ('type' in item or 'rule' in item):
                        check = self._convert_rule(item)
                        has_checks.append(check)
                    else:
                        item_escaped = self._escape_string(str(item), "'")
                        has_checks.append(f"Has('{item_escaped}')")
                        self.required_imports.add('Has')
                self.required_imports.add('Or')
                return f'Or({", ".join(has_checks)})'

        # Couldn't resolve statically - fall back to False_()
        self.required_imports.add('False_')
        return 'False_()'

    def _try_convert_prog_items_compare(
        self, left: Any, op: str, right: Any
    ) -> Optional[str]:
        """
        Try to convert a prog_items comparison to Has().

        Returns None if the pattern doesn't match.
        """
        # Check if right side is a constant (the count)
        if not isinstance(right, dict) or right.get('type') != 'constant':
            return None
        count = right.get('value', 0)

        # Extract item name from the left side
        item_name = self._extract_prog_items_item_name(left)
        if item_name is None:
            return None

        # Convert based on operator
        if op == '>=':
            pass  # count stays as is
        elif op == '>':
            count = count + 1  # > n means >= n+1
        elif op == '==' and count > 0:
            pass  # approximate as "has at least count"
        else:
            return None

        self.required_imports.add('Has')

        item_escaped = self._escape_string(item_name)

        if count == 1:
            return f'Has("{item_escaped}")'
        else:
            return f'Has("{item_escaped}", {count})'

    def _try_convert_count_from_list_unique_compare(
        self, left: Any, op: str, right: Any
    ) -> Optional[str]:
        """
        Try to convert a count_from_list_unique comparison to HasFromListUnique().

        Pattern: state.count_from_list_unique(items, player) >= count
        Converts to: HasFromListUnique(*items, count=count)

        Returns None if the pattern doesn't match.
        """
        if not isinstance(left, dict):
            return None

        # Get the count from the right side
        # Handle constant, Constant, or Arithmetic rules
        count = None
        if isinstance(right, dict):
            if right.get('type') == 'constant':
                count = right.get('value', 0)
            elif right.get('rule') == 'Constant':
                count = right.get('args', {}).get('value', 0)
            elif right.get('rule') == 'Arithmetic':
                # Handle Arithmetic (e.g., 8 * 1.0 for eggs_required * factor)
                arith_args = right.get('args', {})
                left_val = arith_args.get('left')
                right_val = arith_args.get('right')
                op_arith = arith_args.get('op', '')
                # Try to evaluate simple arithmetic with constants
                if isinstance(left_val, (int, float)) and isinstance(right_val, (int, float)):
                    if op_arith == '*':
                        count = int(left_val * right_val)
                    elif op_arith == '+':
                        count = int(left_val + right_val)
                    elif op_arith == '-':
                        count = int(left_val - right_val)
                    elif op_arith == '/':
                        count = int(left_val / right_val) if right_val != 0 else None

        if count is None:
            return None

        # Check if left side is a StateMethod with count_from_list_unique
        method = None
        args = []

        # Check for Rule Builder format: {"rule": "StateMethod", "args": {"method": ..., "args": [...]}}
        if left.get('rule') == 'StateMethod':
            rb_args = left.get('args', {})
            method = rb_args.get('method', '')
            args = rb_args.get('args', [])
        # Check for lowercase state_method format
        elif left.get('type') == 'state_method':
            method = left.get('method', '')
            args = left.get('args', [])

        if method != 'count_from_list_unique':
            return None

        # Extract item list from args
        items = []
        if args and isinstance(args[0], dict):
            if args[0].get('type') == 'constant':
                items = args[0].get('value', [])

        if not items:
            return None

        # Convert based on operator
        if op == '>=':
            pass  # count stays as is
        elif op == '>':
            count = count + 1  # > n means >= n+1
        elif op == '==' and count > 0:
            pass  # approximate as "has at least count"
        else:
            return None

        # Generate HasFromListUnique with the items and count
        self.required_imports.add('HasFromListUnique')
        items_str = ', '.join(f"'{self._escape_string(str(item), chr(39))}'" for item in items)
        return f'HasFromListUnique({items_str}, count={count})'

    def _try_convert_ast_sum_of_compare(
        self, left: Any, op: str, right: Any
    ) -> Optional[str]:
        """
        Try to convert an AST_sum_of comparison to HasFromListUnique().

        Pattern: sum(state.has(item, player) for item in items) >= count
        Exported as: Compare(AST_sum_of(...), ">=", count)
        Converts to: HasFromListUnique(*items, count=count)

        This handles the common pattern of counting how many items from a list
        the player has, used for boss gates and similar mechanics.

        Returns None if the pattern doesn't match.
        """
        if not isinstance(left, dict):
            return None

        # Check if left side is an AST_sum_of rule
        rb_rule = left.get('rule', '')
        if rb_rule != 'AST_sum_of':
            return None

        args = left.get('args', {})

        # Get the element_rule - should be an item_check on the iterator variable
        element_rule = args.get('element_rule', {})

        # Get the iterator_info
        iterator_info = args.get('iterator_info', {})
        target = iterator_info.get('target', {})
        iterator = iterator_info.get('iterator', {})

        # Verify this is a simple item counting pattern:
        # element_rule should check state.has(variable) where variable is the iterator target
        # We support: {"type": "item_check", "item": {"type": "name", "name": "<var>"}}
        if element_rule.get('type') != 'item_check':
            return None

        item_spec = element_rule.get('item', {})
        if not isinstance(item_spec, dict):
            return None

        # The item should be a reference to the iterator variable
        if item_spec.get('type') != 'name':
            return None

        item_var_name = item_spec.get('name', '')
        target_var_name = target.get('name', '') if isinstance(target, dict) else ''

        # Verify the item check uses the iterator variable
        if item_var_name != target_var_name:
            return None

        # Extract the list of items from the iterator
        items = []
        if isinstance(iterator, dict) and iterator.get('type') == 'constant':
            items = iterator.get('value', [])
        elif isinstance(iterator, list):
            items = iterator

        if not items or not isinstance(items, list):
            return None

        # Get the count from the right side
        count = self._extract_numeric_constant(right)
        if count is None:
            # Try other formats
            if isinstance(right, dict):
                if right.get('type') == 'constant':
                    count = right.get('value', 0)
                elif right.get('rule') == 'Constant':
                    count = right.get('args', {}).get('value', 0)
            elif isinstance(right, (int, float)):
                count = int(right)

        if count is None:
            return None

        # Convert based on operator
        if op == '>=':
            pass  # count stays as is
        elif op == '>':
            count = count + 1  # > n means >= n+1
        elif op == '==' and count > 0:
            pass  # approximate as "has at least count"
        elif op == '<=' and count >= len(items):
            # <= max_items is always true if you can have all items
            self.required_imports.add('True_')
            return 'True_()'
        elif op == '<':
            # < count doesn't fit the HasFromListUnique pattern well
            return None
        else:
            return None

        # Ensure count doesn't exceed the number of items
        count = min(count, len(items))

        # Generate HasFromListUnique with the items and count
        self.required_imports.add('HasFromListUnique')
        items_str = ', '.join(f"'{self._escape_string(str(item), chr(39))}'" for item in items)
        return f'HasFromListUnique({items_str}, count={count})'

    def _try_convert_count_from_list_compare(
        self, left: Any, op: str, right: Any
    ) -> Optional[str]:
        """
        Try to convert a count_from_list comparison to HasFromList().

        Pattern: state.count_from_list(items, player) >= count
        Also handles: state.count_from_list(items, player) + 0 >= count (Arithmetic wrapper)
        Converts to: HasFromList(*items, count=count)

        Returns None if the pattern doesn't match.
        """
        if not isinstance(left, dict):
            return None

        # Get the count from the right side
        count = self._extract_numeric_constant(right)
        if count is None:
            return None

        # Check if left side is a StateMethod with count_from_list
        # or an Arithmetic wrapping a StateMethod (e.g., count_from_list + 0)
        method = None
        args = []

        # Direct StateMethod case
        if left.get('rule') == 'StateMethod':
            rb_args = left.get('args', {})
            method = rb_args.get('method', '')
            args = rb_args.get('args', [])
        elif left.get('type') == 'state_method':
            method = left.get('method', '')
            args = left.get('args', [])
        # Arithmetic wrapper case: Arithmetic(StateMethod, "+", 0)
        elif left.get('rule') == 'Arithmetic':
            arith_args = left.get('args', {})
            arith_left = arith_args.get('left', {})
            arith_op = arith_args.get('op', '')
            arith_right = arith_args.get('right')

            # Check if it's StateMethod + 0 or StateMethod + some constant
            if arith_op == '+' and self._extract_numeric_constant({'type': 'constant', 'value': arith_right}) == 0:
                if isinstance(arith_left, dict):
                    if arith_left.get('rule') == 'StateMethod':
                        rb_args = arith_left.get('args', {})
                        method = rb_args.get('method', '')
                        args = rb_args.get('args', [])
                    elif arith_left.get('type') == 'state_method':
                        method = arith_left.get('method', '')
                        args = arith_left.get('args', [])

        if method != 'count_from_list':
            return None

        # Extract item list from args
        items = []
        if args and isinstance(args[0], dict):
            if args[0].get('type') == 'constant':
                items = args[0].get('value', [])
            elif args[0].get('rule') == 'Constant':
                items = args[0].get('args', {}).get('value', [])

        if not items:
            return None

        # Convert based on operator
        if op == '>=':
            pass  # count stays as is
        elif op == '>':
            count = count + 1  # > n means >= n+1
        elif op == '==' and count > 0:
            pass  # approximate as "has at least count"
        else:
            return None

        # Generate HasFromList with the items and count
        self.required_imports.add('HasFromList')
        items_str = ', '.join(f"'{self._escape_string(str(item), chr(39))}'" for item in items)
        return f'HasFromList({items_str}, count={count})'

    def _extract_numeric_constant(self, value: Any) -> Optional[int]:
        """Extract a numeric constant from various formats."""
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, dict):
            if value.get('type') == 'constant':
                val = value.get('value')
                if isinstance(val, (int, float)):
                    return int(val)
            elif value.get('rule') == 'Constant':
                val = value.get('args', {}).get('value')
                if isinstance(val, (int, float)):
                    return int(val)
            elif value.get('rule') == 'Arithmetic':
                # Handle simple arithmetic with constants
                arith_args = value.get('args', {})
                left_val = self._extract_numeric_constant(arith_args.get('left'))
                right_val = self._extract_numeric_constant(arith_args.get('right'))
                op = arith_args.get('op', '')
                if left_val is not None and right_val is not None:
                    if op == '*':
                        return int(left_val * right_val)
                    elif op == '+':
                        return int(left_val + right_val)
                    elif op == '-':
                        return int(left_val - right_val)
                    elif op == '/' and right_val != 0:
                        return int(left_val / right_val)
        return None

    def _extract_prog_items_item_name(self, expr: Any) -> Optional[str]:
        """
        Extract the item name from a prog_items subscript expression.

        Pattern: state.prog_items[player][item_name]
        Also handles AST export format: {"type": "prog_item_count", "key": " coins"}
        Returns the item_name string if the pattern matches, None otherwise.
        """
        if not isinstance(expr, dict):
            return None

        # Handle AST export format: {"type": "prog_item_count", "key": " coins"}
        if expr.get('type') == 'prog_item_count':
            return expr.get('key')

        # Expected structure for subscript pattern:
        # {"type": "subscript", "value": {...}, "index": {"type": "constant", "value": "item_name"}}
        if expr.get('type') != 'subscript':
            return None

        # Get the item name from the outer subscript index
        index = expr.get('index', {})
        if not isinstance(index, dict) or index.get('type') != 'constant':
            return None
        item_name = index.get('value')

        # Check that the inner expression is state.prog_items[player]
        inner = expr.get('value', {})
        if not isinstance(inner, dict) or inner.get('type') != 'subscript':
            return None

        # Check the innermost expression is state.prog_items
        innermost = inner.get('value', {})
        if not isinstance(innermost, dict) or innermost.get('type') != 'attribute':
            return None

        if innermost.get('attr') != 'prog_items':
            return None

        obj = innermost.get('object', {})
        if not isinstance(obj, dict) or obj.get('type') != 'name' or obj.get('name') != 'state':
            return None

        return item_name
