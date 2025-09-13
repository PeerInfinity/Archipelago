#!/usr/bin/env python3
"""
Script to consolidate vanilla ALTTP data into a single JSON file with Archipelago names.

This reads three JSON files:
- alttp_vanilla_items.json: Vanilla item placement data
- item_name_mapping.json: Maps sahasrahbot item names to Archipelago names
- location_name_mapping.json: Maps sahasrahbot location names to Archipelago names

And outputs a single consolidated JSON file with all names already mapped to Archipelago format.
"""

import json
import os
from pathlib import Path


def load_json(filename):
    """Load a JSON file from the current directory."""
    with open(filename, 'r') as f:
        return json.load(f)


def map_item_name(saha_item, item_mapping):
    """Map a sahasrahbot item name to Archipelago name."""
    # Check for exact match first
    if saha_item in item_mapping.get("exact_matches", {}):
        return item_mapping["exact_matches"][saha_item]

    # Check manual mappings
    if saha_item in item_mapping.get("manual_mappings", {}):
        return item_mapping["manual_mappings"][saha_item]

    # If no mapping found, return original (shouldn't happen with complete mappings)
    print(f"Warning: No mapping found for item '{saha_item}'")
    return saha_item


def map_location_name(saha_location, location_mapping):
    """Map a sahasrahbot location name to Archipelago name."""
    # Check for exact match first
    if saha_location in location_mapping.get("exact_matches", {}):
        return location_mapping["exact_matches"][saha_location]

    # Check manual mappings
    if saha_location in location_mapping.get("manual_mappings", {}):
        return location_mapping["manual_mappings"][saha_location]

    # If no mapping found, return original (some locations may not need mapping)
    print(f"Warning: No mapping found for location '{saha_location}'")
    return saha_location


def main():
    """Generate consolidated vanilla data JSON with Archipelago names."""

    # Load all the data files
    print("Loading vanilla item data...")
    vanilla_items = load_json("alttp_vanilla_items.json")

    print("Loading item name mappings...")
    item_mapping = load_json("item_name_mapping.json")

    print("Loading location name mappings...")
    location_mapping = load_json("location_name_mapping.json")

    # Process and consolidate the data
    print("\nProcessing data...")
    consolidated_data = {}
    skipped_medallions = []

    for saha_location, item_data in vanilla_items.items():
        # Skip medallion requirement entries - these aren't actual item locations
        if saha_location in ["Misery Mire Medallion", "Turtle Rock Medallion"]:
            skipped_medallions.append(saha_location)
            continue

        # Map the location name
        arch_location = map_location_name(saha_location, location_mapping)

        # Map the item name
        saha_item = item_data["item"]
        arch_item = map_item_name(saha_item, item_mapping)

        # Store in consolidated format
        consolidated_data[arch_location] = {
            "item": arch_item,
            "count": item_data["count"]
        }

    # Sort the data for consistent output
    sorted_data = dict(sorted(consolidated_data.items()))

    # Write the consolidated data
    output_file = "alttp_vanilla_consolidated.json"
    print(f"\nWriting consolidated data to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(sorted_data, f, indent=2)

    # Print statistics
    print(f"\nConsolidation complete!")
    print(f"Total locations processed: {len(vanilla_items)}")
    print(f"Total locations in output: {len(consolidated_data)}")
    if skipped_medallions:
        print(f"Skipped medallion requirements: {', '.join(skipped_medallions)}")
    print(f"Output file: {output_file}")


if __name__ == "__main__":
    main()