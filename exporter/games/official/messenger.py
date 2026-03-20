"""The Messenger game-specific export handler.

Handles Messenger-specific helper patterns and accumulator-based Time Shard tracking.
"""

import logging
from typing import Any, Dict, List, Optional
from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


# Helper to create item_check rules more concisely
def _item(name: str) -> Dict[str, Any]:
    return {'type': 'item_check', 'item': {'type': 'constant', 'value': name}}


class MessengerGameExportHandler(GenericGameExportHandler):
    """Export handler for The Messenger.

    Handles:
    - Time Shard accumulator (Pattern 4: parenthesized numbers like "Time Shard (100)")
    - Helper expansions for has_*, is_*, and can_* patterns
    - Shop location cost-based access rules
    """

    # Time Shard variants for the additive Shards accumulator
    TIME_SHARD_VALUES = {
        "Time Shard": 1,
        "Time Shard (10)": 10,
        "Time Shard (50)": 50,
        "Time Shard (100)": 100,
        "Time Shard (300)": 300,
        "Time Shard (500)": 500,
    }

    # Helper expansion mappings - maps helper names to their rule structures
    # These override the generic pattern matching because item names don't match helper names
    HELPER_EXPANSIONS = {
        # has_* patterns: helper name -> item name (where they differ)
        'has_wingsuit': _item('Wingsuit'),
        'has_dart': _item('Rope Dart'),  # Not just "Dart"
        'has_tabi': _item('Lightfoot Tabi'),  # Not just "Tabi"
        'has_vertical': {'type': 'or', 'conditions': [_item('Wingsuit'), _item('Rope Dart')]},
        'has_windmill': _item('Windmill Shuriken'),  # Hard mode helper
        # is_* patterns
        'is_aerobatic': {'type': 'and', 'conditions': [_item('Wingsuit'), _item('Aerobatics Warrior')]},
        # can_* patterns (simple ones, can_shop is computed separately)
        # Note: can_destroy_projectiles in hard mode includes Windmill Shuriken, but we export
        # based on the actual rules applied at generation time (which include the hard mode override)
        'can_destroy_projectiles': _item('Strike of the Ninja'),
        'can_dboost': {'type': 'and', 'conditions': [
            {'type': 'or', 'conditions': [_item('Path of Resilience'), _item('Meditation')]},
            _item('Second Wind')
        ]},
        'can_double_dboost': {'type': 'and', 'conditions': [
            _item('Path of Resilience'),
            _item('Meditation'),
            _item('Second Wind')
        ]},
        # Hard mode specific helpers
        'can_leash': {'type': 'and', 'conditions': [
            _item('Rope Dart'),
            {'type': 'and', 'conditions': [
                {'type': 'or', 'conditions': [_item('Path of Resilience'), _item('Meditation')]},
                _item('Second Wind')
            ]}
        ]},
    }

    # Preserve these helpers to skip generic pattern inference - they're expanded via expand_helper
    HELPERS_TO_PRESERVE = set(HELPER_EXPANSIONS.keys()) | {'can_shop'}

    def _get_maximum_price(self) -> int:
        """Calculate maximum shop price for can_shop capability."""
        if not self.world:
            return 0
        demons_bane = self.world.multiworld.get_location("The Shop - Demon's Bane", self.world.player)
        focused_power = self.world.multiworld.get_location("The Shop - Focused Power Sense", self.world.player)
        return min(demons_bane.cost + focused_power.cost, self.world.total_shards)

    def _is_hard_logic(self) -> bool:
        """Check if the world is using hard logic mode."""
        if not self.world:
            return False
        try:
            return self.world.options.logic_level.value >= 1
        except AttributeError:
            return False

    def expand_helper(self, helper_name: str, args=None) -> Optional[Dict[str, Any]]:
        """Expand Messenger-specific helper patterns to rule structures.

        Helper definitions vary based on logic level:
        - Normal mode: Standard helper definitions
        - Hard mode: Extended definitions (e.g., can_destroy_projectiles includes Windmill Shuriken)
        """
        is_hard = self._is_hard_logic()

        # Hard mode overrides for specific helpers
        if is_hard:
            if helper_name == 'can_destroy_projectiles':
                # Hard mode: Strike of the Ninja OR Windmill Shuriken
                return {'type': 'or', 'conditions': [
                    _item('Strike of the Ninja'),
                    _item('Windmill Shuriken')
                ]}
            if helper_name == 'can_dboost':
                # Hard mode: just Second Wind (no Meditation/Resilience required)
                return _item('Second Wind')
            if helper_name == 'can_leash':
                # Hard mode: can_leash = has_dart AND can_dboost (hard mode)
                # = has('Rope Dart') AND has('Second Wind')
                return {'type': 'and', 'conditions': [
                    _item('Rope Dart'),
                    _item('Second Wind')
                ]}

        # Check declarative mappings
        if helper_name in self.HELPER_EXPANSIONS:
            return self.HELPER_EXPANSIONS[helper_name]

        # can_shop requires runtime calculation of maximum shop cost
        if helper_name == 'can_shop' and self.world:
            return {
                'type': 'item_check',
                'item': {'type': 'constant', 'value': 'Shards'},
                'count': {'type': 'constant', 'value': self._get_maximum_price()}
            }

        # Fall back to base class
        return super().expand_helper(helper_name, args)

    def get_world_data(self, world, multiworld, player):
        """Extract Messenger-specific world data."""
        world_data = super().get_world_data(world, multiworld, player)

        # Enable Pattern 4 accumulator for Time Shard items
        world_data['use_paren_number_accumulator'] = True

        # Export maximum_price for can_shop helper
        try:
            world_data['maximum_price'] = self._get_maximum_price()
        except Exception:
            pass

        return world_data

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Export Time Shards -> Shards accumulator mapping."""
        return {
            "Shards": {
                "type": "additive",
                "items": self.TIME_SHARD_VALUES.copy(),
                "base_item": "Shards"
            }
        }

    def get_custom_location_access_rule(self, location, world):
        """Provide custom access rule for shop locations."""
        if hasattr(location, 'cost'):
            total_shards = getattr(world, 'total_shards', 0)
            return {
                'type': 'item_check',
                'item': {'type': 'constant', 'value': 'Shards'},
                'count': {'type': 'constant', 'value': min(location.cost, total_shards)}
            }
        return None

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process export data to resolve spoiler_portal_mapping references.

        The Messenger's hard logic mode includes rules that check whether specific
        checkpoints appear in spoiler_portal_mapping.values(). These runtime checks
        reference 'self.world.spoiler_portal_mapping' which doesn't exist in the
        generated worldgen code.

        We resolve these checks at export time by:
        1. Getting the actual portal mapping values from the world
        2. Evaluating the 'in' check with the constant value
        3. Replacing the Compare node with the boolean result
        """
        # Get portal mapping values from the world if available
        portal_mapping_values = set()
        if self.world and hasattr(self.world, 'spoiler_portal_mapping'):
            portal_mapping_values = set(self.world.spoiler_portal_mapping.values())
            logger.debug(f"Messenger: Portal mapping values: {portal_mapping_values}")

        # Process ONLY this player's regions to resolve portal mapping references
        # Previously this processed all players which corrupted other games' rules
        player_id = str(self.world.player) if self.world else None
        regions = data.get('regions', {})

        if player_id and player_id in regions:
            player_regions = regions[player_id]
            for region_name, region_data in player_regions.items():
                # Process exit rules
                if 'exits' in region_data:
                    for exit_data in region_data['exits']:
                        if 'access_rule' in exit_data:
                            exit_data['access_rule'] = self._resolve_portal_mapping_refs(
                                exit_data['access_rule'], portal_mapping_values
                            )
                # Process location rules
                if 'locations' in region_data:
                    for loc_data in region_data['locations']:
                        if 'access_rule' in loc_data:
                            loc_data['access_rule'] = self._resolve_portal_mapping_refs(
                                loc_data['access_rule'], portal_mapping_values
                            )

        return super().post_process_data(data)

    def _resolve_portal_mapping_refs(self, rule: Dict[str, Any], portal_mapping_values: set) -> Dict[str, Any]:
        """Recursively resolve spoiler_portal_mapping references in a rule.

        Looks for Compare rules with 'in' operator where the right side references
        self.world.spoiler_portal_mapping.values(), and evaluates them at export time.
        """
        if not isinstance(rule, dict):
            return rule

        # Check for Compare with 'in' operator
        if rule.get('rule') == 'Compare' or rule.get('type') == 'compare':
            args = rule.get('args', {})
            op = args.get('op') or rule.get('op')

            if op == 'in':
                left = args.get('left') or rule.get('left')
                right = args.get('right') or rule.get('right')

                # Check if right side is a function call to spoiler_portal_mapping.values()
                if self._is_portal_mapping_values_call(right):
                    # Get the left value (should be a constant string like a checkpoint name)
                    left_value = self._extract_constant_value(left)
                    if left_value is not None:
                        # Evaluate the 'in' check
                        result = left_value in portal_mapping_values
                        logger.debug(f"Messenger: Evaluated '{left_value}' in portal_mapping_values = {result}")
                        return {'rule': 'True_'} if result else {'rule': 'False_'}

        # Process nested Or/And rules
        if rule.get('rule') == 'Or' or rule.get('type') == 'or':
            children_key = 'children' if 'children' in rule else 'conditions'
            children = rule.get(children_key, [])
            processed_children = [self._resolve_portal_mapping_refs(c, portal_mapping_values) for c in children]

            # Simplify: if any child is True_, the Or is True_
            if any(c.get('rule') == 'True_' or (c.get('type') == 'constant' and c.get('value') == True)
                   for c in processed_children):
                return {'rule': 'True_'}

            # Filter out False_ children
            filtered = [c for c in processed_children
                       if not (c.get('rule') == 'False_' or (c.get('type') == 'constant' and c.get('value') == False))]

            if not filtered:
                return {'rule': 'False_'}
            if len(filtered) == 1:
                return filtered[0]

            return {**rule, children_key: filtered}

        if rule.get('rule') == 'And' or rule.get('type') == 'and':
            children_key = 'children' if 'children' in rule else 'conditions'
            children = rule.get(children_key, [])
            processed_children = [self._resolve_portal_mapping_refs(c, portal_mapping_values) for c in children]

            # Simplify: if any child is False_, the And is False_
            if any(c.get('rule') == 'False_' or (c.get('type') == 'constant' and c.get('value') == False)
                   for c in processed_children):
                return {'rule': 'False_'}

            # Filter out True_ children
            filtered = [c for c in processed_children
                       if not (c.get('rule') == 'True_' or (c.get('type') == 'constant' and c.get('value') == True))]

            if not filtered:
                return {'rule': 'True_'}
            if len(filtered) == 1:
                return filtered[0]

            return {**rule, children_key: filtered}

        # Recursively process other rule structures
        result = dict(rule)
        for key in ['children', 'conditions', 'condition', 'if_true', 'if_false', 'test']:
            if key in result:
                if isinstance(result[key], list):
                    result[key] = [self._resolve_portal_mapping_refs(c, portal_mapping_values)
                                   if isinstance(c, dict) else c for c in result[key]]
                elif isinstance(result[key], dict):
                    result[key] = self._resolve_portal_mapping_refs(result[key], portal_mapping_values)

        if 'args' in result and isinstance(result['args'], dict):
            for key, value in result['args'].items():
                if isinstance(value, dict):
                    result['args'][key] = self._resolve_portal_mapping_refs(value, portal_mapping_values)

        return result

    def _is_portal_mapping_values_call(self, node: Any) -> bool:
        """Check if a node is a call to self.world.spoiler_portal_mapping.values()."""
        if not isinstance(node, dict):
            return False

        # Check for AST_function_call pattern
        if node.get('rule') == 'AST_function_call' or node.get('type') == 'function_call':
            args = node.get('args', {})
            func = args.get('function') or node.get('function')

            if isinstance(func, dict):
                # Check for attribute pattern: something.values
                if func.get('type') == 'attribute' and func.get('attr') == 'values':
                    obj = func.get('object')
                    # Check for spoiler_portal_mapping
                    if isinstance(obj, dict) and obj.get('type') == 'attribute':
                        if obj.get('attr') == 'spoiler_portal_mapping':
                            # Check that the base is self.world
                            base = obj.get('object')
                            if isinstance(base, dict) and base.get('type') == 'attribute':
                                if base.get('attr') == 'world':
                                    inner = base.get('object')
                                    if isinstance(inner, dict) and inner.get('type') == 'name':
                                        if inner.get('name') == 'self':
                                            return True

        return False

    def _extract_constant_value(self, node: Any) -> Optional[str]:
        """Extract a constant string value from a node."""
        if isinstance(node, str):
            return node
        if isinstance(node, dict):
            if node.get('type') == 'constant':
                return node.get('value')
            # Sometimes the value is directly in the node
            if 'value' in node and isinstance(node['value'], str):
                return node['value']
        return None
