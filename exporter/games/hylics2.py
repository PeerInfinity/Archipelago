"""Hylics 2 export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class Hylics2GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Hylics 2'
    """Export handler for Hylics 2.

    Inherits from GenericGameExportHandler to get automatic item data discovery,
    intelligent rule analysis, and recognition of common helper patterns.
    """

    # GenericGameExportHandler already provides expand_helper() that preserves
    # helper nodes as-is for frontend handling, so we don't need to override it.

    # GenericGameExportHandler also provides expand_rule() with intelligent
    # analysis, so we don't need to override that either.

    # GenericGameExportHandler provides get_item_data() which automatically
    # discovers items from world.item_name_to_id, so no override needed.
