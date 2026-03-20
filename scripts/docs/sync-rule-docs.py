#!/usr/bin/env python3
"""
Sync Rule Documentation

This script extracts rule types from implementation code and documentation,
then compares them to identify discrepancies. It can also auto-generate
documentation stubs for undocumented rules.

Usage:
    python scripts/docs/sync-rule-docs.py                    # Check for discrepancies
    python scripts/docs/sync-rule-docs.py --verbose          # Show all extracted types
    python scripts/docs/sync-rule-docs.py --generate         # Generate missing doc entries
    python scripts/docs/sync-rule-docs.py --update           # Update the reference doc

The script extracts from:
    - frontend/modules/shared/ruleEngine.js (JavaScript case statements)
    - rule_builder/rules.py (Python Rule Builder classes)
    - rule_builder/ast_format.py (Python AST parser handlers)
    - docs/json/developer/reference/rule-types-reference.md (documentation)
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple


class SourceLocation(NamedTuple):
    """Location in source code where a rule type is implemented."""
    file: str
    line: int
    context: str  # e.g., "case statement", "class definition"


# Mapping between AST format types and Rule Builder class names
# These are equivalent - implementing one means the other is covered
AST_TO_RULE_BUILDER: dict[str, str] = {
    # AST format -> Rule Builder class
    'item_check': 'Has',
    'count_check': 'Has',  # Has with count
    'group_check': 'HasGroup',
    'can_reach': 'CanReachRegion',
    'region_check': 'CanReachRegion',
    'location_check': 'CanReachLocation',
    'can_reach_entrance': 'CanReachEntrance',
    'conditional': 'Conditional',
    'constant': 'True_',  # or False_
    'value': 'Constant',
    'binary_op': 'Arithmetic',
    'binop': 'Arithmetic',
    'compare': 'Compare',
    'comparison': 'Compare',
    'count_item': 'CountItem',
    'group_count': 'CountGroup',
}

# Internal/wrapper types that are implementation details
INTERNAL_TYPES = {
    # AST_ prefixed wrappers for Rule Builder format
    'AST_location_rule_ref', 'AST_setting_value', 'AST_function_call',
    'AST_block', 'AST_prog_item_count', 'AST_count_true',
    'AST_weighted_count_true', 'AST_placement_lookup', 'AST_placement_search',
    # Internal classes
    'ASTRule', 'OptionFilter', 'EntranceAccessRuleCall',
    # Documentation internal types
    'comprehension_details', 'formatted_value', 'unknown',
    # Aliases (same as another type)
    'value',  # alias of constant
    'ItemCheck',  # frontend alias of item_check
    'StateMethod',  # frontend alias of state_method
    'Count',  # alias of CountItem
    # Python constructs (not really rule types)
    'lambda', 'map', 'is',
    # Example/placeholder types in docs
    'some_unknown_type', 'rule', 'body_data', 'in',
    # Function names supported by 'call' type (not independent rule types)
    'all', 'any', 'bool', 'int', 'len', 'sum', 'abs', 'max', 'min',
}

# Types that are documented as "proposed" but not yet implemented
PROPOSED_TYPES = {
    'Contains', 'Negate', 'Subscript', 'Sum',
}


@dataclass
class RuleTypeInfo:
    """Information about a rule type."""
    name: str
    category: str = ""  # e.g., "logical", "item", "reachability"
    description: str = ""
    fields: list[str] = field(default_factory=list)
    sources: list[SourceLocation] = field(default_factory=list)
    documented: bool = False
    doc_location: str = ""  # Line in documentation where it appears


def get_project_root() -> Path:
    """Get the project root directory."""
    # Script is at scripts/docs/sync-rule-docs.py
    return Path(__file__).parent.parent.parent


def extract_js_rule_types(filepath: Path) -> dict[str, RuleTypeInfo]:
    """
    Extract rule types from JavaScript ruleEngine.js case statements.

    Looks for patterns like:
        case 'rule_type':
        case "rule_type":
    """
    rule_types: dict[str, RuleTypeInfo] = {}

    if not filepath.exists():
        print(f"Warning: {filepath} not found", file=sys.stderr)
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')

    # Match case statements: case 'type': or case "type":
    case_pattern = re.compile(r"^\s*case\s+['\"](\w+)['\"]:\s*(?:\{)?")

    # Match handler object keys: 'type': (rule, context, ... => {
    # This pattern is used in modular handler files (astLogic.js, astChecks.js, etc.)
    handler_key_pattern = re.compile(
        r"^\s+['\"](\w+)['\"]\s*:\s*\(rule\s*,"
    )

    skip_types = {'items', 'keys', 'values', 'get', 'index', 'count',
                  'capitalize', 'upper', 'lower', 'strip', 'lstrip',
                  'rstrip', 'startswith', 'endswith', 'replace',
                  'split', 'join', '__contains__', 'sqrt', 'pow',
                  'floor', 'ceil', 'abs', 'eq', 'ne', 'lt', 'le',
                  'gt', 'ge', 'in', 'AND', 'OR',
                  'has', 'has_group',
                  'append', 'extend', 'pop', 'clear'}

    for i, line in enumerate(lines, 1):
        match = case_pattern.match(line) or handler_key_pattern.match(line)
        if match:
            rule_type = match.group(1)
            # Skip internal helper cases like method names
            if rule_type in skip_types:
                continue

            if rule_type not in rule_types:
                rule_types[rule_type] = RuleTypeInfo(name=rule_type)

            rule_types[rule_type].sources.append(
                SourceLocation(
                    file=str(filepath.relative_to(get_project_root())),
                    line=i,
                    context="case statement"
                )
            )

    return rule_types


def extract_python_rule_classes(filepath: Path) -> dict[str, RuleTypeInfo]:
    """
    Extract Rule Builder classes from rules.py.

    Looks for class definitions that inherit from Rule or related base classes.
    """
    rule_types: dict[str, RuleTypeInfo] = {}

    if not filepath.exists():
        print(f"Warning: {filepath} not found", file=sys.stderr)
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')

    # Match class definitions: class ClassName(Rule... or similar bases
    class_pattern = re.compile(
        r'^class\s+(\w+)\s*\(\s*(?:Rule|NestedRule|WrapperRule|Generic)'
    )

    for i, line in enumerate(lines, 1):
        match = class_pattern.match(line)
        if match:
            class_name = match.group(1)
            # Skip base classes and internal classes
            if class_name in {'Rule', 'NestedRule', 'WrapperRule', 'Resolved'}:
                continue

            if class_name not in rule_types:
                rule_types[class_name] = RuleTypeInfo(name=class_name)

            rule_types[class_name].sources.append(
                SourceLocation(
                    file=str(filepath.relative_to(get_project_root())),
                    line=i,
                    context="class definition"
                )
            )

    return rule_types


def extract_ast_format_handlers(filepath: Path) -> dict[str, RuleTypeInfo]:
    """
    Extract AST format type handlers from ast_format.py.

    Looks for patterns like:
        elif rule_type == 'type_name':
        if rule_type == 'type_name':
    """
    rule_types: dict[str, RuleTypeInfo] = {}

    if not filepath.exists():
        print(f"Warning: {filepath} not found", file=sys.stderr)
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')

    # Match type checks: if/elif rule_type == 'type'
    type_pattern = re.compile(r"^\s*(?:el)?if\s+rule_type\s*==\s*['\"](\w+)['\"]")

    for i, line in enumerate(lines, 1):
        match = type_pattern.match(line)
        if match:
            rule_type = match.group(1)

            if rule_type not in rule_types:
                rule_types[rule_type] = RuleTypeInfo(name=rule_type)

            rule_types[rule_type].sources.append(
                SourceLocation(
                    file=str(filepath.relative_to(get_project_root())),
                    line=i,
                    context="type handler"
                )
            )

    return rule_types


def extract_documented_types(filepath: Path) -> dict[str, RuleTypeInfo]:
    """
    Extract documented rule types from the reference markdown.

    Looks for table entries and code blocks mentioning rule types.
    """
    rule_types: dict[str, RuleTypeInfo] = {}

    if not filepath.exists():
        print(f"Warning: {filepath} not found", file=sys.stderr)
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')

    current_category = ""

    for i, line in enumerate(lines, 1):
        # Track category headers
        if line.startswith('### '):
            current_category = line[4:].strip()
            continue

        # Match table rows: | `type_name` | description |
        # Handle multiple formats: | `type` |, | `type` / `alias` |, | `type` (note) |
        # Also handle mid-row backticked types
        backtick_pattern = re.compile(r'`(\w+)`')
        if line.strip().startswith('|'):
            # This is a table row
            for match in backtick_pattern.finditer(line):
                type_name = match.group(1)
                # Skip common words that aren't type names (field names, keywords)
                if type_name in {'optional', 'none', 'true', 'false', 'value',
                                 'items', 'count', 'item', 'group', 'region',
                                 'location', 'entrance', 'name', 'args', 'type',
                                 'test', 'body', 'op', 'left', 'right', 'attr',
                                 'object', 'method', 'threshold', 'Rule', 'Builder',
                                 'if_true', 'if_false', 'condition', 'conditions',
                                 'operand', 'iterable', 'iterator', 'iterator_info',
                                 'element', 'element_rule', 'comprehension', 'target',
                                 'function', 'player', 'locations', 'setting', 'option',
                                 'index', 'lower', 'upper', 'step', 'var', 'weight',
                                 'weights', 'default', 'key', 'keys', 'values',
                                 'elements', 'parts', 'statements', 'orelse',
                                 'entrance_name', 'fake_pearl', 'func', 'item_names'}:
                    continue
                if type_name not in rule_types:
                    rule_types[type_name] = RuleTypeInfo(
                        name=type_name,
                        category=current_category
                    )
                rule_types[type_name].documented = True
                rule_types[type_name].doc_location = f"line {i}"
                if current_category:
                    rule_types[type_name].category = current_category

        # Also match type mentions in JSON examples: "type": "rule_name"
        json_type_pattern = re.compile(r'"type":\s*"(\w+)"')
        for match in json_type_pattern.finditer(line):
            type_name = match.group(1)
            if type_name not in rule_types:
                rule_types[type_name] = RuleTypeInfo(
                    name=type_name,
                    category=current_category
                )
            rule_types[type_name].documented = True
            if not rule_types[type_name].doc_location:
                rule_types[type_name].doc_location = f"line {i}"

        # Match "rule": "RuleName" for Rule Builder format
        rb_pattern = re.compile(r'"rule":\s*"(\w+)"')
        for match in rb_pattern.finditer(line):
            type_name = match.group(1)
            if type_name not in rule_types:
                rule_types[type_name] = RuleTypeInfo(
                    name=type_name,
                    category=current_category
                )
            rule_types[type_name].documented = True
            if not rule_types[type_name].doc_location:
                rule_types[type_name].doc_location = f"line {i}"

    return rule_types


def categorize_rule_type(name: str) -> str:
    """Guess a category for a rule type based on its name."""
    name_lower = name.lower()

    if any(x in name_lower for x in ['and', 'or', 'not', 'conditional', 'true', 'false']):
        return "Logical Operators"
    if any(x in name_lower for x in ['item', 'has', 'count', 'group', 'prog']):
        return "Item & Inventory Checks"
    if any(x in name_lower for x in ['reach', 'location', 'region', 'entrance', 'capability']):
        return "Access & Reachability"
    if any(x in name_lower for x in ['compare', 'binary', 'arithmetic', 'min', 'max', 'negate']):
        return "Arithmetic & Comparison"
    if any(x in name_lower for x in ['constant', 'value', 'name', 'attribute', 'subscript',
                                      'list', 'set', 'tuple', 'option', 'setting', 'world']):
        return "Data & Values"
    if any(x in name_lower for x in ['helper', 'function', 'method', 'call']):
        return "Functions & Helpers"
    if any(x in name_lower for x in ['all_of', 'any_of', 'sum_of', 'generator', 'for', 'iter']):
        return "Generators & Iteration"
    if any(x in name_lower for x in ['block', 'assign', 'return', 'while', 'if_statement',
                                      'break', 'continue']):
        return "Imperative/Block Types"
    if any(x in name_lower for x in ['placement']):
        return "Placement Lookups"

    return "Uncategorized"


def generate_doc_entry(rule_info: RuleTypeInfo) -> str:
    """Generate a markdown table row for a rule type."""
    # Try to determine category
    category = rule_info.category or categorize_rule_type(rule_info.name)

    # Generate description based on name patterns
    name = rule_info.name
    desc = f"[TODO: Add description for `{name}`]"

    # Common pattern-based descriptions
    if name.startswith('Has'):
        desc = f"Check for {name.replace('Has', '').lower()} items"
    elif name.startswith('Can'):
        desc = f"Check if can {name.replace('Can', '').lower()}"
    elif name.startswith('Count'):
        desc = f"Get count of {name.replace('Count', '').lower()}"
    elif name == 'constant':
        desc = "Literal constant value"
    elif name == 'name':
        desc = "Variable/name reference"
    elif name == 'attribute':
        desc = "Property access (obj.attr)"

    fields = ", ".join(rule_info.fields) if rule_info.fields else "[TODO]"
    example = f'{{"type": "{name}", ...}}'

    return f"| `{name}` | {desc} | {fields} | `{example}` |"


def main():
    parser = argparse.ArgumentParser(
        description="Sync rule type documentation with implementation code"
    )
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help="Show all extracted types"
    )
    parser.add_argument(
        '--generate', '-g',
        action='store_true',
        help="Generate doc entries for undocumented types"
    )
    parser.add_argument(
        '--update', '-u',
        action='store_true',
        help="Update the reference documentation file"
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help="Output as JSON for programmatic use"
    )
    args = parser.parse_args()

    root = get_project_root()

    # Extract from all sources
    print("Extracting rule types from source code...")

    # Scan ruleEngine/ directory (modular) + facade file
    js_types: dict[str, RuleTypeInfo] = {}
    rule_engine_dir = root / "frontend/modules/shared/ruleEngine"
    if rule_engine_dir.is_dir():
        for js_file in sorted(rule_engine_dir.glob("*.js")):
            file_types = extract_js_rule_types(js_file)
            for name, info in file_types.items():
                if name not in js_types:
                    js_types[name] = info
                else:
                    js_types[name].sources.extend(info.sources)
    else:
        js_types = extract_js_rule_types(
            root / "frontend/modules/shared/ruleEngine.js"
        )
    print(f"  ruleEngine modules: {len(js_types)} types")

    py_classes = extract_python_rule_classes(
        root / "rule_builder/rules.py"
    )
    print(f"  rules.py: {len(py_classes)} classes")

    ast_types = extract_ast_format_handlers(
        root / "rule_builder/ast_format.py"
    )
    print(f"  ast_format.py: {len(ast_types)} types")

    doc_types = extract_documented_types(
        root / "docs/json/developer/reference/rule-types-reference.md"
    )
    print(f"  rule-types-reference.md: {len(doc_types)} types")

    # Also check the format specification
    spec_types = extract_documented_types(
        root / "docs/json/developer/specs/rule-format-specification.md"
    )
    print(f"  rule-format-specification.md: {len(spec_types)} types")

    # Merge spec types into doc_types
    for name, info in spec_types.items():
        if name not in doc_types:
            doc_types[name] = info
        else:
            # Already documented in reference, just note it
            pass

    print(f"  Total documented: {len(doc_types)} types")

    # Merge all types
    all_implemented: dict[str, RuleTypeInfo] = {}

    for types_dict in [js_types, py_classes, ast_types]:
        for name, info in types_dict.items():
            if name not in all_implemented:
                all_implemented[name] = info
            else:
                all_implemented[name].sources.extend(info.sources)

    # Check which are documented (including via equivalent types)
    for name in all_implemented:
        if name in doc_types:
            all_implemented[name].documented = True
            all_implemented[name].doc_location = doc_types[name].doc_location
            all_implemented[name].category = doc_types[name].category
        # Check if an equivalent type is documented
        elif name in AST_TO_RULE_BUILDER and AST_TO_RULE_BUILDER[name] in doc_types:
            all_implemented[name].documented = True
            all_implemented[name].doc_location = f"via {AST_TO_RULE_BUILDER[name]}"
        # Check reverse mapping
        else:
            for ast_type, rb_type in AST_TO_RULE_BUILDER.items():
                if rb_type == name and ast_type in doc_types:
                    all_implemented[name].documented = True
                    all_implemented[name].doc_location = f"via {ast_type}"
                    break

    # Find documented but not implemented (excluding internal and proposed types)
    doc_only = {name: info for name, info in doc_types.items()
                if name not in all_implemented
                and name not in INTERNAL_TYPES
                and name not in PROPOSED_TYPES}

    # Find undocumented (excluding internal types)
    undocumented = {name: info for name, info in all_implemented.items()
                    if not info.documented and name not in INTERNAL_TYPES}

    if args.json:
        output = {
            "implemented": {
                name: {
                    "sources": [
                        {"file": s.file, "line": s.line, "context": s.context}
                        for s in info.sources
                    ],
                    "documented": info.documented,
                    "category": info.category or categorize_rule_type(name)
                }
                for name, info in all_implemented.items()
            },
            "documented_only": list(doc_only.keys()),
            "undocumented": list(undocumented.keys()),
            "summary": {
                "total_implemented": len(all_implemented),
                "total_documented": len(doc_types),
                "undocumented_count": len(undocumented),
                "doc_only_count": len(doc_only)
            }
        }
        print(json.dumps(output, indent=2))
        return

    print()
    print("=" * 60)
    print("SYNC REPORT")
    print("=" * 60)

    # Summary
    print(f"\nTotal implemented types: {len(all_implemented)}")
    print(f"Total documented types:  {len(doc_types)}")
    print(f"Undocumented:            {len(undocumented)}")
    print(f"Documented but unused:   {len(doc_only)}")

    # Verbose output
    if args.verbose:
        print("\n--- All Implemented Types ---")
        for name in sorted(all_implemented.keys()):
            info = all_implemented[name]
            status = "✓" if info.documented else "✗"
            sources = ", ".join(f"{s.file}:{s.line}" for s in info.sources[:2])
            print(f"  [{status}] {name}: {sources}")

    # Undocumented types
    if undocumented:
        print("\n--- Undocumented Types (need documentation) ---")
        # Group by category
        by_category: dict[str, list[str]] = {}
        for name in undocumented:
            cat = categorize_rule_type(name)
            by_category.setdefault(cat, []).append(name)

        for cat in sorted(by_category.keys()):
            print(f"\n  {cat}:")
            for name in sorted(by_category[cat]):
                info = undocumented[name]
                sources = ", ".join(f"{s.file}:{s.line}" for s in info.sources[:2])
                print(f"    - {name} ({sources})")

    # Documented but not implemented
    if doc_only:
        print("\n--- Documented but Not Found in Code (may be deprecated) ---")
        for name in sorted(doc_only.keys()):
            info = doc_only[name]
            print(f"  - {name} (doc {info.doc_location})")

    # Generate documentation stubs
    if args.generate and undocumented:
        print("\n--- Generated Documentation Stubs ---")
        print("Add these to the appropriate sections in rule-types-reference.md:\n")

        by_category: dict[str, list[str]] = {}
        for name in undocumented:
            cat = categorize_rule_type(name)
            by_category.setdefault(cat, []).append(name)

        for cat in sorted(by_category.keys()):
            print(f"\n### {cat}\n")
            print("| Type | Description | Fields | Example |")
            print("|------|-------------|--------|---------|")
            for name in sorted(by_category[cat]):
                info = undocumented[name]
                print(generate_doc_entry(info))

    # Return exit code based on sync status
    if undocumented or doc_only:
        print(f"\n⚠️  Documentation is out of sync!")
        print("Run with --generate to see documentation stubs.")
        sys.exit(1)
    else:
        print("\n✓ Documentation is in sync with code!")
        sys.exit(0)


if __name__ == "__main__":
    main()
