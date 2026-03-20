"""
Region definitions for Journey to Ascension.

Regions are zones, connected in a linear chain.
"""

from BaseClasses import Entrance, MultiWorld, Region

from .Locations import JTALocation, build_location_table
from .game_data import get_zones_for_goal


def create_regions(multiworld: MultiWorld, player: int, goal_zone: int) -> None:
    """Create regions (zones), locations (perk tasks), and connections."""
    zones = get_zones_for_goal(goal_zone)
    location_table = build_location_table(goal_zone)

    # Create Menu region (Archipelago entry point)
    menu = Region("Menu", player, multiworld)
    multiworld.regions.append(menu)

    # Create zone regions
    zone_regions = {}
    for zone in zones:
        region = Region(zone.name, player, multiworld)
        zone_regions[zone.id] = region
        multiworld.regions.append(region)

    # Add locations to their regions
    for loc_name, loc_data in location_table.items():
        region = multiworld.get_region(loc_data.region, player)
        location = JTALocation(player, loc_name, loc_data.location_id, region)
        region.locations.append(location)

    # Add victory event location to the goal zone
    goal_zone_data = zones[-1]
    goal_region = zone_regions[goal_zone_data.id]
    victory_loc = JTALocation(player, "Reach Goal Zone", None, goal_region)
    victory_loc.event = True
    goal_region.locations.append(victory_loc)

    # Connect Menu -> Zone 0
    menu_exit = Entrance(player, "Start Journey", menu)
    menu_exit.connect(zone_regions[0])
    menu.exits.append(menu_exit)

    # Connect zones in linear chain: Zone N -> Zone N+1
    for i in range(len(zones) - 1):
        from_zone = zones[i]
        to_zone = zones[i + 1]
        entrance_name = f"{from_zone.name} -> {to_zone.name}"
        entrance = Entrance(player, entrance_name, zone_regions[from_zone.id])
        entrance.connect(zone_regions[to_zone.id])
        zone_regions[from_zone.id].exits.append(entrance)
