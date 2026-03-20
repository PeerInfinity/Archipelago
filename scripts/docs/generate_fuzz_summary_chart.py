#!/usr/bin/env python3
"""
Script to generate a summary chart combining all fuzz test results.

This script reads fuzz test results from multiple sources and generates
a unified summary markdown showing pass/fail status across:
- Javascript (frontend spoiler playthrough)
- UT Fuzz Original
- UT Fuzz Original Seeded
- UT Fuzz Worldgen
- UT Fuzz Pickle
- UT Fuzz Hybrid
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# Add parent directory to path to import from chart_generators and lib
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))
from chart_generators.utils import format_file_size, get_rules_json_size


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load {results_file}: {e}")
        return {}


def load_world_mapping(project_root: str) -> Dict[str, Dict[str, Any]]:
    """Load the world mapping from JSON files."""
    mapping = {}

    # Load official world mapping
    official_file = os.path.join(project_root, 'scripts/data/world-mapping.json')
    try:
        with open(official_file, 'r') as f:
            mapping = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load official world mapping: {e}")

    # Load unofficial world mapping (apworlds) and merge
    unofficial_file = os.path.join(project_root, 'scripts/data/world-mapping-unofficial.json')
    try:
        with open(unofficial_file, 'r') as f:
            unofficial_mapping = json.load(f)
            mapping.update(unofficial_mapping)
    except FileNotFoundError:
        pass
    except json.JSONDecodeError as e:
        print(f"Warning: Could not parse unofficial world mapping: {e}")

    return mapping


def extract_ut_fuzz_results(results: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Extract game results from UT fuzz test data.

    Returns dict mapping game_name -> {passed, success_rate, total, success, failure, timeout}
    """
    game_results = {}

    if 'results' not in results:
        return game_results

    for template_filename, template_data in results['results'].items():
        world_info = template_data.get('world_info', {})
        game_name = world_info.get('game_name')

        if not game_name:
            game_name = template_filename.replace('.yaml', '').replace('_', ' ').title()

        ut_fuzz = template_data.get('ut_fuzz', {})
        passed = ut_fuzz.get('passed', False)
        total = ut_fuzz.get('total', 0)
        success = ut_fuzz.get('success', 0)
        failure = ut_fuzz.get('failure', 0)
        timeout = ut_fuzz.get('timeout', 0)

        success_rate = (success / total * 100) if total > 0 else 0

        game_results[game_name] = {
            'passed': passed,
            'success_rate': success_rate,
            'total': total,
            'success': success,
            'failure': failure,
            'timeout': timeout
        }

    return game_results


def extract_spoiler_fuzz_results(results: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """
    Extract game results from spoiler fuzz test data.

    Returns dict mapping game_name -> {passed, success_rate, total, success, generation_failure, test_failure, timeout}
    """
    game_results = {}

    if 'results' not in results:
        return game_results

    for template_filename, template_data in results['results'].items():
        world_info = template_data.get('world_info', {})
        game_name = world_info.get('game_name')

        if not game_name:
            game_name = template_filename.replace('.yaml', '').replace('_', ' ').title()

        spoiler_fuzz = template_data.get('spoiler_fuzz', {})
        passed = spoiler_fuzz.get('passed', False)
        total = spoiler_fuzz.get('total', 0)
        success = spoiler_fuzz.get('success', 0)
        generation_failure = spoiler_fuzz.get('generation_failure', 0)
        test_failure = spoiler_fuzz.get('test_failure', 0)
        timeout = spoiler_fuzz.get('timeout', 0)

        success_rate = (success / total * 100) if total > 0 else 0

        game_results[game_name] = {
            'passed': passed,
            'success_rate': success_rate,
            'total': total,
            'success': success,
            'generation_failure': generation_failure,
            'test_failure': test_failure,
            'timeout': timeout
        }

    return game_results


def format_result_cell(result: Optional[Dict[str, Any]]) -> str:
    """Format a result as a table cell.

    Rate = success / (success + failure), ignoring timeouts.
    100% -> ✅, 0% -> ❌, in between -> fraction with indicator.
    Spoiler fuzz uses generation_failure + test_failure as the failure count.
    """
    if result is None:
        return "—"

    if result['passed']:
        return "✅"

    success = result.get('success', 0)
    failure = result.get('failure', result.get('generation_failure', 0) + result.get('test_failure', 0))
    counted = success + failure

    if counted == 0:
        return "❌"

    rate = success / counted * 100
    if rate == 0.0:
        return "❌"
    elif rate >= 90:
        return f"⚠️ {success}/{counted}"
    elif rate >= 50:
        return f"🔶 {success}/{counted}"
    else:
        return f"❌ {success}/{counted}"


def generate_fuzz_summary_markdown(
    ut_original: Dict[str, Dict[str, Any]],
    ut_original_seeded: Dict[str, Dict[str, Any]],
    ut_worldgen: Dict[str, Dict[str, Any]],
    ut_pickle: Dict[str, Dict[str, Any]],
    ut_hybrid: Dict[str, Dict[str, Any]],
    spoiler_fuzz: Dict[str, Dict[str, Any]],
    world_mapping: Dict[str, Dict[str, Any]],
    project_root: str,
    world_source: str = "bundled",
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """Generate the fuzz summary markdown content."""

    # Get all unique game names across all test types
    all_games = sorted(set(
        list(ut_original.keys()) +
        list(ut_original_seeded.keys()) +
        list(ut_worldgen.keys()) +
        list(ut_pickle.keys()) +
        list(ut_hybrid.keys()) +
        list(spoiler_fuzz.keys())
    ))

    # Title
    title_suffix = " (APWorlds)" if world_source == "apworlds" else ""
    md_content = f"# Fuzz Test Results Summary{title_suffix}\n\n"

    md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    # Add source data metadata if available
    if metadata and ('created' in metadata or 'last_updated' in metadata):
        if 'created' in metadata:
            md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        if 'last_updated' in metadata:
            md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"

    # Navigation links
    md_content += "[<- Back to Main Test Results Summary](./test-results-summary.md)\n\n"

    if world_source == "apworlds":
        md_content += "[View Bundled Worlds Fuzz Results](./test-results-fuzz-summary.md)\n\n"
    else:
        md_content += "[View APWorlds Fuzz Results](./test-results-fuzz-summary-apworlds.md)\n\n"

    md_content += "[📖 Learn about fuzz tests](../tests/test-fuzz.md)\n\n"

    # Description
    md_content += "This summary combines results from fuzz tests that validate game configurations "
    md_content += "across randomized option combinations:\n\n"

    # Links to individual test docs
    if world_source == "apworlds":
        md_content += "- **Javascript:** Frontend spoiler playthrough fuzz tests - [View Details](./test-results-spoiler-fuzz-apworlds.md)\n"
        md_content += "- **UT Fuzz Original:** Universal Tracker (original) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-original.md)\n"
        md_content += "- **UT Fuzz Orig Seeded:** Universal Tracker (original with seed) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-original_seeded.md)\n"
        md_content += "- **UT Fuzz Worldgen:** Universal Tracker (worldgen-based) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-worldgen.md)\n"
        md_content += "- **UT Fuzz Pickle:** Universal Tracker (pickle) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-pickle.md)\n"
        md_content += "- **UT Fuzz Hybrid:** Universal Tracker (hybrid) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-hybrid.md)\n\n"
    else:
        md_content += "- **Javascript:** Frontend spoiler playthrough fuzz tests - [View Details](./test-results-spoiler-fuzz.md)\n"
        md_content += "- **UT Fuzz Original:** Universal Tracker (original) fuzz tests - [View Details](./test-results-ut-fuzz-original.md)\n"
        md_content += "- **UT Fuzz Orig Seeded:** Universal Tracker (original with seed) fuzz tests - [View Details](./test-results-ut-fuzz-original_seeded.md)\n"
        md_content += "- **UT Fuzz Worldgen:** Universal Tracker (worldgen-based) fuzz tests - [View Details](./test-results-ut-fuzz-worldgen.md)\n"
        md_content += "- **UT Fuzz Pickle:** Universal Tracker (pickle) fuzz tests - [View Details](./test-results-ut-fuzz-pickle.md)\n"
        md_content += "- **UT Fuzz Hybrid:** Universal Tracker (hybrid) fuzz tests - [View Details](./test-results-ut-fuzz-hybrid.md)\n\n"

    # Summary statistics
    md_content += "## Summary Statistics\n\n"

    # Count passes for each test type
    spoiler_passed = sum(1 for g in spoiler_fuzz.values() if g['passed'])
    ut_original_passed = sum(1 for g in ut_original.values() if g['passed'])
    ut_original_seeded_passed = sum(1 for g in ut_original_seeded.values() if g['passed'])
    ut_worldgen_passed = sum(1 for g in ut_worldgen.values() if g['passed'])
    ut_pickle_passed = sum(1 for g in ut_pickle.values() if g['passed'])
    ut_hybrid_passed = sum(1 for g in ut_hybrid.values() if g['passed'])

    spoiler_total = len(spoiler_fuzz)
    ut_original_total = len(ut_original)
    ut_original_seeded_total = len(ut_original_seeded)
    ut_worldgen_total = len(ut_worldgen)
    ut_pickle_total = len(ut_pickle)
    ut_hybrid_total = len(ut_hybrid)

    md_content += "### Individual Test Results\n\n"
    if spoiler_total > 0:
        md_content += f"- **Javascript:** {spoiler_passed}/{spoiler_total} passed ({spoiler_passed/spoiler_total*100:.1f}%)\n"
    else:
        md_content += "- **Javascript:** No results available\n"

    if ut_original_total > 0:
        md_content += f"- **UT Fuzz Original:** {ut_original_passed}/{ut_original_total} passed ({ut_original_passed/ut_original_total*100:.1f}%)\n"
    else:
        md_content += "- **UT Fuzz Original:** No results available\n"

    if ut_original_seeded_total > 0:
        md_content += f"- **UT Fuzz Orig Seeded:** {ut_original_seeded_passed}/{ut_original_seeded_total} passed ({ut_original_seeded_passed/ut_original_seeded_total*100:.1f}%)\n"
    else:
        md_content += "- **UT Fuzz Orig Seeded:** No results available\n"

    if ut_worldgen_total > 0:
        md_content += f"- **UT Fuzz Worldgen:** {ut_worldgen_passed}/{ut_worldgen_total} passed ({ut_worldgen_passed/ut_worldgen_total*100:.1f}%)\n"
    else:
        md_content += "- **UT Fuzz Worldgen:** No results available\n"

    if ut_pickle_total > 0:
        md_content += f"- **UT Fuzz Pickle:** {ut_pickle_passed}/{ut_pickle_total} passed ({ut_pickle_passed/ut_pickle_total*100:.1f}%)\n"
    else:
        md_content += "- **UT Fuzz Pickle:** No results available\n"

    if ut_hybrid_total > 0:
        md_content += f"- **UT Fuzz Hybrid:** {ut_hybrid_passed}/{ut_hybrid_total} passed ({ut_hybrid_passed/ut_hybrid_total*100:.1f}%)\n"
    else:
        md_content += "- **UT Fuzz Hybrid:** No results available\n"

    md_content += "\n"

    # Combined results - all 6 tests
    md_content += "### Combined Results (All 6 Tests)\n\n"

    # Count games passing different numbers of tests (all 6)
    passing_counts_all = {6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0}
    for game in all_games:
        passes = 0
        if game in spoiler_fuzz and spoiler_fuzz[game]['passed']:
            passes += 1
        if game in ut_original and ut_original[game]['passed']:
            passes += 1
        if game in ut_original_seeded and ut_original_seeded[game]['passed']:
            passes += 1
        if game in ut_worldgen and ut_worldgen[game]['passed']:
            passes += 1
        if game in ut_pickle and ut_pickle[game]['passed']:
            passes += 1
        if game in ut_hybrid and ut_hybrid[game]['passed']:
            passes += 1
        passing_counts_all[passes] += 1

    total_games = len(all_games)
    if total_games > 0:
        md_content += f"- **Games passing all 6 fuzz tests:** {passing_counts_all[6]}/{total_games} ({passing_counts_all[6]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 5 fuzz tests:** {passing_counts_all[5]}/{total_games} ({passing_counts_all[5]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 4 fuzz tests:** {passing_counts_all[4]}/{total_games} ({passing_counts_all[4]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 3 fuzz tests:** {passing_counts_all[3]}/{total_games} ({passing_counts_all[3]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 2 fuzz tests:** {passing_counts_all[2]}/{total_games} ({passing_counts_all[2]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 1 fuzz test:** {passing_counts_all[1]}/{total_games} ({passing_counts_all[1]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 0 fuzz tests:** {passing_counts_all[0]}/{total_games} ({passing_counts_all[0]/total_games*100:.1f}%)\n"

    md_content += "\n"

    # Combined results - excluding UT Original and UT Orig Seeded (4 tests)
    md_content += "### Combined Results (Excluding UT Original/Orig Seeded)\n\n"
    md_content += "This view excludes UT Original and UT Orig Seeded, showing results for Javascript, UT Worldgen, UT Pickle, and UT Hybrid.\n\n"

    # Count games passing different numbers of tests (excluding UT Original and Orig Seeded)
    passing_counts_no_orig = {4: 0, 3: 0, 2: 0, 1: 0, 0: 0}
    for game in all_games:
        passes = 0
        if game in spoiler_fuzz and spoiler_fuzz[game]['passed']:
            passes += 1
        if game in ut_worldgen and ut_worldgen[game]['passed']:
            passes += 1
        if game in ut_pickle and ut_pickle[game]['passed']:
            passes += 1
        if game in ut_hybrid and ut_hybrid[game]['passed']:
            passes += 1
        passing_counts_no_orig[passes] += 1

    if total_games > 0:
        md_content += f"- **Games passing all 4 fuzz tests:** {passing_counts_no_orig[4]}/{total_games} ({passing_counts_no_orig[4]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 3 fuzz tests:** {passing_counts_no_orig[3]}/{total_games} ({passing_counts_no_orig[3]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 2 fuzz tests:** {passing_counts_no_orig[2]}/{total_games} ({passing_counts_no_orig[2]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 1 fuzz test:** {passing_counts_no_orig[1]}/{total_games} ({passing_counts_no_orig[1]/total_games*100:.1f}%)\n"
        md_content += f"- **Games passing 0 fuzz tests:** {passing_counts_no_orig[0]}/{total_games} ({passing_counts_no_orig[0]/total_games*100:.1f}%)\n"

    md_content += "\n"

    # Main results table
    md_content += "## Test Results\n\n"

    # Build header with links - order: Javascript, UT Original, UT Orig Seeded, UT Worldgen, UT Pickle, UT Hybrid, Rules Size
    if world_source == "apworlds":
        md_content += "| Game Name | [Javascript](./test-results-spoiler-fuzz-apworlds.md) | [UT Original](./test-results-ut-fuzz-apworlds-original.md) | [UT Orig Seeded](./test-results-ut-fuzz-apworlds-original_seeded.md) | [UT Worldgen](./test-results-ut-fuzz-apworlds-worldgen.md) | [UT Pickle](./test-results-ut-fuzz-apworlds-pickle.md) | [UT Hybrid](./test-results-ut-fuzz-apworlds-hybrid.md) | Rules Size |\n"
    else:
        md_content += "| Game Name | [Javascript](./test-results-spoiler-fuzz.md) | [UT Original](./test-results-ut-fuzz-original.md) | [UT Orig Seeded](./test-results-ut-fuzz-original_seeded.md) | [UT Worldgen](./test-results-ut-fuzz-worldgen.md) | [UT Pickle](./test-results-ut-fuzz-pickle.md) | [UT Hybrid](./test-results-ut-fuzz-hybrid.md) | Rules Size |\n"

    md_content += "|-----------|:----------:|:------------:|:--------------:|:------------:|:----------:|:----------:|:----------:|\n"

    for game in all_games:
        spoiler_result = spoiler_fuzz.get(game)
        ut_orig_result = ut_original.get(game)
        ut_orig_seeded_result = ut_original_seeded.get(game)
        ut_mod_result = ut_worldgen.get(game)
        ut_pickle_result = ut_pickle.get(game)
        ut_hyb_result = ut_hybrid.get(game)

        spoiler_cell = format_result_cell(spoiler_result)
        ut_orig_cell = format_result_cell(ut_orig_result)
        ut_orig_seeded_cell = format_result_cell(ut_orig_seeded_result)
        ut_mod_cell = format_result_cell(ut_mod_result)
        ut_pickle_cell = format_result_cell(ut_pickle_result)
        ut_hyb_cell = format_result_cell(ut_hyb_result)

        # Get rules size
        rules_size_indicator = "N/A"
        if game in world_mapping:
            world_dir = world_mapping[game].get('world_directory')
            if project_root and world_dir:
                rules_size = get_rules_json_size(project_root, world_dir)
                if rules_size > 0:
                    rules_size_indicator = f"{rules_size / 1024:.1f}KB"

        md_content += f"| {game} | {spoiler_cell} | {ut_orig_cell} | {ut_orig_seeded_cell} | {ut_mod_cell} | {ut_pickle_cell} | {ut_hyb_cell} | {rules_size_indicator} |\n"

    if not all_games:
        md_content += "| No data available | — | — | — | — | — | — | — |\n"

    # Notes section
    md_content += "\n## Notes\n\n"
    md_content += "- **✅:** All fuzz runs passed\n"
    md_content += "- **⚠️ X/Y:** Most runs passed (90-99%, shown as passes/total)\n"
    md_content += "- **🔶 X/Y:** Some runs passed (50-89%, shown as passes/total)\n"
    md_content += "- **❌ X/Y:** Most runs failed (<50%, shown as passes/total)\n"
    md_content += "- **❌:** No runs passed\n"
    md_content += "- **—:** No test results available for this game\n"
    md_content += "- **Rules Size:** File size of rules.json for seed 1\n\n"

    md_content += "### About Fuzz Tests\n\n"
    md_content += "Fuzz tests validate game configurations by generating random YAML option combinations "
    md_content += "and running various tests:\n\n"
    md_content += "- **Javascript:** Tests frontend spoiler playthrough with randomized configurations\n"
    md_content += "- **UT Fuzz:** Tests Universal Tracker's accessibility calculations against Python's sphere log\n"
    md_content += "  - **Original:** Uses native game integration (random internal seed)\n"
    md_content += "  - **Orig Seeded:** Uses native game integration with the actual generation seed number\n"
    md_content += "  - **Worldgen:** Uses worldgen-based tracking (regenerates from JSON rules)\n"
    md_content += "  - **Pickle:** Uses pickle-based tracking (loads serialized multiworld)\n"
    md_content += "  - **Hybrid:** Prefers native integration, falls back to worldgen\n"

    return md_content


def main():
    parser = argparse.ArgumentParser(description='Generate fuzz test summary chart')
    parser.add_argument('--output', type=str, help='Output markdown file path')
    parser.add_argument('--world-source', type=str, choices=['bundled', 'apworlds'],
                        default=None, help='World source to generate summary for (default: both)')

    args = parser.parse_args()

    # Get project root
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

    # Load world mapping
    world_mapping = load_world_mapping(project_root)

    # Output directory
    output_dir = os.path.join(project_root, 'docs/json/developer/test-results')
    os.makedirs(output_dir, exist_ok=True)

    # Process both bundled and apworlds if no specific source requested
    sources_to_process = [args.world_source] if args.world_source else ['bundled', 'apworlds']

    for world_source in sources_to_process:
        # Determine file paths based on world source
        ut_fuzz_dir = os.path.join(project_root, 'scripts/output/ut-fuzz')
        spoiler_fuzz_dir = os.path.join(project_root, 'scripts/output/spoiler-fuzz')

        if world_source == 'apworlds':
            ut_original_file = os.path.join(ut_fuzz_dir, 'test-results-apworlds-original-fixed-seed.json')
            ut_original_seeded_file = os.path.join(ut_fuzz_dir, 'test-results-apworlds-original_seeded-fixed-seed.json')
            ut_worldgen_file = os.path.join(ut_fuzz_dir, 'test-results-apworlds-worldgen-fixed-seed.json')
            ut_pickle_file = os.path.join(ut_fuzz_dir, 'test-results-apworlds-pickle-fixed-seed.json')
            ut_hybrid_file = os.path.join(ut_fuzz_dir, 'test-results-apworlds-hybrid-fixed-seed.json')
            spoiler_fuzz_file = os.path.join(spoiler_fuzz_dir, 'test-results-apworlds-fixed-seed.json')
            output_filename = 'test-results-fuzz-summary-apworlds.md'
        else:
            ut_original_file = os.path.join(ut_fuzz_dir, 'test-results-original-fixed-seed.json')
            ut_original_seeded_file = os.path.join(ut_fuzz_dir, 'test-results-original_seeded-fixed-seed.json')
            ut_worldgen_file = os.path.join(ut_fuzz_dir, 'test-results-worldgen-fixed-seed.json')
            ut_pickle_file = os.path.join(ut_fuzz_dir, 'test-results-pickle-fixed-seed.json')
            ut_hybrid_file = os.path.join(ut_fuzz_dir, 'test-results-hybrid-fixed-seed.json')
            spoiler_fuzz_file = os.path.join(spoiler_fuzz_dir, 'test-results-fixed-seed.json')
            output_filename = 'test-results-fuzz-summary.md'

        # Load results
        ut_original_data = load_test_results(ut_original_file)
        ut_original_seeded_data = load_test_results(ut_original_seeded_file)
        ut_worldgen_data = load_test_results(ut_worldgen_file)
        ut_pickle_data = load_test_results(ut_pickle_file)
        ut_hybrid_data = load_test_results(ut_hybrid_file)
        spoiler_fuzz_data = load_test_results(spoiler_fuzz_file)

        # Extract game-level results
        ut_original = extract_ut_fuzz_results(ut_original_data)
        ut_original_seeded = extract_ut_fuzz_results(ut_original_seeded_data)
        ut_worldgen = extract_ut_fuzz_results(ut_worldgen_data)
        ut_pickle = extract_ut_fuzz_results(ut_pickle_data)
        ut_hybrid = extract_ut_fuzz_results(ut_hybrid_data)
        spoiler_fuzz = extract_spoiler_fuzz_results(spoiler_fuzz_data)

        # Check if we have any data
        if not any([ut_original, ut_original_seeded, ut_worldgen, ut_pickle, ut_hybrid, spoiler_fuzz]):
            print(f"No fuzz test results found for {world_source}")
            continue

        # Generate markdown (use ut_worldgen metadata as primary source)
        metadata = ut_worldgen_data.get('metadata', {})
        md_content = generate_fuzz_summary_markdown(
            ut_original, ut_original_seeded, ut_worldgen, ut_pickle, ut_hybrid, spoiler_fuzz,
            world_mapping, project_root, world_source, metadata
        )

        # Determine output path
        if args.output and len(sources_to_process) == 1:
            output_path = os.path.join(project_root, args.output) if not os.path.isabs(args.output) else args.output
        else:
            output_path = os.path.join(output_dir, output_filename)

        # Write output
        with open(output_path, 'w') as f:
            f.write(md_content)

        print(f"Fuzz summary saved to: {output_path}")

    return 0


if __name__ == '__main__':
    exit(main())
