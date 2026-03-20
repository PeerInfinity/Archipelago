"""
Base mixin with core infrastructure for AST visitors.

This module contains helper registration methods and common utilities
used by all AST visitor mixins.
"""

import ast
import logging
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from ..expression_resolver import ExpressionResolver
    from ..binary_ops import BinaryOpProcessor


class BaseVisitorMixin(ast.NodeVisitor):
    """
    Base mixin containing core infrastructure for AST visitors.

    This class provides helper registration methods used across
    all visitor methods.  It also inherits from ast.NodeVisitor so that
    Pyright knows the full set of methods available when individual mixins
    reference self.visit / self.generic_visit.

    Attributes declared below (TYPE_CHECKING only) are provided at runtime
    by RuleAnalyzer, which is the concrete class that composes all mixins.
    """

    # -------------------------------------------------------------------------
    # Shared state – provided by RuleAnalyzer, declared here for type checkers.
    # -------------------------------------------------------------------------
    if TYPE_CHECKING:
        closure_vars: Dict[str, Any]
        seen_funcs: Dict[int, int]
        game_handler: Optional[Any]
        rule_func: Optional[Callable]
        player_context: Optional[int]
        preserve_parameter_names: bool
        rule_target_name: Optional[str]
        target_type: Optional[str]
        expression_resolver: 'ExpressionResolver'
        binary_op_processor: 'BinaryOpProcessor'
        evaluate_dict_methods: bool
        walrus_assignments: Dict[str, Any]

        # Cross-mixin method stubs: defined in other mixin classes but used
        # throughout the composition.  Declared here so type checkers see them.
        def _detect_param_mappings_from_call_site(
            self, helper_name: str, func: Any, args_with_nodes: List[Any]
        ) -> Optional[Dict[str, Any]]: ...

        def _is_world_options_pattern(self, node: ast.Attribute) -> Optional[str]: ...
        def _is_region_parameter_attribute(
            self, node: ast.Attribute,
            region_param_names: Optional[Set[str]] = None
        ) -> Tuple[Optional[str], Optional[str]]: ...
        def _is_world_player_subscript(self, node: ast.AST) -> bool: ...
        def _is_world_attribute_subscript_pattern(self, node: ast.AST) -> Tuple[Optional[str], Any]: ...
        def _is_prog_items_pattern(self, node: ast.AST) -> Optional[str]: ...
        def _is_world_attribute_chain(self, obj_result: Any) -> bool: ...
        def _substitute_variable_in_rule(
            self, rule: Dict[str, Any], var_name: str, value: Any
        ) -> Optional[Dict[str, Any]]: ...

    # -------------------------------------------------------------------------
    # Methods
    # -------------------------------------------------------------------------

    def _register_helper_usage(self, helper_name: str, helper_func: Any = None,
                                args_with_nodes: Optional[List[Any]] = None) -> None:
        """
        Register that a helper function is used, for automatic discovery.

        This calls the game handler's register_helper_usage method if available,
        allowing the exporter to automatically discover and export helper definitions.

        Also detects and registers param_mappings from call-site AST patterns when
        args_with_nodes is provided.

        Args:
            helper_name: The name of the helper function being used
            helper_func: Optional - the actual function object (for auto-detecting module)
            args_with_nodes: Optional - list of (arg_node, arg_result) tuples for param_mapping detection
        """
        if (hasattr(self, 'game_handler') and
            self.game_handler is not None and
            hasattr(self.game_handler, 'register_helper_usage')):
            self.game_handler.register_helper_usage(helper_name, helper_func)
            logging.debug(f"Registered helper usage: {helper_name}")

            # Detect and register param_mappings from call-site patterns
            if args_with_nodes and helper_func is not None:
                self._detect_and_register_param_mappings(helper_name, helper_func, args_with_nodes)

    def _detect_and_register_param_mappings(self, helper_name: str, helper_func: Any,
                                             args_with_nodes: List[Any]) -> None:
        """
        Detect param_mappings from call-site AST patterns and register them.

        This analyzes how a helper is called (e.g., with world.options.X.value or world.Y)
        and automatically determines the mapping from helper parameter names to slot_data keys.

        Args:
            helper_name: The name of the helper function
            helper_func: The actual function object
            args_with_nodes: List of (arg_node, arg_result) tuples
        """
        if not (hasattr(self, 'game_handler') and
                self.game_handler is not None and
                hasattr(self.game_handler, 'register_discovered_param_mapping')):
            return

        # Use the detection method from rule_analyzer
        param_mappings = self._detect_param_mappings_from_call_site(helper_name, helper_func, args_with_nodes)

        if param_mappings:
            self.game_handler.register_discovered_param_mapping(helper_name, param_mappings)

    def _make_helper_rule(self, name: str, args: List[Any], kwargs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Create a helper rule, omitting empty args/kwargs to reduce JSON size.

        Args:
            name: The helper function name
            args: The positional arguments to pass to the helper
            kwargs: The keyword arguments to pass to the helper (optional)

        Returns:
            A helper rule dict with 'type', 'name', and optionally 'args' and 'kwargs'
        """
        result: Dict[str, Any] = {'type': 'helper', 'name': name}
        if args:
            result['args'] = args
        if kwargs:
            result['kwargs'] = kwargs
        return result
