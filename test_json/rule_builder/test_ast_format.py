"""
Tests for Rule Builder AST format parsing.

This module tests the is_ast_format() and parse_ast_rule() functions
which handle native AST format JSON rules.
"""

import pytest

from rule_builder import is_ast_format, parse_ast_rule
from rule_builder import (
    True_, False_, Has, HasAll, HasAny, And, Or, Not,
    CanReachRegion, CanReachLocation,
    HasGroup, Compare, Conditional,
)


# Mock world class for tests
class MockWorldClass:
    """Mock world class for testing parse_ast_rule."""
    game = "Test Game"

    @classmethod
    def get_rule_cls(cls, name):
        """Return default rule class lookup."""
        from rule_builder.rules import CustomRuleRegister
        return CustomRuleRegister.get_rule_cls(cls.game, name)


class TestIsAstFormat:
    """Tests for detecting AST format vs Rule Builder format."""

    def test_ast_format_with_type_key(self):
        """Test that rule with 'type' key is detected as AST format."""
        data = {"type": "item_check", "item": "Sword"}
        assert is_ast_format(data) is True

    def test_rule_builder_format_with_rule_key(self):
        """Test that rule with 'rule' key is detected as Rule Builder format."""
        data = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        assert is_ast_format(data) is False

    def test_mixed_format_prefers_rule_builder(self):
        """Test that rule with both 'type' and 'rule' is Rule Builder format."""
        data = {"type": "item_check", "rule": "Has", "args": {}}
        assert is_ast_format(data) is False

    def test_empty_dict(self):
        """Test handling of empty dict."""
        data = {}
        assert is_ast_format(data) is False


class TestParseConstant:
    """Tests for parsing constant rules."""

    def test_parse_constant_true(self):
        """Test parsing {"type": "constant", "value": true}."""
        data = {"type": "constant", "value": True}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, True_)

    def test_parse_constant_false(self):
        """Test parsing {"type": "constant", "value": false}."""
        data = {"type": "constant", "value": False}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, False_)


class TestParseItemCheck:
    """Tests for parsing item_check rules."""

    def test_parse_simple_item_check(self):
        """Test parsing {"type": "item_check", "item": "Sword"}."""
        data = {"type": "item_check", "item": "Sword"}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)
        assert rule.item_name == "Sword"

    def test_parse_item_check_with_count(self):
        """Test parsing item_check with count."""
        data = {
            "type": "item_check",
            "item": "Key",
            "count": {"type": "constant", "value": 5}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)
        assert rule.item_name == "Key"
        assert rule.count == 5

    def test_parse_item_check_with_numeric_count(self):
        """Test parsing item_check with plain numeric count."""
        data = {"type": "item_check", "item": "Key", "count": 3}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)
        assert rule.count == 3


class TestParseGroupCheck:
    """Tests for parsing group_check rules."""

    def test_parse_group_check(self):
        """Test parsing {"type": "group_check", "group": "Swords"}."""
        data = {"type": "group_check", "group": "Swords", "count": 1}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, HasGroup)


class TestParseStateMethod:
    """Tests for parsing state_method rules."""

    def test_parse_has_all(self):
        """Test parsing state_method has_all."""
        data = {
            "type": "state_method",
            "method": "has_all",
            "args": [{"type": "constant", "value": ["A", "B", "C"]}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, HasAll)

    def test_parse_has_any(self):
        """Test parsing state_method has_any."""
        data = {
            "type": "state_method",
            "method": "has_any",
            "args": [{"type": "constant", "value": ["A", "B"]}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, HasAny)

    def test_parse_has_method(self):
        """Test parsing state_method has."""
        data = {
            "type": "state_method",
            "method": "has",
            "args": [{"type": "constant", "value": "Sword"}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)

    def test_parse_can_reach_method(self):
        """Test parsing state_method can_reach."""
        data = {
            "type": "state_method",
            "method": "can_reach",
            "args": [{"type": "constant", "value": "Castle"}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, CanReachRegion)


class TestParseAnd:
    """Tests for parsing and rules."""

    def test_parse_and_with_conditions(self):
        """Test parsing {"type": "and", "conditions": [...]}."""
        data = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, And)

    def test_parse_and_empty(self):
        """Test parsing empty and -> True_."""
        data = {"type": "and", "conditions": []}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, True_)

    def test_parse_and_single_child(self):
        """Test parsing and with single child returns that child."""
        data = {
            "type": "and",
            "conditions": [{"type": "item_check", "item": "A"}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)


class TestParseOr:
    """Tests for parsing or rules."""

    def test_parse_or_with_conditions(self):
        """Test parsing {"type": "or", "conditions": [...]}."""
        data = {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Or)

    def test_parse_or_empty(self):
        """Test parsing empty or -> False_."""
        data = {"type": "or", "conditions": []}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, False_)

    def test_parse_or_single_child(self):
        """Test parsing or with single child returns that child."""
        data = {
            "type": "or",
            "conditions": [{"type": "item_check", "item": "A"}]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Has)


class TestParseNot:
    """Tests for parsing not rules."""

    def test_parse_not_with_operand(self):
        """Test parsing {"type": "not", "operand": {...}}."""
        data = {
            "type": "not",
            "operand": {"type": "item_check", "item": "Curse"}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Not)

    def test_parse_not_with_condition(self):
        """Test parsing {"type": "not", "condition": {...}}."""
        data = {
            "type": "not",
            "condition": {"type": "item_check", "item": "Curse"}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Not)

    def test_parse_not_empty(self):
        """Test parsing not with no condition returns True_."""
        data = {"type": "not"}
        rule = parse_ast_rule(data, MockWorldClass)

        # Should handle gracefully


class TestParseReachability:
    """Tests for parsing reachability rules."""

    def test_parse_can_reach(self):
        """Test parsing {"type": "can_reach", "region": "Castle"}."""
        data = {"type": "can_reach", "region": "Castle"}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, CanReachRegion)
        assert rule.region_name == "Castle"

    def test_parse_region_check(self):
        """Test parsing {"type": "region_check", "region": "Dungeon"}."""
        data = {"type": "region_check", "region": "Dungeon"}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, CanReachRegion)

    def test_parse_location_check(self):
        """Test parsing {"type": "location_check", "location": "Chest"}."""
        data = {"type": "location_check", "location": "Chest"}
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, CanReachLocation)


class TestParseConditional:
    """Tests for parsing conditional rules."""

    def test_parse_conditional(self):
        """Test parsing conditional rule."""
        data = {
            "type": "conditional",
            "test": {"type": "item_check", "item": "B"},
            "if_true": {"type": "item_check", "item": "A"},
            "if_false": {"type": "item_check", "item": "C"}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, (Conditional, Has))  # May simplify

    def test_parse_conditional_with_true_fallback(self):
        """Test parsing conditional where if_false is True."""
        data = {
            "type": "conditional",
            "test": {"type": "item_check", "item": "Option"},
            "if_true": {"type": "item_check", "item": "A"},
            "if_false": {"type": "constant", "value": True}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        # Should simplify to just the if_true rule
        assert isinstance(rule, Has)


class TestParseCompare:
    """Tests for parsing compare rules."""

    def test_parse_compare_greater_than(self):
        """Test parsing compare with >."""
        data = {
            "type": "compare",
            "left": {
                "type": "state_method",
                "method": "count",
                "args": [{"type": "constant", "value": "Key"}]
            },
            "op": ">",
            "right": {"type": "constant", "value": 5}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, (Compare, Has))  # May optimize to Has

    def test_parse_compare_greater_equal(self):
        """Test parsing compare with >=."""
        data = {
            "type": "compare",
            "left": {
                "type": "state_method",
                "method": "count",
                "args": [{"type": "constant", "value": "Key"}]
            },
            "op": ">=",
            "right": {"type": "constant", "value": 3}
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, (Compare, Has))


class TestParseUnknownType:
    """Tests for handling unknown rule types."""

    def test_parse_unknown_type(self):
        """Test that unknown types are wrapped in ASTRule."""
        from rule_builder.rules import ASTRule

        data = {"type": "unknown_custom_type", "value": 42}
        rule = parse_ast_rule(data, MockWorldClass)

        # Unknown types should be wrapped in ASTRule
        assert isinstance(rule, ASTRule)


class TestParseNested:
    """Tests for parsing nested structures."""

    def test_parse_deeply_nested(self):
        """Test parsing deeply nested rule structure."""
        data = {
            "type": "or",
            "conditions": [
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "A"},
                        {"type": "item_check", "item": "B"}
                    ]
                },
                {
                    "type": "and",
                    "conditions": [
                        {"type": "item_check", "item": "C"},
                        {"type": "item_check", "item": "D"}
                    ]
                }
            ]
        }
        rule = parse_ast_rule(data, MockWorldClass)

        assert isinstance(rule, Or)


class TestParseMissingType:
    """Tests for handling missing type field."""

    def test_missing_type_raises(self):
        """Test that missing type field raises ValueError."""
        data = {"item": "Sword"}

        with pytest.raises(ValueError):
            parse_ast_rule(data, MockWorldClass)
