#!/usr/bin/env python3
"""
Core test execution functions for running template tests.

This module contains the main test execution logic for:
- Testing single seeds
- Testing seed ranges
- Running generation (Generate.py)
- Running spoiler tests
- Running multiplayer tests
"""

import os
import time
from datetime import datetime
from typing import Dict, List
from seed_utils import get_seed_id as compute_seed_id

# Import from the utility modules
from test_utils import (
    normalize_game_name,
    get_world_info,
    count_errors_and_warnings,
    run_command,
    count_total_spheres,
    parse_multiplayer_test_results,
    parse_playwright_analysis
)


def test_template_single_seed(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed: str = "1", export_only: bool = False, test_only: bool = False, multiplayer: bool = False, single_client: bool = False, headed: bool = False) -> Dict:
    """Test a single template file and return results."""
    template_name = os.path.basename(template_file)
    game_name = normalize_game_name(template_name)

    # Compute seed ID directly from seed number
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        seed_id = None

    # Get world info using the provided world mapping
    world_info = get_world_info(template_file, templates_dir, world_mapping)

    print(f"\n=== Testing {template_name} ===")

    result = {
        'template_name': template_name,
        'game_name': game_name,
        'seed': seed,
        'seed_id': seed_id,
        'timestamp': datetime.now().isoformat(),
        'world_info': world_info,
        'generation': {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None,
            'return_code': None,
            'processing_time_seconds': 0
        },
        'rules_file': {
            'path': None,
            'size_bytes': 0,
            'size_mb': 0.0
        }
    }

    # Add appropriate test structure based on test type
    if multiplayer:
        result['multiplayer_test'] = {
            'success': False,
            'client1_passed': False,
            'locations_checked': 0,
            'total_locations': 0,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None,
            'return_code': None,
            'processing_time_seconds': 0
        }
    else:
        result['spoiler_test'] = {
            'success': False,
            'pass_fail': 'unknown',
            'sphere_reached': 0,
            'total_spheres': 0,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None,
            'return_code': None,
            'processing_time_seconds': 0
        }
        result['analysis'] = {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None
        }

    # Step 1: Run Generate.py (skip if test_only mode)
    if not test_only:
        print(f"Running Generate.py for {template_name}...")
        # Ensure template name has .yaml extension for the file path
        template_file = template_name if template_name.endswith(('.yaml', '.yml')) else f"{template_name}.yaml"
        template_path = f"Templates/{template_file}"
        generate_cmd = [
            "python", "Generate.py",
            "--weights_file_path", template_path,
            "--multi", "1",
            "--seed", seed
        ]

        # Time the generation process
        gen_start_time = time.time()
        gen_return_code, gen_stdout, gen_stderr = run_command(generate_cmd, cwd=project_root, timeout=600)
        gen_end_time = time.time()
        gen_processing_time = round(gen_end_time - gen_start_time, 2)

        # Write generate output to file
        generate_output_file = os.path.join(project_root, "generate_output.txt")
        with open(generate_output_file, 'w') as f:
            f.write(f"STDOUT:\n{gen_stdout}\n\nSTDERR:\n{gen_stderr}\n")

        # Seed ID is already computed, no need to extract or verify

        # Analyze generation output
        full_output = gen_stdout + "\n" + gen_stderr
        gen_error_count, gen_warning_count, gen_first_error, gen_first_warning = count_errors_and_warnings(full_output)

        result['generation'].update({
            'success': gen_return_code == 0,
            'return_code': gen_return_code,
            'error_count': gen_error_count,
            'warning_count': gen_warning_count,
            'first_error_line': gen_first_error,
            'first_warning_line': gen_first_warning,
            'processing_time_seconds': gen_processing_time
        })

        # Remove the test-only note if it exists from a previous run
        result['generation'].pop('note', None)

        if gen_return_code != 0:
            print(f"Generation failed with return code {gen_return_code}")
            return result
    else:
        print(f"Skipping generation for {template_name} (test-only mode)")
        # In test-only mode, don't overwrite error counts - keep the defaults initialized above
        # This preserves any existing generation error data from previous runs
        result['generation']['note'] = 'Skipped in test-only mode'

    # Return early if export_only mode
    if export_only:
        print(f"Export completed for {template_name} (export-only mode)")
        return result

    # Check if rules file exists (files are actually in frontend/presets/)
    rules_path = f"./presets/{game_name}/{seed_id}/{seed_id}_rules.json"
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))
    if not os.path.exists(full_rules_path):
        print(f"Rules file not found: {full_rules_path}")
        test_key = 'multiplayer_test' if multiplayer else 'spoiler_test'
        result[test_key]['error_count'] = 1
        result[test_key]['first_error_line'] = f"Rules file not found: {rules_path}"
        return result

    # Step 2: Run test (multiplayer or spoiler based on mode)
    if multiplayer:
        # Multiplayer test
        test_mode = "single-client" if single_client else "dual-client"
        print(f"Running multiplayer timer test ({test_mode} mode)...")

        # Run the multiplayer test
        if single_client:
            # Single-client mode
            multiplayer_cmd = [
                "npx", "playwright", "test",
                "tests/e2e/multiplayer.spec.js",
                "-g", "single client timer test"
            ]
            multiplayer_env = os.environ.copy()
            multiplayer_env['ENABLE_SINGLE_CLIENT'] = 'true'
        else:
            # Dual-client mode (default)
            multiplayer_cmd = [
                "npx", "playwright", "test",
                "tests/e2e/multiplayer.spec.js",
                "-g", "multiplayer timer test"
            ]
            multiplayer_env = os.environ.copy()

        # Add --headed flag if requested
        if headed:
            multiplayer_cmd.append("--headed")

        multiplayer_env['TEST_GAME'] = game_name
        multiplayer_env['TEST_SEED'] = seed

        # Time the multiplayer test process
        test_start_time = time.time()
        test_return_code, test_stdout, test_stderr = run_command(
            multiplayer_cmd, cwd=project_root, timeout=180, env=multiplayer_env
        )
        test_end_time = time.time()
        test_processing_time = round(test_end_time - test_start_time, 2)

        result['multiplayer_test']['return_code'] = test_return_code
        result['multiplayer_test']['processing_time_seconds'] = test_processing_time

        # Analyze test output
        full_output = test_stdout + "\n" + test_stderr
        test_error_count, test_warning_count, test_first_error, test_first_warning = count_errors_and_warnings(full_output)

        result['multiplayer_test']['error_count'] = test_error_count
        result['multiplayer_test']['warning_count'] = test_warning_count
        result['multiplayer_test']['first_error_line'] = test_first_error
        result['multiplayer_test']['first_warning_line'] = test_first_warning

        # Parse test results
        test_results_dir = os.path.join(project_root, 'test_results', 'multiplayer')
        test_results = parse_multiplayer_test_results(test_results_dir)

        result['multiplayer_test'].update({
            'success': test_results['success'],
            'client1_passed': test_results['client1_passed'],
            'client2_passed': test_results['client2_passed'],
            'client1_locations_checked': test_results['client1_locations_checked'],
            'client1_manually_checkable': test_results['client1_manually_checkable'],
            'client2_locations_received': test_results['client2_locations_received'],
            'client2_total_locations': test_results['client2_total_locations'],
            # Legacy fields for backwards compatibility
            'locations_checked': test_results['client2_locations_received'],
            'total_locations': test_results['client2_total_locations']
        })

        if test_results.get('error_message'):
            result['multiplayer_test']['first_error_line'] = test_results['error_message']

    else:
        # Spoiler test
        print("Running spoiler test...")

        # Use npm run test:headed if --headed flag is set
        if headed:
            spoiler_cmd = ["npm", "run", "test:headed", f"--mode=test-spoilers", f"--game={game_name}", f"--seed={seed}"]
        else:
            spoiler_cmd = ["npm", "test", "--mode=test-spoilers", f"--game={game_name}", f"--seed={seed}"]
        spoiler_env = os.environ.copy()

        # Time the spoiler test process
        spoiler_start_time = time.time()
        spoiler_return_code, spoiler_stdout, spoiler_stderr = run_command(
            spoiler_cmd, cwd=project_root, timeout=900, env=spoiler_env
        )
        spoiler_end_time = time.time()
        spoiler_processing_time = round(spoiler_end_time - spoiler_start_time, 2)

        result['spoiler_test']['return_code'] = spoiler_return_code
        result['spoiler_test']['success'] = spoiler_return_code == 0
        result['spoiler_test']['processing_time_seconds'] = spoiler_processing_time

        # Step 3: Run test analysis
        print("Running test analysis...")
        analysis_cmd = ["npm", "run", "test:analyze"]
        analysis_return_code, analysis_stdout, analysis_stderr = run_command(
            analysis_cmd, cwd=project_root, timeout=60
        )

        # Read playwright-analysis.txt if it exists
        analysis_file = os.path.join(project_root, "playwright-analysis.txt")
        if os.path.exists(analysis_file):
            try:
                with open(analysis_file, 'r') as f:
                    analysis_text = f.read()

                # Parse the analysis
                analysis_result = parse_playwright_analysis(analysis_text)
                result['spoiler_test'].update(analysis_result)
                result['analysis']['success'] = True

            except IOError:
                result['analysis']['first_error_line'] = "Could not read playwright-analysis.txt"
        else:
            result['analysis']['first_error_line'] = "playwright-analysis.txt not found"

        # Read total spheres from spheres_log.jsonl file
        spheres_log_path = os.path.join(project_root, 'frontend', 'presets', game_name, seed_id, f'{seed_id}_spheres_log.jsonl')
        total_spheres = count_total_spheres(spheres_log_path)
        result['spoiler_test']['total_spheres'] = total_spheres

        # If test passed, sphere_reached should equal total_spheres
        if result['spoiler_test']['pass_fail'] == 'passed':
            result['spoiler_test']['sphere_reached'] = total_spheres

    # Get rules file size
    rules_file_path = os.path.join(project_root, 'frontend', 'presets', game_name, seed_id, f'{seed_id}_rules.json')
    try:
        if os.path.exists(rules_file_path):
            file_size_bytes = os.path.getsize(rules_file_path)
            file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
            result['rules_file'] = {
                'path': f'frontend/presets/{game_name}/{seed_id}/{seed_id}_rules.json',
                'size_bytes': file_size_bytes,
                'size_mb': file_size_mb
            }
        else:
            result['rules_file'] = {
                'path': f'frontend/presets/{game_name}/{seed_id}/{seed_id}_rules.json',
                'size_bytes': 0,
                'size_mb': 0.0,
                'note': 'File not found'
            }
    except OSError:
        result['rules_file'] = {
            'path': f'frontend/presets/{game_name}/{seed_id}/{seed_id}_rules.json',
            'size_bytes': 0,
            'size_mb': 0.0,
            'note': 'Error reading file size'
        }

    if multiplayer:
        print(f"Completed {template_name}: Generation={'[PASS]' if result['generation']['success'] else '[FAIL]'}, "
              f"Test={'[PASS]' if result['multiplayer_test']['success'] else '[FAIL]'}, "
              f"Gen Errors={result['generation']['error_count']}, "
              f"Locations Checked={result['multiplayer_test']['locations_checked']}/{result['multiplayer_test']['total_locations']}")
    else:
        print(f"Completed {template_name}: Generation={'[PASS]' if result['generation']['success'] else '[FAIL]'}, "
              f"Test={'[PASS]' if result['spoiler_test']['pass_fail'] == 'passed' else '[FAIL]'}, "
              f"Gen Errors={result['generation']['error_count']}, "
              f"Sphere Reached={result['spoiler_test']['sphere_reached']}, "
              f"Max Spheres={result['spoiler_test']['total_spheres']}")

    return result


def test_template_seed_range(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed_list: List[int], export_only: bool = False, test_only: bool = False, stop_on_failure: bool = False, multiplayer: bool = False, single_client: bool = False, headed: bool = False) -> Dict:
    """Test a template file with multiple seeds and return aggregated results."""
    template_name = os.path.basename(template_file)

    print(f"\n=== Testing {template_name} with {len(seed_list)} seeds ===")

    # Initialize seed range result
    seed_range_result = {
        'template_name': template_name,
        'seed_range': f"{seed_list[0]}-{seed_list[-1]}" if len(seed_list) > 1 else str(seed_list[0]),
        'total_seeds_tested': 0,
        'seeds_passed': 0,
        'seeds_failed': 0,
        'first_failure_seed': None,
        'first_failure_reason': None,
        'consecutive_passes_before_failure': 0,
        'stop_on_failure': stop_on_failure,
        'timestamp': datetime.now().isoformat(),
        'individual_results': {},
        'summary': {
            'all_passed': False,
            'any_failed': False,
            'failure_rate': 0.0
        }
    }

    consecutive_passes = 0

    for i, seed in enumerate(seed_list, 1):
        print(f"\n--- Seed {seed} ({i}/{len(seed_list)}) ---")

        try:
            # Test this specific seed
            result = test_template_single_seed(
                template_file, templates_dir, project_root, world_mapping,
                str(seed), export_only, test_only, multiplayer, single_client, headed
            )

            seed_range_result['individual_results'][str(seed)] = result
            seed_range_result['total_seeds_tested'] += 1

            # Check if this seed passed
            if export_only:
                passed = result.get('generation', {}).get('success', False)
            elif multiplayer:
                passed = result.get('multiplayer_test', {}).get('success', False)
            else:
                passed = result.get('spoiler_test', {}).get('pass_fail') == 'passed'

            if passed:
                seed_range_result['seeds_passed'] += 1
                consecutive_passes += 1
                print(f"✅ Seed {seed} PASSED")
            else:
                seed_range_result['seeds_failed'] += 1
                print(f"❌ Seed {seed} FAILED")

                # Record first failure
                if seed_range_result['first_failure_seed'] is None:
                    seed_range_result['first_failure_seed'] = seed
                    seed_range_result['consecutive_passes_before_failure'] = consecutive_passes

                    # Determine failure reason
                    if export_only:
                        gen_result = result.get('generation', {})
                        if gen_result.get('first_error_line'):
                            seed_range_result['first_failure_reason'] = f"Generation error: {gen_result['first_error_line']}"
                        else:
                            seed_range_result['first_failure_reason'] = f"Generation failed with return code {gen_result.get('return_code')}"
                    elif multiplayer:
                        mp_result = result.get('multiplayer_test', {})
                        if mp_result.get('first_error_line'):
                            seed_range_result['first_failure_reason'] = f"Multiplayer test error: {mp_result['first_error_line']}"
                        else:
                            locations_checked = mp_result.get('locations_checked', 0)
                            total_locations = mp_result.get('total_locations', 0)
                            seed_range_result['first_failure_reason'] = f"Multiplayer test failed: {locations_checked}/{total_locations} locations checked"
                    else:
                        spoiler_result = result.get('spoiler_test', {})
                        if spoiler_result.get('first_error_line'):
                            seed_range_result['first_failure_reason'] = f"Test error: {spoiler_result['first_error_line']}"
                        else:
                            seed_range_result['first_failure_reason'] = f"Test failed at sphere {spoiler_result.get('sphere_reached', 0)}"

                # Stop on failure if requested
                if stop_on_failure:
                    print(f"Stopping at first failure (seed {seed})")
                    break

                # Reset consecutive passes counter after failure
                consecutive_passes = 0

        except Exception as e:
            print(f"❌ Seed {seed} ERROR: {e}")
            seed_range_result['total_seeds_tested'] += 1
            seed_range_result['seeds_failed'] += 1

            # Record as first failure if none yet
            if seed_range_result['first_failure_seed'] is None:
                seed_range_result['first_failure_seed'] = seed
                seed_range_result['consecutive_passes_before_failure'] = consecutive_passes
                seed_range_result['first_failure_reason'] = f"Exception: {str(e)}"

            if stop_on_failure:
                print(f"Stopping due to exception on seed {seed}")
                break

            consecutive_passes = 0

    # Calculate summary statistics
    total_tested = seed_range_result['total_seeds_tested']
    if total_tested > 0:
        seed_range_result['summary']['failure_rate'] = seed_range_result['seeds_failed'] / total_tested
        seed_range_result['summary']['all_passed'] = seed_range_result['seeds_failed'] == 0
        seed_range_result['summary']['any_failed'] = seed_range_result['seeds_failed'] > 0

    # If no failures and we tested all seeds, consecutive passes = total
    if seed_range_result['first_failure_seed'] is None:
        seed_range_result['consecutive_passes_before_failure'] = seed_range_result['seeds_passed']

    # Print summary
    print(f"\n=== Seed Range Summary for {template_name} ===")
    print(f"Seeds tested: {total_tested}")
    print(f"Passed: {seed_range_result['seeds_passed']}")
    print(f"Failed: {seed_range_result['seeds_failed']}")
    if seed_range_result['first_failure_seed'] is not None:
        print(f"First failure at seed: {seed_range_result['first_failure_seed']}")
        print(f"Consecutive passes before failure: {seed_range_result['consecutive_passes_before_failure']}")
        print(f"Failure reason: {seed_range_result['first_failure_reason']}")
    else:
        print(f"🎉 All {seed_range_result['seeds_passed']} seeds passed!")

    return seed_range_result
