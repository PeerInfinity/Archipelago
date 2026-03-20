#!/usr/bin/env python3
"""
Generate tracking-mode-config.json from UT fuzz test results.

This script reads the test results from scripts/output/ut-fuzz/ and generates
the tracking-mode-config.json file that specifies which tracking modes pass
for each game.

Usage:
    python scripts/test/generate-tracking-mode-config.py [options]

Options:
    --output PATH       Output path for config (default: exporter/tracking-mode-config.json)
    --preserve-order    Preserve existing fallback_order from current config
    --dry-run           Show what would be generated without writing
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

# Add repository root to path
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))


def load_test_results(mode: str, world_source: str = "bundled") -> Optional[Dict[str, Any]]:
    """Load test results for a specific mode and world source.

    Args:
        mode: The UT mode (original, worldgen, pickle, hybrid)
        world_source: Either 'bundled' or 'apworlds'

    Returns:
        Dict with test results or None if file not found
    """
    # Build filename based on world source and mode
    if world_source == "bundled":
        filename = f"test-results-{mode}-fixed-seed.json"
    else:
        filename = f"test-results-{world_source}-{mode}-fixed-seed.json"

    results_path = REPO_ROOT / "scripts" / "output" / "ut-fuzz" / filename

    if not results_path.exists():
        print(f"  Warning: {filename} not found")
        return None

    try:
        with open(results_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"  Error loading {filename}: {e}")
        return None


def extract_passing_games(results: Dict[str, Any]) -> Set[str]:
    """Extract the set of games that passed from test results.

    A game passes if ut_fuzz.passed is True.

    Args:
        results: Loaded test results dict

    Returns:
        Set of game names that passed
    """
    passing = set()

    for template_name, data in results.get("results", {}).items():
        ut_fuzz = data.get("ut_fuzz", {})
        if ut_fuzz.get("passed", False):
            # Extract game name from world_info if available, otherwise from template
            world_info = data.get("world_info", {})
            game_name = world_info.get("game_name")
            if not game_name:
                # Fallback: derive from template name (remove .yaml extension)
                game_name = template_name.replace(".yaml", "")
            passing.add(game_name)

    return passing


def load_existing_config(config_path: Path) -> Optional[Dict[str, Any]]:
    """Load the existing config file if it exists.

    Args:
        config_path: Path to the config file

    Returns:
        Existing config dict or None
    """
    if not config_path.exists():
        return None

    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Warning: Could not load existing config: {e}")
        return None


def generate_config(
    preserve_order: bool = True,
    existing_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Generate the tracking mode config from test results.

    Args:
        preserve_order: Whether to preserve fallback_order from existing config
        existing_config: Existing config to preserve settings from

    Returns:
        New config dict
    """
    print("Loading test results...")

    # Load results for each mode
    modes = ["worldgen", "pickle", "original", "original_seeded"]
    bundled_results = {}
    apworlds_results = {}

    for mode in modes:
        # Load bundled results
        print(f"  Loading {mode} (bundled)...")
        results = load_test_results(mode, "bundled")
        if results:
            passing = extract_passing_games(results)
            print(f"    Found {len(passing)} passing games")
            bundled_results[mode] = passing
        else:
            bundled_results[mode] = set()

        # Load apworlds results
        print(f"  Loading {mode} (apworlds)...")
        results = load_test_results(mode, "apworlds")
        if results:
            passing = extract_passing_games(results)
            print(f"    Found {len(passing)} passing games")
            apworlds_results[mode] = passing
        else:
            apworlds_results[mode] = set()

    # Build game_results: for each game, list which modes pass
    print("\nBuilding game results...")

    bundled_games: Dict[str, List[str]] = {}
    apworlds_games: Dict[str, List[str]] = {}

    # Process bundled games
    all_bundled_games = set()
    for mode_games in bundled_results.values():
        all_bundled_games.update(mode_games)

    for game in sorted(all_bundled_games):
        passing_modes = []
        for mode in modes:
            if game in bundled_results.get(mode, set()):
                passing_modes.append(mode)
        bundled_games[game] = passing_modes

    # Process apworlds games
    all_apworlds_games = set()
    for mode_games in apworlds_results.values():
        all_apworlds_games.update(mode_games)

    for game in sorted(all_apworlds_games):
        passing_modes = []
        for mode in modes:
            if game in apworlds_results.get(mode, set()):
                passing_modes.append(mode)
        apworlds_games[game] = passing_modes

    # Determine fallback_order
    if preserve_order and existing_config and "fallback_order" in existing_config:
        fallback_order = existing_config["fallback_order"]
        print(f"  Preserving existing fallback_order: {fallback_order}")
    else:
        fallback_order = ["worldgen", "pickle", "original_seeded", "original"]
        print(f"  Using default fallback_order: {fallback_order}")

    # Build config
    config = {
        "description": "Universal Tracker mode configuration. Specifies which tracking modes pass for each game.",
        "generated": datetime.now(timezone.utc).isoformat(),
        "fallback_order": fallback_order,
        "game_results": {
            "bundled": bundled_games,
            "apworlds": apworlds_games
        }
    }

    # Print summary
    print(f"\nSummary:")
    print(f"  Bundled games: {len(bundled_games)}")
    print(f"  APWorlds games: {len(apworlds_games)}")

    # Count games by their first passing mode
    for category, games in [("Bundled", bundled_games), ("APWorlds", apworlds_games)]:
        if not games:
            continue

        mode_counts = {"worldgen": 0, "pickle": 0, "original_seeded": 0, "original": 0, "none": 0}
        for game, passing_modes in games.items():
            first_mode = None
            for mode in fallback_order:
                if mode in passing_modes:
                    first_mode = mode
                    break
            if first_mode:
                mode_counts[first_mode] += 1
            else:
                mode_counts["none"] += 1

        print(f"\n  {category} - First passing mode distribution:")
        for mode in fallback_order + ["none"]:
            if mode_counts[mode] > 0:
                print(f"    {mode}: {mode_counts[mode]} games")

    return config


def main():
    parser = argparse.ArgumentParser(
        description="Generate tracking-mode-config.json from UT fuzz test results"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=REPO_ROOT / "exporter" / "tracking-mode-config.json",
        help="Output path for config (default: exporter/tracking-mode-config.json)"
    )
    parser.add_argument(
        "--preserve-order",
        action="store_true",
        default=True,
        help="Preserve existing fallback_order from current config (default: True)"
    )
    parser.add_argument(
        "--no-preserve-order",
        action="store_false",
        dest="preserve_order",
        help="Use default fallback_order instead of preserving existing"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without writing"
    )

    args = parser.parse_args()

    # Load existing config if preserving order
    existing_config = None
    if args.preserve_order and args.output.exists():
        existing_config = load_existing_config(args.output)

    # Generate config
    config = generate_config(
        preserve_order=args.preserve_order,
        existing_config=existing_config
    )

    if args.dry_run:
        print("\nDry run - would generate:")
        print(json.dumps(config, indent=2))
    else:
        # Write config
        print(f"\nWriting config to {args.output}")
        with open(args.output, 'w') as f:
            json.dump(config, f, indent=2)
        print("Done!")


if __name__ == "__main__":
    main()
