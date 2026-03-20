"""
AST Visitors package for rule analysis.

This package contains mixin classes that provide visitor methods for analyzing
Python AST nodes during rule extraction. The mixins are organized by the type
of AST node they handle.

The main export is ASTVisitorMixin, which combines all individual mixins into
a single class that can be used with RuleAnalyzer.
"""

from .base import BaseVisitorMixin
from .pattern_detection import PatternDetectionMixin
from .expression_visitors import ExpressionVisitorMixin
from .operator_visitors import OperatorVisitorMixin
from .data_structure_visitors import DataStructureVisitorMixin
from .comprehension_visitors import ComprehensionVisitorMixin
from .control_flow_visitors import ControlFlowVisitorMixin
from .call_visitor import CallVisitorMixin


class ASTVisitorMixin(
    PatternDetectionMixin,
    ExpressionVisitorMixin,
    OperatorVisitorMixin,
    DataStructureVisitorMixin,
    ComprehensionVisitorMixin,
    ControlFlowVisitorMixin,
    CallVisitorMixin,
):
    """
    Combined mixin providing all AST visitor methods for rule analysis.

    This class aggregates all the individual visitor mixins into a single class
    that can be inherited by RuleAnalyzer. The mixins are composed in order of
    dependency - base mixins first, then mixins that depend on them.

    Mixin order (from most base to most dependent):
        1. BaseVisitorMixin - Helper registration methods
        2. PatternDetectionMixin - Pattern detection helpers (_is_* methods)
        3. ExpressionVisitorMixin - Basic expression visitors
        4. OperatorVisitorMixin - Operator visitors
        5. DataStructureVisitorMixin - Data structure visitors
        6. ComprehensionVisitorMixin - Comprehension/generator visitors
        7. ControlFlowVisitorMixin - Control flow visitors
        8. CallVisitorMixin - Function call visitor (depends on many others)

    Required attributes on the parent class:
        - expression_resolver: ExpressionResolver instance
        - binary_op_processor: BinaryOpProcessor instance
        - closure_vars: Dictionary of closure variables
        - seen_funcs: Dictionary of already-seen functions
        - game_handler: Optional game-specific handler
        - player_context: Optional player context
        - preserve_parameter_names: Boolean flag for parameter handling

    Required methods on the parent class (from RuleAnalyzer):
        - visit(): Generic AST node visitor
        - _filter_special_args(): Filters state/player/world arguments
        - _build_parameter_mapping(): Builds parameter mapping for function calls
    """
    pass


# Export all individual mixins for direct use if needed
__all__ = [
    'ASTVisitorMixin',
    'BaseVisitorMixin',
    'PatternDetectionMixin',
    'ExpressionVisitorMixin',
    'OperatorVisitorMixin',
    'DataStructureVisitorMixin',
    'ComprehensionVisitorMixin',
    'ControlFlowVisitorMixin',
    'CallVisitorMixin',
]
