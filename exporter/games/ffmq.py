"""Final Fantasy Mystic Quest game-specific export handler."""

from .base import BaseGameExportHandler
from typing import Any, Dict
from BaseClasses import ItemClassification
import logging

logger = logging.getLogger(__name__)

class FFMQGameExportHandler(BaseGameExportHandler):
    """Export handler for Final Fantasy Mystic Quest"""
    
    def __init__(self, world):
        self.world = world
        
        # FFMQ has item groups that are commonly referenced
        self.item_groups = {}
        if hasattr(world, 'item_name_groups'):
            self.item_groups = world.item_name_groups
            
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rules and resolve FFMQ-specific patterns."""
        if not rule or not isinstance(rule, dict):
            return rule
            
        # Handle binary operations like "w" + "s" to build item group names
        if rule.get('type') == 'binary_op':
            left = rule.get('left', {})
            right = rule.get('right', {})
            op = rule.get('op')
            
            # Resolve name references  
            if left.get('type') == 'name' and left.get('name') == 'w':
                # w is likely a closure variable meaning "Weapon"
                # The sphere log shows mixed behavior - some locations accept bombs, some don't
                # For now, use the full Weapons group to match most cases
                if right.get('type') == 'constant' and right.get('value') == 's':
                    # "w" + "s" builds "Weapons" group name
                    return {
                        'type': 'constant',
                        'value': 'Weapons'
                    }
                elif right.get('type') == 'constant' and isinstance(right.get('value'), str):
                    # For other suffixes, try constructing group name
                    group_suffix = right.get('value')
                    # Try different patterns
                    possible_groups = [
                        f"Weapon{group_suffix}",  # e.g., "Weapons"
                        f"w{group_suffix}",        # e.g., "ws"
                        group_suffix               # Just the suffix
                    ]
                    # Check which one exists in item_groups
                    for group_name in possible_groups:
                        if group_name in self.item_groups:
                            return {
                                'type': 'constant',
                                'value': group_name
                            }
                    # Default to Weapon + suffix pattern
                    return {
                        'type': 'constant',
                        'value': f"Weapon{group_suffix}"
                    }
                    
        # Handle subscript operations for item_groups access
        if rule.get('type') == 'subscript':
            value = rule.get('value', {})
            index = rule.get('index', {})
            
            if value.get('type') == 'name' and value.get('name') == 'item_groups':
                # Resolve the index (which might be a binary operation)
                resolved_index = self.expand_rule(index)
                if resolved_index.get('type') == 'constant':
                    group_name = resolved_index.get('value')
                    
                    # Get items in this group
                    if group_name in self.item_groups:
                        return {
                            'type': 'constant',
                            'value': list(self.item_groups[group_name])
                        }
                        
        # Handle state methods that reference resolved item groups
        if rule.get('type') == 'state_method':
            method = rule.get('method')
            args = rule.get('args', [])
            
            # Resolve args recursively
            resolved_args = [self.expand_rule(arg) for arg in args]
            
            if method == 'has_any' and len(resolved_args) == 1:
                # If the argument is a constant list of items
                if resolved_args[0].get('type') == 'constant':
                    items = resolved_args[0].get('value', [])
                    if isinstance(items, list) and items:
                        # Convert to an OR condition of item checks
                        return {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }
                        
            if method == 'has_all' and len(resolved_args) == 1:
                # If the argument is an empty list, this is always true
                if resolved_args[0].get('type') == 'constant':
                    items = resolved_args[0].get('value', [])
                    if isinstance(items, list) and not items:
                        return {'type': 'constant', 'value': True}
                    elif isinstance(items, list):
                        # Convert to an AND condition of item checks
                        return {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': item}
                                for item in items
                            ]
                        }
            
            # Update the rule with resolved args if we couldn't fully expand
            rule['args'] = resolved_args
            
        # Handle helper expansions
        if rule.get('type') == 'helper':
            expanded = self.expand_helper(rule['name'], rule.get('args', []))
            if expanded:
                return self.expand_rule(expanded)
                
        # Recursively expand nested conditions
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule.get('conditions', [])
            ]
            
        if rule.get('type') == 'not':
            rule['condition'] = self.expand_rule(rule.get('condition'))
            
        return rule
        
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return FFMQ-specific item definitions."""
        ffmq_items_data = {}
        
        # Import FFMQ item tables
        try:
            from worlds.ffmq import Items as FFMQItems
        except ImportError:
            logger.warning("Could not import FFMQ Items module")
            return ffmq_items_data
            
        # Process regular items
        if hasattr(FFMQItems, 'item_table'):
            for item_name, item_data in FFMQItems.item_table.items():
                groups = []
                # Check which groups this item belongs to
                for group_name, items in self.item_groups.items():
                    if item_name in items:
                        groups.append(group_name)

                # Determine classification
                is_advancement = False
                is_useful = False
                is_trap = False

                if hasattr(FFMQItems, 'progression_items') and item_name in FFMQItems.progression_items:
                    is_advancement = True
                elif hasattr(FFMQItems, 'useful_items') and item_name in FFMQItems.useful_items:
                    is_useful = True
                elif hasattr(FFMQItems, 'trap_items') and item_name in FFMQItems.trap_items:
                    is_trap = True

                ffmq_items_data[item_name] = {
                    'name': item_name,
                    'id': item_data.id,
                    'groups': sorted(groups),
                    'advancement': is_advancement,
                    'priority': False,
                    'useful': is_useful,
                    'trap': is_trap,
                    'event': False,
                    'type': None,
                    'max_count': 1
                }
                
        # Process event items if any
        if hasattr(FFMQItems, 'event_table'):
            for item_name, item_id in FFMQItems.event_table.items():
                ffmq_items_data[item_name] = {
                    'name': item_name,
                    'id': None,
                    'groups': ['Event'],
                    'advancement': True,  # Events are usually progression
                    'priority': False,
                    'useful': False,
                    'trap': False,
                    'event': True,
                    'type': 'Event',
                    'max_count': 1
                }
                
        # Handle dynamically created event items
        if hasattr(world, 'multiworld'):
            multiworld = world.multiworld
            player = world.player
            
            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    item_name = location.item.name
                    # Check if this is an event item not in our data
                    if (location.item.code is None and 
                        item_name not in ffmq_items_data and
                        hasattr(location.item, 'classification')):
                        
                        ffmq_items_data[item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['Event'],
                            'advancement': location.item.classification == ItemClassification.progression,
                            'priority': False,
                            'useful': location.item.classification == ItemClassification.useful,
                            'trap': location.item.classification == ItemClassification.trap,
                            'event': True,
                            'type': 'Event',
                            'max_count': 1
                        }
                        
        return ffmq_items_data