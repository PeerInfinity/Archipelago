#!/usr/bin/env python3
"""
Script to generate charts from template test results showing test results
for all game templates. Supports spoiler tests (minimal and full) and multiclient tests.
Can generate individual charts for each test type and a combined summary chart.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

# Add parent scripts directory to path to import from lib
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.test_utils import load_template_exclude_list

# Import from the chart_generators package
from chart_generators import (
    load_full_world_mapping,
    load_test_results,
    extract_spoiler_chart_data,
    generate_spoiler_markdown,
    extract_multiclient_chart_data,
    generate_multiclient_markdown,
    extract_multiworld_chart_data,
    generate_multiworld_markdown,
    extract_processing_times_data,
    generate_processing_times_markdown,
    generate_summary_chart,
)


def main():
    parser = argparse.ArgumentParser(description='Generate test results charts from template test results')
    parser.add_argument('--input-file', type=str, help='Input JSON file path (processes only this file)')
    parser.add_argument('--output-file', type=str, help='Output markdown file path')
    parser.add_argument('--test-type', type=str, choices=['minimal', 'full', 'multiclient', 'multiworld'],
                       help='Test type when using --input-file')
    parser.add_argument('--include-timing', action='store_true', default=False,
                       help='Include test timing data in output (default: off)')

    args = parser.parse_args()

    # Script is at scripts/docs/generate-test-chart.py, go up 3 levels to reach project root
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

    # Single file mode
    if args.input_file or args.output_file:
        if not args.input_file or not args.output_file or not args.test_type:
            print("Error: When using --input-file or --output-file, you must specify all three: --input-file, --output-file, and --test-type")
            return 1

        input_path = os.path.join(project_root, args.input_file)
        output_path = os.path.join(project_root, args.output_file)

        if not os.path.exists(input_path):
            print(f"Error: Input file not found: {input_path}")
            return 1

        results = load_test_results(input_path)
        if not results:
            return 1

        metadata = results.get('metadata', {})

        if args.test_type in ['minimal', 'full']:
            chart_data = extract_spoiler_chart_data(results)
            subtitle = "Spoiler Test - Advancement Items Only" if args.test_type == 'minimal' else "Spoiler Test - All Locations"
            md_content = generate_spoiler_markdown(chart_data, metadata, subtitle, include_timing=args.include_timing)
        elif args.test_type == 'multiclient':
            chart_data = extract_multiclient_chart_data(results)
            # Extract top-level metadata for multiclient
            top_level = {
                'timestamp': results.get('timestamp'),
                'test_type': results.get('test_type'),
                'test_mode': results.get('test_mode'),
                'seed': results.get('seed')
            }
            md_content = generate_multiclient_markdown(chart_data, metadata, top_level)
        else:  # multiworld
            full_world_mapping = load_full_world_mapping(project_root)
            chart_data = extract_multiworld_chart_data(results, full_world_mapping)
            # Extract top-level metadata for multiworld
            top_level = {
                'timestamp': results.get('timestamp'),
                'seed': results.get('seed')
            }
            md_content = generate_multiworld_markdown(chart_data, metadata, top_level)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            f.write(md_content)
        print(f"Chart saved to: {output_path}")
        return 0

    # Process all test types (original and WorldGen)

    # First, update the world mapping to ensure file sizes are current
    print("Updating world mapping...")
    world_mapping_script = os.path.join(project_root, 'scripts/build/build-world-mapping.py')
    result = subprocess.run([sys.executable, world_mapping_script], cwd=project_root, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Warning: Failed to update world mapping: {result.stderr}")
    else:
        print("World mapping updated successfully.")

    # Load world mapping for file size information (used by all markdown generators)
    full_world_mapping = load_full_world_mapping(project_root)

    # Initialize worldgen data variables (will be populated if files exist)
    minimal_wg_data = []
    full_wg_data = []
    mp_wg_data = []
    mw_wg_data = None

    # Initialize apworld data variables (will be populated if files exist)
    minimal_ap_data = []
    full_ap_data = []
    mp_ap_data = []
    mw_ap_data = None

    # Load minimal spoiler test results (original, WorldGen, and APWorld)
    minimal_input = os.path.join(project_root, 'scripts/output/spoiler-minimal/test-results.json')
    minimal_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-minimal.md')
    minimal_wg_input = os.path.join(project_root, 'scripts/output/spoiler-minimal-worldgen/test-results.json')
    minimal_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-minimal-worldgen.md')
    minimal_ap_input = os.path.join(project_root, 'scripts/output/spoiler-minimal-apworld/test-results.json')
    minimal_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-minimal-apworld.md')

    has_minimal = os.path.exists(minimal_input)
    has_minimal_wg = os.path.exists(minimal_wg_input)
    has_minimal_ap = os.path.exists(minimal_ap_input)

    if has_minimal:
        minimal_results = load_test_results(minimal_input)
        minimal_data = extract_spoiler_chart_data(minimal_results)
        # Build version links for cross-linking
        version_links = {}
        if has_minimal_wg:
            version_links['worldgen'] = './test-results-spoilers-minimal-worldgen.md'
        if has_minimal_ap:
            version_links['apworld'] = './test-results-spoilers-minimal-apworld.md'
        minimal_md = generate_spoiler_markdown(minimal_data, minimal_results.get('metadata', {}),
                                              "Spoiler Test - Advancement Items Only",
                                              world_mapping=full_world_mapping,
                                              include_timing=args.include_timing,
                                              version_links=version_links if version_links else None)
        os.makedirs(os.path.dirname(minimal_output), exist_ok=True)
        with open(minimal_output, 'w') as f:
            f.write(minimal_md)
    else:
        print(f"Warning: Minimal spoiler test results not found: {minimal_input}")
        minimal_data = []

    if has_minimal_wg:
        minimal_wg_results = load_test_results(minimal_wg_input)
        minimal_wg_data = extract_spoiler_chart_data(minimal_wg_results)
        # Cross-link to original version
        orig_link = './test-results-spoilers-minimal.md' if has_minimal else None
        minimal_wg_md = generate_spoiler_markdown(minimal_wg_data, minimal_wg_results.get('metadata', {}),
                                                  "Spoiler Test - Advancement Items Only (WorldGen)",
                                                  world_mapping=full_world_mapping,
                                                  include_timing=args.include_timing,
                                                  variant_type="worldgen",
                                                  version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(minimal_wg_output), exist_ok=True)
        with open(minimal_wg_output, 'w') as f:
            f.write(minimal_wg_md)
    else:
        print(f"Info: WorldGen minimal spoiler test results not found: {minimal_wg_input}")

    if has_minimal_ap:
        minimal_ap_results = load_test_results(minimal_ap_input)
        minimal_ap_data = extract_spoiler_chart_data(minimal_ap_results)
        # Cross-link to original version
        orig_link = './test-results-spoilers-minimal.md' if has_minimal else None
        minimal_ap_md = generate_spoiler_markdown(minimal_ap_data, minimal_ap_results.get('metadata', {}),
                                                  "Spoiler Test - Advancement Items Only (APWorld)",
                                                  world_mapping=full_world_mapping,
                                                  include_timing=args.include_timing,
                                                  variant_type="apworld",
                                                  version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(minimal_ap_output), exist_ok=True)
        with open(minimal_ap_output, 'w') as f:
            f.write(minimal_ap_md)
    else:
        print(f"Info: APWorld minimal spoiler test results not found: {minimal_ap_input}")

    # Load full spoiler test results (original, WorldGen, and APWorld)
    full_input = os.path.join(project_root, 'scripts/output/spoiler-full/test-results.json')
    full_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-full.md')
    full_wg_input = os.path.join(project_root, 'scripts/output/spoiler-full-worldgen/test-results.json')
    full_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-full-worldgen.md')
    full_ap_input = os.path.join(project_root, 'scripts/output/spoiler-full-apworld/test-results.json')
    full_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-spoilers-full-apworld.md')

    has_full = os.path.exists(full_input)
    has_full_wg = os.path.exists(full_wg_input)
    has_full_ap = os.path.exists(full_ap_input)

    if has_full:
        full_results = load_test_results(full_input)
        full_data = extract_spoiler_chart_data(full_results)
        # Build version links for cross-linking
        version_links = {}
        if has_full_wg:
            version_links['worldgen'] = './test-results-spoilers-full-worldgen.md'
        if has_full_ap:
            version_links['apworld'] = './test-results-spoilers-full-apworld.md'
        full_md = generate_spoiler_markdown(full_data, full_results.get('metadata', {}),
                                           "Spoiler Test - All Locations",
                                           world_mapping=full_world_mapping,
                                           include_timing=args.include_timing,
                                           version_links=version_links if version_links else None)
        os.makedirs(os.path.dirname(full_output), exist_ok=True)
        with open(full_output, 'w') as f:
            f.write(full_md)
    else:
        print(f"Warning: Full spoiler test results not found: {full_input}")
        full_data = []

    if has_full_wg:
        full_wg_results = load_test_results(full_wg_input)
        full_wg_data = extract_spoiler_chart_data(full_wg_results)
        orig_link = './test-results-spoilers-full.md' if has_full else None
        full_wg_md = generate_spoiler_markdown(full_wg_data, full_wg_results.get('metadata', {}),
                                               "Spoiler Test - All Locations (WorldGen)",
                                               world_mapping=full_world_mapping,
                                               include_timing=args.include_timing,
                                               variant_type="worldgen",
                                               version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(full_wg_output), exist_ok=True)
        with open(full_wg_output, 'w') as f:
            f.write(full_wg_md)
    else:
        print(f"Info: WorldGen full spoiler test results not found: {full_wg_input}")

    if has_full_ap:
        full_ap_results = load_test_results(full_ap_input)
        full_ap_data = extract_spoiler_chart_data(full_ap_results)
        orig_link = './test-results-spoilers-full.md' if has_full else None
        full_ap_md = generate_spoiler_markdown(full_ap_data, full_ap_results.get('metadata', {}),
                                               "Spoiler Test - All Locations (APWorld)",
                                               world_mapping=full_world_mapping,
                                               include_timing=args.include_timing,
                                               variant_type="apworld",
                                               version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(full_ap_output), exist_ok=True)
        with open(full_ap_output, 'w') as f:
            f.write(full_ap_md)
    else:
        print(f"Info: APWorld full spoiler test results not found: {full_ap_input}")

    # Load multiclient test results (original, WorldGen, and APWorld)
    mp_input = os.path.join(project_root, 'scripts/output/multiclient/test-results.json')
    mp_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiclient.md')
    mp_wg_input = os.path.join(project_root, 'scripts/output/multiclient-worldgen/test-results.json')
    mp_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiclient-worldgen.md')
    mp_ap_input = os.path.join(project_root, 'scripts/output/multiclient-apworld/test-results.json')
    mp_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiclient-apworld.md')

    has_mp = os.path.exists(mp_input)
    has_mp_wg = os.path.exists(mp_wg_input)
    has_mp_ap = os.path.exists(mp_ap_input)

    if has_mp:
        mp_results = load_test_results(mp_input)
        mp_data = extract_multiclient_chart_data(mp_results)
        top_level_mp = {
            'timestamp': mp_results.get('timestamp'),
            'test_type': mp_results.get('test_type'),
            'test_mode': mp_results.get('test_mode'),
            'seed': mp_results.get('seed')
        }
        # Build version links for cross-linking
        version_links = {}
        if has_mp_wg:
            version_links['worldgen'] = './test-results-multiclient-worldgen.md'
        if has_mp_ap:
            version_links['apworld'] = './test-results-multiclient-apworld.md'
        mp_md = generate_multiclient_markdown(mp_data, mp_results.get('metadata', {}), top_level_mp,
                                              world_mapping=full_world_mapping,
                                              version_links=version_links if version_links else None)
        os.makedirs(os.path.dirname(mp_output), exist_ok=True)
        with open(mp_output, 'w') as f:
            f.write(mp_md)
    else:
        print(f"Warning: Multiclient test results not found: {mp_input}")
        mp_data = []

    if has_mp_wg:
        mp_wg_results = load_test_results(mp_wg_input)
        mp_wg_data = extract_multiclient_chart_data(mp_wg_results)
        top_level_mp_wg = {
            'timestamp': mp_wg_results.get('timestamp'),
            'test_type': mp_wg_results.get('test_type'),
            'test_mode': mp_wg_results.get('test_mode'),
            'seed': mp_wg_results.get('seed')
        }
        orig_link = './test-results-multiclient.md' if has_mp else None
        mp_wg_md = generate_multiclient_markdown(mp_wg_data, mp_wg_results.get('metadata', {}), top_level_mp_wg,
                                                  world_mapping=full_world_mapping,
                                                  variant_type="worldgen",
                                                  version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(mp_wg_output), exist_ok=True)
        with open(mp_wg_output, 'w') as f:
            f.write(mp_wg_md)
    else:
        print(f"Info: WorldGen multiclient test results not found: {mp_wg_input}")

    if has_mp_ap:
        mp_ap_results = load_test_results(mp_ap_input)
        mp_ap_data = extract_multiclient_chart_data(mp_ap_results)
        top_level_mp_ap = {
            'timestamp': mp_ap_results.get('timestamp'),
            'test_type': mp_ap_results.get('test_type'),
            'test_mode': mp_ap_results.get('test_mode'),
            'seed': mp_ap_results.get('seed')
        }
        orig_link = './test-results-multiclient.md' if has_mp else None
        mp_ap_md = generate_multiclient_markdown(mp_ap_data, mp_ap_results.get('metadata', {}), top_level_mp_ap,
                                                  world_mapping=full_world_mapping,
                                                  variant_type="apworld",
                                                  version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(mp_ap_output), exist_ok=True)
        with open(mp_ap_output, 'w') as f:
            f.write(mp_ap_md)
    else:
        print(f"Info: APWorld multiclient test results not found: {mp_ap_input}")

    # Load multiworld test results (original, WorldGen, and APWorld)
    mw_input = os.path.join(project_root, 'scripts/output/multiworld/test-results.json')
    mw_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiworld.md')
    mw_wg_input = os.path.join(project_root, 'scripts/output/multiworld-worldgen/test-results.json')
    mw_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiworld-worldgen.md')
    mw_ap_input = os.path.join(project_root, 'scripts/output/multiworld-apworld/test-results.json')
    mw_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-multiworld-apworld.md')

    has_mw = os.path.exists(mw_input)
    has_mw_wg = os.path.exists(mw_wg_input)
    has_mw_ap = os.path.exists(mw_ap_input)

    mw_data = None
    if has_mw:
        mw_results = load_test_results(mw_input)
        mw_data = extract_multiworld_chart_data(mw_results, full_world_mapping)
        top_level_mw = {
            'timestamp': mw_results.get('timestamp'),
            'seed': mw_results.get('seed')
        }
        # Build version links for cross-linking
        version_links = {}
        if has_mw_wg:
            version_links['worldgen'] = './test-results-multiworld-worldgen.md'
        if has_mw_ap:
            version_links['apworld'] = './test-results-multiworld-apworld.md'
        mw_md = generate_multiworld_markdown(mw_data, mw_results.get('metadata', {}), top_level_mw,
                                             version_links=version_links if version_links else None)
        os.makedirs(os.path.dirname(mw_output), exist_ok=True)
        with open(mw_output, 'w') as f:
            f.write(mw_md)
    else:
        print(f"Warning: Multiworld test results not found: {mw_input}")

    if has_mw_wg:
        mw_wg_results = load_test_results(mw_wg_input)
        mw_wg_data = extract_multiworld_chart_data(mw_wg_results, full_world_mapping)
        top_level_mw_wg = {
            'timestamp': mw_wg_results.get('timestamp'),
            'seed': mw_wg_results.get('seed')
        }
        orig_link = './test-results-multiworld.md' if has_mw else None
        mw_wg_md = generate_multiworld_markdown(mw_wg_data, mw_wg_results.get('metadata', {}), top_level_mw_wg,
                                                 variant_type="worldgen",
                                                 version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(mw_wg_output), exist_ok=True)
        with open(mw_wg_output, 'w') as f:
            f.write(mw_wg_md)
    else:
        print(f"Info: WorldGen multiworld test results not found: {mw_wg_input}")

    if has_mw_ap:
        mw_ap_results = load_test_results(mw_ap_input)
        mw_ap_data = extract_multiworld_chart_data(mw_ap_results, full_world_mapping)
        top_level_mw_ap = {
            'timestamp': mw_ap_results.get('timestamp'),
            'seed': mw_ap_results.get('seed')
        }
        orig_link = './test-results-multiworld.md' if has_mw else None
        mw_ap_md = generate_multiworld_markdown(mw_ap_data, mw_ap_results.get('metadata', {}), top_level_mw_ap,
                                                 variant_type="apworld",
                                                 version_links={"original": orig_link} if orig_link else None)
        os.makedirs(os.path.dirname(mw_ap_output), exist_ok=True)
        with open(mw_ap_output, 'w') as f:
            f.write(mw_ap_md)
    else:
        print(f"Info: APWorld multiworld test results not found: {mw_ap_input}")

    # Generate summary charts (original, WorldGen, and APWorld)
    if minimal_data or full_data or mp_data or mw_data:
        # Load the exclude list with reasons for main tests
        # Convert list of dicts to dict for generate_summary_chart
        excluded_list = load_template_exclude_list(project_root, include_reasons=True, test_type='main', skip_worldgen_variants=True)
        excluded_games_main = {item['name']: item['reason'] for item in excluded_list}

        # Get metadata for intermittent failures
        minimal_meta = minimal_results.get('metadata', {}) if 'minimal_results' in locals() else None
        full_meta = full_results.get('metadata', {}) if 'full_results' in locals() else None
        mp_meta = mp_results.get('metadata', {}) if 'mp_results' in locals() else None
        mw_meta = mw_results.get('metadata', {}) if 'mw_results' in locals() else None

        # Check if we have worldgen/apworld data for the summary
        has_wg_summary = minimal_wg_data or full_wg_data or mp_wg_data or mw_wg_data
        has_ap_summary = minimal_ap_data or full_ap_data or mp_ap_data or mw_ap_data

        # Build version links for original summary
        summary_version_links = {}
        if has_wg_summary:
            summary_version_links['worldgen'] = './test-results-summary-worldgen.md'
        if has_ap_summary:
            summary_version_links['apworld'] = './test-results-summary-apworld.md'

        # Generate original summary with cross-links to variants
        summary_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-summary.md')
        summary_md = generate_summary_chart(minimal_data, full_data, mp_data, mw_data, excluded_games_main, minimal_meta, full_meta, multiclient_metadata=mp_meta, multiworld_metadata=mw_meta, world_mapping=full_world_mapping, project_root=project_root, version_links=summary_version_links if summary_version_links else None)
        with open(summary_output, 'w') as f:
            f.write(summary_md)

    # Generate WorldGen summary chart if we have any worldgen data
    if minimal_wg_data or full_wg_data or mp_wg_data or mw_wg_data:
        # Load the exclude list with reasons for worldgen tests (includes main + worldgen exclusions)
        # Convert list of dicts to dict for generate_summary_chart
        excluded_list_wg = load_template_exclude_list(project_root, include_reasons=True, test_type='all', skip_worldgen_variants=True)
        excluded_games_worldgen = {item['name']: item['reason'] for item in excluded_list_wg}

        # Get metadata for intermittent failures from worldgen results
        minimal_wg_meta = minimal_wg_results.get('metadata', {}) if 'minimal_wg_results' in locals() else None
        full_wg_meta = full_wg_results.get('metadata', {}) if 'full_wg_results' in locals() else None
        mp_wg_meta = mp_wg_results.get('metadata', {}) if 'mp_wg_results' in locals() else None
        mw_wg_meta = mw_wg_results.get('metadata', {}) if 'mw_wg_results' in locals() else None

        summary_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-summary-worldgen.md')
        summary_wg_md = generate_summary_chart(minimal_wg_data, full_wg_data, mp_wg_data, mw_wg_data, excluded_games_worldgen, minimal_wg_meta, full_wg_meta, multiclient_metadata=mp_wg_meta, multiworld_metadata=mw_wg_meta, world_mapping=full_world_mapping, project_root=project_root, variant_type="worldgen", version_links={"original": "./test-results-summary.md"})
        with open(summary_wg_output, 'w') as f:
            f.write(summary_wg_md)

    # Generate APWorld summary chart if we have any apworld data
    if minimal_ap_data or full_ap_data or mp_ap_data or mw_ap_data:
        # Load the exclude list with reasons for apworld tests
        # Use ut_fuzz_apworld test type since apworlds have their own exclude list
        # Convert list of dicts to dict for generate_summary_chart
        excluded_list_ap = load_template_exclude_list(project_root, include_reasons=True, test_type='ut_fuzz_apworld')
        excluded_games_apworld = {item['name']: item['reason'] for item in excluded_list_ap}

        # Get metadata for intermittent failures from apworld results
        minimal_ap_meta = minimal_ap_results.get('metadata', {}) if 'minimal_ap_results' in locals() else None
        full_ap_meta = full_ap_results.get('metadata', {}) if 'full_ap_results' in locals() else None
        mp_ap_meta = mp_ap_results.get('metadata', {}) if 'mp_ap_results' in locals() else None
        mw_ap_meta = mw_ap_results.get('metadata', {}) if 'mw_ap_results' in locals() else None

        summary_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-summary-apworld.md')
        summary_ap_md = generate_summary_chart(minimal_ap_data, full_ap_data, mp_ap_data, mw_ap_data, excluded_games_apworld, minimal_ap_meta, full_ap_meta, multiclient_metadata=mp_ap_meta, multiworld_metadata=mw_ap_meta, world_mapping=full_world_mapping, project_root=project_root, variant_type="apworld", version_links={"original": "./test-results-summary.md"})
        with open(summary_ap_output, 'w') as f:
            f.write(summary_ap_md)

    # Generate processing times charts (original, worldgen, apworld)
    has_original_times = 'minimal_results' in locals() or 'full_results' in locals() or 'mp_results' in locals() or 'mw_results' in locals()
    has_wg_times = 'minimal_wg_results' in locals() or 'full_wg_results' in locals() or 'mp_wg_results' in locals() or 'mw_wg_results' in locals()
    has_ap_times = 'minimal_ap_results' in locals() or 'full_ap_results' in locals() or 'mp_ap_results' in locals() or 'mw_ap_results' in locals()

    # Build version links for processing times cross-linking
    pt_version_links = {}
    if has_wg_times:
        pt_version_links['worldgen'] = './test-results-processing-times-worldgen.md'
    if has_ap_times:
        pt_version_links['apworld'] = './test-results-processing-times-apworld.md'

    if has_original_times:
        processing_times_data = extract_processing_times_data(
            minimal_results if 'minimal_results' in locals() else {},
            full_results if 'full_results' in locals() else {},
            mp_results if 'mp_results' in locals() else {},
            mw_results if 'mw_results' in locals() else {}
        )
        processing_times_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-processing-times.md')
        processing_times_md = generate_processing_times_markdown(
            processing_times_data,
            version_links=pt_version_links if pt_version_links else None,
            metadata=minimal_meta
        )
        with open(processing_times_output, 'w') as f:
            f.write(processing_times_md)
        print(f"Generated: {processing_times_output}")

    # Generate WorldGen processing times chart
    if has_wg_times:
        processing_times_wg_data = extract_processing_times_data(
            minimal_wg_results if 'minimal_wg_results' in locals() else {},
            full_wg_results if 'full_wg_results' in locals() else {},
            mp_wg_results if 'mp_wg_results' in locals() else {},
            mw_wg_results if 'mw_wg_results' in locals() else {}
        )
        processing_times_wg_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-processing-times-worldgen.md')
        processing_times_wg_md = generate_processing_times_markdown(
            processing_times_wg_data,
            variant_type="worldgen",
            version_links={"original": "./test-results-processing-times.md"},
            metadata=minimal_wg_meta
        )
        with open(processing_times_wg_output, 'w') as f:
            f.write(processing_times_wg_md)
        print(f"Generated: {processing_times_wg_output}")

    # Generate APWorld processing times chart
    if has_ap_times:
        processing_times_ap_data = extract_processing_times_data(
            minimal_ap_results if 'minimal_ap_results' in locals() else {},
            full_ap_results if 'full_ap_results' in locals() else {},
            mp_ap_results if 'mp_ap_results' in locals() else {},
            mw_ap_results if 'mw_ap_results' in locals() else {}
        )
        processing_times_ap_output = os.path.join(project_root, 'docs/json/developer/test-results/test-results-processing-times-apworld.md')
        processing_times_ap_md = generate_processing_times_markdown(
            processing_times_ap_data,
            variant_type="apworld",
            version_links={"original": "./test-results-processing-times.md"},
            metadata=minimal_ap_meta
        )
        with open(processing_times_ap_output, 'w') as f:
            f.write(processing_times_ap_md)
        print(f"Generated: {processing_times_ap_output}")

    print("\n=== Chart Generation Complete ===")
    return 0


if __name__ == '__main__':
    exit(main())
