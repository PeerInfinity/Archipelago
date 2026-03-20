# Game Handler Configuration Reference

This document lists all class-level configuration attributes available on `BaseGameExportHandler` and `GenericGameExportHandler`. Set these in your game-specific handler class to control export behavior.

**Source:** `exporter/games/base/handler.py` and mixin files in `exporter/games/base/`

## Inheritance

```
BaseGameExportHandler (handler.py)
  ├── RuleExpansionMixin (rule_expansion.py)
  ├── WorldDataMixin (world_data.py)
  ├── HelperDiscoveryMixin (helper_discovery.py)
  └── OptionNormalizationMixin (option_normalization.py)
        │
        └── GenericGameExportHandler (generic.py)
              │
              └── YourGameExportHandler (games/official/yourgame.py)
```

`GenericGameExportHandler` overrides `AUTO_EXPORT_DISCOVERED_HELPERS = True`. All other defaults come from `BaseGameExportHandler`.

## Helper Discovery and Export

These attributes control how helper functions are found and exported to JSON.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `HELPER_MODULES` | `List[str]` | `[]` | Module paths to search for helper functions (e.g., `['worlds.alttp.StateHelpers']`). |
| `AUTO_EXPORT_DISCOVERED_HELPERS` | `bool` | `False` (`True` in Generic) | Export all discovered helpers automatically. When False, only whitelisted helpers are exported. |
| `AUTO_DISCOVER_WORLD_HELPER_MODULES` | `bool` | `True` | Automatically discover helper modules from imported packages during rule analysis. |
| `HELPERS_TO_EXPORT_WHITELIST` | `Set[str]` | `set()` | Helpers that must always be exported, regardless of discovery settings. |
| `HELPERS_TO_EXPORT_BLACKLIST` | `Set[str]` | `set()` | Helpers that must never be exported, even if discovered. |
| `HELPERS_TO_PRESERVE` | `Set[str]` | `set()` | Helpers kept as `helper` call nodes during analysis instead of being inlined. |
| `AUTO_PRESERVE_LARGE_HELPERS` | `bool` | `True` | Automatically preserve helpers exceeding `HELPER_ANALYSIS_NODE_LIMIT` nodes. |
| `HELPER_ANALYSIS_NODE_LIMIT` | `int` | `100` | Max AST nodes before a helper is preserved instead of inlined. |
| `HELPER_PARAM_MAPPINGS` | `Dict[str, Dict[str, str]]` | `{}` | Manual parameter name mappings for helpers where auto-discovery fails. |
| `ITEM_NAME_MODULES` | `List[str]` | `[]` | Modules containing item name classes/constants for attribute resolution (e.g., `ItemName.Sword`). |
| `DICT_SUM_HELPERS` | `Dict[str, str]` | `{}` | Maps `helper_name` to `world_attribute_name` for auto-generating dict-sum helpers. |

### Example: ALttP

```python
HELPER_MODULES = ['worlds.alttp.StateHelpers', 'worlds.alttp.Shops']
AUTO_EXPORT_DISCOVERED_HELPERS = True
HELPERS_TO_EXPORT_WHITELIST = {'can_use_bombs', 'can_shoot_arrows', 'has_sword', ...}
```

### Example: TUNIC

```python
HELPERS_TO_PRESERVE = {'has_combat_reqs', 'check_combat_reqs', 'has_required_stats', ...}
```

## Rule Analysis Configuration

These attributes configure the AST and bytecode analyzers.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS` | `Set[str]` | `set()` | Item names recognized during bytecode fallback analysis. |
| `BYTECODE_HELPER_EXPANSIONS` | `Dict[str, List[str]]` | `{}` | Maps helper names to item lists for bytecode expansion (e.g., `has_sword` expands to all sword tiers). |
| `UNANALYZABLE_RULE_FALLBACK_ITEM` | `Optional[str]` | `None` | Fallback item requirement when a rule can't be analyzed (non-permissive modes only). |
| `PERMISSIVE_LOGIC_OPTION_NAME` | `Optional[str]` | `None` | Option that enables permissive/glitch logic (e.g., `'glitches_required'`). |
| `PERMISSIVE_LOGIC_OPTION_VALUES` | `List[str]` | `[]` | Option values that indicate permissive logic is active. |
| `KNOWN_OPTION_NAMES` | `Set[str]` | `set()` | Option names recognized during bytecode analysis. |

### Example: ALttP

```python
KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS = {'Moon Pearl', 'Magic Mirror', 'Pegasus Boots', ...}
BYTECODE_HELPER_EXPANSIONS = {'has_sword': ['Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword']}
UNANALYZABLE_RULE_FALLBACK_ITEM = 'Moon Pearl'
PERMISSIVE_LOGIC_OPTION_NAME = 'glitches_required'
PERMISSIVE_LOGIC_OPTION_VALUES = ['minor_glitches', 'overworld_glitches', 'hybrid_major_glitches', 'no_logic']
```

## Rule Expansion

These attributes control how analyzed rule trees are post-processed and simplified.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `STATE_METHOD_REPLACEMENTS` | `Dict[str, Dict]` | `{}` | Maps state method names to replacement rule structures. Combined with auto-detected LogicMixin patterns. |
| `NAME_REMAPPING` | `Dict[str, str]` | `{}` | Renames variables/attributes during expansion (e.g., `'flooded'` to `'precalculated_weights'`). |
| `SETTINGS_TO_CONVERT` | `Set[str]` | `set()` | Names converted from `name` type to `option_value` type during expansion. |
| `CONVERT_WORLD_METHODS_TO_HELPERS` | `bool` | `True` | Convert `world.method()` calls to helper function calls. |
| `HELPER_OBJECT_NAMES` | `Set[str]` | `{'world', 'self', 'logic'}` | Object names whose method calls become helper functions. |
| `ENABLE_LOSSLESS_SIMPLIFICATION` | `bool` | `True` | Apply constant folding, duplicate removal, and AND/OR flattening after expansion. |

## World Data Export

These attributes control what game data is included in the exported JSON.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `EXPORTED_OPTIONS` | `List[str]` | `[]` | Option names to export at top level. |
| `WORLD_ATTRIBUTES` | `Dict[str, Callable]` | `{}` | Maps attribute names to compute functions `(world, multiworld, player) -> value`. |
| `COMPUTED_SETTINGS` | `Dict[str, Callable]` | `{}` | Deprecated alias for `WORLD_ATTRIBUTES`. |
| `AUTO_DISCOVER_WORLD_ATTRIBUTES` | `bool` | `False` | Auto-discover simple attributes (bool, int, float, str) from world instance. |
| `AUTO_DISCOVER_REGION_ATTRIBUTES` | `bool` | `False` | Auto-discover simple attributes from region objects. |
| `AUTO_DISCOVER_LOCATION_ATTRIBUTES` | `bool` | `False` | Auto-discover simple attributes from location objects. |
| `EXPORT_CHOICE_OPTIONS_AS_NUMERIC` | `bool` | `True` | Export Choice option values as integers instead of string keys. |
| `ITEM_VALUE_MAPPINGS` | `Dict[str, Dict]` | `{}` | Configuration for computing item-to-value mappings from world attributes. |

### Example: ALttP

```python
WORLD_ATTRIBUTES = {'shops': _export_shops}  # Custom function to export shop data
```

## Accumulator and Progressive Items

These attributes handle games with accumulating items (e.g., coins).

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `ACCUMULATOR_RULES` | `List[Dict]` | `[]` | Regex patterns for detecting accumulator items. Each dict has `pattern`, `extract_value`, and `target`. |
| `PROG_ITEMS_INIT` | `Dict[str, int]` | `{}` | Initial values for accumulator counters (e.g., `{' coins': 0}`). |
| `ACCUMULATOR_ITEM_GROUP` | `Optional[str]` | `None` | Item group name for accumulator items. |
| `ACCUMULATOR_ITEM_TYPE` | `Optional[str]` | `None` | Item type for accumulator items. |

### Example: DLCQuest

```python
ACCUMULATOR_RULES = [
    {'pattern': r'^(\d+) coins?$', 'extract_value': True, 'target': ' coins'},
    {'pattern': r'^(\d+) coins? freemium$', 'extract_value': True, 'target': ' coins freemium'},
]
PROG_ITEMS_INIT = {' coins': 0, ' coins freemium': 0}
ACCUMULATOR_ITEM_GROUP = 'coins'
ACCUMULATOR_ITEM_TYPE = 'coins'
```

## Sphere Test and BFS Behavior

These attributes affect how the frontend evaluates rules at runtime.

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `ADD_SPHERE_ITEMS_UPFRONT` | `bool` | `False` | Add all sphere items before sphere logic runs. Needed for accumulator games. |
| `USE_RESOLVED_ITEMS` | `bool` | `False` | Use resolved (non-progressive) item names instead of progressive names. |
| `USE_AUTO_INDIRECT_CONDITIONS` | `bool` | `False` | Enable auto-retry BFS for entrance rules that check region reachability. |
| `ASSUME_BIDIRECTIONAL_EXITS` | `Optional[bool]` | `None` | Auto-create reverse exits for all connections. |

### Example: ALttP

```python
USE_AUTO_INDIRECT_CONDITIONS = True  # Needed for can_buy_unlimited checking shop regions
```

### Example: Witness / DLCQuest

```python
ADD_SPHERE_ITEMS_UPFRONT = True
USE_RESOLVED_ITEMS = True
```

## Overridable Methods

Beyond class attributes, handlers can override these methods for custom behavior:

| Method | Purpose |
|--------|---------|
| `override_rule_analysis(rule_func, rule_target_name)` | Bypass AST analysis entirely for custom rule objects (e.g., Stardew Valley's `StardewRule`). |
| `handle_game_specific_state_method(method, args)` | Handle state methods starting with `_` (e.g., `_lttp_has_key`). |
| `get_item_data(world)` | Customize item data export (e.g., add virtual event items). |
| `get_game_info(world)` | Add game-specific metadata to the export. |
| `get_helper_definitions(world)` | Add custom helper definitions beyond auto-discovery. |
| `get_progression_mapping(world)` | Export progressive item mappings. |
| `should_preserve_as_helper(func_name)` | Return True to keep a specific function as a helper call. |
| `get_collection_length(name)` | Return known collection lengths for binary op optimization. |
| `clear_discovered_helpers()` | Reset caches between player exports. |

## See Also

- [Custom Exporters and Logic](../tests/custom-exporters-and-logic.md) - Game handler explanation
- [Rule Types Reference](rule-types-reference.md) - All supported rule JSON types
- [State Method Transformations](state-method-transformations.md) - How Python state calls become JSON
