# exporter/games/marioland2.py
"""
Super Mario Land 2 specific export handler.

This handler pre-computes sprite-dependent values at export time since the
exporter cannot analyze complex set/list comprehensions that access sprite_data.

The problematic patterns are:
1. mario_zone_3_coins: len({sprites[i]["sprite"] == "Claw Grabber" for i in (17, 18, 25)})
2. not_blocked_by_sharks: [sprite_data[i]["sprite"] for i in (27, 28)].count("Shark")

These are resolved at export time by computing the actual sprite counts and
providing those as constants in the exported helpers.
"""

from ..base import BaseGameExportHandler
from typing import Any, Callable, Dict, Optional, Set
import logging
import re

logger = logging.getLogger(__name__)


class Marioland2GameExportHandler(BaseGameExportHandler):
    """Super Mario Land 2 specific export handler."""

    # Blacklist all coin helpers that call is_auto_scroll.
    # These can't be analyzed automatically because is_auto_scroll accesses
    # runtime world data (auto_scroll_levels). We provide custom definitions instead.
    HELPERS_TO_EXPORT_BLACKLIST: Set[str] = {
        'mushroom_zone_coins',
        'tree_zone_1_coins',
        'tree_zone_2_coins',
        'tree_zone_3_coins',
        'tree_zone_4_coins',
        'tree_zone_5_coins',
        'hippo_zone_coins',
        'macro_zone_1_coins',
        'macro_zone_2_coins',
        'macro_zone_3_coins',
        'macro_zone_4_coins',
        'mario_zone_1_coins',
        'mario_zone_3_coins',
        'mario_zone_4_coins',
        'pumpkin_zone_1_coins',
        'pumpkin_zone_2_coins',
        'pumpkin_zone_secret_course_1_coins',
        'pumpkin_zone_3_coins',
        'pumpkin_zone_4_coins',
        'space_zone_1_coins',
        'space_zone_2_coins',
        'space_zone_secret_course_coins',
        'turtle_zone_1_coins',
        'turtle_zone_2_coins',
        'turtle_zone_3_coins',
        # These don't call is_auto_scroll but are still complex:
        'turtle_zone_secret_course_coins',
        'macro_zone_secret_course_coins',
        # This helper accesses options.shuffle_midway_bells which is runtime data:
        'space_zone_2_boss',
    }

    # Whitelist the helpers we want to ensure are exported with custom definitions
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = {
        'is_auto_scroll',
        'not_blocked_by_sharks',
    }

    def __init__(self, world=None):
        super().__init__(world=world)
        self._sprite_computations = {}
        self._world = world
        self._auto_scroll_computed = False

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """
        Get helper definitions, providing custom versions for helpers that
        access dynamic world data (sprite_data, auto_scroll_levels).
        """
        # Get base helper definitions
        try:
            helpers = super().get_helper_definitions(world)
        except Exception as e:
            logger.warning(f"Base helper discovery had errors: {e}")
            helpers = {}

        # Compute sprite values
        self._compute_sprite_values(world)

        # Provide custom is_auto_scroll definition
        # This helper checks auto_scroll_levels[level_id] - we export it as a lookup
        if hasattr(world, 'auto_scroll_levels'):
            helpers['is_auto_scroll'] = self._build_is_auto_scroll_helper(world.auto_scroll_levels)

        # Provide custom not_blocked_by_sharks definition
        shark_count = self._sprite_computations.get('turtle_zone_1_sharks', 0)
        helpers['not_blocked_by_sharks'] = self._build_not_blocked_by_sharks_helper(shark_count)

        # Provide custom definitions for all coin helpers
        claw_set_len = self._sprite_computations.get('mario_zone_3_claw_set_len', 1)
        helpers['mario_zone_3_coins'] = self._build_mario_zone_3_coins_helper(claw_set_len)
        helpers['turtle_zone_1_coins'] = self._build_turtle_zone_1_coins_helper(shark_count)

        # Add definitions for all other coin helpers
        helpers['mushroom_zone_coins'] = self._build_mushroom_zone_coins_helper()
        helpers['tree_zone_1_coins'] = self._build_tree_zone_1_coins_helper()
        helpers['tree_zone_2_coins'] = self._build_tree_zone_2_coins_helper()
        helpers['tree_zone_3_coins'] = self._build_tree_zone_3_coins_helper()
        helpers['tree_zone_4_coins'] = self._build_tree_zone_4_coins_helper()
        helpers['tree_zone_5_coins'] = self._build_tree_zone_5_coins_helper()
        helpers['pumpkin_zone_1_coins'] = self._build_pumpkin_zone_1_coins_helper()
        helpers['pumpkin_zone_2_coins'] = self._build_pumpkin_zone_2_coins_helper()
        helpers['pumpkin_zone_secret_course_1_coins'] = self._build_pumpkin_zone_secret_course_1_coins_helper()
        helpers['pumpkin_zone_3_coins'] = self._build_pumpkin_zone_3_coins_helper()
        helpers['pumpkin_zone_4_coins'] = self._build_pumpkin_zone_4_coins_helper()
        helpers['mario_zone_1_coins'] = self._build_mario_zone_1_coins_helper()
        helpers['mario_zone_4_coins'] = self._build_mario_zone_4_coins_helper()
        helpers['turtle_zone_2_coins'] = self._build_turtle_zone_2_coins_helper()
        helpers['turtle_zone_3_coins'] = self._build_turtle_zone_3_coins_helper()
        helpers['turtle_zone_secret_course_coins'] = self._build_turtle_zone_secret_course_coins_helper()
        helpers['hippo_zone_coins'] = self._build_hippo_zone_coins_helper()
        helpers['space_zone_1_coins'] = self._build_space_zone_1_coins_helper()
        helpers['space_zone_2_coins'] = self._build_space_zone_2_coins_helper()
        helpers['space_zone_secret_course_coins'] = self._build_space_zone_secret_course_coins_helper()
        helpers['macro_zone_1_coins'] = self._build_macro_zone_1_coins_helper()
        helpers['macro_zone_2_coins'] = self._build_macro_zone_2_coins_helper()
        helpers['macro_zone_3_coins'] = self._build_macro_zone_3_coins_helper()
        helpers['macro_zone_4_coins'] = self._build_macro_zone_4_coins_helper()
        helpers['macro_zone_secret_course_coins'] = self._build_macro_zone_secret_course_coins_helper()

        # Build space_zone_2_boss helper with pre-computed shuffle_midway_bells value
        shuffle_midway_bells = True  # Default value
        if hasattr(world, 'options') and hasattr(world.options, 'shuffle_midway_bells'):
            shuffle_midway_bells = bool(world.options.shuffle_midway_bells.value)
        helpers['space_zone_2_boss'] = self._build_space_zone_2_boss_helper(shuffle_midway_bells)

        return helpers

    def _build_is_auto_scroll_helper(self, auto_scroll_levels_list: list) -> Dict[str, Any]:
        """
        Build is_auto_scroll helper using pre-computed auto_scroll_levels.

        In the original code, auto_scroll_levels is a list indexed by level_id (int).
        We need to use level_name_to_id to convert level names to indices.

        Since this is seed-specific data, we pre-compute which levels are auto-scroll
        and return explicit checks for each level with their specific cancel items.

        Args:
            auto_scroll_levels_list: List of auto-scroll values indexed by level_id
        """
        # Get the level_name_to_id mapping from the world's locations module
        try:
            from worlds.marioland2.locations import level_name_to_id
        except ImportError:
            logger.warning("Could not import level_name_to_id, using empty mapping")
            level_name_to_id = {}

        auto_scroll_levels = auto_scroll_levels_list if auto_scroll_levels_list else []

        # Build a list of level names that have auto-scroll enabled (value > 0)
        auto_scroll_level_names = []
        for level_name, level_id in level_name_to_id.items():
            if level_id < len(auto_scroll_levels) and auto_scroll_levels[level_id] > 0:
                auto_scroll_level_names.append(level_name)

        logger.debug(f"Auto-scroll levels: {auto_scroll_level_names}")

        if not auto_scroll_level_names:
            # No auto-scroll levels - always returns False
            # Still include params so the generated function accepts the level argument
            return {'params': ['level'], 'body': {'type': 'constant', 'value': False}}

        # Build explicit checks for each auto-scroll level with their level-specific cancel items.
        # For each level: (level == "LevelName") AND NOT has_any(["Cancel Auto Scroll", "Cancel Auto Scroll - LevelName"])
        # Combine all with OR - if any level matches and isn't cancelled, return True.
        level_conditions = []
        for level_name in auto_scroll_level_names:
            cancel_items = ['Cancel Auto Scroll', f'Cancel Auto Scroll - {level_name}']
            level_conditions.append({
                'type': 'and',
                'conditions': [
                    # Check if this is the level being queried
                    {
                        'type': 'compare',
                        'left': {'type': 'name', 'name': 'level'},
                        'op': '==',
                        'right': {'type': 'constant', 'value': level_name}
                    },
                    # AND not has_any(["Cancel Auto Scroll", "Cancel Auto Scroll - LevelName"])
                    {
                        'type': 'not',
                        'condition': {
                            'type': 'state_method',
                            'method': 'has_any',
                            'args': [{'type': 'constant', 'value': cancel_items}]
                        }
                    }
                ]
            })

        # If only one auto-scroll level, just return that condition directly
        if len(level_conditions) == 1:
            return {
                'params': ['level'],
                'body': level_conditions[0]
            }

        # Multiple auto-scroll levels - combine with OR
        return {
            'params': ['level'],
            'body': {
                'type': 'or',
                'conditions': level_conditions
            }
        }

    def _compute_sprite_values(self, world) -> Dict[str, Any]:
        """
        Pre-compute sprite-dependent values from the world's sprite_data.

        These values are constant for a given seed and affect rule evaluation.
        Computing them at export time allows the exporter to emit simpler code.
        """
        if self._sprite_computations:
            return self._sprite_computations

        if not hasattr(world, 'sprite_data') or not world.sprite_data:
            logger.debug("No sprite_data available for pre-computation")
            return {}

        sprite_data = world.sprite_data

        # Mario Zone 3: Compute the set length for claw grabber check
        # The original code: len({sprites[i]["sprite"] == "Claw Grabber" for i in (17, 18, 25)})
        # Creates a set of booleans, so len is at most 2
        if 'Mario Zone 3' in sprite_data:
            mz3_sprites = sprite_data['Mario Zone 3']
            booleans = set()
            for i in (17, 18, 25):
                if i < len(mz3_sprites):
                    is_claw = mz3_sprites[i].get('sprite') == 'Claw Grabber'
                    booleans.add(is_claw)
            # The set length is what's used in the rule
            self._sprite_computations['mario_zone_3_claw_set_len'] = len(booleans) if booleans else 1
            logger.debug(f"Mario Zone 3 claw set len: {self._sprite_computations['mario_zone_3_claw_set_len']}")

        # Turtle Zone 1: Count Sharks at specific positions
        # The original code: [sprite_data[i]["sprite"] for i in (27, 28)].count("Shark")
        if 'Turtle Zone 1' in sprite_data:
            tz1_sprites = sprite_data['Turtle Zone 1']
            shark_count = sum(
                1 for i in (27, 28)
                if i < len(tz1_sprites) and tz1_sprites[i].get('sprite') == 'Shark'
            )
            self._sprite_computations['turtle_zone_1_sharks'] = shark_count
            logger.debug(f"Turtle Zone 1 Shark count: {shark_count}")

        return self._sprite_computations

    def get_world_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export marioland2 specific world data including pre-computed sprite values."""
        world_data = super().get_world_data(world, multiworld, player)

        # Compute sprite-dependent values
        sprite_computations = self._compute_sprite_values(world)
        if sprite_computations:
            world_data['sprite_computations'] = sprite_computations

        return world_data

    def _build_mario_zone_3_coins_helper(self, claw_set_len: int) -> Dict[str, Any]:
        """
        Build the mario_zone_3_coins helper with pre-computed claw grabber set length.

        Original logic:
        def mario_zone_3_coins(state, player, coins):
            auto_scroll = is_auto_scroll(state, player, "Mario Zone 3")
            reachable_coins = 10
            if state.has("Carrot", player):
                reachable_spike_coins = 15
            else:
                sprites = state.multiworld.worlds[player].sprite_data["Mario Zone 3"]
                reachable_spike_coins = min(3, len({sprites[i]["sprite"] == "Claw Grabber" for i in (17, 18, 25)})
                                            + state.has("Mushroom", player) + state.has("Fire Flower", player)) * 5
            reachable_coins += reachable_spike_coins
            if not auto_scroll:
                reachable_coins += 10
            if state.has("Fire Flower", player):
                reachable_coins += 22
                if auto_scroll:
                    reachable_coins -= 3 + reachable_spike_coins
            return coins <= reachable_coins
        """
        # For now, return a simplified version that uses the pre-computed claw_set_len
        # The frontend will need to evaluate this
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    # auto_scroll = is_auto_scroll(state, player, "Mario Zone 3")
                    {
                        'type': 'assign',
                        'name': 'auto_scroll',
                        'value': {
                            'type': 'helper',
                            'name': 'is_auto_scroll',
                            'args': [{'type': 'constant', 'value': 'Mario Zone 3'}]
                        }
                    },
                    # reachable_coins = 10
                    {
                        'type': 'assign',
                        'name': 'reachable_coins',
                        'value': {'type': 'constant', 'value': 10}
                    },
                    # if state.has("Carrot", player): reachable_spike_coins = 15 else: ...
                    {
                        'type': 'if_statement',
                        'test': {'type': 'item_check', 'item': 'Carrot'},
                        'body': [
                            {
                                'type': 'assign',
                                'name': 'reachable_spike_coins',
                                'value': {'type': 'constant', 'value': 15}
                            }
                        ],
                        'orelse': [
                            # reachable_spike_coins = min(3, claw_set_len + has_mushroom + has_fire_flower) * 5
                            {
                                'type': 'assign',
                                'name': 'reachable_spike_coins',
                                'value': {
                                    'type': 'binary_op',
                                    'left': {
                                        'type': 'call',
                                        'func': 'min',
                                        'args': [
                                            {'type': 'constant', 'value': 3},
                                            {
                                                'type': 'binary_op',
                                                'left': {
                                                    'type': 'binary_op',
                                                    'left': {'type': 'constant', 'value': claw_set_len},
                                                    'op': '+',
                                                    'right': {
                                                        'type': 'state_method',
                                                        'method': 'has',
                                                        'args': [{'type': 'constant', 'value': 'Mushroom'}]
                                                    }
                                                },
                                                'op': '+',
                                                'right': {
                                                    'type': 'state_method',
                                                    'method': 'has',
                                                    'args': [{'type': 'constant', 'value': 'Fire Flower'}]
                                                }
                                            }
                                        ]
                                    },
                                    'op': '*',
                                    'right': {'type': 'constant', 'value': 5}
                                }
                            }
                        ]
                    },
                    # reachable_coins += reachable_spike_coins
                    {
                        'type': 'aug_assign',
                        'target': 'reachable_coins',
                        'op': '+',
                        'value': {'type': 'name', 'name': 'reachable_spike_coins'}
                    },
                    # if not auto_scroll: reachable_coins += 10
                    {
                        'type': 'if_statement',
                        'test': {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}},
                        'body': [
                            {
                                'type': 'aug_assign',
                                'target': 'reachable_coins',
                                'op': '+',
                                'value': {'type': 'constant', 'value': 10}
                            }
                        ]
                    },
                    # if state.has("Fire Flower"): reachable_coins += 22; if auto_scroll: reachable_coins -= 3 + reachable_spike_coins
                    {
                        'type': 'if_statement',
                        'test': {'type': 'item_check', 'item': 'Fire Flower'},
                        'body': [
                            {
                                'type': 'aug_assign',
                                'target': 'reachable_coins',
                                'op': '+',
                                'value': {'type': 'constant', 'value': 22}
                            },
                            {
                                'type': 'if_statement',
                                'test': {'type': 'name', 'name': 'auto_scroll'},
                                'body': [
                                    {
                                        'type': 'aug_assign',
                                        'target': 'reachable_coins',
                                        'op': '-',
                                        'value': {
                                            'type': 'binary_op',
                                            'left': {'type': 'constant', 'value': 3},
                                            'op': '+',
                                            'right': {'type': 'name', 'name': 'reachable_spike_coins'}
                                        }
                                    }
                                ]
                            }
                        ]
                    },
                    # return coins <= reachable_coins
                    {
                        'type': 'return',
                        'value': {
                            'type': 'compare',
                            'left': {'type': 'name', 'name': 'coins'},
                            'op': '<=',
                            'right': {'type': 'name', 'name': 'reachable_coins'}
                        }
                    }
                ]
            }
        }

    def _build_not_blocked_by_sharks_helper(self, shark_count: int) -> Dict[str, Any]:
        """
        Build the not_blocked_by_sharks helper with pre-computed shark count.

        Original logic:
        def not_blocked_by_sharks(state, player):
            sharks = [state.multiworld.worlds[player].sprite_data["Turtle Zone 1"][i]["sprite"]
                      for i in (27, 28)].count("Shark")
            if state.has("Carrot", player) or not sharks:
                return True
            if sharks == 2:
                return state.has_all(["Mushroom", "Fire Flower"], player)
            if sharks == 1:
                return state.has_any(["Mushroom", "Fire Flower"], player)
            return False
        """
        # Build the rule based on shark_count
        if shark_count == 0:
            # No sharks - always accessible
            return {'type': 'constant', 'value': True}
        elif shark_count == 1:
            # 1 shark - need Carrot OR (Mushroom OR Fire Flower)
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Carrot'},
                    {
                        'type': 'state_method',
                        'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                    }
                ]
            }
        else:  # shark_count == 2
            # 2 sharks - need Carrot OR (Mushroom AND Fire Flower)
            return {
                'type': 'or',
                'conditions': [
                    {'type': 'item_check', 'item': 'Carrot'},
                    {
                        'type': 'state_method',
                        'method': 'has_all',
                        'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                    }
                ]
            }

    def _build_turtle_zone_1_coins_helper(self, shark_count: int) -> Dict[str, Any]:
        """
        Build the turtle_zone_1_coins helper.

        Original logic:
        def turtle_zone_1_coins(state, player, coins):
            auto_scroll = is_auto_scroll(state, player, "Turtle Zone 1")
            reachable_coins = 30
            if not_blocked_by_sharks(state, player):
                reachable_coins += 13
                if auto_scroll:
                    reachable_coins -= 1
            if state.has("Water Physics", player) or state.has("Carrot", player):
                reachable_coins += 10
            if state.has("Carrot", player):
                reachable_coins += 24
                if auto_scroll:
                    reachable_coins -= 10
            return coins <= reachable_coins
        """
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    # auto_scroll = is_auto_scroll(state, player, "Turtle Zone 1")
                    {
                        'type': 'assign',
                        'name': 'auto_scroll',
                        'value': {
                            'type': 'helper',
                            'name': 'is_auto_scroll',
                            'args': [{'type': 'constant', 'value': 'Turtle Zone 1'}]
                        }
                    },
                    # reachable_coins = 30
                    {
                        'type': 'assign',
                        'name': 'reachable_coins',
                        'value': {'type': 'constant', 'value': 30}
                    },
                    # if not_blocked_by_sharks(state, player): reachable_coins += 13 ...
                    {
                        'type': 'if_statement',
                        'test': {
                            'type': 'helper',
                            'name': 'not_blocked_by_sharks'
                        },
                        'body': [
                            {
                                'type': 'aug_assign',
                                'target': 'reachable_coins',
                                'op': '+',
                                'value': {'type': 'constant', 'value': 13}
                            },
                            {
                                'type': 'if_statement',
                                'test': {'type': 'name', 'name': 'auto_scroll'},
                                'body': [
                                    {
                                        'type': 'aug_assign',
                                        'target': 'reachable_coins',
                                        'op': '-',
                                        'value': {'type': 'constant', 'value': 1}
                                    }
                                ]
                            }
                        ]
                    },
                    # if state.has("Water Physics") or state.has("Carrot"): reachable_coins += 10
                    {
                        'type': 'if_statement',
                        'test': {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Water Physics'},
                                {'type': 'item_check', 'item': 'Carrot'}
                            ]
                        },
                        'body': [
                            {
                                'type': 'aug_assign',
                                'target': 'reachable_coins',
                                'op': '+',
                                'value': {'type': 'constant', 'value': 10}
                            }
                        ]
                    },
                    # if state.has("Carrot"): reachable_coins += 24 ...
                    {
                        'type': 'if_statement',
                        'test': {'type': 'item_check', 'item': 'Carrot'},
                        'body': [
                            {
                                'type': 'aug_assign',
                                'target': 'reachable_coins',
                                'op': '+',
                                'value': {'type': 'constant', 'value': 24}
                            },
                            {
                                'type': 'if_statement',
                                'test': {'type': 'name', 'name': 'auto_scroll'},
                                'body': [
                                    {
                                        'type': 'aug_assign',
                                        'target': 'reachable_coins',
                                        'op': '-',
                                        'value': {'type': 'constant', 'value': 10}
                                    }
                                ]
                            }
                        ]
                    },
                    # return coins <= reachable_coins
                    {
                        'type': 'return',
                        'value': {
                            'type': 'compare',
                            'left': {'type': 'name', 'name': 'coins'},
                            'op': '<=',
                            'right': {'type': 'name', 'name': 'reachable_coins'}
                        }
                    }
                ]
            }
        }

    # -------------------------------------------------------------------------
    # Coin helper builders for all zones
    # These are converted from worlds/marioland2/logic.py
    # -------------------------------------------------------------------------

    def _build_mushroom_zone_coins_helper(self) -> Dict[str, Any]:
        """Build mushroom_zone_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Mushroom Zone'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 38}},
                    {'type': 'if_statement', 'test': {
                        'type': 'or', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]},
                            {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 2}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 19}},
                        {'type': 'if_statement', 'test': {
                            'type': 'or', 'conditions': [
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 5}}
                        ]},
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 20}},
                            {'type': 'if_statement', 'test': {
                                'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 4}}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_tree_zone_1_coins_helper(self) -> Dict[str, Any]:
        """coins <= 87 or not is_auto_scroll("Tree Zone 1")"""
        return {
            'params': ['coins'],
            'body': {
                'type': 'or',
                'conditions': [
                    {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                     'op': '<=', 'right': {'type': 'constant', 'value': 87}},
                    {'type': 'not', 'condition': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Tree Zone 1'}]
                    }}
                ]
            }
        }

    def _build_tree_zone_2_coins_helper(self) -> Dict[str, Any]:
        """Build tree_zone_2_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Tree Zone 2'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 18}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 38}},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 12}},
                            {'type': 'if_statement', 'test': {
                                'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 30}}
                            ]}
                        ]}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Tree Zone 2 Midway Bell'},
                         'body': [
                            {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 30}},
                            {'type': 'if_statement', 'test': {
                                'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 8}}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_tree_zone_3_coins_helper(self) -> Dict[str, Any]:
        """Build tree_zone_3_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'if_statement', 'test': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Tree Zone 3'}]
                    }, 'body': [
                        {'type': 'return', 'value': {
                            'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                            'op': '<=', 'right': {'type': 'constant', 'value': 4}
                        }}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'constant', 'value': 19}
                    }, 'body': [
                        {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]},
                            {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                             'op': '<=', 'right': {'type': 'constant', 'value': 21}}
                        ]
                    }, 'body': [
                        {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                    ]},
                    {'type': 'return', 'value': {'type': 'item_check', 'item': 'Carrot'}}
                ]
            }
        }

    def _build_tree_zone_4_coins_helper(self) -> Dict[str, Any]:
        """
        Build tree_zone_4_coins helper matching the original logic.

        Original logic calculates reachable_coins_from_start and reachable_coins_from_bell
        separately, then returns coins <= max(start, bell).

        Bell path logic:
        - If pipe_down AND (auto_scroll OR NOT pipe_left): +10 (final_room only)
        - elif pipe_left AND NOT auto_scroll:
            - If pipe_down: +31, then if pipe_right: +18, then if pipe_up: +25
            - else: +18 (just entryway + hall)
        """
        # Helper functions to create pipe checks
        def has_pipe_up():
            return {'type': 'state_method', 'method': 'has_any',
                    'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]}

        def has_pipe_down():
            return {'type': 'state_method', 'method': 'has_any',
                    'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]}

        def has_pipe_left():
            return {'type': 'state_method', 'method': 'has_any',
                    'args': [{'type': 'constant', 'value': ['Pipe Traversal - Left', 'Pipe Traversal']}]}

        def has_pipe_right():
            return {'type': 'state_method', 'method': 'has_any',
                    'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]}

        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    # auto_scroll = is_auto_scroll("Tree Zone 4")
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Tree Zone 4'}]
                    }},
                    # reachable_coins_from_start = 0
                    {'type': 'assign', 'name': 'reachable_coins_from_start', 'value': {'type': 'constant', 'value': 0}},
                    # reachable_coins_from_bell = 0
                    {'type': 'assign', 'name': 'reachable_coins_from_bell', 'value': {'type': 'constant', 'value': 0}},

                    # Start path: if has_pipe_up
                    {'type': 'if_statement', 'test': has_pipe_up(), 'body': [
                        # reachable_coins_from_start += 14 (entryway)
                        {'type': 'aug_assign', 'target': 'reachable_coins_from_start', 'op': '+',
                         'value': {'type': 'constant', 'value': 14}},
                        {'type': 'if_statement', 'test': has_pipe_right(), 'body': [
                            # reachable_coins_from_start += 4 (hall)
                            {'type': 'aug_assign', 'target': 'reachable_coins_from_start', 'op': '+',
                             'value': {'type': 'constant', 'value': 4}},
                            {'type': 'if_statement', 'test': has_pipe_down(), 'body': [
                                {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                                 'body': [
                                    # +12 (downstairs_with_auto_scroll)
                                    {'type': 'aug_assign', 'target': 'reachable_coins_from_start', 'op': '+',
                                     'value': {'type': 'constant', 'value': 12}}
                                ], 'orelse': [
                                    # +56 (final_room + first_trip_downstairs + second_trip_downstairs = 10+31+15)
                                    {'type': 'aug_assign', 'target': 'reachable_coins_from_start', 'op': '+',
                                     'value': {'type': 'constant', 'value': 56}}
                                ]}
                            ]}
                        ]}
                    ]},

                    # Bell path: if has Tree Zone 4 Midway Bell
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Tree Zone 4 Midway Bell'},
                     'body': [
                        # if has_pipe_down AND (auto_scroll OR NOT has_pipe_left)
                        {'type': 'if_statement', 'test': {
                            'type': 'and', 'conditions': [
                                has_pipe_down(),
                                {'type': 'or', 'conditions': [
                                    {'type': 'name', 'name': 'auto_scroll'},
                                    {'type': 'not', 'condition': has_pipe_left()}
                                ]}
                            ]
                        }, 'body': [
                            # reachable_coins_from_bell += 10 (final_room)
                            {'type': 'aug_assign', 'target': 'reachable_coins_from_bell', 'op': '+',
                             'value': {'type': 'constant', 'value': 10}}
                        ], 'orelse': [
                            # elif has_pipe_left AND NOT auto_scroll
                            {'type': 'if_statement', 'test': {
                                'type': 'and', 'conditions': [
                                    has_pipe_left(),
                                    {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                                ]
                            }, 'body': [
                                {'type': 'if_statement', 'test': has_pipe_down(), 'body': [
                                    # reachable_coins_from_bell += 31 (first_trip_downstairs)
                                    {'type': 'aug_assign', 'target': 'reachable_coins_from_bell', 'op': '+',
                                     'value': {'type': 'constant', 'value': 31}},
                                    {'type': 'if_statement', 'test': has_pipe_right(), 'body': [
                                        # reachable_coins_from_bell += 18 (entryway + hall)
                                        {'type': 'aug_assign', 'target': 'reachable_coins_from_bell', 'op': '+',
                                         'value': {'type': 'constant', 'value': 18}},
                                        {'type': 'if_statement', 'test': has_pipe_up(), 'body': [
                                            # reachable_coins_from_bell += 25 (second_trip_downstairs + final_room)
                                            {'type': 'aug_assign', 'target': 'reachable_coins_from_bell', 'op': '+',
                                             'value': {'type': 'constant', 'value': 25}}
                                        ]}
                                    ]}
                                ], 'orelse': [
                                    # reachable_coins_from_bell += 18 (entryway + hall)
                                    {'type': 'aug_assign', 'target': 'reachable_coins_from_bell', 'op': '+',
                                     'value': {'type': 'constant', 'value': 18}}
                                ]}
                            ]}
                        ]}
                    ]},

                    # return coins <= max(reachable_coins_from_start, reachable_coins_from_bell)
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {
                            'type': 'call', 'func': 'max',
                            'args': [
                                {'type': 'name', 'name': 'reachable_coins_from_start'},
                                {'type': 'name', 'name': 'reachable_coins_from_bell'}
                            ]
                        }
                    }}
                ]
            }
        }

    def _build_tree_zone_5_coins_helper(self) -> Dict[str, Any]:
        """Build tree_zone_5_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Tree Zone 5'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 0}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 2}}
                    ]},
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                     'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 18}},
                        {'type': 'if_statement', 'test': {
                            'type': 'and', 'conditions': [
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 13}}
                        ]}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 13}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_pumpkin_zone_1_coins_helper(self) -> Dict[str, Any]:
        """Build pumpkin_zone_1_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Pumpkin Zone 1'}]
                    }},
                    {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                     'body': [
                        {'type': 'return', 'value': {
                            'type': 'and', 'conditions': [
                                {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                                 'op': '<=', 'right': {'type': 'constant', 'value': 12}},
                                {'type': 'item_check', 'item': 'Pumpkin Zone 1 Midway Bell'}
                            ]
                        }}
                    ]},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 0}},
                    {'type': 'if_statement', 'test': {
                        'type': 'or', 'conditions': [
                            {'type': 'item_check', 'item': 'Pumpkin Zone 1 Midway Bell'},
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 38}},
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 2}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_pumpkin_zone_2_coins_helper(self) -> Dict[str, Any]:
        """Build pumpkin_zone_2_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Pumpkin Zone 2'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 17}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                    }, 'body': [
                        {'type': 'if_statement', 'test': {
                            'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 7}}
                        ]},
                        {'type': 'if_statement', 'test': {
                            'type': 'and', 'conditions': [
                                {'type': 'or', 'conditions': [
                                    {'type': 'state_method', 'method': 'has_any',
                                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                                    {'type': 'name', 'name': 'auto_scroll'}
                                ]},
                                {'type': 'item_check', 'item': 'Water Physics'}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 6}},
                            {'type': 'if_statement', 'test': {
                                'type': 'and', 'conditions': [
                                    {'type': 'state_method', 'method': 'has_any',
                                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                                    {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                                ]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 1}},
                                {'type': 'if_statement', 'test': {
                                    'type': 'state_method', 'method': 'has_any',
                                    'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                                }, 'body': [
                                    {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                     'value': {'type': 'constant', 'value': 5}}
                                ]}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_pumpkin_zone_secret_course_1_coins_helper(self) -> Dict[str, Any]:
        """Build pumpkin_zone_secret_course_1_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Pumpkin Zone Secret Course 1'}]
                    }},
                    {'type': 'if_statement', 'test': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'constant', 'value': 40}
                    }, 'body': [
                        {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                    ]},
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                     'body': [
                        {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                         'body': [
                            {'type': 'return', 'value': {
                                'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                                'op': '<=', 'right': {'type': 'constant', 'value': 172}
                            }}
                        ], 'orelse': [
                            {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {'type': 'constant', 'value': False}}
                ]
            }
        }

    def _build_pumpkin_zone_3_coins_helper(self) -> Dict[str, Any]:
        """Build pumpkin_zone_3_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Pumpkin Zone 3'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 38}},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                            {'type': 'or', 'conditions': [
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}},
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]}
                            ]}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 12}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]},
                            {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 11}}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_pumpkin_zone_4_coins_helper(self) -> Dict[str, Any]:
        """Build pumpkin_zone_4_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Pumpkin Zone 4'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 29}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                    }, 'body': [
                        {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                         'body': [
                            {'type': 'if_statement', 'test': {
                                'type': 'state_method', 'method': 'has_any',
                                'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 16}}
                            ], 'orelse': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 4}}
                            ]}
                        ], 'orelse': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 28}},
                            {'type': 'if_statement', 'test': {
                                'type': 'state_method', 'method': 'has_any',
                                'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 16}}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_mario_zone_1_coins_helper(self) -> Dict[str, Any]:
        """Build mario_zone_1_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Mario Zone 1'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 0}},
                    {'type': 'if_statement', 'test': {
                        'type': 'or', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                            {'type': 'and', 'conditions': [
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Left', 'Pipe Traversal']}]},
                                {'type': 'item_check', 'item': 'Mario Zone 1 Midway Bell'},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 32}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                            {'type': 'or', 'conditions': [
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower', 'Carrot']}]},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 8}},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 28}}
                        ], 'orelse': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 12}}
                        ]},
                        {'type': 'if_statement', 'test': {
                            'type': 'and', 'conditions': [
                                {'type': 'item_check', 'item': 'Fire Flower'},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 46}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_mario_zone_4_coins_helper(self) -> Dict[str, Any]:
        """coins <= 60 or not is_auto_scroll("Mario Zone 4")"""
        return {
            'params': ['coins'],
            'body': {
                'type': 'or',
                'conditions': [
                    {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                     'op': '<=', 'right': {'type': 'constant', 'value': 60}},
                    {'type': 'not', 'condition': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Mario Zone 4'}]
                    }}
                ]
            }
        }

    def _build_turtle_zone_2_coins_helper(self) -> Dict[str, Any]:
        """Build turtle_zone_2_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Turtle Zone 2'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 2}},
                    {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                     'body': [
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Water Physics'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 6}}
                        ]}
                    ], 'orelse': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 2}},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Water Physics'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 20}}
                        ], 'orelse': [
                            {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Turtle Zone 2 Midway Bell'},
                             'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 4}}
                            ]}
                        ]},
                        {'type': 'if_statement', 'test': {
                            'type': 'and', 'conditions': [
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]},
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Water Physics', 'Turtle Zone 2 Midway Bell']}]}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 1}},
                            {'type': 'if_statement', 'test': {
                                'type': 'and', 'conditions': [
                                    {'type': 'state_method', 'method': 'has_any',
                                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Left', 'Pipe Traversal']}]},
                                    {'type': 'state_method', 'method': 'has_any',
                                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]}
                                ]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 1}},
                                {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Water Physics'},
                                 'body': [
                                    {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                     'value': {'type': 'constant', 'value': 1}}
                                ]}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_turtle_zone_3_coins_helper(self) -> Dict[str, Any]:
        """Build turtle_zone_3_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'or',
                'conditions': [
                    {'type': 'state_method', 'method': 'has_any',
                     'args': [{'type': 'constant', 'value': ['Water Physics', 'Mushroom', 'Fire Flower', 'Carrot']}]},
                    {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                     'op': '<=', 'right': {'type': 'constant', 'value': 51}}
                ]
            }
        }

    def _build_turtle_zone_secret_course_coins_helper(self) -> Dict[str, Any]:
        """Build turtle_zone_secret_course_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 53}},
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                     'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 44}}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Fire Flower'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 36}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_hippo_zone_coins_helper(self) -> Dict[str, Any]:
        """Build hippo_zone_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Hippo Zone'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 4}},
                    {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                     'body': [
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Hippo Bubble'},
                         'body': [
                            {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 160}}
                        ], 'orelse': [
                            {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                             'body': [
                                {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 90}}
                            ], 'orelse': [
                                {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Water Physics'},
                                 'body': [
                                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 28}}
                                ]}
                            ]}
                        ]}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Water Physics', 'Hippo Bubble', 'Carrot']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 108}},
                            {'type': 'if_statement', 'test': {
                                'type': 'state_method', 'method': 'has_any',
                                'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower', 'Hippo Bubble']}]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 6}}
                            ]}
                        ]},
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_all',
                            'args': [{'type': 'constant', 'value': ['Fire Flower', 'Water Physics']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 1}}
                        ]},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Hippo Bubble'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 52}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_space_zone_1_coins_helper(self) -> Dict[str, Any]:
        """Build space_zone_1_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Space Zone 1'}]
                    }},
                    {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                     'body': [
                        {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 12}},
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Carrot', 'Space Physics']}]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 20}}
                        ]},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Space Physics'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 40}}
                        ]},
                        {'type': 'return', 'value': {
                            'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                            'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                        }}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'or', 'conditions': [
                            {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                             'op': '<=', 'right': {'type': 'constant', 'value': 21}},
                            {'type': 'and', 'conditions': [
                                {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                                 'op': '<=', 'right': {'type': 'constant', 'value': 50}},
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]}
                            ]},
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Carrot', 'Space Physics']}]}
                        ]
                    }}
                ]
            }
        }

    def _build_space_zone_2_coins_helper(self) -> Dict[str, Any]:
        """Build space_zone_2_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Space Zone 2'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 12}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower', 'Carrot', 'Space Physics']}]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 15}},
                        {'type': 'if_statement', 'test': {
                            'type': 'or', 'conditions': [
                                {'type': 'item_check', 'item': 'Space Physics'},
                                {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                            ]
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 4}}
                        ]}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'or', 'conditions': [
                            {'type': 'item_check', 'item': 'Space Physics'},
                            {'type': 'and', 'conditions': [
                                {'type': 'item_check', 'item': 'Mushroom'},
                                {'type': 'state_method', 'method': 'has_any',
                                 'args': [{'type': 'constant', 'value': ['Fire Flower', 'Carrot']}]}
                            ]}
                        ]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 3}}
                    ]},
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Space Physics'},
                     'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 79}},
                        {'type': 'if_statement', 'test': {
                            'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                        }, 'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 21}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_space_zone_secret_course_coins_helper(self) -> Dict[str, Any]:
        """coins <= 96 or not is_auto_scroll("Space Zone Secret Course")"""
        return {
            'params': ['coins'],
            'body': {
                'type': 'or',
                'conditions': [
                    {'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                     'op': '<=', 'right': {'type': 'constant', 'value': 96}},
                    {'type': 'not', 'condition': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Space Zone Secret Course'}]
                    }}
                ]
            }
        }

    def _build_macro_zone_1_coins_helper(self) -> Dict[str, Any]:
        """Build macro_zone_1_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Macro Zone 1'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 0}},
                    {'type': 'if_statement', 'test': {
                        'type': 'state_method', 'method': 'has_any',
                        'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 69}},
                        {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                         'body': [
                            {'type': 'if_statement', 'test': {
                                'type': 'state_method', 'method': 'has_any',
                                'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 5}}
                            ]}
                        ], 'orelse': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 9}},
                            {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Fire Flower'},
                             'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 19}}
                            ]}
                        ]}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Macro Zone 1 Midway Bell'},
                         'body': [
                            {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                             'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 16}},
                                {'type': 'if_statement', 'test': {
                                    'type': 'state_method', 'method': 'has_any',
                                    'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
                                }, 'body': [
                                    {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                     'value': {'type': 'constant', 'value': 5}}
                                ]}
                            ], 'orelse': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 67}}
                            ]}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_macro_zone_2_coins_helper(self) -> Dict[str, Any]:
        """Build macro_zone_2_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Macro Zone 2'}]
                    }},
                    {'type': 'if_statement', 'test': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'constant', 'value': 27}
                    }, 'body': [
                        {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                            {'type': 'item_check', 'item': 'Water Physics'},
                            {'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}}
                        ]
                    }, 'body': [
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                        }, 'body': [
                            {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                        ]},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Macro Zone 2 Midway Bell'},
                         'body': [
                            {'type': 'return', 'value': {
                                'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                                'op': '<=', 'right': {'type': 'constant', 'value': 42}
                            }}
                        ]}
                    ]},
                    {'type': 'return', 'value': {'type': 'constant', 'value': False}}
                ]
            }
        }

    def _build_macro_zone_3_coins_helper(self) -> Dict[str, Any]:
        """Build macro_zone_3_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Macro Zone 3'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 7}},
                    {'type': 'if_statement', 'test': {
                        'type': 'not', 'condition': {'type': 'name', 'name': 'auto_scroll'}
                    }, 'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                         'value': {'type': 'constant', 'value': 17}}
                    ]},
                    {'type': 'if_statement', 'test': {
                        'type': 'and', 'conditions': [
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]},
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]}
                        ]
                    }, 'body': [
                        {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 56}}
                        ], 'orelse': [
                            {'type': 'return', 'value': {'type': 'constant', 'value': True}}
                        ]}
                    ], 'orelse': [
                        {'type': 'if_statement', 'test': {
                            'type': 'state_method', 'method': 'has_any',
                            'args': [{'type': 'constant', 'value': ['Pipe Traversal - Up', 'Pipe Traversal']}]
                        }, 'body': [
                            {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                             'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 12}}
                            ], 'orelse': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 36}}
                            ]}
                        ], 'orelse': [
                            {'type': 'if_statement', 'test': {
                                'type': 'state_method', 'method': 'has_any',
                                'args': [{'type': 'constant', 'value': ['Pipe Traversal - Down', 'Pipe Traversal']}]
                            }, 'body': [
                                {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                                 'value': {'type': 'constant', 'value': 18}}
                            ]}
                        ]}
                    ]},
                    {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Macro Zone 3 - Midway Bell'},
                     'body': [
                        {'type': 'if_statement', 'test': {
                            'type': 'compare', 'left': {'type': 'constant', 'value': 30},
                            'op': '>', 'right': {'type': 'name', 'name': 'reachable_coins'}
                        }, 'body': [
                            {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 30}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_macro_zone_4_coins_helper(self) -> Dict[str, Any]:
        """Build macro_zone_4_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'block',
                'statements': [
                    {'type': 'assign', 'name': 'auto_scroll', 'value': {
                        'type': 'helper', 'name': 'is_auto_scroll',
                        'args': [{'type': 'constant', 'value': 'Macro Zone 4'}]
                    }},
                    {'type': 'assign', 'name': 'reachable_coins', 'value': {'type': 'constant', 'value': 61}},
                    {'type': 'if_statement', 'test': {'type': 'name', 'name': 'auto_scroll'},
                     'body': [
                        {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '-',
                         'value': {'type': 'constant', 'value': 8}},
                        {'type': 'if_statement', 'test': {'type': 'item_check', 'item': 'Carrot'},
                         'body': [
                            {'type': 'aug_assign', 'target': 'reachable_coins', 'op': '+',
                             'value': {'type': 'constant', 'value': 6}}
                        ]}
                    ]},
                    {'type': 'return', 'value': {
                        'type': 'compare', 'left': {'type': 'name', 'name': 'coins'},
                        'op': '<=', 'right': {'type': 'name', 'name': 'reachable_coins'}
                    }}
                ]
            }
        }

    def _build_macro_zone_secret_course_coins_helper(self) -> Dict[str, Any]:
        """Build macro_zone_secret_course_coins helper."""
        return {
            'params': ['coins'],
            'body': {
                'type': 'state_method',
                'method': 'has_any',
                'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower']}]
            }
        }

    def _build_space_zone_2_boss_helper(self, shuffle_midway_bells: bool) -> Dict[str, Any]:
        """
        Build space_zone_2_boss helper with pre-computed shuffle_midway_bells value.

        Original logic:
        def space_zone_2_boss(state, player):
            if has_pipe_right(state, player):
                if state.has("Space Physics", player):
                    return True
                if (state.has("Space Zone 2 Midway Bell", player)
                        or not state.multiworld.worlds[player].options.shuffle_midway_bells):
                    if state.has_any(["Mushroom", "Fire Flower", "Carrot"], player):
                        return True
                else:
                    if state.has("Mushroom", player) and state.has_any(["Fire Flower", "Carrot"], player):
                        return True
            return False
        """
        if shuffle_midway_bells:
            # With shuffle_midway_bells enabled, need midway bell OR extra damage protection
            return {
                'type': 'and',
                'conditions': [
                    # has_pipe_right
                    {'type': 'state_method', 'method': 'has_any',
                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                    # Main condition
                    {'type': 'or', 'conditions': [
                        # Space Physics alone is enough
                        {'type': 'item_check', 'item': 'Space Physics'},
                        # With midway bell: need any damage item
                        {'type': 'and', 'conditions': [
                            {'type': 'item_check', 'item': 'Space Zone 2 Midway Bell'},
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower', 'Carrot']}]}
                        ]},
                        # Without midway bell: need Mushroom AND (Fire Flower OR Carrot)
                        {'type': 'and', 'conditions': [
                            {'type': 'item_check', 'item': 'Mushroom'},
                            {'type': 'state_method', 'method': 'has_any',
                             'args': [{'type': 'constant', 'value': ['Fire Flower', 'Carrot']}]}
                        ]}
                    ]}
                ]
            }
        else:
            # Without shuffle_midway_bells, midway bell is always accessible
            return {
                'type': 'and',
                'conditions': [
                    # has_pipe_right
                    {'type': 'state_method', 'method': 'has_any',
                     'args': [{'type': 'constant', 'value': ['Pipe Traversal - Right', 'Pipe Traversal']}]},
                    # Main condition
                    {'type': 'or', 'conditions': [
                        # Space Physics alone is enough
                        {'type': 'item_check', 'item': 'Space Physics'},
                        # Any damage item is enough (midway bell always available)
                        {'type': 'state_method', 'method': 'has_any',
                         'args': [{'type': 'constant', 'value': ['Mushroom', 'Fire Flower', 'Carrot']}]}
                    ]}
                ]
            }
