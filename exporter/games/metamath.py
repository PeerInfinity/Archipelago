"""Metamath game-specific exporter handler."""

from typing import Dict, Any
from .base import BaseGameExportHandler
import logging
import ast
import re

logger = logging.getLogger(__name__)

class MetamathGameExportHandler(BaseGameExportHandler):
    """Metamath specific rule handler that resolves statement dependencies."""

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """Add fullText attribute to metamath locations if available."""
        attributes = {}

        # Extract statement number from location name (format: "Prove Statement X")
        if location.name and location.name.startswith("Prove Statement "):
            try:
                stmt_num = int(location.name.split()[-1])

                # Get the full text from the proof structure if available
                if hasattr(world, 'proof_structure') and world.proof_structure:
                    statement = world.proof_structure.statements.get(stmt_num)
                    if statement and hasattr(statement, 'full_text') and statement.full_text:
                        attributes['fullText'] = statement.full_text
            except (ValueError, AttributeError) as e:
                logger.debug(f"Could not get fullText for location {location.name}: {e}")

        return attributes

    def post_process_rule(self, rule: Dict[str, Any], context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Post-process rules to resolve variable names to actual statement numbers."""
        if not isinstance(rule, dict):
            return rule

        # Handle item_check rules with variable names
        if rule.get('type') == 'item_check':
            item = rule.get('item', {})
            if isinstance(item, dict) and item.get('type') == 'name':
                # Try to resolve the variable name
                var_name = item.get('name')
                if var_name and var_name.startswith('i'):
                    # This is likely i1, i2, i3, etc. - but we need the actual value
                    # For now, mark it as unresolved
                    logger.debug(f"Found unresolved item variable: {var_name}")

        # Handle and rules with conditions
        elif rule.get('type') == 'and':
            conditions = rule.get('conditions', [])
            for i, condition in enumerate(conditions):
                conditions[i] = self.post_process_rule(condition, context)

        # Handle all_of rules (comprehensions)
        elif rule.get('type') == 'all_of':
            # These are the problematic comprehension rules
            # We need to resolve the iterator variable
            iterator_info = rule.get('iterator_info', {})
            iterator = iterator_info.get('iterator', {})
            if isinstance(iterator, dict) and iterator.get('type') == 'name':
                var_name = iterator.get('name')
                logger.debug(f"Found unresolved iterator variable: {var_name}")

        return rule

    def extract_lambda_defaults(self, rule_func):
        """Extract default parameter values from a lambda function."""
        try:
            if hasattr(rule_func, '__defaults__') and rule_func.__defaults__:
                if hasattr(rule_func, '__code__'):
                    arg_names = rule_func.__code__.co_varnames[:rule_func.__code__.co_argcount]
                    defaults = rule_func.__defaults__

                    # Map defaults to parameter names
                    default_map = {}
                    if len(defaults) > 0:
                        default_start = len(arg_names) - len(defaults)
                        for i, default_value in enumerate(defaults):
                            param_name = arg_names[default_start + i]
                            default_map[param_name] = default_value

                    return default_map
        except Exception as e:
            logger.debug(f"Could not extract lambda defaults: {e}")
        return {}

    def process_entrance_rule(self, entrance, rule_func, world):
        """Process entrance rules to properly resolve statement dependencies."""
        # Try to extract the dependencies from the proof structure
        if hasattr(world, 'proof_structure'):
            # Extract the statement number from the entrance's connected region
            connected_region = entrance.connected_region
            if connected_region and connected_region.name.startswith("Prove Statement "):
                stmt_num = int(connected_region.name.split()[-1])

                # Get dependencies from proof structure
                dependencies = world.proof_structure.dependency_graph.get(stmt_num, [])
                if dependencies:
                    deps_list = sorted(list(dependencies))

                    # Create explicit rule based on number of dependencies
                    if len(deps_list) == 1:
                        # Single dependency
                        return lambda state: state.has(f"Statement {deps_list[0]}", world.player)
                    else:
                        # Multiple dependencies - create explicit and
                        def check_all_deps(state):
                            for dep in deps_list:
                                if not state.has(f"Statement {dep}", world.player):
                                    return False
                            return True
                        return check_all_deps

        # Fallback to original function
        return rule_func