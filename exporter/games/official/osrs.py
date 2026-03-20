"""Old School Runescape game-specific export handler.

Exports:
- qp_items: Mapping of quest item names to their QP values (via ITEM_VALUE_MAPPINGS)
- quest_points helper: Computed sum of QP values for items the player has (via DICT_SUM_HELPERS)

Note: The base class automatically converts self.quest_points() and
world.quest_points() method calls to helper function calls via
CONVERT_WORLD_METHODS_TO_HELPERS = True (the default).
"""

from ..base import GenericGameExportHandler


class OSRSGameExportHandler(GenericGameExportHandler):
    # Compute qp_items mapping from available_QP_locations
    # Each item name starts with a digit indicating its QP value (e.g., "1 QP (Cook's Assistant)")
    ITEM_VALUE_MAPPINGS = {
        'qp_items': {
            'source': 'available_QP_locations',
            'value_extractor': lambda item: int(item[0]),
        }
    }

    # Generate quest_points helper that sums values from qp_items for items the player has
    DICT_SUM_HELPERS = {
        'quest_points': 'qp_items',
    }
