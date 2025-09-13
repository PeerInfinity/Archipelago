#!/usr/bin/env python3
"""
Extract vanilla ALTTP item locations from the sahasrahbot vanilla.yaml preset file.
The locations are base64 encoded in the YAML file and need to be decoded.
"""

import base64
import yaml
import json
import sys

def extract_vanilla_items(yaml_file='vanilla.yaml', output_file='alttp_vanilla_items.json'):
    """
    Extract vanilla item locations from the ALTTP randomizer preset YAML file.
    
    Args:
        yaml_file: Path to the vanilla.yaml preset file
        output_file: Path to save the extracted JSON data
    """
    try:
        with open(yaml_file, 'r') as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: Could not find {yaml_file}")
        return False
    except yaml.YAMLError as e:
        print(f"Error parsing YAML: {e}")
        return False
    
    vanilla_items = {}
    
    # The item locations are stored in settings.l with base64 encoded keys
    if 'settings' in data and 'l' in data['settings']:
        for encoded_location, item in data['settings']['l'].items():
            try:
                # Decode base64 location name
                decoded = base64.b64decode(encoded_location).decode('utf-8')
                # Extract location name and count (format is "Location:count")
                location_parts = decoded.split(':')
                location_name = location_parts[0]
                
                # Extract item name and count
                if ':' in item:
                    item_parts = item.split(':')
                    item_name = item_parts[0]
                    item_count = item_parts[1] if len(item_parts) > 1 else '1'
                else:
                    item_name = item
                    item_count = '1'
                
                vanilla_items[location_name] = {
                    'item': item_name,
                    'count': item_count
                }
            except Exception as e:
                print(f"Warning: Could not decode {encoded_location}: {e}")
    else:
        print("Error: Could not find location data in YAML file")
        return False
    
    # Save to JSON file
    try:
        with open(output_file, 'w') as f:
            json.dump(vanilla_items, f, indent=2, sort_keys=True)
        print(f"Successfully extracted {len(vanilla_items)} vanilla item locations")
        print(f"Saved to {output_file}")
        return True
    except Exception as e:
        print(f"Error saving JSON file: {e}")
        return False

if __name__ == "__main__":
    # Allow command line arguments for file paths
    yaml_file = sys.argv[1] if len(sys.argv) > 1 else 'vanilla.yaml'
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'alttp_vanilla_items.json'
    
    if extract_vanilla_items(yaml_file, output_file):
        # Show sample output
        with open(output_file, 'r') as f:
            data = json.load(f)
        
        print("\nSample entries:")
        sample_locations = [
            "Link's House",
            "Link's Uncle", 
            "Eastern Palace - Big Chest",
            "Master Sword Pedestal",
            "King Zora"
        ]
        
        for location in sample_locations:
            if location in data:
                item_data = data[location]
                print(f"  {location}: {item_data['item']} x{item_data['count']}")