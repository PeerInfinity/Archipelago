"""Dark Souls III game-specific exporter."""

from typing import Dict, Any, List, Optional
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class DarkSouls3GameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Dark Souls III'
    """Dark Souls III-specific export handler."""
    
    def __init__(self, world):
        """Initialize handler with world reference."""
        super().__init__()
        self.world = world
        self.player = world.player if hasattr(world, 'player') else 1
        
    def get_static_game_data(self) -> Dict[str, Any]:
        """Get static game-specific data."""
        data = {}
        
        # Import Dark Souls III specific data
        try:
            from worlds.dark_souls_3.Locations import location_tables, location_dictionary
            from worlds.dark_souls_3.Items import item_dictionary
            
            # Export location tables with proper region associations
            data['location_tables'] = {}
            for region_name, locations in location_tables.items():
                data['location_tables'][region_name] = []
                for location in locations:
                    loc_data = {
                        'name': location.name,
                        'id': location.ap_code if hasattr(location, 'ap_code') else None,
                        'region': region_name,
                    }
                    if hasattr(location, 'default_item_name'):
                        loc_data['default_item'] = location.default_item_name
                    if hasattr(location, 'missable'):
                        loc_data['missable'] = location.missable
                    if hasattr(location, 'dlc'):
                        loc_data['dlc'] = location.dlc
                    if hasattr(location, 'ngp'):
                        loc_data['ngp'] = location.ngp
                    data['location_tables'][region_name].append(loc_data)
            
            # Export item dictionary
            data['items'] = {}
            for item_name, item in item_dictionary.items():
                data['items'][item_name] = {
                    'name': item_name,
                    'id': item.ap_code if hasattr(item, 'ap_code') else None,
                    'classification': item.classification.value if hasattr(item, 'classification') else None,
                    'ds3_code': item.ds3_code if hasattr(item, 'ds3_code') else None,
                    'count': item.count if hasattr(item, 'count') else 1,
                    'unique': item.unique if hasattr(item, 'unique') else False,
                    'skip': item.skip if hasattr(item, 'skip') else False,
                }
        except ImportError as e:
            logger.warning(f"Could not import Dark Souls III data: {e}")
        
        return data
    
    def get_regions(self) -> Dict[str, Any]:
        """Override to get proper region data for Dark Souls III."""
        regions = {}
        
        # Define the static list of regions from Dark Souls III
        region_names = [
            "Menu",
            "Cemetery of Ash", 
            "Firelink Shrine",
            "Firelink Shrine Bell Tower",
            "High Wall of Lothric",
            "Undead Settlement",
            "Road of Sacrifices",
            "Cathedral of the Deep",
            "Farron Keep",
            "Catacombs of Carthus",
            "Smouldering Lake",
            "Irithyll of the Boreal Valley",
            "Irithyll Dungeon",
            "Profaned Capital",
            "Anor Londo",
            "Lothric Castle",
            "Consumed King's Garden",
            "Grand Archives",
            "Untended Graves",
            "Archdragon Peak",
            "Kiln of the First Flame",
            "Greirat's Shop",
            "Karla's Shop",
        ]
        
        # Add DLC regions if enabled
        if hasattr(self.world, 'options') and hasattr(self.world.options, 'enable_dlc'):
            if self.world.options.enable_dlc:
                region_names.extend([
                    "Painted World of Ariandel (Before Contraption)",
                    "Painted World of Ariandel (After Contraption)",
                    "Dreg Heap",
                    "Ringed City",
                ])
        
        # Create region structure with connections
        for region_name in region_names:
            regions[region_name] = {
                'name': region_name,
                'entrances': []
            }
        
        # Define connections based on the game structure
        connections = [
            ("Menu", "Cemetery of Ash"),
            ("Cemetery of Ash", "Firelink Shrine"),
            ("Firelink Shrine", "High Wall of Lothric"),
            ("Firelink Shrine", "Firelink Shrine Bell Tower"),
            ("Firelink Shrine", "Kiln of the First Flame"),
            ("High Wall of Lothric", "Undead Settlement"),
            ("High Wall of Lothric", "Lothric Castle"),
            ("High Wall of Lothric", "Greirat's Shop"),
            ("Undead Settlement", "Road of Sacrifices"),
            ("Road of Sacrifices", "Cathedral of the Deep"),
            ("Road of Sacrifices", "Farron Keep"),
            ("Farron Keep", "Catacombs of Carthus"),
            ("Catacombs of Carthus", "Irithyll of the Boreal Valley"),
            ("Catacombs of Carthus", "Smouldering Lake"),
            ("Irithyll of the Boreal Valley", "Irithyll Dungeon"),
            ("Irithyll of the Boreal Valley", "Anor Londo"),
            ("Irithyll Dungeon", "Archdragon Peak"),
            ("Irithyll Dungeon", "Profaned Capital"),
            ("Irithyll Dungeon", "Karla's Shop"),
            ("Lothric Castle", "Consumed King's Garden"),
            ("Lothric Castle", "Grand Archives"),
            ("Consumed King's Garden", "Untended Graves"),
        ]
        
        # Add DLC connections if enabled
        if hasattr(self.world, 'options') and hasattr(self.world.options, 'enable_dlc'):
            if self.world.options.enable_dlc:
                connections.extend([
                    ("Cathedral of the Deep", "Painted World of Ariandel (Before Contraption)"),
                    ("Painted World of Ariandel (Before Contraption)", "Painted World of Ariandel (After Contraption)"),
                    ("Painted World of Ariandel (After Contraption)", "Dreg Heap"),
                    ("Dreg Heap", "Ringed City"),
                ])
        
        # Add entrance data to regions
        for from_region, to_region in connections:
            if from_region in regions and to_region in regions:
                regions[from_region]['entrances'].append({
                    'name': f"{from_region} -> {to_region}",
                    'destination': to_region,
                    'rule': None  # Will be filled by rule processing
                })
        
        return regions
    
    def override_rule_analysis(self, rule_func, rule_target_name: str = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for Dark Souls III specific rules."""
        # Let the default analyzer handle the rule
        return None
    
    def postprocess_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Postprocess rules to fix self._can_get and self._can_go_to references."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle helper type references to _can_get and _can_go_to
        if rule.get('type') == 'helper':
            name = rule.get('name')
            args = rule.get('args', [])

            # Handle _can_get(location) -> location_check
            if name == '_can_get' and args and len(args) > 0:
                location_arg = args[0]
                if location_arg.get('type') == 'constant':
                    return {
                        'type': 'location_check',
                        'location': {
                            'type': 'constant',
                            'value': location_arg.get('value')
                        }
                    }

            # Handle _can_go_to(region) -> can_reach
            elif name == '_can_go_to' and args and len(args) > 0:
                region_arg = args[0]
                if region_arg.get('type') == 'constant':
                    return {
                        'type': 'can_reach',
                        'region': {
                            'type': 'constant',
                            'value': region_arg.get('value')
                        }
                    }

        # Handle function calls to self._can_get and self._can_go_to
        if rule.get('type') == 'function_call':
            func = rule.get('function', {})
            if (func.get('type') == 'attribute' and
                func.get('object', {}).get('type') == 'name' and
                func.get('object', {}).get('name') == 'self'):

                attr = func.get('attr')
                args = rule.get('args', [])

                # Handle self._can_get(location)
                if attr == '_can_get' and args and len(args) > 0:
                    # Skip the state argument, get the location name
                    location_arg = args[-1] if len(args) > 1 else args[0]
                    if location_arg.get('type') == 'constant':
                        # Convert to location_check
                        return {
                            'type': 'location_check',
                            'location': {
                                'type': 'constant',
                                'value': location_arg.get('value')
                            }
                        }

                # Handle self._can_go_to(region)
                elif attr == '_can_go_to' and args and len(args) > 0:
                    # Skip the state argument, get the region name
                    region_arg = args[-1] if len(args) > 1 else args[0]
                    if region_arg.get('type') == 'constant':
                        # Convert to can_reach (region reachability check)
                        return {
                            'type': 'can_reach',
                            'region': {
                                'type': 'constant',
                                'value': region_arg.get('value')
                            }
                        }

        # Recursively process nested rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.postprocess_rule(cond) for cond in rule.get('conditions', [])]
        elif rule.get('type') == 'not':
            rule['condition'] = self.postprocess_rule(rule.get('condition'))

        return rule
    
    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: str = None) -> Dict[str, Any]:
        """Postprocess entrance rules to fix self._can_get references."""
        return self.postprocess_rule(rule)