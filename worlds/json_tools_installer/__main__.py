"""
CLI entry point for JSON Tools Installer.

Allows running the installer directly:
    python -m worlds.json_tools_installer install [options]
    python -m worlds.json_tools_installer status [options]
    python -m worlds.json_tools_installer config [options]
    python -m worlds.json_tools_installer --help

This module routes subcommands to the appropriate CLI module.
Each CLI module defines its own arguments — nothing is duplicated here.
"""

import argparse
import sys


def handle_config(args):
    """Handle the config subcommand (small enough to live here)."""
    parser = argparse.ArgumentParser(
        prog="json_tools_installer config",
        description="View or modify JSON Tools Installer configuration",
    )
    parser.add_argument("--show", action="store_true", help="Show current config")
    parser.add_argument("--stable-repo", help="Set stable repository")
    parser.add_argument("--stable-branch", help="Set stable branch")
    parser.add_argument("--dev-repo", help="Set dev repository")
    parser.add_argument("--dev-branch", help="Set dev branch")

    parsed = parser.parse_args(args)

    from .config import load_config, save_config
    config = load_config()

    modified = False
    if parsed.stable_repo:
        config.stable_source.repo = parsed.stable_repo
        modified = True
    if parsed.stable_branch:
        config.stable_source.branch = parsed.stable_branch
        modified = True
    if parsed.dev_repo:
        config.dev_source.repo = parsed.dev_repo
        modified = True
    if parsed.dev_branch:
        config.dev_source.branch = parsed.dev_branch
        modified = True

    if modified:
        save_config(config)
        print("Configuration updated.")

    if parsed.show or not modified:
        print(f"Stable: {config.stable_source.repo} @ {config.stable_source.branch}")
        print(f"Dev: {config.dev_source.repo} @ {config.dev_source.branch}")

    return 0


HELP_TEXT = """\
usage: json_tools_installer <command> [options]

JSON Tools Installer for Archipelago

commands:
  install     Install or update JSON Tools
  status      Check installation status
  config      View or modify configuration

Run 'python -m worlds.json_tools_installer <command> --help' for command-specific options."""


def main():
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(HELP_TEXT)
        return 0

    command = args[0]
    remaining = args[1:]

    if command == "install":
        from .cli.install import main as install_main
        return install_main(remaining)

    elif command == "status":
        from .cli.status import main as status_main
        return status_main(remaining)

    elif command == "config":
        return handle_config(remaining)

    else:
        print(f"Unknown command: {command}")
        print(HELP_TEXT)
        return 1


if __name__ == "__main__":
    sys.exit(main())
