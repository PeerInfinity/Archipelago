"""Factorio game-specific export handler."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class FactorioGameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Factorio'
    """Export handler for Factorio."""
    
    def __init__(self, world=None):
        """Initialize with world reference to access location data."""
        super().__init__()
        self.world = world
        
    def expand_helper(self, helper_name: str):
        """Expand Factorio-specific helper functions."""
        return None  # Will implement specific helpers as we discover them

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Get Factorio-specific settings."""
        # Get base settings
        settings = super().get_settings_data(world, multiworld, player)

        # Factorio uses base settings, no special overrides needed
        # Event items should be added naturally when checking locations

        return settings

    def get_game_info(self, world) -> Dict[str, Any]:
        """Get Factorio game information including required variables."""
        from worlds.factorio.Technologies import required_technologies

        # Convert required_technologies to a serializable format
        required_tech_dict = {}
        for ingredient, techs in required_technologies.items():
            required_tech_dict[ingredient] = [tech.name for tech in techs]

        return {
            "name": world.game,
            "rule_format": {
                "version": "1.0"
            },
            "variables": {
                "required_technologies": required_tech_dict
            }
        }

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Factorio-specific logic."""
        if not rule:
            return rule

        # Standard processing from base class
        if rule.get('type') == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule

        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        # Handle all_of rules that iterate over required_technologies
        # The Python code uses: all(state.has(technology.name, player) for technology in required_technologies[ingredient])
        # But the exported JSON already has technology names as strings, not Technology objects
        # So we need to simplify "technology.name" to just "technology"
        if rule.get('type') == 'all_of':
            iterator_info = rule.get('iterator_info', {})
            iterator = iterator_info.get('iterator', {})

            # Check if this is iterating over required_technologies[something]
            if (iterator.get('type') == 'subscript' and
                iterator.get('value', {}).get('type') == 'name' and
                iterator.get('value', {}).get('name') == 'required_technologies'):

                # The iterator is required_technologies[X], which yields Technology objects in Python
                # but yields name strings in the exported JSON
                # Simplify the element_rule to remove .name attribute access
                element_rule = rule.get('element_rule', {})
                simplified_element = self._simplify_technology_name_access(element_rule, iterator_info.get('target', {}).get('name'))
                if simplified_element:
                    rule['element_rule'] = self.expand_rule(simplified_element)
                    logger.info(f"[Factorio Exporter] Simplified technology.name access in all_of rule")
                else:
                    # No simplification needed, just recursively expand
                    rule['element_rule'] = self.expand_rule(element_rule)
            else:
                # Not a required_technologies iterator, just recursively expand
                rule['element_rule'] = self.expand_rule(rule.get('element_rule', {}))

        return rule

    def _simplify_technology_name_access(self, rule: Dict[str, Any], iterator_var: str) -> Dict[str, Any]:
        """Simplify technology.name attribute access to just technology.

        In Python: technology is a Technology object, so technology.name is needed
        In JSON: technology is already a string (the name), so technology.name is wrong

        Args:
            rule: The rule that may contain technology.name attribute access
            iterator_var: The name of the iterator variable (e.g., "technology")

        Returns:
            Simplified rule, or None if no simplification needed
        """
        logger.info(f"[Factorio Exporter] _simplify_technology_name_access called with iterator_var={iterator_var}, rule type={rule.get('type') if rule else None}")

        if not rule or not iterator_var:
            logger.info(f"[Factorio Exporter] Skipping simplification: rule={bool(rule)}, iterator_var={iterator_var}")
            return None

        # Check if this is an item_check with an attribute access pattern
        if rule.get('type') == 'item_check':
            item = rule.get('item', {})
            logger.info(f"[Factorio Exporter] item_check found, item type={item.get('type')}")

            # Pattern: {"type": "attribute", "object": {"type": "name", "name": "technology"}, "attr": "name"}
            # Should become: {"type": "name", "name": "technology"}
            if (item.get('type') == 'attribute' and
                item.get('attr') == 'name' and
                item.get('object', {}).get('type') == 'name' and
                item.get('object', {}).get('name') == iterator_var):

                logger.info(f"[Factorio Exporter] Simplifying attribute access pattern!")
                # Replace the attribute access with just the name reference
                return {
                    'type': 'item_check',
                    'item': {
                        'type': 'name',
                        'name': iterator_var
                    }
                }

        logger.info(f"[Factorio Exporter] No simplification applied")
        return None

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return Factorio-specific progression item mapping."""
        from worlds.factorio.Technologies import progressive_technology_table

        mapping_data = {}

        # Build progression mapping from progressive_technology_table
        for prog_name, tech_data in progressive_technology_table.items():
            if tech_data.progressive:
                mapping_data[prog_name] = {
                    'items': [],
                    'base_item': prog_name
                }

                # Add each level of the progressive tech
                for level, tech_name in enumerate(tech_data.progressive, start=1):
                    mapping_data[prog_name]['items'].append({
                        'name': tech_name,
                        'level': level
                    })

        return mapping_data

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return Factorio-specific item data."""
        from BaseClasses import ItemClassification
        
        item_data = {}
        
        # Get items from world.item_name_to_id
        if hasattr(world, 'item_name_to_id'):
            for item_name, item_id in world.item_name_to_id.items():
                # Try to get classification
                is_advancement = False
                is_useful = False
                is_trap = False
                
                try:
                    # Check item pool for classification
                    if hasattr(world, 'multiworld'):
                        for item in world.multiworld.itempool:
                            if item.player == world.player and item.name == item_name:
                                is_advancement = item.classification == ItemClassification.progression
                                is_useful = item.classification == ItemClassification.useful
                                is_trap = item.classification == ItemClassification.trap
                                break
                        
                        # Check placed items in locations
                        if not (is_advancement or is_useful or is_trap):
                            for location in world.multiworld.get_locations(world.player):
                                if (location.item and location.item.player == world.player and 
                                    location.item.name == item_name and location.item.code is not None):
                                    is_advancement = location.item.classification == ItemClassification.progression
                                    is_useful = location.item.classification == ItemClassification.useful
                                    is_trap = location.item.classification == ItemClassification.trap
                                    break
                except Exception as e:
                    logger.debug(f"Could not determine classification for {item_name}: {e}")
                
                # Get groups if available
                groups = []
                if hasattr(world, 'item_name_groups'):
                    groups = [
                        group_name for group_name, items in world.item_name_groups.items()
                        if item_name in items
                    ]
                
                item_data[item_name] = {
                    'name': item_name,
                    'id': item_id,
                    'groups': sorted(groups),
                    'advancement': is_advancement,
                    'useful': is_useful,
                    'trap': is_trap,
                    'event': False,
                    'type': None,
                    'max_count': 1
                }
        
        # Handle event items
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID) that we haven't seen
                    if (location.item.code is None and
                        item_name not in item_data and
                        hasattr(location.item, 'classification')):

                        # All items with no code (event items) should be marked as event=True
                        # This includes "Automated" items in Factorio which are event items
                        # placed with place_locked_item() and used in access rules
                        item_data[item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['Event'],
                            'advancement': location.item.classification == ItemClassification.progression,
                            'useful': location.item.classification == ItemClassification.useful,
                            'trap': location.item.classification == ItemClassification.trap,
                            'event': True,
                            'type': 'Event',
                            'max_count': 1
                        }

        return item_data