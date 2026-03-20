"""Links Awakening DX game-specific export handler.

This exporter handles LADXR (Links Awakening DX Randomizer) specific data structures:
- LADXR condition objects (AND, OR, COUNT, FOUND, COUNTS)
- LADXR item name mapping to Archipelago item names
- LADXR entrance objects with condition attributes
- Rupee accumulator for tracking total rupees collected

The LADXR condition handling is truly game-specific due to LADXR's custom
condition class hierarchy with private attributes accessed via name mangling.
"""

from typing import Dict, Any, Optional
from ..base import GenericGameExportHandler
from worlds.ladx.Items import ladxr_item_to_la_item_name
import logging

logger = logging.getLogger(__name__)

class LADXGameExportHandler(GenericGameExportHandler):
    """Export handler for Links Awakening DX."""

    USE_RESOLVED_ITEMS = True

    # Define accumulator rules for rupee items
    # This allows the frontend to compute total RUPEES from collected rupee items
    # matching the Python behavior in worlds/ladx/__init__.py collect() method
    ACCUMULATOR_RULES = [
        {
            'pattern': r'^(\d+) Rupees$',    # Regex to match rupee items
            'extract_value': True,           # Extract numeric value from group 1
            'target': 'RUPEES',              # Target accumulator name
            'discriminator': None            # No dynamic target selection
        }
    ]

    # Default RUPEES accumulator init (may be overridden by world attribute for worldgen)
    PROG_ITEMS_INIT = {'RUPEES': 0}

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any):
        """
        Extract the actual condition from LADX entrance objects (for entrances).

        This delegates to handle_complex_exit_rule since LinksAwakeningEntrance
        objects are added to both region.exits and region.entrances (via connect()).
        Both need the same special handling to avoid analyzing the access_rule method
        which uses GameStateAdapater - a class that can't be analyzed as a function.
        """
        return self.handle_complex_exit_rule(entrance_name, rule)

    def handle_complex_exit_rule(self, exit_name: str, exit_rule):
        """
        Extract the actual condition from LADX entrance objects.

        LADX entrances store the actual condition in entrance.condition attribute,
        not in the access_rule method. We extract it directly here to avoid
        the isinstance pattern that the analyzer can't handle.
        """
        # exit_rule is a bound method, so we can get the instance
        if hasattr(exit_rule, '__self__'):
            entrance = exit_rule.__self__

            # Check if this is a LinksAwakeningEntrance with a condition attribute
            if hasattr(entrance, 'condition'):
                condition = entrance.condition

                # Case 1: None = always accessible
                if condition is None:
                    logger.debug(f"LADX exit '{exit_name}' has no condition, always accessible")
                    return {'type': 'constant', 'value': True}

                # Case 2: String = item or event name
                elif isinstance(condition, str):
                    mapped_item = self._map_ladxr_item_name(condition)
                    logger.debug(f"LADX exit '{exit_name}' requires item/event: {condition} -> {mapped_item}")
                    return {
                        'type': 'item_check',
                        'item': mapped_item
                    }

                # Case 3: LADXR condition object (AND/OR) - convert to rules
                else:
                    logger.debug(f"LADX exit '{exit_name}' has LADXR condition object, converting to rules")
                    converted_rule = self._convert_ladxr_condition_to_rule(condition)
                    if converted_rule:
                        return converted_rule
                    # If conversion failed, return None to use normal analysis
                    logger.warning(f"LADX exit '{exit_name}' LADXR condition conversion failed, using normal analysis")
                    return None

        # If we can't extract the condition, return None to use normal analysis
        return None

    def _convert_ladxr_condition_to_rule(self, condition) -> Optional[Dict[str, Any]]:
        """
        Convert a LADXR condition object (AND/OR/COUNT/FOUND/COUNTS) to a rule structure.

        LADXR uses classes with private attributes accessed via Python's name mangling.
        """
        class_name = condition.__class__.__name__

        # Handle AND/OR conditions (have __items and __children)
        if class_name in ('AND', 'OR'):
            items = getattr(condition, f'_{class_name}__items', [])
            children = getattr(condition, f'_{class_name}__children', [])

            conditions = [{'type': 'item_check', 'item': self._map_ladxr_item_name(item)} for item in items]
            for child in children:
                child_rule = self._convert_ladxr_condition_to_rule(child)
                if child_rule:
                    conditions.append(child_rule)

            if len(conditions) == 1:
                return conditions[0]
            elif len(conditions) > 1:
                return {'type': class_name.lower(), 'conditions': conditions}
            return None

        # Handle COUNT/FOUND conditions (single item with amount)
        if class_name in ('COUNT', 'FOUND'):
            item = getattr(condition, f'_{class_name}__item', None)
            amount = getattr(condition, f'_{class_name}__amount', 1)

            if item is None:
                logger.warning(f"{class_name} condition missing item attribute")
                return None

            mapped_item = self._map_ladxr_item_name(item)
            logger.debug(f"LADX {class_name} condition: {item} (mapped to {mapped_item}) >= {amount}")
            return {
                'type': 'item_check',
                'item': mapped_item,
                'count': {'type': 'constant', 'value': amount}
            }

        # Handle COUNTS condition (multiple items with combined amount)
        if class_name == 'COUNTS':
            items = getattr(condition, '_COUNTS__items', [])
            amount = getattr(condition, '_COUNTS__amount', 1)

            if not items:
                logger.warning("COUNTS condition missing items attribute")
                return None

            mapped_items = [self._map_ladxr_item_name(item) for item in items]
            logger.debug(f"LADX COUNTS condition: {items} (mapped to {mapped_items}) >= {amount}")
            return {
                'type': 'counts',
                'items': mapped_items,
                'count': {'type': 'constant', 'value': amount}
            }

        logger.warning(f"Unknown LADXR condition type: {class_name}")
        return None

    def _map_ladxr_item_name(self, item_str: str) -> str:
        """Map LADXR internal item names to Archipelago item names.

        Uses the canonical mapping from worlds/ladx/Items.py which maps
        LADXR IDs (e.g., 'POWER_BRACELET') to Archipelago names (e.g., 'Progressive Power Bracelet').

        Special case: 'RUPEES' is an accumulator target, not an actual item.
        """
        # Special case for RUPEES accumulator target
        if item_str == 'RUPEES':
            return 'RUPEES'
        # Use the canonical mapping from the world
        return ladxr_item_to_la_item_name.get(item_str, item_str)

