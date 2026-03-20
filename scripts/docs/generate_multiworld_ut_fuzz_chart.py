#!/usr/bin/env python3
"""
Script to generate charts from Multiworld UT Fuzzer Assembly test results.

This script reads multiworld UT fuzz test results from JSON files and generates
markdown reports showing which games successfully integrate into multiworld
configurations with random options.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

# Add parent directory to path to import from chart_generators
sys.path.insert(0, str(Path(__file__).parent))


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load the multiworld UT fuzz test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading results file {results_file}: {e}")
        return {}


def generate_markdown(results: Dict[str, Any]) -> str:
    """
    Generate markdown report from multiworld UT fuzz test results.

    Args:
        results: The full test results dict
    """
    metadata = results.get('metadata', {})
    assembly_order = results.get('assembly_order', [])
    final_multiworld = results.get('final_multiworld', [])
    rejected_games = results.get('rejected_games', [])
    test_results = results.get('results', {})

    # Header
    md_content = "# Multiworld UT Fuzz Assembly Test Results\n\n"

    # Navigation
    md_content += "[<- Back to Test Results Summary](./test-results-summary.md)\n\n"

    md_content += "[📖 Learn about this test](../tests/test-multiworld-ut-fuzz.md)\n\n"

    # Metadata
    md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    if metadata:
        md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"

        seed = metadata.get('seed', 'random')
        seed_display = f"Fixed (seed={seed})" if seed != 'random' else "Random"
        md_content += f"**Seed Mode:** {seed_display}\n\n"
        md_content += f"**Runs Per Test:** {metadata.get('runs_per_test', 'Unknown')}\n\n"
        md_content += f"**Max Players:** {metadata.get('max_players', 'Unknown')}\n\n"
        md_content += f"**Templates Considered:** {metadata.get('total_templates_considered', 'Unknown')}\n\n"

    # Summary
    md_content += "## Summary\n\n"

    total_tested = len(test_results)

    # Count statuses, but also check for all-generation-failures case
    passed_count = 0
    failed_count = 0
    pending_count = 0
    error_count = 0
    all_gen_failed_count = 0

    for r in test_results.values():
        status = r.get('status', 'unknown')
        test_result = r.get('test_result', {})

        # Check if all runs were generation failures
        # This can be indicated by the status or by checking the test_result data
        total_runs = test_result.get('total', 0)
        gen_failures = test_result.get('generation_failures', 0)
        all_gen_failed = (
            status == 'all_gen_failed' or
            (total_runs > 0 and gen_failures == total_runs)
        )

        if all_gen_failed:
            all_gen_failed_count += 1
        elif status == 'passed':
            passed_count += 1
        elif status == 'failed':
            failed_count += 1
        elif status == 'pending':
            pending_count += 1
        elif status == 'error':
            error_count += 1

    second_pass_count = sum(1 for r in test_results.values() if r.get('second_pass'))

    md_content += f"- **Total Games Tested:** {total_tested}\n"
    md_content += f"- **Games Passed:** {passed_count}\n"
    md_content += f"- **Games Failed:** {failed_count}\n"
    if all_gen_failed_count > 0:
        md_content += f"- **Games with All Generations Failed:** {all_gen_failed_count}\n"
    md_content += f"- **Games Pending (< 2 players):** {pending_count}\n"
    if error_count > 0:
        md_content += f"- **Games with Errors:** {error_count}\n"
    if second_pass_count > 0:
        md_content += f"- **Games Tested in Second Pass:** {second_pass_count}\n"
    md_content += f"- **Rejected Games:** {len(rejected_games)}\n\n"

    # Test Results Table
    md_content += "## Test Results\n\n"
    md_content += "| Game Name | World Dir | Player # | MW Size | Status | Success Rate |\n"
    md_content += "|-----------|-----------|:--------:|:-------:|:------:|:------------:|\n"

    # Sort by template name
    sorted_results = sorted(test_results.items(), key=lambda x: x[0])

    for template_name, data in sorted_results:
        game_name = data.get('game', template_name.replace('.yaml', ''))
        world_dir = data.get('world_dir', 'N/A')
        player_num = data.get('player_number', 'N/A')
        status = data.get('status', 'unknown')

        # Check if this game was tested in second pass
        second_pass = data.get('second_pass')
        if second_pass:
            # Use second pass data
            mw_size = second_pass.get('multiworld_size', data.get('multiworld_size', 'N/A'))
            test_result = second_pass.get('test_result', {})
            tested_in_second_pass = True
        else:
            mw_size = data.get('multiworld_size', 'N/A')
            test_result = data.get('test_result', {})
            tested_in_second_pass = False

        # Check if all runs were generation failures
        # This can be indicated by the status or by checking the test_result data
        total_runs = test_result.get('total', 0)
        gen_failures = test_result.get('generation_failures', 0)
        all_gen_failed = (
            status == 'all_gen_failed' or
            (total_runs > 0 and gen_failures == total_runs)
        )

        # Status display
        if all_gen_failed:
            status_display = "🔴 All Gen Failed"
        elif status == 'passed':
            status_display = "✅ Passed"
            if tested_in_second_pass:
                status_display += " (2nd)"
        elif status == 'failed':
            status_display = "❌ Failed"
            if tested_in_second_pass:
                status_display += " (2nd)"
        elif status == 'pending':
            status_display = "⏳ Pending"
        elif status == 'error':
            status_display = "⚠️ Error"
        else:
            status_display = status

        # Success rate
        if test_result and test_result.get('total', 0) > 0:
            total = test_result['total']
            success = test_result.get('success', 0)
            gen_fail = test_result.get('generation_failures', 0)

            if all_gen_failed:
                rate_display = f"🔴 0% (0/{total}, {gen_fail} gen fail)"
            elif gen_fail > 0:
                # Some generation failures
                rate = (success / total) * 100
                rate_display = f"{rate:.0f}% ({success}/{total}, {gen_fail} gen fail)"
            else:
                rate = (success / total) * 100
                if rate == 100:
                    rate_display = f"**{rate:.0f}%** ({success}/{total})"
                elif rate >= 50:
                    rate_display = f"⚠️ {rate:.0f}% ({success}/{total})"
                else:
                    rate_display = f"❌ {rate:.0f}% ({success}/{total})"
        elif status == 'pending':
            rate_display = "N/A"
        else:
            rate_display = "N/A"

        md_content += f"| {game_name} | {world_dir} | {player_num} | {mw_size} | {status_display} | {rate_display} |\n"

    # Successfully Integrated Games
    if assembly_order:
        md_content += "\n## Successfully Integrated Games\n\n"
        md_content += f"The following {len(assembly_order)} games successfully integrate into a multiworld:\n\n"
        md_content += "| # | World Directory | Game Name |\n"
        md_content += "|:-:|-----------------|----------|\n"

        for i, world_dir in enumerate(assembly_order, 1):
            # Find game name from results
            game_name = world_dir
            for template, data in test_results.items():
                if data.get('world_dir') == world_dir:
                    game_name = data.get('game', world_dir)
                    break
            md_content += f"| {i} | {world_dir} | {game_name} |\n"
        md_content += "\n"

    # Rejected Games
    if rejected_games:
        md_content += "\n## Rejected Games\n\n"
        md_content += "These games failed to integrate into the multiworld:\n\n"
        md_content += "| Game Name | World Directory | Reason | Details |\n"
        md_content += "|-----------|-----------------|--------|--------|\n"

        for rejection in rejected_games:
            game_name = rejection.get('game', rejection.get('template', 'Unknown'))
            world_dir = rejection.get('world_dir', 'N/A')
            reason = rejection.get('reason', 'Unknown')

            # Build details string
            details_parts = []
            if rejection.get('failures'):
                details_parts.append(f"{rejection['failures']}/{rejection.get('total', '?')} failures")

            details = ', '.join(details_parts) if details_parts else '-'

            md_content += f"| {game_name} | {world_dir} | {reason} | {details} |\n"
        md_content += "\n"

    # Detailed Run Results (for failed tests)
    failed_tests = [(t, d) for t, d in sorted_results
                    if d.get('status') == 'failed' and d.get('test_result', {}).get('run_results')]
    if failed_tests:
        md_content += "\n## Failed Test Details\n\n"

        for template_name, data in failed_tests:
            game_name = data.get('game', template_name.replace('.yaml', ''))
            test_result = data.get('test_result', {})
            run_results = test_result.get('run_results', [])

            md_content += f"### {game_name}\n\n"

            for run in run_results:
                seed = run.get('seed', 'Unknown')
                result = run.get('result', {})
                passed = result.get('passed', False)

                if not passed:
                    md_content += f"**Seed {seed}:** "
                    if result.get('error'):
                        md_content += f"Error - {result['error'][:100]}\n"
                    else:
                        # Check player results
                        player_results = result.get('player_results', {})
                        failed_players = [p for p, r in player_results.items()
                                         if not r.get('passed', False)]
                        if failed_players:
                            md_content += f"Players failed: {', '.join(failed_players)}\n"
                            for p in failed_players:
                                error = player_results[p].get('error', 'Unknown error')
                                if error:
                                    md_content += f"  - Player {p}: {error[:80]}\n"
                        else:
                            md_content += "Unknown failure\n"

            md_content += "\n"

    # Notes
    md_content += "## Notes\n\n"
    md_content += "- **Player #:** The player number this game was assigned in the multiworld\n"
    md_content += "- **MW Size:** Number of games in the multiworld when tested (may differ from player # due to second pass)\n"
    md_content += "- **Status:**\n"
    md_content += "  - ✅ Passed: All test runs succeeded\n"
    md_content += "  - ✅ Passed (2nd): Passed in second pass (tested with full multiworld)\n"
    md_content += "  - ❌ Failed: One or more validation failures (generation succeeded but validation failed)\n"
    md_content += "  - ❌ Failed (2nd): Failed in second pass\n"
    md_content += "  - 🔴 All Gen Failed: All generation attempts failed (could not generate multiworld)\n"
    md_content += "  - ⏳ Pending: Game added but not tested yet (need 2+ players)\n"
    md_content += "  - ⚠️ Error: Infrastructure error during testing\n"
    md_content += "- **Success Rate:** Percentage of test runs that passed\n\n"

    md_content += "### About This Test\n\n"
    md_content += "The Multiworld UT Fuzz Assembly test validates that games can coexist in a multiworld:\n\n"
    md_content += "1. Games are added one-by-one to a growing multiworld\n"
    md_content += "2. Each game uses randomly generated options (via fuzz.py)\n"
    md_content += "3. After adding a game, the full multiworld is generated multiple times\n"
    md_content += "4. Each player's victory condition is validated (can the game be completed?)\n"
    md_content += "5. If a player's victory condition fails, the game is removed from the multiworld\n"
    md_content += "6. **Second Pass:** Games added when there were fewer than 2 players are retested with the full multiworld\n\n"
    md_content += "This test catches issues where certain game combinations or option combinations "
    md_content += "cause problems in multiworld generation or sphere validation.\n"

    return md_content


def find_result_files(results_dir: str) -> List[str]:
    """Find all multiworld UT fuzz result files in the results directory."""
    import glob

    result_files = []
    pattern = os.path.join(results_dir, 'test-results-*.json')

    for f in glob.glob(pattern):
        basename = os.path.basename(f)
        # Skip split files
        if '-split-' in basename:
            continue
        result_files.append(f)

    return sorted(result_files)


def get_output_filename(results_path: str) -> str:
    """
    Generate output markdown filename based on results file.

    Examples:
    - test-results-fixed-seed.json -> test-results-multiworld-ut-fuzz.md
    - test-results-random-seed.json -> test-results-multiworld-ut-fuzz-random.md
    """
    basename = os.path.basename(results_path)

    if 'random' in basename:
        return 'test-results-multiworld-ut-fuzz-random.md'
    else:
        return 'test-results-multiworld-ut-fuzz.md'


def main():
    parser = argparse.ArgumentParser(description='Generate multiworld UT fuzz test results chart')
    parser.add_argument('--results', type=str,
                        help='Path to test results JSON (if not specified, processes all found files)')
    parser.add_argument('--output', type=str,
                        help='Output markdown file path')

    args = parser.parse_args()

    # Script is at scripts/docs/generate_multiworld_ut_fuzz_chart.py
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

    # Output directory
    output_dir = os.path.join(project_root, 'docs/json/developer/test-results')
    os.makedirs(output_dir, exist_ok=True)

    # Find result files
    results_dir = os.path.join(project_root, 'scripts/output/multiworld-ut-fuzz')

    if args.results:
        results_path = os.path.join(project_root, args.results) if not os.path.isabs(args.results) else args.results
        result_files = [results_path]
    else:
        result_files = find_result_files(results_dir)

    if not result_files:
        print(f"Error: No result files found in {results_dir}")
        return 1

    # Process each result file
    for results_path in result_files:
        if not os.path.exists(results_path):
            print(f"Warning: Results file not found: {results_path}")
            continue

        results = load_test_results(results_path)
        if not results:
            print(f"Warning: Failed to load results from {results_path}")
            continue

        # Generate markdown
        md_content = generate_markdown(results)

        # Determine output path
        if args.output and len(result_files) == 1:
            output_path = os.path.join(project_root, args.output) if not os.path.isabs(args.output) else args.output
        else:
            output_filename = get_output_filename(results_path)
            output_path = os.path.join(output_dir, output_filename)

        # Write output
        with open(output_path, 'w') as f:
            f.write(md_content)

        print(f"Chart saved to: {output_path} (from {os.path.basename(results_path)})")

    return 0


if __name__ == '__main__':
    exit(main())
