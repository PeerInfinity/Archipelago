"""
Access rules for Journey to Ascension.

Zone Z requires max(0, Z - free_zones + 1 - starting_perks) perks to access.
This creates sphere log ordering that roughly follows zone progression.
"""

from worlds.generic.Rules import set_rule

from .game_data import get_all_perk_display_names_for_goal, get_zones_for_goal


def set_rules(multiworld, player, goal_zone, free_zones, starting_perks):
    """Set access rules for zone entrances.

    Each zone Z requires max(0, Z - free_zones + 1 - starting_perks) total
    perks (any perks, not specific ones). This gives the fill algorithm
    maximum flexibility while maintaining rough zone ordering.
    """
    zones = get_zones_for_goal(goal_zone)
    all_perks = get_all_perk_display_names_for_goal(goal_zone)

    if not all_perks:
        return

    perk_offset = free_zones - 1 + starting_perks

    for i in range(len(zones) - 1):
        from_zone = zones[i]
        to_zone = zones[i + 1]
        required_count = max(0, to_zone.id - perk_offset)

        if required_count <= 0:
            continue

        entrance_name = f"{from_zone.name} -> {to_zone.name}"
        set_rule(
            multiworld.get_entrance(entrance_name, player),
            lambda state, perks=all_perks, count=required_count: state.has_from_list_unique(
                perks, player, count
            ),
        )
