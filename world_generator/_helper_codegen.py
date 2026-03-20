"""Helper code generator for converting AST rule definitions into Python helper functions.

This module contains the HelperCodeGenerator class, which generates raw Python code
(with lambda-compatible expressions) from helper function bodies exported in AST format.
Unlike RuleCodeGenerator (which generates Rule Builder expressions), this generates
standalone Python functions that can be called directly at runtime.
"""

import re
from typing import Any, Dict, List, Set, Optional

from ._codegen_utils import get_helper_function_name
from ._helper_statements import HelperStatementMixin
from ._helper_expressions import HelperExpressionMixin


class HelperCodeGenerator(
    HelperStatementMixin,
    HelperExpressionMixin,
):
    """
    Generates Python helper functions from AST format rule definitions.

    This class converts helper function bodies (which are rule definitions)
    into actual Python code that can be executed at runtime.

    Unlike RuleCodeGenerator (which generates Rule Builder expressions),
    this generates raw Python code with lambda-compatible expressions.
    """

    def __init__(
        self,
        game_name: str,
        resolved_values: Optional[Dict[str, Any]] = None,
        option_definitions: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Initialize the helper code generator.

        Args:
            game_name: The game name (used for generating function names)
            resolved_values: Optional dict of resolved option/attribute values (for fallback)
            option_definitions: Optional dict defining which names are options (vs world attributes)
        """
        self.game_name = game_name
        self.settings = resolved_values or {}  # Values for fallback when dynamic access not possible
        self.option_definitions = option_definitions or {}  # To distinguish options from world attributes
        # Sanitize game name for use in Python identifiers
        self.game_name_lower = re.sub(r'[^a-zA-Z0-9]', '', game_name).lower()
        self.known_helpers: Set[str] = set()  # Track which helpers exist for validation
        self.helper_data: Dict[str, Any] = {}  # Full helper data including param_mappings
        self.uses_math: bool = False  # Track if math functions are used
        self.uses_placement_lookup: bool = False  # Track if placement_lookup is used
        self.uses_logging: bool = False  # Track if logging module is used
        self.placements: Dict[str, str] = {}  # location_name -> item_name
        # Track NamedTuple types encountered during code generation
        # Maps tuple of field names to a generated class name
        self.namedtuple_types: Dict[tuple, str] = {}
        # Maps original NamedTuple type name to the tuple of fields
        self.namedtuple_names: Dict[str, tuple] = {}
        # Context for current location/entrance being processed
        # Used to substitute 'location' or 'entrance' variable references
        self._current_location: Optional[str] = None
        self._current_entrance: Optional[str] = None
        # Track current helper's parameters during code generation
        # Used to recognize when a "helper" call is actually a call to a parameter (lambda)
        self._current_helper_params: Set[str] = set()

    def set_known_helpers(self, helper_names: Set[str]) -> None:
        """Set the list of known helper names for this game."""
        self.known_helpers = helper_names

    def set_helper_data(self, helper_data: Dict[str, Any]) -> None:
        """Set the full helper data including param_mappings.

        Args:
            helper_data: Dict mapping helper names to their data, including:
                - params: List of parameter names
                - param_mappings: Dict mapping param names to setting/attribute names
                - body: The helper body
                - defaults: Default parameter values
        """
        self.helper_data = helper_data or {}

    def set_placements(self, placements: Dict[str, str]) -> None:
        """Set the placement data for resolving placement_lookup rules."""
        self.placements = placements or {}

    def set_context(self, location: Optional[str] = None, entrance: Optional[str] = None) -> None:
        """Set the current context for variable substitution.

        When generating rules for a specific location or entrance, set the context
        so that references to 'location' or 'entrance' variables can be substituted
        with the appropriate state.multiworld.get_*() lookup.
        """
        self._current_location = location
        self._current_entrance = entrance

    def _get_namedtuple_class_name(self, fields: tuple) -> str:
        """
        Get or create a class name for a NamedTuple with the given fields.

        Returns a unique class name like '_AreaStats_nt' for this game.
        """
        if fields in self.namedtuple_types:
            return self.namedtuple_types[fields]

        # Generate a class name based on the number of NamedTuple types we've seen
        index = len(self.namedtuple_types)
        class_name = f"_{self.game_name_lower}_NTuple{index}"
        self.namedtuple_types[fields] = class_name
        return class_name

    def generate_namedtuple_classes(self) -> str:
        """
        Generate NamedTuple class definitions for all tracked NamedTuple types.

        Returns Python code defining all NamedTuple classes, to be placed
        at the top of the helper functions section.
        """
        if not self.namedtuple_types:
            return ""

        lines = ["from typing import NamedTuple, Any, List", ""]

        for fields, class_name in self.namedtuple_types.items():
            # Generate a simple NamedTuple class
            lines.append(f"class {class_name}(NamedTuple):")
            for field in fields:
                # Use Any type annotation since we don't know the actual types
                lines.append(f"    {field}: Any")
            lines.append("")

        return "\n".join(lines)

    def prescan_for_namedtuples(self, rule: Dict[str, Any]) -> None:
        """
        Pre-scan a rule tree to discover NamedTuple types.

        This should be called before generate code so that NamedTuple
        constructor calls can be properly resolved.
        """
        if not isinstance(rule, dict):
            return

        # Check if this is NamedTuple metadata
        if '_namedtuple_fields' in rule and '_namedtuple_values' in rule:
            fields = tuple(rule['_namedtuple_fields'])
            type_name = rule.get('_namedtuple_type', '')
            # Register the type
            self._get_namedtuple_class_name(fields)
            if type_name:
                self.namedtuple_names[type_name] = fields
            # Also scan the values for nested NamedTuples
            for v in rule['_namedtuple_values']:
                if isinstance(v, dict):
                    self.prescan_for_namedtuples(v)
            return

        # Recursively scan all dict values
        for key, value in rule.items():
            if isinstance(value, dict):
                self.prescan_for_namedtuples(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        self.prescan_for_namedtuples(item)

    def get_function_name(self, helper_name: str) -> str:
        """Get the Python function name for a helper."""
        return get_helper_function_name(helper_name)

    def generate_helper_function(
        self,
        helper_name: str,
        params: List[str],
        body: Dict[str, Any],
        defaults: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a Python helper function from a rule body.

        Args:
            helper_name: Name of the helper function
            params: List of parameter names (excluding state/player)
            body: The rule body to convert
            defaults: Default values for parameters

        Returns:
            Complete Python function definition as a string
        """
        defaults = defaults or {}

        # Build function signature
        func_name = self.get_function_name(helper_name)
        sig_params = ['state: "CollectionState"', 'player: int']

        for param in params:
            # Handle variadic parameters (*args, **kwargs) - no default value allowed
            if param.startswith('*'):
                sig_params.append(param)
            elif param in defaults:
                default_val = defaults[param]
                if isinstance(default_val, bool):
                    sig_params.append(f'{param}: bool = {default_val}')
                elif isinstance(default_val, (int, float)):
                    sig_params.append(f'{param} = {default_val}')
                elif isinstance(default_val, str):
                    sig_params.append(f'{param}: str = {repr(default_val)}')
                else:
                    sig_params.append(f'{param} = {repr(default_val)}')
            else:
                # No default provided - use None as default so callers can omit this arg
                # This is needed when helper body is hardcoded/expanded and doesn't use the param
                sig_params.append(f'{param} = None')

        # Determine return type based on body structure
        return_type = "bool"
        if isinstance(body, dict):
            body_type = body.get('type', '')
            if body_type in ('sum_of', 'count_item', 'binary_op', 'binop', 'negate'):
                return_type = "int"

        signature = f"def {func_name}({', '.join(sig_params)}) -> {return_type}:"

        # Set current helper parameters for proper lambda call generation
        # This allows _expr_helper to recognize when a "helper" is actually a parameter
        self._current_helper_params = set(params)

        try:
            # Generate function body
            body_code = self._generate_body(body)
        finally:
            # Clear the context after generation
            self._current_helper_params = set()

        # Combine signature and body
        return f"{signature}\n{self._indent(body_code)}"

    def get_helper_call(self, helper_name: str, args: List[Dict[str, Any]]) -> str:
        """
        Generate a call to a helper function.

        Args:
            helper_name: Name of the helper to call
            args: List of argument rule definitions

        Returns:
            Python code for the function call
        """
        func_name = self.get_function_name(helper_name)

        # Generate argument expressions
        arg_exprs = ['state', 'player']
        for arg in args:
            arg_exprs.append(self._generate_expression(arg))

        return f"{func_name}({', '.join(arg_exprs)})"
