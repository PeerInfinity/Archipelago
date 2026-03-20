"""Another Crab's Treasure game-specific export handler.

Another Crab's Treasure uses helper functions in a logic.py module for complex
rule evaluation, particularly for the 'allow_forkless' option modes:
- disabled: Simple fork requirement checks
- forkless_easy: Uses can_deal_damage_easy() helper
- forkless_hard: Uses can_deal_damage_hard() helper

These helper functions compose multiple other helpers like:
- can_rolling_attack, can_magic_damage, can_atk_damage_shell, has_summon
- can_twist_top, can_pop_off, can_rollout, etc. (shell ability checks)
- can_reach_magic_shells, can_reach_rolling_shells (shell availability checks)

The helpers check complex item combinations (specific stowaways, shells with
particular abilities, umami regeneration items) that determine whether the
player can deal damage without the Fork weapon.

This handler:
1. Treats logic.method() calls as helper function calls
2. Auto-exports all discovered helper functions from logic.py
3. Enables the worldgen Rules.py to include proper helper definitions
"""

import logging
from typing import Any, Dict, Set
from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class AnotherCrabGameExportHandler(GenericGameExportHandler):
    """Export handler for Another Crab's Treasure.

    Configures helper function export from the logic module to ensure
    worldgen can properly recreate the forkless logic rules.
    """

    GAME_NAME = "Another Crabs Treasure"

    # Treat logic.method() calls as helper function calls
    # This enables proper conversion of logic.can_deal_damage_hard() etc.
    HELPER_OBJECT_NAMES: Set[str] = {'self', 'world', 'logic'}

    # Enable automatic export of discovered helper functions
    AUTO_EXPORT_DISCOVERED_HELPERS = True

    # Auto-discover helper modules from the world directory
    AUTO_DISCOVER_WORLD_HELPER_MODULES = True

    # Explicitly specify the logic module containing helpers
    HELPER_MODULES = ['worlds.another_crab.logic']

    # Whitelist the main helpers used in forkless rules
    # These are the top-level helpers called directly from rules.py
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = {
        # Main damage-dealing ability checks (used by allow_forkless option)
        'can_deal_damage_hard',
        'can_deal_damage_easy',
        # Component helpers for damage checks
        'can_rolling_attack',
        'can_magic_damage',
        'can_atk_damage_shell',
        'has_summon',
        'has_adaptation',
        # Shell ability checks
        'can_twist_top',
        'can_pop_off',
        'can_rollout',
        'can_bombs_away',
        'can_decoy',
        'can_fizzle',
        'can_party_time',
        'can_shards',
        'can_squash',
        'can_twinkle',
        # Shell category checks
        'can_reach_magic_shells',
        'can_reach_msg_dmg_shells',
        'can_reach_rolling_shells',
        # Umami regeneration check
        'can_regen_umami',
    }

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            logger.debug(f"Initialized Another Crab's Treasure export handler for player {world.player}")
