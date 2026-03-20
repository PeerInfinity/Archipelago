"""
CLI for checking JSON Tools installation status.

Usage:
    python -m worlds.json_tools_installer.cli.status [options]

Examples:
    # Show installation status
    python -m worlds.json_tools_installer.cli.status

    # Show verbose status with file hashes
    python -m worlds.json_tools_installer.cli.status --verbose

    # Show configuration
    python -m worlds.json_tools_installer.cli.status --config
"""

import argparse
import sys

from ..config import load_config, get_config_path
from ..installer.version_detector import detect_ap_version, get_version_support_status
from ..installer.extractor import list_installed_components, COMPONENTS
from ..installer.romless_patcher import get_romless_patch_summary


def print_header(text: str) -> None:
    """Print a section header."""
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print('=' * 60)


def print_row(label: str, value: str, indent: int = 2) -> None:
    """Print a labeled row."""
    spaces = ' ' * indent
    print(f"{spaces}{label:<30} {value}")


def print_status_icon(ok: bool) -> str:
    """Return status icon."""
    return "[OK]" if ok else "[!!]"


def show_status(verbose: bool = False) -> None:
    """Show installation status."""
    config = load_config()

    # Version info
    print_header("Archipelago Version")
    version_info = detect_ap_version()
    print_row("Version:", version_info.version_string)
    print_row("Support Status:", get_version_support_status(version_info))
    if version_info.notes:
        print_row("Notes:", version_info.notes)

    # Installation info
    print_header("JSON Tools Installation")
    if config.installation.installed_at:
        print_row("Installed Version:", config.installation.version)
        print_row("Source Repository:", config.installation.source_repo or "unknown")
        print_row("Source Branch:", config.installation.source_branch or "unknown")
        print_row("Installed At:", config.installation.installed_at)
        if config.installation.commit_hash:
            print_row("Commit:", config.installation.commit_hash[:12])
    else:
        print("  Not installed")

    # Components
    print_header("Components")
    installed = list_installed_components()

    for name, comp in COMPONENTS.items():
        is_installed = name in installed
        status_icon = print_status_icon(is_installed)
        status_text = "Installed" if is_installed else "Not installed"
        print(f"  {status_icon} {comp.display_name:<25} {status_text}")
        if verbose and is_installed:
            for path in comp.source_paths:
                print(f"        -> {path}/")

    # ROM-less Patches
    print_header("ROM-less Patches")
    romless_summary = get_romless_patch_summary(config)

    print_row("Patch Method:", config.patches.method)
    print_row("Worlds Patched:", f"{romless_summary['patched_count']}/{romless_summary['total_worlds']}")
    print_row("Infrastructure:", f"{romless_summary['infrastructure_patched']}/{romless_summary['infrastructure_files']}")
    print_row("Backups Available:", str(romless_summary['backup_count']))
    if romless_summary.get("applied_at"):
        print_row("Applied At:", romless_summary["applied_at"])

    print()
    for world_name, status in romless_summary.get("worlds", {}).items():
        patched_icon = print_status_icon(status.is_patched)
        backup_text = " (backup available)" if status.has_backup else ""
        if not status.world_exists:
            status_text = "Not installed"
        elif status.is_patched:
            status_text = "Patched"
        else:
            status_text = "Original"
        print(f"  {patched_icon} {world_name:<20} {status_text}{backup_text}")

        if verbose:
            if status.current_hash:
                print(f"        Current:  {status.current_hash[:16]}...")
            if status.original_hash:
                print(f"        Original: {status.original_hash[:16]}...")
            if status.backup_path:
                print(f"        Backup:   {status.backup_path}")

    # Infrastructure files
    for _infra_key, status in romless_summary.get("infrastructure", {}).items():
        patched_icon = print_status_icon(status.is_patched)
        if not status.world_exists:
            status_text = "Not installed"
        elif status.is_patched:
            status_text = "Patched"
        else:
            status_text = "Original"
        print(f"  {patched_icon} {status.world:<20} {status_text}")

    # Configuration file location
    if verbose:
        print_header("Configuration")
        print_row("Config File:", str(get_config_path()))


def show_config() -> None:
    """Show current configuration."""
    config = load_config()

    print_header("Download Sources")
    print_row("Stable Repository:", config.stable_source.repo)
    print_row("Stable Branch:", config.stable_source.branch)
    print_row("Dev Repository:", config.dev_source.repo)
    print_row("Dev Branch:", config.dev_source.branch)

    print_header("Installation Settings")
    print_row("Preferred Version:", config.installation.version)
    print_row("Components:", ", ".join(config.installation.components))

    print_header("Configuration File")
    print_row("Location:", str(get_config_path()))


def main(args=None):
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description="Check JSON Tools installation status",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed information including file hashes",
    )
    parser.add_argument(
        "--config", "-c",
        action="store_true",
        help="Show configuration settings",
    )

    parsed = parser.parse_args(args)

    if parsed.config:
        show_config()
    else:
        show_status(parsed.verbose)

    return 0


if __name__ == "__main__":
    sys.exit(main())
