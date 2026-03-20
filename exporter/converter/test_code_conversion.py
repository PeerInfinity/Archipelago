"""
Unit tests for Python <-> JSON code conversion.
"""

import json
import subprocess
import sys
import unittest
from pathlib import Path

from .python_to_json import convert_python_to_json, PythonToJSON
from .json_to_python import convert_json_to_python, convert_json_to_lambda, JSONToPython


class TestPythonToJSON(unittest.TestCase):
    """Test Python to JSON conversion."""

    def test_simple_item_check(self):
        """Test converting state.has('Sword')."""
        rule, warnings = convert_python_to_json("state.has('Sword')")
        self.assertEqual(rule['type'], 'item_check')
        self.assertEqual(rule['item'], 'Sword')

    def test_item_check_with_count(self):
        """Test converting state.has('Arrow', 10)."""
        rule, warnings = convert_python_to_json("state.has('Arrow', 10)")
        self.assertEqual(rule['type'], 'item_check')
        self.assertEqual(rule['item'], 'Arrow')
        self.assertEqual(rule['count'], 10)

    def test_and_expression(self):
        """Test converting AND expression."""
        rule, warnings = convert_python_to_json("state.has('Sword') and state.has('Shield')")
        self.assertEqual(rule['type'], 'and')
        self.assertEqual(len(rule['conditions']), 2)

    def test_or_expression(self):
        """Test converting OR expression."""
        rule, warnings = convert_python_to_json("state.has('Sword') or state.has('Axe')")
        self.assertEqual(rule['type'], 'or')
        self.assertEqual(len(rule['conditions']), 2)

    def test_not_expression(self):
        """Test converting NOT expression."""
        rule, warnings = convert_python_to_json("not state.has('Sword')")
        self.assertEqual(rule['type'], 'not')
        self.assertEqual(rule['condition']['type'], 'item_check')

    def test_lambda_expression(self):
        """Test converting lambda."""
        rule, warnings = convert_python_to_json("lambda state: state.has('Sword')")
        self.assertEqual(rule['type'], 'item_check')
        self.assertEqual(rule['item'], 'Sword')

    def test_all_generator(self):
        """Test converting all() with generator."""
        rule, warnings = convert_python_to_json("all(state.has(item) for item in items)")
        self.assertEqual(rule['type'], 'all_of')
        self.assertEqual(rule['var'], 'item')

    def test_any_generator(self):
        """Test converting any() with generator."""
        rule, warnings = convert_python_to_json("any(state.has(item) for item in items)")
        self.assertEqual(rule['type'], 'any_of')
        self.assertEqual(rule['var'], 'item')

    def test_ternary_expression(self):
        """Test converting ternary expression."""
        rule, warnings = convert_python_to_json("True if state.has('Key') else False")
        self.assertEqual(rule['type'], 'conditional')

    def test_comparison(self):
        """Test converting comparison."""
        rule, warnings = convert_python_to_json("state.count('Arrow') >= 5")
        self.assertEqual(rule['type'], 'compare')
        self.assertEqual(rule['op'], '>=')

    def test_binary_operation(self):
        """Test converting binary operation."""
        rule, warnings = convert_python_to_json("x + y")
        self.assertEqual(rule['type'], 'binary_op')
        self.assertEqual(rule['op'], '+')

    def test_constant_true(self):
        """Test converting True constant."""
        rule, warnings = convert_python_to_json("True")
        self.assertEqual(rule['type'], 'constant')
        self.assertEqual(rule['value'], True)

    def test_constant_false(self):
        """Test converting False constant."""
        rule, warnings = convert_python_to_json("False")
        self.assertEqual(rule['type'], 'constant')
        self.assertEqual(rule['value'], False)

    def test_list_literal(self):
        """Test converting list literal."""
        rule, warnings = convert_python_to_json("['a', 'b', 'c']")
        self.assertEqual(rule['type'], 'list')
        self.assertEqual(len(rule['value']), 3)

    def test_group_check(self):
        """Test converting state.has_group()."""
        rule, warnings = convert_python_to_json("state.has_group('Keys', 3)")
        self.assertEqual(rule['type'], 'group_check')
        self.assertEqual(rule['group'], 'Keys')
        self.assertEqual(rule['count'], 3)


class TestJSONToPython(unittest.TestCase):
    """Test JSON to Python conversion."""

    def test_item_check_simple(self):
        """Test converting simple item_check."""
        rule = {'type': 'item_check', 'item': 'Sword'}
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, "state.has('Sword')")

    def test_item_check_with_count(self):
        """Test converting item_check with count."""
        rule = {'type': 'item_check', 'item': 'Arrow', 'count': 10}
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, "state.has('Arrow', 10)")

    def test_and_rule(self):
        """Test converting AND rule."""
        rule = {
            'type': 'and',
            'conditions': [
                {'type': 'item_check', 'item': 'Sword'},
                {'type': 'item_check', 'item': 'Shield'}
            ]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, "state.has('Sword') and state.has('Shield')")

    def test_or_rule(self):
        """Test converting OR rule."""
        rule = {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': 'Sword'},
                {'type': 'item_check', 'item': 'Axe'}
            ]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, "state.has('Sword') or state.has('Axe')")

    def test_not_rule(self):
        """Test converting NOT rule."""
        rule = {
            'type': 'not',
            'condition': {'type': 'item_check', 'item': 'Sword'}
        }
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, "not state.has('Sword')")

    def test_constant_true(self):
        """Test converting constant True."""
        rule = {'type': 'constant', 'value': True}
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, 'True')

    def test_constant_false(self):
        """Test converting constant False."""
        rule = {'type': 'constant', 'value': False}
        code, warnings = convert_json_to_python(rule)
        self.assertEqual(code, 'False')

    def test_conditional(self):
        """Test converting conditional."""
        rule = {
            'type': 'conditional',
            'test': {'type': 'item_check', 'item': 'Key'},
            'if_true': {'type': 'constant', 'value': True},
            'if_false': {'type': 'constant', 'value': False}
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('if', code)
        self.assertIn('else', code)

    def test_can_reach(self):
        """Test converting can_reach."""
        rule = {'type': 'can_reach', 'region': 'Castle'}
        code, warnings = convert_json_to_python(rule)
        self.assertIn('can_reach', code)
        self.assertIn('Castle', code)

    def test_group_check(self):
        """Test converting group_check."""
        rule = {'type': 'group_check', 'group': 'Keys', 'count': 3}
        code, warnings = convert_json_to_python(rule)
        self.assertIn('has_group', code)
        self.assertIn('Keys', code)

    def test_all_of(self):
        """Test converting all_of."""
        rule = {
            'type': 'all_of',
            'element_rule': {'type': 'item_check', 'item': {'type': 'name', 'name': 'item'}},
            'var': 'item',
            'iterable': {'type': 'name', 'name': 'items'}
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('all(', code)
        self.assertIn('for item in items', code)

    def test_any_of(self):
        """Test converting any_of."""
        rule = {
            'type': 'any_of',
            'element_rule': {'type': 'item_check', 'item': {'type': 'name', 'name': 'item'}},
            'var': 'item',
            'iterable': {'type': 'name', 'name': 'items'}
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('any(', code)

    def test_block_rule(self):
        """Test converting block rule."""
        rule = {
            'type': 'block',
            'statements': [
                {'type': 'assign', 'name': 'count', 'value': {'type': 'constant', 'value': 0}},
                {'type': 'return', 'value': {'type': 'name', 'name': 'count'}}
            ]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('count = 0', code)
        self.assertIn('return count', code)

    def test_for_range(self):
        """Test converting for_range."""
        rule = {
            'type': 'for_range',
            'var': 'i',
            'count': {'type': 'constant', 'value': 5},
            'body': [{'type': 'break'}]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('for i in range(5)', code)
        self.assertIn('break', code)

    def test_for_iter(self):
        """Test converting for_iter."""
        rule = {
            'type': 'for_iter',
            'var': 'item',
            'iterable': {'type': 'name', 'name': 'items'},
            'body': [{'type': 'continue'}]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('for item in items', code)
        self.assertIn('continue', code)

    def test_if_statement(self):
        """Test converting if_statement."""
        rule = {
            'type': 'if_statement',
            'test': {'type': 'item_check', 'item': 'Key'},
            'body': [{'type': 'break'}],
            'orelse': [{'type': 'continue'}]
        }
        code, warnings = convert_json_to_python(rule)
        self.assertIn('if', code)
        self.assertIn('else', code)

    def test_to_lambda(self):
        """Test converting to lambda format."""
        rule = {'type': 'item_check', 'item': 'Sword'}
        code, warnings = convert_json_to_lambda(rule)
        self.assertIn('lambda state:', code)


class TestRoundTrip(unittest.TestCase):
    """Test round-trip Python -> JSON -> Python conversion."""

    def _assert_round_trip(self, python_code):
        """Assert that Python -> JSON -> Python produces equivalent code."""
        # Python -> JSON
        json_rule, warnings1 = convert_python_to_json(python_code)
        # JSON -> Python
        result_code, warnings2 = convert_json_to_python(json_rule)

        # The result should be semantically similar, even if not identical
        # Re-parse both to JSON and compare
        json_rule2, warnings3 = convert_python_to_json(result_code)

        # Compare the JSON structures
        self.assertEqual(json_rule['type'], json_rule2['type'])

    def test_round_trip_item_check(self):
        """Test round-trip for simple item check."""
        self._assert_round_trip("state.has('Sword')")

    def test_round_trip_and(self):
        """Test round-trip for AND expression."""
        self._assert_round_trip("state.has('Sword') and state.has('Shield')")

    def test_round_trip_or(self):
        """Test round-trip for OR expression."""
        self._assert_round_trip("state.has('Sword') or state.has('Axe')")

    def test_round_trip_comparison(self):
        """Test round-trip for comparison."""
        # Parse and compare just the type and structure
        json_rule, _ = convert_python_to_json("5 >= 3")
        code, _ = convert_json_to_python(json_rule)
        json_rule2, _ = convert_python_to_json(code)
        self.assertEqual(json_rule['type'], json_rule2['type'])


class TestCLICodeConversion(unittest.TestCase):
    """Integration tests for CLI code conversion."""

    def _run_cli(self, args, stdin_input=None):
        """Run the CLI with given arguments."""
        cmd = [sys.executable, '-m', 'exporter.converter'] + args
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            input=stdin_input,
            cwd=Path(__file__).parent.parent.parent  # Project root
        )
        return result

    def test_cli_python_to_json(self):
        """Test --python flag."""
        result = self._run_cli(['--python', "state.has('Sword')"])
        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output['type'], 'item_check')
        self.assertEqual(output['item'], 'Sword')

    def test_cli_json_to_python(self):
        """Test --to-python flag."""
        result = self._run_cli([
            '--rule', '{"type": "item_check", "item": "Sword"}',
            '--to-python'
        ])
        self.assertEqual(result.returncode, 0)
        self.assertIn("state.has('Sword')", result.stdout)

    def test_cli_json_to_lambda(self):
        """Test --to-python with --py-format lambda."""
        result = self._run_cli([
            '--rule', '{"type": "item_check", "item": "Sword"}',
            '--to-python',
            '--py-format', 'lambda'
        ])
        self.assertEqual(result.returncode, 0)
        self.assertIn('lambda state:', result.stdout)

    def test_cli_stdin_from_python(self):
        """Test --stdin --from-python."""
        result = self._run_cli(
            ['--stdin', '--from-python'],
            stdin_input="state.has('Sword') and state.has('Shield')"
        )
        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output['type'], 'and')

    def test_cli_stdin_to_python(self):
        """Test --stdin --to-python."""
        result = self._run_cli(
            ['--stdin', '--to-python'],
            stdin_input='{"type": "item_check", "item": "Sword"}'
        )
        self.assertEqual(result.returncode, 0)
        self.assertIn("state.has('Sword')", result.stdout)


if __name__ == '__main__':
    unittest.main()
