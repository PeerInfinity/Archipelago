#!/usr/bin/env python3
"""
Sort item_name_mapping.json and location_name_mapping.json alphabetically by "from" entry.
Each section (exact_matches, manual_mappings, unmapped lists) will be sorted independently.
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

def sort_mapping_file(filename):
    """Sort a mapping file's sections alphabetically."""
    print(f"\nProcessing {filename}...")
    
    try:
        data = load_json_file(filename)
    except FileNotFoundError:
        print(f"  File not found: {filename}")
        return False
    
    # Create a new ordered dictionary to maintain section order
    sorted_data = OrderedDict()
    
    # Process each section in a specific order
    sections_order = [
        '_comment', '_note', 
        'exact_matches', 'manual_mappings', 'unmapped_sahasrahbot',
        'unmapped_archipelago', '_statistics'
    ]
    
    for section in sections_order:
        if section in data:
            if section in ['exact_matches', 'manual_mappings']:
                # Sort dictionary sections by key (the "from" entry)
                if isinstance(data[section], dict):
                    sorted_data[section] = OrderedDict(sorted(data[section].items()))
                    print(f"  Sorted {section}: {len(sorted_data[section])} entries")
                else:
                    sorted_data[section] = data[section]
            elif section in ['unmapped_sahasrahbot', 'unmapped_archipelago']:
                # Sort list sections alphabetically
                if isinstance(data[section], list):
                    sorted_data[section] = sorted(data[section])
                    print(f"  Sorted {section}: {len(sorted_data[section])} entries")
                else:
                    sorted_data[section] = data[section]
            else:
                # Keep other sections as-is (comments, notes, statistics)
                sorted_data[section] = data[section]
    
    # Add any sections that weren't in our predefined order
    for section in data:
        if section not in sorted_data:
            if isinstance(data[section], dict) and not section.startswith('_'):
                sorted_data[section] = OrderedDict(sorted(data[section].items()))
                print(f"  Sorted {section}: {len(sorted_data[section])} entries")
            elif isinstance(data[section], list):
                sorted_data[section] = sorted(data[section])
                print(f"  Sorted {section}: {len(sorted_data[section])} entries")
            else:
                sorted_data[section] = data[section]
    
    # Save the sorted data back to the file
    save_json_file(filename, sorted_data)
    print(f"  Saved sorted data back to {filename}")
    return True

def main():
    """Main function to sort both mapping files."""
    print("Sorting mapping files alphabetically by 'from' entry...")
    
    # List of files to sort
    files_to_sort = [
        'item_name_mapping.json',
        'location_name_mapping.json',
        'item_name_mapping_fixed.json',
        'location_name_mapping_fixed.json'
    ]
    
    sorted_count = 0
    for filename in files_to_sort:
        if sort_mapping_file(filename):
            sorted_count += 1
    
    print(f"\n✓ Successfully sorted {sorted_count} files")
    
    # Verify sorting by checking a sample
    print("\nVerification - First 5 entries from each sorted section:")
    for filename in ['item_name_mapping.json', 'location_name_mapping.json']:
        try:
            data = load_json_file(filename)
            print(f"\n{filename}:")
            
            if 'exact_matches' in data and isinstance(data['exact_matches'], dict):
                keys = list(data['exact_matches'].keys())[:5]
                print(f"  exact_matches: {keys}")
            
            if 'manual_mappings' in data and isinstance(data['manual_mappings'], dict):
                keys = list(data['manual_mappings'].keys())[:5]
                print(f"  manual_mappings: {keys}")
            
            if 'unmapped_sahasrahbot' in data and isinstance(data['unmapped_sahasrahbot'], list):
                items = data['unmapped_sahasrahbot'][:5]
                print(f"  unmapped_sahasrahbot: {items}")
        except FileNotFoundError:
            continue

if __name__ == "__main__":
    main()