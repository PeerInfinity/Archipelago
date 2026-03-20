# Universal Tracker Tracking Modes Reference

This document describes the four tracking modes supported by the modified Universal Tracker, how the fallback order is determined, and the limitations of each mode.

**Source:** `worlds/tracker/TrackerCore.py`
**Related:** [Universal Tracker Modifications](../diffs/universal-tracker-modifications.md)

---

## Overview

When UT connects to a server, `TrackerCore.initalize_tracker_core()` selects a tracking mode to use. The modes differ in how they reconstruct the multiworld that UT uses for logic calculations.

| Mode | Speed | Accuracy | Explain Support | Requires |
|------|-------|----------|-----------------|----------|
| **Pickle** | Fastest | Exact (preserves lambdas) | Only if source world uses Rule Builder natively | Pickle file (`.pkl`) |
| **Worldgen** | Moderate | High (AST-converted rules) | Always — all rules are Rule Builder `Resolved` objects | `_rules.json` |
| **Original Seeded** | Slower | Game-native (deterministic) | Only if source world uses Rule Builder natively | Seed resolvable to 1–100, or `_rules.json` with `generation_seed` |
| **Original (YAML)** | Slower | Game-native (non-deterministic) | Only if source world uses Rule Builder natively | Player YAMLs |

---

## Hybrid Mode vs Specific Mode

There are two ways to select which tracking mode UT uses: **hybrid mode** (automatic per-game selection) and **specific mode** (one mode forced for all games).

### Hybrid Mode

Hybrid mode uses `tracking-mode-config.json` to automatically select the best tracking mode for each game. Not every mode works for every game — some games only pass with pickle, others only with worldgen, and some work with all modes. Hybrid mode consults the config to pick the highest-priority mode that has been tested and verified for the current game.

This affects both sides of the pipeline:

- **Export time:** The exporter reads the config and only exports the files needed for each game's best mode (e.g., `_rules.json` for worldgen games, `.pkl` for pickle games). This avoids generating unnecessary files.
- **Tracker time:** UT reads the config, gets the list of passing modes for the current game, and tries them in `fallback_order` priority, skipping any mode not in the game's passing list.

Enable with: `python scripts/setup/update_host_settings.py ut-hybrid`

For full details, see the [Hybrid Mode user guide](../../../../worlds/tracker/docs/hybrid-mode.md).

### Specific Mode

When a specific mode is selected, the same mode is used for all games uniformly. The exporter exports the corresponding file format for every game, and UT uses only that mode (falling back to YAML-based tracking if it fails).

| Preset | Export | UT behavior |
|--------|--------|-------------|
| `ut-worldgen` | `_rules.json` for all games | Worldgen mode for all games |
| `ut-pickle` | `.pkl` for all games | Pickle mode for all games |
| `ut-original` | No extra exports | YAML-based tracking for all games |

This is simpler but less optimal — some games may fail in the chosen mode even though they would succeed in a different one.

## Fallback Order

### Config-Driven (hybrid mode)

When `exporter/tracking-mode-config.json` is present and `use_tracking_mode_config` is enabled, the mode order comes from the config's `fallback_order` key:

```json
{
  "fallback_order": ["worldgen", "pickle", "original"],
  "game_results": { ... }
}
```

Each game's `game_results` entry lists which modes have been validated for that game. UT skips modes not in the passing list for the current game, then falls through to the next mode in `fallback_order`.

### Legacy (specific mode / no config)

Without `tracking-mode-config.json`, or when `use_tracking_mode_config` is disabled, the fallback depends on which files are available. UT tries each mode in a hardcoded order, using whichever files were exported:

1. Pickle (if a `.pkl` file exists)
2. Worldgen (if a `_rules.json` file exists)
3. Original Seeded (if seed number can be resolved)
4. Original (YAML)

When a specific mode preset is used (e.g., `ut-worldgen`), only the corresponding file type is exported, so UT naturally uses that mode — the other modes are skipped because their files don't exist.

---

## Mode Details

### 1. Pickle Mode

**Source:** `worlds/tracker/pickle_mixin.py`

Loads the multiworld directly from a gzip-compressed dill pickle file. The serialized object preserves the exact Python lambda functions used in access rules, so logic is identical to what was used during generation.

**When it runs:** If `self.pickle_path` is set (a `.pkl` file was discovered for this seed).

**Advantages:**
- Fastest initialization
- No regeneration required — exact lambdas, no AST conversion
- Works for any game regardless of UT native support

**Disadvantages:**
- Requires a pickle file to exist for the seed
- Pickle files are large and must be generated in advance
- No explain support unless the source world's rules happened to use Rule Builder natively

---

### 2. Worldgen Mode

**Source:** `worlds/tracker/worldgen_mixin.py`

Generates a temporary worldgen world from the seed's `_rules.json` file and uses it for logic calculations. Rules are converted from JSON back to Python via the Rule Builder's AST engine.

**When it runs:** If `self.rules_json_path` is set (a `_rules.json` file was discovered for this seed).

**Advantages:**
- Works for any game with a JSON export
- More accurate than YAML mode for games with non-deterministic logic
- Does not require native UT integration in the game world
- **Full explain support** — all rules are Rule Builder `Resolved` objects with `explain_json` (see below)

**Disadvantages:**
- Requires a `_rules.json` file for the seed
- Rules go through AST conversion, which may differ slightly from original lambdas
- Does not support cross-world item dependencies (same limitation as original UT)

#### Explain Support in Worldgen Mode

The `/explain <location>` command in UT shows why a location is or isn't accessible given the player's current items. The output is a colored message that walks the rule tree, highlighting satisfied conditions in green and missing ones in red.

Worldgen mode provides explain support for every location because all rules are stored as Rule Builder `Resolved` objects. When the world generator builds the worldgen world from `_rules.json`, each location and entrance `access_rule` is assigned a `Rule.Resolved` instance (e.g., `And.Resolved`, `Has.Resolved`) rather than a plain Python lambda. Every `Resolved` type implements `explain_json(state)`, which recursively evaluates the rule tree and returns a structured list of colored message parts.

For example, a location requiring 4 Small Keys and Lamp would display:

```
(Has 4x Small Key (Hyrule Castle) & Has Lamp)
```

with each satisfied item in green and each missing item in red.

When `/explain` is invoked, `explain_location_rule()` (`worldgen_mixin.py`) uses a three-tier fallback:

1. **Main world location** — if the active tracking world's `access_rule` already has `explain_json` (i.e., worldgen is the active mode), this is used directly
2. **Worldgen world location** — if a separate worldgen world was loaded alongside another tracking mode, its Rule Builder rules are used
3. **Direct AST explain** — if only `_rules.json` is loaded (no worldgen world), the raw JSON rule tree is walked by `explain_ast_rule()` from `rule_builder/ast_explain.py`

In practice, when worldgen mode is active the main world IS the worldgen world, so tier 1 always succeeds and all locations have explain support.

---

### 3. Original Seeded Mode

**Source:** `worlds/tracker/TrackerCore.py` — `_try_original_seeded_tracking()` and `_resolve_seed_number()`

Uses the original UT YAML-based regeneration flow (same as the upstream tracker), but injects the **actual seed number** from the original game. This makes UT's internal multiworld generation deterministic — entrance shuffles, random starting locations, and other seed-dependent choices will match the real game.

**When it runs:** If the seed number can be resolved (see below) and `original_seeded` is in the fallback order.

**How seed resolution works:**

`_resolve_seed_number()` tries two sources in order:

1. **Reverse lookup table** (`scripts/lib/seed_utils.py`):
   A precomputed mapping from seed ID (e.g., `AP_14089154938208861744`) to seed number (e.g., `1`).
   **This table covers seeds 1–100 only.** Seeds outside this range cannot be resolved via lookup.

2. **`generation_seed` field in `_rules.json`**:
   If a `_rules.json` file has been loaded, its `generation_seed` field is used as a fallback. This works for any seed but requires the rules JSON to be present.

If neither source can resolve the seed number, this mode is skipped entirely.

**Advantages:**
- Uses native game UT integration (same as original UT)
- Deterministic: entrance shuffles and other seed-dependent logic match the real game
- Eliminates false failures caused by UT's internal generation using a different random seed

**Disadvantages:**
- **Only works for seeds 1–100** via the reverse lookup table (without a `_rules.json` present)
- Requires player YAMLs to be present and correct (same requirement as original mode)
- If the game doesn't implement `interpret_slot_data` or `re_gen_passthrough`, non-seed randomness (e.g., random goals, random weights) still might not be deterministic
- No explain support unless the source world's rules use Rule Builder natively

---

### 4. Original (YAML) Mode

**Source:** `worlds/tracker/TrackerCoreBase.py` — the upstream `initalize_tracker_core()`

The original upstream UT behavior. Regenerates the multiworld from the player's YAML files using an internal random seed. Games with native UT support via `re_gen_passthrough` or `interpret_slot_data` can pass their slot data through to correct non-deterministic choices.

**When it runs:** Always — this is the final fallback if all other modes fail.

**Advantages:**
- Works for any game with native UT support
- Supported by the upstream UT community; games can implement native integration

**Disadvantages:**
- Non-deterministic: UT's internal seed differs from the original game, so seed-dependent logic (entrance shuffles, random starting locations) might not match
- False failures are common for games with randomized logic that don't implement `re_gen_passthrough`
- Requires player YAMLs to be present and correct
- No explain support unless the source world's rules use Rule Builder natively

---

## Configuration

The active mode order and per-game results are stored in `exporter/tracking-mode-config.json`, generated by `scripts/test/generate-tracking-mode-config.py`. See [Fuzzer Debugging Guide](../guides/fuzzer-debugging.md) for how to regenerate this file.

The config's `fallback_order` is the global priority list. Per-game entries in `game_results` restrict which modes are attempted for each game.

---

## Related Documentation

- [Hybrid Mode](../../../../worlds/tracker/docs/hybrid-mode.md) — User guide for config-driven per-game mode selection
- [Universal Tracker Modifications](../diffs/universal-tracker-modifications.md) — Architecture overview and file-by-file changes
- [UT Fuzz Tests](../tests/test-fuzz.md) — How the modes are tested
- [Fuzzer Debugging Guide](../guides/fuzzer-debugging.md) — Debugging tracking failures
- [re-gen-passthrough](../../../../worlds/tracker/docs/re-gen-passthrough.md) — Native UT integration hooks used by Original and Original Seeded modes
