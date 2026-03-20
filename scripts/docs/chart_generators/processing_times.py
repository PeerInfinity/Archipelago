"""
Processing times chart data extraction and markdown generation.
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional


def extract_processing_times_data(minimal_results: Dict, full_results: Dict, multiclient_results: Dict, multiworld_results: Dict) -> Dict[str, Any]:
    """
    Extract processing time data from all test result types.
    For results with multiple seeds, only uses the first seed's data.

    Returns dict with:
        - games: list of dicts with processing times for each game
        - multiworld_top_generation: top 10 longest generation times
        - multiworld_top_test: top 10 longest test times
    """
    games = {}

    # Process minimal spoiler results
    if minimal_results and 'results' in minimal_results:
        for template_name, data in minimal_results['results'].items():
            if not isinstance(data, dict):
                continue

            game_name = data.get('world_info', {}).get('game_name_from_yaml') or template_name.replace('.yaml', '')

            if game_name not in games:
                games[game_name] = {
                    'game_name': game_name,
                    'template_filename': template_name,
                    'minimal_gen_time': None,
                    'minimal_test_time': None,
                    'full_test_time': None,
                    'multiclient_time': None
                }

            # Get generation time (from first seed if multiple)
            gen_data = data.get('generation', {})
            if 'individual_results' in data:
                # Multiple seeds - get first seed
                first_seed = min(data['individual_results'].keys(), key=lambda x: int(x))
                gen_data = data['individual_results'][first_seed].get('generation', {})
            games[game_name]['minimal_gen_time'] = gen_data.get('processing_time_seconds')

            # Get spoiler test time
            test_data = data.get('spoiler_test', {})
            if 'individual_results' in data:
                first_seed = min(data['individual_results'].keys(), key=lambda x: int(x))
                test_data = data['individual_results'][first_seed].get('spoiler_test', {})
            games[game_name]['minimal_test_time'] = test_data.get('processing_time_seconds')

    # Process full spoiler results (only test time - generation is same as minimal)
    if full_results and 'results' in full_results:
        for template_name, data in full_results['results'].items():
            if not isinstance(data, dict):
                continue

            game_name = data.get('world_info', {}).get('game_name_from_yaml') or template_name.replace('.yaml', '')

            if game_name not in games:
                games[game_name] = {
                    'game_name': game_name,
                    'template_filename': template_name,
                    'minimal_gen_time': None,
                    'minimal_test_time': None,
                    'full_test_time': None,
                    'multiclient_time': None
                }

            test_data = data.get('spoiler_test', {})
            if 'individual_results' in data:
                first_seed = min(data['individual_results'].keys(), key=lambda x: int(x))
                test_data = data['individual_results'][first_seed].get('spoiler_test', {})
            games[game_name]['full_test_time'] = test_data.get('processing_time_seconds')

    # Process multiclient results
    if multiclient_results and 'results' in multiclient_results:
        for template_name, data in multiclient_results['results'].items():
            if not isinstance(data, dict):
                continue

            game_name = data.get('world_info', {}).get('game_name_from_yaml') or template_name.replace('.yaml', '')

            if game_name not in games:
                games[game_name] = {
                    'game_name': game_name,
                    'template_filename': template_name,
                    'minimal_gen_time': None,
                    'minimal_test_time': None,
                    'full_test_time': None,
                    'multiclient_time': None
                }

            test_data = data.get('multiclient_test', {})
            if 'individual_results' in data:
                first_seed = min(data['individual_results'].keys(), key=lambda x: int(x))
                test_data = data['individual_results'][first_seed].get('multiclient_test', {})
            games[game_name]['multiclient_time'] = test_data.get('processing_time_seconds')

    # Process multiworld results - collect top 10 generation and test times
    multiworld_generation_times = []
    multiworld_test_times = []

    if multiworld_results and 'results' in multiworld_results:
        for template_name, data in multiworld_results['results'].items():
            if not isinstance(data, dict):
                continue

            game_name = data.get('world_info', {}).get('game_name_from_yaml') or template_name.replace('.yaml', '')
            multiworld_test = data.get('multiworld_test', {})

            # Get templates that were in the multiworld
            templates_in_multiworld = multiworld_test.get('templates_in_multiworld', {})
            template_list = list(templates_in_multiworld.values()) if templates_in_multiworld else [template_name]

            # Generation time
            gen_time = data.get('generation', {}).get('processing_time_seconds')
            if gen_time is not None:
                multiworld_generation_times.append({
                    'game_name': game_name,
                    'template_filename': template_name,
                    'time': gen_time,
                    'templates_in_multiworld': template_list,
                    'player_count': len(template_list)
                })

            # Test time
            test_time = multiworld_test.get('processing_time_seconds')
            if test_time is not None:
                multiworld_test_times.append({
                    'game_name': game_name,
                    'template_filename': template_name,
                    'time': test_time,
                    'templates_in_multiworld': template_list,
                    'player_count': len(template_list)
                })

    # Sort and get top 10
    multiworld_generation_times.sort(key=lambda x: x['time'], reverse=True)
    multiworld_test_times.sort(key=lambda x: x['time'], reverse=True)

    return {
        'games': sorted(games.values(), key=lambda x: x['game_name']),
        'multiworld_top_generation': multiworld_generation_times[:10],
        'multiworld_top_test': multiworld_test_times[:10]
    }


def generate_processing_times_markdown(processing_data: Dict[str, Any],
                                        variant_type: Optional[str] = None,
                                        version_links: Optional[Dict[str, str]] = None,
                                        metadata: Optional[Dict[str, Any]] = None) -> str:
    """Generate markdown content for processing times chart.

    Args:
        processing_data: Dict with processing times data from extract_processing_times_data
        variant_type: None for original, "worldgen" for WorldGen, "apworld" for APWorld
        version_links: Dict mapping variant names to links, e.g. {"worldgen": "./file.md", "apworld": "./file.md"}
        metadata: Optional metadata dict with 'created' and 'last_updated' timestamps
    """
    # Determine title suffix based on variant type
    if variant_type == "worldgen":
        title_suffix = " (WorldGen)"
    elif variant_type == "apworld":
        title_suffix = " (APWorld)"
    else:
        title_suffix = ""

    md_content = f"# Processing Times Chart{title_suffix}\n\n"
    md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    # Add source data metadata if available
    if metadata and ('created' in metadata or 'last_updated' in metadata):
        if 'created' in metadata:
            md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        if 'last_updated' in metadata:
            md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"

    # Add link to summary document
    summary_suffix = f"-{variant_type}" if variant_type else ""
    md_content += f"[← Back to Test Results Summary](./test-results-summary{summary_suffix}.md)\n\n"

    # Add cross-links to other versions
    if version_links:
        for variant, link in sorted(version_links.items()):
            if variant == "worldgen":
                md_content += f"[View WorldGen Processing Times]({link})\n\n"
            elif variant == "apworld":
                md_content += f"[View APWorld Processing Times]({link})\n\n"
            elif variant == "original":
                md_content += f"[View Original Processing Times]({link})\n\n"

    md_content += "This chart shows processing times for each test phase. "
    md_content += "Times are in seconds. For tests with multiple seeds, only the first seed's time is shown.\n\n"

    games = processing_data.get('games', [])

    # Summary statistics (before individual results)
    if games:
        gen_times = [(g['minimal_gen_time'], g['game_name']) for g in games if g['minimal_gen_time'] is not None]
        min_times = [(g['minimal_test_time'], g['game_name']) for g in games if g['minimal_test_time'] is not None]
        full_times = [(g['full_test_time'], g['game_name']) for g in games if g['full_test_time'] is not None]
        mc_times = [(g['multiclient_time'], g['game_name']) for g in games if g['multiclient_time'] is not None]

        if gen_times:
            gen_vals = [t[0] for t in gen_times]
            min_vals = [t[0] for t in min_times]
            full_vals = [t[0] for t in full_times]
            mc_vals = [t[0] for t in mc_times]

            # Helper functions for safe calculations
            def fmt_total(vals):
                return f"{sum(vals):.1f}s" if vals else "-"

            def fmt_avg(vals):
                return f"{sum(vals)/len(vals):.1f}s" if vals else "-"

            def fmt_max(vals):
                return f"{max(vals):.1f}s" if vals else "-"

            def fmt_min(vals):
                return f"{min(vals):.1f}s" if vals else "-"

            md_content += "## Summary Statistics\n\n"
            md_content += "| Metric | Gen Time | Minimal Test | Full Test | Multiclient |\n"
            md_content += "|--------|----------|--------------|-----------|-------------|\n"
            md_content += f"| Total | {fmt_total(gen_vals)} | {fmt_total(min_vals)} | {fmt_total(full_vals)} | {fmt_total(mc_vals)} |\n"
            md_content += f"| Average | {fmt_avg(gen_vals)} | {fmt_avg(min_vals)} | {fmt_avg(full_vals)} | {fmt_avg(mc_vals)} |\n"
            md_content += f"| Max | {fmt_max(gen_vals)} | {fmt_max(min_vals)} | {fmt_max(full_vals)} | {fmt_max(mc_vals)} |\n"
            md_content += f"| Min | {fmt_min(gen_vals)} | {fmt_min(min_vals)} | {fmt_min(full_vals)} | {fmt_min(mc_vals)} |\n"

            # Helper for slowest/fastest with game names
            def fmt_extreme(times, is_max):
                if not times:
                    return "-"
                extreme = max(times, key=lambda x: x[0]) if is_max else min(times, key=lambda x: x[0])
                return f"{extreme[1]} ({extreme[0]:.1f}s)"

            md_content += "\n## Slowest and Fastest Games\n\n"
            md_content += "| Metric | Gen Time | Minimal Test | Full Test | Multiclient |\n"
            md_content += "|--------|----------|--------------|-----------|-------------|\n"
            md_content += f"| Slowest | {fmt_extreme(gen_times, True)} | {fmt_extreme(min_times, True)} | {fmt_extreme(full_times, True)} | {fmt_extreme(mc_times, True)} |\n"
            md_content += f"| Fastest | {fmt_extreme(gen_times, False)} | {fmt_extreme(min_times, False)} | {fmt_extreme(full_times, False)} | {fmt_extreme(mc_times, False)} |\n"

    # Individual game processing times table
    md_content += "\n## Individual Game Processing Times\n\n"
    md_content += "| Game | Gen Time | Minimal Test | Full Test | Multiclient |\n"
    md_content += "|------|----------|--------------|-----------|-------------|\n"

    for game in games:
        game_name = game['game_name']
        gen_time = f"{game['minimal_gen_time']:.1f}s" if game['minimal_gen_time'] is not None else "-"
        min_test = f"{game['minimal_test_time']:.1f}s" if game['minimal_test_time'] is not None else "-"
        full_test = f"{game['full_test_time']:.1f}s" if game['full_test_time'] is not None else "-"
        mc_test = f"{game['multiclient_time']:.1f}s" if game['multiclient_time'] is not None else "-"

        md_content += f"| {game_name} | {gen_time} | {min_test} | {full_test} | {mc_test} |\n"

    # Multiworld top 10 section
    md_content += "\n## Multiworld Test - Longest Processing Times\n\n"
    md_content += "Shows the 10 longest generation and test times from multiworld testing.\n\n"

    # Top 10 generation times
    top_gen = processing_data.get('multiworld_top_generation', [])
    if top_gen:
        md_content += "### Top 10 Longest Generation Times\n\n"
        md_content += "| Rank | Game | Time | Players | Templates in Multiworld |\n"
        md_content += "|------|------|------|---------|------------------------|\n"

        for i, entry in enumerate(top_gen, 1):
            templates_str = ", ".join(entry['templates_in_multiworld'][:5])
            if len(entry['templates_in_multiworld']) > 5:
                templates_str += f" (+{len(entry['templates_in_multiworld']) - 5} more)"
            md_content += f"| {i} | {entry['game_name']} | {entry['time']:.1f}s | {entry['player_count']} | {templates_str} |\n"
    else:
        md_content += "### Top 10 Longest Generation Times\n\nNo multiworld generation data available.\n"

    # Top 10 test times
    top_test = processing_data.get('multiworld_top_test', [])
    if top_test:
        md_content += "\n### Top 10 Longest Test Times\n\n"
        md_content += "| Rank | Game | Time | Players | Templates in Multiworld |\n"
        md_content += "|------|------|------|---------|------------------------|\n"

        for i, entry in enumerate(top_test, 1):
            templates_str = ", ".join(entry['templates_in_multiworld'][:5])
            if len(entry['templates_in_multiworld']) > 5:
                templates_str += f" (+{len(entry['templates_in_multiworld']) - 5} more)"
            md_content += f"| {i} | {entry['game_name']} | {entry['time']:.1f}s | {entry['player_count']} | {templates_str} |\n"
    else:
        md_content += "\n### Top 10 Longest Test Times\n\nNo multiworld test data available.\n"

    return md_content
