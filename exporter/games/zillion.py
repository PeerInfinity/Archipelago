"""Zillion game-specific export handler."""

from typing import Dict, Any, Optional, List
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class ZillionGameExportHandler(GenericGameExportHandler):
    """Export handler for Zillion.

    Zillion uses the zilliandomizer library for its logic system. Instead of runtime
    testing (which doesn't work during export), we read the requirements directly from
    the zilliandomizer location objects and convert them to our rules format.
    """
    GAME_NAME = 'Zillion'

    def expand_helper(self, helper_name: str):
        """Zillion does not use helper functions in its access rules."""
        if helper_name:
            logger.warning(f"Unexpected helper in Zillion: {helper_name}")
        return None

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """
        Read requirements directly from the zilliandomizer location object.

        The zilliandomizer library stores requirements in a Req object with attributes:
        - gun: gun power level (0-3) -> requires "Zillion" item
        - jump: jump level (0-3) -> requires "Opa-Opa" item
        - floppy: number of floppy disks (0-126) -> requires "Floppy Disk" item
        - red: red ID card (0-1) -> requires "Red ID Card" item
        - char: character requirement (tuple of allowed chars)
        - skill, hp: other requirements (might need helper functions)
        - union: OR of multiple requirements
        """
        # Check if this is a ZillionLocation with zilliandomizer data
        if not hasattr(location, 'zz_loc'):
            return None

        try:
            req = location.zz_loc.req
            conditions = []

            # Gun requirement -> Zillion item
            # Note: The player starts with gun=1, jump=1 as baseline capabilities
            # gun=2 requires 1 "Zillion" item (upgrade from 1 to 2)
            # gun=3 requires 2 "Zillion" items (upgrade from 1 to 3)
            if req.gun > 1:
                count_needed = req.gun - 1
                if count_needed == 1:
                    conditions.append({'type': 'item_check', 'item': 'Zillion'})
                else:
                    conditions.append({
                        'type': 'item_check',
                        'item': 'Zillion',
                        'count': {'type': 'constant', 'value': count_needed}
                    })

            # Jump requirement -> Opa-Opa item
            # Same logic as gun: player starts with jump=1
            if req.jump > 1:
                count_needed = req.jump - 1
                if count_needed == 1:
                    conditions.append({'type': 'item_check', 'item': 'Opa-Opa'})
                else:
                    conditions.append({
                        'type': 'item_check',
                        'item': 'Opa-Opa',
                        'count': {'type': 'constant', 'value': count_needed}
                    })

            # Floppy disk requirement
            if req.floppy > 0:
                if req.floppy == 1:
                    conditions.append({'type': 'item_check', 'item': 'Floppy Disk'})
                else:
                    conditions.append({
                        'type': 'item_check',
                        'item': 'Floppy Disk',
                        'count': {'type': 'constant', 'value': req.floppy}
                    })

            # Red ID card requirement
            if req.red > 0:
                conditions.append({'type': 'item_check', 'item': 'Red ID Card'})

            # Character requirement
            # req.char is a tuple like ('JJ', 'Apple', 'Champ') for any character,
            # or ('JJ',) for JJ only, etc.
            if req.char and len(req.char) < 3:
                # If not all characters are allowed, add character requirement
                char_conditions = []
                for char_name in req.char:
                    char_conditions.append({'type': 'item_check', 'item': char_name})

                if len(char_conditions) == 1:
                    conditions.append(char_conditions[0])
                else:
                    conditions.append({
                        'type': 'or',
                        'conditions': char_conditions
                    })

            # Skill and HP requirements might need helper functions
            # For now, we'll log if we see them
            if req.skill > 0:
                logger.debug(f"Location {location.name} has skill requirement: {req.skill}")
            if req.hp > 0:
                logger.debug(f"Location {location.name} has HP requirement: {req.hp}")

            # Handle union (OR of requirements)
            if req.union:
                logger.warning(f"Location {location.name} has union requirement - not yet supported")

            # Build the final access rule
            if not conditions:
                # No requirements - accessible from the start
                return {'type': 'constant', 'value': True}
            elif len(conditions) == 1:
                return conditions[0]
            else:
                # Multiple requirements - all must be met (AND)
                return {
                    'type': 'and',
                    'conditions': conditions
                }

        except Exception as e:
            logger.warning(f"Failed to read requirements for location {location.name}: {e}")
            return None
