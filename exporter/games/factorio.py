"""Factorio game-specific export handler."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class FactorioGameExportHandler(BaseGameExportHandler):
    """Export handler for Factorio."""
    
    def __init__(self, world=None):
        """Initialize with world reference to access location data."""
        super().__init__()
        self.world = world
        
    def expand_helper(self, helper_name: str):
        """Expand Factorio-specific helper functions."""
        return None  # Will implement specific helpers as we discover them
        
    def override_rule_analysis(self, rule_func, rule_target_name: str = None):
        """Override rule analysis for Factorio-specific patterns."""
        # Check if this is an automation science pack location
        if rule_target_name and rule_target_name.startswith('Automate '):
            # For Factorio science automation locations, we need special handling
            # These locations check for having all automated ingredients
            logger.info(f"Factorio: Overriding rule for {rule_target_name}")
            
            # Extract the science pack name (e.g., "automation-science-pack")
            science_pack = rule_target_name.replace('Automate ', '')
            
            # Special case for automation-science-pack - it's the first one with no dependencies
            if science_pack == 'automation-science-pack':
                # This is always accessible (it only requires itself, which is circular)
                logger.info(f"Factorio: Returning constant True for {rule_target_name}")
                return {'type': 'constant', 'value': True}
            
            # For other science packs, we can infer the dependencies based on the name
            # This is a simplified approach - ideally we'd extract from the actual location
            science_pack_deps = {
                'logistic-science-pack': ['automation-science-pack'],
                'military-science-pack': ['automation-science-pack', 'logistic-science-pack'],
                'chemical-science-pack': ['automation-science-pack', 'logistic-science-pack', 'military-science-pack'],
                'production-science-pack': ['automation-science-pack', 'logistic-science-pack', 'chemical-science-pack'],
                'utility-science-pack': ['automation-science-pack', 'logistic-science-pack', 'chemical-science-pack'],
                'space-science-pack': ['automation-science-pack', 'logistic-science-pack', 'military-science-pack', 
                                        'chemical-science-pack', 'production-science-pack', 'utility-science-pack'],
            }
            
            if science_pack in science_pack_deps:
                conditions = []
                for dep in science_pack_deps[science_pack]:
                    conditions.append({
                        'type': 'item_check',
                        'item': f'Automated {dep}',
                        'count': {'type': 'constant', 'value': 1}
                    })
                
                if len(conditions) == 1:
                    return conditions[0]
                else:
                    return {'type': 'and', 'conditions': conditions}
            
            # If we can't determine the dependencies, log and return None
            logger.debug(f"Could not determine dependencies for {rule_target_name}")
        
        return None
        
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
            
        return rule
    
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