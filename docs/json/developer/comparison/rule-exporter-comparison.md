# Comparison Report: JSON Rule Formats

## Overview

This report compares two different approaches to defining and exporting game rules to JSON in Archipelago:

1. **AST Format**: A post-hoc AST-based rule analysis system
2. **Rule Builder Format**: A declarative rule builder pattern (from [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048))

Archipelago-CC supports both formats. This document compares their architectures, strengths, and trade-offs.

---

## Architecture Comparison

### AST Format: Post-Hoc AST Analysis

**Philosophy**: Analyze existing Python lambda rules after they're created by inspecting their AST (Abstract Syntax Tree)

**Key Files**:
- `exporter/exporter.py:650-873` - Main `prepare_export_data()` function
- `exporter/analyzer/analysis.py:19-275` - `analyze_rule()` entry point
- `exporter/analyzer/rule_analyzer.py:18-215` - `RuleAnalyzer` AST visitor class
- `exporter/analyzer/ast_visitors.py` - Node visitor implementations (800+ lines)
- `exporter/games/base.py` - `BaseGameExportHandler` base class
- `exporter/games/generic.py` - `GenericGameExportHandler` with fallbacks

**How It Works**:
1. World developers write rules as lambdas: `lambda state: state.has("Item")`
2. At export time, the system extracts source code via `inspect.getsource()`
3. Source is parsed into an AST using Python's `ast.parse()`
4. `RuleAnalyzer` walks the AST and converts nodes to JSON structures
5. Game-specific handlers provide custom expansions and post-processing

```
Rule Lambda -> Source Code -> AST Parse -> Node Visitation -> JSON Structure
```

### Rule Builder Format: Declarative Rule Builder

**Philosophy**: Define rules using purpose-built classes that are inherently serializable

**Key Components** (from PR):
- `rule_builder.py` - 2000+ line core implementation
- `RuleWorldMixin` class for world integration
- `Rule` base class with composition operators
- Built-in rules: `Has`, `HasAll`, `HasAny`, `And`, `Or`, `CanReachLocation`, etc.

**How It Works**:
1. World developers define rules using builder classes: `Has("Item")`
2. Rules compose using `&` (And) and `|` (Or) operators
3. Rules resolve at world creation time
4. Built-in `to_dict()` and `from_dict()` methods handle serialization

```
Rule Builder Classes -> Composition -> Resolution -> to_dict() -> JSON Structure
```

---

## Feature Comparison

| Feature | AST Format | Rule Builder Format |
|---------|------------|---------------------|
| **When rules are defined** | Any lambda/function | Must use builder classes |
| **Serialization method** | Post-hoc AST inspection | Built-in `to_dict()` |
| **World code changes required** | None | Must use `RuleWorldMixin` |
| **Backward compatibility** | Full - works with existing worlds | Requires world conversion |
| **Caching** | Rule analysis cache by function ID | State cache in `CollectionState.rule_builder_cache` |
| **Game-specific handlers** | 80+ handler files | Custom rules inherit from base |
| **Human-readable output** | Via Rule Builder conversion | `explain()` method |
| **Rule optimization** | Post-analysis cleanup | Instance reuse via equality |
| **Type safety** | None | Generic typing support |

---

## Detailed Technical Differences

### 1. Rule Definition

**AST Format** (existing worlds don't change):
```python
# World defines rules as lambdas - no changes needed
set_rule(location, lambda state: state.has("Sword") and state.has("Shield"))
```

**Rule Builder Format** (worlds must adopt builder pattern):
```python
# World uses builder classes
set_rule(location, Has("Sword") & Has("Shield"))
```

### 2. Serialization Output

**AST Format** produces:
```json
{
  "type": "and",
  "conditions": [
    {"type": "item_check", "item": "Sword"},
    {"type": "item_check", "item": "Shield"}
  ]
}
```

**Rule Builder Format** produces (similar structure via `to_dict()`):
```json
{
  "type": "And",
  "rules": [
    {"type": "Has", "item": "Sword"},
    {"type": "Has", "item": "Shield"}
  ]
}
```

### 3. Analysis Approach

**AST Format** (`exporter/analyzer/ast_visitors.py:133-626`):
- Visits `ast.Call` nodes to identify `state.has()`, `state.can_reach()`, etc.
- Filters special arguments (state, player, world)
- Resolves closure variables and lambda defaults
- Handles complex patterns like `all(GeneratorExp)` and `any(GeneratorExp)`

```python
# visit_Call handles state method detection
if (func_info.get('type') == 'attribute' and
    func_info['object'].get('name') == 'state'):
    method = func_info['attr']  # e.g., 'has', 'can_reach'
```

**Rule Builder Format**:
- No AST analysis needed - rules are data structures from the start
- Uses `__call__` method for evaluation
- Uses `to_dict()` method for serialization

### 4. Caching Mechanisms

**AST Format** (`exporter/exporter.py:21-26`):
```python
# Module-level cache for rule analysis results
_rule_analysis_cache: Dict[Tuple[int, int, Optional[int]], Any] = {}
```
Cache key: `(id(rule_func), id(game_handler), player)`

**Rule Builder Format** (adds to `BaseClasses.py`):
```python
# Per-player rule cache in CollectionState
self.rule_builder_cache: dict[int, dict[int, bool]] = {}
```
- Rules that evaluate to the same result share instances
- Cache invalidation hooks for item collection/removal

### 5. Human-Readable Explanations

**AST Format**: Rules can be converted to Rule Builder format for explain support via `exporter/converter`

**Rule Builder Format**: Built-in `explain()` method:
```python
rule = Has("Sword") & Has("Shield")
print(rule.explain(state))  # "Have Sword AND Have Shield"
```

### 6. Error Handling

**AST Format** (`exporter/analyzer/analysis.py:78-95`):
```python
# Returns error structure on recursion limit
if current_seen_count >= 10:
    return {
        'type': 'error',
        'message': recursion_msg,
        'subtype': 'recursion'
    }
```

**Rule Builder Format**: Compile-time validation when rules are composed

---

## Strengths and Weaknesses

### AST Format

**Strengths**:
- Works with ALL existing worlds without modification
- No code changes required in game logic
- 80+ game-specific handlers for custom behaviors
- Handles complex Python patterns (closures, defaults, generators)

**Weaknesses**:
- Complex implementation (2000+ lines of AST visitors)
- Cannot analyze obfuscated or dynamic code
- Source code extraction can fail in edge cases
- Human-readable explanations require conversion to Rule Builder

### Rule Builder Format

**Strengths**:
- Clean, declarative API
- Type-safe with generics
- Built-in serialization/deserialization
- Human-readable `explain()` output
- Rule optimization through instance sharing
- Simpler to understand and maintain

**Weaknesses**:
- Requires worlds to adopt new pattern
- Not backward compatible with existing lambda rules
- All 100+ official worlds would need conversion
- Additional complexity in world code

---

## How Archipelago-CC Uses Both Formats

Archipelago-CC supports both formats and can convert between them:

1. **AST Format for existing worlds**: The exporter uses AST analysis for worlds that use traditional lambda rules

2. **Rule Builder Format when available**: The exporter checks for `to_dict()` method and uses it directly when available:

```python
def analyze_rule(rule_func, ...):
    # If rule has built-in serialization, use it
    if hasattr(rule_func, 'to_dict'):
        return rule_func.to_dict()

    # Fall back to AST analysis for lambdas
    return ast_analyze_rule(rule_func, ...)
```

3. **Format conversion**: The `exporter/converter` module provides bidirectional conversion between the two formats, enabling features like human-readable explanations for AST-analyzed rules

---

## Summary

| Aspect | AST Format | Rule Builder Format |
|--------|------------|---------------------|
| **Approach** | Reverse-engineer lambdas | Declarative builders |
| **Compatibility** | All existing worlds | Requires adoption |
| **Complexity** | High (AST parsing) | Low (data classes) |
| **Maintenance** | Game-specific handlers | Built-in rules |

AST format excels at extracting rules from existing code without requiring changes, while Rule Builder format provides a cleaner approach for new worlds. Archipelago-CC supports both formats and can convert between them as needed.

---

## References

### PR #5048 Resources
- [PR #5048: Core: Add rule builder](https://github.com/ArchipelagoMW/Archipelago/pull/5048)
- Original source branches (`rules-engine`, `toem-benchmark`, `astalon-rule-builder`) are no longer available

### Archipelago Core
- [Archipelago World API Documentation](https://github.com/ArchipelagoMW/Archipelago/blob/main/docs/world%20api.md)
- [Archipelago BaseClasses.py](https://github.com/ArchipelagoMW/Archipelago/blob/main/BaseClasses.py)
