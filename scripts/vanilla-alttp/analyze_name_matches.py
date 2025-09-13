#!/usr/bin/env python3
"""
Analyze name matches between sahasrahbot and Archipelago data.
"""

import json

def load_json(filename):
    with open(filename, 'r') as f:
        return json.load(f)

def analyze_matches():
    # Load all the data
    saha_items = set(load_json('sahasrahbot_items.json'))
    saha_locations = set(load_json('sahasrahbot_locations.json'))
    arch_items = set(load_json('archipelago_items.json'))
    arch_locations = set(load_json('archipelago_locations.json'))
    
    # Find exact matches
    item_exact_matches = saha_items & arch_items
    location_exact_matches = saha_locations & arch_locations
    
    # Find items/locations only in each source
    saha_only_items = saha_items - arch_items
    arch_only_items = arch_items - saha_items
    saha_only_locations = saha_locations - arch_locations
    arch_only_locations = arch_locations - saha_locations
    
    print("=" * 60)
    print("ITEM NAME ANALYSIS")
    print("=" * 60)
    print(f"Total sahasrahbot items: {len(saha_items)}")
    print(f"Total Archipelago items: {len(arch_items)}")
    print(f"Exact matches: {len(item_exact_matches)}")
    print(f"Sahasrahbot only: {len(saha_only_items)}")
    print(f"Archipelago only: {len(arch_only_items)}")
    
    print("\nExact item matches:")
    for item in sorted(item_exact_matches)[:20]:
        print(f"  {item}")
    if len(item_exact_matches) > 20:
        print(f"  ... and {len(item_exact_matches) - 20} more")
    
    print("\n" + "=" * 60)
    print("LOCATION NAME ANALYSIS")
    print("=" * 60)
    print(f"Total sahasrahbot locations: {len(saha_locations)}")
    print(f"Total Archipelago locations: {len(arch_locations)}")
    print(f"Exact matches: {len(location_exact_matches)}")
    print(f"Sahasrahbot only: {len(saha_only_locations)}")
    print(f"Archipelago only: {len(arch_only_locations)}")
    
    print("\nExact location matches:")
    for loc in sorted(location_exact_matches)[:20]:
        print(f"  {loc}")
    if len(location_exact_matches) > 20:
        print(f"  ... and {len(location_exact_matches) - 20} more")
    
    # Look for potential matches with different formatting
    print("\n" + "=" * 60)
    print("POTENTIAL ITEM MATCHES (similar names)")
    print("=" * 60)
    
    # Convert to lowercase for comparison
    saha_items_lower = {item.lower(): item for item in saha_only_items}
    arch_items_lower = {item.lower(): item for item in arch_only_items}
    
    potential_item_matches = []
    for saha_lower, saha_orig in saha_items_lower.items():
        for arch_lower, arch_orig in arch_items_lower.items():
            # Check if one contains the other
            if saha_lower in arch_lower or arch_lower in saha_lower:
                potential_item_matches.append((saha_orig, arch_orig))
            # Check for common patterns
            elif saha_lower.replace(' ', '') == arch_lower.replace(' ', ''):
                potential_item_matches.append((saha_orig, arch_orig))
            elif saha_lower.replace('_', '') == arch_lower.replace(' ', ''):
                potential_item_matches.append((saha_orig, arch_orig))
    
    for saha, arch in potential_item_matches[:10]:
        print(f"  {saha} <-> {arch}")
    
    print("\n" + "=" * 60)
    print("SAMPLE UNMATCHED ITEMS")
    print("=" * 60)
    
    print("\nSahasrahbot only (first 10):")
    for item in sorted(saha_only_items)[:10]:
        print(f"  {item}")
    
    print("\nArchipelago only (first 10):")
    for item in sorted(arch_only_items)[:10]:
        print(f"  {item}")
    
    print("\n" + "=" * 60)
    print("SAMPLE UNMATCHED LOCATIONS")
    print("=" * 60)
    
    print("\nSahasrahbot only (first 10):")
    for loc in sorted(saha_only_locations)[:10]:
        print(f"  {loc}")
    
    print("\nArchipelago only (first 10):")
    for loc in sorted(arch_only_locations)[:10]:
        print(f"  {loc}")
    
    return {
        'item_exact_matches': sorted(item_exact_matches),
        'location_exact_matches': sorted(location_exact_matches),
        'saha_only_items': sorted(saha_only_items),
        'arch_only_items': sorted(arch_only_items),
        'saha_only_locations': sorted(saha_only_locations),
        'arch_only_locations': sorted(arch_only_locations)
    }

if __name__ == "__main__":
    results = analyze_matches()