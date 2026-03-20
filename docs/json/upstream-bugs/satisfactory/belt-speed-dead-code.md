# [Satisfactory] Belt Speed Rule Never Evaluated

**Status:** Workaround in fork (exporter skips belt speed checks)

**Files:** `worlds/satisfactory/StateLogic.py`

---

## Problem Summary

In `StateLogic.get_can_produce_specific_recipe_for_part_rule()`, belt speed checks reference `self.belt_rule[recipe.minimal_belt_speed - 1]` without calling it with `(state)`. Since `belt_rule` elements are lambda functions (always truthy), the belt speed requirement is silently bypassed for all recipes.

**Impact:** Belt speed requirements are completely ignored in recipe production rules. Any recipe with a `minimal_belt_speed` requirement has that requirement silently skipped, making access rules more permissive than intended.

---

## Technical Details

### How Belt Rules Are Defined

`belt_rule` is initialized as a tuple of callables (line 58):

```python
self.belt_rule = tuple(self.get_belt_speed_rule(speed) for speed in range(1, 6))
```

Each element is a lambda that checks state (lines 113-114):

```python
def get_belt_speed_rule(self, belt_speed: int) -> Callable[[CollectionState], bool]:
    return lambda state: state.has_any(self.belt_events[belt_speed], self.player)
```

### The Bug

In `get_can_produce_specific_recipe_for_part_rule()` (lines 121-163), `belt_rule` is accessed but never **invoked** with `(state)`. Compare with `pipes_rule` and `radio_active_rule`, which are correctly called:

```python
# Lines 125-129 (one of four affected branches):
return lambda state: \
    self.is_recipe_producible(state, recipe) \
    and self.pipes_rule(state) \          # Correct: called with (state)
    and self.radio_active_rule(state) \   # Correct: called with (state)
    and self.belt_rule[recipe.minimal_belt_speed - 1]  # BUG: not called with (state)
```

The expression `self.belt_rule[recipe.minimal_belt_speed - 1]` evaluates the **lambda object itself** as a boolean, which is always `True`. It should be `self.belt_rule[recipe.minimal_belt_speed - 1](state)`.

### All Affected Lines

| Line | Branch Condition | Buggy Code |
|------|-----------------|------------|
| 129 | `needs_pipes` + `is_radio_active` + `minimal_belt_speed` | `and self.belt_rule[recipe.minimal_belt_speed - 1]` |
| 140 | `needs_pipes` + `minimal_belt_speed` | `and self.belt_rule[recipe.minimal_belt_speed - 1]` |
| 151 | `is_radio_active` + `minimal_belt_speed` | `and self.belt_rule[recipe.minimal_belt_speed - 1]` |
| 160 | `minimal_belt_speed` only | `and self.belt_rule[recipe.minimal_belt_speed - 1]` |

### Correct Comparison

| Rule | Initialization | Usage | Correct? |
|------|---------------|-------|----------|
| `pipes_rule` | `self.pipes_rule = self.get_requires_pipes_rule()` | `self.pipes_rule(state)` | Yes |
| `radio_active_rule` | `self.radio_active_rule = self.get_requires_hazmat_rule()` | `self.radio_active_rule(state)` | Yes |
| `belt_rule[N]` | `self.belt_rule = tuple(self.get_belt_speed_rule(speed) ...)` | `self.belt_rule[N]` | **No** - missing `(state)` |

---

## The Fix

Each of the four affected lines should invoke the lambda with `(state)`:

```python
# Current (buggy):
and self.belt_rule[recipe.minimal_belt_speed - 1]

# Should be:
and self.belt_rule[recipe.minimal_belt_speed - 1](state)
```

---

## Fork Workaround

The exporter handler (`exporter/games/official/satisfactory.py`) intentionally **omits** belt speed checks in `_build_single_recipe_rule()` to match the original world's actual behavior:

```python
# NOTE: belt_rule is dead code in Python's StateLogic.py - the belt_rule
# callable is referenced but never called with (state), so it always
# evaluates as truthy. We omit it here to match actual Python behavior.
```

This ensures exported rules produce identical logic to the upstream Python world, where belt speed is effectively unchecked.

---

## Detection

This bug follows the same pattern as the [ALttP bunny rules missing invocation bug](../alttp/bunny-rules.md): a callable is evaluated as a boolean (truthy) instead of being invoked with `(state)` to get the actual rule result.

---

## Upstream Status

This bug exists in upstream Archipelago. It has not been reported or fixed upstream.

---

## Related Files

| Purpose | Path |
|---------|------|
| Buggy code | `worlds/satisfactory/StateLogic.py:121-163` |
| Belt rule definition | `worlds/satisfactory/StateLogic.py:58, 113-114` |
| Exporter workaround | `exporter/games/official/satisfactory.py:679-682` |
| Similar bug (ALttP) | [bunny-rules.md](../alttp/bunny-rules.md) |
