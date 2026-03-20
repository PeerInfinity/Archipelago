"""Option constant normalization mixin for game export handlers.

This module handles conversion between string and numeric constants
for Choice options in rules and helper definitions.
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class OptionNormalizationMixin:
    """Mixin providing option constant normalization methods."""

    def normalize_helper_option_constants(
        self,
        helper_definitions: Dict[str, Any],
        option_definitions: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert string constants to numeric values in helpers when compared with Choice options.

        Some games use string comparisons like `enemy_health in ("easy", "default")` in their
        rules. When we export settings as numeric values (for proper ordered comparisons),
        these string constants need to be converted to their numeric equivalents.

        This method walks through helper definitions, finds comparisons where:
        - One side is a `setting_value` for a Choice option
        - The other side contains string constants

        And converts those string constants to their numeric values using the option's name_lookup.

        Args:
            helper_definitions: The helper definitions to process
            option_definitions: The option definitions containing name_lookup for Choice options

        Returns:
            The helper definitions with string constants converted to numeric values
        """
        if not helper_definitions or not option_definitions:
            return helper_definitions

        # Build reverse lookups for all Choice options: {"easy": 0, "default": 1, ...}
        option_reverse_lookups: Dict[str, Dict[str, int]] = {}
        for option_name, option_def in option_definitions.items():
            if option_def.get('type') == 'choice' and 'name_lookup' in option_def:
                # name_lookup is {"0": "easy", "1": "default", ...}
                # We need reverse: {"easy": 0, "default": 1, ...}
                reverse = {}
                for num_str, name in option_def['name_lookup'].items():
                    try:
                        reverse[name] = int(num_str)
                    except (ValueError, TypeError):
                        pass
                if reverse:
                    option_reverse_lookups[option_name] = reverse

        if not option_reverse_lookups:
            return helper_definitions

        def convert_node(node: Any, context_option: Optional[str] = None) -> Any:
            """Recursively process nodes, converting string constants when appropriate."""
            if not isinstance(node, dict):
                if isinstance(node, list):
                    return [convert_node(item, context_option) for item in node]
                return node

            node_type = node.get('type') or node.get('rule')

            # Handle comparisons - check if one side is an option_value/setting_value for a Choice option
            if node_type == 'compare':
                left = node.get('left', {})
                right = node.get('right', {})
                op = node.get('op', '==')

                # Check if left is an option_value or setting_value for a Choice option
                left_option = None
                left_type = left.get('type', '') if isinstance(left, dict) else ''
                if left_type == 'option_value':
                    option = left.get('option', '')
                    if option in option_reverse_lookups:
                        left_option = option
                elif left_type == 'setting_value':  # Legacy support
                    setting = left.get('setting', '')
                    if setting in option_reverse_lookups:
                        left_option = setting

                # Check if right is an option_value or setting_value for a Choice option
                right_option = None
                right_type = right.get('type', '') if isinstance(right, dict) else ''
                if right_type == 'option_value':
                    option = right.get('option', '')
                    if option in option_reverse_lookups:
                        right_option = option
                elif right_type == 'setting_value':  # Legacy support
                    setting = right.get('setting', '')
                    if setting in option_reverse_lookups:
                        right_option = setting

                # NEW: Handle case where option was resolved to a raw integer constant
                # and compared to a string option name (e.g., 0 == "vanilla")
                if not left_option and not right_option and op in ('==', '!='):
                    # Get raw values
                    left_val = left
                    right_val = right
                    if isinstance(left, dict) and left.get('type') == 'constant':
                        left_val = left.get('value')
                    if isinstance(right, dict) and right.get('type') == 'constant':
                        right_val = right.get('value')

                    # Check for int == string pattern
                    resolved_result = None
                    if isinstance(left_val, int) and isinstance(right_val, str):
                        for opt_name, reverse_lookup in option_reverse_lookups.items():
                            if right_val in reverse_lookup:
                                expected_int = reverse_lookup[right_val]
                                resolved_result = (left_val == expected_int) if op == '==' else (left_val != expected_int)
                                logger.debug(f"Resolved raw helper comparison {left_val} {op} '{right_val}' to {resolved_result}")
                                break
                    elif isinstance(right_val, int) and isinstance(left_val, str):
                        for opt_name, reverse_lookup in option_reverse_lookups.items():
                            if left_val in reverse_lookup:
                                expected_int = reverse_lookup[left_val]
                                resolved_result = (expected_int == right_val) if op == '==' else (expected_int != right_val)
                                logger.debug(f"Resolved raw helper comparison '{left_val}' {op} {right_val} to {resolved_result}")
                                break

                    if resolved_result is not None:
                        return {'type': 'constant', 'value': resolved_result}

                # Convert the other side if one side is a Choice option
                result = dict(node)
                if left_option:
                    result['right'] = convert_node(right, left_option)
                if right_option:
                    result['left'] = convert_node(left, right_option)

                # Also process any nested structures
                if not left_option and not right_option:
                    result['left'] = convert_node(left, context_option)
                    result['right'] = convert_node(right, context_option)

                return result

            # Handle constants - convert if we're in a Choice option context
            if node_type == 'constant' or node.get('rule') == 'Constant':
                value = node.get('value') if node_type == 'constant' else node.get('args', {}).get('value')
                if context_option and isinstance(value, str):
                    reverse_lookup = option_reverse_lookups.get(context_option, {})
                    if value in reverse_lookup:
                        numeric_value = reverse_lookup[value]
                        logger.debug(f"Converting string constant '{value}' to {numeric_value} for option {context_option}")
                        if node_type == 'constant':
                            return {'type': 'constant', 'value': numeric_value}
                        else:
                            return {'rule': 'Constant', 'args': {'value': numeric_value}, '_converted_from_ast': True}
                return node

            # Handle lists in comparisons (e.g., `x in ["easy", "default"]`)
            if node_type == 'list':
                if context_option:
                    new_values = []
                    for item in node.get('value', []):
                        new_values.append(convert_node(item, context_option))
                    return {'type': 'list', 'value': new_values}
                return node

            # Recursively process all dict values
            result = {}
            for key, value in node.items():
                if isinstance(value, dict):
                    result[key] = convert_node(value, context_option)
                elif isinstance(value, list):
                    result[key] = [convert_node(item, context_option) for item in value]
                else:
                    result[key] = value
            return result

        # Process all helper definitions
        return {name: convert_node(definition) for name, definition in helper_definitions.items()}

    def normalize_region_option_constants(
        self,
        regions_data: Dict[str, Any],
        option_definitions: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert string constants to numeric values in region access rules.

        This is the counterpart to normalize_helper_option_constants, but for
        access rules in regions (locations and exits) rather than helper definitions.

        Args:
            regions_data: The regions data containing locations and exits with access rules
            option_definitions: The option definitions containing name_lookup for Choice options

        Returns:
            The regions data with string constants converted to numeric values
        """
        if not regions_data or not option_definitions:
            return regions_data

        # Build reverse lookups for all Choice options: {"easy": 0, "default": 1, ...}
        option_reverse_lookups: Dict[str, Dict[str, int]] = {}
        for option_name, option_def in option_definitions.items():
            if option_def.get('type') == 'choice' and 'name_lookup' in option_def:
                reverse = {}
                for num_str, name in option_def['name_lookup'].items():
                    try:
                        reverse[name] = int(num_str)
                    except (ValueError, TypeError):
                        pass
                if reverse:
                    option_reverse_lookups[option_name] = reverse

        if not option_reverse_lookups:
            return regions_data

        def convert_node(node: Any, context_option: Optional[str] = None) -> Any:
            """Recursively process nodes, converting string constants when appropriate."""
            if not isinstance(node, dict):
                if isinstance(node, list):
                    return [convert_node(item, context_option) for item in node]
                return node

            node_type = node.get('type') or node.get('rule')

            # Handle comparisons - check if one side is an option_value/setting_value for a Choice option
            if node_type in ('compare', 'Compare'):
                # Handle both formats: {left, right} and {args: {left, right}}
                args = node.get('args', node)
                left = args.get('left', {})
                right = args.get('right', {})
                op = args.get('op', '==')

                # Check if left is an option_value or setting_value for a Choice option
                left_option = None
                left_type = left.get('type') or left.get('rule') if isinstance(left, dict) else None
                if left_type in ('option_value', 'OptionValue'):
                    left_args = left.get('args', left)
                    option = left_args.get('option', '')
                    if option in option_reverse_lookups:
                        left_option = option
                elif left_type in ('setting_value', 'AST_setting_value', 'SettingValue'):  # Legacy
                    left_args = left.get('args', left)
                    setting = left_args.get('setting', '')
                    if setting in option_reverse_lookups:
                        left_option = setting

                # Check if right is an option_value or setting_value for a Choice option
                right_option = None
                right_type = right.get('type') or right.get('rule') if isinstance(right, dict) else None
                if right_type in ('option_value', 'OptionValue'):
                    right_args = right.get('args', right)
                    option = right_args.get('option', '')
                    if option in option_reverse_lookups:
                        right_option = option
                elif right_type in ('setting_value', 'AST_setting_value', 'SettingValue'):  # Legacy
                    right_args = right.get('args', right)
                    setting = right_args.get('setting', '')
                    if setting in option_reverse_lookups:
                        right_option = setting

                # NEW: Handle case where option was resolved to a raw integer constant
                # and compared to a string option name (e.g., 0 == "vanilla")
                # This happens when self.options.X is resolved to its integer value during export
                if not left_option and not right_option and op in ('==', '!='):
                    # Get raw values (left/right could be raw int/str or wrapped in constant)
                    left_val = left
                    right_val = right
                    if isinstance(left, dict):
                        if left.get('type') == 'constant' or left.get('rule') == 'Constant':
                            left_val = left.get('value') if 'value' in left else left.get('args', {}).get('value')
                    if isinstance(right, dict):
                        if right.get('type') == 'constant' or right.get('rule') == 'Constant':
                            right_val = right.get('value') if 'value' in right else right.get('args', {}).get('value')

                    # Check for int == string pattern where string is a known option name
                    resolved_result = None
                    if isinstance(left_val, int) and isinstance(right_val, str):
                        # Look for an option where left_val maps to right_val
                        for opt_name, reverse_lookup in option_reverse_lookups.items():
                            if right_val in reverse_lookup:
                                expected_int = reverse_lookup[right_val]
                                if op == '==':
                                    resolved_result = left_val == expected_int
                                else:  # op == '!='
                                    resolved_result = left_val != expected_int
                                logger.debug(f"Resolved raw option comparison {left_val} {op} '{right_val}' to {resolved_result} (option {opt_name})")
                                break
                    elif isinstance(right_val, int) and isinstance(left_val, str):
                        # Look for an option where right_val maps to left_val
                        for opt_name, reverse_lookup in option_reverse_lookups.items():
                            if left_val in reverse_lookup:
                                expected_int = reverse_lookup[left_val]
                                if op == '==':
                                    resolved_result = expected_int == right_val
                                else:  # op == '!='
                                    resolved_result = expected_int != right_val
                                logger.debug(f"Resolved raw option comparison '{left_val}' {op} {right_val} to {resolved_result} (option {opt_name})")
                                break

                    # If we resolved the comparison to a boolean, return a True_/False_ rule
                    if resolved_result is not None:
                        if 'args' in node:
                            # Rule format
                            if resolved_result:
                                return {'rule': 'True_'}
                            else:
                                return {'rule': 'False_'}
                        else:
                            # AST format
                            if resolved_result:
                                return {'type': 'constant', 'value': True}
                            else:
                                return {'type': 'constant', 'value': False}

                # Convert the other side if one side is a Choice option
                if 'args' in node:
                    result = dict(node)
                    result['args'] = dict(args)
                    if left_option:
                        result['args']['right'] = convert_node(right, left_option)
                    if right_option:
                        result['args']['left'] = convert_node(left, right_option)
                    if not left_option and not right_option:
                        result['args']['left'] = convert_node(left, context_option)
                        result['args']['right'] = convert_node(right, context_option)
                    return result
                else:
                    result = dict(node)
                    if left_option:
                        result['right'] = convert_node(right, left_option)
                    if right_option:
                        result['left'] = convert_node(left, right_option)
                    if not left_option and not right_option:
                        result['left'] = convert_node(left, context_option)
                        result['right'] = convert_node(right, context_option)
                    return result

            # Handle constants - convert if we're in a Choice option context
            if node_type in ('constant', 'Constant'):
                if 'args' in node:
                    value = node.get('args', {}).get('value')
                else:
                    value = node.get('value')
                if context_option and isinstance(value, str):
                    reverse_lookup = option_reverse_lookups.get(context_option, {})
                    if value in reverse_lookup:
                        numeric_value = reverse_lookup[value]
                        logger.debug(f"Converting region constant '{value}' to {numeric_value} for option {context_option}")
                        if 'args' in node:
                            return {'rule': 'Constant', 'args': {'value': numeric_value}, '_converted_from_ast': True}
                        else:
                            return {'type': 'constant', 'value': numeric_value}
                return node

            # Handle lists in comparisons (e.g., `x in ["easy", "default"]`)
            if node_type == 'list':
                if context_option:
                    new_values = []
                    for item in node.get('value', []):
                        new_values.append(convert_node(item, context_option))
                    return {'type': 'list', 'value': new_values}
                return node

            # Recursively process all dict values
            result = {}
            for key, value in node.items():
                if isinstance(value, dict):
                    result[key] = convert_node(value, context_option)
                elif isinstance(value, list):
                    result[key] = [convert_node(item, context_option) for item in value]
                else:
                    result[key] = value
            return result

        # Process all regions
        result = {}
        for region_name, region_data in regions_data.items():
            if not isinstance(region_data, dict):
                result[region_name] = region_data
                continue

            new_region = dict(region_data)

            # Process location access rules
            if 'locations' in region_data:
                new_locations = []
                for loc in region_data['locations']:
                    if isinstance(loc, dict) and 'access_rule' in loc:
                        new_loc = dict(loc)
                        new_loc['access_rule'] = convert_node(loc['access_rule'])
                        new_locations.append(new_loc)
                    else:
                        new_locations.append(loc)
                new_region['locations'] = new_locations

            # Process exit access rules
            if 'exits' in region_data:
                new_exits = []
                for exit_data in region_data['exits']:
                    if isinstance(exit_data, dict) and 'access_rule' in exit_data:
                        new_exit = dict(exit_data)
                        new_exit['access_rule'] = convert_node(exit_data['access_rule'])
                        new_exits.append(new_exit)
                    else:
                        new_exits.append(exit_data)
                new_region['exits'] = new_exits

            result[region_name] = new_region

        return result

    def normalize_to_string_constants(
        self,
        data: Dict[str, Any],
        option_definitions: Dict[str, Any],
        data_type: str = 'helpers'
    ) -> Dict[str, Any]:
        """
        Convert numeric constants to string values when compared with Choice options.

        This is the reverse of normalize_helper_option_constants - used when
        EXPORT_CHOICE_OPTIONS_AS_NUMERIC is False and we need to convert numeric
        constants (from expression_resolver) back to string keys.

        Args:
            data: The data to process (helpers or regions)
            option_definitions: The option definitions containing name_lookup for Choice options
            data_type: Either 'helpers' or 'regions' to determine processing logic

        Returns:
            The data with numeric constants converted to string values
        """
        if not data or not option_definitions:
            return data

        # Build lookups for all Choice options: {0: "easy", 1: "default", ...}
        option_lookups: Dict[str, Dict[int, str]] = {}
        for option_name, option_def in option_definitions.items():
            if option_def.get('type') == 'choice' and 'name_lookup' in option_def:
                lookup = {}
                for num_str, name in option_def['name_lookup'].items():
                    try:
                        lookup[int(num_str)] = name
                    except (ValueError, TypeError):
                        pass
                if lookup:
                    option_lookups[option_name] = lookup

        if not option_lookups:
            return data

        def convert_node(node: Any, context_option: Optional[str] = None) -> Any:
            """Recursively process nodes, converting numeric constants to strings."""
            if not isinstance(node, dict):
                if isinstance(node, list):
                    return [convert_node(item, context_option) for item in node]
                return node

            node_type = node.get('type') or node.get('rule')

            # Handle comparisons
            if node_type in ('compare', 'Compare'):
                args = node.get('args', node)
                left = args.get('left', {})
                right = args.get('right', {})

                left_option = None
                left_type = left.get('type') or left.get('rule')
                if left_type in ('option_value', 'OptionValue'):
                    left_args = left.get('args', left)
                    option = left_args.get('option', '')
                    if option in option_lookups:
                        left_option = option
                elif left_type in ('setting_value', 'AST_setting_value', 'SettingValue'):  # Legacy
                    left_args = left.get('args', left)
                    setting = left_args.get('setting', '')
                    if setting in option_lookups:
                        left_option = setting

                right_option = None
                right_type = right.get('type') or right.get('rule')
                if right_type in ('option_value', 'OptionValue'):
                    right_args = right.get('args', right)
                    option = right_args.get('option', '')
                    if option in option_lookups:
                        right_option = option
                elif right_type in ('setting_value', 'AST_setting_value', 'SettingValue'):  # Legacy
                    right_args = right.get('args', right)
                    setting = right_args.get('setting', '')
                    if setting in option_lookups:
                        right_option = setting

                if 'args' in node:
                    result = dict(node)
                    result['args'] = dict(args)
                    if left_option:
                        result['args']['right'] = convert_node(right, left_option)
                    if right_option:
                        result['args']['left'] = convert_node(left, right_option)
                    if not left_option and not right_option:
                        result['args']['left'] = convert_node(left, context_option)
                        result['args']['right'] = convert_node(right, context_option)
                    return result
                else:
                    result = dict(node)
                    if left_option:
                        result['right'] = convert_node(right, left_option)
                    if right_option:
                        result['left'] = convert_node(left, right_option)
                    if not left_option and not right_option:
                        result['left'] = convert_node(left, context_option)
                        result['right'] = convert_node(right, context_option)
                    return result

            # Handle constants - convert numeric to string if in Choice option context
            if node_type in ('constant', 'Constant'):
                if 'args' in node:
                    value = node.get('args', {}).get('value')
                else:
                    value = node.get('value')
                if context_option and isinstance(value, int):
                    lookup = option_lookups.get(context_option, {})
                    if value in lookup:
                        string_value = lookup[value]
                        logger.debug(f"Converting constant {value} to '{string_value}' for option {context_option}")
                        if 'args' in node:
                            return {'rule': 'Constant', 'args': {'value': string_value}, '_converted_from_ast': True}
                        else:
                            return {'type': 'constant', 'value': string_value}
                return node

            # Handle lists
            if node_type == 'list':
                if context_option:
                    new_values = [convert_node(item, context_option) for item in node.get('value', [])]
                    return {'type': 'list', 'value': new_values}
                return node

            # Recursively process all dict values
            result = {}
            for key, value in node.items():
                if isinstance(value, dict):
                    result[key] = convert_node(value, context_option)
                elif isinstance(value, list):
                    result[key] = [convert_node(item, context_option) for item in value]
                else:
                    result[key] = value
            return result

        if data_type == 'helpers':
            return {name: convert_node(definition) for name, definition in data.items()}
        elif data_type == 'regions':
            result = {}
            for region_name, region_data in data.items():
                if not isinstance(region_data, dict):
                    result[region_name] = region_data
                    continue

                new_region = dict(region_data)

                if 'locations' in region_data:
                    new_locations = []
                    for loc in region_data['locations']:
                        if isinstance(loc, dict) and 'access_rule' in loc:
                            new_loc = dict(loc)
                            new_loc['access_rule'] = convert_node(loc['access_rule'])
                            new_locations.append(new_loc)
                        else:
                            new_locations.append(loc)
                    new_region['locations'] = new_locations

                if 'exits' in region_data:
                    new_exits = []
                    for exit_data in region_data['exits']:
                        if isinstance(exit_data, dict) and 'access_rule' in exit_data:
                            new_exit = dict(exit_data)
                            new_exit['access_rule'] = convert_node(exit_data['access_rule'])
                            new_exits.append(new_exit)
                        else:
                            new_exits.append(exit_data)
                    new_region['exits'] = new_exits

                result[region_name] = new_region
            return result

        return data
