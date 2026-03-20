# Closure Function Analyzer Architecture

The `ClosureFunctionAnalyzer` handles the most complex part of rule export: analyzing callable objects captured in closures. When a rule references a function stored in a closure variable, the main AST analyzer can't parse it from source alone. This component bridges that gap.

**Source:** `exporter/analyzer/closure_function_analyzer.py`

## Why It Exists

Archipelago rules are often assigned dynamically:

```python
# In set_rules():
location.access_rule = lambda state: state.has("Sword", player) and old_rule(state)

# In set_bunny_rules():
location.access_rule = lambda state: all(rule(state) for rule in [old_rule, bunny_check])
```

The inner `old_rule` and `bunny_check` are closure variables holding callable objects. The main `RuleAnalyzer` can parse the outer lambda's AST, but when it encounters `old_rule(state)`, it needs to analyze that captured function too. That's what `ClosureFunctionAnalyzer` does.

## Public API

```python
class ClosureFunctionAnalyzer:
    def __init__(self, parent_analyzer: RuleAnalyzer, max_depth: int = None)
    def analyze_function(self, func: Callable, depth: int = 0) -> Optional[Dict[str, Any]]
```

- `parent_analyzer` provides access to closure_vars, game_handler, player_context, and seen_funcs
- `analyze_function()` returns a JSON rule dict, or `None` if the function can't be analyzed
- `max_depth` defaults to 10 (class constant `MAX_DEPTH`)

## Analysis Strategy Chain

`analyze_function()` tries three strategies in order. If one succeeds, it returns immediately. If all fail, returns `None`.

```
analyze_function(func)
    │
    ├─ 1. _analyze_via_closure_pattern(func)     # Pattern match by closure variable names
    │      └─ Success? → return result
    │
    ├─ 2. _analyze_via_source(func)              # Extract source, parse AST, analyze
    │      └─ Success? → return result
    │
    └─ 3. _analyze_via_bytecode(func)            # Inspect bytecode constants/opcodes
           └─ Success? → return result
           └─ Fail? → return None
```

### Strategy 1: Closure Pattern Recognition

**Method:** `_analyze_via_closure_pattern(func)`

Detects known patterns by examining the function's closure variable names (via `func.__code__.co_freevars`) without extracting source. This is the fastest path.

**Recognized patterns:**
- `options` + `path` + `entrance` - ALttP bunny rules from `path_to_access_rule`
- `rule` + `old_rule` - Combined rules from `add_rule()`/`add_alternate_rule()`
- Single closure with `rule` - Wrapper lambdas

Each pattern has a specialized sub-analyzer that directly constructs the JSON rule tree from the closure variable values.

### Strategy 2: Source Extraction + AST Analysis

**Method:** `_analyze_via_source(func)`

The most general strategy. Extracts the function's source code with `inspect.getsource()`, parses it as an AST, then creates a sub-`RuleAnalyzer` with the function's closure variables merged in.

**Steps:**
1. Extract source via the `source_extraction` module
2. Parse into AST
3. Merge parent closure_vars with the function's own closure_vars
4. Create a new `RuleAnalyzer` with the merged context
5. Analyze the AST body

**When this succeeds:** Most named functions and lambdas defined in importable modules.

**When this fails:** Dynamically generated lambdas, functions from C extensions, or when source isn't available.

### Strategy 3: Bytecode Analysis

**Method:** `_analyze_via_bytecode(func)`

Last resort. Examines the function's bytecode (`func.__code__`) to detect patterns without source code.

**What it inspects:**
- `co_consts` - String constants (potential item names)
- `co_names` - Attribute names (potential method calls like `has`, `can_reach`)
- Opcode sequences - Call patterns

**Uses game handler data:**
- `KNOWN_ITEMS_FOR_BYTECODE_ANALYSIS` - Recognizes game-specific item strings in constants
- `BYTECODE_HELPER_EXPANSIONS` - Expands helper names (e.g., `has_sword` to all sword tiers)
- `KNOWN_OPTION_NAMES` - Recognizes option access patterns

**What it can detect:**
- Simple `state.has("item")` patterns
- `state.can_reach("region")` patterns
- Option access patterns
- Known helper function calls

**Limitations:** Cannot handle complex logic, conditionals, or multi-step rules.

## Feature Flags

Class-level constants that control optimization behavior:

### Lossless Optimizations (enabled by default)

| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_FINGERPRINT_DEDUP` | `True` | Canonical string fingerprints to detect and deduplicate identical sub-rules. |
| `ENABLE_NESTED_FLATTENING` | `True` | Flattens `OR(OR(a,b),c)` to `OR(a,b,c)` and same for AND. |
| `ENABLE_CROSS_TYPE_DOMINANCE` | `True` | Prunes `AND(CanReach(X), Has(Y))` when `Has(Y)` alone appears elsewhere in an OR. |

### Correctness Flags (enabled by default)

| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_RULE_TARGET_PROPAGATION` | `True` | Propagates `rule_target_name` and `target_type` to sub-analyzers. |
| `ENABLE_CLOSURE_VARS_MERGING` | `True` | Merges parent closure_vars into child (important for preserving `world` object). |
| `ENABLE_ADD_RULE_COMBINE_DETECTION` | `True` | Detects AND vs OR semantics in `add_rule()` combined lambdas via bytecode inspection. |

### Lossy Flags (disabled by default)

| Flag | Default | Effect |
|------|---------|--------|
| `ENABLE_CLOSURE_DEPTH_LIMIT` | `False` | Limits closure analysis depth to `MAX_CLOSURE_DEPTH` (3). Returns `True` at limit. |
| `ENABLE_CLOSURE_OPTIONS_LIMIT` | `False` | Limits options analyzed per closure to `MAX_CLOSURE_OPTIONS` (10). |

## Cycle Detection

Functions are tracked by object ID in `self._seen_functions: Set[int]` during recursion:

```python
func_id = id(func)
if func_id in self._seen_functions:
    return {'type': 'constant', 'value': True}  # Break cycle
self._seen_functions.add(func_id)
try:
    # ... analysis ...
finally:
    self._seen_functions.discard(func_id)
```

Circular references are broken by returning `True` (always accessible), which is a safe conservative fallback.

## Integration with RuleAnalyzer

The `ClosureFunctionAnalyzer` is created and used by `RuleAnalyzer` and the `CallVisitorMixin`:

```python
# In call_visitor.py, when encountering a closure variable that's callable:
closure_analyzer = ClosureFunctionAnalyzer(self)  # self is the RuleAnalyzer
result = closure_analyzer.analyze_function(resolved_func)
```

**Data flow from parent:**
- `parent_analyzer.closure_vars` - Variable context for source analysis
- `parent_analyzer.game_handler` - Game-specific configuration
- `parent_analyzer.player_context` - Current player number
- `parent_analyzer.seen_funcs` - Global function deduplication
- `parent_analyzer.rule_target_name` - Name of location/entrance being analyzed
- `parent_analyzer.target_type` - Type (Location, Entrance, Region)

## Common Patterns Handled

### ALttP Bunny Rules
```python
# Generated by set_bunny_rules():
lambda state: state.has("Moon Pearl", player) or entrance.can_reach(state)
```
Detected by closure pattern (options + path + entrance variables). Produces:
```json
{"type": "or", "conditions": [
    {"type": "item_check", "item": "Moon Pearl"},
    {"type": "state_method", "method": "can_reach", "args": [...]}
]}
```

### Combined Rules (add_rule)
```python
# Generated by add_rule():
lambda state: old_rule(state) and new_condition(state)
```
Detected by closure pattern (rule + old_rule variables). The AND vs OR semantics are determined by bytecode inspection of the combining lambda.

### Helper Function Wrappers
```python
# From helper modules:
def can_use_bombs(state, player):
    return state.has("Bombs", player) or (not bombless and state.has("Bomb Upgrade", player))
```
Analyzed via source extraction (Strategy 2). Closure variables like `bombless` are resolved from the captured context.

## See Also

- [State Method Transformations](state-method-transformations.md) - What the call visitor produces
- [Handler Configuration](handler-configuration.md) - Bytecode analysis settings
- [Binary Operation Optimizations](binary-op-optimizations.md) - Compile-time optimizations
