"""Inscryption game-specific export handler.

Inscryption's helper functions are class methods (not module-level functions),
so they cannot be automatically exported. Instead, we expand the helper calls
directly in expand_helper() by defining the actual rule structures.
"""

from typing import Any, Dict, List, Optional
from ..base import GenericGameExportHandler


class InscryptionGameExportHandler(GenericGameExportHandler):
    """Inscryption game handler - expands InscryptionRules class method helpers."""

    @property
    def _required_epitaph_count(self) -> int:
        """Get the required epitaph count from the world."""
        return getattr(self.world, 'required_epitaph_pieces_count', 9)

    @property
    def _required_epitaph_name(self) -> str:
        """Get the required epitaph item name from the world.

        This varies based on the epitaph_pieces_randomization option:
        - all_pieces: 'Epitaph Piece' (9 individual items)
        - in_groups: 'Epitaph Pieces' (3 grouped items)
        - as_one_item: 'Epitaph Pieces' (1 item)
        """
        return getattr(self.world, 'required_epitaph_pieces_name', 'Epitaph Piece')

    # ==========================================================================
    # Rule construction helpers
    # ==========================================================================

    def _has_all_items(self, items: List[str]) -> Dict[str, Any]:
        """Create a has_all rule for multiple items."""
        return {
            'type': 'state_method',
            'method': 'has_all',
            'args': [{'type': 'constant', 'value': items}]
        }

    def _item_check(self, item: str, count: Optional[int] = None) -> Dict[str, Any]:
        """Create an item_check rule."""
        rule: Dict[str, Any] = {'type': 'item_check', 'item': item}
        if count is not None:
            rule['count'] = {'type': 'constant', 'value': count}
        return rule

    # ==========================================================================
    # Composite requirement rules
    # ==========================================================================

    def _camera_and_meat_rule(self) -> Dict[str, Any]:
        """Camera Replica AND Pile Of Meat."""
        return self._has_all_items(['Camera Replica', 'Pile Of Meat'])

    def _epitaph_pieces_rule(self) -> Dict[str, Any]:
        """Epitaph item with required count (name varies by option)."""
        return self._item_check(self._required_epitaph_name, self._required_epitaph_count)

    def _bridge_requirements_rule(self) -> Dict[str, Any]:
        """Camera+Meat OR All Epitaph Pieces."""
        return {
            'type': 'or',
            'conditions': [self._camera_and_meat_rule(), self._epitaph_pieces_rule()]
        }

    def _tower_requirements_rule(self) -> Dict[str, Any]:
        """Monocle AND Bridge Requirements."""
        return {
            'type': 'and',
            'conditions': [self._item_check('Monocle'), self._bridge_requirements_rule()]
        }

    def _gems_and_battery_rule(self) -> Dict[str, Any]:
        """Gems Module AND Inspectometer Battery."""
        return self._has_all_items(['Gems Module', 'Inspectometer Battery'])

    def _transcendence_requirements_rule(self) -> Dict[str, Any]:
        """Quill AND Gems AND Battery."""
        return self._has_all_items(['Quill', 'Gems Module', 'Inspectometer Battery'])

    # ==========================================================================
    # Rule expansion
    # ==========================================================================

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Inscryption-specific rules.

        Override to intercept helper nodes BEFORE _expand_common_helper converts
        them to pseudo-items. This ensures our expand_helper gets called first.
        """
        if not rule:
            return rule

        # Intercept helper nodes before the generic handler converts them
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            expanded = self.expand_helper(helper_name, rule.get('args', []))
            if expanded:
                # Recursively expand in case of nested helpers
                return self.expand_rule(expanded, _depth + 1)

        # Fall through to base class for everything else
        return super().expand_rule(rule, _depth)

    # ==========================================================================
    # Helper expansion
    # ==========================================================================

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand Inscryption helper methods to their actual rule structures.

        InscryptionRules class methods can't be auto-discovered, so we define
        the expansions directly here based on the method names.
        """
        # Let base class handle CONSTANT_HELPER_EXPANSIONS first
        base_result = super().expand_helper(helper_name, args)
        if base_result is not None:
            return base_result

        # Map of InscryptionRules method names to their expansions
        expansions = {
            # Simple item checks
            'has_wardrobe_key': lambda: self._item_check('Wardrobe Key'),
            'has_caged_wolf': lambda: self._item_check('Caged Wolf Card'),
            'has_dagger': lambda: self._item_check('Dagger'),
            'has_magnificus_eye': lambda: self._item_check('Magnificus Eye'),
            'has_monocle': lambda: self._item_check('Monocle'),
            'has_obol': lambda: self._item_check('Ancient Obol'),
            'has_inspectometer_battery': lambda: self._item_check('Inspectometer Battery'),

            # Composite requirements
            'has_camera_and_meat': self._camera_and_meat_rule,
            'has_all_epitaph_pieces': self._epitaph_pieces_rule,
            'has_act2_bridge_requirements': self._bridge_requirements_rule,
            'has_tower_requirements': self._tower_requirements_rule,
            'has_gems_and_battery': self._gems_and_battery_rule,
            'has_transcendence_requirements': self._transcendence_requirements_rule,
            'has_battery_and_quill': lambda: self._has_all_items(['Quill', 'Inspectometer Battery']),

            # Act progression
            'has_act2_requirements': lambda: self._item_check('Film Roll'),
            'has_act3_requirements': lambda: {
                'type': 'and',
                'conditions': [
                    self._item_check('Film Roll'),
                    self._epitaph_pieces_rule(),
                    self._camera_and_meat_rule(),
                    self._item_check('Monocle')
                ]
            },
            'has_epilogue_requirements': lambda: {
                'type': 'and',
                'conditions': [
                    self._item_check('Film Roll'),
                    self._epitaph_pieces_rule(),
                    self._camera_and_meat_rule(),
                    self._item_check('Monocle'),
                    self._transcendence_requirements_rule()
                ]
            },

            # Boss and room requirements
            'has_mycologists_boss_requirements': lambda: {
                'type': 'and',
                'conditions': [
                    self._item_check('Mycologists Holo Key'),
                    self._transcendence_requirements_rule()
                ]
            },
            'has_bone_lord_room_requirements': lambda: self._has_all_items([
                'Bone Lord Holo Key', 'Inspectometer Battery'
            ]),

            # Utility checks
            'has_epitaphs_and_forest_items': lambda: {
                'type': 'and',
                'conditions': [self._camera_and_meat_rule(), self._epitaph_pieces_rule()]
            },
            'has_useful_act1_items': lambda: self._has_all_items([
                "Oil Painting's Clover Plant", "Squirrel Totem Head"
            ]),
        }

        if helper_name in expansions:
            return expansions[helper_name]()

        return None
