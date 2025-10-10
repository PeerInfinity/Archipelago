"""Kingdom Hearts 1 specific helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)

class KH1GameExportHandler(BaseGameExportHandler):
    """KH1-specific expander that handles Kingdom Hearts 1 rules."""
    
    def __init__(self, world=None):
        """Initialize with optional world reference."""
        super().__init__()
        self.world = world
    
    def expand_helper(self, helper_name: str, args=None):
        """Expand KH1-specific helper functions."""
        # Map of KH1 helper functions to their simplified rules
        helper_map = {
            # Add specific KH1 helpers as we discover them
        }
        
        if helper_name in helper_map:
            return helper_map[helper_name]
            
        # For now, preserve helper nodes as-is until we identify specific helpers
        return None
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions for KH1."""
        if not rule:
            return rule
            
        # Special handling for function_call with self methods
        if rule.get('type') == 'function_call':
            func = rule.get('function', {})
            # Check if this is a self.method_name pattern
            if func.get('type') == 'attribute' and isinstance(func.get('object'), dict):
                obj = func.get('object', {})
                if obj.get('type') == 'name' and obj.get('name') == 'self':
                    # This is a self.method_name call
                    method_name = func.get('attr')
                    args = rule.get('args', [])
                    if method_name:
                        # Try to expand this as a helper with args
                        expanded = self.expand_helper(method_name, args)
                        if expanded:
                            return self.expand_rule(expanded)  # Recursively expand the result
                        # If not expandable, convert to a helper node with args
                        return {'type': 'helper', 'name': method_name, 'args': args}
            
        # Special handling for __analyzed_func__
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
            return self._infer_rule_type(rule)
            
        # Special handling for helper nodes
        if rule.get('type') == 'helper':
            expanded = self.expand_helper(rule.get('name'), rule.get('args'))
            if expanded:
                return self.expand_rule(expanded)  # Recursively expand
            return rule
            
        # Handle and/or conditions recursively
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
            
        return rule
    
    def _analyze_original_rule(self, original_rule):
        """
        Attempt to analyze the original rule structure before it became __analyzed_func__.
        """
        # Look for state method calls in the original rule
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])
            
            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                item_check = {
                    'type': 'item_check',
                    'item': args[0]
                }
                # Add count if specified
                if len(args) >= 2:
                    item_check['count'] = {'type': 'constant', 'value': args[1]}
                return item_check
                
            # Handle other known state methods
            if method in ['can_reach', 'has_group', 'has_any']:
                return {
                    'type': 'game_specific_check',
                    'method': method,
                    'args': args,
                    'description': f"Requires {method}({', '.join(str(a) for a in args)})"
                }
        
        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed due to game-specific implementation'
        }
    
    def _infer_rule_type(self, rule):
        """
        Attempt to infer rule type based on context clues.
        """
        args = rule.get('args', [])
        
        # Look for keywords in rule name or source code if available
        rule_str = str(rule)
        
        # Item check patterns
        if 'has(' in rule_str.lower() or 'state.has' in rule_str.lower():
            item_match = re.search(r"has\(['\"](.*?)['\"]\s*,", rule_str)
            if item_match:
                return {
                    'type': 'item_check',
                    'item': item_match.group(1),
                    'inferred': True
                }
        
        # Location access patterns
        if 'can_reach' in rule_str.lower():
            return {
                'type': 'can_reach',
                'inferred': True,
                'description': 'Requires reaching a specific location'
            }
        
        # Return a more descriptive generic rule
        return {
            'type': 'generic_rule',
            'description': 'Game-specific rule',
            'details': 'This rule could not be fully analyzed but may involve item requirements'
        }
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return KH1-specific item data with classification flags.
        """
        from BaseClasses import ItemClassification
        
        item_data = {}
        
        # Get items from world.item_name_to_id if available
        if hasattr(world, 'item_name_to_id'):
            for item_name, item_id in world.item_name_to_id.items():
                # Try to get classification from item class
                is_advancement = False
                is_useful = False
                is_trap = False
                
                try:
                    # Try to get classification from item pool
                    if hasattr(world, 'multiworld'):
                        for item in world.multiworld.itempool:
                            if item.player == world.player and item.name == item_name:
                                is_advancement = item.classification == ItemClassification.progression
                                is_useful = item.classification == ItemClassification.useful
                                is_trap = item.classification == ItemClassification.trap
                                break
                        
                        # Additional check: scan placed items in locations
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
                    'event': False,  # Regular items are not events
                    'type': None,
                    'max_count': 1
                }
        
        # Handle dynamically created event items by scanning locations
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