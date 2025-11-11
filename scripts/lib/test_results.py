#!/usr/bin/env python3
"""
Test results management functions.

This module handles loading, saving, merging, and analyzing test results including:
- Checking if tests pass/fail
- Identifying failed templates and failing seeds
- Loading and saving results files
- Merging results from multiple test runs
"""

import json
import os
from datetime import datetime
from typing import Dict, List


def is_test_passing(template_file: str, test_results: Dict, multiplayer: bool = False) -> bool:
    """
    Check if a template test is passing based on test results.

    Args:
        template_file: Name of the template file
        test_results: The results dictionary loaded from test-results.json
        multiplayer: If True, check multiplayer test results; otherwise check spoiler test results

    Returns:
        True if the test is passing, False otherwise
    """
    if template_file not in test_results:
        return False

    result = test_results[template_file]

    if not isinstance(result, dict):
        return result if isinstance(result, bool) else False

    # Check if this is a seed range result
    if 'summary' in result and 'all_passed' in result['summary']:
        return result['summary']['all_passed']

    # Check individual test result
    if multiplayer:
        multiplayer_test = result.get('multiplayer_test', {})
        return multiplayer_test.get('success', False)
    else:
        spoiler_test = result.get('spoiler_test', {})
        return spoiler_test.get('pass_fail') == 'passed'


def get_failed_templates(test_results: Dict, multiplayer: bool = False) -> List[str]:
    """
    Get a list of template files that have failing tests, sorted alphabetically.

    Args:
        test_results: The results dictionary loaded from test-results.json
        multiplayer: If True, check multiplayer test results; otherwise check spoiler test results

    Returns:
        List of template file names that are failing
    """
    failed_templates = []

    for template_file, result in test_results.items():
        if not is_test_passing(template_file, test_results, multiplayer):
            failed_templates.append(template_file)

    return sorted(failed_templates)


def get_failing_seed_info(template_file: str, test_results: Dict, multiplayer: bool = False) -> Dict:
    """
    Get information about which seed is failing for a template.

    Args:
        template_file: Name of the template file
        test_results: The results dictionary loaded from test-results.json
        multiplayer: If True, check multiplayer test results; otherwise check spoiler test results

    Returns:
        Dictionary with keys:
        - 'failing_seed': The first seed that failed (int), or None if no seed-specific data
        - 'last_passing_seed': The last seed that passed before failure (int), or None
        - 'seed_range_tested': The range of seeds tested (e.g., "1-8"), or None
        - 'has_seed_range_data': True if this is a seed range result with individual_results
    """
    if template_file not in test_results:
        return {'failing_seed': None, 'last_passing_seed': None, 'seed_range_tested': None, 'has_seed_range_data': False}

    result = test_results[template_file]

    if not isinstance(result, dict):
        return {'failing_seed': None, 'last_passing_seed': None, 'seed_range_tested': None, 'has_seed_range_data': False}

    # Check if this is a seed range result (has seed_range field or individual_results)
    seed_range = result.get('seed_range')
    has_seed_range_data = 'individual_results' in result or seed_range is not None

    if 'first_failure_seed' in result and result['first_failure_seed'] is not None:
        # Has a failing seed
        failing_seed = result['first_failure_seed']
        last_passing = result.get('consecutive_passes_before_failure', 0)

        return {
            'failing_seed': failing_seed,
            'last_passing_seed': last_passing if last_passing > 0 else None,
            'seed_range_tested': seed_range,
            'has_seed_range_data': has_seed_range_data
        }
    elif seed_range is not None:
        # No failing seed, but has seed range data (all seeds passed)
        return {
            'failing_seed': None,
            'last_passing_seed': None,
            'seed_range_tested': seed_range,
            'has_seed_range_data': has_seed_range_data
        }

    # Single seed test or no seed range info
    return {'failing_seed': None, 'last_passing_seed': None, 'seed_range_tested': None, 'has_seed_range_data': False}


def load_existing_results(results_file: str) -> Dict:
    """Load existing results file or create empty structure."""
    if os.path.exists(results_file):
        try:
            with open(results_file, 'r') as f:
                data = json.load(f)

                # Check if this is an old-format file (list-based results from old multiplayer script)
                if isinstance(data.get('results'), list):
                    # Convert old format to new format
                    print("Converting old-format results file to new format...")
                    return {
                        'metadata': {
                            'created': data.get('timestamp', datetime.now().isoformat()),
                            'last_updated': datetime.now().isoformat(),
                            'script_version': '1.0.0'
                        },
                        'results': {}
                    }

                # Check if metadata exists, if not add it
                if 'metadata' not in data:
                    data['metadata'] = {
                        'created': datetime.now().isoformat(),
                        'last_updated': datetime.now().isoformat(),
                        'script_version': '1.0.0'
                    }

                return data
        except (json.JSONDecodeError, IOError):
            pass

    return {
        'metadata': {
            'created': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat(),
            'script_version': '1.0.0'
        },
        'results': {}
    }


def merge_results(existing_results: Dict, new_results: Dict, templates_tested: List[str], update_metadata: bool = True) -> Dict:
    """
    Merge new test results into existing results.
    Only updates entries for templates/seeds that were tested in the current run.
    Preserves all other existing results.

    For seed range tests, merges at the individual seed level - if you test seeds 1-10
    and then retest just seed 1, only seed 1's results are updated.

    Args:
        existing_results: The existing results to merge into
        new_results: The new results from this run
        templates_tested: List of template names tested in this run
        update_metadata: If True, updates metadata fields like batch processing time
    """
    merged = existing_results.copy()

    # Only update metadata if requested (typically only for full runs, not --include-list runs)
    if update_metadata:
        merged['metadata']['last_updated'] = new_results['metadata']['last_updated']

        # Copy over batch processing time metadata from new results if present
        for key in ['batch_processing_time_seconds', 'batch_processing_time_minutes', 'average_time_per_template_seconds']:
            if key in new_results['metadata']:
                merged['metadata'][key] = new_results['metadata'][key]
    else:
        # Always update last_updated timestamp, but not the batch processing metrics
        merged['metadata']['last_updated'] = new_results['metadata']['last_updated']

    # Merge results: only update entries for templates tested in this run
    if 'results' not in merged:
        merged['results'] = {}

    for template_name in templates_tested:
        if template_name not in new_results['results']:
            continue

        new_result = new_results['results'][template_name]

        # Check if existing result is a seed range (has 'individual_results' key)
        existing_has_seed_range = (template_name in merged['results'] and
                                   'individual_results' in merged['results'][template_name])

        # Check if this is a seed range result (has 'individual_results' key)
        if 'individual_results' in new_result:
            # New result is a seed range result - merge at the seed level
            if existing_has_seed_range:
                # Template already exists with seed range results - merge individual seeds
                existing_template = merged['results'][template_name]

                # Merge individual seed results
                if 'individual_results' not in existing_template:
                    existing_template['individual_results'] = {}

                for seed, seed_result in new_result['individual_results'].items():
                    existing_template['individual_results'][seed] = seed_result

                # Recalculate summary statistics based on all seeds
                all_seeds = existing_template['individual_results']
                total_seeds = len(all_seeds)
                seeds_passed = 0
                seeds_failed = 0
                first_failure_seed = None
                first_failure_reason = None
                consecutive_passes = 0

                # Sort seeds numerically for consistent processing
                sorted_seeds = sorted(all_seeds.keys(), key=lambda x: int(x))

                for seed in sorted_seeds:
                    seed_result = all_seeds[seed]
                    # Check if seed passed (same logic as in test_template_seed_range)
                    if 'spoiler_test' in seed_result:
                        passed = seed_result.get('spoiler_test', {}).get('pass_fail') == 'passed'
                    else:
                        passed = seed_result.get('generation', {}).get('success', False)

                    if passed:
                        seeds_passed += 1
                        if first_failure_seed is None:
                            consecutive_passes += 1
                    else:
                        seeds_failed += 1
                        if first_failure_seed is None:
                            first_failure_seed = int(seed)
                            # Get failure reason from the seed result
                            if 'spoiler_test' in seed_result:
                                spoiler_result = seed_result.get('spoiler_test', {})
                                if spoiler_result.get('first_error_line'):
                                    first_failure_reason = f"Test error: {spoiler_result['first_error_line']}"
                                else:
                                    first_failure_reason = f"Test failed at sphere {spoiler_result.get('sphere_reached', 0)}"
                            else:
                                gen_result = seed_result.get('generation', {})
                                if gen_result.get('first_error_line'):
                                    first_failure_reason = f"Generation error: {gen_result['first_error_line']}"
                                else:
                                    first_failure_reason = f"Generation failed with return code {gen_result.get('return_code')}"

                # Update summary fields
                existing_template['total_seeds_tested'] = total_seeds
                existing_template['seeds_passed'] = seeds_passed
                existing_template['seeds_failed'] = seeds_failed
                existing_template['first_failure_seed'] = first_failure_seed
                existing_template['first_failure_reason'] = first_failure_reason
                existing_template['consecutive_passes_before_failure'] = consecutive_passes

                # Update seed_range to reflect actual range
                if sorted_seeds:
                    existing_template['seed_range'] = f"{sorted_seeds[0]}-{sorted_seeds[-1]}" if len(sorted_seeds) > 1 else str(sorted_seeds[0])

                # Update summary stats
                if total_seeds > 0:
                    existing_template['summary']['failure_rate'] = seeds_failed / total_seeds
                    existing_template['summary']['all_passed'] = seeds_failed == 0
                    existing_template['summary']['any_failed'] = seeds_failed > 0

                # Update timestamp
                existing_template['timestamp'] = new_result['timestamp']

            else:
                # No existing seed range results for this template, use new results entirely
                merged['results'][template_name] = new_result
        else:
            # New result is a single seed result
            if existing_has_seed_range:
                # Existing result is a seed range - merge this single seed into it
                existing_template = merged['results'][template_name]

                # Get the seed from the new result
                seed = new_result.get('seed', '1')

                # Add this single seed result to the individual_results
                if 'individual_results' not in existing_template:
                    existing_template['individual_results'] = {}

                existing_template['individual_results'][seed] = new_result

                # Recalculate summary statistics (same logic as above)
                all_seeds = existing_template['individual_results']
                total_seeds = len(all_seeds)
                seeds_passed = 0
                seeds_failed = 0
                first_failure_seed = None
                first_failure_reason = None
                consecutive_passes = 0

                # Sort seeds numerically for consistent processing
                sorted_seeds = sorted(all_seeds.keys(), key=lambda x: int(x))

                for seed in sorted_seeds:
                    seed_result = all_seeds[seed]
                    # Check if seed passed
                    if 'spoiler_test' in seed_result:
                        passed = seed_result.get('spoiler_test', {}).get('pass_fail') == 'passed'
                    else:
                        passed = seed_result.get('generation', {}).get('success', False)

                    if passed:
                        seeds_passed += 1
                        if first_failure_seed is None:
                            consecutive_passes += 1
                    else:
                        seeds_failed += 1
                        if first_failure_seed is None:
                            first_failure_seed = int(seed)
                            # Get failure reason from the seed result
                            if 'spoiler_test' in seed_result:
                                spoiler_result = seed_result.get('spoiler_test', {})
                                if spoiler_result.get('first_error_line'):
                                    first_failure_reason = f"Test error: {spoiler_result['first_error_line']}"
                                else:
                                    first_failure_reason = f"Test failed at sphere {spoiler_result.get('sphere_reached', 0)}"
                            else:
                                gen_result = seed_result.get('generation', {})
                                if gen_result.get('first_error_line'):
                                    first_failure_reason = f"Generation error: {gen_result['first_error_line']}"
                                else:
                                    first_failure_reason = f"Generation failed with return code {gen_result.get('return_code')}"

                # Update summary fields
                existing_template['total_seeds_tested'] = total_seeds
                existing_template['seeds_passed'] = seeds_passed
                existing_template['seeds_failed'] = seeds_failed
                existing_template['first_failure_seed'] = first_failure_seed
                existing_template['first_failure_reason'] = first_failure_reason
                existing_template['consecutive_passes_before_failure'] = consecutive_passes

                # Update seed_range to reflect actual range
                if sorted_seeds:
                    existing_template['seed_range'] = f"{sorted_seeds[0]}-{sorted_seeds[-1]}" if len(sorted_seeds) > 1 else str(sorted_seeds[0])

                # Update summary stats
                if total_seeds > 0:
                    existing_template['summary']['failure_rate'] = seeds_failed / total_seeds
                    existing_template['summary']['all_passed'] = seeds_failed == 0
                    existing_template['summary']['any_failed'] = seeds_failed > 0

                # Update timestamp
                existing_template['timestamp'] = new_result['timestamp']
            else:
                # Single seed result and no existing seed range - replace entirely
                merged['results'][template_name] = new_result

    return merged


def save_results(results: Dict, results_file: str, batch_processing_time: float = None, timestamped_file: str = None):
    """Save results to JSON file and optionally to a timestamped file."""
    results['metadata']['last_updated'] = datetime.now().isoformat()

    # Add batch processing time if provided
    if batch_processing_time is not None:
        results['metadata']['batch_processing_time_seconds'] = round(batch_processing_time, 1)
        results['metadata']['batch_processing_time_minutes'] = round(batch_processing_time / 60, 1)

        # Calculate average time per template if we have results
        if 'results' in results and len(results['results']) > 0:
            avg_time = batch_processing_time / len(results['results'])
            results['metadata']['average_time_per_template_seconds'] = round(avg_time, 1)

    # Save to timestamped file if provided
    if timestamped_file:
        try:
            with open(timestamped_file, 'w') as f:
                json.dump(results, f, indent=2, sort_keys=True)
            print(f"Timestamped results saved to: {timestamped_file}")
        except IOError as e:
            print(f"Error saving timestamped results: {e}")

    # Save to main results file
    try:
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2, sort_keys=True)
        print(f"Results saved to: {results_file}")
    except IOError as e:
        print(f"Error saving results: {e}")
