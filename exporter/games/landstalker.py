"""Landstalker - The Treasures of King Nole game-specific export handler."""

from typing import Dict, Any, List, Optional
from .generic import GenericGameExportHandler
import logging
import inspect

logger = logging.getLogger(__name__)

class LandstalkerGameExportHandler(GenericGameExportHandler):
    """Export handler for Landstalker - The Treasures of King Nole.

    This handler extends GenericGameExportHandler to provide custom handling
    for Landstalker-specific rule patterns, particularly:
    - Complex nested has_all(set(...)) patterns from path requirements
    - Shop item rules with duplicate checking
    - Region visit tracking
    """

    GAME_NAME = 'Landstalker - The Treasures of King Nole'

    def __init__(self):
        super().__init__()
        logger.info(f"Initialized {self.__class__.__name__} for {self.GAME_NAME}")
        # Stack to track required_regions for nested rule processing
        self._regions_stack = []

    # Don't preserve _landstalker_has_visited_regions as a helper - let it be inlined
    # so that the required_regions parameter gets resolved to actual values

    def prepare_closure_vars(self, rule_func, closure_vars: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare closure variables before rule analysis.

        For Landstalker, this converts Region objects in required_regions to their codes
        so they can be properly serialized during analysis, and stores them for expansion.
        """
        if not callable(rule_func):
            return closure_vars

        # Log closure variable names for debugging
        logger.debug(f"prepare_closure_vars called, closure vars: {list(closure_vars.keys())}")

        # Make a copy to avoid modifying the original
        enhanced_closure = closure_vars.copy()

        # Check if 'required_regions' exists in closure_vars and contains Region objects
        if 'required_regions' in enhanced_closure:
            required_regions = enhanced_closure['required_regions']

            # If it's a list, process it (could be empty or contain Region objects)
            if isinstance(required_regions, list):
                if len(required_regions) == 0:
                    # Empty list - no regions required
                    logger.debug(f"Found empty required_regions list")
                    # Store empty list in stack for use during expansion phase
                    self._regions_stack.append([])
                elif hasattr(required_regions[0], 'code'):
                    # Convert Region objects to their codes
                    region_codes = [r.code for r in required_regions]
                    logger.debug(f"Converting required_regions from Region objects to codes: {region_codes}")
                    enhanced_closure['required_regions'] = region_codes

                    # Store in stack for use during expansion phase
                    self._regions_stack.append(region_codes)

        return enhanced_closure

    def _extract_required_regions(self, rule_func) -> Optional[List]:
        """Extract required_regions list from a path requirement lambda's closure."""
        if not hasattr(rule_func, '__closure__') or not rule_func.__closure__:
            return None

        if not hasattr(rule_func, '__code__'):
            return None

        freevars = rule_func.__code__.co_freevars

        for i, var_name in enumerate(freevars):
            if i >= len(rule_func.__closure__):
                break

            if var_name == 'required_regions':
                try:
                    cell_contents = rule_func.__closure__[i].cell_contents
                    if isinstance(cell_contents, list):
                        # Verify these are region objects with .code attribute
                        if all(hasattr(r, 'code') for r in cell_contents):
                            return cell_contents
                except (ValueError, AttributeError) as e:
                    logger.debug(f"Could not extract required_regions: {e}")

        return None

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Landstalker-specific handling.

        This method handles the complex pattern from make_path_requirement_lambda:
        state.has_all(set(required_items), player) and _landstalker_has_visited_regions(...)

        Which exports as:
        {
          "type": "state_method",
          "method": "has_all",
          "args": [{"type": "helper", "name": "set", "args": [...]}]
        }
        """
        if not rule or not isinstance(rule, dict):
            return rule

        # First, recursively expand nested structures
        if 'conditions' in rule and isinstance(rule['conditions'], list):
            rule = rule.copy()  # Make a copy to avoid modifying the original
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]

        # Handle state_method: has_all with helper: set pattern
        # This comes from: state.has_all(set(required_items), player)
        if rule.get('type') == 'state_method' and rule.get('method') == 'has_all':
            return self._simplify_has_all(rule)

        # Handle all_of pattern with unresolved iterator
        # This comes from: all(state.has("event_visited_" + region.code, player) for region in regions)
        if rule.get('type') == 'all_of':
            return self._resolve_all_of_iterator(rule)

        # Handle item_check with binary_op pattern for event_visited_ + region.code
        # This comes from inlined _landstalker_has_visited_regions
        if rule.get('type') == 'item_check':
            item = rule.get('item', {})
            if isinstance(item, dict) and item.get('type') == 'binary_op':
                simplified_item = self._simplify_region_event_binary_op(item)
                if simplified_item is not None:
                    return {"type": "item_check", "item": simplified_item}

        # Let parent handle standard cases
        return super().expand_rule(rule)

    def _resolve_all_of_iterator(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Resolve unresolved iterator in all_of rules.

        Detects the pattern:
        {
          "type": "all_of",
          "element_rule": {"type": "item_check", "item": {"type": "binary_op", ...}},
          "iterator_info": {
            "iterator": {"type": "name", "name": "regions"}  <-- unresolved
          }
        }

        And converts it to a concrete list of item checks.
        """
        iterator_info = rule.get('iterator_info', {})
        iterator = iterator_info.get('iterator', {})

        logger.debug(f"_resolve_all_of_iterator called, iterator type: {iterator.get('type')}, stack size: {len(self._regions_stack)}")

        # Check if iterator is an unresolved name reference
        if isinstance(iterator, dict) and iterator.get('type') == 'name':
            iter_name = iterator.get('name')

            # Check if this is the 'regions' variable we need to resolve
            if iter_name == 'regions' and self._regions_stack:
                # Pop the most recent regions list from our stack
                region_codes = self._regions_stack.pop() if self._regions_stack else None

                if region_codes is not None:
                    logger.debug(f"Resolving all_of iterator 'regions' to: {region_codes}")

                    # Build individual conditions for each region
                    # The element_rule is: state.has("event_visited_" + region.code, player)
                    # Which exports as: {"type": "item_check", "item": {"type": "binary_op", ...}}
                    element_rule = rule.get('element_rule', {})

                    # Create a condition for each region by substituting region.code
                    conditions = []
                    for region_code in region_codes:
                        # Build the item name: "event_visited_" + region_code
                        event_name = f"event_visited_{region_code}"
                        condition = {
                            "type": "item_check",
                            "item": event_name
                        }
                        conditions.append(condition)

                    # Convert to AND of all conditions
                    if len(conditions) == 0:
                        # Empty list, always true
                        return {"type": "constant", "value": True}
                    elif len(conditions) == 1:
                        # Single condition
                        return conditions[0]
                    else:
                        # Multiple conditions, AND them
                        return {
                            "type": "and",
                            "conditions": conditions
                        }

        # Couldn't resolve, return as-is
        return rule

    def _simplify_region_event_binary_op(self, binary_op: Dict[str, Any]) -> Optional[str]:
        """Simplify binary_op pattern for region event names.

        Detects the pattern:
        {
          "type": "binary_op",
          "left": {"type": "constant", "value": "event_visited_"},
          "op": "+",
          "right": {
            "type": "attribute",
            "object": {"type": "constant", "value": "region_code"},
            "attr": "code"
          }
        }

        And returns: "event_visited_region_code"
        """
        logger.debug(f"_simplify_region_event_binary_op called, op: {binary_op.get('op')}")

        if binary_op.get('op') != '+':
            return None

        left = binary_op.get('left', {})
        right = binary_op.get('right', {})

        # Check if left is the constant "event_visited_"
        if left.get('type') == 'constant' and left.get('value') == 'event_visited_':
            # Check if right is trying to access .code attribute
            if right.get('type') == 'attribute' and right.get('attr') == 'code':
                obj = right.get('object', {})
                # The object should be a constant (could be Region object or string)
                if obj.get('type') == 'constant':
                    region_value = obj.get('value')

                    # Check if it's a Region object
                    if hasattr(region_value, 'code'):
                        # It's a LandstalkerRegion object, extract the code
                        region_code = region_value.code
                        logger.debug(f"Simplified region event binary_op: Region({region_value.name}) -> event_visited_{region_code}")
                        return f"event_visited_{region_code}"
                    elif isinstance(region_value, str):
                        # It's already a string (region name or code)
                        # Convert region name to code format
                        region_code = region_value.lower().replace(' ', '_').replace('(', '').replace(')', '')
                        logger.debug(f"Simplified region event binary_op: '{region_value}' -> 'event_visited_{region_code}'")
                        return f"event_visited_{region_code}"

        logger.debug(f"Could not simplify binary_op: left={left}, right={right}")
        return None

    def _simplify_has_all(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Simplify state.has_all(set([items]), player) patterns.

        Converts:
          state.has_all(set(["Safety Pass"]), player)
        To:
          {"type": "item_check", "item": "Safety Pass"}

        Or for multiple items:
          state.has_all(set(["Item1", "Item2"]), player)
        To:
          {"type": "and", "conditions": [
            {"type": "item_check", "item": "Item1"},
            {"type": "item_check", "item": "Item2"}
          ]}
        """
        args = rule.get('args', [])

        # Look for the pattern: args[0] is {"type": "helper", "name": "set", ...}
        if not args or len(args) == 0:
            logger.warning("has_all with no args, keeping as-is")
            return rule

        first_arg = args[0]

        # Check if first arg is a set() helper call
        if isinstance(first_arg, dict) and first_arg.get('type') == 'helper' and first_arg.get('name') == 'set':
            # Extract the items from set(items)
            set_args = first_arg.get('args', [])
            if set_args and len(set_args) > 0:
                items_arg = set_args[0]

                # Extract the actual list of item names
                items = self._extract_items_from_constant(items_arg)

                if items is not None:
                    # Convert to item checks
                    if len(items) == 0:
                        # Empty set, always true
                        return {"type": "constant", "value": True}
                    elif len(items) == 1:
                        # Single item, simple item_check
                        return {"type": "item_check", "item": items[0]}
                    else:
                        # Multiple items, AND them together
                        return {
                            "type": "and",
                            "conditions": [
                                {"type": "item_check", "item": item}
                                for item in items
                            ]
                        }

        # Couldn't simplify, log and return original
        logger.warning(f"Could not simplify has_all pattern: {rule}")
        return rule

    def _extract_items_from_constant(self, arg: Any) -> Optional[List[str]]:
        """Extract list of item names from a constant value argument.

        Handles patterns like:
          {"type": "constant", "value": ["Safety Pass"]}
          {"type": "constant", "value": ["Item1", "Item2"]}
          {"type": "constant", "value": []}  (empty list)
        """
        if isinstance(arg, dict) and arg.get('type') == 'constant':
            value = arg.get('value')
            if isinstance(value, list):
                # Filter to only string items (item names)
                # Return empty list for empty value, not None
                return [item for item in value if isinstance(item, str)]

        return None

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts Landstalker-specific game settings for export."""
        settings_dict = super().get_settings_data(world, multiworld, player)
        settings_dict['use_resolved_items'] = True
        return settings_dict
