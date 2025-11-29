"""Wargroove game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class WargrooveGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Wargroove'
    """Export handler for Wargroove."""

    def __init__(self, world=None):
        """Initialize handler."""
        super().__init__()
        self.world = world
        self.player = world.player if world and hasattr(world, 'player') else 1
        self.region_to_locations = None
        self.current_region = None
        self.location_rules_cache = {}

    def set_context(self, context_name: str):
        """Set the current region context for exit processing."""
        # This is called before processing exits for a region
        # We can use this to track which region's exits we're processing
        self.current_region = context_name

    def handle_complex_exit_rule(self, exit_name: str, exit_rule) -> Optional[Dict[str, Any]]:
        """Handle complex exit rules for Wargroove.

        Wargroove uses set_region_exit_rules() which creates lambdas like:
        lambda state: any(location.access_rule(state) for location in locations)

        We need to extract the locations from the lambda's closure and analyze their rules.
        """
        # Try to extract locations from the lambda's closure
        if hasattr(exit_rule, '__closure__') and exit_rule.__closure__:
            # Look for the 'locations' variable in the closure
            locations = None
            for cell in exit_rule.__closure__:
                try:
                    cell_contents = cell.cell_contents
                    # Check if this is a list of location objects
                    if isinstance(cell_contents, list) and len(cell_contents) > 0:
                        # Check if the first item looks like a location (has access_rule)
                        if hasattr(cell_contents[0], 'access_rule'):
                            locations = cell_contents
                            break
                except (AttributeError, ValueError):
                    continue

            # If we found locations, analyze their access rules
            if locations:
                from exporter.analyzer import analyze_rule
                location_access_rules = []

                for location in locations:
                    if hasattr(location, 'access_rule') and location.access_rule:
                        loc_name = getattr(location, 'name', 'Unknown')
                        try:
                            # Get the raw access rule function
                            access_rule_func = location.access_rule

                            # Analyze it with the proper context
                            analyzed_rule = analyze_rule(
                                rule_func=access_rule_func,
                                game_handler=self,
                                player_context=self.player
                            )

                            if analyzed_rule and analyzed_rule.get('type') != 'error':
                                # Expand the rule using the game handler
                                expanded_rule = self.expand_rule(analyzed_rule)
                                if expanded_rule:
                                    location_access_rules.append(expanded_rule)
                                else:
                                    # If expansion failed, use the analyzed rule as-is
                                    location_access_rules.append(analyzed_rule)
                        except Exception as e:
                            logger.warning(f"Could not analyze location rule for {loc_name}: {e}")
                            # Try to continue with other locations

                # If we got location rules, combine them with 'or'
                if location_access_rules:
                    if len(location_access_rules) == 1:
                        return location_access_rules[0]
                    else:
                        return {'type': 'or', 'conditions': location_access_rules}
                else:
                    # If we found locations but couldn't analyze their rules, log a warning
                    logger.warning(f"Found locations for exit {exit_name} from region {self.current_region} - no rules could be analyzed")

        return None  # Let normal analysis proceed

    def _build_region_location_mapping(self):
        """Build a mapping of region names to their location lists based on Rules.py."""
        # This mapping is based on the set_region_exit_rules calls in Rules.py
        self.region_to_locations = {
            'Humble Beginnings': ['Humble Beginnings: Victory'],
            'Best Friendssss': ['Best Friendssss: Victory'],
            'A Knight\'s Folly': ['A Knight\'s Folly: Victory'],
            'Denrunaway': ['Denrunaway: Victory'],
            'Dragon Freeway': ['Dragon Freeway: Victory'],
            'Deep Thicket': ['Deep Thicket: Victory'],
            'Corrupted Inlet': ['Corrupted Inlet: Victory'],
            'Mage Mayhem': ['Mage Mayhem: Victory'],
            'Endless Knight': ['Endless Knight: Victory'],
            'Ambushed in the Middle': ['Ambushed in the Middle: Victory (Blue)', 'Ambushed in the Middle: Victory (Green)'],
            'The Churning Sea': ['The Churning Sea: Victory'],
            'Frigid Archery': ['Frigid Archery: Victory'],
            'Archery Lessons': ['Archery Lessons: Victory'],
        }

    def expand_helper(self, helper_name: str):
        """Expand game-specific helper functions for Wargroove."""
        # Start with generic expansion
        # Will add game-specific helpers as we discover them during testing
        return super().expand_helper(helper_name)
