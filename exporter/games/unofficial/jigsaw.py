"""Jigsaw game-specific export handler.

Jigsaw uses a custom collect mechanism where items like "17 Puzzle Pieces"
add 17 to a "pcs" counter, and access rules check state.has("pcs", count).

This handler uses accumulator rules to enable the Universal Tracker to
properly understand this counting mechanism.

The Jigsaw world's custom collect/remove methods:
- collect(): Parses item names like "17 Puzzle Pieces" and adds 17 to state.prog_items[player]["pcs"]
- remove(): Similarly subtracts from the pcs counter
- access_rule: lambda state, count=loc.nmerges: state.has("pcs", self.player, self.pieces_needed_per_merge[count])
"""

from typing import Set
from ..base import GenericGameExportHandler


class JigsawExportHandler(GenericGameExportHandler):
    """Export handler for Jigsaw."""

    GAME_NAME = 'Jigsaw'

    # Enable upfront item adding for sphere test compatibility
    # Jigsaw needs all pieces counted before checking accessibility
    ADD_SPHERE_ITEMS_UPFRONT = True
    USE_RESOLVED_ITEMS = True

    # Accumulator rules - pattern matches "17 Puzzle Pieces", "28 Puzzle Pieces", etc.
    # Also matches singular "1 Puzzle Piece"
    # The extracted value is added to the "pcs" accumulator
    ACCUMULATOR_RULES = [{
        'pattern': r'^(\d+) Puzzle Pieces?$',
        'extract_value': True,
        'target': 'pcs',
    }]

    # Initialize pcs accumulator (start at 0, accumulate as items collected)
    PROG_ITEMS_INIT = {'pcs': 0}

    # Accumulator item configuration - enables base class to auto-create piece items
    ACCUMULATOR_ITEM_GROUP = 'Puzzle Pieces'
    ACCUMULATOR_ITEM_TYPE = 'Puzzle Pieces'
