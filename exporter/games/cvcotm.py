"""Castlevania - Circle of the Moon specific exporter."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class CvCotMGameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Castlevania - Circle of the Moon'
    """Expander for Castlevania - Circle of the Moon specific functions."""
    
    def __init__(self):
        super().__init__()
        self.game_name = "Castlevania - Circle of the Moon"
        
    def expand_helper(self, helper_name: str):
        """Expand CvCotM-specific helper functions."""
        # For now, preserve helper nodes as-is
        return None

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand and fix rules for CvCotM."""
        if not rule:
            return rule

        rule_type = rule.get('type')

        # Convert function_call with self.method_name to helper calls
        if rule_type == 'function_call':
            func = rule.get('function', {})
            if (func.get('type') == 'attribute' and
                func.get('object', {}).get('type') == 'name' and
                func.get('object', {}).get('name') == 'self'):
                # This is a call to self.method_name - convert to helper
                method_name = func.get('attr')
                if method_name:
                    return {
                        'type': 'helper',
                        'name': method_name,
                        'args': rule.get('args', [])
                    }

        # Standard helper processing from base class
        if rule_type == 'helper':
            expanded = self.expand_helper(rule['name'])
            return expanded if expanded else rule

        # Recursively process conditions for and/or rules
        if rule_type in ['and', 'or']:
            if 'conditions' in rule:
                rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]

        return rule
    
    def postprocess_regions(self, multiworld, player: int):
        """Add Menu region if it doesn't exist."""
        try:
            # Get all regions for this player
            player_regions = [r for r in multiworld.get_regions() if r.player == player]
            
            # Check if Menu region exists
            menu_region = None
            for region in player_regions:
                if region.name == 'Menu':
                    menu_region = region
                    break
            
            # If Menu doesn't exist, we need to create it
            if not menu_region:
                logger.info(f"Creating Menu region for CvCotM player {player}")
                # Import the Region class from BaseClasses
                from BaseClasses import Region, Entrance
                
                # Create Menu region
                menu = Region('Menu', player, multiworld)
                multiworld.regions.append(menu)
                
                # Find the starting region (Catacomb)
                catacomb = None
                for region in player_regions:
                    if region.name == 'Catacomb':
                        catacomb = region
                        break
                
                if catacomb:
                    # Create an entrance from Menu to Catacomb
                    menu_to_catacomb = Entrance(player, 'Start Game', menu)
                    menu_to_catacomb.connect(catacomb)
                    menu.exits.append(menu_to_catacomb)
                    catacomb.entrances.append(menu_to_catacomb)
                    logger.info(f"Connected Menu to Catacomb for player {player}")
                else:
                    logger.warning(f"Could not find Catacomb region for player {player}")
                    
        except Exception as e:
            logger.error(f"Error in postprocess_regions for CvCotM: {e}")
    
    def post_process_regions(self, regions_data: Dict[str, Any], world_classes: Dict[str, str] = None) -> Dict[str, Any]:
        """Fix region data structure for CvCotM.

        Args:
            regions_data: Dictionary of player_id -> regions dictionary
            world_classes: Dictionary of player_id -> world class name, used to identify CvCotM players
        """
        # Determine which player IDs are playing CvCotM
        cvcotm_player_ids = set()
        if world_classes:
            for player_id, world_class in world_classes.items():
                if world_class == 'CVCotMWorld':
                    cvcotm_player_ids.add(player_id)
        else:
            # Fallback: if no world_classes provided, assume we should process any player
            # that has a 'Catacomb' region (CvCotM starting area)
            for player_id, player_regions in regions_data.items():
                if isinstance(player_regions, dict) and 'Catacomb' in player_regions:
                    cvcotm_player_ids.add(player_id)

        if not cvcotm_player_ids:
            # No CvCotM players found, return data as-is
            return regions_data

        # Process only CvCotM players, preserving all other players' data
        result = {}
        for player_id, player_regions in regions_data.items():
            if player_id not in cvcotm_player_ids:
                # Not a CvCotM player, preserve their regions as-is
                result[player_id] = player_regions
                continue

            if not isinstance(player_regions, dict):
                result[player_id] = player_regions
                continue

            # Process CvCotM player's regions
            formatted_regions = {}
            player_int = int(player_id) if player_id.isdigit() else 1

            # Add Menu region if it doesn't exist
            if 'Menu' not in player_regions:
                formatted_regions['Menu'] = {
                    'name': 'Menu',
                    'type': 'Region',
                    'player': player_int,
                    'entrances': [],
                    'exits': [
                        {
                            'name': 'Start Game',
                            'connected_region': 'Catacomb',
                            'access_rule': {
                                'type': 'constant',
                                'value': True
                            },
                            'reverse': None,
                            'randomization_type': 1,
                            'direction': None,
                            'type': 'Exit'
                        }
                    ],
                    'locations': [],
                    'time_passes': True,
                    'provides_chest_count': True
                }

                # Add entrance to Catacomb from Menu
                if 'Catacomb' in player_regions:
                    catacomb = player_regions['Catacomb']
                    if isinstance(catacomb, dict):
                        if 'entrances' not in catacomb or not catacomb['entrances']:
                            catacomb['entrances'] = []
                        # Check if entrance from Menu already exists
                        has_menu_entrance = any(e.get('parent_region') == 'Menu' for e in catacomb['entrances'] if isinstance(e, dict))
                        if not has_menu_entrance:
                            catacomb['entrances'].append({
                                'name': 'Start Game',
                                'parent_region': 'Menu',
                                'connected_region': 'Catacomb',
                                'reverse': None,
                                'assumed': False,
                                'randomization_type': 1,
                                'direction': None,
                                'type': 'Entrance'
                            })

            for region_name, region_data in player_regions.items():
                if isinstance(region_data, dict):
                    # Ensure region has required fields
                    if 'name' not in region_data:
                        region_data['name'] = region_name
                    if 'type' not in region_data:
                        region_data['type'] = 'Region'
                    if 'player' not in region_data:
                        region_data['player'] = player_int
                    if 'entrances' not in region_data:
                        region_data['entrances'] = []
                    if 'exits' not in region_data:
                        region_data['exits'] = []
                    if 'locations' not in region_data:
                        region_data['locations'] = []
                    if 'time_passes' not in region_data:
                        region_data['time_passes'] = True
                    if 'provides_chest_count' not in region_data:
                        region_data['provides_chest_count'] = True

                    formatted_regions[region_name] = region_data

            result[player_id] = formatted_regions

        return result
    
    def get_settings_data(self, world, multiworld, player: int) -> Dict[str, Any]:
        """Export CvCotM-specific settings."""
        # Get base settings from parent class
        settings = super().get_settings_data(world, multiworld, player)

        # Add all CvCotM-specific options that affect logic
        if hasattr(world, 'options'):
            options_to_export = [
                'nerf_roc_wing',
                'ignore_cleansing',
                'iron_maiden_behavior',
                'required_last_keys',
                'completion_goal',
            ]

            for option_name in options_to_export:
                if hasattr(world.options, option_name):
                    option_value = getattr(world.options, option_name)
                    # Extract the actual value from the option object
                    settings[option_name] = getattr(option_value, 'value', option_value)

        return settings

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process the exported data to fix any issues."""
        # Fix region data if needed
        if 'regions' in data:
            # Pass world_classes so we know which players are playing CvCotM
            world_classes = data.get('world_classes', {})
            data['regions'] = self.post_process_regions(data['regions'], world_classes)

        return data