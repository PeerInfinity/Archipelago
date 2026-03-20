"""
Rule code generator - converts AST format rules to Python Rule Builder code.

This module transforms JSON rule definitions into Python source code
that uses the Rule Builder pattern.
"""

import copy
import logging
import sys
from typing import Any, Dict, List, Set, Tuple, Optional

from rule_builder import BOOLEAN_RULE_TYPES
from ._codegen_utils import (
    ANALYZER_BOOL_TYPES,
    ANALYZER_RUNTIME_TYPES,
    is_placement_lookup,
    extract_placement_location,
    extract_items_from_list,
    check_placement_comparison,
    escape_string,
    generate_world_attribute_expr,
    extract_constant,
    get_helper_function_name,
)
from ._rule_analysis import RuleAnalysisMixin
from ._rule_expressions import RuleExpressionMixin
from ._rule_converters import RuleConverterMixin
from ._helper_codegen import HelperCodeGenerator


class RuleCodeGenerator(
    RuleConverterMixin,
    RuleExpressionMixin,
    RuleAnalysisMixin,
):
    """Generates Python Rule Builder code from AST format rules."""

    def __init__(self, game_name: str = "", settings: Dict[str, Any] = None,
                 option_definitions: Dict[str, Any] = None) -> None:
        self.required_imports: Set[str] = set()
        self.game_name = game_name
        self.settings = settings or {}  # Resolved settings for evaluating setting_value nodes
        self.option_definitions = option_definitions or {}  # Option definitions for Choice value lookups
        # Sanitize game name for use in Python identifiers
        import re
        self.game_name_lower = re.sub(r'[^a-zA-Z0-9]', '', game_name).lower() if game_name else ""
        self.known_helpers: Set[str] = set()
        self.helper_bodies: Dict[str, Dict[str, Any]] = {}  # helper_name -> AST format body
        self._inline_counter: int = 0  # Counter for generating unique variable prefixes
        self.entrance_regions: Dict[str, str] = {}  # entrance_name -> parent_region_name
        self.entrance_connections: Dict[str, str] = {}  # entrance_name -> connected_region_name
        # Context for current location/entrance being processed
        # Used to substitute 'location' or 'entrance' variable references
        self._current_location: Optional[str] = None
        self._current_entrance: Optional[str] = None
        # Items that can actually be obtained (in pool, canonical placements, or starting inventory)
        # Used to detect unsatisfiable Has rules referencing virtual/computed items
        self.obtainable_items: Optional[Set[str]] = None

    def set_obtainable_items(self, items: Set[str]) -> None:
        """Set the items that can actually be obtained during gameplay."""
        self.obtainable_items = items

    def reset(self) -> None:
        """Reset state for a new generation run."""
        self.required_imports = set()
        self._inline_counter = 0

    def set_context(self, location: Optional[str] = None, entrance: Optional[str] = None) -> None:
        """Set the current context for variable substitution.

        When generating rules for a specific location or entrance, set the context
        so that references to 'location' or 'entrance' variables can be substituted
        with the appropriate multiworld.get_*() lookup.
        """
        self._current_location = location
        self._current_entrance = entrance

    def set_helpers(self, helper_names: Set[str], helper_bodies: Dict[str, Dict[str, Any]] = None,
                     helper_params: Dict[str, List[str]] = None,
                     helper_defaults: Dict[str, Dict[str, Any]] = None,
                     placements: Dict[str, str] = None) -> None:
        """Set known helpers and optionally their bodies, params, defaults, and placements for explain support."""
        self.known_helpers = helper_names
        self.helper_bodies = helper_bodies or {}
        self.helper_params = helper_params or {}  # helper_name -> list of param names
        self.helper_defaults = helper_defaults or {}  # helper_name -> dict of param_name -> default_value
        self.placements = placements or {}  # location_name -> item_name

    def set_entrance_regions(self, entrance_regions: Dict[str, str]) -> None:
        """Set the entrance-to-parent-region mapping.

        This is used to resolve Attribute rules like `entrance.parent_region`
        when the entrance name is known. For example, 'kikiskip.parent_region'
        would resolve to the parent region of the 'Kiki Skip' entrance.

        Args:
            entrance_regions: Dict mapping entrance name (lowercase) to parent region name
        """
        self.entrance_regions = entrance_regions

    def set_entrance_connections(self, entrance_connections: Dict[str, str]) -> None:
        """Set the entrance-to-connected-region mapping.

        This is used to resolve dict_lambda_lookup patterns like:
            rule_map.get(world.get_entrance('X').connected_region.name, default)

        When entrance shuffle is vanilla, we know the exact connections at export
        time, so we can resolve the key and return just the matching case instead
        of OR'ing all cases together.

        Args:
            entrance_connections: Dict mapping entrance name to connected region name
        """
        self.entrance_connections = entrance_connections or {}

    def _expand_helper_refs(self, rule: Dict[str, Any], visited: Set[str] = None, depth: int = 0) -> Dict[str, Any]:
        """
        Recursively expand helper references in a rule body.

        This ensures helper bodies are self-contained and don't reference other helpers
        or setting values, which allows the frontend to evaluate rules without needing
        helper or settings lookups.

        Note: Nested helpers (depth > 0) are NOT expanded to avoid creating overly complex
        rules. The frontend will look them up from the helpers dict instead.

        Args:
            rule: Rule dict in AST format
            visited: Set of helper names already visited (for cycle detection)
            depth: Current expansion depth. Only expand at depth 0 (top level).

        Returns:
            Rule dict with helper references and setting_value references expanded
        """
        if visited is None:
            visited = set()

        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type', '')
        rb_rule = rule.get('rule', '')  # Rule Builder format uses 'rule' key

        # Handle Rule Builder format AST_setting_value - resolve to constant
        # This is critical for short-circuiting conditionals based on option values
        if rb_rule == 'AST_setting_value':
            args = rule.get('args', {})
            setting_name = args.get('setting', '')
            if setting_name in self.settings:
                value = self.settings[setting_name]
                return {'type': 'constant', 'value': value}
            return rule

        # Handle Rule Builder format Conditional - check for constant test
        if rb_rule == 'Conditional':
            args = rule.get('args', {})
            expanded_test = self._expand_helper_refs(args.get('test', {}), visited, depth)
            expanded_if_true = self._expand_helper_refs(args.get('if_true', {}), visited, depth)
            expanded_if_false = self._expand_helper_refs(args.get('if_false', {}), visited, depth)

            # If test resolved to a constant boolean, short-circuit to the appropriate branch
            if isinstance(expanded_test, dict) and expanded_test.get('type') == 'constant':
                test_value = expanded_test.get('value')
                if test_value is True or test_value == 'true':
                    return expanded_if_true
                elif test_value is False or test_value == 'false':
                    return expanded_if_false

            # Can't short-circuit - return expanded conditional
            return {
                'rule': 'Conditional',
                'args': {
                    'test': expanded_test,
                    'if_true': expanded_if_true,
                    'if_false': expanded_if_false
                }
            }

        # If this is a helper reference, expand it (only at top level to avoid overly complex rules)
        if rule_type == 'helper':
            helper_name = rule.get('name', '')
            if helper_name in visited:
                # Circular reference - return as-is to avoid infinite loop
                return rule
            # Only expand helpers at depth 0 (top level rules)
            # Nested helpers (depth > 0) are left as references for frontend lookup
            # Also don't expand helpers that have block bodies - they're too complex
            # and will be handled as Python helper functions instead
            helper_body = self.helper_bodies.get(helper_name)
            is_block_body = helper_body and helper_body.get('type') == 'block'
            if depth == 0 and helper_name in self.helper_bodies and not is_block_body:
                # Expand the helper body, marking this helper as visited
                new_visited = visited | {helper_name}
                # Use depth + 1 so nested helper references won't be expanded
                expanded_body = self._expand_helper_refs(self.helper_bodies[helper_name], new_visited, depth + 1)

                # Rename local variables to avoid collision with outer scope
                # This is critical when inlining nested helpers that use the same
                # variable names (e.g., both outer and inner helper use 'depth')
                self._inline_counter += 1
                prefix = f"_h{self._inline_counter}_"
                expanded_body = self._rename_local_variables(expanded_body, prefix)

                # If this helper has parameters, substitute parameter names with argument expressions
                if helper_name in self.helper_params:
                    params = self.helper_params[helper_name]
                    args = rule.get('args', [])
                    defaults = self.helper_defaults.get(helper_name, {})
                    if params:
                        # Create a mapping from parameter names to argument expressions
                        # Use provided args first, then fall back to defaults
                        param_to_arg = {}
                        for i, param in enumerate(params):
                            if i < len(args):
                                param_to_arg[param] = args[i]
                            elif param in defaults:
                                # Convert default value to AST format constant
                                param_to_arg[param] = {'type': 'constant', 'value': defaults[param]}
                        # Substitute parameter references in the expanded body
                        if param_to_arg:
                            expanded_body = self._substitute_names(expanded_body, param_to_arg)

                return expanded_body
            # Unknown helper - return as-is
            return rule

        # If this is a setting_value reference, resolve it to a constant
        # This is critical because worldgen worlds don't have the original game options
        if rule_type == 'setting_value':
            setting_name = rule.get('setting', '')
            if setting_name in self.settings:
                value = self.settings[setting_name]
                # Handle indexed access into list settings (e.g., required_medallions[0])
                if 'index' in rule and isinstance(value, list):
                    index = rule['index']
                    if 0 <= index < len(value):
                        value = value[index]
                return {'type': 'constant', 'value': value}
            # Unknown setting - return as-is (will evaluate to undefined in frontend)
            return rule

        # If this is an attribute access on a setting_value (e.g., world.options.goal.value),
        # resolve it to a constant
        if rule_type == 'attribute':
            obj = rule.get('object', {})
            attr = rule.get('attr', '')
            if isinstance(obj, dict) and obj.get('type') == 'setting_value' and attr == 'value':
                setting_name = obj.get('setting', '')
                if setting_name in self.settings:
                    return {'type': 'constant', 'value': self.settings[setting_name]}
            # Also handle self.xxx attribute access (e.g., self.flag_specific_keycards)
            # These are option-dependent flags from LogicExtensions classes
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'self':
                if attr in self.settings:
                    return {'type': 'constant', 'value': self.settings[attr]}

        # Note: placement_lookup rules are preserved as-is for runtime evaluation
        # via location_item_name() calls. We don't resolve them statically anymore.

        # For conditional rules, try to statically evaluate the test after expansion
        # ONLY if the test is a placement_lookup comparison (to avoid JavaScript array comparison issues)
        # Be conservative - don't optimize away complex runtime logic
        if rule_type == 'conditional':
            expanded_test = self._expand_helper_refs(rule.get('test', {}), visited, depth)
            expanded_if_true = self._expand_helper_refs(rule.get('if_true', {}), visited, depth)
            expanded_if_false = self._expand_helper_refs(rule.get('if_false', {}), visited, depth)

            # First check if test is a constant boolean - simplify if so
            if isinstance(expanded_test, dict) and expanded_test.get('type') == 'constant':
                test_value = expanded_test.get('value')
                if test_value is True:
                    return expanded_if_true
                elif test_value is False:
                    return expanded_if_false

            # Only try static evaluation for placement_lookup comparisons
            # These need to be evaluated statically because JS can't compare arrays by value
            if self._is_placement_comparison(expanded_test):
                static_result = self._try_static_eval(expanded_test)
                if static_result is True:
                    return expanded_if_true
                elif static_result is False:
                    return expanded_if_false
            # Can't statically evaluate - return the expanded conditional
            return {
                'type': 'conditional',
                'test': expanded_test,
                'if_true': expanded_if_true,
                'if_false': expanded_if_false
            }

        # For other rule types, recursively expand any nested rules
        result = dict(rule)
        for key, value in rule.items():
            if isinstance(value, dict):
                result[key] = self._expand_helper_refs(value, visited, depth)
            elif isinstance(value, list):
                result[key] = [
                    self._expand_helper_refs(item, visited, depth) if isinstance(item, dict) else item
                    for item in value
                ]
        return result

    def get_function_name(self, helper_name: str) -> str:
        """Get the Python function name for a helper."""
        return get_helper_function_name(helper_name)

    def _contains_dynamic_reference(self, value: Any, depth: int = 0) -> bool:
        """
        Check if a value contains dynamic references (option_value, setting_value, etc.)
        that cannot be statically resolved at generation time.

        Args:
            value: A rule dict, primitive, or nested structure
            depth: Recursion depth for cycle prevention

        Returns:
            True if the value contains dynamic references
        """
        if depth > 20:
            return True  # Assume dynamic at max depth

        if not isinstance(value, dict):
            return False

        value_type = value.get('type', '')

        # These types represent dynamic runtime values
        dynamic_types = {
            'option_value',
            'setting_value',
            'world_attribute',
            'attribute',  # attribute access can wrap option_value
        }

        if value_type in dynamic_types:
            return True

        # Recursively check all dict values
        for v in value.values():
            if isinstance(v, dict):
                if self._contains_dynamic_reference(v, depth + 1):
                    return True
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, dict) and self._contains_dynamic_reference(item, depth + 1):
                        return True

        return False

    def _is_rule_builder_convertible(self, rule: Dict[str, Any], depth: int = 0) -> bool:
        """
        Check if a rule can be converted to a native Rule Builder expression.

        This is used to determine if a helper body can be converted to body_rule
        for HelperCall, enabling Tier 1 explain support (full state-aware explain).

        Convertible types are those that produce boolean results and have
        corresponding Rule Builder classes with explain_json support.

        Args:
            rule: AST format rule dict
            depth: Recursion depth for cycle prevention

        Returns:
            True if the rule can be fully converted to Rule Builder format
        """
        if depth > 20:
            return False  # Prevent infinite recursion

        if not isinstance(rule, dict):
            # Primitive values are convertible (as constants)
            return True

        rule_type = rule.get('type', '')

        # Handle Rule Builder format ('rule' key)
        if not rule_type:
            rb_rule = rule.get('rule', '')
            if rb_rule in ('True_', 'False_', 'Has', 'HasAll', 'HasAny', 'HasGroup',
                          'HasFromList', 'HasFromListUnique', 'And', 'Or', 'Not',
                          'CanReachRegion', 'CanReachLocation', 'CanReachEntrance',
                          'Compare', 'Conditional', 'HelperCall', 'helper'):
                # Check children recursively
                for child in rule.get('children', []):
                    if not self._is_rule_builder_convertible(child, depth + 1):
                        return False
                return True
            # Unknown Rule Builder type
            return False

        # Convertible AST types (produce boolean, have Rule Builder equivalents)
        # state_method is excluded here — only specific methods are convertible (checked below)
        convertible_types = ANALYZER_BOOL_TYPES - {'state_method'}

        if rule_type not in convertible_types:
            # Special case: state_method with 'has' is convertible
            if rule_type == 'state_method':
                method = rule.get('method', '')
                if method in ('has', 'has_all', 'has_any', 'has_group'):
                    return True
            # Special case: conditional is convertible if all branches are
            if rule_type == 'conditional':
                test = rule.get('test', {})
                if_true = rule.get('if_true', {})
                if_false = rule.get('if_false', {})
                return (self._is_rule_builder_convertible(test, depth + 1) and
                        self._is_rule_builder_convertible(if_true, depth + 1) and
                        self._is_rule_builder_convertible(if_false, depth + 1))
            return False

        # For item_check and count_check, verify the item name and count are constants
        # (not dynamic references like world_attribute, option_value, etc.)
        if rule_type in ('item_check', 'count_check', 'group_check'):
            item = rule.get('item') or rule.get('group')
            if isinstance(item, dict) and item.get('type') in ('world_attribute', 'setting_value', 'option_value', 'attribute'):
                # Dynamic item reference - not convertible to static Rule Builder
                return False
            # Also check the count field - dynamic counts can't be statically converted
            count = rule.get('count')
            if self._contains_dynamic_reference(count):
                return False

        # Recursively check nested rules
        nested_keys = ['conditions', 'condition', 'operand', 'left', 'right',
                       'test', 'if_true', 'if_false']
        for key in nested_keys:
            nested = rule.get(key)
            if nested is None:
                continue
            if isinstance(nested, list):
                for item in nested:
                    if isinstance(item, dict) and not self._is_rule_builder_convertible(item, depth + 1):
                        return False
            elif isinstance(nested, dict):
                if not self._is_rule_builder_convertible(nested, depth + 1):
                    return False

        return True

    def _try_convert_helper_body_to_rule(self, helper_name: str, args: List[Any]) -> Optional[str]:
        """
        Try to convert a helper body to a Rule Builder expression.

        This enables Tier 1 support in HelperCall: if the helper body can be
        converted to a Rule Builder rule, we include it as body_rule for
        full state-aware explain support.

        Args:
            helper_name: Name of the helper
            args: Arguments passed to the helper

        Returns:
            Rule Builder expression string if convertible, None otherwise
        """
        if helper_name not in self.helper_bodies:
            return None

        helper_body = self.helper_bodies[helper_name]

        # Block bodies are too complex to convert
        if isinstance(helper_body, dict) and helper_body.get('type') == 'block':
            return None

        # Check if the helper body is convertible
        if not self._is_rule_builder_convertible(helper_body):
            return None

        # Expand the helper body with parameter substitution
        expanded_body = copy.deepcopy(helper_body)

        # Substitute parameters with argument values
        if helper_name in self.helper_params:
            params = self.helper_params[helper_name]
            defaults = self.helper_defaults.get(helper_name, {})
            param_to_arg = {}

            for i, param in enumerate(params):
                if i < len(args):
                    arg = args[i]
                    # Convert arg to AST format if needed
                    if isinstance(arg, dict) and arg.get('type') == 'constant':
                        param_to_arg[param] = arg
                    elif isinstance(arg, dict) and arg.get('rule') == 'Constant':
                        # Rule Builder format constant
                        param_to_arg[param] = {'type': 'constant', 'value': arg.get('args', {}).get('value')}
                    else:
                        # Wrap primitive value as constant
                        param_to_arg[param] = {'type': 'constant', 'value': arg}
                elif param in defaults:
                    param_to_arg[param] = {'type': 'constant', 'value': defaults[param]}

            if param_to_arg:
                expanded_body = self._substitute_names(expanded_body, param_to_arg)

        # Also expand setting_value references
        expanded_body = self._expand_helper_refs(expanded_body)

        # Try to convert the expanded body
        try:
            rule_code = self._convert_rule(expanded_body)
            # Verify it's not just True_() placeholder (which means conversion failed)
            if rule_code and rule_code != 'True_()':
                return rule_code
        except Exception:
            pass

        return None

    def get_imports(self) -> List[str]:
        """Get the list of required Rule Builder imports."""
        # Always include base imports
        imports = ['True_', 'False_']

        # Add any imports we discovered during generation
        imports.extend(sorted(self.required_imports))

        return imports

    def generate(self, rule: Optional[Dict[str, Any]]) -> str:
        """
        Convert an AST format rule to Python Rule Builder expression.

        Args:
            rule: Rule dict in AST format, or None

        Returns:
            Python expression string using Rule Builder classes
        """
        if rule is None:
            self.required_imports.add('True_')
            return 'True_()'

        # Expand helper references and resolve setting_value references first.
        # This allows conditionals with setting-based tests to be short-circuited
        # when the setting evaluates to a constant boolean, avoiding generation
        # of unreachable branches that may contain unresolvable expressions
        # (like dynamic location lookups that only apply when a setting is false).
        expanded_rule = self._expand_helper_refs(rule)
        return self._convert_rule(expanded_rule)

    def _convert_rule(self, rule: Dict[str, Any]) -> str:
        """Internal recursive rule converter."""
        if not isinstance(rule, dict):
            # Primitive value
            if rule is True:
                return 'True_()'
            elif rule is False:
                return 'False_()'
            else:
                return repr(rule)

        # Check for 'type' key (AST format) or 'rule' key (Rule Builder format)
        rule_type = rule.get('type', '') or ''

        # If no 'type', check for 'rule' key (Rule Builder format from exporter)
        if not rule_type:
            rb_rule = rule.get('rule', '')
            if rb_rule:
                # Map Rule Builder format rule names to converter types
                rb_to_type = {
                    'And': 'and',
                    'Or': 'or',
                    'Not': 'not',
                    'Has': 'item_check',
                    'HasAll': 'group_check',
                    'HasAny': 'group_check',
                    'HasAllCounts': 'group_check',
                    'HasGroup': 'group_check',
                    'HasGroupUnique': 'has_group_unique',
                    'HasFromList': 'has_from_list',
                    'HasFromListUnique': 'has_from_list_unique',
                    'Count': 'count_check',
                    'CountItem': 'count_item',
                    'CanReachRegion': 'can_reach',
                    'CanReachLocation': 'location_check',
                    'CanReachEntrance': 'entrance_check',
                    'EntranceAccessRule': 'entrance_access_rule',
                    'True_': 'constant',
                    'False_': 'constant',
                    'Helper': 'helper',
                    'StateMethod': 'state_method',
                    'Compare': 'compare',
                    'Constant': 'constant',
                    'AST_all_of': 'ast_all_of',
                    'AST_any_of': 'ast_any_of',
                    'AST_prog_item_count': 'prog_item_count',  # State counter items like coins
                    'Arithmetic': 'binary_op',
                    'SettingValue': 'setting_value',  # Legacy
                    'OptionValue': 'option_value',
                    'WorldAttribute': 'world_attribute',
                    'Conditional': 'conditional',
                    'Name': 'name',  # Option/setting references
                    'CountItem': 'count_item',  # Item count for arithmetic/comparisons
                    'AST_min': 'min',  # Min operation from AST export
                    'List': 'list',  # Rule Builder format list for comparisons
                    'AST_group_count': 'AST_group_count',  # Group count for comparisons (state.count_group)
                    'group_count': 'group_count',  # Group count for comparisons
                }
                rule_type = rb_to_type.get(rb_rule, '')

                # Convert Rule Builder format to Python code
                if rule_type:
                    return self._convert_rule_builder_format(rule, rb_rule, rule_type)

                # Check if this is a weighted_sum helper (used by Overcooked 2 and similar games)
                if rb_rule == 'weighted_sum' and rule.get('_original_ast_type', '').endswith('helper'):
                    return self._convert_weighted_sum(rule)

                # Check if this is a unique_count helper (used by A Hat in Time for Enemy/Boss counting)
                if rb_rule == 'unique_count' and rule.get('_original_ast_type', '').endswith('helper'):
                    return self._convert_unique_count(rule)

                # Check if this is a helper call from AST exporter format
                # AST exporter outputs helpers with rule=helper_name and _original_ast_type="helper"
                # Also check known_helpers for helpers without the _original_ast_type marker
                if rule.get('_original_ast_type', '').endswith('helper') or rb_rule in self.known_helpers:
                    return self._convert_rule_builder_helper(rule, rb_rule)

                # Check if this is an AST_count_true rule (exported from AST format count_true)
                if rb_rule == 'AST_count_true':
                    args = rule.get('args', {})
                    return self._convert_count_true_from_args(args)

                # Check if this is an AST_comparison rule (comparison operators from AST format)
                if rb_rule == 'AST_comparison':
                    args = rule.get('args', {})
                    compare_rule = {
                        'type': 'compare',
                        'left': args.get('left', {}),
                        'op': args.get('op', ''),
                        'right': args.get('right', {})
                    }
                    return self._convert_compare(compare_rule)

                # Check if this is an AST_setting_value rule (setting references from AST format)
                if rb_rule == 'AST_setting_value':
                    args = rule.get('args', {})
                    setting_rule = {
                        'type': 'setting_value',
                        'setting': args.get('setting', '')
                    }
                    return self._convert_setting_value(setting_rule)

                # Check if this is an AST_location_rule_ref rule (location accessibility check from AST format)
                if rb_rule == 'AST_location_rule_ref':
                    args = rule.get('args', {})
                    location_rule = {
                        'type': 'location_rule_ref',
                        'location': args.get('location', '')
                    }
                    return self._convert_location_rule_ref(location_rule)

                # Check if this is an AST_region_check rule (region accessibility check from AST format)
                if rb_rule == 'AST_region_check':
                    args = rule.get('args', {})
                    region_rule = {
                        'type': 'can_reach',
                        'region': args.get('region', '')
                    }
                    return self._convert_can_reach_region(region_rule)

                # Check if this is an AST_placement_lookup rule (placement lookup from AST format)
                if rb_rule == 'AST_placement_lookup':
                    args = rule.get('args', {})
                    placement_rule = {
                        'type': 'placement_lookup',
                        'location': {'type': 'constant', 'value': args.get('location', '')}
                    }
                    return self._convert_placement_lookup(placement_rule)

                # Check if this is an AST_placement_search rule (check if item is at any of listed locations)
                if rb_rule == 'AST_placement_search':
                    args = rule.get('args', {})
                    item_name = args.get('item', '')
                    locations = args.get('locations', [])
                    # Build location pairs list for item_name_in_location_names
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

                # Check if this is an AST_function_call rule (option.to_bool() style calls)
                if rb_rule == 'AST_function_call':
                    return self._convert_ast_function_call(rule)

                # Check if this is an AST_capability rule (capability check converted from can_X helpers)
                # AST_capability with capability "defeat_enough_rbms" -> can_defeat_enough_rbms(state, player)
                if rb_rule == 'AST_capability':
                    args = rule.get('args', {})
                    capability = args.get('capability', '')
                    if capability:
                        helper_name = f'can_{capability}'
                        # Check if this helper exists in known_helpers
                        if helper_name in self.known_helpers:
                            self.required_imports.add('HelperCall')
                            func_name = self.get_function_name(helper_name)
                            # Generate a HelperCall for the helper function
                            return f'HelperCall({func_name})'
                    # Unknown capability - fall through to True_()

                # Check if this is an AST_dict_lambda_lookup rule (dict.get(key, default) pattern)
                if rb_rule == 'AST_dict_lambda_lookup':
                    args = rule.get('args', {})
                    lookup_rule = {
                        'type': 'dict_lambda_lookup',
                        'dict_name': args.get('dict_name', ''),
                        'key': args.get('key', {}),
                        'cases': args.get('cases', {}),
                        'default': args.get('default', {'rule': 'False_'})
                    }
                    return self._convert_dict_lambda_lookup(lookup_rule)

        # Dispatch based on rule type
        converters = {
            'constant': self._convert_constant,
            'item_check': self._convert_item_check,
            'item_check_any': self._convert_item_check_any,
            'item_check_all': self._convert_item_check_all,
            'count_check': self._convert_count_check,
            'group_check': self._convert_group_check,
            'and': self._convert_and,
            'or': self._convert_or,
            'can_reach': self._convert_can_reach_region,
            'region_check': self._convert_can_reach_region,
            'location_check': self._convert_location_check,
            'location_rule_ref': self._convert_location_rule_ref,
            'can_reach_entrance': self._convert_can_reach_entrance,
            'state_method': self._convert_state_method,
            'not': self._convert_not,
            'helper': self._convert_helper,
            'compare': self._convert_compare,
            'comparison': self._convert_compare,
            'conditional': self._convert_conditional,
            'name': self._convert_name,
            'placement_lookup': self._convert_placement_lookup,
            'list': self._convert_list,
            'binary_op': self._convert_binary_op,
            'sum': self._convert_sum,
            'setting_value': self._convert_setting_value,
            'world_attribute': self._expr_world_attribute,
            'option_value': self._expr_option_value,
            'ast_all_of': self._convert_ast_all_of,
            'ast_any_of': self._convert_ast_any_of,
            'count_true': self._convert_count_true,
            'block': self._convert_ast_block,
            'AST_group_count': self._convert_ast_group_count,
            'group_count': self._convert_ast_group_count,
            'dict_lambda_lookup': self._convert_dict_lambda_lookup,
        }

        converter = converters.get(rule_type)
        if converter:
            return converter(rule)

        # Check for AST_block in Rule Builder format
        rb_rule = rule.get('rule', '')
        if rb_rule == 'AST_block':
            return self._convert_ast_block(rule)

        # Unknown rule type - return True_() as placeholder
        # Don't use inline comments as they break multi-line expressions
        return 'True_()'

    def _convert_name(self, rule: Dict[str, Any]) -> str:
        """Convert a name reference to a constant or context lookup.

        Names typically reference game settings/options. Since worldgen worlds
        don't have the original game options, we resolve them to constants.

        Special handling for 'location' and 'entrance': when context is set,
        these are substituted with multiworld.get_*() lookups.
        """
        name = rule.get('name', '')
        # Check for location/entrance context substitution
        if name == 'location' and self._current_location:
            escaped = self._current_location.replace('\\', '\\\\').replace('"', '\\"')
            return f'multiworld.get_location("{escaped}", player)'
        if name == 'entrance' and self._current_entrance:
            escaped = self._current_entrance.replace('\\', '\\\\').replace('"', '\\"')
            return f'multiworld.get_entrance("{escaped}", player)'
        # Otherwise treat as a setting reference and resolve to constant
        return self._resolve_setting_to_bool(name, default=False)

    def _convert_constant(self, rule: Dict[str, Any]) -> str:
        """Convert constant rule - preserves type (bool, int, float, etc.)."""
        value = rule.get('value', True)
        # Preserve numeric values for use in arithmetic/comparison contexts
        if isinstance(value, bool):
            return self._make_bool_constant(value)
        elif isinstance(value, int):
            # Integer 0 and 1 are often boolean toggle values from options
            # These need to be converted to False_()/True_() when used in boolean contexts
            # (e.g., inside Not(), And(), Or())
            # Other integers are preserved for arithmetic operations
            if value == 0:
                return self._make_bool_constant(False)
            elif value == 1:
                return self._make_bool_constant(True)
            else:
                return repr(value)
        elif isinstance(value, float):
            return repr(value)
        else:
            # For other types (strings, etc.), use boolean interpretation
            return self._make_bool_constant(bool(value))

    def _convert_list(self, rule: Dict[str, Any]) -> str:
        """Convert list rule to Python list literal.

        List rules are used for things like 'in' comparisons where we need
        to check if a value is in a list of expected values.
        """
        items = rule.get('value', [])
        converted_items = []
        for item in items:
            if isinstance(item, dict):
                item_type = item.get('type', '')
                if item_type == 'constant':
                    converted_items.append(repr(item.get('value')))
                elif item_type == 'list':
                    # Nested list - recursively convert
                    converted_items.append(self._convert_list(item))
                else:
                    # Other rule types - convert recursively
                    converted_items.append(self._convert_rule(item))
            else:
                # Raw value
                converted_items.append(repr(item))
        return f'[{", ".join(converted_items)}]'

    def _resolve_items_list_expression(self, items: Any) -> Optional[List[str]]:
        """
        Resolve an items expression to a list of item names.

        Handles patterns like:
        - list(dict.values()) where dict is a constant
        - Direct list of strings
        - Helper expressions wrapping dict.values()

        Args:
            items: The items expression (can be a list, dict, or complex expression)

        Returns:
            List of item names if resolvable, None otherwise
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
                    # Skip None or non-string values silently
                else:
                    return None  # Contains non-resolvable items
            return result

        if not isinstance(items, dict):
            return None

        # Handle helper pattern: {"type": "helper", "name": "list", "args": [...]}
        if items.get('type') == 'helper' and items.get('name') == 'list':
            helper_args = items.get('args', [])
            if len(helper_args) == 1:
                inner_arg = helper_args[0]
                # Check for function_call pattern (dict.values())
                if isinstance(inner_arg, dict) and inner_arg.get('type') == 'function_call':
                    return self._extract_dict_values(inner_arg)
                # Check for generator_expression pattern (list comprehension)
                if isinstance(inner_arg, dict) and inner_arg.get('type') == 'generator_expression':
                    return self._extract_from_generator_expression(inner_arg)
            return None

        # Handle direct function_call pattern
        if items.get('type') == 'function_call':
            return self._extract_dict_values(items)

        # Handle direct generator_expression pattern
        if items.get('type') == 'generator_expression':
            return self._extract_from_generator_expression(items)

        return None

    def _extract_from_generator_expression(self, gen_expr: dict) -> Optional[List[str]]:
        """
        Extract items from a generator expression pattern.

        Expected patterns:
        - list(key for key, _ in dict.items()) -> returns dict keys
        - list(value for _, value in dict.items()) -> returns dict values

        Returns:
            List of extracted items, or None if pattern not supported
        """
        element = gen_expr.get('element', {})
        comprehension = gen_expr.get('comprehension', {})

        # Get the iterator (should be dict.items() or dict.keys() or dict.values())
        iterator = comprehension.get('iterator', {})
        if not isinstance(iterator, dict) or iterator.get('type') != 'function_call':
            return None

        function = iterator.get('function', {})
        if not isinstance(function, dict) or function.get('type') != 'attribute':
            return None

        attr = function.get('attr', '')
        obj = function.get('object', {})

        # Check for .items(), .keys(), or .values() on a constant dict
        if not isinstance(obj, dict) or obj.get('type') != 'constant':
            return None

        const_value = obj.get('value', {})
        if not isinstance(const_value, dict):
            return None

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
                                elif isinstance(v, dict) and '_namedtuple_type' in v:
                                    # NamedTuple - we want the item name (the key)
                                    pass
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

        return None

    def _extract_dict_values(self, func_call: dict) -> Optional[List[str]]:
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
            List of item names (dict values) if pattern matches, None otherwise
        """
        function = func_call.get('function', {})

        # Check for attribute access pattern
        if not isinstance(function, dict) or function.get('type') != 'attribute':
            return None

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

        return None

    def _extract_constant_value(self, value: Any, default: Any = None) -> Any:
        """
        Extract a constant value from either a raw value or a constant rule dict.

        Args:
            value: Either a raw value (int, str, etc.) or a dict like {"type": "constant", "value": X}
                   or an f_string where all parts are constants
            default: Default value if extraction fails

        Returns:
            The extracted constant value
        """
        if isinstance(value, dict):
            if value.get('type') == 'constant':
                return value.get('value', default)
            # Handle f_strings with all-constant parts (e.g., after parameter substitution)
            if value.get('type') == 'f_string':
                parts = value.get('parts', [])
                result_parts = []
                for part in parts:
                    if isinstance(part, dict):
                        part_type = part.get('type', '')
                        if part_type == 'constant':
                            result_parts.append(str(part.get('value', '')))
                        elif part_type == 'formatted_value':
                            # Try to extract constant from the inner value
                            inner = part.get('value', {})
                            inner_val = self._extract_constant_value(inner, None)
                            if inner_val is None:
                                return default  # Not all parts are constants
                            result_parts.append(str(inner_val))
                        else:
                            return default  # Unknown part type
                    elif isinstance(part, str):
                        result_parts.append(part)
                    else:
                        return default
                return ''.join(result_parts)
            return default
        return value if value is not None else default

    def _extract_constant(self, value: Any, default: Any = None) -> Any:
        """Extract constant value from complex expressions."""
        return extract_constant(value, default)  # No settings for RuleCodeGenerator

    # =========================================================================
    # Helper methods to reduce code duplication
    # =========================================================================

    def _escape_string(self, s: str, quote_char: str = '"') -> str:
        """Escape a string for use in generated Python code."""
        return escape_string(s, quote_char)

    def _make_count_item(self, item_name: str) -> str:
        """Generate CountItem expression for the given item name.

        Args:
            item_name: The item name to count

        Returns:
            A CountItem("item_name") expression string
        """
        self.required_imports.add('CountItem')
        item_escaped = self._escape_string(item_name)
        return f'CountItem("{item_escaped}")'

    def _make_bool_constant(self, value: bool) -> str:
        """Generate a True_() or False_() expression.

        Args:
            value: The boolean value

        Returns:
            'True_()' or 'False_()' expression string
        """
        if value:
            self.required_imports.add('True_')
            return 'True_()'
        else:
            self.required_imports.add('False_')
            return 'False_()'

    def _resolve_setting_to_bool(self, name: str, default: bool = False) -> str:
        """Resolve a setting/option name to a boolean constant.

        Looks up the name in self.settings and returns True_() or False_()
        based on the value. If the name is not found, returns the default.

        Args:
            name: The setting/option name to look up
            default: Default value if setting not found

        Returns:
            'True_()' or 'False_()' expression string
        """
        if name in self.settings:
            value = self.settings[name]
            return self._make_bool_constant(bool(value))
        return self._make_bool_constant(default)

    # =========================================================================
    # End helper methods
    # =========================================================================


def ast_rule_to_python(rule: Optional[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """
    Convert an AST format rule to Python Rule Builder expression.

    Args:
        rule: Rule dict in AST format

    Returns:
        Tuple of (python_expression, required_imports)
    """
    generator = RuleCodeGenerator()
    expression = generator.generate(rule)
    imports = generator.get_imports()

    return expression, imports


def is_trivial_rule(rule: Optional[Dict[str, Any]]) -> bool:
    """Check if a rule is trivial (constant true)."""
    if rule is None:
        return True
    if not isinstance(rule, dict):
        return rule is True
    # Check for type='constant' format (older format)
    if rule.get('type') == 'constant' and rule.get('value') is True:
        return True
    # Check for rule='True_' format (Rule Builder format)
    if rule.get('rule') == 'True_':
        return True
    return False
