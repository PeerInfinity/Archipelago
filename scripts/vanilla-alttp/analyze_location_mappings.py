#!/usr/bin/env python3
"""
Analyze location name mappings between sahasrahbot and Archipelago.
Creates a comprehensive comparison showing mapped and unmapped locations from both sources.
"""

import json
import os

def load_json_file(filename):
    """Load a JSON file and return its contents."""
    with open(filename, 'r') as f:
        return json.load(f)

def extract_mapping_locations(mapping_data):
    """Extract all from->to pairs from the mapping file."""
    from_locations = set()
    to_locations = set()
    mappings = []
    
    # Handle exact_matches section if it exists
    if 'exact_matches' in mapping_data:
        for from_loc, to_loc in mapping_data['exact_matches'].items():
            from_locations.add(from_loc)
            if to_loc:  # Only add if not None
                to_locations.add(to_loc)
            mappings.append((from_loc, to_loc))
    
    # Handle manual_mappings section
    if 'manual_mappings' in mapping_data:
        for from_loc, to_loc in mapping_data['manual_mappings'].items():
            from_locations.add(from_loc)
            if to_loc:  # Only add if not None
                to_locations.add(to_loc)
            mappings.append((from_loc, to_loc))
    
    # Handle unmapped_sahasrahbot section (these have no "to" mapping)
    if 'unmapped_sahasrahbot' in mapping_data:
        for from_loc in mapping_data['unmapped_sahasrahbot']:
            from_locations.add(from_loc)
            mappings.append((from_loc, None))
    
    # Handle unmapped sections that might be lists or dicts
    if 'unmapped' in mapping_data:
        if isinstance(mapping_data['unmapped'], list):
            for from_loc in mapping_data['unmapped']:
                from_locations.add(from_loc)
                mappings.append((from_loc, None))
        elif isinstance(mapping_data['unmapped'], dict):
            for from_loc, to_loc in mapping_data['unmapped'].items():
                from_locations.add(from_loc)
                if to_loc:
                    to_locations.add(to_loc)
                mappings.append((from_loc, to_loc))
    
    return from_locations, to_locations, mappings

def main():
    # Load the data files
    sahasrahbot_locations = load_json_file('sahasrahbot_locations.json')
    archipelago_locations = load_json_file('archipelago_locations.json')
    location_mapping = load_json_file('location_name_mapping.json')
    
    # Convert lists to sets for easier comparison
    saha_set = set(sahasrahbot_locations)
    arch_set = set(archipelago_locations)
    
    # Extract mapping information
    from_locations, to_locations, mappings = extract_mapping_locations(location_mapping)
    
    # Perform the analysis
    comparison = {
        "_description": "Comprehensive comparison of location names between sahasrahbot and Archipelago",
        "_generated_by": "analyze_location_mappings.py",
        
        # Sahasrahbot analysis
        "sahasrahbot_not_in_mapping_from": sorted(list(saha_set - from_locations)),
        "sahasrahbot_in_mapping_from": sorted(list(saha_set & from_locations)),
        
        # Archipelago analysis
        "archipelago_not_in_mapping_to": sorted(list(arch_set - to_locations)),
        "archipelago_in_mapping_to": sorted(list(arch_set & to_locations)),
        
        # Mapping analysis - categorize each mapping
        "mapping_neither_exists": [],
        "mapping_from_missing_to_exists": [],
        "mapping_from_exists_to_missing": [],
        "mapping_both_exist": []
    }
    
    # Analyze each mapping
    for from_loc, to_loc in mappings:
        from_exists = from_loc in saha_set
        to_exists = to_loc in arch_set if to_loc else False
        
        mapping_entry = {
            "from": from_loc,
            "to": to_loc
        }
        
        if not from_exists and not to_exists:
            comparison["mapping_neither_exists"].append(mapping_entry)
        elif not from_exists and to_exists:
            comparison["mapping_from_missing_to_exists"].append(mapping_entry)
        elif from_exists and (to_loc is None or not to_exists):
            comparison["mapping_from_exists_to_missing"].append(mapping_entry)
        elif from_exists and to_exists:
            comparison["mapping_both_exist"].append(mapping_entry)
    
    # Add summary statistics
    comparison["_statistics"] = {
        "total_sahasrahbot_locations": len(sahasrahbot_locations),
        "total_archipelago_locations": len(archipelago_locations),
        "total_mappings": len(mappings),
        "sahasrahbot_mapped": len(saha_set & from_locations),
        "sahasrahbot_unmapped": len(saha_set - from_locations),
        "archipelago_mapped": len(arch_set & to_locations),
        "archipelago_unmapped": len(arch_set - to_locations),
        "mappings_both_valid": len(comparison["mapping_both_exist"]),
        "mappings_from_invalid": len(comparison["mapping_from_missing_to_exists"]),
        "mappings_to_invalid": len(comparison["mapping_from_exists_to_missing"]),
        "mappings_both_invalid": len(comparison["mapping_neither_exists"])
    }
    
    # Save the comparison
    output_file = 'location_name_comparison.json'
    with open(output_file, 'w') as f:
        json.dump(comparison, f, indent=2)
    
    # Print summary
    print(f"Location Name Comparison Analysis Complete")
    print(f"==========================================")
    print(f"Total sahasrahbot locations: {len(sahasrahbot_locations)}")
    print(f"  - Mapped: {len(saha_set & from_locations)}")
    print(f"  - Unmapped: {len(saha_set - from_locations)}")
    print(f"\nTotal Archipelago locations: {len(archipelago_locations)}")
    print(f"  - Mapped: {len(arch_set & to_locations)}")
    print(f"  - Unmapped: {len(arch_set - to_locations)}")
    print(f"\nTotal mappings: {len(mappings)}")
    print(f"  - Both locations exist: {len(comparison['mapping_both_exist'])}")
    print(f"  - Only 'from' exists: {len(comparison['mapping_from_exists_to_missing'])}")
    print(f"  - Only 'to' exists: {len(comparison['mapping_from_missing_to_exists'])}")
    print(f"  - Neither exists: {len(comparison['mapping_neither_exists'])}")
    print(f"\nResults saved to: {output_file}")

if __name__ == "__main__":
    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    # Check that required files exist
    required_files = ['sahasrahbot_locations.json', 'archipelago_locations.json', 'location_name_mapping.json']
    missing_files = [f for f in required_files if not os.path.exists(f)]
    
    if missing_files:
        print(f"Error: Missing required files: {', '.join(missing_files)}")
        print("Please ensure all required JSON files are in the same directory as this script.")
        exit(1)
    
    main()