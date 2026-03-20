"""
Tests for JSON to Python conversion.

This module tests converting JSON AST format rules back to
Python code expressions.
"""

import pytest

from exporter.converter import convert_json_to_python, convert_json_to_lambda


class TestConstantConversion:
    """Tests for converting constant nodes to Python."""

    def test_constant_true(self):
        """Test converting {"type": "constant", "value": true}."""
        json_rule = {"type": "constant", "value": True}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "True" in result

    def test_constant_false(self):
        """Test converting {"type": "constant", "value": false}."""
        json_rule = {"type": "constant", "value": False}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "False" in result

    def test_constant_number(self):
        """Test converting numeric constant."""
        json_rule = {"type": "constant", "value": 42}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "42" in result

    def test_constant_string(self):
        """Test converting string constant."""
        json_rule = {"type": "constant", "value": "Sword"}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "Sword" in result


class TestItemCheckConversion:
    """Tests for converting item_check nodes to Python."""

    def test_simple_item_check(self):
        """Test converting {"type": "item_check", "item": "Sword"}."""
        json_rule = {"type": "item_check", "item": "Sword"}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "has" in result
        assert "Sword" in result

    def test_item_check_with_count(self):
        """Test converting item_check with count."""
        json_rule = {
            "type": "item_check",
            "item": "Key",
            "count": {"type": "constant", "value": 3}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "has" in result
        assert "Key" in result
        assert "3" in result

    def test_item_check_with_numeric_count(self):
        """Test item_check with numeric count (not wrapped)."""
        json_rule = {"type": "item_check", "item": "Key", "count": 5}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "Key" in result


class TestStateMethodConversion:
    """Tests for converting state_method nodes to Python."""

    def test_has_all_method(self):
        """Test converting state_method has_all."""
        json_rule = {
            "type": "state_method",
            "method": "has_all",
            "args": [{"type": "constant", "value": ["A", "B", "C"]}]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "has_all" in result

    def test_has_any_method(self):
        """Test converting state_method has_any."""
        json_rule = {
            "type": "state_method",
            "method": "has_any",
            "args": [{"type": "constant", "value": ["A", "B"]}]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "has_any" in result

    def test_count_method(self):
        """Test converting state_method count."""
        json_rule = {
            "type": "state_method",
            "method": "count",
            "args": [{"type": "constant", "value": "Key"}]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "count" in result
        assert "Key" in result


class TestBooleanNodeConversion:
    """Tests for converting boolean operation nodes to Python."""

    def test_and_node(self):
        """Test converting {"type": "and", "conditions": [...]}."""
        json_rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "and" in result

    def test_or_node(self):
        """Test converting {"type": "or", "conditions": [...]}."""
        json_rule = {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "or" in result

    def test_not_node(self):
        """Test converting {"type": "not", "operand": {...}}."""
        json_rule = {
            "type": "not",
            "operand": {"type": "item_check", "item": "Curse"}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "not" in result

    def test_not_with_condition_key(self):
        """Test converting not with 'condition' key instead of 'operand'."""
        json_rule = {
            "type": "not",
            "condition": {"type": "item_check", "item": "Curse"}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "not" in result

    def test_nested_boolean(self):
        """Test converting nested boolean structure."""
        json_rule = {
            "type": "or",
            "conditions": [
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "A"},
                        {"type": "item_check", "item": "B"}
                    ]
                },
                {"type": "item_check", "item": "C"}
            ]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "and" in result
        assert "or" in result


class TestComparisonConversion:
    """Tests for converting comparison nodes to Python."""

    def test_compare_greater_than(self):
        """Test converting comparison with >."""
        json_rule = {
            "type": "compare",
            "left": {
                "type": "state_method",
                "method": "count",
                "args": [{"type": "constant", "value": "Key"}]
            },
            "op": ">",
            "right": {"type": "constant", "value": 5}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert ">" in result

    def test_compare_greater_equal(self):
        """Test converting comparison with >=."""
        json_rule = {
            "type": "compare",
            "left": {
                "type": "state_method",
                "method": "count",
                "args": [{"type": "constant", "value": "Key"}]
            },
            "op": ">=",
            "right": {"type": "constant", "value": 3}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert ">=" in result

    def test_compare_equals(self):
        """Test converting comparison with ==."""
        json_rule = {
            "type": "compare",
            "left": {
                "type": "state_method",
                "method": "count",
                "args": [{"type": "constant", "value": "Key"}]
            },
            "op": "==",
            "right": {"type": "constant", "value": 3}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "==" in result


class TestBinaryOpConversion:
    """Tests for converting binary_op (arithmetic) nodes to Python."""

    def test_addition(self):
        """Test converting addition."""
        json_rule = {
            "type": "binary_op",
            "left": {"type": "constant", "value": 2},
            "op": "+",
            "right": {"type": "constant", "value": 3}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "+" in result

    def test_multiplication(self):
        """Test converting multiplication."""
        json_rule = {
            "type": "binary_op",
            "left": {"type": "constant", "value": 4},
            "op": "*",
            "right": {"type": "constant", "value": 5}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "*" in result


class TestReachabilityConversion:
    """Tests for converting reachability nodes to Python."""

    def test_can_reach_region(self):
        """Test converting can_reach node."""
        json_rule = {"type": "can_reach", "region": "Castle"}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "can_reach" in result
        assert "Castle" in result

    def test_region_check(self):
        """Test converting region_check node."""
        json_rule = {"type": "region_check", "region": "Dungeon"}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "Dungeon" in result


class TestConditionalConversion:
    """Tests for converting conditional nodes to Python."""

    def test_simple_conditional(self):
        """Test converting conditional/ternary."""
        json_rule = {
            "type": "conditional",
            "test": {"type": "item_check", "item": "B"},
            "if_true": {"type": "item_check", "item": "A"},
            "if_false": {"type": "item_check", "item": "C"}
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "if" in result


class TestHelperConversion:
    """Tests for converting helper call nodes to Python."""

    def test_simple_helper(self):
        """Test converting helper node."""
        json_rule = {
            "type": "helper",
            "name": "can_fight",
            "args": []
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "can_fight" in result

    def test_helper_with_args(self):
        """Test converting helper with arguments."""
        json_rule = {
            "type": "helper",
            "name": "check_item",
            "args": [
                {"type": "constant", "value": "Sword"},
                {"type": "constant", "value": 2}
            ]
        }
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "check_item" in result


class TestLambdaGeneration:
    """Tests for generating full lambda expressions."""

    def test_generate_simple_lambda(self):
        """Test generating a lambda from JSON."""
        json_rule = {"type": "item_check", "item": "Sword"}
        result, warnings = convert_json_to_lambda(json_rule)

        assert result is not None
        assert "lambda" in result
        assert "state" in result

    def test_generate_complex_lambda(self):
        """Test generating a complex lambda."""
        json_rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        result, warnings = convert_json_to_lambda(json_rule)

        assert result is not None
        assert "lambda" in result
        assert "and" in result


class TestErrorHandling:
    """Tests for error handling in conversion."""

    def test_unknown_type(self):
        """Test handling unknown type."""
        json_rule = {"type": "unknown_type", "value": 42}
        result, warnings = convert_json_to_python(json_rule)

        # Should handle gracefully, possibly with warning

    def test_missing_type(self):
        """Test handling missing type field."""
        json_rule = {"value": 42}
        result, warnings = convert_json_to_python(json_rule)

        # Should handle gracefully

    def test_none_input(self):
        """Test handling None input."""
        result, warnings = convert_json_to_python(None)

        # Should handle gracefully


class TestGroupCheck:
    """Tests for converting group_check nodes."""

    def test_simple_group_check(self):
        """Test converting group_check."""
        json_rule = {"type": "group_check", "group": "Swords", "count": 1}
        result, warnings = convert_json_to_python(json_rule)

        assert result is not None
        assert "Swords" in result
