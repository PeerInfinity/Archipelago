#!/usr/bin/env python3
"""
Master script to generate all documentation from test results.

This script runs all the individual document generator scripts in the
correct order to regenerate all test result documentation.

Usage:
    python scripts/docs/generate-all-docs.py           # Generate all docs
    python scripts/docs/generate-all-docs.py --list    # List available generators
    python scripts/docs/generate-all-docs.py --only fuzz  # Run only fuzz-related generators
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Tuple

# Script directory
SCRIPT_DIR = Path(__file__).parent

# Define generators in order of execution
# Each entry is (name, script_path, description, tags, optional)
# optional=True means the generator may fail if no input data exists
GENERATORS: List[Tuple[str, str, str, List[str], bool]] = [
    (
        "test-chart",
        "generate-test-chart.py",
        "Spoiler tests, multiclient, multiworld, processing times, summaries (bundled/worldgen/apworld)",
        ["main", "spoiler", "multiclient", "multiworld", "summary", "processing"],
        False
    ),
    (
        "ut-fuzz",
        "generate_ut_fuzz_chart.py",
        "UT fuzz charts and comparisons (original/worldgen/hybrid, bundled/apworlds)",
        ["ut", "fuzz"],
        False
    ),
    (
        "multiworld-ut-fuzz",
        "generate_multiworld_ut_fuzz_chart.py",
        "Multiworld UT fuzz charts",
        ["ut", "fuzz", "multiworld"],
        True  # May not have data
    ),
    (
        "spoiler-fuzz",
        "generate_spoiler_fuzz_chart.py",
        "Spoiler fuzz charts (bundled and apworlds)",
        ["fuzz", "spoiler"],
        False
    ),
    (
        "fuzz-summary",
        "generate_fuzz_summary_chart.py",
        "Combined fuzz summary (bundled and apworlds)",
        ["fuzz", "summary"],
        False
    ),
    (
        "world-generator",
        "generate-world-generator-report.py",
        "World generator test report",
        ["worldgen"],
        False
    ),
    (
        "freshness",
        "generate-freshness-report.py",
        "Document freshness report showing when each test result doc was generated",
        ["summary", "meta"],
        False
    ),
]


def run_generator(name: str, script: str, verbose: bool = True) -> Tuple[bool, float, str]:
    """
    Run a single generator script.

    Returns:
        Tuple of (success, duration_seconds, output)
    """
    script_path = SCRIPT_DIR / script

    if not script_path.exists():
        return False, 0, f"Script not found: {script_path}"

    start_time = time.time()

    try:
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout per script
        )

        duration = time.time() - start_time
        output = result.stdout + result.stderr
        success = result.returncode == 0

        return success, duration, output

    except subprocess.TimeoutExpired:
        duration = time.time() - start_time
        return False, duration, "Timeout after 300 seconds"
    except Exception as e:
        duration = time.time() - start_time
        return False, duration, str(e)


def list_generators():
    """Print list of available generators."""
    print("Available documentation generators:\n")

    # Get unique tags
    all_tags = set()
    for _, _, _, tags, _ in GENERATORS:
        all_tags.update(tags)

    print(f"Tags: {', '.join(sorted(all_tags))}\n")
    print("-" * 80)

    for name, script, description, tags, optional in GENERATORS:
        opt_marker = " (optional)" if optional else ""
        print(f"\n{name}{opt_marker}")
        print(f"  Script: {script}")
        print(f"  Description: {description}")
        print(f"  Tags: {', '.join(tags)}")

    print("\n" + "-" * 80)
    print("\nUse --only <tag> to run only generators with that tag")
    print("Use --skip <name> to skip specific generators")
    print("Generators marked (optional) may fail if no input data exists")


def main():
    parser = argparse.ArgumentParser(
        description="Generate all documentation from test results",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List available generators and exit'
    )
    parser.add_argument(
        '--only',
        type=str,
        nargs='*',
        help='Only run generators with these tags or names'
    )
    parser.add_argument(
        '--skip',
        type=str,
        nargs='*',
        help='Skip generators with these names'
    )
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress output from individual generators'
    )
    parser.add_argument(
        '--continue-on-error',
        action='store_true',
        help='Continue running other generators if one fails'
    )

    args = parser.parse_args()

    if args.list:
        list_generators()
        return 0

    # Filter generators based on --only and --skip
    generators_to_run = []
    skip_names = set(args.skip) if args.skip else set()
    only_filters = set(args.only) if args.only else None

    for name, script, description, tags, optional in GENERATORS:
        # Skip if in skip list
        if name in skip_names:
            continue

        # If --only specified, check if name or any tag matches
        if only_filters:
            if name not in only_filters and not any(tag in only_filters for tag in tags):
                continue

        generators_to_run.append((name, script, description, tags, optional))

    if not generators_to_run:
        print("No generators to run (check --only and --skip filters)")
        return 1

    # Print header
    print("=" * 60)
    print("Generating Documentation")
    print("=" * 60)
    print(f"\nRunning {len(generators_to_run)} generator(s)...\n")

    # Run each generator
    results = []
    total_start = time.time()

    for i, (name, script, description, tags, optional) in enumerate(generators_to_run, 1):
        print(f"[{i}/{len(generators_to_run)}] {name}: {description}")

        success, duration, output = run_generator(name, script, verbose=not args.quiet)
        results.append((name, success, duration, output, optional))

        if success:
            print(f"    ✅ Completed in {duration:.1f}s")
        else:
            if optional:
                print(f"    ⚠️  Skipped in {duration:.1f}s (optional, no data)")
            else:
                print(f"    ❌ Failed in {duration:.1f}s")
                if not args.quiet:
                    # Show last few lines of output on failure
                    lines = output.strip().split('\n')
                    for line in lines[-5:]:
                        print(f"       {line}")

                if not args.continue_on_error:
                    print("\nStopping due to error (use --continue-on-error to continue)")
                    break

        if not args.quiet and output.strip():
            # Show key output lines (files saved, etc.)
            for line in output.split('\n'):
                if 'saved to' in line.lower() or 'generated' in line.lower():
                    print(f"    {line.strip()}")

        print()

    total_duration = time.time() - total_start

    # Print summary
    print("=" * 60)
    print("Summary")
    print("=" * 60)

    passed = sum(1 for _, success, _, _, _ in results if success)
    skipped = sum(1 for _, success, _, _, optional in results if not success and optional)
    failed = sum(1 for _, success, _, _, optional in results if not success and not optional)

    print(f"\nTotal: {len(results)} generators")
    print(f"Passed: {passed}")
    if skipped > 0:
        print(f"Skipped: {skipped} (optional, no data)")
    print(f"Failed: {failed}")
    print(f"Duration: {total_duration:.1f}s")

    if failed > 0:
        print("\nFailed generators:")
        for name, success, duration, output, optional in results:
            if not success and not optional:
                print(f"  - {name}")
        return 1

    print("\nAll documentation generated successfully!")
    return 0


if __name__ == '__main__':
    sys.exit(main())
