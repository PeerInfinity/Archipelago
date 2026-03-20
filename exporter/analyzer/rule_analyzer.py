"""
Main RuleAnalyzer class that orchestrates rule analysis.

This module provides the RuleAnalyzer class which coordinates all the
components needed for analyzing rule functions.
"""

import ast
import logging
import traceback
from typing import Dict, Any, Optional, Callable

from .expression_resolver import ExpressionResolver
from .binary_ops import BinaryOpProcessor
from .ast_visitors import ASTVisitorMixin
from exporter.constants import MAX_ANALYZER_OPERATIONS


class RuleAnalyzer(ASTVisitorMixin, ast.NodeVisitor):
    """
    AST Visitor that converts rule functions into structured format.

    Orchestrates the analysis by composing:
    - ExpressionResolver for value resolution
    - BinaryOpProcessor for optimization
    - ASTVisitorMixin for node traversal

    This class handles lambda functions, boolean operations, method calls,
    helper functions, and nested expressions.

    Note: ASTVisitorMixin must come first in the inheritance order to ensure
    our custom visit_* methods take precedence over ast.NodeVisitor's defaults.
    """

    def __init__(self, closure_vars=None, seen_funcs=None,
                 game_handler=None, rule_func=None, player_context=None,
                 preserve_parameter_names=False, rule_target_name=None,
                 target_type=None, evaluate_dict_methods=True):
        """
        Initialize the RuleAnalyzer.

        Args:
            closure_vars: Dictionary of variables available in the function's closure
            seen_funcs: Dictionary of function IDs already analyzed (for recursion tracking)
            game_handler: Game-specific handler for name replacements and expansions
            rule_func: The rule function being analyzed (for accessing defaults/globals)
            player_context: The player number context for this analysis
            preserve_parameter_names: If True, keep function parameters as name references
                                     instead of resolving to default values
            rule_target_name: Name of the rule target (e.g., location name) for detecting
                             closure-captured references that should be replaced with 'location'
            target_type: Type of target ('Location', 'Entrance', etc.) for context-specific handling
            evaluate_dict_methods: If True, evaluate dict.keys/values/items/get at analysis time
                                  when the dict is a constant. Default True.
        """
        self.closure_vars = closure_vars or {}
        self.seen_funcs = seen_funcs or {}
        self.game_handler = game_handler
        self.rule_func = rule_func
        self.player_context = player_context
        self.preserve_parameter_names = preserve_parameter_names
        self.evaluate_dict_methods = evaluate_dict_methods
        self.debug_log = []
        self.error_log = []

        # Operation counter to detect infinite loops
        self.operation_count = 0

        # Rule target context for detecting closure-captured location references
        # When analyzing a Location access rule, if a closure variable is a Location
        # object with the same name, it should be replaced with 'location'
        self.rule_target_name = rule_target_name
        self.target_type = target_type

        # Initialize helper components
        self.expression_resolver = ExpressionResolver(
            self.closure_vars, self.rule_func, self.player_context
        )
        self.binary_op_processor = BinaryOpProcessor(self.expression_resolver, self.game_handler)

    def visit(self, node):
        """Override visit to add operation counting and loop detection."""
        self.operation_count += 1
        if self.operation_count > MAX_ANALYZER_OPERATIONS:
            raise RuntimeError(
                f"Rule analysis exceeded maximum operations ({MAX_ANALYZER_OPERATIONS}). "
                f"This likely indicates an infinite loop in rule expansion."
            )
        return super().visit(node)

    def log_debug(self, message: str):
        """
        Log debug message.

        Args:
            message: The debug message to log
        """
        logging.debug(message)
        self.debug_log.append(message)

    def log_error(self, message: str, exception: Optional[Exception] = None):
        """
        Log error message with optional exception details.

        Args:
            message: The error message to log
            exception: Optional exception that caused the error
        """
        error_entry = {
            'message': message,
            'trace': traceback.format_exc() if exception else None
        }
        logging.error(message)
        self.error_log.append(error_entry)

    def _is_state_or_player_or_world_arg(self, arg_node, arg_result):
        """
        Check if an argument is the 'state', 'player', 'world', or 'self' parameter.

        Args:
            arg_node: The AST node for the argument
            arg_result: The analyzed result dict for the argument

        Returns:
            Tuple of (is_state, is_player, is_world) booleans
            Note: 'self' is treated the same as 'world' since both represent the world instance
        """
        # Check for direct 'state', 'player', 'world', or 'self' names
        if isinstance(arg_node, ast.Name):
            name = arg_node.id
            # 'self' represents the world object in methods, treat it same as 'world'
            return (name == 'state', name == 'player', name in ('world', 'self'))

        # Check for attribute access like 'world.player', 'self.player', etc.
        if isinstance(arg_node, ast.Attribute) and arg_node.attr == 'player':
            return (False, True, False)

        return (False, False, False)

    def _is_state_or_player_arg(self, arg_node, arg_result):
        """
        Legacy method for backward compatibility.
        Check if an argument is the 'state' or 'player' parameter.

        Args:
            arg_node: The AST node for the argument
            arg_result: The analyzed result dict for the argument

        Returns:
            Tuple of (is_state, is_player) booleans
        """
        is_state, is_player, is_world = self._is_state_or_player_or_world_arg(arg_node, arg_result)
        return (is_state, is_player)

    def _filter_special_args(self, args_with_nodes):
        """
        Filter out state, player, and world arguments.

        Args:
            args_with_nodes: List of (arg_node, arg_result) tuples

        Returns:
            List of arg_results with state/player/world filtered out
        """
        filtered = []
        for arg_node, arg_result in args_with_nodes:
            is_state, is_player, is_world = self._is_state_or_player_or_world_arg(arg_node, arg_result)
            if not (is_state or is_player or is_world):
                filtered.append(arg_result)
        return filtered

    def _filter_special_kwargs(self, kwargs_with_nodes):
        """
        Filter out state, player, and world keyword arguments.

        Args:
            kwargs_with_nodes: List of (ast.keyword, arg_result) tuples

        Returns:
            Dict of kwarg_name -> arg_result with state/player/world filtered out
        """
        filtered = {}
        for kw_node, kw_result in kwargs_with_nodes:
            kw_name = kw_node.arg
            # Skip keyword arguments with names like 'state', 'player', 'world'
            if kw_name in ('state', 'player', 'world'):
                logging.debug(f"_filter_special_kwargs: Filtering out keyword arg '{kw_name}'")
                continue
            # Also check if the value is a reference to state/player/world
            is_state, is_player, is_world = self._is_state_or_player_or_world_arg(kw_node.value, kw_result)
            if not (is_state or is_player or is_world):
                filtered[kw_name] = kw_result
        return filtered

    def _build_parameter_mapping(self, func, args_with_nodes):
        """
        Build a mapping of parameter names to argument values for function inlining.

        Args:
            func: The callable function being analyzed
            args_with_nodes: List of (arg_node, arg_result) tuples

        Returns:
            Dictionary mapping parameter names to their resolved values
        """
        param_mapping = {}

        try:
            if not callable(func) or not hasattr(func, '__code__'):
                logging.debug("_build_parameter_mapping: Function is not callable or has no __code__")
                return param_mapping

            # Get parameter names from the function
            param_names = func.__code__.co_varnames[:func.__code__.co_argcount]
            logging.debug(f"_build_parameter_mapping: Function parameters: {param_names}")

            # Map arguments to parameters (up to the number of provided args)
            for i, (arg_node, arg_result) in enumerate(args_with_nodes):
                if i >= len(param_names):
                    break  # More args than parameters

                param_name = param_names[i]

                # Skip state and player parameters - they shouldn't be inlined
                # But DO include world so that attribute accesses like world.options.X can be resolved
                if param_name in ('state', 'player'):
                    logging.debug(f"_build_parameter_mapping: Skipping special parameter '{param_name}'")
                    continue

                # Try to resolve the argument to a concrete value
                resolved_value = None

                # Case 1: Argument is already a constant
                if arg_result and arg_result.get('type') == 'constant':
                    resolved_value = arg_result['value']
                    logging.debug(f"_build_parameter_mapping: Parameter '{param_name}' -> constant {resolved_value}")

                # Case 2: Argument is a name reference - try to resolve it
                elif arg_result and arg_result.get('type') == 'name':
                    var_name = arg_result['name']
                    resolved_value = self.expression_resolver.resolve_variable(var_name)
                    if resolved_value is not None:
                        logging.debug(f"_build_parameter_mapping: Parameter '{param_name}' -> resolved '{var_name}' to {type(resolved_value).__name__}")
                    else:
                        logging.debug(f"_build_parameter_mapping: Could not resolve '{var_name}' for parameter '{param_name}'")

                # Case 3: Argument is an attribute (like HatType.DWELLER) - try to resolve it
                elif arg_result and arg_result.get('type') == 'attribute':
                    resolved_value = self.expression_resolver.resolve_expression(arg_result)
                    if resolved_value is not None:
                        logging.debug(f"_build_parameter_mapping: Parameter '{param_name}' -> resolved attribute to {resolved_value}")
                    else:
                        logging.debug(f"_build_parameter_mapping: Could not resolve attribute for parameter '{param_name}'")

                # Add to mapping if we successfully resolved the value
                # For 'world' parameter, always add it even if it's a complex object
                if resolved_value is not None:
                    param_mapping[param_name] = resolved_value
                elif param_name == 'world' and arg_result and arg_result.get('type') == 'name':
                    # Special case for world - try to get it from closure_vars even if not simple
                    var_name = arg_result['name']
                    if var_name in self.closure_vars:
                        param_mapping[param_name] = self.closure_vars[var_name]
                        logging.debug(f"_build_parameter_mapping: Added world object from closure_vars for parameter '{param_name}'")
                # Case 4: Argument is a rule dict (helper, item_check, state_method, and, or, etc.)
                # Store the analyzed rule directly so it can be substituted when the parameter is referenced
                elif arg_result and isinstance(arg_result, dict) and arg_result.get('type') in (
                    'helper', 'item_check', 'state_method', 'can_reach', 'location_check',
                    'and', 'or', 'not', 'conditional', 'compare', 'has_all', 'has_any'
                ):
                    param_mapping[param_name] = arg_result
                    logging.debug(f"_build_parameter_mapping: Parameter '{param_name}' -> rule dict of type '{arg_result.get('type')}'")

        except Exception as e:
            logging.error(f"Error building parameter mapping: {e}")

        logging.debug(f"_build_parameter_mapping: Final mapping: {param_mapping}")
        return param_mapping

    def _detect_param_mappings_from_call_site(self, helper_name, func, args_with_nodes):
        """
        Detect param_mappings from call-site AST patterns.

        When a helper is called with arguments like:
            can_defeat_enough_rbms(state, world.player,
                                   world.options.wily_5_requirement.value,
                                   world.wily_5_weapons)

        This method detects that:
            - Parameter 'required' maps to slot_data key 'wily_5_requirement'
            - Parameter 'boss_requirements' maps to slot_data key 'wily_5_weapons'

        Args:
            helper_name: The name of the helper function being called
            func: The callable function (to get parameter names)
            args_with_nodes: List of (arg_node, arg_result) tuples

        Returns:
            Dictionary mapping parameter names to slot_data keys, or empty dict
        """
        param_mappings = {}

        try:
            if not callable(func) or not hasattr(func, '__code__'):
                return param_mappings

            # Get parameter names from the function (excluding state, player, world)
            all_param_names = func.__code__.co_varnames[:func.__code__.co_argcount]
            helper_params = [p for p in all_param_names if p not in ('state', 'player', 'world', 'self')]

            if not helper_params:
                return param_mappings

            # Filter out state/player/world arguments to get actual helper args
            filtered_args_with_nodes = []
            for arg_node, arg_result in args_with_nodes:
                is_state, is_player, is_world = self._is_state_or_player_or_world_arg(arg_node, arg_result)
                # Include world attribute accesses (world.options.X) but not bare world
                if is_state or is_player:
                    continue
                if is_world and isinstance(arg_node, ast.Name):
                    continue  # Skip bare 'world' argument
                filtered_args_with_nodes.append((arg_node, arg_result))

            # Match filtered arguments to helper parameters
            for i, (arg_node, arg_result) in enumerate(filtered_args_with_nodes):
                if i >= len(helper_params):
                    break

                param_name = helper_params[i]
                slot_data_key = self._extract_slot_data_key_from_ast(arg_node)

                if slot_data_key and slot_data_key != param_name:
                    # Only add mapping if the key differs from the parameter name
                    param_mappings[param_name] = slot_data_key
                    logging.debug(f"_detect_param_mappings: {helper_name}.{param_name} -> '{slot_data_key}'")

        except Exception as e:
            logging.debug(f"Error detecting param_mappings for {helper_name}: {e}")

        return param_mappings

    def _extract_slot_data_key_from_ast(self, arg_node):
        """
        Extract the slot_data key from an AST argument node.

        Detects patterns:
        - world.options.<setting_name>.value -> setting_name
        - world.options.<setting_name> -> setting_name
        - world.<attribute_name> -> attribute_name
        - state.multiworld.worlds[player].options.<setting_name>.value -> setting_name
        - state.multiworld.worlds[player].options.<setting_name> -> setting_name
        - state.multiworld.worlds[player].<attribute_name> -> attribute_name

        Args:
            arg_node: The AST node representing the argument

        Returns:
            The slot_data key string, or None if pattern not recognized
        """
        if not isinstance(arg_node, ast.Attribute):
            return None

        # Build the attribute chain from the AST
        chain = []
        current = arg_node
        while isinstance(current, ast.Attribute):
            chain.insert(0, current.attr)
            current = current.value

        # Check if the chain starts with 'world'
        if isinstance(current, ast.Name) and current.id == 'world':
            return self._extract_key_from_chain(chain)

        # Check for state.multiworld.worlds[player] pattern
        # current should be a Subscript with value = state.multiworld.worlds
        if isinstance(current, ast.Subscript):
            subscript_value = current.value
            # Build the chain from the subscript value (should be state.multiworld.worlds)
            sub_chain = []
            sub_current = subscript_value
            while isinstance(sub_current, ast.Attribute):
                sub_chain.insert(0, sub_current.attr)
                sub_current = sub_current.value

            # Check if this is state.multiworld.worlds[player]
            if (isinstance(sub_current, ast.Name) and sub_current.id == 'state' and
                    sub_chain == ['multiworld', 'worlds']):
                return self._extract_key_from_chain(chain)

        return None

    def _extract_key_from_chain(self, chain):
        """
        Extract the slot_data key from an attribute chain.

        Args:
            chain: List of attribute names after world/state.multiworld.worlds[player]

        Returns:
            The slot_data key string, or None if pattern not recognized
        """
        # Pattern: options.<setting>.value -> setting
        # chain would be ['options', '<setting>', 'value']
        if len(chain) >= 3 and chain[0] == 'options' and chain[-1] == 'value':
            return chain[1]  # The setting name

        # Pattern: options.<setting> -> setting
        # chain would be ['options', '<setting>']
        if len(chain) == 2 and chain[0] == 'options':
            return chain[1]

        # Pattern: <attribute> -> attribute
        # chain would be ['<attribute>']
        if len(chain) == 1:
            return chain[0]

        # Pattern: <something>.<attribute> (like wily_5_weapons which might be deeper)
        # For now, return the last attribute in the chain
        if len(chain) >= 1:
            return chain[-1]

        return None
