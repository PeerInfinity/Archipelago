"""
Tests for call visitor functionality.

This module tests the analysis of function call expressions including
state methods (has, has_all, has_any, count, can_reach), helper functions,
and built-in functions (any, all, len).
"""

import pytest

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter


class TestStateHasMethods:
    """Tests for state.has() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_state_has_simple(self):
        """Test state.has('Item')"""
        rule = lambda state: state.has("Sword")
        result = analyze_rule(rule)

        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_state_has_with_player(self):
        """Test state.has('Item', player)"""
        player = 1
        rule = lambda state: state.has("Sword", player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_state_has_with_count(self):
        """Test state.has('Item', player, count)"""
        player = 1
        rule = lambda state: state.has("Key", player, 5)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "item_check"
        assert result.get("item") == "Key"


class TestStateHasAllMethod:
    """Tests for state.has_all() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_has_all_literal_list(self):
        """Test state.has_all(['A', 'B', 'C'], player)"""
        player = 1
        rule = lambda state: state.has_all(["A", "B", "C"], player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "state_method"
        assert result.get("method") == "has_all"
        args = result.get("args", [])
        assert len(args) > 0

    def test_has_all_empty_list(self):
        """Test state.has_all([], player) - should evaluate to True"""
        player = 1
        rule = lambda state: state.has_all([], player)
        result = analyze_rule(rule, closure_vars={"player": player})

        # Empty has_all should be state_method or constant true
        assert result.get("type") in ("state_method", "constant")


class TestStateHasAnyMethod:
    """Tests for state.has_any() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_has_any_literal_list(self):
        """Test state.has_any(['A', 'B'], player)"""
        player = 1
        rule = lambda state: state.has_any(["A", "B"], player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "state_method"
        assert result.get("method") == "has_any"

    def test_has_any_single_item(self):
        """Test state.has_any(['A'], player)"""
        player = 1
        rule = lambda state: state.has_any(["A"], player)
        result = analyze_rule(rule, closure_vars={"player": player})

        # Single-item has_any could be optimized to item_check
        assert result.get("type") in ("state_method", "item_check")


class TestStateHasGroupMethod:
    """Tests for state.has_group() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_has_group_simple(self):
        """Test state.has_group('Swords', player)"""
        player = 1
        rule = lambda state: state.has_group("Swords", player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("group_check", "state_method")

    def test_has_group_with_count(self):
        """Test state.has_group('Swords', player, 3)"""
        player = 1
        rule = lambda state: state.has_group("Swords", player, 3)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("group_check", "state_method")


class TestStateCountMethod:
    """Tests for state.count() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_count_simple(self):
        """Test state.count('Arrow', player)"""
        player = 1
        rule = lambda state: state.count("Arrow", player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") == "state_method"
        assert result.get("method") == "count"

    def test_count_in_comparison(self):
        """Test state.count('Key', player) >= 3"""
        player = 1
        rule = lambda state: state.count("Key", player) >= 3
        result = analyze_rule(rule, closure_vars={"player": player})

        # Should be a comparison or item_check
        assert result.get("type") in ("compare", "comparison", "item_check")


class TestStateCanReachMethod:
    """Tests for state.can_reach() method analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_can_reach_region(self):
        """Test state.can_reach('Castle', 'Region', player)"""
        player = 1
        rule = lambda state: state.can_reach("Castle", "Region", player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("can_reach", "region_check", "state_method")

    def test_can_reach_location(self):
        """Test state.can_reach('Chest', 'Location', player)"""
        player = 1
        rule = lambda state: state.can_reach("Chest", "Location", player)
        result = analyze_rule(rule, closure_vars={"player": player})

        assert result.get("type") in ("can_reach", "location_check", "state_method")


class TestBuiltinAny:
    """Tests for any() built-in function analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_any_with_list_comprehension(self):
        """Test any(state.has(item) for item in items)"""
        items = ["A", "B", "C"]
        rule = lambda state: any(state.has(item) for item in items)
        result = analyze_rule(rule, closure_vars={"items": items})

        # Should be converted to or of item_checks or state_method
        assert result.get("type") in ("or", "state_method", "helper")


class TestBuiltinAll:
    """Tests for all() built-in function analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_all_with_list_comprehension(self):
        """Test all(state.has(item) for item in items)"""
        items = ["A", "B"]
        rule = lambda state: all(state.has(item) for item in items)
        result = analyze_rule(rule, closure_vars={"items": items})

        # Should be converted to and of item_checks or state_method
        assert result.get("type") in ("and", "state_method", "helper")


class TestBuiltinLen:
    """Tests for len() built-in function analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_len_of_constant_list(self):
        """Test len(constant_list)"""
        items = [1, 2, 3, 4, 5]
        rule = lambda state: len(items) > 3
        result = analyze_rule(rule, closure_vars={"items": items})

        # The len should be resolved to a constant
        assert result.get("type") in ("compare", "comparison", "constant")


class TestHelperFunctionCalls:
    """Tests for helper function call analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_helper_call(self):
        """Test calling a simple helper function."""
        def can_fight(state):
            return state.has("Sword") or state.has("Bow")

        rule = lambda state: can_fight(state)
        result = analyze_rule(rule, closure_vars={"can_fight": can_fight})

        # Should expand the helper or create a helper node
        assert result.get("type") in ("or", "helper", "state_method")

    def test_helper_with_args(self):
        """Test calling a helper with arguments."""
        def has_n_items(state, item, count):
            return state.has(item, 1, count)

        rule = lambda state: has_n_items(state, "Key", 3)
        result = analyze_rule(rule, closure_vars={"has_n_items": has_n_items})

        assert result is not None


class TestMethodChaining:
    """Tests for method chaining analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_world_options_access(self):
        """Test world.options.difficulty.value access pattern."""
        # This test verifies that chained attribute access works
        class MockOption:
            def __init__(self, v):
                self.value = v

        class MockOptions:
            def __init__(self):
                self.difficulty = MockOption(2)

        class MockWorld:
            def __init__(self):
                self.options = MockOptions()

        world = MockWorld()

        rule = lambda state: world.options.difficulty.value >= 2
        result = analyze_rule(rule, closure_vars={"world": world})

        # Should produce a comparison or constant
        assert result.get("type") in ("compare", "comparison", "constant")


class TestNestedCalls:
    """Tests for nested function call analysis."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_nested_helper_calls(self):
        """Test helper functions that call other helpers."""
        def has_weapon(state):
            return state.has("Sword")

        def can_fight(state):
            return has_weapon(state)

        rule = lambda state: can_fight(state)
        result = analyze_rule(rule, closure_vars={
            "can_fight": can_fight,
            "has_weapon": has_weapon
        })

        # Should eventually resolve to item_check or helper
        assert result is not None


class TestLambdaArguments:
    """Tests for lambda as function arguments."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_lambda_in_any(self):
        """Test any() with lambda argument."""
        items = ["A", "B"]
        rule = lambda state: any(state.has(i) for i in items)
        result = analyze_rule(rule, closure_vars={"items": items})

        assert result is not None

    def test_lambda_in_all(self):
        """Test all() with lambda argument."""
        items = ["A", "B"]
        rule = lambda state: all(state.has(i) for i in items)
        result = analyze_rule(rule, closure_vars={"items": items})

        assert result is not None
