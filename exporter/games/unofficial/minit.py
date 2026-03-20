"""Minit game-specific export handler.

This handler converts Minit's RuleUtils helper function calls to Rule Builder format.

The Minit world uses helper functions in RuleUtils.py:
- RuleUtils.has_darkroom(player, state, value, darkrooms) - darkroom accessibility check
- RuleUtils.can_passBoxes(player, state) - box passage check
- RuleUtils.can_openChest(player, state) - chest opening check
- RuleUtils.has_megasword(player, state) - megasword check
- RuleUtils.has_brokensword(player, state) - broken sword check
- RuleUtils.total_hearts(player, state, count) - heart count check

These are exported as AST_function_call rules but need to be converted to
Rule Builder format for the world generator to properly reconstruct them.
"""

from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class MinitExportHandler(GenericGameExportHandler):
    """Export handler for Minit."""

    GAME_NAME = 'Minit'

    # All items that grant "has_sword" when collected (from item_groups["swords"])
    SWORD_ITEMS = ['ItemBrokenSword', 'ItemSword', 'ItemMegaSword', 'Progressive Sword', 'Reverse Progressive Sword']

    def __init__(self, world=None):
        super().__init__(world)
        self._darkrooms_option = None
        if world:
            self._extract_darkrooms_option(world)

    def _extract_darkrooms_option(self, world) -> None:
        """Extract the darkrooms option value from the world."""
        try:
            if hasattr(world, 'options') and hasattr(world.options, 'darkrooms'):
                self._darkrooms_option = int(world.options.darkrooms.value)
                logger.debug(f"Minit darkrooms option: {self._darkrooms_option}")
        except Exception as e:
            logger.debug(f"Could not extract darkrooms option: {e}")

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Minit-specific rules.

        Converts RuleUtils helper function calls to Rule Builder format.
        Also expands 'has_sword' pseudo-item references to actual sword items.
        """
        # Handle non-dict inputs (lists, primitives, None)
        if not isinstance(rule, dict):
            # If it's a list of rules, expand each element
            if isinstance(rule, list):
                logger.debug(f"Minit expand_rule received list at depth {_depth}: {str(rule)[:100]}")
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        # Debug: log the rule structure at low depths for problematic rules
        if _depth == 0:
            rule_type = rule.get('type', rule.get('rule', ''))
            if 'conditions' in rule:
                for i, cond in enumerate(rule.get('conditions', [])):
                    if isinstance(cond, list):
                        logger.warning(f"Minit: condition {i} is a list: {str(cond)[:100]}")

        # Check for AST_function_call rules with RuleUtils
        rule_type = rule.get('rule', '') or rule.get('type', '')
        if rule_type in ('AST_function_call', 'function_call'):
            result = self._expand_ruleutils_call(rule)
            if result is not None:
                return result

        # Handle has_darkroom in nested structures (e.g., inside 'and'/'or' conditions)
        # The analyzer might produce RuleUtils calls in different formats
        if rule_type == 'function_call' or (rule_type == 'call' and rule.get('func', {}).get('attr') in
                ('has_darkroom', 'can_passBoxes', 'can_openChest', 'has_megasword', 'has_brokensword', 'total_hearts')):
            result = self._expand_ruleutils_from_call(rule)
            if result is not None:
                return result

        # Expand has_sword pseudo-item to actual sword items
        # This catches state.has("has_sword", player) rules that weren't handled by the above
        expanded = self._expand_has_sword_references(rule)
        if expanded is not None:
            return expanded

        # Let parent handle other expansions
        return super().expand_rule(rule, _depth)

    def _expand_has_sword_references(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand references to 'has_sword' pseudo-item in rules.

        The Minit world dynamically adds 'has_sword' to state via collect() callback
        when any sword is collected. Since worldgen worlds don't have this callback,
        we need to expand all references to 'has_sword' into checks for actual sword items.

        Handles both AST format (type: 'item_check') and RB format (rule: 'Has'):
        - item_check(item='has_sword') -> HasAny(SWORD_ITEMS)
        - Has(item_name='has_sword') -> HasAny(SWORD_ITEMS)
        - HasAll(['has_sword', ...]) -> And(HasAny(SWORD_ITEMS), HasAll(...))
        - HasAny(['has_sword', ...]) -> HasAny(SWORD_ITEMS + ...)
        """
        rule_type = rule.get('type', '')
        rb_rule = rule.get('rule', '')
        args = rule.get('args', {})

        # Handle AST format: item_check with has_sword
        if rule_type == 'item_check':
            item_name = rule.get('item', '')
            if item_name == 'has_sword':
                return self._expand_has_sword()

        # Handle AST format: state_method has_all with has_sword in set elements
        # Structure: {type: "state_method", method: "has_all", args: [{type: "set", elements: [...]}, player]}
        if rule_type == 'state_method' and rule.get('method') == 'has_all':
            rule_args = rule.get('args', [])
            if rule_args and isinstance(rule_args, list) and len(rule_args) >= 1:
                first_arg = rule_args[0]
                if isinstance(first_arg, dict) and first_arg.get('type') == 'set':
                    elements = first_arg.get('elements', [])
                    # Extract item names from constant elements
                    item_names = []
                    has_sword_found = False
                    for elem in elements:
                        if isinstance(elem, dict) and elem.get('type') == 'constant':
                            value = elem.get('value', '')
                            if value == 'has_sword':
                                has_sword_found = True
                            else:
                                item_names.append(value)

                    if has_sword_found:
                        if not item_names:
                            # Only has_sword in the set
                            return self._expand_has_sword()
                        elif len(item_names) == 1:
                            # One other item - And(HasAny(swords), item_check)
                            return {
                                'type': 'and',
                                'conditions': [
                                    self._expand_has_sword(),
                                    {'type': 'item_check', 'item': item_names[0]}
                                ]
                            }
                        else:
                            # Multiple other items - And(HasAny(swords), state_method(has_all))
                            return {
                                'type': 'and',
                                'conditions': [
                                    self._expand_has_sword(),
                                    {
                                        'type': 'state_method',
                                        'method': 'has_all',
                                        'args': [
                                            {
                                                'type': 'set',
                                                'elements': [
                                                    {'type': 'constant', 'value': name}
                                                    for name in item_names
                                                ]
                                            },
                                            rule_args[1] if len(rule_args) > 1 else {'type': 'constant', 'value': 1}
                                        ]
                                    }
                                ]
                            }

        # Handle AST format: state_method has_any with has_sword in set elements
        if rule_type == 'state_method' and rule.get('method') == 'has_any':
            rule_args = rule.get('args', [])
            if rule_args and isinstance(rule_args, list) and len(rule_args) >= 1:
                first_arg = rule_args[0]
                if isinstance(first_arg, dict) and first_arg.get('type') == 'set':
                    elements = first_arg.get('elements', [])
                    # Extract item names from constant elements
                    item_names = []
                    has_sword_found = False
                    for elem in elements:
                        if isinstance(elem, dict) and elem.get('type') == 'constant':
                            value = elem.get('value', '')
                            if value == 'has_sword':
                                has_sword_found = True
                            else:
                                item_names.append(value)

                    if has_sword_found:
                        # Combine sword items with other items
                        expanded_items = self.SWORD_ITEMS.copy() + item_names
                        return {
                            'rule': 'HasAny',
                            'args': {'items': expanded_items}
                        }

        # Handle RB format: Has rule with has_sword
        if rb_rule == 'Has':
            item_name = args.get('item_name', '')
            if item_name == 'has_sword':
                return self._expand_has_sword()

        # Handle RB format: HasAll with has_sword in the items list
        if rb_rule == 'HasAll':
            items = args.get('items', [])
            if 'has_sword' in items:
                # Replace has_sword with an And of HasAny(SWORD_ITEMS) and HasAll(other items)
                other_items = [i for i in items if i != 'has_sword']
                if not other_items:
                    # Only has_sword in the list
                    return self._expand_has_sword()
                elif len(other_items) == 1:
                    # One other item - And(HasAny(swords), Has(item))
                    return {
                        'rule': 'And',
                        'children': [
                            self._expand_has_sword(),
                            {'rule': 'Has', 'args': {'item_name': other_items[0]}}
                        ]
                    }
                else:
                    # Multiple other items - And(HasAny(swords), HasAll(other items))
                    return {
                        'rule': 'And',
                        'children': [
                            self._expand_has_sword(),
                            {'rule': 'HasAll', 'args': {'items': other_items}}
                        ]
                    }

        # Handle RB format: HasAny with has_sword in the items list
        if rb_rule == 'HasAny':
            items = args.get('items', [])
            if 'has_sword' in items:
                # Replace has_sword with the actual sword items
                other_items = [i for i in items if i != 'has_sword']
                expanded_items = self.SWORD_ITEMS.copy() + other_items
                return {
                    'rule': 'HasAny',
                    'args': {'items': expanded_items}
                }

        return None

    def _expand_ruleutils_from_call(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand RuleUtils calls from 'call' AST type (alternative format)."""
        func = rule.get('func', {})
        if not isinstance(func, dict):
            return None

        # Check for RuleUtils.method pattern
        func_value = func.get('value', {})
        if isinstance(func_value, dict) and func_value.get('id') == 'RuleUtils':
            method_name = func.get('attr', '')
            call_args = rule.get('args', [])

            if method_name == 'has_darkroom':
                return self._expand_has_darkroom(call_args)
            elif method_name == 'can_passBoxes':
                return self._expand_can_pass_boxes()
            elif method_name == 'can_openChest':
                return self._expand_can_open_chest()
            elif method_name == 'has_megasword':
                return self._expand_has_megasword()
            elif method_name == 'has_brokensword':
                return self._expand_has_brokensword()
            elif method_name == 'total_hearts':
                return self._expand_total_hearts(call_args)

        return None

    def _expand_ruleutils_call(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand RuleUtils.* and self.helpers['name']() calls to Rule Builder format."""
        args = rule.get('args', {})

        # Handle case where args is a list (not a dict)
        if isinstance(args, list):
            # args is a list of function arguments, not a structured dict
            # Try to get function from rule directly
            function = rule.get('function', {})
        else:
            function = args.get('function') or rule.get('function', {})

        if not isinstance(function, dict):
            return None

        # Check for self.helpers['name']() pattern (ER mode)
        # Structure: function.type == 'subscript', function.value.attr == 'helpers'
        if function.get('type') == 'subscript':
            result = self._expand_helpers_subscript(function)
            if result is not None:
                return result

        # Check for RuleUtils.* pattern
        if function.get('type') != 'attribute':
            return None

        obj = function.get('object', {})
        if not isinstance(obj, dict):
            return None

        if obj.get('type') != 'name' or obj.get('name') != 'RuleUtils':
            return None

        method_name = function.get('attr', '')
        # Handle both dict and list args formats
        if isinstance(args, list):
            call_args = args  # args is already the list of arguments
        else:
            call_args = args.get('args', []) or rule.get('call_args', [])

        logger.debug(f"Expanding RuleUtils.{method_name} with args: {call_args}")

        # Dispatch to specific handler
        if method_name == 'has_darkroom':
            return self._expand_has_darkroom(call_args)
        elif method_name == 'can_passBoxes':
            return self._expand_can_pass_boxes()
        elif method_name == 'can_openChest':
            return self._expand_can_open_chest()
        elif method_name == 'has_megasword':
            return self._expand_has_megasword()
        elif method_name == 'has_brokensword':
            return self._expand_has_brokensword()
        elif method_name == 'total_hearts':
            return self._expand_total_hearts(call_args)

        return None

    def _expand_has_sword(self) -> Dict[str, Any]:
        """Expand 'has_sword' check to actual sword items.

        The Minit world adds a synthetic 'has_sword' event to state when any
        sword is collected. Since worldgen worlds don't have the collect()
        callback that does this, we need to check for the actual sword items.

        Logic: HasAny(ItemBrokenSword, ItemSword, ItemMegaSword, Progressive Sword, Reverse Progressive Sword)
        """
        return {
            'rule': 'HasAny',
            'args': {'items': self.SWORD_ITEMS.copy()}
        }

    def _expand_helpers_subscript(self, function: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand self.helpers['name']() calls to Rule Builder format.

        In ER mode, Minit uses self.helpers dictionary with helper lambdas:
        - swim: state.has("ItemSwim", player)
        - darkroom1/2/3: RuleUtils.has_darkroom(player, state, 1/2/3, darkrooms)
        - sword: has any of the sword items (ItemBrokenSword, ItemSword, etc.)
        - wateringcan: state.has("ItemWateringCan", player)
        - presspass: state.has("ItemPressPass", player)
        - basement: state.has("ItemBasement", player)
        - tree: has_sword AND ItemGlove
        - chest: RuleUtils.can_openChest()
        - box: RuleUtils.can_passBoxes()
        - teleport: has_all(teleporter switch1, switch4, switch6)
        """
        # Check if this is self.helpers[...] pattern
        value = function.get('value', {})
        if not isinstance(value, dict):
            return None

        if value.get('type') != 'attribute' or value.get('attr') != 'helpers':
            return None

        # Get the helper name from the index
        index = function.get('index', {})
        if isinstance(index, dict) and index.get('type') == 'constant':
            helper_name = index.get('value', '')
        else:
            return None

        logger.debug(f"Expanding self.helpers['{helper_name}']")

        # Dispatch to specific helper expansion
        if helper_name == 'swim':
            return {'rule': 'Has', 'args': {'item_name': 'ItemSwim'}}
        elif helper_name == 'sword':
            # Expand to check for any actual sword item
            return self._expand_has_sword()
        elif helper_name == 'wateringcan':
            return {'rule': 'Has', 'args': {'item_name': 'ItemWateringCan'}}
        elif helper_name == 'presspass':
            return {'rule': 'Has', 'args': {'item_name': 'ItemPressPass'}}
        elif helper_name == 'basement':
            return {'rule': 'Has', 'args': {'item_name': 'ItemBasement'}}
        elif helper_name == 'darkroom1':
            return self._expand_has_darkroom([{'type': 'constant', 'value': 1}])
        elif helper_name == 'darkroom2':
            return self._expand_has_darkroom([{'type': 'constant', 'value': 2}])
        elif helper_name == 'darkroom3':
            return self._expand_has_darkroom([{'type': 'constant', 'value': 3}])
        elif helper_name == 'tree':
            # tree: has_sword AND ItemGlove - need composite rule
            return {
                'rule': 'And',
                'children': [
                    self._expand_has_sword(),
                    {'rule': 'Has', 'args': {'item_name': 'ItemGlove'}}
                ]
            }
        elif helper_name == 'chest':
            return self._expand_can_open_chest()
        elif helper_name == 'box':
            return self._expand_can_pass_boxes()
        elif helper_name == 'teleport':
            # teleport: has_all(teleporter switch1, switch4, switch6)
            return {
                'rule': 'HasAll',
                'args': {'items': ['teleporter switch1', 'teleporter switch4', 'teleporter switch6']}
            }

        logger.warning(f"Unknown Minit helper: {helper_name}")
        return None

    def _expand_has_darkroom(self, args: List[Any]) -> Dict[str, Any]:
        """Expand RuleUtils.has_darkroom(player, state, value, darkrooms).

        Logic: darkrooms >= value or state.has("ItemFlashLight", player)

        Since darkrooms is an option value, we resolve it at export time if known.
        Otherwise, we create a conditional rule.
        """
        # Extract the value argument (third arg after player and state, or first if they're stripped)
        value = None
        darkrooms_setting = None

        for arg in args:
            if isinstance(arg, dict):
                if arg.get('type') == 'constant':
                    if value is None:
                        value = arg.get('value')
                elif arg.get('type') == 'attribute':
                    # This is likely self.darkrooms - the option value
                    if arg.get('attr') == 'darkrooms':
                        darkrooms_setting = 'darkrooms'
            elif isinstance(arg, (int, float)):
                if value is None:
                    value = arg

        if value is None:
            value = 1  # Default darkroom level

        # If we know the darkrooms option value, resolve it
        if self._darkrooms_option is not None:
            if self._darkrooms_option >= value:
                # Darkrooms option allows access without flashlight
                return {'rule': 'True_'}

        # Otherwise, create a conditional rule based on the option
        # If darkrooms >= value: True, else: require ItemFlashLight
        # Use 'children' for composite rules (what world_generator expects)
        return {
            'rule': 'Or',
            'children': [
                {
                    'rule': 'Conditional',
                    'args': {
                        'test': {
                            'rule': 'Compare',
                            'args': {
                                'left': {'rule': 'OptionValue', 'args': {'option': 'darkrooms'}},
                                'op': '>=',
                                'right': {'type': 'constant', 'value': value}
                            }
                        },
                        'if_true': {'rule': 'True_'},
                        'if_false': {'rule': 'False_'}
                    }
                },
                {
                    'rule': 'Has',
                    'args': {'item_name': 'ItemFlashLight'}
                }
            ]
        }

    def _expand_can_pass_boxes(self) -> Dict[str, Any]:
        """Expand RuleUtils.can_passBoxes(player, state).

        Logic: (has_sword AND ItemGrinder) OR ItemCoffee
        """
        return {
            'rule': 'Or',
            'children': [
                {
                    'rule': 'And',
                    'children': [
                        self._expand_has_sword(),
                        {'rule': 'Has', 'args': {'item_name': 'ItemGrinder'}}
                    ]
                },
                {
                    'rule': 'Has',
                    'args': {'item_name': 'ItemCoffee'}
                }
            ]
        }

    def _expand_can_open_chest(self) -> Dict[str, Any]:
        """Expand RuleUtils.can_openChest(player, state).

        Logic: has_sword OR ItemWateringCan
        """
        return {
            'rule': 'Or',
            'children': [
                self._expand_has_sword(),
                {'rule': 'Has', 'args': {'item_name': 'ItemWateringCan'}}
            ]
        }

    def _expand_has_megasword(self) -> Dict[str, Any]:
        """Expand RuleUtils.has_megasword(player, state).

        Logic: (ItemMegaSword OR Reverse Progressive Sword) OR Progressive Sword x3
        """
        return {
            'rule': 'Or',
            'children': [
                {
                    'rule': 'HasAny',
                    'args': {'items': ['ItemMegaSword', 'Reverse Progressive Sword']}
                },
                {
                    'rule': 'Has',
                    'args': {'item_name': 'Progressive Sword', 'count': 3}
                }
            ]
        }

    def _expand_has_brokensword(self) -> Dict[str, Any]:
        """Expand RuleUtils.has_brokensword(player, state).

        Logic: (ItemBrokenSword OR Progressive Sword) OR Reverse Progressive Sword x3
        """
        return {
            'rule': 'Or',
            'children': [
                {
                    'rule': 'HasAny',
                    'args': {'items': ['ItemBrokenSword', 'Progressive Sword']}
                },
                {
                    'rule': 'Has',
                    'args': {'item_name': 'Reverse Progressive Sword', 'count': 3}
                }
            ]
        }

    def _expand_total_hearts(self, args: List[Any]) -> Dict[str, Any]:
        """Expand RuleUtils.total_hearts(player, state, count).

        Logic: state.has("HeartPiece", player, count - 2)
        """
        # Extract count from args
        count = 2  # Default
        for arg in args:
            if isinstance(arg, dict) and arg.get('type') == 'constant':
                count = arg.get('value', 2)
            elif isinstance(arg, (int, float)):
                count = arg

        heart_count = max(0, count - 2)

        if heart_count == 0:
            return {'rule': 'True_'}

        return {
            'rule': 'Has',
            'args': {'item_name': 'HeartPiece', 'count': heart_count}
        }
