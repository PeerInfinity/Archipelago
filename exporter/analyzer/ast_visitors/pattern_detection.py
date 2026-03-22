"""
Pattern detection mixin for AST visitors.

This module contains helper methods for detecting common AST patterns
like world.options access, multiworld subscripts, etc.
"""

import ast
import logging
from typing import Any, Dict, Optional, Set, Tuple
from .base import BaseVisitorMixin


class PatternDetectionMixin(BaseVisitorMixin):
    """
    Mixin containing pattern detection helper methods.

    These methods are used by various visitors to detect common
    AST patterns and handle them specially.
    """

    def _is_world_player_subscript(self, node) -> bool:
        """
        Check if node is the pattern: state.multiworld.worlds[player]
        Also matches:
        - self.multiworld.worlds[player] for class-based helpers (e.g., RaftLogic)
        - world.worlds[player] where 'world' is the multiworld directly (e.g., ALTTP rules)
        - state.multiworld.worlds[1] where player is already resolved to a constant integer
          (common in worldgen rules where player is bound in the closure)
        Returns True if matched, False otherwise.

        AST structure (with multiworld):
        Subscript
          value=Attribute(attr='worlds')
            value=Attribute(attr='multiworld')
              value=Name(id='state', 'world', or 'self')
          slice=Name(id='player') OR Constant(value=<int>)

        AST structure (world is multiworld):
        Subscript
          value=Attribute(attr='worlds')
            value=Name(id='world')
          slice=Name(id='player') OR Constant(value=<int>)
        """
        if not isinstance(node, ast.Subscript):
            return False

        # Check slice: accept Name(id='player') or Constant(value=<int>)
        slice_ok = False
        if isinstance(node.slice, ast.Name) and node.slice.id == 'player':
            slice_ok = True
        elif isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, int):
            # Accept constant integer player numbers (common in worldgen rules)
            slice_ok = True
        elif isinstance(node.slice, ast.Num):
            # Python 3.7 compatibility
            slice_ok = True

        if not slice_ok:
            return False

        # Check .worlds
        worlds_attr = node.value
        if not isinstance(worlds_attr, ast.Attribute) or worlds_attr.attr != 'worlds':
            return False

        # Pattern 1: world.worlds[player] - world IS the multiworld
        # Used in games like ALTTP where 'world' parameter is the multiworld
        if isinstance(worlds_attr.value, ast.Name) and worlds_attr.value.id == 'world':
            return True

        # Pattern 2: state.multiworld.worlds[player] or self.multiworld.worlds[player]
        # Check .multiworld
        multiworld_attr = worlds_attr.value
        if not isinstance(multiworld_attr, ast.Attribute) or multiworld_attr.attr != 'multiworld':
            return False

        # Check state (or world, or self for class-based helpers like RaftLogic)
        state_name = multiworld_attr.value
        if not isinstance(state_name, ast.Name) or state_name.id not in ('state', 'world', 'self'):
            return False

        return True

    def _is_world_attribute_chain(self, obj_result) -> bool:
        """
        Check if obj_result is a 'world' name or an attribute chain rooted in 'world'.

        This is used to prevent resolving world attributes to constants during analysis,
        ensuring consistent output regardless of analysis order.

        Examples that return True:
        - {'type': 'name', 'name': 'world'}
        - {'type': 'attribute', 'object': {'type': 'name', 'name': 'world'}, 'attr': 'difficulty_requirements'}
        - {'type': 'attribute', 'object': {...nested world chain...}, 'attr': 'x'}

        Args:
            obj_result: The analyzed object result dictionary

        Returns:
            True if the object is rooted in 'world', False otherwise
        """
        if not isinstance(obj_result, dict):
            return False

        # Direct world name reference
        if obj_result.get('type') == 'name' and obj_result.get('name') == 'world':
            return True

        # Nested attribute chain - recursively check if it's rooted in world
        if obj_result.get('type') == 'attribute':
            return self._is_world_attribute_chain(obj_result.get('object'))

        return False

    def _is_world_options_pattern(self, node) -> Optional[str]:
        """
        Detect patterns accessing world settings/attributes:
        - state.multiworld.worlds[player].options.<setting>
        - state.multiworld.worlds[player].<attr>
        - state.multiworld.worlds[player].<attr1>.<attr2> (nested like difficulty_requirements.progressive_bottle_limit)
        - self.world.options.<setting> (class-based helpers like KH2)
        - world.options.<setting> (world as function parameter, like Paint helpers)
        - self.multiworld.worlds[player].options.<setting> (class-based helpers like RaftLogic)

        Returns the setting path as a dot-separated string if matched, None otherwise.

        IMPORTANT: Does NOT match patterns ending with .value (e.g., self.world.options.X.value)
        Those should be resolved by closure_vars to get the actual integer value.
        """
        if not isinstance(node, ast.Attribute):
            return None

        # Collect attribute chain from bottom up
        attrs = [node.attr]
        current = node.value

        # Walk up the attribute chain until we hit the worlds[player] subscript or self.world
        while isinstance(current, ast.Attribute):
            attrs.append(current.attr)
            current = current.value

        # Reverse to get top-down order
        attrs.reverse()

        # Check if we've reached the world player subscript (state.multiworld.worlds[player])
        if self._is_world_player_subscript(current):
            # Handle .options.<setting> pattern:
            # - ['options', 'setting_name'] -> 'setting_name' (converted to setting_value)
            #
            # Direct world attributes like hat_yarn_costs, hat_craft_order should NOT be
            # converted to setting_value. These are exported in game_info and should be
            # accessed as world.attr_name, which the frontend resolves from game_info.
            if attrs[0] == 'options' and len(attrs) >= 2:
                # Do NOT match if pattern ends with .value - let closure_vars resolve it
                # to get the actual integer value (e.g., dk_coins_for_gyrocopter.value -> 15)
                if attrs[-1] == 'value':
                    return None
                # Do NOT match if pattern ends with .to_bool - this is a method call
                # that needs to be evaluated at analysis time via call_visitor
                if attrs[-1] == 'to_bool':
                    return None
                # Remove 'options' prefix for .options.<setting> pattern
                return '.'.join(attrs[1:])
            else:
                # Check if this direct world attribute is mapped in SELF_ATTR_TO_SETTING
                # This handles patterns like state.multiworld.worlds[player].pyramid_keys_unlock
                # in worldgen rules where the original world uses self.pyramid_keys_unlock
                if len(attrs) == 1 and hasattr(self, 'game_handler') and self.game_handler is not None:
                    setting_mapping = getattr(self.game_handler, 'SELF_ATTR_TO_SETTING', {})
                    attr_name = attrs[0]
                    if attr_name in setting_mapping:
                        mapping_value = setting_mapping[attr_name]
                        if isinstance(mapping_value, dict):
                            return mapping_value.get('setting', attr_name)
                        else:
                            return mapping_value
                # Direct world attributes not in mapping - do NOT convert to setting_value
                # Let normal attribute handling create {type: 'attribute', object: world, attr: ...}
                return None

        # Check for self.world.options.<setting> pattern
        # This handles class-based helpers like KH2's level_locking_unlock
        # AST: self.world.options.Promise_Charm
        # attrs would be: ['world', 'options', 'Promise_Charm']
        # current would be: Name(id='self')
        #
        # IMPORTANT: Do NOT match if the pattern ends with '.value'
        # e.g., self.world.options.LuckyEmblemsRequired.value should NOT match
        # because the .value accessor should be resolved via closure_vars to get
        # the actual integer value, not create a setting_value lookup.
        if isinstance(current, ast.Name) and current.id == 'self':
            # Check for self.world.options.<setting> pattern
            if len(attrs) >= 3 and attrs[0] == 'world' and attrs[1] == 'options':
                # Do NOT match if pattern ends with .value - let closure_vars resolve it
                if attrs[-1] == 'value':
                    return None
                # Do NOT match if pattern ends with .to_bool - this is a method call
                # that needs to be evaluated at analysis time via call_visitor
                if attrs[-1] == 'to_bool':
                    return None
                # Return the setting name (everything after 'options')
                return '.'.join(attrs[2:])

        # Check for world.options.<setting> pattern (world as function parameter)
        # This handles helpers like Paint's calculate_paint_percent_available
        # which take 'world' as a parameter and access world.options.<setting>
        # AST: world.options.canvas_size_increment
        # attrs would be: ['options', 'canvas_size_increment']
        # current would be: Name(id='world')
        if isinstance(current, ast.Name) and current.id == 'world':
            if len(attrs) >= 2 and attrs[0] == 'options':
                # Do NOT match if pattern ends with .value - let closure_vars resolve it
                if attrs[-1] == 'value':
                    return None
                # Do NOT match if pattern ends with .to_bool - this is a method call
                # that needs to be evaluated at analysis time via call_visitor
                if attrs[-1] == 'to_bool':
                    return None
                # Return the setting name (everything after 'options')
                return '.'.join(attrs[1:])

        return None

    def _is_world_attribute_subscript_pattern(self, node) -> Tuple[Optional[str], Any]:
        """
        Detect the pattern: state.multiworld.worlds[player].<attr>[index]
        Returns (attr_name, index) tuple if matched, (None, None) otherwise.

        This handles patterns like:
        - state.multiworld.worlds[player].required_medallions[0]
        - state.multiworld.worlds[player].some_array[1]

        AST structure:
        Subscript(slice=Constant(N))
          value=Attribute(attr='<attr_name>')
            value=Subscript
              value=Attribute(attr='worlds')
                value=Attribute(attr='multiworld')
                  value=Name(id='state')
              slice=Name(id='player')
        """
        if not isinstance(node, ast.Subscript):
            return None, None

        # Get the index
        index_val = None
        if isinstance(node.slice, ast.Constant):
            index_val = node.slice.value
        elif isinstance(node.slice, ast.Num):  # Python 3.7 compatibility
            index_val = node.slice.n
        else:
            return None, None

        # Check that the value being subscripted is an attribute
        if not isinstance(node.value, ast.Attribute):
            return None, None

        attr_name = node.value.attr

        # Check [player] subscript on worlds
        subscript = node.value.value
        if not isinstance(subscript, ast.Subscript):
            return None, None

        # Accept Name(id='player') or Constant(value=<int>)
        slice_ok = False
        if isinstance(subscript.slice, ast.Name) and subscript.slice.id == 'player':
            slice_ok = True
        elif isinstance(subscript.slice, ast.Constant) and isinstance(subscript.slice.value, int):
            slice_ok = True
        elif isinstance(subscript.slice, ast.Num):
            slice_ok = True

        if not slice_ok:
            return None, None

        # Check .worlds
        worlds_attr = subscript.value
        if not isinstance(worlds_attr, ast.Attribute) or worlds_attr.attr != 'worlds':
            return None, None

        # Check .multiworld
        multiworld_attr = worlds_attr.value
        if not isinstance(multiworld_attr, ast.Attribute) or multiworld_attr.attr != 'multiworld':
            return None, None

        # Check state (or world)
        state_name = multiworld_attr.value
        if not isinstance(state_name, ast.Name) or state_name.id not in ('state', 'world'):
            return None, None

        return attr_name, index_val

    def _is_prog_items_pattern(self, node) -> Optional[str]:
        """
        Detect the pattern: state.prog_items[player][key]
        Returns the key (e.g., " coins") if matched, None otherwise.

        This handles DLCQuest and other games that use accumulator items
        stored in state.prog_items.

        AST structure:
        Subscript(slice=Constant(" coins"))  <- outer node
          value=Subscript(slice=Name("player"))
            value=Attribute(attr='prog_items')
              value=Name(id='state')
        """
        if not isinstance(node, ast.Subscript):
            return None

        # Get the key from the outer subscript slice
        if isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str):
            key: str = node.slice.value
        elif isinstance(node.slice, ast.Str) and isinstance(node.slice.value, str):  # Python 3.7 compatibility
            key = node.slice.value
        else:
            return None

        # Check inner subscript: [player]
        inner_subscript = node.value
        if not isinstance(inner_subscript, ast.Subscript):
            return None

        # Accept Name(id='player') or Constant(value=<int>)
        slice_ok = False
        if isinstance(inner_subscript.slice, ast.Name) and inner_subscript.slice.id == 'player':
            slice_ok = True
        elif isinstance(inner_subscript.slice, ast.Constant) and isinstance(inner_subscript.slice.value, int):
            slice_ok = True
        elif isinstance(inner_subscript.slice, ast.Num):
            slice_ok = True

        if not slice_ok:
            return None

        # Check attribute: .prog_items
        prog_items_attr = inner_subscript.value
        if not isinstance(prog_items_attr, ast.Attribute) or prog_items_attr.attr != 'prog_items':
            return None

        # Check name: state
        state_name = prog_items_attr.value
        if not isinstance(state_name, ast.Name) or state_name.id != 'state':
            return None

        return key

    def _is_multiworld_get_region_call(self, node) -> Optional[str]:
        """
        Detect the pattern: state.multiworld.get_region('Region Name', player)
        or: multiworld.get_region('Region Name', player)
        Returns the region name if matched, None otherwise.

        AST structures:
        1) Call
             func=Attribute(attr='get_region')
               value=Attribute(attr='multiworld')
                 value=Name(id='state')
             args=[Constant('Region Name'), Name(id='player')]

        2) Call
             func=Attribute(attr='get_region')
               value=Name(id='multiworld')
             args=[Constant('Region Name'), Name(id='player')]
        """
        if not isinstance(node, ast.Call):
            return None

        # Check func is an attribute access
        func = node.func
        if not isinstance(func, ast.Attribute) or func.attr != 'get_region':
            return None

        # Check the object is state.multiworld or just multiworld
        obj = func.value
        matched = False

        # Pattern 1: state.multiworld.get_region() or world.multiworld.get_region()
        if isinstance(obj, ast.Attribute) and obj.attr == 'multiworld':
            state_name = obj.value
            if isinstance(state_name, ast.Name) and state_name.id in ('state', 'world'):
                matched = True

        # Pattern 2: multiworld.get_region() where multiworld is a closure variable
        if not matched and isinstance(obj, ast.Name) and obj.id == 'multiworld':
            matched = True

        if not matched:
            return None

        # Get the region name from the first argument
        if len(node.args) < 1:
            return None

        first_arg = node.args[0]
        if isinstance(first_arg, ast.Constant) and isinstance(first_arg.value, str):
            return first_arg.value
        elif isinstance(first_arg, ast.Str) and isinstance(first_arg.value, str):  # Python 3.7 compatibility
            return first_arg.value

        return None

    def _is_region_parameter_attribute(self, node, region_param_names: Optional[Set[str]] = None) -> Tuple[Optional[str], Optional[str]]:
        """
        Detect access to region parameter attributes like region.is_light_world.

        This is used when a helper function takes a region as a parameter
        and accesses its attributes within the function body.

        Args:
            node: The AST Attribute node
            region_param_names: Set of parameter names that are known to be regions
                              (e.g., {'region', 'cave'})

        Returns:
            Tuple of (param_name, attr_name) if matched, (None, None) otherwise.
        """
        if not isinstance(node, ast.Attribute):
            return None, None

        attr_name = node.attr

        # Only handle known region attributes
        if attr_name not in ('is_light_world', 'is_dark_world', 'name'):
            return None, None

        # Check if the object is a Name node (variable reference)
        if not isinstance(node.value, ast.Name):
            return None, None

        param_name = node.value.id

        # Check if this is a walrus operator variable that should be resolved
        # to the original region parameter
        if hasattr(self, 'walrus_assignments') and param_name in self.walrus_assignments:
            walrus_value = self.walrus_assignments[param_name]
            # Extract the region parameter from the walrus assignment
            # The walrus value might be a conditional (isinstance check) or direct name
            resolved_param = self._extract_region_param_from_walrus(walrus_value)
            if resolved_param:
                logging.debug(f"Resolved walrus variable {param_name} to region param {resolved_param}")
                return resolved_param, attr_name

        # If we have a list of known region parameters, check against it
        if region_param_names is not None:
            if param_name not in region_param_names:
                return None, None
        else:
            # Default known region parameter names
            # Note: walrus operator variables like '_r' are handled by
            # _extract_region_param_from_walrus above, so they don't need
            # to be in this list
            if param_name not in ('region', 'cave', 'r', 'reg'):
                return None, None

        return param_name, attr_name

    def _extract_region_param_from_walrus(self, walrus_value: Dict[str, Any]) -> Optional[str]:
        """
        Extract the original region parameter name from a walrus assignment value.

        Handles patterns like:
            - {"type": "name", "name": "region"} -> "region"
            - {"type": "conditional", ..., "if_false": {"type": "name", "name": "region"}} -> "region"
            - Nested function calls that reference region parameter

        Returns the region parameter name if found, None otherwise.
        """
        if not isinstance(walrus_value, dict):
            return None

        value_type = walrus_value.get('type')

        # Direct name reference
        if value_type == 'name':
            name = walrus_value.get('name', '')
            if name in ('region', 'cave', 'r', 'reg'):
                return name

        # Conditional expression (isinstance check pattern)
        # e.g., get_region(region, player) if isinstance(region, str) else region
        if value_type == 'conditional':
            # Check the if_false branch for the direct region reference
            if_false = walrus_value.get('if_false', {})
            if isinstance(if_false, dict) and if_false.get('type') == 'name':
                name = if_false.get('name', '')
                if name in ('region', 'cave', 'r', 'reg'):
                    return name
            # Also check if_true for the region name in function call args
            if_true = walrus_value.get('if_true', {})
            return self._extract_region_param_from_walrus(if_true)

        # Function call (e.g., get_region(region, player))
        if value_type == 'function_call':
            args = walrus_value.get('args', [])
            for arg in args:
                if isinstance(arg, dict) and arg.get('type') == 'name':
                    name = arg.get('name', '')
                    if name in ('region', 'cave', 'r', 'reg'):
                        return name

        return None

    def _try_handle_entrance_access_rule(self, node) -> Optional[Dict[str, Any]]:
        """
        Detect and handle the pattern: entrance_var.access_rule(...)
        where entrance_var is an Entrance object in closure_vars.

        This pattern appears in ALttP UnderworldGlitchRules.py:
            dungeon_entrance = [r for r in world.get_region(...).entrances if r.name != clip.name][0]
            add_rule(clip, lambda state: dungeon_entrance.access_rule(fake_pearl_state(state, player)))

        The dungeon_entrance variable is a closure capture of an Entrance object.
        We export this as an EntranceAccessRule that can be resolved at runtime
        by looking up the entrance's access_rule from the exported region data.

        Args:
            node: The AST Call node to check

        Returns:
            An EntranceAccessRule dict if pattern matches, None otherwise
        """
        if not isinstance(node, ast.Call):
            return None

        # Check if func is an attribute access
        func = node.func
        if not isinstance(func, ast.Attribute):
            return None

        attr_name = func.attr

        # We're looking for .access_rule or .can_reach patterns
        if attr_name not in ('access_rule', 'can_reach'):
            return None

        # Check if the object is a simple name (variable reference)
        if not isinstance(func.value, ast.Name):
            return None

        var_name = func.value.id

        # Check if the variable is in closure_vars
        if not hasattr(self, 'closure_vars') or var_name not in self.closure_vars:
            return None

        closure_obj = self.closure_vars[var_name]

        # Check if it's an Entrance object (has 'connected_region' attribute)
        # This distinguishes Entrance from Location (which has parent_region but not connected_region)
        if not hasattr(closure_obj, 'connected_region') or not hasattr(closure_obj, 'name'):
            return None

        entrance_name = closure_obj.name
        logging.debug(f"_try_handle_entrance_access_rule: Detected {var_name}.{attr_name} on Entrance '{entrance_name}'")

        # Check if any argument is a fake_pearl_state call
        has_fake_pearl = False
        for arg in node.args:
            if isinstance(arg, ast.Call):
                if isinstance(arg.func, ast.Name) and arg.func.id == 'fake_pearl_state':
                    has_fake_pearl = True
                    break
                elif isinstance(arg.func, ast.Attribute) and arg.func.attr == 'fake_pearl_state':
                    has_fake_pearl = True
                    break

        if attr_name == 'access_rule':
            # Export as EntranceAccessRule
            result = {
                'rule': 'EntranceAccessRule',
                'args': {
                    'entrance_name': entrance_name,
                    'fake_pearl': has_fake_pearl
                }
            }
            logging.debug(f"_try_handle_entrance_access_rule: Exported as EntranceAccessRule: {result}")
            return result
        elif attr_name == 'can_reach':
            # For can_reach, convert to state_method can_reach with Entrance type
            # This is already handled elsewhere, but we can provide a consistent output
            result = {
                'type': 'state_method',
                'method': 'can_reach',
                'args': [
                    {'type': 'constant', 'value': entrance_name},
                    {'type': 'constant', 'value': 'Entrance'}
                ]
            }
            if has_fake_pearl:
                result['fake_pearl'] = True
            logging.debug(f"_try_handle_entrance_access_rule: Converted can_reach to state_method: {result}")
            return result

        return None

    def _try_inline_namedtuple_callable(self, node) -> Optional[Dict[str, Any]]:
        """
        Detect and inline callable attributes on NamedTuple closure variables.

        Pattern: loc.access_rule(state, player) where:
        - loc is a NamedTuple in closure_vars (e.g., LocationData)
        - access_rule is an attribute that holds a callable (function)

        This handles apworlds like rac2 that store rule functions in LocationData NamedTuples.
        Instead of creating a non-functional reference, we inline the actual rule function.

        Returns:
            The analyzed rule dict if the pattern matches, None otherwise.
        """
        if not isinstance(node, ast.Call):
            return None

        # Check if func is an attribute access
        func = node.func
        if not isinstance(func, ast.Attribute):
            return None

        attr_name = func.attr

        # Check if the object is a simple name (variable reference)
        if not isinstance(func.value, ast.Name):
            return None

        var_name = func.value.id

        # Check if the variable is in closure_vars
        if not hasattr(self, 'closure_vars') or var_name not in self.closure_vars:
            return None

        closure_obj = self.closure_vars[var_name]

        # Check if it's a NamedTuple (has _fields) with the requested attribute
        if not hasattr(closure_obj, '_fields') or not hasattr(closure_obj, attr_name):
            return None

        attr_value = getattr(closure_obj, attr_name, None)

        # Check if the attribute is a callable
        if attr_value is None or not callable(attr_value):
            return None

        logging.debug(f"_try_inline_namedtuple_callable: Detected {var_name}.{attr_name} as callable on NamedTuple")

        # Inline the callable by analyzing it recursively
        from ..analysis import analyze_rule
        analyzed = analyze_rule(
            rule_func=attr_value,
            closure_vars=self.closure_vars.copy(),
            seen_funcs=self.seen_funcs,
            game_handler=self.game_handler,
            player_context=self.player_context,
            rule_target_name=getattr(self, 'rule_target_name', None),
            target_type=getattr(self, 'target_type', None)
        )

        if analyzed and analyzed.get('type') != 'error':
            logging.debug(f"_try_inline_namedtuple_callable: Successfully inlined {var_name}.{attr_name}: {analyzed.get('type')}")
            return analyzed
        else:
            logging.warning(f"_try_inline_namedtuple_callable: Failed to analyze {var_name}.{attr_name}")
            return None

    def _try_handle_dict_lambda_lookup(self, node) -> Optional[Dict[str, Any]]:
        """
        Detect and handle the pattern: dict.get(key, default)(state)
        where dict contains callable (lambda) values.

        This pattern is common in ALttP underworld glitch rules:
            rule_map = {
                'Misery Mire (Entrance)': (lambda state: True),
                'Tower of Hera (Bottom)': (lambda state: state.can_reach(...))
            }
            rule_map.get(world.get_entrance('X').connected_region.name, lambda state: False)(state)

        Args:
            node: The AST Call node to check

        Returns:
            A dict_lambda_lookup rule structure if pattern matches, None otherwise
        """
        if not isinstance(node, ast.Call):
            return None

        # The outer call should have 'state' as the argument
        # Pattern: something(state) or something(state, player)
        has_state_arg = False
        for arg in node.args:
            if isinstance(arg, ast.Name) and arg.id == 'state':
                has_state_arg = True
                break
        if not has_state_arg:
            return None

        # The function being called should be another Call (dict.get(...))
        if not isinstance(node.func, ast.Call):
            return None

        inner_call = node.func

        # Inner call should be attribute.get (dict.get)
        if not isinstance(inner_call.func, ast.Attribute):
            return None
        if inner_call.func.attr != 'get':
            return None

        # The object should be a variable name (the dict)
        if not isinstance(inner_call.func.value, ast.Name):
            return None

        dict_var_name = inner_call.func.value.id
        logging.debug(f"_try_handle_dict_lambda_lookup: Detected potential dict.get pattern with dict '{dict_var_name}'")

        # Get the dict from closure variables
        if not hasattr(self, 'closure_vars') or dict_var_name not in self.closure_vars:
            logging.debug(f"_try_handle_dict_lambda_lookup: Dict '{dict_var_name}' not found in closure_vars")
            return None

        dict_value = self.closure_vars[dict_var_name]
        if not isinstance(dict_value, dict):
            logging.debug(f"_try_handle_dict_lambda_lookup: '{dict_var_name}' is not a dict")
            return None

        # Check if dict values are callable (lambdas)
        has_callable_values = any(callable(v) for v in dict_value.values())
        if not has_callable_values:
            logging.debug(f"_try_handle_dict_lambda_lookup: Dict '{dict_var_name}' has no callable values")
            return None

        logging.debug(f"_try_handle_dict_lambda_lookup: Found dict with callable values, analyzing...")

        # Get the key expression (first arg to .get)
        if len(inner_call.args) < 1:
            return None

        key_node = inner_call.args[0]
        key_result = self.visit(key_node)

        # Get the default value (second arg to .get, or False if not provided)
        default_result = {'rule': 'False_'}
        if len(inner_call.args) >= 2:
            default_node = inner_call.args[1]
            # If default is a lambda, analyze it
            if isinstance(default_node, ast.Lambda):
                default_result = self.visit(default_node)
            elif isinstance(default_node, ast.Name) and default_node.id in self.closure_vars:
                default_val = self.closure_vars[default_node.id]
                if callable(default_val):
                    from ..analysis import analyze_rule
                    analyzed = analyze_rule(
                        rule_func=default_val,
                        closure_vars=self.closure_vars.copy(),
                        seen_funcs=self.seen_funcs,
                        game_handler=self.game_handler,
                        player_context=self.player_context
                    )
                    if analyzed and analyzed.get('type') != 'error':
                        default_result = analyzed
            elif isinstance(default_node, ast.Constant) and default_node.value is False:
                default_result = {'rule': 'False_'}

        # Analyze each lambda value in the dict
        from ..analysis import analyze_rule
        analyzed_cases = {}
        for key, value in dict_value.items():
            if callable(value):
                analyzed = analyze_rule(
                    rule_func=value,
                    closure_vars=self.closure_vars.copy(),
                    seen_funcs=self.seen_funcs,
                    game_handler=self.game_handler,
                    player_context=self.player_context
                )
                if analyzed and analyzed.get('type') != 'error':
                    analyzed_cases[key] = analyzed
                    logging.debug(f"_try_handle_dict_lambda_lookup: Analyzed case '{key}': {analyzed.get('type')}")
                else:
                    logging.warning(f"_try_handle_dict_lambda_lookup: Failed to analyze case '{key}'")
                    # Use True_ as fallback for failed analysis
                    analyzed_cases[key] = {'rule': 'True_'}
            else:
                # Non-callable value - convert to constant
                if value is True:
                    analyzed_cases[key] = {'rule': 'True_'}
                elif value is False:
                    analyzed_cases[key] = {'rule': 'False_'}
                else:
                    analyzed_cases[key] = {'type': 'constant', 'value': value}

        logging.debug(f"_try_handle_dict_lambda_lookup: Successfully analyzed {len(analyzed_cases)} cases")

        # Create the dict_lambda_lookup rule structure
        result = {
            'type': 'dict_lambda_lookup',
            'dict_name': dict_var_name,
            'key': key_result,
            'cases': analyzed_cases,
            'default': default_result
        }

        return result
