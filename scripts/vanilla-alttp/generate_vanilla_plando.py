#!/usr/bin/env python3
"""
Generate a vanilla plando YAML file for A Link to the Past that places all items
in their vanilla locations.
"""

import json
import yaml
import os
import sys

# Add parent directory to path for accessing mappings
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

def load_mappings():
    """Load the vanilla items and mapping files."""
    with open('alttp_vanilla_items.json', 'r') as f:
        vanilla_items = json.load(f)
    
    with open('item_name_mapping.json', 'r') as f:
        item_mapping = json.load(f)
    
    with open('location_name_mapping.json', 'r') as f:
        location_mapping = json.load(f)
    
    return vanilla_items, item_mapping, location_mapping

def map_item_name(saha_item, item_mapping):
    """Map a sahasrahbot item name to Archipelago item name."""
    # Check exact matches first
    if 'exact_matches' in item_mapping and saha_item in item_mapping['exact_matches']:
        return item_mapping['exact_matches'][saha_item]
    
    # Check manual mappings
    if 'manual_mappings' in item_mapping and saha_item in item_mapping['manual_mappings']:
        mapped = item_mapping['manual_mappings'][saha_item]
        return mapped if mapped else None
    
    # Check unmapped items
    if 'unmapped_sahasrahbot' in item_mapping and saha_item in item_mapping['unmapped_sahasrahbot']:
        return None
    
    # Default: try the name as-is
    return saha_item

def map_location_name(saha_location, location_mapping):
    """Map a sahasrahbot location name to Archipelago location name."""
    # Check exact matches first
    if 'exact_matches' in location_mapping and saha_location in location_mapping['exact_matches']:
        return location_mapping['exact_matches'][saha_location]
    
    # Check manual mappings
    if 'manual_mappings' in location_mapping and saha_location in location_mapping['manual_mappings']:
        mapped = location_mapping['manual_mappings'][saha_location]
        return mapped if mapped else None
    
    # Check unmapped locations
    if 'unmapped_sahasrahbot' in location_mapping and saha_location in location_mapping['unmapped_sahasrahbot']:
        return None
    
    # If not found in any mapping, return None (location not mapped)
    return None

def generate_plando_yaml(output_path='Players/custom/A Link to the Past - vanilla.yaml'):
    """Generate the vanilla plando YAML file."""
    
    # Load mappings
    vanilla_items, item_mapping, location_mapping = load_mappings()
    
    # Create plando items list
    plando_items = []
    unmapped_items = []
    unmapped_locations = []
    
    for saha_location, item_data in vanilla_items.items():
        saha_item = item_data['item']
        
        # Map names to Archipelago format
        arch_item = map_item_name(saha_item, item_mapping)
        arch_location = map_location_name(saha_location, location_mapping)
        
        # Skip unmapped items
        if arch_item is None:
            unmapped_items.append((saha_location, saha_item))
            continue
        
        # Skip unmapped locations (includes the 4 locations in unmapped_sahasrahbot)
        if arch_location is None:
            unmapped_locations.append((saha_location, saha_item))
            continue
        
        # Create plando entry
        plando_entry = {
            'item': arch_item,
            'location': arch_location,
            'from_pool': False,  # Create the item instead of taking from pool
            'world': False,  # Place in own world
            'force': 'silent'  # Don't abort if placement fails
        }
        plando_items.append(plando_entry)
    
    # Load the template YAML
    # Get the archipelago base directory (2 levels up from this script)
    archipelago_dir = os.path.dirname(os.path.dirname(script_dir))
    template_path = os.path.join(archipelago_dir, 'Players', 'Templates', 'A Link to the Past.yaml')
    with open(template_path, 'r') as f:
        template = yaml.safe_load(f)
    
    # Modify the template for vanilla placement
    yaml_config = {
        'name': 'VanillaPlando',
        'description': 'A Link to the Past with vanilla item placements',
        'game': 'A Link to the Past',
        'requires': {
            'version': '0.6.4'
        },
        'A Link to the Past': {
            # Basic settings
            'progression_balancing': 0,
            'accessibility': 'items',
            'goal': 'ganon',
            'mode': 'standard',
            'glitches_required': 'no_glitches',
            'dark_room_logic': 'lamp',
            'open_pyramid': 'goal',
            
            # Crystal requirements (vanilla)
            'crystals_needed_for_gt': 7,
            'crystals_needed_for_ganon': 7,
            
            # No shuffling
            'entrance_shuffle': 'vanilla',
            'big_key_shuffle': 'original_dungeon',
            'small_key_shuffle': 'original_dungeon',
            'key_drop_shuffle': False,
            'compass_shuffle': 'original_dungeon',
            'map_shuffle': 'original_dungeon',
            
            # Item settings
            'item_pool': 'normal',
            'item_functionality': 'normal',
            'enemy_health': 'default',
            'enemy_damage': 'default',
            'progressive': 'off',
            'swordless': False,
            
            # No randomization
            'boss_shuffle': 'none',
            'pot_shuffle': False,
            'enemy_shuffle': False,
            'bush_shuffle': False,
            'shop_item_slots': 0,
            'shuffle_prizes': 'off',
            'tile_shuffle': False,
            
            # Medallion requirements (will be randomized unless we specify)
            'misery_mire_medallion': 'ether',  # Vanilla
            'turtle_rock_medallion': 'quake',  # Vanilla
            
            # UI settings
            'hints': 'off',
            'scams': 'off',
            'quickswap': True,
            'menuspeed': 'normal',
            'music': True,
            
            # The plando items - this is the key part!
            'plando_items': plando_items
        }
    }
    
    # Create output directory if it doesn't exist
    output_dir = os.path.dirname(output_path)
    output_dir = os.path.join(archipelago_dir, output_dir)
    os.makedirs(output_dir, exist_ok=True)

    # Write the YAML file
    full_output_path = os.path.join(archipelago_dir, output_path)
    with open(full_output_path, 'w') as f:
        yaml.dump(yaml_config, f, default_flow_style=False, sort_keys=False, width=120)
    
    print(f"Generated vanilla plando YAML with {len(plando_items)} item placements")
    print(f"Saved to: {output_path}")
    
    if unmapped_items:
        print(f"\nWarning: {len(unmapped_items)} items could not be mapped:")
        for loc, item in unmapped_items[:5]:
            print(f"  {loc}: {item}")
        if len(unmapped_items) > 5:
            print(f"  ... and {len(unmapped_items) - 5} more")
    
    if unmapped_locations:
        print(f"\nWarning: {len(unmapped_locations)} locations could not be mapped:")
        for loc, item in unmapped_locations[:5]:
            print(f"  {loc}: {item}")
        if len(unmapped_locations) > 5:
            print(f"  ... and {len(unmapped_locations) - 5} more")
    
    return len(plando_items), len(unmapped_items), len(unmapped_locations)

if __name__ == "__main__":
    mapped, unmapped_items, unmapped_locations = generate_plando_yaml()