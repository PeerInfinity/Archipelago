"""Stardew Valley game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class StardewValleyGameExportHandler(GenericGameExportHandler):
    """Export handler for Stardew Valley.

    Stardew Valley uses a custom StardewRule system instead of lambda functions.
    This handler detects and serializes those rule objects to JSON format.
    """

    GAME_NAME = 'Stardew Valley'

    def __init__(self):
        super().__init__()
        # Add Stardew Valley-specific helper recognition patterns
        self.known_helpers = {
            # Skill-related helpers
            'can_earn_level',
            'can_earn_mastery',
            'has_level',

            # Tool-related helpers
            'has_tool',
            'can_reach_region',

            # Season/time-related helpers
            'has_season',

            # Item-related helpers
            'has_item',
            'has_relationship',

            # Quest-related helpers
            'can_complete_quest',

            # Bundle-related helpers
            'can_complete_bundle',
        }

    def get_item_data(self, world):
        """Override to add Stardew Valley's virtual event items.

        Stardew Valley uses virtual event items like "Received Progression Percent"
        and "Received Progression Item" that are automatically computed by the
        CollectionState. These need to be added to the items list so the frontend
        can track them properly.
        """
        # Get the base item data from the generic handler
        item_data = super().get_item_data(world)

        # Add virtual event items that are computed by CollectionState
        # but not present in the item table
        virtual_items = {
            'Received Progression Percent': {
                'name': 'Received Progression Percent',
                'id': None,  # Event items have no ID
                'groups': ['Event'],
                'advancement': True,
                'useful': False,
                'trap': False,
                'event': True,
                'type': 'Event',
                'max_count': 100  # Can receive up to 100%
            },
            'Received Progression Item': {
                'name': 'Received Progression Item',
                'id': None,  # Event items have no ID
                'groups': ['Event'],
                'advancement': True,
                'useful': False,
                'trap': False,
                'event': True,
                'type': 'Event',
                'max_count': 1000  # Arbitrary high limit
            }
        }

        # Add virtual items to the item data
        for item_name, item_info in virtual_items.items():
            if item_name not in item_data:
                item_data[item_name] = item_info
                logger.debug(f"Added virtual event item: {item_name}")

        return item_data

    def get_game_info(self, world) -> Dict[str, Any]:
        """Override to add Stardew Valley-specific game info.

        Adds total_progression_items count which is needed for computing
        "Received Progression Percent" in the frontend.
        """
        # Get base game info
        game_info = super().get_game_info(world)

        # Add total progression items count
        # This is used to calculate "Received Progression Percent"
        if hasattr(world, 'total_progression_items'):
            game_info['total_progression_items'] = world.total_progression_items
            logger.debug(f"Added total_progression_items: {world.total_progression_items}")
        else:
            # Fallback: count progression items in the itempool
            total_prog = 0
            for item in world.multiworld.itempool:
                if item.player == world.player and item.advancement:
                    total_prog += 1
            game_info['total_progression_items'] = total_prog
            logger.debug(f"Calculated total_progression_items from itempool: {total_prog}")

        return game_info

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to handle Stardew Valley's custom StardewRule objects.

        Stardew Valley uses a custom rule system with StardewRule objects instead of
        lambda functions. This method detects these objects and serializes them.

        Args:
            rule_func: The rule function or StardewRule object to analyze
            rule_target_name: Optional name of the rule target (location/entrance)

        Returns:
            Dictionary representation of the rule, or None if this isn't a StardewRule
        """
        # Check if this is a StardewRule object
        if not self._is_stardew_rule(rule_func):
            return None

        logger.debug(f"Detected StardewRule object: {type(rule_func).__name__}")

        # Serialize the StardewRule object
        serialized = self._serialize_stardew_rule(rule_func)

        if serialized:
            logger.debug(f"Successfully serialized StardewRule to: {serialized}")
            return serialized
        else:
            logger.error(f"Failed to serialize StardewRule: {rule_func}")
            return {
                'type': 'error',
                'message': f'Failed to serialize StardewRule of type {type(rule_func).__name__}',
                'subtype': 'stardew_serialization',
                'debug_log': [],
                'error_log': []
            }

    def _is_stardew_rule(self, obj: Any) -> bool:
        """Check if an object is a StardewRule instance.

        Args:
            obj: The object to check

        Returns:
            True if the object is a StardewRule, False otherwise
        """
        # Check if the object's module path contains stardew_rule
        obj_type = type(obj)
        module = getattr(obj_type, '__module__', '')
        return 'stardew_rule' in module

    def _serialize_stardew_rule(self, rule_obj: Any) -> Optional[Dict[str, Any]]:
        """Serialize a StardewRule object to JSON format.

        Args:
            rule_obj: The StardewRule object to serialize

        Returns:
            Dictionary representation of the rule, or None if serialization failed
        """
        try:
            rule_type = type(rule_obj).__name__
            logger.debug(f"Serializing StardewRule of type: {rule_type}")

            # Handle Received rule (most common)
            if rule_type == 'Received':
                # Check for count=0 first - "has at least 0 items" is always true
                if hasattr(rule_obj, 'count') and rule_obj.count == 0:
                    return {'type': 'constant', 'value': True}

                result = {
                    'type': 'item_check',
                    'item': rule_obj.item
                }
                if hasattr(rule_obj, 'count') and rule_obj.count > 1:
                    result['count'] = {'type': 'constant', 'value': rule_obj.count}
                return result

            # Handle Reach rule (region/location accessibility)
            elif rule_type == 'Reach':
                # Reach rules check if a region or location is accessible
                # Export as region_check or location_check based on resolution_hint
                logger.debug(f"Reach rule for: {rule_obj.spot} (resolution: {rule_obj.resolution_hint})")

                if rule_obj.resolution_hint == 'Region':
                    return {
                        'type': 'region_check',
                        'region': rule_obj.spot
                    }
                elif rule_obj.resolution_hint == 'Location':
                    return {
                        'type': 'location_check',
                        'location': rule_obj.spot
                    }
                else:
                    # Fallback for unknown resolution hints
                    logger.warning(f"Unknown resolution hint '{rule_obj.resolution_hint}' for Reach rule, spot: {rule_obj.spot}")
                    return {
                        'type': 'region_check',
                        'region': rule_obj.spot
                    }

            # Handle TotalReceived rule (count across multiple items)
            elif rule_type == 'TotalReceived':
                if len(rule_obj.items) == 1:
                    # Single item, convert to simple item_check
                    return {
                        'type': 'item_check',
                        'item': rule_obj.items[0],
                        'count': {'type': 'constant', 'value': rule_obj.count}
                    }
                else:
                    # Multiple items - need to check total count
                    # This is more complex and might need a helper
                    return {
                        'type': 'helper',
                        'name': 'total_received',
                        'args': [
                            {'type': 'constant', 'value': rule_obj.count},
                            {'type': 'constant', 'value': list(rule_obj.items)}
                        ]
                    }

            # Handle And rule (logical AND)
            elif rule_type == 'And':
                conditions = []
                # Get the original_rules from the And object
                if hasattr(rule_obj, 'original_rules'):
                    for sub_rule in rule_obj.original_rules:
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            conditions.append(serialized)

                if not conditions:
                    # Empty And means true
                    return {'type': 'constant', 'value': True}
                elif len(conditions) == 1:
                    # Single condition, unwrap
                    return conditions[0]
                else:
                    return {
                        'type': 'and',
                        'conditions': conditions
                    }

            # Handle Or rule (logical OR)
            elif rule_type == 'Or':
                conditions = []
                # Get the original_rules from the Or object
                if hasattr(rule_obj, 'original_rules'):
                    for sub_rule in rule_obj.original_rules:
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            conditions.append(serialized)

                if not conditions:
                    # Empty Or means false
                    return {'type': 'constant', 'value': False}
                elif len(conditions) == 1:
                    # Single condition, unwrap
                    return conditions[0]
                else:
                    return {
                        'type': 'or',
                        'conditions': conditions
                    }

            # Handle literal rules (true_/false_)
            elif rule_type in ['True_', 'False_']:
                is_true = rule_type == 'True_'
                return {
                    'type': 'constant',
                    'value': is_true
                }

            # Handle HasProgressionPercent (special Received subclass)
            elif rule_type == 'HasProgressionPercent':
                # This is a special event item check
                return {
                    'type': 'item_check',
                    'item': rule_obj.item,  # Should be 'Received Progression Percent'
                    'count': {'type': 'constant', 'value': rule_obj.count}
                }

            # Handle Has rule (wrapper that delegates to underlying item rule)
            elif rule_type == 'Has':
                # Has is a lazy evaluation wrapper
                # Try to recursively serialize the underlying rule
                item_name = rule_obj.item
                if hasattr(rule_obj, 'other_rules') and item_name in rule_obj.other_rules:
                    underlying_rule = rule_obj.other_rules[item_name]
                    logger.debug(f"Has rule for '{item_name}', recursing into underlying rule: {type(underlying_rule).__name__}")
                    return self._serialize_stardew_rule(underlying_rule)
                else:
                    # If we can't get the underlying rule, just return an item check
                    # This assumes Has checks for item receipt
                    logger.debug(f"Has rule for '{item_name}' without underlying rule, treating as item_check")
                    return {
                        'type': 'item_check',
                        'item': item_name
                    }

            # Handle Count rule (requires N of M conditions to be true)
            elif rule_type == 'Count':
                conditions = []

                # IMPORTANT: Count uses a Counter to track duplicate rules!
                # rule_obj.rules contains only UNIQUE rules
                # rule_obj.counter contains the multiplicity of each rule
                # We need to expand duplicates to preserve the correct count
                if hasattr(rule_obj, 'counter') and hasattr(rule_obj, 'rules'):
                    # Use counter to expand duplicate rules
                    for sub_rule in rule_obj.rules:
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            # Add this condition multiple times based on its count
                            multiplicity = rule_obj.counter.get(sub_rule, 1)
                            for _ in range(multiplicity):
                                conditions.append(serialized)
                elif hasattr(rule_obj, 'rules'):
                    # Fallback: just use rules directly (older code path)
                    for sub_rule in rule_obj.rules:
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            conditions.append(serialized)

                # Count rule is "at least N of these conditions must be true"
                count_required = rule_obj.count if hasattr(rule_obj, 'count') else len(conditions)

                if count_required == len(conditions):
                    # All conditions required = AND
                    return {
                        'type': 'and',
                        'conditions': conditions
                    }
                elif count_required == 1:
                    # At least 1 required = OR
                    return {
                        'type': 'or',
                        'conditions': conditions
                    }
                else:
                    # N of M - use count_true rule type
                    return {
                        'type': 'count_true',
                        'count': count_required,
                        'conditions': conditions
                    }

            # Unknown rule type - log and return a helper reference
            else:
                logger.warning(f"Unknown StardewRule type: {rule_type}, converting to helper")
                # Try to get a readable representation
                rule_repr = repr(rule_obj)
                return {
                    'type': 'helper',
                    'name': f'stardew_{rule_type.lower()}',
                    'args': [],
                    'description': rule_repr
                }

        except Exception as e:
            logger.error(f"Error serializing StardewRule {type(rule_obj).__name__}: {e}", exc_info=True)
            return None

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand Stardew Valley-specific rules."""
        if not rule:
            return rule

        # Check for Stardew Valley helper patterns
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')

            # Log helpers for debugging
            logger.debug(f"Processing Stardew Valley helper: {helper_name}")

            # Return the helper as-is for now (frontend will handle it)
            return rule

        # Use default generic expansion for other rule types
        return super().expand_rule(rule)
