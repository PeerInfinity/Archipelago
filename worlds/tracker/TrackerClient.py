import asyncio
import logging
import traceback
from collections.abc import Callable
from CommonClient import CommonContext, gui_enabled, get_base_parser, server_loop, ClientCommandProcessor, handle_url_arg
import os
import time
import sys
from typing import Union, Any, TYPE_CHECKING


from BaseClasses import CollectionState, MultiWorld, LocationProgressType, ItemClassification, Location
from worlds.generic.Rules import exclusion_rules
from Utils import __version__, output_path, open_filename,async_start
from worlds import AutoWorld
from . import TrackerWorld, UTMapTabData, CurrentTrackerState,UT_VERSION
from .TrackerCore import TrackerCore
from collections import Counter, defaultdict
from MultiServer import mark_raw
from NetUtils import NetworkItem

from Generate import main as GMain, mystery_argparse

if TYPE_CHECKING:
    from kvui import GameManager
    from argparse import Namespace

if not sys.stdout:  # to make sure sm varia's "i'm working" dots don't break UT in frozen
    sys.stdout = open(os.devnull, 'w', encoding="utf-8")  # from https://stackoverflow.com/a/6735958

logger = logging.getLogger("Client")

DEBUG = False
ITEMS_HANDLING = 0b111
UT_MAP_TAB_KEY = "UT_MAP"

def get_ut_color(color: str)->str:
    # Return default color if GUI is disabled (e.g., in CI or nogui mode)
    if not gui_enabled:
        return "DD00FF"
    try:
        from kvui import Widget
        from typing import ClassVar
        from kivy.properties import StringProperty
        class UTTextColor(Widget):
            in_logic: ClassVar[str] = StringProperty("")
            glitched: ClassVar[str] = StringProperty("")
            out_of_logic: ClassVar[str] = StringProperty("")
            collected: ClassVar[str] = StringProperty("")
            in_logic_glitched: ClassVar[str] = StringProperty("")
            out_of_logic_glitched: ClassVar[str] = StringProperty("")
            mixed_logic: ClassVar[str] = StringProperty("")
            collected_light: ClassVar[str] = StringProperty("")
            hinted: ClassVar[str] = StringProperty("")
            hinted_in_logic: ClassVar[str] = StringProperty("")
            hinted_out_of_logic: ClassVar[str] = StringProperty("")
            hinted_glitched: ClassVar[str] = StringProperty("")
            excluded: ClassVar[str] = StringProperty("")
            unconnected: ClassVar[str] = StringProperty("")
        if not hasattr(get_ut_color,"utTextColor"):
            get_ut_color.utTextColor = UTTextColor()
        return str(getattr(get_ut_color.utTextColor,color,"DD00FF"))
    except Exception:
        # Fallback if kivy/kvui can't be imported (e.g., in headless environment)
        return "DD00FF"
    
    
class TrackerCommandProcessor(ClientCommandProcessor):
    ctx: "TrackerGameContext"

    @mark_raw
    def _cmd_inventory(self, filter_text: str = ""):
        """Print the list of current items in the inventory"""
        logger.info("Current Inventory:")
        currentState = self.ctx.updateTracker()
        for item, count in sorted(currentState.all_items.items()):
            if filter_text in item:
                logger.info(str(count) + "x: " + item)

    @mark_raw
    def _cmd_prog_inventory(self, filter_text: str = ""):
        """Print the list of current progression items in the inventory"""
        logger.info("Current Inventory:")
        currentState = self.ctx.updateTracker()
        for item, count in sorted(currentState.prog_items.items()):
            if filter_text in item:
                logger.info(str(count) + "x: " + item)

    @mark_raw
    def _cmd_event_inventory(self, filter_text: str = ""):
        """Print the list of current event items in the inventory"""
        logger.info("Current Inventory:")
        currentState = self.ctx.updateTracker()
        for event in sorted(currentState.events):
            if filter_text in event:
                logger.info(event)

    @mark_raw
    def _cmd_event_locations(self, filter_text: str = ""):
        """Print the list of current event locations in logic"""
        logger.info("Current Event Locations:")
        currentState = self.ctx.updateTracker()
        for location in sorted(currentState.event_locations):
            if filter_text in location:
                logger.info(location)

    @mark_raw
    def _cmd_manually_collect(self, item_name: str = ""):
        """Manually adds an item name to the CollectionState to test"""
        self.ctx.tracker_core.manual_items.append(item_name)
        self.ctx.updateTracker()
        logger.info(f"Added {item_name} to manually collect.")

    def _cmd_reset_manually_collect(self):
        """Resets the list of items manually collected by /manually_collect"""
        self.ctx.tracker_core.manual_items = []
        self.ctx.updateTracker()
        logger.info("Reset manually collect.")

    @mark_raw
    def _cmd_ignore(self, location_name: str = ""):
        """Ignore a location so it doesn't appear in the tracker list"""
        currentWorld = self.ctx.tracker_core.get_current_world()
        if not currentWorld:
            logger.info("Game not yet loaded")
            return

        location_name_to_id = currentWorld.location_name_to_id
        if location_name not in location_name_to_id:
            logger.info(f"Unrecognized location {location_name}")
            return

        self.ctx.tracker_core.ignored_locations.add(location_name_to_id[location_name])
        self.ctx.updateTracker()
        logger.info(f"Added {location_name} to ignore list.")

    @mark_raw
    def _cmd_ignore_all(self):
        """Ignore all currently in logic locations... if that's something you want to do"""
        currentWorld = self.ctx.tracker_core.get_current_world()
        if not currentWorld:
            logger.error("Game not yet loaded")
            return
        updatetracker_ret = self.ctx.updateTracker()
        location_name_to_id = currentWorld.location_name_to_id
        for loc in updatetracker_ret.in_logic_locations:
            if loc in location_name_to_id:
                self.ctx.tracker_core.ignored_locations.add(location_name_to_id[loc])
        self.ctx.updateTracker()

    @mark_raw
    def _cmd_unignore(self, location_name: str = ""):
        """Stop ignoring a location so it appears in the tracker list again"""
        currentWorld = self.ctx.tracker_core.get_current_world()
        if not currentWorld:
            logger.info("Game not yet loaded")
            return

        location_name_to_id = currentWorld.location_name_to_id
        if location_name not in location_name_to_id:
            logger.info(f"Unrecognized location {location_name}")
            return

        location = location_name_to_id[location_name]
        if location not in self.ctx.tracker_core.ignored_locations:
            logger.info(f"{location_name} is not on ignore list.")
            return

        self.ctx.tracker_core.ignored_locations.remove(location)
        self.ctx.updateTracker()
        logger.info(f"Removed {location_name} from ignore list.")

    def _cmd_list_ignored(self):
        """List the ignored locations"""
        if len(self.ctx.tracker_core.ignored_locations) == 0:
            logger.info("No ignored locations")
            return
        if not self.ctx.game:
            logger.info("Game not yet loaded")
            return

        logger.info("Ignored locations:")
        location_names = [self.ctx.location_names.lookup_in_game(location) for location in self.ctx.tracker_core.ignored_locations]
        for location_name in sorted(location_names):
            logger.info(location_name)

    def _cmd_reset_ignored(self):
        """Reset the list of ignored locations"""
        self.ctx.tracker_core.ignored_locations.clear()
        self.ctx.updateTracker()
        logger.info("Reset ignored locations.")

    def _cmd_next_progression(self):
        """Finds all items that will unlock a check immediately when collected, and a best guess of how many new checks they will unlock."""
        updateTracker(self.ctx)
        baseLocs = len(self.ctx.tracker_core.locations_available)
        counter = Counter()
        goal_items = []
        items_to_check = {item.name for item in self.ctx.tracker_core.multiworld.get_items() if item.player == self.ctx.tracker_core.player_id and item.advancement}
        for item in items_to_check:
            self.ctx.tracker_core.manual_items.append(item)
            update_ret = updateTracker(self.ctx)
            newlocs = len(self.ctx.tracker_core.locations_available) - baseLocs
            if newlocs:
                counter[item] = newlocs
            if self.ctx.tracker_core.multiworld.completion_condition[self.ctx.tracker_core.player_id](update_ret.state):
                goal_items.append(item)
            self.ctx.tracker_core.manual_items.pop()
        if not counter:
            logger.info("No item will unlock any checks right now.")
        for (item, count) in counter.most_common():
            logger.info(f"{item} unlocks {count} check{'s' if count > 1 else ''}{' (and goal)' if item in goal_items else ''}.")
        updateTracker(self.ctx)

    def _cmd_toggle_auto_tab(self):
        """Toggle the auto map tabbing function"""
        self.ctx.auto_tab = not self.ctx.auto_tab
        logger.info(f"Auto tracking currently {'Enabled' if self.ctx.auto_tab else 'Disabled'}")

    @mark_raw
    def _cmd_get_logical_path(self, dest_name: str = ""):
        """Finds a logical expected path to a particular location or region by name"""
        if not self.ctx.game:
            logger.info("Not yet loaded into a game")
            return
        if self.ctx.stored_data and "_read_race_mode" in self.ctx.stored_data and self.ctx.stored_data["_read_race_mode"]:
            logger.info("Logical Path is disabled during Race Mode")
            return
        get_logical_path(self.ctx, dest_name)
    
    @mark_raw
    def _cmd_explain(self,lookup_name:str=""):
        """Explains the rule for a location, if the world supports it"""
        if not self.ctx.game:
            logger.info("Not yet loaded into a game")
            return
        if self.ctx.stored_data and "_read_race_mode" in self.ctx.stored_data and self.ctx.stored_data["_read_race_mode"]:
            logger.info("Explain is disabled during Race Mode")
            return
        explain(self.ctx, lookup_name)

    @mark_raw
    def _cmd_explain_more(self, argument:str=""):
        """Asks the internal world to explain more, used to expland on /explain and /get_logical_path"""
        if not self.ctx.game:
            logger.info("Not yet loaded into a game")
            return
        if self.ctx.stored_data and "_read_race_mode" in self.ctx.stored_data and self.ctx.stored_data["_read_race_mode"]:
            logger.info("Explain is disabled during Race Mode")
            return
        explain_more(self.ctx, argument)

    def _cmd_faris_asked(self):
        """Print out the error message and any other information we think might be useful"""
        print("We're in commands")
        if self.ctx.tracker_core is not None:
            logger.error(self.ctx.tracker_core.gen_error)
            if self.ctx.tracker_core.launch_multiworld is not None:
                known_slots = [f"{slot_name} ({self.ctx.tracker_core.launch_multiworld.worlds[slot_id].game})" for slot_name, slot_id in self.ctx.tracker_core.launch_multiworld.world_name_lookup.items() if self.ctx.tracker_core.launch_multiworld.worlds[slot_id].game != "Archipelago"]
                logger.error(f"Known slots = [{', '.join(known_slots)}]")
        from worlds import failed_world_loads
        if failed_world_loads:
            logger.error(f"Worlds that failed to load [{', '.join(failed_world_loads)}]")
        if self.ctx.game:
            connected_cls = AutoWorld.AutoWorldRegister.world_types.get(self.ctx.game)
            if self.ctx.checksums[self.ctx.game] != connected_cls.get_data_package_data()["checksum"]:
                logger.error(f"Local checksum = {self.ctx.checksums[self.ctx.game]} | remote checksum = {connected_cls.get_data_package_data()['checksum']}")


def cmd_load_map(self: TrackerCommandProcessor, map_id: str = "0"):
    """Force a poptracker map id to be loaded"""
    if self.ctx.tracker_world is not None:
        self.ctx.load_map(map_id)
        self.ctx.updateTracker()
    else:
        logger.info("No world with internal map loaded")


def cmd_list_maps(self: TrackerCommandProcessor):
    """List the available maps to load with /load_map"""
    if self.ctx.tracker_world is not None:
        for i, map in enumerate(self.ctx.maps):
            logger.info("Map["+str(i)+"] = '"+map["name"]+"'")
    else:
        logger.info("No world with internal map loaded")


class TrackerGameContext(CommonContext):
    game = ""
    tags = CommonContext.tags | {"Tracker"}
    command_processor = TrackerCommandProcessor
    tracker_page = None
    map_page = None
    tracker_world: UTMapTabData | None = None
    coord_dict: dict[int, list] = {}
    deferred_dict: dict[str, list] = {}
    ldeferred_dict: dict[str,list] = {}
    map_page_coords_func = lambda *args: {}
    watcher_task = None
    update_callback: Callable[[list[str]], bool] | None = None
    region_callback: Callable[[list[str]], bool] | None = None
    events_callback: Callable[[list[str]], bool] | None = None
    glitches_callback: Callable[[list[str]], bool] | None = None
    gen_error = None
    output_format = "Both"
    hide_excluded = False
    use_split = True
    re_gen_passthrough = None
    local_items: list[NetworkItem] = []

    # UT Test Sync attributes for sphere log comparison testing
    sphere_log_mode: bool = False  # Enable sphere logging for UT comparison tests
    sphere_log_output_path: str | None = None  # Path to write sphere_log_ut.jsonl
    sphere_log_verbose: bool = False  # Use verbose (full state) vs delta format
    _sphere_log_file = None  # File handle for sphere log output
    _prev_accessible_locations: set = None  # Previous accessible locations for delta
    _prev_accessible_regions: set = None  # Previous accessible regions for delta
    _prev_items: dict = None  # Previous inventory for delta
    _debug_log_file = None  # File handle for debug log output (all messages + full state)

    _auto_tab = True

    @property
    def auto_tab(self):
        return self._auto_tab

    @auto_tab.setter
    def auto_tab(self, value):
        self._auto_tab = value
        self.ui.auto_tab = value
        if value:
            self.load_map(None)
            self.updateTracker()

    @property
    def tracker_items_received(self):
        if not (self.items_handling & 0b010):
            return self.items_received + self.local_items
        else:
            return self.items_received

    def update_tracker_items(self):
        self.local_items = [self.locations_info[location] for location in self.checked_locations
                            if location in self.locations_info and
                            self.locations_info[location].player == self.slot]

    def scout_checked_locations(self):
        unknown_locations = [location for location in self.checked_locations
                             if location not in self.locations_info]
        if unknown_locations:
            asyncio.create_task(self.send_msgs([{"cmd": "LocationScouts",
                                                 "locations": unknown_locations,
                                                 "create_as_hint": 0}]))

    def __init__(self, server_address, password, no_connection: bool = False, print_list: bool = False, print_count: bool = False):
        if no_connection:
            from worlds import network_data_package
            self.item_names = self.NameLookupDict(self, "item")
            self.location_names = self.NameLookupDict(self, "location")
            self.update_data_package(network_data_package)
        else:
            super().__init__(server_address, password)
        self.items_handling = ITEMS_HANDLING
        self.quit_after_update = print_list or print_count
        self.print_list = print_list
        self.print_count = print_count
        self.location_icon = None
        self.root_pack_path = None
        self.map_id = None
        self.defered_entrance_datastorage_keys = []
        self.defered_entrance_callback = None
        self.tracker_core = TrackerCore(logger,print_list,print_count)
        self.tracker_core.set_set_page(self.set_page)
        self.tracker_core.set_log_to_tab(self.log_to_tab)
        self.tracker_core.set_clear_page(self.clear_page)
        self.tracker_core.set_get_ut_color(get_ut_color)

    def updateTracker(self) -> CurrentTrackerState:
        if self.disconnected_intentionally: return CurrentTrackerState.init_empty_state()
        self.tracker_core.set_missing_locations(self.missing_locations)
        self.tracker_core.set_items_received(self.tracker_items_received)
        hints = {}
        if f"_read_hints_{self.team}_{self.slot}" in self.stored_data:
            from NetUtils import HintStatus
            hints = { hint["location"]:hint["status"] for hint in self.stored_data[f"_read_hints_{self.team}_{self.slot}"] if hint["status"] not in [HintStatus.HINT_FOUND, HintStatus.HINT_AVOID ]and self.slot_concerns_self(hint["finding_player"]) }
        self.tracker_core.set_hints( hints)
        try:
            updateTracker_ret = self.tracker_core.updateTracker()
        except Exception as e:
            if self.sphere_log_mode:
                # In sphere_log_mode: Log the error but don't disconnect - this allows the tracker
                # to continue operating even if there's a temporary issue (e.g., invalid item ID)
                # This is especially important during UT comparison testing where a disconnect
                # would cause the test driver to timeout waiting for READY
                logger.error(f"[UT] updateTracker failed: {e}")
                import traceback
                traceback.print_exc()
                return CurrentTrackerState.init_empty_state()
            else:
                # Normal mode: disconnect on error (original behavior)
                self.disconnected_intentionally = True
                async_start(self.disconnect(False), name="disconnecting")
                raise e
        if updateTracker_ret.state is None:
            return updateTracker_ret # core.updateTracker failed, just pass it along
        if self.tracker_page:
            self.tracker_page.refresh_from_data()
        if self.update_callback is not None:
            self.update_callback(updateTracker_ret.in_logic_locations)
        if self.region_callback is not None:
            self.region_callback(updateTracker_ret.in_logic_regions)
        if self.events_callback is not None:
            self.events_callback(updateTracker_ret.events)
        if self.glitches_callback is not None:
            self.glitches_callback(updateTracker_ret.glitched_locations)
        if len(self.tracker_core.ignored_locations) > 0:
            self.log_to_tab(f"{len(self.tracker_core.ignored_locations)} ignored locations")
        if len(updateTracker_ret.in_logic_locations) == 0:
            self.log_to_tab("All " + str(len(self.checked_locations)) + " accessible locations have been checked! Congrats!")
        if self.tracker_world is not None and self.ui is not None:
            # ctx.load_map()
            for location in self.server_locations:
                relevent_coords = self.coord_dict.get(location, [])
                if not relevent_coords:
                    continue
                
                if location in self.checked_locations or location in self.tracker_core.ignored_locations:
                    status = "collected"
                elif location in self.tracker_core.locations_available:
                    status = "in_logic"
                elif location in self.tracker_core.glitched_locations:
                    status = "glitched"
                else:
                    status = "out_of_logic"
                if location in hints:
                    status = "hinted_"+status
                for coord in relevent_coords:
                    coord.update_status(location, status)
            entrance_cache = list(self.tracker_core.multiworld.regions.entrance_cache[self.tracker_core.player_id].keys())
            for entrance_name in entrance_cache:
                relevent_coords = self.deferred_dict.get(entrance_name,[])
                if not relevent_coords:
                    continue
                temp_entrance = self.tracker_core.get_current_world().get_entrance(entrance_name)
                if temp_entrance.can_reach(updateTracker_ret.state):
                    if temp_entrance.connected_region:
                        status = "passed"
                    else:
                        status = "passable"
                else:
                    status = "impassable"
                for coord in relevent_coords:
                    coord.update_status(entrance_name, status)
            event_loc_cache = [loc for loc in self.tracker_core.get_current_world().get_locations() if loc.address is None and loc.parent_region is not None]
            for loc in event_loc_cache:
                relevent_coords = self.ldeferred_dict.get(loc.name,[])
                if not relevent_coords:
                    continue
                if loc.parent_region.can_reach(updateTracker_ret.state):
                    if loc.can_reach(updateTracker_ret.state):
                        status = "passed"
                    else:
                        status = "passable"
                else:
                    status = "impassable"
                for coord in relevent_coords:
                    coord.update_status(loc.name, status)
        for entrance in updateTracker_ret.unconnected_entrances:
            self.log_to_tab("[color="+get_ut_color("unconnected")+"]"+entrance.name+"[/color]",False) #keep these at the bottom
        if self.quit_after_update:
            name = self.player_names[self.slot]
            if self.print_count:
                logger.error(f"Game: {self.game} | Slot Name : {name} | In logic locations : {len(updateTracker_ret.in_logic_locations)}")
            if self.print_list:
                for i in updateTracker_ret.readable_locations:
                    logger.error(i)
            self.exit_event.set()

        if hasattr(self, "tracker_total_locs_label"):
            self.tracker_total_locs_label.text = f"Locations: {len(self.checked_locations)}/{self.total_locations}"
        if hasattr(self, "tracker_logic_locs_label"):
            self.tracker_logic_locs_label.text = f"In Logic: {len(updateTracker_ret.in_logic_locations)}"
        if hasattr(self, "tracker_glitched_locs_label"):
            self.tracker_glitched_locs_label.text = f"Glitched: [color={get_ut_color('glitched')}]{len(updateTracker_ret.glitched_locations)}[/color]"
        if hasattr(self, "tracker_hinted_locs_label"):
            self.tracker_hinted_locs_label.text = f"Hinted: [color={get_ut_color('hinted_in_logic')}]{len(updateTracker_ret.hinted_locations)}[/color]"

        return updateTracker_ret

    def parse_layout_node(self, node, curr_path, is_tab=False):
        if is_tab:
            name = node["title"]
            curr_path = name if curr_path is None else f"{curr_path}/{name}"
        else:
            name = None
        maps = []

        if "type" in node and node["type"] == "map":
            maps = node["maps"]
            if curr_path is not None:
                if len(maps) == 1:
                    self.map_to_name[maps[0]] = curr_path
                else:
                    for m in maps:
                        self.map_to_name[m] = f"{curr_path}/{m}"
        elif "content" in node:
            if isinstance(node["content"], list):
                for item in node["content"]:
                    result = self.parse_layout_node(item, curr_path)
                    if isinstance(result, list):
                        maps.extend(result)
                    elif result:
                        maps.append(result)
            else:
                result = self.parse_layout_node(node["content"], curr_path)
                if result:
                    maps = result
        elif "tabs" in node:
            if isinstance(node["tabs"], list):
                for item in node["tabs"]:
                    result = self.parse_layout_node(item, curr_path, True)
                    if isinstance(result, list):
                        maps.extend(result)
                    elif result:
                        maps.append(result)
            else:
                result = self.parse_layout_node(node["tabs"], curr_path, True)
                if result:
                    maps = result

        return (name, maps) if name is not None else maps

    def parse_map_group_node_names(self, node: str | tuple, curr_path: str, has_siblings: bool):
        if isinstance(node, str):
            if has_siblings:
                curr_path = node if curr_path is None else f"{curr_path}/{node}"
            self.map_to_name[node] = curr_path
        else:
            name = node[0]
            curr_path = name if curr_path is None else f"{curr_path}/{name}"
            if isinstance(node[1], list):
                for x in node[1]:
                    self.parse_map_group_node_names(x, curr_path, len(node[1]) > 1)
            else:
                self.parse_map_group_node_names(node[1], curr_path, False)

    def parse_map_groups(self):
        self.map_to_name = {}
        if self.tracker_world.map_page_groups is not None:
            self.map_groups = self.tracker_world.map_page_groups
            for x in self.map_groups:
                self.parse_map_group_node_names(x, None, True)
            return
        all_layouts = []
        for layout in self.layouts:
            maps = []
            for key, node in layout.items():
                result = self.parse_layout_node(node, None)
                if result:
                    maps.extend(result)
            if maps:
                all_layouts.extend(maps)
        self.map_groups = all_layouts

    def load_pack(self):
        assert self.tracker_core.player_id is not None
        assert self.tracker_world is not None
        current_world = self.tracker_core.get_current_world()
        assert current_world
        self.maps = []
        self.locs = []
        self.layouts = []
        if self.tracker_world.external_pack_key:
            assert current_world.settings
            try:
                from zipfile import is_zipfile
                packRef = current_world.settings[self.tracker_world.external_pack_key]
                if packRef == "":
                    prompt_desc = getattr(current_world.settings[self.tracker_world.external_pack_key],"ut_dialog_name","Select Poptracker pack")
                    packRef = open_filename(prompt_desc, filetypes=[("Poptracker Pack", [".zip"])])
                    current_world.settings[self.tracker_world.external_pack_key] = packRef
                    current_world.settings._changed = True
                if packRef:
                    if is_zipfile(packRef):
                        current_world.settings.update({self.tracker_world.external_pack_key: packRef})
                        current_world.settings._changed = True
                        for map_page in self.tracker_world.map_page_maps:
                            self.maps += load_json_zip(packRef, f"{map_page}")
                        for loc_page in self.tracker_world.map_page_locations:
                            self.locs += load_json_zip(packRef, f"{loc_page}")
                        for layout_page in self.tracker_world.map_page_layouts:
                            self.layouts.append(load_json_zip(packRef, f"{layout_page}"))
                    else:
                        current_world.settings.update({self.tracker_world.external_pack_key: ""}) #failed to find a pack, prompt next launch
                        current_world.settings._changed = True
                        self.tracker_world = None
                        return
                else:
                    current_world.settings[self.tracker_world.external_pack_key] = None
                    self.tracker_world = None
                    return
            except Exception as e:
                logger.error("Selected poptracker pack was invalid")
                current_world.settings[self.tracker_world.external_pack_key] = ""
                current_world.settings._changed = True
                self.tracker_world = None
                return
        else:
            PACK_NAME = current_world.__class__.__module__
            for map_page in self.tracker_world.map_page_maps:
                self.maps += load_json(PACK_NAME, f"/{self.tracker_world.map_page_folder}/{map_page}")
            for loc_page in self.tracker_world.map_page_locations:
                self.locs += load_json(PACK_NAME, f"/{self.tracker_world.map_page_folder}/{loc_page}")
            for layout_page in self.tracker_world.map_page_layouts:
                self.layouts.append(load_json(PACK_NAME, f"/{self.tracker_world.map_page_folder}/{layout_page}"))
        self.parse_map_groups()
        self.load_map(None)

    def load_map(self, map_id: Union[int, str, None]):
        """REMEMBER TO RUN UPDATE_TRACKER!"""
        if not self.ui or self.tracker_world is None:
            return
        if map_id is None:
            key = self.tracker_world.map_page_setting_key or f"{self.slot}_{self.team}_{UT_MAP_TAB_KEY}"
            map_id = self.tracker_world.map_page_index(self.stored_data.get(key, ""))
            if not self.auto_tab or map_id < 0 or map_id >= len(self.maps):
                return  # special case, don't load a new map
        if self.map_id is not None and self.map_id == map_id:
            return  # map already loaded
        m = None
        if isinstance(map_id, str) and not map_id.isdecimal():
            for map in self.maps:
                if map["name"] == map_id:
                    m = map
                    map_id = self.maps.index(map)
                    break
            else:
                logger.error("Attempted to load a map that doesn't exist")
                return
        else:
            if isinstance(map_id, str):
                map_id = int(map_id)
            if map_id is None or map_id < 0 or map_id >= len(self.maps):
                logger.error("Attempted to load a map that doesn't exist")
                return
            m = self.maps[map_id]
        self.map_id = map_id
        if self.map_to_name is not None:
            self.ui.current_map = self.map_to_name.get(m["name"], m["name"])
        else:
            self.ui.current_map = m["name"]
        location_name_to_id = AutoWorld.AutoWorldRegister.world_types[self.game].location_name_to_id
        # m = [m for m in self.maps if m["name"] == map_name]
        if self.tracker_world.external_pack_key:
            from zipfile import is_zipfile
            packRef = self.tracker_core.get_current_world().settings[self.tracker_world.external_pack_key]
            if packRef and is_zipfile(packRef):
                self.root_pack_path = f"ap:zip:{packRef}"
            else:
                logger.error("Player poptracker doesn't seem to exist :< (must be a zip file)")
                return
        else:
            PACK_NAME = self.tracker_core.get_current_world().__class__.__module__
            self.root_pack_path = f"ap:{PACK_NAME}/{self.tracker_world.map_page_folder}"
        self.ui.source = f"{self.root_pack_path}/{m['img']}"
        self.ui.loc_size = m["location_size"] if "location_size" in m else 65  # default location size per poptracker/src/core/map.h
        self.ui.loc_icon_size = m["location_icon_size"] if "location_icon_size" in m else self.ui.loc_size
        self.ui.loc_border = m["location_border_thickness"] if "location_border_thickness" in m else 8  # default location size per poptracker/src/core/map.h
        temp_locs = [location for location in self.locs]
        map_locs = []
        while temp_locs:
            temp_loc = temp_locs.pop()
            if "map_locations" in temp_loc:
                if "name" not in temp_loc:
                    temp_loc["name"] = ""
                map_locs.append(temp_loc)
            elif "children" in temp_loc:
                temp_locs.extend(temp_loc["children"])
        coords = {
            (map_loc["x"], map_loc["y"]):
                [location_name_to_id[section["name"]] for section in location["sections"]
                 if "name" in section and section["name"] in location_name_to_id
                 and location_name_to_id[section["name"]] in self.server_locations]

            for location in map_locs
            for map_loc in location["map_locations"]
            if map_loc["map"] == m["name"] and any(
                "name" in section and section["name"] in location_name_to_id
                and location_name_to_id[section["name"]] in self.server_locations for section in location["sections"]
                )
        }
        poptracker_name_mapping = self.tracker_world.poptracker_name_mapping
        if poptracker_name_mapping:
            tempCoords = {  # compat coords
                (map_loc["x"], map_loc["y"]):
                    [poptracker_name_mapping[f'{location["name"]}/{section["name"]}']
                    for section in location["sections"] if "name" in section
                    and f'{location["name"]}/{section["name"]}' in poptracker_name_mapping
                    and poptracker_name_mapping[f'{location["name"]}/{section["name"]}'] in self.server_locations]
                for location in map_locs
                for map_loc in location["map_locations"]
                if map_loc["map"] == m["name"]
                and any("name" in section and f'{location["name"]}/{section["name"]}' in poptracker_name_mapping
                        and poptracker_name_mapping[f'{location["name"]}/{section["name"]}'] in self.server_locations
                        for section in location["sections"])
            }
            for maploc, seclist in tempCoords.items():
                if maploc in coords:
                    coords[maploc] += seclist
                else:
                    coords[maploc] = seclist
        entrance_cache = list(self.tracker_core.multiworld.regions.entrance_cache[self.tracker_core.player_id].keys())
        dcoords = {
            (map_loc["x"],map_loc["y"]):[section["name"] for section in location["sections"]
                if "name" in section and section["name"] in entrance_cache ]
            for location in map_locs
            for map_loc in location["map_locations"]
            if map_loc["map"] == m["name"] and any(
                "name" in section and section["name"] in entrance_cache for section in location["sections"]
            )
        }
        poptracker_entrance_mapping = self.tracker_world.poptracker_entrance_mapping
        if poptracker_entrance_mapping:
            tempCoords = {
                (map_loc["x"],map_loc["y"]):[poptracker_entrance_mapping[section["name"]] for section in location["sections"]
                    if "name" in section and  section["name"] in poptracker_entrance_mapping and poptracker_entrance_mapping[section["name"]] in entrance_cache]
                for location in map_locs
                for map_loc in location["map_locations"]
                if map_loc["map"] == m["name"] and any(
                    "name" in section and  section["name"] in poptracker_entrance_mapping and poptracker_entrance_mapping[section["name"]] in entrance_cache for section in location["sections"]
                )
            }
            for maploc, seclist in tempCoords.items():
                if maploc in dcoords:
                    dcoords[maploc] += seclist
                else:
                    dcoords[maploc] = seclist
        event_loc_cache = [loc.name for loc in self.tracker_core.get_current_world().get_locations() if loc.address is None and loc.parent_region is not None]
        dlcoords = {
            (map_loc["x"],map_loc["y"]):[section["name"] for section in location["sections"]
                if "name" in section and section["name"] in event_loc_cache ]
            for location in map_locs
            for map_loc in location["map_locations"]
            if map_loc["map"] == m["name"] and any(
                "name" in section and section["name"] in event_loc_cache for section in location["sections"]
            )
        }
        both_dcoords = set(entrance_cache).intersection(set(event_loc_cache))
        if both_dcoords:
            for _,temp_coord in dcoords.items():
                if both_dcoords.intersection(set(temp_coord)):
                    logger.error("Mixing of entrance and event names, map will refuse to load")
                    return
            for _,temp_coord in dlcoords.items():
                if both_dcoords.intersection(set(temp_coord)):
                    logger.error("Mixing of entrance and event names, map will refuse to load")
                    return
        self.coord_dict,self.deferred_dict,self.ldeferred_dict = self.map_page_coords_func(coords,dcoords,dlcoords,self.use_split)
        if self.tracker_world.location_setting_key:
            self.update_location_icon_coords()

    def clear_page(self):
        if self.tracker_page is not None:
            self.tracker_page.resetData()

    def set_page(self, line: str):
        if self.tracker_page is not None:
            self.tracker_page.data = [{"text": line}]

    def log_to_tab(self, line: str, sort: bool = False):
        if self.tracker_page is not None:
            self.tracker_page.addLine(line, sort)

    def set_callback(self, func: Callable[[list[str]], bool] | None = None):
        self.update_callback = func

    def set_region_callback(self, func: Callable[[list[str]], bool] | None = None):
        self.region_callback = func

    def set_events_callback(self, func: Callable[[list[str]], bool] | None = None):
        self.events_callback = func

    def set_glitches_callback(self, func: Callable[[list[str]], bool] | None = None):
        self.glitches_callback = func

    def build_gui(self, manager: "GameManager"):
        from kivy.uix.boxlayout import BoxLayout
        from kvui import MDRecycleView, HoverBehavior, MDLabel, MDDivider
        from kivymd.uix.tooltip import MDTooltip
        from kivy.uix.widget import Widget
        from kivy.properties import StringProperty, NumericProperty, BooleanProperty
        from kivy.metrics import dp
        from kvui import ApAsyncImage, ToolTip
        from .TrackerKivy import SomethingNeatJustToMakePythonHappy

        class CheckItem(BoxLayout):
            text = StringProperty()
            active = BooleanProperty()

        class TrackerLayout(BoxLayout):
            pass

        class TrackerTooltip(ToolTip):
            pass
    
        class TrackerView(MDRecycleView):
            def __init__(self, **kwargs):
                super().__init__(**kwargs)
                self.data = []
                self.data.append({"text": f"Tracker {UT_VERSION} Initializing for AP version {__version__}"})

            def resetData(self):
                self.data.clear()

            def addLine(self, line: str, sort: bool = False):
                self.data.append({"text": line})
                if sort:
                    self.data.sort(key=lambda e: e["text"])

        class ApLocationIcon(ApAsyncImage):
            pass

        class ApLocation(HoverBehavior, Widget, MDTooltip):
            from kivy.properties import DictProperty, ColorProperty
            locationDict = DictProperty()

            def __init__(self, sections, parent, **kwargs):
                for location_id in sections:
                    self.locationDict[location_id] = "none"
                    self.tracker_page = parent
                self.bind(locationDict=self.update_color)
                super().__init__(**kwargs)
                self._tooltip = TrackerTooltip(text="Test")
                self._tooltip.markup = True
            
            def on_enter(self):
                self._tooltip.text = self.get_text()
                self.display_tooltip()

            def on_leave(self):
                self.animation_tooltip_dismiss()
            
            def transform_to_pop_coords(self,x,y):
                x2 = (x)
                y2 = (self.tracker_page.height - y)
                x3 = x2 - (self.tracker_page.x + (self.tracker_page.width - self.tracker_page.norm_image_size[0])/2)
                y3 = y2 + (self.tracker_page.y - (self.tracker_page.height - self.tracker_page.norm_image_size[1])/2)
                x4 = x3 / ((self.tracker_page.norm_image_size[0] / self.tracker_page.texture_size[0]) if self.tracker_page.texture_size[0] > 0 else 1)
                y4 = y3 / ((self.tracker_page.norm_image_size[1] / self.tracker_page.texture_size[1]) if self.tracker_page.texture_size[0] > 0 else 1)
                x5 = x4 + self.width/2
                y5 = y4 + self.width/2
                return (x5,y5)
            
            def on_mouse_pos(self, window, pos): #this does nothing, but it's kept here to make adding debug prints easier
                return super().on_mouse_pos(window, pos)

            def to_window(self, x, y):
                if self.border_point:
                    return self.border_point
                else:
                    return self.tracker_page.to_window(x,y)
            
            def to_widget(self, x, y):
                return self.transform_to_pop_coords(*self.tracker_page.to_widget(x,y))

            def update_status(self, location, status):
                if location in self.locationDict:
                    if self.locationDict[location] != status:
                        self.locationDict[location] = status
            
            def get_text(self):
                ctx = manager.get_running_app().ctx
                location_id_to_name = AutoWorld.AutoWorldRegister.world_types[ctx.game].location_id_to_name
                sReturn = []
                for loc,status in self.locationDict.items():
                    color = get_ut_color("collected_light")
                    if status in ["in_logic","out_of_logic","glitched","hinted_in_logic","hinted_out_of_logic","hinted_glitched"]:
                        color = get_ut_color(status)
                    sReturn.append(f"{location_id_to_name[loc]} : [color={color}]{status}[/color]") 
                return "\n".join(sReturn)

            def update_color(self, locationDict):
                return
            
        class ApLocationDeferred(ApLocation):
            from kivy.properties import ColorProperty
            color = ColorProperty("#"+get_ut_color("error"))
            def __init__(self, sections, parent, entrance, **kwargs):
                super().__init__(sections, parent, **kwargs)
                self.entrance = entrance

            @staticmethod
            def update_color(self, entranceDict):
                passable = any(status == "passable" for status in entranceDict.values())
                impassable = any(status == "impassable" for status in entranceDict.values())
                if passable:
                    self.color = "#"+get_ut_color("in_logic")
                elif impassable:
                    self.color = "#"+get_ut_color("out_of_logic")
                else:
                    self.color = "#"+get_ut_color("collected")
            
            def get_text(self):
                ctx = manager.get_running_app().ctx
                host_world:AutoWorld.World = ctx.tracker_core.get_current_world()
                sReturn = []
                for entrance, status in self.locationDict.items():
                    color = get_ut_color("out_of_logic")
                    if status == "passed":
                        color = get_ut_color("collected_light")
                    elif status == "passable":
                        color = get_ut_color("in_logic")
                    poptracker_entrance_mapping: dict[str, str] | None = ctx.tracker_world.poptracker_entrance_mapping
                    if poptracker_entrance_mapping:
                        try:
                            entrance_name = next(key for key in poptracker_entrance_mapping if poptracker_entrance_mapping[key] == entrance)
                        except StopIteration:
                            entrance_name = entrance
                    else:
                        entrance_name = entrance
                    sReturn.append(f"{entrance_name} : [color={color}]{status}[/color]")
                    if host_world:
                        if self.entrance:
                            real_entrance = host_world.get_entrance(entrance)
                            if real_entrance.connected_region:
                                sReturn.append(f" - connects to ({real_entrance.connected_region.name})")
                return "\n".join(sReturn)

            
        class APLocationMixed(ApLocation):
            from kivy.properties import ColorProperty
            color = ColorProperty("#"+get_ut_color("error"))

            def __init__(self, sections, parent, **kwargs):
                super().__init__(sections, parent, **kwargs)

            @staticmethod
            def update_color(self, locationDict):
                glitches = any(status.endswith("glitched") for status in locationDict.values())
                in_logic = any(status.endswith("in_logic") for status in locationDict.values())
                out_of_logic = any(status.endswith("out_of_logic") for status in locationDict.values())
                hinted = any(status.startswith("hinted") for status in locationDict.values())

                if in_logic and (out_of_logic or (glitches and hinted)):
                    self.color = "#"+get_ut_color("mixed_logic")
                elif glitches and hinted:
                    self.color = "#"+get_ut_color("hinted_glitched")
                elif hinted and out_of_logic:
                    self.color = "#"+get_ut_color("hinted_out_of_logic")
                elif hinted:
                    self.color = "#"+get_ut_color("hinted")
                elif glitches and in_logic:
                    self.color = "#"+get_ut_color("in_logic_glitched")
                elif glitches and out_of_logic:
                    self.color = "#"+get_ut_color("out_of_logic_glitched")
                elif in_logic:
                    self.color = "#"+get_ut_color("in_logic")
                elif out_of_logic:
                    self.color = "#"+get_ut_color("out_of_logic")
                elif glitches:
                    self.color = "#"+get_ut_color("glitched")
                else:
                    self.color = "#"+get_ut_color("collected")

        class APLocationSplit(ApLocation):
            from kivy.properties import ColorProperty
            color_1 = ColorProperty("#"+get_ut_color("error"))
            color_2 = ColorProperty("#"+get_ut_color("error"))
            color_3 = ColorProperty("#"+get_ut_color("error"))
            color_4 = ColorProperty("#"+get_ut_color("error"))
            def __init__(self, sections, parent, **kwargs):
                super().__init__(sections, parent, **kwargs)

            @staticmethod
            def update_color(self, locationDict):
                #glitches = any(status.endswith("glitched") for status in locationDict.values())

                color_list = Counter()
                def sort_status(pair) -> float:
                    if pair[0] == "out_of_logic": return 0
                    if pair[0] == "in_logic": return 999999999
                    if pair[0] == "hinted_in_logic": return 8888888
                    return pair[1] + (ord(pair[0][0])/10)

                for status in locationDict.values():
                    if status == "collected": #ignore collected
                        continue
                    color_list[status] += 1

                color_list = [k for k,v in sorted(color_list.items(),key=sort_status,reverse=True)]
                if color_list:
                    color_list = (color_list * max(2, (4 // len(color_list))))[:4]
                    self.color_1="#"+get_ut_color(color_list[0])
                    self.color_2="#"+get_ut_color(color_list[1])
                    self.color_3="#"+get_ut_color(color_list[2])
                    self.color_4="#"+get_ut_color(color_list[3])
                else:
                    self.color_1="#"+get_ut_color("collected")
                    self.color_2="#"+get_ut_color("collected")
                    self.color_3="#"+get_ut_color("collected")
                    self.color_4="#"+get_ut_color("collected")

        class VisualTracker(BoxLayout):
            location_icon: ApLocationIcon
            def load_coords(self,  coords: dict[tuple,list[int]], defered_coords: dict[tuple, list[str]],
                             ldefered_coords: dict[tuple, list[str]], use_split) -> tuple[dict[int,list], dict[str,list], dict[str,list]]:
                self.ids.location_canvas.clear_widgets()
                returnDict: dict[int,list] = defaultdict(list)
                deferredDict: dict[str,list] = defaultdict(list)
                ldeferredDict: dict[str,list] = defaultdict(list)
                for coord, sections in coords.items():
                    # https://discord.com/channels/731205301247803413/1170094879142051912/1272327822630977727
                    ap_location_class = APLocationSplit if use_split else APLocationMixed
                    temp_loc = ap_location_class(sections, self.ids.tracker_map, pos=(coord))
                    self.ids.location_canvas.add_widget(temp_loc)
                    for location_id in sections:
                        returnDict[location_id].append(temp_loc)
                for coord, sections in defered_coords.items():
                    temp_loc = ApLocationDeferred(sections, self.ids.tracker_map, True, pos=(coord))
                    self.ids.location_canvas.add_widget(temp_loc)
                    for entrance_name in sections:
                        deferredDict[entrance_name].append(temp_loc)
                for coord, sections in ldefered_coords.items():
                    temp_loc = ApLocationDeferred(sections, self.ids.tracker_map, False, pos=(coord))
                    self.ids.location_canvas.add_widget(temp_loc)
                    for event_name in sections:
                        ldeferredDict[event_name].append(temp_loc)
                self.ids.location_canvas.add_widget(self.location_icon)
                return returnDict, deferredDict, ldeferredDict


        try:
            tracker = TrackerLayout(orientation="vertical")
            tracker_view = TrackerView()

            # Creates a header
            tracker_header = BoxLayout(orientation="horizontal", size_hint_y=None, height=dp(36))
            tracker_divider = MDDivider(size_hint_y=None, height=dp(1))
            self.tracker_total_locs_label = MDLabel(text="Locations: 0/0", halign="center")
            self.tracker_logic_locs_label = MDLabel(text="In Logic: 0", halign="center")
            self.tracker_glitched_locs_label = MDLabel(text=f"Glitched: [color={get_ut_color('glitched')}]0[/color]",  halign="center")
            self.tracker_hinted_locs_label = MDLabel(text=f"Hinted: [color={get_ut_color('hinted_in_logic')}]0[/color]", halign="center")
            self.tracker_glitched_locs_label.markup = True
            self.tracker_hinted_locs_label.markup = True
            tracker_header.add_widget(self.tracker_total_locs_label)
            tracker_header.add_widget(self.tracker_logic_locs_label)
            tracker_header.add_widget(self.tracker_glitched_locs_label)
            tracker_header.add_widget(self.tracker_hinted_locs_label)

            # Adds the tracker list at the bottom
            tracker.add_widget(tracker_header)
            tracker.add_widget(tracker_divider)
            tracker.add_widget(tracker_view)

            self.tracker_page = tracker_view
            self.location_icon = ApLocationIcon()

            map_content = VisualTracker()
            map_content.location_icon = self.location_icon
            self.map_page_coords_func = map_content.load_coords
            if self.gen_error is not None:
                for line in self.gen_error.split("\n"):
                    self.log_to_tab(line, False)
        except Exception as e:
            # TODO back compat, fail gracefully if a kivy app doesn't have our properties
            self.map_page_coords_func = lambda *args: {}
            tb = traceback.format_exc()
            print(tb)
        manager.add_client_tab("Tracker Page", tracker)

        @staticmethod
        def set_map_tab(self, value, *args, map_content=map_content, test=[]):
            if value:
                if not test:
                    test.append(self.add_client_tab("Map Page", map_content))
            else:
                if test:
                    map_tab = test.pop()
                    map_tab.content.parent = None
                    self.remove_client_tab(map_tab)


        manager.apply_property(show_map=BooleanProperty(True))
        manager.fbind("show_map",set_map_tab)
        manager.show_map = False


    def make_gui(self):
        ui = super().make_gui()  # before the kivy imports so kvui gets loaded first
        from kvui import HintLog, HintLabel, TooltipLabel
        from kivy.properties import StringProperty, NumericProperty, BooleanProperty
        from kivymd.uix.menu import MDDropdownMenu
        from kivy.metrics import dp
        from kivy.animation import Animation
        from kvui import ImageLoader

        class TrackerManager(ui):
            source = StringProperty("")
            loc_size = NumericProperty(20)
            loc_icon_size = NumericProperty(20)
            loc_border = NumericProperty(5)
            enable_map = BooleanProperty(False)
            iconSource = StringProperty("")
            current_map = StringProperty("")
            auto_tab = BooleanProperty(True)
            base_title = f"Tracker {UT_VERSION} for AP version"  # core appends ap version so this works

            def build(self):
                class TrackerHintLabel(HintLabel):
                    logic_text = StringProperty("")

                    def __init__(self, *args, **kwargs):
                        super().__init__(*args, **kwargs)
                        logic = TooltipLabel(
                            sort_key="finding",  # is lying to computer and player but fixing it will need core changes
                            text="", halign='center', valign='center', pos_hint={"center_y": 0.5},
                            )
                        self.add_widget(logic)

                        def set_text(_, value):
                            logic.text = value
                        self.bind(logic_text=set_text)

                    def refresh_view_attrs(self, rv, index, data):
                        super().refresh_view_attrs(rv, index, data)
                        if data["item"]["text"] == rv.header["item"]["text"]:
                            self.logic_text = "[u]In Logic[/u]"
                            return
                        ctx = ui.get_running_app().ctx
                        if "status" in data:
                            loc = data["status"]["hint"]["location"]
                            from NetUtils import HintStatus
                            found = data["status"]["hint"]["status"] == HintStatus.HINT_FOUND
                        else:
                            prefix = len("[color=00FF7F]")
                            suffix = len("[/color]")
                            loc_name = data["location"]["text"][prefix:-1*suffix]
                            loc = AutoWorld.AutoWorldRegister.world_types[ctx.game].location_name_to_id.get(loc_name)
                            found = "Not Found" not in data["found"]["text"]

                        in_logic = loc in ctx.tracker_core.locations_available
                        self.logic_text = rv.parser.handle_node({
                            "type": "color", "color": "green" if found else
                            "orange" if in_logic else "red",
                            "text": "Found" if found else "In Logic" if in_logic
                            else "Not Found"})

                def kv_post(self, base_widget):
                    self.viewclass = TrackerHintLabel
                HintLog.on_kv_post = kv_post

                container = super().build()
                self.ctx.build_gui(self)

                return container

            def update_hints(self):
                try:
                    if self.ctx.tracker_core.player_id and self.ctx.tracker_core.multiworld:
                        self.ctx.updateTracker()
                except Exception as e:
                    self.ctx.disconnected_intentionally = True
                    raise e
                return super().update_hints()

            def set_dropdown_items(self, menu: MDDropdownMenu, menu_items):
                menu.items = menu_items

                menu.set_menu_properties()
                menu.position = menu.adjust_position()
                if menu.width <= 100:
                    menu.width = dp(240)
                menu._tar_x, menu._tar_y = menu.get_target_pos()

                anim = Animation(
                    height=menu.target_height,
                    x=menu._tar_x,
                    y=menu._tar_y - menu.target_height,
                    scale_value_center=menu.caller.center,

                    duration=menu.hide_duration*2,
                    transition=menu.hide_transition,
                )
                anim.start(menu)

            def create_dropdown_menu_items(self, menu: MDDropdownMenu, groups: list[tuple[str, list]]):
                menu_items = []
                for group in groups:
                    if isinstance(group, str):
                        name = group
                        x = group
                        trailing_icon = ""
                    else:
                        name = group[0]
                        x = group[1]
                        if isinstance(x, list) and len(x) == 1 and isinstance(x[0], str) or isinstance(x, str):
                           trailing_icon = ""
                        else:
                           trailing_icon = "menu-right"
                    menu_items.append({"text": name, "trailing_icon": trailing_icon, "on_release": lambda menu=menu, x=x: self.map_dropdown_callback(menu, x)})
                return menu_items

            def open_map_dropdown(self, item):
                dropdown_menu = MDDropdownMenu(caller=item, hor_growth="right", ver_growth="down")
                if self.ctx.map_groups:
                    menu_items = self.create_dropdown_menu_items(dropdown_menu, self.ctx.map_groups)
                else:
                    menu_items = [
                        *[{"text": m["name"], "on_release": lambda i=i: self.map_dropdown_callback(dropdown_menu, i)} for i, m in enumerate(self.ctx.maps)]
                    ]
                dropdown_menu.items = menu_items
                dropdown_menu.open()

            def map_dropdown_callback(self, menu: MDDropdownMenu, group_item):
                if not isinstance(group_item, list):
                    self.ctx.load_map(group_item)
                    self.ctx.updateTracker()
                elif isinstance(group_item, list) and len(group_item) == 1 and isinstance(group_item[0], str):
                    self.ctx.load_map(group_item[0])
                    self.ctx.updateTracker()
                else:
                    menu_items = [{"text": "Return", "leading_icon": "menu-left", "on_release": lambda menu=menu, items=menu.items: self.set_dropdown_items(menu, items)}]
                    menu_items.extend(self.create_dropdown_menu_items(menu, group_item))

                    self.set_dropdown_items(menu, menu_items)

            def on_auto_tab_active(self, checkitem, value):
                self.ctx.auto_tab = value

        self.load_kv()
        return TrackerManager

    def load_kv(self):
        from kivy.lang import Builder
        import pkgutil
        from Utils import user_path

        data = pkgutil.get_data(TrackerWorld.__module__, "Tracker.kv").decode()
        Builder.load_string(data)
        user_file = user_path("data","user.kv")
        if os.path.exists(user_file):
            logging.info("loading user.kv into builder.")
            Builder.load_file(user_file)

    async def server_auth(self, password_requested: bool = False):
        if password_requested and not self.password:
            await super(TrackerGameContext, self).server_auth(password_requested)

        await self.get_username()
        if "Tracker" in self.tags:
            await self.send_connect(game="")
        else:
            await self.send_connect()

    def run_generator(self):
        self.tracker_core.run_generator(None, None)
        self.use_split = self.tracker_core.use_split #fancy hack

    def on_package(self, cmd: str, args: dict):
        # Log all messages to debug log if sphere_log_mode is enabled
        if self.sphere_log_mode:
            self._open_debug_log()
            # Create a sanitized version of args for logging (avoid huge data)
            log_args = {}
            for key, value in args.items():
                if key in ('slot_info', 'slot_data', 'players'):
                    log_args[key] = f"<{type(value).__name__} len={len(value) if hasattr(value, '__len__') else '?'}>"
                elif isinstance(value, (list, set)) and len(value) > 20:
                    log_args[key] = f"<{type(value).__name__} len={len(value)}>"
                else:
                    log_args[key] = value
            self._log_debug_message(f"recv_{cmd}", {"cmd": cmd, "args": log_args})

        try:
            if cmd == 'RoomInfo':
                # Capture seed_name for auto-discovery of rules JSON
                self.seed_name = args.get('seed_name')
            elif cmd == 'Connected':
                self.game = args["slot_info"][str(args["slot"])][1]
                slot_name = args["slot_info"][str(args["slot"])][0]
                self.tracker_core.set_slot_params(self.game,self.slot,slot_name,self.team)
                connected_cls = AutoWorld.AutoWorldRegister.world_types.get(self.game)
                if connected_cls is None:
                    self.log_to_tab(f"Connected to World {self.game} but that world is not installed")
                    return
                if self.checksums[self.game] != connected_cls.get_data_package_data()["checksum"]:
                    logger.warning("*****\nWarning: the local datapackage for the connected game does not match the server's datapackage\n*****")
                # Auto-discover pickle/JSON BEFORE initializing tracker core
                # This allows pickle or worldgen-based tracking to be used when available
                if self.seed_name:
                    # Set up debug logger for tracker_core to use the same debug log file
                    self.tracker_core.set_debug_logger(self._log_debug_message)
                    self.tracker_core.set_seed_name(self.seed_name)
                    # Try pickle first (fastest), then JSON
                    self.tracker_core.auto_discover_pickle()
                    self.tracker_core.auto_discover_rules_json()
                self.tracker_core.initalize_tracker_core(connected_cls,args["slot_data"])
                if not self.tracker_core.multiworld:
                    logger.error("Internal generation failed, something has gone wrong")
                    logger.error("Run the /faris_asked command and post the results in the discord")
                if self.ui is not None and hasattr(connected_cls, "tracker_world"):
                    self.tracker_world = UTMapTabData(self.slot, self.team, **getattr(connected_cls,"tracker_world",{}))
                elif self.ui is not None and hasattr(self.tracker_core.get_current_world(),"tracker_world"):
                    self.tracker_world = UTMapTabData(self.slot, self.team, **getattr(self.tracker_core.get_current_world(),"tracker_world",{}))
                else:
                    self.tracker_world = None
                if self.tracker_world:
                    self.load_pack()
                    if self.tracker_world:  # don't show the map if loading failed
                        self.ui.show_map = True
                        if self.tracker_world.map_page_index:
                            key = self.tracker_world.map_page_setting_key or f"{self.slot}_{self.team}_{UT_MAP_TAB_KEY}"
                            self.set_notify(key)
                        icon_key = self.tracker_world.location_setting_key
                        if icon_key:
                            self.set_notify(icon_key)
                    if "load_map" not in self.command_processor.commands or not self.command_processor.commands["load_map"]:
                        self.command_processor.commands["load_map"] = cmd_load_map
                    if "list_maps" not in self.command_processor.commands or not self.command_processor.commands["list_maps"]:
                        self.command_processor.commands["list_maps"] = cmd_list_maps
                self.defered_entrance_datastorage_keys = getattr(self.tracker_core.get_current_world(),"found_entrances_datastorage_key",None)
                if self.defered_entrance_datastorage_keys:
                    if isinstance(self.defered_entrance_datastorage_keys,str):
                        self.defered_entrance_datastorage_keys = [self.defered_entrance_datastorage_keys]
                    self.defered_entrance_datastorage_keys = [key.format(player=self.slot, team=self.team) for key in self.defered_entrance_datastorage_keys]
                    self.defered_entrance_callback = getattr(self.tracker_core.get_current_world(),"reconnect_found_entrances",None)
                    if not self.defered_entrance_callback or not callable(self.defered_entrance_callback):
                        self.defered_entrance_callback = None
                        self.defered_entrance_datastorage_keys = []
                    else:
                        self.set_notify(*self.defered_entrance_datastorage_keys)
                else:
                    self.defered_entrance_datastorage_keys = []

                if not (self.items_handling & 0b010):
                    self.scout_checked_locations()

                if not self.quit_after_update:
                    self.updateTracker()
                else:
                    asyncio.create_task(wait_for_items(self),name="UT Delay function") #if we don't get new items, delay for a bit first
                self.watcher_task = asyncio.create_task(game_watcher(self), name="GameWatcher") #This shouldn't be needed, but technically

            elif cmd == 'RoomUpdate':
                if not (self.items_handling & 0b010):
                    self.scout_checked_locations()
                self.updateTracker()
            elif cmd == 'SetReply' or cmd == 'Retrieved':
                if self.ui is not None and hasattr(AutoWorld.AutoWorldRegister.world_types.get(self.game), "tracker_world") and self.tracker_world:
                    key = self.tracker_world.map_page_setting_key or f"{self.slot}_{self.team}_{UT_MAP_TAB_KEY}"
                    icon_key = self.tracker_world.location_setting_key
                    if "key" in args:
                        if args["key"] == key:
                            self.load_map(None)
                            self.updateTracker()
                        elif args["key"] == icon_key:
                            self.update_location_icon_coords()
                    elif "keys" in args:
                        if icon_key in args["keys"]:
                            self.update_location_icon_coords()
                if self.defered_entrance_datastorage_keys:
                    if "key" in args and args["key"] in self.defered_entrance_datastorage_keys:
                            self.update_defered_entrances(args["key"])
                    elif "keys" in args:
                        for key in self.defered_entrance_datastorage_keys:
                            if key in args["keys"]:
                                self.update_defered_entrances(key)
            elif cmd == 'LocationInfo':
                if not (self.items_handling & 0b010):
                    self.update_tracker_items()
                    self.updateTracker()
            elif cmd == 'Bounced':
                # Handle UT_TEST_SYNC bounce messages for sphere log comparison testing
                self._handle_ut_test_sync_bounce(args)
        except Exception as e:
            e.args = e.args+("This is likely a UT error, make sure you have the correct tracker.apworld version and no duplicates",
                             "Then try to reproduce with the debug launcher and post in the Discord channel")
            self.disconnected_intentionally = True
            raise e
        
    def update_location_icon_coords(self):
        icon_key = self.tracker_world.location_setting_key
        temp_ret = self.tracker_world.location_icon_coords(self.map_id,self.stored_data.get(icon_key, ""))
        if temp_ret:
            (x,y,ref) = temp_ret #should be a 3-tuple
            if x < 0 or y < 0:
                self.location_icon.size = (0,0)
            else:
                self.ui.iconSource = f"{self.root_pack_path}/{ref}"
                self.location_icon.size = (self.ui.loc_icon_size, self.ui.loc_icon_size)
                self.location_icon.pos = (x,y)

    def update_defered_entrances(self,key):
        if self.defered_entrance_callback and key:
            self.defered_entrance_callback(key,self.stored_data.get(key,None))
            self.updateTracker()

    def _handle_ut_test_sync_bounce(self, args: dict):
        """
        Handle UT_TEST_SYNC bounce messages for sphere log comparison testing.

        Protocol:
        1. Test driver sends Bounce with data: {"type": "UT_TEST_SYNC", "action": "STEP", "sphere": "0.1"}
        2. UT receives STEP, logs current state to sphere_log_ut.jsonl
        3. UT sends Bounce with data: {"type": "UT_TEST_SYNC", "action": "READY", "sphere": "0.1"}
        4. Test driver waits for READY before proceeding to next step
        """
        data = args.get("data", {})

        # Only handle UT_TEST_SYNC messages
        if data.get("type") != "UT_TEST_SYNC":
            return

        action = data.get("action")
        sphere = data.get("sphere")

        if action == "STEP":
            logger.info(f"[UT_TEST_SYNC] Received STEP for sphere {sphere}")

            # Log current state if sphere logging is enabled
            if self.sphere_log_mode:
                self._log_sphere_state(sphere)
                # Also log full state to debug log
                self._log_debug_full_state(sphere)

            # Send READY response
            async_start(self._send_ut_ready_bounce(sphere), name=f"UT_READY_{sphere}")

        elif action == "READY":
            # This is received by the test driver, not UT
            # UT doesn't need to handle this
            pass

        elif action == "COMPLETE":
            # Test is complete, close sphere log file if open
            # (debug log stays open to capture any remaining messages until disconnect)
            logger.info("[UT_TEST_SYNC] Received COMPLETE signal, test finished")
            self._close_sphere_log()

    async def _send_ut_ready_bounce(self, sphere: str):
        """Send a READY bounce message to signal that UT has processed the STEP."""
        if self.server and self.server.socket:
            await self.send_msgs([{
                "cmd": "Bounce",
                "tags": ["AP"],  # Target the test driver client (which has AP tag)
                "data": {
                    "type": "UT_TEST_SYNC",
                    "action": "READY",
                    "sphere": sphere
                }
            }])
            logger.info(f"[UT_TEST_SYNC] Sent READY for sphere {sphere}")

    def _log_sphere_state(self, sphere: str):
        """Log the current tracker state to the sphere log file."""
        import json

        if not self.sphere_log_output_path:
            logger.warning("[UT_TEST_SYNC] sphere_log_output_path not set, skipping logging")
            return

        # Open file if not already open
        if self._sphere_log_file is None:
            try:
                self._sphere_log_file = open(self.sphere_log_output_path, 'w', encoding='utf-8')
                logger.info(f"[UT_TEST_SYNC] Opened sphere log file: {self.sphere_log_output_path}")
                # Initialize previous state tracking
                self._prev_accessible_locations = set()
                self._prev_accessible_regions = set()
                self._prev_items = {}

                # Write metadata line (same format as Python sphere_logger)
                multiworld = self.tracker_core.multiworld
                if multiworld:
                    metadata_entry = {
                        "type": "metadata",
                        "seed": multiworld.seed,
                        "seed_name": str(multiworld.seed_name),
                        "source": "universal_tracker"
                    }
                    self._sphere_log_file.write(json.dumps(metadata_entry) + '\n')
                    self._sphere_log_file.flush()
                    logger.info(f"[UT_TEST_SYNC] Wrote metadata: seed={multiworld.seed}, seed_name={multiworld.seed_name}")
            except Exception as e:
                logger.error(f"[UT_TEST_SYNC] Failed to open sphere log file: {e}")
                return

        # Get current state from tracker
        if not self.tracker_core.multiworld:
            logger.warning("[UT_TEST_SYNC] Multiworld not initialized, skipping logging")
            return

        try:
            # Call updateTracker to get the current state - this creates a fresh CollectionState
            # and returns a CurrentTrackerState with all the computed values
            tracker_state = self.tracker_core.updateTracker()

            # Get accessible locations (names, not IDs)
            current_locations = set()
            for loc_id in self.tracker_core.locations_available:
                loc_name = self.tracker_core.multiworld.worlds[self.tracker_core.player_id].location_id_to_name.get(loc_id)
                if loc_name:
                    current_locations.add(loc_name)

            # Get reachable regions from the CollectionState
            current_regions = set()
            if tracker_state.state and hasattr(tracker_state.state, 'reachable_regions'):
                player_id = self.tracker_core.player_id
                if player_id in tracker_state.state.reachable_regions:
                    current_regions = set(region.name for region in tracker_state.state.reachable_regions[player_id])

            # Get inventory details from CurrentTrackerState
            # all_items is a Counter of all items by name
            # prog_items is a Counter of progression items by name
            current_base_items = dict(tracker_state.all_items) if tracker_state.all_items else {}
            current_resolved_items = dict(tracker_state.prog_items) if tracker_state.prog_items else {}

            # Compute deltas (new items in this sphere)
            new_locations = sorted(current_locations - self._prev_accessible_locations)
            new_regions = sorted(current_regions - self._prev_accessible_regions)

            # Compute new items (items that were added or increased in count)
            new_base_items = {}
            for item, count in current_base_items.items():
                prev_count = self._prev_items.get(item, 0)
                if count > prev_count:
                    new_base_items[item] = count - prev_count

            new_resolved_items = {}
            for item, count in current_resolved_items.items():
                prev_count = self._prev_items.get(item, 0)
                if count > prev_count:
                    new_resolved_items[item] = count - prev_count

            # Build log entry in same format as Python sphere_logger
            log_entry = {
                "type": "state_update",
                "sphere_index": sphere,
                "player_data": {
                    str(self.tracker_core.player_id): {
                        "new_inventory_details": {
                            "base_items": new_base_items,
                            "resolved_items": new_resolved_items
                        },
                        "new_accessible_locations": new_locations,
                        "new_accessible_regions": new_regions,
                        "sphere_locations": []  # Test driver will fill this in
                    }
                }
            }

            # Update previous state for next delta computation
            self._prev_accessible_locations = current_locations
            self._prev_accessible_regions = current_regions
            self._prev_items = current_base_items.copy()

            # Write to file
            self._sphere_log_file.write(json.dumps(log_entry) + '\n')
            self._sphere_log_file.flush()
            logger.info(f"[UT_TEST_SYNC] Logged state for sphere {sphere}: {len(new_locations)} new locations, {len(new_regions)} new regions")

        except Exception as e:
            logger.error(f"[UT_TEST_SYNC] Error logging sphere state: {e}")
            import traceback
            traceback.print_exc()

    def _close_sphere_log(self):
        """Close the sphere log file if open."""
        if self._sphere_log_file is not None:
            try:
                self._sphere_log_file.close()
                logger.info(f"[UT_TEST_SYNC] Closed sphere log file")
            except Exception as e:
                logger.error(f"[UT_TEST_SYNC] Error closing sphere log file: {e}")
            finally:
                self._sphere_log_file = None

    def _open_debug_log(self):
        """Open the debug log file if sphere_log_mode is enabled."""
        if not self.sphere_log_mode or not self.sphere_log_output_path:
            return
        if self._debug_log_file is not None:
            return
        try:
            # Derive debug log path from sphere log path
            # e.g., "foo_sphere_log_ut.jsonl" -> "foo_debug_log_ut.jsonl"
            debug_path = self.sphere_log_output_path.replace("_sphere_log_ut.jsonl", "_debug_log_ut.jsonl")
            if debug_path == self.sphere_log_output_path:
                # Fallback if pattern didn't match
                debug_path = self.sphere_log_output_path.replace(".jsonl", "_debug.jsonl")
            self._debug_log_file = open(debug_path, 'w', encoding='utf-8')
            logger.info(f"[UT_TEST_SYNC] Opened debug log file: {debug_path}")
        except Exception as e:
            logger.error(f"[UT_TEST_SYNC] Failed to open debug log file: {e}")

    def _log_debug_message(self, event_type: str, data: dict):
        """Log a message to the debug log file."""
        if self._debug_log_file is None:
            return
        try:
            import json
            from datetime import datetime
            entry = {
                "timestamp": datetime.now().isoformat(),
                "event_type": event_type,
                "data": data
            }
            self._debug_log_file.write(json.dumps(entry) + '\n')
            self._debug_log_file.flush()
        except Exception as e:
            logger.error(f"[UT_TEST_SYNC] Error writing to debug log: {e}")

    def _log_debug_full_state(self, sphere: str):
        """Log the full tracker state (not deltas) to the debug log."""
        if self._debug_log_file is None or not self.tracker_core.multiworld:
            return
        try:
            import json
            from datetime import datetime
            tracker_state = self.tracker_core.updateTracker()

            # Get ALL accessible locations (cumulative, not delta)
            all_locations = []
            for loc_id in self.tracker_core.locations_available:
                loc_name = self.tracker_core.multiworld.worlds[self.tracker_core.player_id].location_id_to_name.get(loc_id)
                if loc_name:
                    all_locations.append(loc_name)
            all_locations.sort()

            # Get ALL reachable regions
            all_regions = []
            if tracker_state.state and hasattr(tracker_state.state, 'reachable_regions'):
                player_id = self.tracker_core.player_id
                if player_id in tracker_state.state.reachable_regions:
                    all_regions = sorted([region.name for region in tracker_state.state.reachable_regions[player_id]])

            # Get in_logic_regions
            in_logic_regions = sorted(tracker_state.in_logic_regions) if tracker_state.in_logic_regions else []

            # Get full inventory
            all_items = dict(tracker_state.all_items) if tracker_state.all_items else {}
            prog_items = dict(tracker_state.prog_items) if tracker_state.prog_items else {}

            # Get checked locations
            checked_locations = list(self.checked_locations) if self.checked_locations else []

            entry = {
                "timestamp": datetime.now().isoformat(),
                "event_type": "full_state",
                "sphere": sphere,
                "player_id": self.tracker_core.player_id,
                "all_accessible_locations": all_locations,
                "all_accessible_locations_count": len(all_locations),
                "all_reachable_regions": all_regions,
                "all_reachable_regions_count": len(all_regions),
                "in_logic_regions": in_logic_regions,
                "inventory": {
                    "all_items": all_items,
                    "prog_items": prog_items
                },
                "checked_locations_count": len(checked_locations),
                "missing_locations_count": len(self.missing_locations) if self.missing_locations else 0
            }
            self._debug_log_file.write(json.dumps(entry) + '\n')
            self._debug_log_file.flush()
        except Exception as e:
            logger.error(f"[UT_TEST_SYNC] Error logging full state to debug log: {e}")

    def _close_debug_log(self):
        """Close the debug log file if open."""
        if self._debug_log_file is not None:
            try:
                self._debug_log_file.close()
                logger.info(f"[UT_TEST_SYNC] Closed debug log file")
            except Exception as e:
                logger.error(f"[UT_TEST_SYNC] Error closing debug log file: {e}")
            finally:
                self._debug_log_file = None

    async def disconnect(self, allow_autoreconnect: bool = False):
        # Close sphere log and debug log files if open (before any other cleanup)
        self._close_sphere_log()
        self._close_debug_log()
        if "Tracker" in self.tags:
            self.game = ""
            if self.ui:
                self.ui.show_map = False
            if self.tracker_world:
                if "load_map" in self.command_processor.commands:
                    self.command_processor.commands["load_map"] = None
                if "list_maps" in self.command_processor.commands:
                    self.command_processor.commands["list_maps"] = None
                self.map_id = None
                self.root_pack_path = None
                self.coord_dict.clear()
                self.deferred_dict.clear()
                self.ldeferred_dict.clear()
            self.tracker_world = None
            self.defered_entrance_callback = None
            self.defered_entrance_datastorage_keys = []
            # TODO: persist these per url+slot(+seed)?
            self.tracker_core.ignored_locations.clear()
            self.set_page("Connect to a slot to start tracking!")
            if hasattr(self, "tracker_total_locs_label"):
                self.tracker_total_locs_label.text = f"Locations: 0/0"
            if hasattr(self, "tracker_logic_locs_label"):
                self.tracker_logic_locs_label.text = f"In Logic: 0"
            if hasattr(self, "tracker_glitched_locs_label"):
                self.tracker_glitched_locs_label.text = f"Glitched: [color={get_ut_color('glitched')}]0[/color]"
            if hasattr(self, "tracker_hinted_locs_label"):
                self.tracker_hinted_locs_label.text = f"Hinted: [color={get_ut_color('hinted_in_logic')}]0[/color]"
            self.tracker_core.disconnect()
        self.local_items.clear()

        await super().disconnect(allow_autoreconnect)





def load_json(pack, path):
    import pkgutil
    import json
    return json.loads(pkgutil.get_data(pack, path).decode('utf-8-sig'))


def load_json_zip(pack, path):
    import json
    import zipfile
    with zipfile.ZipFile(pack) as parentFile:
        with parentFile.open(path) as childFile:
            return json.loads(childFile.read().decode('utf-8-sig'))

def explain_more(ctx: TrackerGameContext, argument: str):
    from NetUtils import JSONMessagePart
    if ctx.tracker_core.player_id is None or ctx.tracker_core.multiworld is None:
        logger.error("Player YAML not installed of Generator failed")
        ctx.set_page(f"Check Player YAMLs for error; Tracker {UT_VERSION} for AP version {__version__}")
        return
    current_world = ctx.tracker_core.get_current_world()
    assert current_world
    state = ctx.updateTracker().state
    if not state: return

    if hasattr(current_world, "explain_more"):
        returned_json = current_world.explain_more(argument, state)
        if returned_json:
            ctx.ui.print_json(returned_json)
            return
        logger.info("Nothing to explain")
    logger.error("Current world to track doesn't support command /explain_more")
    

def explain(ctx: TrackerGameContext, dest_name: str):
    from NetUtils import JSONMessagePart
    if ctx.tracker_core.player_id is None or ctx.tracker_core.multiworld is None:
        logger.error("Player YAML not installed or Generator failed")
        ctx.set_page(f"Check Player YAMLs for error; Tracker {UT_VERSION} for AP version {__version__}")
        return
    current_world = ctx.tracker_core.get_current_world()
    assert current_world
    state = ctx.updateTracker().state
    if not state: return

    if hasattr(current_world,"explain_rule"):
        returned_json = current_world.explain_rule(dest_name,state)
        if returned_json:
            ctx.ui.print_json(returned_json)
            return
    parent_region = None
    location = None
    if dest_name in ctx.tracker_core.multiworld.regions.location_cache[ctx.tracker_core.player_id]:
        dest_id = current_world.location_name_to_id[dest_name]
        if dest_id not in ctx.server_locations:
            logger.error("Location not found")
            return
        location = ctx.tracker_core.multiworld.get_location(dest_name, ctx.tracker_core.player_id)
        if hasattr(location.access_rule,"explain_json"):
            ctx.ui.print_json(location.access_rule.explain_json(state))
        elif location.access_rule is Location.access_rule:
            logger.info("Location has a default access rule (always accessible): True")
        else:
            # Try worldgen fallback for explain support
            wg_explanation = ctx.tracker_core.explain_location_rule(dest_name, state)
            if wg_explanation:
                ctx.ui.print_json(wg_explanation)
            else:
                logger.info("Location doesn't have a rule that supports explanation")
        parent_region = location.parent_region
    elif dest_name in ctx.tracker_core.multiworld.regions.region_cache[ctx.tracker_core.player_id]:
        parent_region = ctx.tracker_core.multiworld.get_region(dest_name,ctx.tracker_core.player_id)
    else:
        from Utils import get_fuzzy_results
        results = get_fuzzy_results(dest_name,set(ctx.tracker_core.multiworld.regions.location_cache[ctx.tracker_core.player_id].keys()).union(set(ctx.tracker_core.multiworld.regions.region_cache[ctx.tracker_core.player_id].keys())),limit=1)[0]
        logger.error(f"Did you mean '{results[0]}' ({results[1]}% sure)? ")
        return
    if parent_region:
        if location:
            logger.info(f"Parent region ({parent_region.name})")
        for entrance in parent_region.entrances:
            if entrance.parent_region:
                if hasattr(entrance.access_rule,"explain_json"):
                    returned_json:list[JSONMessagePart] = [{"type":"text","text":f"{entrance.parent_region.name} ({entrance.parent_region.can_reach(state)}): {entrance.name} : "}]
                    returned_json.extend(entrance.access_rule.explain_json(state))
                    ctx.ui.print_json(returned_json)
                else:
                    ctx.ui.print_json([{"type":"text","text":f"{entrance.parent_region.name} ({entrance.parent_region.can_reach(state)}): {entrance.name} : {entrance.access_rule(state)}"}])
        

def get_logical_path(ctx: TrackerGameContext, dest_name: str):
    if ctx.tracker_core.player_id is None or ctx.tracker_core.multiworld is None:
        logger.error("Player YAML not installed or Generator failed")
        ctx.set_page(f"Check Player YAMLs for error; Tracker {UT_VERSION} for AP version {__version__}")
        return
    relevent_region = None
    state = None
    current_world = ctx.tracker_core.get_current_world()
    assert current_world

    if hasattr(current_world,"get_logical_path"):
        state = ctx.updateTracker().state
        returned_json = current_world.get_logical_path(dest_name,state)
        if returned_json:
            ctx.ui.print_json(returned_json)
            return

    if dest_name in [loc.name for loc in ctx.tracker_core.multiworld.get_locations(ctx.tracker_core.player_id)]:
        location = ctx.tracker_core.multiworld.get_location(dest_name, ctx.tracker_core.player_id)
        state = ctx.updateTracker().state
        if not state: return
        if location.can_reach(state):
            relevent_region = location.parent_region
    elif dest_name in ctx.tracker_core.multiworld.regions.region_cache[ctx.tracker_core.player_id]:
        relevent_region = ctx.tracker_core.multiworld.get_region(dest_name,ctx.tracker_core.player_id)
        state = ctx.updateTracker().state
        if not state: return
        if not relevent_region.can_reach(state):
            relevent_region = None
    elif dest_name in ctx.tracker_core.multiworld.regions.location_cache[ctx.tracker_core.player_id]:
        location = ctx.tracker_core.multiworld.get_location(dest_name,ctx.tracker_core.player_id)
        state = ctx.updateTracker().state
        if not state: return
        if location.can_reach(state):
            relevent_region = location.parent_region
    else:
        from Utils import get_fuzzy_results
        results = get_fuzzy_results(dest_name,set(ctx.tracker_core.multiworld.regions.location_cache[ctx.tracker_core.player_id].keys()).union(set(ctx.tracker_core.multiworld.regions.region_cache[ctx.tracker_core.player_id].keys())),limit=1)[0]
        logger.error(f"Did you mean '{results[0]}' ({results[1]}% sure)? ")
        return
    if state:
        if relevent_region:
            # stolen from core
            from BaseClasses import Region
            from typing import Tuple, Iterator
            from itertools import zip_longest

            def flist_to_iter(path_value) -> Iterator[str]:
                while path_value:
                    region_or_entrance, path_value = path_value
                    yield region_or_entrance

            def get_path(state: CollectionState, region: Region) -> list[Union[Tuple[str, str], Tuple[str, None]]]:
                reversed_path_as_flist = state.path.get(region, (str(region), None))
                string_path_flat = reversed(list(map(str, flist_to_iter(reversed_path_as_flist))))
                # Now we combine the flat string list into (region, exit) pairs
                pathsiter = iter(string_path_flat)
                pathpairs = zip_longest(pathsiter, pathsiter)
                return list(pathpairs)

            paths = get_path(state=state, region=relevent_region)
            for k, v in paths:
                if v:
                    logger.info(v)
        else:
            logger.info(f"{dest_name} not in logic")

async def game_watcher(ctx: TrackerGameContext) -> None:
    while not ctx.exit_event.is_set():
        try:
            await asyncio.wait_for(ctx.watcher_event.wait(), 0.125)
        except asyncio.TimeoutError:
            continue
        ctx.watcher_event.clear()
        try:
            ctx.updateTracker()
        except Exception as e:
            tb = traceback.format_exc()
            print(tb)
            if ctx.sphere_log_mode:
                # In sphere_log_mode: Log the error but don't crash the watcher - this allows UT
                # to continue receiving messages even if updateTracker fails temporarily
                logger.error(f"[game_watcher] updateTracker failed: {e}")
                # Continue the loop instead of re-raising - the tracker can recover
            else:
                # Normal mode: re-raise the exception (original behavior)
                logger.error("".join(traceback.format_exception_only(sys.exception())))
                raise e

async def wait_for_items(ctx: TrackerGameContext)-> None:
    try:
        await asyncio.wait_for(ctx.watcher_event.wait(), 0.125)
    except asyncio.TimeoutError:
        ctx.updateTracker() #if it timed out, we need to manually trigger this
        #if it didn't, then game_watcher will handle it

async def main(args):
    ctx = TrackerGameContext(args.connect, args.password, print_count=args.count, print_list=args.list)
    ctx.auth = args.name

    # Set sphere log mode attributes if enabled
    if hasattr(args, 'sphere_log_mode') and args.sphere_log_mode:
        ctx.sphere_log_mode = True
        ctx.tracker_core.sphere_log_mode = True  # Propagate to TrackerCore for lenient error handling
        ctx.sphere_log_output_path = args.sphere_log_output
        ctx.sphere_log_verbose = getattr(args, 'sphere_log_verbose', False)
        logger.info(f"[UT_TEST_SYNC] Sphere log mode enabled, output: {ctx.sphere_log_output_path}")

    # Set seed override for internal generation (for UT comparison testing)
    if hasattr(args, 'seed') and args.seed is not None:
        ctx.tracker_core.seed_override = args.seed
        logger.info(f"[UT_TEST_SYNC] Seed override set to: {args.seed}")

    ctx.server_task = asyncio.create_task(server_loop(ctx), name="server loop")
    ctx.run_generator()

    if gui_enabled:
        ctx.run_gui()
    ctx.run_cli()

    await ctx.exit_event.wait()
    await ctx.shutdown()


def launch(*args):
    parser = get_base_parser(description="Gameless Archipelago Client, for text interfacing.")
    parser.add_argument('--name', default=None, help="Slot Name to connect as.")
    if sys.stdout:  # If terminal output exists, offer gui-less mode
        parser.add_argument('--count', default=False, action='store_true', help="just return a count of in logic checks")
        parser.add_argument('--list', default=False, action='store_true', help="just return a list of in logic checks")
    # Sphere log mode arguments for UT comparison testing
    parser.add_argument('--sphere-log-mode', default=False, action='store_true',
                        help="Enable sphere logging for UT comparison testing")
    parser.add_argument('--sphere-log-output', default=None, type=str,
                        help="Path to write sphere_log_ut.jsonl (required with --sphere-log-mode)")
    parser.add_argument('--sphere-log-verbose', default=False, action='store_true',
                        help="Use verbose (full state) format instead of deltas")
    parser.add_argument('--seed', default=None, type=int,
                        help="Seed number to use for internal generation (for UT comparison testing)")
    parser.add_argument("url", nargs="?", help="Archipelago connection url")
    args = handle_url_arg(parser.parse_args(args))

    if args.nogui and (args.count or args.list):
        if not args.name or not args.connect:
            logger.error("You need a valid URL when running in CLI mode")
            return
        from logging import ERROR
        logger.setLevel(ERROR)

    # Validate sphere log mode arguments
    if args.sphere_log_mode and not args.sphere_log_output:
        logger.error("--sphere-log-output is required when using --sphere-log-mode")
        return

    asyncio.run(main(args))

def updateTracker(ctx: TrackerGameContext):
    return ctx.updateTracker()

if __name__ == "__main__":
    launch(*sys.argv[1:])
