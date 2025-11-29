"""
Extract source code from lambda functions and regular functions.

This module handles the complex task of extracting source code from lambda
functions, including multiline lambdas, using AST parsing and caching.
"""

import ast
import inspect
import re
import logging
import tokenize
import io
from typing import Optional, Callable
import astunparse

from .cache import file_content_cache, ast_cache


def remove_comments_from_source(source: str) -> str:
    """
    Remove Python comments from source code while preserving # characters in string literals.

    Uses tokenize to properly distinguish between comments and string content.

    Args:
        source: Source code string

    Returns:
        Source code with comments removed
    """
    try:
        # Convert source to bytes for tokenize
        source_bytes = source.encode('utf-8')
        tokens = tokenize.tokenize(io.BytesIO(source_bytes).readline)

        result = []
        prev_end = (1, 0)

        for tok in tokens:
            # Skip comments
            if tok.type == tokenize.COMMENT:
                continue

            # Handle newlines and indentation
            if tok.type in (tokenize.NEWLINE, tokenize.NL):
                result.append(tok.string)
                prev_end = tok.end
                continue

            # Add any whitespace between tokens
            if tok.start[0] > prev_end[0]:
                # New line - add newline only if previous token wasn't NL/NEWLINE
                # (since those tokens already include the newline character)
                if result and not result[-1].endswith('\n'):
                    result.append('\n')
                # Preserve indentation on the new line
                if tok.start[1] > 0 and tok.type != tokenize.INDENT:
                    result.append(' ' * tok.start[1])
            elif tok.start[1] > prev_end[1] and tok.type != tokenize.INDENT:
                # Same line, add spaces
                result.append(' ' * (tok.start[1] - prev_end[1]))

            # Add the token
            if tok.type not in (tokenize.ENCODING, tokenize.ENDMARKER):
                result.append(tok.string)

            prev_end = tok.end

        return ''.join(result).strip()
    except Exception as e:
        # Fallback to simple regex if tokenization fails
        logging.warning(f"Tokenization failed for comment removal: {e}. Using fallback regex.")
        return re.sub(r'#.*$', '', source, flags=re.MULTILINE).strip()


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
    Includes caching for both file content and the parsed AST to improve performance.

    Args:
        func: The lambda function to extract source from

    Returns:
        The source code as a string, or None if extraction failed
    """
    try:
        filename = inspect.getfile(func)
        start_line = func.__code__.co_firstlineno

        # 1. Check for a cached AST first (most performant)
        if filename in ast_cache:
            tree = ast_cache[filename]
        else:
            # 2. Check for cached file content
            if filename in file_content_cache:
                source_code = file_content_cache[filename]
            else:
                # 3. Read from disk as a last resort
                with open(filename, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                file_content_cache[filename] = source_code

            # 4. Parse the source and populate the AST cache
            tree = ast.parse(source_code, filename=filename)
            ast_cache[filename] = tree

        # Find the lambda node at the target line within the (possibly cached) AST
        finder = LambdaLineFinder(start_line)
        finder.visit(tree)

        lambda_node = finder.found_node

        if lambda_node:
            # "Un-parse" the found AST node back into a source string
            return astunparse.unparse(lambda_node).strip()
        else:
            return inspect.getsource(func)  # Fallback

    except Exception as e:
        logging.error(f"Failed to get multiline lambda source for {func}: {e}")
        try:
            return inspect.getsource(func)  # Fallback
        except Exception as fallback_e:
            logging.error(f"Fallback getsource also failed: {fallback_e}")
            return None


def _read_multiline_lambda(func: Callable) -> Optional[str]:
    """
    Read a multiline lambda function using tokenize to properly handle
    parentheses and indentation.

    Args:
        func: The lambda function to read

    Returns:
        The lambda source as a string, or None if reading failed
    """
    try:
        # Get the file and line number where the lambda starts
        filename = inspect.getfile(func)
        start_line = func.__code__.co_firstlineno

        if filename in file_content_cache:
            lines = file_content_cache[filename]
            logging.debug(f"_read_multiline_lambda: Using cached content for {filename}")
        else:
            logging.debug(f"_read_multiline_lambda: Reading and caching content for {filename}")
            with open(filename, 'r', encoding='utf-8-sig') as f:
                # Read the file line by line
                lines = f.readlines()
            file_content_cache[filename] = lines  # Store in cache

        # Start with the line containing the lambda
        # Correct for 0-based list index vs 1-based line number
        if start_line <= 0 or start_line > len(lines):
            logging.error(
                f"Error: start_line {start_line} is out of bounds for file {filename} "
                f"with {len(lines)} lines."
            )
            return None  # Or handle error appropriately

        lambda_text = lines[start_line - 1]
        initial_indent = len(lambda_text) - len(lambda_text.lstrip())

        # Track parentheses balance
        paren_count = lambda_text.count('(') - lambda_text.count(')')
        bracket_count = lambda_text.count('[') - lambda_text.count(']')
        brace_count = lambda_text.count('{') - lambda_text.count('}')

        # Continue reading lines until all parentheses/brackets/braces are balanced
        # and we see a decrease in indentation
        i = start_line
        while i < len(lines):
            line = lines[i]
            current_indent = len(line) - len(line.lstrip())

            # If we see a decrease in indentation, we're probably past the lambda
            if current_indent < initial_indent:
                break

            # Update counts
            paren_count += line.count('(') - line.count(')')
            bracket_count += line.count('[') - line.count(']')
            brace_count += line.count('{') - line.count('}')

            # Add the line to our lambda text
            lambda_text += line

            # If all parentheses/brackets/braces are balanced, we might be done
            if paren_count <= 0 and bracket_count <= 0 and brace_count <= 0:
                # Check if the next line has less indentation
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    # Check if next_line is not empty or just whitespace before calculating indent
                    if next_line.strip():
                        next_indent = len(next_line) - len(next_line.lstrip())
                        if next_indent < initial_indent:
                            break
                    else:
                        # Skip empty/whitespace lines when checking indentation break
                        pass

            i += 1

        # Clean up the lambda text
        lambda_text = lambda_text.strip()

        # Remove comments while preserving # in string literals
        lambda_text = remove_comments_from_source(lambda_text)

        return lambda_text
    except Exception as e:
        logging.error(f"Error reading multiline lambda: {e}", exc_info=True)
        return None


def _clean_source(func: Callable) -> Optional[str]:
    """
    A new version of _clean_source that uses the robust lambda finder.

    This function extracts the source code from a lambda or function, cleans it,
    and converts it to a format suitable for AST analysis.

    Args:
        func: The function to extract and clean source from

    Returns:
        Cleaned source code as a string, or None if cleaning failed
    """
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

    # More robust staticmethod check using AST
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
        logging.debug(f"_clean_source: Final body for lambda = {repr(body)}")
        return f"def __analyzed_func__({params}):\n    return {body}"
    else:
        # If it's not a lambda (e.g., a regular 'def' function), return as is
        return source
