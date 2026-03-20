#!/usr/bin/env python3
"""
Test script for JSONWorldBuilder.

Tests the ability to create world instances from JSON export data
using the corresponding _worldgen worlds.

Usage:
    python scripts/test/test-json-world-builder.py [--game GAME]
"""

import argparse
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def test_import():
    """Test that the module can be imported."""
    print("Testing import...")
    from world_generator import JSONWorldBuilder, create_world_from_json
    print("  ✓ Import successful")
    return True


def test_load_json(json_path: Path):
    """Test loading a JSON file."""
    print(f"Testing JSON loading from {json_path}...")
    from world_generator import JSONWorldBuilder

    builder = JSONWorldBuilder(json_path)
    data = builder.load()

    assert data is not None, "ExtractedData should not be None"
    assert data.metadata.game_name, "Game name should be set"
    assert builder.schema_version is not None, "Schema version should be set"

    print(f"  ✓ Loaded JSON for game: {data.metadata.game_name}")
    print(f"  ✓ Schema version: {builder.schema_version}")
    print(f"  ✓ Locations: {len(data.locations)}")
    print(f"  ✓ Regions: {len(data.regions)}")
    print(f"  ✓ Items: {len(data.items)}")
    return True


def test_build_world(json_path: Path, worldgen_name: str):
    """Test building a world instance."""
    print(f"Testing world build for '{worldgen_name}'...")
    from world_generator import JSONWorldBuilder

    builder = JSONWorldBuilder(json_path)
    builder.load()

    try:
        world = builder.build_world(worldgen_name)
    except ValueError as e:
        print(f"  ✗ World not registered: {e}")
        return False

    assert world is not None, "World should not be None"
    assert builder.multiworld is not None, "MultiWorld should not be None"
    assert builder.get_state() is not None, "State should not be None"

    print(f"  ✓ World instance created: {type(world).__name__}")
    print(f"  ✓ MultiWorld player count: {builder.multiworld.players}")
    print(f"  ✓ supports_explain(): {builder.supports_explain()}")
    return True


def test_convenience_function(json_path: Path, worldgen_name: str):
    """Test the create_world_from_json convenience function."""
    print(f"Testing create_world_from_json...")
    from world_generator import create_world_from_json

    try:
        world, multiworld, state = create_world_from_json(json_path, worldgen_name)
    except ValueError as e:
        print(f"  ✗ World not registered: {e}")
        return False

    assert world is not None, "World should not be None"
    assert multiworld is not None, "MultiWorld should not be None"
    assert state is not None, "State should not be None"

    print(f"  ✓ World: {type(world).__name__}")
    print(f"  ✓ Game: {multiworld.game[1]}")
    return True


def test_explain_support(json_path: Path, worldgen_name: str):
    """Test that explain functionality works on the built world."""
    print(f"Testing explain support...")
    from world_generator import create_world_from_json

    try:
        world, multiworld, state = create_world_from_json(json_path, worldgen_name)
    except ValueError as e:
        print(f"  ✗ World not registered: {e}")
        return False

    # Initialize the world's regions and rules
    print("  Calling create_regions()...")
    world.create_regions()
    print(f"  ✓ Created {len(list(multiworld.get_regions(1)))} regions")

    print("  Calling set_rules()...")
    world.set_rules()
    print("  ✓ Rules set")

    # Find a location with a non-trivial rule
    locations_with_rules = []
    for region in multiworld.get_regions(1):
        for location in region.locations:
            if hasattr(location.access_rule, 'explain_json'):
                locations_with_rules.append(location)
                if len(locations_with_rules) >= 3:
                    break
        if len(locations_with_rules) >= 3:
            break

    if not locations_with_rules:
        print("  ⚠ No locations with explain_json found")
        return True  # Not a failure, just no rules to test

    print(f"  ✓ Found {len(locations_with_rules)} locations with explain support")

    # Test explain on first location
    location = locations_with_rules[0]
    try:
        explanation = location.access_rule.explain_json(state)
        print(f"  ✓ explain_json() returned {len(explanation)} parts for '{location.name}'")
    except Exception as e:
        print(f"  ✗ explain_json() failed: {e}")
        return False

    return True


def find_json_and_worldgen(game: str) -> tuple[Path, str]:
    """Find JSON rules file and worldgen name for a game."""
    presets_dir = PROJECT_ROOT / "frontend" / "presets"

    # Try worldgen variant first
    worldgen_dir = presets_dir / f"{game}_worldgen"
    if worldgen_dir.exists():
        # Find the first seed directory
        seed_dirs = list(worldgen_dir.glob("AP_*"))
        if seed_dirs:
            json_files = list(seed_dirs[0].glob("*_rules.json"))
            if json_files:
                # Load JSON to get the actual game name
                from world_generator import JSONWorldBuilder
                builder = JSONWorldBuilder(json_files[0])
                builder.load()
                # The worldgen world uses the game_name from JSON + " WorldGen"
                worldgen_name = f"{builder.data.metadata.game_name}"
                # Check if it already ends with WorldGen
                if not worldgen_name.endswith(" WorldGen"):
                    worldgen_name = f"{worldgen_name}"  # Already has suffix from worldgen
                return json_files[0], worldgen_name

    # Fallback to original game preset
    game_dir = presets_dir / game
    if game_dir.exists():
        seed_dirs = list(game_dir.glob("AP_*"))
        if seed_dirs:
            json_files = list(seed_dirs[0].glob("*_rules.json"))
            if json_files:
                # Load JSON to get the actual game name
                from world_generator import JSONWorldBuilder
                builder = JSONWorldBuilder(json_files[0])
                builder.load()
                base_game = builder.data.metadata.game_name
                return json_files[0], f"{base_game} WorldGen"

    raise FileNotFoundError(f"No JSON rules file found for game: {game}")


def main():
    parser = argparse.ArgumentParser(description="Test JSONWorldBuilder")
    parser.add_argument(
        "--game", "-g",
        default="shorthike",
        help="Game preset to test (default: shorthike)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("JSONWorldBuilder Test Suite")
    print("=" * 60)
    print()

    # Test 1: Import
    if not test_import():
        return 1

    print()

    # Find JSON and worldgen name
    try:
        json_path, worldgen_name = find_json_and_worldgen(args.game)
        print(f"Using JSON: {json_path}")
        print(f"WorldGen name: {worldgen_name}")
        print()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1

    # Test 2: Load JSON
    if not test_load_json(json_path):
        return 1

    print()

    # Test 3: Build world
    if not test_build_world(json_path, worldgen_name):
        print("  Note: This may fail if the worldgen world isn't generated yet.")
        print("  Run: python -m world_generator <rules.json> -o worlds/<game>_worldgen")
        return 1

    print()

    # Test 4: Convenience function
    if not test_convenience_function(json_path, worldgen_name):
        return 1

    print()

    # Test 5: Explain support
    if not test_explain_support(json_path, worldgen_name):
        return 1

    print()
    print("=" * 60)
    print("All tests passed!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
