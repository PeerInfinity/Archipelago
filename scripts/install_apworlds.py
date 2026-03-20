#!/usr/bin/env python3
"""
CLI tool to bulk install APWorlds from silasary's index.

Usage:
    python scripts/install_apworlds.py                    # List available worlds (filtered by spreadsheet status)
    python scripts/install_apworlds.py --install-all      # Install all available worlds matching status filter
    python scripts/install_apworlds.py --install actraiser zelda3  # Install specific worlds
    python scripts/install_apworlds.py --status Stable Unstable    # Filter by spreadsheet status
    python scripts/install_apworlds.py --no-status-filter          # Disable status filtering (show all)
"""

import argparse
import json
import sys
import os
from pathlib import Path

# Add the root directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
MAPPING_FILE = DATA_DIR / "apworld-spreadsheet-mapping.json"
DOWNLOAD_URLS_FILE = DATA_DIR / "apworld-download-urls.json"

# Status values considered "working" by default
DEFAULT_STATUSES = ["Stable"]

# All valid status values from the spreadsheet
VALID_STATUSES = [
    "Stable",
    "Unstable",
    "In Review",
    "Merged",
    "APWorld Only",
    "Broken on Main"
]


def load_mapping():
    """Load the spreadsheet-to-apworld mapping file."""
    if not MAPPING_FILE.exists():
        return None
    with open(MAPPING_FILE) as f:
        return json.load(f)


def get_apworld_ids_by_status(mapping, statuses):
    """Get set of apworld IDs matching given statuses."""
    if mapping is None:
        return None
    result = set()
    for game_name, info in mapping.get("matched", {}).items():
        if info["status"] in statuses:
            result.add(info["apworld_id"].lower())
    return result

def install_world_silent(world, repositories):
    """Install a world without showing a messagebox."""
    from worlds.LauncherComponents import _install_apworld

    path = repositories.download_remote_world(world["latest_version"])
    _install_apworld(path)


def save_download_urls(apworlds):
    """Save download URLs for all available apworlds to a JSON file.

    This allows other scripts (like test-all-ut-fuzz.py) to look up download
    URLs without needing to refresh repositories again.
    """
    from datetime import datetime, timezone

    urls = {}
    for world in apworlds:
        latest = world.get('latest_version')
        if latest and hasattr(latest, 'id') and hasattr(latest, 'download_url'):
            try:
                world_id = latest.id.lower()
                download_url = latest.download_url
                if download_url:
                    urls[world_id] = {
                        'download_url': download_url,
                        'title': world.get('title', ''),
                        'world_version': getattr(latest, 'world_version', ''),
                    }
            except Exception:
                # Skip if we can't get the download URL
                pass

    output = {
        'metadata': {
            'created': datetime.now(timezone.utc).isoformat(),
            'total_urls': len(urls),
        },
        'urls': urls
    }

    DOWNLOAD_URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DOWNLOAD_URLS_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Saved {len(urls)} download URLs to {DOWNLOAD_URLS_FILE}")


def main():
    parser = argparse.ArgumentParser(description="Bulk install APWorlds from remote repositories")
    parser.add_argument("--install-all", action="store_true", help="Install all available (non-installed) worlds matching status filter")
    parser.add_argument("--install", nargs="+", metavar="WORLD", help="Install specific worlds by ID (e.g., actraiser, zelda3)")
    parser.add_argument("--list", action="store_true", help="List all available worlds")
    parser.add_argument("--list-installed", action="store_true", help="List installed worlds")
    parser.add_argument("--include-after-dark", action="store_true", help="Include 'After Dark' (18+) worlds")
    parser.add_argument("--include-manuals", action="store_true", help="Include Manual worlds")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be installed without installing")
    parser.add_argument(
        "--status",
        nargs="+",
        default=DEFAULT_STATUSES,
        help=f"Filter by spreadsheet status. Valid: {', '.join(VALID_STATUSES)}, or 'all'. Default: {', '.join(DEFAULT_STATUSES)}"
    )
    parser.add_argument(
        "--no-status-filter",
        action="store_true",
        help="Disable status filtering (show/install all available worlds)"
    )
    args = parser.parse_args()

    # Handle status filtering
    if args.no_status_filter:
        status_filter = None
        statuses = []
    elif args.status == ["all"] or "all" in args.status:
        status_filter = None
        statuses = VALID_STATUSES
    else:
        # Validate statuses
        invalid = [s for s in args.status if s not in VALID_STATUSES]
        if invalid:
            print(f"Error: Invalid status values: {invalid}")
            print(f"Valid values: {', '.join(VALID_STATUSES)}, or 'all'")
            return 1
        statuses = args.status
        # Load mapping and get allowed IDs
        mapping = load_mapping()
        if mapping is None:
            print(f"Warning: Mapping file not found: {MAPPING_FILE}")
            print("Status filtering disabled. Use --no-status-filter to suppress this warning.")
            status_filter = None
        else:
            status_filter = get_apworld_ids_by_status(mapping, statuses)

    # Import after path setup
    from worlds.apworld_manager.world_manager import (
        repositories, refresh_apworld_table, SortStages
    )
    from worlds.apworld_manager import RepoWorld

    # Configure settings for what to show
    if args.include_after_dark:
        RepoWorld.settings.show_after_dark = True
    if args.include_manuals:
        RepoWorld.settings.show_manuals = True

    # Print status filter info
    if status_filter is not None:
        print(f"Status filter: {', '.join(statuses)} ({len(status_filter)} apworlds)")
    elif statuses:
        print(f"Status filter: {', '.join(statuses)} (no filtering)")
    else:
        print("Status filter: disabled")

    print("Loading repositories...")
    repositories.load_repos_from_settings()
    print("Refreshing world list...")
    repositories.refresh()

    apworlds = refresh_apworld_table()

    # Save download URLs for use by other scripts
    save_download_urls(apworlds)

    def matches_status_filter(world):
        """Check if a world matches the status filter."""
        if status_filter is None:
            return True
        latest = world.get('latest_version')
        if not latest:
            return False
        return latest.id.lower() in status_filter

    if args.list_installed:
        print("\n=== Installed APWorlds (custom_worlds/) ===")
        installed = [w for w in apworlds if w['installed']]
        for world in sorted(installed, key=lambda x: x['title'].lower()):
            version = world.get('installed_version', '?')
            print(f"  {world['title']} (v{version})")
        print(f"Total: {len(installed)} apworlds")

        # Also show bundled worlds
        from worlds import AutoWorld
        bundled = []
        for name, world in AutoWorld.AutoWorldRegister.world_types.items():
            if not world.zip_path:  # Unpacked = bundled
                bundled.append(name)
        print(f"\n=== Bundled Worlds (worlds/) ===")
        for name in sorted(bundled, key=str.lower):
            print(f"  {name}")
        print(f"Total: {len(bundled)} bundled")
        return

    if args.list or (not args.install_all and not args.install):
        print("\n=== Available Worlds (not installed) ===")
        available = [w for w in apworlds
                     if not w['installed']
                     and w['sort'] not in (SortStages.BUNDLED,)
                     and matches_status_filter(w)]
        filtered_out = 0
        if status_filter is not None:
            all_available = [w for w in apworlds if not w['installed'] and w['sort'] not in (SortStages.BUNDLED,)]
            filtered_out = len(all_available) - len(available)

        for world in sorted(available, key=lambda x: x['title'].lower()):
            latest = world.get('latest_version')
            version = latest.world_version if latest else '?'
            flags = []
            if world.get('after_dark'):
                flags.append("18+")
            if world['title'].lower().startswith('manual_'):
                flags.append("manual")
            flag_str = f" [{', '.join(flags)}]" if flags else ""
            # Get the world ID from latest_version
            world_id = latest.id if latest else "?"
            print(f"  {world_id}: {world['title']} (v{version}){flag_str}")
        print(f"\nTotal: {len(available)} available", end="")
        if filtered_out > 0:
            print(f" ({filtered_out} filtered out by status)")
        else:
            print()

        # Also show worlds with updates
        updates = [w for w in apworlds if w['installed'] and w['update_available']]
        if updates:
            print("\n=== Updates Available ===")
            for world in sorted(updates, key=lambda x: x['title'].lower()):
                latest = world.get('latest_version')
                old_ver = world.get('installed_version', '?')
                new_ver = latest.world_version if latest else '?'
                print(f"  {world['title']}: {old_ver} -> {new_ver}")
        return

    # Determine which worlds to install
    to_install = []

    if args.install_all:
        to_install = [w for w in apworlds
                      if not w['installed']
                      and w['latest_version'] is not None
                      and w['sort'] not in (SortStages.BUNDLED,)
                      and matches_status_filter(w)]
        # Filter out after_dark and manuals unless explicitly included
        if not args.include_after_dark:
            to_install = [w for w in to_install if not w.get('after_dark')]
        if not args.include_manuals:
            to_install = [w for w in to_install if not w['title'].lower().startswith('manual_')]

    elif args.install:
        requested = set(name.lower() for name in args.install)
        for world in apworlds:
            latest = world.get('latest_version')
            if latest and latest.id.lower() in requested:
                to_install.append(world)
                requested.discard(latest.id.lower())

        if requested:
            print(f"Warning: Could not find worlds: {', '.join(requested)}")

    if not to_install:
        print("No worlds to install.")
        return

    print(f"\n{'Would install' if args.dry_run else 'Installing'} {len(to_install)} worlds:\n")

    success = 0
    failed = []

    for i, world in enumerate(sorted(to_install, key=lambda x: x['title'].lower()), 1):
        latest = world['latest_version']
        print(f"[{i}/{len(to_install)}] {world['title']} (v{latest.world_version})...", end=" ", flush=True)

        if args.dry_run:
            print("(dry run)")
            success += 1
            continue

        try:
            install_world_silent(world, repositories)
            print("OK")
            success += 1
        except Exception as e:
            print(f"FAILED: {e}")
            failed.append((world['title'], str(e)))

    print(f"\nDone: {success} installed, {len(failed)} failed")

    if failed:
        print("\nFailed installations:")
        for name, error in failed:
            print(f"  {name}: {error}")


if __name__ == "__main__":
    main()
