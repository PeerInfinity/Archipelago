#!/usr/bin/env python3
"""
Analyze vanilla item placements vs the ALTTP item pool to identify mismatches.

This script compares what the vanilla consolidated data expects to place
against what actually exists in the Archipelago ALTTP item pool for
normal difficulty with progressive: off settings.

Usage:
    python scripts/vanilla-alttp/analyze_pool_match.py
"""

import json
import os
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Load vanilla consolidated data
with open(os.path.join(SCRIPT_DIR, 'alttp_vanilla_consolidated.json'), 'r') as f:
    vanilla_data = json.load(f)

# --- Reconstruct the expected item pool for vanilla-like settings ---
# Settings: normal difficulty, progressive: off, no_glitches, standard mode,
#           swordless: false, retro_bow: false, shop_item_slots: 0

# From ItemPool.py:
alwaysitems = ['Bombos', 'Book of Mudora', 'Cane of Somaria', 'Ether', 'Fire Rod', 'Flippers', 'Flute', 'Hammer',
               'Hookshot', 'Ice Rod', 'Lamp',
               'Cape', 'Magic Powder', 'Mushroom', 'Pegasus Boots', 'Quake', 'Shovel', 'Bug Catching Net',
               'Cane of Byrna', 'Blue Boomerang', 'Red Boomerang']

basicgloves = ['Power Glove', 'Titans Mitts']
legacyinsanity = ['Magic Mirror', 'Moon Pearl']

normalbaseitems = (['Single Arrow', 'Sanctuary Heart Container', 'Arrows (10)', 'Bombs (10)'] +
                   ['Rupees (300)'] * 3 + ['Boss Heart Container'] * 10 + ['Piece of Heart'] * 24)

# With progressive: off
basicshield = ['Blue Shield', 'Red Shield', 'Mirror Shield']
basicarmor = ['Blue Mail', 'Red Mail']
basicmagic = ['Magic Upgrade (1/2)', 'Rupees (300)']  # Note: second entry is Rupees, not magic!
# With no_glitches and not swordless: swordless_bows path
basicbow = ['Bow', 'Silver Bow']
basicsword = ['Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword']

# 4 random bottles from normalbottles (we don't know which ones)
normalbottles = ['Bottle', 'Bottle (Red Potion)', 'Bottle (Green Potion)', 'Bottle (Blue Potion)',
                 'Bottle (Fairy)', 'Bottle (Bee)', 'Bottle (Good Bee)']

# Extras (fill up to 153)
normalfirst15extra = ['Rupees (100)', 'Rupees (300)', 'Rupees (50)'] + ['Arrows (10)'] * 6 + ['Bombs (3)'] * 6
normalsecond15extra = ['Bombs (3)'] * 10 + ['Rupees (50)'] * 2 + ['Arrows (10)'] * 2 + ['Rupee (1)']
normalthird10extra = ['Rupees (50)'] * 4 + ['Rupees (20)'] * 3 + ['Arrows (10)', 'Rupee (1)', 'Rupees (5)']
normalfourth5extra = ['Arrows (10)'] * 2 + ['Rupees (20)'] * 2 + ['Rupees (5)']
normalfinal25extra = ['Rupees (20)'] * 23 + ['Rupees (5)'] * 2

total_items_to_place = 153

# Build pool
pool = []
pool.extend(alwaysitems)        # 21
pool.extend(basicgloves)        # 2
pool.extend(legacyinsanity)     # 2
pool.extend(normalbaseitems)    # 41
# 4 bottles (random - we'll use "Bottle?" as placeholder)
pool.extend(['Bottle?'] * 4)    # 4
pool.extend(basicshield)        # 3
pool.extend(basicarmor)         # 2
pool.extend(basicmagic)         # 2
pool.extend(basicbow)           # 2
pool.extend(basicsword)         # 4
# Total so far: 83

# Standard mode: Link's Uncle gets a RANDOM weapon from pool.
# Possible weapons: any first sword, first bow, Hammer, Fire Rod, Cane of Somaria,
# Cane of Byrna, Bombs (10). We don't know which one, so we DON'T remove from pool
# in this analysis - but we flag all possible_weapons as unsafe for plando.
# We still count 1 placed item for the total.
placed_items = {"Link's Uncle": "(random weapon from possible_weapons)"}
# NOTE: The actual pool in game will have 1 fewer item than shown here
# because Link's Uncle removes one randomly. Pool = len(pool) - 1 at runtime.

# extraitems = 153 - 82 - 1 = 70
extraitems = total_items_to_place - len(pool) - len(placed_items)
extras = [normalfirst15extra, normalsecond15extra, normalthird10extra, normalfourth5extra, normalfinal25extra]
for extra in extras:
    if extraitems >= len(extra):
        pool.extend(extra)
        extraitems -= len(extra)
    elif extraitems > 0:
        pool.extend(extra[:extraitems])
        extraitems = 0
        break
    else:
        break

print(f"Pool size: {len(pool)} items (+ 1 placed at Link's Uncle = {len(pool) + 1} total)")
print(f"total_items_to_place: {total_items_to_place}")
print()

# --- Categorize vanilla placements ---
PRIZE_LOCATIONS = {
    "Eastern Palace - Prize", "Desert Palace - Prize", "Tower of Hera - Prize",
    "Palace of Darkness - Prize", "Swamp Palace - Prize", "Skull Woods - Prize",
    "Thieves' Town - Prize", "Ice Palace - Prize", "Misery Mire - Prize",
    "Turtle Rock - Prize"
}

DUNGEON_ITEM_NAMES = set()
for prefix in ["Small Key", "Big Key", "Compass", "Map"]:
    for dungeon in ["Eastern Palace", "Desert Palace", "Tower of Hera", "Hyrule Castle",
                    "Palace of Darkness", "Swamp Palace", "Skull Woods", "Thieves Town",
                    "Ice Palace", "Misery Mire", "Turtle Rock", "Ganons Tower",
                    "Agahnims Tower"]:
        DUNGEON_ITEM_NAMES.add(f"{prefix} ({dungeon})")

prizes = {}
dungeon_items = {}
regular_items = {}

for location, data in vanilla_data.items():
    item = data['item']
    if location in PRIZE_LOCATIONS:
        prizes[location] = item
    elif item in DUNGEON_ITEM_NAMES:
        dungeon_items[location] = item
    else:
        regular_items[location] = item

print("=" * 70)
print("VANILLA PLACEMENT CATEGORIES")
print("=" * 70)
print(f"  Dungeon prizes:  {len(prizes)} (handled by pre_fill, NOT in pool)")
print(f"  Dungeon items:   {len(dungeon_items)} (handled by dungeon system with original_dungeon)")
print(f"  Regular items:   {len(regular_items)} (these go through the fill/plando)")
print(f"  Total:           {len(vanilla_data)}")
print()

# --- Compare regular vanilla items with pool ---
vanilla_item_counts = Counter(data for data in regular_items.values())
pool_counts = Counter(pool)

# Treat bottles specially
bottle_variants = [b for b in pool_counts if b.startswith('Bottle')]
total_pool_bottles = sum(pool_counts[b] for b in bottle_variants)
vanilla_bottle_count = vanilla_item_counts.get('Bottle', 0)

print("=" * 70)
print("ITEM COUNT COMPARISON: Vanilla Regular Items vs Pool")
print("=" * 70)
print(f"{'Item Name':<40} {'Vanilla':>8} {'Pool':>8} {'Delta':>8} {'Status'}")
print("-" * 70)

all_items = sorted(set(list(vanilla_item_counts.keys()) + [k for k in pool_counts.keys() if k != 'Bottle?']))
mismatches = []
safe_items = []
problematic_items = []

for item in all_items:
    v_count = vanilla_item_counts.get(item, 0)

    if item == 'Bottle':
        p_count = total_pool_bottles  # Pool has 4 bottles but of random types
        delta = v_count - p_count
        status = "BOTTLE MISMATCH" if v_count > 0 else ""
        if v_count > 0:
            problematic_items.append((item, v_count, p_count, "Pool bottles have random types (Bottle, Bottle (Red Potion), etc.)"))
    elif item.startswith('Bottle ('):
        continue  # Skip bottle variants in this view
    else:
        p_count = pool_counts.get(item, 0)
        delta = v_count - p_count

        if delta == 0:
            status = "OK"
            if v_count > 0:
                safe_items.append(item)
        elif delta > 0:
            status = f"OVER by {delta}"
            problematic_items.append((item, v_count, p_count, f"Vanilla wants {delta} more than pool has"))
            mismatches.append((item, v_count, p_count))
        else:
            status = f"UNDER by {-delta}"
            if v_count > 0:
                safe_items.append(item)  # Pool has enough

    if v_count > 0 or p_count > 0:
        print(f"  {item:<38} {v_count:>8} {p_count:>8} {delta:>+8}   {status}")

print()
print("=" * 70)
print("ITEMS ONLY IN POOL (not in vanilla regular placements)")
print("=" * 70)
pool_only = {item: count for item, count in pool_counts.items()
             if item not in vanilla_item_counts and item != 'Bottle?' and count > 0}
for item, count in sorted(pool_only.items()):
    print(f"  {item}: {count}")

print()
print("=" * 70)
print("PROBLEMATIC ITEMS (vanilla wants more than pool has)")
print("=" * 70)
total_excess = 0
for item, v_count, p_count, reason in problematic_items:
    excess = v_count - p_count
    if excess > 0:
        total_excess += excess
    print(f"  {item}: vanilla={v_count}, pool={p_count} → {reason}")

print(f"\n  Total excess items if using from_pool=true: {total_excess}")
print(f"  (Each excess creates a new item without removing from pool → fill error)")

print()
print("=" * 70)
print("LINK'S UNCLE / POSSIBLE WEAPONS ISSUE")
print("=" * 70)
uncle_item = regular_items.get("Link's Uncle", "NOT IN VANILLA DATA")
possible_weapons = {
    'Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword',
    'Bow', 'Hammer', 'Fire Rod', 'Cane of Somaria', 'Cane of Byrna', 'Bombs (10)',
}
print(f"  Vanilla wants at Link's Uncle: {uncle_item}")
print(f"  generate_itempool places a RANDOM weapon from this set:")
for w in sorted(possible_weapons):
    print(f"    - {w}")
print(f"  The chosen weapon is REMOVED from the pool. Since we can't predict")
print(f"  which one, we must NOT plando ANY of these items anywhere.")
print(f"  Locations with possible weapons (all must be excluded from plando):")
weapon_locs = {loc: item for loc, item in regular_items.items() if item in possible_weapons}
for loc, item in sorted(weapon_locs.items()):
    print(f"    {loc}: {item}")
print(f"  Total: {len(weapon_locs)} placements to exclude")

print()
print("=" * 70)
print("DUNGEON PRIZE ISSUE")
print("=" * 70)
print(f"  Plando runs BEFORE pre_fill (Main.py lines 191 vs 198)")
print(f"  So plando CAN place at prize locations, BUT...")
print(f"  pre_fill then creates 10 prize items and tries fill_restrictive")
print(f"  If all prize locations are filled → FillError in pre_fill")
print(f"  Recommendation: Do NOT plando prizes, OR modify pre_fill to skip filled locations")
for loc, item in sorted(prizes.items()):
    print(f"    {loc}: {item}")

print()
print("=" * 70)
print("BOTTLE ISSUE")
print("=" * 70)
print(f"  Pool creates 4 random bottles from: {normalbottles}")
print(f"  Vanilla wants 4 plain 'Bottle' items at:")
bottle_locations = {loc: item for loc, item in regular_items.items() if item == 'Bottle'}
for loc in sorted(bottle_locations):
    print(f"    {loc}")
print(f"  If pool has 'Bottle (Red Potion)' but plando wants 'Bottle',")
print(f"  from_pool=true can't find it → creates new → pool imbalance → fill error")
print(f"  Recommendation: Do NOT plando bottles, let fill algorithm place them")

print()
print("=" * 70)
print("SAFE ITEMS FOR PLANDO (exact pool match)")
print("=" * 70)
safe_locs = {loc: item for loc, item in regular_items.items()
             if item in safe_items and loc != "Link's Uncle"}
print(f"  {len(safe_locs)} locations with items that have exact pool count matches")

# Items that should NOT be plandoed
skip_items = set()
for item, v_count, p_count, reason in problematic_items:
    skip_items.add(item)
skip_items.add('Bottle')  # Always skip bottles
skip_items.update(possible_weapons)  # Any could be taken by Link's Uncle

skip_locations = {"Link's Uncle"}  # Always skip

safe_plando_locs = {}
unsafe_plando_locs = {}
for loc, item in regular_items.items():
    if loc in skip_locations or item in skip_items:
        unsafe_plando_locs[loc] = item
    else:
        safe_plando_locs[loc] = item

print(f"\n  Safe to plando: {len(safe_plando_locs)} locations")
print(f"  Unsafe/skip:    {len(unsafe_plando_locs)} locations")
print(f"  Prizes:         {len(prizes)} locations (skip)")
print(f"  Dungeon items:  {len(dungeon_items)} locations (skip)")

print()
print("=" * 70)
print("RECOMMENDED PLANDO STRATEGY")
print("=" * 70)
print(f"""
  1. Use correct options: entrance_shuffle=vanilla, original_dungeon for
     all dungeon items, progressive='off', mode=standard, etc.

  2. Use from_pool=true for the {len(safe_plando_locs)} safe regular items

  3. Skip these categories (let Archipelago handle them):
     - {len(prizes)} dungeon prizes (pre_fill handles them)
     - {len(dungeon_items)} dungeon items (dungeon system handles them)
     - Link's Uncle (generate_itempool handles it)
     - {vanilla_bottle_count} bottle locations (pool bottle types are random)
     - Items with count mismatches: {', '.join(sorted(skip_items - {'Bottle'}))}

  4. Pool balance after safe plando:
     - Pool starts with {len(pool)} items
     - Plando removes {len(safe_plando_locs)} items
     - Remaining in pool: {len(pool) - len(safe_plando_locs)} items
     - Remaining unfilled regular locations: {len(regular_items) - 1 - len(safe_plando_locs)}
       (Link's Uncle is pre-filled, not counted)
""")

# Count items left in pool after safe plando
safe_plando_item_counts = Counter(item for item in safe_plando_locs.values())
remaining_pool = Counter(pool)
for item, count in safe_plando_item_counts.items():
    remaining_pool[item] -= count

print("  Remaining pool items after safe plando:")
for item, count in sorted(remaining_pool.items()):
    if count > 0:
        print(f"    {item}: {count}")
remaining_total = sum(c for c in remaining_pool.values() if c > 0)
remaining_locs = len(regular_items) - 1 - len(safe_plando_locs)  # -1 for Link's Uncle
print(f"  Total remaining: {remaining_total} items for {remaining_locs} locations")
if remaining_total == remaining_locs:
    print(f"  ✓ BALANCED - fill should succeed")
elif remaining_total > remaining_locs:
    print(f"  ✗ {remaining_total - remaining_locs} EXTRA items - will cause fill error")
else:
    print(f"  ✗ {remaining_locs - remaining_total} MISSING items - locations will be unfilled")
