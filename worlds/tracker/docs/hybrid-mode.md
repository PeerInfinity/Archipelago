# Universal Tracker Hybrid Mode

Hybrid mode automatically selects the best tracking mode for each game based on a configuration file (`tracking-mode-config.json`). Instead of using a single mode for all games, hybrid mode consults a per-game list of tested and passing modes, then picks the highest-priority one that works.

## Why Hybrid Mode?

Universal Tracker supports multiple tracking modes, each with different trade-offs:

| Mode | How it works | Strengths | Weaknesses |
|------|-------------|-----------|------------|
| **Worldgen** | Rebuilds world from exported `_rules.json` | Always has explain support, works without native UT integration | Requires rules export; AST conversion may differ slightly from original |
| **Pickle** | Loads serialized multiworld from `.pkl` file | Fastest startup, exact logic match | Large files, no explain unless world uses Rule Builder natively |
| **Original** | Regenerates world from player YAML files | Works with native UT-integrated games | Non-deterministic (seed mismatch), may give wrong logic for randomized games |

No single mode works perfectly for every game. Some games only pass with pickle, others only with worldgen, and some work with all three. Hybrid mode solves this by looking up each game in a configuration file and choosing the best available mode automatically.

## How It Works

When Universal Tracker connects to a server:

1. It loads `exporter/tracking-mode-config.json`
2. It looks up the current game in the config's `game_results` section
3. It reads the `fallback_order` (the global priority list of modes to try)
4. It tries each mode in priority order, but **only** if that mode is listed as passing for the current game
5. If a mode is tried and fails at runtime, it moves to the next one
6. If no configured modes succeed, it falls back to original YAML-based tracking

### Example

With this config:
```json
{
  "fallback_order": ["worldgen", "pickle", "original"],
  "game_results": {
    "bundled": {
      "A Short Hike": ["worldgen", "pickle", "original"],
      "Hollow Knight": ["pickle"],
      "Secret of Evermore": ["original"]
    }
  }
}
```

- **A Short Hike** - Tries worldgen first (highest priority and it's in the passing list). If that fails, tries pickle, then original.
- **Hollow Knight** - Skips worldgen (not in passing list), tries pickle. If that fails, skips original, falls back to YAML.
- **Secret of Evermore** - Skips worldgen and pickle, uses original.

## Enabling Hybrid Mode

Hybrid mode has two parts: **export-time** (generating the right files during seed generation) and **tracker-time** (selecting the right mode when UT connects).

### 1. Enable in host.yaml

The easiest way is to use the `ut-hybrid` preset:

```bash
python scripts/setup/update_host_settings.py ut-hybrid
```

Or manually add/update the `json_tools` section in your `host.yaml`:

```yaml
json_tools:
  use_tracking_mode_config: true
```

This enables config-driven behavior for both export and tracking:

- **At export time:** The exporter checks which mode is best for each game and only exports the necessary files (rules.json for worldgen games, pickle for pickle games). This avoids generating unnecessary files.
- **At tracker time:** UT reads the config and selects the best mode per game.

### 2. Ensure tracking-mode-config.json exists

The config file lives at `exporter/tracking-mode-config.json`. A pre-built config is included in the repository with results from fuzz testing across all bundled and apworld games.

If you need to regenerate it (e.g., after adding new games or running your own fuzz tests), see [Regenerating the Config](#regenerating-the-config) below.

### 3. Generate a seed

Run seed generation as usual:

```
python Generate.py --weights_file_path "Templates/[GameName].yaml" --multi 1 --seed 1
```

With `use_tracking_mode_config: true`, the exporter automatically exports the right file format for each game based on the config.

### 4. Connect Universal Tracker

Launch UT and connect to your server. It will automatically use hybrid mode if `tracking-mode-config.json` is present.

## Without Hybrid Mode (Legacy Behavior)

If `tracking-mode-config.json` is not present or `use_tracking_mode_config` is `false`, UT uses a fixed fallback chain for all games:

1. Pickle (if a `.pkl` file exists)
2. Worldgen (if a `_rules.json` file exists)
3. Original Seeded (if the seed number can be resolved)
4. Original YAML

In legacy mode, you control which files are exported with individual flags:

```yaml
json_tools:
  save_rules_json: true       # Export _rules.json for worldgen mode
  save_tracker_pickle: true    # Export .pkl for pickle mode
```

## Config File Format

The config file (`exporter/tracking-mode-config.json`) has this structure:

```json
{
  "description": "Universal Tracker mode configuration...",
  "generated": "2026-02-04T14:40:45.872388",
  "fallback_order": ["worldgen", "pickle", "original"],
  "game_results": {
    "bundled": {
      "Game Name": ["worldgen", "pickle"],
      "Another Game": ["pickle", "original"]
    },
    "apworlds": {
      "Custom Game": ["worldgen", "pickle", "original"]
    }
  }
}
```

### Fields

| Field | Description |
|-------|-------------|
| `fallback_order` | Global priority list of modes to try, from highest to lowest priority |
| `game_results.bundled` | Per-game passing modes for games bundled with Archipelago |
| `game_results.apworlds` | Per-game passing modes for custom apworld games |

Each game entry is a list of mode names that have been tested and verified to work for that game. The modes are:

- `"worldgen"` - World generation from rules.json
- `"pickle"` - Pickle-based tracking
- `"original_seeded"` - Original UT with resolved seed number
- `"original"` - Original YAML-based UT

### How mode selection works at export time

When `use_tracking_mode_config` is enabled, the exporter determines the **first passing mode** for each game (the first mode in `fallback_order` that appears in that game's passing list) and exports accordingly:

- If the first passing mode is `worldgen` -> exports `_rules.json`
- If the first passing mode is `pickle` -> exports `.pkl` file
- If the first passing mode is `original` or `original_seeded` -> no extra files needed (uses YAML)

This means a game like `"Hollow Knight": ["pickle"]` will only get a pickle export, while `"A Short Hike": ["worldgen", "pickle", "original"]` will get a rules.json export (because worldgen comes first in the fallback order).

## Regenerating the Config

The config is generated from UT fuzz test results. If you've run fuzz tests and want to update the config:

```
python scripts/test/generate-tracking-mode-config.py
```

### Options

| Flag | Description |
|------|-------------|
| `--output PATH` | Output path (default: `exporter/tracking-mode-config.json`) |
| `--preserve-order` | Keep existing `fallback_order` from current config (default: true) |
| `--no-preserve-order` | Reset to default fallback order: `["worldgen", "pickle", "original_seeded", "original"]` |
| `--dry-run` | Preview the generated config without writing it |

The script reads test results from `scripts/output/ut-fuzz/` and determines which modes pass for each game based on the `ut_fuzz.passed` field in the results.

## Manually Editing the Config

You can manually edit `tracking-mode-config.json` to:

- **Change mode priority:** Reorder `fallback_order` to prefer a different mode. For example, to prefer pickle over worldgen:
  ```json
  "fallback_order": ["pickle", "worldgen", "original"]
  ```

- **Override a game's modes:** Add or remove modes from a game's passing list. For example, to force a game to use only original mode:
  ```json
  "A Link to the Past": ["original"]
  ```

- **Add a new game:** Add an entry under `bundled` or `apworlds` with the modes you want to allow.

- **Disable hybrid for a game:** Set the game's list to empty (`[]`). This forces the game to use YAML-based tracking as a final fallback.

## Related Documentation

- [UT Tracking Modes Reference](../../../docs/json/developer/reference/ut-tracking-modes.md) - Technical details on each tracking mode
- [Fuzzer Debugging Guide](../../../docs/json/developer/guides/fuzzer-debugging.md) - Running and debugging fuzz tests
- [re-gen-passthrough](re-gen-passthrough.md) - Native UT integration hooks used by Original and Original Seeded modes
