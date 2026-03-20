"""
Tests for the BinaryOpProcessor class.

This module tests binary operation preprocessing and optimization
during rule analysis, including list operations and function call preprocessing.
"""

import pytest
from typing import Dict, Any, List

from exporter.analyzer.binary_ops import BinaryOpProcessor
from exporter.analyzer.expression_resolver import ExpressionResolver


class MockExpressionResolver:
    """Mock resolver for testing binary ops without full resolver."""

    def __init__(self, closure_vars=None):
        self.closure_vars = closure_vars or {}

    def resolve_expression(self, expr):
        if not isinstance(expr, dict):
            return None
        if expr.get("type") == "constant":
            return expr.get("value")
        if expr.get("type") == "name":
            return self.closure_vars.get(expr.get("name"))
        return None

    def _get_current_player_number(self):
        return 1


class MockGameHandler:
    """Mock game handler for testing binary ops."""

    def __init__(self):
        self.collections = {}
        self.collection_lengths = {}

    def add_collection(self, name: str, data: List):
        self.collections[name] = data
        self.collection_lengths[name] = len(data)

    def get_collection_data(self, name: str):
        return self.collections.get(name)

    def get_collection_length(self, name: str):
        return self.collection_lengths.get(name)


class TestListMultiplication:
    """Tests for list multiplication preprocessing."""

    def test_simple_list_multiplication(self):
        """Test [value] * constant preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {"type": "constant", "value": 3}

        result = processor.try_preprocess_binary_op(left, "*", right)

        assert result is not None
        assert result.get("type") == "list"
        assert len(result.get("value", [])) == 3

    def test_list_multiplication_with_player(self):
        """Test [player] * constant preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "name", "name": "player"}]}
        right = {"type": "constant", "value": 4}

        result = processor.try_preprocess_binary_op(left, "*", right)

        assert result is not None
        assert result.get("type") == "list"
        # Player should be resolved to 1, repeated 4 times
        assert len(result.get("value", [])) == 4

    def test_list_multiplication_zero(self):
        """Test that multiplication by 0 doesn't preprocess."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {"type": "constant", "value": 0}

        result = processor.try_preprocess_binary_op(left, "*", right)

        # Zero or negative multipliers shouldn't preprocess
        assert result is None

    def test_list_multiplication_negative(self):
        """Test that multiplication by negative doesn't preprocess."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {"type": "constant", "value": -1}

        result = processor.try_preprocess_binary_op(left, "*", right)

        assert result is None


class TestListAddition:
    """Tests for list addition preprocessing."""

    def test_constant_list_addition(self):
        """Test [a, b] + [c, d] preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        processor = BinaryOpProcessor(resolver, handler)

        left = {"type": "constant", "value": [1, 2]}
        right = {"type": "constant", "value": [3, 4]}

        result = processor.try_preprocess_binary_op(left, "+", right)

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") == [1, 2, 3, 4]

    def test_named_collection_addition(self):
        """Test collection1 + collection2 preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("list_a", [1, 2, 3])
        handler.add_collection("list_b", [4, 5])
        processor = BinaryOpProcessor(resolver, handler)

        left = {"type": "name", "name": "list_a"}
        right = {"type": "name", "name": "list_b"}

        result = processor.try_preprocess_binary_op(left, "+", right)

        assert result is not None
        assert result.get("value") == [1, 2, 3, 4, 5]


class TestListMultiplicationWithLen:
    """Tests for list multiplication with len() calls."""

    def test_list_times_len_constant_list(self):
        """Test [value] * len(constant_list) preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {
            "type": "helper",
            "name": "len",
            "args": [{"type": "constant", "value": [1, 2, 3, 4, 5]}]
        }

        result = processor.try_preprocess_binary_op(left, "*", right)

        assert result is not None
        assert len(result.get("value", [])) == 5

    def test_list_times_len_named_collection(self):
        """Test [value] * len(named_collection) preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("items", ["a", "b", "c"])
        processor = BinaryOpProcessor(resolver, handler)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {
            "type": "helper",
            "name": "len",
            "args": [{"type": "name", "name": "items"}]
        }

        result = processor.try_preprocess_binary_op(left, "*", right)

        assert result is not None
        assert len(result.get("value", [])) == 3


class TestLenPreprocessing:
    """Tests for len() function preprocessing."""

    def test_len_of_constant_list(self):
        """Test len(constant_list) preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {"type": "constant", "value": [1, 2, 3, 4, 5]}
        result = processor.try_preprocess_len(list_ref)

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") == 5

    def test_len_of_empty_list(self):
        """Test len([]) preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {"type": "constant", "value": []}
        result = processor.try_preprocess_len(list_ref)

        assert result is not None
        assert result.get("value") == 0

    def test_len_of_named_collection(self):
        """Test len(named_collection) preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("items", ["a", "b", "c", "d"])
        processor = BinaryOpProcessor(resolver, handler)

        list_ref = {"type": "name", "name": "items"}
        result = processor.try_preprocess_len(list_ref)

        assert result is not None
        assert result.get("value") == 4

    def test_len_of_list_concatenation(self):
        """Test len(list1 + list2) preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("list_a", [1, 2])
        handler.add_collection("list_b", [3, 4, 5])
        processor = BinaryOpProcessor(resolver, handler)

        list_ref = {
            "type": "binary_op",
            "op": "+",
            "left": {"type": "name", "name": "list_a"},
            "right": {"type": "name", "name": "list_b"}
        }
        result = processor.try_preprocess_len(list_ref)

        assert result is not None
        assert result.get("value") == 5

    def test_len_of_unknown_collection(self):
        """Test that len(unknown) returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {"type": "name", "name": "unknown_collection"}
        result = processor.try_preprocess_len(list_ref)

        assert result is None


class TestZipPreprocessing:
    """Tests for zip() function preprocessing."""

    def test_zip_two_constant_lists(self):
        """Test zip([a, b], [1, 2]) preprocessing."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        args = [
            {"type": "constant", "value": ["a", "b"]},
            {"type": "constant", "value": [1, 2]}
        ]
        result = processor.try_preprocess_zip(args)

        assert result is not None
        assert result.get("type") == "constant"
        assert result.get("value") == [["a", 1], ["b", 2]]

    def test_zip_named_collections(self):
        """Test zip(collection1, collection2) preprocessing."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("names", ["Alice", "Bob"])
        handler.add_collection("ages", [25, 30])
        processor = BinaryOpProcessor(resolver, handler)

        args = [
            {"type": "name", "name": "names"},
            {"type": "name", "name": "ages"}
        ]
        result = processor.try_preprocess_zip(args)

        assert result is not None
        assert result.get("value") == [["Alice", 25], ["Bob", 30]]

    def test_zip_unequal_lengths(self):
        """Test zip with unequal length lists."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        args = [
            {"type": "constant", "value": [1, 2, 3]},
            {"type": "constant", "value": ["a", "b"]}
        ]
        result = processor.try_preprocess_zip(args)

        assert result is not None
        # zip stops at shortest
        assert result.get("value") == [[1, "a"], [2, "b"]]

    def test_zip_three_args_not_supported(self):
        """Test that zip with 3 args returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        args = [
            {"type": "constant", "value": [1]},
            {"type": "constant", "value": [2]},
            {"type": "constant", "value": [3]}
        ]
        result = processor.try_preprocess_zip(args)

        assert result is None

    def test_zip_one_arg_not_supported(self):
        """Test that zip with 1 arg returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        args = [{"type": "constant", "value": [1, 2]}]
        result = processor.try_preprocess_zip(args)

        assert result is None

    def test_zip_unresolvable_list(self):
        """Test zip with unresolvable list returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        args = [
            {"type": "constant", "value": [1, 2]},
            {"type": "name", "name": "unknown"}
        ]
        result = processor.try_preprocess_zip(args)

        assert result is None


class TestResolveListData:
    """Tests for resolving list data."""

    def test_resolve_constant_list(self):
        """Test resolving a constant list."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {"type": "constant", "value": [1, 2, 3]}
        result = processor.try_resolve_list_data(list_ref)

        assert result == [1, 2, 3]

    def test_resolve_named_collection(self):
        """Test resolving a named collection."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("items", ["Sword", "Shield"])
        processor = BinaryOpProcessor(resolver, handler)

        list_ref = {"type": "name", "name": "items"}
        result = processor.try_resolve_list_data(list_ref)

        assert result == ["Sword", "Shield"]

    def test_resolve_list_with_constants(self):
        """Test resolving a list structure with constant values."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {
            "type": "list",
            "value": [
                {"type": "constant", "value": "A"},
                {"type": "constant", "value": "B"}
            ]
        }
        result = processor.try_resolve_list_data(list_ref)

        assert result == ["A", "B"]

    def test_resolve_list_with_player_reference(self):
        """Test resolving a list containing player reference."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {
            "type": "list",
            "value": [{"type": "name", "name": "player"}]
        }
        result = processor.try_resolve_list_data(list_ref)

        assert result == [1]  # Default player number

    def test_resolve_unknown_list(self):
        """Test that unknown list reference returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        list_ref = {"type": "name", "name": "unknown"}
        result = processor.try_resolve_list_data(list_ref)

        assert result is None


class TestResolveBinaryOpData:
    """Tests for resolving binary operation results."""

    def test_resolve_list_multiplication_data(self):
        """Test resolving [value] * n to actual data."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        binary_ref = {
            "type": "binary_op",
            "op": "*",
            "left": {
                "type": "list",
                "value": [{"type": "constant", "value": "X"}]
            },
            "right": {"type": "constant", "value": 3}
        }
        result = processor.try_resolve_binary_op_data(binary_ref)

        assert result == ["X", "X", "X"]

    def test_resolve_list_addition_data(self):
        """Test resolving list1 + list2 to actual data."""
        resolver = MockExpressionResolver()
        handler = MockGameHandler()
        handler.add_collection("a", [1, 2])
        handler.add_collection("b", [3, 4])
        processor = BinaryOpProcessor(resolver, handler)

        binary_ref = {
            "type": "binary_op",
            "op": "+",
            "left": {"type": "name", "name": "a"},
            "right": {"type": "name", "name": "b"}
        }
        result = processor.try_resolve_binary_op_data(binary_ref)

        assert result == [1, 2, 3, 4]

    def test_resolve_non_binary_op(self):
        """Test that non-binary_op returns None."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        ref = {"type": "not_binary_op", "value": 42}
        result = processor.try_resolve_binary_op_data(ref)

        assert result is None


class TestNonPreprocessable:
    """Tests for operations that cannot be preprocessed."""

    def test_non_multiply_operator(self):
        """Test that non-* operators on lists don't preprocess."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {"type": "constant", "value": 2}

        result = processor.try_preprocess_binary_op(left, "-", right)
        assert result is None

    def test_non_list_multiplication(self):
        """Test that non-list * constant doesn't preprocess."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "constant", "value": 5}
        right = {"type": "constant", "value": 3}

        result = processor.try_preprocess_binary_op(left, "*", right)
        assert result is None

    def test_list_times_non_constant(self):
        """Test that list * non-constant doesn't preprocess."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver)

        left = {"type": "list", "value": [{"type": "constant", "value": 1}]}
        right = {"type": "name", "name": "unknown"}

        result = processor.try_preprocess_binary_op(left, "*", right)
        assert result is None


class TestKnownCollectionLengths:
    """Tests for hardcoded known collection lengths."""

    def test_alttp_randomizer_room_chests(self):
        """Test ALTTP randomizer_room_chests length."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver, None)

        list_ref = {"type": "name", "name": "randomizer_room_chests"}
        result = processor.try_resolve_list_length(list_ref)

        assert result == 4

    def test_alttp_compass_room_chests(self):
        """Test ALTTP compass_room_chests length."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver, None)

        list_ref = {"type": "name", "name": "compass_room_chests"}
        result = processor.try_resolve_list_length(list_ref)

        assert result == 5

    def test_alttp_back_chests(self):
        """Test ALTTP back_chests length."""
        resolver = MockExpressionResolver()
        processor = BinaryOpProcessor(resolver, None)

        list_ref = {"type": "name", "name": "back_chests"}
        result = processor.try_resolve_list_length(list_ref)

        assert result == 5
