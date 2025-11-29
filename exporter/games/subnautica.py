"""Subnautica game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class SubnauticaGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Subnautica'

    def __init__(self):
        super().__init__()
        self.world = None  # Will be set if needed for location lookups
        # Subnautica-specific helpers based on worlds/subnautica/rules.py
        self.known_helpers = {
            # Vehicle and equipment helpers
            'has_seaglide',
            'has_modification_station',
            'has_mobile_vehicle_bay',
            'has_moonpool',
            'has_vehicle_upgrade_console',

            # Seamoth helpers
            'has_seamoth',
            'has_seamoth_depth_module_mk1',
            'has_seamoth_depth_module_mk2',
            'has_seamoth_depth_module_mk3',

            # Cyclops helpers
            'has_cyclops_bridge',
            'has_cyclops_engine',
            'has_cyclops_hull',
            'has_cyclops',
            'has_cyclops_depth_module_mk1',
            'has_cyclops_depth_module_mk2',
            'has_cyclops_depth_module_mk3',

            # Prawn suit helpers
            'has_prawn',
            'has_prawn_propulsion_arm',
            'has_prawn_depth_module_mk1',
            'has_prawn_depth_module_mk2',

            # Tools and equipment
            'has_laser_cutter',
            'has_stasis_rifle',
            'has_containment',
            'has_utility_room',
            'has_propulsion_cannon',
            'has_cyclops_shield',

            # Special tanks and fins
            'has_ultra_high_capacity_tank',
            'has_lightweight_high_capacity_tank',
            'has_ultra_glide_fins',

            # Depth calculation helpers
            'get_max_swim_depth',
            'get_seamoth_max_depth',
            'get_cyclops_max_depth',
            'get_prawn_max_depth',
            'get_max_depth',

            # Access and creature helpers
            'can_access_location',
            'can_scan_creature',
            'can_reach_location',
            'is_radiated',
            'get_aggression_rule',

            # Closure variables that may appear in lambda functions
            'old_rule',
            'room',  # Used in "Repair Aurora Drive" location
        }

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """Check if a function should be preserved as a helper call instead of being inlined.

        This prevents the analyzer from recursively analyzing and inlining the function body,
        which would cause local variables to be incorrectly exported as name references.
        """
        return func_name in self.known_helpers

    def expand_rule(self, rule):
        """Override to prevent automatic expansion of helpers to capability rules.

        For Subnautica, we want to preserve helper functions as-is so they can be
        properly implemented in the frontend game logic.
        """
        if not rule:
            return rule

        # Handle location.can_reach() pattern (e.g., room.can_reach())
        # This occurs in "Repair Aurora Drive" which depends on "Aurora Drive Room - Upgrade Console"
        # For simplicity, we use the same access rule as the prerequisite location
        if rule.get('type') == 'function_call':
            func = rule.get('function', {})
            if (func.get('type') == 'attribute' and
                func.get('attr') == 'can_reach' and
                func.get('object', {}).get('type') == 'name'):
                var_name = func['object'].get('name')
                if var_name == 'room':
                    # Replace with the same access rule as "Aurora Drive Room - Upgrade Console"
                    # Both locations are in the Aurora Drive Room and have the same access requirements
                    return {
                        'type': 'helper',
                        'name': 'can_access_location',
                        'args': [{
                            'type': 'constant',
                            'value': {
                                'can_slip_through': False,
                                'name': 'Repair Aurora Drive',
                                'need_laser_cutter': False,
                                'need_propulsion_cannon': True,
                                'position': {
                                    'x': 872.5,
                                    'y': 2.7,
                                    'z': -0.7
                                }
                            }
                        }]
                    }

        # Don't auto-expand helpers - keep them as helper nodes
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            # Only keep known Subnautica helpers, warn about unknowns
            if helper_name and helper_name not in self.known_helpers:
                logger.warning(f"Unknown Subnautica helper found: {helper_name}")
            return rule

        # Recursively process nested rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        return rule
