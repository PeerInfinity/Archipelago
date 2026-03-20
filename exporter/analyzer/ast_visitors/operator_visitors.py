"""
Operator visitor mixin for AST visitors.

This module contains visitor methods for operator AST nodes
like unary operations, comparisons, and binary operations.
"""

import ast
import logging
from typing import Any, Dict, Optional

from ..utils import is_simple_value, make_json_serializable
from .base import BaseVisitorMixin


class OperatorVisitorMixin(BaseVisitorMixin):
    """
    Mixin containing visitor methods for operator nodes.

    Required attributes from parent class:
        - expression_resolver: ExpressionResolver instance
        - binary_op_processor: BinaryOpProcessor instance
    """

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
            elif isinstance(node.op, ast.USub):
                # Unary minus (e.g., -1, -x)
                if operand_result.get('type') == 'constant':
                    constant_value = operand_result['value']
                    if isinstance(constant_value, (int, float)):
                        result_value = -constant_value
                        logging.debug(f"Evaluated -{constant_value} = {result_value}")
                        return {'type': 'constant', 'value': result_value}
                # For non-constant operands, return a negation structure
                return {'type': 'negate', 'operand': operand_result}
            elif isinstance(node.op, ast.UAdd):
                # Unary plus (e.g., +1, +x) - essentially a no-op for constants
                if operand_result.get('type') == 'constant':
                    constant_value = operand_result['value']
                    if isinstance(constant_value, (int, float)):
                        logging.debug(f"Evaluated +{constant_value} = {constant_value}")
                        return {'type': 'constant', 'value': constant_value}
                # For non-constant operands, just return the operand as-is
                return operand_result
            else:
                logging.error(f"Unhandled unary operator: {op_name}")
                return None # Or a generic representation

        except Exception as e:
            logging.error(f"Error in visit_UnaryOp: {e}")
            return None

    def visit_Compare(self, node: ast.Compare):
        """ Handle comparison operations (e.g., ==, !=, in, not in, is, is not). """
        try:
            logging.debug(f"\n--- visit_Compare ---")

            # Handle chained comparisons like a < b < c => (a < b) and (b < c)
            if len(node.ops) > 1:
                logging.debug(f"Expanding chained comparison with {len(node.ops)} operators")
                conditions = []
                # Build list of all values: [left, comparator1, comparator2, ...]
                all_values = [node.left] + list(node.comparators)

                for i, op in enumerate(node.ops):
                    left_val = all_values[i]
                    right_val = all_values[i + 1]

                    left_result = self.visit(left_val)
                    right_result = self.visit(right_val)

                    if left_result is None or right_result is None:
                        logging.error(f"Failed to analyze part of chained comparison")
                        return None

                    op_name = type(op).__name__.lower()
                    op_map = {
                        'eq': '==', 'noteq': '!=',
                        'lt': '<', 'lte': '<=',
                        'gt': '>', 'gte': '>=',
                        'is': 'is', 'isnot': 'is not',
                        'in': 'in', 'notin': 'not in'
                    }
                    op_symbol = op_map.get(op_name, op_name)

                    # Try constant folding for this part
                    folded_result = self._try_fold_comparison(left_result, op_symbol, right_result)
                    if folded_result is not None:
                        conditions.append(folded_result)
                    else:
                        conditions.append({
                            'type': 'compare',
                            'left': left_result,
                            'op': op_symbol,
                            'right': right_result
                        })

                # Combine with 'and'
                if len(conditions) == 1:
                    return conditions[0]
                else:
                    return {'type': 'and', 'conditions': conditions}

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

            # Try to resolve NamedTuple closure variables for comparison folding
            # This handles patterns like: if planet == Planets.TABORA:
            # where planet is a closure variable containing a NamedTuple
            left_result, right_result = self._try_resolve_namedtuple_for_comparison(
                left_result, right_result, node.left, node.comparators[0]
            )

            # Try constant folding - if both sides are constants, evaluate at export time
            folded_result = self._try_fold_comparison(left_result, op_symbol, right_result)
            if folded_result is not None:
                return folded_result

            return {
                'type': 'compare',
                'left': left_result,
                'op': op_symbol,
                'right': right_result
            }

        except Exception as e:
            logging.error(f"Error in visit_Compare: {e}")
            return None

    def _try_fold_comparison(self, left_result, op_symbol, right_result):
        """
        Try to fold a comparison at export time if both sides are constants.

        This handles cases like `early_useful == OPTIONS.buildings_3` where both
        values are known closure variables that can be resolved at export time.

        Args:
            left_result: The left operand result dict
            op_symbol: The comparison operator ('==', '!=', '<', '>', etc.)
            right_result: The right operand result dict

        Returns:
            A constant result dict if folding succeeded, None otherwise
        """
        try:
            # Check if both sides are constants
            if not (left_result and left_result.get('type') == 'constant' and
                    right_result and right_result.get('type') == 'constant'):
                return None

            left_val = left_result.get('value')
            right_val = right_result.get('value')

            # Evaluate the comparison based on the operator
            result = None
            if op_symbol == '==':
                result = left_val == right_val
            elif op_symbol == '!=':
                result = left_val != right_val
            elif op_symbol == '<':
                result = left_val < right_val
            elif op_symbol == '<=':
                result = left_val <= right_val
            elif op_symbol == '>':
                result = left_val > right_val
            elif op_symbol == '>=':
                result = left_val >= right_val
            elif op_symbol == 'in':
                # For 'in' operator, right side should be a collection
                if isinstance(right_val, (list, tuple, set, str)):
                    result = left_val in right_val
            elif op_symbol == 'not in':
                if isinstance(right_val, (list, tuple, set, str)):
                    result = left_val not in right_val
            elif op_symbol == 'is':
                result = left_val is right_val
            elif op_symbol == 'is not':
                result = left_val is not right_val

            if result is not None:
                logging.debug(f"Folded comparison: {left_val!r} {op_symbol} {right_val!r} = {result}")
                return {'type': 'constant', 'value': result}

            return None

        except (TypeError, ValueError) as e:
            # Comparison not possible (e.g., comparing incompatible types)
            logging.debug(f"Could not fold comparison: {e}")
            return None
        except Exception as e:
            logging.warning(f"Error during comparison folding: {e}")
            return None

    def _try_resolve_namedtuple_for_comparison(self, left_result, right_result, left_node, right_node):
        """
        Try to resolve NamedTuple closure variables to constants for comparison folding.

        This handles patterns like `if planet == Planets.TABORA:` where:
        - planet is a closure variable containing a NamedTuple (PlanetData)
        - Planets.TABORA is an attribute access to another NamedTuple

        NamedTuples are normally kept as name references in visit_Name to allow
        attribute access (e.g., planet.name). But for equality comparisons, we need
        to resolve them to comparable values.

        Args:
            left_result: The analyzed left operand
            right_result: The analyzed right operand
            left_node: The AST node for the left operand
            right_node: The AST node for the right operand

        Returns:
            Tuple of (resolved_left, resolved_right) where NamedTuples have been
            converted to constant values for comparison.
        """
        try:
            # Check if left side is a name reference to a NamedTuple closure variable
            if (left_result and left_result.get('type') == 'name' and
                    hasattr(self, 'closure_vars')):
                name = left_result.get('name')
                if name and name in self.closure_vars:
                    value = self.closure_vars[name]
                    if hasattr(value, '_fields'):
                        # It's a NamedTuple - convert to tuple for comparison
                        tuple_value = tuple(value)
                        logging.debug(f"Resolved NamedTuple '{name}' to tuple for comparison: {tuple_value[:2]}...")
                        left_result = {'type': 'constant', 'value': tuple_value}

            # Check if right side is a name reference to a NamedTuple closure variable
            if (right_result and right_result.get('type') == 'name' and
                    hasattr(self, 'closure_vars')):
                name = right_result.get('name')
                if name and name in self.closure_vars:
                    value = self.closure_vars[name]
                    if hasattr(value, '_fields'):
                        tuple_value = tuple(value)
                        logging.debug(f"Resolved NamedTuple '{name}' to tuple for comparison: {tuple_value[:2]}...")
                        right_result = {'type': 'constant', 'value': tuple_value}

            # Check if right side is an attribute access that resolves to a NamedTuple
            # This handles Planets.TABORA where Planets is a module and TABORA is a NamedTuple
            if (right_result and right_result.get('type') == 'attribute' and
                    hasattr(self, 'expression_resolver')):
                resolved = self.expression_resolver.resolve_expression(right_result)
                if resolved is not None and hasattr(resolved, '_fields'):
                    tuple_value = tuple(resolved)
                    logging.debug(f"Resolved attribute to NamedTuple for comparison: {tuple_value[:2]}...")
                    right_result = {'type': 'constant', 'value': tuple_value}

            # Also check left side for attribute access (less common but possible)
            if (left_result and left_result.get('type') == 'attribute' and
                    hasattr(self, 'expression_resolver')):
                resolved = self.expression_resolver.resolve_expression(left_result)
                if resolved is not None and hasattr(resolved, '_fields'):
                    tuple_value = tuple(resolved)
                    logging.debug(f"Resolved attribute to NamedTuple for comparison: {tuple_value[:2]}...")
                    left_result = {'type': 'constant', 'value': tuple_value}

            return left_result, right_result

        except Exception as e:
            logging.debug(f"Could not resolve NamedTuple for comparison: {e}")
            return left_result, right_result

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
            logging.error(f"Error in visit_BinOp: {e}")
            return None
