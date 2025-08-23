# exporter/games/alttp.py

from .base import BaseGameExportHandler
from typing import Any, Dict, Optional, Set, List
from worlds.alttp.Items import item_table, progression_mapping
from BaseClasses import ItemClassification
import collections
import logging

logger = logging.getLogger(__name__) # Add logger if needed later


class ALttPGameExportHandler(BaseGameExportHandler): # Ensure correct inheritance
    """No longer expands helpers - just validates they're known ALTTP helpers"""
    
    def __init__(self):
        # Define ALTTP-specific helpers that should NOT be expanded
        self.known_helpers = {
            'GanonDefeatRule',
            'basement_key_rule',
            'can_activate_crystal_switch',
            'can_bomb_or_bonk',
            'can_extend_magic',
            'can_get_good_bee',
            'can_kill_most_things',
            'can_lift_heavy_rocks',
            'can_lift_rocks',
            'can_melt_things',
            'can_retrieve_tablet',
            'can_shoot_arrows',
            'can_use_bombs',
            'has_beam_sword',
            'has_crystals',
            'has_fire_source',
            'has_hearts',
            'has_melee_weapon',
            'has_misery_mire_medallion',
            'has_sword',
            'has_turtle_rock_medallion',
            'item_name_in_location_names',
            'tr_big_key_chest_keys_needed',
            'location_item_name',
            # If we encounter orig_rule, that means something is probably wrong.
            # Currently, it appears in the item_rule entries, which aren't included in the json file
            'orig_rule', 
        }

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Override to validate helper names instead of expanding them."""
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        if rule_type == 'helper':
            helper_name = rule.get('name')
            if helper_name not in self.known_helpers:
                logger.warning(f"Unknown ALTTP helper found: {helper_name}. Preserving.")
            # Always return the helper node as-is for ALTTP
            return rule

        # Recursively process conditions in boolean operations
        if rule_type in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
        
        # Recursively process nested conditions
        if rule_type == 'not':
             rule['condition'] = self.expand_rule(rule.get('condition'))
        if rule_type == 'conditional':
             rule['test'] = self.expand_rule(rule.get('test'))
             rule['if_true'] = self.expand_rule(rule.get('if_true'))
             rule['if_false'] = self.expand_rule(rule.get('if_false'))
             
        # Handle other potential nested rules here
        if rule_type == 'all_of':
             rule['element_rule'] = self.expand_rule(rule.get('element_rule'))
             # Comprehension details usually don't contain rules to expand

        return rule

    def replace_name(self, name: str) -> str:
        """Replace ALTTP-specific name references with standard equivalents."""
        if name == 'ep_boss' or name == 'ep_prize':
            logger.debug(f"ALTTP: Replacing '{name}' with 'location'")
            return 'location'
        return name
        
    def handle_special_function_call(self, func_name: str, processed_args: list) -> dict:
        """Handle ALTTP-specific special function calls."""
        if func_name == 'tr_big_key_chest_keys_needed':
            logger.debug(f"ALTTP: Converting local function {func_name} to helper call")
            return {
                'type': 'helper',
                'name': func_name,
                'args': processed_args
            }
        return None

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return ALTTP-specific item table data."""
        alttp_items_data = {}
        # Use the imported item_table
        for item_name, item_data in item_table.items():
            # Get groups this item belongs to (logic moved from exporter.py)
            groups = [
                group_name for group_name, items in getattr(world, 'item_name_groups', {}).items()
                if item_name in items
            ]
            # If no groups and item has a type, add type as a group
            item_type_from_data = getattr(item_data, 'type', None) # Safer getattr for type
            if not groups and item_type_from_data:
                groups = [item_type_from_data]

            item_classification = getattr(item_data, 'classification', None) # Get classification safely
            item_type = getattr(item_data, 'type', None) # Get type safely

            alttp_items_data[item_name] = {
                'name': item_name,
                'id': getattr(item_data, 'code', None), # Use code if available
                'groups': sorted(groups),
                'advancement': item_classification == ItemClassification.progression if item_classification else False,
                'priority': False, # Default priority to False here
                'useful': item_classification == ItemClassification.useful if item_classification else False,
                'trap': item_classification == ItemClassification.trap if item_classification else False,
                'event': item_type == 'Event' if item_type else False,
                'type': item_type,
                'max_count': 1 # Default, overridden by get_item_max_counts if needed
            }
        return alttp_items_data

    def get_item_max_counts(self, world) -> Dict[str, int]:
        """Return ALTTP-specific maximum counts."""
        # Moved from exporter.py
        return {
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

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return ALTTP-specific progression item mapping."""
        mapping_data = {}
        # Use the imported progression_mapping
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

    # --- Add overrides for itempool/settings/info/cleanup ---
    def get_itempool_counts(self, world, multiworld, player) -> Dict[str, int]:
        """Calculate ALTTP item counts including dungeon items."""
        # Start with generic counts
        itempool_counts = collections.defaultdict(int)
        for item in multiworld.itempool:
            if item.player == player:
                itempool_counts[item.name] += 1
        if hasattr(multiworld, 'precollected_items'):
            for item in multiworld.precollected_items.get(player, []):
                itempool_counts[item.name] += 1
        for location in multiworld.get_locations(player):
             if location.item and location.item.player == player:
                itempool_counts[location.item.name] += 1

        # Add ALTTP dungeon-specific items
        if hasattr(world, 'dungeons'):
            for dungeon in world.dungeons:
                dungeon_name = getattr(dungeon, 'name', '')
                if dungeon_name:
                    # Count small keys
                    small_key_name = f'Small Key ({dungeon_name})'
                    if hasattr(dungeon, 'small_key_count') and dungeon.small_key_count > 0:
                         # Only add if not already present (e.g., from itempool)
                         if small_key_name not in itempool_counts:
                            itempool_counts[small_key_name] = dungeon.small_key_count

                    # Add big key
                    big_key_name = f'Big Key ({dungeon_name})'
                    if hasattr(dungeon, 'big_key') and dungeon.big_key:
                         if big_key_name not in itempool_counts:
                            itempool_counts[big_key_name] = 1

        # Add ALTTP-specific max counts
        if hasattr(world, 'difficulty_requirements'):
             if hasattr(world.difficulty_requirements, 'progressive_bottle_limit'):
                 itempool_counts['__max_progressive_bottle'] = world.difficulty_requirements.progressive_bottle_limit
             if hasattr(world.difficulty_requirements, 'boss_heart_container_limit'):
                itempool_counts['__max_boss_heart_container'] = world.difficulty_requirements.boss_heart_container_limit
             if hasattr(world.difficulty_requirements, 'heart_piece_limit'):
                itempool_counts['__max_heart_piece'] = world.difficulty_requirements.heart_piece_limit

        return dict(sorted(itempool_counts.items()))

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extract ALTTP settings."""
        settings_dict = {'game': multiworld.game[player]}

        # Helper to safely extract option values
        def extract_option(option_name):
            option = getattr(world.options, option_name, None)
            # Check if the option has a 'value' attribute (like Option objects)
            # Otherwise, return the option itself (might be a direct value like bool/int)
            return getattr(option, 'value', option)

        # ALTTP specific settings from multiworld
        alttp_settings_mw = [
            'dark_room_logic', 'retro_bow', 'swordless', 'enemy_shuffle',
            'enemy_health', 'enemy_damage', 'bombless_start', 'glitches_required',
            'pot_shuffle', 'dungeon_counters', 'glitch_boots', 'accessibility',
            'mode', # Mode is crucial
            'crystals_needed_for_gt', 'crystals_needed_for_ganon', # Crystal requirements
        ]
        for setting in alttp_settings_mw:
             settings_dict[setting] = extract_option(setting)

        # ALTTP specific settings from world or world.options
        if hasattr(world, 'options'):
             # Shuffle Capacity Upgrades
             scu_option = getattr(world.options, 'shuffle_capacity_upgrades', None)
             settings_dict['shuffle_capacity_upgrades'] = getattr(scu_option, 'value', scu_option)
        else:
             settings_dict['shuffle_capacity_upgrades'] = None # Or a default

        # Treasure Hunt Required
        settings_dict['treasure_hunt_required'] = getattr(world, 'treasure_hunt_required', 0) # Default 0

        # Difficulty requirements
        if hasattr(world, 'difficulty_requirements'):
             settings_dict['difficulty_requirements'] = {
                 'progressive_bottle_limit': getattr(world.difficulty_requirements, 'progressive_bottle_limit', None),
                 'boss_heart_container_limit': getattr(world.difficulty_requirements, 'boss_heart_container_limit', None),
                 'heart_piece_limit': getattr(world.difficulty_requirements, 'heart_piece_limit', None),
             }
        else:
             settings_dict['difficulty_requirements'] = {}

        # Medallions
        if hasattr(world, 'required_medallions'):
             # Extract medallion names (assuming they have a 'name' attribute or similar)
             # Handle potential errors if 'name' attribute is missing
             medallion_names = []
             for med in world.required_medallions:
                 med_name = getattr(med, 'name', None)
                 if med_name is None:
                     # Fallback for Enum members or other objects without 'name'
                     med_name = getattr(med, 'value', str(med))
                 medallion_names.append(med_name)

             settings_dict['required_medallions'] = medallion_names
             # Store the actual values used for logic checks too, with fallbacks
             mire_med = getattr(world, 'misery_mire_medallion', medallion_names[0] if medallion_names else None)
             tr_med = getattr(world, 'turtle_rock_medallion', medallion_names[1] if len(medallion_names) > 1 else None)
             settings_dict['misery_mire_medallion'] = getattr(mire_med, 'value', str(mire_med))
             settings_dict['turtle_rock_medallion'] = getattr(tr_med, 'value', str(tr_med))
        else:
             settings_dict['required_medallions'] = []
             settings_dict['misery_mire_medallion'] = None
             settings_dict['turtle_rock_medallion'] = None

        # Add ALTTP-specific location collections used in rule logic
        settings_dict['location_collections'] = {
            'randomizer_room_chests': [
                'Ganons Tower - Randomizer Room - Top Left',
                'Ganons Tower - Randomizer Room - Top Right', 
                'Ganons Tower - Randomizer Room - Bottom Left',
                'Ganons Tower - Randomizer Room - Bottom Right'
            ],
            'compass_room_chests': [
                'Ganons Tower - Compass Room - Top Left',
                'Ganons Tower - Compass Room - Top Right',
                'Ganons Tower - Compass Room - Bottom Left',
                'Ganons Tower - Compass Room - Bottom Right',
                'Ganons Tower - Conveyor Star Pits Pot Key'
            ],
            'back_chests': [
                'Ganons Tower - Bob\'s Chest',
                'Ganons Tower - Big Chest', 
                'Ganons Tower - Big Key Room - Left',
                'Ganons Tower - Big Key Room - Right',
                'Ganons Tower - Big Key Chest'
            ]
        }

        return settings_dict

    def get_game_info(self, world) -> Dict[str, Any]:
         """ Gets ALTTP game info. """
         return {
             "name": "A Link to the Past",
             "rule_format": { "version": "1.0" } # Or update if specific format version needed
         }

    # Define mappings within the class or load from a helper module
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
        'shuffle_capacity_upgrades': {0: 'off', 1: 'on', 2: 'progressive'} # Assuming numeric values
    }
    alttp_boolean_settings = [
        'retro_bow', 'swordless', 'enemy_shuffle', 'bombless_start'
    ]

    def cleanup_settings(self, settings_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Clean up ALTTP settings using specific mappings."""
        logger.debug(f"Cleaning ALTTP settings: {settings_dict}")
        cleaned_settings = settings_dict.copy() # Work on a copy
        for setting_name, value in settings_dict.items():
            # Skip error values
            if isinstance(value, str) and value.startswith("ERROR:"):
                continue

            # Apply numeric->string mapping
            if setting_name in self.alttp_setting_mappings and isinstance(value, int):
                if value in self.alttp_setting_mappings[setting_name]:
                    cleaned_settings[setting_name] = self.alttp_setting_mappings[setting_name][value]
                    logger.debug(f"Mapped setting '{setting_name}' from {value} to {cleaned_settings[setting_name]}")
                else:
                    logger.warning(f"Unknown ALTTP setting value for {setting_name}: {value}")
                    cleaned_settings[setting_name] = f"unknown_{value}"

            # Ensure booleans are correct type
            if setting_name in self.alttp_boolean_settings:
                if isinstance(value, int):
                    cleaned_settings[setting_name] = bool(value)
                    logger.debug(f"Converted setting '{setting_name}' to boolean: {cleaned_settings[setting_name]}")
                # Add check for string 'true'/'false' if necessary
                elif isinstance(value, str) and value.lower() in ['true', 'false']:
                     cleaned_settings[setting_name] = value.lower() == 'true'
                     logger.debug(f"Converted setting '{setting_name}' str to boolean: {cleaned_settings[setting_name]}")

        # Cleanup medallion names if they were extracted directly from enum objects
        for med_key in ['misery_mire_medallion', 'turtle_rock_medallion']:
            current_value = cleaned_settings.get(med_key)
            if isinstance(current_value, str) and '(' in current_value and 'Medallion' in current_value:
                 try:
                    # Extract from format like 'Medallion(Bombos)'
                    extracted = current_value.split('(', 1)[1].split(')', 1)[0]
                    cleaned_settings[med_key] = extracted
                    logger.debug(f"Cleaned medallion '{med_key}' to '{extracted}'")
                 except Exception as e:
                     logger.warning(f"Could not clean medallion value: {current_value} - Error: {e}")


        logger.debug(f"Finished cleaning ALTTP settings: {cleaned_settings}")
        return cleaned_settings

    def get_region_attributes(self, region) -> Dict[str, Any]:
        """
        Add ALTTP-specific region attributes like light/dark world.
        
        Args:
            region: The region object being processed
            
        Returns:
            Dictionary with ALTTP-specific region attributes
        """
        attributes = {}
        
        # Add light/dark world attributes which are specific to ALTTP
        attributes['is_light_world'] = getattr(region, 'is_light_world', False)
        attributes['is_dark_world'] = getattr(region, 'is_dark_world', False)
        
        return attributes

# Reminder: Ensure get_game_export_handler in exporter/games/__init__.py
# returns an instance of ALttPGameExportHandler for the 'A Link to the Past' game.
