#!/usr/bin/env python3
"""
Script to combine multiple test-results.json files from parallel test runs.

This script is designed to merge results from parallel CI runs where each run
tests the same templates with different seeds. It combines the results into a
single test-results.json file.

Usage:
    python scripts/test/combine-test-results.py \
        --input-files scripts/output/spoiler-minimal/test-results-seed-*.json \
        --output-file scripts/output/spoiler-minimal/test-results.json
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any
import glob


def load_results_file(file_path: str) -> Dict[str, Any]:
    """Load a test results JSON file."""
    try:
        with open(file_path, 'r') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error loading {file_path}: {e}")
        return None


def merge_errors(existing_errors: Any, new_errors: Any) -> Dict[str, List[str]]:
    """
    Merge errors from two results, handling both old (list) and new (dict) formats.

    The new format is: {'generation': [...], 'testing': [...]}
    The old format is: [...]

    Returns the new dict format with merged errors.
    """
    # Normalize existing_errors to dict format
    if existing_errors is None:
        existing_dict = {'generation': [], 'testing': []}
    elif isinstance(existing_errors, list):
        # Old format - treat as generation errors
        existing_dict = {'generation': list(existing_errors), 'testing': []}
    elif isinstance(existing_errors, dict):
        existing_dict = {
            'generation': list(existing_errors.get('generation', [])),
            'testing': list(existing_errors.get('testing', []))
        }
    else:
        existing_dict = {'generation': [], 'testing': []}

    # Normalize new_errors to dict format
    if new_errors is None:
        new_dict = {'generation': [], 'testing': []}
    elif isinstance(new_errors, list):
        # Old format - treat as generation errors
        new_dict = {'generation': list(new_errors), 'testing': []}
    elif isinstance(new_errors, dict):
        new_dict = {
            'generation': list(new_errors.get('generation', [])),
            'testing': list(new_errors.get('testing', []))
        }
    else:
        new_dict = {'generation': [], 'testing': []}

    # Merge, avoiding duplicates
    merged = {
        'generation': existing_dict['generation'] + [e for e in new_dict['generation'] if e not in existing_dict['generation']],
        'testing': existing_dict['testing'] + [e for e in new_dict['testing'] if e not in existing_dict['testing']]
    }

    return merged


def combine_results(input_files: List[str]) -> Dict[str, Any]:
    """
    Combine multiple test results files into a single structure.

    The strategy is:
    - For each template, check if results are consistent across seeds
    - If all seeds pass, report as passing with seed range
    - If any seed fails, report the first failing seed
    - Track consecutive passes before first failure
    """
    all_results = []

    # Load all input files
    for file_path in input_files:
        data = load_results_file(file_path)
        if data:
            all_results.append(data)
        else:
            print(f"Warning: Skipping {file_path} due to load error")

    if not all_results:
        print("Error: No valid input files to combine")
        sys.exit(1)

    print(f"Loaded {len(all_results)} test result files")

    return combine_standard_results(all_results)


def combine_standard_results(all_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Combine results with standard structure (results -> template_name -> template_data).

    Supports two modes:
    1. Multi-seed mode: Same template tested with different seeds - aggregate all results
    2. Overlay mode: Same template with same seed from different phases - use latest result
    """
    # Extract all templates and organize by template name and seed
    template_results = {}  # template_name -> list of (seed, result_data)

    for result_data in all_results:
        for template_name, template_result in result_data.get('results', {}).items():
            if template_name not in template_results:
                template_results[template_name] = []

            seed = template_result.get('seed', '1')
            template_results[template_name].append((seed, template_result))

    # Detect if we're in overlay mode (same seeds across templates)
    # This happens when combining phase results from the same workflow run
    is_overlay_mode = False
    if template_results:
        # Check if any template has duplicate seeds
        for seed_list in template_results.values():
            seeds = [s for s, _ in seed_list]
            if len(seeds) != len(set(seeds)):
                is_overlay_mode = True
                print("Detected overlay mode (duplicate seeds) - using latest result for each template")
                break

    if is_overlay_mode:
        # In overlay mode, merge results for each (template, seed) combination
        # Later results take precedence but errors are merged from all phases
        for template_name in template_results:
            seed_to_result = {}
            for seed, result in template_results[template_name]:
                if seed in seed_to_result:
                    # Merge errors from previous result into new result
                    existing_errors = seed_to_result[seed].get('errors')
                    new_errors = result.get('errors')
                    result['errors'] = merge_errors(existing_errors, new_errors)
                seed_to_result[seed] = result
            template_results[template_name] = [(seed, result) for seed, result in seed_to_result.items()]

    # Sort each template's results by seed number
    for template_name in template_results:
        template_results[template_name].sort(key=lambda x: int(x[0]))

    # Combine results for each template
    combined_results = {}
    _process_template_results(template_results, combined_results)

    # Merge intermittent_tracking metadata from all input files
    # Use a dict to deduplicate by (template, seed, timestamp)
    intermittent_failures_dict = {}
    for result_data in all_results:
        metadata = result_data.get('metadata', {})
        tracking = metadata.get('intermittent_tracking', {})
        failures = tracking.get('failures', [])
        for failure in failures:
            # Create unique key from template, seed, and timestamp
            key = (failure.get('template'), failure.get('seed'), failure.get('timestamp'))
            intermittent_failures_dict[key] = failure

    # Convert back to list, sorted by template then seed
    merged_intermittent_failures = sorted(
        intermittent_failures_dict.values(),
        key=lambda f: (f.get('template', ''), f.get('seed') if f.get('seed') is not None else float('inf'))
    )

    # Collect seeds from all input files
    seeds_used = []
    for result_data in all_results:
        metadata = result_data.get('metadata', {})
        if 'seed' in metadata:
            seeds_used.append(str(metadata['seed']))

    # Collect preserved metadata fields from input files
    # These fields should be consistent across all input files (from parallel splits)
    preserved_fields = [
        'test_type', 'seed_mode', 'base_seed', 'runs_per_game',
        'generation_timeout', 'test_timeout', 'total_templates'
    ]
    preserved_metadata = {}
    for result_data in all_results:
        metadata = result_data.get('metadata', {})
        for field in preserved_fields:
            if field in metadata and field not in preserved_metadata:
                preserved_metadata[field] = metadata[field]

    # Create combined output structure
    combined = {
        'metadata': {
            'created': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat(),
            'script_version': '1.0.0',
            'combined_from': len(all_results),
            'combination_note': 'Results combined from parallel seed tests',
            **preserved_metadata  # Include preserved fields from input files
        },
        'results': combined_results
    }

    # Add seed info if available
    if seeds_used:
        if len(set(seeds_used)) == 1:
            combined['metadata']['seed'] = seeds_used[0]
        else:
            combined['metadata']['seeds'] = sorted(set(seeds_used), key=lambda x: int(x) if x.isdigit() else x)

    # Add intermittent tracking if we have any failures
    if merged_intermittent_failures:
        combined['metadata']['intermittent_tracking'] = {
            'failures': merged_intermittent_failures,
            'last_updated': datetime.now(timezone.utc).isoformat()
        }

    return combined


def _process_template_results(template_results: Dict[str, List], combined_results: Dict[str, Any]) -> None:
    """
    Process template results and add them to combined_results dict.
    """
    for template_name, seed_results in template_results.items():
        if len(seed_results) == 1:
            # Single seed - just use that result as-is
            seed, result = seed_results[0]
            combined_results[template_name] = result
        else:
            # Multiple seeds - need to combine
            seeds = [int(seed) for seed, _ in seed_results]
            min_seed = min(seeds)
            max_seed = max(seeds)

            # Build individual_results dict to preserve all seed results
            individual_results = {}
            for seed, result in seed_results:
                individual_results[str(seed)] = result

            # Check if all seeds passed
            first_failure_seed = None
            first_failure_reason = None
            consecutive_passes = 0
            seeds_passed = 0
            seeds_failed = 0

            # Sort seeds numerically for consistent processing
            sorted_seeds = sorted(seeds)

            for seed_num in sorted_seeds:
                result = individual_results[str(seed_num)]

                # Check if this seed passed
                seed_passed = False
                if 'spoiler_test' in result and result['spoiler_test']:
                    seed_passed = result['spoiler_test'].get('pass_fail') == 'passed'
                elif 'multiclient_test' in result and result['multiclient_test']:
                    seed_passed = result['multiclient_test'].get('success', False)
                elif 'multiworld_test' in result and result['multiworld_test']:
                    seed_passed = result['multiworld_test'].get('success', False)
                else:
                    # Check generation success
                    seed_passed = (result.get('generation') or {}).get('success', False)

                if seed_passed:
                    seeds_passed += 1
                    if first_failure_seed is None:
                        consecutive_passes += 1
                else:
                    seeds_failed += 1
                    if first_failure_seed is None:
                        first_failure_seed = seed_num
                        # Get failure reason from the seed result
                        if 'spoiler_test' in result:
                            spoiler_result = result.get('spoiler_test', {})
                            if spoiler_result.get('first_error_line'):
                                first_failure_reason = f"Test error: {spoiler_result['first_error_line']}"
                            else:
                                first_failure_reason = f"Test failed at sphere {spoiler_result.get('sphere_reached', 0)}"
                        else:
                            gen_result = result.get('generation', {})
                            if gen_result.get('first_error_line'):
                                first_failure_reason = f"Generation error: {gen_result['first_error_line']}"
                            else:
                                first_failure_reason = f"Generation failed with return code {gen_result.get('return_code')}"

            # Calculate all_passed based on actual results
            all_passed = seeds_failed == 0

            # Use the result from the first seed as the base
            base_result = seed_results[0][1].copy()

            # Add individual_results to preserve all seed data
            base_result['individual_results'] = individual_results

            # Update with seed range information
            base_result['seed_range'] = f"{sorted_seeds[0]}-{sorted_seeds[-1]}" if sorted_seeds[0] != sorted_seeds[-1] else str(sorted_seeds[0])
            base_result['total_seeds_tested'] = len(seed_results)
            base_result['seeds_passed'] = seeds_passed
            base_result['seeds_failed'] = seeds_failed
            base_result['consecutive_passes_before_failure'] = consecutive_passes

            if first_failure_seed:
                base_result['first_failure_seed'] = first_failure_seed
                base_result['first_failure_reason'] = first_failure_reason
            else:
                base_result['first_failure_seed'] = None
                base_result['first_failure_reason'] = None

            # Add summary field for compatibility with is_test_passing
            base_result['summary'] = {
                'all_passed': all_passed,
                'any_failed': not all_passed,
                'failure_rate': seeds_failed / len(seed_results) if len(seed_results) > 0 else 0
            }

            # Merge consistency_tests from all seeds
            consistency_tests = {}
            for seed, result in seed_results:
                if 'consistency_tests' in result:
                    # Merge consistency tests for this seed
                    consistency_tests.update(result['consistency_tests'])

            # Only add consistency_tests if we have any
            if consistency_tests:
                base_result['consistency_tests'] = consistency_tests

            combined_results[template_name] = base_result


def main():
    parser = argparse.ArgumentParser(
        description='Combine multiple test-results.json files from parallel runs'
    )
    parser.add_argument(
        '--input-files',
        type=str,
        nargs='+',
        required=True,
        help='List of input test-results files to combine (supports glob patterns)'
    )
    parser.add_argument(
        '--output-file',
        type=str,
        default=None,
        help='Output file path for combined results (auto-computed if not specified)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be combined without writing output'
    )

    args = parser.parse_args()

    # Expand glob patterns in input files
    expanded_files = []
    for pattern in args.input_files:
        matches = glob.glob(pattern)
        if matches:
            expanded_files.extend(matches)
        else:
            # If no matches, treat as literal filename (might exist or might error later)
            expanded_files.append(pattern)

    # Remove duplicates while preserving order
    input_files = list(dict.fromkeys(expanded_files))

    if not input_files:
        print("Error: No input files specified")
        sys.exit(1)

    # Auto-compute output filename if not specified
    if args.output_file is None:
        # Use the directory of the first input file
        first_input = Path(input_files[0])
        args.output_file = str(first_input.parent / "test-results-combined.json")
        print(f"Auto-computed output file: {args.output_file}")

    print(f"Combining {len(input_files)} test result files:")
    for f in input_files:
        print(f"  - {f}")
    print()

    # Combine the results
    combined = combine_results(input_files)

    # Show summary
    print("\n=== Combination Summary ===")

    print(f"Templates combined: {len(combined['results'])}")

    for template_name, result in combined['results'].items():
        _print_template_summary(template_name, result, indent="  ")

    # Write output file
    if args.dry_run:
        print(f"\n[DRY RUN] Would write combined results to: {args.output_file}")
    else:
        output_path = Path(args.output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(combined, f, indent=2, sort_keys=True)

        print(f"\n✅ Combined results written to: {args.output_file}")
        print(f"   File size: {output_path.stat().st_size} bytes")


def _print_template_summary(template_name: str, result: Dict[str, Any], indent: str = "  ") -> None:
    """Print a summary line for a template result."""
    if 'seed_range' in result:
        seeds_passed = result.get('seeds_passed', 0)
        seeds_failed = result.get('seeds_failed', 0)
        seed_range = result.get('seed_range')

        if seeds_failed == 0:
            print(f"{indent}✅ {template_name}: All {seeds_passed} seeds passed (range: {seed_range})")
        else:
            first_failure = result.get('first_failure_seed')
            consecutive = result.get('consecutive_passes_before_failure', 0)
            if first_failure:
                print(f"{indent}❌ {template_name}: {consecutive} consecutive passes, first failure at seed {first_failure}")
            else:
                print(f"{indent}❌ {template_name}: {seeds_passed} passed, {seeds_failed} failed")
    else:
        # Single seed result
        seed = result.get('seed', '1')
        if 'spoiler_test' in result and result['spoiler_test']:
            passed = result['spoiler_test'].get('pass_fail') == 'passed'
        elif 'multiclient_test' in result and result['multiclient_test']:
            passed = result['multiclient_test'].get('success', False)
        elif 'multiworld_test' in result and result['multiworld_test']:
            passed = result['multiworld_test'].get('success', False)
        elif 'original' in result and result['original']:
            # World generator format - check original generation success
            passed = (result['original'].get('generation') or {}).get('success', False)
        else:
            passed = (result.get('generation') or {}).get('success', False)

        status = "✅" if passed else "❌"
        print(f"{indent}{status} {template_name}: Single seed {seed}")


if __name__ == '__main__':
    main()
