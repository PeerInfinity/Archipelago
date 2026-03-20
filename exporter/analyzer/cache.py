"""
Caching infrastructure for AST and file content.

This module provides module-level caches to avoid repeated file I/O
and AST parsing during rule analysis.
"""

import ast
from typing import Any, Dict, Optional, Tuple

# Module-level caches
file_content_cache: Dict[str, str] = {}  # Raw file content as strings
ast_cache: Dict[str, ast.AST] = {}  # Parsed AST objects

# Cache for cleaned source code: (filename, lineno) -> cleaned source string
# This avoids re-extracting and cleaning source for the same function
clean_source_cache: Dict[Tuple[str, int], Optional[str]] = {}

# Cache for unparsed lambda source: (filename, lineno) -> unparsed source string
# This avoids re-finding and unparsing lambdas in the AST
unparsed_lambda_cache: Dict[Tuple[str, int], Optional[str]] = {}

# Cache for parameterless function analysis results
# Key: (filename, lineno) for functions that only take state/player/world
# This avoids re-analyzing the same helper function multiple times
parameterless_func_cache: Dict[Tuple[str, int], Dict[str, Any]] = {}

# Cache for closure function analysis results by function identity
# Key: id(func) for regular functions, or (id(instance), id(func.__func__)) for bound methods.
# Bound methods are ephemeral objects whose id can be reused after GC, so we use the
# stable (instance_id, method_id) pair instead.
# This caches results for functions with closures, where the same object
# will always have the same closure values (unlike parameterless_func_cache
# which caches by source location). This is especially important for
# entrance shuffle which creates deeply nested add_rule chains.
closure_func_identity_cache: Dict[Any, Dict[str, Any]] = {}


def clear_caches():
    """
    Clear all caches (useful for testing or memory management).

    Call this between generations or when you want to free memory.
    """
    file_content_cache.clear()
    ast_cache.clear()
    clean_source_cache.clear()
    unparsed_lambda_cache.clear()
    parameterless_func_cache.clear()
    closure_func_identity_cache.clear()
