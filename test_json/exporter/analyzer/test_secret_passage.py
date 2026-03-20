"""
Test to recreate and analyze the Secret Passage bunny rule pattern.

This tests the exact pattern that causes issues in inverted mode with minor_glitches.
"""

import pytest
from typing import Dict, Any, List, Callable

from exporter.analyzer import analyze_rule, clear_caches, reset_analyze_rule_counter


class MockEntrance:
    """Mock entrance object for testing."""

    def __init__(self, name: str, player: int = 1):
        self.name = name
        self.player = player


def path_to_access_rule(path: List[Callable], entrance: MockEntrance):
    """Recreation of ALttP's path_to_access_rule function factory."""
    return lambda state: state.can_reach(entrance.name, 'Entrance', entrance.player) and all(
        rule(state) for rule in path)


def options_to_access_rule(options: List[Callable]):
    """Recreation of ALttP's options_to_access_rule function."""
    return lambda state: any(rule(state) for rule in options)


class TestSecretPassageBunnyRule:
    """
    Tests recreating the Secret Passage bunny rule that fails.

    In inverted mode with minor_glitches, the bunny rule for Secret Passage is:
    - Moon Pearl (base option), OR
    - (path_to_access_rule(path, entrance) AND Magic Mirror) for superbunny access

    The issue is that the BFS finds a path through Inverted Pyramid Hole which
    has an access rule requiring 'Beat Agahnim 2'. This makes the exported rule
    too restrictive.
    """

    def setup_method(self):
        clear_caches()
        reset_analyze_rule_counter()

    def test_secret_passage_with_beat_agahnim_2_path(self):
        """
        Test the exact pattern causing the issue.

        The BFS finds a path through Inverted Pyramid Hole, which has access rule:
        lambda state: state.has('Beat Agahnim 2', player) or world.options.open_pyramid

        The analyzer captures the Beat Agahnim 2 requirement, creating an
        over-restrictive rule.
        """
        player = 1

        # The entrance found by BFS - Inverted Pyramid Hole
        entrance = MockEntrance('Inverted Pyramid Hole')

        # The path contains the access rule for the entrance (Beat Agahnim 2)
        new_path = [lambda state: state.has('Beat Agahnim 2', player)]

        # For superbunny locations like Secret Passage, the rule is:
        # Moon Pearl OR (path_to_access_rule(path, entrance) AND Magic Mirror)
        possible_options = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: path_to_access_rule(new_path, entrance)(state) and state.has('Magic Mirror', player)
        ]

        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"\nSecret Passage with Beat Agahnim 2 path:")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  Number of options: {len(conditions)}")
            for i, cond in enumerate(conditions):
                print(f"  Option {i}: {cond}")

        # The problem: This produces a rule that requires Beat Agahnim 2
        # for the superbunny path, but there are OTHER valid paths that don't
        # require Beat Agahnim 2.

    def test_secret_passage_ideal_result(self):
        """
        Test what the ideal result should be.

        For superbunny locations in inverted mode, the correct rule should be:
        - Moon Pearl, OR
        - (can reach the location from any link-state region) AND Magic Mirror

        Since region reachability is handled separately, this simplifies to:
        - Moon Pearl OR Magic Mirror
        """
        player = 1

        # Ideal simple rule for superbunny locations
        possible_options = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: state.has('Magic Mirror', player)
        ]

        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"\nSecret Passage ideal result:")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  Number of options: {len(conditions)}")
            for i, cond in enumerate(conditions):
                print(f"  Option {i}: {cond}")

        # This should produce: Moon Pearl OR Magic Mirror

    def test_analyze_nested_call_with_and(self):
        """
        Test analyzing the pattern: path_to_access_rule(path, entrance)(state) AND Magic Mirror

        This is the exact pattern used for superbunny locations.
        """
        player = 1
        entrance = MockEntrance('Inverted Pyramid Hole')
        new_path = [lambda state: state.has('Beat Agahnim 2', player)]

        # The superbunny option
        rule_func = lambda state: path_to_access_rule(new_path, entrance)(state) and state.has('Magic Mirror', player)

        result = analyze_rule(rule_func)

        print(f"\nNested call with AND:")
        print(f"  Type: {result.get('type')}")
        print(f"  Full result: {result}")

    def test_analyze_function_call_type(self):
        """
        Test how the function_call type is produced and what it contains.

        When analyzing: lambda state: path_to_access_rule(path, entrance)(state)
        The analyzer produces a 'function_call' type.
        """
        player = 1
        entrance = MockEntrance('Test Entrance')
        new_path = [lambda state: state.has('Some Item', player)]

        rule_func = lambda state: path_to_access_rule(new_path, entrance)(state)

        result = analyze_rule(rule_func)

        print(f"\nFunction call type analysis:")
        print(f"  Type: {result.get('type')}")
        print(f"  Full result: {result}")

        if result.get('type') == 'function_call':
            function = result.get('function', {})
            print(f"  Function rule: {function.get('rule')}")
            if function.get('rule') == 'And':
                children = function.get('children', [])
                print(f"  Children count: {len(children)}")
                for i, child in enumerate(children):
                    print(f"    Child {i}: {child}")

    def test_multiple_paths_scenario(self):
        """
        Test what happens when there are multiple paths in possible_options.

        In the real game, the BFS might find multiple paths to link-state regions.
        Each path would add an option to possible_options.
        """
        player = 1

        entrance1 = MockEntrance('Inverted Pyramid Hole')
        path1 = [lambda state: state.has('Beat Agahnim 2', player)]

        entrance2 = MockEntrance('Post Aga Teleporter')
        path2 = [lambda state: state.has('Beat Agahnim 1', player)]

        entrance3 = MockEntrance('Hammer Peg Area')
        path3 = [
            lambda state: state.has('Hammer', player),
            lambda state: state.has('Titans Mitts', player)
        ]

        # If the BFS found all three paths, the options would be:
        possible_options = [
            lambda state: state.has('Moon Pearl', player),
            lambda state: path_to_access_rule(path1, entrance1)(state) and state.has('Magic Mirror', player),
            lambda state: path_to_access_rule(path2, entrance2)(state) and state.has('Magic Mirror', player),
            lambda state: path_to_access_rule(path3, entrance3)(state) and state.has('Magic Mirror', player),
        ]

        rule_func = options_to_access_rule(possible_options)

        result = analyze_rule(rule_func)

        print(f"\nMultiple paths scenario:")
        print(f"  Type: {result.get('type')}")

        if result.get('type') == 'or':
            conditions = result.get('conditions', [])
            print(f"  Number of options: {len(conditions)}")
            for i, cond in enumerate(conditions):
                cond_type = cond.get('type') or cond.get('rule')
                print(f"  Option {i} type: {cond_type}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
