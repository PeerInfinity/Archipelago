import dataclasses
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from typing import TYPE_CHECKING, Any, ClassVar, Generic, Never, Self, cast

from typing_extensions import TypeVar, dataclass_transform, override

from BaseClasses import CollectionState, Entrance, Item, Location, MultiWorld, Region
from NetUtils import JSONMessagePart

if TYPE_CHECKING:
    from worlds.AutoWorld import World
else:
    World = object

def _import_logic_mixin():
    """Import LogicMixin without triggering worlds auto-discovery.

    When rule_builder is imported before worlds (e.g., from world_generator),
    importing worlds.AutoWorld would trigger worlds/__init__.py which
    auto-discovers and loads all world packages. Those worldgen worlds
    import from rule_builder, creating a circular dependency.

    Fix: temporarily stub sys.modules['worlds'] so worlds.AutoWorld can
    be imported directly. worlds/AutoWorld.py has no relative imports
    and is safe to load standalone.
    """
    import sys
    if 'worlds' not in sys.modules:
        import os, types
        worlds_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'worlds'
        )
        stub = types.ModuleType('worlds')
        stub.__path__ = [worlds_dir]
        stub.__package__ = 'worlds'
        sys.modules['worlds'] = stub
        try:
            from worlds.AutoWorld import LogicMixin
        finally:
            del sys.modules['worlds']
        return LogicMixin
    else:
        from worlds.AutoWorld import LogicMixin
        return LogicMixin

def _get_logic_mixin():
    """Get LogicMixin lazily to avoid circular imports with AutoWorld."""
    global _LogicMixin
    if _LogicMixin is None:
        _LogicMixin = _import_logic_mixin()
    return _LogicMixin

_LogicMixin = None


class _LogicMixinMeta(type):
    """Metaclass that resolves LogicMixin as base class lazily."""
    _resolved = False

    @override
    def __instancecheck__(cls, instance: object) -> bool:
        cls._ensure_bases()
        return super().__instancecheck__(instance)

    def _ensure_bases(cls):
        if not cls._resolved:
            cls._resolved = True
            base = _get_logic_mixin()
            cls.__bases__ = (base,) + tuple(b for b in cls.__bases__ if b is not object)


class RuleBuilderLogicMixin(metaclass=_LogicMixinMeta):
    """A LogicMixin that adds rule caching support to CollectionState.

    This mixin is required for worlds that use the Rule Builder's caching system.
    It adds a `rule_builder_cache` attribute to CollectionState that stores the results
    of rule evaluations, keyed by player and rule id.

    Based on PR #5048 (https://github.com/ArchipelagoMW/Archipelago/pull/5048).
    """

    multiworld: MultiWorld
    rule_builder_cache: dict[int, dict[int, bool]]

    def init_mixin(self, multiworld: MultiWorld) -> None:
        players = multiworld.get_all_ids()
        self.rule_builder_cache = {player: {} for player in players}

    def copy_mixin(self, new_state: "RuleBuilderLogicMixin") -> "RuleBuilderLogicMixin":
        new_state.rule_builder_cache = {
            player: rule_results.copy() for player, rule_results in self.rule_builder_cache.items()
        }
        return new_state


class RuleWorldMixin(World):
    """A World mixin that provides helpers for interacting with the rule builder"""

    rules_by_hash: dict[int, "Rule.Resolved"]
    """A mapping of hash values to resolved rules"""

    rule_item_dependencies: dict[str, set[int]]
    """A mapping of item name to set of rule ids"""

    rule_region_dependencies: dict[str, set[int]]
    """A mapping of region name to set of rule ids"""

    rule_location_dependencies: dict[str, set[int]]
    """A mapping of location name to set of rule ids"""

    rule_entrance_dependencies: dict[str, set[int]]
    """A mapping of entrance name to set of rule ids"""

    completion_rule: "Rule.Resolved | None" = None
    """The resolved rule used for the completion condition of this world"""

    true_rule: "Rule.Resolved"
    """A pre-initialized rule for this world that always returns True"""

    false_rule: "Rule.Resolved"
    """A pre-initialized rule for this world that always returns False"""

    item_mapping: ClassVar[dict[str, str]] = {}
    """A mapping of actual item name to logical item name.
    Useful when there are multiple versions of a collected item but the logic only uses one. For example:
    item = Item("Currency x500"), rule = Has("Currency", count=1000), item_mapping = {"Currency x500": "Currency"}"""

    rule_caching_enabled: ClassVar[bool] = True
    """Enable or disable the rule result caching system"""

    def __init__(self, multiworld: MultiWorld, player: int) -> None:
        super().__init__(multiworld, player)
        self.rules_by_hash = {}
        self.rule_item_dependencies = defaultdict(set)
        self.rule_region_dependencies = defaultdict(set)
        self.rule_location_dependencies = defaultdict(set)
        self.rule_entrance_dependencies = defaultdict(set)
        self.true_rule = self.resolve_rule(True_())
        self.false_rule = self.resolve_rule(False_())

    @override
    @classmethod
    def get_rule_cls(cls, name: str) -> type["Rule[Self]"]:  # pyright: ignore[reportIncompatibleMethodOverride]
        """Returns the world-registered or default rule with the given name"""
        return CustomRuleRegister.get_rule_cls(cls.game, name)

    @override
    @classmethod
    def rule_from_dict(cls, data: Mapping[str, Any]) -> "Rule[Self]":  # pyright: ignore[reportIncompatibleMethodOverride]
        """Create a rule instance from a serialized dict representation.

        Supports both Rule Builder format and AST format:
        - Rule Builder: {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        - AST format: {"type": "item_check", "item": "Sword"}
        """
        # Check if this is AST format (has 'type' key, no 'rule' key)
        if 'type' in data and 'rule' not in data:
            from rule_builder.ast_format import parse_ast_rule
            return parse_ast_rule(data, cls)

        # Standard Rule Builder format
        name = data.get("rule", "")
        rule_class = cls.get_rule_cls(name)
        return rule_class.from_dict(data, cls)

    def resolve_rule(self, rule: "Rule[Self]") -> "Rule.Resolved":
        """Returns a resolved rule registered with the caching system for this world"""
        resolved_rule = rule.resolve(self)
        resolved_rule = self.simplify_rule(resolved_rule)
        return self.get_cached_rule(resolved_rule)

    def get_cached_rule(self, resolved_rule: "Rule.Resolved") -> "Rule.Resolved":
        """Returns a cached instance of a resolved rule based on the hash"""
        # Skip caching for rules that have caching disabled (e.g., HelperCall with unhashable body_data)
        if not resolved_rule.caching_enabled:
            return resolved_rule
        rule_hash = hash(resolved_rule)
        if rule_hash in self.rules_by_hash:
            return self.rules_by_hash[rule_hash]
        self.rules_by_hash[rule_hash] = resolved_rule
        return resolved_rule

    @override
    def register_rule_dependencies(self, resolved_rule: "Rule.Resolved") -> None:
        """Registers a rule's item, region, location, and entrance dependencies to this world instance"""
        if not self.rule_caching_enabled:
            return
        for item_name, rule_ids in resolved_rule.item_dependencies().items():
            self.rule_item_dependencies[item_name] |= rule_ids
        for region_name, rule_ids in resolved_rule.region_dependencies().items():
            self.rule_region_dependencies[region_name] |= rule_ids
        for location_name, rule_ids in resolved_rule.location_dependencies().items():
            self.rule_location_dependencies[location_name] |= rule_ids
        for entrance_name, rule_ids in resolved_rule.entrance_dependencies().items():
            self.rule_entrance_dependencies[entrance_name] |= rule_ids

    def register_rule_connections(self, resolved_rule: "Rule.Resolved", entrance: Entrance) -> None:
        """Register indirect connections for this entrance based on the rule's dependencies"""
        for indirect_region in resolved_rule.region_dependencies().keys():
            self.multiworld.register_indirect_condition(self.get_region(indirect_region), entrance)

    def register_dependencies(self) -> None:
        """Register all rules that depend on locations or entrances with their dependencies"""
        if not self.rule_caching_enabled:
            return

        for location_name, rule_ids in self.rule_location_dependencies.items():
            try:
                location = self.get_location(location_name)
            except KeyError:
                continue
            if not isinstance(location.access_rule, Rule.Resolved):
                continue
            for item_name in location.access_rule.item_dependencies():
                self.rule_item_dependencies[item_name] |= rule_ids
            for region_name in location.access_rule.region_dependencies():
                self.rule_region_dependencies[region_name] |= rule_ids

        for entrance_name, rule_ids in self.rule_entrance_dependencies.items():
            try:
                entrance = self.get_entrance(entrance_name)
            except KeyError:
                continue
            if not isinstance(entrance.access_rule, Rule.Resolved):
                continue
            for item_name in entrance.access_rule.item_dependencies():
                self.rule_item_dependencies[item_name] |= rule_ids
            for region_name in entrance.access_rule.region_dependencies():
                self.rule_region_dependencies[region_name] |= rule_ids

    @override
    def set_rule(self, spot: Location | Entrance, rule: "Rule[Self]") -> None:  # pyright: ignore[reportIncompatibleMethodOverride]
        """Resolve and set a rule on a location or entrance"""
        resolved_rule = self.resolve_rule(rule)
        self.register_rule_dependencies(resolved_rule)
        spot.access_rule = resolved_rule
        if self.explicit_indirect_conditions and isinstance(spot, Entrance):
            self.register_rule_connections(resolved_rule, spot)

    @override
    def create_entrance(  # pyright: ignore[reportIncompatibleMethodOverride]
        self,
        from_region: Region,
        to_region: Region,
        rule: "Rule[Self] | None" = None,
        name: str | None = None,
    ) -> Entrance | None:
        """Try to create an entrance between regions with the given rule, skipping it if the rule resolves to False"""
        resolved_rule = None
        if rule is not None:
            resolved_rule = self.resolve_rule(rule)
            if resolved_rule.always_false:
                return None
            self.register_rule_dependencies(resolved_rule)

        entrance = from_region.connect(to_region, name)
        if resolved_rule:
            entrance.access_rule = resolved_rule
        if resolved_rule is not None:
            self.register_rule_connections(resolved_rule, entrance)
        return entrance

    @override
    def set_completion_rule(self, rule: "Rule[Self]") -> None:  # pyright: ignore[reportIncompatibleMethodOverride]
        """Set the completion rule for this world"""
        resolved_rule = self.resolve_rule(rule)
        self.register_rule_dependencies(resolved_rule)
        self.multiworld.completion_condition[self.player] = resolved_rule
        self.completion_rule = resolved_rule

    def simplify_rule(self, rule: "Rule.Resolved") -> "Rule.Resolved":
        """Simplify and optimize a resolved rule.

        And/Or rules now self-simplify in their _instantiate methods,
        so this is a pass-through. Kept for API compatibility.
        """
        return rule

    def _simplify_and(self, rule: "And.Resolved") -> "Rule.Resolved":
        children_to_process = list(rule.children)
        clauses: list[Rule.Resolved] = []
        items: dict[str, int] = {}
        true_rule: Rule.Resolved | None = None

        while children_to_process:
            child = self.simplify_rule(children_to_process.pop(0))
            if child.always_false:
                # false always wins
                return child
            if child.always_true:
                # dedupe trues
                true_rule = child
                continue
            if isinstance(child, And.Resolved):
                children_to_process.extend(child.children)
                continue

            if isinstance(child, Has.Resolved) and isinstance(child.count, int):
                if child.item_name not in items or items[child.item_name] < child.count:
                    items[child.item_name] = child.count
            elif isinstance(child, HasAll.Resolved):
                for item in child.item_names:
                    if item not in items:
                        items[item] = 1
            else:
                clauses.append(child)

        if not clauses and not items:
            return true_rule or self.false_rule

        has_cls = cast(type[Has[Self]], self.get_rule_cls("Has"))
        has_all_cls = cast(type[HasAll[Self]], self.get_rule_cls("HasAll"))
        has_all_items: list[str] = []
        for item, count in items.items():
            if count == 1:
                has_all_items.append(item)
            else:
                clauses.append(
                    self.get_cached_rule(
                        has_cls.Resolved(item, count, player=rule.player, caching_enabled=self.rule_caching_enabled)
                    )
                )

        if len(has_all_items) == 1:
            clauses.append(
                self.get_cached_rule(
                    has_cls.Resolved(has_all_items[0], player=rule.player, caching_enabled=self.rule_caching_enabled)
                )
            )
        elif len(has_all_items) > 1:
            clauses.append(
                self.get_cached_rule(
                    has_all_cls.Resolved(
                        tuple(has_all_items),
                        player=rule.player,
                        caching_enabled=self.rule_caching_enabled,
                    )
                )
            )

        if len(clauses) == 1:
            return clauses[0]
        return And.Resolved(tuple(clauses), player=rule.player, caching_enabled=self.rule_caching_enabled)

    def _simplify_or(self, rule: "Or.Resolved") -> "Rule.Resolved":
        children_to_process = list(rule.children)
        clauses: list[Rule.Resolved] = []
        items: dict[str, int] = {}

        while children_to_process:
            child = self.simplify_rule(children_to_process.pop(0))
            if child.always_true:
                # true always wins
                return child
            if child.always_false:
                # falses can be ignored
                continue
            if isinstance(child, Or.Resolved):
                children_to_process.extend(child.children)
                continue

            if isinstance(child, Has.Resolved) and isinstance(child.count, int):
                if child.item_name not in items or child.count < items[child.item_name]:
                    items[child.item_name] = child.count
            elif isinstance(child, HasAny.Resolved):
                for item in child.item_names:
                    items[item] = 1
            else:
                clauses.append(child)

        if not clauses and not items:
            return self.false_rule

        has_cls = cast(type[Has[Self]], self.get_rule_cls("Has"))
        has_any_cls = cast(type[HasAny[Self]], self.get_rule_cls("HasAny"))
        has_any_items: list[str] = []
        for item, count in items.items():
            if count == 1:
                has_any_items.append(item)
            else:
                clauses.append(
                    self.get_cached_rule(
                        has_cls.Resolved(item, count, player=rule.player, caching_enabled=self.rule_caching_enabled)
                    )
                )

        if len(has_any_items) == 1:
            clauses.append(
                self.get_cached_rule(
                    has_cls.Resolved(has_any_items[0], player=rule.player, caching_enabled=self.rule_caching_enabled)
                )
            )
        elif len(has_any_items) > 1:
            clauses.append(
                self.get_cached_rule(
                    has_any_cls.Resolved(
                        tuple(has_any_items),
                        player=rule.player,
                        caching_enabled=self.rule_caching_enabled,
                    )
                )
            )

        if len(clauses) == 1:
            return clauses[0]
        return Or.Resolved(tuple(clauses), player=rule.player, caching_enabled=self.rule_caching_enabled)

    @override
    def collect(self, state: CollectionState, item: Item) -> bool:
        changed = super().collect(state, item)
        if changed and self.rule_caching_enabled and self.rule_item_dependencies:
            player_results = cast(dict[int, bool], state.rule_builder_cache[self.player])  # pyright: ignore[reportAttributeAccessIssue, reportUnknownMemberType]
            mapped_name = self.item_mapping.get(item.name, "")
            rule_ids = self.rule_item_dependencies[item.name] | self.rule_item_dependencies[mapped_name]
            for rule_id in rule_ids:
                if player_results.get(rule_id, None) is False:
                    del player_results[rule_id]

        return changed

    @override
    def remove(self, state: CollectionState, item: Item) -> bool:
        changed = super().remove(state, item)
        if not changed or not self.rule_caching_enabled:
            return changed

        player_results = cast(dict[int, bool], state.rule_builder_cache[self.player])  # pyright: ignore[reportAttributeAccessIssue, reportUnknownMemberType]
        if self.rule_item_dependencies:
            mapped_name = self.item_mapping.get(item.name, "")
            rule_ids = self.rule_item_dependencies[item.name] | self.rule_item_dependencies[mapped_name]
            for rule_id in rule_ids:
                player_results.pop(rule_id, None)

        # clear all region dependent caches as none can be trusted
        if self.rule_region_dependencies:
            for rule_ids in self.rule_region_dependencies.values():
                for rule_id in rule_ids:
                    player_results.pop(rule_id, None)

        # clear all location dependent caches as they may have lost region access
        if self.rule_location_dependencies:
            for rule_ids in self.rule_location_dependencies.values():
                for rule_id in rule_ids:
                    player_results.pop(rule_id, None)

        # clear all entrance dependent caches as they may have lost region access
        if self.rule_entrance_dependencies:
            for rule_ids in self.rule_entrance_dependencies.values():
                for rule_id in rule_ids:
                    player_results.pop(rule_id, None)

        return changed

    @override
    def reached_region(self, state: CollectionState, region: Region) -> None:
        super().reached_region(state, region)
        if self.rule_caching_enabled and self.rule_region_dependencies:
            player_results = cast(dict[int, bool], state.rule_builder_cache[self.player])  # pyright: ignore[reportAttributeAccessIssue, reportUnknownMemberType]
            for rule_id in self.rule_region_dependencies[region.name]:
                player_results.pop(rule_id, None)

    @override
    def collect_item(self, state: CollectionState, item: Item, remove: bool = False) -> str | None:
        """Collect an item name into state.

        Only collects progression items (items with advancement=True) into state.
        """
        if item.advancement:
            return item.name
        return None


if TYPE_CHECKING:
    TWorld = TypeVar("TWorld", bound=World, contravariant=True, default=World)  # noqa: PLC0105
else:
    TWorld = TypeVar("TWorld")

from .options import OptionFilter


def _make_hashable(value: Any) -> Any:
    """Convert a value to a hashable form, recursively handling dicts, lists, tuples, and sets."""
    if isinstance(value, dict):
        # Convert dict to a sorted tuple of (key, value) pairs
        d = cast(dict[Any, Any], value)
        return tuple(sorted((_make_hashable(k), _make_hashable(v)) for k, v in d.items()))
    elif isinstance(value, list):
        items = cast(list[Any], value)
        return tuple(_make_hashable(item) for item in items)
    elif isinstance(value, tuple):
        items = cast(tuple[Any, ...], value)
        return tuple(_make_hashable(item) for item in items)
    elif isinstance(value, set):
        items = cast(set[Any], value)
        return frozenset(_make_hashable(item) for item in items)
    elif dataclasses.is_dataclass(value) and not isinstance(value, type):
        return tuple(_make_hashable(getattr(value, f.name)) for f in dataclasses.fields(value))
    return value


def _create_hash_fn(resolved_rule_cls: "CustomRuleRegister") -> Callable[..., int]:
    def hash_impl(self: "Rule.Resolved") -> int:
        return hash(
            (
                self.__class__.__module__,
                self.rule_name,
                *[_make_hashable(getattr(self, f.name)) for f in dataclasses.fields(self)],
            )
        )

    hash_impl.__qualname__ = f"{resolved_rule_cls.__qualname__}.__hash__"
    return hash_impl


@dataclass_transform(frozen_default=True, field_specifiers=(dataclasses.field, dataclasses.Field))
class CustomRuleRegister(type):
    """A metaclass to contain world custom rules and automatically convert resolved rules to frozen dataclasses"""

    resolved_rules: ClassVar[dict[int, "Rule.Resolved"]] = {}
    """A cache of resolved rules to turn each unique one into a singleton"""

    custom_rules: ClassVar[dict[str, dict[str, type["Rule[Any]"]]]] = {}
    """A mapping of game name to mapping of rule name to rule class"""

    rule_name: str = "Rule"
    """The string name of a rule, must be unique per game"""

    def __new__(
        cls,
        name: str,
        bases: tuple[type, ...],
        namespace: dict[str, Any],
        /,
        **kwds: dict[str, Any],
    ) -> type["CustomRuleRegister"]:
        new_cls = super().__new__(cls, name, bases, namespace, **kwds)
        new_cls.__hash__ = _create_hash_fn(new_cls)
        rule_name = new_cls.__qualname__
        if rule_name.endswith(".Resolved"):
            rule_name = rule_name[:-9]
        new_cls.rule_name = rule_name
        return dataclasses.dataclass(frozen=True)(new_cls)

    @override
    def __call__(cls, *args: Any, **kwds: Any) -> Any:
        rule = super().__call__(*args, **kwds)
        rule_hash = hash(rule)
        if rule_hash in cls.resolved_rules:
            return cls.resolved_rules[rule_hash]
        cls.resolved_rules[rule_hash] = rule
        return rule

    @classmethod
    def get_rule_cls(cls, game_name: str, rule_name: str) -> type["Rule[Any]"]:
        """Returns the world-registered or default rule with the given name"""
        custom_rule_classes = cls.custom_rules.get(game_name, {})
        if rule_name not in DEFAULT_RULES and rule_name not in custom_rule_classes:
            raise ValueError(f"Rule '{rule_name}' for game '{game_name}' not found")
        return custom_rule_classes.get(rule_name) or DEFAULT_RULES[rule_name]


@dataclasses.dataclass()
class Rule(Generic[TWorld]):
    """Base class for a static rule used to generate an access rule"""

    options: Iterable[OptionFilter] = dataclasses.field(default=(), kw_only=True)
    """An iterable of OptionFilters to restrict what options are required for this rule to be active"""

    filtered_resolution: bool = dataclasses.field(default=False, kw_only=True)
    """If this rule should default to True or False when filtered by its options"""

    game_name: ClassVar[str]
    """The name of the game this rule belongs to, default rules belong to 'Archipelago'"""

    def __post_init__(self) -> None:
        if not isinstance(self.options, tuple):
            self.options = tuple(self.options)

    def _instantiate(self, world: TWorld) -> "Resolved":
        """Create a new resolved rule for this world"""
        return self.Resolved(player=world.player, caching_enabled=getattr(world, "rule_caching_enabled", False))

    def resolve(self, world: TWorld) -> "Resolved":
        """Resolve a rule with the given world"""
        for option_filter in self.options:
            if not option_filter.check(world.options):
                if self.filtered_resolution:
                    return True_().resolve(world)
                return getattr(world, "false_rule", None) or False_().resolve(world)
        return self._instantiate(world)

    def to_dict(self) -> dict[str, Any]:
        """Returns a JSON compatible dict representation of this rule."""
        result: dict[str, Any] = {"rule": self.__class__.__qualname__}
        result["options"] = [o.to_dict() for o in self.options]
        result["filtered_resolution"] = self.filtered_resolution
        args = {
            field.name: getattr(self, field.name, None)
            for field in dataclasses.fields(self)
            if field.name not in ("options", "filtered_resolution")
        }
        if args:
            result["args"] = args
        return result

    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        """Returns a new instance of this rule from a serialized dict representation"""
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(**data.get("args", {}), options=options, filtered_resolution=data.get("filtered_resolution", False))

    def __and__(self, other: "Rule[Any] | Iterable[OptionFilter] | OptionFilter") -> "Rule[TWorld]":
        """Combines two rules into an And rule, or filters with OptionFilter(s)"""
        if isinstance(other, OptionFilter):
            other = (other,)
        if isinstance(other, Iterable):
            if not other:
                return self
            return Filtered(self, options=other)
        if self.options == other.options:
            if isinstance(self, And):
                if isinstance(other, And):
                    return And(*self.children, *other.children, options=self.options)
                return And(*self.children, other, options=self.options)
            if isinstance(other, And):
                return And(self, *other.children, options=other.options)
        return And(self, other)

    def __rand__(self, other: "Rule[Any] | Iterable[OptionFilter] | OptionFilter") -> "Rule[TWorld]":
        return self.__and__(other)

    def __or__(self, other: "Rule[Any] | Iterable[OptionFilter] | OptionFilter") -> "Rule[TWorld]":
        """Combines two rules into an Or rule, or creates True_ filtered with OptionFilter(s)"""
        if isinstance(other, OptionFilter):
            other = (other,)
        if isinstance(other, Iterable):
            if not other:
                return self
            return Or(self, True_(options=other))
        if self.options == other.options:
            if isinstance(self, Or):
                if isinstance(other, Or):
                    return Or(*self.children, *other.children, options=self.options)
                return Or(*self.children, other, options=self.options)
            if isinstance(other, Or):
                return Or(self, *other.children, options=self.options)
        return Or(self, other)

    def __ror__(self, other: "Rule[Any] | Iterable[OptionFilter] | OptionFilter") -> "Rule[TWorld]":
        return self.__or__(other)

    def __lshift__(self, other: Iterable[OptionFilter]) -> "Rule[TWorld]":
        """Convenience operator to filter an existing rule with an option filter"""
        return Filtered(self, options=other)

    def __bool__(self) -> Never:
        """Safeguard to prevent devs from mistakenly doing `rule1 and rule2` and getting the wrong result"""
        raise TypeError("Use & or | to combine rules, or use `is not None` for boolean tests")

    @override
    def __str__(self) -> str:
        options = f"options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({options})"

    @classmethod
    def __init_subclass__(cls, /, game: str) -> None:
        if game != "Archipelago":
            custom_rules = CustomRuleRegister.custom_rules.setdefault(game, {})
            if cls.__qualname__ in custom_rules:
                raise TypeError(f"Rule {cls.__qualname__} has already been registered for game {game}")
            custom_rules[cls.__qualname__] = cls
        elif not cls.__module__.startswith("rule_builder"):
            # TODO: test to make sure this works on frozen
            raise TypeError("You cannot define custom rules for the base Archipelago world")
        cls.game_name = game

    class Resolved(metaclass=CustomRuleRegister):
        """A resolved rule for a given world that can be used as an access rule"""

        _: dataclasses.KW_ONLY

        player: int
        """The player this rule is for"""

        caching_enabled: bool = dataclasses.field(repr=False, compare=False, default=True, kw_only=True)
        """If the world this rule is for has caching enabled"""

        force_recalculate: ClassVar[bool] = False
        """Forces this rule to be recalculated every time it is evaluated.
        Forces any parent composite rules containing this rule to also be recalculated. Implies skip_cache."""

        skip_cache: ClassVar[bool] = False
        """Skips the caching layer when evaluating this rule.
        Composite rules will still respect the caching layer so dependencies functions should be implemented as normal.
        Set to True when rule calculation is trivial."""

        always_true: ClassVar[bool] = False
        """Whether this rule always evaluates to True, used to short-circuit logic"""

        always_false: ClassVar[bool] = False
        """Whether this rule always evaluates to True, used to short-circuit logic"""

        def __post_init__(self) -> None:
            object.__setattr__(
                self,
                "caching_enabled",
                self.caching_enabled and not self.force_recalculate and not self.skip_cache,
            )

        def __call__(self, state: CollectionState) -> bool:
            """Evaluate this rule's result with the given state, using the cached value if possible"""
            if not self.caching_enabled:
                return self._evaluate(state)

            player_results = cast(dict[int, bool], state.rule_builder_cache[self.player])  # pyright: ignore[reportAttributeAccessIssue, reportUnknownMemberType]
            cached_result = player_results.get(id(self))
            if cached_result is not None:
                return cached_result

            result = self._evaluate(state)
            player_results[id(self)] = result
            return result

        def _evaluate(self, state: CollectionState) -> bool:
            """Calculate this rule's result with the given state"""
            ...

        def get_value(self, state: CollectionState) -> int | float:
            """Get the numeric value of this rule for arithmetic/comparison contexts.
            Override in subclasses that produce numeric values (e.g., CountItem, Arithmetic)."""
            return 1 if self._evaluate(state) else 0

        def get_count(self, state: CollectionState) -> int | float:
            """Get the count value of this rule for counting contexts.
            Override in subclasses that produce count values (e.g., CountItem, CountFromList)."""
            return 1 if self._evaluate(state) else 0

        def item_dependencies(self) -> dict[str, set[int]]:
            """Returns a mapping of item name to set of object ids, used for cache invalidation"""
            return {}

        def region_dependencies(self) -> dict[str, set[int]]:
            """Returns a mapping of region name to set of object ids,
            used for indirect connections and cache invalidation"""
            return {}

        def location_dependencies(self) -> dict[str, set[int]]:
            """Returns a mapping of location name to set of object ids, used for cache invalidation"""
            return {}

        def entrance_dependencies(self) -> dict[str, set[int]]:
            """Returns a mapping of entrance name to set of object ids, used for cache invalidation"""
            return {}

        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            """Returns a list of printJSON messages that explain the logic for this rule"""
            return [{"type": "text", "text": self.rule_name}]

        def explain_str(self, state: CollectionState | None = None) -> str:
            """Returns a human readable string describing this rule"""
            return str(self)

        @override
        def __str__(self) -> str:
            return self.rule_name

        @property
        def _rule_class_name(self) -> str:
            """Get the rule class name without '.Resolved' suffix"""
            qualname = self.__class__.__qualname__
            # Handle nested class names like "Has.Resolved" -> "Has"
            if '.Resolved' in qualname:
                return qualname.replace('.Resolved', '')
            return qualname

        def to_dict(self) -> dict[str, Any]:
            """Returns a JSON compatible dict representation of this resolved rule.

            This enables the exporter to serialize Rule Builder rules without
            needing AST analysis. Empty 'options' and 'args' are omitted.
            """
            result: dict[str, Any] = {"rule": self._rule_class_name}
            args = self._get_args_dict()
            if args:
                result["args"] = args
            return result

        def _get_args_dict(self) -> dict[str, Any]:
            """Override in subclasses to provide serializable args.

            Default implementation returns empty dict.
            """
            return {}


@dataclasses.dataclass()
class True_(Rule[TWorld], game="Archipelago"):  # noqa: N801
    """A rule that always returns True"""

    class Resolved(Rule.Resolved):
        always_true: ClassVar[bool] = True
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return True

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            return [{"type": "color", "color": "green", "text": "True"}]

        @override
        def __str__(self) -> str:
            return "True"


@dataclasses.dataclass()
class False_(Rule[TWorld], game="Archipelago"):  # noqa: N801
    """A rule that always returns False"""

    class Resolved(Rule.Resolved):
        always_false: ClassVar[bool] = True
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return False

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            return [{"type": "color", "color": "salmon", "text": "False"}]

        @override
        def __str__(self) -> str:
            return "False"


@dataclasses.dataclass(init=False)
class NestedRule(Rule[TWorld], game="Archipelago"):
    """A base rule class that takes an iterable of other rules as an argument and does logic based on them"""

    children: tuple[Rule[TWorld], ...]
    """The child rules this rule's logic is based on"""

    def __init__(
        self,
        *children: Rule[TWorld],
        options: Iterable[OptionFilter] = (),
        filtered_resolution: bool = False,
    ) -> None:
        super().__init__(options=options, filtered_resolution=filtered_resolution)
        self.children = children

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        children = [world.resolve_rule(c) for c in self.children]
        return self.Resolved(tuple(children), player=world.player, caching_enabled=getattr(world, "rule_caching_enabled", False))

    @override
    def to_dict(self) -> dict[str, Any]:
        data = super().to_dict()
        del data["args"]
        data["children"] = [c.to_dict() for c in self.children]
        return data

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        children = [world_cls.rule_from_dict(c) for c in data.get("children", ())]
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*children, options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        children = ", ".join(str(c) for c in self.children)
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({children}{options})"

    class Resolved(Rule.Resolved):
        children: tuple[Rule.Resolved, ...]

        def __post_init__(self) -> None:
            object.__setattr__(
                self,
                "force_recalculate",
                self.force_recalculate or any(c.force_recalculate for c in self.children),
            )
            super().__post_init__()

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            combined_deps: dict[str, set[int]] = {}
            for child in self.children:
                for item_name, rules in child.item_dependencies().items():
                    if item_name in combined_deps:
                        combined_deps[item_name] |= rules
                    else:
                        combined_deps[item_name] = {id(self), *rules}
            return combined_deps

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            combined_deps: dict[str, set[int]] = {}
            for child in self.children:
                for region_name, rules in child.region_dependencies().items():
                    if region_name in combined_deps:
                        combined_deps[region_name] |= rules
                    else:
                        combined_deps[region_name] = {id(self), *rules}
            return combined_deps

        @override
        def location_dependencies(self) -> dict[str, set[int]]:
            combined_deps: dict[str, set[int]] = {}
            for child in self.children:
                for location_name, rules in child.location_dependencies().items():
                    if location_name in combined_deps:
                        combined_deps[location_name] |= rules
                    else:
                        combined_deps[location_name] = {id(self), *rules}
            return combined_deps

        @override
        def entrance_dependencies(self) -> dict[str, set[int]]:
            combined_deps: dict[str, set[int]] = {}
            for child in self.children:
                for entrance_name, rules in child.entrance_dependencies().items():
                    if entrance_name in combined_deps:
                        combined_deps[entrance_name] |= rules
                    else:
                        combined_deps[entrance_name] = {id(self), *rules}
            return combined_deps

        @override
        def to_dict(self) -> dict[str, Any]:
            """Override to serialize children instead of args."""
            return {
                "rule": self._rule_class_name,
                "children": [c.to_dict() for c in self.children],
            }


@dataclasses.dataclass(init=False)
class And(NestedRule[TWorld], game="Archipelago"):
    """A rule that only returns true when all child rules evaluate as true"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        children_to_process = [c.resolve(world) for c in self.children]
        clauses: list[Rule.Resolved] = []
        items: dict[str, int] = {}
        true_rule: Rule.Resolved | None = None

        while children_to_process:
            child = children_to_process.pop(0)
            if child.always_false:
                return child
            if child.always_true:
                true_rule = child
                continue
            if isinstance(child, And.Resolved):
                children_to_process.extend(child.children)
                continue
            if isinstance(child, Has.Resolved) and isinstance(child.count, int):
                if child.item_name not in items or items[child.item_name] < child.count:
                    items[child.item_name] = child.count
            elif isinstance(child, HasAll.Resolved):
                for item in child.item_names:
                    if item not in items:
                        items[item] = 1
            elif isinstance(child, HasAllCounts.Resolved):
                for item, count in child.item_counts:
                    if item not in items or items[item] < count:
                        items[item] = count
            else:
                clauses.append(child)

        if not clauses and not items:
            return true_rule or False_().resolve(world)

        caching = getattr(world, "rule_caching_enabled", False)
        if len(items) == 1:
            item, count = next(iter(items.items()))
            clauses.append(Has(item, count).resolve(world))
        elif items and all(count == 1 for count in items.values()):
            clauses.append(HasAll(*items).resolve(world))
        elif items:
            clauses.append(HasAllCounts(items).resolve(world))

        if len(clauses) == 1:
            return clauses[0]
        return And.Resolved(tuple(clauses), player=world.player, caching_enabled=caching)

    class Resolved(NestedRule.Resolved):
        @override
        def _evaluate(self, state: CollectionState) -> bool:
            for rule in self.children:
                if not rule(state):
                    return False
            return True

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
            for i, child in enumerate(self.children):
                if i > 0:
                    messages.append({"type": "text", "text": " & "})
                messages.extend(child.explain_json(state))
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            clauses = " & ".join([c.explain_str(state) for c in self.children])
            return f"({clauses})"

        @override
        def __str__(self) -> str:
            clauses = " & ".join([str(c) for c in self.children])
            return f"({clauses})"


@dataclasses.dataclass(init=False)
class Or(NestedRule[TWorld], game="Archipelago"):
    """A rule that returns true when any child rule evaluates as true"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        children_to_process = [c.resolve(world) for c in self.children]
        clauses: list[Rule.Resolved] = []
        items: dict[str, int] = {}

        while children_to_process:
            child = children_to_process.pop(0)
            if child.always_true:
                return child
            if child.always_false:
                continue
            if isinstance(child, Or.Resolved):
                children_to_process.extend(child.children)
                continue
            if isinstance(child, Has.Resolved) and isinstance(child.count, int):
                if child.item_name not in items or child.count < items[child.item_name]:
                    items[child.item_name] = child.count
            elif isinstance(child, HasAny.Resolved):
                for item in child.item_names:
                    items[item] = 1
            elif isinstance(child, HasAnyCount.Resolved):
                for item, count in child.item_counts:
                    if item not in items or count < items[item]:
                        items[item] = count
            else:
                clauses.append(child)

        if not clauses and not items:
            return False_().resolve(world)

        caching = getattr(world, "rule_caching_enabled", False)
        if len(items) == 1:
            item, count = next(iter(items.items()))
            clauses.append(Has(item, count).resolve(world))
        elif items and all(count == 1 for count in items.values()):
            clauses.append(HasAny(*items).resolve(world))
        elif items:
            clauses.append(HasAnyCount(items).resolve(world))

        if len(clauses) == 1:
            return clauses[0]
        return Or.Resolved(tuple(clauses), player=world.player, caching_enabled=caching)

    class Resolved(NestedRule.Resolved):
        @override
        def _evaluate(self, state: CollectionState) -> bool:
            for rule in self.children:
                if rule(state):
                    return True
            return False

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]
            for i, child in enumerate(self.children):
                if i > 0:
                    messages.append({"type": "text", "text": " | "})
                messages.extend(child.explain_json(state))
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            clauses = " | ".join([c.explain_str(state) for c in self.children])
            return f"({clauses})"

        @override
        def __str__(self) -> str:
            clauses = " | ".join([str(c) for c in self.children])
            return f"({clauses})"


@dataclasses.dataclass()
class WrapperRule(Rule[TWorld], game="Archipelago"):
    """A base rule class that wraps another rule to provide extra logic or data"""

    child: Rule[TWorld]
    """The child rule being wrapped"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            world.resolve_rule(self.child),
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def to_dict(self) -> dict[str, Any]:
        data = super().to_dict()
        del data["args"]
        data["child"] = self.child.to_dict()
        return data

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        child = data.get("child")
        if child is None:
            raise ValueError("Child rule cannot be None")
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(world_cls.rule_from_dict(child), options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        return f"{self.__class__.__name__}[{self.child}]"

    class Resolved(Rule.Resolved):
        child: Rule.Resolved

        def __post_init__(self) -> None:
            object.__setattr__(self, "force_recalculate", self.force_recalculate or self.child.force_recalculate)
            super().__post_init__()

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return self.child(state)

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for item_name, rules in self.child.item_dependencies().items():
                deps[item_name] = {id(self), *rules}
            return deps

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for region_name, rules in self.child.region_dependencies().items():
                deps[region_name] = {id(self), *rules}
            return deps

        @override
        def location_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for location_name, rules in self.child.location_dependencies().items():
                deps[location_name] = {id(self), *rules}
            return deps

        @override
        def entrance_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for entrance_name, rules in self.child.entrance_dependencies().items():
                deps[entrance_name] = {id(self), *rules}
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": f"{self.rule_name} ["}]
            messages.extend(self.child.explain_json(state))
            messages.append({"type": "text", "text": "]"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            return f"{self.rule_name}[{self.child.explain_str(state)}]"

        @override
        def to_dict(self) -> dict[str, Any]:
            """Override to serialize child instead of args."""
            return {
                "rule": self._rule_class_name,
                "child": self.child.to_dict(),
            }

        @override
        def __str__(self) -> str:
            return f"{self.rule_name}[{self.child}]"


@dataclasses.dataclass()
class Filtered(WrapperRule[TWorld], game="Archipelago"):
    """A convenience rule to wrap an existing rule with an options filter"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return world.resolve_rule(self.child)


@dataclasses.dataclass()
class Has(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least `count` of a given item.

    The count can be a static integer or a Rule that evaluates to an integer at runtime.
    """

    item_name: str
    """The item to check for"""

    count: "int | Rule[TWorld]" = 1
    """The count the player is required to have. Can be a Rule for dynamic counts."""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        # Resolve count if it's a Rule
        resolved_count: "int | Rule.Resolved"
        if isinstance(self.count, Rule):
            resolved_count = self.count._instantiate(world)
        else:
            resolved_count = self.count

        return self.Resolved(
            self.item_name,
            resolved_count,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        # Handle both static and Rule counts
        if isinstance(self.count, Rule):
            count = f", count={self.count}"
        elif self.count > 1:
            count = f", count={self.count}"
        else:
            count = ""
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.item_name}{count}{options})"

    @override
    def to_dict(self) -> dict[str, Any]:
        """Returns a JSON compatible dict, omitting count when it equals 1."""
        result: dict[str, Any] = {"rule": self.__class__.__qualname__}
        result["options"] = [o.to_dict() for o in self.options]
        result["filtered_resolution"] = self.filtered_resolution
        args: dict[str, Any] = {"item_name": self.item_name}
        # Handle both static and Rule counts
        if isinstance(self.count, Rule):
            args["count"] = self.count.to_dict()
        elif self.count != 1:
            args["count"] = self.count
        result["args"] = args
        return result

    class Resolved(Rule.Resolved):
        item_name: str
        count: "int | Rule.Resolved" = 1
        skip_cache: ClassVar[bool] = True

        def _get_count_value(self, state: CollectionState) -> int | float:
            """Get the count value, evaluating if it's a Rule.Resolved."""
            if isinstance(self.count, Rule.Resolved):
                # Check for get_value or get_count methods
                if hasattr(self.count, 'get_value'):
                    return self.count.get_value(state)
                if hasattr(self.count, 'get_count'):
                    return self.count.get_count(state)
                # Otherwise evaluate as boolean and convert to int
                return int(self.count(state))
            return self.count

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has
            count_val = self._get_count_value(state)
            return state.prog_items[self.player][self.item_name] >= count_val

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {self.item_name: set()}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            verb = "Missing " if state and not self(state) else "Has "
            messages: list[JSONMessagePart] = [{"type": "text", "text": verb}]
            # Handle both static and dynamic counts
            if isinstance(self.count, Rule.Resolved):
                count_val = self._get_count_value(state) if state else None
                if count_val is not None and count_val > 1:
                    messages.append({"type": "color", "color": "cyan", "text": str(count_val)})
                    messages.append({"type": "text", "text": "x "})
            elif self.count > 1:
                messages.append({"type": "color", "color": "cyan", "text": str(self.count)})
                messages.append({"type": "text", "text": "x "})
            if state:
                color = "green" if self(state) else "salmon"
                messages.append({"type": "color", "color": color, "text": self.item_name})
            else:
                messages.append({"type": "item_name", "flags": 0b001, "text": self.item_name, "player": self.player})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            prefix = "Has" if self(state) else "Missing"
            # Handle both static and dynamic counts
            if isinstance(self.count, Rule.Resolved):
                count_val = self._get_count_value(state)
                count = f"{count_val}x " if count_val > 1 else ""
            else:
                count = f"{self.count}x " if self.count > 1 else ""
            return f"{prefix} {count}{self.item_name}"

        @override
        def __str__(self) -> str:
            # Handle both static and dynamic counts
            if isinstance(self.count, Rule.Resolved):
                count = f"({self.count})x "
            elif self.count > 1:
                count = f"{self.count}x "
            else:
                count = ""
            return f"Has {count}{self.item_name}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            # Only include count if it's not the default (1)
            args: dict[str, Any] = {"item_name": self.item_name}
            # Handle both static and dynamic counts
            if isinstance(self.count, Rule.Resolved):
                # Serialize the count rule as a dict for JSON export
                args["count"] = self.count.to_dict()
            elif self.count != 1:
                args["count"] = self.count
            return args


@dataclasses.dataclass(init=False)
class HasAll(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has all of the given items"""

    item_names: tuple[str, ...]
    """A tuple of item names to check for"""

    def __init__(self, *item_names: str, options: Iterable[OptionFilter] = (), filtered_resolution: bool = False) -> None:
        super().__init__(options=options, filtered_resolution=filtered_resolution)
        self.item_names = tuple(sorted(set(item_names)))

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_names) == 0:
            # match state.has_all
            return world.true_rule
        if len(self.item_names) == 1:
            return Has(self.item_names[0]).resolve(world)
        return self.Resolved(self.item_names, player=world.player, caching_enabled=getattr(world, "rule_caching_enabled", False))

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        args = {**data.get("args", {})}
        item_names = args.pop("item_names", ())
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*item_names, **args, options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        items = ", ".join(self.item_names)
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}{options})"

    class Resolved(Rule.Resolved):
        item_names: tuple[str, ...]

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_all
            player_prog_items = state.prog_items[self.player]
            for item in self.item_names:
                if not player_prog_items[item]:
                    return False
            return True

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": "all"},
                    {"type": "text", "text": " of ("},
                ]
                for i, item in enumerate(self.item_names):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                messages.append({"type": "text", "text": ")"})
                return messages

            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            messages = [
                {"type": "text", "text": "Has " if not missing else "Missing "},
                {"type": "color", "color": "cyan", "text": "all" if not missing else "some"},
                {"type": "text", "text": " of ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, item in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, item in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            prefix = "Has all" if self(state) else "Missing some"
            found_str = f"Found: {', '.join(found)}" if found else ""
            missing_str = f"Missing: {', '.join(missing)}" if missing else ""
            infix = "; " if found and missing else ""
            return f"{prefix} of ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join(self.item_names)
            return f"Has all of ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": list(self.item_names)}


@dataclasses.dataclass(init=False)
class HasAny(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least one of the given items"""

    item_names: tuple[str, ...]
    """A tuple of item names to check for"""

    def __init__(self, *item_names: str, options: Iterable[OptionFilter] = (), filtered_resolution: bool = False) -> None:
        super().__init__(options=options, filtered_resolution=filtered_resolution)
        self.item_names = tuple(sorted(set(item_names)))

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_names) == 0:
            # match state.has_any
            return getattr(world, "false_rule", None) or False_().resolve(world)
        if len(self.item_names) == 1:
            return Has(self.item_names[0]).resolve(world)
        return self.Resolved(self.item_names, player=world.player, caching_enabled=getattr(world, "rule_caching_enabled", False))

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        args = {**data.get("args", {})}
        item_names = args.pop("item_names", ())
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*item_names, **args, options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        items = ", ".join(self.item_names)
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}{options})"

    class Resolved(Rule.Resolved):
        item_names: tuple[str, ...]

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_any
            player_prog_items = state.prog_items[self.player]
            for item in self.item_names:
                if player_prog_items[item]:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": "any"},
                    {"type": "text", "text": " of ("},
                ]
                for i, item in enumerate(self.item_names):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                messages.append({"type": "text", "text": ")"})
                return messages

            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            messages = [
                {"type": "text", "text": "Has " if found else "Missing "},
                {"type": "color", "color": "cyan", "text": "some" if found else "all"},
                {"type": "text", "text": " of ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, item in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, item in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            prefix = "Has some" if self(state) else "Missing all"
            found_str = f"Found: {', '.join(found)}" if found else ""
            missing_str = f"Missing: {', '.join(missing)}" if missing else ""
            infix = "; " if found and missing else ""
            return f"{prefix} of ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join(self.item_names)
            return f"Has any of ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": list(self.item_names)}


@dataclasses.dataclass()
class HasAllCounts(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has all of the specified counts of the given items"""

    item_counts: dict[str, int]
    """A mapping of item name to count to check for"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_counts) == 0:
            # match state.has_all_counts
            return world.true_rule
        if len(self.item_counts) == 1:
            item = next(iter(self.item_counts))
            return Has(item, self.item_counts[item]).resolve(world)
        return self.Resolved(
            tuple(self.item_counts.items()),
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        items = ", ".join([f"{item} x{count}" for item, count in self.item_counts.items()])
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}{options})"

    class Resolved(Rule.Resolved):
        item_counts: tuple[tuple[str, int], ...]

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_all_counts
            player_prog_items = state.prog_items[self.player]
            for item, count in self.item_counts:
                if player_prog_items[item] < count:
                    return False
            return True

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item, _ in self.item_counts}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": "all"},
                    {"type": "text", "text": " of ("},
                ]
                for i, (item, count) in enumerate(self.item_counts):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                    messages.append({"type": "text", "text": f" x{count}"})
                messages.append({"type": "text", "text": ")"})
                return messages

            found = [(item, count) for item, count in self.item_counts if state.has(item, self.player, count)]
            missing = [(item, count) for item, count in self.item_counts if (item, count) not in found]
            messages = [
                {"type": "text", "text": "Has " if not missing else "Missing "},
                {"type": "color", "color": "cyan", "text": "all" if not missing else "some"},
                {"type": "text", "text": " of ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, (item, count) in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                    messages.append({"type": "text", "text": f" x{count}"})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, (item, count) in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
                    messages.append({"type": "text", "text": f" x{count}"})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found = [(item, count) for item, count in self.item_counts if state.has(item, self.player, count)]
            missing = [(item, count) for item, count in self.item_counts if (item, count) not in found]
            prefix = "Has all" if self(state) else "Missing some"
            found_str = f"Found: {', '.join([f'{item} x{count}' for item, count in found])}" if found else ""
            missing_str = f"Missing: {', '.join([f'{item} x{count}' for item, count in missing])}" if missing else ""
            infix = "; " if found and missing else ""
            return f"{prefix} of ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join([f"{item} x{count}" for item, count in self.item_counts])
            return f"Has all of ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": dict(self.item_counts)}


@dataclasses.dataclass()
class HasAnyCount(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has any of the specified counts of the given items"""

    item_counts: dict[str, int]
    """A mapping of item name to count to check for"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_counts) == 0:
            # match state.has_any_count
            return getattr(world, "false_rule", None) or False_().resolve(world)
        if len(self.item_counts) == 1:
            item = next(iter(self.item_counts))
            return Has(item, self.item_counts[item]).resolve(world)
        return self.Resolved(
            tuple(self.item_counts.items()),
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        items = ", ".join([f"{item} x{count}" for item, count in self.item_counts.items()])
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}{options})"

    class Resolved(Rule.Resolved):
        item_counts: tuple[tuple[str, int], ...]

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_any_count
            player_prog_items = state.prog_items[self.player]
            for item, count in self.item_counts:
                if player_prog_items[item] >= count:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item, _ in self.item_counts}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": "any"},
                    {"type": "text", "text": " of ("},
                ]
                for i, (item, count) in enumerate(self.item_counts):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                    messages.append({"type": "text", "text": f" x{count}"})
                messages.append({"type": "text", "text": ")"})
                return messages

            found = [(item, count) for item, count in self.item_counts if state.has(item, self.player, count)]
            missing = [(item, count) for item, count in self.item_counts if (item, count) not in found]
            messages = [
                {"type": "text", "text": "Has " if found else "Missing "},
                {"type": "color", "color": "cyan", "text": "some" if found else "all"},
                {"type": "text", "text": " of ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, (item, count) in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                    messages.append({"type": "text", "text": f" x{count}"})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, (item, count) in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
                    messages.append({"type": "text", "text": f" x{count}"})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found = [(item, count) for item, count in self.item_counts if state.has(item, self.player, count)]
            missing = [(item, count) for item, count in self.item_counts if (item, count) not in found]
            prefix = "Has some" if self(state) else "Missing all"
            found_str = f"Found: {', '.join([f'{item} x{count}' for item, count in found])}" if found else ""
            missing_str = f"Missing: {', '.join([f'{item} x{count}' for item, count in missing])}" if missing else ""
            infix = "; " if found and missing else ""
            return f"{prefix} of ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join([f"{item} x{count}" for item, count in self.item_counts])
            return f"Has any of ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": dict(self.item_counts)}


@dataclasses.dataclass(init=False)
class HasFromList(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least `count` of the given items"""

    item_names: tuple[str, ...]
    """A tuple of item names to check for"""

    count: int = 1
    """The number of items the player needs to have"""

    def __init__(self, *item_names: str, count: int = 1, options: Iterable[OptionFilter] = (), filtered_resolution: bool = False) -> None:
        super().__init__(options=options, filtered_resolution=filtered_resolution)
        self.item_names = tuple(sorted(set(item_names)))
        self.count = count

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_names) == 0:
            # match state.has_from_list
            return getattr(world, "false_rule", None) or False_().resolve(world)
        if len(self.item_names) == 1:
            return Has(self.item_names[0], self.count).resolve(world)
        return self.Resolved(
            self.item_names,
            self.count,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        args = {**data.get("args", {})}
        item_names = args.pop("item_names", ())
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*item_names, **args, options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        items = ", ".join(self.item_names)
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}, count={self.count}{options})"

    class Resolved(Rule.Resolved):
        item_names: tuple[str, ...]
        count: int = 1

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_from_list
            found = 0
            player_prog_items = state.prog_items[self.player]
            for item_name in self.item_names:
                found += player_prog_items[item_name]
                if found >= self.count:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": str(self.count)},
                    {"type": "text", "text": "x items from ("},
                ]
                for i, item in enumerate(self.item_names):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                messages.append({"type": "text", "text": ")"})
                return messages

            found_count = state.count_from_list(self.item_names, self.player)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            color = "green" if found_count >= self.count else "salmon"
            messages = [
                {"type": "text", "text": "Has "},
                {
                    "type": "color",
                    "color": color,
                    "text": f"{found_count}/{self.count}",
                },
                {"type": "text", "text": " items from ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, item in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, item in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found_count = state.count_from_list(self.item_names, self.player)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            found_str = f"Found: {', '.join(found)}" if found else ""
            missing_str = f"Missing: {', '.join(missing)}" if missing else ""
            infix = "; " if found and missing else ""
            return f"Has {found_count}/{self.count} items from ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join(self.item_names)
            count = f"{self.count}x items" if self.count > 1 else "an item"
            return f"Has {count} from ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": list(self.item_names), "count": self.count}


@dataclasses.dataclass(init=False)
class HasFromListUnique(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least `count` of the given items, ignoring duplicates of the same item"""

    item_names: tuple[str, ...]
    """A tuple of item names to check for"""

    count: int = 1
    """The number of items the player needs to have"""

    def __init__(self, *item_names: str, count: int = 1, options: Iterable[OptionFilter] = (), filtered_resolution: bool = False) -> None:
        super().__init__(options=options, filtered_resolution=filtered_resolution)
        self.item_names = tuple(sorted(set(item_names)))
        self.count = count

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        if len(self.item_names) == 0 or len(self.item_names) < self.count:
            # match state.has_from_list_unique
            return getattr(world, "false_rule", None) or False_().resolve(world)
        if len(self.item_names) == 1:
            return Has(self.item_names[0]).resolve(world)
        return self.Resolved(
            self.item_names,
            self.count,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        args = {**data.get("args", {})}
        item_names = args.pop("item_names", ())
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*item_names, **args, options=options, filtered_resolution=data.get("filtered_resolution", False))

    @override
    def __str__(self) -> str:
        items = ", ".join(self.item_names)
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({items}, count={self.count}{options})"

    class Resolved(Rule.Resolved):
        item_names: tuple[str, ...]
        count: int = 1

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_from_list_unique
            found = 0
            player_prog_items = state.prog_items[self.player]
            for item_name in self.item_names:
                found += player_prog_items[item_name] > 0
                if found >= self.count:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is None:
                messages = [
                    {"type": "text", "text": "Has "},
                    {"type": "color", "color": "cyan", "text": str(self.count)},
                    {"type": "text", "text": "x unique items from ("},
                ]
                for i, item in enumerate(self.item_names):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "item_name", "flags": 0b001, "text": item, "player": self.player})
                messages.append({"type": "text", "text": ")"})
                return messages

            found_count = state.count_from_list_unique(self.item_names, self.player)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            color = "green" if found_count >= self.count else "salmon"
            messages = [
                {"type": "text", "text": "Has "},
                {"type": "color", "color": color, "text": f"{found_count}/{self.count}"},
                {"type": "text", "text": " unique items from ("},
            ]
            if found:
                messages.append({"type": "text", "text": "Found: "})
                for i, item in enumerate(found):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "green", "text": item})
                if missing:
                    messages.append({"type": "text", "text": "; "})

            if missing:
                messages.append({"type": "text", "text": "Missing: "})
                for i, item in enumerate(missing):
                    if i > 0:
                        messages.append({"type": "text", "text": ", "})
                    messages.append({"type": "color", "color": "salmon", "text": item})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            found_count = state.count_from_list_unique(self.item_names, self.player)
            found = [item for item in self.item_names if state.has(item, self.player)]
            missing = [item for item in self.item_names if item not in found]
            found_str = f"Found: {', '.join(found)}" if found else ""
            missing_str = f"Missing: {', '.join(missing)}" if missing else ""
            infix = "; " if found and missing else ""
            return f"Has {found_count}/{self.count} unique items from ({found_str}{infix}{missing_str})"

        @override
        def __str__(self) -> str:
            items = ", ".join(self.item_names)
            count = f"{self.count}x unique items" if self.count > 1 else "a unique item"
            return f"Has {count} from ({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"items": list(self.item_names), "count": self.count}


@dataclasses.dataclass()
class HasGroup(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least `count` of the items present in the specified item group"""

    item_name_group: str
    """The name of the item group containing the items"""

    count: int = 1
    """The number of items the player needs to have"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        item_names = tuple(sorted(world.item_name_groups[self.item_name_group]))
        return self.Resolved(
            self.item_name_group,
            item_names,
            self.count,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        count = f", count={self.count}" if self.count > 1 else ""
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.item_name_group}{count}{options})"

    class Resolved(Rule.Resolved):
        item_name_group: str
        item_names: tuple[str, ...]
        count: int = 1

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_group
            found = 0
            player_prog_items = state.prog_items[self.player]
            for item_name in self.item_names:
                found += player_prog_items[item_name]
                if found >= self.count:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "Has "}]
            if state is None:
                messages.append({"type": "color", "color": "cyan", "text": str(self.count)})
            else:
                count = state.count_group(self.item_name_group, self.player)
                color = "green" if count >= self.count else "salmon"
                messages.append({"type": "color", "color": color, "text": f"{count}/{self.count}"})
            messages.append({"type": "text", "text": " items from "})
            messages.append({"type": "color", "color": "cyan", "text": self.item_name_group})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            count = state.count_group(self.item_name_group, self.player)
            return f"Has {count}/{self.count} items from {self.item_name_group}"

        @override
        def __str__(self) -> str:
            count = f"{self.count}x items" if self.count > 1 else "an item"
            return f"Has {count} from {self.item_name_group}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"group": self.item_name_group, "count": self.count}


@dataclasses.dataclass()
class HasGroupUnique(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the player has at least `count` of the items present
    in the specified item group, ignoring duplicates of the same item"""

    item_name_group: str
    """The name of the item group containing the items"""

    count: int = 1
    """The number of items the player needs to have"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        item_names = tuple(sorted(world.item_name_groups[self.item_name_group]))
        return self.Resolved(
            self.item_name_group,
            item_names,
            self.count,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        count = f", count={self.count}" if self.count > 1 else ""
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.item_name_group}{count}{options})"

    class Resolved(Rule.Resolved):
        item_name_group: str
        item_names: tuple[str, ...]
        count: int = 1

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # implementation based on state.has_group_unique
            found = 0
            player_prog_items = state.prog_items[self.player]
            for item_name in self.item_names:
                found += player_prog_items[item_name] > 0
                if found >= self.count:
                    return True
            return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "Has "}]
            if state is None:
                messages.append({"type": "color", "color": "cyan", "text": str(self.count)})
            else:
                count = state.count_group_unique(self.item_name_group, self.player)
                color = "green" if count >= self.count else "salmon"
                messages.append({"type": "color", "color": color, "text": f"{count}/{self.count}"})
            messages.append({"type": "text", "text": " unique items from "})
            messages.append({"type": "color", "color": "cyan", "text": self.item_name_group})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            count = state.count_group_unique(self.item_name_group, self.player)
            return f"Has {count}/{self.count} unique items from {self.item_name_group}"

        @override
        def __str__(self) -> str:
            count = f"{self.count}x unique items" if self.count > 1 else "a unique item"
            return f"Has {count} from {self.item_name_group}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"group": self.item_name_group, "count": self.count}


@dataclasses.dataclass()
class CanReachLocation(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the given location is reachable by the current player"""

    location_name: str
    """The name of the location to test access to"""

    parent_region_name: str = ""
    """The name of the location's parent region. If not specified it will be resolved when the rule is resolved"""

    skip_indirect_connection: bool = False
    """Skip finding the location's parent region.
    Do not use this if this rule is for an entrance and explicit_indirect_conditions is True
    """

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        parent_region_name = self.parent_region_name
        if not parent_region_name and not self.skip_indirect_connection:
            location = world.get_location(self.location_name)
            if not location.parent_region:
                raise ValueError(f"Location {location.name} has no parent region")
            parent_region_name = location.parent_region.name
        return self.Resolved(
            self.location_name,
            parent_region_name,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.location_name}{options})"

    class Resolved(Rule.Resolved):
        location_name: str
        parent_region_name: str

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return state.can_reach_location(self.location_name, self.player)

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            if self.parent_region_name:
                return {self.parent_region_name: {id(self)}}
            return {}

        @override
        def location_dependencies(self) -> dict[str, set[int]]:
            return {self.location_name: {id(self)}}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state is None:
                verb = "Can reach"
            elif self(state):
                verb = "Reached"
            else:
                verb = "Cannot reach"
            return [
                {"type": "text", "text": f"{verb} location "},
                {"type": "location_name", "text": self.location_name, "player": self.player},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            prefix = "Reached" if self(state) else "Cannot reach"
            return f"{prefix} location {self.location_name}"

        @override
        def __str__(self) -> str:
            return f"Can reach location {self.location_name}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"location_name": self.location_name}


@dataclasses.dataclass()
class CanReachRegion(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the given region is reachable by the current player"""

    region_name: str
    """The name of the region to test access to"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(self.region_name, player=world.player, caching_enabled=getattr(world, "rule_caching_enabled", False))

    @override
    def __str__(self) -> str:
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.region_name}{options})"

    class Resolved(Rule.Resolved):
        region_name: str

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return state.can_reach_region(self.region_name, self.player)

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            return {self.region_name: {id(self)}}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state is None:
                verb = "Can reach"
            elif self(state):
                verb = "Reached"
            else:
                verb = "Cannot reach"
            return [
                {"type": "text", "text": f"{verb} region "},
                {"type": "color", "color": "yellow", "text": self.region_name},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            prefix = "Reached" if self(state) else "Cannot reach"
            return f"{prefix} region {self.region_name}"

        @override
        def __str__(self) -> str:
            return f"Can reach region {self.region_name}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"region_name": self.region_name}


@dataclasses.dataclass()
class CanReachEntrance(Rule[TWorld], game="Archipelago"):
    """A rule that checks if the given entrance is reachable by the current player"""

    entrance_name: str
    """The name of the entrance to test access to"""

    parent_region_name: str = ""
    """The name of the entrance's parent region. If not specified it will be resolved when the rule is resolved"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        parent_region_name = self.parent_region_name
        if not parent_region_name:
            entrance = world.get_entrance(self.entrance_name)
            if not entrance.parent_region:
                raise ValueError(f"Entrance {entrance.name} has no parent region")
            parent_region_name = entrance.parent_region.name
        return self.Resolved(
            self.entrance_name,
            parent_region_name,
            player=world.player,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        options = f", options={self.options}" if self.options else ""
        return f"{self.__class__.__name__}({self.entrance_name}{options})"

    class Resolved(Rule.Resolved):
        entrance_name: str
        parent_region_name: str

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return state.can_reach_entrance(self.entrance_name, self.player)

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            if self.parent_region_name:
                return {self.parent_region_name: {id(self)}}
            return {}

        @override
        def entrance_dependencies(self) -> dict[str, set[int]]:
            return {self.entrance_name: {id(self)}}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state is None:
                verb = "Can reach"
            elif self(state):
                verb = "Reached"
            else:
                verb = "Cannot reach"
            return [
                {"type": "text", "text": f"{verb} entrance "},
                {"type": "entrance_name", "text": self.entrance_name, "player": self.player},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is None:
                return str(self)
            prefix = "Reached" if self(state) else "Cannot reach"
            return f"{prefix} entrance {self.entrance_name}"

        @override
        def __str__(self) -> str:
            return f"Can reach entrance {self.entrance_name}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"entrance_name": self.entrance_name}


@dataclasses.dataclass()
class EntranceAccessRuleCall(Rule[TWorld], game="Archipelago"):
    """A rule that evaluates an entrance's access_rule.

    This is used for ALttP underworld glitch rules where dungeon_entrance.access_rule()
    is called, potentially with a fake pearl state. The entrance is looked up by name
    and its access_rule is evaluated.

    When fake_pearl is True, Moon Pearl is temporarily added to the state before
    evaluating the access rule. This simulates the "fake_pearl_state" function from
    ALttP UnderworldGlitchRules.py.
    """

    entrance_name: str
    """The name of the entrance whose access_rule to evaluate"""

    fake_pearl: bool = False
    """If True, evaluate the rule as if the player has Moon Pearl"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.entrance_name,
            self.fake_pearl,
            player=world.player,
            multiworld=world.multiworld,
            caching_enabled=getattr(world, "rule_caching_enabled", False),
        )

    @override
    def __str__(self) -> str:
        fp = ", fake_pearl=True" if self.fake_pearl else ""
        return f"{self.__class__.__name__}({self.entrance_name!r}{fp})"

    class Resolved(Rule.Resolved):
        entrance_name: str
        fake_pearl: bool
        multiworld: Any  # MultiWorld

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            try:
                entrance = self.multiworld.get_entrance(self.entrance_name, self.player)
            except KeyError:
                # Entrance not found - conservatively return True
                return True

            eval_state = state
            if self.fake_pearl:
                # Create a fake state with Moon Pearl
                if not state.has('Moon Pearl', self.player):
                    eval_state = state.copy()
                    eval_state.prog_items[self.player]['Moon Pearl'] += 1

            # Evaluate the entrance's access_rule
            return entrance.access_rule(eval_state)

        @override
        def entrance_dependencies(self) -> dict[str, set[int]]:
            return {self.entrance_name: {id(self)}}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            fp_text = " (with fake pearl)" if self.fake_pearl else ""
            if state is None:
                verb = "Can access"
            elif self(state):
                verb = "Can access"
            else:
                verb = "Cannot access"
            return [
                {"type": "text", "text": f"{verb} entrance "},
                {"type": "entrance_name", "text": self.entrance_name, "player": self.player},
                {"type": "text", "text": f" access rule{fp_text}"},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            fp_text = " (with fake pearl)" if self.fake_pearl else ""
            if state is None:
                return str(self)
            prefix = "Can access" if self(state) else "Cannot access"
            return f"{prefix} entrance {self.entrance_name} access rule{fp_text}"

        @override
        def __str__(self) -> str:
            fp_text = " (with fake pearl)" if self.fake_pearl else ""
            return f"Entrance {self.entrance_name} access rule{fp_text}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            result: dict[str, Any] = {"entrance_name": self.entrance_name}
            if self.fake_pearl:
                result["fake_pearl"] = True
            return result


# =============================================================================
# AST Format Support Classes
# =============================================================================


@dataclasses.dataclass()
class ASTRule(Rule[TWorld], game="Archipelago"):
    """
    Wraps an AST format rule that can't be converted to a native Rule Builder class.

    This class provides explain support for complex AST format rules while
    delegating evaluation to either a pre-computed value or returning True
    as a fallback.
    """
    rule_data: dict[str, Any] = dataclasses.field(default_factory=lambda: dict[str, Any]())
    """The original AST format rule data"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.rule_data,
            player=world.player,
            caching_enabled=False,  # Bypass caching for AST rules
        )

    @override
    def __str__(self) -> str:
        rule_type = self.rule_data.get('type', 'unknown')
        return f"ASTRule({rule_type})"

    class Resolved(Rule.Resolved):
        rule_data: dict[str, Any]
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # AST rules currently return True as fallback
            # Future enhancement: implement AST rule evaluation
            return True

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            from rule_builder.ast_explain import explain_ast_rule
            return explain_ast_rule(self.rule_data, state, self.player)

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            rule_type = self.rule_data.get('type', 'unknown')
            return f"[AST:{rule_type}]"

        @override
        def __str__(self) -> str:
            rule_type = self.rule_data.get('type', 'unknown')
            return f"ASTRule({rule_type})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"rule_data": self.rule_data}


@dataclasses.dataclass()
class Not(WrapperRule[TWorld], game="Archipelago"):
    """
    Logical negation of a rule.

    Usage:
        rule = Not(Has("Sword"))  # True if player doesn't have Sword
    """

    @override
    def __str__(self) -> str:
        return f"NOT ({self.child})"

    class Resolved(WrapperRule.Resolved):
        @override
        def _evaluate(self, state: CollectionState) -> bool:
            return not self.child(state)

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "NOT ("}]
            messages.extend(self.child.explain_json(state))
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            return f"NOT ({self.child.explain_str(state)})"

        @override
        def __str__(self) -> str:
            return f"NOT ({self.child})"


@dataclasses.dataclass()
class CountItem(Rule[TWorld], game="Archipelago"):
    """
    Returns the count of an item.

    When used as a boolean (in _evaluate), returns True if count > 0.
    Also provides get_count() for use in comparisons.

    Usage:
        rule = CountItem("Key")  # True if player has at least 1 Key
    """
    item_name: str = ""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.item_name,
            player=world.player,
            caching_enabled=False,  # Count can change frequently
        )

    @override
    def __str__(self) -> str:
        return f"Count({self.item_name})"

    class Resolved(Rule.Resolved):
        item_name: str
        skip_cache: ClassVar[bool] = True

        @override
        def get_count(self, state: CollectionState) -> int:
            """Get the actual count of this item."""
            return state.count(self.item_name, self.player)

        @override
        def get_value(self, state: CollectionState) -> int:
            """Get the numeric value (count) for use in Compare/Arithmetic contexts."""
            return self.get_count(state)

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if count > 0
            return self.get_count(state) > 0

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {self.item_name: {id(self)}}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state is not None:
                count = self.get_count(state)
                return [
                    {"type": "text", "text": "Count("},
                    {"type": "item_name", "text": self.item_name, "player": self.player, "flags": 0},
                    {"type": "text", "text": f"): {count}"},
                ]
            return [
                {"type": "text", "text": "Count("},
                {"type": "item_name", "text": self.item_name, "player": self.player, "flags": 0},
                {"type": "text", "text": ")"},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is not None:
                return f"Count({self.item_name}): {self.get_count(state)}"
            return f"Count({self.item_name})"

        @override
        def __str__(self) -> str:
            return f"Count({self.item_name})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"item_name": self.item_name}


@dataclasses.dataclass(init=False)
class CountFromList(Rule[TWorld], game="Archipelago"):
    """
    Returns the cumulative count of items from a list.

    This is the Rule Builder equivalent of state.count_from_list().
    For a list like ["Key", "Key", "Door"], if the player has 2 Keys and 1 Door,
    the count would be 2 + 2 + 1 = 5 (each occurrence in the list is counted).

    When used as a boolean (in _evaluate), returns True if count > 0.
    Also provides get_count() for use in comparisons.

    Usage:
        rule = CountFromList("Key", "Door", "Key")  # counts Key twice, Door once
    """
    item_names: tuple[str, ...] = ()

    def __init__(self, *item_names: str, options: OptionFilter | tuple[OptionFilter, ...] = ()):
        if isinstance(options, OptionFilter):
            options = (options,)
        super().__init__(options=options)
        self.item_names = item_names

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.item_names,
            player=world.player,
            caching_enabled=False,  # Count can change frequently
        )

    @override
    @classmethod
    def from_dict(cls, data: Mapping[str, Any], world_cls: "type[World]") -> Self:
        args = {**data.get("args", {})}
        item_names = args.pop("item_names", ())
        options = OptionFilter.multiple_from_dict(data.get("options", ()))
        return cls(*item_names, **args, options=options)

    @override
    def __str__(self) -> str:
        items = ", ".join(self.item_names)
        return f"CountFromList({items})"

    class Resolved(Rule.Resolved):
        item_names: tuple[str, ...]
        skip_cache: ClassVar[bool] = True

        @override
        def get_count(self, state: CollectionState) -> int:
            """Get the cumulative count of all items in the list."""
            return state.count_from_list(self.item_names, self.player)

        @override
        def get_value(self, state: CollectionState) -> int:
            """Get the numeric value (count) for use in Compare/Arithmetic contexts."""
            return self.get_count(state)

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if count > 0
            return self.get_count(state) > 0

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item: {id(self)} for item in self.item_names}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "CountFromList("}]
            for i, item in enumerate(self.item_names):
                if i > 0:
                    messages.append({"type": "text", "text": ", "})
                messages.append({"type": "item_name", "text": item, "player": self.player, "flags": 0})
            messages.append({"type": "text", "text": ")"})
            if state is not None:
                count = self.get_count(state)
                messages.append({"type": "text", "text": f": {count}"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            items = ", ".join(self.item_names)
            if state is not None:
                return f"CountFromList({items}): {self.get_count(state)}"
            return f"CountFromList({items})"

        @override
        def __str__(self) -> str:
            items = ", ".join(self.item_names)
            return f"CountFromList({items})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"item_names": self.item_names}


@dataclasses.dataclass()
class CountGroup(Rule[TWorld], game="Archipelago"):
    """
    Returns the count of items in a named group.

    When used as a boolean (in _evaluate), returns True if count > 0.
    Also provides get_count() for use in comparisons and arithmetic.

    This rule is used to count items that belong to a named item group,
    as defined by the world's item_name_groups.

    Usage:
        rule = CountGroup("Letters")  # True if player has at least 1 item from "Letters" group
        rule = Compare(CountGroup("Keys"), ">=", 3)  # True if player has 3+ items from "Keys"
    """
    group_name: str = ""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.group_name,
            player=world.player,
            caching_enabled=False,  # Count can change frequently
        )

    @override
    def __str__(self) -> str:
        return f"CountGroup({self.group_name})"

    class Resolved(Rule.Resolved):
        group_name: str
        skip_cache: ClassVar[bool] = True

        @override
        def get_count(self, state: CollectionState) -> int:
            """Get the count of items in this group."""
            return state.count_group(self.group_name, self.player)

        @override
        def get_value(self, state: CollectionState) -> int:
            """Get the numeric value (count) for use in Compare/Arithmetic contexts."""
            return self.get_count(state)

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if count > 0
            return self.get_count(state) > 0

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            # Group dependencies are complex - items in the group may vary
            # Return empty as we can't easily determine item names from group
            return {}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state is not None:
                count = self.get_count(state)
                return [
                    {"type": "text", "text": f"CountGroup({self.group_name}): {count}"},
                ]
            return [
                {"type": "text", "text": f"CountGroup({self.group_name})"},
            ]

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is not None:
                return f"CountGroup({self.group_name}): {self.get_count(state)}"
            return f"CountGroup({self.group_name})"

        @override
        def __str__(self) -> str:
            return f"CountGroup({self.group_name})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"group_name": self.group_name}


@dataclasses.dataclass()
class Compare(Rule[TWorld], game="Archipelago"):
    """
    Comparison between two values/rules.

    Supports operators: ==, !=, <, >, <=, >=, in, not in

    Usage:
        rule = Compare(CountItem("Key"), ">=", 3)
        rule = Compare(['Item', 1], "in", [['Item', 1], ['Other', 1]])
    """
    left: "Rule[TWorld] | int | float | str" = dataclasses.field(default_factory=lambda: True_())
    op: str = "=="
    right: "Rule[TWorld] | int | float | str" = dataclasses.field(default_factory=lambda: True_())

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        # Resolve left and right if they are rules
        resolved_left: Any
        resolved_right: Any

        if isinstance(self.left, Rule):
            resolved_left = self.left._instantiate(world)
        else:
            resolved_left = self.left

        if isinstance(self.right, Rule):
            resolved_right = self.right._instantiate(world)
        else:
            resolved_right = self.right

        return self.Resolved(
            resolved_left,
            self.op,
            resolved_right,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"({self.left} {self.op} {self.right})"

    class Resolved(Rule.Resolved):
        left: Any  # Rule.Resolved or literal value
        op: str
        right: Any  # Rule.Resolved or literal value
        skip_cache: ClassVar[bool] = True

        def _get_value(self, operand: Any, state: CollectionState) -> Any:
            """Get the value of an operand."""
            if isinstance(operand, Rule.Resolved):
                # Check for get_value (Arithmetic) or get_count (CountItem)
                if hasattr(operand, 'get_value'):
                    return operand.get_value(state)
                if hasattr(operand, 'get_count'):
                    return operand.get_count(state)
                # Otherwise evaluate as boolean
                return operand(state)
            return operand

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            left_val = self._get_value(self.left, state)
            right_val = self._get_value(self.right, state)

            if self.op == '==':
                return left_val == right_val
            elif self.op == '!=':
                return left_val != right_val
            elif self.op == '<':
                return left_val < right_val
            elif self.op == '>':
                return left_val > right_val
            elif self.op == '<=':
                return left_val <= right_val
            elif self.op == '>=':
                return left_val >= right_val
            elif self.op == 'in':
                return left_val in right_val
            elif self.op == 'not in':
                return left_val not in right_val
            else:
                return False

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            if isinstance(self.left, Rule.Resolved):
                for name, ids in self.left.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            if isinstance(self.right, Rule.Resolved):
                for name, ids in self.right.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []

            # Explain left side
            if isinstance(self.left, Rule.Resolved):
                messages.extend(self.left.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.left)})

            messages.append({"type": "text", "text": f" {self.op} "})

            # Explain right side
            if isinstance(self.right, Rule.Resolved):
                messages.extend(self.right.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.right)})

            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            left_str = self.left.explain_str(state) if isinstance(self.left, Rule.Resolved) else str(self.left)
            right_str = self.right.explain_str(state) if isinstance(self.right, Rule.Resolved) else str(self.right)
            return f"({left_str} {self.op} {right_str})"

        @override
        def __str__(self) -> str:
            return f"({self.left} {self.op} {self.right})"

        def _serialize_operand(self, operand: Any) -> Any:
            """Serialize a compare operand for JSON export.

            Extracts raw values from simple rules (Constant, Tuple, List)
            to produce cleaner output matching the original exporter format.
            """
            if isinstance(operand, Rule.Resolved):
                # Check if this is a simple value-holding rule
                rule_name = operand._rule_class_name

                # Constant - extract the raw value
                if rule_name == 'Constant':
                    args = operand._get_args_dict()
                    return args.get('value')

                # Tuple - extract as Python tuple
                if rule_name == 'Tuple':
                    args = operand._get_args_dict()
                    value = args.get('value', args.get('elements', []))
                    return tuple(self._serialize_operand(v) for v in value)

                # List - extract as Python list
                if rule_name == 'List':
                    args = operand._get_args_dict()
                    value = args.get('value', args.get('elements', []))
                    return [self._serialize_operand(v) for v in value]

                # Complex rule - use to_dict()
                return operand.to_dict()

            # Already a primitive value
            return operand

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {
                "left": self._serialize_operand(self.left),
                "op": self.op,
                "right": self._serialize_operand(self.right)
            }


@dataclasses.dataclass()
class Arithmetic(Rule[TWorld], game="Archipelago"):
    """
    Arithmetic operation between two numeric values/rules.

    Supports operators: +, -, *, /, //, %, **

    Returns the computed numeric value via get_value().
    When used in Compare, enables expressions like:
        Compare(Arithmetic(CountItem("Puppy"), "*", 3), ">=", 10)

    Usage:
        # Puppy value calculation (each Puppy item worth 3)
        rule = Compare(Arithmetic(CountItem("Puppy"), "*", 3), ">=", 10)

        # Arrow capacity: 30 + (upgrades * 5)
        rule = Arithmetic(30, "+", Arithmetic(CountItem("Arrow +5"), "*", 5))
    """
    left: "Rule[TWorld] | int | float" = dataclasses.field(default=0)
    op: str = "+"
    right: "Rule[TWorld] | int | float" = dataclasses.field(default=0)

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        resolved_left: Any
        resolved_right: Any

        if isinstance(self.left, Rule):
            resolved_left = self.left._instantiate(world)
        else:
            resolved_left = self.left

        if isinstance(self.right, Rule):
            resolved_right = self.right._instantiate(world)
        else:
            resolved_right = self.right

        return self.Resolved(
            resolved_left,
            self.op,
            resolved_right,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"({self.left} {self.op} {self.right})"

    class Resolved(Rule.Resolved):
        left: Any  # Rule.Resolved or literal value
        op: str
        right: Any  # Rule.Resolved or literal value
        skip_cache: ClassVar[bool] = True

        def _get_operand_value(self, operand: Any, state: CollectionState) -> float | int:
            """Get the numeric value of an operand."""
            if isinstance(operand, Rule.Resolved):
                if hasattr(operand, 'get_value'):
                    return operand.get_value(state)
                if hasattr(operand, 'get_count'):
                    return operand.get_count(state)
                # Boolean rules: True=1, False=0
                return 1 if operand(state) else 0
            return operand

        @override
        def get_value(self, state: CollectionState) -> float | int:
            """Get the computed value of this arithmetic expression."""
            left_val = self._get_operand_value(self.left, state)
            right_val = self._get_operand_value(self.right, state)

            if self.op == '+':
                return left_val + right_val
            elif self.op == '-':
                return left_val - right_val
            elif self.op == '*':
                return left_val * right_val
            elif self.op == '/':
                return left_val / right_val if right_val != 0 else 0
            elif self.op == '//':
                return left_val // right_val if right_val != 0 else 0
            elif self.op == '%':
                return left_val % right_val if right_val != 0 else 0
            elif self.op == '**':
                return left_val ** right_val
            else:
                return left_val + right_val  # Default to addition

        # Alias for Compare compatibility
        get_count = get_value

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if value is truthy (non-zero)
            return bool(self.get_value(state))

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            if isinstance(self.left, Rule.Resolved):
                for name, ids in self.left.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            if isinstance(self.right, Rule.Resolved):
                for name, ids in self.right.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "("}]

            if isinstance(self.left, Rule.Resolved):
                messages.extend(self.left.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.left)})

            messages.append({"type": "text", "text": f" {self.op} "})

            if isinstance(self.right, Rule.Resolved):
                messages.extend(self.right.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.right)})

            messages.append({"type": "text", "text": ")"})

            if state is not None:
                value = self.get_value(state)
                messages.append({"type": "text", "text": f" = {value}"})

            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            left_str = self.left.explain_str(state) if isinstance(self.left, Rule.Resolved) else str(self.left)
            right_str = self.right.explain_str(state) if isinstance(self.right, Rule.Resolved) else str(self.right)
            result = f"({left_str} {self.op} {right_str})"
            if state is not None:
                result += f" = {self.get_value(state)}"
            return result

        @override
        def __str__(self) -> str:
            return f"({self.left} {self.op} {self.right})"

        def _serialize_operand(self, operand: Any) -> Any:
            """Serialize an arithmetic operand for JSON export.

            Extracts raw values from Constant rules to produce cleaner output.
            """
            if isinstance(operand, Rule.Resolved):
                rule_name = operand._rule_class_name
                if rule_name == 'Constant':
                    args = operand._get_args_dict()
                    return args.get('value')
                return operand.to_dict()
            return operand

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {
                "left": self._serialize_operand(self.left),
                "op": self.op,
                "right": self._serialize_operand(self.right)
            }


@dataclasses.dataclass()
class MinValue(Rule[TWorld], game="Archipelago"):
    """
    Returns the minimum of two numeric values/rules.

    Used in arithmetic expressions where a cap is needed.
    Returns the minimum value via get_value().

    Usage:
        # Cap item contribution at 9
        rule = MinValue(CountItem("Orichalcum"), 9)

        # Combined with Arithmetic for complex rules
        rule = Compare(
            Arithmetic(MinValue(CountItem("Orichalcum"), 9), "+", MinValue(CountItem("Mythril"), 9)),
            ">=", 15
        )
    """
    left: "Rule[TWorld] | int | float" = dataclasses.field(default=0)
    right: "Rule[TWorld] | int | float" = dataclasses.field(default=0)

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        resolved_left: Any
        resolved_right: Any

        if isinstance(self.left, Rule):
            resolved_left = self.left._instantiate(world)
        else:
            resolved_left = self.left

        if isinstance(self.right, Rule):
            resolved_right = self.right._instantiate(world)
        else:
            resolved_right = self.right

        return self.Resolved(
            resolved_left,
            resolved_right,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"min({self.left}, {self.right})"

    class Resolved(Rule.Resolved):
        left: Any  # Rule.Resolved or literal value
        right: Any  # Rule.Resolved or literal value
        skip_cache: ClassVar[bool] = True

        def _get_operand_value(self, operand: Any, state: CollectionState) -> float | int:
            """Get the numeric value of an operand."""
            if isinstance(operand, Rule.Resolved):
                if hasattr(operand, 'get_value'):
                    return operand.get_value(state)
                if hasattr(operand, 'get_count'):
                    return operand.get_count(state)
                # Boolean rules: True=1, False=0
                return 1 if operand(state) else 0
            return operand

        @override
        def get_value(self, state: CollectionState) -> float | int:
            """Get the minimum of the two operands."""
            left_val = self._get_operand_value(self.left, state)
            right_val = self._get_operand_value(self.right, state)
            return min(left_val, right_val)

        # Alias for Compare compatibility
        get_count = get_value

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if value is truthy (non-zero)
            return bool(self.get_value(state))

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            if isinstance(self.left, Rule.Resolved):
                for name, ids in self.left.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            if isinstance(self.right, Rule.Resolved):
                for name, ids in self.right.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "min("}]

            if isinstance(self.left, Rule.Resolved):
                messages.extend(self.left.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.left)})

            messages.append({"type": "text", "text": ", "})

            if isinstance(self.right, Rule.Resolved):
                messages.extend(self.right.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.right)})

            messages.append({"type": "text", "text": ")"})

            if state is not None:
                value = self.get_value(state)
                messages.append({"type": "text", "text": f" = {value}"})

            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            left_str = self.left.explain_str(state) if isinstance(self.left, Rule.Resolved) else str(self.left)
            right_str = self.right.explain_str(state) if isinstance(self.right, Rule.Resolved) else str(self.right)
            result = f"min({left_str}, {right_str})"
            if state is not None:
                result += f" = {self.get_value(state)}"
            return result

        @override
        def __str__(self) -> str:
            return f"min({self.left}, {self.right})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"left": self.left, "right": self.right}


@dataclasses.dataclass()
class MaxValue(Rule[TWorld], game="Archipelago"):
    """
    Returns the maximum of two numeric values/rules.

    Used in arithmetic expressions where the largest value is needed.
    Returns the maximum value via get_value().

    Usage:
        # Get maximum depth from multiple sources
        rule = MaxValue(seamoth_depth, cyclops_depth)

        # Combined with Arithmetic for complex rules
        rule = Compare(
            Arithmetic(swim_depth, "+", MaxValue(seamoth_depth, cyclops_depth)),
            ">=", 1444
        )
    """
    left: "Rule[TWorld] | int | float" = dataclasses.field(default=0)
    right: "Rule[TWorld] | int | float" = dataclasses.field(default=0)

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        resolved_left: Any
        resolved_right: Any

        if isinstance(self.left, Rule):
            resolved_left = self.left._instantiate(world)
        else:
            resolved_left = self.left

        if isinstance(self.right, Rule):
            resolved_right = self.right._instantiate(world)
        else:
            resolved_right = self.right

        return self.Resolved(
            resolved_left,
            resolved_right,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"max({self.left}, {self.right})"

    class Resolved(Rule.Resolved):
        left: Any  # Rule.Resolved or literal value
        right: Any  # Rule.Resolved or literal value
        skip_cache: ClassVar[bool] = True

        def _get_operand_value(self, operand: Any, state: CollectionState) -> float | int:
            """Get the numeric value of an operand."""
            if isinstance(operand, Rule.Resolved):
                if hasattr(operand, 'get_value'):
                    return operand.get_value(state)
                if hasattr(operand, 'get_count'):
                    return operand.get_count(state)
                # Boolean rules: True=1, False=0
                return 1 if operand(state) else 0
            return operand

        @override
        def get_value(self, state: CollectionState) -> float | int:
            """Get the maximum of the two operands."""
            left_val = self._get_operand_value(self.left, state)
            right_val = self._get_operand_value(self.right, state)
            return max(left_val, right_val)

        # Alias for Compare compatibility
        get_count = get_value

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # When used as boolean, true if value is truthy (non-zero)
            return bool(self.get_value(state))

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            if isinstance(self.left, Rule.Resolved):
                for name, ids in self.left.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            if isinstance(self.right, Rule.Resolved):
                for name, ids in self.right.item_dependencies().items():
                    deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "max("}]

            if isinstance(self.left, Rule.Resolved):
                messages.extend(self.left.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.left)})

            messages.append({"type": "text", "text": ", "})

            if isinstance(self.right, Rule.Resolved):
                messages.extend(self.right.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.right)})

            messages.append({"type": "text", "text": ")"})

            if state is not None:
                value = self.get_value(state)
                messages.append({"type": "text", "text": f" = {value}"})

            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            left_str = self.left.explain_str(state) if isinstance(self.left, Rule.Resolved) else str(self.left)
            right_str = self.right.explain_str(state) if isinstance(self.right, Rule.Resolved) else str(self.right)
            result = f"max({left_str}, {right_str})"
            if state is not None:
                result += f" = {self.get_value(state)}"
            return result

        @override
        def __str__(self) -> str:
            return f"max({self.left}, {self.right})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"left": self.left, "right": self.right}


@dataclasses.dataclass()
class Conditional(Rule[TWorld], game="Archipelago"):
    """
    Conditional (ternary) rule: if test then if_true else if_false.

    Usage:
        rule = Conditional(
            test=Has("Key"),
            if_true=Has("Door Open"),
            if_false=True_()
        )
    """
    test: "Rule[TWorld]" = dataclasses.field(default_factory=lambda: True_())
    if_true: "Rule[TWorld] | int | float" = dataclasses.field(default_factory=lambda: True_())
    if_false: "Rule[TWorld] | int | float" = dataclasses.field(default_factory=lambda: True_())

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        resolved_test = self.test._instantiate(world)

        # Handle if_true - can be a Rule or a numeric value
        if isinstance(self.if_true, Rule):
            resolved_if_true = self.if_true._instantiate(world)
        else:
            resolved_if_true = self.if_true

        # Handle if_false - can be a Rule or a numeric value
        if isinstance(self.if_false, Rule):
            resolved_if_false = self.if_false._instantiate(world)
        else:
            resolved_if_false = self.if_false

        return self.Resolved(
            resolved_test,
            resolved_if_true,
            resolved_if_false,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"If({self.test}) then ({self.if_true}) else ({self.if_false})"

    class Resolved(Rule.Resolved):
        test: "Rule.Resolved"
        if_true: Any  # Rule.Resolved or literal value
        if_false: Any  # Rule.Resolved or literal value
        skip_cache: ClassVar[bool] = True

        def _get_branch_value(self, branch: Any, state: CollectionState) -> float | int:
            """Get the numeric value of a branch."""
            if isinstance(branch, Rule.Resolved):
                if hasattr(branch, 'get_value'):
                    return branch.get_value(state)
                if hasattr(branch, 'get_count'):
                    return branch.get_count(state)
                # Boolean rules: True=1, False=0
                return 1 if branch(state) else 0
            return branch

        @override
        def get_value(self, state: CollectionState) -> float | int:
            """Get the numeric value based on condition."""
            if self.test(state):
                return self._get_branch_value(self.if_true, state)
            return self._get_branch_value(self.if_false, state)

        # Alias for Compare compatibility
        get_count = get_value

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            if self.test(state):
                if isinstance(self.if_true, Rule.Resolved):
                    return self.if_true(state)
                return bool(self.if_true)
            if isinstance(self.if_false, Rule.Resolved):
                return self.if_false(state)
            return bool(self.if_false)

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for rule in [self.test, self.if_true, self.if_false]:
                if isinstance(rule, Rule.Resolved):
                    for name, ids in rule.item_dependencies().items():
                        deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            deps: dict[str, set[int]] = {}
            for rule in [self.test, self.if_true, self.if_false]:
                if isinstance(rule, Rule.Resolved):
                    for name, ids in rule.region_dependencies().items():
                        deps.setdefault(name, set()).update(ids)
            return deps

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = [{"type": "text", "text": "If ("}]
            messages.extend(self.test.explain_json(state))
            messages.append({"type": "text", "text": ") then ("})
            if isinstance(self.if_true, Rule.Resolved):
                messages.extend(self.if_true.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.if_true)})
            messages.append({"type": "text", "text": ") else ("})
            if isinstance(self.if_false, Rule.Resolved):
                messages.extend(self.if_false.explain_json(state))
            else:
                messages.append({"type": "text", "text": str(self.if_false)})
            messages.append({"type": "text", "text": ")"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if_true_str = self.if_true.explain_str(state) if isinstance(self.if_true, Rule.Resolved) else str(self.if_true)
            if_false_str = self.if_false.explain_str(state) if isinstance(self.if_false, Rule.Resolved) else str(self.if_false)
            return f"If ({self.test.explain_str(state)}) then ({if_true_str}) else ({if_false_str})"

        @override
        def __str__(self) -> str:
            return f"If({self.test}) then ({self.if_true}) else ({self.if_false})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"test": self.test, "if_true": self.if_true, "if_false": self.if_false}


@dataclasses.dataclass()
class HelperCall(Rule[TWorld], game="Archipelago"):
    """
    Calls a helper function with explain support.

    This class supports three tiers of helper integration:
    1. body_rule set: Full Rule Builder evaluation and explain (best)
    2. helper_func + body_data set: Python evaluation, AST format explain
    3. helper_func only: Python evaluation, helper name display

    Usage:
        # Tier 1: Rule Builder body
        rule = HelperCall(helper_name="can_swim", body_rule=Has("Flippers"))

        # Tier 2/3: Python function
        rule = HelperCall(
            helper_func=_game_can_swim,
            helper_name="can_swim",
            args=(),
            body_data={"type": "item_check", "item": "Flippers"}
        )

        # With keyword arguments
        rule = HelperCall(
            helper_func=_game_enough_cats,
            helper_name="enough_cats",
            args=(walls_table, 1),
            kwargs={"strange": True}
        )
    """
    helper_func: Callable[..., bool] | None = None
    helper_name: str = ""
    args: tuple[Any, ...] = ()
    kwargs: dict[str, Any] | None = None
    body_rule: "Rule[TWorld] | None" = None
    body_data: dict[str, Any] | None = None

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        # Instantiate the body_rule if present
        resolved_body_rule = None
        if self.body_rule is not None:
            resolved_body_rule = self.body_rule._instantiate(world)

        return self.Resolved(
            self.helper_func,
            self.helper_name,
            self.args,
            self.kwargs or {},
            resolved_body_rule,
            self.body_data,
            player=world.player,
            caching_enabled=False,  # Helpers may have complex dependencies
        )

    @override
    def __str__(self) -> str:
        parts: list[str] = []
        if self.args:
            parts.append(", ".join(repr(a) for a in self.args))
        if self.kwargs:
            parts.append(", ".join(f"{k}={repr(v)}" for k, v in self.kwargs.items()))
        if parts:
            return f"Helper:{self.helper_name}({', '.join(parts)})"
        return f"Helper:{self.helper_name}"

    @override
    def to_dict(self) -> dict[str, Any]:
        """Returns a JSON compatible dict representation of this helper call.

        This outputs the format expected by the frontend, matching the AST exporter format.
        Empty 'options', 'args', and 'kwargs' are omitted.

        Uses _original_ast_type to encode the helper source and expansion behavior:
        - "rb_defined_helper": has body_rule or helper_func, skip all expansion
        - "helper": no body, allow full (pattern + standard) expansion
        """
        # Helpers with a defined body get "rb_defined_helper" to skip all expansion
        ast_type = "rb_defined_helper" if (self.body_rule is not None or self.helper_func is not None) else "helper"
        result: dict[str, Any] = {
            "rule": self.helper_name,
            "_original_ast_type": ast_type,
        }
        if self.options:
            result["options"] = [o.to_dict() for o in self.options]
        if self.filtered_resolution:
            result["filtered_resolution"] = self.filtered_resolution
        if self.args:
            # Convert boolean args to AST format for frontend compatibility
            exported_args: list[Any] = []
            for arg in self.args:
                if arg is True:
                    exported_args.append({"rule": "True_"})
                elif arg is False:
                    exported_args.append({"rule": "False_"})
                else:
                    exported_args.append(arg)
            result["args"] = exported_args
        if self.kwargs:
            # Convert boolean kwargs to AST format for frontend compatibility
            exported_kwargs: dict[str, Any] = {}
            for k, v in self.kwargs.items():
                if v is True:
                    exported_kwargs[k] = {"rule": "True_"}
                elif v is False:
                    exported_kwargs[k] = {"rule": "False_"}
                else:
                    exported_kwargs[k] = v
            result["kwargs"] = exported_kwargs
        return result

    class Resolved(Rule.Resolved):
        helper_func: Callable[..., bool] | None
        helper_name: str
        args: tuple[Any, ...]
        kwargs: dict[str, Any]
        body_rule: "Rule.Resolved | None"
        body_data: dict[str, Any] | None
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            # Tier 1: Use Rule Builder evaluation (preferred)
            if self.body_rule is not None:
                return self.body_rule(state)

            # Tier 2/3: Fall back to Python function
            if self.helper_func is not None:
                return self.helper_func(state, self.player, *self.args, **self.kwargs)

            # No evaluation available
            return True

        @override
        def get_value(self, state: CollectionState) -> int | float:
            """Get the numeric value from this helper for use in Arithmetic.

            Some helpers (like double_jump_height) return integer counts rather than
            booleans. When used in Arithmetic expressions, we need the actual numeric
            value, not a boolean conversion.
            """
            # Tier 1: Check if body_rule has get_value
            if self.body_rule is not None:
                if hasattr(self.body_rule, 'get_value'):
                    return self.body_rule.get_value(state)
                if hasattr(self.body_rule, 'get_count'):
                    return self.body_rule.get_count(state)
                # Fall back to boolean conversion
                return 1 if self.body_rule(state) else 0

            # Tier 2/3: Call helper function and return its value
            if self.helper_func is not None:
                result = self.helper_func(state, self.player, *self.args, **self.kwargs)
                # If result is numeric, return it directly
                if isinstance(result, (int, float)):  # pyright: ignore[reportUnnecessaryIsInstance]
                    return result
                # Otherwise treat as boolean
                return 1 if result else 0

            return 0

        # Alias for Arithmetic compatibility
        get_count = get_value

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            if self.body_rule is not None:
                return self.body_rule.item_dependencies()
            return {}

        @override
        def region_dependencies(self) -> dict[str, set[int]]:
            if self.body_rule is not None:
                return self.body_rule.region_dependencies()
            return {}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            # Tier 1: Use Rule Builder explain (best - shows actual state)
            if self.body_rule is not None:
                return self.body_rule.explain_json(state)

            # Tier 2: Use AST format explain
            if self.body_data is not None:
                from rule_builder.ast_explain import explain_ast_rule
                return explain_ast_rule(self.body_data, state, self.player)

            # Tier 3: Fallback - just show helper name and args
            messages: list[JSONMessagePart] = [
                {"type": "text", "text": "Helper: "},
                {"type": "color", "color": "magenta", "text": self.helper_name},
            ]
            if self.args:
                args_str = ", ".join(repr(a) for a in self.args)
                messages.append({"type": "text", "text": f"({args_str})"})
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if self.body_rule is not None:
                return self.body_rule.explain_str(state)
            if self.args:
                args_str = ", ".join(repr(a) for a in self.args)
                return f"Helper:{self.helper_name}({args_str})"
            return f"Helper:{self.helper_name}"

        @override
        def __str__(self) -> str:
            if self.args:
                args_str = ", ".join(repr(a) for a in self.args)
                return f"Helper:{self.helper_name}({args_str})"
            return f"Helper:{self.helper_name}"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            # Note: body_data is intentionally NOT included here.
            # Helper bodies should be looked up from the helpers section in the export data.
            # This avoids duplicating helper bodies at every call site.
            return {
                "helper_name": self.helper_name,
                "args": self.args,
            }

        @override
        def to_dict(self) -> dict[str, Any]:
            """Returns a JSON compatible dict representation of this resolved helper call.

            This outputs the format expected by the frontend, matching the AST exporter format.
            Empty 'options' and 'args' are omitted.

            Uses _original_ast_type to encode the helper source and expansion behavior:
            - "rb_defined_helper": has body_rule or helper_func, skip all expansion
            - "rb_helper": Rule Builder native, skip pattern expansion only
            """
            # Helpers with a defined body skip all expansion; others skip only pattern expansion
            if self.body_rule is not None or self.helper_func is not None:
                ast_type = "rb_defined_helper"
            else:
                ast_type = "rb_helper"
            result: dict[str, Any] = {
                "rule": self.helper_name,
                "_original_ast_type": ast_type,
            }
            if self.args:
                # Convert args to proper rule format for frontend compatibility
                converted_args: list[Any] = []
                for arg in self.args:
                    if arg is True:
                        # Booleans use True_/False_ rules (required by shapez and others)
                        converted_args.append({"rule": "True_"})
                    elif arg is False:
                        converted_args.append({"rule": "False_"})
                    elif isinstance(arg, (int, float, str)):
                        # Other primitives wrap in Constant
                        converted_args.append({
                            "rule": "Constant",
                            "args": {"value": arg},
                        })
                    elif isinstance(arg, dict):
                        # Already a rule dict
                        converted_args.append(arg)
                    else:
                        # Fallback for other types
                        converted_args.append(arg)
                result["args"] = converted_args
            return result


@dataclasses.dataclass()
class WeightedSum(Rule[TWorld], game="Archipelago"):
    """
    Check if the weighted sum of collected items meets or exceeds a threshold.

    Each item contributes its weight multiplied by the count of that item collected.
    For example, if threshold is 1.0 and items is [("Sword", 0.4), ("Shield", 0.6)],
    then having 1 Sword (0.4) and 1 Shield (0.6) would give 1.0 >= 1.0 = True.
    Having 3 Swords would give 1.2 >= 1.0 = True.

    This is commonly used for star-based progression where multiple powerups
    contribute fractionally toward meeting a score threshold.

    Usage:
        rule = WeightedSum(
            threshold=1.0,
            items=[("Progressive Dash", 0.35), ("Sharp Knife", 0.3), ...]
        )
    """
    threshold: float = 1.0
    items: list[tuple[str, float]] = dataclasses.field(default_factory=lambda: list[tuple[str, float]]())

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.threshold,
            tuple(self.items),
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        item_strs = [f"{name}:{weight}" for name, weight in self.items]
        return f"WeightedSum({self.threshold}, [{', '.join(item_strs)}])"

    class Resolved(Rule.Resolved):
        threshold: float
        items: tuple[tuple[str, float], ...]
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            total = 0.0
            for item_name, weight in self.items:
                count = state.count(item_name, self.player)
                total += count * weight
                # Early exit optimization
                if total >= self.threshold - 0.001:
                    return True
            return total >= self.threshold - 0.001

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item_name: {id(self)} for item_name, _ in self.items}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is not None:
                total = 0.0
                for item_name, weight in self.items:
                    count = state.count(item_name, self.player)
                    total += count * weight
                messages.append({
                    "type": "text",
                    "text": f"Weighted sum: {total:.2f}/{self.threshold:.2f}"
                })
            else:
                messages.append({
                    "type": "text",
                    "text": f"Weighted sum >= {self.threshold}"
                })
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is not None:
                total = 0.0
                for item_name, weight in self.items:
                    count = state.count(item_name, self.player)
                    total += count * weight
                return f"Weighted sum: {total:.2f}/{self.threshold:.2f}"
            return f"Weighted sum >= {self.threshold}"

        @override
        def __str__(self) -> str:
            return f"WeightedSum({self.threshold})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"threshold": self.threshold, "items": list(self.items)}

        @override
        def to_dict(self) -> dict[str, Any]:
            """Returns a JSON compatible dict that matches the weighted_sum helper format.

            This outputs the format expected by the frontend JavaScript evaluator.
            """
            return {
                "rule": "weighted_sum",
                "_original_ast_type": "helper",
                "_converted_from_ast": True,
                "args": [
                    {
                        "rule": "Constant",
                        "args": {"value": self.threshold},
                        "_converted_from_ast": True,
                    },
                    {
                        "rule": "Constant",
                        "args": {"value": list(self.items)},
                        "_converted_from_ast": True,
                    }
                ]
            }


@dataclasses.dataclass()
class UniqueCount(Rule[TWorld], game="Archipelago"):
    """
    Check if the count of unique items collected meets or exceeds a threshold.

    Unlike WeightedSum which counts total items (count * weight), this counts
    unique item types only (1 * weight if count > 0, else 0).

    This is used for rules like A Hat in Time's Enemy counter which only
    increments once per enemy type, regardless of how many of that enemy
    are collected.

    Usage:
        rule = UniqueCount(
            threshold=12,
            items=[("Mafia Goon", 1.0), ("Crow", 1.0), ...]
        )
    """
    threshold: float = 1.0
    items: list[tuple[str, float]] = dataclasses.field(default_factory=lambda: list[tuple[str, float]]())

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.threshold,
            tuple(self.items),
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        item_strs = [f"{name}:{weight}" for name, weight in self.items]
        return f"UniqueCount({self.threshold}, [{', '.join(item_strs)}])"

    class Resolved(Rule.Resolved):
        threshold: float
        items: tuple[tuple[str, float], ...]
        skip_cache: ClassVar[bool] = True

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            total = 0.0
            for item_name, weight in self.items:
                count = state.count(item_name, self.player)
                if count > 0:
                    total += weight
                    # Early exit optimization
                    if total >= self.threshold - 0.001:
                        return True
            return total >= self.threshold - 0.001

        @override
        def item_dependencies(self) -> dict[str, set[int]]:
            return {item_name: {id(self)} for item_name, _ in self.items}

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            messages: list[JSONMessagePart] = []
            if state is not None:
                total = 0.0
                for item_name, weight in self.items:
                    count = state.count(item_name, self.player)
                    if count > 0:
                        total += weight
                messages.append({
                    "type": "text",
                    "text": f"Unique count: {total:.0f}/{self.threshold:.0f}"
                })
            else:
                messages.append({
                    "type": "text",
                    "text": f"Unique count >= {self.threshold}"
                })
            return messages

        @override
        def explain_str(self, state: CollectionState | None = None) -> str:
            if state is not None:
                total = 0.0
                for item_name, weight in self.items:
                    count = state.count(item_name, self.player)
                    if count > 0:
                        total += weight
                return f"Unique count: {total:.0f}/{self.threshold:.0f}"
            return f"Unique count >= {self.threshold}"

        @override
        def __str__(self) -> str:
            return f"UniqueCount({self.threshold})"

        @override
        def _get_args_dict(self) -> dict[str, Any]:
            return {"threshold": self.threshold, "items": list(self.items)}

        @override
        def to_dict(self) -> dict[str, Any]:
            """Returns a JSON compatible dict that matches the unique_count helper format.

            This outputs the format expected by the frontend JavaScript evaluator.
            """
            return {
                "rule": "unique_count",
                "_original_ast_type": "helper",
                "_converted_from_ast": True,
                "args": [
                    {
                        "rule": "Constant",
                        "args": {"value": self.threshold},
                        "_converted_from_ast": True,
                    },
                    {
                        "rule": "Constant",
                        "args": {"value": list(self.items)},
                        "_converted_from_ast": True,
                    }
                ]
            }


@dataclasses.dataclass()
class OptionValue(Rule[TWorld], game="Archipelago"):
    """A rule that evaluates to the truthiness of a world option at runtime.

    This is used in Conditional tests to check option values dynamically,
    allowing rules to adapt based on the player's option settings.

    Usage:
        rule = Conditional(
            test=OptionValue('puzzle_hints_required'),
            if_true=And(CanReachRegion('Theater'), Has('Key')),
            if_false=True_()
        )
    """

    option_name: str
    """The name of the option to check"""

    @override
    def _instantiate(self, world: TWorld) -> Rule.Resolved:
        return self.Resolved(
            self.option_name,
            player=world.player,
            caching_enabled=False,
        )

    @override
    def __str__(self) -> str:
        return f"OptionValue({self.option_name})"

    @override
    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "rule": "OptionValue",
            "args": {"option": self.option_name}
        }
        if self.filtered_resolution:
            result["filtered_resolution"] = self.filtered_resolution
        return result

    class Resolved(Rule.Resolved):
        option_name: str
        skip_cache: ClassVar[bool] = True

        def _get_option(self, state: CollectionState) -> Any:
            """Get the raw option object from the world."""
            world = state.multiworld.worlds[self.player]
            return getattr(world.options, self.option_name, None)

        @override
        def get_value(self, state: CollectionState) -> int | float:
            """Get the numeric value of the option for Compare/Arithmetic contexts."""
            option = self._get_option(state)
            if option is None:
                return 0
            # Handle Option objects that have a .value attribute
            if hasattr(option, 'value'):
                value = option.value
                if isinstance(value, (int, float)):
                    return value
                return 1 if value else 0
            if isinstance(option, (int, float)):
                return option
            return 1 if option else 0

        # Alias for Compare compatibility
        get_count = get_value

        @override
        def _evaluate(self, state: CollectionState) -> bool:
            option = self._get_option(state)
            if option is None:
                return True  # Default to true if option not found
            # Handle Option objects that have a .value attribute
            if hasattr(option, 'value'):
                return bool(option.value)
            return bool(option)

        @override
        def explain_json(self, state: CollectionState | None = None) -> list[JSONMessagePart]:
            if state:
                result = self(state)
                color = "green" if result else "salmon"
                return [{"type": "color", "color": color, "text": f"Option: {self.option_name}"}]
            return [{"type": "text", "text": f"Option: {self.option_name}"}]

        @override
        def __str__(self) -> str:
            return f"OptionValue({self.option_name})"


DEFAULT_RULES = {
    rule_name: cast(type[Rule[RuleWorldMixin]], rule_class)
    for rule_name, rule_class in locals().items()
    if isinstance(rule_class, type) and issubclass(rule_class, Rule) and rule_class is not Rule
}

# Rule types that produce boolean expressions (as opposed to numeric values).
# Used by world_generator to identify rules that can be used directly in boolean contexts.
# Excludes numeric rules like CountItem, CountFromList, CountGroup, Arithmetic,
# MinValue, MaxValue, WeightedSum, UniqueCount, and OptionValue.
BOOLEAN_RULE_TYPES: frozenset[str] = frozenset({
    # Reachability rules
    'CanReachEntrance', 'CanReachRegion', 'CanReachLocation', 'EntranceAccessRuleCall',
    # Item rules
    'Has', 'HasAll', 'HasAny', 'HasAllCounts', 'HasAnyCount',
    'HasFromList', 'HasFromListUnique', 'HasGroup', 'HasGroupUnique',
    # Logic rules
    'And', 'Or', 'Not',
    # Boolean constants
    'True_', 'False_',
    # Comparison and conditional (produce booleans)
    'Compare', 'Conditional',
    # Helper calls
    'HelperCall',
    # Wrapper rules
    'Filtered', 'ASTRule',
})
