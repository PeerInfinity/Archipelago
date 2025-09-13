#!/usr/bin/env python3
"""
Fix location_name_mapping.json based on analysis of location_name_comparison.json
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
    sahasrahbot_locations = set(load_json_file('sahasrahbot_locations.json'))
    archipelago_locations = set(load_json_file('archipelago_locations.json'))
    current_mapping = load_json_file('location_name_mapping.json')
    
    # Create a new mapping structure
    new_mapping = {
        "_comment": "Mapping from sahasrahbot location names to Archipelago location names",
        "_note": "null values indicate no equivalent exists in Archipelago",
        "exact_matches": {},
        "manual_mappings": {},
        "unmapped_sahasrahbot": []
    }
    
    # First, find all exact matches
    for saha_loc in sahasrahbot_locations:
        if saha_loc in archipelago_locations:
            new_mapping['exact_matches'][saha_loc] = saha_loc
    
    # Add manual mappings from the current file
    if 'manual_mappings' in current_mapping:
        for from_loc, to_loc in current_mapping['manual_mappings'].items():
            if from_loc in sahasrahbot_locations:
                if to_loc and to_loc in archipelago_locations:
                    # Only override exact match if it's different
                    if from_loc not in new_mapping['exact_matches'] or new_mapping['exact_matches'][from_loc] != to_loc:
                        # Move from exact to manual if needed
                        if from_loc in new_mapping['exact_matches']:
                            del new_mapping['exact_matches'][from_loc]
                        new_mapping['manual_mappings'][from_loc] = to_loc
                elif to_loc is None:
                    # Remove from exact matches if exists
                    if from_loc in new_mapping['exact_matches']:
                        del new_mapping['exact_matches'][from_loc]
                    if from_loc not in new_mapping['unmapped_sahasrahbot']:
                        new_mapping['unmapped_sahasrahbot'].append(from_loc)
    
    # Check for locations that need special handling based on known patterns
    special_mappings = {
        # Ganon's Tower apostrophe differences
        "Ganon's Tower - Big Chest": "Ganons Tower - Big Chest",
        "Ganon's Tower - Big Key Chest": "Ganons Tower - Big Key Chest",
        "Ganon's Tower - Big Key Room - Left": "Ganons Tower - Big Key Room - Left",
        "Ganon's Tower - Big Key Room - Right": "Ganons Tower - Big Key Room - Right",
        "Ganon's Tower - Bob's Chest": "Ganons Tower - Bob's Chest",
        "Ganon's Tower - Bob's Torch": "Ganons Tower - Bob's Torch",
        "Ganon's Tower - Compass Room - Bottom Left": "Ganons Tower - Compass Room - Bottom Left",
        "Ganon's Tower - Compass Room - Bottom Right": "Ganons Tower - Compass Room - Bottom Right",
        "Ganon's Tower - Compass Room - Top Left": "Ganons Tower - Compass Room - Top Left",
        "Ganon's Tower - Compass Room - Top Right": "Ganons Tower - Compass Room - Top Right",
        "Ganon's Tower - Conveyor Cross Pot Key": "Ganons Tower - Conveyor Cross Pot Key",
        "Ganon's Tower - Conveyor Star Pits Pot Key": "Ganons Tower - Conveyor Star Pits Pot Key",
        "Ganon's Tower - DMs Room - Bottom Left": "Ganons Tower - DMs Room - Bottom Left",
        "Ganon's Tower - DMs Room - Bottom Right": "Ganons Tower - DMs Room - Bottom Right",
        "Ganon's Tower - DMs Room - Top Left": "Ganons Tower - DMs Room - Top Left",
        "Ganon's Tower - DMs Room - Top Right": "Ganons Tower - DMs Room - Top Right",
        "Ganon's Tower - Double Switch Pot Key": "Ganons Tower - Double Switch Pot Key",
        "Ganon's Tower - Firesnake Room": "Ganons Tower - Firesnake Room",
        "Ganon's Tower - Hope Room - Left": "Ganons Tower - Hope Room - Left",
        "Ganon's Tower - Hope Room - Right": "Ganons Tower - Hope Room - Right",
        "Ganon's Tower - Map Chest": "Ganons Tower - Map Chest",
        "Ganon's Tower - Mini Helmasaur Key Drop": "Ganons Tower - Mini Helmasaur Key Drop",
        "Ganon's Tower - Mini Helmasaur Room - Left": "Ganons Tower - Mini Helmasaur Room - Left",
        "Ganon's Tower - Mini Helmasaur Room - Right": "Ganons Tower - Mini Helmasaur Room - Right",
        "Ganon's Tower - Moldorm Chest": "Ganons Tower - Moldorm Chest",
        "Ganon's Tower - Pre-Moldorm Chest": "Ganons Tower - Pre-Moldorm Chest",
        "Ganon's Tower - Randomizer Room - Bottom Left": "Ganons Tower - Randomizer Room - Bottom Left",
        "Ganon's Tower - Randomizer Room - Bottom Right": "Ganons Tower - Randomizer Room - Bottom Right",
        "Ganon's Tower - Randomizer Room - Top Left": "Ganons Tower - Randomizer Room - Top Left",
        "Ganon's Tower - Randomizer Room - Top Right": "Ganons Tower - Randomizer Room - Top Right",
        "Ganon's Tower - Tile Room": "Ganons Tower - Tile Room",
        "Ganon's Tower - Validation Chest": "Ganons Tower - Validation Chest",
        
        # Other known mappings
        "Bumper Cave": "Bumper Cave Ledge",
        "Hammer Pegs": "Hammer Peg Cave",
        "Hype Cave - NPC": "Hype Cave - Generous Guy",
        "Hyrule Castle - Zelda's Cell": "Hyrule Castle - Zelda's Chest",
        "Mini Moldorm Cave - NPC": "Mini Moldorm Cave - Generous Guy",
        "Spectacle Rock Item": "Spectacle Rock",
        "Graveyard Ledge": "Graveyard Ledge",
        "Pegasus Rocks": "Pegasus Rocks",
        
        # Locations that don't exist in Archipelago
        "Misery Mire Medallion": None,
        "Turtle Rock Medallion": None,
        "Pyramid Bottle": None,
        "Waterfall Bottle": None,
        "Peg Cave": None,  # This might be Hammer Peg Cave
        "Paradox Lower": None,
        "Paradox Upper": None,
    }
    
    # Apply special mappings
    for from_loc, to_loc in special_mappings.items():
        if from_loc in sahasrahbot_locations:
            # Remove from exact matches if present
            if from_loc in new_mapping['exact_matches']:
                del new_mapping['exact_matches'][from_loc]
            
            if to_loc and to_loc in archipelago_locations:
                new_mapping['manual_mappings'][from_loc] = to_loc
            elif to_loc is None:
                if from_loc not in new_mapping['unmapped_sahasrahbot']:
                    new_mapping['unmapped_sahasrahbot'].append(from_loc)
    
    # Find any remaining unmapped locations
    all_mapped = set(new_mapping['exact_matches'].keys()) | set(new_mapping['manual_mappings'].keys()) | set(new_mapping['unmapped_sahasrahbot'])
    for saha_loc in sahasrahbot_locations:
        if saha_loc not in all_mapped:
            # Try to guess if it might have a match
            # For now, add to unmapped
            print(f"Warning: Unmapped location: {saha_loc}")
            new_mapping['unmapped_sahasrahbot'].append(saha_loc)
    
    # Sort the unmapped list
    new_mapping['unmapped_sahasrahbot'].sort()
    
    # Add statistics
    new_mapping['_statistics'] = {
        'total_exact_matches': len(new_mapping['exact_matches']),
        'total_manual_mappings': len(new_mapping['manual_mappings']),
        'total_mapped': len(new_mapping['exact_matches']) + len(new_mapping['manual_mappings']),
        'total_unmapped': len(new_mapping['unmapped_sahasrahbot']),
        'sahasrahbot_locations_count': len(sahasrahbot_locations),
        'archipelago_locations_count': len(archipelago_locations)
    }
    
    # Save the fixed mapping
    save_json_file('location_name_mapping_fixed.json', new_mapping)
    
    print(f"\nFixed location mapping created: location_name_mapping_fixed.json")
    print(f"Statistics:")
    print(f"  Exact matches: {new_mapping['_statistics']['total_exact_matches']}")
    print(f"  Manual mappings: {new_mapping['_statistics']['total_manual_mappings']}")
    print(f"  Total mapped: {new_mapping['_statistics']['total_mapped']}")
    print(f"  Unmapped locations: {new_mapping['_statistics']['total_unmapped']}")

if __name__ == "__main__":
    main()