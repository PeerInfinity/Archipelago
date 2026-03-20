# [ALttP] Bunny Rules Late Binding and Missing Invocation Bugs

**Status:** Fixed in fork (Jan 2026)

**Files:** `worlds/alttp/Rules.py`

**Commits:** df514f431, ed21a7f79

**Diff:** `docs/json/developer/diffs/diff-files/alttp-bunny-rules.diff`

---

## Problem Summary

Two bugs in ALttP's `set_bunny_rules()` function caused superbunny access rules to evaluate incorrectly:

1. **Missing invocation bug**: Lambdas returned `path_to_access_rule()` result (a truthy callable) instead of calling it with `(state)`, causing rules to always evaluate to `True`.

2. **Late binding bug**: Lambdas created inside a loop captured loop variables by reference, so all lambdas referenced the last iteration's values.

**Impact:** Superbunny Cave locations were incorrectly marked as accessible in glitch modes with entrance shuffle, causing 3/1000 fuzzer test failures.

---

## Technical Details

### Bug Location

`worlds/alttp/Rules.py` lines 1732-1743, in the `set_bunny_rules()` function.

### Bug 1: Missing Invocation

The original code:
```python
possible_options.append(lambda state: path_to_access_rule(new_path, entrance) and state.has('Magic Mirror', player))
```

`path_to_access_rule()` returns a lambda. Without calling it with `(state)`, the expression evaluates whether the lambda is truthy (always `True`), not whether the rule passes.

**Fix:** Add `(state)` to invoke the returned lambda:
```python
possible_options.append(lambda state: path_to_access_rule(new_path, entrance)(state) and state.has('Magic Mirror', player))
```

### Bug 2: Late Binding

Even after fixing the invocation, a Python closure bug remained. Lambdas created in a loop capture variables by reference:

```python
options = []
for entrance in ['A', 'B', 'C']:
    options.append(lambda: entrance)
print([f() for f in options])  # ['C', 'C', 'C'] - all reference last value!
```

All superbunny path lambdas ended up referencing the same `entrance` and `new_path` values from the last loop iteration.

**Fix:** Pre-compute the path rule and bind it via default argument:
```python
path_rule = path_to_access_rule(new_path, entrance)
possible_options.append(lambda state, _rule=path_rule: _rule(state) and state.has('Magic Mirror', player))
```

The `_rule=path_rule` default argument binds the value at lambda creation time rather than at evaluation time.

---

## How ALttP Bunny Rules Work

The `set_bunny_rules()` function runs a BFS at world generation time to find valid paths from each Dark World location back to "Link" state (where the player has human form):

```python
# Simplified logic:
possible_options = [lambda state: state.has('Moon Pearl', player)]

# BFS backwards through entrances
queue = [(current_region, [])]
while queue:
    (current, path) = queue.popleft()
    for entrance in current.entrances:
        new_region = entrance.parent_region
        new_path = path + [entrance.access_rule]

        if is_link(new_region):
            # Found a path to Link state!
            possible_options.append(path_to_access_rule(new_path, entrance))

return lambda state: any(rule(state) for rule in possible_options)
```

The final bunny rule is: "Moon Pearl OR (can reach entrance A with items X) OR (can reach entrance B with items Y) ..."

---

## Affected Code

Four lambda expressions in `set_bunny_rules()` were affected (lines 1735, 1738, 1741, 1743):

| Condition | Original (buggy) | Fixed |
|-----------|------------------|-------|
| Sword required superbunny mirror | `lambda state: path_to_access_rule(...) and ...` | `lambda state, _rule=path_rule: _rule(state) and ...` |
| Boots required superbunny mirror | `lambda state: path_to_access_rule(...) and ...` | `lambda state, _rule=path_rule: _rule(state) and ...` |
| Superbunny Cave (Bottom) / Kakariko Well | `lambda state: path_to_access_rule(...)` | `path_rule` (direct assignment) |
| Other superbunny accessible | `lambda state: path_to_access_rule(...) and ...` | `lambda state, _rule=path_rule: _rule(state) and ...` |

Note: Line 1752 already used the correct pattern by calling `path_to_access_rule()` immediately and appending the result directly.

---

## Detection

The late binding bug can be detected by examining lambda closures:

- **Late-bound (broken):** `co_freevars` includes `path_to_access_rule`
- **Correctly-bound (works):** `co_freevars` is `('entrance', 'path')`, no `path_to_access_rule`

```python
# Late-bound - path_to_access_rule called at evaluation time
lambda state: path_to_access_rule(new_path, entrance)(state)

# Correctly-bound - path_to_access_rule called at creation time
path_to_access_rule(new_path, entrance)  # returns a lambda
```

---

## Symptoms

### Failing Seeds
Seeds 168, 378, 850 (out of 1000) failed with:
```
Superbunny Cave - Top, Superbunny Cave - Bottom were expected to be in logic but weren't
```

### Common Settings in Failing Seeds
- `glitches_required: hybrid_major_glitches` (enables superbunny access)
- Entrance shuffle enabled (full, crossed, or restricted)
- Player does NOT have Moon Pearl

### Exported Rule (Before Fix)
```
Or(
    And(CanReachEntrance('Palace of Darkness Hint'), Has('Magic Mirror')),
    CanReachEntrance('Palace of Darkness Hint'),  <-- Wrong entrance (late binding)
    Has('Moon Pearl')
)
```

The second option should reference a different entrance, but due to late binding, all options referenced the same (last) entrance.

---

## Fix History

| Date | Commit | Description |
|------|--------|-------------|
| Jan 30, 2026 | df514f431 | Fixed missing `(state)` invocation |
| Jan 31, 2026 | ed21a7f79 | Fixed late binding with default argument pattern |

---

## Testing Methodology

These bugs were discovered using the **UT Fuzz test** with the **Worldgen Universal Tracker** (which uses worldgen-based tracking rather than native game integration).

### What is the UT Fuzz Test?

The UT Fuzz test validates game logic by comparing two independent calculations of location accessibility:

1. **Python's sphere calculations** - The authoritative logic computed during seed generation
2. **Universal Tracker's calculations** - An independent implementation that tracks game progress

The test generates seeds with randomized option configurations and, at each sphere, compares what Python says is accessible vs what Universal Tracker calculates. Mismatches indicate bugs in either the game's logic code or the rule export/tracking system.

### Test Command

```bash
python fuzz.py -r 1000 -j 4 -g alttp -n 1 --hook worlds.tracker.fuzzer_hook:Hook
```

This runs 1000 seeds with 4 parallel workers, testing ALttP with a single player and the UT fuzzer hook enabled.

### Why Worldgen UT?

The Worldgen Universal Tracker uses worldgen-based tracking, which:
- Generates a temporary world from the exported `rules.json`
- Uses the Rule Builder to evaluate accessibility
- Is independent of any game's native UT integration

This independence is what allowed it to detect the bug: the exported rules correctly captured `path_to_access_rule()` returning a callable, while the buggy Python code was evaluating the callable as truthy instead of invoking it.

For more details on fuzz testing, see [Fuzz Tests documentation](../../developer/tests/test-fuzz.md).

---

## Verification

After both fixes:
- Fuzzer success rate improved from ~60-70% to 94%+
- The 3 Superbunny Cave failures were eliminated
- All ALttP fuzzer tests pass (1000/1000)

---

## Upstream Status

These bugs exist in upstream Archipelago. The fixes have not been submitted upstream yet.

**Upstream impact:** The bugs affect superbunny access logic in glitch modes (minor_glitches, overworld_glitches, hybrid_major_glitches, no_logic) when entrance shuffle is enabled. In practice, they cause locations to be marked as accessible when they shouldn't be (too permissive).

---

## Related Files

| Purpose | Path |
|---------|------|
| Bug report (for upstream) | [bunny-rules-bug-report.md](./bunny-rules-bug-report.md) |
| ALttP bunny rules | `worlds/alttp/Rules.py:1653-1783` |
| Combined diff | [alttp-bunny-rules.diff](../../developer/diffs/diff-files/alttp-bunny-rules.diff) |
| Investigation notes | `CC/docs/plans/alttp-bunny-rules-investigation.md` |
| ALttP game handler | `exporter/games/official/alttp.py` |
