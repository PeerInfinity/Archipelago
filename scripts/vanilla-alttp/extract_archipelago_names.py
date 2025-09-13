#!/usr/bin/env python3
"""
Extract all item and location names from the Archipelago worlds/alttp data.
"""

import json
import sys
import os

# Add parent directories to path to import from worlds/alttp
sys.path.insert(0, os.path.abspath('../../..'))

def extract_archipelago_names():
    """
    Extract all item and location names from the Archipelago ALTTP world.
    """
    items = set()
    locations = set()
    
    try:
        # Import Items data
        from worlds.alttp.Items import item_table
        
        # Extract all item names from item_table
        for item_name in item_table.keys():
            items.add(item_name)
        
    except ImportError as e:
        print(f"Error importing Items: {e}")
    
    try:
        # Import Regions data for locations
        from worlds.alttp.Regions import location_table, key_drop_data
        
        # Extract location names from location_table
        for location_name in location_table.keys():
            locations.add(location_name)
        
        # Add key drop locations
        for key_location in key_drop_data.keys():
            locations.add(key_location)
                
    except ImportError as e:
        print(f"Error importing Regions: {e}")
    
    try:
        # Import shop locations from Shops module
        from worlds.alttp.Shops import shop_table_by_location
        
        # Add shop locations
        for shop_name in shop_table_by_location.keys():
            locations.add(shop_name)
                
    except ImportError as e:
        print(f"Error importing Shops: {e}")
    
    return sorted(list(items)), sorted(list(locations))

def save_to_json(data, filename):
    """Save list to JSON file."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(data)} entries to {filename}")

if __name__ == "__main__":
    items, locations = extract_archipelago_names()
    
    # Save items
    save_to_json(items, 'archipelago_items.json')
    
    # Save locations
    save_to_json(locations, 'archipelago_locations.json')
    
    print(f"\nTotal unique items: {len(items)}")
    print(f"Total unique locations: {len(locations)}")
    
    if items:
        print("\nSample items:", list(items)[:10])
    if locations:
        print("\nSample locations:", list(locations)[:10])