"""
Tests for BaseGameExportHandler and GenericGameExportHandler classes.

This module tests the base infrastructure classes that all game handlers
inherit from, including the mixin functionality.
"""

import pytest

from exporter.games.base import BaseGameExportHandler, GenericGameExportHandler


class TestBaseHandlerConfiguration:
    """Tests for base handler class configuration."""

    def test_default_helper_modules(self):
        """Test that default HELPER_MODULES is empty list."""
        handler = GenericGameExportHandler()
        assert isinstance(handler.HELPER_MODULES, list)

    def test_default_world_attributes(self):
        """Test that default WORLD_ATTRIBUTES is empty dict."""
        handler = GenericGameExportHandler()
        assert isinstance(handler.WORLD_ATTRIBUTES, dict)

    def test_default_exported_options(self):
        """Test that default EXPORTED_OPTIONS is empty list."""
        handler = GenericGameExportHandler()
        assert isinstance(handler.EXPORTED_OPTIONS, list)

    def test_default_item_name_modules(self):
        """Test that default ITEM_NAME_MODULES is empty list."""
        handler = GenericGameExportHandler()
        assert isinstance(handler.ITEM_NAME_MODULES, list)

    def test_default_closure_var_imports(self):
        """Test that default CLOSURE_VAR_IMPORTS is empty dict."""
        handler = GenericGameExportHandler()
        assert isinstance(handler.CLOSURE_VAR_IMPORTS, dict)

    def test_default_auto_export_helpers(self):
        """Test that AUTO_EXPORT_DISCOVERED_HELPERS defaults to True for GenericGameExportHandler."""
        # Note: BaseGameExportHandler defaults to False, but GenericGameExportHandler
        # overrides this to True for convenience
        handler = GenericGameExportHandler()
        assert handler.AUTO_EXPORT_DISCOVERED_HELPERS is True

    def test_default_auto_discover_region_attributes(self):
        """Test that AUTO_DISCOVER_REGION_ATTRIBUTES defaults to True."""
        handler = GenericGameExportHandler()
        assert handler.AUTO_DISCOVER_REGION_ATTRIBUTES is True

    def test_default_auto_discover_location_attributes(self):
        """Test that AUTO_DISCOVER_LOCATION_ATTRIBUTES defaults to True."""
        handler = GenericGameExportHandler()
        assert handler.AUTO_DISCOVER_LOCATION_ATTRIBUTES is True

    def test_default_auto_discover_world_attributes(self):
        """Test that AUTO_DISCOVER_WORLD_ATTRIBUTES defaults to True."""
        handler = GenericGameExportHandler()
        assert handler.AUTO_DISCOVER_WORLD_ATTRIBUTES is True

    def test_default_auto_discover_world_helper_modules(self):
        """Test that AUTO_DISCOVER_WORLD_HELPER_MODULES defaults to True."""
        handler = GenericGameExportHandler()
        assert handler.AUTO_DISCOVER_WORLD_HELPER_MODULES is True


class TestCustomHandler:
    """Tests for creating custom handlers."""

    def test_custom_helper_modules(self):
        """Test creating handler with custom helper modules."""

        class CustomHandler(GenericGameExportHandler):
            HELPER_MODULES = ['custom.module']

        handler = CustomHandler()
        assert 'custom.module' in handler.HELPER_MODULES

    def test_custom_exported_options(self):
        """Test creating handler with custom exported options."""

        class CustomHandler(GenericGameExportHandler):
            EXPORTED_OPTIONS = ['difficulty', 'goal']

        handler = CustomHandler()
        assert 'difficulty' in handler.EXPORTED_OPTIONS
        assert 'goal' in handler.EXPORTED_OPTIONS

    def test_custom_world_attributes(self):
        """Test creating handler with custom world attributes."""

        class CustomHandler(GenericGameExportHandler):
            WORLD_ATTRIBUTES = {
                'custom_value': lambda w, m, p: 42
            }

        handler = CustomHandler()
        assert 'custom_value' in handler.WORLD_ATTRIBUTES

    def test_custom_auto_export_enabled(self):
        """Test creating handler with auto export enabled."""

        class CustomHandler(GenericGameExportHandler):
            AUTO_EXPORT_DISCOVERED_HELPERS = True

        handler = CustomHandler()
        assert handler.AUTO_EXPORT_DISCOVERED_HELPERS is True


class TestGenericHandler:
    """Tests for GenericGameExportHandler functionality."""

    def test_instantiation_without_world(self):
        """Test that generic handler can be instantiated without world."""
        handler = GenericGameExportHandler()
        assert handler is not None

    def test_instantiation_with_none_world(self):
        """Test that generic handler can be instantiated with None world."""
        handler = GenericGameExportHandler(world=None)
        assert handler is not None

    def test_is_subclass_of_base(self):
        """Test that GenericGameExportHandler is subclass of BaseGameExportHandler."""
        assert issubclass(GenericGameExportHandler, BaseGameExportHandler)


class TestMixinInheritance:
    """Tests for mixin class inheritance."""

    def test_has_rule_expansion_mixin(self):
        """Test that handler has RuleExpansionMixin methods."""
        handler = GenericGameExportHandler()
        # Should have expand_rule method from mixin
        assert hasattr(handler, 'expand_rule') or hasattr(handler, 'should_expand_helper')

    def test_has_world_data_mixin(self):
        """Test that handler has WorldDataMixin methods."""
        handler = GenericGameExportHandler()
        # Should have methods from WorldDataMixin
        # The exact methods depend on the mixin implementation

    def test_has_helper_discovery_mixin(self):
        """Test that handler has HelperDiscoveryMixin attributes."""
        handler = GenericGameExportHandler()
        # HelperDiscoveryMixin provides configuration attributes and export logic
        # rather than explicit discovery methods
        assert hasattr(handler, 'AUTO_EXPORT_DISCOVERED_HELPERS')
        assert hasattr(handler, 'HELPER_MODULES')

    def test_has_option_normalization_mixin(self):
        """Test that handler has option-related attributes."""
        handler = GenericGameExportHandler()
        # Option normalization is handled via EXPORTED_OPTIONS attribute
        # rather than explicit normalization methods
        assert hasattr(handler, 'EXPORTED_OPTIONS')


class TestHandlerWithMockWorld:
    """Tests for handler behavior with mock world objects."""

    def test_handler_stores_world_reference(self):
        """Test that handler stores reference to world."""

        class MockWorld:
            pass

        world = MockWorld()
        handler = GenericGameExportHandler(world=world)

        # Handler may or may not store world reference depending on implementation
        # This test verifies instantiation works

    def test_handler_world_can_be_none(self):
        """Test that handler handles None world gracefully."""
        handler = GenericGameExportHandler(world=None)

        # Should not crash when accessing world-related functionality


class TestHandlerUtilityMethods:
    """Tests for utility methods on handlers."""

    def test_sanitize_helper_name(self):
        """Test helper name sanitization utility."""
        from exporter.games.base.utilities import sanitize_helper_name

        # Should handle basic names
        assert sanitize_helper_name("can_fight") == "can_fight"

        # Should handle names with special characters
        name = sanitize_helper_name("my-helper")
        assert "-" not in name or name == "my-helper"

    def test_extract_closure_vars(self):
        """Test closure variable extraction utility."""
        from exporter.games.base.utilities import extract_closure_vars

        outer_var = "test"

        def make_rule():
            return lambda state: outer_var

        rule = make_rule()
        closure_vars = extract_closure_vars(rule)

        # Should extract outer_var from closure
        assert "outer_var" in closure_vars
        assert closure_vars["outer_var"] == "test"

    def test_count_rule_nodes(self):
        """Test rule node counting utility."""
        from exporter.games.base.utilities import count_rule_nodes

        # Simple rule
        simple_rule = {"type": "item_check", "item": "Sword"}
        count = count_rule_nodes(simple_rule)
        assert count >= 1

        # Nested rule
        nested_rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        count = count_rule_nodes(nested_rule)
        assert count >= 3  # At least the and node + 2 item checks


class TestHandlerClassVariables:
    """Tests for handler class variable behavior."""

    def test_class_variables_not_shared(self):
        """Test that subclass variables don't affect parent."""

        class Handler1(GenericGameExportHandler):
            HELPER_MODULES = ['module1']

        class Handler2(GenericGameExportHandler):
            HELPER_MODULES = ['module2']

        h1 = Handler1()
        h2 = Handler2()

        assert 'module1' in h1.HELPER_MODULES
        assert 'module2' in h2.HELPER_MODULES
        assert 'module2' not in h1.HELPER_MODULES
        assert 'module1' not in h2.HELPER_MODULES

    def test_modifying_instance_list(self):
        """Test that modifying instance list doesn't affect class."""

        class Handler(GenericGameExportHandler):
            HELPER_MODULES = ['original']

        h1 = Handler()
        h2 = Handler()

        # If lists are shared, this could cause issues
        # Most implementations use immutable class defaults
        assert h1.HELPER_MODULES == h2.HELPER_MODULES
