"""
Mock world and state objects for testing.

These mocks provide lightweight alternatives to real Archipelago objects
for unit testing the exporter and rule_builder modules.
"""

from typing import Dict, Any, Optional, Set, List, Callable


class MockCollectionState:
    """
    Minimal CollectionState for testing rule evaluation.

    This provides the same interface that Archipelago's CollectionState uses,
    allowing rules to be tested without the full Archipelago environment.
    """

    def __init__(self,
                 items: Optional[Dict[str, int]] = None,
                 reached_regions: Optional[Set[str]] = None,
                 reached_locations: Optional[Set[str]] = None,
                 player: int = 1,
                 item_groups: Optional[Dict[str, List[str]]] = None):
        """
        Initialize a mock collection state.

        Args:
            items: Dict mapping item name to count
            reached_regions: Set of reachable region names
            reached_locations: Set of reachable location names
            player: Player number
            item_groups: Dict mapping group name to list of item names
        """
        self.prog_items = {player: items or {}}
        self.reached_regions = reached_regions or set()
        self.reached_locations = reached_locations or set()
        self.player = player
        self._item_groups = item_groups or {}
        self._multiworld = None

    def has(self, item: str, player: int = None, count: int = 1) -> bool:
        """Check if player has at least count of item."""
        player = player or self.player
        return self.prog_items.get(player, {}).get(item, 0) >= count

    def has_all(self, items, player: int = None) -> bool:
        """Check if player has all items in the list."""
        player = player or self.player
        return all(self.has(item, player) for item in items)

    def has_any(self, items, player: int = None) -> bool:
        """Check if player has any of the items in the list."""
        player = player or self.player
        return any(self.has(item, player) for item in items)

    def has_group(self, group: str, player: int = None, count: int = 1) -> bool:
        """Check if player has at least count items from the group."""
        player = player or self.player
        if group not in self._item_groups:
            return False
        group_count = sum(
            self.prog_items.get(player, {}).get(item, 0)
            for item in self._item_groups[group]
        )
        return group_count >= count

    def has_group_unique(self, group: str, player: int = None, count: int = 1) -> bool:
        """Check if player has at least count unique items from the group."""
        player = player or self.player
        if group not in self._item_groups:
            return False
        unique_count = sum(
            1 for item in self._item_groups[group]
            if self.prog_items.get(player, {}).get(item, 0) > 0
        )
        return unique_count >= count

    def count(self, item: str, player: int = None) -> int:
        """Get count of item for player."""
        player = player or self.player
        return self.prog_items.get(player, {}).get(item, 0)

    def count_group(self, group: str, player: int = None) -> int:
        """Get total count of items in the group."""
        player = player or self.player
        if group not in self._item_groups:
            return 0
        return sum(
            self.prog_items.get(player, {}).get(item, 0)
            for item in self._item_groups[group]
        )

    def count_group_unique(self, group: str, player: int = None) -> int:
        """Get count of unique items in the group."""
        player = player or self.player
        if group not in self._item_groups:
            return 0
        return sum(
            1 for item in self._item_groups[group]
            if self.prog_items.get(player, {}).get(item, 0) > 0
        )

    def can_reach(self, spot: str, resolution_hint: str = None, player: int = None) -> bool:
        """Check if a spot (region or location) is reachable."""
        if resolution_hint == "Location":
            return spot in self.reached_locations
        return spot in self.reached_regions or spot in self.reached_locations

    def can_reach_region(self, region: str, player: int = None) -> bool:
        """Check if a region is reachable."""
        return region in self.reached_regions

    def can_reach_location(self, location: str, player: int = None) -> bool:
        """Check if a location is reachable."""
        return location in self.reached_locations

    def copy(self) -> "MockCollectionState":
        """Create a copy of this state."""
        new_state = MockCollectionState(
            items=dict(self.prog_items.get(self.player, {})),
            reached_regions=set(self.reached_regions),
            reached_locations=set(self.reached_locations),
            player=self.player,
            item_groups=dict(self._item_groups)
        )
        return new_state

    def collect(self, item_name: str, count: int = 1, player: int = None):
        """Add item to the state."""
        player = player or self.player
        if player not in self.prog_items:
            self.prog_items[player] = {}
        self.prog_items[player][item_name] = self.prog_items[player].get(item_name, 0) + count

    def remove(self, item_name: str, count: int = 1, player: int = None):
        """Remove item from the state."""
        player = player or self.player
        if player in self.prog_items and item_name in self.prog_items[player]:
            self.prog_items[player][item_name] = max(0, self.prog_items[player][item_name] - count)


class MockWorld:
    """
    Minimal World for testing.

    Provides basic World interface for testing without requiring
    the full Archipelago environment.
    """

    def __init__(self,
                 options: Optional[Dict[str, Any]] = None,
                 item_groups: Optional[Dict[str, List[str]]] = None,
                 player: int = 1,
                 game: str = "Test Game"):
        """
        Initialize a mock world.

        Args:
            options: Dict of option name to value
            item_groups: Dict of group name to list of item names
            player: Player number
            game: Game name
        """
        self.options = MockOptions(options or {})
        self.item_name_groups = item_groups or {}
        self.player = player
        self.game = game
        self.multiworld = None
        self._regions = {}
        self._locations = {}
        self._entrances = {}

    def get_region(self, name: str):
        """Get a region by name."""
        return self._regions.get(name)

    def get_location(self, name: str):
        """Get a location by name."""
        return self._locations.get(name)

    def get_entrance(self, name: str):
        """Get an entrance by name."""
        return self._entrances.get(name)


class MockOptions:
    """
    Mock options container that provides attribute access.

    Mimics the behavior of Archipelago's options system.
    """

    def __init__(self, values: Dict[str, Any]):
        """Initialize with a dict of option values."""
        self._values = values
        for key, value in values.items():
            if isinstance(value, MockOption):
                setattr(self, key, value)
            else:
                setattr(self, key, MockOption(value))

    def __iter__(self):
        """Iterate over option names."""
        return iter(self._values.keys())

    def __getattr__(self, name: str):
        """Return a default MockOption for unknown attributes."""
        if name.startswith('_'):
            raise AttributeError(name)
        return MockOption(None)


class MockOption:
    """
    Mock option with value attribute.

    Mimics the behavior of Archipelago Option classes.
    """

    def __init__(self, value):
        """Initialize with a value."""
        self.value = value

    def __eq__(self, other):
        """Compare by value."""
        if isinstance(other, MockOption):
            return self.value == other.value
        return self.value == other

    def __ne__(self, other):
        """Compare by value."""
        return not self.__eq__(other)

    def __lt__(self, other):
        """Compare by value."""
        if isinstance(other, MockOption):
            return self.value < other.value
        return self.value < other

    def __le__(self, other):
        """Compare by value."""
        if isinstance(other, MockOption):
            return self.value <= other.value
        return self.value <= other

    def __gt__(self, other):
        """Compare by value."""
        if isinstance(other, MockOption):
            return self.value > other.value
        return self.value > other

    def __ge__(self, other):
        """Compare by value."""
        if isinstance(other, MockOption):
            return self.value >= other.value
        return self.value >= other

    def __hash__(self):
        """Hash by value for use in dicts/sets."""
        return hash(self.value)

    def __repr__(self):
        """String representation."""
        return f"MockOption({self.value!r})"

    def __str__(self):
        """String conversion."""
        return str(self.value)

    def __int__(self):
        """Integer conversion."""
        return int(self.value) if self.value is not None else 0

    def __bool__(self):
        """Boolean conversion."""
        return bool(self.value)


class MockGameHandler:
    """
    Mock game export handler for testing.

    Provides the interface expected by the analyzer without
    requiring actual game-specific logic.
    """

    def __init__(self, game_name: str = "Test Game"):
        """Initialize with a game name."""
        self.game_name = game_name
        self.helpers: Dict[str, Callable] = {}
        self.collections: Dict[str, List] = {}
        self.world = None

    def get_helper(self, name: str) -> Optional[Callable]:
        """Get a helper function by name."""
        return self.helpers.get(name)

    def register_helper(self, name: str, func: Callable):
        """Register a helper function."""
        self.helpers[name] = func

    def get_collection_length(self, name: str) -> Optional[int]:
        """Get the length of a named collection."""
        if name in self.collections:
            return len(self.collections[name])
        return None

    def get_collection_data(self, name: str) -> Optional[List]:
        """Get the data of a named collection."""
        return self.collections.get(name)

    def add_collection(self, name: str, data: List):
        """Add a collection."""
        self.collections[name] = data

    def expand_rule(self, rule_dict: Dict) -> Dict:
        """Expand a rule (identity function for mock)."""
        return rule_dict

    def should_export_helper(self, name: str) -> bool:
        """Check if a helper should be exported."""
        return name in self.helpers


# Helper factory functions

def create_state(items: Dict[str, int] = None,
                 regions: Set[str] = None,
                 locations: Set[str] = None,
                 item_groups: Dict[str, List[str]] = None) -> MockCollectionState:
    """
    Convenience function to create a MockCollectionState.

    Args:
        items: Dict of item name to count
        regions: Set of reachable region names
        locations: Set of reachable location names
        item_groups: Dict of group name to item list

    Returns:
        A configured MockCollectionState
    """
    return MockCollectionState(
        items=items,
        reached_regions=regions,
        reached_locations=locations,
        item_groups=item_groups
    )


def create_world(options: Dict[str, Any] = None,
                 item_groups: Dict[str, List[str]] = None,
                 game: str = "Test Game") -> MockWorld:
    """
    Convenience function to create a MockWorld.

    Args:
        options: Dict of option values
        item_groups: Dict of group name to item list
        game: Game name

    Returns:
        A configured MockWorld
    """
    return MockWorld(options=options, item_groups=item_groups, game=game)


def create_handler(game_name: str = "Test Game",
                   helpers: Dict[str, Callable] = None,
                   collections: Dict[str, List] = None) -> MockGameHandler:
    """
    Convenience function to create a MockGameHandler.

    Args:
        game_name: Name of the game
        helpers: Dict of helper name to function
        collections: Dict of collection name to data

    Returns:
        A configured MockGameHandler
    """
    handler = MockGameHandler(game_name)
    if helpers:
        for name, func in helpers.items():
            handler.register_helper(name, func)
    if collections:
        for name, data in collections.items():
            handler.add_collection(name, data)
    return handler
