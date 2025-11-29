"""shapez game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class ShapezGameExportHandler(GenericGameExportHandler):
    """Export handler for shapez."""
    GAME_NAME = 'shapez'

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Tell the analyzer which functions should be preserved as helper calls
        instead of being inlined.

        Args:
            func_name: The name of the function being analyzed

        Returns:
            True if the function should be preserved as a helper call
        """
        # Preserve has_logic_list_building as a helper
        # This function takes closure variables (buildings list, index) that
        # can't be properly resolved by the analyzer
        if func_name == 'has_logic_list_building':
            return True

        # All other shapez helper functions should also be preserved
        # This includes: can_cut_half, can_rotate_90, can_stack, can_paint, etc.
        shapez_helpers = {
            'can_cut_half',
            'can_rotate_90',
            'can_rotate_180',
            'can_stack',
            'can_paint',
            'can_mix_colors',
            'has_tunnel',
            'has_balancer',
            'can_use_quad_painter',
            'can_make_stitched_shape',
            'can_build_mam',
            'can_make_east_windmill',
            'can_make_half_half_shape',
            'can_make_half_shape',
            'has_x_belt_multiplier',
        }

        return func_name in shapez_helpers

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Override expand_rule to preserve helper functions as-is.

        shapez uses many helper functions (can_cut_half, can_stack, etc.)
        that should remain as helper calls rather than being expanded to
        capability rules or other inferred types.
        """
        if not rule:
            return rule

        # For helper rules, just return them as-is without expansion
        if rule.get('type') == 'helper':
            return rule

        # Handle __analyzed_func__ using parent logic
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
            return self._infer_rule_type(rule)

        # Recursively expand conditions in and/or rules
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]

        return rule
