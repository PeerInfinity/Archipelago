"""Stacklands game-specific export handler.

Stacklands uses a custom LogicMixin class (StacklandsLogic) with helper methods
that need to be expanded during rule export.

Helper method mappings:
- sl_has_pack(name, player) -> has("name Booster Pack", player)
- sl_has_idea(name, player) -> has("Idea: name", player)
- sl_has_all_packs(packs, player) -> has_all({pack + " Booster Pack" for pack in packs})
- sl_has_all_ideas(ideas, player) -> has_all({f"Idea: {idea}" for idea in ideas})
- sl_has_any_packs(packs, player) -> has_any({...})
- sl_has_any_ideas(ideas, player) -> has_any({...})
- sl_has_count(name, count, player) -> count(name, player) >= count
- sl_can_reach_all_quests(quests, player) -> all(can_reach_location(q) for q in quests)
- sl_can_reach_any_quests(quests, player) -> any(can_reach_location(q) for q in quests)

KNOWN LIMITATIONS:
The board capacity methods (sl_mainland_board_capacity, sl_island_board_capacity) use
complex option-dependent logic that varies based on expansion mode settings. These
are simplified to True to be permissive.

The apworld also uses captured local variables (forest_enabled, island_enabled) that
are computed from options at rule-set time. Rules using these variables are exported
conservatively.
"""

from typing import Dict, Any, Optional, Callable, List
from ..base import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)


class StacklandsGameExportHandler(GenericGameExportHandler):
    """Export handler for Stacklands.

    Handles StacklandsLogic mixin methods by expanding them to their
    equivalent standard Rule Builder operations.
    """

    GAME_NAME = 'Stacklands'

    # Track option values from the world
    _boards_value: int = 0
    _forest_enabled: bool = False
    _island_enabled: bool = False
    _board_expansion_mode: int = 0

    # STATE_METHOD_REPLACEMENTS for known helper methods
    STATE_METHOD_REPLACEMENTS: Dict[str, Dict[str, Any]] = {
        # Simple helper methods that can be expanded inline
        'sl_has_pack': {
            'type': 'helper_expansion',
            'expand_to': 'has',
            'arg_transform': lambda args: [args[0] + ' Booster Pack'] if args else []
        },
        'sl_has_idea': {
            'type': 'helper_expansion',
            'expand_to': 'has',
            'arg_transform': lambda args: ['Idea: ' + args[0]] if args else []
        },
    }

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            self._load_options(world)

    def _load_options(self, world) -> None:
        """Load relevant options from the world."""
        try:
            options = world.options

            # RegionFlags for boards
            self._boards_value = getattr(options.boards, 'value', 0)
            # Forest = 1, Island = 2 based on RegionFlags
            self._forest_enabled = bool(self._boards_value & 1)
            self._island_enabled = bool(self._boards_value & 2)
            self._board_expansion_mode = getattr(options.board_expansion_mode, 'value', 0)

            logger.debug(f"Stacklands options: forest_enabled={self._forest_enabled}, "
                        f"island_enabled={self._island_enabled}, "
                        f"board_expansion_mode={self._board_expansion_mode}")
        except Exception as e:
            logger.warning(f"Could not load Stacklands options: {e}")

    def handle_unsupported_rule(self, rule_func: Callable, context: str = "") -> Optional[Dict[str, Any]]:
        """Handle rules that cannot be analyzed normally.

        For Stacklands, many rules use sl_ helper methods that need expansion.
        """
        func_name = getattr(rule_func, '__name__', '<lambda>')
        qualname = getattr(rule_func, '__qualname__', func_name)

        logger.debug(f"Stacklands handling unsupported rule: {qualname} (context: {context})")

        # Check for board capacity calls - these are complex and option-dependent
        if 'board_capacity' in str(context).lower() or 'board_capacity' in qualname:
            # For non-vanilla expansion mode, just check for the expansion items
            if self._board_expansion_mode != 0:  # Not vanilla
                if 'mainland' in context.lower():
                    return {'type': 'item_check', 'item': 'Mainland Board Expansion'}
                elif 'island' in context.lower():
                    return {'type': 'item_check', 'item': 'Island Board Expansion'}
            # For vanilla mode, be permissive
            return {'type': 'constant', 'value': True}

        # Default: return True to allow access (be permissive)
        logger.debug(f"Falling back to True for unrecognized rule: {qualname}")
        return {'type': 'constant', 'value': True}

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Stacklands-specific rules."""
        if not rule or not isinstance(rule, dict):
            return rule

        if _depth > 20:
            logger.warning(f"Max expand_rule depth reached for Stacklands, returning as-is")
            return rule

        # First let parent handle common expansions
        rule = super().expand_rule(rule, _depth)

        rule_type = rule.get('type') or rule.get('rule')

        # Handle helper calls from StacklandsLogic
        if rule_type == 'call' or rule_type == 'helper':
            expanded = self._expand_helper_call(rule)
            if expanded:
                return expanded

        # Handle error type (from failed analysis)
        if rule_type == 'error':
            logger.debug(f"Converting error rule to True: {rule.get('message', 'unknown')[:100]}")
            return {'type': 'constant', 'value': True}

        # Recursively expand conditions
        if rule_type in ('and', 'or', 'And', 'Or'):
            conditions = rule.get('conditions', rule.get('operands', []))
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in conditions]
            if 'operands' in rule:
                rule['operands'] = rule['conditions']

        return rule

    def _expand_helper_call(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand a StacklandsLogic helper call to its equivalent rule."""
        # Get method name from various possible locations
        method_name = (
            rule.get('name') or
            rule.get('method') or
            rule.get('func', {}).get('attr', '') or
            ''
        )

        args = rule.get('args', [])

        logger.debug(f"Expanding Stacklands helper: {method_name} with args: {args}")

        # sl_has_pack - converts "name" to "name Booster Pack"
        if method_name == 'sl_has_pack':
            name = self._extract_string_arg(args, 0)
            if name:
                return {'type': 'item_check', 'item': f'{name} Booster Pack'}
            return {'type': 'constant', 'value': True}

        # sl_has_idea - converts "name" to "Idea: name"
        if method_name == 'sl_has_idea':
            name = self._extract_string_arg(args, 0)
            if name:
                return {'type': 'item_check', 'item': f'Idea: {name}'}
            return {'type': 'constant', 'value': True}

        # sl_has_all_packs - has_all for pack names
        if method_name == 'sl_has_all_packs':
            packs = self._extract_list_arg(args, 0)
            if packs:
                return {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': f'{pack} Booster Pack'}
                        for pack in packs
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_has_any_packs - has_any for pack names
        if method_name == 'sl_has_any_packs':
            packs = self._extract_list_arg(args, 0)
            if packs:
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': f'{pack} Booster Pack'}
                        for pack in packs
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_has_all_ideas - has_all for idea names
        if method_name == 'sl_has_all_ideas':
            ideas = self._extract_list_arg(args, 0)
            if ideas:
                return {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': f'Idea: {idea}'}
                        for idea in ideas
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_has_any_ideas - has_any for idea names
        if method_name == 'sl_has_any_ideas':
            ideas = self._extract_list_arg(args, 0)
            if ideas:
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': f'Idea: {idea}'}
                        for idea in ideas
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_has_count - count check
        if method_name == 'sl_has_count':
            name = self._extract_string_arg(args, 0)
            count = self._extract_int_arg(args, 1)
            if name:
                return {'type': 'item_check', 'item': name, 'count': count}
            return {'type': 'constant', 'value': True}

        # sl_can_reach_all_quests - location reachability check
        if method_name == 'sl_can_reach_all_quests':
            quests = self._extract_list_arg(args, 0)
            if quests:
                return {
                    'type': 'and',
                    'conditions': [
                        {'type': 'location_check', 'location': quest}
                        for quest in quests
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_can_reach_any_quests - location reachability check
        if method_name == 'sl_can_reach_any_quests':
            quests = self._extract_list_arg(args, 0)
            if quests:
                return {
                    'type': 'or',
                    'conditions': [
                        {'type': 'location_check', 'location': quest}
                        for quest in quests
                    ]
                }
            return {'type': 'constant', 'value': True}

        # sl_mainland_board_capacity / sl_island_board_capacity - complex, simplify
        if 'board_capacity' in method_name:
            # These are complex option-dependent methods
            # Be permissive for UT purposes
            return {'type': 'constant', 'value': True}

        return None

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
            # Handle Name node
            if arg.get('type') == 'name':
                return arg.get('name', '')
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
                try:
                    return int(arg.get('value', 1))
                except (ValueError, TypeError):
                    return 1
            if arg.get('rule') == 'Constant':
                try:
                    return int(arg.get('value', 1))
                except (ValueError, TypeError):
                    return 1
        return 1

    def _extract_list_arg(self, args: list, index: int) -> List[str]:
        """Extract a list of strings from helper args."""
        if not args or index >= len(args):
            return []

        arg = args[index]
        if isinstance(arg, list):
            result = []
            for item in arg:
                if isinstance(item, str):
                    result.append(item)
                elif isinstance(item, dict):
                    if item.get('type') == 'constant':
                        result.append(str(item.get('value', '')))
                    elif item.get('rule') == 'Constant':
                        result.append(str(item.get('value', '')))
            return result
        if isinstance(arg, dict):
            # Handle List node
            if arg.get('type') == 'list':
                return self._extract_list_arg([arg.get('elements', [])], 0)
        return []
