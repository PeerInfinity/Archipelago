"""
Pickle Mixin for Universal Tracker

This mixin adds pickle-based multiworld loading to TrackerCore. It allows the
tracker to load a pre-generated multiworld directly from a gzip-compressed
dill pickle file, which preserves lambdas and functions in access rules.

This is an alternative to the worldgen mixin that:
- Is faster (no world generation needed)
- Preserves exact original lambdas (no AST conversion)
- Requires dill library for lambda serialization

Usage:
    from .pickle_mixin import PickleMixin

    class TrackerCore(PickleMixin, WorldgenMixin, BaseTrackerCore):
        pass
"""

import json
import logging
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from BaseClasses import MultiWorld


class PickleMixin:
    """
    Mixin that adds pickle-based multiworld loading to TrackerCore.

    This mixin provides:
    - Loading multiworld directly from pickle files
    - Auto-discovery of pickle files based on game/seed name
    - Faster initialization compared to worldgen mode

    Required attributes from base class:
    - logger: logging.Logger
    - multiworld: Optional[MultiWorld]
    - player_id: Optional[int]
    - game: Optional[str]
    - seed_name: Optional[str] (from WorldgenMixin or set separately)
    """

    # Pickle mode attributes
    pickle_multiworld: Optional["MultiWorld"] = None
    pickle_path: Optional[str] = None
    pickle_metadata: Optional[dict] = None
    _tracking_from_pickle: bool = False

    def _init_pickle_mixin(self):
        """Initialize pickle mixin attributes. Call from __init__."""
        self.pickle_multiworld = None
        self.pickle_path = None
        self.pickle_metadata = None
        self._tracking_from_pickle = False

    def _disconnect_pickle_mixin(self):
        """Clear pickle mixin state. Call from disconnect."""
        self.pickle_multiworld = None
        self.pickle_path = None
        self.pickle_metadata = None
        self._tracking_from_pickle = False

    def load_multiworld_from_pickle(self, pickle_path: str) -> bool:
        """
        Load a multiworld from a gzip-compressed dill pickle file.

        Args:
            pickle_path: Path to the pickle file (.pkl.gz)

        Returns:
            True if multiworld was loaded successfully, False otherwise
        """
        try:
            from exporter.pickle_exporter import load_multiworld_pickle, load_pickle_metadata, METADATA_EXTENSION

            self.logger.info(f"Loading multiworld from pickle: {pickle_path}")

            # Load the multiworld
            self.pickle_multiworld = load_multiworld_pickle(pickle_path)
            self.pickle_path = pickle_path

            # Try to load metadata if available
            metadata_path = pickle_path.rsplit('.pkl.gz', 1)[0] + METADATA_EXTENSION
            self.pickle_metadata = load_pickle_metadata(metadata_path)

            self.logger.info(f"Loaded multiworld from pickle successfully")
            return True

        except Exception as e:
            self.logger.warning(f"Failed to load multiworld from pickle: {e}")
            import traceback
            self.logger.debug(traceback.format_exc())
            self.pickle_multiworld = None
            self.pickle_path = None
            self.pickle_metadata = None
            return False

    def initialize_tracking_from_pickle(self) -> bool:
        """
        Initialize tracking using the pickled multiworld.

        This method uses a multiworld that was loaded via load_multiworld_from_pickle().
        The pickled multiworld already has all regions, rules, and items set up,
        so no generation steps are needed.

        Returns:
            True if tracking was initialized from pickle, False otherwise
        """
        if not self.pickle_multiworld:
            self.logger.debug("No pickle multiworld available for tracking")
            return False

        try:
            # Use pickle multiworld for tracking
            self.multiworld = self.pickle_multiworld
            self.player_id = 1
            self._tracking_from_pickle = True

            # Clear precollected items with codes from the pickle multiworld.
            # The pickled world has pre-collected starting items. These items will
            # be added via set_items_received() during tracking, so we must clear
            # them here to avoid double-counting.
            temp_precollect = {}
            for player_id, items in self.multiworld.precollected_items.items():
                temp_items = [item for item in items if item.code is None]
                temp_precollect[player_id] = temp_items
            self.multiworld.precollected_items = temp_precollect

            # Convert list-address locations to events.
            # Some games (e.g., ALttP) use list addresses for locations like dungeon prizes
            # that have multiple ROM addresses. The JSON exporter converts these to events
            # (address=None, event=True) so they're collected via sweep_for_advancements().
            # We do the same here to match worldgen mode behavior.
            list_address_count = 0
            for location in self.multiworld.get_locations(self.player_id):
                if isinstance(location.address, list):
                    location.address = None
                    location.event = True
                    list_address_count += 1

            if list_address_count > 0:
                self.logger.debug(
                    f"Converted {list_address_count} list-address locations to events"
                )

            self.logger.info(
                f"Initialized tracking from pickle multiworld"
            )
            return True

        except Exception as e:
            self.logger.warning(f"Failed to initialize tracking from pickle: {e}")
            import traceback
            self.logger.debug(traceback.format_exc())
            self._tracking_from_pickle = False
            return False

    def auto_discover_pickle(self) -> bool:
        """
        Auto-discover and load the pickle file based on game name and seed name.

        Searches for pickle files in multiple locations (in order):
        1. frontend/presets/{world_directory}/AP_{seed_name}/ - game presets
        2. output/ directory - default generation output

        Each candidate file is validated to ensure game_name and seed_name match
        before being accepted. If validation fails, the search continues.

        Returns:
            True if pickle was loaded successfully, False otherwise
        """
        self._log_debug("auto_discover_pickle", {"game": self.game, "seed_name": self.seed_name})

        if not self.game or not self.seed_name:
            self.logger.debug("Cannot auto-discover pickle: game or seed_name not set")
            return False

        from Utils import user_path, output_path
        from exporter.pickle_exporter import PICKLE_EXTENSION, METADATA_EXTENSION

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
            world_directory = self.game.lower().replace(' ', '_').replace('-', '_')

        # Build the expected seed folder name
        seed_folder = f"AP_{self.seed_name}" if not self.seed_name.startswith('AP_') else self.seed_name
        pickle_filename = f"{seed_folder}{PICKLE_EXTENSION}"

        # Build list of candidate paths to try
        candidates = []

        # 1. frontend/presets/{world_directory}/AP_{seed_name}/
        preset_dir = project_root / "frontend" / "presets" / world_directory / seed_folder
        candidates.append(preset_dir / pickle_filename)

        # 2. Also try _worldgen variant
        worldgen_dir = project_root / "frontend" / "presets" / f"{world_directory}_worldgen" / seed_folder
        candidates.append(worldgen_dir / pickle_filename)

        # 3. output/ directory
        output_dir = Path(output_path())
        candidates.append(output_dir / pickle_filename)

        # 4. User data directory
        try:
            user_data_dir = Path(user_path())
            candidates.append(user_data_dir / pickle_filename)
        except Exception:
            pass

        # Try each candidate
        for pickle_path in candidates:
            self._log_debug("trying_pickle_path", {"path": str(pickle_path)})
            if not pickle_path.exists():
                self.logger.debug(f"Pickle not found: {pickle_path}")
                continue

            self.logger.debug(f"Found pickle candidate: {pickle_path}")

            # Validate by loading metadata
            metadata_path = str(pickle_path).rsplit('.pkl.gz', 1)[0] + METADATA_EXTENSION
            if Path(metadata_path).exists():
                try:
                    with open(metadata_path) as f:
                        metadata = json.load(f)

                    # Validate seed name matches
                    meta_seed_name = metadata.get('seed_name', '')
                    if meta_seed_name != self.seed_name and meta_seed_name != f"AP_{self.seed_name}":
                        self.logger.debug(
                            f"Seed name mismatch: expected {self.seed_name}, got {meta_seed_name}"
                        )
                        continue

                    # Validate game matches (check all players)
                    players = metadata.get('players', {})
                    game_found = False
                    for player_data in players.values():
                        if player_data.get('game') == self.game:
                            game_found = True
                            break

                    if not game_found:
                        games = [p.get('game') for p in players.values()]
                        self.logger.debug(
                            f"Game mismatch: expected {self.game}, found {games}"
                        )
                        continue

                except Exception as e:
                    self.logger.debug(f"Failed to validate metadata: {e}")
                    # Continue anyway - try to load the pickle

            # Try to load the pickle
            if self.load_multiworld_from_pickle(str(pickle_path)):
                self.logger.info(f"Auto-discovered and loaded pickle: {pickle_path}")
                return True

        self.logger.debug("No valid pickle file found")
        return False

    def _log_debug(self, event_type: str, data: dict = None):
        """Helper to log debug events. Override in subclass if needed."""
        if hasattr(super(), '_log_debug'):
            super()._log_debug(event_type, data)
        else:
            self.logger.debug(f"{event_type}: {data}")
