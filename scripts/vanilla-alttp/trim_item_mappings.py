#!/usr/bin/env python3
"""
Trim item_name_mapping.json to only include items that appear in alttp_vanilla_items.json
This removes mappings for items that aren't actually used in vanilla gameplay.
"""

import json
from collections import OrderedDict

def load_json_file(filename):
    """Load a JSON file and return its contents."""
    with open(filename, 'r') as f:
        return json.load(f)

def save_json_file(filename, data):
    """Save data to a JSON file with proper formatting."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

def main():
    print("Trimming item_name_mapping.json to only include items used in vanilla...")
    
    # Load the vanilla items to get the list of actually used items
    vanilla_data = load_json_file('alttp_vanilla_items.json')
    vanilla_items = set()
    for location, data in vanilla_data.items():
        if 'item' in data:
            vanilla_items.add(data['item'])
    
    print(f"Found {len(vanilla_items)} unique items in vanilla data")
    
    # Load the current item mapping
    mapping = load_json_file('item_name_mapping.json')
    
    # Create new trimmed mapping
    trimmed_mapping = OrderedDict()
    
    # Preserve metadata fields
    for key in ['_comment', '_note']:
        if key in mapping:
            trimmed_mapping[key] = mapping[key]
    
    # Trim exact_matches
    trimmed_exact = OrderedDict()
    removed_exact = []
    if 'exact_matches' in mapping:
        for from_item, to_item in mapping['exact_matches'].items():
            if from_item in vanilla_items:
                trimmed_exact[from_item] = to_item
            else:
                removed_exact.append(from_item)
    trimmed_mapping['exact_matches'] = trimmed_exact
    
    # Trim manual_mappings
    trimmed_manual = OrderedDict()
    removed_manual = []
    if 'manual_mappings' in mapping:
        for from_item, to_item in mapping['manual_mappings'].items():
            if from_item in vanilla_items:
                trimmed_manual[from_item] = to_item
            else:
                removed_manual.append(from_item)
    trimmed_mapping['manual_mappings'] = trimmed_manual
    
    # Trim unmapped_sahasrahbot
    trimmed_unmapped = []
    removed_unmapped = []
    if 'unmapped_sahasrahbot' in mapping:
        for item in mapping['unmapped_sahasrahbot']:
            if item in vanilla_items:
                trimmed_unmapped.append(item)
            else:
                removed_unmapped.append(item)
    trimmed_mapping['unmapped_sahasrahbot'] = sorted(trimmed_unmapped)
    
    # Add statistics
    trimmed_mapping['_statistics'] = {
        'total_exact_matches': len(trimmed_exact),
        'total_manual_mappings': len(trimmed_manual),
        'total_mapped': len(trimmed_exact) + len(trimmed_manual),
        'total_unmapped': len(trimmed_unmapped),
        'vanilla_items_count': len(vanilla_items),
        'items_removed': len(removed_exact) + len(removed_manual) + len(removed_unmapped)
    }
    
    # Save the trimmed mapping
    output_file = 'item_name_mapping_trimmed.json'
    save_json_file(output_file, trimmed_mapping)
    
    # Also create a report of what was removed
    removal_report = {
        '_description': 'Items removed from mapping because they do not appear in vanilla gameplay',
        'removed_from_exact_matches': sorted(removed_exact),
        'removed_from_manual_mappings': sorted(removed_manual),
        'removed_from_unmapped': sorted(removed_unmapped),
        '_statistics': {
            'total_removed': len(removed_exact) + len(removed_manual) + len(removed_unmapped),
            'removed_exact': len(removed_exact),
            'removed_manual': len(removed_manual),
            'removed_unmapped': len(removed_unmapped)
        }
    }
    
    report_file = 'item_mapping_removal_report.json'
    save_json_file(report_file, removal_report)
    
    # Print summary
    print(f"\n✓ Trimmed mapping saved to {output_file}")
    print(f"✓ Removal report saved to {report_file}")
    
    print("\n=== TRIMMING SUMMARY ===")
    print(f"Original mapping:")
    print(f"  Exact matches: {len(mapping.get('exact_matches', {}))}")
    print(f"  Manual mappings: {len(mapping.get('manual_mappings', {}))}")
    print(f"  Unmapped: {len(mapping.get('unmapped_sahasrahbot', []))}")
    
    print(f"\nTrimmed mapping:")
    print(f"  Exact matches: {len(trimmed_exact)} (removed {len(removed_exact)})")
    print(f"  Manual mappings: {len(trimmed_manual)} (removed {len(removed_manual)})")
    print(f"  Unmapped: {len(trimmed_unmapped)} (removed {len(removed_unmapped)})")
    
    print(f"\nTotal items removed: {len(removed_exact) + len(removed_manual) + len(removed_unmapped)}")
    
    if removed_exact:
        print(f"\nExample removed exact matches: {removed_exact[:5]}")
    if removed_manual:
        print(f"Example removed manual mappings: {removed_manual[:5]}")
    if removed_unmapped:
        print(f"Example removed unmapped: {removed_unmapped[:5]}")
    
    # Check coverage
    mapped_items = set(trimmed_exact.keys()) | set(trimmed_manual.keys())
    coverage = len(mapped_items) / len(vanilla_items) * 100
    print(f"\nCoverage: {len(mapped_items)}/{len(vanilla_items)} vanilla items have mappings ({coverage:.1f}%)")

if __name__ == "__main__":
    main()