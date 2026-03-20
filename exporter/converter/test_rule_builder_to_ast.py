"""
Unit tests for Rule Builder to AST format converter.
"""

import unittest
from .rule_builder_to_ast import RuleBuilderToAST, convert_rule_builder_to_ast, convert_rules_file_to_ast


class TestBooleanRules(unittest.TestCase):
    """Test conversion of boolean rules."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_true_rule(self):
        """Test True_ rule conversion."""
        rule = {"rule": "True_", "options": [], "args": {}}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": True})

    def test_false_rule(self):
        """Test False_ rule conversion."""
        rule = {"rule": "False_", "options": [], "args": {}}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": False})


class TestItemRules(unittest.TestCase):
    """Test conversion of item-related rules."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_has_simple(self):
        """Test Has rule with default count."""
        rule = {
            "rule": "Has",
            "options": [],
            "args": {"item_name": "Sword"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "item_check", "item": "Sword"})

    def test_has_with_count(self):
        """Test Has rule with explicit count."""
        rule = {
            "rule": "Has",
            "options": [],
            "args": {"item_name": "Arrow", "count": 10}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "item_check", "item": "Arrow", "count": 10})

    def test_has_all(self):
        """Test HasAll rule conversion."""
        rule = {
            "rule": "HasAll",
            "options": [],
            "args": {"items": ["Key1", "Key2", "Key3"]}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "state_method")
        self.assertEqual(result.rule["method"], "has_all")
        # Items should be sorted
        self.assertEqual(result.rule["args"][0]["value"], ["Key1", "Key2", "Key3"])

    def test_has_all_empty(self):
        """Test HasAll with empty items list."""
        rule = {
            "rule": "HasAll",
            "options": [],
            "args": {"items": []}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": True})

    def test_has_any(self):
        """Test HasAny rule conversion."""
        rule = {
            "rule": "HasAny",
            "options": [],
            "args": {"items": ["Sword", "Axe"]}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "state_method")
        self.assertEqual(result.rule["method"], "has_any")

    def test_has_any_empty(self):
        """Test HasAny with empty items list."""
        rule = {
            "rule": "HasAny",
            "options": [],
            "args": {"items": []}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": False})

    def test_has_all_counts(self):
        """Test HasAllCounts rule conversion."""
        rule = {
            "rule": "HasAllCounts",
            "options": [],
            "args": {"items": {"Sword": 2, "Shield": 1}}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "state_method")
        self.assertEqual(result.rule["method"], "has_all_counts")
        # Keys should be sorted
        self.assertEqual(list(result.rule["args"][0]["value"].keys()), ["Shield", "Sword"])

    def test_has_any_count(self):
        """Test HasAnyCount rule conversion."""
        rule = {
            "rule": "HasAnyCount",
            "options": [],
            "args": {"items": {"Sword": 2, "Axe": 3}}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "or")
        self.assertEqual(len(result.rule["conditions"]), 2)

    def test_has_group(self):
        """Test HasGroup rule conversion."""
        rule = {
            "rule": "HasGroup",
            "options": [],
            "args": {"group": "Keys", "count": 3}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "group_check", "group": "Keys", "count": 3})

    def test_has_group_default_count(self):
        """Test HasGroup with default count."""
        rule = {
            "rule": "HasGroup",
            "options": [],
            "args": {"group": "Weapons"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "group_check", "group": "Weapons"})

    def test_has_from_list(self):
        """Test HasFromList rule conversion."""
        rule = {
            "rule": "HasFromList",
            "options": [],
            "args": {"items": ["A", "B", "C"], "count": 2}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "state_method")
        self.assertEqual(result.rule["method"], "has_from_list")


class TestCompositeRules(unittest.TestCase):
    """Test conversion of composite rules (And, Or)."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_and_simple(self):
        """Test And rule with simple children."""
        rule = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "Has", "options": [], "args": {"item_name": "Shield"}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "and")
        self.assertEqual(len(result.rule["conditions"]), 2)
        self.assertEqual(result.rule["conditions"][0], {"type": "item_check", "item": "Sword"})
        self.assertEqual(result.rule["conditions"][1], {"type": "item_check", "item": "Shield"})

    def test_and_empty(self):
        """Test And with no children."""
        rule = {"rule": "And", "options": [], "children": []}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": True})

    def test_and_single_child(self):
        """Test And with single child (should unwrap)."""
        rule = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "item_check", "item": "Sword"})

    def test_and_with_true_children(self):
        """Test And with True_ children (should be filtered)."""
        rule = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "True_", "options": [], "args": {}},
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "True_", "options": [], "args": {}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "item_check", "item": "Sword"})

    def test_and_with_false_child(self):
        """Test And with False_ child (should short-circuit)."""
        rule = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "False_", "options": [], "args": {}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": False})

    def test_or_simple(self):
        """Test Or rule with simple children."""
        rule = {
            "rule": "Or",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "Has", "options": [], "args": {"item_name": "Axe"}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "or")
        self.assertEqual(len(result.rule["conditions"]), 2)

    def test_or_empty(self):
        """Test Or with no children."""
        rule = {"rule": "Or", "options": [], "children": []}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": False})

    def test_or_with_true_child(self):
        """Test Or with True_ child (should short-circuit)."""
        rule = {
            "rule": "Or",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}},
                {"rule": "True_", "options": [], "args": {}}
            ]
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": True})

    def test_nested_composite(self):
        """Test nested And/Or rules."""
        rule = {
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
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "and")
        self.assertEqual(len(result.rule["conditions"]), 2)
        self.assertEqual(result.rule["conditions"][0]["type"], "or")


class TestReachabilityRules(unittest.TestCase):
    """Test conversion of reachability rules."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_can_reach_region(self):
        """Test CanReachRegion rule conversion."""
        rule = {
            "rule": "CanReachRegion",
            "options": [],
            "args": {"region_name": "Castle"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "can_reach", "region": "Castle"})

    def test_can_reach_location(self):
        """Test CanReachLocation rule conversion."""
        rule = {
            "rule": "CanReachLocation",
            "options": [],
            "args": {"location_name": "Chest in Castle"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "location_check", "location": "Chest in Castle"})

    def test_can_reach_entrance(self):
        """Test CanReachEntrance rule conversion."""
        rule = {
            "rule": "CanReachEntrance",
            "options": [],
            "args": {"entrance_name": "Castle Door"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "can_reach_entrance", "entrance": "Castle Door"})


class TestOptionFilters(unittest.TestCase):
    """Test conversion of rules with option filters."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_rule_with_option_eq(self):
        """Test rule with equality option filter."""
        rule = {
            "rule": "Has",
            "options": [{"option": "Difficulty", "op": "eq", "value": "hard"}],
            "args": {"item_name": "Sword"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "conditional")
        self.assertEqual(result.rule["if_true"]["type"], "item_check")
        self.assertEqual(result.rule["if_false"], {"type": "constant", "value": True})

    def test_rule_with_multiple_options(self):
        """Test rule with multiple option filters."""
        rule = {
            "rule": "Has",
            "options": [
                {"option": "Difficulty", "op": "eq", "value": "hard"},
                {"option": "Mode", "op": "ne", "value": "easy"}
            ],
            "args": {"item_name": "Sword"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "conditional")
        self.assertEqual(result.rule["test"]["type"], "and")
        self.assertEqual(len(result.rule["test"]["conditions"]), 2)


class TestUnknownRules(unittest.TestCase):
    """Test conversion of unknown/custom rules."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_unknown_rule(self):
        """Test unknown rule type is preserved as helper."""
        rule = {
            "rule": "CustomGameRule",
            "options": [],
            "args": {"custom_param": "value"}
        }
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "helper")
        self.assertEqual(result.rule["name"], "CustomGameRule")
        self.assertTrue(result.rule.get("_converted_from_rule_builder"))
        self.assertEqual(len(result.warnings), 1)
        self.assertIn("Unknown rule type", result.warnings[0])

    def test_already_ast_format(self):
        """Test that rules already in AST format are passed through."""
        rule = {"type": "item_check", "item": "Sword"}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, rule)


class TestConvenienceFunctions(unittest.TestCase):
    """Test convenience functions."""

    def test_convert_rule_builder_to_ast(self):
        """Test the single-rule convenience function."""
        rule = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        converted, warnings = convert_rule_builder_to_ast(rule)

        self.assertEqual(converted, {"type": "item_check", "item": "Sword"})
        self.assertEqual(len(warnings), 0)

    def test_convert_rules_file_to_ast(self):
        """Test the full file conversion function."""
        data = {
            "schema_version": 3,
            "regions": {
                "1": {
                    "TestRegion": {
                        "name": "TestRegion",
                        "exits": [
                            {
                                "name": "Exit1",
                                "access_rule": {
                                    "rule": "Has",
                                    "options": [],
                                    "args": {"item_name": "Key"}
                                }
                            }
                        ],
                        "locations": [
                            {
                                "name": "Chest",
                                "access_rule": {
                                    "rule": "True_",
                                    "options": [],
                                    "args": {}
                                }
                            }
                        ]
                    }
                }
            }
        }

        converted, warnings = convert_rules_file_to_ast(data)

        self.assertEqual(converted["schema_version"], 3)
        exit_rule = converted["regions"]["1"]["TestRegion"]["exits"][0]["access_rule"]
        self.assertEqual(exit_rule, {"type": "item_check", "item": "Key"})

        location_rule = converted["regions"]["1"]["TestRegion"]["locations"][0]["access_rule"]
        self.assertEqual(location_rule, {"type": "constant", "value": True})


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and error handling."""

    def setUp(self):
        self.converter = RuleBuilderToAST()

    def test_none_rule(self):
        """Test handling of None values."""
        result = self.converter.convert(None)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": None})

    def test_primitive_value(self):
        """Test handling of primitive values."""
        result = self.converter.convert(42)

        self.assertTrue(result.success)
        self.assertEqual(result.rule, {"type": "constant", "value": 42})

    def test_missing_args(self):
        """Test handling of rule with missing args."""
        rule = {"rule": "Has", "options": []}
        result = self.converter.convert(rule)

        self.assertTrue(result.success)
        self.assertEqual(result.rule["type"], "item_check")
        self.assertEqual(result.rule["item"], "")

    def test_deeply_nested_rules(self):
        """Test handling of deeply nested rules."""
        # Create a deeply nested And structure
        inner = {"rule": "Has", "options": [], "args": {"item_name": "Core"}}
        for i in range(10):
            inner = {"rule": "And", "options": [], "children": [inner]}

        result = self.converter.convert(inner)

        self.assertTrue(result.success)
        # Should be flattened/simplified to just the item check
        self.assertEqual(result.rule, {"type": "item_check", "item": "Core"})


if __name__ == '__main__':
    unittest.main()
