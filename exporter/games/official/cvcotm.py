"""Castlevania - Circle of the Moon specific exporter.

This game has option-dependent helper logic (e.g., nerf_roc_wing affects
jump level requirements). Helpers are pre-computed at export time based
on the current world settings.
"""

from typing import Dict, Any
from ..base import GenericGameExportHandler


# Rule construction helpers (module-level for reuse)
def _item(name: str) -> Dict[str, Any]:
    """Create an item_check rule."""
    return {'type': 'item_check', 'item': name}


def _item_count(name: str, count: int) -> Dict[str, Any]:
    """Create an item_check rule with count requirement."""
    return {'type': 'item_check', 'item': name, 'count': count}


def _any(*conditions) -> Dict[str, Any]:
    """Create an 'or' rule from multiple conditions."""
    return {'type': 'or', 'conditions': list(conditions)}


def _all(*conditions) -> Dict[str, Any]:
    """Create an 'and' rule from multiple conditions."""
    return {'type': 'and', 'conditions': list(conditions)}


def _const(value: Any) -> Dict[str, Any]:
    """Create a constant rule."""
    return {'type': 'constant', 'value': value}


class CvCotMGameExportHandler(GenericGameExportHandler):
    """Expander for Castlevania - Circle of the Moon specific functions."""

    # Helpers computed in get_helper_definitions() - auto-preserved during analysis
    AUTO_PRESERVE_COMPUTED_HELPERS = True
    COMPUTED_HELPERS = {
        'has_jump_level_1', 'has_jump_level_2', 'has_jump_level_3',
        'has_jump_level_4', 'has_jump_level_5', 'has_kick', 'has_tackle',
        'has_push', 'has_ice_or_stone', 'can_touch_water',
        'broke_iron_maidens', 'can_open_ceremonial_door',
    }

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """Export pre-computed helper definitions based on world settings."""
        # Read settings at export time
        nerf = getattr(world.options, 'nerf_roc_wing', None)
        nerf_roc_wing = nerf.value if nerf else 0

        cleansing_opt = getattr(world.options, 'ignore_cleansing', None)
        ignore_cleansing = cleansing_opt.value if cleansing_opt else 0

        iron_opt = getattr(world.options, 'iron_maiden_behavior', None)
        iron_maiden_behavior = iron_opt.value if iron_opt else 0

        required_last_keys = getattr(world, 'required_last_keys', 0)

        # Item names
        ROC = "Roc Wing"
        DOUBLE = "Double"
        KICK = "Kick Boots"

        # Build helpers dict
        helpers = {
            # Jump levels: progressively more items needed when Roc is nerfed
            'has_jump_level_1': _any(_item(DOUBLE), _item(ROC)),
            'has_jump_level_2': _item(ROC),
            'has_jump_level_3': (
                _all(_item(ROC), _any(_item(DOUBLE), _item(KICK)))
                if nerf_roc_wing else _item(ROC)
            ),
            'has_jump_level_4': (
                _all(_item(ROC), _item(KICK))
                if nerf_roc_wing else _item(ROC)
            ),
            'has_jump_level_5': (
                _all(_item(ROC), _item(DOUBLE), _item(KICK))
                if nerf_roc_wing else _item(ROC)
            ),

            # Simple item requirements
            'has_kick': _item(KICK),
            'has_tackle': _item("Tackle"),
            'has_push': _item("Heavy Ring"),

            # DSS combo for freezing/petrifying enemies
            'has_ice_or_stone': _all(
                _any(_item("Serpent Card"), _item("Cockatrice Card")),
                _any(_item("Mercury Card"), _item("Mars Card"))
            ),

            # Option-dependent helpers
            'can_touch_water': (
                _const(True) if ignore_cleansing else _item("Cleansing")
            ),
            'broke_iron_maidens': (
                _const(True) if iron_maiden_behavior == 1
                else _item("Maiden Detonator")
            ),
            'can_open_ceremonial_door': (
                _const(True) if required_last_keys == 0
                else _item_count("Last Key", required_last_keys)
            ),
        }

        return helpers
