#!/usr/bin/env python3
"""
Automation script to test all template files by running the generation script
and multiplayer timer tests, collecting results in a JSON file.

This script iterates through YAML files in the Templates folder (or an alternate
path specified via command line), runs Generate.py for each template, and then
runs the multiplayer timer test. It collects error/warning counts and test results
in a comprehensive JSON output file.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from seed_utils import get_seed_id as compute_seed_id


def build_and_load_world_mapping(project_root: str) -> Dict[str, Dict]:
    """Build world mapping and load it."""
    mapping_file = os.path.join(project_root, 'scripts', 'data', 'world-mapping.json')
    build_script = os.path.join(project_root, 'scripts', 'build-world-mapping.py')

    # Always build the mapping to ensure it's current
    try:
        print("Building world mapping...")
        result = subprocess.run([sys.executable, build_script],
                              cwd=project_root,
                              capture_output=True,
                              text=True)
        if result.returncode != 0:
            print(f"Warning: Failed to build world mapping: {result.stderr}")
    except Exception as e:
        print(f"Warning: Error building world mapping: {e}")

    # Load the mapping
    if not os.path.exists(mapping_file):
        print(f"Error: World mapping file not found at {mapping_file}")
        return {}

    try:
        with open(mapping_file, 'r') as f:
            mapping = json.load(f)
        print(f"Loaded world mapping with {len(mapping)} entries")
        return mapping
    except Exception as e:
        print(f"Error: Could not load world mapping: {e}")
        return {}


def run_command(cmd: List[str], cwd: str, timeout: int = 300, env: Optional[Dict] = None) -> Tuple[int, str, str]:
    """Run a command and return return_code, stdout, stderr."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", f"Command timed out after {timeout} seconds"
    except Exception as e:
        return -1, "", str(e)


def count_errors_and_warnings(text: str) -> Tuple[int, int, Optional[str], Optional[str]]:
    """Count errors and warnings in output text and return first occurrence of each."""
    error_count = 0
    warning_count = 0
    first_error = None
    first_warning = None

    for line in text.split('\n'):
        line_lower = line.lower()
        if 'error' in line_lower and 'error:' in line_lower:
            error_count += 1
            if first_error is None:
                first_error = line.strip()
        elif 'warning' in line_lower and ('warning:' in line_lower or 'warn' in line_lower):
            warning_count += 1
            if first_warning is None:
                first_warning = line.strip()

    return error_count, warning_count, first_error, first_warning


def parse_multiplayer_test_results(test_results_dir: str) -> Dict:
    """Parse multiplayer test results from JSON files."""
    result = {
        'success': False,
        'client1_passed': False,
        'client2_passed': False,
        'locations_checked': 0,
        'total_locations': 0,
        'error_message': None
    }

    # Find the most recent test result files
    try:
        files = list(Path(test_results_dir).glob('client1-timer-*.json'))
        if not files:
            result['error_message'] = "No test result files found"
            return result

        # Get the most recent file
        latest_file = max(files, key=os.path.getctime)

        with open(latest_file, 'r') as f:
            data = json.load(f)

        # Parse the results
        summary = data.get('summary', {})
        result['client1_passed'] = summary.get('failedCount', 1) == 0

        # Extract locations checked from logs
        test_details = data.get('testDetails', [])
        if test_details:
            # First try to find it in conditions
            conditions = test_details[0].get('conditions', [])
            for condition in conditions:
                desc = condition.get('description', '')
                if 'locations checked' in desc.lower():
                    # Extract numbers from description like "Checked 24/24 locations" or "Only checked 33/249 locations"
                    match = re.search(r'(\d+)/(\d+)', desc)
                    if match:
                        result['locations_checked'] = int(match.group(1))
                        result['total_locations'] = int(match.group(2))
                        break

            # If not found in conditions, check logs for "Final result"
            if result['total_locations'] == 0:
                logs = test_details[0].get('logs', [])
                for log_entry in logs:
                    message = log_entry.get('message', '')
                    if 'final result' in message.lower():
                        # Extract from "Final result: 24 of 24 locations checked"
                        match = re.search(r'(\d+)\s+of\s+(\d+)', message)
                        if match:
                            result['locations_checked'] = int(match.group(1))
                            result['total_locations'] = int(match.group(2))
                            break

        result['success'] = result['client1_passed'] and result['locations_checked'] == result['total_locations']

    except Exception as e:
        result['error_message'] = f"Error parsing test results: {str(e)}"

    return result


def test_template(template_name: str, world_info: Dict, seed: str, project_root: str,
                 export_only: bool = False, spoiler_only: bool = False,
                 single_client: bool = False) -> Dict:
    """Test a single template with Generate.py and multiplayer test."""

    game_name = world_info.get('world_directory', template_name.replace('.yaml', '').replace('.yml', ''))
    seed_id = compute_seed_id(int(seed))

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
        'multiplayer_test': {
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
        },
        'rules_file': {
            'path': None,
            'size_bytes': 0,
            'size_mb': 0.0
        }
    }

    # Step 1: Run Generate.py (skip if spoiler_only mode)
    if not spoiler_only:
        print(f"Running Generate.py for {template_name}...")
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

        if gen_return_code != 0:
            print(f"Generation failed with return code {gen_return_code}")
            return result
    else:
        print(f"Skipping generation for {template_name} (spoiler-only mode)")
        result['generation'].update({
            'success': True,
            'return_code': 0,
            'processing_time_seconds': 0,
            'note': 'Skipped in spoiler-only mode'
        })

    # Return early if export_only mode
    if export_only:
        print(f"Export completed for {template_name} (export-only mode)")
        return result

    # Step 2: Run multiplayer test
    test_mode = "single-client" if single_client else "dual-client"
    print(f"Running multiplayer timer test ({test_mode} mode)...")
    rules_path = f"./presets/{game_name}/{seed_id}/{seed_id}_rules.json"

    # Check if rules file exists (files are actually in frontend/presets/)
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))
    if not os.path.exists(full_rules_path):
        print(f"Rules file not found: {full_rules_path}")
        result['multiplayer_test']['error_count'] = 1
        result['multiplayer_test']['first_error_line'] = f"Rules file not found: {rules_path}"
        return result

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
        # Note: dual-client is the default, no need to set ENABLE_SINGLE_CLIENT

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
        'locations_checked': test_results['locations_checked'],
        'total_locations': test_results['total_locations']
    })

    if test_results.get('error_message'):
        result['multiplayer_test']['first_error_line'] = test_results['error_message']

    # Record rules file info
    try:
        file_size = os.path.getsize(full_rules_path)
        result['rules_file'] = {
            'path': rules_path,
            'size_bytes': file_size,
            'size_mb': round(file_size / (1024 * 1024), 2)
        }
    except Exception:
        pass

    return result


def main():
    parser = argparse.ArgumentParser(description='Test all templates with multiplayer tests')
    parser.add_argument('--templates-dir', default='Templates',
                       help='Directory containing template YAML files (default: Templates)')
    parser.add_argument('--output-file', default='test-results-multiplayer.json',
                       help='Output JSON file for results (default: test-results-multiplayer.json)')
    parser.add_argument('--seed', default='1',
                       help='Seed number to use for all tests (default: 1)')
    parser.add_argument('--template',
                       help='Test only this specific template (without path or .yaml extension)')
    parser.add_argument('--export-only', action='store_true',
                       help='Only run generation, skip multiplayer tests')
    parser.add_argument('--test-only', action='store_true',
                       help='Only run multiplayer tests, skip generation')
    parser.add_argument('--single-client', action='store_true',
                       help='Use single-client mode instead of dual-client (default: dual-client)')

    args = parser.parse_args()

    # Get project root (parent directory of scripts/)
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    templates_dir = os.path.join(project_root, args.templates_dir)

    print(f"Project root: {project_root}")
    print(f"Templates directory: {templates_dir}")
    print(f"Using seed: {args.seed}")
    print(f"Test mode: {'single-client' if args.single_client else 'dual-client'}")

    # Build and load world mapping
    world_mapping = build_and_load_world_mapping(project_root)

    # Get list of template files
    if args.template:
        # Test single template
        template_name = args.template if args.template.endswith(('.yaml', '.yml')) else f"{args.template}.yaml"
        template_files = [template_name]
    else:
        # Get all YAML files
        template_files = [f for f in os.listdir(templates_dir) if f.endswith(('.yaml', '.yml'))]
        template_files.sort()

    print(f"\nFound {len(template_files)} template(s) to test")

    # Test each template
    all_results = []
    successful_tests = 0
    failed_tests = 0

    for template_file in template_files:
        template_name = template_file.replace('.yaml', '').replace('.yml', '')

        # Look up world info
        world_info = world_mapping.get(template_name, {})

        try:
            result = test_template(
                template_file,
                world_info,
                args.seed,
                project_root,
                export_only=args.export_only,
                spoiler_only=args.test_only,
                single_client=args.single_client
            )
            all_results.append(result)

            # Track success/failure
            if args.export_only:
                if result['generation']['success']:
                    successful_tests += 1
                else:
                    failed_tests += 1
            else:
                if result['multiplayer_test']['success']:
                    successful_tests += 1
                    print(f"✓ {template_name}: PASSED")
                else:
                    failed_tests += 1
                    print(f"✗ {template_name}: FAILED")

        except Exception as e:
            print(f"✗ Error testing {template_file}: {e}")
            failed_tests += 1
            all_results.append({
                'template_name': template_file,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })

    # Save results
    output_path = os.path.join(project_root, args.output_file)
    summary = {
        'test_type': 'multiplayer_timer',
        'test_mode': 'single-client' if args.single_client else 'dual-client',
        'timestamp': datetime.now().isoformat(),
        'seed': args.seed,
        'total_templates': len(template_files),
        'successful_tests': successful_tests,
        'failed_tests': failed_tests,
        'export_only': args.export_only,
        'test_only': args.test_only,
        'results': all_results
    }

    with open(output_path, 'w') as f:
        json.dump(summary, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Results saved to: {output_path}")
    print(f"Total templates tested: {len(template_files)}")
    print(f"Successful: {successful_tests}")
    print(f"Failed: {failed_tests}")
    print(f"{'='*60}")

    # Exit with error code if any tests failed
    sys.exit(1 if failed_tests > 0 else 0)


if __name__ == '__main__':
    main()
