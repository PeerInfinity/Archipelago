# Host Settings Reference

This document describes the settings added to `settings.py` and `host.yaml` by this fork. These settings control the JSON export pipeline, sphere logging, preset management, and related features.

All settings below are under the `general_options` section of `host.yaml`.

## Quick Reference

| Setting | Type | Default | Category |
|---------|------|---------|----------|
| [`skip_required_files`](#skip_required_files) | bool | `false` | Infrastructure |
| [`save_rules_json`](#save_rules_json) | bool | `false` | Export |
| [`rules_json_format`](#rules_json_format) | string | `"rule_builder"` | Export |
| [`save_tracker_pickle`](#save_tracker_pickle) | bool | `false` | Export |
| [`save_sphere_log`](#save_sphere_log) | bool | `false` | Sphere Logging |
| [`verbose_sphere_log`](#verbose_sphere_log) | bool | `false` | Sphere Logging |
| [`extend_sphere_log_to_all_locations`](#extend_sphere_log_to_all_locations) | bool | `false` | Sphere Logging |
| [`log_fractional_sphere_details`](#log_fractional_sphere_details) | bool | `true` | Sphere Logging |
| [`log_integer_sphere_details`](#log_integer_sphere_details) | bool | `false` | Sphere Logging |
| [`auto_collect_events`](#auto_collect_events) | bool | `false` | Sphere Logging |
| [`filter_event_items`](#filter_event_items) | bool | `false` | Sphere Logging |
| [`update_frontend_presets`](#update_frontend_presets) | bool | `false` | Preset Management |
| [`skip_preset_copy_if_rules_identical`](#skip_preset_copy_if_rules_identical) | bool | `false` | Preset Management |
| [`clear_game_presets`](#clear_game_presets) | bool | `false` | Preset Management |
| [`clear_all_presets`](#clear_all_presets) | bool | `false` | Preset Management |
| [`resolve_options_to_constants`](#resolve_options_to_constants) | bool | `true` | Export |
| [`use_tracking_mode_config`](#use_tracking_mode_config) | bool | `false` | Export |

---

## Infrastructure

### `skip_required_files`

- **Type:** `bool`
- **Default:** `false`

Enables ROM-less (headless) generation. When `true`, generation proceeds even when required files (ROM files) are missing — ROM patching is skipped, but all other artifacts (multidata, spoiler log, rules JSON, sphere log) are still produced normally.

This setting has three effects, applied in order:

**1. GUI file browser suppression (`settings.py`)**

When any `Path`-typed setting refers to a missing required file, the interactive file picker that would normally open is bypassed. A warning is logged and the missing path is returned as-is. Without this, headless generation would hang waiting for user input.

**2. `stage_assert_generate` — allow generation to proceed**

ROM-based worlds check for their ROM file in `stage_assert_generate`. Normally a missing ROM raises `FileNotFoundError` and aborts generation. With this flag set, the error is suppressed and a warning is logged instead, allowing generation to continue into the fill/placement phase.

**3. `generate_output` — skip ROM patching, set placeholder**

In `generate_output`, if the ROM is still missing, the world:
- Sets a placeholder `rom_name` (e.g., `"ALTTP_ROM_NOT_GENERATED"`) instead of patching a ROM
- Fires any threading events that downstream code waits on (`rom_name_available_event`, etc.)
- Returns early, skipping all ROM I/O

`modify_multidata` then checks for the placeholder and skips adding a `connect_name` entry, so the multidata file is not corrupted with a fake ROM identity.

**Supported worlds**

The following worlds have been patched to support this flag: `alttp`, `apsudoku`, `dkc3`, `ff1`, `lufia2ac`, `mmbn3`, `oot`, `smw`, `soe`, `tloz`, `yoshisisland`.

**Defined in:** `settings.py` (module-level global + `GeneralOptions` field); world-level logic in each world's `__init__.py`

---

## Export Settings

These settings control what gets exported after seed generation in `Main.py`.

### `save_rules_json`

- **Type:** `bool`
- **Default:** `false`

Enables exporting the game's rules, regions, items, and locations as a JSON file (`_rules.json`) after seed generation. This is the primary export format used by the web frontend for tracking.

The exported file is written to the output directory alongside other generation artifacts, and optionally copied to `frontend/presets/` if [`update_frontend_presets`](#update_frontend_presets) is also enabled.

### `rules_json_format`

- **Type:** `string`
- **Default:** `"rule_builder"`
- **Valid values:** `"rule_builder"`, `"ast"`, `"both"`

Controls the format of the exported rules JSON:

- **`"rule_builder"`** — Rules are exported in Rule Builder format, which is more compact and can be evaluated by the Rule Builder engine. This is the standard format for the web frontend.
- **`"ast"`** — Rules are exported as raw AST (Abstract Syntax Tree) nodes, preserving the original Python rule structure more closely.
- **`"both"`** — Both formats are included in the export. Useful for debugging or comparison.

### `save_tracker_pickle`

- **Type:** `bool`
- **Default:** `false`

Enables exporting the multiworld as a gzip-compressed dill pickle file (`.pkl.gz`) after seed generation. This is an alternative to JSON export that preserves the exact Python objects, including lambdas and closures in access rules.

In pickle mode, Universal Tracker can load the serialized multiworld directly without regeneration or Rule Builder evaluation.

**Requires:** The `dill` library (`dill>=0.3.8`).

See also: [Exporter README](../../../../exporter/README.md) for pickle loading API.

### `resolve_options_to_constants`

- **Type:** `bool`
- **Default:** `true`

When `true`, references to `world.options.X.value` in exported rules are resolved to their concrete values at export time. This simplifies the exported rules since option values become literals rather than dynamic lookups.

When `false`, option references are preserved as-is, which may be useful for generating rules that work across different option configurations.

### `use_tracking_mode_config`

- **Type:** `bool`
- **Default:** `false`

When `true`, the exporter reads `tracking-mode-config.json` to determine per-game export behavior. This config file specifies which tracking mode (pickle, worldgen, original) to use for each game, allowing the export pipeline to skip unnecessary work.

The config file is generated by `scripts/test/generate-tracking-mode-config.py`.

---

## Sphere Logging

These settings control the sphere log (`_sphere_log.jsonl`) that records the playthrough sphere-by-sphere. The sphere log is used by the web frontend for spoiler display and by the UT fuzz test infrastructure for validation.

### `save_sphere_log`

- **Type:** `bool`
- **Default:** `false`

Enables sphere logging during `create_playthrough()`. When enabled, a JSONL file is written alongside the other output files, recording the state of the game at each sphere boundary.

This is the master switch — all other sphere logging settings are ignored if this is `false`.

### `verbose_sphere_log`

- **Type:** `bool`
- **Default:** `false`

When `true`, sphere log entries include full cumulative state (all items collected so far, all locations checked so far). When `false`, entries include only deltas (new items and locations since the previous sphere).

Non-verbose (delta) mode produces smaller log files and is sufficient for most uses. Verbose mode is useful for debugging sphere calculation issues.

### `extend_sphere_log_to_all_locations`

- **Type:** `bool`
- **Default:** `false`

When `false`, the sphere log only tracks locations containing advancement (progression) items, matching the standard Archipelago playthrough calculation. When `true`, all filled locations are included regardless of item classification.

Enable this for "full spoiler" mode where you want to see every location's contents, not just the progression-relevant ones.

### `log_fractional_sphere_details`

- **Type:** `bool`
- **Default:** `true`

When `true`, logs a sub-sphere entry after each individual item is collected within a sphere. These fractional spheres are labeled like `0.1`, `0.2`, `1.1`, `1.2`, etc.

Fractional spheres provide finer-grained tracking than integer spheres. They show exactly which item unlocked which new locations, which is valuable for UT comparison testing and debugging.

### `log_integer_sphere_details`

- **Type:** `bool`
- **Default:** `false`

When `true`, logs a sphere entry after all items in a sphere have been collected (the standard sphere boundary). These are the traditional integer spheres: `1`, `2`, `3`, etc.

Since fractional sphere logging is more detailed and enabled by default, integer sphere logging is off by default to avoid redundancy. Enable it if you want both granularities.

### `auto_collect_events`

- **Type:** `bool`
- **Default:** `false`

When `true`, event items are automatically collected whenever their locations become accessible during sphere calculation. This matches Universal Tracker's behavior, where events are implicitly collected.

Enable this when generating sphere logs that will be compared against UT output (e.g., UT fuzz testing), so that event handling is consistent between the two.

### `filter_event_items`

- **Type:** `bool`
- **Default:** `false`

When `true`, event locations (those with `address=None`) and their items are excluded from sphere log output. This matches UT's output format, which doesn't report events.

Like `auto_collect_events`, this is primarily for UT comparison testing where the sphere log format needs to match what UT produces.

---

## Preset Management

These settings control how exported files are copied into `frontend/presets/` for use by the web frontend.

### `update_frontend_presets`

- **Type:** `bool`
- **Default:** `false`

When `true`, exported files (rules JSON, sphere log, pickle) are copied from the output directory into `frontend/presets/{game}/AP_{seed}/` after generation. This makes them available to the web frontend.

This is the master switch for preset management — the other preset settings have no effect if this is `false`.

### `skip_preset_copy_if_rules_identical`

- **Type:** `bool`
- **Default:** `false`

When `true`, the preset copy step compares the new export against the existing preset and skips the copy if the files are identical. This avoids unnecessary file writes and preserves file modification times.

### `clear_game_presets`

- **Type:** `bool`
- **Default:** `false`

When `true`, all existing presets for the current game are deleted before new ones are written. Use this when you want to regenerate a clean set of presets for a specific game.

**Warning:** This deletes all files under `frontend/presets/{game}/`.

### `clear_all_presets`

- **Type:** `bool`
- **Default:** `false`

When `true`, all existing presets for ALL games are deleted before new ones are written.

**Warning:** This deletes all files under `frontend/presets/*/`. Use with caution.

---

## Presets

The `update_host_settings.py` script provides named presets that configure multiple settings at once. See [update_host_settings.py](#update_host_settingspy) below.

| Preset | Purpose |
|--------|---------|
| `normal` | All export features disabled (upstream-like behavior) |
| `minimal-spoilers` | Export rules JSON + sphere log for progression items only |
| `full-spoilers` | Export rules JSON + sphere log for all locations |
| `ut-hybrid` | UT hybrid mode — config picks best tracking mode per game |
| `ut-worldgen` | UT worldgen mode — export rules.json for worldgen-based tracking |
| `ut-pickle` | UT pickle mode — export pickle for pickle-based tracking |
| `ut-original` | UT original mode — YAML-based tracking, no extra exports |

### Preset Details

#### `normal`

All export/logging settings disabled. Behaves like unmodified Archipelago. `log_fractional_sphere_details` and `resolve_options_to_constants` remain at their defaults (`true`) since they only take effect when their parent features are enabled.

#### `minimal-spoilers`

The standard configuration for generating frontend presets:
- Enables `save_rules_json`, `save_sphere_log`, `update_frontend_presets`
- Enables `skip_required_files` for headless operation
- Sphere log covers progression items only
- Fractional sphere details enabled (default)

#### `full-spoilers`

Same as `minimal-spoilers` but with `extend_sphere_log_to_all_locations` enabled, so the sphere log includes every location regardless of item classification.

#### `ut-hybrid`

Enables [hybrid mode](../../../../worlds/tracker/docs/hybrid-mode.md) for Universal Tracker:
- Enables `use_tracking_mode_config` — the exporter reads `tracking-mode-config.json` to determine the best tracking mode per game and exports only the necessary files
- Does not set `save_rules_json` or `save_tracker_pickle` — the config drives export decisions

#### `ut-worldgen`

Forces worldgen-based tracking for all games:
- Enables `save_rules_json` for worldgen-based tracking
- Disables `use_tracking_mode_config` — all games use worldgen mode uniformly

#### `ut-pickle`

Forces pickle-based tracking for all games:
- Enables `save_tracker_pickle` instead of `save_rules_json`
- Still enables `save_sphere_log` and `update_frontend_presets`

#### `ut-original`

Forces original YAML-based tracking for all games:
- No extra exports needed — UT regenerates from player YAML files
- Still enables `save_sphere_log` and `update_frontend_presets`

---

## `update_host_settings.py`

**Location:** `scripts/setup/update_host_settings.py`

A utility script for updating `host.yaml` settings. It modifies the `general_options` section of `host.yaml` in the project root.

### Usage

```bash
# Apply a preset
python scripts/setup/update_host_settings.py <preset>

# Toggle individual settings
python scripts/setup/update_host_settings.py --save-rules-json        # enable
python scripts/setup/update_host_settings.py --no-save-rules-json     # disable

# Apply a preset then override specific settings
python scripts/setup/update_host_settings.py minimal-spoilers --no-verbose-sphere-log

# Set string options
python scripts/setup/update_host_settings.py --rules-json-format both

# Show help
python scripts/setup/update_host_settings.py --help
```

### How It Works

1. Reads the existing `host.yaml` from the project root
2. If a preset is specified, applies all settings from that preset
3. If individual flags are specified, applies those as overrides (after the preset)
4. Writes the updated YAML back to `host.yaml`

### Flag Format

Boolean settings use `--flag-name` / `--no-flag-name` pairs (underscores become hyphens):
- `save_rules_json` → `--save-rules-json` / `--no-save-rules-json`
- `skip_required_files` → `--skip-required-files` / `--no-skip-required-files`

String settings use `--flag-name <value>`:
- `rules_json_format` → `--rules-json-format rule_builder`

### Prerequisites

- `host.yaml` must already exist in the project root. If it doesn't, run `python Launcher.py --update_settings` first.

---

## Related Documentation

- [Exporter README](../../../../exporter/README.md) — Export pipeline and pickle API
- [Universal Tracker Modifications](../diffs/universal-tracker-modifications.md) — UT integration details
- [Settings API](../../../../docs/settings%20api.md) — Upstream Archipelago settings system
- [Testing Pipeline](../guides/testing-pipeline.md) — How exports are validated
