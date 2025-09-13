#!/usr/bin/env python3
"""
Extract all item and location names from the sahasrahbot vanilla.yaml file.
"""

import base64
import yaml
import json

def extract_names_from_vanilla_yaml(yaml_file='vanilla.yaml'):
    """
    Extract all item and location names from the vanilla.yaml file.
    """
    with open(yaml_file, 'r') as f:
        data = yaml.safe_load(f)
    
    items = set()
    locations = set()
    
    # Extract from the 'l' section (location -> item mappings)
    if 'settings' in data and 'l' in data['settings']:
        for encoded_location, item in data['settings']['l'].items():
            try:
                # Decode location name
                decoded = base64.b64decode(encoded_location).decode('utf-8')
                location_name = decoded.split(':')[0]
                locations.add(location_name)
                
                # Extract item name
                item_name = item.split(':')[0] if ':' in item else item
                items.add(item_name)
            except Exception as e:
                print(f"Warning: Could not decode {encoded_location}: {e}")
    
    # Also extract from item.count section if it exists
    if 'settings' in data and 'custom' in data['settings']:
        custom = data['settings']['custom']
        if 'item' in custom and 'count' in custom['item']:
            for item_name in custom['item']['count'].keys():
                items.add(item_name)
    
    # Extract from drops section
    if 'settings' in data and 'drops' in data['settings']:
        drops = data['settings']['drops']
        for drop_category in drops.values():
            if isinstance(drop_category, list):
                for item in drop_category:
                    if isinstance(item, str):
                        items.add(item)
    
    # Extract from eq section
    if 'settings' in data and 'eq' in data['settings']:
        for item in data['settings']['eq']:
            if isinstance(item, str):
                items.add(item)
    
    return sorted(list(items)), sorted(list(locations))

def save_to_json(data, filename):
    """Save list to JSON file."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved {len(data)} entries to {filename}")

if __name__ == "__main__":
    items, locations = extract_names_from_vanilla_yaml()
    
    # Save items
    save_to_json(items, 'sahasrahbot_items.json')
    
    # Save locations  
    save_to_json(locations, 'sahasrahbot_locations.json')
    
    print(f"\nTotal unique items: {len(items)}")
    print(f"Total unique locations: {len(locations)}")
    
    print("\nSample items:", items[:10])
    print("\nSample locations:", locations[:10])