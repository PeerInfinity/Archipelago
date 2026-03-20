#!/usr/bin/env python3
"""
Find Orphaned Documentation

Finds markdown files that aren't reachable from any entry point document.
Uses a crawl-based approach starting from entry points and following links.

Usage:
    python scripts/docs/find_orphaned_docs.py                # Check for orphaned docs
    python scripts/docs/find_orphaned_docs.py --verbose      # Show link details
    python scripts/docs/find_orphaned_docs.py --json         # JSON output for CI
    python scripts/docs/find_orphaned_docs.py --threshold 5  # Fail if > 5 orphans

Entry points:
    - README.md (repository root)
    - docs/json/README.md (documentation portal)
    - CLAUDE.md (Claude instructions)

The script crawls from these entry points following markdown links to find
all reachable documents, then reports any .md files not reached.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Set, Tuple


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


def find_all_markdown_files(directory: Path) -> Set[Path]:
    """Find all markdown files in a directory recursively."""
    md_files = set()
    for md_file in directory.rglob('*.md'):
        md_files.add(md_file.resolve())
    return md_files


def extract_markdown_links(file_path: Path) -> List[str]:
    """Extract all local markdown links from a file."""
    links = []

    if not file_path.exists():
        return links

    try:
        content = file_path.read_text(encoding='utf-8')

        # Match markdown links: [text](url)
        link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

        for match in link_pattern.finditer(content):
            url = match.group(2)
            # Remove anchors (e.g., #section)
            url = url.split('#')[0]
            # Skip external URLs, empty links, and non-md links
            if url and not url.startswith(('http://', 'https://', 'mailto:')):
                links.append(url)

    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}", file=sys.stderr)

    return links


def resolve_link(source_file: Path, link: str) -> Path:
    """Resolve a relative link to an absolute path."""
    # Handle relative links
    resolved = (source_file.parent / link).resolve()
    return resolved


def crawl_from_entry_points(
    entry_points: List[Path],
    all_docs: Set[Path],
    verbose: bool = False
) -> Tuple[Set[Path], Dict[Path, List[Path]]]:
    """
    Crawl from entry points to find all reachable documents.

    Returns:
        - Set of reachable documents
        - Dict mapping each document to the documents that link to it
    """
    reachable: Set[Path] = set()
    linked_by: Dict[Path, List[Path]] = {doc: [] for doc in all_docs}
    to_visit: List[Path] = []

    # Start with entry points
    for entry in entry_points:
        if entry.exists():
            resolved = entry.resolve()
            reachable.add(resolved)
            to_visit.append(resolved)
            if verbose:
                print(f"  Entry point: {entry}")

    # Crawl following links
    visited: Set[Path] = set()
    while to_visit:
        current = to_visit.pop(0)
        if current in visited:
            continue
        visited.add(current)

        links = extract_markdown_links(current)
        for link in links:
            # Only follow .md links
            if not link.endswith('.md'):
                continue

            resolved = resolve_link(current, link)
            if resolved.exists():
                # Track who links to this document
                if resolved in linked_by:
                    linked_by[resolved].append(current)

                if resolved not in reachable:
                    reachable.add(resolved)
                    to_visit.append(resolved)

    return reachable, linked_by


def categorize_document(path: Path, root: Path) -> str:
    """Get a human-readable category for a document."""
    try:
        rel_path = str(path.relative_to(root))
    except ValueError:
        return "Other"

    if rel_path.startswith('docs/json/developer/test-results'):
        return "Test Results"
    elif rel_path.startswith('docs/json/developer/'):
        return "Developer Docs"
    elif rel_path.startswith('docs/json/modules/'):
        return "Module Docs"
    elif rel_path.startswith('docs/json/'):
        return "JSON Docs"
    elif rel_path.startswith('.github/'):
        return "GitHub"
    elif rel_path.startswith('CC/'):
        return "Claude Instructions"
    elif rel_path.startswith('scripts/'):
        return "Scripts"
    elif '/' not in rel_path:
        return "Root"
    else:
        return "Other"


def main():
    parser = argparse.ArgumentParser(
        description="Find orphaned markdown files not linked from entry points"
    )
    parser.add_argument('--verbose', '-v', action='store_true',
                        help="Show detailed link information")
    parser.add_argument('--json', action='store_true',
                        help="Output as JSON for CI")
    parser.add_argument('--threshold', type=int, default=0,
                        help="Fail if orphaned count exceeds threshold")
    parser.add_argument('--include-all', action='store_true',
                        help="Include all directories, not just docs/json")
    args = parser.parse_args()

    root = get_project_root()

    # Define entry points
    entry_points = [
        root / "README.md",
        root / "docs/json/README.md",
        root / "CLAUDE.md",
        root / ".github/workflows/README.md",
        root / "scripts/README.md",
    ]

    # Find all markdown files to check
    if args.include_all:
        # Check all markdown files in the repo
        all_docs = find_all_markdown_files(root)
        # Exclude some directories that aren't our docs
        excluded_dirs = {'node_modules', '.git', 'venv', '.venv', 'worlds'}
        all_docs = {
            doc for doc in all_docs
            if not any(excl in str(doc) for excl in excluded_dirs)
        }
    else:
        # Just check docs/json and a few other key directories
        all_docs: Set[Path] = set()
        for check_dir in [
            root / "docs/json",
            root / ".github/workflows",
            root / "CC",
            root / "scripts",
        ]:
            if check_dir.exists():
                all_docs.update(find_all_markdown_files(check_dir))

        # Also include root-level markdown files
        for md_file in root.glob("*.md"):
            all_docs.add(md_file.resolve())

    if not args.json:
        print("Finding orphaned documentation files...")
        print(f"  Checking {len(all_docs)} markdown files")
        print()
        print("Crawling from entry points...")

    # Crawl from entry points
    reachable, linked_by = crawl_from_entry_points(
        entry_points, all_docs, verbose=args.verbose
    )

    # Find orphaned files
    orphaned = all_docs - reachable

    # Exclude entry points themselves from orphan list
    # (they're reachable by definition)
    for entry in entry_points:
        if entry.exists():
            orphaned.discard(entry.resolve())

    if args.json:
        # Group by category
        by_category: Dict[str, List[str]] = {}
        for doc in orphaned:
            cat = categorize_document(doc, root)
            rel_path = str(doc.relative_to(root))
            by_category.setdefault(cat, []).append(rel_path)

        # Sort within categories
        for cat in by_category:
            by_category[cat].sort()

        output = {
            "total_documents": len(all_docs),
            "reachable_count": len(reachable),
            "orphaned_count": len(orphaned),
            "coverage_percent": round(100 * len(reachable) / len(all_docs), 1) if all_docs else 100,
            "orphaned_by_category": by_category,
            "orphaned": sorted(str(doc.relative_to(root)) for doc in orphaned),
        }
        print(json.dumps(output, indent=2))

        if args.threshold and len(orphaned) > args.threshold:
            sys.exit(1)
        return

    # Print report
    print()
    print("=" * 60)
    print("ORPHANED DOCUMENTATION REPORT")
    print("=" * 60)

    coverage_pct = 100 * len(reachable) / len(all_docs) if all_docs else 100
    print(f"\nTotal documents:     {len(all_docs)}")
    print(f"Reachable:           {len(reachable)}")
    print(f"Orphaned:            {len(orphaned)}")
    print(f"Coverage:            {coverage_pct:.1f}%")

    if orphaned:
        print("\n--- Orphaned Documents ---")

        # Group by category
        by_category: Dict[str, List[Path]] = {}
        for doc in orphaned:
            cat = categorize_document(doc, root)
            by_category.setdefault(cat, []).append(doc)

        for cat in sorted(by_category.keys()):
            print(f"\n  {cat}:")
            for doc in sorted(by_category[cat]):
                rel_path = doc.relative_to(root)
                print(f"    - {rel_path}")

        print(f"\n⚠️  {len(orphaned)} documents are not linked from any entry point!")

        if args.verbose:
            print("\n--- Suggestions ---")
            print("Consider adding links to these documents from:")
            print("  - docs/json/README.md (for documentation)")
            print("  - scripts/README.md (for scripts)")
            print("  - .github/workflows/README.md (for workflows)")
            print("Or remove them if they're no longer needed.")

        if args.threshold and len(orphaned) > args.threshold:
            sys.exit(1)
    else:
        print("\n✓ All documents are reachable from entry points!")


if __name__ == "__main__":
    main()
