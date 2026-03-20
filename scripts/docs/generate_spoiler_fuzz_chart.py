#!/usr/bin/env python3
"""
Script to generate charts from Spoiler Fuzz test results.

This script reads spoiler fuzz test results from JSON files and generates
markdown reports showing the fuzz test status for each game template.

The spoiler fuzz test validates that randomized game configurations can
successfully complete the frontend spoiler playthrough test.
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, cast

# Add parent directory to path to import from chart_generators and lib
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))
from chart_generators.utils import format_file_size, get_rules_json_size
from lib.test_utils import load_template_exclude_list


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load the spoiler fuzz test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading results file {results_file}: {e}")
        return {}


def load_world_mapping(project_root: str) -> Dict[str, Dict[str, Any]]:
    """
    Load the world mapping from JSON files.

    Loads both world-mapping.json (official/bundled worlds) and
    world-mapping-unofficial.json (apworlds) if they exist.
    """
    mapping = {}

    # Load official world mapping
    official_file = os.path.join(project_root, 'scripts/data/world-mapping.json')
    try:
        with open(official_file, 'r') as f:
            mapping = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load official world mapping file {official_file}: {e}")

    # Load unofficial world mapping (apworlds) and merge
    unofficial_file = os.path.join(project_root, 'scripts/data/world-mapping-unofficial.json')
    try:
        with open(unofficial_file, 'r') as f:
            unofficial_mapping = json.load(f)
            mapping.update(unofficial_mapping)
            print(f"Loaded {len(unofficial_mapping)} entries from unofficial world mapping")
    except FileNotFoundError:
        pass
    except json.JSONDecodeError as e:
        print(f"Warning: Could not parse unofficial world mapping file {unofficial_file}: {e}")

    return mapping


def extract_spoiler_fuzz_chart_data(results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract spoiler fuzz test chart data from results.

    Returns list of dicts with:
        - game_name: str
        - world_directory: str
        - passed: bool
        - total: int
        - success: int
        - generation_failure: int
        - test_failure: int
        - timeout: int
        - success_rate: float
        - errors: list
    """
    chart_data = []

    if 'results' not in results:
        return chart_data

    for template_filename, template_data in results['results'].items():
        world_info = template_data.get('world_info', {})
        game_name = world_info.get('game_name')
        world_directory = world_info.get('world_directory')

        if not game_name:
            game_name = template_filename.replace('.yaml', '').replace('_', ' ').title()

        spoiler_fuzz = template_data.get('spoiler_fuzz', {})
        passed = spoiler_fuzz.get('passed', False)
        total = spoiler_fuzz.get('total', 0)
        success = spoiler_fuzz.get('success', 0)
        generation_failure = spoiler_fuzz.get('generation_failure', 0)
        test_failure = spoiler_fuzz.get('test_failure', 0)
        timeout = spoiler_fuzz.get('timeout', 0)
        errors = spoiler_fuzz.get('errors', [])

        success_rate = (success / total * 100) if total > 0 else 0

        chart_data.append({
            'game_name': game_name,
            'template_file': template_filename,
            'world_directory': world_directory,
            'passed': passed,
            'total': total,
            'success': success,
            'generation_failure': generation_failure,
            'test_failure': test_failure,
            'timeout': timeout,
            'success_rate': success_rate,
            'errors': errors
        })

    chart_data.sort(key=lambda x: x['game_name'])
    return chart_data


def generate_spoiler_fuzz_markdown(chart_data: List[Dict[str, Any]],
                                    metadata: Dict[str, Any],
                                    world_mapping: Dict[str, Dict[str, Any]],
                                    project_root: Optional[str] = None,
                                    world_source: str = "bundled",
                                    excluded_games: Optional[Dict[str, str]] = None) -> str:
    """
    Generate a markdown table for spoiler fuzz test data.

    Args:
        chart_data: List of test result data dicts
        metadata: Metadata from the test results
        world_mapping: Full world mapping dict with game info
        project_root: Project root path for looking up rules.json sizes
        world_source: Source of worlds (bundled or apworlds)
        excluded_games: Dict mapping template names to exclusion reasons
    """
    # Determine seed info
    seed = metadata.get('seed', 'random')
    seed_display = f"Fixed (seed={seed})" if seed != 'random' else "Random"

    # Title
    title_suffix = " (APWorlds)" if world_source == "apworlds" else ""
    md_content = f"# Spoiler Fuzz Test Results{title_suffix}\n\n"

    # Add navigation links
    if world_source == "apworlds":
        md_content += "[<- Back to Fuzz Summary](./test-results-fuzz-summary-apworlds.md) | "
    else:
        md_content += "[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | "
    md_content += "[Main Test Results](./test-results-summary.md)\n\n"

    md_content += "[📖 Learn about fuzz tests](../tests/test-fuzz.md)\n\n"

    if metadata:
        md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"
        md_content += f"**Seed Mode:** {seed_display}\n\n"
        md_content += f"**Runs Per Game:** {metadata.get('runs_per_game', 'Unknown')}\n\n"
        md_content += f"**Generation Timeout:** {metadata.get('generation_timeout', 'Unknown')}s\n\n"
        md_content += f"**Test Timeout:** {metadata.get('test_timeout', 'Unknown')}s\n\n"

    if chart_data:
        total_games = len(chart_data)
        passed = sum(1 for d in chart_data if d['passed'])
        failed = total_games - passed

        total_runs = sum(d['total'] for d in chart_data)
        total_success = sum(d['success'] for d in chart_data)
        total_gen_failure = sum(d['generation_failure'] for d in chart_data)
        total_test_failure = sum(d['test_failure'] for d in chart_data)
        total_timeout = sum(d['timeout'] for d in chart_data)

        overall_success_rate = (total_success / total_runs * 100) if total_runs > 0 else 0

        md_content += "## Summary\n\n"
        md_content += f"- **Total Games:** {total_games}\n"
        md_content += f"- **Games with 100% Pass Rate:** {passed} ({passed/total_games*100:.1f}%)\n"
        md_content += f"- **Games with Failures:** {failed} ({failed/total_games*100:.1f}%)\n"
        md_content += f"- **Total Fuzz Runs:** {total_runs}\n"
        md_content += f"- **Successful Runs:** {total_success} ({overall_success_rate:.1f}%)\n"
        md_content += f"- **Generation Failures:** {total_gen_failure}\n"
        md_content += f"- **Test Failures:** {total_test_failure}\n"
        md_content += f"- **Timed Out Runs:** {total_timeout}\n\n"

    md_content += "## Test Results\n\n"

    md_content += "| Game Name | Result | Total | Success | Gen Fail | Test Fail | Timeout | Success Rate | Rules Size |\n"
    md_content += "|-----------|:------:|:-----:|:-------:|:--------:|:---------:|:-------:|:------------:|:----------:|\n"

    for data in chart_data:
        game_name = data['game_name']
        template_file = data.get('template_file', '')
        game_display = f"*{game_name}*" if excluded_games and template_file in excluded_games else game_name
        world_dir = data.get('world_directory')

        passed = data['passed']
        total = data['total']
        success = data['success']
        gen_failure = data['generation_failure']
        test_failure = data['test_failure']
        timeout = data['timeout']
        success_rate = data['success_rate']

        # Test result: green checkmark or red X
        result_display = "✅" if passed else "❌"

        # Success rate with color coding
        if success_rate == 100:
            rate_display = f"**{success_rate:.1f}%**"
        elif success_rate >= 90:
            rate_display = f"{success_rate:.1f}%"
        elif success_rate >= 50:
            rate_display = f"⚠️ {success_rate:.1f}%"
        else:
            rate_display = f"❌ {success_rate:.1f}%"

        # Get rules.json size
        rules_size_indicator = "N/A"
        if project_root and world_dir:
            rules_size = get_rules_json_size(project_root, world_dir)
            if rules_size > 0:
                rules_size_indicator = f"{rules_size / 1024:.1f}KB"

        md_content += f"| {game_display} | {result_display} | {total} | {success} | {gen_failure} | {test_failure} | {timeout} | {rate_display} | {rules_size_indicator} |\n"

    if not chart_data:
        md_content += "| No data available | - | - | - | - | - | - | - | - |\n"

    # Add Excluded Templates section if data exists
    if excluded_games:
        md_content += "\n## Excluded Templates\n\n"
        md_content += "These templates are excluded from testing:\n\n"
        md_content += "| Template | Reason |\n"
        md_content += "|----------|--------|\n"
        for game, reason in sorted(excluded_games.items()):
            md_content += f"| {game} | {reason} |\n"

    md_content += "\n## Notes\n\n"
    if excluded_games:
        md_content += "- *Italic game names* are in the exclude list for this test type\n"
    md_content += "- **Result:** ✅ if all fuzz runs passed (0 failures, 0 timeouts), ❌ otherwise\n"
    md_content += "- **Total:** Number of fuzz runs attempted for this game\n"
    md_content += "- **Success:** Number of runs where spoiler test completed successfully\n"
    md_content += "- **Gen Fail:** Number of runs where seed generation failed\n"
    md_content += "- **Test Fail:** Number of runs where spoiler test failed\n"
    md_content += "- **Timeout:** Number of runs that exceeded the time limit\n"
    md_content += "- **Success Rate:** Percentage of successful runs\n"
    md_content += "- **Rules Size:** File size of rules.json for seed 1 (N/A if not generated)\n"
    md_content += "\n"

    md_content += "### About This Test\n\n"
    md_content += "The spoiler fuzz test validates game configurations by:\n"
    md_content += "1. Generating random game configurations (YAML options) using the fuzzer\n"
    md_content += "2. Creating an Archipelago seed with those options\n"
    md_content += "3. Exporting the seed to JSON rules\n"
    md_content += "4. Running the frontend spoiler playthrough test\n\n"
    md_content += "Failures indicate that certain option combinations cause issues with either "
    md_content += "seed generation or the frontend spoiler test playthrough.\n"

    return md_content


def find_result_files(results_dir: str) -> List[str]:
    """
    Find all spoiler fuzz result files in the results directory.

    Looks for files matching patterns:
    - test-results-{world_source}-{seed_type}-seed.json (with world_source)
    - test-results-{seed_type}-seed.json (bundled worlds format)
    """
    result_files = []

    # Match all test-results-*-seed.json files
    pattern = os.path.join(results_dir, 'test-results-*-seed.json')
    for f in glob.glob(pattern):
        basename = os.path.basename(f)
        # Skip split files (used during workflow, not final results)
        if '-split-' in basename:
            continue
        result_files.append(f)

    return sorted(result_files)


def get_output_filename(results_path: str) -> str:
    """
    Generate output markdown filename based on results file.

    Examples:
    - test-results-apworlds-fixed-seed.json -> test-results-spoiler-fuzz-apworlds.md
    - test-results-fixed-seed.json -> test-results-spoiler-fuzz.md
    """
    basename = os.path.basename(results_path)
    parts = basename.replace('.json', '').split('-')

    # Format with world_source: test-results-{world_source}-{seed_type}-seed
    if len(parts) == 5:  # ['test', 'results', 'apworlds', 'fixed', 'seed']
        world_source = parts[2]
        return f'test-results-spoiler-fuzz-{world_source}.md'
    else:
        # Bundled format: test-results-{seed_type}-seed
        return 'test-results-spoiler-fuzz.md'


def main():
    parser = argparse.ArgumentParser(description='Generate spoiler fuzz test results chart')
    parser.add_argument('--results', type=str,
                        help='Path to test results JSON (if not specified, processes all found files)')
    parser.add_argument('--output', type=str,
                        help='Output markdown file path')

    args = parser.parse_args()

    # Script is at scripts/docs/generate_spoiler_fuzz_chart.py, go up 2 levels to reach project root
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

    # Load world mapping
    world_mapping = load_world_mapping(project_root)

    # Load exclude lists
    # For bundled games: use 'main' (same as test-all-templates.py)
    # For apworlds: use 'ut_fuzz_apworld'
    excluded_list_bundled = cast(List[Dict[str, str]], load_template_exclude_list(project_root, include_reasons=True, test_type='main', skip_worldgen_variants=True))
    excluded_games_bundled = {item['name']: item['reason'] for item in excluded_list_bundled}

    excluded_list_apworld = cast(List[Dict[str, str]], load_template_exclude_list(project_root, include_reasons=True, test_type='ut_fuzz_apworld'))
    excluded_games_apworld = {item['name']: item['reason'] for item in excluded_list_apworld}

    # Output directory
    output_dir = os.path.join(project_root, 'docs/json/developer/test-results')
    os.makedirs(output_dir, exist_ok=True)

    # Find result files
    results_dir = os.path.join(project_root, 'scripts/output/spoiler-fuzz')

    if args.results:
        # Single file mode
        results_path = os.path.join(project_root, args.results) if not os.path.isabs(args.results) else args.results
        result_files = [results_path]
    else:
        # Find all result files
        result_files = find_result_files(results_dir)

    if not result_files:
        print(f"No result files found in {results_dir}")
        return 0  # Not an error, just no results to process

    # Process each result file
    for results_path in result_files:
        if not os.path.exists(results_path):
            print(f"Warning: Results file not found: {results_path}")
            continue

        results = load_test_results(results_path)
        if not results:
            print(f"Warning: Failed to load results from {results_path}")
            continue

        metadata = results.get('metadata', {})
        chart_data = extract_spoiler_fuzz_chart_data(results)

        # Determine world_source from filename or metadata
        basename = os.path.basename(results_path)
        parts = basename.replace('.json', '').split('-')

        if len(parts) == 5:  # test-results-{world_source}-{seed_type}-seed
            world_source = parts[2]
        else:
            world_source = metadata.get('world_source', 'bundled')

        # Select appropriate exclude list based on world_source
        excluded_games = excluded_games_apworld if world_source == "apworlds" else excluded_games_bundled

        # Generate markdown
        md_content = generate_spoiler_fuzz_markdown(
            chart_data, metadata, world_mapping, project_root, world_source, excluded_games
        )

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
