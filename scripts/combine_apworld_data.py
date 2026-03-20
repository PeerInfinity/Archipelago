#!/usr/bin/env python3
"""
Combine all APWorld information into a single comprehensive JSON file.

This script reads:
- Test results from scripts/output/spoiler-minimal/test-results.json
- Spreadsheet mapping from scripts/data/apworld-spreadsheet-mapping.json
- APWorld metadata from custom_worlds/ and custom_worlds_disabled/

And produces a combined JSON file with all available information about each apworld.

Usage:
    python scripts/combine_apworld_data.py
    python scripts/combine_apworld_data.py --output path/to/output.json
    python scripts/combine_apworld_data.py --test-results path/to/test-results.json
"""

import argparse
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
OUTPUT_DIR = SCRIPT_DIR / "output"

DEFAULT_TEST_RESULTS = OUTPUT_DIR / "spoiler-minimal" / "test-results.json"
DEFAULT_MAPPING = DATA_DIR / "apworld-spreadsheet-mapping.json"
DEFAULT_OUTPUT = DATA_DIR / "apworld-combined-data.json"


def load_json(path):
    """Load a JSON file, return None if not found."""
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def get_apworld_metadata(apworld_path):
    """Extract metadata from an apworld file."""
    if not apworld_path.exists():
        return None

    metadata = {
        "filename": apworld_path.name,
        "size_bytes": apworld_path.stat().st_size,
        "location": str(apworld_path.parent.name),
    }

    try:
        with zipfile.ZipFile(apworld_path) as zf:
            for name in zf.namelist():
                if name.endswith('archipelago.json'):
                    data = json.loads(zf.read(name))
                    metadata["manifest"] = data
                    metadata["game"] = data.get("game")
                    metadata["world_version"] = data.get("world_version")
                    metadata["minimum_ap_version"] = data.get("minimum_ap_version")
                    metadata["maximum_ap_version"] = data.get("maximum_ap_version")
                    break
    except Exception as e:
        metadata["error"] = str(e)

    return metadata


def find_apworld(apworld_id, custom_worlds, disabled_dir):
    """Find an apworld file in either directory."""
    for directory in [custom_worlds, disabled_dir]:
        path = directory / f"{apworld_id}.apworld"
        if path.exists():
            return path
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Combine all APWorld information into a single JSON file"
    )
    parser.add_argument(
        "--test-results",
        type=Path,
        default=DEFAULT_TEST_RESULTS,
        help="Path to test results JSON"
    )
    parser.add_argument(
        "--mapping",
        type=Path,
        default=DEFAULT_MAPPING,
        help="Path to spreadsheet mapping JSON"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output path for combined JSON"
    )
    parser.add_argument(
        "--custom-worlds",
        type=Path,
        default=Path("custom_worlds"),
        help="Path to custom_worlds directory"
    )
    parser.add_argument(
        "--disabled-dir",
        type=Path,
        default=Path("custom_worlds_disabled"),
        help="Path to disabled apworlds directory"
    )
    args = parser.parse_args()

    # Load data sources
    test_results = load_json(args.test_results)
    mapping = load_json(args.mapping)

    if not mapping:
        print(f"Error: Mapping file not found: {args.mapping}")
        return 1

    # Build combined data keyed by apworld_id
    combined = {}

    # Process matched entries from mapping
    for game_name, info in mapping.get("matched", {}).items():
        apworld_id = info["apworld_id"]

        if apworld_id not in combined:
            combined[apworld_id] = {
                "apworld_id": apworld_id,
                "spreadsheet": None,
                "test_results": None,
                "apworld_metadata": None,
                "enabled": False,
            }

        combined[apworld_id]["spreadsheet"] = {
            "game_name": game_name,
            "status": info["status"],
            "apworld_filename": info["apworld_filename"],
            "apworld_game": info.get("apworld_game"),
            "match_method": info["match_method"],
        }

    # Process test results
    if test_results and "results" in test_results:
        for template_filename, result in test_results["results"].items():
            # Get apworld_id from world_info
            world_info = result.get("world_info", {})
            apworld_id = world_info.get("world_directory")

            if not apworld_id:
                continue

            if apworld_id not in combined:
                combined[apworld_id] = {
                    "apworld_id": apworld_id,
                    "spreadsheet": None,
                    "test_results": None,
                    "apworld_metadata": None,
                    "enabled": False,
                }

            # Extract relevant test result fields
            combined[apworld_id]["test_results"] = {
                "template_filename": template_filename,
                "game_name": result.get("game_name_from_yaml"),
                "seed": result.get("seed"),
                "seed_id": result.get("seed_id"),
                "timestamp": result.get("timestamp"),
                "generation": {
                    "success": result.get("generation", {}).get("success"),
                    "processing_time_seconds": result.get("generation", {}).get("processing_time_seconds"),
                    "error_count": result.get("generation", {}).get("error_count"),
                    "error_type": result.get("generation", {}).get("error_type"),
                },
                "spoiler_test": {
                    "success": result.get("spoiler_test", {}).get("success"),
                    "pass_fail": result.get("spoiler_test", {}).get("pass_fail"),
                    "processing_time_seconds": result.get("spoiler_test", {}).get("processing_time_seconds"),
                    "sphere_reached": result.get("spoiler_test", {}).get("sphere_reached"),
                    "total_spheres": result.get("spoiler_test", {}).get("total_spheres"),
                    "error_count": result.get("spoiler_test", {}).get("error_count"),
                },
                "rules_file": result.get("rules_file"),
            }

    # Add apworld metadata and check enabled status
    for apworld_id, data in combined.items():
        apworld_path = find_apworld(apworld_id, args.custom_worlds, args.disabled_dir)

        if apworld_path:
            data["apworld_metadata"] = get_apworld_metadata(apworld_path)
            data["enabled"] = apworld_path.parent.name == "custom_worlds"

    # Also scan for apworlds not in mapping or test results
    all_dirs = [args.custom_worlds, args.disabled_dir]
    for directory in all_dirs:
        if not directory.exists():
            continue
        for apworld_path in directory.glob("*.apworld"):
            apworld_id = apworld_path.stem.lower()
            if apworld_id not in combined:
                combined[apworld_id] = {
                    "apworld_id": apworld_id,
                    "spreadsheet": None,
                    "test_results": None,
                    "apworld_metadata": get_apworld_metadata(apworld_path),
                    "enabled": directory.name == "custom_worlds",
                }

    # Create summary statistics
    stats = {
        "total_apworlds": len(combined),
        "enabled": sum(1 for d in combined.values() if d["enabled"]),
        "disabled": sum(1 for d in combined.values() if not d["enabled"]),
        "with_spreadsheet_data": sum(1 for d in combined.values() if d["spreadsheet"]),
        "with_test_results": sum(1 for d in combined.values() if d["test_results"]),
        "by_status": {},
        "by_test_result": {
            "generation_success": 0,
            "generation_failed": 0,
            "spoiler_passed": 0,
            "spoiler_failed": 0,
            "not_tested": 0,
        },
    }

    for data in combined.values():
        # Count by status
        if data["spreadsheet"]:
            status = data["spreadsheet"]["status"]
            stats["by_status"][status] = stats["by_status"].get(status, 0) + 1

        # Count by test result
        if data["test_results"]:
            gen = data["test_results"]["generation"]
            spoiler = data["test_results"]["spoiler_test"]

            if gen and gen.get("success"):
                stats["by_test_result"]["generation_success"] += 1
            elif gen:
                stats["by_test_result"]["generation_failed"] += 1

            if spoiler and spoiler.get("pass_fail") == "passed":
                stats["by_test_result"]["spoiler_passed"] += 1
            elif spoiler:
                stats["by_test_result"]["spoiler_failed"] += 1
        else:
            stats["by_test_result"]["not_tested"] += 1

    # Build output - use relative paths for sources
    def to_relative_path(path):
        """Convert path to relative if possible."""
        try:
            return str(Path(path).relative_to(Path.cwd()))
        except ValueError:
            return str(path)

    output = {
        "metadata": {
            "created": datetime.now(timezone.utc).isoformat(),
            "sources": {
                "test_results": to_relative_path(args.test_results) if test_results else None,
                "mapping": to_relative_path(args.mapping),
            },
        },
        "statistics": stats,
        "apworlds": dict(sorted(combined.items())),
    }

    # Ensure output directory exists
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Write output
    with open(args.output, "w") as f:
        json.dump(output, f, indent=2)

    print(f"Combined data written to: {args.output}")
    print(f"\nStatistics:")
    print(f"  Total APWorlds: {stats['total_apworlds']}")
    print(f"  Enabled: {stats['enabled']}")
    print(f"  Disabled: {stats['disabled']}")
    print(f"  With spreadsheet data: {stats['with_spreadsheet_data']}")
    print(f"  With test results: {stats['with_test_results']}")
    print(f"\n  By status:")
    for status, count in sorted(stats["by_status"].items()):
        print(f"    {status}: {count}")
    print(f"\n  By test result:")
    for result, count in stats["by_test_result"].items():
        print(f"    {result}: {count}")

    return 0


if __name__ == "__main__":
    exit(main())
