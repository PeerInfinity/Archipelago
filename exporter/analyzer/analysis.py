"""
Main entry point for rule analysis.

This module provides the analyze_rule function which is the main entry
point for analyzing rule functions and AST nodes.
"""

import ast
import json
import logging
import traceback
from typing import Optional, Callable, Dict, Any

from .rule_analyzer import RuleAnalyzer
from .source_extraction import _clean_source
from .utils import make_json_serializable


def analyze_rule(rule_func: Optional[Callable[[Any], bool]] = None,
                 closure_vars: Optional[Dict[str, Any]] = None,
                 seen_funcs: Optional[Dict[int, int]] = None,
                 ast_node: Optional[ast.AST] = None,
                 game_handler=None,
                 player_context: Optional[int] = None,
                 context_info: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyzes a rule function or an AST node representing a rule.

    Main entry point that:
    1. Validates inputs
    2. Extracts source code if needed
    3. Creates RuleAnalyzer instance
    4. Returns structured rule representation

    Args:
        rule_func: The rule function (lambda or regular function) to analyze.
        closure_vars: Dictionary of variables available in the function's closure.
        seen_funcs: Dictionary of function IDs already analyzed to prevent recursion.
        ast_node: An optional pre-parsed AST node (e.g., ast.Lambda) to analyze directly.
        game_handler: Game-specific handler for processing rules
        player_context: Player number for context-sensitive analysis

    Returns:
        A dictionary representing the structured rule, or an error structure.
    """
    logging.debug("\n--- Starting Rule Analysis ---")

    # Initialize seen_funcs dict if not provided
    seen_funcs = seen_funcs or {}

    # Ensure closure_vars is a dictionary
    closure_vars = closure_vars or {}

    analyzer = None  # Define analyzer in outer scope

    try:
        # --- Option 1: Analyze a provided AST node directly ---
        analysis_result = None
        if ast_node:
            logging.debug(f"Analyzing provided AST node: {type(ast_node).__name__}")
            # Need an analyzer instance here too
            analyzer = RuleAnalyzer(
                closure_vars=closure_vars,
                seen_funcs=seen_funcs,
                game_handler=game_handler,
                player_context=player_context
            )
            analysis_result = analyzer.visit(ast_node)

        # --- Option 2: Analyze a function object (existing logic) ---
        elif rule_func:
            logging.debug(f"Rule function: {rule_func}")

            func_id = id(rule_func)
            # More permissive recursion check
            current_seen_count = seen_funcs.get(func_id, 0)
            # Allow deep recursion for complex games like Super Metroid with cache decorators
            # SM uses VARIA randomizer with nested cache decorators requiring deeper expansion
            if current_seen_count >= 10:
                recursion_msg = (
                    f'Recursion detected: Already analyzing function {rule_func} '
                    f'{current_seen_count+1} times'
                )
                logging.debug(
                    f"analyze_rule: Function {rule_func} (id={func_id}) seen "
                    f"{current_seen_count+1} times, stopping recursion."
                )
                # Return a proper error structure
                return {
                    'type': 'error',
                    'message': recursion_msg,
                    'subtype': 'recursion',
                    'debug_log': [],
                    'error_log': []
                }

            # --- Work on a copy of closure_vars ---
            local_closure_vars = closure_vars.copy()

            # Attempt to add function's actual closure variables TO THE COPY
            try:
                if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                    closure_cells = rule_func.__closure__
                    free_vars = rule_func.__code__.co_freevars
                    for var_name, cell in zip(free_vars, closure_cells):
                        try:
                            # Add to local copy, overwriting if necessary
                            local_closure_vars[var_name] = cell.cell_contents
                        except ValueError:
                            # Cell is empty, skip
                            pass
                    logging.debug(f"Extracted closure vars into local copy: {list(local_closure_vars.keys())}")
                else:
                    logging.debug("No closure variables found for rule function.")
            except Exception as clo_err:
                logging.warning(f"Error extracting closure variables: {clo_err}")

            # Add 'self' to the local copy if needed
            if hasattr(rule_func, '__self__') and 'self' not in local_closure_vars:
                local_closure_vars['self'] = rule_func.__self__
                logging.debug("Added 'self' to local closure vars from method binding.")

            # Extract default parameter values and add to closure vars
            # This handles cases like: lambda state, loc=q_loc: (loc.can_reach(state))
            try:
                if hasattr(rule_func, '__defaults__') and rule_func.__defaults__:
                    if hasattr(rule_func, '__code__'):
                        arg_names = rule_func.__code__.co_varnames[:rule_func.__code__.co_argcount]
                        defaults = rule_func.__defaults__

                        # Map default values to parameter names (defaults apply to last N parameters)
                        if len(defaults) > 0:
                            default_start = len(arg_names) - len(defaults)
                            for i, default_value in enumerate(defaults):
                                param_name = arg_names[default_start + i]
                                # Don't override existing closure vars and skip state/player
                                if param_name not in local_closure_vars and param_name not in ('state', 'player'):
                                    local_closure_vars[param_name] = default_value
                                    logging.debug(f"Added default parameter '{param_name}' to closure vars: {default_value}")
            except Exception as def_err:
                logging.warning(f"Error extracting default parameters: {def_err}")

            # Clean the source
            cleaned_source = _clean_source(rule_func)
            if cleaned_source is None:
                logging.error("analyze_rule: Failed to clean source, returning error.")
                # Need to initialize analyzer logs for the error result
                analyzer = RuleAnalyzer(game_handler=game_handler)
                return {
                    'type': 'error',
                    'message': 'Failed to clean or retrieve source code for rule function.',
                    'subtype': 'source_cleaning',
                    'debug_log': analyzer.debug_log,
                    'error_log': analyzer.error_log
                }
            logging.debug(f"Cleaned source: {repr(cleaned_source)}")

            # --- Analyzer creation and analysis ---
            analysis_result = None
            try:
                seen_funcs[func_id] = current_seen_count + 1
                logging.debug(f"analyze_rule: Incremented func_id {func_id} count in seen_funcs: {seen_funcs}")

                # Pass the LOCAL copy to the RuleAnalyzer instance
                analyzer = RuleAnalyzer(
                    closure_vars=local_closure_vars,
                    seen_funcs=seen_funcs,
                    game_handler=game_handler,
                    rule_func=rule_func,
                    player_context=player_context
                )

                # Check if cleaned_source contains "Bridge"
                if cleaned_source and "Bridge" in cleaned_source:
                    logging.debug(f"analyze_rule: Detected 'Bridge' in the cleaned source code")

                # Comprehensive parse and visit
                try:
                    tree = ast.parse(cleaned_source)
                    logging.debug(f"analyze_rule: Parsed AST = {ast.dump(tree)}")
                    logging.debug("AST parsed successfully")

                    # Always visit the full parsed tree
                    analysis_result = analyzer.visit(tree)

                except SyntaxError as parse_err:
                    logging.error(f"analyze_rule: SyntaxError during parse: {parse_err}", exc_info=True)
                    # Return error if parsing fails
                    return {
                        'type': 'error',
                        'message': f'SyntaxError parsing cleaned source: {parse_err}',
                        'subtype': 'ast_parse',
                        'cleaned_source': repr(cleaned_source),
                        'debug_log': analyzer.debug_log,
                        'error_log': analyzer.error_log
                    }

            finally:
                if func_id in seen_funcs:
                    seen_funcs[func_id] -= 1
                    if seen_funcs[func_id] <= 0:
                        del seen_funcs[func_id]
                    logging.debug(
                        f"analyze_rule: Updated func_id {func_id} count/removed from seen_funcs: {seen_funcs}"
                    )

        else:
            # No function or AST node provided
            logging.warning("analyze_rule: Called without rule_func or ast_node.")
            analysis_result = None
            analyzer = RuleAnalyzer(game_handler=game_handler)

        # --- Ensure analyzer is always defined for final logging/error return ---
        if analyzer is None:
            analyzer = RuleAnalyzer(game_handler=game_handler)

        # --- Refined Result/Error Handling ---
        # Check if the analyzer recorded errors during visitation
        if analyzer.error_log:
            logging.warning("Errors occurred during AST visitation.")
            # Combine logs and return a visitation error
            error_result = {
                'type': 'error',
                'message': 'Errors occurred during AST node visitation.',
                'subtype': 'visitation',
                'debug_log': analyzer.debug_log,
                'error_log': analyzer.error_log
            }
            final_result = error_result
        elif analysis_result is None:
            # If no errors but result is still None, it means analysis didn't produce a rule structure
            context_str = f" for {context_info}" if context_info else ""
            logging.warning(f"Analysis finished without errors but produced no result (None){context_str}.")
            final_result = {
                'type': 'error',
                'message': f'Analysis did not produce a result structure (returned None){context_str}.',
                'subtype': 'no_result',
                'debug_log': analyzer.debug_log,
                'error_log': analyzer.error_log
            }
        else:
            # Successful analysis
            final_result = analysis_result

        # Always log the final result (or error structure) being returned
        try:
            logging.debug(
                f"analyze_rule: Final result before return = "
                f"{json.dumps(make_json_serializable(final_result), indent=2)}"
            )
        except Exception as debug_err:
            logging.debug(f"analyze_rule: Could not serialize final result for debug logging: {debug_err}")
            logging.debug(f"analyze_rule: Final result (repr) = {repr(final_result)}")
        return final_result

    except Exception as e:
        error_message = f"Unexpected top-level error in rule analysis: {e}"
        logging.critical(error_message, exc_info=True)

        # Create an error structure instead of defaulting to True
        error_result = {
            'type': 'error',
            'message': error_message,
            'subtype': 'unexpected',
            'debug_log': analyzer.debug_log if analyzer else [],
            'error_log': analyzer.error_log if analyzer else []
        }
        # Attempt to add traceback if possible
        try:
            error_result['traceback'] = traceback.format_exc()
        except Exception:
            pass  # Ignore errors during traceback formatting

        return error_result
