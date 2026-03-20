#!/usr/bin/env python3
"""
Sync Script Documentation

This script compares scripts in the scripts/ directory against what's documented
in scripts/README.md to identify undocumented scripts.

Usage:
    python scripts/docs/sync-script-docs.py                # Check for undocumented scripts
    python scripts/docs/sync-script-docs.py --verbose      # Show all scripts
    python scripts/docs/sync-script-docs.py --json         # JSON output for CI
    python scripts/docs/sync-script-docs.py --generate     # Generate doc stubs

The script extracts from:
    - scripts/ directory (*.py, *.js, *.sh files)
    - scripts/README.md (documented scripts)
    - Subdirectory READMEs (scripts/test/, scripts/vanilla-alttp/, etc.)
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ScriptInfo:
    """Information about a script file."""
    path: str  # Relative path from project root
    name: str  # Filename
    category: str = ""  # Directory category (setup, test, docs, etc.)
    description: str = ""
    documented: bool = False
    doc_location: str = ""  # Which README documents it


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent.parent


# Scripts that are internal/library modules, not meant to be run directly
INTERNAL_SCRIPTS = {
    '__init__.py',
    'data_loaders.py',  # chart_generators internal
    'utils.py',  # chart_generators internal
    'multiclient.py',  # chart_generators internal
    'multiworld.py',  # chart_generators internal
    'processing_times.py',  # chart_generators internal
    'spoiler.py',  # chart_generators internal
    'summary.py',  # chart_generators internal
}

# Directories containing internal/library modules
INTERNAL_DIRECTORIES = {
    'scripts/lib',
    'scripts/docs/chart_generators',
    'scripts/test/fixtures',
    'scripts/.venv',  # Virtual environment (git-ignored)
    'scripts/output',  # Test output directory (git-ignored)
}

# Scripts that are test fixtures or support files
FIXTURE_PATTERNS = [
    'fixtures/',
    'TrackerClient.py',
    'TrackerCore.py',
    'TrackerKivy.py',
    'fuzzer_hook.py',
]


def is_internal_script(script_path: str) -> bool:
    """Check if a script is internal (not meant to be documented as a user script)."""
    path = Path(script_path)

    # Check if in internal directory
    for internal_dir in INTERNAL_DIRECTORIES:
        if script_path.startswith(internal_dir):
            return True

    # Check if internal filename
    if path.name in INTERNAL_SCRIPTS:
        return True

    # Check fixture patterns
    for pattern in FIXTURE_PATTERNS:
        if pattern in script_path:
            return True

    return False


def extract_scripts_from_filesystem(scripts_dir: Path) -> dict[str, ScriptInfo]:
    """
    Find all script files in the scripts directory.

    Returns a dict mapping relative path to ScriptInfo.
    """
    scripts: dict[str, ScriptInfo] = {}
    root = get_project_root()

    # Find all script files
    for ext in ['*.py', '*.js', '*.sh']:
        for script_path in scripts_dir.rglob(ext):
            rel_path = str(script_path.relative_to(root))

            # Skip internal scripts
            if is_internal_script(rel_path):
                continue

            # Determine category from directory structure
            parts = script_path.relative_to(scripts_dir).parts
            category = parts[0] if len(parts) > 1 else "root"

            scripts[rel_path] = ScriptInfo(
                path=rel_path,
                name=script_path.name,
                category=category,
            )

    return scripts


def extract_documented_scripts(readme_path: Path, doc_name: str = "README.md") -> dict[str, str]:
    """
    Extract script paths mentioned in a README file.

    Returns a dict mapping script path (various formats) to the doc location.
    """
    documented: dict[str, str] = {}

    if not readme_path.exists():
        return documented

    content = readme_path.read_text()

    # Patterns to match script references:
    # - **`setup/setup_dev_environment.py`**
    # - `test-all-templates.py`
    # - scripts/test/run-tests.js
    # - python scripts/setup/setup_dev_environment.py

    patterns = [
        # Backtick paths: `path/to/script.py` or **`path/to/script.py`**
        re.compile(r'`([^`]*?\.(?:py|js|sh))`'),
        # Command examples: python scripts/path/to/script.py
        re.compile(r'(?:python|node|bash)\s+(\S+\.(?:py|js|sh))'),
        # Direct path mentions
        re.compile(r'(scripts/[^\s`\'"]+\.(?:py|js|sh))'),
    ]

    for pattern in patterns:
        for match in pattern.finditer(content):
            script_ref = match.group(1)
            # Normalize the path
            # Remove leading scripts/ if present for matching
            normalized = script_ref
            if not normalized.startswith('scripts/'):
                # Could be relative like setup/setup_dev.py
                normalized = f"scripts/{normalized}"

            documented[normalized] = doc_name
            # Also store the original format for matching
            documented[script_ref] = doc_name

    return documented


def find_all_readmes(scripts_dir: Path) -> list[Path]:
    """Find all README files in the scripts directory."""
    readmes = []
    # Match both README.md and files with README anywhere in the name
    for readme in scripts_dir.rglob('*README*.md'):
        readmes.append(readme)
    # Also match lowercase readme
    for readme in scripts_dir.rglob('*readme*.md'):
        if readme not in readmes:
            readmes.append(readme)
    return readmes


def extract_linked_docs(readme_path: Path, project_root: Path) -> list[Path]:
    """
    Extract paths to documentation files linked from a README.

    Looks for markdown links like [text](path/to/file.md) and resolves them
    relative to the README's directory.
    """
    linked_docs = []
    if not readme_path.exists():
        return linked_docs

    content = readme_path.read_text()
    readme_dir = readme_path.parent

    # Pattern for markdown links: [text](path.md) or [text](path/to/file.md)
    link_pattern = re.compile(r'\[([^\]]+)\]\(([^)]+\.md)\)')

    for match in link_pattern.finditer(content):
        link_path = match.group(2)
        # Skip external URLs
        if link_path.startswith('http://') or link_path.startswith('https://'):
            continue
        # Resolve relative to README directory
        resolved = (readme_dir / link_path).resolve()
        if resolved.exists() and resolved not in linked_docs:
            linked_docs.append(resolved)

    return linked_docs


def categorize_script(path: str) -> str:
    """Get a human-readable category for a script."""
    if '/setup/' in path:
        return "Setup"
    elif '/test/' in path:
        return "Testing"
    elif '/docs/' in path:
        return "Documentation"
    elif '/build/' in path:
        return "Build"
    elif '/utils/' in path:
        return "Utilities"
    elif '/debug/' in path:
        return "Debugging"
    elif '/vanilla-alttp/' in path:
        return "Vanilla ALttP"
    elif '/worlds/' in path:
        return "World-Specific"
    elif path.count('/') == 1:  # scripts/something.py
        return "Root"
    else:
        return "Other"


def generate_doc_entry(script: ScriptInfo) -> str:
    """Generate a markdown documentation entry for a script."""
    return f"""- **`{script.path.replace('scripts/', '')}`** - [TODO: Add description]
  ```bash
  python {script.path}
  ```
"""


def main():
    parser = argparse.ArgumentParser(
        description="Check which scripts are documented in README files"
    )
    parser.add_argument('--verbose', '-v', action='store_true',
                        help="Show all scripts and their documentation status")
    parser.add_argument('--json', action='store_true',
                        help="Output as JSON for CI")
    parser.add_argument('--generate', '-g', action='store_true',
                        help="Generate documentation stubs for undocumented scripts")
    parser.add_argument('--threshold', type=int, default=0,
                        help="Fail if undocumented count exceeds threshold")
    args = parser.parse_args()

    root = get_project_root()
    scripts_dir = root / "scripts"

    # Extract scripts from filesystem
    print("Scanning scripts directory...")
    all_scripts = extract_scripts_from_filesystem(scripts_dir)
    print(f"  Found {len(all_scripts)} scripts (excluding internal/library modules)")

    # Extract documented scripts from READMEs
    print("\nScanning README files...")
    all_documented: dict[str, str] = {}

    # Main README
    main_readme = scripts_dir / "README.md"
    if main_readme.exists():
        documented = extract_documented_scripts(main_readme, "scripts/README.md")
        print(f"  scripts/README.md: {len(documented)} references")
        all_documented.update(documented)

    # Subdirectory READMEs
    for readme in find_all_readmes(scripts_dir):
        if readme == main_readme:
            continue
        rel_readme = str(readme.relative_to(root))
        documented = extract_documented_scripts(readme, rel_readme)
        if documented:
            print(f"  {rel_readme}: {len(documented)} references")
            all_documented.update(documented)

    # Also check documentation files linked from the main README
    checked_docs: set[Path] = {main_readme}
    for readme in find_all_readmes(scripts_dir):
        checked_docs.add(readme)

    linked_docs = extract_linked_docs(main_readme, root)
    for linked_doc in linked_docs:
        if linked_doc in checked_docs:
            continue
        checked_docs.add(linked_doc)
        rel_doc = str(linked_doc.relative_to(root))
        documented = extract_documented_scripts(linked_doc, rel_doc)
        if documented:
            print(f"  {rel_doc} (linked): {len(documented)} references")
            all_documented.update(documented)

    # Match scripts to documentation
    for path, script in all_scripts.items():
        # Try various path formats
        path_variants = [
            path,  # scripts/setup/script.py
            path.replace('scripts/', ''),  # setup/script.py
            script.name,  # script.py
        ]

        for variant in path_variants:
            if variant in all_documented:
                script.documented = True
                script.doc_location = all_documented[variant]
                break

    # Categorize results
    documented_scripts = {p: s for p, s in all_scripts.items() if s.documented}
    undocumented_scripts = {p: s for p, s in all_scripts.items() if not s.documented}

    if args.json:
        output = {
            "total_scripts": len(all_scripts),
            "documented_count": len(documented_scripts),
            "undocumented_count": len(undocumented_scripts),
            "coverage_percent": round(100 * len(documented_scripts) / len(all_scripts), 1) if all_scripts else 0,
            "documented": {
                path: {
                    "category": categorize_script(path),
                    "doc_location": script.doc_location
                }
                for path, script in documented_scripts.items()
            },
            "undocumented": {
                path: {
                    "category": categorize_script(path),
                }
                for path, script in undocumented_scripts.items()
            }
        }
        print(json.dumps(output, indent=2))

        if args.threshold and len(undocumented_scripts) > args.threshold:
            sys.exit(1)
        return

    # Print report
    print()
    print("=" * 60)
    print("SCRIPT DOCUMENTATION REPORT")
    print("=" * 60)

    coverage_pct = 100 * len(documented_scripts) / len(all_scripts) if all_scripts else 0
    print(f"\nTotal scripts:       {len(all_scripts)}")
    print(f"Documented:          {len(documented_scripts)}")
    print(f"Undocumented:        {len(undocumented_scripts)}")
    print(f"Coverage:            {coverage_pct:.1f}%")

    if args.verbose:
        print("\n--- Documented Scripts ---")
        for path in sorted(documented_scripts.keys()):
            script = documented_scripts[path]
            print(f"  [✓] {path} ({script.doc_location})")

    if undocumented_scripts:
        print("\n--- Undocumented Scripts ---")

        # Group by category
        by_category: dict[str, list[str]] = {}
        for path in undocumented_scripts:
            cat = categorize_script(path)
            by_category.setdefault(cat, []).append(path)

        for cat in sorted(by_category.keys()):
            print(f"\n  {cat}:")
            for path in sorted(by_category[cat]):
                print(f"    - {path}")

        if args.generate:
            print("\n--- Generated Documentation Stubs ---")
            print("Add these to the appropriate sections in scripts/README.md:\n")

            for cat in sorted(by_category.keys()):
                print(f"### {cat} Scripts\n")
                for path in sorted(by_category[cat]):
                    script = undocumented_scripts[path]
                    print(generate_doc_entry(script))

        print(f"\n⚠️  {len(undocumented_scripts)} scripts lack documentation!")
        if args.threshold and len(undocumented_scripts) > args.threshold:
            sys.exit(1)
    else:
        print("\n✓ All scripts are documented!")


if __name__ == "__main__":
    main()
