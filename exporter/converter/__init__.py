"""
Rule format converters for Archipelago.

This module provides bidirectional converters between:
- Rule Builder format (PR #5048)
- AST format (this repository)
- Python code (expressions, lambdas, function definitions)

Usage:
    from exporter.converter import (
        convert_rule_builder_to_ast,
        convert_ast_to_rule_builder,
        convert_python_to_json,
        convert_json_to_python,
    )

    # Convert Rule Builder -> AST format (single rule)
    ast_rule, warnings = convert_rule_builder_to_ast(rule_builder_json)

    # Convert AST -> Rule Builder format (single rule)
    rb_rule, warnings = convert_ast_to_rule_builder(ast_json)

    # Convert Python code to JSON
    json_rule, warnings = convert_python_to_json("lambda state: state.has('Sword')")

    # Convert JSON to Python
    python_code, warnings = convert_json_to_python({'type': 'item_check', 'item': 'Sword'})

    # Convert entire files
    ast_data, warnings = convert_rules_file_to_ast(rule_builder_file_data)
    rb_data, warnings = convert_rules_file_to_rule_builder(ast_file_data)

CLI usage:
    # Convert Python code to JSON
    python -m exporter.converter --python "lambda state: state.has('Sword')"

    # Convert JSON to Python
    python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}' --to-python

    # Convert snippet between JSON formats
    python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}'

    # Convert full file
    python -m exporter.converter input.json -o output.json
"""

from .rule_builder_to_ast import (
    convert_rule_builder_to_ast,
    convert_rules_file_to_ast,
    RuleBuilderToAST,
)

from .ast_to_rule_builder import (
    convert_ast_to_rule_builder,
    convert_rules_file_to_rule_builder,
    ASTToRuleBuilder,
)

from .cli import (
    convert_snippet,
    detect_snippet_format,
    convert_python_code,
    convert_json_to_python_code,
)

from .python_to_json import (
    convert_python_to_json,
    convert_lambda_to_json,
    convert_function_to_json,
    PythonToJSON,
)

from .json_to_python import (
    convert_json_to_python,
    convert_json_to_lambda,
    convert_json_to_function,
    JSONToPython,
)

__all__ = [
    # B -> A (Rule Builder -> AST)
    'convert_rule_builder_to_ast',
    'convert_rules_file_to_ast',
    'RuleBuilderToAST',
    # A -> B (AST -> Rule Builder)
    'convert_ast_to_rule_builder',
    'convert_rules_file_to_rule_builder',
    'ASTToRuleBuilder',
    # Snippet conversion (CLI and programmatic)
    'convert_snippet',
    'detect_snippet_format',
    'convert_python_code',
    'convert_json_to_python_code',
    # Python -> JSON
    'convert_python_to_json',
    'convert_lambda_to_json',
    'convert_function_to_json',
    'PythonToJSON',
    # JSON -> Python
    'convert_json_to_python',
    'convert_json_to_lambda',
    'convert_json_to_function',
    'JSONToPython',
]
