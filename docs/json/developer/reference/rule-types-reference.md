# Rule Types Reference

This document catalogs all rule types currently supported by the Archipelago-CC rule system.

## Overview

The rule system has two layers that work together:

1. **Python Layer** (`exporter/analyzer/ast_visitors.py`) - Converts Python AST to JSON rule structures during export
2. **Frontend Layer** (`frontend/modules/shared/ruleEngine.js`) - Evaluates JSON rules in the browser at runtime

Both layers must support a rule type for it to work end-to-end.

## Rule Type Catalog

### Logical Operators

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `and` | Logical AND of conditions | `conditions: []` | `{"type": "and", "conditions": [...]}` |
| `or` | Logical OR of conditions | `conditions: []` | `{"type": "or", "conditions": [...]}` |
| `not` | Logical negation | `condition` or `operand` | `{"type": "not", "condition": {...}}` |
| `conditional` | Ternary if-then-else | `test`, `if_true`, `if_false` | `{"type": "conditional", "test": {...}, "if_true": {...}, "if_false": {...}}` |
| `count_true` | True if N conditions pass | `conditions: []`, `count` | `{"type": "count_true", "conditions": [...], "count": 3}` |
| `weighted_count_true` | True if weighted sum of conditions >= threshold | `conditions: []`, `weights: []`, `threshold` | `{"type": "weighted_count_true", ...}` |

### Item & Inventory Checks

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `item_check` | Check if player has an item | `item`, `count` (optional) | `{"type": "item_check", "item": "Sword"}` |
| `count_check` | Check if player has N of item | `item`, `count` | `{"type": "count_check", "item": "Key", "count": 3}` |
| `CountCheck` | Check if player has N of item (Rule Builder) | `item`, `count` | `{"rule": "CountCheck", "args": {"item": "Key", "count": 3}}` |
| `HasAllCounts` | Check all items have specific counts (Rule Builder) | `items` | `{"rule": "HasAllCounts", "args": {"items": {"Key": 3, "Sword": 1}}}` |
| `HasAnyCount` | Check any item has specific count (Rule Builder) | `items` | `{"rule": "HasAnyCount", "args": {"items": {"Key": 3, "Sword": 1}}}` |
| `group_check` | Check for N items from a group | `group`, `count` | `{"type": "group_check", "group": "swords", "count": 1}` |
| `HasGroupUnique` | Check for N unique items from a group (Rule Builder) | `group`, `count` | `{"rule": "HasGroupUnique", "args": {"group": "relics", "count": 6}}` |
| `group_count` | Get count of items in group (returns number) | `group` | `{"type": "group_count", "group": "keys"}` |
| `CountGroup` | Get count of items in group (Rule Builder) | `group` | `{"rule": "CountGroup", "args": {"group": "keys"}}` |
| `CountGroupUnique` | Get count of unique items in group (Rule Builder) | `group` | `{"rule": "CountGroupUnique", "args": {"group": "keys"}}` |
| `counts` | Check if total of multiple items >= count | `items: []`, `count` | `{"type": "counts", "items": ["Item1", "Item2"], "count": 3}` |
| `count_item` | Get item count as number | `item` | `{"type": "count_item", "item": "Rupee"}` |
| `total_items_count` | Check total items collected | `count` | `{"type": "total_items_count", "count": 50}` |
| `locations_checked` | Check locations checked count | `count` | `{"type": "locations_checked", "count": 10}` |
| `CountFromList` | Get cumulative count of items from a list (Rule Builder) | `item_names: []` | `{"rule": "CountFromList", "args": {"item_names": ["Key", "Door"]}}` |
| `WeightedSum` | Check if weighted sum of items meets threshold (Rule Builder) | `threshold`, `items: [[name, weight], ...]` | `{"rule": "WeightedSum", "args": [1.0, [["Sword", 0.5], ["Shield", 0.5]]]}` |
| `UniqueCount` | Check if count of unique item types meets threshold (Rule Builder) | `threshold`, `items: [[name, weight], ...]` | `{"rule": "UniqueCount", "args": [12, [["Enemy1", 1], ["Enemy2", 1]]]}` |
| `unique_count` | Check if weighted count of unique items >= threshold | `args: [threshold, [[item, weight], ...]]` | `{"rule": "unique_count", "args": [12.0, [["Item", 1.0], ...]]}` |
| `prog_item_count` | Get count of progression item from accumulator | `key` | `{"type": "prog_item_count", "key": " coins"}` |

### Access & Reachability

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `can_reach` | Check if region is reachable | `region` | `{"type": "can_reach", "region": "Death Mountain"}` |
| `can_reach_entrance` | Check if entrance is reachable | `entrance` | `{"type": "can_reach_entrance", "entrance": "Cave Door"}` |
| `location_check` | Check if location is accessible | `location` | `{"type": "location_check", "location": "Chest A"}` |
| `location_rule_ref` | Evaluate another location's access rule | `location` | `{"type": "location_rule_ref", "location": "Act Completion (...)"}` |
| `region_check` | Check if region is accessible | `region` | `{"type": "region_check", "region": "Dungeon 1"}` |
| `region_reference` | Reference to a region (from get_region) | `region` | `{"type": "region_reference", "region": "Good Bee Cave"}` |
| `region_attribute` | Access region property | `region`, `attr` | `{"type": "region_attribute", "region": {...}, "attr": "is_light_world"}` |
| `capability` | Check player capability | `capability` | `{"type": "capability", "capability": "can_swim"}` |
| `state_method` | Call StateManager methods | `method`, `args: []` | `{"type": "state_method", "method": "can_reach", "args": [...]}` |
| `player_id` | Get the current player's ID | (none) | `{"type": "player_id"}` |
| `EntranceAccessRule` | Evaluate entrance access rule with optional fake state (Rule Builder) | `entrance_name`, `fake_pearl` | `{"rule": "EntranceAccessRule", "args": {"entrance_name": "Cave", "fake_pearl": true}}` |

### Placement Lookups

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `placement_lookup` | Get item placed at a location | `location` | Returns `[itemName, player]` tuple or null |
| `placement_search` | Check if item is at any of given locations | `item`, `player`, `locations` | Returns true/false |

### Data & Values

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `constant` / `value` | Literal constant values | `value` | `{"type": "constant", "value": 5}` |
| `Constant` | Literal constant value (Rule Builder) | `value` | `{"rule": "Constant", "args": {"value": 5}}` |
| `name` | Variable/name reference | `name` | `{"type": "name", "name": "player"}` |
| `Name` | Variable/name reference (Rule Builder) | `name` | `{"rule": "Name", "args": {"name": "player"}}` |
| `attribute` | Property access (obj.attr) | `object`, `attr` | `{"type": "attribute", "object": {...}, "attr": "name"}` |
| `Attribute` | Property access (Rule Builder) | `object`, `attr` | `{"rule": "Attribute", "args": {"object": {...}, "attr": "name"}}` |
| `subscript` / `index` | Array/dict indexing | `value`/`object`, `index` | `{"type": "subscript", "value": {...}, "index": {...}}` |
| `slice` | Array/string slicing | `value`, `lower`, `upper`, `step` | `{"type": "slice", "value": {...}, "lower": {...}, "upper": {...}}` |
| `list` | Array literal | `value: []` | `{"type": "list", "value": [...]}` |
| `List` | Array literal (Rule Builder) | `value: []` | `{"rule": "List", "args": {"value": [...]}}` |
| `set` | Set literal (unique values) | `elements: []` | `{"type": "set", "elements": [...]}` |
| `tuple` | Fixed array | `elements: []` | `{"type": "tuple", "elements": [...]}` |
| `Tuple` | Fixed array (Rule Builder) | `value: []` | `{"rule": "Tuple", "args": {"value": [...]}}` |
| `world_reference` | Reference to world object | (none) | `{"type": "world_reference"}` |
| `option_value` | Get user-configurable option value | `option` | `{"type": "option_value", "option": "difficulty"}` |
| `OptionValue` | Get user-configurable option value (Rule Builder) | `option` | `{"rule": "OptionValue", "args": {"option": "difficulty"}}` |
| `world_attribute` | Get runtime world attribute | `attribute`, `index` (optional) | `{"type": "world_attribute", "attribute": "required_medallions", "index": 0}` |
| `WorldAttribute` | Get runtime world attribute (Rule Builder) | `attribute`, `index` (optional) | `{"rule": "WorldAttribute", "args": {"attribute": "shop_items", "index": 0}}` |
| `setting_value` | Get setting value (legacy) | `setting` | `{"type": "setting_value", "setting": "difficulty"}` |
| `setting_check` | Check if setting equals value | `setting`, `value` | `{"type": "setting_check", "setting": "mode", "value": "hard"}` |
| `f_string` | String formatting | `parts: [{type, value}]` | `{"type": "f_string", "parts": [...]}` |

### Functions & Helpers

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `helper` | Game-specific helper call | `name`, `args: []` | `{"type": "helper", "name": "can_swim", "args": []}` |
| `generic_helper` | Unconverted helper call | `name`, `args: []` | `{"type": "generic_helper", "name": "complex_check", "args": [...]}` |
| `function_call` | Generic function call | `function`, `args: []` | `{"type": "function_call", "function": {...}, "args": [...]}` |
| `method_call` | Method call on object | `object`, `method`, `args: []` | `{"type": "method_call", "object": {...}, "method": "check", "args": [...]}` |
| `call` | Simple function call (world generator format) | `func`, `args: []` | `{"type": "call", "func": "max", "args": [...]}` |

**Built-in math functions** (handled via `function_call` with `math.*` prefix):
- `sqrt(x)` - Square root
- `pow(x, y)` - Exponentiation (x to the power y)
- `floor(x)` - Round down to nearest integer
- `ceil(x)` - Round up to nearest integer
- `abs(x)` - Absolute value

**Python built-in functions** (handled via `helper` type or `call` type):
- `any(iterable)` - True if any element is truthy
- `all(iterable)` - True if all elements are truthy
- `len(collection)` - Get length of collection
- `sum(iterable)` - Sum of all elements
- `sorted(iterable)` - Return sorted list
- `iter(iterable)` - Create stateful iterator from iterable (returns iterator object)
- `next(iterator, default)` - Get next item from iterator and advance position (returns element or default)
- `bool(value)` - Convert value to boolean
- `int(value)` - Convert value to integer (truncates floats, parses strings)

**Note on iter/next**: The frontend implements stateful iterators. `iter()` returns an iterator object `{__isIterator: true, items: [...], position: 0}`. Each call to `next()` returns the item at the current position and advances it, enabling patterns like `while target != None: ... target = next(iterator, None)`.

**Method call support** (`method_call` type):
- Arrays/Lists: `index(value)`, `count(value)`, `__contains__(value)`
- Strings: `index(substring)`, `__contains__(substring)`
- Dicts: `keys()`, `values()`, `items()`, `get(key, default)`

### Arithmetic & Comparison

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `binary_op` / `binop` | Arithmetic/logical operations | `left`, `right`, `op` | `{"type": "binary_op", "left": {...}, "op": "+", "right": {...}}` |
| `compare` / `comparison` | Comparison operations | `left`, `right`, `op` | `{"type": "compare", "left": {...}, "op": ">=", "right": {...}}` |
| `negate` | Unary minus operation | `operand` | `{"type": "negate", "operand": {...}}` |
| `min` | Return minimum of values | `args: []` or `iterable` | `{"type": "min", "args": [...]}` or `{"type": "min", "iterable": {...}}` |
| `max` | Return maximum of values | `args: []` or `iterable` | `{"type": "max", "args": [...]}` or `{"type": "max", "iterable": {...}}` |
| `MinValue` | Return minimum of two values (Rule Builder) | `left`, `right` | `{"rule": "MinValue", "args": {"left": {...}, "right": {...}}}` |
| `MaxValue` | Return maximum of two values (Rule Builder) | `left`, `right` | `{"rule": "MaxValue", "args": {"left": {...}, "right": {...}}}` |

**`min`/`max` forms:**
- **Explicit args**: `min(a, b, c)` → `{"type": "min", "args": [...]}`
- **Iterable**: `min(generator)` → `{"type": "min", "iterable": {...}}`
- Returns `undefined` for empty iterables (matching Python's ValueError behavior)

**Binary operators (`op` values):**
- Arithmetic: `+`, `-`, `*`, `/`, `//` (floor div), `%` (modulo), `**` (power)
- Logical: `and`, `or`, `AND`, `OR`
- Bitwise: `&` (AND), `|` (OR), `^` (XOR)

**Comparison operators (`op` values):**
- Equality: `==`, `!=`
- Ordering: `<`, `>`, `<=`, `>=`
- Membership: `in`, `not in`
- Identity: `is`, `is not`

### Generators & Iteration

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `all_of` | Apply rule to all items (AND) | `element_rule`, `iterator_info` | All items in a list must satisfy condition |
| `AST_all_of` | Apply rule to all items (Rule Builder wrapper) | `element_rule`, `iterator_info` | `{"rule": "AST_all_of", "args": {"element_rule": {...}, "iterator_info": {...}}}` |
| `any_of` | Apply rule to any item (OR) | `element_rule`, `iterator_info` | At least one item must satisfy condition |
| `AST_any_of` | Apply rule to any item (Rule Builder wrapper) | `element_rule`, `iterator_info` | `{"rule": "AST_any_of", "args": {"element_rule": {...}, "iterator_info": {...}}}` |
| `sum_of` | Sum numeric results over items | `element_rule`, `iterator_info` | `sum([state.count(x) for x in items])` |
| `generator_expression` | Python generator expression | `element`, `comprehension` | Complex iteration patterns |
| `weighted_sum` | Check weighted sum meets threshold | `args: [threshold, items]` | `{"rule": "weighted_sum", "args": [1.0, [["Item", 0.5], ...]]}` |

**`weighted_sum` details** (Rule Builder format, used by Overcooked! 2):
- `args[0]`: Threshold value (typically 1.0)
- `args[1]`: Array of `[item_name, weight]` pairs
- Returns `true` if `sum(count(item) * weight for item, weight in items) >= threshold`
- Example: With threshold 1.0 and items `[["Sword", 0.5], ["Shield", 0.5]]`, returns true if player has 2+ of either item or 1+ of each

**Iterator info structure** (`iterator_info` field):
- `target`: Variable binding - either `{type: "name", name: "x"}` for simple or `{type: "tuple", elements: [...]}` for unpacking
- `iterator`: The collection to iterate over (e.g., name reference, list, dict.items() result)

### Imperative/Block Types

These types support complex helper functions with multi-statement bodies:

| Type | Description | Fields | Example |
|------|-------------|--------|---------|
| `block` | Execute statements sequentially | `statements: []` | Multi-line helper body |
| `assign` | Variable assignment | `name`, `value`, `op` | `count = 0` or `count += 1` |
| `aug_assign` | Augmented assignment | `target`, `op`, `value` | `count += 1` (op is `+` not `+=`) |
| `return` | Early return from block | `value` | `return True` |
| `for_range` | Loop N times | `count`, `var`, `body: []` | `for i in range(5):` |
| `for_iter` | Loop over iterable | `iterable`, `var`, `body: []` | `for item in list:` or `for a, b in pairs:` (tuple unpacking) |
| `while_loop` | Loop while condition is true | `condition`, `body: []`, `orelse: []` | `while cond: stmt` |
| `if_statement` | Conditional execution (statement) | `test`, `body: []`, `orelse: []` | `if cond: stmt` |
| `break` | Exit enclosing loop | (none) | `break` |
| `continue` | Skip to next iteration | (none) | `continue` |

## Key Implementation Files

| File | Purpose |
|------|---------|
| `exporter/analyzer/ast_visitors.py` | Python AST to rule JSON conversion |
| `frontend/modules/shared/ruleEngine.js` | Rule evaluation engine (see `evaluateRule()` function) |
| `frontend/schema/rules.schema.json` | Rule structure validation schema |

## Python State Methods

The following `state.*` methods are recognized and converted to specific rule types:

| Python Method | Rule Type | Notes |
|---------------|-----------|-------|
| `state.has(item, player)` | `item_check` | Basic item check |
| `state.has(item, player, count)` | `count_check` | Item count check |
| `state.has_any(items, player)` | `or` of `item_check` | Has any of the items |
| `state.has_all(items, player)` | `and` of `item_check` | Has all items |
| `state.has_all_counts(item_counts, player)` | `state_method` | Has all items with specified counts |
| `state.has_from_list(items, player, count)` | `state_method` | Has count items from list (with duplicates) |
| `state.has_from_list_unique(items, player, count)` | `state_method` | Has count unique items from list |
| `state.has_group(group, player)` | `group_check` | Has item from group |
| `state.has_group(group, player, count)` | `group_check` | Has N items from group |
| `state.count(item, player)` | `count_item` | Get item count |
| `state.count_group(group, player)` | `group_count` | Get group item count |
| `state.count_from_list(items, player)` | `state_method` | Get sum of counts for items in list |
| `state.count_from_list_unique(items, player)` | `state_method` | Get count of unique items from list |
| `state.can_reach(region, ...)` | `can_reach` | Region reachability |
| `state.can_reach_entrance(entrance)` | `can_reach_entrance` | Entrance reachability |

## Class-Based Helper References

For worlds using class-based helpers (e.g., KH2), the following references are supported:

| Python Reference | Rule Type | Notes |
|------------------|-----------|-------|
| `self.player` | `player_id` | Returns the current player's slot ID |
| `self.world.options.*` | `option_value` | Access user-configurable options |
| `world.options.*` | `option_value` | Access user-configurable options |
| `world.*` (non-option) | `world_attribute` | Access runtime world attributes |

**Note:** The `setting_value` type is legacy and covers both options and world attributes. New exports use the more specific `option_value` and `world_attribute` types.

## Internal/Supporting Types

These types are used internally or as supporting structures:

| Type | Description | Usage |
|------|-------------|-------|
| `comprehension_details` | Iterator details for comprehensions | Used in `iterator_info` field of `all_of`/`any_of`/`sum_of` |
| `dict_lambda_lookup` | Dict-based conditional evaluation | ALttP glitch rules: `rule_map.get(key, default)(state)` pattern |
| `AST_dict_lambda_lookup` | Dict-based conditional (Rule Builder wrapper) | `{"rule": "AST_dict_lambda_lookup", "args": {"key": {...}, "cases": {...}, "default": {...}}}` |
| `Filtered` | Wrapper rule with option-based filtering (Rule Builder) | Wraps child rule, evaluates child directly |
| `formatted_value` | Individual formatted part of an f-string | Used internally within `f_string` parts |
| `unknown` | Placeholder for unhandled expressions | Generated when AST node cannot be converted |

### `dict_lambda_lookup` Structure

This type handles patterns like `rule_map.get(entrance.name, lambda s: False)(state)` where a dict maps keys to callable rules:

```json
{
  "type": "dict_lambda_lookup",
  "dict_name": "rule_map",
  "key": {"type": "attribute", "object": {...}, "attr": "name"},
  "cases": {
    "Entrance A": {"type": "item_check", "item": "Key"},
    "Entrance B": {"type": "and", "conditions": [...]}
  },
  "default": {"rule": "False_"}
}
```

**Frontend implementation:** Evaluate `key`, look up result in `cases`, fall back to `default` if key not found.

