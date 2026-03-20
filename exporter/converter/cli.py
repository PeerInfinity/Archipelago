#!/usr/bin/env python3
"""
Command-line interface for rule format conversion.

Supports conversion between:
- AST JSON format (cc)
- Rule Builder JSON format (rb)
- Python code (python)

Usage:
    # Convert JSON rule to Python code
    python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}' --to-python

    # Convert Python code to JSON rule
    python -m exporter.converter --python "lambda state: state.has('Sword')"

    # Convert Python code from stdin to JSON
    echo "state.has('Sword') and state.has('Shield')" | python -m exporter.converter --stdin --from-python

    # JSON format conversion (auto-detect and swap)
    python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}'

    # Full file conversion
    python -m exporter.converter input.json -o output.json --format cc
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List


def detect_snippet_format(rule: Any) -> str:
    """
    Detect the format of a single rule snippet.

    Args:
        rule: A single rule dictionary

    Returns:
        'rb' for Rule Builder format, 'ast' for AST format, 'unknown' otherwise
    """
    if not isinstance(rule, dict):
        return 'unknown'

    # Rule Builder format has 'rule' and 'options' keys
    if 'rule' in rule and 'options' in rule:
        return 'rb'

    # AST format has a 'type' key
    if 'type' in rule:
        return 'ast'

    return 'unknown'


def detect_format(data: Dict[str, Any]) -> str:
    """
    Auto-detect the format of a rules file.

    Args:
        data: Parsed JSON data

    Returns:
        'rb' for Rule Builder format, 'ast' for AST format, 'unknown' otherwise
    """
    # Check for Rule Builder format indicators
    if 'regions' in data:
        regions = data['regions']
        if regions:
            # Check first region's first location/exit for format indicators
            for player_regions in regions.values():
                for region_data in player_regions.values():
                    # Check exits
                    for exit_data in region_data.get('exits', []):
                        rule = exit_data.get('access_rule', {})
                        if isinstance(rule, dict):
                            if 'rule' in rule and 'options' in rule:
                                return 'rb'  # Rule Builder format
                            if 'type' in rule:
                                return 'ast'  # AST format

                    # Check locations
                    for loc_data in region_data.get('locations', []):
                        rule = loc_data.get('access_rule', {})
                        if isinstance(rule, dict):
                            if 'rule' in rule and 'options' in rule:
                                return 'rb'
                            if 'type' in rule:
                                return 'ast'

    return 'unknown'


def convert_file(
    input_path: str,
    output_path: Optional[str] = None,
    target_format: Optional[str] = None,
    indent: Optional[int] = None,
    verbose: bool = False
) -> int:
    """
    Convert a rules file between formats.

    Args:
        input_path: Path to input JSON file
        output_path: Path for output JSON file (default: stdout)
        target_format: Target format ('ast' or 'rb', None for auto-detect and convert)
        indent: JSON indentation (default: 2)
        verbose: Print warnings and info

    Returns:
        Exit code (0 for success, 1 for error)
    """
    # Import converters (avoid import issues at module level)
    from .rule_builder_to_cc import convert_rules_file_to_cc  # type: ignore[import-not-found]
    from .cc_to_rule_builder import convert_rules_file_to_rule_builder  # type: ignore[import-not-found]

    try:
        # Read input file
        input_file = Path(input_path)
        if not input_file.exists():
            print(f"Error: Input file not found: {input_path}", file=sys.stderr)
            return 1

        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if verbose:
            print(f"Loaded {input_path}", file=sys.stderr)

        # Detect input format
        input_format = detect_format(data)
        if verbose:
            print(f"Detected input format: {input_format}", file=sys.stderr)

        # Determine target format
        if target_format is None:
            # Auto-convert to opposite format
            if input_format == 'rb':
                target_format = 'ast'
            elif input_format == 'ast':
                target_format = 'rb'
            else:
                print("Error: Could not auto-detect input format. Please specify --format", file=sys.stderr)
                return 1

        if verbose:
            print(f"Target format: {target_format}", file=sys.stderr)

        # Perform conversion
        if target_format == 'ast':
            if input_format == 'ast':
                print("Warning: Input already in AST format, no conversion needed", file=sys.stderr)
                converted, warnings = data, []
            else:
                converted, warnings = convert_rules_file_to_cc(data)
                if verbose:
                    print(f"Converted from Rule Builder to AST format", file=sys.stderr)

        elif target_format == 'rb':
            if input_format == 'rb':
                print("Warning: Input already in Rule Builder format, no conversion needed", file=sys.stderr)
                converted, warnings = data, []
            else:
                converted, warnings = convert_rules_file_to_rule_builder(data)
                if verbose:
                    print(f"Converted from AST to Rule Builder format", file=sys.stderr)

        else:
            print(f"Error: Unknown target format '{target_format}'. Supported: cc, rb", file=sys.stderr)
            return 1

        # Report warnings
        if verbose and warnings:
            print(f"\nWarnings ({len(warnings)}):", file=sys.stderr)
            for w in warnings:
                print(f"  - {w}", file=sys.stderr)
            print(file=sys.stderr)

        # Output result
        output_json = json.dumps(converted, indent=indent, ensure_ascii=False)

        if output_path:
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(output_json)
            if verbose:
                print(f"Wrote {output_path}", file=sys.stderr)
        else:
            print(output_json)

        # Summary
        if verbose:
            print(f"\nConversion complete: {len(warnings)} warnings", file=sys.stderr)

        return 0

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in input file: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if verbose:
            import traceback
            traceback.print_exc()
        return 1


def convert_snippet(
    rule_json: str,
    target_format: Optional[str] = None,
    indent: int = 2,
    verbose: bool = False
) -> Tuple[int, str]:
    """
    Convert a single rule snippet between formats.

    Args:
        rule_json: JSON string containing a single rule
        target_format: Target format ('ast' or 'rb', None for auto-detect and convert)
        indent: JSON indentation (default: 2)
        verbose: Print warnings and info

    Returns:
        Tuple of (exit_code, output_json_string)
    """
    # Import converters
    from .rule_builder_to_ast import convert_rule_builder_to_ast
    from .ast_to_rule_builder import convert_ast_to_rule_builder

    try:
        rule = json.loads(rule_json)
    except json.JSONDecodeError as e:
        return 1, f"Error: Invalid JSON: {e}"

    # Detect input format
    input_format = detect_snippet_format(rule)
    if verbose:
        print(f"Detected snippet format: {input_format}", file=sys.stderr)

    # Determine target format
    if target_format is None:
        if input_format == 'rb':
            target_format = 'ast'
        elif input_format == 'ast':
            target_format = 'rb'
        else:
            return 1, "Error: Could not auto-detect format. Please specify --format"

    if verbose:
        print(f"Target format: {target_format}", file=sys.stderr)

    # Perform conversion
    warnings = []
    if target_format == 'ast':
        if input_format == 'ast':
            if verbose:
                print("Warning: Input already in AST format", file=sys.stderr)
            converted = rule
        else:
            converted, warnings = convert_rule_builder_to_ast(rule)
    elif target_format == 'rb':
        if input_format == 'rb':
            if verbose:
                print("Warning: Input already in Rule Builder format", file=sys.stderr)
            converted = rule
        else:
            converted, warnings = convert_ast_to_rule_builder(rule)
    else:
        return 1, f"Error: Unknown target format '{target_format}'"

    # Report warnings
    if verbose and warnings:
        print(f"\nWarnings ({len(warnings)}):", file=sys.stderr)
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)

    # Format output
    indent_val = indent if indent > 0 else None
    output_json = json.dumps(converted, indent=indent_val, ensure_ascii=False)

    return 0, output_json


def convert_python_code(
    python_code: str,
    indent: int = 2,
    verbose: bool = False
) -> Tuple[int, str]:
    """
    Convert Python code to JSON rule format.

    Args:
        python_code: Python code string (expression, lambda, or function)
        indent: JSON indentation (default: 2)
        verbose: Print warnings and info

    Returns:
        Tuple of (exit_code, output_json_string)
    """
    from .python_to_json import convert_python_to_json

    try:
        rule, warnings = convert_python_to_json(python_code)

        if verbose:
            print(f"Converted Python code to JSON", file=sys.stderr)
            if warnings:
                print(f"\nWarnings ({len(warnings)}):", file=sys.stderr)
                for w in warnings:
                    print(f"  - {w}", file=sys.stderr)

        indent_val = indent if indent > 0 else None
        output_json = json.dumps(rule, indent=indent_val, ensure_ascii=False)

        return 0, output_json

    except Exception as e:
        return 1, f"Error converting Python code: {e}"


def convert_json_to_python_code(
    rule_json: str,
    output_format: str = 'expression',
    verbose: bool = False
) -> Tuple[int, str]:
    """
    Convert JSON rule to Python code.

    Args:
        rule_json: JSON string containing a rule
        output_format: 'expression', 'lambda', or 'function'
        verbose: Print warnings and info

    Returns:
        Tuple of (exit_code, python_code_string)
    """
    from .json_to_python import convert_json_to_python, convert_json_to_lambda, convert_json_to_function

    try:
        rule = json.loads(rule_json)
    except json.JSONDecodeError as e:
        return 1, f"Error: Invalid JSON: {e}"

    try:
        if output_format == 'lambda':
            code, warnings = convert_json_to_lambda(rule)
        elif output_format == 'function':
            code, warnings = convert_json_to_function(rule)
        else:
            code, warnings = convert_json_to_python(rule)

        if verbose:
            print(f"Converted JSON to Python code", file=sys.stderr)
            if warnings:
                print(f"\nWarnings ({len(warnings)}):", file=sys.stderr)
                for w in warnings:
                    print(f"  - {w}", file=sys.stderr)

        return 0, code

    except Exception as e:
        return 1, f"Error converting JSON to Python: {e}"


def main():
    """Main entry point for CLI."""
    parser = argparse.ArgumentParser(
        description='Convert between Archipelago rule formats (JSON and Python)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Python <-> JSON conversion
  python -m exporter.converter --python "lambda state: state.has('Sword')"
  python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}' --to-python
  python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}' --to-python --py-format lambda

  # Convert Python from stdin to JSON
  echo "state.has('Sword') and state.has('Shield')" | python -m exporter.converter --stdin --from-python

  # JSON format conversion (auto-detect and swap between cc/rb)
  python -m exporter.converter --rule '{"type": "item_check", "item": "Sword"}'
  python -m exporter.converter --rule '{"rule": "Has", "options": [], "args": {"item_name": "Key"}}' --format cc

  # Full file conversion
  python -m exporter.converter input.json -o output.json --format cc

Supported formats:
  cc      AST JSON format (this repository)
  rb      Rule Builder JSON format (PR #5048)
  python  Python code (expressions, lambdas, or function definitions)

Python code conversion:
  --python CODE       Convert Python code to JSON
  --from-python       Interpret stdin as Python code (use with --stdin)
  --to-python         Convert JSON rule to Python code
  --py-format FMT     Python output format: expression (default), lambda, or function

Round-trip conversion:
  Python -> JSON -> Python and JSON -> Python -> JSON should produce
  semantically equivalent code for supported rule types.
        """
    )

    # Input sources (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group()
    input_group.add_argument(
        'input',
        nargs='?',
        help='Input JSON file path (full rules file)'
    )
    input_group.add_argument(
        '-r', '--rule',
        metavar='JSON',
        help='Single rule as JSON string (snippet mode)'
    )
    input_group.add_argument(
        '-p', '--python',
        metavar='CODE',
        help='Python code to convert to JSON'
    )
    input_group.add_argument(
        '--stdin',
        action='store_true',
        help='Read input from stdin'
    )
    input_group.add_argument(
        '-s', '--snippet',
        metavar='FILE',
        help='Single rule from JSON file (snippet mode, not full file)'
    )

    parser.add_argument(
        '-o', '--output',
        help='Output file path (default: stdout)'
    )

    parser.add_argument(
        '-f', '--format',
        choices=['ast', 'rb'],
        help='Target JSON format (default: auto-detect and convert to opposite)'
    )

    # Python conversion options
    parser.add_argument(
        '--to-python',
        action='store_true',
        help='Convert JSON rule to Python code'
    )

    parser.add_argument(
        '--from-python',
        action='store_true',
        help='Interpret stdin input as Python code (use with --stdin)'
    )

    parser.add_argument(
        '--py-format',
        choices=['expression', 'lambda', 'function'],
        default='expression',
        help='Python output format (default: expression)'
    )

    parser.add_argument(
        '--indent',
        type=int,
        default=2,
        help='JSON indentation (default: 2, use 0 for compact)'
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Print warnings and progress information'
    )

    args = parser.parse_args()

    indent = args.indent if args.indent > 0 else None

    # Determine input mode and process
    if args.python:
        # Convert Python code to JSON
        exit_code, output = convert_python_code(
            python_code=args.python,
            indent=args.indent,
            verbose=args.verbose
        )
    elif args.rule:
        if args.to_python:
            # Convert JSON rule to Python code
            exit_code, output = convert_json_to_python_code(
                rule_json=args.rule,
                output_format=args.py_format,
                verbose=args.verbose
            )
        else:
            # JSON-to-JSON conversion (original behavior)
            exit_code, output = convert_snippet(
                rule_json=args.rule,
                target_format=args.format,
                indent=args.indent,
                verbose=args.verbose
            )
    elif args.stdin:
        # Read from stdin
        input_text = sys.stdin.read().strip()
        if not input_text:
            print("Error: No input provided on stdin", file=sys.stderr)
            sys.exit(1)

        if args.from_python:
            # Interpret stdin as Python code
            exit_code, output = convert_python_code(
                python_code=input_text,
                indent=args.indent,
                verbose=args.verbose
            )
        elif args.to_python:
            # Convert JSON from stdin to Python
            exit_code, output = convert_json_to_python_code(
                rule_json=input_text,
                output_format=args.py_format,
                verbose=args.verbose
            )
        else:
            # JSON-to-JSON conversion (original behavior)
            exit_code, output = convert_snippet(
                rule_json=input_text,
                target_format=args.format,
                indent=args.indent,
                verbose=args.verbose
            )
    elif args.snippet:
        # Read snippet from file
        try:
            snippet_path = Path(args.snippet)
            if not snippet_path.exists():
                print(f"Error: File not found: {args.snippet}", file=sys.stderr)
                sys.exit(1)
            with open(snippet_path, 'r', encoding='utf-8') as f:
                file_content = f.read()

            if args.to_python:
                # Convert JSON file to Python
                exit_code, output = convert_json_to_python_code(
                    rule_json=file_content,
                    output_format=args.py_format,
                    verbose=args.verbose
                )
            else:
                # JSON-to-JSON conversion
                exit_code, output = convert_snippet(
                    rule_json=file_content,
                    target_format=args.format,
                    indent=args.indent,
                    verbose=args.verbose
                )
        except Exception as e:
            print(f"Error reading snippet file: {e}", file=sys.stderr)
            sys.exit(1)
    elif args.input:
        # Full file conversion (original behavior)
        sys.exit(convert_file(
            input_path=args.input,
            output_path=args.output,
            target_format=args.format,
            indent=indent,
            verbose=args.verbose
        ))
    else:
        parser.print_help()
        sys.exit(1)

    # Handle snippet output
    if exit_code != 0:
        print(output, file=sys.stderr)
        sys.exit(exit_code)

    if args.output:
        try:
            output_path = Path(args.output)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(output)
            if args.verbose:
                print(f"Wrote {args.output}", file=sys.stderr)
        except Exception as e:
            print(f"Error writing output: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(output)

    sys.exit(0)


if __name__ == '__main__':
    main()
