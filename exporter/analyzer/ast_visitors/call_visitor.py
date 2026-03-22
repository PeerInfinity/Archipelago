"""
Call visitor mixin for AST visitors.

This module contains the visit_Call method which handles function calls in the AST.
This is the largest visitor method and handles various call patterns including:
- Helper function calls
- State method calls (state.has, state.can_reach, etc.)
- Module-based helper calls
- Built-in functions (all, any, sum, len, min, max, etc.)
"""

import ast
import logging
import sys
from typing import Any, Dict, Optional

from ..utils import is_simple_value, make_json_serializable
from ..closure_function_analyzer import ClosureFunctionAnalyzer, BunnyRulePatternMatcher
from .base import BaseVisitorMixin

logger = logging.getLogger(__name__)


class CallVisitorMixin(BaseVisitorMixin):
    """
    Mixin containing the visit_Call method for handling function calls.

    Required attributes from parent class:
        - expression_resolver: ExpressionResolver instance
        - binary_op_processor: BinaryOpProcessor instance
        - closure_vars: Dictionary of closure variables
        - seen_funcs: Dictionary of already-seen functions
        - game_handler: Optional game-specific handler
        - player_context: Optional player context
        - preserve_parameter_names: Boolean flag for parameter handling

    Required methods from parent class (via mixins):
        - visit(): Generic AST node visitor
        - _filter_special_args(): Filters state/player/world arguments
        - _build_parameter_mapping(): Builds parameter mapping for function calls
        - _register_helper_usage(): Registers helper usage
        - _make_helper_rule(): Creates helper rule structure
        - _is_multiworld_get_region_call(): Detects multiworld.get_region pattern
        - _is_world_attribute_chain(): Checks for world attribute chains
        - _convert_generator_exp_to_all_of(): Converts generator to all_of
        - _convert_generator_exp_to_any_of(): Converts generator to any_of
        - _substitute_variable_in_rule(): Substitutes variables in rules
    """

    def visit_Call(self, node):  # type: ignore[reportGeneralTypeIssues]
        """
        Visit a function call node.

        This method keeps ALL arguments during analysis (including state and player).
        Filtering of state/player happens later when creating final result structures.
        """
        logging.debug(f"\nvisit_Call called:")
        logging.debug(f"Function: {ast.dump(node.func)}")
        logging.debug(f"Args: {[ast.dump(arg) for arg in node.args]}")

        # *** Special handling for state.multiworld.get_region() pattern ***
        # Check this early before visiting function node to avoid unnecessary processing
        region_name = self._is_multiworld_get_region_call(node)
        if region_name:
            logging.debug(f"Detected state.multiworld.get_region pattern, region: {region_name}")
            return {'type': 'region_reference', 'region': region_name}

        # *** Special handling for callable attributes on NamedTuple closure variables ***
        # Pattern: loc.access_rule(state, player) where loc is a NamedTuple with a callable access_rule field
        # Check this early before visiting function node to inline the actual callable
        namedtuple_callable = self._try_inline_namedtuple_callable(node)
        if namedtuple_callable is not None:
            return namedtuple_callable

        # *** Special handling for entrance.access_rule(state) patterns ***
        # Pattern: dungeon_entrance.access_rule(fake_pearl_state(state, player))
        # where dungeon_entrance is an Entrance object in closure_vars
        entrance_rule = self._try_handle_entrance_access_rule(node)
        if entrance_rule is not None:
            return entrance_rule

        # *** Special handling for dict.get(key, default)(state) where dict contains lambdas ***
        # Pattern: rule_map.get(entrance.connected_region.name, lambda: False)(state)
        # Check this early to properly analyze each lambda in the dict
        dict_lambda_result = self._try_handle_dict_lambda_lookup(node)
        if dict_lambda_result is not None:
            logging.debug(f"Detected dict lambda lookup pattern, returning analyzed result")
            return dict_lambda_result

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

            # Handle starred expressions (*args unpacking)
            # When visit_Starred returns unpacked_args, expand them into the args list
            if arg_result.get('type') == 'starred':
                unpacked = arg_result.get('unpacked_args')
                if unpacked:
                    logging.debug(f"Unpacking starred argument with {len(unpacked)} values")
                    for unpacked_arg in unpacked:
                        args.append(unpacked_arg)
                        # Use the original starred node for all unpacked args (for filtering purposes)
                        args_with_nodes.append((arg_node, unpacked_arg))
                else:
                    # Starred expression couldn't be resolved - log warning but try to continue
                    logging.warning(f"Starred argument {i} could not be unpacked: {arg_result}")
                    # Skip this argument - we can't determine its values
                continue

            args.append(arg_result)
            args_with_nodes.append((arg_node, arg_result))

        logging.debug(f"Collected all args: {args}")

        # Process keyword arguments
        kwargs = {}  # Dict of keyword name -> analyzed value
        kwargs_with_nodes = []  # Pairs of (ast.keyword, result) for filtering
        for kw_node in node.keywords:
            if kw_node.arg is None:
                # **kwargs unpacking - skip for now (complex to handle)
                logging.debug(f"Skipping **kwargs unpacking in call")
                continue

            kw_result = self.visit(kw_node.value)
            if kw_result is None:
                logging.error(f"Failed to analyze keyword argument {kw_node.arg} in call: {ast.dump(kw_node.value)}")
                continue

            kwargs[kw_node.arg] = kw_result
            kwargs_with_nodes.append((kw_node, kw_result))

        if kwargs:
            logging.debug(f"Collected keyword args: {kwargs}")

        # Filter keyword arguments early (remove state, player, world)
        # This makes filtered_kwargs available to all code paths below
        filtered_kwargs = self._filter_special_kwargs(kwargs_with_nodes) if kwargs_with_nodes else {}
        if filtered_kwargs:
            logging.debug(f"Filtered keyword args: {filtered_kwargs}")

        # --- Determine the type of call ---

        # 1. Helper function call (identified by name)
        if func_info and func_info.get('type') == 'name':
            func_name = func_info['name']
            logging.debug(f"Checking helper: {func_name}")

            # Handle Rule Builder function calls (from rule_builder module imports)
            # These are recognized by their names and converted to proper AST types
            if func_name == 'Has':
                # Has(item_name) or Has(item_name, count)
                if args:
                    item_arg = args[0]
                    item_name = item_arg.get('value') if item_arg.get('type') == 'constant' else None
                    if item_name:
                        result = {'type': 'item_check', 'item': item_name}
                        if len(args) > 1:
                            count_arg = args[1]
                            count = count_arg.get('value') if count_arg.get('type') == 'constant' else None
                            if count is not None and count != 1:
                                result['count'] = count
                        logging.debug(f"Recognized Rule Builder Has() -> item_check: {result}")
                        return result
            elif func_name == 'HasAll':
                # HasAll(item1, item2, ...) or HasAll([item1, item2])
                items = []
                for arg in args:
                    if arg.get('type') == 'constant':
                        value = arg.get('value')
                        if isinstance(value, str):
                            items.append(value)
                        elif isinstance(value, list):
                            items.extend(value)
                if items:
                    result = {'type': 'state_method', 'method': 'has_all',
                              'args': [{'type': 'constant', 'value': sorted(items)}]}
                    logging.debug(f"Recognized Rule Builder HasAll() -> state_method.has_all: {result}")
                    return result
            elif func_name == 'HasAny':
                # HasAny(item1, item2, ...)
                items = []
                for arg in args:
                    if arg.get('type') == 'constant':
                        value = arg.get('value')
                        if isinstance(value, str):
                            items.append(value)
                        elif isinstance(value, list):
                            items.extend(value)
                if items:
                    result = {'type': 'state_method', 'method': 'has_any',
                              'args': [{'type': 'constant', 'value': sorted(items)}]}
                    logging.debug(f"Recognized Rule Builder HasAny() -> state_method.has_any: {result}")
                    return result
            elif func_name == 'And':
                # And(cond1, cond2, ...)
                if args:
                    result = {'type': 'and', 'conditions': args}
                    logging.debug(f"Recognized Rule Builder And() -> and: {result}")
                    return result
                return {'type': 'constant', 'value': True}
            elif func_name == 'Or':
                # Or(cond1, cond2, ...)
                if args:
                    result = {'type': 'or', 'conditions': args}
                    logging.debug(f"Recognized Rule Builder Or() -> or: {result}")
                    return result
                return {'type': 'constant', 'value': False}
            elif func_name == 'Not':
                # Not(condition)
                if args:
                    result = {'type': 'not', 'condition': args[0]}
                    logging.debug(f"Recognized Rule Builder Not() -> not: {result}")
                    return result
            elif func_name == 'True_':
                return {'type': 'constant', 'value': True}
            elif func_name == 'False_':
                return {'type': 'constant', 'value': False}

            # Filter arguments for game handler and result creation
            filtered_args = self._filter_special_args(args_with_nodes)

            # Note: filtered_kwargs is already computed above after collecting kwargs

            # Resolve variable references in arguments (e.g., lambda defaults)
            # Skip this when preserve_parameter_names is True - we want to keep params as name references
            if not getattr(self, 'preserve_parameter_names', False):
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
                        # Don't resolve world attribute chains - let the frontend resolve them
                        # This ensures consistent output regardless of analysis order.
                        if self._is_world_attribute_chain(arg):
                            logging.debug(f"Preserving world attribute chain in argument (not resolving to constant)")
                            resolved_args.append(arg)
                        else:
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

                    # --- Module-level function factory handling ---
                    # Handle function factories (like path_to_access_rule) that return lambdas when called.
                    # This is needed for patterns like: lambda state: path_to_access_rule(args)(state)
                    # where path_to_access_rule is a module-level function, not a closure variable.
                    FUNCTION_FACTORY_NAMES = {'path_to_access_rule', 'options_to_access_rule'}
                    if func_name in FUNCTION_FACTORY_NAMES:
                        logging.debug(f"Detected module-level function factory call: {func_name}")
                        try:
                            # Resolve the arguments to actual values
                            resolved_arg_values = []
                            all_args_resolved = True
                            for arg_node in node.args:
                                if isinstance(arg_node, ast.Name):
                                    arg_name = arg_node.id
                                    if arg_name in self.closure_vars:
                                        resolved_arg_values.append(self.closure_vars[arg_name])
                                    else:
                                        # Try expression resolver
                                        resolved_value = self.expression_resolver.resolve_variable(arg_name)
                                        if resolved_value is not None:
                                            resolved_arg_values.append(resolved_value)
                                        else:
                                            logging.debug(f"Could not resolve argument {arg_name} for module-level function factory {func_name}")
                                            all_args_resolved = False
                                            break
                                else:
                                    logging.debug(f"Argument to module-level function factory is not a simple name: {type(arg_node)}")
                                    all_args_resolved = False
                                    break

                            if all_args_resolved and len(resolved_arg_values) == len(node.args):
                                # Call the function factory to get the resulting lambda
                                logging.debug(f"Calling module-level function factory {func_name} with {len(resolved_arg_values)} args")
                                result_lambda = resolved_func(*resolved_arg_values)

                                if callable(result_lambda):
                                    # Analyze the resulting lambda using ClosureFunctionAnalyzer
                                    from ..closure_function_analyzer import ClosureFunctionAnalyzer
                                    from ..rule_analyzer import RuleAnalyzer

                                    # Create a minimal parent analyzer for the ClosureFunctionAnalyzer
                                    parent_analyzer = RuleAnalyzer(
                                        closure_vars=self.closure_vars,
                                        rule_func=result_lambda,
                                        player_context=self.player_context,
                                        game_handler=self.game_handler,
                                        seen_funcs=self.seen_funcs
                                    )

                                    closure_analyzer = ClosureFunctionAnalyzer(parent_analyzer)
                                    analyzed_result = closure_analyzer.analyze_function(result_lambda)

                                    if analyzed_result is not None:
                                        logging.debug(f"Successfully analyzed module-level function factory result for {func_name}")
                                        return analyzed_result
                                    else:
                                        logging.debug(f"ClosureFunctionAnalyzer could not analyze result of module-level {func_name}")
                                else:
                                    logging.debug(f"Module-level function factory {func_name} did not return a callable")
                        except Exception as e:
                            logging.error(f"Error analyzing module-level function factory {func_name}: {e}")
                    # --- END Module-level function factory handling ---

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
                            # Helper function to check if a function contains for loops that can't be evaluated at export time
                            # NOTE: The frontend now supports for_range/for_iter with state-dependent bodies,
                            # so we only block truly unsupported patterns like dict.items() iteration.
                            def has_dynamic_for_loops_resolved(func):
                                """Check if a function's body contains for loops that require runtime state."""
                                try:
                                    import inspect
                                    source = inspect.getsource(func)
                                    tree = ast.parse(source)

                                    for n in ast.walk(tree):
                                        if isinstance(n, ast.For):
                                            # NOTE: State-dependent loop bodies are now supported!
                                            # The frontend's for_range/for_iter can evaluate state method calls.
                                            # We only block patterns that truly can't be analyzed.

                                            # Check if iterator is a method call like .keys(), .values(), .items()
                                            # These dict methods produce key-value tuples that need special handling
                                            if isinstance(n.iter, ast.Call):
                                                if isinstance(n.iter.func, ast.Attribute):
                                                    method_name = n.iter.func.attr
                                                    if method_name in ('keys', 'values', 'items'):
                                                        logging.debug(f"Function has for loop over .{method_name}() - not yet supported")
                                                        return True
                                            # NOTE: Iterating over a name (variable) like 'for x in WORLDS:' is now
                                            # supported if the variable can be resolved to a constant by expression_resolver.
                                    return False
                                except Exception:
                                    return False

                            # Check if function has dynamic for loops - if so, preserve as helper
                            resolved_func_name = getattr(resolved_func, '__name__', func_name)
                            if has_dynamic_for_loops_resolved(resolved_func):
                                logging.debug(f"Function {resolved_func_name} has dynamic for loops, preserving as helper")
                                self._register_helper_usage(resolved_func_name, resolved_func, args_with_nodes)
                                return self._make_helper_rule(resolved_func_name, filtered_args, filtered_kwargs)

                            # Check if 'state' is passed as an argument using original AST nodes
                            has_state_arg = any(isinstance(arg, ast.Name) and arg.id == 'state' for arg in node.args)
                            # Attempt recursion if state arg is present
                            if has_state_arg:
                                # Import analyze_rule locally to avoid forward reference issues
                                from ..analysis import analyze_rule
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
                                                              player_context=self.player_context,
                                                              rule_target_name=getattr(self, 'rule_target_name', None),
                                                              target_type=getattr(self, 'target_type', None))
                                if recursive_result.get('type') != 'error':
                                    # Check if the result is too large to inline
                                    # If so, discard the analyzed result and treat like manual preservation
                                    # But only if we have a real function name (not <lambda>)
                                    auto_preserve = getattr(self.game_handler, 'AUTO_PRESERVE_LARGE_HELPERS', False) if self.game_handler else False
                                    threshold = getattr(self.game_handler, 'HELPER_INLINE_THRESHOLD', 0) if self.game_handler else 0
                                    # Don't preserve lambdas - they have no useful name for export
                                    if auto_preserve and actual_func_name and actual_func_name != '<lambda>':
                                        from exporter.games.base import BaseGameExportHandler
                                        size = BaseGameExportHandler.count_rule_nodes(recursive_result)
                                        if size > threshold:
                                            logging.debug(f"Helper {actual_func_name} has {size} nodes (threshold {threshold}), preserving as helper")
                                            # Register the helper for export with param_mappings detection
                                            self._register_helper_usage(actual_func_name, resolved_func, args_with_nodes)
                                            if hasattr(self.game_handler, 'register_auto_preserved_helper'):
                                                self.game_handler.register_auto_preserved_helper(actual_func_name)
                                            # Only cache the analyzed result if the function has no extra parameters
                                            # (besides state, player, world). If it takes parameters, the cached
                                            # result would have specific argument values baked in, which is wrong.
                                            if hasattr(self.game_handler, 'cache_analyzed_helper') and hasattr(resolved_func, '__code__'):
                                                all_params = resolved_func.__code__.co_varnames[:resolved_func.__code__.co_argcount]
                                                extra_params = [p for p in all_params if p not in ('state', 'player', 'world')]
                                                if not extra_params:
                                                    # No extra params - safe to cache the fully-resolved definition
                                                    self.game_handler.cache_analyzed_helper(actual_func_name, recursive_result)
                                                    logging.debug(f"Cached definition for parameterless helper {actual_func_name}")
                                                else:
                                                    logging.debug(f"Not caching {actual_func_name} - has params {extra_params}")
                                            # Return a helper call with original args (like manual preservation)
                                            return self._make_helper_rule(actual_func_name, filtered_args, filtered_kwargs)
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

                 # Get the actual function from the closure to check its name
                 actual_func = self.closure_vars[func_name]
                 closure_func_name = getattr(actual_func, '__name__', func_name)

                 # Check if game handler wants to explicitly preserve this as a helper
                 # (without recursive analysis - the JS implementation handles it)
                 if self.game_handler and hasattr(self.game_handler, 'should_preserve_as_helper'):
                     if closure_func_name and self.game_handler.should_preserve_as_helper(closure_func_name):
                         logging.debug(f"Game handler requests preserving closure {closure_func_name} as helper, skipping recursive analysis")
                         return self._make_helper_rule(closure_func_name, filtered_args, filtered_kwargs)

                 # --- Recursive analysis logic (enhanced for multiline lambdas) ---
                 try:
                     # Helper function to check if a function contains for loops that can't be evaluated at export time
                     # NOTE: The frontend now supports for_range/for_iter with state-dependent bodies,
                     # so we only block truly unsupported patterns like dict.items() iteration.
                     def has_dynamic_for_loops(func):
                         """Check if a function's body contains for loops that require runtime state."""
                         try:
                             import inspect
                             source = inspect.getsource(func)
                             tree = ast.parse(source)

                             for node in ast.walk(tree):
                                 if isinstance(node, ast.For):
                                     # NOTE: State-dependent loop bodies are now supported!
                                     # The frontend's for_range/for_iter can evaluate state method calls.
                                     # We only block patterns that truly can't be analyzed.

                                     # Check if iterator is a method call like .keys(), .values(), .items()
                                     # These dict methods produce key-value tuples that need special handling
                                     if isinstance(node.iter, ast.Call):
                                         if isinstance(node.iter.func, ast.Attribute):
                                             method_name = node.iter.func.attr
                                             if method_name in ('keys', 'values', 'items'):
                                                 logging.debug(f"Function has for loop over .{method_name}() - not yet supported")
                                                 return True
                                     # NOTE: Iterating over a name (variable) like 'for x in WORLDS:' is now
                                     # supported if the variable can be resolved to a constant by expression_resolver.
                             return False
                         except Exception:
                             return False

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

                     # Check if function has dynamic for loops - if so, preserve as helper
                     if has_dynamic_for_loops(actual_func):
                         logging.debug(f"Function {closure_func_name} has dynamic for loops, preserving as helper")
                         self._register_helper_usage(closure_func_name, actual_func, args_with_nodes)
                         return self._make_helper_rule(closure_func_name, filtered_args, filtered_kwargs)

                     # Check if 'state' or 'item' is passed as an argument (directly or indirectly)
                     # Access rules use 'state', item rules use 'item' (or 'i')
                     has_state_arg = any(references_state(arg) for arg in node.args)
                     has_item_arg = any(isinstance(arg, ast.Name) and arg.id in ('item', 'i') for arg in node.args)
                     # Attempt recursion if state or item arg is present
                     if has_state_arg or has_item_arg:
                          # Import analyze_rule locally to avoid forward reference issues
                          from ..analysis import analyze_rule
                          # actual_func and closure_func_name already set above
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
                                                          player_context=self.player_context,
                                                          rule_target_name=getattr(self, 'rule_target_name', None),
                                                          target_type=getattr(self, 'target_type', None))
                          if recursive_result.get('type') != 'error':
                              # Check if the result is too large to inline
                              # If so, discard the analyzed result and treat like manual preservation
                              # But only if we have a real function name (not <lambda>)
                              auto_preserve = getattr(self.game_handler, 'AUTO_PRESERVE_LARGE_HELPERS', False) if self.game_handler else False
                              threshold = getattr(self.game_handler, 'HELPER_INLINE_THRESHOLD', 0) if self.game_handler else 0
                              # closure_func_name already set above
                              # Don't preserve lambdas - they have no useful name for export
                              if auto_preserve and closure_func_name and closure_func_name != '<lambda>':
                                  from exporter.games.base import BaseGameExportHandler
                                  size = BaseGameExportHandler.count_rule_nodes(recursive_result)
                                  if size > threshold:
                                      logging.debug(f"Helper {closure_func_name} has {size} nodes (threshold {threshold}), preserving as helper")
                                      # Register the helper for export with param_mappings detection
                                      self._register_helper_usage(closure_func_name, actual_func, args_with_nodes)
                                      if hasattr(self.game_handler, 'register_auto_preserved_helper'):
                                          self.game_handler.register_auto_preserved_helper(closure_func_name)
                                      # Only cache the analyzed result if the function has no extra parameters
                                      # (besides state, player, world). If it takes parameters, the cached
                                      # result would have specific argument values baked in, which is wrong.
                                      if hasattr(self.game_handler, 'cache_analyzed_helper') and hasattr(actual_func, '__code__'):
                                          all_params = actual_func.__code__.co_varnames[:actual_func.__code__.co_argcount]
                                          extra_params = [p for p in all_params if p not in ('state', 'player', 'world')]
                                          if not extra_params:
                                              # No extra params - safe to cache the fully-resolved definition
                                              self.game_handler.cache_analyzed_helper(closure_func_name, recursive_result)
                                              logging.debug(f"Cached definition for parameterless helper {closure_func_name}")
                                          else:
                                              logging.debug(f"Not caching {closure_func_name} - has params {extra_params}")
                                      # Return a helper call with original args (like manual preservation)
                                      return self._make_helper_rule(closure_func_name, filtered_args, filtered_kwargs)
                              logging.debug(f"Recursive analysis successful for {func_name}. Result: {recursive_result}")
                              return recursive_result # Return the detailed analysis result
                          else:
                              logging.debug(f"Recursive analysis for {func_name} returned type 'error'. Falling back to helper node. Error details: {recursive_result.get('error_log')}")
                 except Exception as e:
                      logging.error(f"Error during recursive analysis of closure var {func_name}: {e}")
                 # --- END Recursive analysis logic ---

                 # --- Function factory handling (e.g., path_to_access_rule) ---
                 # Handle function factories that return lambdas when called.
                 # These are functions like path_to_access_rule(path, entrance) that return
                 # a new lambda capturing the arguments. We need to:
                 # 1. Resolve the arguments to their actual values
                 # 2. Call the function to get the resulting lambda
                 # 3. Analyze that resulting lambda with ClosureFunctionAnalyzer
                 FUNCTION_FACTORY_NAMES = {'path_to_access_rule', 'options_to_access_rule'}
                 if closure_func_name in FUNCTION_FACTORY_NAMES and callable(actual_func):
                     logging.debug(f"Detected function factory call: {closure_func_name}")
                     try:
                         # Resolve the arguments to actual values from closure
                         resolved_arg_values = []
                         all_args_resolved = True
                         for arg_node in node.args:
                             if isinstance(arg_node, ast.Name):
                                 arg_name = arg_node.id
                                 if arg_name in self.closure_vars:
                                     resolved_arg_values.append(self.closure_vars[arg_name])
                                 else:
                                     # Try expression resolver
                                     resolved_value = self.expression_resolver.resolve_variable(arg_name)
                                     if resolved_value is not None:
                                         resolved_arg_values.append(resolved_value)
                                     else:
                                         logging.debug(f"Could not resolve argument {arg_name} for function factory {closure_func_name}")
                                         all_args_resolved = False
                                         break
                             else:
                                 logging.debug(f"Argument to function factory is not a simple name: {type(arg_node)}")
                                 all_args_resolved = False
                                 break

                         if all_args_resolved and len(resolved_arg_values) == len(node.args):
                             # Call the function factory to get the resulting lambda
                             logging.debug(f"Calling function factory {closure_func_name} with {len(resolved_arg_values)} args")
                             result_lambda = actual_func(*resolved_arg_values)

                             if callable(result_lambda):
                                 # Analyze the resulting lambda using ClosureFunctionAnalyzer
                                 from ..closure_function_analyzer import ClosureFunctionAnalyzer
                                 from ..rule_analyzer import RuleAnalyzer

                                 # Create a minimal parent analyzer for the ClosureFunctionAnalyzer
                                 parent_analyzer = RuleAnalyzer(
                                     closure_vars=self.closure_vars,
                                     rule_func=result_lambda,
                                     player_context=self.player_context,
                                     game_handler=self.game_handler,
                                     seen_funcs=self.seen_funcs
                                 )

                                 closure_analyzer = ClosureFunctionAnalyzer(parent_analyzer)
                                 analyzed_result = closure_analyzer.analyze_function(result_lambda)

                                 if analyzed_result is not None:
                                     logging.debug(f"Successfully analyzed function factory result for {closure_func_name}")
                                     return analyzed_result
                                 else:
                                     logging.debug(f"ClosureFunctionAnalyzer could not analyze result of {closure_func_name}")
                             else:
                                 logging.debug(f"Function factory {closure_func_name} did not return a callable")
                     except Exception as e:
                         logging.error(f"Error analyzing function factory {closure_func_name}: {e}")
                 # --- END Function factory handling ---

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

                # Handle iterator that's already a constant (e.g., list resolved from closure)
                if iterator_type == 'constant':
                    constant_value = iterator_info['iterator'].get('value')
                    logging.debug(f"all(GeneratorExp): Iterator is constant with {len(constant_value) if isinstance(constant_value, list) else 'non-list'} items")

                    if isinstance(constant_value, list) and len(constant_value) > 0:
                        # Check if items are callables (bunny rules)
                        if all(callable(item) for item in constant_value):
                            from ..analysis import analyze_rule
                            analyzed_items = []
                            for item_func in constant_value:
                                try:
                                    # Check if this is a bound method of Region.can_reach
                                    # These carry the region name on __self__ and should be
                                    # converted directly to CanReachRegion rules rather than
                                    # analyzed from source (which loses the region identity)
                                    if (hasattr(item_func, '__self__')
                                            and hasattr(item_func, '__name__')
                                            and item_func.__name__ == 'can_reach'
                                            and hasattr(item_func.__self__, 'entrances')
                                            and hasattr(item_func.__self__, 'name')):
                                        region_name = item_func.__self__.name
                                        logging.debug(f"all(GeneratorExp constant): Detected Region.can_reach bound method for region '{region_name}'")
                                        analyzed_items.append({'type': 'can_reach', 'region': region_name})
                                        continue

                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context,
                                                              rule_target_name=getattr(self, 'rule_target_name', None),
                                                              target_type=getattr(self, 'target_type', None))
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        logging.debug(f"Could not analyze item in constant list, checking for fallback")
                                        analyzed_items = None
                                        break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in constant list: {e}")
                                    analyzed_items = None
                                    break

                            if analyzed_items:
                                # Successfully analyzed all items - return an 'and' of all items
                                logging.debug(f"all(GeneratorExp constant): Successfully analyzed {len(analyzed_items)} items, returning 'and' rule")
                                if len(analyzed_items) == 1:
                                    return analyzed_items[0]
                                else:
                                    return {'type': 'and', 'conditions': analyzed_items}
                        else:
                            # Handle non-callable constant values (strings, numbers, etc.) - expand the comprehension
                            logging.debug(f"all(GeneratorExp): Iterator contains non-callable constant values, expanding comprehension")
                            target_name = iterator_info.get('target', {}).get('name')
                            if not target_name:
                                logging.warning(f"all(GeneratorExp): Could not extract target variable name from comprehension")
                            else:
                                element_rule = gen_exp['element']
                                expanded_conditions = []

                                for value in constant_value:
                                    # Substitute the target variable with the current value in the element rule
                                    substituted_rule = self._substitute_variable_in_rule(element_rule, target_name, value)
                                    if substituted_rule:
                                        expanded_conditions.append(substituted_rule)
                                    else:
                                        logging.warning(f"all(GeneratorExp constant): Failed to substitute {target_name}={value} in element rule")
                                        expanded_conditions = None
                                        break

                                if expanded_conditions:
                                    logging.debug(f"all(GeneratorExp constant): Successfully expanded to {len(expanded_conditions)} conditions")
                                    if len(expanded_conditions) == 0:
                                        # Empty iterator - all() of empty is True
                                        return {'type': 'constant', 'value': True}
                                    elif len(expanded_conditions) == 1:
                                        return expanded_conditions[0]
                                    else:
                                        return {'type': 'and', 'conditions': expanded_conditions}

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
                            from ..analysis import analyze_rule
                            analyzed_items = []
                            for item_func in resolved_value:
                                try:
                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context,
                                                              rule_target_name=getattr(self, 'rule_target_name', None),
                                                              target_type=getattr(self, 'target_type', None))
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        # Try ClosureFunctionAnalyzer as fallback for bunny rules
                                        logging.debug(f"all(GeneratorExp): analyze_rule failed, trying ClosureFunctionAnalyzer")
                                        closure_analyzer = ClosureFunctionAnalyzer(self)
                                        fallback_result = closure_analyzer.analyze_function(item_func)
                                        if fallback_result:
                                            logging.debug(f"all(GeneratorExp): ClosureFunctionAnalyzer succeeded")
                                            analyzed_items.append(fallback_result)
                                        else:
                                            logging.debug(f"Could not analyze item in {iterator_name} list, falling back to unresolved")
                                            analyzed_items = None
                                            break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in {iterator_name}: {e}")
                                    # Try ClosureFunctionAnalyzer as fallback
                                    try:
                                        closure_analyzer = ClosureFunctionAnalyzer(self)
                                        fallback_result = closure_analyzer.analyze_function(item_func)
                                        if fallback_result:
                                            logging.debug(f"all(GeneratorExp): ClosureFunctionAnalyzer fallback succeeded after exception")
                                            analyzed_items.append(fallback_result)
                                        else:
                                            analyzed_items = None
                                            break
                                    except Exception as fallback_e:
                                        logging.debug(f"all(GeneratorExp): ClosureFunctionAnalyzer also failed: {fallback_e}")
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
                # For nested generator expressions, recursively convert inner generators to all_of
                element_rule = gen_exp['element']
                if element_rule.get('type') == 'generator_expression':
                    # Recursively convert nested generator_expression to all_of
                    element_rule = self._convert_generator_exp_to_all_of(element_rule)
                    logging.debug(f"all(GeneratorExp): Converted nested generator_expression to all_of")

                result = {
                    'type': 'all_of',
                    'element_rule': element_rule,
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

                # Handle iterator that's already a constant (e.g., list of functions from closure)
                if iterator_type == 'constant':
                    constant_value = iterator_info['iterator'].get('value')
                    logging.debug(f"any(GeneratorExp): Iterator is constant with {len(constant_value) if isinstance(constant_value, list) else 'non-list'} items")

                    if isinstance(constant_value, list) and len(constant_value) > 0:
                        # Check if items are callables (bunny rules)
                        if all(callable(item) for item in constant_value):
                            from ..analysis import analyze_rule
                            analyzed_items = []
                            for item_func in constant_value:
                                try:
                                    # Check if this is a bound method of Region.can_reach
                                    if (hasattr(item_func, '__self__')
                                            and hasattr(item_func, '__name__')
                                            and item_func.__name__ == 'can_reach'
                                            and hasattr(item_func.__self__, 'entrances')
                                            and hasattr(item_func.__self__, 'name')):
                                        region_name = item_func.__self__.name
                                        logging.debug(f"any(GeneratorExp constant): Detected Region.can_reach bound method for region '{region_name}'")
                                        analyzed_items.append({'type': 'can_reach', 'region': region_name})
                                        continue

                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context,
                                                              rule_target_name=getattr(self, 'rule_target_name', None),
                                                              target_type=getattr(self, 'target_type', None))
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        # Try ClosureFunctionAnalyzer as fallback for bunny rules
                                        logging.debug(f"any(GeneratorExp constant): analyze_rule failed, trying ClosureFunctionAnalyzer")
                                        closure_analyzer = ClosureFunctionAnalyzer(self)
                                        fallback_result = closure_analyzer.analyze_function(item_func)
                                        if fallback_result:
                                            logging.debug(f"any(GeneratorExp constant): ClosureFunctionAnalyzer succeeded")
                                            analyzed_items.append(fallback_result)
                                        else:
                                            logging.debug(f"Could not analyze item in constant list, checking for bunny rule fallback")
                                            analyzed_items = None
                                            break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in constant list: {e}")
                                    analyzed_items = None
                                    break

                            if analyzed_items:
                                # Successfully analyzed all items - return an 'or' of all items
                                logging.debug(f"any(GeneratorExp constant): Successfully analyzed {len(analyzed_items)} items, returning 'or' rule")
                                if len(analyzed_items) == 1:
                                    return analyzed_items[0]
                                else:
                                    return {'type': 'or', 'conditions': analyzed_items}
                            else:
                                # Analysis failed - check if game handler can identify this as an unanalyzable pattern
                                first_func = constant_value[0]
                                is_unanalyzable = False
                                if self.game_handler and hasattr(self.game_handler, 'is_unanalyzable_rule_pattern'):
                                    is_unanalyzable = self.game_handler.is_unanalyzable_rule_pattern(first_func)
                                else:
                                    # Legacy fallback: check for set_bunny_rules pattern
                                    func_qualname = getattr(first_func, '__qualname__', '')
                                    is_unanalyzable = 'set_bunny_rules' in func_qualname

                                if is_unanalyzable:
                                    # Get game-specific fallback from handler
                                    fallback = None
                                    if self.game_handler and hasattr(self.game_handler, 'get_unanalyzable_rule_fallback'):
                                        fallback = self.game_handler.get_unanalyzable_rule_fallback(first_func)
                                    if fallback:
                                        print(
                                            f"LOSSY FALLBACK: Unanalyzable rule pattern, using game handler fallback",
                                            file=sys.stderr
                                        )
                                        return fallback
                                    # No fallback available
                                    print(
                                        f"LOSSY FALLBACK: Unanalyzable rule pattern, no game handler fallback available",
                                        file=sys.stderr
                                    )
                        else:
                            # Handle non-callable constant values (strings, numbers, etc.) - expand the comprehension
                            logging.debug(f"any(GeneratorExp): Iterator contains non-callable constant values, expanding comprehension")
                            target_name = iterator_info.get('target', {}).get('name')
                            if not target_name:
                                logging.warning(f"any(GeneratorExp): Could not extract target variable name from comprehension")
                            else:
                                element_rule = gen_exp['element']
                                expanded_conditions = []

                                for value in constant_value:
                                    # Substitute the target variable with the current value in the element rule
                                    substituted_rule = self._substitute_variable_in_rule(element_rule, target_name, value)
                                    if substituted_rule:
                                        expanded_conditions.append(substituted_rule)
                                    else:
                                        logging.warning(f"any(GeneratorExp constant): Failed to substitute {target_name}={value} in element rule")
                                        expanded_conditions = None
                                        break

                                if expanded_conditions:
                                    logging.debug(f"any(GeneratorExp constant): Successfully expanded to {len(expanded_conditions)} conditions")
                                    if len(expanded_conditions) == 0:
                                        # Empty iterator - any() of empty is False
                                        return {'type': 'constant', 'value': False}
                                    elif len(expanded_conditions) == 1:
                                        return expanded_conditions[0]
                                    else:
                                        return {'type': 'or', 'conditions': expanded_conditions}

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
                            from ..analysis import analyze_rule
                            analyzed_items = []
                            for item_func in resolved_value:
                                try:
                                    item_result = analyze_rule(rule_func=item_func, closure_vars=self.closure_vars.copy(),
                                                              seen_funcs=self.seen_funcs, game_handler=self.game_handler,
                                                              player_context=self.player_context,
                                                              rule_target_name=getattr(self, 'rule_target_name', None),
                                                              target_type=getattr(self, 'target_type', None))
                                    if item_result and item_result.get('type') != 'error':
                                        analyzed_items.append(item_result)
                                    else:
                                        # Try ClosureFunctionAnalyzer as fallback for bunny rules
                                        logging.debug(f"any(GeneratorExp): analyze_rule failed, trying ClosureFunctionAnalyzer")
                                        closure_analyzer = ClosureFunctionAnalyzer(self)
                                        fallback_result = closure_analyzer.analyze_function(item_func)
                                        if fallback_result:
                                            logging.debug(f"any(GeneratorExp): ClosureFunctionAnalyzer succeeded")
                                            analyzed_items.append(fallback_result)
                                        else:
                                            logging.debug(f"Could not analyze item in {iterator_name} list, falling back to unresolved")
                                            analyzed_items = None
                                            break
                                except Exception as e:
                                    logging.debug(f"Error analyzing item in {iterator_name}: {e}")
                                    # Try ClosureFunctionAnalyzer as fallback
                                    try:
                                        closure_analyzer = ClosureFunctionAnalyzer(self)
                                        fallback_result = closure_analyzer.analyze_function(item_func)
                                        if fallback_result:
                                            logging.debug(f"any(GeneratorExp): ClosureFunctionAnalyzer fallback succeeded after exception")
                                            analyzed_items.append(fallback_result)
                                        else:
                                            analyzed_items = None
                                            break
                                    except Exception as fallback_e:
                                        logging.debug(f"any(GeneratorExp): ClosureFunctionAnalyzer also failed: {fallback_e}")
                                        analyzed_items = None
                                        break

                            if analyzed_items:
                                # Successfully analyzed all items - return an 'or' of all items (different from 'all')
                                logging.debug(f"any(GeneratorExp): Successfully analyzed {len(analyzed_items)} items, returning 'or' rule")
                                if len(analyzed_items) == 1:
                                    return analyzed_items[0]
                                else:
                                    return {'type': 'or', 'conditions': analyzed_items}
                            else:
                                # Analysis failed for callable list - check if game handler can identify this
                                # as an unanalyzable pattern
                                if resolved_value and len(resolved_value) > 0:
                                    first_func = resolved_value[0]
                                    is_unanalyzable = False
                                    if self.game_handler and hasattr(self.game_handler, 'is_unanalyzable_rule_pattern'):
                                        is_unanalyzable = self.game_handler.is_unanalyzable_rule_pattern(first_func)
                                    else:
                                        # Legacy fallback: check for set_bunny_rules pattern
                                        func_qualname = getattr(first_func, '__qualname__', '')
                                        is_unanalyzable = 'set_bunny_rules' in func_qualname

                                    if is_unanalyzable:
                                        # Get game-specific fallback from handler
                                        fallback = None
                                        if self.game_handler and hasattr(self.game_handler, 'get_unanalyzable_rule_fallback'):
                                            fallback = self.game_handler.get_unanalyzable_rule_fallback(first_func)
                                        if fallback:
                                            print(
                                                f"LOSSY FALLBACK: Unanalyzable rule pattern, using game handler fallback",
                                                file=sys.stderr
                                            )
                                            return fallback
                                        # No fallback available
                                        print(
                                            f"LOSSY FALLBACK: Unanalyzable rule pattern, no game handler fallback available",
                                            file=sys.stderr
                                        )

                        # NEW: Handle nested comprehensions - list of lists of callables
                        # This pattern appears in The Witness: any(all(condition(state) for condition in sub_req) for sub_req in fully_converted_rules)
                        # where fully_converted_rules is a list of lists of lambda functions
                        elif all(isinstance(item, (list, tuple)) for item in resolved_value):
                            # Check if each inner list contains callables
                            if all(all(callable(inner_item) for inner_item in item) for item in resolved_value):
                                logging.debug(f"any(GeneratorExp): Detected list of lists of callables, analyzing nested pattern")
                                from ..analysis import analyze_rule
                                outer_conditions = []
                                analysis_failed = False

                                for inner_list in resolved_value:
                                    # Analyze each callable in the inner list
                                    inner_conditions = []
                                    for item_func in inner_list:
                                        try:
                                            item_result = analyze_rule(
                                                rule_func=item_func,
                                                closure_vars=self.closure_vars.copy(),
                                                seen_funcs=self.seen_funcs,
                                                game_handler=self.game_handler,
                                                player_context=self.player_context,
                                                rule_target_name=getattr(self, 'rule_target_name', None),
                                                target_type=getattr(self, 'target_type', None)
                                            )
                                            if item_result and item_result.get('type') != 'error':
                                                inner_conditions.append(item_result)
                                            else:
                                                # Try ClosureFunctionAnalyzer as fallback
                                                logging.debug(f"any(GeneratorExp nested): analyze_rule failed, trying ClosureFunctionAnalyzer")
                                                closure_analyzer = ClosureFunctionAnalyzer(self)
                                                fallback_result = closure_analyzer.analyze_function(item_func)
                                                if fallback_result:
                                                    logging.debug(f"any(GeneratorExp nested): ClosureFunctionAnalyzer succeeded")
                                                    inner_conditions.append(fallback_result)
                                                else:
                                                    logging.debug(f"Could not analyze item in nested list, falling back to unresolved")
                                                    analysis_failed = True
                                                    break
                                        except Exception as e:
                                            logging.debug(f"Error analyzing item in nested list: {e}")
                                            # Try ClosureFunctionAnalyzer as fallback
                                            try:
                                                closure_analyzer = ClosureFunctionAnalyzer(self)
                                                fallback_result = closure_analyzer.analyze_function(item_func)
                                                if fallback_result:
                                                    logging.debug(f"any(GeneratorExp nested): ClosureFunctionAnalyzer fallback succeeded")
                                                    inner_conditions.append(fallback_result)
                                                else:
                                                    analysis_failed = True
                                                    break
                                            except Exception as fallback_e:
                                                logging.debug(f"any(GeneratorExp nested): ClosureFunctionAnalyzer also failed: {fallback_e}")
                                                analysis_failed = True
                                                break

                                    if analysis_failed:
                                        break

                                    # Combine inner conditions with 'and' (since inner is all())
                                    if len(inner_conditions) == 0:
                                        # Empty inner list - all() of empty is True
                                        inner_result = {'type': 'constant', 'value': True}
                                    elif len(inner_conditions) == 1:
                                        inner_result = inner_conditions[0]
                                    else:
                                        inner_result = {'type': 'and', 'conditions': inner_conditions}

                                    outer_conditions.append(inner_result)

                                if not analysis_failed and outer_conditions:
                                    # Combine outer conditions with 'or' (since outer is any())
                                    logging.debug(f"any(GeneratorExp): Successfully analyzed nested pattern, {len(outer_conditions)} outer conditions")
                                    if len(outer_conditions) == 0:
                                        return {'type': 'constant', 'value': False}
                                    elif len(outer_conditions) == 1:
                                        return outer_conditions[0]
                                    else:
                                        return {'type': 'or', 'conditions': outer_conditions}

                        # Handle simple values (strings, numbers, etc.) - expand the comprehension
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
                # For nested generator expressions, recursively convert inner generators to any_of
                element_rule = gen_exp['element']
                if element_rule.get('type') == 'generator_expression':
                    # Recursively convert nested generator_expression to any_of
                    element_rule = self._convert_generator_exp_to_any_of(element_rule)
                    logging.debug(f"any(GeneratorExp): Converted nested generator_expression to any_of")

                result = {
                    'type': 'any_of',
                    'element_rule': element_rule,
                    'iterator_info': iterator_info
                }
                logging.debug(f"Created 'any_of' result: {result}")
                return result
            # *** END any() HANDLING ***

            # *** Special handling for sum(GeneratorExp) or sum(ListComp) ***
            if func_name == 'sum' and len(filtered_args) >= 1:
                first_arg = filtered_args[0]
                # Handle both generator expressions and list types (which may contain expanded comprehension results)
                if first_arg.get('type') == 'generator_expression':
                    logging.debug(f"Detected sum(GeneratorExp) pattern.")
                    gen_exp = first_arg

                    # Try to resolve the iterator if it's a name reference
                    iterator_info = gen_exp['comprehension']
                    iterator_type = iterator_info.get('iterator', {}).get('type')

                    # Try to expand the comprehension if we can resolve the iterator
                    if iterator_type == 'name':
                        iterator_name = iterator_info['iterator']['name']
                        logging.debug(f"sum(GeneratorExp): Attempting to resolve iterator '{iterator_name}'")

                        resolved_value = self.expression_resolver.resolve_variable(iterator_name)

                        # Convert frozensets/sets/tuples to lists for uniform handling
                        if resolved_value is not None:
                            if isinstance(resolved_value, (frozenset, set, tuple)):
                                resolved_value = list(resolved_value)
                                logging.debug(f"sum(GeneratorExp): Converted {type(resolved_value).__name__} to list")

                        if resolved_value is not None and isinstance(resolved_value, list):
                            logging.debug(f"sum(GeneratorExp): Resolved '{iterator_name}' to list with {len(resolved_value)} items")

                            # Handle simple values - expand the comprehension
                            target_name = iterator_info.get('target', {}).get('name')
                            if target_name:
                                element_rule = gen_exp['element']
                                expanded_elements = []

                                for value in resolved_value:
                                    # Substitute the target variable with the current value in the element rule
                                    substituted_rule = self._substitute_variable_in_rule(element_rule, target_name, value)
                                    if substituted_rule:
                                        expanded_elements.append(substituted_rule)
                                    else:
                                        logging.warning(f"sum(GeneratorExp): Failed to substitute {target_name}={value} in element rule")
                                        expanded_elements = None
                                        break

                                if expanded_elements is not None:
                                    logging.debug(f"sum(GeneratorExp): Successfully expanded to {len(expanded_elements)} elements")
                                    if len(expanded_elements) == 0:
                                        # Empty iterator - sum() of empty is 0
                                        return {'type': 'constant', 'value': 0}
                                    elif len(expanded_elements) == 1:
                                        return expanded_elements[0]
                                    else:
                                        # Build a nested binary_op tree for addition
                                        result = expanded_elements[0]
                                        for elem in expanded_elements[1:]:
                                            result = {
                                                'type': 'binary_op',
                                                'left': result,
                                                'op': '+',
                                                'right': elem
                                            }
                                        return result

                    # If we couldn't expand, create a sum_of rule for runtime evaluation
                    element_rule = gen_exp['element']
                    result = {
                        'type': 'sum_of',
                        'element_rule': element_rule,
                        'iterator_info': iterator_info
                    }
                    logging.debug(f"Created 'sum_of' result: {result}")
                    return result

                # Handle sum() with a list argument (e.g., sum([1 for x in items if condition]))
                elif first_arg.get('type') == 'list':
                    list_elements = first_arg.get('value', [])
                    if list_elements:
                        logging.debug(f"Detected sum(list) with {len(list_elements)} elements")
                        # Build a nested binary_op tree for addition
                        result = list_elements[0]
                        for elem in list_elements[1:]:
                            result = {
                                'type': 'binary_op',
                                'left': result,
                                'op': '+',
                                'right': elem
                            }
                        return result
                    else:
                        return {'type': 'constant', 'value': 0}
            # *** END sum() HANDLING ***

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

            # *** Special handling for min() function ***
            # min(a, b, c) - multiple arguments
            # min(iterable) - single iterable argument
            if func_name == 'min' and len(filtered_args) >= 1:
                logging.debug(f"Detected min() function call with {len(filtered_args)} args")
                if len(filtered_args) == 1:
                    # Single argument - treat as iterable
                    result = {
                        'type': 'min',
                        'iterable': filtered_args[0]
                    }
                else:
                    # Multiple arguments - explicit values
                    result = {
                        'type': 'min',
                        'args': filtered_args
                    }
                logging.debug(f"Created min result: {result}")
                return result

            # *** Special handling for max() function ***
            # max(a, b, c) - multiple arguments
            # max(iterable) - single iterable argument
            if func_name == 'max' and len(filtered_args) >= 1:
                logging.debug(f"Detected max() function call with {len(filtered_args)} args")
                if len(filtered_args) == 1:
                    # Single argument - treat as iterable
                    result = {
                        'type': 'max',
                        'iterable': filtered_args[0]
                    }
                else:
                    # Multiple arguments - explicit values
                    result = {
                        'type': 'max',
                        'args': filtered_args
                    }
                logging.debug(f"Created max result: {result}")
                return result

            # *** Special handling for sum() function ***
            # sum() typically takes an iterable as its first argument
            # sum([1, 2, 3]) or sum(generator_expr) or sum([...], start_value)
            if func_name == 'sum' and len(filtered_args) >= 1:
                logging.debug(f"Detected sum() function call with {len(filtered_args)} args")
                result = {
                    'type': 'sum',
                    'iterable': filtered_args[0]
                }
                # Optional start value (second argument)
                if len(filtered_args) >= 2:
                    result['start'] = filtered_args[1]
                logging.debug(f"Created sum result: {result}")
                return result

            # *** Special handling for map() function ***
            # map(func, iterable) applies func to each element of iterable
            if func_name == 'map' and len(filtered_args) >= 2:
                logging.debug(f"Detected map() function call with {len(filtered_args)} args")
                func_arg = filtered_args[0]
                iterable_arg = filtered_args[1]
                result = {
                    'type': 'map',
                    'function': func_arg,
                    'iterable': iterable_arg
                }
                logging.debug(f"Created map result: {result}")
                return result

            # *** Special handling for closure variable names that should NOT be exported as helpers ***
            # These are closure variables used by ALttP's rule combinators, NOT helper functions.
            # If we reach this point, recursive analysis of the captured function failed,
            # so we must NOT export them as helper references.
            # - 'old_rule': Used by add_rule/add_alternate_rule to capture the previous access rule
            # - 'path_to_access_rule': Used by bunny rule generation to capture path traversal rules
            closure_var_blacklist = {'old_rule', 'path_to_access_rule'}
            if func_name in closure_var_blacklist:
                target_name = getattr(self, 'rule_target_name', None) or 'unknown'
                print(
                    f"LOSSY FALLBACK: Closure variable '{func_name}' could not be analyzed "
                    f"for target '{target_name}', using True_ (always accessible) as fallback",
                    file=sys.stderr
                )
                return {'rule': 'True_'}

            # Create helper result with filtered args and kwargs (no state/player in JSON)
            result = self._make_helper_rule(func_name, filtered_args, filtered_kwargs)
            logging.debug(f"Created helper result: {result}")
            # Register for automatic discovery
            self._register_helper_usage(func_name)
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
                    elif arg and arg.get('type') in ('set_comprehension', 'generator_expression'):
                        # Try to resolve set/generator comprehensions like
                        # {technology.name for technology in recipe.recursive_unlocking_technologies}
                        # to a concrete list of values
                        resolved_comp = self._try_resolve_comprehension(arg)
                        if resolved_comp is not None:
                            logging.debug(f"Resolved comprehension to {len(resolved_comp)} values: {resolved_comp}")
                            resolved_args.append({'type': 'constant', 'value': sorted(resolved_comp) if all(isinstance(v, str) for v in resolved_comp) else resolved_comp})
                        else:
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
                    # Also check filtered_kwargs for count passed as keyword argument
                    count_arg = None
                    if len(filtered_args) >= 2:
                        count_arg = filtered_args[1]
                    elif 'count' in filtered_kwargs:
                        count_arg = filtered_kwargs['count']
                        logging.debug(f"Found count as keyword argument: {count_arg}")

                    if count_arg is not None:
                        if isinstance(count_arg, dict):
                            # When preserve_parameter_names is True and this is a name reference,
                            # don't resolve to default value - keep as name reference for helper bodies
                            should_resolve = True
                            if getattr(self, 'preserve_parameter_names', False):
                                if count_arg.get('type') == 'name':
                                    should_resolve = False
                                    logging.debug(f"Preserving parameter name reference: {count_arg}")

                            if should_resolve:
                                # Try to resolve the expression to a concrete value
                                resolved_value = self.expression_resolver.resolve_expression(count_arg)
                                if resolved_value is not None and isinstance(resolved_value, int):
                                    # Successfully resolved to an integer value
                                    logging.debug(f"Resolved count parameter: {count_arg} -> {resolved_value}")
                                    result['count'] = {'type': 'constant', 'value': resolved_value}
                                elif count_arg.get('type') == 'constant' and isinstance(count_arg.get('value'), int):
                                    # Already a constant, use as-is
                                    logging.debug(f"Found constant count parameter: {count_arg}")
                                    result['count'] = count_arg
                                else:
                                    # Could not resolve to a constant value, keep as-is
                                    logging.debug(f"Found unresolved count parameter: {count_arg}")
                                    result['count'] = count_arg
                            else:
                                # preserve_parameter_names is True and this is a name - keep as-is
                                result['count'] = count_arg
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
                    # Also check filtered_kwargs for count passed as keyword argument
                    count_arg = None
                    if len(filtered_args) >= 2:
                        count_arg = filtered_args[1]
                    elif 'count' in filtered_kwargs:
                        count_arg = filtered_kwargs['count']
                        logging.debug(f"Found group count as keyword argument: {count_arg}")

                    if count_arg is not None:
                        if isinstance(count_arg, dict):
                            # Try to resolve the expression to a concrete value
                            resolved_value = self.expression_resolver.resolve_expression(count_arg)
                            if resolved_value is not None and isinstance(resolved_value, int):
                                # Successfully resolved to an integer value
                                logging.debug(f"Resolved group count parameter: {count_arg} -> {resolved_value}")
                                result['count'] = {'type': 'constant', 'value': resolved_value}
                            elif count_arg.get('type') == 'constant' and isinstance(count_arg.get('value'), int):
                                # Already a constant, use as-is
                                logging.debug(f"Found constant group count parameter: {count_arg}")
                                result['count'] = count_arg
                            else:
                                # Could not resolve to a constant value, keep as-is
                                logging.debug(f"Found unresolved group count parameter: {count_arg}")
                                result['count'] = count_arg
                elif method == 'count_group' and len(filtered_args) >= 1:
                    # state.count_group(group_name, player) -> returns the count of items in a group
                    # Unwrap group name if it's a constant
                    group_arg = filtered_args[0]
                    if isinstance(group_arg, dict) and group_arg.get('type') == 'constant' and isinstance(group_arg.get('value'), str):
                        group_value = group_arg.get('value')
                    elif isinstance(group_arg, str):
                        group_value = group_arg
                    else:
                        group_value = group_arg
                    # Create a group_count rule that returns the count (not a boolean check)
                    result = {'type': 'group_count', 'group': group_value}
                    logging.debug(f"Converted count_group to group_count: {result}")
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
                elif method.startswith('_') and len(filtered_args) >= 1:
                    # Check if game handler has special handling for game-specific state methods
                    # (e.g., _lttp_has_key for ALttP)
                    if self.game_handler and hasattr(self.game_handler, 'handle_game_specific_state_method'):
                        world = getattr(self.game_handler, 'world', None)
                        handler_result = self.game_handler.handle_game_specific_state_method(
                            method, filtered_args, world
                        )
                        if handler_result:
                            logging.debug(f"Game handler handled state method '{method}'")
                            result = handler_result
                        else:
                            # Handler didn't handle it, create default state_method
                            result = {'type': 'state_method', 'method': method, 'args': filtered_args}
                    else:
                        # No handler available, create default state_method
                        result = {'type': 'state_method', 'method': method, 'args': filtered_args}
                elif method == 'can_reach' and len(filtered_args) >= 1:
                    # Handle can_reach state method with Location object resolution
                    # Pattern: state.can_reach(loc_var, "Location", player) where loc_var is a Location object
                    # in closure_vars (typically from lambda default parameter like: lambda state, b=boss: ...)
                    first_arg = filtered_args[0]
                    reach_type = 'Region'  # Default reach type

                    # Get the reach type from the second argument if present
                    if len(filtered_args) >= 2:
                        type_arg = filtered_args[1]
                        if isinstance(type_arg, dict) and type_arg.get('type') == 'constant':
                            reach_type = type_arg.get('value', 'Region')
                        elif isinstance(type_arg, str):
                            reach_type = type_arg

                    # Check if first argument is a name reference to a Location object in closure_vars
                    if (isinstance(first_arg, dict) and first_arg.get('type') == 'name' and
                        reach_type == 'Location'):
                        var_name = first_arg.get('name')
                        if var_name and var_name in self.closure_vars:
                            loc_obj = self.closure_vars[var_name]
                            # Check if it's a Location object (has 'name' and 'parent_region' but not 'entrances')
                            if (hasattr(loc_obj, 'name') and
                                hasattr(loc_obj, 'parent_region') and
                                not hasattr(loc_obj, 'entrances') and
                                isinstance(loc_obj.name, str)):
                                logging.debug(f"Resolved Location object '{var_name}' to name: {loc_obj.name}")
                                # Replace the name reference with the actual location name
                                filtered_args[0] = {'type': 'constant', 'value': loc_obj.name}

                    # Create the state_method result with potentially resolved arguments
                    result = {'type': 'state_method', 'method': 'can_reach', 'args': filtered_args}
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
                result = self._make_helper_rule(method_name, filtered_args, filtered_kwargs)
                logging.debug(f"Created helper result for self method: {result}")
                # Register for automatic discovery
                self._register_helper_usage(method_name)
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
                result = self._make_helper_rule(method_name, filtered_args, filtered_kwargs)
                logging.debug(f"Created helper result for logic method: {result}")
                # Register for automatic discovery
                self._register_helper_usage(method_name)
                return result

            # Handle Module.function calls (e.g., StateLogic.canDig, Macros.can_sail)
            # This enables auto-discovery of helper modules without requiring HELPER_MODULES config
            # NOTE: The module check (has __name__ and __file__) MUST be in the elif condition itself,
            # not as a nested if. Otherwise, non-module objects like Location will match the elif
            # but fail the inner check, causing the can_reach handler below to be skipped.
            elif (obj_name and obj_name in self.closure_vars and
                  hasattr(self.closure_vars[obj_name], '__name__') and
                  hasattr(self.closure_vars[obj_name], '__file__')):
                module_obj = self.closure_vars[obj_name]
                logging.debug(f"Processing module function call: {obj_name}.{method_name}")

                # Get the actual function object from the module
                func_obj = getattr(module_obj, method_name, None)
                if func_obj is not None and callable(func_obj):
                    # Filter out state/world/player arguments
                    filtered_args = self._filter_special_args(args_with_nodes)

                    # Create helper result
                    result = self._make_helper_rule(method_name, filtered_args, filtered_kwargs)
                    logging.debug(f"Created helper result for module function: {result}")

                    # Register for automatic discovery WITH the function object
                    # This allows the base class to auto-detect the module path
                    self._register_helper_usage(method_name, func_obj)
                    return result
                else:
                    logging.debug(f"Could not find callable '{method_name}' in module {obj_name}")

            # Handle options.X.to_bool() method calls at analysis time
            # This is critical for options like OpenPyramid that have custom to_bool() logic
            # which checks other settings (e.g., goal type) rather than just truthiness.
            # We evaluate to_bool() at analysis time since it only depends on settings, not game state.
            elif method_name == 'to_bool':
                logging.debug(f"Processing potential option to_bool call")
                # Check if the object is a setting_value or option_value (options access pattern)
                # Note: expression_visitors.py creates 'option_value' type, but older code may use 'setting_value'
                # Also handle 'attribute' type from AST chains like world.worlds[player].options.X
                func_object = func_info.get('object', {})
                func_obj_type = func_object.get('type')
                setting_name = None
                if func_obj_type in ('setting_value', 'option_value'):
                    # Handle both key names: 'setting' (legacy) and 'option' (current)
                    setting_name = func_object.get('setting') or func_object.get('option')
                elif func_obj_type == 'attribute':
                    # Handle attribute chain like {attr: 'open_pyramid', object: {attr: 'options', ...}}
                    # Extract setting name if this is an options.X access pattern
                    setting_name = self._extract_setting_from_attribute_chain(func_object)
                if setting_name:
                    logging.debug(f"to_bool called on setting: {setting_name}")

                    # Try to get the actual option object and call to_bool()
                    # closure_vars may contain 'world' (player's world with .options)
                    # or 'multiworld' (the MultiWorld with .worlds dict)
                    world_or_multiworld = self.closure_vars.get('world') or self.closure_vars.get('multiworld')
                    if world_or_multiworld is not None and setting_name:
                        try:
                            # Determine if we have the player's world or the multiworld
                            if hasattr(world_or_multiworld, 'options'):
                                # We have the player's world directly
                                player_world = world_or_multiworld
                                multiworld = getattr(world_or_multiworld, 'multiworld', None)
                                player = getattr(world_or_multiworld, 'player', 1)
                            elif hasattr(world_or_multiworld, 'worlds'):
                                # We have the multiworld - get player's world
                                multiworld = world_or_multiworld
                                player = self.player_context if hasattr(self, 'player_context') and self.player_context else 1
                                player_world = multiworld.worlds.get(player)
                                if player_world is None:
                                    logging.warning(f"Could not get player world for player {player}")
                                    player_world = world_or_multiworld
                            else:
                                # Fallback - try to use it as player's world
                                player_world = world_or_multiworld
                                multiworld = None
                                player = 1

                            # Get the option object from player's world
                            option_obj = getattr(player_world.options, setting_name, None) if hasattr(player_world, 'options') else None
                            if option_obj is not None and hasattr(option_obj, 'to_bool'):
                                # Call to_bool with appropriate arguments
                                # to_bool(world, player) signature - world here is multiworld
                                if multiworld is not None:
                                    result_value = option_obj.to_bool(multiworld, player)
                                else:
                                    # Fallback: try calling with just the value's truthiness
                                    result_value = bool(option_obj.value)

                                logging.debug(f"Evaluated {setting_name}.to_bool() = {result_value}")
                                return {'type': 'constant', 'value': result_value}
                            else:
                                logging.debug(f"Option {setting_name} has no to_bool method, falling back to value truthiness")
                                if option_obj is not None and hasattr(option_obj, 'value'):
                                    return {'type': 'constant', 'value': bool(option_obj.value)}
                        except Exception as e:
                            logging.warning(f"Failed to evaluate {setting_name}.to_bool(): {e}")
                            # Return OptionValue so the option check is preserved in export
                            # This is better than losing the option check entirely
                            logging.debug(f"Returning OptionValue fallback for {setting_name}")
                            return {'type': 'option_value', 'option': setting_name}

                    # If we have a setting name but couldn't evaluate, return OptionValue
                    if setting_name:
                        logging.debug(f"Could not evaluate to_bool, returning OptionValue for {setting_name}")
                        return {'type': 'option_value', 'option': setting_name}

                # If we can't resolve to_bool at analysis time, let the converter handle it
                logging.debug(f"Could not evaluate to_bool at analysis time, falling through")

            # Handle Location and Region object method calls (e.g., loc.can_reach(state) or region.can_reach(state))
            elif obj_name and method_name == 'can_reach':
                logging.debug(f"Processing potential Location/Region method call: {obj_name}.{method_name}")

                # Try to resolve the object from closure_vars
                resolved_obj = self.expression_resolver.resolve_variable(obj_name)

                # Check if we successfully resolved an object with a 'name' attribute
                if resolved_obj is not None and hasattr(resolved_obj, 'name') and isinstance(resolved_obj.name, str):
                    # Determine object type:
                    # - Entrance: has 'connected_region' (must check BEFORE Location since both have parent_region)
                    # - Region: has 'entrances'
                    # - Location: has 'parent_region' but neither 'entrances' nor 'connected_region'
                    has_connected_region = hasattr(resolved_obj, 'connected_region')
                    has_entrances = hasattr(resolved_obj, 'entrances')
                    if has_connected_region:
                        obj_type = 'Entrance'
                    elif has_entrances:
                        obj_type = 'Region'
                    else:
                        obj_type = 'Location'
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

            # Handle list method calls (e.g., buildings.index("Stacker"))
            # When the object is a constant list, evaluate the method at analysis time
            elif func_info['object'].get('type') == 'constant' and isinstance(func_info['object'].get('value'), list):
                list_value = func_info['object']['value']
                logging.debug(f"Processing list method call: list.{method_name} on {list_value}")

                if method_name == 'index' and len(args) >= 1:
                    # Evaluate list.index(value) at analysis time
                    search_arg = args[0]
                    if search_arg.get('type') == 'constant':
                        search_value = search_arg['value']
                        try:
                            index_result = list_value.index(search_value)
                            logging.debug(f"Evaluated list.index({search_value}) = {index_result}")
                            return {'type': 'constant', 'value': index_result}
                        except ValueError:
                            logging.debug(f"list.index({search_value}) raised ValueError - value not in list")
                            # Return -1 for not found (Python raises ValueError, but -1 is more useful)
                            return {'type': 'constant', 'value': -1}
                    else:
                        logging.debug(f"list.index argument is not a constant, keeping as method_call")

                # Handle set-like methods on lists (sets from closures are converted to lists)
                # This enables evaluation of patterns like: front_locked_locations.union({...})
                elif method_name == 'union' and len(args) >= 1:
                    # Evaluate set.union(other) at analysis time
                    # Treat the list as a set and combine with the argument
                    other_arg = args[0]
                    other_elements = self._extract_set_elements(other_arg)
                    if other_elements is not None:
                        # Convert to sets for proper union (handles duplicates)
                        base_set = set(tuple(x) if isinstance(x, list) else x for x in list_value)
                        other_set = set(tuple(x) if isinstance(x, list) else x for x in other_elements)
                        # Perform union and convert back to sorted list
                        union_result = base_set | other_set
                        # Convert tuples back to lists for JSON serialization
                        result_list = sorted([list(x) if isinstance(x, tuple) else x for x in union_result], key=lambda x: str(x))
                        logging.debug(f"Evaluated list.union(...) = {result_list}")
                        return {'type': 'constant', 'value': result_list}
                    else:
                        logging.debug(f"list.union argument could not be resolved, keeping as method_call")

                elif method_name == 'intersection' and len(args) >= 1:
                    # Evaluate set.intersection(other) at analysis time
                    other_arg = args[0]
                    other_elements = self._extract_set_elements(other_arg)
                    if other_elements is not None:
                        base_set = set(tuple(x) if isinstance(x, list) else x for x in list_value)
                        other_set = set(tuple(x) if isinstance(x, list) else x for x in other_elements)
                        intersection_result = base_set & other_set
                        result_list = sorted([list(x) if isinstance(x, tuple) else x for x in intersection_result], key=lambda x: str(x))
                        logging.debug(f"Evaluated list.intersection(...) = {result_list}")
                        return {'type': 'constant', 'value': result_list}
                    else:
                        logging.debug(f"list.intersection argument could not be resolved, keeping as method_call")

                elif method_name == 'difference' and len(args) >= 1:
                    # Evaluate set.difference(other) at analysis time
                    other_arg = args[0]
                    other_elements = self._extract_set_elements(other_arg)
                    if other_elements is not None:
                        base_set = set(tuple(x) if isinstance(x, list) else x for x in list_value)
                        other_set = set(tuple(x) if isinstance(x, list) else x for x in other_elements)
                        difference_result = base_set - other_set
                        result_list = sorted([list(x) if isinstance(x, tuple) else x for x in difference_result], key=lambda x: str(x))
                        logging.debug(f"Evaluated list.difference(...) = {result_list}")
                        return {'type': 'constant', 'value': result_list}
                    else:
                        logging.debug(f"list.difference argument could not be resolved, keeping as method_call")

                # For other list methods or when we can't evaluate, create a method_call structure
                result = {
                    'type': 'method_call',
                    'object': func_info['object'],
                    'method': method_name,
                    'args': args
                }
                logging.debug(f"Created method_call result: {result}")
                return result

            # Handle dictionary method calls (e.g., some_dict.keys(), some_dict.values())
            # When the object is a constant dict, evaluate the method at analysis time
            # This can be disabled via evaluate_dict_methods=False on the RuleAnalyzer
            elif (getattr(self, 'evaluate_dict_methods', True) and
                  func_info['object'].get('type') == 'constant' and
                  isinstance(func_info['object'].get('value'), dict)):
                dict_value = func_info['object']['value']
                logging.debug(f"Processing dict method call: dict.{method_name} on dict with {len(dict_value)} keys")

                if method_name == 'keys':
                    # Evaluate dict.keys() at analysis time - return sorted list of keys
                    keys_list = sorted(list(dict_value.keys()), key=lambda x: str(x))
                    logging.debug(f"Evaluated dict.keys() = {keys_list}")
                    return {'type': 'constant', 'value': keys_list}

                elif method_name == 'values':
                    # Evaluate dict.values() at analysis time - return list of values
                    values_list = list(dict_value.values())
                    logging.debug(f"Evaluated dict.values() = {values_list}")
                    return {'type': 'constant', 'value': values_list}

                elif method_name == 'items':
                    # Evaluate dict.items() at analysis time - return list of [key, value] pairs
                    items_list = [[k, v] for k, v in sorted(dict_value.items(), key=lambda x: str(x[0]))]
                    logging.debug(f"Evaluated dict.items() = {items_list}")
                    return {'type': 'constant', 'value': items_list}

                elif method_name == 'get' and len(args) >= 1:
                    # Evaluate dict.get(key) or dict.get(key, default) at analysis time
                    key_arg = args[0]
                    if key_arg.get('type') == 'constant':
                        key = key_arg['value']
                        default = None
                        if len(args) >= 2 and args[1].get('type') == 'constant':
                            default = args[1]['value']
                        result_value = dict_value.get(key, default)
                        logging.debug(f"Evaluated dict.get({key}, {default}) = {result_value}")
                        return {'type': 'constant', 'value': result_value}
                    else:
                        logging.debug(f"dict.get key argument is not a constant, keeping as method_call")

                # For other dict methods or when we can't evaluate, create a method_call structure
                result = {
                    'type': 'method_call',
                    'object': func_info['object'],
                    'method': method_name,
                    'args': args
                }
                logging.debug(f"Created method_call result for dict: {result}")
                return result

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
                    result = self._make_helper_rule(method_name, filtered_args, filtered_kwargs)
                    logging.debug(f"Created helper result for module method: {result}")
                    # Register for automatic discovery
                    self._register_helper_usage(method_name)
                    return result

        # 3. Fallback for other types of calls (e.g., calling result of another function)
        logging.debug(f"Fallback function call type. func_info = {func_info}")
        filtered_args = self._filter_special_args(args_with_nodes)
        result: Dict[str, Any] = {
            'type': 'function_call',
            'function': func_info,
        }
        if filtered_args:
            result['args'] = filtered_args
        logging.debug(f"Fallback call result: {result}")
        return result # Return generic function call result

    def _extract_setting_from_attribute_chain(self, attr_node: Dict[str, Any]) -> Optional[str]:
        """Extract setting name from an attribute chain representing option access.

        Handles patterns like:
        - {type: 'attribute', attr: 'open_pyramid', object: {type: 'attribute', attr: 'options', ...}}
        - The setting name is the attr when its parent object has attr='options'

        Args:
            attr_node: An attribute-type node from the AST visitor

        Returns:
            The setting name if this is an options.X pattern, None otherwise
        """
        if attr_node.get('type') != 'attribute':
            return None

        setting_name = attr_node.get('attr')
        parent = attr_node.get('object', {})

        # Check if parent is options access: {type: 'attribute', attr: 'options', ...}
        if parent.get('type') == 'attribute' and parent.get('attr') == 'options':
            return setting_name

        return None

    def _extract_set_elements(self, arg: Dict[str, Any]) -> Optional[list]:
        """Extract a list of elements from a set/tuple/list/constant structure.

        This handles various representations of collections in the AST:
        - {'type': 'constant', 'value': [...]} - direct constant value
        - {'type': 'set', 'elements': [...]} - set literal from AST
        - {'type': 'tuple', 'elements': [...]} - tuple literal from AST
        - {'type': 'list', 'value': [...]} - list literal from AST

        For set operations like union/intersection/difference, we need to extract
        the actual values to perform the operation at analysis time.

        Args:
            arg: The analyzed argument structure

        Returns:
            A list of extracted values, or None if extraction failed
        """
        if not isinstance(arg, dict):
            return None

        arg_type = arg.get('type')

        # Handle constant values (already resolved)
        if arg_type == 'constant':
            value = arg.get('value')
            if isinstance(value, (list, tuple)):
                return list(value)
            else:
                return [value]

        # Handle set literals: {'type': 'set', 'elements': [...]}
        if arg_type == 'set':
            elements = arg.get('elements', [])
            return self._extract_elements_to_values(elements)

        # Handle tuple literals: {'type': 'tuple', 'elements': [...]}
        if arg_type == 'tuple':
            elements = arg.get('elements', [])
            extracted = self._extract_elements_to_values(elements)
            if extracted is not None:
                # Return as a single tuple element
                return [tuple(extracted)]
            return None

        # Handle list literals: {'type': 'list', 'value': [...]}
        if arg_type == 'list':
            elements = arg.get('value', [])
            return self._extract_elements_to_values(elements)

        logging.debug(f"_extract_set_elements: Cannot extract from type '{arg_type}'")
        return None

    def _extract_elements_to_values(self, elements: list) -> Optional[list]:
        """Extract values from a list of element structures.

        Args:
            elements: List of element dicts from set/tuple/list

        Returns:
            List of extracted values, or None if any element couldn't be extracted
        """
        result = []
        for elem in elements:
            if not isinstance(elem, dict):
                return None

            elem_type = elem.get('type')

            if elem_type == 'constant':
                result.append(elem.get('value'))
            elif elem_type == 'tuple':
                # Recursively extract tuple elements
                inner = self._extract_elements_to_values(elem.get('elements', []))
                if inner is None:
                    return None
                result.append(tuple(inner))
            elif elem_type == 'list':
                # Recursively extract list elements
                inner = self._extract_elements_to_values(elem.get('value', []))
                if inner is None:
                    return None
                result.append(inner)
            elif elem_type == 'name':
                # Try to resolve the name from closure/defaults
                name = elem.get('name')
                if name == 'player':
                    # player is typically 1 for single-player exports
                    result.append(1)
                elif name is None:
                    return None
                else:
                    resolved = self.expression_resolver.resolve_variable(name)
                    if resolved is not None:
                        result.append(resolved)
                    else:
                        logging.debug(f"_extract_elements_to_values: Cannot resolve name '{name}'")
                        return None
            else:
                logging.debug(f"_extract_elements_to_values: Cannot extract from element type '{elem_type}'")
                return None

        return result

    def _try_resolve_comprehension(self, comp_node: dict) -> Optional[list]:
        """Try to resolve a set/generator comprehension to a concrete list of values.

        For patterns like:
            {technology.name for technology in recipe.recursive_unlocking_technologies}

        This resolves the iterator to concrete values (using the expression resolver),
        then substitutes the target variable into the element expression for each value,
        collecting the resulting concrete values into a list.

        Args:
            comp_node: A dict with type 'set_comprehension' or 'generator_expression'
                       containing 'element' and 'comprehension' keys.

        Returns:
            A list of resolved values, or None if resolution fails.
        """
        comprehension = comp_node.get('comprehension', {})
        element = comp_node.get('element', {})

        # Get the target variable name
        target = comprehension.get('target', {})
        if isinstance(target, dict):
            target_name = target.get('name')
        elif isinstance(target, str):
            target_name = target
        else:
            return None

        if not target_name:
            return None

        # Try to resolve the iterator to concrete values
        iterator_expr = comprehension.get('iterator', {})
        iterator_values = self.expression_resolver.resolve_expression(iterator_expr)

        if iterator_values is None:
            logging.debug(f"_try_resolve_comprehension: Could not resolve iterator expression")
            return None

        # Must be iterable
        try:
            iter_list = list(iterator_values)
        except (TypeError, ValueError):
            logging.debug(f"_try_resolve_comprehension: Iterator value is not iterable: {type(iterator_values)}")
            return None

        if not iter_list:
            return []

        # For each value, substitute into the element expression and extract the result
        results = []
        for value in iter_list:
            substituted = self._substitute_variable_in_rule(element, target_name, value)
            if substituted is None:
                logging.debug(f"_try_resolve_comprehension: Substitution failed for value {value}")
                return None

            # Extract the concrete value from the substituted expression
            if isinstance(substituted, dict) and substituted.get('type') == 'constant':
                results.append(substituted.get('value'))
            elif isinstance(substituted, str):
                results.append(substituted)
            else:
                # Could not fully resolve
                logging.debug(f"_try_resolve_comprehension: Element did not resolve to constant: {substituted}")
                return None

        return results
