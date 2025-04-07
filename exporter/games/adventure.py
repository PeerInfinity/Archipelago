from .base import BaseGameExportHandler
from typing import Any, Dict, Optional, Set

class AdventureGameExportHandler(BaseGameExportHandler):
    """Validates helper names are known Adventure helpers"""
    
    def __init__(self):
        # TODO: Populate this set with actual known Adventure helper function names
        self.known_helpers = set()

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Validates helper names exist against the known_helpers set."""
        if not rule:
            return rule
            
        if rule.get('type') == 'helper':
            helper_name = rule.get('name')
            if helper_name and helper_name not in self.known_helpers:
                # Log or raise an error for unknown helpers if needed during development
                print(f"WARNING: Unknown Adventure helper found: {helper_name}")
            # Return the helper rule as-is (no expansion logic needed yet)
            return rule
            
        # Recursively check nested conditions for 'and'/'or' rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule.get('conditions', []) if cond # Ensure cond is not None
            ]
            
        return rule

# Reminder: Ensure get_game_helpers in exporter/games/__init__.py 
# returns an instance of AdventureGameExportHandler for the 'Adventure' game.
