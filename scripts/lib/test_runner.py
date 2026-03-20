#!/usr/bin/env python3
"""
Core test execution functions for running template tests.

This module contains the main test execution logic for:
- Testing single seeds
- Testing seed ranges
- Running generation (Generate.py)
- Running spoiler tests
- Running multiclient tests
- Running multiworld tests
"""

import json
import os
import shlex
import shutil
import time
from datetime import datetime, timezone
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
    parse_multiclient_test_results,
    parse_playwright_analysis
)


def test_template_single_seed(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed: str = "1", export_only: bool = False, test_only: bool = False, multiclient: bool = False, single_client: bool = False, headed: bool = False, include_error_details: bool = False, dry_run: bool = False, player: int = None) -> Dict:
    """Test a single template file and return results."""
    template_filename = os.path.basename(template_file)
    game_name_from_filename = normalize_game_name(template_filename)

    # Compute seed ID directly from seed number
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        seed_id = None

    # Get world info using the provided world mapping
    world_info = get_world_info(template_file, templates_dir, world_mapping)

    print(f"\n=== Testing {template_filename} ===")

    result = {
        'template_filename': template_filename,
        'game_name_from_yaml': world_info.get('game_name_from_yaml'),
        'game_name_from_filename': game_name_from_filename,
        'seed': seed,
        'seed_id': seed_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
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
    if multiclient:
        result['multiclient_test'] = {
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
            result['multiclient_test']['first_error_line'] = None
            result['multiclient_test']['first_warning_line'] = None
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
        if dry_run:
            print(f"[DRY RUN] Would run Generate.py for {template_filename}...")
            template_file = template_filename if template_filename.endswith(('.yaml', '.yml')) else f"{template_filename}.yaml"
            template_path = os.path.join(templates_dir, template_file)
            # Show relative path for readability
            players_dir = os.path.join(project_root, 'Players')
            if template_path.startswith(players_dir):
                display_path = os.path.relpath(template_path, players_dir)
            else:
                display_path = template_path
            display_cmd = ["python", "Generate.py", "--weights_file_path", display_path, "--multi", "1", "--seed", seed]
            print(f"  [DRY RUN] Command: {shlex.join(display_cmd)}")
            result['generation']['note'] = 'Skipped in dry-run mode'
            result['dry_run'] = True
            return result

        print(f"Running Generate.py for {template_filename}...")
        # Ensure template name has .yaml extension for the file path
        template_file = template_filename if template_filename.endswith(('.yaml', '.yml')) else f"{template_filename}.yaml"
        # Use the provided templates_dir, which is relative to Players/ directory
        template_path = os.path.join(templates_dir, template_file)
        generate_cmd = [
            "python", "Generate.py",
            "--weights_file_path", template_path,
            "--multi", "1",
            "--seed", seed
        ]

        # Show the command being run with relative path for readability
        # Convert absolute template_path to relative (from Players/ directory)
        players_dir = os.path.join(project_root, 'Players')
        if template_path.startswith(players_dir):
            display_path = os.path.relpath(template_path, players_dir)
        else:
            display_path = template_path
        display_cmd = ["python", "Generate.py", "--weights_file_path", display_path, "--multi", "1", "--seed", seed]
        print(f"  Command: {shlex.join(display_cmd)}")

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
        print(f"Skipping generation for {template_filename} (test-only mode)")
        # In test-only mode, don't overwrite error counts - keep the defaults initialized above
        # This preserves any existing generation error data from previous runs
        result['generation']['note'] = 'Skipped in test-only mode'

    # Check if rules file exists (files are actually in frontend/presets/)
    # Use world_directory from world_info if available,
    # otherwise fall back to game_name_from_filename
    preset_dir = world_info.get('world_directory', game_name_from_filename) if world_info else game_name_from_filename
    rules_path = f"./presets/{preset_dir}/{seed_id}/{seed_id}_rules.json"
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))

    # If player parameter is specified and generation just completed, remap player IDs in the rules file
    if player is not None and not test_only:
        if os.path.exists(full_rules_path):
            print(f"Remapping player IDs in rules file to player {player}...")
            # Import the remapping function
            import sys
            import importlib.util
            remap_script_path = os.path.join(project_root, 'scripts', 'lib', 'remap_player_ids.py')
            spec = importlib.util.spec_from_file_location("remap_player_ids", remap_script_path)
            remap_module = importlib.util.module_from_spec(spec)
            sys.modules["remap_player_ids"] = remap_module
            spec.loader.exec_module(remap_module)

            # Remap the player IDs
            success = remap_module.remap_player_ids(full_rules_path, player)
            if success:
                print(f"  Successfully remapped player IDs to player {player}")
            else:
                print(f"  Warning: Failed to remap player IDs")

    # Return early if export_only mode (after remapping)
    if export_only:
        print(f"Export completed for {template_filename} (export-only mode)")
        return result

    if not os.path.exists(full_rules_path):
        print(f"Rules file not found: {full_rules_path}")
        test_key = 'multiclient_test' if multiclient else 'spoiler_test'
        result[test_key]['error_count'] = 1
        if include_error_details:
            result[test_key]['first_error_line'] = f"Rules file not found: {rules_path}"
        return result

    # Step 2: Run test (multiclient or spoiler based on mode)
    if multiclient:
        # Multiclient test
        test_mode = "single-client" if single_client else "dual-client"
        print(f"Running multiclient timer test ({test_mode} mode)...")

        # Run the multiclient test
        if single_client:
            # Single-client mode
            multiclient_cmd = [
                "npx", "playwright", "test",
                "test_json/e2e/multiclient.spec.js",
                "-g", "single client timer test"
            ]
            multiclient_env = os.environ.copy()
            multiclient_env['ENABLE_SINGLE_CLIENT'] = 'true'
        else:
            # Dual-client mode (default)
            multiclient_cmd = [
                "npx", "playwright", "test",
                "test_json/e2e/multiclient.spec.js",
                "-g", "multiclient timer test"
            ]
            multiclient_env = os.environ.copy()

        # Add --headed flag if requested
        if headed:
            multiclient_cmd.append("--headed")

        # Use world_directory for the test game parameter (same as rules file lookup)
        test_game = preset_dir

        multiclient_env['TEST_GAME'] = test_game
        multiclient_env['TEST_SEED'] = seed
        # Only disable --single-process for dual-client tests (incompatible with multi-context)
        # Single-client tests NEED --single-process to work correctly
        if not single_client:
            multiclient_env['DISABLE_SINGLE_PROCESS'] = 'true'

        # Show the command being run (use shlex.join for proper quoting)
        print(f"  Command: {shlex.join(multiclient_cmd)}")
        print(f"  Environment: TEST_GAME={test_game} TEST_SEED={seed}")

        # Time the multiclient test process
        # Note: timeout needs to be long enough for large games like Stardew Valley (500+ locations)
        test_start_time = time.time()
        test_return_code, test_stdout, test_stderr = run_command(
            multiclient_cmd, cwd=project_root, timeout=600, env=multiclient_env
        )
        test_end_time = time.time()
        test_processing_time = round(test_end_time - test_start_time, 2)

        result['multiclient_test']['return_code'] = test_return_code
        result['multiclient_test']['processing_time_seconds'] = test_processing_time

        # Analyze test output
        full_output = test_stdout + "\n" + test_stderr
        test_error_count, test_warning_count, test_first_error, test_first_warning = count_errors_and_warnings(full_output)

        result['multiclient_test']['error_count'] = test_error_count
        result['multiclient_test']['warning_count'] = test_warning_count
        if include_error_details:
            result['multiclient_test']['first_error_line'] = test_first_error
            result['multiclient_test']['first_warning_line'] = test_first_warning

        # Parse test results
        test_results_dir = os.path.join(project_root, 'test_results', 'multiclient')
        print(f"Looking for test results in: {test_results_dir}")

        # Check if directory exists
        if not os.path.exists(test_results_dir):
            print(f"WARNING: Test results directory does not exist: {test_results_dir}")
        else:
            # List files in the directory
            try:
                files = os.listdir(test_results_dir)
                print(f"Files in test results directory: {files}")
            except Exception as e:
                print(f"ERROR: Could not list test results directory: {e}")

        test_results = parse_multiclient_test_results(test_results_dir, single_client=single_client)

        # If test failed, print diagnostic info
        if test_return_code != 0:
            # Check if .archipelago file exists at expected path
            expected_arch_path = os.path.join(project_root, 'frontend', 'presets', preset_dir, seed_id, f'{seed_id}.archipelago')
            if os.path.exists(expected_arch_path):
                print(f"DEBUG: .archipelago file exists at: {expected_arch_path}")
                print(f"DEBUG: .archipelago file size: {os.path.getsize(expected_arch_path)} bytes")
            else:
                print(f"DEBUG: .archipelago file NOT FOUND at: {expected_arch_path}")
                # Check what's in the preset directory
                preset_path = os.path.join(project_root, 'frontend', 'presets', preset_dir)
                if os.path.exists(preset_path):
                    print(f"DEBUG: Preset directory contents: {os.listdir(preset_path)}")
                    seed_path = os.path.join(preset_path, seed_id)
                    if os.path.exists(seed_path):
                        print(f"DEBUG: Seed directory contents: {os.listdir(seed_path)}")
                else:
                    print(f"DEBUG: Preset directory NOT FOUND: {preset_path}")

            # Print server log if it exists
            server_log_path = os.path.join(project_root, 'server_log.txt')
            if os.path.exists(server_log_path):
                print(f"DEBUG: Server log contents:")
                try:
                    with open(server_log_path, 'r') as f:
                        log_content = f.read()
                        # Print last 50 lines
                        lines = log_content.strip().split('\n')
                        for line in lines[-50:]:
                            print(f"  SERVER: {line}")
                except Exception as e:
                    print(f"DEBUG: Could not read server log: {e}")
            else:
                print(f"DEBUG: Server log not found at: {server_log_path}")

        result['multiclient_test'].update({
            'success': test_results['success'],
            'client1_passed': test_results['client1_passed'],
            'client2_passed': test_results['client2_passed'],
            'client1_locations_checked': test_results['client1_locations_checked'],
            'client1_total_locations': test_results['client1_total_locations'],
            'client1_manually_checkable': test_results['client1_manually_checkable'],
            'client1_manually_checkable_checked': test_results['client1_manually_checkable_checked'],
            'client1_event_locations': test_results['client1_event_locations'],
            'client1_event_locations_checked': test_results['client1_event_locations_checked'],
            'client2_locations_received': test_results['client2_locations_received'],
            'client2_total_locations': test_results['client2_total_locations'],
            'single_client_mode': test_results.get('single_client_mode', False),
            # Legacy fields for backwards compatibility
            'locations_checked': test_results['client2_locations_received'] if not single_client else test_results['client1_locations_checked'],
            'total_locations': test_results['client2_total_locations'] if not single_client else test_results['client1_manually_checkable']
        })

        if include_error_details and test_results.get('error_message'):
            result['multiclient_test']['first_error_line'] = test_results['error_message']

        # Always log if test failed
        if not test_results['success']:
            error_msg = test_results.get('error_message', 'Unknown error')
            print(f"Multiclient test failed: {error_msg}")
            print(f"Test return code: {test_return_code}")
            if test_error_count > 0:
                print(f"Errors in output: {test_error_count}")
                if test_first_error:
                    print(f"First error: {test_first_error}")

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

        # Add --player argument if specified
        if player is not None:
            spoiler_cmd.append(f"--player={player}")

        # Show the command being run (use shlex.join for proper quoting)
        print(f"  Command: {shlex.join(spoiler_cmd)}")

        spoiler_env = os.environ.copy()

        # Time the spoiler test process
        # Use 5 minute timeout (300 seconds) - tests should complete in under 1 minute normally
        spoiler_start_time = time.time()
        spoiler_return_code, spoiler_stdout, spoiler_stderr = run_command(
            spoiler_cmd, cwd=project_root, timeout=300, env=spoiler_env
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

        # Read total spheres from sphere_log.jsonl file
        # Use preset_dir (world_directory) instead of game_name for correct path
        sphere_log_path = os.path.join(project_root, 'frontend', 'presets', preset_dir, seed_id, f'{seed_id}_sphere_log.jsonl')
        total_spheres = count_total_spheres(sphere_log_path)
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

    if multiclient:
        mc = result['multiclient_test']
        # Show three-way breakdown: Total, Non-event, Event
        total_str = f"{mc['client1_locations_checked']}/{mc['client1_total_locations']}"
        nonevent_str = f"{mc['client1_manually_checkable_checked']}/{mc['client1_manually_checkable']}"
        event_str = f"{mc['client1_event_locations_checked']}/{mc['client1_event_locations']}"
        print(f"Completed {template_filename}: Generation={'[PASS]' if result['generation']['success'] else '[FAIL]'}, "
              f"Test={'[PASS]' if mc['success'] else '[FAIL]'}, "
              f"Gen Errors={result['generation']['error_count']}, "
              f"Locations: Total={total_str}, Non-event={nonevent_str}, Event={event_str}")
    else:
        print(f"Completed {template_filename}: Generation={'[PASS]' if result['generation']['success'] else '[FAIL]'}, "
              f"Test={'[PASS]' if result['spoiler_test']['pass_fail'] == 'passed' else '[FAIL]'}, "
              f"Gen Errors={result['generation']['error_count']}, "
              f"Sphere Reached={result['spoiler_test']['sphere_reached']}, "
              f"Max Spheres={result['spoiler_test']['total_spheres']}")

    return result


def test_template_seed_range(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed_list: List[int], export_only: bool = False, test_only: bool = False, stop_on_failure: bool = False, multiclient: bool = False, single_client: bool = False, headed: bool = False, include_error_details: bool = False, dry_run: bool = False, player: int = None) -> Dict:
    """Test a template file with multiple seeds and return aggregated results."""
    template_filename = os.path.basename(template_file)

    print(f"\n=== Testing {template_filename} with {len(seed_list)} seeds ===")

    # Initialize seed range result
    seed_range_result = {
        'template_filename': template_filename,
        'seed_range': f"{seed_list[0]}-{seed_list[-1]}" if len(seed_list) > 1 else str(seed_list[0]),
        'total_seeds_tested': 0,
        'seeds_passed': 0,
        'seeds_failed': 0,
        'first_failure_seed': None,
        'first_failure_reason': None,
        'consecutive_passes_before_failure': 0,
        'stop_on_failure': stop_on_failure,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'individual_results': {},
        'summary': {
            'all_passed': False,
            'any_failed': False,
            'failure_rate': 0.0
        }
    }

    consecutive_passes = 0

    # Handle dry-run mode
    if dry_run:
        print(f"[DRY RUN] Would test {len(seed_list)} seeds: {seed_list[0]}-{seed_list[-1]}")
        for i, seed in enumerate(seed_list, 1):
            print(f"  [DRY RUN] Would test seed {seed} ({i}/{len(seed_list)})")
        seed_range_result['dry_run'] = True
        return seed_range_result

    for i, seed in enumerate(seed_list, 1):
        print(f"\n--- Seed {seed} ({i}/{len(seed_list)}) ---")

        try:
            # Test this specific seed
            result = test_template_single_seed(
                template_file, templates_dir, project_root, world_mapping,
                str(seed), export_only, test_only, multiclient, single_client, headed,
                include_error_details, dry_run, player
            )

            seed_range_result['individual_results'][str(seed)] = result
            seed_range_result['total_seeds_tested'] += 1

            # Check if this seed passed
            if export_only:
                passed = result.get('generation', {}).get('success', False)
            elif multiclient:
                passed = result.get('multiclient_test', {}).get('success', False)
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
                    elif multiclient:
                        mp_result = result.get('multiclient_test', {})
                        if mp_result.get('first_error_line'):
                            seed_range_result['first_failure_reason'] = f"Multiclient test error: {mp_result['first_error_line']}"
                        else:
                            locations_checked = mp_result.get('locations_checked', 0)
                            total_locations = mp_result.get('total_locations', 0)
                            seed_range_result['first_failure_reason'] = f"Multiclient test failed: {locations_checked}/{total_locations} locations checked"
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
    print(f"\n=== Seed Range Summary for {template_filename} ===")
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
                            require_prerequisites: bool = True,
                            include_error_details: bool = False, max_templates: int = 10,
                            dry_run: bool = False, is_second_pass: bool = False,
                            retry_failed_players: int = 0, split_number: int = None) -> Dict:
    """
    Test a single template in multiworld mode.

    By default (require_prerequisites=False), tests all templates regardless of other
    test results. If require_prerequisites is True, only tests templates that have
    passed spoiler minimal, spoiler full, and multiclient tests.
    Copies template to the multiworld directory, runs generation with all accumulated
    templates, and tests each player.

    Args:
        template_file: Name of the template file to test
        templates_dir: Path to templates directory
        project_root: Path to project root
        world_mapping: World mapping dictionary
        seed: Seed number to use
        multiworld_dir: Path to Players/presets/Multiworld directory
        existing_results: Dictionary containing all test results (spoiler-minimal, spoiler-full, multiclient)
        current_player_count: Number of players currently in the multiworld directory (before adding this one)
        export_only: If True, only run generation
        test_only: If True, skip generation
        headed: If True, run Playwright tests in headed mode
        keep_templates: If True, don't copy template to multiworld directory (just test existing templates)
        test_all_players: If True, test all players; if False, only test the newly added player
        require_prerequisites: If True, skip templates that haven't passed other test types (default: False)
        include_error_details: If True, include first error/warning lines in results
        max_templates: Maximum number of templates to keep in multiworld directory (default: 10)
        dry_run: If True, show what would be done without making changes (default: False)
        is_second_pass: If True, this is a second pass retest (template already in multiworld,
                        skip adding, just test the player at its alphabetical position)
        retry_failed_players: Number of times to retry a failed player test (default: 0)
        split_number: The parallel job split number (for tracking which job ran this test)

    Returns:
        Dictionary with test results
    """
    template_filename = os.path.basename(template_file)
    game_name_from_filename = normalize_game_name(template_filename)

    # Compute seed ID
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        seed_id = None

    # Get world info
    world_info = get_world_info(template_file, templates_dir, world_mapping)

    pass_label = "Second Pass" if is_second_pass else "Multiworld Mode"
    print(f"\n=== Testing {template_filename} ({pass_label}) ===")

    result = {
        'template_filename': template_filename,
        'game_name_from_yaml': world_info.get('game_name_from_yaml'),
        'game_name_from_filename': game_name_from_filename,
        'seed': seed,
        'seed_id': seed_id,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'world_info': world_info,
        'prerequisite_check': {
            'spoiler_minimal_passed': False,
            'spoiler_full_passed': False,
            'multiclient_passed': False,
            'all_prerequisites_passed': False
        },
        'multiworld_test': {
            'success': False,
            'is_second_pass': is_second_pass,
            'player_number': current_player_count + 1,
            'total_players_tested': 0,
            'players_passed': 0,
            'players_failed': 0,
            'first_failure_player': None,
            'player_results': {},
            'processing_time_seconds': 0,
            'intermittent_failures': [],  # Players that failed initially but passed on retry
            'split_number': split_number  # Which parallel job ran this test
        }
    }

    # Check prerequisites - the template must have passed all three other test types
    # (always run this check - it's cheap and provides useful verification info)
    print(f"Checking prerequisites for {template_filename}...")

    # Load the three test results files
    spoiler_minimal_file = os.path.join(project_root, 'scripts/output/spoiler-minimal/test-results.json')
    spoiler_full_file = os.path.join(project_root, 'scripts/output/spoiler-full/test-results.json')
    multiclient_file = os.path.join(project_root, 'scripts/output/multiclient/test-results.json')

    spoiler_minimal_passed = False
    spoiler_full_passed = False
    multiclient_passed = False

    # Check spoiler minimal
    if os.path.exists(spoiler_minimal_file):
        with open(spoiler_minimal_file, 'r') as f:
            spoiler_minimal_results = json.load(f)
            if template_filename in spoiler_minimal_results.get('results', {}):
                template_result = spoiler_minimal_results['results'][template_filename]
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
            if template_filename in spoiler_full_results.get('results', {}):
                template_result = spoiler_full_results['results'][template_filename]
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

    # Check multiclient
    if os.path.exists(multiclient_file):
        with open(multiclient_file, 'r') as f:
            multiclient_results = json.load(f)
            if template_filename in multiclient_results.get('results', {}):
                template_result = multiclient_results['results'][template_filename]
                if isinstance(template_result, dict):
                    multiclient_test = template_result.get('multiclient_test', {})
                    generation = template_result.get('generation', {})
                    # Apply same criteria as postprocessing script
                    multiclient_passed = (
                        multiclient_test.get('success', False) and
                        generation.get('error_count', 0) == 0
                    )

    result['prerequisite_check']['spoiler_minimal_passed'] = spoiler_minimal_passed
    result['prerequisite_check']['spoiler_full_passed'] = spoiler_full_passed
    result['prerequisite_check']['multiclient_passed'] = multiclient_passed
    result['prerequisite_check']['all_prerequisites_passed'] = (
        spoiler_minimal_passed and spoiler_full_passed and multiclient_passed
    )

    print(f"  Spoiler Minimal: {'PASS' if spoiler_minimal_passed else 'FAIL'}")
    print(f"  Spoiler Full: {'PASS' if spoiler_full_passed else 'FAIL'}")
    print(f"  Multiclient: {'PASS' if multiclient_passed else 'FAIL'}")

    if require_prerequisites and not result['prerequisite_check']['all_prerequisites_passed']:
        print(f"Skipping {template_filename} - not all prerequisites passed")
        result['multiworld_test']['success'] = False
        result['multiworld_test']['skip_reason'] = 'Prerequisites not met'
        return result
    elif not require_prerequisites:
        print(f"Proceeding with multiworld test (prerequisite check disabled)")

    # Copy template to multiworld directory (unless keep_templates is True)
    # Track whether we need to regenerate (if template set changed in second pass)
    needs_regeneration = False

    if is_second_pass:
        # In second pass mode, check if template is in multiworld directory
        expected_path = os.path.join(multiworld_dir, template_filename)
        if os.path.exists(expected_path):
            print(f"Second pass mode - template already in multiworld directory")
        else:
            # Template was removed during first pass (total templates > max_templates)
            # Need to copy it back and regenerate
            print(f"Second pass mode - template not in multiworld directory, restoring...")

            existing_templates = [f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')]

            # If at max capacity, remove the oldest template to make room
            if len(existing_templates) >= max_templates:
                # Get file modification times
                template_times = []
                for template in existing_templates:
                    template_path = os.path.join(multiworld_dir, template)
                    mtime = os.path.getmtime(template_path)
                    template_times.append((template, mtime))

                # Sort by modification time (oldest first)
                template_times.sort(key=lambda x: x[1])

                # Remove the oldest template
                old_template = template_times[0][0]
                old_template_path = os.path.join(multiworld_dir, old_template)
                try:
                    os.remove(old_template_path)
                    print(f"  Removed {old_template} to make room")
                except Exception as e:
                    print(f"  Warning: Could not remove {old_template}: {e}")

            # Copy the template from templates_dir
            source_path = os.path.join(templates_dir, template_filename)
            dest_path = os.path.join(multiworld_dir, template_filename)

            try:
                shutil.copy2(source_path, dest_path)
                print(f"  Restored {template_filename} to multiworld directory")
                needs_regeneration = True  # Template set changed, need to regenerate
            except Exception as e:
                print(f"  Error restoring template: {e}")
                result['multiworld_test']['success'] = False
                result['multiworld_test']['error'] = f"Failed to restore template: {e}"
                return result
    elif not keep_templates:
        # Check if we need to remove old templates to stay under the limit
        existing_templates = [f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')]

        # If adding this template would exceed the limit, remove the oldest templates
        if len(existing_templates) >= max_templates:
            # Get file modification times
            template_times = []
            for template in existing_templates:
                template_path = os.path.join(multiworld_dir, template)
                mtime = os.path.getmtime(template_path)
                template_times.append((template, mtime))

            # Sort by modification time (oldest first)
            template_times.sort(key=lambda x: x[1])

            # Calculate how many we need to remove
            num_to_remove = len(existing_templates) - max_templates + 1

            # Remove the oldest templates
            print(f"Multiworld directory has {len(existing_templates)} templates (limit: {max_templates})")
            if dry_run:
                print(f"[DRY RUN] Would remove {num_to_remove} oldest template(s) to make room...")
                for i in range(num_to_remove):
                    old_template = template_times[i][0]
                    print(f"  [DRY RUN] Would remove {old_template}")
            else:
                print(f"Removing {num_to_remove} oldest template(s) to make room...")
                for i in range(num_to_remove):
                    old_template = template_times[i][0]
                    old_template_path = os.path.join(multiworld_dir, old_template)
                    try:
                        os.remove(old_template_path)
                        print(f"  Removed {old_template}")
                    except Exception as e:
                        print(f"  Warning: Could not remove {old_template}: {e}")

                # IMPORTANT: After removing templates, recalculate the player count
                # This ensures the new template gets the correct player number
                remaining_templates = [f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')]
                current_player_count = len(remaining_templates)
                print(f"  Updated player count to {current_player_count} after removing templates")
                # Update the result with the corrected player number
                result['multiworld_test']['player_number'] = current_player_count + 1

        if dry_run:
            print(f"[DRY RUN] Would copy {template_filename} to multiworld directory...")
            print(f"[DRY RUN] Skipping actual file operations and tests")
            result['multiworld_test']['dry_run'] = True
            return result
        else:
            print(f"Copying {template_filename} to multiworld directory...")
            source_path = os.path.join(templates_dir, template_filename)
            dest_path = os.path.join(multiworld_dir, template_filename)

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
            # Still capture templates for export_only mode
            templates_in_dir = sorted([f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')])
            templates_in_multiworld = {}
            for i, template in enumerate(templates_in_dir, start=1):
                templates_in_multiworld[f"player_{i}"] = template
            result['multiworld_test']['templates_in_multiworld'] = templates_in_multiworld
            print(f"Template copied for {template_filename} (export-only mode)")
            print(f"Templates in multiworld: {templates_in_dir}")
            return result
    else:
        print(f"Skipping template copy (--multiworld-keep-templates mode)")
        # In keep_templates mode, we don't add new templates
        # So we shouldn't increment the player count

    # Capture the exact set of templates in the multiworld directory before generation
    # Templates are sorted alphabetically, which determines player number assignment
    templates_in_dir = sorted([f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')])
    templates_in_multiworld = {}
    for i, template in enumerate(templates_in_dir, start=1):
        templates_in_multiworld[f"player_{i}"] = template
    result['multiworld_test']['templates_in_multiworld'] = templates_in_multiworld
    print(f"Templates in multiworld: {templates_in_dir}")

    # Skip testing if there's only 1 template - multiworld tests require at least 2 games
    # This is because the exporter uses the single-game export path when there's only 1 game,
    # which places files in frontend/presets/<game>/ instead of frontend/presets/multiworld/
    if len(templates_in_dir) < 2:
        print(f"  Skipping tests - multiworld requires at least 2 templates (currently {len(templates_in_dir)})")
        print(f"  Template will remain in multiworld directory for testing with the next template")
        result['multiworld_test']['total_players_in_multiworld'] = len(templates_in_dir)
        result['multiworld_test']['total_players_tested'] = 0
        result['multiworld_test']['skip_reason'] = 'Waiting for 2+ templates'
        result['multiworld_test']['success'] = None  # Neither pass nor fail - just skipped
        print(f"\nCompleted {template_filename}: Multiworld Test=[SKIP], waiting for more templates")
        return result

    # Step 1: Run Generate.py with all templates in multiworld directory
    # Skip if test_only mode, or if second pass without template set changes
    # If needs_regeneration is True (template was restored in second pass), we must regenerate
    if is_second_pass and not needs_regeneration:
        print(f"Skipping generation for {template_filename} (second pass mode - using existing output)")
        result['generation'] = {'note': 'Skipped in second pass mode'}
    elif not test_only or needs_regeneration:
        if needs_regeneration:
            print(f"Running Generate.py for multiworld with {len(templates_in_dir)} players (template restored, regeneration required)...")
        else:
            print(f"Running Generate.py for multiworld with {len(templates_in_dir)} players...")
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
            # Delete the template from multiworld directory since it failed (only in first pass)
            if not is_second_pass and not keep_templates:
                try:
                    dest_path = os.path.join(multiworld_dir, template_filename)
                    os.remove(dest_path)
                    print(f"  Removed {template_filename} from multiworld directory due to generation failure")
                except Exception as e:
                    print(f"  Error removing template: {e}")
            return result
    else:
        print(f"Skipping generation for {template_filename} (test-only mode)")

    # Step 2: Run spoiler tests for each player
    # Determine which players to test based on test_all_players flag
    if test_all_players or keep_templates:
        # Test all players
        start_player = 1
        end_player = len(templates_in_dir)
        print(f"Running multiworld spoiler tests for all {end_player} players...")
        players_to_test = list(range(start_player, end_player + 1))
    else:
        # Only test the newly added player
        # Find the player number by looking up the template's position in the sorted list
        # (templates are sorted alphabetically, so the new template might not be last)
        try:
            new_player_number = templates_in_dir.index(template_filename) + 1
        except ValueError:
            # Template not found in list (shouldn't happen, but fallback to old behavior)
            new_player_number = len(templates_in_dir)
        print(f"Running multiworld spoiler test for player {new_player_number} ({template_filename})...")
        players_to_test = [new_player_number]
        # Update result with the correct player number
        result['multiworld_test']['player_number'] = new_player_number

    test_start_time = time.time()
    all_players_passed = True

    # Helper function to run a single player test
    def run_player_test(player_num: int) -> dict:
        """Run spoiler test for a single player and return the result."""
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

        # Read total spheres from sphere_log.jsonl file
        # For multiworld, there's a single sphere_log file with data for all players
        sphere_log_path = os.path.join(project_root, 'frontend', 'presets', 'multiworld', seed_id,
                                       f'{seed_id}_sphere_log.jsonl')
        total_spheres = count_total_spheres(sphere_log_path, player_num=player_num)

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
        }

        if include_error_details:
            player_result['first_error_line'] = test_first_error
            player_result['first_warning_line'] = test_first_warning

        return player_result

    # Test the appropriate players
    for player_num in players_to_test:
        print(f"\n  Testing Player {player_num}...")

        # Run the initial test
        player_result = run_player_test(player_num)
        attempt = 1

        # If test failed and retries are enabled, retry
        if not player_result['passed'] and retry_failed_players > 0:
            initial_sphere_reached = player_result['sphere_reached']
            initial_total_spheres = player_result['total_spheres']
            print(f"    Player {player_num}: FAIL (sphere {initial_sphere_reached}/{initial_total_spheres}) - will retry up to {retry_failed_players} time(s)")

            for retry_num in range(1, retry_failed_players + 1):
                print(f"    Retry {retry_num}/{retry_failed_players} for Player {player_num}...")
                player_result = run_player_test(player_num)
                attempt = retry_num + 1

                if player_result['passed']:
                    # Test passed on retry - record as intermittent failure
                    print(f"    Player {player_num}: PASS on retry {retry_num} (sphere {player_result['sphere_reached']}/{player_result['total_spheres']})")
                    result['multiworld_test']['intermittent_failures'].append({
                        'player_number': player_num,
                        'initial_sphere_reached': initial_sphere_reached,
                        'initial_total_spheres': initial_total_spheres,
                        'passed_on_attempt': attempt,
                        'final_sphere_reached': player_result['sphere_reached'],
                        'final_total_spheres': player_result['total_spheres']
                    })
                    # Mark the player result as having been an intermittent failure
                    player_result['was_intermittent_failure'] = True
                    player_result['passed_on_attempt'] = attempt
                    break
                else:
                    print(f"    Player {player_num}: Still FAIL on retry {retry_num} (sphere {player_result['sphere_reached']}/{player_result['total_spheres']})")

        # Store the final result
        player_result['total_attempts'] = attempt
        result['multiworld_test']['player_results'][f'player_{player_num}'] = player_result

        if player_result['passed']:
            result['multiworld_test']['players_passed'] += 1
            if attempt == 1:
                print(f"    Player {player_num}: PASS (sphere {player_result['sphere_reached']}/{player_result['total_spheres']})")
            # else: already printed the pass message in the retry loop
        else:
            result['multiworld_test']['players_failed'] += 1
            all_players_passed = False
            if result['multiworld_test']['first_failure_player'] is None:
                result['multiworld_test']['first_failure_player'] = player_num
            if attempt == 1:
                print(f"    Player {player_num}: FAIL (sphere {player_result['sphere_reached']}/{player_result['total_spheres']})")

    test_end_time = time.time()
    test_processing_time = round(test_end_time - test_start_time, 2)

    # Set total_players based on templates in the multiworld directory
    result['multiworld_test']['total_players_in_multiworld'] = len(templates_in_dir)
    result['multiworld_test']['total_players_tested'] = len(players_to_test)
    result['multiworld_test']['processing_time_seconds'] = test_processing_time
    result['multiworld_test']['success'] = all_players_passed

    # Handle template cleanup based on test result and mode
    if not all_players_passed:
        print(f"\n  Multiworld test FAILED for {template_filename}")
        if not keep_templates and not is_second_pass:
            # First pass failure - remove the template
            print(f"  Removing {template_filename} from multiworld directory...")
            try:
                dest_path = os.path.join(multiworld_dir, template_filename)
                os.remove(dest_path)
                print(f"  Removed successfully")
            except Exception as e:
                print(f"  Error removing template: {e}")
        elif is_second_pass and needs_regeneration:
            # Second pass with restored template - remove it to restore previous state
            print(f"  Removing restored template {template_filename} from multiworld directory...")
            try:
                dest_path = os.path.join(multiworld_dir, template_filename)
                os.remove(dest_path)
                print(f"  Removed successfully")
            except Exception as e:
                print(f"  Error removing template: {e}")
        elif is_second_pass:
            print(f"  Second pass mode - keeping template in multiworld directory")
    else:
        print(f"\n  Multiworld test PASSED for {template_filename}")
        if not keep_templates and not is_second_pass:
            print(f"  Keeping {template_filename} in multiworld directory for future tests")
        elif is_second_pass and needs_regeneration:
            # Second pass with restored template that passed - keep it!
            # (The template we removed to make room was the oldest from first pass)
            print(f"  Keeping restored template {template_filename} in multiworld directory (passed second pass)")

    print(f"\nCompleted {template_filename}: Multiworld Test={'[PASS]' if result['multiworld_test']['success'] else '[FAIL]'}, "
          f"Players Passed={result['multiworld_test']['players_passed']}/{result['multiworld_test']['total_players_tested']}")

    return result


def test_template_multiworld_bisect(template_file: str, templates_dir: str, project_root: str,
                                    world_mapping: Dict[str, Dict], seed: str,
                                    multiworld_dir: str, other_templates: List[str],
                                    headed: bool = False,
                                    include_error_details: bool = False) -> Dict:
    """
    Run bisection tests to find which specific template pair causes a failure.

    When a template fails in a multiworld with N templates, this function tests
    the failing template with each other template individually (2-template tests)
    to identify which specific combination causes the failure.

    Args:
        template_file: Name of the template file that failed (the one being tested)
        templates_dir: Path to templates directory
        project_root: Path to project root
        world_mapping: World mapping dictionary
        seed: Seed number to use
        multiworld_dir: Path to Players/presets/Multiworld directory
        other_templates: List of other template filenames that were in the multiworld
        headed: If True, run Playwright tests in headed mode
        include_error_details: If True, include first error/warning lines in results

    Returns:
        Dictionary with bisection results:
        {
            'triggered': True,
            'tested_pairs': [
                {'partner_template': 'TemplateA.yaml', 'success': True/False, 'error': ...},
                ...
            ],
            'failing_pairs': ['TemplateB.yaml', ...]
        }
    """
    template_filename = os.path.basename(template_file)

    print(f"\n{'='*60}")
    print(f"=== BISECTION: Testing {template_filename} with each partner ===")
    print(f"{'='*60}")
    print(f"Partners to test: {len(other_templates)}")

    bisection_result = {
        'triggered': True,
        'tested_pairs': [],
        'failing_pairs': [],
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

    # Compute seed ID
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        seed_id = None

    source_template_path = os.path.join(templates_dir, template_filename)

    for partner_template in other_templates:
        print(f"\n--- Testing pair: {template_filename} + {partner_template} ---")

        pair_result = {
            'partner_template': partner_template,
            'success': False,
            'generation_success': False,
            'player_results': {}
        }

        # Clear the multiworld directory
        print(f"  Clearing multiworld directory...")
        for f in os.listdir(multiworld_dir):
            if f.endswith('.yaml'):
                try:
                    os.remove(os.path.join(multiworld_dir, f))
                except Exception as e:
                    print(f"    Warning: Could not remove {f}: {e}")

        # Copy the two templates to the multiworld directory
        print(f"  Setting up 2-template test...")
        try:
            # Copy the failing template
            shutil.copy2(source_template_path, os.path.join(multiworld_dir, template_filename))
            # Copy the partner template
            partner_source_path = os.path.join(templates_dir, partner_template)
            shutil.copy2(partner_source_path, os.path.join(multiworld_dir, partner_template))
        except Exception as e:
            print(f"  Error setting up templates: {e}")
            pair_result['error'] = f"Failed to copy templates: {e}"
            bisection_result['tested_pairs'].append(pair_result)
            continue

        # Determine player order (sorted alphabetically)
        sorted_templates = sorted([template_filename, partner_template])
        pair_result['player_1_template'] = sorted_templates[0]
        pair_result['player_2_template'] = sorted_templates[1]

        # Run generation
        print(f"  Running generation...")
        generate_cmd = [
            "python", "Generate.py",
            "--player_files_path", "Players/presets/Multiworld",
            "--seed", seed
        ]

        gen_start_time = time.time()
        gen_return_code, gen_stdout, gen_stderr = run_command(generate_cmd, cwd=project_root, timeout=600)
        gen_end_time = time.time()
        gen_processing_time = round(gen_end_time - gen_start_time, 2)

        # Analyze generation output
        full_output = gen_stdout + "\n" + gen_stderr
        gen_error_count, gen_warning_count, gen_first_error, gen_first_warning = count_errors_and_warnings(full_output)
        gen_error_type = classify_generation_error(full_output) if gen_return_code != 0 else None

        pair_result['generation'] = {
            'success': gen_return_code == 0,
            'return_code': gen_return_code,
            'error_count': gen_error_count,
            'warning_count': gen_warning_count,
            'error_type': gen_error_type,
            'processing_time_seconds': gen_processing_time
        }
        if include_error_details:
            pair_result['generation']['first_error_line'] = gen_first_error
            pair_result['generation']['first_warning_line'] = gen_first_warning

        if gen_return_code != 0:
            print(f"  Generation FAILED (return code {gen_return_code})")
            pair_result['generation_success'] = False
            pair_result['error'] = 'Generation failed'
            bisection_result['tested_pairs'].append(pair_result)
            bisection_result['failing_pairs'].append(partner_template)
            continue

        pair_result['generation_success'] = True

        # Test both players
        print(f"  Running spoiler tests for both players...")
        all_players_passed = True

        for player_num in [1, 2]:
            print(f"    Testing Player {player_num}...")

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
                    analysis_result = parse_playwright_analysis(analysis_text)
                    sphere_reached = analysis_result.get('sphere_reached', 0)
                    pass_fail = analysis_result.get('pass_fail', 'unknown')
                except IOError:
                    pass

            # Read total spheres from sphere_log.jsonl file
            if seed_id:
                sphere_log_path = os.path.join(project_root, 'frontend', 'presets', 'multiworld', seed_id,
                                               f'{seed_id}_sphere_log.jsonl')
                total_spheres = count_total_spheres(sphere_log_path, player_num=player_num)

            # If test passed, sphere_reached should equal total_spheres
            if pass_fail == 'passed':
                sphere_reached = total_spheres

            player_result = {
                'player_number': player_num,
                'template': sorted_templates[player_num - 1],
                'passed': player_passed and pass_fail == 'passed',
                'return_code': spoiler_return_code,
                'sphere_reached': sphere_reached,
                'total_spheres': total_spheres,
                'pass_fail': pass_fail,
                'error_count': test_error_count,
                'warning_count': test_warning_count
            }

            if include_error_details:
                player_result['first_error_line'] = test_first_error
                player_result['first_warning_line'] = test_first_warning

            pair_result['player_results'][f'player_{player_num}'] = player_result

            if player_result['passed']:
                print(f"      Player {player_num}: PASS (sphere {sphere_reached}/{total_spheres})")
            else:
                print(f"      Player {player_num}: FAIL (sphere {sphere_reached}/{total_spheres})")
                all_players_passed = False

        pair_result['success'] = all_players_passed
        bisection_result['tested_pairs'].append(pair_result)

        if not all_players_passed:
            bisection_result['failing_pairs'].append(partner_template)
            print(f"  Pair FAILED: {template_filename} + {partner_template}")
        else:
            print(f"  Pair PASSED: {template_filename} + {partner_template}")

    # Summary
    print(f"\n{'='*60}")
    print(f"=== BISECTION COMPLETE ===")
    print(f"{'='*60}")
    print(f"Total pairs tested: {len(bisection_result['tested_pairs'])}")
    print(f"Failing pairs: {len(bisection_result['failing_pairs'])}")
    if bisection_result['failing_pairs']:
        print(f"Failing partners: {bisection_result['failing_pairs']}")

    return bisection_result


def test_generation_consistency(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed: str = "1") -> Dict:
    """
    Test generation consistency by running generation twice and comparing output files.

    Returns a dict with:
        - rules_identical: bool (True if rules.json files are identical)
        - spoilers_identical: bool (True if sphere_log.jsonl files are identical)
        - seed: str (the seed tested)
        - timestamp: str (ISO format timestamp)
    """
    import hashlib

    template_filename = os.path.basename(template_file)
    game_name_from_filename = normalize_game_name(template_filename)

    # Compute seed ID
    try:
        seed_id = compute_seed_id(int(seed))
    except (ValueError, TypeError):
        print(f"Error: Seed '{seed}' is not a valid number")
        return {
            'seed': seed,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'rules_identical': None,
            'spoilers_identical': None,
            'error': f"Invalid seed: {seed}"
        }

    # Get world info
    world_info = get_world_info(template_file, templates_dir, world_mapping)
    preset_dir = world_info.get('world_directory', game_name_from_filename) if world_info else game_name_from_filename

    # Paths to the generated files
    rules_path = f"./presets/{preset_dir}/{seed_id}/{seed_id}_rules.json"
    sphere_log_path = f"./presets/{preset_dir}/{seed_id}/{seed_id}_sphere_log.jsonl"
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))
    full_sphere_log_path = os.path.join(project_root, 'frontend', sphere_log_path.lstrip('./'))

    print(f"\n=== Testing Generation Consistency for {template_filename} (seed {seed}) ===")

    # Check if the original files exist
    if not os.path.exists(full_rules_path):
        print(f"Error: Original rules file not found: {full_rules_path}")
        return {
            'seed': seed,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'rules_identical': None,
            'spoilers_identical': None,
            'error': 'Original rules file not found'
        }

    if not os.path.exists(full_sphere_log_path):
        print(f"Error: Original sphere log file not found: {full_sphere_log_path}")
        return {
            'seed': seed,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'rules_identical': None,
            'spoilers_identical': None,
            'error': 'Original sphere log file not found'
        }

    # Helper function to compute file hash
    def compute_file_hash(file_path: str) -> str:
        """Compute SHA256 hash of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    # Compute hashes of original files
    print(f"Computing hash of original rules file...")
    original_rules_hash = compute_file_hash(full_rules_path)
    print(f"Computing hash of original sphere log file...")
    original_sphere_log_hash = compute_file_hash(full_sphere_log_path)

    # Run generation again (no need to backup files, we only need the hashes)
    template_file_with_ext = template_filename if template_filename.endswith(('.yaml', '.yml')) else f"{template_filename}.yaml"
    template_path = os.path.join(templates_dir, template_file_with_ext)
    generate_cmd = [
        "python", "Generate.py",
        "--weights_file_path", template_path,
        "--multi", "1",
        "--seed", seed
    ]

    # Show relative path for readability
    players_dir = os.path.join(project_root, 'Players')
    if template_path.startswith(players_dir):
        display_path = os.path.relpath(template_path, players_dir)
    else:
        display_path = template_path
    display_cmd = ["python", "Generate.py", "--weights_file_path", display_path, "--multi", "1", "--seed", seed]

    print(f"Re-running generation with same seed...")
    print(f"  Command: {shlex.join(display_cmd)}")

    gen_return_code, gen_stdout, gen_stderr = run_command(generate_cmd, cwd=project_root, timeout=600)

    if gen_return_code != 0:
        print(f"Error: Re-generation failed with return code {gen_return_code}")
        return {
            'seed': seed,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'rules_identical': None,
            'spoilers_identical': None,
            'error': f'Re-generation failed with return code {gen_return_code}'
        }

    # Compute hashes of new files
    print(f"Computing hash of new rules file...")
    new_rules_hash = compute_file_hash(full_rules_path)
    print(f"Computing hash of new sphere log file...")
    new_sphere_log_hash = compute_file_hash(full_sphere_log_path)

    # Compare hashes
    rules_identical = (original_rules_hash == new_rules_hash)
    spoilers_identical = (original_sphere_log_hash == new_sphere_log_hash)

    print(f"\n  Rules files identical: {rules_identical}")
    print(f"  Sphere log files identical: {spoilers_identical}")

    result = {
        'seed': seed,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'rules_identical': rules_identical,
        'spoilers_identical': spoilers_identical,
        'original_rules_hash': original_rules_hash,
        'new_rules_hash': new_rules_hash,
        'original_sphere_log_hash': original_sphere_log_hash,
        'new_sphere_log_hash': new_sphere_log_hash
    }

    print(f"\nCompleted consistency test for {template_filename}: Rules={'IDENTICAL' if rules_identical else 'DIFFERENT'}, "
          f"Sphere Log={'IDENTICAL' if spoilers_identical else 'DIFFERENT'}")

    return result
