#!/usr/bin/env python3
"""
Script to build a mapping between template game names and their corresponding
world directory names by scanning the worlds directory for game class variables.
"""

import ast
import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional


def extract_game_name_from_world(world_init_path: str) -> Optional[str]:
    """
    Extract the game name from a world's __init__.py file using AST parsing.
    This handles both literal strings and variable references.
    Returns None if no game name is found.
    """
    try:
        with open(world_init_path, 'r', encoding='utf-8') as f:
            content = f.read()

        tree = ast.parse(content, filename=world_init_path)

        # First pass: look for World class and its 'game' attribute
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                # Check if this is a World subclass
                is_world_class = any(
                    isinstance(base, ast.Name) and base.id == 'World'
                    for base in node.bases
                )

                if is_world_class:
                    # Look for 'game' attribute in the class
                    for item in node.body:
                        if isinstance(item, ast.AnnAssign):
                            # Handle: game: str = "value" or game: ClassVar[str] = "value"
                            if isinstance(item.target, ast.Name) and item.target.id == 'game':
                                if item.value:
                                    return extract_string_value(item.value, content, world_init_path)
                        elif isinstance(item, ast.Assign):
                            # Handle: game = "value" or game = CONSTANT
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == 'game':
                                    return extract_string_value(item.value, content, world_init_path)

        return None
    except (IOError, UnicodeDecodeError, SyntaxError) as e:
        # Silently ignore parse errors for worlds with syntax issues
        return None


def extract_string_value(node: ast.AST, content: str, init_path: str) -> Optional[str]:
    """
    Extract a string value from an AST node.
    Handles both literal strings, Name nodes (variable references), and Attribute nodes (e.g., MODULE.attr).
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        # Direct string literal: game = "Game Name"
        return node.value
    elif isinstance(node, ast.Str):
        # Python 3.7 compatibility: game = "Game Name"
        return node.s
    elif isinstance(node, ast.Name):
        # Variable reference: game = GAME_NAME
        # Try to find the variable definition in the same file or imported modules
        var_name = node.id
        return find_variable_definition(var_name, content, init_path)
    elif isinstance(node, ast.Attribute):
        # Attribute access: game = OTHER.game_name
        # Handle MODULE.attribute pattern
        return resolve_attribute_access(node, content, init_path)

    return None


def resolve_attribute_access(node: ast.Attribute, content: str, init_path: str) -> Optional[str]:
    """
    Resolve attribute access like OTHER.game_name to find the actual string value.
    Handles patterns like: game = MODULE.attribute
    """
    # Get the attribute name (e.g., "game_name")
    attr_name = node.attr

    # Get the module/object name (e.g., "OTHER")
    # We only handle simple cases where node.value is a Name node
    if not isinstance(node.value, ast.Name):
        return None

    module_name = node.value.id

    try:
        tree = ast.parse(content, filename=init_path)
        world_dir = Path(init_path).parent

        # Find where the module is imported from
        for ast_node in ast.walk(tree):
            if isinstance(ast_node, ast.ImportFrom):
                # Check if this import includes our module
                imports_module = any(
                    isinstance(alias, ast.alias) and alias.name == module_name
                    for alias in ast_node.names
                )

                if imports_module and ast_node.level > 0 and ast_node.module:
                    # Relative import - resolve the module path
                    module_path = world_dir / f"{ast_node.module.replace('.', '/')}.py"

                    if module_path.exists():
                        with open(module_path, 'r', encoding='utf-8') as f:
                            imported_content = f.read()

                        # Parse the imported file and look for the class/attribute
                        imported_tree = ast.parse(imported_content, filename=str(module_path))

                        # Look for class definition
                        for imported_node in ast.walk(imported_tree):
                            if isinstance(imported_node, ast.ClassDef) and imported_node.name == module_name:
                                # Found the class, now look for the attribute
                                for class_item in imported_node.body:
                                    if isinstance(class_item, ast.AnnAssign):
                                        # Handle: attribute: str = "value"
                                        if isinstance(class_item.target, ast.Name) and class_item.target.id == attr_name:
                                            if class_item.value:
                                                if isinstance(class_item.value, ast.Constant) and isinstance(class_item.value.value, str):
                                                    return class_item.value.value
                                                elif isinstance(class_item.value, ast.Str):
                                                    return class_item.value.s
                                    elif isinstance(class_item, ast.Assign):
                                        # Handle: attribute = "value"
                                        for target in class_item.targets:
                                            if isinstance(target, ast.Name) and target.id == attr_name:
                                                if isinstance(class_item.value, ast.Constant) and isinstance(class_item.value.value, str):
                                                    return class_item.value.value
                                                elif isinstance(class_item.value, ast.Str):
                                                    return class_item.value.s

        return None
    except (SyntaxError, IOError, UnicodeDecodeError):
        return None


def find_variable_definition(var_name: str, content: str, init_path: str) -> Optional[str]:
    """
    Find the definition of a variable in the file or its imports.
    """
    try:
        tree = ast.parse(content, filename=init_path)

        # First, check for direct assignment in the file
        for node in ast.walk(tree):
            if isinstance(node, ast.AnnAssign):
                # Handle: VAR_NAME: str = "value"
                if isinstance(node.target, ast.Name) and node.target.id == var_name:
                    if node.value:
                        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                            return node.value.value
                        elif isinstance(node.value, ast.Str):
                            return node.value.s
            elif isinstance(node, ast.Assign):
                # Handle: VAR_NAME = "value"
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == var_name:
                        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                            return node.value.value
                        elif isinstance(node.value, ast.Str):
                            return node.value.s

        # If not found, check imports
        world_dir = Path(init_path).parent
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                # Handle: from .Constants import * or from .Constants import GAME_NAME
                # node.level > 0 indicates a relative import (. or .. etc)
                if node.level > 0 and node.module:
                    # Relative import
                    module_path = world_dir / f"{node.module}.py"

                    if module_path.exists():
                        # Check if this import includes our variable
                        imports_var = any(
                            isinstance(alias, ast.alias) and
                            (alias.name == var_name or alias.name == '*')
                            for alias in node.names
                        )

                        if imports_var:
                            with open(module_path, 'r', encoding='utf-8') as f:
                                imported_content = f.read()

                            # Recursively search in the imported file
                            imported_tree = ast.parse(imported_content, filename=str(module_path))
                            for imported_node in ast.walk(imported_tree):
                                if isinstance(imported_node, ast.AnnAssign):
                                    if isinstance(imported_node.target, ast.Name) and imported_node.target.id == var_name:
                                        if imported_node.value:
                                            if isinstance(imported_node.value, ast.Constant) and isinstance(imported_node.value.value, str):
                                                return imported_node.value.value
                                            elif isinstance(imported_node.value, ast.Str):
                                                return imported_node.value.s
                                elif isinstance(imported_node, ast.Assign):
                                    for target in imported_node.targets:
                                        if isinstance(target, ast.Name) and target.id == var_name:
                                            if isinstance(imported_node.value, ast.Constant) and isinstance(imported_node.value.value, str):
                                                return imported_node.value.value
                                            elif isinstance(imported_node.value, ast.Str):
                                                return imported_node.value.s

        return None
    except (SyntaxError, IOError, UnicodeDecodeError):
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
    # Script is now in scripts/build/, so go up two levels to reach project root
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
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