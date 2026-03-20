"""
Tests for the analyze_rule entry point.

This module tests the main analyze_rule() function which is the primary
entry point for converting Python rule functions to JSON format.
"""

import pytest
import ast
from typing import Dict, Any

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter


class TestSimpleItemChecks:
    """Tests for basic item check analysis."""

    def setup_method(self):
        """Clear caches and reset counter before each test."""
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_has(self):
        """Test analyzing lambda state: state.has('Sword')"""
        rule_func = lambda state: state.has("Sword")
        result = analyze_rule(rule_func)

        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_has_with_player(self):
        """Test analyzing lambda state: state.has('Sword', player)"""
        player = 1
        rule_func = lambda state: state.has("Sword", player)
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_has_with_count(self):
        """Test analyzing lambda state: state.has('Key', player, 3)"""
        player = 1
        rule_func = lambda state: state.has("Key", player, 3)
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") == "item_check"
        assert result.get("item") == "Key"
        # Count may be wrapped in a constant node
        count = result.get("count")
        if isinstance(count, dict):
            assert count.get("value") == 3
        else:
            assert count == 3

    def test_has_all(self):
        """Test analyzing lambda state: state.has_all(['A', 'B'], player)"""
        player = 1
        rule_func = lambda state: state.has_all(["A", "B"], player)
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") == "state_method"
        assert result.get("method") == "has_all"

    def test_has_any(self):
        """Test analyzing lambda state: state.has_any(['A', 'B'], player)"""
        player = 1
        rule_func = lambda state: state.has_any(["A", "B"], player)
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") == "state_method"
        assert result.get("method") == "has_any"


class TestConstantRules:
    """Tests for constant rule analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_always_true(self):
        """Test analyzing lambda state: True"""
        rule_func = lambda state: True
        result = analyze_rule(rule_func)

        assert result.get("type") == "constant"
        assert result.get("value") is True

    def test_always_false(self):
        """Test analyzing lambda state: False"""
        rule_func = lambda state: False
        result = analyze_rule(rule_func)

        assert result.get("type") == "constant"
        assert result.get("value") is False


class TestBooleanOperations:
    """Tests for boolean operation analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_boolean_and(self):
        """Test analyzing lambda state: state.has('A') and state.has('B')"""
        rule_func = lambda state: state.has("A") and state.has("B")
        result = analyze_rule(rule_func)

        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2
        assert conditions[0].get("type") == "item_check"
        assert conditions[1].get("type") == "item_check"

    def test_boolean_or(self):
        """Test analyzing lambda state: state.has('A') or state.has('B')"""
        rule_func = lambda state: state.has("A") or state.has("B")
        result = analyze_rule(rule_func)

        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2

    def test_boolean_not(self):
        """Test analyzing lambda state: not state.has('A')"""
        rule_func = lambda state: not state.has("A")
        result = analyze_rule(rule_func)

        assert result.get("type") == "not"
        operand = result.get("operand") or result.get("condition")
        assert operand.get("type") == "item_check"
        assert operand.get("item") == "A"

    def test_and_chain_flattening(self):
        """Test that and chains are flattened: a and b and c -> and([a, b, c])"""
        rule_func = lambda state: state.has("A") and state.has("B") and state.has("C")
        result = analyze_rule(rule_func)

        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        # Should be flattened to 3 conditions, not nested
        assert len(conditions) == 3

    def test_or_chain_flattening(self):
        """Test that or chains are flattened: a or b or c -> or([a, b, c])"""
        rule_func = lambda state: state.has("A") or state.has("B") or state.has("C")
        result = analyze_rule(rule_func)

        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 3


class TestComparisonOperations:
    """Tests for comparison operation analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_count_greater_than(self):
        """Test analyzing lambda state: state.count('Key') > 5"""
        player = 1
        rule_func = lambda state: state.count("Key", player) > 5
        result = analyze_rule(rule_func, closure_vars={"player": player})

        # Should be a compare or item_check with count
        assert result.get("type") in ("compare", "comparison", "item_check")

    def test_count_greater_equal(self):
        """Test analyzing lambda state: state.count('Key') >= 3"""
        player = 1
        rule_func = lambda state: state.count("Key", player) >= 3
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison", "item_check")

    def test_count_equals(self):
        """Test analyzing lambda state: state.count('Key') == 3"""
        player = 1
        rule_func = lambda state: state.count("Key", player) == 3
        result = analyze_rule(rule_func, closure_vars={"player": player})

        assert result.get("type") in ("compare", "comparison")


class TestReachabilityChecks:
    """Tests for region/location reachability analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_can_reach_region(self):
        """Test analyzing lambda state: state.can_reach('Castle', 'Region', player)"""
        player = 1
        rule_func = lambda state: state.can_reach("Castle", "Region", player)
        result = analyze_rule(rule_func, closure_vars={"player": player})

        # Could be can_reach, region_check, or state_method
        assert result.get("type") in ("can_reach", "region_check", "state_method")


class TestClosureVariables:
    """Tests for closure variable handling."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_closure_item_name(self):
        """Test analyzing a rule that captures item name from closure."""
        item = "Magic Sword"

        def make_rule(item_name):
            return lambda state: state.has(item_name)

        rule_func = make_rule(item)
        result = analyze_rule(rule_func)

        assert result.get("type") == "item_check"
        assert result.get("item") == "Magic Sword"

    def test_closure_count_value(self):
        """Test analyzing a rule that captures count from closure."""
        required_count = 5

        def make_rule(count):
            return lambda state: state.has("Key", 1, count)

        rule_func = make_rule(required_count)
        result = analyze_rule(rule_func)

        assert result.get("type") == "item_check"


class TestCaching:
    """Tests for analysis caching behavior."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_cache_hit_same_function(self):
        """Test that analyzing the same parameterless function uses cache."""
        def simple_rule(state):
            return state.has("Sword")

        # First call
        result1 = analyze_rule(simple_rule)
        # Second call should hit cache
        result2 = analyze_rule(simple_rule)

        assert result1 == result2

    def test_clear_caches(self):
        """Test that clear_caches() properly clears the analysis cache."""
        def simple_rule(state):
            return state.has("Sword")

        result1 = analyze_rule(simple_rule)
        clear_caches()
        result2 = analyze_rule(simple_rule)

        # Results should be equal even after cache clear
        assert result1 == result2


class TestErrorHandling:
    """Tests for error handling in analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_none_input(self):
        """Test that passing None returns appropriate error."""
        result = analyze_rule(None)

        assert result.get("type") == "error"

    def test_recursion_detection(self):
        """Test that infinite recursion is detected and handled."""
        # Create a function that references itself indirectly
        # This is hard to test without actual recursive helper setup
        # For now, just verify the counter reset works
        reset_analyze_rule_counter()

        # Analyze many simple rules - should not trigger recursion limit
        for i in range(100):
            item = f"Item{i}"
            rule_func = lambda state, itm=item: state.has(itm)
            result = analyze_rule(rule_func)
            assert result.get("type") != "error" or "recursion" not in result.get("message", "").lower()


class TestASTNodeInput:
    """Tests for analyzing AST nodes directly."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_analyze_ast_lambda(self):
        """Test analyzing a pre-parsed AST lambda node."""
        source = "lambda state: state.has('Sword')"
        tree = ast.parse(source, mode="eval")
        lambda_node = tree.body

        result = analyze_rule(ast_node=lambda_node)

        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_analyze_ast_constant_true(self):
        """Test analyzing a constant True AST node."""
        source = "lambda state: True"
        tree = ast.parse(source, mode="eval")
        lambda_node = tree.body

        result = analyze_rule(ast_node=lambda_node)

        assert result.get("type") == "constant"
        assert result.get("value") is True


class TestComplexRules:
    """Tests for complex nested rule analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_nested_and_or(self):
        """Test analyzing (A and B) or C"""
        rule_func = lambda state: (state.has("A") and state.has("B")) or state.has("C")
        result = analyze_rule(rule_func)

        assert result.get("type") == "or"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2
        # First condition should be an AND
        assert conditions[0].get("type") == "and"

    def test_nested_or_and(self):
        """Test analyzing A and (B or C)"""
        rule_func = lambda state: state.has("A") and (state.has("B") or state.has("C"))
        result = analyze_rule(rule_func)

        assert result.get("type") == "and"
        conditions = result.get("conditions", [])
        assert len(conditions) == 2
        # Second condition should be an OR
        assert conditions[1].get("type") == "or"

    def test_multiple_levels_nesting(self):
        """Test deeply nested rule analysis."""
        rule_func = lambda state: (
            (state.has("A") and state.has("B")) or
            (state.has("C") and state.has("D"))
        )
        result = analyze_rule(rule_func)

        assert result.get("type") == "or"


class TestConditionalExpressions:
    """Tests for conditional/ternary expression analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_conditional(self):
        """Test analyzing state.has('A') if state.has('B') else state.has('C')"""
        rule_func = lambda state: state.has("A") if state.has("B") else state.has("C")
        result = analyze_rule(rule_func)

        assert result.get("type") == "conditional"
        assert "test" in result or "condition" in result
        assert "if_true" in result
        assert "if_false" in result
