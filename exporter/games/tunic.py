"""TUNIC game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class TUNICGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'TUNIC'
    """Export handler for TUNIC.

    Handles ability_unlocks resolution for Holy Cross, Prayer, and Icebolt abilities.
    """

    def __init__(self):
        super().__init__()
        self.ability_unlocks = {}

    def preprocess_world_data(self, world, export_data, player):
        """Preprocess TUNIC world data before region export."""
        # Store ability_unlocks from the world for later resolution during expand_rule
        if hasattr(world, 'ability_unlocks'):
            self.ability_unlocks = world.ability_unlocks
            logger.info(f"Loaded ability_unlocks for preprocessing: {world.ability_unlocks}")
        else:
            logger.warning("World does not have ability_unlocks attribute")

        # Call parent implementation
        super().preprocess_world_data(world, export_data, player)

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rules, resolving ability_unlocks subscripts."""
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Resolve subscript references to ability_unlocks
        if rule_type == 'subscript':
            value = rule.get('value', {})
            if value.get('type') == 'name' and value.get('name') == 'ability_unlocks':
                index = rule.get('index', {})
                if index.get('type') == 'constant':
                    ability_name = index.get('value')
                    if ability_name in self.ability_unlocks:
                        # Replace subscript with constant value
                        resolved_value = self.ability_unlocks[ability_name]
                        logger.debug(f"Resolved ability_unlocks['{ability_name}'] to {resolved_value}")
                        return {'type': 'constant', 'value': resolved_value}
                    else:
                        logger.warning(f"ability_unlocks['{ability_name}'] not found in world data")

        # Recursively process nested rules
        if rule_type == 'conditional':
            rule['test'] = self.expand_rule(rule.get('test'))
            rule['if_true'] = self.expand_rule(rule.get('if_true'))
            rule['if_false'] = self.expand_rule(rule.get('if_false'))
        elif rule_type in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
        elif rule_type == 'not':
            rule['condition'] = self.expand_rule(rule.get('condition'))
        elif rule_type == 'compare':
            rule['left'] = self.expand_rule(rule.get('left'))
            rule['right'] = self.expand_rule(rule.get('right'))
        elif rule_type == 'binary_op':
            rule['left'] = self.expand_rule(rule.get('left'))
            rule['right'] = self.expand_rule(rule.get('right'))
        elif rule_type == 'item_check':
            if 'count' in rule and isinstance(rule['count'], dict):
                rule['count'] = self.expand_rule(rule['count'])

        # Let parent handle other expansion like helpers
        return super().expand_rule(rule)

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extract TUNIC settings including ability_unlocks."""
        settings = super().get_settings_data(world, multiworld, player)

        # Store ability_unlocks from the world for later resolution
        if hasattr(world, 'ability_unlocks'):
            self.ability_unlocks = world.ability_unlocks
            # Also export it in settings for reference
            settings['ability_unlocks'] = world.ability_unlocks
            logger.info(f"Exported ability_unlocks: {world.ability_unlocks}")

        # Export other TUNIC-specific settings
        if hasattr(world, 'options'):
            options = world.options
            tunic_settings = {}

            # Export relevant options that might affect logic
            option_names = [
                'ability_shuffling',
                'hexagon_quest',
                'hexagon_quest_ability_type',
                'entrance_rando',
                'shuffle_ladders',
                'laurels_zips',
                'ice_grappling',
                'ladder_storage',
                'lanternless',
                'maskless',
            ]

            for option_name in option_names:
                if hasattr(options, option_name):
                    option = getattr(options, option_name)
                    if hasattr(option, 'value'):
                        tunic_settings[option_name] = option.value
                    else:
                        tunic_settings[option_name] = option

            settings.update(tunic_settings)

        return settings
