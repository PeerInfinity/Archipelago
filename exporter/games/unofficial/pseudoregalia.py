"""Pseudoregalia game-specific export handler.

Pseudoregalia uses class-based helper methods that are option-dependent.
This handler expands capability rules to their actual item check logic,
accounting for the option values used during generation.

KNOWN LIMITATION - CUSTOM COLLECT HOOKS:
The Pseudoregalia apworld uses custom `collect` and `remove` methods to track
virtual items like "Kick Count" and "Cling Count". When you collect "Air Kick",
the game adds "Kick Count" to your state:

    def collect(self, state, item):
        if name == "Air Kick":
            state.add_item("Kick Count", self.player, 1)
        elif name == "Sun Greaves":
            state.add_item("Kick Count", self.player, 3)
        # etc.

The worldgen world does NOT replicate this collect hook mechanism, so rules
that check "Kick Count >= N" will fail in the Universal Tracker because the
virtual items are never added to the collection state.

This means Pseudoregalia will fail UT fuzzer tests with logic mismatches.
To fully support this apworld, the worldgen system would need to:
1. Support custom collect/remove hooks in generated worlds
2. Or expand "Kick Count" rules to the actual item names with proper counting

Key option-dependent helpers:
- can_attack: Breaker only (default) or Breaker|Plunge (with obscure_logic)
- knows_obscure: True if obscure_logic enabled, else False
- navigate_darkrooms: Varies based on logic_level and spawn_point
- can_gold_ultra: Slidejump (MAP_PATCH) or has_slide (other)
- can_gold_slide_ultra: False (MAP_PATCH) or has_slide (other)

Fixed helpers:
- has_breaker: Dream Breaker or Progressive Dream Breaker
- has_slide: Slide or Progressive Slide
- has_plunge: Sunsetter
- can_bounce: has_breaker AND Ascendant Light
- get_kicks: Kick Count >= N (requires virtual item from collect hook)
- get_clings: Cling Count >= N (requires virtual item from collect hook)
- kick_or_plunge: (Kick Count + 1 if Plunge) >= N
- can_slidejump: (Slide AND Solar Wind) OR Progressive Slide >= 2
"""

from typing import Dict, Any, Set, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class PseudoregaliaGameExportHandler(GenericGameExportHandler):
    """Export handler for Pseudoregalia.

    Expands capability rules to item checks, handling option-dependent logic.
    Also fixes item name mappings where the rule analyzer infers wrong names
    from helper method names (e.g., has_breaker -> "Breaker" instead of "Dream Breaker").
    """

    # Item name mappings from inferred short names to actual item names
    # The rule analyzer sometimes infers item names from helper method names
    ITEM_NAME_MAPPINGS: Dict[str, str] = {
        'Breaker': 'Dream Breaker',
        'Plunge': 'Sunsetter',
        'Small_Keys': 'Small Key',
    }

    # Cache option values for the current world
    _obscure_logic: bool = False
    _logic_level: int = 0  # 0=normal, 1=hard, 2=expert, 3=lunatic
    _spawn_point: int = 0
    _game_version: int = 0  # MAP_PATCH constants
    _knows_dungeon_escape: bool = False

    # Constants from apworld (matching pseudoregalia.constants.difficulties)
    NORMAL = 0
    HARD = 1
    EXPERT = 2
    LUNATIC = 3

    # Constants from apworld (matching pseudoregalia.constants.versions)
    MAP_PATCH = 1

    # Spawn point constant for dungeon_mirror
    DUNGEON_MIRROR = 2  # option_dungeon_mirror value

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            self._load_options(world)

    def _load_options(self, world) -> None:
        """Load relevant options from the world."""
        try:
            options = world.options

            # obscure_logic is forced on for Expert/Lunatic
            self._logic_level = getattr(options.logic_level, 'value', 0)
            base_obscure = getattr(options.obscure_logic, 'value', False)
            self._obscure_logic = base_obscure or self._logic_level >= self.EXPERT

            # spawn_point
            self._spawn_point = getattr(options.spawn_point, 'value', 0)

            # game_version (if it exists)
            if hasattr(options, 'game_version'):
                self._game_version = getattr(options.game_version, 'value', 0)

            # knows_dungeon_escape logic
            dungeon_start = self._spawn_point == self.DUNGEON_MIRROR
            self._knows_dungeon_escape = dungeon_start or self._obscure_logic

            logger.debug(f"Pseudoregalia options: obscure={self._obscure_logic}, "
                        f"logic_level={self._logic_level}, spawn={self._spawn_point}")
        except Exception as e:
            logger.warning(f"Could not load Pseudoregalia options: {e}")

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Pseudoregalia-specific rules, particularly capability rules."""
        if not rule or not isinstance(rule, dict):
            return rule

        # First let parent handle common expansions
        rule = super().expand_rule(rule, _depth)

        # Handle capability rules
        if rule.get('type') == 'capability':
            return self._expand_capability(rule)

        # Handle helper calls that weren't converted to capabilities
        if rule.get('type') == 'helper':
            return self._expand_helper(rule)

        # Recursively expand conditions
        if rule.get('type') in ('and', 'or'):
            conditions = rule.get('conditions', [])
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in conditions]

        return rule

    def _expand_capability(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand a capability rule to its actual item checks."""
        capability = rule.get('capability', '')

        # Map capability names to expansion methods
        expansions = {
            'attack': self._expand_can_attack,
            'bounce': self._expand_can_bounce,
            'slidejump': self._expand_can_slidejump,
            'strikebreak': self._expand_can_strikebreak,
            'soulcutter': self._expand_can_soulcutter,
            'gold_ultra': self._expand_can_gold_ultra,
            'gold_slide_ultra': self._expand_can_gold_slide_ultra,
        }

        if capability in expansions:
            return expansions[capability]()

        # For unknown capabilities, log and return True (be permissive)
        logger.debug(f"Unknown Pseudoregalia capability: {capability}")
        return {'type': 'constant', 'value': True}

    def _expand_helper(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand a helper call to its actual item checks."""
        helper_name = rule.get('name', '')
        args = rule.get('args', [])

        # Handle helpers with arguments
        if helper_name == 'get_kicks':
            count = self._extract_count_arg(args)
            return self._expand_get_kicks(count)

        if helper_name == 'get_clings':
            count = self._extract_count_arg(args)
            return self._expand_get_clings(count)

        if helper_name == 'kick_or_plunge':
            count = self._extract_count_arg(args)
            return self._expand_kick_or_plunge(count)

        # Handle simple boolean helpers
        if helper_name == 'knows_obscure':
            return {'type': 'constant', 'value': self._obscure_logic}

        if helper_name == 'has_breaker':
            return self._expand_has_breaker()

        if helper_name == 'has_slide':
            return self._expand_has_slide()

        if helper_name == 'has_plunge':
            return {'type': 'item_check', 'item': 'Sunsetter'}

        if helper_name == 'navigate_darkrooms':
            return self._expand_navigate_darkrooms()

        if helper_name == 'can_attack':
            return self._expand_can_attack()

        if helper_name == 'can_bounce':
            return self._expand_can_bounce()

        if helper_name == 'can_slidejump':
            return self._expand_can_slidejump()

        # For unknown helpers, log and return True
        logger.debug(f"Unknown Pseudoregalia helper: {helper_name}")
        return {'type': 'constant', 'value': True}

    def _extract_count_arg(self, args: List[Any]) -> int:
        """Extract a count argument from helper args."""
        if not args:
            return 1

        arg = args[0]
        if isinstance(arg, int):
            return arg
        if isinstance(arg, dict):
            if arg.get('type') == 'constant':
                return arg.get('value', 1)
            if arg.get('rule') == 'Constant':
                return arg.get('value', 1)
        return 1

    # Expansion methods for each capability/helper

    def _expand_has_breaker(self) -> Dict[str, Any]:
        """has_breaker: Dream Breaker or Progressive Dream Breaker."""
        return {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': 'Dream Breaker'},
                {'type': 'item_check', 'item': 'Progressive Dream Breaker'},
            ]
        }

    def _expand_has_slide(self) -> Dict[str, Any]:
        """has_slide: Slide or Progressive Slide."""
        return {
            'type': 'or',
            'conditions': [
                {'type': 'item_check', 'item': 'Slide'},
                {'type': 'item_check', 'item': 'Progressive Slide'},
            ]
        }

    def _expand_can_attack(self) -> Dict[str, Any]:
        """can_attack: depends on obscure_logic option."""
        if self._obscure_logic:
            # can_attack = has_breaker OR has_plunge
            return {
                'type': 'or',
                'conditions': [
                    self._expand_has_breaker(),
                    {'type': 'item_check', 'item': 'Sunsetter'},
                ]
            }
        else:
            # can_attack = has_breaker only
            return self._expand_has_breaker()

    def _expand_can_bounce(self) -> Dict[str, Any]:
        """can_bounce: has_breaker AND Ascendant Light."""
        return {
            'type': 'and',
            'conditions': [
                self._expand_has_breaker(),
                {'type': 'item_check', 'item': 'Ascendant Light'},
            ]
        }

    def _expand_can_slidejump(self) -> Dict[str, Any]:
        """can_slidejump: (Slide AND Solar Wind) OR Progressive Slide >= 2."""
        return {
            'type': 'or',
            'conditions': [
                {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Slide'},
                        {'type': 'item_check', 'item': 'Solar Wind'},
                    ]
                },
                {'type': 'item_check', 'item': 'Progressive Slide', 'count': 2},
            ]
        }

    def _expand_can_strikebreak(self) -> Dict[str, Any]:
        """can_strikebreak: (Dream Breaker AND Strikebreak) OR Progressive Dream Breaker >= 2."""
        return {
            'type': 'or',
            'conditions': [
                {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Dream Breaker'},
                        {'type': 'item_check', 'item': 'Strikebreak'},
                    ]
                },
                {'type': 'item_check', 'item': 'Progressive Dream Breaker', 'count': 2},
            ]
        }

    def _expand_can_soulcutter(self) -> Dict[str, Any]:
        """can_soulcutter: (Dream Breaker AND Strikebreak AND Soul Cutter) OR Progressive Dream Breaker >= 3."""
        return {
            'type': 'or',
            'conditions': [
                {
                    'type': 'and',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Dream Breaker'},
                        {'type': 'item_check', 'item': 'Strikebreak'},
                        {'type': 'item_check', 'item': 'Soul Cutter'},
                    ]
                },
                {'type': 'item_check', 'item': 'Progressive Dream Breaker', 'count': 3},
            ]
        }

    def _expand_can_gold_ultra(self) -> Dict[str, Any]:
        """can_gold_ultra: slidejump if MAP_PATCH, else has_slide."""
        if self._game_version == self.MAP_PATCH:
            return self._expand_can_slidejump()
        else:
            return self._expand_has_slide()

    def _expand_can_gold_slide_ultra(self) -> Dict[str, Any]:
        """can_gold_slide_ultra: False if MAP_PATCH, else has_slide."""
        if self._game_version == self.MAP_PATCH:
            return {'type': 'constant', 'value': False}
        else:
            return self._expand_has_slide()

    def _expand_get_kicks(self, count: int) -> Dict[str, Any]:
        """get_kicks: Kick Count >= count."""
        return {'type': 'item_check', 'item': 'Kick Count', 'count': count}

    def _expand_get_clings(self, count: int) -> Dict[str, Any]:
        """get_clings: Cling Count >= count."""
        return {'type': 'item_check', 'item': 'Cling Count', 'count': count}

    def _expand_kick_or_plunge(self, count: int) -> Dict[str, Any]:
        """kick_or_plunge: (Kick Count >= count) OR (Kick Count >= count-1 AND Sunsetter)."""
        if count <= 1:
            # Either 1 kick or plunge
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Kick Count', 'count': 1},
                    {'type': 'item_check', 'item': 'Sunsetter'},
                ]
            }
        else:
            # Either count kicks, or count-1 kicks + plunge
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Kick Count', 'count': count},
                    {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Kick Count', 'count': count - 1},
                            {'type': 'item_check', 'item': 'Sunsetter'},
                        ]
                    },
                ]
            }

    def _expand_navigate_darkrooms(self) -> Dict[str, Any]:
        """navigate_darkrooms: depends on logic_level and spawn_point."""
        # Expert/Lunatic: True
        if self._logic_level >= self.EXPERT:
            return {'type': 'constant', 'value': True}

        # knows_dungeon_escape: Ascendant Light OR has_breaker
        if self._knows_dungeon_escape:
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Ascendant Light'},
                    self._expand_has_breaker(),
                ]
            }

        # Default: Ascendant Light only
        return {'type': 'item_check', 'item': 'Ascendant Light'}

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process Pseudoregalia export data.

        Fixes item names throughout the exported data where the rule analyzer
        inferred wrong names from helper method names.
        """
        # Fix item names in all regions
        for player_id, player_regions in data.get('regions', {}).items():
            for region_name, region_data in player_regions.items():
                # Fix exit rules
                for exit_data in region_data.get('exits', []):
                    if 'access_rule' in exit_data:
                        exit_data['access_rule'] = self._fix_item_names(exit_data['access_rule'])

                # Fix location rules
                for location_data in region_data.get('locations', []):
                    if 'access_rule' in location_data:
                        location_data['access_rule'] = self._fix_item_names(location_data['access_rule'])

        return data

    def _fix_item_names(self, rule: Any) -> Any:
        """Recursively fix item names in a rule structure."""
        if not isinstance(rule, dict):
            return rule

        # Fix item_check rules
        if rule.get('type') == 'item_check' or rule.get('rule') == 'Has':
            item_name = rule.get('item') or rule.get('args', {}).get('item_name')
            if item_name and item_name in self.ITEM_NAME_MAPPINGS:
                new_name = self.ITEM_NAME_MAPPINGS[item_name]
                if 'item' in rule:
                    rule['item'] = new_name
                if 'args' in rule and 'item_name' in rule.get('args', {}):
                    rule['args']['item_name'] = new_name
                logger.debug(f"Fixed item name: {item_name} -> {new_name}")

        # Fix HasAll and HasAny rules
        if rule.get('rule') in ('HasAll', 'HasAny'):
            args = rule.get('args', {})
            if 'items' in args:
                args['items'] = [
                    self.ITEM_NAME_MAPPINGS.get(item, item)
                    for item in args['items']
                ]

        # Recursively process children
        if 'children' in rule:
            rule['children'] = [self._fix_item_names(child) for child in rule['children']]

        if 'conditions' in rule:
            rule['conditions'] = [self._fix_item_names(cond) for cond in rule['conditions']]

        # Handle 'rule' key for nested rules (Rule Builder format)
        for key in ['left', 'right', 'condition', 'then', 'else']:
            if key in rule:
                rule[key] = self._fix_item_names(rule[key])

        return rule
