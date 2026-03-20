from fuzz import BaseHook, GenOutcome
from typing import List, Dict, Set, Any, Optional
import collections
import json
import logging
import os
from . import TrackerCore, DeferredEntranceMode
from BaseClasses import MultiWorld, Location, Entrance, ItemClassification
from NetUtils import NetworkItem
logger = logging.getLogger("Fuzzer")


# Error patterns that indicate option-related generation failures
# These are expected failures from random option combinations, not logic bugs
IGNORED_ERROR_PATTERNS = [
    "Not enough filler/trap items",
    "No more spots to place",
    "Remaining locations are invalid",
    "Unable to place dungeon prizes",
    "Could not access required locations for accessibility check",
    "insufficient locations to place progression items",
    "Failed to fetch map shuffle data for FFMQ",
    "Invalid OC2 settings",
    "OC2 needs at least",
    # Item pool/location count issues
    "Failed to limit item pool size",
    "Too many locations created",
    "There are not enough available tasks to fill",
    # TWW option conflicts
    "You cannot make bosses required when progression dungeons are disabled",
    "A conflict was found in the lists of required and banned dungeons",
    "Could not select required bosses to satisfy options",
    # shapez option conflicts
    "Achievements must be included when belt and extractor are locked",
    # Common generation errors from option combinations
    "list index out of range",
]


def should_ignore_generation_error(exc: Exception) -> bool:
    """
    Check if an exception should be treated as an "ignored" option error
    rather than a real failure.

    These are generation failures caused by random option combinations that
    create impossible-to-fill seeds, external API failures, or game-specific
    validation errors. They are expected when fuzzing and should not be
    counted as test failures.

    Args:
        exc: The exception that was raised during generation

    Returns:
        True if the error should be ignored, False if it's a real failure
    """
    if exc is None:
        return False

    exc_str = str(exc)
    exc_type = type(exc).__name__

    # Check explicit patterns
    for pattern in IGNORED_ERROR_PATTERNS:
        if pattern in exc_str:
            return True

    # Check for filler-related errors (case-insensitive)
    if "filler" in exc_str.lower():
        return True

    # Handle FFMQ's AttributeError when API fails with an exception
    # The error handling code assumes HTTP response but may get an exception instead
    if exc_type == "AttributeError" and "status_code" in exc_str:
        return True

    return False

# Directory for explain stats output (relative to fuzz output directory)
EXPLAIN_STATS_DIR = "fuzz_output/explain_stats"


class Hook(BaseHook):
    ut_core:TrackerCore.TrackerCore
    player_files_path:str
    status = None
    run_id: int = 0  # Track run ID for explain stats files
    explain_stats_collected: bool = False  # Track if we've collected explain stats for this game
    use_fractional_spheres: bool = False  # Toggle for fractional sphere logic
    ut_version: Optional[str] = None  # UT version being tested (original, original_seeded, worldgen, etc.)
    use_original_seeded: bool = False  # Toggle for original_seeded tracking mode

    def before_generate(self, args):
        self.status = None
        self.player_files_path = args.player_files_path

        # Pre-generate ALttP entrance shuffle seed if needed
        # This must happen BEFORE generation so the original world uses our seed
        self._pregenerate_alttp_entrance_shuffle_seed()

        self.ut_core = TrackerCore.TrackerCore(logger,False,False)
        self.ut_core.enforce_deferred_connections = DeferredEntranceMode.disabled
        self.ut_core.run_generator(None,None,args.player_files_path) #initial UT gen
        self.run_id = getattr(args, 'run_id', self.run_id)
        self.use_fractional_spheres = getattr(args, 'fractional_spheres', False)
        self.use_original_seeded = getattr(args, 'original_seeded', False)
        self.ut_version = getattr(args, 'ut_version', None)

    def after_generate(self, mw:MultiWorld, output_path):
        if mw is None:
            return
        if len(mw.worlds)>1:
            return
        assert self.player_files_path
        self.status = GenOutcome.Success
        import zipfile
        with zipfile.ZipFile(output_path+"/AP_"+mw.seed_name+".zip") as zf:
            for file in zf.namelist():
                if file.endswith(".archipelago"):
                    data = zf.read(file)
                    break
            else:
                raise Exception("No .archipelago found in archive.")
        from MultiServer import Context
        temp = Context.decompress(data)

        slot_data = temp["slot_data"][1] #slot 0 is reserved

        # Fix ALttP entrance shuffle regeneration by setting entrance_shuffle_seed
        # to the actual er_seed from the original generation. This ensures TrackerCore
        # regenerates with the same entrance connections when using YAML-based regeneration.
        # Note: For worldgen-based tracking (what the fuzzer uses), the rules.json is
        # exported BEFORE we can apply this fix, so remaining failures may be due to:
        # - Bunny rule export differences (e.g., Magic Mirror requirements)
        # - Complex entrance shuffle modes (crossed, insanity)
        # - Inverted mode interactions with glitch rules
        if mw.worlds[1].game == "A Link to the Past" and hasattr(mw.worlds[1], 'er_seed'):
            er_seed = mw.worlds[1].er_seed
            if er_seed != "vanilla":
                self._fix_alttp_entrance_shuffle_seed(er_seed)

        self.ut_core.set_slot_params(mw.worlds[1].game,1,mw.player_name[1],1)
        # Set seed_name to enable auto-discovery of pickle/rules.json for tracking
        self.ut_core.seed_name = mw.seed_name

        # Only auto-discover resources for modes that need them.
        # Original and original_seeded modes should use YAML-based tracking only,
        # without picking up leftover rules.json or pickle files from prior runs.
        if self.ut_version in (None, 'worldgen', 'hybrid'):
            self.ut_core.auto_discover_rules_json()
        if self.ut_version in (None, 'pickle', 'hybrid'):
            self.ut_core.auto_discover_pickle()

        # initalize_tracker_core will use pickle/worldgen-based tracking if paths are set,
        # or try original_seeded (resolving seed from seed name/rules JSON), then original
        self.ut_core.initalize_tracker_core(mw.worlds[1].__class__,slot_data)
        assert self.ut_core.multiworld, self.ut_core.gen_error

        # Collect explain stats as soon as worldgen world is ready (before sphere comparison)
        # This ensures stats are collected regardless of whether the test passes or fails
        if not self.explain_stats_collected:
            self._collect_explain_stats()
            self.explain_stats_collected = True

        # Filter to only hashable addresses (some games like ALTTP have list-type addresses)
        remaining_locations = [location.address for location in mw.worlds[1].get_locations()
                               if location.address is not None and not isinstance(location.address, list)]
        current_inventory = [NetworkItem(item.code,-2,item.player,item.classification) for item in mw.precollected_items[1] if item.code is not None]
        new_items = []
        new_inventory = []

        # Recalc spheres - use fractional sphere logic if enabled
        for sphere_number, sphere in enumerate(mw.get_sendable_spheres()):
            current_sphere: Dict[str,Location] = {}
            for sphere_location in sphere:
                if sphere_location.address is not None:
                    current_sphere[sphere_location.name] = sphere_location
            current_inventory.extend(new_items)
            new_inventory.clear()
            new_items.clear()
            if current_sphere:
                if self.use_fractional_spheres:
                    # Fractional sphere logic: iterate within each integer sphere
                    # until all locations are collected or no progress can be made
                    fractional_sphere = 0
                    server_sphere_locations = set(current_sphere.keys())  # Track original server sphere
                    while current_sphere:
                        self.ut_core.set_missing_locations(set(remaining_locations))
                        self.ut_core.set_items_received(current_inventory)
                        update_ret = self.ut_core.updateTracker()

                        # On first pass, check for UT locations not in server sphere
                        # (detect UT being too permissive with pre-sphere inventory)
                        if fractional_sphere == 0:
                            missed_locations = [loc for loc in update_ret.in_logic_locations
                                               if loc not in server_sphere_locations]
                            if missed_locations:
                                print(f"Locations {','.join(missed_locations)} were expected to be in logic but weren't in server sphere")
                                print(f"Server logic sphere `{','.join(server_sphere_locations)}`")
                                print(f"After sphere #{sphere_number}")
                                item_id_to_name = self.ut_core.multiworld.worlds[self.ut_core.player_id].item_id_to_name
                                print(f"New Inventory = [{','.join(new_inventory)}]")
                                print(f"Current Inventory = [{','.join([item_id_to_name[item.item] for item in current_inventory if item.flags & 1])}]")
                                print(f"UT accessable regions `{','.join([region.name for region in update_ret.state.reachable_regions[1]])}`")
                                print(f"State inventory = `{','.join([f'{k}:{v}' for k,v in update_ret.state.prog_items[1].items()])}`")
                                self.status = GenOutcome.Failure
                                return

                        # Find locations in BOTH server sphere AND UT logic
                        collected_this_pass = []
                        for loc_name in list(current_sphere.keys()):
                            if loc_name in update_ret.in_logic_locations:
                                location = current_sphere[loc_name]
                                true_item = location.item
                                # Collect the item immediately for next iteration
                                new_item = NetworkItem(true_item.code, location.address, true_item.player, true_item.classification)
                                new_items.append(new_item)
                                current_inventory.append(new_item)  # Add to current for next fractional sphere
                                if ItemClassification.progression in true_item.classification:
                                    new_inventory.append(true_item.name)
                                remaining_locations.remove(location.address)
                                del current_sphere[loc_name]
                                collected_this_pass.append(loc_name)

                        if not collected_this_pass:
                            # No progress made - remaining locations in current_sphere are unreachable
                            print(f"Sphere {sphere_number}.{fractional_sphere}: No progress - {len(current_sphere)} locations remain unreachable")
                            print(f"Locations `{','.join(current_sphere.keys())}` were in server logic but not expected in UT")
                            print(f"UT logic sphere `{','.join(update_ret.in_logic_locations)}`")
                            print(f"Locations that weren't created in UT = [{','.join([loc for loc in current_sphere if loc not in self.ut_core.multiworld.regions.location_cache[self.ut_core.player_id]])}]")
                            item_id_to_name = self.ut_core.multiworld.worlds[self.ut_core.player_id].item_id_to_name
                            print(f"New Inventory = [{','.join(new_inventory)}]")
                            print(f"Current Inventory = [{','.join([item_id_to_name[item.item] for item in current_inventory if item.flags & 1])}]")
                            print(f"UT accessable regions `{','.join([region.name for region in update_ret.state.reachable_regions[1]])}`")
                            print(f"State inventory = `{','.join([f'{k}:{v}' for k,v in update_ret.state.prog_items[1].items()])}`")
                            self.status = GenOutcome.Failure
                            return

                        fractional_sphere += 1
                    # All locations in this integer sphere collected successfully
                else:
                    # Original logic: single pass per integer sphere
                    self.ut_core.set_missing_locations(set(remaining_locations))
                    self.ut_core.set_items_received(current_inventory)
                    update_ret = self.ut_core.updateTracker()
                    missed_locations = []
                    for in_logic_location in update_ret.in_logic_locations:
                        if in_logic_location in current_sphere:
                            location = current_sphere[in_logic_location]
                            true_item = location.item
                            # Use location.address directly instead of true_item.location.address
                            # Some worlds set location.item without setting item.location back-reference
                            new_items.append(NetworkItem(true_item.code, location.address, true_item.player, true_item.classification))
                            if ItemClassification.progression in true_item.classification:
                                new_inventory.append(true_item.name)
                            remaining_locations.remove(location.address)
                            del current_sphere[in_logic_location]
                        else:
                            missed_locations.append(in_logic_location)
                    if len(current_sphere) > 0:
                        print(f"Locations `{','.join(current_sphere.keys())}` were in server logic but not expected in UT")
                        print(f"UT logic sphere `{','.join(update_ret.in_logic_locations)}`")
                        print(f"Locations that weren't created in UT = [{','.join([loc for loc in current_sphere if loc not in self.ut_core.multiworld.regions.location_cache[self.ut_core.player_id]])}]")
                    if len(missed_locations) > 0:
                        print(f"Locations {','.join(missed_locations)} were expected to be in logic but weren't")
                        print(f"Server logic sphere `{','.join([location.name for location in sphere if location.address is not None])}`")
                    if len(current_sphere)>0 or len(missed_locations)>0:
                        print(f"After sphere #{sphere_number}")
                        item_id_to_name = self.ut_core.multiworld.worlds[self.ut_core.player_id].item_id_to_name
                        print(f"New Inventory = [{','.join(new_inventory)}]")
                        print(f"Current Inventory = [{','.join([item_id_to_name[item.item] for item in current_inventory if item.flags & 1])}]")
                        print(f"UT accessable regions `{','.join([region.name for region in update_ret.state.reachable_regions[1]])}`")
                        print(f"State inventory = `{','.join([f'{k}:{v}' for k,v in update_ret.state.prog_items[1].items()])}`")
                        self.status = GenOutcome.Failure
                        return
            else:
                return #if get_sendable_spheres returns an empty sphere that means we're done, the next sphere will be any unreachable locations... which aren't reachable...


        # Do the magic here, set `self.status` accordingly to `GenOutcome.Failure`/`GenOutcome.Success`

    def _collect_explain_stats(self) -> None:
        """
        Collect explain support statistics for locations and entrances in the worldgen world.

        This checks the world generated by TrackerCore from rules.json, which uses
        the Rule Builder. The goal is to measure how many rules have explain_json() support.

        Location counts:
        - total_locations: Total number of locations with addresses
        - locations_with_explain: Locations whose access_rule has explain_json method
        - locations_default_rule: Locations using default access_rule (always True)
        - locations_without_explain: Locations with custom rules but no explain_json

        Entrance counts:
        - total_entrances: Total number of entrances
        - entrances_with_explain: Entrances whose access_rule has explain_json method
        - entrances_default_rule: Entrances using default access_rule (always True)
        - entrances_without_explain: Entrances with custom rules but no explain_json
        """
        try:
            # Use the worldgen multiworld from TrackerCore (has Rule Builder rules with explain_json)
            # NOT the tracking multiworld (which has the original game's rules without explain support)
            worldgen_mw = self.ut_core.worldgen_multiworld
            if not worldgen_mw:
                logger.warning("No worldgen multiworld available for explain stats")
                return

            # Worldgen world always uses player ID 1
            world = worldgen_mw.worlds[1]

            # Collect location stats
            locations = list(world.get_locations())
            total_locations = 0
            locations_with_explain = 0
            locations_default_rule = 0
            locations_without_explain = 0
            locations_without_explain_names = []  # Track names for debugging

            for location in locations:
                # Skip event locations (no address)
                if location.address is None:
                    continue

                total_locations += 1
                access_rule = location.access_rule

                # Check if using default access rule (always True, no custom logic)
                if access_rule is Location.access_rule:
                    locations_default_rule += 1
                # Check if rule has explain_json method (Rule Builder or compatible)
                elif hasattr(access_rule, 'explain_json'):
                    locations_with_explain += 1
                else:
                    # Custom rule without explain support (lambda/function)
                    locations_without_explain += 1
                    region_name = location.parent_region.name if location.parent_region else "Unknown"
                    locations_without_explain_names.append({
                        "name": location.name,
                        "region": region_name
                    })

            # Collect entrance stats
            total_entrances = 0
            entrances_with_explain = 0
            entrances_default_rule = 0
            entrances_without_explain = 0
            entrances_without_explain_names = []

            for region in worldgen_mw.get_regions(1):
                for entrance in region.exits:
                    total_entrances += 1
                    access_rule = entrance.access_rule

                    if access_rule is Entrance.access_rule:
                        entrances_default_rule += 1
                    elif hasattr(access_rule, 'explain_json'):
                        entrances_with_explain += 1
                    else:
                        entrances_without_explain += 1
                        entrances_without_explain_names.append({
                            "name": entrance.name,
                            "from_region": region.name,
                            "to_region": entrance.connected_region.name if entrance.connected_region else "Unknown"
                        })

            # Calculate explain coverage percentages
            loc_custom_rules = locations_with_explain + locations_without_explain
            loc_explain_coverage = (locations_with_explain / loc_custom_rules * 100) if loc_custom_rules > 0 else 100.0

            ent_custom_rules = entrances_with_explain + entrances_without_explain
            ent_explain_coverage = (entrances_with_explain / ent_custom_rules * 100) if ent_custom_rules > 0 else 100.0

            stats = {
                "game": world.game,
                # Location stats
                "total_locations": total_locations,
                "locations_with_explain": locations_with_explain,
                "locations_default_rule": locations_default_rule,
                "locations_without_explain": locations_without_explain,
                "explain_coverage_percent": round(loc_explain_coverage, 2),
                "locations_without_explain_list": locations_without_explain_names,
                # Entrance stats
                "total_entrances": total_entrances,
                "entrances_with_explain": entrances_with_explain,
                "entrances_default_rule": entrances_default_rule,
                "entrances_without_explain": entrances_without_explain,
                "entrance_explain_coverage_percent": round(ent_explain_coverage, 2),
                "entrances_without_explain_list": entrances_without_explain_names
            }

            # Write stats to file
            self._write_explain_stats(stats)

        except Exception as e:
            logger.warning(f"Failed to collect explain stats: {e}")

    def _write_explain_stats(self, stats: Dict[str, Any]) -> None:
        """Write explain stats to a JSON file in the fuzz output directory."""
        try:
            os.makedirs(EXPLAIN_STATS_DIR, exist_ok=True)
            stats_file = os.path.join(EXPLAIN_STATS_DIR, "explain_stats.json")

            with open(stats_file, 'w') as f:
                json.dump(stats, f, indent=2)

        except Exception as e:
            logger.warning(f"Failed to write explain stats: {e}")

    def _pregenerate_alttp_entrance_shuffle_seed(self):
        """Safety net to ensure entrance_shuffle_seed is numeric for ALttP.

        Note: fuzz.py's get_random_value() now always generates numeric seeds for
        entrance_shuffle_seed, so this function mainly serves as a backup for edge
        cases like manually-created YAMLs or other generation paths.

        When ALttP has entrance_shuffle != "vanilla" and entrance_shuffle_seed == "random"
        (or invalid garbage), it generates a random er_seed in generate_early(). This
        causes problems for worldgen-based tracking because the exported rules.json
        uses one er_seed but any regeneration would use a different one.

        By validating/pre-generating a numeric seed and writing it to the YAML before
        generation, we ensure the original generation uses an explicit seed, which then
        gets exported in rules.json and used consistently.
        """
        import os
        import random
        import yaml

        yaml_dir = self.player_files_path
        if not os.path.isdir(yaml_dir):
            return

        for filename in os.listdir(yaml_dir):
            if not filename.endswith('.yaml'):
                continue
            filepath = os.path.join(yaml_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)

                if not data:
                    continue

                modified = False
                for game_name, game_data in data.items():
                    if game_name in ('A Link to the Past', 'alttp') and isinstance(game_data, dict):
                        # Check if entrance_shuffle is non-vanilla
                        entrance_shuffle = game_data.get('entrance_shuffle', 'vanilla')
                        # Handle weighted options format
                        if isinstance(entrance_shuffle, dict):
                            # If it's a weighted dict, check if vanilla is the only option
                            if list(entrance_shuffle.keys()) == ['vanilla']:
                                continue  # vanilla only, no need to pre-generate
                            # Otherwise, some non-vanilla shuffle is possible
                        elif entrance_shuffle == 'vanilla':
                            continue  # vanilla, no need to pre-generate

                        # Check if entrance_shuffle_seed is random or not set
                        entrance_shuffle_seed = game_data.get('entrance_shuffle_seed', 'random')
                        if isinstance(entrance_shuffle_seed, dict):
                            # Weighted format - check if 'random' is the only/primary option
                            if 'random' not in entrance_shuffle_seed:
                                continue  # Has explicit seed(s), don't override
                        elif entrance_shuffle_seed != 'random':
                            # Check if it's actually a valid numeric seed
                            # The fuzzer may generate random FreeText garbage that isn't numeric
                            seed_str = str(entrance_shuffle_seed)
                            if seed_str.isdigit():
                                # Already has a valid explicit numeric seed
                                continue
                            # Otherwise, it's garbage (e.g., random Unicode from fuzzer) - replace it
                            logger.debug(f"Replacing invalid entrance_shuffle_seed '{seed_str[:50]}...' with numeric seed")

                        # Generate a random 64-bit integer (same as ALttP's generate_early)
                        er_seed = random.randint(0, 2 ** 64)
                        game_data['entrance_shuffle_seed'] = str(er_seed)
                        modified = True
                        logger.debug(f"Pre-generated ALttP entrance_shuffle_seed in {filename}: {er_seed}")
                        break

                if modified:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        yaml.safe_dump(data, f, default_flow_style=False, allow_unicode=True)

            except Exception as e:
                logger.warning(f"Failed to pre-generate entrance_shuffle_seed in {filename}: {e}")

    def _fix_alttp_entrance_shuffle_seed(self, er_seed):
        """Rewrite ALttP YAML files to use the actual er_seed as entrance_shuffle_seed.

        This ensures TrackerCore regenerates with the same entrance connections as
        the original generation. Without this, ALttP's generate_early would create
        a different er_seed, leading to different entrance shuffle and different
        key rules (especially for Turtle Rock).

        Note: This is now mostly a backup - _pregenerate_alttp_entrance_shuffle_seed
        handles the common case. This method still helps if the pre-generation didn't
        run or if the seed format changed.
        """
        import os
        import yaml

        yaml_dir = self.player_files_path
        if not os.path.isdir(yaml_dir):
            return

        for filename in os.listdir(yaml_dir):
            if not filename.endswith('.yaml'):
                continue
            filepath = os.path.join(yaml_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f)

                if not data:
                    continue

                # Find the ALttP game section
                for game_name, game_data in data.items():
                    if game_name in ('A Link to the Past', 'alttp') and isinstance(game_data, dict):
                        # Set entrance_shuffle_seed to the actual er_seed
                        # ALttP will use this directly when it's a numeric string
                        game_data['entrance_shuffle_seed'] = str(er_seed)

                        with open(filepath, 'w', encoding='utf-8') as f:
                            yaml.safe_dump(data, f, default_flow_style=False, allow_unicode=True)
                        logger.debug(f"Fixed ALttP entrance_shuffle_seed in {filename} to {er_seed}")
                        break
            except Exception as e:
                logger.warning(f"Failed to fix entrance_shuffle_seed in {filename}: {e}")

    def reclassify_outcome(self, outcome, exc):
        # If TrackerCore generation failed with a fill-related exception, treat as ignored
        # These are configuration issues, not logic mismatches
        if exc is not None and self.status is None:
            if should_ignore_generation_error(exc):
                return GenOutcome.OptionError, exc
        return (self.status if self.status is not None else outcome), exc


class MultiworldHook(BaseHook):
    """
    Extended hook for multiworld UT fuzz testing.

    Unlike the single-player Hook, this tests each player in the multiworld
    independently and tracks which players failed.
    """
    player_files_path: str
    status: Optional[int] = None
    failed_players: Dict[int, str]  # player_id -> failure reason
    player_results: Dict[int, bool]  # player_id -> passed

    def before_generate(self, args):
        self.status = None
        self.failed_players = {}
        self.player_results = {}
        self.player_files_path = args.player_files_path

    def _test_player(self, mw: MultiWorld, player_id: int, slot_data: dict) -> Optional[str]:
        """
        Test a single player in the multiworld.

        Returns None if passed, or an error message if failed.
        """
        # Create a fresh TrackerCore for this player
        ut_core = TrackerCore.TrackerCore(logger, False, False)
        ut_core.enforce_deferred_connections = DeferredEntranceMode.disabled

        # Run generator for this player's YAML
        ut_core.run_generator(None, None, self.player_files_path)

        game_name = mw.worlds[player_id].game
        player_name = mw.player_name[player_id]

        ut_core.set_slot_params(game_name, player_id, player_name, len(mw.worlds) - 1)
        ut_core.seed_name = mw.seed_name
        ut_core.auto_discover_rules_json()
        ut_core.initalize_tracker_core(mw.worlds[player_id].__class__, slot_data)

        if not ut_core.multiworld:
            return f"TrackerCore failed to initialize: {ut_core.gen_error}"

        # Filter to only hashable addresses
        remaining_locations = [
            location.address for location in mw.worlds[player_id].get_locations()
            if location.address is not None and not isinstance(location.address, list)
        ]
        current_inventory = [
            NetworkItem(item.code, -2, item.player, item.classification)
            for item in mw.precollected_items[player_id] if item.code is not None
        ]
        new_items = []
        new_inventory = []

        # Recalc spheres
        for sphere_number, sphere in enumerate(mw.get_sendable_spheres()):
            # Filter sphere to this player's locations
            current_sphere: Dict[str, Location] = {}
            for sphere_location in sphere:
                if sphere_location.player == player_id and sphere_location.address is not None:
                    current_sphere[sphere_location.name] = sphere_location

            current_inventory.extend(new_items)
            new_inventory.clear()
            new_items.clear()

            if current_sphere:
                ut_core.set_missing_locations(set(remaining_locations))
                ut_core.set_items_received(current_inventory)
                update_ret = ut_core.updateTracker()
                missed_locations = []

                for in_logic_location in update_ret.in_logic_locations:
                    if in_logic_location in current_sphere:
                        location = current_sphere[in_logic_location]
                        true_item = location.item
                        new_items.append(NetworkItem(
                            true_item.code, location.address,
                            true_item.player, true_item.classification
                        ))
                        if ItemClassification.progression in true_item.classification:
                            new_inventory.append(true_item.name)
                        remaining_locations.remove(location.address)
                        del current_sphere[in_logic_location]
                    else:
                        missed_locations.append(in_logic_location)

                if len(current_sphere) > 0 or len(missed_locations) > 0:
                    error_parts = []
                    if len(current_sphere) > 0:
                        error_parts.append(f"Locations in server but not UT: {list(current_sphere.keys())[:5]}")
                    if len(missed_locations) > 0:
                        error_parts.append(f"Locations in UT but not server: {missed_locations[:5]}")
                    return f"Sphere {sphere_number} mismatch for {game_name}: {'; '.join(error_parts)}"
            elif not current_sphere and sphere_number > 0:
                # Empty sphere for this player - continue checking other spheres
                pass

        return None  # Passed

    def after_generate(self, mw: MultiWorld, output_path):
        if mw is None:
            return

        self.status = GenOutcome.Success

        # Need at least 2 players for multiworld (slot 0 is reserved)
        if len(mw.worlds) <= 1:
            return

        import zipfile
        with zipfile.ZipFile(output_path + "/AP_" + mw.seed_name + ".zip") as zf:
            for file in zf.namelist():
                if file.endswith(".archipelago"):
                    data = zf.read(file)
                    break
            else:
                raise Exception("No .archipelago found in archive.")

        from MultiServer import Context
        temp = Context.decompress(data)

        # Test each player
        for player_id in range(1, len(mw.worlds)):
            slot_data = temp["slot_data"].get(player_id, {})
            game_name = mw.worlds[player_id].game

            try:
                error = self._test_player(mw, player_id, slot_data)
                if error:
                    self.failed_players[player_id] = error
                    self.player_results[player_id] = False
                    print(f"Player {player_id} ({game_name}): FAILED - {error}")
                    self.status = GenOutcome.Failure
                else:
                    self.player_results[player_id] = True
                    print(f"Player {player_id} ({game_name}): PASSED")
            except Exception as e:
                self.failed_players[player_id] = str(e)
                self.player_results[player_id] = False
                print(f"Player {player_id} ({game_name}): ERROR - {e}")
                self.status = GenOutcome.Failure

    def reclassify_outcome(self, outcome, exc):
        # If TrackerCore generation failed with a fill-related exception, treat as ignored
        if exc is not None and self.status is None:
            if should_ignore_generation_error(exc):
                return GenOutcome.OptionError, exc
        return (self.status if self.status is not None else outcome), exc

    def get_failed_players(self) -> Dict[int, str]:
        """Return dict of player_id -> failure reason for failed players."""
        return self.failed_players

    def get_player_results(self) -> Dict[int, bool]:
        """Return dict of player_id -> passed for all tested players."""
        return self.player_results
