"""
Unit tests for the CLI snippet converter functionality.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from .cli import convert_snippet, detect_snippet_format


class TestDetectSnippetFormat(unittest.TestCase):
    """Test format detection for single rule snippets."""

    def test_detect_ast_format_item_check(self):
        """Test detection of AST format item_check."""
        rule = {"type": "item_check", "item": "Sword"}
        self.assertEqual(detect_snippet_format(rule), 'ast')

    def test_detect_ast_format_constant(self):
        """Test detection of AST format constant."""
        rule = {"type": "constant", "value": True}
        self.assertEqual(detect_snippet_format(rule), 'ast')

    def test_detect_ast_format_and(self):
        """Test detection of AST format and rule."""
        rule = {
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"}
            ]
        }
        self.assertEqual(detect_snippet_format(rule), 'ast')

    def test_detect_rb_format_has(self):
        """Test detection of Rule Builder format Has."""
        rule = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        self.assertEqual(detect_snippet_format(rule), 'rb')

    def test_detect_rb_format_true(self):
        """Test detection of Rule Builder format True_."""
        rule = {"rule": "True_", "options": [], "args": {}}
        self.assertEqual(detect_snippet_format(rule), 'rb')

    def test_detect_rb_format_and(self):
        """Test detection of Rule Builder format And."""
        rule = {
            "rule": "And",
            "options": [],
            "children": [
                {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
            ]
        }
        self.assertEqual(detect_snippet_format(rule), 'rb')

    def test_detect_unknown_format(self):
        """Test detection of unknown format."""
        rule = {"unknown_key": "value"}
        self.assertEqual(detect_snippet_format(rule), 'unknown')

    def test_detect_non_dict(self):
        """Test detection of non-dict input."""
        self.assertEqual(detect_snippet_format("not a dict"), 'unknown')
        self.assertEqual(detect_snippet_format(42), 'unknown')
        self.assertEqual(detect_snippet_format([1, 2, 3]), 'unknown')


class TestConvertSnippet(unittest.TestCase):
    """Test the convert_snippet function."""

    def test_convert_ast_to_rb(self):
        """Test converting AST format to Rule Builder format."""
        rule_json = '{"type": "item_check", "item": "Sword"}'
        exit_code, output = convert_snippet(rule_json)

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["rule"], "Has")
        self.assertEqual(result["args"]["item_name"], "Sword")

    def test_convert_rb_to_cc(self):
        """Test converting Rule Builder format to AST format."""
        rule_json = '{"rule": "Has", "options": [], "args": {"item_name": "Sword"}}'
        exit_code, output = convert_snippet(rule_json)

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["type"], "item_check")
        self.assertEqual(result["item"], "Sword")

    def test_convert_ast_to_cc_explicit(self):
        """Test explicit conversion to same format (CC to CC)."""
        rule_json = '{"type": "item_check", "item": "Sword"}'
        exit_code, output = convert_snippet(rule_json, target_format='ast')

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["type"], "item_check")

    def test_convert_rb_to_rb_explicit(self):
        """Test explicit conversion to same format (RB to RB)."""
        rule_json = '{"rule": "Has", "options": [], "args": {"item_name": "Sword"}}'
        exit_code, output = convert_snippet(rule_json, target_format='rb')

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["rule"], "Has")

    def test_convert_ast_to_rb_explicit(self):
        """Test explicit CC to RB conversion."""
        rule_json = '{"type": "item_check", "item": "Sword"}'
        exit_code, output = convert_snippet(rule_json, target_format='rb')

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["rule"], "Has")

    def test_convert_rb_to_cc_explicit(self):
        """Test explicit RB to CC conversion."""
        rule_json = '{"rule": "Has", "options": [], "args": {"item_name": "Sword"}}'
        exit_code, output = convert_snippet(rule_json, target_format='ast')

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["type"], "item_check")

    def test_convert_complex_rule(self):
        """Test converting a complex nested rule."""
        rule_json = json.dumps({
            "type": "and",
            "conditions": [
                {"type": "item_check", "item": "Sword"},
                {
                    "type": "or",
                    "conditions": [
                        {"type": "item_check", "item": "Shield"},
                        {"type": "item_check", "item": "Armor"}
                    ]
                }
            ]
        })
        exit_code, output = convert_snippet(rule_json)

        self.assertEqual(exit_code, 0)
        result = json.loads(output)
        self.assertEqual(result["rule"], "And")
        self.assertEqual(len(result["children"]), 2)

    def test_convert_invalid_json(self):
        """Test error handling for invalid JSON."""
        rule_json = "not valid json"
        exit_code, output = convert_snippet(rule_json)

        self.assertEqual(exit_code, 1)
        self.assertIn("Error", output)

    def test_convert_unknown_format_no_target(self):
        """Test error handling when format cannot be detected and no target specified."""
        rule_json = '{"unknown": "format"}'
        exit_code, output = convert_snippet(rule_json)

        self.assertEqual(exit_code, 1)
        self.assertIn("Could not auto-detect", output)

    def test_convert_unknown_format_with_target(self):
        """Test converting unknown format with explicit target."""
        # This will treat it as-is since it's not in the expected format
        rule_json = '{"unknown": "format"}'
        exit_code, output = convert_snippet(rule_json, target_format='ast')

        # Should succeed but produce a warning/unknown type
        self.assertEqual(exit_code, 0)

    def test_indent_option(self):
        """Test custom indentation."""
        rule_json = '{"type": "item_check", "item": "Sword"}'
        exit_code, output_2 = convert_snippet(rule_json, indent=2)
        exit_code, output_4 = convert_snippet(rule_json, indent=4)
        exit_code, output_0 = convert_snippet(rule_json, indent=0)

        # Check indent 2 has 2-space indentation
        self.assertIn('\n  ', output_2)
        # Check indent 4 has 4-space indentation
        self.assertIn('\n    ', output_4)
        # Check indent 0 is compact (no newlines)
        self.assertNotIn('\n', output_0)


class TestConvertSnippetRoundTrip(unittest.TestCase):
    """Test round-trip conversion of snippets."""

    def test_cc_to_rb_to_cc(self):
        """Test CC -> RB -> CC round-trip."""
        original = {"type": "item_check", "item": "Sword"}
        original_json = json.dumps(original)

        # CC -> RB
        exit_code, rb_json = convert_snippet(original_json, target_format='rb')
        self.assertEqual(exit_code, 0)

        # RB -> CC
        exit_code, cc_json = convert_snippet(rb_json, target_format='ast')
        self.assertEqual(exit_code, 0)

        result = json.loads(cc_json)
        self.assertEqual(result, original)

    def test_rb_to_cc_to_rb(self):
        """Test RB -> CC -> RB round-trip."""
        original = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}
        original_json = json.dumps(original)

        # RB -> CC
        exit_code, cc_json = convert_snippet(original_json, target_format='ast')
        self.assertEqual(exit_code, 0)

        # CC -> RB
        exit_code, rb_json = convert_snippet(cc_json, target_format='rb')
        self.assertEqual(exit_code, 0)

        result = json.loads(rb_json)
        self.assertEqual(result, original)


class TestCLIIntegration(unittest.TestCase):
    """Integration tests for the CLI using subprocess."""

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

    def test_cli_rule_flag(self):
        """Test --rule flag for command-line snippet."""
        result = self._run_cli([
            '--rule', '{"type": "item_check", "item": "Sword"}'
        ])

        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output["rule"], "Has")
        self.assertEqual(output["args"]["item_name"], "Sword")

    def test_cli_rule_flag_with_format(self):
        """Test --rule flag with explicit format."""
        result = self._run_cli([
            '--rule', '{"type": "item_check", "item": "Sword"}',
            '--format', 'rb'
        ])

        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output["rule"], "Has")

    def test_cli_stdin(self):
        """Test --stdin flag for pipe input."""
        result = self._run_cli(
            ['--stdin'],
            stdin_input='{"type": "item_check", "item": "Sword"}'
        )

        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertEqual(output["rule"], "Has")

    def test_cli_snippet_file(self):
        """Test --snippet flag for reading single rule from file."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({"type": "item_check", "item": "Sword"}, f)
            temp_path = f.name

        try:
            result = self._run_cli(['--snippet', temp_path])

            self.assertEqual(result.returncode, 0)
            output = json.loads(result.stdout)
            self.assertEqual(output["rule"], "Has")
        finally:
            Path(temp_path).unlink()

    def test_cli_output_file(self):
        """Test -o flag for output to file."""
        with tempfile.TemporaryDirectory() as temp_dir:
            output_path = Path(temp_dir) / "output.json"

            result = self._run_cli([
                '--rule', '{"type": "item_check", "item": "Sword"}',
                '-o', str(output_path)
            ])

            self.assertEqual(result.returncode, 0)
            self.assertTrue(output_path.exists())

            with open(output_path, 'r') as f:
                output = json.load(f)
            self.assertEqual(output["rule"], "Has")

    def test_cli_verbose(self):
        """Test -v flag for verbose output."""
        result = self._run_cli([
            '--rule', '{"type": "item_check", "item": "Sword"}',
            '-v'
        ])

        self.assertEqual(result.returncode, 0)
        self.assertIn("Detected snippet format", result.stderr)

    def test_cli_help(self):
        """Test --help flag."""
        result = self._run_cli(['--help'])

        self.assertEqual(result.returncode, 0)
        self.assertIn('--rule', result.stdout)
        self.assertIn('--stdin', result.stdout)
        self.assertIn('--snippet', result.stdout)

    def test_cli_invalid_json(self):
        """Test error handling for invalid JSON input."""
        result = self._run_cli([
            '--rule', 'not valid json'
        ])

        self.assertEqual(result.returncode, 1)
        self.assertIn("Error", result.stderr)


if __name__ == '__main__':
    unittest.main()
