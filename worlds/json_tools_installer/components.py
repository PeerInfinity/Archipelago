"""
Launcher components for JSON Tools Installer.

These components appear in the Archipelago Launcher and provide
access to JSON Tools installation and management functionality.
"""

from worlds.LauncherComponents import Component, Type, components, launch


def launch_installer(*args):
    """Launch the JSON Tools installer CLI."""
    from .cli.install import main
    main(list(args) if args else None)


def launch_status(*args):
    """Launch the JSON Tools status checker CLI."""
    from .cli.status import main
    main(list(args) if args else None)


def launch_installer_gui(*args):
    """Launch the JSON Tools installer GUI."""
    # Import here to avoid circular imports and to delay Kivy loading
    try:
        from .gui.installer_gui import run_installer_gui
        launch(run_installer_gui, name="JSON Tools Installer", args=args)
    except ImportError as e:
        # Fallback to CLI if GUI not available
        print(f"GUI not available ({e}), using CLI instead...")
        launch_installer(*args)


def launch_status_gui(*args):
    """Launch the JSON Tools status checker GUI."""
    try:
        from .gui.status_gui import run_status_gui
        launch(run_status_gui, name="JSON Tools Status", args=args)
    except ImportError as e:
        # Fallback to CLI if GUI not available
        print(f"GUI not available ({e}), using CLI instead...")
        launch_status(*args)


def launch_scripts_menu(*args):
    """Launch the scripts menu."""
    try:
        from .gui.scripts_gui import run_scripts_gui
        launch(run_scripts_gui, name="JSON Tools Scripts", args=args)
    except ImportError as e:
        print(f"GUI not available ({e})")
        print("Available scripts can be run from the scripts/ directory.")


# Register components with the launcher
components.extend([
    Component(
        "JSON Tools Installer",
        func=launch_installer_gui,
        component_type=Type.TOOL,
        cli=True,
        description="Install or update JSON Tools from GitHub"
    ),
    Component(
        "JSON Tools Status",
        func=launch_status_gui,
        component_type=Type.TOOL,
        description="Check installation status and version info"
    ),
    Component(
        "JSON Tools Scripts",
        func=launch_scripts_menu,
        component_type=Type.TOOL,
        description="Run JSON Tools utility scripts"
    ),
])
