"""DLCQuest-specific export handler."""

from ..base import GenericGameExportHandler


class DLCQuestGameExportHandler(GenericGameExportHandler):
    """Handle DLCQuest-specific coin item export using declarative configuration."""

    # DLCQuest uses coin-based access rules that check state.prog_items accumulators.
    # These flags enable proper coin accumulation during spoiler tests.
    ADD_SPHERE_ITEMS_UPFRONT = True
    USE_RESOLVED_ITEMS = True

    # Accumulator rules - pattern matches "4 coins", "46 coins", etc.
    # Also matches "50 coins freemium" for the Live Freemium or Die campaign
    ACCUMULATOR_RULES = [{
        'pattern': r'^(\d+) coins?$',
        'extract_value': True,
        'target': ' coins',
    }, {
        'pattern': r'^(\d+) coins? freemium$',
        'extract_value': True,
        'target': ' coins freemium',
    }]

    # Initialize coin accumulators (start at 0, accumulate as items collected)
    PROG_ITEMS_INIT = {' coins': 0, ' coins freemium': 0}

    # Accumulator item configuration - enables base class to auto-create coin items
    # with event=False, proper groups, and type
    ACCUMULATOR_ITEM_GROUP = 'coins'
    ACCUMULATOR_ITEM_TYPE = 'coins'
