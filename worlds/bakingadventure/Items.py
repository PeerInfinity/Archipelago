from typing import Dict, NamedTuple, Optional
from BaseClasses import Item, ItemClassification


class ItemData(NamedTuple):
    code: Optional[int]
    progression: bool = False
    classification: ItemClassification = ItemClassification.filler
    
    
base_item_id = 300100000


class BakingAdventureItem(Item):
    game = "Baking Adventure"
    

# All items from the JSON file
item_table: Dict[str, ItemData] = {
    "Mixing Bowls": ItemData(
        code=base_item_id + 1,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Electric Mixer": ItemData(
        code=base_item_id + 2,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Measuring Tools": ItemData(
        code=base_item_id + 3,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Preheated Oven": ItemData(
        code=base_item_id + 4,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Prepared Sheets": ItemData(
        code=base_item_id + 5,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Softened Butter": ItemData(
        code=base_item_id + 6,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Butter Sugar Base": ItemData(
        code=base_item_id + 7,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Egg Mixture": ItemData(
        code=base_item_id + 8,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Creamed Mixture": ItemData(
        code=base_item_id + 9,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Measured Flour": ItemData(
        code=base_item_id + 10,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Flour Mixture": ItemData(
        code=base_item_id + 11,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Basic Dough": ItemData(
        code=base_item_id + 12,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Cookie Dough": ItemData(
        code=base_item_id + 13,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Shaped Cookies": ItemData(
        code=base_item_id + 14,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Baked Cookies": ItemData(
        code=base_item_id + 15,
        progression=True,
        classification=ItemClassification.progression
    ),
    "Victory": ItemData(
        code=None,  # Event items don't have codes
        progression=True,
        classification=ItemClassification.progression
    ),
}


# Helper functions
def get_item_names() -> list[str]:
    """Get all item names."""
    return list(item_table.keys())


def get_progression_items() -> list[str]:
    """Get all progression item names."""
    return [name for name, data in item_table.items() if data.progression]


def get_useful_items() -> list[str]:
    """Get all useful item names."""
    return [name for name, data in item_table.items() if data.classification == ItemClassification.useful]


def get_filler_items() -> list[str]:
    """Get all filler item names."""
    return [name for name, data in item_table.items() if data.classification == ItemClassification.filler]