"""DLCQuest-specific export handler."""

from typing import Dict, Any
from .base import BaseGameExportHandler
import logging
import ast

logger = logging.getLogger(__name__)

class DLCQuestGameExportHandler(BaseGameExportHandler):
    """Handle DLCQuest-specific rule expansions and coin item export."""
    
    def __init__(self, world=None):
        super().__init__()
        self.world = world
        self.coin_items = {}  # Track coin items we find
        
    def expand_helper(self, helper_name: str):
        """Expand DLCQuest-specific helpers."""
        return None  # No special helpers for now
        
    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process exported data to add coin items."""
        # Always add the special " coins" accumulator items for DLCQuest
        # These are used to track total coins collected
        for player_id in data.get('regions', {}).keys():
            if player_id not in self.coin_items:
                self.coin_items[player_id] = {}
            
            # Add the special accumulator items
            self.coin_items[player_id][' coins'] = {
                'name': ' coins',
                'id': None,  # These don't have IDs
                'groups': ['coins'],
                'advancement': True,  # Important for prog_items
                'useful': False,
                'trap': False,
                'event': False,
                'type': 'coins',
                'max_count': 999999  # Can accumulate
            }
            
            # Also add " coins freemium" if Live Freemium or Die campaign is included
            # (We'll add it always for simplicity)
            self.coin_items[player_id][' coins freemium'] = {
                'name': ' coins freemium',
                'id': None,  # These don't have IDs
                'groups': ['coins'],
                'advancement': True,  # Important for prog_items
                'useful': False,
                'trap': False,
                'event': False,
                'type': 'coins',
                'max_count': 999999  # Can accumulate
            }
        
        # Extract coin items from locations
        for player_id, regions in data.get('regions', {}).items():
            for region_name, region_data in regions.items():
                for location in region_data.get('locations', []):
                    item = location.get('item', {})
                    item_name = item.get('name', '')
                    
                    # Check if this is a coin bundle item like "4 coins"
                    if ('coins' in item_name and 
                        item_name not in self.coin_items.get(player_id, {}) and
                        item_name not in [' coins', ' coins freemium']):  # Skip accumulators
                        # Track this coin item
                        if player_id not in self.coin_items:
                            self.coin_items[player_id] = {}
                        
                        # Individual coin bundle items like "4 coins"
                        self.coin_items[player_id][item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['coins'],
                            'advancement': True,  # Important for prog_items
                            'useful': False,
                            'trap': False,
                            'event': False,
                            'type': 'coins',
                            'max_count': 1
                        }
        
        # Add coin items to the items dictionary
        if self.coin_items:
            if 'items' not in data:
                data['items'] = {}
            
            for player_id, coin_items in self.coin_items.items():
                if player_id not in data['items']:
                    data['items'][player_id] = {}
                
                # Add each coin item
                for item_name, item_data in coin_items.items():
                    if item_name not in data['items'][player_id]:
                        data['items'][player_id][item_name] = item_data
                        logger.info(f"Added coin item '{item_name}' to items dictionary for player {player_id}")
        
        return data
                    
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand DLCQuest-specific rules."""
        if not rule:
            return rule
            
        # Recursively process nested rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
            
        return rule