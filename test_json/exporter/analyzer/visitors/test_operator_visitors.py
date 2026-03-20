"""
Tests for operator visitor functionality.

This module tests the analysis of various operators including:
- Boolean operators (and, or, not)
- Comparison operators (<, <=, >, >=, ==, !=)
- Arithmetic operators (+, -, *, /, //, %)
"""

import pytest

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter


class TestBooleanAndOperator:
    """Tests for the 'and' operator analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_and(self):
        """Test A and B"""
        rule = lambda state: state.has("A") and state.has("B")
        result = analyze_rule(rule)

        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2

    def test_triple_and(self):
        """Test A and B and C"""
        rule = lambda state: state.has("A") and state.has("B") and state.has("C")
        result = analyze_rule(rule)

        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        # Should be flattened to 3 conditions
        assert len(conditions) == 3

    def test_and_with_true(self):
        """Test A and True - should simplify to A"""
        rule = lambda state: state.has("A") and True
        result = analyze_rule(rule)

        # Could be 'and' with constant True or simplified to just item_check
        if result.get("type") == "and":
            conditions = result.get("conditions", [])
            # True might be included or folded
            assert any(c.get("type") == "item_check" for c in conditions)
        else:
            assert result.get("type") == "item_check"

    def test_and_with_false(self):
        """Test A and False - should simplify to False"""
        rule = lambda state: state.has("A") and False
        result = analyze_rule(rule)

        # Should simplify to constant False or 'and' with False
        if result.get("type") == "constant":
            assert result.get("value") is False
        else:
            # 'and' with False condition
            assert result.get("type") == "and"

    def test_nested_and(self):
        """Test (A and B) and (C and D)"""
        rule = lambda state: (
            (state.has("A") and state.has("B")) and
            (state.has("C") and state.has("D"))
        )
        result = analyze_rule(rule)

        assert result.get("type") == "and"
        # Should be flattened
        conditions = result.get("conditions", [])
        assert len(conditions) >= 2


class TestBooleanOrOperator:
    """Tests for the 'or' operator analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_or(self):
        """Test A or B"""
        rule = lambda state: state.has("A") or state.has("B")
        result = analyze_rule(rule)

        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2

    def test_triple_or(self):
        """Test A or B or C"""
        rule = lambda state: state.has("A") or state.has("B") or state.has("C")
        result = analyze_rule(rule)

        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 3

    def test_or_with_true(self):
        """Test A or True - should simplify to True"""
        rule = lambda state: state.has("A") or True
        result = analyze_rule(rule)

        # Should simplify to constant True or 'or' with True
        if result.get("type") == "constant":
            assert result.get("value") is True
        else:
            assert result.get("type") == "or"

    def test_or_with_false(self):
        """Test A or False - should simplify to A"""
        rule = lambda state: state.has("A") or False
        result = analyze_rule(rule)

        # Could be 'or' with constant False or simplified
        if result.get("type") == "or":
            conditions = result.get("conditions", [])
            assert any(c.get("type") == "item_check" for c in conditions)
        else:
            assert result.get("type") == "item_check"


class TestBooleanNotOperator:
    """Tests for the 'not' operator analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_not(self):
        """Test not A"""
        rule = lambda state: not state.has("A")
        result = analyze_rule(rule)

        assert result.get("type") == "not"
        operand = result.get("operand") or result.get("condition")
        assert operand.get("type") == "item_check"

    def test_not_true(self):
        """Test not True - should simplify to False"""
        rule = lambda state: not True
        result = analyze_rule(rule)

        # Should be constant False or 'not' with True
        if result.get("type") == "constant":
            assert result.get("value") is False
        else:
            assert result.get("type") == "not"

    def test_not_false(self):
        """Test not False - should simplify to True"""
        rule = lambda state: not False
        result = analyze_rule(rule)

        if result.get("type") == "constant":
            assert result.get("value") is True
        else:
            assert result.get("type") == "not"

    def test_double_not(self):
        """Test not not A - should simplify to A"""
        rule = lambda state: not not state.has("A")
        result = analyze_rule(rule)

        # Could be simplified to item_check or nested not
        assert result.get("type") in ("not", "item_check")


class TestComparisonOperators:
    """Tests for comparison operator analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_less_than(self):
        """Test a < b"""
        player = 1
        rule = lambda state: state.count("Key", player) < 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")
        assert result.get("op") == "<"

    def test_less_equal(self):
        """Test a <= b"""
        player = 1
        rule = lambda state: state.count("Key", player) <= 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")
        assert result.get("op") == "<="

    def test_greater_than(self):
        """Test a > b"""
        player = 1
        rule = lambda state: state.count("Key", player) > 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison", "item_check")

    def test_greater_equal(self):
        """Test a >= b"""
        player = 1
        rule = lambda state: state.count("Key", player) >= 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison", "item_check")

    def test_equals(self):
        """Test a == b"""
        player = 1
        rule = lambda state: state.count("Key", player) == 3
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_not_equals(self):
        """Test a != b"""
        player = 1
        rule = lambda state: state.count("Key", player) != 0
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_chained_comparison(self):
        """Test a < b < c (chained comparison)"""
        player = 1
        rule = lambda state: 1 < state.count("Key", player) < 5
        result = analyze_rule(rule, closure_vars={"player": player})

        # Chained comparisons become AND of individual comparisons
        assert result.get("type") in ("and", "compare", "comparison")


class TestArithmeticOperators:
    """Tests for arithmetic operator analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_addition(self):
        """Test a + b"""
        player = 1
        rule = lambda state: state.count("A", player) + state.count("B", player) >= 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_subtraction(self):
        """Test a - b"""
        player = 1
        rule = lambda state: state.count("A", player) - 1 >= 2
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_multiplication(self):
        """Test a * b"""
        player = 1
        rule = lambda state: state.count("Key", player) * 2 >= 6
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_division(self):
        """Test a / b"""
        player = 1
        rule = lambda state: state.count("Key", player) / 2 >= 1
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_floor_division(self):
        """Test a // b"""
        player = 1
        rule = lambda state: state.count("Key", player) // 2 >= 2
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")

    def test_modulo(self):
        """Test a % b"""
        player = 1
        rule = lambda state: state.count("Key", player) % 2 == 0
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")


class TestMixedOperators:
    """Tests for mixed operator expressions."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_and_with_comparison(self):
        """Test A and count > n"""
        player = 1
        rule = lambda state: state.has("Sword") and state.count("Key", player) > 2
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "and"

    def test_or_with_comparison(self):
        """Test A or count >= n"""
        player = 1
        rule = lambda state: state.has("Sword") or state.count("Key", player) >= 5
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "or"

    def test_not_with_comparison(self):
        """Test not (count < n)"""
        player = 1
        rule = lambda state: not (state.count("Key", player) < 3)
        result = analyze_rule(rule, closure_vars={"player": player})

        # Could be 'not' or transformed to >= comparison
        assert result.get("type") in ("not", "compare", "comparison")

    def test_complex_boolean_arithmetic(self):
        """Test (A and B) or (count + count >= n)"""
        player = 1
        rule = lambda state: (
            (state.has("A") and state.has("B")) or
            (state.count("X", player) + state.count("Y", player) >= 5)
        )
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "or"


class TestPrecedence:
    """Tests for operator precedence handling."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_and_or_precedence(self):
        """Test A and B or C - and binds tighter"""
        rule = lambda state: state.has("A") and state.has("B") or state.has("C")
        result = analyze_rule(rule)

        # Should be: (A and B) or C
        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        # First condition should be 'and'
        assert any(c.get("type") == "and" for c in conditions)

    def test_parenthesized_or(self):
        """Test A and (B or C) - explicit grouping"""
        rule = lambda state: state.has("A") and (state.has("B") or state.has("C"))
        result = analyze_rule(rule)

        # Should be: A and (B or C)
        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        # Second condition should be 'or'
        assert any(c.get("type") == "or" for c in conditions)

    def test_comparison_and(self):
        """Test a < b and c > d"""
        player = 1
        rule = lambda state: (
            state.count("A", player) < 5 and
            state.count("B", player) > 3
        )
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "and"
