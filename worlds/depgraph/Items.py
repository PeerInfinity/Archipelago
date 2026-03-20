import typing
from BaseClasses import Item, ItemClassification
from typing import Optional

class ItemData(typing.NamedTuple):
    code: typing.Optional[int]
    classification: ItemClassification

class DepGraphItem(Item):
    game: str = "DepGraph"

    def __init__(self, name: str, classification: ItemClassification, code: Optional[int], player: int):
        self.name = name
        self.classification = classification
        self.player = player
        self.code = code
        self.location = None


def node_item_name(label, max_length=60):
    """Build a meaningful item name from a graph node's label."""
    if len(label) > max_length:
        return label[:max_length - 3] + "..."
    return label


def event_item_name(label, max_length=50):
    """Build a meaningful name for an event item (e.g. 'Event: Mining')."""
    if len(label) > max_length:
        label = label[:max_length - 3] + "..."
    return f"Event: {label}"


def generate_item_table(max_nodes: int = 100):
    """Generate a generic item table with numbered names (for class-level registration)."""
    item_table = {}

    for i in range(1, max_nodes + 1):
        item_table[f"Node {i}"] = ItemData(
            234800000 + (i - 1),
            ItemClassification.progression
        )

    return item_table


# Default item table
item_table = generate_item_table(100)

item_groups = {
    "Nodes": [f"Node {i}" for i in range(1, 101)],
}
