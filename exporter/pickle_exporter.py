"""
Pickle-based multiworld exporter for Universal Tracker.

This module exports the multiworld object as a gzip-compressed dill pickle,
which preserves lambdas and functions used in access rules. This allows the
tracker to load the multiworld directly without needing to run the world
generator.
"""

import gzip
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any, Dict, Optional, TYPE_CHECKING

import dill

import Utils

if TYPE_CHECKING:
    from BaseClasses import MultiWorld

logger = logging.getLogger(__name__)

# File extension for pickle exports
PICKLE_EXTENSION = ".pkl.gz"

# Metadata file extension (JSON sidecar with info for discovery)
METADATA_EXTENSION = "_pickle_meta.json"


def export_multiworld_pickle(
    multiworld: "MultiWorld",
    output_dir: str,
    filename_base: str,
    save_presets: bool = False,
    skip_preset_copy_if_rules_identical: bool = False,
) -> Dict[str, str]:
    """
    Export the multiworld as a gzip-compressed dill pickle for tracker use.

    Args:
        multiworld: MultiWorld instance to export
        output_dir: Directory to write output files
        filename_base: Base name for output files (e.g., "AP_14089154938208861744")
        save_presets: Whether to save copies to the presets directory
        skip_preset_copy_if_rules_identical: If True, skip copying if files are identical

    Returns:
        Dict containing paths to generated files:
        - 'pickle': Path to the pickle file
        - 'metadata': Path to the metadata JSON file
        - 'preset_pickle': Path to preset copy (if save_presets=True)
        - 'preset_metadata': Path to preset metadata copy (if save_presets=True)
    """
    # Determine whether to export pickle based on settings mode.
    from worlds.json_tools_installer.json_tools_settings import get_json_tools_settings
    jt = get_json_tools_settings()

    if jt.use_tracking_mode_config:
        # New config-based logic: use tracking-mode-config.json
        from .exporter import _should_export_pickle_from_config
        if len(multiworld.worlds) == 1:  # Only 1 player in the multiworld
            world = list(multiworld.worlds.values())[0]
            if not _should_export_pickle_from_config(world.game):
                logger.info(f"Skipping pickle export for {world.game} (config-based: first passing mode is not 'pickle')")
                return {}
    else:
        # Legacy flag-based logic
        if not jt.save_tracker_pickle:
            # save_tracker_pickle is False - don't export
            return {}

    os.makedirs(output_dir, exist_ok=True)

    result_paths = {}

    # Generate filenames
    pickle_filename = f"{filename_base}{PICKLE_EXTENSION}"
    metadata_filename = f"{filename_base}{METADATA_EXTENSION}"
    pickle_path = os.path.join(output_dir, pickle_filename)
    metadata_path = os.path.join(output_dir, metadata_filename)

    # Collect metadata for discovery
    metadata = _collect_metadata(multiworld)

    # Export the multiworld with dill and gzip compression
    logger.info(f"Exporting multiworld pickle to {pickle_path}")
    try:
        _export_pickle(multiworld, pickle_path)
        result_paths['pickle'] = pickle_path
        logger.info(f"Successfully exported multiworld pickle ({_get_file_size_str(pickle_path)})")
    except Exception as e:
        logger.error(f"Failed to export multiworld pickle: {e}")
        raise

    # Write metadata JSON
    try:
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
        result_paths['metadata'] = metadata_path
        logger.debug(f"Wrote metadata to {metadata_path}")
    except Exception as e:
        logger.error(f"Failed to write metadata: {e}")
        # Don't raise - metadata is optional

    # Copy to presets directory if requested
    if save_presets:
        preset_paths = _save_to_presets(
            multiworld,
            pickle_path,
            metadata_path,
            filename_base,
            skip_preset_copy_if_rules_identical,
        )
        result_paths.update(preset_paths)

    return result_paths


def _export_pickle(multiworld: "MultiWorld", path: str) -> None:
    """
    Export the multiworld to a gzip-compressed dill pickle file.

    Args:
        multiworld: MultiWorld instance to export
        path: Path to write the pickle file
    """
    import sys

    # Prepare multiworld for pickling by replacing unpicklable objects
    _prepare_multiworld_for_pickle(multiworld)

    # Increase recursion limit for complex worlds (e.g., ALttP has deep nested structures)
    # Save original limit and restore after pickling
    original_limit = sys.getrecursionlimit()
    try:
        # Set a higher limit for pickling - 10000 should handle most complex worlds
        sys.setrecursionlimit(max(original_limit, 10000))

        # Use dill to handle lambdas and closures in access rules
        # Use gzip for compression (multiworlds can be large)
        with gzip.open(path, 'wb', compresslevel=6) as f:
            dill.dump(multiworld, f, protocol=dill.HIGHEST_PROTOCOL)
    finally:
        # Always restore the original recursion limit
        sys.setrecursionlimit(original_limit)


def _prepare_multiworld_for_pickle(multiworld: "MultiWorld") -> None:
    """
    Prepare a multiworld for pickling by replacing unpicklable objects.

    The main issue is ThreadBarrierProxy which wraps multiworld.random.
    Its custom __getattr__ causes recursion during unpickling.

    Args:
        multiworld: MultiWorld instance to prepare
    """
    from BaseClasses import ThreadBarrierProxy
    import random

    # Replace ThreadBarrierProxy with the underlying random object
    if hasattr(multiworld, 'random') and isinstance(multiworld.random, ThreadBarrierProxy):
        # Get the underlying random.Random object
        underlying_random = multiworld.random.obj
        # Replace the proxy with the plain random object
        multiworld.random = underlying_random  # type: ignore[attr-defined]
        logger.debug("Replaced ThreadBarrierProxy with underlying random.Random for pickling")

    # Clear the spoiler object which contains references that may not pickle well
    # The spoiler is only needed for output generation, not for tracking
    if hasattr(multiworld, 'spoiler'):
        multiworld.spoiler = None  # type: ignore[attr-defined]
        logger.debug("Cleared spoiler object for pickling")


def _collect_metadata(multiworld: "MultiWorld") -> Dict[str, Any]:
    """
    Collect metadata about the multiworld for discovery and validation.

    Args:
        multiworld: MultiWorld instance

    Returns:
        Dict containing metadata fields
    """
    metadata = {
        'schema_version': 1,
        'archipelago_version': Utils.__version__,
        'generation_seed': multiworld.seed,
        'seed_name': multiworld.seed_name,
        'players': {},
    }

    # Collect per-player info
    for player_id in multiworld.player_ids:
        world = multiworld.worlds.get(player_id)
        if world:
            player_name = multiworld.player_name.get(player_id, f"Player{player_id}")
            metadata['players'][str(player_id)] = {
                'name': player_name,
                'game': world.game,
            }

            # Get world directory for preset path calculation
            try:
                module_path = type(world).__module__
                parts = module_path.split('.')
                if len(parts) >= 2 and parts[0] == 'worlds':
                    metadata['players'][str(player_id)]['world_directory'] = parts[1]
            except Exception:
                pass

    return metadata


def _save_to_presets(
    multiworld: "MultiWorld",
    pickle_path: str,
    metadata_path: str,
    filename_base: str,
    skip_if_identical: bool,
) -> Dict[str, str]:
    """
    Save copies of the pickle and metadata to the frontend presets directory.

    Args:
        multiworld: MultiWorld instance (for getting game info)
        pickle_path: Path to the source pickle file
        metadata_path: Path to the source metadata file
        filename_base: Base name for files
        skip_if_identical: Whether to skip if files are identical

    Returns:
        Dict with preset paths
    """
    result = {}

    # Get the game directory for the first player (single-player case)
    # For multiworld, we'd need more complex handling
    game_directory = None
    for player_id in multiworld.player_ids:
        world = multiworld.worlds.get(player_id)
        if world:
            try:
                module_path = type(world).__module__
                parts = module_path.split('.')
                if len(parts) >= 2 and parts[0] == 'worlds':
                    game_directory = parts[1]
                    break
            except Exception:
                pass

    if not game_directory:
        logger.warning("Could not determine game directory for preset save")
        return result

    # Build preset directory path
    # Pattern: frontend/presets/{game_directory}/AP_{seed_name}/
    preset_dir = os.path.join(
        'frontend', 'presets', game_directory, filename_base
    )
    os.makedirs(preset_dir, exist_ok=True)

    # Copy pickle file
    preset_pickle_path = os.path.join(preset_dir, os.path.basename(pickle_path))
    if _should_copy_file(pickle_path, preset_pickle_path, skip_if_identical):
        shutil.copy2(pickle_path, preset_pickle_path)
        result['preset_pickle'] = preset_pickle_path
        logger.debug(f"Copied pickle to preset: {preset_pickle_path}")
    else:
        logger.debug(f"Skipped preset copy (identical): {preset_pickle_path}")
        result['preset_pickle'] = preset_pickle_path

    # Copy metadata file
    if os.path.exists(metadata_path):
        preset_metadata_path = os.path.join(preset_dir, os.path.basename(metadata_path))
        if _should_copy_file(metadata_path, preset_metadata_path, skip_if_identical):
            shutil.copy2(metadata_path, preset_metadata_path)
            result['preset_metadata'] = preset_metadata_path
            logger.debug(f"Copied metadata to preset: {preset_metadata_path}")
        else:
            result['preset_metadata'] = preset_metadata_path

    return result


def _should_copy_file(src: str, dst: str, skip_if_identical: bool) -> bool:
    """
    Determine whether to copy a file based on identity check.

    Args:
        src: Source file path
        dst: Destination file path
        skip_if_identical: Whether to skip if files are identical

    Returns:
        True if file should be copied
    """
    if not skip_if_identical:
        return True

    if not os.path.exists(dst):
        return True

    # Compare file sizes first (fast check)
    src_size = os.path.getsize(src)
    dst_size = os.path.getsize(dst)
    if src_size != dst_size:
        return True

    # For identical sizes, compare contents
    # Read in chunks to handle large files
    chunk_size = 65536
    with open(src, 'rb') as f1, open(dst, 'rb') as f2:
        while True:
            chunk1 = f1.read(chunk_size)
            chunk2 = f2.read(chunk_size)
            if chunk1 != chunk2:
                return True
            if not chunk1:
                break

    return False


def _get_file_size_str(path: str) -> str:
    """Get a human-readable file size string."""
    size = os.path.getsize(path)
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


def load_multiworld_pickle(path: str) -> "MultiWorld":
    """
    Load a multiworld from a gzip-compressed dill pickle file.

    Args:
        path: Path to the pickle file

    Returns:
        Restored MultiWorld instance

    Raises:
        FileNotFoundError: If pickle file doesn't exist
        Exception: If deserialization fails
    """
    if not os.path.exists(path):
        raise FileNotFoundError(f"Pickle file not found: {path}")

    logger.info(f"Loading multiworld from pickle: {path}")

    with gzip.open(path, 'rb') as f:
        multiworld = dill.load(f)

    logger.info(f"Successfully loaded multiworld from pickle")
    return multiworld


def load_pickle_metadata(path: str) -> Optional[Dict[str, Any]]:
    """
    Load metadata from a pickle metadata JSON file.

    Args:
        path: Path to the metadata JSON file

    Returns:
        Metadata dict, or None if file doesn't exist
    """
    if not os.path.exists(path):
        return None

    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def find_pickle_for_seed(seed_name: str, game_directory: Optional[str] = None) -> Optional[str]:
    """
    Find a pickle file for a given seed name.

    Args:
        seed_name: The seed name (e.g., "14089154938208861744" or "AP_14089154938208861744")
        game_directory: Optional game directory to search in

    Returns:
        Path to the pickle file, or None if not found
    """
    # Normalize seed name
    if not seed_name.startswith('AP_'):
        seed_name = f'AP_{seed_name}'

    presets_dir = Path('frontend/presets')
    if not presets_dir.exists():
        return None

    # Build the expected filename
    pickle_filename = f"{seed_name}{PICKLE_EXTENSION}"

    if game_directory:
        # Search in specific game directory
        search_dirs = [presets_dir / game_directory]
    else:
        # Search all game directories
        search_dirs = [d for d in presets_dir.iterdir() if d.is_dir()]

    for game_dir in search_dirs:
        seed_dir = game_dir / seed_name
        if seed_dir.exists():
            pickle_path = seed_dir / pickle_filename
            if pickle_path.exists():
                return str(pickle_path)

    return None
