"""
Control flow visitor mixin for AST visitors.

This module contains visitor methods for control flow AST nodes
like modules, functions, conditionals, loops, and statements.
"""

import ast
import logging
from typing import Any, Dict, Optional
from .base import BaseVisitorMixin


class ControlFlowVisitorMixin(BaseVisitorMixin):
    """
    Mixin containing visitor methods for control flow nodes.

    These handle module, function, if/else, for, while, and statement nodes.

    Required attributes from parent class:
        - game_handler: Game-specific handler
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
            logging.error(f"Error in visit_Module: {e}")
            return None

    def visit_FunctionDef(self, node):
        try:
            logging.debug(f"\n--- Analyzing Function Definition: {node.name} ---")
            logging.debug(f"Function args: {[arg.arg for arg in node.args.args]}")

            # Detailed function body inspection
            for i, body_node in enumerate(node.body):
                logging.debug(f"Function body node {i}: {type(body_node).__name__}")

            # Skip docstrings - they are Expr nodes containing a Constant string as the first statement
            body_to_analyze = list(node.body)
            if (body_to_analyze and
                isinstance(body_to_analyze[0], ast.Expr) and
                isinstance(body_to_analyze[0].value, ast.Constant) and
                isinstance(body_to_analyze[0].value.value, str)):
                # First statement is a docstring, skip it
                logging.debug("Skipping docstring in function body")
                body_to_analyze = body_to_analyze[1:]

            if not body_to_analyze:
                logging.warning(f"visit_FunctionDef: Empty function body for '{node.name}', returning None")
                return None

            # Check if this is a simple single-return function (the common case)
            # Only use block mode if there are multiple statements or complex control flow
            needs_block_mode = self._needs_block_mode(body_to_analyze)

            if needs_block_mode:
                logging.debug(f"visit_FunctionDef: Using block mode for '{node.name}'")
                # Analyze all statements and produce a block
                statements = []
                for stmt in body_to_analyze:
                    stmt_result = self.visit_statement(stmt)
                    if stmt_result is not None:
                        statements.append(stmt_result)

                if len(statements) == 1:
                    # Single statement - don't wrap in block
                    return statements[0]
                elif statements:
                    return {
                        'type': 'block',
                        'statements': statements
                    }
                return None

            # Original simple mode: Skip variable assignments and look for control flow or return
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

    def _needs_block_mode(self, body_nodes):
        """
        Determine if a function body needs block mode (multi-statement) analysis.
        Returns True if the body contains:
        - For loops (including inside If statements)
        - Multiple assignments followed by a return (including returns inside If statements)
        - AugAssign statements (including inside If statements)
        """
        # Check for for loops recursively - they can be inside If statements' body or orelse
        def has_for_recursive(nodes):
            for node in nodes:
                if isinstance(node, ast.For):
                    return True
                if isinstance(node, ast.If):
                    if has_for_recursive(node.body):
                        return True
                    if has_for_recursive(node.orelse):
                        return True
            return False

        # Check for augmented assignments recursively
        def has_augassign_recursive(nodes):
            for node in nodes:
                if isinstance(node, ast.AugAssign):
                    return True
                if isinstance(node, ast.If):
                    if has_augassign_recursive(node.body):
                        return True
                    if has_augassign_recursive(node.orelse):
                        return True
                if isinstance(node, ast.For):
                    if has_augassign_recursive(node.body):
                        return True
            return False

        has_for = has_for_recursive(body_nodes)
        has_augassign = has_augassign_recursive(body_nodes)

        # Count assignments at the top level
        assign_count = sum(1 for n in body_nodes if isinstance(n, (ast.Assign, ast.AnnAssign)))

        # Check for return statements - both at top level and inside If statements
        def has_return_recursive(nodes):
            for node in nodes:
                if isinstance(node, ast.Return):
                    return True
                if isinstance(node, ast.If):
                    if has_return_recursive(node.body):
                        return True
                    if has_return_recursive(node.orelse):
                        return True
            return False

        has_return = has_return_recursive(body_nodes)

        # Use block mode if we have for loops, augmented assignments,
        # or any assignments before a return (need to capture variable bindings)
        if has_for or has_augassign:
            return True
        if assign_count > 0 and has_return:
            return True
        return False

    def visit_Lambda(self, node):
        try:
            logging.debug("\n--- Analyzing Lambda ---")
            param_names = [arg.arg for arg in node.args.args]
            logging.debug(f"Lambda args: {param_names}")
            logging.debug(f"Lambda body type: {type(node.body).__name__}")

            # Visit the lambda body
            body_result = self.visit(node.body)

            # Determine if this is a "rule lambda" (access rule) or a "data lambda" (for map, etc.)
            # Rule lambdas have 'state' as the first parameter and should return just the body
            # Data lambdas (used in map(), filter(), etc.) should return the full lambda structure
            # Note: Super Metroid uses 'sm' (SMSolver) instead of 'state' for its rule lambdas
            is_rule_lambda = (
                not param_names or  # No params - simple rule
                (param_names and param_names[0] in ('state', 'self', 'sm'))
            )

            if is_rule_lambda:
                # Rule lambda - return just the body (the actual rule)
                return body_result
            else:
                # Data lambda (e.g., lambda x: transform(x)) - return full structure
                return {
                    'type': 'lambda',
                    'params': param_names,
                    'body': body_result
                }
        except Exception as e:
            logging.error(f"Error in visit_Lambda: {e}")
            return None

    def visit_Return(self, node):
        try:
            logging.debug("\n--- Analyzing Return ---")
            logging.debug(f"Return value type: {type(node.value).__name__}")

            if isinstance(node.value, ast.BoolOp):
                logging.debug(f"BoolOp type: {type(node.value.op).__name__}")
                logging.debug(f"BoolOp values count: {len(node.value.values)}")

            # Visit the return value and return its result
            if node.value is None:
                return None
            return self.visit(node.value)
        except Exception as e:
            logging.error(f"Error in visit_Return: {e}")
            return None

    def visit_Break(self, node):
        """Handle break statements - used to exit loops early."""
        logging.debug("\n--- Analyzing Break ---")
        return {'type': 'break'}

    def visit_Continue(self, node):
        """Handle continue statements - skip to next iteration."""
        logging.debug("\n--- Analyzing Continue ---")
        return {'type': 'continue'}

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
                # PRIORITY: Check for "if without else followed by more statements" pattern first.
                # This handles early-return guards like:
                #   if not check1: return False
                #   if not check2: return False
                #   return actual_result
                # These should be CHAINED (nested conditionals), not ORed together.
                if (len(node.orelse) > 1 and
                    isinstance(node.orelse[0], ast.If) and
                    not node.orelse[0].orelse):
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
                elif should_process_multistatement and len(node.orelse) > 1:
                    # Multiple statements in the else-block that don't match the early-return pattern
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
            logging.error(f"Error in visit_If: {e}")
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
            logging.error(f"Error in visit_IfExp: {e}")
            return None

    def visit_For(self, node: ast.For):
        """
        Handle for loops.
        Produces a for_range rule type for range() iterations,
        or a for_iter rule type for iterating over arbitrary iterables.
        """
        try:
            logging.debug(f"\n--- visit_For ---")
            logging.debug(f"Target: {ast.dump(node.target)}")
            logging.debug(f"Iter: {ast.dump(node.iter)}")

            # Get the loop variable name(s)
            # Support both simple names and tuple unpacking (e.g., for k, v in dict.items())
            var_name = "_"
            var_names = None  # Will be set if tuple unpacking is used
            if isinstance(node.target, ast.Name):
                var_name = node.target.id
            elif isinstance(node.target, ast.Tuple):
                # Tuple unpacking: extract all variable names
                var_names = []
                for elt in node.target.elts:
                    if isinstance(elt, ast.Name):
                        var_names.append(elt.id)
                    else:
                        # Nested tuple or other complex pattern - use placeholder
                        var_names.append("_")
                logging.debug(f"visit_For: Tuple unpacking with vars: {var_names}")

            # Analyze the loop body
            body_results = []
            for stmt in node.body:
                stmt_result = self.visit_statement(stmt)
                if stmt_result is not None:
                    body_results.append(stmt_result)

            # Check if this is a range() call
            if (isinstance(node.iter, ast.Call) and
                    isinstance(node.iter.func, ast.Name) and
                    node.iter.func.id == 'range'):
                # Get the arguments for range()
                # Supports: range(stop), range(start, stop), range(start, stop, step)
                if not node.iter.args:
                    logging.error("visit_For: range() called without arguments")
                    return None

                result = {
                    'type': 'for_range',
                    'body': body_results
                }

                if len(node.iter.args) == 1:
                    # range(stop) - iterate from 0 to stop-1
                    count_arg = node.iter.args[0]
                    count_result = self.visit(count_arg)
                    if count_result is None:
                        logging.error(f"visit_For: Failed to analyze range count: {ast.dump(count_arg)}")
                        return None
                    result['count'] = count_result
                elif len(node.iter.args) >= 2:
                    # range(start, stop) or range(start, stop, step)
                    start_arg = node.iter.args[0]
                    stop_arg = node.iter.args[1]
                    start_result = self.visit(start_arg)
                    stop_result = self.visit(stop_arg)
                    if start_result is None:
                        logging.error(f"visit_For: Failed to analyze range start: {ast.dump(start_arg)}")
                        return None
                    if stop_result is None:
                        logging.error(f"visit_For: Failed to analyze range stop: {ast.dump(stop_arg)}")
                        return None
                    result['start'] = start_result
                    result['stop'] = stop_result
                    if len(node.iter.args) >= 3:
                        step_arg = node.iter.args[2]
                        step_result = self.visit(step_arg)
                        if step_result is None:
                            logging.error(f"visit_For: Failed to analyze range step: {ast.dump(step_arg)}")
                            return None
                        result['step'] = step_result

                # Use 'vars' for tuple unpacking, 'var' for simple variable
                if var_names is not None:
                    result['vars'] = var_names
                else:
                    result['var'] = var_name
                return result
            else:
                # Handle iteration over arbitrary iterables (for_iter)
                iterable_result = self.visit(node.iter)
                if iterable_result is None:
                    logging.error(f"visit_For: Failed to analyze iterable: {ast.dump(node.iter)}")
                    return None

                logging.debug(f"visit_For: Creating for_iter with iterable: {iterable_result}")
                result = {
                    'type': 'for_iter',
                    'iterable': iterable_result,
                    'body': body_results
                }
                # Use 'vars' for tuple unpacking, 'var' for simple variable
                if var_names is not None:
                    result['vars'] = var_names
                else:
                    result['var'] = var_name
                return result
        except Exception as e:
            logging.error(f"Error in visit_For: {e}")
            return None

    def visit_While(self, node: ast.While):
        """
        Handle while loops.
        Produces a while_loop rule type with condition and body.
        """
        try:
            logging.debug(f"\n--- visit_While ---")
            logging.debug(f"Test: {ast.dump(node.test)}")

            # Analyze the condition
            condition_result = self.visit(node.test)
            if condition_result is None:
                logging.error(f"visit_While: Failed to analyze condition: {ast.dump(node.test)}")
                return None

            # Analyze the loop body
            body_results = []
            for stmt in node.body:
                stmt_result = self.visit_statement(stmt)
                if stmt_result is not None:
                    body_results.append(stmt_result)

            # Handle else clause if present (rarely used)
            orelse_results = []
            if node.orelse:
                for stmt in node.orelse:
                    stmt_result = self.visit_statement(stmt)
                    if stmt_result is not None:
                        orelse_results.append(stmt_result)

            result = {
                'type': 'while_loop',
                'condition': condition_result,
                'body': body_results
            }

            if orelse_results:
                result['orelse'] = orelse_results

            logging.debug(f"visit_While: Created while_loop rule: {result}")
            return result
        except Exception as e:
            logging.error(f"Error in visit_While: {e}")
            return None

    def visit_AugAssign(self, node: ast.AugAssign):
        """
        Handle augmented assignment statements (+=, -=, *=, /=).
        Produces an assign rule type with an op field.
        """
        try:
            logging.debug(f"\n--- visit_AugAssign ---")
            logging.debug(f"Target: {ast.dump(node.target)}")
            logging.debug(f"Op: {type(node.op).__name__}")
            logging.debug(f"Value: {ast.dump(node.value)}")

            if not isinstance(node.target, ast.Name):
                logging.warning(f"visit_AugAssign: Only simple name targets supported, got: {ast.dump(node.target)}")
                return None

            var_name = node.target.id

            # Map AST operators to symbols
            op_map = {
                'Add': '+=', 'Sub': '-=',
                'Mult': '*=', 'Div': '/=',
                'FloorDiv': '//=', 'Mod': '%='
            }
            op_name = type(node.op).__name__
            op_symbol = op_map.get(op_name, '+=')

            value_result = self.visit(node.value)
            if value_result is None:
                logging.error(f"visit_AugAssign: Failed to analyze value: {ast.dump(node.value)}")
                return None

            return {
                'type': 'assign',
                'name': var_name,
                'op': op_symbol,
                'value': value_result
            }
        except Exception as e:
            logging.error(f"Error in visit_AugAssign: {e}")
            return None

    def visit_statement(self, node):
        """
        Handle a statement node and return its rule representation.
        This is used for multi-statement function bodies.
        """
        try:
            logging.debug(f"\n--- visit_statement: {type(node).__name__} ---")

            if isinstance(node, ast.Return):
                # Return statement - wrap the value in a return type
                value_result = self.visit(node.value) if node.value else {'type': 'constant', 'value': None}
                return {
                    'type': 'return',
                    'value': value_result
                }
            elif isinstance(node, ast.Assign):
                # Simple assignment
                if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                    var_name = node.targets[0].id
                    value_result = self.visit(node.value)
                    if value_result is not None:
                        return {
                            'type': 'assign',
                            'name': var_name,
                            'value': value_result
                        }
                # Tuple unpacking assignment (e.g., a, b = func())
                elif len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple):
                    target_names = []
                    for elt in node.targets[0].elts:
                        if isinstance(elt, ast.Name):
                            target_names.append(elt.id)
                        else:
                            # Complex target element - skip this assignment
                            logging.warning(f"visit_statement: Complex tuple unpacking target: {ast.dump(elt)}")
                            return None
                    value_result = self.visit(node.value)
                    if value_result is not None:
                        return {
                            'type': 'tuple_assign',
                            'targets': target_names,
                            'value': value_result
                        }
                return None
            elif isinstance(node, ast.AugAssign):
                return self.visit_AugAssign(node)
            elif isinstance(node, ast.For):
                return self.visit_For(node)
            elif isinstance(node, ast.While):
                return self.visit_While(node)
            elif isinstance(node, ast.If):
                # Check if this is an if/elif/else that assigns to a single variable
                assign_result = self._try_convert_if_to_assign(node)
                if assign_result is not None:
                    return assign_result
                # Use statement-based if handling for imperative contexts
                return self._visit_If_statement(node)
            elif isinstance(node, ast.Expr):
                # Expression statement - just evaluate it
                return self.visit(node.value)
            elif isinstance(node, ast.Break):
                # Break statement - used to exit loops early
                return {'type': 'break'}
            elif isinstance(node, ast.Continue):
                # Continue statement - skip to next iteration
                return {'type': 'continue'}
            elif isinstance(node, ast.Pass):
                # Pass statement - explicit no-op, safe to ignore
                return None
            elif isinstance(node, ast.AnnAssign):
                # Annotated assignment (e.g., x: int = 5)
                if isinstance(node.target, ast.Name):
                    var_name = node.target.id
                    if node.value is not None:
                        value_result = self.visit(node.value)
                        if value_result is not None:
                            return {
                                'type': 'assign',
                                'name': var_name,
                                'value': value_result
                            }
                # If no value or failed to analyze, just ignore (type annotation only)
                return None
            else:
                logging.warning(f"visit_statement: Unsupported statement type: {type(node).__name__}")
                return None
        except Exception as e:
            logging.error(f"Error in visit_statement: {e}")
            return None

    def _visit_If_statement(self, node: ast.If) -> Optional[Dict[str, Any]]:
        """
        Handle If statements in imperative/statement context.
        Produces an if_statement rule type that can contain break/continue/return.
        """
        try:
            logging.debug(f"\n--- _visit_If_statement ---")
            test_result = self.visit(node.test)
            if test_result is None:
                logging.error(f"_visit_If_statement: Failed to analyze test: {ast.dump(node.test)}")
                return None

            # Analyze the if-body as statements
            body_results = []
            for stmt in node.body:
                stmt_result = self.visit_statement(stmt)
                if stmt_result is not None:
                    body_results.append(stmt_result)

            # Analyze the else-body as statements (if present)
            orelse_results = []
            if node.orelse:
                for stmt in node.orelse:
                    stmt_result = self.visit_statement(stmt)
                    if stmt_result is not None:
                        orelse_results.append(stmt_result)

            result = {
                'type': 'if_statement',
                'test': test_result,
                'body': body_results
            }

            if orelse_results:
                result['orelse'] = orelse_results

            return result
        except Exception as e:
            logging.error(f"Error in _visit_If_statement: {e}")
            return None

    def _try_convert_if_to_assign(self, node: ast.If) -> Optional[Dict[str, Any]]:
        """
        Try to convert an If statement that assigns to a single variable in all branches
        into an assign statement with a conditional value.

        Pattern: if cond: var = val1; elif cond2: var = val2; ...
        Also handles nested: if cond: if cond2: var = val1; ...

        Converts to: {"type": "assign", "name": "var", "value": {"type": "conditional", ...}}

        Returns None if the pattern doesn't match.
        """
        def get_assign_target(body):
            """Get the variable name if the body is a single assignment, None otherwise."""
            if len(body) == 1 and isinstance(body[0], ast.Assign):
                if len(body[0].targets) == 1 and isinstance(body[0].targets[0], ast.Name):
                    return body[0].targets[0].id
            return None

        def get_nested_assign_target(body):
            """Get the variable name, handling both direct assignments and nested If assignments."""
            # First try direct assignment
            target = get_assign_target(body)
            if target is not None:
                return target
            # Check if body is a single If statement that assigns to a variable
            if len(body) == 1 and isinstance(body[0], ast.If):
                return get_nested_assign_target(body[0].body)
            return None

        def get_assign_value_ast(body):
            """Get the assignment value AST node if the body is a single assignment."""
            if len(body) == 1 and isinstance(body[0], ast.Assign):
                return body[0].value
            return None

        def build_conditional_value(if_node, expected_var):
            """
            Recursively build a conditional rule for the value of an if/elif/else chain.
            Returns (conditional_rule, success) where success indicates all branches match.
            """
            # Check if body directly assigns to expected_var
            body_var = get_assign_target(if_node.body)

            # Visit the test condition
            test_result = self.visit(if_node.test)
            if test_result is None:
                return None, False

            if body_var == expected_var:
                # Direct assignment in body
                body_value_ast = get_assign_value_ast(if_node.body)
                if body_value_ast is None:
                    return None, False
                if_true_result = self.visit(body_value_ast)
                if if_true_result is None:
                    return None, False
            elif len(if_node.body) == 1 and isinstance(if_node.body[0], ast.If):
                # Nested If statement - recursively process it
                nested_if = if_node.body[0]
                nested_var = get_nested_assign_target(nested_if.body)
                if nested_var != expected_var:
                    return None, False
                if_true_result, success = build_conditional_value(nested_if, expected_var)
                if not success:
                    return None, False
            else:
                return None, False

            # Handle orelse (else or elif)
            if_false_result = None
            if if_node.orelse:
                if len(if_node.orelse) == 1 and isinstance(if_node.orelse[0], ast.If):
                    # This is an elif - recursively process
                    if_false_result, success = build_conditional_value(if_node.orelse[0], expected_var)
                    if not success:
                        return None, False
                elif len(if_node.orelse) == 1 and isinstance(if_node.orelse[0], ast.Assign):
                    # This is a simple else assignment
                    else_var = get_assign_target(if_node.orelse)
                    if else_var != expected_var:
                        return None, False
                    else_value_ast = get_assign_value_ast(if_node.orelse)
                    if else_value_ast is None:
                        return None, False
                    if_false_result = self.visit(else_value_ast)
                    if if_false_result is None:
                        return None, False
                else:
                    # Complex else branch - don't convert
                    return None, False
            else:
                # No else branch - use the variable's current value
                if_false_result = {'type': 'name', 'name': expected_var}

            return {
                'type': 'conditional',
                'test': test_result,
                'if_true': if_true_result,
                'if_false': if_false_result
            }, True

        # Check if the if-body assigns to a variable (directly or via nested if)
        target_var = get_nested_assign_target(node.body)
        if target_var is None:
            return None

        # Try to build the conditional value
        conditional_value, success = build_conditional_value(node, target_var)
        if not success:
            return None

        logging.debug(f"_try_convert_if_to_assign: Converted if-assign chain for variable '{target_var}'")
        return {
            'type': 'assign',
            'name': target_var,
            'value': conditional_value
        }
