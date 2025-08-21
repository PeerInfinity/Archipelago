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
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


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
            return {}
        else:
            print("World mapping built successfully")
    except Exception as e:
        print(f"Warning: Failed to build world mapping: {e}")
        return {}
    
    # Load the mapping
    try:
        with open(mapping_file, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        print("Warning: Could not load world mapping, using empty mapping")
        return {}


def extract_game_name_from_template(template_path: str) -> Optional[str]:
    """Extract the game name from a template YAML file."""
    try:
        import yaml
        with open(template_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
            return data.get('game')
    except (ImportError, yaml.YAMLError, FileNotFoundError, UnicodeDecodeError):
        # Fall back to normalized template name if YAML parsing fails
        return None


def get_world_info(template_file: str, templates_dir: str, world_mapping: Dict[str, Dict]) -> Dict:
    """Get world information including custom exporter/gameLogic status."""
    template_path = os.path.join(templates_dir, template_file)
    
    # Try to extract game name from YAML file
    game_name = extract_game_name_from_template(template_path)
    
    if game_name and game_name in world_mapping:
        world_info = world_mapping[game_name].copy()
        world_info['game_name_from_yaml'] = game_name
        world_info['normalized_name'] = normalize_game_name(template_file)
        return world_info
    else:
        # Fallback to normalized name
        normalized_name = normalize_game_name(template_file)
        return {
            'game_name_from_yaml': game_name,
            'normalized_name': normalized_name,
            'world_directory': None,
            'has_custom_exporter': False,
            'has_custom_game_logic': False,
            'exporter_path': None,
            'game_logic_path': None
        }


def check_virtual_environment() -> bool:
    """
    Check if the virtual environment is properly activated.
    Returns True if environment is ready, False otherwise.
    """
    # Check if VIRTUAL_ENV environment variable is set (most reliable indicator)
    if 'VIRTUAL_ENV' in os.environ:
        return True
    
    # If not, check if we can import dependencies (fallback for other setups)
    try:
        # Add the project root to Python path for imports
        project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        
        # Try to import a dependency that should be available
        import BaseClasses
        
        # If import works but no VIRTUAL_ENV, warn but allow to continue
        return True
    except ImportError:
        return False


def check_http_server(url: str = "http://localhost:8000", timeout: int = 5) -> bool:
    """
    Check if the HTTP server is running by attempting to connect.
    Returns True if server is reachable, False otherwise.
    """
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.getcode() == 200
    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
        return False


def normalize_game_name(template_name: str) -> str:
    """Convert template filename to lowercase directory name format."""
    # Remove .yaml extension
    game_name = template_name.replace('.yaml', '')
    # Convert to lowercase and replace spaces with underscores
    return game_name.lower().replace(' ', '_').replace('-', '_').replace('&', 'and').replace('!', '').replace("'", '')


def count_errors_and_warnings(text: str) -> Tuple[int, int, Optional[str], Optional[str]]:
    """
    Count occurrences of 'error' and 'warning' in text (case insensitive).
    Ignores lines that start with "[SKIP]", contain "Error Logs:", or "No errors detected" to avoid false positives.
    Returns tuple of (error_count, warning_count, first_error_line, first_warning_line).
    """
    lines = text.split('\n')
    error_count = 0
    warning_count = 0
    first_error_line = None
    first_warning_line = None
    
    for line in lines:
        line_stripped = line.strip()
        line_lower = line_stripped.lower()
        
        # Skip lines that are false positives
        if (line_stripped.startswith('[SKIP]') or 
            'error logs:' in line_lower or
            'no errors detected' in line_lower):
            continue
            
        if 'error' in line_lower:
            error_count += 1
            if first_error_line is None:
                first_error_line = line_stripped
        if 'warning' in line_lower:
            warning_count += 1
            if first_warning_line is None:
                first_warning_line = line_stripped
    
    return error_count, warning_count, first_error_line, first_warning_line


def run_command(cmd: List[str], cwd: str = None, timeout: int = 300, env: Dict = None) -> Tuple[int, str, str]:
    """
    Run a command and return (return_code, stdout, stderr).
    """
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)


def count_total_spheres(spheres_log_path: str) -> float:
    """
    Get the highest sphere_index from spheres_log.jsonl file.
    Returns the sphere_index value from the last line in the file.
    """
    try:
        if not os.path.exists(spheres_log_path):
            return 0
        
        with open(spheres_log_path, 'r') as f:
            last_sphere = 0
            for line in f:
                line = line.strip()
                if line:
                    try:
                        sphere_data = json.loads(line)
                        sphere_index = sphere_data.get('sphere_index', 0)
                        # Convert to float to handle values like "1.1", "2.3", etc.
                        if isinstance(sphere_index, str):
                            last_sphere = float(sphere_index)
                        else:
                            last_sphere = float(sphere_index)
                    except (json.JSONDecodeError, ValueError):
                        continue
            return last_sphere
    except (IOError, OSError):
        return 0


def parse_playwright_analysis(analysis_text: str) -> Dict:
    """
    Parse playwright-analysis.txt to extract test results.
    """
    result = {
        'pass_fail': 'unknown',
        'sphere_reached': 0,
        'total_spheres': 0,
        'error_count': 0,
        'warning_count': 0,
        'first_error_line': None,
        'first_warning_line': None
    }
    
    # Count errors and warnings
    error_count, warning_count, first_error, first_warning = count_errors_and_warnings(analysis_text)
    result['error_count'] = error_count
    result['warning_count'] = warning_count
    result['first_error_line'] = first_error
    result['first_warning_line'] = first_warning
    
    # Parse for sphere information and pass/fail status
    lines = analysis_text.split('\n')
    for line in lines:
        line_stripped = line.strip()
        line_upper = line_stripped.upper()
        
        # Look for pass/fail status - check for [PASS] or [FAIL] in test results
        if '[PASS]' in line_upper:
            result['pass_fail'] = 'passed'
        elif '[FAIL]' in line_upper:
            result['pass_fail'] = 'failed'
        elif 'PASSED:' in line_upper or 'FAILED:' in line_upper:
            if 'PASSED:' in line_upper:
                result['pass_fail'] = 'passed'
            else:
                result['pass_fail'] = 'failed'
        elif 'NO ERRORS DETECTED' in line_upper:
            result['pass_fail'] = 'passed'
        
        # Look for sphere information
        sphere_match = re.search(r'sphere\s+(\d+(?:\.\d+)?)', line_stripped.lower())
        if sphere_match:
            result['sphere_reached'] = float(sphere_match.group(1))
        
        total_match = re.search(r'(\d+)\s+total\s+spheres?', line_stripped.lower())
        if total_match:
            result['total_spheres'] = int(total_match.group(1))
        
        # Alternative patterns for total spheres
        if 'spheres' in line_stripped.lower() and '/' in line_stripped:
            parts = line_stripped.split('/')
            if len(parts) >= 2:
                try:
                    total = int(re.findall(r'\d+', parts[1])[0])
                    result['total_spheres'] = total
                except (IndexError, ValueError):
                    pass
    
    return result


def load_existing_results(results_file: str) -> Dict:
    """Load existing results file or create empty structure."""
    if os.path.exists(results_file):
        try:
            with open(results_file, 'r') as f:
                return json.load(f)
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


def save_results(results: Dict, results_file: str):
    """Save results to JSON file."""
    results['metadata']['last_updated'] = datetime.now().isoformat()
    
    try:
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2, sort_keys=True)
        print(f"Results saved to: {results_file}")
    except IOError as e:
        print(f"Error saving results: {e}")


def test_template(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], export_only: bool = False, spoiler_only: bool = False) -> Dict:
    """Test a single template file and return results."""
    template_name = os.path.basename(template_file)
    game_name = normalize_game_name(template_name)
    seed = "1"
    seed_id = "AP_14089154938208861744"
    
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
        'spoiler_test': {
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
        },
        'rules_file': {
            'path': None,
            'size_bytes': 0,
            'size_mb': 0.0
        },
        'analysis': {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None
        }
    }
    
    # Step 1: Run Generate.py (skip if spoiler_only mode)
    if not spoiler_only:
        print(f"Running Generate.py for {template_name}...")
        template_path = f"Templates/{template_name}"
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
            'success': True,  # Assume success since we're skipping
            'return_code': 0,
            'processing_time_seconds': 0,
            'note': 'Skipped in spoiler-only mode'
        })
    
    # Return early if export_only mode
    if export_only:
        print(f"Export completed for {template_name} (export-only mode)")
        return result
    
    # Step 2: Run spoiler test
    print("Running spoiler test...")
    rules_path = f"./presets/{game_name}/{seed_id}/{seed_id}_rules.json"
    
    # Check if rules file exists (files are actually in frontend/presets/)
    full_rules_path = os.path.join(project_root, 'frontend', rules_path.lstrip('./'))
    if not os.path.exists(full_rules_path):
        print(f"Rules file not found: {full_rules_path}")
        result['spoiler_test']['error_count'] = 1
        result['spoiler_test']['first_error_line'] = f"Rules file not found: {rules_path}"
        return result
    
    spoiler_cmd = ["npm", "run", "test:spoilers"]
    spoiler_env = os.environ.copy()
    spoiler_env['RULES_OVERRIDE'] = rules_path
    
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
    
    print(f"Completed {template_name}: Generation={'✓' if result['generation']['success'] else '✗'}, "
          f"Test={'✓' if result['spoiler_test']['pass_fail'] == 'passed' else '✗'}")
    
    return result


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
        default='scripts/output/template-test-results.json',
        help='Output file path (default: scripts/output/template-test-results.json)'
    )
    parser.add_argument(
        '--skip-list',
        type=str,
        nargs='*',
        default=['Archipelago.yaml', 'Universal Tracker.yaml', 'Sudoku.yaml'],
        help='List of template files to skip (default: Archipelago.yaml Universal Tracker.yaml Sudoku.yaml)'
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
        '--spoiler-only',
        action='store_true',
        help='Only run the spoiler test step, skip generation (requires existing rules files)'
    )
    parser.add_argument(
        '--start-from',
        type=str,
        help='Start processing from the specified template file (alphabetically ordered), skipping all files before it'
    )
    
    args = parser.parse_args()
    
    # Validate mutually exclusive options
    if args.export_only and args.spoiler_only:
        print("Error: --export-only and --spoiler-only are mutually exclusive")
        sys.exit(1)
    
    # Check virtual environment before proceeding
    venv_active = 'VIRTUAL_ENV' in os.environ
    deps_available = check_virtual_environment()
    
    if not deps_available:
        print("❌ ERROR: Required dependencies not available!")
        print("")
        print("Please activate your virtual environment first:")
        print("  Linux/Mac: source .venv/bin/activate")
        print("  Windows:   .venv\\Scripts\\activate")
        print("")
        print("If you haven't set up the development environment, please follow")
        print("the getting-started guide first.")
        sys.exit(1)
    elif not venv_active:
        print("⚠️  WARNING: Virtual environment not detected, but dependencies are available.")
        print("   For best results, activate your virtual environment:")
        print("   Linux/Mac: source .venv/bin/activate")
        print("   Windows:   .venv\\Scripts\\activate")
        print("")
        print("Continuing anyway...")
        print("")
    
    # Check if HTTP server is running (required for spoiler tests, but not for export-only)
    if not args.export_only and not check_http_server():
        print("❌ ERROR: HTTP development server not running!")
        print("")
        print("The spoiler tests require a local development server.")
        print("Please start the server first:")
        print("  python -m http.server 8000")
        print("")
        print("Then access the frontend at: http://localhost:8000/frontend/")
        print("Once the server is running, run this script again.")
        print("")
        print("Alternatively, use --export-only to skip spoiler tests.")
        sys.exit(1)
    
    # Determine project root and templates directory
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    
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
    
    # Handle include list vs skip list logic
    if args.include_list is not None:
        # Include list mode: only test specified files
        yaml_files = [f for f in all_yaml_files if f in args.include_list]
        skipped_files = [f for f in all_yaml_files if f not in args.include_list]
        
        # Check if any requested files don't exist
        missing_files = [f for f in args.include_list if f not in all_yaml_files]
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
    
    # Load or create results structure
    results_file = os.path.join(project_root, args.output_file)
    results = load_existing_results(results_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(results_file), exist_ok=True)
    
    print(f"Results will be saved to: {results_file}")
    print(f"Testing templates from: {templates_dir}")
    
    # Build world mapping once at startup
    world_mapping = build_and_load_world_mapping(project_root)
    
    # Test each template
    total_files = len(yaml_files)
    for i, yaml_file in enumerate(yaml_files, 1):
        print(f"\n[{i}/{total_files}] Processing {yaml_file}")
        
        try:
            template_result = test_template(yaml_file, templates_dir, project_root, world_mapping, 
                                          export_only=args.export_only, spoiler_only=args.spoiler_only)
            results['results'][yaml_file] = template_result
            
            # Save results after each template (incremental updates)
            save_results(results, results_file)
            
        except KeyboardInterrupt:
            print("\nInterrupted by user. Saving current results...")
            save_results(results, results_file)
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
            save_results(results, results_file)
    
    print(f"\n=== Testing Complete ===")
    print(f"Processed {len(yaml_files)} templates")
    print(f"Results saved to: {results_file}")
    
    # Print summary based on mode
    if args.export_only:
        successful_exports = sum(1 for r in results['results'].values() 
                               if r.get('generation', {}).get('success', False))
        failed_exports = len(yaml_files) - successful_exports
        print(f"Export Summary: {successful_exports} successful, {failed_exports} failed")
    elif args.spoiler_only:
        passed = sum(1 for r in results['results'].values() 
                    if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
        failed = sum(1 for r in results['results'].values() 
                    if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
        errors = len(yaml_files) - passed - failed
        print(f"Spoiler Test Summary: {passed} passed, {failed} failed, {errors} errors")
    else:
        passed = sum(1 for r in results['results'].values() 
                    if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
        failed = sum(1 for r in results['results'].values() 
                    if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
        errors = len(yaml_files) - passed - failed
        print(f"Full Test Summary: {passed} passed, {failed} failed, {errors} errors")


if __name__ == '__main__':
    main()