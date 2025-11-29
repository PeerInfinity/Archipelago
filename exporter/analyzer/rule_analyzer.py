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
                 game_handler=None, rule_func=None, player_context=None):
        """
        Initialize the RuleAnalyzer.

        Args:
            closure_vars: Dictionary of variables available in the function's closure
            seen_funcs: Dictionary of function IDs already analyzed (for recursion tracking)
            game_handler: Game-specific handler for name replacements and expansions
            rule_func: The rule function being analyzed (for accessing defaults/globals)
            player_context: The player number context for this analysis
        """
        self.closure_vars = closure_vars or {}
        self.seen_funcs = seen_funcs or {}
        self.game_handler = game_handler
        self.rule_func = rule_func
        self.player_context = player_context
        self.debug_log = []
        self.error_log = []

        # Initialize helper components
        self.expression_resolver = ExpressionResolver(
            self.closure_vars, self.rule_func, self.player_context
        )
        self.binary_op_processor = BinaryOpProcessor(self.expression_resolver, self.game_handler)

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
        Check if an argument is the 'state', 'player', or 'world' parameter.

        Args:
            arg_node: The AST node for the argument
            arg_result: The analyzed result dict for the argument

        Returns:
            Tuple of (is_state, is_player, is_world) booleans
        """
        # Check for direct 'state', 'player', or 'world' names
        if isinstance(arg_node, ast.Name):
            name = arg_node.id
            return (name == 'state', name == 'player', name == 'world')

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

        except Exception as e:
            logging.error(f"Error building parameter mapping: {e}")

        logging.debug(f"_build_parameter_mapping: Final mapping: {param_mapping}")
        return param_mapping
