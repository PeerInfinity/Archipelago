# Rule Builder Modifications

This document provides a brief overview of the modifications made to the Rule Builder compared to the original [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) by drtchops.

- **Original source:** [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) by drtchops (original `rules-engine` branch no longer available)
- **Location in this repository:** `rule_builder/`
- **Last updated:** 2026-02-11

## Summary of Changes

The modifications extend Rule Builder with:
1. **AST format support** for parsing JSON AST rules from the exporter
2. **AST explanation system** for human-readable rule explanations
3. **Pathfinding tools** for accessibility analysis
4. **Extended rule types** to support the full range of exported AST rules

These changes integrate Rule Builder with the JSON Export system, enabling round-trip conversion between Python rules and JSON format.

---

## File Overview

| File | Lines | Origin | Description |
|------|-------|--------|-------------|
| `rules.py` | 4219 | Modified from PR #5048 | Core rule classes, extended with AST rule types |
| `ast_explain.py` | 803 | **New** | Human-readable explanations for AST rules |
| `ast_format.py` | 642 | **New** | Parse AST JSON into Rule Builder objects |
| `pathfinding.py` | 429 | **New** | Pathfinding and accessibility analysis tools |
| `_ast_utils.py` | 178 | **New** | Shared AST parsing utilities |
| `__init__.py` | 165 | **New** | Module exports and documentation |
| **Total** | **6436** | | |

---

## New Modules

### `ast_format.py`

Parses JSON AST rules into Rule Builder objects:

```python
from rule_builder import is_ast_format, parse_ast_rule

# Check if a rule dict is in AST format
if is_ast_format(rule_dict):
    rule = parse_ast_rule(rule_dict)
```

Supports all AST rule types from the exporter including:
- Logical operators (`and`, `or`, `not`, `conditional`)
- Item checks (`item_check`, `count_check`, `group_check`)
- Reachability (`can_reach`, `can_reach_entrance`, `location_check`)
- Comparisons (`compare`, `arithmetic`, `min_value`, `max_value`)
- Game-specific (`helper_call`, `option_value`, `weighted_sum`)

### `ast_explain.py`

Provides human-readable explanations of why rules pass or fail:

```python
from rule_builder.ast_explain import explain_rule

explanation = explain_rule(rule, state, world)
# Returns: ["Need Sword (have 0, need 1)", "Need Shield (have 1, need 1) ✓"]
```

Features:
- Recursive explanation of nested rules
- Item count display with current/required amounts
- Pass/fail indicators for each condition
- Support for all AST rule types

### `pathfinding.py`

Tools for analyzing region accessibility:

```python
from rule_builder import find_paths_to_region, HypotheticalState

# Find all paths to a region
paths = find_paths_to_region(state, target_region)

# Test with hypothetical items
hypo_state = HypotheticalState(state, additional_items=["Hookshot"])
```

Features:
- `PathExistsToRegion` - Rule class for path checking
- `find_paths_to_region()` - Find accessible paths
- `HypotheticalState` - Test with hypothetical items
- `RegionProperty` - Region property checks (ALttP light/dark world)
- `EntranceChainCondition` - Complex entrance chain analysis

---

## Extended Rule Types in `rules.py`

The original `rules.py` from PR #5048 has been extended with additional rule classes to support AST format:

### New Rule Classes

| Class | Purpose |
|-------|---------|
| `ASTRule` | Base class for AST-format rules |
| `Not` | Logical negation |
| `CountItem` | Get item count as number |
| `Compare` | Comparison operations (==, !=, <, >, <=, >=) |
| `Arithmetic` | Math operations (+, -, *, /) |
| `MinValue` / `MaxValue` | Min/max of multiple values |
| `Conditional` | Ternary if-then-else |
| `HelperCall` | Call game-specific helper functions |
| `WeightedSum` | Weighted sum of item counts |
| `OptionValue` | Access game options |

### Enhanced Existing Classes

- `RuleWorldMixin` - Extended for AST rule support, rule simplification, and entrance creation
- `Rule.Resolved` - Added `get_value()` and `get_count()` default methods, `to_dict()` serialization
- `OptionFilter` - Enhanced option filtering (generic type parameter)
- `CustomRuleRegister` - Extended for custom AST rules
- `NestedRule` - Accepts `filtered_resolution` parameter
- `Has` - Dynamic count support (`count` can be a `Rule` for expressions like `Has("item", count=CountItem("other"))`)

---

## Pyright Strict Type Checking

The upstream pyright config (`.github/pyright-config.json`) uses `typeCheckingMode: "strict"` with `reportImplicitOverride: "error"`. Since this repo consolidates `cached_world.py` and `options.py` into `rules.py`, the pyright config has been updated to remove references to those non-existent files.

Key type annotation changes in `rules.py`:
- `@override` decorators on all `RuleWorldMixin` methods that override `World` methods
- `@override` decorators on all `get_value`/`get_count` subclass methods
- `cast()` with `# pyright: ignore` for `state.rule_builder_cache` access (matching upstream's pattern)
- `# pyright: ignore[reportIncompatibleMethodOverride]` on `RuleWorldMixin` methods with intentionally narrowed parameter types (accepts `Rule[Self]` instead of `CollectionRule | Rule[Any]`)
- Explicit `dict[str, Any]` type annotations where pyright infers `dict[str, str]`
- Parameterized `default_factory` lambdas for `dict` and `list` dataclass fields

The `ast_explain.py` module now imports `JSONMessagePart` from `NetUtils` instead of defining its own `dict[str, Any]` alias, ensuring type compatibility with `rules.py`.

---

## Integration Points

### With Exporter

The exporter converts Python lambda rules to AST JSON:
```
Python lambda → AST JSON → Rule Builder objects
```

### With World Generator

The world generator converts AST JSON back to Rule Builder:
```
AST JSON → Rule Builder objects → Python world code
```

### With Universal Tracker

UT uses Rule Builder's explain system for rule explanations:
```
Rule Builder object → ast_explain → Human-readable text
```

---

## Future Work

A more thorough analysis comparing the exact changes to `rules.py` against the original PR #5048 would be valuable. This overview focuses on the new modules that were added specifically for this project.

---

## Related Documentation

- **Original PR:** https://github.com/ArchipelagoMW/Archipelago/pull/5048
- **Rule Builder README:** [rule_builder/README.md](../../../../../rule_builder/README.md)
- **Format Converter Guide:** [format-converter.md](../../guides/format-converter.md)
- **Rule Types Reference:** [rule-types-reference.md](../../reference/rule-types-reference.md)
