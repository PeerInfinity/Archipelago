"""
CLI for installing/updating JSON Tools.

Usage:
    python -m worlds.json_tools_installer.cli.install [options]

Examples:
    # Install stable version with default components
    python -m worlds.json_tools_installer.cli.install

    # Install dev version with all components
    python -m worlds.json_tools_installer.cli.install --version dev --all

    # Install specific components
    python -m worlds.json_tools_installer.cli.install --frontend --presets

    # Update existing installation
    python -m worlds.json_tools_installer.cli.install --update

    # Uninstall
    python -m worlds.json_tools_installer.cli.install --uninstall
"""

import argparse
import sys
import tempfile
from pathlib import Path

from ..config import (
    load_config,
    update_installation_info,
    clear_installation,
    InstallerConfig,
    configure_export_settings,
    EXPORT_PRESETS,
)
from ..installer.version_detector import detect_ap_version, get_version_support_status
from ..installer.downloader import (
    download_archive,
    get_download_url,
    get_latest_commit_hash,
    check_connectivity,
    check_installer_compatibility,
)
from ..installer.extractor import (
    extract_tools,
    list_installed_components,
    remove_component,
    restore_component_backup,
    list_component_backups,
    COMPONENTS,
    DEFAULT_COMPONENTS,
)
from ..installer.romless_patcher import (
    apply_romless_patches,
    revert_romless_patches,
)


def print_header(text: str) -> None:
    """Print a section header."""
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print('=' * 60)


def print_status(label: str, value: str, ok: bool = True) -> None:
    """Print a status line."""
    symbol = "[OK]" if ok else "[!!]"
    print(f"  {symbol} {label}: {value}")


def progress_callback(current: int, total: int) -> None:
    """Print download progress."""
    from ..installer.downloader import APPROXIMATE_ARCHIVE_SIZE
    current_mb = current / (1024 * 1024)
    if total > 0:
        pct = current * 100 // total
        bar_len = 40
        filled = bar_len * current // total
        bar = '=' * filled + '-' * (bar_len - filled)
        total_mb = total / (1024 * 1024)
        print(f"\r  Downloading: [{bar}] {pct}% ({current_mb:.1f}/{total_mb:.1f} MB)", end="", flush=True)
    else:
        approx_mb = APPROXIMATE_ARCHIVE_SIZE / (1024 * 1024)
        print(f"\r  Downloading: {current_mb:.1f} of about {approx_mb:.0f} MB", end="", flush=True)


def extract_progress_callback(filename: str, current: int, total: int) -> None:
    """Print extraction progress."""
    pct = current * 100 // total
    # Truncate filename if too long
    if len(filename) > 40:
        filename = "..." + filename[-37:]
    print(f"\r  Extracting: {current}/{total} ({pct}%) - {filename:<40}", end="", flush=True)


def do_install(
    config: InstallerConfig,
    version: str,
    components: list,
    dry_run: bool = False,
    patch_mode: str = "monkey",
    skip_confirmation: bool = False,
    configure_export: bool = True,
    export_preset: str = "normal",
    apply_romless: bool = False,
) -> bool:
    """
    Perform the installation.

    Args:
        config: Installer configuration.
        version: Version to install ("stable" or "dev").
        components: List of component names to install.
        dry_run: If True, only show what would be done.
        patch_mode: Patch mode - "none" or "monkey" (default).
        skip_confirmation: If True, skip confirmation prompts.
        configure_export: If True, configure export settings in host.yaml.
        export_preset: Export settings preset to use ("normal" or "minimal-spoilers").
        apply_romless: If True, apply ROM-less patches after extraction.

    Returns:
        True if successful.
    """
    source = config.get_source(version)

    print_header(f"Installing JSON Tools ({version})")
    print(f"  Source: {source.repo} @ {source.branch}")
    print(f"  Components: {', '.join(components)}")

    if dry_run:
        print("\n  [DRY RUN] Would download and install the above.")
        return True

    # Check connectivity
    print("\n  Checking connectivity...")
    if not check_connectivity():
        print("  [ERROR] Cannot reach GitHub. Check your internet connection.")
        return False
    print("  [OK] GitHub is reachable")

    # Check installer compatibility
    print("\n  Checking installer compatibility...")
    compat = check_installer_compatibility(source)
    if not compat.compatible:
        if compat.error:
            print(f"  [ERROR] {compat.error}")
        else:
            print(f"  [ERROR] Installer version {compat.current_version} is too old.")
            print(f"          Minimum required version: {compat.required_version}")
            if compat.message:
                print(f"\n  {compat.message}")
            if compat.download_url:
                print(f"\n  Download the latest installer from:")
                print(f"  {compat.download_url}")
        return False
    print(f"  [OK] Installer v{compat.current_version} is compatible")

    # Get latest commit hash
    commit_hash = get_latest_commit_hash(source)
    if commit_hash:
        print(f"  [OK] Latest commit: {commit_hash[:12]}")

    # Warn about components that replace vanilla files
    if "rule_builder" in components:
        print("\n  [WARNING] Rule Builder will replace the vanilla rule_builder/ directory.")
        print("            A backup will be created automatically before overwriting.")
        print("            To restore later: python -m worlds.json_tools_installer.cli.install --restore-rule-builder")
        if not skip_confirmation:
            response = input("\n  Continue? [y/N]: ")
            if response.lower() != 'y':
                print("  Aborted.")
                return False

    # Download archive
    print(f"\n  Downloading from: {get_download_url(source)}")

    with tempfile.TemporaryDirectory() as temp_dir:
        archive_path = Path(temp_dir) / "archive.zip"

        result = download_archive(
            source,
            dest_path=archive_path,
            progress_callback=progress_callback,
        )
        print()  # New line after progress bar

        if not result.success:
            print(f"  [ERROR] Download failed: {result.error}")
            return False

        print(f"  [OK] Downloaded {result.size_bytes / 1024 / 1024:.1f} MB")

        # Extract components
        print("\n  Extracting files...")

        extract_result = extract_tools(
            archive_path,
            components,
            progress_callback=extract_progress_callback,
        )
        print()  # New line after progress

        if not extract_result.success:
            print("  [ERROR] Extraction failed:")
            for error in extract_result.errors:
                print(f"    - {error}")
            return False

        print(f"  [OK] Extracted {len(extract_result.extracted_files)} files")

        if extract_result.skipped_files:
            print(f"  [INFO] Skipped {len(extract_result.skipped_files)} existing files")

        # Install Python dependencies
        print("\n  Installing dependencies...")
        from ..installer.dependencies import install_missing_dependencies
        dep_ok, dep_msg = install_missing_dependencies()
        if dep_ok:
            print(f"  [OK] {dep_msg}")
        else:
            print(f"  [WARN] {dep_msg}")

        # Apply patches based on selected mode
        if patch_mode == "monkey":
            print("\n  Setting up monkey patching...")
            from ..monkey_patches import install_hooks
            hook_results = install_hooks()
            success_count = sum(1 for v in hook_results.values() if v)
            print(f"  [OK] Installed {success_count}/{len(hook_results)} runtime hooks")
            config.patches.method = "monkey"

        else:
            # No patching (patch_mode == "none")
            print("\n  [INFO] No patching selected, skipping patch application.")
            config.patches.method = "none"

    # Apply ROM-less patches if requested
    if apply_romless:
        if "romless_patches" not in components:
            print("\n  [WARN] --apply-romless-patches requires --romless-patches component to be downloaded.")
            print("         Skipping ROM-less patch application.")
        else:
            print("\n  Applying ROM-less patches...")
            romless_result = apply_romless_patches(config)
            if romless_result.success:
                if romless_result.patched_worlds:
                    print(f"  [OK] Applied ROM-less patches to {len(romless_result.patched_worlds)} files")
                    for f in romless_result.patched_worlds:
                        print(f"    - {f}")
            else:
                print("  [WARN] ROM-less patching issues:")
                for error in romless_result.errors:
                    print(f"    - {error}")

    # Configure export settings in host.yaml
    if configure_export:
        print(f"\n  Configuring export settings ({export_preset} preset)...")
        if configure_export_settings(preset=export_preset):
            print(f"  [OK] Export settings configured in host.yaml")
            if export_preset == "minimal-spoilers":
                print("       JSON export and sphere logging are now enabled.")
        else:
            print("  [WARN] Could not configure export settings. You may need to run:")
            print("         python scripts/setup/update_host_settings.py minimal-spoilers")

    # Update config
    update_installation_info(config, version, components, commit_hash)

    print_header("Installation Complete")
    print("  JSON Tools has been installed successfully!")
    print("\n  Next steps:")
    print("  1. Components are ready to use")
    if not configure_export:
        print("  2. Configure host.yaml (run scripts/setup/update_host_settings.py)")
        print("  3. Generate a seed to test the installation")
    else:
        print("  2. Generate a seed to test the installation")

    return True


def do_uninstall(config: InstallerConfig, dry_run: bool = False) -> bool:
    """
    Uninstall JSON Tools.

    Returns:
        True if successful.
    """
    print_header("Uninstalling JSON Tools")

    # Revert romless patches first
    print("  Reverting ROM-less patches...")
    if not dry_run:
        romless_result = revert_romless_patches(config)
        if romless_result.patched_worlds:
            for f in romless_result.patched_worlds:
                print(f"    - {f}")
        if romless_result.errors:
            print("  [WARN] Some ROM-less patches could not be reverted:")
            for error in romless_result.errors:
                print(f"    - {error}")

    # Remove installed components
    installed = list_installed_components()
    print(f"\n  Removing components: {', '.join(installed)}")

    if not dry_run:
        for comp in installed:
            if remove_component(comp):
                print(f"    - Removed {comp}")

        clear_installation(config)

    print("\n  [OK] Uninstallation complete")
    return True


def main(args=None):
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description="Install or update JSON Tools for Archipelago",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Version selection
    parser.add_argument(
        "--version", "-v",
        choices=["stable", "dev"],
        default="stable",
        help="Version to install (default: stable)",
    )

    # Component selection
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        help="Install all components",
    )
    parser.add_argument(
        "--exporter",
        action="store_true",
        help="Install exporter module (default component)",
    )
    parser.add_argument(
        "--rule-builder",
        action="store_true",
        help="Install extended rule builder (replaces vanilla rule_builder/)",
    )
    parser.add_argument(
        "--world-generator",
        action="store_true",
        help="Install world generator module (default component)",
    )
    parser.add_argument(
        "--scripts",
        action="store_true",
        help="Install utility scripts (default component)",
    )
    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Install frontend web UI (default component)",
    )
    parser.add_argument(
        "--presets",
        action="store_true",
        help="Install presets (requires --frontend)",
    )
    parser.add_argument(
        "--docs",
        action="store_true",
        help="Install documentation (default component)",
    )
    parser.add_argument(
        "--romless-patches",
        action="store_true",
        help="Install ROM-less generation patches (default component)",
    )
    parser.add_argument(
        "--demo-worlds",
        action="store_true",
        help="Install example/demo worlds (default component)",
    )
    parser.add_argument(
        "--worldgen-worlds",
        action="store_true",
        help="Install auto-generated world packages from JSON rules",
    )
    parser.add_argument(
        "--tracker",
        action="store_true",
        help="Install PopTracker integration world",
    )
    parser.add_argument(
        "--testing",
        action="store_true",
        help="Install testing infrastructure (package.json, playwright, vitest)",
    )

    # Actions
    parser.add_argument(
        "--update", "-u",
        action="store_true",
        help="Update existing installation",
    )
    parser.add_argument(
        "--uninstall",
        action="store_true",
        help="Uninstall JSON Tools",
    )
    parser.add_argument(
        "--revert-patches",
        action="store_true",
        help="Revert ROM-less patches only (keep tools)",
    )
    parser.add_argument(
        "--restore-rule-builder",
        action="store_true",
        help="Restore the vanilla rule_builder/ directory from backup",
    )

    # Options
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show what would be done without making changes",
    )

    parser.add_argument(
        "--no-patch",
        action="store_true",
        help="Do not apply any patches (JSON export will not work without manual setup)",
    )
    # Note: monkey patching is the default, no flag needed

    parser.add_argument(
        "--apply-romless-patches",
        action="store_true",
        help="Apply ROM-less patches after download (allows generation without ROMs)",
    )

    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip confirmation prompts (auto-confirm)",
    )

    # Export settings configuration
    export_group = parser.add_mutually_exclusive_group()
    export_group.add_argument(
        "--configure-export",
        action="store_true",
        default=True,
        help="Configure export settings in host.yaml (default: enabled)",
    )
    export_group.add_argument(
        "--no-configure-export",
        action="store_true",
        help="Skip configuring export settings in host.yaml",
    )

    parser.add_argument(
        "--export-preset",
        choices=list(EXPORT_PRESETS.keys()),
        default="normal",
        help="Export settings preset to use (default: normal). 'minimal-spoilers' enables JSON export.",
    )

    parsed = parser.parse_args(args)

    # Load config
    config = load_config()

    # Check AP version
    version_info = detect_ap_version()
    print(f"\nArchipelago Version: {version_info.version_string}")
    print(f"Support Status: {get_version_support_status(version_info)}")

    if not version_info.is_supported:
        print(f"\n[WARNING] {version_info.notes}")
        if not parsed.dry_run and not parsed.yes:
            response = input("Continue anyway? [y/N]: ")
            if response.lower() != 'y':
                print("Aborted.")
                return 1
        elif parsed.yes:
            print("  (Auto-confirmed with --yes)")


    # Handle actions
    if parsed.uninstall:
        success = do_uninstall(config, parsed.dry_run)
        return 0 if success else 1

    if parsed.revert_patches:
        print_header("Reverting ROM-less Patches")
        if not parsed.dry_run:
            result = revert_romless_patches(config)
            for f in result.patched_worlds:
                print(f"  - {f}")
            if result.errors:
                for e in result.errors:
                    print(f"  [ERROR] {e}")
                return 1
        return 0

    if parsed.restore_rule_builder:
        print_header("Restoring Vanilla Rule Builder")
        backups = list_component_backups("rule_builder")
        if not backups:
            print("  [ERROR] No rule_builder backups found.")
            return 1
        print(f"  Found {len(backups)} backup(s). Latest: {backups[0]}")
        if not parsed.dry_run:
            if restore_component_backup("rule_builder"):
                print("  [OK] Restored rule_builder/ from backup.")
            else:
                print("  [ERROR] Failed to restore rule_builder/.")
                return 1
        else:
            print("  [DRY RUN] Would restore rule_builder/ from backup.")
        return 0

    # Determine components to install
    components = []
    if parsed.all:
        components = list(COMPONENTS.keys())
    else:
        # Map CLI flags to component names
        flag_to_component = {
            "exporter": "exporter",
            "rule_builder": "rule_builder",
            "world_generator": "world_generator",
            "scripts": "scripts",
            "frontend": "frontend",
            "presets": "presets",
            "docs": "docs",
            "romless_patches": "romless_patches",
            "demo_worlds": "demo_worlds",
            "worldgen_worlds": "worldgen_worlds",
            "tracker": "tracker",
            "testing": "testing",
        }
        for flag, comp_name in flag_to_component.items():
            if getattr(parsed, flag, False):
                components.append(comp_name)

        # If presets selected, ensure frontend is also included
        if "presets" in components and "frontend" not in components:
            components.append("frontend")

    if not components:
        components = list(DEFAULT_COMPONENTS)

    # For update, use existing config's version if not specified
    version = parsed.version
    if parsed.update and config.installation.version:
        version = config.installation.version
        print(f"\nUpdating existing {version} installation...")

    # Determine patch mode (default is monkey patching)
    if parsed.no_patch:
        patch_mode = "none"
    else:
        patch_mode = "monkey"  # Default

    # Determine if we should configure export settings
    configure_export = not parsed.no_configure_export

    success = do_install(
        config,
        version,
        components,
        parsed.dry_run,
        patch_mode,
        parsed.yes,  # skip_confirmation
        configure_export,
        parsed.export_preset,
        parsed.apply_romless_patches,
    )
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
