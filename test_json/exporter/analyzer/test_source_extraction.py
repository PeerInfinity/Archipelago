"""
Tests for source code extraction from lambda functions.

This module tests the extraction and cleaning of source code from
Python lambda and function objects for AST analysis.
"""

import pytest
import inspect

from exporter.analyzer.source_extraction import _clean_source


class TestSimpleLambdaExtraction:
    """Tests for extracting simple lambda source code."""

    def test_simple_lambda(self):
        """Test extracting source from a simple lambda."""
        rule = lambda state: state.has("Sword")
        source = _clean_source(rule)

        assert source is not None
        assert "state" in source
        assert "has" in source
        assert "Sword" in source

    def test_lambda_with_and(self):
        """Test extracting source with boolean and."""
        rule = lambda state: state.has("A") and state.has("B")
        source = _clean_source(rule)

        assert source is not None
        assert "and" in source

    def test_lambda_with_or(self):
        """Test extracting source with boolean or."""
        rule = lambda state: state.has("A") or state.has("B")
        source = _clean_source(rule)

        assert source is not None
        assert "or" in source

    def test_constant_true_lambda(self):
        """Test extracting source for lambda returning True."""
        rule = lambda state: True
        source = _clean_source(rule)

        assert source is not None
        assert "True" in source

    def test_constant_false_lambda(self):
        """Test extracting source for lambda returning False."""
        rule = lambda state: False
        source = _clean_source(rule)

        assert source is not None
        assert "False" in source


class TestClosureLambdaExtraction:
    """Tests for extracting lambda source with closure variables."""

    def test_closure_variable(self):
        """Test extracting source with closure variable."""
        item = "Magic Sword"

        def make_rule(item_name):
            return lambda state: state.has(item_name)

        rule = make_rule(item)
        source = _clean_source(rule)

        assert source is not None
        assert "state" in source
        assert "item_name" in source  # The closure var name should be present

    def test_multiple_closure_variables(self):
        """Test extracting source with multiple closure variables."""
        item1 = "Sword"
        item2 = "Shield"

        def make_rule(a, b):
            return lambda state: state.has(a) and state.has(b)

        rule = make_rule(item1, item2)
        source = _clean_source(rule)

        assert source is not None
        assert "and" in source

    def test_default_parameter(self):
        """Test extracting source with default parameter."""
        def rule_with_default(state, item="Default"):
            return state.has(item)

        source = _clean_source(rule_with_default)

        assert source is not None


class TestMultilineLambdaExtraction:
    """Tests for extracting multiline lambda source."""

    def test_parenthesized_multiline(self):
        """Test extracting source from a parenthesized multiline lambda."""
        rule = (
            lambda state:
            state.has("A") and
            state.has("B")
        )
        source = _clean_source(rule)

        assert source is not None
        assert "and" in source

    def test_complex_multiline(self):
        """Test extracting complex multiline source."""
        rule = (
            lambda state: (
                (state.has("A") and state.has("B")) or
                (state.has("C") and state.has("D"))
            )
        )
        source = _clean_source(rule)

        assert source is not None
        assert "and" in source
        assert "or" in source


class TestFunctionExtraction:
    """Tests for extracting regular function source."""

    def test_simple_function(self):
        """Test extracting source from a regular function."""
        def can_fight(state):
            return state.has("Sword")

        source = _clean_source(can_fight)

        assert source is not None
        # Function source may include def or just the body

    def test_function_with_multiple_statements(self):
        """Test extracting source from function with multiple statements."""
        def complex_rule(state):
            has_weapon = state.has("Sword")
            has_shield = state.has("Shield")
            return has_weapon and has_shield

        source = _clean_source(complex_rule)

        assert source is not None


class TestNestedLambdaExtraction:
    """Tests for extracting nested lambda source."""

    def test_lambda_inside_function(self):
        """Test extracting source from a lambda defined inside a function."""
        def outer():
            return lambda state: state.has("Item")

        rule = outer()
        source = _clean_source(rule)

        assert source is not None
        assert "state" in source


class TestEdgeCases:
    """Tests for edge cases in source extraction."""

    def test_builtin_function(self):
        """Test that built-in functions return None or handle gracefully."""
        # Built-in functions don't have source
        result = _clean_source(len)

        # Should return None or handle gracefully
        # The exact behavior depends on implementation

    def test_lambda_with_method_call(self):
        """Test extracting source with method call chain."""
        rule = lambda state: state.can_reach("Castle", "Region", 1)
        source = _clean_source(rule)

        assert source is not None
        assert "can_reach" in source

    def test_lambda_with_list_literal(self):
        """Test extracting source with list literal."""
        rule = lambda state: state.has_all(["A", "B", "C"], 1)
        source = _clean_source(rule)

        assert source is not None
        assert "[" in source

    def test_lambda_with_comparison(self):
        """Test extracting source with comparison."""
        rule = lambda state: state.count("Key", 1) >= 3
        source = _clean_source(rule)

        assert source is not None
        assert ">=" in source

    def test_lambda_with_ternary(self):
        """Test extracting source with ternary expression."""
        rule = lambda state: state.has("A") if state.has("B") else state.has("C")
        source = _clean_source(rule)

        assert source is not None
        assert "if" in source


class TestSourceCleaning:
    """Tests for source code cleaning and normalization."""

    def test_removes_leading_whitespace(self):
        """Test that leading whitespace is handled."""
        rule = lambda state: state.has("A")
        source = _clean_source(rule)

        if source:
            # Should not have excessive leading whitespace
            assert not source.startswith("    " * 10)

    def test_handles_trailing_comma(self):
        """Test source with trailing comma in parent context."""
        # When lambda is part of a dict or call, there may be trailing elements
        rule = lambda state: state.has("A")
        source = _clean_source(rule)

        assert source is not None

    def test_preserves_string_contents(self):
        """Test that string contents are preserved."""
        rule = lambda state: state.has("Item With Spaces")
        source = _clean_source(rule)

        assert source is not None
        assert "Item With Spaces" in source


class TestSourceExtractionFailures:
    """Tests for expected source extraction failures."""

    def test_c_extension_function(self):
        """Test that C extension functions are handled gracefully."""
        # sorted is a built-in
        result = _clean_source(sorted)

        # Should return None or handle gracefully

    def test_class_method(self):
        """Test extracting source from a bound method."""
        class MyClass:
            def my_method(self, state):
                return state.has("A")

        obj = MyClass()
        source = _clean_source(obj.my_method)

        # May or may not work depending on implementation
