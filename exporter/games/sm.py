"""Super Metroid game-specific export handler."""

from typing import Dict, Any, Optional, Set
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class SMGameExportHandler(GenericGameExportHandler):
    """Export handler for Super Metroid.

    Super Metroid uses a custom SMBoolManager system for its logic.
    The rules are wrapped in self.evalSMBool() calls with helper functions.

    This exporter transforms the Python-specific patterns into JavaScript-friendly
    helper calls that the frontend can execute.
    """
    GAME_NAME = 'Super Metroid'

    def __init__(self, world=None):
        super().__init__()  # Base class doesn't take arguments
        self.world = world
        self._simple_accessfrom_locations: Optional[Set[str]] = None
        self._all_accessfrom_info: Optional[Dict[str, Dict[str, str]]] = None
        self._varia_item_types: Optional[Dict[str, str]] = None
        self._accesspoint_traverse_funcs: Optional[Dict[str, Any]] = None
        self._current_exit_context: Optional[str] = None  # Track current exit being processed
        self._accessfrom_data: Optional[Dict[str, Dict[str, Any]]] = None  # Cache for AccessFrom data
        self._current_location_context: Optional[str] = None  # Track current location being processed

    def _get_accesspoint_traverse_funcs(self) -> Dict[str, Any]:
        """Get traverse functions for all AccessPoints (cached).

        Returns:
            Dict mapping AccessPoint name to traverse function
        """
        if self._accesspoint_traverse_funcs is None:
            try:
                from .sm_traverse_extractor import get_accesspoint_traverse_funcs
                self._accesspoint_traverse_funcs = get_accesspoint_traverse_funcs(self.world)
                logger.info(f"SM: Loaded traverse functions for {len(self._accesspoint_traverse_funcs)} AccessPoints")
            except Exception as e:
                logger.error(f"SM: Failed to extract AccessPoint traverse functions: {e}", exc_info=True)
                self._accesspoint_traverse_funcs = {}

        return self._accesspoint_traverse_funcs

    def _get_accessfrom_data(self) -> Dict[str, Dict[str, Any]]:
        """Get AccessFrom data for all VARIA locations (cached).

        Returns:
            Dict mapping location names to their AccessFrom info
        """
        if self._accessfrom_data is None:
            try:
                from .sm_accessfrom_extractor import get_location_accessfrom_data
                self._accessfrom_data = get_location_accessfrom_data(self.world)
                logger.info(f"SM: Loaded AccessFrom data for {len(self._accessfrom_data)} locations")
            except Exception as e:
                logger.error(f"SM: Failed to extract AccessFrom data: {e}", exc_info=True)
                self._accessfrom_data = {}

        return self._accessfrom_data

    def _get_varia_item_types(self) -> Dict[str, str]:
        """Get mapping of item names to their VARIA types.

        Returns:
            Dict mapping Archipelago item names to VARIA type names
        """
        if self._varia_item_types is None:
            self._varia_item_types = {}
            try:
                from worlds.sm.variaRandomizer.rando.Items import ItemManager
                # ItemManager.Items is a dict of Type -> Item objects
                for item_type, item_obj in ItemManager.Items.items():
                    # item_obj.Name is the Archipelago name, item_obj.Type is the VARIA type
                    if hasattr(item_obj, 'Name') and hasattr(item_obj, 'Type'):
                        self._varia_item_types[item_obj.Name] = item_obj.Type
                logger.info(f"SM: Loaded {len(self._varia_item_types)} VARIA item type mappings")
            except Exception as e:
                logger.error(f"SM: Failed to load VARIA item types: {e}", exc_info=True)

        return self._varia_item_types

    def get_item_type_for_name(self, item_name: str, world) -> Optional[str]:
        """Get VARIA type for an item name.

        Args:
            item_name: The name of the item
            world: The world instance

        Returns:
            The VARIA type name, or None if not found
        """
        varia_types = self._get_varia_item_types()
        varia_type = varia_types.get(item_name)

        if varia_type:
            logger.debug(f"SM: Item '{item_name}' has VARIA type '{varia_type}'")

        return varia_type

    def get_game_info(self, world) -> Dict[str, Any]:
        """Get game-specific information including door color data.

        Returns:
            Dict with game info including door colors for the frontend
        """
        # Start with base game info
        game_info = super().get_game_info(world)

        # Add door color data
        door_data = {}
        try:
            from worlds.sm.variaRandomizer.utils.doorsmanager import DoorsManager
            player_id = world.player if world else 1

            # Get the doors dictionary for this player
            if hasattr(DoorsManager, 'doorsDict') and player_id in DoorsManager.doorsDict:
                doors_dict = DoorsManager.doorsDict[player_id]
                for door_name, door_obj in doors_dict.items():
                    # Get the actual door color (considering hidden status)
                    door_data[door_name] = door_obj.getColor()
                logger.info(f"SM: Exported {len(door_data)} door colors")
            else:
                logger.warning(f"SM: DoorsManager.doorsDict not found or player {player_id} not in doorsDict")

        except Exception as e:
            logger.error(f"SM: Failed to export door data: {e}", exc_info=True)

        # Add doors to game_info if we have any
        if door_data:
            game_info['doors'] = door_data

        return game_info

    def get_item_data(self, world):
        """Get item data from world, adding VARIA type information.

        Overrides the base class to add VARIA Type field to items.
        Follows the same pattern as ALTTP exporter.
        """
        logger.debug("SM: get_item_data called")
        # Get base item data from parent class
        item_data = super().get_item_data(world)
        logger.debug(f"SM: Got {len(item_data)} items from parent")

        # Add VARIA type information
        try:
            varia_types = self._get_varia_item_types()
            logger.debug(f"SM: Retrieved {len(varia_types)} VARIA type mappings")

            type_count = 0
            for item_name, item_info in item_data.items():
                if item_name in varia_types:
                    item_info['type'] = varia_types[item_name]
                    type_count += 1
                    logger.debug(f"SM: Set type='{varia_types[item_name]}' for item '{item_name}'")

            logger.info(f"SM: Added VARIA types to {type_count} items out of {len(item_data)} total")
        except Exception as e:
            logger.error(f"SM: Error adding VARIA types: {e}", exc_info=True)

        return item_data

    def _get_simple_accessfrom_locations(self) -> Set[str]:
        """Get the set of location names with simple AccessFrom (all regions use SMBool(True)).

        This is cached after first call for performance.
        """
        if self._simple_accessfrom_locations is None:
            try:
                from .sm_accessfrom_extractor import get_simple_accessfrom_locations
                self._simple_accessfrom_locations = get_simple_accessfrom_locations(self.world)
                logger.info(f"SM: Loaded {len(self._simple_accessfrom_locations)} locations with simple AccessFrom")
            except Exception as e:
                logger.error(f"SM: Failed to extract simple AccessFrom locations: {e}")
                self._simple_accessfrom_locations = set()

        return self._simple_accessfrom_locations

    def _get_all_accessfrom_info(self) -> Dict[str, Dict[str, str]]:
        """Get ALL AccessFrom information for all locations.

        Returns:
            Dict mapping location_name -> {region_name -> lambda_source}
        """
        if self._all_accessfrom_info is None:
            try:
                from .sm_accessfrom_extractor import extract_all_accessfrom_info
                import worlds.sm
                import os
                world_module_path = os.path.dirname(worlds.sm.__file__)
                self._all_accessfrom_info = extract_all_accessfrom_info(world_module_path)
                logger.info(f"SM: Loaded AccessFrom data for {len(self._all_accessfrom_info)} locations")
            except Exception as e:
                logger.error(f"SM: Failed to extract all AccessFrom info: {e}", exc_info=True)
                self._all_accessfrom_info = {}

        return self._all_accessfrom_info

    def get_custom_location_access_rule(self, location, world):
        """Custom handling for Super Metroid location access rules.

        Super Metroid locations use an AccessFrom + Available pattern:
        - AccessFrom: Dict[region_name -> lambda] defining requirements from each region
        - Available: lambda defining requirements once in the region

        The Python rule is: any(can_reach(region) AND AccessFrom[region](sm) for each region) AND Available(sm)

        We build this by:
        1. Extracting AccessFrom lambdas from source code
        2. Parsing each lambda individually
        3. Building: OR(can_reach(region1) AND lambda1, can_reach(region2) AND lambda2, ...) AND Available

        Returns:
            The custom rule to export, or None to use default handling
        """
        if not hasattr(location, 'access_rule') or not location.access_rule:
            return None

        location_name = location.name

        # Try to analyze the rule to see if it's an AND with accessFrom + Available
        try:
            from ..analyzer import analyze_rule
            analyzed = analyze_rule(location.access_rule)

            # Check if it's an AND rule with two conditions (accessFrom + Available pattern)
            if analyzed and analyzed.get('type') == 'and':
                conditions = analyzed.get('conditions', [])
                if len(conditions) == 2:
                    first = conditions[0]  # accessFrom
                    second = conditions[1]  # Available

                    # Check if first condition is accessFrom (any_of pattern)
                    if first.get('type') == 'any_of':
                        # This is an accessFrom + Available pattern
                        # We need to build the full rule from source data

                        # Get AccessFrom data from source
                        all_accessfrom = self._get_all_accessfrom_info()
                        if location_name not in all_accessfrom:
                            logger.warning(f"SM: Location '{location_name}' not found in AccessFrom data")
                            return None

                        accessfrom_dict = all_accessfrom[location_name]
                        logger.debug(f"SM: Building AccessFrom rule for '{location_name}' with {len(accessfrom_dict)} regions")

                        # Parse each AccessFrom lambda and build the OR structure
                        accessfrom_conditions = []
                        for region_name, lambda_source in accessfrom_dict.items():
                            # Parse the lambda to get its body
                            parsed_lambda = self._parse_accessfrom_lambda(lambda_source, region_name, location_name)
                            if parsed_lambda:
                                # Build: can_reach(region) AND parsed_lambda
                                accessfrom_conditions.append({
                                    'type': 'and',
                                    'conditions': [
                                        {'type': 'state_method', 'method': 'can_reach', 'args': [{'type': 'constant', 'value': region_name}]},
                                        parsed_lambda
                                    ]
                                })

                        if not accessfrom_conditions:
                            logger.warning(f"SM: Failed to parse any AccessFrom lambdas for '{location_name}'")
                            return None

                        # Build the OR of all AccessFrom conditions
                        if len(accessfrom_conditions) == 1:
                            accessfrom_rule = accessfrom_conditions[0]
                        else:
                            accessfrom_rule = {
                                'type': 'or',
                                'conditions': accessfrom_conditions
                            }

                        # Get the Available rule (already analyzed)
                        available_rule = second

                        # Build the final rule: AccessFrom AND Available
                        # If Available is SMBool(True), just use AccessFrom
                        if self._is_always_true_smbool(available_rule):
                            logger.debug(f"SM: Location '{location_name}' has Available=SMBool(True), using only AccessFrom")
                            return accessfrom_rule
                        else:
                            logger.debug(f"SM: Location '{location_name}' has both AccessFrom and Available requirements")
                            return {
                                'type': 'and',
                                'conditions': [accessfrom_rule, available_rule]
                            }

            return None
        except Exception as e:
            logger.error(f"SM: Error building location rule for {location_name}: {e}", exc_info=True)
            return None

    def _parse_accessfrom_lambda(self, lambda_source: str, region_name: str, location_name: str) -> Optional[Dict[str, Any]]:
        """Parse an AccessFrom lambda and return its rule structure.

        Args:
            lambda_source: The lambda source code (e.g., "(lambda sm: sm.canPassTerminatorBombWall())")
            region_name: The region name (for logging)
            location_name: The location name (for logging)

        Returns:
            Parsed rule dict, or None if parsing failed
        """
        try:
            import ast
            from ..analyzer import analyze_rule

            # Remove outer parentheses if present
            lambda_source = lambda_source.strip()
            if lambda_source.startswith('(') and lambda_source.endswith(')'):
                lambda_source = lambda_source[1:-1].strip()

            # Parse the lambda
            lambda_ast = ast.parse(lambda_source, mode='eval').body
            if not isinstance(lambda_ast, ast.Lambda):
                logger.warning(f"SM: AccessFrom for '{location_name}' from '{region_name}' is not a lambda: {lambda_source}")
                return None

            # Analyze the lambda body using analyze_rule with ast_node parameter
            analyzed = analyze_rule(
                ast_node=lambda_ast.body,
                closure_vars={},
                game_handler=self,
                player_context=None,
                context_info=f"AccessFrom {region_name}->{location_name}"
            )
            if not analyzed:
                logger.warning(f"SM: Failed to analyze AccessFrom lambda for '{location_name}' from '{region_name}'")
                return None

            # Expand the analyzed rule
            expanded = self.expand_rule(analyzed)
            logger.debug(f"SM: Parsed AccessFrom lambda for '{location_name}' from '{region_name}': {type(expanded)}")
            return expanded

        except Exception as e:
            logger.error(f"SM: Error parsing AccessFrom lambda for '{location_name}' from '{region_name}': {e}", exc_info=True)
            return None

    def _check_smbool_true_pattern(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule represents SMBool(True) construction."""
        if not rule:
            return False

        rule_type = rule.get('type')

        # Check for function_call type (original pattern)
        if rule_type == 'function_call':
            func = rule.get('function', {})
            if func.get('type') != 'name' or func.get('name') != 'SMBool':
                return False

            args = rule.get('args', [])
            if not args:
                return False

            # Check if first arg is constant True
            first_arg = args[0]
            return (first_arg.get('type') == 'constant' and
                    first_arg.get('value') is True)

        # Check for helper type (analyzer converts to this)
        elif rule_type == 'helper':
            if rule.get('name') != 'SMBool':
                return False

            args = rule.get('args', [])
            if not args:
                return False

            # Check if first arg is constant True
            first_arg = args[0]
            return (first_arg.get('type') == 'constant' and
                    first_arg.get('value') is True)

        return False

    def _is_always_true_smbool(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule is evalSMBool(SMBool(True), ...) which would simplify to True.

        This indicates the location has no item requirements once in the region,
        and the actual requirements are in accessFrom (which we can't export).
        """
        if not rule:
            return False

        rule_type = rule.get('type')

        # Check for evalSMBool(SMBool(True), ...)
        if rule_type == 'helper' and rule.get('name') == 'evalSMBool':
            args = rule.get('args', [])
            if len(args) >= 1:
                first_arg = args[0]
                return self._check_smbool_true_pattern(first_arg)

        # Check for function_call pattern
        if rule_type == 'function_call':
            function = rule.get('function', {})
            if function.get('type') == 'attribute':
                obj = function.get('object', {})
                attr = function.get('attr')
                if (obj.get('type') == 'name' and
                    obj.get('name') == 'self' and
                    attr == 'evalSMBool'):
                    args = rule.get('args', [])
                    if len(args) >= 1:
                        return self._check_smbool_true_pattern(args[0])

        return False

    def _try_simplify_evalSMBool(self, args: list) -> Optional[Dict[str, Any]]:
        """Try to simplify evalSMBool calls if possible.

        Super Metroid uses VARIA logic system (sm.wor, sm.canFly, etc.) which
        is complex. We'll try to export the actual logic so the frontend can
        evaluate it properly.

        For now, we DON'T simplify - we let the actual rule structure pass through.
        """
        # Don't simplify - return None to indicate no simplification
        logger.debug("SM: NOT simplifying evalSMBool call - preserving actual logic")
        return None

    _expand_call_count = 0

    def _check_accessFrom_pattern(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule is the problematic accessFrom comprehension pattern.

        The pattern is: any_of with iterator_info that references accessFrom variable.
        These rules hit recursion limits and create corrupted rule structures.
        """
        if not rule or rule.get('type') != 'any_of':
            return False

        # Check for iterator_info
        iterator_info = rule.get('iterator_info', {})
        if not iterator_info:
            return False

        # Check if iterator references accessFrom
        iterator = iterator_info.get('iterator', {})
        if iterator.get('type') == 'function_call':
            func = iterator.get('function', {})
            if func.get('type') == 'attribute':
                obj = func.get('object', {})
                attr = func.get('attr')
                # Pattern: accessFrom.items()
                if (obj.get('type') == 'name' and
                    obj.get('name') == 'accessFrom' and
                    attr == 'items'):
                    return True

        return False

    def _is_maxdiff_reference(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule is a reference to maxDiff (state.smbm[player].maxDiff).

        The VARIA logic uses state.smbm[player].maxDiff to get the maximum difficulty.
        This is a Python object that doesn't exist in the frontend, so we need to
        replace it with a constant value.

        Args:
            rule: The rule to check

        Returns:
            True if this is a maxDiff reference pattern
        """
        if not rule or not isinstance(rule, dict):
            return False

        # Pattern: attribute access where attr is 'maxDiff'
        if rule.get('type') == 'attribute' and rule.get('attr') == 'maxDiff':
            return True

        # Pattern: subscript into smbm
        if rule.get('type') == 'subscript':
            value = rule.get('value', {})
            if (value.get('type') == 'attribute' and
                value.get('attr') == 'smbm'):
                return True

        return False

    def _is_getDmgReduction_reference(self, rule: Dict[str, Any]) -> bool:
        """Check if a rule is a reference to sm.getDmgReduction()[0].

        The VARIA logic uses sm.getDmgReduction()[0] to get the damage reduction factor.
        This is a dynamic calculation based on current inventory that can't be directly
        evaluated in the frontend as a subscript into a function call result.

        Args:
            rule: The rule to check

        Returns:
            True if this is a getDmgReduction reference pattern
        """
        if not rule or not isinstance(rule, dict):
            return False

        # Pattern: subscript into function_call where function is sm.getDmgReduction
        # {type: subscript, value: {type: function_call, function: {type: attribute, object: {name: sm}, attr: getDmgReduction}}, index: ...}
        if rule.get('type') == 'subscript':
            value = rule.get('value', {})
            if value.get('type') == 'function_call':
                func = value.get('function', {})
                if func.get('type') == 'attribute':
                    obj = func.get('object', {})
                    attr = func.get('attr')
                    if (obj.get('type') == 'name' and
                        obj.get('name') == 'sm' and
                        attr == 'getDmgReduction'):
                        return True

        return False

    def _check_deeply_nested_any_of(self, rule: Dict[str, Any], max_depth: int = 5) -> bool:
        """Check if a rule has deeply nested any_of structures (indicating recursion).

        Args:
            rule: The rule to check
            max_depth: Maximum depth before considering it "deeply nested"

        Returns:
            True if the rule has nested any_of at or beyond max_depth
        """
        def count_depth(r, current_depth=0):
            if not r or not isinstance(r, dict):
                return current_depth

            if r.get('type') == 'any_of':
                # Check element_rule for further nesting
                element_rule = r.get('element_rule')
                if element_rule:
                    # Look for nested any_of in the conditions
                    if isinstance(element_rule, dict):
                        if element_rule.get('type') == 'and':
                            conditions = element_rule.get('conditions', [])
                            for cond in conditions:
                                if cond.get('type') == 'helper' and cond.get('name') == 'evalSMBool':
                                    args = cond.get('args', [])
                                    if args and args[0].get('type') == 'any_of':
                                        # Found nested any_of
                                        nested_depth = count_depth(args[0], current_depth + 1)
                                        if nested_depth >= max_depth:
                                            return nested_depth
            return current_depth

        depth = count_depth(rule)
        return depth >= max_depth

    def _is_simple_accessFrom(self, rule: Dict[str, Any]) -> bool:
        """Check if an accessFrom pattern has only SMBool(True) requirements.

        A simple accessFrom is: any(state.can_reach(region) and evalSMBool(SMBool(True), ...))
        This means the location is accessible from the region with no item requirements.

        NOTE: Due to analyzer recursion limits, this check almost never succeeds.
        Most accessFrom patterns become corrupted nested structures even if they're simple.
        """
        if not rule or rule.get('type') != 'any_of':
            return False

        # Check the element_rule
        element_rule = rule.get('element_rule')
        if not element_rule:
            return False

        # Should be an AND of: state.can_reach(...) and evalSMBool(SMBool(True), ...)
        if element_rule.get('type') != 'and':
            return False

        conditions = element_rule.get('conditions', [])
        if len(conditions) != 2:
            return False

        # Second condition should be evalSMBool(SMBool(True), ...)
        second = conditions[1]
        if self._is_always_true_smbool(second):
            logger.debug("SM: _is_simple_accessFrom: DETECTED SIMPLE PATTERN (rare!)")
            return True

        return False

    def _contains_complex_helpers(self, rule: Dict[str, Any]) -> bool:
        """Recursively check if a rule contains complex helper calls.

        Simple helpers: SMBool, evalSMBool
        Complex helpers: any VARIA logic methods like canPassTerminatorBombWall, haveItem, etc.

        Returns True if any complex helpers are found.
        """
        if not rule or not isinstance(rule, dict):
            return False

        rule_type = rule.get('type')

        # Check if this is a complex helper call
        if rule_type == 'helper':
            helper_name = rule.get('name', '')
            # These are simple helpers that don't indicate item requirements
            # 'rule' is an artifact from analyzer recursion limits
            simple_helpers = {'SMBool', 'evalSMBool', 'rule'}
            if helper_name not in simple_helpers:
                # Any other helper is complex (haveItem, canPass*, traverse, etc.)
                return True

        # Check if this is a state_method call (also indicates requirements)
        if rule_type == 'state_method':
            method_name = rule.get('method', '')
            # can_reach is fine, but other state methods indicate requirements
            if method_name not in {'can_reach'}:
                return True

        # Recursively check nested structures
        if rule_type in ['and', 'or']:
            for cond in rule.get('conditions', []):
                if self._contains_complex_helpers(cond):
                    return True

        if rule_type == 'not':
            return self._contains_complex_helpers(rule.get('condition'))

        if rule_type == 'helper':
            for arg in rule.get('args', []):
                if self._contains_complex_helpers(arg):
                    return True

        if rule_type == 'function_call':
            # Check if the function being called is a VARIA logic method (sm.method_name)
            function = rule.get('function', {})
            if function.get('type') == 'attribute':
                obj = function.get('object', {})
                attr = function.get('attr', '')
                # If calling sm.method_name, this is complex VARIA logic
                if obj.get('type') == 'name' and obj.get('name') == 'sm':
                    # Any sm.method_name is complex (wor, wand, canPass*, haveItem, etc.)
                    logger.debug(f"SM: Found complex function_call: sm.{attr}")
                    return True

            # Also check args recursively
            for arg in rule.get('args', []):
                if self._contains_complex_helpers(arg):
                    return True

        if rule_type == 'any_of' or rule_type == 'all_of':
            if self._contains_complex_helpers(rule.get('element_rule')):
                return True

        return False

    def set_exit_context(self, exit_name: Optional[str]):
        """Set the current exit being processed for ret variable resolution.

        Args:
            exit_name: The exit name in format "Source->Destination"
        """
        self._current_exit_context = exit_name

    def set_location_context(self, location_name: Optional[str]):
        """Set the current location being processed for AccessFrom extraction.

        Args:
            location_name: The location name
        """
        self._current_location_context = location_name

    def postprocess_entrance_rule(self, rule: Dict[str, Any], exit_name: str, connected_region: str = None) -> Dict[str, Any]:
        """Post-process an exit rule to expand and transform it.

        This is called by the main exporter after initial rule analysis.
        We use this to fill in missing canHellRun arguments based on exit context.

        Args:
            rule: The analyzed rule structure
            exit_name: The exit name in format "Source->Destination"
            connected_region: The name of the connected region

        Returns:
            Expanded and transformed rule
        """
        # Set exit context for expand_rule to use
        saved_exit_context = self._current_exit_context
        self._current_exit_context = exit_name

        try:
            expanded = self.expand_rule(rule)
            return expanded if expanded else rule
        finally:
            self._current_exit_context = saved_exit_context

    def _extract_accessfrom_requirements(self, location_name: str) -> Optional[Dict[str, Any]]:
        """Extract and export AccessFrom requirements for a location.

        For a location with complex AccessFrom requirements, this creates an OR rule
        that checks if any of the AccessFrom regions can provide access.

        Args:
            location_name: The name of the location

        Returns:
            Exported rule or None if extraction fails
        """
        try:
            accessfrom_data = self._get_accessfrom_data()
            if location_name not in accessfrom_data:
                logger.warning(f"SM: No AccessFrom data for location '{location_name}'")
                return None

            loc_data = accessfrom_data[location_name]
            regions_dict = loc_data.get('regions', {})

            if not regions_dict:
                logger.warning(f"SM: Empty AccessFrom regions for location '{location_name}'")
                return None

            # Parse each region's lambda and create a rule
            from ..analyzer import analyze_rule

            region_rules = []
            for region_name, region_lambda in regions_dict.items():
                try:
                    # Analyze the lambda
                    parsed = analyze_rule(region_lambda, {}, game_handler=self, player_context={'player': self.world.player if self.world else 1})
                    if parsed:
                        # Expand using our expand_rule logic
                        expanded = self.expand_rule(parsed)

                        # Combine with region reachability check
                        # The location is accessible from this region IF:
                        # 1. The region is reachable (state.can_reach)
                        # 2. The region's lambda requirements pass evalSMBool check
                        #
                        # In Python: state.can_reach(region) AND self.evalSMBool(rule(smbm), maxDiff)
                        # The AccessFrom rule returns an SMBool, which must be evaluated against maxDiff
                        wrapped_expanded = {
                            'type': 'helper',
                            'name': 'evalSMBool',
                            'args': [
                                expanded,
                                # maxDiff - use constant value (50 = hardcore) instead of complex Python path
                                {'type': 'constant', 'value': 50}
                            ]
                        }
                        combined_rule = {
                            'type': 'and',
                            'conditions': [
                                {
                                    'type': 'state_method',
                                    'method': 'can_reach',
                                    'args': [{'type': 'constant', 'value': region_name}]
                                },
                                wrapped_expanded
                            ]
                        }
                        region_rules.append(combined_rule)
                        logger.debug(f"SM: Extracted rule for region '{region_name}' -> location '{location_name}'")
                except Exception as e:
                    logger.warning(f"SM: Failed to parse AccessFrom lambda for region '{region_name}': {e}")
                    continue

            if not region_rules:
                logger.warning(f"SM: No valid region rules extracted for location '{location_name}'")
                return None

            # If only one region, return that rule directly
            if len(region_rules) == 1:
                logger.debug(f"SM: Single AccessFrom region for '{location_name}'")
                return region_rules[0]

            # Multiple regions: create OR rule
            result = {
                'type': 'or',
                'conditions': region_rules
            }
            logger.debug(f"SM: Created OR rule with {len(region_rules)} AccessFrom regions for '{location_name}'")
            return result

        except Exception as e:
            logger.error(f"SM: Failed to extract AccessFrom requirements for '{location_name}': {e}", exc_info=True)
            return None

    def get_unwrapped_exit_lambda(self, exit_name: str, original_lambda: Any) -> Optional[Any]:
        """Get the unwrapped transition/traverse lambda for an exit, if it's wrapped in Cache.ldeco.

        This method is called BEFORE the analyzer processes the exit rule, allowing us to
        provide the unwrapped lambda directly so the analyzer never encounters the 'ret' variable.

        Note: The original_lambda here is Archipelago's wrapper (lambda state: ...), not the
        raw transition lambda. We need to get the transition lambda directly from AccessPoint.

        For inter-area connections, the traverse lambda is used instead of a transition lambda.

        SPECIAL CASE: For exits to location-regions, we return None to keep the default behavior
        (always accessible). In SM, location-regions don't require traverse checks - the item
        requirements are handled by the location's access_rule, not the region exit.

        Args:
            exit_name: The exit name in format "Source->Destination"
            original_lambda: The Archipelago exit access_rule wrapper (not used)

        Returns:
            The unwrapped transition/traverse lambda if it was Cache.ldeco wrapped, otherwise None
        """
        if not exit_name or '->' not in exit_name:
            return None

        try:
            from .sm_traverse_extractor import get_transition_lambda, unwrap_cache_ldeco

            # Parse exit name
            parts = exit_name.split('->')
            if len(parts) != 2:
                return None

            source_ap_name = parts[0]
            dest_ap_name = parts[1]

            # SPECIAL CASE: Check if destination is a location-region
            # Location-regions should have NO exit rules (always accessible)
            # Item requirements are handled by location access_rules, not region exits
            accessfrom_data = self._get_accessfrom_data()
            if dest_ap_name in accessfrom_data:
                # This is an exit to a location-region - return None to use default (no rule)
                logger.debug(f"SM: Exit '{exit_name}' goes to location-region, skipping traverse (always accessible)")
                return None

            # Try to get the unwrapped transition lambda directly from AccessPoint
            # This will return None if the transition doesn't exist or isn't wrapped
            unwrapped = get_transition_lambda(source_ap_name, dest_ap_name, unwrap=True)

            if unwrapped:
                logger.debug(f"SM: Providing unwrapped transition lambda for exit '{exit_name}'")
                return unwrapped

            # If no transition found, this might be an inter-area connection
            # Inter-area connections use the traverse lambda from the source AccessPoint
            # Try to get and unwrap the traverse lambda
            traverse_funcs = self._get_accesspoint_traverse_funcs()
            traverse_func = traverse_funcs.get(source_ap_name)

            if traverse_func:
                # Try to unwrap it if it's wrapped
                unwrapped_traverse = unwrap_cache_ldeco(traverse_func)
                if unwrapped_traverse:
                    logger.debug(f"SM: Providing unwrapped traverse lambda for inter-area exit '{exit_name}'")
                    return unwrapped_traverse
                else:
                    # Not wrapped, return as-is
                    logger.debug(f"SM: Providing traverse lambda (not wrapped) for inter-area exit '{exit_name}'")
                    return traverse_func

            return None

        except Exception as e:
            logger.error(f"SM: Error getting unwrapped exit lambda for '{exit_name}': {e}", exc_info=True)
            return None

    def _parse_traverse_lambda(self, traverse_func, source_ap_name: str) -> Optional[Dict[str, Any]]:
        """Parse a traverse lambda function and return its rule structure.

        Args:
            traverse_func: The traverse lambda function from AccessPoint
            source_ap_name: The source AccessPoint name (for logging)

        Returns:
            Parsed rule dict, or None if parsing failed
        """
        try:
            from ..analyzer import analyze_rule

            # Save the current exit context and clear it temporarily
            # to avoid infinite recursion when the traverse lambda itself has 'ret' variables
            saved_context = self._current_exit_context
            self._current_exit_context = None

            try:
                # Analyze the traverse lambda
                analyzed = analyze_rule(
                    rule_func=traverse_func,
                    closure_vars={},
                    game_handler=self,
                    player_context=None,
                    context_info=f"Traverse lambda for {source_ap_name}"
                )

                if not analyzed:
                    logger.warning(f"SM: Failed to analyze traverse lambda for '{source_ap_name}'")
                    return None

                # Expand the analyzed rule
                expanded = self.expand_rule(analyzed)
                logger.debug(f"SM: Parsed traverse lambda for '{source_ap_name}'")
                return expanded

            finally:
                # Restore the exit context
                self._current_exit_context = saved_context

        except Exception as e:
            logger.error(f"SM: Error parsing traverse lambda for '{source_ap_name}': {e}", exc_info=True)
            return None

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand and transform Super Metroid rules.

        Transforms self.evalSMBool() function calls into direct helper calls
        that the JavaScript frontend can execute. Also simplifies common patterns.
        """
        if not rule:
            return rule

        rule_type = rule.get('type')

        # Handle unresolved 'ret' variable from Cache.ldeco decorator
        # The Cache.ldeco decorator creates a wrapper function with a local variable 'ret'
        # that stores the result of the wrapped function. When parsing entrance rules,
        # the analyzer sometimes captures this 'ret' variable instead of inlining it.
        # We need to extract and parse the actual traverse lambda from the AccessPoint.
        if rule_type == 'name' and rule.get('name') == 'ret':
            # Check if we have exit context
            if self._current_exit_context:
                # Parse exit name: "Source->Destination"
                if '->' in self._current_exit_context:
                    source_ap_name = self._current_exit_context.split('->')[0]
                    logger.debug(f"SM: Found 'ret' variable in exit '{self._current_exit_context}', extracting traverse lambda")

                    # Get traverse function for this AccessPoint
                    traverse_funcs = self._get_accesspoint_traverse_funcs()
                    traverse_func = traverse_funcs.get(source_ap_name)

                    if traverse_func:
                        # Parse the traverse lambda
                        parsed_traverse = self._parse_traverse_lambda(traverse_func, source_ap_name)
                        if parsed_traverse:
                            logger.debug(f"SM: Successfully replaced 'ret' with parsed traverse lambda for '{source_ap_name}'")
                            return parsed_traverse
                        else:
                            logger.warning(f"SM: Failed to parse traverse lambda for '{source_ap_name}', using conservative False")
                    else:
                        logger.warning(f"SM: No traverse function found for AccessPoint '{source_ap_name}'")
                else:
                    logger.warning(f"SM: Exit context '{self._current_exit_context}' does not contain '->'")
            else:
                # This can happen when parsing AccessFrom lambdas or other non-exit rules
                # that somehow contain 'ret' references (rare but possible with nested decorators)
                logger.debug("SM: Found 'ret' variable but no exit context set")

            # Conservative fallback
            logger.debug("SM: Found unresolved 'ret' variable, replacing with SMBool(False)")
            return {'type': 'constant', 'value': {'bool': False, 'difficulty': 0}}

        # Handle RomPatches.has() calls - resolve to constants since patches are fixed at generation time
        if rule_type == 'function_call':
            function = rule.get('function', {})
            if (function.get('type') == 'attribute' and
                function.get('attr') == 'has' and
                function.get('object', {}).get('type') == 'name' and
                function.get('object', {}).get('name') == 'RomPatches'):
                # This is a RomPatches.has(patch_id) call
                args = rule.get('args', [])
                if len(args) >= 1:
                    # The first arg can be a constant or an attribute reference (RomPatches.PatchName)
                    patch_arg = args[0]
                    patch_id = None

                    if patch_arg.get('type') == 'constant':
                        patch_id = patch_arg.get('value')
                    elif patch_arg.get('type') == 'attribute':
                        # Handle RomPatches.PatchName references
                        if (patch_arg.get('object', {}).get('type') == 'name' and
                            patch_arg.get('object', {}).get('name') == 'RomPatches'):
                            # Get the patch name and resolve it to its ID
                            patch_name = patch_arg.get('attr')
                            try:
                                from worlds.sm.variaRandomizer.rom.rom_patches import RomPatches
                                # Get the patch ID by accessing the class attribute
                                patch_id = getattr(RomPatches, patch_name, None)
                                if patch_id is not None:
                                    logger.debug(f"SM: Resolved RomPatches.{patch_name} to {patch_id}")
                            except Exception as e:
                                logger.error(f"SM: Failed to resolve RomPatches.{patch_name}: {e}")

                    if patch_id is not None:
                        # Check if this patch is active
                        try:
                            from worlds.sm.variaRandomizer.rom.rom_patches import RomPatches
                            player_id = self.world.player if self.world else 1
                            is_active = patch_id in RomPatches.ActivePatches.get(player_id, [])
                            logger.debug(f"SM: Resolved RomPatches.has({patch_id}) to {is_active}")
                            return {'type': 'constant', 'value': is_active}
                        except Exception as e:
                            logger.error(f"SM: Failed to resolve RomPatches.has({patch_id}): {e}")
                            # Conservative fallback: assume patch is not active
                            return {'type': 'constant', 'value': False}

        # Handle Bosses.bossDead() calls - convert to helper call
        if rule_type == 'function_call':
            function = rule.get('function', {})
            if (function.get('type') == 'attribute' and
                function.get('attr') == 'bossDead' and
                function.get('object', {}).get('type') == 'name' and
                function.get('object', {}).get('name') == 'Bosses'):
                # This is a Bosses.bossDead(sm, bossName) call
                # Convert to helper: bossDead(bossName)
                args = rule.get('args', [])
                # First arg is 'sm', second is the boss name
                if len(args) >= 2:
                    boss_arg = args[1]  # Second arg is the boss name
                    expanded_boss_arg = self.expand_rule(boss_arg)
                    logger.debug(f"SM: Converted Bosses.bossDead to helper call with boss={expanded_boss_arg}")
                    return {'type': 'helper', 'name': 'bossDead', 'args': [expanded_boss_arg]}

        # Check for AND rules that combine accessFrom and Available
        # The accessFrom comprehension can't be properly exported, so we skip it
        # However, if Available is SMBool(True), we need to export as False instead
        # of preserving it, since the actual requirements are in accessFrom
        if rule_type == 'and':
            conditions = rule.get('conditions', [])
            if len(conditions) == 2:
                first = conditions[0]
                second = conditions[1]
                # If first condition is accessFrom pattern, skip it and use only second
                if self._check_accessFrom_pattern(first) or self._check_deeply_nested_any_of(first):
                    logger.debug("SM: Found AND rule with accessFrom, checking Available part")

                    # Recursively expand the second condition (the Available part)
                    expanded = self.expand_rule(second)

                    # Check if the Available part is just evalSMBool(SMBool(True), ...)
                    if self._is_always_true_smbool(expanded):
                        # The Available part has no requirements, so the actual requirements
                        # are in the accessFrom comprehension.

                        # Check if this is a simple accessFrom (just SMBool(True))
                        if self._is_simple_accessFrom(first):
                            # Simple case: accessFrom returns SMBool(True) for all regions
                            # This means the location is accessible from the region with no item requirements
                            logger.debug("SM: Simple accessFrom detected (SMBool(True)) - exporting as True")
                            return {'type': 'constant', 'value': True}

                        # Complex accessFrom - try to extract the actual requirements
                        # Get the location name from context
                        if self._current_location_context:
                            extracted_rule = self._extract_accessfrom_requirements(self._current_location_context)
                            if extracted_rule:
                                logger.debug(f"SM: Extracted AccessFrom requirements for {self._current_location_context}")
                                return extracted_rule

                        # Fallback: Conservative approach
                        logger.debug("SM: Complex accessFrom with SMBool(True) Available - exporting as False (conservative)")
                        return {'type': 'constant', 'value': False}

                    # If Available has actual requirements, combine with AccessFrom
                    logger.debug("SM: Available part has actual requirements, checking for AccessFrom")

                    # Try to extract AccessFrom requirements
                    accessfrom_rule = None
                    if self._current_location_context:
                        accessfrom_rule = self._extract_accessfrom_requirements(self._current_location_context)

                    if accessfrom_rule:
                        # Combine Available AND AccessFrom
                        logger.debug(f"SM: Combining Available AND AccessFrom for {self._current_location_context}")
                        return {
                            'type': 'and',
                            'conditions': [expanded, accessfrom_rule]
                        }
                    else:
                        # No AccessFrom or extraction failed, just use Available
                        logger.debug("SM: Using Available part only (no AccessFrom extracted)")
                        return expanded

        # Check for accessFrom patterns that hit recursion limits
        # These create infinitely nested structures that can't be properly evaluated
        # Conservative: Export as False to prevent incorrect accessibility
        # TODO: Improve detection to distinguish simple vs complex patterns
        if self._check_accessFrom_pattern(rule):
            logger.debug("SM: Found accessFrom comprehension pattern, exporting as constant False")
            return {'type': 'constant', 'value': False}

        # Also check for deeply nested any_of structures (result of recursion limits)
        # Conservative: Export as False
        if self._check_deeply_nested_any_of(rule):
            logger.debug("SM: Found deeply nested any_of pattern (recursion artifact), exporting as constant False")
            return {'type': 'constant', 'value': False}

        # Handle helper nodes with name='evalSMBool' (analyzer converts self.evalSMBool to helper)
        if rule_type == 'helper' and rule.get('name') == 'evalSMBool':
            # DON'T simplify evalSMBool(SMBool(True), ...) to constant True
            # even though mathematically it's always true, because:
            # 1. For locations with accessFrom, the region access provides the restriction
            # 2. Preserving the structure allows proper frontend evaluation
            # 3. It makes the exported rules more consistent and debuggable

            # Preserve the evalSMBool helper call and expand its arguments
            if 'args' in rule:
                expanded_args = []
                for i, arg in enumerate(rule['args']):
                    expanded_arg = self.expand_rule(arg)
                    # The second argument is typically maxDiff (state.smbm[player].maxDiff)
                    # Replace complex attribute access patterns with the actual maxDiff value (50 = hardcore)
                    if i == 1 and self._is_maxdiff_reference(expanded_arg):
                        # Replace with constant maxDiff value (hardcore = 50)
                        expanded_args.append({'type': 'constant', 'value': 50})
                    else:
                        expanded_args.append(expanded_arg)
                rule['args'] = expanded_args
            return rule

        # Transform function_call nodes where function is an attribute access on 'self' or 'sm'
        # (This is kept for compatibility but may not be needed if analyzer converts to helper)
        if rule_type == 'function_call':
            function = rule.get('function', {})
            if function.get('type') == 'attribute':
                obj = function.get('object', {})
                attr = function.get('attr')

                # Transform self.evalSMBool(...) into helper call
                if obj.get('type') == 'name' and obj.get('name') == 'self' and attr == 'evalSMBool':
                    # Convert to helper call and expand arguments
                    # Don't simplify SMBool(True) - preserve the structure
                    expanded_args = [self.expand_rule(arg) for arg in rule.get('args', [])]
                    return {'type': 'helper', 'name': 'evalSMBool', 'args': expanded_args}

                # Transform sm.methodName(...) into helper calls
                # These are VARIA logic methods like sm.wor, sm.wand, sm.haveItem, etc.
                if obj.get('type') == 'name' and obj.get('name') == 'sm':
                    # Convert to helper call
                    expanded_args = [self.expand_rule(arg) for arg in rule.get('args', [])]

                    # Special handling for canHellRun with no args - add default arguments
                    if attr == 'canHellRun' and not expanded_args:
                        # Determine hell run type from context
                        hellrun_type = 'MainUpperNorfair'  # Default
                        mult = 1.0
                        minE = 2

                        if self._current_exit_context:
                            exit_name = self._current_exit_context.lower()
                            # Lower Norfair exits use 'LowerNorfair' type with minE=8
                            ln_keywords = ['ln ', 'ln->', 'lower norfair', 'firefleas', 'screw attack', 'ridley',
                                           'golden torizo', 'three muskateers', 'wasteland', 'mickey mouse']
                            if any(kw in exit_name for kw in ln_keywords):
                                hellrun_type = 'LowerNorfair'
                                mult = 1.0
                                minE = 8
                            # Ice hellrun is only for Ice area exits (not Cathedral which uses MainUpperNorfair)
                            elif 'ice' in exit_name and 'cathedral' not in exit_name:
                                hellrun_type = 'Ice'
                            # Map exit names to hellRunsTable entries for accurate mult/minE
                            # 'Bubble -> Cathedral Missiles': {'mult': 0.66, 'minE': 2, 'hellRun': 'MainUpperNorfair'}
                            elif 'bubble' in exit_name and 'cathedral' in exit_name:
                                mult = 0.66
                                hellrun_type = 'MainUpperNorfair'  # Cathedral uses MainUpperNorfair, not Ice
                            # 'Bubble -> Croc': {'mult': 2.0, 'minE': 2}
                            # 'Norfair Entrance -> Croc via Frog': {'mult': 2.0, 'minE': 1}
                            elif 'croc' in exit_name or 'speedway' in exit_name:
                                if 'bubble' in exit_name:
                                    mult = 2.0
                                    minE = 2
                                elif 'business' in exit_name or 'norfair entrance' in exit_name:
                                    mult = 2.0  # Without Wave: 2.0, with Wave: 4.0 - use conservative
                                    minE = 1
                            # 'Bubble -> Kronic Boost Room': {'mult': 1.25, 'minE': 2}
                            # 'Bubble -> Kronic Boost Room wo/Bomb': {'mult': 0.5, 'minE': 2} (from Top)
                            elif 'kronic' in exit_name:
                                # From Bubble Mountain Top, you go "all the way around" (wo/Bomb), mult=0.5
                                # From Bubble Mountain (not Top), you have bombs available, mult=1.25
                                if 'bubble mountain top' in exit_name:
                                    mult = 0.5  # wo/Bomb - harder route
                                else:
                                    mult = 1.25  # with bomb available
                                minE = 2
                            # 'Bubble Top <-> Bubble Bottom': {'mult': 0.357, 'minE': 2}
                            # Traversing between top and bottom of Bubble Mountain is very difficult
                            elif 'bubble' in exit_name and ('bottom' in exit_name or 'top' in exit_name):
                                mult = 0.357
                                minE = 2
                            logger.debug(f"SM: canHellRun() converted with type={hellrun_type}, mult={mult}, minE={minE} for exit '{self._current_exit_context}'")
                        elif self._current_location_context:
                            loc_name = self._current_location_context.lower()
                            # Lower Norfair locations use 'LowerNorfair' type with minE=8
                            ln_keywords = ['lower norfair', 'firefleas', 'screw attack', 'ridley',
                                           'golden torizo', 'mickey mouse', 'wasteland']
                            if any(kw in loc_name for kw in ln_keywords):
                                hellrun_type = 'LowerNorfair'
                                mult = 1.0
                                minE = 8
                            elif 'ice' in loc_name:
                                hellrun_type = 'Ice'
                            # Map location names to hellRunsTable entries for accurate mult/minE
                            # 'Bubble -> Norfair Reserve Missiles': {'mult': 3.0, 'minE': 1}
                            elif 'bubble' in loc_name and ('norfair' in loc_name or 'green door' in loc_name):
                                mult = 3.0
                                minE = 1
                            # 'Bubble -> Norfair Reserve': {'mult': 1.0, 'minE': 2}
                            elif 'reserve' in loc_name and 'norfair' in loc_name:
                                mult = 1.0
                                minE = 2
                            logger.debug(f"SM: canHellRun() converted with type={hellrun_type}, mult={mult}, minE={minE} for location '{self._current_location_context}'")
                        else:
                            logger.debug(f"SM: canHellRun() converted with default type={hellrun_type}")

                        expanded_args = [
                            {'type': 'constant', 'value': hellrun_type},
                            {'type': 'constant', 'value': mult},
                            {'type': 'constant', 'value': minE}
                        ]

                    return {'type': 'helper', 'name': attr, 'args': expanded_args}

        # Recursively process nested structures
        if rule_type == 'and' or rule_type == 'or':
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        if rule_type == 'not':
            if 'condition' in rule:
                rule['condition'] = self.expand_rule(rule['condition'])

        # Process helper arguments
        if rule_type == 'helper':
            # Handle canHellRun with no args - kwargs from Settings.hellRunsTable were lost
            # Add default arguments based on context if available
            if rule.get('name') == 'canHellRun' and not rule.get('args'):
                # Determine hell run type from exit context if available
                # Most exits use 'MainUpperNorfair', Ice area uses 'Ice'
                # Values from Settings.hellRunsTable in VARIA randomizer
                hellrun_type = 'MainUpperNorfair'  # Default to stricter type
                mult = 1.0
                minE = 2

                if self._current_exit_context:
                    exit_name = self._current_exit_context.lower()
                    # Lower Norfair exits use 'LowerNorfair' type with minE=8 (requires suits)
                    # Settings.hellRunsTable['LowerNorfair']['Main'] = {'mult':1.0, 'minE':8, 'hellRun':'LowerNorfair'}
                    ln_keywords = ['ln ', 'ln->', 'lower norfair', 'firefleas', 'screw attack', 'ridley',
                                   'golden torizo', 'three muskateers', 'wasteland', 'mickey mouse']
                    if any(kw in exit_name for kw in ln_keywords):
                        hellrun_type = 'LowerNorfair'
                        mult = 1.0
                        minE = 8  # LN requires heat protection (suits) or 8+ energy
                    # Ice hellrun is only for Ice area exits (not Cathedral which uses MainUpperNorfair)
                    elif 'ice' in exit_name and 'cathedral' not in exit_name:
                        hellrun_type = 'Ice'
                    # Map exit names to hellRunsTable entries for accurate mult/minE
                    # 'Bubble -> Cathedral Missiles': {'mult': 0.66, 'minE': 2, 'hellRun': 'MainUpperNorfair'}
                    elif 'bubble' in exit_name and 'cathedral' in exit_name:
                        mult = 0.66
                        hellrun_type = 'MainUpperNorfair'  # Cathedral uses MainUpperNorfair, not Ice
                    # 'Bubble -> Croc': {'mult': 2.0, 'minE': 2}
                    # 'Norfair Entrance -> Croc via Frog': {'mult': 2.0, 'minE': 1}
                    elif 'croc' in exit_name or 'speedway' in exit_name:
                        if 'bubble' in exit_name:
                            mult = 2.0
                            minE = 2
                        elif 'business' in exit_name or 'norfair entrance' in exit_name:
                            mult = 2.0  # Without Wave: 2.0, with Wave: 4.0 - use conservative
                            minE = 1
                    # 'Bubble -> Kronic Boost Room': {'mult': 1.25, 'minE': 2}
                    # 'Bubble -> Kronic Boost Room wo/Bomb': {'mult': 0.5, 'minE': 2} (from Top)
                    elif 'kronic' in exit_name:
                        # From Bubble Mountain Top, you go "all the way around" (wo/Bomb), mult=0.5
                        # From Bubble Mountain (not Top), you have bombs available, mult=1.25
                        if 'bubble mountain top' in exit_name:
                            mult = 0.5  # wo/Bomb - harder route
                        else:
                            mult = 1.25  # with bomb available
                        minE = 2
                    # 'Bubble Top <-> Bubble Bottom': {'mult': 0.357, 'minE': 2}
                    # Traversing between top and bottom of Bubble Mountain is very difficult
                    elif 'bubble' in exit_name and ('bottom' in exit_name or 'top' in exit_name):
                        mult = 0.357
                        minE = 2
                    logger.debug(f"SM: canHellRun with no args in exit '{self._current_exit_context}', using type={hellrun_type}, mult={mult}, minE={minE}")
                elif self._current_location_context:
                    loc_name = self._current_location_context.lower()
                    # Lower Norfair locations use 'LowerNorfair' type with minE=8
                    ln_keywords = ['lower norfair', 'firefleas', 'screw attack', 'ridley',
                                   'golden torizo', 'mickey mouse', 'wasteland']
                    if any(kw in loc_name for kw in ln_keywords):
                        hellrun_type = 'LowerNorfair'
                        mult = 1.0
                        minE = 8
                    elif 'ice' in loc_name:
                        hellrun_type = 'Ice'
                    # Map location names to hellRunsTable entries for accurate mult/minE
                    # 'Bubble -> Norfair Reserve Missiles': {'mult': 3.0, 'minE': 1}
                    elif 'bubble' in loc_name and ('norfair' in loc_name or 'green door' in loc_name):
                        mult = 3.0
                        minE = 1
                    # 'Bubble -> Norfair Reserve': {'mult': 1.0, 'minE': 2}
                    elif 'reserve' in loc_name and 'norfair' in loc_name:
                        mult = 1.0
                        minE = 2
                    logger.debug(f"SM: canHellRun with no args in location '{self._current_location_context}', using type={hellrun_type}, mult={mult}, minE={minE}")
                else:
                    logger.debug(f"SM: canHellRun with no args, no context, using type={hellrun_type}")

                rule['args'] = [
                    {'type': 'constant', 'value': hellrun_type},
                    {'type': 'constant', 'value': mult},
                    {'type': 'constant', 'value': minE}
                ]
            elif 'args' in rule:
                rule['args'] = [self.expand_rule(arg) for arg in rule['args']]

        # Process function_call arguments (for other function calls)
        if rule_type == 'function_call':
            if 'args' in rule:
                rule['args'] = [self.expand_rule(arg) for arg in rule['args']]

        # Process generator expressions
        if rule_type == 'generator_expression':
            if 'element' in rule:
                rule['element'] = self.expand_rule(rule['element'])

        # Process binary operations
        if rule_type == 'binary_op' or rule_type == 'compare':
            # Special case: division by sm.getDmgReduction()[0]
            # Transform: X / getDmgReduction()[0] -> divideByDmgReduction(X)
            if (rule.get('op') == '/' and
                self._is_getDmgReduction_reference(rule.get('right'))):
                numerator = rule.get('left', {'type': 'constant', 'value': 1})
                # Recursively expand the numerator first
                numerator = self.expand_rule(numerator)
                return {
                    'type': 'helper',
                    'name': 'divideByDmgReduction',
                    'args': [numerator]
                }

            if 'left' in rule:
                rule['left'] = self.expand_rule(rule['left'])
            if 'right' in rule:
                rule['right'] = self.expand_rule(rule['right'])

        # Process conditionals
        if rule_type == 'conditional':
            if 'test' in rule:
                rule['test'] = self.expand_rule(rule['test'])
            if 'if_true' in rule and rule['if_true'] is not None:
                rule['if_true'] = self.expand_rule(rule['if_true'])
            if 'if_false' in rule and rule['if_false'] is not None:
                rule['if_false'] = self.expand_rule(rule['if_false'])

        # Process any_of and all_of (list comprehensions)
        if rule_type == 'any_of' or rule_type == 'all_of':
            if 'element_rule' in rule:
                rule['element_rule'] = self.expand_rule(rule['element_rule'])
            # Also expand iterator_info if present
            if 'iterator_info' in rule:
                iterator_info = rule['iterator_info']
                if 'iterator' in iterator_info:
                    iterator_info['iterator'] = self.expand_rule(iterator_info['iterator'])
                if 'target' in iterator_info:
                    iterator_info['target'] = self.expand_rule(iterator_info['target'])

        return rule

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Super Metroid specific settings including hardRooms and ROM patches.

        Args:
            world: The world instance
            multiworld: The multiworld instance
            player: The player ID

        Returns:
            Dict containing game settings
        """
        # Get base settings
        settings = super().get_settings_data(world, multiworld, player)

        # Super Metroid uses base_items (default), not resolved_items
        # All SM items appear in both base_items and resolved_items with identical values
        # Using the default (False) allows items to be added via location checks

        # Super Metroid needs non-advancement items (Missiles, Supers, Power Bombs) for logic
        # These items open colored doors and are essential for progression
        settings['count_non_advancement_items'] = True

        # Add hardRooms settings
        try:
            from worlds.sm.variaRandomizer.utils.parameters import Settings as SMSettings
            settings['hardRooms'] = SMSettings.hardRooms
            logger.info(f"SM: Exported hardRooms settings: {settings['hardRooms']}")
        except Exception as e:
            logger.error(f"SM: Failed to export hardRooms settings: {e}", exc_info=True)
            settings['hardRooms'] = {}

        # Add ROM patch settings (these affect logic)
        rom_patches = {}
        try:
            from worlds.sm.variaRandomizer.rom.rom_patches import RomPatches

            # Check which ROM patches are active for this player
            # These patches affect logic evaluation (especially suit behavior)
            # RomPatches.ActivePatches[player] contains the list of active patch IDs
            patch_mapping = {
                'NoGravityEnvProtection': RomPatches.NoGravityEnvProtection,
                'ProgressiveSuits': RomPatches.ProgressiveSuits,
                'AreaRandoBlueDoors': RomPatches.AreaRandoBlueDoors,
                'LNChozoSJCheckDisabled': RomPatches.LNChozoSJCheckDisabled,
            }

            # Get active patches for this player
            active_patches = RomPatches.ActivePatches.get(player, [])
            logger.info(f"SM: Active ROM patches for player {player}: {active_patches}")

            for patch_name, patch_id in patch_mapping.items():
                # Check if this patch ID is in the active patches list
                rom_patches[patch_name] = patch_id in active_patches

            settings['romPatches'] = rom_patches
            logger.info(f"SM: Exported ROM patches: {rom_patches}")
        except Exception as e:
            logger.error(f"SM: Failed to export ROM patches: {e}", exc_info=True)
            settings['romPatches'] = {}

        # Add knows settings from VARIA preset (these determine which techniques are available)
        knows_settings = {}
        try:
            from worlds.sm.variaRandomizer.utils.parameters import Knows, isKnows

            # Get knows settings for this player from VARIA's Knows dictionary
            if player in Knows.knowsDict:
                player_knows = Knows.knowsDict[player]
                for knows_name in Knows.__dict__:
                    if isKnows(knows_name):
                        knows_smb = getattr(player_knows, knows_name, None)
                        if knows_smb is not None:
                            # Export as [enabled, difficulty] matching VARIA's format
                            knows_settings[knows_name] = [knows_smb.bool, knows_smb.difficulty]

                logger.info(f"SM: Exported {len(knows_settings)} knows settings for player {player}")
            else:
                logger.warning(f"SM: No knows settings found for player {player} in Knows.knowsDict")
        except Exception as e:
            logger.error(f"SM: Failed to export knows settings: {e}", exc_info=True)

        settings['knows'] = knows_settings

        # Add hellRuns settings from VARIA preset (energy requirements for heated areas)
        hell_runs = {}
        try:
            from worlds.sm.variaRandomizer.utils.parameters import Settings as SMSettings

            # Get hellRuns settings for this player
            if player in SMSettings.SettingsDict:
                player_settings = SMSettings.SettingsDict[player]
                if hasattr(player_settings, 'hellRuns') and player_settings.hellRuns:
                    # hellRuns is a dict like {'Ice': [(tanks, difficulty), ...], 'MainUpperNorfair': [...]}
                    for run_name, thresholds in player_settings.hellRuns.items():
                        if thresholds is not None:
                            # Convert SMBool tuples to plain lists [[tanks, difficulty], ...]
                            hell_runs[run_name] = [[t[0], t[1]] for t in thresholds]
                        else:
                            hell_runs[run_name] = None
                    logger.info(f"SM: Exported hellRuns settings for player {player}: {list(hell_runs.keys())}")
            else:
                logger.warning(f"SM: No settings found for player {player} in Settings.SettingsDict")
        except Exception as e:
            logger.error(f"SM: Failed to export hellRuns settings: {e}", exc_info=True)

        settings['hellRuns'] = hell_runs

        return settings
