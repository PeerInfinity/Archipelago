"""
Tests for Python to JSON conversion.

This module tests converting Python rule expressions (lambdas, functions)
to JSON AST format.
"""

import pytest

from exporter.converter import convert_python_to_json, convert_lambda_to_json


class TestSimpleExpressions:
    """Tests for simple Python expression conversion."""

    def test_constant_true(self):
        """Test converting 'True' to JSON."""
        result, warnings = convert_python_to_json("True")

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") is True

    def test_constant_false(self):
        """Test converting 'False' to JSON."""
        result, warnings = convert_python_to_json("False")

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") is False

    def test_constant_number(self):
        """Test converting numeric constant to JSON."""
        result, warnings = convert_python_to_json("42")

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") == 42

    def test_constant_string(self):
        """Test converting string constant to JSON."""
        result, warnings = convert_python_to_json("'Sword'")

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") == "Sword"


class TestStateMethodExpressions:
    """Tests for converting state method calls."""

    def test_state_has(self):
        """Test converting state.has('Item')."""
        result, warnings = convert_python_to_json("state.has('Sword')")

        assert result is not None
        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_state_has_with_player(self):
        """Test converting state.has('Item', player)."""
        result, warnings = convert_python_to_json("state.has('Sword', player)")

        assert result is not None
        assert result.get("type") == "item_check"

    def test_state_has_with_count(self):
        """Test converting state.has('Item', player, count)."""
        result, warnings = convert_python_to_json("state.has('Key', player, 3)")

        assert result is not None
        assert result.get("type") == "item_check"
        assert result.get("item") == "Key"

    def test_state_has_all(self):
        """Test converting state.has_all(['A', 'B'], player)."""
        result, warnings = convert_python_to_json("state.has_all(['A', 'B'], player)")

        assert result is not None
        assert result.get("type") == "state_method"
        assert result.get("method") == "has_all"

    def test_state_has_any(self):
        """Test converting state.has_any(['A', 'B'], player)."""
        result, warnings = convert_python_to_json("state.has_any(['A', 'B'], player)")

        assert result is not None
        assert result.get("type") == "state_method"
        assert result.get("method") == "has_any"

    def test_state_count(self):
        """Test converting state.count('Item', player)."""
        result, warnings = convert_python_to_json("state.count('Key', player)")

        assert result is not None
        assert result.get("type") == "state_method"
        assert result.get("method") == "count"

    def test_state_can_reach(self):
        """Test converting state.can_reach('Region', 'Region', player)."""
        result, warnings = convert_python_to_json("state.can_reach('Castle', 'Region', player)")

        assert result is not None
        assert result.get("type") in ("can_reach", "state_method")


class TestBooleanExpressions:
    """Tests for converting boolean expressions."""

    def test_and_expression(self):
        """Test converting A and B."""
        result, warnings = convert_python_to_json("state.has('A') and state.has('B')")

        assert result is not None
        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2

    def test_or_expression(self):
        """Test converting A or B."""
        result, warnings = convert_python_to_json("state.has('A') or state.has('B')")

        assert result is not None
        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2

    def test_not_expression(self):
        """Test converting not A."""
        result, warnings = convert_python_to_json("not state.has('A')")

        assert result is not None
        assert result.get("type") == "not"

    def test_complex_boolean(self):
        """Test converting (A and B) or C."""
        result, warnings = convert_python_to_json(
            "(state.has('A') and state.has('B')) or state.has('C')"
        )

        assert result is not None
        assert result.get("type") == "or"


class TestComparisonExpressions:
    """Tests for converting comparison expressions."""

    def test_greater_than(self):
        """Test converting a > b."""
        result, warnings = convert_python_to_json("state.count('Key', player) > 5")

        assert result is not None
        assert result.get("type") in ("compare", "comparison")
        assert result.get("op") == ">"

    def test_greater_equal(self):
        """Test converting a >= b."""
        result, warnings = convert_python_to_json("state.count('Key', player) >= 5")

        assert result is not None
        assert result.get("type") in ("compare", "comparison")

    def test_less_than(self):
        """Test converting a < b."""
        result, warnings = convert_python_to_json("state.count('Key', player) < 5")

        assert result is not None
        assert result.get("type") in ("compare", "comparison")
        assert result.get("op") == "<"

    def test_equals(self):
        """Test converting a == b."""
        result, warnings = convert_python_to_json("state.count('Key', player) == 3")

        assert result is not None
        assert result.get("type") in ("compare", "comparison")

    def test_not_equals(self):
        """Test converting a != b."""
        result, warnings = convert_python_to_json("state.count('Key', player) != 0")

        assert result is not None
        assert result.get("type") in ("compare", "comparison")


class TestArithmeticExpressions:
    """Tests for converting arithmetic expressions."""

    def test_addition(self):
        """Test converting a + b."""
        result, warnings = convert_python_to_json(
            "state.count('A', player) + state.count('B', player)"
        )

        assert result is not None
        assert result.get("type") == "binary_op"
        assert result.get("op") in ("+", "Add")

    def test_subtraction(self):
        """Test converting a - b."""
        result, warnings = convert_python_to_json("state.count('A', player) - 1")

        assert result is not None
        assert result.get("type") == "binary_op"

    def test_multiplication(self):
        """Test converting a * b."""
        result, warnings = convert_python_to_json("state.count('A', player) * 2")

        assert result is not None
        assert result.get("type") == "binary_op"


class TestConditionalExpressions:
    """Tests for converting conditional/ternary expressions."""

    def test_simple_conditional(self):
        """Test converting 'a if cond else b'."""
        result, warnings = convert_python_to_json(
            "state.has('A') if state.has('B') else state.has('C')"
        )

        assert result is not None
        assert result.get("type") == "conditional"


class TestLambdaConversion:
    """Tests for converting full lambda expressions."""

    def test_simple_lambda(self):
        """Test converting a simple lambda."""
        result, warnings = convert_lambda_to_json("lambda state: state.has('Sword')")

        assert result is not None
        assert result.get("type") == "item_check"

    def test_lambda_with_boolean(self):
        """Test converting lambda with boolean expression."""
        result, warnings = convert_lambda_to_json(
            "lambda state: state.has('A') and state.has('B')"
        )

        assert result is not None
        assert result.get("type") == "and"

    def test_lambda_constant_true(self):
        """Test converting lambda returning True."""
        result, warnings = convert_lambda_to_json("lambda state: True")

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") is True


class TestHelperCalls:
    """Tests for converting helper function calls."""

    def test_simple_helper_call(self):
        """Test converting a helper call."""
        result, warnings = convert_python_to_json("can_fight(state)")

        assert result is not None
        # Helper calls may be represented as function_call or helper
        assert result.get("type") in ("helper", "function_call", "AST_function_call")

    def test_helper_with_args(self):
        """Test converting helper call with arguments."""
        result, warnings = convert_python_to_json("check_item(state, 'Sword', 2)")

        assert result is not None


class TestErrorHandling:
    """Tests for error handling in conversion."""

    def test_invalid_syntax(self):
        """Test that invalid syntax is handled."""
        result, warnings = convert_python_to_json("this is not valid python !!!")

        # Should return None or an error structure
        assert result is None or result.get("type") == "error"

    def test_empty_string(self):
        """Test that empty string is handled."""
        result, warnings = convert_python_to_json("")

        # Should handle gracefully


class TestListAndDictLiterals:
    """Tests for converting list and dict literals."""

    def test_list_literal(self):
        """Test converting a list literal."""
        result, warnings = convert_python_to_json("['A', 'B', 'C']")

        assert result is not None
        # Could be list type or constant with list value
        if result.get("type") == "constant":
            assert result.get("value") == ["A", "B", "C"]
        else:
            assert result.get("type") == "list"

    def test_dict_literal(self):
        """Test converting a dict literal."""
        result, warnings = convert_python_to_json("{'key': 'value'}")

        assert result is not None


class TestAttributeAccess:
    """Tests for converting attribute access expressions."""

    def test_simple_attribute(self):
        """Test converting obj.attr."""
        result, warnings = convert_python_to_json("world.player")

        assert result is not None
        assert result.get("type") == "attribute"

    def test_nested_attribute(self):
        """Test converting obj.a.b."""
        result, warnings = convert_python_to_json("world.options.difficulty")

        assert result is not None
        assert result.get("type") == "attribute"

    def test_attribute_value(self):
        """Test converting obj.attr.value."""
        result, warnings = convert_python_to_json("world.options.difficulty.value")

        assert result is not None


class TestSubscript:
    """Tests for converting subscript expressions."""

    def test_simple_subscript(self):
        """Test converting items[key]."""
        result, warnings = convert_python_to_json("items['Sword']")

        assert result is not None
        assert result.get("type") == "subscript"

    def test_index_subscript(self):
        """Test converting items[0]."""
        result, warnings = convert_python_to_json("items[0]")

        assert result is not None
        assert result.get("type") == "subscript"
