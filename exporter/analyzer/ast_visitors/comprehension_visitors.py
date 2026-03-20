"""
Comprehension visitor mixin for AST visitors.

This module contains visitor methods for comprehension and generator AST nodes,
plus utility methods for converting generator expressions to all_of/any_of rules.
"""

import ast
import copy
import logging
from typing import Any, Dict, Optional
from .base import BaseVisitorMixin


class ComprehensionVisitorMixin(BaseVisitorMixin):
    """
    Mixin containing visitor methods for comprehension and generator nodes.

    Also includes utility methods for converting generator expressions
    to all_of/any_of rule structures.
    """

    def visit_GeneratorExp(self, node: ast.GeneratorExp):
        """ Handle generator expressions, including nested comprehensions.

        For nested comprehensions like:
            f(x, y) for x in A for y in B[x]

        This is semantically equivalent to:
            (f(x, y) for y in B[x]) for x in A

        We transform this into nested generator_expression structures where
        the inner generators become the element of outer generators.
        """
        try:
            logging.debug(f"\n--- visit_GeneratorExp --- (generators: {len(node.generators)})")

            # Analyze the element expression
            elt_result = self.visit(node.elt)
            if elt_result is None:
                logging.error(f"Failed to analyze element expression in GeneratorExp: {ast.dump(node.elt)}")
                return None

            # Handle single generator (simple case)
            if len(node.generators) == 1:
                comprehension_result = self.visit(node.generators[0])
                if comprehension_result is None:
                    logging.error(f"Failed to analyze comprehension in GeneratorExp")
                    return None

                return {
                    'type': 'generator_expression',
                    'element': elt_result,
                    'comprehension': comprehension_result
                }

            # Handle multiple generators (nested comprehensions)
            # Process from innermost (last) to outermost (first)
            # e.g., for "f(x,y) for x in A for y in B[x]":
            #   - Start with innermost: element=f(x,y), comprehension=for y in B[x]
            #   - Wrap with outer: element=inner_gen_exp, comprehension=for x in A
            logging.debug(f"Processing nested comprehension with {len(node.generators)} generators")

            # Analyze all comprehension generators first
            comprehension_results = []
            for i, gen in enumerate(node.generators):
                comp_result = self.visit(gen)
                if comp_result is None:
                    logging.error(f"Failed to analyze comprehension {i} in nested GeneratorExp")
                    return None
                comprehension_results.append(comp_result)
                logging.debug(f"  Generator {i}: target={comp_result.get('target')}, iterator type={comp_result.get('iterator', {}).get('type')}")

            # Build nested structure from inside out
            # Start with the innermost generator and the original element
            current_element = elt_result

            # Process generators in reverse order (innermost first)
            for i in range(len(comprehension_results) - 1, -1, -1):
                current_element = {
                    'type': 'generator_expression',
                    'element': current_element,
                    'comprehension': comprehension_results[i]
                }
                logging.debug(f"  Built nested level {len(comprehension_results) - i}: comprehension target={comprehension_results[i].get('target')}")

            # The outermost wrapper is our final result
            # But we need to unwrap one level since the loop creates one extra wrapper
            # Actually, let me reconsider - we want the structure to be:
            # gen_exp(element=gen_exp(element=f(x,y), comp=for y in B[x]), comp=for x in A)

            # The current_element after the loop IS the correctly nested structure
            logging.debug(f"Nested GeneratorExp complete: {len(node.generators)} levels")
            return current_element

        except Exception as e:
            logging.error(f"Error in visit_GeneratorExp: {e}")
            return None

    def visit_ListComp(self, node: ast.ListComp):
        """ Handle list comprehensions like [expr for x in items].

        List comprehensions are treated similarly to generator expressions
        for the purposes of analysis and can be used with sum(), all(), any(), etc.
        """
        try:
            logging.debug(f"\n--- visit_ListComp --- (generators: {len(node.generators)})")

            # Analyze the element expression
            elt_result = self.visit(node.elt)
            if elt_result is None:
                logging.error(f"Failed to analyze element expression in ListComp: {ast.dump(node.elt)}")
                return None

            # Handle single generator (simple case)
            if len(node.generators) == 1:
                comprehension_result = self.visit(node.generators[0])
                if comprehension_result is None:
                    logging.error(f"Failed to analyze comprehension in ListComp")
                    return None

                # Return as generator_expression type - for sum()/all()/any() handling,
                # list comprehensions and generator expressions are semantically equivalent
                return {
                    'type': 'generator_expression',
                    'element': elt_result,
                    'comprehension': comprehension_result
                }

            # Handle multiple generators (nested comprehensions)
            logging.debug(f"Processing nested list comprehension with {len(node.generators)} generators")

            # Analyze all comprehension generators first
            comprehension_results = []
            for i, gen in enumerate(node.generators):
                comp_result = self.visit(gen)
                if comp_result is None:
                    logging.error(f"Failed to analyze comprehension {i} in nested ListComp")
                    return None
                comprehension_results.append(comp_result)
                logging.debug(f"  Generator {i}: target={comp_result.get('target')}, iterator type={comp_result.get('iterator', {}).get('type')}")

            # Build nested structure from inside out
            current_element = elt_result

            # Process generators in reverse order (innermost first)
            for i in range(len(comprehension_results) - 1, -1, -1):
                current_element = {
                    'type': 'generator_expression',
                    'element': current_element,
                    'comprehension': comprehension_results[i]
                }

            logging.debug(f"Nested ListComp complete: {len(node.generators)} levels")
            return current_element

        except Exception as e:
            logging.error(f"Error in visit_ListComp: {e}")
            return None

    def visit_SetComp(self, node: ast.SetComp):
        """ Handle set comprehensions like {expr for x in items}.

        Set comprehensions are treated similarly to list/generator expressions
        for the purposes of analysis. They can be used with len(), etc.

        For expressions like {sprites[i]["sprite"] == "Claw Grabber" for i in (17, 18, 25)},
        we analyze them as set_comprehension type which can be processed by len() handlers.
        """
        try:
            logging.debug(f"\n--- visit_SetComp --- (generators: {len(node.generators)})")

            # Analyze the element expression
            elt_result = self.visit(node.elt)
            if elt_result is None:
                logging.error(f"Failed to analyze element expression in SetComp: {ast.dump(node.elt)}")
                return None

            # Handle single generator (simple case)
            if len(node.generators) == 1:
                comprehension_result = self.visit(node.generators[0])
                if comprehension_result is None:
                    logging.error(f"Failed to analyze comprehension in SetComp")
                    return None

                # Return as set_comprehension type - includes element and iterator info
                # This allows len() handlers to potentially expand and evaluate the set
                return {
                    'type': 'set_comprehension',
                    'element': elt_result,
                    'comprehension': comprehension_result
                }

            # Handle multiple generators (nested comprehensions)
            logging.debug(f"Processing nested set comprehension with {len(node.generators)} generators")

            # Analyze all comprehension generators first
            comprehension_results = []
            for i, gen in enumerate(node.generators):
                comp_result = self.visit(gen)
                if comp_result is None:
                    logging.error(f"Failed to analyze comprehension {i} in nested SetComp")
                    return None
                comprehension_results.append(comp_result)
                logging.debug(f"  Generator {i}: target={comp_result.get('target')}, iterator type={comp_result.get('iterator', {}).get('type')}")

            # Build nested structure from inside out
            current_element = elt_result

            # Process generators in reverse order (innermost first)
            for i in range(len(comprehension_results) - 1, -1, -1):
                current_element = {
                    'type': 'set_comprehension',
                    'element': current_element,
                    'comprehension': comprehension_results[i]
                }

            logging.debug(f"Nested SetComp complete: {len(node.generators)} levels")
            return current_element

        except Exception as e:
            logging.error(f"Error in visit_SetComp: {e}")
            return None

    def visit_comprehension(self, node: ast.comprehension):
        """ Handle the 'for target in iter [if condition]' part of comprehensions/generators. """
        try:
            logging.debug(f"\n--- visit_comprehension ---")
            target_result = self.visit(node.target)
            iter_result = self.visit(node.iter)

            if target_result is None or iter_result is None:
                 logging.error(f"Failed to analyze target or iterator in comprehension")
                 return None

            # Handle if conditions (e.g., for x in y if z)
            conditions = []
            if node.ifs:
                for if_node in node.ifs:
                    condition_result = self.visit(if_node)
                    if condition_result is None:
                        logging.error(f"Failed to analyze if condition in comprehension: {ast.dump(if_node)}")
                        return None
                    conditions.append(condition_result)
                logging.debug(f"visit_comprehension: Found {len(conditions)} if condition(s)")

            # Return details needed to understand the iteration
            result = {
                'type': 'comprehension_details',
                'target': target_result,
                'iterator': iter_result
            }
            if conditions:
                # If there's a single condition, use it directly; otherwise combine with 'and'
                if len(conditions) == 1:
                    result['condition'] = conditions[0]
                else:
                    result['condition'] = {'type': 'and', 'conditions': conditions}
            return result
        except Exception as e:
            logging.error(f"Error in visit_comprehension: {e}")
            return None

    def _convert_generator_exp_to_all_of(self, gen_exp: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a generator_expression to an all_of rule structure.

        This is used to handle nested comprehensions like:
            all(f(x, y) for x in A for y in B[x])

        Which becomes nested all_of structures:
            all_of(element=all_of(element=f(x,y), iterator=B[x]), iterator=A)

        Args:
            gen_exp: A generator_expression rule structure

        Returns:
            An all_of rule structure
        """
        if gen_exp.get('type') != 'generator_expression':
            logging.warning(f"_convert_generator_exp_to_all_of: Expected generator_expression, got {gen_exp.get('type')}")
            return gen_exp

        element_rule = gen_exp.get('element')
        comprehension = gen_exp.get('comprehension')

        # Recursively convert nested generator_expressions
        if element_rule and element_rule.get('type') == 'generator_expression':
            element_rule = self._convert_generator_exp_to_all_of(element_rule)
            logging.debug(f"_convert_generator_exp_to_all_of: Recursively converted nested generator_expression")

        result = {
            'type': 'all_of',
            'element_rule': element_rule,
            'iterator_info': comprehension
        }
        logging.debug(f"_convert_generator_exp_to_all_of: Created all_of with iterator target={comprehension.get('target') if comprehension is not None else None}")
        return result

    def _convert_generator_exp_to_any_of(self, gen_exp: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a generator_expression to an any_of rule structure.

        This is used to handle nested comprehensions like:
            any(f(x, y) for x in A for y in B[x])

        Which becomes nested any_of structures:
            any_of(element=any_of(element=f(x,y), iterator=B[x]), iterator=A)

        Args:
            gen_exp: A generator_expression rule structure

        Returns:
            An any_of rule structure
        """
        if gen_exp.get('type') != 'generator_expression':
            logging.warning(f"_convert_generator_exp_to_any_of: Expected generator_expression, got {gen_exp.get('type')}")
            return gen_exp

        element_rule = gen_exp.get('element')
        comprehension = gen_exp.get('comprehension')

        # Recursively convert nested generator_expressions
        if element_rule and element_rule.get('type') == 'generator_expression':
            element_rule = self._convert_generator_exp_to_any_of(element_rule)
            logging.debug(f"_convert_generator_exp_to_any_of: Recursively converted nested generator_expression")

        result = {
            'type': 'any_of',
            'element_rule': element_rule,
            'iterator_info': comprehension
        }
        logging.debug(f"_convert_generator_exp_to_any_of: Created any_of with iterator target={comprehension.get('target') if comprehension is not None else None}")
        return result

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
        if not rule or not isinstance(rule, dict):
            return rule

        # Deep copy to avoid modifying the original
        result = copy.deepcopy(rule)

        def substitute_recursive(node):
            """Recursively walk and substitute in the rule structure."""
            if not isinstance(node, dict):
                return node

            node_type = node.get('type')

            # Handle 'attribute' type - resolve attribute access on substituted variable
            # This handles patterns like technology.name where technology is our variable
            if node_type == 'attribute':
                obj = node.get('object', {})
                attr_name = node.get('attr')
                # Check if the object is our variable being substituted
                if obj.get('type') == 'name' and obj.get('name') == var_name and attr_name:
                    # Try to resolve the attribute on the value
                    try:
                        attr_value = getattr(value, attr_name, None)
                        if attr_value is not None:
                            # Successfully resolved - return as constant
                            if isinstance(attr_value, (str, int, float, bool)):
                                return {'type': 'constant', 'value': attr_value}
                            elif hasattr(attr_value, 'name'):
                                # Object with name attribute (like Technology)
                                return {'type': 'constant', 'value': attr_value.name}
                            else:
                                return {'type': 'constant', 'value': str(attr_value)}
                    except (AttributeError, TypeError):
                        pass
                    # If attribute not found but value has a 'name' attribute and we're accessing 'name',
                    # this is the common pattern for Technology objects
                    if attr_name == 'name' and hasattr(value, 'name'):
                        return {'type': 'constant', 'value': value.name}
                    # Fallback: if value is a string and we're accessing 'name', just use the string
                    # (handles cases where Technology was already serialized to string)
                    if attr_name == 'name' and isinstance(value, str):
                        return {'type': 'constant', 'value': value}

            # Handle 'name' type - this is where we substitute
            if node_type == 'name' and node.get('name') == var_name:
                # Replace the name reference with a constant value
                # For Location/Region/Entrance objects, extract the name and preserve type info
                if hasattr(value, 'parent_region') and not hasattr(value, 'entrances'):
                    # This is a Location object - store with type marker
                    return {'type': 'constant', 'value': value.name if hasattr(value, 'name') else str(value), '_object_type': 'Location'}
                elif hasattr(value, 'entrances'):
                    # This is a Region object - store with type marker
                    return {'type': 'constant', 'value': value.name if hasattr(value, 'name') else str(value), '_object_type': 'Region'}
                elif hasattr(value, 'connected_region') and hasattr(value, 'parent_region'):
                    # This is an Entrance object - store with type marker
                    return {'type': 'constant', 'value': value.name if hasattr(value, 'name') else str(value), '_object_type': 'Entrance'}
                else:
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
