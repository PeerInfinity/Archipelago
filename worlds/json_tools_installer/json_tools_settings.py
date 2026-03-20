"""
Settings group for JSON Tools, stored in host.yaml under the 'json_tools' namespace.

These settings control rule export, sphere logging, pickle export, and related
features. They were previously in GeneralOptions but belong here since they're
all consumed by the exporter and json_tools_installer.
"""

from settings import Group


class JSONToolsSettings(Group):
    """Settings for JSON Tools (rule export, sphere logging, etc.)"""
    skip_required_files: bool = False  # Also extracted early in Settings.__init__ for Group.__getattribute__
    save_rules_json: bool = False
    rules_json_format: str = "rule_builder"  # Options: "rule_builder", "ast", "both"
    save_tracker_pickle: bool = False  # Export multiworld as pickle for tracker (alternative to rules_json)
    skip_preset_copy_if_rules_identical: bool = False
    save_sphere_log: bool = False
    verbose_sphere_log: bool = False
    extend_sphere_log_to_all_locations: bool = False
    log_fractional_sphere_details: bool = True
    log_integer_sphere_details: bool = False
    auto_collect_events: bool = False  # Auto-collect event items when locations become accessible
    filter_event_items: bool = False  # Filter out event locations/items from sphere log output (matches UT behavior)
    update_frontend_presets: bool = False
    clear_game_presets: bool = False  # Delete all existing presets for the current game before generating new ones
    clear_all_presets: bool = False  # Delete all existing presets for ALL games before generating new ones
    resolve_options_to_constants: bool = True  # Resolve world.options.X.value to constants at export time (default: True)
    use_tracking_mode_config: bool = False  # Use tracking-mode-config.json for per-game export decisions


def get_json_tools_settings() -> JSONToolsSettings:
    """Get settings from host.yaml json_tools section, with defaults fallback."""
    try:
        from settings import get_settings
        result = getattr(get_settings(), 'json_tools', None)
        if result is not None:
            return result
    except Exception:
        pass
    return JSONToolsSettings()
