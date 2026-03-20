"""
Round-trip conversion tests for Rule Builder <-> AST format converters.

Tests that:
- B → A → B produces identical results for Rule Builder input
- A → B → A produces identical results for AST input (where possible)
"""

import unittest
import json
from .rule_builder_to_ast import RuleBuilderToAST, convert_rule_builder_to_ast
from .ast_to_rule_builder import ASTToRuleBuilder, convert_ast_to_rule_builder


class TestRoundTripBtoAtoB(unittest.TestCase):
    """Test that Rule Builder → AST → Rule Builder produces identical output."""

    def setUp(self):
        self.b_to_a = RuleBuilderToAST()
        self.a_to_b = ASTToRuleBuilder()

    def _round_trip_b_a_b(self, rule_b):
        """Convert B → A → B and return result."""
        result_a = self.b_to_a.convert(rule_b)
        result_b = self.a_to_b.convert(result_a.rule)
        return result_b.rule

    def test_true_round_trip(self):
        """Test True_ round-trips correctly."""
        original = {"rule": "True_", "options": [], "args": {}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_false_round_trip(self):
        """Test False_ round-trips correctly."""
        original = {"rule": "False_", "options": [], "args": {}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_has_simple_round_trip(self):
        """Test simple Has rule round-trips correctly."""
        original = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_has_with_count_round_trip(self):
        """Test Has with count round-trips correctly."""
        original = {"rule": "Has", "options": [], "args": {"item_name": "Arrow", "count": 10}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_has_all_round_trip(self):
        """Test HasAll round-trips correctly."""
        original = {"rule": "HasAll", "options": [], "args": {"items": ["Key1", "Key2", "Key3"]}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result["rule"], "HasAll")
        # Items may be sorted
        self.assertEqual(sorted(result["args"]["items"]), sorted(original["args"]["items"]))

    def test_has_any_round_trip(self):
        """Test HasAny round-trips correctly."""
        original = {"rule": "HasAny", "options": [], "args": {"items": ["Sword", "Axe"]}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result["rule"], "HasAny")
        self.assertEqual(sorted(result["args"]["items"]), sorted(original["args"]["items"]))

    def test_has_all_counts_round_trip(self):
        """Test HasAllCounts round-trips correctly."""
        original = {"rule": "HasAllCounts", "options": [], "args": {"items": {"Sword": 2, "Shield": 1}}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result["rule"], "HasAllCounts")
        self.assertEqual(result["args"]["items"], original["args"]["items"])

    def test_has_group_round_trip(self):
        """Test HasGroup round-trips correctly."""
        original = {"rule": "HasGroup", "options": [], "args": {"group": "Keys", "count": 3}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_has_group_default_count_round_trip(self):
        """Test HasGroup with default count round-trips correctly."""
        original = {"rule": "HasGroup", "options": [], "args": {"group": "Weapons"}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result["rule"], "HasGroup")
        self.assertEqual(result["args"]["group"], "Weapons")

    def test_can_reach_region_round_trip(self):
        """Test CanReachRegion round-trips correctly."""
        original = {"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_can_reach_location_round_trip(self):
        """Test CanReachLocation round-trips correctly."""
        original = {"rule": "CanReachLocation", "options": [], "args": {"location_name": "Chest1"}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_can_reach_entrance_round_trip(self):
        """Test CanReachEntrance round-trips correctly."""
        original = {"rule": "CanReachEntrance", "options": [], "args": {"entrance_name": "Door1"}}
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result, original)

    def test_and_round_trip(self):
        """Test And rule round-trips correctly.

        Note: And([Has(X), Has(Y)]) is optimized to HasAll([X, Y]).
        """
        original = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "Has", "options": [], "args": {"item_name": "Shield"}}
            ]
        }
        result = self._round_trip_b_a_b(original)
        # Optimization: And([Has, Has]) -> HasAll
        self.assertEqual(result["rule"], "HasAll")
        self.assertEqual(sorted(result["args"]["items"]), ["Shield", "Sword"])

    def test_or_round_trip(self):
        """Test Or rule round-trips correctly.

        Note: Or([Has(X), Has(Y)]) is optimized to HasAny([X, Y]).
        """
        original = {
            "rule": "Or",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "Has", "options": [], "args": {"item_name": "Axe"}}
            ]
        }
        result = self._round_trip_b_a_b(original)
        # Optimization: Or([Has, Has]) -> HasAny
        self.assertEqual(result["rule"], "HasAny")
        self.assertEqual(sorted(result["args"]["items"]), ["Axe", "Sword"])

    def test_nested_composite_round_trip(self):
        """Test nested And/Or rules round-trip correctly.

        Note: Nested Or([Has, Has]) is optimized to HasAny.
        """
        original = {
            "rule": "And",
            "options": [],
            "children": [
                {
                    "rule": "Or",
                    "options": [],
                    "children": [
                        {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                        {"rule": "Has", "options": [], "args": {"item_name": "Axe"}}
                    ]
                },
                {"rule": "Has", "options": [], "args": {"item_name": "Shield"}}
            ]
        }
        result = self._round_trip_b_a_b(original)
        self.assertEqual(result["rule"], "And")
        self.assertEqual(len(result["children"]), 2)
        # Nested Or([Has, Has]) -> HasAny optimization
        self.assertEqual(result["children"][0]["rule"], "HasAny")

    def test_custom_rule_round_trip(self):
        """Test custom/unknown rules round-trip via helper preservation."""
        original = {
            "rule": "CustomGameRule",
            "options": [],
            "args": {"custom_param": "value", "number": 42}
        }
        result = self._round_trip_b_a_b(original)
        # Custom rules should round-trip via the _converted_from_rule_builder metadata
        self.assertEqual(result["rule"], "CustomGameRule")
        self.assertEqual(result["args"], original["args"])


class TestRoundTripAtoBtoA(unittest.TestCase):
    """Test that AST → Rule Builder → AST produces identical/equivalent output."""

    def setUp(self):
        self.a_to_b = ASTToRuleBuilder()
        self.b_to_a = RuleBuilderToAST()

    def _round_trip_a_b_a(self, rule_a):
        """Convert A → B → A and return result."""
        result_b = self.a_to_b.convert(rule_a)
        result_a = self.b_to_a.convert(result_b.rule)
        return result_a.rule

    def test_constant_true_round_trip(self):
        """Test constant true round-trips correctly."""
        original = {"type": "constant", "value": True}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_constant_false_round_trip(self):
        """Test constant false round-trips correctly."""
        original = {"type": "constant", "value": False}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_item_check_simple_round_trip(self):
        """Test simple item_check round-trips correctly."""
        original = {"type": "item_check", "item": "Sword"}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_item_check_with_count_round_trip(self):
        """Test item_check with count round-trips correctly."""
        original = {"type": "item_check", "item": "Arrow", "count": 10}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_group_check_round_trip(self):
        """Test group_check round-trips correctly."""
        original = {"type": "group_check", "group": "Keys", "count": 3}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_can_reach_round_trip(self):
        """Test can_reach round-trips correctly."""
        original = {"type": "can_reach", "region": "Castle"}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_location_check_round_trip(self):
        """Test location_check round-trips correctly."""
        original = {"type": "location_check", "location": "Chest1"}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_can_reach_entrance_round_trip(self):
        """Test can_reach_entrance round-trips correctly."""
        original = {"type": "can_reach_entrance", "entrance": "Door1"}
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result, original)

    def test_and_round_trip(self):
        """Test and rule round-trips correctly.

        Note: and([item_check, item_check]) is optimized to has_all via HasAll.
        """
        original = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Shield"}
            ]
        }
        result = self._round_trip_a_b_a(original)
        # Optimization: and([item_check, item_check]) -> HasAll -> state_method.has_all
        self.assertEqual(result["type"], "state_method")
        self.assertEqual(result["method"], "has_all")

    def test_or_round_trip(self):
        """Test or rule round-trips correctly.

        Note: or([item_check, item_check]) is optimized to has_any via HasAny.
        """
        original = {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Axe"}
            ]
        }
        result = self._round_trip_a_b_a(original)
        # Optimization: or([item_check, item_check]) -> HasAny -> state_method.has_any
        self.assertEqual(result["type"], "state_method")
        self.assertEqual(result["method"], "has_any")

    def test_nested_composite_round_trip(self):
        """Test nested and/or rules round-trip correctly.

        Note: Nested or([item_check, item_check]) is optimized to has_any.
        The outer and is preserved since it has mixed children.
        """
        original = {
            "type": "and",
            "conditions": [
                {
                    "type": "or",
                    "conditions": [
                        {"type": "item_check", "item": "Sword"},
                        {"type": "item_check", "item": "Axe"}
                    ]
                },
                {"type": "item_check", "item": "Shield"}
            ]
        }
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result["type"], "and")
        self.assertEqual(len(result["conditions"]), 2)
        # Nested or is optimized to has_any
        self.assertEqual(result["conditions"][0]["type"], "state_method")
        self.assertEqual(result["conditions"][0]["method"], "has_any")

    def test_state_method_has_all_round_trip(self):
        """Test state_method has_all round-trips correctly."""
        original = {
            "type": "state_method",
            "method": "has_all",
            "args": [{"type": "constant", "value": ["Key1", "Key2"]}]
        }
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result["type"], "state_method")
        self.assertEqual(result["method"], "has_all")

    def test_state_method_has_any_round_trip(self):
        """Test state_method has_any round-trips correctly."""
        original = {
            "type": "state_method",
            "method": "has_any",
            "args": [{"type": "constant", "value": ["A", "B"]}]
        }
        result = self._round_trip_a_b_a(original)
        self.assertEqual(result["type"], "state_method")
        self.assertEqual(result["method"], "has_any")


class TestASTToRuleBuilder(unittest.TestCase):
    """Test individual A → B conversions."""

    def setUp(self):
        self.converter = ASTToRuleBuilder()

    def test_constant_true(self):
        """Test constant true conversion."""
        rule = {"type": "constant", "value": True}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "True_", "options": [], "args": {}})

    def test_constant_false(self):
        """Test constant false conversion."""
        rule = {"type": "constant", "value": False}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "False_", "options": [], "args": {}})

    def test_item_check_simple(self):
        """Test simple item_check conversion."""
        rule = {"type": "item_check", "item": "Sword"}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "Has", "options": [], "args": {"item_name": "Sword"}})

    def test_item_check_with_count(self):
        """Test item_check with count conversion."""
        rule = {"type": "item_check", "item": "Arrow", "count": 10}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "Has", "options": [], "args": {"item_name": "Arrow", "count": 10}})

    def test_group_check(self):
        """Test group_check conversion."""
        rule = {"type": "group_check", "group": "Keys", "count": 3}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "HasGroup", "options": [], "args": {"group": "Keys", "count": 3}})

    def test_can_reach(self):
        """Test can_reach conversion."""
        rule = {"type": "can_reach", "region": "Castle"}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}})

    def test_location_check(self):
        """Test location_check conversion."""
        rule = {"type": "location_check", "location": "Chest1"}
        result = self.converter.convert(rule)
        self.assertEqual(result.rule, {"rule": "CanReachLocation", "options": [], "args": {"location_name": "Chest1"}})

    def test_and_rule(self):
        """Test and rule conversion.

        Note: and([item_check, item_check]) is optimized to HasAll.
        """
        rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Shield"}
            ]
        }
        result = self.converter.convert(rule)
        # Optimization: and([item_check, item_check]) -> HasAll
        self.assertEqual(result.rule["rule"], "HasAll")
        self.assertEqual(sorted(result.rule["args"]["items"]), ["Shield", "Sword"])

    def test_or_rule(self):
        """Test or rule conversion.

        Note: or([item_check, item_check]) is optimized to HasAny.
        """
        rule = {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {"type": "item_check", "item": "Axe"}
            ]
        }
        result = self.converter.convert(rule)
        # Optimization: or([item_check, item_check]) -> HasAny
        self.assertEqual(result.rule["rule"], "HasAny")
        self.assertEqual(sorted(result.rule["args"]["items"]), ["Axe", "Sword"])

    def test_state_method_has_all(self):
        """Test state_method has_all conversion."""
        rule = {
            "type": "state_method",
            "method": "has_all",
            "args": [{"type": "constant", "value": ["Key1", "Key2"]}]
        }
        result = self.converter.convert(rule)
        self.assertEqual(result.rule["rule"], "HasAll")
        self.assertEqual(result.rule["args"]["items"], ["Key1", "Key2"])

    def test_state_method_has_any(self):
        """Test state_method has_any conversion."""
        rule = {
            "type": "state_method",
            "method": "has_any",
            "args": [{"type": "constant", "value": ["A", "B"]}]
        }
        result = self.converter.convert(rule)
        self.assertEqual(result.rule["rule"], "HasAny")
        self.assertEqual(result.rule["args"]["items"], ["A", "B"])

    def test_helper_preserved(self):
        """Test helper rules are preserved as custom rules."""
        rule = {"type": "helper", "name": "canSwim", "args": []}
        result = self.converter.convert(rule)
        self.assertTrue(result.rule.get("_converted_from_ast"))
        self.assertEqual(len(result.warnings), 1)

    def test_conditional_with_option_filter(self):
        """Test conditional rule with option filter is converted correctly."""
        rule = {
            "type": "conditional",
            "test": {
                "type": "compare",
                "left": {
                    "type": "attribute",
                    "object": {"type": "name", "name": "options"},
                    "attr": "Difficulty"
                },
                "op": ">=",
                "right": {"type": "constant", "value": 2}
            },
            "if_true": {"type": "item_check", "item": "Armor"},
            "if_false": {"type": "constant", "value": True}
        }
        result = self.converter.convert(rule)
        self.assertEqual(result.rule["rule"], "Has")
        self.assertEqual(len(result.rule["options"]), 1)
        self.assertEqual(result.rule["options"][0]["option"], "Difficulty")
        self.assertEqual(result.rule["options"][0]["op"], "ge")
        self.assertEqual(result.rule["options"][0]["value"], 2)


if __name__ == '__main__':
    unittest.main()
