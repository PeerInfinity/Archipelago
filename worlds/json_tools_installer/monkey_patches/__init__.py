"""
Monkey patching module for JSON Tools.

Provides runtime patches for Archipelago core files to add
JSON export functionality without modifying source files.

Usage:
    from worlds.json_tools_installer.monkey_patches import install_hooks

    # Install all hooks
    results = install_hooks()

    # Check what's installed
    from worlds.json_tools_installer.monkey_patches import get_installed_hooks
    print(get_installed_hooks())

    # Uninstall
    from worlds.json_tools_installer.monkey_patches import uninstall_hooks
    uninstall_hooks()
"""

from .hooks import (
    install_hooks,
    uninstall_hooks,
    is_hook_installed,
    get_installed_hooks,
    auto_install,
)

__all__ = [
    "install_hooks",
    "uninstall_hooks",
    "is_hook_installed",
    "get_installed_hooks",
    "auto_install",
]
