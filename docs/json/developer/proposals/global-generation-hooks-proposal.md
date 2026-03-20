# Feature Proposal: Global Generation Hooks

**Status:** Reference implementation in Archipelago-CC fork

## Summary

Add a global hook registry that complements PR #5700's stage methods (`finalize_multiworld`, `pre_output`). This enables utilities that need to run across all worlds without requiring a player slot.

This fork contains a working implementation that serves as a reference for the upstream proposal.

## Relationship to PR #5700

[PR #5700](https://github.com/ArchipelagoMW/Archipelago/pull/5700) introduces two new stage methods:

- `finalize_multiworld` - Final logical adjustments after fill/balancing
- `pre_output` - Preparation before output generation

These follow the existing `AutoWorld.call_all()` pattern, which calls methods on each world instance that has an active player. This is ideal for per-world operations.

**This proposal addresses a gap**: utilities that need to run regardless of player selection.

## The Player Slot Problem

The `call_all()` pattern only invokes methods on worlds with active players:

```python
# From AutoWorld.py
def call_all(world: "MultiWorld", method_name: str, *args: Any) -> None:
    for player in world.player_ids:
        call_single(world, method_name, player, *args)
```

This means:
- A utility APWorld with no players won't have its methods called
- Cross-world tools (exporters, analytics) can't hook into generation
- Users would need to "play" a utility world to activate it

## Implementation

### Hook Registry (`worlds/Hooks.py`)

```python
import logging
from typing import Callable, List, TYPE_CHECKING

if TYPE_CHECKING:
    from BaseClasses import MultiWorld

logger = logging.getLogger(__name__)

PostOutputHook = Callable[["MultiWorld", str, str], None]

_post_output_hooks: List[PostOutputHook] = []


def register_post_output_hook(hook: PostOutputHook) -> None:
    """Register a hook to be called after output generation."""
    _post_output_hooks.append(hook)


def call_post_output_hooks(multiworld: "MultiWorld", output_dir: str, filename_base: str) -> None:
    """Call all registered post-output hooks."""
    for hook in _post_output_hooks:
        try:
            hook(multiworld, output_dir, filename_base)
        except Exception:
            logger.exception(f"Post-output hook {hook.__name__} failed")
```

### Integration with Main.py

A single import and call replaces what was previously a 29-line export block:

```python
# Import (top of Main.py)
from worlds.Hooks import call_post_output_hooks

# Call point (after spoiler generation, before archive creation)
call_post_output_hooks(multiworld, temp_dir, outfilebase)
```

### Hook Registration (APWorld `__init__.py`)

Hooks are registered at module load time, guarded by ImportError for vanilla AP compatibility:

```python
# Register post-output generation hook (works in fork where worlds/Hooks.py exists)
try:
    from worlds.Hooks import register_post_output_hook
    from .export_hook import export_post_output_hook
    register_post_output_hook(export_post_output_hook)
except ImportError:
    pass  # worlds/Hooks.py doesn't exist (vanilla AP without hook support)
```

### Example Hook Function

The JSON Tools exporter hook (`worlds/json_tools_installer/export_hook.py`):

```python
def export_post_output_hook(multiworld, output_dir, filename_base):
    """Export game rules and multiworld pickle after output generation."""
    from settings import get_settings
    from exporter import export_game_rules, clear_rule_cache
    from exporter.games import clear_handler_cache
    from exporter.pickle_exporter import export_multiworld_pickle

    settings = get_settings()

    export_game_rules(
        multiworld, output_dir, filename_base,
        settings.general_options.update_frontend_presets,
        settings.general_options.skip_preset_copy_if_rules_identical,
        settings.general_options.rules_json_format,
        clear_game_presets=settings.general_options.clear_game_presets,
        clear_all_presets=settings.general_options.clear_all_presets,
    )
    clear_rule_cache()
    clear_handler_cache()

    export_multiworld_pickle(
        multiworld, output_dir, filename_base,
        settings.general_options.update_frontend_presets,
        settings.general_options.skip_preset_copy_if_rules_identical,
    )
```

## Comparison with PR #5700

| Aspect | PR #5700 Stages | This Proposal |
|--------|-----------------|---------------|
| Pattern | Instance methods via `call_all()` | Global registry callbacks |
| Requires player | Yes | No |
| Context | Per-world `self` | Full `MultiWorld` |
| Timing | Before output | After output |
| Use case | World-specific logic | Cross-world utilities |

### Timing in Generation Pipeline

```
fill_multiworld()
    ↓
progression_balancing()
    ↓
finalize_multiworld()     ← PR #5700 (per-world)
    ↓
pre_output()              ← PR #5700 (per-world)
    ↓
generate_output()         ← existing (per-world, threaded)
    ↓
spoiler generation
    ↓
post_output hooks         ← THIS PROPOSAL (global)
    ↓
archive creation
```

## Why Both Are Needed

**PR #5700 is ideal for:**
- World-specific final adjustments (`finalize_multiworld`)
- Per-world preparation before output (`pre_output`)
- Operations that need `self` context

**Global hooks are ideal for:**
- Utility APWorlds that don't need a player slot
- Cross-world exporters (JSON rules, analytics)
- Adding files to the output archive
- Operations that need access to generated output files

## Mutual Exclusion: Hooks vs Monkey Patches

The JSON Tools APWorld supports two deployment scenarios. Only one export mechanism is active at a time:

| Scenario | Hooks registered? | Monkey patches installed? | Who handles export? |
|----------|:-:|:-:|---|
| Fork (Main.py has hook call) | Yes | No (`is_main_patched()` → True) | Hook |
| Vanilla AP (no hook support) | No (ImportError) | Yes (`is_main_patched()` → False) | Monkey patch |

Detection in `is_main_patched()`:
```python
def is_main_patched() -> bool:
    try:
        import Main
        return hasattr(Main, 'call_post_output_hooks')
    except ImportError:
        return False
```

## Additional Use Cases

### Generation Analytics

```python
from worlds.Hooks import register_post_output_hook

def collect_analytics(multiworld, output_dir, filename_base):
    stats = {
        "total_locations": len(multiworld.get_locations()),
        "total_items": len(multiworld.itempool),
        "worlds": [w.game for w in multiworld.worlds.values()]
    }
    write_json(f"{output_dir}/{filename_base}_analytics.json", stats)

register_post_output_hook(collect_analytics)
```

### Custom Output Formats

```python
from worlds.Hooks import register_post_output_hook

def generate_html_spoiler(multiworld, output_dir, filename_base):
    html = render_spoiler_html(multiworld)
    with open(f"{output_dir}/{filename_base}_Spoiler.html", "w") as f:
        f.write(html)

register_post_output_hook(generate_html_spoiler)
```

## Implementation Details

### Error Handling

Hooks are wrapped in try/except to prevent crashing generation. Errors are logged via `logger.exception()` but don't halt the process.

### Thread Safety

Hooks run from the main thread after the ThreadPoolExecutor completes `generate_output` calls, so no special synchronization is needed.

### Registration Timing

Hooks are registered at module load time (in APWorld `__init__.py`), before `main()` starts. World imports happen early in the Archipelago startup sequence, so hooks are ready before the call point in Main.py.

### Fork Divergence Reduction

The hook system reduced Main.py fork modifications from ~35 lines (import + 29-line export block) to ~4 lines (import + 2-line hook call). The export logic now lives entirely in the APWorld, which is the appropriate ownership boundary.

## Backward Compatibility

This proposal is purely additive:
- No changes to existing stage methods
- No breaking changes to World API
- Complements rather than replaces PR #5700
- APWorlds using hooks degrade gracefully on vanilla AP via ImportError guard

## Scope

**In scope:**
- Single `post_output` hook point (after spoiler, before archive)
- Simple registration API
- Error handling/logging

**Out of scope (future enhancements):**
- Additional hook points (`post_fill`, `post_spoiler`)
- Hook priorities
- Async hooks

## Summary

PR #5700 enhances the per-world stage system. This proposal adds a complementary global hook system for utilities that need to operate across all worlds without requiring a player slot. Together, they cover both per-world and cross-world use cases. The Archipelago-CC fork contains a working reference implementation.
