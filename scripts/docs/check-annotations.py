#!/usr/bin/env python3
"""
Check Annotations Coverage

Checks that all diff items (new directories, new files in existing directories,
changed files, deleted files, deleted directories) have corresponding entries
in file-annotations.json.

Reports missing annotations (items in diff but not in annotations) and stale
annotations (entries in annotations that no longer match any diff item).

Exit code:
    0 - All diff items have annotations (stale entries produce warnings only)
    1 - One or more diff items are missing annotations

Usage:
    python scripts/docs/check-annotations.py
    python scripts/docs/check-annotations.py --upstream-commit 0de09cd7
    python scripts/docs/check-annotations.py --annotations-file path/to/annotations.json
"""

import argparse
import importlib.util
import sys
from pathlib import Path


def _import_diff_lists_module():
    """Import generate-file-diff-lists.py (hyphenated name requires importlib)."""
    module_path = Path(__file__).parent / "generate-file-diff-lists.py"
    spec = importlib.util.spec_from_file_location("generate_file_diff_lists", module_path)
    if spec is None or spec.loader is None:
        print(f"Error: could not load {module_path}", file=sys.stderr)
        sys.exit(1)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_diff = _import_diff_lists_module()

get_project_root = _diff.get_project_root
resolve_upstream_commit = _diff.resolve_upstream_commit
get_upstream_dirs = _diff.get_upstream_dirs
get_upstream_files = _diff.get_upstream_files
get_diff_files = _diff.get_diff_files
classify_added_files = _diff.classify_added_files
classify_deleted_files = _diff.classify_deleted_files
format_worldgen_summary = _diff.format_worldgen_summary
load_annotations = _diff.load_annotations
get_annotation = _diff.get_annotation
DEFAULT_ANNOTATIONS_FILE = _diff.DEFAULT_ANNOTATIONS_FILE


def collect_diff_keys(commit: str) -> dict[str, list[str]]:
    """Collect all diff items grouped by category.

    Returns a dict mapping category name -> list of annotation keys.
    Auto-generated worldgen directories (worlds/*_worldgen/) are excluded.
    """
    upstream_dirs = get_upstream_dirs(commit)
    upstream_files = get_upstream_files(commit)

    added_files = get_diff_files(commit, "A")
    modified_files = get_diff_files(commit, "M")
    deleted_files = get_diff_files(commit, "D")

    new_dirs_files, new_files_in_existing = classify_added_files(added_files, upstream_dirs)
    deleted_dirs_files, deleted_individual = classify_deleted_files(deleted_files, upstream_files)

    # Separate worldgen dirs (these are not individually annotated)
    _, remaining_new_dirs = format_worldgen_summary(new_dirs_files)

    keys = {}
    keys["New directories"] = sorted(remaining_new_dirs.keys())
    keys["New files in existing dirs"] = sorted(new_files_in_existing)
    keys["Changed files"] = sorted(modified_files)
    keys["Deleted files"] = sorted(deleted_individual)
    keys["Deleted directories"] = sorted(deleted_dirs_files.keys())

    return keys


def check_missing(
    diff_keys: dict[str, list[str]],
    annotations: dict,
) -> dict[str, list[str]]:
    """Find diff items that have no annotation entry.

    Returns a dict mapping category name -> list of missing keys.
    """
    missing = {}
    for category, keys in diff_keys.items():
        missing_in_cat = []
        for key in keys:
            if get_annotation(annotations, key) is None:
                missing_in_cat.append(key)
        if missing_in_cat:
            missing[category] = missing_in_cat
    return missing


def check_stale(
    diff_keys: dict[str, list[str]],
    annotations: dict,
) -> list[str]:
    """Find annotation entries that don't match any current diff item.

    Returns a list of stale annotation keys.
    """
    # Build the full set of diff keys (with and without trailing slash variants)
    all_diff_keys: set[str] = set()
    for keys in diff_keys.values():
        for key in keys:
            all_diff_keys.add(key)
            if not key.endswith("/"):
                all_diff_keys.add(key + "/")
            else:
                all_diff_keys.add(key.rstrip("/"))

    stale = []
    for ann_key in sorted(annotations.keys()):
        if ann_key.startswith("_"):
            continue
        if ann_key not in all_diff_keys:
            stale.append(ann_key)
    return stale


def main():
    parser = argparse.ArgumentParser(
        description="Check that all diff items have annotations in file-annotations.json."
    )
    parser.add_argument(
        "--upstream-commit",
        help="Specific upstream commit to compare against (default: latest main)",
    )
    parser.add_argument(
        "--annotations-file",
        default=DEFAULT_ANNOTATIONS_FILE,
        help=f"Path to annotations JSON file (default: {DEFAULT_ANNOTATIONS_FILE})",
    )
    args = parser.parse_args()

    project_root = get_project_root()
    annotations_path = project_root / args.annotations_file

    commit = resolve_upstream_commit(args.upstream_commit)
    commit_short = commit[:8]
    print(f"Comparing against upstream commit: {commit_short}")

    diff_keys = collect_diff_keys(commit)

    total_items = sum(len(v) for v in diff_keys.values())
    print(f"\nDiff items by category:")
    for category, keys in diff_keys.items():
        print(f"  {category}: {len(keys)}")
    print(f"  Total: {total_items}")

    annotations = load_annotations(annotations_path)
    ann_count = len([k for k in annotations if not k.startswith("_")])
    print(f"\nAnnotation entries: {ann_count}")

    missing = check_missing(diff_keys, annotations)
    total_missing = sum(len(v) for v in missing.values())

    stale = check_stale(diff_keys, annotations)

    print()
    if missing:
        print("=" * 60)
        print("MISSING ANNOTATIONS")
        print("=" * 60)
        for category, keys in missing.items():
            print(f"\n  {category} ({len(keys)} missing):")
            for key in keys:
                print(f"    - {key}")
        print(f"\n  Total missing: {total_missing}")

    if stale:
        print()
        print("=" * 60)
        print("STALE ANNOTATIONS (no longer in diff)")
        print("=" * 60)
        for key in stale:
            print(f"    - {key}")
        print(f"\n  Total stale: {len(stale)}")

    print()
    if not missing and not stale:
        print("All diff items have annotations and no stale entries found.")
        sys.exit(0)
    elif not missing:
        print(f"All diff items have annotations. {len(stale)} stale entries found (warning only).")
        sys.exit(0)
    else:
        print(f"{total_missing} diff items are missing annotations!")
        if stale:
            print(f"{len(stale)} stale entries found.")
        print("Add the missing entries to file-annotations.json.")
        sys.exit(1)


if __name__ == "__main__":
    main()
