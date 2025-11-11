#!/usr/bin/env python3
"""
Script to clean up output directories by removing all files except test-results.json
This helps keep the repository clean by removing timestamped backup files and test artifacts.
"""

import os
import sys
from pathlib import Path

# Define the output directories
DIRECTORIES = [
    "output/spoiler-minimal",
    "output/spoiler-full",
    "output/multiplayer",
    "output/multiworld",
    "output/multitemplate-minimal",
    "output/multitemplate-full"
]

# File to keep
KEEP_FILE = "test-results.json"

# Color codes for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    NC = '\033[0m'  # No Color

    @staticmethod
    def supports_color():
        """Check if terminal supports color."""
        return hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()

def colored(text, color):
    """Return colored text if terminal supports it."""
    if Colors.supports_color():
        return f"{color}{text}{Colors.NC}"
    return text

def main():
    # Get script directory
    script_dir = Path(__file__).parent.resolve()

    print("=== Cleaning Output Directories ===")
    print()

    # Track statistics
    total_removed = 0
    total_kept = 0

    # Process each directory
    for dir_name in DIRECTORIES:
        dir_path = script_dir / dir_name

        if not dir_path.exists():
            print(colored(f"⚠ Directory not found: {dir_name}", Colors.YELLOW))
            continue

        if not dir_path.is_dir():
            print(colored(f"⚠ Not a directory: {dir_name}", Colors.YELLOW))
            continue

        print(f"Processing: {dir_name}/")

        # Get all files in the directory (not subdirectories)
        files = [f for f in dir_path.iterdir() if f.is_file()]

        if not files:
            print(colored("  ✓ Directory is already empty", Colors.GREEN))
            print()
            continue

        removed_count = 0
        kept_count = 0

        for file_path in files:
            filename = file_path.name
            if filename != KEEP_FILE:
                try:
                    file_path.unlink()
                    removed_count += 1
                    print(colored(f"  ✗ Removed: {filename}", Colors.RED))
                except Exception as e:
                    print(colored(f"  ✗ Error removing {filename}: {e}", Colors.RED))
            else:
                kept_count += 1
                print(colored(f"  ✓ Kept: {filename}", Colors.GREEN))

        total_removed += removed_count
        total_kept += kept_count

        print(f"  Summary: Removed {removed_count} file(s), kept {kept_count} file(s)")
        print()

    # Print final summary
    print("=== Cleanup Complete ===")
    print(f"Total files removed: {total_removed}")
    print(f"Total files kept: {total_kept}")

if __name__ == "__main__":
    main()
