import asyncio
import random
import datetime
import os
import json
from collections.abc import Iterable
from typing import Optional, Dict

from CommonClient import ClientCommandProcessor, CommonContext, logger, server_loop, gui_enabled, get_base_parser
from worlds.AutoWorld import World
from BaseClasses import Region, LocationProgressType, CollectionState
tracker_loaded = True
from worlds.tracker.TrackerClient import TrackerGameContext, TrackerCommandProcessor

class SlowReleaseCommandProcessor(TrackerCommandProcessor):
    def _cmd_time(self, time):
        """Set the time per check."""
        self.ctx.time_per = float(time)
        logger.info(f"Set time per check to {self.ctx.time_per}")

    def _cmd_region_mode(self):
        """Toggle Region mode (i.e. make the slow release client act more like a player by handling one region of the world at a time.)"""
        self.ctx.region_mode = not self.ctx.region_mode
        logger.info(f"Set region mode to {self.ctx.region_mode}")

class SlowReleaseContext(TrackerGameContext):
    time_per = 1
    tags = ["SlowRelease", "Tracker"]
    game = ""
    has_game = False
    region_mode = True
    command_processor = SlowReleaseCommandProcessor
    autoplayer_task = None

    # --- Logging Attributes ---
    log_file_handler = None
    log_file_path: str = ""
    logged_accessible_locations: set[int]
    logged_checked_locations: set[int]
    all_physical_locations: set[int]
    current_slot_data: Optional[Dict] = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logged_accessible_locations = set()
        self.logged_checked_locations = set()
        self.all_physical_locations = set()
        self.current_slot_data = None

    # --- Logging Helpers ---
    def _log_json(self, data: dict):
        """Adds a timestamp and writes the dictionary as a JSON line to the log file."""
        # Assumes log_file_path is set and directory exists before first call
        if not self.log_file_handler and self.log_file_path:
            try:
                self.log_file_handler = open(self.log_file_path, "a", encoding="utf-8")
            except Exception as e:
                logger.error(f"[SlowReleaseLogger] Error opening log file {self.log_file_path}: {e}")
                return # Cannot log if file can't be opened

        if self.log_file_handler:
            try:
                data["timestamp"] = datetime.datetime.now().isoformat()
                # Sort keys for consistent output, easier diffing
                json_string = json.dumps(data, sort_keys=True)
                self.log_file_handler.write(f"{json_string}\n")
                self.log_file_handler.flush() # Ensure write happens now
            except Exception as e:
                logger.error(f"[SlowReleaseLogger] Error writing JSON to log file: {e}")
                # Attempt to close handler on write error?
                self._close_log_file() # Close potentially broken handler

    def _close_log_file(self):
        """Closes the log file handler if it's open."""
        if self.log_file_handler:
            try:
                self.log_file_handler.close()
            except Exception as e:
                 logger.error(f"[SlowReleaseLogger] Error closing log file: {e}")
            self.log_file_handler = None
        self.log_file_path = ""
        # Reset internal state on disconnect
        self.logged_accessible_locations = set()
        self.logged_checked_locations = set()
        self.all_physical_locations = set()

    def _get_location_name(self, loc_id: int) -> str:
         """Safely get location name by ID, returning ID if name not found."""
         return self.location_names.lookup_in_game(loc_id) or f"Error Location (ID: {loc_id})"

    # --- Accessibility Logic ---
    def _get_current_location_states(self) -> tuple[set[int], set[int], set[int]]:
        """Calculates the current sets of accessible, checked, and inaccessible location IDs."""
        if not self.multiworld or not self.player_id:
            logger.warning("[SlowRelease] Cannot get location states: multiworld/player data not ready.")
            return set(), set(), set()

        # Use the pre-calculated set of all physical locations
        if not self.all_physical_locations:
            logger.warning("[SlowRelease] Cannot get location states: all_physical_locations not calculated yet.")
            # Attempt to calculate it now if missed during init?
            # Or rely on it being set during _perform_initial_log
            return set(), set(), set()

        # locations_available is populated by the tracker logic updates
        current_accessible_ids = set()
        if hasattr(self, 'locations_available'):
            current_accessible_ids = set(self.locations_available)
        else:
            logger.warning("[SlowRelease] locations_available attribute missing during state check.")

        # checked_locations is populated by the base context after check_locations
        current_checked_ids = set()
        if hasattr(self, 'checked_locations'):
             # Ensure it's a set of integers
             current_checked_ids = {loc_id for loc_id in self.checked_locations if isinstance(loc_id, int)}
        else:
            logger.warning("[SlowRelease] checked_locations attribute missing during state check.")


        # Ensure accessible/checked IDs are actually part of the physical locations
        valid_accessible_ids = current_accessible_ids.intersection(self.all_physical_locations)
        valid_checked_ids = current_checked_ids.intersection(self.all_physical_locations)

        # Log discrepancies if any
        filtered_acc = current_accessible_ids - valid_accessible_ids
        filtered_chk = current_checked_ids - valid_checked_ids
        if filtered_acc:
             logger.warning(f"[SlowRelease] Filtered out non-physical accessible IDs: {filtered_acc}")
        if filtered_chk:
             logger.warning(f"[SlowRelease] Filtered out non-physical checked IDs: {filtered_chk}")

        # Inaccessible = All physical locations MINUS the valid accessible AND valid checked ones
        current_inaccessible_ids = self.all_physical_locations - valid_accessible_ids - valid_checked_ids

        return valid_accessible_ids, valid_checked_ids, current_inaccessible_ids

    # --- Logging Control Flow ---
    async def _perform_initial_log(self):
        """Waits for connection, performs initial accessibility check & log, then starts autoplayer."""
        try:
            logger.info("[SlowRelease] Waiting for essential data for initial state calculation...")
            wait_count = 0
            # Refactored loop with explicit break
            while True:
                wait_count += 1
                # Evaluate conditions for logging AND breaking
                has_multiworld = bool(self.multiworld)
                # Explicitly check player_id is not None, as 0 is a valid ID but falsey
                has_player_id = self.player_id is not None
                has_server = bool(self.server)
                has_slot_data = self.current_slot_data is not None

                # Log status
                status_msg = (
                    f"[SlowRelease] Waiting loop ({wait_count}): "
                    f"multiworld={has_multiworld} | "
                    f"player_id={has_player_id} ({self.player_id}) | " # Log actual ID too
                    f"server={has_server} | "
                    f"slot_data={has_slot_data}"
                )
                logger.info(status_msg)

                # Check break condition using the evaluated booleans
                if has_multiworld and has_player_id and has_server and has_slot_data:
                    logger.info("[SlowRelease] All conditions met. Breaking wait loop.")
                    break # Exit the loop

                # Timeout check
                if wait_count > 60: # Check after ~12 seconds
                    logger.error("[SlowRelease] Still waiting for essential data after many attempts. Check connection/setup.")
                    # Break on timeout to prevent infinite loop
                    logger.error("[SlowRelease] Breaking wait loop due to timeout.")
                    break

                await asyncio.sleep(0.2)

            # Check if we broke due to timeout vs success to add context for later steps
            proceed_after_wait = has_multiworld and has_player_id and has_server and has_slot_data
            if not proceed_after_wait:
                 logger.error("[SlowRelease] Proceeding after wait loop timeout/failure. Initial state calculation might fail or be incorrect.")
            else:
                 logger.info("[SlowRelease] Proceeding after wait loop success.")

            # --- Setup Log Paths and Directory ---
            target_log_dir = os.path.join("frontend", "playthroughs")
            try:
                os.makedirs(target_log_dir, exist_ok=True)
                logger.info(f"[SlowReleaseLogger] Ensured log directory exists: {target_log_dir}")
            except Exception as e:
                logger.error(f"[SlowReleaseLogger] Failed to create log directory {target_log_dir}: {e}")
                # Cannot proceed without log directory
                return

            # Determine log file name
            timestamp_file = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_player_name = "".join(c for c in self.auth if c.isalnum() or c in ('_','-')).rstrip()
            log_filename = f"slowrelease_{safe_player_name}_{self.player_id}_{timestamp_file}.json"
            self.log_file_path = os.path.join(target_log_dir, log_filename)
            logger.info(f"[SlowReleaseLogger] Initializing log file: {self.log_file_path}")
            index_file_path = os.path.join(target_log_dir, "playthrough_files.json")

            # --- Update Index File --- 
            playthrough_index = []
            try:
                 if os.path.exists(index_file_path):
                     with open(index_file_path, "r", encoding="utf-8") as f_index:
                         playthrough_index = json.load(f_index)
                         if not isinstance(playthrough_index, list):
                              logger.warning(f"[SlowReleaseLogger] Index file {index_file_path} did not contain a list. Resetting.")
                              playthrough_index = []
                 else:
                      logger.info(f"[SlowReleaseLogger] Index file {index_file_path} not found. Creating new one.")
            except json.JSONDecodeError:
                 logger.error(f"[SlowReleaseLogger] Error decoding JSON from {index_file_path}. Resetting index.")
                 playthrough_index = []
            except Exception as e:
                 logger.error(f"[SlowReleaseLogger] Error reading index file {index_file_path}: {e}. Resetting index.")
                 playthrough_index = []

            # Prepare new entry
            seed_name = self.seed_name if hasattr(self, 'seed_name') else None
            game_name = self.game if hasattr(self, 'game') else "Unknown"
            new_entry = {
                 "filename": log_filename, # Just the filename
                 "game": game_name,
                 "player_id": self.player_id,
                 "player_name": self.auth,
                 "seed": seed_name,
                 "timestamp": datetime.datetime.now().isoformat() # Add timestamp to index entry too
            }
            playthrough_index.append(new_entry)

            # Write updated index back
            try:
                 with open(index_file_path, "w", encoding="utf-8") as f_index:
                     json.dump(playthrough_index, f_index, indent=4)
                 logger.info(f"[SlowReleaseLogger] Updated index file: {index_file_path}")
            except Exception as e:
                 logger.error(f"[SlowReleaseLogger] Failed to write updated index file {index_file_path}: {e}")
                 # Continue logging to main file even if index update fails?

            # --- Log Connection Info to Main Log File --- 
            connection_info = {
                "event": "connected",
                "player_name": self.auth,
                "player_id": self.player_id,
                "seed_name": self.seed_name if hasattr(self, 'seed_name') else None, # Use seed_name if available
                "initial_time_per_check": self.time_per,
                "initial_region_mode": self.region_mode
            }
            self._log_json(connection_info)

            # === Directly Calculate Initial State ===
            logger.info("[SlowRelease] Directly calculating initial accessibility state...")
            initial_state = CollectionState(self.multiworld)
            # Collect manually added items if any (usually none at start)
            if hasattr(self, 'manual_items') and self.manual_items:
                 item_id_to_name = self.multiworld.worlds[self.player_id].item_id_to_name
                 for item_name in self.manual_items:
                     try:
                         initial_state.collect(self.multiworld.create_item(item_name, self.player_id), True)
                     except Exception as e:
                         logger.warning(f"[SlowRelease] Error collecting manual item '{item_name}' for initial state: {e}")
            initial_state.sweep_for_advancements(
                locations=(location for location in self.multiworld.get_locations(self.player_id) if not location.address))

            # Get all reachable locations based on this initial state
            initial_reachable_locations = self.multiworld.get_reachable_locations(initial_state, self.player_id)

            # Filter to get valid accessible location IDs
            initial_acc_ids = set()
            for loc in initial_reachable_locations:
                 if loc.address is not None and loc.progress_type != LocationProgressType.EXCLUDED:
                     if isinstance(loc.address, Iterable):
                         initial_acc_ids.update(a for a in loc.address if isinstance(a, int))
                     elif isinstance(loc.address, int):
                         initial_acc_ids.add(loc.address)

            # Get and STORE all physical locations for comparison
            temp_all_physical_locations = set() # Use temp var first
            try:
                world = self.multiworld.worlds[self.player_id]
                for loc in world.get_locations():
                    if loc.progress_type != LocationProgressType.EXCLUDED and loc.address is not None:
                        if isinstance(loc.address, Iterable):
                            temp_all_physical_locations.update(a for a in loc.address if isinstance(a, int))
                        elif isinstance(loc.address, int):
                            temp_all_physical_locations.add(loc.address)
                self.all_physical_locations = temp_all_physical_locations # Store on success
                logger.info(f"[SlowRelease] Calculated {len(self.all_physical_locations)} total physical locations.")
            except Exception as e:
                logger.exception(f"[SlowRelease] Error getting all world locations for initial state:")
                # If this fails, subsequent inaccessible calculations will be wrong.
                self.all_physical_locations = set() # Ensure it's an empty set on error

            # Ensure initial accessible are subset of all physical
            initial_acc_ids = initial_acc_ids.intersection(self.all_physical_locations)

            initial_inacc_ids = self.all_physical_locations - initial_acc_ids

            # Store and log initial state
            self.logged_accessible_locations = initial_acc_ids
            self.logged_checked_locations = set() # Checked is empty initially
            # Don't store inaccessible, calculate on demand
            logger.info(f"[SlowRelease] Initial state calculated: {len(initial_acc_ids)} accessible, {len(initial_inacc_ids)} inaccessible, 0 checked.")

            initial_state_data = {
                "event": "initial_state",
                "accessible_locations": [{"id": i, "name": self._get_location_name(i)} for i in sorted(list(initial_acc_ids))],
                "checked_locations": [], # Explicitly log empty checked list
                "inaccessible_locations": [{"id": i, "name": self._get_location_name(i)} for i in sorted(list(initial_inacc_ids))]
            }
            self._log_json(initial_state_data)
            # === End Direct Calculation ===

            logger.info("[SlowRelease] Initial logging complete. Starting autoplayer task.")
            # Start the autoplayer task *after* initial logging is done
            if self.autoplayer_task:
                 logger.warning("[SlowRelease] Cancelling existing autoplayer task before starting new one.")
                 self.autoplayer_task.cancel()
                 try:
                     await self.autoplayer_task # Allow cancellation to process
                 except asyncio.CancelledError:
                     pass # Expected
                 self.autoplayer_task = None
            self.autoplayer_task = asyncio.create_task(self.autoplayer())
            logger.info("[SlowRelease] Autoplayer task created.")

        except asyncio.CancelledError: # Specifically catch cancellation
            logger.info("[SlowRelease] _perform_initial_log task cancelled.")
            # Re-raise if needed, but usually just means we disconnected/shut down

        except Exception:
            logger.exception("[SlowRelease] CRITICAL ERROR inside _perform_initial_log:")

    async def _perform_update_log(self, checked_location_id: int):
        """Logs the checked location, waits for tracker update, updates accessibility, logs new locations."""
        logger.info(f"[SlowRelease] Logging check for location ID: {checked_location_id}")

        # Log the check itself
        checked_location_data = {
            "event": "checked_location",
            "location": {"id": checked_location_id, "name": self._get_location_name(checked_location_id)}
        }
        self._log_json(checked_location_data)

        # Wait for the game_watcher to signal it has updated the state
        logger.info("[SlowRelease] Waiting for tracker watcher event...")
        try:
            await asyncio.wait_for(self.watcher_event.wait(), timeout=3.0) # Wait up to 3s
            self.watcher_event.clear() # Clear event after catching it
            logger.info("[SlowRelease] Tracker watcher event received.")
        except asyncio.TimeoutError:
            logger.warning("[SlowRelease] Timeout waiting for tracker watcher event. State might be stale.")
            # Proceeding anyway, state might not reflect the last check fully yet.

        # Get new accessibility state (now relying on self.locations_available updated by tracker)
        logger.info("[SlowRelease] Recalculating accessibility post-check (using tracker state)...")
        # Get all three states
        current_accessible_ids, current_checked_ids, current_inaccessible_ids = self._get_current_location_states()
        logger.info(f"[SlowRelease] Post-check state: {len(current_accessible_ids)} accessible, {len(current_checked_ids)} checked, {len(current_inaccessible_ids)} inaccessible.")

        # Log the complete state update
        state_update_data = {
            "event": "state_update",
            "accessible_locations": [{"id": i, "name": self._get_location_name(i)} for i in sorted(list(current_accessible_ids))],
            "checked_locations": [{"id": i, "name": self._get_location_name(i)} for i in sorted(list(current_checked_ids))],
            "inaccessible_locations": [{"id": i, "name": self._get_location_name(i)} for i in sorted(list(current_inaccessible_ids))]
        }
        self._log_json(state_update_data)

        # Update internal state *after* logging
        self.logged_accessible_locations = current_accessible_ids
        self.logged_checked_locations = current_checked_ids
        logger.info("[SlowRelease] Internal accessibility state updated.")

    def autoplayer_log(self, message):
        # Keep console logging minimal for autoplayer decisions/state
        logger.info(message)

    async def autoplayer(self):
        """Main autoplayer loop, calls update log function after checks."""
        self.autoplayer_log("[Autoplayer] Task started. Waiting for player ID...")
        while not self.player_id:
            await asyncio.sleep(1)

        self.autoplayer_log(f"[Autoplayer] Player ID {self.player_id} ready. Starting main loop.")
        world: World = self.multiworld.worlds[self.player_id]
        # Note: Region mode logic is simplified here as the complexity seemed problematic.
        # Reverting to basic random choice for stability. Add back BFS if needed later.

        while True:
            # Check if locations_available attribute exists and is populated
            # Also check if game is already complete
            if self.all_physical_locations and self.logged_checked_locations == self.all_physical_locations:
                self.autoplayer_log("[Autoplayer] All physical locations are checked. Stopping task.")
                break # Exit loop if complete

            if hasattr(self, 'locations_available') and len(self.locations_available) > 0:
                goal_location = None
                # Basic Random Mode:
                goal_location = random.choice(self.locations_available)
                goal_location_name = self._get_location_name(goal_location)
                self.autoplayer_log(f"[Autoplayer] Selecting location: {goal_location_name} (ID: {goal_location})")

                # --- Perform the check and log/update sequence ---
                self.autoplayer_log(f"[Autoplayer] Waiting {self.time_per} seconds before check...")
                await asyncio.sleep(self.time_per)

                self.autoplayer_log(f"[Autoplayer] Checking location: {goal_location_name}")
                try:
                    # check_locations updates the internal state (ctx.locations_checked etc)
                    await self.check_locations([goal_location])
                except Exception as e:
                     logger.error(f"[Autoplayer] Error during check_locations for {goal_location_name}: {e}")
                     # Decide how to handle check errors - skip update log? retry? For now, log error and continue loop.
                     await asyncio.sleep(1) # Brief pause after error
                     continue

                self.autoplayer_log(f"[Autoplayer] Performing post-check update and logging...")
                try:
                    await self._perform_update_log(goal_location)
                except Exception as e:
                     logger.exception(f"[Autoplayer] Error during _perform_update_log for {goal_location_name}:")

                # Completion check moved here, after state is updated
                if self.all_physical_locations and self.logged_checked_locations == self.all_physical_locations:
                    self.autoplayer_log("[Autoplayer] All physical locations checked after update. Stopping task.")
                    break # Exit loop if now complete

                self.autoplayer_log(f"[Autoplayer] Update complete. Continuing loop.")
                await asyncio.sleep(0.1) # Small delay before next decision

            else: # No locations available or attribute missing
                self.autoplayer_log("[Autoplayer] No locations available. Waiting...")
                await asyncio.sleep(1) # Standard wait when 'in BK'

        self.autoplayer_log("[Autoplayer] Loop finished.") # Log when loop exits

    def make_gui(self):
        ui = super().make_gui()
        ui.base_title = "Slow Release Client"
        return ui

    def on_package(self, cmd, args):
        super().on_package(cmd, args)
        if cmd == "Connected":
            logger.info("[SlowRelease] Received Connected packet.")
            # Store slot_data when received
            self.current_slot_data = args.get('slot_data', None)
            if not self.current_slot_data:
                logger.warning("[SlowRelease] Connected packet missing 'slot_data'. Initial log might fail.")

            if "Tracker" in self.tags:
                self.tags.remove("Tracker")
                asyncio.create_task(self.send_msgs([{"cmd": "ConnectUpdate", "tags": self.tags}]))

            # Instead, schedule the initial log, which will start autoplayer upon completion.
            # Ensure any previous initial log task is cancelled if reconnecting
            if hasattr(self, '_initial_log_task') and self._initial_log_task and not self._initial_log_task.done():
                logger.warning("[SlowRelease] Cancelling previous initial log task.")
                self._initial_log_task.cancel()

            logger.info("[SlowRelease] Connected. Scheduling initial log task.")
            try:
                self._initial_log_task = asyncio.create_task(self._perform_initial_log())
                logger.info(f"[SlowRelease] Initial log task created: {self._initial_log_task}") # Log task object
            except Exception as e:
                logger.exception("[SlowRelease] Error creating initial log task:") # Log creation error

        elif cmd == "RoomInfo":
            # Ensure seed_name is set, needed by _perform_initial_log
            self.seed_name = args.get('seed_name', None)


    def disconnect(self, *args):
        if self.autoplayer_task:
            self.autoplayer_task.cancel()
            self.autoplayer_task = None # Clear task reference
        if "Tracker" not in self.tags:
            self.tags.append("Tracker")
        # Close the log file on disconnect
        self._close_log_file()
        logger.info("[SlowReleaseLogger] Log file closed due to disconnect.")
        return super().disconnect(*args)

def launch(*args):

    async def main(args):
        ctx = SlowReleaseContext(args.connect, args.password)
        ctx.auth = args.name
        ctx.server_task = asyncio.create_task(server_loop(ctx), name="server loop")

        if tracker_loaded:
            # run_generator might be necessary for TrackerGameContext setup
            # It usually happens before connection, but needs to complete.
             try:
                 ctx.run_generator()
             except Exception as e:
                 logger.exception("Failed to run generator:")
                 # Handle generator failure? Maybe prevent connection?

        if gui_enabled:
            ctx.run_gui()
        ctx.run_cli()

        await ctx.exit_event.wait()
        # Ensure shutdown happens correctly
        await ctx.shutdown()
        if ctx.server_task: # Ensure server_task is awaited/cancelled on exit
             if not ctx.server_task.done():
                 ctx.server_task.cancel()
             try:
                 await ctx.server_task
             except asyncio.CancelledError:
                 pass # Expected if cancelled
        ctx._close_log_file() # Final attempt to close log on exit


    import colorama

    parser = get_base_parser(description="Slow Release Archipelago Client, for text interfacing.")
    parser.add_argument('--name', default=None, help="Slot Name to connect as.")
    parser.add_argument("url", nargs="?", help="Archipelago connection url")
    args = parser.parse_args(args)

    if args.url:
        import urllib
        url = urllib.parse.urlparse(args.url)
        if url.scheme == "archipelago":
            args.connect = url.netloc
            if url.username:
                args.name = urllib.parse.unquote(url.username)
            if url.password:
                args.password = urllib.parse.unquote(url.password)
        else:
            parser.error(f"bad url, found {args.url}, expected url in form of archipelago://archipelago.gg:38281")

    colorama.init()

    asyncio.run(main(args))
    colorama.deinit()

