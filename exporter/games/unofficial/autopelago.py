"""Autopelago game-specific export handler.

Autopelago uses a recursive `_is_satisfied` helper function with a custom data structure
for requirements. This handler intercepts rule analysis and converts the requirement
structures directly to Rule Builder format.

The requirement structures are:
- {"item": "item_key"} - requires an item (key is converted to name via item_key_to_name)
- {"all": [...]} - all requirements must be met
- {"any": [...]} - any one requirement must be met
- {"any_two": [...]} - at least 2 requirements must be met
- {"rat_count": N} - need N rats total (sum of item_name_to_rat_count values)

The access rules are lambdas like:
    lambda state: _is_satisfied(player, req, state)
where `req` is a captured closure variable containing the requirement structure.
"""

from typing import Dict, Any, List, Optional, Callable
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class AutopelagoGameExportHandler(GenericGameExportHandler):
    """Export handler for Autopelago.

    Intercepts _is_satisfied rules and converts the requirement data structures
    to Rule Builder format.
    """

    GAME_NAME = "Autopelago"

    # Cache for apworld data
    _item_key_to_name: Optional[Dict[str, str]] = None
    _item_name_to_rat_count: Optional[Dict[str, int]] = None
    _loaded: bool = False

    def __init__(self, world=None):
        super().__init__(world)
        self._load_apworld_data()

    def _load_apworld_data(self) -> None:
        """Load the apworld's data modules for rule conversion."""
        if AutopelagoGameExportHandler._loaded:
            return

        try:
            from worlds.autopelago.AutopelagoDefinitions import (  # type: ignore[import-not-found]
                item_key_to_name,
                item_name_to_rat_count
            )

            AutopelagoGameExportHandler._item_key_to_name = item_key_to_name
            AutopelagoGameExportHandler._item_name_to_rat_count = item_name_to_rat_count
            AutopelagoGameExportHandler._loaded = True

            logger.debug(f"Loaded Autopelago data: {len(item_key_to_name)} items, "
                        f"{len(item_name_to_rat_count)} rat items")
        except Exception as e:
            logger.warning(f"Could not load Autopelago data modules: {e}")
            AutopelagoGameExportHandler._item_key_to_name = {}
            AutopelagoGameExportHandler._item_name_to_rat_count = {}
            AutopelagoGameExportHandler._loaded = True

    def _convert_requirement(self, req: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Convert an Autopelago requirement structure to Rule Builder format.

        Args:
            req: The requirement dictionary from the apworld

        Returns:
            A Rule Builder compatible rule dictionary, or None if conversion fails
        """
        if not req:
            return None

        # Handle "all" - all requirements must be met
        if 'all' in req:
            sub_reqs = req['all']
            if not sub_reqs:
                # Empty "all" is always true
                return {'type': 'constant', 'value': True}

            converted = [self._convert_requirement(sub) for sub in sub_reqs]
            converted = [c for c in converted if c is not None]

            if not converted:
                return {'type': 'constant', 'value': True}
            if len(converted) == 1:
                return converted[0]

            # Use 'and' type with 'conditions' key (worldgen format)
            return {
                'type': 'and',
                'conditions': converted
            }

        # Handle "any" - any one requirement must be met
        if 'any' in req:
            sub_reqs = req['any']
            if not sub_reqs:
                # Empty "any" is always false (nothing can satisfy it)
                return {'type': 'constant', 'value': False}

            converted = [self._convert_requirement(sub) for sub in sub_reqs]
            converted = [c for c in converted if c is not None]

            if not converted:
                return {'type': 'constant', 'value': False}
            if len(converted) == 1:
                return converted[0]

            # Use 'or' type with 'conditions' key (worldgen format)
            return {
                'type': 'or',
                'conditions': converted
            }

        # Handle "any_two" - at least 2 requirements must be met
        if 'any_two' in req:
            sub_reqs = req['any_two']
            if len(sub_reqs) < 2:
                # Can never satisfy "any two" with fewer than 2 options
                return {'type': 'constant', 'value': False}

            converted = [self._convert_requirement(sub) for sub in sub_reqs]
            converted = [c for c in converted if c is not None]

            if len(converted) < 2:
                return {'type': 'constant', 'value': False}

            # Use count_true with 'conditions' key (worldgen format)
            return {
                'type': 'count_true',
                'count': 2,
                'conditions': converted
            }

        # Handle "item" - requires a specific item
        if 'item' in req:
            item_key = req['item']
            # Convert item key to name using the apworld's mapping
            item_name = self._item_key_to_name.get(item_key, item_key) if self._item_key_to_name else item_key
            return {
                'type': 'item_check',
                'item': item_name,
                'count': 1
            }

        # Handle "rat_count" - requires N total rats
        if 'rat_count' in req:
            rat_count = req['rat_count']
            if rat_count == 0:
                return {'type': 'constant', 'value': True}

            # Use weighted_sum rule format (same as Rift Wizard mana counting).
            # This properly handles counting multiple copies of items with different weights.
            # The worldgen converts this to WeightedSum(threshold=N, items=[...])
            if self._item_name_to_rat_count:
                # Build list of [item_name, weight] pairs for weighted_sum
                items_with_weights = []
                for item_name, rat_value in self._item_name_to_rat_count.items():
                    if rat_value > 0:
                        items_with_weights.append([item_name, float(rat_value)])

                # Use the weighted_sum helper format that rule_codegen expects
                return {
                    'rule': 'weighted_sum',
                    '_original_ast_type': 'helper',
                    'args': [
                        {'rule': 'Constant', 'args': {'value': float(rat_count)}},
                        {'rule': 'Constant', 'args': {'value': items_with_weights}}
                    ]
                }
            else:
                # Fallback if we couldn't load the rat count data
                logger.warning(f"Cannot convert rat_count {rat_count} - missing item data")
                return None

        logger.warning(f"Unknown requirement type: {req}")
        return None

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to convert _is_satisfied rules.

        Autopelago access rules are lambdas that call _is_satisfied with a captured
        `req` closure variable. We extract the requirement structure and convert it
        directly to Rule Builder format.
        """
        if not hasattr(rule_func, '__code__'):
            return None

        code = rule_func.__code__
        func_name = code.co_name

        # Check if this is a lambda (anonymous function)
        if func_name != '<lambda>':
            return None

        # Check if it calls _is_satisfied (look in co_names for the function call)
        if '_is_satisfied' not in code.co_names:
            return None

        logger.debug(f"Autopelago: Found _is_satisfied rule for {rule_target_name}")

        # Extract the 'req' closure variable
        req = None
        if hasattr(rule_func, '__closure__') and rule_func.__closure__:
            freevars = code.co_freevars
            for i, var_name in enumerate(freevars):
                if var_name == 'req':
                    if i < len(rule_func.__closure__):
                        try:
                            req = rule_func.__closure__[i].cell_contents
                            break
                        except ValueError:
                            pass
                # Also check for 'req_' which is used in some lambdas
                if var_name == 'req_':
                    if i < len(rule_func.__closure__):
                        try:
                            req = rule_func.__closure__[i].cell_contents
                            break
                        except ValueError:
                            pass

        if req is None:
            logger.debug(f"Autopelago: Could not extract req for {rule_target_name}")
            return None

        logger.debug(f"Autopelago: Extracted req = {req}")

        # Convert the requirement structure to Rule Builder format
        converted = self._convert_requirement(req)
        if converted:
            logger.debug(f"Autopelago: Converted rule for {rule_target_name}: {converted}")
            return converted

        return None

