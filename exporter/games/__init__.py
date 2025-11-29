"""Game-specific rule helper functions."""

import os
import importlib
import inspect
import logging
from typing import Dict, Type, Optional, Tuple
from .base import BaseGameExportHandler
from .generic import GenericGameExportHandler

logger = logging.getLogger(__name__)

# Module-level cache for handler instances
_handler_cache: Dict[Tuple[str, Optional[int]], BaseGameExportHandler] = {}

# Automatically discover and register all game handlers
GAME_HANDLERS: Dict[str, Type[BaseGameExportHandler]] = {}

def _discover_handlers():
    """
    Automatically discover all game export handlers in this directory.

    Scans all Python files in the exporter/games directory and looks for classes
    that inherit from BaseGameExportHandler and have a GAME_NAME attribute.

    Returns:
        Dict mapping game names to handler classes
    """
    handlers = {'Generic': GenericGameExportHandler}

    current_dir = os.path.dirname(__file__)

    # Iterate through all .py files in this directory
    for filename in os.listdir(current_dir):
        if not filename.endswith('.py') or filename.startswith('_'):
            continue
        if filename in ['base.py', 'generic.py']:  # Skip base classes
            continue

        module_name = filename[:-3]  # Remove .py extension

        try:
            # Import the module
            module = importlib.import_module(f'.{module_name}', package='exporter.games')

            # Find all classes that inherit from BaseGameExportHandler
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (issubclass(obj, BaseGameExportHandler) and
                    obj is not BaseGameExportHandler and
                    obj is not GenericGameExportHandler):

                    # Check if the class has GAME_NAME attribute
                    if hasattr(obj, 'GAME_NAME'):
                        game_name = obj.GAME_NAME
                        handlers[game_name] = obj
                        logger.debug(f"Registered handler for '{game_name}': {name}")
                    else:
                        logger.warning(
                            f"Handler class {name} in {filename} is missing GAME_NAME attribute"
                        )

        except Exception as e:
            # Log but don't fail - allows for graceful degradation
            logger.warning(
                f"Failed to load game handler from {filename}: {e}"
            )

    return handlers

# Populate handlers on module import
GAME_HANDLERS = _discover_handlers()

def get_game_export_handler(game_name: str, world=None) -> BaseGameExportHandler:
    """
    Get the appropriate helper expander for the game.

    Handlers are cached per (game_name, world_id) to avoid repeated instantiation.

    Args:
        game_name: Name of the game
        world: Optional world instance (some handlers require this)

    Returns:
        Handler instance for the specified game
    """
    # Use world ID as cache key (objects aren't hashable, but their IDs are)
    cache_key = (game_name, id(world) if world else None)

    if cache_key not in _handler_cache:
        handler_class = GAME_HANDLERS.get(game_name, GenericGameExportHandler)

        # Try to instantiate with world parameter first, fall back to no params
        try:
            handler = handler_class(world)
        except TypeError:
            # Handler doesn't accept world parameter
            handler = handler_class()

        # Call initialization methods if they exist (e.g., build_rule_string_map for OOT)
        if hasattr(handler, 'build_rule_string_map') and world is not None:
            try:
                handler.build_rule_string_map(world)
            except Exception as e:
                logger.warning(f"Failed to build rule string map for {game_name}: {e}")

        _handler_cache[cache_key] = handler

    return _handler_cache[cache_key]

def clear_handler_cache():
    """Clear the handler cache. Call this between generations if needed."""
    _handler_cache.clear()
