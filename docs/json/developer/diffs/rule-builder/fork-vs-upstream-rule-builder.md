# Fork vs Upstream Rule Builder Comparison

Comparison of this repository's Rule Builder (`rule_builder/rules.py`) with upstream commit `0de09cd7` (`rule_builder/rules.py`, 1823 lines). Focus: API differences that affect compatibility, and upstream features missing from the fork.

## Architecture Differences

### World mixin and LogicMixin

| Aspect | Upstream | Fork |
|--------|----------|------|
| World base class | `CachedRuleBuilderWorld(World)` in `cached_world.py` | `RuleWorldMixin(World)` in `rules.py` |
| LogicMixin | `CachedRuleBuilderLogicMixin(LogicMixin)` in `cached_world.py` | `RuleBuilderLogicMixin` with lazy `_LogicMixinMeta` metaclass in `rules.py` |
| Cache attribute name | `state.rule_builder_cache` | `state.rule_builder_cache` (aligned) |
| TWorld bound | `bound=World` (any World) | `bound=World` (aligned) |
| `_instantiate` caching_enabled | `getattr(world, "rule_caching_enabled", False)` | `getattr(world, "rule_caching_enabled", False)` (aligned) |

### And/Or simplification

| Aspect | Upstream | Fork |
|--------|----------|------|
| Location | `And._instantiate()` and `Or._instantiate()` | `And._instantiate()` and `Or._instantiate()` (aligned) |
| Trigger | During rule resolution (inside And/Or) | During rule resolution (inside And/Or) (aligned) |
| HasAllCounts/HasAnyCount coalescing | Yes (And coalesces to HasAllCounts, Or to HasAnyCount) | Yes (aligned) |
| Legacy `_simplify_and`/`_simplify_or` | Not present | Kept for backward compat but unused by `simplify_rule()` |

### Rule caching (singleton dedup)

| Aspect | Upstream | Fork |
|--------|----------|------|
| Mechanism | `CustomRuleRegister.__call__` (metaclass on Resolved) | `RuleWorldMixin.get_cached_rule()` (manual after resolve) |
| Scope | Global class-level `resolved_rules` dict | Per-world `rules_by_hash` dict |

The fork also has the metaclass singleton caching from upstream but additionally has per-world caching in `RuleWorldMixin`.

## OptionFilter Differences

| Aspect | Upstream (`options.py`) | Fork (`options.py`, imported by `rules.py`) |
|--------|------------------------|---------------------------------------------|
| Generic | `OptionFilter` (not generic) | `OptionFilter` (not generic, aligned) |
| `"in"` operator | Supported | Supported (aligned) |
| `REVERSE_OPERATORS` | Defined | Defined (aligned) |
| `check()` comparison | `fn(self.value, opt)` for reverse ops, `fn(opt, self.value)` otherwise | `fn(self.value, opt)` for reverse ops, `fn(opt, self.value)` otherwise (aligned) |
| Variable naming | `OPERATORS`, `OPERATOR_STRINGS`, `REVERSE_OPERATORS` (Final constants) | `OPERATORS`, `OPERATOR_STRINGS`, `REVERSE_OPERATORS` (aligned) |
| Module location | Separate `options.py` | Separate `options.py`, imported by `rules.py` (aligned) |

## Rule Base Class (`Rule`) Differences

### `__and__` / `__or__` operators

| Aspect | Upstream | Fork |
|--------|----------|------|
| Accepts `OptionFilter` | Yes: `Rule | Iterable[OptionFilter] | OptionFilter` | Yes (aligned) |
| `__rand__` / `__ror__` | Defined | Defined (aligned) |
| `<<` operator | Not defined | Defined (`__lshift__` for Filtered wrapping — fork-only convenience) |

### `__init_subclass__`

| Aspect | Upstream | Fork |
|--------|----------|------|
| Module check | `cls.__module__ != "rule_builder.rules"` | `not cls.__module__.startswith("rule_builder")` |

The fork allows rules defined in any `rule_builder.*` module (e.g., `rule_builder.ast_format`).

### `from_dict` second parameter

| Aspect | Upstream | Fork |
|--------|----------|------|
| Type | `type[World]` | `type[World]` (aligned) |

### `Resolved._evaluate` return + extra methods

| Aspect | Upstream | Fork |
|--------|----------|------|
| `get_value()` | Not present | Returns `1 if _evaluate() else 0` (overridden by counting rules) |
| `get_count()` | Not present | Returns `1 if _evaluate() else 0` (overridden by counting rules) |
| `to_dict()` on Resolved | Not present | Returns `{"rule": ..., "args": ...}` (for JSON export) |
| `_get_args_dict()` on Resolved | Not present | Override point for Resolved serialization |
| `_rule_class_name` property | Not present | Strips `.Resolved` from `__qualname__` |

### `caching_enabled` default

| Aspect | Upstream | Fork |
|--------|----------|------|
| Default | `False` | `True` |

Note: The fork uses `getattr(world, "rule_caching_enabled", False)` in `_instantiate`, so worlds without `rule_caching_enabled` will default to `False` (matching upstream behavior). `RuleWorldMixin` sets it to `True` explicitly.

### `to_dict()` format

| Aspect | Upstream | Fork |
|--------|----------|------|
| Empty fields | Always includes `options`, `filtered_resolution`, `args` | Omits empty `options`, false `filtered_resolution`, empty `args` |

### `resolve()` false case

| Aspect | Upstream | Fork |
|--------|----------|------|
| When filtered out (false) | `False_().resolve(world)` | `world.false_rule` (pre-initialized) |

## Per-Rule Class Differences

### `Has`

| Aspect | Upstream | Fork |
|--------|----------|------|
| `count` type | `int` | `int \| Rule[TWorld]` (supports dynamic counts via nested rules) |
| `Resolved.count` type | `int` | `int \| Rule.Resolved` |
| `_evaluate` | Direct `prog_items >= self.count` | Calls `_get_count_value()` which may evaluate a nested rule |
| `to_dict()` | Default (always includes count) | Custom: omits `count` when == 1, serializes Rule counts as dicts |

### `HasAll`, `HasAny`, `HasFromList`, `HasFromListUnique`

All aligned with upstream (PR #5912 bugfix applied):
- `__init__` accepts `filtered_resolution: bool = False`
- `from_dict` passes `filtered_resolution=data.get("filtered_resolution", False)`

### `HasAllCounts`, `HasAnyCount`, `HasGroup`, `HasGroupUnique`

These appear identical in API between fork and upstream (no custom `__init__`, so they inherit from `Rule` which handles `filtered_resolution` correctly).

### `CanReachLocation`, `CanReachRegion`, `CanReachEntrance`

Identical in API and behavior.

## Fork-Only Rule Types

These exist only in the fork and have no upstream equivalent:

| Rule | Purpose |
|------|---------|
| `EntranceAccessRuleCall` | Evaluates another entrance's access rule |
| `ASTRule` | Wraps an AST-format expression for resolution |
| `Not` | Boolean negation (WrapperRule subclass) |
| `CountItem` | Returns count of an item (numeric, not boolean) |
| `CountFromList` | Returns sum of counts from a list of items |
| `CountGroup` | Returns count from an item group |
| `Compare` | Compares two numeric rules with an operator |
| `Arithmetic` | Arithmetic between two numeric rules |
| `MinValue` | Minimum of multiple numeric rules |
| `MaxValue` | Maximum of multiple numeric rules |
| `Conditional` | If-then-else for rules |
| `HelperCall` | Calls a helper function/rule by name |
| `WeightedSum` | Weighted sum of items |
| `UniqueCount` | Count of unique items from a list |
| `OptionValue` | Reads an option value at runtime |

Supporting modules:
- `rule_builder/ast_format.py` — Parses AST-format JSON into Rule Builder rules
- `rule_builder/ast_explain.py` — Explanation/display for AST rules
- `rule_builder/_ast_utils.py` — Utilities for AST processing
- `rule_builder/pathfinding.py` — `PathExistsToRegion`, `HypotheticalState`, etc.

Also fork-only:
- `RuleWorldMixin` extras: `resolve_rule()`, `get_cached_rule()`, `simplify_rule()`, `register_rule_connections()`, `register_dependencies()`, `create_entrance()`, `set_completion_rule()`, `collect_item()`
- `_make_hashable()` — Handles unhashable fields (dicts, lists) in rule hashing
- `BOOLEAN_RULE_TYPES` — frozenset classifying which rules produce booleans

## Remaining Differences

These are intentional design differences that don't affect upstream compatibility:

1. **`caching_enabled` default `True` vs `False`**: Fork's `RuleWorldMixin` explicitly sets it, and `getattr` pattern ensures non-mixin worlds get `False`
2. **`to_dict()` omitting empty fields**: Reduces JSON size, no functional impact
3. **`resolve()` false case using `world.false_rule`**: Pre-initialized for performance
4. **`<<` operator**: Fork convenience, doesn't conflict with upstream
5. **`__init_subclass__` module check**: Fork allows broader rule_builder submodules
6. **Legacy `_simplify_and`/`_simplify_or`**: Kept for external callers (exporter, etc.)
