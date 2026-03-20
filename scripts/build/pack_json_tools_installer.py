#!/usr/bin/env python3
"""
Package JSON Tools Installer into an APWorld file.

This creates a distributable .apworld that can be installed into vanilla Archipelago.

Usage:
    python scripts/build/pack_json_tools_installer.py
    python scripts/build/pack_json_tools_installer.py --output apworlds/json_tools_installer.apworld
    python scripts/build/pack_json_tools_installer.py --dry-run
"""

import argparse
import json
import os
import sys
import zipfile
from pathlib import Path


# Get project root
PROJECT_ROOT = Path(__file__).parent.parent.parent

# Source directory
SOURCE_DIR = PROJECT_ROOT / "worlds" / "json_tools_installer"

# Files/directories to exclude
EXCLUDE_PATTERNS = {
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".DS_Store",
}


def should_exclude(path: Path) -> bool:
    """Check if a path should be excluded."""
    for pattern in EXCLUDE_PATTERNS:
        if pattern.startswith("*"):
            if path.name.endswith(pattern[1:]):
                return True
        elif pattern in path.parts:
            return True
    return False


def collect_files(source_dir: Path) -> list:
    """Collect all files to include in the apworld."""
    files = []
    for path in source_dir.rglob("*"):
        if path.is_file() and not should_exclude(path):
            rel_path = path.relative_to(source_dir.parent)
            files.append((path, str(rel_path)))
    return files


def create_apworld(output_path: Path, dry_run: bool = False) -> bool:
    """Create the apworld file."""
    print(f"Creating JSON Tools Installer APWorld")
    print(f"Source: {SOURCE_DIR}")
    print(f"Output: {output_path}")
    print()

    # Check source exists
    if not SOURCE_DIR.exists():
        print(f"ERROR: Source directory not found: {SOURCE_DIR}")
        return False

    # Collect files
    files = collect_files(SOURCE_DIR)
    print(f"Files to package: {len(files)}")

    if dry_run:
        print("\n=== DRY RUN - Files that would be included ===")
        for src, dst in sorted(files, key=lambda x: x[1]):
            size = src.stat().st_size
            print(f"  {dst} ({size} bytes)")
        return True

    # Create output directory
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Create the zip
    try:
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            for src_path, archive_path in files:
                zf.write(src_path, archive_path)

        size_kb = output_path.stat().st_size / 1024
        print(f"\nCreated: {output_path} ({size_kb:.1f} KB)")
        print(f"Files: {len(files)}")
        return True

    except Exception as e:
        print(f"ERROR: Failed to create apworld: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Package JSON Tools Installer as an APWorld",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=PROJECT_ROOT / "apworlds" / "json_tools_installer.apworld",
        help="Output path (default: apworlds/json_tools_installer.apworld)",
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show what would be packaged without creating file",
    )

    args = parser.parse_args()

    success = create_apworld(args.output, args.dry_run)
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
