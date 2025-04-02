"""Generic fallback helper expander."""

from .base import BaseHelperExpander

class GenericHelperExpander(BaseHelperExpander):
    """Fallback expander that preserves helper nodes."""
    
    def expand_helper(self, helper_name: str):
        return None  # Preserve helper nodes as-is
        
    def expand_rule(self, rule):
        """Recursively expand helper functions in a rule structure."""
        if not rule:
            return rule
            
        # Special handling for __analyzed_func__ - replace with a meaningful representation
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            # Replace with a more descriptive representation
            return {
                'type': 'generic_rule',
                'description': 'Game-specific rule',
                'details': 'This rule could not be fully analyzed due to game-specific implementation',
                'original': rule
            }
            
        # Standard processing from base class
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule