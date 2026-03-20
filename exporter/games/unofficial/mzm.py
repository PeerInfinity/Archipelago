"""Metroid Zero Mission game-specific export handler.

Metroid Zero Mission uses a custom Requirement DSL in logic.py that creates rules
using functools.partial. The pattern is:

1. Requirement is a NamedTuple with a `rule` lambda
2. all(*args) and any(*args) combine Requirements
3. create_rule(world) returns functools.partial(self.rule, world)

This handler intercepts these partial-wrapped rules and converts them to
standard JSON format by inspecting the closures.
"""

from functools import partial
from typing import Dict, Any, Optional, Callable, Tuple, NamedTuple
from ..base import GenericGameExportHandler
import logging
import inspect

logger = logging.getLogger(__name__)


class MZMGameExportHandler(GenericGameExportHandler):
    """Export handler for Metroid Zero Mission.

    Converts the Requirement DSL rules to standard JSON format.
    """

    GAME_NAME = 'Metroid Zero Mission'

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            logger.debug(f"Initialized MZM export handler for player {world.player}")

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Convert MZM Requirement-based rules to standard format.

        MZM rules are functools.partial objects wrapping lambdas that use
        the Requirement DSL. We inspect the closure to extract the actual
        requirements and convert them.
        """
        if rule_func is None:
            return None

        try:
            # Handle functools.partial - unwrap to get inner function
            inner_func = rule_func
            bound_world = None

            if isinstance(rule_func, partial):
                inner_func = rule_func.func
                if rule_func.args:
                    bound_world = rule_func.args[0]  # First arg is world

            # Check if this is an MZM Requirement rule by looking at qualname
            func_qualname = getattr(inner_func, '__qualname__', '')

            # Handle Requirement.item rules - simple item checks
            if 'Requirement.item' in func_qualname:
                return self._convert_item_requirement(inner_func, rule_target_name)

            # Handle Requirement.location rules - location reach checks
            if 'Requirement.location' in func_qualname:
                return self._convert_location_requirement(inner_func, rule_target_name)

            # Handle Requirement.entrance rules - entrance reach checks
            if 'Requirement.entrance' in func_qualname:
                return self._convert_entrance_requirement(inner_func, rule_target_name)

            # Handle all/any combinations
            if '<locals>.all.<locals>.<lambda>' in func_qualname or 'all.<locals>.<lambda>' in func_qualname:
                return self._convert_all_requirement(inner_func, bound_world, rule_target_name)

            if '<locals>.any.<locals>.<lambda>' in func_qualname or 'any.<locals>.<lambda>' in func_qualname:
                return self._convert_any_requirement(inner_func, bound_world, rule_target_name)

            # Handle setting checks
            if 'setting_enabled' in func_qualname or 'setting_is' in func_qualname or 'setting_atleast' in func_qualname or 'setting_contains' in func_qualname:
                return self._convert_setting_requirement(inner_func, rule_target_name)

            # Handle trick checks (trick_enabled)
            if 'trick_enabled' in func_qualname:
                return {'rule': 'False_'}  # Tricks are disabled for UT compatibility

        except Exception as e:
            logger.debug(f"MZM: override_rule_analysis failed for '{rule_target_name}': {e}")

        # Fall back to standard analysis
        return None

    def _get_closure_vars(self, func: Callable) -> Dict[str, Any]:
        """Extract closure variables from a function."""
        closure_vars = {}
        if hasattr(func, '__closure__') and func.__closure__:
            if hasattr(func, '__code__'):
                freevars = func.__code__.co_freevars
                for i, var_name in enumerate(freevars):
                    if i < len(func.__closure__):
                        try:
                            closure_vars[var_name] = func.__closure__[i].cell_contents
                        except ValueError:
                            pass
        return closure_vars

    def _convert_item_requirement(self, func: Callable, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert Requirement.item lambda to item_check rule."""
        closure_vars = self._get_closure_vars(func)
        item = closure_vars.get('item')
        count = closure_vars.get('count', 1)

        if item:
            logger.debug(f"MZM: Converted item requirement '{item}' x{count} for '{target_name}'")
            if count == 1:
                return {'rule': 'item_check', 'item': item}
            else:
                return {'rule': 'item_check', 'item': item, 'count': count}
        return None

    def _convert_location_requirement(self, func: Callable, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert Requirement.location lambda to location_access rule."""
        closure_vars = self._get_closure_vars(func)
        location = closure_vars.get('location')

        if location:
            logger.debug(f"MZM: Converted location requirement '{location}' for '{target_name}'")
            return {'rule': 'location_access', 'location': location}
        return None

    def _convert_entrance_requirement(self, func: Callable, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert Requirement.entrance lambda to entrance_access rule."""
        closure_vars = self._get_closure_vars(func)
        entrance = closure_vars.get('entrance')

        if entrance:
            logger.debug(f"MZM: Converted entrance requirement '{entrance}' for '{target_name}'")
            return {'rule': 'entrance_access', 'entrance': entrance}
        return None

    def _convert_setting_requirement(self, func: Callable, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert Requirement.setting_* lambda to setting check rule."""
        closure_vars = self._get_closure_vars(func)
        setting = closure_vars.get('setting')
        value = closure_vars.get('value')

        if setting:
            func_qualname = getattr(func, '__qualname__', '')
            if 'setting_is' in func_qualname and value is not None:
                return {'rule': 'setting_is', 'setting': setting, 'value': value}
            elif 'setting_enabled' in func_qualname:
                return {'rule': 'setting_enabled', 'setting': setting}
            elif 'setting_atleast' in func_qualname:
                return {'rule': 'setting_atleast', 'setting': setting, 'value': value}
            elif 'setting_contains' in func_qualname:
                return {'rule': 'setting_contains', 'setting': setting, 'value': value}
        return None

    def _convert_requirement_to_rule(self, req: Any, world: Any, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Recursively convert a Requirement object to a rule dict."""
        # Check if this is a Requirement namedtuple with a rule attribute
        if hasattr(req, 'rule') and callable(req.rule):
            inner_lambda = req.rule

            # Create a partial like MZM does, then convert
            if world is not None:
                partial_rule = partial(inner_lambda, world)
                result = self.override_rule_analysis(partial_rule, target_name)
                if result:
                    return result

            # If partial didn't work, try converting the raw lambda
            result = self.override_rule_analysis(inner_lambda, target_name)
            if result:
                return result

        return None

    def _convert_all_requirement(self, func: Callable, world: Any, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert all(*Requirements) to And rule."""
        closure_vars = self._get_closure_vars(func)
        args = closure_vars.get('args')

        if args and isinstance(args, (list, tuple)):
            children = []
            for req in args:
                child_rule = self._convert_requirement_to_rule(req, world, target_name)
                if child_rule:
                    children.append(child_rule)
                else:
                    # Can't convert this requirement, fall back
                    logger.debug(f"MZM: Could not convert child requirement in all() for '{target_name}'")
                    return None

            if len(children) == 1:
                return children[0]
            elif len(children) > 1:
                logger.debug(f"MZM: Converted all() with {len(children)} children for '{target_name}'")
                return {'rule': 'And', 'children': children}

        return None

    def _convert_any_requirement(self, func: Callable, world: Any, target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Convert any(*Requirements) to Or rule."""
        closure_vars = self._get_closure_vars(func)
        args = closure_vars.get('args')

        if args and isinstance(args, (list, tuple)):
            children = []
            for req in args:
                child_rule = self._convert_requirement_to_rule(req, world, target_name)
                if child_rule:
                    children.append(child_rule)
                else:
                    # Can't convert this requirement, fall back
                    logger.debug(f"MZM: Could not convert child requirement in any() for '{target_name}'")
                    return None

            if len(children) == 1:
                return children[0]
            elif len(children) > 1:
                logger.debug(f"MZM: Converted any() with {len(children)} children for '{target_name}'")
                return {'rule': 'Or', 'children': children}

        return None
