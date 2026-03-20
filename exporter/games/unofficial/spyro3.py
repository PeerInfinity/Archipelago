"""Spyro 3 game-specific export handler.

Spyro 3 uses complex nested helper functions inside the `set_rules` method that
cause RecursionError during AST parsing due to their deep nesting and complex
closure captures.

KNOWN LIMITATIONS:
The Spyro 3 apworld (v1.2.2) defines all helper functions as nested functions
inside set_rules(), including:
- has_all_gems: Checks if player has collected 15000 total gems
- get_gems_accessible_in_level: Complex per-level gem calculation
- has_total_accessible_gems: Sums accessible gems across all levels
- is_level_completed / is_boss_defeated: Progression checks
- has_entrance_eggs / has_entrance_gems: Level entry requirements
- And many more...

These nested functions create deeply nested AST structures that exceed Python's
recursion limit when dumped for debugging or analysis.

This handler attempts to:
1. Bypass problematic lambda analysis by catching RecursionErrors
2. Expand known helper patterns to their equivalent item checks
3. Fall back to True for rules that cannot be analyzed

Known apworld issues:
- Rules like has_all_gems check state.count() for all 15000+ gems across levels
- These rules create Option-dependent behavior that varies with game settings
- Full compatibility would require replicating the gem counting logic

For UT fuzzer testing to pass, the apworld maintainer would need to:
1. Move helper functions to module level (outside set_rules)
2. Use simpler rule patterns that can be analyzed
3. Or provide explicit Rule Builder compatible rules
"""

from typing import Dict, Any, Optional, Callable
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class Spyro3GameExportHandler(GenericGameExportHandler):
    """Export handler for Spyro 3.

    Handles complex nested helper functions by:
    1. Catching and recovering from RecursionErrors during rule analysis
    2. Expanding known helper patterns where possible
    3. Falling back to True for unanalyzable rules
    """

    GAME_NAME = 'Spyro 3'

    # Track option values from the world
    _goal: int = 0  # GoalOptions value
    _level_lock: int = 0  # LevelLockOptions value
    _open_world: bool = False
    _moneybags_settings: int = 0
    _enable_gemsanity: int = 0

    # Constants matching apworld's Options.py
    class GoalOptions:
        SORCERESS_ONE = 0
        SORCERESS_TWO = 1
        EGG_HUNT = 2
        EGG_FOR_SALE = 3
        ALL_SKILLPOINTS = 4

    class LevelLockOptions:
        VANILLA = 0
        KEYS = 1
        RANDOM_REQS = 2
        ADD_REQS = 3
        ADD_GEM_REQS = 4

    class MoneybagsOptions:
        VANILLA = 0
        COMPANIONSANITY = 1
        MONEYBAGSSANITY = 2

    class GemsanityOptions:
        OFF = 0
        PARTIAL = 1
        FULL = 2

    # Item name mappings
    ITEM_NAME_MAPPINGS: Dict[str, str] = {
        # No specific mappings needed yet
    }

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            self._load_options(world)

    def _load_options(self, world) -> None:
        """Load relevant options from the world."""
        try:
            options = world.options

            self._goal = getattr(options.goal, 'value', 0)
            self._level_lock = getattr(options.level_lock_option, 'value', 0)
            self._open_world = getattr(options.open_world, 'value', False)
            self._moneybags_settings = getattr(options.moneybags_settings, 'value', 0)
            self._enable_gemsanity = getattr(options.enable_gemsanity, 'value', 0)

            logger.debug(f"Spyro 3 options: goal={self._goal}, level_lock={self._level_lock}, "
                        f"open_world={self._open_world}")
        except Exception as e:
            logger.warning(f"Could not load Spyro 3 options: {e}")

    def handle_unsupported_rule(self, rule_func: Callable, context: str = "") -> Optional[Dict[str, Any]]:
        """
        Handle rules that cannot be analyzed normally.

        For Spyro 3, many rules cause RecursionError during AST parsing.
        We catch these and return a simplified rule.

        Args:
            rule_func: The rule function that couldn't be analyzed
            context: Optional context about where this rule came from

        Returns:
            A simplified rule dict, or None to let parent handle it
        """
        # Try to extract the function name for debugging
        func_name = getattr(rule_func, '__name__', '<lambda>')
        qualname = getattr(rule_func, '__qualname__', func_name)

        logger.debug(f"Spyro 3 handling unsupported rule: {qualname} (context: {context})")

        # Check for known helper patterns in the qualname
        if 'has_all_gems' in qualname:
            return self._expand_has_all_gems()
        if 'has_total_accessible_gems' in qualname:
            return self._expand_has_total_accessible_gems()
        if 'get_gems_accessible_in_level' in qualname:
            return self._expand_get_gems_accessible()
        if 'is_boss_defeated' in qualname:
            return self._expand_is_boss_defeated()
        if 'is_level_completed' in qualname:
            return self._expand_is_level_completed()
        if 'Super Bonus Round' in context:
            # Super Bonus Round has complex gem requirements
            return self._expand_super_bonus_round_access()

        # Default: return True to allow access (be permissive)
        # This may cause UT to be more permissive than the actual server logic
        logger.debug(f"Falling back to True for unrecognized rule: {qualname}")
        return {'type': 'constant', 'value': True}

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Spyro 3-specific rules."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Check recursion depth
        if _depth > 20:
            logger.warning(f"Max expand_rule depth reached for Spyro 3, returning as-is")
            return rule

        # First let parent handle common expansions
        try:
            rule = super().expand_rule(rule, _depth)
        except RecursionError:
            logger.warning("RecursionError during parent expand_rule, returning True")
            return {'type': 'constant', 'value': True}

        # Handle helper calls
        if rule.get('type') == 'helper':
            return self._expand_helper(rule)

        # Handle error type (from failed analysis)
        if rule.get('type') == 'error':
            logger.debug(f"Converting error rule to True: {rule.get('message', 'unknown')[:100]}")
            return {'type': 'constant', 'value': True}

        # Recursively expand conditions
        if rule.get('type') in ('and', 'or'):
            conditions = rule.get('conditions', [])
            try:
                rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in conditions]
            except RecursionError:
                logger.warning("RecursionError during condition expansion")
                return {'type': 'constant', 'value': True}

        return rule

    def _expand_helper(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand a helper call to its actual item checks."""
        helper_name = rule.get('name', '')
        args = rule.get('args', [])

        logger.debug(f"Expanding Spyro 3 helper: {helper_name}")

        # Boss defeated checks
        if helper_name == 'is_boss_defeated':
            return self._expand_is_boss_defeated(args)

        # Level completed checks
        if helper_name == 'is_level_completed':
            return self._expand_is_level_completed(args)

        # Gem-related helpers
        if helper_name == 'has_all_gems':
            return self._expand_has_all_gems()
        if helper_name == 'has_total_accessible_gems':
            return self._expand_has_total_accessible_gems()
        if helper_name == 'get_gems_accessible_in_level':
            return self._expand_get_gems_accessible()

        # Companion/Moneybags unlocks
        if helper_name == 'is_companion_unlocked':
            return self._expand_is_companion_unlocked(args)
        if helper_name == 'has_optional_moneybags_unlock':
            return self._expand_has_optional_moneybags_unlock(args)

        # Level entry
        if helper_name == 'can_enter_non_companion_portal':
            return self._expand_can_enter_portal(args)
        if helper_name == 'has_entrance_eggs':
            return self._expand_has_entrance_eggs(args)
        if helper_name == 'has_entrance_gems':
            return self._expand_has_entrance_gems(args)

        # World keys
        if helper_name == 'has_world_keys':
            return self._expand_has_world_keys(args)

        # Sparx health
        if helper_name == 'has_sparx_health':
            return self._expand_has_sparx_health(args)

        # Gems accessible
        if helper_name == 'are_gems_accessible':
            return {'type': 'constant', 'value': True}  # Simplified

        # For unknown helpers, return True
        logger.debug(f"Unknown Spyro 3 helper: {helper_name}, returning True")
        return {'type': 'constant', 'value': True}

    def _expand_is_boss_defeated(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand is_boss_defeated helper."""
        boss_name = self._extract_string_arg(args, 0) if args else "Sorceress"

        # In open world mode, all bosses except Sorceress are considered defeated
        if self._open_world and boss_name != "Sorceress":
            return {'type': 'constant', 'value': True}

        return {'type': 'item_check', 'item': f'{boss_name} Defeated'}

    def _expand_is_level_completed(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand is_level_completed helper."""
        level_name = self._extract_string_arg(args, 0) if args else ""

        # In open world mode, most levels are considered completed
        non_open_world_levels = [
            "Super Bonus Round", "Crawdad Farm", "Spider Town", "Starfish Reef",
            "Bugbot Factory", "Crystal Islands", "Desert Ruins", "Haunted Tomb",
            "Dino Mines", "Agent 9's Lab"
        ]

        if self._open_world and level_name not in non_open_world_levels:
            return {'type': 'constant', 'value': True}

        return {'type': 'item_check', 'item': f'{level_name} Complete'}

    def _expand_has_all_gems(self) -> Dict[str, Any]:
        """Expand has_all_gems helper.

        This requires 15000 total gems across all levels.
        Simplified to just check for Sorceress defeated (endgame).
        """
        # This is a simplification - the actual logic counts gems across all levels
        # For UT purposes, we check if the player has defeated the final boss
        return {'type': 'item_check', 'item': 'Sorceress Defeated'}

    def _expand_has_total_accessible_gems(self) -> Dict[str, Any]:
        """Expand has_total_accessible_gems helper.

        Simplified to True - actual logic is too complex.
        """
        return {'type': 'constant', 'value': True}

    def _expand_get_gems_accessible(self) -> Dict[str, Any]:
        """Expand get_gems_accessible_in_level helper.

        Simplified to True - actual logic is per-level and very complex.
        """
        return {'type': 'constant', 'value': True}

    def _expand_super_bonus_round_access(self) -> Dict[str, Any]:
        """Expand access rule for Super Bonus Round.

        Requires: Sorceress defeated AND 149 eggs AND all gems (15000).
        Simplified to Sorceress defeated and 149 eggs.
        """
        return {
            'type': 'and',
            'conditions': [
                {'type': 'item_check', 'item': 'Sorceress Defeated'},
                {'type': 'item_check', 'item': 'Egg', 'count': 149},
            ]
        }

    def _expand_is_companion_unlocked(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand is_companion_unlocked helper."""
        companion = self._extract_string_arg(args, 0) if args else ""

        return {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': f'Moneybags Unlock - {companion}'},
                {'type': 'item_check', 'item': 'Sorceress Defeated'},
            ]
        }

    def _expand_has_optional_moneybags_unlock(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand has_optional_moneybags_unlock helper."""
        if self._moneybags_settings != self.MoneybagsOptions.MONEYBAGSSANITY:
            return {'type': 'constant', 'value': True}

        unlock = self._extract_string_arg(args, 0) if args else ""
        return {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': f'Moneybags Unlock - {unlock}'},
                {'type': 'item_check', 'item': 'Sorceress Defeated'},
            ]
        }

    def _expand_can_enter_portal(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand can_enter_non_companion_portal helper."""
        level = self._extract_string_arg(args, 0) if args else ""

        if self._level_lock == self.LevelLockOptions.KEYS:
            return {'type': 'item_check', 'item': f'{level} Unlock'}
        elif self._level_lock == self.LevelLockOptions.VANILLA:
            return self._expand_has_entrance_eggs([level])
        else:
            return self._expand_has_entrance_eggs([level])

    def _expand_has_entrance_eggs(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand has_entrance_eggs helper.

        Simplified - actual logic uses level_egg_requirements dictionary.
        """
        level = self._extract_string_arg(args, 0) if args else ""
        # Just check for any eggs - actual counts vary by level
        return {'type': 'item_check', 'item': 'Egg'}

    def _expand_has_entrance_gems(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand has_entrance_gems helper.

        Simplified to True - actual logic uses has_total_accessible_gems.
        """
        return {'type': 'constant', 'value': True}

    def _expand_has_world_keys(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand has_world_keys helper."""
        count = self._extract_int_arg(args, 0) if args else 1
        return {'type': 'item_check', 'item': 'World Key', 'count': count}

    def _expand_has_sparx_health(self, args: Optional[list] = None) -> Dict[str, Any]:
        """Expand has_sparx_health helper.

        Simplified to always True - actual logic depends on options.
        """
        return {'type': 'constant', 'value': True}

    def _extract_string_arg(self, args: list, index: int) -> str:
        """Extract a string argument from helper args."""
        if not args or index >= len(args):
            return ""

        arg = args[index]
        if isinstance(arg, str):
            return arg
        if isinstance(arg, dict):
            if arg.get('type') == 'constant':
                return str(arg.get('value', ''))
            if arg.get('rule') == 'Constant':
                return str(arg.get('value', ''))
        return ""

    def _extract_int_arg(self, args: list, index: int) -> int:
        """Extract an integer argument from helper args."""
        if not args or index >= len(args):
            return 1

        arg = args[index]
        if isinstance(arg, int):
            return arg
        if isinstance(arg, dict):
            if arg.get('type') == 'constant':
                return int(arg.get('value', 1))
            if arg.get('rule') == 'Constant':
                return int(arg.get('value', 1))
        return 1
