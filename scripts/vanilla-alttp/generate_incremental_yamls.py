#!/usr/bin/env python3
"""
Generate incremental YAML files for testing vanilla ALTTP placements.

Creates a series of YAML files, each adding more vanilla placements.
Run seed generation with each to find which group introduces the fill error.

Usage:
    python scripts/vanilla-alttp/generate_incremental_yamls.py

Then test each file:
    python Generate.py --weights_file_path "Templates/A Link to the Past - vanilla-group-N.yaml" --multi 1 --seed 1

Groups are ordered from safest to most likely to cause issues:
  Group 0: Base options only, no plando (should always work)
  Group 1: Filler items (Rupees, Arrows - non-progression)
  Group 2: Heart pieces and containers
  Group 3: Equipment (Mail, Shield, Gloves)
  Group 4: Unique tools/items (Hookshot, Hammer, etc.)
  Group 5: Medallions and special items
  Group 6: Items with pool count mismatches (Lamp, Blue Boomerang, etc.)
  Group 7: Bottles (random pool types)
  Group 8: Link's Uncle (pre-placed by generate_itempool)
  Group 9: Dungeon prizes (handled by pre_fill)
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
TEMPLATE_DIR = os.path.join(PROJECT_DIR, 'Players', 'Templates')

# Load vanilla data
with open(os.path.join(SCRIPT_DIR, 'alttp_vanilla_consolidated.json'), 'r') as f:
    vanilla_data = json.load(f)

# --- Classify locations ---

PRIZE_LOCATIONS = {
    "Eastern Palace - Prize", "Desert Palace - Prize", "Tower of Hera - Prize",
    "Palace of Darkness - Prize", "Swamp Palace - Prize", "Skull Woods - Prize",
    "Thieves' Town - Prize", "Ice Palace - Prize", "Misery Mire - Prize",
    "Turtle Rock - Prize"
}

DUNGEON_ITEM_PREFIXES = ["Small Key (", "Big Key (", "Compass (", "Map ("]

# Items that have more in vanilla data than in the pool
OVERCOUNT_ITEMS = {
    'Lamp',           # vanilla=3, pool=1
    'Blue Boomerang', # vanilla=2, pool=1
    'Rupees (20)',    # vanilla=30, pool=28
    'Bombs (3)',      # vanilla=17, pool=16
    'Silver Bow',     # vanilla has Silver Arrows but we use Silver Bow (what rules check for)
}

# Items that could be randomly placed at Link's Uncle by generate_itempool.
# Any of these may be removed from the pool at seed generation time,
# so we can't safely plando them (would create an extra item).
# From ItemPool.py possible_weapons: swords, bow, hammer, fire rod, canes, bombs
POSSIBLE_UNCLE_WEAPONS = {
    'Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword',
    'Bow',
    'Hammer',
    'Fire Rod',
    'Cane of Somaria', 'Cane of Byrna',
    'Bombs (10)',
}

FILLER_ITEMS = {
    'Rupees (20)', 'Rupees (50)', 'Rupees (100)', 'Rupees (300)', 'Rupees (5)', 'Rupee (1)',
    'Arrows (10)', 'Single Arrow',
    'Bombs (3)', 'Bombs (10)',
}

HEART_ITEMS = {
    'Piece of Heart', 'Boss Heart Container', 'Sanctuary Heart Container',
}

EQUIPMENT_ITEMS = {
    'Blue Mail', 'Red Mail',
    'Blue Shield', 'Red Shield', 'Mirror Shield',
    'Power Glove', 'Titans Mitts',
    'Red Boomerang',  # upgrade items
    'Magic Upgrade (1/2)',
}

PROGRESSION_TOOLS = {
    'Hookshot', 'Bow', 'Hammer', 'Fire Rod', 'Ice Rod',
    'Flippers', 'Flute', 'Pegasus Boots', 'Cape',
    'Bug Catching Net', 'Book of Mudora', 'Shovel',
    'Cane of Somaria', 'Cane of Byrna',
    'Magic Mirror', 'Moon Pearl', 'Magic Powder', 'Mushroom',
}

MEDALLION_ITEMS = {'Bombos', 'Ether', 'Quake'}

SWORD_ITEMS = {
    'Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword',
    'Silver Bow', 'Golden Sword',
}


def is_dungeon_item(item_name):
    return any(item_name.startswith(p) for p in DUNGEON_ITEM_PREFIXES)


def classify_placement(location, item):
    """Returns (group_number, group_name) for a vanilla placement."""
    if location in PRIZE_LOCATIONS:
        return (9, "Dungeon prizes")
    if is_dungeon_item(item):
        return (None, "Dungeon items (skip)")  # Handled by dungeon system
    if location == "Link's Uncle":
        return (8, "Link's Uncle")
    if item == 'Bottle':
        return (7, "Bottles")
    if item in OVERCOUNT_ITEMS:
        return (6, "Pool count mismatches")
    if item in POSSIBLE_UNCLE_WEAPONS and location != "Link's Uncle":
        return (6, "Pool count mismatches (possible uncle weapon)")
    if item in FILLER_ITEMS:
        return (1, "Filler items")
    if item in HEART_ITEMS:
        return (2, "Hearts")
    if item in EQUIPMENT_ITEMS:
        return (3, "Equipment")
    if item in PROGRESSION_TOOLS:
        return (4, "Progression tools")
    if item in MEDALLION_ITEMS:
        return (5, "Medallions")
    if item in SWORD_ITEMS:
        return (5, "Swords and special")
    # Anything else goes to group 4
    return (4, "Other progression")


# Build groups
groups = {i: [] for i in range(10)}
dungeon_items_skipped = []

for location, data in vanilla_data.items():
    item = data['item']
    group_num, group_name = classify_placement(location, item)
    if group_num is None:
        dungeon_items_skipped.append((location, item))
    else:
        groups[group_num].append((location, item, group_name))

# Base YAML options (no plando)
BASE_OPTIONS = """name: VanillaPlando
description: A Link to the Past with vanilla item placements - Group {group_num}
game: A Link to the Past
requires:
  version: 0.6.4
A Link to the Past:
  progression_balancing: 0
  accessibility: items
  goal: ganon
  mode: standard
  glitches_required: no_glitches
  dark_room_logic: lamp
  open_pyramid: goal
  crystals_needed_for_gt: 7
  crystals_needed_for_ganon: 7
  entrance_shuffle: vanilla
  big_key_shuffle: original_dungeon
  small_key_shuffle: original_dungeon
  key_drop_shuffle: false
  compass_shuffle: original_dungeon
  map_shuffle: original_dungeon
  item_pool: normal
  item_functionality: normal
  enemy_health: default
  enemy_damage: default
  progressive: 'off'
  swordless: false
  boss_shuffle: none
  pot_shuffle: false
  enemy_shuffle: false
  bush_shuffle: false
  shop_item_slots: 0
  shuffle_prizes: 'off'
  tile_shuffle: false
  misery_mire_medallion: ether
  turtle_rock_medallion: quake
  hints: 'off'
  scams: 'off'
  quickswap: true
  menuspeed: normal
  music: true"""


def generate_plando_entry(location, item, from_pool=True, force="silent"):
    """Generate a single plando_items entry."""
    return f"""  - item: {item}
    location: {location}
    from_pool: {'true' if from_pool else 'false'}
    world: false
    force: {force}"""


def generate_yaml(group_num, cumulative_entries, group_desc):
    """Generate a YAML file with cumulative plando entries."""
    yaml = BASE_OPTIONS.format(group_num=group_num)

    if cumulative_entries:
        yaml += "\n  plando_items:\n"
        for location, item, from_pool in cumulative_entries:
            yaml += generate_plando_entry(location, item, from_pool) + "\n"

    return yaml


# Print summary
print("=" * 70)
print("INCREMENTAL VANILLA PLACEMENT TEST GROUPS")
print("=" * 70)
print(f"  Skipped {len(dungeon_items_skipped)} dungeon items (handled by dungeon system)")
print()

for i in range(10):
    items = groups[i]
    if items:
        group_name = items[0][2] if items else "Empty"
        print(f"  Group {i}: {group_name} ({len(items)} placements)")
        # Show first few items
        for loc, item, _ in items[:3]:
            print(f"    {loc}: {item}")
        if len(items) > 3:
            print(f"    ... and {len(items) - 3} more")
    else:
        print(f"  Group {i}: (empty)")
    print()

# Generate YAML files
os.makedirs(TEMPLATE_DIR, exist_ok=True)

cumulative = []
files_created = []

for group_num in range(10):
    # Determine from_pool setting for this group
    # Groups 0-5: from_pool=true (items match pool)
    # Groups 6-9: from_pool=false (items DON'T match pool or are special)
    use_from_pool = group_num <= 5

    for location, item, group_name in groups[group_num]:
        cumulative.append((location, item, use_from_pool))

    filename = f"A Link to the Past - vanilla-group-{group_num}.yaml"
    filepath = os.path.join(TEMPLATE_DIR, filename)

    group_desc = groups[group_num][0][2] if groups[group_num] else "No additions"
    yaml_content = generate_yaml(group_num, cumulative, group_desc)

    with open(filepath, 'w') as f:
        f.write(yaml_content)

    files_created.append((group_num, filename, len(cumulative), group_desc))
    print(f"  Created: {filename} ({len(cumulative)} total plando entries, +{len(groups[group_num])} new)")

print()
print("=" * 70)
print("TESTING INSTRUCTIONS")
print("=" * 70)
print("""
Test each group incrementally to find which one breaks:

  # Group 0 - Base options only (no plando)
  python Generate.py --weights_file_path "Templates/A Link to the Past - vanilla-group-0.yaml" --multi 1 --seed 1

  # Group 1 - Add filler items
  python Generate.py --weights_file_path "Templates/A Link to the Past - vanilla-group-1.yaml" --multi 1 --seed 1

  # Group 2 - Add hearts
  python Generate.py --weights_file_path "Templates/A Link to the Past - vanilla-group-2.yaml" --multi 1 --seed 1

  # ... etc up to Group 9

If Group N fails but Group N-1 succeeds, the problem is in Group N.
Then you can bisect within that group by removing half the entries.

For groups 6-9, from_pool is set to false because those items have
pool mismatches. This means extra items are created, which WILL cause
fill errors unless the pool is adjusted.

Groups 0-5 use from_pool=true and should work correctly if the item
names match the pool exactly.
""")

# Also generate a "safe only" YAML with just groups 0-5
safe_entries = []
for group_num in range(6):  # groups 0-5 only
    for location, item, group_name in groups[group_num]:
        safe_entries.append((location, item, True))

safe_filename = "A Link to the Past - vanilla-safe.yaml"
safe_filepath = os.path.join(TEMPLATE_DIR, safe_filename)
safe_yaml = BASE_OPTIONS.format(group_num="safe")
if safe_entries:
    safe_yaml += "\n  plando_items:\n"
    for location, item, from_pool in safe_entries:
        safe_yaml += generate_plando_entry(location, item, from_pool) + "\n"

with open(safe_filepath, 'w') as f:
    f.write(safe_yaml)

print(f"Also created: {safe_filename} ({len(safe_entries)} plando entries - pool-balanced, should work)")

# Generate the FULL vanilla YAML with all placements
# With code changes to ItemPool.py and Dungeons.py:
# - Regular items (including overcounts, weapons, bottles): from_pool=true
# - Prizes: from_pool=false (not in pool, handled by pre_fill skip logic)
# - Dungeon items: from_pool=false (not in pool, dungeon fill skips already-placed)
# - Link's Uncle: SKIP (code auto-selects Fighter Sword when weapons are plandoed)
full_entries = []
for location, data in vanilla_data.items():
    item = data['item']

    # Skip Link's Uncle (code forces Fighter Sword when other weapons are plandoed)
    if location == "Link's Uncle":
        continue

    # Prizes use from_pool=false (they're not in the item pool)
    if location in PRIZE_LOCATIONS:
        full_entries.append((location, item, False))
    # Dungeon items use from_pool=false (handled by dungeon system, not pool)
    elif is_dungeon_item(item):
        full_entries.append((location, item, False))
    else:
        # All regular items use from_pool=true
        # Pool adjustment in ItemPool.py ensures the pool matches
        full_entries.append((location, item, True))

full_filename = "A Link to the Past - vanilla-full.yaml"
full_filepath = os.path.join(TEMPLATE_DIR, full_filename)
full_yaml = BASE_OPTIONS.format(group_num="full")
if full_entries:
    full_yaml += "\n  plando_items:\n"
    for location, item, from_pool in full_entries:
        full_yaml += generate_plando_entry(location, item, from_pool) + "\n"

with open(full_filepath, 'w') as f:
    f.write(full_yaml)

from_pool_true = sum(1 for _, _, fp in full_entries if fp)
from_pool_false = sum(1 for _, _, fp in full_entries if not fp)
print(f"\nAlso created: {full_filename}")
print(f"  {len(full_entries)} total plando entries")
print(f"  {from_pool_true} from_pool=true (regular items)")
print(f"  {from_pool_false} from_pool=false (prizes)")
print(f"  Requires ItemPool.py code changes: bottle fix, uncle weapon fix, pool adjustment")
