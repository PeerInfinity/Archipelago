"""
Journey to Ascension - Static game data for Archipelago world.

Extracted from frontend/modules/jta-randomizer/gameData.js (v0.5.0).
Only includes data needed for the APWorld: zones, perk-granting tasks,
boss unlocks for hidden tasks, and perk definitions.
"""

from typing import Dict, List, NamedTuple, Optional, Set


class ZoneData(NamedTuple):
    id: int
    name: str


class PerkTaskData(NamedTuple):
    task_id: int
    task_name: str
    zone_id: int
    perk_name: str  # Internal perk name (PerkType enum name)
    perk_display_name: str  # Human-readable perk name
    is_hidden: bool  # Requires boss defeat to access
    boss_task_id: Optional[int]  # Boss task that unlocks this hidden task


# All 27 zones
ZONES: List[ZoneData] = [
    ZoneData(0, "The Village"),
    ZoneData(1, "The Village Watch"),
    ZoneData(2, "The Raid"),
    ZoneData(3, "The Wilderness"),
    ZoneData(4, "The Cave System"),
    ZoneData(5, "The Road to the City"),
    ZoneData(6, "The City Outskirts"),
    ZoneData(7, "The City"),
    ZoneData(8, "The Forest"),
    ZoneData(9, "The Magician"),
    ZoneData(10, "The Ocean"),
    ZoneData(11, "The Island"),
    ZoneData(12, "The Desert"),
    ZoneData(13, "The Oasis"),
    ZoneData(14, "The Ritual"),
    ZoneData(15, "The Dream"),
    ZoneData(16, "The Metropolis"),
    ZoneData(17, "The Foothills"),
    ZoneData(18, "The Dragon's Lair"),
    ZoneData(19, "The Place of Power"),
    ZoneData(20, "The Sky"),
    ZoneData(21, "The Volcano"),
    ZoneData(22, "The Underworld"),
    ZoneData(23, "The Depths of the Sea"),
    ZoneData(24, "The Deepest Deep"),
    ZoneData(25, "The Void"),
    ZoneData(26, "The Return"),
]

# Perk display names (PerkType enum name -> human-readable name)
PERK_DISPLAY_NAMES: Dict[str, str] = {
    "Reading": "How to Read",
    "Writing": "How to Write",
    "VillagerGratitude": "Villager Gratitude",
    "VillageHero": "Village Hero",
    "Amulet": "Mysterious Amulet",
    "EnergySpell": "Energetic Spell",
    "GoblinScourge": "Goblin Scourge",
    "ExperiencedTraveler": "Experienced Traveler",
    "UnderstandingTheReset": "Understanding of the Reset",
    "UndergroundConnection": "Underground Connection",
    "MinorTimeCompression": "Minor Time Compression",
    "PurgedBureaucracy": "Purged Bureaucracy",
    "HighAltitudeClimbing": "High Altitude Climbing",
    "Attunement": "Attunement",
    "SunkenTreasure": "Sunken Treasure",
    "DeepSeaDiving": "Deep Sea Diving",
    "LostTemple": "Found Lost Temple",
    "WalkWithoutRhythm": "Walk Without Rhythm",
    "TheWorm": "The Worm",
    "ReflectionsOnTheJourney": "Reflections on the Journey",
    "EnergeticMemory": "Energetic Memory",
    "Awakening": "Awakening",
    "TowerOfBabel": "Tower of Babel",
    "DreamPrism": "Dream Prism",
    "MajorTimeCompression": "Major Time Compression",
    "Headmaster": "Headmaster",
    "HideInPlainSight": "Hide in Plain Sight",
    "DragonKillingPlan": "Dragon Killing Plan",
    "DragonSlayer": "Dragon Slayer",
    "UnifiedTheoryOfMagic": "Unified Theory of Magic",
    "GazedBeyondTheVeil": "Gazed Beyond the Veil",
    "OvercameFearOfSkydiving": "Overcame Fear of Skydiving",
    "DestroyedTheRing": "Destroyed the Ring",
    "PurgedDemonicInfluences": "Purged Demonic Influences",
    "UndergroundForge": "Studied Underground Forge",
    "UnderstandingLeviathan": "Understanding Leviathan",
    "CommunedWithDamnedSouls": "Communed with Damned Souls",
    "DefiedTheGods": "Defied the Gods",
    "SurvivedTheVoid": "Survived the Void",
    "DivinePower": "Divine Power",
}

# All perk-granting tasks (excluding PLACEHOLDERs).
# Sorted by zone_id, then task_id.
PERK_TASKS: List[PerkTaskData] = [
    # Zone 0: The Village
    PerkTaskData(13, "Learn How to Read", 0, "Reading", "How to Read", False, None),
    # Zone 1: The Village Watch
    PerkTaskData(27, "Learn How to Write", 1, "Writing", "How to Write", False, None),
    # Zone 2: The Raid
    PerkTaskData(34, "Rescue Villager", 2, "VillagerGratitude", "Villager Gratitude", False, None),
    PerkTaskData(37, "Save the Village", 2, "VillageHero", "Village Hero", True, 36),
    # Zone 3: The Wilderness
    PerkTaskData(43, "Find an Amulet", 3, "Amulet", "Mysterious Amulet", False, None),
    # Zone 4: The Cave System
    PerkTaskData(54, "Try Casting a Spell", 4, "EnergySpell", "Energetic Spell", False, None),
    PerkTaskData(58, "Wipe Out Goblins", 4, "GoblinScourge", "Goblin Scourge", True, 57),
    # Zone 5: The Road to the City
    PerkTaskData(64, "Get Used to Traveling", 5, "ExperiencedTraveler", "Experienced Traveler", False, None),
    PerkTaskData(69, "Study the Amulet", 5, "UnderstandingTheReset", "Understanding of the Reset", False, None),
    # Zone 6: The City Outskirts
    PerkTaskData(74, "Negotiate with a Rogue Guard", 6, "UndergroundConnection", "Underground Connection", False, None),
    # Zone 7: The City
    PerkTaskData(84, "Cast a Spell", 7, "MinorTimeCompression", "Minor Time Compression", False, None),
    PerkTaskData(89, "Purge Corrupt Bureaucracy", 7, "PurgedBureaucracy", "Purged Bureaucracy", True, 87),
    # Zone 8: The Forest
    PerkTaskData(90, "Scale the Mountain", 8, "HighAltitudeClimbing", "High Altitude Climbing", False, None),
    # Zone 9: The Magician
    PerkTaskData(104, "Figure Out How to Attune", 9, "Attunement", "Attunement", False, None),
    # Zone 10: The Ocean
    PerkTaskData(114, "Dive as a Squid", 10, "SunkenTreasure", "Sunken Treasure", False, None),
    PerkTaskData(118, "Explore Kraken's Lair", 10, "DeepSeaDiving", "Deep Sea Diving", True, 117),
    # Zone 11: The Island
    PerkTaskData(124, "Explore the Jungle", 11, "LostTemple", "Found Lost Temple", False, None),
    # Zone 12: The Desert
    PerkTaskData(134, "Avoid Notice by the Sandworm", 12, "WalkWithoutRhythm", "Walk Without Rhythm", False, None),
    PerkTaskData(138, "Learn to Dance the Worm", 12, "TheWorm", "The Worm", True, 137),
    # Zone 13: The Oasis
    PerkTaskData(144, "Reflect on the Journey", 13, "ReflectionsOnTheJourney", "Reflections on the Journey", False, None),
    # Zone 14: The Ritual
    PerkTaskData(155, "Practice Memorization", 14, "EnergeticMemory", "Energetic Memory", False, None),
    # Zone 15: The Dream
    PerkTaskData(160, "Wake Up", 15, "Awakening", "Awakening", False, None),
    PerkTaskData(164, "Build Giant Tower", 15, "TowerOfBabel", "Tower of Babel", False, None),
    PerkTaskData(168, "Contain the Dream", 15, "DreamPrism", "Dream Prism", True, 167),
    # Zone 16: The Metropolis
    PerkTaskData(170, "Search for the Dragon's Hoard", 16, "Awakening", "Awakening", False, None),
    PerkTaskData(174, "Improve Your Time Compression", 16, "MajorTimeCompression", "Major Time Compression", False, None),
    PerkTaskData(178, "Become Honorary Headmaster", 16, "Headmaster", "Headmaster", True, 177),
    # Zone 17: The Foothills
    PerkTaskData(184, "Hide from the Dragon", 17, "HideInPlainSight", "Hide in Plain Sight", False, None),
    # Zone 18: The Dragon's Lair
    PerkTaskData(194, "Plan How to Kill the Dragon", 18, "DragonKillingPlan", "Dragon Killing Plan", False, None),
    PerkTaskData(198, "Hunt Down the Dragon's Spawn", 18, "DragonSlayer", "Dragon Slayer", True, 197),
    # Zone 19: The Place of Power
    PerkTaskData(205, "Invent a New Spell", 19, "UnifiedTheoryOfMagic", "Unified Theory of Magic", False, None),
    PerkTaskData(209, "Gaze Beyond the Veil", 19, "GazedBeyondTheVeil", "Gazed Beyond the Veil", True, 207),
    # Zone 20: The Sky
    PerkTaskData(214, "Go Skydiving", 20, "OvercameFearOfSkydiving", "Overcame Fear of Skydiving", False, None),
    # Zone 21: The Volcano
    PerkTaskData(224, "Cast the Ring into the Fire", 21, "DestroyedTheRing", "Destroyed the Ring", False, None),
    PerkTaskData(228, "Purge Demonic Influence", 21, "PurgedDemonicInfluences", "Purged Demonic Influences", True, 227),
    # Zone 22: The Underworld
    PerkTaskData(234, "Study Underground Forge", 22, "UndergroundForge", "Studied Underground Forge", False, None),
    # Zone 23: The Depths of the Sea
    PerkTaskData(244, "Inspect Leviathan", 23, "UnderstandingLeviathan", "Understanding Leviathan", False, None),
    PerkTaskData(248, "Commune with Damned Souls", 23, "CommunedWithDamnedSouls", "Communed with Damned Souls", True, 247),
    # Zone 24: The Deepest Deep
    PerkTaskData(255, "Defy the Gods", 24, "DefiedTheGods", "Defied the Gods", False, None),
    # Zone 25: The Void
    PerkTaskData(264, "Avoid Going Insane", 25, "SurvivedTheVoid", "Survived the Void", False, None),
    # Zone 26: The Return
    PerkTaskData(274, "Demonstrate New Powers", 26, "DivinePower", "Divine Power", False, None),
]


def get_perk_tasks_for_goal(goal_zone: int) -> List[PerkTaskData]:
    """Return perk tasks in zones before the goal zone."""
    return [t for t in PERK_TASKS if t.zone_id < goal_zone]


def get_unique_perks_for_goal(goal_zone: int) -> List[str]:
    """Return unique perk names (in order of first appearance) for zones before goal."""
    seen: Set[str] = set()
    result: List[str] = []
    for task in get_perk_tasks_for_goal(goal_zone):
        if task.perk_name not in seen:
            seen.add(task.perk_name)
            result.append(task.perk_name)
    return result


def get_all_perk_display_names_for_goal(goal_zone: int) -> List[str]:
    """Return all unique perk display names for zones before goal_zone."""
    seen: Set[str] = set()
    result: List[str] = []
    for task in PERK_TASKS:
        if task.zone_id < goal_zone:
            if task.perk_display_name not in seen:
                seen.add(task.perk_display_name)
                result.append(task.perk_display_name)
    return result


def get_zones_for_goal(goal_zone: int) -> List[ZoneData]:
    """Return zones from 0 to goal_zone (inclusive, since the goal zone is the victory region)."""
    return [z for z in ZONES if z.id <= goal_zone]
