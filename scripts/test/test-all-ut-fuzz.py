#!/usr/bin/env python3
"""
Batch UT Fuzzer Test Runner

Runs the UT fuzzer for all template files and aggregates results into
a JSON file compatible with the test results chart generator.

This script:
1. Iterates through YAML template files
2. Runs fuzz.py with the UT hook for each game
3. Collects results into scripts/output/ut-fuzz/test-results.json

Usage:
    # Test all templates
    python scripts/test/test-all-ut-fuzz.py --runs 10

    # Test specific templates
    python scripts/test/test-all-ut-fuzz.py --runs 10 --include-list Adventure.yaml

    # Split for parallel execution (10 splits)
    python scripts/test/test-all-ut-fuzz.py --runs 10 --every-nth 10 --skip-first 0
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Add parent scripts directory to path to import from lib
sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.test_utils import (
    extract_game_name_from_template,
    load_template_exclude_list,
    get_world_directory_name_from_game_name,
    build_and_load_world_mapping,
    cleanup_empty_worldgen_dirs,
)
from setup.update_host_settings import update_host_yaml

# Global variable to cache apworld download URLs
_apworld_download_urls: Dict[str, str] = {}

# Project root
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Path to saved download URLs file (created by install_apworlds.py)
DOWNLOAD_URLS_FILE = PROJECT_ROOT / "scripts" / "data" / "apworld-download-urls.json"

# Default fuzzer output directory
FUZZ_OUTPUT_DIR = PROJECT_ROOT / "fuzz_output"

# Explain stats file location (written by fuzzer_hook)
EXPLAIN_STATS_FILE = FUZZ_OUTPUT_DIR / "explain_stats" / "explain_stats.json"

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
        Dict with 'default_options' and 'disallow_options' keys (values may be None)
    """
    game_options = load_game_fuzzer_options()
    config = game_options.get(template_name, {})

    return {
        'default_options': config.get('default_options'),
        'disallow_options': config.get('disallow_options')
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

    # Filter out WorldGen and WorldGen 2 templates - they are regenerated versions
    # of original games and should behave identically, so testing them is redundant
    yaml_files = [f for f in yaml_files if 'WorldGen' not in f.name]

    return yaml_files


def read_explain_stats() -> Optional[Dict]:
    """
    Read explain stats from the fuzz output directory.

    Returns the explain stats dict if available, None otherwise.
    """
    if EXPLAIN_STATS_FILE.exists():
        try:
            with open(EXPLAIN_STATS_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return None


def load_apworld_download_urls() -> Dict[str, str]:
    """
    Load download URLs for all available apworlds.

    First tries to load from the JSON file created by install_apworlds.py.
    Falls back to querying the apworld_manager repositories if the file doesn't exist.

    Returns a dict mapping world_id (lowercase) to download URL.
    The URL can be used to download the apworld file directly.
    """
    global _apworld_download_urls

    if _apworld_download_urls:
        return _apworld_download_urls

    # First try to load from the saved JSON file (created by install_apworlds.py)
    if DOWNLOAD_URLS_FILE.exists():
        try:
            with open(DOWNLOAD_URLS_FILE, 'r') as f:
                data = json.load(f)
            urls = data.get('urls', {})
            for world_id, info in urls.items():
                if isinstance(info, dict) and 'download_url' in info:
                    _apworld_download_urls[world_id.lower()] = info['download_url']
                elif isinstance(info, str):
                    # Handle simple string format for backwards compatibility
                    _apworld_download_urls[world_id.lower()] = info
            print(f"Loaded {len(_apworld_download_urls)} apworld download URLs from {DOWNLOAD_URLS_FILE}")
            return _apworld_download_urls
        except Exception as e:
            print(f"Warning: Error loading download URLs from file: {e}")
            # Fall through to repository loading

    # Fall back to loading from apworld_manager repositories
    try:
        from worlds.apworld_manager.world_manager import (
            repositories, refresh_apworld_table
        )

        print("Loading apworld download URLs from repositories...")
        repositories.load_repos_from_settings()
        repositories.refresh()

        apworlds = refresh_apworld_table()

        for world in apworlds:
            latest = world.get('latest_version')
            if latest and hasattr(latest, 'id'):
                world_id = latest.id.lower()
                # Get the download URL from the latest_version object
                try:
                    if hasattr(latest, 'download_url'):
                        _apworld_download_urls[world_id] = latest.download_url
                    elif hasattr(latest, 'url'):
                        _apworld_download_urls[world_id] = latest.url
                except Exception:
                    # Skip if download_url property throws an error
                    pass

        print(f"Loaded {len(_apworld_download_urls)} apworld download URLs from repositories")
        return _apworld_download_urls

    except ImportError as e:
        print(f"Warning: Could not load apworld_manager: {e}")
        return {}
    except Exception as e:
        print(f"Warning: Error loading apworld download URLs: {e}")
        return {}


def get_apworld_download_url(world_directory: str, world_mapping: Dict) -> Optional[str]:
    """
    Get the download URL for a specific apworld.

    Args:
        world_directory: The world directory name (e.g., 'actraiser')
        world_mapping: The world mapping dict from build_and_load_world_mapping()

    Returns:
        The download URL if available, None otherwise.
    """
    # First check if we have it cached
    if world_directory.lower() in _apworld_download_urls:
        return _apworld_download_urls[world_directory.lower()]

    # Try to find it in the world mapping
    for game_name, info in world_mapping.items():
        if info.get('world_directory') == world_directory:
            apworld_path = info.get('apworld_path')
            if apworld_path:
                # Extract world_id from apworld path
                # apworld_path is like "custom_worlds/actraiser.apworld"
                apworld_filename = Path(apworld_path).stem  # "actraiser"
                if apworld_filename.lower() in _apworld_download_urls:
                    return _apworld_download_urls[apworld_filename.lower()]
            break

    return None


def run_fuzzer_test(
    world_dir: str,
    runs: int,
    jobs: int,
    timeout: int,
    starting_seed: Optional[int],
    default_options: Optional[str] = None,
    disallow_options: Optional[str] = None,
    fractional_spheres: bool = False,
    stop_on_first_failure: bool = False,
    number_by_seed: bool = False,
    original_seeded: bool = False,
    ut_version: Optional[str] = None,
    process_timeout: Optional[int] = None
) -> Dict:
    """
    Run fuzzer test for a single game.

    Args:
        world_dir: The world directory name (apworld name)
        runs: Number of fuzz runs
        jobs: Number of parallel jobs
        timeout: Timeout per generation in seconds
        starting_seed: Starting seed number for generation (None = random)
        default_options: Comma-separated options to leave at defaults
        disallow_options: Options to disallow (format: option=value1,value2;option2=value)
        fractional_spheres: Enable fractional sphere logic for UT comparison
        stop_on_first_failure: Stop fuzzing after the first failure
        number_by_seed: Number output files by actual seed instead of iteration index
        original_seeded: Use original UT tracking with the actual generation seed
        ut_version: UT version string (original, original_seeded, worldgen, pickle, hybrid)
        process_timeout: Total timeout for the entire fuzz.py subprocess in seconds.
                        If None, calculated as (runs * timeout) + 300.

    Returns a dict with:
        - passed: bool (True if no failures)
        - total: int (total runs)
        - success: int
        - failure: int
        - timeout: int
        - ignored: int
        - error: str or None
        - errors: dict of error types
        - explain_stats: dict with explain support statistics (if available)
    """
    result = {
        "passed": False,
        "total": 0,
        "success": 0,
        "failure": 0,
        "timeout": 0,
        "ignored": 0,
        "error": None,
        "errors": {},
        "explain_stats": None,
        "elapsed_seconds": 0.0
    }

    # Track elapsed time
    start_time = time.perf_counter()

    # Calculate process timeout if not specified
    # Default: per-generation timeout * runs + 5 min buffer for UT verification
    if process_timeout is None:
        process_timeout = (runs * timeout) + 300

    # Clean up any previous fuzz output
    if FUZZ_OUTPUT_DIR.exists():
        shutil.rmtree(FUZZ_OUTPUT_DIR)

    # Build fuzzer command
    cmd = [
        sys.executable, str(PROJECT_ROOT / "fuzz.py"),
        "-r", str(runs),
        "-j", str(jobs),
        "-g", world_dir,
        "-n", "1",
        "-t", str(timeout),
        "--hook", "worlds.tracker.fuzzer_hook:Hook"
    ]

    if starting_seed is not None:
        cmd.extend(["--starting-seed", str(starting_seed)])

    if default_options:
        cmd.extend(["--default-options", default_options])

    if disallow_options:
        cmd.extend(["--disallow-options", disallow_options])

    if fractional_spheres:
        cmd.append("--fractional-spheres")

    if stop_on_first_failure:
        cmd.append("--stop-on-first-failure")

    if number_by_seed:
        cmd.append("--number-by-seed")

    if original_seeded:
        cmd.append("--original-seeded")

    if ut_version:
        cmd.extend(["--ut-version", ut_version])

    print(f"  Running: {' '.join(cmd[:10])}...")
    print(f"  Process timeout: {process_timeout}s")

    try:
        # Stream output in real-time for progress visibility
        # Use Popen to capture stderr while streaming stdout
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=str(PROJECT_ROOT)
        )

        # Set up a timer to kill the process if it exceeds the timeout
        process_timed_out = [False]  # Use list to allow modification in nested function

        def kill_on_timeout():
            process_timed_out[0] = True
            print(f"    Process timeout ({process_timeout}s) exceeded, killing...")
            proc.kill()

        timer = threading.Timer(process_timeout, kill_on_timeout)
        timer.start()

        try:
            # Read and print stdout in real-time
            stdout_lines = []
            while True:
                line = proc.stdout.readline()
                if line:
                    print(f"    {line.rstrip()}")
                    stdout_lines.append(line)
                    sys.stdout.flush()
                elif proc.poll() is not None:
                    # Process finished, read any remaining output
                    for remaining_line in proc.stdout:
                        print(f"    {remaining_line.rstrip()}")
                        stdout_lines.append(remaining_line)
                    break

            # Get stderr after process completes
            stderr_output = proc.stderr.read()
            returncode = proc.returncode
        finally:
            timer.cancel()

        # Check if we timed out
        if process_timed_out[0]:
            result["error"] = f"Process timed out after {process_timeout} seconds"
            result["elapsed_seconds"] = time.perf_counter() - start_time
            return result

        # Check for report.json
        report_file = FUZZ_OUTPUT_DIR / "report.json"
        if report_file.exists():
            with open(report_file) as f:
                report = json.load(f)

            stats = report.get("stats", {})
            result["total"] = stats.get("total", 0)
            result["success"] = stats.get("success", 0)
            result["failure"] = stats.get("failure", 0)
            result["timeout"] = stats.get("timeout", 0)
            result["ignored"] = stats.get("ignored", 0)
            result["passed"] = (result["failure"] == 0 and result["timeout"] == 0)

            # Include error details
            errors = report.get("errors", {})
            if world_dir in errors:
                result["errors"] = errors[world_dir]

            # Read explain stats if available
            explain_stats = read_explain_stats()
            if explain_stats:
                result["explain_stats"] = explain_stats
        else:
            # No report file - check for errors
            error_details = []
            error_details.append("Report file not found")
            if returncode != 0:
                error_details.append(f"Exit code: {returncode}")
            if stderr_output:
                stderr = stderr_output.strip()
                if len(stderr) > 1000:
                    stderr = "..." + stderr[-1000:]
                error_details.append(f"stderr: {stderr}")
            stdout_text = ''.join(stdout_lines)
            if stdout_text:
                if len(stdout_text) > 1000:
                    stdout_text = "..." + stdout_text[-1000:]
                error_details.append(f"stdout: {stdout_text}")
            result["error"] = " | ".join(error_details)

    except subprocess.TimeoutExpired:
        result["error"] = f"Fuzzer timed out after {runs * timeout + 300} seconds"
    except Exception as e:
        result["error"] = str(e)

    # Record elapsed time
    result["elapsed_seconds"] = time.perf_counter() - start_time
    return result


def main():
    parser = argparse.ArgumentParser(
        description="Run UT fuzzer tests for all templates",
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
        '-j', '--jobs',
        type=int,
        default=os.cpu_count() or 4,
        help=f'Number of parallel jobs (default: {os.cpu_count() or 4} = CPU count)'
    )
    parser.add_argument(
        '-t', '--timeout',
        type=int,
        default=60,
        help='Timeout per generation in seconds (default: 60)'
    )
    parser.add_argument(
        '--process-timeout',
        type=int,
        default=None,
        help='Total timeout for the entire fuzz subprocess in seconds. '
             'If not specified, calculated as (runs * timeout) + 300'
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
        '--ut-version',
        type=str,
        choices=['worldgen', 'original', 'original_seeded', 'pickle'],
        default='worldgen',
        help='Which version of Universal Tracker to test: worldgen (rules.json-based), '
             'original (YAML-based, random seed), original_seeded (YAML-based, '
             'actual seed), or pickle (pickle-based, fastest) (default: worldgen)'
    )
    parser.add_argument(
        '--custom-worlds-only',
        action='store_true',
        help='Only test games loaded from the custom_worlds directory (apworld files)'
    )
    parser.add_argument(
        '--world-source',
        type=str,
        choices=['bundled', 'apworlds'],
        default=None,
        help='World source for output filename: bundled (default) or apworlds'
    )

    # Add mutually exclusive group for tracking config
    tracking_config_group = parser.add_mutually_exclusive_group()
    tracking_config_group.add_argument(
        '--use-tracking-config',
        dest='use_tracking_config',
        action='store_true',
        default=True,
        help='Use tracking-mode-config.json for per-game mode selection (default: enabled)'
    )
    tracking_config_group.add_argument(
        '--no-use-tracking-config',
        dest='use_tracking_config',
        action='store_false',
        help='Disable config-based mode selection, use same mode for all worlds'
    )

    # Fuzzer options passed through to fuzz.py
    parser.add_argument(
        '--default-options',
        type=str,
        default=None,
        help='Comma-separated list of option names to leave at defaults instead of randomizing. '
             'Example: --default-options mode,entrance_shuffle,glitches_required'
    )
    parser.add_argument(
        '--disallow-options',
        type=str,
        default=None,
        help='Disallow specific values for options. Format: option=value1,value2;option2=value. '
             'Example: --disallow-options glitches_required=minor_glitches,overworld_glitches;mode=inverted'
    )
    parser.add_argument(
        '--fractional-spheres',
        action='store_true',
        default=False,
        help='Enable fractional sphere logic for UT comparison. Handles cascading item dependencies '
             'within spheres by iterating until no new locations become accessible.'
    )
    parser.add_argument(
        '--stop-on-first-failure',
        action='store_true',
        default=False,
        help='Stop fuzzing after the first failure or timeout. Useful for debugging.'
    )
    parser.add_argument(
        '--number-by-seed',
        action='store_true',
        default=False,
        help='Number output files and errors by actual seed instead of iteration index. '
             'Requires --starting-seed to be set.'
    )

    args = parser.parse_args()

    # Configure host settings for UT fuzz testing
    # When use_tracking_config is True (hybrid mode), use the tracking-mode-config.json system
    # which determines the best export format (rules.json vs pickle) per-game based on test results.
    # Otherwise, use the legacy flag-based system.
    print("Configuring host settings for UT fuzz testing...")
    print(f"  ut_version: {args.ut_version}")
    print(f"  use_tracking_config: {args.use_tracking_config}")

    use_pickle_mode = args.ut_version == "pickle"

    if args.use_tracking_config and args.ut_version not in ("original", "original_seeded", "pickle"):
        # Hybrid mode: use tracking-mode-config.json for per-game export decisions
        print(f"  use_tracking_mode_config: True")
        print(f"  (Config determines export format per-game based on test results)")
        update_host_yaml({
            'use_tracking_mode_config': True,
            'save_rules_json': False,  # Config decides
            'save_tracker_pickle': False,  # Config decides
        })
    else:
        # Flag-based system (worldgen, original, original_seeded, pickle modes)
        use_rules_json = args.ut_version == "worldgen"
        print(f"  use_tracking_mode_config: False")
        print(f"  save_rules_json: {use_rules_json}")
        print(f"  save_tracker_pickle: {use_pickle_mode}")
        update_host_yaml({
            'use_tracking_mode_config': False,
            'save_rules_json': use_rules_json,
            'save_tracker_pickle': use_pickle_mode,
        })

    # Clean up empty worldgen directories before loading worlds
    cleanup_empty_worldgen_dirs()

    # Determine seed mode and UT version
    is_random_seed_mode = args.starting_seed is None
    seed_type = "random" if is_random_seed_mode else "fixed"

    # Determine UT version label for output files
    # - "original" = original UT from FarisTheAncient
    # - "worldgen" = UT using worldgen-based tracking (regenerates world from rules.json)
    # - "hybrid" = UT with config-based per-game mode selection
    # - "pickle" = UT using pickle-based tracking (fastest, preserves exact lambdas)
    if args.ut_version == "original":
        ut_version = "original"
    elif args.ut_version == "original_seeded":
        ut_version = "original_seeded"
    elif args.ut_version == "pickle":
        ut_version = "pickle"
    elif args.use_tracking_config:
        ut_version = "hybrid"
    else:
        ut_version = "worldgen"

    # Determine world source (for output filename)
    # If --world-source is specified, use it; otherwise infer from --custom-worlds-only
    if args.world_source:
        world_source = args.world_source
    elif args.custom_worlds_only:
        world_source = "apworlds"
    else:
        world_source = "bundled"

    # Compute output filename if not specified
    # Format: test-results-{world_source}-{ut_version}-{seed_type}-split-{N}.json
    # or: test-results-{world_source}-{ut_version}-{seed_type}-seed.json
    # For bundled worlds, we omit the world_source for backwards compatibility
    if args.output_file is None:
        is_split_job = args.every_nth > 1
        if world_source == "bundled":
            # Backwards compatible naming (no world_source prefix)
            if is_split_job:
                split_num = args.skip_first + 1
                output_filename = f"test-results-{ut_version}-{seed_type}-split-{split_num}.json"
            else:
                output_filename = f"test-results-{ut_version}-{seed_type}-seed.json"
        else:
            # Include world_source in filename for non-bundled (e.g., apworlds)
            if is_split_job:
                split_num = args.skip_first + 1
                output_filename = f"test-results-{world_source}-{ut_version}-{seed_type}-split-{split_num}.json"
            else:
                output_filename = f"test-results-{world_source}-{ut_version}-{seed_type}-seed.json"
        args.output_file = f"scripts/output/ut-fuzz/{output_filename}"
        print(f"Auto-computed output file: {args.output_file}")

    # Get templates directory
    templates_dir = PROJECT_ROOT / args.templates_dir
    if not templates_dir.exists():
        print(f"Error: Templates directory not found: {templates_dir}")
        return 1

    # Get skip list (permanent + ut_fuzz exclusions for games that hang/timeout)
    skip_list = args.skip_list if args.skip_list else load_template_exclude_list(test_type='ut_fuzz')

    # Get template files
    template_files = get_template_files(templates_dir, skip_list, args.include_list)
    if not template_files:
        print("No template files found to test")
        return 1

    # Initialize world_mapping - needed for custom worlds filtering and download URLs
    world_mapping = {}

    # Apply --custom-worlds-only filtering if requested
    if args.custom_worlds_only:
        print("Filtering to custom_worlds only...")
        world_mapping = build_and_load_world_mapping(PROJECT_ROOT)

        before_filter = len(template_files)
        filtered_files = []

        for yaml_file in template_files:
            # Derive game name from yaml filename
            game_name = extract_game_name_from_template(str(yaml_file))
            if not game_name:
                game_name = yaml_file.stem

            # Check if this is a custom world
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

    # Load apworld download URLs when testing apworlds
    if world_source == "apworlds":
        load_apworld_download_urls()

    # Apply every-nth and skip-first filters for parallel splitting
    if args.skip_first > 0 or args.every_nth > 1:
        original_count = len(template_files)
        template_files = template_files[args.skip_first::args.every_nth]
        print(f"Split filtering: skip-first={args.skip_first}, every-nth={args.every_nth}")
        print(f"Reduced from {original_count} to {len(template_files)} templates")

    if not template_files:
        print("No template files remaining after split filtering")
        return 0  # Not an error, just no work for this split

    print(f"Found {len(template_files)} templates to test")
    print(f"Skip list: {skip_list}")
    print(f"Runs per game: {args.runs}, Jobs: {args.jobs}, Timeout: {args.timeout}s")
    print(f"Starting seed: {args.starting_seed if args.starting_seed is not None else 'random'}")
    print()

    # Create output directory
    output_path = PROJECT_ROOT / args.output_file
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Initialize results structure
    results = {
        "metadata": {
            "created": datetime.now(timezone.utc).isoformat(),
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "script_version": "1.0.0",
            "ut_version": ut_version,
            "use_tracking_config": args.use_tracking_config if args.ut_version != "original" else None,
            "world_source": world_source,
            "seed_mode": seed_type,
            "starting_seed": args.starting_seed if not is_random_seed_mode else "random",
            "runs_per_game": args.runs,
            "jobs": args.jobs,
            "timeout": args.timeout,
            "default_options": args.default_options,
            "disallow_options": args.disallow_options,
            "total_templates": len(template_files)
        },
        "results": {}
    }

    # Track statistics
    passed_count = 0
    failed_count = 0
    error_count = 0

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
        effective_default_options = args.default_options
        if game_opts['default_options']:
            if effective_default_options:
                # Combine both, avoiding duplicates
                cli_opts = set(effective_default_options.split(','))
                game_specific_opts = set(game_opts['default_options'].split(','))
                effective_default_options = ','.join(cli_opts | game_specific_opts)
            else:
                effective_default_options = game_opts['default_options']

        # Merge disallow_options: command-line takes precedence, game-specific adds to it
        effective_disallow_options = args.disallow_options
        if game_opts['disallow_options']:
            if effective_disallow_options:
                # Combine both with semicolon separator
                effective_disallow_options = f"{effective_disallow_options};{game_opts['disallow_options']}"
            else:
                effective_disallow_options = game_opts['disallow_options']

        # Run the fuzzer
        test_result = run_fuzzer_test(
            world_dir=world_dir,
            runs=args.runs,
            jobs=args.jobs,
            timeout=args.timeout,
            starting_seed=args.starting_seed,
            default_options=effective_default_options,
            disallow_options=effective_disallow_options,
            fractional_spheres=args.fractional_spheres,
            stop_on_first_failure=args.stop_on_first_failure,
            number_by_seed=args.number_by_seed,
            original_seeded=(args.ut_version == "original_seeded"),
            ut_version=args.ut_version,
            process_timeout=args.process_timeout
        )

        # Store result
        result_entry = {
            "ut_fuzz": {
                "passed": test_result["passed"],
                "total": test_result["total"],
                "success": test_result["success"],
                "failure": test_result["failure"],
                "timeout": test_result["timeout"],
                "ignored": test_result["ignored"],
                "errors": test_result["errors"],
                "elapsed_seconds": round(test_result["elapsed_seconds"], 2)
            },
            "world_info": {
                "game_name": game_name,
                "world_directory": world_dir
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        # Include apworld download URL if testing apworlds
        if world_source == "apworlds":
            download_url = get_apworld_download_url(world_dir, world_mapping)
            if download_url:
                result_entry["world_info"]["apworld_download_url"] = download_url

        # Include explain stats if available
        if test_result.get("explain_stats"):
            result_entry["explain_stats"] = test_result["explain_stats"]

        results["results"][template_name] = result_entry

        if test_result["error"]:
            results["results"][template_name]["error"] = test_result["error"]

        # Update statistics
        if test_result["error"]:
            error_count += 1
            status = "ERROR"
        elif test_result["passed"]:
            passed_count += 1
            status = "PASS"
        else:
            failed_count += 1
            status = "FAIL"

        # Print summary
        elapsed = test_result['elapsed_seconds']
        print(f"  {status}: {test_result['success']}/{test_result['total']} success, "
              f"{test_result['failure']} failures, {test_result['timeout']} timeouts "
              f"({elapsed:.1f}s)")

        if test_result["error"]:
            error_msg = test_result["error"]
            if len(error_msg) > 200:
                print(f"  Error: {error_msg[:200]}...")
            else:
                print(f"  Error: {error_msg}")
        print()

        # Save intermediate results after each template
        results["metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat()
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)

    # Final summary
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total templates: {len(template_files)}")
    print(f"Passed: {passed_count}")
    print(f"Failed: {failed_count}")
    print(f"Errors: {error_count}")
    print(f"Results saved to: {output_path}")

    # Return error exit code only for infrastructure errors
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
