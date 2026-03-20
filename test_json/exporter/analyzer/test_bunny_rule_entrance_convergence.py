"""
Tests for analyzing bunny rules when multiple paths converge to the same entrance.

This reproduces the seed 850 failure pattern where:
- Path A from Superbunny Cave (Bottom): CanReachEntrance(X) - no Mirror needed
- Path B from elsewhere: And(CanReachEntrance(X), Has(Mirror)) - Mirror needed
- Both paths use the SAME entrance X due to entrance shuffle

When ORed together, this should NOT simplify to just CanReachEntrance(X)
because the paths have different validity conditions.
"""

import pytest
from typing import Dict, Any, List, Callable

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter
from exporter.analyzer.closure_function_analyzer import ClosureFunctionAnalyzer


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


def path_to_access_rule(path: List[Callable], entrance: MockEntrance):
    """
    Recreation of ALttP's path_to_access_rule function factory.
    """
    return lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player) and all(
        rule(state) for rule in path)


def options_to_access_rule(options: List[Callable]):
    """
    Recreation of ALttP's options_to_access_rule function.
    """
    return lambda state: any(rule(state) for rule in options)


class TestEntranceConvergence:
    """Tests for when multiple paths converge to the same entrance."""

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_same_entrance_different_conditions(self):
        """
        Test the exact pattern that caused seed 850 failure.

        Two paths to the same entrance with different conditions:
        - Path from Bottom: just CanReachEntrance(X)
        - Path from elsewhere: And(CanReachEntrance(X), Has(Mirror))

        When ORed together, if both use the SAME entrance X, the standalone
        dominates and makes Mirror seem optional.
        """
        player = 1

        # Simulate two paths that converge to the SAME shuffled entrance
        # This happens when entrance shuffle maps multiple logical paths to one physical entrance
        shared_entrance = MockEntrance("Lost Woods Gamble")

        # Path access rules (simulating different BFS paths)
        bottom_access_rule = lambda state: True  # Simplified
        other_access_rule = lambda state: True

        # Path 1: From Superbunny Cave (Bottom) - no Mirror needed
        # new_path = [bottom_access_rule]
        new_path_from_bottom = [bottom_access_rule]
        superbunny_option = lambda state: path_to_access_rule(new_path_from_bottom, shared_entrance)(state)

        # Path 2: From elsewhere - needs Mirror
        # new_path = [other_access_rule]
        new_path_from_other = [other_access_rule]
        mirror_option = lambda state: path_to_access_rule(new_path_from_other, shared_entrance)(state) and state.has('Magic Mirror', player)

        # Base option: Moon Pearl
        moon_pearl_option = lambda state: state.has('Moon Pearl', player)

        # The full rule: Or(Moon Pearl, superbunny_path, mirror_path)
        possible_options = [moon_pearl_option, superbunny_option, mirror_option]
        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"\nConverging paths result: {result}")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  Num conditions: {len(conditions)}")
            for i, cond in enumerate(conditions):
                print(f"    [{i}]: {cond}")

            # Check if we have redundant conditions
            # The superbunny_option and mirror_option both reference the same entrance
            # If simplified, we might end up with just CanReachEntrance("Lost Woods Gamble")
            # which makes the Mirror requirement disappear
            entrance_conditions = [c for c in conditions
                                   if c.get('rule') == 'CanReachEntrance' or
                                   c.get('type') == 'function_call' and
                                   c.get('function', {}).get('rule') == 'CanReachEntrance']
            and_conditions = [c for c in conditions if c.get('type') == 'and' or c.get('rule') == 'And']

            print(f"\n  Standalone entrance conditions: {len(entrance_conditions)}")
            print(f"  And conditions: {len(and_conditions)}")

            if entrance_conditions and and_conditions:
                print(f"\n  WARNING: Both standalone and And conditions exist")
                print(f"  If they reference the same entrance, the standalone makes And redundant")

        # The test passes if analysis completes - we're documenting the behavior
        assert result.get('type') != 'error', f"Analysis failed: {result}"

    def test_entrance_dominance_detection(self):
        """
        Test that we can detect when CanReachEntrance(X) would dominate
        And(CanReachEntrance(X), Has(Y)).

        In an OR context, CanReachEntrance(X) dominates And(CanReachEntrance(X), ...)
        because if you can reach X, that's sufficient.
        """
        player = 1
        entrance = MockEntrance("Test Entrance")

        # Create options that would produce the problematic pattern
        # Option 1: Just reach the entrance
        path1 = []  # Empty path
        option1 = path_to_access_rule(path1, entrance)

        # Option 2: Reach entrance AND have Mirror
        path2 = []
        option2 = lambda state: path_to_access_rule(path2, entrance)(state) and state.has('Magic Mirror', player)

        possible_options = [option1, option2]
        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"\nDominance test result: {result}")
        print(f"  Type: {result.get('type')}")

        # The standalone CanReachEntrance should dominate the And
        # So we should end up with just CanReachEntrance (or maybe True if path is empty)
        if result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  Conditions: {conditions}")
            # If we have both standalone and And, dominance wasn't applied

        assert result.get('type') != 'error', f"Analysis failed: {result}"


class TestClosureFunctionAnalyzerDominance:
    """Test the dominance pruning in ClosureFunctionAnalyzer."""

    def test_can_reach_entrance_should_dominate_and(self):
        """
        CanReachEntrance(X) should dominate And(CanReachEntrance(X), Has(Y))
        when they're in an OR context with the same entrance X.
        """
        from exporter.analyzer.closure_function_analyzer import ClosureFunctionAnalyzer
        from unittest.mock import MagicMock

        # Create a mock parent analyzer
        parent = MagicMock()
        parent.game_handler = None

        analyzer = ClosureFunctionAnalyzer(parent)

        # Test case: Or conditions with both standalone and And
        conditions = [
            {'rule': 'CanReachEntrance', 'args': {'entrance_name': 'Entrance X'}},
            {'rule': 'And', 'children': [
                {'rule': 'CanReachEntrance', 'args': {'entrance_name': 'Entrance X'}},
                {'rule': 'Has', 'args': {'item_name': 'Magic Mirror'}}
            ]},
            {'rule': 'Has', 'args': {'item_name': 'Moon Pearl'}}
        ]

        # Current simplify_or_conditions behavior
        result = analyzer._simplify_or_conditions(conditions)

        print(f"\nSimplify OR conditions result: {result}")
        print(f"  Num conditions: {len(result)}")
        for i, cond in enumerate(result):
            print(f"    [{i}]: {cond}")

        # Check if dominance was detected
        has_standalone_entrance = any(
            c.get('rule') == 'CanReachEntrance' and c.get('args', {}).get('entrance_name') == 'Entrance X'
            for c in result
        )
        has_and_with_same_entrance = any(
            c.get('rule') == 'And' and
            any(child.get('rule') == 'CanReachEntrance' and
                child.get('args', {}).get('entrance_name') == 'Entrance X'
                for child in c.get('children', []))
            for c in result
        )

        print(f"\n  Has standalone CanReachEntrance(X): {has_standalone_entrance}")
        print(f"  Has And with CanReachEntrance(X): {has_and_with_same_entrance}")

        if has_standalone_entrance and has_and_with_same_entrance:
            print(f"\n  ISSUE: Both standalone and And exist - dominance not applied")
            print(f"  The And should be pruned since standalone CanReachEntrance dominates")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
