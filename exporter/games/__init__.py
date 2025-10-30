"""Game-specific rule helper functions."""

from typing import Dict, Type, Optional, Tuple
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
from .metamath import MetamathGameExportHandler
from .cvcotm import CvCotMGameExportHandler
from .cv64 import Cv64GameExportHandler
from .celeste64 import Celeste64GameExportHandler
from .checksfinder import ChecksFinderGameExportHandler
from .bakingadventure import BakingAdventureGameExportHandler
from .civ_6 import Civ6GameExportHandler
from .dlcquest import DLCQuestGameExportHandler
from .doom_1993 import Doom1993GameExportHandler
from .doom_ii import Doom2GameExportHandler
from .dark_souls_3 import DarkSouls3GameExportHandler
from .dkc3 import DKC3GameExportHandler
from .factorio import FactorioGameExportHandler
from .faxanadu import FaxanaduGameExportHandler
from .ffmq import FFMQGameExportHandler
from .hk import HKExportHandler
from .hylics2 import Hylics2GameExportHandler
from .inscryption import InscryptionGameExportHandler
from .kh1 import KH1GameExportHandler
from .kh2 import KH2GameExportHandler
from .kdl3 import KDL3GameExportHandler
from .lingo import LingoGameExportHandler
from .pokemon_rb import PokemonRBGameExportHandler
from .saving_princess import SavingPrincessGameExportHandler

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
    'Castlevania 64': Cv64GameExportHandler,
    'Castlevania - Circle of the Moon': CvCotMGameExportHandler,
    'Celeste 64': Celeste64GameExportHandler,
    'ChecksFinder': ChecksFinderGameExportHandler,
    'ChocolateChipCookies': BakingAdventureGameExportHandler,
    'Civilization VI': Civ6GameExportHandler,
    'Dark Souls III': DarkSouls3GameExportHandler,
    'DLCQuest': DLCQuestGameExportHandler,
    'Donkey Kong Country 3': DKC3GameExportHandler,
    'DOOM 1993': Doom1993GameExportHandler,
    'DOOM II': Doom2GameExportHandler,
    'Factorio': FactorioGameExportHandler,
    'Faxanadu': FaxanaduGameExportHandler,
    'Final Fantasy Mystic Quest': FFMQGameExportHandler,
    'Hollow Knight': HKExportHandler,
    'Hylics 2': Hylics2GameExportHandler,
    'Inscryption': InscryptionGameExportHandler,
    'Kingdom Hearts': KH1GameExportHandler,
    'Kingdom Hearts 2': KH2GameExportHandler,
    "Kirby's Dream Land 3": KDL3GameExportHandler,
    'Lingo': LingoGameExportHandler,
    'Metamath': MetamathGameExportHandler,
    'Pokemon Red and Blue': PokemonRBGameExportHandler,
    'Saving Princess': SavingPrincessGameExportHandler,
}

# Module-level cache for handler instances
_handler_cache: Dict[Tuple[str, Optional[int]], BaseGameExportHandler] = {}

def get_game_export_handler(game_name: str, world=None) -> BaseGameExportHandler:
    """
    Get the appropriate helper expander for the game.

    Handlers are cached per (game_name, world_id) to avoid repeated instantiation.
    """
    # Use world ID as cache key (objects aren't hashable, but their IDs are)
    cache_key = (game_name, id(world) if world else None)

    if cache_key not in _handler_cache:
        handler_class = GAME_HANDLERS.get(game_name, GenericGameExportHandler)
        # Pass world to handlers that accept it
        if game_name in ['Bomb Rush Cyberfunk', 'Blasphemous', 'Castlevania 64', 'Celeste 64', 'Dark Souls III', 'DLCQuest', 'Donkey Kong Country 3', 'DOOM 1993', 'DOOM II', 'Factorio', 'Faxanadu', 'Final Fantasy Mystic Quest', 'Inscryption', 'Kingdom Hearts', 'Kingdom Hearts 2', 'Pokemon Red and Blue']:
            _handler_cache[cache_key] = handler_class(world)
        else:
            _handler_cache[cache_key] = handler_class()

    return _handler_cache[cache_key]

def clear_handler_cache():
    """Clear the handler cache. Call this between generations if needed."""
    _handler_cache.clear()