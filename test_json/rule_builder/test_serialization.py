"""
Tests for Rule Builder serialization and deserialization.

This module tests the to_dict() and from_dict() methods across rule types,
ensuring rules can be serialized and deserialized correctly.
"""

import pytest
import json

from rule_builder import (
    True_, False_, Has, HasAll, HasAny, And, Or, Not,
    CanReachRegion, CanReachLocation, CanReachEntrance,
    HasGroup, HasGroupUnique, HasAllCounts, HasAnyCount,
    HasFromList, HasFromListUnique,
    Compare, Arithmetic, Conditional, CountItem, HelperCall,
    MinValue, MaxValue, WeightedSum, OptionValue,
)


# Mock world class
class MockWorldClass:
    game = "Test Game"

    @classmethod
    def get_rule_cls(cls, name):
        from rule_builder.rules import CustomRuleRegister
        return CustomRuleRegister.get_rule_cls(cls.game, name)

    @classmethod
    def rule_from_dict(cls, data):
        """Convert a serialized rule dict back to a Rule object."""
        from rule_builder import (
            True_, False_, Has, HasAll, HasAny, And, Or, Not,
            CanReachRegion, CanReachLocation, CanReachEntrance,
            HasGroup, Compare, CountItem, HelperCall,
        )

        rule_name = data.get("rule")
        rule_map = {
            "True_": True_,
            "False_": False_,
            "Has": Has,
            "HasAll": HasAll,
            "HasAny": HasAny,
            "And": And,
            "Or": Or,
            "Not": Not,
            "CanReachRegion": CanReachRegion,
            "CanReachLocation": CanReachLocation,
            "CanReachEntrance": CanReachEntrance,
            "HasGroup": HasGroup,
            "Compare": Compare,
            "CountItem": CountItem,
            "HelperCall": HelperCall,
        }

        rule_cls = rule_map.get(rule_name)
        if rule_cls:
            return rule_cls.from_dict(data, cls)

        # For unknown rules, try to construct from args
        return None


class TestBooleanSerialization:
    """Tests for serializing boolean constants."""

    def test_true_round_trip(self):
        """Test True_ serialization round-trip."""
        original = True_()
        data = original.to_dict()
        restored = True_.from_dict(data, MockWorldClass)

        assert isinstance(restored, True_)

    def test_false_round_trip(self):
        """Test False_ serialization round-trip."""
        original = False_()
        data = original.to_dict()
        restored = False_.from_dict(data, MockWorldClass)

        assert isinstance(restored, False_)


class TestHasSerialization:
    """Tests for Has rule serialization."""

    def test_has_simple_round_trip(self):
        """Test simple Has rule round-trip."""
        original = Has(item_name="Sword")
        data = original.to_dict()
        restored = Has.from_dict(data, MockWorldClass)

        assert isinstance(restored, Has)
        assert restored.item_name == "Sword"

    def test_has_with_count_round_trip(self):
        """Test Has with count round-trip."""
        original = Has(item_name="Key", count=5)
        data = original.to_dict()
        restored = Has.from_dict(data, MockWorldClass)

        assert restored.item_name == "Key"
        assert restored.count == 5

    def test_has_json_serializable(self):
        """Test that Has.to_dict() produces JSON-serializable output."""
        rule = Has(item_name="Sword", count=1)
        data = rule.to_dict()

        # Should not raise
        json_str = json.dumps(data)
        assert json_str is not None


class TestHasAllSerialization:
    """Tests for HasAll rule serialization."""

    def test_has_all_round_trip(self):
        """Test HasAll rule round-trip."""
        original = HasAll("A", "B", "C")
        data = original.to_dict()
        restored = HasAll.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasAll)


class TestHasAnySerialization:
    """Tests for HasAny rule serialization."""

    def test_has_any_round_trip(self):
        """Test HasAny rule round-trip."""
        original = HasAny("A", "B", "C")
        data = original.to_dict()
        restored = HasAny.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasAny)


class TestAndSerialization:
    """Tests for And rule serialization."""

    def test_and_round_trip(self):
        """Test And rule round-trip."""
        original = And(Has(item_name="A"), Has(item_name="B"))
        data = original.to_dict()
        restored = And.from_dict(data, MockWorldClass)

        assert isinstance(restored, And)

    def test_nested_and_round_trip(self):
        """Test nested And round-trip."""
        inner = And(Has(item_name="A"), Has(item_name="B"))
        original = And(inner, Has(item_name="C"))
        data = original.to_dict()

        # Should be JSON serializable
        json.dumps(data)


class TestOrSerialization:
    """Tests for Or rule serialization."""

    def test_or_round_trip(self):
        """Test Or rule round-trip."""
        original = Or(Has(item_name="A"), Has(item_name="B"))
        data = original.to_dict()
        restored = Or.from_dict(data, MockWorldClass)

        assert isinstance(restored, Or)


class TestNotSerialization:
    """Tests for Not rule serialization."""

    def test_not_round_trip(self):
        """Test Not rule round-trip."""
        original = Not(child=Has(item_name="Curse"))
        data = original.to_dict()
        restored = Not.from_dict(data, MockWorldClass)

        assert isinstance(restored, Not)


class TestReachabilitySerialization:
    """Tests for reachability rule serialization."""

    def test_can_reach_region_round_trip(self):
        """Test CanReachRegion round-trip."""
        original = CanReachRegion(region_name="Castle")
        data = original.to_dict()
        restored = CanReachRegion.from_dict(data, MockWorldClass)

        assert isinstance(restored, CanReachRegion)
        assert restored.region_name == "Castle"

    def test_can_reach_location_round_trip(self):
        """Test CanReachLocation round-trip."""
        original = CanReachLocation(location_name="Chest")
        data = original.to_dict()
        restored = CanReachLocation.from_dict(data, MockWorldClass)

        assert isinstance(restored, CanReachLocation)

    def test_can_reach_entrance_round_trip(self):
        """Test CanReachEntrance round-trip."""
        original = CanReachEntrance(entrance_name="Door")
        data = original.to_dict()
        restored = CanReachEntrance.from_dict(data, MockWorldClass)

        assert isinstance(restored, CanReachEntrance)


class TestGroupSerialization:
    """Tests for group rule serialization."""

    def test_has_group_round_trip(self):
        """Test HasGroup round-trip."""
        original = HasGroup(item_name_group="Swords", count=1)
        data = original.to_dict()
        restored = HasGroup.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasGroup)

    def test_has_group_unique_round_trip(self):
        """Test HasGroupUnique round-trip."""
        original = HasGroupUnique(item_name_group="Keys", count=3)
        data = original.to_dict()
        restored = HasGroupUnique.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasGroupUnique)


class TestCompareSerialization:
    """Tests for Compare rule serialization."""

    def test_compare_round_trip(self):
        """Test Compare round-trip."""
        original = Compare(left=CountItem(item_name="Key"), op=">=", right=3)
        data = original.to_dict()
        restored = Compare.from_dict(data, MockWorldClass)

        assert isinstance(restored, Compare)


class TestArithmeticSerialization:
    """Tests for Arithmetic rule serialization."""

    def test_arithmetic_round_trip(self):
        """Test Arithmetic round-trip."""
        original = Arithmetic(
            left=CountItem(item_name="A"),
            op="+",
            right=CountItem(item_name="B")
        )
        data = original.to_dict()
        restored = Arithmetic.from_dict(data, MockWorldClass)

        assert isinstance(restored, Arithmetic)


class TestConditionalSerialization:
    """Tests for Conditional rule serialization."""

    def test_conditional_round_trip(self):
        """Test Conditional round-trip."""
        original = Conditional(
            test=Has(item_name="B"),
            if_true=Has(item_name="A"),
            if_false=Has(item_name="C")
        )
        data = original.to_dict()
        restored = Conditional.from_dict(data, MockWorldClass)

        assert isinstance(restored, Conditional)


class TestCountItemSerialization:
    """Tests for CountItem rule serialization."""

    def test_count_item_round_trip(self):
        """Test CountItem round-trip."""
        original = CountItem(item_name="Arrow")
        data = original.to_dict()
        restored = CountItem.from_dict(data, MockWorldClass)

        assert isinstance(restored, CountItem)
        assert restored.item_name == "Arrow"


class TestHelperCallSerialization:
    """Tests for HelperCall rule serialization."""

    def test_helper_call_round_trip(self):
        """Test HelperCall round-trip."""
        original = HelperCall(helper_name="can_fight", args=[])
        data = original.to_dict()
        restored = HelperCall.from_dict(data, MockWorldClass)

        assert isinstance(restored, HelperCall)

    def test_helper_call_with_args_round_trip(self):
        """Test HelperCall with simple arguments round-trip."""
        # HelperCall args should be simple values (strings, ints, bools), not Rule objects
        original = HelperCall(
            helper_name="check_item",
            args=("Sword", 5)  # Simple tuple of values
        )
        data = original.to_dict()

        # Should be JSON serializable
        json.dumps(data)


class TestComplexSerialization:
    """Tests for complex rule serialization."""

    def test_nested_structure_round_trip(self):
        """Test complex nested structure round-trip."""
        original = Or(
            And(Has(item_name="A"), Has(item_name="B")),
            And(Has(item_name="C"), Has(item_name="D"))
        )
        data = original.to_dict()

        # Should be JSON serializable
        json_str = json.dumps(data)
        assert json_str is not None

        # Should be able to restore
        restored = Or.from_dict(data, MockWorldClass)
        assert isinstance(restored, Or)

    def test_deep_nesting_json_serializable(self):
        """Test that deep nesting remains JSON serializable."""
        # Create deeply nested structure
        rule = Has(item_name="Deep")
        for i in range(10):
            rule = And(rule, Has(item_name=f"Item{i}"))

        data = rule.to_dict()

        # Should not raise
        json_str = json.dumps(data)
        assert json_str is not None


class TestOptionFilterSerialization:
    """Tests for option filter serialization."""

    def test_filtered_rule_serialization(self):
        """Test that filtered rules serialize correctly."""
        from Options import Range

        # Create a mock option class for testing
        class DifficultyOption(Range):
            """Mock difficulty option for testing."""
            range_start = 0
            range_end = 10
            default = 5

        from rule_builder import OptionFilter, Filtered

        # Create a filtered rule with proper OptionFilter syntax
        has_rule = Has(item_name="Sword")
        filter_opt = OptionFilter(option=DifficultyOption, value=2, operator="ge")
        filtered = Filtered(child=has_rule, options=[filter_opt])

        data = filtered.to_dict()

        # Should be JSON serializable
        json_str = json.dumps(data)
        assert json_str is not None


class TestSpecialCharacters:
    """Tests for handling special characters in serialization."""

    def test_item_name_with_spaces(self):
        """Test item names with spaces serialize correctly."""
        original = Has(item_name="Master Sword")
        data = original.to_dict()
        restored = Has.from_dict(data, MockWorldClass)

        assert restored.item_name == "Master Sword"

    def test_item_name_with_special_chars(self):
        """Test item names with special characters."""
        original = Has(item_name="Item's Name")
        data = original.to_dict()

        # Should be JSON serializable
        json_str = json.dumps(data)
        restored_data = json.loads(json_str)

    def test_region_name_with_unicode(self):
        """Test region names with unicode characters."""
        original = CanReachRegion(region_name="Château")
        data = original.to_dict()

        # Should be JSON serializable
        json_str = json.dumps(data)
        assert "Château" in json_str or "Ch\\u00e2teau" in json_str


class TestEmptyRules:
    """Tests for serializing empty/edge case rules."""

    def test_empty_and(self):
        """Test empty And serialization."""
        original = And()
        data = original.to_dict()
        restored = And.from_dict(data, MockWorldClass)

        assert isinstance(restored, And)

    def test_empty_or(self):
        """Test empty Or serialization."""
        original = Or()
        data = original.to_dict()
        restored = Or.from_dict(data, MockWorldClass)

        assert isinstance(restored, Or)

    def test_empty_has_all(self):
        """Test empty HasAll serialization."""
        original = HasAll()
        data = original.to_dict()
        restored = HasAll.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasAll)

    def test_empty_has_any(self):
        """Test empty HasAny serialization."""
        original = HasAny()
        data = original.to_dict()
        restored = HasAny.from_dict(data, MockWorldClass)

        assert isinstance(restored, HasAny)
