# exporter/exporter.py

"""Handles preparation and formatting of rule data for export."""

import logging
import collections
import json
import os
import asyncio
import inspect
import shutil
import datetime  # Added import
from automate_frontend_tests import run_frontend_tests
from typing import Any, Dict, List, Set, Optional
from collections import defaultdict
import ast

import Utils  # Added import
from .analyzer import analyze_rule, LambdaFinder # Import LambdaFinder
from .games import get_game_export_handler

logger = logging.getLogger(__name__)

# Create a dedicated debug file for mode and settings data
def debug_mode_settings(message, data=None):
    """Write debug information about mode and settings to a dedicated file."""
    with open("debug_mode_settings.txt", "a") as debug_file:
        debug_file.write(f"{message}\n")
        if data is not None:
            debug_file.write(f"  Data: {data}\n")
            debug_file.write(f"  Type: {type(data)}\n")
            
            # For dictionaries, show keys and some values
            if isinstance(data, dict):
                debug_file.write(f"  Keys: {list(data.keys())}\n")
                # If it has mode or settings, show those specifically
                for key in ['mode', 'settings']:
                    if key in data:
                        debug_file.write(f"  {key}: {data[key]}\n")
                        debug_file.write(f"  {key} type: {type(data[key])}\n")
                        
                        # If this is also a dictionary, go one level deeper
                        if isinstance(data[key], dict):
                            for subkey, value in data[key].items():
                                debug_file.write(f"  {key}[{subkey}]: {value}\n")
                                debug_file.write(f"  {key}[{subkey}] type: {type(value)}\n")
                                
                                # For objects with helpful attributes
                                if hasattr(value, 'value'):
                                    debug_file.write(f"  {key}[{subkey}].value: {value.value}\n")
                                if hasattr(value, '__dict__'):
                                    debug_file.write(f"  {key}[{subkey}].__dict__: {value.__dict__}\n")
            
            # For objects with helpful attributes
            if hasattr(data, 'value'):
                debug_file.write(f"  .value: {data.value}\n")
            if hasattr(data, '__dict__'):
                debug_file.write(f"  .__dict__: {data.__dict__}\n")
        
        debug_file.write("\n")  # Add a blank line for readability

def is_serializable(obj):
    """Check if an object can be serialized to JSON."""
    try:
        json.dumps(obj)
        return True
    except (TypeError, OverflowError, ValueError):
        return False

def make_serializable(obj):
    """
    Recursively convert an object to be JSON serializable.
    Extracts values from enums and custom objects intelligently.
    """
    # Only log top-level field processing (not recursive calls)
    if isinstance(obj, dict) and ('mode' in obj or 'settings' in obj):
        debug_mode_settings("make_serializable: processing dictionary with mode/settings", 
                          {"has_mode": 'mode' in obj, 
                           "has_settings": 'settings' in obj})
        
        if 'mode' in obj:
            debug_mode_settings("make_serializable: mode field", obj['mode'])
            
            # If mode is not a dictionary, log this but don't modify
            # The cleanup function can handle it with proper error messages
            if not isinstance(obj['mode'], dict):
                debug_mode_settings("WARNING: mode is not a dictionary", 
                                  {"type": type(obj['mode']), "value": obj['mode']})
            
            # Now log the mode value details for each player
            if isinstance(obj['mode'], dict):
                for player, mode_value in obj['mode'].items():
                    debug_mode_settings(f"mode[{player}] details", 
                                     {"type": type(mode_value), 
                                      "value": mode_value,
                                      "has_value_attr": hasattr(mode_value, 'value'),
                                      "has_dict_attr": hasattr(mode_value, '__dict__')})
                    
                    if hasattr(mode_value, 'value'):
                        debug_mode_settings(f"mode[{player}].value", mode_value.value)
                    if hasattr(mode_value, '__dict__'):
                        debug_mode_settings(f"mode[{player}].__dict__", mode_value.__dict__)
    
    # Handle basic types directly
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    
    # Handle dictionaries
    if isinstance(obj, dict):
        serialized_dict = {str(k): make_serializable(v) for k, v in obj.items()}
        
        # Debug the mode field if present after serialization
        if 'mode' in serialized_dict:
            debug_mode_settings("make_serializable: mode after dict processing", 
                              {"type": type(serialized_dict['mode']), 
                               "value": serialized_dict['mode']})
            
            # Special check for when mode is not a dict anymore
            if not isinstance(serialized_dict['mode'], dict):
                debug_mode_settings("ERROR: mode is not a dictionary anymore", serialized_dict['mode'])
                # Don't try to fix - just log the issue
        
        # Check for mode in settings and log information
        if 'settings' in serialized_dict and isinstance(serialized_dict['settings'], dict):
            for player, settings in serialized_dict['settings'].items():
                if isinstance(settings, dict) and 'mode' in settings:
                    debug_mode_settings(f"settings[{player}]['mode']", 
                                     {"type": type(settings['mode']), 
                                      "value": settings['mode']})
        
        return serialized_dict
    
    # Handle lists, tuples, and sets
    if isinstance(obj, (list, tuple, set)):
        return [make_serializable(i) for i in obj]
    
    # Handle objects with __dict__ attribute (custom classes)
    if hasattr(obj, '__dict__'):
        # Debug for special objects related to mode or settings
        if str(obj).lower().find('mode') >= 0 or str(type(obj)).lower().find('mode') >= 0:
            debug_mode_settings("Processing mode-related object", 
                              {"type": type(obj), 
                               "str_rep": str(obj),
                               "has_value": hasattr(obj, 'value')})
                    
        # First check for value attribute (common in enums)
        if hasattr(obj, 'value'):
            return make_serializable(obj.value)
        
        # Try to extract value from string representation like "Type(Value)"
        str_rep = str(obj)
        if '(' in str_rep and ')' in str_rep:
            try:
                # Extract value inside parentheses
                extracted = str_rep.split('(', 1)[1].split(')', 1)[0]
                
                # For mode-related objects, log the extraction
                if str_rep.lower().find('mode') >= 0:
                    debug_mode_settings("Extracted value from mode parentheses", extracted)
                
                # Try to convert to appropriate type
                if extracted.lower() in ('yes', 'no', 'true', 'false'):
                    return extracted.lower() == 'yes' or extracted.lower() == 'true'
                elif extracted.isdigit():
                    return int(extracted)
                else:
                    return extracted
            except Exception as e:
                # If extraction fails, log and use string representation
                if str_rep.lower().find('mode') >= 0:
                    debug_mode_settings(f"Failed to extract mode value: {str(e)}", str_rep)
                return str_rep
        
        # If no special handling applies, use string representation
        return str_rep
    
    # If all else fails, convert to string
    if not is_serializable(obj):
        return str(obj)
    
    return obj

def debug_export_data(data, prefix=""):
    """
    Recursively checks each field of the export data to find non-serializable parts.
    Logs detailed information about which fields might be causing issues.
    """
    if isinstance(data, dict):
        for key, value in data.items():
            current_path = f"{prefix}.{key}" if prefix else str(key)
            try:
                # Try to serialize just this item
                json.dumps({key: value})
                # If it succeeded, go deeper
                debug_export_data(value, current_path)
            except (TypeError, OverflowError, ValueError) as e:
                logger.error(f"Non-serializable field at {current_path}: {str(e)}")
                # Try to diagnose deeper
                debug_export_data(value, current_path)
    elif isinstance(data, (list, tuple)):
        for i, item in enumerate(data):
            current_path = f"{prefix}[{i}]"
            try:
                json.dumps(item)
                debug_export_data(item, current_path)
            except (TypeError, OverflowError, ValueError) as e:
                logger.error(f"Non-serializable item at {current_path}: {str(e)}")
                debug_export_data(item, current_path)
    else:
        # For leaf nodes, just check if they're serializable
        try:
            json.dumps(data)
        except (TypeError, OverflowError, ValueError) as e:
            logger.error(f"Non-serializable value at {prefix}: {data} (type: {type(data)}) - {str(e)}")

def write_field_by_field(export_data, filepath):
    """
    Tries to write each major section of the export_data to the file separately,
    to ensure at least some data is saved even if one section is problematic.
    """
    debug_mode_settings("Starting write_field_by_field")
    serializable_data = {"version": export_data.get("version", 1)}
    fields_written = []
    
    # Try each field separately
    for field in ["regions", "items", "item_groups", "progression_mapping", "mode", "settings", "start_regions", "game_info", "itempool_counts"]:
        if field in export_data:
            try:
                debug_mode_settings(f"Processing field: {field}")
                serializable_field = make_serializable(export_data[field])
                # Test if it's serializable
                json.dumps(serializable_field)
                serializable_data[field] = serializable_field
                fields_written.append(field)
                logger.info(f"Successfully processed field: {field}")
                debug_mode_settings(f"Successfully processed field: {field}")
            except Exception as e:
                error_msg = f"Failed to process field {field}: {str(e)}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
                
                # For complex fields, try to process each player separately
                if field in ["mode", "settings", "game_info"] and isinstance(export_data.get(field, {}), dict):
                    debug_mode_settings(f"Attempting to process {field} player by player")
                    # Initialize with empty dict
                    serializable_data[field] = {}
                    
                    # Try each player separately
                    for player_id in export_data.get(field, {}):
                        try:
                            debug_mode_settings(f"Processing {field} for player {player_id}")
                            player_data = make_serializable(export_data[field][player_id])
                            json.dumps(player_data)  # Test serialization
                            serializable_data[field][player_id] = player_data
                            logger.info(f"Added {field} data for player {player_id}")
                            debug_mode_settings(f"Successfully processed {field} for player {player_id}", player_data)
                        except Exception as player_error:
                            error_msg = f"Failed to process {field} for player {player_id}: {str(player_error)}"
                            logger.error(error_msg)
                            debug_mode_settings(f"ERROR: {error_msg}")
                            # Use error message instead of default
                            serializable_data[field][player_id] = f"ERROR: {error_msg}"
    
    # Debug the final serializable data
    debug_mode_settings("Final serializable data structure", 
                       {"keys": list(serializable_data.keys())})
    
    # Write what we have
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(serializable_data, f, indent=2)
        logger.info(f"Wrote partial data ({', '.join(fields_written)}) to {filepath}")
        debug_mode_settings(f"Successfully wrote partial data to {filepath}", fields_written)
        return True
    except Exception as e:
        error_msg = f"Failed to write even partial data: {str(e)}"
        logger.error(error_msg)
        debug_mode_settings(f"ERROR: {error_msg}")
        return False

def prepare_export_data(multiworld) -> Dict[str, Any]:
    """
    Prepares complete game data for export to JSON format.
    Preserves as much of the Python backend's structure as possible.
    """
    # Start with a clean debug file
    with open("debug_mode_settings.txt", "w") as debug_file:
        debug_file.write(f"DEBUG - Starting prepare_export_data\n")
        debug_file.write(f"DEBUG - multiworld attributes: {dir(multiworld)}\n")
        debug_file.write(f"DEBUG - player_ids: {multiworld.player_ids}\n")
        
    # Debug the mode attribute specifically
    if hasattr(multiworld, 'mode'):
        debug_mode_settings("Examining multiworld.mode", multiworld.mode)
        # Check the first player's mode if available
        if multiworld.player_ids and multiworld.player_ids[0] in multiworld.mode:
            first_player = multiworld.player_ids[0]
            debug_mode_settings(f"Examining mode for player {first_player}", multiworld.mode[first_player])
    else:
        debug_mode_settings("WARNING: multiworld has no 'mode' attribute")
    
    export_data = {
        "schema_version": 3,  # Schema version for the export format
        "archipelago_version": Utils.__version__,
        "generation_seed": multiworld.seed,
        #"export_timestamp": datetime.datetime.now().isoformat(),
        "player_names": multiworld.player_name, # Player ID -> Name mapping
        "plando_options": [option.name for option in multiworld.plando_options], # Active plando options
        "world_classes": {player: multiworld.worlds[player].__class__.__name__ 
                           for player in multiworld.player_ids}, # Player ID -> World Class Name mapping
        'regions': {},  # Full region graph
        'items': {},    # Item data by player
        'item_groups': {},  # Item groups by player
        'progression_mapping': {},  # Progressive item info
        'mode': {},     # Game mode by player
        'settings': {}, # Game settings by player
        'start_regions': {},  # Start regions by player
        'itempool_counts': {},  # NEW: Complete itempool counts by player
        'game_info': {},  # NEW: Game-specific information for frontend
    }

    for player in multiworld.player_ids:
        # Process all regions and their connections
        export_data['regions'][str(player)] = process_regions(multiworld, player)
        
        # Process items and groups
        export_data['items'][str(player)] = process_items(multiworld, player)
        export_data['item_groups'][str(player)] = process_item_groups(multiworld, player)
        export_data['progression_mapping'][str(player)] = process_progression_mapping(multiworld, player)

        # NEW: Get game-specific information if available
        world = multiworld.worlds[player]
        
        # First try to get game info from the world object
        if hasattr(world, 'get_game_info') and callable(getattr(world, 'get_game_info')):
            try:
                export_data['game_info'][str(player)] = world.get_game_info()
                debug_mode_settings(f"Added game_info from world for player {player}", export_data['game_info'][str(player)])
            except Exception as e:
                error_msg = f"Error getting game_info from world for player {player}: {str(e)}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
        else:
            # Try to get game info from the helper expander
            try:
                game_handler = get_game_export_handler(multiworld.game[player])
                if hasattr(game_handler, 'get_game_info') and callable(getattr(game_handler, 'get_game_info')):
                    export_data['game_info'][str(player)] = game_handler.get_game_info()
                    debug_mode_settings(f"Added game_info from helper for player {player}", export_data['game_info'][str(player)])
                else:
                    # Default game info structure if not provided by game or helper
                    export_data['game_info'][str(player)] = {
                        "name": multiworld.game[player],
                        "rule_format": {
                            "version": "1.0"
                        }
                    }
            except Exception as e:
                error_msg = f"Error getting game helper for player {player}: {str(e)}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
                # Fallback to default
                export_data['game_info'][str(player)] = {
                    "name": multiworld.game[player],
                    "rule_format": {
                        "version": "1.0"
                    }
                }

        # NEW: Process complete itempool data
        try:
            # Count all items in the itempool
            itempool_counts = collections.defaultdict(int)
            
            # Process main itempool
            for item in multiworld.itempool:
                if item.player == player:
                    itempool_counts[item.name] += 1
            
            # Add pre-collected items 
            if hasattr(multiworld, 'precollected_items'):
                for item in multiworld.precollected_items.get(player, []):
                    itempool_counts[item.name] += 1
            
            # Process already placed items in locations
            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    itempool_counts[location.item.name] += 1
            
            # Add dungeon-specific items like keys
            world = multiworld.worlds[player]
            if hasattr(world, 'dungeons'):
                for dungeon in world.dungeons:
                    dungeon_name = getattr(dungeon, 'name', '')
                    if dungeon_name:
                        # Count small keys
                        small_key_name = f'Small Key ({dungeon_name})'
                        if hasattr(dungeon, 'small_key_count'):
                            small_key_count = dungeon.small_key_count
                            if small_key_count > 0 and small_key_name not in itempool_counts:
                                itempool_counts[small_key_name] = small_key_count
                        
                        # Add big key
                        big_key_name = f'Big Key ({dungeon_name})'
                        if hasattr(dungeon, 'big_key') and dungeon.big_key and big_key_name not in itempool_counts:
                            itempool_counts[big_key_name] = 1
            
            # Ensure we include data about item maximums from difficulty_requirements
            if hasattr(world, 'difficulty_requirements'):
                # Add these as special maximum values, not actual counts
                if hasattr(world.difficulty_requirements, 'progressive_bottle_limit'):
                    itempool_counts['__max_progressive_bottle'] = world.difficulty_requirements.progressive_bottle_limit
                if hasattr(world.difficulty_requirements, 'boss_heart_container_limit'):
                    itempool_counts['__max_boss_heart_container'] = world.difficulty_requirements.boss_heart_container_limit
                if hasattr(world.difficulty_requirements, 'heart_piece_limit'):
                    itempool_counts['__max_heart_piece'] = world.difficulty_requirements.heart_piece_limit

            # sort the itempool counts by item name
            itempool_counts = dict(sorted(itempool_counts.items(), key=lambda x: x[0]))
            
            export_data['itempool_counts'][str(player)] = dict(itempool_counts)
            
        except Exception as e:
            error_msg = f"Error exporting itempool counts for player {player}: {str(e)}"
            logger.error(error_msg)
            debug_mode_settings(f"ERROR: {error_msg}")
            export_data['itempool_counts'][str(player)] = {
                'error': error_msg,
                'details': "Failed to read itempool counts. Check logs for more information."
            }

        # Game settings
        try:
            # Build settings dictionary with direct value extraction
            settings_dict = {}
            
            # Add game information
            settings_dict['game'] = multiworld.game[player]
            debug_mode_settings(f"Game for player {player}", multiworld.game[player])
            
            # Helper function to extract value from enum-like objects
            def extract_value(obj):
                if hasattr(obj, 'value'):  # Check if it's an enum with a value attribute
                    return obj.value
                
                # Handle string representation with parentheses like Mode(Open)
                str_rep = str(obj)
                if '(' in str_rep and ')' in str_rep:
                    extracted = str_rep.split('(', 1)[1].split(')', 1)[0]
                    
                    # Convert to appropriate type
                    if extracted.lower() in ('yes', 'no', 'true', 'false'):
                        return extracted.lower() == 'yes' or extracted.lower() == 'true'
                    elif extracted.isdigit():
                        return int(extracted)
                    else:
                        return extracted
                
                return obj  # Return as is if no special handling needed
            
            # Handle common settings
            common_settings = [
                'dark_room_logic', 'retro_bow', 'swordless', 'enemy_shuffle',
                'enemy_health', 'enemy_damage', 'bombless_start', 'glitches_required',
                'pot_shuffle', 'dungeon_counters', 'glitch_boots', 'accessibility'
            ]
            
            # Debug before processing settings
            debug_mode_settings(f"Processing settings for player {player}")
            
            for setting in common_settings:
                if hasattr(multiworld, setting) and player in getattr(multiworld, setting, {}):
                    value = getattr(multiworld, setting)[player]
                    settings_dict[setting] = extract_value(value)
                    debug_mode_settings(f"Setting '{setting}' found", value)
                else:
                    debug_mode_settings(f"Setting '{setting}' not found for player {player}")
            
            # Handle game mode
            if hasattr(multiworld, 'mode') and player in multiworld.mode:
                original_mode = multiworld.mode[player]
                settings_dict['mode'] = extract_value(original_mode)
                debug_mode_settings(f"Game mode for player {player}", original_mode)
            else:
                error_msg = f"Could not read game mode for player {player}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
                settings_dict['mode'] = f"ERROR: {error_msg}"
            
            # Add world-specific attributes if they exist
            try:
                if player in multiworld.worlds:
                    world = multiworld.worlds.get(player)
                    debug_mode_settings(f"World object for player {player}", world)
                    
                    if world:
                        # Handle shuffle_capacity_upgrades
                        try:
                            if hasattr(world, 'options') and hasattr(world.options, 'shuffle_capacity_upgrades'):
                                debug_mode_settings("shuffle_capacity_upgrades found", world.options.shuffle_capacity_upgrades)
                                settings_dict['shuffle_capacity_upgrades'] = extract_value(world.options.shuffle_capacity_upgrades)
                        except Exception as e:
                            error_msg = f"Error extracting shuffle_capacity_upgrades: {str(e)}"
                            logger.error(error_msg)
                            debug_mode_settings(f"ERROR: {error_msg}")
                            settings_dict['shuffle_capacity_upgrades'] = f"ERROR: {error_msg}"
                        
                        # Handle treasure_hunt_required
                        try:
                            if hasattr(world, 'treasure_hunt_required'):
                                debug_mode_settings("treasure_hunt_required found", world.treasure_hunt_required)
                                settings_dict['treasure_hunt_required'] = world.treasure_hunt_required
                        except Exception as e:
                            error_msg = f"Error extracting treasure_hunt_required: {str(e)}"
                            logger.error(error_msg)
                            debug_mode_settings(f"ERROR: {error_msg}")
                            settings_dict['treasure_hunt_required'] = f"ERROR: {error_msg}"
                        
                        # Handle difficulty requirements
                        try:
                            if hasattr(world, 'difficulty_requirements'):
                                debug_mode_settings("difficulty_requirements found", world.difficulty_requirements)
                                difficulty_reqs = {
                                    'progressive_bottle_limit': getattr(world.difficulty_requirements, 'progressive_bottle_limit', None),
                                    'boss_heart_container_limit': getattr(world.difficulty_requirements, 'boss_heart_container_limit', None),
                                    'heart_piece_limit': getattr(world.difficulty_requirements, 'heart_piece_limit', None),
                                }
                                # Check if any values are None and replace with error message
                                for key, value in difficulty_reqs.items():
                                    if value is None:
                                        difficulty_reqs[key] = f"ERROR: Failed to read {key}"
                                settings_dict['difficulty_requirements'] = difficulty_reqs
                        except Exception as e:
                            error_msg = f"Error getting difficulty requirements: {str(e)}"
                            logger.error(error_msg)
                            debug_mode_settings(f"ERROR: {error_msg}")
                            settings_dict['difficulty_requirements'] = {
                                'error': f"Failed to read difficulty requirements: {str(e)}"
                            }
                        
                        # Handle medallions
                        try:
                            if hasattr(world, 'required_medallions'):
                                debug_mode_settings("required_medallions found", world.required_medallions)
                                # Direct extraction of medallion names
                                medallions = []
                                for medallion in world.required_medallions:
                                    medallions.append(extract_value(medallion))
                                
                                if not medallions:
                                    error_msg = "No medallions found"
                                    logger.error(error_msg)
                                    debug_mode_settings(f"ERROR: {error_msg}")
                                    raise ValueError(error_msg)
                                    
                                settings_dict['required_medallions'] = medallions
                                settings_dict['misery_mire_medallion'] = medallions[0]
                                settings_dict['turtle_rock_medallion'] = medallions[1] if len(medallions) > 1 else medallions[0]
                        except Exception as e:
                            error_msg = f"Error getting medallions: {str(e)}"
                            logger.error(error_msg)
                            debug_mode_settings(f"ERROR: {error_msg}")
                            settings_dict['required_medallions'] = [f"ERROR: Failed to read medallions: {str(e)}"]
                            settings_dict['misery_mire_medallion'] = "ERROR: Failed to read medallion"
                            settings_dict['turtle_rock_medallion'] = "ERROR: Failed to read medallion"
            except Exception as e:
                error_msg = f"Error accessing world for player {player}: {str(e)}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
                settings_dict['error'] = f"Failed to access world data: {str(e)}"
            
            export_data['settings'][str(player)] = settings_dict
            debug_mode_settings(f"Final settings_dict for player {player}", settings_dict)
            
        except Exception as e:
            error_msg = f"Error exporting settings for player {player}: {str(e)}"
            logger.error(error_msg)
            debug_mode_settings(f"ERROR: {error_msg}")
            export_data['settings'][str(player)] = {
                'error': error_msg,
                'details': "Failed to read game settings. Check logs for more information."
            }

        # Game mode handling - add error message approach
        try:
            if hasattr(multiworld, 'mode') and player in multiworld.mode:
                original_mode = multiworld.mode[player]
                debug_mode_settings(f"Processing mode for player {player}", original_mode)
                
                # Extract the mode value using our helper
                extract_mode = extract_value(original_mode)
                debug_mode_settings(f"Extracted mode value", extract_mode)
                
                export_data['mode'][str(player)] = extract_mode
            else:
                error_msg = f"Game mode not found for player {player}"
                logger.error(error_msg)
                debug_mode_settings(f"ERROR: {error_msg}")
                export_data['mode'][str(player)] = f"ERROR: {error_msg}"
        except Exception as e:
            error_msg = f"Error processing game mode for player {player}: {str(e)}"
            logger.error(error_msg)
            debug_mode_settings(f"ERROR: {error_msg}")
            export_data['mode'][str(player)] = f"ERROR: {error_msg}"

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
                            if (can_start):
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
    
    # --- Pre-parse the relevant rule-setting function's AST --- 
    # Cache ASTs to avoid re-parsing the same source repeatedly
    parsed_ast_cache = {}
    def get_context_ast(obj_with_rule):
        # Try to find the method where the rule is likely set (e.g., set_rules)
        # This heuristic might need adjustment based on world code structure
        context_func = None
        try:
            # Look for set_rules method on the world object
            world = multiworld.worlds.get(player)
            if world and hasattr(world, 'set_rules') and callable(world.set_rules):
                context_func = world.set_rules
            # Add more heuristics if rules are set elsewhere

            if context_func:
                func_key = id(context_func) # Use function ID as cache key
                if func_key in parsed_ast_cache:
                    return parsed_ast_cache[func_key]

                source = inspect.getsource(context_func)
                tree = ast.parse(source)
                parsed_ast_cache[func_key] = tree
                print(f"Parsed and cached AST for {context_func.__name__}")
                return tree
            else:
                print("Could not determine rule-setting context function.")
                return None
        except (TypeError, OSError, SyntaxError) as e:
            print(f"Error getting/parsing context source for rule analysis: {e}")
            return None

    # Get the AST for the world's rule setting context once
    # Assuming rules for this player are set in world.set_rules
    # rule_context_ast = get_context_ast(multiworld.worlds.get(player)) # REMOVED - AST approach not viable for combined rules

    def safe_expand_rule(game_handler, rule_func,
                         rule_target_name: Optional[str] = None,
                         target_type: Optional[str] = None): # Removed rule_context_ast
        """Analyzes rule using runtime analysis (analyze_rule)."""
        # REMOVED AST Analysis Path - Not suitable for combined rules
        
        # --- Runtime Analysis Path --- 
        try:
            if not rule_func:
                return None

            print(f"safe_expand_rule: Analyzing {target_type} '{rule_target_name or 'unknown'}' using runtime analyze_rule")
            # Directly call analyze_rule, which handles recursion internally for combined rules
            analysis_result = analyze_rule(rule_func=rule_func)
            
            if analysis_result and analysis_result.get('type') != 'error':
                print(f"safe_expand_rule: Runtime analysis successful for '{rule_target_name or 'unknown'}'")
                expanded = game_handler.expand_rule(analysis_result)
                logger.debug(f"Successfully expanded rule for {target_type} '{rule_target_name or 'unknown'}'")
                return expanded
            else:
                print(f"safe_expand_rule: Runtime analysis failed or returned error for '{rule_target_name or 'unknown'}'")
                logger.warning(f"Failed to analyze or expand rule for {target_type} '{rule_target_name or 'unknown'}' using runtime analysis.")
                return None # Return None on failure
                
        except Exception as e:
            logger.error(f"Error analyzing/expanding rule for {target_type} '{rule_target_name or 'unknown'}': {e}")
            logger.exception("Traceback:")
        return None

    def extract_type_value(type_obj):
        """Extract clean type value from region type objects."""
        # If it's already an integer or string, return it directly
        if isinstance(type_obj, int) or isinstance(type_obj, str) and type_obj.isdigit():
            return int(type_obj)
        
        # If it has a value attribute (like an enum might), use that
        if hasattr(type_obj, 'value'):
            return type_obj.value
        
        # Try to extract value if it's in the format "Type(1)"
        str_rep = str(type_obj)
        if '(' in str_rep and ')' in str_rep:
            type_value = str_rep.split('(', 1)[1].split(')', 1)[0]
            if type_value.isdigit():
                return int(type_value)
        
        # Default: convert to string
        return str(type_obj)

    try:
        regions_data = {}
        logger.debug(f"Getting game helpers for {multiworld.game[player]}")
        # Different games have different levels of rule analysis support
        # ALTTP has detailed helper expansion, while other games may preserve more helper nodes
        game_handler = get_game_export_handler(multiworld.game[player])
        logger.debug("Successfully got game helpers")
        
        logger.debug("Getting player regions")
        player_regions = [
            region for region in multiworld.get_regions() 
            if region.player == player
        ]
        logger.debug(f"Successfully found {len(player_regions)} regions")

        # Create a location name to ID mapping for this player
        location_name_to_id = {}
        if player in multiworld.worlds:
            world = multiworld.worlds[player]
            if hasattr(world, 'location_id_to_name'):
                # Create a reverse mapping from name to ID
                location_name_to_id = {name: id for id, name in world.location_id_to_name.items()}
                logger.debug(f"Created location_name_to_id mapping with {len(location_name_to_id)} entries")

        # Process each region
        for region in player_regions:
            try:
                logger.debug(f"Processing region: {region.name}")
                region_data = {
                    'name': getattr(region, 'name', 'Unknown'),
                    'type': extract_type_value(getattr(region, 'type', 'Region')),
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
                                game_handler,
                                getattr(region.dungeon.boss, 'can_defeat', None),
                                getattr(region.dungeon.boss, 'name', None), # Pass boss name as target
                                target_type='Boss' # Keep target_type for logging
                                # Removed rule_context_ast
                            )
                        }
                    
                    if hasattr(region.dungeon, 'medallion_check'):
                        dungeon_name = getattr(region.dungeon, 'name', 'UnknownDungeon')
                        dungeon_data['medallion_check'] = safe_expand_rule(
                            game_handler,
                            region.dungeon.medallion_check,
                            f"{dungeon_name} Medallion Check", # Construct a target name
                            target_type='DungeonMedallion' # Keep target_type
                            # Removed rule_context_ast
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
                            expanded_rule = None
                            entrance_name = getattr(entrance, 'name', None)
                            if hasattr(entrance, 'access_rule') and entrance.access_rule:
                                expanded_rule = safe_expand_rule(
                                    game_handler,
                                    entrance.access_rule,
                                    entrance_name, # Pass entrance name as target
                                    target_type='Entrance' # Keep target_type
                                    # Removed rule_context_ast
                                )
                            
                            entrance_data = {
                                'name': entrance_name,
                                'parent_region': getattr(entrance.parent_region, 'name', None) if hasattr(entrance, 'parent_region') else None,
                                'access_rule': expanded_rule,
                                'connected_region': getattr(entrance.connected_region, 'name', None) if hasattr(entrance, 'connected_region') else None,
                                'reverse': getattr(entrance, 'reverse', 'name', None) if hasattr(entrance, 'reverse') else None,
                                'assumed': getattr(entrance, 'assumed', False),
                                'type': getattr(entrance, 'type', 'Entrance'),
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
                            expanded_rule = None
                            exit_name = getattr(exit, 'name', None)
                            if hasattr(exit, 'access_rule') and exit.access_rule:
                                expanded_rule = safe_expand_rule(
                                    game_handler,
                                    exit.access_rule,
                                    exit_name, # Pass exit name as target
                                    target_type='Exit' # Keep target_type
                                    # Removed rule_context_ast
                                )
                            
                            exit_data = {
                                'name': exit_name,
                                'connected_region': getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None,
                                'access_rule': expanded_rule,
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
                            location_name = getattr(location, 'name', None)
                            
                            # Process access and item rules
                            access_rule_result = None
                            item_rule_result = None
                            
                            if hasattr(location, 'access_rule') and location.access_rule:
                                access_rule_result = safe_expand_rule(
                                    game_handler,
                                    location.access_rule,
                                    location_name, # Pass location name as target
                                    target_type='Location' # Keep target_type
                                    # Removed rule_context_ast
                                )
                                
                            if hasattr(location, 'item_rule') and location.item_rule:
                                item_rule_result = safe_expand_rule(
                                    game_handler,
                                    location.item_rule,
                                    f"{location_name} Item Rule", # Construct target name
                                    target_type='LocationItemRule' # Keep target_type
                                    # Removed rule_context_ast
                                )
                            
                            location_data = {
                                'name': location_name,
                                'id': location_name_to_id.get(location_name, None),  # Add location ID from mapping
                                'crystal': getattr(location, 'crystal', None),
                                'access_rule': access_rule_result,
                                'item_rule': item_rule_result,
                                'progress_type': extract_type_value(getattr(location, 'progress_type', None)),
                                'locked': getattr(location, 'locked', False),
                                'item': None
                            }
                            
                            if hasattr(location, 'item') and location.item:
                                location_data['item'] = {
                                    'name': getattr(location.item, 'name', None),
                                    'player': getattr(location.item, 'player', None),
                                    'advancement': getattr(location.item, 'advancement', False),
                                    'priority': getattr(location.item, 'priority', None),
                                    'type': extract_type_value(getattr(location.item, 'type', None))
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
                            # Construct a target name for region rules
                            rule_target_name = f"{region.name} Rule {i+1}"
                            expanded_rule = safe_expand_rule(
                                game_handler,
                                rule,
                                rule_target_name, # Pass constructed target name
                                target_type='RegionRule' # Keep target_type
                                # Removed rule_context_ast
                            )
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
    """Process item data including progression flags and capacity information."""
    items_data = {}
    world = multiworld.worlds[player]
    game_name = multiworld.game[player]
    
    # First process basic items from item_id_to_name mapping
    for item_id, item_name in getattr(world, 'item_id_to_name', {}).items():
        groups = [
            group_name for group_name, items in getattr(world, 'item_name_groups', {}).items() 
            if item_name in items
        ]
        
        items_data[item_name] = {
            'name': item_name,
            'id': item_id,
            'groups': sorted(groups),
            'advancement': False,
            'priority': False,
            'useful': False,
            'trap': False,
            'event': False,
            'type': None,
            'max_count': 1  # Default max count is 1
        }

    # Process game-specific item data
    if game_name == "A Link to the Past":
        # For ALTTP, add all items from item_table that aren't already added
        from worlds.alttp.Items import item_table
        from BaseClasses import ItemClassification
        
        for item_name, item_data in item_table.items():
            if item_name not in items_data:
                # Get groups this item belongs to
                groups = [
                    group_name for group_name, items in getattr(world, 'item_name_groups', {}).items() 
                    if item_name in items
                ]
                
                # If no groups and item has a type, add type as a group
                if not groups and item_data.type:
                    groups = [item_data.type]

                items_data[item_name] = {
                    'name': item_name,
                    'id': None,
                    'groups': sorted(groups),
                    'advancement': item_data.classification == ItemClassification.progression,
                    'priority': False,
                    'useful': False,
                    'trap': False,
                    'event': item_data.type == 'Event',
                    'type': item_data.type,
                    'max_count': 1  # Default max count is 1
                }
    else:
        # For other games, we'll just use the basic items from item_id_to_name
        # and not add any additional items from item_table
        logger.debug(f"Using basic item processing for game: {game_name}")

    # Update flags from placed items - this is game-agnostic
    for location in multiworld.get_locations(player):
        if location.item and location.item.name in items_data:
            item_data = items_data[location.item.name]
            item_data['advancement'] = getattr(location.item, 'advancement', False)
            item_data['priority'] = getattr(location.item, 'priority', False)
            item_data['useful'] = getattr(location.item, 'useful', False)
            item_data['trap'] = getattr(location.item, 'trap', False)
            #item_data['event'] = getattr(location.item, 'event', False) # Don't overwrite this
    
    # Add default special max counts based on game type
    if game_name == "A Link to the Past":
        # ALTTP-specific special max counts
        special_max_counts = {
            'Piece of Heart': 24,
            'Boss Heart Container': 10,
            'Sanctuary Heart Container': 1,
            'Magic Upgrade (1/2)': 1,
            'Magic Upgrade (1/4)': 1,
            'Progressive Sword': 4,
            'Progressive Shield': 3,
            'Progressive Glove': 2,
            'Progressive Mail': 2,
            'Progressive Bow': 2,
            'Bottle': 4,
            'Bottle (Red Potion)': 4,
            'Bottle (Green Potion)': 4,
            'Bottle (Blue Potion)': 4,
            'Bottle (Fairy)': 4,
            'Bottle (Bee)': 4,
            'Bottle (Good Bee)': 4,
        }
        
        for item_name, max_count in special_max_counts.items():
            if item_name in items_data:
                items_data[item_name]['max_count'] = max_count
    else:
        # For other games, we don't add special max counts by default
        # This could be expanded in the future with game-specific handlers
        pass
    
    return items_data

def process_item_groups(multiworld, player: int) -> List[str]:
    """Get item groups for this player."""
    world = multiworld.worlds[player]
    if hasattr(world, 'item_name_groups'):
        return sorted(world.item_name_groups.keys())
    return []

def process_progression_mapping(multiworld, player: int) -> Dict[str, Any]:
    """Extract progression item mapping data."""
    game_name = multiworld.game[player]
    
    if game_name == "A Link to the Past":
        # ALTTP-specific progression mapping
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
    else:
        # For other games, return an empty mapping
        # This could be expanded in the future with game-specific handlers
        logger.debug(f"No progression mapping data available for game: {game_name}")
        return {}

def cleanup_export_data(data):
    """
    Clean up specific fields in the export data that need special handling.
    This is applied after the initial serialization.
    """
    # Debug output to a separate diagnostics file
    with open("debug_cleanup_data.txt", "w") as debug_file:
        debug_file.write(f"DEBUG - cleanup_export_data called\n")
        if 'mode' in data:
            debug_file.write(f"DEBUG - mode before cleanup: {data['mode']}\n")
            debug_file.write(f"DEBUG - mode type before cleanup: {type(data['mode'])}\n")
        if 'settings' in data:
            debug_file.write(f"DEBUG - settings before cleanup: {str(data['settings'])}\n")
        if 'game_info' in data:
            debug_file.write(f"DEBUG - game_info before cleanup: {str(data['game_info'])}\n")
    
    # Track the game type for each player to apply appropriate settings
    player_games = {}
    
    # If we have game info, collect it for each player
    if 'settings' in data:
        for player_id, settings in data['settings'].items():
            if 'game' in settings:
                player_games[player_id] = settings['game']

    # Define mappings for numeric settings values to readable strings
    # These are primarily ALTTP settings
    alttp_setting_mappings = {
        'dark_room_logic': {0: 'lamp', 1: 'torches', 2: 'none'},
        'enemy_health': {0: 'default', 1: 'easy', 2: 'hard', 3: 'expert'},
        'enemy_damage': {0: 'default', 1: 'shuffled', 2: 'chaos'},
        'glitches_required': {0: 'none', 1: 'overworld_glitches', 2: 'major_glitches', 3: 'no_logic'},
        'accessibility': {0: 'items', 1: 'locations', 2: 'none'},
        'dungeon_counters': {0: 'default', 1: 'on', 2: 'off'},
        'pot_shuffle': {0: 'off', 1: 'on'},
        'mode': {0: 'standard', 1: 'open', 2: 'inverted', 3: 'retro'},
        'glitch_boots': {0: 'off', 1: 'on'},
        'shuffle_capacity_upgrades': {0: 'off', 1: 'on', 2: 'progressive'}
    }
    
    # Boolean settings that should be actual booleans for ALTTP
    alttp_boolean_settings = [
        'retro_bow', 'swordless', 'enemy_shuffle', 'bombless_start'
    ]
    
    # Common setting mappings for all games
    common_setting_mappings = {
        'accessibility': {0: 'items', 1: 'locations', 2: 'none'},
    }
     
    # Ensure game_info is properly structured
    if 'game_info' in data:
        for player_id, game_info in data['game_info'].items():
            # Make sure game_info has the game name
            if 'name' not in game_info and player_id in player_games:
                game_info['name'] = player_games[player_id]
            
            # Ensure rule_format exists
            if 'rule_format' not in game_info:
                game_info['rule_format'] = {"version": "1.0"}

    # Clean up mode field
    if 'mode' in data:
        # Record the original state for debugging
        debug_mode_settings("Mode field before cleanup", data['mode'])
        
        # Check the structure - if it's not a dictionary, don't attempt to fix
        # Instead, log an error and leave it as-is for debugging
        if not isinstance(data['mode'], dict):
            error_msg = f"Mode field has unexpected type: {type(data['mode'])}"
            logger.error(error_msg)
            debug_mode_settings(f"ERROR: {error_msg}")
            with open("debug_cleanup_data.txt", "a") as debug_file:
                debug_file.write(f"ERROR: {error_msg}\n")
            # Don't modify the field - better to have wrong data than silently "fixed" data
        else:
            # Process the dictionary format
            for player, mode_value in data['mode'].items():
                debug_mode_settings(f"Cleaning up mode for player {player}", mode_value)
                
                # If it's an error message, keep it as is
                if isinstance(mode_value, str) and mode_value.startswith("ERROR:"):
                    debug_mode_settings(f"Keeping error message", mode_value)
                    continue
                
                # Ensure mode is a clean string or number based on mappings
                if isinstance(mode_value, str) and '(' in mode_value:
                    # Extract from string like Mode(Open)
                    extracted = mode_value.split('(', 1)[1].split(')', 1)[0].lower()
                    data['mode'][player] = extracted
                    debug_mode_settings(f"Extracted mode from string", extracted)
                    
                # Convert from integer to string using the mapping
                # Only for ALTTP or if we don't know the game type (backward compatibility)
                game = player_games.get(player, "A Link to the Past")  # Default to ALTTP for compatibility
                if game == "A Link to the Past" and isinstance(mode_value, int) and mode_value in alttp_setting_mappings['mode']:
                    mapped_value = alttp_setting_mappings['mode'][mode_value]
                    data['mode'][player] = mapped_value
                    debug_mode_settings(f"Mapped mode from int {mode_value}", mapped_value)
    
    # Clean up settings fields
    if 'settings' in data:
        for player, settings in data['settings'].items():
            debug_mode_settings(f"Cleaning up settings for player {player}", settings)
            
            # Skip if it's an error object
            if 'error' in settings:
                debug_mode_settings("Skipping settings with error")
                continue
            
            # Determine game type for this player
            game = player_games.get(player, "unknown")
            debug_mode_settings(f"Game for player {player}: {game}")
            
            # Select appropriate setting mappings based on game
            setting_mappings = common_setting_mappings.copy()
            boolean_settings = []
            
            if game == "A Link to the Past":
                # Add ALTTP-specific mappings
                setting_mappings.update(alttp_setting_mappings)
                boolean_settings = alttp_boolean_settings
                
            # Convert numeric settings to descriptive strings
            for setting_name, value in list(settings.items()):
                # Skip if it's already an error message
                if isinstance(value, str) and value.startswith("ERROR:"):
                    debug_mode_settings(f"Keeping error message for {setting_name}", value)
                    continue
                    
                # Convert numeric settings using mapping
                if setting_name in setting_mappings and isinstance(value, int):
                    if value in setting_mappings[setting_name]:
                        mapped_value = setting_mappings[setting_name][value]
                        settings[setting_name] = mapped_value
                        debug_mode_settings(f"Mapped {setting_name} from {value}", mapped_value)
                    else:
                        error_msg = f"Unknown {setting_name} value: {value}"
                        logger.warning(error_msg)
                        debug_mode_settings(f"WARNING: {error_msg}")
                        settings[setting_name] = f"unknown_{value}"
                
                # Ensure boolean settings are actual booleans
                if setting_name in boolean_settings:
                    if isinstance(value, int):
                        settings[setting_name] = bool(value)
                        debug_mode_settings(f"Converted {setting_name} to boolean", bool(value))
    
    # Clean up region types
    if 'regions' in data:
        for player, regions in data['regions'].items():
            for region_name, region in regions.items():
                # Convert region type to int if possible
                if 'type' in region and isinstance(region['type'], str):
                    if region['type'].isdigit():
                        region['type'] = int(region['type'])
                
                # Clean up location progress_type
                if 'locations' in region:
                    for location in region['locations']:
                        if 'progress_type' in location and isinstance(location['progress_type'], str):
                            if location['progress_type'].isdigit():
                                location['progress_type'] = int(location['progress_type'])
    
    # Debug output after cleanup
    with open("debug_cleanup_data.txt", "a") as debug_file:
        if 'mode' in data:
            debug_file.write(f"DEBUG - mode after cleanup: {data['mode']}\n")
            debug_file.write(f"DEBUG - mode type after cleanup: {type(data['mode'])}\n")
        if 'settings' in data:
            debug_file.write(f"DEBUG - settings after cleanup: {str(data['settings'])}\n")
    
    debug_mode_settings("Export data after cleanup", data)
    return data

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
    # Start with a clean debug file
    with open("debug_mode_settings.txt", "w") as debug_file:
        debug_file.write(f"DEBUG - Starting export_test_data\n")
        debug_file.write(f"DEBUG - output_dir: {output_dir}\n")
        debug_file.write(f"DEBUG - filename_base: {filename_base}\n")
    
    # Debug the mode attribute specifically
    if hasattr(multiworld, 'mode'):
        debug_mode_settings("Examining multiworld.mode in export_test_data", multiworld.mode)
        # Examine mode data type and structure in detail
        debug_mode_settings("multiworld.mode type", type(multiworld.mode))
        
        # Check each player's mode
        for player in multiworld.player_ids:
            if player in multiworld.mode:
                player_mode = multiworld.mode[player]
                debug_mode_settings(f"Mode for player {player}", player_mode)
                debug_mode_settings(f"Mode type for player {player}", type(player_mode))
                
                # Check for special attributes on the mode object
                if hasattr(player_mode, 'value'):
                    debug_mode_settings(f"Mode.value for player {player}", player_mode.value)
                if hasattr(player_mode, 'name'):
                    debug_mode_settings(f"Mode.name for player {player}", player_mode.name)
                if hasattr(player_mode, '__dict__'):
                    debug_mode_settings(f"Mode.__dict__ for player {player}", player_mode.__dict__)
    else:
        debug_mode_settings("WARNING: multiworld has no 'mode' attribute in export_test_data")

    import os
    os.makedirs(output_dir, exist_ok=True)

    # Set the filename base to the caller function name two levels up
    # This is the name of the test that we're currently running
    try:
        # Get the caller two levels up in the stack (the test function calling this export function)
        caller = inspect.stack()[2]
        if caller and hasattr(caller, 'function') and caller.function:
            # Use the test function name as the filename base
            filename_base = caller.function
            caller_filename = caller.filename
            
            # Extract the directory name containing the test file
            # Example path: [..., 'alttp', 'test', 'vanilla', 'TestLightWorld.py']
            # We want 'vanilla', which is the directory containing the test file
            parent_directory = os.path.basename(os.path.dirname(os.path.abspath(caller_filename)))
            
            # Log the extracted information for debugging
            debug_mode_settings("Caller information", {
                "function": caller.function,
                "filename": caller_filename,
                "parent_directory": parent_directory
            })
        else:
            logger.warning("Could not determine caller function name, using default filename base")
            filename_base = filename_base or "test_output"
    except IndexError as e:
        # Specific handling for stack inspection errors
        logger.error(f"Stack inspection error (not enough frames): {e}")
        filename_base = filename_base or "test_output"
    except Exception as e:
        # General error handling
        logger.error(f"Error getting caller information: {e}")
        filename_base = filename_base or "test_output"

    # Create or update test_files.json to track test files
    test_files_path = os.path.join(output_dir, "test_files.json")
    test_files_data = {}
    
    # Load existing test files data if it exists
    if os.path.exists(test_files_path):
        try:
            with open(test_files_path, 'r', encoding='utf-8') as f:
                test_files_data = json.load(f)
        except json.JSONDecodeError:
            logger.warning(f"Could not parse existing test_files.json, creating new file")
        except Exception as e:
            logger.error(f"Error reading test_files.json: {e}")
    
    # Add current filename_base as a subentry of parent_directory
    if parent_directory not in test_files_data:
        test_files_data[parent_directory] = {}
    
    if filename_base not in test_files_data[parent_directory]:
        test_files_data[parent_directory][filename_base] = True
        
        # Write updated test files data
        try:
            with open(test_files_path, 'w', encoding='utf-8') as f:
                json.dump(test_files_data, f, indent=2)
            logger.debug(f"Updated test_files.json with {parent_directory}/{filename_base}")
        except Exception as e:
            logger.error(f"Error writing to test_files.json: {e}")
    
    # Export rules data with explicit region connections
    debug_mode_settings("Calling prepare_export_data")
    export_data = prepare_export_data(multiworld)

    # Create a subdirectory for the parent_directory if it doesn't exist
    parent_dir_path = os.path.join(output_dir, parent_directory)
    os.makedirs(parent_dir_path, exist_ok=True)
    
    # CHANGED: Use parent_directory for rules file name instead of filename_base
    rules_path = os.path.join(parent_dir_path, f"{parent_directory}_rules.json")
    
    # Check the structure of export_data before proceeding
    debug_mode_settings("Export data structure after prepare_export_data", 
                        {"keys": list(export_data.keys())})
    
    # Verify mode format
    if 'mode' in export_data:
        debug_mode_settings("Mode data after prepare_export_data", export_data['mode'])
        # Examine what's in the mode data
        if isinstance(export_data['mode'], dict):
            for player, mode in export_data['mode'].items():
                debug_mode_settings(f"Mode for player {player} type", type(mode))
                debug_mode_settings(f"Mode for player {player} value", mode)
    else:
        debug_mode_settings("WARNING: No mode field in export_data")
    
    # Check for non-serializable parts before writing
    debug_export_data(export_data)
    
    # Make the export data serializable and clean
    success = False
    try:
        logger.info("Starting serialization of export data")
        
        # First pass: general serialization
        debug_mode_settings("Calling make_serializable")
        serializable_data = make_serializable(export_data)
        
        # Debug after serialization
        debug_mode_settings("Data structure after serialization", 
                           {"keys": list(serializable_data.keys())})
        
        if 'mode' in serializable_data:
            debug_mode_settings("Mode data after serialization", serializable_data['mode'])
            if isinstance(serializable_data['mode'], dict):
                for player, mode in serializable_data['mode'].items():
                    debug_mode_settings(f"Serialized mode for player {player}", mode)
        
        # Apply cleanup
        debug_mode_settings("Calling cleanup_export_data")
        serializable_data = cleanup_export_data(serializable_data)
        
        # Final verification before writing
        debug_mode_settings("Data structure after cleanup", 
                           {"keys": list(serializable_data.keys())})
        
        if 'mode' in serializable_data:
            debug_mode_settings("Mode data after cleanup", serializable_data['mode'])
        
        # Write the data to file
        logger.info("Writing serialized data to file")
        with open(rules_path, 'w', encoding='utf-8') as f:
            json.dump(serializable_data, f, indent=2)
        logger.info(f"Successfully wrote rules to {rules_path}")
        success = True
        
    except Exception as e:
        error_msg = f"Error serializing or writing JSON: {str(e)}"
        logger.error(error_msg)
        debug_mode_settings(f"ERROR: {error_msg}")
        
        # Log the exception details
        import traceback
        debug_mode_settings("Exception traceback", traceback.format_exc())
        
        if 'serializable_data' in locals():
            if 'mode' in serializable_data:
                debug_mode_settings("Mode data at time of error", serializable_data['mode'])
        
        # Try to save using field-by-field method as a fallback
        logger.error("Attempting to save field-by-field...")
        success = write_field_by_field(export_data, rules_path)
    
    # If we couldn't write the data, return failure
    if not success:
        logger.error("Failed to export rule data. See debug logs for details.")
        return False
    
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

    # Create a subdirectory for the parent_directory if it doesn't exist
    parent_dir_path = os.path.join(output_dir, parent_directory)
    os.makedirs(parent_dir_path, exist_ok=True)
    
    # Keep test cases files named by individual test function
    test_cases_path = os.path.join(parent_dir_path, f"{filename_base}_tests.json")

    
    try:
        with open(test_cases_path, 'w') as f:
            json.dump(test_cases_data, f, indent=2)
        logger.info(f"Successfully wrote test cases to {test_cases_path}")
    except Exception as e:
        error_msg = f"Error writing test cases: {str(e)}"
        logger.error(error_msg)
        debug_mode_settings(f"ERROR: {error_msg}")
        return False

    debug_mode_settings("Export process completed successfully")
    print("Export process completed.")
    return True

def export_game_rules(multiworld, output_dir: str, filename_base: str, save_presets: bool = False) -> Dict[str, str]:
    """
    Exports game rules and test data to JSON files for frontend consumption.
    Also saves a copy of rules to frontend/presets with game name as prefix if save_presets is True.
    
    Args:
        multiworld: MultiWorld instance containing game rules
        output_dir: Directory to write output files
        filename_base: Base name for output files
        save_presets: Whether to save copies of files to the presets directory
        
    Returns:
        Dict containing paths to generated files
    """
    
    os.makedirs(output_dir, exist_ok=True)

    # --- Configuration for Excluded Fields --- 
    # Add keys here to exclude them from the final JSON output (e.g., to reduce size)
    # This applies recursively to nested structures.
    EXCLUDED_FIELDS = {
        'item_rule', # Example: Exclude item rules from locations
        # 'access_rule', # Example: Uncomment to exclude access rules
    }

    def remove_excluded_fields(data, excluded_keys):
        """ Recursively remove specified keys from nested dictionaries and lists. """
        if isinstance(data, dict):
            new_dict = {}
            for key, value in data.items():
                if key not in excluded_keys:
                    new_dict[key] = remove_excluded_fields(value, excluded_keys)
            return new_dict
        elif isinstance(data, list):
            return [remove_excluded_fields(item, excluded_keys) for item in data]
        else:
            return data

    # --- Define key categories (used for both combined and individual files) ---
    # Global keys apply to the entire multiworld
    global_keys = [
        "schema_version", 
        "archipelago_version", 
        "generation_seed", "player_names", "plando_options", "world_classes"
    ] # Note: game_name is handled specially
    
    # Player-specific keys contain data nested under player IDs
    player_specific_keys = [
        'regions', 'items', 'item_groups', 'progression_mapping', 
        'mode', 'settings', 'start_regions', 'itempool_counts', 'game_info'
    ]

    # Prepare the combined export data for all players
    try:
        export_data = prepare_export_data(multiworld)
        # Apply serialization and cleanup - important for consistent output
        serializable_data = make_serializable(export_data)
        cleaned_data = cleanup_export_data(serializable_data)
        
    except Exception as e:
        logger.error(f"Error preparing export data: {e}")
        logger.exception("Full traceback for data preparation error:")
        # Optionally return or raise here if preparation fails
        return {} # Return empty dict if preparation fails

    # --- Determine Game Name for Combined File ---
    combined_game_name = "Unknown"
    if multiworld.game:
        unique_games = set(g for g in multiworld.game.values() if g)
        if len(unique_games) > 1:
            combined_game_name = "Multiworld"
        elif len(unique_games) == 1:
            combined_game_name = list(unique_games)[0] # Get the single game name
        else: # No valid game names found
            combined_game_name = "Unknown"
    
    # --- Build Ordered Dictionary for Combined File ---
    # Define the desired order of keys
    desired_key_order = [
        'schema_version',
        'game_name',
        'archipelago_version',
        'generation_seed',
        'player_names',
        'world_classes',
        'plando_options',
        'regions',
        'start_regions',
        'items',
        'item_groups',
        'itempool_counts',
        'progression_mapping',
        'mode',
        'settings',
        'game_info'
    ]

    ordered_cleaned_data = collections.OrderedDict()

    # Add keys in the desired order
    for key in desired_key_order:
        if key == 'game_name':
            # Handle game_name explicitly using the determined combined_game_name
            ordered_cleaned_data[key] = combined_game_name
        elif key in cleaned_data:
            # Ensure player-specific keys retain their player-keyed structure
            if key in player_specific_keys: 
                ordered_cleaned_data[key] = cleaned_data[key]
            else:
                # Assign other global keys directly
                ordered_cleaned_data[key] = cleaned_data[key]
        else:
            # Handle potentially missing keys (other than game_name)
            logger.warning(f"Key '{key}' not found in cleaned_data for combined export")
            pass

    # Add any keys present in cleaned_data but not in desired_key_order to the end
    # This ensures no data is lost if new top-level keys are added
    for key, value in cleaned_data.items():
        if key not in ordered_cleaned_data:
            ordered_cleaned_data[key] = value
            logger.warning(f"Key '{key}' was not in desired_key_order, added to end of combined export")

    # --- Remove Excluded Fields from Combined Data ---
    final_ordered_data = remove_excluded_fields(ordered_cleaned_data, EXCLUDED_FIELDS)

    # --- Write the combined rules file using the ordered data ---
    combined_rules_path = os.path.join(output_dir, f"{filename_base}_rules.json")
    try:
        with open(combined_rules_path, 'w', encoding='utf-8') as f:
            json.dump(final_ordered_data, f, indent=2) # Use filtered data
        logger.info(f"Successfully wrote combined rules to {combined_rules_path}")
    except Exception as e:
        logger.error(f"Error writing combined rules export file: {e}")
        raise # Re-raise the exception if combined file fails

    results = {'rules_combined': combined_rules_path} # Renamed key for clarity

    # --- Write individual player rule files ONLY if more than one player ---
    if len(multiworld.player_ids) > 1:
        # Key definitions moved to top of function
        # global_keys = [...]
        # player_specific_keys = [...]

        for player in multiworld.player_ids:
            player_str = str(player)
            
            # ** Build Ordered Dictionary for Player File **
            player_export_data = collections.OrderedDict()
            
            # Define the full desired order of keys 
            # (schema_version and game_name are handled first)
            global_keys_in_order = [
                'archipelago_version',
                'generation_seed',
                'player_names',
                'world_classes',
                'plando_options'
            ]
            player_keys_in_order = [
                'regions',
                'start_regions', 
                'items',
                'item_groups',
                'itempool_counts',
                'progression_mapping', 
                'mode',
                'settings',
                'game_info' 
            ]
            
            # 1. Start with schema_version
            if 'schema_version' in cleaned_data:
                 player_export_data['schema_version'] = cleaned_data['schema_version']

            # 2. Add the player's specific game_name next
            player_settings = cleaned_data.get('settings', {}).get(player_str, {})
            player_game_name = player_settings.get('game', 'Unknown')
            player_export_data['game_name'] = player_game_name
            
            # 3. Add global keys in specified order
            for key in global_keys_in_order:
                if key in cleaned_data:
                    player_export_data[key] = cleaned_data[key]
                else:
                     # Handle missing global key if necessary (e.g., log warning)
                     # logger.warning(f"Global key '{key}' missing from cleaned_data")
                     pass # Or assign a default like None or {}
            
            # 4. Add player-specific keys in specified order
            for key in player_keys_in_order:
                if key in cleaned_data and player_str in cleaned_data.get(key, {}):
                    # Assign a dictionary containing the player key and their data
                    player_export_data[key] = {player_str: cleaned_data[key][player_str]}
                else:
                    # Log if expected player-specific data is missing
                    logger.warning(f"Missing player-specific key '{key}' for player {player_str} in cleaned_data")
                    # Provide an empty dict or appropriate default based on the key type
                    player_export_data[key] = {} # Default to empty dict

            # Define player-specific filename
            player_rules_path = os.path.join(output_dir, f"{filename_base}_P{player_str}_rules.json")
            
            # --- Remove Excluded Fields from Player Data ---
            final_player_data = remove_excluded_fields(player_export_data, EXCLUDED_FIELDS)

            try:
                with open(player_rules_path, 'w', encoding='utf-8') as f:
                    json.dump(final_player_data, f, indent=2) # Use filtered data
                logger.info(f"Successfully wrote rules for player {player_str} to {player_rules_path}")
                results[f"rules_p{player_str}"] = player_rules_path # Add player file path to results
            except Exception as e:
                logger.error(f"Error writing rules export file for player {player_str}: {e}")
                # Optionally, add placeholder to results or skip adding
                results[f"rules_p{player_str}"] = f"ERROR: Failed to write file - {e}"
                # Decide if we should continue or raise if a player file fails
                # For now, we log the error and continue

    # If save_presets is False, skip the preset saving parts
    if not save_presets:
        return results

    # --- Save presets (this part remains largely the same) ---
    # It will now copy the combined file AND all individual player files
    try:
        # Determine if it's a multi-game world for naming purposes
        if not multiworld.game:
            logger.warning("No game data found in multiworld object, skipping preset save")
            return results
            
        unique_games = set(g for g in multiworld.game.values() if g) # Get unique, non-empty game names
        
        is_multi_game = len(unique_games) > 1
        
        if is_multi_game:
            game_name = "Multiworld" # Name used in descriptions
            clean_game_name = "multiworld" # Name used for the folder
            logger.info(f"Detected multi-game world ({len(unique_games)} unique games), using '{clean_game_name}' preset folder.")
        else:
            # Single game or empty game dict, use first player's game (or default)
            first_player = min(multiworld.game.keys()) if multiworld.game else 1 # Handle empty case
            game_name = multiworld.game.get(first_player, "unknown_game")
            
            if not game_name or game_name == "unknown_game":
                logger.warning(f"Could not determine valid game name for player {first_player}, skipping preset save")
                return results
            
            # Clean the single game name for use in a filename/folder
            clean_game_name = game_name.lower().replace(' ', '_').replace(':', '_')
            logger.info(f"Detected single game world ({game_name}), using '{clean_game_name}' preset folder.")

        # Determine the frontend presets directory
        presets_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'presets')
        os.makedirs(presets_dir, exist_ok=True)
        
        # Create game-specific directory (will be 'multiworld' or the specific game name)
        game_dir = os.path.join(presets_dir, clean_game_name)
        os.makedirs(game_dir, exist_ok=True)
        
        # Create a folder for this specific preset using filename_base
        preset_dir = os.path.join(game_dir, filename_base) 
        
        # Create/update the preset directory (clearing existing files)
        files_copied = 0
        if not os.path.exists(preset_dir):
            os.makedirs(preset_dir)
            logger.info(f"Created new preset directory: {preset_dir}")
        else:
            logger.info(f"Clearing existing preset directory: {preset_dir}")
            for item in os.listdir(preset_dir):
                item_path = os.path.join(preset_dir, item)
                if os.path.isfile(item_path):
                    try:
                        os.remove(item_path)
                    except Exception as remove_e:
                        logger.error(f"Error removing file {item_path}: {remove_e}")
                elif os.path.isdir(item_path):
                    try:
                        shutil.rmtree(item_path)
                    except Exception as rmtree_e:
                        logger.error(f"Error removing directory {item_path}: {rmtree_e}")

        # Copy all files from output_dir to preset_dir
        # This will now include the combined file and all player-specific files
        for file_name in os.listdir(output_dir):
            src_file = os.path.join(output_dir, file_name)
            if os.path.isfile(src_file):
                try:
                    dst_file = os.path.join(preset_dir, file_name)
                    shutil.copy2(src_file, dst_file)
                    files_copied += 1
                except Exception as copy_e:
                     logger.error(f"Error copying file {src_file} to {preset_dir}: {copy_e}")

        logger.info(f"Copied {files_copied} files to preset directory {preset_dir}")
        
        # Get list of files in the preset directory after copying
        try:
            preset_files = sorted([f for f in os.listdir(preset_dir) if os.path.isfile(os.path.join(preset_dir, f))])
        except Exception as list_e:
            logger.error(f"Error listing files in preset directory {preset_dir}: {list_e}")
            preset_files = [] # Fallback to empty list

        # Update preset_files.json index
        preset_index_path = os.path.join(presets_dir, 'preset_files.json')
        preset_index = {}
        
        # Load existing index if available
        if os.path.exists(preset_index_path):
            try:
                with open(preset_index_path, 'r', encoding='utf-8') as f:
                    preset_index = json.load(f)
            except json.JSONDecodeError:
                logger.warning("Could not parse existing preset_files.json, creating new file")
            except Exception as read_e:
                 logger.error(f"Error reading preset_files.json: {read_e}")
                 preset_index = {} # Reset index on error

        # Initialize game entry if it doesn't exist
        if clean_game_name not in preset_index:
            preset_index[clean_game_name] = {
                "name": game_name, # Store the original game name
                "folders": {}
            }
        # Make sure folders key exists and is a dictionary
        elif "folders" not in preset_index[clean_game_name] or not isinstance(preset_index[clean_game_name].get("folders"), dict):
            preset_index[clean_game_name]["folders"] = {}
        
        # --- Prepare player game data ---
        player_game_data = []
        for player_id in multiworld.player_ids:
            player_name = multiworld.player_name.get(player_id, f"Player {player_id}")
            game_for_player = multiworld.game.get(player_id, "Unknown Game")
            player_game_data.append({
                "player": player_id,
                "name": player_name,
                "game": game_for_player
            })

        # Add or update the folder entry with the new structure
        preset_index[clean_game_name]["folders"][filename_base] = {
            # "description": f"Preset for {game_name} - {filename_base}", # REMOVED
            "seed": multiworld.seed, # ADDED
            "games": player_game_data, # ADDED
            "files": preset_files
        }
        
        logger.info(f"Updated preset_files.json index for {clean_game_name}/{filename_base} with {len(preset_files)} files, seed, and game info")
        
        # Write updated index
        try:
            with open(preset_index_path, 'w', encoding='utf-8') as f:
                # Keep the original insertion order
                json.dump(preset_index, f, indent=2)
        except Exception as write_e:
            logger.error(f"Error writing updated preset_files.json: {write_e}")

    except Exception as e:
        # Log but don't fail the entire export if preset saving fails
        logger.error(f"Error saving preset: {e}")
        logger.exception("Exception details during preset saving:")

    return results