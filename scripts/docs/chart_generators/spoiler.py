"""
Spoiler test chart data extraction and markdown generation.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from .utils import format_file_size


def extract_spoiler_chart_data(results: Dict[str, Any]) -> List[Tuple[str, str, int, float, float, bool, bool, Optional[bool], Optional[bool], Optional[float]]]:
    """
    Extract spoiler test chart data from results.
    Returns list of tuples: (game_name, pass_fail, gen_error_count, sphere_reached, max_spheres,
                             has_custom_exporter, has_custom_game_logic, rules_consistent, spoilers_consistent,
                             test_time_seconds)

    Consistency values:
    - True: all seeds have identical files
    - False: at least one seed has different files
    - None: no consistency data available
    """
    chart_data = []

    if 'results' not in results:
        return chart_data

    for template_filename, template_data in results['results'].items():
        # Check if this is seed range data
        if 'seed_range' in template_data:
            # Handle seed range results
            seeds_passed = template_data.get('seeds_passed', 0)
            seeds_failed = template_data.get('seeds_failed', 0)
            first_failure_seed = template_data.get('first_failure_seed')
            seed_range = template_data.get('seed_range', 'unknown')
            individual_results = template_data.get('individual_results', {})

            # Determine pass/fail and which seed's data to use
            if seeds_failed == 0 and seeds_passed > 0:
                pass_fail = f"Passed seeds {seed_range}"
                if individual_results:
                    first_seed_key = sorted(individual_results.keys(), key=lambda x: int(x) if x.isdigit() else 0)[0]
                    first_result = individual_results[first_seed_key]
                else:
                    # No individual results, use top-level data from template_data
                    first_result = template_data
            else:
                if first_failure_seed:
                    pass_fail = f"Failed seed {first_failure_seed}"
                    first_result = individual_results.get(str(first_failure_seed), template_data)
                else:
                    pass_fail = f"Failed"
                    # No individual results, use top-level data from template_data
                    first_result = template_data

            gen_error_count = first_result.get('generation', {}).get('error_count', 0)
            sphere_reached = first_result.get('spoiler_test', {}).get('sphere_reached', 0)
            max_spheres = first_result.get('spoiler_test', {}).get('total_spheres', 0)
            world_info = first_result.get('world_info', {})
            game_name = world_info.get('game_name_from_yaml') or template_filename.replace('.yaml', '')
            has_custom_exporter = world_info.get('has_custom_exporter', False)
            has_custom_game_logic = world_info.get('has_custom_game_logic', False)
            # Get test time from seed 1 if available
            seed_1_result = individual_results.get('1', {})
            test_time_seconds = seed_1_result.get('spoiler_test', {}).get('processing_time_seconds')
        else:
            # Handle single seed results
            world_info = template_data.get('world_info', {})
            game_name = world_info.get('game_name_from_yaml')

            if not game_name:
                game_name = template_filename.replace('.yaml', '').replace('_', ' ').title()

            original_pass_fail = template_data.get('spoiler_test', {}).get('pass_fail', 'unknown')
            gen_error_count = template_data.get('generation', {}).get('error_count', 0)
            sphere_reached = template_data.get('spoiler_test', {}).get('sphere_reached', 0)
            max_spheres = template_data.get('spoiler_test', {}).get('total_spheres', 0)
            has_custom_exporter = world_info.get('has_custom_exporter', False)
            has_custom_game_logic = world_info.get('has_custom_game_logic', False)
            test_time_seconds = template_data.get('spoiler_test', {}).get('processing_time_seconds')

            # Apply stricter pass criteria
            if original_pass_fail.lower() == 'passed' and gen_error_count == 0 and max_spheres > 0:
                pass_fail = 'Passed'
            else:
                pass_fail = 'Failed'

        # Extract consistency data
        consistency_tests = template_data.get('consistency_tests', {})
        rules_consistent = None
        spoilers_consistent = None

        if consistency_tests:
            # Check if all seeds have rules_identical = True
            rules_values = [ct.get('rules_identical') for ct in consistency_tests.values() if 'rules_identical' in ct]
            spoilers_values = [ct.get('spoilers_identical') for ct in consistency_tests.values() if 'spoilers_identical' in ct]

            if rules_values:
                # If any value is False, overall is False; if all True, overall is True
                rules_consistent = all(v is True for v in rules_values) if rules_values else None

            if spoilers_values:
                # If any value is False, overall is False; if all True, overall is True
                spoilers_consistent = all(v is True for v in spoilers_values) if spoilers_values else None

        chart_data.append((game_name, pass_fail, gen_error_count, sphere_reached, max_spheres, has_custom_exporter, has_custom_game_logic, rules_consistent, spoilers_consistent, test_time_seconds))

    chart_data.sort(key=lambda x: x[0])
    return chart_data


def generate_spoiler_markdown(chart_data: List[Tuple[str, str, int, float, float, bool, bool, Optional[bool], Optional[bool], Optional[float]]],
                              metadata: Dict[str, Any], subtitle: str = "", is_worldgen: bool = False,
                              other_version_link: Optional[str] = None,
                              world_mapping: Optional[Dict[str, Dict[str, Any]]] = None,
                              include_timing: bool = False,
                              variant_type: Optional[str] = None,
                              version_links: Optional[Dict[str, str]] = None) -> str:
    """Generate a markdown table for spoiler test data.

    Args:
        variant_type: None for original, "worldgen" for WorldGen, "apworld" for APWorld
        version_links: Dict mapping variant names to links, e.g. {"worldgen": "./file.md", "apworld": "./file.md"}
        is_worldgen: Deprecated, use variant_type="worldgen" instead
        other_version_link: Deprecated, use version_links instead
    """
    md_content = "# Archipelago Template Test Results Chart\n\n"

    if subtitle:
        md_content += f"## {subtitle}\n\n"

    # Add link to summary document
    summary_suffix = f"-{variant_type}" if variant_type else ""
    md_content += f"[← Back to Test Results Summary](./test-results-summary{summary_suffix}.md)\n\n"

    # Add link to test documentation
    md_content += "[📖 Learn about this test](../tests/test-spoilers.md)\n\n"

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

    if metadata:
        md_content += f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        md_content += f"**Source Data Created:** {metadata.get('created', 'Unknown')}\n\n"
        md_content += f"**Source Data Last Updated:** {metadata.get('last_updated', 'Unknown')}\n\n"

    if chart_data:
        total_games = len(chart_data)
        passed = sum(1 for _, pf, _, _, _, _, _, _, _, _ in chart_data if 'passed' in pf.lower())
        failed = sum(1 for _, pf, _, _, _, _, _, _, _, _ in chart_data if 'failed' in pf.lower())

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
        md_content += f"- **Games with Intermittent Failures:** {intermittent_games_count}\n"
        md_content += f"- **Total Intermittent Failures:** {intermittent_total_count}\n\n"

        # Calculate generic exporter/logic statistics
        passed_with_generic_exporter = sum(1 for _, pf, _, _, _, has_exporter, _, _, _, _ in chart_data
                                           if 'passed' in pf.lower() and not has_exporter)
        passed_with_generic_logic = sum(1 for _, pf, _, _, _, _, has_logic, _, _, _ in chart_data
                                        if 'passed' in pf.lower() and not has_logic)
        passed_with_both_generic = sum(1 for _, pf, _, _, _, has_exporter, has_logic, _, _, _ in chart_data
                                       if 'passed' in pf.lower() and not has_exporter and not has_logic)

        md_content += "### Generic Exporter/Logic Statistics\n\n"
        md_content += f"- **Passing with Generic Exporter:** {passed_with_generic_exporter}/{passed} ({passed_with_generic_exporter/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Exporter:** 0/0\n"
        md_content += f"- **Passing with Generic Logic:** {passed_with_generic_logic}/{passed} ({passed_with_generic_logic/passed*100:.1f}% of passed)\n" if passed > 0 else f"- **Passing with Generic Logic:** 0/0\n"
        md_content += f"- **Passing with Both Generic:** {passed_with_both_generic}/{passed} ({passed_with_both_generic/passed*100:.1f}% of passed)\n\n" if passed > 0 else f"- **Passing with Both Generic:** 0/0\n\n"

    md_content += "## Test Results\n\n"
    if include_timing:
        md_content += "| Game Name | Test Result | Gen Errors | Sphere Reached | Max Spheres | Progress | Test Time | Exporter | GameLogic |\n"
        md_content += "|-----------|-------------|------------|----------------|-------------|----------|-----------|----------|----------|\n"
    else:
        md_content += "| Game Name | Test Result | Gen Errors | Sphere Reached | Max Spheres | Progress | Exporter | GameLogic |\n"
        md_content += "|-----------|-------------|------------|----------------|-------------|----------|----------|----------|\n"

    for game_name, pass_fail, gen_error_count, sphere_reached, max_spheres, has_custom_exporter, has_custom_game_logic, rules_consistent, spoilers_consistent, test_time_seconds in chart_data:
        if 'passed' in pass_fail.lower():
            progress = "🟢 Complete"
        elif sphere_reached >= 1.0:
            progress_pct = (sphere_reached / max_spheres) * 100 if max_spheres > 0 else 0
            progress = f"🟡 {progress_pct:.1f}%"
        elif sphere_reached > 0:
            progress_pct = (sphere_reached / max_spheres) * 100 if max_spheres > 0 else 0
            progress = f"🟠 {progress_pct:.1f}%"
        else:
            progress = "🔴 0.0%"

        if 'passed seeds' in pass_fail.lower():
            result_display = f"✅ {pass_fail}"
        elif 'failed seed' in pass_fail.lower():
            result_display = f"❌ {pass_fail}"
        elif pass_fail.lower() == 'passed':
            result_display = "✅ Passed"
        else:
            result_display = "❌ Failed"

        # Look up file sizes from world_mapping if available
        if world_mapping and game_name in world_mapping:
            exporter_size = world_mapping[game_name].get('exporter_size', 0)
            game_logic_size = world_mapping[game_name].get('game_logic_size', 0)
            exporter_indicator = format_file_size(exporter_size)
            game_logic_indicator = format_file_size(game_logic_size)
        else:
            exporter_indicator = "⚫" if has_custom_exporter else "✅"
            game_logic_indicator = "⚫" if has_custom_game_logic else "✅"

        if include_timing:
            # Format test time
            if test_time_seconds is not None:
                test_time_display = f"{test_time_seconds:.1f}s"
            else:
                test_time_display = "N/A"
            md_content += f"| {game_name} | {result_display} | {gen_error_count} | {sphere_reached:g} | {max_spheres:g} | {progress} | {test_time_display} | {exporter_indicator} | {game_logic_indicator} |\n"
        else:
            md_content += f"| {game_name} | {result_display} | {gen_error_count} | {sphere_reached:g} | {max_spheres:g} | {progress} | {exporter_indicator} | {game_logic_indicator} |\n"

    if not chart_data:
        if include_timing:
            md_content += "| No data available | - | - | - | - | - | - | - | - |\n"
        else:
            md_content += "| No data available | - | - | - | - | - | - | - |\n"

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
            md_content += "These seeds were previously failing but passed during a retest run:\n\n"
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
    md_content += "- **Sphere Reached:** The logical sphere the test reached before completion/failure\n"
    md_content += "- **Max Spheres:** Total logical spheres available in the game\n"
    md_content += "- **Progress:** Percentage of logical spheres completed\n"
    md_content += "- **Test Time:** Time to run the spoiler test for seed 1 (in seconds)\n"
    md_content += "- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script\n"
    md_content += "- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files\n\n"
    md_content += "**Pass Criteria:** Generation errors = 0, Max spheres > 0, Spoiler test completed successfully\n"

    return md_content
