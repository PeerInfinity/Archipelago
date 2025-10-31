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

    def _is_state_or_player_arg(self, arg_node, arg_result):
        """
        Check if an argument is the 'state' or 'player' parameter.

        Args:
            arg_node: The AST node for the argument
            arg_result: The analyzed result dict for the argument

        Returns:
            Tuple of (is_state, is_player) booleans
        """
        # Check for direct 'state' or 'player' names
        if isinstance(arg_node, ast.Name):
            name = arg_node.id
            return (name == 'state', name == 'player')

        # Check for attribute access like 'world.player', 'self.player', etc.
        if isinstance(arg_node, ast.Attribute) and arg_node.attr == 'player':
            return (False, True)

        return (False, False)

    def _filter_special_args(self, args_with_nodes):
        """
        Filter out state and player arguments.

        Args:
            args_with_nodes: List of (arg_node, arg_result) tuples

        Returns:
            List of arg_results with state/player filtered out
        """
        filtered = []
        for arg_node, arg_result in args_with_nodes:
            is_state, is_player = self._is_state_or_player_arg(arg_node, arg_result)
            if not (is_state or is_player):
                filtered.append(arg_result)
        return filtered
