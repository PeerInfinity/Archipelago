"""Jak and Daxter: The Precursor Legacy game-specific export handler."""

from .generic import GenericGameExportHandler
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

class JakAndDaxterGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Jak and Daxter: The Precursor Legacy'

    def __init__(self, world=None):
        super().__init__()
        self.world = world
        self.item_id_to_name = {}
        # Build a mapping of item IDs to names
        # The item_table is a dict mapping item_id -> item_name
        from worlds.jakanddaxter.items import item_table
        self.item_id_to_name = dict(item_table)

    def recalculate_collection_state_if_needed(self, current_collection_state, player_id, world):
        """
        Recalculate "Reachable Orbs" based on accessible orb regions if needed.

        This is called during sphere logging to ensure the Reachable Orbs progressive
        item is up-to-date before state is logged.

        Args:
            current_collection_state: The CollectionState to update
            player_id: The player ID
            world: The JakAndDaxterWorld instance
        """
        # Check if "Reachable Orbs Fresh" is False, indicating recalculation is needed
        if not current_collection_state.prog_items[player_id].get("Reachable Orbs Fresh", False):
            from worlds.jakanddaxter.rules import recalculate_reachable_orbs
            recalculate_reachable_orbs(current_collection_state, player_id, world)

    def _unwrap_constant(self, value: Any) -> Any:
        """Unwrap constant wrappers to get the actual value."""
        if isinstance(value, dict) and value.get('type') == 'constant':
            return value.get('value')
        return value

    def _resolve_subscript(self, subscript_rule: Dict[str, Any]) -> Any:
        """Resolve a subscript operation, particularly for item_table lookups."""
        if not isinstance(subscript_rule, dict) or subscript_rule.get('type') != 'subscript':
            return subscript_rule

        value = subscript_rule.get('value', {})
        index = subscript_rule.get('index', {})

        # Check if this is an item_table lookup
        if isinstance(value, dict) and value.get('type') == 'name' and value.get('name') == 'item_table':
            # Extract the item ID from the index
            item_id = self._unwrap_constant(index)
            if isinstance(item_id, int) and item_id in self.item_id_to_name:
                # Return the item name
                return self.item_id_to_name[item_id]
            else:
                logger.warning(f"Could not resolve item_table subscript for ID: {item_id}")
                return f"Unknown Item {item_id}"

        return subscript_rule

    def _resolve_attribute(self, attr_rule: Dict[str, Any]) -> Any:
        """Resolve an attribute access, particularly for world attributes."""
        if not isinstance(attr_rule, dict) or attr_rule.get('type') != 'attribute':
            return attr_rule

        obj = attr_rule.get('object', {})
        attr = attr_rule.get('attr')

        # Check if this is a world attribute access
        if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'world':
            if attr == 'total_trade_orbs' and self.world:
                # Return the calculated total_trade_orbs value
                return self.world.total_trade_orbs
            elif attr == 'can_trade':
                # Return a marker that this is the can_trade function
                # We'll handle this in the function_call handler
                return {'_is_world_can_trade': True}

        return attr_rule

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand Jak and Daxter-specific rules, particularly capability rules."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Unwrap constant values and resolve subscripts in item_check rules
        if rule.get('type') == 'item_check':
            if 'item' in rule:
                # First resolve any subscripts
                rule['item'] = self._resolve_subscript(rule['item'])
                # Then unwrap constants
                rule['item'] = self._unwrap_constant(rule['item'])
            if 'count' in rule:
                rule['count'] = self._unwrap_constant(rule['count'])
            # Continue processing the rule after unwrapping

        # Handle function_call rules, especially world.can_trade
        if rule.get('type') == 'function_call':
            function = rule.get('function', {})
            args = rule.get('args', [])

            # Resolve the function to check if it's world.can_trade
            resolved_function = self._resolve_attribute(function)

            if isinstance(resolved_function, dict) and resolved_function.get('_is_world_can_trade'):
                # This is world.can_trade(required_orbs, required_previous_trade)
                # Resolve the arguments
                required_orbs = None
                required_previous_trade = None

                if len(args) >= 1:
                    # First argument is the required orbs amount
                    orb_arg = self._resolve_attribute(args[0])
                    required_orbs = self._unwrap_constant(orb_arg)

                if len(args) >= 2:
                    # Second argument is the optional previous trade location
                    required_previous_trade = self._unwrap_constant(args[1])

                # Determine which check to use based on orbsanity setting
                # Default is orbsanity off, which uses "Reachable Orbs"
                use_tradeable_orbs = False
                if self.world and hasattr(self.world, 'options'):
                    from worlds.jakanddaxter.options import EnableOrbsanity
                    if self.world.options.enable_orbsanity != EnableOrbsanity.option_off:
                        use_tradeable_orbs = True

                # Build the orb check rule
                if use_tradeable_orbs:
                    # Tradeable Orbs is a real item that can be checked
                    orb_check = {
                        'type': 'item_check',
                        'item': 'Tradeable Orbs',
                        'count': required_orbs if required_orbs is not None else 1
                    }
                else:
                    # Reachable Orbs requires a helper function
                    orb_check = {
                        'type': 'helper',
                        'name': 'can_reach_orbs',
                        'args': [required_orbs if required_orbs is not None else 1]
                    }

                # If there's a required previous trade, combine with AND
                if required_previous_trade is not None:
                    # Look up the location name from the location ID
                    from worlds.jakanddaxter.locations import location_table
                    from worlds.jakanddaxter.locs import cell_locations as cells
                    location_id = cells.to_ap_id(required_previous_trade)
                    if location_id in location_table:
                        location_name = location_table[location_id]
                        return {
                            'type': 'and',
                            'conditions': [
                                orb_check,
                                {
                                    'type': 'location_check',
                                    'location': location_name
                                }
                            ]
                        }

                return orb_check

        # Handle state_method calls that need to be converted
        if rule.get('type') == 'state_method':
            method = rule.get('method')
            args = rule.get('args', [])

            if method == 'has_any':
                # has_any(items, player) -> check if player has any of the items
                if len(args) >= 1:
                    items_arg = args[0]
                    items = self._unwrap_constant(items_arg)
                    if isinstance(items, list):
                        return {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }
                logger.warning(f"Could not expand state_method has_any with args: {args}")
            elif method == 'has_all':
                # has_all(items, player) -> check if player has all of the items
                if len(args) >= 1:
                    items_arg = args[0]
                    items = self._unwrap_constant(items_arg)
                    if isinstance(items, list):
                        return {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }
                logger.warning(f"Could not expand state_method has_all with args: {args}")

        # Handle capability rules by expanding them to item checks
        if rule.get('type') == 'capability':
            capability = rule.get('capability')
            if capability == 'fight':
                # can_fight checks for: Jump Dive, Jump Kick, Punch, or Kick
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Jump Dive'},
                        {'type': 'item_check', 'item': 'Jump Kick'},
                        {'type': 'item_check', 'item': 'Punch'},
                        {'type': 'item_check', 'item': 'Kick'}
                    ]
                }
            elif capability == 'free_scout_flies':
                # can_free_scout_flies checks for: Jump Dive OR (Crouch AND Crouch Uppercut)
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Jump Dive'},
                        {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Crouch'},
                                {'type': 'item_check', 'item': 'Crouch Uppercut'}
                            ]
                        }
                    ]
                }
            else:
                logger.warning(f"Unknown Jak and Daxter capability: {capability}")
                # Return a more descriptive rule for unknown capabilities
                return {
                    'type': 'unknown_capability',
                    'capability': capability,
                    'description': f"Unknown capability: {capability}"
                }

        # Handle helper functions
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            args = rule.get('args', [])

            if helper_name == 'can_fight':
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Jump Dive'},
                        {'type': 'item_check', 'item': 'Jump Kick'},
                        {'type': 'item_check', 'item': 'Punch'},
                        {'type': 'item_check', 'item': 'Kick'}
                    ]
                }
            elif helper_name == 'can_free_scout_flies':
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Jump Dive'},
                        {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Crouch'},
                                {'type': 'item_check', 'item': 'Crouch Uppercut'}
                            ]
                        }
                    ]
                }

        # Handle nested rules recursively
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule.get('conditions', [])
            ]

        if rule.get('type') == 'not':
            rule['condition'] = self.expand_rule(rule.get('condition'))

        if rule.get('type') == 'conditional':
            rule['test'] = self.expand_rule(rule.get('test'))
            rule['if_true'] = self.expand_rule(rule.get('if_true'))
            rule['if_false'] = self.expand_rule(rule.get('if_false'))

        return rule

    def get_region_attributes(self, region):
        """
        Extract Jak and Daxter-specific attributes from a region.
        Adds orb_count which is needed for the can_reach_orbs helper function.

        Args:
            region: The Archipelago region object

        Returns:
            dict: Additional attributes to include in region data
        """
        attributes = {}

        # Add orb_count if the region has it
        if hasattr(region, 'orb_count'):
            attributes['orb_count'] = region.orb_count

        return attributes
