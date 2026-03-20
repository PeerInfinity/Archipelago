"""
Worldgen and AST Explain Mixin for Universal Tracker

This mixin adds worldgen world integration and AST-based rule explanation
to TrackerCore. These features allow the tracker to explain rules for any
world that has exported JSON rules, not just worlds with native Rule Builder support.

Usage:
    from .worldgen_mixin import WorldgenMixin

    class TrackerCore(WorldgenMixin, BaseTrackerCore):
        pass
"""

import json
import logging
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from BaseClasses import CollectionState, MultiWorld
    from world_generator.json_world_builder import JSONWorldBuilder
    from worlds import AutoWorld


class WorldgenMixin:
    """
    Mixin that adds worldgen world integration and AST explain support to TrackerCore.

    This mixin provides:
    - Loading worldgen worlds from JSON rules for explain support
    - Direct AST-based rule explanation from JSON rules files
    - Auto-discovery of rules JSON based on game/seed name
    - Generation of worldgen worlds from rules JSON

    Required attributes from base class:
    - logger: logging.Logger
    - multiworld: Optional[MultiWorld]
    - player_id: Optional[int]
    - game: Optional[str]
    """

    # Worldgen world support attributes
    worldgen_builder: Optional["JSONWorldBuilder"] = None
    worldgen_world: Optional[Any] = None
    worldgen_multiworld: Optional["MultiWorld"] = None
    _tracking_from_worldgen: bool = False

    # Direct AST explain support attributes
    seed_name: Optional[str] = None
    generation_seed: Optional[int] = None
    rules_json_data: Optional[dict] = None
    rules_json_path: Optional[str] = None

    # Auto-worldgen option
    auto_generate_worldgen: bool = False

    def _init_worldgen_mixin(self):
        """Initialize worldgen mixin attributes. Call from __init__."""
        self.worldgen_builder = None
        self.worldgen_world = None
        self.worldgen_multiworld = None
        self._tracking_from_worldgen = False
        self.seed_name = None
        self.generation_seed = None
        self.rules_json_data = None
        self.rules_json_path = None
        self.auto_generate_worldgen = False

    def _disconnect_worldgen_mixin(self):
        """Clear worldgen mixin state. Call from disconnect."""
        self.worldgen_builder = None
        self.worldgen_world = None
        self.worldgen_multiworld = None
        self._tracking_from_worldgen = False
        self.seed_name = None
        self.generation_seed = None
        self.rules_json_data = None
        self.rules_json_path = None

    def load_worldgen_world(self, json_path: str, worldgen_game_name: Optional[str] = None) -> bool:
        """
        Load a worldgen world from JSON for rule explain support.

        This allows the tracker to explain rules for worlds that don't natively
        support Rule Builder by loading the corresponding _worldgen world.

        Args:
            json_path: Path to the JSON rules file
            worldgen_game_name: Optional override for worldgen world name.
                If None, derives from JSON metadata (e.g., "TUNIC" -> "TUNIC WorldGen")

        Returns:
            True if worldgen world was loaded successfully, False otherwise
        """
        try:
            from world_generator.json_world_builder import JSONWorldBuilder
            self.worldgen_builder = JSONWorldBuilder(json_path)
            self.worldgen_builder.load()
            self.worldgen_world = self.worldgen_builder.build_world(worldgen_game_name)
            self.worldgen_multiworld = self.worldgen_builder.multiworld
            self.logger.info(f"Loaded worldgen world for explain support: {worldgen_game_name or self.worldgen_builder.data.metadata.game_name}")
            return True
        except Exception as e:
            self.logger.warning(f"Failed to load worldgen world: {e}")
            self.worldgen_builder = None
            self.worldgen_world = None
            self.worldgen_multiworld = None
            return False

    def initialize_tracking_from_worldgen(self) -> bool:
        """
        Initialize tracking using the worldgen world.

        This method attempts to use an already-loaded worldgen world for tracking.
        The worldgen world must have been created via build_world() which runs
        the generation steps (create_regions, set_rules, etc.).

        Returns:
            True if tracking was initialized from worldgen, False otherwise
        """
        if not self.worldgen_multiworld or not self.worldgen_world:
            self.logger.debug("No worldgen world available for tracking")
            return False

        try:
            # Use worldgen multiworld for tracking
            self.multiworld = self.worldgen_multiworld
            self.player_id = 1
            self._tracking_from_worldgen = True

            # Clear precollected items with codes from the worldgen multiworld.
            # The worldgen world's build_world() runs generation steps that pre-collect
            # starting items. These items will be added via set_items_received() during
            # tracking, so we must clear them here to avoid double-counting.
            temp_precollect = {}
            for player_id, items in self.multiworld.precollected_items.items():
                temp_items = [item for item in items if item.code is None]
                temp_precollect[player_id] = temp_items
            self.multiworld.precollected_items = temp_precollect

            self.logger.info(
                f"Initialized tracking from worldgen world: {self.worldgen_world.game}"
            )
            return True

        except Exception as e:
            self.logger.warning(f"Failed to initialize tracking from worldgen: {e}")
            self._tracking_from_worldgen = False
            return False

    def generate_and_load_worldgen_world(self, json_path: str) -> bool:
        """
        Generate a worldgen world from a rules JSON file and load it.

        This runs the world generator to create Python files, then dynamically
        imports the new world and loads it for use by the tracker.

        Args:
            json_path: Path to the JSON rules file

        Returns:
            True if world was generated and loaded successfully, False otherwise
        """
        try:
            import importlib
            import sys
            from world_generator.generator import WorldGenerator
            from worlds import AutoWorld

            # Load JSON to get game name
            with open(json_path) as f:
                json_data = json.load(f)

            game_name = json_data.get('game_name', 'Unknown')

            # Include seed name in directory and game name for parallel-safe operation
            seed_suffix = f"_{self.seed_name}" if self.seed_name else ""
            worldgen_game_name = f"{game_name} WorldGen{seed_suffix}"

            # Derive output directory with seed-specific suffix
            game_directory = json_data.get('game_directory', game_name.lower().replace(' ', '_'))
            output_dir = Path('worlds') / f"{game_directory}_worldgen{seed_suffix}"
            module_name = output_dir.name

            self.logger.info(f"Generating worldgen world from {json_path}")

            # Run world generator to create/overwrite Python files
            generator = WorldGenerator(
                json_path=json_path,
                output_dir=str(output_dir),
                game_name=worldgen_game_name,
                force=True,
                canonical_seed=1,
            )
            generator.generate()

            self.logger.info(f"Generated world files in {output_dir}")

            # Check if module was previously imported
            full_module_name = f"worlds.{module_name}"
            if full_module_name in sys.modules:
                # Unregister the old world class before reloading
                if worldgen_game_name in AutoWorld.AutoWorldRegister.world_types:
                    self.logger.info(f"Unregistering existing '{worldgen_game_name}' before reload")
                    del AutoWorld.AutoWorldRegister.world_types[worldgen_game_name]

                # Delete submodules from sys.modules so they get reimported fresh.
                # Without this, importlib.reload() on the package __init__ would
                # reuse stale submodule data (e.g., location_table from a previous
                # generation with different options).
                for sub in ('Items', 'Locations', 'Regions', 'Rules', 'Options'):
                    sub_module = f"{full_module_name}.{sub}"
                    if sub_module in sys.modules:
                        del sys.modules[sub_module]

                # Reload the module to pick up the new code
                self.logger.info(f"Reloading module: {full_module_name}")
                importlib.reload(sys.modules[full_module_name])
            else:
                # Import the module for the first time
                self.logger.info(f"Importing new world module: {full_module_name}")
                importlib.import_module(full_module_name)

            # Verify the world was registered
            if worldgen_game_name not in AutoWorld.AutoWorldRegister.world_types:
                self.logger.error(f"World '{worldgen_game_name}' not found after import")
                return False

            self.logger.info(f"Successfully imported '{worldgen_game_name}'")

            # Now load the worldgen world using JSONWorldBuilder
            return self.load_worldgen_world(json_path, worldgen_game_name)

        except Exception as e:
            self.logger.warning(f"Failed to generate/load worldgen world: {e}")
            import traceback
            self.logger.debug(traceback.format_exc())
            return False

    def get_worldgen_world(self):
        """Get the worldgen world if loaded, for rule explain support."""
        return self.worldgen_world

    def get_worldgen_location(self, location_name: str):
        """
        Get a location from the worldgen world by name.

        Useful for getting explain support for locations in non-Rule Builder worlds.
        """
        if self.worldgen_multiworld and self.worldgen_world:
            try:
                return self.worldgen_multiworld.get_location(location_name, 1)
            except KeyError:
                return None
        return None

    def explain_location_rule(self, location_name: str, state: "CollectionState") -> Optional[list]:
        """
        Explain a location's access rule, using worldgen world if available.

        Tries to get explanation from:
        1. The main world's location (if it has explain_json)
        2. The worldgen world's location (if loaded and has explain_json)
        3. Direct AST explain from rules JSON

        Args:
            location_name: Name of the location to explain
            state: Current collection state

        Returns:
            List of JSONMessagePart, or None if no explanation available
        """
        # Try main world first
        if self.multiworld and self.player_id:
            try:
                location = self.multiworld.get_location(location_name, self.player_id)
                if hasattr(location.access_rule, 'explain_json'):
                    return location.access_rule.explain_json(state)
            except KeyError:
                pass

        # Fall back to worldgen world
        if self.worldgen_multiworld:
            try:
                wg_location = self.worldgen_multiworld.get_location(location_name, 1)
                if hasattr(wg_location.access_rule, 'explain_json'):
                    wg_state = self.worldgen_multiworld.state if self.worldgen_multiworld.state else state
                    return wg_location.access_rule.explain_json(wg_state)
            except KeyError:
                pass

        # Fall back to direct AST explain from rules JSON
        if self.rules_json_data:
            return self._explain_from_rules_json(location_name, state)

        return None

    def _explain_from_rules_json(self, location_name: str, state: "CollectionState") -> Optional[list]:
        """
        Explain a location's access rule directly from loaded rules JSON.

        This works without needing the worldgen world - just the rules JSON file.
        """
        if not self.rules_json_data:
            return None

        try:
            from rule_builder.ast_explain import explain_ast_rule

            # Find the location's access rule in the JSON
            regions = self.rules_json_data.get('regions', {})
            for region_name, region_data in regions.items():
                locations = region_data.get('locations', {})
                if location_name in locations:
                    loc_data = locations[location_name]
                    access_rule = loc_data.get('access_rule')
                    if access_rule:
                        player_id = self.player_id or 1
                        return explain_ast_rule(access_rule, state, player_id)
                    else:
                        # No rule means always accessible
                        return [{"text": "Always accessible", "type": "text"}]

            # Location not found in JSON
            return None
        except Exception as e:
            self.logger.warning(f"Failed to explain rule from JSON: {e}")
            return None

    def set_seed_name(self, seed_name: str):
        """Set the seed name (from RoomInfo) for auto-discovery."""
        self.seed_name = seed_name

    def _validate_rules_json(self, json_path: str) -> bool:
        """
        Validate that a rules JSON file matches the expected game and seed.

        Args:
            json_path: Path to the JSON rules file

        Returns:
            True if the file matches game and seed, False otherwise
        """
        try:
            with open(json_path) as f:
                data = json.load(f)

            json_game_name = data.get('game_name')
            json_seed_name = data.get('seed_name')

            # Validate game name
            if json_game_name and json_game_name != self.game:
                self.logger.debug(
                    f"Rules JSON game mismatch: expected '{self.game}', got '{json_game_name}' in {json_path}"
                )
                return False

            # Validate seed name (if present in the JSON)
            if json_seed_name and self.seed_name and str(json_seed_name) != str(self.seed_name):
                self.logger.debug(
                    f"Rules JSON seed mismatch: expected '{self.seed_name}', got '{json_seed_name}' in {json_path}"
                )
                return False

            return True
        except Exception as e:
            self.logger.debug(f"Failed to validate rules JSON {json_path}: {e}")
            return False

    def auto_discover_rules_json(self) -> bool:
        """
        Auto-discover and load the rules JSON file based on game name and seed name.

        Searches for rules files in multiple locations (in order):
        1. frontend/presets/{world_directory}_worldgen/AP_{seed_name}/ - worldgen presets
        2. frontend/presets/{world_directory}/AP_{seed_name}/ - original presets
        3. output/ directory - default generation output (extracted ZIP)
        4. User data directory (~/.local/share/Archipelago/ on Linux)

        Each candidate file is validated to ensure game_name and seed_name match
        before being accepted. If validation fails, the search continues.

        Returns:
            True if rules were loaded successfully, False otherwise
        """
        self._log_debug("auto_discover_rules_json", {"game": self.game, "seed_name": self.seed_name})
        if not self.game or not self.seed_name:
            self.logger.debug("Cannot auto-discover: game or seed_name not set")
            return False

        from Utils import user_path, output_path

        # Get project root (TrackerCore is in worlds/tracker/)
        project_root = Path(__file__).parent.parent.parent

        # Try to load world mapping for game -> directory conversion
        world_mapping_path = project_root / "scripts" / "data" / "world-mapping.json"
        world_directory = None

        if world_mapping_path.exists():
            try:
                with open(world_mapping_path) as f:
                    world_mapping = json.load(f)
                if self.game in world_mapping:
                    world_directory = world_mapping[self.game].get('world_directory')
            except Exception as e:
                self.logger.debug(f"Failed to load world mapping: {e}")

        # Fall back to deriving directory name from game name
        if not world_directory:
            world_directory = self.game.lower().replace(' ', '_').replace("'", "")

        # Build list of candidate paths
        seed_dir_name = f"AP_{self.seed_name}"
        rules_filename = f"AP_{self.seed_name}_rules.json"

        candidates = []

        # 1. WorldGen preset directory
        worldgen_preset_path = project_root / "frontend" / "presets" / f"{world_directory}_worldgen" / seed_dir_name / rules_filename
        candidates.append(worldgen_preset_path)

        # 2. Original preset directory
        original_preset_path = project_root / "frontend" / "presets" / world_directory / seed_dir_name / rules_filename
        candidates.append(original_preset_path)

        # 3. Output directory (extracted from ZIP)
        output_dir_path = Path(output_path()) / rules_filename
        candidates.append(output_dir_path)

        # 4. User data directory
        user_dir_path = Path(user_path()) / rules_filename
        candidates.append(user_dir_path)

        # Try each candidate
        for candidate in candidates:
            if candidate.exists():
                self.logger.debug(f"Found rules JSON candidate: {candidate}")
                if self._validate_rules_json(str(candidate)):
                    if self.load_rules_json(str(candidate)):
                        self.logger.info(f"Auto-discovered and loaded rules from: {candidate}")
                        return True
                else:
                    self.logger.debug(f"Validation failed for: {candidate}")

        self.logger.debug(f"No matching rules JSON found for {self.game} / {self.seed_name}")
        return False

    def load_rules_json(self, json_path: str) -> bool:
        """
        Load a rules JSON file for direct AST explain support.

        This allows explaining rules without generating a full worldgen world.

        Args:
            json_path: Path to the JSON rules file

        Returns:
            True if loaded successfully, False otherwise
        """
        try:
            with open(json_path) as f:
                self.rules_json_data = json.load(f)
            self.rules_json_path = json_path

            # Extract generation seed if present
            self.generation_seed = self.rules_json_data.get('generation_seed')

            self.logger.info(f"Loaded rules JSON from: {json_path}")
            self._log_debug("load_rules_json", {
                "path": json_path,
                "game_name": self.rules_json_data.get('game_name'),
                "seed": self.generation_seed
            })
            return True
        except Exception as e:
            self.logger.warning(f"Failed to load rules JSON: {e}")
            self.rules_json_data = None
            self.rules_json_path = None
            return False

    def _log_debug(self, event_type: str, data: dict):
        """Log a debug event if debug logger is configured."""
        if hasattr(self, '_debug_logger') and self._debug_logger:
            self._debug_logger(event_type, data)
