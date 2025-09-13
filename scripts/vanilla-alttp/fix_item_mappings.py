#!/usr/bin/env python3
"""
Fix item_name_mapping.json based on analysis of item_name_comparison.json
"""

import json

def load_json_file(filename):
    """Load a JSON file and return its contents."""
    with open(filename, 'r') as f:
        return json.load(f)

def save_json_file(filename, data):
    """Save data to a JSON file."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

def main():
    # Load all required files
    sahasrahbot_items = set(load_json_file('sahasrahbot_items.json'))
    archipelago_items = set(load_json_file('archipelago_items.json'))
    current_mapping = load_json_file('item_name_mapping.json')
    comparison = load_json_file('item_name_comparison.json')
    
    # Create a new mapping structure
    new_mapping = {
        "_comment": "Mapping from sahasrahbot item names to Archipelago item names",
        "_note": "null values indicate no equivalent exists in Archipelago",
        "exact_matches": {},
        "manual_mappings": {},
        "unmapped_sahasrahbot": []
    }
    
    # First, preserve all valid mappings (where both items exist)
    for mapping in comparison['mapping_both_exist']:
        from_item = mapping['from']
        to_item = mapping['to']
        
        # Check if it was an exact match originally
        if from_item in current_mapping.get('exact_matches', {}):
            new_mapping['exact_matches'][from_item] = to_item
        else:
            new_mapping['manual_mappings'][from_item] = to_item
    
    # Add missing sahasrahbot items that should be mapped
    unmapped_saha = comparison['sahasrahbot_not_in_mapping_from']
    
    # Try to find matches for unmapped sahasrahbot items
    additional_mappings = {
        # From the unmapped sahasrahbot items
        'Bomb': 'Single Bomb',  # Single Bomb exists in Archipelago
        'BottleWithRandom': None,  # No equivalent
        'ProgressiveArmor': 'Progressive Mail',  # Progressive Mail exists
        'RedClock': 'Red Clock',  # Red Clock exists in Archipelago
        'SmallMagic': 'Magic Upgrade (1/4)',  # Quarter magic
        'TriforcePiece': 'Triforce Piece',  # Triforce Piece exists
    }
    
    for from_item, to_item in additional_mappings.items():
        if from_item in sahasrahbot_items:
            if to_item and to_item in archipelago_items:
                new_mapping['manual_mappings'][from_item] = to_item
            else:
                new_mapping['unmapped_sahasrahbot'].append(from_item)
    
    # Fix mappings where FROM doesn't exist but we have them in the mapping
    # These should be removed from the mapping
    items_to_remove = []
    for mapping in comparison['mapping_from_missing_to_exists']:
        from_item = mapping['from']
        items_to_remove.append(from_item)
    
    for mapping in comparison['mapping_neither_exists']:
        from_item = mapping['from']
        items_to_remove.append(from_item)
    
    # Add items that exist in sahasrahbot but currently map to None
    # These are legitimate unmapped items
    for mapping in comparison['mapping_from_exists_to_missing']:
        from_item = mapping['from']
        to_item = mapping['to']
        
        if from_item in sahasrahbot_items and to_item is None:
            # These are items that exist in sahasrahbot but have no Archipelago equivalent
            if from_item not in new_mapping['unmapped_sahasrahbot']:
                new_mapping['unmapped_sahasrahbot'].append(from_item)
    
    # Clean up: Don't include items in mappings that should be in unmapped
    for from_item in list(new_mapping['manual_mappings'].keys()):
        if new_mapping['manual_mappings'][from_item] is None:
            del new_mapping['manual_mappings'][from_item]
            if from_item not in new_mapping['unmapped_sahasrahbot']:
                new_mapping['unmapped_sahasrahbot'].append(from_item)
    
    for from_item in list(new_mapping['exact_matches'].keys()):
        if new_mapping['exact_matches'][from_item] is None:
            del new_mapping['exact_matches'][from_item]
            if from_item not in new_mapping['unmapped_sahasrahbot']:
                new_mapping['unmapped_sahasrahbot'].append(from_item)
    
    # Sort the unmapped list
    new_mapping['unmapped_sahasrahbot'].sort()
    
    # Add some helpful statistics
    new_mapping['_statistics'] = {
        'total_exact_matches': len(new_mapping['exact_matches']),
        'total_manual_mappings': len(new_mapping['manual_mappings']),
        'total_mapped': len(new_mapping['exact_matches']) + len(new_mapping['manual_mappings']),
        'total_unmapped': len(new_mapping['unmapped_sahasrahbot']),
        'sahasrahbot_items_count': len(sahasrahbot_items),
        'archipelago_items_count': len(archipelago_items)
    }
    
    # Save the fixed mapping
    save_json_file('item_name_mapping_fixed.json', new_mapping)
    
    print("Fixed item mapping created: item_name_mapping_fixed.json")
    print(f"Statistics:")
    print(f"  Exact matches: {new_mapping['_statistics']['total_exact_matches']}")
    print(f"  Manual mappings: {new_mapping['_statistics']['total_manual_mappings']}")
    print(f"  Total mapped: {new_mapping['_statistics']['total_mapped']}")
    print(f"  Unmapped items: {new_mapping['_statistics']['total_unmapped']}")
    
    # Show what was fixed
    print(f"\nRemoved {len(items_to_remove)} invalid mappings")
    print(f"Added mappings for {len(additional_mappings)} previously unmapped items")

if __name__ == "__main__":
    main()