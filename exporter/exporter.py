# exporter/exporter.py

"""Handles preparation and formatting of rule data for export."""

import logging
import collections
import json
import os
import inspect
import shutil
from typing import Any, Dict, List, Set, Optional
from collections import defaultdict

import Utils
from .analyzer import analyze_rule
from .games import get_game_export_handler

logger = logging.getLogger(__name__)

def get_world_directory_name(game_name: str) -> str:
    """
    Get the world directory name for a given game name by scanning worlds directory.
    This replicates the logic from build-world-mapping.py but only returns the directory name.
    Falls back to the old naming logic if no matching world is found.
    """
    try:
        # Get path to worlds directory relative to this file (exporter/exporter.py)
        worlds_dir = os.path.join(os.path.dirname(__file__), '..', 'worlds')
        
        if not os.path.exists(worlds_dir):
            logger.warning(f"Worlds directory not found: {worlds_dir}")
            return game_name.lower().replace(' ', '_').replace(':', '_')
        
        # Scan each world directory
        for world_dir_name in os.listdir(worlds_dir):
            world_path = os.path.join(worlds_dir, world_dir_name)
            
            # Skip non-directories and hidden/private directories
            if not os.path.isdir(world_path) or world_dir_name.startswith('.') or world_dir_name.startswith('_'):
                continue
                
            init_file = os.path.join(world_path, '__init__.py')
            if not os.path.exists(init_file):
                continue
                
            # Extract game name from __init__.py
            try:
                with open(init_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Look for pattern: game: ClassVar[str] = "Game Name"
                import re
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*"([^"]*)"'
                match = re.search(pattern, content)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback pattern for single quotes
                pattern = r'game:\s*ClassVar\[str\]\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback: look for simpler pattern: game = "Game Name"
                pattern = r'game\s*=\s*"([^"]*)"'
                match = re.search(pattern, content)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                
                # Fallback pattern for single quotes
                pattern = r'game\s*=\s*\'([^\']*)\''
                match = re.search(pattern, content)
                
                if match:
                    found_game_name = match.group(1)
                    if found_game_name == game_name:
                        return world_dir_name
                        
            except (IOError, UnicodeDecodeError):
                continue
        
        # If no matching world found, fall back to old logic
        return game_name.lower().replace(' ', '_').replace(':', '_')
        
    except Exception as e:
        logger.error(f"Error finding world directory for game '{game_name}': {e}")
        return game_name.lower().replace(' ', '_').replace(':', '_')

# --- Configuration for Excluded Fields --- 
# Add keys here to exclude them from the final JSON output (e.g., to reduce size)
# This applies recursively to nested structures.
EXCLUDED_FIELDS = {
    'item_rule',
    'boss',
    #'entrances',
}

# Context-specific exclusions
CONTEXT_EXCLUDED_FIELDS = {
    'entrances': ['access_rule'],  # Exclude access_rule from entrance objects
    # Add more context-specific exclusions here as needed
}

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
    # Handle basic types directly
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    
    # Handle dictionaries
    if isinstance(obj, dict):
        serialized_dict = {str(k): make_serializable(v) for k, v in obj.items()}
        
        return serialized_dict
    
    # Handle lists, tuples, sets, and frozensets
    if isinstance(obj, (list, tuple, set, frozenset)):
        result = [make_serializable(i) for i in obj]
        # Sort sets and frozensets for consistent ordering
        if isinstance(obj, (set, frozenset)):
            return sorted(result)
        return result
    
    # Handle objects with __dict__ attribute (custom classes)
    if hasattr(obj, '__dict__'):
        # First check for value attribute (common in enums)
        if hasattr(obj, 'value'):
            return make_serializable(obj.value)
        
        # Try to extract value from string representation like "Type(Value)"
        str_rep = str(obj)
        if '(' in str_rep and ')' in str_rep:
            try:
                # Extract value inside parentheses
                extracted = str_rep.split('(', 1)[1].split(')', 1)[0]
                
                # Try to convert to appropriate type
                if extracted.lower() in ('yes', 'no', 'true', 'false'):
                    return extracted.lower() == 'yes' or extracted.lower() == 'true'
                elif extracted.isdigit():
                    return int(extracted)
                else:
                    return extracted
            except Exception as e:
                # If extraction fails, log and use string representation
                return str_rep
        
        # If no special handling applies, use string representation
        return str_rep
    
    # If all else fails, convert to string
    if not is_serializable(obj):
        return str(obj)
    
    return obj


def write_field_by_field(export_data, filepath):
    """
    Tries to write each major section of the export_data to the file separately,
    to ensure at least some data is saved even if one section is problematic.
    """
    serializable_data = {"version": export_data.get("version", 1)}
    fields_written = []
    
    # Try each field separately
    for field in ["regions", "items", "item_groups", "progression_mapping", "settings", "start_regions", "game_info", "itempool_counts"]:
        if field in export_data:
            try:
                serializable_field = make_serializable(export_data[field])
                # Test if it's serializable
                json.dumps(serializable_field)
                serializable_data[field] = serializable_field
                fields_written.append(field)
            except Exception as e:
                error_msg = f"Failed to process field {field}: {str(e)}"
                logger.error(error_msg)
                
                # For complex fields, try to process each player separately
                if field in ["settings", "game_info"] and isinstance(export_data.get(field, {}), dict):
                    # Initialize with empty dict
                    serializable_data[field] = {}
                    
                    # Try each player separately
                    for player_id in export_data.get(field, {}):
                        try:
                            player_data = make_serializable(export_data[field][player_id])
                            json.dumps(player_data)  # Test serialization
                            serializable_data[field][player_id] = player_data
                        except Exception as player_error:
                            error_msg = f"Failed to process {field} for player {player_id}: {str(player_error)}"
                            logger.error(error_msg)
                            # Use error message instead of default
                            serializable_data[field][player_id] = f"ERROR: {error_msg}"
    
    # Write what we have
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(serializable_data, f, indent=2)
        return True
    except Exception as e:
        error_msg = f"Failed to write even partial data: {str(e)}"
        logger.error(error_msg)
        return False

def prepare_export_data(multiworld) -> Dict[str, Any]:
    """
    Prepares complete game data for export to JSON format.
    Preserves as much of the Python backend's structure as possible.
    """
    export_data = {
        "schema_version": 3,  # Schema version for the export format
        "archipelago_version": Utils.__version__,
        "generation_seed": multiworld.seed,
        "player_names": getattr(multiworld, 'player_name', {}), # Player ID -> Name mapping (default to {} if missing)
        "plando_options": [option.name for option in multiworld.plando_options], # Active plando options
        "world_classes": {player: multiworld.worlds[player].__class__.__name__ 
                           for player in multiworld.player_ids}, # Player ID -> World Class Name mapping
        'regions': {},  # Full region graph
        'items': {},    # Item data by player
        'item_groups': {},  # Item groups by player
        'progression_mapping': {},  # Progressive item info
        'settings': {}, # Game settings by player
        'start_regions': {},  # Start regions by player
        'itempool_counts': {},  # Complete itempool counts by player
        'game_info': {},  # Game-specific information for frontend
        'starting_items': {}, # Starting items by player
    }
    
    # Dungeons will only be added if there's data to include
    all_dungeons = {}

    for player in multiworld.player_ids:
        player_str = str(player) # Use player_str consistently
        
        # Get game name, world, and handler
        game_name = multiworld.game[player]
        world = multiworld.worlds[player]
        game_handler = get_game_export_handler(game_name, world)

        # Call game-specific preprocessing
        # This allows games to set up data and caches before region processing
        game_handler.preprocess_world_data(world, export_data, player)

        # Process all regions and their connections
        # Also extract dungeons to separate structure
        regions_data, dungeons_data = process_regions(multiworld, player, game_handler)
        export_data['regions'][player_str] = regions_data
        
        # Only add dungeons if there's data
        if dungeons_data:
            if 'dungeons' not in export_data:
                export_data['dungeons'] = {}
            export_data['dungeons'][player_str] = dungeons_data
            all_dungeons[player_str] = dungeons_data
        
        # Pre-calculate itempool counts to use them when processing item data
        itempool_counts = {}
        try:
            itempool_counts = game_handler.get_itempool_counts(world, multiworld, player)
        except Exception as e:
            error_msg = f"Error calculating itempool counts for player {player}: {str(e)}"
            logger.error(error_msg)
            itempool_counts = {
                'error': error_msg,
                'details': "Failed to read itempool counts. Check logs for more information."
            }
        
        # Process items and groups, passing the itempool counts
        export_data['items'][player_str] = process_items(multiworld, player, itempool_counts)
        export_data['item_groups'][player_str] = process_item_groups(multiworld, player)
        export_data['progression_mapping'][player_str] = process_progression_mapping(multiworld, player)

        # Get game-specific information if available using handler
        try:
            game_info = game_handler.get_game_info(world) # Use handler directly
            export_data['game_info'][player_str] = game_info
        except Exception as e:
            error_msg = f"Error getting game_info from handler for player {player}: {str(e)}"
            logger.error(error_msg)
            # Fallback to default
            export_data['game_info'][player_str] = {
                "name": game_name,
                "rule_format": {
                    "version": "1.0"
                }
            }

        # Store the pre-calculated itempool counts
        export_data['itempool_counts'][player_str] = itempool_counts

        # Get Settings using handler
        try:
            settings_data = game_handler.get_settings_data(world, multiworld, player) # Call the handler method
            export_data['settings'][player_str] = settings_data
        except Exception as e:
            error_msg = f"Error exporting settings for player {player}: {str(e)}"
            logger.error(error_msg)
            export_data['settings'][player_str] = {
                'error': error_msg,
                'details': "Failed to read game settings. Check logs for more information."
            }

        # Start regions
        try:
            # Try to get Menu region first (common default)
            default_start_region = 'Menu'
            try:
                menu_region = multiworld.get_region('Menu', player)
            except Exception as e:
                # Menu region doesn't exist, need to find actual starting region
                logger.debug(f"Menu region not found for player {player}, looking for actual starting region")
                menu_region = None
                
                # Find the actual starting region
                player_regions = [
                    region for region in multiworld.get_regions() 
                    if region.player == player
                ]
                
                # For single-region games, use that region as the starting region
                if len(player_regions) == 1:
                    default_start_region = player_regions[0].name
                    logger.debug(f"Using single region '{default_start_region}' as starting region for player {player}")
                else:
                    # Look for regions with no entrances (typically starting regions)
                    for region in player_regions:
                        if not region.entrances:
                            default_start_region = region.name
                            logger.debug(f"Found region '{default_start_region}' with no entrances as starting region for player {player}")
                            break

            available_regions = []
            player_regions = [
                region for region in multiworld.get_regions() 
                if region.player == player
            ]

            for region in player_regions:
                try:
                    if hasattr(region, 'can_start_at') and callable(getattr(region, 'can_start_at')):
                        try:
                            # Ensure world is passed to can_start_at if needed by the method
                            can_start = region.can_start_at(world) 
                            if (can_start):
                                region_data = {
                                    'name': region.name,
                                    'type': getattr(region, 'type', 'Region'), # Assuming extract_type_value is not needed here or applied later
                                    'dungeon': getattr(region.dungeon, 'name', None) if hasattr(region, 'dungeon') and region.dungeon else None,
                                }
                                
                                # Add game-specific region attributes from the handler
                                region_attributes = game_handler.get_region_attributes(region)
                                region_data.update(region_attributes)
                                
                                available_regions.append(region_data)
                        except Exception as e:
                            logger.error(f"Error checking can_start_at for region {region.name}: {str(e)}")
                    else:
                        pass  # Region doesn't have a callable can_start_at method
                except Exception as e:
                    logger.error(f"Error processing region {getattr(region, 'name', 'Unknown')} in start regions loop: {str(e)}")
                    continue

            export_data['start_regions'][player_str] = {
                'default': [default_start_region],
                'available': available_regions
            }

        except Exception as e:
            logger.error(f"Error in top-level start regions processing for player {player}: {str(e)}")
            logger.exception("Full traceback:")
            # Provide a fallback in case of error
            export_data['start_regions'][player_str] = {
                'default': ['Menu'],
                'available': []
            }

        # Process starting items
        try:
            starting_items_list = multiworld.precollected_items.get(player, []) # Use precollected_items
            # Extract item names directly, assuming make_serializable handles strings
            serializable_starting_items = [
                item.name for item in starting_items_list if hasattr(item, 'name')
            ]
            export_data['starting_items'][player_str] = serializable_starting_items
        except Exception as e:
            logger.error(f"Error processing starting items for player {player}: {str(e)}")
            export_data['starting_items'][player_str] = {'error': f"Failed to process starting items: {str(e)}"}

    # Add raw spoiler entrances data for debugging
    #if hasattr(multiworld, 'spoiler') and multiworld.spoiler and hasattr(multiworld.spoiler, 'entrances'):
    #    export_data['debug_spoiler_entrances'] = {}
    #    try:
    #        for key, value in multiworld.spoiler.entrances.items():
    #            # Convert key to string for JSON serialization
    #            key_str = str(key)
    #            export_data['debug_spoiler_entrances'][key_str] = make_serializable(value)
    #        logger.debug(f"Added {len(export_data['debug_spoiler_entrances'])} spoiler entrance entries for debugging")
    #    except Exception as e:
    #        logger.error(f"Error processing debug spoiler entrances: {str(e)}")
    #        export_data['debug_spoiler_entrances'] = {'error': f"Failed to process spoiler entrances: {str(e)}"}
    
    # Apply game-specific post-processing for each player
    # This is done after all standard processing to allow for cross-player analysis if needed
    for player in multiworld.player_ids:
        game_name = multiworld.game[player]
        world = multiworld.worlds[player]
        game_handler = get_game_export_handler(game_name, world)
        if game_handler and hasattr(game_handler, 'post_process_data'):
            try:
                export_data = game_handler.post_process_data(export_data)
            except Exception as e:
                logger.warning(f"Error in post_process_data for {game_name}: {e}")

    return export_data

def process_regions(multiworld, player: int, game_handler=None) -> tuple:
    """
    Process complete region data including all available backend data.
    Returns (regions_data, dungeons_data) tuple with separate structures.
    """
    
    def safe_expand_rule(game_handler, rule_func,
                         rule_target_name: Optional[str] = None,
                         target_type: Optional[str] = None,
                         world=None):
        """Analyzes rule using runtime analysis (analyze_rule)."""
        try:
            if not rule_func:
                return None
            
            # Check if game handler has an override for rule analysis (e.g., Blasphemous)
            if game_handler and hasattr(game_handler, 'override_rule_analysis'):
                override_result = game_handler.override_rule_analysis(rule_func, rule_target_name)
                if override_result:
                    return override_result

            # Extract closure variables from the rule function
            closure_vars = {}

            # Add globals from the function (for module-level imports like ChapterIndex)
            if hasattr(rule_func, '__globals__'):
                # Only include specific useful globals, not all of them
                useful_globals = ['ChapterIndex', 'HatType', 'Difficulty', 'HitType']
                for var_name in useful_globals:
                    if var_name in rule_func.__globals__:
                        closure_vars[var_name] = rule_func.__globals__[var_name]

            # Add closure variables
            if hasattr(rule_func, '__closure__') and rule_func.__closure__:
                # Get variable names from the function's code
                if hasattr(rule_func, '__code__'):
                    freevars = rule_func.__code__.co_freevars
                    for i, var_name in enumerate(freevars):
                        if i < len(rule_func.__closure__):
                            cell = rule_func.__closure__[i]
                            try:
                                closure_vars[var_name] = cell.cell_contents
                            except ValueError:
                                # Cell is empty
                                pass

            # Add world object to closure_vars if provided (may override closure value)
            if world is not None:
                closure_vars['world'] = world

            # Directly call analyze_rule, which handles recursion internally for combined rules
            analysis_result = analyze_rule(rule_func=rule_func, closure_vars=closure_vars, game_handler=game_handler, player_context=player)
            
            if analysis_result and analysis_result.get('type') != 'error':
                
                # Set context for A Hat In Time telescope rule processing
                if hasattr(game_handler, 'apply_chapter_costs_to_rule') and rule_target_name and rule_target_name.startswith("Telescope -> "):
                    analysis_result = game_handler.apply_chapter_costs_to_rule(analysis_result, rule_target_name, world)
                
                expanded = game_handler.expand_rule(analysis_result)
                return expanded
            else:
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

    def get_entrance_spoiler_data(entrance_or_exit, multiworld, player, game_name):
        """
        Parse spoiler data to determine entrance direction and connection info.
        Returns tuple of (randomization_type, reverse_name, direction).
        
        Supports multiple games with different spoiler formats:
        - ALTTP: Uses spoiler.entrances with direction='both' 
        - The Messenger: Uses spoiler.entrances with direction='both' (same format as ALTTP)
        """
        if not hasattr(multiworld, 'spoiler') or not multiworld.spoiler:
            return (getattr(entrance_or_exit, 'randomization_type', 1), None, None)
        
        entrance_name = getattr(entrance_or_exit, 'name', None)
        if not entrance_name:
            return (getattr(entrance_or_exit, 'randomization_type', 1), None, None)
        
        try:
            if hasattr(multiworld.spoiler, 'entrances') and multiworld.spoiler.entrances:
                spoiler_entries = multiworld.spoiler.entrances
                
                # Search through all spoiler entries to find this entrance
                for spoiler_key, spoiler_entry in spoiler_entries.items():
                    # Extract player from the spoiler key tuple - format is ('entrance_name', 'direction', player)
                    try:
                        # Parse the string representation of the tuple to extract player info
                        if isinstance(spoiler_key, str) and spoiler_key.startswith("(") and spoiler_key.endswith(")"):
                            # Extract the third element (player) from the tuple string
                            key_parts = spoiler_key.strip("()").split("', ")
                            if len(key_parts) >= 3:
                                spoiler_player = int(key_parts[2].strip("'"))
                                if spoiler_player != player:
                                    continue
                    except (ValueError, IndexError):
                        # If we can't parse the player from the key, skip player filtering
                        pass
                        
                    entrance_field = spoiler_entry.get('entrance')
                    exit_field = spoiler_entry.get('exit')
                    direction = spoiler_entry.get('direction')
                    
                    # Check if this entrance matches the entrance field
                    if entrance_field == entrance_name:
                        if direction == 'both':
                            return (2, exit_field, 'both')  # TWO_WAY
                        elif direction == 'entrance':
                            return (1, None, 'entrance')  # ONE_WAY entrance
                        elif direction == 'exit':
                            return (1, None, 'exit')  # ONE_WAY exit
                    
                    # Check if this entrance matches the exit field
                    elif exit_field == entrance_name:
                        if direction == 'both':
                            return (2, entrance_field, 'both')  # TWO_WAY
                        elif direction == 'entrance':
                            # This entrance is the destination of an entrance->exit connection
                            # From the destination's perspective, it receives connections but doesn't provide direction info
                            return (1, None, 'entrance')  # ONE_WAY entrance destination
                        elif direction == 'exit':
                            # This entrance is the destination of an exit->entrance connection
                            # From the destination's perspective, it receives connections 
                            return (1, None, 'exit')  # ONE_WAY exit destination
            
            # Fallback: Use the randomization_type from the entrance object itself
            randomization_type = getattr(entrance_or_exit, 'randomization_type', 1)
            if randomization_type == 2:
                pass  # TWO_WAY entrance from object, but no spoiler reverse data
            return (randomization_type, None, None)
                
        except Exception as e:
            return (getattr(entrance_or_exit, 'randomization_type', 1), None, None)


    try:
        regions_data = {}
        dungeons_data = {}  # structure to hold all dungeons
        
        # Different games have different levels of rule analysis support
        # ALTTP has detailed helper expansion, while other games may preserve more helper nodes
        game_name = multiworld.game[player]
        if not game_handler:
            game_handler = get_game_export_handler(game_name, multiworld.worlds[player])
        
        # Allow game handler to postprocess regions before extraction
        if game_handler and hasattr(game_handler, 'postprocess_regions'):
            game_handler.postprocess_regions(multiworld, player)
        
        player_regions = [
            region for region in multiworld.get_regions() 
            if region.player == player
        ]

        # Create a location name to ID mapping for this player
        location_name_to_id = {}
        if player in multiworld.worlds:
            world = multiworld.worlds[player]
            if hasattr(world, 'location_id_to_name'):
                # Create a reverse mapping from name to ID
                location_name_to_id = {name: id for id, name in world.location_id_to_name.items()}

        # First pass - collect all dungeon data
        for region in player_regions:
            if hasattr(region, 'dungeon') and region.dungeon:
                dungeon_name = getattr(region.dungeon, 'name', None)
                if dungeon_name and dungeon_name not in dungeons_data:
                    dungeon_data = {
                        'name': dungeon_name,
                        'regions': [],
                        'boss': None,
                        'medallion_check': None
                    }
                    
                    if hasattr(region.dungeon, 'regions'):
                        dungeon_data['regions'] = [r.name for r in region.dungeon.regions]
                    
                    # Handle single boss
                    if hasattr(region.dungeon, 'boss') and region.dungeon.boss:
                        dungeon_data['boss'] = {
                            'name': getattr(region.dungeon.boss, 'name', None),
                            'defeat_rule': safe_expand_rule(
                                game_handler,
                                getattr(region.dungeon.boss, 'defeat_rule', None),
                                getattr(region.dungeon.boss, 'name', None),
                                target_type='Boss',
                                world=world
                            )
                        }
                    
                    # Handle multiple bosses (e.g., Ganon's Tower has bosses['bottom'], bosses['middle'], bosses['top'])
                    if hasattr(region.dungeon, 'bosses') and region.dungeon.bosses:
                        dungeon_data['bosses'] = {}
                        for boss_key, boss in region.dungeon.bosses.items():
                            if boss:
                                dungeon_data['bosses'][boss_key] = {
                                    'name': getattr(boss, 'name', None),
                                    'defeat_rule': safe_expand_rule(
                                        game_handler,
                                        getattr(boss, 'defeat_rule', None),
                                        getattr(boss, 'name', None),
                                        target_type='Boss',
                                        world=world
                                    )
                                }
                    
                    if hasattr(region.dungeon, 'medallion_check'):
                        dungeon_data['medallion_check'] = safe_expand_rule(
                            game_handler,
                            region.dungeon.medallion_check,
                            f"{dungeon_name} Medallion Check",
                            target_type='DungeonMedallion',
                            world=world
                        )
                    
                    dungeons_data[dungeon_name] = dungeon_data

        # Second pass - process all regions
        for region in player_regions:
            try:
                region_data = {
                    'name': getattr(region, 'name', 'Unknown'),
                    'type': extract_type_value(getattr(region, 'type', 'Region')),
                    'player': getattr(region, 'player', player),
                    'entrances': [],
                    'exits': [],
                    'locations': [],
                    'time_passes': getattr(region, 'time_passes', True),
                    'provides_chest_count': getattr(region, 'provides_chest_count', True),
                    'region_rules': []
                }
                
                # Add game-specific region attributes from the handler
                region_attributes = game_handler.get_region_attributes(region)
                region_data.update(region_attributes)
                

                # Store reference to dungeon instead of full dungeon data
                if hasattr(region, 'dungeon') and region.dungeon:
                    dungeon_name = getattr(region.dungeon, 'name', None)
                    if dungeon_name:
                        region_data['dungeon'] = dungeon_name

                # Process shop data
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
                            except Exception as e:
                                logger.error(f"Error processing shop inventory item: {str(e)}")

                    region_data['shop'] = {
                        'type': getattr(region.shop, 'type', None),
                        'inventory': shop_inventory,
                        'locked': getattr(region.shop, 'locked', False),
                        'region_name': getattr(region.shop, 'region_name', None),
                        'location_name': getattr(region.shop, 'location_name', None)
                    }

                # Process entrances
                if hasattr(region, 'entrances'):
                    for entrance in region.entrances:
                        try:
                            expanded_rule = None
                            entrance_name = getattr(entrance, 'name', None)
                            if hasattr(entrance, 'access_rule') and entrance.access_rule:
                                expanded_rule = safe_expand_rule(
                                    game_handler,
                                    entrance.access_rule,
                                    entrance_name,
                                    target_type='Entrance',
                                    world=world
                                )

                                # Post-process the entrance rule if the game handler supports it
                                if expanded_rule and game_handler and hasattr(game_handler, 'postprocess_entrance_rule'):
                                    expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, entrance_name)
                                # Also call general postprocess_rule if available
                                elif expanded_rule and game_handler and hasattr(game_handler, 'postprocess_rule'):
                                    expanded_rule = game_handler.postprocess_rule(expanded_rule)
                            
                            # Get spoiler-aware entrance data for all games with entrance randomization
                            game_name = multiworld.game[player]
                            spoiler_randomization_type, spoiler_reverse, spoiler_direction = get_entrance_spoiler_data(entrance, multiworld, player, game_name)
                            final_reverse = spoiler_reverse if spoiler_reverse else (getattr(entrance.reverse, 'name', None) if hasattr(entrance, 'reverse') else None)
                            final_randomization_type = spoiler_randomization_type
                            
                            entrance_data = {
                                'name': entrance_name,
                                'parent_region': getattr(entrance.parent_region, 'name', None) if hasattr(entrance, 'parent_region') else None,
                                'access_rule': expanded_rule,
                                'connected_region': getattr(entrance.connected_region, 'name', None) if hasattr(entrance, 'connected_region') else None,
                                'reverse': final_reverse,
                                'assumed': getattr(entrance, 'assumed', False),
                                'randomization_type': final_randomization_type,
                                'direction': spoiler_direction,
                                'type': getattr(entrance, 'type', 'Entrance'),
                            }
                            region_data['entrances'].append(entrance_data)
                        except Exception as e:
                            logger.error(f"Error processing entrance {getattr(entrance, 'name', 'Unknown')}: {str(e)}")

                # Process exits
                if hasattr(region, 'exits'):
                    for exit in region.exits:
                        try:
                            expanded_rule = None
                            exit_name = getattr(exit, 'name', None)
                            if hasattr(exit, 'access_rule') and exit.access_rule:
                                # Set context for game handlers that need it (e.g., metamath)
                                if hasattr(game_handler, 'set_context'):
                                    game_handler.set_context(exit_name)
                                # Try special handling first for complex exit rules
                                if game_handler and hasattr(game_handler, 'handle_complex_exit_rule'):
                                    special_rule = game_handler.handle_complex_exit_rule(exit_name, exit.access_rule)
                                    if special_rule:
                                        expanded_rule = game_handler.expand_rule(special_rule)

                                # If no special handling, use normal analysis
                                if expanded_rule is None:
                                    expanded_rule = safe_expand_rule(
                                        game_handler,
                                        exit.access_rule,
                                        exit_name,
                                        target_type='Exit',
                                        world=world
                                    )

                                    # Post-process the exit rule if the game handler supports it
                                    if expanded_rule and game_handler and hasattr(game_handler, 'postprocess_entrance_rule'):
                                        expanded_rule = game_handler.postprocess_entrance_rule(expanded_rule, exit_name)
                                    # Also call general postprocess_rule if available
                                    elif expanded_rule and game_handler and hasattr(game_handler, 'postprocess_rule'):
                                        expanded_rule = game_handler.postprocess_rule(expanded_rule)
                            
                            # Get spoiler-aware exit data for all games with entrance randomization
                            game_name = multiworld.game[player]
                            spoiler_randomization_type, spoiler_reverse, spoiler_direction = get_entrance_spoiler_data(exit, multiworld, player, game_name)
                            final_reverse = spoiler_reverse if spoiler_reverse else (getattr(exit.reverse, 'name', None) if hasattr(exit, 'reverse') else None)
                            final_randomization_type = spoiler_randomization_type
                            
                            exit_data = {
                                'name': exit_name,
                                'connected_region': getattr(exit.connected_region, 'name', None) if hasattr(exit, 'connected_region') else None,
                                'access_rule': expanded_rule,
                                'reverse': final_reverse,
                                'randomization_type': final_randomization_type,
                                'direction': spoiler_direction,
                                'type': getattr(exit, 'type', 'Exit'),
                            }
                            region_data['exits'].append(exit_data)
                        except Exception as e:
                            logger.error(f"Error processing exit {getattr(exit, 'name', 'Unknown')}: {str(e)}")

                # Process locations
                if hasattr(region, 'locations'):
                    for location in region.locations:
                        try:
                            location_name = getattr(location, 'name', None)
                            
                            # Process access and item rules
                            access_rule_result = None
                            item_rule_result = None
                            
                            # First check if game handler has special handling for this location
                            if hasattr(location, 'access_rule') and location.access_rule:
                                # Set context for game handlers that need it (e.g., Bomb Rush Cyberfunk)
                                if hasattr(game_handler, 'set_context'):
                                    game_handler.set_context(location_name)
                                # Use normal analysis
                                access_rule_result = safe_expand_rule(
                                    game_handler,
                                    location.access_rule,
                                    location_name,
                                    target_type='Location',
                                    world=world
                                )
                                
                                # Post-process the rule if the game handler supports it
                                if access_rule_result and game_handler and hasattr(game_handler, 'postprocess_rule'):
                                    access_rule_result = game_handler.postprocess_rule(access_rule_result)
                                
                            if hasattr(location, 'item_rule') and location.item_rule:
                                item_rule_result = safe_expand_rule(
                                    game_handler,
                                    location.item_rule,
                                    f"{location_name} Item Rule",
                                    target_type='LocationItemRule',
                                    world=world
                                )
                            
                            
                            location_data = {
                                'name': location_name,
                                'id': location_name_to_id.get(location_name, None),  # Add location ID from mapping
                                'access_rule': access_rule_result,
                                'item_rule': item_rule_result,
                                'progress_type': extract_type_value(getattr(location, 'progress_type', None)),
                                'locked': getattr(location, 'locked', False),
                                'item': None
                            }

                            # Add game-specific location attributes from the handler
                            location_attributes = game_handler.get_location_attributes(location, world)
                            location_data.update(location_attributes)
                            
                            if hasattr(location, 'item') and location.item:
                                item_name = getattr(location.item, 'name', None)
                                original_type = extract_type_value(getattr(location.item, 'type', None))
                                effective_type = game_handler.get_effective_item_type(item_name, original_type) if game_handler and item_name else original_type
                                
                                location_data['item'] = {
                                    'name': item_name,
                                    'player': getattr(location.item, 'player', None),
                                    'advancement': getattr(location.item, 'advancement', False),
                                    'priority': getattr(location.item, 'priority', None),
                                    'type': effective_type
                                }
                            
                            region_data['locations'].append(location_data)
                        except Exception as e:
                            logger.error(f"Error processing location {getattr(location, 'name', 'Unknown')}: {str(e)}")

                # Process region rules
                if hasattr(region, 'region_rules'):
                    for i, rule in enumerate(region.region_rules):
                        try:
                            # Construct a target name for region rules
                            rule_target_name = f"{region.name} Rule {i+1}"
                            expanded_rule = safe_expand_rule(
                                game_handler,
                                rule,
                                rule_target_name,
                                target_type='RegionRule',
                                world=world
                            )
                            if expanded_rule:
                                region_data['region_rules'].append(expanded_rule)
                        except Exception as e:
                            logger.error(f"Error processing region rule: {str(e)}")

                regions_data[region.name] = region_data

            except Exception as e:
                logger.error(f"Error processing region {getattr(region, 'name', 'Unknown')}: {str(e)}")
                logger.exception("Full traceback:")
                continue

        return regions_data, dungeons_data

    except Exception as e:
        logger.error(f"Error in process_regions: {str(e)}")
        logger.exception("Full traceback:")
        raise

def process_items(multiworld, player: int, itempool_counts: Dict[str, int]) -> Dict[str, Any]:
    """Process item data including progression flags and capacity information."""
    items_data = {}
    world = multiworld.worlds[player]
    game_name = multiworld.game[player]
    game_handler = get_game_export_handler(game_name, world) # Get game handler
    
    # 1. Start with game-specific item data from the handler
    try:
        items_data = game_handler.get_item_data(world)
        if not items_data:
             logger.warning(f"Handler for {game_name} returned no item data. Item export might be incomplete.")
    except Exception as e:
        logger.error(f"Error getting game-specific item data for {game_name}: {e}")
        items_data = {} # Start empty if handler fails

    # 2. Layer in base item IDs and groups from world.item_id_to_name
    for item_id, item_name in getattr(world, 'item_id_to_name', {}).items():
        if item_name not in items_data:
            # If item is in ID map but not handler data, create a basic entry
            #logger.warning(f"Item '{item_name}' found in item_id_to_name but not in handler data for {game_name}. Creating basic entry.")
            items_data[item_name] = {
                'name': item_name,
                'id': item_id,
                'groups': [],
                'advancement': False, 'priority': False, 'useful': False, 'trap': False, 'event': False,
                'type': None, 'max_count': 1
            }
        else:
            # Ensure the ID from the world map is added if missing
            if items_data[item_name].get('id') is None:
                items_data[item_name]['id'] = item_id
        
        # Add groups from world.item_name_groups if they aren't already present
        base_groups = [
            group_name for group_name, items in getattr(world, 'item_name_groups', {}).items() 
            if item_name in items
        ]
        if item_name in items_data:
            # Ensure groups key exists
            if 'groups' not in items_data[item_name] or not isinstance(items_data[item_name]['groups'], list):
                 items_data[item_name]['groups'] = []
                 
            existing_groups = set(items_data[item_name]['groups'])
            new_groups_added = False
            for group in base_groups:
                if group not in existing_groups:
                    items_data[item_name]['groups'].append(group)
                    existing_groups.add(group)
                    new_groups_added = True
            if new_groups_added:
                 items_data[item_name]['groups'].sort()

    # 3. Update classification flags from placed items (use values from placed items if not set by handler)
    for location in multiworld.get_locations(player):
        if location.item and location.item.name in items_data:
            item_data = items_data[location.item.name]
            # Only update flags if they are still default (False)
            if not item_data.get('advancement'):
                item_data['advancement'] = getattr(location.item, 'advancement', False)
            if not item_data.get('priority'):
                item_data['priority'] = getattr(location.item, 'priority', False)
            if not item_data.get('useful'):
                 item_data['useful'] = getattr(location.item, 'useful', False)
            if not item_data.get('trap'):
                 item_data['trap'] = getattr(location.item, 'trap', False)
            # Event flag likely comes from type, less critical to update here unless specific logic requires it

    # 3b. Also check precollected items for advancement status
    if player in multiworld.precollected_items:
        for item in multiworld.precollected_items[player]:
            if item.name in items_data:
                item_data = items_data[item.name]
                # Only update flags if they are still default (False)
                if not item_data.get('advancement'):
                    item_data['advancement'] = getattr(item, 'advancement', False)
                if not item_data.get('priority'):
                    item_data['priority'] = getattr(item, 'priority', False)
                if not item_data.get('useful'):
                    item_data['useful'] = getattr(item, 'useful', False)
                if not item_data.get('trap'):
                    item_data['trap'] = getattr(item, 'trap', False)

    # 4. Get and apply game-specific max counts
    try:
        game_max_counts = game_handler.get_item_max_counts(world)
        for item_name, max_count in game_max_counts.items():
            if item_name in items_data:
                items_data[item_name]['max_count'] = max_count
            else:
                 logger.warning(f"Item '{item_name}' found in max counts for {game_name} but not in items_data.")
    except Exception as e:
        logger.error(f"Error getting game-specific max counts for {game_name}: {e}")

    # Correct max_count for stackable items using itempool_counts
    if itempool_counts and 'error' not in itempool_counts:
        for item_name, item_data in items_data.items():
            # If the item's max_count is the default of 1...
            if item_data.get('max_count') == 1:
                pool_count = itempool_counts.get(item_name)
                # ... and the item appears more than once in the pool...
                if pool_count and pool_count > 1:
                    # ... then update max_count to match the pool count.
                    item_data['max_count'] = pool_count

    return items_data

def process_item_groups(multiworld, player: int) -> List[str]:
    """Get item groups for this player."""
    world = multiworld.worlds[player]
    if hasattr(world, 'item_name_groups'):
        return sorted(world.item_name_groups.keys())
    return []

def process_progression_mapping(multiworld, player: int) -> Dict[str, Any]:
    """Extract progression item mapping data using the game handler."""
    try:
        world = multiworld.worlds[player]
        game_name = multiworld.game[player]
        game_handler = get_game_export_handler(game_name, world)
        return game_handler.get_progression_mapping(world)
    except Exception as e:
        game_name = multiworld.game.get(player, "Unknown")
        logger.error(f"Error getting progression mapping for game '{game_name}': {e}")
        logger.exception("Traceback:")
        return {} # Return empty on error

def cleanup_export_data(data):
    """
    Clean up specific fields in the export data that need special handling.
    This is applied after the initial serialization.
    """
    # Track the game type for each player to apply appropriate handler
    player_games = {}
    
    # Get player game mapping (needed for handler selection)
    # We need this info before cleaning settings, so iterate over settings first
    # even if settings themselves aren't cleaned until later
    if 'settings' in data and isinstance(data['settings'], dict):
        for player_id, settings_data in data['settings'].items():
            if isinstance(settings_data, dict) and 'game' in settings_data:
                player_games[player_id] = settings_data['game']
            else:
                # Attempt to get game name from game_info as a fallback
                if 'game_info' in data and player_id in data['game_info'] and 'name' in data['game_info'][player_id]:
                    player_games[player_id] = data['game_info'][player_id]['name']
                else:
                    logger.warning(f"Could not determine game for player {player_id} in cleanup")
                    player_games[player_id] = "unknown" # Default if not found
                    
    # Ensure game_info is properly structured (this might still be useful)
    if 'game_info' in data:
        for player_id, game_info in data['game_info'].items():
            # Make sure game_info has the game name
            if 'name' not in game_info and player_id in player_games:
                game_info['name'] = player_games[player_id]
            
            # Ensure rule_format exists
            if 'rule_format' not in game_info:
                game_info['rule_format'] = {"version": "1.0"}

    # Clean up settings fields
    if 'settings' in data:
        for player, settings in data['settings'].items():
            if not isinstance(settings, dict) or 'error' in settings: # Skip if not dict or already an error
                continue
            game = player_games.get(player, "unknown") # Get game name retrieved earlier
            game_handler = get_game_export_handler(game)  # World not available during cleanup
            try:
                # Delegate cleanup to the specific handler
                # Pass a copy to avoid modifying the original dict used elsewhere if cleanup fails partially
                cleaned_settings = game_handler.cleanup_settings(settings.copy())
                data['settings'][player] = cleaned_settings # Update with cleaned settings
            except Exception as e:
                logger.error(f"Error cleaning settings via handler for player {player} ({game}): {e}")
                # Keep original settings in case of error during cleanup

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
    
    return data

# --- Helper for Field Exclusion ---
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

# --- Helper function for common data processing steps ---
def _get_cleaned_rules_data(multiworld) -> Dict[str, Any]:
    """
    Prepares, serializes, and cleans rule data. Does NOT apply field exclusions.
    """
    try:
        export_data = prepare_export_data(multiworld)
        # Apply serialization and cleanup - important for consistent output
        serializable_data = make_serializable(export_data)
        cleaned_data = cleanup_export_data(serializable_data)
        return cleaned_data
    except Exception as e:
        logger.error(f"Error preparing or cleaning rule data: {e}")
        logger.exception("Full traceback during data preparation/cleaning:")
        # Consider returning a partial structure or raising? For now, return empty.
        return {}


# --- Game Rules Export ---
def export_game_rules(multiworld, output_dir: str, filename_base: str, save_presets: bool = False, skip_preset_copy_if_rules_identical: bool = False) -> Dict[str, str]:
    """
    Exports game rules to JSON files for frontend consumption.
    Also saves a copy of rules to frontend/presets with game name as prefix if save_presets is True.

    Args:
        multiworld: MultiWorld instance containing game rules
        output_dir: Directory to write output files
        filename_base: Base name for output files
        save_presets: Whether to save copies of files to the presets directory
        skip_preset_copy_if_rules_identical: If True, skip copying to presets if files are identical

    Returns:
        Dict containing paths to generated files
    """
    
    os.makedirs(output_dir, exist_ok=True)

    # --- Configuration for Excluded Fields (now defined globally) ---
    
    # --- Field Exclusion Helpers (now defined globally) --- 
    
    # --- Define key categories and order ---
    desired_key_order = [
        'schema_version',
        'game_name',
        'game_directory',
        'archipelago_version',
        'generation_seed',
        'player_names',
        'world_classes',
        'plando_options',
        'regions',
        'dungeons',
        'start_regions',
        'items',
        'item_groups',
        'itempool_counts',
        'progression_mapping',
        'starting_items',
        'settings',
        'game_info',
        'metamath_data'
    ]

    # Player-specific keys contain data nested under player IDs
    player_specific_keys = [
        'regions', 'dungeons', 'items', 'item_groups', 'progression_mapping',
        'settings', 'start_regions', 'itempool_counts', 'game_info',
        'starting_items', 'metamath_data'
    ]

    # Prepare the combined export data for all players using the helper
    cleaned_data = _get_cleaned_rules_data(multiworld)
    if not cleaned_data: # Handle potential errors from the helper
        logger.error("Failed to get cleaned data, cannot export game rules.")
        return {}

    # --- Helper function to create an ordered dictionary with proper field ordering ---
    def create_ordered_export_data(data, game_name=None, player_id=None):
        """
        Create an ordered dictionary with fields in the desired order.
        
        Args:
            data: The data to order
            game_name: Game name to include (if provided)
            player_id: If provided, extract only this player's data from player-specific fields
            
        Returns:
            OrderedDict with fields in desired order
        """
        ordered_data = collections.OrderedDict()
        
        # Process each key in the desired order
        for key in desired_key_order:
            # Special handling for game_name
            if key == 'game_name':
                if game_name:
                    ordered_data[key] = game_name
                continue

            # Special handling for game_directory
            if key == 'game_directory':
                if game_name:
                    # Use the get_world_directory_name function to get the directory name
                    game_directory = get_world_directory_name(game_name)
                    ordered_data[key] = game_directory
                continue

            # Special handling for dungeons (only include if it exists)
            if key == 'dungeons':
                if key in data:
                    if player_id is not None:
                        # For player-specific exports, only include this player's dungeons
                        if player_id in data[key]:
                            ordered_data[key] = {player_id: data[key][player_id]}
                    else:
                        # For combined exports, include all dungeons
                        ordered_data[key] = data[key]
                continue
                
            # Handle player-specific fields
            if key in player_specific_keys and key in data:
                if player_id is not None:
                    # For player-specific exports, only include this player's data
                    if player_id in data[key]:
                        ordered_data[key] = {player_id: data[key][player_id]}
                else:
                    # For combined exports, include all data
                    ordered_data[key] = data[key]
                continue
                
            # Handle normal fields
            if key in data:
                ordered_data[key] = data[key]
        
        # Add any keys not in the desired order at the end
        for key, value in data.items():
            if key not in ordered_data and key not in player_specific_keys:
                ordered_data[key] = value
                logger.warning(f"Key '{key}' was not in desired_key_order, added to end of export")
                
        return ordered_data
    
    # --- Helper function to write export data to a file ---
    def write_export_data(data, filepath):
        """
        Apply exclusions and write data to a JSON file.
        
        Args:
            data: The data to write
            filepath: The output file path
            
        Returns:
            Boolean indicating success
        """
        try:
            # Apply field exclusions
            filtered_data = remove_excluded_fields(data, EXCLUDED_FIELDS)
            
            # Apply context-specific exclusions
            if CONTEXT_EXCLUDED_FIELDS:
                filtered_data = process_field_exclusions(
                    filtered_data,
                    context_excluded_fields=CONTEXT_EXCLUDED_FIELDS,
                    global_excluded_fields=EXCLUDED_FIELDS
                )

            # Write to file
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(filtered_data, f, indent=2)
            logger.info(f"Successfully wrote rules to {filepath}")
            return True
        except Exception as e:
            logger.error(f"Error writing rules export file {filepath}: {e}")
            return False
    
    results = {}
    
    # --- Determine Game Name for Combined File ---
    combined_game_name = "Unknown"
    if multiworld.game:
        unique_games = set(g for g in multiworld.game.values() if g)
        if len(unique_games) > 1:
            combined_game_name = "Multiworld"
        elif len(unique_games) == 1:
            combined_game_name = sorted(unique_games)[0]
        else:
            combined_game_name = "Unknown"
    
    # --- Process Combined Export (all players) ---
    combined_rules_path = os.path.join(output_dir, f"{filename_base}_rules.json")
    ordered_data = create_ordered_export_data(cleaned_data, game_name=combined_game_name)
    
    if write_export_data(ordered_data, combined_rules_path):
        results['rules_combined'] = combined_rules_path
    else:
        # Handle failure if needed
        pass
    
    # --- Process Player-Specific Exports ---
    # Only create individual player files if more than one player
    if len(multiworld.player_ids) > 1:
        for player in multiworld.player_ids:
            player_str = str(player)
            player_game_name = multiworld.game.get(player, "Unknown")
            player_rules_path = os.path.join(output_dir, f"{filename_base}_P{player_str}_rules.json")
            
            # Create ordered player-specific data
            player_data = create_ordered_export_data(cleaned_data, game_name=player_game_name, player_id=player_str)
            
            # Write player-specific file
            if write_export_data(player_data, player_rules_path):
                results[f"rules_p{player_str}"] = player_rules_path
            else:
                results[f"rules_p{player_str}"] = f"ERROR: Failed to write file"

    # If save_presets is False, skip the preset saving parts
    if not save_presets:
        return results

    # --- Save presets ---
    try:
        # Determine if it's a multi-game world for naming purposes
        if not multiworld.game:
            logger.warning("No game data found in multiworld object, skipping preset save")
            return results
            
        unique_games = set(g for g in multiworld.game.values() if g) # Get unique, non-empty game names
        
        is_multi_game = len(unique_games) > 1
        
        # Determine game name for folder
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
            
            # Get the world directory name for use in a filename/folder
            clean_game_name = get_world_directory_name(game_name)
            logger.info(f"Detected single game world ({game_name}), using '{clean_game_name}' preset folder.")

        # Determine preset directories
        presets_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'presets')
        os.makedirs(presets_dir, exist_ok=True)
        
        # Create game-specific directory
        game_dir = os.path.join(presets_dir, clean_game_name)
        os.makedirs(game_dir, exist_ok=True)
        
        # Create a folder for this specific preset
        preset_dir = os.path.join(game_dir, filename_base)

        # --- Check if preset update is needed ---
        needs_update = True 
        if os.path.exists(preset_dir):
            try:
                # Compare files in output_dir and preset_dir
                output_files = sorted([f for f in os.listdir(output_dir) if f.endswith('.json') and os.path.isfile(os.path.join(output_dir, f))])
                preset_files = sorted([f for f in os.listdir(preset_dir) if f.endswith('.json') and os.path.isfile(os.path.join(preset_dir, f))])

                if set(output_files) == set(preset_files):
                    # Same files exist in both dirs, compare content
                    all_match = True
                    for filename in output_files:
                        output_path = os.path.join(output_dir, filename)
                        preset_path = os.path.join(preset_dir, filename)
                        try:
                            with open(output_path, 'r', encoding='utf-8') as f_out, open(preset_path, 'r', encoding='utf-8') as f_pre:
                                output_json = json.load(f_out)
                                preset_json = json.load(f_pre)
                                if output_json != preset_json:
                                    all_match = False
                                    logger.info(f"Preset content mismatch found in {filename}. Update needed.")
                                    break
                        except Exception as e:
                            logger.warning(f"Error comparing preset file {filename}: {e}. Assuming update needed.")
                            all_match = False
                            break
                    
                    if all_match and skip_preset_copy_if_rules_identical:
                        needs_update = False
                        logger.info(f"Preset {preset_dir} is up-to-date. Skipping file copy.")
            except Exception as e:
                logger.error(f"Error checking existing preset directory {preset_dir}: {e}. Proceeding with update.")
                needs_update = True

        # --- Update preset if needed ---
        if needs_update:
            logger.info(f"Updating preset directory: {preset_dir}")
            
            # Create or clear preset directory
            if not os.path.exists(preset_dir):
                os.makedirs(preset_dir)
                logger.info(f"Created new preset directory: {preset_dir}")
            else:
                # Clear existing files
                for item in os.listdir(preset_dir):
                    item_path = os.path.join(preset_dir, item)
                    try:
                        if os.path.isfile(item_path):
                            os.remove(item_path)
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                    except Exception as e:
                        logger.error(f"Error removing item {item_path}: {e}")

            # Copy files from output_dir to preset_dir
            files_copied = 0
            for file_name in os.listdir(output_dir):
                src_file = os.path.join(output_dir, file_name)
                if os.path.isfile(src_file):
                    try:
                        dst_file = os.path.join(preset_dir, file_name)
                        shutil.copy2(src_file, dst_file)
                        files_copied += 1
                    except Exception as e:
                        logger.error(f"Error copying file {src_file} to {preset_dir}: {e}")
            
            logger.info(f"Copied {files_copied} files to preset directory {preset_dir}")
            
            # Get list of files after copying
            try:
                preset_files = sorted([f for f in os.listdir(preset_dir) if os.path.isfile(os.path.join(preset_dir, f))])
            except Exception as e:
                logger.error(f"Error listing files in updated preset directory {preset_dir}: {e}")
                preset_files = []

            # --- Update preset index file ---
            preset_index_path = os.path.join(presets_dir, 'preset_files.json')
            preset_index = {}
            
            # Load existing index if available
            if os.path.exists(preset_index_path):
                try:
                    with open(preset_index_path, 'r', encoding='utf-8') as f:
                        preset_index = json.load(f)
                except Exception as e:
                    logger.error(f"Error reading preset_files.json: {e}")
                    preset_index = {}

            # Initialize game entry if needed
            if clean_game_name not in preset_index:
                preset_index[clean_game_name] = {
                    "name": game_name,
                    "folders": {}
                }
            elif "folders" not in preset_index[clean_game_name]:
                preset_index[clean_game_name]["folders"] = {}
            
            # Prepare player game data
            player_game_data = []
            for player_id in multiworld.player_ids:
                # Use getattr to safely access player_name and provide a default
                player_name = getattr(multiworld, 'player_name', {}).get(player_id, f"Player {player_id}")
                player_game_data.append({
                    "player": player_id,
                    "name": player_name,
                    "game": multiworld.game.get(player_id, "Unknown Game")
                })

            # Update preset entry
            preset_index[clean_game_name]["folders"][filename_base] = {
                "seed": multiworld.seed,
                "games": player_game_data,
                "files": preset_files
            }
            
            # Write updated index
            try:
                with open(preset_index_path, 'w', encoding='utf-8') as f:
                    json.dump(preset_index, f, indent=2)
                logger.info(f"Updated preset_files.json with {len(preset_files)} files for {clean_game_name}/{filename_base}")
            except Exception as e:
                logger.error(f"Error writing updated preset_files.json: {e}")

    except Exception as e:
        # Log but don't fail if preset saving fails
        logger.error(f"Error during preset saving: {e}")
        logger.exception("Exception details during preset saving:")

    return results

# --- Field Exclusion Processing ---
def process_field_exclusions(data, context_excluded_fields=None, global_excluded_fields=None, context_path=None):
    """
    Process all configured field exclusions on the data.
    
    Args:
        data: The data structure to process
        context_excluded_fields: Dict mapping parent fields to lists of child fields to exclude
                                (e.g. {'entrances': ['access_rule']})
        global_excluded_fields: Set of fields to exclude everywhere
        context_path: Current path in the data structure (for recursive calls)
        
    Returns:
        Processed data with excluded fields removed
    """
    if context_path is None:
        context_path = []
    
    # Use empty defaults if not provided
    if context_excluded_fields is None:
        context_excluded_fields = {}
        
    if global_excluded_fields is None:
        global_excluded_fields = set()
    
    # First process each object based on its context
    current_context = context_path[-1] if context_path else None
    
    if isinstance(data, dict):
        # Apply exclusions for the current context
        if current_context in context_excluded_fields:
            fields_to_exclude = context_excluded_fields[current_context]
            for field in fields_to_exclude:
                if field in data:
                    del data[field]
        
        # Process each field recursively with updated context
        for key, value in list(data.items()):
            if isinstance(value, (dict, list)):
                new_context_path = context_path + [key]
                data[key] = process_field_exclusions(
                    value, 
                    context_excluded_fields,
                    global_excluded_fields,
                    new_context_path
                )
                
    elif isinstance(data, list):
        # For lists, process each item with the current context
        for i, item in enumerate(data):
            if isinstance(item, (dict, list)):
                data[i] = process_field_exclusions(
                    item, 
                    context_excluded_fields,
                    global_excluded_fields,
                    context_path
                )
    
    # Apply global exclusions at all levels
    if isinstance(data, dict):
        for field in global_excluded_fields:
            if field in data:
                del data[field]
                
    return data