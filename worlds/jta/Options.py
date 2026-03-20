"""
Options for Journey to Ascension.
"""

from dataclasses import dataclass
from Options import DefaultOnToggle, FreeText, ItemSet, PerGameCommonOptions, Range, Toggle


class GoalZone(Range):
    """Which zone the player must reach to win.
    Only perks in zones before this zone are randomized."""
    display_name = "Goal Zone"
    range_start = 1
    range_end = 27
    default = 15


class FreeZones(Range):
    """Number of zones at the start that require no perks to access.
    After the free zones, each subsequent zone requires one more perk.
    With 1 (default): only zone 0 is free, zone 1 needs 1 perk.
    With 3: zones 0-2 are free, zone 3 needs 1 perk, zone 4 needs 2."""
    display_name = "Free Zones"
    range_start = 1
    range_end = 15
    default = 1


class StartingPerks(Range):
    """Number of perks the player starts with (chosen from earliest zones).
    Combined with free_zones, zone Z requires
    max(0, Z - free_zones + 1 - starting_perks) perks.
    Use starting_perk_list to choose specific perks instead."""
    display_name = "Starting Perks"
    range_start = 0
    range_end = 15
    default = 0


class StartingPerkList(ItemSet):
    """Specific perks to start with. These are granted at the beginning
    and replaced with filler in the item pool. Overrides starting_perks
    count if non-empty (the count becomes the size of this list)."""
    display_name = "Starting Perk List"


class GameDataFile(FreeText):
    """Path to an alternative base game data JSON file.
    If empty (default), uses the built-in jta_game_data.json.
    Path is relative to the Archipelago root directory."""
    display_name = "Game Data File"
    default = ""


class ResetsPerSphere(Range):
    """Target number of energy resets the player must grind before their
    stats are high enough to reach the next perk unlock.
    Higher values = harder (more grinding between spheres).
    Lower values = easier (less grinding needed).
    Affects cost generation."""
    display_name = "Resets Per Sphere"
    range_start = 1
    range_end = 20
    default = 5


# --- Cost Generation Strategy Factors ---

class VanillaPlacement(Toggle):
    """Place all perks in their original locations (no randomization).
    The output game data will be identical to the unmodified game.
    Useful for testing or playing with vanilla JTA through Archipelago."""
    display_name = "Vanilla Placement"


class AutoCostAdjust(DefaultOnToggle):
    """Automatically run the cost adjustment algorithm after seed generation.
    Requires Node.js to be installed. If disabled or Node.js is not found,
    you can run the cost adjuster manually with:
      node scripts/jta/cost-adjust.js"""
    display_name = "Auto Cost Adjust"


class CostGenMode(Range):
    """Which cost generation algorithm to use:
    0 = Legacy (jtaCostGenerator.adjustCosts — fast, simple heuristic)
    1 = Planner (JTACostPlanner — simulated playthrough with binary search solver)
    2 = Planner with two-pass (finds optimal xpMult, then re-solves)
    The planner produces more accurate costs but takes longer (~16 seconds)."""
    display_name = "Cost Gen Mode"
    range_start = 0
    range_end = 2
    default = 2


class CostGenNormalAttempts(Range):
    """Target number of attempts for regular (non-perk/boss/traversal) tasks.
    Only used with the planner (modes 1-2). Higher = more expensive tasks."""
    display_name = "Cost Gen: Normal Attempts"
    range_start = 1
    range_end = 10
    default = 2


class CostGenPerkAttempts(Range):
    """Target number of attempts for perk tasks.
    Only used with the planner (modes 1-2). Higher = more grinding per perk."""
    display_name = "Cost Gen: Perk Attempts"
    range_start = 1
    range_end = 20
    default = 5


class CostGenTraversalAttempts(Range):
    """Target number of attempts for mandatory/travel zone traversal tasks.
    Only used with the planner (modes 1-2)."""
    display_name = "Cost Gen: Traversal Attempts"
    range_start = 1
    range_end = 20
    default = 5


class CostGenItemCollection(DefaultOnToggle):
    """Cost generator assumes the player collects items during runs.
    Only used with legacy mode (mode 0)."""
    display_name = "Cost Gen: Item Collection"


class CostGenPushCollect(DefaultOnToggle):
    """Cost generator assumes the player alternates between collection
    runs (save items) and push runs (consume all items).
    Only used with legacy mode (mode 0)."""
    display_name = "Cost Gen: Push/Collect"


class CostGenGrindWithPushCollect(DefaultOnToggle):
    """Cost generator assumes push/collect alternation during XP grinding.
    Only used with legacy mode (mode 0)."""
    display_name = "Cost Gen: Grind with Push/Collect"


class CostGenArtifacts(DefaultOnToggle):
    """Cost generator assumes strategic artifact usage.
    Only used with legacy mode (mode 0)."""
    display_name = "Cost Gen: Artifact Usage"


# --- Automation Unlocks ---

class AutomationAutoQueue(DefaultOnToggle):
    """Allow the queue to auto-generate from strategy."""
    display_name = "Automation: Auto Queue"


class AutomationAutoReset(DefaultOnToggle):
    """Allow automatic energy reset when energy is depleted."""
    display_name = "Automation: Auto Reset"


class AutomationDrainStrategy(DefaultOnToggle):
    """Allow automatic task selection when the queue is exhausted."""
    display_name = "Automation: Drain Strategy"


class AutomationLoadoutSequencing(DefaultOnToggle):
    """Allow loadouts to automatically chain."""
    display_name = "Automation: Loadout Sequencing"


@dataclass
class JTAOptions(PerGameCommonOptions):
    goal_zone: GoalZone
    free_zones: FreeZones
    starting_perks: StartingPerks
    starting_perk_list: StartingPerkList
    game_data_file: GameDataFile
    resets_per_sphere: ResetsPerSphere
    vanilla_placement: VanillaPlacement
    auto_cost_adjust: AutoCostAdjust
    costgen_mode: CostGenMode
    # Cost generation factors (planner modes 1-2)
    costgen_normal_attempts: CostGenNormalAttempts
    costgen_perk_attempts: CostGenPerkAttempts
    costgen_traversal_attempts: CostGenTraversalAttempts
    # Cost generation factors (legacy mode 0)
    costgen_item_collection: CostGenItemCollection
    costgen_push_collect: CostGenPushCollect
    costgen_grind_with_push_collect: CostGenGrindWithPushCollect
    costgen_artifacts: CostGenArtifacts
    # Automation unlocks
    automation_auto_queue: AutomationAutoQueue
    automation_auto_reset: AutomationAutoReset
    automation_drain_strategy: AutomationDrainStrategy
    automation_loadout_sequencing: AutomationLoadoutSequencing
