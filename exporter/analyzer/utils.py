"""Utility functions for rule analysis."""

import ast
import logging
from typing import Any, Optional, List


def is_simple_value(value: Any) -> bool:
    """
    Check if a value is a simple, JSON-serializable type.

    Args:
        value: The value to check

    Returns:
        True if the value is simple (None, bool, int, float, str, or a collection of simple values)
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return True
    elif isinstance(value, (list, tuple)):
        return all(is_simple_value(item) for item in value)
    elif isinstance(value, dict):
        return all(is_simple_value(k) and is_simple_value(v) for k, v in value.items())
    elif isinstance(value, (set, frozenset)):
        return all(is_simple_value(item) for item in value)
    else:
        return False


def make_json_serializable(value: Any) -> Any:
    """
    Convert a value to a JSON-serializable format.
    Handles sets, tuples, and other non-JSON-serializable types.

    Args:
        value: The value to convert

    Returns:
        A JSON-serializable representation of the value
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    elif isinstance(value, (set, frozenset)):
        # Recursively process elements, then sort
        processed = [make_json_serializable(item) for item in value]
        return sorted(processed, key=lambda x: (str(type(x).__name__), str(x)))
    elif isinstance(value, tuple):
        return [make_json_serializable(item) for item in value]
    elif isinstance(value, list):
        return [make_json_serializable(item) for item in value]
    elif isinstance(value, dict):
        return {k: make_json_serializable(v) for k, v in value.items()}
    else:
        # For non-serializable objects, just return them as-is
        # Don't convert to string - that loses information
        # The caller should handle these appropriately
        return value


class LambdaFinder(ast.NodeVisitor):
    """
    Searches an AST for calls to rule-setting functions (set_rule, add_rule, etc.)
    for a specific target and extracts the lambda function passed as the rule,
    handling cases where multiple definitions might exist.
    """

    def __init__(self, target_name: str, target_player: Optional[int] = None):
        """
        Initialize the LambdaFinder.

        Args:
            target_name: The name of the target (location, entrance, region) to find
            target_player: Optional player number for filtering (not currently used)
        """
        self.target_name = target_name
        # self.target_player = target_player # Optional: Could add player matching if needed
        self._found_lambdas: List[ast.Lambda] = []  # Store all found lambdas
        self._visited_nodes = set()  # Prevent infinite recursion on complex ASTs
        logging.debug(f"LambdaFinder initialized for target: {target_name}")

    def _extract_target_name_from_call(self, call_node: ast.Call) -> Optional[str]:
        """
        Helper to extract the target name from a get_location/entrance/region call.

        Args:
            call_node: The AST Call node to analyze

        Returns:
            The target name string if found, None otherwise
        """
        if isinstance(call_node.func, ast.Attribute):
            method_name = call_node.func.attr
            if method_name in ['get_location', 'get_entrance', 'get_region']:
                if len(call_node.args) > 0 and isinstance(call_node.args[0], ast.Constant):
                    return call_node.args[0].value
                else:
                    logging.warning(f"LambdaFinder: No constant arg found for {method_name} call.")
        return None

    def visit_Call(self, node: ast.Call):
        """Visit Call nodes to find rule-setting functions for our target."""
        # Prevent revisiting nodes to avoid potential cycles
        if node in self._visited_nodes:
            return
        self._visited_nodes.add(node)

        # Check if this is potentially a call to 'set_rule' or similar
        func_name = None
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        # Only proceed if it looks like a rule-setting function
        if func_name in ['set_rule', 'add_rule', 'add_item_rule']:
            if len(node.args) >= 2:
                # Try to extract the target name from the first argument
                target_node = node.args[0]
                extracted_target_name = None

                # Pattern: world.get_location/entrance/region("Target", player)
                if isinstance(target_node, ast.Call):
                    extracted_target_name = self._extract_target_name_from_call(target_node)

                # --- Check if the extracted target name matches ---
                if extracted_target_name == self.target_name:
                    logging.debug(f"LambdaFinder: Target name '{self.target_name}' MATCHED!")
                    # --- Check if the second argument is a Lambda ---
                    rule_node = node.args[1]
                    if isinstance(rule_node, ast.Lambda):
                        logging.debug(f"LambdaFinder: Found Lambda node for target '{self.target_name}'!")
                        self._found_lambdas.append(rule_node)
                        # Do NOT return early, continue searching for other potential matches

        # Continue visiting children regardless of finding a match
        super().generic_visit(node)

    def find_lambda_for_target(self, ast_tree: ast.AST) -> Optional[ast.Lambda]:
        """
        Visits the provided AST tree and returns the unique lambda definition
        for the target_name specified during initialization.

        Args:
            ast_tree: The AST tree to search

        Returns:
            ast.Lambda: The unique lambda node if found.
            None: If zero or more than one lambda definitions are found for the target.
        """
        logging.debug(f"LambdaFinder: Starting search in AST for target '{self.target_name}'")
        self._found_lambdas = []  # Reset for this search
        self._visited_nodes = set()  # Reset visited nodes
        self.visit(ast_tree)

        count = len(self._found_lambdas)
        if count == 1:
            logging.debug(f"LambdaFinder: Found exactly one lambda for target '{self.target_name}'.")
            return self._found_lambdas[0]
        elif count == 0:
            logging.warning(f"LambdaFinder: Found zero lambdas for target '{self.target_name}'.")
            return None
        else:
            logging.warning(
                f"LambdaFinder: Found {count} lambdas for target '{self.target_name}'. "
                f"Cannot uniquely determine rule, returning None."
            )
            return None
