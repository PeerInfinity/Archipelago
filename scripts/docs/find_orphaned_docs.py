#!/usr/bin/env python3
"""
Find orphaned markdown files in docs/json that aren't linked from other documentation.

This script scans for .md files in docs/json that aren't referenced by:
- Other .md files in docs/json
- The repository's main README.md file
"""

import os
import re
from pathlib import Path
from typing import Set, Dict, List


def find_markdown_files(directory: Path) -> Set[Path]:
    """Find all markdown files in a directory recursively."""
    md_files = set()
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.md'):
                md_files.add(Path(root) / file)
    return md_files


def extract_markdown_links(file_path: Path) -> Set[str]:
    """Extract all markdown links from a file."""
    links = set()

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Match markdown links: [text](url)
        markdown_link_pattern = r'\[([^\]]+)\]\(([^\)]+)\)'
        matches = re.findall(markdown_link_pattern, content)

        for _, url in matches:
            # Remove anchors (e.g., #section)
            url = url.split('#')[0]
            # Skip external URLs, empty links, and mailto links
            if url and not url.startswith(('http://', 'https://', 'mailto:')):
                links.add(url)

    except Exception as e:
        print(f"Warning: Could not read {file_path}: {e}")

    return links


def resolve_link(source_file: Path, link: str, repo_root: Path) -> Path:
    """
    Resolve a relative link to an absolute path.

    Args:
        source_file: The file containing the link
        link: The relative link path
        repo_root: The repository root directory

    Returns:
        The resolved absolute path
    """
    # Handle relative links
    if link.startswith('./') or link.startswith('../'):
        # Resolve relative to the source file's directory
        resolved = (source_file.parent / link).resolve()
    else:
        # Assume it's relative to the source file's directory
        resolved = (source_file.parent / link).resolve()

    return resolved


def find_orphaned_docs(docs_json_dir: Path, readme_path: Path, repo_root: Path) -> List[Path]:
    """
    Find markdown files in docs/json that aren't linked from anywhere.

    Args:
        docs_json_dir: Path to docs/json directory
        readme_path: Path to main README.md file
        repo_root: Repository root directory

    Returns:
        List of orphaned markdown files
    """
    # Find all markdown files in docs/json
    all_docs = find_markdown_files(docs_json_dir)

    # Track which files are referenced
    referenced_files: Set[Path] = set()

    # Check all markdown files in docs/json for links to other docs/json files
    print("Scanning docs/json markdown files for internal links...")
    for doc_file in all_docs:
        links = extract_markdown_links(doc_file)
        for link in links:
            resolved = resolve_link(doc_file, link, repo_root)
            if resolved.exists() and resolved in all_docs:
                referenced_files.add(resolved)

    # Check main README.md for links to docs/json files
    if readme_path.exists():
        print(f"Scanning {readme_path.relative_to(repo_root)} for links to docs/json...")
        links = extract_markdown_links(readme_path)
        for link in links:
            resolved = resolve_link(readme_path, link, repo_root)
            if resolved.exists() and resolved in all_docs:
                referenced_files.add(resolved)
    else:
        print(f"Warning: {readme_path} not found")

    # Find orphaned files (not referenced by anything)
    orphaned = all_docs - referenced_files

    return sorted(orphaned)


def main():
    # Set up paths
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent.parent
    docs_json_dir = repo_root / 'docs' / 'json'
    readme_path = repo_root / 'README.md'

    print(f"Repository root: {repo_root}")
    print(f"Docs directory: {docs_json_dir}")
    print(f"Main README: {readme_path}")
    print()

    if not docs_json_dir.exists():
        print(f"Error: {docs_json_dir} does not exist")
        return 1

    # Find orphaned documentation
    orphaned_files = find_orphaned_docs(docs_json_dir, readme_path, repo_root)

    # Report results
    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)
    print()

    if orphaned_files:
        print(f"Found {len(orphaned_files)} orphaned markdown file(s):")
        print()
        for file_path in orphaned_files:
            rel_path = file_path.relative_to(repo_root)
            print(f"  - {rel_path}")
        print()
        print("These files are not linked from any other .md file in docs/json")
        print("or from the main README.md file.")
    else:
        print("No orphaned markdown files found.")
        print("All documentation files are properly linked.")

    print()
    return 0


if __name__ == '__main__':
    exit(main())
