"""
Converter from Python code snippets to Archipelago-CC JSON rule format.

This module provides functionality to convert arbitrary Python code blocks
(expressions, lambda functions, or function bodies) to the JSON rule format
used by the Archipelago-CC frontend.

Usage:
    from exporter.converter.python_to_json import convert_python_to_json

    # Convert a lambda expression
    json_rule, warnings = convert_python_to_json("lambda state: state.has('Sword')")

    # Convert a simple expression
    json_rule, warnings = convert_python_to_json("state.has('Sword') and state.has('Shield')")

    # Convert a function definition
    json_rule, warnings = convert_python_to_json('''
    def rule(state):
        count = 0
        for item in items:
            if state.has(item):
                count += 1
        return count >= 3
    ''')
"""

import ast
import logging
from typing import Any, Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ConversionResult:
    """Result of a Python to JSON conversion."""
    rule: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return len(self.errors) == 0


class PythonToJSON:
    """
    Converter from Python code to Archipelago-CC JSON rule format.

    This is a lightweight converter that operates on code strings without
    needing the full Archipelago world infrastructure. It handles:
    - Lambda expressions
    - Function definitions
    - Standalone expressions
    - Multi-statement blocks
    """

    # Operator mappings
    BOOL_OPS = {
        'And': 'and',
        'Or': 'or',
    }

    COMPARE_OPS = {
        'Eq': '==',
        'NotEq': '!=',
        'Lt': '<',
        'LtE': '<=',
        'Gt': '>',
        'GtE': '>=',
        'Is': 'is',
        'IsNot': 'is not',
        'In': 'in',
        'NotIn': 'not in',
    }

    BINARY_OPS = {
        'Add': '+',
        'Sub': '-',
        'Mult': '*',
        'Div': '/',
        'FloorDiv': '//',
        'Mod': '%',
        'Pow': '**',
        'LShift': '<<',
        'RShift': '>>',
        'BitOr': '|',
        'BitXor': '^',
        'BitAnd': '&',
    }

    UNARY_OPS = {
        'Not': 'not',
        'UAdd': '+',
        'USub': '-',
        'Invert': '~',
    }

    AUG_ASSIGN_OPS = {
        'Add': '+=',
        'Sub': '-=',
        'Mult': '*=',
        'Div': '/=',
        'FloorDiv': '//=',
        'Mod': '%=',
    }

    def __init__(self):
        self.warnings: List[str] = []
        self.errors: List[str] = []

    def convert(self, code: str) -> ConversionResult:
        """
        Convert Python code to JSON rule format.

        Args:
            code: Python code string (expression, lambda, or function)

        Returns:
            ConversionResult with the JSON rule and any warnings/errors
        """
        self.warnings = []
        self.errors = []

        try:
            # Try to parse the code
            code = code.strip()

            # Try parsing as expression first
            try:
                tree = ast.parse(code, mode='eval')
                rule = self._visit(tree.body)
            except SyntaxError:
                # Try parsing as statements
                tree = ast.parse(code, mode='exec')
                rule = self._visit_module(tree)

            return ConversionResult(
                rule=rule,
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )

        except SyntaxError as e:
            self.errors.append(f"Syntax error: {e}")
            return ConversionResult(
                rule={'type': 'error', 'message': str(e)},
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )
        except Exception as e:
            self.errors.append(f"Conversion failed: {e}")
            return ConversionResult(
                rule={'type': 'error', 'message': str(e)},
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )

    def _visit_module(self, node: ast.Module) -> Dict[str, Any]:
        """Visit a module node (multiple statements)."""
        if not node.body:
            return {'type': 'constant', 'value': None}

        # If single statement, unwrap it
        if len(node.body) == 1:
            return self._visit(node.body[0])

        # Multiple statements - create a block
        statements = [self._visit(stmt) for stmt in node.body]
        return {'type': 'block', 'statements': statements}

    def _visit(self, node: ast.AST) -> Dict[str, Any]:
        """Visit an AST node and return its JSON representation."""
        method_name = f'_visit_{type(node).__name__}'
        visitor = getattr(self, method_name, self._visit_generic)
        return visitor(node)

    def _visit_generic(self, node: ast.AST) -> Dict[str, Any]:
        """Generic visitor for unsupported node types."""
        self.warnings.append(f"Unsupported node type: {type(node).__name__}")
        return {'type': 'unknown', 'node_type': type(node).__name__}

    # -------------------------------------------------------------------------
    # Expression Visitors
    # -------------------------------------------------------------------------

    def _visit_Constant(self, node: ast.Constant) -> Dict[str, Any]:
        """Visit a constant value."""
        return {'type': 'constant', 'value': node.value}

    def _visit_Num(self, node: ast.Num) -> Dict[str, Any]:
        """Visit a number (Python 3.7 compatibility)."""
        return {'type': 'constant', 'value': node.n}

    def _visit_Str(self, node: ast.Str) -> Dict[str, Any]:
        """Visit a string (Python 3.7 compatibility)."""
        return {'type': 'constant', 'value': node.s}

    def _visit_NameConstant(self, node: ast.NameConstant) -> Dict[str, Any]:
        """Visit True/False/None (Python 3.7 compatibility)."""
        return {'type': 'constant', 'value': node.value}

    def _visit_Name(self, node: ast.Name) -> Dict[str, Any]:
        """Visit a name reference."""
        return {'type': 'name', 'name': node.id}

    def _visit_Attribute(self, node: ast.Attribute) -> Dict[str, Any]:
        """Visit an attribute access."""
        obj = self._visit(node.value)
        return {'type': 'attribute', 'object': obj, 'attr': node.attr}

    def _visit_Subscript(self, node: ast.Subscript) -> Dict[str, Any]:
        """Visit a subscript access."""
        value = self._visit(node.value)
        slice_node = node.slice

        # Handle different slice types
        if isinstance(slice_node, ast.Index):  # Python 3.8
            index = self._visit(slice_node.value)  # type: ignore[attr-defined]
        else:
            index = self._visit(slice_node)

        return {'type': 'subscript', 'value': value, 'index': index}

    def _visit_List(self, node: ast.List) -> Dict[str, Any]:
        """Visit a list literal."""
        items = [self._visit(elt) for elt in node.elts]
        return {'type': 'list', 'value': items}

    def _visit_Tuple(self, node: ast.Tuple) -> Dict[str, Any]:
        """Visit a tuple literal."""
        items = [self._visit(elt) for elt in node.elts]
        return {'type': 'tuple', 'value': items}

    def _visit_Dict(self, node: ast.Dict) -> Dict[str, Any]:
        """Visit a dict literal."""
        keys = [self._visit(k) if k else None for k in node.keys]
        values = [self._visit(v) for v in node.values]
        return {'type': 'dict', 'keys': keys, 'values': values}

    # -------------------------------------------------------------------------
    # Boolean and Comparison Operators
    # -------------------------------------------------------------------------

    def _visit_BoolOp(self, node: ast.BoolOp) -> Dict[str, Any]:
        """Visit a boolean operation (and/or)."""
        op_name = type(node.op).__name__
        op_type = 'and' if op_name == 'And' else 'or'
        conditions = [self._visit(v) for v in node.values]
        return {'type': op_type, 'conditions': conditions}

    def _visit_UnaryOp(self, node: ast.UnaryOp) -> Dict[str, Any]:
        """Visit a unary operation."""
        op_name = type(node.op).__name__
        operand = self._visit(node.operand)

        if op_name == 'Not':
            return {'type': 'not', 'condition': operand}
        elif op_name == 'USub':
            return {'type': 'negate', 'value': operand}
        else:
            op_symbol = self.UNARY_OPS.get(op_name, op_name)
            return {'type': 'unary_op', 'op': op_symbol, 'operand': operand}

    def _visit_Compare(self, node: ast.Compare) -> Dict[str, Any]:
        """Visit a comparison expression."""
        left = self._visit(node.left)
        ops = [self.COMPARE_OPS.get(type(op).__name__, '?') for op in node.ops]
        comparators = [self._visit(c) for c in node.comparators]

        # Special case: single comparison - use simple format
        if len(ops) == 1:
            return {
                'type': 'compare',
                'left': left,
                'op': ops[0],
                'right': comparators[0]
            }

        # Chained comparison
        return {
            'type': 'compare',
            'left': left,
            'ops': ops,
            'comparators': comparators
        }

    def _visit_BinOp(self, node: ast.BinOp) -> Dict[str, Any]:
        """Visit a binary operation."""
        left = self._visit(node.left)
        right = self._visit(node.right)
        op_name = type(node.op).__name__
        op_symbol = self.BINARY_OPS.get(op_name, op_name)

        return {
            'type': 'binary_op',
            'left': left,
            'op': op_symbol,
            'right': right
        }

    # -------------------------------------------------------------------------
    # Conditionals
    # -------------------------------------------------------------------------

    def _visit_IfExp(self, node: ast.IfExp) -> Dict[str, Any]:
        """Visit a ternary if expression."""
        return {
            'type': 'conditional',
            'test': self._visit(node.test),
            'if_true': self._visit(node.body),
            'if_false': self._visit(node.orelse)
        }

    # -------------------------------------------------------------------------
    # Function Calls
    # -------------------------------------------------------------------------

    def _visit_Call(self, node: ast.Call) -> Dict[str, Any]:
        """Visit a function call."""
        # Handle special built-in functions
        if isinstance(node.func, ast.Name):
            func_name = node.func.id

            if func_name == 'all' and node.args:
                return self._handle_all_call(node)
            elif func_name == 'any' and node.args:
                return self._handle_any_call(node)
            elif func_name == 'min':
                args = [self._visit(arg) for arg in node.args]
                result: Dict[str, Any] = {'type': 'min'}
                if args:
                    result['args'] = args
                return result
            elif func_name == 'max':
                args = [self._visit(arg) for arg in node.args]
                result = {'type': 'max'}
                if args:
                    result['args'] = args
                return result
            elif func_name == 'len':
                args = [self._visit(arg) for arg in node.args]
                result = {'type': 'function_call', 'name': 'len'}
                if args:
                    result['args'] = args
                return result

        # Handle method calls
        if isinstance(node.func, ast.Attribute):
            return self._handle_method_call(node)

        # Generic function call
        func = self._visit(node.func)
        args = [self._visit(arg) for arg in node.args]

        result = {'type': 'function_call', 'function': func}
        if args:
            result['args'] = args
        return result

    def _handle_method_call(self, node: ast.Call) -> Dict[str, Any]:
        """Handle method call patterns."""
        assert isinstance(node.func, ast.Attribute)
        attr_node = node.func
        obj = self._visit(attr_node.value)
        method = attr_node.attr
        args = [self._visit(arg) for arg in node.args]

        # Check for state.has() pattern
        if obj.get('type') == 'name' and obj.get('name') in ('state', 'self'):
            if method == 'has':
                return self._make_item_check(args)
            elif method == 'has_all':
                return self._make_state_method('has_all', args)
            elif method == 'has_any':
                return self._make_state_method('has_any', args)
            elif method == 'has_group':
                return self._make_group_check(args)
            elif method == 'count':
                return self._make_count_expr(args)
            elif method == 'count_group':
                return self._make_group_count(args)
            elif method == 'can_reach':
                return self._make_can_reach(args)

            # Generic state method
            result2: Dict[str, Any] = {'type': 'state_method', 'method': method}
            if args:
                result2['args'] = args
            return result2

        # Generic method call
        result = {
            'type': 'method_call',
            'object': obj,
            'method': method,
        }
        if args:
            result['args'] = args
        return result

    def _make_item_check(self, args: List[Dict]) -> Dict[str, Any]:
        """Create an item_check rule from args."""
        if not args:
            return {'type': 'item_check', 'item': ''}

        item = args[0]
        result = {'type': 'item_check', 'item': self._extract_value(item)}

        if len(args) > 1:
            count = self._extract_value(args[1])
            if count != 1:
                result['count'] = count

        return result

    def _make_group_check(self, args: List[Dict]) -> Dict[str, Any]:
        """Create a group_check rule from args."""
        if not args:
            return {'type': 'group_check', 'group': ''}

        group = self._extract_value(args[0])
        result = {'type': 'group_check', 'group': group}

        if len(args) > 1:
            count = self._extract_value(args[1])
            if count != 1:
                result['count'] = count

        return result

    def _make_count_expr(self, args: List[Dict]) -> Dict[str, Any]:
        """Create a count expression from args."""
        if not args:
            return {'type': 'state_method', 'method': 'count'}

        return {
            'type': 'state_method',
            'method': 'count',
            'args': args
        }

    def _make_group_count(self, args: List[Dict]) -> Dict[str, Any]:
        """Create a group_count expression from args."""
        if not args:
            return {'type': 'group_count', 'group': ''}

        return {'type': 'group_count', 'group': self._extract_value(args[0])}

    def _make_can_reach(self, args: List[Dict]) -> Dict[str, Any]:
        """Create a can_reach rule from args.

        Handles:
        1. Explicit type argument: state.can_reach(name, "Location") -> location_check
        2. Location objects: state.can_reach(loc) where loc is a Location -> location_check
        3. Region objects: state.can_reach(region) where region is a Region -> can_reach
        4. Default (strings without type): treated as region names
        """
        if not args:
            return {'type': 'can_reach', 'region': ''}

        target = self._extract_value(args[0])

        # Check for explicit type argument first
        if len(args) > 1:
            reach_type = self._extract_value(args[1])
            if reach_type == 'Location':
                # If target is a Location object, extract its name
                if hasattr(target, 'name') and isinstance(target.name, str):
                    target = target.name
                return {'type': 'location_check', 'location': target}
            elif reach_type == 'Entrance':
                # If target is an Entrance object, extract its name
                if hasattr(target, 'name') and isinstance(target.name, str):
                    target = target.name
                return {'type': 'can_reach_entrance', 'entrance': target}

        # No explicit type argument - infer from object type
        # Check if target is an Entrance object (has connected_region attribute)
        # This must be checked BEFORE Location since both have parent_region
        if hasattr(target, 'connected_region'):
            entrance_name = target.name if hasattr(target, 'name') else str(target)
            return {'type': 'can_reach_entrance', 'entrance': entrance_name}

        # Check if target is a Location object (has parent_region but not entrances)
        if hasattr(target, 'parent_region') and not hasattr(target, 'entrances'):
            location_name = target.name if hasattr(target, 'name') else str(target)
            return {'type': 'location_check', 'location': location_name}

        # Check if target is a Region object (has entrances)
        if hasattr(target, 'entrances'):
            region_name = target.name if hasattr(target, 'name') else str(target)
            return {'type': 'can_reach', 'region': region_name}

        # Default: treat as region name (string)
        return {'type': 'can_reach', 'region': target}

    def _make_state_method(self, method: str, args: List[Dict]) -> Dict[str, Any]:
        """Create a state_method rule."""
        return {'type': 'state_method', 'method': method, 'args': args}

    def _extract_value(self, node: Dict) -> Any:
        """Extract the raw value from a constant node."""
        if isinstance(node, dict):
            if node.get('type') == 'constant':
                return node.get('value')
            return node
        return node

    def _handle_all_call(self, node: ast.Call) -> Dict[str, Any]:
        """Handle all() call with generator."""
        arg = node.args[0]
        if isinstance(arg, ast.GeneratorExp):
            return self._convert_generator_to_all_of(arg)
        # Fallback
        return {
            'type': 'function_call',
            'name': 'all',
            'args': [self._visit(arg)]
        }

    def _handle_any_call(self, node: ast.Call) -> Dict[str, Any]:
        """Handle any() call with generator."""
        arg = node.args[0]
        if isinstance(arg, ast.GeneratorExp):
            return self._convert_generator_to_any_of(arg)
        # Fallback
        return {
            'type': 'function_call',
            'name': 'any',
            'args': [self._visit(arg)]
        }

    def _convert_generator_to_all_of(self, gen: ast.GeneratorExp) -> Dict[str, Any]:
        """Convert a generator expression to all_of rule."""
        element = self._visit(gen.elt)
        generators = gen.generators

        if generators:
            comp = generators[0]
            var = comp.target.id if isinstance(comp.target, ast.Name) else '_'
            iterable = self._visit(comp.iter)

            result = {
                'type': 'all_of',
                'element_rule': element,
                'var': var,
                'iterable': iterable
            }

            if comp.ifs:
                conditions = [self._visit(cond) for cond in comp.ifs]
                if len(conditions) == 1:
                    result['condition'] = conditions[0]
                else:
                    result['condition'] = {'type': 'and', 'conditions': conditions}

            return result

        return {'type': 'all_of', 'element_rule': element}

    def _convert_generator_to_any_of(self, gen: ast.GeneratorExp) -> Dict[str, Any]:
        """Convert a generator expression to any_of rule."""
        element = self._visit(gen.elt)
        generators = gen.generators

        if generators:
            comp = generators[0]
            var = comp.target.id if isinstance(comp.target, ast.Name) else '_'
            iterable = self._visit(comp.iter)

            result = {
                'type': 'any_of',
                'element_rule': element,
                'var': var,
                'iterable': iterable
            }

            if comp.ifs:
                conditions = [self._visit(cond) for cond in comp.ifs]
                if len(conditions) == 1:
                    result['condition'] = conditions[0]
                else:
                    result['condition'] = {'type': 'and', 'conditions': conditions}

            return result

        return {'type': 'any_of', 'element_rule': element}

    def _visit_GeneratorExp(self, node: ast.GeneratorExp) -> Dict[str, Any]:
        """Visit a generator expression."""
        element = self._visit(node.elt)
        generators = []

        for comp in node.generators:
            var = comp.target.id if isinstance(comp.target, ast.Name) else '_'
            iterable = self._visit(comp.iter)
            conditions = [self._visit(cond) for cond in comp.ifs]

            generators.append({
                'var': var,
                'iterable': iterable,
                'conditions': conditions
            })

        return {
            'type': 'generator_expression',
            'element': element,
            'generators': generators
        }

    # -------------------------------------------------------------------------
    # Lambda and Function Definitions
    # -------------------------------------------------------------------------

    def _visit_Lambda(self, node: ast.Lambda) -> Dict[str, Any]:
        """Visit a lambda expression."""
        return self._visit(node.body)

    def _visit_FunctionDef(self, node: ast.FunctionDef) -> Dict[str, Any]:
        """Visit a function definition."""
        body = node.body

        # Skip docstring
        if (body and isinstance(body[0], ast.Expr) and
            isinstance(body[0].value, (ast.Constant, ast.Str))):
            body = body[1:]

        if not body:
            return {'type': 'constant', 'value': None}

        # Check if we need block mode
        if self._needs_block_mode(body):
            statements = [self._visit_statement(stmt) for stmt in body]
            if len(statements) == 1:
                return statements[0] or {'type': 'constant', 'value': None}
            return {'type': 'block', 'statements': statements}

        # Simple function - just visit the return
        if isinstance(body[0], ast.Return):
            return self._visit(body[0].value) if body[0].value else {'type': 'constant', 'value': None}

        # Other simple case
        return self._visit(body[0])

    def _needs_block_mode(self, body: List[ast.stmt]) -> bool:
        """Check if the function body needs block mode."""
        for node in body:
            if isinstance(node, ast.For):
                return True
            if isinstance(node, ast.AugAssign):
                return True
            if isinstance(node, ast.If):
                if self._has_for_or_augassign(node.body):
                    return True
                if self._has_for_or_augassign(node.orelse):
                    return True

        # Multiple assignments before return
        assign_count = sum(1 for n in body if isinstance(n, (ast.Assign, ast.AnnAssign)))
        has_return = any(isinstance(n, ast.Return) for n in body)
        if assign_count > 0 and has_return:
            return True

        return False

    def _has_for_or_augassign(self, nodes: List[ast.stmt]) -> bool:
        """Check if nodes contain for loops or augmented assignments."""
        for node in nodes:
            if isinstance(node, (ast.For, ast.AugAssign)):
                return True
            if isinstance(node, ast.If):
                if self._has_for_or_augassign(node.body):
                    return True
                if self._has_for_or_augassign(node.orelse):
                    return True
        return False

    # -------------------------------------------------------------------------
    # Statement Visitors
    # -------------------------------------------------------------------------

    def _visit_statement(self, node: ast.stmt) -> Optional[Dict[str, Any]]:
        """Visit a statement node."""
        if isinstance(node, ast.Return):
            value = self._visit(node.value) if node.value else {'type': 'constant', 'value': None}
            return {'type': 'return', 'value': value}
        elif isinstance(node, ast.Assign):
            return self._visit_Assign(node)
        elif isinstance(node, ast.AugAssign):
            return self._visit_AugAssign(node)
        elif isinstance(node, ast.For):
            return self._visit_For(node)
        elif isinstance(node, ast.If):
            return self._visit_If_statement(node)
        elif isinstance(node, ast.Expr):
            return self._visit(node.value)
        elif isinstance(node, ast.Break):
            return {'type': 'break'}
        elif isinstance(node, ast.Continue):
            return {'type': 'continue'}
        elif isinstance(node, ast.Pass):
            return None
        else:
            return self._visit(node)

    def _visit_Expr(self, node: ast.Expr) -> Dict[str, Any]:
        """Visit an expression statement."""
        return self._visit(node.value)

    def _visit_Return(self, node: ast.Return) -> Dict[str, Any]:
        """Visit a return statement."""
        if node.value:
            return self._visit(node.value)
        return {'type': 'constant', 'value': None}

    def _visit_Assign(self, node: ast.Assign) -> Dict[str, Any]:
        """Visit an assignment statement."""
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            value = self._visit(node.value)
            return {'type': 'assign', 'name': name, 'value': value}

        # Complex assignment
        self.warnings.append("Complex assignment not fully supported")
        return {'type': 'assign', 'targets': [self._visit(t) for t in node.targets], 'value': self._visit(node.value)}

    def _visit_AugAssign(self, node: ast.AugAssign) -> Dict[str, Any]:
        """Visit an augmented assignment."""
        if isinstance(node.target, ast.Name):
            name = node.target.id
            op_name = type(node.op).__name__
            op_symbol = self.AUG_ASSIGN_OPS.get(op_name, '+=')
            value = self._visit(node.value)
            return {'type': 'assign', 'name': name, 'op': op_symbol, 'value': value}

        self.warnings.append("Complex augmented assignment not fully supported")
        return {'type': 'unknown', 'node_type': 'AugAssign'}

    def _visit_For(self, node: ast.For) -> Dict[str, Any]:
        """Visit a for loop."""
        var = node.target.id if isinstance(node.target, ast.Name) else '_'
        body = [self._visit_statement(stmt) for stmt in node.body]
        body = [b for b in body if b is not None]

        # Check for range() call
        if (isinstance(node.iter, ast.Call) and
            isinstance(node.iter.func, ast.Name) and
            node.iter.func.id == 'range'):
            if node.iter.args:
                count = self._visit(node.iter.args[0])
                return {'type': 'for_range', 'var': var, 'count': count, 'body': body}

        iterable = self._visit(node.iter)
        return {'type': 'for_iter', 'var': var, 'iterable': iterable, 'body': body}

    def _visit_If(self, node: ast.If) -> Dict[str, Any]:
        """Visit an if expression/statement."""
        test = self._visit(node.test)

        # Simple if with single return in body
        if len(node.body) == 1 and isinstance(node.body[0], ast.Return):
            if_true = self._visit(node.body[0].value) if node.body[0].value else {'type': 'constant', 'value': None}
        else:
            if_true = self._visit(node.body[0]) if node.body else {'type': 'constant', 'value': None}

        if_false = None
        if node.orelse:
            if len(node.orelse) == 1 and isinstance(node.orelse[0], ast.Return):
                if_false = self._visit(node.orelse[0].value) if node.orelse[0].value else {'type': 'constant', 'value': None}
            else:
                if_false = self._visit(node.orelse[0]) if node.orelse else None

        return {
            'type': 'conditional',
            'test': test,
            'if_true': if_true,
            'if_false': if_false
        }

    def _visit_If_statement(self, node: ast.If) -> Dict[str, Any]:
        """Visit an if statement in imperative context."""
        test = self._visit(node.test)
        body = [self._visit_statement(stmt) for stmt in node.body]
        body = [b for b in body if b is not None]

        result = {
            'type': 'if_statement',
            'test': test,
            'body': body
        }

        if node.orelse:
            orelse = [self._visit_statement(stmt) for stmt in node.orelse]
            orelse = [o for o in orelse if o is not None]
            result['orelse'] = orelse

        return result

    # -------------------------------------------------------------------------
    # F-strings
    # -------------------------------------------------------------------------

    def _visit_JoinedStr(self, node: ast.JoinedStr) -> Dict[str, Any]:
        """Visit an f-string."""
        parts = []
        for value in node.values:
            if isinstance(value, (ast.Str, ast.Constant)):
                val = value.s if isinstance(value, ast.Str) else value.value
                parts.append({'type': 'constant', 'value': val})
            elif isinstance(value, ast.FormattedValue):
                parts.append({
                    'type': 'formatted_value',
                    'value': self._visit(value.value)
                })
            else:
                parts.append(self._visit(value))

        return {'type': 'f_string', 'parts': parts}

    def _visit_FormattedValue(self, node: ast.FormattedValue) -> Dict[str, Any]:
        """Visit a formatted value in an f-string."""
        return {
            'type': 'formatted_value',
            'value': self._visit(node.value)
        }


# -------------------------------------------------------------------------
# Convenience Functions
# -------------------------------------------------------------------------

def convert_python_to_json(code: str) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert Python code to JSON rule format.

    Args:
        code: Python code string (expression, lambda, or function)

    Returns:
        Tuple of (rule_dict, warnings)
    """
    converter = PythonToJSON()
    result = converter.convert(code)
    return result.rule, result.warnings + result.errors


def convert_lambda_to_json(code: str) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert a Python lambda expression to JSON rule format.

    Args:
        code: Lambda expression string (e.g., "lambda state: state.has('Sword')")

    Returns:
        Tuple of (rule_dict, warnings)
    """
    return convert_python_to_json(code)


def convert_function_to_json(code: str) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert a Python function definition to JSON rule format.

    Args:
        code: Function definition string

    Returns:
        Tuple of (rule_dict, warnings)
    """
    return convert_python_to_json(code)
