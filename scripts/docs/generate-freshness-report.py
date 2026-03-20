#!/usr/bin/env python3
"""
Generate a freshness report showing how recently each test result document was generated.

Scans all markdown files in docs/json/developer/test-results/ and extracts:
- Document name (as clickable link)
- Source data date (when the underlying test data was created)
- Document generation date (when the markdown was generated)
- Days since each date
- Command to regenerate the document

Also queries documentation sync scripts (with --json) to include their coverage
status in the report. Note: this only checks status; it does not perform any
actual documentation syncing. To run all document generators, use:
    python scripts/docs/generate-all-docs.py

Output: docs/json/developer/test-results/test-results-freshness.md
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Project root (script is at scripts/docs/generate-freshness-report.py)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
TEST_RESULTS_DIR = PROJECT_ROOT / "docs" / "json" / "developer" / "test-results"
OUTPUT_FILE = TEST_RESULTS_DIR / "test-results-freshness.md"

# Mapping of document name patterns to regeneration commands
# Keys are regex patterns, values are (command, description, workflow_name, workflow_file) tuples
# workflow_name and workflow_file can be None if no workflow exists
REGENERATION_COMMANDS: Dict[str, Tuple[str, str, Optional[str], Optional[str]]] = {
    # Spoiler tests
    r'test-results-spoilers-minimal\.md$': (
        'python scripts/test/test-all-templates.py --minimal-spoilers -p',
        'Run minimal spoiler tests',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-spoilers-full\.md$': (
        'python scripts/test/test-all-templates.py --full-spoilers -p',
        'Run full spoiler tests',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-spoilers-minimal-worldgen\.md$': (
        'python scripts/test/test-all-templates.py --minimal-spoilers --worldgen -p',
        'Run minimal spoiler tests (worldgen)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-spoilers-full-worldgen\.md$': (
        'python scripts/test/test-all-templates.py --full-spoilers --worldgen -p',
        'Run full spoiler tests (worldgen)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-spoilers-minimal-apworld\.md$': (
        'python scripts/test/test-all-templates.py --minimal-spoilers --apworld -p',
        'Run minimal spoiler tests (apworld)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-spoilers-full-apworld\.md$': (
        'python scripts/test/test-all-templates.py --full-spoilers --apworld -p',
        'Run full spoiler tests (apworld)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),

    # Multiclient tests
    r'test-results-multiclient\.md$': (
        'python scripts/test/test-all-templates.py --multiclient -p',
        'Run multiclient tests',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-multiclient-worldgen\.md$': (
        'python scripts/test/test-all-templates.py --multiclient --worldgen -p',
        'Run multiclient tests (worldgen)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-multiclient-apworld\.md$': (
        'python scripts/test/test-all-templates.py --multiclient --apworld -p',
        'Run multiclient tests (apworld)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),

    # Multiworld tests
    r'test-results-multiworld\.md$': (
        'python scripts/test/test-all-templates.py --multiworld -p',
        'Run multiworld tests',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-multiworld-worldgen\.md$': (
        'python scripts/test/test-all-templates.py --multiworld --worldgen -p',
        'Run multiworld tests (worldgen)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),
    r'test-results-multiworld-apworld\.md$': (
        'python scripts/test/test-all-templates.py --multiworld --apworld -p',
        'Run multiworld tests (apworld)',
        'Test All Templates (Sequential)',
        'test-all-sequential.yml'
    ),

    # UT Fuzz tests
    r'test-results-ut-fuzz\.md$': (
        'python scripts/test/test-all-ut-fuzz.py -p',
        'Run UT fuzz tests',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-multiworld-ut-fuzz\.md$': (
        'python scripts/test/test-multiworld-ut-fuzz.py -p',
        'Run multiworld UT fuzz tests',
        'Test Multiworld UT Fuzz Assembly',
        'test-multiworld-ut-fuzz.yml'
    ),

    # Spoiler fuzz tests
    r'test-results-spoiler-fuzz\.md$': (
        'python scripts/test/test-all-spoiler-fuzz.py -p',
        'Run spoiler fuzz tests',
        'Test Spoiler Fuzzer',
        'test-spoiler-fuzz.yml'
    ),
    r'test-results-spoiler-fuzz-apworlds\.md$': (
        'python scripts/test/test-all-spoiler-fuzz.py --apworld -p',
        'Run spoiler fuzz tests (apworld)',
        'Test Spoiler Fuzzer',
        'test-spoiler-fuzz.yml'
    ),

    # Fuzz summary
    r'test-results-fuzz-summary\.md$': (
        'python scripts/docs/generate_fuzz_summary_chart.py',
        'Generate fuzz summary chart',
        None,
        None
    ),
    r'test-results-fuzz-summary-apworlds\.md$': (
        'python scripts/docs/generate_fuzz_summary_chart.py --apworld',
        'Generate fuzz summary chart (apworld)',
        None,
        None
    ),

    # Processing times
    r'test-results-processing-times\.md$': (
        'python scripts/docs/generate-test-chart.py --processing-times',
        'Generate processing times chart',
        None,
        None
    ),
    r'test-results-processing-times-worldgen\.md$': (
        'python scripts/docs/generate-test-chart.py --processing-times --worldgen',
        'Generate processing times chart (worldgen)',
        None,
        None
    ),
    r'test-results-processing-times-apworld\.md$': (
        'python scripts/docs/generate-test-chart.py --processing-times --apworld',
        'Generate processing times chart (apworld)',
        None,
        None
    ),

    # UT fuzz charts
    r'test-results-ut-fuzz-worldgen\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --worldgen',
        'Generate UT fuzz chart (worldgen)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-original\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --original',
        'Generate UT fuzz chart (original)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-original_seeded\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --original_seeded',
        'Generate UT fuzz chart (original_seeded)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-hybrid\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --hybrid',
        'Generate UT fuzz chart (hybrid)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-apworlds-worldgen\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --apworld --worldgen',
        'Generate UT fuzz chart (apworld worldgen)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-apworlds-original\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --apworld --original',
        'Generate UT fuzz chart (apworld original)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-apworlds-original_seeded\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --apworld --original_seeded',
        'Generate UT fuzz chart (apworld original_seeded)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),
    r'test-results-ut-fuzz-apworlds-hybrid\.md$': (
        'python scripts/docs/generate_ut_fuzz_chart.py --apworld --hybrid',
        'Generate UT fuzz chart (apworld hybrid)',
        'Test UT Fuzzer',
        'test-ut-fuzz.yml'
    ),

    # UT fuzz comparison charts
    r'test-results-ut-fuzz-comparison-.*\.md$': (
        'python scripts/docs/compare_ut_fuzz_results.py',
        'Generate UT fuzz comparison chart',
        None,
        None
    ),
    r'test-results-ut-fuzz-apworlds-comparison-.*\.md$': (
        'python scripts/docs/compare_ut_fuzz_results.py --apworld',
        'Generate UT fuzz comparison chart (apworld)',
        None,
        None
    ),

    # Summary charts
    r'test-results-summary\.md$': (
        'python scripts/docs/generate-test-chart.py --summary',
        'Generate test summary chart',
        None,
        None
    ),
    r'test-results-summary-worldgen\.md$': (
        'python scripts/docs/generate-test-chart.py --summary --worldgen',
        'Generate test summary chart (worldgen)',
        None,
        None
    ),
    r'test-results-summary-apworld\.md$': (
        'python scripts/docs/generate-test-chart.py --summary --apworld',
        'Generate test summary chart (apworld)',
        None,
        None
    ),

    # World generator report
    r'test-results-world-generator\.md$': (
        'python scripts/docs/generate-world-generator-report.py',
        'Generate world generator report',
        'Test World Generator',
        'test-world-generator.yml'
    ),

    # Freshness report itself
    r'test-results-freshness\.md$': (
        'python scripts/docs/generate-freshness-report.py',
        'Generate this freshness report',
        None,
        None
    ),
}

# GitHub repository for workflow links
GITHUB_REPO = "PeerInfinity/Archipelago-CC"

# Workflow overview: maps workflows to their modes, test result files, and generated documents
WORKFLOW_OVERVIEW = [
    {
        'name': 'Test All Templates (Sequential)',
        'file': 'test-all-sequential.yml',
        'description': 'Runs spoiler, multiclient, and multiworld tests across all game templates.',
        'inputs': [
            ('template_type', 'original, worldgen, apworld'),
            ('spoiler_mode', 'single-seed, 10-seeds'),
            ('enable_minimal_spoilers', 'boolean (default: true)'),
            ('enable_full_spoilers', 'boolean (default: true)'),
            ('enable_multiclient', 'boolean (default: true)'),
            ('enable_multiworld', 'boolean (default: true)'),
        ],
        'results': [
            ('original / Minimal Spoilers', 'scripts/output/spoiler-minimal/test-results.json', ['test-results-spoilers-minimal.md']),
            ('worldgen / Minimal Spoilers', 'scripts/output/spoiler-minimal-worldgen/test-results.json', ['test-results-spoilers-minimal-worldgen.md']),
            ('apworld / Minimal Spoilers', 'scripts/output/spoiler-minimal-apworld/test-results.json', ['test-results-spoilers-minimal-apworld.md']),
            ('original / Full Spoilers', 'scripts/output/spoiler-full/test-results.json', ['test-results-spoilers-full.md']),
            ('worldgen / Full Spoilers', 'scripts/output/spoiler-full-worldgen/test-results.json', ['test-results-spoilers-full-worldgen.md']),
            ('apworld / Full Spoilers', 'scripts/output/spoiler-full-apworld/test-results.json', ['test-results-spoilers-full-apworld.md']),
            ('original / Multiclient', 'scripts/output/multiclient/test-results.json', ['test-results-multiclient.md']),
            ('worldgen / Multiclient', 'scripts/output/multiclient-worldgen/test-results.json', ['test-results-multiclient-worldgen.md']),
            ('apworld / Multiclient', 'scripts/output/multiclient-apworld/test-results.json', ['test-results-multiclient-apworld.md']),
            ('original / Multiworld', 'scripts/output/multiworld/test-results.json', ['test-results-multiworld.md']),
            ('worldgen / Multiworld', 'scripts/output/multiworld-worldgen/test-results.json', ['test-results-multiworld-worldgen.md']),
            ('apworld / Multiworld', 'scripts/output/multiworld-apworld/test-results.json', ['test-results-multiworld-apworld.md']),
        ],
        'derived_docs': [
            ('test-results-summary.md', 'python scripts/docs/generate-test-chart.py --summary'),
            ('test-results-summary-worldgen.md', 'python scripts/docs/generate-test-chart.py --summary --worldgen'),
            ('test-results-summary-apworld.md', 'python scripts/docs/generate-test-chart.py --summary --apworld'),
            ('test-results-processing-times.md', 'python scripts/docs/generate-test-chart.py --processing-times'),
            ('test-results-processing-times-worldgen.md', 'python scripts/docs/generate-test-chart.py --processing-times --worldgen'),
            ('test-results-processing-times-apworld.md', 'python scripts/docs/generate-test-chart.py --processing-times --apworld'),
        ],
    },
    {
        'name': 'Test UT Fuzzer',
        'file': 'test-ut-fuzz.yml',
        'description': 'Fuzz tests Universal Tracker by generating random option combinations and tracking games.',
        'inputs': [
            ('ut_mode', 'original, original_seeded, worldgen, pickle, hybrid'),
            ('test_apworlds', 'boolean (default: false)'),
            ('runs_per_game', 'number (default: 10)'),
            ('seed', 'number (default: 1)'),
        ],
        'results': [
            ('bundled / original', 'scripts/output/ut-fuzz/test-results-original-fixed-seed.json', ['test-results-ut-fuzz-original.md']),
            ('bundled / original_seeded', 'scripts/output/ut-fuzz/test-results-original_seeded-fixed-seed.json', ['test-results-ut-fuzz-original_seeded.md']),
            ('bundled / worldgen', 'scripts/output/ut-fuzz/test-results-worldgen-fixed-seed.json', ['test-results-ut-fuzz-worldgen.md']),
            ('bundled / hybrid', 'scripts/output/ut-fuzz/test-results-hybrid-fixed-seed.json', ['test-results-ut-fuzz-hybrid.md']),
            ('bundled / pickle', 'scripts/output/ut-fuzz/test-results-pickle-fixed-seed.json', ['test-results-ut-fuzz-pickle.md']),
            ('apworlds / original', 'scripts/output/ut-fuzz/test-results-apworlds-original-fixed-seed.json', ['test-results-ut-fuzz-apworlds-original.md']),
            ('apworlds / original_seeded', 'scripts/output/ut-fuzz/test-results-apworlds-original_seeded-fixed-seed.json', ['test-results-ut-fuzz-apworlds-original_seeded.md']),
            ('apworlds / worldgen', 'scripts/output/ut-fuzz/test-results-apworlds-worldgen-fixed-seed.json', ['test-results-ut-fuzz-apworlds-worldgen.md']),
            ('apworlds / hybrid', 'scripts/output/ut-fuzz/test-results-apworlds-hybrid-fixed-seed.json', ['test-results-ut-fuzz-apworlds-hybrid.md']),
            ('apworlds / pickle', 'scripts/output/ut-fuzz/test-results-apworlds-pickle-fixed-seed.json', ['test-results-ut-fuzz-apworlds-pickle.md']),
        ],
        'derived_docs': [
            ('test-results-ut-fuzz-comparison-original-original_seeded.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-comparison-original-worldgen.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-comparison-original-hybrid.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-comparison-original-pickle.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-comparison-worldgen-hybrid.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-comparison-worldgen-pickle.md', 'python scripts/docs/compare_ut_fuzz_results.py'),
            ('test-results-ut-fuzz-apworlds-comparison-original-original_seeded.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
            ('test-results-ut-fuzz-apworlds-comparison-original-worldgen.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
            ('test-results-ut-fuzz-apworlds-comparison-original-hybrid.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
            ('test-results-ut-fuzz-apworlds-comparison-original-pickle.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
            ('test-results-ut-fuzz-apworlds-comparison-worldgen-hybrid.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
            ('test-results-ut-fuzz-apworlds-comparison-worldgen-pickle.md', 'python scripts/docs/compare_ut_fuzz_results.py --apworld'),
        ],
    },
    {
        'name': 'Test Spoiler Fuzzer',
        'file': 'test-spoiler-fuzz.yml',
        'description': 'Fuzz tests by generating random seeds and running spoiler verification on them.',
        'inputs': [
            ('test_apworlds', 'boolean (default: false)'),
            ('spoiler_mode', 'minimal-spoilers, full-spoilers'),
            ('runs_per_game', 'number (default: 10)'),
            ('seed', 'number (default: 1)'),
        ],
        'results': [
            ('bundled', 'scripts/output/spoiler-fuzz/test-results-fixed-seed.json', ['test-results-spoiler-fuzz.md']),
            ('apworlds', 'scripts/output/spoiler-fuzz/test-results-apworlds-fixed-seed.json', ['test-results-spoiler-fuzz-apworlds.md']),
        ],
        'derived_docs': [
            ('test-results-fuzz-summary.md', 'python scripts/docs/generate_fuzz_summary_chart.py'),
            ('test-results-fuzz-summary-apworlds.md', 'python scripts/docs/generate_fuzz_summary_chart.py --apworld'),
        ],
    },
    {
        'name': 'Test Multiworld UT Fuzz Assembly',
        'file': 'test-multiworld-ut-fuzz.yml',
        'description': 'Tests Universal Tracker with incrementally assembled multiworld games.',
        'inputs': [
            ('runs_per_test', 'number (default: 3)'),
            ('max_players', 'number (default: 10)'),
            ('seed', 'number (default: 1)'),
            ('timeout', 'number (default: 60)'),
        ],
        'results': [
            ('default', 'scripts/output/multiworld-ut-fuzz/test-results-fixed-seed.json', ['test-results-multiworld-ut-fuzz.md']),
        ],
        'derived_docs': [],
    },
    {
        'name': 'Test World Generator',
        'file': 'test-world-generator.yml',
        'description': 'Tests the world generator by generating worlds from rules and running spoiler tests.',
        'inputs': [
            ('test_mode', 'canonical, random, both'),
            ('seed', 'number (default: 1)'),
        ],
        'results': [
            ('canonical', 'scripts/output/world-generator/test-results-canonical.json', ['test-results-world-generator.md']),
            ('random', 'scripts/output/world-generator/test-results-random.json', ['test-results-world-generator.md']),
        ],
        'derived_docs': [],
    },
]


def parse_generated_date(content: str) -> Optional[datetime]:
    """Extract the **Generated:** date from markdown content."""
    # Format: **Generated:** 2026-01-30 23:54:13 UTC (or without UTC for legacy)
    match = re.search(r'\*\*Generated:\*\*\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})(\s+UTC)?', content)
    if match:
        try:
            dt = datetime.strptime(match.group(1), '%Y-%m-%d %H:%M:%S')
            # Treat as UTC (either explicitly marked or assumed for consistency)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def parse_source_data_date(content: str) -> Optional[datetime]:
    """Extract the **Source Data Last Updated:** or **Source Data Created:** date from markdown content."""
    # Try Last Updated first (preferred)
    # Format can be ISO with T (2026-01-30T23:11:27+00:00) or with space (2026-01-30 23:11:27)
    # May include timezone offset (+00:00) or UTC suffix
    match = re.search(r'\*\*Source Data Last Updated:\*\*\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})?', content)
    if not match:
        # Fall back to Created
        match = re.search(r'\*\*Source Data Created:\*\*\s*(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})([+-]\d{2}:\d{2})?', content)

    if match:
        try:
            date_str = match.group(1).replace(' ', 'T')  # Normalize to ISO format
            tz_offset = match.group(2)
            if tz_offset:
                date_str += tz_offset
            dt = datetime.fromisoformat(date_str)
            # If no timezone info, treat as UTC for consistency
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            pass
    return None


def calculate_days_ago(dt: Optional[datetime], now: datetime) -> Optional[int]:
    """Calculate the number of days between a datetime and now."""
    if dt is None:
        return None
    delta = now - dt
    return delta.days


def format_date(dt: Optional[datetime]) -> str:
    """Format a datetime for display."""
    if dt is None:
        return "N/A"
    return dt.strftime('%Y-%m-%d %H:%M')


def format_days_ago(days: Optional[int]) -> str:
    """Format days ago with color indicator."""
    if days is None:
        return "N/A"
    if days <= 0:
        return ""
    elif days == 1:
        return "1 day"
    else:
        return f"{days} days"


def get_freshness_emoji(days: Optional[int]) -> str:
    """Return an emoji indicating freshness level."""
    if days is None:
        return "⚪"
    if days <= 1:  # Today, yesterday, or future timestamps (same day)
        return "🟢"  # Fresh (today or yesterday)
    elif days <= 7:
        return "🟡"  # Recent (within a week)
    elif days <= 30:
        return "🟠"  # Aging (within a month)
    else:
        return "🔴"  # Stale (over a month)


def get_regeneration_info(filename: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    """Get the command and workflow info to regenerate a document.

    Returns (command, description, workflow_name, workflow_file) or all None if unknown.
    """
    for pattern, info in REGENERATION_COMMANDS.items():
        if re.search(pattern, filename):
            return info
    return None, None, None, None


def format_workflow_link(workflow_name: Optional[str], workflow_file: Optional[str]) -> str:
    """Format a workflow as a clickable GitHub Actions link."""
    if not workflow_name or not workflow_file:
        return ""
    # Link to the workflow run page
    return f"[{workflow_name}](https://github.com/{GITHUB_REPO}/actions/workflows/{workflow_file})"


def generate_workflow_overview_section(results: List[Dict]) -> str:
    """Generate the workflow overview section showing workflows, modes, results, and documents."""
    # Build lookup from document filename to freshness info
    freshness_lookup = {}
    for r in results:
        freshness_lookup[r['filename']] = {
            'emoji': get_freshness_emoji(r['source_days']),
            'days': format_days_ago(r['source_days']),
            'date': format_date(r['source_date']),
        }

    def doc_status(filename: str) -> str:
        """Get the freshness emoji for a document, or empty string if unknown."""
        info = freshness_lookup.get(filename)
        if info:
            return info['emoji']
        return "⚪"

    def doc_freshness(filename: str) -> str:
        """Get formatted freshness string (date + days) for a document."""
        info = freshness_lookup.get(filename)
        if not info:
            return "N/A"
        days = info['days']
        return info['date'] + (f" ({days})" if days else "")

    md = "## Workflow Overview\n\n"
    md += "Overview of GitHub Actions workflows, their modes, the test result files they produce, "
    md += "and the documents generated from those results.\n\n"

    for workflow in WORKFLOW_OVERVIEW:
        name = workflow['name']
        file = workflow['file']
        desc = workflow['description']
        workflow_url = f"https://github.com/{GITHUB_REPO}/actions/workflows/{file}"

        md += f"### [{name}]({workflow_url})\n\n"
        md += f"{desc}\n\n"
        md += f"**Workflow file:** `.github/workflows/{file}`\n\n"

        # Inputs table
        if workflow['inputs']:
            md += "**Key inputs:**\n\n"
            md += "| Input | Options |\n"
            md += "|-------|---------|\n"
            for input_name, options in workflow['inputs']:
                md += f"| `{input_name}` | {options} |\n"
            md += "\n"

        # Results table
        if workflow['results']:
            md += "**Test results and documents:**\n\n"
            md += "| Status | Mode | Test Result File | Document | Freshness |\n"
            md += "|--------|------|-----------------|----------|----------|\n"
            for mode, result_file, docs in workflow['results']:
                # Use freshness of the first (primary) document for status
                primary_doc = docs[0] if docs else None
                status = doc_status(primary_doc) if primary_doc else "⚪"
                freshness = doc_freshness(primary_doc) if primary_doc else "N/A"
                doc_links = ', '.join(f"[{d}](./{d})" for d in docs)
                md += f"| {status} | {mode} | `{result_file}` | {doc_links} | {freshness} |\n"
            md += "\n"

        # Derived documents
        if workflow['derived_docs']:
            md += "**Derived documents** (generated from multiple result files):\n\n"
            md += "| Status | Document | Command | Freshness |\n"
            md += "|--------|----------|---------|-----------|\n"
            for doc, cmd in workflow['derived_docs']:
                status = doc_status(doc)
                freshness = doc_freshness(doc)
                md += f"| {status} | [{doc}](./{doc}) | `{cmd}` | {freshness} |\n"
            md += "\n"

    return md


def run_sync_scripts() -> Dict[str, Dict]:
    """Run the documentation sync scripts and collect their results."""
    sync_results = {}

    sync_scripts = [
        ('Rule Types Documentation', 'scripts/docs/sync-rule-docs.py'),
        ('Rule Types Test Coverage', 'scripts/docs/sync-rule-tests.py'),
        ('Script Documentation', 'scripts/docs/sync-script-docs.py'),
        ('Document Reachability', 'scripts/docs/find_orphaned_docs.py'),
    ]

    for name, script_path in sync_scripts:
        script_full_path = PROJECT_ROOT / script_path
        if not script_full_path.exists():
            sync_results[name] = {'error': f'Script not found: {script_path}'}
            continue

        try:
            result = subprocess.run(
                [sys.executable, str(script_full_path), '--json'],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=60
            )

            # Parse JSON output (skip the "Extracting..." lines)
            output_lines = result.stdout.strip().split('\n')
            json_start = None
            for i, line in enumerate(output_lines):
                if line.strip().startswith('{'):
                    json_start = i
                    break

            if json_start is not None:
                json_str = '\n'.join(output_lines[json_start:])
                data = json.loads(json_str)
                sync_results[name] = {
                    'data': data,
                    'script': script_path,
                }
            else:
                sync_results[name] = {'error': 'No JSON output found'}

        except subprocess.TimeoutExpired:
            sync_results[name] = {'error': 'Script timed out'}
        except json.JSONDecodeError as e:
            sync_results[name] = {'error': f'Invalid JSON: {e}'}
        except Exception as e:
            sync_results[name] = {'error': str(e)}

    return sync_results


def scan_test_results() -> List[Dict]:
    """Scan all markdown files in the test results directory and extract date information."""
    results = []
    now = datetime.now(timezone.utc)

    if not TEST_RESULTS_DIR.exists():
        print(f"Warning: Test results directory not found: {TEST_RESULTS_DIR}")
        return results

    for md_file in sorted(TEST_RESULTS_DIR.glob("*.md")):
        # Skip the freshness report itself
        if md_file.name == "test-results-freshness.md":
            continue

        try:
            content = md_file.read_text(encoding='utf-8')
        except Exception as e:
            print(f"Warning: Could not read {md_file.name}: {e}")
            continue

        generated_date = parse_generated_date(content)
        source_date = parse_source_data_date(content)

        generated_days = calculate_days_ago(generated_date, now)
        source_days = calculate_days_ago(source_date, now)

        regen_cmd, regen_desc, workflow_name, workflow_file = get_regeneration_info(md_file.name)

        results.append({
            'filename': md_file.name,
            'source_date': source_date,
            'source_days': source_days,
            'generated_date': generated_date,
            'generated_days': generated_days,
            'regen_command': regen_cmd,
            'regen_description': regen_desc,
            'workflow_name': workflow_name,
            'workflow_file': workflow_file,
        })

    return results


def generate_markdown(results: List[Dict], sync_results: Optional[Dict] = None) -> str:
    """Generate the markdown report content."""
    now = datetime.now(timezone.utc)

    md = "# Test Results Freshness Report\n\n"
    md += "This report shows when each test result document was generated, how fresh the underlying data is, "
    md += "and how to regenerate each document.\n\n"
    md += f"**Report Generated:** {now.strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    # Summary statistics (based on source data date)
    total = len(results)
    with_dates = sum(1 for r in results if r['source_date'] is not None)
    fresh_count = sum(1 for r in results if r['source_days'] is not None and r['source_days'] <= 1)
    recent_count = sum(1 for r in results if r['source_days'] is not None and 1 < r['source_days'] <= 7)
    aging_count = sum(1 for r in results if r['source_days'] is not None and 7 < r['source_days'] <= 30)
    stale_count = sum(1 for r in results if r['source_days'] is not None and r['source_days'] > 30)

    md += "## Summary\n\n"
    md += f"- **Total Documents:** {total}\n"
    md += f"- **With Date Info:** {with_dates}\n"
    md += f"- 🟢 **Fresh (0-1 days):** {fresh_count}\n"
    md += f"- 🟡 **Recent (2-7 days):** {recent_count}\n"
    md += f"- 🟠 **Aging (8-30 days):** {aging_count}\n"
    md += f"- 🔴 **Stale (>30 days):** {stale_count}\n\n"

    # Documentation sync status
    if sync_results:
        md += "## Documentation Sync Status\n\n"
        md += "Status of documentation coverage across the codebase:\n\n"
        md += "| Check | Coverage | Status | Command |\n"
        md += "|-------|----------|--------|--------|\n"

        for name, result in sync_results.items():
            if 'error' in result:
                md += f"| {name} | N/A | ⚠️ Error: {result['error']} | - |\n"
            else:
                data = result['data']
                script = result['script']

                # Handle different output formats (some have nested 'summary')
                summary = data.get('summary', data)

                # Get counts - different scripts use different field names
                # orphaned_count is for find_orphaned_docs.py
                undoc = summary.get('undocumented_count',
                        summary.get('untested_count',
                        summary.get('orphaned_count', 0)))
                total = summary.get('total_implemented',
                        summary.get('total_scripts',
                        summary.get('total_documents',
                        summary.get('implemented_count', 0))))
                # Some scripts provide the documented/tested/reachable count directly
                documented = summary.get('documented_count',
                             summary.get('tested_count',
                             summary.get('reachable_count', total - undoc)))

                # Calculate coverage
                if 'coverage_percent' in data:
                    pct = data['coverage_percent']
                elif total > 0:
                    pct = round(100 * documented / total, 1)
                else:
                    pct = 0

                coverage = f"{pct}% ({documented}/{total})"

                # Determine status emoji - orphaned docs uses "orphans" not "gaps"
                gap_word = "orphans" if 'orphaned_count' in summary else "gaps"
                if undoc == 0:
                    status = "✅ Complete"
                elif undoc <= 10:
                    status = f"🟡 {undoc} {gap_word}"
                else:
                    status = f"🟠 {undoc} {gap_word}"

                cmd = f"`python {script}`"
                md += f"| {name} | {coverage} | {status} | {cmd} |\n"

        md += "\n"

    md += generate_workflow_overview_section(results)

    md += "## Document Freshness\n\n"
    md += "| Status | Document | Source Data | Days Old | Workflow | Local Command |\n"
    md += "|--------|----------|-------------|----------|----------|---------------|\n"

    for result in results:
        filename = result['filename']
        doc_link = f"[{filename}](./{filename})"

        source_display = format_date(result['source_date'])
        source_days_display = format_days_ago(result['source_days'])

        # Add freshness emoji based on source data date
        freshness_emoji = get_freshness_emoji(result['source_days'])

        # Get workflow link
        workflow_link = format_workflow_link(result.get('workflow_name'), result.get('workflow_file'))
        if not workflow_link:
            workflow_link = "_Local only_"

        # Get regeneration command
        if result['regen_command']:
            regen_display = f"`{result['regen_command']}`"
        else:
            regen_display = "_Unknown_"

        md += f"| {freshness_emoji} | {doc_link} | {source_display} | {source_days_display} | {workflow_link} | {regen_display} |\n"

    md += "\n## Regeneration Commands\n\n"
    md += "Quick reference for updating stale documents. "
    md += "Use **GitHub Workflows** for CI integration or **Local Commands** for development.\n\n"

    # Group by category
    categories = {
        'Spoiler Tests': [],
        'Multiclient Tests': [],
        'Multiworld Tests': [],
        'Fuzz Tests': [],
        'Charts & Reports': [],
    }

    for result in results:
        if not result['regen_command']:
            continue

        filename = result['filename']
        cmd = result['regen_command']
        desc = result['regen_description'] or filename
        workflow_name = result.get('workflow_name')
        workflow_file = result.get('workflow_file')

        if 'spoiler' in filename.lower() and 'fuzz' not in filename.lower():
            categories['Spoiler Tests'].append((desc, cmd, workflow_name, workflow_file))
        elif 'multiclient' in filename.lower():
            categories['Multiclient Tests'].append((desc, cmd, workflow_name, workflow_file))
        elif 'multiworld' in filename.lower():
            categories['Multiworld Tests'].append((desc, cmd, workflow_name, workflow_file))
        elif 'fuzz' in filename.lower():
            categories['Fuzz Tests'].append((desc, cmd, workflow_name, workflow_file))
        else:
            categories['Charts & Reports'].append((desc, cmd, workflow_name, workflow_file))

    for category, items in categories.items():
        if not items:
            continue
        md += f"### {category}\n\n"

        # Check if any items in this category have workflows
        has_workflows = any(wf_name for _, _, wf_name, _ in items)
        if has_workflows:
            md += "**GitHub Workflows:**\n"
            seen_workflows = set()
            for desc, cmd, wf_name, wf_file in items:
                if wf_name and wf_file and wf_name not in seen_workflows:
                    seen_workflows.add(wf_name)
                    md += f"- [{wf_name}](https://github.com/{GITHUB_REPO}/actions/workflows/{wf_file})\n"
            md += "\n"

        md += "**Local Commands:**\n"
        md += "```bash\n"
        for desc, cmd, _, _ in items:
            md += f"# {desc}\n{cmd}\n\n"
        md += "```\n\n"

    md += "## Freshness Legend\n\n"
    md += "- 🟢 **Fresh:** Source data from today or yesterday\n"
    md += "- 🟡 **Recent:** Source data within the last week\n"
    md += "- 🟠 **Aging:** Source data within the last month\n"
    md += "- 🔴 **Stale:** Source data over a month ago\n"
    md += "- ⚪ **Unknown:** No source data date found in document\n\n"

    md += "## Notes\n\n"
    md += "- **Source Data Date:** When the underlying test results were generated\n"
    md += "- **Workflow:** GitHub Actions workflow for CI-based regeneration (click to run)\n"
    md += "- **Local Command:** Terminal command to regenerate the document locally\n"
    md += "- The `-p` flag runs post-processing to generate the markdown charts\n"
    md += "- Documents marked _Local only_ have no automated workflow and must be run manually\n"
    md += f"- See [.github/workflows/README.md](https://github.com/{GITHUB_REPO}/blob/main/.github/workflows/README.md) for workflow documentation\n"
    md += "- To regenerate all documents at once, run: `python scripts/docs/generate-all-docs.py`\n"

    return md


def main():
    """Main entry point."""
    print("Scanning test result documents...")
    results = scan_test_results()

    if not results:
        print("No test result documents found.")
        return 1

    print(f"Found {len(results)} documents")

    # Run documentation sync scripts
    print("\nRunning documentation sync scripts...")
    sync_results = run_sync_scripts()
    for name, result in sync_results.items():
        if 'error' in result:
            print(f"  {name}: Error - {result['error']}")
        else:
            data = result['data']
            if 'coverage_percent' in data:
                print(f"  {name}: {data['coverage_percent']}% coverage")
            elif 'undocumented_count' in data:
                print(f"  {name}: {data['undocumented_count']} undocumented")

    md_content = generate_markdown(results, sync_results)

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Write the report
    OUTPUT_FILE.write_text(md_content, encoding='utf-8')
    print(f"\nFreshness report saved to: {OUTPUT_FILE}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
