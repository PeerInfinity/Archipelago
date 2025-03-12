"""Base class for game-specific helper expanders."""

from typing import Dict, Any, List

class BaseHelperExpander:
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