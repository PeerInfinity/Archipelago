"""
Pathfinding tools for complex path-dependent accessibility rules.

This module provides tools for games that need to check:
- Whether a region is reachable via specific entrance chains
- "What if" checks with hypothetical items
- Region properties (light/dark world, dungeon type, etc.)

Usage:
    from rule_builder.pathfinding import (
        PathExistsToRegion,
        HypotheticalItemCheck,
        RegionPropertyCheck,
        EntranceChainCheck,
    )

    # Check if any path exists to a region with a condition
    rule = PathExistsToRegion(
        target_region="Hyrule Castle Courtyard",
        path_condition=Has("Magic Mirror"),
        max_depth=10
    )

    # Check with hypothetical items
    rule = HypotheticalItemCheck(
        add_items=["Moon Pearl"],
        check=CanReachRegion("Dark World Castle")
    )

    # Check region properties
    rule = RegionPropertyCheck(
        region="current",  # or specific region name
        property="is_dark_world"
    )
"""

from __future__ import annotations

import dataclasses
from collections import deque
from typing import Any, Callable, Dict, List, Optional, Set, TYPE_CHECKING

from BaseClasses import CollectionState, Entrance, Region

if TYPE_CHECKING:
    from .rules import Rule, TWorld

# Import base classes - delayed to avoid circular imports
def _get_rule_base():
    from .rules import Rule
    return Rule


@dataclasses.dataclass()
class PathExistsToRegion:
    """
    Check if any path exists from the current reachable regions to a target region,
    where each entrance in the path satisfies a given condition.

    This is useful for path-dependent accessibility rules where you need to check
    if you can reach a region through specific types of entrances.

    Attributes:
        target_region: Name of the region to find a path to
        entrance_condition: A callable that takes (state, entrance) and returns
            True if the entrance can be used in the path
        max_depth: Maximum path length to search (prevents infinite loops)
    """

    target_region: str
    entrance_condition: Optional[Callable[[CollectionState, Entrance], bool]] = None
    max_depth: int = 10

    def evaluate(self, state: CollectionState, player: int) -> bool:
        """
        Check if a valid path exists to the target region.

        Uses BFS to search backwards from the target region through entrances,
        checking if each entrance satisfies the condition.
        """
        try:
            target = state.multiworld.get_region(self.target_region, player)
        except KeyError:
            # Region doesn't exist
            return False

        # BFS backwards from target
        visited: Set[Region] = {target}
        queue: deque = deque([(target, 0)])

        while queue:
            current, depth = queue.popleft()

            if depth >= self.max_depth:
                continue

            for entrance in current.entrances:
                parent = entrance.parent_region
                if parent is None or parent in visited:
                    continue

                # Check if this entrance satisfies our condition
                if self.entrance_condition is not None:
                    if not self.entrance_condition(state, entrance):
                        continue

                # Check if the entrance is accessible
                if entrance.access_rule is not None:
                    if not entrance.access_rule(state):
                        continue

                # Check if we've found a path from a reachable region
                if state.can_reach_region(parent.name, player):
                    return True

                visited.add(parent)
                queue.append((parent, depth + 1))

        return False

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "type": "path_exists",
            "target_region": self.target_region,
            "max_depth": self.max_depth,
            # Note: entrance_condition is not serializable directly
            # It needs to be converted to a rule representation
        }


@dataclasses.dataclass()
class HypotheticalState:
    """
    A state wrapper that pretends certain items exist for "what if" checks.

    This is used for ALttP's fake_pearl_state pattern, where we check if
    a location would be accessible if the player had Moon Pearl.

    Note: This creates a shallow wrapper, not a full state copy. The hypothetical
    items are only checked in has() calls, not in the underlying state.
    """

    real_state: CollectionState
    player: int
    hypothetical_items: Set[str]

    def has(self, item: str, player: int, count: int = 1) -> bool:
        """Check if player has item, including hypothetical items."""
        if player == self.player and item in self.hypothetical_items:
            return True
        return self.real_state.has(item, player, count)

    def has_all(self, items: List[str], player: int) -> bool:
        """Check if player has all items, including hypothetical items."""
        for item in items:
            if not self.has(item, player):
                return False
        return True

    def has_any(self, items: List[str], player: int) -> bool:
        """Check if player has any of the items, including hypothetical items."""
        for item in items:
            if self.has(item, player):
                return True
        return False

    def count(self, item: str, player: int) -> int:
        """Count items, adding 1 for hypothetical items."""
        real_count = self.real_state.count(item, player)
        if player == self.player and item in self.hypothetical_items:
            return real_count + 1
        return real_count

    def can_reach_region(self, region: str, player: int) -> bool:
        """
        Check if region is reachable with hypothetical items.

        Note: This is a simplified check that doesn't fully integrate with
        the sweep algorithm. For full hypothetical reachability, we would
        need to run a new sweep with the modified state.
        """
        # For now, delegate to real state
        # TODO: Implement proper hypothetical reachability
        return self.real_state.can_reach_region(region, player)


def create_hypothetical_state(
    state: CollectionState,
    player: int,
    add_items: List[str]
) -> HypotheticalState:
    """
    Create a hypothetical state with additional items.

    Args:
        state: The real collection state
        player: The player to add items for
        add_items: List of item names to pretend exist

    Returns:
        A HypotheticalState wrapper
    """
    return HypotheticalState(
        real_state=state,
        player=player,
        hypothetical_items=set(add_items)
    )


@dataclasses.dataclass()
class RegionProperty:
    """
    Defines a property that can be checked on a region.

    Common properties:
    - is_light_world: True if region is in the Light World (ALttP)
    - is_dark_world: True if region is in the Dark World (ALttP)
    - is_dungeon: True if region is a dungeon
    - region_type: The LTTPRegionType enum value

    The property values are typically set during region creation and stored
    as attributes on the Region object.
    """

    name: str
    getter: Callable[[Region], Any]

    def check(self, region: Region, expected: Any = True) -> bool:
        """Check if the region property matches the expected value."""
        try:
            actual = self.getter(region)
            return actual == expected
        except AttributeError:
            return False


# Standard region properties for ALttP
ALTTP_REGION_PROPERTIES = {
    "is_light_world": RegionProperty(
        name="is_light_world",
        getter=lambda r: getattr(r, 'is_light_world', False)
    ),
    "is_dark_world": RegionProperty(
        name="is_dark_world",
        getter=lambda r: getattr(r, 'is_dark_world', False)
    ),
    "is_dungeon": RegionProperty(
        name="is_dungeon",
        getter=lambda r: hasattr(r, 'dungeon') and r.dungeon is not None
    ),
}


def check_region_property(
    state: CollectionState,
    player: int,
    region_name: str,
    property_name: str,
    expected: Any = True,
    properties: Optional[Dict[str, RegionProperty]] = None
) -> bool:
    """
    Check if a region has a specific property value.

    Args:
        state: The collection state
        player: The player
        region_name: Name of the region to check, or "current" for contextual
        property_name: Name of the property to check
        expected: Expected value of the property
        properties: Dict of available properties (defaults to ALTTP_REGION_PROPERTIES)

    Returns:
        True if the property matches the expected value
    """
    if properties is None:
        properties = ALTTP_REGION_PROPERTIES

    if property_name not in properties:
        raise ValueError(f"Unknown region property: {property_name}")

    try:
        region = state.multiworld.get_region(region_name, player)
    except KeyError:
        return False

    return properties[property_name].check(region, expected)


@dataclasses.dataclass()
class EntranceChainCondition:
    """
    A condition that can be checked for each entrance in a path.

    This is used to define rules like "all entrances in the path must be
    from light world regions" or "at least one entrance must be outdoors".
    """

    # Simple item requirement for the entrance
    requires_item: Optional[str] = None

    # Region property requirement for parent region
    parent_region_property: Optional[str] = None
    parent_region_property_value: Any = True

    # Tag check (entrance metadata)
    entrance_tag: Optional[str] = None

    def check(
        self,
        state: CollectionState,
        entrance: Entrance,
        player: int,
        properties: Optional[Dict[str, RegionProperty]] = None
    ) -> bool:
        """Check if the entrance satisfies this condition."""
        if properties is None:
            properties = ALTTP_REGION_PROPERTIES

        # Check item requirement
        if self.requires_item is not None:
            if not state.has(self.requires_item, player):
                return False

        # Check parent region property
        if self.parent_region_property is not None:
            parent = entrance.parent_region
            if parent is None:
                return False
            prop = properties.get(self.parent_region_property)
            if prop is None:
                return False
            if not prop.check(parent, self.parent_region_property_value):
                return False

        # Check entrance tag
        if self.entrance_tag is not None:
            tags = getattr(entrance, 'tags', set())
            if self.entrance_tag not in tags:
                return False

        return True

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        result: Dict[str, Any] = {"type": "entrance_chain_condition"}
        if self.requires_item is not None:
            result["requires_item"] = self.requires_item
        if self.parent_region_property is not None:
            result["parent_region_property"] = self.parent_region_property
            result["parent_region_property_value"] = self.parent_region_property_value
        if self.entrance_tag is not None:
            result["entrance_tag"] = self.entrance_tag
        return result


def find_paths_to_region(
    state: CollectionState,
    player: int,
    target_region: str,
    path_condition: Optional[Callable[[CollectionState, Entrance], bool]] = None,
    max_depth: int = 10,
    find_all: bool = False
) -> List[List[Entrance]]:
    """
    Find paths from reachable regions to a target region.

    Uses BFS to search backwards from the target region through entrances.
    Returns a list of entrance chains (each chain is a list of entrances
    from the reachable source to the target).

    Args:
        state: The collection state
        player: The player
        target_region: Name of the target region
        path_condition: Optional condition that each entrance must satisfy
        max_depth: Maximum path length to search
        find_all: If True, find all paths; if False, return first path found

    Returns:
        List of paths, where each path is a list of entrances from source to target.
        Returns empty list if no path exists.
    """
    try:
        target = state.multiworld.get_region(target_region, player)
    except KeyError:
        return []

    valid_paths: List[List[Entrance]] = []

    # BFS backwards from target
    # Queue contains: (current_region, path_so_far)
    visited: Set[Region] = {target}
    queue: deque = deque([(target, [])])

    while queue:
        current, path = queue.popleft()

        if len(path) >= max_depth:
            continue

        for entrance in current.entrances:
            parent = entrance.parent_region
            if parent is None or parent in visited:
                continue

            # Check if this entrance satisfies our condition
            if path_condition is not None:
                if not path_condition(state, entrance):
                    continue

            # Check if the entrance is accessible
            if entrance.access_rule is not None:
                if not entrance.access_rule(state):
                    continue

            new_path = [entrance] + path

            # Check if we've found a path from a reachable region
            if state.can_reach_region(parent.name, player):
                valid_paths.append(new_path)
                if not find_all:
                    return valid_paths

            visited.add(parent)
            queue.append((parent, new_path))

    return valid_paths
