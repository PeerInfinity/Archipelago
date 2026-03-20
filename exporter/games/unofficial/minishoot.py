"""Minishoot Adventures game-specific export handler.

This handler converts Minishoot's simple_parse() helper function calls to Rule Builder format.

The Minishoot world uses a string-based rule parser (simple_parse) that takes expressions like:
- "can_cross_gaps"
- "can_fight_lvl2"
- "can_surf and can_dash"
- "can_fight and can_cross_gaps or can_surf"

These string expressions are parsed and evaluated with access to game options.
This exporter translates them to proper Rule Builder rules at export time,
resolving option-dependent logic based on the specific options used for the seed.
"""

import re
from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class MinishootAdventuresExportHandler(GenericGameExportHandler):
    """Export handler for Minishoot Adventures."""

    GAME_NAME = 'Minishoot Adventures'

    # Blacklist the simple_parse helper since we convert all calls to Rule Builder format
    # The helper definition can't be exported correctly (references options, level variables)
    HELPERS_TO_EXPORT_BLACKLIST = {'simple_parse'}

    # Item name constants
    PROGRESSIVE_CANNON = 'Progressive Cannon'
    PROGRESSIVE_DASH = 'Progressive Dash'
    DASH = 'Dash'
    SPIRIT_DASH = 'Spirit Dash'
    SURF = 'Surf'
    BOOST = 'Boost'
    SUPERSHOT = 'Supershot'
    PRIMORDIAL_CRYSTAL = 'Primordial Crystal'
    SPIRIT = 'Spirit'
    SCARAB = 'Scarab'
    D1_SMALL_KEY = 'Small Key (Dungeon 1)'
    D1_BOSS_KEY = 'Boss Key (Dungeon 1)'
    D2_SMALL_KEY = 'Small Key (Dungeon 2)'
    D2_BOSS_KEY = 'Boss Key (Dungeon 2)'
    D3_SMALL_KEY = 'Small Key (Dungeon 3)'
    D3_BOSS_KEY = 'Boss Key (Dungeon 3)'
    D1_REWARD = 'Dungeon 1 Reward'
    D2_REWARD = 'Dungeon 2 Reward'
    D3_REWARD = 'Dungeon 3 Reward'
    D4_REWARD = 'Dungeon 4 Reward'
    DARK_KEY = 'Dark Key'
    DARK_HEART = 'Dark Heart'
    SCARAB_KEY = 'Scarab Key'
    BLACKSMITH = 'Blacksmith'
    MERCHANT = 'Merchant'
    SCARAB_COLLECTOR = 'Scarab Collector'
    BARD = 'Bard'
    FAMILY_CHILD = 'Family Child'
    FAMILY_PARENT_1 = 'Family Parent 1'
    FAMILY_PARENT_2 = 'Family Parent 2'
    POWER_OF_PROTECTION = 'Power of protection'

    def __init__(self, world=None):
        super().__init__(world)
        self._options = {}
        if world:
            self._extract_options(world)

    def _extract_options(self, world) -> None:
        """Extract option values from the world for rule resolution."""
        try:
            options = world.options
            self._options = {
                'ignore_cannon_level_requirements': bool(getattr(options, 'ignore_cannon_level_requirements', False)),
                'progressive_dash': bool(getattr(options, 'progressive_dash', False)),
                'boostless_springboards': bool(getattr(options, 'boostless_springboards', False)),
                'boostless_spirit_races': bool(getattr(options, 'boostless_spirit_races', False)),
                'boostless_torch_races': bool(getattr(options, 'boostless_torch_races', False)),
                'enable_primordial_crystal_logic': bool(getattr(options, 'enable_primordial_crystal_logic', False)),
                'blocked_forest': bool(getattr(options, 'blocked_forest', True)),
                'dashless_gaps': int(getattr(options, 'dashless_gaps', 0)),
                'spirit_tower_requirement': int(getattr(options, 'spirit_tower_requirement', 8)),
                'scarab_items_cost': int(getattr(options, 'scarab_items_cost', 3)),
            }
            logger.debug(f"Minishoot options: {self._options}")
        except Exception as e:
            logger.debug(f"Could not extract Minishoot options: {e}")

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Minishoot-specific rules.

        Converts simple_parse() calls to Rule Builder format.
        """
        if not isinstance(rule, dict):
            if isinstance(rule, list):
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        # Check for simple_parse helper calls
        rule_type = rule.get('rule', '') or rule.get('type', '')
        helper_name = rule.get('name', '')  # AST format: type='helper', name='simple_parse'

        # Handle simple_parse in AST format (type='helper', name='simple_parse')
        if rule_type == 'helper' and helper_name == 'simple_parse':
            result = self._expand_simple_parse_ast(rule)
            if result is not None:
                return result

        # Handle simple_parse in RB format (rule='simple_parse', _original_ast_type='helper')
        if rule_type == 'simple_parse' or (rule.get('_original_ast_type', '').endswith('helper') and rule_type == 'simple_parse'):
            result = self._expand_simple_parse(rule)
            if result is not None:
                return result

        # Handle AST function calls that are simple_parse
        if rule_type in ('AST_function_call', 'function_call', 'call'):
            func_name = self._get_function_name(rule)
            if func_name == 'simple_parse':
                result = self._expand_simple_parse(rule)
                if result is not None:
                    return result

        return super().expand_rule(rule, _depth)

    def _get_function_name(self, rule: Dict[str, Any]) -> Optional[str]:
        """Extract function name from an AST function call rule."""
        # Check direct function name
        if 'function' in rule:
            func = rule['function']
            if isinstance(func, dict):
                if func.get('type') == 'name':
                    return func.get('name')
                return func.get('attr') or func.get('name')
            return func

        # Check args.function pattern
        args = rule.get('args', {})
        if isinstance(args, dict) and 'function' in args:
            func = args['function']
            if isinstance(func, dict):
                return func.get('name')
            return func

        return None

    def _expand_simple_parse_ast(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand simple_parse in AST format (type='helper', name='simple_parse', args=[...])."""
        # AST format has args as a list, first arg is the expression string
        args = rule.get('args', [])

        expression = None
        for arg in args:
            if isinstance(arg, dict):
                # Check for constant value
                if arg.get('type') == 'constant':
                    expression = arg.get('value')
                    break
                # Check for string value
                if 'value' in arg and isinstance(arg['value'], str):
                    expression = arg['value']
                    break
            elif isinstance(arg, str):
                expression = arg
                break

        if expression is None:
            logger.warning(f"Could not extract expression from simple_parse AST call: {rule}")
            return None

        logger.debug(f"Expanding simple_parse AST expression: '{expression}'")

        # Parse and convert the expression
        return self._parse_expression(expression)

    def _expand_simple_parse(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand simple_parse(expression) to Rule Builder format (RB format)."""
        # Extract the expression string from args
        expression = self._extract_expression(rule)
        if expression is None:
            logger.warning(f"Could not extract expression from simple_parse call: {rule}")
            return None

        logger.debug(f"Expanding simple_parse expression: '{expression}'")

        # Parse and convert the expression
        return self._parse_expression(expression)

    def _extract_expression(self, rule: Dict[str, Any]) -> Optional[str]:
        """Extract the expression string argument from a simple_parse call."""
        args = rule.get('args', [])

        # Args might be a list or dict
        if isinstance(args, list):
            for arg in args:
                if isinstance(arg, dict):
                    # Handle Constant rule format
                    if arg.get('rule') == 'Constant' or arg.get('type') == 'constant':
                        value = arg.get('args', {}).get('value') or arg.get('value')
                        if isinstance(value, str):
                            return value
                    # Handle nested args
                    if 'value' in arg:
                        return arg['value']
                elif isinstance(arg, str):
                    return arg
        elif isinstance(args, dict):
            # Handle direct args dict
            if 'expression' in args:
                expr = args['expression']
                if isinstance(expr, dict):
                    return expr.get('value')
                return expr
            # Handle first positional arg
            if args.get('type') == 'constant':
                return args.get('value')

        return None

    def _parse_expression(self, expression: str) -> Dict[str, Any]:
        """Parse a simple_parse expression and convert to Rule Builder format.

        Expressions can be:
        - Single predicate: "can_cross_gaps"
        - With arguments: "have_d1_keys(2)"
        - Combined with 'and': "can_surf and can_fight"
        - Combined with 'or': "can_surf or can_dash"
        - Combined: "can_fight and can_surf or can_dash" = "(can_fight and can_surf) or can_dash"
        """
        expression = expression.strip()

        # Parse OR expressions (lowest precedence)
        or_parts = re.split(r'\s+or\s+', expression)
        if len(or_parts) > 1:
            children = [self._parse_and_expression(part.strip()) for part in or_parts]
            return {'rule': 'Or', 'children': children}

        return self._parse_and_expression(expression)

    def _parse_and_expression(self, expression: str) -> Dict[str, Any]:
        """Parse an AND expression."""
        and_parts = re.split(r'\s+and\s+', expression)
        if len(and_parts) > 1:
            children = [self._parse_predicate(part.strip()) for part in and_parts]
            return {'rule': 'And', 'children': children}

        return self._parse_predicate(expression)

    def _parse_predicate(self, predicate: str) -> Dict[str, Any]:
        """Parse a single predicate and convert to Rule Builder format."""
        predicate = predicate.strip()

        # Handle predicates with arguments like "have_d1_keys(2)"
        match = re.match(r'(\w+)\((\d+)\)', predicate)
        if match:
            pred_name = match.group(1)
            arg = int(match.group(2))
            return self._convert_predicate_with_arg(pred_name, arg)

        return self._convert_predicate(predicate)

    def _convert_predicate(self, predicate: str) -> Dict[str, Any]:
        """Convert a predicate name to Rule Builder format."""
        # Map predicates to their conversions
        converters = {
            'true': lambda: {'rule': 'True_'},
            'can_free_blacksmith': lambda: {'rule': 'Has', 'args': {'item_name': self.BLACKSMITH}},
            'can_free_mercant': lambda: {'rule': 'Has', 'args': {'item_name': self.MERCHANT}},
            'can_free_scarab_collector': lambda: {'rule': 'Has', 'args': {'item_name': self.SCARAB_COLLECTOR}},
            'can_free_bard': lambda: {'rule': 'Has', 'args': {'item_name': self.BARD}},
            'can_fight': lambda: self._convert_can_fight(1),
            'can_fight_lvl2': lambda: self._convert_can_fight(2),
            'can_fight_lvl3': lambda: self._convert_can_fight(3),
            'can_fight_lvl4': lambda: self._convert_can_fight(4),
            'can_fight_lvl5': lambda: self._convert_can_fight(5),
            'can_cross_gaps': lambda: self._convert_can_cross_gaps('normal'),
            'can_cross_tight_gaps': lambda: self._convert_can_cross_gaps('tight'),
            'can_cross_very_tight_gaps': lambda: self._convert_can_cross_gaps('very_tight'),
            'can_surf': lambda: {'rule': 'Has', 'args': {'item_name': self.SURF}},
            'can_boost': lambda: {'rule': 'Has', 'args': {'item_name': self.BOOST}},
            'can_destroy_bushes': lambda: {'rule': 'True_'},
            'can_destroy_ruins': lambda: {'rule': 'True_'},
            'can_destroy_pots': lambda: {'rule': 'True_'},
            'can_destroy_crystals': lambda: {'rule': 'True_'},
            'can_destroy_plants': lambda: {'rule': 'True_'},
            'can_destroy_coconuts': lambda: {'rule': 'True_'},
            'can_destroy_shells': lambda: {'rule': 'True_'},
            'have_d1_boss_key': lambda: {'rule': 'Has', 'args': {'item_name': self.D1_BOSS_KEY}},
            'have_d2_boss_key': lambda: {'rule': 'Has', 'args': {'item_name': self.D2_BOSS_KEY}},
            'have_d3_boss_key': lambda: {'rule': 'Has', 'args': {'item_name': self.D3_BOSS_KEY}},
            'can_destroy_rocks': lambda: self._convert_can_destroy_walls(),
            'can_destroy_walls': lambda: self._convert_can_destroy_walls(),
            'can_light_torches': lambda: {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}},
            'can_destroy_trees': lambda: {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}},
            'can_blast_crystals': lambda: {'rule': 'Has', 'args': {'item_name': self.POWER_OF_PROTECTION}},
            'can_use_springboards': lambda: self._convert_can_use_springboards(),
            'can_race_spirits': lambda: self._convert_can_race_spirits(),
            'can_race_torches': lambda: self._convert_can_race_torches(),
            'have_all_spirits': lambda: self._convert_have_all_spirits(),
            'can_unlock_final_boss_door': lambda: {'rule': 'Has', 'args': {'item_name': self.DARK_HEART}},
            'can_unlock_primordial_cave_door': lambda: {'rule': 'Has', 'args': {'item_name': self.SCARAB_KEY}},
            'can_dodge_purple_bullets': lambda: self._convert_can_dodge_purple_bullets(),
            'can_open_north_city_bridge': lambda: self._convert_can_open_north_city_bridge(),
            'can_light_city_torches': lambda: self._convert_can_light_city_torches(),
            'can_open_sunken_temple': lambda: self._convert_can_open_sunken_temple(),
            'can_light_desert_grotto_torches': lambda: self._convert_can_light_desert_grotto_torches(),
            'can_clear_both_d5_arenas': lambda: self._convert_can_clear_d5_arenas(),
            'can_open_dungeon_5': lambda: self._convert_can_open_dungeon_5(),
            'can_light_all_scarab_temple_torches': lambda: self._convert_can_light_scarab_temple_torches(),
            'can_free_family': lambda: self._convert_can_free_family(),
            'can_open_swamp_tower': lambda: self._convert_can_open_swamp_tower(),
            'forest_is_blocked': lambda: self._convert_forest_is_blocked(),
            'forest_is_open': lambda: self._convert_forest_is_open(),
            'can_buy_from_scarab_collector_1': lambda: self._convert_can_buy_from_scarab_collector(1),
            'can_buy_from_scarab_collector_2': lambda: self._convert_can_buy_from_scarab_collector(2),
            'can_buy_from_scarab_collector_3': lambda: self._convert_can_buy_from_scarab_collector(3),
            'can_buy_from_scarab_collector_4': lambda: self._convert_can_buy_from_scarab_collector(4),
            'can_buy_from_scarab_collector_5': lambda: self._convert_can_buy_from_scarab_collector(5),
            'can_buy_from_scarab_collector_6': lambda: self._convert_can_buy_from_scarab_collector(6),
        }

        if predicate in converters:
            return converters[predicate]()

        logger.warning(f"Unknown Minishoot predicate: {predicate}")
        return {'rule': 'True_'}

    def _convert_predicate_with_arg(self, pred_name: str, arg: int) -> Dict[str, Any]:
        """Convert a predicate with an integer argument."""
        if pred_name == 'have_d1_keys':
            return {'rule': 'Has', 'args': {'item_name': self.D1_SMALL_KEY, 'count': arg}}
        elif pred_name == 'have_d2_keys':
            return {'rule': 'Has', 'args': {'item_name': self.D2_SMALL_KEY, 'count': arg}}
        elif pred_name == 'have_d3_keys':
            return {'rule': 'Has', 'args': {'item_name': self.D3_SMALL_KEY, 'count': arg}}
        elif pred_name == 'can_obtain_super_crystals':
            # TODO: Implement properly
            return self._convert_can_dash()

        logger.warning(f"Unknown Minishoot predicate with arg: {pred_name}({arg})")
        return {'rule': 'True_'}

    # Option-dependent predicate converters

    def _convert_can_fight(self, level: int) -> Dict[str, Any]:
        """Convert can_fight_lvl* predicate based on ignore_cannon_level_requirements option."""
        if self._options.get('ignore_cannon_level_requirements', False):
            return {'rule': 'True_'}

        if level <= 1:
            return {'rule': 'True_'}

        return {'rule': 'Has', 'args': {'item_name': self.PROGRESSIVE_CANNON, 'count': level - 1}}

    def _convert_can_dash(self) -> Dict[str, Any]:
        """Convert can_dash predicate based on progressive_dash option."""
        if self._options.get('progressive_dash', False):
            return {'rule': 'Has', 'args': {'item_name': self.PROGRESSIVE_DASH}}
        return {'rule': 'Has', 'args': {'item_name': self.DASH}}

    def _convert_can_spirit_dash(self) -> Dict[str, Any]:
        """Convert can_spirit_dash predicate based on progressive_dash option."""
        if self._options.get('progressive_dash', False):
            return {'rule': 'Has', 'args': {'item_name': self.PROGRESSIVE_DASH, 'count': 2}}
        return {'rule': 'Has', 'args': {'item_name': self.SPIRIT_DASH}}

    def _convert_can_destroy_walls(self) -> Dict[str, Any]:
        """Convert can_destroy_walls/rocks predicate based on enable_primordial_crystal_logic option."""
        if self._options.get('enable_primordial_crystal_logic', False):
            return {
                'rule': 'HasAny',
                'args': {'items': [self.SUPERSHOT, self.PRIMORDIAL_CRYSTAL]}
            }
        return {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}}

    def _convert_can_use_springboards(self) -> Dict[str, Any]:
        """Convert can_use_springboards predicate based on boostless_springboards option."""
        if self._options.get('boostless_springboards', False):
            return {
                'rule': 'Or',
                'children': [
                    self._convert_can_dash(),
                    {'rule': 'Has', 'args': {'item_name': self.BOOST}}
                ]
            }
        return {'rule': 'Has', 'args': {'item_name': self.BOOST}}

    def _convert_can_race_spirits(self) -> Dict[str, Any]:
        """Convert can_race_spirits predicate based on boostless_spirit_races option."""
        if self._options.get('boostless_spirit_races', False):
            return {
                'rule': 'Or',
                'children': [
                    self._convert_can_dash(),
                    {'rule': 'Has', 'args': {'item_name': self.BOOST}}
                ]
            }
        return {'rule': 'Has', 'args': {'item_name': self.BOOST}}

    def _convert_can_race_torches(self) -> Dict[str, Any]:
        """Convert can_race_torches predicate based on boostless_torch_races option."""
        if self._options.get('boostless_torch_races', False):
            return {'rule': 'True_'}
        return {'rule': 'Has', 'args': {'item_name': self.BOOST}}

    def _convert_can_cross_gaps(self, size: str) -> Dict[str, Any]:
        """Convert can_cross_gaps predicate based on dashless_gaps option."""
        dashless_gaps = self._options.get('dashless_gaps', 0)

        # With dash, all gaps are passable
        dash_rule = self._convert_can_dash()

        if size == 'normal':
            # Normal gaps always need dash
            return dash_rule

        if size == 'tight':
            # Tight gaps: dash OR (boost if dashless_gaps >= 1)
            if dashless_gaps >= 1:
                return {
                    'rule': 'Or',
                    'children': [
                        dash_rule,
                        {'rule': 'Has', 'args': {'item_name': self.BOOST}}
                    ]
                }
            return dash_rule

        if size == 'very_tight':
            # Very tight gaps: dash OR (boost if dashless_gaps >= 1) OR (nothing if dashless_gaps == 2)
            if dashless_gaps == 2:
                return {'rule': 'True_'}
            if dashless_gaps >= 1:
                return {
                    'rule': 'Or',
                    'children': [
                        dash_rule,
                        {'rule': 'Has', 'args': {'item_name': self.BOOST}}
                    ]
                }
            return dash_rule

        return dash_rule

    def _convert_have_all_spirits(self) -> Dict[str, Any]:
        """Convert have_all_spirits predicate based on spirit_tower_requirement option."""
        count = self._options.get('spirit_tower_requirement', 8)
        if count <= 0:
            return {'rule': 'True_'}
        return {'rule': 'Has', 'args': {'item_name': self.SPIRIT, 'count': count}}

    def _convert_can_buy_from_scarab_collector(self, index: int) -> Dict[str, Any]:
        """Convert can_buy_from_scarab_collector predicate based on scarab_items_cost option."""
        cost = self._options.get('scarab_items_cost', 3)
        if cost <= 0:
            return {'rule': 'True_'}
        required_scarabs = index * cost
        return {'rule': 'Has', 'args': {'item_name': self.SCARAB, 'count': required_scarabs}}

    def _convert_forest_is_blocked(self) -> Dict[str, Any]:
        """Convert forest_is_blocked predicate based on blocked_forest option."""
        if self._options.get('blocked_forest', True):
            return {'rule': 'True_'}
        return {'rule': 'False_'}

    def _convert_forest_is_open(self) -> Dict[str, Any]:
        """Convert forest_is_open predicate based on blocked_forest option."""
        if not self._options.get('blocked_forest', True):
            return {'rule': 'True_'}
        return {'rule': 'False_'}

    # Complex compound predicates

    def _convert_can_dodge_purple_bullets(self) -> Dict[str, Any]:
        """can_dodge_purple_bullets: can_dash AND can_spirit_dash."""
        return {
            'rule': 'And',
            'children': [
                self._convert_can_dash(),
                self._convert_can_spirit_dash()
            ]
        }

    def _convert_can_open_north_city_bridge(self) -> Dict[str, Any]:
        """can_open_north_city_bridge: can_dash AND can_fight_lvl4 AND can_surf AND can_destroy_walls."""
        return {
            'rule': 'And',
            'children': [
                self._convert_can_dash(),
                self._convert_can_fight(4),
                {'rule': 'Has', 'args': {'item_name': self.SURF}},
                self._convert_can_destroy_walls()
            ]
        }

    def _convert_can_light_city_torches(self) -> Dict[str, Any]:
        """can_light_city_torches: supershot AND can_surf AND can_fight_lvl4 AND can_use_springboards."""
        return {
            'rule': 'And',
            'children': [
                {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}},
                {'rule': 'Has', 'args': {'item_name': self.SURF}},
                self._convert_can_fight(4),
                self._convert_can_use_springboards()
            ]
        }

    def _convert_can_open_sunken_temple(self) -> Dict[str, Any]:
        """can_open_sunken_temple: can_surf AND can_fight_lvl4 AND can_dash AND can_destroy_walls."""
        return {
            'rule': 'And',
            'children': [
                {'rule': 'Has', 'args': {'item_name': self.SURF}},
                self._convert_can_fight(4),
                self._convert_can_dash(),
                self._convert_can_destroy_walls()
            ]
        }

    def _convert_can_light_desert_grotto_torches(self) -> Dict[str, Any]:
        """can_light_desert_grotto_torches: supershot AND (can_surf OR can_cross_gaps) AND can_fight_lvl3."""
        return {
            'rule': 'And',
            'children': [
                {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}},
                {
                    'rule': 'Or',
                    'children': [
                        {'rule': 'Has', 'args': {'item_name': self.SURF}},
                        self._convert_can_cross_gaps('normal')
                    ]
                },
                self._convert_can_fight(3)
            ]
        }

    def _convert_can_clear_d5_arenas(self) -> Dict[str, Any]:
        """can_clear_both_d5_arenas: can_fight_lvl5 AND can_dash AND can_surf."""
        return {
            'rule': 'And',
            'children': [
                self._convert_can_fight(5),
                self._convert_can_dash(),
                {'rule': 'Has', 'args': {'item_name': self.SURF}}
            ]
        }

    def _convert_can_open_dungeon_5(self) -> Dict[str, Any]:
        """can_open_dungeon_5: d1_reward AND d2_reward AND d3_reward AND d4_reward AND dark_key."""
        return {
            'rule': 'HasAll',
            'args': {'items': [
                self.D1_REWARD,
                self.D2_REWARD,
                self.D3_REWARD,
                self.D4_REWARD,
                self.DARK_KEY
            ]}
        }

    def _convert_can_light_scarab_temple_torches(self) -> Dict[str, Any]:
        """can_light_all_scarab_temple_torches: can_surf AND supershot AND can_fight_lvl4."""
        return {
            'rule': 'And',
            'children': [
                {'rule': 'Has', 'args': {'item_name': self.SURF}},
                {'rule': 'Has', 'args': {'item_name': self.SUPERSHOT}},
                self._convert_can_fight(4)
            ]
        }

    def _convert_can_free_family(self) -> Dict[str, Any]:
        """can_free_family: family_child AND family_parent_1 AND family_parent_2."""
        return {
            'rule': 'HasAll',
            'args': {'items': [self.FAMILY_CHILD, self.FAMILY_PARENT_1, self.FAMILY_PARENT_2]}
        }

    def _convert_can_open_swamp_tower(self) -> Dict[str, Any]:
        """can_open_swamp_tower: can_surf OR can_use_springboards."""
        return {
            'rule': 'Or',
            'children': [
                {'rule': 'Has', 'args': {'item_name': self.SURF}},
                self._convert_can_use_springboards()
            ]
        }
