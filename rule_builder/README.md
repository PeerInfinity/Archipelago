# Rule Builder

Rule Builder is a declarative rule definition system for Archipelago. It replaces lambda-based access rules with composable, serializable Python objects — making game logic intrinsically convertible to and from JSON.

Rule Builder is now part of the main Archipelago repository (originally [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) by drtchops). This repository extends it with additional rule types, modules, and integration points needed by the [exporter](../exporter/README.md), [world generator](../world_generator/README.md), and web frontend.

## How It Works

In standard Archipelago, access rules are Python lambdas:

```python
# Traditional lambda rules — not serializable
set_rule(location, lambda state: state.has("Sword", player) and state.has("Shield", player))
```

Rule Builder replaces these with declarative objects that can be serialized to JSON and reconstructed:

```python
from rule_builder import Has, HasAll, And, Or, CanReachRegion, Rule

# Declarative rules
rule = Has("Sword") & Has("Shield")
rule = HasAll(["Key1", "Key2"]) | CanReachRegion("Shortcut")

# Serialize to JSON
rule_dict = rule.to_dict()

# Deserialize from JSON
rule = Rule.from_dict(rule_dict)
```

This is the foundation of the JSON export pipeline: the [exporter](../exporter/README.md) converts lambda rules to AST JSON, which can be parsed into Rule Builder objects, and the [world generator](../world_generator/README.md) converts them back into Python world code.

## Upstream Rule Types

These rule types are part of the upstream Archipelago Rule Builder:

| Category | Classes |
|----------|---------|
| Boolean | `True_`, `False_` |
| Composite | `And`, `Or`, `Filtered` |
| Item checks | `Has`, `HasAll`, `HasAny`, `HasAllCounts`, `HasAnyCount`, `HasFromList`, `HasFromListUnique`, `HasGroup`, `HasGroupUnique` |
| Reachability | `CanReachLocation`, `CanReachRegion`, `CanReachEntrance` |
| Base classes | `Rule`, `NestedRule`, `WrapperRule` |
| World integration | `RuleWorldMixin`, `RuleBuilderLogicMixin`, `OptionFilter` |

## Fork-Only Rule Types

This repository adds rule types to support the full range of patterns found in exported game logic:

| Class | Purpose |
|-------|---------|
| `Not` | Logical negation |
| `Conditional` | Ternary if-then-else |
| `CountItem` | Get item count as a number (not boolean) |
| `CountFromList` | Cumulative count from item list |
| `CountGroup` | Count from item group |
| `Compare` | Comparison operations (`==`, `!=`, `<`, `>`, `<=`, `>=`) |
| `Arithmetic` | Math operations (`+`, `-`, `*`, `/`) |
| `MinValue` / `MaxValue` | Min/max of multiple values |
| `WeightedSum` | Weighted sum of item counts |
| `UniqueCount` | Count of unique items from list |
| `HelperCall` | Call game-specific helper functions by name |
| `OptionValue` | Access game options at runtime |
| `EntranceAccessRuleCall` | Call another entrance's access rule |
| `ASTRule` | Wrapper for AST-format expressions |

### Enhanced Upstream Classes

- `Has` — Dynamic count support (`count` can be a `Rule` expression, e.g., `Has("item", count=CountItem("other"))`)
- `Rule.Resolved` — Added `get_value()`, `get_count()`, and `to_dict()` for counting rules and JSON export
- `RuleWorldMixin` — Extended for AST rule support, rule simplification, and entrance creation

## Fork-Only Modules

| Module | Purpose |
|--------|---------|
| `ast_format.py` | Parse AST JSON into Rule Builder objects |
| `ast_explain.py` | Human-readable rule explanations (used by Universal Tracker) |
| `pathfinding.py` | Region accessibility analysis and hypothetical state testing |
| `_ast_utils.py` | Shared AST parsing utilities |

### AST Format Parsing

```python
from rule_builder import is_ast_format, parse_ast_rule

if is_ast_format(rule_dict):
    rule = parse_ast_rule(rule_dict)
```

### Rule Explanations

```python
from rule_builder.ast_explain import explain_rule

explanation = explain_rule(rule, state, world)
# Returns: ["Need Sword (have 0, need 1)", "Need Shield (have 1, need 1) ✓"]
```

### Pathfinding

```python
from rule_builder import find_paths_to_region, HypotheticalState

paths = find_paths_to_region(state, target_region)
hypo_state = HypotheticalState(state, additional_items=["Hookshot"])
```

## Integration Points

```
Exporter:          Python lambda → AST JSON → Rule Builder objects
World Generator:   AST JSON → Rule Builder objects → Python world code
Universal Tracker: Rule Builder objects → ast_explain → Human-readable text
```

## Dependencies

This module requires Archipelago core modules:
- `BaseClasses` (CollectionState, Entrance, Item, Location, MultiWorld, Region)
- `NetUtils` (JSONMessagePart)
- `Options` (CommonOptions, Option)

It will only work when running within the Archipelago environment.

## Related Documentation

- [Rule Builder Modifications](../docs/json/developer/diffs/rule-builder/rule-builder-modifications.md) — Detailed list of changes from upstream PR #5048
- [Fork vs Upstream Comparison](../docs/json/developer/diffs/rule-builder/fork-vs-upstream-rule-builder.md) — API differences
- [Rule Types Reference](../docs/json/developer/reference/rule-types-reference.md) — Complete catalog of AST rule types
- [Format Converter](../exporter/converter/README.md) — Convert between Rule Builder and AST formats
- [Format Converter Guide](../docs/json/developer/guides/format-converter.md) — Full documentation
