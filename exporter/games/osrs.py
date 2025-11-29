"""Old School Runescape game-specific export handler.

Handles OSRS-specific rule patterns including:
- Quest points helper function conversion
- Other OSRS-specific expansions

Note: Region object resolution is handled automatically by the analyzer
(objects with .name attribute are converted to string constants).
"""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class OSRSGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Old School Runescape'

    def __init__(self):
        super().__init__()

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively expand and resolve OSRS-specific rule patterns.

        Handles:
        1. Converting self.quest_points() and world.quest_points() method calls to helper functions
        2. Other OSRS-specific expansions as needed
        """
        if not rule:
            return rule

        rule_type = rule.get('type')

        # Handle function calls (e.g., self.quest_points() or world.quest_points())
        if rule_type == 'function_call':
            function = rule.get('function', {})

            # Check if this is a method call (e.g., self.quest_points or world.quest_points)
            if function.get('type') == 'attribute':
                obj = function.get('object', {})
                method_name = function.get('attr')

                # Check if object is 'self' or 'world' (both refer to the OSRS World instance)
                if obj.get('type') == 'name' and obj.get('name') in ['self', 'world']:
                    if method_name == 'quest_points':
                        # Convert to a helper function call
                        logger.debug(f"Converting {obj.get('name')}.quest_points() to helper function")
                        return {
                            'type': 'helper',
                            'name': 'quest_points',
                            'args': []
                        }

        # Handle 'and' and 'or' conditions recursively
        if rule_type in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        # Handle 'compare' operations recursively
        if rule_type == 'compare':
            if 'left' in rule:
                rule['left'] = self.expand_rule(rule['left'])
            if 'right' in rule:
                rule['right'] = self.expand_rule(rule['right'])

        # Handle state_method recursively (expand args)
        if rule_type == 'state_method':
            if 'args' in rule:
                rule['args'] = [self.expand_rule(arg) if isinstance(arg, dict) else arg
                               for arg in rule.get('args', [])]

        # Let the parent class handle other cases
        return super().expand_rule(rule)


# Ensure this handler is registered in exporter/games/__init__.py
