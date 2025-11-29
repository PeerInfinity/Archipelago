"""Mega Man 2 game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

# Weapon ID to name mapping (from worlds/mm2/rules.py)
weapons_to_name = {
    1: "Atomic Fire",
    2: "Air Shooter",
    3: "Leaf Shield",
    4: "Bubble Lead",
    5: "Quick Boomerang",
    6: "Crash Bomber",
    7: "Metal Blade",
    8: "Time Stopper"
}

class MM2GameExportHandler(GenericGameExportHandler):
    """Export handler for Mega Man 2.

    Inherits all default behavior from GenericGameExportHandler.
    Override methods only when custom behavior is needed.
    """
    GAME_NAME = 'Mega Man 2'

    def get_settings_data(self, world, multiworld, player):
        """Extract Mega Man 2 settings including wily_5 requirement and weapon data."""
        # Get base settings
        settings = super().get_settings_data(world, multiworld, player)

        settings['use_resolved_items'] = True

        # Add MM2-specific settings for wily_5 requirements
        try:
            if hasattr(world, 'options') and hasattr(world.options, 'wily_5_requirement'):
                settings['wily_5_requirement'] = int(world.options.wily_5_requirement.value)
            else:
                settings['wily_5_requirement'] = 8  # Default value
        except Exception as e:
            logger.error(f"Error extracting wily_5_requirement option: {e}")
            settings['wily_5_requirement'] = 8

        # Export wily_5_weapons - boss requirements for Wily Stage 5
        try:
            if hasattr(world, 'wily_5_weapons'):
                # Convert weapon IDs to weapon names for easier JavaScript use
                wily_5_weapons = {}
                for boss_id, weapon_ids in world.wily_5_weapons.items():
                    # Convert weapon IDs to weapon names
                    weapon_names = []
                    for weapon_id in weapon_ids:
                        if weapon_id in weapons_to_name:
                            weapon_names.append(weapons_to_name[weapon_id])
                        elif weapon_id == 0:
                            weapon_names.append("Mega Buster")
                        else:
                            logger.warning(f"Unknown weapon ID {weapon_id}")
                    wily_5_weapons[str(boss_id)] = weapon_names

                settings['wily_5_weapons'] = wily_5_weapons
                logger.info(f"Exported wily_5_weapons: {wily_5_weapons}")
            else:
                logger.warning("World object has no wily_5_weapons attribute")
                settings['wily_5_weapons'] = {}
        except Exception as e:
            logger.error(f"Error extracting wily_5_weapons: {e}")
            settings['wily_5_weapons'] = {}

        return settings

    def _expand_common_helper(self, helper_name, args):
        """Override common helper expansion to handle MM2-specific helpers."""
        # Handle can_defeat_enough_rbms - preserve as helper for JavaScript evaluation
        if helper_name == 'can_defeat_enough_rbms':
            return {
                'type': 'helper',
                'name': helper_name,
                'args': args,
                'description': 'Requires defeating enough robot masters for Wily Stage 5'
            }

        # Let parent class handle other helpers
        return super()._expand_common_helper(helper_name, args)
