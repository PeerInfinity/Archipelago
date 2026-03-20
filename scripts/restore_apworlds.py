#!/usr/bin/env python3
"""
Restore APWorlds from disabled directory based on spreadsheet status.

This script moves APWorlds from custom_worlds_disabled back to custom_worlds
based on their status in the community spreadsheet (Stable, Unstable, etc.).

Usage:
    python scripts/restore_apworlds.py                    # Restore Stable only (default)
    python scripts/restore_apworlds.py --status Stable Unstable  # Restore Stable and Unstable
    python scripts/restore_apworlds.py --status all       # Restore all matched apworlds
    python scripts/restore_apworlds.py --list             # List what would be restored
    python scripts/restore_apworlds.py --dry-run          # Show what would be done
    python scripts/restore_apworlds.py --include balatro hades  # Restore specific apworlds by ID
    python scripts/restore_apworlds.py --exclude dk64     # Exclude specific apworlds
"""

import argparse
import json
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
MAPPING_FILE = DATA_DIR / "apworld-spreadsheet-mapping.json"

# Status values considered "working" by default
DEFAULT_STATUSES = ["Stable"]

# All valid status values from the spreadsheet
VALID_STATUSES = [
    "Stable",
    "Unstable",
    "In Review",
    "Merged",
    "APWorld Only",
    "Broken on Main"
]


def load_mapping():
    """Load the spreadsheet-to-apworld mapping file."""
    if not MAPPING_FILE.exists():
        print(f"Error: Mapping file not found: {MAPPING_FILE}")
        print("Run the mapping generation script first.")
        sys.exit(1)

    with open(MAPPING_FILE) as f:
        return json.load(f)


def get_apworlds_by_status(mapping, statuses):
    """Get list of apworld filenames matching given statuses."""
    result = []
    for game_name, info in mapping.get("matched", {}).items():
        if info["status"] in statuses:
            result.append({
                "game": game_name,
                "apworld_id": info["apworld_id"],
                "filename": info["apworld_filename"],
                "status": info["status"]
            })
    return sorted(result, key=lambda x: x["game"].lower())


def restore_apworlds(apworlds, custom_worlds, disabled_dir, dry_run=False, exclude=None):
    """Move apworlds from disabled back to custom_worlds."""
    exclude = set(exclude or [])
    restored = 0
    skipped = 0
    not_found = []
    excluded = []

    for apworld in apworlds:
        filename = apworld["filename"]
        apworld_id = apworld["apworld_id"]

        if apworld_id in exclude:
            excluded.append(apworld)
            continue

        src = disabled_dir / filename
        dest = custom_worlds / filename

        if not src.exists():
            not_found.append(apworld)
            continue

        if dest.exists():
            skipped += 1
            continue

        if dry_run:
            print(f"  Would restore: {filename} ({apworld['game']}) [{apworld['status']}]")
        else:
            shutil.move(str(src), str(dest))
            print(f"  Restored: {filename}")
        restored += 1

    return restored, skipped, not_found, excluded


def main():
    parser = argparse.ArgumentParser(
        description="Restore APWorlds from disabled directory based on spreadsheet status"
    )
    parser.add_argument(
        "--status",
        nargs="+",
        default=DEFAULT_STATUSES,
        help=f"Status values to restore. Valid: {', '.join(VALID_STATUSES)}, or 'all'"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List apworlds that would be restored (no changes)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--include",
        nargs="+",
        metavar="ID",
        help="Include specific apworld IDs regardless of status"
    )
    parser.add_argument(
        "--exclude",
        nargs="+",
        metavar="ID",
        help="Exclude specific apworld IDs"
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

    # Handle 'all' status
    if args.status == ["all"] or "all" in args.status:
        statuses = VALID_STATUSES
    else:
        # Validate statuses
        invalid = [s for s in args.status if s not in VALID_STATUSES]
        if invalid:
            print(f"Error: Invalid status values: {invalid}")
            print(f"Valid values: {', '.join(VALID_STATUSES)}, or 'all'")
            sys.exit(1)
        statuses = args.status

    # Load mapping
    mapping = load_mapping()

    # Get apworlds matching status
    apworlds = get_apworlds_by_status(mapping, statuses)

    # Add specific includes
    if args.include:
        include_set = set(args.include)
        for game_name, info in mapping.get("matched", {}).items():
            if info["apworld_id"] in include_set:
                # Check if already in list
                if not any(a["apworld_id"] == info["apworld_id"] for a in apworlds):
                    apworlds.append({
                        "game": game_name,
                        "apworld_id": info["apworld_id"],
                        "filename": info["apworld_filename"],
                        "status": info["status"]
                    })
        apworlds = sorted(apworlds, key=lambda x: x["game"].lower())

    print(f"Status filter: {', '.join(statuses)}")
    print(f"Found {len(apworlds)} apworlds matching criteria")

    if args.list:
        print("\nAPWorlds that would be restored:")
        by_status = {}
        for a in apworlds:
            by_status.setdefault(a["status"], []).append(a)

        for status in VALID_STATUSES:
            if status in by_status:
                print(f"\n=== {status} ({len(by_status[status])}) ===")
                for a in by_status[status]:
                    exclude_mark = " [EXCLUDED]" if args.exclude and a["apworld_id"] in args.exclude else ""
                    print(f"  {a['apworld_id']}: {a['game']}{exclude_mark}")
        return

    # Verify directories
    if not args.disabled_dir.exists():
        print(f"Error: Disabled directory not found: {args.disabled_dir}")
        sys.exit(1)

    args.custom_worlds.mkdir(exist_ok=True)

    # Restore apworlds
    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Restoring apworlds...")
    restored, skipped, not_found, excluded = restore_apworlds(
        apworlds,
        args.custom_worlds,
        args.disabled_dir,
        dry_run=args.dry_run,
        exclude=args.exclude
    )

    print(f"\nSummary:")
    print(f"  Restored: {restored}")
    print(f"  Skipped (already exists): {skipped}")
    print(f"  Excluded: {len(excluded)}")
    print(f"  Not found in disabled dir: {len(not_found)}")

    if not_found:
        print("\nNot found (may not have been downloaded):")
        for a in not_found[:10]:
            print(f"  {a['apworld_id']}: {a['game']}")
        if len(not_found) > 10:
            print(f"  ... and {len(not_found) - 10} more")


if __name__ == "__main__":
    main()
