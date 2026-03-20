"""Terraria game-specific export handler.

Terraria uses a custom DSV (Rules.dsv) rule system with special Condition objects.
This exporter converts those conditions to the standard JSON rule format.

Note: This exporter cannot be simplified using standard base class tools because:
1. Terraria uses a completely custom rule system (DSV/Condition objects) that requires
   specialized conversion, unlike standard worlds that use Python lambdas.
2. The override_rule_analysis hook bypasses standard rule analysis entirely.
3. The helper creation methods produce specific rule structures needed for Terraria's
   unique game mechanics (NPCs, pickaxes, hammers, mech bosses, minions).
"""

from typing import Dict, Any, Callable, List, Optional, Union
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


def _get_armor_minions(w, m, p) -> Dict[str, int]:
    """Get armor minion data from Terraria Checks module."""
    from worlds.terraria.Checks import armor_minions
    return dict(armor_minions)


def _get_accessory_minions(w, m, p) -> Dict[str, int]:
    """Get accessory minion data from Terraria Checks module."""
    from worlds.terraria.Checks import accessory_minions
    return dict(accessory_minions)


class TerrariaGameExportHandler(GenericGameExportHandler):
    """Terraria export handler with custom rule system support.

    Terraria uses a custom DSV (Rules.dsv) rule system with Condition objects.
    This exporter converts those conditions to the standard JSON rule format.

    Note: Options like calamity, grindy_achievements, getfixedboi are automatically
    exported by the base class in the 'options' section. The frontend's getSetting()
    falls back to options.* so no COMPUTED_SETTINGS are needed.
    """

    # Export armor and accessory minion data for the has_minions helper
    WORLD_ATTRIBUTES: Dict[str, Callable] = {
        'armor_minions': _get_armor_minions,
        'accessory_minions': _get_accessory_minions,
    }

    def __init__(self):
        super().__init__()
        # Import Terraria-specific constants and types
        from worlds.terraria.Checks import (
            COND_ITEM, COND_LOC, COND_FN, COND_GROUP,
            rules, rule_indices, npcs, pickaxes, hammers,
            mech_bosses
        )

        self.COND_ITEM = COND_ITEM
        self.COND_LOC = COND_LOC
        self.COND_FN = COND_FN
        self.COND_GROUP = COND_GROUP
        self.rules = rules
        self.rule_indices = rule_indices
        self.npcs = npcs
        self.pickaxes = pickaxes
        self.hammers = hammers
        self.mech_bosses = mech_bosses

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for Terraria locations.

        Terraria uses a custom rule system with Condition objects. Instead of
        analyzing the lambda function, we directly access the rule data from
        the Terraria rule system.
        """
        try:
            # Extract location name from rule_target_name
            if not rule_target_name:
                return None

            # Get the rule data from Terraria's rule system
            if rule_target_name not in self.rule_indices:
                logger.debug(f"Location {rule_target_name} not found in Terraria rule_indices")
                return None

            rule = self.rules[self.rule_indices[rule_target_name]]

            # Convert the rule to JSON format
            result = self._convert_rule(rule.operator, rule.conditions)

            # IMPORTANT: We need to return a dict, not None, to signal that we handled this.
            # If result is None (always accessible), wrap it in a sentinel dict.
            if result is None:
                return {'__terraria_handled__': True, '__value__': None}
            return result

        except Exception as e:
            logger.error(f"Error in override_rule_analysis for {rule_target_name}: {e}", exc_info=True)
            return None

    def _convert_rule(self, operator: Union[bool, None], conditions: List) -> Optional[Dict[str, Any]]:
        """Convert Terraria operator + conditions to JSON rule format.

        Args:
            operator: True = OR, False = AND, None = single condition or no conditions
            conditions: List of Condition objects
        """
        if not conditions:
            # No conditions means always accessible
            return None

        if operator is None:
            # Single condition or no conditions
            if len(conditions) == 0:
                return None
            elif len(conditions) == 1:
                return self._convert_condition(conditions[0])
            else:
                logger.error(f"Multiple conditions without operator: {len(conditions)}")
                # Default to AND
                return {
                    'type': 'and',
                    'conditions': [self._convert_condition(c) for c in conditions]
                }
        elif operator:
            # OR operator
            return {
                'type': 'or',
                'conditions': [self._convert_condition(c) for c in conditions]
            }
        else:
            # AND operator
            return {
                'type': 'and',
                'conditions': [self._convert_condition(c) for c in conditions]
            }

    def _convert_condition(self, condition) -> Dict[str, Any]:
        """Convert a single Terraria Condition object to JSON rule format.

        Condition types:
        - COND_ITEM (0): Check if player has an item
        - COND_LOC (1): Check if a location is accessible (recursively)
        - COND_FN (2): Call a special function (npc, pickaxe, etc.)
        - COND_GROUP (3): Check group conditions
        """
        # condition.sign: True = positive check, False = negated check
        # condition.type: 0=ITEM, 1=LOC, 2=FN, 3=GROUP
        # condition.condition: The condition data (name, tuple, etc.)
        # condition.argument: Optional argument for functions

        if condition.type == self.COND_ITEM:
            # Check for an item
            item_name = self._get_item_name(condition.condition)
            rule = {
                'type': 'item_check',
                'item': item_name
            }

            # Handle negation
            if not condition.sign:
                rule = {'type': 'not', 'condition': rule}

            return rule

        elif condition.type == self.COND_LOC:
            # Check if a location is accessible (recursive rule check)
            loc_name = condition.condition
            if loc_name not in self.rule_indices:
                logger.error(f"Location {loc_name} not found in rule_indices")
                return {'type': 'constant', 'value': False}

            loc_rule = self.rules[self.rule_indices[loc_name]]
            rule = self._convert_rule(loc_rule.operator, loc_rule.conditions)

            # Handle negation
            if not condition.sign:
                if rule:
                    rule = {'type': 'not', 'condition': rule}
                else:
                    # Negating "always accessible" means never accessible
                    return {'type': 'constant', 'value': False}

            return rule if rule else {'type': 'constant', 'value': True}

        elif condition.type == self.COND_FN:
            # Special function check
            fn_name = condition.condition
            fn_arg = condition.argument

            if fn_name == "npc":
                rule = self._create_list_unique_check(self.npcs, fn_arg)
            elif fn_name == "mech_boss":
                rule = self._create_list_unique_check(self.mech_bosses, fn_arg)
            elif fn_name == "pickaxe":
                rule = self._create_tool_check(self.pickaxes, fn_arg)
            elif fn_name == "hammer":
                rule = self._create_tool_check(self.hammers, fn_arg)
            elif fn_name == "minions":
                rule = self._create_minion_check(fn_arg)
            elif fn_name in ("calamity", "grindy", "getfixedboi"):
                # Map function names to their corresponding setting names
                setting_map = {"grindy": "grindy_achievements"}
                rule = {'type': 'setting_value', 'setting': setting_map.get(fn_name, fn_name)}
            else:
                logger.error(f"Unknown function: {fn_name}")
                rule = {'type': 'constant', 'value': False}

            # Handle negation
            if not condition.sign:
                rule = {'type': 'not', 'condition': rule}

            return rule

        elif condition.type == self.COND_GROUP:
            # Group condition (operator, conditions)
            operator, conditions = condition.condition
            rule = self._convert_rule(operator, conditions)

            # Handle negation
            if not condition.sign:
                if rule:
                    rule = {'type': 'not', 'condition': rule}
                else:
                    return {'type': 'constant', 'value': False}

            return rule if rule else {'type': 'constant', 'value': True}

        else:
            logger.error(f"Unknown condition type: {condition.type}")
            return {'type': 'constant', 'value': False}

    def _get_item_name(self, condition_name: str) -> str:
        """Get the actual item name from a condition name.

        Some conditions have an "Item" flag that maps to a different item name.
        """
        if condition_name in self.rule_indices:
            rule = self.rules[self.rule_indices[condition_name]]
            if "Item" in rule.flags:
                return str(rule.flags.get("Item") or f"Post-{condition_name}")
        return condition_name

    def _create_list_unique_check(self, item_list: List[str], required_count: int) -> Dict[str, Any]:
        """Create a rule to check if player has at least N unique items from a list.

        Uses the built-in has_from_list_unique state method.
        """
        return {
            'type': 'state_method',
            'method': 'has_from_list_unique',
            'args': [list(item_list), required_count]
        }

    def _create_tool_check(self, tool_dict: Dict[str, int], required_power: int) -> Dict[str, Any]:
        """Create a rule to check if player has a tool with at least N power.

        Works for pickaxes, hammers, or any tool with a power value.
        """
        valid_tools = [
            name for name, power in tool_dict.items()
            if power >= required_power
        ]

        if not valid_tools:
            return {'type': 'constant', 'value': False}

        if len(valid_tools) == 1:
            return {'type': 'item_check', 'item': valid_tools[0]}

        return {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': name}
                for name in valid_tools
            ]
        }

    def _create_minion_check(self, required_count: int) -> Dict[str, Any]:
        """Create a rule to check if player has at least N minion slots.

        This is complex because:
        - Base minion count is 1
        - Armor sets provide a fixed number of minions (and only the best one counts)
        - Accessories add their minion counts together
        """
        return {
            'type': 'helper',
            'name': 'has_minions',
            'args': [
                {'type': 'constant', 'value': required_count}
            ]
        }

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """Define computed helpers for Terraria.

        Provides rule-based definitions for:
        - has_minions: Check if player has at least N minion slots

        Note: NPC and mech boss counting now uses the built-in has_from_list_unique
        state method instead of a custom helper.
        """
        helper_defs = super().get_helper_definitions(world)

        # has_minions(required_count)
        # Logic: (1 + max(armor bonuses) + sum(accessory bonuses)) >= required_count
        # Where:
        #   max(armor bonuses) = max(bonus for armor, bonus in armor_minions.items() if has(armor))
        #   sum(accessory bonuses) = sum(bonus for acc, bonus in accessory_minions.items() if has(acc))
        helper_defs['has_minions'] = {
            'params': ['required_count'],
            'body': {
                'type': 'compare',
                'op': '>=',
                'left': {
                    'type': 'binary_op',
                    'op': '+',
                    'left': {
                        'type': 'binary_op',
                        'op': '+',
                        'left': {'type': 'constant', 'value': 1},  # Base minion count
                        'right': {
                            # max(bonus for armor, bonus in armor_minions.items() if has(armor))
                            # Use conditional to handle empty case (return 0 if no armor found)
                            'type': 'conditional',
                            'test': {
                                # Check if any armor is owned: any(has(a) for a in armor_minions.keys())
                                'type': 'any_of',
                                'iterator_info': {
                                    'target': {'type': 'name', 'name': 'armor'},
                                    'iterator': {
                                        'type': 'method_call',
                                        'object': {'type': 'setting_value', 'setting': 'armor_minions'},
                                        'method': 'keys',
                                        'args': []
                                    }
                                },
                                'element_rule': {
                                    'type': 'item_check',
                                    'item': {'type': 'name', 'name': 'armor'}
                                }
                            },
                            'if_true': {
                                # max of bonuses for owned armor
                                'type': 'max',
                                'iterable': {
                                    'type': 'generator_expression',
                                    'element': {'type': 'name', 'name': 'bonus'},
                                    'comprehension': {
                                        'target': {
                                            'type': 'tuple',
                                            'elements': [
                                                {'type': 'name', 'name': 'armor'},
                                                {'type': 'name', 'name': 'bonus'}
                                            ]
                                        },
                                        'iterator': {
                                            'type': 'method_call',
                                            'object': {'type': 'setting_value', 'setting': 'armor_minions'},
                                            'method': 'items',
                                            'args': []
                                        },
                                        'conditions': [{
                                            'type': 'item_check',
                                            'item': {'type': 'name', 'name': 'armor'}
                                        }]
                                    }
                                }
                            },
                            'if_false': {'type': 'constant', 'value': 0}
                        }
                    },
                    'right': {
                        # sum(bonus for acc, bonus in accessory_minions.items() if has(acc))
                        'type': 'sum',
                        'iterable': {
                            'type': 'generator_expression',
                            'element': {'type': 'name', 'name': 'bonus'},
                            'comprehension': {
                                'target': {
                                    'type': 'tuple',
                                    'elements': [
                                        {'type': 'name', 'name': 'acc'},
                                        {'type': 'name', 'name': 'bonus'}
                                    ]
                                },
                                'iterator': {
                                    'type': 'method_call',
                                    'object': {'type': 'setting_value', 'setting': 'accessory_minions'},
                                    'method': 'items',
                                    'args': []
                                },
                                'conditions': [{
                                    'type': 'item_check',
                                    'item': {'type': 'name', 'name': 'acc'}
                                }]
                            }
                        }
                    }
                },
                'right': {'type': 'name', 'name': 'required_count'}
            }
        }

        return helper_defs
