"""Game-specific rule helper functions."""

from typing import Dict, Type
from .base import BaseHelperExpander
from .alttp import ALttPHelperExpander
from .generic import GenericHelperExpander

# Register game-specific helper expanders
GAME_HELPERS: Dict[str, Type[BaseHelperExpander]] = {
    'A Link to the Past': ALttPHelperExpander,
}

def get_game_helpers(game_name: str) -> BaseHelperExpander:
    """Get helper expander for specified game, falling back to generic if none exists."""
    expander_class = GAME_HELPERS.get(game_name, GenericHelperExpander)
    return expander_class()