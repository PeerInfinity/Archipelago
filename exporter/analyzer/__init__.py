"""
Rule analysis package for converting Archipelago rules to JSON format.

This package handles the extraction and analysis of rule functions from
Archipelago's Python code, converting them into a standardized JSON format
for use in frontend implementations.

Package Structure
-----------------
This package was refactored from a single 2075-line analyzer.py file into
a modular structure for better maintainability and testability:

- analysis.py: Main entry point (analyze_rule function)
- rule_analyzer.py: Core RuleAnalyzer class that orchestrates analysis
- ast_visitors.py: AST visitor methods for different node types
- expression_resolver.py: Resolves variables and expressions to concrete values
- binary_ops.py: Binary operation preprocessing and optimization
- source_extraction.py: Extract source code from lambda functions
- cache.py: Caching infrastructure for AST and file content
- utils.py: Utility functions (JSON serialization, etc.)

Public API
----------
    analyze_rule(rule_func, closure_vars, seen_funcs, ast_node, game_handler, player_context)
        Main entry point for analyzing a rule function or AST node.
        Returns a structured dict representation of the rule.

    make_json_serializable(value)
        Convert a value to JSON-serializable format.

    clear_caches()
        Clear all internal caches (useful for testing or memory management).

Example Usage
-------------
    from exporter.analyzer import analyze_rule

    # Analyze a rule function
    result = analyze_rule(
        rule_func=some_lambda,
        closure_vars={'world': world_obj},
        game_handler=game_handler
    )

    # Result is a dict like:
    # {'type': 'and', 'conditions': [...]}
    # or {'type': 'item_check', 'item': {...}}

Backward Compatibility
----------------------
For backward compatibility, all public APIs are also available via:
    from exporter.analyzer import analyze_rule

This works through a compatibility shim at exporter/analyzer.py
"""

from .analysis import analyze_rule
from .cache import clear_caches
from .utils import make_json_serializable

__all__ = ['analyze_rule', 'clear_caches', 'make_json_serializable']
