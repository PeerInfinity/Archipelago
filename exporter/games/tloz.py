"""The Legend of Zelda game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class TLoZGameExportHandler(GenericGameExportHandler):
    """Export handler for The Legend of Zelda."""

    GAME_NAME = 'The Legend of Zelda'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._boss_locations = {}  # Cache for boss location access rules
        self._current_location_name = None  # Track current location being processed

    def set_context(self, location_name: str):
        """Set the current location context for rule expansion."""
        self._current_location_name = location_name
        logger.debug(f"Set context to location: {location_name}")

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand rules with special handling for f_string rules and can_reach patterns."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Handle f_string rules by resolving them when all parts are constants
        if rule.get('type') == 'f_string':
            resolved = self._resolve_f_string(rule)
            if resolved is not None:
                return resolved
            # If we can't resolve it, keep it as-is (though this shouldn't happen for TLOZ)
            logger.warning(f"Unable to resolve f_string rule: {rule}")
            return rule

        # Handle can_reach state methods for Boss Status locations
        # This pattern appears in Boss Status locations: state.can_reach(b, "Location", player)
        # where b is a lambda default parameter pointing to a boss location
        if rule.get('type') == 'state_method' and rule.get('method') == 'can_reach':
            args = rule.get('args', [])
            if len(args) >= 2 and args[1].get('type') == 'constant' and args[1].get('value') == 'Location':
                # This is a can_reach for a location (specifically boss locations)
                # The first arg is often an unresolved variable 'b' that refers to the boss location
                # For "Level X Boss Status" locations, the boss is "Level X Boss"
                if args[0].get('type') == 'name' and self._current_location_name:
                    if ' Boss Status' in self._current_location_name:
                        # Resolve the boss location name by removing " Status"
                        boss_location_name = self._current_location_name.replace(' Status', '')
                        logger.debug(f"Resolving can_reach variable for {self._current_location_name} -> {boss_location_name}")
                        # Replace the 'name' type with a constant containing the boss location name
                        args[0] = {
                            'type': 'constant',
                            'value': boss_location_name
                        }
                        rule['args'] = args
                        logger.debug(f"Resolved can_reach to check location: {boss_location_name}")
                else:
                    logger.debug(f"Preserving can_reach(Location) check with args: {args}")

        # Recursively process nested rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
            # Simplify 'and' conditions by removing True constants
            if rule.get('type') == 'and':
                rule['conditions'] = [c for c in rule['conditions']
                                     if not (isinstance(c, dict) and c.get('type') == 'constant' and c.get('value') is True)]
                # If only one condition left, return it directly
                if len(rule['conditions']) == 1:
                    return rule['conditions'][0]
                # If no conditions left, return True
                elif len(rule['conditions']) == 0:
                    return {'type': 'constant', 'value': True}
        elif rule.get('type') == 'not':
            if 'condition' in rule:
                rule['condition'] = self.expand_rule(rule['condition'])
        elif rule.get('type') == 'item_check':
            # If the item name is an f_string, resolve it
            if isinstance(rule.get('item'), dict) and rule['item'].get('type') == 'f_string':
                resolved = self._resolve_f_string(rule['item'])
                if resolved is not None:
                    rule['item'] = resolved
        elif rule.get('type') == 'conditional':
            if 'test' in rule:
                rule['test'] = self.expand_rule(rule['test'])
            if 'if_true' in rule:
                rule['if_true'] = self.expand_rule(rule['if_true'])
            if 'if_false' in rule:
                rule['if_false'] = self.expand_rule(rule['if_false'])

        # Call parent expand_rule for additional processing
        return super().expand_rule(rule)

    def _resolve_f_string(self, f_string_rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Resolve an f_string rule to a constant string if all parts are constant.

        Example input:
        {
            "type": "f_string",
            "parts": [
                {"type": "constant", "value": "Boss "},
                {"type": "formatted_value", "value": {"type": "constant", "value": 1}}
            ]
        }

        Should resolve to:
        {"type": "constant", "value": "Boss 1"}
        """
        if f_string_rule.get('type') != 'f_string':
            return None

        parts = f_string_rule.get('parts', [])
        if not parts:
            return {'type': 'constant', 'value': ''}

        # Try to resolve all parts to constant values
        resolved_parts = []
        for part in parts:
            if part.get('type') == 'constant':
                resolved_parts.append(str(part.get('value', '')))
            elif part.get('type') == 'formatted_value':
                # Extract the value from the formatted_value
                value_rule = part.get('value', {})
                if value_rule.get('type') == 'constant':
                    resolved_parts.append(str(value_rule.get('value', '')))
                else:
                    # Can't resolve non-constant formatted values
                    logger.debug(f"Cannot resolve f_string with non-constant formatted_value: {part}")
                    return None
            else:
                # Unknown part type, can't resolve
                logger.debug(f"Cannot resolve f_string with unknown part type: {part.get('type')}")
                return None

        # All parts are constant, join them into a single string
        resolved_string = ''.join(resolved_parts)
        logger.debug(f"Resolved f_string to constant: '{resolved_string}'")

        return {
            'type': 'constant',
            'value': resolved_string
        }
