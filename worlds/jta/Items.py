"""
Item definitions for Journey to Ascension.

Items are JTA perks. The item pool is dynamic based on goal_zone.
"""

from typing import Dict, Optional

from BaseClasses import Item, ItemClassification

from .game_data import PERK_DISPLAY_NAMES, get_perk_tasks_for_goal, get_unique_perks_for_goal


BASE_ITEM_ID = 590000


class JTAItem(Item):
    game: str = "Journey to Ascension"


class ItemData:
    def __init__(self, item_id: Optional[int], classification: ItemClassification):
        self.id = item_id
        self.classification = classification


def build_item_table(goal_zone: int) -> Dict[str, ItemData]:
    """Build item table for the given goal zone.

    Each unique perk in zones before goal_zone becomes a progression item.
    If there are more perk-granting tasks than unique perks (due to
    duplicate perk assignments), filler items are added.
    """
    table: Dict[str, ItemData] = {}
    unique_perks = get_unique_perks_for_goal(goal_zone)
    perk_tasks = get_perk_tasks_for_goal(goal_zone)

    # One progression item per unique perk
    for i, perk_name in enumerate(unique_perks):
        display_name = PERK_DISPLAY_NAMES[perk_name]
        table[display_name] = ItemData(BASE_ITEM_ID + i, ItemClassification.progression)

    # If more locations than unique perks, add filler items
    num_extra = len(perk_tasks) - len(unique_perks)
    for i in range(num_extra):
        filler_name = f"Energy Boost #{i + 1}"
        table[filler_name] = ItemData(
            BASE_ITEM_ID + len(unique_perks) + i,
            ItemClassification.filler,
        )

    return table


MAX_STARTING_PERKS = 15


def get_full_item_table() -> Dict[str, ItemData]:
    """Build item table for the maximum goal zone (all perks).

    Used for class-level item_name_to_id which must be static.
    Includes filler items for starting perks (up to MAX_STARTING_PERKS).
    """
    table = build_item_table(27)
    next_id = BASE_ITEM_ID + len(table)
    for i in range(MAX_STARTING_PERKS):
        name = f"Starting Perk Bonus #{i + 1}"
        table[name] = ItemData(next_id + i, ItemClassification.filler)
    return table


# Static table used for class-level registration (includes all possible items)
item_table: Dict[str, ItemData] = get_full_item_table()
