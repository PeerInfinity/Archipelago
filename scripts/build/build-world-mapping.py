#!/usr/bin/env python3
"""
Script to build a mapping between template game names and their corresponding
world directory names by scanning the worlds directory for game class variables.
"""

import ast
import io
import json
import os
import sys
import zipfile
from pathlib import Path
from typing import Dict, Optional

import yaml


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


def extract_game_name_from_content(content: str, filename: str = "<string>") -> Optional[str]:
    """
    Extract the game name from Python source content using AST parsing.
    This is used for parsing files from .apworld archives.
    Returns None if no game name is found.
    """
    try:
        tree = ast.parse(content, filename=filename)

        # First, build a dictionary of module-level dict definitions
        # to handle patterns like: game = json_world["game_name"]
        module_dicts = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and isinstance(node.value, ast.Dict):
                        # Extract string keys and their string values
                        dict_values = {}
                        for key, val in zip(node.value.keys, node.value.values):
                            if key is not None:
                                key_str = None
                                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                                    key_str = key.value
                                elif isinstance(key, ast.Str):
                                    key_str = key.s

                                if key_str:
                                    val_str = None
                                    if isinstance(val, ast.Constant) and isinstance(val.value, str):
                                        val_str = val.value
                                    elif isinstance(val, ast.Str):
                                        val_str = val.s
                                    if val_str:
                                        dict_values[key_str] = val_str

                        if dict_values:
                            module_dicts[target.id] = dict_values

        # Look for World class and its 'game' attribute
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
                        game_value = None
                        if isinstance(item, ast.AnnAssign):
                            # Handle: game: str = "value" or game: ClassVar[str] = "value"
                            if isinstance(item.target, ast.Name) and item.target.id == 'game':
                                game_value = item.value
                        elif isinstance(item, ast.Assign):
                            # Handle: game = "value"
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == 'game':
                                    game_value = item.value
                                    break

                        if game_value:
                            # Direct string literal
                            if isinstance(game_value, ast.Constant) and isinstance(game_value.value, str):
                                return game_value.value
                            elif isinstance(game_value, ast.Str):
                                return game_value.s
                            # Dictionary subscript: game = some_dict["key"]
                            elif isinstance(game_value, ast.Subscript):
                                if isinstance(game_value.value, ast.Name):
                                    dict_name = game_value.value.id
                                    if dict_name in module_dicts:
                                        # Get the key being accessed
                                        key = None
                                        if isinstance(game_value.slice, ast.Constant) and isinstance(game_value.slice.value, str):
                                            key = game_value.slice.value
                                        elif isinstance(game_value.slice, ast.Str):
                                            key = game_value.slice.s
                                        elif isinstance(game_value.slice, ast.Index):  # Python 3.8 compatibility
                                            idx = game_value.slice.value
                                            if isinstance(idx, ast.Constant) and isinstance(idx.value, str):
                                                key = idx.value
                                            elif isinstance(idx, ast.Str):
                                                key = idx.s

                                        if key and key in module_dicts[dict_name]:
                                            return module_dicts[dict_name][key]

        return None
    except (SyntaxError, ValueError) as e:
        return None


def build_symbol_table_from_apworld(zf: zipfile.ZipFile, world_dir: str) -> Dict[str, str]:
    """
    Build a symbol table of all string constants defined in the apworld.
    This allows resolving cross-file constant references like:
      - from .constants import GAME_NAME
      - game = GAME_NAME

    Returns dict mapping constant names to their string values.
    """
    symbols = {}

    # Find all Python files in the world directory
    py_files = [name for name in zf.namelist()
                if name.startswith(f"{world_dir}/") and name.endswith('.py')]

    for py_file in py_files:
        try:
            content = zf.read(py_file).decode('utf-8')
            tree = ast.parse(content, filename=py_file)

            # Look for module-level string constant assignments
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            # Check if value is a string literal
                            if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                                symbols[target.id] = node.value.value
                            elif isinstance(node.value, ast.Str):  # Python 3.7 compat
                                symbols[target.id] = node.value.s
                elif isinstance(node, ast.AnnAssign):
                    if isinstance(node.target, ast.Name) and node.value:
                        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                            symbols[node.target.id] = node.value.value
                        elif isinstance(node.value, ast.Str):  # Python 3.7 compat
                            symbols[node.target.id] = node.value.s

                # Also look for class-level constants (like CupheadWorld.GAME_NAME)
                elif isinstance(node, ast.ClassDef):
                    for item in node.body:
                        if isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name):
                                    if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                        # Store both as ClassName.attr and just attr
                                        symbols[f"{node.name}.{target.id}"] = item.value.value
                                        symbols[target.id] = item.value.value
                                    elif isinstance(item.value, ast.Str):
                                        symbols[f"{node.name}.{target.id}"] = item.value.s
                                        symbols[target.id] = item.value.s
                        elif isinstance(item, ast.AnnAssign):
                            if isinstance(item.target, ast.Name) and item.value:
                                if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                    symbols[f"{node.name}.{item.target.id}"] = item.value.value
                                    symbols[item.target.id] = item.value.value
                                elif isinstance(item.value, ast.Str):
                                    symbols[f"{node.name}.{item.target.id}"] = item.value.s
                                    symbols[item.target.id] = item.value.s
        except (SyntaxError, ValueError, UnicodeDecodeError):
            continue

    return symbols


def build_dict_table(content: str, filename: str) -> Dict[str, Dict[str, str]]:
    """
    Build a table of module-level dict definitions.
    Returns dict mapping dict names to their string key-value pairs.
    """
    dicts = {}
    try:
        tree = ast.parse(content, filename=filename)

        for node in ast.walk(tree):
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and isinstance(node.value, ast.Dict):
                        dict_values = {}
                        for key, val in zip(node.value.keys, node.value.values):
                            if key is not None:
                                key_str = None
                                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                                    key_str = key.value
                                elif isinstance(key, ast.Str):
                                    key_str = key.s

                                if key_str:
                                    val_str = None
                                    if isinstance(val, ast.Constant) and isinstance(val.value, str):
                                        val_str = val.value
                                    elif isinstance(val, ast.Str):
                                        val_str = val.s
                                    if val_str:
                                        dict_values[key_str] = val_str

                        if dict_values:
                            dicts[target.id] = dict_values
    except (SyntaxError, ValueError):
        pass
    return dicts


def extract_game_from_world_class(content: str, filename: str, symbols: Dict[str, str]) -> Optional[str]:
    """
    Extract the game name from a World class definition.
    Uses the symbol table to resolve constant references.
    """
    try:
        tree = ast.parse(content, filename=filename)

        # Build dict table for this file (for patterns like game = json_world["game_name"])
        module_dicts = build_dict_table(content, filename)

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
                        game_value = None
                        if isinstance(item, ast.AnnAssign):
                            if isinstance(item.target, ast.Name) and item.target.id == 'game':
                                game_value = item.value
                        elif isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == 'game':
                                    game_value = item.value
                                    break

                        if game_value:
                            # Direct string literal
                            if isinstance(game_value, ast.Constant) and isinstance(game_value.value, str):
                                return game_value.value
                            elif isinstance(game_value, ast.Str):
                                return game_value.s
                            # Name reference to a constant
                            elif isinstance(game_value, ast.Name):
                                if game_value.id in symbols:
                                    return symbols[game_value.id]
                            # Attribute access (e.g., Constants.GAME_NAME or self.GAME_NAME)
                            elif isinstance(game_value, ast.Attribute):
                                # Try ClassName.attr format
                                if isinstance(game_value.value, ast.Name):
                                    full_name = f"{game_value.value.id}.{game_value.attr}"
                                    if full_name in symbols:
                                        return symbols[full_name]
                                    # Also try just the attribute name
                                    if game_value.attr in symbols:
                                        return symbols[game_value.attr]
                            # Dictionary subscript: game = some_dict["key"]
                            elif isinstance(game_value, ast.Subscript):
                                if isinstance(game_value.value, ast.Name):
                                    dict_name = game_value.value.id
                                    if dict_name in module_dicts:
                                        # Get the key being accessed
                                        key = None
                                        if isinstance(game_value.slice, ast.Constant) and isinstance(game_value.slice.value, str):
                                            key = game_value.slice.value
                                        elif isinstance(game_value.slice, ast.Str):
                                            key = game_value.slice.s
                                        elif isinstance(game_value.slice, ast.Index):  # Python 3.8 compat
                                            idx = game_value.slice.value
                                            if isinstance(idx, ast.Constant) and isinstance(idx.value, str):
                                                key = idx.value
                                            elif isinstance(idx, ast.Str):
                                                key = idx.s

                                        if key and key in module_dicts[dict_name]:
                                            return module_dicts[dict_name][key]

        return None
    except (SyntaxError, ValueError):
        return None


def read_game_from_manifest(zf: zipfile.ZipFile, world_dir: str) -> Optional[str]:
    """
    Read the game name from archipelago.json manifest file inside the apworld.
    This is a fallback for apworlds that use runtime loading of the game name.
    """
    manifest_path = f"{world_dir}/archipelago.json"
    try:
        if manifest_path in zf.namelist():
            content = zf.read(manifest_path).decode('utf-8')
            manifest = json.loads(content)
            return manifest.get("game")
    except (json.JSONDecodeError, UnicodeDecodeError, KeyError):
        pass
    return None


def extract_game_name_shallow(content: str, filename: str) -> Optional[str]:
    """
    Shallow extraction: only looks for direct string literals in World class.
    Fast but doesn't resolve constant references.
    """
    try:
        tree = ast.parse(content, filename=filename)

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                is_world_class = any(
                    isinstance(base, ast.Name) and base.id == 'World'
                    for base in node.bases
                )

                if is_world_class:
                    for item in node.body:
                        game_value = None
                        if isinstance(item, ast.AnnAssign):
                            if isinstance(item.target, ast.Name) and item.target.id == 'game':
                                game_value = item.value
                        elif isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name) and target.id == 'game':
                                    game_value = item.value
                                    break

                        if game_value:
                            if isinstance(game_value, ast.Constant) and isinstance(game_value.value, str):
                                return game_value.value
                            elif isinstance(game_value, ast.Str):
                                return game_value.s

        return None
    except (SyntaxError, ValueError):
        return None


def extract_game_name_from_apworld(apworld_path: str) -> Optional[tuple]:
    """
    Extract the game name and world directory from a .apworld file.
    Returns tuple of (game_name, world_directory) or None if not found.

    Uses a tiered approach for performance:
    1. First checks archipelago.json manifest (fastest)
    2. Then tries shallow analysis of __init__.py (direct string literals only)
    3. Only if needed, does deep analysis with cross-file symbol resolution
    """
    try:
        with zipfile.ZipFile(apworld_path, 'r') as zf:
            # Find the world directory (top-level directory in the zip)
            world_dir = None
            for name in zf.namelist():
                parts = name.split('/')
                if len(parts) >= 2 and parts[1] == '__init__.py':
                    world_dir = parts[0]
                    break

            if not world_dir:
                return None

            # TIER 1: Try archipelago.json manifest first (fastest)
            game_name = read_game_from_manifest(zf, world_dir)
            if game_name:
                return (game_name, world_dir)

            # TIER 2: Try shallow analysis of __init__.py only (fast)
            init_path = f"{world_dir}/__init__.py"
            if init_path in zf.namelist():
                try:
                    content = zf.read(init_path).decode('utf-8')
                    game_name = extract_game_name_shallow(content, init_path)
                    if game_name:
                        return (game_name, world_dir)
                except (UnicodeDecodeError, SyntaxError):
                    pass

            # TIER 3: Deep analysis - build symbol table and search all files
            symbols = build_symbol_table_from_apworld(zf, world_dir)

            # Find Python files to search for World class
            py_files = [name for name in zf.namelist()
                        if name.startswith(f"{world_dir}/") and name.endswith('.py')
                        and '/test/' not in name and '/tests/' not in name and '/test_json/' not in name]

            # Sort to prioritize __init__.py and world.py
            def priority(f):
                if f.endswith('__init__.py'):
                    return 0
                if f.endswith('world.py'):
                    return 1
                return 2

            py_files.sort(key=priority)

            for py_file in py_files:
                try:
                    content = zf.read(py_file).decode('utf-8')
                    game_name = extract_game_from_world_class(content, py_file, symbols)
                    if game_name:
                        return (game_name, world_dir)
                except (UnicodeDecodeError, SyntaxError):
                    continue

            return None
    except (zipfile.BadZipFile, IOError, UnicodeDecodeError) as e:
        return None


def get_file_size(file_path: Path) -> int:
    """Get the size of a file in bytes, or 0 if it doesn't exist."""
    if file_path.exists():
        return file_path.stat().st_size
    return 0


def get_directory_total_size(dir_path: Path) -> int:
    """Get the total size of all files in a directory in bytes."""
    if not dir_path.exists() or not dir_path.is_dir():
        return 0
    total = 0
    for file_path in dir_path.iterdir():
        if file_path.is_file():
            total += file_path.stat().st_size
    return total


# Exporter handler subdirectories to search (in priority order)
EXPORTER_SUBDIRS = ['official', 'unofficial']


def find_exporter_path(world_name: str) -> tuple[Path | None, str | None]:
    """
    Find the exporter file for a world in the new directory structure.

    Searches in exporter/games/official/ and exporter/games/unofficial/
    in that order, returning the first match found.

    Args:
        world_name: The world directory name (e.g., 'alttp', 'minit')

    Returns:
        Tuple of (Path object, relative path string) if found, or (None, None) if not found
    """
    base_path = Path('exporter/games')

    for subdir in EXPORTER_SUBDIRS:
        exporter_path = base_path / subdir / f'{world_name}.py'
        if exporter_path.exists():
            return exporter_path, f'exporter/games/{subdir}/{world_name}.py'

    return None, None


def build_template_file_mapping(templates_dir: str) -> Dict[str, str]:
    """
    Scan the templates directory and build a mapping from game name to template filename.
    Reads each YAML file to extract the 'game' field.
    Returns dict mapping game_name -> template_filename
    (e.g. "Jak and Daxter: The Precursor Legacy" -> "Jak and Daxter The Precursor Legacy.yaml")
    """
    mapping = {}
    templates_path = Path(templates_dir)
    if not templates_path.exists():
        print(f"Note: Templates directory not found: {templates_dir}")
        return mapping

    for template_file in sorted(templates_path.glob('*.yaml')):
        try:
            with open(template_file, 'r', encoding='utf-8-sig') as f:
                data = yaml.safe_load(f)
            if data and isinstance(data, dict) and 'game' in data:
                game_name = data['game']
                if isinstance(game_name, str):
                    mapping[game_name] = template_file.name
        except Exception:
            continue

    return mapping


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

        # If not found in __init__.py, also check world.py (some worlds define class there)
        if not game_name:
            world_file = world_dir / 'world.py'
            if world_file.exists():
                game_name = extract_game_name_from_world(str(world_file))

        if game_name:
            world_name = world_dir.name

            # Check for custom exporter and get file size
            exporter_path, exporter_path_str = find_exporter_path(world_name)
            has_custom_exporter = exporter_path is not None
            exporter_size = get_file_size(exporter_path) if exporter_path else 0

            # Check for custom gameLogic directory and get total size of all files
            game_logic_dir = Path('frontend/modules/shared/gameLogic') / world_name
            game_logic_main_file = game_logic_dir / f'{world_name}Logic.js'
            has_custom_game_logic = game_logic_main_file.exists()
            game_logic_size = get_directory_total_size(game_logic_dir)

            mapping[game_name] = {
                'world_directory': world_name,
                'has_custom_exporter': has_custom_exporter,
                'has_custom_game_logic': has_custom_game_logic,
                'exporter_path': exporter_path_str,
                'exporter_size': exporter_size,
                'game_logic_path': f'frontend/modules/shared/gameLogic/{world_name}/{world_name}Logic.js' if has_custom_game_logic else None,
                'game_logic_size': game_logic_size
            }

            print(f"Found: '{game_name}' -> {world_name} (exporter: {exporter_size}B, gameLogic: {game_logic_size}B)")

    return mapping


def build_apworld_mapping(custom_worlds_dir: str) -> Dict[str, Dict[str, any]]:
    """
    Build a mapping from game names to world information for .apworld files.
    Returns dict with game names as keys and world info as values.
    """
    mapping = {}

    custom_worlds_path = Path(custom_worlds_dir)
    if not custom_worlds_path.exists():
        print(f"Note: Custom worlds directory not found: {custom_worlds_dir}")
        return mapping

    for apworld_file in custom_worlds_path.glob('*.apworld'):
        result = extract_game_name_from_apworld(str(apworld_file))

        if result:
            game_name, world_name = result

            # Check for custom exporter and get file size
            exporter_path, exporter_path_str = find_exporter_path(world_name)
            has_custom_exporter = exporter_path is not None
            exporter_size = get_file_size(exporter_path) if exporter_path else 0

            # Check for custom gameLogic directory and get total size of all files
            game_logic_dir = Path('frontend/modules/shared/gameLogic') / world_name
            game_logic_main_file = game_logic_dir / f'{world_name}Logic.js'
            has_custom_game_logic = game_logic_main_file.exists()
            game_logic_size = get_directory_total_size(game_logic_dir)

            mapping[game_name] = {
                'world_directory': world_name,
                'has_custom_exporter': has_custom_exporter,
                'has_custom_game_logic': has_custom_game_logic,
                'exporter_path': exporter_path_str,
                'exporter_size': exporter_size,
                'game_logic_path': f'frontend/modules/shared/gameLogic/{world_name}/{world_name}Logic.js' if has_custom_game_logic else None,
                'game_logic_size': game_logic_size,
                'apworld_path': str(apworld_file.relative_to(Path.cwd())) if apworld_file.is_relative_to(Path.cwd()) else str(apworld_file)
            }

            print(f"Found (apworld): '{game_name}' -> {world_name} (exporter: {exporter_size}B, gameLogic: {game_logic_size}B)")

    return mapping


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description='Build a mapping between template game names and their world directory names'
    )
    parser.add_argument(
        '--apworlds-only',
        action='store_true',
        help='Only scan custom_worlds/ for .apworld files (skip bundled worlds)'
    )
    parser.add_argument(
        '--output', '-o',
        type=str,
        help='Output file path (default: scripts/data/world-mapping.json, '
             'or scripts/data/world-mapping-unofficial.json with --apworlds-only)'
    )
    args = parser.parse_args()

    # Script is now in scripts/build/, so go up two levels to reach project root
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    worlds_dir = os.path.join(project_root, 'worlds')
    custom_worlds_dir = os.path.join(project_root, 'custom_worlds')

    # Determine output file
    if args.output:
        output_file = args.output
        if not os.path.isabs(output_file):
            output_file = os.path.join(project_root, output_file)
    elif args.apworlds_only:
        output_file = os.path.join(project_root, 'scripts', 'data', 'world-mapping-unofficial.json')
    else:
        output_file = os.path.join(project_root, 'scripts', 'data', 'world-mapping.json')

    templates_dir = os.path.join(project_root, 'Players', 'Templates')

    mapping = {}
    apworld_count = 0

    if not args.apworlds_only:
        print(f"Scanning worlds directory: {worlds_dir}")
        mapping = build_world_mapping(worlds_dir)

        # Also scan custom_worlds directory for .apworld files
        print(f"Scanning custom worlds directory: {custom_worlds_dir}")
        apworld_mapping = build_apworld_mapping(custom_worlds_dir)

        # Merge apworld mappings into the main mapping
        # apworld entries will override regular world entries if there's a conflict
        mapping.update(apworld_mapping)
        apworld_count = len(apworld_mapping)
    else:
        # Only scan apworlds
        print(f"Scanning custom worlds directory (apworlds only): {custom_worlds_dir}")
        mapping = build_apworld_mapping(custom_worlds_dir)
        apworld_count = len(mapping)

    if not mapping:
        print("No world mappings found!")
        return 1

    # Scan template files and augment entries with game_name and template_file
    print(f"\nScanning templates directory: {templates_dir}")
    template_file_mapping = build_template_file_mapping(templates_dir)
    matched = 0
    for game_name, entry in mapping.items():
        entry['game_name'] = game_name
        entry['template_file'] = template_file_mapping.get(game_name)
        if entry['template_file']:
            matched += 1
    print(f"Matched {matched}/{len(mapping)} games to template files")

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    # Save to JSON file
    try:
        with open(output_file, 'w') as f:
            json.dump(mapping, f, indent=2, sort_keys=True)
        print(f"\nWorld mapping saved to: {output_file}")
        if args.apworlds_only:
            print(f"Found {len(mapping)} apworld mappings")
        else:
            print(f"Found {len(mapping)} game mappings ({apworld_count} from apworld files)")
    except IOError as e:
        print(f"Error saving mapping file: {e}")
        return 1

    return 0


if __name__ == '__main__':
    exit(main())