"""Stardew Valley game-specific export handler.

Stardew Valley uses a custom StardewRule class system instead of lambda functions
for access rules. This requires custom serialization logic in override_rule_analysis()
rather than declarative tools like STATE_METHOD_REPLACEMENTS.

Key StardewRule types handled:
- Received/TotalReceived: Item requirements → item_check
- Reach: Region/location accessibility → region_check/location_check
- And/Or/Count: Logical combinations → and/or/weighted_count_true
- Has: Lazy evaluation wrapper → helper or inlined rule (with caching)
- True_/False_: Literal values → constants
- HasProgressionPercent: Progress tracking → item_check with virtual item
"""

from typing import Dict, Any, Optional, Set
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class StardewValleyGameExportHandler(GenericGameExportHandler):
    """Export handler for Stardew Valley.

    Serializes StardewRule objects to JSON format via override_rule_analysis().
    Has rules are cached and exported as helpers when they exceed HAS_RULE_HELPER_THRESHOLD
    nodes to reduce rules.json file size.
    """

    # Use resolved_items from sphere log. SDV's collect() computes virtual event
    # items (Received Progressive Weapon, Received Progression Item/Percent) that
    # depend on per-item events_to_collect data not available in the frontend.
    # The JS game logic hooks are skipped when adding resolved items to avoid
    # double-counting (see SKIP_HOOKS_FOR_RESOLVED_ITEMS below).
    USE_RESOLVED_ITEMS = True

    # Threshold for preserving Has rules as helpers (in rule nodes)
    # Has rules with more than this many nodes will be preserved as helper calls
    # Set to 0 to disable (inline everything), or a positive number to enable
    HAS_RULE_HELPER_THRESHOLD = 1

    def __init__(self):
        super().__init__()
        # Cache for Has rule serializations: item_name -> serialized rule
        self._has_rule_cache: Dict[str, Dict[str, Any]] = {}
        # Set of Has rule item names that should be exported as helpers
        self._has_rules_to_export: Set[str] = set()

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
            },
            'Received Progressive Weapon': {
                'name': 'Received Progressive Weapon',
                'id': None,  # Event items have no ID
                'groups': ['Event'],
                'advancement': True,
                'useful': False,
                'trap': False,
                'event': True,
                'type': 'Event',
                'max_count': 5  # Tracks best weapon tier (1-5)
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
        game_info = super().get_game_info(world)
        # Stardew Valley always sets total_progression_items during create_items()
        game_info['total_progression_items'] = world.total_progression_items
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
                item_name = rule_obj.item

                # Check if we've already cached this Has rule
                if item_name in self._has_rule_cache:
                    # If it's marked for export as helper, return a helper reference
                    if item_name in self._has_rules_to_export:
                        return {
                            'type': 'helper',
                            'name': f'has_{self.sanitize_helper_name(item_name)}'
                        }
                    # Otherwise return the cached serialized rule
                    return self._has_rule_cache[item_name]

                # Try to serialize the underlying rule
                if hasattr(rule_obj, 'other_rules') and item_name in rule_obj.other_rules:
                    underlying_rule = rule_obj.other_rules[item_name]
                    logger.debug(f"Has rule for '{item_name}', recursing into underlying rule: {type(underlying_rule).__name__}")
                    serialized = self._serialize_stardew_rule(underlying_rule)

                    if serialized:
                        # Check if this rule is large enough to preserve as a helper
                        node_count = self.count_rule_nodes(serialized)

                        if self.HAS_RULE_HELPER_THRESHOLD > 0 and node_count > self.HAS_RULE_HELPER_THRESHOLD:
                            # Large rule - cache it and mark for export as helper
                            self._has_rule_cache[item_name] = serialized
                            self._has_rules_to_export.add(item_name)
                            logger.debug(f"Has rule '{item_name}' has {node_count} nodes, preserving as helper")
                            return {
                                'type': 'helper',
                                'name': f'has_{self.sanitize_helper_name(item_name)}'
                            }
                        else:
                            # Small rule - cache and inline it
                            self._has_rule_cache[item_name] = serialized
                            return serialized

                    return serialized
                else:
                    # If we can't get the underlying rule, just return an item check
                    # This assumes Has checks for item receipt
                    logger.debug(f"Has rule for '{item_name}' without underlying rule, treating as item_check")
                    result = {
                        'type': 'item_check',
                        'item': item_name
                    }
                    self._has_rule_cache[item_name] = result
                    return result

            # Handle Count rule (requires N of M conditions to be true)
            elif rule_type == 'Count':
                # Count uses a Counter to track duplicate rules
                # rule_obj.counter maps original rule objects to their multiplicity
                # We use weighted_count_true for compact representation

                weighted_conditions = []
                total_weight = 0

                if hasattr(rule_obj, 'counter') and hasattr(rule_obj, 'rules'):
                    # IMPORTANT: Iterate counter.items() instead of rule_obj.rules.
                    # Count.evaluate_without_shortcircuit() mutates self.rules in-place,
                    # replacing Has("X") wrappers with their underlying simplified rules
                    # (e.g., an Or of And conditions). The counter's keys are never mutated,
                    # so they always contain the original Has objects, ensuring the exporter
                    # consistently follows the Has->helper serialization path.
                    for sub_rule, multiplicity in rule_obj.counter.items():
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            weighted_conditions.append([serialized, multiplicity])
                            total_weight += multiplicity
                elif hasattr(rule_obj, 'rules'):
                    # Fallback: just use rules directly with weight 1
                    for sub_rule in rule_obj.rules:
                        serialized = self._serialize_stardew_rule(sub_rule)
                        if serialized:
                            weighted_conditions.append([serialized, 1])
                            total_weight += 1

                count_required = rule_obj.count if hasattr(rule_obj, 'count') else total_weight

                if count_required == total_weight:
                    # All conditions required = AND (unwrap weights)
                    conditions = []
                    for cond, weight in weighted_conditions:
                        for _ in range(weight):
                            conditions.append(cond)
                    return {
                        'type': 'and',
                        'conditions': conditions
                    }
                elif count_required == 1:
                    # At least 1 required = OR (unwrap weights, dedupe)
                    conditions = [cond for cond, _ in weighted_conditions]
                    return {
                        'type': 'or',
                        'conditions': conditions
                    }
                else:
                    # N of M - use weighted_count_true for compact representation
                    # Frontend evaluates: sum of weights for satisfied conditions >= count
                    return {
                        'type': 'weighted_count_true',
                        'count': count_required,
                        'weighted_conditions': weighted_conditions
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

    def clear_discovered_helpers(self) -> None:
        """Clear all caches between player exports."""
        super().clear_discovered_helpers()
        self._has_rule_cache = {}
        self._has_rules_to_export = set()

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """Export Has rules as helper definitions along with any base helpers.

        This exports large Has rules that were preserved as helper references
        during rule serialization. Each helper is named 'has_<sanitized_item_name>'
        and contains the serialized rule for acquiring that item.

        Args:
            world: The world object for this player

        Returns:
            A dictionary mapping helper names to their rule definitions
        """
        # Get any base helper definitions first
        helpers = super().get_helper_definitions(world)

        # Add Has rule helpers - sorted for deterministic output
        for item_name in sorted(self._has_rules_to_export):
            helper_name = f'has_{self.sanitize_helper_name(item_name)}'
            if item_name in self._has_rule_cache:
                helpers[helper_name] = self._has_rule_cache[item_name]
                logger.debug(f"Exported Has rule helper '{helper_name}' for item '{item_name}'")

        if self._has_rules_to_export:
            logger.info(f"Exported {len(self._has_rules_to_export)} Has rule helpers for Stardew Valley")

        return helpers
