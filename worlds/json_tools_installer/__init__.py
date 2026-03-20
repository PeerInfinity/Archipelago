"""
JSON Tools Installer - Install and manage JSON Tools for Archipelago.

This APWorld provides:
- Installer to download JSON Tools from GitHub (stable or dev versions)
- Status checker to verify installation state
- Script launcher for utility scripts
- Patcher to apply/revert core file modifications

Components are available in the Archipelago Launcher after installation.
"""

__version__ = "1.0.0"

from typing import ClassVar

from worlds.AutoWorld import WebWorld, World
from .json_tools_settings import JSONToolsSettings

# Import and register launcher components
from . import components as _components

# Register post-output generation hook (works in fork where worlds/Hooks.py exists)
try:
    from worlds.Hooks import register_post_output_hook
    from .export_hook import export_post_output_hook
    register_post_output_hook(export_post_output_hook)
except ImportError:
    pass  # worlds/Hooks.py doesn't exist (vanilla AP without hook support)

# Auto-install monkey patches if configured
try:
    from .monkey_patches import auto_install
    auto_install()
except Exception:
    pass  # Silently ignore errors during auto-install


class JSONToolsInstallerWeb(WebWorld):
    tutorials = []
    game_info_languages = []

class JSONToolsInstallerWorld(World):
    """
    Minimal hidden world to satisfy AutoWorldRegister.
    JSON Tools Installer is a utility package, not a playable game.
    """
    game = "JSON Tools Installer"
    hidden = True
    web = JSONToolsInstallerWeb()
    settings_key = "json_tools"
    settings: ClassVar[JSONToolsSettings]

    # Empty mappings - no actual items or locations
    item_name_to_id = {}
    location_name_to_id = {}

    # Prevent this from being selected as a game
    @classmethod
    def stage_assert_generate(cls, multiworld) -> None:
        raise RuntimeError("JSON Tools Installer is a utility package, not a playable game.")
