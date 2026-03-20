"""Sonic the Hedgehog 1 export handler.

This handler provides special support for the Sonic 1 apworld's `common_checks`
helper function, which uses counting patterns over can_reach_location calls
that can't be exported by the generic exporter.

The `common_checks` function:
1. Counts reachable boss locations from `constants.completion`
2. Counts reachable special stage locations from `constants.completion`
3. Counts collected emeralds from `constants.emeralds`
4. Compares counts to option-based thresholds

This handler expands `common_checks` to explicit `count_true` rules with
`location_check` and `item_check` conditions.
"""

from typing import Dict, Any, List, Optional, Callable
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class Sonic1GameExportHandler(GenericGameExportHandler):
    """Export handler for Sonic the Hedgehog 1.

    Handles the `common_checks` helper which counts reachable locations
    and compares to option-based thresholds.
    """

    GAME_NAME = 'Sonic the Hedgehog 1'

    # The completion locations list (from constants.py)
    COMPLETION_LOCATIONS = [
        'Green Hill 3 Boss',
        'Marble Zone 3 Boss',
        'Spring Yard 3 Boss',
        'Labyrinth 3 Boss',
        'Starlight 3 Boss',
        'Final Zone Boss',
        'Special Stage 1',
        'Special Stage 2',
        'Special Stage 3',
        'Special Stage 4',
        'Special Stage 5',
        'Special Stage 6',
    ]

    # Boss locations (those with "Boss" in the name)
    BOSS_LOCATIONS = [loc for loc in COMPLETION_LOCATIONS if 'Boss' in loc]

    # Boss locations excluding Final Zone Boss (used for Final Zone entrance rule)
    # Final Zone Boss cannot be counted when determining if Final Zone is accessible
    # because it's inside Final Zone - this avoids circular dependency
    BOSS_LOCATIONS_FOR_FZ = [loc for loc in BOSS_LOCATIONS if loc != 'Final Zone Boss']

    # Special stage locations (those without "Boss")
    SPECIAL_LOCATIONS = [loc for loc in COMPLETION_LOCATIONS if 'Boss' not in loc]

    # Emerald items (from constants.py)
    EMERALDS = [
        'Blue Emerald (#1)',
        'Yellow Emerald (#2)',
        'Pink Emerald (#3)',
        'Green Emerald (#4)',
        'Red Emerald (#5)',
        'Grey Emerald (#6)',
    ]

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to handle common_checks helper.

        When we detect a rule that calls common_checks, we expand it inline
        to explicit count_true rules.
        """
        # Check if this is the FZ_reach function that calls common_checks
        func_name = getattr(rule_func, '__name__', '')

        if func_name == 'FZ_reach':
            return self._expand_fz_reach(rule_func, rule_target_name)

        if func_name == 'common_checks':
            return self._expand_common_checks(rule_func, rule_target_name)

        if func_name == 'completion_check':
            return self._expand_completion_check(rule_func, rule_target_name)

        # Return None to use standard analysis for other rules
        return None

    def _get_option_value(self, option_name: str, default: int = 0) -> int:
        """Get an option value from the world."""
        if self.world and hasattr(self.world, 'options'):
            option = getattr(self.world.options, option_name, None)
            if option is not None:
                return int(option.value)
        return default

    def _expand_fz_reach(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Expand the FZ_reach function.

        FZ_reach checks:
        - If final_zone_last == 0, returns True
        - Otherwise, calls common_checks(state, 1)
        """
        final_zone_last = self._get_option_value('final_zone_last', 0)

        if final_zone_last == 0:
            logger.info(f"[Sonic1] FZ_reach: final_zone_last=0, returning True")
            return {'type': 'constant', 'value': True}

        # final_zone_last > 0, expand common_checks with bosses_left=1
        # Exclude Final Zone Boss from the count since it's inside Final Zone (circular dependency)
        logger.info(f"[Sonic1] FZ_reach: final_zone_last={final_zone_last}, expanding common_checks(bosses_left=1)")
        return self._build_common_checks_rule(bosses_left=1, exclude_final_zone_boss=True)

    def _expand_common_checks(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Expand the common_checks function directly."""
        # Extract bosses_left from closure if possible, default to 0
        bosses_left = 0
        try:
            closure_vars = self._extract_closure_vars(rule_func)
            bosses_left = closure_vars.get('bosses_left', 0)
        except Exception:
            pass

        logger.info(f"[Sonic1] Expanding common_checks with bosses_left={bosses_left}")
        return self._build_common_checks_rule(bosses_left=bosses_left)

    def _expand_completion_check(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Expand the completion_check function.

        completion_check:
        - If final_zone_last == 2 and can't reach Final Zone Boss, returns False
        - Otherwise calls common_checks(state, 0)
        """
        final_zone_last = self._get_option_value('final_zone_last', 0)

        conditions = []

        # If final_zone_last == 2, must reach Final Zone Boss
        if final_zone_last == 2:
            conditions.append({
                'type': 'location_check',
                'location': 'Final Zone Boss'
            })

        # Add common_checks with bosses_left=0
        common_checks_rule = self._build_common_checks_rule(bosses_left=0)
        if common_checks_rule:
            conditions.append(common_checks_rule)

        if len(conditions) == 0:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}

    def _build_common_checks_rule(self, bosses_left: int = 0, exclude_final_zone_boss: bool = False) -> Dict[str, Any]:
        """Build the common_checks rule as explicit count_true conditions.

        common_checks requires:
        1. At least boss_goal - bosses_left boss locations reachable
        2. At least specials_goal special stage locations reachable
        3. At least emerald_goal emeralds collected
        4. At least ring_goal rings collected (via has_group)

        Args:
            bosses_left: Number of bosses to subtract from boss_goal
            exclude_final_zone_boss: If True, exclude Final Zone Boss from the
                boss count (used when this rule determines Final Zone access)

        Returns an 'and' rule combining all required conditions.
        """
        boss_goal = self._get_option_value('boss_goal', 0)
        specials_goal = self._get_option_value('specials_goal', 0)
        emerald_goal = self._get_option_value('emerald_goal', 0)
        ring_goal = self._get_option_value('ring_goal', 0)

        logger.info(f"[Sonic1] Building common_checks: boss_goal={boss_goal}, "
                   f"specials_goal={specials_goal}, emerald_goal={emerald_goal}, "
                   f"ring_goal={ring_goal}, bosses_left={bosses_left}, "
                   f"exclude_final_zone_boss={exclude_final_zone_boss}")

        conditions = []

        # Boss goal: count how many boss locations are reachable
        # When checking for Final Zone access, exclude Final Zone Boss (circular dependency)
        effective_boss_goal = boss_goal - bosses_left
        if effective_boss_goal > 0:
            boss_list = self.BOSS_LOCATIONS_FOR_FZ if exclude_final_zone_boss else self.BOSS_LOCATIONS
            boss_conditions = [
                {'type': 'location_check', 'location': loc}
                for loc in boss_list
            ]
            conditions.append({
                'type': 'count_true',
                'conditions': boss_conditions,
                'count': effective_boss_goal
            })

        # Specials goal: count how many special stage locations are reachable
        if specials_goal > 0:
            special_conditions = [
                {'type': 'location_check', 'location': loc}
                for loc in self.SPECIAL_LOCATIONS
            ]
            conditions.append({
                'type': 'count_true',
                'conditions': special_conditions,
                'count': specials_goal
            })

        # Emerald goal: count how many emeralds we have
        if emerald_goal > 0:
            emerald_conditions = [
                {'type': 'item_check', 'item': item}
                for item in self.EMERALDS
            ]
            conditions.append({
                'type': 'count_true',
                'conditions': emerald_conditions,
                'count': emerald_goal
            })

        # Ring goal: check if we have enough rings via group check
        if ring_goal > 0:
            conditions.append({
                'type': 'group_check',
                'group': 'rings',
                'count': ring_goal
            })

        # Combine all conditions with AND
        if len(conditions) == 0:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}
