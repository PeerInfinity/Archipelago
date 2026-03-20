"""Subnautica game-specific export handler."""

from typing import Any, Dict
from ..base import GenericGameExportHandler


class SubnauticaGameExportHandler(GenericGameExportHandler):
    """Subnautica export handler with SwimRule property expansion.

    The SwimRule option class has computed properties:
    - base_depth: returns [200, 400, 600][value % 3]
    - consider_items: returns value > 2

    Since Choice options are exported as integers by default
    (EXPORT_CHOICE_OPTIONS_AS_NUMERIC = True), we use OPTION_PROPERTY_EXPANSIONS
    to expand these property accesses to their computed equivalents so the
    frontend can evaluate them with just the numeric swim_rule option value.

    Note: The room.can_reach() pattern for "Repair Aurora Drive" is now
    handled automatically by the analyzer's closure variable resolution
    (see call_visitor.py lines 1289-1316).
    """

    # Helpers that should always be exported (used in access rules)
    # Note: Automatically preserved due to AUTO_PRESERVE_WHITELISTED_HELPERS = True
    HELPERS_TO_EXPORT_WHITELIST = {'is_radiated'}

    # Expand SwimRule computed property accesses to their rule equivalents
    OPTION_PROPERTY_EXPANSIONS: Dict[tuple, Dict[str, Any]] = {
        # swim_rule.base_depth -> [200, 400, 600][swim_rule % 3]
        ('swim_rule', 'base_depth'): {
            'type': 'subscript',
            'value': {
                'type': 'constant',
                'value': [200, 400, 600]
            },
            'index': {
                'type': 'binary_op',
                'left': {
                    'type': 'name',
                    'name': 'swim_rule'
                },
                'op': '%',
                'right': {
                    'type': 'constant',
                    'value': 3
                }
            }
        },
        # swim_rule.consider_items -> swim_rule > 2
        ('swim_rule', 'consider_items'): {
            'type': 'compare',
            'left': {
                'type': 'name',
                'name': 'swim_rule'
            },
            'op': '>',
            'right': {
                'type': 'constant',
                'value': 2
            }
        }
    }
