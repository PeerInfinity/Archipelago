"""An Untitled Story game-specific export handler.

An Untitled Story's helper functions are class methods on AUSRules,
so they cannot be automatically exported. This handler provides
manual helper definitions that the world generator can use.
"""

from typing import Any, Dict, Optional, Set
from ..base import GenericGameExportHandler


class AUSGameExportHandler(GenericGameExportHandler):
    """An Untitled Story game handler - provides helper definitions for AUSRules class methods."""

    # Item names from the apworld
    ITEM_JUMP_UPGRADE = "Jump Upgrade"
    ITEM_DOUBLE_JUMP = "Double Jump Upgrade"
    ITEM_RED_ENERGY = "Red Energy"
    ITEM_YELLOW_ENERGY = "Yellow Energy"
    ITEM_DUCKING = "Ducking"
    ITEM_STICKING = "Progressive Stick Slide"
    ITEM_DIVE_BOMB = "Dive Bomb"
    ITEM_SHOOT_FIRE = "Progressive Fire Shot"
    ITEM_SHOOT_ICE = "Ice Shot"
    ITEM_HATCH = "Hatch"
    ITEM_AIR_UPGRADE = "Air Upgrade"
    ITEM_GOLD_ORB = "Gold Orb"
    ITEM_FLOWER = "Flower"

    # Crystal drop values for total_money calculation
    BOSS_DROP_VALUES = {
        "50 Crystals": 50,
        "75 Crystals": 75,
        "110 Crystals": 110,
        "65 Crystals": 65,
        "125 Crystals": 125,
        "180 Crystals": 180,
        "270 Crystals": 270,
        "150 Crystals": 150,
        "200 Crystals": 200,
        "235 Crystals": 235,
        "245 Crystals": 245,
        "400 Crystals": 400,
        "300 Crystals": 300,
        "100 Crystals": 100,
    }

    # These helpers are complex and need to be preserved as helper calls
    # (not inlined during rule analysis)
    HELPERS_TO_PRESERVE: Set[str] = {
        'jump_height',
        'jump_height_min',
        'single_jump_min',
        'double_jump_height',
        'double_jump_min',
        'total_money',
        'can_divebomb',
        'can_duck',
        'can_stick',
        'can_slide',
        'has_fire',
        'has_range',
        'has_ice',
        'can_shoot',
        'can_light_torches',
        'has_red_energy',
        'has_yellow_energy',
        'hatched',
    }

    # ==========================================================================
    # Rule construction helpers
    # ==========================================================================

    def _item_check(self, item: str, count: Optional[int] = None) -> Dict[str, Any]:
        """Create an item_check rule."""
        rule: Dict[str, Any] = {'type': 'item_check', 'item': item}
        if count is not None:
            rule['count'] = count
        return rule

    def _item_count(self, item: str) -> Dict[str, Any]:
        """Create a state.count() call that returns an integer."""
        return {
            'type': 'state_method',
            'method': 'count',
            'args': [
                {'type': 'constant', 'value': item}
            ]
        }

    def _or(self, *conditions) -> Dict[str, Any]:
        """Create an OR rule."""
        return {'type': 'or', 'conditions': list(conditions)}

    def _and(self, *conditions) -> Dict[str, Any]:
        """Create an AND rule."""
        return {'type': 'and', 'conditions': list(conditions)}

    def _compare(self, left: Any, op: str, right: Any) -> Dict[str, Any]:
        """Create a comparison rule."""
        return {
            'type': 'compare',
            'left': left,
            'op': op,
            'right': right
        }

    def _add(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create an addition rule."""
        return {
            'type': 'binary_op',
            'left': left,
            'op': '+',
            'right': right
        }

    def _mult(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create a multiplication rule."""
        return {
            'type': 'binary_op',
            'left': left,
            'op': '*',
            'right': right
        }

    def _constant(self, value: Any) -> Dict[str, Any]:
        """Create a constant value."""
        return {'type': 'constant', 'value': value}

    def _param(self, name: str) -> Dict[str, Any]:
        """Create a parameter reference."""
        return {'type': 'name', 'name': name}

    def _conditional(self, test: Dict, if_true: Any, if_false: Any) -> Dict[str, Any]:
        """Create a conditional expression (ternary)."""
        return {
            'type': 'conditional',
            'test': test,
            'if_true': if_true,
            'if_false': if_false
        }

    # ==========================================================================
    # Helper definitions
    # ==========================================================================

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """Provide helper definitions for AUSRules class methods.

        These definitions are used by the world generator to create
        Python helper functions in the generated Rules.py.
        """
        helpers = {}

        # Simple item checks (no parameters, return bool)
        helpers['can_divebomb'] = self._item_check(self.ITEM_DIVE_BOMB)
        helpers['has_red_energy'] = self._item_check(self.ITEM_RED_ENERGY)
        helpers['has_yellow_energy'] = self._item_check(self.ITEM_YELLOW_ENERGY)
        helpers['can_duck'] = self._item_check(self.ITEM_DUCKING)
        helpers['can_stick'] = self._item_check(self.ITEM_STICKING)
        helpers['can_slide'] = self._item_check(self.ITEM_STICKING, count=2)
        helpers['has_fire'] = self._item_check(self.ITEM_SHOOT_FIRE)
        helpers['has_range'] = self._item_check(self.ITEM_SHOOT_FIRE, count=2)
        helpers['has_ice'] = self._item_check(self.ITEM_SHOOT_ICE)
        helpers['hatched'] = self._item_check(self.ITEM_HATCH)

        # Composite helpers (no parameters, return bool)
        helpers['can_shoot'] = self._or(
            self._item_check(self.ITEM_SHOOT_FIRE),
            self._item_check(self.ITEM_SHOOT_ICE)
        )
        helpers['can_light_torches'] = self._or(
            self._item_check(self.ITEM_SHOOT_FIRE),
            self._item_check(self.ITEM_DIVE_BOMB)
        )

        # Integer returning helpers
        # double_jump_height() -> state.count("Double Jump Upgrade")
        helpers['double_jump_height'] = self._item_count(self.ITEM_DOUBLE_JUMP)

        # jump_height() -> complex formula:
        # if count(JUMP_UPGRADE) == 3 and count(DOUBLE_JUMP) == 1: return 6.5
        # else: return count(JUMP_UPGRADE) + count(DOUBLE_JUMP) + 2
        helpers['jump_height'] = self._conditional(
            # Test: JUMP_UPGRADE == 3 and DOUBLE_JUMP == 1
            self._and(
                self._compare(self._item_count(self.ITEM_JUMP_UPGRADE), '==', self._constant(3)),
                self._compare(self._item_count(self.ITEM_DOUBLE_JUMP), '==', self._constant(1))
            ),
            # If true: 6.5
            self._constant(6.5),
            # If false: count(JUMP) + count(DOUBLE) + 2
            self._add(
                self._add(
                    self._item_count(self.ITEM_JUMP_UPGRADE),
                    self._item_count(self.ITEM_DOUBLE_JUMP)
                ),
                self._constant(2)
            )
        )

        # Parameterized helpers
        # jump_height_min(amount) -> jump_height() >= amount
        helpers['jump_height_min'] = {
            'params': ['amount'],
            'body': self._compare(
                {'type': 'helper', 'name': 'jump_height'},
                '>=',
                self._param('amount')
            )
        }

        # single_jump_min(amount) -> count(JUMP_UPGRADE) >= amount
        helpers['single_jump_min'] = {
            'params': ['amount'],
            'body': self._compare(
                self._item_count(self.ITEM_JUMP_UPGRADE),
                '>=',
                self._param('amount')
            )
        }

        # double_jump_min(amount) -> count(DOUBLE_JUMP) >= amount
        helpers['double_jump_min'] = {
            'params': ['amount'],
            'body': self._compare(
                self._item_count(self.ITEM_DOUBLE_JUMP),
                '>=',
                self._param('amount')
            )
        }

        # total_money(amount) -> sum of (count(item) * value) for all crystal drops >= amount
        # Build a sum expression: count(item1)*val1 + count(item2)*val2 + ...
        money_sum = None
        for item_name, value in self.BOSS_DROP_VALUES.items():
            term = self._mult(self._item_count(item_name), self._constant(value))
            if money_sum is None:
                money_sum = term
            else:
                money_sum = self._add(money_sum, term)

        helpers['total_money'] = {
            'params': ['amount'],
            'body': self._compare(
                money_sum if money_sum else self._constant(0),
                '>=',
                self._param('amount')
            )
        }

        return helpers
