from collections.abc import Callable
from typing import TYPE_CHECKING, final

from BaseClasses import CollectionState
from worlds.generic.Rules import set_rule

from .items import ItemName
from .locations import LocationName
from .regions import RegionName

if TYPE_CHECKING:
    from . import ToemWorld


@final
class EventName:
    TOEM_EXPERIENCED = "TOEM Experienced"
    BASTO_BONFIRE = "Basto Bonfire"


CollectionRule = Callable[[CollectionState], bool]


def set_entrance_rules(world: "ToemWorld") -> None:
    entrance_rules: dict[tuple[str, str], CollectionRule] = {
        (RegionName.HOMELANDA, RegionName.OAKLAVILLE): lambda state: state.has(
            ItemName.HOMELANDA_STAMP, world.player, 1
        ),
        (RegionName.OAKLAVILLE, RegionName.STANHAMN): lambda state: state.has(
            ItemName.OAKLAVILLE_STAMP, world.player, 8
        ),
        (RegionName.STANHAMN, RegionName.LOGCITY): lambda state: state.has(ItemName.STANHAMN_STAMP, world.player, 8),
        (RegionName.LOGCITY, RegionName.KIIRUBERG): lambda state: state.has(ItemName.LOGCITY_STAMP, world.player, 8),
        (RegionName.KIIRUBERG, RegionName.MOUNTAIN_TOP): lambda state: state.has(
            ItemName.KIIRUBERG_STAMP, world.player, 8
        ),
    }

    for (from_, to_), rule in entrance_rules.items():
        set_rule(world.get_entrance(f"{from_} -> {to_}"), rule)


def set_location_rules(world: "ToemWorld") -> None:
    location_rules: dict[str, CollectionRule] = {
        LocationName.QUEST_EXPERIENCE_TOEM: lambda state: state.can_reach_region(RegionName.MOUNTAIN_TOP, world.player),
        LocationName.QUEST_MONSTERS: lambda state: state.can_reach_region(RegionName.KIIRUBERG, world.player),
        LocationName.QUEST_GHOST_HELPER: lambda state: state.can_reach_region(RegionName.LOGCITY, world.player),
        LocationName.QUEST_PAINTINGS: lambda state: state.can_reach_region(RegionName.MOUNTAIN_TOP, world.player),
    }

    for location_name, rule in location_rules.items():
        set_rule(world.get_location(location_name), rule)


def set_victory_rule(world: "ToemWorld") -> None:
    if world.options.include_basto:
        world.multiworld.completion_condition[world.player] = lambda state: state.has(
            EventName.BASTO_BONFIRE,
            world.player,
        )
    else:
        world.multiworld.completion_condition[world.player] = lambda state: state.has(
            EventName.TOEM_EXPERIENCED,
            world.player,
        )
