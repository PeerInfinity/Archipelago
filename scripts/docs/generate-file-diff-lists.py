#!/usr/bin/env python3
"""
Generate File Diff Lists

Generates categorized markdown files listing differences between this fork
and upstream Archipelago, organized into five categories:
  - new-directories.md         — directories in fork but not upstream
  - new-files-in-existing-dirs.md — files added to dirs that exist upstream
  - changed-files.md           — files modified from upstream versions
  - deleted-files.md           — files removed from upstream dirs that still exist
  - deleted-directories.md     — directories entirely removed from upstream

Also generates annotated versions (*-annotated.md) with descriptions and links
from file-annotations.json.

Usage:
    python scripts/docs/generate-file-diff-lists.py
    python scripts/docs/generate-file-diff-lists.py --upstream-commit 0de09cd7
    python scripts/docs/generate-file-diff-lists.py --output-dir path/to/output
    python scripts/docs/generate-file-diff-lists.py --dry-run
"""

import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

UPSTREAM_URL = "https://github.com/ArchipelagoMW/Archipelago.git"
DEFAULT_OUTPUT_DIR = "docs/json/developer/diffs/file-lists"
DEFAULT_ANNOTATIONS_FILE = "docs/json/developer/diffs/file-annotations.json"
UPSTREAM_REMOTE = "upstream"


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def run_git(*args: str) -> str:
    """Run a git command and return stdout."""
    result = subprocess.run(
        ["git", *args],
        capture_output=True, text=True,
        cwd=get_project_root(),
    )
    if result.returncode != 0:
        print(f"Error running git {' '.join(args)}:", file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    return result.stdout.strip()


def find_upstream_remote() -> str:
    """Find a local remote pointing to upstream Archipelago, or None."""
    remotes = run_git("remote", "-v")
    for line in remotes.splitlines():
        parts = line.split()
        if len(parts) >= 2 and "ArchipelagoMW/Archipelago" in parts[1] and "(fetch)" in line:
            return parts[0]
    return ""


def resolve_upstream_commit(commit: str | None) -> str:
    """Resolve the upstream commit to use for comparison."""
    remote = find_upstream_remote()
    if not remote:
        print(f"No local remote for {UPSTREAM_URL} found.", file=sys.stderr)
        print("Add one with: git remote add upstream " + UPSTREAM_URL, file=sys.stderr)
        sys.exit(1)

    if commit:
        return commit

    # Use the latest commit on the remote's main branch
    return run_git("rev-parse", f"{remote}/main")


def get_upstream_dirs(commit: str) -> set[str]:
    """Get all directories that exist in the upstream commit."""
    output = run_git("ls-tree", "-r", "--name-only", commit)
    dirs = set()
    for filepath in output.splitlines():
        parts = Path(filepath).parts
        # Add every directory level
        for i in range(1, len(parts)):
            dirs.add(str(Path(*parts[:i])))
    return dirs


def get_upstream_files(commit: str) -> set[str]:
    """Get all files that exist in the upstream commit."""
    output = run_git("ls-tree", "-r", "--name-only", commit)
    return set(output.splitlines())


def get_diff_files(commit: str, diff_filter: str) -> list[str]:
    """Get files matching a diff filter (A=added, M=modified, D=deleted)."""
    output = run_git("diff", "--name-only", f"--diff-filter={diff_filter}", commit, "HEAD")
    return [f for f in output.splitlines() if f]


def classify_added_files(
    added_files: list[str], upstream_dirs: set[str]
) -> tuple[dict[str, list[str]], list[str]]:
    """Classify added files into new-directory vs new-file-in-existing-dir.

    Returns:
        (new_dirs_files, new_files_in_existing) where new_dirs_files maps
        top-level new directory -> list of files, and new_files_in_existing
        is files added to directories that existed upstream.
    """
    new_dirs_files: dict[str, list[str]] = defaultdict(list)
    new_files_in_existing: list[str] = []

    for filepath in sorted(added_files):
        parts = Path(filepath).parts
        if len(parts) == 1:
            # Root-level file
            new_files_in_existing.append(filepath)
            continue

        # Find the highest-level directory that doesn't exist in upstream
        new_dir = None
        for i in range(1, len(parts)):
            dir_path = str(Path(*parts[:i]))
            if dir_path not in upstream_dirs:
                new_dir = dir_path
                break

        if new_dir:
            new_dirs_files[new_dir].append(filepath)
        else:
            new_files_in_existing.append(filepath)

    return new_dirs_files, new_files_in_existing


def classify_deleted_files(
    deleted_files: list[str], upstream_files: set[str]
) -> tuple[dict[str, list[str]], list[str]]:
    """Classify deleted files into deleted-directory vs deleted-file.

    A directory is "deleted" if it existed upstream and ALL its files are gone.

    Returns:
        (deleted_dirs_files, deleted_individual) where deleted_dirs_files maps
        deleted directory -> list of files, and deleted_individual is files
        removed from directories that still have other files.
    """
    deleted_set = set(deleted_files)

    # Find directories where ALL upstream files are deleted
    dir_file_counts: dict[str, int] = defaultdict(int)
    dir_deleted_counts: dict[str, int] = defaultdict(int)

    for filepath in upstream_files:
        parts = Path(filepath).parts
        for i in range(1, len(parts)):
            dir_path = str(Path(*parts[:i]))
            dir_file_counts[dir_path] += 1
            if filepath in deleted_set:
                dir_deleted_counts[dir_path] += 1

    # A directory is fully deleted if all its files were deleted
    fully_deleted_dirs = set()
    for dir_path in sorted(dir_file_counts.keys()):
        if dir_file_counts[dir_path] == dir_deleted_counts.get(dir_path, 0):
            fully_deleted_dirs.add(dir_path)

    # Remove subdirectories of already-deleted parent directories
    top_deleted_dirs = set()
    for dir_path in sorted(fully_deleted_dirs):
        parts = Path(dir_path).parts
        parent_deleted = False
        for i in range(1, len(parts)):
            if str(Path(*parts[:i])) in top_deleted_dirs:
                parent_deleted = True
                break
        if not parent_deleted:
            top_deleted_dirs.add(dir_path)

    deleted_dirs_files: dict[str, list[str]] = defaultdict(list)
    deleted_individual: list[str] = []

    for filepath in sorted(deleted_files):
        parts = Path(filepath).parts
        matched_dir = None
        for i in range(1, len(parts)):
            dir_path = str(Path(*parts[:i]))
            if dir_path in top_deleted_dirs:
                matched_dir = dir_path
                break
        if matched_dir:
            deleted_dirs_files[matched_dir].append(filepath)
        else:
            deleted_individual.append(filepath)

    return deleted_dirs_files, deleted_individual


def format_worldgen_summary(dirs_files: dict[str, list[str]]) -> tuple[list[str], dict[str, list[str]]]:
    """Separate worldgen directories for summary treatment.

    Returns:
        (worldgen_dirs, remaining_dirs_files)
    """
    worldgen_dirs = []
    remaining: dict[str, list[str]] = {}

    for dir_path, files in sorted(dirs_files.items()):
        if dir_path.startswith("worlds/") and dir_path.endswith("_worldgen"):
            worldgen_dirs.append((dir_path, len(files)))
        else:
            remaining[dir_path] = files

    return worldgen_dirs, remaining


# ---------------------------------------------------------------------------
# Annotations
# ---------------------------------------------------------------------------

def load_annotations(annotations_path: Path) -> dict:
    """Load file annotations from JSON, returning the entries dict.

    Returns an empty dict if the file doesn't exist or is invalid.
    """
    if not annotations_path.exists():
        print(f"  Annotations file not found: {annotations_path}", file=sys.stderr)
        return {}
    try:
        with open(annotations_path) as f:
            data = json.load(f)
        return data.get("entries", {})
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  Warning: could not load annotations: {e}", file=sys.stderr)
        return {}


def get_annotation(annotations: dict, key: str) -> dict | None:
    """Look up an annotation entry by key.

    Tries the key as-is, then with/without trailing slash for directories.
    Returns None if not found.
    """
    if key in annotations:
        return annotations[key]
    # Try with trailing slash (directory convention)
    if not key.endswith("/") and key + "/" in annotations:
        return annotations[key + "/"]
    # Try without trailing slash
    if key.endswith("/") and key.rstrip("/") in annotations:
        return annotations[key.rstrip("/")]
    return None


def format_annotation_lines(
    annotation: dict | None, output_dir: Path, indent: str = "  "
) -> list[str]:
    """Format an annotation entry into markdown lines.

    Returns empty list if annotation is None or has no content.
    Each content line is preceded by a blank line so that markdown
    renderers treat them as separate paragraphs within the list item.
    """
    if not annotation:
        return []

    lines = []
    desc = annotation.get("description", "")
    links = annotation.get("links", [])

    if desc:
        lines.append("")
        lines.append(f"{indent}{desc}")

    if links:
        project_root = get_project_root()
        link_parts = []
        for link in links:
            title = link.get("title", "")
            path = link.get("path", "")
            if title and path:
                # Compute relative path from output directory to the target
                rel_path = os.path.relpath(project_root / path, output_dir)
                link_parts.append(f"[{title}]({rel_path})")
        if link_parts:
            lines.append("")
            lines.append(f"{indent}{' | '.join(link_parts)}")

    return lines


# ---------------------------------------------------------------------------
# Plain output writers (unchanged from original)
# ---------------------------------------------------------------------------

def write_new_directories(
    output_dir: Path,
    dirs_files: dict[str, list[str]],
    upstream_commit_short: str,
) -> str:
    """Write new-directories.md."""
    worldgen_dirs, remaining = format_worldgen_summary(dirs_files)

    lines = [
        "# New Directories",
        "",
        f"Directories in this fork that do not exist in upstream commit `{upstream_commit_short}`.",
        "",
    ]

    if remaining:
        lines.append(f"## Project Directories ({len(remaining)})")
        lines.append("")
        for dir_path in sorted(remaining.keys()):
            files = remaining[dir_path]
            lines.append(f"- **`{dir_path}/`** ({len(files)} files)")
        lines.append("")

    if worldgen_dirs:
        lines.append(f"## Auto-Generated World Directories ({len(worldgen_dirs)})")
        lines.append("")
        lines.append("These directories are generated by the World Generator from JSON rules files.")
        lines.append("")
        lines.append("<details>")
        lines.append(f"<summary>Show {len(worldgen_dirs)} worldgen directories</summary>")
        lines.append("")
        for dir_path, count in sorted(worldgen_dirs):
            lines.append(f"- `{dir_path}/` ({count} files)")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    total_dirs = len(remaining) + len(worldgen_dirs)
    total_files = sum(len(f) for f in dirs_files.values())
    lines.append("---")
    lines.append("")
    lines.append(f"**Total:** {total_dirs} new directories containing {total_files} files")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / "new-directories.md"
    filepath.write_text(content)
    return content


def write_file_list_plain(
    output_dir: Path,
    filename: str,
    title: str,
    subtitle: str,
    files: list[str],
    empty_message: str | None = None,
) -> str:
    """Write a plain file list grouped by directory using code blocks."""
    lines = [f"# {title}", "", subtitle, ""]

    if not files and empty_message:
        lines.append(empty_message)
        lines.append("")
    else:
        by_dir: dict[str, list[str]] = defaultdict(list)
        for filepath in sorted(files):
            dir_path = str(Path(filepath).parent) if "/" in filepath else "(root)"
            by_dir[dir_path].append(filepath)

        for dir_path in sorted(by_dir.keys()):
            dir_files = by_dir[dir_path]
            if dir_path == "(root)":
                lines.append(f"## Root Directory ({len(dir_files)} files)")
            else:
                lines.append(f"## `{dir_path}/` ({len(dir_files)} files)")
            lines.append("")
            lines.append("```")
            for f in sorted(dir_files):
                lines.append(f)
            lines.append("```")
            lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"**Total:** {len(files)} {title.lower()}")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / filename
    filepath.write_text(content)
    return content


def write_deleted_directories(
    output_dir: Path,
    dirs_files: dict[str, list[str]],
    upstream_commit_short: str,
) -> str:
    """Write deleted-directories.md."""
    lines = [
        "# Deleted Directories",
        "",
        f"Directories that existed in upstream commit `{upstream_commit_short}` but have been entirely removed.",
        "",
    ]

    if not dirs_files:
        lines.append("No upstream directories have been entirely removed.")
        lines.append("")
    else:
        for dir_path in sorted(dirs_files.keys()):
            files = dirs_files[dir_path]
            lines.append(f"- **`{dir_path}/`** ({len(files)} files removed)")
        lines.append("")

    lines.append("---")
    lines.append("")
    total_files = sum(len(f) for f in dirs_files.values())
    lines.append(f"**Total:** {len(dirs_files)} deleted directories ({total_files} files)")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / "deleted-directories.md"
    filepath.write_text(content)
    return content


# ---------------------------------------------------------------------------
# Annotated output writers
# ---------------------------------------------------------------------------

def write_new_directories_annotated(
    output_dir: Path,
    dirs_files: dict[str, list[str]],
    upstream_commit_short: str,
    annotations: dict,
) -> str:
    """Write new-directories-annotated.md with descriptions and links."""
    worldgen_dirs, remaining = format_worldgen_summary(dirs_files)

    lines = [
        "# New Directories (Annotated)",
        "",
        f"Directories in this fork that do not exist in upstream commit `{upstream_commit_short}`.",
        "",
    ]

    if remaining:
        lines.append(f"## Project Directories ({len(remaining)})")
        for dir_path in sorted(remaining.keys()):
            files = remaining[dir_path]
            lines.append("")
            lines.append(f"- **`{dir_path}/`** ({len(files)} files)")
            ann = get_annotation(annotations, dir_path)
            for ann_line in format_annotation_lines(ann, output_dir):
                lines.append(ann_line)
        lines.append("")

    if worldgen_dirs:
        lines.append(f"## Auto-Generated World Directories ({len(worldgen_dirs)})")
        lines.append("")
        lines.append("These directories are generated by the World Generator from JSON rules files.")
        lines.append("")
        lines.append("<details>")
        lines.append(f"<summary>Show {len(worldgen_dirs)} worldgen directories</summary>")
        lines.append("")
        for dir_path, count in sorted(worldgen_dirs):
            lines.append(f"- `{dir_path}/` ({count} files)")
        lines.append("")
        lines.append("</details>")
        lines.append("")

    total_dirs = len(remaining) + len(worldgen_dirs)
    total_files = sum(len(f) for f in dirs_files.values())
    lines.append("---")
    lines.append("")
    lines.append(f"**Total:** {total_dirs} new directories containing {total_files} files")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / "new-directories-annotated.md"
    filepath.write_text(content)
    return content


def write_file_list_annotated(
    output_dir: Path,
    filename: str,
    title: str,
    subtitle: str,
    files: list[str],
    annotations: dict,
    empty_message: str | None = None,
) -> str:
    """Write an annotated file list using bullet points with descriptions and links."""
    lines = [f"# {title} (Annotated)", "", subtitle, ""]

    if not files and empty_message:
        lines.append(empty_message)
        lines.append("")
    else:
        by_dir: dict[str, list[str]] = defaultdict(list)
        for filepath in sorted(files):
            dir_path = str(Path(filepath).parent) if "/" in filepath else "(root)"
            by_dir[dir_path].append(filepath)

        for dir_path in sorted(by_dir.keys()):
            dir_files = by_dir[dir_path]
            if dir_path == "(root)":
                lines.append(f"## Root Directory ({len(dir_files)} files)")
            else:
                lines.append(f"## `{dir_path}/` ({len(dir_files)} files)")
            for f in sorted(dir_files):
                ann = get_annotation(annotations, f)
                lines.append("")
                lines.append(f"- `{f}`")
                for ann_line in format_annotation_lines(ann, output_dir):
                    lines.append(ann_line)
            lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"**Total:** {len(files)} {title.lower()}")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / filename
    filepath.write_text(content)
    return content


def write_deleted_directories_annotated(
    output_dir: Path,
    dirs_files: dict[str, list[str]],
    upstream_commit_short: str,
    annotations: dict,
) -> str:
    """Write deleted-directories-annotated.md with descriptions and links."""
    lines = [
        "# Deleted Directories (Annotated)",
        "",
        f"Directories that existed in upstream commit `{upstream_commit_short}` but have been entirely removed.",
        "",
    ]

    if not dirs_files:
        lines.append("No upstream directories have been entirely removed.")
        lines.append("")
    else:
        for dir_path in sorted(dirs_files.keys()):
            files = dirs_files[dir_path]
            lines.append("")
            lines.append(f"- **`{dir_path}/`** ({len(files)} files removed)")
            ann = get_annotation(annotations, dir_path)
            for ann_line in format_annotation_lines(ann, output_dir):
                lines.append(ann_line)
        lines.append("")

    lines.append("---")
    lines.append("")
    total_files = sum(len(f) for f in dirs_files.values())
    lines.append(f"**Total:** {len(dirs_files)} deleted directories ({total_files} files)")
    lines.append("")

    content = "\n".join(lines)
    filepath = output_dir / "deleted-directories-annotated.md"
    filepath.write_text(content)
    return content


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate categorized file diff lists comparing fork against upstream Archipelago."
    )
    parser.add_argument(
        "--upstream-commit",
        help="Specific upstream commit to compare against (default: latest main)",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for generated files (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--annotations-file",
        default=DEFAULT_ANNOTATIONS_FILE,
        help=f"Path to annotations JSON file (default: {DEFAULT_ANNOTATIONS_FILE})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without writing files",
    )
    args = parser.parse_args()

    project_root = get_project_root()
    output_dir = project_root / args.output_dir
    annotations_path = project_root / args.annotations_file

    # Resolve upstream commit
    commit = resolve_upstream_commit(args.upstream_commit)
    commit_short = commit[:8]
    print(f"Comparing against upstream commit: {commit_short}")

    # Gather data
    upstream_dirs = get_upstream_dirs(commit)
    upstream_files = get_upstream_files(commit)

    added_files = get_diff_files(commit, "A")
    modified_files = get_diff_files(commit, "M")
    deleted_files = get_diff_files(commit, "D")

    print(f"  Added files:    {len(added_files)}")
    print(f"  Modified files: {len(modified_files)}")
    print(f"  Deleted files:  {len(deleted_files)}")

    # Classify
    new_dirs_files, new_files_in_existing = classify_added_files(added_files, upstream_dirs)
    deleted_dirs_files, deleted_individual = classify_deleted_files(deleted_files, upstream_files)

    print(f"\nClassification:")
    print(f"  New directories:              {len(new_dirs_files)}")
    print(f"  New files in existing dirs:   {len(new_files_in_existing)}")
    print(f"  Changed files:                {len(modified_files)}")
    print(f"  Deleted files (individual):   {len(deleted_individual)}")
    print(f"  Deleted directories:          {len(deleted_dirs_files)}")

    # Load annotations
    annotations = load_annotations(annotations_path)
    if annotations:
        print(f"\nLoaded {len(annotations)} annotation entries from {args.annotations_file}")
    else:
        print(f"\nNo annotations loaded (annotated files will have no extra information)")

    if args.dry_run:
        print("\nDry run - no files written.")
        return

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- Plain output (unchanged from original) ---

    write_new_directories(output_dir, new_dirs_files, commit_short)

    write_file_list_plain(
        output_dir, "new-files-in-existing-dirs.md",
        "New Files in Existing Directories",
        f"Files added to directories that already existed in upstream commit `{commit_short}`.",
        new_files_in_existing,
    )
    write_file_list_plain(
        output_dir, "changed-files.md",
        "Changed Files",
        f"Files modified from their upstream versions (commit `{commit_short}`).",
        modified_files,
    )
    write_file_list_plain(
        output_dir, "deleted-files.md",
        "Deleted Files",
        f"Files removed from directories that still exist (upstream commit `{commit_short}`).",
        deleted_individual,
        empty_message="No individual files have been deleted from existing directories.",
    )
    write_deleted_directories(output_dir, deleted_dirs_files, commit_short)

    # --- Annotated output ---

    write_new_directories_annotated(output_dir, new_dirs_files, commit_short, annotations)

    write_file_list_annotated(
        output_dir, "new-files-in-existing-dirs-annotated.md",
        "New Files in Existing Directories",
        f"Files added to directories that already existed in upstream commit `{commit_short}`.",
        new_files_in_existing,
        annotations,
    )
    write_file_list_annotated(
        output_dir, "changed-files-annotated.md",
        "Changed Files",
        f"Files modified from their upstream versions (commit `{commit_short}`).",
        modified_files,
        annotations,
    )
    write_file_list_annotated(
        output_dir, "deleted-files-annotated.md",
        "Deleted Files",
        f"Files removed from directories that still exist (upstream commit `{commit_short}`).",
        deleted_individual,
        annotations,
        empty_message="No individual files have been deleted from existing directories.",
    )
    write_deleted_directories_annotated(output_dir, deleted_dirs_files, commit_short, annotations)

    # --- Summary ---

    plain_files = [
        "new-directories.md", "new-files-in-existing-dirs.md", "changed-files.md",
        "deleted-files.md", "deleted-directories.md",
    ]
    annotated_files = [
        "new-directories-annotated.md", "new-files-in-existing-dirs-annotated.md",
        "changed-files-annotated.md", "deleted-files-annotated.md",
        "deleted-directories-annotated.md",
    ]

    print(f"\nGenerated 10 files in {output_dir}/")
    print(f"\n  Plain:")
    for name in plain_files:
        filepath = output_dir / name
        line_count = len(filepath.read_text().splitlines())
        print(f"    {name} ({line_count} lines)")
    print(f"\n  Annotated:")
    for name in annotated_files:
        filepath = output_dir / name
        line_count = len(filepath.read_text().splitlines())
        print(f"    {name} ({line_count} lines)")


if __name__ == "__main__":
    main()
