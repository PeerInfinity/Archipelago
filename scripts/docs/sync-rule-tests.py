#!/usr/bin/env python3
"""
Sync Rule Test Coverage

This script extracts rule types from implementation code and test files,
then compares them to identify which rule types lack test coverage.

Usage:
    python scripts/docs/sync-rule-tests.py                    # Check test coverage
    python scripts/docs/sync-rule-tests.py --verbose          # Show all extracted types
    python scripts/docs/sync-rule-tests.py --json             # JSON output for CI

The script extracts implemented types from:
    - frontend/modules/shared/ruleEngine.js (JavaScript case statements)
    - rule_builder/rules.py (Python Rule Builder classes)
    - rule_builder/ast_format.py (Python AST parser handlers)

And tested types from:
    - test_json/fixtures/rule_type_tests.json (shared cross-language fixtures)
    - test_json/rule_builder/test_rules.py (Rule Builder unit tests)
    - test_json/rule_builder/test_ast_format.py (AST format tests)
    - test_json/rule_builder/test_serialization.py (serialization tests)
    - test_json/test_rule_fixtures.py (fixture runner tests)
    - exporter/converter/test_*.py (converter tests)
    - frontend/modules/shared/ruleEngine.test.js (JS unit tests)
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple


class SourceLocation(NamedTuple):
    """Location in source code where a rule type is implemented or tested."""
    file: str
    line: int
    context: str


# Mapping between AST format types and Rule Builder class names
# Also includes case mappings (e.g., list -> List)
AST_TO_RULE_BUILDER: dict[str, str] = {
    # Core mappings
    'item_check': 'Has',
    'count_check': 'Has',
    'group_check': 'HasGroup',
    'can_reach': 'CanReachRegion',
    'region_check': 'CanReachRegion',
    'location_check': 'CanReachLocation',
    'can_reach_entrance': 'CanReachEntrance',
    'conditional': 'Conditional',
    'constant': 'True_',
    'value': 'Constant',
    'binary_op': 'Arithmetic',
    'binop': 'Arithmetic',
    'compare': 'Compare',
    'comparison': 'Compare',
    'count_item': 'CountItem',
    'group_count': 'CountGroup',
    # Case mappings (AST snake_case -> Rule Builder PascalCase)
    'list': 'List',
    'tuple': 'Tuple',
    'name': 'Name',
    'attribute': 'Attribute',
    'subscript': 'Subscript',
    'min': 'MinValue',
    'max': 'MaxValue',
    'and': 'And',
    'or': 'Or',
    'not': 'Not',
    'negate': 'Negate',
    'setting_value': 'SettingValue',
    'option_value': 'OptionValue',
}

# Internal types to exclude from coverage reports
INTERNAL_TYPES = {
    'AST_location_rule_ref', 'AST_setting_value', 'AST_function_call',
    'AST_block', 'AST_prog_item_count', 'AST_count_true',
    'AST_weighted_count_true', 'AST_placement_lookup', 'AST_placement_search',
    'ASTRule', 'OptionFilter', 'EntranceAccessRuleCall',
    'value', 'ItemCheck', 'StateMethod', 'Count',
    'lambda', 'map', 'is',
    'some_unknown_type', 'rule', 'body_data', 'in',
}


@dataclass
class RuleTypeInfo:
    """Information about a rule type."""
    name: str
    category: str = ""
    impl_sources: list[SourceLocation] = field(default_factory=list)
    test_sources: list[SourceLocation] = field(default_factory=list)

    @property
    def is_tested(self) -> bool:
        return len(self.test_sources) > 0


def get_project_root() -> Path:
    return Path(__file__).parent.parent.parent


# ============================================================================
# Implementation extraction (same as sync-rule-docs.py)
# ============================================================================

def extract_js_rule_types(filepath: Path) -> dict[str, RuleTypeInfo]:
    """Extract rule types from JavaScript ruleEngine.js case statements."""
    rule_types: dict[str, RuleTypeInfo] = {}
    if not filepath.exists():
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')
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
                  'gt', 'ge', 'AND', 'OR',
                  'has', 'has_group',
                  'append', 'extend', 'pop', 'clear'}

    for i, line in enumerate(lines, 1):
        match = case_pattern.match(line) or handler_key_pattern.match(line)
        if match:
            rule_type = match.group(1)
            if rule_type in skip_types:
                continue
            if rule_type not in rule_types:
                rule_types[rule_type] = RuleTypeInfo(name=rule_type)
            rule_types[rule_type].impl_sources.append(
                SourceLocation(str(filepath.relative_to(get_project_root())), i, "case statement")
            )

    return rule_types


def extract_python_rule_classes(filepath: Path) -> dict[str, RuleTypeInfo]:
    """Extract Rule Builder classes from rules.py."""
    rule_types: dict[str, RuleTypeInfo] = {}
    if not filepath.exists():
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')
    class_pattern = re.compile(r'^class\s+(\w+)\s*\(\s*(?:Rule|NestedRule|WrapperRule|Generic)')

    for i, line in enumerate(lines, 1):
        match = class_pattern.match(line)
        if match:
            class_name = match.group(1)
            if class_name in {'Rule', 'NestedRule', 'WrapperRule', 'Resolved'}:
                continue
            if class_name not in rule_types:
                rule_types[class_name] = RuleTypeInfo(name=class_name)
            rule_types[class_name].impl_sources.append(
                SourceLocation(str(filepath.relative_to(get_project_root())), i, "class definition")
            )

    return rule_types


def extract_ast_format_handlers(filepath: Path) -> dict[str, RuleTypeInfo]:
    """Extract AST format type handlers from ast_format.py."""
    rule_types: dict[str, RuleTypeInfo] = {}
    if not filepath.exists():
        return rule_types

    content = filepath.read_text()
    lines = content.split('\n')
    type_pattern = re.compile(r"^\s*(?:el)?if\s+rule_type\s*==\s*['\"](\w+)['\"]")

    for i, line in enumerate(lines, 1):
        match = type_pattern.match(line)
        if match:
            rule_type = match.group(1)
            if rule_type not in rule_types:
                rule_types[rule_type] = RuleTypeInfo(name=rule_type)
            rule_types[rule_type].impl_sources.append(
                SourceLocation(str(filepath.relative_to(get_project_root())), i, "type handler")
            )

    return rule_types


# ============================================================================
# Test extraction
# ============================================================================

def extract_fixture_tested_types(filepath: Path) -> dict[str, list[SourceLocation]]:
    """
    Extract tested rule types from test_json/fixtures/rule_type_tests.json.

    Returns a dict mapping rule type names to test locations.
    """
    tested: dict[str, list[SourceLocation]] = {}
    if not filepath.exists():
        return tested

    try:
        data = json.loads(filepath.read_text())
    except json.JSONDecodeError:
        return tested

    rel_path = str(filepath.relative_to(get_project_root()))

    # Each key in test_suites is a rule type being tested
    for suite_name in data.get('test_suites', {}):
        if suite_name not in tested:
            tested[suite_name] = []
        tested[suite_name].append(
            SourceLocation(rel_path, 0, f"test_suite '{suite_name}'")
        )

    # Also extract nested rule types from within test cases
    def extract_types_from_rule(rule: dict, depth: int = 0) -> set[str]:
        """Recursively extract type names from a rule structure."""
        types = set()
        if not isinstance(rule, dict):
            return types
        if 'type' in rule:
            types.add(rule['type'])
        if 'rule' in rule:
            types.add(rule['rule'])
        # Recurse into nested structures
        for key, value in rule.items():
            if isinstance(value, dict):
                types |= extract_types_from_rule(value, depth + 1)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        types |= extract_types_from_rule(item, depth + 1)
        return types

    for suite_name, suite_data in data.get('test_suites', {}).items():
        for test in suite_data.get('tests', []):
            rule = test.get('rule', {})
            nested_types = extract_types_from_rule(rule)
            for t in nested_types:
                if t not in tested:
                    tested[t] = []
                # Avoid duplicates
                loc = SourceLocation(rel_path, 0, f"nested in '{suite_name}'")
                if loc not in tested[t]:
                    tested[t].append(loc)

    return tested


def extract_python_test_types(filepath: Path, fixture_types: dict[str, list[SourceLocation]] | None = None) -> dict[str, list[SourceLocation]]:
    """
    Extract tested rule types from Python test files.

    Looks for:
    - class TestXxxRule patterns
    - def test_xxx patterns mentioning rule types
    - Rule type instantiations in test code
    - References to shared fixture files (inherits all tested types)
    """
    tested: dict[str, list[SourceLocation]] = {}
    if not filepath.exists():
        return tested

    content = filepath.read_text()
    lines = content.split('\n')
    rel_path = str(filepath.relative_to(get_project_root()))

    # Check if this file loads shared fixtures
    if fixture_types and 'rule_type_tests.json' in content:
        for name, locs in fixture_types.items():
            if name not in tested:
                tested[name] = []
            tested[name].append(
                SourceLocation(rel_path, 0, "via shared fixtures")
            )

    # Pattern for test classes: class TestHasRule, class TestAndRule, etc.
    class_pattern = re.compile(r'^class\s+Test(\w+?)(?:Rule|Rules)?\s*[:\(]')

    # Pattern for test methods mentioning rule types
    method_pattern = re.compile(r'def\s+test_(\w+)')

    # Pattern for rule type instantiations: Has(, And(, Or(, etc.
    instantiation_pattern = re.compile(r'\b(Has|HasAll|HasAny|HasGroup|HasGroupUnique|HasFromList|HasFromListUnique|And|Or|Not|CanReachRegion|CanReachLocation|CanReachEntrance|Compare|Arithmetic|Conditional|CountItem|CountGroup|HelperCall|True_|False_|Filtered|MinValue|MaxValue|WeightedSum)\s*\(')

    current_class = None

    for i, line in enumerate(lines, 1):
        # Check for test class
        class_match = class_pattern.match(line)
        if class_match:
            current_class = class_match.group(1)
            # Map common test class names to rule types
            rule_type = current_class
            if rule_type not in tested:
                tested[rule_type] = []
            tested[rule_type].append(
                SourceLocation(rel_path, i, f"Test{current_class} class")
            )
            continue

        # Check for rule instantiations
        for match in instantiation_pattern.finditer(line):
            rule_type = match.group(1)
            if rule_type not in tested:
                tested[rule_type] = []
            loc = SourceLocation(rel_path, i, "instantiation")
            if loc not in tested[rule_type]:
                tested[rule_type].append(loc)

    return tested


def extract_js_test_types(filepath: Path, fixture_types: dict[str, list[SourceLocation]] | None = None) -> dict[str, list[SourceLocation]]:
    """
    Extract tested rule types from JavaScript test files.

    Looks for:
    - describe('rule_type', ...) blocks
    - test/it blocks with rule type names
    - Rule type mentions in test assertions
    - References to shared fixture files (inherits all tested types)
    """
    tested: dict[str, list[SourceLocation]] = {}
    if not filepath.exists():
        return tested

    content = filepath.read_text()
    lines = content.split('\n')
    rel_path = str(filepath.relative_to(get_project_root()))

    # Check if this file loads shared fixtures
    if fixture_types and 'rule_type_tests.json' in content:
        # This test file uses the shared fixtures, so it tests all types in fixtures
        for name, locs in fixture_types.items():
            if name not in tested:
                tested[name] = []
            tested[name].append(
                SourceLocation(rel_path, 0, "via shared fixtures")
            )

    # Pattern for describe blocks
    describe_pattern = re.compile(r"describe\s*\(\s*['\"](\w+)['\"]")

    # Pattern for type mentions in code: type: 'xxx' or "type": "xxx"
    type_pattern = re.compile(r"['\"]?type['\"]?\s*:\s*['\"](\w+)['\"]")

    # Pattern for rule mentions: rule: 'Xxx' or "rule": "Xxx"
    rule_pattern = re.compile(r"['\"]?rule['\"]?\s*:\s*['\"](\w+)['\"]")

    for i, line in enumerate(lines, 1):
        # Check describe blocks
        for match in describe_pattern.finditer(line):
            name = match.group(1)
            if name not in tested:
                tested[name] = []
            tested[name].append(
                SourceLocation(rel_path, i, "describe block")
            )

        # Check type mentions
        for match in type_pattern.finditer(line):
            rule_type = match.group(1)
            if rule_type not in tested:
                tested[rule_type] = []
            loc = SourceLocation(rel_path, i, "type reference")
            if loc not in tested[rule_type]:
                tested[rule_type].append(loc)

        # Check rule mentions
        for match in rule_pattern.finditer(line):
            rule_type = match.group(1)
            if rule_type not in tested:
                tested[rule_type] = []
            loc = SourceLocation(rel_path, i, "rule reference")
            if loc not in tested[rule_type]:
                tested[rule_type].append(loc)

    return tested


def categorize_rule_type(name: str) -> str:
    """Guess a category for a rule type based on its name."""
    name_lower = name.lower()

    if any(x in name_lower for x in ['and', 'or', 'not', 'conditional', 'true', 'false']):
        return "Logical Operators"
    if any(x in name_lower for x in ['item', 'has', 'count', 'group', 'prog']):
        return "Item & Inventory"
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
        return "Iteration"
    if any(x in name_lower for x in ['block', 'assign', 'return', 'while', 'if_statement']):
        return "Imperative"

    return "Uncategorized"


def main():
    parser = argparse.ArgumentParser(
        description="Check test coverage for rule types"
    )
    parser.add_argument('--verbose', '-v', action='store_true',
                        help="Show all types and their test status")
    parser.add_argument('--json', action='store_true',
                        help="Output as JSON for CI")
    parser.add_argument('--threshold', type=int, default=0,
                        help="Fail if untested count exceeds threshold (for CI)")
    args = parser.parse_args()

    root = get_project_root()

    # Extract implemented types
    print("Extracting implemented rule types...")

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
                    js_types[name].impl_sources.extend(info.impl_sources)
    else:
        js_types = extract_js_rule_types(root / "frontend/modules/shared/ruleEngine.js")
    print(f"  ruleEngine modules: {len(js_types)} types")

    py_classes = extract_python_rule_classes(root / "rule_builder/rules.py")
    print(f"  rules.py: {len(py_classes)} classes")

    ast_types = extract_ast_format_handlers(root / "rule_builder/ast_format.py")
    print(f"  ast_format.py: {len(ast_types)} types")

    # Merge implemented types
    all_implemented: dict[str, RuleTypeInfo] = {}
    for types_dict in [js_types, py_classes, ast_types]:
        for name, info in types_dict.items():
            if name not in all_implemented:
                all_implemented[name] = info
            else:
                all_implemented[name].impl_sources.extend(info.impl_sources)

    # Extract tested types
    print("\nExtracting tested rule types...")

    all_tested: dict[str, list[SourceLocation]] = {}

    # Shared fixtures
    fixture_tested = extract_fixture_tested_types(root / "test_json/fixtures/rule_type_tests.json")
    print(f"  rule_type_tests.json: {len(fixture_tested)} types")
    for name, locs in fixture_tested.items():
        all_tested.setdefault(name, []).extend(locs)

    # Python test files (pass fixture_tested to detect shared fixture usage)
    python_test_files = [
        root / "test_json/rule_builder/test_rules.py",
        root / "test_json/rule_builder/test_ast_format.py",
        root / "test_json/rule_builder/test_serialization.py",
        root / "test_json/test_rule_fixtures.py",
        root / "exporter/converter/test_rule_builder_to_ast.py",
        root / "exporter/converter/test_round_trip.py",
    ]

    for test_file in python_test_files:
        if test_file.exists():
            tested = extract_python_test_types(test_file, fixture_tested)
            print(f"  {test_file.name}: {len(tested)} types")
            for name, locs in tested.items():
                all_tested.setdefault(name, []).extend(locs)

    # JavaScript test files (pass fixture_tested to detect shared fixture usage)
    js_test_files = [
        root / "frontend/modules/shared/ruleEngine.test.js",
    ]

    for test_file in js_test_files:
        if test_file.exists():
            tested = extract_js_test_types(test_file, fixture_tested)
            print(f"  {test_file.name}: {len(tested)} types")
            for name, locs in tested.items():
                all_tested.setdefault(name, []).extend(locs)

    print(f"  Total unique tested types: {len(all_tested)}")

    # Merge test info into implemented types
    for name in all_implemented:
        if name in all_tested:
            all_implemented[name].test_sources = all_tested[name]
        # Check equivalent types via mapping
        elif name in AST_TO_RULE_BUILDER:
            equiv = AST_TO_RULE_BUILDER[name]
            if equiv in all_tested:
                all_implemented[name].test_sources = all_tested[equiv]
        else:
            for ast_type, rb_type in AST_TO_RULE_BUILDER.items():
                if rb_type == name and ast_type in all_tested:
                    all_implemented[name].test_sources = all_tested[ast_type]
                    break

    # Filter out internal types
    filtered = {n: t for n, t in all_implemented.items() if n not in INTERNAL_TYPES}

    # Categorize
    tested_types = {n: t for n, t in filtered.items() if t.is_tested}
    untested_types = {n: t for n, t in filtered.items() if not t.is_tested}

    if args.json:
        output = {
            "implemented_count": len(filtered),
            "tested_count": len(tested_types),
            "untested_count": len(untested_types),
            "coverage_percent": round(100 * len(tested_types) / len(filtered), 1) if filtered else 0,
            "tested": {
                name: {
                    "category": categorize_rule_type(name),
                    "test_sources": [
                        {"file": s.file, "line": s.line, "context": s.context}
                        for s in info.test_sources[:3]  # Limit to first 3
                    ]
                }
                for name, info in tested_types.items()
            },
            "untested": {
                name: {
                    "category": categorize_rule_type(name),
                    "impl_sources": [
                        {"file": s.file, "line": s.line, "context": s.context}
                        for s in info.impl_sources[:2]
                    ]
                }
                for name, info in untested_types.items()
            }
        }
        print(json.dumps(output, indent=2))

        if args.threshold and len(untested_types) > args.threshold:
            sys.exit(1)
        return

    # Print report
    print()
    print("=" * 60)
    print("TEST COVERAGE REPORT")
    print("=" * 60)

    coverage_pct = 100 * len(tested_types) / len(filtered) if filtered else 0
    print(f"\nImplemented types:  {len(filtered)}")
    print(f"Tested types:       {len(tested_types)}")
    print(f"Untested types:     {len(untested_types)}")
    print(f"Coverage:           {coverage_pct:.1f}%")

    if args.verbose:
        print("\n--- Tested Types ---")
        for name in sorted(tested_types.keys()):
            info = tested_types[name]
            sources = ", ".join(s.file.split('/')[-1] for s in info.test_sources[:2])
            print(f"  [✓] {name}: {sources}")

    if untested_types:
        print("\n--- Untested Types (need test coverage) ---")

        by_category: dict[str, list[str]] = {}
        for name in untested_types:
            cat = categorize_rule_type(name)
            by_category.setdefault(cat, []).append(name)

        for cat in sorted(by_category.keys()):
            print(f"\n  {cat}:")
            for name in sorted(by_category[cat]):
                info = untested_types[name]
                impl = ", ".join(f"{s.file.split('/')[-1]}:{s.line}" for s in info.impl_sources[:2])
                print(f"    - {name} ({impl})")

        print(f"\n⚠️  {len(untested_types)} rule types lack test coverage!")
        if args.threshold and len(untested_types) > args.threshold:
            sys.exit(1)
    else:
        print("\n✓ All rule types have test coverage!")


if __name__ == "__main__":
    main()
