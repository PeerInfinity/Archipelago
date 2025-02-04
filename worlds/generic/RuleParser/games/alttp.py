# worlds/generic/RuleParser/games/alttp.py

from .base import BaseHelperExpander
from typing import Any, Dict, Optional, Set

class ALttPHelperExpander(BaseHelperExpander):
    """No longer expands helpers - just validates they're known ALTTP helpers"""
    
    def __init__(self):
        self.known_helpers = {
            'has_sword',
            'can_use_bombs',
            'can_bomb_or_bonk',
            'can_lift_rocks',
            'can_lift_heavy_rocks',
            'has_fire_source',
            'can_shoot_arrows',
            'has_melee_weapon',
            'can_melt_things', 
            'can_extend_magic',
            'has_hearts',
            'can_kill_most_things',
            'can_activate_crystal_switch',
            'can_retrieve_tablet',
            'bottle_count',
            'can_get_good_bee',
            'can_boots_clip_lw',
            'can_boots_clip_dw',
            'can_get_glitched_speed_dw',
            'has_misery_mire_medallion',
            'has_turtle_rock_medallion',
            'has_triforce_pieces',
            'has_crystals',
            'item_name_in_location_names',
            'location_item_name', 
            'shop_price_rules'
        }

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Now just validates helper names exist"""
        if not rule:
            return rule
            
        if rule['type'] == 'helper':
            if rule['name'] not in self.known_helpers:
                print(f"Unknown ALTTP helper: {rule['name']}")
            return rule
            
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule['conditions']
            ]
            
        return rule