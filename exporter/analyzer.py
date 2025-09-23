# exporter/analyzer.py

"""
Rule Parser Analyzer

This module handles the extraction and analysis of rule functions from Archipelago's Python code.
It converts rule functions into a standardized JSON format for use in frontend implementations.

Key Rule Patterns:
1. Simple boolean returns:
   lambda state: True

2. Item checks:
   lambda state: state.has('Item Name', player)

3. Complex boolean operations:
   lambda state: state.has('A', player) and state.has('B', player)
   lambda state: state.has('A', player) or state.has('B', player)

4. Helper function calls:
   lambda state: can_lift_rocks(state, player)

5. State method calls:
   lambda state: state._lttp_has_key('Small Key (Palace)', player, 3)

6. Conditional expressions:
   lambda state: (a if condition else b)

7. Nested structures with location names:
   lambda state: item_name_in_location_names(state, 'Big Key (Palace)', player, 
                    [('Palace - Room', player)])
"""

import ast
import inspect
import re
from typing import Any, Dict, Optional, Set, Callable, List
import traceback
import json
import logging
import astunparse

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    filename='rule_analysis_debug.log')

# Caching for performance
file_content_cache: Dict[str, str] = {}  # Raw file content as strings
ast_cache: Dict[str, ast.AST] = {}  # Parsed AST objects

# Regex definitions
REGEX_LAMBDA_BODY = re.compile(r'lambda\s+([\w\s,()=]*):\s*(.*)', re.DOTALL)

class LambdaLineFinder(ast.NodeVisitor):
    """An AST visitor to find a lambda function at a specific line number."""
    def __init__(self, target_line):
        self.target_line = target_line
        self.found_node = None

    def visit_Lambda(self, node):
        if self.found_node is None and hasattr(node, 'lineno') and node.lineno == self.target_line:
            self.found_node = node
        # No need to visit children of the lambda itself

    def visit(self, node):
        # Override visit to stop searching once the node is found
        if self.found_node:
            return
        super().visit(node)

def get_multiline_lambda_source(func):
    """
    Robustly gets the full source code of a lambda function using full-file AST parsing.
    Includes caching for both file content and the parsed AST to improve performance.
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
                with open(filename, 'r', encoding='utf-8') as f:
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
            return inspect.getsource(func) # Fallback

    except Exception as e:
        logging.error(f"Failed to get multiline lambda source for {func}: {e}")
        try:
            return inspect.getsource(func) # Fallback
        except Exception as fallback_e:
            logging.error(f"Fallback getsource also failed: {fallback_e}")
            return None

# Helper functions
def _read_multiline_lambda(func):
    """Read a multiline lambda function using tokenize to properly handle parentheses and indentation."""
    try:
        import tokenize
        import io
        
        # Get the file and line number where the lambda starts
        filename = inspect.getfile(func)
        start_line = func.__code__.co_firstlineno
        
        if filename in file_content_cache:
            lines = file_content_cache[filename]
            logging.debug(f"_read_multiline_lambda: Using cached content for {filename}")
        else:
            logging.debug(f"_read_multiline_lambda: Reading and caching content for {filename}")
            with open(filename, 'r') as f:
                # Read the file line by line
                lines = f.readlines()
            file_content_cache[filename] = lines # Store in cache

        # Start with the line containing the lambda
        # Correct for 0-based list index vs 1-based line number
        if start_line <= 0 or start_line > len(lines):
            logging.error(f"Error: start_line {start_line} is out of bounds for file {filename} with {len(lines)} lines.")
            return None # Or handle error appropriately

        lambda_text = lines[start_line-1]
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

        # Strip "#" and anything after it
        lambda_text = re.sub(r'#.*$', '', lambda_text, flags=re.MULTILINE)
        
        return lambda_text
    except Exception as e:
        logging.error(f"Error reading multiline lambda: {e}", exc_info=True)
        return None

def _clean_source(func):
    """
    A new version of _clean_source that uses the robust lambda finder.
    """
    try:
        # Use the new robust function to get the full lambda source
        source = get_multiline_lambda_source(func)
        if source is None:
            return None

        # Remove comments from the source
        source = re.sub(r'#.*$', '', source, flags=re.MULTILINE)
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
                    param_name = 'state' # Keep it simple for now
                    logging.debug(f"_clean_source: Confirmed staticmethod(lambda {param_name}: True). Returning standard True func.")
                    return f"def __analyzed_func__({param_name}):\n    return True"
                else:
                    logging.warning(f"_clean_source: staticmethod found, but does not wrap a simple 'lambda: True'. Lambda body: {ast.dump(lambda_node) if isinstance(lambda_node, ast.Lambda) else 'Not a Lambda'}")
            else:
                logging.warning(f"_clean_source: staticmethod found, but AST structure is not the expected assignment pattern. Assigned value: {ast.dump(assigned_value) if assigned_value else 'None'}")

        except SyntaxError as parse_err:
            logging.warning(f"_clean_source: SyntaxError parsing staticmethod source: {parse_err}. Source: {repr(source)}")
        except Exception as e:
            logging.error(f"_clean_source: Error during AST analysis of staticmethod: {e}. Source: {repr(source)}", exc_info=True)
            
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

class RuleAnalyzer(ast.NodeVisitor):
    """
    AST Visitor that converts rule functions into a structured format.
    
    Handles:
    - Lambda functions
    - Boolean operations
    - Method calls
    - Helper functions
    - Nested expressions
    """
    def __init__(self, closure_vars=None, seen_funcs=None, game_handler=None, rule_func=None, player_context=None):
        self.closure_vars = closure_vars or {}  # Helper functions available in closure
        self.seen_funcs = seen_funcs or {}  # Track analyzed helper functions
        self.game_handler = game_handler  # Game-specific handler for name replacements
        self.rule_func = rule_func  # Original function for accessing defaults
        self.player_context = player_context  # Current player number context
        self.debug_log = []
        self.error_log = []

    def log_debug(self, message):
        """Log debug message."""
        logging.debug(message)
        self.debug_log.append(message)

    def log_error(self, message, exception=None):
        """Log error message with optional exception details."""
        error_entry = {
            'message': message,
            'trace': traceback.format_exc() if exception else None
        }
        logging.error(message)
        self.error_log.append(error_entry)

    def resolve_variable(self, var_name):
        """Resolve variable name using function defaults or closure variables."""
        # First check closure variables
        if var_name in self.closure_vars:
            return self.closure_vars[var_name]
        
        # Then check function defaults if available
        if self.rule_func and hasattr(self.rule_func, '__defaults__') and self.rule_func.__defaults__:
            # Get parameter names from function code
            if hasattr(self.rule_func, '__code__'):
                arg_names = self.rule_func.__code__.co_varnames[:self.rule_func.__code__.co_argcount]
                defaults = self.rule_func.__defaults__
                
                # Map default values to parameter names (defaults apply to last N parameters)
                if len(defaults) > 0:
                    default_start = len(arg_names) - len(defaults)
                    for i, default_value in enumerate(defaults):
                        param_name = arg_names[default_start + i]
                        if param_name == var_name:
                            logging.debug(f"Resolved variable '{var_name}' to default value: {default_value}")
                            return default_value
        
        logging.debug(f"Could not resolve variable '{var_name}'")
        return None

    def visit_Module(self, node):
        try:
            logging.debug(f"\n--- Starting Module Analysis ---")
            logging.debug(f"Module body length: {len(node.body)}")
            
            # Detailed module body inspection
            for i, body_node in enumerate(node.body):
                logging.debug(f"Module body node {i}: {type(body_node).__name__}")
                
            # Visit first node in module body if exists and return its result
            if node.body:
                return self.visit(node.body[0])
            return None # Return None if no body
        except Exception as e:
            logging.error("Error in visit_Module", e)
            return None

    def visit_FunctionDef(self, node):
        try:
            logging.debug(f"\n--- Analyzing Function Definition: {node.name} ---")
            logging.debug(f"Function args: {[arg.arg for arg in node.args.args]}")
            
            # Detailed function body inspection
            for i, body_node in enumerate(node.body):
                logging.debug(f"Function body node {i}: {type(body_node).__name__}")
            
            # Visit the first body node if exists and return its result
            # Assumes the meaningful part is the first statement (e.g., return)
            if node.body:
                return self.visit(node.body[0]) 
            return None # Return None if no body
        except Exception as e:
            logging.error(f"Error analyzing function {node.name}", e)
            return None

    def visit_Lambda(self, node):
        try:
            logging.debug("\n--- Analyzing Lambda ---")
            logging.debug(f"Lambda args: {[arg.arg for arg in node.args.args]}")
            logging.debug(f"Lambda body type: {type(node.body).__name__}")
            
            # Visit the lambda body and return its result
            return self.visit(node.body)
        except Exception as e:
            logging.error("Error in visit_Lambda", e)
            return None

    def visit_Return(self, node):
        try:
            logging.debug("\n--- Analyzing Return ---")
            logging.debug(f"Return value type: {type(node.value).__name__}")
            
            if isinstance(node.value, ast.BoolOp):
                logging.debug(f"BoolOp type: {type(node.value.op).__name__}")
                logging.debug(f"BoolOp values count: {len(node.value.values)}")
            
            # Visit the return value and return its result
            return self.visit(node.value)
        except Exception as e:
            logging.error("Error in visit_Return", e)
            return None

    def visit_Call(self, node):
        """
        Updated visit_Call method that properly handles complex arguments and special cases better.
        """
        logging.debug(f"\nvisit_Call called:")
        logging.debug(f"Function: {ast.dump(node.func)}")
        logging.debug(f"Args: {[ast.dump(arg) for arg in node.args]}")

        # Visit the function node to obtain its details.
        func_info = self.visit(node.func) # Get returned result
        logging.debug(f"Function info after visit: {func_info}")

        # Process arguments
        args = []
        processed_args = []
        for i, arg_node in enumerate(node.args):
            arg_result = self.visit(arg_node) # Get returned result for each arg
            if arg_result is None:
                 logging.error(f"Failed to analyze argument {i} in call: {ast.dump(arg_node)}")
                 # More permissive - continue even if arg analysis fails
                 continue
            args.append(arg_result)
            
            # Still skip names "state" and "player" for processed_args used by helpers
            if not (isinstance(arg_node, ast.Name) and arg_node.id in ['state', 'player']):
                processed_args.append(arg_result)

        logging.debug(f"Collected args: {args}") # Simplified comment
        logging.debug(f"Processed args (without state/player): {processed_args}") # Simplified comment

        # --- Determine the type of call --- 

        # 1. Helper function call (identified by name)
        if func_info and func_info.get('type') == 'name':
            func_name = func_info['name']
            logging.debug(f"Checking helper: {func_name}")
            
            # Check for game-specific special function calls
            if self.game_handler and hasattr(self.game_handler, 'handle_special_function_call'):
                special_result = self.game_handler.handle_special_function_call(func_name, processed_args)
                if special_result:
                    logging.debug(f"Game handler processed special function {func_name}: {special_result}")
                    return special_result
            
            # Check if the function name is in closure vars
            if func_name in self.closure_vars:
                 logging.debug(f"Identified call to known closure variable: {func_name}")
                 
                 # --- Recursive analysis logic (enhanced for multiline lambdas) ---
                 try:
                     # Correctly check if 'state' is passed as an argument AST node
                     has_state_arg = any(isinstance(arg, ast.Name) and arg.id == 'state' for arg in node.args) 
                     # Attempt recursion if state arg is present
                     if has_state_arg:
                          # Get the actual function from the closure
                          actual_func = self.closure_vars[func_name]
                          logging.debug(f"Recursively analyzing closure function: {func_name} -> {actual_func}")
                          # Pass the seen_funcs dictionary (it's mutable state)
                          recursive_result = analyze_rule(rule_func=actual_func, 
                                                          closure_vars=self.closure_vars.copy(), 
                                                          seen_funcs=self.seen_funcs, # Pass the dict
                                                          game_handler=self.game_handler,
                                                          player_context=self.player_context)
                          if recursive_result.get('type') != 'error':
                              logging.debug(f"Recursive analysis successful for {func_name}. Result: {recursive_result}")
                              return recursive_result # Return the detailed analysis result
                          else:
                              logging.debug(f"Recursive analysis for {func_name} returned type 'error'. Falling back to helper node. Error details: {recursive_result.get('error_log')}")
                 except Exception as e:
                      logging.error(f"Error during recursive analysis of closure var {func_name}", e)
                 # --- END Recursive analysis logic ---
                 # If recursion wasn't attempted or failed, fall through to default helper representation

            # *** Special handling for all(GeneratorExp) ***
            if func_name == 'all' and len(processed_args) == 1 and processed_args[0].get('type') == 'generator_expression':
                logging.debug(f"Detected all(GeneratorExp) pattern.")
                gen_exp = processed_args[0] # The result from visit_GeneratorExp
                # Represent this as a specific 'all_of' rule type
                result = {
                    'type': 'all_of',
                    'element_rule': gen_exp['element'],
                    'iterator_info': gen_exp['comprehension'] 
                }
                logging.debug(f"Created 'all_of' result: {result}")
                return result
            # *** END ADDED ***

            # *** Special handling for zip() function ***
            if func_name == 'zip':
                logging.debug(f"Detected zip() function call with {len(processed_args)} args")
                processed_result = self._try_preprocess_zip(processed_args)
                if processed_result is not None:
                    logging.debug(f"Pre-processed zip() to: {processed_result}")
                    return processed_result
                # If can't pre-process, fall through to regular helper handling

            # *** Special handling for len() function ***
            if func_name == 'len' and len(processed_args) == 1:
                logging.debug(f"Detected len() function call")
                processed_result = self._try_preprocess_len(processed_args[0])
                if processed_result is not None:
                    logging.debug(f"Pre-processed len() to: {processed_result}")
                    return processed_result
                # If can't pre-process, fall through to regular helper handling

            result = {
                'type': 'helper',
                'name': func_name,
                'args': processed_args
            }
            logging.debug(f"Created helper result: {result}")
            return result # Return helper result
        
        # 2. State method call (e.g., state.has)
        elif func_info and func_info.get('type') == 'attribute':
            if func_info['object'].get('type') == 'name' and func_info['object'].get('name') == 'state':
                method = func_info['attr']
                logging.debug(f"Processing state method: {method}")
                
                # Simplify handling based on method name
                if method == 'has' and len(processed_args) >= 1:
                    logging.debug(f"Processing state.has with {len(processed_args)} args: {processed_args}")
                    result = {'type': 'item_check', 'item': processed_args[0]}
                    # Check for count parameter - could be 2nd or 3rd argument depending on if player is filtered
                    if len(processed_args) >= 2:
                        # If 2nd argument is numeric constant or variable name, it's likely the count
                        second_arg = processed_args[1]
                        if isinstance(second_arg, dict):
                            # Handle constant integer (like 15)
                            if second_arg.get('type') == 'constant' and isinstance(second_arg.get('value'), int):
                                logging.debug(f"Found count parameter in position 1: {second_arg}")
                                result['count'] = second_arg
                            # Handle variable name (like min_feathers)
                            elif second_arg.get('type') == 'name' and second_arg.get('name'):
                                var_name = second_arg.get('name')
                                resolved_value = self.resolve_variable(var_name)
                                if resolved_value is not None:
                                    # Successfully resolved variable to a concrete value
                                    logging.debug(f"Found variable count parameter in position 1: {second_arg} -> {resolved_value}")
                                    result['count'] = {'type': 'constant', 'value': resolved_value}
                                else:
                                    # Could not resolve, keep as variable reference
                                    logging.debug(f"Found unresolved variable count parameter in position 1: {second_arg}")
                                    result['count'] = second_arg
                    elif len(processed_args) >= 3:
                        # Traditional 3-argument case (item, player, count)
                        logging.debug(f"Found count parameter in position 2: {processed_args[2]}")
                        result['count'] = processed_args[2]
                elif method == 'has_group' and len(processed_args) >= 1:
                    result = {'type': 'group_check', 'group': processed_args[0]}
                elif method == 'has_any' and len(processed_args) >= 1 and isinstance(processed_args[0], list):
                    result = {'type': 'or', 'conditions': [{'type': 'item_check', 'item': item} for item in processed_args[0]]}
                elif method == '_lttp_has_key' and len(processed_args) >= 1:
                    # Default count to 1 if not specified
                    count = processed_args[1] if len(processed_args) >= 2 else {'type': 'constant', 'value': 1}
                    result = {'type': 'count_check', 'item': processed_args[0], 'count': count}
                # Add other state methods like can_reach if needed
                # elif method == 'can_reach': ... 
                else:
                    # Default for unhandled state methods
                    result = {'type': 'state_method', 'method': method, 'args': processed_args}
                
                logging.debug(f"State method result: {result}")
                return result # Return state method result

        # 3. Fallback for other types of calls (e.g., calling result of another function)
        logging.debug(f"Fallback function call type. func_info = {func_info}")
        result = {
            'type': 'function_call',
            'function': func_info,
            'args': processed_args # Use processed args here too
        }
        logging.debug(f"Fallback call result: {result}")
        return result # Return generic function call result

    def visit_Attribute(self, node):
        try:
            attr_name = node.attr
            logging.debug(f"visit_Attribute: Trying to access .{attr_name} on object of type {type(node.value).__name__}")
            logging.debug(f"visit_Attribute: Visiting object {type(node.value).__name__}")
            obj_result = self.visit(node.value) # Get returned result
            # attr_name = node.attr # Moved up
            
            # Specifically log if we are processing self.player
            if isinstance(node.value, ast.Name) and node.value.id == 'self' and attr_name == 'player':
                 logging.debug("visit_Attribute: Detected access to self.player")

            if obj_result:
                 result = {'type': 'attribute', 'object': obj_result, 'attr': attr_name}
                 logging.debug(f"visit_Attribute: Returning result {result}")
                 return result # Return the result
            else:
                 # Handle case where object visit failed
                 logging.error(f"visit_Attribute: Failed to get result for object in {ast.dump(node)}")
                 return None # Return None on error

        except Exception as e:
            logging.error(f"Error in visit_Attribute for {ast.dump(node)}", e)
            return None

    def visit_Name(self, node):
        try:
            name = node.id
            logging.debug(f"visit_Name: Name = {name}")
            # Specifically log 'self'
            if name == 'self':
                logging.debug("visit_Name: Detected 'self'")

            # Use game handler to replace names if available
            if self.game_handler and hasattr(self.game_handler, 'replace_name'):
                original_name = name
                name = self.game_handler.replace_name(name)
                if name != original_name:
                    logging.debug(f"visit_Name: Game handler replaced '{original_name}' with '{name}'")

            result = {'type': 'name', 'name': name}
            logging.debug(f"visit_Name: Set result to {result}")
            return result # Return the result
        except Exception as e:
            logging.error(f"Error in visit_Name for {node.id}", e)
            return None # Return None on error

    def visit_Expr(self, node: ast.Expr):
        """ Handle expression statements, checking for top-level set_rule/add_item_rule calls. """
        logging.debug(f"\n--- visit_Expr --- Node Value Type: {type(node.value).__name__}")
        # Check if the expression's value is a call to set_rule or add_rule
        if isinstance(node.value, ast.Call):
            call_node = node.value
            func_name = None
            # Determine the function name being called
            if isinstance(call_node.func, ast.Name):
                func_name = call_node.func.id
            elif isinstance(call_node.func, ast.Attribute):
                func_name = call_node.func.attr

            # If it's a rule-setting function with at least 2 arguments...
            if func_name in ['set_rule', 'add_rule', 'add_item_rule'] and len(call_node.args) >= 2:
                logging.debug(f"visit_Expr: Detected top-level '{func_name}' call. Visiting rule argument directly.")
                # Visit the second argument (the rule function/lambda) and return its result
                rule_result = self.visit(call_node.args[1])
                logging.debug(f"visit_Expr: Finished visiting rule argument for '{func_name}'. Returning result: {rule_result}")
                return rule_result

        # If not a top-level rule-setting call, visit the expression value normally and return its result
        logging.debug("visit_Expr: Not a top-level rule call, visiting value.")
        return self.visit(node.value)

    def visit_Constant(self, node):
        logging.debug("\nvisit_Constant called")
        logging.debug(f"Constant node: {ast.dump(node)}")
        result = {
            'type': 'constant',
            'value': node.value
        }
        logging.debug(f"Constant result: {result}")
        return result # Return the result

    def visit_JoinedStr(self, node):
        """Handle f-string nodes (JoinedStr)"""
        logging.debug("\nvisit_JoinedStr called")
        logging.debug(f"JoinedStr node: {ast.dump(node)}")

        # Check if all parts are constants or simple names
        # If so, we might be able to construct the full string
        all_parts_simple = True
        parts = []

        for value in node.values:
            if isinstance(value, ast.Constant):
                parts.append({'type': 'constant', 'value': str(value.value)})
            elif isinstance(value, ast.FormattedValue):
                # Visit the formatted value to get its content
                formatted_result = self.visit(value)
                parts.append(formatted_result)
                if formatted_result.get('type') not in ['constant', 'name', 'formatted_value']:
                    all_parts_simple = False
            else:
                parts.append({'type': 'unknown'})
                all_parts_simple = False

        result = {
            'type': 'f_string',
            'parts': parts,
            'all_simple': all_parts_simple
        }

        # If all parts are simple, try to construct a placeholder string
        if all_parts_simple:
            value_parts = []
            for part in parts:
                if part.get('type') == 'constant':
                    value_parts.append(str(part.get('value', '')))
                elif part.get('type') == 'formatted_value':
                    inner = part.get('value', {})
                    if inner.get('type') == 'name':
                        # Keep the name as a placeholder for now
                        value_parts.append(f"{{{inner.get('name', '...')}}}")
                    elif inner.get('type') == 'constant':
                        value_parts.append(str(inner.get('value', '')))
                    else:
                        value_parts.append("{...}")
                else:
                    value_parts.append("{...}")
            result['value'] = ''.join(value_parts)

        logging.debug(f"JoinedStr result: {result}")
        return result

    def visit_FormattedValue(self, node):
        """Handle formatted value nodes within f-strings"""
        logging.debug("\nvisit_FormattedValue called")
        logging.debug(f"FormattedValue node: {ast.dump(node)}")

        # Visit the value expression to get its details
        value_result = self.visit(node.value) if node.value else None

        result = {
            'type': 'formatted_value',
            'value': value_result
        }
        logging.debug(f"FormattedValue result: {result}")
        return result

    def visit_Subscript(self, node):
        """
        Handle subscript expressions like foo[bar]
        """
        logging.debug(f"\nvisit_Subscript called:")
        logging.debug(f"Value: {ast.dump(node.value)}")
        logging.debug(f"Slice: {ast.dump(node.slice)}")
        
        # First visit the value (the object being subscripted)
        value_info = self.visit(node.value) # Get returned result
        
        # Then visit the slice (the index)
        index_info = self.visit(node.slice) # Get returned result
        
        # Check if sub-visits were successful
        if value_info is None or index_info is None:
            logging.error(f"Error visiting value or index in subscript: {ast.dump(node)}")
            return None
            
        # Create a subscript node
        result = {
            'type': 'subscript',
            'value': value_info,
            'index': index_info
        }
        
        logging.debug(f"Subscript result: {result}")
        return result # Return the result

    def visit_BoolOp(self, node):
        """Handle boolean operations (AND/OR) between conditions"""
        try:
            logging.debug("\nvisit_BoolOp called:")
            logging.debug(f"Operator: {type(node.op).__name__}")
            logging.debug(f"Values: {[ast.dump(val) for val in node.values]}")
            
            # Process each value in the boolean operation
            conditions = []
            for value in node.values:
                condition_result = self.visit(value) # Get returned result
                if condition_result:
                    conditions.append(condition_result)
                else:
                    logging.error(f"Failed to analyze condition in BoolOp: {ast.dump(value)}")
                    return None # Fail the whole operation if one part fails

            # Create appropriate rule structure based on operator type
            op_type = 'and' if isinstance(node.op, ast.And) else 'or' if isinstance(node.op, ast.Or) else None
            if not op_type:
                logging.debug(f"Unknown boolean operator: {type(node.op).__name__}")
                return None
            
            result = {
                'type': op_type,
                'conditions': conditions
            }
            logging.debug(f"Boolean operation result: {result}")
            return result # Return the result
            
        except Exception as e:
            logging.error(f"Error in visit_BoolOp", e)
            return None

    def visit_UnaryOp(self, node: ast.UnaryOp):
        """ Handle unary operations (e.g., not). """
        try:
            op_name = type(node.op).__name__.lower()
            logging.debug(f"\n--- visit_UnaryOp: op={op_name} ---")
            
            operand_result = self.visit(node.operand)
            if operand_result is None:
                logging.error(f"Failed to analyze operand for UnaryOp: {ast.dump(node.operand)}")
                return None

            # Handle specific unary operators
            if isinstance(node.op, ast.Not):
                return {'type': 'not', 'condition': operand_result}
            # Add other unary ops (e.g., UAdd, USub) if needed for rules
            else:
                logging.error(f"Unhandled unary operator: {op_name}")
                return None # Or a generic representation

        except Exception as e:
            logging.error("Error in visit_UnaryOp", e)
            return None

    def visit_Compare(self, node: ast.Compare):
        """ Handle comparison operations (e.g., ==, !=, in, not in, is, is not). """
        try:
            logging.debug(f"\n--- visit_Compare ---")
            if len(node.ops) != 1 or len(node.comparators) != 1:
                # For now, only support simple comparisons like `a op b`
                logging.error(f"Unsupported chained comparison: {ast.dump(node)}")
                return None

            left_result = self.visit(node.left)
            op_name = type(node.ops[0]).__name__.lower() # e.g., 'eq', 'in', 'is'
            right_result = self.visit(node.comparators[0])

            if left_result is None or right_result is None:
                logging.error(f"Failed to analyze left or right side of comparison: {ast.dump(node)}")
                return None

            # Map AST operator names to a simpler representation if desired
            op_map = {
                'eq': '==', 'noteq': '!=',
                'lt': '<', 'lte': '<=',
                'gt': '>', 'gte': '>=',
                'is': 'is', 'isnot': 'is not',
                'in': 'in', 'notin': 'not in'
            }
            op_symbol = op_map.get(op_name, op_name) # Use original name if not in map

            return {
                'type': 'compare',
                'left': left_result,
                'op': op_symbol,
                'right': right_result
            }

        except Exception as e:
            logging.error("Error in visit_Compare", e)
            return None

    def visit_Tuple(self, node: ast.Tuple):
        """ Handle tuple literals. """
        try:
            logging.debug(f"\n--- visit_Tuple ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    logging.error(f"Failed to analyze element in Tuple: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON
            return {'type': 'list', 'value': elements}
        except Exception as e:
            logging.error("Error in visit_Tuple", e)
            return None

    def visit_List(self, node: ast.List):
        """ Handle list literals. """
        try:
            logging.debug(f"\n--- visit_List ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    logging.error(f"Failed to analyze element in List: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON
            return {'type': 'list', 'value': elements}
        except Exception as e:
            logging.error("Error in visit_List", e)
            return None

    def visit_Set(self, node: ast.Set):
        """ Handle set literals. """
        try:
            logging.debug(f"\n--- visit_Set ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    logging.error(f"Failed to analyze element in Set: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON (consistent with tuple/list)
            return {'type': 'list', 'value': elements}
        except Exception as e:
            logging.error("Error in visit_Set", e)
            return None

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        """ Handle generator expressions. """
        try:
            logging.debug(f"\n--- visit_GeneratorExp ---")
            # Analyze the element expression
            elt_result = self.visit(node.elt)
            if elt_result is None:
                logging.error(f"Failed to analyze element expression in GeneratorExp: {ast.dump(node.elt)}")
                return None

            # Analyze the comprehension generators
            # NOTE: Currently only supports one comprehension generator like `for target in iter`
            if len(node.generators) != 1:
                logging.error(f"Unsupported number of generators in GeneratorExp: {len(node.generators)}")
                return None

            comprehension_result = self.visit(node.generators[0])
            if comprehension_result is None:
                 logging.error(f"Failed to analyze comprehension in GeneratorExp")
                 return None

            # Combine results into a dedicated type
            return {
                'type': 'generator_expression',
                'element': elt_result,
                'comprehension': comprehension_result
            }
        except Exception as e:
            logging.error("Error in visit_GeneratorExp", e)
            return None

    def visit_comprehension(self, node: ast.comprehension):
        """ Handle the 'for target in iter' part of comprehensions/generators. """
        try:
            logging.debug(f"\n--- visit_comprehension ---")
            target_result = self.visit(node.target)
            iter_result = self.visit(node.iter)
            # Note: Ignoring ifs for now (e.g., for x in y if z)

            if target_result is None or iter_result is None:
                 logging.error(f"Failed to analyze target or iterator in comprehension")
                 return None

            # Return details needed to understand the iteration
            return {
                'type': 'comprehension_details',
                'target': target_result,
                'iterator': iter_result
                # 'conditions': [self.visit(if_node) for if_node in node.ifs] # Future enhancement
            }
        except Exception as e:
            logging.error("Error in visit_comprehension", e)
            return None

    def generic_visit(self, node):
        """Override to add detailed logging for unexpected node types."""
        try:
            logging.debug(f"\n--- Generic Visit: {type(node).__name__} ---")
            logging.debug(f"Node details: {vars(node)}")
            super().generic_visit(node)
        except Exception as e:
            logging.error(f"Error in generic_visit for {type(node).__name__}", e)

    def visit_Assign(self, node: ast.Assign):
        """ Handle assignment statements. If the value is a lambda/rule, analyze it. """
        logging.debug(f"\n--- visit_Assign --- Targets: {len(node.targets)}, Value Type: {type(node.value).__name__}")
        # We are primarily interested in the value being assigned, as that often holds the rule lambda.
        # Visit the value node and return its result.
        value_result = self.visit(node.value)
        logging.debug(f"visit_Assign: Result from visiting value = {value_result}")
        return value_result # Return the result of analyzing the assigned value

    def visit_If(self, node: ast.If):
        """ Handle standard if statements. """
        try:
            logging.debug(f"\n--- visit_If ---")
            test_result = self.visit(node.test)
            
            # Assume simple structure where body/orelse contain a single statement (e.g., return)
            # and visit that statement directly.
            body_result = None
            if node.body:
                 body_result = self.visit(node.body[0]) # Visit the first statement in the 'if' block
            else:
                 logging.warning("visit_If: 'if' block is empty.")

            orelse_result = None
            if node.orelse:
                 orelse_result = self.visit(node.orelse[0]) # Visit the first statement in the 'else' block
            else:
                 # Handle cases with no 'else' - could return None or a specific structure
                 logging.debug("visit_If: No 'else' block found.")
                 # Depending on how 'no else' should be represented, adjust here.
                 # For now, represent missing else as None.

            if test_result is None or body_result is None: # Orelse can be None legitimately
                 logging.error(f"Failed to analyze test or body of If statement: {ast.dump(node)}")
                 # If body_result failed but orelse exists and succeeded, we might still want partial info?
                 # For simplicity, fail if test or body fails.
                 return None

            # Use a structure similar to IfExp (ternary) for consistency
            return {
                'type': 'conditional', # Reusing 'conditional' type
                'test': test_result,
                'if_true': body_result,
                'if_false': orelse_result # This will be None if no else block
            }
        except Exception as e:
            logging.error("Error in visit_If", e)
            return None

    def visit_IfExp(self, node: ast.IfExp):
        """ Handle conditional ternary expressions (body if test else orelse). """
        try:
            logging.debug(f"\n--- visit_IfExp ---")
            test_result = self.visit(node.test)
            body_result = self.visit(node.body)
            orelse_result = self.visit(node.orelse)

            if test_result is None or body_result is None or orelse_result is None:
                logging.error(f"Failed to analyze one or more parts of IfExp: {ast.dump(node)}")
                return None

            return {
                'type': 'conditional',
                'test': test_result,
                'if_true': body_result,
                'if_false': orelse_result
            }
        except Exception as e:
            logging.error("Error in visit_IfExp", e)
            return None

    def visit_BinOp(self, node: ast.BinOp):
        """ Handle binary operations (e.g., +, -, *, /). """
        try:
            logging.debug(f"\n--- visit_BinOp ---")
            left_result = self.visit(node.left)
            op_name = type(node.op).__name__ # E.g., 'Add', 'Mult'
            right_result = self.visit(node.right)

            if left_result is None or right_result is None:
                logging.error(f"Failed to analyze left or right side of BinOp: {ast.dump(node)}")
                return None

            # Map AST operator names to symbols
            op_map = {
                'Add': '+', 'Sub': '-', 
                'Mult': '*', 'Div': '/', 'FloorDiv': '//', 'Mod': '%',
                'Pow': '**',
                'LShift': '<<', 'RShift': '>>',
                'BitOr': '|', 'BitXor': '^', 'BitAnd': '&'
            }
            op_symbol = op_map.get(op_name, op_name) # Use class name if no symbol

            # Try to pre-process certain binary operations during export
            processed_result = self._try_preprocess_binary_op(left_result, op_symbol, right_result)
            if processed_result is not None:
                logging.debug(f"Pre-processed binary operation to: {processed_result}")
                return processed_result

            return {
                'type': 'binary_op',
                'left': left_result,
                'op': op_symbol,
                'right': right_result
            }
        except Exception as e:
            logging.error("Error in visit_BinOp", e)
            return None

    def _try_preprocess_binary_op(self, left_result, op_symbol, right_result):
        """
        Try to pre-process binary operations that can be computed during export.
        Returns the processed result or None if it can't be pre-processed.
        """
        try:
            # Handle list multiplication: [player] * constant_value
            if (op_symbol == '*' and 
                left_result and left_result.get('type') == 'list' and
                right_result and right_result.get('type') == 'constant'):
                
                # Extract the list being multiplied
                left_list = left_result.get('value', [])
                
                # Extract the constant value
                multiplier = right_result.get('value')
                if isinstance(multiplier, int) and multiplier > 0:
                    # Compute [player] * length = [player, player, player, ...]
                    result_list = left_list * multiplier
                    logging.debug(f"Pre-processed list multiplication: {left_list} * {multiplier} = {result_list}")
                    return {'type': 'list', 'value': result_list}
            
            # Handle list addition: list1 + list2
            elif (op_symbol == '+' and 
                  left_result and left_result.get('type') == 'name' and
                  right_result and right_result.get('type') == 'name'):
                
                # Try to resolve both list references
                left_data = self._try_resolve_list_data(left_result)
                right_data = self._try_resolve_list_data(right_result)
                
                if left_data is not None and right_data is not None:
                    combined_list = left_data + right_data
                    logging.debug(f"Pre-processed list addition: {left_data} + {right_data} = {combined_list}")
                    return {'type': 'constant', 'value': combined_list}
            
            # Handle list multiplication: [player] * len(some_list) (legacy case)
            elif (op_symbol == '*' and 
                  left_result and left_result.get('type') == 'list' and
                  right_result and right_result.get('type') == 'helper' and 
                  right_result.get('name') == 'len'):
                
                # Extract the list being multiplied
                left_list = left_result.get('value', [])
                
                # Extract the argument to len() function
                len_args = right_result.get('args', [])
                if len(len_args) == 1:
                    len_arg = len_args[0]
                    
                    # Check if we can resolve the length
                    resolved_length = self._try_resolve_list_length(len_arg)
                    if resolved_length is not None:
                        # Compute [player] * length = [player, player, player, ...]
                        result_list = left_list * resolved_length
                        logging.debug(f"Pre-processed list multiplication: {left_list} * {resolved_length} = {result_list}")
                        return {'type': 'list', 'value': result_list}
            
            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during binary operation pre-processing: {e}")
            return None

    def _try_resolve_list_length(self, list_ref):
        """
        Try to resolve the length of a list reference during export.
        Returns the length or None if it can't be resolved.
        """
        try:
            # Handle direct name references to known collections
            if list_ref and list_ref.get('type') == 'name':
                name = list_ref.get('name')
                
                # Check if we have game handler with known collections
                if self.game_handler and hasattr(self.game_handler, 'get_collection_length'):
                    length = self.game_handler.get_collection_length(name)
                    if length is not None:
                        logging.debug(f"Resolved length of '{name}' to {length}")
                        return length
                
                # Fallback to hardcoded known lengths for common ALTTP collections
                known_lengths = {
                    'randomizer_room_chests': 4,
                    'compass_room_chests': 5,
                    'back_chests': 5
                }
                
                if name in known_lengths:
                    logging.debug(f"Resolved length of '{name}' to {known_lengths[name]} (hardcoded)")
                    return known_lengths[name]
            
            return None  # Can't resolve
        except Exception as e:
            logging.warning(f"Error resolving list length: {e}")
            return None

    def _try_preprocess_zip(self, args):
        """
        Try to pre-process zip() function calls during export.
        zip(list1, list2) -> combined list of tuples as constants
        """
        try:
            if len(args) != 2:
                return None  # Only handle 2-argument zip for now
            
            list1_ref = args[0]
            list2_ref = args[1]
            
            # Try to resolve both lists
            list1_data = self._try_resolve_list_data(list1_ref)
            list2_data = self._try_resolve_list_data(list2_ref)
            
            # Handle the case where list2 is a binary_op that needs resolving
            if list1_data is not None and list2_data is None and list2_ref.get('type') == 'binary_op':
                # Try to resolve the binary operation first
                binary_op_result = self._try_resolve_binary_op_data(list2_ref)
                if binary_op_result is not None:
                    list2_data = binary_op_result
            
            if list1_data is not None and list2_data is not None:
                # Compute zip result
                zipped_result = []
                for item1, item2 in zip(list1_data, list2_data):
                    zipped_result.append([item1, item2])
                
                logging.debug(f"Pre-processed zip({list1_data}, {list2_data}) to {zipped_result}")
                return {'type': 'constant', 'value': zipped_result}
            
            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during zip pre-processing: {e}")
            return None

    def _try_preprocess_len(self, list_ref):
        """
        Try to pre-process len() function calls during export.
        """
        try:
            # First try to resolve length via named references
            resolved_length = self._try_resolve_list_length(list_ref)
            if resolved_length is not None:
                logging.debug(f"Pre-processed len() to {resolved_length}")
                return {'type': 'constant', 'value': resolved_length}
            
            # Also handle constant lists directly
            if list_ref and list_ref.get('type') == 'constant':
                constant_list = list_ref.get('value')
                if isinstance(constant_list, list):
                    length = len(constant_list)
                    logging.debug(f"Pre-processed len() of constant list to {length}")
                    return {'type': 'constant', 'value': length}
            
            return None  # Can't pre-process
        except Exception as e:
            logging.warning(f"Error during len pre-processing: {e}")
            return None

    def _try_resolve_list_data(self, list_ref):
        """
        Try to resolve the actual data of a list reference during export.
        Returns the list data or None if it can't be resolved.
        """
        try:
            # Handle direct name references to known collections
            if list_ref and list_ref.get('type') == 'name':
                name = list_ref.get('name')
                
                # Check if we have game handler with known collections
                if self.game_handler and hasattr(self.game_handler, 'get_collection_data'):
                    data = self.game_handler.get_collection_data(name)
                    if data is not None:
                        logging.debug(f"Resolved data of '{name}' to {data}")
                        return data
            
            # Handle constant lists and lists with name references
            elif list_ref and list_ref.get('type') == 'list':
                # Extract the actual values from the list structure
                list_values = []
                for item in list_ref.get('value', []):
                    if item.get('type') == 'constant':
                        list_values.append(item.get('value'))
                    elif item.get('type') == 'name':
                        # Try to resolve name references within the list
                        name = item.get('name')
                        if name == 'player':
                            # Use the actual player number from context if available
                            player_num = self._get_current_player_number()
                            list_values.append(player_num)
                        else:
                            # Can't resolve, return None
                            return None
                    else:
                        # Can't resolve complex items
                        return None
                return list_values
            
            # Handle constant values directly (for pre-processed constant lists)
            elif list_ref and list_ref.get('type') == 'constant':
                constant_value = list_ref.get('value')
                if isinstance(constant_value, list):
                    return constant_value
            
            return None  # Can't resolve
        except Exception as e:
            logging.warning(f"Error resolving list data: {e}")
            return None

    def _get_current_player_number(self):
        """
        Get the current player number for this rule analysis context.
        Returns 1 as default if no context is available.
        """
        if self.player_context is not None:
            return self.player_context
        # For now, return 1 as the default player number
        return 1

    def _try_resolve_binary_op_data(self, binary_op_ref):
        """
        Try to resolve a binary operation to its computed result data.
        Returns the computed list or None if it can't be resolved.
        """
        try:
            if binary_op_ref.get('type') != 'binary_op':
                return None
            
            op = binary_op_ref.get('op')
            left = binary_op_ref.get('left')
            right = binary_op_ref.get('right')
            
            # Handle list multiplication: [player] * constant_value
            if (op == '*' and 
                left and left.get('type') == 'list' and
                right and right.get('type') == 'constant'):
                
                left_data = self._try_resolve_list_data(left)
                multiplier = right.get('value')
                
                if left_data is not None and isinstance(multiplier, int) and multiplier > 0:
                    result = left_data * multiplier
                    logging.debug(f"Resolved binary_op: {left_data} * {multiplier} = {result}")
                    return result
            
            # Handle list multiplication: [player] * len(constant_list)
            elif (op == '*' and 
                  left and left.get('type') == 'list' and
                  right and right.get('type') == 'helper' and
                  right.get('name') == 'len'):
                
                left_data = self._try_resolve_list_data(left)
                len_args = right.get('args', [])
                
                if left_data is not None and len(len_args) == 1:
                    len_arg = len_args[0]
                    
                    # Handle constant lists in len() argument
                    if len_arg.get('type') == 'constant':
                        constant_list = len_arg.get('value')
                        if isinstance(constant_list, list):
                            multiplier = len(constant_list)
                            result = left_data * multiplier
                            logging.debug(f"Resolved binary_op: {left_data} * len({len(constant_list)}) = {result}")
                            return result
            
            # Handle list addition: list1 + list2
            elif (op == '+' and 
                  left and left.get('type') == 'name' and
                  right and right.get('type') == 'name'):
                
                left_data = self._try_resolve_list_data(left)
                right_data = self._try_resolve_list_data(right)
                
                if left_data is not None and right_data is not None:
                    result = left_data + right_data
                    logging.debug(f"Resolved binary_op: {left_data} + {right_data} = {result}")
                    return result
            
            return None
        except Exception as e:
            logging.warning(f"Error resolving binary operation data: {e}")
            return None

# --- AST Visitor to find specific lambda rules ---

class LambdaFinder(ast.NodeVisitor):
    """
    Searches an AST for calls to rule-setting functions (set_rule, add_rule, etc.)
    for a specific target and extracts the lambda function passed as the rule,
    handling cases where multiple definitions might exist.
    """
    def __init__(self, target_name: str, target_player: Optional[int] = None):
        self.target_name = target_name
        # self.target_player = target_player # Optional: Could add player matching if needed
        self._found_lambdas: List[ast.Lambda] = [] # Store all found lambdas
        self._visited_nodes = set() # Prevent infinite recursion on complex ASTs
        logging.debug(f"LambdaFinder initialized for target: {target_name}")

    def _extract_target_name_from_call(self, call_node: ast.Call) -> Optional[str]:
        """Helper to extract the target name from a get_location/entrance/region call."""
        if isinstance(call_node.func, ast.Attribute):
            method_name = call_node.func.attr
            if method_name in ['get_location', 'get_entrance', 'get_region']:
                if len(call_node.args) > 0 and isinstance(call_node.args[0], ast.Constant):
                    return call_node.args[0].value
                else:
                    logging.warning(f"LambdaFinder: No constant arg found for {method_name} call.")
            # else:
            #     logging.debug(f"LambdaFinder: Method name '{method_name}' not in expected list.")
        # else:
        #      logging.debug(f"LambdaFinder: Target node func is not Attribute. Type: {type(call_node.func)}, Dump: {ast.dump(call_node.func)}")
        return None

    def visit_Call(self, node: ast.Call):
        # Prevent revisiting nodes to avoid potential cycles
        if node in self._visited_nodes:
            return
        self._visited_nodes.add(node)

        # Check if this is potentially a call to 'set_rule' or similar
        func_name = None
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
             func_name = node.func.attr

        # Only proceed if it looks like a rule-setting function
        if func_name in ['set_rule', 'add_rule', 'add_item_rule']:
            if len(node.args) >= 2:
                # Try to extract the target name from the first argument
                target_node = node.args[0]
                extracted_target_name = None

                # Pattern: world.get_location/entrance/region("Target", player)
                if isinstance(target_node, ast.Call):
                    extracted_target_name = self._extract_target_name_from_call(target_node)
                    # if extracted_target_name:
                    #     logging.debug(f"LambdaFinder: Found '{func_name}' call targeting '{extracted_target_name}' via method call.")
                # else:
                #     # Potentially handle direct string constants if needed, though less common
                #     # if isinstance(target_node, ast.Constant) and isinstance(target_node.value, str):
                #     #     extracted_target_name = target_node.value
                #     logging.debug(f"LambdaFinder: Target node is not Call. Dump: {ast.dump(target_node)}")

                # --- Check if the extracted target name matches ---
                if extracted_target_name == self.target_name:
                    logging.debug(f"LambdaFinder: Target name '{self.target_name}' MATCHED!")
                    # --- Check if the second argument is a Lambda ---
                    rule_node = node.args[1]
                    if isinstance(rule_node, ast.Lambda):
                        logging.debug(f"LambdaFinder: Found Lambda node for target '{self.target_name}'!")
                        self._found_lambdas.append(rule_node)
                        # Do NOT return early, continue searching for other potential matches
                    # else:
                    #      logging.debug(f"LambdaFinder: Target '{self.target_name}' matched, but rule is not a Lambda node ({type(rule_node).__name__}).")

        # Continue visiting children regardless of finding a match
        super().generic_visit(node)

    def find_lambda_for_target(self, ast_tree: ast.AST) -> Optional[ast.Lambda]:
        """
        Visits the provided AST tree and returns the unique lambda definition
        for the target_name specified during initialization.

        Returns:
            ast.Lambda: The unique lambda node if found.
            None: If zero or more than one lambda definitions are found for the target.
        """
        logging.debug(f"LambdaFinder: Starting search in AST for target '{self.target_name}'")
        self._found_lambdas = [] # Reset for this search
        self._visited_nodes = set() # Reset visited nodes
        self.visit(ast_tree)

        count = len(self._found_lambdas)
        if count == 1:
            logging.debug(f"LambdaFinder: Found exactly one lambda for target '{self.target_name}'.")
            return self._found_lambdas[0]
        elif count == 0:
            logging.warning(f"LambdaFinder: Found zero lambdas for target '{self.target_name}'.")
            return None
        else:
            logging.warning(f"LambdaFinder: Found {count} lambdas for target '{self.target_name}'. Cannot uniquely determine rule, returning None.")
            # Optionally log the locations or details of the found lambdas for debugging
            # for i, lam in enumerate(self._found_lambdas):
            #     logging.debug(f"  Lambda {i+1} at line {getattr(lam, 'lineno', 'N/A')}")
            return None

# Main analysis function
def analyze_rule(rule_func: Optional[Callable[[Any], bool]] = None, 
                 closure_vars: Optional[Dict[str, Any]] = None, 
                 seen_funcs: Optional[Dict[int, int]] = None,
                 ast_node: Optional[ast.AST] = None,
                 game_handler=None,
                 player_context: Optional[int] = None) -> Dict[str, Any]:
    """
    Analyzes a rule function or an AST node representing a rule.

    Args:
        rule_func: The rule function (lambda or regular function) to analyze.
        closure_vars: Dictionary of variables available in the function's closure.
        seen_funcs: Dictionary of function IDs already analyzed to prevent recursion.
        ast_node: An optional pre-parsed AST node (e.g., ast.Lambda) to analyze directly.

    Returns:
        A dictionary representing the structured rule, or an error structure.
    """
    logging.debug("\n--- Starting Rule Analysis ---")

    # Initialize seen_funcs dict if not provided
    seen_funcs = seen_funcs or {}
    
    # Ensure closure_vars is a dictionary
    closure_vars = closure_vars or {}

    analyzer = None # Define analyzer in outer scope

    try:
        # --- Option 1: Analyze a provided AST node directly --- 
        analysis_result = None
        if ast_node:
            logging.debug(f"Analyzing provided AST node: {type(ast_node).__name__}")
            # Need an analyzer instance here too
            analyzer = RuleAnalyzer(closure_vars=closure_vars, seen_funcs=seen_funcs, game_handler=game_handler, player_context=player_context)
            analysis_result = analyzer.visit(ast_node) 

        # --- Option 2: Analyze a function object (existing logic) --- 
        elif rule_func:
            logging.debug(f"Rule function: {rule_func}")

            func_id = id(rule_func)
            # More permissive recursion check
            current_seen_count = seen_funcs.get(func_id, 0)
            # Allow more recursion depth for multiline lambdas (increased from 2 to 3)
            if current_seen_count >= 3:
                recursion_msg = f'Recursion detected: Already analyzing function {rule_func} {current_seen_count+1} times'
                logging.warning(f"analyze_rule: Function {rule_func} (id={func_id}) seen {current_seen_count+1} times, stopping recursion.")
                # Return a proper error structure
                return {
                    'type': 'error',
                    'message': recursion_msg,
                    'subtype': 'recursion', # Added subtype
                    'debug_log': [], 'error_log': []
                }
            
            # --- Work on a copy of closure_vars ---
            local_closure_vars = closure_vars.copy()

            # Attempt to add function's actual closure variables TO THE COPY
            try:
                if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                    closure_cells = rule_func.__closure__
                    free_vars = rule_func.__code__.co_freevars
                    for var_name, cell in zip(free_vars, closure_cells):
                        # REMOVED CHECK: Allow overwriting with current function's closure variables
                        # if var_name not in local_closure_vars: 
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
            # --- End closure extraction modification ---

            # Clean the source
            cleaned_source = _clean_source(rule_func)
            if cleaned_source is None:
                logging.error("analyze_rule: Failed to clean source, returning error.")
                # Need to initialize analyzer logs for the error result
                analyzer = RuleAnalyzer(game_handler=game_handler) # Create dummy analyzer for logs
                return {
                    'type': 'error',
                    'message': 'Failed to clean or retrieve source code for rule function.',
                    'subtype': 'source_cleaning', # Added subtype
                    'debug_log': analyzer.debug_log, # Return logs from dummy analyzer
                    'error_log': analyzer.error_log
                }
            logging.debug(f"Cleaned source: {repr(cleaned_source)}")
            
            # --- Analyzer creation and analysis --- 
            # analyzer = None # Already defined in outer scope
            analysis_result = None
            try:
                seen_funcs[func_id] = current_seen_count + 1
                logging.debug(f"analyze_rule: Incremented func_id {func_id} count in seen_funcs: {seen_funcs}")

                # Pass the LOCAL copy to the RuleAnalyzer instance
                analyzer = RuleAnalyzer(closure_vars=local_closure_vars, seen_funcs=seen_funcs, game_handler=game_handler, rule_func=rule_func, player_context=player_context)

                # Check if cleaned_source contains "Bridge"
                if cleaned_source and "Bridge" in cleaned_source:
                    logging.debug(f"analyze_rule: Detected 'Bridge' in the cleaned source code")
                
                # Comprehensive parse and visit
                try:
                    tree = ast.parse(cleaned_source)
                    logging.debug(f"analyze_rule: Parsed AST = {ast.dump(tree)}")
                    logging.debug("AST parsed successfully")
                    
                    # Always visit the full parsed tree in the fallback path
                    analysis_result = analyzer.visit(tree) # Get the result from visit

                except SyntaxError as parse_err:
                    logging.error(f"analyze_rule: SyntaxError during parse: {parse_err}", exc_info=True)
                    # Return error if parsing fails
                    return {
                         'type': 'error',
                         'message': f'SyntaxError parsing cleaned source: {parse_err}',
                         'subtype': 'ast_parse', # Added subtype
                         'cleaned_source': repr(cleaned_source), # Include source in error
                         'debug_log': analyzer.debug_log, # Return logs from analyzer
                         'error_log': analyzer.error_log
                    }
                    
            finally:
                if func_id in seen_funcs:
                    seen_funcs[func_id] -= 1
                    if seen_funcs[func_id] <= 0: 
                        del seen_funcs[func_id]
                    logging.debug(f"analyze_rule: Updated func_id {func_id} count/removed from seen_funcs: {seen_funcs}")
            # --- End inner try...finally ---
        else:
             # No function or AST node provided
             logging.warning("analyze_rule: Called without rule_func or ast_node.")
             analysis_result = None
             analyzer = RuleAnalyzer(game_handler=game_handler) # Create dummy analyzer for logs

        # --- Ensure analyzer is always defined for final logging/error return ---
        if analyzer is None: 
             analyzer = RuleAnalyzer(game_handler=game_handler) # Should only happen if ast_node and rule_func are None

        # --- Refined Result/Error Handling ---
        # Check if the analyzer recorded errors during visitation
        if analyzer.error_log:
             logging.warning("Errors occurred during AST visitation.")
             # Combine logs and return a visitation error
             error_result = {
                'type': 'error',
                'message': 'Errors occurred during AST node visitation.',
                'subtype': 'visitation', # Added subtype
                'debug_log': analyzer.debug_log,
                'error_log': analyzer.error_log
             }
             final_result = error_result
        elif analysis_result is None:
            # If no errors but result is still None, it means analysis didn't produce a rule structure
            logging.warning("Analysis finished without errors but produced no result (None).")
            final_result = {
                 'type': 'error',
                 'message': 'Analysis did not produce a result structure (returned None).',
                 'subtype': 'no_result', # Added subtype
                 'debug_log': analyzer.debug_log,
                 'error_log': analyzer.error_log # Include any (potentially empty) error log
            }
        else:
            # Successful analysis
            final_result = analysis_result

        # Always log the final result (or error structure) being returned
        logging.debug(f"analyze_rule: Final result before return = {json.dumps(final_result, indent=2)}")
        return final_result
    
    except Exception as e:
        error_message = f"Unexpected top-level error in rule analysis: {e}"
        logging.critical(error_message, exc_info=True) # Use critical, include traceback

        # Create an error structure instead of defaulting to True
        error_result = {
            'type': 'error',
            'message': error_message,
            'subtype': 'unexpected', # Added subtype
            'debug_log': analyzer.debug_log if analyzer else [], # Include logs if analyzer exists
            'error_log': analyzer.error_log if analyzer else []
        }
        # Attempt to add traceback if possible
        try:
            error_result['traceback'] = traceback.format_exc()
        except Exception:
            pass # Ignore errors during traceback formatting
            
        return error_result
