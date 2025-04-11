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

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    filename='rule_analysis_debug.log')

# --- ADDED: File content cache ---
file_content_cache: Dict[str, List[str]] = {}
# --- END ADDED ---

# Regex definitions
REGEX_LAMBDA_BODY = re.compile(r'lambda\s+([\w\s,()]*):\s*(.*)', re.DOTALL)

# Helper functions
def _read_multiline_lambda(func):
    """Read a multiline lambda function using tokenize to properly handle parentheses and indentation."""
    try:
        import tokenize
        import io
        
        # Get the file and line number where the lambda starts
        filename = inspect.getfile(func)
        start_line = func.__code__.co_firstlineno
        
        # --- MODIFIED: Use file cache ---
        if filename in file_content_cache:
            lines = file_content_cache[filename]
            print(f"_read_multiline_lambda: Using cached content for {filename}")
        else:
            print(f"_read_multiline_lambda: Reading and caching content for {filename}")
            with open(filename, 'r') as f:
                # Read the file line by line
                lines = f.readlines()
            file_content_cache[filename] = lines # Store in cache
        # --- END MODIFIED ---

        # Start with the line containing the lambda
        # Correct for 0-based list index vs 1-based line number
        if start_line <= 0 or start_line > len(lines):
            print(f"Error: start_line {start_line} is out of bounds for file {filename} with {len(lines)} lines.")
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
        
        # Remove any trailing operators (and, or, etc.)
        #truncated_operators = [' and', ' or', '+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', 'not', 'is']
        #for op in truncated_operators:
        #    if lambda_text.endswith(op):
        #        lambda_text = lambda_text[:-len(op)].strip()
        
        return lambda_text
    except Exception as e:
        print(f"Error reading multiline lambda: {e}")
        return None

def _clean_source(func):
    """Retrieve and clean the source code of a function, handling lambdas with better multiline support."""
    try:
        # Try using getsourcelines instead of getsource for better multiline support
        try:
            source_lines, start_line = inspect.getsourcelines(func)
            source = ''.join(source_lines)
            print(f"_clean_source: Got {len(source_lines)} lines from line {start_line}")
        except Exception as line_err:
            print(f"Could not get source lines for {func}: {line_err}")
            source = inspect.getsource(func)
            
        # Remove comments
        source = re.sub(r'#.*$', '', source, flags=re.MULTILINE)
        source = source.strip()
        print(f"_clean_source: Original source = {repr(source)}")
    except (TypeError, OSError) as e:
        print(f"Could not get source for {func}: {e}")
        return None

    # --- MODIFIED: More robust staticmethod check using AST ---
    if 'staticmethod(' in source:
        print(f"_clean_source: Detected 'staticmethod(' in source: {repr(source)}")
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
                    # param_name = lambda_node.args.args[0].arg if lambda_node.args.args else 'state'
                    param_name = 'state' # Keep it simple for now
                    print(f"_clean_source: Confirmed staticmethod(lambda {param_name}: True). Returning standard True func.")
                    return f"def __analyzed_func__({param_name}):\n    return True"
                else:
                    print(f"_clean_source: staticmethod found, but does not wrap a simple 'lambda: True'. Lambda body: {ast.dump(lambda_node) if isinstance(lambda_node, ast.Lambda) else 'Not a Lambda'}")
            else:
                print(f"_clean_source: staticmethod found, but AST structure is not the expected assignment pattern. Assigned value: {ast.dump(assigned_value) if assigned_value else 'None'}")

        except SyntaxError as parse_err:
            print(f"_clean_source: SyntaxError parsing staticmethod source: {parse_err}. Source: {repr(source)}")
        except Exception as e:
            print(f"_clean_source: Error during AST analysis of staticmethod: {e}. Source: {repr(source)}")

        # If AST analysis fails or doesn't match expected pattern, return None
        print("_clean_source: Could not robustly confirm staticmethod wraps lambda:True. Returning None.")
        return None
    # --- END MODIFIED ---

    # Handle lambda functions specifically
    match = REGEX_LAMBDA_BODY.match(source)
    if match:
        param = match.group(1).strip()
        body = match.group(2).strip()
        
        # Remove trailing comma potentially left by source inspection
        if body.endswith(','):
            body = body[:-1].rstrip()

        # --- Refined Truncation/Multiline Handling ---
        # Define operators that might indicate truncation if at the very end
        truncated_operators = [' and', ' or', '+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', 'not', 'is']
        # Check initial source for signs of truncation/imbalance
        is_potentially_incomplete = any(body.endswith(op) for op in truncated_operators)
        is_unbalanced = body.count('(') != body.count(')') # Simple balance check

        if is_potentially_incomplete or is_unbalanced:
            print(f"_clean_source: Initial lambda source seems incomplete or unbalanced. Trying _read_multiline_lambda.")
            full_lambda = _read_multiline_lambda(func)
            if full_lambda:
                # Re-extract body from the potentially more complete source
                full_match = REGEX_LAMBDA_BODY.match(full_lambda)
                if full_match:
                    body = full_match.group(2).strip()
                    if body.endswith(','):
                        body = body[:-1].rstrip()
                    print(f"_clean_source: Re-extracted body from full lambda: {repr(body)}")
                else:
                     print(f"WARNING: Could not parse body from _read_multiline_lambda result: {repr(full_lambda)}")
                     # Continue with the potentially flawed body from initial parse
            else:
                 print(f"WARNING: _read_multiline_lambda failed. Proceeding with potentially incomplete body.")
                 # Continue with the potentially flawed body from initial parse
        # --- End Refined Handling ---

        # Flatten the body: joins lines, removes leading/trailing whitespace per line
        body_lines = body.splitlines()
        body = ' '.join(line.strip() for line in body_lines)

        # Safer Parenthesis Balancing: Only remove excess *trailing* closing parentheses
        open_count = body.count('(')
        close_count = body.count(')')
        if close_count > open_count:
            excess = close_count - open_count
            original_body = body # Keep for logging
            removed_count = 0
            # Repeatedly strip trailing ')' only if it reduces excess
            while excess > 0 and body.endswith(')'):
                 body = body[:-1].strip()
                 excess -= 1
                 removed_count += 1

            if removed_count > 0:
                 print(f"WARNING: Removed {removed_count} excess trailing ')' from body. Original: {repr(original_body)}, Final: {repr(body)}")

        # Note: We no longer attempt to add missing closing parentheses.

        # Optional: Validate if the cleaned body is a valid expression
        try:
            ast.parse(body, mode='eval')
        except SyntaxError as body_parse_err:
            print(f"ERROR: Final cleaned lambda body failed to parse as expression: {body_parse_err}")
            print(f"Final Body: {repr(body)}")
            # If the body MUST be valid, returning None is safer:
            # return None
            # For now, let's allow it to proceed and potentially fail later in RuleAnalyzer

        print(f"_clean_source: Final body for lambda = {repr(body)}")
        return f"def __analyzed_func__({param}):\n    return {body}"

    # If source wasn't recognized as a lambda by the initial regex
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
    def __init__(self, closure_vars=None, seen_funcs=None):
        self.closure_vars = closure_vars or {}  # Helper functions available in closure
        self.seen_funcs = seen_funcs or {}  # Track analyzed helper functions
        self.current_result = None  # Current rule structure being built
        self.debug_log = []
        self.error_log = []

    def log_debug(self, message):
        """Log debug message to both console and log file."""
        logging.debug(message)
        self.debug_log.append(message)
        print(message)  # Also print to console for immediate visibility

    def log_error(self, message, exception=None):
        """Log error message with optional exception details."""
        error_entry = {
            'message': message,
            'trace': traceback.format_exc() if exception else None
        }
        logging.error(message)
        self.error_log.append(error_entry)
        print(f"ERROR: {message}")
        if exception:
            print(traceback.format_exc())

    def visit_Module(self, node):
        try:
            self.log_debug(f"\n--- Starting Module Analysis ---")
            self.log_debug(f"Module body length: {len(node.body)}")
            
            # Detailed module body inspection
            for i, body_node in enumerate(node.body):
                self.log_debug(f"Module body node {i}: {type(body_node).__name__}")
                
            # Visit first node in module body if exists and return its result
            if node.body:
                return self.visit(node.body[0])
            return None # Return None if no body
        except Exception as e:
            self.log_error("Error in visit_Module", e)
            return None

    def visit_FunctionDef(self, node):
        try:
            self.log_debug(f"\n--- Analyzing Function Definition: {node.name} ---")
            self.log_debug(f"Function args: {[arg.arg for arg in node.args.args]}")
            
            # Detailed function body inspection
            for i, body_node in enumerate(node.body):
                self.log_debug(f"Function body node {i}: {type(body_node).__name__}")
            
            # Visit the first body node if exists and return its result
            # Assumes the meaningful part is the first statement (e.g., return)
            if node.body:
                return self.visit(node.body[0]) 
            return None # Return None if no body
        except Exception as e:
            self.log_error(f"Error analyzing function {node.name}", e)
            return None

    def visit_Lambda(self, node):
        try:
            self.log_debug("\n--- Analyzing Lambda ---")
            self.log_debug(f"Lambda args: {[arg.arg for arg in node.args.args]}")
            self.log_debug(f"Lambda body type: {type(node.body).__name__}")
            
            # Visit the lambda body and return its result
            return self.visit(node.body)
        except Exception as e:
            self.log_error("Error in visit_Lambda", e)
            return None

    def visit_Return(self, node):
        try:
            self.log_debug("\n--- Analyzing Return ---")
            self.log_debug(f"Return value type: {type(node.value).__name__}")
            
            if isinstance(node.value, ast.BoolOp):
                self.log_debug(f"BoolOp type: {type(node.value.op).__name__}")
                self.log_debug(f"BoolOp values count: {len(node.value.values)}")
            
            # Visit the return value and return its result
            return self.visit(node.value)
        except Exception as e:
            self.log_error("Error in visit_Return", e)
            return None

    def visit_Call(self, node):
        """
        Updated visit_Call method that properly handles complex arguments and special cases better.
        """
        print(f"\nvisit_Call called:")
        print(f"Function: {ast.dump(node.func)}")
        print(f"Args: {[ast.dump(arg) for arg in node.args]}")

        # Visit the function node to obtain its details.
        func_info = self.visit(node.func) # Get returned result
        print(f"Function info after visit: {func_info}")

        # Process arguments
        args = []
        processed_args = []
        for i, arg_node in enumerate(node.args):
            arg_result = self.visit(arg_node) # Get returned result for each arg
            if arg_result is None:
                 self.log_error(f"Failed to analyze argument {i} in call: {ast.dump(arg_node)}")
                 # More permissive - continue even if arg analysis fails
                 continue
            args.append(arg_result)
            
            # Still skip names "state" and "player" for processed_args used by helpers
            if not (isinstance(arg_node, ast.Name) and arg_node.id in ['state', 'player']):
                processed_args.append(arg_result)

        print(f"Collected args: {args}")
        print(f"Processed args (without state/player): {processed_args}")

        # --- Determine the type of call --- 

        # 1. Helper function call (identified by name)
        if func_info and func_info.get('type') == 'name':
            func_name = func_info['name']
            print(f"Checking helper: {func_name}")
            
            # Check if the function name is in closure vars
            if func_name in self.closure_vars:
                 print(f"Identified call to known closure variable: {func_name}")
                 
                 # Check special case for rule/old_rule from old version
                 if func_name in ['rule', 'old_rule']:
                     helper_func = self.closure_vars[func_name]
                     # Use the recursive analysis with more permissive depth
                     return analyze_rule(helper_func, closure_vars=self.closure_vars.copy(), 
                                       seen_funcs=self.seen_funcs)
                 
                 # --- Recursive analysis logic (enhanced for multiline lambdas) ---
                 try:
                     # Correctly check if 'state' is passed as an argument AST node
                     has_state_arg = any(isinstance(arg, ast.Name) and arg.id == 'state' for arg in node.args) 
                     # Attempt recursion if state arg is present
                     if has_state_arg:
                          # Get the actual function from the closure
                          actual_func = self.closure_vars[func_name]
                          print(f"Recursively analyzing closure function: {func_name} -> {actual_func}")
                          # Pass the seen_funcs dictionary (it's mutable state)
                          recursive_result = analyze_rule(rule_func=actual_func, 
                                                          closure_vars=self.closure_vars.copy(), 
                                                          seen_funcs=self.seen_funcs) # Pass the dict
                          if recursive_result:
                              if recursive_result.get('type') != 'error':
                                  print(f"Recursive analysis successful for {func_name}. Result: {recursive_result}")
                                  return recursive_result # Return the detailed analysis result
                              else:
                                  print(f"Recursive analysis for {func_name} returned type 'error'. Falling back to helper node. Error details: {recursive_result.get('error_log')}")
                 except Exception as e:
                      print(f"Error during recursive analysis of closure var {func_name}: {e}")
                 # --- END Recursive analysis logic ---
                 # If recursion wasn't attempted or failed, fall through to default helper representation

            # *** Special handling for all(GeneratorExp) ***
            if func_name == 'all' and len(args) == 1 and args[0].get('type') == 'generator_expression':
                print(f"Detected all(GeneratorExp) pattern.")
                gen_exp = args[0] # The result from visit_GeneratorExp
                # Represent this as a specific 'all_of' rule type
                result = {
                    'type': 'all_of',
                    'element_rule': gen_exp['element'],
                    'iterator_info': gen_exp['comprehension'] 
                }
                print(f"Created 'all_of' result: {result}")
                return result
            # *** END ADDED ***

            result = {
                'type': 'helper',
                'name': func_name,
                'args': processed_args
            }
            print(f"Created helper result: {result}")
            return result # Return helper result
        
        # 2. State method call (e.g., state.has)
        elif func_info and func_info.get('type') == 'attribute':
            if func_info['object'].get('type') == 'name' and func_info['object'].get('name') == 'state':
                method = func_info['attr']
                print(f"Processing state method: {method}")
                
                # Simplify handling based on method name
                if method == 'has' and len(processed_args) >= 1:
                    result = {'type': 'item_check', 'item': processed_args[0]}
                elif method == 'has_group' and len(processed_args) >= 1:
                    result = {'type': 'group_check', 'group': processed_args[0]}
                elif method == 'has_any' and len(processed_args) >= 1 and isinstance(processed_args[0], list):
                    result = {'type': 'or', 'conditions': [{'type': 'item_check', 'item': item} for item in processed_args[0]]}
                elif method == '_lttp_has_key' and len(processed_args) >= 2:
                    result = {'type': 'count_check', 'item': processed_args[0], 'count': processed_args[1]}
                # Add other state methods like can_reach if needed
                # elif method == 'can_reach': ... 
                else:
                    # Default for unhandled state methods
                    result = {'type': 'state_method', 'method': method, 'args': processed_args}
                
                print(f"State method result: {result}")
                return result # Return state method result

        # 3. Fallback for other types of calls (e.g., calling result of another function)
        print(f"Fallback function call type. func_info = {func_info}")
        result = {
            'type': 'function_call',
            'function': func_info,
            'args': processed_args # Use processed args here too
        }
        print(f"Fallback call result: {result}")
        return result # Return generic function call result

    def visit_Attribute(self, node):
        try:
            # --- ADDED: Log attribute details before visiting object --- 
            attr_name = node.attr
            self.log_debug(f"visit_Attribute: Trying to access .{attr_name} on object of type {type(node.value).__name__}")
            # --- END ADDED ---
            self.log_debug(f"visit_Attribute: Visiting object {type(node.value).__name__}")
            obj_result = self.visit(node.value) # Get returned result
            # attr_name = node.attr # Moved up
            
            # Specifically log if we are processing self.player
            if isinstance(node.value, ast.Name) and node.value.id == 'self' and attr_name == 'player':
                 self.log_debug("visit_Attribute: Detected access to self.player")

            if obj_result:
                 result = {'type': 'attribute', 'object': obj_result, 'attr': attr_name}
                 self.log_debug(f"visit_Attribute: Returning result {result}")
                 return result # Return the result
            else:
                 # Handle case where object visit failed
                 self.log_error(f"visit_Attribute: Failed to get result for object in {ast.dump(node)}")
                 return None # Return None on error

        except Exception as e:
            self.log_error(f"Error in visit_Attribute for {ast.dump(node)}", e)
            return None

    def visit_Name(self, node):
        try:
            name = node.id
            self.log_debug(f"visit_Name: Name = {name}")
            # Specifically log 'self'
            if name == 'self':
                self.log_debug("visit_Name: Detected 'self'")

            result = {'type': 'name', 'name': name}
            self.log_debug(f"visit_Name: Set result to {result}")
            return result # Return the result
        except Exception as e:
            self.log_error(f"Error in visit_Name for {node.id}", e)
            return None # Return None on error

    def visit_Expr(self, node: ast.Expr):
        """ Handle expression statements, checking for top-level set_rule/add_item_rule calls. """
        self.log_debug(f"\n--- visit_Expr --- Node Value Type: {type(node.value).__name__}")
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
                self.log_debug(f"visit_Expr: Detected top-level '{func_name}' call. Visiting rule argument directly.")
                # Visit the second argument (the rule function/lambda) and return its result
                rule_result = self.visit(call_node.args[1])
                self.log_debug(f"visit_Expr: Finished visiting rule argument for '{func_name}'. Returning result: {rule_result}")
                return rule_result

        # If not a top-level rule-setting call, visit the expression value normally and return its result
        self.log_debug("visit_Expr: Not a top-level rule call, visiting value.")
        return self.visit(node.value)

    def visit_Constant(self, node):
        print("\nvisit_Constant called")
        print(f"Constant node: {ast.dump(node)}")
        result = {
            'type': 'constant',
            'value': node.value
        }
        print(f"Constant result: {result}")
        return result # Return the result

    def visit_Subscript(self, node):
        """
        Handle subscript expressions like foo[bar]
        """
        print(f"\nvisit_Subscript called:")
        print(f"Value: {ast.dump(node.value)}")
        print(f"Slice: {ast.dump(node.slice)}")
        
        # First visit the value (the object being subscripted)
        value_info = self.visit(node.value) # Get returned result
        
        # Then visit the slice (the index)
        index_info = self.visit(node.slice) # Get returned result
        
        # Check if sub-visits were successful
        if value_info is None or index_info is None:
            self.log_error(f"Error visiting value or index in subscript: {ast.dump(node)}")
            return None
            
        # Create a subscript node
        result = {
            'type': 'subscript',
            'value': value_info,
            'index': index_info
        }
        
        print(f"Subscript result: {result}")
        return result # Return the result

    def visit_BoolOp(self, node):
        """Handle boolean operations (AND/OR) between conditions"""
        try:
            self.log_debug("\nvisit_BoolOp called:")
            self.log_debug(f"Operator: {type(node.op).__name__}")
            self.log_debug(f"Values: {[ast.dump(val) for val in node.values]}")
            
            # Process each value in the boolean operation
            conditions = []
            for value in node.values:
                condition_result = self.visit(value) # Get returned result
                if condition_result:
                    conditions.append(condition_result)
                else:
                    self.log_error(f"Failed to analyze condition in BoolOp: {ast.dump(value)}")
                    return None # Fail the whole operation if one part fails

            # Create appropriate rule structure based on operator type
            op_type = 'and' if isinstance(node.op, ast.And) else 'or' if isinstance(node.op, ast.Or) else None
            if not op_type:
                self.log_debug(f"Unknown boolean operator: {type(node.op).__name__}")
                return None
            
            result = {
                'type': op_type,
                'conditions': conditions
            }
            self.log_debug(f"Boolean operation result: {result}")
            return result # Return the result
            
        except Exception as e:
            self.log_error(f"Error in visit_BoolOp", e)
            return None

    def visit_UnaryOp(self, node: ast.UnaryOp):
        """ Handle unary operations (e.g., not). """
        try:
            op_name = type(node.op).__name__.lower()
            self.log_debug(f"\n--- visit_UnaryOp: op={op_name} ---")
            
            operand_result = self.visit(node.operand)
            if operand_result is None:
                self.log_error(f"Failed to analyze operand for UnaryOp: {ast.dump(node.operand)}")
                return None

            # Handle specific unary operators
            if isinstance(node.op, ast.Not):
                return {'type': 'not', 'condition': operand_result}
            # Add other unary ops (e.g., UAdd, USub) if needed for rules
            else:
                self.log_error(f"Unhandled unary operator: {op_name}")
                return None # Or a generic representation

        except Exception as e:
            self.log_error("Error in visit_UnaryOp", e)
            return None

    def visit_Compare(self, node: ast.Compare):
        """ Handle comparison operations (e.g., ==, !=, in, not in, is, is not). """
        try:
            self.log_debug(f"\n--- visit_Compare ---")
            if len(node.ops) != 1 or len(node.comparators) != 1:
                # For now, only support simple comparisons like `a op b`
                self.log_error(f"Unsupported chained comparison: {ast.dump(node)}")
                return None

            left_result = self.visit(node.left)
            op_name = type(node.ops[0]).__name__.lower() # e.g., 'eq', 'in', 'is'
            right_result = self.visit(node.comparators[0])

            if left_result is None or right_result is None:
                self.log_error(f"Failed to analyze left or right side of comparison: {ast.dump(node)}")
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
            self.log_error("Error in visit_Compare", e)
            return None

    def visit_Tuple(self, node: ast.Tuple):
        """ Handle tuple literals. """
        try:
            self.log_debug(f"\n--- visit_Tuple ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    self.log_error(f"Failed to analyze element in Tuple: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON
            return {'type': 'list', 'value': elements}
        except Exception as e:
            self.log_error("Error in visit_Tuple", e)
            return None

    def visit_List(self, node: ast.List):
        """ Handle list literals. """
        try:
            self.log_debug(f"\n--- visit_List ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    self.log_error(f"Failed to analyze element in List: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON
            return {'type': 'list', 'value': elements}
        except Exception as e:
            self.log_error("Error in visit_List", e)
            return None

    def visit_Set(self, node: ast.Set):
        """ Handle set literals. """
        try:
            self.log_debug(f"\n--- visit_Set ---")
            elements = []
            for elt_node in node.elts:
                elt_result = self.visit(elt_node)
                if elt_result is None:
                    self.log_error(f"Failed to analyze element in Set: {ast.dump(elt_node)}")
                    return None
                elements.append(elt_result)
            
            # Represent as a list in the output JSON (consistent with tuple/list)
            return {'type': 'list', 'value': elements}
        except Exception as e:
            self.log_error("Error in visit_Set", e)
            return None

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        """ Handle generator expressions. """
        try:
            self.log_debug(f"\n--- visit_GeneratorExp ---")
            # Analyze the element expression
            elt_result = self.visit(node.elt)
            if elt_result is None:
                self.log_error(f"Failed to analyze element expression in GeneratorExp: {ast.dump(node.elt)}")
                return None

            # Analyze the comprehension generators
            # NOTE: Currently only supports one comprehension generator like `for target in iter`
            if len(node.generators) != 1:
                self.log_error(f"Unsupported number of generators in GeneratorExp: {len(node.generators)}")
                return None

            comprehension_result = self.visit(node.generators[0])
            if comprehension_result is None:
                 self.log_error(f"Failed to analyze comprehension in GeneratorExp")
                 return None

            # Combine results into a dedicated type
            return {
                'type': 'generator_expression',
                'element': elt_result,
                'comprehension': comprehension_result
            }
        except Exception as e:
            self.log_error("Error in visit_GeneratorExp", e)
            return None

    def visit_comprehension(self, node: ast.comprehension):
        """ Handle the 'for target in iter' part of comprehensions/generators. """
        try:
            self.log_debug(f"\n--- visit_comprehension ---")
            target_result = self.visit(node.target)
            iter_result = self.visit(node.iter)
            # Note: Ignoring ifs for now (e.g., for x in y if z)

            if target_result is None or iter_result is None:
                 self.log_error(f"Failed to analyze target or iterator in comprehension")
                 return None

            # Return details needed to understand the iteration
            return {
                'type': 'comprehension_details',
                'target': target_result,
                'iterator': iter_result
                # 'conditions': [self.visit(if_node) for if_node in node.ifs] # Future enhancement
            }
        except Exception as e:
            self.log_error("Error in visit_comprehension", e)
            return None

    def generic_visit(self, node):
        """Override to add detailed logging for unexpected node types."""
        try:
            self.log_debug(f"\n--- Generic Visit: {type(node).__name__} ---")
            self.log_debug(f"Node details: {vars(node)}")
            super().generic_visit(node)
        except Exception as e:
            self.log_error(f"Error in generic_visit for {type(node).__name__}", e)

    def visit_Assign(self, node: ast.Assign):
        """ Handle assignment statements. If the value is a lambda/rule, analyze it. """
        self.log_debug(f"\n--- visit_Assign --- Targets: {len(node.targets)}, Value Type: {type(node.value).__name__}")
        # We are primarily interested in the value being assigned, as that often holds the rule lambda.
        # Visit the value node and return its result.
        value_result = self.visit(node.value)
        self.log_debug(f"visit_Assign: Result from visiting value = {value_result}")
        return value_result # Return the result of analyzing the assigned value

    def visit_IfExp(self, node: ast.IfExp):
        """ Handle conditional ternary expressions (body if test else orelse). """
        try:
            self.log_debug(f"\n--- visit_IfExp ---")
            test_result = self.visit(node.test)
            body_result = self.visit(node.body)
            orelse_result = self.visit(node.orelse)

            if test_result is None or body_result is None or orelse_result is None:
                self.log_error(f"Failed to analyze one or more parts of IfExp: {ast.dump(node)}")
                return None

            return {
                'type': 'conditional',
                'test': test_result,
                'if_true': body_result,
                'if_false': orelse_result
            }
        except Exception as e:
            self.log_error("Error in visit_IfExp", e)
            return None

    def visit_BinOp(self, node: ast.BinOp):
        """ Handle binary operations (e.g., +, -, *, /). """
        try:
            self.log_debug(f"\n--- visit_BinOp ---")
            left_result = self.visit(node.left)
            op_name = type(node.op).__name__ # E.g., 'Add', 'Mult'
            right_result = self.visit(node.right)

            if left_result is None or right_result is None:
                self.log_error(f"Failed to analyze left or right side of BinOp: {ast.dump(node)}")
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

            return {
                'type': 'binary_op',
                'left': left_result,
                'op': op_symbol,
                'right': right_result
            }
        except Exception as e:
            self.log_error("Error in visit_BinOp", e)
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
        print(f"LambdaFinder initialized for target: {target_name}")

    def _extract_target_name_from_call(self, call_node: ast.Call) -> Optional[str]:
        """Helper to extract the target name from a get_location/entrance/region call."""
        if isinstance(call_node.func, ast.Attribute):
            method_name = call_node.func.attr
            if method_name in ['get_location', 'get_entrance', 'get_region']:
                if len(call_node.args) > 0 and isinstance(call_node.args[0], ast.Constant):
                    return call_node.args[0].value
                else:
                    print(f"LambdaFinder: No constant arg found for {method_name} call.")
            # else:
            #     print(f"LambdaFinder: Method name '{method_name}' not in expected list.")
        # else:
        #      print(f"LambdaFinder: Target node func is not Attribute. Type: {type(call_node.func)}, Dump: {ast.dump(call_node.func)}")
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
                    #     print(f"LambdaFinder: Found '{func_name}' call targeting '{extracted_target_name}' via method call.")
                # else:
                #     # Potentially handle direct string constants if needed, though less common
                #     # if isinstance(target_node, ast.Constant) and isinstance(target_node.value, str):
                #     #     extracted_target_name = target_node.value
                #     print(f"LambdaFinder: Target node is not Call. Dump: {ast.dump(target_node)}")

                # --- Check if the extracted target name matches ---
                if extracted_target_name == self.target_name:
                    print(f"LambdaFinder: Target name '{self.target_name}' MATCHED!")
                    # --- Check if the second argument is a Lambda ---
                    rule_node = node.args[1]
                    if isinstance(rule_node, ast.Lambda):
                        print(f"LambdaFinder: Found Lambda node for target '{self.target_name}'!")
                        self._found_lambdas.append(rule_node)
                        # Do NOT return early, continue searching for other potential matches
                    # else:
                    #      print(f"LambdaFinder: Target '{self.target_name}' matched, but rule is not a Lambda node ({type(rule_node).__name__}).")

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
        print(f"LambdaFinder: Starting search in AST for target '{self.target_name}'")
        self._found_lambdas = [] # Reset for this search
        self._visited_nodes = set() # Reset visited nodes
        self.visit(ast_tree)

        count = len(self._found_lambdas)
        if count == 1:
            print(f"LambdaFinder: Found exactly one lambda for target '{self.target_name}'.")
            return self._found_lambdas[0]
        elif count == 0:
            print(f"LambdaFinder: Found zero lambdas for target '{self.target_name}'.")
            return None
        else:
            print(f"LambdaFinder: Found {count} lambdas for target '{self.target_name}'. Cannot uniquely determine rule, returning None.")
            # Optionally log the locations or details of the found lambdas for debugging
            # for i, lam in enumerate(self._found_lambdas):
            #     print(f"  Lambda {i+1} at line {getattr(lam, 'lineno', 'N/A')}")
            return None

# Main analysis function
def analyze_rule(rule_func: Optional[Callable[[Any], bool]] = None, 
                 closure_vars: Optional[Dict[str, Any]] = None, 
                 seen_funcs: Optional[Dict[int, int]] = None,
                 ast_node: Optional[ast.AST] = None) -> Dict[str, Any]:
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
    logging.debug("\n--- Starting Rule Analysis ---") # Changed print to logging

    # Initialize seen_funcs dict if not provided
    seen_funcs = seen_funcs or {}
    
    # Ensure closure_vars is a dictionary
    closure_vars = closure_vars or {}

    analyzer = None # Define analyzer in outer scope

    try:
        # --- Option 1: Analyze a provided AST node directly --- 
        analysis_result = None
        if ast_node:
            logging.debug(f"Analyzing provided AST node: {type(ast_node).__name__}") # Changed print to logging
            # Need an analyzer instance here too
            analyzer = RuleAnalyzer(closure_vars=closure_vars, seen_funcs=seen_funcs)
            analysis_result = analyzer.visit(ast_node) 

        # --- Option 2: Analyze a function object (existing logic) --- 
        elif rule_func:
            logging.debug(f"Rule function: {rule_func}") # Changed print to logging

            func_id = id(rule_func)
            # --- MODIFIED: More permissive recursion check ---
            current_seen_count = seen_funcs.get(func_id, 0)
            # Allow more recursion depth for multiline lambdas (increased from 2 to 3)
            if current_seen_count >= 3:
                recursion_msg = f'Recursion detected: Already analyzing function {rule_func} {current_seen_count+1} times'
                logging.warning(f"analyze_rule: Function {rule_func} (id={func_id}) seen {current_seen_count+1} times, stopping recursion.") # Changed print to logging
                # Return a proper error structure
                return {
                    'type': 'error',
                    'message': recursion_msg,
                    'subtype': 'recursion', # Added subtype
                    'debug_log': [], 'error_log': []
                }
            # --- END MODIFIED ---
            
            # --- Work on a copy of closure_vars ---
            local_closure_vars = closure_vars.copy()
            # ---

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
                    logging.debug(f"Extracted closure vars into local copy: {list(local_closure_vars.keys())}") # Changed print to logging
                else:
                    logging.debug("No closure variables found for rule function.") # Changed print to logging
            except Exception as clo_err:
                logging.warning(f"Error extracting closure variables: {clo_err}") # Changed print to logging

            # Add 'self' to the local copy if needed
            if hasattr(rule_func, '__self__') and 'self' not in local_closure_vars:
                 local_closure_vars['self'] = rule_func.__self__
                 logging.debug("Added 'self' to local closure vars from method binding.") # Changed print to logging
            # --- End closure extraction modification ---

            # Clean the source
            cleaned_source = _clean_source(rule_func)
            if cleaned_source is None:
                logging.error("analyze_rule: Failed to clean source, returning error.") # Changed print to logging
                # Need to initialize analyzer logs for the error result
                analyzer = RuleAnalyzer() # Create dummy analyzer for logs
                return {
                    'type': 'error',
                    'message': 'Failed to clean or retrieve source code for rule function.',
                    'subtype': 'source_cleaning', # Added subtype
                    'debug_log': analyzer.debug_log, # Return logs from dummy analyzer
                    'error_log': analyzer.error_log
                }
            logging.debug(f"Cleaned source: {repr(cleaned_source)}") # Changed print to logging
            
            # --- Analyzer creation and analysis --- 
            # analyzer = None # Already defined in outer scope
            analysis_result = None
            try:
                # --- MODIFIED: Increment count --- 
                seen_funcs[func_id] = current_seen_count + 1
                logging.debug(f"analyze_rule: Incremented func_id {func_id} count in seen_funcs: {seen_funcs}") # Changed print to logging

                # Pass the LOCAL copy to the RuleAnalyzer instance
                analyzer = RuleAnalyzer(closure_vars=local_closure_vars, seen_funcs=seen_funcs)

                # Check if cleaned_source contains "Bridge"
                if cleaned_source and "Bridge" in cleaned_source:
                    logging.debug(f"analyze_rule: Detected 'Bridge' in the cleaned source code") # Changed print to logging
                
                # Comprehensive parse and visit
                try:
                    tree = ast.parse(cleaned_source)
                    logging.debug(f"analyze_rule: Parsed AST = {ast.dump(tree)}") # Changed print to logging
                    logging.debug("AST parsed successfully") # Changed print to logging
                    
                    # Always visit the full parsed tree in the fallback path
                    analysis_result = analyzer.visit(tree) # Get the result from visit

                except SyntaxError as parse_err:
                    logging.error(f"analyze_rule: SyntaxError during parse: {parse_err}", exc_info=True) # Changed print to logging, added exc_info
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
                # --- MODIFIED: Decrement count --- 
                if func_id in seen_funcs:
                    seen_funcs[func_id] -= 1
                    if seen_funcs[func_id] <= 0: 
                        del seen_funcs[func_id]
                    logging.debug(f"analyze_rule: Updated func_id {func_id} count/removed from seen_funcs: {seen_funcs}") # Changed print to logging
                # --- END MODIFIED ---
            # --- End inner try...finally ---
        else:
             # No function or AST node provided
             logging.warning("analyze_rule: Called without rule_func or ast_node.") # Changed print to logging
             analysis_result = None
             analyzer = RuleAnalyzer() # Create dummy analyzer for logs

        # --- Ensure analyzer is always defined for final logging/error return ---
        if analyzer is None: 
             analyzer = RuleAnalyzer() # Should only happen if ast_node and rule_func are None

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
        logging.debug(f"analyze_rule: Final result before return = {json.dumps(final_result, indent=2)}") # Changed print to logging
        return final_result
    
    except Exception as e:
        # --- MODIFIED: Improved Top-Level Error Handling ---
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
        # --- END MODIFIED ---