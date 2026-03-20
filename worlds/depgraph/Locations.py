import typing
from BaseClasses import Location


class LocData(typing.NamedTuple):
    id: int
    region: str


class DepGraphLocation(Location):
    game: str = "DepGraph"

    def __init__(self, player: int, name: str, address: typing.Optional[int],
                 dependencies: typing.List[int], parent):
        super().__init__(player, name, address, parent)
        self.dependencies = dependencies


def node_location_name(label, max_length=50):
    """Build a meaningful location name from a graph node's label."""
    if len(label) > max_length:
        return label[:max_length - 3] + "..."
    return label


def generate_location_table(max_nodes: int = 100):
    """Generate a generic location table with numbered names (for class-level registration)."""
    location_table = {}
    for i in range(1, max_nodes + 1):
        location_table[f"Complete Node {i}"] = LocData(234800000 + i, "Graph")
    return location_table


# Default location table
location_table = generate_location_table(100)
