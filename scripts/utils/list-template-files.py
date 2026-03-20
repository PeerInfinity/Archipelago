#!/usr/bin/env python3
"""
Extract template file names from world-mapping.json, excluding WorldGen/Vanilla
entries and games in the exclude lists from template-exclude-list.json.

By default, applies only the permanent exclude_list. Use --exclude flags to
apply additional exclude lists.

Usage:
    python scripts/utils/list-template-files.py
    python scripts/utils/list-template-files.py --exclude main_test_exclude_list
    python scripts/utils/list-template-files.py --exclude main_test_exclude_list --exclude worldgen_test_exclude_list
"""

import argparse
import json
import os
import sys


def main():
    project_root = os.path.abspath(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    )

    parser = argparse.ArgumentParser(
        description='List template files from world-mapping.json, minus exclusions.'
    )
    parser.add_argument(
        '--exclude', action='append', default=[], metavar='LIST_NAME',
        help='Additional exclude list(s) to apply from template-exclude-list.json '
             '(e.g. main_test_exclude_list, worldgen_test_exclude_list). '
             'Can be specified multiple times. Exclusions are cumulative.'
    )
    parser.add_argument(
        '--world-mapping',
        default=os.path.join(project_root, 'scripts', 'data', 'world-mapping.json'),
        help='Path to world-mapping.json'
    )
    parser.add_argument(
        '--exclude-file',
        default=os.path.join(project_root, 'scripts', 'data', 'template-exclude-list.json'),
        help='Path to template-exclude-list.json'
    )
    args = parser.parse_args()

    # Load world mapping
    with open(args.world_mapping, 'r') as f:
        world_mapping = json.load(f)

    # Load exclude lists
    with open(args.exclude_file, 'r') as f:
        exclude_data = json.load(f)

    # Always apply the permanent exclude_list
    lists_to_apply = ['exclude_list'] + args.exclude

    # Validate requested exclude lists exist
    for list_name in lists_to_apply:
        if list_name not in exclude_data:
            print(f"Error: '{list_name}' not found in {args.exclude_file}", file=sys.stderr)
            print(f"Available lists: {[k for k in exclude_data if k != 'comment']}", file=sys.stderr)
            return 1

    # Build set of excluded template filenames
    excluded_files = set()
    for list_name in lists_to_apply:
        for entry in exclude_data[list_name]:
            excluded_files.add(entry['name'])

    # Filter world mapping entries
    for game_name in sorted(world_mapping):
        entry = world_mapping[game_name]
        template_file = entry.get('template_file')

        # Skip entries without a template file
        if not template_file:
            continue

        # Skip WorldGen and Vanilla variant entries
        if 'WorldGen' in game_name or 'Vanilla' in game_name:
            continue

        # Skip excluded templates
        if template_file in excluded_files:
            continue

        print(template_file)

    return 0


if __name__ == '__main__':
    sys.exit(main())
