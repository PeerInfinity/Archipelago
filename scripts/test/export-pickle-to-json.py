#!/usr/bin/env python3
"""
Export rules.json from a pickled multiworld.

This script:
1. Loads a multiworld from a pickle file
2. Exports rules.json using the standard exporter
3. Saves to a separate file for comparison with the original

Usage:
    python scripts/test/export-pickle-to-json.py --game "Adventure" --seed 1
    python scripts/test/export-pickle-to-json.py --game "A Link to the Past" --seed 1 --format ast
"""

import argparse
import gzip
import json
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def load_pickle(pickle_path: Path):
    """Load multiworld from pickle using dill."""
    import dill

    print(f"Loading multiworld from pickle: {pickle_path}")
    with gzip.open(pickle_path, 'rb') as f:
        multiworld = dill.load(f)
    print(f"Loaded multiworld successfully")
    print(f"  Game: {multiworld.worlds[1].game}")
    print(f"  Seed: {multiworld.seed}")
    return multiworld


def export_rules_json(multiworld, output_dir: Path, filename_base: str, rules_format: str = "rule_builder"):
    """Export rules.json from multiworld using the standard exporter."""
    from exporter.exporter import export_game_rules

    print(f"\nExporting rules.json with format '{rules_format}'...")
    print(f"  Output directory: {output_dir}")
    print(f"  Filename base: {filename_base}")

    result = export_game_rules(
        multiworld=multiworld,
        output_dir=str(output_dir),
        filename_base=filename_base,
        save_presets=False,
        rules_json_format=rules_format,
    )

    print(f"  Export complete")
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Export rules.json from a pickled multiworld"
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
        "--format", "-f",
        choices=["rule_builder", "ast", "both"],
        default="rule_builder",
        help="Output format (default: rule_builder)"
    )
    parser.add_argument(
        "--output-suffix",
        default="_from_pickle",
        help="Suffix for output file (default: _from_pickle)"
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
    print(f"Format: {args.format}")
    print()

    # Find pickle file
    presets_dir = PROJECT_ROOT / "frontend" / "presets" / game_dir / f"AP_{seed_name}"
    pickle_file = presets_dir / f"AP_{seed_name}.pkl.gz"
    original_json = presets_dir / f"AP_{seed_name}_rules.json"

    if not pickle_file.exists():
        print(f"ERROR: Pickle file not found: {pickle_file}")
        print("\nGenerate a seed first with pickle export enabled:")
        print(f"  python scripts/setup/update_host_settings.py pickle-mode")
        print(f"  python Generate.py --weights_file_path 'Templates/{args.game}.yaml' --seed {args.seed}")
        sys.exit(1)

    print(f"Pickle file: {pickle_file}")
    print(f"Original JSON: {original_json}")

    # Load pickle
    multiworld = load_pickle(pickle_file)

    # Export to new file
    # Note: export_game_rules adds "_rules.json" suffix to filename_base
    filename_base = f"AP_{seed_name}{args.output_suffix}"
    output_json = presets_dir / f"{filename_base}_rules.json"
    print(f"Output JSON: {output_json}")

    export_rules_json(multiworld, presets_dir, filename_base, args.format)

    # Compare file sizes
    if original_json.exists():
        orig_size = original_json.stat().st_size
        new_size = output_json.stat().st_size
        print(f"\nFile sizes:")
        print(f"  Original: {orig_size:,} bytes")
        print(f"  From pickle: {new_size:,} bytes")
        print(f"  Difference: {new_size - orig_size:,} bytes ({(new_size/orig_size - 1)*100:.1f}%)")

    # Quick diff summary
    if original_json.exists():
        print("\nComparing JSON structure...")
        with open(original_json) as f:
            orig_data = json.load(f)
        with open(output_json) as f:
            new_data = json.load(f)

        # Compare top-level keys
        orig_keys = set(orig_data.keys())
        new_keys = set(new_data.keys())

        if orig_keys != new_keys:
            print(f"  Key differences:")
            if orig_keys - new_keys:
                print(f"    Missing in new: {orig_keys - new_keys}")
            if new_keys - orig_keys:
                print(f"    Extra in new: {new_keys - orig_keys}")
        else:
            print(f"  Top-level keys match: {sorted(orig_keys)}")

        # Compare counts
        for key in ['locations', 'entrances']:
            if key in orig_data and key in new_data:
                # Handle nested structure
                if isinstance(orig_data.get('regions'), dict):
                    # Count from nested structure
                    orig_count = 0
                    new_count = 0
                    for player_id, regions in orig_data.get('regions', {}).items():
                        if isinstance(regions, dict):
                            for region_name, region_data in regions.items():
                                if isinstance(region_data, dict):
                                    if key == 'locations':
                                        orig_count += len(region_data.get('locations', []))
                                    elif key == 'entrances':
                                        orig_count += len(region_data.get('exits', []))
                    for player_id, regions in new_data.get('regions', {}).items():
                        if isinstance(regions, dict):
                            for region_name, region_data in regions.items():
                                if isinstance(region_data, dict):
                                    if key == 'locations':
                                        new_count += len(region_data.get('locations', []))
                                    elif key == 'entrances':
                                        new_count += len(region_data.get('exits', []))
                    print(f"  {key.capitalize()}: orig={orig_count}, new={new_count}")

    print(f"\nFiles saved:")
    print(f"  Original: {original_json}")
    print(f"  From pickle: {output_json}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
