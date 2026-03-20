"""TUNIC game-specific export handler."""

from typing import Dict, Any, Set
from ..base import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)


class TUNICGameExportHandler(GenericGameExportHandler):
    """Export handler for TUNIC.

    Redirects Shop N regions to Shop. In TUNIC, all shops are the same shop,
    but there are intermediate 'Shop N' regions that connect one-way to 'Shop'.
    Since these intermediate regions only have an unconditional exit to 'Shop',
    we can simplify by having exits go directly to 'Shop'.

    Note: ability_unlocks is auto-discovered via AUTO_DISCOVER_WORLD_ATTRIBUTES.
    Helper modules (including combat_logic) are auto-discovered via
    AUTO_DISCOVER_WORLD_HELPER_MODULES (enabled by default).
    """

    # Preserve complex combat logic helpers as helper calls during rule analysis.
    # These helpers have deep nesting, loops, and state calculations that consume
    # too much analysis budget when inlined. Preserving them keeps them as helper
    # calls in the rules, while still exporting their definitions for the frontend.
    HELPERS_TO_PRESERVE: Set[str] = {
        # Combat stat helpers (from combat_logic.py)
        'has_combat_reqs',
        'check_combat_reqs',
        'has_required_stats',
        'get_att_level',
        'get_def_level',
        'get_potion_level',
        'get_hp_level',
        'get_sp_level',
        'get_mp_level',
        'get_potion_count',
        'get_money_count',
        'calc_effective_hp',
        'calc_hp_potion_cost',
        'calc_def_sp_cost',
        # Logic helpers with complex parameters (from logic_helpers.py and fuses.py)
        'has_ladder',
        'has_fuses',
    }

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process TUNIC export data.

        Redirects exits pointing to 'Shop N' intermediate regions to point
        directly to 'Shop'. In TUNIC, all shops are the same shop, but there are
        intermediate 'Shop N' regions that connect one-way to 'Shop'. Since these
        intermediate regions only have an unconditional exit to 'Shop', we can
        simplify by having exits go directly to 'Shop'.
        """
        # Pattern to match "Shop N" where N is a number
        shop_n_pattern = re.compile(r'^Shop \d+$')

        # Process each player's regions
        for player_id, player_regions in data.get('regions', {}).items():
            for region_name, region_data in player_regions.items():
                for exit_data in region_data.get('exits', []):
                    connected_region = exit_data.get('connected_region', '')
                    if shop_n_pattern.match(connected_region):
                        logger.debug(f"Redirecting exit from '{region_name}' -> '{connected_region}' to 'Shop'")
                        exit_data['connected_region'] = 'Shop'
                        # Also update the name to reflect the change
                        if 'name' in exit_data:
                            exit_data['name'] = exit_data['name'].replace(connected_region, 'Shop')

        return data
