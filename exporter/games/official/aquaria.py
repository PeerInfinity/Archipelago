"""Aquaria game-specific export handler."""

from BaseClasses import Region
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class AquariaGameExportHandler(GenericGameExportHandler):
    """Aquaria export handler for adding missing regions.

    Aquaria stores some regions as attributes on world.regions that aren't
    added to multiworld.regions. This handler finds and adds them during export.
    """

    # Regions stored as world.regions.X that aren't added to multiworld.regions
    MISSING_REGION_ATTRS = [
        'first_secret', 'energy_temple_idol', 'energy_temple_4', 'frozen_feil',
        'sunken_city_l_crates', 'sunken_city_r_crates', 'home_water_behind_rocks',
        'openwater_tr_urns', 'mithalas_city_urns', 'mithalas_castle_urns'
    ]

    def postprocess_regions(self, multiworld, player):
        """Add regions stored as world.regions.X that weren't added to multiworld.regions."""
        world = multiworld.worlds.get(player)
        if not world or not hasattr(world, 'regions'):
            return

        regions_added = []
        for attr_name in self.MISSING_REGION_ATTRS:
            region = getattr(world.regions, attr_name, None)
            if region is None or not isinstance(region, Region) or region in multiworld.regions:
                continue

            # Handle name collision: sunken_city_l_crates shares name with sunken_city_l
            if attr_name == 'sunken_city_l_crates' and region.name == "Sunken City left area":
                region.name = "Sunken City left area crates"

            region.dynamically_added = True  # type: ignore[attr-defined]
            multiworld.regions.append(region)
            regions_added.append(region.name)

        if regions_added:
            logger.info(f"Added {len(regions_added)} missing Aquaria regions: {', '.join(regions_added)}")
