# Upstream Rule Builder Changes

Comparison of the upstream Rule Builder between its initial introduction (PR #5048, commit `286769a0`) and the current upstream target (commit `0de09cd7`).

The Rule Builder did not exist at the previous fork base (`1dd91ec85`). It was added entirely within the 23-commit range being synced.

## Commits

Three commits between `286769a0` and `0de09cd7` touch the Rule Builder or its integration points:

| Commit | PR | Description |
|--------|-----|-------------|
| `286769a0` | [#5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) | Initial Rule Builder addition (all 4 files + AutoWorld/BaseClasses integration) |
| `8b91f9ff` | [#5933](https://github.com/ArchipelagoMW/Archipelago/pull/5933) | Make `region.connect()` and `add_event()` support Rule Builder |
| `c505b1c3` | [#5912](https://github.com/ArchipelagoMW/Archipelago/pull/5912) | Add missing `filtered_resolution` arg to rule `__init__` and `from_dict` |
| `0de09cd7` | [#4582](https://github.com/ArchipelagoMW/Archipelago/pull/4582) | Better scaling explicit indirect conditions (performance optimization in `CollectionState`, not Rule Builder specific) |

## Files

| File | Status | Notes |
|------|--------|-------|
| `rule_builder/__init__.py` | Unchanged | Empty file in both versions |
| `rule_builder/rules.py` | Changed | PR #5912 only |
| `rule_builder/options.py` | Unchanged | Identical in both versions |
| `rule_builder/cached_world.py` | Unchanged | Identical in both versions |
| `BaseClasses.py` | Changed | PRs #5933 and #4582 |
| `worlds/AutoWorld.py` | Unchanged between these commits | Rule Builder integration was in initial PR #5048 |
| `test/general/test_helpers.py` | Changed | PR #5933 |

## Detailed Changes

### 1. PR #5912: `filtered_resolution` propagation fix (`rules.py`)

**Problem**: Several rule classes with custom `__init__` methods did not accept or forward the `filtered_resolution` parameter. Similarly, their `from_dict` class methods did not deserialize it.

**Change**: Added `filtered_resolution: bool = False` parameter to all custom `__init__` methods and forwarded it to `super().__init__()`. Updated all `from_dict` methods to pass `data.get("filtered_resolution", False)`.

**Affected classes** (6 total):

| Class | Change |
|-------|--------|
| `NestedRule.__init__` | Added `filtered_resolution` param, forwarded to super |
| `NestedRule.from_dict` | Added `filtered_resolution=data.get(...)` |
| `WrapperRule.from_dict` | Added `filtered_resolution=data.get(...)` |
| `HasAll.__init__` | Added `filtered_resolution` param, forwarded to super |
| `HasAll.from_dict` | Added `filtered_resolution=data.get(...)` |
| `HasAny.__init__` | Added `filtered_resolution` param, forwarded to super |
| `HasAny.from_dict` | Added `filtered_resolution=data.get(...)` |
| `HasFromList.__init__` | Added `filtered_resolution` param, forwarded to super |
| `HasFromList.from_dict` | Added `filtered_resolution=data.get(...)` |
| `HasFromListUnique.__init__` | Added `filtered_resolution` param, forwarded to super |
| `HasFromListUnique.from_dict` | Added `filtered_resolution=data.get(...)` |

This is a bugfix: without it, constructing e.g. `HasAll("a", "b", filtered_resolution=True)` would raise a `TypeError` because the custom `__init__` didn't accept the keyword. And `from_dict` would silently discard the stored `filtered_resolution` value.

### 2. PR #5933: `Region.connect()` and `add_event()` Rule Builder support (`BaseClasses.py`)

**Problem**: `Region.connect()`, `Region.add_event()`, and `Region.add_exits()` directly set `access_rule` on locations/entrances, bypassing `World.set_rule()`. This meant Rule Builder rules passed to these methods would not be resolved or have their dependencies registered.

**Change**: Type signatures updated to accept `Rule[Any]` in addition to `CollectionRule`. Method bodies changed from direct `access_rule` assignment to calling `self.multiworld.worlds[self.player].set_rule(target, rule)`.

Specific changes:
- `Region.add_event(rule=...)`: type `CollectionRule | None` -> `CollectionRule | Rule[Any] | None`; body uses `set_rule()` instead of direct assignment
- `Region.connect(rule=...)`: type `Optional[CollectionRule]` -> `Optional[CollectionRule | Rule[Any]]`; body uses `set_rule()` instead of direct assignment; guard changed from `if rule:` to `if rule is not None:` (important: `Rule.__bool__` raises `TypeError`)
- `Region.add_exits(rules=...)`: type updated to accept `Rule[Any]` in mapping values

### 3. PR #4582: Indirect conditions performance (`BaseClasses.py`)

**Problem**: In `CollectionState._update_reachable_regions_explicit_indirect_conditions`, the `new_entrance not in queue` check was O(n) on a deque, causing slowdowns for worlds with many indirect conditions.

**Change**: Replaced the per-element loop with set operations:
```python
# Before
for new_entrance in self.multiworld.indirect_connections.get(new_region, set()):
    if new_entrance in blocked_connections and new_entrance not in queue:
        queue.append(new_entrance)

# After
entrances = self.multiworld.indirect_connections.get(new_region)
if entrances is not None:
    relevant_entrances = entrances.intersection(blocked_connections)
    relevant_entrances.difference_update(queue)
    queue.extend(relevant_entrances)
```

This is a pure performance optimization (5.9% speedup for Blasphemous) with no API changes.

## Summary

The changes between initial addition and `0de09cd7` are minimal:

1. **Bugfix**: `filtered_resolution` now properly propagates through all rule constructors and deserialization
2. **Integration**: `Region.connect()` and `add_event()` now route through `World.set_rule()` instead of direct assignment, enabling Rule Builder rules to be used in these common patterns
3. **Performance**: Indirect conditions checking uses set operations instead of linear deque search

No new rule types were added. No architectural changes. No changes to the caching system, dependency tracking, serialization format, or `OptionFilter`. The Rule Builder API surface is essentially the same, with the PR #5912 fix being the only change that would affect consumers of the API.
