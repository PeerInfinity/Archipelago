"""Ori and the Blind Forest game-specific export handler.

This handler expands the oribf_has helper function to Rule Builder format.

The oribf world uses a custom helper function `oribf_has` that handles:
1. Special keywords: "Free", "Lure", "DoubleBash", etc.
2. Item tuples: ("HealthCell", 3) for count requirements
3. Standard items: "Dash", "Climb", "Wind", etc.

The helper function pattern causes infinite loops in the rule analyzer,
so this handler intercepts and expands the rules before analysis.

Keyword mappings:
- "Free" -> True (location is freely accessible)
- "Open" -> True (closed dungeons not implemented)
- "OpenWorld" -> False (not implemented)
- "Lure" -> depends on enable_lure option
- "DoubleBash" -> enable_double_bash AND Has("Bash")
- "GrenadeJump" -> enable_grenade_jump AND HasAll(["Climb", "ChargeJump", "Grenade"])
- "ChargeFlameBurn" -> enable_charge_flame_burn AND Has("ChargeFlame") AND HasCount("AbilityCell", 3)
- "ChargeDash"/"RocketJump" -> enable_charge_dash AND Has("Dash") AND HasCount("AbilityCell", 6)
- "AirDash" -> enable_air_dash AND Has("Dash") AND HasCount("AbilityCell", 3)
- "TripleJump" -> enable_triple_jump AND Has("DoubleJump") AND HasCount("AbilityCell", 12)
- "UltraDefense" -> enable_damage_boost AND HasCount("AbilityCell", 12)
- "BashGrenade" -> HasAll(["Bash", "Grenade"])
- "Rekindle" -> depends on enable_rekindle option
- Item tuples ("Item", N) -> HasCount("Item", N) with option checks for HealthCell
"""

from typing import Dict, Any, Optional, List, Callable
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


def _extract_closure_var(func, var_name: str):
    """Extract a closure variable from a function by name."""
    if not hasattr(func, '__closure__') or func.__closure__ is None:
        return None
    if not hasattr(func, '__code__'):
        return None

    freevars = func.__code__.co_freevars
    for i, name in enumerate(freevars):
        if name == var_name:
            if i < len(func.__closure__):
                try:
                    return func.__closure__[i].cell_contents
                except ValueError:
                    pass
    return None


class OribfExportHandler(GenericGameExportHandler):
    """Export handler for Ori and the Blind Forest.

    Expands oribf_has helper function calls to Rule Builder format.
    """

    GAME_NAME = 'Ori and the Blind Forest'

    # Known items in oribf (not special keywords)
    KNOWN_ITEMS = {
        'AbilityCell', 'HealthCell', 'EnergyCell',
        'GinsoKey', 'ForlornKey', 'HoruKey', 'CleanWater', 'Wind',
        'WallJump', 'ChargeFlame', 'DoubleJump', 'Bash', 'Stomp',
        'Glide', 'Climb', 'ChargeJump', 'Dash', 'Grenade',
        'TPGlades', 'TPGrove', 'TPSwamp', 'TPGrotto', 'TPGinso',
        'TPValley', 'TPForlorn', 'TPSorrow', 'TPHoru', 'TPBlackroot',
        'WarmthFragment', 'Relic', 'KeyStone', 'MapStone',
        'GladesKeyStone', 'GrottoKeyStone', 'GinsoKeyStone', 'SwampKeyStone',
        'MistyKeyStone', 'ForlornKeyStone', 'SorrowKeyStone',
        'GladesMapStone', 'GroveMapStone', 'GrottoMapStone', 'SwampMapStone',
        'ValleyMapStone', 'ForlornMapStone', 'SorrowMapStone', 'HoruMapStone',
        'BlackrootMapStone',
    }

    # Options that affect rule logic
    OPTIONS = {
        'enable_lure': True,
        'enable_damage_boost': True,
        'enable_double_bash': True,
        'enable_grenade_jump': True,
        'enable_air_dash': True,
        'enable_charge_dash': True,
        'enable_triple_jump': True,
        'enable_charge_flame_burn': True,
        'enable_rekindle': True,
    }

    def __init__(self, world=None):
        super().__init__(world)
        self._options = dict(self.OPTIONS)  # Copy defaults
        if world:
            self._extract_options(world)

    def _extract_options(self, world) -> None:
        """Extract option values from the world for rule resolution."""
        try:
            options = world.options
            for opt_name in self.OPTIONS:
                if hasattr(options, opt_name):
                    opt_val = getattr(options, opt_name)
                    # Handle Toggle options (have .value that's 0 or 1)
                    if hasattr(opt_val, 'value'):
                        self._options[opt_name] = bool(opt_val.value)
                    else:
                        self._options[opt_name] = bool(opt_val)
                    logger.debug(f"oribf: {opt_name} = {self._options[opt_name]}")
        except Exception as e:
            logger.debug(f"Could not extract oribf options: {e}")

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to handle oribf_has patterns.

        oribf access rules are lambdas that use the pattern:
            lambda state: all(oribf_has(world, state, item) for item in access_set)

        However, these rules are combined via add_rule() which creates a new lambda:
            lambda state: old_rule(state) or rule(state)

        We need to extract the individual rules from the closure and convert them.
        """
        if not hasattr(rule_func, '__code__'):
            return None

        code = rule_func.__code__
        func_name = code.co_name

        # Check if this is a lambda (anonymous function)
        if func_name != '<lambda>':
            return None

        # Check for direct oribf access_set pattern
        # The oribf rule pattern is: lambda state: all(oribf_has(world, state, item) for item in access_set)
        # The access_set is in the closure
        if 'access_set' in code.co_freevars:
            access_set = _extract_closure_var(rule_func, 'access_set')
            if access_set is not None:
                result = self._convert_access_set(access_set)
                return result

        # Check for combined rule pattern (add_rule creates these)
        # Pattern: lambda state: old_rule(state) or rule(state)
        if 'old_rule' in code.co_freevars and 'rule' in code.co_freevars:
            return self._expand_combined_rule(rule_func, rule_target_name)

        return None

    def _expand_combined_rule(self, rule_func: Callable, rule_target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Expand a combined rule (from add_rule) into Rule Builder format.

        Combined rules are created by add_rule and have the pattern:
            lambda state: old_rule(state) or rule(state)

        We extract and recursively convert both old_rule and rule.
        """
        old_rule = _extract_closure_var(rule_func, 'old_rule')
        rule = _extract_closure_var(rule_func, 'rule')

        if old_rule is None or rule is None:
            return None

        # Check if old_rule is the initial "lambda state: False"
        old_is_false = False
        if callable(old_rule):
            try:
                # Test if it's a constant False rule
                class FakeState:
                    def has(self, *args): return True
                    def has_all(self, *args): return True
                old_is_false = old_rule(FakeState()) is False
            except Exception:
                pass

        # Recursively convert the rule
        rule_result = self._try_convert_rule(rule, rule_target_name)

        if rule_result is None:
            return None

        # If old_rule is False, just return the new rule
        if old_is_false:
            return rule_result

        # Otherwise, try to convert old_rule and combine with OR
        old_result = self.override_rule_analysis(old_rule, rule_target_name)

        if old_result is None:
            # Can't convert old_rule, but we can still use rule_result
            # This might lose some rule logic but at least provides partial support
            return rule_result

        # Combine with OR
        # Simplify: if either is constant True, return True
        if (isinstance(old_result, dict) and old_result.get('type') == 'constant' and old_result.get('value') is True):
            return old_result
        if (isinstance(rule_result, dict) and rule_result.get('type') == 'constant' and rule_result.get('value') is True):
            return rule_result

        # Simplify: if old is constant False, return rule
        if (isinstance(old_result, dict) and old_result.get('type') == 'constant' and old_result.get('value') is False):
            return rule_result

        # Combine with OR
        return {
            'rule': 'Or',
            'children': [old_result, rule_result]
        }

    def _try_convert_rule(self, rule_func: Callable, rule_target_name: Optional[str]) -> Optional[Dict[str, Any]]:
        """Try to convert a single rule function to Rule Builder format."""
        if not callable(rule_func):
            return None

        if not hasattr(rule_func, '__code__'):
            return None

        code = rule_func.__code__

        # Check for oribf access_set pattern
        # The oribf rule pattern is: lambda state: all(oribf_has(world, state, item) for item in access_set)
        # The oribf_has is in the generator expression, but access_set is in the outer lambda's closure
        if 'access_set' in code.co_freevars:
            access_set = _extract_closure_var(rule_func, 'access_set')
            if access_set is not None:
                return self._convert_access_set(access_set)

        # Check for nested combined rule
        if 'old_rule' in code.co_freevars and 'rule' in code.co_freevars:
            return self._expand_combined_rule(rule_func, rule_target_name)

        return None

    def _convert_access_set(self, access_set: List[Any]) -> Dict[str, Any]:
        """Convert an oribf access_set to Rule Builder format.

        An access_set is a list of items that must ALL be satisfied.
        Each item can be a string (keyword or item name) or a tuple (item, count).
        """
        if not access_set:
            # Empty access set - always true
            return {'type': 'constant', 'value': True}

        # Expand each item in the access set
        expanded_rules = []
        for item in access_set:
            expanded = self._expand_oribf_has_item(item)
            if expanded is None:
                logger.warning(f"oribf: Could not expand item {item}")
                continue
            expanded_rules.append(expanded)

        if not expanded_rules:
            return {'type': 'constant', 'value': True}

        # Simplify the result
        # Filter out True constants
        non_true = [r for r in expanded_rules
                    if not (isinstance(r, dict) and
                            r.get('type') == 'constant' and
                            r.get('value') is True)]

        if not non_true:
            # All rules are True - return True
            return {'type': 'constant', 'value': True}

        if len(non_true) == 1:
            return non_true[0]

        # Check for any False constants
        has_false = any(isinstance(r, dict) and
                        r.get('type') == 'constant' and
                        r.get('value') is False
                        for r in non_true)
        if has_false:
            return {'type': 'constant', 'value': False}

        # Multiple rules - combine with And
        return {
            'rule': 'And',
            'children': non_true
        }

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand oribf-specific rules.

        Converts oribf_has helper function calls to Rule Builder format.
        """
        if not isinstance(rule, dict):
            if isinstance(rule, list):
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        rule_type = rule.get('rule', '') or rule.get('type', '')

        # Handle AST_all_of with oribf_has - this is the main pattern
        # Pattern: all(oribf_has(world, state, item) for item in access_set)
        if rule_type == 'AST_all_of':
            result = self._expand_ast_all_of(rule)
            if result is not None:
                return result

        # Handle direct oribf_has helper references
        if rule_type == 'helper' and rule.get('name') == 'oribf_has':
            args = rule.get('args', [])
            if args:
                # Get the item argument (may be a constant or name reference)
                item_arg = args[0] if args else None
                if isinstance(item_arg, dict):
                    if item_arg.get('type') == 'constant':
                        item = item_arg.get('value')
                        return self._expand_oribf_has_item(item)  # type: ignore[return-value]
                    elif item_arg.get('type') == 'name':
                        # Variable reference - can't expand statically
                        pass
                elif isinstance(item_arg, str):
                    return self._expand_oribf_has_item(item_arg)  # type: ignore[return-value]

        # Handle function_call type with oribf_has
        if rule_type in ('AST_function_call', 'function_call'):
            result = self._expand_function_call(rule)
            if result is not None:
                return result

        # Recurse into children
        if 'children' in rule:
            rule = dict(rule)
            rule['children'] = [self.expand_rule(c, _depth + 1) for c in rule['children']]

        if 'conditions' in rule:
            rule = dict(rule)
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in rule['conditions']]

        if 'args' in rule and isinstance(rule.get('args'), dict):
            rule = dict(rule)
            args = dict(rule['args'])
            for key, value in args.items():
                if isinstance(value, dict):
                    args[key] = self.expand_rule(value, _depth + 1)
                elif isinstance(value, list):
                    args[key] = [self.expand_rule(v, _depth + 1) if isinstance(v, dict) else v for v in value]
            rule['args'] = args

        return super().expand_rule(rule, _depth)

    def _expand_ast_all_of(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand AST_all_of rules that use oribf_has.

        Pattern: all(oribf_has(world, state, item) for item in ["Free"])
        Becomes: True_ (if all items expand to True)
        Or: And([expanded_item1, expanded_item2, ...])
        """
        args = rule.get('args', {})
        element_rule = args.get('element_rule', {})
        iterator_info = args.get('iterator_info', {})

        # Check if this is oribf_has pattern
        if not (isinstance(element_rule, dict) and
                element_rule.get('type') == 'helper' and
                element_rule.get('name') == 'oribf_has'):
            return None

        # Get the iterator value (the list of items)
        iterator = iterator_info.get('iterator', {})
        if isinstance(iterator, dict) and iterator.get('type') == 'constant':
            items = iterator.get('value', [])
        elif isinstance(iterator, list):
            items = iterator
        else:
            # Can't determine items statically
            logger.debug(f"oribf: Cannot expand AST_all_of - unknown iterator: {iterator}")
            return None

        if not items:
            # Empty list - always true
            return {'type': 'constant', 'value': True}

        # Expand each item
        expanded_rules = []
        for item in items:
            expanded = self._expand_oribf_has_item(item)
            if expanded is None:
                # Couldn't expand - keep original
                return None
            expanded_rules.append(expanded)

        # Simplify the result
        # Filter out True constants
        non_true = [r for r in expanded_rules
                    if not (isinstance(r, dict) and
                            r.get('type') == 'constant' and
                            r.get('value') is True)]

        if not non_true:
            # All rules are True - return True
            return {'type': 'constant', 'value': True}

        if len(non_true) == 1:
            return non_true[0]

        # Check for any False constants
        has_false = any(isinstance(r, dict) and
                        r.get('type') == 'constant' and
                        r.get('value') is False
                        for r in non_true)
        if has_false:
            return {'type': 'constant', 'value': False}

        # Multiple rules - combine with And
        return {
            'rule': 'And',
            'children': non_true
        }

    def _expand_function_call(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand function call rules that involve oribf_has."""
        args = rule.get('args', {})
        function = args.get('function', rule.get('function', {}))

        if not isinstance(function, dict):
            return None

        # Check for oribf_has helper
        if function.get('type') == 'helper' and function.get('name') == 'oribf_has':
            call_args = args.get('args', rule.get('call_args', []))
            if call_args:
                item_arg = call_args[0] if call_args else None
                if isinstance(item_arg, dict) and item_arg.get('type') == 'constant':
                    return self._expand_oribf_has_item(item_arg.get('value'))
                elif isinstance(item_arg, str):
                    return self._expand_oribf_has_item(item_arg)

        return None

    def _expand_oribf_has_item(self, item: Any) -> Optional[Dict[str, Any]]:
        """Expand a single oribf_has(item) call to Rule Builder format.

        Args:
            item: Either a string (item name or keyword) or a tuple/list [item, count]

        Returns:
            Rule dict in Rule Builder format, or None if can't expand
        """
        # Handle tuples/lists: ("HealthCell", 3)
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            item_name = item[0]
            count = int(item[1])

            # HealthCell requires enable_damage_boost
            if item_name == 'HealthCell':
                if not self._options.get('enable_damage_boost', True):
                    # Without damage boost, health cell requirements are ignored
                    # Actually in oribf, it returns False if damage_boost is disabled
                    # and item is HealthCell - wait, let me re-check the code
                    # if (item[0] == "HealthCell" and options.enable_damage_boost == True) or item[0] != "HealthCell":
                    #     return state.has(item[0], world.player, int(item[1]))
                    # So if HealthCell and damage_boost is False, returns False
                    # But if damage_boost is True OR item is not HealthCell, check the count
                    return {'type': 'constant', 'value': False}

            return {
                'rule': 'Has',
                'args': {
                    'item_name': str(item_name),
                    'count': count
                }
            }

        # Handle string items/keywords
        if isinstance(item, str):
            return self._expand_keyword(item)

        logger.debug(f"oribf: Unknown item format: {item}")
        return None

    def _expand_keyword(self, keyword: str) -> Dict[str, Any]:
        """Expand a keyword from oribf_has to Rule Builder format."""

        # Always True keywords
        if keyword == 'Free':
            return {'type': 'constant', 'value': True}
        if keyword == 'Open':
            # Closed dungeons not implemented
            return {'type': 'constant', 'value': True}

        # Always False keywords
        if keyword == 'OpenWorld':
            # Open world not implemented
            return {'type': 'constant', 'value': False}

        # Option-only keywords (just check the option)
        if keyword == 'Lure':
            if self._options.get('enable_lure', True):
                return {'type': 'constant', 'value': True}
            return {'type': 'constant', 'value': False}

        if keyword == 'Rekindle':
            if self._options.get('enable_rekindle', True):
                return {'type': 'constant', 'value': True}
            return {'type': 'constant', 'value': False}

        # Option + item keywords
        if keyword == 'DoubleBash':
            if not self._options.get('enable_double_bash', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'Has',
                'args': {'item_name': 'Bash', 'count': 1}
            }

        if keyword == 'GrenadeJump':
            if not self._options.get('enable_grenade_jump', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'HasAll',
                'args': {'item_names': ['Climb', 'ChargeJump', 'Grenade']}
            }

        if keyword == 'ChargeFlameBurn':
            if not self._options.get('enable_charge_flame_burn', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'And',
                'children': [
                    {'rule': 'Has', 'args': {'item_name': 'ChargeFlame', 'count': 1}},
                    {'rule': 'Has', 'args': {'item_name': 'AbilityCell', 'count': 3}}
                ]
            }

        if keyword in ('ChargeDash', 'RocketJump'):
            if not self._options.get('enable_charge_dash', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'And',
                'children': [
                    {'rule': 'Has', 'args': {'item_name': 'Dash', 'count': 1}},
                    {'rule': 'Has', 'args': {'item_name': 'AbilityCell', 'count': 6}}
                ]
            }

        if keyword == 'AirDash':
            if not self._options.get('enable_air_dash', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'And',
                'children': [
                    {'rule': 'Has', 'args': {'item_name': 'Dash', 'count': 1}},
                    {'rule': 'Has', 'args': {'item_name': 'AbilityCell', 'count': 3}}
                ]
            }

        if keyword == 'TripleJump':
            if not self._options.get('enable_triple_jump', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'And',
                'children': [
                    {'rule': 'Has', 'args': {'item_name': 'DoubleJump', 'count': 1}},
                    {'rule': 'Has', 'args': {'item_name': 'AbilityCell', 'count': 12}}
                ]
            }

        if keyword == 'UltraDefense':
            if not self._options.get('enable_damage_boost', True):
                return {'type': 'constant', 'value': False}
            return {
                'rule': 'Has',
                'args': {'item_name': 'AbilityCell', 'count': 12}
            }

        # Item combinations (no option check)
        if keyword == 'BashGrenade':
            return {
                'rule': 'HasAll',
                'args': {'item_names': ['Bash', 'Grenade']}
            }

        # Check if it's a known item
        if keyword in self.KNOWN_ITEMS:
            return {
                'rule': 'Has',
                'args': {'item_name': keyword, 'count': 1}
            }

        # Unknown keyword - log and return as item check (best guess)
        logger.warning(f"oribf: Unknown keyword '{keyword}', treating as item")
        return {
            'rule': 'Has',
            'args': {'item_name': keyword, 'count': 1}
        }
