from .base import BaseGameExportHandler
from typing import Any, Dict, Optional, Set
from worlds.adventure.Items import item_table, event_table
from BaseClasses import ItemClassification
import logging

logger = logging.getLogger(__name__)

class AdventureGameExportHandler(BaseGameExportHandler):
    """Validates helper names are known Adventure helpers"""
    
    def __init__(self):
        # Adventure-specific helpers and closure variables
        self.known_helpers = {
            # Closure variables that appear in lambda functions but aren't actual helper functions
            'old_rule',  # Variable captured in lambda closures from worlds/generic/Rules.py
        }

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Validates helper names exist against the known_helpers set."""
        if not rule:
            return rule
            
        if rule.get('type') == 'helper':
            helper_name = rule.get('name')
            if helper_name and helper_name not in self.known_helpers:
                # Log or raise an error for unknown helpers if needed during development
                logger.warning(f"Unknown Adventure helper found: {helper_name}")
            # Return the helper rule as-is (no expansion logic needed yet)
            return rule
            
        # Recursively check nested conditions for 'and'/'or' rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [
                self.expand_rule(cond) for cond in rule.get('conditions', []) if cond # Ensure cond is not None
            ]
            
        return rule

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return Adventure-specific item table data including event items."""
        adventure_items_data = {}
        
        # Process regular items from item_table
        for item_name, item_data in item_table.items():
            # Get groups this item belongs to
            groups = [
                group_name for group_name, items in getattr(world, 'item_name_groups', {}).items()
                if item_name in items
            ]
            # If no groups and item has a type, add type as a group
            if not groups:
                groups = []

            try:
                item_classification = getattr(item_data, 'classification', None)
                is_advancement = item_classification == ItemClassification.progression if item_classification else False
                is_useful = item_classification == ItemClassification.useful if item_classification else False
                is_trap = item_classification == ItemClassification.trap if item_classification else False
            except Exception as e:
                logger.debug(f"Could not determine classification for {item_name}: {e}")
                is_advancement = False
                is_useful = False
                is_trap = False

            adventure_items_data[item_name] = {
                'name': item_name,
                'id': getattr(item_data, 'id', None),
                'groups': sorted(groups),
                'advancement': is_advancement,
                'useful': is_useful,
                'trap': is_trap,
                'event': False,  # Regular items are not events
                'type': None,
                'max_count': 1
            }

        # Process event items from event_table (if any)
        for item_name, item_data in event_table.items():
            groups = ['Event']  # Event items belong to the Event group
            try:
                item_classification = getattr(item_data, 'classification', None)
                is_advancement = item_classification == ItemClassification.progression if item_classification else False
                is_useful = item_classification == ItemClassification.useful if item_classification else False
                is_trap = item_classification == ItemClassification.trap if item_classification else False
            except Exception as e:
                logger.debug(f"Could not determine classification for event item {item_name}: {e}")
                is_advancement = False
                is_useful = False
                is_trap = False

            adventure_items_data[item_name] = {
                'name': item_name,
                'id': None,  # Event items have no ID
                'groups': groups,
                'advancement': is_advancement,
                'useful': is_useful,
                'trap': is_trap,
                'event': True,  # This is an event item
                'type': 'Event',
                'max_count': 1
            }

        # Handle dynamically created event items like "Victory"
        # These are created at runtime via create_event() but not in the static event_table
        # We need to scan locations for placed event items
        if hasattr(world, 'multiworld'):
            multiworld = world.multiworld
            player = world.player
            
            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID)
                    if (location.item.code is None and 
                        item_name not in adventure_items_data and
                        hasattr(location.item, 'classification')):
                        
                        adventure_items_data[item_name] = {
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

        return adventure_items_data

# Reminder: Ensure get_game_helpers in exporter/games/__init__.py 
# returns an instance of AdventureGameExportHandler for the 'Adventure' game.
