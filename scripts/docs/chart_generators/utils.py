"""
Utility functions for chart generation.
"""

import os


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format (KB with one decimal)."""
    if size_bytes == 0:
        return "✅"
    kb = size_bytes / 1024
    return f"{kb:.1f}KB"


def get_rules_json_size(project_root: str, world_directory: str) -> int:
    """
    Get the size of the rules.json file for seed 1 for a given game.

    Args:
        project_root: Path to the project root directory
        world_directory: The preset directory name for the game (e.g., 'alttp', 'hk')

    Returns:
        File size in bytes, or 0 if file doesn't exist
    """
    # Seed 1 always produces this seed ID
    seed_id = "14089154938208861744"
    rules_path = os.path.join(
        project_root,
        'frontend', 'presets', world_directory,
        f'AP_{seed_id}', f'AP_{seed_id}_rules.json'
    )
    try:
        return os.path.getsize(rules_path)
    except (OSError, FileNotFoundError):
        return 0
