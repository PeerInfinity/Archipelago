"""
AST visitor methods for different node types.

This module contains all the visit_* methods that handle different
AST node types during rule analysis. It's designed as a mixin to be
used with the RuleAnalyzer class.
"""

import ast
import logging
from typing import Any, Dict, Optional, List

from .utils import make_json_serializable, is_simple_value


class ASTVisitorMixin:
    """
    Mixin containing all visit_* methods for AST nodes.
    
    This class is designed to be mixed into RuleAnalyzer and provides
    all the visitor methods for handling different AST node types.
    
    Required attributes from parent class:
        - closure_vars: Dict of closure variables
        - seen_funcs: Dict of seen functions (recursion tracking)
        - game_handler: Game-specific handler
        - rule_func: The rule function being analyzed
        - player_context: Player number context
        - debug_log: List for debug messages
        - error_log: List for error messages
        - expression_resolver: ExpressionResolver instance
        - binary_op_processor: BinaryOpProcessor instance
    """

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
            logging.warning(f"visit_Module: Empty module body, returning None")
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

            # Skip docstrings - they are Expr nodes containing a Constant string as the first statement
            body_to_analyze = node.body
            if (body_to_analyze and
                isinstance(body_to_analyze[0], ast.Expr) and
                isinstance(body_to_analyze[0].value, ast.Constant) and
                isinstance(body_to_analyze[0].value.value, str)):
                # First statement is a docstring, skip it
                logging.debug("Skipping docstring in function body")
                body_to_analyze = body_to_analyze[1:]

            # Skip variable assignments (Assign, AnnAssign) and look for control flow or return
            while body_to_analyze and isinstance(body_to_analyze[0], (ast.Assign, ast.AnnAssign)):
                logging.debug(f"Skipping variable assignment: {type(body_to_analyze[0]).__name__}")
                body_to_analyze = body_to_analyze[1:]

            # Visit the first meaningful body node if exists and return its result
            # Looks for control flow (If, Return, etc.) after skipping assignments
            if body_to_analyze:
                # Special case: If statement without else, and more statements follow
                if isinstance(body_to_analyze[0], ast.If) and not body_to_analyze[0].orelse and len(body_to_analyze) > 1:
                    logging.debug(f"visit_FunctionDef: If statement without else, analyzing remaining {len(body_to_analyze) - 1} statements as implicit else")
                    # Create a synthetic If node with the remaining statements as the else block
                    if_node = body_to_analyze[0]
                    remaining_stmts = body_to_analyze[1:]

                    # Create a synthetic if-node that includes the remaining statements as the else block
                    synthetic_if = ast.If(
                        test=if_node.test,
                        body=if_node.body,
                        orelse=remaining_stmts,
                        lineno=if_node.lineno if hasattr(if_node, 'lineno') else 0,
                        col_offset=if_node.col_offset if hasattr(if_node, 'col_offset') else 0
                    )

                    # Visit this synthetic if-statement, which will use visit_If and its multistatement handling
                    return self.visit_If(synthetic_if)
                else:
                    return self.visit(body_to_analyze[0])
            logging.warning(f"visit_FunctionDef: Empty function body for '{node.name}', returning None")
            return None # Return None if no body
        except Exception as e:
            logging.error(f"Error analyzing function {node.name}: {e}")
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
        Visit a function call node.

        This method keeps ALL arguments during analysis (including state and player).
        Filtering of state/player happens later when creating final result structures.
        """
        logging.debug(f"\nvisit_Call called:")
        logging.debug(f"Function: {ast.dump(node.func)}")
        logging.debug(f"Args: {[ast.dump(arg) for arg in node.args]}")

        # Visit the function node to obtain its details.
        func_info = self.visit(node.func) # Get returned result
        logging.debug(f"Function info after visit: {func_info}")

        # Process ALL arguments and keep track of AST nodes for filtering
        args = []  # Analyzed argument results
        args_with_nodes = []  # Pairs of (ast_node, result) for filtering
        for i, arg_node in enumerate(node.args):
            arg_result = self.visit(arg_node) # Get returned result for each arg
            if arg_result is None:
                 logging.error(f"Failed to analyze argument {i} in call: {ast.dump(arg_node)}")
                 # More permissive - continue even if arg analysis fails
                 continue
            args.append(arg_result)
            args_with_nodes.append((arg_node, arg_result))

        logging.debug(f"Collected all args: {args}")

        # --- Determine the type of call ---

        # 1. Helper function call (identified by name)
        if func_info and func_info.get('type') == 'name':
            func_name = func_info['name']
            logging.debug(f"Checking helper: {func_name}")

            # Filter arguments for game handler and result creation
            filtered_args = self._filter_special_args(args_with_nodes)
            
            # Resolve variable references in arguments (e.g., lambda defaults)
            resolved_args = []
            for arg in filtered_args:
                if arg and arg.get('type') == 'name':
                    # Skip 'world' - it should have been filtered already but double-check
                    if arg['name'] == 'world':
                        logging.debug(f"Skipping resolution of 'world' argument")
                        continue

                    # Try to resolve the variable
                    resolved_value = self.expression_resolver.resolve_variable(arg['name'])
                    if resolved_value is not None and is_simple_value(resolved_value):
                        # Only create constant for simple values
                        # Handle enum values - extract the numeric value
                        if hasattr(resolved_value, 'value'):
                            final_value = resolved_value.value
                        else:
                            final_value = resolved_value
                        # Ensure the final value is JSON-serializable
                        final_value = make_json_serializable(final_value)
                        logging.debug(f"Resolved argument variable '{arg['name']}' to {final_value}")
                        resolved_args.append({'type': 'constant', 'value': final_value})
                    # Handle Region objects - extract the .name attribute
                    elif resolved_value is not None and hasattr(resolved_value, 'name') and hasattr(resolved_value, 'entrances'):
                        region_name = resolved_value.name
                        logging.debug(f"Resolved argument variable '{arg['name']}' (Region object) to region name: {region_name}")
                        resolved_args.append({'type': 'constant', 'value': region_name})
                    else:
                        # Keep unresolved or complex objects as name references
                        resolved_args.append(arg)
                elif arg and arg.get('type') == 'attribute':
                    # Try to resolve attribute expressions like HatType.BREWING
                    resolved_value = self.expression_resolver.resolve_expression(arg)
                    if resolved_value is not None and is_simple_value(resolved_value):
                        # Only create constant for simple values
                        # Handle enum values - extract the numeric value
                        if hasattr(resolved_value, 'value'):
                            final_value = resolved_value.value
                        else:
                            final_value = resolved_value
                        # Ensure the final value is JSON-serializable
                        final_value = make_json_serializable(final_value)
                        logging.debug(f"Resolved argument attribute to {final_value}")
                        resolved_args.append({'type': 'constant', 'value': final_value})
                    else:
                        # Keep unresolved or complex objects as attribute references
                        resolved_args.append(arg)
                else:
                    resolved_args.append(arg)
            
            filtered_args = resolved_args

            # Check for game-specific special function calls
            if self.game_handler and hasattr(self.game_handler, 'handle_special_function_call'):
                special_result = self.game_handler.handle_special_function_call(func_name, filtered_args)
                if special_result:
                    logging.debug(f"Game handler processed special function {func_name}: {special_result}")
                    return special_result

            # Check if the function name resolves to a callable via function defaults (e.g., loc_rule, coin_rule)
            if func_name not in self.closure_vars:
                resolved_func = self.expression_resolver.resolve_variable(func_name)
                if resolved_func is not None and callable(resolved_func):
                    logging.debug(f"Identified call to function from lambda default parameter: {func_name} -> {resolved_func}")

                    # Check if game handler wants to preserve this as a helper
                    should_preserve = False
                    actual_func_name = None
                    if self.game_handler and hasattr(self.game_handler, 'should_preserve_as_helper'):
                        # Get the actual function name from the resolved function
                        actual_func_name = getattr(resolved_func, '__name__', None)
                        if actual_func_name and self.game_handler.should_preserve_as_helper(actual_func_name):
                            logging.debug(f"Game handler requests preserving {actual_func_name} as helper, skipping recursive analysis")
                            should_preserve = True
                            # Replace func_name with the actual function name for helper call creation
                            func_name = actual_func_name
                            func_info = {'type': 'name', 'name': func_name}

                    # Recursive analysis logic for lambda default parameters (only if not preserving as helper)
                    if not should_preserve:
                        try:
                            # Check if 'state' is passed as an argument using original AST nodes
                            has_state_arg = any(isinstance(arg, ast.Name) and arg.id == 'state' for arg in node.args)
                            # Attempt recursion if state arg is present
                            if has_state_arg:
                                # Import analyze_rule locally to avoid forward reference issues
                                from .analysis import analyze_rule
                                logging.debug(f"Recursively analyzing lambda default function: {func_name} -> {resolved_func}")

                                # Build parameter mapping for function inlining
                                param_mapping = self._build_parameter_mapping(resolved_func, args_with_nodes)

                                # Merge parameter mapping into closure vars
                                enhanced_closure_vars = self.closure_vars.copy()
                                enhanced_closure_vars.update(param_mapping)

                                # Pass the seen_funcs dictionary (it's mutable state)
                                recursive_result = analyze_rule(rule_func=resolved_func,
                                                              closure_vars=enhanced_closure_vars,
                                                              seen_funcs=self.seen_funcs,
                                                              game_handler=self.game_handler,
                                                              player_context=self.player_context)
                                if recursive_result.get('type') != 'error':
                                    logging.debug(f"Recursive analysis successful for {func_name}. Result: {recursive_result}")
                                    return recursive_result
                                else:
                                    logging.debug(f"Recursive analysis for {func_name} returned type 'error'. Falling back to helper node. Error details: {recursive_result.get('error_log')}")
                        except Exception as e:
                            logging.error(f"Error during recursive analysis of lambda default {func_name}: {e}")
                        # If recursion wasn't attempted or failed, fall through to default helper representation

            # Check if the function name is in closure vars
            if func_name in self.closure_vars:
                 logging.debug(f"Identified call to known closure variable: {func_name}")

                 # --- Recursive analysis logic (enhanced for multiline lambdas) ---
                 try:
                     # Helper function to check if an AST node references 'state'
                     def references_state(node):
                         """Check if an AST node references the name 'state' anywhere."""
                         if isinstance(node, ast.Name) and node.id == 'state':
                             return True
                         # Check in attribute access: state.smbm
                         if isinstance(node, ast.Attribute):
                             return references_state(node.value)
                         # Check in subscript: state.smbm[player]
                         if isinstance(node, ast.Subscript):
                             return references_state(node.value)
                         # Check in other composite nodes
                         for child in ast.walk(node):
                             if isinstance(child, ast.Name) and child.id == 'state':
                                 return True
                         return False

                     # Check if 'state' is passed as an argument (directly or indirectly)
                     has_state_arg = any(references_state(arg) for arg in node.args)
                     # Attempt recursion if state arg is present
                     if has_state_arg:
                          # Import analyze_rule locally to avoid forward reference issues
                          from .analysis import analyze_rule
                          # Get the actual function from the closure
                          actual_func = self.closure_vars[func_name]
                          logging.debug(f"Recursively analyzing closure function: {func_name} -> {actual_func}")

                          # Build parameter mapping for function inlining
                          param_mapping = self._build_parameter_mapping(actual_func, args_with_nodes)

                          # Merge parameter mapping into closure vars
                          enhanced_closure_vars = self.closure_vars.copy()
                          enhanced_closure_vars.update(param_mapping)

                          # Pass the seen_funcs dictionary (it's mutable state)
                          recursive_result = analyze_rule(rule_func=actual_func,
                                                          closure_vars=enhanced_closure_vars,
                                                          seen_funcs=self.seen_funcs, # Pass the dict
                                                          game_handler=self.game_handler,
                                                          player_context=self.player_context)
                          if recursive_result.get('type') != 'error':
                              logging.debug(f"Recursive analysis successful for {func_name}. Result: {recursive_result}")
                              return recursive_result # Return the detailed analysis result
                          else:
                              logging.debug(f"Recursive analysis for {func_name} returned type 'error'. Falling back to helper node. Error details: {recursive_result.get('error_log')}")
                 except Exception as e:
                      logging.error(f"Error during recursive analysis of closure var {func_name}: {e}")
                 # --- END Recursive analysis logic ---
                 # If recursion wasn't attempted or failed, fall through to default helper representation

            # *** Special handling for all(GeneratorExp) ***
            if func_name == 'all' and len(filtered_args) == 1 and filtered_args[0].get('type') == 'generator_expression':
                logging.debug(f"Detected all(GeneratorExp) pattern.")
                gen_exp = filtered_args[0] # The result from visit_GeneratorExp

                # Try to resolve the iterator if it's a name reference
                iterator_info = gen_exp['comprehension']

                # Check if the iterator has already been resolved to an 'and' or 'or' rule
                # This happens when visit_Subscript has already analyzed a list of callables
                iterator_type = iterator_info.get('iterator', {}).get('type')
                if iterator_type in ('and', 'or'):
                    logging.debug(f"all(GeneratorExp): Iterator already resolved to '{iterator_type}' rule, returning it directly")
                    # The iterator has already been fully analyzed, just return it
                    return iterator_info['iterator']

                if iterator_type == 'name':
                    iterator_name = iterator_info['iterator']['name']
                    logging.debug(f"all(GeneratorExp): Attempting to resolve iterator '{iterator_name}'")

                    resolved_value = self.expression_resolver.resolve_variable(iterator_name)

                    # Convert frozensets/sets/tuples to lists for uniform handling
                    if resolved_value is not None:
                        if isinstance(resolved_value, (frozenset, set, tuple)):
                            resolved_value = list(resolved_value)
                            logging.debug(f"all(GeneratorExp): Converted {type(resolved_value).__name__} to list")

                    if resolved_value is not None and isinstance(resolved_value, list):
                        logging.debug(f"all(GeneratorExp): Resolved '{iterator_name}' to list with {len(resolved_value)} items")

                        # Check if items are callables (old behavior)
                        if all(callable(item) for item in resolved_value):
                            from .analysis import analyze_rule
                            analyzed_items = []
                            for item_func in resolved_value:
                                try:
                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context)
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        logging.debug(f"Could not analyze item in {iterator_name} list, falling back to unresolved")
                                        analyzed_items = None
                                        break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in {iterator_name}: {e}")
                                    analyzed_items = None
                                    break

                            if analyzed_items:
                                # Successfully analyzed all items - return an 'and' of all items
                                logging.debug(f"all(GeneratorExp): Successfully analyzed {len(analyzed_items)} items, returning 'and' rule")
                                if len(analyzed_items) == 1:
                                    return analyzed_items[0]
                                else:
                                    return {'type': 'and', 'conditions': analyzed_items}

                        # NEW: Handle simple values (strings, numbers, etc.) - expand the comprehension
                        else:
                            logging.debug(f"all(GeneratorExp): Iterator contains non-callable values, expanding comprehension")
                            target_name = iterator_info.get('target', {}).get('name')
                            if not target_name:
                                logging.warning(f"all(GeneratorExp): Could not extract target variable name from comprehension")
                            else:
                                element_rule = gen_exp['element']
                                expanded_conditions = []

                                for value in resolved_value:
                                    # Substitute the target variable with the current value in the element rule
                                    substituted_rule = self._substitute_variable_in_rule(element_rule, target_name, value)
                                    if substituted_rule:
                                        expanded_conditions.append(substituted_rule)
                                    else:
                                        logging.warning(f"all(GeneratorExp): Failed to substitute {target_name}={value} in element rule")
                                        expanded_conditions = None
                                        break

                                if expanded_conditions:
                                    logging.debug(f"all(GeneratorExp): Successfully expanded to {len(expanded_conditions)} conditions")
                                    if len(expanded_conditions) == 0:
                                        # Empty iterator - all() of empty is True
                                        return {'type': 'constant', 'value': True}
                                    elif len(expanded_conditions) == 1:
                                        return expanded_conditions[0]
                                    else:
                                        return {'type': 'and', 'conditions': expanded_conditions}

                # Represent this as a specific 'all_of' rule type
                result = {
                    'type': 'all_of',
                    'element_rule': gen_exp['element'],
                    'iterator_info': iterator_info
                }
                logging.debug(f"Created 'all_of' result: {result}")
                return result
            # *** END ADDED ***

            # *** Special handling for any(GeneratorExp) ***
            if func_name == 'any' and len(filtered_args) == 1 and filtered_args[0].get('type') == 'generator_expression':
                logging.debug(f"Detected any(GeneratorExp) pattern.")
                gen_exp = filtered_args[0] # The result from visit_GeneratorExp

                # Try to resolve the iterator if it's a name reference
                iterator_info = gen_exp['comprehension']

                # Check if the iterator has already been resolved to an 'and' or 'or' rule
                # This happens when visit_Subscript has already analyzed a list of callables
                iterator_type = iterator_info.get('iterator', {}).get('type')
                if iterator_type in ('and', 'or'):
                    logging.debug(f"any(GeneratorExp): Iterator already resolved to '{iterator_type}' rule, returning it directly (converting 'and' to 'or' if needed)")
                    # The iterator has already been fully analyzed
                    # For any(), we need an 'or' of all conditions
                    iterator_rule = iterator_info['iterator']
                    if iterator_rule.get('type') == 'and':
                        # Convert 'and' to 'or' for any()
                        return {'type': 'or', 'conditions': iterator_rule.get('conditions', [])}
                    else:
                        return iterator_rule

                if iterator_type == 'name':
                    iterator_name = iterator_info['iterator']['name']
                    logging.debug(f"any(GeneratorExp): Attempting to resolve iterator '{iterator_name}'")

                    resolved_value = self.expression_resolver.resolve_variable(iterator_name)

                    # Convert frozensets/sets/tuples to lists for uniform handling
                    if resolved_value is not None:
                        if isinstance(resolved_value, (frozenset, set, tuple)):
                            resolved_value = list(resolved_value)
                            logging.debug(f"any(GeneratorExp): Converted {type(resolved_value).__name__} to list")

                    if resolved_value is not None and isinstance(resolved_value, list):
                        logging.debug(f"any(GeneratorExp): Resolved '{iterator_name}' to list with {len(resolved_value)} items")

                        # Check if items are callables (old behavior)
                        if all(callable(item) for item in resolved_value):
                            from .analysis import analyze_rule
                            analyzed_items = []
                            for item_func in resolved_value:
                                try:
                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context)
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        logging.debug(f"Could not analyze item in {iterator_name} list, falling back to unresolved")
                                        analyzed_items = None
                                        break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in {iterator_name}: {e}")
                                    analyzed_items = None
                                    break

                            if analyzed_items:
                                # Successfully analyzed all items - return an 'or' of all items (different from 'all')
                                logging.debug(f"any(GeneratorExp): Successfully analyzed {len(analyzed_items)} items, returning 'or' rule")
                                if len(analyzed_items) == 1:
                                    return analyzed_items[0]
                                else:
                                    return {'type': 'or', 'conditions': analyzed_items}

                        # NEW: Handle simple values (strings, numbers, etc.) - expand the comprehension
                        else:
                            logging.debug(f"any(GeneratorExp): Iterator contains non-callable values, expanding comprehension")
                            target_name = iterator_info.get('target', {}).get('name')
                            if not target_name:
                                logging.warning(f"any(GeneratorExp): Could not extract target variable name from comprehension")
                            else:
                                element_rule = gen_exp['element']
                                expanded_conditions = []

                                for value in resolved_value:
                                    # Substitute the target variable with the current value in the element rule
                                    substituted_rule = self._substitute_variable_in_rule(element_rule, target_name, value)
                                    if substituted_rule:
                                        expanded_conditions.append(substituted_rule)
                                    else:
                                        logging.warning(f"any(GeneratorExp): Failed to substitute {target_name}={value} in element rule")
                                        expanded_conditions = None
                                        break

                                if expanded_conditions:
                                    logging.debug(f"any(GeneratorExp): Successfully expanded to {len(expanded_conditions)} conditions")
                                    if len(expanded_conditions) == 0:
                                        # Empty iterator - any() of empty is False
                                        return {'type': 'constant', 'value': False}
                                    elif len(expanded_conditions) == 1:
                                        return expanded_conditions[0]
                                    else:
                                        return {'type': 'or', 'conditions': expanded_conditions}

                # If we couldn't resolve, represent this as a specific 'any_of' rule type
                result = {
                    'type': 'any_of',
                    'element_rule': gen_exp['element'],
                    'iterator_info': iterator_info
                }
                logging.debug(f"Created 'any_of' result: {result}")
                return result
            # *** END any() HANDLING ***

            # *** Special handling for zip() function ***
            if func_name == 'zip':
                logging.debug(f"Detected zip() function call with {len(filtered_args)} args")
                processed_result = self.binary_op_processor.try_preprocess_zip(filtered_args)
                if processed_result is not None:
                    logging.debug(f"Pre-processed zip() to: {processed_result}")
                    return processed_result
                # If can't pre-process, fall through to regular helper handling

            # *** Special handling for len() function ***
            if func_name == 'len' and len(filtered_args) == 1:
                logging.debug(f"Detected len() function call")
                processed_result = self.binary_op_processor.try_preprocess_len(filtered_args[0])
                if processed_result is not None:
                    logging.debug(f"Pre-processed len() to: {processed_result}")
                    return processed_result
                # If can't pre-process, fall through to regular helper handling

            # Create helper result with filtered args (no state/player in JSON)
            result = {
                'type': 'helper',
                'name': func_name,
                'args': filtered_args
            }
            logging.debug(f"Created helper result: {result}")
            return result # Return helper result

        # 2. State method call (e.g., state.has)
        elif (func_info and func_info.get('type') == 'attribute' and
              func_info['object'].get('type') == 'name' and func_info['object'].get('name') == 'state'):
                method = func_info['attr']
                logging.debug(f"Processing state method: {method}")

                # Filter out state/player for final result
                filtered_args = self._filter_special_args(args_with_nodes)

                # Resolve variable references in arguments (e.g., lambda defaults)
                # This is needed for methods like has_from_list that use lambda with defaults
                resolved_args = []
                for arg in filtered_args:
                    if arg and arg.get('type') == 'name':
                        # Try to resolve the variable
                        resolved_value = self.expression_resolver.resolve_variable(arg['name'])
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Only create constant for simple values
                            # Handle enum values - extract the numeric value
                            if hasattr(resolved_value, 'value'):
                                final_value = resolved_value.value
                            else:
                                final_value = resolved_value
                            # Ensure the final value is JSON-serializable
                            final_value = make_json_serializable(final_value)
                            logging.debug(f"Resolved state method argument variable '{arg['name']}' to {final_value}")
                            resolved_args.append({'type': 'constant', 'value': final_value})
                        # Handle Region objects - extract the .name attribute
                        elif resolved_value is not None and hasattr(resolved_value, 'name') and hasattr(resolved_value, 'entrances'):
                            region_name = resolved_value.name
                            logging.debug(f"Resolved state method argument variable '{arg['name']}' (Region object) to region name: {region_name}")
                            resolved_args.append({'type': 'constant', 'value': region_name})
                        else:
                            # Keep unresolved or complex objects as name references
                            resolved_args.append(arg)
                    elif arg and arg.get('type') == 'binary_op':
                        # Try to resolve binary operations like i+1
                        resolved_value = self.expression_resolver.resolve_expression(arg)
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Only create constant for simple values
                            # Ensure the resolved value is JSON-serializable
                            resolved_value = make_json_serializable(resolved_value)
                            logging.debug(f"Resolved state method binary_op '{arg}' to {resolved_value}")
                            resolved_args.append({'type': 'constant', 'value': resolved_value})
                        else:
                            # Keep unresolved expression as-is
                            resolved_args.append(arg)
                    elif arg and arg.get('type') == 'attribute':
                        # Try to resolve attribute expressions like HatType.BREWING
                        resolved_value = self.expression_resolver.resolve_expression(arg)
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Only create constant for simple values
                            # Handle enum values - extract the numeric value
                            if hasattr(resolved_value, 'value'):
                                final_value = resolved_value.value
                            else:
                                final_value = resolved_value
                            # Ensure the final value is JSON-serializable
                            final_value = make_json_serializable(final_value)
                            logging.debug(f"Resolved state method argument attribute to {final_value}")
                            resolved_args.append({'type': 'constant', 'value': final_value})
                        else:
                            # Keep unresolved or complex objects as attribute references
                            resolved_args.append(arg)
                    elif arg and arg.get('type') == 'list':
                        # Recursively resolve list elements (e.g., [iname.double, iname.roc_wing])
                        list_elements = arg.get('value', [])
                        resolved_list = []
                        all_resolved = True

                        for element in list_elements:
                            if element and element.get('type') == 'attribute':
                                # Try to resolve the attribute
                                resolved_value = self.expression_resolver.resolve_expression(element)
                                if resolved_value is not None and is_simple_value(resolved_value):
                                    # Only add to list if it's a simple value
                                    # Handle enum values
                                    if hasattr(resolved_value, 'value'):
                                        final_value = resolved_value.value
                                    else:
                                        final_value = resolved_value
                                    # Ensure the value is JSON-serializable
                                    final_value = make_json_serializable(final_value)
                                    resolved_list.append(final_value)
                                else:
                                    # Could not resolve or complex object
                                    all_resolved = False
                                    break
                            elif element and element.get('type') == 'constant':
                                # Already a constant, just extract the value
                                resolved_list.append(element.get('value'))
                            elif element and element.get('type') == 'name':
                                # Try to resolve the name
                                resolved_value = self.expression_resolver.resolve_variable(element.get('name'))
                                if resolved_value is not None and is_simple_value(resolved_value):
                                    # Only add to list if it's a simple value
                                    if hasattr(resolved_value, 'value'):
                                        final_value = resolved_value.value
                                    else:
                                        final_value = resolved_value
                                    final_value = make_json_serializable(final_value)
                                    resolved_list.append(final_value)
                                else:
                                    # Could not resolve or complex object
                                    all_resolved = False
                                    break
                            else:
                                # Unknown element type
                                all_resolved = False
                                break

                        if all_resolved and len(resolved_list) == len(list_elements):
                            # Successfully resolved all elements
                            logging.debug(f"Resolved state method list argument to {resolved_list}")
                            resolved_args.append({'type': 'constant', 'value': resolved_list})
                        else:
                            # Could not resolve all elements, keep the list structure
                            logging.debug(f"Could not fully resolve list argument, keeping as-is")
                            resolved_args.append(arg)
                    else:
                        resolved_args.append(arg)

                filtered_args = resolved_args

                # For has_all, has_any, and has_all_counts, sort arguments for consistency
                # These methods are order-independent, so we can safely sort
                if method in ['has_all', 'has_any', 'has_all_counts'] and len(filtered_args) >= 1:
                    first_arg = filtered_args[0]
                    if first_arg and first_arg.get('type') == 'constant':
                        value = first_arg.get('value')
                        if isinstance(value, list) and all(isinstance(item, str) for item in value):
                            # Sort string lists for consistent ordering
                            sorted_value = sorted(value)
                            filtered_args[0] = {'type': 'constant', 'value': sorted_value}
                            logging.debug(f"Sorted {method} argument list: {sorted_value}")
                        elif isinstance(value, dict):
                            # Sort dictionary keys for consistent ordering
                            sorted_dict = {k: value[k] for k in sorted(value.keys())}
                            filtered_args[0] = {'type': 'constant', 'value': sorted_dict}
                            logging.debug(f"Sorted {method} argument dict keys: {list(sorted_dict.keys())}")

                # Simplify handling based on method name
                if method == 'has' and len(filtered_args) >= 1:
                    logging.debug(f"Processing state.has with {len(filtered_args)} filtered args: {filtered_args}")

                    # Try to resolve the item name expression to get the actual string value
                    first_arg = filtered_args[0]
                    item_value = first_arg
                    if isinstance(first_arg, dict):
                        # First, check if it's already a constant - unwrap it immediately
                        if first_arg.get('type') == 'constant':
                            if isinstance(first_arg.get('value'), str):
                                # Constant string - extract the value
                                item_value = first_arg.get('value')
                                logging.debug(f"Unwrapped constant item name: {first_arg} -> {item_value}")
                            else:
                                # Constant but not a string - keep as-is for further evaluation
                                item_value = first_arg
                                logging.debug(f"Non-string constant in item_check: {first_arg}")
                        else:
                            # Try to resolve the expression (e.g., ItemName.MasterForm -> "Master Form")
                            resolved_item = self.expression_resolver.resolve_expression(first_arg)
                            if resolved_item is not None and isinstance(resolved_item, str):
                                # Successfully resolved to a string value - use the string directly
                                logging.debug(f"Resolved item name: {first_arg} -> {resolved_item}")
                                item_value = resolved_item
                            else:
                                # Could not resolve to a constant value, keep as-is (rule object)
                                logging.debug(f"Could not resolve item name: {first_arg}")
                                item_value = first_arg

                    result = {'type': 'item_check', 'item': item_value}
                    # Check for count parameter (now in position 1 after filtering)
                    if len(filtered_args) >= 2:
                        second_arg = filtered_args[1]
                        if isinstance(second_arg, dict):
                            # Try to resolve the expression to a concrete value
                            resolved_value = self.expression_resolver.resolve_expression(second_arg)
                            if resolved_value is not None and isinstance(resolved_value, int):
                                # Successfully resolved to an integer value
                                logging.debug(f"Resolved count parameter: {second_arg} -> {resolved_value}")
                                result['count'] = {'type': 'constant', 'value': resolved_value}
                            elif second_arg.get('type') == 'constant' and isinstance(second_arg.get('value'), int):
                                # Already a constant, use as-is
                                logging.debug(f"Found constant count parameter: {second_arg}")
                                result['count'] = second_arg
                            else:
                                # Could not resolve to a constant value, keep as-is
                                logging.debug(f"Found unresolved count parameter: {second_arg}")
                                result['count'] = second_arg
                elif method == 'has_group' and len(filtered_args) >= 1:
                    # Unwrap group name if it's a constant
                    group_arg = filtered_args[0]
                    if isinstance(group_arg, dict) and group_arg.get('type') == 'constant' and isinstance(group_arg.get('value'), str):
                        group_value = group_arg.get('value')
                    elif isinstance(group_arg, str):
                        group_value = group_arg
                    else:
                        group_value = group_arg
                    result = {'type': 'group_check', 'group': group_value}
                    # Check for count parameter (now in position 1 after filtering)
                    if len(filtered_args) >= 2:
                        second_arg = filtered_args[1]
                        if isinstance(second_arg, dict):
                            # Try to resolve the expression to a concrete value
                            resolved_value = self.expression_resolver.resolve_expression(second_arg)
                            if resolved_value is not None and isinstance(resolved_value, int):
                                # Successfully resolved to an integer value
                                logging.debug(f"Resolved group count parameter: {second_arg} -> {resolved_value}")
                                result['count'] = {'type': 'constant', 'value': resolved_value}
                            elif second_arg.get('type') == 'constant' and isinstance(second_arg.get('value'), int):
                                # Already a constant, use as-is
                                logging.debug(f"Found constant group count parameter: {second_arg}")
                                result['count'] = second_arg
                            else:
                                # Could not resolve to a constant value, keep as-is
                                logging.debug(f"Found unresolved group count parameter: {second_arg}")
                                result['count'] = second_arg
                elif method == 'has_any' and len(filtered_args) >= 1 and isinstance(filtered_args[0], list):
                    # Unwrap each item if it's a constant
                    items = []
                    for item in filtered_args[0]:
                        if isinstance(item, dict) and item.get('type') == 'constant' and isinstance(item.get('value'), str):
                            items.append(item.get('value'))
                        elif isinstance(item, str):
                            items.append(item)
                        else:
                            items.append(item)
                    result = {'type': 'or', 'conditions': [{'type': 'item_check', 'item': item} for item in items]}
                elif method == '_lttp_has_key' and len(filtered_args) >= 1:
                    # Unwrap item name if it's a constant
                    item_arg = filtered_args[0]
                    if isinstance(item_arg, dict) and item_arg.get('type') == 'constant' and isinstance(item_arg.get('value'), str):
                        item_value = item_arg.get('value')
                    elif isinstance(item_arg, str):
                        item_value = item_arg
                    else:
                        item_value = item_arg
                    # Count is now in position 1 after player is filtered
                    count = filtered_args[1] if len(filtered_args) >= 2 else {'type': 'constant', 'value': 1}
                    result = {'type': 'count_check', 'item': item_value, 'count': count}
                # Add other state methods like can_reach if needed
                # elif method == 'can_reach': ...
                else:
                    # Default for unhandled state methods
                    result = {'type': 'state_method', 'method': method, 'args': filtered_args}

                logging.debug(f"State method result: {result}")
                return result # Return state method result

        # 2.5. Attribute-based method calls (self.method, logic.method)
        elif func_info and func_info.get('type') == 'attribute':
            obj_name = func_info['object'].get('name') if func_info['object'].get('type') == 'name' else None
            method_name = func_info['attr']

            # Handle self.method calls (e.g., self.has_boss_strength)
            if obj_name == 'self':
                logging.debug(f"Processing self method call: {method_name}")

                # Filter out state/player arguments
                filtered_args = self._filter_special_args(args_with_nodes)

                # Create helper result with the captured arguments
                # DO NOT recursively analyze - we want to capture the call AS IS with its arguments
                result = {
                    'type': 'helper',
                    'name': method_name,
                    'args': filtered_args
                }
                logging.debug(f"Created helper result for self method: {result}")
                return result

            # Handle logic.method calls (e.g., logic.oaks_aide, logic.can_surf)
            elif obj_name == 'logic':
                logging.debug(f"Processing logic method call: {method_name}")

                # Filter out state/world/player arguments
                filtered_args = self._filter_special_args(args_with_nodes)

                # Resolve variable references in arguments (e.g., world.options.value expressions)
                resolved_args = []
                for arg in filtered_args:
                    if arg and arg.get('type') == 'binary_op':
                        # Try to resolve binary operations like world.options.oaks_aide_rt_11.value + 5
                        resolved_value = self.expression_resolver.resolve_expression(arg)
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Ensure the resolved value is JSON-serializable
                            resolved_value = make_json_serializable(resolved_value)
                            logging.debug(f"Resolved logic method binary_op to {resolved_value}")
                            resolved_args.append({'type': 'constant', 'value': resolved_value})
                        else:
                            # Keep unresolved expression as-is
                            resolved_args.append(arg)
                    elif arg and arg.get('type') == 'attribute':
                        # Try to resolve attribute expressions like world.options.some_option.value
                        resolved_value = self.expression_resolver.resolve_expression(arg)
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Handle enum values - extract the numeric value
                            if hasattr(resolved_value, 'value'):
                                final_value = resolved_value.value
                            else:
                                final_value = resolved_value
                            # Ensure the final value is JSON-serializable
                            final_value = make_json_serializable(final_value)
                            logging.debug(f"Resolved logic method argument attribute to {final_value}")
                            resolved_args.append({'type': 'constant', 'value': final_value})
                        else:
                            # Keep unresolved or complex objects as attribute references
                            resolved_args.append(arg)
                    elif arg and arg.get('type') == 'name':
                        # Try to resolve the variable (but skip 'world' which should already be filtered)
                        if arg['name'] == 'world':
                            logging.debug(f"Skipping resolution of 'world' argument in logic call")
                            continue
                        resolved_value = self.expression_resolver.resolve_variable(arg['name'])
                        if resolved_value is not None and is_simple_value(resolved_value):
                            # Handle enum values - extract the numeric value
                            if hasattr(resolved_value, 'value'):
                                final_value = resolved_value.value
                            else:
                                final_value = resolved_value
                            # Ensure the final value is JSON-serializable
                            final_value = make_json_serializable(final_value)
                            logging.debug(f"Resolved logic method argument variable '{arg['name']}' to {final_value}")
                            resolved_args.append({'type': 'constant', 'value': final_value})
                        else:
                            # Keep unresolved or complex objects as name references
                            resolved_args.append(arg)
                    else:
                        resolved_args.append(arg)

                filtered_args = resolved_args

                # Create helper result
                result = {
                    'type': 'helper',
                    'name': method_name,
                    'args': filtered_args
                }
                logging.debug(f"Created helper result for logic method: {result}")
                return result

            # Handle Location and Region object method calls (e.g., loc.can_reach(state) or region.can_reach(state))
            elif obj_name and method_name == 'can_reach':
                logging.debug(f"Processing potential Location/Region method call: {obj_name}.{method_name}")

                # Try to resolve the object from closure_vars
                resolved_obj = self.expression_resolver.resolve_variable(obj_name)

                # Check if we successfully resolved an object with a 'name' attribute
                if resolved_obj is not None and hasattr(resolved_obj, 'name') and isinstance(resolved_obj.name, str):
                    # Determine if it's a Region (has 'entrances') or Location (no 'entrances')
                    has_entrances = hasattr(resolved_obj, 'entrances')
                    obj_type = 'Region' if has_entrances else 'Location'
                    obj_name_value = resolved_obj.name

                    logging.debug(f"Resolved {obj_name} to {obj_type} object with name: {obj_name_value}")

                    # Convert [location|region].can_reach(state) to state.can_reach(name, type, player)
                    # Note: player argument will be provided by the state manager
                    result = {
                        'type': 'state_method',
                        'method': 'can_reach',
                        'args': [
                            {'type': 'constant', 'value': obj_name_value},
                            {'type': 'constant', 'value': obj_type}
                        ]
                    }
                    logging.debug(f"Converted {obj_type}.can_reach to state_method: {result}")
                    return result
                else:
                    logging.debug(f"Could not resolve {obj_name} for can_reach call, falling through to other handlers")

            # Handle module-based helper calls (e.g., StateLogic.canDig, Rules.method)
            # These are calls to functions from imported modules that should be treated as helpers
            else:
                # Check if this is a module name that contains helper functions
                # Common patterns: StateLogic, Rules, Logic (capitalized module names)
                if obj_name and (obj_name.endswith('Logic') or obj_name == 'Rules'):
                    logging.debug(f"Processing module-based helper call: {obj_name}.{method_name}")

                    # Filter out state/world/player arguments
                    filtered_args = self._filter_special_args(args_with_nodes)

                    # Resolve variable references in arguments
                    resolved_args = []
                    for arg in filtered_args:
                        if arg and arg.get('type') == 'name':
                            if arg['name'] == 'world':
                                logging.debug(f"Skipping resolution of 'world' argument in module call")
                                continue
                            resolved_value = self.expression_resolver.resolve_variable(arg['name'])
                            if resolved_value is not None and is_simple_value(resolved_value):
                                if hasattr(resolved_value, 'value'):
                                    final_value = resolved_value.value
                                else:
                                    final_value = resolved_value
                                final_value = make_json_serializable(final_value)
                                logging.debug(f"Resolved module helper argument variable '{arg['name']}' to {final_value}")
                                resolved_args.append({'type': 'constant', 'value': final_value})
                            # Handle Region objects - extract the .name attribute
                            elif resolved_value is not None and hasattr(resolved_value, 'name') and hasattr(resolved_value, 'entrances'):
                                region_name = resolved_value.name
                                logging.debug(f"Resolved module helper argument variable '{arg['name']}' (Region object) to region name: {region_name}")
                                resolved_args.append({'type': 'constant', 'value': region_name})
                            else:
                                resolved_args.append(arg)
                        elif arg and arg.get('type') == 'attribute':
                            resolved_value = self.expression_resolver.resolve_expression(arg)
                            if resolved_value is not None and is_simple_value(resolved_value):
                                if hasattr(resolved_value, 'value'):
                                    final_value = resolved_value.value
                                else:
                                    final_value = resolved_value
                                final_value = make_json_serializable(final_value)
                                logging.debug(f"Resolved module helper argument attribute to {final_value}")
                                resolved_args.append({'type': 'constant', 'value': final_value})
                            else:
                                resolved_args.append(arg)
                        else:
                            resolved_args.append(arg)

                    filtered_args = resolved_args

                    # Create helper result
                    result = {
                        'type': 'helper',
                        'name': method_name,
                        'args': filtered_args
                    }
                    logging.debug(f"Created helper result for module method: {result}")
                    return result

        # 3. Fallback for other types of calls (e.g., calling result of another function)
        logging.debug(f"Fallback function call type. func_info = {func_info}")
        filtered_args = self._filter_special_args(args_with_nodes)
        result = {
            'type': 'function_call',
            'function': func_info,
            'args': filtered_args
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
                 # Try to resolve the attribute access to a constant value
                 attr_structure = {'type': 'attribute', 'object': obj_result, 'attr': attr_name}
                 resolved_value = self.expression_resolver.resolve_expression(attr_structure)

                 # If resolved to a simple value, return it as a constant
                 if resolved_value is not None and isinstance(resolved_value, (int, float, str, bool)):
                     logging.debug(f"visit_Attribute: Resolved {attr_name} to constant value: {resolved_value}")
                     return {'type': 'constant', 'value': resolved_value}

                 # Otherwise return the attribute access structure
                 logging.debug(f"visit_Attribute: Returning attribute structure {attr_structure}")
                 return attr_structure
            else:
                 # Handle case where object visit failed
                 logging.error(f"visit_Attribute: Failed to get result for object in {ast.dump(node)}")
                 return None # Return None on error

        except Exception as e:
            logging.error(f"Error in visit_Attribute for {ast.dump(node)}: {e}")
            return None

    def visit_Name(self, node):
        try:
            name = node.id
            logging.debug(f"visit_Name: Name = {name}")
            # Specifically log 'self'
            if name == 'self':
                logging.debug("visit_Name: Detected 'self'")

            # Check if this name is in closure vars and should be resolved to a constant
            if name in self.closure_vars:
                value = self.closure_vars[name]
                # Handle None values
                if value is None:
                    logging.debug(f"visit_Name: Resolved '{name}' from closure to None")
                    return {'type': 'constant', 'value': None}
                # Handle simple values (numbers, strings, bools)
                elif isinstance(value, (int, float, str, bool)):
                    logging.debug(f"visit_Name: Resolved '{name}' from closure to constant value: {value}")
                    return {'type': 'constant', 'value': value}
                # Handle enum values by extracting their .value attribute
                elif hasattr(value, 'value') and isinstance(value.value, (int, float, str, bool)):
                    logging.debug(f"visit_Name: Resolved '{name}' from closure to enum constant value: {value.value}")
                    return {'type': 'constant', 'value': value.value}
                # Handle Region objects - DON'T convert to string yet
                # Keep them as name references so attribute access can still work
                # We specifically check for 'entrances' attribute which Region objects have
                # but Location objects don't, to avoid breaking Location.can_reach() patterns
                elif hasattr(value, 'name') and hasattr(value, 'entrances') and isinstance(value.name, str):
                    logging.debug(f"visit_Name: Found Region object '{name}' in closure, keeping as name reference for attribute access")
                    # Don't convert to string here - let attribute access or other operations handle it
                    pass
                # Handle NamedTuples - keep them as name references so attribute access still works
                # The attributes will be resolved later in visit_Attribute
                elif hasattr(value, '_fields'):
                    logging.debug(f"visit_Name: Found NamedTuple '{name}' in closure, keeping as name reference for attribute access")
                    # Don't convert to list here - let attribute access resolve the fields
                    pass

            # Also check function defaults for lambda parameters
            if name not in self.closure_vars:
                resolved_value = self.expression_resolver.resolve_variable(name)
                if resolved_value is not None:
                    # Handle simple values
                    if isinstance(resolved_value, (int, float, str, bool)):
                        logging.debug(f"visit_Name: Resolved '{name}' from function defaults to constant value: {resolved_value}")
                        return {'type': 'constant', 'value': resolved_value}
                    # Handle enum values by extracting their .value attribute
                    elif hasattr(resolved_value, 'value') and isinstance(resolved_value.value, (int, float, str, bool)):
                        logging.debug(f"visit_Name: Resolved '{name}' from function defaults to enum constant value: {resolved_value.value}")
                        return {'type': 'constant', 'value': resolved_value.value}
                    # Handle Region objects - DON'T convert to string yet
                    # Check for 'entrances' to distinguish Region from Location objects
                    elif hasattr(resolved_value, 'name') and hasattr(resolved_value, 'entrances') and isinstance(resolved_value.name, str):
                        logging.debug(f"visit_Name: Found Region object '{name}' in function defaults, keeping as name reference for attribute access")
                        # Don't convert to string here - let attribute access or other operations handle it
                        pass
                    # Handle NamedTuples from function defaults - keep as name references for attribute access
                    elif hasattr(resolved_value, '_fields'):
                        logging.debug(f"visit_Name: Found NamedTuple '{name}' in function defaults, keeping as name reference for attribute access")
                        # Don't convert to list here - let attribute access resolve the fields
                        pass

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
            logging.error(f"Error in visit_Name for {node.id}: {e}")
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
        Handle subscript expressions like foo[bar].
        Attempts to resolve the subscript if both value and index are resolvable.
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

        # Try to resolve the subscript operation if both parts are resolvable
        try:
            # Try to resolve the value (the container)
            resolved_container = None
            if value_info.get('type') == 'name':
                resolved_container = self.expression_resolver.resolve_variable(value_info['name'])
                if resolved_container is not None:
                    logging.debug(f"Resolved subscript container '{value_info['name']}' to {type(resolved_container).__name__}")
            elif value_info.get('type') == 'constant':
                resolved_container = value_info['value']

            # Try to resolve the index
            resolved_index = None
            if index_info.get('type') == 'constant':
                resolved_index = index_info['value']
            elif index_info.get('type') == 'name':
                resolved_index = self.expression_resolver.resolve_variable(index_info['name'])
                if resolved_index is not None:
                    logging.debug(f"Resolved subscript index '{index_info['name']}' to {resolved_index}")

            # If both container and index are resolved, perform the subscript operation
            if resolved_container is not None and resolved_index is not None:
                try:
                    # Try to perform the subscript operation
                    if isinstance(resolved_container, (dict, list, tuple)):
                        subscript_result = resolved_container[resolved_index]
                        logging.debug(f"Successfully resolved subscript operation: {type(resolved_container).__name__}[{resolved_index}] = {subscript_result}")

                        # Return as a constant if it's a simple value
                        if isinstance(subscript_result, (int, float, str, bool, type(None))):
                            return {'type': 'constant', 'value': subscript_result}
                        # Handle enum values
                        elif hasattr(subscript_result, 'value') and isinstance(subscript_result.value, (int, float, str, bool)):
                            return {'type': 'constant', 'value': subscript_result.value}
                        # Handle callable results (functions from closure)
                        elif callable(subscript_result):
                            logging.debug(f"Subscript result is callable (type: {type(subscript_result).__name__}), analyzing it as a rule function")
                            # Import analyze_rule to avoid circular dependency
                            from .analysis import analyze_rule
                            # Analyze the function to get its rule structure
                            analyzed_result = analyze_rule(
                                rule_func=subscript_result,
                                closure_vars=self.closure_vars,
                                seen_funcs=self.seen_funcs,
                                game_handler=self.game_handler,
                                player_context=self.player_context
                            )
                            if analyzed_result and analyzed_result.get('type') != 'error':
                                logging.debug(f"Successfully analyzed callable subscript result: {analyzed_result.get('type')}")
                                return analyzed_result
                            else:
                                logging.warning(f"Failed to analyze callable subscript result or got error: {analyzed_result}")
                        # Handle lists (which may contain callables or other values)
                        elif isinstance(subscript_result, (list, tuple)):
                            logging.debug(f"Subscript result is a list/tuple with {len(subscript_result)} items, checking if items are analyzable")
                            # Check if all items are callables
                            if all(callable(item) for item in subscript_result):
                                logging.debug(f"All items in subscript result list are callable, analyzing them")
                                # Import analyze_rule to avoid circular dependency
                                from .analysis import analyze_rule
                                analyzed_items = []
                                for idx, item_func in enumerate(subscript_result):
                                    try:
                                        item_result = analyze_rule(
                                            rule_func=item_func,
                                            closure_vars=self.closure_vars.copy(),
                                            seen_funcs=self.seen_funcs,
                                            game_handler=self.game_handler,
                                            player_context=self.player_context
                                        )
                                        if item_result and item_result.get('type') != 'error':
                                            analyzed_items.append(item_result)
                                        else:
                                            logging.debug(f"Could not analyze item {idx} in subscript list result, falling back to unresolved")
                                            analyzed_items = None
                                            break
                                    except Exception as e:
                                        logging.debug(f"Error analyzing item {idx} in subscript list result: {e}")
                                        analyzed_items = None
                                        break

                                if analyzed_items:
                                    # Successfully analyzed all items - return an 'and' of all items
                                    logging.debug(f"Successfully analyzed {len(analyzed_items)} callable items from subscript list, returning 'and' rule")
                                    if len(analyzed_items) == 0:
                                        # Empty list - all() of empty is True
                                        return {'type': 'constant', 'value': True}
                                    elif len(analyzed_items) == 1:
                                        return analyzed_items[0]
                                    else:
                                        return {'type': 'and', 'conditions': analyzed_items}
                            else:
                                # List contains non-callables, keep it as a constant
                                logging.debug(f"Subscript result list contains non-callable items, returning as constant")
                                return {'type': 'constant', 'value': subscript_result}
                        else:
                            logging.debug(f"Subscript result is not a simple value (type: {type(subscript_result).__name__}), cannot convert to constant")
                except (KeyError, IndexError, TypeError) as e:
                    logging.debug(f"Could not perform subscript operation: {e}")
        except Exception as e:
            logging.debug(f"Error attempting to resolve subscript: {e}")

        # If we couldn't resolve, create an unresolved subscript node
        result = {
            'type': 'subscript',
            'value': value_info,
            'index': index_info
        }

        logging.debug(f"Subscript result (unresolved): {result}")
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
            logging.error(f"Error in visit_BoolOp: {e}")
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

            # Try to resolve the operand if it's an attribute expression
            if operand_result.get('type') == 'attribute':
                resolved_value = self.expression_resolver.resolve_expression(operand_result)
                if resolved_value is not None and is_simple_value(resolved_value):
                    # Handle enum values - extract the numeric/boolean value
                    if hasattr(resolved_value, 'value'):
                        final_value = resolved_value.value
                    else:
                        final_value = resolved_value
                    # Ensure the final value is JSON-serializable
                    final_value = make_json_serializable(final_value)
                    logging.debug(f"Resolved UnaryOp operand attribute to constant: {final_value}")
                    operand_result = {'type': 'constant', 'value': final_value}

            # Handle specific unary operators
            if isinstance(node.op, ast.Not):
                # If operand is a constant, evaluate the not operation now
                if operand_result.get('type') == 'constant':
                    constant_value = operand_result['value']
                    result_value = not constant_value
                    logging.debug(f"Evaluated not {constant_value} = {result_value}")
                    return {'type': 'constant', 'value': result_value}
                else:
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

            # Sort elements for consistent ordering (sets are unordered in Python)
            # Check if all elements are constants and sort them if so
            if all(e.get('type') == 'constant' for e in elements):
                elements.sort(key=lambda e: (str(type(e.get('value')).__name__), str(e.get('value'))))

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
            logging.error(f"Error in generic_visit for {type(node).__name__}: {e}")

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

            # Check if we should process multiple statements in if-bodies
            should_process_multistatement = False
            if self.game_handler and hasattr(self.game_handler, 'should_process_multistatement_if_bodies'):
                should_process_multistatement = self.game_handler.should_process_multistatement_if_bodies()
                logging.debug(f"visit_If: should_process_multistatement_if_bodies = {should_process_multistatement}")

            # Process the if-body
            body_result = None
            if node.body:
                if should_process_multistatement and len(node.body) > 1:
                    # Multiple statements in the if-body: analyze them and combine them
                    logging.debug(f"visit_If: Processing {len(node.body)} statements in if-body")
                    body_results = []
                    for i, stmt in enumerate(node.body):
                        stmt_result = self.visit(stmt)
                        if stmt_result is not None:
                            # Simplify: if stmt_result is a conditional with if_true=true and if_false=null/false,
                            # extract just the test condition
                            if stmt_result.get('type') == 'conditional':
                                if_true = stmt_result.get('if_true')
                                if_false = stmt_result.get('if_false')

                                # Pattern: if condition: return True (no else) -> just use condition
                                if (if_true and if_true.get('type') == 'constant' and if_true.get('value') is True and
                                    (if_false is None or (if_false.get('type') == 'constant' and if_false.get('value') is False))):
                                    logging.debug(f"visit_If: Simplifying conditional {i}: extracting test condition")
                                    body_results.append(stmt_result.get('test'))
                                else:
                                    # Keep the full conditional
                                    body_results.append(stmt_result)
                            elif isinstance(stmt, ast.Return) and stmt.value:
                                # Direct return statement
                                inner_result = self.visit(stmt.value)
                                if inner_result and inner_result.get('type') != 'constant':
                                    body_results.append(inner_result)

                    # Combine multiple conditions with OR logic
                    # If any condition is true, the whole body evaluates to true
                    if len(body_results) == 0:
                        body_result = {'type': 'constant', 'value': True}
                    elif len(body_results) == 1:
                        body_result = body_results[0]
                    else:
                        body_result = {'type': 'or', 'conditions': body_results}
                else:
                    # Single statement or multistatement processing disabled
                    body_result = self.visit(node.body[0])
            else:
                 logging.warning("visit_If: 'if' block is empty.")

            orelse_result = None
            if node.orelse:
                if should_process_multistatement and len(node.orelse) > 1:
                    # Multiple statements in the else-block
                    logging.debug(f"visit_If: Processing {len(node.orelse)} statements in else-block")
                    orelse_results = []
                    for stmt in node.orelse:
                        stmt_result = self.visit(stmt)
                        if stmt_result is not None:
                            if isinstance(stmt, ast.Return) and stmt.value:
                                inner_result = self.visit(stmt.value)
                                if inner_result and inner_result.get('type') != 'constant':
                                    orelse_results.append(inner_result)
                            elif stmt_result.get('type') == 'conditional':
                                orelse_results.append(stmt_result)

                    if len(orelse_results) == 0:
                        orelse_result = {'type': 'constant', 'value': True}
                    elif len(orelse_results) == 1:
                        orelse_result = orelse_results[0]
                    else:
                        orelse_result = {'type': 'or', 'conditions': orelse_results}
                else:
                    # Special case: If statement without else in orelse, and more statements follow
                    # This handles if-elif-else chains where elif/else are separate statements
                    if (isinstance(node.orelse[0], ast.If) and
                        not node.orelse[0].orelse and
                        len(node.orelse) > 1):
                        logging.debug(f"visit_If: If statement without else in orelse, analyzing remaining {len(node.orelse) - 1} statements as implicit else")
                        # Create a synthetic If node with the remaining statements as the else block
                        if_node = node.orelse[0]
                        remaining_stmts = node.orelse[1:]

                        # Create a synthetic if-node that includes the remaining statements as the else block
                        synthetic_if = ast.If(
                            test=if_node.test,
                            body=if_node.body,
                            orelse=remaining_stmts,
                            lineno=if_node.lineno if hasattr(if_node, 'lineno') else 0,
                            col_offset=if_node.col_offset if hasattr(if_node, 'col_offset') else 0
                        )

                        # Visit this synthetic if-statement
                        orelse_result = self.visit_If(synthetic_if)
                    else:
                        orelse_result = self.visit(node.orelse[0])
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

            # Optimize: If test is a constant, statically evaluate the conditional
            if test_result.get('type') == 'constant':
                test_value = test_result.get('value')
                logging.debug(f"visit_If: Test is constant with value: {test_value}")
                # In Python, truthiness: 0, False, None, "", [], {} are falsy
                is_truthy = bool(test_value) if test_value is not None else False
                if is_truthy:
                    logging.debug("visit_If: Test is truthy, returning if_true branch")
                    return body_result
                else:
                    logging.debug("visit_If: Test is falsy, returning if_false branch")
                    return orelse_result  # Could be None if no else block

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

            # Optimize: If test is a constant, statically evaluate the conditional
            if test_result.get('type') == 'constant':
                test_value = test_result.get('value')
                logging.debug(f"visit_IfExp: Test is constant with value: {test_value}")
                # In Python, truthiness: 0, False, None, "", [], {} are falsy
                is_truthy = bool(test_value) if test_value is not None else False
                if is_truthy:
                    logging.debug("visit_IfExp: Test is truthy, returning if_true branch")
                    return body_result
                else:
                    logging.debug("visit_IfExp: Test is falsy, returning if_false branch")
                    return orelse_result

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
            processed_result = self.binary_op_processor.try_preprocess_binary_op(left_result, op_symbol, right_result)
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

    def _substitute_variable_in_rule(self, rule: Dict[str, Any], var_name: str, value: Any) -> Optional[Dict[str, Any]]:
        """
        Recursively substitute a variable name with a concrete value in a rule structure.

        This is used to expand comprehensions where we have a target variable (e.g., 'ingredient')
        that needs to be replaced with concrete values from an iterator.

        Args:
            rule: The rule structure to substitute in
            var_name: The variable name to replace
            value: The value to substitute

        Returns:
            A new rule structure with the variable substituted, or None if substitution fails
        """
        import copy

        if not rule or not isinstance(rule, dict):
            return rule

        # Deep copy to avoid modifying the original
        result = copy.deepcopy(rule)

        def substitute_recursive(node):
            """Recursively walk and substitute in the rule structure."""
            if not isinstance(node, dict):
                return node

            node_type = node.get('type')

            # Handle 'name' type - this is where we substitute
            if node_type == 'name' and node.get('name') == var_name:
                # Replace the name reference with a constant value
                return {'type': 'constant', 'value': value}

            # Handle f_string that might reference the variable
            if node_type == 'f_string':
                # Need to process the parts
                if 'parts' in node:
                    new_parts = []
                    for part in node['parts']:
                        if isinstance(part, dict):
                            if part.get('type') == 'formatted_value':
                                # Check if the formatted value references our variable
                                val = part.get('value', {})
                                if val.get('type') == 'name' and val.get('name') == var_name:
                                    # Replace the formatted value with a constant
                                    new_parts.append({'type': 'constant', 'value': str(value)})
                                else:
                                    # Recursively substitute in the formatted value
                                    new_parts.append({**part, 'value': substitute_recursive(val)})
                            else:
                                new_parts.append(substitute_recursive(part))
                        else:
                            new_parts.append(part)

                    # Reconstruct the f_string
                    # If all parts are now constants, we can simplify to a single constant
                    if all(p.get('type') == 'constant' for p in new_parts):
                        combined_value = ''.join(str(p['value']) for p in new_parts)
                        return {'type': 'constant', 'value': combined_value}
                    else:
                        return {**node, 'parts': new_parts}

            # Recursively process nested structures
            for key, val in node.items():
                if isinstance(val, dict):
                    node[key] = substitute_recursive(val)
                elif isinstance(val, list):
                    node[key] = [substitute_recursive(item) if isinstance(item, dict) else item for item in val]

            return node

        return substitute_recursive(result)

