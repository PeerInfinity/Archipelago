"""The Wind Waker game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class TWWGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'The Wind Waker'

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extract The Wind Waker settings including logic configuration values."""
        # Get base settings
        settings = super().get_settings_data(world, multiworld, player)

        # Add TWW-specific logic values that are used in state_method calls
        # These are calculated during world initialization and stored as world attributes
        logic_attrs = [
            'logic_in_swordless_mode',
            'logic_in_required_bosses_mode',
            'logic_obscure_1',
            'logic_obscure_2',
            'logic_obscure_3',
            'logic_precise_1',
            'logic_precise_2',
            'logic_precise_3',
            'logic_rematch_bosses_skipped',
            'logic_tuner_logic_enabled',
        ]

        for attr in logic_attrs:
            try:
                if hasattr(world, attr):
                    settings[attr] = bool(getattr(world, attr))
                else:
                    settings[attr] = False  # Default value
            except Exception as e:
                logger.error(f"Error extracting {attr}: {e}")
                settings[attr] = False

        return settings

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Determine if a function should be preserved as a helper call instead of being inlined.

        For TWW, we preserve all helper functions from Macros.py to avoid creating
        extremely large inlined rules. This dramatically reduces rule complexity.

        Args:
            func_name: Name of the function to check

        Returns:
            True if the function should be preserved as a helper, False if it should be inlined
        """
        # All helper functions from Macros.py follow these naming patterns
        helper_prefixes = [
            'can_',      # e.g., can_play_winds_requiem, can_fly_with_deku_leaf_indoors
            'has_',      # e.g., has_heros_sword, has_magic_meter
        ]

        return any(func_name.startswith(prefix) for prefix in helper_prefixes)

    def expand_rule(self, rule):
        """
        Override expand_rule to prevent TWW helpers from being expanded into capability rules.

        The generic exporter tries to expand 'helper' type rules with 'can_*' or 'has_*' names
        into 'capability' or 'item_check' type rules. For TWW, we want to keep these as
        callable helpers since they contain complex game logic that needs to be implemented
        in JavaScript.

        Args:
            rule: The rule to expand

        Returns:
            The rule (either expanded or unchanged)
        """
        if not rule:
            return rule

        # For helper rules that match our preserved patterns, don't expand them
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')
            if self.should_preserve_as_helper(helper_name):
                # Return the helper rule unchanged - don't expand it
                return rule

        # For all other rules, use the default expansion logic
        return super().expand_rule(rule)
