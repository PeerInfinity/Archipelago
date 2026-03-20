"""
Summary chart generation combining all test results.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from .utils import format_file_size, get_rules_json_size


def generate_summary_chart(minimal_data, full_data, multiclient_data, multiworld_data=None, excluded_games=None, minimal_metadata=None, full_metadata=None, multiclient_metadata=None, multiworld_metadata=None, world_mapping=None, is_worldgen=False, other_version_link=None, project_root=None, variant_type: Optional[str] = None, version_links: Optional[Dict[str, str]] = None) -> str:
    """Generate a combined summary chart with all test results.

    Args:
        variant_type: None for original, "worldgen" for WorldGen, "apworld" for APWorld
        version_links: Dict mapping variant names to links, e.g. {"worldgen": "./file.md", "apworld": "./file.md"}
        is_worldgen: Deprecated, use variant_type="worldgen" instead
        other_version_link: Deprecated, use version_links instead
    """
    # Handle backward compatibility: convert old parameters to new format
    if variant_type is None and is_worldgen:
        variant_type = "worldgen"
    if version_links is None and other_version_link:
        if variant_type in ("worldgen", "apworld"):
            version_links = {"original": other_version_link}
        else:
            version_links = {"worldgen": other_version_link}

    # Determine title suffix based on variant type
    if variant_type == "worldgen":
        title_suffix = " (WorldGen)"
    elif variant_type == "apworld":
        title_suffix = " (APWorld)"
    else:
        title_suffix = ""

    md_content = f"# Archipelago Template Test Results Summary{title_suffix}\n\n"
    md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    # Add source data dates from metadata (use minimal_metadata as primary source)
    if minimal_metadata and ('created' in minimal_metadata or 'last_updated' in minimal_metadata):
        if 'created' in minimal_metadata:
            md_content += f"**Source Data Created:** {minimal_metadata.get('created', 'Unknown')}\n\n"
        if 'last_updated' in minimal_metadata:
            md_content += f"**Source Data Last Updated:** {minimal_metadata.get('last_updated', 'Unknown')}\n\n"

    # Add cross-links to other versions
    if version_links:
        for variant, link in sorted(version_links.items()):
            if variant == "worldgen":
                md_content += f"[View WorldGen Template Results]({link})\n\n"
            elif variant == "apworld":
                md_content += f"[View APWorld Template Results]({link})\n\n"
            elif variant == "original":
                md_content += f"[View Original Template Results]({link})\n\n"

    # Build test types list dynamically
    variant_suffix = f"-{variant_type}" if variant_type else ""
    test_types = [
        ("Minimal Spoiler Test", "Tests with advancement items only", f"./test-results-spoilers-minimal{variant_suffix}.md"),
        ("Full Spoiler Test", "Tests with all locations", f"./test-results-spoilers-full{variant_suffix}.md"),
        ("Multiclient Test", "Tests in multiclient mode", f"./test-results-multiclient{variant_suffix}.md"),
    ]
    if multiworld_data is not None:
        test_types.append(("Multiworld Test", "Tests in multiworld mode with multiple games", f"./test-results-multiworld{variant_suffix}.md"))

    md_content += f"This summary combines results from {len(test_types)} types of tests:\n"
    for name, desc, link in test_types:
        md_content += f"- **{name}:** {desc} - [View Details]({link})\n"

    # Add additional test results links
    if variant_type is None:
        md_content += "\nAdditional test results:\n"
        md_content += "- **World Generator Test:** Tests world generation for all templates - [View Details](./test-results-world-generator.md)\n"
        md_content += "- **Processing Times:** Generation and test processing times - [View Details](./test-results-processing-times.md)\n"
        md_content += "- **Freshness Report:** Shows when each test result document was last updated - [View Details](./test-results-freshness.md)\n"
    elif variant_type == "worldgen":
        md_content += "\nAdditional test results:\n"
        md_content += "- **Processing Times:** Generation and test processing times - [View Details](./test-results-processing-times-worldgen.md)\n"
        md_content += "- **Freshness Report:** Shows when each test result document was last updated - [View Details](./test-results-freshness.md)\n"
    elif variant_type == "apworld":
        md_content += "\nAdditional test results:\n"
        md_content += "- **Processing Times:** Generation and test processing times - [View Details](./test-results-processing-times-apworld.md)\n"
        md_content += "- **Freshness Report:** Shows when each test result document was last updated - [View Details](./test-results-freshness.md)\n"

    # Add additional information links
    md_content += "\nAdditional information:\n"
    md_content += "- **Template Types:** Understanding original, WorldGen, and APWorld templates - [Learn More](../tests/template-types.md)\n"
    md_content += "- **Custom Exporters and Logic:** Understanding the Exporter and GameLogic columns - [Learn More](../tests/custom-exporters-and-logic.md)\n"

    md_content += "\n"

    # Create a unified game list with exporter/logic info
    # Note: UT comparison data is NOT included in statistics - it has its own separate report
    games_minimal = {name: result for name, result, *_ in minimal_data}
    games_full = {name: result for name, result, *_ in full_data}
    games_multiclient = {name: result for name, result, *_ in multiclient_data}
    # multiworld_data is now a list of dicts
    games_multiworld = {d['game_name']: d['pass_fail'] for d in multiworld_data} if multiworld_data else {}

    # Extract custom exporter/logic info and consistency data (from minimal_data as it has all games)
    games_exporter_logic = {}
    games_consistency = {}
    for name, result, gen_errors, sphere, max_sphere, has_exporter, has_logic, rules_consistent, spoilers_consistent, test_time in minimal_data:
        games_exporter_logic[name] = (has_exporter, has_logic)
        games_consistency[name] = (rules_consistent, spoilers_consistent)

    all_games = sorted(set(list(games_minimal.keys()) + list(games_full.keys()) + list(games_multiclient.keys()) + list(games_multiworld.keys())))

    # Calculate statistics first
    def calc_stats(data_dict):
        if not data_dict:
            return 0, 0, 0
        total = len(data_dict)
        passed = sum(1 for r in data_dict.values() if 'passed' in r.lower())
        return total, passed, passed/total*100 if total > 0 else 0

    min_total, min_passed, min_pct = calc_stats(games_minimal)
    full_total, full_passed, full_pct = calc_stats(games_full)
    mp_total, mp_passed, mp_pct = calc_stats(games_multiclient)

    # Calculate templates by number of tests passed
    # Note: UT comparison is NOT included in these statistics
    tests_passed_count = {}
    num_tests = 3  # Base: minimal, full, multiclient
    if multiworld_data is not None:
        num_tests += 1

    for game in all_games:
        passed_count = 0
        if game in games_minimal and 'passed' in games_minimal[game].lower():
            passed_count += 1
        if game in games_full and 'passed' in games_full[game].lower():
            passed_count += 1
        if game in games_multiclient and 'passed' in games_multiclient[game].lower():
            passed_count += 1
        if multiworld_data is not None and game in games_multiworld and 'passed' in games_multiworld[game].lower():
            passed_count += 1
        tests_passed_count[game] = passed_count

    # Count how many templates passed 0, 1, 2, 3, or 4 tests
    passed_all = sum(1 for count in tests_passed_count.values() if count == num_tests)
    passed_counts = {i: sum(1 for count in tests_passed_count.values() if count == i) for i in range(num_tests)}

    total_templates = len(all_games)

    # Add Summary Statistics section
    md_content += "## Summary Statistics\n\n"

    md_content += "### Individual Test Results\n\n"
    md_content += f"- **Minimal Test:** {min_passed}/{min_total} passed ({min_pct:.1f}%)\n"
    md_content += f"- **Full Test:** {full_passed}/{full_total} passed ({full_pct:.1f}%)\n"
    md_content += f"- **Multiclient Test:** {mp_passed}/{mp_total} passed ({mp_pct:.1f}%)\n"

    if multiworld_data is not None:
        mw_total, mw_passed, mw_pct = calc_stats(games_multiworld)
        md_content += f"- **Multiworld Test:** {mw_passed}/{mw_total} passed ({mw_pct:.1f}%)\n"

    # Add intermittent failures subsection
    md_content += "\n### Intermittent Failures\n\n"

    minimal_games_count = 0
    minimal_total_count = 0
    full_games_count = 0
    full_total_count = 0
    multiclient_games_count = 0
    multiclient_total_count = 0
    multiworld_games_count = 0
    multiworld_total_count = 0

    if minimal_metadata and 'intermittent_tracking' in minimal_metadata:
        failures = minimal_metadata['intermittent_tracking'].get('failures', [])
        # Count unique templates (games)
        unique_templates = set(failure.get('template') for failure in failures)
        minimal_games_count = len(unique_templates)
        # Count total failures
        minimal_total_count = len(failures)

    if full_metadata and 'intermittent_tracking' in full_metadata:
        failures = full_metadata['intermittent_tracking'].get('failures', [])
        # Count unique templates (games)
        unique_templates = set(failure.get('template') for failure in failures)
        full_games_count = len(unique_templates)
        # Count total failures
        full_total_count = len(failures)

    if multiclient_metadata and 'intermittent_tracking' in multiclient_metadata:
        failures = multiclient_metadata['intermittent_tracking'].get('failures', [])
        # Count unique templates (games)
        unique_templates = set(failure.get('template') for failure in failures)
        multiclient_games_count = len(unique_templates)
        # Count total failures
        multiclient_total_count = len(failures)

    if multiworld_metadata and 'intermittent_tracking' in multiworld_metadata:
        failures = multiworld_metadata['intermittent_tracking'].get('failures', [])
        # Count unique templates (games)
        unique_templates = set(failure.get('template') for failure in failures)
        multiworld_games_count = len(unique_templates)
        # Count total failures
        multiworld_total_count = len(failures)

    md_content += f"- **Minimal Spoilers Test:** {minimal_games_count} game(s), {minimal_total_count} total failure(s)\n"
    md_content += f"- **Full Spoilers Test:** {full_games_count} game(s), {full_total_count} total failure(s)\n"
    md_content += f"- **Multiclient Test:** {multiclient_games_count} game(s), {multiclient_total_count} total failure(s)\n"
    if multiworld_data is not None:
        md_content += f"- **Multiworld Test:** {multiworld_games_count} game(s), {multiworld_total_count} total failure(s)\n"

    md_content += "\n### Combined Test Results\n\n"
    if total_templates > 0:
        md_content += f"- **Templates passing all {num_tests} tests:** {passed_all}/{total_templates} ({passed_all/total_templates*100:.1f}%)\n"

        for i in range(num_tests - 1, -1, -1):
            if i > 0:
                md_content += f"- **Templates passing {i} test{'s' if i > 1 else ''}:** {passed_counts[i]}/{total_templates} ({passed_counts[i]/total_templates*100:.1f}%)\n"
            else:
                md_content += f"- **Templates passing 0 tests:** {passed_counts[0]}/{total_templates} ({passed_counts[0]/total_templates*100:.1f}%)\n"
    else:
        md_content += "- **No test data available**\n"

    # Calculate generic exporter/logic statistics for games passing all tests
    # For worldgen summaries, look up the original game name to get exporter/logic data
    passed_all_with_generic_exporter = 0
    passed_all_with_generic_logic = 0
    passed_all_with_both_generic = 0

    for game in all_games:
        if tests_passed_count.get(game, 0) == num_tests:
            # For variants, look up original game's exporter/logic data from world_mapping
            lookup_game = game
            if variant_type == "worldgen" and game.endswith(' WorldGen'):
                lookup_game = game[:-9]  # len(' WorldGen') == 9
            if world_mapping and lookup_game in world_mapping:
                has_exporter = world_mapping[lookup_game].get('has_custom_exporter', False)
                has_logic = world_mapping[lookup_game].get('has_custom_game_logic', False)
            else:
                has_exporter, has_logic = games_exporter_logic.get(game, (False, False))
            if not has_exporter:
                passed_all_with_generic_exporter += 1
            if not has_logic:
                passed_all_with_generic_logic += 1
            if not has_exporter and not has_logic:
                passed_all_with_both_generic += 1

    # Calculate combined file sizes from world_mapping
    # For variant summaries, look up the original game name to get file sizes
    total_exporter_size = 0
    total_logic_size = 0
    if world_mapping:
        for game in all_games:
            lookup_game = game
            if variant_type == "worldgen" and game.endswith(' WorldGen'):
                lookup_game = game[:-9]  # len(' WorldGen') == 9
            if lookup_game in world_mapping:
                total_exporter_size += world_mapping[lookup_game].get('exporter_size', 0)
                total_logic_size += world_mapping[lookup_game].get('game_logic_size', 0)

    def format_size_kb(size_bytes):
        """Format size in KB with one decimal."""
        return f"{size_bytes / 1024:.1f}KB"

    md_content += "\n### Generic Exporter/Logic Statistics\n\n"
    md_content += f"Of the {passed_all} templates passing all {num_tests} tests:\n\n"
    if passed_all > 0:
        md_content += f"- **Passing with Generic Exporter:** {passed_all_with_generic_exporter}/{passed_all} ({passed_all_with_generic_exporter/passed_all*100:.1f}%)\n"
        md_content += f"- **Passing with Generic Logic:** {passed_all_with_generic_logic}/{passed_all} ({passed_all_with_generic_logic/passed_all*100:.1f}%)\n"
        md_content += f"- **Passing with Both Generic:** {passed_all_with_both_generic}/{passed_all} ({passed_all_with_both_generic/passed_all*100:.1f}%)\n"
    else:
        md_content += f"- **Passing with Generic Exporter:** 0/0\n"
        md_content += f"- **Passing with Generic Logic:** 0/0\n"
        md_content += f"- **Passing with Both Generic:** 0/0\n"

    md_content += f"\n**Combined Custom Code Size:**\n\n"
    md_content += f"- **Total Exporter Code:** {format_size_kb(total_exporter_size)}\n"
    md_content += f"- **Total Game Logic Code:** {format_size_kb(total_logic_size)}\n"
    md_content += f"- **Combined Total:** {format_size_kb(total_exporter_size + total_logic_size)}\n"

    # Add Test Results table
    md_content += "\n## Test Results\n\n"
    if multiworld_data is not None:
        md_content += "| Game Name | [Minimal Test](./test-results-spoilers-minimal.md) | [Full Test](./test-results-spoilers-full.md) | [Multiclient Test](./test-results-multiclient.md) | [Multiworld Test](./test-results-multiworld.md) | Consistent Rules | Consistent Spoilers | Exporter | GameLogic | Rules Size |\n"
        md_content += "|-----------|--------------|-----------|------------------|-----------------|------------------|---------------------|----------|----------|------------|\n"
    else:
        md_content += "| Game Name | [Minimal Test](./test-results-spoilers-minimal.md) | [Full Test](./test-results-spoilers-full.md) | [Multiclient Test](./test-results-multiclient.md) | Consistent Rules | Consistent Spoilers | Exporter | GameLogic | Rules Size |\n"
        md_content += "|-----------|--------------|-----------|------------------|------------------|---------------------|----------|----------|------------|\n"

    # Build mapping from game display name -> template filename for exclude check
    game_to_template = {k: v.get('template_file', '') for k, v in (world_mapping or {}).items()}
    excluded_template_files = set(excluded_games.keys()) if excluded_games else set()

    for game in all_games:
        minimal_result = games_minimal.get(game, "N/A")
        full_result = games_full.get(game, "N/A")
        multiclient_result = games_multiclient.get(game, "N/A")
        multiworld_result = games_multiworld.get(game, "N/A") if multiworld_data is not None else None

        # Get exporter/logic info - use file sizes from world_mapping if available
        # For variant summaries, look up the original game name to get exporter/logic data
        has_exporter, has_logic = games_exporter_logic.get(game, (False, False))
        lookup_game = game
        if variant_type == "worldgen" and game.endswith(' WorldGen'):
            # Strip " WorldGen" suffix to look up original game's exporter/logic data
            lookup_game = game[:-9]  # len(' WorldGen') == 9
        if world_mapping and lookup_game in world_mapping:
            exporter_size = world_mapping[lookup_game].get('exporter_size', 0)
            game_logic_size = world_mapping[lookup_game].get('game_logic_size', 0)
            exporter_indicator = format_file_size(exporter_size)
            logic_indicator = format_file_size(game_logic_size)
        else:
            exporter_indicator = "⚫" if has_exporter else "✅"
            logic_indicator = "⚫" if has_logic else "✅"

        # Get rules.json size for seed 1
        rules_size_indicator = "N/A"
        if project_root and world_mapping and game in world_mapping:
            world_dir = world_mapping[game].get('world_directory', '')
            if world_dir:
                rules_size = get_rules_json_size(project_root, world_dir)
                if rules_size > 0:
                    rules_size_indicator = f"{rules_size / 1024:.1f}KB"

        # Get consistency info
        rules_consistent, spoilers_consistent = games_consistency.get(game, (None, None))

        # Format consistency indicators according to user requirements:
        # - None/no data: N/A
        # - False (any failures): gray dot
        # - True (all passed): checkmark
        def format_consistency(value):
            if value is None:
                return "❓ N/A"
            elif value is False:
                return "⚫"
            else:  # True
                return "✅"

        rules_indicator = format_consistency(rules_consistent)
        spoilers_indicator = format_consistency(spoilers_consistent)

        def format_result(result):
            if result == "N/A":
                return "❓ N/A"
            elif 'passed' in result.lower():
                return "✅ Passed"
            elif 'skipped' in result.lower():
                return "⚫ Skipped"
            else:
                return "❌ Failed"

        template_file = game_to_template.get(game, game + '.yaml')
        game_display = f"*{game}*" if template_file in excluded_template_files else game

        if multiworld_data is not None:
            md_content += f"| {game_display} | {format_result(minimal_result)} | {format_result(full_result)} | {format_result(multiclient_result)} | {format_result(multiworld_result)} | {rules_indicator} | {spoilers_indicator} | {exporter_indicator} | {logic_indicator} | {rules_size_indicator} |\n"
        else:
            md_content += f"| {game_display} | {format_result(minimal_result)} | {format_result(full_result)} | {format_result(multiclient_result)} | {rules_indicator} | {spoilers_indicator} | {exporter_indicator} | {logic_indicator} | {rules_size_indicator} |\n"

    # Add Largest Rules Files section
    if project_root and world_mapping:
        rules_sizes = []
        for game in all_games:
            if game in world_mapping:
                world_dir = world_mapping[game].get('world_directory', '')
                if world_dir:
                    rules_size = get_rules_json_size(project_root, world_dir)
                    if rules_size > 0:
                        rules_sizes.append((game, rules_size))

        if rules_sizes:
            # Sort by size descending and take top 10
            rules_sizes.sort(key=lambda x: x[1], reverse=True)
            top_10 = rules_sizes[:10]

            md_content += "\n### Largest Rules Files\n\n"
            md_content += "| Rank | Game Name | Rules Size |\n"
            md_content += "|------|-----------|------------|\n"
            for rank, (game_name, size) in enumerate(top_10, 1):
                md_content += f"| {rank} | {game_name} | {size / 1024:.1f}KB |\n"

    # Add Exporter Files by Size section
    if world_mapping:
        exporter_sizes = []
        for game in all_games:
            lookup_game = game
            if variant_type == "worldgen" and game.endswith(' WorldGen'):
                lookup_game = game[:-9]  # Strip " WorldGen" suffix
            if lookup_game in world_mapping:
                exporter_size = world_mapping[lookup_game].get('exporter_size', 0)
                if exporter_size > 0:
                    exporter_sizes.append((game, exporter_size))

        if exporter_sizes:
            # Sort by size descending
            exporter_sizes.sort(key=lambda x: x[1], reverse=True)

            md_content += "\n### Exporter Files by Size\n\n"
            md_content += "| Rank | Game Name | Exporter Size |\n"
            md_content += "|------|-----------|---------------|\n"
            for rank, (game_name, size) in enumerate(exporter_sizes, 1):
                md_content += f"| {rank} | {game_name} | {size / 1024:.1f}KB |\n"

    # Add GameLogic Files by Size section
    if world_mapping:
        logic_sizes = []
        for game in all_games:
            lookup_game = game
            if variant_type == "worldgen" and game.endswith(' WorldGen'):
                lookup_game = game[:-9]  # Strip " WorldGen" suffix
            if lookup_game in world_mapping:
                logic_size = world_mapping[lookup_game].get('game_logic_size', 0)
                if logic_size > 0:
                    logic_sizes.append((game, logic_size))

        if logic_sizes:
            # Sort by size descending
            logic_sizes.sort(key=lambda x: x[1], reverse=True)

            md_content += "\n### GameLogic Files by Size\n\n"
            md_content += "| Rank | Game Name | GameLogic Size |\n"
            md_content += "|------|-----------|----------------|\n"
            for rank, (game_name, size) in enumerate(logic_sizes, 1):
                md_content += f"| {rank} | {game_name} | {size / 1024:.1f}KB |\n"

    # Add Fuzz Tests section (only for original, not variants)
    if variant_type is None:
        md_content += "\n## Fuzz Tests\n\n"
        md_content += "Fuzz tests validate game configurations across randomized option combinations.\n\n"
        md_content += "- **[Fuzz Test Summary](./test-results-fuzz-summary.md)** - Combined view of all fuzz test results\n\n"
        md_content += "Individual fuzz test results:\n"
        md_content += "- [UT Fuzz Results - Original](./test-results-ut-fuzz-original.md)\n"
        md_content += "- [UT Fuzz Results - Original Seeded](./test-results-ut-fuzz-original_seeded.md)\n"
        md_content += "- [UT Fuzz Results - Worldgen](./test-results-ut-fuzz-worldgen.md)\n"
        md_content += "- [UT Fuzz Results - Hybrid](./test-results-ut-fuzz-hybrid.md)\n"
        md_content += "- [Spoiler Fuzz Results](./test-results-spoiler-fuzz.md)\n"

    # Add Excluded Templates section if data exists
    if excluded_games:
        md_content += "\n## Excluded Templates\n\n"
        md_content += "These templates are excluded from testing:\n\n"
        md_content += "| Template | Reason |\n"
        md_content += "|----------|--------|\n"
        for game, reason in sorted(excluded_games.items()):
            md_content += f"| {game} | {reason} |\n"

    md_content += "\n## Notes\n\n"
    if excluded_games:
        md_content += "- *Italic game names* are in the exclude list for this test type\n"
    md_content += "- **[Minimal Test](./test-results-spoilers-minimal.md):** Tests the game using only advancement items\n"
    md_content += "- **[Full Test](./test-results-spoilers-full.md):** Tests the game using all locations\n"
    md_content += "- **[Multiclient Test](./test-results-multiclient.md):** Tests the game in multiclient mode (send/receive)\n"
    md_content += "- **[Multiworld Test](./test-results-multiworld.md):** Tests the game in a multiworld with multiple other games\n"
    md_content += "- **Consistent Rules:** ✅ if rules.json files are identical across all tested seeds, ⚫ if they differ, ❓ if not tested\n"
    md_content += "- **Consistent Spoilers:** ✅ if spoiler files are identical across all tested seeds, ⚫ if they differ, ❓ if not tested\n"
    md_content += "- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script\n"
    md_content += "- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files\n"
    md_content += "- **Rules Size:** File size of rules.json for seed 1 (N/A if not generated)\n"

    return md_content
