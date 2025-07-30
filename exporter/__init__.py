"""Handles parsing and exporting of game rules to frontend-compatible format."""

import logging
from .exporter import export_game_rules
from .analyzer import analyze_rule
from .games import get_game_export_handler

logger = logging.getLogger(__name__)