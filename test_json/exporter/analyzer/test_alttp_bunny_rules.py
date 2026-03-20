"""
Tests for analyzing ALttP bunny rule patterns.

This module tests the analyzer's ability to handle the complex lambda patterns
used in ALttP's set_bunny_rules() function, which uses:
- Function factories (path_to_access_rule)
- options_to_access_rule with any() pattern
- Mixed option lists with simple lambdas and factory-generated lambdas
"""

import pytest
from typing import Dict, Any, List, Callable

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter


# =============================================================================
# Mock Objects for Testing
# =============================================================================

class MockEntrance:
    """Mock entrance object for testing bunny rules."""

    def __init__(self, name: str, player: int = 1):
        self.name = name
        self.player = player


class MockState:
    """Mock state for testing rule evaluation."""

    def __init__(self, items: Dict[str, int] = None, reachable: set = None):
        self.items = items or {}
        self.reachable = reachable or set()

    def has(self, item: str, player: int = 1, count: int = 1) -> bool:
        return self.items.get(item, 0) >= count

    def can_reach(self, name: str, resolution_hint: str = None, player: int = 1) -> bool:
        return name in self.reachable


# =============================================================================
# ALttP Bunny Rule Pattern Recreations
# =============================================================================

def path_to_access_rule(path: List[Callable], entrance: MockEntrance):
    """
    Recreation of ALttP's path_to_access_rule function factory.

    This is the exact pattern used in worlds/alttp/Rules.py line 1669-1671.
    """
    return lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player) and all(
        rule(state) for rule in path)


def options_to_access_rule(options: List[Callable]):
    """
    Recreation of ALttP's options_to_access_rule function.

    This is the exact pattern used in worlds/alttp/Rules.py line 1673-1674.
    """
    return lambda state: any(rule(state) for rule in options)


# =============================================================================
# Test Classes
# =============================================================================

class TestPathToAccessRule:
    """Tests for the path_to_access_rule function factory pattern."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_path_to_access_rule(self):
        """Test analyzing a simple path_to_access_rule lambda."""
        entrance = MockEntrance("Cave Entrance")
        path = []  # Empty path

        rule_func = path_to_access_rule(path, entrance)
        result = analyze_rule(rule_func)

        print(f"Result for simple path_to_access_rule: {result}")

        # The analyzer should be able to handle this pattern
        assert result.get("type") != "error", f"Analysis failed: {result}"

    def test_path_to_access_rule_with_item_check(self):
        """Test path_to_access_rule with an item check in the path."""
        entrance = MockEntrance("Cave Entrance")
        player = 1
        path = [lambda state: state.has('Moon Pearl', player)]

        rule_func = path_to_access_rule(path, entrance)
        result = analyze_rule(rule_func)

        print(f"Result for path with item check: {result}")

        # Should handle this without error
        assert result.get("type") != "error", f"Analysis failed: {result}"

    def test_path_to_access_rule_with_multiple_conditions(self):
        """Test path_to_access_rule with multiple conditions in path."""
        entrance = MockEntrance("Dungeon Entrance")
        player = 1
        path = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: state.has('Sword', player),
        ]

        rule_func = path_to_access_rule(path, entrance)
        result = analyze_rule(rule_func)

        print(f"Result for path with multiple conditions: {result}")

        assert result.get("type") != "error", f"Analysis failed: {result}"


class TestOptionsToAccessRule:
    """Tests for the options_to_access_rule pattern (any() over options)."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_simple_options_to_access_rule(self):
        """Test analyzing options_to_access_rule with simple lambdas."""
        player = 1
        options = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: state.has('Magic Mirror', player),
        ]

        rule_func = options_to_access_rule(options)
        result = analyze_rule(rule_func)

        print(f"Result for simple options: {result}")

        # Should produce an "or" type with the options
        assert result.get("type") != "error", f"Analysis failed: {result}"

    def test_options_with_single_option(self):
        """Test options_to_access_rule with a single option (Moon Pearl only)."""
        player = 1
        options = [lambda state: state.has('Moon Pearl', player)]

        rule_func = options_to_access_rule(options)
        result = analyze_rule(rule_func)

        print(f"Result for single option: {result}")

        # This is the base case that should work
        assert result.get("type") != "error", f"Analysis failed: {result}"


class TestMixedOptions:
    """Tests for mixed options (simple lambdas + factory-generated lambdas)."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_mixed_options_simple_and_factory(self):
        """
        Test the exact pattern used in ALttP bunny rules.

        This recreates the pattern from Rules.py lines 1739-1741:
        possible_options = [lambda state: state.has('Moon Pearl', player)]
        ...
        possible_options.append(lambda state: path_to_access_rule(new_path, entrance))

        Note: The original code has a bug - it appends a lambda that RETURNS
        path_to_access_rule instead of calling it. This test recreates that bug.
        """
        player = 1
        entrance = MockEntrance("Superbunny Cave (Top)")
        new_path = [lambda state: state.has('Moon Pearl', player)]

        # This is the BUGGY pattern from ALttP (returns lambda, doesn't call it)
        possible_options = [lambda state: state.has('Moon Pearl', player)]
        possible_options.append(lambda state: path_to_access_rule(new_path, entrance))

        rule_func = options_to_access_rule(possible_options)
        result = analyze_rule(rule_func)

        print(f"Result for mixed options (buggy pattern): {result}")

        # Document what happens with the buggy pattern
        if result.get("type") == "error":
            print(f"  Error message: {result.get('message', 'No message')}")

    def test_mixed_options_correct_pattern(self):
        """
        Test the CORRECT pattern (if the bug were fixed).

        The correct pattern would be:
        possible_options.append(path_to_access_rule(new_path, entrance))

        This directly appends the lambda returned by the factory, not a lambda
        that returns the factory result.
        """
        player = 1
        entrance = MockEntrance("Superbunny Cave (Top)")
        new_path = [lambda state: state.has('Moon Pearl', player)]

        # Correct pattern - directly append the factory result
        possible_options = [lambda state: state.has('Moon Pearl', player)]
        possible_options.append(path_to_access_rule(new_path, entrance))

        rule_func = options_to_access_rule(possible_options)
        result = analyze_rule(rule_func)

        print(f"Result for mixed options (correct pattern): {result}")

        # This should be analyzable
        assert result.get("type") != "error", f"Analysis failed: {result}"


class TestSuperbunnyCaveExactPattern:
    """
    Tests recreating the exact Superbunny Cave bunny rule pattern.

    This attempts to recreate what happens during actual rule export.
    """

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_superbunny_cave_moon_pearl_only(self):
        """Test the simplest case - just Moon Pearl requirement."""
        player = 1

        # When no paths are found, only Moon Pearl is in options
        possible_options = [lambda state: state.has('Moon Pearl', player)]
        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"Superbunny Cave (Moon Pearl only): {result}")

        # This should definitely work
        assert result.get("type") != "error", f"Analysis failed: {result}"

        # Check if we get the right structure
        if result.get("type") == "or":
            conditions = result.get("conditions", [])
            print(f"  Conditions: {conditions}")

    def test_superbunny_cave_with_one_path(self):
        """Test with Moon Pearl + one path option."""
        player = 1
        entrance = MockEntrance("Superbunny Cave (Top)")

        # Build the path rule correctly
        moon_pearl_rule = lambda state: state.has('Moon Pearl', player)
        new_path = [moon_pearl_rule]
        path_rule = path_to_access_rule(new_path, entrance)

        # Options: Moon Pearl OR (can_reach entrance AND path)
        possible_options = [
            lambda state: state.has('Moon Pearl', player),
            path_rule,
        ]

        rule_func = options_to_access_rule(possible_options)
        result = analyze_rule(rule_func)

        print(f"Superbunny Cave (with one path): {result}")

        if result.get("type") == "error":
            print(f"  Error: {result.get('message', 'Unknown error')}")
        else:
            print(f"  Type: {result.get('type')}")
            if result.get("type") == "or":
                print(f"  Num conditions: {len(result.get('conditions', []))}")


class TestClosureVariableResolution:
    """Tests for closure variable resolution in bunny rule patterns."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_closure_with_entrance_object(self):
        """Test that entrance objects in closures are handled."""
        entrance = MockEntrance("Test Entrance", player=1)

        rule_func = lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player)
        result = analyze_rule(rule_func)

        print(f"Closure with entrance object: {result}")

        # Should extract the entrance name
        assert result.get("type") != "error", f"Analysis failed: {result}"

    def test_closure_with_list_of_rules(self):
        """Test closure containing a list of rule functions."""
        player = 1
        path = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: state.has('Sword', player),
        ]

        # Rule that uses all() over the path
        rule_func = lambda state: all(rule(state) for rule in path)
        result = analyze_rule(rule_func)

        print(f"Closure with list of rules: {result}")

        # This pattern is used in path_to_access_rule
        if result.get("type") == "error":
            print(f"  Error: {result.get('message')}")


class TestAnyGeneratorPattern:
    """Tests specifically for the any(rule(state) for rule in options) pattern."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_any_with_simple_rules(self):
        """Test any() over simple item check rules."""
        player = 1
        options = [
            lambda state: state.has('Item1', player),
            lambda state: state.has('Item2', player),
            lambda state: state.has('Item3', player),
        ]

        rule_func = lambda state: any(rule(state) for rule in options)
        result = analyze_rule(rule_func)

        print(f"any() with simple rules: {result}")

        # Should produce an OR of item checks
        assert result.get("type") in ("or", "state_method"), f"Unexpected type: {result.get('type')}"

    def test_all_with_simple_rules(self):
        """Test all() over simple item check rules."""
        player = 1
        path = [
            lambda state: state.has('Item1', player),
            lambda state: state.has('Item2', player),
        ]

        rule_func = lambda state: all(rule(state) for rule in path)
        result = analyze_rule(rule_func)

        print(f"all() with simple rules: {result}")

        # Should produce an AND of item checks
        assert result.get("type") in ("and", "state_method"), f"Unexpected type: {result.get('type')}"

    def test_nested_any_all(self):
        """Test can_reach AND all(path) pattern used in path_to_access_rule."""
        entrance = MockEntrance("Test Entrance")
        player = 1
        path = [lambda state: state.has('Moon Pearl', player)]

        # This is the exact structure of path_to_access_rule's return value
        rule_func = lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player) and all(
            rule(state) for rule in path)

        result = analyze_rule(rule_func)

        print(f"can_reach AND all(path): {result}")

        if result.get("type") == "error":
            print(f"  Error: {result.get('message')}")
        elif result.get("type") == "and":
            print(f"  Conditions: {len(result.get('conditions', []))}")
            for i, cond in enumerate(result.get("conditions", [])):
                print(f"    [{i}] type: {cond.get('type')}")


class TestNestedCallPattern:
    """
    Tests for the exact ALttP nested call pattern.

    This is the pattern from ALttP Rules.py line 1739-1741:
        possible_options.append(lambda state: path_to_access_rule(new_path, entrance)(state))

    The key feature is that the factory result is IMMEDIATELY CALLED with (state).
    This creates a nested Call AST structure where node.func is itself a Call.
    """

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_nested_call_empty_path(self):
        """Test nested call pattern with empty path (simplest case)."""
        entrance = MockEntrance("Superbunny Cave (Top)")
        new_path = []  # Empty path

        # EXACT ALttP pattern: lambda that calls factory then calls result with (state)
        rule_func = lambda state: path_to_access_rule(new_path, entrance)(state)

        print(f"\nClosure vars: {rule_func.__code__.co_freevars}")
        result = analyze_rule(rule_func)

        print(f"Nested call (empty path): {result}")
        print(f"  Type: {result.get('type')}")

        # This should ideally produce the same result as calling path_to_access_rule directly
        # i.e., can_reach AND all(path)

    def test_nested_call_with_item_in_path(self):
        """Test nested call pattern with Moon Pearl in path."""
        player = 1
        entrance = MockEntrance("Superbunny Cave (Top)")
        new_path = [lambda state: state.has('Moon Pearl', player)]

        # EXACT ALttP pattern
        rule_func = lambda state: path_to_access_rule(new_path, entrance)(state)

        result = analyze_rule(rule_func)

        print(f"Nested call (with Moon Pearl): {result}")
        print(f"  Type: {result.get('type')}")

        # Ideally should produce: can_reach(entrance) AND Moon Pearl

    def test_nested_call_in_options(self):
        """
        Test the full ALttP bunny rule pattern:
        options = [Moon Pearl, path_to_access_rule(path, entrance)(state)]
        rule = any(option(state) for option in options)
        """
        player = 1
        entrance = MockEntrance("Kakariko Well Entry")
        new_path = []  # Empty path for superbunny-accessible

        # The first option: just Moon Pearl
        moon_pearl_option = lambda state: state.has('Moon Pearl', player)

        # The second option: the nested call pattern
        # In superbunny case, this should be "just need to reach entrance"
        superbunny_option = lambda state: path_to_access_rule(new_path, entrance)(state)

        possible_options = [moon_pearl_option, superbunny_option]

        # The final rule using options_to_access_rule
        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"Full bunny rule pattern: {result}")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            for i, cond in enumerate(result.get('conditions', [])):
                print(f"  Option {i}: {cond}")

    def test_nested_call_with_entrance_access_rule_in_path(self):
        """
        Test the ACTUAL pattern that causes the Kakariko Well failure.

        The original ALttP code at line 1729 does:
            new_path = path + [entrance.access_rule]

        This means even for superbunny-accessible locations, the entrance's
        access rule is included in the path. For "Inverted Pyramid Hole" with
        access_rule = Or(open_pyramid, Beat Agahnim 2), this produces:

            Or(Moon Pearl, And(CanReachEntrance, Beat Agahnim 2))

        But for superbunny locations in Kakariko Well (top), the correct rule
        should be just:

            Or(Moon Pearl, CanReachEntrance)

        This test demonstrates why the analyzer produces the "wrong" rule -
        it correctly analyzes what the ALttP code does, but the ALttP code
        itself has a limitation where it always includes entrance.access_rule
        in the path, even when it shouldn't for superbunny cases.
        """
        player = 1
        entrance = MockEntrance("Inverted Pyramid Hole")

        # Simulate entrance.access_rule = lambda that checks Beat Agahnim 2
        # (In reality, this is Or(open_pyramid, Beat Agahnim 2), but simplified for test)
        entrance_access_rule = lambda state: state.has('Beat Agahnim 2', player)

        # The ACTUAL path as built by ALttP line 1729: new_path = path + [entrance.access_rule]
        # For the first BFS hop, path = [], so new_path = [entrance.access_rule]
        new_path_with_entrance_rule = [entrance_access_rule]

        # The first option: just Moon Pearl
        moon_pearl_option = lambda state: state.has('Moon Pearl', player)

        # The second option: superbunny path WITH entrance access rule in path
        # This is what ALttP actually builds for Kakariko Well superbunny locations
        superbunny_option_with_rule = lambda state: path_to_access_rule(
            new_path_with_entrance_rule, entrance)(state)

        possible_options = [moon_pearl_option, superbunny_option_with_rule]
        rule_func = options_to_access_rule(possible_options)
        result = analyze_rule(rule_func)

        print(f"\nKakariko Well ACTUAL pattern (with entrance rule in path):")
        print(f"  Result: {result}")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            for i, cond in enumerate(result.get('conditions', [])):
                print(f"  Option {i}: {cond}")

        # The analyzer correctly produces:
        # Or(Moon Pearl, And(CanReachEntrance, Beat Agahnim 2))
        # This is "correct" analysis of the ALttP code, but the ALttP code
        # itself is overly restrictive for superbunny locations.

        # Compare with what SHOULD be the rule (empty path)
        new_path_empty = []  # What superbunny SHOULD use
        superbunny_option_correct = lambda state: path_to_access_rule(
            new_path_empty, entrance)(state)

        possible_options_correct = [
            lambda state: state.has('Moon Pearl', player),
            superbunny_option_correct
        ]
        rule_func_correct = options_to_access_rule(possible_options_correct)
        result_correct = analyze_rule(rule_func_correct)

        print(f"\nKakariko Well EXPECTED pattern (empty path for superbunny):")
        print(f"  Result: {result_correct}")

        # Document the difference
        print(f"\nROOT CAUSE ANALYSIS:")
        print(f"  The ALttP code at line 1729 does: new_path = path + [entrance.access_rule]")
        print(f"  This adds entrance.access_rule even for superbunny locations.")
        print(f"  The analyzer correctly captures this, but the rule is overly restrictive.")
        print(f"  This is a known limitation - the exported rule may be stricter than necessary.")


class TestAnalyzerDiagnostics:
    """Diagnostic tests to understand analyzer behavior."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_lambda_returning_lambda(self):
        """Test what happens when a lambda returns another lambda (the bug pattern)."""
        player = 1
        entrance = MockEntrance("Test")

        # This is the bug: lambda returns a lambda instead of calling it
        inner_factory = lambda: lambda state: state.has('Moon Pearl', player)

        # Outer lambda that returns the inner factory result (a lambda)
        rule_func = lambda state: inner_factory()

        result = analyze_rule(rule_func)

        print(f"Lambda returning lambda: {result}")
        print(f"  Type: {result.get('type')}")

    def test_direct_factory_result(self):
        """Test analyzing the direct result of a function factory."""
        player = 1
        entrance = MockEntrance("Test Entrance")
        path = [lambda state: state.has('Moon Pearl', player)]

        # Get the lambda directly from the factory
        rule_func = path_to_access_rule(path, entrance)

        result = analyze_rule(rule_func)

        print(f"Direct factory result: {result}")
        print(f"  Type: {result.get('type')}")

        if result.get("type") == "and":
            for i, cond in enumerate(result.get("conditions", [])):
                print(f"  Condition {i}: {cond}")

    def test_verbose_closure_info(self):
        """Print detailed closure information for debugging."""
        player = 1
        entrance = MockEntrance("Test Entrance")
        path = [lambda state: state.has('Moon Pearl', player)]

        rule_func = path_to_access_rule(path, entrance)

        # Print closure info
        print(f"\nClosure info for path_to_access_rule result:")
        print(f"  __code__.co_freevars: {rule_func.__code__.co_freevars}")
        if hasattr(rule_func, '__closure__') and rule_func.__closure__:
            for i, cell in enumerate(rule_func.__closure__):
                var_name = rule_func.__code__.co_freevars[i]
                try:
                    val = cell.cell_contents
                    print(f"  {var_name}: {type(val).__name__} = {repr(val)[:100]}")
                except ValueError:
                    print(f"  {var_name}: <empty cell>")

        result = analyze_rule(rule_func)
        print(f"\nAnalysis result: {result}")


class TestOpenPyramidToBool:
    """
    Tests for analyzing the open_pyramid.to_bool() pattern.

    This pattern is used in ALttP's Pyramid Hole entrance rule:
        lambda state: state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid.to_bool(world, player)

    The key challenge is that to_bool() is a method call on an option object,
    and the analyzer needs to:
    1. Recognize world.worlds[player].options.open_pyramid as an option_value
    2. Handle the .to_bool() method call on that option
    3. Evaluate to_bool() at analysis time since it only depends on settings
    """

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_option_to_bool_simple(self):
        """
        Test the simplest version of to_bool pattern:
        world.worlds[player].options.open_pyramid.to_bool(world, player)
        """
        import logging
        logging.getLogger('exporter.analyzer').setLevel(logging.DEBUG)

        # Create mock option with to_bool method
        class MockOption:
            def __init__(self, value):
                self.value = value

            def to_bool(self, world, player):
                return self.value > 0

        class MockOptions:
            def __init__(self):
                self.open_pyramid = MockOption(1)  # "open" = True

        class MockPlayerWorld:
            def __init__(self):
                self.options = MockOptions()

        class MockMultiworld:
            def __init__(self):
                self.worlds = {1: MockPlayerWorld()}

        world = MockMultiworld()
        player = 1

        # The exact pattern from the Pyramid Hole rule
        rule_func = lambda state: world.worlds[player].options.open_pyramid.to_bool(world, player)

        result = analyze_rule(rule_func, closure_vars={'world': world, 'player': player})

        print(f"\nOption to_bool simple pattern:")
        print(f"  Result: {result}")
        print(f"  Type: {result.get('type')}")

        # The ideal outcome: to_bool should be evaluated to True at analysis time
        # If the analyzer properly handles this, result should be {'type': 'constant', 'value': True}
        if result.get('type') == 'constant':
            print(f"  SUCCESS: to_bool evaluated to constant {result.get('value')}")
        else:
            print(f"  ISSUE: to_bool was not evaluated at analysis time")
            print(f"  Full result: {result}")

    def test_pyramid_hole_full_rule(self):
        """
        Test the full Pyramid Hole rule pattern:
        state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid.to_bool(world, player)
        """
        import logging
        logging.getLogger('exporter.analyzer').setLevel(logging.DEBUG)

        # Create mock option with to_bool method (open_pyramid = 1 = open)
        class MockOption:
            def __init__(self, value):
                self.value = value

            def to_bool(self, world, player):
                return self.value > 0

        class MockOptions:
            def __init__(self):
                self.open_pyramid = MockOption(1)

        class MockPlayerWorld:
            def __init__(self):
                self.options = MockOptions()

        class MockMultiworld:
            def __init__(self):
                self.worlds = {1: MockPlayerWorld()}

        world = MockMultiworld()
        player = 1

        # The full Pyramid Hole rule
        rule_func = lambda state: state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid.to_bool(world, player)

        result = analyze_rule(rule_func, closure_vars={'world': world, 'player': player})

        print(f"\nPyramid Hole full rule:")
        print(f"  Result: {result}")
        print(f"  Type: {result.get('type')}")

        # Since open_pyramid.to_bool() returns True, the whole expression should simplify to True
        # OR if partial evaluation: {'type': 'or', 'conditions': [<Beat Agahnim 2>, True]}
        # OR worst case: {'type': 'or', 'conditions': [<Beat Agahnim 2>, <unresolved to_bool>]}
        if result.get('type') == 'constant' and result.get('value') == True:
            print(f"  SUCCESS: Rule fully simplified to True")
        elif result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  OR with {len(conditions)} conditions:")
            for i, cond in enumerate(conditions):
                print(f"    [{i}]: {cond}")
                if cond.get('type') == 'constant' and cond.get('value') == True:
                    print(f"        -> This is the to_bool result (True)")
        else:
            print(f"  Full result: {result}")

    def test_option_to_bool_closed(self):
        """
        Test to_bool when open_pyramid is closed (value = 0).
        The rule should NOT simplify away Beat Agahnim 2.
        """
        # Create mock option with to_bool method (open_pyramid = 0 = closed)
        class MockOption:
            def __init__(self, value):
                self.value = value

            def to_bool(self, world, player):
                return self.value > 0

        class MockOptions:
            def __init__(self):
                self.open_pyramid = MockOption(0)  # closed

        class MockPlayerWorld:
            def __init__(self):
                self.options = MockOptions()

        class MockMultiworld:
            def __init__(self):
                self.worlds = {1: MockPlayerWorld()}

        world = MockMultiworld()
        player = 1

        rule_func = lambda state: state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid.to_bool(world, player)

        result = analyze_rule(rule_func, closure_vars={'world': world, 'player': player})

        print(f"\nPyramid Hole rule (closed):")
        print(f"  Result: {result}")
        print(f"  Type: {result.get('type')}")

        # With open_pyramid closed, the rule should be:
        # OR(Beat Agahnim 2, False) -> which should simplify to just Beat Agahnim 2
        if result.get('type') == 'item_check' and result.get('item') == 'Beat Agahnim 2':
            print(f"  SUCCESS: Rule correctly simplified to just 'Beat Agahnim 2'")
        elif result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  OR with {len(conditions)} conditions - could be optimized")

    def test_option_to_bool_auto_closure_extraction(self):
        """
        Test to_bool pattern with automatic closure variable extraction.

        This simulates what happens during actual export - the closure_vars
        are extracted from the lambda's __closure__, not passed explicitly.
        """
        import logging
        logging.getLogger('exporter.analyzer').setLevel(logging.DEBUG)

        # Create mock option with to_bool method
        class MockOption:
            def __init__(self, value):
                self.value = value

            def to_bool(self, world, player):
                return self.value > 0

        class MockOptions:
            def __init__(self):
                self.open_pyramid = MockOption(1)  # open

        class MockPlayerWorld:
            def __init__(self):
                self.options = MockOptions()

        class MockMultiworld:
            def __init__(self):
                self.worlds = {1: MockPlayerWorld()}

        world = MockMultiworld()
        player = 1

        # Create the lambda - this captures world and player in its closure
        rule_func = lambda state: state.has('Beat Agahnim 2', player) or world.worlds[player].options.open_pyramid.to_bool(world, player)

        # Check what's in the closure
        print(f"\nAuto closure extraction test:")
        print(f"  co_freevars: {rule_func.__code__.co_freevars}")
        if rule_func.__closure__:
            for i, (name, cell) in enumerate(zip(rule_func.__code__.co_freevars, rule_func.__closure__)):
                try:
                    val = cell.cell_contents
                    print(f"  {name}: {type(val).__name__}")
                except ValueError:
                    print(f"  {name}: <empty>")

        # Analyze WITHOUT explicitly passing closure_vars - let it auto-extract
        result = analyze_rule(rule_func)

        print(f"\nResult (auto closure extraction):")
        print(f"  Result: {result}")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'constant' and result.get('value') == True:
            print(f"  SUCCESS: Rule fully simplified to True")
        elif result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  OR with {len(conditions)} conditions:")
            for i, cond in enumerate(conditions):
                print(f"    [{i}]: {cond}")
        else:
            print(f"  Full result: {result}")


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
