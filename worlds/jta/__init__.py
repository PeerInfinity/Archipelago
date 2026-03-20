"""
Journey to Ascension - Archipelago World

An incremental/idle game randomizer that shuffles perk placements
and uses post-hoc cost adjustment to make the resulting seed completable.
"""

import copy
import json
import logging
import os
import subprocess
from typing import Any, ClassVar, Dict

from BaseClasses import ItemClassification, Tutorial
from worlds.AutoWorld import WebWorld, World

from .Items import JTAItem, build_item_table, item_table
from .Locations import location_table
from .Options import JTAOptions
from .Regions import create_regions
from .Rules import set_rules
from .game_data import get_all_perk_display_names_for_goal, get_perk_tasks_for_goal


logger = logging.getLogger(__name__)


class JTAWeb(WebWorld):
    theme = "ocean"
    game_info_languages = ['en']
    tutorials = [Tutorial(
        "Setup Guide",
        "A guide to setting up Journey to Ascension for Archipelago multiworld.",
        "English",
        "setup_en.md",
        "setup/en",
        ["Archipelago Team"],
    )]


class JTAWorld(World):
    """
    Journey to Ascension is an incremental/idle game where you progress
    through zones by completing tasks, leveling skills, and collecting perks.
    This randomizer shuffles perk placements across tasks.
    """

    game: ClassVar[str] = "Journey to Ascension"
    web: ClassVar[WebWorld] = JTAWeb()

    options_dataclass = JTAOptions
    options: JTAOptions

    item_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.id for name, data in item_table.items() if data.id is not None
    }

    location_name_to_id: ClassVar[Dict[str, int]] = {
        name: data.location_id
        for name, data in location_table.items()
        if data.location_id is not None
    }

    def create_regions(self) -> None:
        goal_zone = self.options.goal_zone.value
        create_regions(self.multiworld, self.player, goal_zone)

    def create_items(self) -> None:
        goal_zone = self.options.goal_zone.value
        starting_perks_count = self.options.starting_perks.value
        starting_perk_list = self.options.starting_perk_list.value
        active_item_table = build_item_table(goal_zone)

        # Determine which perks are precollected (starting items)
        precollected_names = set()
        if starting_perk_list:
            # Explicit list overrides count
            for perk_name in starting_perk_list:
                if perk_name in active_item_table:
                    precollected_names.add(perk_name)
                    self.multiworld.push_precollected(self.create_item(perk_name))
        elif starting_perks_count > 0:
            all_perks = get_all_perk_display_names_for_goal(goal_zone)
            for perk_name in all_perks[:starting_perks_count]:
                precollected_names.add(perk_name)
                self.multiworld.push_precollected(self.create_item(perk_name))

        item_pool = []
        filler_idx = 0
        for item_name, item_data in active_item_table.items():
            if item_name in precollected_names:
                filler_idx += 1
                filler_name = f"Starting Perk Bonus #{filler_idx}"
                filler_data = item_table[filler_name]
                item_pool.append(JTAItem(
                    filler_name, filler_data.classification, filler_data.id, self.player
                ))
            else:
                item_pool.append(JTAItem(
                    item_name, item_data.classification, item_data.id, self.player
                ))

        self.multiworld.itempool += item_pool

    def set_rules(self) -> None:
        goal_zone = self.options.goal_zone.value
        free_zones = self.options.free_zones.value
        starting_perk_list = self.options.starting_perk_list.value
        if starting_perk_list:
            starting_perks = len(starting_perk_list)
        else:
            starting_perks = self.options.starting_perks.value
        set_rules(self.multiworld, self.player, goal_zone, free_zones, starting_perks)

    def generate_basic(self) -> None:
        # Place victory event
        victory_location = self.multiworld.get_location("Reach Goal Zone", self.player)
        victory_item = JTAItem(
            "Victory", ItemClassification.progression, None, self.player
        )
        victory_location.place_locked_item(victory_item)

        self.multiworld.completion_condition[self.player] = lambda state: state.has(
            "Victory", self.player
        )

    def generate_early(self) -> None:
        if self.options.vanilla_placement.value:
            self.is_vanilla = True

    def pre_fill(self) -> None:
        if self.options.vanilla_placement.value:
            self._place_original_items()

    def _place_original_items(self) -> None:
        """Place perks at their original task locations (vanilla placement)."""
        goal_zone = self.options.goal_zone.value
        perk_tasks = get_perk_tasks_for_goal(goal_zone)
        for task in perk_tasks:
            location = self.multiworld.get_location(task.task_name, self.player)
            item = self.create_item(task.perk_display_name)
            location.place_locked_item(item)
            # Remove the corresponding item from the pool
            for pool_item in self.multiworld.itempool[:]:
                if pool_item.name == task.perk_display_name and pool_item.player == self.player:
                    self.multiworld.itempool.remove(pool_item)
                    break

    def create_item(self, name: str) -> JTAItem:
        data = item_table.get(name)
        if data is None:
            return JTAItem(name, ItemClassification.progression, None, self.player)
        return JTAItem(name, data.classification, data.id, self.player)

    def _load_base_game_data(self) -> dict:
        """Load the base game data JSON (built-in or custom path)."""
        custom_path = str(self.options.game_data_file.value).strip()
        if custom_path:
            game_data_path = custom_path
        else:
            game_data_path = os.path.join(
                os.path.dirname(__file__), "jta_game_data.json"
            )
        with open(game_data_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def generate_output(self, output_directory: str) -> None:
        game_data = self._load_base_game_data()
        filename_base = self.multiworld.get_out_file_name_base(self.player)

        if self.options.vanilla_placement.value:
            # Vanilla: write unmodified game data as both gamedata and costs
            for suffix in ("_gamedata.json", "_costs.json"):
                output_path = os.path.join(output_directory, f"{filename_base}{suffix}")
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(game_data, f, indent=2)
            return

        goal_zone = self.options.goal_zone.value
        perk_tasks = get_perk_tasks_for_goal(goal_zone)

        # Build reverse map: perk display name -> perk type ID
        perk_name_to_id: Dict[str, int] = {}
        for perk_id_str, perk_info in game_data["perks"].items():
            perk_name_to_id[perk_info["name"]] = int(perk_id_str)

        # Build task_id -> new perk type ID from the fill
        perk_placement_by_task: Dict[int, int] = {}
        for task in perk_tasks:
            location = self.multiworld.get_location(task.task_name, self.player)
            if location.item is not None:
                perk_id = perk_name_to_id.get(location.item.name)
                if perk_id is not None:
                    perk_placement_by_task[task.task_id] = perk_id

        # Deep copy and apply randomized perk placements to zone task data
        modified_data = copy.deepcopy(game_data)
        for zone in modified_data["zones"]:
            for task in zone["tasks"]:
                if task["id"] in perk_placement_by_task:
                    task["perk"] = perk_placement_by_task[task["id"]]

        # Write modified game data
        output_path = os.path.join(output_directory, f"{filename_base}_gamedata.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(modified_data, f, indent=2)

    def post_output(self, output_directory: str, filename_base: str) -> None:
        """Run cost adjustment after sphere log is generated.

        Called by the export hook after generate_output and create_playthrough
        have both completed, so both the gamedata JSON and sphere log exist
        in output_directory.
        """
        if self.options.vanilla_placement.value:
            return  # Vanilla: costs already written by generate_output
        if not self.options.auto_cost_adjust.value:
            return

        player_base = self.multiworld.get_out_file_name_base(self.player)
        gamedata_path = os.path.join(output_directory, f"{player_base}_gamedata.json")
        sphere_log_path = os.path.join(
            output_directory, f"{filename_base}_sphere_log.jsonl"
        )
        costs_path = os.path.join(output_directory, f"{player_base}_costs.json")

        if not os.path.exists(gamedata_path):
            logger.warning(f"JTA: gamedata not found at {gamedata_path}, skipping cost adjust")
            return
        if not os.path.exists(sphere_log_path):
            logger.warning(f"JTA: sphere log not found at {sphere_log_path}, skipping cost adjust")
            return

        # Find scripts relative to project root
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        costgen_mode = self.options.costgen_mode.value

        if costgen_mode == 0:
            # Legacy mode: use cost-adjust.js with jtaCostGenerator
            script_path = os.path.join(project_root, "scripts", "jta", "cost-adjust.js")
            if not os.path.exists(script_path):
                logger.warning(f"JTA: cost-adjust.js not found at {script_path}")
                return
            resets = self.options.resets_per_sphere.value
            cmd = [
                "node", script_path,
                "--gamedata", gamedata_path,
                "--spherelog", sphere_log_path,
                "--output", costs_path,
                "--resets-per-sphere", str(resets),
                "--player", str(self.player),
            ]
        else:
            # Planner mode (1 or 2): use cost-plan.js with JTACostPlanner
            script_path = os.path.join(project_root, "scripts", "jta", "cost-plan.js")
            if not os.path.exists(script_path):
                logger.warning(f"JTA: cost-plan.js not found at {script_path}")
                return
            cmd = [
                "node", script_path,
                "--gamedata", gamedata_path,
                "--spherelog", sphere_log_path,
                "--output", costs_path,
                "--player", str(self.player),
                "--normal-attempts", str(self.options.costgen_normal_attempts.value),
                "--perk-attempts", str(self.options.costgen_perk_attempts.value),
                "--traversal-attempts", str(self.options.costgen_traversal_attempts.value),
            ]
            if costgen_mode == 2:
                cmd.append("--two-pass")

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=60
            )
            if result.returncode == 0:
                logger.info(f"JTA: cost adjustment complete for player {self.player}")
                if result.stdout:
                    for line in result.stdout.strip().split("\n"):
                        logger.info(f"  {line}")
            else:
                logger.warning(
                    f"JTA: cost adjustment failed (exit {result.returncode})"
                )
                if result.stderr:
                    logger.warning(f"  {result.stderr.strip()}")
        except FileNotFoundError:
            logger.warning(
                "JTA: Node.js not found. Install Node.js to enable automatic "
                "cost adjustment, or run manually:\n"
                f"  node {script_path} -g {gamedata_path} -s {sphere_log_path} "
                f"-o {costs_path}"
            )
        except subprocess.TimeoutExpired:
            logger.warning("JTA: cost adjustment timed out after 60 seconds")

    def fill_slot_data(self) -> Dict[str, Any]:
        goal_zone = self.options.goal_zone.value
        perk_tasks = get_perk_tasks_for_goal(goal_zone)

        # Build perk placement map: task_id -> perk that was placed there
        perk_placements: Dict[int, str] = {}
        for task in perk_tasks:
            location = self.multiworld.get_location(task.task_name, self.player)
            if location.item is not None:
                perk_placements[task.task_id] = location.item.name

        return {
            "game": "Journey to Ascension",
            "version": "0.5.0",
            "goalZone": goal_zone,
            "resetsPerSphere": self.options.resets_per_sphere.value,
            "costGenFactors": {
                "itemCollection": bool(self.options.costgen_item_collection.value),
                "pushCollect": bool(self.options.costgen_push_collect.value),
                "grindWithPushCollect": bool(
                    self.options.costgen_grind_with_push_collect.value
                ),
                "artifacts": bool(self.options.costgen_artifacts.value),
            },
            "automation": {
                "autoQueue": bool(self.options.automation_auto_queue.value),
                "autoReset": bool(self.options.automation_auto_reset.value),
                "drainStrategy": bool(self.options.automation_drain_strategy.value),
                "loadoutSequencing": bool(
                    self.options.automation_loadout_sequencing.value
                ),
            },
            "perkPlacements": perk_placements,
        }
