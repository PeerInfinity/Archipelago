"""Aquaria game-specific helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
from BaseClasses import ItemClassification
import logging

logger = logging.getLogger(__name__)

class AquariaGameExportHandler(BaseGameExportHandler):
    """Aquaria-specific expander for handling game-specific rules."""
    
    def postprocess_regions(self, multiworld, player):
        """
        Fix missing regions that aren't added to multiworld.regions in Aquaria.
        
        Some regions in Aquaria are created but not added to multiworld.regions,
        causing them to be missing from the export. This function finds and adds them.
        """
        if not hasattr(multiworld, 'worlds') or player not in multiworld.worlds:
            return
            
        world = multiworld.worlds[player]
        if not hasattr(world, 'regions'):
            return
            
        # List of region attributes that should be added if they exist
        missing_region_attrs = [
            'first_secret',
            'energy_temple_idol',
            'energy_temple_after_boss',
            'energy_temple_4',
            'frozen_feil',  # Note: typo in Python source (feil instead of veil)
            'sunken_city_l_crates',  # Note: renamed to avoid duplicate with sunken_city_l
            'sunken_city_r_crates',
            # These 4 regions were previously added via Python code changes, but we're reverting those
            'home_water_behind_rocks',
            'openwater_tr_urns',
            'mithalas_city_urns',
            'mithalas_castle_urns'
        ]
        
        regions_added = []
        for attr_name in missing_region_attrs:
            if hasattr(world.regions, attr_name):
                region = getattr(world.regions, attr_name)
                if region and region not in multiworld.regions:
                    # Special case: sunken_city_l_crates has duplicate name with sunken_city_l
                    # Rename it to avoid collision
                    if attr_name == 'sunken_city_l_crates' and region.name == "Sunken City left area":
                        region.name = "Sunken City left area crates"

                    multiworld.regions.append(region)
                    regions_added.append(region.name)

        # Store the names of dynamically added regions for later marking
        self.dynamically_added_regions = set(regions_added)

        if regions_added:
            logger.info(f"Added {len(regions_added)} missing Aquaria regions to multiworld: {', '.join(regions_added)}")
    
    def get_region_attributes(self, region) -> Dict[str, Any]:
        """Add game-specific region attributes."""
        attributes = {}

        # Mark regions that were dynamically added after sphere calculation
        if hasattr(self, 'dynamically_added_regions') and region.name in self.dynamically_added_regions:
            attributes['dynamically_added'] = True

        return attributes

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

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return Aquaria-specific item table data including dynamically created event items.

        Aquaria creates event items at runtime for boss defeats and secrets that are not
        in the static item_table. These need to be discovered by scanning placed items.
        """
        aquaria_items_data = {}

        # Handle dynamically created event items that are placed at locations
        # In Aquaria, event items like "Drunian God beated", "Victory", etc. are created
        # at runtime via create_event() but not in any static item_table
        if hasattr(world, 'multiworld'):
            multiworld = world.multiworld
            player = world.player

            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID)
                    if (location.item.code is None and
                        item_name not in aquaria_items_data and
                        hasattr(location.item, 'classification')):

                        aquaria_items_data[item_name] = {
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

        return aquaria_items_data