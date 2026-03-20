"""
Data structure visitor mixin for AST visitors.

This module contains visitor methods for data structure AST nodes
like tuples, lists, sets, and dictionaries.
"""

import ast
import logging
from typing import Any, Dict
from .base import BaseVisitorMixin


class DataStructureVisitorMixin(BaseVisitorMixin):
    """
    Mixin containing visitor methods for data structure nodes.

    These handle literal tuples, lists, sets, and dictionaries in the AST.
    """

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

            # Preserve tuple type for correct Python semantics (tuple != list)
            return {'type': 'tuple', 'elements': elements}
        except Exception as e:
            logging.error(f"Error in visit_Tuple: {e}")
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
            logging.error(f"Error in visit_List: {e}")
            return None

    def visit_Set(self, node: ast.Set):
        """ Handle set literals like {item1, item2} or {single_item}.

        Returns a 'set_literal' type that the rule engine can handle for
        mutation operations like .add() and eventual use in has_any().
        """
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

            # Represent as a set type in the output JSON
            # This is used for set literals like {item1, item2} and helps track
            # that this originated from a Python set (e.g., for has_any checks)
            return {'type': 'set', 'elements': elements}
        except Exception as e:
            logging.error(f"Error in visit_Set: {e}")
            return None

    def visit_Dict(self, node: ast.Dict):
        """ Handle dictionary literals. """
        try:
            logging.debug(f"\n--- visit_Dict ---")
            dict_data = {}
            for key_node, value_node in zip(node.keys, node.values):
                # Handle None key (dict unpacking like **kwargs) - skip for now
                if key_node is None:
                    logging.warning("Skipping dict unpacking in visit_Dict")
                    continue

                key_result = self.visit(key_node)
                if key_result is None:
                    logging.error(f"Failed to analyze key in Dict: {ast.dump(key_node)}")
                    return None

                value_result = self.visit(value_node)
                if value_result is None:
                    logging.error(f"Failed to analyze value in Dict: {ast.dump(value_node)}")
                    return None

                # Extract the key value if it's a constant
                if key_result.get('type') == 'constant':
                    key = key_result['value']
                else:
                    # For non-constant keys, use the string representation
                    key = str(key_result)

                # For constant values, extract the value; otherwise keep the structure
                if value_result.get('type') == 'constant':
                    dict_data[key] = value_result['value']
                elif value_result.get('type') == 'list':
                    # Extract plain list if all elements are constants (or list is empty)
                    elements = value_result.get('value', [])
                    plain_elements = []
                    all_constant = True
                    for elem in elements:
                        if isinstance(elem, dict) and elem.get('type') == 'constant':
                            plain_elements.append(elem['value'])
                        elif not isinstance(elem, dict):
                            plain_elements.append(elem)
                        else:
                            all_constant = False
                            break
                    if all_constant:
                        dict_data[key] = plain_elements
                    else:
                        dict_data[key] = value_result
                else:
                    dict_data[key] = value_result

            # Return dict as a constant with dict value for JSON serialization
            return {'type': 'constant', 'value': dict_data}
        except Exception as e:
            logging.error(f"Error in visit_Dict: {e}")
            return None
