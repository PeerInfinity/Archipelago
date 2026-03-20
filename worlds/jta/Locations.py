"""
Location definitions for Journey to Ascension.

Locations are perk-granting tasks. The location pool is dynamic based on goal_zone.
"""

from typing import Dict, Optional

from BaseClasses import Location

from .game_data import ZONES, get_perk_tasks_for_goal


BASE_LOCATION_ID = 590100


class JTALocation(Location):
    game: str = "Journey to Ascension"


class LocationData:
    def __init__(
        self,
        region: str,
        location_id: Optional[int],
        task_id: int,
        is_hidden: bool = False,
        boss_task_id: Optional[int] = None,
    ):
        self.region = region
        self.location_id = location_id
        self.task_id = task_id
        self.is_hidden = is_hidden
        self.boss_task_id = boss_task_id


def build_location_table(goal_zone: int) -> Dict[str, LocationData]:
    """Build location table for the given goal zone.

    Each perk-granting task in zones before goal_zone becomes a location.
    """
    table: Dict[str, LocationData] = {}
    zone_names = {z.id: z.name for z in ZONES}
    perk_tasks = get_perk_tasks_for_goal(goal_zone)

    for i, task in enumerate(perk_tasks):
        table[task.task_name] = LocationData(
            region=zone_names[task.zone_id],
            location_id=BASE_LOCATION_ID + i,
            task_id=task.task_id,
            is_hidden=task.is_hidden,
            boss_task_id=task.boss_task_id,
        )

    return table


def get_full_location_table() -> Dict[str, LocationData]:
    """Build location table for the maximum goal zone.

    Used for class-level location_name_to_id which must be static.
    """
    return build_location_table(27)


# Static table used for class-level registration (includes all possible locations)
location_table: Dict[str, LocationData] = get_full_location_table()
