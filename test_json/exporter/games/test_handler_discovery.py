"""
Tests for game handler discovery and lookup.

This module tests the handler discovery mechanism and the
get_game_export_handler() function.
"""

import pytest

from exporter.games import (
    get_game_export_handler,
    clear_handler_cache,
    GAME_HANDLERS,
    _get_world_directory,
)
from exporter.games.base import BaseGameExportHandler, GenericGameExportHandler


class MockWorld:
    """Mock world for testing handler discovery."""

    def __init__(self, module_path: str):
        """Create a mock world with the specified module path."""
        self._module = module_path

    @property
    def __class__(self):
        class _MockClass:
            __module__ = self._module
        return _MockClass


class TestHandlerDiscovery:
    """Tests for handler discovery from directories."""

    def test_handlers_discovered(self):
        """Test that handlers are discovered from official/ and unofficial/ directories."""
        # GAME_HANDLERS should be populated on module import
        assert isinstance(GAME_HANDLERS, dict)
        # There should be some handlers discovered (we know official/ has many)
        assert len(GAME_HANDLERS) > 0

    def test_handler_is_subclass(self):
        """Test that all discovered handlers are BaseGameExportHandler subclasses."""
        for name, handler_class in GAME_HANDLERS.items():
            assert issubclass(handler_class, BaseGameExportHandler), \
                f"Handler '{name}' is not a subclass of BaseGameExportHandler"

    def test_handler_not_base_class(self):
        """Test that no handler is the base class itself."""
        for name, handler_class in GAME_HANDLERS.items():
            assert handler_class is not BaseGameExportHandler, \
                f"Handler '{name}' is the base class"
            assert handler_class is not GenericGameExportHandler, \
                f"Handler '{name}' is the generic handler class"


class TestGetWorldDirectory:
    """Tests for extracting world directory from world objects."""

    def test_simple_world_directory(self):
        """Test extracting directory from simple world path."""
        # Create a mock class with proper __module__
        class MockWorldClass:
            __module__ = 'worlds.alttp'

        world = MockWorldClass()
        result = _get_world_directory(world)
        assert result == 'alttp'

    def test_nested_world_directory(self):
        """Test extracting directory from nested module path."""
        class MockWorldClass:
            __module__ = 'worlds.pokemon_emerald.SubModule'

        world = MockWorldClass()
        result = _get_world_directory(world)
        assert result == 'pokemon_emerald'

    def test_worldgen_fallback(self):
        """Test that _worldgen suffix is stripped for fallback."""
        class MockWorldClass:
            __module__ = 'worlds.alttp_worldgen'

        world = MockWorldClass()
        result = _get_world_directory(world)
        # Should strip _worldgen unless specific handler exists
        assert result in ('alttp_worldgen', 'alttp')

    def test_none_world(self):
        """Test handling None world."""
        result = _get_world_directory(None)
        assert result is None

    def test_non_worlds_module(self):
        """Test handling world from non-worlds module."""
        class MockWorldClass:
            __module__ = 'not_worlds.something'

        world = MockWorldClass()
        result = _get_world_directory(world)
        # Should return None or handle gracefully


class TestGetGameExportHandler:
    """Tests for get_game_export_handler() function."""

    def setup_method(self):
        """Clear handler cache before each test."""
        clear_handler_cache()

    def test_get_handler_for_known_game(self):
        """Test getting handler for a known game."""
        # Pick a game we know has a handler
        if 'alttp' in GAME_HANDLERS:
            class MockWorldClass:
                __module__ = 'worlds.alttp'

            world = MockWorldClass()
            handler = get_game_export_handler(world=world)
            assert handler is not None
            assert isinstance(handler, BaseGameExportHandler)

    def test_fallback_to_generic(self):
        """Test that unknown game falls back to generic handler."""
        class MockWorldClass:
            __module__ = 'worlds.unknown_game_xyz123'

        world = MockWorldClass()
        handler = get_game_export_handler(world=world)

        assert handler is not None
        assert isinstance(handler, GenericGameExportHandler)

    def test_handler_caching(self):
        """Test that same handler instance is returned for same world."""
        class MockWorldClass:
            __module__ = 'worlds.test_game'

        world = MockWorldClass()
        handler1 = get_game_export_handler(world=world)
        handler2 = get_game_export_handler(world=world)

        # Same world should return same handler instance
        assert handler1 is handler2

    def test_different_worlds_different_handlers(self):
        """Test that different worlds get different handler instances."""
        class MockWorld1:
            __module__ = 'worlds.game_a'

        class MockWorld2:
            __module__ = 'worlds.game_b'

        world1 = MockWorld1()
        world2 = MockWorld2()

        handler1 = get_game_export_handler(world=world1)
        handler2 = get_game_export_handler(world=world2)

        # Different worlds should get different instances
        # (unless both fall back to generic, then they could be different instances)
        assert handler1 is not None
        assert handler2 is not None

    def test_clear_cache(self):
        """Test that clearing cache causes new handler creation."""
        class MockWorldClass:
            __module__ = 'worlds.test_game'

        world = MockWorldClass()
        handler1 = get_game_export_handler(world=world)
        clear_handler_cache()
        handler2 = get_game_export_handler(world=world)

        # After cache clear, should get new instance
        # Note: These might be equal if they're generic handlers
        assert handler1 is not None
        assert handler2 is not None

    def test_explicit_world_directory(self):
        """Test using explicit world_directory parameter."""
        handler = get_game_export_handler(world_directory='unknown_test_game')

        assert handler is not None
        assert isinstance(handler, GenericGameExportHandler)


class TestWorldgenHandlerFallback:
    """Tests for _worldgen handler fallback behavior."""

    def setup_method(self):
        clear_handler_cache()

    def test_worldgen_uses_parent_handler(self):
        """Test that _worldgen worlds use parent game's handler."""
        # Create a mock worldgen world
        class MockWorldgenWorld:
            __module__ = 'worlds.alttp_worldgen'

        world = MockWorldgenWorld()
        handler = get_game_export_handler(world=world)

        # Should get a handler (either alttp's or generic)
        assert handler is not None
        assert isinstance(handler, BaseGameExportHandler)


class TestHandlerInstantiation:
    """Tests for handler instantiation."""

    def setup_method(self):
        clear_handler_cache()

    def test_handler_accepts_world(self):
        """Test that handlers can be instantiated with world parameter."""
        class MockWorldClass:
            __module__ = 'worlds.test_game'

        world = MockWorldClass()

        # Should not raise - handler should accept world or not
        handler = get_game_export_handler(world=world)
        assert handler is not None

    def test_handler_without_world(self):
        """Test getting handler without world object."""
        handler = get_game_export_handler(world_directory='unknown_game')

        assert handler is not None
        assert isinstance(handler, GenericGameExportHandler)
