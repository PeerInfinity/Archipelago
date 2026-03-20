# Binary Operation Optimizations

The `BinaryOpProcessor` performs compile-time optimizations on binary operations, list operations, and collection functions during rule export. When operands can be resolved to concrete values at export time, the processor computes the result immediately, producing simpler and smaller JSON output.

**Source:** `exporter/analyzer/binary_ops.py`
**Tests:** `test_json/exporter/analyzer/test_binary_ops.py`

## Architecture

```
RuleAnalyzer
  └── BinaryOpProcessor(expression_resolver, game_handler)
        ├── try_preprocess_binary_op(left, op, right)    ← called from operator_visitors.py
        ├── try_preprocess_len(arg)                       ← called from call_visitor.py
        └── try_preprocess_zip(args)                      ← called from call_visitor.py
```

All methods return `None` on failure, allowing the caller to fall through to normal AST processing. Exceptions are caught and logged as warnings.

## Optimization Rules

### 1. List Multiplication: `[value] * N`

Expands a list literal multiplied by a constant integer.

**Before:**
```python
[player] * 4
```

**After:**
```json
{"type": "list", "value": [1, 1, 1, 1]}
```

**Conditions:**
- Left operand is a list (`type == 'list'`)
- Right operand is a constant integer > 0
- All list items can be resolved (`player` resolves to current player number)

**Zero/negative multiplier:** Returns `None` (no optimization).

### 2. List Multiplication with `len()`: `[value] * len(collection)`

Same as above, but the multiplier comes from the length of a known collection.

**Before:**
```python
[player] * len(some_collection)
```

**After:**
```json
{"type": "list", "value": [1, 1, 1, 1, 1]}
```

**Conditions:**
- Left operand is a list
- Right operand is a `len()` helper call
- The collection's length can be resolved (via game handler or known constants)

**Length resolution sources (in order):**
1. Game handler's `get_collection_length()` method
2. Hardcoded ALttP fallback lengths:
   - `randomizer_room_chests`: 4
   - `compass_room_chests`: 5
   - `back_chests`: 5
3. Direct `len()` on constant lists

### 3. List Addition: `list1 + list2`

Concatenates two lists that can be resolved to concrete data.

**Before:**
```python
collection_a + collection_b
```

**After:**
```json
{"type": "constant", "value": [1, 2, 3, 4, 5]}
```

**Conditions:**
- Both operands can be resolved to list data
- Supports named collections (via game handler) and constant lists

### 4. `len()` Function

Resolves `len()` to a constant when the argument is a known collection.

**Before:**
```python
len(my_list)
```

**After:**
```json
{"type": "constant", "value": 5}
```

**Conditions:**
- Argument is a constant list, OR
- Argument is a named collection with known length, OR
- Argument is a binary_op that can be resolved (e.g., `len(list_a + list_b)`)

**List concatenation case:**
```python
len(list_a + list_b)
# Resolves both sides, returns sum of lengths
```

### 5. `zip()` Function

Resolves `zip()` of two known lists to a constant list of pairs.

**Before:**
```python
zip(names, values)
```

**After:**
```json
{"type": "constant", "value": [["Alice", 25], ["Bob", 30]]}
```

**Conditions:**
- Exactly 2 arguments (3+ not supported)
- Both arguments can be resolved to list data
- Works with constant lists and named collections

**Unequal lengths:** Uses Python's `zip()` behavior (stops at shortest list).

## Resolution Helpers

### `try_resolve_list_length(list_ref)`

Returns the integer length of a list reference, or `None`.

**Resolution order:**
1. Constant lists → direct `len()`
2. Named collections → game handler's `get_collection_length()`
3. Hardcoded known lengths (ALttP fallback)

### `try_resolve_list_data(list_ref)`

Returns the actual list contents, or `None`.

**Supported input types:**
- `name` → named collection via game handler
- `list` → list structure with resolvable items
- `constant` → direct list value

**Special:** `player` references resolve to the current player number.

### `try_resolve_binary_op_data(binary_op_ref)`

Recursively resolves a binary operation to its computed list result. Handles nested operations like `[player] * len(items)` or `list_a + list_b`.

## Integration

The processor is initialized once per `RuleAnalyzer`:

```python
# rule_analyzer.py
self.binary_op_processor = BinaryOpProcessor(self.expression_resolver, self.game_handler)
```

It's called from three sites:

| Call Site | Method Called | Trigger |
|-----------|-------------|---------|
| `operator_visitors.py` `visit_BinOp` | `try_preprocess_binary_op(left, op, right)` | Any `*` or `+` binary operation |
| `call_visitor.py` `visit_Call` for `len()` | `try_preprocess_len(arg)` | `len(x)` function call |
| `call_visitor.py` `visit_Call` for `zip()` | `try_preprocess_zip(args)` | `zip(x, y)` function call |

## Benefits

- **Smaller JSON:** Constant lists replace computation expressions
- **Faster evaluation:** No runtime list operations needed
- **Better caching:** Constant rules are more cache-friendly

**Example size reduction:**
```json
// Before: binary_op expression (nested structure)
{"type": "binary_op", "left": {"type": "list", "value": [...]}, "op": "*", "right": {"type": "helper", "name": "len", "args": [...]}}

// After: flat constant
{"type": "list", "value": [1, 1, 1, 1, 1]}
```

## Limitations

- `zip()` only supports 2 arguments
- Requires resolvable operands; complex expressions fall back to runtime
- Game handler dependency for named collection resolution
- Only 3 ALttP collections have hardcoded fallback lengths

## See Also

- [State Method Transformations](state-method-transformations.md) - How call_visitor uses binary_op_processor
- [Rule Types Reference](rule-types-reference.md) - JSON rule type catalog
