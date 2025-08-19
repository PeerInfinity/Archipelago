#!/usr/bin/env python3
"""
Script to build a mapping between template game names and their corresponding
world directory names by scanning the worlds directory for game class variables.
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, Optional


def extract_game_name_from_world(world_init_path: str) -> Optional[str]:
    """
    Extract the game name from a world's __init__.py file.
    Returns None if no game name is found.
    """
    try:
        with open(world_init_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Look for pattern: game: ClassVar[str] = "Game Name"
        pattern = r'game:\s*ClassVar\[str\]\s*=\s*["\']([^"\']+)["\']'
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
        
        # Fallback: look for simpler pattern: game = "Game Name"
        pattern = r'game\s*=\s*["\']([^"\']+)["\']'
        match = re.search(pattern, content)
        
        if match:
            return match.group(1)
            
        return None
    except (IOError, UnicodeDecodeError):
        return None


def build_world_mapping(worlds_dir: str) -> Dict[str, Dict[str, any]]:
    """
    Build a mapping from game names to world information.
    Returns dict with game names as keys and world info as values.
    """
    mapping = {}
    
    worlds_path = Path(worlds_dir)
    if not worlds_path.exists():
        print(f"Error: Worlds directory not found: {worlds_dir}")
        return mapping
    
    for world_dir in worlds_path.iterdir():
        if not world_dir.is_dir() or world_dir.name.startswith('.') or world_dir.name.startswith('_'):
            continue
            
        init_file = world_dir / '__init__.py'
        if not init_file.exists():
            continue
            
        game_name = extract_game_name_from_world(str(init_file))
        if game_name:
            world_name = world_dir.name
            
            # Check for custom exporter
            exporter_path = Path('exporter/games') / f'{world_name}.py'
            has_custom_exporter = exporter_path.exists()
            
            # Check for custom gameLogic
            game_logic_path = Path('frontend/modules/shared/gameLogic') / world_name / f'{world_name}Logic.js'
            has_custom_game_logic = game_logic_path.exists()
            
            mapping[game_name] = {
                'world_directory': world_name,
                'has_custom_exporter': has_custom_exporter,
                'has_custom_game_logic': has_custom_game_logic,
                'exporter_path': f'exporter/games/{world_name}.py' if has_custom_exporter else None,
                'game_logic_path': f'frontend/modules/shared/gameLogic/{world_name}/{world_name}Logic.js' if has_custom_game_logic else None
            }
            
            print(f"Found: '{game_name}' -> {world_name} (exporter: {has_custom_exporter}, gameLogic: {has_custom_game_logic})")
    
    return mapping


def main():
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    worlds_dir = os.path.join(project_root, 'worlds')
    output_file = os.path.join(project_root, 'scripts', 'data', 'world-mapping.json')
    
    print(f"Scanning worlds directory: {worlds_dir}")
    
    mapping = build_world_mapping(worlds_dir)
    
    if not mapping:
        print("No world mappings found!")
        return 1
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    # Save to JSON file
    try:
        with open(output_file, 'w') as f:
            json.dump(mapping, f, indent=2, sort_keys=True)
        print(f"\nWorld mapping saved to: {output_file}")
        print(f"Found {len(mapping)} game mappings")
    except IOError as e:
        print(f"Error saving mapping file: {e}")
        return 1
    
    return 0


if __name__ == '__main__':
    exit(main())