"""Air Delivery game-specific export handler.

Air Delivery uses a unique rule pattern where rules are defined in a `json_world`
constant and converted to lambdas at runtime. This causes the standard AST analysis
to fail because it can't introspect the lambda closures.

This handler intercepts rule export and uses the original `json_world` data to
generate correct rules instead of relying on AST analysis of the lambdas.
"""

import logging
from typing import Dict, Any, Optional, Callable

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class AirDeliveryGameExportHandler(GenericGameExportHandler):
    """Air Delivery export handler.

    Overrides rule export to use the `json_world` constant from the apworld
    instead of trying to analyze the dynamically-created lambda closures.
    """

    GAME_NAME = 'Air Delivery'

    def __init__(self, world=None):
        """Initialize with access to json_world data."""
        super().__init__(world)
        self._json_world = None
        self._location_rules = None
        self._region_rules = None

        # Try to load json_world from the world's module
        if world is not None:
            self._load_json_world(world)

    def _load_json_world(self, world) -> None:
        """Load the json_world constant from the Air Delivery module."""
        try:
            # Get the world class's module
            world_class = type(world)
            module = world_class.__module__

            # Import the module to access json_world
            import importlib
            world_module = importlib.import_module(module)

            if hasattr(world_module, 'json_world'):
                self._json_world = world_module.json_world
                self._location_rules = self._json_world.get('location_map', {})
                self._region_rules = self._json_world.get('region_map', {})
                logger.info(f"Loaded json_world from {module}: "
                           f"{len(self._location_rules)} region location maps, "
                           f"{len(self._region_rules)} region connection maps")
            else:
                logger.warning(f"Module {module} does not have json_world constant")
        except Exception as e:
            logger.warning(f"Could not load json_world: {e}")

    def _convert_rule_to_dict(self, rule: Any) -> Optional[Dict[str, Any]]:
        """Convert Air Delivery's rule format to exporter format.

        Air Delivery rules are lists of lists:
        - None: No requirements (always accessible)
        - [["item1"]]: Requires item1
        - [["item1", "item2"]]: Requires item1 AND item2
        - [["item1"], ["item2"]]: Requires item1 OR item2
        - [["a", "b"], ["c"]]: Requires (a AND b) OR c
        """
        if rule is None:
            return None  # No rule means always accessible

        if not isinstance(rule, list) or not rule:
            return None

        # Build conditions for each OR branch
        or_conditions = []
        for route in rule:
            if not isinstance(route, list) or not route:
                continue

            if len(route) == 1:
                # Single item requirement
                or_conditions.append({
                    'type': 'item_check',
                    'item': route[0]
                })
            else:
                # Multiple items required (AND)
                and_conditions = [
                    {'type': 'item_check', 'item': item}
                    for item in route
                ]
                or_conditions.append({
                    'type': 'and',
                    'conditions': and_conditions
                })

        if not or_conditions:
            return None
        elif len(or_conditions) == 1:
            return or_conditions[0]
        else:
            return {
                'type': 'or',
                'conditions': or_conditions
            }

    def get_location_rule(self, location_name: str, region_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get the rule for a location from json_world.

        This is called during rule export to get the correct rule structure
        instead of analyzing the lambda function.
        """
        if self._location_rules is None:
            return None

        # Search for the location in all regions
        for region, locations in self._location_rules.items():
            if location_name in locations:
                rule_data = locations[location_name]
                return self._convert_rule_to_dict(rule_data)

        return None

    def get_entrance_rule(self, entrance_name: str) -> Optional[Dict[str, Any]]:
        """Get the rule for an entrance from json_world.

        Entrance names are typically "region1 -> region2".
        """
        if self._region_rules is None:
            return None

        # Parse entrance name
        if ' -> ' in entrance_name:
            parts = entrance_name.split(' -> ')
            if len(parts) == 2:
                source_region, target_region = parts
                if source_region in self._region_rules:
                    connections = self._region_rules[source_region]
                    if target_region in connections:
                        rule_data = connections[target_region]
                        return self._convert_rule_to_dict(rule_data)

        return None

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """Override location rule analysis to use json_world data.

        This is called by the exporter before standard AST analysis.
        If we have json_world data, use it directly instead of analyzing the lambda.
        """
        if self._location_rules is not None:
            location_name = location.name if hasattr(location, 'name') else str(location)
            rule = self.get_location_rule(location_name)
            if rule is not None:
                logger.debug(f"Using json_world rule for location '{location_name}': {rule}")
                return rule

        # Fall back to standard analysis
        return None

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """Override entrance rule analysis to use json_world data.

        This is called by the exporter before standard AST analysis.
        If we have json_world data, use it directly instead of analyzing the lambda.
        """
        if self._region_rules is not None:
            rule = self.get_entrance_rule(entrance_name)
            if rule is not None:
                logger.debug(f"Using json_world rule for entrance '{entrance_name}': {rule}")
                return rule

        # Fall back to standard analysis
        return None
