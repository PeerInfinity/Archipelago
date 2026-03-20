"""
Extract source code from lambda functions and regular functions.

This module handles the complex task of extracting source code from lambda
functions, including multiline lambdas, using AST parsing and caching.
"""

import ast
import inspect
import re
import logging
import textwrap
import zipfile
from typing import Optional, Callable
import astunparse

from .cache import file_content_cache, ast_cache, clean_source_cache, unparsed_lambda_cache


def _extract_multiline_lambda(source_code: str, start_line: int) -> Optional[str]:
    """
    Extract a multiline lambda expression from source code starting at a given line.

    This is used as a fallback when inspect.getsource() fails to capture the full
    multiline lambda expression. It works by:
    1. Finding the lambda keyword on the start line
    2. Reading lines until the expression is syntactically complete (balanced parens)
    3. Returning the full lambda expression

    Args:
        source_code: The full source code of the file
        start_line: The 1-indexed line number where the lambda starts

    Returns:
        The lambda expression as a string, or None if extraction failed
    """
    lines = source_code.split('\n')
    if start_line < 1 or start_line > len(lines):
        return None

    # Get the starting line (convert to 0-indexed)
    current_line_idx = start_line - 1
    first_line = lines[current_line_idx]

    # Find 'lambda' keyword in the line
    lambda_match = re.search(r'\blambda\b', first_line)
    if not lambda_match:
        logging.debug(f"_extract_multiline_lambda: No lambda keyword found on line {start_line}")
        return None

    # Extract from the lambda keyword onwards
    lambda_start = lambda_match.start()
    collected_lines = [first_line[lambda_start:]]

    # Track whether we're inside the lambda expression
    # We need to handle:
    # - Parentheses: (), [], {}
    # - String literals: '', "", ''', """
    # - Line continuations: \
    # - Implicit continuation: expression inside parens continues to next line

    def count_brackets(text: str) -> tuple:
        """Count unmatched opening brackets in text, handling strings."""
        paren_count = 0
        bracket_count = 0
        brace_count = 0
        in_string = None  # None, "'", '"', "'''", '"""'
        i = 0
        while i < len(text):
            char = text[i]

            # Handle string boundaries
            if in_string:
                if len(in_string) == 3:  # Triple quoted
                    if text[i:i+3] == in_string:
                        in_string = None
                        i += 3
                        continue
                else:  # Single quoted
                    if char == '\\' and i + 1 < len(text):
                        i += 2  # Skip escaped char
                        continue
                    if char == in_string:
                        in_string = None
                i += 1
                continue

            # Check for string start
            if char in ('"', "'"):
                if text[i:i+3] in ('"""', "'''"):
                    in_string = text[i:i+3]
                    i += 3
                    continue
                else:
                    in_string = char
                    i += 1
                    continue

            # Check for comment
            if char == '#':
                break  # Rest of line is comment

            # Count brackets
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
            elif char == '[':
                bracket_count += 1
            elif char == ']':
                bracket_count -= 1
            elif char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1

            i += 1

        return paren_count, bracket_count, brace_count, in_string

    # Count initial brackets
    total_paren, total_bracket, total_brace, in_string = count_brackets(collected_lines[0])

    # Continue reading lines while expression is incomplete
    max_lines = 50  # Safety limit
    while current_line_idx + 1 < len(lines) and len(collected_lines) < max_lines:
        # Check if we need to continue
        # We're done when:
        # - All brackets are balanced (total = 0)
        # - We're not in a string
        # - The line doesn't end with a line continuation character
        last_line = collected_lines[-1].rstrip()

        # Check for explicit line continuation
        has_continuation = last_line.endswith('\\')

        # Check for implicit continuation based on bracket imbalance
        has_open_brackets = (total_paren > 0 or total_bracket > 0 or total_brace > 0 or
                            in_string is not None)

        # Check if the expression might continue on the next line
        # Lambda bodies can span multiple lines without explicit continuation if they use
        # boolean operators (and, or). Python allows this implicit continuation.
        # Check if next line starts with a continuation keyword/operator
        next_line_continues = False
        if current_line_idx + 1 < len(lines):
            next_line_stripped = lines[current_line_idx + 1].strip()
            # Lines starting with 'and', 'or', 'if', 'else' continue a lambda expression
            if next_line_stripped.startswith(('and ', 'or ', 'if ', 'else ')):
                next_line_continues = True
            # Also check if next line starts with 'and' or 'or' followed by '('
            if re.match(r'^(and|or)\s*\(', next_line_stripped):
                next_line_continues = True

        needs_more = has_open_brackets or has_continuation or next_line_continues

        if not needs_more:
            break

        # Get next line
        current_line_idx += 1
        next_line = lines[current_line_idx]
        collected_lines.append(next_line)

        # Update bracket counts
        p, b, br, in_string = count_brackets(next_line)
        total_paren += p
        total_bracket += b
        total_brace += br

    # Normalize to single line to avoid indentation issues
    # The continuation lines have extra indentation from the original source
    lines_to_join = []
    for line in collected_lines:
        stripped = line.strip()
        if stripped:
            lines_to_join.append(stripped)
    result_normalized = ' '.join(lines_to_join)

    # Try to parse the normalized lambda to verify it's complete
    try:
        # Wrap in an assignment to make it parseable
        test_source = f"__test__ = {result_normalized}"
        ast.parse(test_source)
        logging.debug(f"_extract_multiline_lambda: Successfully extracted {len(collected_lines)} lines")
        return result_normalized
    except SyntaxError as e:
        # Try trimming trailing characters that might be from the outer call
        # Common pattern: lambda ...) where ) closes set_rule
        trimmed = result_normalized.rstrip()
        for i in range(5):  # Try removing up to 5 trailing parens
            if trimmed.endswith(')'):
                trimmed = trimmed[:-1].rstrip()
                try:
                    test_source = f"__test__ = {trimmed}"
                    ast.parse(test_source)
                    logging.debug(f"_extract_multiline_lambda: Extracted after trimming {i+1} paren(s): {len(collected_lines)} lines")
                    return trimmed
                except SyntaxError:
                    continue
            else:
                break

        logging.debug(f"_extract_multiline_lambda: Failed to parse extracted lambda: {e}")
        return None


def _read_source_from_path(filename: str) -> Optional[str]:
    """
    Read source code from a file path, handling both regular files and
    files inside .apworld zip archives.

    Args:
        filename: The file path, which may be inside an apworld zip
                  (e.g., '/path/to/game.apworld/game/Rules.py')

    Returns:
        The file content as a string, or None if reading failed
    """
    # Check if this is a path inside an apworld zip file
    if '.apworld' in filename:
        # Split the path at .apworld to get the zip path and internal path
        # e.g., '/path/to/game.apworld/game/Rules.py' ->
        #       zip_path = '/path/to/game.apworld'
        #       internal_path = 'game/Rules.py'
        parts = filename.split('.apworld')
        if len(parts) >= 2:
            zip_path = parts[0] + '.apworld'
            # Remove leading slash from internal path
            internal_path = parts[1].lstrip('/')

            try:
                with zipfile.ZipFile(zip_path, 'r') as zf:
                    content = zf.read(internal_path).decode('utf-8')
                    logging.debug(f"Read source from apworld: {zip_path}!{internal_path}")
                    return content
            except Exception as e:
                logging.error(f"Failed to read from apworld {zip_path}!{internal_path}: {e}")
                return None

    # Regular file - read from disk
    try:
        with open(filename, 'r', encoding='utf-8-sig') as f:
            return f.read()
    except Exception as e:
        logging.error(f"Failed to read source file {filename}: {e}")
        return None


class LambdaLineFinder(ast.NodeVisitor):
    """An AST visitor to find a lambda function at a specific line number."""

    def __init__(self, target_line: int):
        """
        Initialize the LambdaLineFinder.

        Args:
            target_line: The line number where the lambda is defined
        """
        self.target_line = target_line
        self.found_node = None

    def visit_Lambda(self, node: ast.Lambda):
        """Visit Lambda nodes and check if they're on the target line."""
        if self.found_node is None and hasattr(node, 'lineno') and node.lineno == self.target_line:
            self.found_node = node
        # No need to visit children of the lambda itself

    def visit(self, node: ast.AST):
        """Override visit to stop searching once the node is found."""
        if self.found_node:
            return
        super().visit(node)


def get_multiline_lambda_source(func: Callable) -> Optional[str]:
    """
    Robustly gets the full source code of a lambda function using full-file AST parsing.
    Includes caching for both file content, parsed AST, and unparsed lambda source.

    Args:
        func: The lambda function to extract source from

    Returns:
        The source code as a string, or None if extraction failed
    """
    try:
        filename = inspect.getfile(func)
        start_line = func.__code__.co_firstlineno

        # Check unparsed lambda cache first (fastest path)
        cache_key = (filename, start_line)
        if cache_key in unparsed_lambda_cache:
            logging.debug(f"get_multiline_lambda_source: Cache hit for {filename}:{start_line}")
            return unparsed_lambda_cache[cache_key]

        # 1. Check for a cached AST first (most performant)
        if filename in ast_cache:
            tree = ast_cache[filename]
        else:
            # 2. Check for cached file content
            if filename in file_content_cache:
                source_code = file_content_cache[filename]
            else:
                # 3. Read from disk (or apworld zip) as a last resort
                source_code = _read_source_from_path(filename)
                if source_code is None:
                    return None
                file_content_cache[filename] = source_code

            # 4. Parse the source and populate the AST cache
            tree = ast.parse(source_code, filename=filename)
            ast_cache[filename] = tree

        # Find the lambda node at the target line within the (possibly cached) AST
        finder = LambdaLineFinder(start_line)
        finder.visit(tree)

        lambda_node = finder.found_node

        result = None
        if lambda_node:
            # "Un-parse" the found AST node back into a source string
            # Wrap in try/except for RecursionError on very complex lambdas
            try:
                result = astunparse.unparse(lambda_node).strip()
            except RecursionError:
                logging.warning(f"RecursionError unparsing lambda at {filename}:{start_line}, using multiline extraction fallback")
                # Use multiline extraction which handles multiline lambdas correctly
                source_code = file_content_cache.get(filename)
                if source_code:
                    result = _extract_multiline_lambda(source_code, start_line)
                if not result:
                    result = inspect.getsource(func)  # Last resort fallback
        else:
            # No lambda node found - try multiline extraction first
            source_code = file_content_cache.get(filename)
            if source_code:
                result = _extract_multiline_lambda(source_code, start_line)
            if not result:
                result = inspect.getsource(func)  # Last resort fallback

        # Cache the result
        unparsed_lambda_cache[cache_key] = result
        return result

    except RecursionError as e:
        logging.error(f"RecursionError getting lambda source for {func}: {e}")
        # Try multiline extraction as fallback
        try:
            filename = inspect.getfile(func)
            start_line = func.__code__.co_firstlineno
            source_code = file_content_cache.get(filename)
            if source_code:
                result = _extract_multiline_lambda(source_code, start_line)
                if result:
                    return result
            return inspect.getsource(func)  # Last resort fallback
        except Exception as fallback_e:
            logging.error(f"Fallback also failed: {fallback_e}")
            return None
    except Exception as e:
        logging.error(f"Failed to get multiline lambda source for {func}: {e}")
        # Try multiline extraction as fallback
        try:
            filename = inspect.getfile(func)
            start_line = func.__code__.co_firstlineno
            source_code = file_content_cache.get(filename)
            if source_code:
                result = _extract_multiline_lambda(source_code, start_line)
                if result:
                    return result
            return inspect.getsource(func)  # Last resort fallback
        except Exception as fallback_e:
            logging.error(f"Fallback also failed: {fallback_e}")
            return None


def _clean_source(func: Callable) -> Optional[str]:
    """
    A new version of _clean_source that uses the robust lambda finder.

    This function extracts the source code from a lambda or function, cleans it,
    and converts it to a format suitable for AST analysis.

    Results are cached by (filename, lineno) to avoid repeated extraction
    for the same function.

    Args:
        func: The function to extract and clean source from

    Returns:
        Cleaned source code as a string, or None if cleaning failed
    """
    # Check cache first
    try:
        filename = inspect.getfile(func)
        lineno = func.__code__.co_firstlineno
        cache_key = (filename, lineno)

        if cache_key in clean_source_cache:
            logging.debug(f"_clean_source: Cache hit for {filename}:{lineno}")
            return clean_source_cache[cache_key]
    except (TypeError, AttributeError):
        # Can't determine cache key, proceed without caching
        cache_key = None

    result = _clean_source_impl(func)

    # Store in cache if we have a valid cache key
    if cache_key is not None:
        clean_source_cache[cache_key] = result

    return result


def _clean_source_impl(func: Callable) -> Optional[str]:
    """Implementation of _clean_source (separated for caching)."""
    try:
        # Use the robust function to get the full lambda source
        source = get_multiline_lambda_source(func)
        if source is None:
            return None

        # Note: No need to remove comments here - astunparse already strips them
        # since it works from the AST. Removing comments with tokenize would break
        # explicit line continuations (\).
        source = source.strip()
        logging.debug(f"_clean_source: Got source from AST = {repr(source)}")
    except (TypeError, OSError) as e:
        logging.error(f"Unexpected error getting source for {func}: {e}")
        return None

    # Handle @staticmethod decorator syntax (as opposed to staticmethod() call syntax)
    # inspect.getsource() returns decorator + indented method body, causing IndentationError
    # when parsed as standalone code. We strip the decorator and dedent the method.
    if source.startswith('@staticmethod'):
        logging.debug(f"_clean_source: Detected '@staticmethod' decorator in source: {repr(source)}")
        try:
            # Split into lines, remove the decorator line(s), and dedent the rest
            lines = source.split('\n')
            # Find the first line that starts with 'def ' (after stripping leading whitespace)
            def_line_idx = None
            for i, line in enumerate(lines):
                if line.strip().startswith('def '):
                    def_line_idx = i
                    break

            if def_line_idx is not None:
                # Take lines from def onwards and dedent
                method_lines = lines[def_line_idx:]
                method_source = textwrap.dedent('\n'.join(method_lines))
                logging.debug(f"_clean_source: Dedented @staticmethod method: {repr(method_source)}")
                # Return the dedented method source for normal processing
                return method_source
            else:
                logging.warning(f"_clean_source: Could not find 'def' after @staticmethod decorator")
                return None
        except Exception as e:
            logging.error(f"_clean_source: Error handling @staticmethod decorator: {e}", exc_info=True)
            return None

    # More robust staticmethod check using AST (for staticmethod() call syntax)
    if 'staticmethod(' in source:
        logging.debug(f"_clean_source: Detected 'staticmethod(' in source: {repr(source)}")
        try:
            # Parse the source string (could be an assignment)
            tree = ast.parse(source)

            # Expect Module -> Assign/AnnAssign -> Call(Name(id='staticmethod'), args=[Lambda(...)])
            assigned_value = None
            if isinstance(tree, ast.Module) and tree.body:
                first_stmt = tree.body[0]
                if isinstance(first_stmt, (ast.Assign, ast.AnnAssign)):
                    assigned_value = first_stmt.value

            # Check if the assigned value is the staticmethod call
            if (isinstance(assigned_value, ast.Call) and
                    isinstance(assigned_value.func, ast.Name) and
                    assigned_value.func.id == 'staticmethod' and
                    len(assigned_value.args) == 1):

                lambda_node = assigned_value.args[0]
                # Check if the argument is a Lambda returning constant True
                if (isinstance(lambda_node, ast.Lambda) and
                        isinstance(lambda_node.body, ast.Constant) and
                        lambda_node.body.value is True):

                    # Determine appropriate param name if possible (optional enhancement)
                    # For now, default to 'state' as it covers access_rule
                    param_name = 'state'  # Keep it simple for now
                    logging.debug(
                        f"_clean_source: Confirmed staticmethod(lambda {param_name}: True). "
                        f"Returning standard True func."
                    )
                    return f"def __analyzed_func__({param_name}):\n    return True"
                else:
                    logging.warning(
                        f"_clean_source: staticmethod found, but does not wrap a simple 'lambda: True'. "
                        f"Lambda body: {ast.dump(lambda_node) if isinstance(lambda_node, ast.Lambda) else 'Not a Lambda'}"
                    )
            else:
                logging.warning(
                    f"_clean_source: staticmethod found, but AST structure is not the expected assignment pattern. "
                    f"Assigned value: {ast.dump(assigned_value) if assigned_value else 'None'}"
                )

        except SyntaxError as parse_err:
            logging.warning(
                f"_clean_source: SyntaxError parsing staticmethod source: {parse_err}. "
                f"Source: {repr(source)}"
            )
        except Exception as e:
            logging.error(
                f"_clean_source: Error during AST analysis of staticmethod: {e}. "
                f"Source: {repr(source)}",
                exc_info=True
            )

        # If AST analysis fails or doesn't match expected pattern, return None
        logging.warning("_clean_source: Could not robustly confirm staticmethod wraps lambda:True. Returning None.")
        return None

    # The source from astunparse is already a clean, complete lambda expression.
    # We just need to wrap it in a 'def' for the RuleAnalyzer to visit.
    match = re.compile(r'lambda\s+([^:]*):\s*(.*)', re.DOTALL).match(source)
    if match:
        params = match.group(1).strip()
        body = match.group(2).strip()

        # When using inspect.getsource() fallback on lambdas inside function calls
        # (e.g., set_rule(..., lambda state: body)), the body may include trailing
        # closing parentheses from the outer call. Strip unbalanced trailing parens.
        body = _strip_unbalanced_trailing_parens(body)

        # For multiline lambda bodies from inspect.getsource() fallback,
        # normalize indentation to prevent SyntaxError when wrapped in def.
        # The continuation lines may have extra indentation from the original source.
        body = _normalize_multiline_body(body)

        logging.debug(f"_clean_source: Final body for lambda = {repr(body)}")
        return f"def __analyzed_func__({params}):\n    return {body}"
    else:
        # If it's not a lambda (e.g., a regular 'def' function), return as is
        return source


def _strip_unbalanced_trailing_parens(body: str) -> str:
    """
    Strip trailing unbalanced closing parentheses from lambda body.

    When inspect.getsource() extracts a lambda from inside a function call like:
        set_rule(loc, lambda state: state.has('Item', player))

    The regex may capture the trailing ')' from set_rule(), resulting in:
        state.has('Item', player))

    This function removes such trailing unbalanced parens while preserving
    valid parentheses in the expression.

    Also handles cases where there's a trailing comment after the parens:
        state.has('Item', player))  # some comment

    Args:
        body: The lambda body string, possibly with trailing unbalanced parens

    Returns:
        The body with trailing unbalanced closing parens removed
    """
    result = body.rstrip()

    # First, strip trailing comments (outside of strings)
    # Comments can appear after the lambda body and confuse paren matching
    result = _strip_trailing_comment(result)

    while result.endswith(')'):
        # Count balance in the expression (excluding the last char)
        balance = 0
        in_string = None  # None, '"', or "'"
        escaped = False

        for char in result[:-1]:
            if escaped:
                escaped = False
                continue
            if char == '\\':
                escaped = True
                continue
            if in_string:
                if char == in_string:
                    in_string = None
                continue
            if char in ('"', "'"):
                in_string = char
                continue
            if char == '(':
                balance += 1
            elif char == ')':
                balance -= 1

        # If balance is 0 or negative, the trailing ')' is unbalanced
        if balance <= 0:
            result = result[:-1].rstrip()
            logging.debug(f"_strip_unbalanced_trailing_parens: Stripped trailing ')': {repr(result)}")
        else:
            # The trailing ')' is balanced, stop stripping
            break

    return result


def _strip_trailing_comment(body: str) -> str:
    """
    Strip a trailing Python comment from the body, if present.

    Only strips comments that are outside of strings.

    Args:
        body: The expression string

    Returns:
        The expression with trailing comment removed
    """
    in_string = None
    escaped = False
    last_hash_pos = None

    for i, char in enumerate(body):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if in_string:
            if char == in_string:
                in_string = None
            continue
        if char in ('"', "'"):
            in_string = char
            continue
        if char == '#':
            last_hash_pos = i
            break  # Found start of comment

    if last_hash_pos is not None:
        result = body[:last_hash_pos].rstrip()
        logging.debug(f"_strip_trailing_comment: Removed comment: {repr(body)} -> {repr(result)}")
        return result

    return body


def _normalize_multiline_body(body: str) -> str:
    """
    Normalize a multiline lambda body to a single line.

    When inspect.getsource() extracts a multiline lambda, continuation lines
    have extra indentation from the original source. This causes parsing issues.

    The simplest fix is to join all lines into a single line, replacing
    newlines and excess whitespace with single spaces. This is valid Python
    since lambda bodies can span multiple lines but must be a single expression.

    Args:
        body: The lambda body, possibly multiline

    Returns:
        The body as a single line with normalized whitespace
    """
    if '\n' not in body:
        # Single line, nothing to normalize
        return body

    # Join lines and normalize whitespace
    # Replace newlines with spaces, then collapse multiple spaces
    lines = body.split('\n')
    normalized_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            normalized_lines.append(stripped)

    result = ' '.join(normalized_lines)
    logging.debug(f"_normalize_multiline_body: Converted to single line: {repr(result[:100])}...")
    return result
