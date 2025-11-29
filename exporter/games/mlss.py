"""Mario & Luigi Superstar Saga game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class MLSSGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Mario & Luigi Superstar Saga'

    # Inherit all default behavior from GenericGameExportHandler
    # Only override methods when you need custom behavior
