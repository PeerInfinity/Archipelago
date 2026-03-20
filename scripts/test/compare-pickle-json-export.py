#!/usr/bin/env python3
"""
Diagnostic script to compare JSON exports from original multiworld vs pickle-loaded multiworld.

This script:
1. Loads an existing pickle file
2. Loads the original JSON rules
3. Compares location/entrance rules by evaluating them directly

Usage:
    python scripts/test/compare-pickle-json-export.py --game "Adventure" --seed 1
    python scripts/test/compare-pickle-json-export.py --game "A Link to the Past" --seed 1
"""

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def load_pickle_raw(pickle_path: Path):
    """Load multiworld from pickle using dill directly."""
    import dill

    print(f"Loading multiworld from pickle: {pickle_path}")
    with gzip.open(pickle_path, 'rb') as f:
        multiworld = dill.load(f)
    print(f"Loaded multiworld successfully")
    return multiworld


def load_json(path: Path) -> Dict[str, Any]:
    """Load JSON file."""
    with open(path, 'r') as f:
        return json.load(f)


def extract_rule_info(access_rule) -> Dict[str, Any]:
    """Extract information about an access rule."""
    info = {
        "has_rule": access_rule is not None,
        "rule_type": type(access_rule).__name__ if access_rule else None,
        "has_explain_json": hasattr(access_rule, 'explain_json'),
    }

    # Try to get the explain_json if available
    if hasattr(access_rule, 'explain_json'):
        try:
            info["explain_json"] = access_rule.explain_json()
        except Exception as e:
            info["explain_json_error"] = str(e)

    return info


def analyze_pickle_multiworld(multiworld, player_id: int = 1) -> Dict[str, Any]:
    """Analyze locations and entrances in the pickle-loaded multiworld."""
    results = {
        "locations": {},
        "entrances": {},
        "regions": [],
    }

    world = multiworld.worlds[player_id]

    # Analyze locations
    for location in world.get_locations():
        rule_info = extract_rule_info(location.access_rule)
        results["locations"][location.name] = {
            "address": location.address,
            "region": location.parent_region.name if location.parent_region else None,
            "rule_info": rule_info,
        }

    # Analyze entrances
    for region in multiworld.get_regions(player_id):
        results["regions"].append(region.name)
        for entrance in region.exits:
            rule_info = extract_rule_info(entrance.access_rule)
            results["entrances"][entrance.name] = {
                "from_region": region.name,
                "to_region": entrance.connected_region.name if entrance.connected_region else None,
                "rule_info": rule_info,
            }

    return results


def extract_json_locations_and_entrances(json_data: Dict) -> Tuple[Dict, Dict]:
    """Extract locations and entrances from nested JSON structure."""
    locations = {}
    entrances = {}

    # JSON structure: regions -> player_id -> region_name -> {exits, locations}
    regions = json_data.get("regions", {})
    for player_id, player_regions in regions.items():
        if isinstance(player_regions, dict):
            for region_name, region_data in player_regions.items():
                if isinstance(region_data, dict):
                    # Extract locations
                    for loc in region_data.get("locations", []):
                        if isinstance(loc, dict):
                            name = loc.get("name")
                            if name:
                                locations[name] = {
                                    "name": name,
                                    "region": region_name,
                                    "rule": loc.get("access_rule", {}).get("rule"),
                                }
                    # Extract entrances (exits)
                    for ent in region_data.get("exits", []):
                        if isinstance(ent, dict):
                            name = ent.get("name")
                            if name:
                                entrances[name] = {
                                    "name": name,
                                    "from_region": region_name,
                                    "to_region": ent.get("connected_region"),
                                    "rule": ent.get("access_rule", {}).get("rule"),
                                }

    return locations, entrances


def compare_location_rules(pickle_data: Dict, json_data: Dict, json_locations: Dict) -> List[str]:
    """Compare location rules between pickle and JSON."""
    differences = []

    pickle_locations = pickle_data.get("locations", {})

    all_names = set(pickle_locations.keys()) | set(json_locations.keys())

    for name in sorted(all_names):
        if name not in pickle_locations:
            differences.append(f"Location '{name}': missing in pickle")
            continue
        if name not in json_locations:
            # Check if it's an event (no address)
            if pickle_locations[name].get("address") is None:
                continue  # Events aren't in JSON
            differences.append(f"Location '{name}': missing in JSON")
            continue

        pickle_loc = pickle_locations[name]
        json_loc = json_locations[name]

        # Compare rules
        pickle_rule_info = pickle_loc.get("rule_info", {})
        json_rule = json_loc.get("rule")

        # Check if pickle has explain_json and compare with JSON
        if pickle_rule_info.get("has_explain_json"):
            pickle_explain = pickle_rule_info.get("explain_json")
            if pickle_explain != json_rule:
                differences.append(
                    f"Location '{name}': rule differs\n"
                    f"  Pickle explain_json: {json.dumps(pickle_explain)[:150]}\n"
                    f"  JSON rule:           {json.dumps(json_rule)[:150]}"
                )
        elif json_rule is not None and json_rule != "True_":
            # Pickle doesn't have explain_json but JSON has a non-trivial rule
            # Only report if JSON rule is not the default "True_"
            differences.append(
                f"Location '{name}': pickle has no explain_json, JSON has rule\n"
                f"  Pickle rule type: {pickle_rule_info.get('rule_type')}\n"
                f"  JSON rule: {json.dumps(json_rule)[:150]}"
            )

    return differences


def compare_entrance_rules(pickle_data: Dict, json_entrances: Dict) -> List[str]:
    """Compare entrance rules between pickle and JSON."""
    differences = []

    pickle_entrances = pickle_data.get("entrances", {})

    all_names = set(pickle_entrances.keys()) | set(json_entrances.keys())

    for name in sorted(all_names):
        if name not in pickle_entrances:
            differences.append(f"Entrance '{name}': missing in pickle")
            continue
        if name not in json_entrances:
            differences.append(f"Entrance '{name}': missing in JSON")
            continue

        pickle_ent = pickle_entrances[name]
        json_ent = json_entrances[name]

        # Compare rules
        pickle_rule_info = pickle_ent.get("rule_info", {})
        json_rule = json_ent.get("rule")

        if pickle_rule_info.get("has_explain_json"):
            pickle_explain = pickle_rule_info.get("explain_json")
            if pickle_explain != json_rule:
                differences.append(
                    f"Entrance '{name}': rule differs\n"
                    f"  Pickle explain_json: {json.dumps(pickle_explain)[:150]}\n"
                    f"  JSON rule:           {json.dumps(json_rule)[:150]}"
                )
        elif json_rule is not None and json_rule != "True_":
            # Only report if JSON rule is not the default "True_"
            differences.append(
                f"Entrance '{name}': pickle has no explain_json, JSON has rule\n"
                f"  Pickle rule type: {pickle_rule_info.get('rule_type')}\n"
                f"  JSON rule: {json.dumps(json_rule)[:150]}"
            )

    return differences


def compare_regions(pickle_data: Dict, json_data: Dict) -> List[str]:
    """Compare regions between pickle and JSON."""
    differences = []

    pickle_regions = set(pickle_data.get("regions", []))
    json_regions = set(json_data.get("regions", {}).keys())

    missing_in_pickle = json_regions - pickle_regions
    missing_in_json = pickle_regions - json_regions

    for region in sorted(missing_in_pickle):
        differences.append(f"Region '{region}': missing in pickle")
    for region in sorted(missing_in_json):
        differences.append(f"Region '{region}': missing in JSON")

    return differences


def main():
    parser = argparse.ArgumentParser(
        description="Compare location/entrance rules from pickle vs JSON export"
    )
    parser.add_argument(
        "--game", "-g",
        required=True,
        help="Game name (e.g., 'Adventure', 'A Link to the Past')"
    )
    parser.add_argument(
        "--seed", "-s",
        type=int,
        default=1,
        help="Seed number (default: 1)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show all locations/entrances, not just differences"
    )

    args = parser.parse_args()

    # Load world mapping to get game directory
    mapping_file = PROJECT_ROOT / "scripts" / "data" / "world-mapping.json"
    with open(mapping_file, 'r') as f:
        world_mapping = json.load(f)

    game_dir = None
    if args.game in world_mapping:
        game_dir = world_mapping[args.game].get("world_directory")

    if not game_dir:
        print(f"Could not find game directory for '{args.game}'")
        print("Available games:")
        for game_name in sorted(list(world_mapping.keys())[:20]):
            print(f"  - {game_name}")
        sys.exit(1)

    # Calculate seed name
    from scripts.lib.seed_utils import get_seed_id
    seed_name = get_seed_id(args.seed)
    if seed_name.startswith("AP_"):
        seed_name = seed_name[3:]

    print(f"Game: {args.game}")
    print(f"Game directory: {game_dir}")
    print(f"Seed: AP_{seed_name}")
    print()

    # Find files
    presets_dir = PROJECT_ROOT / "frontend" / "presets" / game_dir / f"AP_{seed_name}"
    pickle_file = presets_dir / f"AP_{seed_name}.pkl.gz"
    json_file = presets_dir / f"AP_{seed_name}_rules.json"

    if not pickle_file.exists():
        print(f"ERROR: Pickle file not found: {pickle_file}")
        print("\nGenerate a seed first with pickle export enabled:")
        print(f"  python scripts/setup/update_host_settings.py pickle-mode")
        print(f"  python Generate.py --weights_file_path 'Templates/{args.game}.yaml' --seed {args.seed}")
        sys.exit(1)

    if not json_file.exists():
        print(f"ERROR: JSON file not found: {json_file}")
        sys.exit(1)

    print(f"Pickle file: {pickle_file}")
    print(f"JSON file: {json_file}")

    # Load data
    print("\n" + "="*60)
    print("Loading data...")
    print("="*60)

    multiworld = load_pickle_raw(pickle_file)
    json_data = load_json(json_file)

    # Analyze pickle multiworld
    print("\nAnalyzing pickle multiworld...")
    pickle_data = analyze_pickle_multiworld(multiworld)

    print(f"  Locations: {len(pickle_data['locations'])}")
    print(f"  Entrances: {len(pickle_data['entrances'])}")
    print(f"  Regions: {len(pickle_data['regions'])}")

    # Extract JSON locations and entrances from nested structure
    print("\nExtracting JSON data from nested structure...")
    json_locations, json_entrances = extract_json_locations_and_entrances(json_data)

    # Extract JSON regions
    json_regions = set()
    for player_id, player_regions in json_data.get("regions", {}).items():
        if isinstance(player_regions, dict):
            json_regions.update(player_regions.keys())

    print(f"\nJSON data (extracted):")
    print(f"  Locations: {len(json_locations)}")
    print(f"  Entrances: {len(json_entrances)}")
    print(f"  Regions: {len(json_regions)}")

    # Compare
    print("\n" + "="*60)
    print("COMPARISON RESULTS")
    print("="*60)

    location_diffs = compare_location_rules(pickle_data, json_data, json_locations)
    entrance_diffs = compare_entrance_rules(pickle_data, json_entrances)

    # Compare regions
    region_diffs = []
    pickle_regions = set(pickle_data.get("regions", []))
    missing_in_pickle = json_regions - pickle_regions
    missing_in_json = pickle_regions - json_regions
    for region in sorted(missing_in_pickle):
        region_diffs.append(f"Region '{region}': missing in pickle")
    for region in sorted(missing_in_json):
        region_diffs.append(f"Region '{region}': missing in JSON")

    total_diffs = 0

    if region_diffs:
        print(f"\nREGION DIFFERENCES ({len(region_diffs)}):")
        print("-" * 40)
        for diff in region_diffs[:20]:
            print(f"  {diff}")
        if len(region_diffs) > 20:
            print(f"  ... and {len(region_diffs) - 20} more")
        total_diffs += len(region_diffs)

    if location_diffs:
        print(f"\nLOCATION RULE DIFFERENCES ({len(location_diffs)}):")
        print("-" * 40)
        for diff in location_diffs[:20]:
            print(f"  {diff}")
        if len(location_diffs) > 20:
            print(f"  ... and {len(location_diffs) - 20} more")
        total_diffs += len(location_diffs)

    if entrance_diffs:
        print(f"\nENTRANCE RULE DIFFERENCES ({len(entrance_diffs)}):")
        print("-" * 40)
        for diff in entrance_diffs[:20]:
            print(f"  {diff}")
        if len(entrance_diffs) > 20:
            print(f"  ... and {len(entrance_diffs) - 20} more")
        total_diffs += len(entrance_diffs)

    if total_diffs == 0:
        print("\nNo differences found!")
    else:
        print(f"\nTotal differences: {total_diffs}")

    # Show rule type statistics
    print("\n" + "="*60)
    print("RULE TYPE STATISTICS (Pickle)")
    print("="*60)

    loc_rule_types = {}
    for name, loc in pickle_data["locations"].items():
        rule_type = loc["rule_info"].get("rule_type", "None")
        has_explain = loc["rule_info"].get("has_explain_json", False)
        key = f"{rule_type} (explain_json={has_explain})"
        loc_rule_types[key] = loc_rule_types.get(key, 0) + 1

    print("\nLocation rule types:")
    for rule_type, count in sorted(loc_rule_types.items(), key=lambda x: -x[1]):
        print(f"  {rule_type}: {count}")

    ent_rule_types = {}
    for name, ent in pickle_data["entrances"].items():
        rule_type = ent["rule_info"].get("rule_type", "None")
        has_explain = ent["rule_info"].get("has_explain_json", False)
        key = f"{rule_type} (explain_json={has_explain})"
        ent_rule_types[key] = ent_rule_types.get(key, 0) + 1

    print("\nEntrance rule types:")
    for rule_type, count in sorted(ent_rule_types.items(), key=lambda x: -x[1]):
        print(f"  {rule_type}: {count}")

    return total_diffs


if __name__ == "__main__":
    sys.exit(0 if main() == 0 else 1)
