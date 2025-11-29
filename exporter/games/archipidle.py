"""ArchipIDLE game exporter."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)

class ArchipIDLEGameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'ArchipIDLE'
    """Exporter for ArchipIDLE game logic."""
    
    def handle_special_function_call(self, func_name: str, processed_args: list) -> dict:
        """Handle ArchipIDLE-specific special function calls."""
        if func_name == '_archipidle_location_is_accessible':
            # This function checks if sum of progression items >= required count
            # It takes one argument: the required count
            if not processed_args or len(processed_args) != 1:
                return None
                
            required_count = processed_args[0]
            if isinstance(required_count, dict) and required_count.get('type') == 'constant':
                required_count = required_count['value']
                
            return {
                'type': 'archipidle_progression_check',
                'required_count': required_count,
                'description': f'Requires {required_count} progression items'
            }
            
        return None
        
    def expand_helper(self, helper_name: str, args: List[Any] = None) -> Dict[str, Any]:
        """Expand ArchipIDLE-specific helper functions."""
        # Handle ArchipIDLE-specific helpers first
        if helper_name.startswith('_archipidle_'):
            # This is handled by handle_special_function_call
            return None
            
        # Fall back to generic pattern matching for other helpers
        if self._is_common_helper_pattern(helper_name):
            return self._expand_common_helper(helper_name, args or [])
            
        return None
    
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with ArchipIDLE-specific logic."""
        if not rule:
            return rule
            
        # Handle __analyzed_func__ like generic.py does
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
            return self._infer_rule_type(rule)
        
        # Handle helper nodes with pattern matching
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            if self._is_common_helper_pattern(helper_name):
                expanded = self._expand_common_helper(helper_name, rule.get('args', []))
                return expanded if expanded else rule
        
        # Standard processing from base class
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'], rule.get('args', []))
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule
        
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return ArchipIDLE-specific item data."""
        from BaseClasses import ItemClassification
        
        item_data = {}
        
        # Get advancement items (progression items) from the world
        for item_name, item_id in world.item_name_to_id.items():
            # Check if this item is advancement (progression)
            is_advancement = False
            try:
                # Try to get advancement info from item class without instantiating
                item_class = world.item_name_to_item.get(item_name)
                if item_class and hasattr(item_class, 'classification'):
                    # Check class-level classification if available
                    is_advancement = item_class.classification == ItemClassification.progression
                elif item_class and hasattr(item_class, 'advancement'):
                    # Check class-level advancement flag if available
                    is_advancement = getattr(item_class, 'advancement', False)
                else:
                    # Safe fallback without instantiation
                    raise AttributeError("No class-level classification available")
            except Exception as e:
                logger.debug(f"Failed to check item advancement for {item_name}: {e}")
                # Fallback: check actual item pool for dynamic classification
                is_advancement = self._check_item_pool_classification(world, item_name)
                
            item_data[item_name] = {
                'advancement': is_advancement,
                'id': item_id,
                'classification': 'progression' if is_advancement else 'useful'
            }
            
        return item_data
        
    def _check_item_pool_classification(self, world, item_name):
        """Check if item is classified as progression in the actual item pool."""
        from BaseClasses import ItemClassification
        
        if hasattr(world, 'multiworld'):
            # Check items in the item pool
            for item in world.multiworld.itempool:
                if item.player == world.player and item.name == item_name:
                    return item.classification == ItemClassification.progression
            
            # Check precollected items if they exist
            if hasattr(world.multiworld, 'precollected_items'):
                for item in world.multiworld.precollected_items.get(world.player, []):
                    if item.name == item_name:
                        return item.classification == ItemClassification.progression
            
            # Check items placed in locations
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player and location.item.name == item_name:
                    return location.item.classification == ItemClassification.progression
        
        return False
        
    def get_game_info(self, world) -> Dict[str, Any]:
        """Get ArchipIDLE-specific game information."""
        return {
            "name": "ArchipIDLE",
            "rule_format": {
                "version": "1.0",
                "custom_rules": ["archipidle_progression_check"]
            },
            "description": "An idle game where progression is based on collecting advancement items"
        }
    
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
            'type': 'helper',
            'name': helper_name,
            'args': args,
            'description': f"Requires {helper_name.replace('_', ' ')}"
        }