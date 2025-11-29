"""Undertale game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class UndertaleGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Undertale'

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand Undertale-specific rules, especially entrance reachability checks."""
        if not rule:
            return rule

        # Handle state.can_reach(entrance_name, "Entrance", player)
        if rule.get('type') == 'state_method' and rule.get('method') == 'can_reach':
            args = rule.get('args', [])
            # Check if this is an entrance reachability check (second arg is "Entrance")
            if len(args) >= 2:
                target_arg = args[0]
                type_arg = args[1]

                # Extract the actual values if they're constants
                target = target_arg.get('value') if isinstance(target_arg, dict) and target_arg.get('type') == 'constant' else target_arg
                reach_type = type_arg.get('value') if isinstance(type_arg, dict) and type_arg.get('type') == 'constant' else type_arg

                if reach_type == 'Entrance':
                    # Convert entrance reachability to a can_reach_entrance check
                    return {
                        'type': 'can_reach_entrance',
                        'entrance': target
                    }

        # Fall back to generic expansion
        return super().expand_rule(rule)
