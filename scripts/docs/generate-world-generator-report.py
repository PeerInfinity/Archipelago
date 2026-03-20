#!/usr/bin/env python3
"""
Generate markdown report from world generator test results.

This script reads the test-results.json file from the world generator tests
and generates a markdown summary report.

Usage:
    python scripts/docs/generate-world-generator-report.py
    python scripts/docs/generate-world-generator-report.py --test-mode both
    python scripts/docs/generate-world-generator-report.py --test-mode canonical
    python scripts/docs/generate-world-generator-report.py --test-mode random
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any


def get_project_root() -> str:
    """Get the project root directory."""
    return str(Path(__file__).parent.parent.parent)


def load_results(results_file: str) -> Optional[Dict]:
    """Load test results from JSON file."""
    if not os.path.exists(results_file):
        return None
    with open(results_file, 'r') as f:
        return json.load(f)


def get_status_emoji(success: bool, pass_fail: str = None) -> str:
    """Get status emoji for display."""
    if pass_fail == 'pass':
        return '✅'
    elif pass_fail == 'fail':
        return '❌'
    elif success:
        return '✅'
    else:
        return '❌'


def get_status_text(result: Dict, key: str) -> str:
    """Get status text for a result field."""
    if key not in result:
        return 'N/A'

    data = result[key]
    if isinstance(data, dict):
        if 'note' in data:
            return data['note']
        if 'pass_fail' in data:
            return data['pass_fail'].upper()
        if 'success' in data:
            return 'OK' if data['success'] else 'FAIL'
        if 'error' in data and data['error']:
            return 'ERROR'
    return 'N/A'


def compute_summary_stats(results: Dict) -> Dict:
    """Compute summary statistics from results data."""
    template_results = results.get('results', {})

    stats = {
        'total_templates': 0,
        'successful_generations': 0,
        'failed_generations': 0,
        'original_spoiler_passed': 0,
        'original_spoiler_failed': 0,
        'successful_test_worlds': 0,
        'failed_test_worlds': 0,
        'successful_test_seeds': 0,
        'failed_test_seeds': 0,
        'rules_comparison_passed': 0,
        'rules_comparison_failed': 0,
        'test_spoiler_passed': 0,
        'test_spoiler_failed': 0,
        'cross_validation_passed': 0,
        'cross_validation_failed': 0,
    }

    # Handle both dict and list formats
    if isinstance(template_results, dict):
        results_items = list(template_results.values())
    else:
        results_items = template_results

    stats['total_templates'] = len(results_items)

    for result in results_items:
        # Original generation
        orig_gen = result.get('original', {}).get('generation', {})
        if orig_gen.get('success'):
            stats['successful_generations'] += 1
        elif orig_gen:  # Only count as failed if there was an attempt
            stats['failed_generations'] += 1

        # Original spoiler test
        orig_spoiler = result.get('original', {}).get('spoiler_test', {})
        if orig_spoiler.get('pass_fail') == 'pass':
            stats['original_spoiler_passed'] += 1
        elif orig_spoiler.get('pass_fail') == 'fail':
            stats['original_spoiler_failed'] += 1

        # Stage 1: World generation (rules.json -> _worldgen world)
        world_gen = result.get('test_world', {}).get('world_generation', {})
        if world_gen.get('success'):
            stats['successful_test_worlds'] += 1
        elif world_gen:
            stats['failed_test_worlds'] += 1

        # Stage 2: Seed generation (_worldgen world -> seed)
        seed_gen = result.get('test_world', {}).get('seed_generation', {})
        if seed_gen.get('success'):
            stats['successful_test_seeds'] += 1
        elif seed_gen:
            stats['failed_test_seeds'] += 1

        # Stage 3: Rules comparison
        rules_comp = result.get('test_world', {}).get('rules_comparison', {})
        if rules_comp.get('pass_fail') == 'pass':
            stats['rules_comparison_passed'] += 1
        elif rules_comp.get('pass_fail') == 'fail':
            stats['rules_comparison_failed'] += 1

        # Stage 4: WorldGen spoiler test
        test_spoiler = result.get('test_world', {}).get('spoiler_test', {})
        if test_spoiler.get('pass_fail') == 'pass':
            stats['test_spoiler_passed'] += 1
        elif test_spoiler.get('pass_fail') == 'fail':
            stats['test_spoiler_failed'] += 1

        # Stage 5: Cross-validation
        cross_val = result.get('test_world', {}).get('cross_validation', {})
        if cross_val.get('pass_fail') == 'pass':
            stats['cross_validation_passed'] += 1
        elif cross_val.get('pass_fail') == 'fail':
            stats['cross_validation_failed'] += 1

    return stats


def extract_processing_times(results: Dict) -> Dict[str, Dict[str, float]]:
    """
    Extract processing times for each game from results.

    Returns dict mapping game_name to dict of timing categories:
    - original_gen: Original seed generation time
    - original_test: Original spoiler test time
    - world_gen: World generation time (Stage 1)
    - test_gen: Seed generation time (Stage 2)
    - test_spoiler: WorldGen spoiler test time (Stage 3)
    - cross_validation: Cross-validation time (Stage 4)
    """
    template_results = results.get('results', {})
    times = {}

    # Handle both dict and list formats
    if isinstance(template_results, dict):
        results_items = list(template_results.items())
    else:
        results_items = [(r.get('game_name', 'Unknown'), r) for r in template_results]

    for game_name, result in results_items:
        game_times = {}

        # Original generation time
        orig_gen = result.get('original', {}).get('generation', {})
        if orig_gen.get('processing_time_seconds'):
            game_times['original_gen'] = orig_gen['processing_time_seconds']

        # Original spoiler test time
        orig_test = result.get('original', {}).get('spoiler_test', {})
        if orig_test.get('processing_time_seconds'):
            game_times['original_test'] = orig_test['processing_time_seconds']

        # World generation time
        world_gen = result.get('test_world', {}).get('world_generation', {})
        if world_gen.get('processing_time_seconds'):
            game_times['world_gen'] = world_gen['processing_time_seconds']

        # Stage 2: Seed generation time
        test_gen = result.get('test_world', {}).get('seed_generation', {})
        if test_gen.get('processing_time_seconds'):
            game_times['test_gen'] = test_gen['processing_time_seconds']

        # Stage 3: WorldGen spoiler test time
        test_spoiler = result.get('test_world', {}).get('spoiler_test', {})
        if test_spoiler.get('processing_time_seconds'):
            game_times['test_spoiler'] = test_spoiler['processing_time_seconds']

        # Cross-validation time
        cross_val = result.get('test_world', {}).get('cross_validation', {})
        if cross_val.get('processing_time_seconds'):
            game_times['cross_validation'] = cross_val['processing_time_seconds']

        if game_times:
            times[game_name] = game_times

    return times


def compute_time_statistics(times: Dict[str, Dict[str, float]], category: str) -> Dict[str, Any]:
    """Compute statistics for a specific timing category."""
    values = []
    for game_name, game_times in times.items():
        if category in game_times:
            values.append((game_name, game_times[category]))

    if not values:
        return {'total': 0, 'average': 0, 'max': 0, 'min': 0, 'count': 0,
                'slowest': ('N/A', 0), 'fastest': ('N/A', 0)}

    times_only = [v[1] for v in values]
    sorted_by_time = sorted(values, key=lambda x: x[1], reverse=True)

    return {
        'total': sum(times_only),
        'average': sum(times_only) / len(times_only),
        'max': max(times_only),
        'min': min(times_only),
        'count': len(values),
        'slowest': sorted_by_time[0],
        'fastest': sorted_by_time[-1],
        'top_10': sorted_by_time[:10]
    }


def generate_time_summary_table(times: Dict[str, Dict[str, float]]) -> str:
    """Generate summary statistics table for processing times."""
    categories = [
        ('original_gen', 'Original Gen'),
        ('original_test', 'Original Spoiler'),
        ('world_gen', 'World Gen'),
        ('test_gen', 'Seed Gen'),
        ('test_spoiler', 'WorldGen Spoiler'),
        ('cross_validation', 'Cross-Val')
    ]

    stats = {cat: compute_time_statistics(times, cat) for cat, _ in categories}

    lines = [
        "### Summary Statistics",
        "",
        "| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |",
        "|--------|--------------|------------------|-----------|----------|------------------|-----------|",
    ]

    # Total row
    row = "| Total |"
    for cat, _ in categories:
        row += f" {stats[cat]['total']:.1f}s |"
    lines.append(row)

    # Average row
    row = "| Average |"
    for cat, _ in categories:
        row += f" {stats[cat]['average']:.1f}s |"
    lines.append(row)

    # Max row
    row = "| Max |"
    for cat, _ in categories:
        row += f" {stats[cat]['max']:.1f}s |"
    lines.append(row)

    # Min row
    row = "| Min |"
    for cat, _ in categories:
        if stats[cat]['count'] > 0:
            row += f" {stats[cat]['min']:.1f}s |"
        else:
            row += " N/A |"
    lines.append(row)

    lines.append("")
    return '\n'.join(lines)


def generate_slowest_fastest_table(times: Dict[str, Dict[str, float]]) -> str:
    """Generate table showing slowest and fastest games per category."""
    categories = [
        ('original_gen', 'Original Gen'),
        ('original_test', 'Original Spoiler'),
        ('world_gen', 'World Gen'),
        ('test_gen', 'Seed Gen'),
        ('test_spoiler', 'WorldGen Spoiler'),
        ('cross_validation', 'Cross-Val')
    ]

    stats = {cat: compute_time_statistics(times, cat) for cat, _ in categories}

    lines = [
        "### Slowest and Fastest Games",
        "",
        "| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |",
        "|--------|--------------|------------------|-----------|----------|------------------|-----------|",
    ]

    # Slowest row
    row = "| Slowest |"
    for cat, _ in categories:
        name, time = stats[cat]['slowest']
        if name != 'N/A':
            row += f" {name} ({time:.1f}s) |"
        else:
            row += " N/A |"
    lines.append(row)

    # Fastest row
    row = "| Fastest |"
    for cat, _ in categories:
        name, time = stats[cat]['fastest']
        if name != 'N/A':
            row += f" {name} ({time:.1f}s) |"
        else:
            row += " N/A |"
    lines.append(row)

    lines.append("")
    return '\n'.join(lines)


def generate_processing_times_table(times: Dict[str, Dict[str, float]]) -> str:
    """Generate table with processing times for each game."""
    lines = [
        "### Individual Game Processing Times",
        "",
        "| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |",
        "|------|--------------|------------------|-----------|----------|------------------|-----------|",
    ]

    for game_name in sorted(times.keys()):
        game_times = times[game_name]
        row = f"| {game_name} |"
        for cat in ['original_gen', 'original_test', 'world_gen', 'test_gen', 'test_spoiler', 'cross_validation']:
            if cat in game_times:
                row += f" {game_times[cat]:.1f}s |"
            else:
                row += " - |"
        lines.append(row)

    lines.append("")
    return '\n'.join(lines)


def generate_top_10_section(times: Dict[str, Dict[str, float]]) -> str:
    """Generate section showing top 10 longest times for each category."""
    categories = [
        ('original_gen', 'Original Generation'),
        ('original_test', 'Original Spoiler Test'),
        ('world_gen', 'World Generation'),
        ('test_gen', 'Seed Generation'),
        ('test_spoiler', 'WorldGen Spoiler Test'),
        ('cross_validation', 'Cross-Validation')
    ]

    lines = [
        "### Top 10 Longest Processing Times",
        "",
    ]

    for cat, display_name in categories:
        stats = compute_time_statistics(times, cat)
        top_10 = stats.get('top_10', [])

        if not top_10:
            continue

        lines.append(f"#### {display_name}")
        lines.append("")
        lines.append("| Rank | Game | Time |")
        lines.append("|------|------|------|")

        for i, (game_name, time) in enumerate(top_10, 1):
            lines.append(f"| {i} | {game_name} | {time:.1f}s |")

        lines.append("")

    return '\n'.join(lines)


def generate_processing_times_section(results: Dict, title: str = "Processing Times") -> str:
    """Generate complete processing times section."""
    times = extract_processing_times(results)

    if not times:
        return f"## {title}\n\nNo processing time data available.\n"

    lines = [
        f"## {title}",
        "",
        "Processing times for each test phase. Times are in seconds.",
        "",
    ]

    lines.append(generate_time_summary_table(times))
    lines.append(generate_slowest_fastest_table(times))
    lines.append(generate_processing_times_table(times))
    lines.append(generate_top_10_section(times))

    return '\n'.join(lines)


def generate_summary_table(results: Dict, title: str = "Summary") -> str:
    """Generate the summary statistics table."""
    meta = results.get('metadata', {})

    # Always compute stats from actual results data
    # (metadata.total_templates may be stale from combine-test-results splits)
    stats = compute_summary_stats(results)

    # Calculate totals for each step
    orig_gen_total = stats.get('successful_generations', 0) + stats.get('failed_generations', 0)
    orig_spoiler_total = stats.get('original_spoiler_passed', 0) + stats.get('original_spoiler_failed', 0)
    world_gen_total = stats.get('successful_test_worlds', 0) + stats.get('failed_test_worlds', 0)
    test_seed_total = stats.get('successful_test_seeds', 0) + stats.get('failed_test_seeds', 0)
    rules_comp_total = stats.get('rules_comparison_passed', 0) + stats.get('rules_comparison_failed', 0)
    test_spoiler_total = stats.get('test_spoiler_passed', 0) + stats.get('test_spoiler_failed', 0)
    cross_val_total = stats.get('cross_validation_passed', 0) + stats.get('cross_validation_failed', 0)

    lines = [
        f"## {title}",
        "",
        f"**Total Templates:** {stats.get('total_templates', 0)}",
        "",
        "| Step | Passed | Failed | Total |",
        "|------|--------|--------|-------|",
        f"| Original Generation | {stats.get('successful_generations', 0)} | {stats.get('failed_generations', 0)} | {orig_gen_total} |",
        f"| Original Spoiler Test | {stats.get('original_spoiler_passed', 0)} | {stats.get('original_spoiler_failed', 0)} | {orig_spoiler_total} |",
        f"| Stage 1: World Generation | {stats.get('successful_test_worlds', 0)} | {stats.get('failed_test_worlds', 0)} | {world_gen_total} |",
        f"| Stage 2: Seed Generation | {stats.get('successful_test_seeds', 0)} | {stats.get('failed_test_seeds', 0)} | {test_seed_total} |",
        f"| Stage 3: Rules Comparison | {stats.get('rules_comparison_passed', 0)} | {stats.get('rules_comparison_failed', 0)} | {rules_comp_total} |",
        f"| Stage 4: WorldGen Spoiler Test | {stats.get('test_spoiler_passed', 0)} | {stats.get('test_spoiler_failed', 0)} | {test_spoiler_total} |",
        f"| Stage 5: Cross-Validation | {stats.get('cross_validation_passed', 0)} | {stats.get('cross_validation_failed', 0)} | {cross_val_total} |",
        "",
    ]

    return '\n'.join(lines)


def generate_results_table(results: Dict, title: str = "Detailed Results") -> str:
    """Generate the detailed results table."""
    template_results = results.get('results', {})

    if not template_results:
        return "No test results available.\n"

    lines = [
        f"## {title}",
        "",
        "| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | Rules Comp | WorldGen Spoiler | Cross-Validation |",
        "|------|--------------|------------------|-----------|----------|------------|------------------|------------------|",
    ]

    # Handle both dict and list formats
    if isinstance(template_results, dict):
        # Dict format: key is game name, value is result
        sorted_items = sorted(template_results.items(), key=lambda x: x[0])
        sorted_results = [(key, value) for key, value in sorted_items]
    else:
        # List format: game_name is inside each result
        sorted_results = [(r.get('game_name', 'Unknown'), r) for r in sorted(template_results, key=lambda x: x.get('game_name', ''))]

    for game_name, result in sorted_results:

        # Original generation
        orig_gen = result.get('original', {}).get('generation', {})
        orig_gen_status = '✅' if orig_gen.get('success') else '❌'

        # Original spoiler test
        orig_test = result.get('original', {}).get('spoiler_test', {})
        orig_test_status = get_status_emoji(False, orig_test.get('pass_fail'))
        if orig_test.get('note'):
            orig_test_status = 'Skipped'

        # World generation
        world_gen = result.get('test_world', {}).get('world_generation', {})
        world_gen_status = '✅' if world_gen.get('success') else '❌'
        if not orig_gen.get('success'):
            world_gen_status = '-'

        # Stage 2: Seed generation
        test_gen = result.get('test_world', {}).get('seed_generation', {})
        test_gen_status = '✅' if test_gen.get('success') else '❌'
        if not world_gen.get('success'):
            test_gen_status = '-'

        # Stage 3: Rules comparison
        rules_comp = result.get('test_world', {}).get('rules_comparison', {})
        rules_comp_status = get_status_emoji(False, rules_comp.get('pass_fail'))
        if rules_comp.get('note'):
            rules_comp_status = 'Skipped'
        if not test_gen.get('success'):
            rules_comp_status = '-'

        # Stage 4: WorldGen spoiler test
        test_spoiler = result.get('test_world', {}).get('spoiler_test', {})
        test_spoiler_status = get_status_emoji(False, test_spoiler.get('pass_fail'))
        if test_spoiler.get('note'):
            test_spoiler_status = 'Skipped'
        if not test_gen.get('success'):
            test_spoiler_status = '-'

        # Stage 5: Cross-validation
        cross_val = result.get('test_world', {}).get('cross_validation', {})
        cross_val_status = get_status_emoji(False, cross_val.get('pass_fail'))
        if cross_val.get('note'):
            cross_val_status = 'Skipped'
        if cross_val.get('error'):
            cross_val_status = 'Error'
        if not test_gen.get('success'):
            cross_val_status = '-'

        lines.append(
            f"| {game_name} | {orig_gen_status} | {orig_test_status} | {world_gen_status} | "
            f"{test_gen_status} | {rules_comp_status} | {test_spoiler_status} | {cross_val_status} |"
        )

    lines.append("")
    return '\n'.join(lines)


def normalize_errors(errors) -> Dict[str, List[str]]:
    """
    Normalize errors to dict format with 'generation' and 'testing' keys.

    Handles both old format (list) and new format (dict with phase keys).
    """
    if errors is None:
        return {'generation': [], 'testing': []}
    elif isinstance(errors, list):
        # Old format - treat all as generation errors
        return {'generation': errors, 'testing': []}
    elif isinstance(errors, dict):
        return {
            'generation': errors.get('generation', []),
            'testing': errors.get('testing', [])
        }
    else:
        return {'generation': [], 'testing': []}


def has_errors(errors) -> bool:
    """Check if there are any errors (handles both old and new formats)."""
    normalized = normalize_errors(errors)
    return bool(normalized['generation']) or bool(normalized['testing'])


def generate_failures_section(results: Dict, title: str = "Failures") -> str:
    """Generate section listing all failures with details."""
    template_results = results.get('results', {})

    # Handle both dict and list formats
    if isinstance(template_results, dict):
        # Dict format: key is game name, value is result
        results_items = [(key, value) for key, value in template_results.items()]
    else:
        # List format: game_name is inside each result
        results_items = [(r.get('game_name', 'Unknown'), r) for r in template_results]

    failures = []
    for game_name, result in results_items:
        errors = result.get('errors')
        if has_errors(errors):
            failures.append({
                'game_name': game_name,
                'errors': normalize_errors(errors)
            })

    if not failures:
        return f"## {title}\n\nNo failures recorded.\n"

    lines = [
        f"## {title}",
        "",
        f"**{len(failures)} games had errors:**",
        "",
    ]

    for failure in sorted(failures, key=lambda x: x['game_name']):
        lines.append(f"### {failure['game_name']}")
        lines.append("")

        errors = failure['errors']

        # Display generation errors
        if errors['generation']:
            lines.append("**Generation phase:**")
            for error in errors['generation']:
                # Truncate long error messages
                if len(error) > 200:
                    error = error[:200] + "..."
                lines.append(f"- {error}")
            lines.append("")

        # Display testing errors
        if errors['testing']:
            lines.append("**Testing phase:**")
            for error in errors['testing']:
                # Truncate long error messages
                if len(error) > 200:
                    error = error[:200] + "..."
                lines.append(f"- {error}")
            lines.append("")

    return '\n'.join(lines)


def get_seed_display(meta: Dict) -> str:
    """Get seed display string from metadata."""
    if 'seed' in meta:
        return str(meta['seed'])
    elif 'seeds' in meta:
        return ', '.join(str(s) for s in meta['seeds'])
    else:
        return 'N/A'


def get_source_data_timestamps(meta: Dict) -> tuple:
    """Get formatted source data timestamps from metadata.

    Returns:
        Tuple of (created_display, last_updated_display) or (None, None) if not available.
    """
    created = meta.get('created')
    last_updated = meta.get('last_updated')

    created_display = None
    last_updated_display = None

    if created:
        try:
            dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
            created_display = dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            created_display = created

    if last_updated:
        try:
            dt = datetime.fromisoformat(last_updated.replace('Z', '+00:00'))
            last_updated_display = dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            last_updated_display = last_updated

    return created_display, last_updated_display


def generate_single_mode_report(results: Dict, mode_name: str = None) -> str:
    """Generate report for a single test mode."""
    meta = results.get('metadata', {})

    generated_display = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    created_display, last_updated_display = get_source_data_timestamps(meta)
    seed_display = get_seed_display(meta)

    # Determine canonical seed setting (with backwards-compat for old test-results files)
    canonical = meta.get('canonical_seed', meta.get('canonical_seed1'))
    mode_display = f"Canonical (seed {canonical} placement)" if canonical is not None else "Random"
    if mode_name:
        mode_display = mode_name

    lines = [
        "# World Generator Test Results",
        "",
        "[<- Back to Test Results Summary](./test-results-summary.md)",
        "",
        "[📖 Learn about this test](../tests/test-world-generator.md)",
        "",
        f"**Generated:** {generated_display}",
        "",
    ]

    # Add source data timestamps if available
    if created_display:
        lines.append(f"**Source Data Created:** {created_display}")
        lines.append("")
    if last_updated_display:
        lines.append(f"**Source Data Last Updated:** {last_updated_display}")
        lines.append("")

    lines.extend([
        f"**Seed:** {seed_display}",
        "",
        f"**Mode:** {mode_display}",
        "",
        "This report shows the results of round-trip testing the world generator.",
        "Each game's rules.json is converted to a `_worldgen` world, and the generated",
        "world is validated to produce equivalent game logic.",
        "",
        "## Legend",
        "",
        "- ✅ - Success/Pass",
        "- ❌ - Failure",
        "- `-` - Not applicable (previous step failed)",
        "- `Skipped` - Test was skipped",
        "- `Error` - An error occurred",
        "",
        "### Columns",
        "",
        "**Original World Tests** (prerequisite - must pass before worldgen testing):",
        "- **Original Gen**: Generate a seed with the original Archipelago world",
        "- **Original Spoiler**: Validate the original world's sphere log against its rules.json",
        "",
        "**World Generator Tests** (the actual round-trip test):",
        "- **World Gen** (Stage 1): Create `_worldgen` Python world files from rules.json",
        "- **Seed Gen** (Stage 2): Generate a seed with the `_worldgen` world",
        "- **Rules Comp** (Stage 3): Compare original rules.json with `_worldgen` rules.json",
        "- **WorldGen Spoiler** (Stage 4): Validate the `_worldgen` world's sphere log against its rules",
        "- **Cross-Validation** (Stage 5): Validate the **original** sphere log against `_worldgen` rules (proves equivalent logic)",
        "",
    ])

    lines.append(generate_summary_table(results))
    lines.append(generate_results_table(results))

    # Add processing times section
    lines.append("---")
    lines.append("")
    lines.append(generate_processing_times_section(results))

    return '\n'.join(lines)


def generate_dual_mode_report(canonical_results: Dict, random_results: Dict) -> str:
    """Generate report comparing canonical and random test modes."""
    # Use canonical results for primary metadata (it runs first)
    canonical_meta = canonical_results.get('metadata', {})
    random_meta = random_results.get('metadata', {})

    generated_display = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    created_display, last_updated_display = get_source_data_timestamps(canonical_meta)
    seed_display = get_seed_display(canonical_meta)

    lines = [
        "# World Generator Test Results",
        "",
        "[<- Back to Test Results Summary](./test-results-summary.md)",
        "",
        "[📖 Learn about this test](../tests/test-world-generator.md)",
        "",
        f"**Generated:** {generated_display}",
        "",
    ]

    # Add source data timestamps if available
    if created_display:
        lines.append(f"**Source Data Created:** {created_display}")
        lines.append("")
    if last_updated_display:
        lines.append(f"**Source Data Last Updated:** {last_updated_display}")
        lines.append("")

    lines.extend([
        f"**Seed:** {seed_display}",
        "",
        f"**Mode:** Both (Canonical and Random)",
        "",
        "This report shows the results of round-trip testing the world generator.",
        "Each game's rules.json is converted to a `_worldgen` world, and the generated",
        "world is validated to produce equivalent game logic.",
        "",
        "Tests are run in two modes:",
        "- **Canonical**: Uses `--canonical-seed` which places items in their original locations when seed matches",
        "- **Random**: Standard randomized item placement",
        "",
        "## Legend",
        "",
        "- ✅ - Success/Pass",
        "- ❌ - Failure",
        "- `-` - Not applicable (previous step failed)",
        "- `Skipped` - Test was skipped",
        "- `Error` - An error occurred",
        "",
        "### Columns",
        "",
        "**Original World Tests** (prerequisite - must pass before worldgen testing):",
        "- **Original Gen**: Generate a seed with the original Archipelago world",
        "- **Original Spoiler**: Validate the original world's sphere log against its rules.json",
        "",
        "**World Generator Tests** (the actual round-trip test):",
        "- **World Gen** (Stage 1): Create `_worldgen` Python world files from rules.json",
        "- **Seed Gen** (Stage 2): Generate a seed with the `_worldgen` world",
        "- **Rules Comp** (Stage 3): Compare original rules.json with `_worldgen` rules.json",
        "- **WorldGen Spoiler** (Stage 4): Validate the `_worldgen` world's sphere log against its rules",
        "- **Cross-Validation** (Stage 5): Validate the **original** sphere log against `_worldgen` rules (proves equivalent logic)",
        "",
        "---",
        "",
        "# Canonical Mode Results",
        "",
        "Tests run with `--canonical-seed` (items placed in original locations).",
        "",
    ])

    lines.append(generate_summary_table(canonical_results, "Canonical Summary"))
    lines.append(generate_results_table(canonical_results, "Canonical Detailed Results"))

    lines.append("---")
    lines.append("")
    lines.append("# Random Mode Results")
    lines.append("")
    lines.append("Tests run with standard randomized item placement.")
    lines.append("")

    lines.append(generate_summary_table(random_results, "Random Summary"))
    lines.append(generate_results_table(random_results, "Random Detailed Results"))

    # Add processing times sections
    lines.append("---")
    lines.append("")
    lines.append("# Processing Times")
    lines.append("")

    lines.append(generate_processing_times_section(canonical_results, "Canonical Processing Times"))
    lines.append("---")
    lines.append("")
    lines.append(generate_processing_times_section(random_results, "Random Processing Times"))

    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(
        description='Generate markdown report from world generator test results'
    )
    parser.add_argument(
        '--test-mode',
        type=str,
        choices=['canonical', 'random', 'both'],
        default='both',
        help='Test mode: canonical, random, or both (default: both)'
    )

    args = parser.parse_args()

    project_root = get_project_root()
    output_dir = os.path.join(project_root, 'scripts', 'output', 'world-generator')

    # Output file
    output_file = os.path.join(
        project_root, 'docs', 'json', 'developer', 'test-results',
        'test-results-world-generator.md'
    )

    # Load results based on test mode
    canonical_results = None
    random_results = None

    if args.test_mode in ['canonical', 'both']:
        canonical_file = os.path.join(output_dir, 'test-results-canonical.json')
        print(f"Loading canonical results from: {canonical_file}")
        canonical_results = load_results(canonical_file)
        if canonical_results:
            print(f"  Loaded {len(canonical_results.get('results', {}))} results")
        else:
            print(f"  Warning: Could not load canonical results")

    if args.test_mode in ['random', 'both']:
        random_file = os.path.join(output_dir, 'test-results-random.json')
        print(f"Loading random results from: {random_file}")
        random_results = load_results(random_file)
        if random_results:
            print(f"  Loaded {len(random_results.get('results', {}))} results")
        else:
            print(f"  Warning: Could not load random results")

    # Also try legacy single file if mode-specific files not found
    if not canonical_results and not random_results:
        legacy_file = os.path.join(output_dir, 'test-results.json')
        print(f"Trying legacy results file: {legacy_file}")
        legacy_results = load_results(legacy_file)
        if legacy_results:
            # Determine mode from metadata
            meta = legacy_results.get('metadata', {})
            if meta.get('canonical_seed', meta.get('canonical_seed1')):
                canonical_results = legacy_results
            else:
                random_results = legacy_results

    # Generate report
    print(f"Generating report...")

    if args.test_mode == 'both' and canonical_results and random_results:
        report = generate_dual_mode_report(canonical_results, random_results)
    elif args.test_mode == 'canonical' and canonical_results:
        report = generate_single_mode_report(canonical_results, "Canonical (seed1 placement)")
    elif args.test_mode == 'random' and random_results:
        report = generate_single_mode_report(random_results, "Random")
    elif canonical_results:
        report = generate_single_mode_report(canonical_results, "Canonical (seed1 placement)")
    elif random_results:
        report = generate_single_mode_report(random_results, "Random")
    else:
        print("Error: No results files found")
        return 1

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    # Write report
    with open(output_file, 'w') as f:
        f.write(report)

    print(f"Report written to: {output_file}")

    # Print summary
    if canonical_results:
        stats = compute_summary_stats(canonical_results)
        print(f"\nCanonical Summary:")
        print(f"  Total templates: {stats.get('total_templates', 0)}")
        print(f"  Successful test seeds: {stats.get('successful_test_seeds', 0)}")
        print(f"  Cross-validation passed: {stats.get('cross_validation_passed', 0)}")

    if random_results:
        stats = compute_summary_stats(random_results)
        print(f"\nRandom Summary:")
        print(f"  Total templates: {stats.get('total_templates', 0)}")
        print(f"  Successful test seeds: {stats.get('successful_test_seeds', 0)}")
        print(f"  Cross-validation passed: {stats.get('cross_validation_passed', 0)}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
