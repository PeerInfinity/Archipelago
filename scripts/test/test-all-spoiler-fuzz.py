#!/usr/bin/env python3
"""
Batch Spoiler Fuzz Test Runner

Generates random YAML configurations using the fuzzer and runs frontend spoiler
tests on them. This combines the fuzzer's random option generation with the
frontend's spoiler playthrough testing.

This script:
1. Iterates through games (based on template files)
2. Generates random YAML configurations for each game
3. Runs Generate.py to create seed files
4. Runs frontend spoiler tests via Playwright
5. Collects results into scripts/output/spoiler-fuzz/test-results.json

Usage:
    # Test all games with 10 random configurations each
    python scripts/test/test-all-spoiler-fuzz.py --runs 10

    # Test specific game
    python scripts/test/test-all-spoiler-fuzz.py --runs 10 --include-list Adventure.yaml

    # Split for parallel execution (10 splits)
    python scripts/test/test-all-spoiler-fuzz.py --runs 10 --every-nth 10 --skip-first 0
"""

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent scripts directory to path to import from lib
sys.path.insert(0, str(Path(__file__).parent.parent))

# Add project root to path for fuzz.py imports
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from lib.test_utils import (
    extract_game_name_from_template,
    load_template_exclude_list,
    get_world_directory_name_from_game_name,
    build_and_load_world_mapping,
    check_http_server
)
from lib.seed_utils import get_seed_id as compute_seed_id

# Import fuzzer's YAML generation function
from fuzz import generate_random_yaml, world_from_apworld_name

# Per-game fuzzer options configuration file
GAME_OPTIONS_FILE = PROJECT_ROOT / "scripts" / "data" / "ut-fuzz-game-options.json"

# Cache for game-specific fuzzer options
_game_fuzzer_options: Optional[Dict] = None


def load_game_fuzzer_options() -> Dict:
    """
    Load per-game fuzzer options from configuration file.

    Returns a dict mapping template names to their fuzzer option overrides.
    """
    global _game_fuzzer_options

    if _game_fuzzer_options is not None:
        return _game_fuzzer_options

    _game_fuzzer_options = {}

    if GAME_OPTIONS_FILE.exists():
        try:
            with open(GAME_OPTIONS_FILE, 'r') as f:
                data = json.load(f)
            _game_fuzzer_options = data.get('game_options', {})
            if _game_fuzzer_options:
                print(f"Loaded fuzzer options for {len(_game_fuzzer_options)} games from {GAME_OPTIONS_FILE.name}")
        except Exception as e:
            print(f"Warning: Error loading game fuzzer options: {e}")

    return _game_fuzzer_options


def get_game_fuzzer_options(template_name: str) -> Dict[str, Optional[str]]:
    """
    Get fuzzer options for a specific game.

    Args:
        template_name: The template filename (e.g., 'Subnautica.yaml')

    Returns:
        Dict with 'default_options', 'disallow_options', and 'max_item_dict_value' keys (values may be None)
    """
    game_options = load_game_fuzzer_options()
    config = game_options.get(template_name, {})

    return {
        'default_options': config.get('default_options'),
        'disallow_options': config.get('disallow_options'),
        'max_item_dict_value': config.get('max_item_dict_value')
    }


def get_template_files(templates_dir: Path, skip_list: List[str], include_list: Optional[List[str]] = None) -> List[Path]:
    """Get list of template files to test."""
    yaml_files = sorted(templates_dir.glob("*.yaml"))

    if include_list:
        # Filter to only included files
        yaml_files = [f for f in yaml_files if f.name in include_list]
    else:
        # Filter out skipped files
        yaml_files = [f for f in yaml_files if f.name not in skip_list]

    # Filter out WorldGen templates - they are regenerated versions
    # of original games and should behave identically
    yaml_files = [f for f in yaml_files if 'WorldGen' not in f.name]

    return yaml_files


def is_option_error(output: str) -> bool:
    """
    Check if the generation output indicates an OptionError or FillError.

    These are expected failures when random option combinations are invalid
    or result in impossible games, and should be counted as "ignored" rather
    than "failure" (same as UT fuzzer).
    """
    # Check for explicit OptionError or FillError in traceback
    if "OptionError" in output:
        return True

    # FillError occurs when the randomized options result in an impossible game
    # (e.g., required locations can't be accessed due to boss ordering constraints)
    if "FillError" in output:
        return True

    # Check for common option validation error patterns
    # These are raised as Exception but are logically option errors
    option_error_patterns = [
        "Invalid .* settings",  # e.g., "Invalid OC2 settings"
        "invalid option",
        "incompatible option",
        "requires .* to be",
        "cannot be used with",
        "must have .* enabled",
        "needs at least .* levels",  # Overcooked! 2 level count error
        "Not enough filler/trap items",  # FFMQ: brown_boxes!=include with 0 excludable items
    ]

    import re
    for pattern in option_error_patterns:
        if re.search(pattern, output, re.IGNORECASE):
            return True

    return False


def run_generation(yaml_path: str, seed: int, project_root: Path, timeout: int = 300) -> Tuple[bool, str, Optional[str]]:
    """
    Run Generate.py for a YAML file.

    Returns:
        Tuple of (success, output, seed_id)
    """
    seed_id = compute_seed_id(seed)

    cmd = [
        sys.executable, str(project_root / "Generate.py"),
        "--weights_file_path", yaml_path,
        "--multi", "1",
        "--seed", str(seed)
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(project_root)
        )

        output = result.stdout + result.stderr
        success = result.returncode == 0

        return success, output, seed_id

    except subprocess.TimeoutExpired:
        return False, f"Generation timed out after {timeout}s", seed_id
    except Exception as e:
        return False, str(e), seed_id


def run_spoiler_test(game_name: str, seed: int, project_root: Path, headed: bool = False, timeout: int = 120) -> Tuple[bool, Dict]:
    """
    Run the frontend spoiler test for a game/seed.

    Returns:
        Tuple of (success, result_dict)
    """
    # Build npm test command
    cmd = [
        "npm", "test", "--",
        f"--mode=test-spoilers",
        f"--game={game_name}",
        f"--seed={seed}"
    ]

    if headed:
        cmd.append("--headed")

    result_dict = {
        "success": False,
        "sphere_reached": 0,
        "total_spheres": 0,
        "error": None,
        "output": ""
    }

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(project_root)
        )

        result_dict["output"] = result.stdout + result.stderr
        result_dict["success"] = result.returncode == 0

        # Try to parse sphere info from output
        output = result_dict["output"]
        if "Sphere" in output:
            # Look for patterns like "Sphere 5/10" or "sphere_reached: 5"
            import re
            sphere_match = re.search(r'Sphere\s+(\d+)\s*/\s*(\d+)', output)
            if sphere_match:
                result_dict["sphere_reached"] = int(sphere_match.group(1))
                result_dict["total_spheres"] = int(sphere_match.group(2))

        return result_dict["success"], result_dict

    except subprocess.TimeoutExpired:
        result_dict["error"] = f"Spoiler test timed out after {timeout}s"
        return False, result_dict
    except Exception as e:
        result_dict["error"] = str(e)
        return False, result_dict


def run_fuzz_test(
    world_dir: str,
    game_name: str,
    runs: int,
    project_root: Path,
    generation_timeout: int,
    test_timeout: int,
    starting_seed: Optional[int],
    headed: bool = False,
    default_options: Optional[set] = None,
    disallow_options: Optional[Dict] = None,
    max_item_dict_value: Optional[int] = None,
    verbose: bool = True
) -> Dict:
    """
    Run fuzz tests for a single game.

    Generates random YAMLs, runs generation, and runs spoiler tests.

    Returns a dict with aggregated results.
    """
    result = {
        "passed": False,
        "total": runs,
        "success": 0,
        "generation_failure": 0,
        "ignored": 0,  # OptionError or invalid option combinations (expected failures)
        "test_failure": 0,
        "timeout": 0,
        "errors": [],
        "runs": []
    }

    if default_options is None:
        default_options = set()
    if disallow_options is None:
        disallow_options = {}

    for i in range(runs):
        run_result = {
            "run": i + 1,
            "generation_success": False,
            "test_success": False,
            "error": None
        }

        # Seed random for reproducibility if starting_seed is provided
        if starting_seed is not None:
            random.seed(starting_seed + i)
            run_seed = starting_seed + i
        else:
            run_seed = random.randint(1, 1000000)

        if verbose:
            print(f"    Run {i + 1}/{runs} (seed {run_seed}): ", end="", flush=True)

        # Generate random YAML
        try:
            yaml_content = generate_random_yaml(
                world_dir,
                meta={},
                default_options=default_options,
                disallow_options=disallow_options,
                max_item_dict_value=max_item_dict_value
            )
        except Exception as e:
            run_result["error"] = f"YAML generation failed: {e}"
            result["errors"].append(run_result["error"])
            result["generation_failure"] += 1
            result["runs"].append(run_result)
            if verbose:
                print("YAML generation failed")
            continue

        # Write YAML to temp file
        with tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.yaml',
            prefix=f'fuzz_{world_dir}_',
            dir=str(project_root / 'Players'),
            delete=False
        ) as f:
            f.write(yaml_content)
            temp_yaml_path = f.name

        try:
            # Get relative path for Generate.py (it expects path relative to Players/)
            yaml_rel_path = os.path.relpath(temp_yaml_path, project_root / 'Players')

            # Run generation
            gen_success, gen_output, seed_id = run_generation(
                yaml_rel_path,
                run_seed,
                project_root,
                timeout=generation_timeout
            )

            run_result["generation_success"] = gen_success
            run_result["seed"] = run_seed
            run_result["seed_id"] = seed_id

            if not gen_success:
                run_result["error"] = f"Generation failed: {gen_output[-500:] if len(gen_output) > 500 else gen_output}"

                # Check if this is an OptionError (invalid option combination)
                # These are expected failures and should be ignored, not counted as failures
                if is_option_error(gen_output):
                    result["ignored"] += 1
                    run_result["ignored"] = True
                    result["runs"].append(run_result)
                    if verbose:
                        print("ignored (invalid options)")
                    continue

                result["errors"].append(run_result["error"])
                result["generation_failure"] += 1
                result["runs"].append(run_result)
                if verbose:
                    print("generation failed")
                continue

            if verbose:
                print("generated -> ", end="", flush=True)

            # Run spoiler test
            test_success, test_result = run_spoiler_test(
                game_name,
                run_seed,
                project_root,
                headed=headed,
                timeout=test_timeout
            )

            run_result["test_success"] = test_success
            run_result["sphere_reached"] = test_result.get("sphere_reached", 0)
            run_result["total_spheres"] = test_result.get("total_spheres", 0)

            if test_success:
                result["success"] += 1
                if verbose:
                    print("PASS")
            else:
                if test_result.get("error") and "timeout" in test_result["error"].lower():
                    result["timeout"] += 1
                    if verbose:
                        print("TIMEOUT")
                else:
                    result["test_failure"] += 1
                    if verbose:
                        print("FAIL")
                run_result["error"] = test_result.get("error") or "Spoiler test failed"
                result["errors"].append(run_result["error"])

            result["runs"].append(run_result)

        finally:
            # Clean up temp YAML file
            try:
                os.unlink(temp_yaml_path)
            except OSError:
                pass

    # Determine overall pass/fail
    # Note: "ignored" counts are NOT failures - they are expected invalid option combinations
    result["passed"] = (result["generation_failure"] == 0 and
                        result["test_failure"] == 0 and
                        result["timeout"] == 0)

    return result


def ensure_http_server(project_root: Path) -> Optional[subprocess.Popen]:
    """Ensure HTTP server is running, starting one if needed."""
    if check_http_server():
        return None

    print("Starting HTTP server...")
    server = subprocess.Popen(
        [sys.executable, '-m', 'http.server', '8000'],
        cwd=str(project_root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Wait for server to start
    for _ in range(20):
        time.sleep(0.5)
        if check_http_server():
            print(f"HTTP server started (PID: {server.pid})")
            return server

    server.terminate()
    raise RuntimeError("Failed to start HTTP server")


def main():
    parser = argparse.ArgumentParser(
        description="Run spoiler fuzz tests for all templates",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--templates-dir',
        type=str,
        default='Players/Templates',
        help='Path to template directory (default: Players/Templates)'
    )
    parser.add_argument(
        '--output-file',
        type=str,
        default=None,
        help='Output JSON file path (auto-computed if not specified)'
    )
    parser.add_argument(
        '--skip-list',
        type=str,
        nargs='*',
        help='List of template files to skip'
    )
    parser.add_argument(
        '--include-list',
        type=str,
        nargs='*',
        help='Only test these templates (overrides skip-list)'
    )
    parser.add_argument(
        '-r', '--runs',
        type=int,
        default=10,
        help='Number of fuzz runs per game (default: 10)'
    )
    parser.add_argument(
        '--generation-timeout',
        type=int,
        default=300,
        help='Timeout for seed generation in seconds (default: 300)'
    )
    parser.add_argument(
        '--test-timeout',
        type=int,
        default=120,
        help='Timeout for spoiler test in seconds (default: 120)'
    )
    parser.add_argument(
        '--starting-seed',
        type=int,
        default=None,
        help='Starting seed number for generation. Each run uses starting_seed + iteration '
             'as the actual Archipelago generation seed. If not set, seeds are random.'
    )
    parser.add_argument(
        '--every-nth',
        type=int,
        default=1,
        help='Only test every Nth template (for parallel splitting)'
    )
    parser.add_argument(
        '--skip-first',
        type=int,
        default=0,
        help='Skip the first N templates before applying every-nth filter'
    )
    parser.add_argument(
        '--headed',
        action='store_true',
        help='Run Playwright tests in headed mode (with visible browser)'
    )
    parser.add_argument(
        '--custom-worlds-only',
        action='store_true',
        help='Only test games loaded from the custom_worlds directory (apworld files)'
    )
    parser.add_argument(
        '--default-options',
        type=str,
        default=None,
        help='Comma-separated list of option names to leave at defaults instead of randomizing'
    )
    parser.add_argument(
        '--disallow-options',
        type=str,
        default=None,
        help='Disallow specific values. Format: option=value1,value2;option2=value'
    )

    args = parser.parse_args()

    # Determine seed mode and world source
    is_random_seed_mode = args.starting_seed is None
    seed_type = "random" if is_random_seed_mode else "fixed"
    world_source = "apworlds" if args.custom_worlds_only else "bundled"

    # Compute output filename if not specified
    if args.output_file is None:
        is_split_job = args.every_nth > 1
        if is_split_job:
            split_num = args.skip_first + 1
            # For bundled worlds, use backwards compatible naming (no world source prefix)
            if world_source == "bundled":
                output_filename = f"test-results-{seed_type}-split-{split_num}.json"
            else:
                output_filename = f"test-results-{world_source}-{seed_type}-split-{split_num}.json"
        else:
            # For bundled worlds, use backwards compatible naming (no world source prefix)
            if world_source == "bundled":
                output_filename = f"test-results-{seed_type}-seed.json"
            else:
                output_filename = f"test-results-{world_source}-{seed_type}-seed.json"
        args.output_file = f"scripts/output/spoiler-fuzz/{output_filename}"
        print(f"Auto-computed output file: {args.output_file}")

    # Get templates directory
    templates_dir = PROJECT_ROOT / args.templates_dir
    if not templates_dir.exists():
        print(f"Error: Templates directory not found: {templates_dir}")
        return 1

    # Get skip list based on world source
    # For bundled games: use 'main' (same as test-all-templates.py)
    # For apworlds: use 'ut_fuzz_apworld' exclusions
    if args.skip_list:
        skip_list = args.skip_list
    elif args.custom_worlds_only:
        skip_list = load_template_exclude_list(test_type='ut_fuzz_apworld')
    else:
        skip_list = load_template_exclude_list(test_type='main')

    # Get template files
    template_files = get_template_files(templates_dir, skip_list, args.include_list)
    if not template_files:
        print("No template files found to test")
        return 1

    # Initialize world_mapping
    world_mapping = {}

    # Apply --custom-worlds-only filtering if requested
    if args.custom_worlds_only:
        print("Filtering to custom_worlds only...")
        world_mapping = build_and_load_world_mapping(PROJECT_ROOT)

        before_filter = len(template_files)
        filtered_files = []

        for yaml_file in template_files:
            game_name = extract_game_name_from_template(str(yaml_file))
            if not game_name:
                game_name = yaml_file.stem

            world_info = world_mapping.get(game_name, {})
            is_custom_world = 'apworld_path' in world_info and world_info['apworld_path'] is not None

            if is_custom_world:
                filtered_files.append(yaml_file)

        template_files = filtered_files
        excluded_count = before_filter - len(template_files)
        print(f"Custom worlds filter: {len(template_files)} templates included, {excluded_count} excluded")

        if not template_files:
            print("Error: No templates remaining after custom_worlds filter")
            return 1

    # Apply every-nth and skip-first filters for parallel splitting
    if args.skip_first > 0 or args.every_nth > 1:
        original_count = len(template_files)
        template_files = template_files[args.skip_first::args.every_nth]
        print(f"Split filtering: skip-first={args.skip_first}, every-nth={args.every_nth}")
        print(f"Reduced from {original_count} to {len(template_files)} templates")

    if not template_files:
        print("No template files remaining after split filtering")
        return 0

    # Parse default_options
    default_options = set()
    if args.default_options:
        default_options = set(opt.strip() for opt in args.default_options.split(","))

    # Parse disallow_options
    disallow_options = {}
    if args.disallow_options:
        for option_spec in args.disallow_options.split(";"):
            option_spec = option_spec.strip()
            if not option_spec:
                continue
            if "=" not in option_spec:
                raise ValueError(f"Invalid disallow-options format: '{option_spec}'")
            option_name, values_str = option_spec.split("=", 1)
            option_name = option_name.strip()
            values = set(v.strip() for v in values_str.split(",") if v.strip())
            disallow_options[option_name] = values

    print(f"Found {len(template_files)} templates to test")
    print(f"Skip list: {skip_list}")
    print(f"Runs per game: {args.runs}")
    print(f"Generation timeout: {args.generation_timeout}s, Test timeout: {args.test_timeout}s")
    print(f"Starting seed: {args.starting_seed if args.starting_seed is not None else 'random'}")
    print()

    # Ensure HTTP server is running
    server_process = None
    try:
        server_process = ensure_http_server(PROJECT_ROOT)
    except RuntimeError as e:
        print(f"Error: {e}")
        return 1

    # Create output directory
    output_path = PROJECT_ROOT / args.output_file
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Initialize results structure
    results = {
        "metadata": {
            "created": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "script_version": "1.1.0",
            "test_type": "spoiler_fuzz",
            "seed_mode": seed_type,
            "starting_seed": args.starting_seed if not is_random_seed_mode else "random",
            "runs_per_game": args.runs,
            "generation_timeout": args.generation_timeout,
            "test_timeout": args.test_timeout,
            "total_templates": len(template_files)
        },
        "results": {}
    }

    # Track statistics
    passed_count = 0
    failed_count = 0
    error_count = 0

    try:
        # Run tests for each template
        for i, yaml_file in enumerate(template_files, 1):
            template_name = yaml_file.name
            game_name = extract_game_name_from_template(str(yaml_file)) or template_name.replace('.yaml', '')

            # Get the world directory name
            world_dir = get_world_directory_name_from_game_name(game_name)
            if not world_dir:
                print(f"[{i}/{len(template_files)}] Skipping {game_name} - could not find world directory")
                continue

            print(f"[{i}/{len(template_files)}] Testing {game_name} (world: {world_dir})...")

            # Get game-specific fuzzer options and merge with command-line options
            game_opts = get_game_fuzzer_options(template_name)

            # Merge default_options: command-line takes precedence, game-specific adds to it
            effective_default_options = default_options.copy() if default_options else set()
            if game_opts['default_options']:
                game_specific_opts = set(game_opts['default_options'].split(','))
                effective_default_options = effective_default_options | game_specific_opts

            # Merge disallow_options: command-line takes precedence, game-specific adds to it
            effective_disallow_options = disallow_options.copy() if disallow_options else {}
            if game_opts['disallow_options']:
                # Parse game-specific disallow_options
                for option_spec in game_opts['disallow_options'].split(";"):
                    option_spec = option_spec.strip()
                    if not option_spec or "=" not in option_spec:
                        continue
                    option_name, values_str = option_spec.split("=", 1)
                    option_name = option_name.strip()
                    values = set(v.strip() for v in values_str.split(",") if v.strip())
                    if option_name in effective_disallow_options:
                        effective_disallow_options[option_name] = effective_disallow_options[option_name] | values
                    else:
                        effective_disallow_options[option_name] = values

            # Get max_item_dict_value (caps start_inventory item counts to prevent huge rules.json)
            effective_max_item_dict_value = game_opts['max_item_dict_value']

            # Run the fuzz tests
            test_result = run_fuzz_test(
                world_dir=world_dir,
                game_name=game_name,
                runs=args.runs,
                project_root=PROJECT_ROOT,
                generation_timeout=args.generation_timeout,
                test_timeout=args.test_timeout,
                starting_seed=args.starting_seed,
                headed=args.headed,
                default_options=effective_default_options,
                disallow_options=effective_disallow_options,
                max_item_dict_value=effective_max_item_dict_value
            )

            # Build failing_seeds dict mapping failure type to list of seeds
            failing_seeds = {
                "generation_failure": [],
                "test_failure": [],
                "timeout": [],
            }
            for run in test_result.get("runs", []):
                seed = run.get("seed")
                if seed is None:
                    continue
                if run.get("ignored"):
                    continue  # Don't track ignored runs (invalid option combinations)
                if not run.get("generation_success"):
                    failing_seeds["generation_failure"].append(seed)
                elif not run.get("test_success"):
                    # Check if it was a timeout
                    error = run.get("error", "")
                    if error and "timeout" in error.lower():
                        failing_seeds["timeout"].append(seed)
                    else:
                        failing_seeds["test_failure"].append(seed)

            # Store result
            result_entry = {
                "spoiler_fuzz": {
                    "passed": test_result["passed"],
                    "total": test_result["total"],
                    "success": test_result["success"],
                    "generation_failure": test_result["generation_failure"],
                    "ignored": test_result["ignored"],
                    "test_failure": test_result["test_failure"],
                    "timeout": test_result["timeout"],
                    "errors": test_result["errors"][:10],  # Limit stored errors
                    "failing_seeds": failing_seeds,  # Track which seeds failed
                },
                "world_info": {
                    "game_name": game_name,
                    "world_directory": world_dir
                },
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

            results["results"][template_name] = result_entry

            # Update statistics
            # Note: "ignored" counts are NOT failures - they are expected invalid option combinations
            if test_result["passed"]:
                passed_count += 1
                status = "PASS"
            elif test_result["generation_failure"] > 0 or test_result["timeout"] > 0:
                error_count += 1
                status = "ERROR"
            else:
                failed_count += 1
                status = "FAIL"

            # Print summary
            print(f"  {status}: {test_result['success']}/{test_result['total']} success, "
                  f"{test_result['generation_failure']} gen failures, "
                  f"{test_result['ignored']} ignored, "
                  f"{test_result['test_failure']} test failures, "
                  f"{test_result['timeout']} timeouts")

            if test_result["errors"]:
                error_preview = test_result["errors"][0]
                if len(error_preview) > 100:
                    error_preview = error_preview[:100] + "..."
                print(f"  First error: {error_preview}")
            print()

            # Save intermediate results after each template
            results["metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat()
            with open(output_path, 'w') as f:
                json.dump(results, f, indent=2)

    finally:
        # Clean up server if we started it
        if server_process:
            print("Stopping HTTP server...")
            server_process.terminate()

    # Final summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total templates: {len(template_files)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {failed_count}")
    print(f"Errors: {error_count}")
    print(f"Results saved to: {output_path}")

    # Always return 0 - test failures are expected results, not workflow errors
    # Results are captured in the JSON output and documentation
    return 0


if __name__ == "__main__":
    sys.exit(main())
