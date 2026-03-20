#!/usr/bin/env python3
"""
Apply ROM-less generation patches to world files.

This script applies patches to world __init__.py files to allow generation
without ROM files. This is useful for testing and development purposes.

The patches modify worlds to check settings.skip_required_files before
raising errors about missing ROM files.

Usage:
    python scripts/setup/apply_romless_patches.py [--dry-run] [--revert]
"""

import argparse
import subprocess
import sys
from pathlib import Path


# Worlds that have ROM-less patches available
PATCHABLE_WORLDS = [
    "alttp",
    "apsudoku",
    "dkc3",
    "ff1",
    "lufia2ac",
    "mmbn3",
    "oot",
    "smw",
    "soe",
    "tloz",
    "yoshisisland",
]

# Path to the diff file relative to repo root
DIFF_FILE = "docs/json/developer/diffs/world-init-files.diff"


def get_repo_root() -> Path:
    """Get the repository root directory."""
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "worlds").exists() and (parent / "BaseClasses.py").exists():
            return parent
    raise RuntimeError("Could not find repository root")


def check_patch_available() -> bool:
    """Check if the patch command is available."""
    try:
        result = subprocess.run(
            ["patch", "--version"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def check_diff_file_exists(repo_root: Path) -> bool:
    """Check if the diff file exists."""
    return (repo_root / DIFF_FILE).exists()


def check_worlds_exist(repo_root: Path) -> dict:
    """Check which patchable worlds exist."""
    status = {}
    for world in PATCHABLE_WORLDS:
        world_path = repo_root / "worlds" / world / "__init__.py"
        status[world] = world_path.exists()
    return status


def is_already_patched(repo_root: Path, world: str) -> bool:
    """Check if a world appears to already be patched."""
    init_file = repo_root / "worlds" / world / "__init__.py"
    if not init_file.exists():
        return False
    content = init_file.read_text()
    # Check for the skip_required_files pattern
    return "skip_required_files" in content


def apply_patches(repo_root: Path, dry_run: bool = False) -> bool:
    """Apply the ROM-less patches."""
    diff_file = repo_root / DIFF_FILE

    if not diff_file.exists():
        print(f"[ERROR] Diff file not found: {diff_file}")
        print("       Make sure to install the romless_patches component first.")
        return False

    # Check which worlds need patching
    worlds_status = check_worlds_exist(repo_root)
    already_patched = []
    to_patch = []
    missing = []

    for world, exists in worlds_status.items():
        if not exists:
            missing.append(world)
        elif is_already_patched(repo_root, world):
            already_patched.append(world)
        else:
            to_patch.append(world)

    print(f"\nROM-less Patch Status:")
    print(f"  Already patched: {len(already_patched)}")
    print(f"  To be patched:   {len(to_patch)}")
    print(f"  Missing worlds:  {len(missing)}")

    if already_patched:
        print(f"\n  Already patched: {', '.join(already_patched)}")
    if to_patch:
        print(f"  To patch: {', '.join(to_patch)}")
    if missing:
        print(f"  Missing: {', '.join(missing)}")

    if not to_patch:
        print("\n[OK] All available worlds are already patched.")
        return True

    if dry_run:
        print(f"\n[DRY RUN] Would apply patches to: {', '.join(to_patch)}")
        return True

    # Apply the patch
    print(f"\nApplying patches...")

    result = subprocess.run(
        ["patch", "-p1", "--dry-run", "-i", str(diff_file)],
        cwd=repo_root,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"[ERROR] Patch dry-run failed:")
        print(result.stderr)
        print("\nThe patch may not apply cleanly. Check if files have been modified.")
        return False

    # Actually apply the patch
    result = subprocess.run(
        ["patch", "-p1", "-i", str(diff_file)],
        cwd=repo_root,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"[ERROR] Patch application failed:")
        print(result.stderr)
        return False

    print(f"[OK] Patches applied successfully!")
    print(result.stdout)
    return True


def revert_patches(repo_root: Path, dry_run: bool = False) -> bool:
    """Revert the ROM-less patches."""
    diff_file = repo_root / DIFF_FILE

    if not diff_file.exists():
        print(f"[ERROR] Diff file not found: {diff_file}")
        return False

    # Check which worlds are patched
    patched = [w for w in PATCHABLE_WORLDS if is_already_patched(repo_root, w)]

    if not patched:
        print("[OK] No patched worlds found.")
        return True

    print(f"\nPatched worlds to revert: {', '.join(patched)}")

    if dry_run:
        print(f"[DRY RUN] Would revert patches for: {', '.join(patched)}")
        return True

    # Revert the patch
    print(f"\nReverting patches...")

    result = subprocess.run(
        ["patch", "-p1", "-R", "-i", str(diff_file)],
        cwd=repo_root,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"[ERROR] Patch revert failed:")
        print(result.stderr)
        return False

    print(f"[OK] Patches reverted successfully!")
    print(result.stdout)
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Apply or revert ROM-less generation patches"
    )
    parser.add_argument(
        "--dry-run", "-n",
        action="store_true",
        help="Show what would be done without making changes"
    )
    parser.add_argument(
        "--revert", "-r",
        action="store_true",
        help="Revert the patches instead of applying them"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check patch status, don't apply anything"
    )

    args = parser.parse_args()

    # Check prerequisites
    if not check_patch_available():
        print("[ERROR] 'patch' command not found. Please install patch utility.")
        print("  On Ubuntu/Debian: sudo apt install patch")
        print("  On macOS: brew install gpatch")
        print("  On Windows: Install Git Bash or WSL")
        return 1

    try:
        repo_root = get_repo_root()
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        return 1

    print(f"Repository root: {repo_root}")

    if not check_diff_file_exists(repo_root):
        print(f"\n[ERROR] Diff file not found at: {repo_root / DIFF_FILE}")
        print("Make sure the romless_patches component is installed.")
        print("Run: python -m worlds.json_tools_installer install --romless-patches")
        return 1

    if args.check:
        worlds_status = check_worlds_exist(repo_root)
        print("\nWorld patch status:")
        for world, exists in sorted(worlds_status.items()):
            if not exists:
                status = "NOT FOUND"
            elif is_already_patched(repo_root, world):
                status = "PATCHED"
            else:
                status = "NOT PATCHED"
            print(f"  {world}: {status}")
        return 0

    if args.revert:
        success = revert_patches(repo_root, args.dry_run)
    else:
        success = apply_patches(repo_root, args.dry_run)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
