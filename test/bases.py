import random
import sys
import typing
import unittest
import json
import os
from argparse import Namespace
import logging
import difflib

from Generate import get_seed_name
from test.general import gen_steps
from worlds import AutoWorld
from worlds.AutoWorld import World, call_all

from BaseClasses import Location, MultiWorld, CollectionState, ItemClassification, Item
from worlds.alttp.Items import item_factory

from exporter import export_test_data

# AP Imports (sorted)
from worlds.AutoWorld import WebWorld, World

if typing.TYPE_CHECKING:
    from worlds.generic.World import GenericWorld

# --- New Imports for TestDataLogger ---
import datetime

# Get a logger for the TestDataLogger itself, to avoid print()
test_data_logger_internal_logger = logging.getLogger("TestDataLoggerInternal")

class TestDataLogger:
    def __init__(self, log_file_path: str):
        self.log_file_path = log_file_path
        self.file_handler = None
        try:
            # Ensure the directory exists
            log_dir = os.path.dirname(self.log_file_path)
            if log_dir: # Check if log_dir is not an empty string (e.g. if log_file_path is just a filename)
                os.makedirs(log_dir, exist_ok=True)
            
            self.file_handler = open(self.log_file_path, "a")  # Append mode
            test_data_logger_internal_logger.info(f"Opened log file for appending: {self.log_file_path}")
        except Exception as e:
            test_data_logger_internal_logger.error(f"Failed to open log file {self.log_file_path}: {e}")
            # self.file_handler will remain None, log_state will do nothing

    def log_state(self, test_suite_name: str, test_case_index: int, test_case_location_name: str,
                  phase_description: str, multiworld: MultiWorld, player: int):
        if not self.file_handler:
            test_data_logger_internal_logger.warning(
                f"Log file not open. Cannot log state for {test_suite_name} - {test_case_location_name}"
            )
            return

        try:
            # Capture inventory details based on CollectionState structure
            player_prog_items = {item_name: count for item_name, count in multiworld.state.prog_items[player].items()}
            
            # Attempt to get non-progression items, but handle gracefully if 'items' attribute is missing or problematic
            player_non_prog_items_counts = {}
            if hasattr(multiworld.state, 'items') and player in multiworld.state.items:
                try:
                    player_non_prog_items_list = multiworld.state.items[player]
                    for item_obj in player_non_prog_items_list:
                        player_non_prog_items_counts[item_obj.name] = player_non_prog_items_counts.get(item_obj.name, 0) + 1
                except Exception as e_items:
                    test_data_logger_internal_logger.warning(f"Could not process non-progression items for player {player}: {e_items}")
            else:
                test_data_logger_internal_logger.warning(f"'items' attribute or player key missing in multiworld.state for non-progression items.")

            current_inventory_details = {
                "prog_items_player": player_prog_items,
                "non_prog_items_player": player_non_prog_items_counts, # Changed field name
            }

            # Get accessible locations and regions, convert to sorted list of names
            # Use the 'multiworld' parameter and its state for these checks.
            accessible_locations = sorted([
                loc.name for loc in multiworld.get_locations(player)
                if loc.can_reach(multiworld.state)
            ])

            accessible_regions = sorted([
                reg.name for reg in multiworld.get_regions(player)
                if reg.can_reach(multiworld.state) # Assuming regions also have can_reach or similar
                                                  # If not, this needs adjustment based on how region reachability
                                                  # is determined from a state (e.g. state.update_reachable_regions first)
            ])

            log_entry_data = {
                "test_suite_name": test_suite_name,
                "test_case_index": test_case_index,
                "test_case_location_name": str(test_case_location_name),  # Ensure it's a string
                "phase_description": phase_description,
                "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                "inventory_details": current_inventory_details,
                "accessible_locations": accessible_locations,
                "accessible_regions": accessible_regions,
            }

            # test_data_logger_internal_logger.debug(f"Problematic log_entry_data: {log_entry_data}")

            # Make the log entry data JSON serializable
            # Convert sets to sorted lists for consistent output and serializability
            for key, value in log_entry_data.items(): # Ensure using log_entry_data
                if isinstance(value, set):
                    try:
                        # Attempt to sort if elements are comparable (e.g., strings, numbers)
                        log_entry_data[key] = sorted(list(value))
                    except TypeError:
                        # If elements are not comparable (e.g., complex objects), just convert to list
                        log_entry_data[key] = list(value)
                elif isinstance(value, dict): # Check sub-dictionaries
                    for sub_key, sub_value in value.items():
                        if isinstance(sub_value, set):
                            try:
                                log_entry_data[key][sub_key] = sorted(list(sub_value))
                            except TypeError:
                                log_entry_data[key][sub_key] = list(sub_value)
            
            self.file_handler.write(json.dumps(log_entry_data))
            self.file_handler.write("\n") # Corrected to ensure single newline
            self.file_handler.flush() # Ensure data is written immediately
        except Exception as e:
            test_data_logger_internal_logger.error(f"Error during log_state for {test_suite_name} - {test_case_location_name}: {e}")
            # Optionally, log the problematic log_entry_data structure if it's helpful for debugging

    def close(self):
        if self.file_handler:
            try:
                self.file_handler.close()
                test_data_logger_internal_logger.info(f"Closed log file: {self.log_file_path}")
                self.file_handler = None
            except Exception as e:
                test_data_logger_internal_logger.error(f"Error closing log file {self.log_file_path}: {e}")

# --- End TestDataLogger Class ---

class TestBase(unittest.TestCase):
    multiworld: MultiWorld
    _state_cache = {}

    def get_state(self, items):
        if (self.multiworld, tuple(items)) in self._state_cache:
            return self._state_cache[self.multiworld, tuple(items)]
        state = CollectionState(self.multiworld)
        for item in items:
            item.classification = ItemClassification.progression
            state.collect(item, prevent_sweep=True)
        state.sweep_for_advancements()
        state.update_reachable_regions(1)
        self._state_cache[self.multiworld, tuple(items)] = state
        return state

    def get_path(self, state, region):
        def flist_to_iter(node):
            while node:
                value, node = node
                yield value

        from itertools import zip_longest
        reversed_path_as_flist = state.path.get(region, (region, None))
        string_path_flat = reversed(list(map(str, flist_to_iter(reversed_path_as_flist))))
        # Now we combine the flat string list into (region, exit) pairs
        pathsiter = iter(string_path_flat)
        pathpairs = zip_longest(pathsiter, pathsiter)
        return list(pathpairs)

    def run_location_tests(self, access_pool: typing.Optional[typing.List[typing.Tuple[str, bool, typing.List[str], typing.Optional[typing.List[str]],
                                                                 typing.Optional[typing.Callable], typing.Optional[typing.List[str]]]]] = None,
                           test_options: typing.Optional[str] = None):
        """Helper function to run tests for a list of locations."""
        if access_pool is None:
            # Fallback to a default if no specific access_rules are on TestBase itself
            # This might indicate an issue if TestBase is expected to have its own access_rules
            # For now, we assume it might be empty or overridden by subclasses
            access_pool = getattr(self, 'access_rules', []) 

        logger_instance: typing.Optional[TestDataLogger] = None
        try:
            # Try to get game name from multiworld if self.game is not set
            game_name_for_path = getattr(self, 'game', None)
            if not game_name_for_path and hasattr(self, 'multiworld') and self.multiworld and 1 in self.multiworld.game:
                game_name_for_path = self.multiworld.game[1]
            if not game_name_for_path:
                game_name_for_path = 'unknown_game'
                test_data_logger_internal_logger.warning(
                    "Could not determine game name from self.game or self.multiworld.game[1], using 'unknown_game'."
                )

            if not hasattr(self, 'output_path') or not self.output_path:
                class_name_for_path = self.__class__.__name__
                fallback_output_path = os.path.join("worlds", game_name_for_path, "output", class_name_for_path)
                test_data_logger_internal_logger.warning(
                    f"self.output_path not found or empty, using fallback: {fallback_output_path}"
                )
                output_path_for_logs = fallback_output_path
            else:
                output_path_for_logs = self.output_path

            method_name_for_log = test_options if isinstance(test_options, str) and test_options else \
                                  getattr(self, '_testMethodName', self.__class__.__name__)
            
            log_filename_base = method_name_for_log + "_tests"
            log_file_path = os.path.join(output_path_for_logs, log_filename_base + "_log.jsonl")
            
            logger_instance = TestDataLogger(log_file_path)
            current_test_suite_name = self.__class__.__name__
        except Exception as e:
            test_data_logger_internal_logger.error(f"Failed to initialize TestDataLogger: {e}")
            
        try:
            for i, test_tuple in enumerate(access_pool):
                location_name_str, expected_access, item_list_names, *rest = test_tuple
                forbidden_item_list_names = rest[0] if len(rest) > 0 else None
                exec_func = rest[1] if len(rest) > 1 else None # exec_func is usually for CICO

                # Construct item_pool for _get_items which expects [[item_names], excluded_item_names_or_None]
                # For the main test, all_except is None initially if forbidden_item_list_names is not used directly here.
                # _get_items handles item_factory itself. We just need to provide names.
                current_item_pool_for_get_items = [item_list_names, forbidden_item_list_names]

                # Log initial state (conceptually before any items for this test case)
                # Create a completely empty state for this initial log to be accurate.
                empty_state_for_log = CollectionState(self.multiworld)
                if logger_instance:
                    # Temporarily assign empty_state_for_log to multiworld.state for the logger
                    original_state = self.multiworld.state
                    self.multiworld.state = empty_state_for_log
                    logger_instance.log_state(current_test_suite_name, i, location_name_str,
                                              "Initial state for test case (before _get_items)", self.multiworld, 1)
                    self.multiworld.state = original_state # Restore

                # Get the state with the specified items collected
                # _get_items uses item_factory and populates a new CollectionState
                current_state = self._get_items(current_item_pool_for_get_items, forbidden_item_list_names)
                
                # Log state after collecting initial batch of items
                if logger_instance:
                    # Temporarily assign current_state to multiworld.state for the logger
                    original_state = self.multiworld.state
                    self.multiworld.state = current_state
                    logger_instance.log_state(current_test_suite_name, i, location_name_str,
                                              "After _get_items (main item list)", self.multiworld, 1)
                    self.multiworld.state = original_state # Restore
                
                location_obj = self.multiworld.get_location(location_name_str, 1)
                actual_access = location_obj.can_reach(current_state)
                self.assertEqual(actual_access, expected_access,
                                 f"{location_name_str} expected {expected_access} with {item_list_names}, got {actual_access}. ({test_options})")

                # Handle CICO (exec_func) - this part is tricky without self.collect/remove
                # We simulate by creating new states with _get_items_partial or similar logic
                if exec_func and expected_access: # Typically CICO is for locations expected to be accessible
                    if not item_list_names: # Skip CICO if item_list_names is empty
                        continue

                    for item_to_remove_name in item_list_names:
                        # Create state with this one item removed
                        # _get_items_partial expects item_pool and the single missing item name
                        state_without_item = self._get_items_partial(current_item_pool_for_get_items, item_to_remove_name)
                        
                        if logger_instance:
                            original_state = self.multiworld.state
                            self.multiworld.state = state_without_item # Set state for logger
                            logger_instance.log_state(current_test_suite_name, i, location_name_str,
                                                      f"Exec_func: After removing '{item_to_remove_name}' (simulated)",
                                                      self.multiworld, 1)
                            self.multiworld.state = original_state # Restore

                        # Location should now be False if the item was truly required
                        self.assertFalse(location_obj.can_reach(state_without_item),
                                         f"CICO Remove Fail: {location_name_str} expected False after removing {item_to_remove_name} from {item_list_names}, but was True. ({test_options})")
                        
                        # State after re-adding the item is effectively `current_state` (the one with all items_list_names)
                        # So, we log against `current_state` for the "after collecting" phase of CICO.
                        if logger_instance:
                            original_state = self.multiworld.state
                            self.multiworld.state = current_state # Back to full item list state for this log
                            logger_instance.log_state(current_test_suite_name, i, location_name_str,
                                                      f"Exec_func: After collecting '{item_to_remove_name}' (simulated, back to full list)",
                                                      self.multiworld, 1)
                            self.multiworld.state = original_state # Restore
                        
                        # And it should be accessible again with all items.
                        self.assertTrue(location_obj.can_reach(current_state),
                                         f"CICO Re-collect Fail: {location_name_str} expected True after re-collecting {item_to_remove_name} (back to full list {item_list_names}), but was False. ({test_options})")
        finally:
            if logger_instance:
                logger_instance.close()

    def run_entrance_tests(self, access_pool):
        for i, (entrance, access, *item_pool) in enumerate(access_pool):
            items = item_pool[0]
            all_except = item_pool[1] if len(item_pool) > 1 else None
            state = self._get_items(item_pool, all_except)
            path = self.get_path(state, self.multiworld.get_entrance(entrance, 1).parent_region)
            with self.subTest(msg="Reach Entrance", entrance=entrance, access=access, items=items,
                              all_except=all_except, path=path, entry=i):

                self.assertEqual(self.multiworld.get_entrance(entrance, 1).can_reach(state), access)

            # check for partial solution
            if not all_except and access:  # we are not supposed to be able to reach location with partial inventory
                for missing_item in item_pool[0]:
                    with self.subTest(msg="Entrance reachable without required item", entrance=entrance,
                                      items=item_pool[0], missing_item=missing_item, entry=i):
                        state = self._get_items_partial(item_pool, missing_item)
                        self.assertEqual(self.multiworld.get_entrance(entrance, 1).can_reach(state), False,
                                         f"failed {self.multiworld.get_entrance(entrance, 1)} with: {item_pool}")

    def _get_items(self, item_pool, all_except):
        if all_except and len(all_except) > 0:
            items = self.multiworld.itempool[:]
            items = [item for item in items if
                     item.name not in all_except and not ("Bottle" in item.name and "AnyBottle" in all_except)]
            items.extend(item_factory(item_pool[0], self.multiworld.worlds[1]))
        else:
            items = item_factory(item_pool[0], self.multiworld.worlds[1])
        return self.get_state(items)

    def _get_items_partial(self, item_pool, missing_item):
        new_items = item_pool[0].copy()
        new_items.remove(missing_item)
        items = item_factory(new_items, self.multiworld.worlds[1])
        return self.get_state(items)


class WorldTestBase(unittest.TestCase):
    options: typing.Dict[str, typing.Any] = {}
    """Define options that should be used when setting up this TestBase."""
    multiworld: MultiWorld
    """The constructed MultiWorld instance after setup."""
    world: World
    """The constructed World instance after setup."""
    player: typing.ClassVar[int] = 1

    game: typing.ClassVar[str]
    """Define game name in subclass, example "Secret of Evermore"."""
    auto_construct: typing.ClassVar[bool] = True
    """ automatically set up a world for each test in this class """
    memory_leak_tested: typing.ClassVar[bool] = False
    """ remember if memory leak test was already done for this class """

    def setUp(self) -> None:
        if self.auto_construct:
            self.world_setup()

    def tearDown(self) -> None:
        if self.__class__.memory_leak_tested or not self.options or not self.constructed or \
                sys.version_info < (3, 11, 0):  # the leak check in tearDown fails in py<3.11 for an unknown reason
            # only run memory leak test once per class, only for constructed with non-default options
            # default options will be tested in test/general
            super().tearDown()
            return

        import gc
        import weakref
        weak = weakref.ref(self.multiworld)
        for attr_name in dir(self):  # delete all direct references to MultiWorld and World
            attr: object = typing.cast(object, getattr(self, attr_name))
            if type(attr) is MultiWorld or isinstance(attr, AutoWorld.World):
                delattr(self, attr_name)
        state_cache: typing.Optional[typing.Dict[typing.Any, typing.Any]] = getattr(self, "_state_cache", None)
        if state_cache is not None:  # in case of multiple inheritance with TestBase, we need to clear its cache
            state_cache.clear()
        gc.collect()
        self.__class__.memory_leak_tested = True
        self.assertFalse(weak(), f"World {getattr(self, 'game', '')} leaked MultiWorld object")
        super().tearDown()

    def world_setup(self, seed: typing.Optional[int] = None) -> None:
        if type(self) is WorldTestBase or \
                (hasattr(WorldTestBase, self._testMethodName)
                 and not self.run_default_tests and
                 getattr(self, self._testMethodName).__code__ is
                 getattr(WorldTestBase, self._testMethodName, None).__code__):
            return  # setUp gets called for tests defined in the base class. We skip world_setup here.
        if not hasattr(self, "game"):
            raise NotImplementedError("didn't define game name")
        self.multiworld = MultiWorld(1)
        self.multiworld.game[self.player] = self.game
        self.multiworld.player_name = {self.player: "Tester"}
        self.multiworld.set_seed(seed)
        self.multiworld.state = CollectionState(self.multiworld)
        random.seed(self.multiworld.seed)
        self.multiworld.seed_name = get_seed_name(random)  # only called to get same RNG progression as Generate.py
        args = Namespace()
        for name, option in AutoWorld.AutoWorldRegister.world_types[self.game].options_dataclass.type_hints.items():
            setattr(args, name, {
                1: option.from_any(self.options.get(name, option.default))
            })
        self.multiworld.set_options(args)
        self.world = self.multiworld.worlds[self.player]
        for step in gen_steps:
            call_all(self.multiworld, step)

    # methods that can be called within tests
    def collect_all_but(self, item_names: typing.Union[str, typing.Iterable[str]],
                        state: typing.Optional[CollectionState] = None) -> None:
        """Collects all pre-placed items and items in the multiworld itempool except those provided"""
        if isinstance(item_names, str):
            item_names = (item_names,)
        if not state:
            state = self.multiworld.state
        for item in self.multiworld.get_items():
            if item.name not in item_names:
                state.collect(item)

    def get_item_by_name(self, item_name: str) -> Item:
        """Returns the first item found in placed items, or in the itempool with the matching name"""
        for item in self.multiworld.get_items():
            if item.name == item_name:
                return item
        raise ValueError("No such item")

    def get_items_by_name(self, item_names: typing.Union[str, typing.Iterable[str]]) -> typing.List[Item]:
        """Returns actual items from the itempool that match the provided name(s)"""
        if isinstance(item_names, str):
            item_names = (item_names,)
        return [item for item in self.multiworld.itempool if item.name in item_names]

    def collect_by_name(self, item_names: typing.Union[str, typing.Iterable[str]]) -> typing.List[Item]:
        """ collect all of the items in the item pool that have the given names """
        items = self.get_items_by_name(item_names)
        self.collect(items)
        return items

    def collect(self, items: typing.Union[Item, typing.Iterable[Item]]) -> None:
        """Collects the provided item(s) into state"""
        if isinstance(items, Item):
            items = (items,)
        for item in items:
            self.multiworld.state.collect(item)
    
    def remove_by_name(self, item_names: typing.Union[str, typing.Iterable[str]]) -> typing.List[Item]:
        """Remove all of the items in the item pool with the given names from state"""
        items = self.get_items_by_name(item_names)
        self.remove(items)
        return items

    def remove(self, items: typing.Union[Item, typing.Iterable[Item]]) -> None:
        """Removes the provided item(s) from state"""
        if isinstance(items, Item):
            items = (items,)
        for item in items:
            if item.location and item.advancement and item.location in self.multiworld.state.advancements:
                self.multiworld.state.advancements.remove(item.location)
            self.multiworld.state.remove(item)

    def can_reach_location(self, location: str) -> bool:
        """Determines if the current state can reach the provided location name"""
        return self.multiworld.state.can_reach(location, "Location", self.player)

    def can_reach_entrance(self, entrance: str) -> bool:
        """Determines if the current state can reach the provided entrance name"""
        return self.multiworld.state.can_reach(entrance, "Entrance", self.player)
    
    def can_reach_region(self, region: str) -> bool:
        """Determines if the current state can reach the provided region name"""
        return self.multiworld.state.can_reach(region, "Region", self.player)

    def count(self, item_name: str) -> int:
        """Returns the amount of an item currently in state"""
        return self.multiworld.state.count(item_name, self.player)

    def assertAccessDependency(self,
                               locations: typing.List[str],
                               possible_items: typing.Iterable[typing.Iterable[str]],
                               only_check_listed: bool = False) -> None:
        """Asserts that the provided locations can't be reached without the listed items but can be reached with any
         one of the provided combinations"""
        all_items = [item_name for item_names in possible_items for item_name in item_names]

        state = CollectionState(self.multiworld)
        self.collect_all_but(all_items, state)
        if only_check_listed:
            for location in locations:
                self.assertFalse(state.can_reach(location, "Location", self.player),
                                 f"{location} is reachable without {all_items}")
        else:
            for location in self.multiworld.get_locations():
                loc_reachable = state.can_reach(location, "Location", self.player)
                self.assertEqual(loc_reachable, location.name not in locations,
                                 f"{location.name} is reachable without {all_items}" if loc_reachable
                                 else f"{location.name} is not reachable without {all_items}")
        for item_names in possible_items:
            items = self.get_items_by_name(item_names)
            for item in items:
                state.collect(item)
            for location in locations:
                self.assertTrue(state.can_reach(location, "Location", self.player),
                                f"{location} not reachable with {item_names}")
            for item in items:
                state.remove(item)

    def assertBeatable(self, beatable: bool):
        """Asserts that the game can be beaten with the current state"""
        self.assertEqual(self.multiworld.can_beat_game(self.multiworld.state), beatable)

    # following tests are automatically run
    @property
    def run_default_tests(self) -> bool:
        """Not possible or identical to the base test that's always being run already"""
        return (self.options
                or self.setUp.__code__ is not WorldTestBase.setUp.__code__
                or self.world_setup.__code__ is not WorldTestBase.world_setup.__code__)

    @property
    def constructed(self) -> bool:
        """A multiworld has been constructed by this point"""
        return hasattr(self, "game") and hasattr(self, "multiworld")

    def test_all_state_can_reach_everything(self):
        """Ensure all state can reach everything and complete the game with the defined options"""
        if not (self.run_default_tests and self.constructed):
            return
        with self.subTest("Game", game=self.game, seed=self.multiworld.seed):
            state = self.multiworld.get_all_state(False)
            for location in self.multiworld.get_locations():
                with self.subTest("Location should be reached", location=location.name):
                    reachable = location.can_reach(state)
                    self.assertTrue(reachable, f"{location.name} unreachable")
            with self.subTest("Beatable"):
                self.multiworld.state = state
                self.assertBeatable(True)

    def test_empty_state_can_reach_something(self):
        """Ensure empty state can reach at least one location with the defined options"""
        if not (self.run_default_tests and self.constructed):
            return
        with self.subTest("Game", game=self.game, seed=self.multiworld.seed):
            state = CollectionState(self.multiworld)
            locations = self.multiworld.get_reachable_locations(state, self.player)
            self.assertGreater(len(locations), 0,
                               "Need to be able to reach at least one location to get started.")

    def test_fill(self):
        """Generates a multiworld and validates placements with the defined options"""
        if not (self.run_default_tests and self.constructed):
            return
        from Fill import distribute_items_restrictive

        # basically a shortened reimplementation of this method from core, in order to force the check is done
        def fulfills_accessibility() -> bool:
            locations = list(self.multiworld.get_locations(1))
            state = CollectionState(self.multiworld)
            while locations:
                sphere: typing.List[Location] = []
                for n in range(len(locations) - 1, -1, -1):
                    if locations[n].can_reach(state):
                        sphere.append(locations.pop(n))
                self.assertTrue(sphere or self.multiworld.worlds[1].options.accessibility == "minimal",
                                f"Unreachable locations: {locations}")
                if not sphere:
                    break
                for location in sphere:
                    if location.item:
                        state.collect(location.item, True, location)
            return self.multiworld.has_beaten_game(state, self.player)

        with self.subTest("Game", game=self.game, seed=self.multiworld.seed):
            distribute_items_restrictive(self.multiworld)
            call_all(self.multiworld, "post_fill")
            self.assertTrue(fulfills_accessibility(), "Collected all locations, but can't beat the game.")
            placed_items = [loc.item for loc in self.multiworld.get_locations() if loc.item and loc.item.code]
            self.assertLessEqual(len(self.multiworld.itempool), len(placed_items),
                                 "Unplaced Items remaining in itempool")
