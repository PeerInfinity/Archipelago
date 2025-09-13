#!/usr/bin/env python3
"""
Validate that all mapped items exist in Archipelago.
"""

import json
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath('../../..'))

def validate_mappings():
    # Load mappings
    with open('item_name_mapping.json', 'r') as f:
        item_mapping = json.load(f)
    
    with open('archipelago_items.json', 'r') as f:
        arch_items = set(json.load(f))
    
    # Check all mapped items
    invalid_mappings = []
    
    for section in ['exact_matches', 'manual_mappings']:
        if section in item_mapping:
            for saha_item, arch_item in item_mapping[section].items():
                if arch_item and arch_item not in arch_items:
                    invalid_mappings.append((saha_item, arch_item))
    
    if invalid_mappings:
        print(f"Found {len(invalid_mappings)} invalid mappings:")
        for saha, arch in invalid_mappings:
            print(f"  {saha} -> {arch} (not in Archipelago)")
            # Try to find similar names
            similar = [item for item in arch_items if arch.lower() in item.lower() or item.lower() in arch.lower()]
            if similar:
                print(f"    Possible matches: {similar[:3]}")
    else:
        print("All mappings are valid!")
    
    return invalid_mappings

if __name__ == "__main__":
    invalid = validate_mappings()