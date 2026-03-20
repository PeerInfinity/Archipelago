"""Handles parsing and exporting of game rules to frontend-compatible format."""

import logging
from .exporter import export_game_rules, clear_rule_cache
from .analyzer import analyze_rule
from .pickle_exporter import (
    export_multiworld_pickle,
    load_multiworld_pickle,
    load_pickle_metadata,
    find_pickle_for_seed,
    PICKLE_EXTENSION,
    METADATA_EXTENSION,
)

logger = logging.getLogger(__name__)

# Note: get_game_export_handler and clear_handler_cache are intentionally NOT
# imported here to avoid triggering world loading on package import.
# Import them directly from exporter.games if needed:
#   from exporter.games import get_game_export_handler, clear_handler_cache

__all__ = [
    'export_game_rules',
    'analyze_rule',
    'clear_rule_cache',
    # Pickle exporter
    'export_multiworld_pickle',
    'load_multiworld_pickle',
    'load_pickle_metadata',
    'find_pickle_for_seed',
    'PICKLE_EXTENSION',
    'METADATA_EXTENSION',
]
