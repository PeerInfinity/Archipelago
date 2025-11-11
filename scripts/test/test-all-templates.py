#!/usr/bin/env python3
"""
Automation script to test all template files by running the generation script
and spoiler tests, collecting results in a JSON file.

This script iterates through YAML files in the Templates folder (or an alternate
path specified via command line), runs Generate.py for each template, and then
runs the spoiler test. It collects error/warning counts and test results in a
comprehensive JSON output file.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List

# Add parent scripts directory to path to import from lib
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import utility functions from library modules
from lib.test_utils import (
    read_host_yaml_config,
    build_and_load_world_mapping,
    check_virtual_environment,
    check_http_server
)
from lib.test_results import (
    is_test_passing,
    get_failed_templates,
    get_failing_seed_info,
    load_existing_results,
    merge_results,
    save_results
)
from lib.test_runner import (
    test_template_single_seed,
    test_template_seed_range,
    test_template_multiworld
)
from lib.seed_utils import get_seed_id as compute_seed_id


def run_post_processing_scripts(project_root: str, results_file: str, multiplayer: bool = False, multiworld: bool = False, multitemplate: bool = False):
    """Run post-processing scripts to update documentation and preset files."""
    print("\n=== Running Post-Processing Scripts ===")

    # Read host.yaml to check extend_sphere_log_to_all_locations setting
    host_config = read_host_yaml_config(project_root)
    extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)

    # Generate test charts using unified script (processes all test types and generates summary)
    print("\nGenerating test results charts...")
    chart_script = os.path.join(project_root, 'scripts', 'docs', 'generate-test-chart.py')

    try:
        result = subprocess.run(
            [sys.executable, chart_script],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            print("✓ Test charts generated successfully")
            # Show output from the script
            for line in result.stdout.split('\n'):
                if line.strip() and (line.startswith('✓') or line.startswith('Warning:') or line.startswith('Processing')):
                    print(f"  {line.strip()}")
        else:
            print(f"✗ Failed to generate test charts: {result.stderr}")
    except subprocess.TimeoutExpired:
        print("✗ Test chart generation timed out")
    except Exception as e:
        print(f"✗ Error running generate-test-chart.py: {e}")

    # Only update preset files if extend_sphere_log_to_all_locations is true and not in multiplayer mode
    if not multiplayer and extend_sphere_log:
        print("\nUpdating preset files with test data...")
        preset_script = os.path.join(project_root, 'scripts', 'docs', 'update-preset-files.py')
        try:
            result = subprocess.run(
                [sys.executable, preset_script, '--test-results', results_file],
                cwd=project_root,
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                print("✓ Preset files updated successfully")
                # Show summary from output
                if "Summary:" in result.stdout:
                    in_summary = False
                    for line in result.stdout.split('\n'):
                        if "Summary:" in line:
                            in_summary = True
                        elif in_summary and line.strip().startswith('-'):
                            print(f"  {line.strip()}")
            else:
                print(f"✗ Failed to update preset files: {result.stderr}")
        except subprocess.TimeoutExpired:
            print("✗ Preset files update timed out")
        except Exception as e:
            print(f"✗ Error running update-preset-files.py: {e}")
    elif not multiplayer and not extend_sphere_log:
        print("\nSkipping preset files update (extend_sphere_log_to_all_locations is false)")

    print("\n=== Post-Processing Complete ===")


def main():
    parser = argparse.ArgumentParser(description='Test all Archipelago template files')
    parser.add_argument(
        '--templates-dir', 
        type=str, 
        help='Path to alternate template directory (default: Players/Templates)'
    )
    parser.add_argument(
        '--output-file',
        type=str,
        default='scripts/output/spoiler-minimal/test-results.json',
        help='Output file path (default: scripts/output/spoiler-minimal/test-results.json)'
    )
    parser.add_argument(
        '--skip-list',
        type=str,
        nargs='*',
        default=['Archipelago.yaml', 'Universal Tracker.yaml', 'Final Fantasy.yaml', 'Sudoku.yaml'],
        help='List of template files to skip (default: Archipelago.yaml Universal Tracker.yaml Final Fantasy.yaml Sudoku.yaml)'
    )
    parser.add_argument(
        '--include-list',
        type=str,
        nargs='*',
        help='List of template files to test (if specified, only these files will be tested, overrides skip-list)'
    )
    parser.add_argument(
        '--export-only',
        action='store_true',
        help='Only run the generation (export) step, skip spoiler tests'
    )
    parser.add_argument(
        '--test-only',
        action='store_true',
        help='Only run the test step (spoiler or multiplayer), skip generation (requires existing rules files)'
    )
    parser.add_argument(
        '--start-from',
        type=str,
        help='Start processing from the specified template file (alphabetically ordered), skipping all files before it'
    )
    parser.add_argument(
        '-s', '--seed',
        type=str,
        default=None,
        help='Seed number to use for generation (default: 1)'
    )
    parser.add_argument(
        '--seed-range',
        type=str,
        help='Test a range of seeds (format: start-end, e.g., "1-10"). Reports how many seeds passed before first failure.'
    )
    parser.add_argument(
        '--seed-range-continue-on-failure',
        action='store_true',
        help='When testing seed ranges, continue testing all seeds even after failures (default is to stop at first failure)'
    )
    parser.add_argument(
        '-p', '--post-process',
        action='store_true',
        help='Run post-processing scripts after testing (docs/generate-test-chart.py and docs/update-preset-files.py)'
    )
    parser.add_argument(
        '--multiplayer',
        action='store_true',
        help='Run multiplayer timer tests instead of spoiler tests'
    )
    parser.add_argument(
        '--multiworld',
        action='store_true',
        help='Run multiworld tests - requires all other test types to pass first'
    )
    parser.add_argument(
        '--multiworld-keep-templates',
        action='store_true',
        help='Keep existing templates in Multiworld directory (do not clear or add new templates)'
    )
    parser.add_argument(
        '--multiworld-test-all-players',
        action='store_true',
        help='Test all players each time (not just the newly added player)'
    )
    parser.add_argument(
        '--multitemplate',
        action='store_true',
        help='Run tests on multiple template configurations for the same game (requires --templates-dir)'
    )
    parser.add_argument(
        '--single-client',
        action='store_true',
        help='Use single-client mode for multiplayer tests (only valid with --multiplayer)'
    )
    parser.add_argument(
        '--headed',
        action='store_true',
        help='Run Playwright tests in headed mode (with visible browser windows)'
    )
    parser.add_argument(
        '--retest',
        action='store_true',
        help='Retest only previously failed tests, stopping at the first test that still fails'
    )
    parser.add_argument(
        '--retest-continue',
        type=int,
        metavar='MAX_SEED',
        help='When used with --retest, if a failing seed passes, continue testing subsequent seeds up to MAX_SEED (e.g., --retest-continue 10 to test through seed 10)'
    )
    parser.add_argument(
        '--include-error-details',
        action='store_true',
        help='Include first_error_line and first_warning_line fields in test results (disabled by default)'
    )

    args = parser.parse_args()

    # Validate mutually exclusive options
    if args.export_only and args.test_only:
        print("Error: --export-only and --test-only are mutually exclusive")
        sys.exit(1)

    if args.single_client and not args.multiplayer:
        print("Error: --single-client can only be used with --multiplayer")
        sys.exit(1)

    if args.multiplayer and args.multiworld:
        print("Error: --multiplayer and --multiworld are mutually exclusive")
        sys.exit(1)

    if args.multiworld_keep_templates and not args.multiworld:
        print("Error: --multiworld-keep-templates can only be used with --multiworld")
        sys.exit(1)

    if args.multiworld_test_all_players and not args.multiworld:
        print("Error: --multiworld-test-all-players can only be used with --multiworld")
        sys.exit(1)

    if args.multitemplate and not args.templates_dir:
        print("Error: --multitemplate requires --templates-dir to be specified")
        sys.exit(1)

    if args.multitemplate and (args.multiplayer or args.multiworld):
        print("Error: --multitemplate cannot be used with --multiplayer or --multiworld")
        sys.exit(1)

    if args.retest and args.include_list is not None:
        print("Error: --retest and --include-list are mutually exclusive")
        sys.exit(1)

    if args.retest and args.start_from:
        print("Error: --retest and --start-from are mutually exclusive")
        sys.exit(1)

    if args.retest_continue and not args.retest:
        print("Error: --retest-continue can only be used with --retest")
        sys.exit(1)

    if args.retest_continue and args.retest_continue < 1:
        print("Error: --retest-continue MAX_SEED must be at least 1")
        sys.exit(1)

    # Check if both seed and seed_range were explicitly provided
    if args.seed is not None and args.seed_range is not None:
        print("Error: --seed and --seed-range are mutually exclusive")
        sys.exit(1)
    
    # Parse seed range if provided
    seed_list = []
    if args.seed_range:
        try:
            if '-' in args.seed_range:
                start_seed, end_seed = args.seed_range.split('-', 1)
                start_seed = int(start_seed.strip())
                end_seed = int(end_seed.strip())
                if start_seed > end_seed:
                    print(f"Error: Invalid seed range {start_seed}-{end_seed} (start > end)")
                    sys.exit(1)
                seed_list = list(range(start_seed, end_seed + 1))
            else:
                seed_list = [int(args.seed_range)]
        except ValueError:
            print(f"Error: Invalid seed range format '{args.seed_range}'. Use format like '1-10' or single number.")
            sys.exit(1)
    else:
        # Use the provided seed or default to 1
        seed_to_use = args.seed if args.seed is not None else '1'
        try:
            seed_list = [int(seed_to_use)]
        except ValueError:
            print(f"Error: Invalid seed '{seed_to_use}'. Must be a number.")
            sys.exit(1)
    
    # Check virtual environment before proceeding
    venv_active = 'VIRTUAL_ENV' in os.environ
    deps_available = check_virtual_environment()
    
    if not deps_available:
        print("[ERROR] Required dependencies not available!")
        print("")
        print("Please activate your virtual environment first:")
        print("  Linux/Mac: source .venv/bin/activate")
        print("  Windows:   .venv\\Scripts\\activate")
        print("")
        print("If you haven't set up the development environment, please follow")
        print("the getting-started guide first.")
        sys.exit(1)
    elif not venv_active:
        print("[WARNING] Virtual environment not detected, but dependencies are available.")
        print("   For best results, activate your virtual environment:")
        print("   Linux/Mac: source .venv/bin/activate")
        print("   Windows:   .venv\\Scripts\\activate")
        print("")
        print("Continuing anyway...")
        print("")
    
    # Determine project root early (needed for server startup)
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

    # Check if HTTP server is running (required for spoiler tests, but not for export-only)
    if not args.export_only and not check_http_server():
        print("[WARNING] HTTP development server not running!")
        print("")
        print("The spoiler tests require a local development server.")
        print("Starting server automatically: python -m http.server 8000")
        print("")

        # Start the server in the background
        try:
            server_process = subprocess.Popen(
                [sys.executable, '-m', 'http.server', '8000'],
                cwd=project_root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

            # Wait for server to start (up to 10 seconds)
            print("Waiting for server to start...", end='', flush=True)
            for i in range(20):  # 20 attempts, 0.5 seconds each = 10 seconds total
                time.sleep(0.5)
                if check_http_server():
                    print(" Server started successfully!")
                    print(f"Server running at: http://localhost:8000/frontend/")
                    print(f"Server PID: {server_process.pid}")
                    print("")
                    break
                print(".", end='', flush=True)
            else:
                # Server didn't start in time
                print(" Failed!")
                print("")
                print("[ERROR] Server failed to start within 10 seconds.")
                print("Please start the server manually:")
                print("  python -m http.server 8000")
                print("")
                print("Alternatively, use --export-only to skip spoiler tests.")
                server_process.terminate()
                sys.exit(1)
        except Exception as e:
            print(f"[ERROR] Failed to start server: {e}")
            print("")
            print("Please start the server manually:")
            print("  python -m http.server 8000")
            print("")
            print("Alternatively, use --export-only to skip spoiler tests.")
            sys.exit(1)

    # Determine templates directory (project_root already defined earlier)
    if args.templates_dir:
        templates_dir = os.path.abspath(args.templates_dir)
    else:
        templates_dir = os.path.join(project_root, 'Players', 'Templates')
    
    if not os.path.exists(templates_dir):
        print(f"Error: Templates directory not found: {templates_dir}")
        sys.exit(1)
    
    # Get list of YAML files
    all_yaml_files = [f for f in os.listdir(templates_dir) if f.endswith('.yaml')]
    if not all_yaml_files:
        print(f"Error: No YAML files found in {templates_dir}")
        sys.exit(1)

    # Initialize retest_seed_info (used in test loop)
    retest_seed_info = {}

    # Handle --retest mode: load existing results and filter to only failed tests
    if args.retest:
        # Determine the correct results file path based on mode
        if args.multiworld:
            retest_results_file = os.path.join(project_root, 'scripts/output/multiworld/test-results.json')
        elif args.multiplayer:
            retest_results_file = os.path.join(project_root, 'scripts/output/multiplayer/test-results.json')
        else:
            # Read host.yaml to determine spoiler output directory
            host_config = read_host_yaml_config(project_root)
            extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)
            if extend_sphere_log:
                retest_results_file = os.path.join(project_root, 'scripts/output/spoiler-full/test-results.json')
            else:
                retest_results_file = os.path.join(project_root, 'scripts/output/spoiler-minimal/test-results.json')

        # Load existing results
        if not os.path.exists(retest_results_file):
            print(f"Error: Cannot use --retest because results file not found: {retest_results_file}")
            print("Please run a full test first to generate results.")
            sys.exit(1)

        existing_results = load_existing_results(retest_results_file)
        if 'results' not in existing_results or not existing_results['results']:
            print(f"Error: Cannot use --retest because results file is empty: {retest_results_file}")
            print("Please run a full test first to generate results.")
            sys.exit(1)

        # Get list of failed templates and their failing seed info
        failed_templates = get_failed_templates(existing_results['results'], args.multiplayer)

        # If --retest-continue is specified, also include templates that haven't been tested up to that threshold
        templates_to_test = set(failed_templates)
        if args.retest_continue:
            for template, result in existing_results['results'].items():
                if template not in templates_to_test and isinstance(result, dict):
                    # Check if this template has seed range data
                    seed_range = result.get('seed_range')
                    if seed_range:
                        try:
                            # Parse the highest tested seed
                            if '-' in seed_range:
                                _, max_tested = seed_range.split('-')
                                max_tested_seed = int(max_tested)
                            else:
                                max_tested_seed = int(seed_range)

                            # If we haven't tested up to retest_continue, include this template
                            if max_tested_seed < args.retest_continue:
                                templates_to_test.add(template)
                        except (ValueError, AttributeError):
                            pass

        if not templates_to_test:
            print("No templates need retesting!")
            if args.retest_continue:
                print(f"All templates have either failed tests or have been tested through seed {args.retest_continue}.")
            sys.exit(0)

        # Build a dictionary mapping template to seed info for retest
        retest_seed_info = {}
        for template in templates_to_test:
            seed_info = get_failing_seed_info(template, existing_results['results'], args.multiplayer)
            retest_seed_info[template] = seed_info

        # Filter to only include templates that exist in the templates directory
        yaml_files = sorted([f for f in templates_to_test if f in all_yaml_files])

        if not yaml_files:
            print("Error: No templates to retest found in the templates directory")
            print(f"Templates to retest: {', '.join(templates_to_test)}")
            print(f"Templates in directory: {', '.join(all_yaml_files)}")
            sys.exit(1)

        print(f"Retest mode: Found {len(yaml_files)} templates to test")
        for template in yaml_files:
            seed_info = retest_seed_info[template]
            if seed_info['failing_seed']:
                print(f"  - {template}: will test seed {seed_info['failing_seed']}", end='')
                if args.retest_continue and seed_info['failing_seed'] < args.retest_continue:
                    print(f" (and continue to seed {args.retest_continue} if it passes)")
                else:
                    print()
            elif args.retest_continue and seed_info['seed_range_tested']:
                # No failing seed, but needs to continue testing
                try:
                    if '-' in seed_info['seed_range_tested']:
                        _, max_tested = seed_info['seed_range_tested'].split('-')
                        max_tested_seed = int(max_tested)
                    else:
                        max_tested_seed = int(seed_info['seed_range_tested'])
                    print(f"  - {template}: will test seeds {max_tested_seed + 1}-{args.retest_continue} (continuing from seed {max_tested_seed})")
                except (ValueError, AttributeError):
                    print(f"  - {template}: will test seed 1 (no seed-specific failure data)")
            else:
                print(f"  - {template}: will test seed 1 (no seed-specific failure data)")
        filter_description = f"retest mode ({len(yaml_files)} templates)"
        skipped_files = [f for f in all_yaml_files if f not in yaml_files]

    # Handle include list vs skip list logic
    elif args.include_list is not None:
        # Include list mode: only test specified files
        # Allow matching with or without .yaml extension
        yaml_files = []
        for requested_file in args.include_list:
            # Try exact match first
            if requested_file in all_yaml_files:
                yaml_files.append(requested_file)
            # Try adding .yaml extension
            elif not requested_file.endswith('.yaml') and f"{requested_file}.yaml" in all_yaml_files:
                yaml_files.append(f"{requested_file}.yaml")
            # Try removing .yaml extension and finding match
            elif requested_file.endswith('.yaml'):
                base_name = requested_file[:-5]
                matching_file = next((f for f in all_yaml_files if f.startswith(base_name)), None)
                if matching_file:
                    yaml_files.append(matching_file)
        
        # Remove duplicates while preserving order
        yaml_files = list(dict.fromkeys(yaml_files))
        skipped_files = [f for f in all_yaml_files if f not in yaml_files]
        
        # Check if any requested files don't exist
        found_files = set(yaml_files)
        missing_files = []
        for requested in args.include_list:
            if requested not in found_files and f"{requested}.yaml" not in found_files:
                # Check if we found it by removing .yaml
                base_name = requested[:-5] if requested.endswith('.yaml') else requested
                if not any(f.startswith(base_name) for f in found_files):
                    missing_files.append(requested)
        
        if missing_files:
            print(f"Warning: Requested files not found: {', '.join(missing_files)}")
        
        if not yaml_files:
            print(f"Error: None of the requested files were found in {templates_dir}")
            if args.include_list:
                print(f"Requested: {', '.join(args.include_list)}")
                print(f"Available: {', '.join(all_yaml_files)}")
            sys.exit(1)
        
        filter_description = f"include list ({len(args.include_list)} requested)"
    else:
        # Skip list mode: exclude specified files
        yaml_files = [f for f in all_yaml_files if f not in args.skip_list]
        skipped_files = [f for f in all_yaml_files if f in args.skip_list]
        
        if not yaml_files:
            print(f"Error: No testable YAML files found after filtering (all files are in skip list)")
            sys.exit(1)
        
        filter_description = f"skip list ({len(args.skip_list)} excluded)"
    
    yaml_files.sort()
    
    # Handle --start-from option
    if args.start_from:
        if args.start_from not in yaml_files:
            print(f"Error: Start file '{args.start_from}' not found in testable files")
            print(f"Available testable files: {', '.join(yaml_files)}")
            sys.exit(1)
        
        # Find the index and slice from there
        start_index = yaml_files.index(args.start_from)
        before_start = yaml_files[:start_index]
        yaml_files = yaml_files[start_index:]
        
        print(f"Found {len(all_yaml_files)} template files ({len(yaml_files)} will be tested, {len(skipped_files) + len(before_start)} filtered)")
        print(f"Starting from: {args.start_from} (skipping {len(before_start)} files before it)")
    else:
        print(f"Found {len(all_yaml_files)} template files ({len(yaml_files)} testable, {len(skipped_files)} filtered by {filter_description})")
    
    if skipped_files and len(skipped_files) <= 10:  # Only show if reasonable number
        if args.include_list is not None:
            print(f"Not included: {', '.join(skipped_files)}")
        else:
            print(f"Skipping: {', '.join(skipped_files)}")
    elif len(skipped_files) > 10:
        print(f"{'Not included' if args.include_list is not None else 'Skipping'}: {len(skipped_files)} files (too many to list)")
    
    # Load existing results for merging
    # Adjust output file path based on mode and configuration
    if args.output_file == 'scripts/output/spoiler-minimal/test-results.json':
        # Using default path - adjust based on mode
        if args.multiworld:
            # Use multiworld-specific output directory and file name
            args.output_file = 'scripts/output/multiworld/test-results.json'
        elif args.multiplayer:
            # Use multiplayer-specific output directory and file name
            args.output_file = 'scripts/output/multiplayer/test-results.json'
        elif args.multitemplate:
            # Multitemplate mode - check extend_sphere_log_to_all_locations setting
            host_config = read_host_yaml_config(project_root)
            extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)

            if extend_sphere_log:
                args.output_file = 'scripts/output/multitemplate-full/test-results.json'
            else:
                args.output_file = 'scripts/output/multitemplate-minimal/test-results.json'
        else:
            # Spoiler mode - check extend_sphere_log_to_all_locations setting
            host_config = read_host_yaml_config(project_root)
            extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)

            if extend_sphere_log:
                args.output_file = 'scripts/output/spoiler-full/test-results.json'
            else:
                args.output_file = 'scripts/output/spoiler-minimal/test-results.json'

    results_file = os.path.join(project_root, args.output_file)

    # Save a timestamped backup of the existing results file if it exists
    if os.path.exists(results_file):
        timestamp_backup = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        backup_dir = os.path.dirname(results_file)
        backup_basename = os.path.basename(results_file)
        # Insert timestamp before file extension
        name_parts_backup = backup_basename.rsplit('.', 1)
        if len(name_parts_backup) == 2:
            backup_filename = f"{name_parts_backup[0]}_backup_{timestamp_backup}.{name_parts_backup[1]}"
        else:
            backup_filename = f"{backup_basename}_backup_{timestamp_backup}"
        backup_file = os.path.join(backup_dir, backup_filename)

        try:
            import shutil
            shutil.copy2(results_file, backup_file)
            print(f"Backup of existing results saved to: {backup_filename}")
        except (IOError, OSError) as e:
            print(f"Warning: Could not create backup of existing results: {e}")

    existing_results = load_existing_results(results_file)

    # Determine if we should update metadata in merged results
    # Only update metadata for full runs (no --include-list and no --retest)
    update_metadata = args.include_list is None and not args.retest

    # Create new results structure for this run
    results = {
        'metadata': {
            'created': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat(),
            'script_version': '1.0.0'
        },
        'results': {}
    }

    # Ensure output directory exists
    os.makedirs(os.path.dirname(results_file), exist_ok=True)

    # Generate timestamped filename
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    output_dir = os.path.dirname(results_file)
    output_basename = os.path.basename(results_file)
    # Insert timestamp before file extension
    name_parts = output_basename.rsplit('.', 1)
    if len(name_parts) == 2:
        timestamped_basename = f"{name_parts[0]}_{timestamp}.{name_parts[1]}"
    else:
        timestamped_basename = f"{output_basename}_{timestamp}"
    timestamped_file = os.path.join(output_dir, timestamped_basename)

    print(f"Results will be saved to: {results_file}")
    print(f"Timestamped backup will be saved to: {timestamped_basename}")
    print(f"Testing templates from: {templates_dir}")
    
    # Build world mapping once at startup
    world_mapping = build_and_load_world_mapping(project_root)
    
    # Display seed information
    if len(seed_list) == 1:
        computed_seed_id = compute_seed_id(seed_list[0])
        print(f"Using seed {seed_list[0]} -> {computed_seed_id}")
    else:
        print(f"Testing seed range: {seed_list[0]}-{seed_list[-1]} ({len(seed_list)} seeds)")
        if args.seed_range_continue_on_failure:
            print("Will test all seeds regardless of failures")
        else:
            print("Will stop at first failure (default behavior)")
    
    # Multiworld mode setup
    multiworld_dir = None
    multiworld_player_count = 0
    if args.multiworld:
        # Set up multiworld directory
        multiworld_dir = os.path.join(project_root, 'Players', 'presets', 'Multiworld')

        if args.multiworld_keep_templates:
            # Keep existing templates - just count them
            if os.path.exists(multiworld_dir):
                multiworld_player_count = len([f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')])
                print(f"\n=== Multiworld Mode: Keeping existing {multiworld_player_count} templates ===")
            else:
                # Create the directory if it doesn't exist
                os.makedirs(multiworld_dir, exist_ok=True)
                print(f"\n=== Multiworld Mode: Created multiworld directory (no existing templates) ===")
        else:
            # Normal mode - clear or count based on seed
            # Delete all template files from multiworld directory at start (for first seed only)
            if seed_list[0] == 1 or (args.retest and not args.retest_continue):
                print(f"\n=== Multiworld Mode: Clearing multiworld directory ===")
                if os.path.exists(multiworld_dir):
                    # Delete all .yaml files in the directory
                    for file in os.listdir(multiworld_dir):
                        if file.endswith('.yaml'):
                            file_path = os.path.join(multiworld_dir, file)
                            try:
                                os.remove(file_path)
                                print(f"  Removed {file}")
                            except Exception as e:
                                print(f"  Error removing {file}: {e}")
                else:
                    # Create the directory if it doesn't exist
                    os.makedirs(multiworld_dir, exist_ok=True)
                    print(f"  Created multiworld directory: {multiworld_dir}")
            else:
                # For subsequent seeds, count existing templates
                if os.path.exists(multiworld_dir):
                    multiworld_player_count = len([f for f in os.listdir(multiworld_dir) if f.endswith('.yaml')])
                    print(f"\n=== Multiworld Mode: Using existing {multiworld_player_count} templates ===")

    # Start timing the batch processing
    batch_start_time = time.time()
    print(f"Starting batch processing of {len(yaml_files)} templates...")

    # Test each template
    total_files = len(yaml_files)
    for i, yaml_file in enumerate(yaml_files, 1):
        print(f"\n[{i}/{total_files}] Processing {yaml_file}")

        try:
            # Determine which seed(s) to test
            if args.retest:
                # In retest mode, use the failing seed from the test results
                seed_info = retest_seed_info.get(yaml_file, {})
                failing_seed = seed_info.get('failing_seed')
                seed_range_tested = seed_info.get('seed_range_tested')

                if failing_seed and args.retest_continue:
                    # Test from failing seed to retest_continue max
                    if failing_seed < args.retest_continue:
                        retest_seed_list = list(range(failing_seed, args.retest_continue + 1))
                        print(f"Testing seeds {failing_seed}-{args.retest_continue} (failing seed + continue)")
                        template_result = test_template_seed_range(
                            yaml_file, templates_dir, project_root, world_mapping,
                            retest_seed_list, export_only=args.export_only, test_only=args.test_only,
                            stop_on_failure=True,  # Stop on first failure in retest mode
                            multiplayer=args.multiplayer, single_client=args.single_client,
                            headed=args.headed, include_error_details=args.include_error_details
                        )
                    else:
                        # Failing seed is >= retest_continue, just test the failing seed
                        print(f"Testing seed {failing_seed} (failing seed)")
                        template_result = test_template_single_seed(
                            yaml_file, templates_dir, project_root, world_mapping,
                            str(failing_seed), export_only=args.export_only, test_only=args.test_only,
                            multiplayer=args.multiplayer, single_client=args.single_client,
                            headed=args.headed, include_error_details=args.include_error_details
                        )
                elif failing_seed:
                    # Test just the failing seed
                    print(f"Testing seed {failing_seed} (failing seed)")
                    template_result = test_template_single_seed(
                        yaml_file, templates_dir, project_root, world_mapping,
                        str(failing_seed), export_only=args.export_only, test_only=args.test_only,
                        multiplayer=args.multiplayer, single_client=args.single_client,
                        headed=args.headed, include_error_details=args.include_error_details
                    )
                elif args.retest_continue and seed_range_tested:
                    # No failing seed, but we have seed range data and --retest-continue
                    # Parse the seed range to find the highest tested seed
                    try:
                        if '-' in seed_range_tested:
                            _, max_tested = seed_range_tested.split('-')
                            max_tested_seed = int(max_tested)
                        else:
                            max_tested_seed = int(seed_range_tested)

                        # Test from next untested seed to retest_continue
                        if max_tested_seed < args.retest_continue:
                            retest_seed_list = list(range(max_tested_seed + 1, args.retest_continue + 1))
                            print(f"Testing seeds {max_tested_seed + 1}-{args.retest_continue} (continuing from last tested seed)")
                            template_result = test_template_seed_range(
                                yaml_file, templates_dir, project_root, world_mapping,
                                retest_seed_list, export_only=args.export_only, test_only=args.test_only,
                                stop_on_failure=True,  # Stop on first failure in retest mode
                                multiplayer=args.multiplayer, single_client=args.single_client,
                                headed=args.headed, include_error_details=args.include_error_details
                            )
                        else:
                            # Already tested up to or past retest_continue, nothing to do
                            print(f"Already tested through seed {max_tested_seed}, which is >= {args.retest_continue}. Skipping.")
                            continue
                    except (ValueError, AttributeError):
                        # Couldn't parse seed range, fall back to testing seed 1
                        print(f"Testing seed 1 (couldn't parse seed range: {seed_range_tested})")
                        template_result = test_template_single_seed(
                            yaml_file, templates_dir, project_root, world_mapping,
                            "1", export_only=args.export_only, test_only=args.test_only,
                            multiplayer=args.multiplayer, single_client=args.single_client,
                            headed=args.headed, include_error_details=args.include_error_details
                        )
                else:
                    # No seed-specific failure data, test seed 1
                    print(f"Testing seed 1 (no seed-specific failure data)")
                    template_result = test_template_single_seed(
                        yaml_file, templates_dir, project_root, world_mapping,
                        "1", export_only=args.export_only, test_only=args.test_only,
                        multiplayer=args.multiplayer, single_client=args.single_client,
                        headed=args.headed, include_error_details=args.include_error_details
                    )
            elif args.multiworld:
                # Multiworld mode - special handling
                # For each seed, test the template in multiworld mode
                if len(seed_list) > 1:
                    # Seed range testing in multiworld mode
                    print(f"Error: Seed range testing not yet supported in multiworld mode")
                    # For now, we'll just test the first seed
                    template_result = test_template_multiworld(
                        yaml_file, templates_dir, project_root, world_mapping,
                        str(seed_list[0]), multiworld_dir, existing_results,
                        multiworld_player_count, export_only=args.export_only,
                        test_only=args.test_only, headed=args.headed,
                        keep_templates=args.multiworld_keep_templates,
                        test_all_players=args.multiworld_test_all_players,
                        include_error_details=args.include_error_details
                    )
                else:
                    # Single seed in multiworld mode
                    template_result = test_template_multiworld(
                        yaml_file, templates_dir, project_root, world_mapping,
                        str(seed_list[0]), multiworld_dir, existing_results,
                        multiworld_player_count, export_only=args.export_only,
                        test_only=args.test_only, headed=args.headed,
                        keep_templates=args.multiworld_keep_templates,
                        test_all_players=args.multiworld_test_all_players,
                        include_error_details=args.include_error_details
                    )

                # If the test passed AND we're not in keep_templates mode, increment player count for next template
                if not args.multiworld_keep_templates and template_result.get('multiworld_test', {}).get('success', False):
                    multiworld_player_count += 1
            elif len(seed_list) > 1:
                # Test with seed range (normal mode)
                template_result = test_template_seed_range(
                    yaml_file, templates_dir, project_root, world_mapping,
                    seed_list, export_only=args.export_only, test_only=args.test_only,
                    stop_on_failure=not args.seed_range_continue_on_failure,
                    multiplayer=args.multiplayer, single_client=args.single_client,
                    headed=args.headed, include_error_details=args.include_error_details
                )
            else:
                # Test with single seed (normal mode)
                template_result = test_template_single_seed(
                    yaml_file, templates_dir, project_root, world_mapping,
                    str(seed_list[0]), export_only=args.export_only, test_only=args.test_only,
                    multiplayer=args.multiplayer, single_client=args.single_client,
                    headed=args.headed, include_error_details=args.include_error_details
                )
            
            # Store results - in multitemplate mode, nest by game name → template filename
            if args.multitemplate:
                # Extract game name from template result
                game_name = template_result.get('world_info', {}).get('game_name_from_yaml', 'Unknown')
                # Remove .yaml extension from template filename for cleaner display
                template_key = yaml_file.replace('.yaml', '')

                # Initialize game entry if it doesn't exist
                if game_name not in results['results']:
                    results['results'][game_name] = {}

                # Store template result under game → template
                results['results'][game_name][template_key] = template_result
            else:
                # Normal mode - store by template filename
                results['results'][yaml_file] = template_result

            # Save results after each template (incremental updates)
            # Merge with existing results and save
            templates_tested_so_far = list(results['results'].keys())
            incremental_merged = merge_results(existing_results, results, templates_tested_so_far, update_metadata)
            save_results(incremental_merged, results_file)

            # Run post-processing after each test if requested (do this BEFORE checking retest status)
            if args.post_process:
                run_post_processing_scripts(project_root, results_file, args.multiplayer, args.multiworld, args.multitemplate)

            # In retest mode, check if this test is now passing and stop if it still fails
            if args.retest:
                test_passed = is_test_passing(yaml_file, results['results'], args.multiplayer)
                if test_passed:
                    print(f"✅ {yaml_file} is now passing! Continuing to next failed test...")
                else:
                    print(f"❌ {yaml_file} still failing. Stopping retest.")
                    print(f"\nRetest stopped at first still-failing test: {yaml_file}")
                    # Save timestamped partial results (snapshot of this retest run only)
                    # Note: Don't save to results_file here - incremental_merged was already saved above
                    try:
                        with open(timestamped_file, 'w') as f:
                            json.dump(results, f, indent=2, sort_keys=True)
                        print(f"Timestamped results saved to: {timestamped_file}")
                    except IOError as e:
                        print(f"Error saving timestamped results: {e}")
                    sys.exit(0)

        except KeyboardInterrupt:
            print("\nInterrupted by user. Saving current results...")
            templates_tested_so_far = list(results['results'].keys())
            incremental_merged = merge_results(existing_results, results, templates_tested_so_far, update_metadata)
            save_results(incremental_merged, results_file)
            # Also save timestamped partial results
            save_results(results, results_file, timestamped_file=timestamped_file)
            sys.exit(1)
        except Exception as e:
            print(f"Error processing {yaml_file}: {e}")
            # Create minimal error result
            error_result = {
                'template_name': yaml_file,
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
            results['results'][yaml_file] = error_result
            # Save results after error (incremental updates)
            templates_tested_so_far = list(results['results'].keys())
            incremental_merged = merge_results(existing_results, results, templates_tested_so_far, update_metadata)
            save_results(incremental_merged, results_file)
    
    # Calculate total batch processing time
    batch_end_time = time.time()
    total_batch_time = batch_end_time - batch_start_time

    # Save timestamped results file (snapshot of this run only)
    save_results(results, results_file, total_batch_time, timestamped_file)

    # Merge this run's results into the existing results
    # Use the actual templates tested (from results dict) rather than yaml_files
    # This is important for --retest mode where yaml_files only contains failed templates
    templates_actually_tested = list(results['results'].keys())
    merged_results = merge_results(existing_results, results, templates_actually_tested, update_metadata)

    # Save merged results to main file
    save_results(merged_results, results_file)

    print(f"\n=== Testing Complete ===")

    # Special message for retest mode where all tests passed
    if args.retest:
        print(f"🎉 All {len(yaml_files)} previously failed tests are now passing!")

    print(f"Processed {len(yaml_files)} templates")
    print(f"Total batch processing time: {total_batch_time:.1f} seconds ({total_batch_time/60:.1f} minutes)")
    if len(yaml_files) > 0:
        avg_time_per_template = total_batch_time / len(yaml_files)
        print(f"Average time per template: {avg_time_per_template:.1f} seconds")
    print(f"Timestamped results saved to: {timestamped_file}")
    print(f"Merged results saved to: {results_file}")
    
    # Print summary based on mode and seed range
    print(f"\n=== Final Summary ===")
    
    if len(seed_list) > 1:
        # Seed range testing summary
        templates_with_all_seeds_passed = 0
        templates_with_some_failures = 0
        total_consecutive_passes = 0
        
        print(f"Seed Range Testing Results ({len(seed_list)} seeds per template):")
        
        for template_name, result in results['results'].items():
            if 'seed_range' in result:
                seeds_passed = result.get('seeds_passed', 0)
                seeds_failed = result.get('seeds_failed', 0)
                consecutive_passes = result.get('consecutive_passes_before_failure', 0)
                first_failure_seed = result.get('first_failure_seed')
                
                total_consecutive_passes += consecutive_passes
                
                if seeds_failed == 0:
                    templates_with_all_seeds_passed += 1
                    print(f"  ✅ {template_name}: All {seeds_passed} seeds passed")
                else:
                    templates_with_some_failures += 1
                    if first_failure_seed:
                        print(f"  ❌ {template_name}: {consecutive_passes} consecutive passes, first failure at seed {first_failure_seed}")
                    else:
                        print(f"  ❌ {template_name}: {seeds_passed} passed, {seeds_failed} failed")
        
        print(f"\nOverall Seed Range Summary:")
        print(f"  Templates with all seeds passing: {templates_with_all_seeds_passed}")
        print(f"  Templates with some failures: {templates_with_some_failures}")
        if len(yaml_files) > 0:
            avg_consecutive = total_consecutive_passes / len(yaml_files)
            print(f"  Average consecutive passes before failure: {avg_consecutive:.1f}")
    
    else:
        # Single seed testing summary
        if args.export_only:
            successful_exports = sum(1 for r in results['results'].values() 
                                   if r.get('generation', {}).get('success', False))
            failed_exports = len(yaml_files) - successful_exports
            print(f"Export Summary: {successful_exports} successful, {failed_exports} failed")
        elif args.test_only:
            if args.multiworld:
                # Multiworld test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('multiworld_test', {}).get('success', False))
                skipped = sum(1 for r in results['results'].values()
                            if not r.get('prerequisite_check', {}).get('all_prerequisites_passed', False))
                failed = len(yaml_files) - passed - skipped
                print(f"Multiworld Test Summary: {passed} passed, {failed} failed, {skipped} skipped (prerequisites not met)")
            elif args.multiplayer:
                # Multiplayer test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('multiplayer_test', {}).get('success', False))
                failed = len(yaml_files) - passed
                print(f"Multiplayer Test Summary: {passed} passed, {failed} failed")
            else:
                # Spoiler test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
                failed = sum(1 for r in results['results'].values()
                            if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
                errors = len(yaml_files) - passed - failed
                print(f"Spoiler Test Summary: {passed} passed, {failed} failed, {errors} errors")
        else:
            # Full run (not test-only or export-only)
            if args.multiworld:
                # Multiworld test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('multiworld_test', {}).get('success', False))
                skipped = sum(1 for r in results['results'].values()
                            if not r.get('prerequisite_check', {}).get('all_prerequisites_passed', False))
                failed = len(yaml_files) - passed - skipped
                print(f"Single Seed Test Summary: {passed} passed, {failed} failed, {skipped} skipped")
                print(f"\nMultiworld Details:")
                print(f"  Total players in final multiworld: {multiworld_player_count}")
            elif args.multiplayer:
                # Multiplayer test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('multiplayer_test', {}).get('success', False))
                failed = len(yaml_files) - passed
                print(f"Single Seed Test Summary: {passed} passed, {failed} failed, 0 errors")
            else:
                # Spoiler test summary
                # In multitemplate mode, results are nested by game → template
                # In normal mode, results are keyed by template filename
                if args.multitemplate:
                    # Flatten nested results for counting
                    all_template_results = []
                    for game_templates in results['results'].values():
                        if isinstance(game_templates, dict):
                            all_template_results.extend(game_templates.values())

                    passed = sum(1 for r in all_template_results
                                if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
                    failed = sum(1 for r in all_template_results
                                if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
                    errors = len(yaml_files) - passed - failed
                else:
                    # Normal mode
                    passed = sum(1 for r in results['results'].values()
                                if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
                    failed = sum(1 for r in results['results'].values()
                                if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
                    errors = len(yaml_files) - passed - failed

                print(f"Single Seed Test Summary: {passed} passed, {failed} failed, {errors} errors")
    
    # Run post-processing scripts if requested (only if not already run after each test)
    # This ensures post-processing runs at least once, even if no tests were run
    if args.post_process and len(yaml_files) == 0:
        run_post_processing_scripts(project_root, results_file, args.multiplayer, args.multiworld)


if __name__ == '__main__':
    main()