"""Game-specific rule helper functions."""

from typing import Dict, Type
from .base import BaseGameExportHandler
from .generic import GenericGameExportHandler

from .adventure import AdventureGameExportHandler
from .ahit import AHitGameExportHandler
from .alttp import ALttPGameExportHandler
from .aquaria import AquariaGameExportHandler
from .archipidle import ArchipIDLEGameExportHandler
from .blasphemous import BlasphemousGameExportHandler
from .bomb_rush_cyberfunk import BombRushCyberfunkGameExportHandler
from .bumpstik import BumpStikGameExportHandler
from .shorthike import ShortHikeGameExportHandler

# Register game-specific helper expanders
GAME_HANDLERS: Dict[str, Type[BaseGameExportHandler]] = {
    'Generic': GenericGameExportHandler,
    'A Hat in Time': AHitGameExportHandler,
    'A Link to the Past': ALttPGameExportHandler,
    'A Short Hike': ShortHikeGameExportHandler,
    'Adventure': AdventureGameExportHandler,
    'Aquaria': AquariaGameExportHandler,
    'ArchipIDLE': ArchipIDLEGameExportHandler,
    'Blasphemous': BlasphemousGameExportHandler,
    'Bomb Rush Cyberfunk': BombRushCyberfunkGameExportHandler,
    'Bumper Stickers': BumpStikGameExportHandler,
}

def get_game_export_handler(game_name: str, world=None) -> BaseGameExportHandler:
    """Get the appropriate helper expander for the game."""
    handler_class = GAME_HANDLERS.get(game_name, GenericGameExportHandler)
    # Pass world to handlers that accept it (like Bomb Rush Cyberfunk)
    if game_name == 'Bomb Rush Cyberfunk':
        return handler_class(world)
    return handler_class()