"""
Anodyne game export handler.

Handles the custom AccessRule class used by the Anodyne apworld.
The apworld uses a callable AccessRule class instead of lambdas,
which requires special handling to extract the rule requirements.
"""

import logging
from typing import Any, Callable, Dict, List, Optional, Set

from exporter.games.base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class AnodyneHandler(GenericGameExportHandler):
    """Export handler for Anodyne.

    Anodyne uses a custom AccessRule class that stores requirements as a list
    of strings in self.reqs. This handler extracts those requirements and
    converts them to Rule Builder format.

    The AccessRule.reqs list contains strings in these formats:
    - Simple item: "Broom"
    - Item count: "Card:10"
    - Group: "Brooms" (matches groups dict)
    - Proxy rule: references compound rules in world.proxy_rules
    """

    # Static item groups (hardcoded fallback from Constants.py)
    STATIC_ITEM_GROUPS = {
        "Brooms": ["Broom", "Wide Broom", "Long Broom", "Swap Broom", "Extend Broom"],
        "Bosses": [f"Defeat {c}" for c in ["Seer", "The Wall", "Rogue", "Watcher", "Servants", "Manager", "Sage", "Briar"]],
        "Combat": ["Broom", "Wide Broom", "Long Broom", "Swap Broom", "Extend Broom"],  # Same as Brooms
    }

    def __init__(self, world=None):
        """Initialize handler, optionally with world reference for proxy rules."""
        super().__init__(world)
        self._world = world
        self._proxy_rules: Dict[str, List[str]] = {}
        self._item_groups: Dict[str, List[str]] = dict(self.STATIC_ITEM_GROUPS)

        if world:
            # Get proxy rules
            if hasattr(world, 'proxy_rules'):
                self._proxy_rules = world.proxy_rules or {}
                logger.debug(f"Anodyne: Loaded {len(self._proxy_rules)} proxy rules from world")

            # Get dynamic item groups from world's item_name_groups
            if hasattr(world, 'item_name_groups') and world.item_name_groups:
                for group_name, items in world.item_name_groups.items():
                    if isinstance(items, (set, frozenset)):
                        self._item_groups[group_name] = list(items)
                    elif isinstance(items, list):
                        self._item_groups[group_name] = items
                logger.debug(f"Anodyne: Loaded {len(world.item_name_groups)} item groups from world")

    def _is_access_rule_object(self, rule) -> bool:
        """Check if the rule is an Anodyne AccessRule object."""
        if rule is None:
            return False
        # Check for the AccessRule pattern: callable with reqs attribute
        class_name = type(rule).__name__
        return (
            class_name == 'AccessRule' and
            hasattr(rule, 'reqs') and
            hasattr(rule, '__call__')
        )

    def _expand_requirement(self, req: str, visited: Optional[Set[str]] = None) -> List[str]:
        """Expand a requirement, resolving proxy rules recursively.

        Args:
            req: Requirement string (may be a proxy rule name)
            visited: Set of visited proxy rules (for cycle detection)

        Returns:
            List of expanded requirements
        """
        if visited is None:
            visited = set()

        # Check for cycle
        if req in visited:
            logger.warning(f"Anodyne: Cycle detected in proxy rule '{req}'")
            return [req]

        # Check if this is a proxy rule
        if req in self._proxy_rules:
            visited.add(req)
            proxy_reqs = self._proxy_rules[req]
            if not proxy_reqs:
                # Empty proxy rule means always accessible
                return []
            # Recursively expand
            expanded = []
            for sub_req in proxy_reqs:
                expanded.extend(self._expand_requirement(sub_req, visited.copy()))
            return expanded

        # Not a proxy rule, return as-is
        return [req]

    def _update_item_groups(self, world):
        """Update item groups from world if available."""
        if world and hasattr(world, 'item_name_groups') and world.item_name_groups:
            for group_name, items in world.item_name_groups.items():
                if group_name not in self._item_groups:
                    if isinstance(items, (set, frozenset)):
                        self._item_groups[group_name] = list(items)
                    elif isinstance(items, list):
                        self._item_groups[group_name] = items

    def _convert_requirement_to_rule(self, req: str, world=None) -> Dict[str, Any]:
        """Convert a single Anodyne requirement string to Rule Builder format.

        Args:
            req: Requirement string like "Broom", "Card:10", or "Brooms" (group)
            world: World reference for proxy rule expansion

        Returns:
            Rule dict in Rule Builder format
        """
        # Update proxy rules from world if provided
        if world and hasattr(world, 'proxy_rules') and not self._proxy_rules:
            self._proxy_rules = world.proxy_rules or {}

        # Update item groups from world
        self._update_item_groups(world)

        # Expand the requirement (resolve proxy rules)
        expanded = self._expand_requirement(req)

        if not expanded:
            # Empty expansion means always accessible
            return {'rule': 'True_'}

        # If expanded to multiple requirements, create AND of them
        if len(expanded) > 1:
            conditions = [self._convert_single_requirement(r, world) for r in expanded]
            return {'rule': 'And', 'children': conditions}

        # Single requirement
        return self._convert_single_requirement(expanded[0], world)

    def _convert_single_requirement(self, req: str, world=None) -> Dict[str, Any]:
        """Convert a single (non-proxy) requirement to Rule Builder format."""
        # Update item groups from world if available
        self._update_item_groups(world)

        # Check if it's a count requirement (format: "Item:count")
        if ':' in req:
            item, count_str = req.split(':', 1)
            try:
                count = int(count_str)
            except ValueError:
                # Not a valid count, treat as item name
                logger.warning(f"Anodyne: Invalid count format in requirement: {req}")
                return {'rule': 'Has', 'args': {'item_name': req}}

            # Check if the item part is a group
            if item in self._item_groups:
                # HasFromListUnique - need count unique items from group
                return {
                    'rule': 'HasFromListUnique',
                    'args': {
                        'items': self._item_groups[item],
                        'count': count
                    }
                }
            else:
                # Regular item count check
                return {
                    'rule': 'Has',
                    'args': {
                        'item_name': item,
                        'count': count
                    }
                }

        # Check if it's a group check
        if req in self._item_groups:
            # HasAny for group check
            return {
                'rule': 'HasAny',
                'args': {
                    'items': self._item_groups[req]
                }
            }

        # Simple item check
        return {'rule': 'Has', 'args': {'item_name': req}}

    def _convert_access_rule_to_dict(self, access_rule, world=None) -> Optional[Dict[str, Any]]:
        """Convert an AccessRule object to Rule Builder format.

        Args:
            access_rule: An Anodyne AccessRule object
            world: World reference for proxy rule expansion

        Returns:
            Rule dict or None if conversion failed
        """
        if not self._is_access_rule_object(access_rule):
            return None

        # Try to get proxy rules and item groups from AccessRule's world reference
        if hasattr(access_rule, 'world'):
            rule_world = access_rule.world
            if not self._proxy_rules and hasattr(rule_world, 'proxy_rules'):
                self._proxy_rules = rule_world.proxy_rules or {}
                logger.debug(f"Anodyne: Loaded {len(self._proxy_rules)} proxy rules from AccessRule world")
            self._update_item_groups(rule_world)

        # Also try from the world parameter
        if world:
            if hasattr(world, 'proxy_rules'):
                self._proxy_rules = world.proxy_rules or {}
            self._update_item_groups(world)

        reqs = access_rule.reqs

        if not reqs:
            # Empty requirements means always accessible
            return {'rule': 'True_'}

        # Convert each requirement (with proxy rule expansion)
        conditions = []
        for req in reqs:
            rule = self._convert_requirement_to_rule(req, world)
            conditions.append(rule)

        # All requirements must be met (AND)
        if len(conditions) == 1:
            return conditions[0]
        else:
            return {'rule': 'And', 'children': conditions}

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """Extract Anodyne location rules from AccessRule objects.

        This is called by the exporter before standard AST analysis.
        """
        access_rule = getattr(location, 'access_rule', None)

        if self._is_access_rule_object(access_rule):
            location_name = getattr(location, 'name', 'Unknown')
            rule = self._convert_access_rule_to_dict(access_rule, world)
            if rule:
                logger.debug(f"Anodyne: Converted location rule for '{location_name}': {rule}")
                return rule

        # Fall back to standard analysis
        return None

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """Extract Anodyne entrance rules from AccessRule objects."""
        if self._is_access_rule_object(rule):
            converted = self._convert_access_rule_to_dict(rule, self._world)
            if converted:
                logger.debug(f"Anodyne: Converted entrance rule for '{entrance_name}': {converted}")
                return converted

        # Fall back to standard analysis
        return None

    def handle_complex_exit_rule(self, exit_name: str, exit_rule: Any) -> Optional[Dict[str, Any]]:
        """Extract Anodyne exit rules from AccessRule objects."""
        if self._is_access_rule_object(exit_rule):
            converted = self._convert_access_rule_to_dict(exit_rule, self._world)
            if converted:
                logger.debug(f"Anodyne: Converted exit rule for '{exit_name}': {converted}")
                return converted

        # Fall back to standard analysis
        return None
