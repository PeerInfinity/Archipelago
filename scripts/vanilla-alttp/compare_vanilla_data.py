#!/usr/bin/env python3
"""
Compare items and locations between sahasrahbot and alttp_vanilla_items.json
to identify what's present in each dataset.
"""

import json

def load_json_file(filename):
    """Load a JSON file and return its contents."""
    with open(filename, 'r') as f:
        return json.load(f)

def save_json_file(filename, data):
    """Save data to a JSON file with proper formatting."""
    with open(filename, 'w') as f:
        json.dump(data, f, indent=2)

def main():
    print("Comparing vanilla data between sahasrahbot and alttp_vanilla_items.json...")
    
    # Load all data files
    sahasrahbot_items = set(load_json_file('sahasrahbot_items.json'))
    sahasrahbot_locations = set(load_json_file('sahasrahbot_locations.json'))
    vanilla_data = load_json_file('alttp_vanilla_items.json')
    
    # Extract items and locations from vanilla data
    vanilla_items = set()
    vanilla_locations = set(vanilla_data.keys())
    
    for location, data in vanilla_data.items():
        if 'item' in data:
            vanilla_items.add(data['item'])
    
    # Compare items
    items_only_sahasrahbot = sorted(list(sahasrahbot_items - vanilla_items))
    items_only_vanilla = sorted(list(vanilla_items - sahasrahbot_items))
    items_in_both = sorted(list(sahasrahbot_items & vanilla_items))
    
    # Compare locations
    locations_only_sahasrahbot = sorted(list(sahasrahbot_locations - vanilla_locations))
    locations_only_vanilla = sorted(list(vanilla_locations - sahasrahbot_locations))
    locations_in_both = sorted(list(sahasrahbot_locations & vanilla_locations))
    
    # Create comparison result
    comparison = {
        "_description": "Comparison between sahasrahbot data and alttp_vanilla_items.json",
        
        "items": {
            "only_in_sahasrahbot": items_only_sahasrahbot,
            "only_in_vanilla": items_only_vanilla,
            "in_both": items_in_both,
            "_statistics": {
                "sahasrahbot_total": len(sahasrahbot_items),
                "vanilla_total": len(vanilla_items),
                "only_sahasrahbot": len(items_only_sahasrahbot),
                "only_vanilla": len(items_only_vanilla),
                "in_both": len(items_in_both)
            }
        },
        
        "locations": {
            "only_in_sahasrahbot": locations_only_sahasrahbot,
            "only_in_vanilla": locations_only_vanilla,
            "in_both": locations_in_both,
            "_statistics": {
                "sahasrahbot_total": len(sahasrahbot_locations),
                "vanilla_total": len(vanilla_locations),
                "only_sahasrahbot": len(locations_only_sahasrahbot),
                "only_vanilla": len(locations_only_vanilla),
                "in_both": len(locations_in_both)
            }
        },
        
        "_summary": {
            "items_coverage": f"{len(items_in_both)}/{len(sahasrahbot_items)} sahasrahbot items found in vanilla",
            "locations_coverage": f"{len(locations_in_both)}/{len(sahasrahbot_locations)} sahasrahbot locations found in vanilla",
            "vanilla_items_matched": f"{len(items_in_both)}/{len(vanilla_items)} vanilla items matched",
            "vanilla_locations_matched": f"{len(locations_in_both)}/{len(vanilla_locations)} vanilla locations matched"
        }
    }
    
    # Save comparison to file
    output_file = 'vanilla_data_comparison.json'
    save_json_file(output_file, comparison)
    
    # Print summary
    print(f"\n✓ Comparison saved to {output_file}")
    print("\n=== ITEMS ===")
    print(f"  Total in sahasrahbot_items.json: {len(sahasrahbot_items)}")
    print(f"  Total in alttp_vanilla_items.json: {len(vanilla_items)}")
    print(f"  Only in sahasrahbot: {len(items_only_sahasrahbot)}")
    print(f"  Only in vanilla: {len(items_only_vanilla)}")
    print(f"  In both: {len(items_in_both)}")
    
    print("\n=== LOCATIONS ===")
    print(f"  Total in sahasrahbot_locations.json: {len(sahasrahbot_locations)}")
    print(f"  Total in alttp_vanilla_items.json: {len(vanilla_locations)}")
    print(f"  Only in sahasrahbot: {len(locations_only_sahasrahbot)}")
    print(f"  Only in vanilla: {len(locations_only_vanilla)}")
    print(f"  In both: {len(locations_in_both)}")
    
    # Show some examples if there are differences
    if items_only_sahasrahbot:
        print(f"\nExample items only in sahasrahbot: {items_only_sahasrahbot[:5]}")
    if items_only_vanilla:
        print(f"Example items only in vanilla: {items_only_vanilla[:5]}")
    
    if locations_only_sahasrahbot:
        print(f"\nExample locations only in sahasrahbot: {locations_only_sahasrahbot[:5]}")
    if locations_only_vanilla:
        print(f"Example locations only in vanilla: {locations_only_vanilla[:5]}")

if __name__ == "__main__":
    main()