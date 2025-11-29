"""
Force vanilla item placements for A Link to the Past.
This module places all items in their vanilla locations using the consolidated data from scripts/vanilla-alttp.

IMPORTANT: TO USE THIS SCRIPT
============================
This file must be moved to worlds/alttp/VanillaPlacement.py in order to function properly.

Requirements for use:
1. Move this file to: worlds/alttp/VanillaPlacement.py
2. The relative import on line 8 (from .Regions import key_drop_data) requires the file
   to be in the worlds/alttp/ package
3. Main.py imports this as: from worlds.alttp.VanillaPlacement import overwrite_with_vanilla_items
4. The file needs access to world.create_event() and world.create_item() methods which are
   specific to the ALTTP world implementation

This file is stored in scripts/vanilla-alttp/ for organizational purposes alongside the
vanilla placement data and analysis scripts, but it cannot run from this location.
"""

import json
import os
from .Regions import key_drop_data

def load_vanilla_data():
    """Load consolidated vanilla item data with Archipelago names."""
    # Get the path relative to the current file's location
    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_path = os.path.join(current_dir, '..', '..', 'scripts', 'vanilla-alttp')

    # Load the consolidated vanilla data (already has Archipelago names)
    with open(os.path.join(base_path, 'alttp_vanilla_consolidated.json'), 'r') as f:
        vanilla_items = json.load(f)

    return vanilla_items

def overwrite_with_vanilla_items(world):
    """Overwrite already-placed items with vanilla placements."""

    # Get the player number
    player = world.player
    multiworld = world.multiworld

    # Set vanilla medallion requirements
    # In vanilla ALTTP: Misery Mire requires Ether, Turtle Rock requires Quake
    world.options.misery_mire_medallion.value = 0  # Ether
    world.options.turtle_rock_medallion.value = 2  # Quake
    world.required_medallions = ('Ether', 'Quake')

    # Load consolidated vanilla data (already has Archipelago names)
    vanilla_items = load_vanilla_data()

    print(f"\n=== Overwriting with Vanilla Item Placements for Player {player} ===")
    print(f"Loaded {len(vanilla_items)} vanilla item placements from consolidated data")
    print(f"  Set medallion requirements: Misery Mire = Ether, Turtle Rock = Quake")

    overwritten_count = 0
    failed_overwrites = []

    # Process each vanilla item placement
    for arch_location, item_data in vanilla_items.items():
        # Skip medallion requirement entries if they somehow made it through
        if arch_location in ["Misery Mire Medallion", "Turtle Rock Medallion"]:
            continue

        arch_item = item_data['item']

        try:
            location = multiworld.get_location(arch_location, player)

            # Store what was there before
            old_item = location.item

            # Create the new item
            if arch_item in ['Beat Agahnim 1', 'Beat Agahnim 2']:
                # These are events, not normal items
                new_item = world.create_event(arch_item)
            else:
                new_item = world.create_item(arch_item)

            # Clear the location and place the new item
            location.item = None
            location.place_locked_item(new_item)
            overwritten_count += 1

            # Only print key items and progression items for brevity
            if arch_item in ['Green Pendant', 'Blue Pendant', 'Red Pendant'] or 'Crystal' in arch_item or \
               arch_item in ['Master Sword', 'Bow', 'Hookshot', 'Hammer', 'Flippers', 'Moon Pearl', 'Magic Mirror'] or \
               (old_item and old_item.name != new_item.name):
                print(f"  {arch_location}: {old_item.name if old_item else 'Empty'} -> {new_item.name}")

        except Exception as e:
            failed_overwrites.append((arch_location, arch_item, str(e)))

    # Now place keys in the key drop and pot key locations
    # These don't exist in vanilla but Archipelago expects them
    key_drop_count = 0
    for location_name, drop_data in key_drop_data.items():
        key_type = drop_data[3]  # The key type is stored in the 4th element
        try:
            location = multiworld.get_location(location_name, player)

            # Create the appropriate key item
            new_item = world.create_item(key_type)

            # Clear the location and place the key
            location.item = None
            location.place_locked_item(new_item)
            key_drop_count += 1

        except Exception as e:
            failed_overwrites.append((location_name, key_type, str(e)))

    print(f"\n=== Overwrote {overwritten_count} locations with vanilla items ===")
    print(f"  Placed {key_drop_count} keys in key drop/pot locations")
    if failed_overwrites:
        print(f"  Failed to overwrite {len(failed_overwrites)} items:")
        for loc, item, error in failed_overwrites[:5]:
            print(f"    {item} at {loc}: {error}")

    return overwritten_count
