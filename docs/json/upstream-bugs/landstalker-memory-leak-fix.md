# Fixing the Landstalker Memory Leak

> **Note:** This was a **fork-specific bug**, not an upstream bug. Upstream has always properly called `stage_modify_multidata` via `call_stage` (since d743d10b, Oct 2023).

## Overview

The fork's exporter was calling `fill_slot_data()` after `stage_modify_multidata` had already cleared the cache, repopulating it and causing the memory leak.

## The Fix

The fix has two parts:
1. Cache slot data so the exporter doesn't need to call `fill_slot_data()`
2. Clear exporter caches after use to release world references

### 1. Cache slot data (Main.py, exporter/games/base/world_data.py)

Main.py caches `slot_data` on the world object after calling `fill_slot_data`:

```python
slot_data[slot] = multiworld.worlds[slot].fill_slot_data()
# Cache slot_data on the world for the exporter to use
# This avoids calling fill_slot_data twice
multiworld.worlds[slot]._cached_slot_data = slot_data[slot]
```

The exporter uses this cached data instead of calling `fill_slot_data` again:

```python
# Export slot_data if available (cached by Main.py before exporter is called)
# This avoids calling fill_slot_data twice, which can cause memory leaks
# for worlds that populate class variables (like Landstalker's cached_spheres)
if hasattr(world, '_cached_slot_data') and world._cached_slot_data:
    world_data['slot_data'] = world._cached_slot_data
```

### 2. Export after create_playthrough, then clear caches (Main.py)

The exporter runs after `create_playthrough` so that sphere_log.jsonl is included in the export. Then caches are cleared to release world references:

```python
if args.spoiler > 1:
    logger.info('Calculating playthrough.')
    multiworld.spoiler.create_playthrough(create_paths=args.spoiler > 2)

if args.spoiler:
    multiworld.spoiler.to_file(os.path.join(temp_dir, '%s_Spoiler.txt' % outfilebase))

# Export rules data after create_playthrough so sphere_log.jsonl is included.
# The exporter uses cached _cached_slot_data instead of calling fill_slot_data,
# so it won't repopulate caches that were cleared by stage_modify_multidata.
settings = get_settings()
if settings.general_options.save_rules_json:
    from exporter import clear_rule_cache
    from exporter.games import clear_handler_cache
    export_game_rules(...)
    # Clear exporter caches to allow GC
    clear_rule_cache()
    clear_handler_cache()
```

## Why This Works

The call order:
1. `fill_slot_data()` called → populates `cached_spheres`, result cached as `_cached_slot_data`
2. `modify_multidata` called → `stage_modify_multidata` clears `cached_spheres`
3. `create_playthrough` called → creates sphere_log.jsonl
4. `export_game_rules()` called → uses cached `_cached_slot_data`, doesn't call `fill_slot_data`
5. Exporter caches cleared → releases world references
6. No lingering references → garbage collection succeeds

The key insight is that since the exporter uses `_cached_slot_data` instead of calling `fill_slot_data()`, it doesn't repopulate `cached_spheres` even though it runs after `stage_modify_multidata` has cleared it.

## Alternative: Instance Variable Approach

An alternative fix would convert `cached_spheres` to an instance variable in upstream Landstalker. This would be a more robust solution but requires upstream changes. See the detailed steps below if this approach is ever needed.

### Changes to `worlds/landstalker/__init__.py`

1. Change class variable to instance variable declaration
2. Initialize in `__init__`
3. Update `fill_slot_data` to use `self.cached_spheres`
4. Update `adjust_shop_prices` to use `self.cached_spheres`
5. Update `stage_modify_multidata` to iterate over world instances

## Verification

After applying the fix, run the generation command:

```bash
source .venv/bin/activate
python Generate.py --weights_file_path "Templates/Landstalker - The Treasures of King Nole.yaml" --multi 1
```

The command should complete without the `AssertionError: MultiWorld object was not de-allocated` error.

Expected output ends with:
```
Done. Enjoy. Total Time: ...
```

(No assertion error means the fix is working.)
