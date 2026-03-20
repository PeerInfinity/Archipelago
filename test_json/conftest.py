"""
Shared pytest fixtures for the test suite.

This module provides fixtures for testing the exporter and rule_builder modules,
including mock objects for CollectionState, World, and game handlers.
"""

import pytest
from typing import Dict, Any, Optional, Set, List


# =============================================================================
# Mock Collection State Fixtures
# =============================================================================

class MockCollectionState:
    """
    Minimal CollectionState for testing rule evaluation.

    Provides the same interface as Archipelago's CollectionState for testing
    rules without requiring the full Archipelago environment.
    """

    def __init__(self,
                 items: Optional[Dict[str, int]] = None,
                 reached_regions: Optional[Set[str]] = None,
                 reached_locations: Optional[Set[str]] = None,
                 player: int = 1):
        """
        Initialize a mock state.

        Args:
            items: Dict mapping item name to count (default: empty)
            reached_regions: Set of reachable region names (default: empty)
            reached_locations: Set of reachable location names (default: empty)
            player: Player number (default: 1)
        """
        self.prog_items = {player: items or {}}
        self.reached_regions = reached_regions or set()
        self.reached_locations = reached_locations or set()
        self.player = player
        self._multiworld = None

    def has(self, item: str, player: int = None, count: int = 1) -> bool:
        """Check if player has at least count of item."""
        player = player or self.player
        return self.prog_items.get(player, {}).get(item, 0) >= count

    def has_all(self, items, player: int = None) -> bool:
        """Check if player has all items."""
        player = player or self.player
        return all(self.has(item, player) for item in items)

    def has_any(self, items, player: int = None) -> bool:
        """Check if player has any of the items."""
        player = player or self.player
        return any(self.has(item, player) for item in items)

    def has_group(self, group: str, player: int = None, count: int = 1) -> bool:
        """Check if player has items from group (stub - always False)."""
        return False

    def count(self, item: str, player: int = None) -> int:
        """Get count of item for player."""
        player = player or self.player
        return self.prog_items.get(player, {}).get(item, 0)

    def count_group(self, group: str, player: int = None) -> int:
        """Get count of items in group (stub - always 0)."""
        return 0

    def count_group_unique(self, group: str, player: int = None) -> int:
        """Get count of unique items in group (stub - always 0)."""
        return 0

    def can_reach(self, spot: str, resolution_hint: str = None, player: int = None) -> bool:
        """Check if a spot (region or location) is reachable."""
        return spot in self.reached_regions or spot in self.reached_locations

    def can_reach_region(self, region: str, player: int = None) -> bool:
        """Check if a region is reachable."""
        return region in self.reached_regions

    def can_reach_location(self, location: str, player: int = None) -> bool:
        """Check if a location is reachable."""
        return location in self.reached_locations


class MockWorld:
    """
    Minimal World for testing.

    Provides basic World interface for testing without full Archipelago setup.
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

    def get_region(self, name: str):
        """Get a region by name (stub)."""
        return None

    def get_location(self, name: str):
        """Get a location by name (stub)."""
        return None


class MockOptions:
    """Mock options container that provides attribute access."""

    def __init__(self, values: Dict[str, Any]):
        for key, value in values.items():
            setattr(self, key, MockOption(value))

    def __iter__(self):
        return iter(self.__dict__.items())


class MockOption:
    """Mock option with value attribute."""

    def __init__(self, value):
        self.value = value

    def __eq__(self, other):
        if isinstance(other, MockOption):
            return self.value == other.value
        return self.value == other

    def __repr__(self):
        return f"MockOption({self.value!r})"


class MockGameHandler:
    """Mock game export handler for testing."""

    def __init__(self, game_name: str = "Test Game"):
        self.game_name = game_name
        self.helpers = {}
        self.collections = {}

    def get_helper(self, name: str):
        """Get a helper function by name."""
        return self.helpers.get(name)

    def get_collection_length(self, name: str) -> Optional[int]:
        """Get the length of a named collection."""
        if name in self.collections:
            return len(self.collections[name])
        return None

    def get_collection_data(self, name: str) -> Optional[List]:
        """Get the data of a named collection."""
        return self.collections.get(name)


# =============================================================================
# Pytest Fixtures
# =============================================================================

@pytest.fixture
def empty_state():
    """Return a MockCollectionState with no items or regions."""
    return MockCollectionState()


@pytest.fixture
def state_with_sword():
    """Return a state with a Sword item."""
    return MockCollectionState(items={"Sword": 1})


@pytest.fixture
def state_with_multiple_items():
    """Return a state with multiple items."""
    return MockCollectionState(items={
        "Sword": 1,
        "Shield": 1,
        "Bow": 1,
        "Arrow": 10,
        "Key": 5,
        "Heart": 3,
    })


@pytest.fixture
def state_with_regions():
    """Return a state with reachable regions."""
    return MockCollectionState(
        items={"Sword": 1},
        reached_regions={"Overworld", "Castle", "Dungeon 1"}
    )


@pytest.fixture
def empty_world():
    """Return a MockWorld with no options."""
    return MockWorld()


@pytest.fixture
def world_with_options():
    """Return a world with various options set."""
    return MockWorld(options={
        "difficulty": 2,
        "goal": 1,
        "death_link": True,
        "starting_items": ["Sword"],
    })


@pytest.fixture
def mock_game_handler():
    """Return a MockGameHandler."""
    return MockGameHandler()


@pytest.fixture
def game_handler_with_collections():
    """Return a game handler with collection data."""
    handler = MockGameHandler()
    handler.collections = {
        "randomizer_room_chests": [1, 2, 3, 4],
        "compass_room_chests": [1, 2, 3, 4, 5],
        "back_chests": [1, 2, 3, 4, 5],
    }
    return handler


# =============================================================================
# Rule Test Data Fixtures
# =============================================================================

@pytest.fixture
def simple_lambda():
    """Return a simple lambda for testing."""
    return lambda state: state.has("Sword")


@pytest.fixture
def lambda_with_count():
    """Return a lambda with count check."""
    return lambda state: state.has("Key", count=3)


@pytest.fixture
def lambda_with_and():
    """Return a lambda with and operation."""
    return lambda state: state.has("Sword") and state.has("Shield")


@pytest.fixture
def lambda_with_or():
    """Return a lambda with or operation."""
    return lambda state: state.has("Sword") or state.has("Axe")


@pytest.fixture
def lambda_with_not():
    """Return a lambda with not operation."""
    return lambda state: not state.has("Curse")


@pytest.fixture
def complex_lambda():
    """Return a complex nested lambda."""
    return lambda state: (state.has("Sword") and state.has("Shield")) or state.has("Master Sword")


# =============================================================================
# Helper Functions for Tests
# =============================================================================

def make_state(items: Dict[str, int] = None,
               regions: Set[str] = None,
               locations: Set[str] = None) -> MockCollectionState:
    """Convenience function to create a MockCollectionState."""
    return MockCollectionState(
        items=items,
        reached_regions=regions,
        reached_locations=locations
    )


def make_world(options: Dict[str, Any] = None,
               item_groups: Dict[str, List[str]] = None) -> MockWorld:
    """Convenience function to create a MockWorld."""
    return MockWorld(options=options, item_groups=item_groups)
