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
from typing import Any, Dict, Optional, Set, Callable
import traceback
import json
import logging

# Configure logging
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s',
                    filename='rule_analysis_debug.log')

# Regex definitions
REGEX_LAMBDA_BODY = re.compile(r'lambda\s+([\w\s,()]*):\s*(.*)', re.DOTALL)
REGEX_METHOD_CALL = re.compile(r'(\w+)\((.*)\)')

# Helper functions
def count_nested_parens(s):
    count = 0
    for char in s:
        if char == '(':
            count += 1
        elif char == ')':
            count -= 1
    return count

def _clean_source(func):
    """Retrieve and clean the source code of a function, handling lambdas."""
    try:
        source = inspect.getsource(func)
        # Remove comments
        source = re.sub(r'#.*$', '', source, flags=re.MULTILINE)
        source = source.strip()
        print(f"_clean_source: Original source = {repr(source)}")
    except (TypeError, OSError) as e:
        print(f"Could not get source for {func}: {e}")
        return None

    # *** ADDED CHECK for staticmethod ***
    if 'staticmethod(' in source:
        print("_clean_source: Detected staticmethod wrapper, skipping analysis.")
        # Treat staticmethod wrapped rules as always True or return None to signal skipping
        # Returning a representation of True is safer for now.
        # Ideally, the caller (process_regions) should handle this case.
        # For now, we let analyze_rule produce a constant True.
        return "def __analyzed_func__(state):\n    return True" 
        # return None # Alternative: Signal to analyze_rule to skip

    # Handle lambda functions specifically
    match = REGEX_LAMBDA_BODY.match(source)
    if match:
        param = match.group(1).strip()
        body = match.group(2).strip()
        
        # Remove trailing comma if present after body extraction
        if body.endswith(','):
            body = body[:-1].rstrip()

        # Remove any potential trailing \n or similar artifacts
        body = ' '.join(body.splitlines()).strip()

        # Ensure parentheses are balanced
        while count_nested_parens(body) > 0:
            if body.endswith(')'):
                body = body[:-1].rstrip()
            else:
                # Likely malformed source extraction, break to avoid infinite loop
                print(f"WARNING: Unbalanced parentheses in lambda body, cannot auto-fix: {repr(body)}")
                break
        
        # Additional check: Handle cases where extraction might grab too much
        # e.g., lambda x: x.has(A) and x.has(B)), ... <- extraneous closing paren
        # This is less robust, but can help some cases
        if count_nested_parens(body) < 0:
             print(f"WARNING: Potentially extraneous closing parentheses detected: {repr(body)}")
             # Attempt simple fix: remove trailing ')' if paren count is negative
             while count_nested_parens(body) < 0 and body.endswith(')'):
                 body = body[:-1].rstrip()

        print(f"_clean_source: Final body for lambda = {repr(body)}")
        return f"def __analyzed_func__({param}):\n    return {body}"
    
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
        Updated visit_Call method that properly handles complex arguments.
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
                 # Decide whether to fail the whole call or skip the arg
                 # Failing might be safer
                 return None 
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
            # (Removed recursive analysis of 'rule'/'old_rule' for simplicity, can be added back if needed)
            # For now, treat all functions found by name as potential helpers
            if func_name in self.closure_vars:
                 print(f"Identified call to known closure variable: {func_name}")
                 # Optionally, analyze helper func body recursively here if needed

            # *** ADDED: Special handling for all(GeneratorExp) ***
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
        print(f"Fallback function call type: {func_info}")
        result = {
            'type': 'function_call',
            'function': func_info,
            'args': processed_args # Use processed args here too
        }
        print(f"Fallback call result: {result}")
        return result # Return generic function call result

    def visit_Attribute(self, node):
        try:
            self.log_debug(f"visit_Attribute: Visiting object {type(node.value).__name__}")
            obj_result = self.visit(node.value) # Get returned result
            attr_name = node.attr
            self.log_debug(f"visit_Attribute: Object result = {obj_result}, Attribute = {attr_name}")
            
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
    Searches an AST for a call to set_rule for a specific target
    and extracts the lambda function passed as the rule.
    """
    def __init__(self, target_name: str, target_player: Optional[int] = None):
        self.target_name = target_name
        # self.target_player = target_player # Optional: Could add player matching if needed
        self.found_lambda: Optional[ast.Lambda] = None
        self.found = False # Flag to stop searching once found
        print(f"LambdaFinder initialized for target: {target_name}")

    def visit_Call(self, node: ast.Call):
        # Stop visiting if we've already found the lambda
        if self.found:
            return

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
                method_name_used = None # Store which get_* method was used

                # Pattern: world.get_location/entrance/region("Target", player)
                if isinstance(target_node, ast.Call) and isinstance(target_node.func, ast.Attribute):
                    method_name_used = target_node.func.attr
                    if method_name_used in ['get_location', 'get_entrance', 'get_region']:
                        if len(target_node.args) > 0 and isinstance(target_node.args[0], ast.Constant):
                            extracted_target_name = target_node.args[0].value
                            # --- LOGGING MOVED HERE ---
                            # Only log if we successfully extract a potential target name
                            print(f"LambdaFinder: Found '{func_name}' call targeting '{extracted_target_name}' via {method_name_used}.")
                
                # --- Check if the extracted target name matches ---
                if extracted_target_name == self.target_name:
                    print(f"LambdaFinder: Target name '{self.target_name}' MATCHED!")
                    # --- Check if the second argument is a Lambda ---
                    rule_node = node.args[1]
                    if isinstance(rule_node, ast.Lambda):
                        print(f"LambdaFinder: Found Lambda node for target '{self.target_name}'!")
                        self.found_lambda = rule_node
                        self.found = True # Stop searching
                        return # Don't visit children of this node further
                    else:
                         print(f"LambdaFinder: Target '{self.target_name}' matched, but rule is not a Lambda node ({type(rule_node).__name__}).")


        # Continue visiting children if not found or not a relevant rule call
        if not self.found:
            super().generic_visit(node)


# Main analysis function
def analyze_rule(rule_func: Optional[Callable[[Any], bool]] = None, 
                 closure_vars: Optional[Dict[str, Any]] = None, 
                 seen_funcs: Optional[Set[int]] = None,
                 ast_node: Optional[ast.AST] = None) -> Dict[str, Any]:
    """
    Analyzes a rule function or an AST node representing a rule.

    Args:
        rule_func: The rule function (lambda or regular function) to analyze.
        closure_vars: Dictionary of variables available in the function's closure.
        seen_funcs: Set of function IDs already analyzed to prevent recursion.
        ast_node: An optional pre-parsed AST node (e.g., ast.Lambda) to analyze directly.

    Returns:
        A dictionary representing the structured rule.
    """
    print("\n--- Starting Rule Analysis ---")
    
    # Initialize seen_funcs set if not provided
    seen_funcs = seen_funcs or set()
    
    # Ensure closure_vars is a dictionary
    closure_vars = closure_vars or {}
    
    analyzer = RuleAnalyzer(closure_vars=closure_vars, seen_funcs=seen_funcs)
    
    try:
        # --- Option 1: Analyze a provided AST node directly --- 
        analysis_result = None
        if ast_node:
            print(f"Analyzing provided AST node: {type(ast_node).__name__}")
            # Visit the provided node and get the result
            analysis_result = analyzer.visit(ast_node) 

        # --- Option 2: Analyze a function object (existing logic) --- 
        elif rule_func:
            print(f"Rule function: {rule_func}")
            # Add rule_func itself to closure_vars if needed? Maybe not necessary.
            
            # Attempt to add function's actual closure variables
            try:
                if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                    closure_cells = rule_func.__closure__
                    free_vars = rule_func.__code__.co_freevars
                    for var_name, cell in zip(free_vars, closure_cells):
                        if var_name not in closure_vars: # Don't overwrite passed vars
                            try:
                                closure_vars[var_name] = cell.cell_contents
                            except ValueError:
                                # Cell is empty, skip
                                pass 
                    print(f"Extracted closure vars: {list(closure_vars.keys())}")
                else:
                    print("No closure variables found for rule function.")
            except Exception as clo_err:
                print(f"Error extracting closure variables: {clo_err}")

            # Add self to closure vars if it's a method
            if hasattr(rule_func, '__self__') and 'self' not in closure_vars:
                 closure_vars['self'] = rule_func.__self__
                 print("Added 'self' to closure vars from method binding.")

            # Clean the source
            cleaned_source = _clean_source(rule_func)
            if cleaned_source is None:
                print("analyze_rule: Failed to clean source, returning error.")
                return {
                    'type': 'error',
                    'message': 'Failed to clean or retrieve source code for rule function.'
                }
            print("Cleaned source:", repr(cleaned_source))
            
            # Create analyzer instance *after* potentially updating closure_vars
            analyzer = RuleAnalyzer(closure_vars=closure_vars, seen_funcs=seen_funcs)
            
            # Comprehensive parse and visit
            try:
                tree = ast.parse(cleaned_source)
                print(f"analyze_rule: Parsed AST = {ast.dump(tree)}")
                print("AST parsed successfully")
                
                # Always visit the full parsed tree in the fallback path
                analysis_result = analyzer.visit(tree) # Get the result from visit

            except SyntaxError as parse_err:
                print(f"analyze_rule: SyntaxError during parse: {parse_err}")
                
                # *** ADDED CHECK for incomplete multi-line lambda ***
                if cleaned_source.rstrip().endswith((' and', ' or')):
                    print("analyze_rule: Detected likely truncated multi-line lambda due to SyntaxError.")
                    analysis_result = {
                        'type': 'error',
                        'message': 'Failed to parse likely multi-line lambda; source may be incomplete.',
                        'source_snippet': cleaned_source[-50:] # Show last 50 chars
                    }
                else:
                    # *** Original Fallback Logic (modified slightly) ***
                    # More robust function call extraction
                    method_match = re.search(r'(\w+(?:\.\w+)?)\((.+?)\)', cleaned_source, re.DOTALL)
                    if method_match:
                        method = method_match.group(1)
                        args_str = method_match.group(2).strip()
                        
                        # Careful argument parsing (remains the same)
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
                        
                        # Set result based on extracted method (remains mostly the same)
                        # Ensure we don't incorrectly identify __analyzed_func__
                        if method == '__analyzed_func__':
                            analysis_result = {
                                'type': 'error',
                                'message': f'SyntaxError lead to fallback identification of {method}',
                                'args': args
                            }
                        elif method == 'state.has':
                            item = args[0].strip().strip("'\"")
                            analysis_result = {
                                'type': 'item_check',
                                'item': item
                            }
                        # ... other specific method handlers ...
                        else:
                             analysis_result = {
                                'type': 'state_method', # Or potentially 'helper' if needed
                                'method': method,
                                'args': [arg.strip().strip("'\"") for arg in args]
                            }
                    else:
                         # If regex fallback also fails, use error result
                         print("analyze_rule: SyntaxError occurred and regex fallback failed.")
                         analysis_result = None # Ensures error_result is used later
        else:
             # No function or AST node provided
             print("analyze_rule: Called without rule_func or ast_node.")
             analysis_result = None

        # Detailed result logging
        if analyzer.error_log:
            print("Errors during analysis:")
            for error in analyzer.error_log:
                print(json.dumps(error, indent=2))
        
        print("Debug log:")
        for log_entry in analyzer.debug_log:
            print(log_entry)
        
        # Return result or error information
        error_result = {
            'type': 'error',
            'debug_log': analyzer.debug_log,
            'error_log': analyzer.error_log
        }
        
        final_result = analysis_result or error_result # Use the returned/set analysis_result
        print(f"analyze_rule: Final result before return = {json.dumps(final_result, indent=2)}")
        return final_result
    
    except Exception as e:
        print(f"Unexpected error in rule analysis: {e}")
        traceback.print_exc()
        return {
            'type': 'constant',
            'value': True  # Default to always accessible
        }