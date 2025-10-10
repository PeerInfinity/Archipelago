"""Civilization VI specific helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Civ6GameExportHandler(BaseGameExportHandler):
    """Handler for Civilization VI-specific rules."""
    
    def get_game_info(self, world) -> Dict[str, Any]:
        """Get Civilization VI-specific game info including era requirements."""
        info = {
            "name": world.game,
            "rule_format": {
                "version": "1.0"
            }
        }
        
        # Add era requirements if they exist
        if hasattr(world, 'era_required_non_progressive_items'):
            info['era_required_non_progressive_items'] = {
                era.value: items for era, items in world.era_required_non_progressive_items.items()
            }
            
        if hasattr(world, 'era_required_progressive_items_counts'):
            info['era_required_progressive_items_counts'] = {
                era.value: dict(counts) for era, counts in world.era_required_progressive_items_counts.items()
            }
            
        if hasattr(world, 'era_required_progressive_era_counts'):
            info['era_required_progressive_era_counts'] = {
                era.value: count for era, count in world.era_required_progressive_era_counts.items()
            }
            
        return info
    
    def expand_helper(self, helper_name: str):
        """Expand helper functions for Civilization VI."""
        return None  # Preserve helper nodes for now
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions."""
        if not rule:
            return rule
            
        # Standard processing from base class
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return Civilization VI-specific item data."""
        from BaseClasses import ItemClassification
        
        item_data = {}
        
        # Get items from world.item_name_to_id if available
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
                        
                        # Additional check: placed items in locations
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
        
        # Handle event items by scanning locations
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID) that we haven't seen
                    if (location.item.code is None and 
                        item_name not in item_data and
                        hasattr(location.item, 'classification')):
                        
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