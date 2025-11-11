#!/usr/bin/env python3
"""
Utility functions for test automation scripts.

This module provides common utility functions used across testing scripts including:
- Configuration file handling
- Virtual environment and HTTP server checking
- World/game name mapping and normalization
- Error/warning parsing
- Command execution
- Test result parsing (multiplayer and spoiler tests)
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple


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


def get_world_directory_name_from_game_name(game_name: str) -> str:
    """
    Get the world directory name for a given game name by scanning worlds directory.
    This replicates the logic from build-world-mapping.py and exporter.py.
    """
    try:
        # Get path to worlds directory relative to this file (scripts/lib/test_utils.py)
        project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
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


def classify_generation_error(output: str) -> Optional[str]:
    """
    Classify the type of generation error from the output.

    Returns:
        String indicating error type, or None if no recognized error
    """
    if 'Fill.FillError' in output:
        return 'FillError'
    elif 'OptionsError' in output:
        return 'OptionsError'
    elif 'KeyError' in output:
        return 'KeyError'
    elif 'ValueError' in output:
        return 'ValueError'
    elif 'AttributeError' in output:
        return 'AttributeError'
    elif 'ImportError' in output or 'ModuleNotFoundError' in output:
        return 'ImportError'
    elif 'FileNotFoundError' in output:
        return 'FileNotFoundError'
    elif 'PermissionError' in output:
        return 'PermissionError'
    elif 'TimeoutExpired' in output or 'Command timed out' in output:
        return 'Timeout'
    return None


def run_command(cmd: List[str], cwd: str = None, timeout: int = 300, env: Dict = None) -> Tuple[int, str, str]:
    """
    Run a command and return (return_code, stdout, stderr).
    Closes stdin to prevent the subprocess from waiting for user input.
    """
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            env=env,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return -1, "", "Command timed out"
    except Exception as e:
        return -1, "", str(e)


def count_total_spheres(spheres_log_path: str, player_num: int = None) -> float:
    """
    Get the highest sphere_index from spheres_log.jsonl file.
    Returns the sphere_index value from the last line in the file.

    Args:
        spheres_log_path: Path to the spheres_log.jsonl file
        player_num: Optional player number for multiworld games. If specified,
                   only counts spheres where the player had activity (new items,
                   locations, or regions)

    Returns:
        The highest sphere index found
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

                        # If player_num is specified, check if this player had activity in this sphere
                        if player_num is not None:
                            player_data = sphere_data.get('player_data', {})
                            player_key = str(player_num)

                            if player_key in player_data:
                                player_info = player_data[player_key]
                                # Check if player had any activity (new items, locations, or regions)
                                has_activity = (
                                    player_info.get('new_inventory_details', {}).get('base_items', {}) or
                                    player_info.get('new_accessible_locations', []) or
                                    player_info.get('new_accessible_regions', []) or
                                    player_info.get('sphere_locations', [])
                                )

                                if has_activity:
                                    # Convert to float to handle values like "1.1", "2.3", etc.
                                    if isinstance(sphere_index, str):
                                        last_sphere = float(sphere_index)
                                    else:
                                        last_sphere = float(sphere_index)
                        else:
                            # No player filter - just get the highest sphere
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
