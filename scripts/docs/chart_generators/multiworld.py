"""
Multiworld test chart data extraction and markdown generation.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

from .utils import format_file_size


def extract_multiworld_chart_data(results: Dict[str, Any], world_mapping: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """
    Extract multiworld test chart data from results.
    Returns list of dicts with keys:
        game_name, pass_fail, player_number, total_players_tested,
        total_players_in_multiworld, players_passed, players_failed,
        all_prereqs_passed, has_custom_exporter, has_custom_game_logic,
        exporter_size, game_logic_size, split_number,
        templates_in_multiworld, bisection_results, second_pass
    """
    chart_data = []

    if 'results' not in results:
        return chart_data

    for template_filename, template_data in results['results'].items():
        world_info = template_data.get('world_info', {})
        game_name = world_info.get('game_name_from_yaml') or template_filename.replace('.yaml', '')
        has_custom_exporter = world_info.get('has_custom_exporter', False)
        has_custom_game_logic = world_info.get('has_custom_game_logic', False)

        # Get file sizes from world_mapping if available, otherwise from world_info
        if world_mapping and game_name in world_mapping:
            exporter_size = world_mapping[game_name].get('exporter_size', 0)
            game_logic_size = world_mapping[game_name].get('game_logic_size', 0)
        else:
            exporter_size = world_info.get('exporter_size', 0)
            game_logic_size = world_info.get('game_logic_size', 0)

        multiworld_test = template_data.get('multiworld_test', {})
        prerequisite_check = template_data.get('prerequisite_check', {})

        success = multiworld_test.get('success', False)
        player_number = multiworld_test.get('player_number', 0)
        total_players_tested = multiworld_test.get('total_players_tested', 0)
        total_players_in_multiworld = multiworld_test.get('total_players_in_multiworld', 0)
        players_passed = multiworld_test.get('players_passed', 0)
        players_failed = multiworld_test.get('players_failed', 0)
        all_prereqs_passed = prerequisite_check.get('all_prerequisites_passed', False)
        templates_in_multiworld = multiworld_test.get('templates_in_multiworld', {})
        split_number = multiworld_test.get('split_number', None)
        skip_reason = multiworld_test.get('skip_reason', None)
        bisection_results = template_data.get('bisection_results', None)

        # Extract second pass data if available
        second_pass = template_data.get('second_pass', None)

        # Determine pass/fail status
        # The final result considers both first and second pass:
        # - If second pass exists, use its result (it's the final word)
        # - If first pass was skipped (waiting for templates) but second pass passed → Passed
        # - If first pass passed but second pass failed → Failed
        if second_pass is not None:
            # Second pass result is authoritative
            if second_pass.get('success', False):
                pass_fail = 'Passed'
            else:
                pass_fail = 'Failed'
        elif skip_reason:
            # First pass was skipped and no second pass ran
            pass_fail = 'Skipped (Prerequisites)'
        elif success:
            pass_fail = 'Passed'
        else:
            pass_fail = 'Failed'

        chart_data.append({
            'game_name': game_name,
            'template_filename': template_filename,
            'pass_fail': pass_fail,
            'player_number': player_number,
            'total_players_tested': total_players_tested,
            'total_players_in_multiworld': total_players_in_multiworld,
            'players_passed': players_passed,
            'players_failed': players_failed,
            'all_prereqs_passed': all_prereqs_passed,
            'has_custom_exporter': has_custom_exporter,
            'has_custom_game_logic': has_custom_game_logic,
            'exporter_size': exporter_size,
            'game_logic_size': game_logic_size,
            'split_number': split_number,
            'templates_in_multiworld': templates_in_multiworld,
            'bisection_results': bisection_results,
            'second_pass': second_pass
        })

    chart_data.sort(key=lambda x: x['game_name'])
    return chart_data


def generate_multiworld_markdown(chart_data: List[Dict[str, Any]],
                                 metadata: Dict[str, Any], top_level_metadata: Optional[Dict[str, Any]] = None,
                                 is_worldgen: bool = False, other_version_link: Optional[str] = None,
                                 variant_type: Optional[str] = None,
                                 version_links: Optional[Dict[str, str]] = None) -> str:
    """Generate a markdown table for multiworld test data.

    Args:
        variant_type: None for original, "worldgen" for WorldGen, "apworld" for APWorld
        version_links: Dict mapping variant names to links, e.g. {"worldgen": "./file.md", "apworld": "./file.md"}
        is_worldgen: Deprecated, use variant_type="worldgen" instead
        other_version_link: Deprecated, use version_links instead
    """
    md_content = "# Archipelago Template Test Results Chart\n\n"
    md_content += "## Multiworld Test\n\n"

    # Add link to summary document
    summary_suffix = f"-{variant_type}" if variant_type else ""
    md_content += f"[← Back to Test Results Summary](./test-results-summary{summary_suffix}.md)\n\n"

    # Add link to test documentation
    md_content += "[📖 Learn about this test](../tests/test-multiworld.md)\n\n"

    # Handle backward compatibility: convert old parameters to new format
    if variant_type is None and is_worldgen:
        variant_type = "worldgen"
    if version_links is None and other_version_link:
        if variant_type in ("worldgen", "apworld"):
            version_links = {"original": other_version_link}
        else:
            version_links = {"worldgen": other_version_link}

    # Add cross-links to other versions
    if version_links:
        for variant, link in sorted(version_links.items()):
            if variant == "worldgen":
                md_content += f"[View WorldGen Template Results]({link})\n\n"
            elif variant == "apworld":
                md_content += f"[View APWorld Template Results]({link})\n\n"
            elif variant == "original":
                md_content += f"[View Original Template Results]({link})\n\n"

    # Add generated timestamp
    md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"

    # Add source data metadata if available
    if metadata and ('created' in metadata or 'last_updated' in metadata):
        if 'created' in metadata:
            md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        if 'last_updated' in metadata:
            md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"

    # Add top-level metadata if available
    if top_level_metadata:
        if 'timestamp' in top_level_metadata and top_level_metadata['timestamp']:
            md_content += f"**Test Timestamp:** {top_level_metadata.get('timestamp')}\n\n"
        if 'seed' in top_level_metadata and top_level_metadata['seed']:
            md_content += f"**Seed:** {top_level_metadata.get('seed')}\n\n"

    # Check if any entries have second pass data
    has_second_pass_data = any(entry.get('second_pass') for entry in chart_data)

    if chart_data:
        total_games = len(chart_data)
        first_pass_passed = sum(1 for d in chart_data if d['pass_fail'].lower() == 'passed')
        skipped = sum(1 for d in chart_data if 'skipped' in d['pass_fail'].lower() or 'prerequisites' in d['pass_fail'].lower())
        first_pass_failed = total_games - first_pass_passed - skipped

        # Calculate second pass failures (games that passed first pass but failed second pass)
        second_pass_failed = sum(1 for d in chart_data
                                  if d.get('second_pass') and not d.get('second_pass', {}).get('success', False))

        # Adjust totals: second pass failures should count as failed, not passed
        passed = first_pass_passed - second_pass_failed
        failed = first_pass_failed + second_pass_failed

        # Get intermittent failures counts
        intermittent_games_count = 0
        intermittent_total_count = 0
        if metadata and 'intermittent_tracking' in metadata:
            intermittent_failures = metadata['intermittent_tracking'].get('failures', [])
            # Count unique templates (games)
            unique_templates = set(failure.get('template') for failure in intermittent_failures)
            intermittent_games_count = len(unique_templates)
            # Count total intermittent failures
            intermittent_total_count = len(intermittent_failures)

        md_content += "## Summary\n\n"
        md_content += f"- **Total Games:** {total_games}\n"
        md_content += f"- **Passed:** {passed} ({passed/total_games*100:.1f}%)\n"
        md_content += f"- **Failed:** {failed} ({failed/total_games*100:.1f}%)\n"
        md_content += f"- **Skipped (Prerequisites):** {skipped} ({skipped/total_games*100:.1f}%)\n"
        md_content += f"- **Games with Intermittent Failures:** {intermittent_games_count}\n"
        md_content += f"- **Total Intermittent Failures:** {intermittent_total_count}\n"

        # Add second pass summary if applicable
        if has_second_pass_data:
            second_pass_count = sum(1 for d in chart_data if d.get('second_pass'))
            second_pass_passed = sum(1 for d in chart_data if (d.get('second_pass') or {}).get('success', False))
            second_pass_failed = second_pass_count - second_pass_passed
            md_content += f"- **Second Pass Tested:** {second_pass_count}\n"
            md_content += f"- **Second Pass Passed:** {second_pass_passed}\n"
            md_content += f"- **Second Pass Failed:** {second_pass_failed}\n"

        md_content += "\n"

        # Calculate generic exporter/logic statistics
        # A game is fully passed if it passed first pass AND (no second pass OR passed second pass)
        def is_fully_passed(d):
            if d['pass_fail'].lower() != 'passed':
                return False
            second_pass = d.get('second_pass')
            if second_pass and not second_pass.get('success', False):
                return False
            return True

        passed_with_generic_exporter = sum(1 for d in chart_data
                                           if is_fully_passed(d) and not d.get('has_custom_exporter', False))
        passed_with_generic_logic = sum(1 for d in chart_data
                                        if is_fully_passed(d) and not d.get('has_custom_game_logic', False))
        passed_with_both_generic = sum(1 for d in chart_data
                                       if is_fully_passed(d) and not d.get('has_custom_exporter', False) and not d.get('has_custom_game_logic', False))

        md_content += "### Generic Exporter/Logic Statistics\n\n"
        md_content += f"- **Passing with Generic Exporter:** {passed_with_generic_exporter}/{passed} ({passed_with_generic_exporter/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Exporter:** 0/0\n"
        md_content += f"- **Passing with Generic Logic:** {passed_with_generic_logic}/{passed} ({passed_with_generic_logic/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Logic:** 0/0\n"
        md_content += f"- **Passing with Both Generic:** {passed_with_both_generic}/{passed} ({passed_with_both_generic/passed*100:.1f}% of passed)\n\n" if passed > 0 else f"- **Passing with Both Generic:** 0/0\n\n"

    md_content += "## Test Results\n\n"

    # Add Second Pass column if there's second pass data
    if has_second_pass_data:
        md_content += "| Game Name | First Pass | Second Pass | Player # | MW Size | Exporter | GameLogic |\n"
        md_content += "|-----------|------------|-------------|----------|---------|----------|----------|\n"
    else:
        md_content += "| Game Name | Test Result | Player # | Total Players | Players Passed | Players Failed | Exporter | GameLogic |\n"
        md_content += "|-----------|-------------|----------|---------------|----------------|----------------|----------|----------|\n"

    for entry in chart_data:
        game_name = entry['game_name']
        pass_fail = entry['pass_fail']
        player_number = entry['player_number']
        total_players_tested = entry['total_players_tested']
        total_players_in_multiworld = entry.get('total_players_in_multiworld', 0)
        players_passed = entry['players_passed']
        players_failed = entry['players_failed']
        exporter_size = entry.get('exporter_size', 0)
        game_logic_size = entry.get('game_logic_size', 0)
        second_pass = entry.get('second_pass')

        if pass_fail.lower() == 'passed':
            result_display = "✅ Passed"
        elif 'skipped' in pass_fail.lower() or 'prerequisites' in pass_fail.lower():
            result_display = "⚫ Skipped"
        else:
            result_display = "❌ Failed"

        exporter_indicator = format_file_size(exporter_size)
        game_logic_indicator = format_file_size(game_logic_size)

        player_display = str(player_number) if player_number > 0 else "N/A"

        if has_second_pass_data:
            # Use total_players_in_multiworld for MW size display
            mw_size = total_players_in_multiworld if total_players_in_multiworld > 0 else total_players_tested
            mw_size_display = str(mw_size) if mw_size > 0 else "N/A"

            # Second pass result
            if second_pass:
                if second_pass.get('success', False):
                    second_pass_display = "✅ Passed"
                else:
                    second_pass_display = "❌ Failed"
            else:
                # No second pass needed (tested with full multiworld)
                second_pass_display = "—"

            md_content += f"| {game_name} | {result_display} | {second_pass_display} | {player_display} | {mw_size_display} | {exporter_indicator} | {game_logic_indicator} |\n"
        else:
            total_display = str(total_players_tested) if total_players_tested > 0 else "N/A"
            passed_display = str(players_passed) if total_players_tested > 0 else "N/A"
            failed_display = str(players_failed) if total_players_tested > 0 else "N/A"

            md_content += f"| {game_name} | {result_display} | {player_display} | {total_display} | {passed_display} | {failed_display} | {exporter_indicator} | {game_logic_indicator} |\n"

    if not chart_data:
        md_content += "| No data available | - | - | - | - | - | - | - |\n"

    # Add Templates in Multiworld section for games that have this data
    entries_with_templates = [e for e in chart_data if e.get('templates_in_multiworld')]
    if entries_with_templates:
        md_content += "\n## Templates in Multiworld\n\n"
        md_content += "Shows which templates were in the multiworld when each game was tested:\n\n"

        for entry in entries_with_templates:
            game_name = entry['game_name']
            templates_in_multiworld = entry['templates_in_multiworld']
            pass_fail = entry['pass_fail']
            split_number = entry.get('split_number')

            # Determine result icon
            if pass_fail.lower() == 'passed':
                result_icon = "✅"
            elif 'skipped' in pass_fail.lower() or 'prerequisites' in pass_fail.lower():
                result_icon = "⚫"
            else:
                result_icon = "❌"

            # Add split number to header if available
            split_info = f" (Split {split_number})" if split_number is not None else ""
            md_content += f"### {game_name} {result_icon}{split_info}\n\n"
            md_content += "| Player # | Template |\n"
            md_content += "|----------|----------|\n"

            # Sort by player number
            for player_key in sorted(templates_in_multiworld.keys(), key=lambda x: int(x.split('_')[1])):
                player_num = player_key.split('_')[1]
                template_name = templates_in_multiworld[player_key]
                md_content += f"| {player_num} | {template_name} |\n"

            md_content += "\n"

    # Add Bisection Results section if any exist
    entries_with_bisection = [e for e in chart_data if e.get('bisection_results')]
    if entries_with_bisection:
        md_content += "\n## Bisection Results\n\n"
        md_content += "When a multiworld test fails, bisection tests each pair of templates to find which specific combination causes the failure.\n\n"

        for entry in entries_with_bisection:
            game_name = entry['game_name']
            template_filename = entry.get('template_filename', game_name)
            bisection = entry['bisection_results']

            md_content += f"### {game_name} ({template_filename})\n\n"

            tested_pairs = bisection.get('tested_pairs', [])
            failing_pairs = bisection.get('failing_pairs', [])

            if failing_pairs:
                md_content += f"**Failing pairs found:** {len(failing_pairs)}\n\n"
            else:
                md_content += "**No failing pairs found** (failure may be due to combination of 3+ templates)\n\n"

            if tested_pairs:
                md_content += "| Partner Template | Result | Generation | Player 1 | Player 2 |\n"
                md_content += "|------------------|--------|------------|----------|----------|\n"

                for pair in tested_pairs:
                    partner = pair.get('partner_template', 'Unknown')
                    success = pair.get('success', False)
                    gen_success = pair.get('generation_success', False)

                    result_icon = "✅" if success else "❌"
                    gen_icon = "✅" if gen_success else "❌"

                    player_results = pair.get('player_results', {})
                    p1_result = player_results.get('player_1', {})
                    p2_result = player_results.get('player_2', {})

                    p1_icon = "✅" if p1_result.get('passed', False) else ("❌" if p1_result else "—")
                    p2_icon = "✅" if p2_result.get('passed', False) else ("❌" if p2_result else "—")

                    md_content += f"| {partner} | {result_icon} | {gen_icon} | {p1_icon} | {p2_icon} |\n"

                md_content += "\n"

    # Add Second Pass Results section if any entries have second pass data
    entries_with_second_pass = [e for e in chart_data if e.get('second_pass')]
    if entries_with_second_pass:
        md_content += "\n## Second Pass Results\n\n"
        md_content += "Templates tested in the first pass with fewer than the maximum number of players were retested (second pass) with the full multiworld.\n\n"

        md_content += "| Game Name | First Pass MW Size | Second Pass MW Size | Second Pass Player # | Second Pass Result |\n"
        md_content += "|-----------|-------------------|---------------------|---------------------|--------------------|\n"

        for entry in entries_with_second_pass:
            game_name = entry['game_name']
            first_pass_mw_size = entry.get('total_players_in_multiworld', entry['total_players_tested'])
            second_pass = entry['second_pass']

            second_pass_mw_size = second_pass.get('total_players_in_multiworld', 0)
            second_pass_player_num = second_pass.get('player_number', 0)
            second_pass_success = second_pass.get('success', False)

            result_icon = "✅ Passed" if second_pass_success else "❌ Failed"

            md_content += f"| {game_name} | {first_pass_mw_size} | {second_pass_mw_size} | {second_pass_player_num} | {result_icon} |\n"

        md_content += "\n"

        # Add Second Pass Templates in Multiworld subsection
        md_content += "### Second Pass Templates in Multiworld\n\n"
        md_content += "Shows which templates were in the multiworld when each game was tested in the second pass:\n\n"

        for entry in entries_with_second_pass:
            game_name = entry['game_name']
            second_pass = entry['second_pass']
            second_pass_templates = second_pass.get('templates_in_multiworld', {})

            if second_pass_templates:
                second_pass_success = second_pass.get('success', False)
                second_pass_split = second_pass.get('split_number')
                result_icon = "✅" if second_pass_success else "❌"

                # Add split number to header if available
                split_info = f" (Split {second_pass_split})" if second_pass_split is not None else ""
                md_content += f"#### {game_name} {result_icon}{split_info}\n\n"
                md_content += "| Player # | Template |\n"
                md_content += "|----------|----------|\n"

                # Sort by player number
                for player_key in sorted(second_pass_templates.keys(), key=lambda x: int(x.split('_')[1])):
                    player_num = player_key.split('_')[1]
                    template_name = second_pass_templates[player_key]
                    md_content += f"| {player_num} | {template_name} |\n"

                md_content += "\n"

        # Add Second Pass Bisection Results subsection if any exist
        entries_with_second_pass_bisection = [e for e in entries_with_second_pass
                                               if e.get('second_pass', {}).get('bisection_results')]
        if entries_with_second_pass_bisection:
            md_content += "### Second Pass Bisection Results\n\n"
            md_content += "When a second pass multiworld test fails, bisection tests each pair of templates to find which specific combination causes the failure.\n\n"

            for entry in entries_with_second_pass_bisection:
                game_name = entry['game_name']
                template_filename = entry.get('template_filename', game_name)
                bisection = entry['second_pass']['bisection_results']

                md_content += f"#### {game_name} ({template_filename})\n\n"

                tested_pairs = bisection.get('tested_pairs', [])
                failing_pairs = bisection.get('failing_pairs', [])

                if failing_pairs:
                    md_content += f"**Failing pairs found:** {len(failing_pairs)}\n\n"
                else:
                    md_content += "**No failing pairs found** (failure may be due to combination of 3+ templates)\n\n"

                if tested_pairs:
                    md_content += "| Partner Template | Result | Generation | Player 1 | Player 2 |\n"
                    md_content += "|------------------|--------|------------|----------|----------|\n"

                    for pair in tested_pairs:
                        partner = pair.get('partner_template', 'Unknown')
                        success = pair.get('success', False)
                        gen_success = pair.get('generation_success', False)

                        result_icon = "✅" if success else "❌"
                        gen_icon = "✅" if gen_success else "❌"

                        player_results = pair.get('player_results', {})
                        p1_result = player_results.get('player_1', {})
                        p2_result = player_results.get('player_2', {})

                        p1_icon = "✅" if p1_result.get('passed', False) else ("❌" if p1_result else "—")
                        p2_icon = "✅" if p2_result.get('passed', False) else ("❌" if p2_result else "—")

                        md_content += f"| {partner} | {result_icon} | {gen_icon} | {p1_icon} | {p2_icon} |\n"

                    md_content += "\n"

    # Add Intermittent Failures section if there are any
    if metadata and 'intermittent_tracking' in metadata:
        intermittent_failures = metadata['intermittent_tracking'].get('failures', [])
        if intermittent_failures:
            # Sort by template name first, then by seed number
            sorted_failures = sorted(intermittent_failures, key=lambda f: (
                f.get('template', 'Unknown'),
                f.get('seed') if f.get('seed') is not None else float('inf')
            ))

            md_content += "\n## Intermittent Failures\n\n"
            md_content += "These tests were previously failing but passed during a retest run:\n\n"
            md_content += "| Template | Seed | Timestamp | Notes |\n"
            md_content += "|----------|------|-----------|-------|\n"

            for failure in sorted_failures:
                template_name = failure.get('template', 'Unknown').replace('.yaml', '')
                seed = failure.get('seed', 'N/A')
                timestamp = failure.get('timestamp', 'Unknown')
                # Parse timestamp to make it more readable
                try:
                    from datetime import datetime as dt
                    ts_obj = dt.fromisoformat(timestamp)
                    timestamp_display = ts_obj.strftime('%Y-%m-%d %H:%M')
                except:
                    timestamp_display = timestamp

                # Show seed or "N/A" if not available
                seed_display = str(seed) if seed is not None else "N/A"

                notes = "Previously failed, now passing"
                md_content += f"| {template_name} | {seed_display} | {timestamp_display} | {notes} |\n"

            md_content += "\n"

    md_content += "\n## Notes\n\n"
    md_content += "- **Player #:** The player number assigned to this template in the multiworld\n"
    md_content += "- **Total Players / MW Size:** Number of players in the multiworld configuration when this template was tested\n"
    md_content += "- **Players Passed:** Number of players that passed the spoiler test\n"
    md_content += "- **Players Failed:** Number of players that failed the spoiler test\n"
    md_content += "- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script\n"
    md_content += "- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files\n\n"
    md_content += "**Pass Criteria:** All prerequisite tests (Spoiler Minimal, Spoiler Full, Multiclient) must pass, and all players in the multiworld must pass their spoiler tests\n\n"
    md_content += "**Skipped:** Templates that did not meet prerequisite requirements\n\n"

    if entries_with_second_pass:
        md_content += "**Second Pass:** Templates tested in the first pass with fewer than the maximum number of players are retested with the full multiworld. This ensures all templates are validated with the final multiworld configuration.\n"

    return md_content
