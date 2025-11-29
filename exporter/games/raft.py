"""Raft game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging
import json
import os

logger = logging.getLogger(__name__)

class RaftGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Raft'

    def __init__(self):
        super().__init__()
        # Load the locations.json file to get region information
        self.location_to_region = {}
        self.location_to_items = {}
        self.progressive_mapping = {}
        try:
            # Find the raft world directory
            raft_dir = os.path.join(os.path.dirname(__file__), '..', '..', 'worlds', 'raft')
            locations_file = os.path.join(raft_dir, 'locations.json')

            if os.path.exists(locations_file):
                with open(locations_file, 'r') as f:
                    location_table = json.load(f)
                    for loc in location_table:
                        self.location_to_region[loc['name']] = loc['region']
                        if 'requiresAccessToItems' in loc:
                            self.location_to_items[loc['name']] = loc['requiresAccessToItems']
                logger.info(f"Loaded {len(self.location_to_region)} Raft locations from locations.json")
            else:
                logger.warning(f"Could not find Raft locations.json at {locations_file}")

            # Load the progressives.json file to get progressive item mapping
            progressives_file = os.path.join(raft_dir, 'progressives.json')
            if os.path.exists(progressives_file):
                with open(progressives_file, 'r') as f:
                    progressive_table = json.load(f)
                    # Build the mapping from progressive item to its constituent items
                    for item_name, progressive_name in progressive_table.items():
                        if progressive_name not in self.progressive_mapping:
                            self.progressive_mapping[progressive_name] = []
                        self.progressive_mapping[progressive_name].append(item_name)
                logger.info(f"Loaded {len(self.progressive_mapping)} Raft progressive items from progressives.json")
            else:
                logger.warning(f"Could not find Raft progressives.json at {progressives_file}")
        except Exception as e:
            logger.error(f"Error loading Raft data files: {e}")

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None):
        """
        Override rule analysis for Raft locations that use the regionChecks pattern.

        The Raft world uses this pattern:
        set_rule(locFromWorld, regionChecks[location["region"]])

        We need to resolve this to the actual access rule for the location's region.
        """
        if not rule_target_name or rule_target_name not in self.location_to_region:
            return None  # Let default analysis handle it

        # Get the region for this location
        region = self.location_to_region[rule_target_name]

        # Check if this location has specific item requirements
        if rule_target_name in self.location_to_items:
            # This location requires access to specific items
            # The rule is: regionCheck AND all itemChecks
            item_requirements = self.location_to_items[rule_target_name]
            region_rule = self._get_region_access_rule(region)

            # Build item check conditions
            item_conditions = []
            for item_name in item_requirements:
                # Sanitize item name for use in helper function name (replace spaces with underscores)
                sanitized_name = item_name.replace(' ', '_')
                item_conditions.append({
                    'type': 'helper',
                    'name': f'raft_itemcheck_{sanitized_name}',
                    'args': [],
                    'description': f'Can access {item_name}'
                })

            # Combine region rule with item requirements
            if region_rule.get('value') is True:
                # Region is always accessible, just need items
                if len(item_conditions) == 1:
                    return item_conditions[0]
                else:
                    return {'type': 'and', 'conditions': item_conditions}
            else:
                # Need both region access and items
                all_conditions = item_conditions.copy()
                if region_rule.get('type') != 'constant' or region_rule.get('value') is not True:
                    all_conditions.insert(0, region_rule)
                return {'type': 'and', 'conditions': all_conditions}

        # Simple region check only
        return self._get_region_access_rule(region)

    def _get_region_access_rule(self, region: str) -> Dict[str, Any]:
        """
        Get the access rule for a given region based on the regionChecks mapping
        in the Raft world's Rules.py.
        """
        # From worlds/raft/Rules.py, the regionChecks mapping is:
        region_rules = {
            "Raft": {'type': 'constant', 'value': True},
            "ResearchTable": {'type': 'constant', 'value': True},
            "RadioTower": {'type': 'helper', 'name': 'raft_can_access_radio_tower', 'args': []},
            "Vasagatan": {'type': 'helper', 'name': 'raft_can_access_vasagatan', 'args': []},
            "BalboaIsland": {'type': 'helper', 'name': 'raft_can_access_balboa_island', 'args': []},
            "CaravanIsland": {'type': 'helper', 'name': 'raft_can_access_caravan_island', 'args': []},
            "Tangaroa": {'type': 'helper', 'name': 'raft_can_access_tangaroa', 'args': []},
            "Varuna Point": {'type': 'helper', 'name': 'raft_can_access_varuna_point', 'args': []},
            "Temperance": {'type': 'helper', 'name': 'raft_can_access_temperance', 'args': []},
            "Utopia": {
                'type': 'and',
                'conditions': [
                    {'type': 'helper', 'name': 'raft_can_complete_temperance', 'args': []},
                    {'type': 'helper', 'name': 'raft_can_access_utopia', 'args': []}
                ]
            }
        }

        return region_rules.get(region, {'type': 'constant', 'value': True})

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return Raft-specific progression item mapping data."""
        # Convert the simple list format to the proper schema format
        mapping_data = {}
        for progressive_name, item_list in self.progressive_mapping.items():
            mapping_data[progressive_name] = {
                'base_item': progressive_name,
                'items': []
            }
            for level, item_name in enumerate(item_list, start=1):
                mapping_data[progressive_name]['items'].append({
                    'name': item_name,
                    'level': level
                })
        return mapping_data
