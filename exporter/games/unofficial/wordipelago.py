"""Wordipelago game-specific export handler.

Wordipelago has two types of complex rules that the base exporter can't handle:

1. Starred argument unpacking with option-dependent lookups:
    lambda state: needed_for_words(state, player, *(rule_logic[logic_difficulty]["green"][str(point_shop_logic_level)]))

   The index depends on str(option.value) which involves a helper call that
   the expression resolver can't evaluate.

2. Chunk transition rules with dynamically computed item names:
    lambda state: state.has(str((world.options.word_checks // 5 + (world.options.word_checks % 5 > 0)) * 1) + ' Words', player)

   The world_generator's HelperCodeGenerator cannot convert these complex
   expressions, falling back to True which causes UT fuzzer failures.

This handler intercepts these patterns and constructs properly formed rules:
- For starred rule_logic: builds a helper call with resolved arguments
- For chunk transitions: builds a simple ItemCheck with the pre-computed item name
"""

from typing import Any, Dict, List, Set, Optional, Callable, TYPE_CHECKING
import logging
import inspect
import ast

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


# Copy of rule_logic from the apworld's logicrules.py
# This is the data structure used to look up helper arguments
RULE_LOGIC = {
    1: {
        "green": {
            "1": [0, 0, 1, False],
            "2": [2, 50, 2, True],
            "3": [4, 120, 4, True],
            "4": [5, 170, 5, True],
            "5": [6, 190, 5, True],
        },
        "yellow": {
            "1": [0, 0, 2, True],
            "2": [2, 50, 3, True],
            "3": [4, 120, 4, True],
            "4": [5, 170, 5, True],
            "5": [6, 190, 5, True],
        },
        "letters": [1, 3, 1, False],
        "streak": [6, 190, 5, True]
    },
    2: {
        "green": {
            "1": [0, 0, 1, False],
            "2": [2, 50, 2, False],
            "3": [3, 105, 3, True],
            "4": [5, 150, 5, True],
            "5": [6, 175, 6, True],
        },
        "yellow": {
            "1": [0, 0, 2, True],
            "2": [2, 50, 3, True],
            "3": [3, 105, 3, True],
            "4": [5, 150, 5, True],
            "5": [6, 175, 6, True],
        },
        "letters": [1, 3, 1, False],
        "streak": [6, 175, 6, True]
    },
    3: {
        "green": {
            "1": [0, 0, 1, False],
            "2": [1, 40, 2, False],
            "3": [2, 90, 3, False],
            "4": [4, 120, 4, True],
            "5": [5, 150, 5, True],
        },
        "yellow": {
            "1": [0, 0, 2, True],
            "2": [2, 40, 3, True],
            "3": [4, 90, 4, True],
            "4": [5, 120, 5, True],
            "5": [6, 150, 6, True],
        },
        "letters": [1, 3, 1, False],
        "streak": [6, 150, 6, True]
    },
    4: {
        "green": {
            "1": [0, 0, 1, False],
            "2": [2, 30, 2, False],
            "3": [3, 75, 3, False],
            "4": [4, 100, 4, True],
            "5": [5, 125, 5, True],
        },
        "yellow": {
            "1": [0, 0, 1, True],
            "2": [1, 30, 1, True],
            "3": [2, 75, 2, True],
            "4": [3, 100, 3, True],
            "5": [4, 125, 4, True],
        },
        "letters": [1, 3, 1, False],
        "streak": [4, 125, 4, True]
    },
    5: {
        "green": {
            "1": [0, 0, 1, False],
            "2": [1, 20, 2, False],
            "3": [2, 60, 2, False],
            "4": [3, 85, 3, False],
            "5": [3, 100, 3, True],
        },
        "yellow": {
            "1": [0, 0, 1, True],
            "2": [1, 20, 2, True],
            "3": [2, 60, 2, True],
            "4": [3, 85, 3, True],
            "5": [3, 100, 3, True],
        },
        "letters": [1, 3, 1, False],
        "streak": [3, 100, 3, True]
    }
}


class WordipelagoGameExportHandler(GenericGameExportHandler):
    """Wordipelago game handler - resolves starred arg unpacking for needed_for_words."""

    GAME_NAME = 'Wordipelago'

    # Preserve needed_for_words as a helper (we just need to fix its args)
    HELPERS_TO_PRESERVE: Set[str] = {'needed_for_words', 'needed_for_letter', 'end_game_event_check', 'all_needed_locations_checked'}

    # Export these helpers as definitions so the world generator can use them
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = {'needed_for_words', 'needed_for_letter', 'end_game_event_check', 'all_needed_locations_checked'}

    # Specify helper modules for discovery
    HELPER_MODULES: List[str] = ['worlds.wordipelago.rules']

    AUTO_DISCOVER_WORLD_HELPER_MODULES = True
    AUTO_EXPORT_DISCOVERED_HELPERS = True

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._logic_difficulty = None
        self._point_shop_logic_level = None
        self._word_checks = None
        self._word_streak_checks = None
        self._world = None

    def _get_option_values_from_world(self, world) -> None:
        """Extract relevant option values from the world."""
        self._world = world
        if hasattr(world, 'options'):
            if hasattr(world.options, 'logic_difficulty'):
                self._logic_difficulty = world.options.logic_difficulty.value
            if hasattr(world.options, 'point_shop_logic_level'):
                self._point_shop_logic_level = world.options.point_shop_logic_level.value
            if hasattr(world.options, 'word_checks'):
                self._word_checks = world.options.word_checks.value
            if hasattr(world.options, 'word_streak_checks'):
                self._word_streak_checks = world.options.word_streak_checks.value

        logger.info(f"Wordipelago options extracted: logic_difficulty={self._logic_difficulty}, "
                    f"point_shop_logic_level={self._point_shop_logic_level}, "
                    f"word_checks={self._word_checks}, word_streak_checks={self._word_streak_checks}")

    def _extract_world_from_lambda(self, access_rule: Callable) -> Optional[Any]:
        """Extract the world object from a lambda's closure."""
        try:
            if hasattr(access_rule, '__closure__') and access_rule.__closure__:
                for cell in access_rule.__closure__:
                    cell_contents = cell.cell_contents
                    # Check if this looks like a world object
                    if hasattr(cell_contents, 'options') and hasattr(cell_contents, 'player'):
                        logger.debug(f"Found world object in closure: {type(cell_contents).__name__}")
                        return cell_contents
        except Exception as e:
            logger.debug(f"Could not extract world from lambda closure: {e}")
        return None

    def _get_rule_logic_args(self, category: str, level: str) -> Optional[List[Any]]:
        """Look up args from RULE_LOGIC based on current option values."""
        if self._logic_difficulty is None:
            return None

        try:
            difficulty_rules = RULE_LOGIC.get(self._logic_difficulty, {})
            category_rules = difficulty_rules.get(category, {})
            args_list = category_rules.get(level)
            return args_list
        except (KeyError, TypeError) as e:
            logger.warning(f"Failed to look up RULE_LOGIC[{self._logic_difficulty}]['{category}']['{level}']: {e}")
            return None

    def _build_helper_call_rule(self, helper_name: str, args: List[Any]) -> Dict[str, Any]:
        """Build a helper call rule dict with the given arguments."""
        # Convert args to Constant rule format
        arg_rules = []
        for arg in args:
            arg_rules.append({
                'rule': 'Constant',
                'args': {'value': arg},
                '_converted_from_ast': True
            })

        return {
            'rule': helper_name,
            '_original_ast_type': 'helper',
            '_converted_from_ast': True,
            'args': arg_rules
        }

    def _has_starred_rule_logic_pattern(self, access_rule: Callable) -> bool:
        """Check if an access rule lambda has the starred rule_logic pattern."""
        try:
            source = inspect.getsource(access_rule)
            # Look for the pattern: *(rules_for_difficulty["..."][...])
            if 'rules_for_difficulty' in source and '*(' in source:
                return True
        except (OSError, TypeError):
            pass
        return False

    def _extract_category_from_source(self, source: str) -> Optional[str]:
        """Extract the category ("green" or "yellow") from the lambda source."""
        if '"green"' in source or "'green'" in source:
            return "green"
        if '"yellow"' in source or "'yellow'" in source:
            return "yellow"
        return None

    def _extract_level_from_source(self, source: str) -> Optional[str]:
        """Extract the level index from the lambda source.

        Handles two patterns:
        1. Literal index: rules_for_difficulty["green"]["1"]
        2. Option-based: rules_for_difficulty["green"][str(world.options.point_shop_logic_level.value)]
        """
        import re

        # Pattern 1: Literal string index like ["1"], ["2"], etc.
        # Look for the second subscript after "green" or "yellow"
        literal_match = re.search(r'\["(?:green|yellow)"\]\s*\[\s*["\'](\d+)["\']\s*\]', source)
        if literal_match:
            return literal_match.group(1)

        # Pattern 2: point_shop_logic_level option
        if 'point_shop_logic_level' in source:
            return str(self._point_shop_logic_level) if self._point_shop_logic_level is not None else None

        return None

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """
        Intercept entrance rules that use starred rule_logic unpacking or chunk transitions.

        Handles two patterns:
        1. The Letters -> Point Shop entrance with starred rule_logic unpacking:
            lambda state: needed_for_words(state, world.player,
                *(rules_for_difficulty["green"][str(world.options.point_shop_logic_level.value)]))

        2. Chunk transition rules with option-dependent item names:
            lambda state: state.has(str((world.options.word_checks // 5 + ...) * N) + ' Words', player)
        """
        # Check if this is a lambda with the starred rule_logic pattern
        if not callable(rule):
            return None

        # First, check for chunk transition rules (Words/Streaks Chunk X -> Y)
        chunk_result = self.handle_chunk_transition_rule(entrance_name, rule)
        if chunk_result is not None:
            return chunk_result

        # Then check for starred rule_logic pattern
        if not self._has_starred_rule_logic_pattern(rule):
            return None

        # Try to extract world from lambda closure if we don't have option values yet
        if self._logic_difficulty is None or self._point_shop_logic_level is None:
            world = self._extract_world_from_lambda(rule)
            if world:
                self._get_option_values_from_world(world)

        # Still no option values - can't handle this rule
        if self._logic_difficulty is None or self._point_shop_logic_level is None:
            logger.warning(f"Cannot handle '{entrance_name}': option values not available")
            return None

        try:
            source = inspect.getsource(rule)
            logger.info(f"Detected starred rule_logic pattern in '{entrance_name}': {source.strip()}")

            # Extract the category from the source
            category = self._extract_category_from_source(source)
            if not category:
                logger.warning(f"Could not extract category from source: {source}")
                return None

            # Extract the level index from the source
            level_str = self._extract_level_from_source(source)
            if not level_str:
                logger.warning(f"Could not extract level from source: {source}")
                return None

            # Look up the args
            args = self._get_rule_logic_args(category, level_str)
            if args is None:
                logger.warning(f"Could not find args for RULE_LOGIC[{self._logic_difficulty}]['{category}']['{level_str}']")
                return None

            logger.info(f"Resolved '{entrance_name}' args: needed_for_words({category}/{level_str}) = {args}")

            # Build the helper call rule
            return self._build_helper_call_rule('needed_for_words', args)

        except Exception as e:
            logger.warning(f"Error handling complex entrance rule for '{entrance_name}': {e}")
            return None

    def handle_complex_exit_rule(self, exit_name: str, exit_rule: Any) -> Optional[Dict[str, Any]]:
        """Handle complex exit rules the same way as entrance rules."""
        return self.handle_complex_entrance_rule(exit_name, exit_rule)

    def _is_chunk_transition_rule(self, entrance_name: str, access_rule: Callable) -> Optional[tuple]:
        """
        Check if this is a Words/Streaks chunk transition rule.

        Returns (chunk_type, chunk_number) if it matches, None otherwise.
        chunk_type is 'words' or 'streaks', chunk_number is 1-4 (the target chunk minus 1).
        """
        import re

        # Check entrance name pattern: "Words Chunk X -> Words Chunk Y" or "Streaks Chunk X -> Streaks Chunk Y"
        words_match = re.match(r'Words Chunk (\d+) -> Words Chunk (\d+)', entrance_name)
        if words_match:
            source_chunk = int(words_match.group(1))
            target_chunk = int(words_match.group(2))
            if target_chunk == source_chunk + 1 and 2 <= target_chunk <= 5:
                return ('words', source_chunk)

        streaks_match = re.match(r'Streaks Chunk (\d+) -> Streaks Chunk (\d+)', entrance_name)
        if streaks_match:
            source_chunk = int(streaks_match.group(1))
            target_chunk = int(streaks_match.group(2))
            if target_chunk == source_chunk + 1 and 2 <= target_chunk <= 5:
                return ('streaks', source_chunk)

        return None

    def _compute_chunk_item_name(self, chunk_type: str, chunk_number: int) -> Optional[str]:
        """
        Compute the item name required for a chunk transition.

        Uses the same formula as the apworld:
            str((option_value // 5 + (option_value % 5 > 0)) * chunk_number) + ' Words/Streaks'

        Args:
            chunk_type: 'words' or 'streaks'
            chunk_number: The source chunk number (1-4)

        Returns:
            The item name like "5 Words" or "3 Streaks", or None if options not available
        """
        if chunk_type == 'words':
            if self._word_checks is None:
                return None
            option_value = self._word_checks
            suffix = ' Words'
        elif chunk_type == 'streaks':
            if self._word_streak_checks is None:
                return None
            option_value = self._word_streak_checks
            suffix = ' Streaks'
        else:
            return None

        # Formula from apworld: (option_value // 5 + (option_value % 5 > 0)) * chunk_number
        threshold = (option_value // 5 + (1 if option_value % 5 > 0 else 0)) * chunk_number
        item_name = str(threshold) + suffix

        logger.info(f"Computed chunk item name: {chunk_type} chunk {chunk_number} -> '{item_name}' "
                    f"(option_value={option_value})")

        return item_name

    def _build_item_check_rule(self, item_name: str) -> Dict[str, Any]:
        """Build a simple ItemCheck rule for a given item name."""
        return {
            'rule': 'ItemCheck',
            'args': {
                'item': item_name,
                'count': 1
            },
            '_converted_from_ast': True,
            '_original_ast_type': 'item_check'
        }

    def handle_chunk_transition_rule(self, entrance_name: str, access_rule_method) -> Optional[Dict[str, Any]]:
        """
        Handle chunk transition rules that use option-dependent item names.

        The apworld has rules like:
            lambda state: state.has(str((world.options.word_checks // 5 + (world.options.word_checks % 5 > 0)) * 1) + ' Words', player)

        We detect these patterns and generate a simple ItemCheck with the pre-computed item name.
        """
        if not callable(access_rule_method):
            return None

        # Check if this is a chunk transition
        chunk_info = self._is_chunk_transition_rule(entrance_name, access_rule_method)
        if chunk_info is None:
            return None

        chunk_type, chunk_number = chunk_info

        # Try to extract world from lambda closure if we don't have option values yet
        if (chunk_type == 'words' and self._word_checks is None) or \
           (chunk_type == 'streaks' and self._word_streak_checks is None):
            world = self._extract_world_from_lambda(access_rule_method)
            if world:
                self._get_option_values_from_world(world)

        # Compute the required item name
        item_name = self._compute_chunk_item_name(chunk_type, chunk_number)
        if item_name is None:
            logger.warning(f"Cannot compute item name for '{entrance_name}': options not available")
            return None

        logger.info(f"Resolved chunk transition '{entrance_name}' -> ItemCheck('{item_name}')")

        return self._build_item_check_rule(item_name)

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """
        Get helper definitions with fix for the guesses parameter in needed_for_words.

        The base analyzer incorrectly resolves the 'guesses' parameter to its default
        value (1) instead of keeping it as a parameter reference. This override fixes
        that issue by patching the exported helper body.
        """
        # Get the base helper definitions
        helper_definitions = super().get_helper_definitions(world)

        # Fix the needed_for_words helper if present
        if 'needed_for_words' in helper_definitions:
            helper_def = helper_definitions['needed_for_words']
            body = helper_def.get('body') if isinstance(helper_def, dict) else helper_def

            if body:
                # Recursively fix item_check nodes for 'Guess' to use guesses parameter
                self._fix_guesses_parameter(body)

        return helper_definitions

    def _fix_guesses_parameter(self, node: Any) -> None:
        """
        Recursively fix item_check nodes for 'Guess' to use guesses parameter reference.

        The analyzer incorrectly exports:
            {"type": "item_check", "item": "Guess", "count": {"type": "constant", "value": 1}}

        This should be:
            {"type": "item_check", "item": "Guess", "count": {"type": "name", "name": "guesses"}}
        """
        if not isinstance(node, dict):
            return

        # Check if this is an item_check for 'Guess' with constant count=1
        if node.get('type') == 'item_check' and node.get('item') == 'Guess':
            count = node.get('count')
            if isinstance(count, dict) and count.get('type') == 'constant' and count.get('value') == 1:
                # Replace with parameter reference
                node['count'] = {'type': 'name', 'name': 'guesses'}
                logger.info("Fixed needed_for_words: 'Guess' count now uses 'guesses' parameter")
                return

        # Recursively process nested structures
        for key, value in node.items():
            if isinstance(value, dict):
                self._fix_guesses_parameter(value)
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        self._fix_guesses_parameter(item)
