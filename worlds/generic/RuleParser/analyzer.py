# worlds/generic/RuleParser/analyzer.py

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
from typing import Any, Dict, Optional, Set
import traceback
import json
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    filename='rule_analysis_debug.log')

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
        self.seen_funcs = seen_funcs or set()  # Track analyzed helper functions
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
                
            # Visit first node in module body if exists
            if node.body:
                self.visit(node.body[0])
        except Exception as e:
            self.log_error("Error in visit_Module", e)

    def visit_FunctionDef(self, node):
        try:
            self.log_debug(f"\n--- Analyzing Function Definition: {node.name} ---")
            self.log_debug(f"Function args: {[arg.arg for arg in node.args.args]}")
            
            # Detailed function body inspection
            for i, body_node in enumerate(node.body):
                self.log_debug(f"Function body node {i}: {type(body_node).__name__}")
            
            # Visit the first body node if exists
            if node.body:
                self.visit(node.body[0])
        except Exception as e:
            self.log_error(f"Error analyzing function {node.name}", e)

    def visit_Lambda(self, node):
        try:
            self.log_debug("\n--- Analyzing Lambda ---")
            self.log_debug(f"Lambda args: {[arg.arg for arg in node.args.args]}")
            self.log_debug(f"Lambda body type: {type(node.body).__name__}")
            
            self.visit(node.body)
        except Exception as e:
            self.log_error("Error in visit_Lambda", e)

    def visit_Return(self, node):
        try:
            self.log_debug("\n--- Analyzing Return ---")
            self.log_debug(f"Return value type: {type(node.value).__name__}")
            
            if isinstance(node.value, ast.BoolOp):
                self.log_debug(f"BoolOp type: {type(node.value.op).__name__}")
                self.log_debug(f"BoolOp values count: {len(node.value.values)}")
            
            self.visit(node.value)
        except Exception as e:
            self.log_error("Error in visit_Return", e)

    def visit_Call(self, node):
        """
        Updated visit_Call method.

        This version first visits the function node to determine its type.
        If the function is a simple Name and its name is one of our special
        closure names (e.g. "rule" or "old_rule"), then we retrieve the actual
        function from the closure_vars and recursively analyze it. To avoid
        infinite recursion, we check if the function object has already been
        seen (using its id).
        """
        print(f"\nvisit_Call called:")
        print(f"Function: {ast.dump(node.func)}")
        print(f"Args: {[ast.dump(arg) for arg in node.args]}")

        # Visit the function node to obtain its details.
        self.visit(node.func)
        func_info = self.current_result
        print(f"Function info after visit: {func_info}")

        args = []
        processed_args = []
        for arg in node.args:
            if isinstance(arg, ast.Constant):
                args.append(arg.value)
            elif isinstance(arg, ast.Name):
                args.append(arg.id)
            elif isinstance(arg, ast.Str):
                args.append(arg.s)
            else:
                self.visit(arg)
                if self.current_result is not None:
                    args.append(self.current_result)

            # For processed_args, skip names "state" and "player"
            if isinstance(arg, ast.Name) and arg.id in ['state', 'player']:
                continue
            if isinstance(arg, ast.Constant):
                processed_args.append(arg.value)
            elif isinstance(arg, ast.Name):
                processed_args.append(arg.id)
            elif isinstance(arg, ast.Str):
                processed_args.append(arg.s)
            else:
                if self.current_result is not None:
                    processed_args.append(self.current_result)

        print(f"Collected args: {args}")
        print(f"Processed args (without state/player): {processed_args}")

        # Special handling: if the function is a Name and its name is in our special list,
        # then retrieve the actual function from closure_vars and recursively analyze it.
        if func_info and func_info.get('type') == 'name':
            func_name = func_info['name']
            print(f"Checking helper: {func_name}")
            print(f"Available closure vars: {list(self.closure_vars.keys())}")
            if func_name in self.closure_vars:
                if func_name in ['rule', 'old_rule']:
                    # Retrieve the actual function object.
                    helper_func = self.closure_vars[func_name]
                    # Check if we've already seen this function to avoid infinite recursion.
                    if id(helper_func) in self.seen_funcs:
                        print(f"Already analyzed {func_name}, returning default constant true")
                        self.current_result = {'type': 'constant', 'value': True}
                        return
                    else:
                        self.seen_funcs.add(id(helper_func))
                        analyzed = analyze_rule(helper_func, closure_vars=self.closure_vars, seen_funcs=self.seen_funcs)
                        self.current_result = analyzed
                        print(f"Inlined helper for {func_name}: {self.current_result}")
                        return
                else:
                    self.current_result = {
                        'type': 'helper',
                        'name': func_name,
                        'args': processed_args
                    }
                    print(f"Created helper: {self.current_result}")
                    return
            else:
                # Create a helper node even if function not in closure vars
                self.current_result = {
                    'type': 'helper',
                    'name': func_name,
                    'args': processed_args
                }
                print(f"Created helper for unknown function: {self.current_result}")
                return
            # If not in closure_vars, continue below.
        
        # Handle state methods (e.g. state.has, state._lttp_has_key, etc.)
        if func_info and func_info.get('type') == 'state_method':
            method = func_info['method']

            # 1) state.has('Item', player)
            if method == 'has':
                if len(args) >= 2 and args[1] == 'player':
                    self.current_result = {
                        'type': 'item_check',
                        'item': args[0]
                    }
                    return

            # 2) state.has_group('GroupName', player)
            elif method == 'has_group':
                if len(args) >= 2 and args[1] == 'player':
                    self.current_result = {
                        'type': 'group_check',
                        'group': args[0]
                    }
                    return

            # 3) state.has_any([...], player)
            elif method == 'has_any':
                if len(args) >= 2 and args[1] == 'player':
                    items = args[0]
                    if isinstance(items, list):
                        self.current_result = {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }
                        return

            # 4) state._lttp_has_key('Small Key (Swamp)', count, player)
            elif method == '_lttp_has_key':
                # Example usage: state._lttp_has_key('Small Key (Palace)', 2, player)
                if len(args) >= 3 and args[2] == 'player':
                    self.current_result = {
                        'type': 'count_check',
                        'item': args[0],
                        'count': args[1]
                    }
                    return

            # Any unhandled method on state -> fallback
            self.current_result = {
                'type': 'state_method',
                'method': method,
                'args': args
            }
            return

        # Fallback: if no recognized pattern, set current_result to None.
        self.current_result = None

    def visit_Attribute(self, node):
        print(f"\nvisit_Attribute called:")
        print(f"Value: {ast.dump(node.value)}")
        print(f"Attr: {node.attr}")
        
        # First visit the value node
        self.visit(node.value)
        value_info = self.current_result
        print(f"Value info after visit: {value_info}")

        if value_info and value_info.get('type') == 'name' and value_info['name'] == 'state':
            self.current_result = {
                'type': 'state_method',
                'method': node.attr
            }
        else:
            print(f"Unhandled attribute access: {node.attr} on {value_info}")

    def visit_Name(self, node):
        print(f"\nvisit_Name called: {node.id}")
        self.current_result = {
            'type': 'name',
            'name': node.id
        }
        print(f"Name result: {self.current_result}")

    def visit_Constant(self, node):
        print("\nvisit_Constant called")
        print(f"Constant node: {ast.dump(node)}")
        self.current_result = {
            'type': 'constant',
            'value': node.value
        }
        print(f"Constant result: {self.current_result}")

    def visit_BoolOp(self, node):
        """Handle boolean operations (AND/OR) between conditions"""
        try:
            self.log_debug("\nvisit_BoolOp called:")
            self.log_debug(f"Operator: {type(node.op).__name__}")
            self.log_debug(f"Values: {[ast.dump(val) for val in node.values]}")
            
            # Process each value in the boolean operation
            conditions = []
            for value in node.values:
                self.visit(value)
                if self.current_result:
                    conditions.append(self.current_result)

            # Create appropriate rule structure based on operator type
            if isinstance(node.op, ast.And):
                self.current_result = {
                    'type': 'and',
                    'conditions': conditions
                }
            elif isinstance(node.op, ast.Or):
                self.current_result = {
                    'type': 'or',
                    'conditions': conditions
                }
            else:
                self.log_debug(f"Unknown boolean operator: {type(node.op).__name__}")
                self.current_result = None

            self.log_debug(f"Boolean operation result: {self.current_result}")
            
        except Exception as e:
            self.log_error(f"Error in visit_BoolOp", e)
            self.current_result = None

    def generic_visit(self, node):
        """Override to add detailed logging for unexpected node types."""
        try:
            self.log_debug(f"\n--- Generic Visit: {type(node).__name__} ---")
            self.log_debug(f"Node details: {vars(node)}")
            super().generic_visit(node)
        except Exception as e:
            self.log_error(f"Error in generic_visit for {type(node).__name__}", e)

    def _handle_method_call(self, node):
        """
        Handle method calls, particularly focusing on state methods.
        Returns a structured rule representation of the method call.
        """
        print(f"Handling method call: {ast.dump(node)}")

        if not isinstance(node.func, ast.Attribute):
            self.log("Not an attribute method call")
            return None

        # Extract the object and method names
        if isinstance(node.func.value, ast.Name):
            obj_name = node.func.value.id
            method_name = node.func.attr
        else:
            self.log(f"Unhandled method call object type: {type(node.func.value)}")
            return None

        # Handle state methods
        if obj_name == 'state':
            print(f"Processing state method: {method_name}")
            
            # Extract arguments with proper handling of different arg types
            args = []
            for arg in node.args:
                if isinstance(arg, ast.Constant):
                    args.append(arg.value)
                elif isinstance(arg, ast.Name):
                    args.append(arg.id)
                elif isinstance(arg, ast.Str):
                    args.append(arg.s)
                else:
                    print(f"Complex argument type: {type(arg)}")
                    # For complex arguments, we may need to recursively analyze
                    self.visit(arg)
                    if self.current_result:
                        args.append(self.current_result)
                    else:
                        print(f"Could not analyze argument: {ast.dump(arg)}")
                        return None

            # Create appropriate rule structure based on method
            if method_name == 'has':
                if len(args) >= 2 and args[1] == 'player':
                    return {
                        'type': 'item_check',
                        'item': args[0]
                    }
                
            elif method_name == '_lttp_has_key':
                if len(args) >= 3 and args[2] == 'player':
                    return {
                        'type': 'count_check',
                        'item': args[0],
                        'count': args[1]
                    }
                
            elif method_name == 'has_group':
                if len(args) >= 2 and args[1] == 'player':
                    return {
                        'type': 'group_check',
                        'group': args[0]
                    }
                    
            elif method_name == 'can_reach':
                # Handle can_reach calls which check region/location accessibility
                if len(args) >= 3:
                    return {
                        'type': 'can_reach',
                        'target': args[0],
                        'type': args[1],
                        'player': args[2]
                    }
                    
            elif method_name == 'has_any':
                # Handle has_any which checks for any item in a list
                if len(args) >= 2 and args[1] == 'player':
                    items = args[0]
                    if isinstance(items, list):
                        return {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }

            # Generic state method handler for unrecognized methods
            return {
                'type': 'state_method',
                'method': method_name,
                'args': args
            }

        # Non-state method calls could be helper functions
        elif obj_name in self.closure_vars:
            helper_func = self.closure_vars[obj_name]
            # Check if it's a known helper function
            if helper_func.__name__ in self.seen_funcs:
                return {
                    'type': 'helper',
                    'name': helper_func.__name__,
                    'args': ['state', 'player']  # Most helpers take these args
                }
            else:
                print(f"Analyzing helper function: {helper_func.__name__}")
                result = self.analyze_helper(helper_func)
                if result:
                    self.seen_funcs.add(helper_func.__name__)
                    return result

        print(f"Unhandled method call: {obj_name}.{method_name}")
        return None

    def analyze_helper(self, func):
        """Analyze a helper function to determine its rule structure."""
        try:
            source = inspect.getsource(func)
            tree = ast.parse(source)
            
            # Create a new analyzer for the helper
            helper_analyzer = RuleAnalyzer(self.closure_vars, self.seen_funcs)
            helper_analyzer.visit(tree)
            
            if helper_analyzer.current_result:
                return helper_analyzer.current_result
            
            # If we couldn't analyze it, register it as a helper
            return {
                'type': 'helper',
                'name': func.__name__,
                'args': ['state', 'player']
            }
        except Exception as e:
            print(f"Error analyzing helper {func.__name__}: {e}")
            print("Error details:", str(e))  # Additional error info
            print("Consider updating helper analysis for this pattern")
            return None
    
    def _handle_function_call(self, node):
        if not hasattr(node.func, 'id'):
            return
        
        func_name = node.func.id
        
        # Skip built-in functions
        if func_name in {'min', 'max', 'len', 'sum'}:
            return

        # Get the actual function if it's a closure variable
        func = None
        if func_name in self.closure_vars:
            func = self.closure_vars[func_name]

        # Extract arguments safely
        args = []
        for arg in node.args:
            try:
                if isinstance(arg, (ast.Constant, ast.Num)):
                    args.append(arg.n if isinstance(arg, ast.Num) else arg.value)
                elif isinstance(arg, ast.Str):
                    args.append(arg.s)
                elif isinstance(arg, ast.Name):
                    args.append(arg.id)
            except:
                pass

        # Create helper node
        self.current_result = {
            'type': 'helper',
            'name': func_name,
            'args': args or None
        }

    def _extract_string_arg(self, node):
        if isinstance(node, (ast.Str, ast.Constant)) and isinstance(getattr(node, 'value', None), str):
            return node.value if isinstance(node, ast.Constant) else node.s
        return None

    def _extract_number_arg(self, node):
        if isinstance(node, (ast.Num, ast.Constant)) and isinstance(getattr(node, 'value', None), (int, float)):
            return node.value if isinstance(node, ast.Constant) else node.n
        return None

def analyze_rule(rule_func, closure_vars=None, seen_funcs=None):
    """
    Analyzes a rule function to produce a structured representation.
    
    The output format represents rules as nested dictionaries with types:
    - item_check: Direct item requirements
    - count_check: Item quantity requirements
    - helper: Known helper function calls
    - and/or: Boolean combinations
    - state_method: Direct state method calls
    
    Args:
        rule_func: The function to analyze
        closure_vars: Dict of helper functions available in closure
        seen_funcs: Set of already analyzed helper functions
        
    Returns:
        Dict representing the rule structure, or None if analysis fails
    """
    # Pre-analysis logging
    print("\n--- Starting Rule Analysis ---")
    print(f"Rule function: {rule_func}")
    
    # Validation checks
    if not rule_func or not hasattr(rule_func, '__code__'):
        print("Invalid rule function")
        return None

    try:
        # Extract closure variables including helper functions
        if closure_vars is None:
            closure_vars = {}
            try:
                vars = inspect.getclosurevars(rule_func)
                closure_vars.update(vars.nonlocals)
                closure_vars.update(vars.globals)
                print(f"Extracted closure vars: {list(closure_vars.keys())}")
            except Exception as closure_err:
                print(f"Error getting closure vars: {closure_err}")

        try:
            source = inspect.getsource(rule_func)
        except (OSError, TypeError) as source_err:
            print(f"Could not extract source: {source_err}")
            return None

        print("Original source:", repr(source))
        
        # Clean the source
        cleaned_source = _clean_source(source)
        print("Cleaned source:", repr(cleaned_source))
        
        # Create analyzer
        analyzer = RuleAnalyzer(closure_vars, seen_funcs)
        
        # Comprehensive parse and visit
        try:
            tree = ast.parse(cleaned_source)
            print("AST parsed successfully")
            analyzer.visit(tree)
        except SyntaxError as parse_err:
            print(f"Syntax error parsing source: {parse_err}")
            
            # More robust function call extraction
            method_match = re.search(r'(\w+(?:\.\w+)?)\((.+?)\)', cleaned_source, re.DOTALL)
            if method_match:
                method = method_match.group(1)
                args_str = method_match.group(2).strip()
                
                # Carefully parse arguments, handling complex cases
                def split_args(arg_str):
                    args = []
                    current_arg = []
                    quote_stack = []
                    paren_stack = []
                    
                    for char in arg_str:
                        if char in ["'", '"']:
                            if not quote_stack or quote_stack[-1] != char:
                                quote_stack.append(char)
                            else:
                                quote_stack.pop()
                        
                        if char == '(':
                            paren_stack.append(char)
                        elif char == ')':
                            if paren_stack:
                                paren_stack.pop()
                        
                        # Split on comma only if not in quotes or nested parentheses
                        if char == ',' and not quote_stack and not paren_stack:
                            if current_arg:
                                args.append(''.join(current_arg).strip())
                                current_arg = []
                        else:
                            current_arg.append(char)
                    
                    if current_arg:
                        args.append(''.join(current_arg).strip())
                    
                    return args
                
                args = split_args(args_str)
                
                print(f"Extracted method: {method}, args: {args}")
                
                # Handle specific method cases
                if method == 'state.has':
                    item = args[0].strip().strip("'\"")
                    return {
                        'type': 'item_check',
                        'item': item
                    }
                elif method == 'can_use_bombs':
                    return {
                        'type': 'helper',
                        'name': 'can_use_bombs'
                    }
                elif any(func in method for func in ['can_', 'has_', 'is_']):
                    return {
                        'type': 'helper',
                        'name': method.split('.')[-1],
                        'args': [arg.strip().strip("'\"") for arg in args]
                    }
                else:
                    return {
                        'type': 'state_method',
                        'method': method,
                        'args': [arg.strip().strip("'\"") for arg in args]
                    }
            
            # Fallback to default always accessible
            return {
                'type': 'constant',
                'value': True
            }
        
        # Detailed result logging
        if analyzer.error_log:
            print("Errors during analysis:")
            for error in analyzer.error_log:
                print(json.dumps(error, indent=2))
        
        print("Debug log:")
        for log_entry in analyzer.debug_log:
            print(log_entry)
        
        # Return result or error information
        return analyzer.current_result or {
            'type': 'error',
            'debug_log': analyzer.debug_log,
            'error_log': analyzer.error_log
        }
    
    except Exception as e:
        print(f"Unexpected error in rule analysis: {e}")
        traceback.print_exc()
        return {
            'type': 'constant',
            'value': True  # Default to always accessible
        }
    
def _clean_source(source: str) -> str:
    """
    Cleans and normalizes rule function source code.
    
    Handles:
    - Indentation normalization
    - Lambda to function conversion
    - String literal preservation
    - Nested parentheses tracking
    - Multiline expression preservation
    
    Example input:
        lambda state: state.has('Item', player)
        
    Example output:
        def __analyzed_func__(state):
            return state.has('Item', player)
    """
    def count_nested_parens(text: str, start: int = 0) -> int:
        """Count nested parentheses depth at a given position"""
        count = 0
        in_string = False
        string_char = None
        i = start
        
        while i < len(text):
            char = text[i]
            
            # Handle string boundaries
            if char in "'\"":
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    # Check if it's escaped
                    if i > 0 and text[i-1] != '\\':
                        in_string = False
            
            # Only count parens outside strings
            if not in_string:
                if char == '(':
                    count += 1
                elif char == ')':
                    count -= 1
                    
            i += 1
        return count

    def find_expression_end(text: str) -> int:
        """Find the end of a complete expression, handling nested structures"""
        paren_count = 0
        in_string = False
        string_char = None
        
        for i, char in enumerate(text):
            # Handle string boundaries
            if char in "'\"":
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char and (i == 0 or text[i-1] != '\\'):
                    in_string = False
                    
            if not in_string:
                if char == '(':
                    paren_count += 1
                elif char == ')':
                    paren_count -= 1
                    if paren_count < 0:  # Found closing paren of outer expression
                        return i + 1
                elif char == '\n' and paren_count == 0:  # End at newline if no open parens
                    return i
                    
        return len(text)  # If no clear end found, take the whole text
    
    # Clean indentation first
    lines = source.strip().splitlines()
    if not lines:
        return ''
        
    try:
        indent = min(len(line) - len(line.lstrip()) 
                    for line in lines if line.strip())
    except ValueError:
        indent = 0
                
    # Clean lines while preserving structure
    cleaned_lines = []
    for line in lines:
        if line.strip():
            if len(line) >= indent:
                cleaned_lines.append(line[indent:])
            else:
                cleaned_lines.append(line.lstrip())
        else:
            cleaned_lines.append('')
    
    # Join preserving newlines for better error messages
    source = '\n'.join(cleaned_lines)
    
    # Handle lambda conversion
    lambda_match = re.match(r'.*lambda\s+(\w+)\s*:\s*(.+)', source, re.DOTALL)
    if lambda_match:
        param, body = lambda_match.groups()
        
        # First clean comments and normalize whitespace
        body = re.sub(r'#.*$', '', body, flags=re.MULTILINE)  # Remove comments
        body = re.sub(r'\s+', ' ', body.strip())  # Normalize whitespace
        
        # Find the complete expression
        expr_end = find_expression_end(body)
        body = body[:expr_end].rstrip()
        
        # Verify parentheses are balanced
        if count_nested_parens(body) != 0:
            # Try to find a valid expression by checking each possible end point
            for i in range(len(body), -1, -1):
                if count_nested_parens(body[:i]) == 0:
                    body = body[:i].rstrip()
                    break
        
        return f"def __analyzed_func__({param}):\n    return {body}"
    
    return source