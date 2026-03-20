"""VVVVVV game-specific export handler.

The original rules use _has_trinket_range(state, player, start, end) with computed
start/end values based on shuffled area_cost_map. Since these values are only known
at generation time, we resolve them in post_process_data using the exported slot_data.

Key insight: In Rules.py, the cost is determined by SLOT number (1-4), not by the
region's original index. With area_rando enabled:
- area_connections maps slot numbers to region indices
- area_cost_map maps slot numbers to cost tiers

We need to invert area_connections to find which slot connects to each region,
then use that slot to look up the cost.
"""

from typing import Any, Dict
from ..base import GenericGameExportHandler

# Import area names from the world module to stay in sync
from worlds.v6.Regions import v6areas


class V6GameExportHandler(GenericGameExportHandler):
    """Export handler for VVVVVV.

    Handles trinket range requirements that use lambdas with loop variable closures.
    Post-processes to inline the actual trinket requirements based on door_cost,
    AreaRando, and AreaCostRando settings.
    """

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Replace closure-based trinket range rules with inlined item checks."""
        if 'regions' not in data:
            return super().post_process_data(data)

        for player_id_str, regions in data['regions'].items():
            world_data = data.get('world', {}).get(player_id_str, {})
            door_cost = world_data.get('options', {}).get('door_cost')
            area_cost_map = world_data.get('slot_data', {}).get('AreaCostRando')
            area_rando_map = world_data.get('slot_data', {}).get('AreaRando')

            if door_cost is None or area_cost_map is None:
                continue

            # Build inverted map: region_value -> slot_number
            # area_rando_map maps slot -> region_value (1-indexed)
            # We need to find which slot connects to a given region
            region_value_to_slot = {}
            if area_rando_map:
                for slot, region_value in area_rando_map.items():
                    # Handle both int and string keys
                    slot_int = int(slot) if isinstance(slot, str) else slot
                    if slot_int > 0:  # Skip slot 0 which is always 0
                        region_value_to_slot[region_value] = slot_int

            menu_region = regions.get('Menu', {})
            for exit_data in menu_region.get('exits', []):
                connected_region = exit_data.get('connected_region', '')
                if connected_region not in v6areas:
                    continue

                # Find the region's 1-indexed value (position in v6areas + 1)
                region_value = v6areas.index(connected_region) + 1

                # Find which slot connects to this region
                # If area_rando is not enabled, slot number equals region value
                if region_value_to_slot:
                    slot = region_value_to_slot.get(region_value, region_value)
                else:
                    slot = region_value

                # Get the cost tier for this slot from area_cost_map
                area_cost = area_cost_map.get(slot, area_cost_map.get(str(slot), slot))

                # Calculate trinket range
                start = door_cost * (area_cost - 1)
                end = door_cost * area_cost

                # Generate "Trinket 01", "Trinket 02", etc. for the required range
                trinket_names = [f"Trinket {i + 1:02d}" for i in range(start, end)]
                exit_data['access_rule'] = {
                    'type': 'and',
                    'conditions': [{'type': 'item_check', 'item': name} for name in trinket_names]
                }

        return super().post_process_data(data)
