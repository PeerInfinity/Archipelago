"""LogicMixin analysis for automatic STATE_METHOD_REPLACEMENTS generation.

This module provides functionality to automatically detect and analyze
LogicMixin methods that follow common patterns, generating appropriate
rule replacements without requiring manual configuration.

Supported patterns:
1. Simple attribute access:
   def _game_setting(self, player): return self.multiworld.worlds[player].setting_name
   -> {'type': 'setting_value', 'setting': 'setting_name'}

2. Negated attribute access:
   def _game_not_setting(self, player): return not self.multiworld.worlds[player].setting_name
   -> {'type': 'not', 'operand': {'type': 'setting_value', 'setting': 'setting_name'}}

3. Boolean option value access:
   def _game_option(self, player): return bool(self.multiworld.worlds[player].options.option_name.value)
   -> {'type': 'setting_value', 'setting': 'option_name'}

4. All elements pass check pattern:
   def _game_all_check(self, player):
       items = self.multiworld.worlds[player].some_attr.items
       for item in items:
           if not self.can_reach_location(item, player):  # or state.has(), self.can_reach()
               return False
       return True
   -> {'type': 'all_of', 'iterable': ..., 'element_rule': {'type': 'location_check|item_check|can_reach', ...}}

   Supported check types:
   - self.can_reach_location(var, player) -> location_check
   - state.has(var, player) / self.has(var, player) -> item_check
   - state.can_reach(var, player) -> can_reach (region)

Manual overrides via STATE_METHOD_REPLACEMENTS always take precedence over
auto-detected patterns.
"""

import ast
import inspect
import logging
from typing import Any, Dict, List, Optional, Set, Tuple, Type

logger = logging.getLogger(__name__)


def discover_logic_mixin_classes(world_module) -> List[Type]:
    """Discover all LogicMixin subclasses in a world module.

    Args:
        world_module: The world module to search (e.g., worlds.tww)

    Returns:
        List of LogicMixin subclass types found in the module
    """
    from worlds.AutoWorld import LogicMixin

    logic_classes = []

    # Check all attributes of the module
    for name in dir(world_module):
        try:
            obj = getattr(world_module, name)
            # Check if it's a class that inherits from LogicMixin
            if (isinstance(obj, type) and
                issubclass(obj, LogicMixin) and
                obj is not LogicMixin):
                logic_classes.append(obj)
                logger.debug(f"Discovered LogicMixin class: {obj.__name__}")
        except Exception as e:
            logger.debug(f"Error checking {name}: {e}")

    return logic_classes


def analyze_logic_mixin_method(method) -> Optional[Dict[str, Any]]:
    """Analyze a LogicMixin method to detect common patterns.

    Args:
        method: The method to analyze

    Returns:
        A rule replacement dict if a pattern is detected, None otherwise
    """
    try:
        source = inspect.getsource(method)
        # Use textwrap.dedent to properly handle indentation while preserving
        # relative indentation (unlike cleandoc which can break Python syntax)
        import textwrap
        source = textwrap.dedent(source)
        tree = ast.parse(source)
    except (OSError, TypeError, SyntaxError) as e:
        logger.debug(f"Could not parse source for {method.__name__}: {e}")
        return None

    # Find the function definition
    func_def = None
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            func_def = node
            break

    if not func_def:
        return None

    # Look for return statements
    return_stmts = [node for node in ast.walk(func_def) if isinstance(node, ast.Return)]

    if len(return_stmts) == 1:
        # Single return - try simple patterns
        return_value = return_stmts[0].value
        if return_value is not None:
            # Try to match simple patterns
            result = _match_simple_attribute_pattern(return_value)
            if result:
                logger.debug(f"{method.__name__}: Matched simple attribute pattern -> {result}")
                return result

            result = _match_negated_attribute_pattern(return_value)
            if result:
                logger.debug(f"{method.__name__}: Matched negated attribute pattern -> {result}")
                return result

            result = _match_bool_option_pattern(return_value)
            if result:
                logger.debug(f"{method.__name__}: Matched bool option pattern -> {result}")
                return result

            result = _match_option_in_pattern(return_value)
            if result:
                logger.debug(f"{method.__name__}: Matched option 'in' pattern -> {result}")
                return result

    # Try complex patterns that may have multiple returns
    result = _match_all_check_pattern(func_def)
    if result:
        logger.debug(f"{method.__name__}: Matched all_check pattern -> {result}")
        return result

    logger.debug(f"{method.__name__}: No pattern matched")
    return None


def _match_simple_attribute_pattern(node: ast.expr) -> Optional[Dict[str, Any]]:
    """Match: self.multiworld.worlds[player].<attr>

    Returns {'type': 'world_attribute', 'attribute': '<attr>'}
    """
    if not isinstance(node, ast.Attribute):
        return None

    attr_name = node.attr

    # Check for self.multiworld.worlds[player].<attr> pattern
    if _is_world_subscript(node.value):
        return {'type': 'world_attribute', 'attribute': attr_name}

    return None


def _match_negated_attribute_pattern(node: ast.expr) -> Optional[Dict[str, Any]]:
    """Match: not self.multiworld.worlds[player].<attr>

    Returns {'type': 'not', 'operand': {'type': 'world_attribute', 'attribute': '<attr>'}}
    """
    if not isinstance(node, ast.UnaryOp):
        return None

    if not isinstance(node.op, ast.Not):
        return None

    inner_result = _match_simple_attribute_pattern(node.operand)
    if inner_result:
        return {'type': 'not', 'operand': inner_result}

    return None


def _match_bool_option_pattern(node: ast.expr) -> Optional[Dict[str, Any]]:
    """Match: bool(self.multiworld.worlds[player].options.<option>.value)

    Returns {'type': 'option_value', 'option': '<option>'}
    """
    # Check for bool(...) call
    if not isinstance(node, ast.Call):
        return None

    if not (isinstance(node.func, ast.Name) and node.func.id == 'bool'):
        return None

    if len(node.args) != 1:
        return None

    inner = node.args[0]

    # Check for .value attribute access
    if not isinstance(inner, ast.Attribute) or inner.attr != 'value':
        return None

    # Check for .options.<option_name> pattern
    options_access = inner.value
    if not isinstance(options_access, ast.Attribute):
        return None

    option_name = options_access.attr

    # Check for .options
    if not isinstance(options_access.value, ast.Attribute) or options_access.value.attr != 'options':
        return None

    # Check for self.multiworld.worlds[player]
    if _is_world_subscript(options_access.value.value):
        return {'type': 'option_value', 'option': option_name}

    return None


def _match_option_in_pattern(node: ast.expr) -> Optional[Dict[str, Any]]:
    """Match: self.multiworld.worlds[player].options.<option> in (value1, value2, ...)

    This pattern is used for checking if an option is one of several values.
    Returns {'type': 'setting_in', 'setting': '<option>', 'values': [value1, value2, ...]}
    """
    if not isinstance(node, ast.Compare):
        return None

    if len(node.ops) != 1 or not isinstance(node.ops[0], ast.In):
        return None

    if len(node.comparators) != 1:
        return None

    left = node.left
    right = node.comparators[0]

    # Check for options.<option> pattern on the left
    if not isinstance(left, ast.Attribute):
        return None

    option_name = left.attr

    # Check for .options
    if not isinstance(left.value, ast.Attribute) or left.value.attr != 'options':
        return None

    # Check for self.multiworld.worlds[player] or world
    if not (_is_world_subscript(left.value.value) or _is_simple_world_ref(left.value.value)):
        return None

    # Extract values from the tuple/list on the right
    if isinstance(right, (ast.Tuple, ast.List)):
        values = []
        for elt in right.elts:
            if isinstance(elt, ast.Constant):
                values.append(elt.value)
            elif isinstance(elt, ast.Str):  # Python 3.7 compat
                values.append(elt.s)
            else:
                # Can't extract value
                return None
        return {'type': 'setting_in', 'setting': option_name, 'values': values}

    return None


def _match_all_check_pattern(func_def: ast.FunctionDef) -> Optional[Dict[str, Any]]:
    """Match the 'all elements pass check' pattern.

    Detects patterns like:
        def _method(self, player):
            var = self.multiworld.worlds[player].<attr_path>
            for loop_var in var:
                if not <check>(loop_var, player):
                    return False
            return True

    Supported checks:
    - self.can_reach_location(var, player) -> location_check
    - state.has(var, player) -> item_check
    - self.has(var, player) -> item_check
    - state.can_reach(var, player) -> can_reach (region)

    Returns an all_of rule with the appropriate element_rule.
    """
    # We need exactly:
    # 1. An assignment from world attribute
    # 2. A for loop over that variable
    # 3. An if statement with "not <check>(...)" that returns False
    # 4. A final return True

    body = func_def.body
    if len(body) < 2:
        return None

    # Step 1: Find assignment from world attribute
    # Can be first statement or after some other setup
    assign_var = None
    attr_path = None

    for stmt in body:
        if isinstance(stmt, ast.Assign) and len(stmt.targets) == 1:
            target = stmt.targets[0]
            if isinstance(target, ast.Name):
                # Check if the value is from world attribute
                extracted = _extract_world_attribute_path(stmt.value)
                if extracted:
                    assign_var = target.id
                    attr_path = extracted
                    break

    if not assign_var or not attr_path:
        return None

    # Step 2: Find for loop over the assigned variable
    for_stmt = None
    loop_var = None

    for stmt in body:
        if isinstance(stmt, ast.For):
            # Check if iterating over our variable
            if isinstance(stmt.iter, ast.Name) and stmt.iter.id == assign_var:
                if isinstance(stmt.target, ast.Name):
                    for_stmt = stmt
                    loop_var = stmt.target.id
                    break

    if not for_stmt or not loop_var:
        return None

    # Step 3: Check for loop body has if statement with negated check
    if len(for_stmt.body) != 1:
        return None

    if_stmt = for_stmt.body[0]
    if not isinstance(if_stmt, ast.If):
        return None

    # Detect what kind of check is being used
    check_info = _detect_negated_check(if_stmt.test, loop_var)
    if not check_info:
        return None

    check_type, element_rule = check_info

    # Check that if body is just "return False"
    if len(if_stmt.body) != 1:
        return None

    return_false = if_stmt.body[0]
    if not isinstance(return_false, ast.Return):
        return None
    if not _is_constant_false(return_false.value):
        return None

    # Step 4: Check final statement is "return True"
    final_stmt = body[-1]
    if not isinstance(final_stmt, ast.Return):
        return None
    if not _is_constant_true(final_stmt.value):
        return None

    # Build the all_of rule
    return {
        'type': 'all_of',
        'iterable': {'type': 'world_attribute', 'attribute': attr_path},
        'iterator_info': {
            'type': 'comprehension_details',
            'target': {'type': 'name', 'name': loop_var},
            'iterator': {'type': 'world_attribute', 'attribute': attr_path}
        },
        'element_rule': element_rule
    }


def _detect_negated_check(node: ast.expr, expected_var: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Detect a negated check pattern and return the check type and element rule.

    Supported patterns:
    - not self.can_reach_location(var, player) -> ('location_check', {...})
    - not state.has(var, player) -> ('item_check', {...})
    - not self.has(var, player) -> ('item_check', {...})
    - not state.can_reach(var, player) -> ('can_reach', {...})

    Returns:
        Tuple of (check_type, element_rule) or None if no pattern matches
    """
    if not isinstance(node, ast.UnaryOp):
        return None

    if not isinstance(node.op, ast.Not):
        return None

    call = node.operand
    if not isinstance(call, ast.Call):
        return None

    func = call.func
    if not isinstance(func, ast.Attribute):
        return None

    method_name = func.attr
    obj = func.value

    # Check the object is 'self' or 'state'
    if not isinstance(obj, ast.Name) or obj.id not in ('self', 'state'):
        return None

    # Check first argument is our loop variable
    if len(call.args) < 1:
        return None

    first_arg = call.args[0]
    if not isinstance(first_arg, ast.Name) or first_arg.id != expected_var:
        return None

    # Detect the check type based on method name
    if method_name == 'can_reach_location':
        return ('location_check', {
            'type': 'location_check',
            'location': {'type': 'name', 'name': expected_var}
        })
    elif method_name == 'has':
        return ('item_check', {
            'type': 'item_check',
            'item': {'type': 'name', 'name': expected_var}
        })
    elif method_name == 'can_reach':
        return ('can_reach', {
            'type': 'can_reach',
            'region': {'type': 'name', 'name': expected_var}
        })

    return None


def _is_constant_false(node: Optional[ast.expr]) -> bool:
    """Check if node is the constant False."""
    if isinstance(node, ast.Constant) and node.value is False:
        return True
    # Python 3.7 compatibility
    if isinstance(node, ast.NameConstant) and node.value is False:
        return True
    return False


def _is_constant_true(node: Optional[ast.expr]) -> bool:
    """Check if node is the constant True."""
    if isinstance(node, ast.Constant) and node.value is True:
        return True
    # Python 3.7 compatibility
    if isinstance(node, ast.NameConstant) and node.value is True:
        return True
    return False


def _extract_world_attribute_path(node: ast.expr) -> Optional[str]:
    """Extract the attribute path from a world attribute access.

    Matches: self.multiworld.worlds[player].<attr1>.<attr2>...
    Returns: "attr1.attr2..." (the path after worlds[player])
    """
    # Collect attribute chain
    attrs = []
    current = node

    while isinstance(current, ast.Attribute):
        attrs.append(current.attr)
        current = current.value

    # Now current should be self.multiworld.worlds[player]
    if not _is_world_subscript(current):
        return None

    if not attrs:
        return None

    # Reverse to get correct order
    attrs.reverse()
    return '.'.join(attrs)


def _is_world_subscript(node: ast.expr) -> bool:
    """Check if node matches self.multiworld.worlds[player] pattern."""
    if not isinstance(node, ast.Subscript):
        return False

    # Check for .worlds
    if not isinstance(node.value, ast.Attribute) or node.value.attr != 'worlds':
        return False

    # Check for .multiworld
    if not isinstance(node.value.value, ast.Attribute) or node.value.value.attr != 'multiworld':
        return False

    # Check for self
    if not isinstance(node.value.value.value, ast.Name) or node.value.value.value.id != 'self':
        return False

    return True


def _is_simple_world_ref(node: ast.expr) -> bool:
    """Check if node is a simple 'world' name reference."""
    return isinstance(node, ast.Name) and node.id == 'world'


def discover_state_method_replacements(
    world,
    manual_overrides: Optional[Dict[str, Dict[str, Any]]] = None
) -> Dict[str, Dict[str, Any]]:
    """Discover and generate STATE_METHOD_REPLACEMENTS for a world.

    This function:
    1. Discovers LogicMixin classes in the world's module
    2. Analyzes methods that look like state methods (prefixed with _<game>_)
    3. Generates replacement rules for detected patterns
    4. Merges with manual overrides (manual takes precedence)

    Args:
        world: The world instance
        manual_overrides: Manual STATE_METHOD_REPLACEMENTS to merge (takes precedence)

    Returns:
        Dict mapping method names to their rule replacements
    """
    replacements = {}

    if world is None:
        return manual_overrides or {}

    try:
        # Get the world's module
        world_module = type(world).__module__
        import importlib

        # Import the module containing the world class
        module_parts = world_module.split('.')
        if len(module_parts) >= 2:
            # Try to import the base world package (e.g., worlds.tww)
            base_module_name = '.'.join(module_parts[:2])
            base_module = importlib.import_module(base_module_name)

            # Also try to import Rules module if it exists
            try:
                rules_module = importlib.import_module(f"{base_module_name}.Rules")
                logic_classes = discover_logic_mixin_classes(rules_module)
            except ImportError:
                logic_classes = discover_logic_mixin_classes(base_module)

            # Analyze each LogicMixin class
            for logic_class in logic_classes:
                class_replacements = _analyze_logic_class(logic_class)
                replacements.update(class_replacements)

    except Exception as e:
        logger.warning(f"Error discovering LogicMixin classes: {e}")

    # Manual overrides take precedence
    if manual_overrides:
        replacements.update(manual_overrides)

    return replacements


def _analyze_logic_class(logic_class: Type) -> Dict[str, Dict[str, Any]]:
    """Analyze a LogicMixin class and extract state method replacements.

    Args:
        logic_class: The LogicMixin subclass to analyze

    Returns:
        Dict mapping method names to their rule replacements
    """
    replacements = {}

    # Look for methods that start with _ (likely game-specific state methods)
    for name in dir(logic_class):
        if not name.startswith('_') or name.startswith('__'):
            continue

        try:
            method = getattr(logic_class, name)
            if not callable(method):
                continue

            # Analyze the method
            replacement = analyze_logic_mixin_method(method)
            if replacement:
                replacements[name] = replacement
                logger.info(f"Auto-detected replacement for {name}: {replacement}")

        except Exception as e:
            logger.debug(f"Error analyzing method {name}: {e}")

    return replacements


def get_auto_detected_replacements_report(world) -> str:
    """Generate a report of auto-detected STATE_METHOD_REPLACEMENTS.

    Useful for debugging and understanding what was auto-detected.

    Args:
        world: The world instance

    Returns:
        A formatted string report
    """
    replacements = discover_state_method_replacements(world, None)

    if not replacements:
        return "No state method replacements auto-detected."

    lines = ["Auto-detected STATE_METHOD_REPLACEMENTS:"]
    for method_name, replacement in sorted(replacements.items()):
        lines.append(f"  {method_name}: {replacement}")

    return '\n'.join(lines)
