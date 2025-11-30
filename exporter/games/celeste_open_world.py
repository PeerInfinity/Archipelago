"""Celeste (Open World) game-specific export handler.

This game uses a data-driven approach where rules are created dynamically from
`possible_access` lists stored in RegionConnection and LevelLocation objects.

The lambda functions created look like:
- Single requirement: lambda state, only_item=...: state.has(only_item, world.player)
- Multiple required: lambda state, only_access=...: state.has_all(only_access, world.player)
- Multiple options: lambda state, connection=...: for sublist in connection.possible_access: ...

The analyzer struggles with these patterns, so this handler intercepts the rules
and converts the possible_access data structures directly into proper rule nodes.
"""

from typing import Dict, Any, List, Optional
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class CelesteOpenWorldGameExportHandler(GenericGameExportHandler):
    """Celeste (Open World) expander that handles the data-driven rule patterns."""

    GAME_NAME = 'Celeste (Open World)'

    def __init__(self, world=None):
        """Initialize with world instance to access options."""
        super().__init__()
        self.world = world

    def override_rule_analysis(self, rule_func, rule_target_name: str = None) -> Optional[Dict[str, Any]]:
        """
        Override standard rule analysis by examining the rule function's closure variables.

        This is called by the exporter before standard AST analysis to check if we can
        directly convert the closure data into a rule structure.

        Args:
            rule_func: The rule function (lambda) to analyze
            rule_target_name: Name of the target (location, exit, entrance) for context

        Returns:
            A rule dict if we can handle this pattern, None otherwise to fall back to standard analysis.
        """
        if rule_func is None:
            return None

        # Try to extract closure variables and default parameters
        extracted_vars = {}

        # Get closure variables from __closure__
        if hasattr(rule_func, '__closure__') and rule_func.__closure__:
            closure_cells = rule_func.__closure__
            free_vars = rule_func.__code__.co_freevars
            for var_name, cell in zip(free_vars, closure_cells):
                try:
                    extracted_vars[var_name] = cell.cell_contents
                except ValueError:
                    pass

        # Get default parameters (this is the key for Celeste Open World patterns)
        if hasattr(rule_func, '__defaults__') and rule_func.__defaults__:
            if hasattr(rule_func, '__code__'):
                arg_names = rule_func.__code__.co_varnames[:rule_func.__code__.co_argcount]
                defaults = rule_func.__defaults__

                if len(defaults) > 0:
                    default_start = len(arg_names) - len(defaults)
                    for i, default_value in enumerate(defaults):
                        param_name = arg_names[default_start + i]
                        if param_name not in ('state', 'player'):
                            extracted_vars[param_name] = default_value

        # Check for Celeste Open World specific patterns

        # Pattern 1: connection object with possible_access (for region connections)
        if 'connection' in extracted_vars:
            connection = extracted_vars['connection']
            if hasattr(connection, 'possible_access'):
                logger.debug(f"Found connection.possible_access for {rule_target_name}: {connection.possible_access}")
                return self._convert_possible_access_to_rule(connection.possible_access)

        # Pattern 2: level_location object with possible_access (for location access)
        if 'level_location' in extracted_vars:
            level_location = extracted_vars['level_location']
            if hasattr(level_location, 'possible_access'):
                logger.debug(f"Found level_location.possible_access for {rule_target_name}: {level_location.possible_access}")
                return self._convert_possible_access_to_rule(level_location.possible_access)

        # Pattern 3: only_access list (has_all pattern - multiple required items)
        if 'only_access' in extracted_vars:
            only_access = extracted_vars['only_access']
            if isinstance(only_access, (list, tuple)) and len(only_access) > 0:
                logger.debug(f"Found only_access for {rule_target_name}: {only_access}")
                return self._convert_item_list_to_and_rule(only_access)

        # Pattern 4: only_item string (has pattern - single required item)
        if 'only_item' in extracted_vars:
            only_item = extracted_vars['only_item']
            if isinstance(only_item, str):
                logger.debug(f"Found only_item for {rule_target_name}: {only_item}")
                return {
                    'type': 'item_check',
                    'item': only_item
                }

        # Not a pattern we recognize - fall back to standard analysis
        return None

    def _convert_possible_access_to_rule(self, possible_access: List[List[str]]) -> Optional[Dict[str, Any]]:
        """
        Convert a possible_access list to a rule structure.

        possible_access is a list of lists of item names:
        - [[A, B]] means: A AND B required
        - [[A], [B]] means: A OR B required
        - [[A, B], [C]] means: (A AND B) OR C
        """
        if not possible_access or len(possible_access) == 0:
            # No requirements = always accessible
            return {'type': 'constant', 'value': True}

        if len(possible_access) == 1:
            # Single requirement list - all items required (AND)
            return self._convert_item_list_to_and_rule(possible_access[0])

        # Multiple requirement lists - any one works (OR)
        conditions = []
        for item_list in possible_access:
            if len(item_list) == 0:
                # Empty list means always accessible
                return {'type': 'constant', 'value': True}
            conditions.append(self._convert_item_list_to_and_rule(item_list))

        if len(conditions) == 1:
            return conditions[0]

        return {
            'type': 'or',
            'conditions': conditions
        }

    def _convert_item_list_to_and_rule(self, item_list: List[str]) -> Dict[str, Any]:
        """Convert a list of item names to an AND rule (or single item_check)."""
        if len(item_list) == 0:
            return {'type': 'constant', 'value': True}

        if len(item_list) == 1:
            return {
                'type': 'item_check',
                'item': item_list[0]
            }

        # Multiple items required
        conditions = [
            {'type': 'item_check', 'item': item_name}
            for item_name in item_list
        ]
        return {
            'type': 'and',
            'conditions': conditions
        }

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Celeste Open World-specific analysis."""
        if not rule:
            return rule

        # Let the base class handle most of the expansion
        return super().expand_rule(rule)
