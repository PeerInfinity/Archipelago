# Universal Tracker Modifications

This document describes the modifications made to the Universal Tracker compared to the original from [FarisTheAncient/Archipelago](https://github.com/FarisTheAncient/Archipelago) (tracker branch).

- **Original version:** v0.2.26
- **Modified version:** v0.2.23-modified (based on earlier version with extensive additions)
- **Location in this repository:** `worlds/tracker/`
- **Original copy for comparison:** `scripts/test/fixtures/tracker_original/`
- **Last compared:** 2026-02-03

## Summary of Changes

The modifications extend Universal Tracker with:
1. **Pickle-based multiworld loading** for fast tracking without regeneration
2. **Worldgen world integration** for rule explain support
3. **Direct AST rule explanation** from JSON rules files
4. **UT comparison testing infrastructure** for automated verification
5. **Debug logging and sphere log output** for test analysis
6. **Multiworld fuzz testing** via `MultiworldHook` class
7. **ALttP entrance shuffle seed handling** for deterministic regeneration
8. **Fractional sphere logic** option for finer-grained sphere comparison

These changes integrate UT with the JSON Export system, allowing it to explain rules for any world that has exported rules, not just worlds with native Rule Builder support. The pickle mode provides the fastest tracking by loading a serialized multiworld directly.

### Backported from v0.2.26

The following bug fixes and features were backported from upstream v0.2.26:

1. **`glitches_state` field** - Added to `CurrentTrackerState` for separate glitch logic tracking (prevents contaminating main state)
2. **Nothing items fix** - Added `and location.item is not None` check to prevent crashes when events have no item
3. **Glitches state copy** - Create a copy of state before applying glitch items (`glitches_state = state.copy()`)

---

## Architecture

The modified Universal Tracker uses a **mixin-based architecture** to separate our extensions from the upstream code, making it easier to merge upstream updates.

```
worlds/tracker/
├── __init__.py              # Exports (matches upstream)
├── TrackerCoreBase.py       # Original UT TrackerCore (close to upstream v0.2.26)
├── TrackerCore.py           # Extended TrackerCore (combines base + mixins)
├── pickle_mixin.py          # Pickle-based multiworld loading
├── worldgen_mixin.py        # Worldgen and AST explain methods
├── tracker_extensions.py    # Testing mode extensions
├── TrackerClient.py         # Client code (minor modifications)
└── fuzzer_hook.py           # Fuzzer hook for UT comparison testing
```

### Class Hierarchy

```python
class TrackerCore(PickleMixin, WorldgenMixin, TrackerTestingMixin, TrackerCoreBase):
    """Extended TrackerCore with pickle, worldgen, and testing support."""
```

### Tracking Mode Priority

TrackerCore supports four tracking modes, tried in order. See the [UT Tracking Modes Reference](../reference/ut-tracking-modes.md) for full details on each mode and its limitations.

**Legacy order (no config file):**
1. **Pickle** - Fastest, loads serialized multiworld with exact lambdas
2. **Worldgen** - Generates world from JSON rules
3. **Original Seeded** - Original UT YAML-based regeneration with the resolved seed number injected for determinism (reverse lookup covers seeds 1–100 only)
4. **Original (YAML)** - Original upstream UT behavior with a random internal seed

When `exporter/tracking-mode-config.json` is present, the order is driven by its `fallback_order` key and per-game `game_results`.

### Benefits

1. **Easy upstream merging**: Update `TrackerCoreBase.py` directly from upstream
2. **Clear separation**: Extensions are in separate mixin files
3. **Testability**: Can test base vs. extended separately
4. **Documentation**: Extensions are obviously separate from upstream code

---

## File-by-File Changes

### `TrackerCoreBase.py` (formerly TrackerCore.py)

**Lines:** 513 (matches upstream v0.2.26)

This file contains the original TrackerCore code from upstream, with minimal changes:
- Class renamed to `TrackerCoreBase` for inheritance
- Backported `glitches_state` fix from v0.2.26
- Backported "Nothing items" fix from v0.2.26

### `TrackerCore.py` (Extended Version)

**Lines:** ~280

This file extends TrackerCoreBase with our modifications via mixins.

### `worldgen_mixin.py`

**Lines:** ~400

Contains worldgen world integration and AST explain support.

#### New Instance Variables

```python
# Worldgen world support
self.worldgen_builder: Optional["JSONWorldBuilder"] = None
self.worldgen_world: Optional[Any] = None
self.worldgen_multiworld: Optional[MultiWorld] = None
self._tracking_from_worldgen: bool = False

# Direct AST explain support
self.seed_name: Optional[str] = None
self.generation_seed: Optional[int] = None
self.rules_json_data: Optional[dict] = None
self.rules_json_path: Optional[str] = None

# Testing options
self.seed_override: int | None = None
self.sphere_log_mode: bool = False
self.auto_collect_events: bool = True
self.filter_event_items: bool = True
self.auto_generate_worldgen: bool = False
```

#### New Methods

| Method | Purpose |
|--------|---------|
| `load_worldgen_world()` | Load a worldgen world from JSON for rule explain support |
| `initialize_tracking_from_worldgen()` | Initialize tracking using worldgen world state |
| `generate_and_load_worldgen_world()` | Generate and load worldgen world in one step |
| `get_worldgen_world()` | Get the loaded worldgen world instance |
| `get_worldgen_location()` | Get a location from the worldgen world by name |
| `explain_location_rule()` | Explain why a location is accessible/inaccessible |
| `_explain_from_rules_json()` | Direct AST explain without worldgen world |
| `set_seed_name()` | Set seed name for rules JSON discovery |
| `_validate_rules_json()` | Validate rules JSON matches current game |
| `auto_discover_rules_json()` | Auto-discover rules JSON from seed name |
| `load_rules_json()` | Load rules JSON for direct AST explain |
| `set_debug_logger()` | Set callback for debug logging |
| `_log_debug()` | Log debug events |

#### Key Feature: Rule Explain

The `explain_location_rule()` method provides human-readable explanations of why a location is or isn't accessible:

```python
def explain_location_rule(self, location_name: str, state: CollectionState) -> Optional[list]:
    """
    Explain the access rule for a location.

    Returns a list of explanation strings, or None if explain is not available.
    Uses worldgen world if available, otherwise falls back to direct AST explain.
    """
```

---

### `pickle_mixin.py`

**Lines:** ~286 (new file)

Contains pickle-based multiworld loading for fast tracking without regeneration.

#### New Instance Variables

```python
# Pickle mode support
self.pickle_multiworld: Optional[MultiWorld] = None
self.pickle_path: Optional[str] = None
self.pickle_metadata: Optional[dict] = None
self._tracking_from_pickle: bool = False
```

#### New Methods

| Method | Purpose |
|--------|---------|
| `_init_pickle_mixin()` | Initialize pickle mixin attributes |
| `_disconnect_pickle_mixin()` | Clear pickle mixin state on disconnect |
| `load_multiworld_from_pickle()` | Load multiworld from gzip-compressed dill pickle file |
| `initialize_tracking_from_pickle()` | Initialize tracking using the pickled multiworld |
| `auto_discover_pickle()` | Auto-discover pickle file based on game/seed name |

#### Key Feature: Fast Tracking

Pickle mode loads a pre-generated multiworld directly, preserving exact lambdas and closures:

```python
def load_multiworld_from_pickle(self, pickle_path: str) -> bool:
    """
    Load a multiworld from a gzip-compressed dill pickle file.

    Returns True if multiworld was loaded successfully.
    """
```

Benefits over worldgen mode:
- **Faster**: No world generation step needed
- **Exact rules**: Preserves original lambdas without AST conversion
- **Simpler**: No Rule Builder evaluation required

---

### `TrackerClient.py`

**Lines:** 1613 → 1970 (~357 lines added)

Adds testing infrastructure and debug logging capabilities.

#### New Methods

| Method | Purpose |
|--------|---------|
| `_handle_ut_test_sync_bounce()` | Handle test synchronization protocol for UT comparison testing |
| `_send_ut_ready_bounce()` | Send UT ready signal via bounce protocol |
| `_log_sphere_state()` | Log current sphere state to sphere log file |
| `_close_sphere_log()` | Close sphere log file |
| `_open_debug_log()` | Open debug log file for detailed event logging |
| `_log_debug_message()` | Log debug event with timestamp and data |
| `_log_debug_full_state()` | Log full tracker state for debugging |
| `_close_debug_log()` | Close debug log file |

#### UT Test Sync Protocol

The test sync bounce handler enables automated UT comparison testing:

```python
def _handle_ut_test_sync_bounce(self, args: dict):
    """
    Handle UT_TEST_SYNC bounce messages for comparison testing.

    Protocol:
    1. Test driver sends UT_TEST_SYNC with sphere items
    2. UT processes items and updates state
    3. UT responds with current accessible locations
    4. Test driver compares with expected sphere log
    """
```

---

### `fuzzer_hook.py`

**Lines:** 98 → 667 (~569 lines added)

Extended for comprehensive testing with explain stats collection, ALttP entrance shuffle handling, fractional sphere logic, and multiworld support.

#### New Features

- **Explain stats collection**: Collects statistics about which locations can be explained
- **Worldgen integration**: Auto-discovers and loads rules JSON for worldgen tracking
- **Run ID tracking**: Tracks run IDs for organizing explain stats output
- **ALttP entrance shuffle seed handling**: Pre-generates and fixes entrance shuffle seeds for deterministic regeneration
- **Fractional sphere logic**: Optional finer-grained sphere comparison within integer spheres
- **Multiworld testing**: `MultiworldHook` class for testing each player independently

#### New Variables (Hook class)

```python
EXPLAIN_STATS_DIR = "fuzz_output/explain_stats"
run_id: int = 0
explain_stats_collected: bool = False
use_fractional_spheres: bool = False  # Toggle for fractional sphere logic
```

#### New Methods (Hook class)

| Method | Purpose |
|--------|---------|
| `_collect_explain_stats()` | Collect explain support statistics for locations and entrances |
| `_write_explain_stats()` | Write explain stats to JSON file |
| `_pregenerate_alttp_entrance_shuffle_seed()` | Pre-generate numeric entrance_shuffle_seed before generation |
| `_fix_alttp_entrance_shuffle_seed()` | Rewrite ALttP YAML with actual er_seed after generation |
| `reclassify_outcome()` | Reclassify test outcomes (e.g., treat fill errors as OptionError) |

#### MultiworldHook Class

A new class for multiworld UT fuzz testing that tests each player in the multiworld independently:

```python
class MultiworldHook(BaseHook):
    player_files_path: str
    status: Optional[int] = None
    failed_players: Dict[int, str]  # player_id -> failure reason
    player_results: Dict[int, bool]  # player_id -> passed
```

| Method | Purpose |
|--------|---------|
| `before_generate()` | Initialize state before generation |
| `_test_player()` | Test a single player in the multiworld |
| `after_generate()` | Test all players after generation completes |
| `reclassify_outcome()` | Reclassify test outcomes |
| `get_failed_players()` | Return dict of failed player IDs to failure reasons |
| `get_player_results()` | Return dict of all player IDs to pass/fail status |

---

### `__init__.py`

**Lines:** 191 → 190 (1 line removed)

Minor changes:
- Version number set to v0.2.23 (based on older version before glitches_state was added)
- Removed `glitches_state` field from `CurrentTrackerState` namedtuple

```python
# Original
class CurrentTrackerState(NamedTuple):
    ...
    glitches_state: Optional[CollectionState]

# Modified - glitches_state removed
class CurrentTrackerState(NamedTuple):
    ...
    state: Optional[CollectionState]  # Last field, no glitches_state
```

---

## Integration with JSON Export System

The key integration points are:

### 1. Auto-Discovery of Pickle/JSON

When a seed name is set (from server connection), UT auto-discovers tracking files in order:

```python
# In TrackerCore
self.seed_name = "14089154938208861744"  # From RoomInfo
self.auto_discover_pickle()     # Tries frontend/presets/{game}/AP_{seed}/AP_{seed}.pkl.gz first
self.auto_discover_rules_json() # Falls back to AP_{seed}_rules.json
```

### 2. Pickle Loading (Fastest)

For fastest tracking, load the multiworld directly from pickle:

```python
tracker.load_multiworld_from_pickle("path/to/AP_seed.pkl.gz")
tracker.initialize_tracking_from_pickle()
# Tracking uses exact original rules - no conversion needed
```

### 3. Worldgen World Loading

For full rule explain support, a worldgen world can be loaded:

```python
tracker.load_worldgen_world("path/to/rules.json")
# Now explain_location_rule() uses Rule Builder's explain system
```

### 4. Direct AST Explain Fallback

Even without a worldgen world, rules can be explained directly from JSON:

```python
tracker.load_rules_json("path/to/rules.json")
# explain_location_rule() parses AST from JSON
```

---

## Testing Infrastructure

### UT Comparison Testing

The modifications enable automated testing that compares UT's sphere calculations against the original game's sphere log:

1. **Sphere log output**: UT can output its sphere calculations to a JSONL file
2. **Debug logging**: Detailed event logging for debugging mismatches
3. **Test sync protocol**: Bounce-based protocol for test driver communication

### Fuzzer Integration

The extended `fuzzer_hook.py` enables:
- Running UT against fuzzed generations
- Collecting explain coverage statistics
- Identifying worlds with explain gaps

---

## Usage Examples

### Loading from pickle (fastest)

```python
from worlds.tracker import TrackerCore

tracker = TrackerCore.TrackerCore(logger, False, False)
tracker.load_multiworld_from_pickle("frontend/presets/tunic/AP_123/AP_123.pkl.gz")
tracker.initialize_tracking_from_pickle()

# Tracking uses exact original rules
```

### Loading worldgen for explain support

```python
from worlds.tracker import TrackerCore

tracker = TrackerCore.TrackerCore(logger, False, False)
tracker.load_worldgen_world("frontend/presets/tunic/AP_123/AP_123_rules.json")

# Now can explain rules
explanation = tracker.explain_location_rule("Fortress - East Shortcut", state)
```

### Auto-discovering pickle/JSON

```python
tracker.seed_name = "14089154938208861744"
# Try pickle first (fastest), then JSON
if tracker.auto_discover_pickle():
    # Pickle loaded, fast tracking available
    pass
elif tracker.auto_discover_rules_json():
    # Rules JSON loaded, explain available
    pass
```

---

## Diff Statistics

| File | Original Lines | Modified Lines | Lines Added |
|------|---------------|----------------|-------------|
| `TrackerCore.py` | 513 | 1055 | ~542 |
| `pickle_mixin.py` | 0 | 286 | ~286 |
| `TrackerClient.py` | 1613 | 1970 | ~357 |
| `fuzzer_hook.py` | 98 | 667 | ~569 |
| `__init__.py` | 191 | 190 | -1 |
| **Total** | 2415 | 4168 | **~1753** |

---

## Fixes to Original Copy

The original copy in `scripts/test/fixtures/tracker_original/` has been modified to fix issues that prevent linting or testing:

### `TrackerClient.py`

**F-string quote syntax (lines 478, 480, 482):** Changed double quotes to single quotes inside f-string expressions for Python < 3.12 compatibility.

```python
# Original (syntax error in Python < 3.12)
f"Go mode: [color={get_ut_color("in_logic")}]Yes[/color]"

# Fixed
f"Go mode: [color={get_ut_color('in_logic')}]Yes[/color]"
```

---

## Related Documentation

- [Hybrid Mode](../../../../worlds/tracker/docs/hybrid-mode.md) — User guide for config-driven per-game mode selection
- [UT Tracking Modes Reference](../reference/ut-tracking-modes.md) — Technical details on each tracking mode
- [UT Fuzz Tests](../tests/test-fuzz.md) — How the modes are tested

## Related Files

- **Original repository:** https://github.com/FarisTheAncient/Archipelago (tracker branch)
- **Original copy for comparison:** `scripts/test/fixtures/tracker_original/`
- **World generator:** `world_generator/`
- **Pickle exporter:** `exporter/pickle_exporter.py`
