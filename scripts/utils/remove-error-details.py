#!/usr/bin/env python3
"""
Remove first_error_line and first_warning_line fields from test-results.json files.

This script recursively processes all test-results.json files in the scripts directory
and its subdirectories, removing the first_error_line and first_warning_line fields
from all result objects.
"""

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict


def remove_error_details_recursive(obj: Any) -> bool:
    """
    Recursively remove first_error_line and first_warning_line from a data structure.

    Args:
        obj: The object to process (dict, list, or other)

    Returns:
        True if any fields were removed, False otherwise
    """
    modified = False

    if isinstance(obj, dict):
        # Remove the fields if they exist in this dict
        if 'first_error_line' in obj:
            del obj['first_error_line']
            modified = True
        if 'first_warning_line' in obj:
            del obj['first_warning_line']
            modified = True

        # Recursively process all values in the dict
        for value in obj.values():
            if remove_error_details_recursive(value):
                modified = True

    elif isinstance(obj, list):
        # Recursively process all items in the list
        for item in obj:
            if remove_error_details_recursive(item):
                modified = True

    return modified


def process_test_results_file(file_path: Path, dry_run: bool = False) -> Dict[str, int]:
    """
    Process a single test-results.json file.

    Args:
        file_path: Path to the test-results.json file
        dry_run: If True, don't actually modify the file

    Returns:
        Dictionary with counts of removed fields
    """
    stats = {
        'files_processed': 0,
        'files_modified': 0,
        'error_lines_removed': 0,
        'warning_lines_removed': 0
    }

    try:
        # Read the file
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        stats['files_processed'] = 1

        # Count how many fields will be removed
        error_count = count_field_occurrences(data, 'first_error_line')
        warning_count = count_field_occurrences(data, 'first_warning_line')

        if error_count > 0 or warning_count > 0:
            stats['error_lines_removed'] = error_count
            stats['warning_lines_removed'] = warning_count

            if not dry_run:
                # Remove the fields
                remove_error_details_recursive(data)

                # Write back to file with same formatting
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, sort_keys=True)
                    f.write('\n')  # Add trailing newline

                stats['files_modified'] = 1
                print(f"✓ Modified: {file_path}")
                print(f"  Removed {error_count} first_error_line and {warning_count} first_warning_line fields")
            else:
                stats['files_modified'] = 1
                print(f"[DRY RUN] Would modify: {file_path}")
                print(f"  Would remove {error_count} first_error_line and {warning_count} first_warning_line fields")
        else:
            print(f"○ No changes needed: {file_path}")

    except json.JSONDecodeError as e:
        print(f"✗ Error parsing JSON in {file_path}: {e}")
    except Exception as e:
        print(f"✗ Error processing {file_path}: {e}")

    return stats


def count_field_occurrences(obj: Any, field_name: str) -> int:
    """
    Count occurrences of a field in a nested data structure.

    Args:
        obj: The object to search
        field_name: The field name to count

    Returns:
        Number of occurrences found
    """
    count = 0

    if isinstance(obj, dict):
        if field_name in obj:
            count += 1

        for value in obj.values():
            count += count_field_occurrences(value, field_name)

    elif isinstance(obj, list):
        for item in obj:
            count += count_field_occurrences(item, field_name)

    return count


def find_test_results_files(scripts_dir: Path) -> list[Path]:
    """
    Find all test-results.json files in the scripts directory and subdirectories.

    Args:
        scripts_dir: Path to the scripts directory

    Returns:
        List of paths to test-results.json files
    """
    results_files = []

    # Search for test-results.json files recursively
    for file_path in scripts_dir.rglob('test-results.json'):
        results_files.append(file_path)

    return sorted(results_files)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Remove first_error_line and first_warning_line fields from test-results.json files'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Show what would be changed without actually modifying files'
    )
    parser.add_argument(
        '--file',
        type=str,
        help='Process a specific file instead of searching for all test-results.json files'
    )

    args = parser.parse_args()

    # Determine project root (parent of scripts directory)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    scripts_dir = project_root / 'scripts'

    print("=== Remove Error Details from Test Results ===")
    print(f"Scripts directory: {scripts_dir}")

    if args.dry_run:
        print("\n[DRY RUN MODE - No files will be modified]\n")

    # Find all test-results.json files or use specified file
    if args.file:
        file_path = Path(args.file)
        if not file_path.is_absolute():
            file_path = project_root / file_path

        if not file_path.exists():
            print(f"Error: File not found: {file_path}")
            sys.exit(1)

        test_results_files = [file_path]
        print(f"\nProcessing specified file: {file_path}\n")
    else:
        test_results_files = find_test_results_files(scripts_dir)
        print(f"\nFound {len(test_results_files)} test-results.json files\n")

    if not test_results_files:
        print("No test-results.json files found.")
        sys.exit(0)

    # Process each file
    total_stats = {
        'files_processed': 0,
        'files_modified': 0,
        'error_lines_removed': 0,
        'warning_lines_removed': 0
    }

    for file_path in test_results_files:
        stats = process_test_results_file(file_path, dry_run=args.dry_run)

        # Accumulate stats
        for key in total_stats:
            total_stats[key] += stats[key]

        print()  # Blank line between files

    # Print summary
    print("=== Summary ===")
    print(f"Files processed: {total_stats['files_processed']}")
    print(f"Files modified: {total_stats['files_modified']}")
    print(f"Total first_error_line fields removed: {total_stats['error_lines_removed']}")
    print(f"Total first_warning_line fields removed: {total_stats['warning_lines_removed']}")

    if args.dry_run:
        print("\n[DRY RUN MODE - No files were actually modified]")
        print("Run without --dry-run to apply changes.")


if __name__ == '__main__':
    main()
