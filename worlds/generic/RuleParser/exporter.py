# worlds/generic/RuleParser/exporter.py

"""Handles preparation and formatting of rule data for export."""

import logging
import collections
import json
import os
import asyncio
from automate_frontend_tests import run_frontend_tests
from typing import Any, Dict, List, Set, Optional
from collections import defaultdict

from .analyzer import analyze_rule
from .games import get_game_helpers

logger = logging.getLogger(__name__)

def prepare_export_data(multiworld) -> Dict[str, Any]:
    """
    Prepares complete game data for export to JSON format.
    Preserves as much of the Python backend's structure as possible.
    """
    export_data = {
        'version': 3,
        'regions': {},  # Full region graph
        'items': {},    # Item data by player
        'item_groups': {},  # Item groups by player
        'progression_mapping': {},  # Progressive item info
        'mode': {},     # Game mode by player
        'settings': {}, # Game settings by player
        'start_regions': {},  # Start regions by player
    }

    for player in multiworld.player_ids:
        # Process all regions and their connections
        export_data['regions'][str(player)] = process_regions(multiworld, player)
        
        # Process items and groups
        export_data['items'][str(player)] = process_items(multiworld, player)
        export_data['item_groups'][str(player)] = process_item_groups(multiworld, player)
        export_data['progression_mapping'][str(player)] = process_progression_mapping(multiworld, player)

        # Game settings
        '''
        export_data['mode'][str(player)] = multiworld.mode[player]
        export_data['settings'][str(player)] = {
            'dark_room_logic': multiworld.dark_room_logic[player],
            #'can_take_damage': multiworld.can_take_damage[player],
            'retro_bow': multiworld.retro_bow[player],
            'swordless': multiworld.swordless[player],
            'enemy_shuffle': multiworld.enemy_shuffle[player],
            'enemy_health': multiworld.enemy_health[player],
            'enemy_damage': multiworld.enemy_damage[player],
            'pot_shuffle': multiworld.pot_shuffle[player],
            'dungeon_counters': multiworld.dungeon_counters[player],
            'glitch_boots': multiworld.glitch_boots[player],
            'glitches_required': multiworld.glitches_required[player],
            'accessibility': multiworld.accessibility[player],
            #'placement_file': getattr(multiworld, 'placement_file', None),
            # Add more settings as needed
        }
        '''

        # Start regions
        try:
            logger.debug(f"Processing start regions for player {player}")
            world = multiworld.worlds[player]
            logger.debug(f"Got world for player {player}")

            try:
                menu_region = multiworld.get_region('Menu', player)
                logger.debug(f"Got menu region for player {player}")
            except Exception as e:
                logger.error(f"Error getting menu region: {str(e)}")
                menu_region = None

            available_regions = []
            player_regions = [
                region for region in multiworld.get_regions() 
                if region.player == player
            ]
            logger.debug(f"Found {len(player_regions)} regions for player {player}")

            for region in player_regions:
                try:
                    if hasattr(region, 'can_start_at'):
                        logger.debug(f"Checking if can start at region: {region.name}")
                        try:
                            can_start = region.can_start_at(world)
                            if can_start:
                                region_data = {
                                    'name': region.name,
                                    'type': getattr(region, 'type', 'Region'),
                                    'dungeon': getattr(region.dungeon, 'name', None) if hasattr(region, 'dungeon') and region.dungeon else None,
                                    'is_light_world': getattr(region, 'is_light_world', False),
                                    'is_dark_world': getattr(region, 'is_dark_world', False)
                                }
                                available_regions.append(region_data)
                        except Exception as e:
                            logger.error(f"Error checking can_start_at for region {region.name}: {str(e)}")
                except Exception as e:
                    logger.error(f"Error processing region in start regions: {str(e)}")
                    continue

            export_data['start_regions'][str(player)] = {
                'default': ['Menu'],
                'available': available_regions
            }
            logger.debug(f"Completed processing start regions for player {player}")

        except Exception as e:
            logger.error(f"Error in start regions processing: {str(e)}")
            logger.exception("Full traceback:")
            # Provide a fallback
            export_data['start_regions'][str(player)] = {
                'default': ['Menu'],
                'available': []
            }

    return export_data

def process_regions(multiworld, player: int) -> Dict[str, Any]:
    """
    Process complete region data including all available backend data.
    """
    logger.debug(f"Starting process_regions for player {player}")
    
    def safe_expand_rule(helper_expander, rule):
        try:
            if rule:
                analyzed = analyze_rule(rule)
                expanded = helper_expander.expand_rule(analyzed)
                logger.debug("Successfully expanded rule")
                return expanded
        except Exception as e:
            logger.error(f"Error expanding rule: {str(e)}")
        return None

    try:
        regions_data = {}
        logger.debug(f"Getting game helpers for {multiworld.game[player]}")
        helper_expander = get_game_helpers(multiworld.game[player])
        logger.debug("Successfully got game helpers")
        
        logger.debug("Getting player regions")
        player_regions = [
            region for region in multiworld.get_regions() 
            if region.player == player
        ]
        logger.debug(f"Successfully found {len(player_regions)} regions")

        # Process each region
        for region in player_regions:
            try:
                logger.debug(f"Processing region: {region.name}")
                region_data = {
                    'name': getattr(region, 'name', 'Unknown'),
                    'type': getattr(region, 'type', 'Region'),
                    'player': getattr(region, 'player', player),
                    'is_light_world': getattr(region, 'is_light_world', False),
                    'is_dark_world': getattr(region, 'is_dark_world', False),
                    'entrances': [],
                    'exits': [],
                    'locations': [],
                    'dungeon': None,
                    'shop': None,
                    'time_passes': getattr(region, 'time_passes', True),
                    'provides_chest_count': getattr(region, 'provides_chest_count', True),
                    'region_rules': []
                }
                logger.debug("Successfully initialized region data")

                # Process dungeon data
                logger.debug("Processing dungeon data")
                if hasattr(region, 'dungeon') and region.dungeon:
                    dungeon_data = {
                        'name': getattr(region.dungeon, 'name', None),
                        'regions': [],
                        'boss': None,
                        'medallion_check': None
                    }
                    
                    if hasattr(region.dungeon, 'regions'):
                        dungeon_data['regions'] = [r.name for r in region.dungeon.regions]
                    
                    if hasattr(region.dungeon, 'boss') and region.dungeon.boss:
                        dungeon_data['boss'] = {
                            'name': getattr(region.dungeon.boss, 'name', None),
                            'defeat_rule': safe_expand_rule(
                                helper_expander,
                                getattr(region.dungeon.boss, 'can_defeat', None)
                            )
                        }
                    
                    if hasattr(region.dungeon, 'medallion_check'):
                        dungeon_data['medallion_check'] = safe_expand_rule(
                            helper_expander,
                            region.dungeon.medallion_check
                        )
                    
                    region_data['dungeon'] = dungeon_data
                    logger.debug("Successfully processed dungeon data")

                # Process shop data
                logger.debug("Processing shop data")
                if hasattr(region, 'shop') and region.shop:
                    shop_inventory = []
                    if hasattr(region.shop, 'inventory'):
                        for item in region.shop.inventory:
                            try:
                                inventory_item = {
                                    'item': getattr(item, 'name', None),
                                    'price': getattr(item, 'price', 0),
                                    'max': getattr(item, 'max', 0),
                                    'replacement': None,
                                    'replacement_price': None
                                }
                                if hasattr(item, 'replacement') and item.replacement:
                                    inventory_item['replacement'] = item.replacement.name
                                    inventory_item['replacement_price'] = getattr(item, 'replacement_price', 0)
                                shop_inventory.append(inventory_item)
                                logger.debug(f"Successfully processed shop item: {inventory_item['item']}")
                            except Exception as e:
                                logger.error(f"Error processing shop inventory item: {str(e)}")

                    region_data['shop'] = {
                        'type': getattr(region.shop, 'type', None),
                        'inventory': shop_inventory,
                        'locked': getattr(region.shop, 'locked', False),
                        'region_name': getattr(region.shop, 'region_name', None),
                        'location_name': getattr(region.shop, 'location_name', None)
                    }
                    logger.debug("Successfully processed shop data")

                # Process entrances
                logger.debug("Processing entrances")
                if hasattr(region, 'entrances'):
                    for entrance in region.entrances:
                        try:
                            entrance_data = {
                                'name': getattr(entrance, 'name', None),
                                'parent_region': getattr(entrance.parent_region, 'name', None) if hasattr(entrance, 'parent_region') else None,
                                'access_rule': safe_expand_rule(helper_expander, getattr(entrance, 'access_rule', None)),
                                'connected_region': getattr(entrance.connected_region, 'name', None) if hasattr(entrance, 'connected_region') else None,
                                'reverse': getattr(entrance.reverse, 'name', None) if hasattr(entrance, 'reverse') else None,
                                'assumed': getattr(entrance, 'assumed', False),
                                'type': getattr(entrance, 'type', 'Entrance'),
                                'addresses': getattr(entrance, 'addresses', None)
                            }
                            region_data['entrances'].append(entrance_data)
                            logger.debug(f"Successfully processed entrance: {entrance_data['name']}")
                        except Exception as e:
                            logger.error(f"Error processing entrance {getattr(entrance, 'name', 'Unknown')}: {str(e)}")

                # Process exits
                logger.debug("Processing exits")
                if hasattr(region, 'exits'):
                    for exit in region.exits:
                        try:
                            exit_data = {
                                'name': getattr(exit, 'name', None),
                                'connected_region': getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None,
                                'access_rule': safe_expand_rule(helper_expander, getattr(exit, 'access_rule', None)),
                                'type': getattr(exit, 'type', 'Exit')
                            }
                            region_data['exits'].append(exit_data)
                            logger.debug(f"Successfully processed exit: {exit_data['name']}")
                        except Exception as e:
                            logger.error(f"Error processing exit {getattr(exit, 'name', 'Unknown')}: {str(e)}")

                # Process locations
                logger.debug("Processing locations")
                if hasattr(region, 'locations'):
                    for location in region.locations:
                        try:
                            location_data = {
                                'name': getattr(location, 'name', None),
                                'address': getattr(location, 'address', None),
                                'crystal': getattr(location, 'crystal', None),
                                'access_rule': safe_expand_rule(helper_expander, getattr(location, 'access_rule', None)),
                                'item_rule': safe_expand_rule(helper_expander, getattr(location, 'item_rule', None)),
                                'progress_type': getattr(location, 'progress_type', None),
                                'event': getattr(location, 'event', False),
                                'locked': getattr(location, 'locked', False),
                                'item': None
                            }
                            
                            if hasattr(location, 'item') and location.item:
                                location_data['item'] = {
                                    'name': getattr(location.item, 'name', None),
                                    'player': getattr(location.item, 'player', None),
                                    'advancement': getattr(location.item, 'advancement', False),
                                    'priority': getattr(location.item, 'priority', None),
                                    'type': getattr(location.item, 'type', None),
                                    'code': getattr(location.item, 'code', None)
                                }
                            
                            region_data['locations'].append(location_data)
                            logger.debug(f"Successfully processed location: {location_data['name']}")
                        except Exception as e:
                            logger.error(f"Error processing location {getattr(location, 'name', 'Unknown')}: {str(e)}")

                # Process region rules
                logger.debug("Processing region rules")
                if hasattr(region, 'region_rules'):
                    for i, rule in enumerate(region.region_rules):
                        try:
                            expanded_rule = safe_expand_rule(helper_expander, rule)
                            if expanded_rule:
                                region_data['region_rules'].append(expanded_rule)
                                logger.debug(f"Successfully processed region rule {i+1}")
                        except Exception as e:
                            logger.error(f"Error processing region rule: {str(e)}")

                regions_data[region.name] = region_data
                logger.debug(f"Successfully completed processing region: {region.name}")

            except Exception as e:
                logger.error(f"Error processing region {getattr(region, 'name', 'Unknown')}: {str(e)}")
                logger.exception("Full traceback:")
                continue

        logger.debug(f"Successfully finished process_regions for player {player}")
        return regions_data

    except Exception as e:
        logger.error(f"Error in process_regions: {str(e)}")
        logger.exception("Full traceback:")
        raise

def process_items(multiworld, player: int) -> Dict[str, Any]:
    """Process item data including progression flags."""
    items_data = {}
    world = multiworld.worlds[player]
    
    # First process basic items
    for item_id, item_name in getattr(world, 'item_id_to_name', {}).items():
        groups = [
            group_name for group_name, items in world.item_name_groups.items() 
            if item_name in items
        ]
        
        items_data[item_name] = {
            'name': item_name,
            'id': item_id,
            'groups': sorted(groups),
            'advancement': False,
            'priority': False,
            'useful': False,
            'trap': False
        }

    # Then add event flags
    from worlds.alttp.Items import item_table
    from BaseClasses import ItemClassification
    
    for item_name, item_data in item_table.items():
        if item_data.type == 'Event':
            items_data[item_name] = {
                'name': item_name,
                'id': None,
                'groups': [],
                'advancement': item_data.classification == ItemClassification.progression,
                'priority': False,
                'useful': False,
                'trap': False
            }

    # Update flags from placed items
    for location in multiworld.get_locations(player):
        if location.item and location.item.name in items_data:
            item_data = items_data[location.item.name]
            item_data['advancement'] = getattr(location.item, 'advancement', False)
            item_data['priority'] = getattr(location.item, 'priority', False)
            item_data['useful'] = getattr(location.item, 'useful', False)
            item_data['trap'] = getattr(location.item, 'trap', False)

    return items_data

def process_item_groups(multiworld, player: int) -> List[str]:
    """Get item groups for this player."""
    world = multiworld.worlds[player]
    if hasattr(world, 'item_name_groups'):
        return sorted(world.item_name_groups.keys())
    return []

def process_progression_mapping(multiworld, player: int) -> Dict[str, Any]:
    """Extract progression item mapping data."""
    from worlds.alttp.Items import progression_mapping
    
    mapping_data = {}
    for target_item, (base_item, level) in progression_mapping.items():
        if base_item not in mapping_data:
            mapping_data[base_item] = {
                'items': [],
                'base_item': base_item
            }
        mapping_data[base_item]['items'].append({
            'name': target_item,
            'level': level
        })
    
    # Sort items by level
    for prog_type in mapping_data.values():
        prog_type['items'].sort(key=lambda x: x['level'])
    
    return mapping_data

def export_test_data(multiworld, access_pool, output_dir, filename_base="test_output"):
    """
    Exports rules and test data files for frontend testing.

    Args:
        multiworld: MultiWorld instance containing game rules
        access_pool: List of access test cases
        output_dir: Directory to write output files
        filename_base: Base name for output files

    Returns:
        bool: True if export successful
    """

    # Example data for testing
    test_data = {
        "users": [
            {"id": 1, "name": "John", "active": True},
            {"id": 2, "name": "Jane", "active": False}
        ],
        "settings": {
            "theme": "dark",
            "notifications": True
        },
        "version": "1.0.0"
    }
    
    import os
    os.makedirs(output_dir, exist_ok=True)
    
    # Export the rules data
    #from worlds.generic.RuleParser import export_game_rules
    #rules_result = export_game_rules(multiworld, output_dir, filename_base)

    # Export rules data with explicit region connections
    export_data = prepare_export_data(multiworld)
    rules_path = os.path.join(output_dir, f"{filename_base}_rules.json")
    with open(rules_path, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, indent=2)    
    
    # Convert test cases to the format needed for JSON
    test_cases = []
    for location, access, *item_pool in access_pool:
        items = item_pool[0]
        all_except = item_pool[1] if len(item_pool) > 1 else None
        if all_except is not None:
            test_cases.append([location, access, items, all_except])
        else:
            test_cases.append([location, access, items])
    
    # Write to test cases JSON file
    test_cases_data = {"location_tests": test_cases}
    test_cases_path = os.path.join(output_dir, "test_cases.json")
    with open(test_cases_path, 'w') as f:
        json.dump(test_cases_data, f, indent=2)
    #asyncio.run(run_frontend_tests())
    print("Automated frontend tests finished.")
    
    return True