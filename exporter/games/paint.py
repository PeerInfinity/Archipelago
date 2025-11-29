"""Paint game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)


class PaintGameExportHandler(GenericGameExportHandler):
    """Export handler for Paint game.

    Paint uses a custom location access rule system based on paint percentage calculations.
    The core logic is in the paint_percent_available helper function.

    Each location has an access rule that checks:
        paint_percent_available(state, world, player) >= threshold

    Where threshold is calculated from the location's address: (address % 198600) / 4
    """

    GAME_NAME = 'Paint'

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Paint-specific settings including canvas_size_increment and logic_percent."""
        # Get base settings from parent class
        settings_dict = super().get_settings_data(world, multiworld, player)

        # Add Paint-specific settings
        try:
            if hasattr(world, 'options'):
                # Export canvas_size_increment option
                if hasattr(world.options, 'canvas_size_increment'):
                    settings_dict['canvas_size_increment'] = world.options.canvas_size_increment.value
                    logger.debug(f"Exported canvas_size_increment = {world.options.canvas_size_increment.value}")

                # Export logic_percent option
                if hasattr(world.options, 'logic_percent'):
                    settings_dict['logic_percent'] = world.options.logic_percent.value
                    logger.debug(f"Exported logic_percent = {world.options.logic_percent.value}")

        except Exception as e:
            logger.warning(f"Failed to export Paint settings: {e}")

        return settings_dict

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for Paint location access rules.

        Paint locations have a custom access_rule method that compares paint_percent_available
        to a threshold derived from the location address.

        Example location: "Similarity: 1.0%" at address 198604
        Threshold: (198604 % 198600) / 4 = 4 / 4 = 1.0% ✓

        Args:
            rule_func: The access_rule function/method
            rule_target_name: The name of the location (e.g., "Similarity: 1.0%")

        Returns:
            A rule dict that compares paint_percent_available to the threshold
        """
        # Check if this is a Paint location access rule
        if rule_target_name and rule_target_name.startswith("Similarity: "):
            # Extract the percentage from the location name
            # Format: "Similarity: X.XX%"
            match = re.match(r"Similarity: ([\d.]+)%", rule_target_name)
            if match:
                threshold_percent = float(match.group(1))

                # Create the rule structure
                return {
                    'type': 'compare',
                    'left': {
                        'type': 'helper',
                        'name': 'paint_percent_available',
                        'args': []
                    },
                    'op': '>=',
                    'right': {
                        'type': 'constant',
                        'value': threshold_percent
                    }
                }
            else:
                logger.warning(f"Paint: Could not extract threshold from location name: {rule_target_name}")

        # Not a Paint location or couldn't parse - let normal analysis proceed
        return None

    def postprocess_regions(self, multiworld, player):
        """Post-process Paint regions to set unique access_rule lambdas on each location.

        This is needed because all Paint locations use the same access_rule method (defined
        on the PaintLocation class), which causes the exporter's rule analysis cache to
        reuse the same cached result for all locations. By setting unique lambda functions
        on each location, we ensure each location gets its own cache key and proper analysis.
        """
        logger.info("Paint: Post-processing regions to set unique access rules on locations")

        # Import the paint_percent_available function
        try:
            from worlds.paint.rules import paint_percent_available
        except ImportError:
            logger.error("Paint: Could not import paint_percent_available from worlds.paint.rules")
            return

        # Get the player's regions
        location_count = 0
        for region in multiworld.get_regions(player):
            for location in region.locations:
                # Check if this is a Paint Similarity location
                if location.name and location.name.startswith("Similarity: "):
                    # Extract the threshold from the location name
                    match = re.match(r"Similarity: ([\d.]+)%", location.name)
                    if match:
                        threshold_percent = float(match.group(1))

                        # Create a unique lambda for this location with the threshold captured
                        # This ensures each location has a different cache key in the exporter
                        # Note: we need to capture 'player' and 'threshold' in the lambda's defaults
                        location.access_rule = lambda state, p=player, t=threshold_percent: \
                            paint_percent_available(state, state.multiworld.worlds[p], p) >= t

                        location_count += 1

        logger.info(f"Paint: Finished post-processing {location_count} locations")

    def postprocess_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process rules (currently unused, kept for future use)."""
        return rule
