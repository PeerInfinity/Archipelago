#!/usr/bin/env python3
"""
Core test execution functions for running template tests.

This module contains the main test execution logic for:
- Testing single seeds
- Testing seed ranges
- Running generation (Generate.py)
- Running spoiler tests
- Running multiplayer tests
- Running multiworld tests
"""

import json
import os
import shutil
import time
from datetime import datetime
from typing import Dict, List
from .seed_utils import get_seed_id as compute_seed_id

# Import from the utility modules
from .test_utils import (
    normalize_game_name,
    get_world_info,
    count_errors_and_warnings,
    classify_generation_error,
    run_command,
    count_total_spheres,
    parse_multiplayer_test_results,
    parse_playwright_analysis
)


def test_template_single_seed(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed: str = "1", export_only: bool = False, test_only: bool = False, multiplayer: bool = False, single_client: bool = False, headed: bool = False, include_error_details: bool = False) -> Dict:
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
            # 'first_error_line': None,  # Disabled by default, use --include-error-details to enable
            # 'first_warning_line': None,  # Disabled by default, use --include-error-details to enable
            'return_code': None,
            'processing_time_seconds': 0
        },
        'rules_file': {
            'path': None,
            'size_bytes': 0,
            'size_mb': 0.0
        }
    }

    # Conditionally add error detail fields if requested
    if include_error_details:
        result['generation']['first_error_line'] = None
        result['generation']['first_warning_line'] = None

    # Add appropriate test structure based on test type
    if multiplayer:
        result['multiplayer_test'] = {
            'success': False,
            'client1_passed': False,
            'locations_checked': 0,
            'total_locations': 0,
            'error_count': 0,
            'warning_count': 0,
            # 'first_error_line': None,  # Disabled by default, use --include-error-details to enable
            # 'first_warning_line': None,  # Disabled by default, use --include-error-details to enable
            'return_code': None,
            'processing_time_seconds': 0
        }
        if include_error_details:
            result['multiplayer_test']['first_error_line'] = None
            result['multiplayer_test']['first_warning_line'] = None
    else:
        result['spoiler_test'] = {
            'success': False,
            'pass_fail': 'unknown',
            'sphere_reached': 0,
            'total_spheres': 0,
            'error_count': 0,
            'warning_count': 0,
            # 'first_error_line': None,  # Disabled by default, use --include-error-details to enable
            # 'first_warning_line': None,  # Disabled by default, use --include-error-details to enable
            'return_code': None,
            'processing_time_seconds': 0
        }
        result['analysis'] = {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            # 'first_error_line': None,  # Disabled by default, use --include-error-details to enable
            # 'first_warning_line': None  # Disabled by default, use --include-error-details to enable
        }
        if include_error_details:
            result['spoiler_test']['first_error_line'] = None
            result['spoiler_test']['first_warning_line'] = None
            result['analysis']['first_error_line'] = None
            result['analysis']['first_warning_line'] = None

    # Step 1: Run Generate.py (skip if test_only mode)
    if not test_only:
        print(f"Running Generate.py for {template_name}...")
        # Ensure template name has .yaml extension for the file path
        template_file = template_name if template_name.endswith(('.yaml', '.yml')) else f"{template_name}.yaml"
        # Use the provided templates_dir, which is relative to Players/ directory
        template_path = os.path.join(templates_dir, template_file)
        generate_cmd = [
            "python", "Generate.py",
            "--weights_file_path", template_path,
            "--multi", "1",
            "--seed", seed
        ]

        # Show the command being run
        print(f"  Command: {' '.join(generate_cmd)}")

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
        gen_error_type = classify_generation_error(full_output) if gen_return_code != 0 else None

        gen_update = {
            'success': gen_return_code == 0,
            'return_code': gen_return_code,
            'error_count': gen_error_count,
            'warning_count': gen_warning_count,
            'error_type': gen_error_type,
            'processing_time_seconds': gen_processing_time
        }
        if include_error_details:
            gen_update['first_error_line'] = gen_first_error
            gen_update['first_warning_line'] = gen_first_warning
        result['generation'].update(gen_update)

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
    # Use world_directory from world_info if available (for multitemplate mode),
    # otherwise fall back to game_name
    preset_dir = world_info.get('world_directory', game_name) if world_info else game_name
    rules_path = f"./presets/{preset_dir}/{seed_id}/{seed_id}_rules.json"
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))
    if not os.path.exists(full_rules_path):
        print(f"Rules file not found: {full_rules_path}")
        test_key = 'multiplayer_test' if multiplayer else 'spoiler_test'
        result[test_key]['error_count'] = 1
        if include_error_details:
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

        # Use world_directory for the test game parameter (same as rules file lookup)
        test_game = preset_dir

        multiplayer_env['TEST_GAME'] = test_game
        multiplayer_env['TEST_SEED'] = seed

        # Show the command being run
        print(f"  Command: {' '.join(multiplayer_cmd)}")
        print(f"  Environment: TEST_GAME={test_game} TEST_SEED={seed}")

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
        if include_error_details:
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

        if include_error_details and test_results.get('error_message'):
            result['multiplayer_test']['first_error_line'] = test_results['error_message']

    else:
        # Spoiler test
        print("Running spoiler test...")

        # Use world_directory for the test game parameter (same as rules file lookup)
        test_game = preset_dir

        # Use npm run test:headed if --headed flag is set
        if headed:
            spoiler_cmd = ["npm", "run", "test:headed", f"--mode=test-spoilers", f"--game={test_game}", f"--seed={seed}"]
        else:
            spoiler_cmd = ["npm", "test", "--mode=test-spoilers", f"--game={test_game}", f"--seed={seed}"]

        # Show the command being run
        print(f"  Command: {' '.join(spoiler_cmd)}")

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
                # Filter out error detail fields if not requested
                if not include_error_details:
                    analysis_result.pop('first_error_line', None)
                    analysis_result.pop('first_warning_line', None)
                result['spoiler_test'].update(analysis_result)
                result['analysis']['success'] = True

            except IOError:
                if include_error_details:
                    result['analysis']['first_error_line'] = "Could not read playwright-analysis.txt"
        else:
            if include_error_details:
                result['analysis']['first_error_line'] = "playwright-analysis.txt not found"

        # Read total spheres from spheres_log.jsonl file
        # Use preset_dir (world_directory) instead of game_name for correct path
        spheres_log_path = os.path.join(project_root, 'frontend', 'presets', preset_dir, seed_id, f'{seed_id}_spheres_log.jsonl')
        total_spheres = count_total_spheres(spheres_log_path)
        result['spoiler_test']['total_spheres'] = total_spheres

        # If test passed, sphere_reached should equal total_spheres
        if result['spoiler_test']['pass_fail'] == 'passed':
            result['spoiler_test']['sphere_reached'] = total_spheres

    # Get rules file size
    # Use preset_dir (world_directory) instead of game_name for correct path
    rules_file_path = os.path.join(project_root, 'frontend', 'presets', preset_dir, seed_id, f'{seed_id}_rules.json')
    try:
        if os.path.exists(rules_file_path):
            file_size_bytes = os.path.getsize(rules_file_path)
            file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
            result['rules_file'] = {
                'path': f'frontend/presets/{preset_dir}/{seed_id}/{seed_id}_rules.json',
                'size_bytes': file_size_bytes,
                'size_mb': file_size_mb
            }
        else:
            result['rules_file'] = {
                'path': f'frontend/presets/{preset_dir}/{seed_id}/{seed_id}_rules.json',
                'size_bytes': 0,
                'size_mb': 0.0,
                'note': 'File not found'
            }
    except OSError:
        result['rules_file'] = {
            'path': f'frontend/presets/{preset_dir}/{seed_id}/{seed_id}_rules.json',
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


def test_template_seed_range(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed_list: List[int], export_only: bool = False, test_only: bool = False, stop_on_failure: bool = False, multiplayer: bool = False, single_client: bool = False, headed: bool = False, include_error_details: bool = False) -> Dict:
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
                str(seed), export_only, test_only, multiplayer, single_client, headed,
                include_error_details
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


def test_template_multiworld(template_file: str, templates_dir: str, project_root: str,
                            world_mapping: Dict[str, Dict], seed: str,
                            multiworld_dir: str, existing_results: Dict,
                            current_player_count: int, export_only: bool = False,
                            test_only: bool = False, headed: bool = False,
                            keep_templates: bool = False, test_all_players: bool = False,
                            include_error_details: bool = False) -> Dict:
    """
    Test a single template in multiworld mode.

    This checks if the template has passed all prerequisite tests (spoiler minimal,
    spoiler full, and multiplayer), then copies it to the multiworld directory,
    runs generation with all accumulated templates, and tests each player.

    Args:
        template_file: Name of the template file to test
        templates_dir: Path to templates directory
        project_root: Path to project root
        world_mapping: World mapping dictionary
        seed: Seed number to use
        multiworld_dir: Path to Players/presets/Multiworld directory
        existing_results: Dictionary containing all test results (spoiler-minimal, spoiler-full, multiplayer)
        current_player_count: Number of players currently in the multiworld directory (before adding this one)
        export_only: If True, only run generation
        test_only: If True, skip generation
        headed: If True, run Playwright tests in headed mode
        keep_templates: If True, don't copy template to multiworld directory (just test existing templates)
        test_all_players: If True, test all players; if False, only test the newly added player

    Returns:
        Dictionary with test results
    """
    template_name = os.path.basename(template_file)
    game_name = normalize_game_name(template_name)

    # Compute seed ID
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        seed_id = None

    # Get world info
    world_info = get_world_info(template_file, templates_dir, world_mapping)

    print(f"\n=== Testing {template_name} (Multiworld Mode) ===")

    result = {
        'template_name': template_name,
        'game_name': game_name,
        'seed': seed,
        'seed_id': seed_id,
        'timestamp': datetime.now().isoformat(),
        'world_info': world_info,
        'prerequisite_check': {
            'spoiler_minimal_passed': False,
            'spoiler_full_passed': False,
            'multiplayer_passed': False,
            'all_prerequisites_passed': False
        },
        'multiworld_test': {
            'success': False,
            'player_number': current_player_count + 1,
            'total_players_tested': 0,
            'players_passed': 0,
            'players_failed': 0,
            'first_failure_player': None,
            'player_results': {},
            'processing_time_seconds': 0
        }
    }

    # Check prerequisites - the template must have passed all three other test types
    print(f"Checking prerequisites for {template_name}...")

    # Load the three test results files
    spoiler_minimal_file = os.path.join(project_root, 'scripts/output-spoiler-minimal/test-results.json')
    spoiler_full_file = os.path.join(project_root, 'scripts/output-spoiler-full/test-results.json')
    multiplayer_file = os.path.join(project_root, 'scripts/output-multiplayer/test-results.json')

    spoiler_minimal_passed = False
    spoiler_full_passed = False
    multiplayer_passed = False

    # Check spoiler minimal
    if os.path.exists(spoiler_minimal_file):
        with open(spoiler_minimal_file, 'r') as f:
            spoiler_minimal_results = json.load(f)
            if template_name in spoiler_minimal_results.get('results', {}):
                template_result = spoiler_minimal_results['results'][template_name]
                if isinstance(template_result, dict):
                    # Check if this is seed range data (same logic as postprocessing script)
                    if 'seed_range' in template_result:
                        # Seed range results - check if all seeds passed
                        seeds_failed = template_result.get('seeds_failed', 0)
                        seeds_passed = template_result.get('seeds_passed', 0)
                        spoiler_minimal_passed = (seeds_failed == 0 and seeds_passed > 0)
                    else:
                        # Single seed result
                        spoiler_test = template_result.get('spoiler_test', {})
                        generation = template_result.get('generation', {})
                        # Apply same criteria as postprocessing script
                        spoiler_minimal_passed = (
                            spoiler_test.get('pass_fail') == 'passed' and
                            generation.get('error_count', 0) == 0 and
                            spoiler_test.get('total_spheres', 0) > 0
                        )

    # Check spoiler full
    if os.path.exists(spoiler_full_file):
        with open(spoiler_full_file, 'r') as f:
            spoiler_full_results = json.load(f)
            if template_name in spoiler_full_results.get('results', {}):
                template_result = spoiler_full_results['results'][template_name]
                if isinstance(template_result, dict):
                    # Check if this is seed range data (same logic as postprocessing script)
                    if 'seed_range' in template_result:
                        # Seed range results - check if all seeds passed
                        seeds_failed = template_result.get('seeds_failed', 0)
                        seeds_passed = template_result.get('seeds_passed', 0)
                        spoiler_full_passed = (seeds_failed == 0 and seeds_passed > 0)
                    else:
                        # Single seed result
                        spoiler_test = template_result.get('spoiler_test', {})
                        generation = template_result.get('generation', {})
                        # Apply same criteria as postprocessing script
                        spoiler_full_passed = (
                            spoiler_test.get('pass_fail') == 'passed' and
                            generation.get('error_count', 0) == 0 and
                            spoiler_test.get('total_spheres', 0) > 0
                        )

    # Check multiplayer
    if os.path.exists(multiplayer_file):
        with open(multiplayer_file, 'r') as f:
            multiplayer_results = json.load(f)
            if template_name in multiplayer_results.get('results', {}):
                template_result = multiplayer_results['results'][template_name]
                if isinstance(template_result, dict):
                    multiplayer_test = template_result.get('multiplayer_test', {})
                    generation = template_result.get('generation', {})
                    # Apply same criteria as postprocessing script
                    multiplayer_passed = (
                        multiplayer_test.get('success', False) and
                        generation.get('error_count', 0) == 0
                    )

    result['prerequisite_check']['spoiler_minimal_passed'] = spoiler_minimal_passed
    result['prerequisite_check']['spoiler_full_passed'] = spoiler_full_passed
    result['prerequisite_check']['multiplayer_passed'] = multiplayer_passed
    result['prerequisite_check']['all_prerequisites_passed'] = (
        spoiler_minimal_passed and spoiler_full_passed and multiplayer_passed
    )

    print(f"  Spoiler Minimal: {'PASS' if spoiler_minimal_passed else 'FAIL'}")
    print(f"  Spoiler Full: {'PASS' if spoiler_full_passed else 'FAIL'}")
    print(f"  Multiplayer: {'PASS' if multiplayer_passed else 'FAIL'}")

    if not result['prerequisite_check']['all_prerequisites_passed']:
        print(f"Skipping {template_name} - not all prerequisites passed")
        result['multiworld_test']['success'] = False
        result['multiworld_test']['skip_reason'] = 'Prerequisites not met'
        return result

    # Copy template to multiworld directory (unless keep_templates is True)
    if not keep_templates:
        print(f"Copying {template_name} to multiworld directory...")
        source_path = os.path.join(templates_dir, template_name)
        dest_path = os.path.join(multiworld_dir, template_name)

        try:
            shutil.copy2(source_path, dest_path)
            print(f"  Copied successfully")
        except Exception as e:
            print(f"  Error copying template: {e}")
            result['multiworld_test']['success'] = False
            result['multiworld_test']['error'] = f"Failed to copy template: {e}"
            return result

        # Return early if export_only mode
        if export_only:
            print(f"Template copied for {template_name} (export-only mode)")
            return result
    else:
        print(f"Skipping template copy (--multiworld-keep-templates mode)")
        # In keep_templates mode, we don't add new templates
        # So we shouldn't increment the player count

    # Step 1: Run Generate.py with all templates in multiworld directory (skip if test_only mode)
    if not test_only:
        print(f"Running Generate.py for multiworld with {current_player_count + 1} players...")
        generate_cmd = [
            "python", "Generate.py",
            "--player_files_path", "Players/presets/Multiworld",
            "--seed", seed
        ]

        # Time the generation process
        gen_start_time = time.time()
        gen_return_code, gen_stdout, gen_stderr = run_command(generate_cmd, cwd=project_root, timeout=600)
        gen_end_time = time.time()
        gen_processing_time = round(gen_end_time - gen_start_time, 2)

        # Analyze generation output
        full_output = gen_stdout + "\n" + gen_stderr
        gen_error_count, gen_warning_count, gen_first_error, gen_first_warning = count_errors_and_warnings(full_output)
        gen_error_type = classify_generation_error(full_output) if gen_return_code != 0 else None

        gen_result = {
            'success': gen_return_code == 0,
            'return_code': gen_return_code,
            'error_count': gen_error_count,
            'warning_count': gen_warning_count,
            'error_type': gen_error_type,
            'processing_time_seconds': gen_processing_time
        }
        if include_error_details:
            gen_result['first_error_line'] = gen_first_error
            gen_result['first_warning_line'] = gen_first_warning
        result['generation'] = gen_result

        if gen_return_code != 0:
            print(f"Generation failed with return code {gen_return_code}")
            result['multiworld_test']['success'] = False
            result['multiworld_test']['error'] = 'Generation failed'
            # Delete the template from multiworld directory since it failed
            try:
                os.remove(dest_path)
                print(f"  Removed {template_name} from multiworld directory due to generation failure")
            except Exception as e:
                print(f"  Error removing template: {e}")
            return result
    else:
        print(f"Skipping generation for {template_name} (test-only mode)")

    # Step 2: Run spoiler tests for each player
    # Determine which players to test based on test_all_players flag
    if test_all_players or keep_templates:
        # Test all players
        start_player = 1
        end_player = current_player_count + (0 if keep_templates else 1)
        print(f"Running multiworld spoiler tests for all {end_player} players...")
    else:
        # Only test the newly added player
        start_player = current_player_count + 1
        end_player = current_player_count + 1
        print(f"Running multiworld spoiler test for player {start_player} only...")

    test_start_time = time.time()
    all_players_passed = True

    # Test the appropriate range of players
    for player_num in range(start_player, end_player + 1):
        print(f"\n  Testing Player {player_num}...")

        # Use npm run test:headed if --headed flag is set
        if headed:
            spoiler_cmd = ["npm", "run", "test:headed", "--mode=test-spoilers",
                         f"--game=multiworld", f"--seed={seed}", f"--player={player_num}"]
        else:
            spoiler_cmd = ["npm", "test", "--mode=test-spoilers",
                         f"--game=multiworld", f"--seed={seed}", f"--player={player_num}"]

        spoiler_env = os.environ.copy()

        spoiler_return_code, spoiler_stdout, spoiler_stderr = run_command(
            spoiler_cmd, cwd=project_root, timeout=900, env=spoiler_env
        )

        player_passed = spoiler_return_code == 0

        # Analyze test output
        full_output = spoiler_stdout + "\n" + spoiler_stderr
        test_error_count, test_warning_count, test_first_error, test_first_warning = count_errors_and_warnings(full_output)

        # Run test analysis
        analysis_cmd = ["npm", "run", "test:analyze"]
        analysis_return_code, analysis_stdout, analysis_stderr = run_command(
            analysis_cmd, cwd=project_root, timeout=60
        )

        sphere_reached = 0
        total_spheres = 0
        pass_fail = 'unknown'

        # Read playwright-analysis.txt if it exists
        analysis_file = os.path.join(project_root, "playwright-analysis.txt")
        if os.path.exists(analysis_file):
            try:
                with open(analysis_file, 'r') as f:
                    analysis_text = f.read()

                # Parse the analysis
                analysis_result = parse_playwright_analysis(analysis_text)
                sphere_reached = analysis_result.get('sphere_reached', 0)
                pass_fail = analysis_result.get('pass_fail', 'unknown')
            except IOError:
                pass

        # Read total spheres from spheres_log.jsonl file
        # For multiworld, there's a single spheres_log file with data for all players
        spheres_log_path = os.path.join(project_root, 'frontend', 'presets', 'multiworld', seed_id,
                                       f'{seed_id}_spheres_log.jsonl')
        total_spheres = count_total_spheres(spheres_log_path, player_num=player_num)

        # If test passed, sphere_reached should equal total_spheres
        if pass_fail == 'passed':
            sphere_reached = total_spheres

        player_result = {
            'player_number': player_num,
            'passed': player_passed and pass_fail == 'passed',
            'return_code': spoiler_return_code,
            'sphere_reached': sphere_reached,
            'total_spheres': total_spheres,
            'pass_fail': pass_fail,
            'error_count': test_error_count,
            'warning_count': test_warning_count,
            # 'first_error_line': test_first_error,  # Disabled by default, use --include-error-details to enable
            # 'first_warning_line': test_first_warning  # Disabled by default, use --include-error-details to enable
        }

        if include_error_details:
            player_result['first_error_line'] = test_first_error
            player_result['first_warning_line'] = test_first_warning

        result['multiworld_test']['player_results'][f'player_{player_num}'] = player_result

        if player_result['passed']:
            result['multiworld_test']['players_passed'] += 1
            print(f"    Player {player_num}: PASS (sphere {sphere_reached}/{total_spheres})")
        else:
            result['multiworld_test']['players_failed'] += 1
            all_players_passed = False
            if result['multiworld_test']['first_failure_player'] is None:
                result['multiworld_test']['first_failure_player'] = player_num
            print(f"    Player {player_num}: FAIL (sphere {sphere_reached}/{total_spheres})")

    test_end_time = time.time()
    test_processing_time = round(test_end_time - test_start_time, 2)

    # Set total_players based on mode
    if keep_templates:
        result['multiworld_test']['total_players_tested'] = end_player
    else:
        result['multiworld_test']['total_players_tested'] = current_player_count + 1
    result['multiworld_test']['processing_time_seconds'] = test_processing_time
    result['multiworld_test']['success'] = all_players_passed

    # If any player failed, delete the template from multiworld directory (unless keep_templates)
    if not all_players_passed:
        print(f"\n  Multiworld test FAILED for {template_name}")
        if not keep_templates:
            print(f"  Removing {template_name} from multiworld directory...")
            try:
                os.remove(dest_path)
                print(f"  Removed successfully")
            except Exception as e:
                print(f"  Error removing template: {e}")
    else:
        print(f"\n  Multiworld test PASSED for {template_name}")
        if not keep_templates:
            print(f"  Keeping {template_name} in multiworld directory for future tests")

    print(f"\nCompleted {template_name}: Multiworld Test={'[PASS]' if result['multiworld_test']['success'] else '[FAIL]'}, "
          f"Players Passed={result['multiworld_test']['players_passed']}/{result['multiworld_test']['total_players_tested']}")

    return result
