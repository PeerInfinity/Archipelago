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
import yaml
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from seed_utils import get_seed_id as compute_seed_id


def read_host_yaml_config(project_root: str) -> Dict:
    """Read configuration from host.yaml file."""
    host_yaml_path = os.path.join(project_root, 'host.yaml')
    try:
        with open(host_yaml_path, 'r') as f:
            config = yaml.safe_load(f)
            return config
    except (FileNotFoundError, yaml.YAMLError) as e:
        print(f"Warning: Could not read host.yaml: {e}")
        return {}


def run_post_processing_scripts(project_root: str, results_file: str, multiplayer: bool = False):
    """Run post-processing scripts to update documentation and preset files."""
    print("\n=== Running Post-Processing Scripts ===")

    # Read host.yaml to check extend_sphere_log_to_all_locations setting
    host_config = read_host_yaml_config(project_root)
    extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)

    # Generate test charts using unified script (processes all test types and generates summary)
    print("\nGenerating test results charts...")
    chart_script = os.path.join(project_root, 'scripts', 'generate-test-chart.py')

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
        preset_script = os.path.join(project_root, 'scripts', 'update-preset-files.py')
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


def get_world_directory_name_from_game_name(game_name: str) -> str:
    """
    Get the world directory name for a given game name by scanning worlds directory.
    This replicates the logic from build-world-mapping.py and exporter.py.
    """
    try:
        # Get path to worlds directory relative to this file (scripts/test-all-templates.py)
        project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
        worlds_dir = os.path.join(project_root, 'worlds')
        
        if not os.path.exists(worlds_dir):
            print(f"Warning: Worlds directory not found: {worlds_dir}")
            return game_name.lower().replace(' ', '_').replace(':', '_')
        
        # Scan each world directory
        for world_dir_name in os.listdir(worlds_dir):
            world_path = os.path.join(worlds_dir, world_dir_name)
            
            # Skip non-directories and hidden/private directories
            if not os.path.isdir(world_path) or world_dir_name.startswith('.') or world_dir_name.startswith('_'):
                continue
                
            init_file = os.path.join(world_path, '__init__.py')
            if not os.path.exists(init_file):
                continue
                
            # Extract game name from __init__.py
            try:
                with open(init_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Look for pattern: game: ClassVar[str] = "Game Name"
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*"([^"]*)"'
                match = re.search(pattern, content, re.MULTILINE)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback pattern for single quotes
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content, re.MULTILINE)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback: look for simpler pattern: game = "Game Name"
                pattern = r'game\s*=\s*"([^"]*)"'
                match = re.search(pattern, content, re.MULTILINE)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback pattern for single quotes
                pattern = r'game\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content, re.MULTILINE)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                        
            except (IOError, UnicodeDecodeError):
                continue
        
        # If no matching world found, fall back to old logic
        return game_name.lower().replace(' ', '_').replace(':', '_')
        
    except Exception as e:
        print(f"Error finding world directory for game '{game_name}': {e}")
        return game_name.lower().replace(' ', '_').replace(':', '_')


def normalize_game_name(template_name: str) -> str:
    """Convert template filename to world directory name format."""
    # Remove .yaml extension to get the game name (handle both .yaml and .yml)
    game_name = template_name
    if game_name.endswith('.yaml'):
        game_name = game_name[:-5]
    elif game_name.endswith('.yml'):
        game_name = game_name[:-4]
    # Use the same logic as the exporter to find the world directory name
    return get_world_directory_name_from_game_name(game_name)


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


def parse_multiplayer_test_results(test_results_dir: str) -> Dict:
    """Parse multiplayer test results from JSON files for both clients."""
    result = {
        'success': False,
        'client1_passed': False,
        'client2_passed': False,
        'client1_locations_checked': 0,
        'client1_manually_checkable': 0,
        'client2_locations_received': 0,
        'client2_total_locations': 0,
        'error_message': None
    }

    # Find the most recent test result files for both clients
    try:
        from pathlib import Path
        client1_files = list(Path(test_results_dir).glob('client1-timer-*.json'))
        client2_files = list(Path(test_results_dir).glob('client2-timer-*.json'))

        if not client1_files:
            result['error_message'] = "No client1 test result files found"
            return result

        # Get the most recent client1 file
        latest_client1_file = max(client1_files, key=os.path.getctime)

        # Parse Client 1 results
        with open(latest_client1_file, 'r') as f:
            data = json.load(f)

        # Parse the results
        summary = data.get('summary', {})
        result['client1_passed'] = summary.get('failedCount', 1) == 0

        # Extract locations checked from Client 1 logs
        test_details = data.get('testDetails', [])
        if test_details:
            logs = test_details[0].get('logs', [])
            locations_checked_val = 0
            manually_checkable_val = 0

            for log_entry in logs:
                message = log_entry.get('message', '')

                # Look for "Final result: X locations checked"
                if 'final result' in message.lower() and 'locations checked' in message.lower():
                    match = re.search(r'(\d+)\s+locations?\s+checked', message)
                    if match:
                        locations_checked_val = int(match.group(1))

                # Look for "Manually-checkable locations: X"
                if 'manually-checkable locations' in message.lower():
                    match = re.search(r'manually-checkable locations:\s*(\d+)', message, re.IGNORECASE)
                    if match:
                        manually_checkable_val = int(match.group(1))

            result['client1_locations_checked'] = locations_checked_val
            result['client1_manually_checkable'] = manually_checkable_val

        # Parse Client 2 results if available
        if client2_files:
            latest_client2_file = max(client2_files, key=os.path.getctime)

            with open(latest_client2_file, 'r') as f:
                data2 = json.load(f)

            # Parse Client 2 summary
            summary2 = data2.get('summary', {})
            result['client2_passed'] = summary2.get('failedCount', 1) == 0

            # Extract locations received from Client 2 logs
            test_details2 = data2.get('testDetails', [])
            if test_details2:
                logs2 = test_details2[0].get('logs', [])
                expecting_val = 0
                final_state_val = 0

                for log_entry in logs2:
                    message = log_entry.get('message', '')

                    # Look for "Expecting to receive checks for X locations"
                    if 'expecting to receive' in message.lower() and 'locations' in message.lower():
                        match = re.search(r'(\d+)\s+locations?', message)
                        if match:
                            expecting_val = int(match.group(1))

                    # Look for "Final state: X locations marked as checked"
                    if 'final state' in message.lower() and 'locations marked as checked' in message.lower():
                        match = re.search(r'(\d+)\s+locations?\s+marked', message)
                        if match:
                            final_state_val = int(match.group(1))

                result['client2_total_locations'] = expecting_val
                result['client2_locations_received'] = final_state_val

        # Test passes if:
        # - Client 1 passed (sent all manually-checkable locations)
        # - Client 2 passed (received all locations)
        # - Client 2 received all expected locations
        result['success'] = (result['client1_passed'] and
                            result['client2_passed'] and
                            result['client2_locations_received'] >= result['client2_total_locations'] and
                            result['client2_total_locations'] > 0)

    except Exception as e:
        result['error_message'] = f"Error parsing test results: {str(e)}"

    return result


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


def test_template_single_seed(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed: str = "1", export_only: bool = False, test_only: bool = False, multiplayer: bool = False, single_client: bool = False) -> Dict:
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
        
        if gen_return_code != 0:
            print(f"Generation failed with return code {gen_return_code}")
            return result
    else:
        print(f"Skipping generation for {template_name} (test-only mode)")
        result['generation'].update({
            'success': True,  # Assume success since we're skipping
            'return_code': 0,
            'processing_time_seconds': 0,
            'note': 'Skipped in test-only mode'
        })
    
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


def test_template_seed_range(template_file: str, templates_dir: str, project_root: str, world_mapping: Dict[str, Dict], seed_list: List[int], export_only: bool = False, test_only: bool = False, stop_on_failure: bool = False, multiplayer: bool = False, single_client: bool = False) -> Dict:
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
                str(seed), export_only, test_only, multiplayer, single_client
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
        help='Run post-processing scripts after testing (generate-test-chart.py and update-preset-files.py)'
    )
    parser.add_argument(
        '--multiplayer',
        action='store_true',
        help='Run multiplayer timer tests instead of spoiler tests'
    )
    parser.add_argument(
        '--single-client',
        action='store_true',
        help='Use single-client mode for multiplayer tests (only valid with --multiplayer)'
    )

    args = parser.parse_args()

    # Validate mutually exclusive options
    if args.export_only and args.test_only:
        print("Error: --export-only and --test-only are mutually exclusive")
        sys.exit(1)

    if args.single_client and not args.multiplayer:
        print("Error: --single-client can only be used with --multiplayer")
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
    
    # Handle include list vs skip list logic
    if args.include_list is not None:
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
    if args.output_file == 'scripts/output/template-test-results.json':
        # Using default path - adjust based on mode
        if args.multiplayer:
            # Use multiplayer-specific output directory and file name
            args.output_file = 'scripts/output-multiplayer/test-results-multiplayer.json'
        else:
            # Spoiler mode - check extend_sphere_log_to_all_locations setting
            host_config = read_host_yaml_config(project_root)
            extend_sphere_log = host_config.get('general_options', {}).get('extend_sphere_log_to_all_locations', True)

            if extend_sphere_log:
                args.output_file = 'scripts/output-spoiler-full/template-test-results.json'
            else:
                args.output_file = 'scripts/output-spoiler-minimal/template-test-results.json'

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
    # Only update metadata for full runs (no --include-list)
    update_metadata = args.include_list is None

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
    
    # Start timing the batch processing
    batch_start_time = time.time()
    print(f"Starting batch processing of {len(yaml_files)} templates...")
    
    # Test each template
    total_files = len(yaml_files)
    for i, yaml_file in enumerate(yaml_files, 1):
        print(f"\n[{i}/{total_files}] Processing {yaml_file}")
        
        try:
            if len(seed_list) > 1:
                # Test with seed range
                template_result = test_template_seed_range(
                    yaml_file, templates_dir, project_root, world_mapping,
                    seed_list, export_only=args.export_only, test_only=args.test_only,
                    stop_on_failure=not args.seed_range_continue_on_failure,
                    multiplayer=args.multiplayer, single_client=args.single_client
                )
            else:
                # Test with single seed
                template_result = test_template_single_seed(
                    yaml_file, templates_dir, project_root, world_mapping,
                    str(seed_list[0]), export_only=args.export_only, test_only=args.test_only,
                    multiplayer=args.multiplayer, single_client=args.single_client
                )
            
            results['results'][yaml_file] = template_result

            # Save results after each template (incremental updates)
            # Merge with existing results and save
            templates_tested_so_far = list(results['results'].keys())
            incremental_merged = merge_results(existing_results, results, templates_tested_so_far, update_metadata)
            save_results(incremental_merged, results_file)

            # Run post-processing after each test if requested
            if args.post_process:
                run_post_processing_scripts(project_root, results_file, args.multiplayer)

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
    merged_results = merge_results(existing_results, results, yaml_files, update_metadata)

    # Save merged results to main file
    save_results(merged_results, results_file)

    print(f"\n=== Testing Complete ===")
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
            if args.multiplayer:
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
            if args.multiplayer:
                # Multiplayer test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('multiplayer_test', {}).get('success', False))
                failed = len(yaml_files) - passed
                print(f"Single Seed Test Summary: {passed} passed, {failed} failed, 0 errors")
            else:
                # Spoiler test summary
                passed = sum(1 for r in results['results'].values()
                            if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
                failed = sum(1 for r in results['results'].values()
                            if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
                errors = len(yaml_files) - passed - failed
                print(f"Single Seed Test Summary: {passed} passed, {failed} failed, {errors} errors")
    
    # Run post-processing scripts if requested (only if not already run after each test)
    # This ensures post-processing runs at least once, even if no tests were run
    if args.post_process and len(yaml_files) == 0:
        run_post_processing_scripts(project_root, results_file, args.multiplayer)


if __name__ == '__main__':
    main()