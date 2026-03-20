#!/usr/bin/env python3
"""
Test vanilla ALTTP plando with monkey patches applied.

Runs seed generation with the full vanilla YAML and verifies all 226
placements match vanilla data. Tests multiple seeds.

Usage:
    python scripts/vanilla-alttp/test_vanilla_patches.py [--seeds 1,2,3]
"""

import argparse
import importlib.util
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
os.chdir(PROJECT_DIR)
sys.path.insert(0, PROJECT_DIR)

# Must be done before any Archipelago imports
sys.modules['ModuleUpdate'] = type(sys)('ModuleUpdate')
sys.modules['ModuleUpdate'].update = lambda *a, **kw: None
sys.modules['ModuleUpdate'].requirements_files = {}

# Import vanilla_patches from the hyphenated directory
spec = importlib.util.spec_from_file_location(
    'vanilla_patches',
    os.path.join(SCRIPT_DIR, 'vanilla_patches.py')
)
vanilla_patches = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vanilla_patches)

# Load vanilla data for verification
with open(os.path.join(SCRIPT_DIR, 'alttp_vanilla_consolidated.json'), 'r') as f:
    VANILLA_DATA = json.load(f)


def run_seed(seed_num):
    """Generate one seed with vanilla patches and return the multiworld."""
    import settings as Settings
    Settings.no_gui = True

    vanilla_patches.install()
    try:
        # Parse args via mystery_argparse, then pass to Generate.main
        from Generate import mystery_argparse, main as generate_main
        parsed_args = mystery_argparse(
            ['--weights_file_path', 'Templates/A Link to the Past - vanilla-full.yaml',
             '--multi', '1', '--seed', str(seed_num), '--skip_output',
             '--plando', 'bosses, connections, texts, items']
        )
        args, seed = generate_main(parsed_args)

        # Use Main.main to run the generation pipeline
        from Main import main as main_main
        multiworld = main_main(args, seed=seed)
        return multiworld
    finally:
        vanilla_patches.uninstall()


def verify_placements(multiworld, seed_num):
    """Verify all 226 vanilla placements are correct."""
    player = 1
    mismatches = []
    verified = 0

    for location_name, data in VANILLA_DATA.items():
        expected_item = data['item']
        try:
            location = multiworld.get_location(location_name, player)
        except KeyError:
            mismatches.append(f"  Location not found: {location_name}")
            continue

        if location.item is None:
            mismatches.append(f"  No item at: {location_name} (expected {expected_item})")
            continue

        actual_item = location.item.name
        if actual_item != expected_item:
            mismatches.append(
                f"  {location_name}: expected '{expected_item}', got '{actual_item}'"
            )
        else:
            verified += 1

    return verified, mismatches


def main():
    parser = argparse.ArgumentParser(description='Test vanilla ALTTP plando with monkey patches')
    parser.add_argument('--seeds', default='1,2,3,42,100,999',
                        help='Comma-separated seed numbers to test')
    args = parser.parse_args()

    seeds = [int(s) for s in args.seeds.split(',')]
    total_locations = len(VANILLA_DATA)
    all_passed = True

    print(f"Testing {len(seeds)} seeds with vanilla plando patches...")
    print(f"Expected: {total_locations} vanilla placements per seed")
    print()

    for seed_num in seeds:
        print(f"--- Seed {seed_num} ---")
        try:
            multiworld = run_seed(seed_num)
            verified, mismatches = verify_placements(multiworld, seed_num)

            if mismatches:
                print(f"  FAIL: {verified}/{total_locations} correct")
                for m in mismatches[:10]:
                    print(m)
                if len(mismatches) > 10:
                    print(f"  ... and {len(mismatches) - 10} more")
                all_passed = False
            else:
                print(f"  PASS: {verified}/{total_locations} correct")
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
            all_passed = False
        print()

    if all_passed:
        print(f"ALL {len(seeds)} SEEDS PASSED")
    else:
        print("SOME SEEDS FAILED")
        sys.exit(1)


if __name__ == '__main__':
    main()
