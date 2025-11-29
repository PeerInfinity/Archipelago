"""Donkey Kong Country 3 game exporter."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class DKC3GameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Donkey Kong Country 3'
    """Handle DKC3-specific rule expansions and helper functions."""
    
    def __init__(self, world=None):
        """Initialize with optional world reference."""
        super().__init__()
        self.world = world
        self._load_name_mappings()
    
    def _load_name_mappings(self):
        """Load LocationName and ItemName mappings from DKC3 modules."""
        self.location_names = {}
        self.item_names = {}
        
        try:
            # Import the DKC3 name modules
            from worlds.dkc3.Names import LocationName, ItemName
            
            # Extract all location names
            for attr_name in dir(LocationName):
                if not attr_name.startswith('_'):
                    value = getattr(LocationName, attr_name)
                    if isinstance(value, str):
                        self.location_names[attr_name] = value
                        
            # Extract all item names
            for attr_name in dir(ItemName):
                if not attr_name.startswith('_'):
                    value = getattr(ItemName, attr_name)
                    if isinstance(value, str):
                        self.item_names[attr_name] = value
                        
            logger.debug(f"Loaded {len(self.location_names)} location names and {len(self.item_names)} item names for DKC3")
        except ImportError as e:
            logger.warning(f"Could not import DKC3 name modules: {e}")
    
    def expand_helper(self, helper_name: str):
        """Expand DKC3-specific helper functions."""
        # For now, preserve helper nodes as-is until we identify specific helper patterns
        return None
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand DKC3 rule functions."""
        if not rule or not isinstance(rule, dict):
            return rule
        
        # Handle attribute access for LocationName/ItemName
        if rule.get('type') == 'attribute':
            obj = rule.get('object', {})
            attr = rule.get('attr')
            
            # Check if this is a LocationName or ItemName attribute access
            if obj.get('type') == 'name':
                obj_name = obj.get('name')
                if obj_name == 'LocationName' and attr in self.location_names:
                    # Replace with the actual location name string
                    return {'type': 'constant', 'value': self.location_names[attr]}
                elif obj_name == 'ItemName' and attr in self.item_names:
                    # Replace with the actual item name string
                    return {'type': 'constant', 'value': self.item_names[attr]}
        
        # Handle state_method calls with attribute arguments
        if rule.get('type') == 'state_method':
            if 'args' in rule:
                rule['args'] = [self.expand_rule(arg) for arg in rule['args']]
        
        # Handle item_check rules with attribute access in the item field
        if rule.get('type') == 'item_check':
            if 'item' in rule:
                rule['item'] = self.expand_rule(rule['item'])
            if 'count' in rule:
                rule['count'] = self.expand_rule(rule['count'])
            
        # Use standard processing from base class
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return DKC3-specific item data.
        Falls back to generic implementation from base class.
        """
        # Use the base implementation for now
        return super().get_item_data(world)