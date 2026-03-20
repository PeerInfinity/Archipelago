from typing import TYPE_CHECKING, final

from rule_builder import CanReachRegion, Has, OptionFilter

from .items import ItemName
from .locations import LocationName
from .options import IncludeBasto
from .regions import RegionName

if TYPE_CHECKING:
    from rule_builder import Rule

    from . import ToemWorld


@final
class EventName:
    TOEM_EXPERIENCED = "TOEM Experienced"
    BASTO_BONFIRE = "Basto Bonfire"


ENTRANCE_RULES: dict[tuple[str, str], "Rule[ToemWorld]"] = {
    (RegionName.HOMELANDA, RegionName.OAKLAVILLE): Has(ItemName.HOMELANDA_STAMP, count=1),
    (RegionName.OAKLAVILLE, RegionName.STANHAMN): Has(ItemName.OAKLAVILLE_STAMP, count=8),
    (RegionName.STANHAMN, RegionName.LOGCITY): Has(ItemName.STANHAMN_STAMP, count=8),
    (RegionName.LOGCITY, RegionName.KIIRUBERG): Has(ItemName.LOGCITY_STAMP, count=8),
    (RegionName.KIIRUBERG, RegionName.MOUNTAIN_TOP): Has(ItemName.KIIRUBERG_STAMP, count=8),
}

LOCATION_RULES: dict[str, "Rule[ToemWorld]"] = {
    LocationName.QUEST_EXPERIENCE_TOEM: CanReachRegion(RegionName.MOUNTAIN_TOP),
    LocationName.QUEST_MONSTERS: CanReachRegion(RegionName.KIIRUBERG),
    LocationName.QUEST_GHOST_HELPER: CanReachRegion(RegionName.LOGCITY),
    LocationName.QUEST_PAINTINGS: CanReachRegion(RegionName.MOUNTAIN_TOP),
}

VICTORY_RULE: "Rule[ToemWorld]" = Has(EventName.BASTO_BONFIRE, options=[OptionFilter(IncludeBasto, 1)]) | Has(
    EventName.TOEM_EXPERIENCED, options=[OptionFilter(IncludeBasto, 0)]
)


def set_entrance_rules(world: "ToemWorld") -> None:
    for (from_, to_), rule in ENTRANCE_RULES.items():
        world.set_rule(world.get_entrance(f"{from_} -> {to_}"), rule)


def set_location_rules(world: "ToemWorld") -> None:
    for location_name, rule in LOCATION_RULES.items():
        world.set_rule(world.get_location(location_name), rule)


def set_victory_rule(world: "ToemWorld") -> None:
    world.set_completion_rule(VICTORY_RULE)
