"""Sims 4 game-specific export handler.

This handler exports ALL possible locations from the Sims 4 module-level tables,
not just the ones created for the current seed. This ensures that when the
Universal Tracker generates with different options (DLCs, careers), all
possible locations exist in the worldgen world.

The Sims 4 world creates locations dynamically in create_regions() based on:
- Selected careers (self.options.career.value)
- Selected DLCs (expansion_packs, game_packs, stuff_packs)

To make the worldgen compatible with any option combination, we export:
1. All skill locations from skill_locations_table
2. All career locations from location_table
3. All aspiration locations

Locations without explicit rules get the default True rule (always accessible).
"""

from typing import Dict, Any, List, Optional, Set
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class Sims4ExportHandler(GenericGameExportHandler):
    """Export handler for The Sims 4."""

    GAME_NAME = 'The Sims 4'

    def __init__(self, world=None):
        super().__init__(world)
        self._all_location_names: Optional[Set[str]] = None
        self._skill_locations: Dict[str, Dict[str, Any]] = {}
        self._load_all_locations()

    def _load_all_locations(self) -> None:
        """Load all possible locations from the Sims 4 module tables."""
        try:
            from worlds.sims4.Locations import skill_locations_table, location_table  # type: ignore[import-not-found]
            from worlds.sims4.Regions import sims4_careers  # type: ignore[import-not-found]

            # Collect all skill location names
            self._all_location_names = set()
            for loc_id, loc_data in skill_locations_table.items():
                loc_name = loc_data.get('name', '')
                if loc_name:
                    self._all_location_names.add(loc_name)
                    self._skill_locations[loc_name] = {
                        'id': loc_id,
                        'category': loc_data.get('category', 'Skills'),
                        'expansion': loc_data.get('expansion', 'base')
                    }

            # Collect all career locations from sims4_careers
            for career_key, career_locations in sims4_careers.items():
                for loc_name in career_locations:
                    if loc_name:
                        self._all_location_names.add(loc_name)
                        # Career locations are in location_table, get their ID
                        for loc_id, loc_data in location_table.items():
                            if loc_data.get('name') == loc_name:
                                self._skill_locations[loc_name] = {
                                    'id': loc_id,
                                    'category': 'Careers',
                                    'expansion': 'base'  # Base game careers
                                }
                                break

            # Also collect all other locations from location_table (aspirations, etc.)
            for loc_id, loc_data in location_table.items():
                loc_name = loc_data.get('name', '')
                if loc_name and loc_name not in self._skill_locations:
                    self._all_location_names.add(loc_name)
                    self._skill_locations[loc_name] = {
                        'id': loc_id,
                        'category': loc_data.get('category', 'Other'),
                        'expansion': loc_data.get('expansion', 'base')
                    }

            logger.info(f"Sims4: Loaded {len(self._all_location_names)} total location names")
            logger.info(f"Sims4: Loaded {len(self._skill_locations)} locations with IDs")

        except ImportError as e:
            logger.warning(f"Could not import Sims 4 location tables: {e}")
            self._all_location_names = set()

    def get_extra_locations_for_region(self, region_name: str, existing_locations: List[str]) -> List[Dict[str, Any]]:
        """
        Get additional locations to add to a region that weren't in the seed.

        For Sims 4, all locations are in the "Menu" region. This method returns
        skill locations that weren't created because the corresponding DLC
        wasn't selected.

        Args:
            region_name: The name of the region
            existing_locations: Names of locations already in this region

        Returns:
            List of location data dicts for additional locations
        """
        if region_name != "Menu" or not self._all_location_names:
            return []

        extra_locations = []
        existing_set = set(existing_locations)

        for loc_name in sorted(self._all_location_names):
            if loc_name not in existing_set:
                # This location wasn't created for this seed - add it
                loc_info = self._skill_locations.get(loc_name)
                if loc_info:
                    extra_locations.append({
                        'name': loc_name,
                        'id': loc_info['id'],
                        'access_rule': {'rule': 'True_'},  # Default: always accessible
                        'item_rule': None,
                        'item': None,
                        'locked': False,
                        '_extra': True,  # Mark as dynamically added
                        '_expansion': loc_info['expansion']  # Track which DLC this is from
                    })

        if extra_locations:
            logger.info(f"Sims4: Adding {len(extra_locations)} extra locations to {region_name}")

        return extra_locations
