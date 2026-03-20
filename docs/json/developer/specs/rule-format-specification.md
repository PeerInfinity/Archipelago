# Rule Format Specification

This document describes the three rule format systems used in this project:

1. **AST Format** - The internal format produced by the AST analyzer
2. **Original Rule Builder Format** - From Archipelago PR #5048
3. **Extended Rule Builder Format** - Extensions added in this fork

## Format Overview

| Format | Identifier | Origin | Status |
|--------|------------|--------|--------|
| AST Format | `type` field | This project's AST analyzer | Internal use |
| Original Rule Builder | `rule` field | [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) | Active development |
| Extended Rule Builder | `rule` field | This fork | Production use |

---

## AST Format

The AST format is produced by the `exporter/analyzer/` package when analyzing Python lambda rules from original Archipelago worlds. It mirrors the structure of Python AST nodes.

### General Structure

```json
{
  "type": "<type_name>",
  // type-specific fields
}
```

### Rule Types

#### Constants

**`constant`** - Literal values
```json
{"type": "constant", "value": true}
{"type": "constant", "value": false}
{"type": "constant", "value": 42}
{"type": "constant", "value": "string"}
```

#### Item Rules

**`item_check`** - Check if player has item(s)
```json
{
  "type": "item_check",
  "item": "Sword",
  "count": 1
}
```

**`count_check`** - Check item count (similar to item_check)
```json
{
  "type": "count_check",
  "item": "Key",
  "count": 3
}
```

**`group_check`** - Check items from an item group
```json
{
  "type": "group_check",
  "group": "Weapons",
  "count": 2
}
```

#### Logical Operators

**`and`** - All conditions must be true
```json
{
  "type": "and",
  "conditions": [
    {"type": "item_check", "item": "Sword"},
    {"type": "item_check", "item": "Shield"}
  ]
}
```

**`or`** - Any condition must be true
```json
{
  "type": "or",
  "conditions": [
    {"type": "item_check", "item": "Hookshot"},
    {"type": "item_check", "item": "Boots"}
  ]
}
```

**`not`** - Negate a condition
```json
{
  "type": "not",
  "condition": {"type": "item_check", "item": "Sword"}
}
```

#### State Methods

**`state_method`** - Calls to state methods (has, has_all, has_any, etc.)
```json
{
  "type": "state_method",
  "method": "has",
  "args": [
    {"type": "constant", "value": "Sword"}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "has_all",
  "args": [
    {"type": "list", "items": ["Sword", "Shield", "Bow"]}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "has_any",
  "args": [
    {"type": "list", "items": ["Hookshot", "Boots"]}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "has_group",
  "args": [
    {"type": "constant", "value": "Weapons"},
    {"type": "constant", "value": 2}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "count",
  "args": [
    {"type": "constant", "value": "Key"}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "count_group_unique",
  "args": [
    {"type": "constant", "value": "Collectibles"}
  ]
}
```

```json
{
  "type": "state_method",
  "method": "can_reach",
  "args": [
    {"type": "constant", "value": "Boss Room"},
    {"type": "constant", "value": "Region"}
  ]
}
```

#### Reachability

**`can_reach`** - Check if region is reachable
```json
{
  "type": "can_reach",
  "region": "Death Mountain"
}
```

**`location_check`** - Check if location is reachable
```json
{
  "type": "location_check",
  "location": "Chest in Cave"
}
```

**`can_reach_entrance`** - Check if entrance is reachable
```json
{
  "type": "can_reach_entrance",
  "entrance": "Cave Entrance"
}
```

#### Helpers

**`helper`** - Reference to a helper function
```json
{
  "type": "helper",
  "name": "can_lift_rocks",
  "args": [],
  "body": {"type": "item_check", "item": "Gloves"}
}
```

With arguments:
```json
{
  "type": "helper",
  "name": "has_medallion",
  "args": [
    {"type": "constant", "value": "Bombos"}
  ],
  "params": ["medallion_name"],
  "body": {"type": "item_check", "item": {"type": "name", "name": "medallion_name"}}
}
```

#### Expressions

**`compare`** - Comparison operations
```json
{
  "type": "compare",
  "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Key"}]},
  "op": ">=",
  "right": {"type": "constant", "value": 3}
}
```

Supported operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not in`

**`binary_op`** - Arithmetic operations
```json
{
  "type": "binary_op",
  "left": {"type": "state_method", "method": "count", "args": [{"type": "constant", "value": "Puppy"}]},
  "op": "*",
  "right": {"type": "constant", "value": 3}
}
```

Supported operators: `+`, `-`, `*`, `/`, `//`, `%`, `**`

**`conditional`** - Ternary/if-else expressions
```json
{
  "type": "conditional",
  "test": {"type": "setting_value", "setting": "hard_mode"},
  "if_true": {"type": "item_check", "item": "Master Sword"},
  "if_false": {"type": "item_check", "item": "Sword"}
}
```

#### Advanced Types

**`attribute`** - Object attribute access
```json
{
  "type": "attribute",
  "object": {"type": "name", "name": "world"},
  "attribute": "options"
}
```

**`subscript`** - Array/dict indexing
```json
{
  "type": "subscript",
  "value": {"type": "name", "name": "items"},
  "index": {"type": "constant", "value": 0}
}
```

**`name`** - Variable reference
```json
{
  "type": "name",
  "name": "player"
}
```

**`list`** - List literal
```json
{
  "type": "list",
  "items": ["Sword", "Shield", "Bow"]
}
```

**`setting_value`** - Game option/setting reference
```json
{
  "type": "setting_value",
  "setting": "shuffle_keys"
}
```

#### Rarely Used Types

These types are produced by the analyzer but rarely appear in practice:

- `all_of` / `any_of` - Generator expressions
- `f_string` / `formatted_value` - String formatting
- `function_call` / `method_call` - Arbitrary calls
- `lambda` - Nested lambda expressions
- `for_iter` / `for_range` / `while_loop` - Loop constructs
- `if_statement` / `block` / `assign` / `return` - Control flow
- `negate` - Unary minus
- `player_id` - Player ID reference
- `prog_item_count` - Progressive item count
- `region_attribute` / `region_reference` - Region references
- `group_count` - Group count without rule check
- `set` / `map` / `max` / `min` / `sum` / `sum_of` - Collections and aggregations

---

## Original Rule Builder Format (PR #5048)

The Rule Builder format was created by drtchops in [Archipelago PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048). It provides a declarative, class-based approach to defining rules.

**Source**: [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) (original `rules-engine` branch no longer available)

### General Structure

```json
{
  "rule": "<RuleClassName>",
  "options": [],
  "args": { /* named arguments */ },
  "children": [ /* for composite rules */ ]
}
```

### Original Rule Classes

#### Boolean Constants

**`True_`** - Always true
```json
{"rule": "True_", "options": [], "args": {}}
```

**`False_`** - Always false
```json
{"rule": "False_", "options": [], "args": {}}
```

#### Item Rules

**`Has`** - Check if player has item
```json
{
  "rule": "Has",
  "options": [],
  "args": {"item_name": "Sword", "count": 1}
}
```

**`HasAll`** - Check if player has all items
```json
{
  "rule": "HasAll",
  "options": [],
  "args": {"item_names": ["Sword", "Shield", "Bow"]}
}
```

**`HasAny`** - Check if player has any item
```json
{
  "rule": "HasAny",
  "options": [],
  "args": {"item_names": ["Hookshot", "Boots"]}
}
```

**`HasAllCounts`** - Check multiple items with counts
```json
{
  "rule": "HasAllCounts",
  "options": [],
  "args": {"items": {"Key": 3, "Bomb": 5}}
}
```

**`HasAnyCount`** - Check any item with count
```json
{
  "rule": "HasAnyCount",
  "options": [],
  "args": {"items": {"Key": 3, "Bomb": 5}}
}
```

**`HasFromList`** - Check N items from list (summing counts)
```json
{
  "rule": "HasFromList",
  "options": [],
  "args": {"item_names": ["Key A", "Key B", "Key C"], "count": 2}
}
```

**`HasFromListUnique`** - Check N unique items from list
```json
{
  "rule": "HasFromListUnique",
  "options": [],
  "args": {"item_names": ["Medal A", "Medal B", "Medal C"], "count": 2}
}
```

**`HasGroup`** - Check items from group (summing counts)
```json
{
  "rule": "HasGroup",
  "options": [],
  "args": {"item_name_group": "Weapons", "count": 3}
}
```

**`HasGroupUnique`** - Check unique items from group
```json
{
  "rule": "HasGroupUnique",
  "options": [],
  "args": {"item_name_group": "Collectibles", "count": 5}
}
```

#### Composite Rules

**`And`** - All children must be true
```json
{
  "rule": "And",
  "options": [],
  "children": [
    {"rule": "Has", "args": {"item_name": "Sword"}},
    {"rule": "Has", "args": {"item_name": "Shield"}}
  ]
}
```

**`Or`** - Any child must be true
```json
{
  "rule": "Or",
  "options": [],
  "children": [
    {"rule": "Has", "args": {"item_name": "Hookshot"}},
    {"rule": "Has", "args": {"item_name": "Boots"}}
  ]
}
```

#### Reachability Rules

**`CanReachRegion`** - Check if region is reachable
```json
{
  "rule": "CanReachRegion",
  "options": [],
  "args": {"region_name": "Death Mountain"}
}
```

**`CanReachLocation`** - Check if location is reachable
```json
{
  "rule": "CanReachLocation",
  "options": [],
  "args": {"location_name": "Chest in Cave"}
}
```

**`CanReachEntrance`** - Check if entrance is reachable
```json
{
  "rule": "CanReachEntrance",
  "options": [],
  "args": {"entrance_name": "Cave Entrance"}
}
```

#### Wrapper Rules

**`Filtered`** - Apply option-based filtering
```json
{
  "rule": "Filtered",
  "options": [{"option": "hard_mode", "value": true}],
  "child": {"rule": "Has", "args": {"item_name": "Master Sword"}}
}
```

---

## Extended Rule Builder Format (This Fork)

This fork extends the original Rule Builder format with additional rules needed to represent AST format patterns.

### Extension Rules

#### Logical

**`Not`** - Negate a rule
```json
{
  "rule": "Not",
  "options": [],
  "child": {"rule": "Has", "args": {"item_name": "Sword"}}
}
```

**Status**: Extension - not in original Rule Builder

#### Numeric

**`CountItem`** - Get item count as number (for use in expressions)
```json
{
  "rule": "CountItem",
  "options": [],
  "args": {"item_name": "Key"}
}
```

**Status**: Extension - not in original Rule Builder

#### Expressions

**`Compare`** - Comparison operations
```json
{
  "rule": "Compare",
  "options": [],
  "args": {
    "left": {"rule": "CountItem", "args": {"item_name": "Key"}},
    "op": ">=",
    "right": 3
  }
}
```

Supported operators: `==`, `!=`, `<`, `<=`, `>`, `>=`

**Status**: Extension - not in original Rule Builder

**`Arithmetic`** - Arithmetic operations
```json
{
  "rule": "Arithmetic",
  "options": [],
  "args": {
    "left": {"rule": "CountItem", "args": {"item_name": "Puppy"}},
    "op": "*",
    "right": 3
  }
}
```

Supported operators: `+`, `-`, `*`, `/`, `//`, `%`

**Status**: Extension - not in original Rule Builder

**`MinValue`** - Minimum of multiple values
```json
{
  "rule": "MinValue",
  "options": [],
  "args": {
    "values": [
      {"rule": "CountItem", "args": {"item_name": "Key A"}},
      {"rule": "CountItem", "args": {"item_name": "Key B"}}
    ]
  }
}
```

**Status**: Extension - not in original Rule Builder

#### Control Flow

**`Conditional`** - Ternary/if-else logic
```json
{
  "rule": "Conditional",
  "options": [],
  "args": {
    "test": {"rule": "Has", "args": {"item_name": "Hard Mode Flag"}},
    "if_true": {"rule": "Has", "args": {"item_name": "Master Sword"}},
    "if_false": {"rule": "Has", "args": {"item_name": "Sword"}}
  }
}
```

**Status**: Extension - not in original Rule Builder

#### Helpers

**`HelperCall`** - Call a helper function

**Current format (with inlined body):**
```json
{
  "rule": "HelperCall",
  "options": [],
  "args": {
    "helper_name": "can_lift_rocks",
    "args": [],
    "body_data": {"type": "item_check", "item": "Gloves"}
  }
}
```

⚠️ **Known Issue**: The current implementation inlines `body_data` at every call site, defeating the purpose of helpers. The same body is duplicated many times throughout the file.

**Proposed format (reference only):**
```json
{
  "rule": "HelperCall",
  "options": [],
  "args": {
    "helper_name": "can_lift_rocks",
    "args": []
  }
}
```

With arguments:
```json
{
  "rule": "HelperCall",
  "options": [],
  "args": {
    "helper_name": "has_medallion",
    "args": ["Bombos"]
  }
}
```

Helper bodies would be looked up from the top-level `helpers` section (which already exists in the file format). This matches how the AST format handles helpers.

**Status**: Extension - not in original Rule Builder. Needs refactoring to use reference-based lookup.

#### Legacy Support

**`ASTRule`** - Wrapper for AST format rules that can't be converted
```json
{
  "rule": "ASTRule",
  "options": [],
  "args": {
    "rule_data": {"type": "some_unknown_type", "...": "..."}
  }
}
```

**Status**: Extension - for backward compatibility only

---

## Proposed Rules (Phase 0 Consideration)

These rules are proposed additions to address gaps in the current extended Rule Builder format. They would provide better coverage for AST format patterns that currently fall back to `ASTRule`.

### Numeric

**`MaxValue`** - Maximum of multiple values (complements `MinValue`)
```json
{
  "rule": "MaxValue",
  "options": [],
  "args": {
    "values": [
      {"rule": "CountItem", "args": {"item_name": "Key A"}},
      {"rule": "CountItem", "args": {"item_name": "Key B"}}
    ]
  }
}
```

**Status**: Proposed - adds symmetry with `MinValue`

**`CountGroup`** - Get group item count as number (summing all items)
```json
{
  "rule": "CountGroup",
  "options": [],
  "args": {"item_name_group": "Weapons"}
}
```

**Status**: Proposed - numeric counterpart to `HasGroup`

**`CountGroupUnique`** - Get unique group item count as number
```json
{
  "rule": "CountGroupUnique",
  "options": [],
  "args": {"item_name_group": "Collectibles"}
}
```

**Status**: Proposed - numeric counterpart to `HasGroupUnique`

**`Sum`** - Add multiple values together
```json
{
  "rule": "Sum",
  "options": [],
  "args": {
    "values": [
      {"rule": "CountItem", "args": {"item_name": "Red Key"}},
      {"rule": "CountItem", "args": {"item_name": "Blue Key"}},
      {"rule": "CountItem", "args": {"item_name": "Green Key"}}
    ]
  }
}
```

**Status**: Proposed - aggregation for multiple counts

**`Negate`** - Unary minus for numbers
```json
{
  "rule": "Negate",
  "options": [],
  "args": {
    "value": {"rule": "CountItem", "args": {"item_name": "Penalty"}}
  }
}
```

**Status**: Proposed - matches AST format `negate` type

### Data Access

**`SettingValue`** - Access game options/settings
```json
{
  "rule": "SettingValue",
  "options": [],
  "args": {"setting": "shuffle_keys"}
}
```

**Status**: Proposed - matches AST format `setting_value` type

**`Subscript`** - Array/dict indexing
```json
{
  "rule": "Subscript",
  "options": [],
  "args": {
    "value": {"rule": "SettingValue", "args": {"setting": "medallion_table"}},
    "index": "turtle_rock"
  }
}
```

With numeric index:
```json
{
  "rule": "Subscript",
  "options": [],
  "args": {
    "value": {"type": "list", "items": ["Sword", "Master Sword", "Tempered Sword"]},
    "index": 2
  }
}
```

**Status**: Proposed - matches AST format `subscript` type

### Membership

**`Contains`** - Check if value is in a list (for `in` operator)
```json
{
  "rule": "Contains",
  "options": [],
  "args": {
    "value": {"rule": "SettingValue", "args": {"setting": "current_mode"}},
    "container": ["normal", "hard", "expert"]
  }
}
```

**Status**: Proposed - supports `x in [...]` comparisons

---

## Format Mapping

### AST → Rule Builder Conversion

| AST Type | Rule Builder | Notes |
|----------|--------------|-------|
| `constant` (true) | `True_` | Direct |
| `constant` (false) | `False_` | Direct |
| `item_check` | `Has` | Direct |
| `count_check` | `Has` | Direct |
| `group_check` | `HasGroup` | Direct |
| `and` | `And` | Direct |
| `or` | `Or` | Direct |
| `not` | `Not` | Extension |
| `can_reach` | `CanReachRegion` | Direct |
| `location_check` | `CanReachLocation` | Direct |
| `can_reach_entrance` | `CanReachEntrance` | Direct |
| `state_method` (has) | `Has` | Direct |
| `state_method` (has_all) | `HasAll` | Direct |
| `state_method` (has_any) | `HasAny` | Direct |
| `state_method` (has_group) | `HasGroup` | Direct |
| `state_method` (count) | `CountItem` | Extension |
| `helper` | `HelperCall` | Extension |
| `compare` | `Compare` | Extension |
| `binary_op` | `Arithmetic` | Extension |
| `conditional` | `Conditional` | Extension |
| `state_method` (count_group) | `CountGroup` | Proposed |
| `state_method` (count_group_unique) | `CountGroupUnique` | Proposed |
| `max` | `MaxValue` | Proposed |
| `min` | `MinValue` | Extension |
| `sum` | `Sum` | Proposed |
| `negate` | `Negate` | Proposed |
| `setting_value` | `SettingValue` | Proposed |
| `subscript` | `Subscript` | Proposed |
| `compare` (with `in` op) | `Contains` | Proposed |
| `attribute` | `ASTRule` | Preserved |
| Other | `ASTRule` | Preserved |

---

## Phase 0 Decision Checklist

For each extension, decide: **Official** (keep as standard) or **Deprecated** (remove/replace)

### Existing Extensions

| Extension Rule | Recommendation | Decision |
|----------------|----------------|----------|
| `Not` | Official | [x] Approved |
| `CountItem` | Official | [x] Approved |
| `Compare` | Official | [x] Approved |
| `Arithmetic` | Official | [x] Approved |
| `MinValue` | Official | [x] Approved |
| `Conditional` | Official | [x] Approved |
| `HelperCall` | Official | [x] Approved |
| `ASTRule` | Deprecated (internal only) | [x] Approved |

### Proposed Additions

| Proposed Rule | Purpose | Replaces `ASTRule` for | Decision |
|---------------|---------|----------------------|----------|
| `MaxValue` | Maximum of multiple values | `max(...)` expressions | [x] Add |
| `CountGroup` | Get group count as number | `state.count_group(...)` | [x] Add |
| `CountGroupUnique` | Get unique group count as number | `state.count_group_unique(...)` | [x] Add |
| `Sum` | Sum multiple values | `sum(...)` expressions | [x] Add |
| `Negate` | Unary minus for numbers | `-x` expressions | [x] Add |
| `SettingValue` | Access game options | `world.options.x` / `setting_value` | [x] Add |
| `Subscript` | Array/dict indexing | `x[y]` / `subscript` | [x] Add |
| `Contains` | Check value in list | `x in [...]` comparisons | [x] Add |

### Structural Changes

| Change | Issue | Decision |
|--------|-------|----------|
| `HelperCall` reference-based lookup | Currently inlines `body_data` at every call site | [x] Refactor (Phase 2) |

### Structural Changes

| Change | Issue | Impact | Decision |
|--------|-------|--------|----------|
| `HelperCall` reference-based lookup | Currently inlines `body_data` at every call site, duplicating helper bodies many times | Reduces file size, matches AST format design | [ ] Refactor |

---

## Implementation Details: HelperCall Refactoring

This section documents the required changes to fix the `HelperCall` body inlining issue.

### Current Behavior

**Non-worldgen worlds (AST analyzer)**:
- Helper references in rules: `{"type": "helper", "name": "can_swim", "args": []}`
- Helpers section populated: `helpers["1"]["can_swim"] = {...body...}`
- Frontend looks up body from helpers section ✓

**Worldgen worlds (Rule Builder)**:
- Helper references in rules: `{"rule": "HelperCall", "args": {"helper_name": "air_dash", "body_data": {...body...}}}`
- Helpers section: EMPTY
- Frontend uses inlined `body_data` (duplicated everywhere) ✗

### Required Changes

#### 1. `rule_builder/rules.py` - HelperCall._get_args_dict()

**File**: `rule_builder/rules.py:2976-2981`

**Current**:
```python
def _get_args_dict(self) -> dict[str, Any]:
    return {
        "helper_name": self.helper_name,
        "args": self.args,
        "body_data": self.body_data,  # ← Remove this
    }
```

**Change**: Remove `body_data` from serialization output.

#### 2. Worldgen Helper Export

Two options:

**Option A: World Generator exports helpers dict**

Add helper definitions to a new `get_helper_definitions()` method on worldgen World classes, returning a dict like:
```python
{
    "air_dash": {"type": "item_check", "item": "PNEUMATOPHORE"},
    "airship": {"type": "item_check", "item": "DOCK KEY"},
    ...
}
```

The exporter already calls `game_handler.get_helper_definitions(world)` and stores the result in `export_data['helpers'][player_str]`.

**Option B: Exporter extracts helpers from worldgen Rules.py**

Modify `get_helper_definitions()` in the base game handler to also discover helpers from worldgen Rules.py files by:
1. Finding functions matching `_<worldname>_<helper_name>`
2. Analyzing them with the AST analyzer
3. Stripping the prefix from helper names

**Recommendation**: Option A is cleaner - the world generator already has the helper bodies available when creating `HelperCall` rules.

#### 3. World Generator Changes

**File**: `world_generator/rule_codegen.py`

The `_convert_helper()` method (lines 1241-1307) currently embeds `body_data`. Changes needed:

1. Remove `body_data` parameter from HelperCall generation
2. Generate a `get_helper_definitions()` method that returns all helper bodies

**Current code pattern**:
```python
# Lines 1284-1301
if helper_name in self.helper_bodies:
    body = self.helper_bodies[helper_name]
    expanded_body = self._expand_helper_refs(body)
    parts.append(f'body_data={repr(expanded_body)}')
```

**New pattern**: Collect helper bodies for separate export, don't inline.

#### 4. Frontend (No Changes Needed)

The frontend already supports reference-based lookup. In `evaluateRuleBuilderRule()`:

```javascript
// Lines 4733-4737 in ruleEngine.js
const helperName = args.helper_name;
if (helperName) {
  const helperArgs = args.args || [];
  return evaluateRule({ type: 'helper', name: helperName, args: helperArgs }, ...);
}
```

This delegates to the AST format `helper` case which looks up from `staticData?.helpers?.[playerIdKey]?.[rule.name]`.

### Migration Path

1. **Phase 1**: Update worldgen to export helpers section
2. **Phase 2**: Keep `body_data` serialization for backward compatibility
3. **Phase 3**: Remove `body_data` from `_get_args_dict()`
4. **Phase 4**: Regenerate all worldgen presets
5. **Phase 5**: Remove `body_data` fallback code from frontend (optional)

### File Size Impact

Estimated reduction for typical worldgen world:
- Current: Each helper body repeated 10-50+ times
- After: Each helper body stored once
- Expected reduction: 50-80% for rules.json files with many helper calls

---

## References

- Original Rule Builder PR: https://github.com/ArchipelagoMW/Archipelago/pull/5048
- Original source branch no longer available
- AST Analyzer: `exporter/analyzer/`
- Rule Builder classes: `rule_builder/rules.py`
- AST format parser: `rule_builder/ast_format.py`
- Format converter: `exporter/converter/`
