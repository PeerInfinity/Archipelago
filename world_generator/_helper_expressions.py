"""
Helper expression mixin — all _expr_* handler methods and expression utility wrappers.
"""

import math
import sys
from typing import Any, Dict, List, Set, Optional

from rule_builder import BOOLEAN_RULE_TYPES
from ._codegen_utils import (
    ANALYZER_BOOL_TYPES,
    is_placement_lookup,
    extract_placement_location,
    extract_items_from_list,
    check_placement_comparison,
    escape_string,
    generate_world_attribute_expr,
    extract_constant,
    get_helper_function_name,
)


class HelperExpressionMixin:
    """Mixin providing all _expr_* handler methods and expression utilities."""

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

    def _escape_string(self, s: str, quote_char: str = '"') -> str:
        """Escape a string for use in generated Python code."""
        return escape_string(s, quote_char)

    def _extract_constant(self, value: Any, default: Any = None) -> Any:
        """Extract constant value from a potential constant wrapper."""
        return extract_constant(value, default, self.settings)  # With settings for attribute lookups

    def _is_placement_lookup(self, expr: Any) -> bool:
        """Check if an expression is a placement_lookup type."""
        return is_placement_lookup(expr)

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

    def _get_arg_expr(self, arg: Any, default: Any = None) -> str:
        """Get argument expression - handles both constants and variable references.

        For variable references (name type), returns the variable name.
        For constants, returns repr() of the value.
        For other expression types (binary_op, state_method, etc.), generates the expression.
        """
        if isinstance(arg, dict):
            arg_type = arg.get('type', '')
            # Handle name type (variable reference)
            if arg_type == 'name':
                return arg.get('name', str(default))
            # Handle constant type
            if arg_type == 'constant':
                value = arg.get('value', default)
                return repr(value)
            if arg_type == 'value':
                value = arg.get('value', default)
                return repr(value)
            # Handle other expression types (binary_op, state_method, helper, etc.)
            if arg_type:
                return self._generate_expression(arg)
        # Raw value
        return repr(arg) if arg is not None else repr(default)

    def _resolve_items_for_has_from_list(self, items: Any) -> List[str]:
        """
        Resolve an items expression to a list of item names for has_from_list.

        Handles patterns like:
        - list(dict.values()) where dict is a constant
        - Direct list of strings
        - Helper expressions wrapping dict.values()

        Args:
            items: The items expression (can be a list, dict, or complex expression)

        Returns:
            List of item names
        """
        # Already a list of strings
        if isinstance(items, list):
            result = []
            for item in items:
                if isinstance(item, str):
                    result.append(item)
                elif isinstance(item, dict) and item.get('type') == 'constant':
                    value = item.get('value')
                    if value is not None and isinstance(value, str):
                        result.append(value)
            return result

        if not isinstance(items, dict):
            return []

        # Handle helper pattern: {"type": "helper", "name": "list", "args": [...]}
        if items.get('type') == 'helper' and items.get('name') == 'list':
            helper_args = items.get('args', [])
            if len(helper_args) == 1:
                inner_arg = helper_args[0]
                # Check for function_call pattern (dict.values())
                if isinstance(inner_arg, dict) and inner_arg.get('type') == 'function_call':
                    return self._extract_dict_values_for_has_from_list(inner_arg)
                # Check for generator_expression pattern (list comprehension)
                if isinstance(inner_arg, dict) and inner_arg.get('type') == 'generator_expression':
                    return self._extract_from_generator_expression_for_has_from_list(inner_arg)
            return []

        # Handle direct function_call pattern
        if items.get('type') == 'function_call':
            return self._extract_dict_values_for_has_from_list(items)

        # Handle direct generator_expression pattern
        if items.get('type') == 'generator_expression':
            return self._extract_from_generator_expression_for_has_from_list(items)

        return []

    def _extract_from_generator_expression_for_has_from_list(self, gen_expr: dict) -> List[str]:
        """
        Extract items from a generator expression pattern.

        Expected patterns:
        - list(key for key, _ in dict.items()) -> returns dict keys
        - list(value for _, value in dict.items()) -> returns dict values

        Returns:
            List of extracted items, or empty list if pattern not supported
        """
        element = gen_expr.get('element', {})
        comprehension = gen_expr.get('comprehension', {})

        # Get the iterator (should be dict.items() or dict.keys() or dict.values())
        iterator = comprehension.get('iterator', {})
        if not isinstance(iterator, dict) or iterator.get('type') != 'function_call':
            return []

        function = iterator.get('function', {})
        if not isinstance(function, dict) or function.get('type') != 'attribute':
            return []

        attr = function.get('attr', '')
        obj = function.get('object', {})

        # Check for .items(), .keys(), or .values() on a constant dict
        if not isinstance(obj, dict) or obj.get('type') != 'constant':
            return []

        const_value = obj.get('value', {})
        if not isinstance(const_value, dict):
            return []

        # Get the target variable(s) from the comprehension
        target = comprehension.get('target', {})

        # Determine which part of dict we need based on the element
        if attr == 'items':
            # For dict.items(), target is usually a tuple (key, value) or (key, _)
            # We need to determine if element references the key or value
            if isinstance(element, dict) and element.get('type') == 'name':
                elem_name = element.get('name', '')
                # Check if the target is a tuple and match the element name
                if isinstance(target, dict) and target.get('type') == 'tuple':
                    target_elements = target.get('elements', [])
                    if len(target_elements) == 2:
                        first_elem = target_elements[0]
                        second_elem = target_elements[1]
                        first_name = first_elem.get('name', '') if isinstance(first_elem, dict) else ''
                        second_name = second_elem.get('name', '') if isinstance(second_elem, dict) else ''

                        if elem_name == first_name:
                            # Element is the key
                            return [k for k in const_value.keys() if k is not None and isinstance(k, str)]
                        elif elem_name == second_name:
                            # Element is the value - but values might be NamedTuples, extract first element
                            result = []
                            for v in const_value.values():
                                if isinstance(v, str):
                                    result.append(v)
                            # If values are complex (NamedTuples), return keys instead
                            if not result:
                                return [k for k in const_value.keys() if k is not None and isinstance(k, str)]
                            return result

            # Fallback: return dict keys
            return [k for k in const_value.keys() if k is not None and isinstance(k, str)]

        elif attr == 'keys':
            return [k for k in const_value.keys() if k is not None and isinstance(k, str)]

        elif attr == 'values':
            return [v for v in const_value.values() if v is not None and isinstance(v, str)]

        return []

    def _extract_dict_values_for_has_from_list(self, func_call: dict) -> List[str]:
        """
        Extract values from a dict.values() function call pattern.

        Expected pattern:
        {
            "type": "function_call",
            "function": {
                "type": "attribute",
                "object": {"type": "constant", "value": {"key": "ItemName", ...}},
                "attr": "values"
            }
        }

        Returns:
            List of item names (dict values) if pattern matches, empty list otherwise
        """
        function = func_call.get('function', {})

        # Check for attribute access pattern
        if not isinstance(function, dict) or function.get('type') != 'attribute':
            return []

        attr = function.get('attr', '')
        obj = function.get('object', {})

        # Check for .values() or .keys() call on a constant dict
        if attr == 'values' and isinstance(obj, dict) and obj.get('type') == 'constant':
            const_value = obj.get('value', {})
            if isinstance(const_value, dict):
                # Return the dict values as a list, filtering out None values
                return [v for v in const_value.values() if v is not None and isinstance(v, str)]

        if attr == 'keys' and isinstance(obj, dict) and obj.get('type') == 'constant':
            const_value = obj.get('value', {})
            if isinstance(const_value, dict):
                # Return the dict keys as a list, filtering out None values
                return [k for k in const_value.keys() if k is not None and isinstance(k, str)]

        return []

    def _expr_setting_value(self, expr: Dict[str, Any]) -> str:
        """Generate code to access an option or world attribute at runtime.

        Instead of resolving to constants at generation time, generate code that
        accesses the value at runtime. This allows the exporter to recognize the
        pattern and convert it back to a setting_value rule.

        For options (defined in option_definitions):
            state.multiworld.worlds[player].options.<name>
        For world attributes (not in option_definitions):
            state.multiworld.worlds[player].<name>

        These patterns are recognized by the exporter's _is_world_options_pattern().
        """
        setting = expr.get('setting', '')

        # Check if this is an option or a world attribute
        is_option = setting in self.option_definitions

        # Build the base path
        if is_option:
            base_path = f'state.multiworld.worlds[player].options.{setting}'
        else:
            base_path = f'state.multiworld.worlds[player].{setting}'

        # Handle indexed access (e.g., required_medallions[0])
        if 'index' in expr:
            index = expr['index']
            if isinstance(index, int):
                return f'{base_path}[{index}]'
            elif isinstance(index, str):
                return f'{base_path}[{repr(index)}]'

        return base_path

    def _expr_option_value(self, expr: Dict[str, Any]) -> str:
        """Generate code to access an option or world attribute at runtime.

        If the name is a known option (in option_definitions), generates:
            state.multiworld.worlds[player].options.<name>

        Otherwise, treats it as a world attribute and generates:
            state.multiworld.worlds[player].<name>

        This handles cases where the exporter marks world attributes as option_value
        (e.g., pyramid_keys_unlock in Timespinner).
        """
        option = expr.get('option', '')

        # Extract base option name for checking (handles paths like "goal.option_vanilla")
        # The base name is the first part before any '.' (e.g., "goal" from "goal.option_vanilla")
        base_option = option.split('.')[0] if '.' in option else option

        # Check if the base option is a known option or a world attribute
        # Some games export world attributes with option_value type incorrectly
        if base_option in self.option_definitions:
            base_path = f'state.multiworld.worlds[player].options.{option}'
        else:
            # Not a known option - treat as world attribute
            base_path = f'state.multiworld.worlds[player].{option}'

        # Handle indexed access (not common for options, but supported)
        if 'index' in expr:
            index = expr['index']
            if isinstance(index, int):
                return f'{base_path}[{index}]'
            elif isinstance(index, str):
                return f'{base_path}[{repr(index)}]'

        return base_path

    def _expr_world_attribute(self, expr: Dict[str, Any]) -> str:
        """Generate code to access a world attribute at runtime."""
        return generate_world_attribute_expr(expr)

    def _expr_placement_lookup(self, expr: Dict[str, Any]) -> str:
        """Generate code to look up what item is placed at a location.

        Generates a call to location_item_name(state, location, player) which is
        the standard Archipelago function for checking placements at runtime.
        This preserves the original code pattern and allows proper re-export.

        The return format is (item_name, player) tuple or None if not placed.
        """
        # Flag that we need to import location_item_name
        self.uses_placement_lookup = True

        location_rule = expr.get('location', {})

        # Generate the location name expression
        if isinstance(location_rule, dict):
            if location_rule.get('type') == 'constant':
                location_name = location_rule.get('value', '')
                location_expr = repr(location_name)
            else:
                location_expr = self._generate_expression(location_rule)
        elif isinstance(location_rule, str):
            location_expr = repr(location_rule)
        else:
            location_expr = repr(str(location_rule))

        # Generate call to location_item_name(state, location, player)
        # This is the standard Archipelago function from worlds.generic.Rules
        return f'location_item_name(state, {location_expr}, player)'

    def _expr_constant(self, expr: Dict[str, Any]) -> str:
        """Generate constant expression."""
        value = expr.get('value')
        if value is None:
            return 'None'
        if isinstance(value, bool):
            return 'True' if value else 'False'
        if isinstance(value, str):
            return repr(value)
        if isinstance(value, list):
            # Check if list items are AST nodes (have 'type' key) - process as expressions
            items = []
            for v in value:
                if isinstance(v, dict) and 'type' in v:
                    items.append(self._generate_expression(v))
                else:
                    items.append(self._generate_expression({'type': 'constant', 'value': v}))
            return f"[{', '.join(items)}]"
        if isinstance(value, dict):
            # Check for NamedTuple metadata - this is a serialized NamedTuple
            if '_namedtuple_fields' in value and '_namedtuple_values' in value:
                fields = tuple(value['_namedtuple_fields'])
                values = value['_namedtuple_values']
                type_name = value.get('_namedtuple_type', '')
                # Get or create a class name for this NamedTuple type
                class_name = self._get_namedtuple_class_name(fields)
                # Register the original type name -> fields mapping for constructor calls
                if type_name:
                    self.namedtuple_names[type_name] = fields
                # Generate constructor call: ClassName(val1, val2, ...)
                val_reprs = []
                for v in values:
                    val_reprs.append(self._generate_expression({'type': 'constant', 'value': v}))
                return f"{class_name}({', '.join(val_reprs)})"

            # Handle dict constants - convert numeric string keys back to integers
            # JSON always uses string keys, but if the original Python code used integer
            # keys (e.g., from enums like HatType), they would be serialized as strings.
            # We need to convert them back to integers so that lookups like dict[1] work
            # (instead of requiring dict["1"]).
            items = []
            for k, v in value.items():
                # Convert numeric string keys to integers
                if isinstance(k, str) and k.lstrip('-').isdigit():
                    key_repr = k  # Use the integer directly (no quotes)
                else:
                    key_repr = repr(k)
                # Check if dict value is an AST node (has 'type' key) - process as expression
                if isinstance(v, dict) and 'type' in v:
                    val_repr = self._generate_expression(v)
                else:
                    val_repr = self._generate_expression({'type': 'constant', 'value': v})
                items.append(f"{key_repr}: {val_repr}")
            return "{" + ", ".join(items) + "}"
        return str(value)

    def _expr_name(self, expr: Dict[str, Any]) -> str:
        """Generate variable name reference."""
        name = expr.get('name', '_')
        # In helper functions, 'world' isn't available directly - access via state
        if name == 'world':
            return 'state.multiworld.worlds[player]'
        # Substitute 'location' with a lookup when we have context
        if name == 'location' and self._current_location:
            escaped = self._current_location.replace('\\', '\\\\').replace('"', '\\"')
            return f'state.multiworld.get_location("{escaped}", player)'
        # Substitute 'entrance' with a lookup when we have context
        if name == 'entrance' and self._current_entrance:
            escaped = self._current_entrance.replace('\\', '\\\\').replace('"', '\\"')
            return f'state.multiworld.get_entrance("{escaped}", player)'
        return name

    def _expr_item_check(self, expr: Dict[str, Any]) -> str:
        """Generate state.has() call."""
        item_raw = expr.get('item', '')
        count_raw = expr.get('count', 1)

        # Handle item - could be a constant string or a variable/expression
        if isinstance(item_raw, dict):
            if item_raw.get('type') == 'constant':
                item_expr = repr(item_raw.get('value', ''))
            else:
                # Variable reference or complex expression (e.g., dict[hat])
                item_expr = self._generate_expression(item_raw)
        elif isinstance(item_raw, str):
            item_expr = repr(item_raw)
        else:
            item_expr = repr(str(item_raw))

        # Handle count - could be a constant or a complex expression
        if isinstance(count_raw, dict):
            if count_raw.get('type') == 'constant':
                count_expr = str(count_raw.get('value', 1))
            else:
                # Complex expression (e.g., helper call or attribute lookup)
                count_expr = self._generate_expression(count_raw)
        elif isinstance(count_raw, (int, float)):
            count_expr = str(int(count_raw))
        else:
            count_expr = '1'

        if count_expr == '1':
            return f'state.has({item_expr}, player)'
        return f'state.has({item_expr}, player, {count_expr})'

    def _expr_count_check(self, expr: Dict[str, Any]) -> str:
        """Generate state.has() with count check."""
        item_raw = expr.get('item', '')
        count_raw = expr.get('count', 1)

        # Handle item - could be a constant string or a variable/expression
        if isinstance(item_raw, dict):
            if item_raw.get('type') == 'constant':
                item_expr = repr(item_raw.get('value', ''))
            else:
                item_expr = self._generate_expression(item_raw)
        elif isinstance(item_raw, str):
            item_expr = repr(item_raw)
        else:
            item_expr = repr(str(item_raw))

        # Handle count - could be a constant or a complex expression
        if isinstance(count_raw, dict):
            if count_raw.get('type') == 'constant':
                count_expr = str(count_raw.get('value', 1))
            else:
                count_expr = self._generate_expression(count_raw)
        elif isinstance(count_raw, (int, float)):
            count_expr = str(int(count_raw))
        else:
            count_expr = '1'

        return f'state.has({item_expr}, player, {count_expr})'

    def _expr_group_check(self, expr: Dict[str, Any]) -> str:
        """Generate state.has_group() call."""
        group_raw = expr.get('group', '')
        count_raw = expr.get('count', 1)

        # Handle group - could be a constant string or a variable reference
        if isinstance(group_raw, dict):
            if group_raw.get('type') == 'constant':
                group_expr = repr(group_raw.get('value', ''))
            else:
                # Variable reference or other expression - generate the expression
                group_expr = self._generate_expression(group_raw)
        elif isinstance(group_raw, str):
            group_expr = repr(group_raw)
        else:
            group_expr = repr(str(group_raw))

        # Handle count - could be a constant or a complex expression
        if isinstance(count_raw, dict):
            if count_raw.get('type') == 'constant':
                count_expr = str(count_raw.get('value', 1))
            else:
                # Complex expression (e.g., len(world.item_name_groups[relic]))
                count_expr = self._generate_expression(count_raw)
        elif isinstance(count_raw, (int, float)):
            count_expr = str(int(count_raw))
        else:
            count_expr = '1'

        if count_expr == '1':
            return f'state.has_group({group_expr}, player)'
        return f'state.has_group({group_expr}, player, {count_expr})'

    def _expr_and(self, expr: Dict[str, Any]) -> str:
        """Generate and expression."""
        conditions = expr.get('conditions', [])
        if not conditions:
            return 'True'
        if len(conditions) == 1:
            return self._generate_expression(conditions[0])

        parts = [f"({self._generate_expression(c)})" for c in conditions]
        return ' and '.join(parts)

    def _expr_or(self, expr: Dict[str, Any]) -> str:
        """Generate or expression."""
        conditions = expr.get('conditions', [])
        if not conditions:
            return 'False'
        if len(conditions) == 1:
            return self._generate_expression(conditions[0])

        parts = [f"({self._generate_expression(c)})" for c in conditions]
        return ' or '.join(parts)

    def _expr_not(self, expr: Dict[str, Any]) -> str:
        """Generate not expression.

        Handles both formats:
        - {"type": "not", "condition": {...}} (condition is truthy)
        - {"type": "not", "operand": {...}, "condition": null} (operand is truthy)
        """
        # Try condition first (if truthy), then operand, then value
        inner = expr.get('condition') or expr.get('operand') or expr.get('value', {})
        return f"not ({self._generate_expression(inner)})"

    def _expr_all_of(self, expr: Dict[str, Any]) -> str:
        """Generate all() expression for AND of conditions.

        Handles two formats:
        1. Simple conditions list: {"type": "all_of", "conditions": [...]}
        2. Comprehension style: {"type": "all_of", "element_rule": {...}, "iterator_info": {...}}

        Used by SM helpers like wand() that need to AND variadic arguments,
        and by helpers that use all() comprehensions.
        """
        # Check for comprehension style (iterator_info present)
        iterator_info = expr.get('iterator_info')
        if iterator_info:
            target = iterator_info.get('target', {})
            iterator = iterator_info.get('iterator', {})
            condition = iterator_info.get('condition')
            element_rule = expr.get('element_rule', {'type': 'constant', 'value': True})

            # Generate target variable names
            target_expr = self._generate_expression(target)

            # Generate iterator expression
            iterator_expr = self._generate_expression(iterator)

            # Generate element rule expression
            element_expr = self._generate_expression(element_rule)

            # Generate condition expression if present
            if condition:
                condition_expr = self._generate_expression(condition)
                return f"all({element_expr} for {target_expr} in {iterator_expr} if {condition_expr})"

            return f"all({element_expr} for {target_expr} in {iterator_expr})"

        # Simple conditions list format
        conditions = expr.get('conditions', [])
        if not conditions:
            return 'True'
        if isinstance(conditions, dict):
            # conditions is a param_ref - use all() on the parameter
            param_name = conditions.get('name', 'args')
            return f'all({param_name})'
        if len(conditions) == 1:
            return self._generate_expression(conditions[0])
        parts = [f"({self._generate_expression(c)})" for c in conditions]
        return ' and '.join(parts)

    def _expr_any_of(self, expr: Dict[str, Any]) -> str:
        """Generate any() expression for OR of conditions.

        Handles two formats:
        1. Simple conditions list: {"type": "any_of", "conditions": [...]}
        2. Comprehension style: {"type": "any_of", "element_rule": {...}, "iterator_info": {...}}
        """
        # Check for comprehension style (iterator_info present)
        iterator_info = expr.get('iterator_info')
        if iterator_info:
            target = iterator_info.get('target', {})
            iterator = iterator_info.get('iterator', {})
            condition = iterator_info.get('condition')
            element_rule = expr.get('element_rule', {'type': 'constant', 'value': True})

            # Generate target variable names
            target_expr = self._generate_expression(target)

            # Generate iterator expression
            iterator_expr = self._generate_expression(iterator)

            # Generate element rule expression
            element_expr = self._generate_expression(element_rule)

            # Generate condition expression if present
            if condition:
                condition_expr = self._generate_expression(condition)
                return f"any({element_expr} for {target_expr} in {iterator_expr} if {condition_expr})"

            return f"any({element_expr} for {target_expr} in {iterator_expr})"

        # Simple conditions list format
        conditions = expr.get('conditions', [])
        if not conditions:
            return 'False'
        if isinstance(conditions, dict):
            # conditions is a param_ref - use any() on the parameter
            param_name = conditions.get('name', 'args')
            return f'any({param_name})'
        if len(conditions) == 1:
            return self._generate_expression(conditions[0])
        parts = [f"({self._generate_expression(c)})" for c in conditions]
        return ' or '.join(parts)

    def _expr_item_check_with_mapping(self, expr: Dict[str, Any]) -> str:
        """Generate state.has() call with item name mapping for SM.

        SM uses VARIA item names ('Morph', 'Super') which need to be
        mapped to Archipelago item names ('Morph Ball', 'Super Missile').
        """
        item_raw = expr.get('item', '')
        count = expr.get('count', 1)
        mapping = expr.get('item_name_mapping', {})

        # Handle item parameter reference
        if isinstance(item_raw, dict) and item_raw.get('type') == 'param_ref':
            param_name = item_raw.get('name', 'item')
            # Generate code that uses the mapping dict (dict stored as module-level constant)
            mapping_str = repr(mapping)
            return f'state.has({mapping_str}.get({param_name}, {param_name}), player)'

        # For constant items, resolve the mapping at generation time
        if isinstance(item_raw, dict) and item_raw.get('type') == 'constant':
            varia_name = item_raw.get('value', '')
            ap_name = mapping.get(varia_name, varia_name)
            return f'state.has({repr(ap_name)}, player)'

        # For string items, also resolve
        if isinstance(item_raw, str):
            ap_name = mapping.get(item_raw, item_raw)
            return f'state.has({repr(ap_name)}, player)'

        # Fallback
        return 'False'

    def _expr_item_check_count(self, expr: Dict[str, Any]) -> str:
        """Generate state.has() count check for SM helpers.

        Handles item count comparisons like 'has at least 3 Energy Tanks'.
        """
        item_raw = expr.get('item', '')
        count_raw = expr.get('count', 1)
        compare_op = expr.get('compare', '>=')

        # Handle item - could be constant or variable
        if isinstance(item_raw, dict):
            if item_raw.get('type') == 'param_ref':
                item = item_raw.get('name', '_item')
            elif item_raw.get('type') == 'constant':
                item = repr(item_raw.get('value', ''))
            else:
                item = self._generate_expression(item_raw)
        else:
            item = repr(item_raw) if isinstance(item_raw, str) else str(item_raw)

        # Handle count - could be constant or variable
        if isinstance(count_raw, dict):
            if count_raw.get('type') == 'param_ref':
                count = count_raw.get('name', '_count')
            elif count_raw.get('type') == 'constant':
                count = str(count_raw.get('value', 1))
            else:
                count = self._generate_expression(count_raw)
        else:
            count = str(count_raw)

        return f'state.has({item}, player, {count})'

    def _expr_compare(self, expr: Dict[str, Any]) -> str:
        """Generate comparison expression."""
        left_expr = expr.get('left', {})
        right_expr = expr.get('right', {})
        op = expr.get('op', '==')

        # Check if either side is a placement_lookup
        # Placement lookups (location_item_name checks) depend on actual item placements.
        # We now check the actual placements to determine the correct result.
        # This correctly handles self-locking rules: if the key IS placed in the locked region,
        # the placement check should return True, making the region accessible without the key.
        if self._is_placement_lookup(left_expr) or self._is_placement_lookup(right_expr):
            # Try to resolve the comparison using actual placements
            placement_result = self._check_placement_comparison(left_expr, right_expr, op)
            if placement_result is True:
                return 'True'
            elif placement_result is False:
                return 'False'
            # If placement_result is None, fall back to False for safety
            if op in ('==', 'eq'):
                return 'False'
            elif op in ('!=', 'ne'):
                return 'True'

        left = self._generate_expression(left_expr)
        right = self._generate_expression(right_expr)

        # Handle 'in' and 'not in' operators
        if op == 'in':
            return f"({left} in {right})"
        elif op == 'not in':
            return f"({left} not in {right})"

        return f"({left} {op} {right})"

    def _expr_binary_op(self, expr: Dict[str, Any]) -> str:
        """Generate binary operation expression."""
        left = self._generate_expression(expr.get('left', {}))
        op = expr.get('op', '+')
        right = self._generate_expression(expr.get('right', {}))

        # Map Python operators
        op_map = {
            'Add': '+', 'Sub': '-', 'Mult': '*', 'Div': '/',
            'FloorDiv': '//', 'Mod': '%', 'Pow': '**',
            'BitAnd': '&', 'BitOr': '|', 'BitXor': '^',
            'And': 'and', 'Or': 'or',
        }
        op = op_map.get(op, op)

        return f"({left} {op} {right})"

    def _expr_conditional(self, expr: Dict[str, Any]) -> str:
        """Generate conditional (ternary) expression."""
        test = self._generate_expression(expr.get('test', {}))
        if_true = self._generate_expression(expr.get('if_true', {}))
        if_false = expr.get('if_false')

        if if_false is None:
            # No else branch - use True as the safe default for boolean rules.
            # This matches the behavior of functions like shop_price_rules which
            # have an implicit "return True" for unhandled cases.
            return f"({if_true} if {test} else True)"

        if_false_code = self._generate_expression(if_false)
        return f"({if_true} if {test} else {if_false_code})"

    def _expr_min(self, expr: Dict[str, Any]) -> str:
        """Generate min() call.

        Handles two formats:
        1. Args list: {"type": "min", "args": [expr1, expr2, ...]}
        2. Iterable: {"type": "min", "iterable": {...}}
        """
        # Handle iterable form (e.g., min(x for x in iterable))
        iterable = expr.get('iterable')
        if iterable:
            iterable_expr = self._generate_expression(iterable)
            return f"min({iterable_expr})"

        # Handle args list form
        args = expr.get('args', [])
        if not args:
            return '0'
        arg_exprs = [self._generate_expression(a) for a in args]
        return f"min({', '.join(arg_exprs)})"

    def _expr_max(self, expr: Dict[str, Any]) -> str:
        """Generate max() call.

        Handles two formats:
        1. Args list: {"type": "max", "args": [expr1, expr2, ...]}
        2. Iterable: {"type": "max", "iterable": {...}}
        """
        # Handle iterable form (e.g., max(x for x in iterable))
        iterable = expr.get('iterable')
        if iterable:
            iterable_expr = self._generate_expression(iterable)
            return f"max({iterable_expr})"

        # Handle args list form
        args = expr.get('args', [])
        if not args:
            return '0'
        arg_exprs = [self._generate_expression(a) for a in args]
        return f"max({', '.join(arg_exprs)})"

    def _expr_block(self, expr: Dict[str, Any]) -> str:
        """Generate expression from a block of statements.

        Blocks contain multiple statements (assignments, if statements, returns)
        that would require complex partial evaluation to simplify properly.

        For safety in worldgen where we may not have all the context,
        we return True for block expressions. This keeps locations accessible
        by default, which is the safer behavior.
        """
        return 'True'

    def _expr_helper(self, expr: Dict[str, Any]) -> str:
        """Generate helper function call."""
        name = expr.get('name', '')
        args = expr.get('args', [])

        # Check if this helper exists
        if name in self.known_helpers:
            return self.get_helper_call(name, args)

        # Check if this is a call to a parameter (lambda) of the current helper
        # This handles patterns like: glitched_rule(state) where glitched_rule is a parameter
        # that was passed as a lambda like: lambda s: s.has("Item", player)
        if name in self._current_helper_params:
            # This is a lambda parameter - call it with state as the argument
            # The lambdas are defined as: lambda s: <rule> where s is the state
            return f'{name}(state)'

        # Built-in Python functions
        if name in ('any', 'all', 'len', 'sum', 'min', 'max', 'sorted', 'list', 'set', 'tuple', 'iter', 'next', 'bool', 'int', 'str', 'float', 'getattr', 'hasattr', 'isinstance', 'type'):
            arg_exprs = [self._generate_expression(a) for a in args]
            return f"{name}({', '.join(arg_exprs)})"

        # Math functions - require math import
        if name in ('sqrt', 'floor', 'ceil', 'pow', 'abs'):
            self.uses_math = True  # Flag that we need math import
            arg_exprs = [self._generate_expression(a) for a in args]
            if name == 'abs':
                return f"abs({', '.join(arg_exprs)})"
            return f"math.{name}({', '.join(arg_exprs)})"

        # total_received - count total received items from a list
        # Format: total_received(count, [item1, item2, ...])
        if name == 'total_received':
            if len(args) >= 2:
                count_expr = self._generate_expression(args[0])
                items_arg = args[1]
                # Handle list of items
                if isinstance(items_arg, dict) and items_arg.get('type') == 'constant':
                    items = items_arg.get('value', [])
                    if isinstance(items, list):
                        # Generate: sum(state.count(item, player) for item in [...]) >= count
                        items_repr = ', '.join(repr(item) for item in items)
                        return f"(sum(state.count(item, player) for item in [{items_repr}]) >= {count_expr})"
                # Fallback for non-constant lists
                items_expr = self._generate_expression(items_arg)
                return f"(sum(state.count(item, player) for item in {items_expr}) >= {count_expr})"
            # Not enough args - return False
            return 'False'

        # Check if this is a NamedTuple constructor call
        # If we've seen a NamedTuple with this type name, use the generated class
        if name in self.namedtuple_names:
            fields = self.namedtuple_names[name]
            class_name = self._get_namedtuple_class_name(fields)
            arg_exprs = [self._generate_expression(a) for a in args]
            return f"{class_name}({', '.join(arg_exprs)})"

        # Unknown helper - return True as placeholder
        # Returning True makes locations more accessible, which is appropriate for worldgen
        # since unknown helpers are typically progression checks that evaluate to true
        # under default/normal game settings
        print(
            f"LOSSY FALLBACK: Unknown helper '{name}' in _expr_helper, "
            f"using True (always accessible) as fallback",
            file=sys.stderr
        )
        return 'True'

    def _expr_state_method(self, expr: Dict[str, Any]) -> str:
        """Generate state method call."""
        method = expr.get('method', '')
        args = expr.get('args', [])

        # Map methods to their Python equivalents
        if method == 'has':
            if len(args) >= 1:
                item_expr = self._get_arg_expr(args[0], '')
                count = self._extract_constant(args[1], 1) if len(args) > 1 else 1
                if count == 1:
                    return f'state.has({item_expr}, player)'
                return f'state.has({item_expr}, player, {count})'

        elif method == 'has_all':
            if len(args) >= 1:
                # has_all expects a tuple/list of item names
                # First try to get a constant value
                items = self._extract_constant(args[0], None)
                if items is not None:
                    # It's a constant list, use repr - use list to match original ALTTP style
                    items_repr = repr(list(items)) if items else '[]'
                else:
                    # It's a dynamic expression (parameter reference, helper call, etc.)
                    items_repr = self._generate_expression(args[0])
                return f'state.has_all({items_repr}, player)'

        elif method == 'has_any':
            if len(args) >= 1:
                # has_any expects a tuple/list of item names
                # First try to get a constant value
                items = self._extract_constant(args[0], None)
                if items is not None:
                    # It's a constant list, use repr - use list to match original ALTTP style
                    items_repr = repr(list(items)) if items else '[]'
                else:
                    # It's a dynamic expression (parameter reference, helper call, etc.)
                    items_repr = self._generate_expression(args[0])
                return f'state.has_any({items_repr}, player)'

        elif method == 'count':
            if len(args) >= 1:
                item_expr = self._get_arg_expr(args[0], '')
                return f'state.count({item_expr}, player)'

        elif method == 'count_group':
            if len(args) >= 1:
                group_expr = self._get_arg_expr(args[0], '')
                return f'state.count_group({group_expr}, player)'

        elif method == 'has_group':
            if len(args) >= 1:
                group_expr = self._get_arg_expr(args[0], '')
                count = self._extract_constant(args[1], 1) if len(args) > 1 else 1
                if count == 1:
                    return f'state.has_group({group_expr}, player)'
                return f'state.has_group({group_expr}, player, {count})'

        elif method == 'has_group_unique':
            if len(args) >= 1:
                group_expr = self._get_arg_expr(args[0], '')
                count = self._extract_constant(args[1], 1) if len(args) > 1 else 1
                if count == 1:
                    return f'state.has_group_unique({group_expr}, player)'
                return f'state.has_group_unique({group_expr}, player, {count})'

        elif method == 'has_from_list':
            # has_from_list(items, player, count) - player in middle position
            if len(args) >= 1:
                items = self._extract_constant(args[0], None)
                if items is not None:
                    items_repr = repr(list(items)) if items else '[]'
                else:
                    items_repr = self._generate_expression(args[0])
                # Count is the second arg in exported JSON (after items list)
                count_expr = self._generate_expression(args[1]) if len(args) > 1 else '1'
                return f'state.has_from_list({items_repr}, player, {count_expr})'

        elif method == 'has_from_list_unique':
            # has_from_list_unique(items, player, count) - player in middle position
            if len(args) >= 1:
                items = self._extract_constant(args[0], None)
                if items is not None:
                    items_repr = repr(list(items)) if items else '[]'
                else:
                    items_repr = self._generate_expression(args[0])
                # Count is the second arg in exported JSON (after items list)
                count_expr = self._generate_expression(args[1]) if len(args) > 1 else '1'
                return f'state.has_from_list_unique({items_repr}, player, {count_expr})'

        elif method == 'can_reach':
            if len(args) >= 1:
                # First try to get a constant value
                target = self._extract_constant(args[0], None)
                if target is not None:
                    # It's a constant, use repr
                    target_expr = repr(target)
                else:
                    # It's a dynamic expression (like entrance.connected_region)
                    target_expr = self._generate_expression(args[0])
                # Second arg specifies reach type: "Region" or "Location"
                reach_type = self._extract_constant(args[1], 'Region') if len(args) > 1 else 'Region'
                return f'state.can_reach({target_expr}, {repr(reach_type)}, player)'

        elif method == 'can_reach_location':
            if len(args) >= 1:
                # First try to get a constant value
                location = self._extract_constant(args[0], None)
                if location is not None:
                    location_expr = repr(location)
                else:
                    # It's a dynamic expression
                    location_expr = self._generate_expression(args[0])
                return f'state.can_reach_location({location_expr}, player)'

        elif method == 'copy':
            # state.copy() takes no arguments
            return 'state.copy()'

        # Generic fallback - methods that take player as an argument
        arg_exprs = [self._generate_expression(a) for a in args]
        if arg_exprs:
            return f'state.{method}({", ".join(arg_exprs)}, player)'
        else:
            return f'state.{method}(player)'

    def _expr_subscript(self, expr: Dict[str, Any]) -> str:
        """Generate subscript/index expression."""
        value_expr = expr.get('value', expr.get('object', {}))
        index_expr = expr.get('index', {})

        # Special case: world.worlds[N] pattern
        # In original ALTTP code, 'world' is the multiworld and world.worlds[N] accesses player N's world.
        # Convert to state.multiworld.worlds[player] (using player variable, not hardcoded index).
        if isinstance(value_expr, dict) and value_expr.get('type') == 'attribute':
            obj = value_expr.get('object', {})
            attr = value_expr.get('attr', '')
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'world' and attr == 'worlds':
                # This is world.worlds[N] - convert to state.multiworld.worlds[player]
                return 'state.multiworld.worlds[player]'

        value = self._generate_expression(value_expr)
        index = self._generate_expression(index_expr)
        return f"{value}[{index}]"

    def _expr_attribute(self, expr: Dict[str, Any]) -> str:
        """Generate attribute access expression."""
        obj_expr = expr.get('object', {})
        attr = expr.get('attr', '')

        # Special case: when accessing .value on a setting_value, the setting_value
        # is already resolved to its actual value, so just return it directly.
        # This handles cases like world.options.goal.value where we captured the
        # setting as setting_value and now just need the numeric/boolean value.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'setting_value' and attr == 'value':
            return self._generate_expression(obj_expr)

        # Special case: when accessing param.value where param is a helper function parameter
        # (e.g., card_region.value), return just the parameter name since enum values are
        # passed as integers to helpers. This handles cases like CardRegion.DESTINY_BASIC
        # being passed as integer 4 - the .value access is no longer needed.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'name' and attr == 'value':
            param_name = obj_expr.get('name', '')
            if param_name in self._current_helper_params:
                return param_name

        # Special case: when accessing self.multiworld, convert to state.multiworld
        # In original world code, 'self' refers to the World instance which has a multiworld attribute.
        # In worldgen standalone functions, we access multiworld via state.multiworld instead.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'name' and obj_expr.get('name') == 'self':
            if attr == 'multiworld':
                return 'state.multiworld'

        # Special case: when accessing self.xxx where xxx is a setting (e.g., self.game_logic, flag_specific_keycards),
        # resolve it to the setting's value. This handles option-dependent logic flags that were
        # captured from LogicExtensions classes (e.g., TimespinnerLogic). In helper functions
        # exported from original worlds, 'self' refers to a logic class that has options as attributes.
        # We resolve these to literal values from settings.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'name' and obj_expr.get('name') == 'self':
            if attr in self.settings:
                value = self.settings[attr]
                if isinstance(value, bool):
                    return 'True' if value else 'False'
                elif isinstance(value, str):
                    return repr(value)
                else:
                    return str(value)

        # Special case: when accessing world.xxx where xxx is a known world attribute
        # (e.g., world.era_required_non_progressive_items), inline the constant value.
        # This handles game-specific computed attributes that were exported in the rules.json
        # and are accessed by helper functions. Instead of trying to access via
        # state.multiworld.worlds[player] (which is a SimpleNamespace), we inline the data.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'name' and obj_expr.get('name') == 'world':
            if attr in self.settings:
                value = self.settings[attr]
                # Use _expr_constant to convert the value to Python code
                return self._expr_constant({'type': 'constant', 'value': value})

        # Special case: when accessing world_options.xxx where xxx is a known option
        # (e.g., world_options.coinbundlequantity), inline the option value.
        # This handles DLCQuest-style rules that use world_options to access option values.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'name' and obj_expr.get('name') == 'world_options':
            if attr in self.settings:
                value = self.settings[attr]
                # Use _expr_constant to convert the value to Python code
                return self._expr_constant({'type': 'constant', 'value': value})

        # Special case: when accessing world.xxx.yyy where xxx is a known world attribute
        # that contains a dict/object (e.g., world.difficulty_requirements.progressive_bottle_limit).
        # Instead of generating invalid code like {dict}.yyy, we look up the nested value directly.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'attribute':
            inner_obj = obj_expr.get('object', {})
            inner_attr = obj_expr.get('attr', '')
            if isinstance(inner_obj, dict) and inner_obj.get('type') == 'name' and inner_obj.get('name') == 'world':
                if inner_attr in self.settings:
                    inner_value = self.settings[inner_attr]
                    if isinstance(inner_value, dict) and attr in inner_value:
                        # Access the nested attribute directly
                        nested_value = inner_value[attr]
                        return self._expr_constant({'type': 'constant', 'value': nested_value})

        # Special case: when accessing self.world.xxx where xxx is a known setting
        # (e.g., self.world.required_epitaph_pieces_name). In original world code,
        # 'self' refers to a rules class and self.world is the World instance.
        # Resolve these to literal values from settings, same as world.xxx.
        if isinstance(obj_expr, dict) and obj_expr.get('type') == 'attribute':
            inner_obj = obj_expr.get('object', {})
            inner_attr = obj_expr.get('attr', '')
            if (isinstance(inner_obj, dict) and inner_obj.get('type') == 'name' and
                    inner_obj.get('name') == 'self' and inner_attr == 'world'):
                if attr in self.settings:
                    value = self.settings[attr]
                    return self._expr_constant({'type': 'constant', 'value': value})

        obj = self._generate_expression(obj_expr)
        return f"{obj}.{attr}"

    def _expr_call(self, expr: Dict[str, Any]) -> str:
        """Generate expression for simple function calls.

        Handles {"type": "call", "func": "min", "args": [...]} format.
        This is used for Python built-in functions like min, max, len, etc.
        """
        func_name = expr.get('func', '')
        args = expr.get('args', [])

        # Generate argument expressions
        arg_exprs = [self._generate_expression(a) for a in args]

        return f"{func_name}({', '.join(arg_exprs)})"

    def _expr_function_call(self, expr: Dict[str, Any]) -> str:
        """Generate function call expression."""
        func = expr.get('function', {})
        args = expr.get('args', [])

        # Check if this is a math or logging module function call
        # and set the appropriate flags for imports
        if isinstance(func, dict) and func.get('type') == 'attribute':
            obj = func.get('object', {})
            if isinstance(obj, dict) and obj.get('type') == 'name':
                obj_name = obj.get('name')
                if obj_name == 'math':
                    self.uses_math = True
                elif obj_name == 'logging':
                    self.uses_logging = True

            # Special handling for calling .count() on a generator expression
            # Generator objects don't have .count(), need to wrap in tuple()
            if (isinstance(obj, dict) and obj.get('type') == 'generator_expression' and
                    func.get('attr') == 'count'):
                gen_code = self._generate_expression(obj)
                arg_exprs = [self._generate_expression(a) for a in args]
                return f"tuple({gen_code}).count({', '.join(arg_exprs)})"

        func_code = self._generate_expression(func)
        arg_exprs = [self._generate_expression(a) for a in args]

        # Special handling for state.multiworld.get_location - needs player argument
        # The exported helper body may be missing the player argument
        if func_code == 'state.multiworld.get_location' and len(arg_exprs) == 1:
            arg_exprs.append('player')

        # Special handling for state.multiworld.get_entrance - needs player argument
        # The exported helper body may be missing the player argument
        if func_code == 'state.multiworld.get_entrance' and len(arg_exprs) == 1:
            arg_exprs.append('player')

        # Special handling for state method calls that need player argument
        # This handles lambdas like: lambda s: s.has('Item') which need player
        # These are common in helpers that take callback functions
        if isinstance(func, dict) and func.get('type') == 'attribute':
            attr = func.get('attr', '')
            obj = func.get('object', {})
            # Check if this is a state method that needs player
            state_methods_needing_player = {'has', 'has_all', 'has_any', 'has_group', 'count', 'count_group'}
            if attr in state_methods_needing_player:
                # Check if the object is a state-like variable (like 'state' or 's' from a lambda)
                # and we have at least one argument (the item name) but no player
                # NOTE: Only add player for known state variables, not arbitrary objects
                # like 'shop' which has a .has() method but doesn't take player.
                if isinstance(obj, dict) and obj.get('type') == 'name':
                    obj_name = obj.get('name', '')
                    # Only state-like variable names should get player appended
                    # 'state' is the standard name, 's' is commonly used in lambdas
                    state_like_names = {'state', 's'}
                    if obj_name in state_like_names:
                        # These methods need player as the second argument
                        # has(item, player), has_all(items, player), etc.
                        if attr in ('has', 'count') and len(arg_exprs) == 1:
                            # has(item) -> has(item, player)
                            arg_exprs.append('player')
                        elif attr in ('has_all', 'has_any', 'has_group', 'count_group') and len(arg_exprs) == 1:
                            # has_all(items) -> has_all(items, player)
                            arg_exprs.append('player')

        # Special handling for .can_reach() method calls - needs state argument
        # Location and Region objects have can_reach(state) but exported code may call it without args
        if (isinstance(func, dict) and func.get('type') == 'attribute' and
                func.get('attr') == 'can_reach' and len(arg_exprs) == 0):
            arg_exprs.append('state')

        # Special handling for .to_bool() calls on options
        # Original ALTTP code uses option.to_bool() but Archipelago options don't have this method.
        # Convert to checking the option's truthiness by wrapping in bool().
        if (isinstance(func, dict) and func.get('type') == 'attribute' and
                func.get('attr') == 'to_bool' and len(arg_exprs) == 0):
            obj_code = self._generate_expression(func.get('object', {}))
            return f"bool({obj_code})"

        return f"{func_code}({', '.join(arg_exprs)})"

    def _expr_method_call(self, expr: Dict[str, Any]) -> str:
        """Generate method call expression."""
        obj = self._generate_expression(expr.get('object', {}))
        method = expr.get('method', '')
        args = expr.get('args', [])

        arg_exprs = [self._generate_expression(a) for a in args]

        return f"{obj}.{method}({', '.join(arg_exprs)})"

    def _expr_list(self, expr: Dict[str, Any]) -> str:
        """Generate list literal.

        Lists are mutable and support methods like .append(), .extend(), etc.
        Comparison context (in _generate_operand_for_compare) handles converting
        to tuples when needed for location_item_name() comparisons.
        """
        values = expr.get('value', expr.get('elements', []))
        items = [self._generate_expression(v) for v in values]
        return f"[{', '.join(items)}]"

    def _expr_tuple(self, expr: Dict[str, Any]) -> str:
        """Generate tuple literal."""
        elements = expr.get('elements', [])
        items = [self._generate_expression(e) for e in elements]
        if len(items) == 1:
            return f"({items[0]},)"
        return f"({', '.join(items)})"

    def _expr_set(self, expr: Dict[str, Any]) -> str:
        """Generate set literal."""
        elements = expr.get('elements', [])
        items = [self._generate_expression(e) for e in elements]
        if not items:
            return 'set()'
        return f"{{{', '.join(items)}}}"

    def _expr_negate(self, expr: Dict[str, Any]) -> str:
        """Generate unary negation."""
        operand = self._generate_expression(expr.get('operand', {}))
        return f"-({operand})"

    def _expr_region_reference(self, expr: Dict[str, Any]) -> str:
        """Generate code to get a region object reference.

        Used when rules reference a region object (e.g., for calling .can_reach() on it).
        Returns: state.multiworld.get_region('region_name', player)
        """
        region = expr.get('region', '')
        return f"state.multiworld.get_region({repr(region)}, player)"

    def _expr_region_attribute(self, expr: Dict[str, Any]) -> str:
        """Generate code to access an attribute on a region parameter.

        Used for rules that reference region properties like is_light_world, is_dark_world.

        AST format: {"type": "region_attribute", "region": {"type": "name", "name": "region"}, "attr": "is_light_world"}

        The region can be either:
        1. A region name (string) - needs to be looked up
        2. A Region object - can be used directly

        We generate code that handles both cases at runtime using getattr with a default.
        For is_light_world/is_dark_world, we default to True if region is None (allows access).
        """
        region_expr = expr.get('region', {})
        attr = expr.get('attr', '')

        # Determine default value for None region (True allows access, which is safer)
        # For light/dark world checks, if we can't determine the region, allow access
        default_value = "True"

        # Check if region expression is a parameter reference (variable name)
        # The variable could contain either a region name (string) or a Region object
        # We generate code that handles both cases at runtime using getattr
        if isinstance(region_expr, dict) and region_expr.get('type') in ('name', 'param_ref', 'variable'):
            region_var = region_expr.get('name', 'region')
            # Generate code that handles both string and Region object cases
            # Use getattr with default to handle None region gracefully
            region_lookup = f"(state.multiworld.get_region({region_var}, player) if isinstance({region_var}, str) else {region_var})"
            return f"getattr({region_lookup}, {repr(attr)}, {default_value})"

        # Otherwise, generate the region expression directly
        region_code = self._generate_expression(region_expr)
        return f"getattr({region_code}, {repr(attr)}, {default_value})"

    def _expr_can_reach(self, expr: Dict[str, Any]) -> str:
        """Generate state.can_reach() for region."""
        region_raw = expr.get('region', '')
        # Handle region - could be a constant string or a variable/expression
        if isinstance(region_raw, dict):
            if region_raw.get('type') == 'constant':
                region_expr = repr(region_raw.get('value', ''))
            else:
                region_expr = self._generate_expression(region_raw)
        elif isinstance(region_raw, str):
            region_expr = repr(region_raw)
        else:
            region_expr = repr(str(region_raw))
        return f'state.can_reach({region_expr}, "Region", player)'

    def _expr_can_reach_entrance(self, expr: Dict[str, Any]) -> str:
        """Generate state.can_reach() for entrance."""
        entrance_raw = expr.get('entrance', '')
        # Handle entrance - could be a constant string or a variable/expression
        if isinstance(entrance_raw, dict):
            if entrance_raw.get('type') == 'constant':
                entrance_expr = repr(entrance_raw.get('value', ''))
            else:
                entrance_expr = self._generate_expression(entrance_raw)
        elif isinstance(entrance_raw, str):
            entrance_expr = repr(entrance_raw)
        else:
            entrance_expr = repr(str(entrance_raw))
        return f'state.can_reach({entrance_expr}, "Entrance", player)'

    def _expr_location_check(self, expr: Dict[str, Any]) -> str:
        """Generate location accessibility check."""
        location_raw = expr.get('location', '')
        # Handle location - could be a constant string or a variable/expression
        if isinstance(location_raw, dict):
            if location_raw.get('type') == 'constant':
                location_expr = repr(location_raw.get('value', ''))
            else:
                location_expr = self._generate_expression(location_raw)
        elif isinstance(location_raw, str):
            location_expr = repr(location_raw)
        else:
            location_expr = repr(str(location_raw))
        return f'state.can_reach_location({location_expr}, player)'

    def _expr_count_item(self, expr: Dict[str, Any]) -> str:
        """Generate state.count() for item."""
        item_raw = expr.get('item', '')
        item = self._extract_constant(item_raw, '')
        return f'state.count({repr(item)}, player)'

    def _expr_group_count(self, expr: Dict[str, Any]) -> str:
        """Generate state.count_group() for group."""
        group_raw = expr.get('group', '')
        group = self._extract_constant(group_raw, '')
        return f'state.count_group({repr(group)}, player)'

    def _expr_prog_item_count(self, expr: Dict[str, Any]) -> str:
        """Generate state.prog_items access for counter items like coins.

        AST export format: {"type": "prog_item_count", "key": " coins"}
        This accesses state.prog_items[player][key] which counts accumulated items.
        """
        key = expr.get('key', '')
        key_escaped = self._escape_string(key, "'")
        return f"state.prog_items[player].get('{key_escaped}', 0)"

    def _expr_sum_of(self, expr: Dict[str, Any]) -> str:
        """Generate sum() expression from sum_of AST format.

        AST export format: {
            "type": "sum_of",
            "iterator_info": {
                "target": {...},  // tuple of variable names
                "iterator": {...},  // expression to iterate over
                "condition": {...}  // optional filter condition
            },
            "element_rule": {...}  // expression for each element
        }
        """
        iterator_info = expr.get('iterator_info', {})
        target = iterator_info.get('target', {})
        iterator = iterator_info.get('iterator', {})
        condition = iterator_info.get('condition')
        element_rule = expr.get('element_rule', {'type': 'constant', 'value': 0})

        # Generate target variable names
        target_expr = self._generate_expression(target)

        # Generate iterator expression
        iterator_expr = self._generate_expression(iterator)

        # Generate element rule expression
        element_expr = self._generate_expression(element_rule)

        # Generate condition expression if present
        if condition:
            condition_expr = self._generate_expression(condition)
            return f"sum({element_expr} for {target_expr} in {iterator_expr} if {condition_expr})"

        return f"sum({element_expr} for {target_expr} in {iterator_expr})"

    def _expr_sum(self, expr: Dict[str, Any]) -> str:
        """Generate sum() expression from sum format.

        This handles the simplified sum format used by exporter helpers:
        {
            "type": "sum",
            "iterable": {
                "type": "list",
                "value": [
                    {"type": "item_check", "item": "Valor Form"},
                    {"type": "item_check", "item": "Wisdom Form"},
                    ...
                ]
            }
        }

        Each element in the list is a boolean check (item_check, etc.) that
        evaluates to True/False. Python treats True as 1 and False as 0 in
        arithmetic, so sum([True, False, True]) = 2.
        """
        iterable = expr.get('iterable', {})

        # If it's a list, convert each element and sum them
        if iterable.get('type') == 'list':
            items = iterable.get('value', [])
            if not items:
                return '0'  # Empty sum is 0

            # Convert each item in the list
            item_exprs = [self._generate_expression(item) for item in items]

            # Build sum() call
            return f"sum([{', '.join(item_exprs)}])"

        # For other iterable types, try to generate expression
        iterable_expr = self._generate_expression(iterable)
        return f"sum({iterable_expr})"

    def _expr_f_string(self, expr: Dict[str, Any]) -> str:
        """Generate Python f-string expression.

        Handles f-string expressions like f"Act Completion ({entrance.connected_region.name})"
        """
        parts = expr.get('parts', [])
        if not parts:
            return "''"

        # Build the f-string content
        f_string_parts = []
        for part in parts:
            if isinstance(part, dict):
                part_type = part.get('type', '')
                if part_type == 'constant':
                    # Literal string part
                    value = part.get('value', '')
                    # Escape any braces in the literal part
                    value = str(value).replace('{', '{{').replace('}', '}}')
                    f_string_parts.append(value)
                elif part_type == 'formatted_value':
                    # Expression to be interpolated
                    inner_value = part.get('value', {})
                    inner_expr = self._generate_expression(inner_value)
                    # If the expression starts with '{', it's likely a dict literal
                    # which needs to be wrapped in parentheses to avoid confusing
                    # the f-string parser (e.g., {1: 'Grass Land'}[level] becomes
                    # ({1: 'Grass Land'})[level] to avoid being parsed as format spec)
                    if inner_expr.startswith('{'):
                        inner_expr = '(' + inner_expr + ')'
                    f_string_parts.append('{' + inner_expr + '}')
                else:
                    # Fallback - treat as expression
                    inner_expr = self._generate_expression(part)
                    f_string_parts.append('{' + inner_expr + '}')
            else:
                # Simple string part
                str_part = str(part).replace('{', '{{').replace('}', '}}')
                f_string_parts.append(str_part)

        return 'f"' + ''.join(f_string_parts) + '"'

    def _expr_formatted_value(self, expr: Dict[str, Any]) -> str:
        """Generate expression for a formatted value in an f-string.

        This is used when a formatted_value appears standalone (rare).
        """
        value = expr.get('value', {})
        return self._generate_expression(value)

    def _expr_generator_expression(self, expr: Dict[str, Any]) -> str:
        """Generate a Python list comprehension.

        Note: The exporter treats both list comprehensions and generator expressions
        as 'generator_expression' type. We generate list comprehensions by default
        because they produce lists that support methods like .copy(), .append(), etc.
        Generator expressions produce iterators which don't support these operations.

        List comprehensions are used for things like:
        [x for x in iterable if condition]
        """
        element = self._generate_expression(expr.get('element', {}))
        comprehension = expr.get('comprehension', {})

        # Get the loop variable (target)
        target = comprehension.get('target', {})
        if isinstance(target, dict) and target.get('type') == 'name':
            target_name = target.get('name', '_')
        else:
            target_name = self._generate_expression(target)

        # Get the iterator
        iterator = self._generate_expression(comprehension.get('iterator', {}))

        # Build the list comprehension (use [] not () to produce a list)
        result = f"[{element} for {target_name} in {iterator}]"

        # Handle optional if condition
        # Support both 'condition' (singular) and 'conditions' (plural)
        condition = comprehension.get('condition')
        conditions = comprehension.get('conditions', [])

        if condition:
            cond_expr = self._generate_expression(condition)
            result = f"[{element} for {target_name} in {iterator} if {cond_expr}]"
        elif conditions:
            # Join multiple conditions with AND logic
            cond_exprs = [self._generate_expression(c) for c in conditions]
            cond_str = ' and '.join(f"({c})" for c in cond_exprs) if len(cond_exprs) > 1 else cond_exprs[0]
            result = f"[{element} for {target_name} in {iterator} if {cond_str}]"

        return result

    def _expr_map(self, expr: Dict[str, Any]) -> str:
        """Generate a Python map() call.

        Structure: {"type": "map", "function": <lambda_expr>, "iterable": <expr>}

        This is used for expressions like:
            map(lambda x: weapons_to_name[x], reqs)

        Which maps elements of an iterable through a function.
        """
        function = expr.get('function', {})
        iterable = expr.get('iterable', {})

        func_expr = self._generate_expression(function)
        iter_expr = self._generate_expression(iterable)

        return f"map({func_expr}, {iter_expr})"

    def _expr_lambda(self, expr: Dict[str, Any]) -> str:
        """Generate a Python lambda expression.

        Structure: {"type": "lambda", "params": ["x", ...], "body": <expr>}

        This is used for expressions like:
            lambda x: weapons_to_name[x]
        """
        params = expr.get('params', [])
        body = expr.get('body', {})

        params_str = ', '.join(params)
        body_expr = self._generate_expression(body)

        return f"lambda {params_str}: {body_expr}"

    def _expr_dict_lambda_lookup(self, expr: Dict[str, Any]) -> str:
        """Generate Python code for a dict_lambda_lookup rule.

        This handles patterns like: rule_map.get(key, default)(state)
        where rule_map contains lambda values that have been analyzed.

        The generated code OR's together all possible case results since at export time
        we don't know which key will match (depends on entrance shuffle).

        Structure: {
            "type": "dict_lambda_lookup",
            "dict_name": "rule_map",
            "key": <key_expr>,
            "cases": {"key1": <rule1>, "key2": <rule2>, ...},
            "default": <default_rule>
        }
        """
        cases = expr.get('cases', {})
        default = expr.get('default', {'type': 'constant', 'value': False})

        if not cases:
            # No cases - just use the default
            return self._generate_expression(default)

        # If there's only one case, just return that case's expression
        if len(cases) == 1:
            key_name, case_rule = list(cases.items())[0]
            return self._generate_expression(case_rule)

        # Multiple cases - OR them together
        # This is permissive: at runtime only one key matches, but we allow any
        case_exprs = []
        for key_name, case_rule in cases.items():
            case_expr = self._generate_expression(case_rule)
            # Skip False expressions - they don't contribute anything
            if case_expr in ('False', 'false'):
                continue
            case_exprs.append(f'({case_expr})')

        # Also include the default if it's not False
        default_expr = self._generate_expression(default)
        if default_expr not in ('False', 'false'):
            case_exprs.append(f'({default_expr})')

        if not case_exprs:
            # All cases were False - return False
            return 'False'

        if len(case_exprs) == 1:
            # Only one non-False expression
            return case_exprs[0].strip('()')

        # Multiple expressions - OR them together
        return '(' + ' or '.join(case_exprs) + ')'
