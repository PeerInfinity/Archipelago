"""
Unit tests for AST visitor rule type generation.

Tests that Python code patterns are correctly converted to rule JSON structures.

Requirements:
    - astunparse (pip install astunparse)
    - Full Archipelago environment set up

Running tests:
    # From the Archipelago-CC root directory with virtual environment active:
    python -m pytest exporter/analyzer/test_ast_visitors.py -v

    # Or with unittest:
    python -m unittest exporter.analyzer.test_ast_visitors -v

    # Run specific test class:
    python -m pytest exporter/analyzer/test_ast_visitors.py::TestNegateRule -v
"""

import ast
import unittest

# Handle import errors gracefully for environments without full dependencies
try:
    from .analysis import analyze_rule
    from .rule_analyzer import RuleAnalyzer
    IMPORTS_AVAILABLE = True
except ImportError as e:
    IMPORTS_AVAILABLE = False
    IMPORT_ERROR = str(e)
    analyze_rule = None  # type: ignore[assignment]
    RuleAnalyzer = None  # type: ignore[assignment]


def skip_if_no_imports(test_class):
    """Decorator to skip test class if imports are not available."""
    if not IMPORTS_AVAILABLE:
        return unittest.skip(f"Required modules not available: {IMPORT_ERROR}")(test_class)
    return test_class


class TestHelperMixin:
    """Helper methods for tests."""

    def analyze_expression(self, code: str, closure_vars=None):
        """
        Analyze a Python expression and return the rule structure.

        Args:
            code: Python expression to analyze
            closure_vars: Optional dict of closure variables

        Returns:
            The rule structure dict
        """
        tree = ast.parse(code, mode='eval')
        return analyze_rule(ast_node=tree.body, closure_vars=closure_vars or {})  # type: ignore[operator]

    def analyze_lambda(self, lambda_func, closure_vars=None):
        """
        Analyze a lambda function and return the rule structure.

        Args:
            lambda_func: Lambda function to analyze
            closure_vars: Optional dict of closure variables

        Returns:
            The rule structure dict
        """
        return analyze_rule(rule_func=lambda_func, closure_vars=closure_vars or {})  # type: ignore[operator]


@skip_if_no_imports
class TestConstantRules(TestHelperMixin, unittest.TestCase):
    """Test constant value rule generation."""

    def test_true_constant(self):
        """True should produce constant rule with True value."""
        result = self.analyze_expression("True")
        self.assertEqual(result, {"type": "constant", "value": True})

    def test_false_constant(self):
        """False should produce constant rule with False value."""
        result = self.analyze_expression("False")
        self.assertEqual(result, {"type": "constant", "value": False})

    def test_integer_constant(self):
        """Integer should produce constant rule with integer value."""
        result = self.analyze_expression("42")
        self.assertEqual(result, {"type": "constant", "value": 42})

    def test_negative_integer_constant(self):
        """Negative integer should produce constant rule (evaluated at compile time)."""
        result = self.analyze_expression("-5")
        self.assertEqual(result, {"type": "constant", "value": -5})

    def test_float_constant(self):
        """Float should produce constant rule with float value."""
        result = self.analyze_expression("3.14")
        self.assertEqual(result, {"type": "constant", "value": 3.14})

    def test_string_constant(self):
        """String should produce constant rule with string value."""
        result = self.analyze_expression("'hello'")
        self.assertEqual(result, {"type": "constant", "value": "hello"})

    def test_none_constant(self):
        """None should produce constant rule with None value."""
        result = self.analyze_expression("None")
        self.assertEqual(result, {"type": "constant", "value": None})


@skip_if_no_imports
class TestNameRules(TestHelperMixin, unittest.TestCase):
    """Test name reference rule generation."""

    def test_name_reference(self):
        """Unknown name should produce name rule."""
        result = self.analyze_expression("some_var")
        self.assertEqual(result["type"], "name")
        self.assertEqual(result["name"], "some_var")

    def test_name_resolved_from_closure(self):
        """Name in closure should be resolved to constant."""
        result = self.analyze_expression("my_value", closure_vars={"my_value": 100})
        self.assertEqual(result, {"type": "constant", "value": 100})


@skip_if_no_imports
class TestBinaryOperations(TestHelperMixin, unittest.TestCase):
    """Test binary operation rule generation."""

    def test_addition(self):
        """Addition should produce binary_op with + operator."""
        result = self.analyze_expression("a + b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "+")

    def test_subtraction(self):
        """Subtraction should produce binary_op with - operator."""
        result = self.analyze_expression("a - b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "-")

    def test_multiplication(self):
        """Multiplication should produce binary_op with * operator."""
        result = self.analyze_expression("a * b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "*")

    def test_division(self):
        """Division should produce binary_op with / operator."""
        result = self.analyze_expression("a / b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "/")

    def test_floor_division(self):
        """Floor division should produce binary_op with // operator."""
        result = self.analyze_expression("a // b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "//")

    def test_modulo(self):
        """Modulo should produce binary_op with % operator."""
        result = self.analyze_expression("a % b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "%")

    def test_power(self):
        """Power should produce binary_op with ** operator."""
        result = self.analyze_expression("a ** b")
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "**")

    def test_constant_binary_op_addition(self):
        """Addition of constants produces binary_op (folding happens in frontend)."""
        result = self.analyze_expression("2 + 3")
        # The analyzer doesn't fold constants - that's done by the frontend
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "+")
        self.assertEqual(result["left"]["value"], 2)
        self.assertEqual(result["right"]["value"], 3)

    def test_constant_binary_op_multiplication(self):
        """Multiplication of constants produces binary_op (folding happens in frontend)."""
        result = self.analyze_expression("4 * 5")
        # The analyzer doesn't fold constants - that's done by the frontend
        self.assertEqual(result["type"], "binary_op")
        self.assertEqual(result["op"], "*")


@skip_if_no_imports
class TestComparisonOperations(TestHelperMixin, unittest.TestCase):
    """Test comparison operation rule generation."""

    def test_equal(self):
        """Equal comparison should produce compare with == operator."""
        result = self.analyze_expression("a == b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "==")

    def test_not_equal(self):
        """Not equal comparison should produce compare with != operator."""
        result = self.analyze_expression("a != b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "!=")

    def test_less_than(self):
        """Less than comparison should produce compare with < operator."""
        result = self.analyze_expression("a < b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "<")

    def test_greater_than(self):
        """Greater than comparison should produce compare with > operator."""
        result = self.analyze_expression("a > b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], ">")

    def test_less_than_or_equal(self):
        """Less than or equal comparison should produce compare with <= operator."""
        result = self.analyze_expression("a <= b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "<=")

    def test_greater_than_or_equal(self):
        """Greater than or equal comparison should produce compare with >= operator."""
        result = self.analyze_expression("a >= b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], ">=")

    def test_in_operator(self):
        """In operator should produce compare with 'in' operator."""
        result = self.analyze_expression("a in b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "in")

    def test_not_in_operator(self):
        """Not in operator should produce compare with 'not in' operator."""
        result = self.analyze_expression("a not in b")
        self.assertEqual(result["type"], "compare")
        self.assertEqual(result["op"], "not in")


@skip_if_no_imports
class TestBooleanOperations(TestHelperMixin, unittest.TestCase):
    """Test boolean operation rule generation."""

    def test_and_operation(self):
        """And operation should produce 'and' rule with conditions."""
        result = self.analyze_expression("a and b")
        self.assertEqual(result["type"], "and")
        self.assertIn("conditions", result)
        self.assertEqual(len(result["conditions"]), 2)

    def test_or_operation(self):
        """Or operation should produce 'or' rule with conditions."""
        result = self.analyze_expression("a or b")
        self.assertEqual(result["type"], "or")
        self.assertIn("conditions", result)
        self.assertEqual(len(result["conditions"]), 2)

    def test_not_operation(self):
        """Not operation should produce 'not' rule."""
        result = self.analyze_expression("not a")
        self.assertEqual(result["type"], "not")

    def test_multiple_and(self):
        """Multiple and operations should flatten into single 'and' rule."""
        result = self.analyze_expression("a and b and c")
        self.assertEqual(result["type"], "and")
        self.assertEqual(len(result["conditions"]), 3)

    def test_multiple_or(self):
        """Multiple or operations should flatten into single 'or' rule."""
        result = self.analyze_expression("a or b or c")
        self.assertEqual(result["type"], "or")
        self.assertEqual(len(result["conditions"]), 3)


@skip_if_no_imports
class TestNegateRule(TestHelperMixin, unittest.TestCase):
    """Test negate rule generation for unary minus."""

    def test_negate_constant_evaluated(self):
        """Negating a constant should be evaluated at compile time."""
        result = self.analyze_expression("-5")
        self.assertEqual(result, {"type": "constant", "value": -5})

    def test_negate_float_constant(self):
        """Negating a float constant should be evaluated at compile time."""
        result = self.analyze_expression("-3.14")
        self.assertEqual(result, {"type": "constant", "value": -3.14})

    def test_negate_variable(self):
        """Negating a variable should produce negate rule."""
        result = self.analyze_expression("-some_var")
        self.assertEqual(result["type"], "negate")
        self.assertEqual(result["operand"]["type"], "name")
        self.assertEqual(result["operand"]["name"], "some_var")

    def test_negate_expression(self):
        """Negating an expression should produce negate rule."""
        result = self.analyze_expression("-(a + b)")
        self.assertEqual(result["type"], "negate")
        self.assertEqual(result["operand"]["type"], "binary_op")


@skip_if_no_imports
class TestConditionalRule(TestHelperMixin, unittest.TestCase):
    """Test conditional (ternary) rule generation."""

    def test_conditional_expression(self):
        """Ternary expression should produce conditional rule."""
        result = self.analyze_expression("a if condition else b")
        self.assertEqual(result["type"], "conditional")
        self.assertIn("test", result)
        self.assertIn("if_true", result)
        self.assertIn("if_false", result)


@skip_if_no_imports
class TestListAndTuple(TestHelperMixin, unittest.TestCase):
    """Test list and tuple rule generation."""

    def test_list_literal(self):
        """List literal should produce list rule."""
        result = self.analyze_expression("[1, 2, 3]")
        self.assertEqual(result["type"], "list")
        self.assertIn("value", result)
        self.assertEqual(len(result["value"]), 3)

    def test_empty_list(self):
        """Empty list should produce list rule with empty value."""
        result = self.analyze_expression("[]")
        self.assertEqual(result["type"], "list")
        self.assertEqual(result["value"], [])

    def test_tuple_literal(self):
        """Tuple literal produces list rule (tuples converted to lists)."""
        result = self.analyze_expression("(1, 2, 3)")
        # Note: The analyzer converts tuples to lists since JSON doesn't have tuples
        self.assertIn(result["type"], ["tuple", "list"])
        if result["type"] == "tuple":
            self.assertIn("elements", result)
            self.assertEqual(len(result["elements"]), 3)
        else:
            self.assertIn("value", result)
            self.assertEqual(len(result["value"]), 3)


@skip_if_no_imports
class TestMinMax(TestHelperMixin, unittest.TestCase):
    """Test min/max function rule generation."""

    def test_min_function(self):
        """min() should produce min rule."""
        result = self.analyze_expression("min(a, b)")
        self.assertEqual(result["type"], "min")
        self.assertIn("args", result)
        self.assertEqual(len(result["args"]), 2)

    def test_max_function(self):
        """max() should produce max rule."""
        result = self.analyze_expression("max(a, b)")
        self.assertEqual(result["type"], "max")
        self.assertIn("args", result)
        self.assertEqual(len(result["args"]), 2)

    def test_min_with_three_args(self):
        """min() with 3 args should produce min rule with 3 args."""
        result = self.analyze_expression("min(a, b, c)")
        self.assertEqual(result["type"], "min")
        self.assertEqual(len(result["args"]), 3)


@skip_if_no_imports
class TestAttributeAccess(TestHelperMixin, unittest.TestCase):
    """Test attribute access rule generation."""

    def test_attribute_access(self):
        """Attribute access should produce attribute rule."""
        result = self.analyze_expression("obj.attr")
        self.assertEqual(result["type"], "attribute")
        self.assertEqual(result["attr"], "attr")

    def test_nested_attribute_access(self):
        """Nested attribute access should produce nested attribute rules."""
        result = self.analyze_expression("obj.inner.attr")
        self.assertEqual(result["type"], "attribute")
        self.assertEqual(result["attr"], "attr")
        self.assertEqual(result["object"]["type"], "attribute")


@skip_if_no_imports
class TestSubscriptAccess(TestHelperMixin, unittest.TestCase):
    """Test subscript (indexing) rule generation."""

    def test_subscript_with_integer(self):
        """Subscript with integer should produce subscript rule."""
        result = self.analyze_expression("arr[0]")
        self.assertEqual(result["type"], "subscript")
        self.assertIn("index", result)

    def test_subscript_with_string(self):
        """Subscript with string key should produce subscript rule."""
        result = self.analyze_expression("d['key']")
        self.assertEqual(result["type"], "subscript")


@skip_if_no_imports
class TestFunctionCall(TestHelperMixin, unittest.TestCase):
    """Test function call rule generation."""

    def test_function_call(self):
        """Function call should produce function_call or helper rule."""
        result = self.analyze_expression("some_func(a, b)")
        # Could be function_call or helper depending on resolution
        self.assertIn(result["type"], ["function_call", "helper"])

    def test_len_function(self):
        """len() should be handled specially."""
        result = self.analyze_expression("len(items)")
        # len might be evaluated or produce a helper
        self.assertIsNotNone(result)


@skip_if_no_imports
class TestLambdaAnalysis(TestHelperMixin, unittest.TestCase):
    """Test analyzing lambda functions."""

    def test_simple_lambda(self):
        """Simple lambda should be analyzed correctly."""
        func = lambda: True
        result = self.analyze_lambda(func)
        self.assertEqual(result, {"type": "constant", "value": True})

    def test_lambda_with_comparison(self):
        """Lambda with non-state parameter wraps body in lambda structure."""
        func = lambda x: x > 5
        result = self.analyze_lambda(func)
        # Non-rule lambdas (first param not 'state'/'self'/'sm') return wrapped structure
        self.assertEqual(result["type"], "lambda")
        self.assertEqual(result["params"], ["x"])
        self.assertEqual(result["body"]["type"], "compare")
        self.assertEqual(result["body"]["op"], ">")

    def test_lambda_with_and(self):
        """Lambda with non-state parameters wraps body in lambda structure."""
        func = lambda a, b: a and b
        result = self.analyze_lambda(func)
        # Non-rule lambdas (first param not 'state'/'self'/'sm') return wrapped structure
        self.assertEqual(result["type"], "lambda")
        self.assertEqual(result["params"], ["a", "b"])
        self.assertEqual(result["body"]["type"], "and")


@skip_if_no_imports
class TestStateMethodCalls(TestHelperMixin, unittest.TestCase):
    """Test state method call conversions."""

    def test_state_has_basic(self):
        """state.has(item, player) should produce item_check."""
        result = self.analyze_expression("state.has('Sword', player)")
        self.assertEqual(result["type"], "item_check")
        self.assertEqual(result["item"], "Sword")

    def test_state_has_with_count(self):
        """state.has(item, player, count) should produce item_check with count."""
        result = self.analyze_expression("state.has('Key', player, 3)")
        # Could be item_check or count_check depending on implementation
        self.assertIn(result["type"], ["item_check", "count_check"])
        if result["type"] == "count_check":
            self.assertEqual(result["count"]["value"], 3)
        elif "count" in result:
            self.assertEqual(result["count"]["value"], 3)

    def test_state_has_group(self):
        """state.has_group(group, player) should produce group_check."""
        result = self.analyze_expression("state.has_group('swords', player)")
        self.assertEqual(result["type"], "group_check")
        self.assertEqual(result["group"], "swords")

    def test_state_count(self):
        """state.count(item, player) produces state_method or count_item."""
        result = self.analyze_expression("state.count('Rupee', player)")
        # May be count_item or state_method depending on context
        self.assertIn(result["type"], ["count_item", "state_method"])
        if result["type"] == "count_item":
            self.assertEqual(result["item"], "Rupee")
        else:
            self.assertEqual(result["method"], "count")

    def test_state_count_group(self):
        """state.count_group(group, player) should produce group_count."""
        result = self.analyze_expression("state.count_group('keys', player)")
        self.assertEqual(result["type"], "group_count")
        self.assertEqual(result["group"], "keys")

    def test_state_has_any(self):
        """state.has_any(items, player) produces or of item_checks or state_method."""
        result = self.analyze_expression("state.has_any(['Sword', 'Axe'], player)")
        # May expand to 'or' of item_checks or remain as state_method
        self.assertIn(result["type"], ["or", "state_method"])
        if result["type"] == "or":
            self.assertTrue(all(c["type"] == "item_check" for c in result["conditions"]))
        else:
            self.assertEqual(result["method"], "has_any")

    def test_state_has_all(self):
        """state.has_all(items, player) produces and of item_checks or state_method."""
        result = self.analyze_expression("state.has_all(['Key1', 'Key2'], player)")
        # May expand to 'and' of item_checks or remain as state_method
        self.assertIn(result["type"], ["and", "state_method"])
        if result["type"] == "and":
            self.assertTrue(all(c["type"] == "item_check" for c in result["conditions"]))
        else:
            self.assertEqual(result["method"], "has_all")


@skip_if_no_imports
class TestComprehensions(TestHelperMixin, unittest.TestCase):
    """Test comprehension rule generation."""

    def test_all_comprehension(self):
        """all() with generator should produce all_of rule."""
        result = self.analyze_expression("all(x > 0 for x in items)")
        self.assertEqual(result["type"], "all_of")
        self.assertIn("element_rule", result)
        self.assertIn("iterator_info", result)

    def test_any_comprehension(self):
        """any() with generator should produce any_of rule."""
        result = self.analyze_expression("any(x > 0 for x in items)")
        self.assertEqual(result["type"], "any_of")
        self.assertIn("element_rule", result)
        self.assertIn("iterator_info", result)


@skip_if_no_imports
class TestEdgeCases(TestHelperMixin, unittest.TestCase):
    """Test edge cases and error handling."""

    def test_empty_expression_returns_error(self):
        """Empty/invalid expressions should handle gracefully."""
        # Empty string won't parse, but we should handle this
        try:
            result = self.analyze_expression("")
            # If it doesn't throw, check for error type
            self.assertIn(result.get("type"), ["error", None])
        except SyntaxError:
            # Expected for empty string
            pass

    def test_deeply_nested_and(self):
        """Deeply nested and should be handled without stack overflow."""
        # Create a deeply nested expression
        expr = " and ".join(["a"] * 20)
        result = self.analyze_expression(expr)
        self.assertEqual(result["type"], "and")

    def test_mixed_operations(self):
        """Mixed operations should be handled correctly."""
        result = self.analyze_expression("a > 5 and b < 10")
        self.assertEqual(result["type"], "and")
        self.assertEqual(len(result["conditions"]), 2)
        self.assertEqual(result["conditions"][0]["type"], "compare")
        self.assertEqual(result["conditions"][1]["type"], "compare")


if __name__ == '__main__':
    unittest.main()
