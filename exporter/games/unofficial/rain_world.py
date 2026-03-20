"""Rain World game export handler.

This handler addresses the export of Rain World's custom condition classes
(Simple, Compound, AnyOf, AllOf) which create closure functions with local
variable assignments that the standard AST analyzer cannot resolve.

The main issue is that Simple.check() returns a closure function like:
    def inner(state):
        ret = state.has_from_list_unique(self.items, player, self.count)
        return (not ret) if self.negative else ret

The AST analyzer sees the return statement but cannot trace 'ret' back to the
state method call, resulting in unresolved {'rule': 'Name', 'args': {'name': 'ret'}}
rules.

This handler fixes these by:
1. During prepare_closure_vars: extracting Simple/Compound configuration from closures
2. During expand_rule: converting unresolved 'ret' names to proper rule structures
"""

import logging
from typing import Any, Dict, List, Optional, Callable

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class RainWorldGameExportHandler(GenericGameExportHandler):
    """Export handler for Rain World apworld."""

    GAME_NAME = 'Rain World'

    def __init__(self, world=None):
        super().__init__(world)
        # Track the current rule's closure context for unresolved name handling
        # This is an instance attribute to avoid sharing across calls
        self._current_closure_vars: Dict[str, Any] = {}

    def prepare_closure_vars(
        self,
        rule_func: Optional[Callable],
        closure_vars: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Prepare closure variables, extracting Simple/Compound condition data.

        When a Rain World rule uses Simple("ItemName").check(player), the closure
        captures 'self' as the Simple instance. We extract its configuration here
        so that expand_rule can convert unresolved 'ret' names to proper rules.
        """
        prepared = super().prepare_closure_vars(rule_func, closure_vars)

        # Look for Simple or Compound condition instances in the closure
        # The closure captures 'self' from Simple.check() or Compound.check()
        # Make a copy of items to avoid modification during iteration
        for name, value in list(closure_vars.items()):
            if self._is_simple_condition(value):
                # Extract Simple condition configuration
                config = self._extract_simple_config(value)
                if config:
                    prepared['_rain_world_simple_config'] = config
                    logger.debug(f"Extracted Simple condition config from '{name}': {config}")
            elif self._is_compound_condition(value):
                # Extract Compound condition configuration
                config = self._extract_compound_config(value)
                if config:
                    prepared['_rain_world_compound_config'] = config
                    logger.debug(f"Extracted Compound condition config from '{name}': {config}")

        # Also check the rule_func's __self__ attribute if it's a bound method
        import types as _types
        if rule_func is not None:
            if isinstance(rule_func, _types.MethodType):
                bound_self = rule_func.__self__
                if self._is_simple_condition(bound_self):
                    config = self._extract_simple_config(bound_self)
                    if config:
                        prepared['_rain_world_simple_config'] = config
                        logger.debug(f"Extracted Simple config from bound method: {config}")

            # Check the closure cells directly
            if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                for cell in rule_func.__closure__:
                    try:
                        cell_value = cell.cell_contents
                        if self._is_simple_condition(cell_value):
                            config = self._extract_simple_config(cell_value)
                            if config:
                                prepared['_rain_world_simple_config'] = config
                                logger.debug(f"Extracted Simple config from closure cell: {config}")
                        elif self._is_compound_condition(cell_value):
                            config = self._extract_compound_config(cell_value)
                            if config:
                                prepared['_rain_world_compound_config'] = config
                                logger.debug(f"Extracted Compound config from closure cell: {config}")
                    except ValueError:
                        # Cell may be empty
                        pass

        # Store current closure for use in expand_rule
        # This must be done AFTER extracting configs so they're available in expand_rule
        self._current_closure_vars = prepared.copy()

        return prepared

    def _is_simple_condition(self, obj: Any) -> bool:
        """Check if object is a Rain World Simple condition."""
        if obj is None:
            return False
        obj_type = type(obj).__name__
        # Check by class name since we may not have direct import
        return obj_type == 'Simple' and hasattr(obj, 'items') and hasattr(obj, 'count')

    def _is_compound_condition(self, obj: Any) -> bool:
        """Check if object is a Rain World Compound condition."""
        if obj is None:
            return False
        obj_type = type(obj).__name__
        return obj_type in ('Compound', 'AnyOf', 'AllOf') and hasattr(obj, 'conditions')

    def _extract_simple_config(self, simple: Any) -> Optional[Dict[str, Any]]:
        """Extract configuration from a Simple condition instance."""
        try:
            return {
                'type': 'simple',
                'items': list(simple.items) if hasattr(simple, 'items') else [],
                'count': getattr(simple, 'count', 1),
                'unique': getattr(simple, 'unique', True),
                'negative': getattr(simple, 'negative', False),
                'locations': getattr(simple, 'locations', False),
            }
        except Exception as e:
            logger.warning(f"Failed to extract Simple config: {e}")
            return None

    def _extract_compound_config(self, compound: Any) -> Optional[Dict[str, Any]]:
        """Extract configuration from a Compound condition instance."""
        try:
            conditions = []
            for cond in getattr(compound, 'conditions', []):
                if self._is_simple_condition(cond):
                    config = self._extract_simple_config(cond)
                    if config:
                        conditions.append(config)

            return {
                'type': type(compound).__name__.lower(),  # 'compound', 'anyof', 'allof'
                'count': getattr(compound, 'count', 1),
                'conditions': conditions,
            }
        except Exception as e:
            logger.warning(f"Failed to extract Compound config: {e}")
            return None

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand rules, converting unresolved 'ret' names to proper structures.

        When we encounter a rule like:
            {'rule': 'Name', 'args': {'name': 'ret'}, '_converted_from_ast': true}

        We check if we have extracted Simple/Compound configuration and convert
        accordingly.
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # Check for unresolved 'ret' name from Simple/Compound conditions
        if self._is_unresolved_ret_name(rule):
            converted = self._convert_ret_to_rule()
            if converted:
                logger.debug(f"Converted unresolved 'ret' to: {converted}")
                return self.expand_rule(converted, _depth + 1)
            else:
                # If we can't convert, default to True_ (assume accessible)
                # This is a fallback that allows the game to proceed
                logger.warning("Could not convert unresolved 'ret' name, defaulting to True")
                return {'rule': 'True_'}

        # Let parent handle standard expansion
        return super().expand_rule(rule, _depth)

    def _is_unresolved_ret_name(self, rule: Dict[str, Any]) -> bool:
        """Check if rule is an unresolved 'ret' name from condition classes."""
        # Check AST format
        if rule.get('type') == 'name' and rule.get('name') == 'ret':
            return True
        # Check RB format
        if (rule.get('rule') == 'Name' and
            rule.get('_converted_from_ast') and
            isinstance(rule.get('args'), dict) and
            rule['args'].get('name') == 'ret'):
            return True
        return False

    def _convert_ret_to_rule(self) -> Optional[Dict[str, Any]]:
        """Convert 'ret' to proper rule using extracted condition configuration."""
        # Check for Simple condition config
        simple_config = self._current_closure_vars.get('_rain_world_simple_config')
        if simple_config:
            return self._simple_config_to_rule(simple_config)

        # Check for Compound condition config
        compound_config = self._current_closure_vars.get('_rain_world_compound_config')
        if compound_config:
            return self._compound_config_to_rule(compound_config)

        return None

    def _simple_config_to_rule(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Simple condition config to a rule structure."""
        items = config.get('items', [])
        count = config.get('count', 1)
        negative = config.get('negative', False)
        locations = config.get('locations', False)
        unique = config.get('unique', True)

        if not items:
            return {'rule': 'True_'}

        if locations:
            # Check if we can reach locations
            if len(items) == 1:
                base_rule = {'type': 'can_reach', 'target': items[0], 'target_type': 'Location'}
            else:
                # Need count of N locations
                conditions = [
                    {'type': 'can_reach', 'target': item, 'target_type': 'Location'}
                    for item in items
                ]
                if count >= len(items):
                    base_rule = {'type': 'and', 'conditions': conditions}
                else:
                    # Any count of items - approximate with has_any
                    base_rule = {'type': 'or', 'conditions': conditions}
        else:
            # Item check
            if len(items) == 1:
                base_rule = {'type': 'item_check', 'item': items[0], 'count': count}
            elif count == 1 and unique:
                # Has any one of the items
                base_rule = {'type': 'has_any', 'items': items}
            elif count >= len(items):
                # Has all items
                base_rule = {'type': 'has_all', 'items': items}
            else:
                # Has N unique items from list - approximate
                base_rule = {'type': 'has_any', 'items': items, 'count': count}

        if negative:
            return {'type': 'not', 'condition': base_rule}
        return base_rule

    def _compound_config_to_rule(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Compound condition config to a rule structure."""
        cond_type = config.get('type', 'compound')
        count = config.get('count', 1)
        conditions = config.get('conditions', [])

        if not conditions:
            return {'rule': 'True_'}

        # Convert each sub-condition
        converted = [self._simple_config_to_rule(c) for c in conditions]

        if cond_type == 'allof' or count >= len(conditions):
            return {'type': 'and', 'conditions': converted}
        elif cond_type == 'anyof' or count == 1:
            return {'type': 'or', 'conditions': converted}
        else:
            # General compound - use OR as approximation
            return {'type': 'or', 'conditions': converted}
