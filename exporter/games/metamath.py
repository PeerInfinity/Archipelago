"""Metamath game-specific exporter handler."""

from typing import Dict, Any
from .base import BaseGameExportHandler
import logging
import ast
import re

logger = logging.getLogger(__name__)

class MetamathGameExportHandler(BaseGameExportHandler):
    """Metamath specific rule handler that resolves statement dependencies."""

    def get_region_attributes(self, region) -> Dict[str, Any]:
        """Add statement reference and label/expression attributes to metamath regions."""
        attributes = {}

        # Extract statement number from region name (format: "Prove Statement X")
        if region.name and region.name.startswith("Prove Statement "):
            try:
                stmt_num = int(region.name.split()[-1])

                # Get the data from the world's proof_structure if available
                world = None
                # Try to get world from region's player
                if hasattr(region, 'player') and hasattr(region, 'multiworld'):
                    if hasattr(region.multiworld, 'worlds'):
                        world = region.multiworld.worlds.get(region.player)

                if world and hasattr(world, 'proof_structure') and world.proof_structure:
                    statement = world.proof_structure.statements.get(stmt_num)
                    if statement:
                        if hasattr(statement, 'label') and statement.label:
                            attributes['label1'] = statement.label
                            logger.debug(f"Added label1 (label) for region {region.name}: {statement.label}")

                        if hasattr(statement, 'expression') and statement.expression:
                            attributes['label2'] = statement.expression
                            logger.debug(f"Added label2 (expression) for region {region.name}: {statement.expression}")

            except (ValueError, AttributeError) as e:
                logger.debug(f"Could not process region {region.name}: {e}")

        return attributes

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """Add statement reference and label/expression attributes to metamath locations."""
        attributes = {}

        # Extract statement number from location name (format: "Prove Statement X")
        if location.name and location.name.startswith("Prove Statement "):
            try:
                stmt_num = int(location.name.split()[-1])

                # Add a reference to the statement in metamath_data
                attributes['statement_id'] = stmt_num
                logger.debug(f"Added statement_id {stmt_num} for location {location.name}")

                # Add label1 (the label) and label2 (the expression) if available
                if hasattr(world, 'proof_structure') and world.proof_structure:
                    statement = world.proof_structure.statements.get(stmt_num)
                    if statement:
                        if hasattr(statement, 'label') and statement.label:
                            attributes['label1'] = statement.label
                            logger.debug(f"Added label1 (label) for statement {stmt_num}: {statement.label}")

                        if hasattr(statement, 'expression') and statement.expression:
                            attributes['label2'] = statement.expression
                            logger.debug(f"Added label2 (expression) for statement {stmt_num}: {statement.expression}")

            except (ValueError, AttributeError) as e:
                logger.debug(f"Could not process location {location.name}: {e}")

        return attributes

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return metamath-specific item definitions with label1 and label2 attributes.
        """
        # Start with the base implementation
        items_data = super().get_item_data(world)

        # Add label1 and label2 for statement items
        if hasattr(world, 'proof_structure') and world.proof_structure:
            for stmt_num, statement in world.proof_structure.statements.items():
                item_name = f"Statement {stmt_num}"

                # Initialize item data if it doesn't exist
                if item_name not in items_data:
                    items_data[item_name] = {
                        'name': item_name,
                        'groups': ['Statements'],
                        'advancement': True,
                        'priority': False,
                        'useful': False,
                        'trap': False,
                        'event': False,
                        'type': None,
                        'max_count': 1
                    }

                # Add label1 and label2
                if hasattr(statement, 'label') and statement.label:
                    items_data[item_name]['label1'] = statement.label
                    logger.debug(f"Added label1 (label) for item {item_name}: {statement.label}")

                if hasattr(statement, 'expression') and statement.expression:
                    items_data[item_name]['label2'] = statement.expression
                    logger.debug(f"Added label2 (expression) for item {item_name}: {statement.expression}")

        return items_data

    def get_metamath_data(self, world) -> Dict[str, Any]:
        """
        Extract all metamath data from the world's proof_structure.
        This will be stored in a new 'metamath_data' section of the export.
        """
        metamath_data = {}

        try:
            if hasattr(world, 'proof_structure') and world.proof_structure:
                logger.debug("Found proof_structure on world, extracting metamath data")

                # Store all statement data
                statements = {}
                for stmt_num, statement in world.proof_structure.statements.items():
                    stmt_data = {
                        'label': statement.label,
                        'expression': statement.expression,
                        'dependencies': statement.dependencies,
                    }

                    # Include full_text if available
                    if hasattr(statement, 'full_text') and statement.full_text:
                        stmt_data['full_text'] = statement.full_text

                    statements[str(stmt_num)] = stmt_data

                metamath_data['statements'] = statements

                # Store dependency graph
                dependency_graph = {}
                for stmt_num, deps in world.proof_structure.dependency_graph.items():
                    dependency_graph[str(stmt_num)] = list(deps)
                metamath_data['dependency_graph'] = dependency_graph

                # Store reverse dependencies if available
                if hasattr(world.proof_structure, 'reverse_dependencies'):
                    reverse_deps = {}
                    for stmt_num, deps in world.proof_structure.reverse_dependencies.items():
                        reverse_deps[str(stmt_num)] = list(deps)
                    metamath_data['reverse_dependencies'] = reverse_deps

                # Store label to index mapping if available
                if hasattr(world.proof_structure, 'label_to_index'):
                    metamath_data['label_to_index'] = world.proof_structure.label_to_index

                logger.debug(f"Extracted metamath data with {len(statements)} statements")
            else:
                logger.debug("No proof_structure found on world")

        except Exception as e:
            logger.error(f"Error extracting metamath data: {e}")

        return metamath_data

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