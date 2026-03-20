"""Star Wars Episode I Racer game-specific export handler.

This handler provides correct helper function definitions for UT fuzz testing.

The apworld uses helper functions that iterate over module-level dictionaries:
- has_enough_races(state, player, required) - counts races based on circuit passes
- has_enough_races_course_shuffle(state, player, required) - counts course unlock items

The AST analyzer can't resolve [*course_unlocks_item_table] references at export time,
so we provide explicit helper definitions with the expanded item names.
"""

from typing import Dict, Any, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class SWRGameExportHandler(GenericGameExportHandler):
    """Export handler for Star Wars Episode I Racer.

    Provides explicit helper function definitions to fix AST analysis issues
    with module-level dictionary iteration patterns.
    """

    GAME_NAME = "Star Wars Episode I Racer"

    # Course unlock items - these are the items counted by has_enough_races_course_shuffle
    COURSE_UNLOCK_ITEMS = [
        "Amateur Course Unlock",
        "Semi-Pro Course Unlock",
        "Galactic Course Unlock",
        "Invitational Course Unlock",
    ]

    # Auto-export discovered helpers
    AUTO_EXPORT_DISCOVERED_HELPERS = True

    # Helpers to explicitly export with correct definitions
    HELPERS_TO_EXPORT_WHITELIST = {
        'has_enough_races',
        'has_enough_races_course_shuffle',
    }

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """
        Provide explicit helper definitions for SWR.

        The apworld's helper functions use patterns that can't be analyzed
        by the AST exporter, so we provide hardcoded definitions.
        """
        helper_definitions = {}

        # has_enough_races_course_shuffle: counts total course unlock items
        # Original: for required_item in [*course_unlocks_item_table]: count += state.count(required_item, player)
        # This counts ALL course unlock items (Amateur, Semi-Pro, Galactic, Invitational)
        # We sum up all the state.count() values for each course unlock item using binary_op chain
        helper_definitions['has_enough_races_course_shuffle'] = {
            'params': ['required'],
            'defaults': {},
            'body': {
                'type': 'compare',
                'op': '>=',
                'left': {
                    'type': 'binary_op',
                    'op': '+',
                    'left': {
                        'type': 'binary_op',
                        'op': '+',
                        'left': {
                            'type': 'binary_op',
                            'op': '+',
                            'left': {'type': 'count_item', 'item': 'Amateur Course Unlock'},
                            'right': {'type': 'count_item', 'item': 'Semi-Pro Course Unlock'}
                        },
                        'right': {'type': 'count_item', 'item': 'Galactic Course Unlock'}
                    },
                    'right': {'type': 'count_item', 'item': 'Invitational Course Unlock'}
                },
                'right': {'type': 'name', 'name': 'required'}
            }
        }

        # has_enough_races: counts races based on circuit passes
        # Original logic:
        #   count = 7  (Amateur circuit always has 7 races)
        #   if state.has("Semi-Pro Circuit Pass", player): count += 7
        #   if state.has("Galactic Circuit Pass", player): count += 7
        #   if state.has("Invitational Circuit", player): count += 4  # Note: typo in original apworld
        #   return count >= required
        #
        # This is equivalent to: 7 + (Semi-Pro * 7) + (Galactic * 7) + (Invitational * 4) >= required
        helper_definitions['has_enough_races'] = {
            'params': ['required'],
            'defaults': {},
            'body': {
                'type': 'compare',
                'op': '>=',
                'left': {
                    'type': 'binary_op',
                    'op': '+',
                    'left': {
                        'type': 'binary_op',
                        'op': '+',
                        'left': {
                            'type': 'binary_op',
                            'op': '+',
                            'left': {'type': 'constant', 'value': 7},  # Amateur races (always available)
                            'right': {
                                'type': 'binary_op',
                                'op': '*',
                                'left': {'type': 'count_item', 'item': 'Semi-Pro Circuit Pass'},
                                'right': {'type': 'constant', 'value': 7}
                            }
                        },
                        'right': {
                            'type': 'binary_op',
                            'op': '*',
                            'left': {'type': 'count_item', 'item': 'Galactic Circuit Pass'},
                            'right': {'type': 'constant', 'value': 7}
                        }
                    },
                    'right': {
                        'type': 'binary_op',
                        'op': '*',
                        # Note: Original apworld has a typo "Invitational Circuit" instead of "Invitational Circuit Pass"
                        # We match the apworld's actual behavior
                        'left': {'type': 'count_item', 'item': 'Invitational Circuit'},
                        'right': {'type': 'constant', 'value': 4}
                    }
                },
                'right': {'type': 'name', 'name': 'required'}
            }
        }

        logger.debug(f"Provided explicit helper definitions for SWR: {list(helper_definitions.keys())}")
        return helper_definitions
