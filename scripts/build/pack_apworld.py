#!/usr/bin/env python3
"""
Simple script to pack a world directory into an .apworld file.
Usage: python scripts/build/pack_apworld.py <world_name>
Example: python scripts/build/pack_apworld.py metamath
"""

import os
import sys
import zipfile
from pathlib import Path


def pack_apworld(world_name: str):
    """Pack a world directory into an .apworld file."""
    # Get the worlds directory (parent of scripts directory)
    project_root = Path(__file__).parent.parent
    worlds_dir = project_root / "worlds"
    world_dir = worlds_dir / world_name

    # Check if world directory exists
    if not world_dir.exists():
        print(f"Error: World directory '{world_dir}' not found.")
        return False

    # Create output directory if it doesn't exist
    output_dir = project_root / "apworlds"
    output_dir.mkdir(exist_ok=True)

    # Create the apworld file
    apworld_file = output_dir / f"{world_name}.apworld"

    print(f"Packing world '{world_name}' from {world_dir}")
    print(f"Creating {apworld_file}")

    try:
        with zipfile.ZipFile(apworld_file, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
            # Walk through all files in the world directory
            for path in world_dir.rglob("*"):
                if path.is_file():
                    # Skip __pycache__ directories and .pyc files
                    if "__pycache__" in path.parts or path.suffix == ".pyc":
                        continue
                    # Calculate relative path from world directory
                    relative_path = path.relative_to(worlds_dir)
                    zf.write(path, relative_path)
                    print(f"  Added: {relative_path}")

        print(f"\nSuccessfully created {apworld_file}")
        print(f"File size: {apworld_file.stat().st_size / 1024:.2f} KB")
        return True

    except Exception as e:
        print(f"Error creating apworld: {e}")
        return False


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    world_name = sys.argv[1]
    success = pack_apworld(world_name)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()