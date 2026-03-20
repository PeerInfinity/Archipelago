"""Paint game-specific export handler."""

from typing import Dict, Any, Optional, Set
from ..base import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)

# Compiled regex for extracting threshold from location names like "Similarity: 1.0%"
_SIMILARITY_PATTERN = re.compile(r"Similarity: ([\d.]+)%")


class PaintGameExportHandler(GenericGameExportHandler):
    """Export handler for Paint game.

    Paint uses a custom location access rule system based on paint percentage calculations.
    Each location has an access rule that compares paint percentage to a threshold derived
    from the location name (e.g., "Similarity: 1.0%").

    The base exporter's cache now includes rule_target_name, so Paint's shared class method
    (PaintLocation.access_rule) gets unique cache entries per location name. This allows
    override_rule_analysis to work correctly without needing postprocess_regions.

    For WorldGen worlds, rule overrides are skipped since they have their own generated rules.
    """

    # Blacklist paint_percent_available - it has caching logic with state mutation
    # that doesn't translate to the pure function model
    HELPERS_TO_EXPORT_BLACKLIST: Set[str] = {'paint_percent_available'}

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for Paint location access rules.

        Paint locations use "Similarity: X.XX%" naming. This method parses the threshold
        from the location name and creates a rule comparing calculate_paint_percent_available.
        """
        # Skip for worldgen worlds - they have their own rules
        if self.is_worldgen_world():
            return None

        if not (rule_target_name and rule_target_name.startswith("Similarity: ")):
            return None

        match = _SIMILARITY_PATTERN.match(rule_target_name)
        if not match:
            logger.warning(f"Paint: Could not extract threshold from location name: {rule_target_name}")
            return None

        threshold_percent = float(match.group(1))

        # Register the helper for auto-export
        try:
            from worlds.paint.rules import calculate_paint_percent_available
            self.register_helper_usage('calculate_paint_percent_available', calculate_paint_percent_available)
        except ImportError:
            self.register_helper_usage('calculate_paint_percent_available')

        return {
            'type': 'compare',
            'left': {'type': 'helper', 'name': 'calculate_paint_percent_available', 'args': []},
            'op': '>=',
            'right': {'type': 'constant', 'value': threshold_percent}
        }
