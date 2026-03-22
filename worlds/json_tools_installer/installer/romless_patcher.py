"""
ROM-less patches for world files.

Handles patching world __init__.py files to allow generation without ROM files.
Uses file replacement (not diff/patch) for cross-platform compatibility.

Also handles infrastructure files (settings.py, worlds/RomlessUtils.py) that
romless world patches depend on.
"""

import hashlib
import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from Utils import local_path

from ..config import (
    InstallerConfig, BackupInfo, add_backup_info, load_config, save_config
)


# Worlds that have ROM-less patches available
ROMLESS_WORLDS = [
    "alttp",
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

# Infrastructure files required by romless world patches.
# These are installed alongside the world patches.
# - settings.py: adds skip_required_files support
# - worlds/RomlessUtils.py: provides check_rom_available() helper
ROMLESS_INFRASTRUCTURE_FILES = [
    "settings.py",
    "worlds/RomlessUtils.py",
]


@dataclass
class RomlessPatchStatus:
    """Status of ROM-less patch for a single world."""
    world: str
    is_patched: bool
    has_backup: bool
    world_exists: bool
    backup_path: Optional[str] = None
    original_hash: Optional[str] = None
    current_hash: Optional[str] = None


@dataclass
class RomlessPatchResult:
    """Result of a ROM-less patch operation."""
    success: bool
    patched_worlds: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def get_file_hash(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def get_romless_patches_dir(version: str) -> Optional[Path]:
    """
    Get the path to downloaded ROM-less patches for a specific AP version.

    Args:
        version: AP version string (e.g., "0.6.5").

    Returns:
        Path to romless patches directory, or None if not found.
    """
    root = Path(local_path())

    # Look for downloaded patches in json_tools_patches directory
    patches_dir = root / "json_tools_patches" / version / "romless"
    if patches_dir.exists():
        return patches_dir

    # Try base version (without rc suffix)
    base_version = version.split("-")[0]
    patches_dir = root / "json_tools_patches" / base_version / "romless"
    if patches_dir.exists():
        return patches_dir

    return None


def load_romless_manifest(patches_dir: Path) -> Optional[Dict]:
    """Load the ROM-less patches manifest."""
    manifest_path = patches_dir / "manifest.json"
    if not manifest_path.exists():
        return None

    with open(manifest_path, "r") as f:
        return json.load(f)


def _is_romless_backup(backup: BackupInfo) -> bool:
    """Check if a backup entry belongs to romless patches (world or infrastructure)."""
    return (
        backup.path.startswith("romless:")
        or (backup.path.startswith("worlds/") and backup.path.endswith("/__init__.py"))
    )


def check_romless_patch_status(
    config: Optional[InstallerConfig] = None,
    version: str = "0.6.7"
) -> Dict[str, RomlessPatchStatus]:
    """
    Check the current ROM-less patch status of all supported worlds.

    Args:
        config: Installer configuration (loaded if not provided).
        version: AP version string.

    Returns:
        Dictionary mapping world name to RomlessPatchStatus.
    """
    if config is None:
        config = load_config()

    root = Path(local_path())
    status = {}

    # Load manifest
    patches_dir = get_romless_patches_dir(version)
    manifest = load_romless_manifest(patches_dir) if patches_dir else None

    # Build backup lookup (for romless patches specifically)
    backup_lookup = {}
    for b in config.patches.backups:
        if b.path.startswith("worlds/") and b.path.endswith("/__init__.py"):
            # Extract world name from path like "worlds/alttp/__init__.py"
            parts = b.path.split("/")
            if len(parts) >= 2:
                world = parts[1]
                backup_lookup[world] = b

    for world in ROMLESS_WORLDS:
        world_init = root / "worlds" / world / "__init__.py"
        backup_info = backup_lookup.get(world)

        if not world_init.exists():
            status[world] = RomlessPatchStatus(
                world=world,
                is_patched=False,
                has_backup=False,
                world_exists=False,
            )
            continue

        current_hash = get_file_hash(world_init)

        # Check if patched by comparing to manifest
        is_patched = False
        manifest_key = f"worlds/{world}/__init__.py"
        if manifest and manifest_key in manifest.get("files", {}):
            patched_hash = manifest["files"][manifest_key].get("patched_sha256")
            original_hash = manifest["files"][manifest_key].get("original_sha256")
            if patched_hash and current_hash == patched_hash:
                is_patched = True
            elif original_hash and current_hash == original_hash:
                is_patched = False
            elif backup_info:
                # If we have a backup, check if current differs from original
                is_patched = current_hash != backup_info.original_hash

        status[world] = RomlessPatchStatus(
            world=world,
            is_patched=is_patched,
            has_backup=backup_info is not None and Path(backup_info.backup_path).exists(),
            world_exists=True,
            backup_path=backup_info.backup_path if backup_info else None,
            original_hash=backup_info.original_hash if backup_info else None,
            current_hash=current_hash,
        )

    # Check infrastructure files
    infra_backup_lookup = {
        b.path: b for b in config.patches.backups
        if b.path.startswith("romless:")
    }

    for infra_file in ROMLESS_INFRASTRUCTURE_FILES:
        target_path = root / infra_file
        backup_key = f"romless:{infra_file}"
        backup_info = infra_backup_lookup.get(backup_key)

        if not target_path.exists():
            status[f"infra:{infra_file}"] = RomlessPatchStatus(
                world=infra_file,
                is_patched=False,
                has_backup=False,
                world_exists=False,
            )
            continue

        current_hash = get_file_hash(target_path)

        is_patched = False
        if manifest and infra_file in manifest.get("infrastructure_files", {}):
            patched_hash = manifest["infrastructure_files"][infra_file].get("patched_sha256")
            if patched_hash and current_hash == patched_hash:
                is_patched = True

        status[f"infra:{infra_file}"] = RomlessPatchStatus(
            world=infra_file,
            is_patched=is_patched,
            has_backup=backup_info is not None and Path(backup_info.backup_path).exists(),
            world_exists=True,
            backup_path=backup_info.backup_path if backup_info else None,
            original_hash=backup_info.original_hash if backup_info else None,
            current_hash=current_hash,
        )

    return status


def backup_world_file(world: str, filepath: Path, config: InstallerConfig) -> Optional[str]:
    """
    Create a backup of a world's __init__.py file.

    Args:
        world: World name (e.g., "alttp").
        filepath: Path to the file to backup.
        config: Installer configuration.

    Returns:
        Path to the backup file, or None if failed.
    """
    if not filepath.exists():
        return None

    # Calculate original hash
    original_hash = get_file_hash(filepath)

    # Determine backup path
    backup_dir = Path(local_path()) / "json_tools_backups" / "romless"
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Use timestamp to allow multiple backups
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"{world}__init__.py.{timestamp}.backup"

    # Check if we already have a backup with the same hash
    backup_key = f"worlds/{world}/__init__.py"
    for existing_backup in config.patches.backups:
        if existing_backup.path == backup_key:
            if existing_backup.original_hash == original_hash:
                # Same file, no need to backup again
                return existing_backup.backup_path

    # Create backup
    shutil.copy2(filepath, backup_path)

    # Record in config
    add_backup_info(
        config,
        path=backup_key,
        original_hash=original_hash,
        backup_path=str(backup_path),
    )

    return str(backup_path)


def _backup_infrastructure_file(
    infra_file: str,
    filepath: Path,
    config: InstallerConfig,
) -> Optional[str]:
    """
    Create a backup of an infrastructure file (e.g. settings.py).

    For new files (like worlds/RomlessUtils.py), no backup is created
    but the key is still registered so revert knows to delete it.

    Returns:
        Backup path string, or "NEW_FILE" for files that didn't exist before.
    """
    backup_key = f"romless:{infra_file}"

    # Check if we already have a backup registered
    for existing_backup in config.patches.backups:
        if existing_backup.path == backup_key:
            return existing_backup.backup_path

    if not filepath.exists():
        # New file — register as a "new file" backup so revert knows to delete it
        add_backup_info(
            config,
            path=backup_key,
            original_hash="NEW_FILE",
            backup_path="NEW_FILE",
        )
        return "NEW_FILE"

    # Existing file — create a real backup
    original_hash = get_file_hash(filepath)

    backup_dir = Path(local_path()) / "json_tools_backups" / "romless"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = infra_file.replace("/", "_").replace("\\", "_")
    backup_path = backup_dir / f"{safe_name}.{timestamp}.backup"

    shutil.copy2(filepath, backup_path)

    add_backup_info(
        config,
        path=backup_key,
        original_hash=original_hash,
        backup_path=str(backup_path),
    )

    return str(backup_path)


def apply_romless_patches(
    config: Optional[InstallerConfig] = None,
    version: str = "0.6.7",
    force: bool = False,
) -> RomlessPatchResult:
    """
    Apply ROM-less patches to world files and install infrastructure files.

    This replaces world __init__.py files with patched versions that
    skip ROM validation when skip_required_files is set.  It also
    installs settings.py (with skip_required_files support) and
    worlds/RomlessUtils.py (check_rom_available helper).

    Args:
        config: Installer configuration.
        version: AP version string.
        force: If True, overwrite even if already patched.

    Returns:
        RomlessPatchResult with status information.
    """
    if config is None:
        config = load_config()

    result = RomlessPatchResult(success=True)
    root = Path(local_path())

    # Find downloaded patches for this version
    patches_dir = get_romless_patches_dir(version)
    if patches_dir is None:
        result.success = False
        result.errors.append(
            f"ROM-less patches not found for AP version {version}. "
            f"Install the 'ROM-less Generation Patches' component first."
        )
        return result

    # Load manifest
    manifest = load_romless_manifest(patches_dir)
    if manifest is None:
        result.success = False
        result.errors.append(f"Manifest not found in {patches_dir}")
        return result

    # Get current status
    current_status = check_romless_patch_status(config, version)

    # Apply patches to each world
    for world in ROMLESS_WORLDS:
        patch_file = patches_dir / world / "__init__.py"
        if not patch_file.exists():
            result.warnings.append(f"Patch file not found for {world}")
            continue

        target_path = root / "worlds" / world / "__init__.py"

        # Check if world exists
        if not target_path.exists():
            result.warnings.append(f"World {world} not found, skipping")
            continue

        # Check current status
        world_status = current_status.get(world)
        if world_status and world_status.is_patched and not force:
            result.warnings.append(f"{world} already patched, skipping")
            continue

        # Backup original
        backup_path = backup_world_file(world, target_path, config)
        if backup_path:
            result.patched_worlds.append(f"{world} (backed up)")
        else:
            result.warnings.append(f"Could not backup {world}")

        try:
            # Copy patched file
            shutil.copy2(patch_file, target_path)
            if world not in [w.split(" ")[0] for w in result.patched_worlds]:
                result.patched_worlds.append(world)
        except Exception as e:
            result.errors.append(f"Failed to apply patch for {world}: {e}")
            result.success = False

    # Apply infrastructure files
    for infra_file in ROMLESS_INFRASTRUCTURE_FILES:
        patch_file = patches_dir / infra_file
        if not patch_file.exists():
            result.warnings.append(f"Infrastructure file not found: {infra_file}")
            continue

        target_path = root / infra_file

        # Check if already patched
        infra_status = current_status.get(f"infra:{infra_file}")
        if infra_status and infra_status.is_patched and not force:
            result.warnings.append(f"{infra_file} already patched, skipping")
            continue

        # Backup original (or register as new file)
        _backup_infrastructure_file(infra_file, target_path, config)

        try:
            # Ensure parent directory exists
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(patch_file, target_path)
            result.patched_worlds.append(infra_file)
        except Exception as e:
            result.errors.append(f"Failed to install {infra_file}: {e}")
            result.success = False

    # Update config
    if result.success and result.patched_worlds:
        config.patches.romless_applied = True
        config.patches.romless_applied_at = datetime.now().isoformat()
        save_config(config)

    return result


def revert_romless_patches(
    config: Optional[InstallerConfig] = None
) -> RomlessPatchResult:
    """
    Revert ROM-less patches by restoring from backups.

    World patches are restored from backup copies.  Infrastructure files
    that were new (worlds/RomlessUtils.py) are deleted.  Infrastructure
    files that had originals (settings.py) are restored from backup.

    Args:
        config: Installer configuration.

    Returns:
        RomlessPatchResult with status information.
    """
    if config is None:
        config = load_config()

    result = RomlessPatchResult(success=True)
    root = Path(local_path())

    # Find all romless backups (world patches + infrastructure)
    romless_backups = [
        b for b in config.patches.backups
        if _is_romless_backup(b)
    ]

    if not romless_backups:
        result.warnings.append("No ROM-less backups found, nothing to revert")
        return result

    for backup_info in romless_backups:
        if backup_info.path.startswith("romless:"):
            # Infrastructure file
            infra_file = backup_info.path[len("romless:"):]
            target_path = root / infra_file

            if backup_info.original_hash == "NEW_FILE":
                # This file didn't exist before — delete it
                if target_path.exists():
                    try:
                        target_path.unlink()
                        result.patched_worlds.append(f"Deleted {infra_file}")
                    except Exception as e:
                        result.errors.append(f"Failed to delete {infra_file}: {e}")
                        result.success = False
                else:
                    result.patched_worlds.append(f"Already gone: {infra_file}")
            else:
                # Restore from backup
                backup_path = Path(backup_info.backup_path)
                if not backup_path.exists():
                    result.errors.append(f"Backup not found: {backup_path}")
                    result.success = False
                    continue

                try:
                    shutil.copy2(backup_path, target_path)
                    result.patched_worlds.append(f"Restored {infra_file}")
                except Exception as e:
                    result.errors.append(f"Failed to restore {infra_file}: {e}")
                    result.success = False
        else:
            # World patch — restore from backup
            backup_path = Path(backup_info.backup_path)
            target_path = root / backup_info.path

            if not backup_path.exists():
                result.errors.append(f"Backup not found: {backup_path}")
                result.success = False
                continue

            try:
                # Restore from backup
                shutil.copy2(backup_path, target_path)
                # Extract world name for reporting
                parts = backup_info.path.split("/")
                world = parts[1] if len(parts) >= 2 else backup_info.path
                result.patched_worlds.append(f"Restored {world}")
            except Exception as e:
                result.errors.append(f"Failed to restore {backup_info.path}: {e}")
                result.success = False

    # Clear romless backup info from config
    if result.success:
        config.patches.backups = [
            b for b in config.patches.backups
            if not _is_romless_backup(b)
        ]
        config.patches.romless_applied = False
        config.patches.romless_applied_at = None
        save_config(config)

    return result


def get_romless_patch_summary(
    config: Optional[InstallerConfig] = None,
    version: str = "0.6.7"
) -> Dict:
    """
    Get a summary of the current ROM-less patch state.

    Returns:
        Dictionary with ROM-less patch summary information.
    """
    if config is None:
        config = load_config()

    status = check_romless_patch_status(config, version)

    # Separate world status from infrastructure status
    world_status = {k: v for k, v in status.items() if not k.startswith("infra:")}
    infra_status = {k: v for k, v in status.items() if k.startswith("infra:")}

    patched_count = sum(1 for s in world_status.values() if s.is_patched)
    backup_count = sum(1 for s in world_status.values() if s.has_backup)
    available_count = sum(1 for s in world_status.values() if s.world_exists)
    infra_patched = sum(1 for s in infra_status.values() if s.is_patched)

    return {
        "total_worlds": len(ROMLESS_WORLDS),
        "available_worlds": available_count,
        "patched_count": patched_count,
        "backup_count": backup_count,
        "all_patched": patched_count == available_count and available_count > 0,
        "can_revert": backup_count > 0 or any(
            b.path.startswith("romless:") for b in config.patches.backups
        ),
        "applied": getattr(config.patches, 'romless_applied', False),
        "applied_at": getattr(config.patches, 'romless_applied_at', None),
        "infrastructure_files": len(ROMLESS_INFRASTRUCTURE_FILES),
        "infrastructure_patched": infra_patched,
        "worlds": world_status,
        "infrastructure": infra_status,
    }
