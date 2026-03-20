"""
Extended TrackerCore with Worldgen, Pickle, and Testing Support

This module provides TrackerCore, an extended version of TrackerCoreBase that adds:
- Worldgen world integration for rule explain support
- Pickle-based multiworld loading for fast tracking
- Direct AST rule explanation from JSON rules files
- Testing mode with lenient error handling
- Debug logging support
- Config-driven tracking mode fallback order

For upstream compatibility, TrackerCoreBase contains the original TrackerCore code
(matching upstream FarisTheAncient/Archipelago). This extended version adds our
modifications via mixins, making it easier to merge upstream updates.

Usage:
    from worlds.tracker.TrackerCore import TrackerCore
    # or
    from worlds.tracker import TrackerCore
"""

import json
import logging
import os
from collections import Counter
from typing import Any, Dict, List, Optional

from BaseClasses import CollectionState, LocationProgressType, ItemClassification
from . import CurrentTrackerState, UT_VERSION, DeferredEntranceMode
from .TrackerCoreBase import TrackerCoreBase
from .worldgen_mixin import WorldgenMixin
from .pickle_mixin import PickleMixin
from .tracker_extensions import TrackerTestingMixin
from Utils import __version__


# Cache for tracking-mode-config to avoid repeated file reads
_tracker_mode_config_cache: Optional[Dict[str, Any]] = None


class TrackerCore(PickleMixin, WorldgenMixin, TrackerTestingMixin, TrackerCoreBase):
    """
    Extended TrackerCore with pickle, worldgen, and testing support.

    This class combines:
    - TrackerCoreBase: Original UT functionality (matches upstream)
    - PickleMixin: Pickle-based multiworld loading (fastest)
    - WorldgenMixin: Worldgen world integration and AST explain
    - TrackerTestingMixin: Testing mode and debug logging

    The mixins add new methods and override behavior where needed,
    while keeping TrackerCoreBase close to upstream for easier merging.

    Tracking mode priority (configurable):
    1. Pickle mode - fastest, preserves exact lambdas
    2. Worldgen mode - generates world from JSON rules
    3. Original seeded mode - original UT behavior with resolved seed number
    4. YAML mode - original UT behavior (random seed)
    """

    def __init__(self, logger: logging.Logger, print_list: bool, print_count: bool) -> None:
        """Initialize TrackerCore with extensions."""
        # Initialize base class
        super().__init__(logger, print_list, print_count)

        # Initialize mixins
        self._init_pickle_mixin()
        self._init_worldgen_mixin()
        self._init_testing_mixin()

    def disconnect(self):
        """Disconnect and clear all state including extensions."""
        # Clear mixin state
        self._disconnect_pickle_mixin()
        self._disconnect_worldgen_mixin()

        # Call base disconnect
        super().disconnect()

    def _load_tracking_mode_config(self) -> Optional[Dict[str, Any]]:
        """Load the tracking mode configuration from tracking-mode-config.json.

        Returns the config dict or None if not found/invalid.
        """
        global _tracker_mode_config_cache
        if _tracker_mode_config_cache is not None:
            return _tracker_mode_config_cache

        # Try multiple possible locations for the config file
        possible_paths = [
            # Relative to exporter module
            os.path.join(os.path.dirname(__file__), '..', '..', 'exporter', 'tracking-mode-config.json'),
            # Relative to current working directory
            os.path.join('exporter', 'tracking-mode-config.json'),
        ]

        for config_path in possible_paths:
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                    self.logger.debug(f"Loaded tracking mode config from {config_path}")
                    _tracker_mode_config_cache = config
                    return config
                except (json.JSONDecodeError, IOError) as e:
                    self.logger.debug(f"Failed to load tracking-mode-config.json from {config_path}: {e}")

        self.logger.debug("tracking-mode-config.json not found")
        return None

    def _get_passing_modes_for_game(self, game_name: str, config: Dict[str, Any]) -> List[str]:
        """Get the list of passing tracking modes for a game from the config.

        Args:
            game_name: Name of the game
            config: The loaded tracking mode config

        Returns:
            List of passing mode names (e.g., ['worldgen', 'pickle']) or empty list
        """
        if not config:
            return []

        game_results = config.get('game_results', {})

        # Check bundled first, then apworlds
        for category in ['bundled', 'apworlds']:
            category_results = game_results.get(category, {})
            if game_name in category_results:
                return category_results[game_name]

        # Game not in config - return empty list (no passing modes known)
        return []

    def _try_pickle_tracking(self) -> bool:
        """Attempt to initialize pickle-based tracking.

        Returns True if successful, False otherwise.
        """
        if not self.pickle_path:
            return False

        self.logger.info(f"Attempting pickle-based tracking from {self.pickle_path}")
        self._log_debug("attempting_pickle_tracking", {"pickle_path": self.pickle_path})

        pickle_result = self.load_multiworld_from_pickle(self.pickle_path)
        self._log_debug("load_pickle_result", {"success": pickle_result})

        if pickle_result:
            tracking_result = self.initialize_tracking_from_pickle()
            self._log_debug("initialize_pickle_tracking_result", {"success": tracking_result})
            if tracking_result:
                self.logger.info("Using pickle-based tracking")
                self._log_debug("using_pickle_tracking", {"success": True})
                return True
            else:
                self.logger.warning("Failed to initialize tracking from pickle")
        else:
            self.logger.warning("Failed to load pickle")

        return False

    def _resolve_seed_number(self) -> Optional[int]:
        """
        Resolve the seed name to a seed number.

        Tries sources in order:
        1. Reverse lookup table from seed_utils (seeds 1-100)
        2. The generation_seed field from loaded rules JSON

        Returns:
            The seed number, or None if it cannot be resolved
        """
        seed_name = self.seed_name
        if not seed_name:
            return None

        # Normalize to AP_ prefix format for lookup
        seed_id = seed_name if seed_name.startswith('AP_') else f"AP_{seed_name}"

        # 1. Try reverse lookup table
        try:
            from scripts.lib.seed_utils import get_seed_number
            result = get_seed_number(seed_id)
            if result is not None:
                self.logger.info(f"Resolved seed name {seed_id} to seed number {result} via reverse lookup")
                return result
        except ImportError:
            self.logger.debug("seed_utils not available for reverse lookup")

        # 2. Try generation_seed from loaded rules JSON
        if self.generation_seed is not None:
            self.logger.info(f"Resolved seed number {self.generation_seed} from rules JSON generation_seed field")
            return self.generation_seed

        self.logger.debug(f"Could not resolve seed number for {seed_id}")
        return None

    def _try_original_seeded_tracking(self, connected_cls, raw_slot_data) -> bool:
        """
        Attempt original UT tracking with a specific seed number.

        This mode uses the original YAML-based UT behavior, but injects the
        resolved seed number so that multiworld generation is deterministic
        and matches the actual game's randomization.

        Returns True if seed was resolved and tracking initialized, False otherwise.
        """
        seed_number = self._resolve_seed_number()
        if seed_number is None:
            self.logger.debug("Cannot use original_seeded mode: seed number not resolved")
            return False

        self.logger.info(f"Using original_seeded mode with seed number {seed_number}")
        self._log_debug("original_seeded_tracking", {"seed_number": seed_number})

        # Set seed_override so run_generator injects it into args.seed
        self.seed_override = seed_number

        # Run the base class original tracking flow
        super().initalize_tracker_core(connected_cls, raw_slot_data)

        # Check if it succeeded
        if self.multiworld is not None and self.player_id is not None:
            self.logger.info(f"Original_seeded tracking initialized with seed {seed_number}")
            return True

        self.logger.warning("Original_seeded tracking failed to initialize")
        # Clear seed_override so it doesn't interfere with fallback modes
        self.seed_override = None
        return False

    def _try_worldgen_tracking(self) -> bool:
        """Attempt to initialize worldgen-based tracking.

        Returns True if successful, False otherwise.
        """
        if not self.rules_json_path:
            return False

        self.logger.info(f"Attempting worldgen-based tracking from {self.rules_json_path}")
        self._log_debug("attempting_worldgen_tracking", {"rules_json_path": self.rules_json_path})

        worldgen_result = self.generate_and_load_worldgen_world(self.rules_json_path)
        self._log_debug("generate_worldgen_result", {"success": worldgen_result})

        if worldgen_result:
            tracking_result = self.initialize_tracking_from_worldgen()
            self._log_debug("initialize_tracking_result", {"success": tracking_result})
            if tracking_result:
                self.logger.info("Using worldgen-based tracking")
                self._log_debug("using_worldgen_tracking", {"success": True})
                return True
            else:
                self.logger.warning("Failed to initialize tracking from worldgen")
        else:
            self.logger.warning("Failed to generate worldgen world")

        return False

    def initalize_tracker_core(self, connected_cls, raw_slot_data):
        """
        Initialize tracker core with pickle and worldgen support.

        This overrides the base initalize_tracker_core to try different tracking
        modes based on the tracking-mode-config.json configuration.

        When config is available:
        - Uses fallback_order to determine mode priority
        - Only tries modes that pass for this game (from game_results)

        When config is not available (legacy behavior):
        1. Pickle mode - fastest, preserves exact lambdas
        2. Worldgen mode - generates world from JSON rules
        3. Original seeded mode - original with resolved seed number
        4. YAML mode - original UT behavior (random seed)

        Falls back to the next mode if the current one fails.
        """
        if getattr(connected_cls, "disable_ut", False):
            self.log_to_tab("World Author has requested UT be disabled on this world, please respect their decision")
            return

        self._log_debug("initalize_tracker_core", {
            "pickle_path": self.pickle_path,
            "rules_json_path": self.rules_json_path
        })

        # Load tracking mode config
        config = self._load_tracking_mode_config()

        if config:
            # Config-based fallback order
            fallback_order = config.get('fallback_order', ['worldgen', 'pickle', 'original'])
            passing_modes = self._get_passing_modes_for_game(self.game or "", config)

            self._log_debug("config_based_tracking", {
                "fallback_order": fallback_order,
                "passing_modes": passing_modes,
                "game": self.game
            })

            # Try modes in fallback order, but only if they pass for this game
            for mode in fallback_order:
                if passing_modes and mode not in passing_modes:
                    self.logger.debug(f"Skipping {mode} mode for {self.game}: not in passing modes {passing_modes}")
                    continue

                if mode == 'pickle' and self.pickle_path:
                    if self._try_pickle_tracking():
                        return
                elif mode == 'worldgen' and self.rules_json_path:
                    if self._try_worldgen_tracking():
                        return
                elif mode == 'original_seeded':
                    if self._try_original_seeded_tracking(connected_cls, raw_slot_data):
                        return
                elif mode == 'original':
                    # Fall through to base class YAML-based tracking
                    self.logger.info(f"Using original YAML-based tracking for {self.game}")
                    break

        else:
            # Legacy behavior: pickle -> worldgen -> original_seeded -> yaml
            # Try pickle-based tracking first (fastest mode).
            if self.pickle_path:
                if self._try_pickle_tracking():
                    return
                self.logger.warning("Failed to load pickle, falling back to worldgen tracking")

            # Try worldgen-based tracking if rules.json is available.
            if self.rules_json_path:
                if self._try_worldgen_tracking():
                    return
                self.logger.warning("Failed to generate worldgen world, falling back to original_seeded tracking")

            # Try original tracking with resolved seed number
            if self._try_original_seeded_tracking(connected_cls, raw_slot_data):
                return

        # Fall back to base class YAML-based tracking
        super().initalize_tracker_core(connected_cls, raw_slot_data)

    def updateTracker(self) -> CurrentTrackerState:
        """
        Update tracker state with extension support.

        This overrides the base updateTracker to add:
        - Lenient error handling in sphere_log_mode
        - Configurable event filtering
        - Server-trusted item classification
        """
        if self.player_id is None or self.multiworld is None:
            self.logger.error("Player YAML not installed or Generator failed")
            self.set_page(f"Check Player YAMLs for error; Tracker {UT_VERSION} for AP version {__version__}")
            return CurrentTrackerState.init_empty_state()

        state = CollectionState(self.multiworld, self.enforce_deferred_connections != DeferredEntranceMode.disabled)
        prog_items = Counter()
        all_items = Counter()

        callback_list: list[str] = []
        glitches_callback_list: list[str] = []

        item_id_to_name = self.multiworld.worlds[self.player_id].item_id_to_name
        location_id_to_name = self.multiworld.worlds[self.player_id].location_id_to_name

        # Check for invalid items
        invalid_items = [str(item.item) for item in self.tracker_items_received if item.item not in item_id_to_name]
        if invalid_items:
            if self.sphere_log_mode:
                # In sphere_log_mode: Log warning but don't throw
                self.logger.warning(
                    f"Skipping {len(invalid_items)} unknown items (datapackage mismatch?): "
                    f"{invalid_items[:5]}{'...' if len(invalid_items) > 5 else ''}"
                )
            else:
                # Normal mode: throw an exception (original behavior)
                print(invalid_items)
                self.logger.error("Your datapackage is incorrect, please correct the apworld for " + str(self.game))
                self.logger.error("The Following items are unknown [" + ",".join(invalid_items) + "]")
                raise Exception("Your datapackage is incorrect, please correct the apworld for " + str(self.game))

        # Filter to only valid items in sphere_log_mode
        items_to_process = self._filter_invalid_items(self.tracker_items_received, item_id_to_name)

        for item_name, item_flags, item_loc, item_player in [
            (item_id_to_name[item.item], item.flags, item.location, item.player)
            for item in items_to_process if item.item in item_id_to_name
        ] + [(name, ItemClassification.progression, -1, -1) for name in self.manual_items]:
            try:
                world_item = self.multiworld.create_item(item_name, self.player_id)
                if item_loc > 0 and item_player == self.slot and item_loc in location_id_to_name:
                    world_item.location = self.multiworld.get_location(location_id_to_name[item_loc], self.player_id)
                # Use server's item_flags directly for classification
                world_item.classification = item_flags
                state.collect(world_item, True)
                if world_item.advancement:
                    prog_items[world_item.name] += 1
                if self._should_include_item_in_count(world_item):
                    all_items[world_item.name] += 1
            except Exception:
                self.log_to_tab("Item id " + str(item_name) + " not able to be created", False)

        if self._should_sweep_for_advancements():
            state.sweep_for_advancements(
                locations=[location for location in self.multiworld.get_locations(self.player_id) if not location.address]
            )

        self.clear_page()
        regions = []
        locations = []
        readable_locations = []
        glitches_locations: list[int] = []
        hinted_locations = []

        for temp_loc in self.multiworld.get_reachable_locations(state, self.player_id):
            address_is_none_or_list = temp_loc.address is None or isinstance(temp_loc.address, list)
            if not self._should_include_location(temp_loc, address_is_none_or_list):
                continue
            elif self.hide_excluded and temp_loc.progress_type == LocationProgressType.EXCLUDED:
                continue
            elif temp_loc.address in self.ignored_locations:
                continue
            try:
                if temp_loc.address in self.missing_locations:
                    region = ""
                    if temp_loc.parent_region is not None:
                        region = temp_loc.parent_region.name
                    temp_name = temp_loc.name
                    if temp_loc.address in self.location_alias_map:
                        temp_name += f" ({self.location_alias_map[temp_loc.address]})"
                    if self.output_format == "Both":
                        if temp_loc.progress_type == LocationProgressType.EXCLUDED:
                            self.log_to_tab("[color=" + self.get_ut_color("excluded") + "]" + region + " | " + temp_name + "[/color]", True)
                        elif temp_loc.address in self.hints:
                            self.log_to_tab("[color=" + self.get_ut_color("hinted") + "]" + region + " | " + temp_name + "[/color]", True)
                            hinted_locations.append(temp_loc)
                        else:
                            self.log_to_tab(region + " | " + temp_name, True)
                        readable_locations.append(region + " | " + temp_name)
                    elif self.output_format == "Location":
                        if temp_loc.progress_type == LocationProgressType.EXCLUDED:
                            self.log_to_tab("[color=" + self.get_ut_color("excluded") + "]" + temp_name + "[/color]", True)
                        elif temp_loc.address in self.hints:
                            self.log_to_tab("[color=" + self.get_ut_color("hinted") + "]" + temp_name + "[/color]", True)
                            hinted_locations.append(temp_loc)
                        else:
                            self.log_to_tab(temp_name, True)
                        readable_locations.append(temp_name)
                    if region not in regions:
                        regions.append(region)
                        if self.output_format == "Region":
                            self.log_to_tab(region, True)
                            readable_locations.append(region)
                    callback_list.append(temp_loc.name)
                    locations.append(temp_loc.address)
            except Exception:
                self.log_to_tab("ERROR: location " + temp_loc.name + " broke something, report this to discord")
                pass

        events = [location.item.name for location in state.advancements if location.player == self.player_id and location.item is not None]
        event_locations = [location.name for location in state.advancements if location.player == self.player_id]
        unconnected_entrances = [
            entrance for region in state.reachable_regions[self.player_id]
            for entrance in region.exits if entrance.can_reach(state) and entrance.connected_region is None
        ]

        self.locations_available = locations
        glitches_item_name = getattr(self.multiworld.worlds[self.player_id], "glitches_item_name", "")
        glitches_state = state.copy()
        if glitches_item_name:
            try:
                world_item = self.multiworld.create_item(glitches_item_name, self.player_id)
                glitches_state.collect(world_item, True)
            except Exception:
                self.log_to_tab("Item id " + str(glitches_item_name) + " not able to be created", False)
            else:
                glitches_state.sweep_for_advancements(
                    locations=[location for location in self.multiworld.get_locations(self.player_id) if not location.address]
                )
                for temp_loc in self.multiworld.get_reachable_locations(glitches_state, self.player_id):
                    if temp_loc.address is None or isinstance(temp_loc.address, list):
                        continue
                    elif self.hide_excluded and temp_loc.progress_type == LocationProgressType.EXCLUDED:
                        continue
                    elif temp_loc.address in self.ignored_locations:
                        continue
                    elif temp_loc.address in locations:
                        continue  # already in logic
                    try:
                        if temp_loc.address in self.missing_locations:
                            glitches_locations.append(temp_loc.address)
                            glitches_callback_list.append(temp_loc.name)
                            region = ""
                            if temp_loc.parent_region is not None:
                                region = temp_loc.parent_region.name
                            if self.enable_glitched_logic:
                                temp_name = temp_loc.name
                                if temp_loc.address in self.location_alias_map:
                                    temp_name += f" ({self.location_alias_map[temp_loc.address]})"
                                if self.output_format == "Both":
                                    if temp_loc.progress_type == LocationProgressType.EXCLUDED:
                                        self.log_to_tab("[color=" + self.get_ut_color("out_of_logic_glitched") + "]" + region + " | " + temp_name + "[/color]", True)
                                    elif temp_loc.address in self.hints:
                                        self.log_to_tab("[color=" + self.get_ut_color("hinted_glitched") + "]" + region + " | " + temp_name + "[/color]", True)
                                        hinted_locations.append(temp_loc)
                                    else:
                                        self.log_to_tab("[color=" + self.get_ut_color("glitched") + "]" + region + " | " + temp_name + "[/color]", True)
                                    readable_locations.append(region + " | " + temp_name)
                                elif self.output_format == "Location":
                                    if temp_loc.progress_type == LocationProgressType.EXCLUDED:
                                        self.log_to_tab("[color=" + self.get_ut_color("out_of_logic_glitched") + "]" + temp_name + "[/color]", True)
                                    elif temp_loc.address in self.hints:
                                        self.log_to_tab("[color=" + self.get_ut_color("hinted_glitched") + "]" + temp_name + "[/color]", True)
                                        hinted_locations.append(temp_loc)
                                    else:
                                        self.log_to_tab("[color=" + self.get_ut_color("glitched") + "]" + temp_name + "[/color]", True)
                                    readable_locations.append(temp_name)
                            if region not in regions:
                                regions.append(region)
                                if self.output_format == "Region" and self.enable_glitched_logic:
                                    self.log_to_tab("[color=" + self.get_ut_color("glitched") + "]" + region + "[/color]", True)
                                    readable_locations.append(region)
                    except Exception:
                        self.log_to_tab("ERROR: location " + temp_loc.name + " broke something, report this to discord")
                        pass
        self.glitched_locations = glitches_locations

        return CurrentTrackerState(
            all_items, prog_items, glitches_callback_list, events, event_locations,
            callback_list, regions, unconnected_entrances, readable_locations,
            hinted_locations, state, glitches_state
        )
