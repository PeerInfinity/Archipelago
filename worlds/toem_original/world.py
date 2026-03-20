from typing import TYPE_CHECKING, Any, ClassVar

from typing_extensions import override

from BaseClasses import Item, ItemClassification, Region, Tutorial
from worlds.AutoWorld import WebWorld, World

from .constants import GAME_NAME, Area
from .items import ItemGroup, ToemItem, filler_items, item_name_groups, item_name_to_id, item_table
from .locations import (
    LocationGroup,
    ToemLocation,
    location_name_groups,
    location_name_to_id,
    location_table,
)
from .options import ToemOptions
from .regions import RegionName, toem_regions
from .rules import EventName, set_entrance_rules, set_location_rules, set_victory_rule

if TYPE_CHECKING:
    from Options import PerGameCommonOptions


class ToemWebWorld(WebWorld):
    theme: ClassVar[str] = "grassFlowers"
    game_info_languages = ['en']
    tutorials: list[Tutorial] = [  # noqa: RUF012
        Tutorial(
            tutorial_name="Setup Guide",
            description="A guide to setting up the TOEM randomizer.",
            language="English",
            file_name="setup_en.md",
            link="setup/en",
            authors=["DrTChops"],
        ),
    ]


class ToemWorld(World):
    game: ClassVar[str] = GAME_NAME
    web: ClassVar[WebWorld] = ToemWebWorld()
    options_dataclass: ClassVar[type["PerGameCommonOptions"]] = ToemOptions
    options: ToemOptions  # pyright: ignore[reportIncompatibleVariableOverride]
    item_name_groups: ClassVar[dict[str, set[str]]] = item_name_groups
    location_name_groups: ClassVar[dict[str, set[str]]] = location_name_groups
    item_name_to_id: ClassVar[dict[str, int]] = item_name_to_id
    location_name_to_id: ClassVar[dict[str, int]] = location_name_to_id
    origin_region_name: str = RegionName.HOMELANDA

    def create_location(self, name: str) -> ToemLocation | None:
        data = location_table[name]
        if not self.options.include_basto and data.area == Area.BASTO:
            return

        region = self.get_region(data.region)
        location = ToemLocation(self.player, name, location_name_to_id[name], region)
        region.locations.append(location)
        return location

    @override
    def create_regions(self) -> None:
        for region_name, region_data in toem_regions.items():
            if not self.options.include_basto and region_data.area == Area.BASTO:
                continue
            region = Region(region_name, self.player, self.multiworld)
            self.multiworld.regions.append(region)

        for region_name, region_data in toem_regions.items():
            try:
                region = self.get_region(region_name)
            except KeyError:
                continue
            for exit_region_name in region_data.exits:
                try:
                    exit_region = self.get_region(exit_region_name)
                except KeyError:
                    continue
                region.connect(exit_region)

        logic_groups: set[str] = {LocationGroup.QUEST, LocationGroup.COMPENDIUM}
        if self.options.include_items:
            logic_groups.add(LocationGroup.ITEM)
        if self.options.include_casettes:
            logic_groups.add(LocationGroup.CASETTE)
        if self.options.include_achievements:
            logic_groups.add(LocationGroup.ACHIEVEMENT)

        for group, location_names in location_name_groups.items():
            if group not in logic_groups:
                continue

            for location_name in location_names:
                self.create_location(location_name)

        if self.options.include_basto:
            self.create_event(EventName.BASTO_BONFIRE, RegionName.BASTO)
        else:
            self.create_event(EventName.TOEM_EXPERIENCED, RegionName.MOUNTAIN_TOP)

    def create_event(self, event_name: str, region_name: str) -> None:
        item = ToemItem(event_name, ItemClassification.progression_skip_balancing, None, self.player)
        region = self.get_region(region_name)
        location = ToemLocation(self.player, event_name, None, region)
        location.place_locked_item(item)
        region.locations.append(location)

    @override
    def create_item(self, name: str) -> ToemItem:
        data = item_table[name]
        return ToemItem(name, data.classification, self.item_name_to_id[name], self.player)

    @override
    def create_items(self) -> None:
        itempool: list[Item] = []

        logic_groups: set[str] = {ItemGroup.STAMP, ItemGroup.PHOTO}
        if self.options.include_items:
            logic_groups.add(ItemGroup.ITEM)
        if self.options.include_casettes:
            logic_groups.add(ItemGroup.CASETTE)

        for group, item_names in item_name_groups.items():
            if group not in logic_groups:
                continue

            for item_name in item_names:
                data = item_table[item_name]
                if not self.options.include_basto and data.area == Area.BASTO:
                    continue

                itempool.extend(self.create_item(item_name) for _ in range(data.quantity))

        total_locations = len(self.multiworld.get_unfilled_locations(self.player))
        while len(itempool) < total_locations:
            itempool.append(self.create_filler())

        self.multiworld.itempool += itempool

    @override
    def get_filler_item_name(self) -> str:
        return self.random.choice(filler_items)

    @override
    def set_rules(self) -> None:
        set_entrance_rules(self)
        set_location_rules(self)
        set_victory_rule(self)

    @override
    def fill_slot_data(self) -> dict[str, Any]:
        return {
            "version": "0.1.0",
            "options": self.options.as_dict(
                "include_basto",
                "include_items",
                "include_casettes",
                "include_achievements",
            ),
        }
