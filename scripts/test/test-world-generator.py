#!/usr/bin/env python3
"""
World Generator Round-Trip Test Script.

This script tests the world generator by:
1. Generating seeds for original worlds
2. Converting the rules.json to _worldgen worlds using the world generator
3. Running spoiler tests on both original and _worldgen worlds
4. Cross-validating by testing _worldgen worlds with original sphere logs

Usage:
    python scripts/test/test-world-generator.py [options]
"""

import argparse
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent scripts directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.test_utils import (
    run_command,
    normalize_game_name,
    count_errors_and_warnings,
    check_http_server,
    build_and_load_world_mapping,
    extract_game_name_from_template,
    load_template_exclude_list,
)
from lib.seed_utils import get_seed_id as compute_seed_id

# Global world mapping cache - built once and reused
_world_mapping: Dict[str, Dict] = {}


def start_http_server(project_root: str) -> subprocess.Popen:
    """Start HTTP server in background and return the process."""
    process = subprocess.Popen(
        [sys.executable, '-m', 'http.server', '8000'],
        cwd=project_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    # Wait for server to start
    for _ in range(10):
        if check_http_server():
            return process
        time.sleep(0.5)
    return process


def get_world_directory_for_game(game_name: str, project_root: str) -> str:
    """
    Get the world directory name for a game using the world mapping.

    This handles edge cases where the game name declaration uses a variable
    (e.g., `game = CONSTANT`) that regex-based resolution can't handle.
    """
    global _world_mapping

    # Build the world mapping if not already cached
    if not _world_mapping:
        _world_mapping = build_and_load_world_mapping(project_root)

    # Try to find the world directory from the mapping
    if game_name in _world_mapping:
        world_dir = _world_mapping[game_name].get('world_directory')
        if world_dir:
            return world_dir

    # Fallback to regex-based resolution
    return normalize_game_name(f"{game_name}.yaml")


def get_world_directory_for_template(template_name: str, project_root: str) -> str:
    """
    Get the world directory name for a template file.

    First extracts the game name from the template, then resolves to directory.
    """
    # Extract game name from template file
    templates_dir = os.path.join(project_root, 'Players', 'Templates')
    template_path = os.path.join(templates_dir, template_name)

    game_name = None
    if os.path.exists(template_path):
        game_name = extract_game_name_from_template(template_path)

    if game_name:
        return get_world_directory_for_game(game_name, project_root)

    # Fallback to regex-based resolution from template name
    return normalize_game_name(template_name)


def get_project_root() -> str:
    """Get the project root directory."""
    return str(Path(__file__).parent.parent.parent)


def cleanup_test_worlds(project_root: str) -> List[str]:
    """Delete all *_test, *_worldgen, and *_worldgen2 world directories and return list of deleted dirs."""
    worlds_dir = os.path.join(project_root, 'worlds')
    deleted = []

    for item in os.listdir(worlds_dir):
        if item.endswith('_test') or item.endswith('_worldgen') or item.endswith('_worldgen2'):
            path = os.path.join(worlds_dir, item)
            if os.path.isdir(path):
                shutil.rmtree(path)
                deleted.append(item)
                print(f"  Deleted: worlds/{item}")

    return deleted


def cleanup_test_templates(project_root: str) -> List[str]:
    """Delete all *Test.yaml, *WorldGen.yaml, and *WorldGen2.yaml template files and return list of deleted files."""
    templates_dir = os.path.join(project_root, 'Players', 'Templates')
    deleted = []

    for item in os.listdir(templates_dir):
        if item.endswith(' Test.yaml') or item.endswith(' WorldGen.yaml') or item.endswith(' WorldGen2.yaml'):
            path = os.path.join(templates_dir, item)
            os.remove(path)
            deleted.append(item)
            print(f"  Deleted: Players/Templates/{item}")

    return deleted


def cleanup_test_presets(project_root: str) -> List[str]:
    """Delete all *_test, *_worldgen, and *_worldgen2 preset directories and return list of deleted dirs."""
    presets_dir = os.path.join(project_root, 'frontend', 'presets')
    deleted = []

    if not os.path.exists(presets_dir):
        return deleted

    for item in os.listdir(presets_dir):
        if item.endswith('_test') or item.endswith('_worldgen') or item.endswith('_worldgen2'):
            path = os.path.join(presets_dir, item)
            if os.path.isdir(path):
                shutil.rmtree(path)
                deleted.append(item)
                print(f"  Deleted: frontend/presets/{item}")

    return deleted


def generate_yaml_templates(project_root: str) -> bool:
    """Run the template generation command."""
    cmd = [
        sys.executable, '-c',
        "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"
    ]
    return_code, stdout, stderr = run_command(cmd, cwd=project_root, timeout=120)
    return return_code == 0


def get_template_list(project_root: str, skip_list: List[str] = None, include_test: bool = False) -> List[str]:
    """Get list of template files to test."""
    templates_dir = os.path.join(project_root, 'Players', 'Templates')
    skip_list = skip_list or []

    templates = []
    for item in sorted(os.listdir(templates_dir)):
        if item.endswith('.yaml') and item not in skip_list:
            # Skip _test, _worldgen, and _worldgen2 templates unless explicitly included
            if ' Test.yaml' in item or ' WorldGen.yaml' in item or ' WorldGen2.yaml' in item:
                if include_test:
                    templates.append(item)
            else:
                templates.append(item)

    return templates


def get_test_template_list(project_root: str) -> List[str]:
    """Get list of _test, _worldgen, and _worldgen2 template files."""
    templates_dir = os.path.join(project_root, 'Players', 'Templates')
    templates = []
    for item in sorted(os.listdir(templates_dir)):
        if item.endswith(' Test.yaml') or item.endswith(' WorldGen.yaml') or item.endswith(' WorldGen2.yaml'):
            templates.append(item)
    return templates


def get_original_for_test_template(test_template: str) -> str:
    """Get the original template name from a test, worldgen, or worldgen2 template name."""
    # "Game Test.yaml" -> "Game.yaml"
    # "Game WorldGen.yaml" -> "Game.yaml"
    # "Game WorldGen2.yaml" -> "Game.yaml"
    if test_template.endswith(' WorldGen2.yaml'):
        return test_template.replace(' WorldGen2.yaml', '.yaml')
    if test_template.endswith(' WorldGen.yaml'):
        return test_template.replace(' WorldGen.yaml', '.yaml')
    return test_template.replace(' Test.yaml', '.yaml')


def run_generation(
    template_name: str,
    project_root: str,
    seed: int
) -> Dict:
    """Run Generate.py for a template and return results."""
    result = {
        'success': False,
        'seed_id': None,
        'rules_path': None,
        'sphere_log_path': None,
        'preset_dir': None,
        'error': None,
        'processing_time_seconds': 0
    }

    # Compute expected seed ID
    seed_id = compute_seed_id(seed)
    result['seed_id'] = seed_id

    # Build command
    template_path = f"Templates/{template_name}"
    cmd = [
        sys.executable, 'Generate.py',
        '--weights_file_path', template_path,
        '--multi', '1',
        '--seed', str(seed)
    ]

    start_time = time.time()
    # Use SKIP_REQUIREMENTS_UPDATE to prevent interactive prompts for missing dependencies
    env = os.environ.copy()
    env['SKIP_REQUIREMENTS_UPDATE'] = '1'
    return_code, stdout, stderr = run_command(cmd, cwd=project_root, timeout=600, env=env)
    result['processing_time_seconds'] = round(time.time() - start_time, 2)

    if return_code != 0:
        result['error'] = f"Generation failed with return code {return_code}"
        # Extract error from output
        full_output = stdout + '\n' + stderr
        error_count, _, first_error, _ = count_errors_and_warnings(full_output)
        if first_error:
            result['error'] = first_error
        return result

    # Find the generated files
    game_dir = get_world_directory_for_template(template_name, project_root)
    preset_dir = os.path.join(project_root, 'frontend', 'presets', game_dir, seed_id)

    # Also check for suffixed directories (e.g., _c for canonical, _v for vanilla)
    if not os.path.exists(preset_dir):
        for suffix in ['_c', '_v', '_vc']:
            suffixed_dir = os.path.join(project_root, 'frontend', 'presets', game_dir, f'{seed_id}{suffix}')
            if os.path.exists(suffixed_dir):
                preset_dir = suffixed_dir
                break

    if os.path.exists(preset_dir):
        result['preset_dir'] = preset_dir
        rules_path = os.path.join(preset_dir, f'{seed_id}_rules.json')
        sphere_log_path = os.path.join(preset_dir, f'{seed_id}_sphere_log.jsonl')

        if os.path.exists(rules_path):
            result['rules_path'] = rules_path
        if os.path.exists(sphere_log_path):
            result['sphere_log_path'] = sphere_log_path

        result['success'] = result['rules_path'] is not None
    else:
        result['error'] = f"Preset directory not found: {preset_dir}"

    return result


def run_world_generator(
    rules_path: str,
    output_dir: str,
    game_name: str,
    project_root: str,
    canonical_seed: Optional[int] = None
) -> Dict:
    """Run the world generator to create a _worldgen world."""
    result = {
        'success': False,
        'world_dir': output_dir,
        'error': None,
        'processing_time_seconds': 0
    }

    cmd = [
        sys.executable, '-m', 'world_generator',
        rules_path,
        '--output', output_dir,
        '--game-name', game_name,
        '--force',
        '--apply-name-substitutions'
    ]

    if canonical_seed is not None:
        cmd.extend(['--canonical-seed', str(canonical_seed)])

    start_time = time.time()
    return_code, stdout, stderr = run_command(cmd, cwd=project_root, timeout=120)
    result['processing_time_seconds'] = round(time.time() - start_time, 2)

    if return_code != 0:
        full_output = stdout + '\n' + stderr
        result['error'] = f"World generator failed: {full_output[:500]}"
        return result

    # Verify the world was created
    init_file = os.path.join(output_dir, '__init__.py')
    if os.path.exists(init_file):
        result['success'] = True
    else:
        result['error'] = "World directory created but __init__.py not found"

    return result


def run_spoiler_test(
    template_name: str,
    project_root: str,
    seed: int,
    seed_id: str = None
) -> Dict:
    """Run the spoiler test for a template."""
    result = {
        'success': False,
        'pass_fail': 'unknown',
        'sphere_reached': 0,
        'total_spheres': 0,
        'error': None,
        'processing_time_seconds': 0
    }

    if seed_id is None:
        seed_id = compute_seed_id(seed)

    game_dir = get_world_directory_for_template(template_name, project_root)
    preset_dir = f"presets/{game_dir}/{seed_id}"

    # Run the spoiler test using npm test
    cmd = [
        'npm', 'test',
        f'--mode=test-spoilers',
        f'--game={preset_dir}',
        f'--seed={seed}'
    ]

    start_time = time.time()
    return_code, stdout, stderr = run_command(cmd, cwd=project_root, timeout=300)
    result['processing_time_seconds'] = round(time.time() - start_time, 2)

    full_output = stdout + '\n' + stderr

    # Parse the test results
    if 'passed' in full_output.lower() and return_code == 0:
        result['success'] = True
        result['pass_fail'] = 'pass'
    elif 'failed' in full_output.lower():
        result['pass_fail'] = 'fail'
        result['error'] = "Spoiler test failed"
    else:
        result['error'] = f"Unknown test result: return code {return_code}"

    return result


def copy_sphere_log(source_path: str, dest_path: str) -> bool:
    """Copy a sphere log file, overwriting the destination."""
    try:
        shutil.copy2(source_path, dest_path)
        return True
    except Exception as e:
        print(f"  Error copying sphere log: {e}")
        return False


def run_rules_comparison(
    original_rules_path: str,
    worldgen_rules_path: str,
    project_root: str,
    ignore_canonical: bool = False
) -> Dict:
    """
    Compare original and worldgen rules.json files.

    Uses compare_rules_json.py to detect differences between the original
    export and the worldgen re-export.
    """
    result = {
        'success': False,
        'pass_fail': 'unknown',
        'differences_count': 0,
        'ignored_count': 0,
        'error': None,
        'processing_time_seconds': 0
    }

    if not os.path.exists(original_rules_path):
        result['error'] = f"Original rules file not found: {original_rules_path}"
        return result

    if not os.path.exists(worldgen_rules_path):
        result['error'] = f"WorldGen rules file not found: {worldgen_rules_path}"
        return result

    # Build command
    cmd = [
        sys.executable, 'scripts/test/compare_rules_json.py',
        original_rules_path,
        worldgen_rules_path
    ]

    if ignore_canonical:
        cmd.insert(3, '--ignore-canonical')

    start_time = time.time()
    return_code, stdout, stderr = run_command(cmd, cwd=project_root, timeout=60)
    result['processing_time_seconds'] = round(time.time() - start_time, 2)

    full_output = stdout + '\n' + stderr

    # Parse the output
    if 'Files are identical' in full_output:
        result['success'] = True
        result['pass_fail'] = 'pass'
        result['differences_count'] = 0

        # Check for ignored differences count
        ignored_match = re.search(r'\((\d+) canonical-seed differences ignored\)', full_output)
        if ignored_match:
            result['ignored_count'] = int(ignored_match.group(1))
    elif 'Found' in full_output and 'difference' in full_output:
        result['pass_fail'] = 'fail'
        # Extract difference count
        diff_match = re.search(r'Found (\d+) difference', full_output)
        if diff_match:
            result['differences_count'] = int(diff_match.group(1))

        # Extract ignored count if present
        ignored_match = re.search(r'\((\d+) canonical-seed differences ignored\)', full_output)
        if ignored_match:
            result['ignored_count'] = int(ignored_match.group(1))

        # Get first few differences for context
        result['error'] = f"Found {result['differences_count']} differences"
    else:
        result['error'] = f"Comparison failed: {full_output[:200]}"

    return result


def process_template(
    template_name: str,
    project_root: str,
    seed: int,
    results: Dict,
    skip_generation: bool = False,
    skip_spoiler_test: bool = False,
    canonical_seed: Optional[int] = None
) -> Dict:
    """
    Test a single template through the full round-trip process.

    Returns a result dict for this template.
    """
    game_dir = get_world_directory_for_template(template_name, project_root)
    game_name_display = template_name.replace('.yaml', '')

    print(f"\n{'='*60}")
    print(f"Testing: {game_name_display}")
    print('='*60)

    template_result = {
        'template': template_name,
        'game_name': game_name_display,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'original': {
            'generation': {'success': False},
            'spoiler_test': {'success': False, 'pass_fail': 'unknown'}
        },
        'test_world': {
            'world_generation': {'success': False},
            'seed_generation': {'success': False},
            'rules_comparison': {'success': False, 'pass_fail': 'unknown'},
            'spoiler_test': {'success': False, 'pass_fail': 'unknown'},
            'cross_validation': {'success': False, 'pass_fail': 'unknown'}
        },
        'errors': {
            'generation': [],
            'testing': []
        }
    }

    # Step 1: Generate original seed
    print(f"\n[1/7] Generating original seed...")
    if not skip_generation:
        gen_result = run_generation(template_name, project_root, seed)
        template_result['original']['generation'] = gen_result

        if not gen_result['success']:
            template_result['errors']['generation'].append(f"Original generation failed: {gen_result.get('error', 'Unknown error')}")
            print(f"  FAILED: {gen_result.get('error', 'Unknown error')}")
            return template_result

        print(f"  OK (seed_id: {gen_result['seed_id']})")
    else:
        print("  Skipped (--skip-generation)")
        template_result['original']['generation']['success'] = True
        template_result['original']['generation']['note'] = 'Skipped'

    # Step 2: Run spoiler test on original
    print(f"\n[2/7] Running spoiler test on original...")
    if not skip_spoiler_test:
        spoiler_result = run_spoiler_test(template_name, project_root, seed)
        template_result['original']['spoiler_test'] = spoiler_result

        if spoiler_result['pass_fail'] == 'pass':
            print(f"  PASS")
        else:
            print(f"  FAIL: {spoiler_result.get('error', 'Unknown error')}")
            template_result['errors']['generation'].append(f"Original spoiler test failed: {spoiler_result.get('error', '')}")
    else:
        print("  Skipped (--skip-spoiler-test)")
        template_result['original']['spoiler_test']['note'] = 'Skipped'

    # Step 3: Generate _worldgen world from rules.json
    print(f"\n[3/7] Generating _worldgen world from rules.json...")
    rules_path = template_result['original']['generation'].get('rules_path')

    if not rules_path or not os.path.exists(rules_path):
        # Try to find it
        seed_id = compute_seed_id(seed)
        rules_path = os.path.join(
            project_root, 'frontend', 'presets', game_dir,
            seed_id, f'{seed_id}_rules.json'
        )

    if not os.path.exists(rules_path):
        template_result['errors']['generation'].append(f"Rules file not found: {rules_path}")
        print(f"  FAILED: Rules file not found")
        return template_result

    test_world_dir = os.path.join(project_root, 'worlds', f'{game_dir}_worldgen')
    test_game_name = f"{game_name_display} WorldGen"

    world_gen_result = run_world_generator(
        rules_path, test_world_dir, test_game_name, project_root,
        canonical_seed=canonical_seed
    )
    template_result['test_world']['world_generation'] = world_gen_result

    if not world_gen_result['success']:
        template_result['errors']['generation'].append(f"World generation failed: {world_gen_result.get('error', 'Unknown error')}")
        print(f"  FAILED: {world_gen_result.get('error', 'Unknown error')}")
        return template_result

    print(f"  OK (created worlds/{game_dir}_worldgen/)")

    # Store info for later cleanup and testing
    template_result['test_world']['world_dir'] = test_world_dir
    template_result['test_world']['test_game_name'] = test_game_name
    template_result['test_world']['test_template_name'] = f"{game_name_display} WorldGen.yaml"

    return template_result


def run_test_world_tests(
    template_results: Dict[str, Dict],
    project_root: str,
    seed: int,
    skip_spoiler_test: bool = False,
    canonical_seed: Optional[int] = None
) -> None:
    """
    Run generation and spoiler tests on all _worldgen worlds.

    This is called after all _worldgen worlds have been created and
    templates have been regenerated.
    """
    for game_name, result in template_results.items():
        if not result['test_world']['world_generation'].get('success'):
            continue

        test_template_name = result['test_world'].get('test_template_name')
        test_game_name = result['test_world'].get('test_game_name')
        original_game_name = result['game_name']

        if not test_template_name:
            continue

        print(f"\n{'='*60}")
        print(f"Testing _worldgen world: {test_game_name}")
        print('='*60)

        # Step 4: Generate seed for _worldgen world
        print(f"\n[4/7] Generating seed for _worldgen world...")
        gen_result = run_generation(test_template_name, project_root, seed)
        result['test_world']['seed_generation'] = gen_result

        if not gen_result['success']:
            result['errors']['testing'].append(f"Test world generation failed: {gen_result.get('error', 'Unknown error')}")
            print(f"  FAILED: {gen_result.get('error', 'Unknown error')}")
            continue

        print(f"  OK (seed_id: {gen_result['seed_id']})")

        # Step 5: Compare rules.json files
        print(f"\n[5/7] Comparing rules.json files...")
        seed_id = compute_seed_id(seed)
        original_game_dir = get_world_directory_for_game(original_game_name, project_root)

        original_rules_path = os.path.join(
            project_root, 'frontend', 'presets', original_game_dir,
            seed_id, f'{seed_id}_rules.json'
        )
        # Use the actual rules path from seed generation (accounts for _c/_v suffixes)
        worldgen_rules_path = gen_result.get('rules_path', '')
        if not worldgen_rules_path:
            test_game_dir = get_world_directory_for_template(test_template_name, project_root)
            worldgen_rules_path = os.path.join(
                project_root, 'frontend', 'presets', test_game_dir,
                seed_id, f'{seed_id}_rules.json'
            )

        comparison_result = run_rules_comparison(
            original_rules_path, worldgen_rules_path, project_root,
            ignore_canonical=canonical_seed is not None
        )
        result['test_world']['rules_comparison'] = comparison_result

        if comparison_result['pass_fail'] == 'pass':
            ignored_msg = f" ({comparison_result['ignored_count']} ignored)" if comparison_result['ignored_count'] > 0 else ""
            print(f"  PASS - Files are identical{ignored_msg}")
        else:
            print(f"  FAIL: {comparison_result.get('error', 'Unknown error')}")
            result['errors']['testing'].append(f"Rules comparison failed: {comparison_result.get('error', '')}")

        # Step 6: Run spoiler test on _worldgen world
        print(f"\n[6/7] Running spoiler test on _worldgen world...")
        if not skip_spoiler_test:
            spoiler_result = run_spoiler_test(test_template_name, project_root, seed)
            result['test_world']['spoiler_test'] = spoiler_result

            if spoiler_result['pass_fail'] == 'pass':
                print(f"  PASS")
            else:
                print(f"  FAIL: {spoiler_result.get('error', 'Unknown error')}")
                result['errors']['testing'].append(f"Test world spoiler test failed: {spoiler_result.get('error', '')}")
        else:
            print("  Skipped (--skip-spoiler-test)")
            result['test_world']['spoiler_test']['note'] = 'Skipped'

        # Step 6: Cross-validation - test with original sphere log
        print(f"\n[7/7] Cross-validation with original sphere log...")
        if not skip_spoiler_test:
            # Get paths
            seed_id = compute_seed_id(seed)
            original_game_dir = get_world_directory_for_game(original_game_name, project_root)

            original_sphere_log = os.path.join(
                project_root, 'frontend', 'presets', original_game_dir,
                seed_id, f'{seed_id}_sphere_log.jsonl'
            )
            # Use the actual sphere log path from seed generation (accounts for _c/_v suffixes)
            test_sphere_log = gen_result.get('sphere_log_path', '')
            if not test_sphere_log:
                test_game_dir = get_world_directory_for_template(test_template_name, project_root)
                test_sphere_log = os.path.join(
                    project_root, 'frontend', 'presets', test_game_dir,
                    seed_id, f'{seed_id}_sphere_log.jsonl'
                )

            if os.path.exists(original_sphere_log) and os.path.exists(os.path.dirname(test_sphere_log)):
                # Backup test sphere log
                test_sphere_log_backup = test_sphere_log + '.backup'
                if os.path.exists(test_sphere_log):
                    shutil.copy2(test_sphere_log, test_sphere_log_backup)

                # Copy original sphere log to test location
                if copy_sphere_log(original_sphere_log, test_sphere_log):
                    # Run spoiler test with original sphere log
                    cross_result = run_spoiler_test(test_template_name, project_root, seed)
                    result['test_world']['cross_validation'] = cross_result

                    if cross_result['pass_fail'] == 'pass':
                        print(f"  PASS - Original sphere log validates against _worldgen world")
                    else:
                        print(f"  FAIL - Original sphere log does not validate")
                        result['errors']['testing'].append("Cross-validation failed: original sphere log incompatible with _worldgen world")

                    # Restore test sphere log
                    if os.path.exists(test_sphere_log_backup):
                        shutil.move(test_sphere_log_backup, test_sphere_log)
                else:
                    result['test_world']['cross_validation']['error'] = "Failed to copy sphere log"
                    print(f"  FAILED: Could not copy sphere log")
            else:
                result['test_world']['cross_validation']['error'] = "Sphere log files not found"
                print(f"  SKIPPED: Sphere log files not found")
        else:
            print("  Skipped (--skip-spoiler-test)")
            result['test_world']['cross_validation']['note'] = 'Skipped'


def save_results(results: Dict, output_file: str) -> None:
    """Save results to JSON file."""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {output_file}")


def load_phase1_results(phase1_results_path: str) -> Optional[Dict]:
    """Load phase 1 results from JSON file."""
    if not phase1_results_path or not os.path.exists(phase1_results_path):
        return None

    try:
        with open(phase1_results_path, 'r') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError) as e:
        print(f"Warning: Could not load phase 1 results from {phase1_results_path}: {e}")
        return None


def check_phase1_success(phase1_results: Optional[Dict], game_name: str) -> Tuple[bool, Optional[str]]:
    """
    Check if a template succeeded in phase 1.

    Returns:
        (success, error_message) - True if phase 1 succeeded or no phase 1 results,
                                   False with error message if phase 1 failed
    """
    if phase1_results is None:
        return True, None

    results = phase1_results.get('results', {})
    if game_name not in results:
        # Template not in phase 1 results - this could mean it was skipped
        return True, None

    template_result = results[game_name]

    # Check original generation
    original_gen = template_result.get('original', {}).get('generation', {})
    if not original_gen.get('success', False):
        error = original_gen.get('error', 'Unknown error')
        return False, f"Phase 1 original generation failed: {error}"

    # Check test world generation
    test_world_gen = template_result.get('test_world', {}).get('world_generation', {})
    if not test_world_gen.get('success', False):
        error = test_world_gen.get('error', 'Unknown error')
        return False, f"Phase 1 test world generation failed: {error}"

    return True, None


def main():
    # Load default exclude list for worldgen tests (includes main + worldgen exclusions)
    default_exclude_list = load_template_exclude_list(test_type='all')

    parser = argparse.ArgumentParser(
        description='Test world generator with round-trip validation'
    )
    parser.add_argument(
        '--seed', type=int, default=1,
        help='Seed number to use (default: 1)'
    )
    parser.add_argument(
        '--output-file', type=str,
        default='scripts/output/world-generator/test-results.json',
        help='Output file for test results'
    )
    parser.add_argument(
        '--skip-list', type=str, nargs='*', default=default_exclude_list,
        help=f'Templates to skip (default: {" ".join(default_exclude_list)})'
    )
    parser.add_argument(
        '--include-list', type=str, nargs='*',
        help='Only test these templates (overrides skip-list)'
    )
    parser.add_argument(
        '--every-nth', type=int, default=1,
        help='Process every Nth template (for parallelization)'
    )
    parser.add_argument(
        '--skip-first', type=int, default=0,
        help='Skip first N templates (for parallelization)'
    )
    parser.add_argument(
        '--skip-cleanup', action='store_true',
        help='Skip cleanup of _worldgen worlds after testing'
    )
    parser.add_argument(
        '--skip-generation', action='store_true',
        help='Skip seed generation (use existing presets)'
    )
    parser.add_argument(
        '--skip-spoiler-test', action='store_true',
        help='Skip spoiler tests'
    )
    parser.add_argument(
        '--phase', type=str, choices=['setup', 'generate-original', 'generate-test-worlds', 'regenerate-templates', 'test', 'cleanup', 'all'],
        default='all',
        help='Run only a specific phase'
    )
    parser.add_argument(
        '--no-backup', action='store_true',
        help='Do not create backup of existing results file'
    )
    parser.add_argument(
        '--phase1-results', type=str,
        help='Path to phase 1 results JSON file (for test phase to skip failed templates)'
    )
    parser.add_argument(
        '-v', '--verbose', action='store_true',
        help='Verbose output'
    )
    parser.add_argument(
        '--canonical-seed', type=int, nargs='?', const=1, default=None, metavar='N',
        help='Enable canonical placement for seed N (default: 1 if flag provided). Places items in original locations when seed matches.'
    )

    args = parser.parse_args()
    project_root = get_project_root()

    print("="*60)
    print("World Generator Round-Trip Test")
    print("="*60)
    print(f"Project root: {project_root}")
    print(f"Seed: {args.seed}")
    print(f"Output file: {args.output_file}")
    print(f"Phase: {args.phase}")
    if args.canonical_seed is not None:
        print(f"Canonical seed: {args.canonical_seed}")

    # Initialize results - use dict keyed by game name for compatibility with combine-test-results.py
    results = {
        'metadata': {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'seed': args.seed,
            'phase': args.phase,
            'canonical_seed': args.canonical_seed,
            'total_templates': 0,
            'successful_generations': 0,
            'failed_generations': 0,
            'successful_test_worlds': 0,
            'failed_test_worlds': 0,
            'rules_comparison_passed': 0,
            'rules_comparison_failed': 0,
            'cross_validation_passed': 0,
            'cross_validation_failed': 0
        },
        'results': {}
    }

    # Phase: Setup
    if args.phase in ['setup', 'all']:
        print("\n" + "="*60)
        print("PHASE: Setup - Cleaning existing test artifacts")
        print("="*60)

        print("\nDeleting _worldgen worlds...")
        cleanup_test_worlds(project_root)

        print("\nDeleting _test templates...")
        cleanup_test_templates(project_root)

        print("\nDeleting _test presets...")
        cleanup_test_presets(project_root)

        print("\nClearing and regenerating templates...")
        # Clear templates directory
        templates_dir = os.path.join(project_root, 'Players', 'Templates')
        for item in os.listdir(templates_dir):
            if item.endswith('.yaml'):
                os.remove(os.path.join(templates_dir, item))

        # Regenerate templates
        if not generate_yaml_templates(project_root):
            print("ERROR: Failed to generate templates")
            return 1

        print("Setup complete.")

    # Get template list
    templates = get_template_list(project_root, args.skip_list)

    if args.include_list:
        templates = [t for t in templates if t in args.include_list or t.replace('.yaml', '') in args.include_list]

    # Apply parallelization filters
    if args.skip_first > 0:
        templates = templates[args.skip_first:]
    if args.every_nth > 1:
        templates = templates[::args.every_nth]

    results['metadata']['total_templates'] = len(templates)
    print(f"\nTemplates to test: {len(templates)}")

    # Phase: Generate original seeds and create test worlds
    if args.phase in ['generate-original', 'generate-test-worlds', 'all']:
        print("\n" + "="*60)
        print("PHASE: Generate original seeds and create test worlds")
        print("="*60)

        for template in templates:
            template_result = process_template(
                template, project_root, args.seed, results,
                skip_generation=args.skip_generation,
                skip_spoiler_test=True,  # We'll do spoiler tests in the test phase
                canonical_seed=args.canonical_seed
            )
            # Use game_name as key for dictionary structure
            game_name = template_result.get('game_name', template.replace('.yaml', ''))
            results['results'][game_name] = template_result

            if template_result['original']['generation'].get('success'):
                results['metadata']['successful_generations'] += 1
            else:
                results['metadata']['failed_generations'] += 1

            if template_result['test_world']['world_generation'].get('success'):
                results['metadata']['successful_test_worlds'] += 1
            else:
                results['metadata']['failed_test_worlds'] += 1

    # Phase: Regenerate templates (to include _worldgen worlds)
    if args.phase in ['regenerate-templates', 'all']:
        print("\n" + "="*60)
        print("PHASE: Regenerating templates to include _worldgen worlds")
        print("="*60)

        if not generate_yaml_templates(project_root):
            print("ERROR: Failed to regenerate templates")
            return 1

        print("Templates regenerated.")

        # Clear and rebuild the world mapping cache so it includes the newly created worldgen worlds
        global _world_mapping
        _world_mapping = {}
        print("Rebuilding world mapping to include _worldgen worlds...")
        _world_mapping = build_and_load_world_mapping(project_root)

    # Phase: Run spoiler tests
    http_server_process = None
    if args.phase in ['test', 'all']:
        print("\n" + "="*60)
        print("PHASE: Running spoiler tests")
        print("="*60)

        # Start HTTP server if not running
        if not check_http_server():
            print("Starting HTTP server...")
            http_server_process = start_http_server(project_root)
            if check_http_server():
                print("  HTTP server started on port 8000")
            else:
                print("  WARNING: Failed to start HTTP server, spoiler tests may fail")

        # If we're running test phase standalone (parallel execution),
        # discover test templates from filesystem
        if args.phase == 'test' and not results['results']:
            print("\nDiscovering test templates from filesystem...")
            test_templates = get_test_template_list(project_root)

            # Filter by include list if specified
            if args.include_list:
                test_templates = [t for t in test_templates if t in args.include_list or t.replace('.yaml', '') in args.include_list]

            # Apply parallelization filters to test templates
            if args.skip_first > 0:
                test_templates = test_templates[args.skip_first:]
            if args.every_nth > 1:
                test_templates = test_templates[::args.every_nth]

            print(f"Found {len(test_templates)} test templates to process")

            # Load phase 1 results if provided
            phase1_results = None
            if args.phase1_results:
                print(f"\nLoading phase 1 results from: {args.phase1_results}")
                phase1_results = load_phase1_results(args.phase1_results)
                if phase1_results:
                    print(f"  Loaded results for {len(phase1_results.get('results', {}))} templates")
                else:
                    print("  Warning: Could not load phase 1 results")

            for test_template in test_templates:
                original_template = get_original_for_test_template(test_template)
                game_name_display = original_template.replace('.yaml', '')
                test_game_name = test_template.replace('.yaml', '')

                print(f"\n{'='*60}")
                print(f"Testing: {test_game_name}")
                print('='*60)

                template_result = {
                    'template': original_template,
                    'game_name': game_name_display,
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'original': {
                        'generation': {'success': True, 'note': 'Phase 1'},
                        'spoiler_test': {'success': False, 'pass_fail': 'unknown'}
                    },
                    'test_world': {
                        'world_generation': {'success': True, 'note': 'Phase 1'},
                        'seed_generation': {'success': False},
                        'spoiler_test': {'success': False, 'pass_fail': 'unknown'},
                        'cross_validation': {'success': False, 'pass_fail': 'unknown'},
                        'test_template_name': test_template,
                        'test_game_name': test_game_name
                    },
                    'errors': {
                        'generation': [],
                        'testing': []
                    }
                }

                # Check if phase 1 succeeded for this template
                phase1_success, phase1_error = check_phase1_success(phase1_results, game_name_display)
                if not phase1_success:
                    print(f"  SKIPPED: {phase1_error}")
                    template_result['errors']['testing'].append(f"Skipped because phase 1 failed: {phase1_error}")
                    template_result['original']['generation']['success'] = False
                    template_result['original']['generation']['note'] = 'Failed in Phase 1'
                    template_result['test_world']['world_generation']['success'] = False
                    template_result['test_world']['world_generation']['note'] = 'Failed in Phase 1'
                    template_result['test_world']['seed_generation']['note'] = 'Skipped - Phase 1 failed'
                    template_result['test_world']['spoiler_test']['note'] = 'Skipped - Phase 1 failed'
                    template_result['test_world']['cross_validation']['note'] = 'Skipped - Phase 1 failed'
                    results['results'][game_name_display] = template_result
                    continue

                # Run original spoiler test first
                print(f"\n[1/4] Running spoiler test on original ({original_template})...")
                if not args.skip_spoiler_test:
                    spoiler_result = run_spoiler_test(original_template, project_root, args.seed)
                    template_result['original']['spoiler_test'] = spoiler_result
                    print(f"  Result: {spoiler_result['pass_fail']}")
                else:
                    template_result['original']['spoiler_test']['note'] = 'Skipped'

                # Generate seed for test world
                print(f"\n[2/4] Generating seed for _worldgen world...")
                gen_result = run_generation(test_template, project_root, args.seed)
                template_result['test_world']['seed_generation'] = gen_result

                if gen_result['success']:
                    print(f"  OK (seed_id: {gen_result['seed_id']})")

                    # Run spoiler test on test world
                    print(f"\n[3/4] Running spoiler test on _worldgen world...")
                    if not args.skip_spoiler_test:
                        spoiler_result = run_spoiler_test(test_template, project_root, args.seed)
                        template_result['test_world']['spoiler_test'] = spoiler_result
                        print(f"  Result: {spoiler_result['pass_fail']}")
                    else:
                        template_result['test_world']['spoiler_test']['note'] = 'Skipped'

                    # Cross-validation
                    print(f"\n[4/4] Cross-validation with original sphere log...")
                    if not args.skip_spoiler_test:
                        seed_id = compute_seed_id(args.seed)
                        original_game_dir = get_world_directory_for_template(original_template, project_root)
                        test_game_dir = get_world_directory_for_template(test_template, project_root)

                        original_sphere_log = os.path.join(
                            project_root, 'frontend', 'presets', original_game_dir,
                            seed_id, f'{seed_id}_sphere_log.jsonl'
                        )
                        test_sphere_log = os.path.join(
                            project_root, 'frontend', 'presets', test_game_dir,
                            seed_id, f'{seed_id}_sphere_log.jsonl'
                        )

                        if os.path.exists(original_sphere_log) and os.path.exists(os.path.dirname(test_sphere_log)):
                            test_sphere_log_backup = test_sphere_log + '.backup'
                            if os.path.exists(test_sphere_log):
                                shutil.copy2(test_sphere_log, test_sphere_log_backup)

                            if copy_sphere_log(original_sphere_log, test_sphere_log):
                                cross_result = run_spoiler_test(test_template, project_root, args.seed)
                                template_result['test_world']['cross_validation'] = cross_result

                                if cross_result['pass_fail'] == 'pass':
                                    print(f"  PASS - Original sphere log validates against _worldgen world")
                                else:
                                    print(f"  FAIL - Original sphere log does not validate")
                                    template_result['errors']['testing'].append("Cross-validation failed")

                                if os.path.exists(test_sphere_log_backup):
                                    shutil.move(test_sphere_log_backup, test_sphere_log)
                            else:
                                template_result['test_world']['cross_validation']['error'] = "Failed to copy sphere log"
                        else:
                            template_result['test_world']['cross_validation']['error'] = "Sphere log files not found"
                            print(f"  SKIPPED: Sphere log files not found")
                    else:
                        template_result['test_world']['cross_validation']['note'] = 'Skipped'
                else:
                    print(f"  FAILED: {gen_result.get('error', 'Unknown error')}")
                    template_result['errors']['testing'].append(f"Test world seed generation failed: {gen_result.get('error', '')}")

                # Use game_name as key for dictionary structure
                results['results'][game_name_display] = template_result

            results['metadata']['total_templates'] = len(test_templates)

        else:
            # Original flow for 'all' phase or when we have results from previous phases
            # Run spoiler tests on original worlds
            for game_name, result in results['results'].items():
                if result['original']['generation'].get('success'):
                    template_name = result['template']
                    print(f"\nTesting original: {template_name}")

                    if not args.skip_spoiler_test:
                        spoiler_result = run_spoiler_test(template_name, project_root, args.seed)
                        result['original']['spoiler_test'] = spoiler_result
                        print(f"  Result: {spoiler_result['pass_fail']}")

            # Run tests on _worldgen worlds
            run_test_world_tests(
                results['results'], project_root, args.seed,
                skip_spoiler_test=args.skip_spoiler_test,
                canonical_seed=args.canonical_seed
            )

        # Update rules comparison and cross-validation counts
        for game_name, result in results['results'].items():
            if result['test_world']['rules_comparison'].get('pass_fail') == 'pass':
                results['metadata']['rules_comparison_passed'] += 1
            elif result['test_world']['rules_comparison'].get('pass_fail') == 'fail':
                results['metadata']['rules_comparison_failed'] += 1

            if result['test_world']['cross_validation'].get('pass_fail') == 'pass':
                results['metadata']['cross_validation_passed'] += 1
            elif result['test_world']['cross_validation'].get('pass_fail') == 'fail':
                results['metadata']['cross_validation_failed'] += 1

        # Stop HTTP server if we started it
        if http_server_process:
            print("\nStopping HTTP server...")
            http_server_process.terminate()
            http_server_process.wait()

    # Phase: Cleanup
    if args.phase in ['cleanup', 'all'] and not args.skip_cleanup:
        print("\n" + "="*60)
        print("PHASE: Cleanup")
        print("="*60)

        print("\nDeleting _worldgen worlds...")
        cleanup_test_worlds(project_root)

        print("\nDeleting _test templates...")
        cleanup_test_templates(project_root)

        print("\nDeleting _test presets...")
        cleanup_test_presets(project_root)

        print("\nRegenerating clean templates...")
        generate_yaml_templates(project_root)

        print("Cleanup complete.")

    # Save results
    save_results(results, os.path.join(project_root, args.output_file))

    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total templates: {results['metadata']['total_templates']}")
    print(f"Successful generations: {results['metadata']['successful_generations']}")
    print(f"Failed generations: {results['metadata']['failed_generations']}")
    print(f"Successful test worlds: {results['metadata']['successful_test_worlds']}")
    print(f"Failed test worlds: {results['metadata']['failed_test_worlds']}")
    print(f"Rules comparison passed: {results['metadata']['rules_comparison_passed']}")
    print(f"Rules comparison failed: {results['metadata']['rules_comparison_failed']}")
    print(f"Cross-validation passed: {results['metadata']['cross_validation_passed']}")
    print(f"Cross-validation failed: {results['metadata']['cross_validation_failed']}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
