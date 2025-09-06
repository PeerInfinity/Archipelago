"""Aquaria game-specific helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class AquariaGameExportHandler(BaseGameExportHandler):
    """Aquaria-specific expander for handling game-specific rules."""
    
    def ensure_missing_regions_added(self, multiworld, player: int) -> None:
        """
        Ensure that all regions defined in AquariaRegions are added to the multiworld.
        This fixes a bug where some regions were created but not added to multiworld.regions.
        """
        try:
            # Get the AquariaRegions object from the world
            if player not in multiworld.worlds:
                return
                
            world = multiworld.worlds[player]
            if not hasattr(world, 'regions'):
                return
                
            regions_obj = world.regions
            
            # List of region attributes that should be in multiworld.regions
            # These were found to be missing in the original code
            missing_region_attrs = [
                'home_water_behind_rocks',
                'openwater_tr_urns', 
                'mithalas_city_urns',
                'mithalas_castle_urns'
            ]
            
            # Get existing region names for quick lookup
            existing_region_names = {r.name for r in multiworld.get_regions() if r.player == player}
            
            # Add any missing regions
            for attr_name in missing_region_attrs:
                if hasattr(regions_obj, attr_name):
                    region = getattr(regions_obj, attr_name)
                    if hasattr(region, 'name') and region.name not in existing_region_names:
                        multiworld.regions.append(region)
                        logger.debug(f"Added missing region {region.name} to multiworld for Aquaria player {player}")
                        
        except Exception as e:
            logger.warning(f"Could not check for missing Aquaria regions: {e}")
    
    def expand_helper(self, helper_name: str, args: List[Any] = None) -> Dict[str, Any]:
        """Expand Aquaria-specific helper functions."""
        if args is None:
            args = []
            
        # Handle common Aquaria helper functions
        if helper_name == "has_light":
            return {'type': 'item_check', 'item': 'Sun Form'}
        elif helper_name == "has_bind":
            return {'type': 'item_check', 'item': 'Bind Song'}
        elif helper_name == "_has_bind_song":
            return {'type': 'item_check', 'item': 'Bind Song'}
        elif helper_name == "has_energy_form":
            return {'type': 'item_check', 'item': 'Energy Form'}
        elif helper_name == "has_beast_form":
            return {'type': 'item_check', 'item': 'Beast Form'}
        elif helper_name == "has_nature_form":
            return {'type': 'item_check', 'item': 'Nature Form'}
        elif helper_name == "has_sun_form":
            return {'type': 'item_check', 'item': 'Sun Form'}
        elif helper_name == "has_li":
            return {'type': 'item_check', 'item': 'Li and Li Song'}
        elif helper_name == "has_fish_form":
            return {'type': 'item_check', 'item': 'Fish Form'}
        elif helper_name == "has_spirit_form":
            return {'type': 'item_check', 'item': 'Spirit Form'}
        elif helper_name == "has_dual_form":
            return {'type': 'item_check', 'item': 'Dual Form'}
        elif helper_name == "_has_energy_attack_item":
            # _has_energy_form(state, player) or _has_dual_form(state, player)
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'helper', 'name': '_has_energy_form'},
                    {'type': 'helper', 'name': '_has_dual_form'}
                ]
            }
        elif helper_name == "_has_energy_form":
            return {'type': 'item_check', 'item': 'Energy Form'}
        elif helper_name == "_has_dual_form":
            # _has_li(state, player) and state.has(ItemNames.DUAL_FORM, player)
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'helper', 'name': '_has_li'},
                    {'type': 'item_check', 'item': 'Dual Form'}
                ]
            }
        elif helper_name == "_has_li":
            return {'type': 'item_check', 'item': 'Li and Li Song'}
        elif helper_name == "_has_spirit_form":
            return {'type': 'item_check', 'item': 'Spirit Form'}
        elif helper_name == "_has_beast_form":
            return {'type': 'item_check', 'item': 'Beast Form'}
        elif helper_name == "_has_sun_form":
            return {'type': 'item_check', 'item': 'Sun Form'}
        elif helper_name == "_has_light":
            # state.has(ItemNames.BABY_DUMBO, player) or _has_sun_form(state, player)
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Baby Dumbo'},
                    {'type': 'helper', 'name': '_has_sun_form'}
                ]
            }
        elif helper_name == "_has_beast_form_or_arnassi_armor":
            # _has_beast_form(state, player) or state.has(ItemNames.ARNASSI_ARMOR, player)
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'helper', 'name': '_has_beast_form'},
                    {'type': 'item_check', 'item': 'Arnassi Armor'}
                ]
            }
        elif helper_name == "_has_damaging_item":
            # state.has_any(DAMAGING_ITEMS, player)
            damaging_items = [
                'Energy Form', 'Nature Form', 'Beast Form',
                'Li and Li Song', 'Baby Nautilus', 'Baby Piranha',
                'Baby Blaster'
            ]
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': item} for item in damaging_items
                ]
            }
        
        # Return None for unknown helpers - will be preserved as-is
        return None
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand Aquaria rule functions."""
        if not rule:
            return rule
            
        # Handle special cases specific to Aquaria
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            # Try to extract more detailed information from original rule if available
            if 'original' in rule:
                return self._analyze_aquaria_rule(rule['original'])
                
        # Use parent class for standard processing
        return super().expand_rule(rule)
    
    def _analyze_aquaria_rule(self, original_rule):
        """Analyze original Aquaria rule structure."""
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])
            
            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                item_name = args[0]
                count = args[1] if len(args) > 1 else 1
                
                result = {'type': 'item_check', 'item': item_name}
                if count > 1:
                    result['count'] = {'type': 'constant', 'value': count}
                return result
                
            # Handle other Aquaria-specific methods
            if method in ['can_reach', 'has_group', 'has_any']:
                return {
                    'type': 'game_specific_check',
                    'method': method,
                    'args': args,
                    'description': f"Requires {method}({', '.join(str(a) for a in args)})"
                }
        
        return {
            'type': 'generic_rule',
            'description': 'Aquaria-specific rule',
            'details': 'This rule could not be fully analyzed'
        }