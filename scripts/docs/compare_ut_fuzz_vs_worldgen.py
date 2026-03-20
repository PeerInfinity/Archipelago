#!/usr/bin/env python3
"""
Compare UT fuzz test results with World Generator canonical test results.

This script compares the UT fuzzer results (which tests Universal Tracker's
accessibility calculations across random option configurations) with the
World Generator canonical tests (which test that regenerated worlds produce
identical sphere logs to original worlds).

Usage:
    python scripts/docs/compare_ut_fuzz_vs_worldgen.py
    python scripts/docs/compare_ut_fuzz_vs_worldgen.py --ut-fuzz path/to/ut.json --worldgen path/to/wg.json
"""

import argparse
import json
import os
import sys
from typing import Dict, Any, List


def load_results(filepath: str) -> Dict[str, Any]:
    """Load test results from JSON file."""
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading {filepath}: {e}")
        return {}


def extract_ut_fuzz_results(results: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Extract per-game results from UT fuzz test JSON.

    Returns dict mapping game_name -> {passed, success_rate, ...}
    """
    games = {}

    for template_name, template_data in results.get('results', {}).items():
        world_info = template_data.get('world_info', {})
        game_name = world_info.get('game_name', template_name.replace('.yaml', ''))

        ut_fuzz = template_data.get('ut_fuzz', {})
        total = ut_fuzz.get('total', 0)
        success = ut_fuzz.get('success', 0)
        failure = ut_fuzz.get('failure', 0)
        passed = ut_fuzz.get('passed', False)

        success_rate = (success / total * 100) if total > 0 else 0

        games[game_name] = {
            'passed': passed,
            'success': success,
            'failure': failure,
            'total': total,
            'success_rate': success_rate,
            'template': template_name
        }

    return games


def extract_worldgen_results(results: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Extract per-game results from World Generator canonical test JSON.

    Returns dict mapping game_name -> {
        original_spoiler_pass,
        worldgen_spoiler_pass,
        cross_validation_pass,
        rules_comparison_pass,
        overall_pass
    }
    """
    games = {}

    for game_name, game_data in results.get('results', {}).items():
        original = game_data.get('original', {})
        test_world = game_data.get('test_world', {})

        # Original world spoiler test
        orig_spoiler = original.get('spoiler_test', {})
        orig_spoiler_pass = orig_spoiler.get('pass_fail') == 'pass' if orig_spoiler else None

        # WorldGen world tests
        wg_spoiler = test_world.get('spoiler_test', {})
        wg_spoiler_pass = wg_spoiler.get('pass_fail') == 'pass' if wg_spoiler else None

        cross_val = test_world.get('cross_validation', {})
        cross_val_pass = cross_val.get('pass_fail') == 'pass' if cross_val else None

        rules_cmp = test_world.get('rules_comparison', {})
        rules_cmp_pass = rules_cmp.get('pass_fail') == 'pass' if rules_cmp else None

        # Overall pass: all tests pass
        overall_pass = all([
            orig_spoiler_pass,
            wg_spoiler_pass,
            cross_val_pass is None or cross_val_pass,  # cross_validation might not exist
            rules_cmp_pass is None or rules_cmp_pass   # rules_comparison might not exist
        ])

        games[game_name] = {
            'original_spoiler_pass': orig_spoiler_pass,
            'worldgen_spoiler_pass': wg_spoiler_pass,
            'cross_validation_pass': cross_val_pass,
            'rules_comparison_pass': rules_cmp_pass,
            'overall_pass': overall_pass,
            'template': game_data.get('template', f"{game_name}.yaml")
        }

    return games


def compare_results(ut_fuzz: Dict[str, Dict], worldgen: Dict[str, Dict]) -> Dict[str, List]:
    """
    Compare UT fuzz and World Generator results.

    Returns dict with categories:
        - both_pass: Pass in both UT fuzz and WorldGen
        - both_fail: Fail in both
        - ut_pass_wg_fail: Pass UT fuzz but fail WorldGen
        - ut_fail_wg_pass: Fail UT fuzz but pass WorldGen
        - only_ut_fuzz: Only in UT fuzz results
        - only_worldgen: Only in WorldGen results
    """
    comparison = {
        'both_pass': [],
        'both_fail': [],
        'ut_pass_wg_fail': [],
        'ut_fail_wg_pass': [],
        'only_ut_fuzz': [],
        'only_worldgen': []
    }

    all_games = set(ut_fuzz.keys()) | set(worldgen.keys())

    for game in sorted(all_games):
        ut = ut_fuzz.get(game)
        wg = worldgen.get(game)

        if ut is None:
            comparison['only_worldgen'].append((game, wg))
        elif wg is None:
            comparison['only_ut_fuzz'].append((game, ut))
        else:
            ut_passed = ut['passed']
            wg_passed = wg['overall_pass']

            if ut_passed and wg_passed:
                comparison['both_pass'].append((game, ut, wg))
            elif not ut_passed and not wg_passed:
                comparison['both_fail'].append((game, ut, wg))
            elif ut_passed and not wg_passed:
                comparison['ut_pass_wg_fail'].append((game, ut, wg))
            else:  # not ut_passed and wg_passed
                comparison['ut_fail_wg_pass'].append((game, ut, wg))

    return comparison


def format_ut_result(ut: Dict) -> str:
    """Format UT fuzz result for display."""
    if ut['passed']:
        return f"PASS ({ut['success']}/{ut['total']})"
    else:
        return f"FAIL ({ut['success']}/{ut['total']}, {ut['success_rate']:.0f}%)"


def format_wg_result(wg: Dict) -> str:
    """Format WorldGen result for display."""
    parts = []
    if wg['original_spoiler_pass'] is False:
        parts.append("orig-spoiler:FAIL")
    if wg['worldgen_spoiler_pass'] is False:
        parts.append("wg-spoiler:FAIL")
    if wg['cross_validation_pass'] is False:
        parts.append("cross-val:FAIL")
    if wg['rules_comparison_pass'] is False:
        parts.append("rules-cmp:FAIL")

    if not parts:
        return "PASS"
    return "FAIL (" + ", ".join(parts) + ")"


def print_comparison(comparison: Dict[str, List], ut_meta: Dict, wg_meta: Dict):
    """Print a formatted comparison report."""

    print("=" * 90)
    print("UT FUZZ vs WORLD GENERATOR TEST COMPARISON")
    print("=" * 90)
    print()

    # Metadata
    print("UT Fuzz Test:")
    print(f"  UT Version: {ut_meta.get('ut_version', 'unknown')}")
    print(f"  Seed: {ut_meta.get('starting_seed', ut_meta.get('seed', 'unknown'))}")
    print(f"  Runs per game: {ut_meta.get('runs_per_game', 'unknown')}")
    print()

    print("World Generator Canonical Test:")
    print(f"  Seed: {wg_meta.get('seed', 'unknown')}")
    print()

    # Summary
    total_common = (len(comparison['both_pass']) + len(comparison['both_fail']) +
                    len(comparison['ut_pass_wg_fail']) + len(comparison['ut_fail_wg_pass']))

    print("-" * 90)
    print("SUMMARY")
    print("-" * 90)
    print(f"Games in both test suites: {total_common}")
    print(f"  Both pass:                    {len(comparison['both_pass']):3d}")
    print(f"  Both fail:                    {len(comparison['both_fail']):3d}")
    print(f"  UT pass, WorldGen fail:       {len(comparison['ut_pass_wg_fail']):3d}")
    print(f"  UT fail, WorldGen pass:       {len(comparison['ut_fail_wg_pass']):3d}")
    if comparison['only_ut_fuzz']:
        print(f"  Only in UT fuzz:              {len(comparison['only_ut_fuzz']):3d}")
    if comparison['only_worldgen']:
        print(f"  Only in WorldGen:             {len(comparison['only_worldgen']):3d}")
    print()

    # Agreement rate
    agree = len(comparison['both_pass']) + len(comparison['both_fail'])
    if total_common > 0:
        agreement_rate = agree / total_common * 100
        print(f"Agreement rate: {agreement_rate:.1f}% ({agree}/{total_common})")
    print()

    # UT pass but WorldGen fail - these are interesting because UT thinks it works
    # but WorldGen canonical tests fail
    if comparison['ut_pass_wg_fail']:
        print("-" * 90)
        print(f"UT FUZZ PASS, WORLDGEN FAIL ({len(comparison['ut_pass_wg_fail'])} games)")
        print("-" * 90)
        print("These games pass UT fuzz testing but fail WorldGen canonical tests.")
        print("This may indicate issues with the WorldGen process, not UT itself.")
        print()
        print(f"{'Game':<40} {'UT Fuzz':<20} {'WorldGen Issue':<30}")
        print("-" * 90)
        for game, ut, wg in comparison['ut_pass_wg_fail']:
            ut_str = format_ut_result(ut)
            wg_str = format_wg_result(wg)
            print(f"{game:<40} {ut_str:<20} {wg_str:<30}")
        print()

    # UT fail but WorldGen pass - UT has issues with these games
    if comparison['ut_fail_wg_pass']:
        print("-" * 90)
        print(f"UT FUZZ FAIL, WORLDGEN PASS ({len(comparison['ut_fail_wg_pass'])} games)")
        print("-" * 90)
        print("These games pass WorldGen canonical tests but fail UT fuzz testing.")
        print("This indicates UT has compatibility issues with certain option combinations.")
        print()
        print(f"{'Game':<40} {'UT Fuzz Result':<25} {'Success Rate':<15}")
        print("-" * 90)
        for game, ut, wg in comparison['ut_fail_wg_pass']:
            ut_str = format_ut_result(ut)
            rate = f"{ut['success_rate']:.1f}%"
            print(f"{game:<40} {ut_str:<25} {rate:<15}")
        print()

    # Both fail
    if comparison['both_fail']:
        print("-" * 90)
        print(f"BOTH FAIL ({len(comparison['both_fail'])} games)")
        print("-" * 90)
        print(f"{'Game':<40} {'UT Fuzz':<25} {'WorldGen':<25}")
        print("-" * 90)
        for game, ut, wg in comparison['both_fail']:
            ut_str = format_ut_result(ut)
            wg_str = format_wg_result(wg)
            print(f"{game:<40} {ut_str:<25} {wg_str:<25}")
        print()

    # Both pass
    if comparison['both_pass']:
        print("-" * 90)
        print(f"BOTH PASS ({len(comparison['both_pass'])} games)")
        print("-" * 90)
        for i, (game, _, _) in enumerate(comparison['both_pass']):
            print(f"  {game}")
            if i >= 25 and len(comparison['both_pass']) > 30:
                print(f"  ... and {len(comparison['both_pass']) - 26} more")
                break
        print()


def main():
    parser = argparse.ArgumentParser(
        description='Compare UT fuzz test results with World Generator canonical tests'
    )
    parser.add_argument('--ut-fuzz', type=str,
                        help='Path to UT fuzz test results JSON')
    parser.add_argument('--worldgen', type=str,
                        help='Path to World Generator canonical test results JSON')

    args = parser.parse_args()

    # Find project root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))

    # Default paths
    ut_fuzz_path = args.ut_fuzz
    if not ut_fuzz_path:
        ut_fuzz_path = os.path.join(project_root, 'scripts/output/ut-fuzz/test-results-worldgen-fixed-seed.json')
    elif not os.path.isabs(ut_fuzz_path):
        ut_fuzz_path = os.path.join(project_root, ut_fuzz_path)

    worldgen_path = args.worldgen
    if not worldgen_path:
        worldgen_path = os.path.join(project_root, 'scripts/output/world-generator/test-results-canonical.json')
    elif not os.path.isabs(worldgen_path):
        worldgen_path = os.path.join(project_root, worldgen_path)

    # Check files exist
    if not os.path.exists(ut_fuzz_path):
        print(f"Error: UT fuzz results file not found: {ut_fuzz_path}")
        return 1

    if not os.path.exists(worldgen_path):
        print(f"Error: WorldGen results file not found: {worldgen_path}")
        return 1

    # Load results
    ut_fuzz_data = load_results(ut_fuzz_path)
    worldgen_data = load_results(worldgen_path)

    if not ut_fuzz_data or not worldgen_data:
        return 1

    # Extract game results
    ut_fuzz_games = extract_ut_fuzz_results(ut_fuzz_data)
    worldgen_games = extract_worldgen_results(worldgen_data)

    # Compare
    comparison = compare_results(ut_fuzz_games, worldgen_games)

    # Print report
    print_comparison(
        comparison,
        ut_fuzz_data.get('metadata', {}),
        worldgen_data.get('metadata', {})
    )

    return 0


if __name__ == '__main__':
    sys.exit(main())
