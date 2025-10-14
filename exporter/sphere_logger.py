import json
import os
import logging
from typing import Set, List, Dict, Optional, Union, TYPE_CHECKING
from itertools import chain

if TYPE_CHECKING:
    from BaseClasses import MultiWorld, CollectionState, Location, Spoiler, Item

# Track previous states for calculating deltas in non-verbose mode
_previous_fractional_state = None
_previous_integer_state = None


def _calculate_inventory_delta(current_items: Dict[str, int], previous_items: Dict[str, int]) -> Dict[str, int]:
    """Calculate new items added since previous state."""
    delta = {}
    for item_name, count in current_items.items():
        prev_count = previous_items.get(item_name, 0)
        new_count = count - prev_count
        if new_count > 0:
            delta[item_name] = new_count
    return delta


def _calculate_list_delta(current_list: List[str], previous_list: List[str]) -> List[str]:
    """Calculate newly added items in a list."""
    current_set = set(current_list)
    previous_set = set(previous_list)
    new_items = current_set - previous_set
    return sorted(list(new_items))


def _is_fractional_sphere(sphere_index: Union[int, str]) -> bool:
    """Check if sphere index is fractional (e.g., 0.1, 1.5) vs integer (0, 1, 2)."""
    index_str = str(sphere_index)
    return '.' in index_str


def log_sphere_details(file_handler, multiworld: "MultiWorld", sphere_index: Union[int, str],
                       current_sphere_locations: Set["Location"],
                       current_collection_state: "CollectionState",
                       verbose_mode: bool = True,
                       extend_sphere_log_to_all_locations: bool = False) -> None:
    """Logs details of the current sphere to the provided file handler."""
    global _previous_fractional_state, _previous_integer_state

    if not file_handler:
        logging.warning("Spoiler log file not open. Cannot log sphere details.")
        return

    try:
        # Determine if this is a fractional or integer sphere
        is_fractional = _is_fractional_sphere(sphere_index)
        is_sphere_zero = str(sphere_index) == "0" or str(sphere_index) == "0.0"

        # Collect current state data for all players
        current_state_data = {}
        player_specific_data = {}

        for player_id in multiworld.player_ids:
            # Get resolved items from CollectionState (after progressive item resolution)
            resolved_items = {item_name: count for item_name, count in current_collection_state.prog_items.get(player_id, {}).items()}

            # Get base items by examining all checked locations for this player
            # These are the item names BEFORE progressive item resolution
            base_items = {}
            for location in current_collection_state.locations_checked:
                if location.item and location.item.player == player_id:
                    # When extend_sphere_log_to_all_locations is enabled, count ALL items
                    # Otherwise, only count advancement items (same filter as prog_items)
                    if extend_sphere_log_to_all_locations or location.item.advancement:
                        item_name = location.item.name
                        base_items[item_name] = base_items.get(item_name, 0) + 1

            inventory_details = {
                "base_items": base_items,
                "resolved_items": resolved_items
            }

            accessible_locations = []
            if multiworld:
                accessible_locations = sorted([
                    loc.name for loc in multiworld.get_locations(player_id)
                    if loc.can_reach(current_collection_state)
                ])

            accessible_regions = []
            if multiworld:
                accessible_regions = sorted([
                    reg.name for reg in multiworld.get_regions(player_id)
                    if reg.can_reach(current_collection_state)
                ])

            # Store current state for this player
            current_state_data[player_id] = {
                "inventory_details": inventory_details,
                "accessible_locations": accessible_locations,
                "accessible_regions": accessible_regions
            }

            # Determine what to log based on verbose_mode
            if verbose_mode:
                # Verbose mode: log full state with original field names
                player_specific_data[player_id] = {
                    "inventory_details": inventory_details,
                    "accessible_locations": accessible_locations,
                    "accessible_regions": accessible_regions
                }
            else:
                # Non-verbose mode: calculate deltas
                if is_sphere_zero:
                    # Sphere 0: log full state as baseline (but use new_* field names)
                    player_specific_data[player_id] = {
                        "new_inventory_details": inventory_details,
                        "new_accessible_locations": accessible_locations,
                        "new_accessible_regions": accessible_regions
                    }
                else:
                    # Get the appropriate previous state
                    if is_fractional:
                        previous_state = _previous_fractional_state
                    else:
                        previous_state = _previous_integer_state

                    if previous_state and player_id in previous_state:
                        prev_data = previous_state[player_id]

                        # Calculate deltas
                        new_base_items = _calculate_inventory_delta(
                            base_items,
                            prev_data["inventory_details"]["base_items"]
                        )
                        new_resolved_items = _calculate_inventory_delta(
                            resolved_items,
                            prev_data["inventory_details"]["resolved_items"]
                        )
                        new_accessible_locations = _calculate_list_delta(
                            accessible_locations,
                            prev_data["accessible_locations"]
                        )
                        new_accessible_regions = _calculate_list_delta(
                            accessible_regions,
                            prev_data["accessible_regions"]
                        )

                        player_specific_data[player_id] = {
                            "new_inventory_details": {
                                "base_items": new_base_items,
                                "resolved_items": new_resolved_items
                            },
                            "new_accessible_locations": new_accessible_locations,
                            "new_accessible_regions": new_accessible_regions
                        }
                    else:
                        # No previous state available, log full state as fallback
                        logging.warning(f"No previous state available for player {player_id} at sphere {sphere_index}, logging full state")
                        player_specific_data[player_id] = {
                            "new_inventory_details": inventory_details,
                            "new_accessible_locations": accessible_locations,
                            "new_accessible_regions": accessible_regions
                        }

        # Update previous state trackers (only in non-verbose mode)
        if not verbose_mode:
            if is_sphere_zero:
                # Sphere 0 initializes both trackers
                _previous_fractional_state = current_state_data.copy()
                _previous_integer_state = current_state_data.copy()
            elif is_fractional:
                # Fractional sphere updates only fractional tracker
                _previous_fractional_state = current_state_data.copy()
            else:
                # Integer sphere updates only integer tracker
                _previous_integer_state = current_state_data.copy()

        sphere_location_names = sorted([loc.name for loc in current_sphere_locations])

        log_entry = {
            "type": "state_update",
            "sphere_index": sphere_index,
            "sphere_locations": sphere_location_names,
            "player_data": player_specific_data,
        }

        file_handler.write(json.dumps(log_entry) + "\n")
        file_handler.flush()

    except Exception as e:
        logging.error(f"Error during spoiler sphere logging for sphere {sphere_index}: {e}")


def create_playthrough_with_logging(spoiler: "Spoiler", create_paths: bool = True) -> None:
    """
    Enhanced version of create_playthrough that adds sphere logging.
    Destructive to the multiworld while it is run, damage gets repaired afterwards.
    """
    global _previous_fractional_state, _previous_integer_state

    from settings import get_settings
    from BaseClasses import CollectionState

    settings = get_settings()

    # Set up logging options
    log_fractional_sphere_details = settings.general_options.log_fractional_sphere_details
    log_integer_sphere_details = settings.general_options.log_integer_sphere_details
    verbose_sphere_log = settings.general_options.verbose_sphere_log
    extend_sphere_log_to_all_locations = settings.general_options.extend_sphere_log_to_all_locations

    # Reset state trackers at the start
    _previous_fractional_state = None
    _previous_integer_state = None

    spoiler_log_file_handler = None
    log_file_path = ""

    try:
        # Use temp_dir from multiworld if available for spheres_log.jsonl, otherwise fallback to output_path
        log_output_directory = getattr(spoiler.multiworld, 'temp_dir_for_spheres_log', None)

        if log_output_directory is None:
            log_output_directory = getattr(spoiler.multiworld, 'output_path', 'output')
            if not os.path.exists(log_output_directory):
                os.makedirs(log_output_directory, exist_ok=True)
        
        log_filename = f"AP_{spoiler.multiworld.seed_name}_spheres_log.jsonl"
        log_file_path = os.path.join(log_output_directory, log_filename)
        
        logging.info(f"Attempting to open spoiler log file for sphere data at: {log_file_path}")
        spoiler_log_file_handler = open(log_file_path, "w")
        logging.info(f"Spoiler sphere log will be written to: {log_file_path}")
    except Exception as e:
        logging.error(f"Failed to open spoiler log file {log_file_path}: {e}")
        spoiler_log_file_handler = None
    
    try:
        # Main implementation with logging
        multiworld = spoiler.multiworld
        if extend_sphere_log_to_all_locations:
            prog_locations = set(multiworld.get_filled_locations())
        else:
            prog_locations = {location for location in multiworld.get_filled_locations() if location.item.advancement}
        state_cache: List[Optional[CollectionState]] = [None]
        # collection_spheres will be redefined later for the final pass
        initial_collection_spheres: List[Set["Location"]] = []
        state = CollectionState(multiworld)
        sphere_candidates = set(prog_locations)
        
        logging.debug('Building up initial collection spheres for pruning.')
        while sphere_candidates:
            sphere = {location for location in sphere_candidates if state.can_reach(location)}
            for location in sphere:
                state.collect(location.item, True, location)
            sphere_candidates -= sphere
            initial_collection_spheres.append(sphere)
            state_cache.append(state.copy())
            logging.debug('Calculated initial sphere %i, containing %i of %i progress items.', 
                          len(initial_collection_spheres), len(sphere), len(prog_locations))
            if not sphere:
                if any([multiworld.worlds[location.item.player].options.accessibility != 'minimal' for location in sphere_candidates]):
                    raise RuntimeError(f'Not all progression items reachable ({sphere_candidates}). Something went wrong.')
                else:
                    spoiler.unreachables = sphere_candidates
                    break
        
        # Pruning phase
        restore_later: Dict["Location", "Item"] = {}
        if not extend_sphere_log_to_all_locations:
            for num, sphere in reversed(tuple(enumerate(initial_collection_spheres))):
                to_delete: Set["Location"] = set()
                for location in sphere:
                    old_item = location.item
                    location.item = None
                    if multiworld.can_beat_game(state_cache[num]):
                        to_delete.add(location)
                        restore_later[location] = old_item
                    else:
                        location.item = old_item
                sphere -= to_delete
                initial_collection_spheres[num] = sphere

        # Precollected items phase
        # NOTE: Pruning of precollected items is disabled to ensure the sphere log matches starting_items
        # in the exported rules.json. The original pruning logic would remove unnecessary precollected items,
        # but this causes mismatches in frontend testing where starting_items lists all precollected items.
        removed_precollected: List["Item"] = []
        # for player_id in multiworld.player_ids:
        #     if player_id in multiworld.precollected_items:
        #         player_precollected = multiworld.precollected_items[player_id]
        #         for item in player_precollected[:]:  # Iterate over a copy
        #             if not item.advancement:
        #                 continue
        #             player_precollected.remove(item)
        #             multiworld.state.remove(item)
        #             if not multiworld.can_beat_game():
        #                 multiworld.push_precollected(item)
        #             else:
        #                 removed_precollected.append(item)
        
        # Final sphere calculation pass
        required_locations = {loc for sphere_set in initial_collection_spheres for loc in sphere_set}
        
        # Initialize current_playthrough_state for logging
        current_playthrough_state = CollectionState(multiworld)
        for p_id in current_playthrough_state.prog_items:
            current_playthrough_state.prog_items[p_id].clear()
        current_playthrough_state.advancements.clear()
        current_playthrough_state.locations_checked.clear()

        if spoiler_log_file_handler:
            # Collect precollected items into the state
            precollected_advancement_items = sorted(
                [item for p_items in multiworld.precollected_items.values() for item in p_items if item.advancement],
                key=lambda item: (item.player, item.name)
            )

            for item in precollected_advancement_items:
                current_playthrough_state.collect(item, True)  # Collect into the accumulating state, prevent sweep

            # Log the final "sphere 0" state (contains all precollected items)
            log_sphere_details(spoiler_log_file_handler, multiworld, 0, set(), current_playthrough_state.copy(), verbose_sphere_log, extend_sphere_log_to_all_locations)
        
        if not spoiler_log_file_handler:
            # If not logging, ensure state includes precollected items for main loop
            current_playthrough_state = CollectionState(multiworld)

        # This is the list that will store the final spheres for the text spoiler output
        final_collection_spheres: List[Set["Location"]] = []
        main_sphere_index_counter = 0

        while required_locations:
            main_sphere_index_counter += 1
            current_full_sphere_locations = {loc for loc in required_locations if current_playthrough_state.can_reach(loc)}

            if not current_full_sphere_locations and required_locations:
                raise RuntimeError(f'Not all required items reachable. Unreachable locations: {required_locations}')

            # Sort locations in the sphere for deterministic item collection order
            sorted_locations_in_sphere = sorted(list(current_full_sphere_locations), key=lambda loc: (loc.player, loc.name))

            item_sub_index = 0
            for location in sorted_locations_in_sphere:
                # Collect one item
                current_playthrough_state.collect(location.item, True, location)
                item_sub_index += 1
                
                # Log after this single item
                if spoiler_log_file_handler and log_fractional_sphere_details:
                    sub_sphere_label = f"{main_sphere_index_counter - 1}.{item_sub_index}"
                    log_sphere_details(spoiler_log_file_handler, multiworld,
                                     sub_sphere_label,
                                     {location},  # The single location collected in this sub-step
                                     current_playthrough_state.copy(),
                                     verbose_sphere_log,
                                     extend_sphere_log_to_all_locations)

            # After all items in the current_full_sphere_locations are processed individually:
            final_collection_spheres.append(current_full_sphere_locations)

            # Log the state for the full sphere
            if spoiler_log_file_handler and log_integer_sphere_details:
                log_sphere_details(spoiler_log_file_handler, multiworld,
                                 main_sphere_index_counter,  # Integer index for the full sphere
                                 current_full_sphere_locations,  # All locations making up this sphere
                                 current_playthrough_state.copy(),  # State AFTER all items in this sphere are collected
                                 verbose_sphere_log,
                                 extend_sphere_log_to_all_locations)
            
            logging.debug('Calculated final sphere %i, containing %i of %i progress items.', 
                          main_sphere_index_counter, len(current_full_sphere_locations), len(required_locations))

            required_locations -= current_full_sphere_locations
        
        # Populate spoiler.playthrough for the text spoiler using final_collection_spheres
        spoiler.playthrough = {"0": sorted([spoiler.multiworld.get_name_string_for_object(item) for player_items in
                                         multiworld.precollected_items.values() for item in player_items if item.advancement])}
        for i, sphere_content in enumerate(final_collection_spheres):
            spoiler.playthrough[str(i + 1)] = {
                str(location): str(location.item) for location in sorted(list(sphere_content))}

        if create_paths:
            spoiler.create_paths(current_playthrough_state, final_collection_spheres)

    finally:
        if spoiler_log_file_handler:
            try:
                spoiler_log_file_handler.close()
                logging.info(f"Closed spoiler log file: {log_file_path}")
            except Exception as e:
                logging.error(f"Error closing spoiler log file {log_file_path}: {e}")

        # Reset state trackers
        _previous_fractional_state = None
        _previous_integer_state = None

        # Repair the multiworld
        for location, item in restore_later.items():
            location.item = item
        for item in removed_precollected:
            multiworld.push_precollected(item)

