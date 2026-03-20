# [ALttP] Superbunny path rules always evaluate to True due to missing invocation and late binding bugs

## Explain what the problem encountered is

In `worlds/alttp/Rules.py`, the `set_bunny_rules()` function has two bugs in lines 1735, 1738, 1741, and 1743 that cause superbunny access rules to always evaluate to `True`:

### Bug 1: Missing function invocation

The lambdas call `path_to_access_rule(new_path, entrance)` which returns a callable, but don't invoke it with `(state)`:

```python
# Current code (buggy):
possible_options.append(lambda state: path_to_access_rule(new_path, entrance) and state.has('Magic Mirror', player))
```

Since `path_to_access_rule()` returns a lambda (which is always truthy), the `and` expression short-circuits to just checking `state.has('Magic Mirror', player)`, ignoring whether the path is actually accessible.

### Bug 2: Python late binding in loop

These lambdas are created inside a loop over entrances. Due to Python's late binding closure behavior, all lambdas capture `new_path` and `entrance` by reference, so they all end up using the values from the **last** loop iteration:

```python
for entrance in current.entrances:
    new_path = path + [entrance.access_rule]
    # ...
    possible_options.append(lambda state: path_to_access_rule(new_path, entrance) ...)
    # All these lambdas will reference the SAME entrance/new_path (the last one)
```

### Steps to reproduce

1. Generate an ALttP seed with these settings:
   - `glitches_required: hybrid_major_glitches` (or `minor_glitches`, `overworld_glitches`, `no_logic`)
   - Entrance shuffle enabled (e.g., `entrance_shuffle: full`)
2. Check logic for Superbunny Cave locations without Moon Pearl
3. Locations may be marked accessible when they shouldn't be

The bug is timing/layout dependent. In testing, ~0.3% of seeds (3/1000) showed incorrect accessibility for Superbunny Cave locations.

### Affected locations

Locations that use superbunny access paths in glitch modes, particularly:
- Superbunny Cave - Top
- Superbunny Cave - Bottom

### Note

Line 1752 uses a different pattern that works correctly:
```python
possible_options.append(path_to_access_rule(new_path, entrance))
```
This calls `path_to_access_rule()` immediately and appends the result, avoiding both bugs.

---

## Provide any supporting information available

### Failing test cases

These bugs were discovered using the **UT Fuzz test** with the **Worldgen Universal Tracker** (which uses worldgen-based tracking rather than native game integration). The test validates game logic by comparing Universal Tracker's accessibility calculations against Python's sphere calculations during seed generation. The test:

1. Generates seeds with randomized option configurations
2. At each sphere, compares what Python says is accessible vs what Universal Tracker calculates
3. Reports mismatches where locations are in one but not the other

For more details, see [Fuzz Tests documentation](../../developer/tests/test-fuzz.md).

**Test command:**
```bash
python fuzz.py -r 1000 -j 4 -g alttp -n 1 --hook worlds.tracker.fuzzer_hook:Hook
```

**Results:** Seeds 168, 378, 850 (out of 1000) failed with:
```
Superbunny Cave - Top, Superbunny Cave - Bottom were expected to be in logic but weren't
```

All failing seeds had `glitches_required: hybrid_major_glitches` and entrance shuffle enabled. The error indicates Universal Tracker (correctly) determined the locations were inaccessible, but Python's logic (incorrectly) marked them as accessible due to the buggy rules always returning `True`.

### Code location

`worlds/alttp/Rules.py` lines 1735, 1738, 1741, 1743 in `set_bunny_rules()`:

```python
if region.name in OverworldGlitchRules.get_sword_required_superbunny_mirror_regions():
    possible_options.append(lambda state: path_to_access_rule(new_path, entrance) and state.has('Magic Mirror', player) and has_sword(state, player))
elif (region.name in OverworldGlitchRules.get_boots_required_superbunny_mirror_regions()
      or location is not None and location.name in OverworldGlitchRules.get_boots_required_superbunny_mirror_locations()):
    possible_options.append(lambda state: path_to_access_rule(new_path, entrance) and state.has('Magic Mirror', player) and state.has('Pegasus Boots', player))
elif location is not None and location.name in OverworldGlitchRules.get_superbunny_accessible_locations():
    if new_region.name == 'Superbunny Cave (Bottom)' or region.name == 'Kakariko Well (top)':
        possible_options.append(lambda state: path_to_access_rule(new_path, entrance))
    else:
        possible_options.append(lambda state: path_to_access_rule(new_path, entrance) and state.has('Magic Mirror', player))
```

### Python late binding demonstration

```python
options = []
for entrance in ['A', 'B', 'C']:
    options.append(lambda: entrance)
print([f() for f in options])  # Prints: ['C', 'C', 'C']
```

---

## List what troubleshooting has been attempted already

### Fix implemented and tested

Both bugs are fixed by pre-computing the path rule and using a default argument to capture it:

```python
# Pre-compute the path rule to avoid late-binding issues with loop variables
path_rule = path_to_access_rule(new_path, entrance)
if region.name in OverworldGlitchRules.get_sword_required_superbunny_mirror_regions():
    possible_options.append(lambda state, _rule=path_rule: _rule(state) and state.has('Magic Mirror', player) and has_sword(state, player))
elif (region.name in OverworldGlitchRules.get_boots_required_superbunny_mirror_regions()
      or location is not None and location.name in OverworldGlitchRules.get_boots_required_superbunny_mirror_locations()):
    possible_options.append(lambda state, _rule=path_rule: _rule(state) and state.has('Magic Mirror', player) and state.has('Pegasus Boots', player))
elif location is not None and location.name in OverworldGlitchRules.get_superbunny_accessible_locations():
    if new_region.name == 'Superbunny Cave (Bottom)' or region.name == 'Kakariko Well (top)':
        possible_options.append(path_rule)
    else:
        possible_options.append(lambda state, _rule=path_rule: _rule(state) and state.has('Magic Mirror', player))
```

The `_rule=path_rule` default argument binds the value at lambda creation time rather than evaluation time.

### Testing results

- Before fix: 3/1000 seeds failed (Superbunny Cave locations incorrectly accessible)
- After fix: 0/1000 seeds failed

### Diff available

A patch file is available at: `docs/json/developer/diffs/diff-files/alttp-bunny-rules.diff`
