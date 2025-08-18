"""A Short Hike specific export handler."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class ShortHikeGameExportHandler(BaseGameExportHandler):
    """A Short Hike specific export handler based on game mechanics."""
    
    def expand_helper(self, helper_name: str):
        """Expand A Short Hike specific helper functions."""
        
        # Golden feather helpers - main progression mechanic
        if helper_name == "can_fly":
            return {
                'type': 'item_check',
                'item': 'Golden Feather',
                'count': 1,
                'description': 'Requires at least 1 Golden Feather to fly/glide'
            }
        
        if helper_name.startswith("can_fly_"):
            # Extract feather count requirement
            try:
                count = int(helper_name.split("_")[-1])
                return {
                    'type': 'item_check',
                    'item': 'Golden Feather',
                    'count': count,
                    'description': f'Requires {count} Golden Feathers to reach this area'
                }
            except ValueError:
                pass
        
        # Tools and equipment helpers
        if helper_name == "has_shovel":
            return {
                'type': 'item_check',
                'item': 'Shovel',
                'description': 'Requires shovel to dig'
            }
        
        if helper_name == "has_fishing_rod":
            return {
                'type': 'item_check',
                'item': 'Fishing Rod',
                'description': 'Requires fishing rod to catch fish'
            }
        
        if helper_name == "has_compass":
            return {
                'type': 'item_check',
                'item': 'Compass',
                'description': 'Requires compass for navigation'
            }
        
        if helper_name == "has_boat":
            return {
                'type': 'item_check',
                'item': 'Boat',
                'description': 'Requires boat to cross water'
            }
        
        # Currency helpers
        if helper_name.startswith("has_coins_"):
            try:
                count = int(helper_name.split("_")[-1])
                return {
                    'type': 'item_check',
                    'item': 'Coin',
                    'count': count,
                    'description': f'Requires {count} coins'
                }
            except ValueError:
                pass
        
        # Quest completion helpers
        if helper_name == "lighthouse_quest_completed":
            return {
                'type': 'event_check',
                'event': 'Lighthouse Quest Complete',
                'description': 'Requires completing the lighthouse quest'
            }
        
        if helper_name == "can_reach_peak":
            return {
                'type': 'complex_requirement',
                'description': 'Requires enough golden feathers to reach the mountain peak',
                'requirements': [
                    {
                        'type': 'item_check',
                        'item': 'Golden Feather',
                        'count': 7  # Typical requirement for peak
                    }
                ]
            }
        
        # Area access helpers
        if helper_name.startswith("can_reach_"):
            area = helper_name.replace("can_reach_", "").replace("_", " ").title()
            return {
                'type': 'area_access',
                'area': area,
                'description': f'Requires access to {area}'
            }
        
        # Return None to preserve unknown helpers as-is
        return None
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with A Short Hike specific logic."""
        if not rule:
            return rule
            
        # Handle helper nodes
        if rule['type'] == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule
            
        # Handle logical operators
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            
        return rule