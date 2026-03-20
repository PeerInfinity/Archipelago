"""Pizza Tower game-specific export handler.

Pizza Tower uses a `rule_from_itemset` helper function that evaluates whether the player
has all items in any of the given item sets. This handler expands these calls to their
equivalent Rule Builder expressions during the export phase.

The `rule_from_itemset(state, itemsets)` pattern takes a list of item sets where each set
is a list of items. It returns True if the player has ALL items in ANY of the sets.
This is equivalent to: Any(All(item1, item2), All(item3, item4), ...)

Example conversion:
    rule_from_itemset([['Lap 2 Portals', 'Superjump'], ['Lap 2 Portals', 'Wallclimb']])

    becomes:

    Any(All('Lap 2 Portals', 'Superjump'), All('Lap 2 Portals', 'Wallclimb'))

This is converted to Rule Builder format:
    {
        "rule": "Or",
        "children": [
            {"rule": "And", "children": [
                {"rule": "Has", "args": {"item_name": "Lap 2 Portals"}},
                {"rule": "Has", "args": {"item_name": "Superjump"}}
            ]},
            {"rule": "And", "children": [
                {"rule": "Has", "args": {"item_name": "Lap 2 Portals"}},
                {"rule": "Has", "args": {"item_name": "Wallclimb"}}
            ]}
        ]
    }

The `get_item_perc_amount` helper calculates item counts based on percentages and is
exported as a definition so the frontend can evaluate it directly.
"""

from typing import Dict, Any, Optional, List, Set
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class PizzaTowerGameExportHandler(GenericGameExportHandler):
    """Export handler for Pizza Tower.

    Expands rule_from_itemset helper calls to Rule Builder Any/All expressions.
    Exports get_item_perc_amount helper so the frontend can evaluate item percentage calculations.
    """

    GAME_NAME = 'Pizza Tower'

    # Export get_item_perc_amount helper as a definition
    # This helper calculates required item counts based on percentages and settings
    # The frontend needs the definition to properly evaluate entrance rules
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = {'get_item_perc_amount'}

    # Specify the module where helpers are defined
    HELPER_MODULES: List[str] = ['worlds.pizza_tower.Rules']

    # Auto-discover helpers from the world's Rules module
    AUTO_DISCOVER_WORLD_HELPER_MODULES = True

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Pizza Tower-specific rules.

        Converts rule_from_itemset helper calls to Rule Builder format.
        """
        if not isinstance(rule, dict):
            if isinstance(rule, list):
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        rule_type = rule.get('rule', '') or rule.get('type', '')

        # Handle rule_from_itemset helper pattern
        # Format: {'rule': 'rule_from_itemset', '_original_ast_type': 'helper', 'args': [...]}
        if rule_type == 'rule_from_itemset' and rule.get('_original_ast_type', '').endswith('helper'):
            result = self._convert_rule_from_itemset(rule)
            if result is not None:
                return result

        # Also handle the AST format if it appears
        if rule_type == 'helper' and rule.get('name') == 'rule_from_itemset':
            result = self._convert_rule_from_itemset(rule)
            if result is not None:
                return result

        # Recurse into children
        if 'conditions' in rule:
            rule = dict(rule)
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in rule['conditions']]

        if 'args' in rule:
            args = rule.get('args')
            if isinstance(args, dict):
                rule = dict(rule)
                new_args = {}
                for key, value in args.items():
                    if isinstance(value, dict):
                        new_args[key] = self.expand_rule(value, _depth + 1)
                    elif isinstance(value, list):
                        new_args[key] = [self.expand_rule(v, _depth + 1) if isinstance(v, dict) else v for v in value]
                    else:
                        new_args[key] = value
                rule['args'] = new_args
            elif isinstance(args, list):
                rule = dict(rule)
                rule['args'] = [self.expand_rule(a, _depth + 1) if isinstance(a, dict) else a for a in args]

        # Delegate to parent for standard expansion
        return super().expand_rule(rule, _depth)

    def _convert_rule_from_itemset(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Convert a rule_from_itemset call to Rule Builder Any/All format.

        Args:
            rule: The rule_from_itemset rule dict

        Returns:
            A Rule Builder Any/All expression equivalent to the original, or None if conversion fails
        """
        args = rule.get('args', [])
        if not args:
            # No itemsets - always True
            logger.debug("Pizza Tower: rule_from_itemset with no args, returning True")
            return {'type': 'constant', 'value': True}

        # Extract the itemsets from the first argument
        first_arg = args[0]
        itemsets = None

        if isinstance(first_arg, dict):
            if first_arg.get('rule') == 'Constant':
                itemsets = first_arg.get('args', {}).get('value', [])
            elif first_arg.get('type') == 'constant':
                itemsets = first_arg.get('value', [])

        if not itemsets:
            # Couldn't extract itemsets - return True as fallback
            logger.warning(f"Pizza Tower: Could not extract itemsets from rule_from_itemset: {rule}")
            return {'type': 'constant', 'value': True}

        logger.debug(f"Pizza Tower: Converting rule_from_itemset with {len(itemsets)} itemsets")

        # Convert each itemset to an And rule (using Rule Builder format)
        # Rule Builder uses 'And' with 'children' for conjunction, and 'Or' with 'children' for disjunction
        and_rules = []
        for itemset in itemsets:
            if not itemset:
                # Empty itemset - always True
                and_rules.append({'rule': 'True_'})
            elif len(itemset) == 1:
                # Single item - use Has (Rule Builder format)
                and_rules.append({
                    'rule': 'Has',
                    'args': {'item_name': itemset[0]}
                })
            else:
                # Multiple items - use And with Has for each (Rule Builder format)
                has_rules = [{'rule': 'Has', 'args': {'item_name': item}} for item in itemset]
                and_rules.append({
                    'rule': 'And',
                    'children': has_rules
                })

        # Wrap in Or if multiple itemsets, otherwise return the single rule
        if len(and_rules) == 0:
            return {'rule': 'True_'}
        elif len(and_rules) == 1:
            return and_rules[0]
        else:
            return {
                'rule': 'Or',
                'children': and_rules
            }
