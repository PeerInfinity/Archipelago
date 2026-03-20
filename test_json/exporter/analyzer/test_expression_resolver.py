"""
Tests for the ExpressionResolver class.

This module tests the resolution of variables, attributes, subscripts,
and binary operations to concrete values during rule analysis.
"""

import pytest
from typing import Dict, Any

from exporter.analyzer.expression_resolver import ExpressionResolver


class MockOption:
    """Mock option class for testing attribute resolution."""
    option_vanilla = 0
    option_hard = 1
    option_expert = 2

    def __init__(self, value):
        self.value = value


class MockWorld:
    """Mock world for testing expression resolution."""

    def __init__(self):
        self.player = 1
        self.difficulty = MockOption(2)


class MockModule:
    """Mock module for testing module attribute access."""
    CONSTANT_VALUE = 42
    ITEMS = ["Sword", "Shield", "Bow"]

    @staticmethod
    def get_value(index):
        return MockModule.ITEMS[index] if 0 <= index < len(MockModule.ITEMS) else None


class TestVariableResolution:
    """Tests for resolving variable names."""

    def test_resolve_from_closure(self):
        """Test resolving a variable from closure_vars."""
        closure_vars = {"item_name": "Sword", "count": 3}
        resolver = ExpressionResolver(closure_vars, None, None)

        result = resolver.resolve_variable("item_name")
        assert result == "Sword"

        result = resolver.resolve_variable("count")
        assert result == 3

    def test_resolve_missing_variable(self):
        """Test that missing variables return None."""
        closure_vars = {"item_name": "Sword"}
        resolver = ExpressionResolver(closure_vars, None, None)

        result = resolver.resolve_variable("nonexistent")
        assert result is None

    def test_resolve_from_defaults(self):
        """Test resolving a variable from function defaults."""
        def rule_with_default(state, item="Default Item"):
            return state.has(item)

        resolver = ExpressionResolver({}, rule_with_default, None)
        result = resolver.resolve_variable("item")
        assert result == "Default Item"

    def test_resolve_from_globals(self):
        """Test resolving a variable from function globals."""
        # Create a function that has MockModule in its globals
        global_namespace = {"MockModule": MockModule}

        def make_rule():
            return lambda state: state.has(MockModule.ITEMS[0])

        # Manually set globals for testing
        rule_func = make_rule()
        rule_func.__globals__["MockModule"] = MockModule

        resolver = ExpressionResolver({}, rule_func, None)
        result = resolver.resolve_variable("MockModule")
        assert result is MockModule

    def test_closure_takes_precedence(self):
        """Test that closure vars take precedence over defaults."""
        def rule_with_default(state, item="Default"):
            return state.has(item)

        closure_vars = {"item": "Closure Item"}
        resolver = ExpressionResolver(closure_vars, rule_with_default, None)

        result = resolver.resolve_variable("item")
        assert result == "Closure Item"


class TestExpressionResolution:
    """Tests for resolving complex expressions."""

    def test_resolve_constant(self):
        """Test resolving a constant expression."""
        resolver = ExpressionResolver({}, None, None)
        expr = {"type": "constant", "value": 42}

        result = resolver.resolve_expression(expr)
        assert result == 42

    def test_resolve_constant_string(self):
        """Test resolving a string constant."""
        resolver = ExpressionResolver({}, None, None)
        expr = {"type": "constant", "value": "Sword"}

        result = resolver.resolve_expression(expr)
        assert result == "Sword"

    def test_resolve_name(self):
        """Test resolving a name expression."""
        closure_vars = {"item": "Magic Bow"}
        resolver = ExpressionResolver(closure_vars, None, None)
        expr = {"type": "name", "name": "item"}

        result = resolver.resolve_expression(expr)
        assert result == "Magic Bow"

    def test_resolve_attribute(self):
        """Test resolving an attribute expression."""
        world = MockWorld()
        closure_vars = {"world": world}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "attribute",
            "object": {"type": "name", "name": "world"},
            "attr": "player"
        }

        result = resolver.resolve_expression(expr)
        assert result == 1

    def test_resolve_nested_attribute(self):
        """Test resolving a nested attribute expression like world.difficulty.value."""
        world = MockWorld()
        closure_vars = {"world": world}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "attribute",
            "object": {
                "type": "attribute",
                "object": {"type": "name", "name": "world"},
                "attr": "difficulty"
            },
            "attr": "value"
        }

        result = resolver.resolve_expression(expr)
        assert result == 2

    def test_resolve_subscript(self):
        """Test resolving a subscript expression."""
        items = {"Key1": "Value1", "Key2": "Value2"}
        closure_vars = {"items": items}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "subscript",
            "value": {"type": "name", "name": "items"},
            "index": {"type": "constant", "value": "Key1"}
        }

        result = resolver.resolve_expression(expr)
        assert result == "Value1"

    def test_resolve_list_subscript(self):
        """Test resolving a list subscript with integer index."""
        items = ["A", "B", "C"]
        closure_vars = {"items": items}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "subscript",
            "value": {"type": "name", "name": "items"},
            "index": {"type": "constant", "value": 1}
        }

        result = resolver.resolve_expression(expr)
        assert result == "B"

    def test_resolve_subscript_out_of_bounds(self):
        """Test that out-of-bounds subscript returns None."""
        items = ["A", "B"]
        closure_vars = {"items": items}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "subscript",
            "value": {"type": "name", "name": "items"},
            "index": {"type": "constant", "value": 10}
        }

        result = resolver.resolve_expression(expr)
        assert result is None

    def test_resolve_missing_key_subscript(self):
        """Test that missing dict key returns None."""
        items = {"a": 1}
        closure_vars = {"items": items}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "subscript",
            "value": {"type": "name", "name": "items"},
            "index": {"type": "constant", "value": "nonexistent"}
        }

        result = resolver.resolve_expression(expr)
        assert result is None


class TestBinaryOperationResolution:
    """Tests for resolving binary operations."""

    def test_resolve_addition(self):
        """Test resolving a + b."""
        closure_vars = {"a": 5, "b": 3}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "+",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 8

    def test_resolve_subtraction(self):
        """Test resolving a - b."""
        closure_vars = {"a": 10, "b": 4}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "-",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 6

    def test_resolve_multiplication(self):
        """Test resolving a * b."""
        closure_vars = {"a": 6, "b": 7}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "*",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 42

    def test_resolve_division(self):
        """Test resolving a / b."""
        closure_vars = {"a": 20, "b": 4}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "/",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 5.0

    def test_resolve_floor_division(self):
        """Test resolving a // b."""
        closure_vars = {"a": 17, "b": 5}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "//",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 3

    def test_resolve_modulo(self):
        """Test resolving a % b."""
        closure_vars = {"a": 17, "b": 5}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "%",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 2

    def test_resolve_power(self):
        """Test resolving a ** b."""
        closure_vars = {"a": 2, "b": 8}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "a"},
            "op": "**",
            "right": {"type": "name", "name": "b"}
        }

        result = resolver.resolve_expression(expr)
        assert result == 256

    def test_resolve_with_constants(self):
        """Test resolving binary op with constant values."""
        resolver = ExpressionResolver({}, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "constant", "value": 10},
            "op": "+",
            "right": {"type": "constant", "value": 5}
        }

        result = resolver.resolve_expression(expr)
        assert result == 15

    def test_resolve_unresolvable_binary_op(self):
        """Test that binary op with unresolvable operand returns None."""
        resolver = ExpressionResolver({}, None, None)

        expr = {
            "type": "binary_op",
            "left": {"type": "name", "name": "unknown"},
            "op": "+",
            "right": {"type": "constant", "value": 5}
        }

        result = resolver.resolve_expression(expr)
        assert result is None


class TestFunctionCallResolution:
    """Tests for resolving function call expressions."""

    def test_resolve_simple_function_call(self):
        """Test resolving a simple function call."""
        def double(x):
            return x * 2

        closure_vars = {"double": double}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "function_call",
            "function": {"type": "name", "name": "double"},
            "args": [{"type": "constant", "value": 21}]
        }

        result = resolver.resolve_expression(expr)
        assert result == 42

    def test_resolve_module_function_call(self):
        """Test resolving a method call on a module."""
        closure_vars = {"MockModule": MockModule}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "function_call",
            "function": {
                "type": "attribute",
                "object": {"type": "name", "name": "MockModule"},
                "attr": "get_value"
            },
            "args": [{"type": "constant", "value": 0}]
        }

        result = resolver.resolve_expression(expr)
        assert result == "Sword"

    def test_resolve_uncallable_function(self):
        """Test that non-callable function reference returns None."""
        closure_vars = {"not_a_func": 42}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "function_call",
            "function": {"type": "name", "name": "not_a_func"},
            "args": []
        }

        result = resolver.resolve_expression(expr)
        assert result is None


class TestPlayerContext:
    """Tests for player context handling."""

    def test_get_player_number_from_context(self):
        """Test getting player number from context."""
        resolver = ExpressionResolver({}, None, player_context=2)
        result = resolver._get_current_player_number()
        assert result == 2

    def test_get_default_player_number(self):
        """Test that default player number is 1."""
        resolver = ExpressionResolver({}, None, None)
        result = resolver._get_current_player_number()
        assert result == 1


class TestEdgeCases:
    """Tests for edge cases in expression resolution."""

    def test_resolve_none_expression(self):
        """Test that None expression returns None."""
        resolver = ExpressionResolver({}, None, None)
        result = resolver.resolve_expression(None)
        assert result is None

    def test_resolve_non_dict_expression(self):
        """Test that non-dict expression returns None."""
        resolver = ExpressionResolver({}, None, None)
        result = resolver.resolve_expression("not a dict")
        assert result is None

    def test_resolve_unknown_type(self):
        """Test that unknown expression type returns None."""
        resolver = ExpressionResolver({}, None, None)
        expr = {"type": "unknown_type", "value": 42}

        result = resolver.resolve_expression(expr)
        assert result is None

    def test_resolve_attribute_on_none(self):
        """Test that attribute access on None object returns None."""
        closure_vars = {"obj": None}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "attribute",
            "object": {"type": "name", "name": "obj"},
            "attr": "some_attr"
        }

        result = resolver.resolve_expression(expr)
        assert result is None

    def test_resolve_missing_attribute(self):
        """Test that missing attribute returns None."""
        class SimpleObj:
            pass

        closure_vars = {"obj": SimpleObj()}
        resolver = ExpressionResolver(closure_vars, None, None)

        expr = {
            "type": "attribute",
            "object": {"type": "name", "name": "obj"},
            "attr": "nonexistent_attr"
        }

        result = resolver.resolve_expression(expr)
        assert result is None
