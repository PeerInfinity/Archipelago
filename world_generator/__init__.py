"""
World Generator - Convert JSON rules files to Archipelago world packages.

This module automates the process of creating a complete Archipelago world
from a JSON rules file (the output of the exporter).

Usage:
    from world_generator import WorldGenerator

    generator = WorldGenerator('path/to/rules.json', 'worlds/mygame/')
    generator.generate()

Or from command line:
    python -m world_generator input.json -o worlds/mygame/

To instantiate a world from JSON (for rule explain support):
    from world_generator import JSONWorldBuilder, create_world_from_json

    # Option 1: Use the builder class
    builder = JSONWorldBuilder('path/to/rules.json')
    builder.load()
    world = builder.build_world()

    # Option 2: Use the convenience function
    world, multiworld, state = create_world_from_json('path/to/rules.json')
"""

from .generator import WorldGenerator
from .extractors import (
    extract_game_metadata,
    extract_items,
    extract_locations,
    extract_regions,
)
from .rule_codegen import ast_rule_to_python
from .json_world_builder import JSONWorldBuilder, create_world_from_json

__all__ = [
    'WorldGenerator',
    'JSONWorldBuilder',
    'create_world_from_json',
    'extract_game_metadata',
    'extract_items',
    'extract_locations',
    'extract_regions',
    'ast_rule_to_python',
]
