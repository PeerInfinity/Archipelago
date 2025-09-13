#!/usr/bin/env python3
"""
Analyze item name mappings between sahasrahbot and Archipelago.
Creates a comprehensive comparison showing mapped and unmapped items from both sources.
"""

import json
import os

def load_json_file(filename):
    """Load a JSON file and return its contents."""
    with open(filename, 'r') as f:
        return json.load(f)

def extract_mapping_items(mapping_data):
    """Extract all from->to pairs from the mapping file."""
    from_items = set()
    to_items = set()
    mappings = []
    
    # Handle exact_matches section
    if 'exact_matches' in mapping_data:
        for from_item, to_item in mapping_data['exact_matches'].items():
            from_items.add(from_item)
            if to_item:  # Only add if not None
                to_items.add(to_item)
            mappings.append((from_item, to_item))
    
    # Handle manual_mappings section
    if 'manual_mappings' in mapping_data:
        for from_item, to_item in mapping_data['manual_mappings'].items():
            from_items.add(from_item)
            if to_item:  # Only add if not None
                to_items.add(to_item)
            mappings.append((from_item, to_item))
    
    # Handle unmapped_sahasrahbot section (these have no "to" mapping)
    if 'unmapped_sahasrahbot' in mapping_data:
        for from_item in mapping_data['unmapped_sahasrahbot']:
            from_items.add(from_item)
            mappings.append((from_item, None))
    
    return from_items, to_items, mappings

def main():
    # Load the data files
    sahasrahbot_items = load_json_file('sahasrahbot_items.json')
    archipelago_items = load_json_file('archipelago_items.json')
    item_mapping = load_json_file('item_name_mapping.json')
    
    # Convert lists to sets for easier comparison
    saha_set = set(sahasrahbot_items)
    arch_set = set(archipelago_items)
    
    # Extract mapping information
    from_items, to_items, mappings = extract_mapping_items(item_mapping)
    
    # Perform the analysis
    comparison = {
        "_description": "Comprehensive comparison of item names between sahasrahbot and Archipelago",
        "_generated_by": "analyze_item_mappings.py",
        
        # Sahasrahbot analysis
        "sahasrahbot_not_in_mapping_from": sorted(list(saha_set - from_items)),
        "sahasrahbot_in_mapping_from": sorted(list(saha_set & from_items)),
        
        # Archipelago analysis
        "archipelago_not_in_mapping_to": sorted(list(arch_set - to_items)),
        "archipelago_in_mapping_to": sorted(list(arch_set & to_items)),
        
        # Mapping analysis - categorize each mapping
        "mapping_neither_exists": [],
        "mapping_from_missing_to_exists": [],
        "mapping_from_exists_to_missing": [],
        "mapping_both_exist": []
    }
    
    # Analyze each mapping
    for from_item, to_item in mappings:
        from_exists = from_item in saha_set
        to_exists = to_item in arch_set if to_item else False
        
        mapping_entry = {
            "from": from_item,
            "to": to_item
        }
        
        if not from_exists and not to_exists:
            comparison["mapping_neither_exists"].append(mapping_entry)
        elif not from_exists and to_exists:
            comparison["mapping_from_missing_to_exists"].append(mapping_entry)
        elif from_exists and (to_item is None or not to_exists):
            comparison["mapping_from_exists_to_missing"].append(mapping_entry)
        elif from_exists and to_exists:
            comparison["mapping_both_exist"].append(mapping_entry)
    
    # Add summary statistics
    comparison["_statistics"] = {
        "total_sahasrahbot_items": len(sahasrahbot_items),
        "total_archipelago_items": len(archipelago_items),
        "total_mappings": len(mappings),
        "sahasrahbot_mapped": len(saha_set & from_items),
        "sahasrahbot_unmapped": len(saha_set - from_items),
        "archipelago_mapped": len(arch_set & to_items),
        "archipelago_unmapped": len(arch_set - to_items),
        "mappings_both_valid": len(comparison["mapping_both_exist"]),
        "mappings_from_invalid": len(comparison["mapping_from_missing_to_exists"]),
        "mappings_to_invalid": len(comparison["mapping_from_exists_to_missing"]),
        "mappings_both_invalid": len(comparison["mapping_neither_exists"])
    }
    
    # Save the comparison
    output_file = 'item_name_comparison.json'
    with open(output_file, 'w') as f:
        json.dump(comparison, f, indent=2)
    
    # Print summary
    print(f"Item Name Comparison Analysis Complete")
    print(f"=====================================")
    print(f"Total sahasrahbot items: {len(sahasrahbot_items)}")
    print(f"  - Mapped: {len(saha_set & from_items)}")
    print(f"  - Unmapped: {len(saha_set - from_items)}")
    print(f"\nTotal Archipelago items: {len(archipelago_items)}")
    print(f"  - Mapped: {len(arch_set & to_items)}")
    print(f"  - Unmapped: {len(arch_set - to_items)}")
    print(f"\nTotal mappings: {len(mappings)}")
    print(f"  - Both items exist: {len(comparison['mapping_both_exist'])}")
    print(f"  - Only 'from' exists: {len(comparison['mapping_from_exists_to_missing'])}")
    print(f"  - Only 'to' exists: {len(comparison['mapping_from_missing_to_exists'])}")
    print(f"  - Neither exists: {len(comparison['mapping_neither_exists'])}")
    print(f"\nResults saved to: {output_file}")

if __name__ == "__main__":
    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Check that required files exist
    required_files = ['sahasrahbot_items.json', 'archipelago_items.json', 'item_name_mapping.json']
    missing_files = [f for f in required_files if not os.path.exists(f)]
    
    if missing_files:
        print(f"Error: Missing required files: {', '.join(missing_files)}")
        print("Please ensure all required JSON files are in the same directory as this script.")
        exit(1)
    
    main()