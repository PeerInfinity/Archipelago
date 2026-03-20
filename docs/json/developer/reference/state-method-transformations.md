# State Method Transformation Reference

This document describes how the exporter's call visitor transforms Python `CollectionState` method calls into JSON rule structures.

**Source:** `exporter/analyzer/ast_visitors/call_visitor.py`

## Overview

When the analyzer encounters a function call in a rule lambda, the `CallVisitorMixin` classifies it and produces a JSON rule node. The dispatch priority is:

1. **Early pattern detection** - `state.multiworld.get_region()`, NamedTuple callables, entrance access rules
2. **State methods** - `state.has()`, `state.can_reach()`, etc.
3. **Built-in functions** - `all()`, `any()`, `sum()`, `len()`, `min()`, `max()`, `map()`, `zip()`
4. **Helper functions** - Named functions, module methods, `self.method()`
5. **Fallback** - Generic `function_call` node

All call types filter out runtime-only arguments (`state`, `player`, `world`) before producing output.

## State Methods

Detected when `func_info` has `type: 'attribute'` with `object.name == 'state'`.

### `state.has(item, player, count=1)`

The most common pattern.

| Python | JSON |
|--------|------|
| `state.has("Sword", player)` | `{"type": "item_check", "item": "Sword"}` |
| `state.has("Key", player, 3)` | `{"type": "item_check", "item": "Key", "count": {"type": "constant", "value": 3}}` |
| `state.has(ItemName.Bow, player)` | `{"type": "item_check", "item": "Bow"}` (attribute resolved) |

### `state.has_all(items, player)`

| Python | JSON |
|--------|------|
| `state.has_all(["A", "B", "C"], player)` | `{"type": "state_method", "method": "has_all", "args": [{"type": "constant", "value": ["A", "B", "C"]}]}` |

List arguments are sorted for deterministic output.

### `state.has_any(items, player)`

Expanded to an OR of individual item checks when the argument is a resolvable list:

| Python | JSON |
|--------|------|
| `state.has_any(["Sword", "Bow"], player)` | `{"type": "or", "conditions": [{"type": "item_check", "item": "Sword"}, {"type": "item_check", "item": "Bow"}]}` |

### `state.has_group(group, player, count=1)`

| Python | JSON |
|--------|------|
| `state.has_group("swords", player)` | `{"type": "group_check", "group": "swords"}` |
| `state.has_group("keys", player, 3)` | `{"type": "group_check", "group": "keys", "count": {"type": "constant", "value": 3}}` |

### `state.count_group(group, player)`

Returns a numeric value, not a boolean check.

| Python | JSON |
|--------|------|
| `state.count_group("relics", player)` | `{"type": "group_count", "group": "relics"}` |

### `state.can_reach(target, resolution_hint, player)`

| Python | JSON |
|--------|------|
| `state.can_reach("Mountain", "Region", player)` | `{"type": "state_method", "method": "can_reach", "args": [{"type": "constant", "value": "Mountain"}, {"type": "constant", "value": "Region"}]}` |

Also handles `can_reach_location`, `can_reach_region`, and `can_reach_entrance` variants.

### Object-oriented `can_reach`

Location, Region, and Entrance objects calling `.can_reach(state)` are converted to the same format:

| Python | JSON |
|--------|------|
| `location.can_reach(state)` | `{"type": "state_method", "method": "can_reach", "args": [{"type": "constant", "value": "Loc Name"}, {"type": "constant", "value": "Location"}]}` |
| `region.can_reach(state)` | `{"type": "state_method", "method": "can_reach", "args": [{"type": "constant", "value": "Region Name"}, {"type": "constant", "value": "Region"}]}` |
| `entrance.can_reach(state)` | `{"type": "state_method", "method": "can_reach", "args": [{"type": "constant", "value": "Entrance Name"}, {"type": "constant", "value": "Entrance"}]}` |

Object types are detected by their attributes: Entrance has `connected_region`, Region has `entrances`, Location has `parent_region`.

### `state.count(item, player)`

| Python | JSON |
|--------|------|
| `state.count("Rupee", player)` | `{"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Rupee"}]}` |

### Other state methods

All other `state.*` methods follow the generic pattern:

| Python | JSON |
|--------|------|
| `state.has_from_list(items, player, count)` | `{"type": "state_method", "method": "has_from_list", "args": [...]}` |
| `state.has_from_list_unique(items, player, count)` | `{"type": "state_method", "method": "has_from_list_unique", "args": [...]}` |
| `state.count_from_list(items, player)` | `{"type": "state_method", "method": "count_from_list", "args": [...]}` |
| `state.count_from_list_unique(items, player)` | `{"type": "state_method", "method": "count_from_list_unique", "args": [...]}` |
| `state.has_all_counts(item_counts, player)` | `{"type": "state_method", "method": "has_all_counts", "args": [...]}` |
| `state.has_any_count(item_counts, player)` | `{"type": "state_method", "method": "has_any_count", "args": [...]}` |
| `state.has_group_unique(group, player, count)` | `{"type": "state_method", "method": "has_group_unique", "args": [...]}` |
| `state.count_group_unique(group, player)` | `{"type": "state_method", "method": "count_group_unique", "args": [...]}` |

### Game-specific state methods (underscore prefix)

Methods starting with `_` (e.g., `state._lttp_has_key()`) are routed to the game handler's `handle_game_specific_state_method()` first. If the handler returns a result, it's used directly. Otherwise, the generic `state_method` format is used.

### `state.prog_items[player][key]`

Accumulator access pattern (used by DLCQuest for coins):

| Python | JSON |
|--------|------|
| `state.prog_items[player][" coins"]` | `{"type": "prog_item_count", "key": " coins"}` |

### `state.multiworld.get_region(name, player)`

| Python | JSON |
|--------|------|
| `state.multiworld.get_region("Cave", player)` | `{"type": "region_reference", "region": "Cave"}` |

## Built-in Functions

### `all(generator_expression)`

| Python | JSON |
|--------|------|
| `all(state.has(item, player) for item in ["A", "B"])` | `{"type": "and", "conditions": [{"type": "item_check", "item": "A"}, {"type": "item_check", "item": "B"}]}` |
| `all(rule(state) for rule in [func1, func2])` | `{"type": "and", "conditions": [analyzed_func1, analyzed_func2]}` |
| Unresolvable iterator | `{"type": "all_of", "element_rule": ..., "iterator_info": ...}` |

When the iterator resolves to a list of callables, each is analyzed recursively. When it resolves to constant values, the element expression is expanded by substitution. Empty iterators produce `{"type": "constant", "value": true}`.

### `any(generator_expression)`

Same structure as `all()` but produces `or` and `any_of` types instead.

### `sum(iterable, start=0)`

| Python | JSON |
|--------|------|
| `sum([a, b, c])` | `{"type": "sum", "iterable": ...}` |
| `sum([a, b], 10)` | `{"type": "sum", "iterable": ..., "start": {"type": "constant", "value": 10}}` |

When the iterable is a constant list, may be optimized to nested `binary_op` additions.

### `len(iterable)`

Preprocessed by `BinaryOpProcessor.try_preprocess_len()`. Constant-length collections are resolved at export time (see [Binary Operation Optimizations](binary-op-optimizations.md)).

### `min()` / `max()`

| Python | JSON |
|--------|------|
| `min(a, b, c)` | `{"type": "min", "args": [a, b, c]}` |
| `min(iterable)` | `{"type": "min", "iterable": iterable}` |
| `max(a, b, c)` | `{"type": "max", "args": [a, b, c]}` |
| `max(iterable)` | `{"type": "max", "iterable": iterable}` |

### `map(function, iterable)`

| Python | JSON |
|--------|------|
| `map(func, items)` | `{"type": "map", "function": func, "iterable": items}` |

### `zip(iter1, iter2)`

Preprocessed by `BinaryOpProcessor.try_preprocess_zip()`. Constant lists are resolved at export time.

## Helper Functions

### Named function calls

Functions not recognized as state methods or built-ins become helper references:

| Python | JSON |
|--------|------|
| `can_use_bombs(state, player)` | `{"type": "helper", "name": "can_use_bombs"}` |
| `has_sword(state, player)` | `{"type": "helper", "name": "has_sword"}` |
| `check_combat(state, 5, "fire")` | `{"type": "helper", "name": "check_combat", "args": [{"type": "constant", "value": 5}, {"type": "constant", "value": "fire"}]}` |

Before creating a helper node, the analyzer attempts recursive analysis of the function. If the function takes `state` as a parameter and can be analyzed (source available, no unsupported patterns), it's inlined. If the game handler marks it via `should_preserve_as_helper()`, or if it exceeds `HELPER_ANALYSIS_NODE_LIMIT`, it's kept as a helper reference.

### Module method calls

`Module.method()` where Module ends with "Logic" or equals "Rules":

| Python | JSON |
|--------|------|
| `StateLogic.canDig(state)` | `{"type": "helper", "name": "canDig"}` |
| `Macros.can_sail(state, region)` | `{"type": "helper", "name": "can_sail", "args": [{"type": "constant", "value": "region_name"}]}` |

### Self/logic method calls

| Python | JSON |
|--------|------|
| `self.has_ladder(state, "tall")` | `{"type": "helper", "name": "has_ladder", "args": [{"type": "constant", "value": "tall"}]}` |
| `logic.can_fly(state)` | `{"type": "helper", "name": "can_fly"}` |

## Object Method Calls

### List/set operations

| Python | JSON |
|--------|------|
| `items.index("Sword")` | `{"type": "constant", "value": 2}` (resolved at export time) |
| `set_a.union(set_b)` | `{"type": "constant", "value": [merged_list]}` (resolved) |
| `set_a.intersection(set_b)` | `{"type": "constant", "value": [intersected_list]}` (resolved) |

### Dict operations

| Python | JSON |
|--------|------|
| `my_dict.get(key, default)` | `{"type": "constant", "value": resolved_value}` (resolved) |
| Other dict methods | `{"type": "method_call", "object": ..., "method": "name", "args": [...]}` |

### Option methods

| Python | JSON |
|--------|------|
| `world.options.setting.to_bool()` | `{"type": "option_value", "option": "setting"}` (or constant if resolvable) |

## Argument Resolution

Before creating output, arguments undergo resolution:

1. **Name references** - Resolved via `expression_resolver.resolve_variable()` to constants when possible
2. **Attribute expressions** - Resolved via `expression_resolver.resolve_expression()` (enum values, etc.)
3. **Region objects** - Extract `.name` attribute
4. **Binary operations** - Resolved if all operands are constants
5. **List literals** - Recursively resolve elements
6. **Comprehensions** - Resolved if iterator is constant

Arguments that can't be resolved are kept in their analyzed form.

## See Also

- [Rule Types Reference](rule-types-reference.md) - Complete catalog of JSON rule types
- [Handler Configuration](handler-configuration.md) - Game handler settings
- [Binary Operation Optimizations](binary-op-optimizations.md) - Compile-time optimizations
- [Closure Function Analyzer](closure-function-analyzer.md) - How captured functions are analyzed
