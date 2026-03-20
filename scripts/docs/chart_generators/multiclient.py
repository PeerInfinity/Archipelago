"""
Multiclient test chart data extraction and markdown generation.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from .utils import format_file_size


def extract_multiclient_chart_data(results: Dict[str, Any]) -> List[Tuple[str, str, int, int, int, int, int, int, int, int, int, bool, int, int, bool, bool, bool]]:
    """
    Extract multiclient test chart data from results.
    Returns list of tuples: (game_name, pass_fail, gen_error_count,
                            client1_checked, client1_total, client1_manually_checkable, client1_manually_checkable_checked,
                            client1_event_locations, client1_event_locations_checked, client1_passed,
                            client2_received, client2_total, client2_passed,
                            has_custom_exporter, has_custom_game_logic)
    """
    chart_data = []

    if 'results' not in results:
        return chart_data

    results_data = results['results']
    if isinstance(results_data, dict):
        # New dict-based format - iterate over template filenames and data
        for template_filename, template_data in results_data.items():
            # Extract world info
            world_info = template_data.get('world_info', {})

            # Use game_name_from_yaml if available (matches spoiler test behavior)
            game_name = world_info.get('game_name_from_yaml')
            if not game_name:
                # Fallback to game_name_from_yaml field or template filename
                game_name = template_data.get('game_name_from_yaml', template_filename.replace('.yaml', ''))

            has_custom_exporter = world_info.get('has_custom_exporter', False)
            has_custom_game_logic = world_info.get('has_custom_game_logic', False)
            gen_error_count = template_data.get('generation', {}).get('error_count', 0)

            multiclient_test = template_data.get('multiclient_test', {})
            success = multiclient_test.get('success', False)

            # Extract new client-specific fields
            client1_checked = multiclient_test.get('client1_locations_checked', 0)
            client1_total = multiclient_test.get('client1_total_locations', 0)
            client1_manually_checkable = multiclient_test.get('client1_manually_checkable', 0)
            client1_manually_checkable_checked = multiclient_test.get('client1_manually_checkable_checked', 0)
            client1_event_locations = multiclient_test.get('client1_event_locations', 0)
            client1_event_locations_checked = multiclient_test.get('client1_event_locations_checked', 0)
            client1_passed = multiclient_test.get('client1_passed', False)

            client2_received = multiclient_test.get('client2_locations_received', 0)
            client2_total = multiclient_test.get('client2_total_locations', 0)
            client2_passed = multiclient_test.get('client2_passed', False)

            if success and gen_error_count == 0:
                pass_fail = 'Passed'
            else:
                pass_fail = 'Failed'

            chart_data.append((game_name, pass_fail, gen_error_count,
                             client1_checked, client1_total, client1_manually_checkable, client1_manually_checkable_checked,
                             client1_event_locations, client1_event_locations_checked, client1_passed,
                             client2_received, client2_total, client2_passed,
                             has_custom_exporter, has_custom_game_logic))
    else:
        # Old list-based format
        results_list = results_data
        for template_data in results_list:
            game_name = template_data.get('game_name_from_yaml', template_data.get('template_filename', 'Unknown').replace('.yaml', ''))
            world_info = template_data.get('world_info', {})
            has_custom_exporter = world_info.get('has_custom_exporter', False)
            has_custom_game_logic = world_info.get('has_custom_game_logic', False)
            gen_error_count = template_data.get('generation', {}).get('error_count', 0)

            multiclient_test = template_data.get('multiclient_test', {})
            success = multiclient_test.get('success', False)

            # Extract new client-specific fields (with fallback to legacy fields)
            client1_checked = multiclient_test.get('client1_locations_checked', 0)
            client1_total = multiclient_test.get('client1_total_locations', 0)
            client1_manually_checkable = multiclient_test.get('client1_manually_checkable', 0)
            client1_manually_checkable_checked = multiclient_test.get('client1_manually_checkable_checked', 0)
            client1_event_locations = multiclient_test.get('client1_event_locations', 0)
            client1_event_locations_checked = multiclient_test.get('client1_event_locations_checked', 0)
            client1_passed = multiclient_test.get('client1_passed', False)

            client2_received = multiclient_test.get('client2_locations_received',
                                                   multiclient_test.get('locations_checked', 0))
            client2_total = multiclient_test.get('client2_total_locations',
                                                multiclient_test.get('total_locations', 0))
            client2_passed = multiclient_test.get('client2_passed', False)

            if success and gen_error_count == 0:
                pass_fail = 'Passed'
            else:
                pass_fail = 'Failed'

            chart_data.append((game_name, pass_fail, gen_error_count,
                             client1_checked, client1_total, client1_manually_checkable, client1_manually_checkable_checked,
                             client1_event_locations, client1_event_locations_checked, client1_passed,
                             client2_received, client2_total, client2_passed,
                             has_custom_exporter, has_custom_game_logic))

    chart_data.sort(key=lambda x: x[0])
    return chart_data


def generate_multiclient_markdown(chart_data: List[Tuple[str, str, int, int, int, int, int, int, int, bool, int, int, bool, bool, bool]],
                                 metadata: Dict[str, Any], top_level_metadata: Optional[Dict[str, Any]] = None,
                                 is_worldgen: bool = False, other_version_link: Optional[str] = None,
                                 world_mapping: Optional[Dict[str, Dict[str, Any]]] = None,
                                 variant_type: Optional[str] = None,
                                 version_links: Optional[Dict[str, str]] = None) -> str:
    """Generate a markdown table for multiclient test data.

    Args:
        variant_type: None for original, "worldgen" for WorldGen, "apworld" for APWorld
        version_links: Dict mapping variant names to links, e.g. {"worldgen": "./file.md", "apworld": "./file.md"}
        is_worldgen: Deprecated, use variant_type="worldgen" instead
        other_version_link: Deprecated, use version_links instead
    """
    md_content = "# Archipelago Template Test Results Chart\n\n"
    md_content += "## Multiclient Test\n\n"

    # Add link to summary document
    summary_suffix = f"-{variant_type}" if variant_type else ""
    md_content += f"[← Back to Test Results Summary](./test-results-summary{summary_suffix}.md)\n\n"

    # Add link to test documentation
    md_content += "[📖 Learn about this test](../tests/test-multiclient.md)\n\n"

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

    # Add top-level metadata if available (from multiclient test results)
    if top_level_metadata:
        if 'timestamp' in top_level_metadata and top_level_metadata['timestamp']:
            md_content += f"**Test Timestamp:** {top_level_metadata.get('timestamp')}\n\n"
        if 'test_type' in top_level_metadata and top_level_metadata['test_type']:
            md_content += f"**Test Type:** {top_level_metadata.get('test_type')}\n\n"
        if 'test_mode' in top_level_metadata and top_level_metadata['test_mode']:
            md_content += f"**Test Mode:** {top_level_metadata.get('test_mode')}\n\n"
        if 'seed' in top_level_metadata and top_level_metadata['seed']:
            md_content += f"**Seed:** {top_level_metadata.get('seed')}\n\n"

    if chart_data:
        total_games = len(chart_data)
        passed = sum(1 for _, pf, *_ in chart_data if pf.lower() == 'passed')

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
        md_content += f"- **Failed:** {total_games - passed} ({(total_games-passed)/total_games*100:.1f}%)\n"
        md_content += f"- **Games with Intermittent Failures:** {intermittent_games_count}\n"
        md_content += f"- **Total Intermittent Failures:** {intermittent_total_count}\n\n"

        # Calculate generic exporter/logic statistics
        # Tuple indices: 0=name, 1=pass_fail, ..., 13=has_custom_exporter, 14=has_custom_game_logic
        passed_with_generic_exporter = sum(1 for row in chart_data
                                           if row[1].lower() == 'passed' and not row[13])
        passed_with_generic_logic = sum(1 for row in chart_data
                                        if row[1].lower() == 'passed' and not row[14])
        passed_with_both_generic = sum(1 for row in chart_data
                                       if row[1].lower() == 'passed' and not row[13] and not row[14])

        md_content += "### Generic Exporter/Logic Statistics\n\n"
        md_content += f"- **Passing with Generic Exporter:** {passed_with_generic_exporter}/{passed} ({passed_with_generic_exporter/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Exporter:** 0/0\n"
        md_content += f"- **Passing with Generic Logic:** {passed_with_generic_logic}/{passed} ({passed_with_generic_logic/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Logic:** 0/0\n"
        md_content += f"- **Passing with Both Generic:** {passed_with_both_generic}/{passed} ({passed_with_both_generic/passed*100:.1f}% of passed)\n\n" if passed > 0 else f"- **Passing with Both Generic:** 0/0\n\n"

    md_content += "## Test Results\n\n"
    md_content += "| Game Name | Test Result | Gen Errors | C1 Status | C1 Total | C1 Non-event | C1 Event | C2 Status | C2 Locations | Exporter | GameLogic |\n"
    md_content += "|-----------|-------------|------------|-----------|----------|--------------|----------|-----------|--------------|----------|----------|\n"

    for (game_name, pass_fail, gen_error_count,
         client1_checked, client1_total, client1_manually_checkable, client1_manually_checkable_checked,
         client1_event_locations, client1_event_locations_checked, client1_passed,
         client2_received, client2_total, client2_passed,
         has_custom_exporter, has_custom_game_logic) in chart_data:

        result_display = "✅ Passed" if pass_fail.lower() == 'passed' else "❌ Failed"
        client1_status = "✅" if client1_passed else "❌"
        client2_status = "✅" if client2_passed else "❌"

        # Look up file sizes from world_mapping if available
        if world_mapping and game_name in world_mapping:
            exporter_size = world_mapping[game_name].get('exporter_size', 0)
            game_logic_size = world_mapping[game_name].get('game_logic_size', 0)
            exporter_indicator = format_file_size(exporter_size)
            game_logic_indicator = format_file_size(game_logic_size)
        else:
            exporter_indicator = "⚫" if has_custom_exporter else "✅"
            game_logic_indicator = "⚫" if has_custom_game_logic else "✅"

        # Format location counts as "checked/total"
        c1_total_str = f"{client1_checked}/{client1_total}"
        c1_nonevent_str = f"{client1_manually_checkable_checked}/{client1_manually_checkable}"
        c1_event_str = f"{client1_event_locations_checked}/{client1_event_locations}"
        c2_locations_str = f"{client2_received}/{client2_total}"

        md_content += f"| {game_name} | {result_display} | {gen_error_count} | {client1_status} | {c1_total_str} | {c1_nonevent_str} | {c1_event_str} | {client2_status} | {c2_locations_str} | {exporter_indicator} | {game_logic_indicator} |\n"

    if not chart_data:
        md_content += "| No data available | - | - | - | - | - | - | - | - | - | - |\n"

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
    md_content += "- **Gen Errors:** Number of errors during world generation\n"
    md_content += "- **Client 1 (Send Test):** Tests sending location checks from Client 1\n"
    md_content += "  - **C1 Total:** Total locations checked / total locations (checked/total)\n"
    md_content += "  - **C1 Non-event:** Non-event locations checked / total non-event locations (manually-checkable)\n"
    md_content += "  - **C1 Event:** Event locations checked / total event locations (auto-checked)\n"
    md_content += "  - Client 1 passes if all manually-checkable locations are checked\n"
    md_content += "- **Client 2 (Receive Test):** Tests receiving location checks at Client 2\n"
    md_content += "  - **C2 Locations:** Locations received / total expected (received/total)\n"
    md_content += "  - Client 2 passes if all expected locations are received\n"
    md_content += "- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script\n"
    md_content += "- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files\n\n"
    md_content += "**Pass Criteria:** A test is marked as ✅ Passed only if:\n"
    md_content += "- Generation errors = 0 (no errors during world generation)\n"
    md_content += "- Client 1 passed (all manually-checkable locations sent)\n"
    md_content += "- Client 2 passed (all expected locations received)\n"
    md_content += "- Both clients completed successfully\n"

    return md_content
