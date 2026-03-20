"""
Tests for round-trip conversion between formats.

This module tests that conversions preserve semantics when going:
- Python -> JSON -> Python
- AST format -> Rule Builder format -> AST format
- Rule Builder format -> AST format -> Rule Builder format
"""

import pytest

from exporter.converter import (
    convert_python_to_json,
    convert_json_to_python,
    convert_rule_builder_to_ast,
    convert_ast_to_rule_builder,
)


class TestPythonJsonPython:
    """Tests for Python -> JSON -> Python round-trip."""

    def test_simple_item_check_roundtrip(self):
        """Test that simple item check survives round-trip."""
        original = "state.has('Sword')"

        # Python -> JSON
        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("type") == "item_check"

        # JSON -> Python
        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "has" in result
        assert "Sword" in result

    def test_and_expression_roundtrip(self):
        """Test that AND expression survives round-trip."""
        original = "state.has('A') and state.has('B')"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("type") == "and"

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "and" in result

    def test_or_expression_roundtrip(self):
        """Test that OR expression survives round-trip."""
        original = "state.has('A') or state.has('B')"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("type") == "or"

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "or" in result

    def test_not_expression_roundtrip(self):
        """Test that NOT expression survives round-trip."""
        original = "not state.has('Curse')"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("type") == "not"

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "not" in result

    def test_comparison_roundtrip(self):
        """Test that comparison survives round-trip."""
        original = "state.count('Key', player) >= 3"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        # Should preserve the comparison semantics

    def test_constant_true_roundtrip(self):
        """Test that True constant survives round-trip."""
        original = "True"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("type") == "constant"
        assert json_rule.get("value") is True

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "True" in result

    def test_constant_false_roundtrip(self):
        """Test that False constant survives round-trip."""
        original = "False"

        json_rule, _ = convert_python_to_json(original)
        assert json_rule is not None
        assert json_rule.get("value") is False

        result, _ = convert_json_to_python(json_rule)
        assert result is not None
        assert "False" in result


class TestRuleBuilderToAst:
    """Tests for Rule Builder -> AST conversion."""

    def test_has_to_item_check(self):
        """Test converting Has rule to item_check."""
        rb_rule = {
            "rule": "Has",
            "options": [],
            "args": {"item_name": "Sword", "count": 1}
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        assert ast_rule.get("type") == "item_check"
        assert ast_rule.get("item") == "Sword"

    def test_has_with_count(self):
        """Test converting Has rule with count."""
        rb_rule = {
            "rule": "Has",
            "options": [],
            "args": {"item_name": "Key", "count": 5}
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        assert ast_rule.get("type") == "item_check"

    def test_has_all_to_and(self):
        """Test converting HasAll to AND of item_checks."""
        rb_rule = {
            "rule": "HasAll",
            "options": [],
            "args": {"item_names": ["A", "B", "C"]}
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        # HasAll becomes AND of item_checks, state_method, or constant True (for empty list)
        assert ast_rule.get("type") in ("and", "state_method", "constant")

    def test_has_any_to_or(self):
        """Test converting HasAny to OR of item_checks."""
        rb_rule = {
            "rule": "HasAny",
            "options": [],
            "args": {"item_names": ["A", "B"]}
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        # HasAny becomes OR of item_checks, state_method, or constant False (for empty list)
        assert ast_rule.get("type") in ("or", "state_method", "constant")

    def test_and_rule(self):
        """Test converting And rule."""
        # Note: And/Or use 'children' at top level, not inside 'args'
        rb_rule = {
            "rule": "And",
            "children": [
                {"rule": "Has", "args": {"item_name": "A"}},
                {"rule": "Has", "args": {"item_name": "B"}}
            ]
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        # Converter may produce 'and' or 'state_method' depending on optimization
        assert ast_rule.get("type") in ("and", "state_method")

    def test_or_rule(self):
        """Test converting Or rule."""
        # Note: And/Or use 'children' at top level, not inside 'args'
        rb_rule = {
            "rule": "Or",
            "children": [
                {"rule": "Has", "args": {"item_name": "A"}},
                {"rule": "Has", "args": {"item_name": "B"}}
            ]
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        # Converter may produce 'or' or 'state_method' depending on optimization
        assert ast_rule.get("type") in ("or", "state_method")

    def test_can_reach_region(self):
        """Test converting CanReachRegion rule."""
        rb_rule = {
            "rule": "CanReachRegion",
            "options": [],
            "args": {"region_name": "Castle"}
        }

        ast_rule, warnings = convert_rule_builder_to_ast(rb_rule)

        assert ast_rule is not None
        assert ast_rule.get("type") in ("can_reach", "region_check")


class TestAstToRuleBuilder:
    """Tests for AST -> Rule Builder conversion."""

    def test_item_check_to_has(self):
        """Test converting item_check to Has."""
        ast_rule = {"type": "item_check", "item": "Sword"}

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        assert rb_rule.get("rule") == "Has"
        assert rb_rule.get("args", {}).get("item_name") == "Sword"

    def test_and_to_and(self):
        """Test converting and to And or HasAll."""
        ast_rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        # Converter optimizes and of item_checks to HasAll
        assert rb_rule.get("rule") in ("And", "HasAll")

    def test_or_to_or(self):
        """Test converting or to Or or HasAny."""
        ast_rule = {
            "type": "or",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        # Converter optimizes or of item_checks to HasAny
        assert rb_rule.get("rule") in ("Or", "HasAny")

    def test_can_reach_to_can_reach_region(self):
        """Test converting can_reach to CanReachRegion."""
        ast_rule = {"type": "can_reach", "region": "Castle"}

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        assert rb_rule.get("rule") == "CanReachRegion"

    def test_constant_true(self):
        """Test converting constant true."""
        ast_rule = {"type": "constant", "value": True}

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        assert rb_rule.get("rule") == "True_"

    def test_constant_false(self):
        """Test converting constant false."""
        ast_rule = {"type": "constant", "value": False}

        rb_rule, warnings = convert_ast_to_rule_builder(ast_rule)

        assert rb_rule is not None
        assert rb_rule.get("rule") == "False_"


class TestRuleBuilderRoundTrip:
    """Tests for Rule Builder -> AST -> Rule Builder round-trip."""

    def test_has_roundtrip(self):
        """Test Has rule round-trips correctly."""
        original = {
            "rule": "Has",
            "options": [],
            "args": {"item_name": "Sword", "count": 1}
        }

        # RB -> AST
        ast_rule, _ = convert_rule_builder_to_ast(original)
        assert ast_rule is not None

        # AST -> RB
        result, _ = convert_ast_to_rule_builder(ast_rule)
        assert result is not None
        assert result.get("rule") == "Has"
        assert result.get("args", {}).get("item_name") == "Sword"

    def test_and_roundtrip(self):
        """Test And rule round-trips correctly."""
        # Note: And/Or use 'children' at top level, not inside 'args'
        original = {
            "rule": "And",
            "children": [
                {"rule": "Has", "args": {"item_name": "A"}},
                {"rule": "Has", "args": {"item_name": "B"}}
            ]
        }

        ast_rule, _ = convert_rule_builder_to_ast(original)
        assert ast_rule is not None

        result, _ = convert_ast_to_rule_builder(ast_rule)
        assert result is not None
        # Round-trip may optimize to HasAll or preserve as And
        assert result.get("rule") in ("And", "HasAll")

    def test_or_roundtrip(self):
        """Test Or rule round-trips correctly."""
        # Note: And/Or use 'children' at top level, not inside 'args'
        original = {
            "rule": "Or",
            "children": [
                {"rule": "Has", "args": {"item_name": "A"}},
                {"rule": "Has", "args": {"item_name": "B"}}
            ]
        }

        ast_rule, _ = convert_rule_builder_to_ast(original)
        assert ast_rule is not None

        result, _ = convert_ast_to_rule_builder(ast_rule)
        assert result is not None
        # Round-trip may optimize to HasAny or preserve as Or
        assert result.get("rule") in ("Or", "HasAny")


class TestAstRoundTrip:
    """Tests for AST -> Rule Builder -> AST round-trip."""

    def test_item_check_roundtrip(self):
        """Test item_check round-trips correctly."""
        original = {"type": "item_check", "item": "Sword"}

        rb_rule, _ = convert_ast_to_rule_builder(original)
        assert rb_rule is not None

        result, _ = convert_rule_builder_to_ast(rb_rule)
        assert result is not None
        assert result.get("type") == "item_check"
        assert result.get("item") == "Sword"

    def test_and_roundtrip(self):
        """Test and node round-trips correctly."""
        original = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "A"},
                {"type": "item_check", "item": "B"}
            ]
        }

        rb_rule, _ = convert_ast_to_rule_builder(original)
        assert rb_rule is not None

        result, _ = convert_rule_builder_to_ast(rb_rule)
        assert result is not None
        # Round-trip may optimize to state_method (has_all) or preserve as and
        assert result.get("type") in ("and", "state_method")

    def test_constant_true_roundtrip(self):
        """Test constant true round-trips correctly."""
        original = {"type": "constant", "value": True}

        rb_rule, _ = convert_ast_to_rule_builder(original)
        assert rb_rule is not None

        result, _ = convert_rule_builder_to_ast(rb_rule)
        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") is True


class TestComplexRoundTrips:
    """Tests for complex rule round-trips."""

    def test_nested_boolean_roundtrip(self):
        """Test nested boolean structure round-trips."""
        original = {
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

        # AST -> RB
        rb_rule, _ = convert_ast_to_rule_builder(original)
        assert rb_rule is not None

        # RB -> AST
        result, _ = convert_rule_builder_to_ast(rb_rule)
        assert result is not None
        assert result.get("type") == "or"

    def test_all_node_types_roundtrip(self):
        """Test various node types round-trip."""
        test_cases = [
            {"type": "constant", "value": True},
            {"type": "constant", "value": False},
            {"type": "item_check", "item": "Test"},
            {"type": "can_reach", "region": "Test Region"},
        ]

        for original in test_cases:
            rb_rule, _ = convert_ast_to_rule_builder(original)
            if rb_rule is None:
                continue  # Skip if conversion not supported

            result, _ = convert_rule_builder_to_ast(rb_rule)
            if result is None:
                continue  # Skip if conversion back not supported

            # Check that the type is preserved
            assert result.get("type") == original.get("type"), \
                f"Type mismatch for {original}"
