#!/usr/bin/env python
"""
Investigate which locations in a worldgen world don't have explain support.

This uses TrackerCore to properly initialize the world with rules.json,
just like the fuzz test does.
"""
import sys
import os
import logging

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, project_root)

from BaseClasses import Location
from worlds.tracker import TrackerCore, DeferredEntranceMode

logger = logging.getLogger("InvestigateExplain")
logging.basicConfig(level=logging.WARNING)


def investigate_explain_support(game_name: str, rules_json_path: str):
    """
    Initialize a worldgen world via TrackerCore and check explain support.

    Args:
        game_name: Name of the game (e.g., "A Link to the Past")
        rules_json_path: Path to the rules.json file
    """
    print(f"\n=== Investigating Explain Support for {game_name} ===\n")

    # Initialize TrackerCore similar to fuzzer_hook
    ut_core = TrackerCore.TrackerCore(logger, False, False)
    ut_core.enforce_deferred_connections = DeferredEntranceMode.disabled

    # Load rules.json directly
    if not ut_core.load_rules_json(rules_json_path):
        print(f"ERROR: Failed to load rules.json from {rules_json_path}")
        return

    # Set up parameters
    ut_core.set_slot_params(game_name, 1, "Player1", 1)

    # Get the world class from the loaded rules
    if not ut_core.rules_json_data:
        print(f"ERROR: Failed to load rules.json from {rules_json_path}")
        return

    # Get game class
    from worlds import AutoWorldRegister
    game_identifier = ut_core.rules_json_data.get("game", game_name)
    world_class = AutoWorldRegister.world_types.get(game_identifier)
    if not world_class:
        print(f"ERROR: World class not found for game: {game_identifier}")
        return

    # Initialize the tracker core with empty slot data
    ut_core.initalize_tracker_core(world_class, {})

    if not ut_core.multiworld:
        print(f"ERROR: Failed to initialize multiworld: {ut_core.gen_error}")
        return

    # Now analyze the worldgen world
    world = ut_core.multiworld.worlds[ut_core.player_id]
    locations = list(world.get_locations())

    total_locations = 0
    locations_with_explain = []
    locations_default_rule = []
    locations_without_explain = []

    for location in locations:
        # Skip event locations
        if location.address is None:
            continue

        total_locations += 1
        access_rule = location.access_rule

        if access_rule is Location.access_rule:
            locations_default_rule.append(location)
        elif hasattr(access_rule, 'explain_json'):
            locations_with_explain.append(location)
        else:
            locations_without_explain.append(location)

    # Print summary
    print(f"Total locations: {total_locations}")
    print(f"Locations with explain support: {len(locations_with_explain)}")
    print(f"Locations with default rule: {len(locations_default_rule)}")
    print(f"Locations without explain support: {len(locations_without_explain)}")

    custom_rule_count = len(locations_with_explain) + len(locations_without_explain)
    if custom_rule_count > 0:
        coverage = len(locations_with_explain) / custom_rule_count * 100
        print(f"Explain coverage: {coverage:.2f}%")

    # Print locations without explain support
    if locations_without_explain:
        print(f"\n=== Locations WITHOUT Explain Support ({len(locations_without_explain)}) ===\n")

        # Group by region
        by_region = {}
        for loc in locations_without_explain:
            region_name = loc.parent_region.name if loc.parent_region else "Unknown"
            if region_name not in by_region:
                by_region[region_name] = []
            by_region[region_name].append(loc)

        for region_name in sorted(by_region.keys()):
            locs = by_region[region_name]
            print(f"\n{region_name}:")
            for loc in locs:
                # Try to get info about the rule
                rule_info = ""
                if hasattr(loc.access_rule, '__name__'):
                    rule_info = f" (rule: {loc.access_rule.__name__})"
                elif hasattr(loc.access_rule, '__class__'):
                    rule_info = f" (rule type: {loc.access_rule.__class__.__name__})"
                print(f"  - {loc.name}{rule_info}")
    else:
        print("\n✅ All locations with custom rules have explain support!")


if __name__ == "__main__":
    # Default to ALTTP worldgen
    game = "A Link to the Past"
    rules_path = "frontend/presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json"

    if len(sys.argv) > 1:
        rules_path = sys.argv[1]
    if len(sys.argv) > 2:
        game = sys.argv[2]

    # Make path absolute if relative
    if not os.path.isabs(rules_path):
        rules_path = os.path.join(project_root, rules_path)

    investigate_explain_support(game, rules_path)
