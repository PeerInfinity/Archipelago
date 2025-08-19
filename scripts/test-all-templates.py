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
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


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


def test_template(template_file: str, templates_dir: str, project_root: str) -> Dict:
    """Test a single template file and return results."""
    template_name = os.path.basename(template_file)
    game_name = normalize_game_name(template_name)
    seed = "1"
    seed_id = "AP_14089154938208861744"
    
    print(f"\n=== Testing {template_name} ===")
    
    result = {
        'template_name': template_name,
        'game_name': game_name,
        'seed': seed,
        'seed_id': seed_id,
        'timestamp': datetime.now().isoformat(),
        'generation': {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None,
            'return_code': None
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
            'return_code': None
        },
        'analysis': {
            'success': False,
            'error_count': 0,
            'warning_count': 0,
            'first_error_line': None,
            'first_warning_line': None
        }
    }
    
    # Step 1: Run Generate.py
    print(f"Running Generate.py for {template_name}...")
    template_path = f"Templates/{template_name}"
    generate_cmd = [
        "python", "Generate.py", 
        "--weights_file_path", template_path,
        "--multi", "1",
        "--seed", seed
    ]
    
    gen_return_code, gen_stdout, gen_stderr = run_command(generate_cmd, cwd=project_root, timeout=600)
    
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
        'first_warning_line': gen_first_warning
    })
    
    if gen_return_code != 0:
        print(f"Generation failed with return code {gen_return_code}")
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
    
    spoiler_return_code, spoiler_stdout, spoiler_stderr = run_command(
        spoiler_cmd, cwd=project_root, timeout=900, env=spoiler_env
    )
    
    result['spoiler_test']['return_code'] = spoiler_return_code
    result['spoiler_test']['success'] = spoiler_return_code == 0
    
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
    
    args = parser.parse_args()
    
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
    yaml_files = [f for f in os.listdir(templates_dir) if f.endswith('.yaml')]
    if not yaml_files:
        print(f"Error: No YAML files found in {templates_dir}")
        sys.exit(1)
    
    yaml_files.sort()
    print(f"Found {len(yaml_files)} template files to test")
    
    # Load or create results structure
    results_file = os.path.join(project_root, args.output_file)
    results = load_existing_results(results_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(results_file), exist_ok=True)
    
    print(f"Results will be saved to: {results_file}")
    print(f"Testing templates from: {templates_dir}")
    
    # Test each template
    total_files = len(yaml_files)
    for i, yaml_file in enumerate(yaml_files, 1):
        print(f"\n[{i}/{total_files}] Processing {yaml_file}")
        
        try:
            template_result = test_template(yaml_file, templates_dir, project_root)
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
    print(f"Tested {len(yaml_files)} templates")
    print(f"Results saved to: {results_file}")
    
    # Print summary
    passed = sum(1 for r in results['results'].values() 
                if r.get('spoiler_test', {}).get('pass_fail') == 'passed')
    failed = sum(1 for r in results['results'].values() 
                if r.get('spoiler_test', {}).get('pass_fail') == 'failed')
    errors = len(yaml_files) - passed - failed
    
    print(f"Summary: {passed} passed, {failed} failed, {errors} errors")


if __name__ == '__main__':
    main()