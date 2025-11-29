"""Super Mario World game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class SMWGameExportHandler(GenericGameExportHandler):
    """Export handler for Super Mario World.

    SMW has very simple rules that only use state.has() checks,
    so we can inherit from GenericGameExportHandler without much customization.
    """
    GAME_NAME = 'Super Mario World'

    # Inherit all default behavior from GenericGameExportHandler
    # Override methods here only when custom behavior is needed
