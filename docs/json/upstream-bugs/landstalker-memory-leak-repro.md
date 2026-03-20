# Reproducing the Landstalker Memory Leak

> **Note:** This bug has been fixed in this fork. These reproduction steps document the historical issue.

## Background

This was a **fork-specific bug**, not an upstream bug. The issue was caused by the fork's exporter calling `fill_slot_data()` after `stage_modify_multidata` had already cleared the cache.

Upstream has always properly called `stage_modify_multidata` via `call_stage` (since d743d10b, Oct 2023).

## Prerequisites

- Python 3.12+
- Archipelago-CC fork (before the fix)

## Steps (before fix)

```bash
source .venv/bin/activate
python Generate.py --weights_file_path "Templates/Landstalker - The Treasures of King Nole.yaml" --multi 1
```

### Expected output (before fix)

```
AssertionError: MultiWorld object was not de-allocated, it's referenced 67 times. This would be a memory leak.
```

## Root Cause

The old call order in the fork's Main.py caused the issue:
1. `fill_slot_data()` called → populates `cached_spheres`
2. `modify_multidata` called → triggers `stage_modify_multidata` → clears cache
3. `export_game_rules()` called → called `fill_slot_data()` again → **repopulated cache**

The second call to `fill_slot_data` (from the exporter) repopulated the cache after it was cleared.

Additionally, the sphere logger (`create_playthrough_with_logging`) created export handlers that held world references, which weren't cleared.

## Manual reproduction test

To manually test the memory leak mechanism:

```bash
python -c "
import gc
import weakref
import sys

from worlds.landstalker import LandstalkerWorld
from test.general import setup_solo_multiworld

multiworld = setup_solo_multiworld(LandstalkerWorld)

# Simulate what fill_slot_data does during output generation
LandstalkerWorld.cached_spheres = list(multiworld.get_spheres())

print(f'cached_spheres length: {len(LandstalkerWorld.cached_spheres)}')

weak = weakref.ref(multiworld)
del multiworld
gc.collect()

if weak():
    print(f'MEMORY LEAK: MultiWorld still referenced {sys.getrefcount(weak())} times')
else:
    print('No memory leak')
"
```

## Notes

- The memory leak assertion in `Generate.py` only triggers when `__debug__` is True (default)
- Upstream never had this issue - only the fork's exporter caused it
- Fix: Move exporter before `modify_multidata`, use cached slot data, clear handler cache after `create_playthrough`
