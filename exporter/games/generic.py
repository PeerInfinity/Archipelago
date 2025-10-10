"""Generic fallback helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)

class GenericGameExportHandler(BaseGameExportHandler):
    """Fallback expander that intelligently handles game-specific rules."""
    
    def expand_helper(self, helper_name: str):
        return None  # Preserve helper nodes as-is
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with intelligent analysis."""
        if not rule:
            return rule
            
        # Special handling for __analyzed_func__ - try to extract meaningful information
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            # Try to extract more detailed information from original rule if available
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
                
            # Attempt to infer rule type from any available information
            return self._infer_rule_type(rule)
            
        # Special handling for helper nodes with common pattern names
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            if self._is_common_helper_pattern(helper_name):
                return self._expand_common_helper(helper_name, rule.get('args', []))
            
        # Standard processing from base class
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule
    
    def _analyze_original_rule(self, original_rule):
        """
        Attempt to analyze the original rule structure before it became __analyzed_func__.
        This can sometimes extract more information.
        """
        # Look for state method calls in the original rule
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])
            
            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                return {
                    'type': 'item_check',
                    'item': args[0]
                }
                
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
        Handles cases where original rule data is not available.
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
    
    def _is_common_helper_pattern(self, helper_name):
        """
        Check if a helper name matches common naming patterns across games.
        """
        common_patterns = [
            # Item access patterns
            r'^has_.*',
            r'^can_use_.*',
            r'^can_access_.*',
            r'^can_reach_.*',
            r'^has_access_to_.*',
            # General capability patterns
            r'^can_.*',
            r'^is_.*',
            # Game-specific but common
            r'^slay_.*',
            r'^defeat_.*',
            r'^open_.*',
            r'^unlock_.*',
        ]
        
        for pattern in common_patterns:
            if re.match(pattern, helper_name):
                return True
        return False
    
    def _expand_common_helper(self, helper_name, args):
        """
        Expand common helper functions based on naming convention.
        """
        # Extract the object of the helper (what it applies to)
        parts = helper_name.split('_')
        action = parts[0] if parts else ''
        subject = '_'.join(parts[1:]) if len(parts) > 1 else ''
        
        if not subject:
            return None
            
        # Create appropriate rule based on helper type
        if action == 'has':
            return {
                'type': 'item_check',
                'item': subject.title(),
                'inferred': True,
                'description': f"Requires having {subject.replace('_', ' ').title()}"
            }
        elif action == 'can':
            return {
                'type': 'capability',
                'capability': subject,
                'inferred': True,
                'description': f"Requires ability to {subject.replace('_', ' ')}"
            }
        elif action in ['defeat', 'slay']:
            return {
                'type': 'enemy_requirement',
                'enemy': subject,
                'inferred': True,
                'description': f"Requires defeating {subject.replace('_', ' ').title()}"
            }
            
        # Generic helper description when we can't infer more
        return {
            'type': 'generic_helper',
            'name': helper_name,
            'args': args,
            'description': f"Requires {helper_name.replace('_', ' ')}"
        }
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return generic item data with classification flags.
        Provides a fallback implementation for games without specific handlers.
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
                    item_class = getattr(world, 'item_name_to_item', {}).get(item_name)
                    if item_class and hasattr(item_class, 'classification'):
                        classification = item_class.classification
                        is_advancement = classification == ItemClassification.progression
                        is_useful = classification == ItemClassification.useful
                        is_trap = classification == ItemClassification.trap
                except Exception as e:
                    logger.debug(f"Could not determine classification for {item_name}: {e}")
                    # Fallback: check item pool if available
                    if hasattr(world, 'multiworld'):
                        for item in world.multiworld.itempool:
                            if item.player == world.player and item.name == item_name:
                                is_advancement = item.classification == ItemClassification.progression
                                is_useful = item.classification == ItemClassification.useful
                                is_trap = item.classification == ItemClassification.trap
                                break
                        
                        # Additional fallback: check placed items in locations
                        if not (is_advancement or is_useful or is_trap):
                            for location in world.multiworld.get_locations(world.player):
                                if (location.item and location.item.player == world.player and 
                                    location.item.name == item_name and location.item.code is not None):
                                    is_advancement = location.item.classification == ItemClassification.progression
                                    is_useful = location.item.classification == ItemClassification.useful
                                    is_trap = location.item.classification == ItemClassification.trap
                                    break
                
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