"""
Post-output hook for JSON rule export and pickle export.

Registered by json_tools_installer to run after seed generation output,
replacing the direct exporter calls that were previously in Main.py.
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from BaseClasses import MultiWorld

logger = logging.getLogger(__name__)


def export_post_output_hook(multiworld: "MultiWorld", output_dir: str, filename_base: str) -> None:
    """Export game rules and multiworld pickle after output generation."""
    from exporter import export_game_rules, clear_rule_cache
    from exporter.games import clear_handler_cache
    from exporter.pickle_exporter import export_multiworld_pickle
    from .json_tools_settings import get_json_tools_settings

    # Call per-world post_output hooks (e.g., JTA cost adjustment).
    # Runs before export_game_rules so generated files are included in preset copy.
    for player_id, world in multiworld.worlds.items():
        if hasattr(world, "post_output"):
            try:
                world.post_output(output_dir, filename_base)
            except Exception as e:
                logger.warning(
                    f"post_output failed for {world.game} player {player_id}: {e}"
                )

    jt = get_json_tools_settings()

    # Auto-detect Rule Builder availability and fall back to ast format if needed.
    # The rule_builder format requires the fork's extended rule_builder package;
    # without it, fall back to ast format which works with vanilla Archipelago.
    rules_format = jt.rules_json_format
    if rules_format in ("rule_builder", "both"):
        try:
            from rule_builder import BOOLEAN_RULE_TYPES  # noqa: F401
        except (ImportError, AttributeError):
            logger.info(
                "Extended Rule Builder not available, falling back to 'ast' format "
                "(was '%s')", rules_format
            )
            rules_format = "ast"

    # Export rules data after create_playthrough so sphere_log.jsonl is included.
    # The exporter uses cached _cached_slot_data instead of calling fill_slot_data,
    # so it won't repopulate caches that were cleared by stage_modify_multidata.
    export_game_rules(
        multiworld,
        output_dir,
        filename_base,
        jt.update_frontend_presets,
        jt.skip_preset_copy_if_rules_identical,
        rules_format,
        clear_game_presets=jt.clear_game_presets,
        clear_all_presets=jt.clear_all_presets,
    )
    # Clear exporter caches to allow GC
    clear_rule_cache()
    clear_handler_cache()

    # Export multiworld as pickle for tracker (alternative to rules_json)
    export_multiworld_pickle(
        multiworld,
        output_dir,
        filename_base,
        jt.update_frontend_presets,
        jt.skip_preset_copy_if_rules_identical,
    )
