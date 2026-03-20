"""Celeste 64 game export handler.

Handles Celeste 64-specific function calls by expanding them using the
world's pre-computed logic mappings.
"""

from typing import Any, Dict, List, Optional
from ..base import GenericGameExportHandler


class Celeste64GameExportHandler(GenericGameExportHandler):
    """Celeste 64 exporter that inlines rules from the world's logic mappings.

    The world sets active_logic_mapping and active_region_logic_mapping during
    set_rules() based on the logic_difficulty option. This exporter uses those
    mappings directly to expand location_rule and region_connection_rule calls.
    """

    def handle_special_function_call(self, func_name: str, processed_args: list) -> Optional[Dict[str, Any]]:
        """Expand Celeste 64 function calls to rule structures.

        Handles:
        - location_rule(state, world, loc) -> rule based on active_logic_mapping
        - region_connection_rule(state, world, connection) -> rule based on active_region_logic_mapping
        - goal_rule(state, world) -> and(count_check, can_reach)
        """
        if not self.world:
            return None

        if func_name == 'location_rule':
            location = self._get_arg_value(processed_args, 0)
            if location:
                logic_mapping = getattr(self.world, 'active_logic_mapping', {})
                if location not in logic_mapping:
                    return {'type': 'constant', 'value': True}
                return self._build_or_of_ands(logic_mapping[location])

        elif func_name == 'region_connection_rule':
            connection = self._get_arg_value(processed_args, 0)
            if connection and len(connection) >= 2:
                key = (connection[0], connection[1])
                region_logic = getattr(self.world, 'active_region_logic_mapping', {})
                if key not in region_logic:
                    return {'type': 'constant', 'value': True}
                return self._build_or_of_ands(region_logic[key])

        elif func_name == 'goal_rule':
            strawberries = getattr(self.world, 'strawberries_required', 0)
            conditions = []
            if strawberries > 0:
                conditions.append({
                    'type': 'count_check',
                    'item': 'Strawberry',
                    'count': strawberries
                })
            conditions.append({
                'type': 'can_reach',
                'region': 'Badeline Island',
                'resolution': 'Region'
            })
            return conditions[0] if len(conditions) == 1 else {'type': 'and', 'conditions': conditions}

        return None

    @staticmethod
    def _get_arg_value(args: list, index: int) -> Any:
        """Extract value from a processed argument at the given index."""
        if not args or index >= len(args):
            return None
        arg = args[index]
        if isinstance(arg, dict):
            if arg.get('type') == 'constant':
                return arg.get('value')
            if arg.get('type') == 'name':
                return arg.get('name')
        return arg

    @staticmethod
    def _build_or_of_ands(access_methods: List[List[str]]) -> Dict[str, Any]:
        """Build an OR of ANDs rule structure from access methods.

        Each access method is a list of required items (AND).
        Multiple access methods are combined with OR.
        Handles "CANNOT ACCESS" special case.
        """
        if not access_methods:
            return {'type': 'constant', 'value': True}

        conditions = []
        for items in access_methods:
            # "CANNOT ACCESS" means the path is blocked
            if items == ['CANNOT ACCESS']:
                return {'type': 'constant', 'value': False}

            if len(items) == 1:
                conditions.append({'type': 'item_check', 'item': items[0]})
            else:
                conditions.append({
                    'type': 'and',
                    'conditions': [{'type': 'item_check', 'item': item} for item in items]
                })

        return conditions[0] if len(conditions) == 1 else {'type': 'or', 'conditions': conditions}
