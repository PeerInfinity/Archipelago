"""Landstalker - The Treasures of King Nole game-specific export handler.

This handler extends GenericGameExportHandler to handle:
- Region object conversion in closure variables (LandstalkerRegion -> string codes)
- _landstalker_has_visited_regions helper expansion to item_check conditions
"""

from typing import Dict, Any, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class LandstalkerGameExportHandler(GenericGameExportHandler):
    """Export handler for Landstalker - The Treasures of King Nole."""

    # Use resolved_items from sphere log for event item handling
    USE_RESOLVED_ITEMS = True

    def prepare_closure_vars(self, rule_func, closure_vars: Dict[str, Any]) -> Dict[str, Any]:
        """Convert Region objects in closure to their string codes for serialization."""
        if not callable(rule_func):
            return closure_vars

        enhanced_closure = closure_vars.copy()

        # Convert LandstalkerRegion objects to their codes
        if 'required_regions' in enhanced_closure:
            regions = enhanced_closure['required_regions']
            if isinstance(regions, list) and regions and hasattr(regions[0], 'code'):
                enhanced_closure['required_regions'] = [r.code for r in regions]
                logger.debug(f"Converted required_regions to codes: {enhanced_closure['required_regions']}")

        return enhanced_closure

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand rules with Landstalker-specific patterns."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle _landstalker_has_visited_regions helper call
        if rule.get('type') == 'helper' and rule.get('name') == '_landstalker_has_visited_regions':
            return self._expand_has_visited_regions_helper(rule)

        return super().expand_rule(rule, _depth)

    def _expand_has_visited_regions_helper(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand _landstalker_has_visited_regions helper to item_check conditions."""
        args = rule.get('args', [])
        if not args:
            return {"type": "constant", "value": True}

        regions_arg = args[0]
        region_names = []

        if isinstance(regions_arg, dict) and regions_arg.get('type') == 'constant':
            value = regions_arg.get('value', [])
            if isinstance(value, list):
                region_names = value
        elif isinstance(regions_arg, list):
            region_names = regions_arg

        if not region_names:
            return {"type": "constant", "value": True}

        region_codes = [self._to_region_code(r) for r in region_names]
        return self._build_event_visited_conditions(region_codes)

    def _to_region_code(self, value) -> str:
        """Convert a region value (object or string) to a code string."""
        if hasattr(value, 'code'):
            return value.code
        if isinstance(value, str):
            return value.lower().replace(' ', '_').replace("'", "").replace('-', '_')
        return str(value).lower()

    def _build_event_visited_conditions(self, region_codes: List[str]) -> Dict[str, Any]:
        """Build AND conditions for event_visited_ item checks."""
        if not region_codes:
            return {"type": "constant", "value": True}

        conditions = [{"type": "item_check", "item": f"event_visited_{code}"}
                      for code in region_codes]

        if len(conditions) == 1:
            return conditions[0]
        return {"type": "and", "conditions": conditions}
