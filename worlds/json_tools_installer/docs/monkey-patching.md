# Monkey Patching Technical Reference

This document explains how the JSON Tools Installer's monkey patching system works internally.

## Overview

Monkey patching is a runtime technique that modifies functions in memory without changing source files. The installer uses this to add JSON export functionality to vanilla Archipelago installations.

When enabled, the monkey patches:
1. Wrap core Archipelago functions with custom versions
2. Call the original functions to preserve normal behavior
3. Add export functionality after generation completes

## Architecture

### Files

| File | Purpose |
|------|---------|
| `monkey_patches/__init__.py` | Public API (`install_hooks`, `uninstall_hooks`) |
| `monkey_patches/hooks.py` | Hook implementations |
| `config.py` | Settings management with fallback logic |

### Hook Registry

The system maintains two global dictionaries:

```python
_installed_hooks = {}      # Maps hook_name -> wrapped function
_original_functions = {}   # Maps hook_name -> (module, attr, original_func)
```

This allows hooks to be installed, tracked, and cleanly uninstalled.

## Hooks

Four hooks are installed in order:

### 1. Temp Dir Capture (`temp_dir_capture`)

**Target:** `AutoWorld.call_stage()`

**Purpose:** Capture the temporary output directory so exported files can be written inside it and included in the output ZIP.

**How it works:**
- Wraps `call_stage(multiworld, method_name, *args)`
- When `method_name == "generate_output"`, stores the temp dir path as `multiworld.temp_dir_for_sphere_log`
- Passes through to the original function

### 2. Slot Data Cache (`slot_data_cache`)

**Target:** `AutoWorld.World.fill_slot_data()` (base class + all subclasses)

**Purpose:** Cache slot data results so the exporter can read them without re-calling `fill_slot_data()` after caches have been cleared by `stage_modify_multidata`.

**How it works:**
- At install time, wraps `World.fill_slot_data()` on the base class
- At the start of `hooked_main()` (deferred patching), wraps `fill_slot_data()` on every registered world subclass that overrides it — this is necessary because Python's MRO dispatches directly to subclass methods, bypassing any wrapper on the base class
- Each wrapper calls the original method, stores the result as `self._cached_slot_data`, and returns it
- The exporter reads the cached value via `hasattr(world, '_cached_slot_data')`

### 3. Sphere Logging (`sphere_logging`)

**Target:** `BaseClasses.Spoiler.create_playthrough()`

**Purpose:** Log sphere information during playthrough creation for the frontend.

**How it works:**
- Checks if sphere logging is enabled via `get_export_setting('save_sphere_log', False)`
- If enabled, delegates to `exporter.sphere_logger.create_playthrough_with_logging()`
- If disabled, calls the original function directly

### 4. Export Rules (`export_rules`)

**Target:** `BaseClasses.Spoiler.to_file()` (primary) + `Main.main()` (fallback)

**Purpose:** Export rules JSON and pickle files after seed generation.

**How it works:**

**Primary path** — wraps `Spoiler.to_file()`:
- Called inside `with output as temp_dir:`, so exported files are written to temp_dir and included in the output ZIP
- After calling the original `to_file()`, runs `export_post_output_hook()` with the temp directory
- Sets `_module_state['export_ran'] = True` to prevent the fallback from running

**Fallback path** — wraps `Main.main()`:
- Also triggers deferred subclass patching for `slot_data_cache` (since all worlds are now loaded)
- After `main()` returns, checks if the primary path already ran
- If not (e.g. spoiler was disabled so `to_file()` was never called), runs `_post_generation_export()` which creates its own temp directory — files are NOT included in the ZIP but are still copied to `frontend/presets/` if `update_frontend_presets` is enabled

## Export Flow

The primary path runs inside `Spoiler.to_file()`, within the output temp directory:

```
Spoiler.to_file(filename)
       │
       ├─► Call original to_file() (writes spoiler)
       │
       └─► export_post_output_hook(multiworld, temp_dir, filename_base)
               │
               ├─► Call export_game_rules()
               │   └─► Exporter decides internally whether to export based on settings
               │
               └─► Call export_multiworld_pickle()
                   └─► Exporter decides internally whether to export based on settings
```

The fallback path runs after `Main.main()` returns (only if the primary path didn't run):

```
Main.main() returns MultiWorld
       │
       ▼
_post_generation_export(multiworld)
       │
       ├─► Build filename from seed_name (e.g., "AP_14089154938208861744")
       │
       ├─► Create temporary directory
       │
       └─► export_post_output_hook(multiworld, temp_dir, filename_base)
```

### Key Point: Exporters Handle Decisions

The export functions (`export_game_rules`, `export_multiworld_pickle`) contain their own logic for deciding whether to actually export. They check settings like:

- `save_rules_json` / `save_tracker_pickle` - Legacy enable flags
- `use_tracking_mode_config` - Whether to use per-game tracking mode config
- Game-specific settings from `tracking-mode-config.json`

The hooks simply call the exporters and let them decide. This mirrors how `Main.py` works in the fork.

## Settings Resolution

The `get_export_setting()` function provides a fallback chain for settings:

```
1. Check host.yaml (settings.general_options.{setting_name})
       │
       ▼ (if not found)
2. Check installer config (config.export_settings.{setting_name})
       │
       ▼ (if not found)
3. Return default value
```

This allows monkey patching to work on vanilla Archipelago where `host.yaml` may not have the fork's export settings. Users can either:
- Configure `host.yaml` with export settings (via `configure_export_settings()`)
- Or rely on the installer's own config as a fallback

### Settings Used by Hooks

| Setting | Purpose | Default |
|---------|---------|---------|
| `update_frontend_presets` | Copy exports to `frontend/presets/` | `False` |
| `skip_preset_copy_if_rules_identical` | Skip copy if files match | `False` |
| `rules_json_format` | Format for rules JSON | `"rule_builder"` |
| `clear_game_presets` | Clear existing game presets | `False` |
| `clear_all_presets` | Clear all presets | `False` |
| `save_sphere_log` | Enable sphere logging | `False` |
| `save_tracker_pickle` | Enable pickle export | `False` |

## Primary vs Fallback

| Aspect | Primary path | Fallback path |
|--------|-------------|---------------|
| **Trigger** | `Spoiler.to_file()` called | `Main.main()` returns, primary didn't run |
| **When** | Spoiler enabled (default) | Spoiler disabled (`args.spoiler == 0`) |
| **Temp directory** | Uses generation's temp dir | Creates its own |
| **Files in ZIP** | Yes | No |
| **Preset copy** | Yes, if `update_frontend_presets` | Yes, if `update_frontend_presets` |

## Installation and Auto-Install

### Manual Installation

```python
from worlds.json_tools_installer.monkey_patches import install_hooks

results = install_hooks(export_rules=True, sphere_logging=True)
# results = {"export_rules": True, "sphere_logging": True}
```

### Auto-Installation

When the installer APWorld loads, it checks the config and auto-installs hooks if enabled:

```python
# In __init__.py
from .monkey_patches import auto_install
auto_install()
```

The `auto_install()` function checks the installer config:

```python
def auto_install():
    config = load_config()
    if config.patches.method == "monkey":
        install_hooks()
```

Monkey patching is initially disabled (`method` defaults to `"none"`). It is enabled when:
- The installer is run (the "Monkey Patch" checkbox is checked by default)
- The user clicks "Enable Monkey Patches" in the JSON Tools Status GUI

### Toggling at Runtime

The JSON Tools Status GUI shows the current monkey patch state and provides a toggle button to enable or disable hooks immediately. This also updates the config so the setting persists across restarts.

## Uninstalling Hooks

Hooks can be cleanly uninstalled by restoring the original functions:

```python
from worlds.json_tools_installer.monkey_patches import uninstall_hooks

results = uninstall_hooks()
# Restores all wrapped functions to originals
```

## Error Handling

The hooks are designed to fail gracefully:

1. **Import errors** - If `Main` or `BaseClasses` can't be imported, the hook installation fails but doesn't crash
2. **Export errors** - Exceptions during export are caught and logged as warnings
3. **Missing exporters** - If the exporter module isn't installed, a debug message is logged and export is skipped

```python
try:
    from exporter import export_game_rules
    export_game_rules(...)
except ImportError:
    logger.debug("Exporter module not found, skipping rules export")
except Exception as e:
    logger.warning(f"Rules export failed: {e}")
```

## Debugging

To see what's happening with monkey patching, enable debug logging:

```python
import logging
logging.getLogger("worlds.json_tools_installer.monkey_patches").setLevel(logging.DEBUG)
```

You'll see messages like:
- `Installed hook: export_rules`
- `Installed hook: sphere_logging`
- `Exporting rules via monkey patch hook`
- `Exporting pickle via monkey patch hook`

## Limitations

1. **Fallback timing** - When spoiler output is disabled, the fallback path runs after generation completes, so exported files are NOT included in the output ZIP (they go to `frontend/presets/` instead). The primary path does not have this limitation.
2. **Settings** - Requires either configured host.yaml or installer config for settings.
3. **Dependencies** - Requires the exporter module and its dependencies (astunparse, dill) to be installed. The installer auto-installs these during setup.
4. **Single wrap** - If another system also wraps `Spoiler.to_file()` or `Main.main()`, behavior depends on wrap order.
