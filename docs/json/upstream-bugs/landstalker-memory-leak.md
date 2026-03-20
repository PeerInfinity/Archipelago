# [Landstalker] Memory leak from cached_spheres class variable

**Status:** Fixed in fork (Jan 2026)
**Files:** `Main.py`, `exporter/games/base/world_data.py`

---

### Problem

`LandstalkerWorld.cached_spheres` (class variable) holds sphere references to MultiWorld, preventing garbage collection.

In the fork, the exporter was calling `fill_slot_data()` after `stage_modify_multidata` had already cleared the cache, repopulating it and causing the leak.

**Error:** `AssertionError: MultiWorld object was not de-allocated, it's referenced 67 times.`

---

### History

- d46e68cb - Initial Landstalker with `cached_spheres` as ClassVar
- c295926c (Nov 2024) - Fixed by using instance variable
- be550ff6 (Mar 2025) - Reverted to class variable while fixing shop prices
- Upstream has always called `stage_modify_multidata` via `call_stage` (since d743d10b, Oct 2023)
- Fork-specific issue: exporter called `fill_slot_data` after cleanup
- Fixed in fork by caching slot data and clearing exporter caches

---

### Root Cause (Fork-Specific)

The old call order in the fork's Main.py:
1. `fill_slot_data()` called → populates `cached_spheres`
2. `modify_multidata` called → triggers `stage_modify_multidata` → clears cache
3. `export_game_rules()` called → called `fill_slot_data()` again → repopulated cache

Upstream doesn't have the exporter, so it doesn't have this problem.

---

### Fix

1. **Cache slot data** in `Main.py`:
   - After calling `fill_slot_data`, cache the result as `_cached_slot_data` on the world
   - Exporter uses cached data instead of calling `fill_slot_data` again

2. **Clear exporter caches** in `Main.py`:
   - After export completes, clear rule cache and handler cache
   - This releases world references held by export handlers

The exporter now runs after `create_playthrough` (so sphere_log.jsonl is included), but since it uses cached slot data instead of calling `fill_slot_data()`, it doesn't repopulate `cached_spheres`.

---

### Verified

- Upstream (69e83071) never had this issue - `stage_modify_multidata` is called via `call_stage`
- Fork issue caused by exporter calling `fill_slot_data` after cleanup
- Fix verified: generation completes without memory leak assertion

---

### Related

- [Reproduction steps](./landstalker-memory-leak-repro.md)
- [Fix details](./landstalker-memory-leak-fix.md)
