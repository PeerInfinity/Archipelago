"""Base class for game-specific helper expanders."""

from typing import Dict, Any, List

class BaseGameExportHandler:
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand helper functions in a rule structure."""
        if not rule:
            return rule
            
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule
        
    def expand_helper(self, helper_name: str) -> Dict[str, Any]:
        """Expand a helper function into basic rule conditions."""
        return None
        
    def expand_count_check(self, items: List[str], count: int = 1) -> Dict[str, Any]:
        """Create a count check rule for one or more items."""
        return {
            'type': 'or',
            'conditions': [
                {'type': 'count_check', 'item': item, 'count': count}
                for item in items
            ]
        }
        
    def get_game_info(self) -> Dict[str, Any]:
        """
        Get information about the game's rule formats and structure.
        This can be overridden by game-specific expanders to provide more detailed information.
        
        Returns:
            A dictionary with game information for the frontend.
        """
        return {
            "rule_format": {
                "version": "1.0"
            }
        }
        
    def get_required_fields(self) -> List[str]:
        """
        Get list of required fields for a complete game export.
        
        Returns:
            A list of field names that must be included in the export.
        """
        return ['region_name', 'locations', 'entrances']
        
    def get_all_worlds(self) -> List[Any]:
        """
        Get all worlds associated with this helper.
        This is typically used to access game-specific data and logic.
        
        Returns:
            A list of world objects.
        """
        return []