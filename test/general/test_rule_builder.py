import unittest
from dataclasses import dataclass, fields
from typing import Any, ClassVar, cast

from typing_extensions import override

from BaseClasses import CollectionState, Item, ItemClassification, Location, MultiWorld, Region
from NetUtils import JSONMessagePart
from Options import Choice, FreeText, Option, OptionSet, PerGameCommonOptions, Toggle
from rule_builder.cached_world import CachedRuleBuilderWorld
from rule_builder.options import Operator, OptionFilter
from rule_builder.rules import (
    And,
    Arithmetic,
    ASTRule,
    CanReachEntrance,
    CanReachLocation,
    CanReachRegion,
    Compare,
    CountFromList,
    CountGroup,
    CountItem,
    EntranceAccessRuleCall,
    False_,
    Filtered,
    Has,
    HasAll,
    HasAllCounts,
    HasAny,
    HasAnyCount,
    HasFromList,
    HasFromListUnique,
    HasGroup,
    HasGroupUnique,
    MaxValue,
    MinValue,
    OptionValue,
    Or,
    Rule,
    True_,
    UniqueCount,
    WeightedSum,
)
from test.general import setup_solo_multiworld
from test.param import classvar_matrix
from worlds.AutoWorld import AutoWorldRegister, World


class CachedCollectionState(CollectionState):
    rule_builder_cache: dict[int, dict[int, bool]]  # pyright: ignore[reportUninitializedInstanceVariable]


class ToggleOption(Toggle):
    auto_display_name = True


class ChoiceOption(Choice):
    auto_display_name = True
    option_first = 0
    option_second = 1
    option_third = 2
    default = 0


class FreeTextOption(FreeText):
    auto_display_name = True


class SetOption(OptionSet):
    auto_display_name = True
    valid_keys: ClassVar[set[str]] = {"one", "two", "three"}  # pyright: ignore[reportIncompatibleVariableOverride]


@dataclass
class RuleBuilderOptions(PerGameCommonOptions):
    toggle_option: ToggleOption
    choice_option: ChoiceOption
    text_option: FreeTextOption
    set_option: SetOption


GAME_NAME = "Rule Builder Test Game"
LOC_COUNT = 20


class RuleBuilderItem(Item):
    game = GAME_NAME


class RuleBuilderLocation(Location):
    game = GAME_NAME


class RuleBuilderTestCase(unittest.TestCase):
    old_world_types: dict[str, type[World]]  # pyright: ignore[reportUninitializedInstanceVariable]
    world_cls: type[World]  # pyright: ignore[reportUninitializedInstanceVariable]

    @override
    def setUp(self) -> None:
        self.old_world_types = AutoWorldRegister.world_types.copy()
        self._create_world_class()

    @override
    def tearDown(self) -> None:
        AutoWorldRegister.world_types = self.old_world_types
        assert GAME_NAME not in AutoWorldRegister.world_types

    def _create_world_class(self) -> None:
        class RuleBuilderWorld(World):
            game = GAME_NAME
            item_name_to_id: ClassVar = {f"Item {i}": i for i in range(1, LOC_COUNT + 1)}
            location_name_to_id: ClassVar = {f"Location {i}": i for i in range(1, LOC_COUNT + 1)}
            item_name_groups: ClassVar = {
                "Group 1": {"Item 1", "Item 2", "Item 3"},
                "Group 2": {"Item 4", "Item 5"},
            }
            hidden = True
            options_dataclass = RuleBuilderOptions
            options: RuleBuilderOptions  # pyright: ignore[reportIncompatibleVariableOverride]
            origin_region_name = "Region 1"

            @override
            def create_item(self, name: str) -> RuleBuilderItem:
                classification = ItemClassification.filler if name == "Filler" else ItemClassification.progression
                return RuleBuilderItem(name, classification, self.item_name_to_id[name], self.player)

            @override
            def get_filler_item_name(self) -> str:
                return "Filler"

        self.world_cls = RuleBuilderWorld


class CachedRuleBuilderTestCase(RuleBuilderTestCase):
    @override
    def _create_world_class(self) -> None:
        class RuleBuilderWorld(CachedRuleBuilderWorld):
            game = GAME_NAME
            item_name_to_id: ClassVar = {f"Item {i}": i for i in range(1, LOC_COUNT + 1)}
            location_name_to_id: ClassVar = {f"Location {i}": i for i in range(1, LOC_COUNT + 1)}
            item_name_groups: ClassVar = {
                "Group 1": {"Item 1", "Item 2", "Item 3"},
                "Group 2": {"Item 4", "Item 5"},
            }
            hidden = True
            options_dataclass = RuleBuilderOptions
            options: RuleBuilderOptions  # pyright: ignore[reportIncompatibleVariableOverride]
            origin_region_name = "Region 1"

            @override
            def create_item(self, name: str) -> RuleBuilderItem:
                classification = ItemClassification.filler if name == "Filler" else ItemClassification.progression
                return RuleBuilderItem(name, classification, self.item_name_to_id[name], self.player)

            @override
            def get_filler_item_name(self) -> str:
                return "Filler"

        self.world_cls = RuleBuilderWorld


@classvar_matrix(
    rules=(
        (
            And(Has("A", 1), Has("A", 2)),
            Has.Resolved("A", 2, player=1),
        ),
        (
            And(Has("A"), HasAll("B", "C")),
            HasAll.Resolved(("A", "B", "C"), player=1),
        ),
        (
            Or(Has("A", 1), Has("A", 2)),
            Has.Resolved("A", 1, player=1),
        ),
        (
            Or(Has("A"), HasAny("B", "C")),
            HasAny.Resolved(("A", "B", "C"), player=1),
        ),
        (
            Or(HasAll("A"), HasAll("A", "A")),
            Has.Resolved("A", player=1),
        ),
        (
            Or(
                Has("A"),
                Or(
                    True_(options=[OptionFilter(ChoiceOption, 0)]),
                    HasAny("B", "C", options=[OptionFilter(ChoiceOption, 0, "gt")]),
                    options=[OptionFilter(ToggleOption, 1)],
                ),
                And(Has("D"), Has("E"), options=[OptionFilter(ToggleOption, 0)]),
                Has("F"),
            ),
            Or.Resolved(
                (
                    HasAll.Resolved(("D", "E"), player=1),
                    HasAny.Resolved(("A", "F"), player=1),
                ),
                player=1,
            ),
        ),
        (
            Or(
                Has("A"),
                Or(
                    True_(options=[OptionFilter(ChoiceOption, 0, "gt")]),
                    HasAny("B", "C", options=[OptionFilter(ChoiceOption, 0)]),
                    options=[OptionFilter(ToggleOption, 0)],
                ),
                And(Has("D"), Has("E"), options=[OptionFilter(ToggleOption, 1)]),
                Has("F"),
            ),
            HasAny.Resolved(("A", "B", "C", "F"), player=1),
        ),
        (
            And(Has("A"), True_()),
            Has.Resolved("A", player=1),
        ),
        (
            And(Has("A"), False_()),
            False_.Resolved(player=1),
        ),
        (
            Or(Has("A"), True_()),
            True_.Resolved(player=1),
        ),
        (
            Or(Has("A"), False_()),
            Has.Resolved("A", player=1),
        ),
        (
            And(Has("A"), HasAll("B", "C"), HasAllCounts({"D": 2, "E": 3})),
            HasAllCounts.Resolved((("A", 1), ("B", 1), ("C", 1), ("D", 2), ("E", 3)), player=1),
        ),
        (
            And(Has("A"), HasAll("B", "C"), HasAllCounts({"D": 1, "E": 1})),
            HasAll.Resolved(("A", "B", "C", "D", "E"), player=1),
        ),
        (
            Or(Has("A"), HasAny("B", "C"), HasAnyCount({"D": 2, "E": 3})),
            HasAnyCount.Resolved((("A", 1), ("B", 1), ("C", 1), ("D", 2), ("E", 3)), player=1),
        ),
        (
            Or(Has("A"), HasAny("B", "C"), HasAnyCount({"D": 1, "E": 1})),
            HasAny.Resolved(("A", "B", "C", "D", "E"), player=1),
        ),
        (
            And(HasAllCounts({"A": 1, "B": 2}), HasAllCounts({"A": 2, "B": 2})),
            HasAllCounts.Resolved((("A", 2), ("B", 2)), player=1),
        ),
        (
            Or(HasAnyCount({"A": 1, "B": 2}), HasAnyCount({"A": 2, "B": 2})),
            HasAnyCount.Resolved((("A", 1), ("B", 2)), player=1),
        ),
    )
)
class TestSimplify(RuleBuilderTestCase):
    rules: ClassVar[tuple[Rule[Any], Rule.Resolved]]

    def test_simplify(self) -> None:
        multiworld = setup_solo_multiworld(self.world_cls, steps=("generate_early",), seed=0)
        world = multiworld.worlds[1]
        rule, expected = self.rules
        resolved_rule = rule.resolve(world)
        self.assertEqual(resolved_rule, expected, f"\n{resolved_rule}\n{expected}")


@classvar_matrix(
    cases=(
        (ToggleOption, 0, "eq", 0, True),
        (ToggleOption, 0, "eq", 1, False),
        (ToggleOption, 0, "ne", 0, False),
        (ToggleOption, 0, "ne", 1, True),
        (ChoiceOption, 0, "gt", 1, False),
        (ChoiceOption, 1, "gt", 1, False),
        (ChoiceOption, 2, "gt", 1, True),
        (ChoiceOption, 0, "ge", "second", False),
        (ChoiceOption, 1, "ge", "second", True),
        (ChoiceOption, 1, "in", (0, 1), True),
        (ChoiceOption, 1, "in", ("first", "second"), True),
        (FreeTextOption, "no", "eq", "yes", False),
        (FreeTextOption, "yes", "eq", "yes", True),
        (SetOption, ("one", "two"), "contains", "three", False),
        (SetOption, ("one", "two"), "contains", "two", True),
    )
)
class TestOptions(RuleBuilderTestCase):
    cases: ClassVar[tuple[type[Option[Any]], Any, Operator, Any, bool]]

    def test_option_resolution(self) -> None:
        multiworld = setup_solo_multiworld(self.world_cls, steps=("generate_early",), seed=0)
        world = multiworld.worlds[1]
        option_cls, world_value, operator, filter_value, expected = self.cases

        for field in fields(world.options_dataclass):
            if field.type is option_cls:
                setattr(world.options, field.name, option_cls.from_any(world_value))
                break

        option_filter = OptionFilter(option_cls, filter_value, operator)
        result = option_filter.check(world.options)
        self.assertEqual(result, expected, f"Expected {result} for option={option_filter} with value={world_value}")


class TestFilteredResolution(RuleBuilderTestCase):
    def test_filtered_resolution(self) -> None:
        multiworld = setup_solo_multiworld(self.world_cls, steps=("generate_early",), seed=0)
        world = multiworld.worlds[1]

        rule_and_false = Has("A") & Has("B", options=[OptionFilter(ToggleOption, 1)], filtered_resolution=False)
        rule_and_true = Has("A") & Has("B", options=[OptionFilter(ToggleOption, 1)], filtered_resolution=True)
        rule_or_false = Has("A") | Has("B", options=[OptionFilter(ToggleOption, 1)], filtered_resolution=False)
        rule_or_true = Has("A") | Has("B", options=[OptionFilter(ToggleOption, 1)], filtered_resolution=True)

        # option fails check
        world.options.toggle_option.value = 0  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        self.assertEqual(rule_and_false.resolve(world), False_.Resolved(player=1))
        self.assertEqual(rule_and_true.resolve(world), Has.Resolved("A", player=1))
        self.assertEqual(rule_or_false.resolve(world), Has.Resolved("A", player=1))
        self.assertEqual(rule_or_true.resolve(world), True_.Resolved(player=1))

        # option passes check
        world.options.toggle_option.value = 1  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        self.assertEqual(rule_and_false.resolve(world), HasAll.Resolved(("A", "B"), player=1))
        self.assertEqual(rule_and_true.resolve(world), HasAll.Resolved(("A", "B"), player=1))
        self.assertEqual(rule_or_false.resolve(world), HasAny.Resolved(("A", "B"), player=1))
        self.assertEqual(rule_or_true.resolve(world), HasAny.Resolved(("A", "B"), player=1))


@classvar_matrix(
    rules=(
        (
            Has("A") & Has("B"),
            And(Has("A"), Has("B")),
        ),
        (
            Has("A") | Has("B"),
            Or(Has("A"), Has("B")),
        ),
        (
            And(Has("A")) & Has("B"),
            And(Has("A"), Has("B")),
        ),
        (
            And(Has("A"), Has("B")) & And(Has("C")),
            And(Has("A"), Has("B"), Has("C")),
        ),
        (
            And(Has("A"), Has("B")) | Or(Has("C"), Has("D")),
            Or(And(Has("A"), Has("B")), Has("C"), Has("D")),
        ),
        (
            Or(Has("A")) | Or(Has("B"), options=[OptionFilter(ToggleOption, 1)]),
            Or(Or(Has("A")), Or(Has("B"), options=[OptionFilter(ToggleOption, 1)])),
        ),
        (
            (
                And(Has("A"), options=[OptionFilter(ToggleOption, 1)])
                & And(Has("B"), options=[OptionFilter(ToggleOption, 1)])
            ),
            And(Has("A"), Has("B"), options=[OptionFilter(ToggleOption, 1)]),
        ),
        (
            Has("A") & Has("B") & Has("C"),
            And(Has("A"), Has("B"), Has("C")),
        ),
        (
            Has("A") & Has("B") | Has("C") & Has("D"),
            Or(And(Has("A"), Has("B")), And(Has("C"), Has("D"))),
        ),
        (
            Has("A") | Or(Has("B"), options=[OptionFilter(ToggleOption, 1)]),
            Or(Has("A"), Or(Has("B"), options=[OptionFilter(ToggleOption, 1)])),
        ),
        (
            Has("A") & And(Has("B"), options=[OptionFilter(ToggleOption, 1)]),
            And(Has("A"), And(Has("B"), options=[OptionFilter(ToggleOption, 1)])),
        ),
        (
            (Has("A") | Has("B")) & [OptionFilter(ToggleOption, 1)],
            Filtered(Or(Has("A"), Has("B")), options=[OptionFilter(ToggleOption, 1)]),
        ),
        (
            (Has("A") | Has("B")) | OptionFilter(ToggleOption, 1),
            Or(Or(Has("A"), Has("B")), True_(options=[OptionFilter(ToggleOption, 1)])),
        ),
        (
            OptionFilter(ToggleOption, 1) & (Has("A") | Has("B")),
            Filtered(Or(Has("A"), Has("B")), options=[OptionFilter(ToggleOption, 1)]),
        ),
        (
            [OptionFilter(ToggleOption, 1)] | (Has("A") | Has("B")),
            Or(Or(Has("A"), Has("B")), True_(options=[OptionFilter(ToggleOption, 1)])),
        ),
    )
)
class TestComposition(unittest.TestCase):
    rules: ClassVar[tuple[Rule[Any], Rule[Any]]]

    def test_composition(self) -> None:
        combined_rule, expected = self.rules
        self.assertEqual(combined_rule, expected, str(combined_rule))


class TestHashes(RuleBuilderTestCase):
    def test_and_hash(self) -> None:
        rule1 = And.Resolved((True_.Resolved(player=1),), player=1)
        rule2 = And.Resolved((True_.Resolved(player=1),), player=1)
        rule3 = Or.Resolved((True_.Resolved(player=1),), player=1)

        self.assertEqual(hash(rule1), hash(rule2))
        self.assertNotEqual(hash(rule1), hash(rule3))

    def test_has_all_hash(self) -> None:
        multiworld = setup_solo_multiworld(self.world_cls, steps=("generate_early",), seed=0)
        world = multiworld.worlds[1]
        rule1 = HasAll("1", "2")
        rule2 = HasAll("2", "2", "2", "1")
        self.assertEqual(hash(rule1.resolve(world)), hash(rule2.resolve(world)))


class TestCaching(CachedRuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CachedCollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()

        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        world = self.multiworld.worlds[1]
        self.world = world
        self.state = cast(CachedCollectionState, self.multiworld.state)

        region1 = Region("Region 1", self.player, self.multiworld)
        region2 = Region("Region 2", self.player, self.multiworld)
        region3 = Region("Region 3", self.player, self.multiworld)
        self.multiworld.regions.extend([region1, region2, region3])

        region1.add_locations({"Location 1": 1, "Location 2": 2, "Location 6": 6}, RuleBuilderLocation)
        region2.add_locations({"Location 3": 3, "Location 4": 4}, RuleBuilderLocation)
        region3.add_locations({"Location 5": 5}, RuleBuilderLocation)

        world.create_entrance(region1, region2, Has("Item 1"))
        world.create_entrance(region1, region3, HasAny("Item 3", "Item 4"))
        world.set_rule(world.get_location("Location 2"), CanReachRegion("Region 2") & Has("Item 2"))
        world.set_rule(world.get_location("Location 4"), HasAll("Item 2", "Item 3"))
        world.set_rule(world.get_location("Location 5"), CanReachLocation("Location 4"))
        world.set_rule(world.get_location("Location 6"), CanReachEntrance("Region 1 -> Region 2") & Has("Item 2"))

        for i in range(1, LOC_COUNT + 1):
            self.multiworld.itempool.append(world.create_item(f"Item {i}"))

        world.register_rule_builder_dependencies()

    def test_item_cache_busting(self) -> None:
        location = self.world.get_location("Location 4")
        self.state.collect(self.world.create_item("Item 1"))  # access to region 2
        self.state.collect(self.world.create_item("Item 2"))  # item directly needed
        self.assertFalse(location.can_reach(self.state))  # populates cache
        self.assertFalse(self.state.rule_builder_cache[1][id(location.access_rule)])

        self.state.collect(self.world.create_item("Item 3"))  # clears cache, item directly needed
        self.assertNotIn(id(location.access_rule), self.state.rule_builder_cache[1])
        self.assertTrue(location.can_reach(self.state))
        self.assertTrue(self.state.rule_builder_cache[1][id(location.access_rule)])
        self.state.collect(self.world.create_item("Item 3"))  # does not clear cache as rule is already true
        self.assertTrue(self.state.rule_builder_cache[1][id(location.access_rule)])

    def test_region_cache_busting(self) -> None:
        location = self.world.get_location("Location 2")
        self.state.collect(self.world.create_item("Item 2"))  # item directly needed for location rule
        self.assertFalse(location.can_reach(self.state))  # populates cache
        self.assertFalse(self.state.rule_builder_cache[1][id(location.access_rule)])

        self.state.collect(self.world.create_item("Item 1"))  # clears cache, item only needed for region 2 access
        # cache gets cleared during the can_reach
        self.assertTrue(location.can_reach(self.state))
        self.assertTrue(self.state.rule_builder_cache[1][id(location.access_rule)])

    def test_location_cache_busting(self) -> None:
        location = self.world.get_location("Location 5")
        self.state.collect(self.world.create_item("Item 1"))  # access to region 2
        self.state.collect(self.world.create_item("Item 3"))  # access to region 3
        self.assertFalse(location.can_reach(self.state))  # populates cache
        self.assertFalse(self.state.rule_builder_cache[1][id(location.access_rule)])

        self.state.collect(self.world.create_item("Item 2"))  # clears cache, item only needed for location 2 access
        self.assertNotIn(id(location.access_rule), self.state.rule_builder_cache[1])
        self.assertTrue(location.can_reach(self.state))

    def test_entrance_cache_busting(self) -> None:
        location = self.world.get_location("Location 6")
        self.state.collect(self.world.create_item("Item 2"))  # item directly needed for location rule
        self.assertFalse(location.can_reach(self.state))  # populates cache
        self.assertFalse(self.state.rule_builder_cache[1][id(location.access_rule)])

        self.state.collect(self.world.create_item("Item 1"))  # clears cache, item only needed for entrance access
        self.assertNotIn(id(location.access_rule), self.state.rule_builder_cache[1])
        self.assertTrue(location.can_reach(self.state))

    def test_has_skips_cache(self) -> None:
        entrance = self.world.get_entrance("Region 1 -> Region 2")
        self.assertFalse(entrance.can_reach(self.state))  # does not populates cache
        self.assertNotIn(id(entrance.access_rule), self.state.rule_builder_cache[1])

        self.state.collect(self.world.create_item("Item 1"))  # no need to clear cache, item directly needed
        self.assertNotIn(id(entrance.access_rule), self.state.rule_builder_cache[1])
        self.assertTrue(entrance.can_reach(self.state))


class TestCacheDisabled(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CachedCollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()

        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        world = self.multiworld.worlds[1]
        self.world = world
        self.state = cast(CachedCollectionState, self.multiworld.state)

        region1 = Region("Region 1", self.player, self.multiworld)
        region2 = Region("Region 2", self.player, self.multiworld)
        region3 = Region("Region 3", self.player, self.multiworld)
        self.multiworld.regions.extend([region1, region2, region3])

        region1.add_locations({"Location 1": 1, "Location 2": 2, "Location 6": 6}, RuleBuilderLocation)
        region2.add_locations({"Location 3": 3, "Location 4": 4}, RuleBuilderLocation)
        region3.add_locations({"Location 5": 5}, RuleBuilderLocation)

        world.create_entrance(region1, region2, Has("Item 1"))
        world.create_entrance(region1, region3, HasAny("Item 3", "Item 4"))
        world.set_rule(world.get_location("Location 2"), CanReachRegion("Region 2") & Has("Item 2"))
        world.set_rule(world.get_location("Location 4"), HasAll("Item 2", "Item 3"))
        world.set_rule(world.get_location("Location 5"), CanReachLocation("Location 4"))
        world.set_rule(world.get_location("Location 6"), CanReachEntrance("Region 1 -> Region 2") & Has("Item 2"))

        for i in range(1, LOC_COUNT + 1):
            self.multiworld.itempool.append(world.create_item(f"Item {i}"))

    def test_item_logic(self) -> None:
        entrance = self.world.get_entrance("Region 1 -> Region 2")
        self.assertFalse(entrance.can_reach(self.state))
        self.assertFalse(self.state.rule_builder_cache[1])

        self.state.collect(self.world.create_item("Item 1"))  # item directly needed
        self.assertFalse(self.state.rule_builder_cache[1])
        self.assertTrue(entrance.can_reach(self.state))

    def test_region_logic(self) -> None:
        location = self.world.get_location("Location 2")
        self.state.collect(self.world.create_item("Item 2"))  # item directly needed for location rule
        self.assertFalse(location.can_reach(self.state))
        self.assertFalse(self.state.rule_builder_cache[1])

        self.state.collect(self.world.create_item("Item 1"))  # item only needed for region 2 access
        self.assertTrue(location.can_reach(self.state))
        self.assertFalse(self.state.rule_builder_cache[1])

    def test_location_logic(self) -> None:
        location = self.world.get_location("Location 5")
        self.state.collect(self.world.create_item("Item 1"))  # access to region 2
        self.state.collect(self.world.create_item("Item 3"))  # access to region 3
        self.assertFalse(location.can_reach(self.state))
        self.assertFalse(self.state.rule_builder_cache[1])

        self.state.collect(self.world.create_item("Item 2"))  # item only needed for location 2 access
        self.assertFalse(self.state.rule_builder_cache[1])
        self.assertTrue(location.can_reach(self.state))

    def test_entrance_logic(self) -> None:
        location = self.world.get_location("Location 6")
        self.state.collect(self.world.create_item("Item 2"))  # item directly needed for location rule
        self.assertFalse(location.can_reach(self.state))
        self.assertFalse(self.state.rule_builder_cache[1])

        self.state.collect(self.world.create_item("Item 1"))  # item only needed for entrance access
        self.assertFalse(self.state.rule_builder_cache[1])
        self.assertTrue(location.can_reach(self.state))


class TestRules(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()

        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        world = self.multiworld.worlds[1]
        self.world = world
        self.state = self.multiworld.state

    def test_true(self) -> None:
        rule = True_()
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertTrue(resolved_rule(self.state))

    def test_false(self) -> None:
        rule = False_()
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))

    def test_has(self) -> None:
        rule = Has("Item 1")
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))
        item = self.world.create_item("Item 1")
        self.state.collect(item)
        self.assertTrue(resolved_rule(self.state))
        self.state.remove(item)
        self.assertFalse(resolved_rule(self.state))

    def test_has_all(self) -> None:
        rule = HasAll("Item 1", "Item 2")
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))
        item1 = self.world.create_item("Item 1")
        self.state.collect(item1)
        self.assertFalse(resolved_rule(self.state))
        item2 = self.world.create_item("Item 2")
        self.state.collect(item2)
        self.assertTrue(resolved_rule(self.state))
        self.state.remove(item1)
        self.assertFalse(resolved_rule(self.state))

    def test_has_any(self) -> None:
        item_names = ("Item 1", "Item 2")
        rule = HasAny(*item_names)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))

        for item_name in item_names:
            item = self.world.create_item(item_name)
            self.state.collect(item)
            self.assertTrue(resolved_rule(self.state))
            self.state.remove(item)
            self.assertFalse(resolved_rule(self.state))

    def test_has_all_counts(self) -> None:
        rule = HasAllCounts({"Item 1": 1, "Item 2": 2})
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))
        item1 = self.world.create_item("Item 1")
        self.state.collect(item1)
        self.assertFalse(resolved_rule(self.state))
        item2 = self.world.create_item("Item 2")
        self.state.collect(item2)
        self.assertFalse(resolved_rule(self.state))
        item2 = self.world.create_item("Item 2")
        self.state.collect(item2)
        self.assertTrue(resolved_rule(self.state))
        self.state.remove(item2)
        self.assertFalse(resolved_rule(self.state))

    def test_has_any_count(self) -> None:
        item_counts = {"Item 1": 1, "Item 2": 2}
        rule = HasAnyCount(item_counts)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)

        for item_name, count in item_counts.items():
            item = self.world.create_item(item_name)
            for _ in range(count):
                self.assertFalse(resolved_rule(self.state))
                self.state.collect(item)
            self.assertTrue(resolved_rule(self.state))
            self.state.remove(item)
            self.assertFalse(resolved_rule(self.state))

    def test_has_from_list(self) -> None:
        item_names = ("Item 1", "Item 2", "Item 3")
        rule = HasFromList(*item_names, count=2)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))

        items: list[Item] = []
        for i, item_name in enumerate(item_names):
            item = self.world.create_item(item_name)
            self.state.collect(item)
            items.append(item)
            if i == 0:
                self.assertFalse(resolved_rule(self.state))
            else:
                self.assertTrue(resolved_rule(self.state))

        for i in range(2):
            self.state.remove(items[i])
        self.assertFalse(resolved_rule(self.state))

    def test_has_from_list_unique(self) -> None:
        item_names = ("Item 1", "Item 1", "Item 2")
        rule = HasFromListUnique(*item_names, count=2)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)
        self.assertFalse(resolved_rule(self.state))

        items: list[Item] = []
        for i, item_name in enumerate(item_names):
            item = self.world.create_item(item_name)
            self.state.collect(item)
            items.append(item)
            if i < 2:
                self.assertFalse(resolved_rule(self.state))
            else:
                self.assertTrue(resolved_rule(self.state))

        self.state.remove(items[0])
        self.assertTrue(resolved_rule(self.state))
        self.state.remove(items[1])
        self.assertFalse(resolved_rule(self.state))

    def test_has_group(self) -> None:
        rule = HasGroup("Group 1", count=2)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)

        items: list[Item] = []
        for item_name in ("Item 1", "Item 2"):
            self.assertFalse(resolved_rule(self.state))
            item = self.world.create_item(item_name)
            self.state.collect(item)
            items.append(item)

        self.assertTrue(resolved_rule(self.state))
        self.state.remove(items[0])
        self.assertFalse(resolved_rule(self.state))

    def test_has_group_unique(self) -> None:
        rule = HasGroupUnique("Group 1", count=2)
        resolved_rule = rule.resolve(self.world)
        self.world.register_rule_dependencies(resolved_rule)

        items: list[Item] = []
        for item_name in ("Item 1", "Item 1", "Item 2"):
            self.assertFalse(resolved_rule(self.state))
            item = self.world.create_item(item_name)
            self.state.collect(item)
            items.append(item)

        self.assertTrue(resolved_rule(self.state))
        self.state.remove(items[0])
        self.assertTrue(resolved_rule(self.state))
        self.state.remove(items[1])
        self.assertFalse(resolved_rule(self.state))

    def test_completion_rule(self) -> None:
        rule = Has("Item 1")
        self.world.set_completion_rule(rule)
        self.assertEqual(self.multiworld.can_beat_game(self.state), False)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(self.multiworld.can_beat_game(self.state), True)


class TestSerialization(RuleBuilderTestCase):
    maxDiff: int | None = None

    rule: ClassVar[Rule[Any]] = And(
        Or(
            Has("i1", count=4),
            HasFromList("i2", "i3", "i4", count=2),
            HasAnyCount({"i5": 2, "i6": 3}),
            options=[OptionFilter(ToggleOption, 0)],
        ),
        Or(
            HasAll("i7", "i8"),
            HasAllCounts(
                {"i9": 1, "i10": 5},
                options=[OptionFilter(ToggleOption, 1, operator="ne")],
                filtered_resolution=True,
            ),
            CanReachRegion("r1"),
            HasGroup("g1"),
        ),
        And(
            HasAny("i11", "i12"),
            CanReachLocation("l1", "r2"),
            HasFromListUnique("i13", "i14"),
            options=[
                OptionFilter(ToggleOption, ToggleOption.option_false),
                OptionFilter(ChoiceOption, ChoiceOption.option_second, "ge"),
            ],
        ),
        CanReachEntrance("e1"),
        HasGroupUnique("g2", count=5),
    )

    rule_dict: ClassVar[dict[str, Any]] = {
        "rule": "And",
        "options": [],
        "filtered_resolution": False,
        "children": [
            {
                "rule": "Or",
                "options": [
                    {
                        "option": "test.general.test_rule_builder.ToggleOption",
                        "value": 0,
                        "operator": "eq",
                    },
                ],
                "filtered_resolution": False,
                "children": [
                    {
                        "rule": "Has",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_name": "i1", "count": 4},
                    },
                    {
                        "rule": "HasFromList",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_names": ("i2", "i3", "i4"), "count": 2},
                    },
                    {
                        "rule": "HasAnyCount",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_counts": {"i5": 2, "i6": 3}},
                    },
                ],
            },
            {
                "rule": "Or",
                "options": [],
                "filtered_resolution": False,
                "children": [
                    {
                        "rule": "HasAll",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_names": ("i7", "i8")},
                    },
                    {
                        "rule": "HasAllCounts",
                        "options": [
                            {
                                "option": "test.general.test_rule_builder.ToggleOption",
                                "value": 1,
                                "operator": "ne",
                            },
                        ],
                        "filtered_resolution": True,
                        "args": {"item_counts": {"i9": 1, "i10": 5}},
                    },
                    {
                        "rule": "CanReachRegion",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"region_name": "r1"},
                    },
                    {
                        "rule": "HasGroup",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_name_group": "g1", "count": 1},
                    },
                ],
            },
            {
                "rule": "And",
                "options": [
                    {
                        "option": "test.general.test_rule_builder.ToggleOption",
                        "value": 0,
                        "operator": "eq",
                    },
                    {
                        "option": "test.general.test_rule_builder.ChoiceOption",
                        "value": 1,
                        "operator": "ge",
                    },
                ],
                "filtered_resolution": False,
                "children": [
                    {
                        "rule": "HasAny",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_names": ("i11", "i12")},
                    },
                    {
                        "rule": "CanReachLocation",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"location_name": "l1", "parent_region_name": "r2", "skip_indirect_connection": False},
                    },
                    {
                        "rule": "HasFromListUnique",
                        "options": [],
                        "filtered_resolution": False,
                        "args": {"item_names": ("i13", "i14"), "count": 1},
                    },
                ],
            },
            {
                "rule": "CanReachEntrance",
                "options": [],
                "filtered_resolution": False,
                "args": {"entrance_name": "e1", "parent_region_name": ""},
            },
            {
                "rule": "HasGroupUnique",
                "options": [],
                "filtered_resolution": False,
                "args": {"item_name_group": "g2", "count": 5},
            },
        ],
    }

    def test_serialize(self) -> None:
        serialized_rule = self.rule.to_dict()
        self.assertDictEqual(serialized_rule, self.rule_dict)

    def test_deserialize(self) -> None:
        multiworld = setup_solo_multiworld(self.world_cls, steps=(), seed=0)
        world = multiworld.worlds[1]
        deserialized_rule = world.rule_from_dict(self.rule_dict)
        self.assertEqual(deserialized_rule, self.rule, str(deserialized_rule))


class TestExplain(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    resolved_rule: ClassVar[Rule.Resolved] = And.Resolved(
        (
            Or.Resolved(
                (
                    Has.Resolved("Item 1", count=4, player=1),
                    HasAll.Resolved(("Item 2", "Item 3"), player=1),
                    HasAny.Resolved(("Item 4", "Item 5"), player=1),
                ),
                player=1,
            ),
            HasAllCounts.Resolved((("Item 6", 1), ("Item 7", 5)), player=1),
            HasAnyCount.Resolved((("Item 8", 2), ("Item 9", 3)), player=1),
            HasFromList.Resolved(("Item 10", "Item 11", "Item 12"), count=2, player=1),
            HasFromListUnique.Resolved(("Item 13", "Item 14"), player=1),
            HasGroup.Resolved("Group 1", ("Item 15", "Item 16", "Item 17"), player=1),
            HasGroupUnique.Resolved("Group 2", ("Item 18", "Item 19"), count=2, player=1),
            CanReachRegion.Resolved("Region 2", player=1),
            CanReachLocation.Resolved("Location 2", "Region 2", player=1),
            CanReachEntrance.Resolved("Entrance 2", "Region 2", player=1),
            True_.Resolved(player=1),
            False_.Resolved(player=1),
        ),
        player=1,
    )

    @override
    def setUp(self) -> None:
        super().setUp()

        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        world = self.multiworld.worlds[1]
        self.world = world
        self.state = self.multiworld.state

        region1 = Region("Region 1", self.player, self.multiworld)
        region2 = Region("Region 2", self.player, self.multiworld)
        region3 = Region("Region 3", self.player, self.multiworld)
        self.multiworld.regions.extend([region1, region2, region3])

        region2.add_locations({"Location 2": 1}, RuleBuilderLocation)
        world.create_entrance(region1, region2, Has("Item 1"))
        world.create_entrance(region2, region3, name="Entrance 2")

    def _collect_all(self) -> None:
        for i in range(1, LOC_COUNT + 1):
            for _ in range(10):
                item = self.world.create_item(f"Item {i}")
                self.state.collect(item)

    def test_explain_json_with_state_no_items(self) -> None:
        expected: list[JSONMessagePart] = [
            {"type": "text", "text": "("},
            {"type": "text", "text": "("},
            {"type": "text", "text": "Missing "},
            {"type": "color", "color": "cyan", "text": "4"},
            {"type": "text", "text": "x "},
            {"type": "color", "color": "salmon", "text": "Item 1"},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Missing "},
            {"type": "color", "color": "cyan", "text": "some"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 2"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 3"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Missing "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 4"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 5"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Missing "},
            {"type": "color", "color": "cyan", "text": "some"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 6"},
            {"type": "text", "text": " x1"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 7"},
            {"type": "text", "text": " x5"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Missing "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 8"},
            {"type": "text", "text": " x2"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 9"},
            {"type": "text", "text": " x3"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "salmon", "text": "0/2"},
            {"type": "text", "text": " items from ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 10"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 11"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 12"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "salmon", "text": "0/1"},
            {"type": "text", "text": " unique items from ("},
            {"type": "text", "text": "Missing: "},
            {"type": "color", "color": "salmon", "text": "Item 13"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "salmon", "text": "Item 14"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "salmon", "text": "0/1"},
            {"type": "text", "text": " items from "},
            {"type": "color", "color": "cyan", "text": "Group 1"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "salmon", "text": "0/2"},
            {"type": "text", "text": " unique items from "},
            {"type": "color", "color": "cyan", "text": "Group 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Cannot reach region "},
            {"type": "color", "color": "yellow", "text": "Region 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Cannot reach location "},
            {"type": "location_name", "text": "Location 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Cannot reach entrance "},
            {"type": "entrance_name", "text": "Entrance 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "green", "text": "True"},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "salmon", "text": "False"},
            {"type": "text", "text": ")"},
        ]
        assert self.resolved_rule.explain_json(self.state) == expected

    def test_explain_json_with_state_all_items(self) -> None:
        self._collect_all()

        expected: list[JSONMessagePart] = [
            {"type": "text", "text": "("},
            {"type": "text", "text": "("},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "4"},
            {"type": "text", "text": "x "},
            {"type": "color", "color": "green", "text": "Item 1"},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 2"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 3"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "some"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 4"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 5"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 6"},
            {"type": "text", "text": " x1"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 7"},
            {"type": "text", "text": " x5"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "some"},
            {"type": "text", "text": " of ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 8"},
            {"type": "text", "text": " x2"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 9"},
            {"type": "text", "text": " x3"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "green", "text": "30/2"},
            {"type": "text", "text": " items from ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 10"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 11"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 12"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "green", "text": "2/1"},
            {"type": "text", "text": " unique items from ("},
            {"type": "text", "text": "Found: "},
            {"type": "color", "color": "green", "text": "Item 13"},
            {"type": "text", "text": ", "},
            {"type": "color", "color": "green", "text": "Item 14"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "green", "text": "30/1"},
            {"type": "text", "text": " items from "},
            {"type": "color", "color": "cyan", "text": "Group 1"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "green", "text": "2/2"},
            {"type": "text", "text": " unique items from "},
            {"type": "color", "color": "cyan", "text": "Group 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Reached region "},
            {"type": "color", "color": "yellow", "text": "Region 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Reached location "},
            {"type": "location_name", "text": "Location 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Reached entrance "},
            {"type": "entrance_name", "text": "Entrance 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "green", "text": "True"},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "salmon", "text": "False"},
            {"type": "text", "text": ")"},
        ]
        assert self.resolved_rule.explain_json(self.state) == expected

    def test_explain_json_without_state(self) -> None:
        expected: list[JSONMessagePart] = [
            {"type": "text", "text": "("},
            {"type": "text", "text": "("},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "4"},
            {"type": "text", "text": "x "},
            {"type": "item_name", "flags": 1, "text": "Item 1", "player": 1},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "item_name", "flags": 1, "text": "Item 2", "player": 1},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 3", "player": 1},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " | "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "any"},
            {"type": "text", "text": " of ("},
            {"type": "item_name", "flags": 1, "text": "Item 4", "player": 1},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 5", "player": 1},
            {"type": "text", "text": ")"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "all"},
            {"type": "text", "text": " of ("},
            {"type": "item_name", "flags": 1, "text": "Item 6", "player": 1},
            {"type": "text", "text": " x1"},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 7", "player": 1},
            {"type": "text", "text": " x5"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "any"},
            {"type": "text", "text": " of ("},
            {"type": "item_name", "flags": 1, "text": "Item 8", "player": 1},
            {"type": "text", "text": " x2"},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 9", "player": 1},
            {"type": "text", "text": " x3"},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "2"},
            {"type": "text", "text": "x items from ("},
            {"type": "item_name", "flags": 1, "text": "Item 10", "player": 1},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 11", "player": 1},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 12", "player": 1},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "1"},
            {"type": "text", "text": "x unique items from ("},
            {"type": "item_name", "flags": 1, "text": "Item 13", "player": 1},
            {"type": "text", "text": ", "},
            {"type": "item_name", "flags": 1, "text": "Item 14", "player": 1},
            {"type": "text", "text": ")"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "1"},
            {"type": "text", "text": " items from "},
            {"type": "color", "color": "cyan", "text": "Group 1"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Has "},
            {"type": "color", "color": "cyan", "text": "2"},
            {"type": "text", "text": " unique items from "},
            {"type": "color", "color": "cyan", "text": "Group 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Can reach region "},
            {"type": "color", "color": "yellow", "text": "Region 2"},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Can reach location "},
            {"type": "location_name", "text": "Location 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "text", "text": "Can reach entrance "},
            {"type": "entrance_name", "text": "Entrance 2", "player": 1},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "green", "text": "True"},
            {"type": "text", "text": " & "},
            {"type": "color", "color": "salmon", "text": "False"},
            {"type": "text", "text": ")"},
        ]
        assert self.resolved_rule.explain_json() == expected

    def test_explain_str_with_state_no_items(self) -> None:
        expected = (
            "((Missing 4x Item 1",
            "| Missing some of (Missing: Item 2, Item 3)",
            "| Missing all of (Missing: Item 4, Item 5))",
            "& Missing some of (Missing: Item 6 x1, Item 7 x5)",
            "& Missing all of (Missing: Item 8 x2, Item 9 x3)",
            "& Has 0/2 items from (Missing: Item 10, Item 11, Item 12)",
            "& Has 0/1 unique items from (Missing: Item 13, Item 14)",
            "& Has 0/1 items from Group 1",
            "& Has 0/2 unique items from Group 2",
            "& Cannot reach region Region 2",
            "& Cannot reach location Location 2",
            "& Cannot reach entrance Entrance 2",
            "& True",
            "& False)",
        )
        assert self.resolved_rule.explain_str(self.state) == " ".join(expected)

    def test_explain_str_with_state_all_items(self) -> None:
        self._collect_all()

        expected = (
            "((Has 4x Item 1",
            "| Has all of (Found: Item 2, Item 3)",
            "| Has some of (Found: Item 4, Item 5))",
            "& Has all of (Found: Item 6 x1, Item 7 x5)",
            "& Has some of (Found: Item 8 x2, Item 9 x3)",
            "& Has 30/2 items from (Found: Item 10, Item 11, Item 12)",
            "& Has 2/1 unique items from (Found: Item 13, Item 14)",
            "& Has 30/1 items from Group 1",
            "& Has 2/2 unique items from Group 2",
            "& Reached region Region 2",
            "& Reached location Location 2",
            "& Reached entrance Entrance 2",
            "& True",
            "& False)",
        )
        assert self.resolved_rule.explain_str(self.state) == " ".join(expected)

    def test_explain_str_without_state(self) -> None:
        expected = (
            "((Has 4x Item 1",
            "| Has all of (Item 2, Item 3)",
            "| Has any of (Item 4, Item 5))",
            "& Has all of (Item 6 x1, Item 7 x5)",
            "& Has any of (Item 8 x2, Item 9 x3)",
            "& Has 2x items from (Item 10, Item 11, Item 12)",
            "& Has a unique item from (Item 13, Item 14)",
            "& Has an item from Group 1",
            "& Has 2x unique items from Group 2",
            "& Can reach region Region 2",
            "& Can reach location Location 2",
            "& Can reach entrance Entrance 2",
            "& True",
            "& False)",
        )
        assert self.resolved_rule.explain_str() == " ".join(expected)

    def test_str(self) -> None:
        expected = (
            "((Has 4x Item 1",
            "| Has all of (Item 2, Item 3)",
            "| Has any of (Item 4, Item 5))",
            "& Has all of (Item 6 x1, Item 7 x5)",
            "& Has any of (Item 8 x2, Item 9 x3)",
            "& Has 2x items from (Item 10, Item 11, Item 12)",
            "& Has a unique item from (Item 13, Item 14)",
            "& Has an item from Group 1",
            "& Has 2x unique items from Group 2",
            "& Can reach region Region 2",
            "& Can reach location Location 2",
            "& Can reach entrance Entrance 2",
            "& True",
            "& False)",
        )
        assert str(self.resolved_rule) == " ".join(expected)


class TestCountItem(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_evaluate_no_items(self) -> None:
        rule = CountItem("Item 1")
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))

    def test_evaluate_with_items(self) -> None:
        rule = CountItem("Item 1")
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))

    def test_get_value_returns_count(self) -> None:
        rule = CountItem("Item 1")
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 0)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 1)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 2)

    def test_in_compare_context(self) -> None:
        """CountItem.get_value() must return actual count for Compare to work."""
        rule = Compare(CountItem("Item 1"), ">=", 3)
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        for _ in range(2):
            self.state.collect(self.world.create_item("Item 1"))
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))


class TestCountFromList(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_evaluate_no_items(self) -> None:
        rule = CountFromList("Item 1", "Item 2")
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))

    def test_evaluate_with_items(self) -> None:
        rule = CountFromList("Item 1", "Item 2")
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))

    def test_get_value_cumulative(self) -> None:
        """CountFromList counts cumulative occurrences across all items in the list."""
        rule = CountFromList("Item 1", "Item 2")
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 0)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 1)
        self.state.collect(self.world.create_item("Item 2"))
        self.assertEqual(resolved.get_value(self.state), 2)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 3)

    def test_duplicate_items_in_list(self) -> None:
        """Duplicate item names in the list count the same item multiple times."""
        rule = CountFromList("Item 1", "Item 1", "Item 2")
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        # Item 1 appears twice in list, so count = 1 + 1 = 2 (from count_from_list)
        # Plus Item 2 count = 0, total = 2
        self.assertEqual(resolved.get_value(self.state), 2)

    def test_in_compare_context(self) -> None:
        rule = Compare(CountFromList("Item 1", "Item 2"), ">=", 2)
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 2"))
        self.assertTrue(resolved(self.state))


class TestCountGroup(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_evaluate_no_items(self) -> None:
        rule = CountGroup("Group 1")
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))

    def test_evaluate_with_items(self) -> None:
        rule = CountGroup("Group 1")
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))

    def test_get_value_returns_group_count(self) -> None:
        """CountGroup.get_value() returns count of items from the named group."""
        rule = CountGroup("Group 1")  # Group 1 = {Item 1, Item 2, Item 3}
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 0)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 1)
        self.state.collect(self.world.create_item("Item 2"))
        self.assertEqual(resolved.get_value(self.state), 2)
        # Item 4 is in Group 2, not Group 1
        self.state.collect(self.world.create_item("Item 4"))
        self.assertEqual(resolved.get_value(self.state), 2)

    def test_in_compare_context(self) -> None:
        rule = Compare(CountGroup("Group 1"), ">=", 3)
        resolved = rule.resolve(self.world)
        for item_name in ("Item 1", "Item 2"):
            self.state.collect(self.world.create_item(item_name))
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 3"))
        self.assertTrue(resolved(self.state))


class TestCompare(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_literal_comparison(self) -> None:
        rule = Compare(5, ">=", 3)
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))

    def test_all_operators(self) -> None:
        for op, left, right, expected in [
            ("==", 3, 3, True),
            ("==", 3, 4, False),
            ("!=", 3, 4, True),
            ("!=", 3, 3, False),
            ("<", 2, 3, True),
            ("<", 3, 3, False),
            (">", 4, 3, True),
            (">", 3, 3, False),
            ("<=", 3, 3, True),
            ("<=", 4, 3, False),
            (">=", 3, 3, True),
            (">=", 2, 3, False),
        ]:
            with self.subTest(op=op, left=left, right=right):
                rule = Compare(left, op, right)
                resolved = rule.resolve(self.world)
                self.assertEqual(resolved(self.state), expected)

    def test_rule_operand_with_get_value(self) -> None:
        """Compare uses get_value() on rule operands that have it."""
        rule = Compare(CountItem("Item 1"), "==", 2)
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))

    def test_boolean_rule_operand(self) -> None:
        """Compare falls back to boolean evaluation for rules without get_value."""
        rule = Compare(Has("Item 1"), "==", True)
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))


class TestArithmetic(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_literal_addition(self) -> None:
        rule = Arithmetic(3, "+", 4)
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 7)

    def test_all_operators(self) -> None:
        for op, left, right, expected in [
            ("+", 3, 4, 7),
            ("-", 10, 3, 7),
            ("*", 3, 4, 12),
            ("/", 10, 4, 2.5),
            ("//", 10, 3, 3),
            ("%", 10, 3, 1),
            ("**", 2, 3, 8),
        ]:
            with self.subTest(op=op):
                rule = Arithmetic(left, op, right)
                resolved = rule.resolve(self.world)
                self.assertEqual(resolved.get_value(self.state), expected)

    def test_division_by_zero(self) -> None:
        for op in ("/", "//", "%"):
            with self.subTest(op=op):
                rule = Arithmetic(10, op, 0)
                resolved = rule.resolve(self.world)
                self.assertEqual(resolved.get_value(self.state), 0)

    def test_evaluate_as_boolean(self) -> None:
        rule_truthy = Arithmetic(3, "+", 4)
        rule_falsy = Arithmetic(3, "-", 3)
        self.assertTrue(rule_truthy.resolve(self.world)(self.state))
        self.assertFalse(rule_falsy.resolve(self.world)(self.state))

    def test_with_rule_operands(self) -> None:
        """Arithmetic resolves Rule operands via get_value()."""
        rule = Arithmetic(CountItem("Item 1"), "*", 2)
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 0)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 2)
        self.state.collect(self.world.create_item("Item 1"))
        self.assertEqual(resolved.get_value(self.state), 4)

    def test_in_compare_context(self) -> None:
        """Arithmetic result used in a Compare expression."""
        rule = Compare(Arithmetic(CountItem("Item 1"), "+", CountItem("Item 2")), ">=", 3)
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 2"))
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))


class TestMinValue(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_literal_values(self) -> None:
        rule = MinValue(3, 5)
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 3)

    def test_with_rule_operands(self) -> None:
        rule = MinValue(CountItem("Item 1"), 2)
        resolved = rule.resolve(self.world)
        # min(0, 2) = 0
        self.assertEqual(resolved.get_value(self.state), 0)
        self.state.collect(self.world.create_item("Item 1"))
        # min(1, 2) = 1
        self.assertEqual(resolved.get_value(self.state), 1)
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 1"))
        # min(3, 2) = 2 (capped)
        self.assertEqual(resolved.get_value(self.state), 2)

    def test_evaluate_as_boolean(self) -> None:
        self.assertTrue(MinValue(3, 5).resolve(self.world)(self.state))
        self.assertFalse(MinValue(0, 5).resolve(self.world)(self.state))

    def test_in_compare_context(self) -> None:
        """MinValue can cap a count for use in Compare."""
        rule = Compare(MinValue(CountItem("Item 1"), 2), ">=", 2)
        resolved = rule.resolve(self.world)
        for _ in range(5):
            self.state.collect(self.world.create_item("Item 1"))
        # min(5, 2) = 2, 2 >= 2 is True
        self.assertTrue(resolved(self.state))


class TestMaxValue(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_literal_values(self) -> None:
        rule = MaxValue(3, 5)
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 5)

    def test_with_rule_operands(self) -> None:
        rule = MaxValue(CountItem("Item 1"), 2)
        resolved = rule.resolve(self.world)
        # max(0, 2) = 2
        self.assertEqual(resolved.get_value(self.state), 2)
        self.state.collect(self.world.create_item("Item 1"))
        # max(1, 2) = 2
        self.assertEqual(resolved.get_value(self.state), 2)
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 1"))
        # max(3, 2) = 3
        self.assertEqual(resolved.get_value(self.state), 3)

    def test_evaluate_as_boolean(self) -> None:
        self.assertTrue(MaxValue(0, 5).resolve(self.world)(self.state))
        self.assertFalse(MaxValue(0, 0).resolve(self.world)(self.state))

    def test_in_compare_context(self) -> None:
        """MaxValue as a floor in Compare."""
        rule = Compare(MaxValue(CountItem("Item 1"), 1), ">=", 1)
        resolved = rule.resolve(self.world)
        # max(0, 1) = 1, 1 >= 1 is True even with no items
        self.assertTrue(resolved(self.state))


class TestWeightedSum(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_below_threshold(self) -> None:
        rule = WeightedSum(threshold=3.0, items=[("Item 1", 1.0), ("Item 2", 1.0)])
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 2"))
        # 1*1.0 + 1*1.0 = 2.0 < 3.0
        self.assertFalse(resolved(self.state))

    def test_meets_threshold(self) -> None:
        rule = WeightedSum(threshold=3.0, items=[("Item 1", 1.0), ("Item 2", 1.0)])
        resolved = rule.resolve(self.world)
        for _ in range(2):
            self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 2"))
        # 2*1.0 + 1*1.0 = 3.0 >= 3.0
        self.assertTrue(resolved(self.state))

    def test_fractional_weights(self) -> None:
        rule = WeightedSum(threshold=1.0, items=[("Item 1", 0.5), ("Item 2", 0.5)])
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        # 1*0.5 = 0.5 < 1.0
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 2"))
        # 1*0.5 + 1*0.5 = 1.0 >= 1.0
        self.assertTrue(resolved(self.state))

    def test_count_multiplies_weight(self) -> None:
        """Multiple copies of the same item multiply the weight."""
        rule = WeightedSum(threshold=2.0, items=[("Item 1", 0.5)])
        resolved = rule.resolve(self.world)
        for _ in range(3):
            self.state.collect(self.world.create_item("Item 1"))
        # 3*0.5 = 1.5 < 2.0
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        # 4*0.5 = 2.0 >= 2.0
        self.assertTrue(resolved(self.state))

    def test_item_dependencies(self) -> None:
        rule = WeightedSum(threshold=1.0, items=[("Item 1", 0.5), ("Item 2", 0.5)])
        resolved = rule.resolve(self.world)
        deps = resolved.item_dependencies()
        self.assertIn("Item 1", deps)
        self.assertIn("Item 2", deps)


class TestUniqueCount(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_below_threshold(self) -> None:
        rule = UniqueCount(threshold=2.0, items=[("Item 1", 1.0), ("Item 2", 1.0)])
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        # Only 1 unique item with weight 1.0, total = 1.0 < 2.0
        self.assertFalse(resolved(self.state))

    def test_meets_threshold(self) -> None:
        rule = UniqueCount(threshold=2.0, items=[("Item 1", 1.0), ("Item 2", 1.0)])
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        self.state.collect(self.world.create_item("Item 2"))
        # 2 unique items, total = 2.0 >= 2.0
        self.assertTrue(resolved(self.state))

    def test_duplicates_do_not_increase_count(self) -> None:
        """Unlike WeightedSum, multiple copies of the same item don't add more weight."""
        rule = UniqueCount(threshold=2.0, items=[("Item 1", 1.0), ("Item 2", 1.0)])
        resolved = rule.resolve(self.world)
        for _ in range(5):
            self.state.collect(self.world.create_item("Item 1"))
        # 5 copies of Item 1, but unique count only counts weight once: 1.0 < 2.0
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 2"))
        # Now 2 unique items: 1.0 + 1.0 = 2.0 >= 2.0
        self.assertTrue(resolved(self.state))

    def test_fractional_weights(self) -> None:
        rule = UniqueCount(threshold=1.0, items=[("Item 1", 0.5), ("Item 2", 0.5), ("Item 3", 0.5)])
        resolved = rule.resolve(self.world)
        self.state.collect(self.world.create_item("Item 1"))
        # 1 unique: 0.5 < 1.0
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 2"))
        # 2 unique: 0.5 + 0.5 = 1.0 >= 1.0
        self.assertTrue(resolved(self.state))

    def test_item_dependencies(self) -> None:
        rule = UniqueCount(threshold=1.0, items=[("Item 1", 0.5), ("Item 2", 0.5)])
        resolved = rule.resolve(self.world)
        deps = resolved.item_dependencies()
        self.assertIn("Item 1", deps)
        self.assertIn("Item 2", deps)


class TestOptionValue(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_evaluate_toggle_true(self) -> None:
        self.world.options.toggle_option.value = 1  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        rule = OptionValue("toggle_option")
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))

    def test_evaluate_toggle_false(self) -> None:
        self.world.options.toggle_option.value = 0  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        rule = OptionValue("toggle_option")
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))

    def test_get_value_returns_numeric(self) -> None:
        self.world.options.choice_option.value = 2  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        rule = OptionValue("choice_option")
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 2)

    def test_missing_option_evaluate_true(self) -> None:
        """Missing options default to True for evaluation."""
        rule = OptionValue("nonexistent_option")
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))

    def test_missing_option_get_value_zero(self) -> None:
        """Missing options default to 0 for numeric value."""
        rule = OptionValue("nonexistent_option")
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.get_value(self.state), 0)

    def test_in_compare_context(self) -> None:
        self.world.options.choice_option.value = 2  # pyright: ignore[reportUnknownMemberType, reportAttributeAccessIssue]
        rule = Compare(OptionValue("choice_option"), ">=", 2)
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))


class TestEntranceAccessRuleCall(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

        region1 = Region("Region 1", self.player, self.multiworld)
        region2 = Region("Region 2", self.player, self.multiworld)
        self.multiworld.regions.extend([region1, region2])
        self.world.create_entrance(region1, region2, Has("Item 1"))

    def test_entrance_accessible(self) -> None:
        rule = EntranceAccessRuleCall("Region 1 -> Region 2")
        resolved = rule.resolve(self.world)
        self.assertFalse(resolved(self.state))
        self.state.collect(self.world.create_item("Item 1"))
        self.assertTrue(resolved(self.state))

    def test_missing_entrance_returns_true(self) -> None:
        """Missing entrances conservatively return True."""
        rule = EntranceAccessRuleCall("Nonexistent Entrance")
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))

    def test_entrance_dependencies(self) -> None:
        rule = EntranceAccessRuleCall("Region 1 -> Region 2")
        resolved = rule.resolve(self.world)
        deps = resolved.entrance_dependencies()
        self.assertIn("Region 1 -> Region 2", deps)


class TestASTRule(RuleBuilderTestCase):
    multiworld: MultiWorld  # pyright: ignore[reportUninitializedInstanceVariable]
    world: World  # pyright: ignore[reportUninitializedInstanceVariable]
    state: CollectionState  # pyright: ignore[reportUninitializedInstanceVariable]
    player: int = 1

    @override
    def setUp(self) -> None:
        super().setUp()
        self.multiworld = setup_solo_multiworld(self.world_cls, seed=0)
        self.world = self.multiworld.worlds[1]
        self.state = self.multiworld.state

    def test_always_returns_true(self) -> None:
        """ASTRule is a fallback that always returns True."""
        rule = ASTRule(rule_data={"type": "some_unknown_type", "args": []})
        resolved = rule.resolve(self.world)
        self.assertTrue(resolved(self.state))

    def test_explain_str(self) -> None:
        rule = ASTRule(rule_data={"type": "custom_check"})
        resolved = rule.resolve(self.world)
        self.assertEqual(resolved.explain_str(), "[AST:custom_check]")

    def test_str(self) -> None:
        rule = ASTRule(rule_data={"type": "custom_check"})
        resolved = rule.resolve(self.world)
        self.assertEqual(str(resolved), "ASTRule(custom_check)")
