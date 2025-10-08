#!/usr/bin/env python3
"""
Script to generate a chart from test-results-multiplayer.json showing test results
for all game templates in multiplayer mode.
"""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Tuple


def load_test_results(results_file: str) -> Dict[str, Any]:
    """Load the template test results from JSON file."""
    try:
        with open(results_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Error loading results file {results_file}: {e}")
        return {}


def extract_chart_data(results: Dict[str, Any]) -> List[Tuple[str, str, int, int, int, bool, bool]]:
    """
    Extract chart data from results.
    Returns list of tuples: (game_name, pass_fail, gen_error_count, locations_checked, total_locations, has_custom_exporter, has_custom_game_logic)
    """
    chart_data = []

    if 'results' not in results:
        return chart_data

    # Handle both dict-based (new format) and list-based (old format) results
    results_data = results['results']
    if isinstance(results_data, dict):
        # New format: dictionary with template names as keys
        results_list = results_data.values()
    else:
        # Old format: list of results
        results_list = results_data

    for template_data in results_list:
        # Extract game name
        game_name = template_data.get('game_name', template_data.get('template_name', 'Unknown').replace('.yaml', ''))

        # Extract world info
        world_info = template_data.get('world_info', {})
        has_custom_exporter = world_info.get('has_custom_exporter', False)
        has_custom_game_logic = world_info.get('has_custom_game_logic', False)

        # Extract generation error count
        gen_error_count = template_data.get('generation', {}).get('error_count', 0)

        # Extract multiplayer test data
        multiplayer_test = template_data.get('multiplayer_test', {})
        success = multiplayer_test.get('success', False)
        locations_checked = multiplayer_test.get('locations_checked', 0)
        total_locations = multiplayer_test.get('total_locations', 0)

        # Determine pass/fail
        if success and gen_error_count == 0 and locations_checked == total_locations and total_locations > 0:
            pass_fail = 'Passed'
        else:
            pass_fail = 'Failed'

        chart_data.append((game_name, pass_fail, gen_error_count, locations_checked, total_locations, has_custom_exporter, has_custom_game_logic))

    # Sort by game name for consistent ordering
    chart_data.sort(key=lambda x: x[0])

    return chart_data


def generate_markdown_chart(chart_data: List[Tuple[str, str, int, int, int, bool, bool]],
                           metadata: Dict[str, Any]) -> str:
    """Generate a markdown table with the chart data."""

    # Header
    md_content = "# Archipelago Multiplayer Template Test Results Chart\n\n"

    # Add metadata
    timestamp = metadata.get('timestamp', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    test_type = metadata.get('test_type', 'Unknown')
    test_mode = metadata.get('test_mode', 'Unknown')
    seed = metadata.get('seed', 'Unknown')

    md_content += f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    md_content += f"**Test Timestamp:** {timestamp}\n\n"
    md_content += f"**Test Type:** {test_type}\n\n"
    md_content += f"**Test Mode:** {test_mode}\n\n"
    md_content += f"**Seed:** {seed}\n\n"

    # Summary statistics
    if chart_data:
        total_games = len(chart_data)
        passed = sum(1 for _, pass_fail, _, _, _, _, _ in chart_data
                    if 'passed' in pass_fail.lower())
        failed = sum(1 for _, pass_fail, _, _, _, _, _ in chart_data
                    if 'failed' in pass_fail.lower())
        unknown = total_games - passed - failed

        md_content += "## Summary\n\n"
        md_content += f"- **Total Games:** {total_games}\n"
        md_content += f"- **Passed:** {passed} ({passed/total_games*100:.1f}%)\n"
        md_content += f"- **Failed:** {failed} ({failed/total_games*100:.1f}%)\n"
        if unknown > 0:
            md_content += f"- **Unknown/Error:** {unknown} ({unknown/total_games*100:.1f}%)\n"
        md_content += "\n"

    # Table header
    md_content += "## Test Results\n\n"
    md_content += "| Game Name | Test Result | Gen Errors | Locations Checked | Total Locations | Progress | Custom Exporter | Custom GameLogic |\n"
    md_content += "|-----------|-------------|------------|-------------------|-----------------|----------|-----------------|------------------|\n"

    # Table rows
    for game_name, pass_fail, gen_error_count, locations_checked, total_locations, has_custom_exporter, has_custom_game_logic in chart_data:
        # Create a progress indicator based on locations checked
        if 'passed' in pass_fail.lower():
            progress = "🟢 Complete"
        elif locations_checked > 0 and total_locations > 0:
            progress_pct = (locations_checked / total_locations) * 100
            if progress_pct >= 75:
                progress = f"🟡 {progress_pct:.1f}%"
            elif progress_pct >= 25:
                progress = f"🟠 {progress_pct:.1f}%"
            else:
                progress = f"🔴 {progress_pct:.1f}%"
        elif locations_checked == 0:
            progress = "🔴 0.0%"
        else:
            progress = "❓ N/A"

        # Add status emoji to test result
        if pass_fail.lower() == 'passed':
            result_display = "✅ Passed"
        elif pass_fail.lower() == 'failed':
            result_display = "❌ Failed"
        else:
            result_display = f"❓ {pass_fail}"

        # Format custom exporter/gameLogic indicators
        exporter_indicator = "✅" if has_custom_exporter else "⚫"
        game_logic_indicator = "✅" if has_custom_game_logic else "⚫"

        md_content += f"| {game_name} | {result_display} | {gen_error_count} | {locations_checked} | {total_locations} | {progress} | {exporter_indicator} | {game_logic_indicator} |\n"

    if not chart_data:
        md_content += "| No data available | - | - | - | - | - | - | - |\n"

    # Footer notes
    md_content += "\n## Notes\n\n"
    md_content += "- **Gen Errors:** Number of errors during world generation\n"
    md_content += "- **Locations Checked:** Number of locations checked during the multiplayer test\n"
    md_content += "- **Total Locations:** Total number of locations available in the game\n"
    md_content += "- **Progress:** Percentage of locations checked\n"
    md_content += "- **Custom Exporter:** ✅ Has custom Python exporter script, ⚫ Uses generic exporter\n"
    md_content += "- **Custom GameLogic:** ✅ Has custom JavaScript game logic, ⚫ Uses generic logic\n"
    md_content += "\n"
    md_content += "**Pass Criteria:** A test is marked as ✅ Passed only if:\n"
    md_content += "- Generation errors = 0 (no errors during world generation)\n"
    md_content += "- All locations checked (locations_checked == total_locations)\n"
    md_content += "- Total locations > 0 (game has locations to check)\n"
    md_content += "- Multiplayer test completed successfully\n"
    md_content += "\n"
    md_content += "Progress indicators:\n"
    md_content += "- 🟢 Complete - Test completely passed (all criteria met)\n"
    md_content += "- 🟡 Yellow - Progress ≥ 75%\n"
    md_content += "- 🟠 Orange - Progress ≥ 25% and < 75%\n"
    md_content += "- 🔴 Red - Progress < 25%\n"
    md_content += "- ❓ N/A - No location data available\n"

    return md_content


def main():
    parser = argparse.ArgumentParser(description='Generate test results chart from test-results-multiplayer.json')
    parser.add_argument(
        '--input-file',
        type=str,
        default='scripts/output-multiplayer/test-results-multiplayer.json',
        help='Input JSON file path (default: scripts/output-multiplayer/test-results-multiplayer.json)'
    )
    parser.add_argument(
        '--output-file',
        type=str,
        default='docs/json/developer/test-results/test-results-multiplayer.md',
        help='Output markdown file path (default: docs/json/developer/test-results/test-results-multiplayer.md)'
    )

    args = parser.parse_args()

    # Determine project root and resolve paths
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    input_path = os.path.join(project_root, args.input_file)
    output_path = os.path.join(project_root, args.output_file)

    # Check if input file exists
    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        print("Please run test-all-templates-multiplayer.py first to generate the results file.")
        return 1

    # Load test results
    print(f"Loading test results from: {input_path}")
    results = load_test_results(input_path)

    if not results:
        print("No results found or failed to load results file.")
        return 1

    # Extract chart data
    chart_data = extract_chart_data(results)
    # For multiplayer results, the metadata is at the top level
    metadata = {
        'timestamp': results.get('timestamp'),
        'test_type': results.get('test_type'),
        'test_mode': results.get('test_mode'),
        'seed': results.get('seed')
    }

    # Generate markdown chart
    print(f"Generating chart with {len(chart_data)} games...")
    md_content = generate_markdown_chart(chart_data, metadata)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Write to file
    try:
        with open(output_path, 'w') as f:
            f.write(md_content)
        print(f"Chart saved to: {output_path}")
    except IOError as e:
        print(f"Error writing output file: {e}")
        return 1

    return 0


if __name__ == '__main__':
    exit(main())
