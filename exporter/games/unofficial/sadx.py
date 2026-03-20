"""Sonic Adventure DX game-specific export handler.

SADX uses complex dynamic rule patterns that cannot be statically exported:
- Field emblem rules iterate over character/upgrade combinations from location data
- Sub-level rules check which characters can access based on options
- Chao egg rules combine character access with item requirements

This handler pre-computes the character access rules based on the world's options
and generates static Or/And expressions that the Rule Builder can evaluate.

Key option-dependent rules:
- logic_level: Determines which character list to use (0=normal, 1=hard, 2-4=expert variants)
- playable_*: Determines which characters are available (sonic, tails, knuckles, amy, big, gamma)
- field_emblems_checks: Whether field emblem locations are enabled

Character naming:
- Plain character: "Playable Sonic", "Playable Tails", etc.
- Character with upgrade: CharacterUpgrade(Character.Gamma, "Jet Booster") means
  need both "Playable Gamma" AND "Jet Booster" to access
"""

from typing import Dict, Any, Set, Optional, List, Tuple
from ..base import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)


# Character upgrade data classes (simplified from apworld)
class CharacterUpgrade:
    """Represents a character with a required upgrade."""
    def __init__(self, character: str, upgrade: str):
        self.character = character
        self.upgrade = upgrade


# Area name conversions (pascal_to_space equivalent)
def area_to_region_name(area_name: str) -> str:
    """Convert area enum name to region display name."""
    # Handle special prefixes
    area_name = re.sub(r'^SS', 'S.S.', area_name)
    area_name = re.sub(r'^MR', 'M.R.', area_name)
    area_name = re.sub(r'^TP', 'T.P.', area_name)
    area_name = re.sub(r'^EC', 'E.C.', area_name)
    area_name = area_name.replace('_', ' ')
    # Add spaces before capital letters
    area_name = re.sub(r'(?<!^)(?=[A-Z][a-z])', ' ', area_name)
    area_name = re.sub(r'\s{2,}', ' ', area_name)
    return area_name.strip()


# Character constants
SONIC = 'Sonic'
TAILS = 'Tails'
KNUCKLES = 'Knuckles'
AMY = 'Amy'
BIG = 'Big'
GAMMA = 'Gamma'

# Playable character item names
PLAYABLE_ITEMS = {
    SONIC: 'Playable Sonic',
    TAILS: 'Playable Tails',
    KNUCKLES: 'Playable Knuckles',
    AMY: 'Playable Amy',
    BIG: 'Playable Big',
    GAMMA: 'Playable Gamma',
}

# Character upgrade items
UPGRADES = {
    (GAMMA, 'JetBooster'): 'Jet Booster',
    (KNUCKLES, 'ShovelClaw'): 'Shovel Claw',
    (SONIC, 'LightShoes'): 'Light Shoes',
}

# Field emblem location data: {emblem_name: {logic_level: [(character, upgrade_or_none), ...]}}
# Logic levels: 0=normal, 1=hard, 2=expertDC, 3=expertDX, 4=expertPlusDX
FIELD_EMBLEM_DATA: Dict[str, Dict[int, List[Tuple[str, Optional[str]]]]] = {
    "Station Emblem": {
        0: [(SONIC, None), (KNUCKLES, None), (TAILS, None), (AMY, None), (BIG, None), (GAMMA, 'Jet Booster')],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
    },
    "Burger Shop Emblem": {
        0: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
    },
    "City Hall Emblem": {
        0: [(TAILS, None), (KNUCKLES, 'Shovel Claw')],
        1: [(TAILS, None), (KNUCKLES, 'Shovel Claw')],
        2: [(AMY, None), (TAILS, None), (KNUCKLES, None), (SONIC, 'Light Shoes')],
        3: [(AMY, None), (TAILS, None), (KNUCKLES, None)],
        4: [(AMY, None), (TAILS, None), (KNUCKLES, None)],
    },
    "Casino Emblem": {
        0: [(TAILS, None)],
        1: [(TAILS, None)],
        2: [(TAILS, None), (SONIC, None), (KNUCKLES, None), (AMY, None)],
        3: [(TAILS, None), (SONIC, None)],
        4: [(TAILS, None), (SONIC, None), (KNUCKLES, None)],
    },
    "Tails' Workshop Emblem": {
        0: [(TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster'), (AMY, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster'), (AMY, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster'), (AMY, None)],
    },
    "Shrine Emblem": {
        0: [(KNUCKLES, None)],
        1: [(TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (GAMMA, 'Jet Booster')],
    },
    "Jungle Path Emblem": {
        0: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
    },
    "Tree Stump Emblem": {
        0: [(TAILS, None), (KNUCKLES, None)],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (BIG, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (GAMMA, None), (BIG, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (GAMMA, None), (BIG, None)],
    },
    "Pool Emblem": {
        0: [(TAILS, None), (KNUCKLES, None)],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (GAMMA, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (GAMMA, None)],
    },
    "Spinning Platform Emblem": {
        0: [(TAILS, None)],
        1: [(TAILS, None), (SONIC, None), (KNUCKLES, None)],
        2: [(TAILS, None), (SONIC, None), (KNUCKLES, None), (AMY, None), (GAMMA, 'Jet Booster')],
        3: [(TAILS, None), (SONIC, None), (KNUCKLES, None), (AMY, None)],
        4: [(TAILS, None), (SONIC, None), (KNUCKLES, None), (AMY, None)],
    },
    "Hidden Bed Emblem": {
        0: [(TAILS, None), (SONIC, None)],
        1: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        2: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        3: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
        4: [(SONIC, None), (TAILS, None), (KNUCKLES, None), (AMY, None), (BIG, None), (GAMMA, None)],
    },
    "Main Platform Emblem": {
        0: [(SONIC, None)],
        1: [(SONIC, None), (BIG, None), (KNUCKLES, None), (AMY, None)],
        2: [(SONIC, None), (BIG, None), (KNUCKLES, None), (AMY, None), (TAILS, None)],
        3: [(SONIC, None), (BIG, None), (KNUCKLES, None), (AMY, None), (TAILS, None)],
        4: [(SONIC, None), (BIG, None), (KNUCKLES, None), (AMY, None), (TAILS, None)],
    },
}

# Field emblem area mappings for region access checks
EMBLEM_AREAS = {
    "Station Emblem": "Station",
    "Burger Shop Emblem": "CityHall",
    "City Hall Emblem": "CityHall",
    "Casino Emblem": "Casino",
    "Tails' Workshop Emblem": "MRMain",
    "Shrine Emblem": "AngelIsland",
    "Jungle Path Emblem": "Jungle",
    "Tree Stump Emblem": "Jungle",
    "Pool Emblem": "ECPool",
    "Spinning Platform Emblem": "ECDeck",
    "Hidden Bed Emblem": "PrivateRoom",
    "Main Platform Emblem": "ECBridge",
}

# Sub-level location data: {location_name: {logic_level: [characters]}}
SUB_LEVEL_DATA: Dict[str, Dict[int, List[str]]] = {
    # Twinkle Circuit - single check mode (twinkle_circuit_checks: enabled)
    "Twinkle Circuit (Sub-Level)": {
        0: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        1: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        2: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        3: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        4: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
    },
    # Twinkle Circuit - multiple checks mode (twinkle_circuit_checks: enabled_multiple)
    "Twinkle Circuit (Sub-Level - Mission B)": {
        0: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        1: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        2: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        3: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        4: [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
    },
    "Twinkle Circuit (Sub-Level - Sonic)": {0: [SONIC], 1: [SONIC], 2: [SONIC], 3: [SONIC], 4: [SONIC]},
    "Twinkle Circuit (Sub-Level - Tails)": {0: [TAILS], 1: [TAILS], 2: [TAILS], 3: [TAILS], 4: [TAILS]},
    "Twinkle Circuit (Sub-Level - Knuckles)": {0: [KNUCKLES], 1: [KNUCKLES], 2: [KNUCKLES], 3: [KNUCKLES], 4: [KNUCKLES]},
    "Twinkle Circuit (Sub-Level - Amy)": {0: [AMY], 1: [AMY], 2: [AMY], 3: [AMY], 4: [AMY]},
    "Twinkle Circuit (Sub-Level - Big)": {0: [BIG], 1: [BIG], 2: [BIG], 3: [BIG], 4: [BIG]},
    "Twinkle Circuit (Sub-Level - Gamma)": {0: [GAMMA], 1: [GAMMA], 2: [GAMMA], 3: [GAMMA], 4: [GAMMA]},
    "Sand Hill (Sub-Level - Mission B)": {
        0: [TAILS], 1: [TAILS], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
    "Sand Hill (Sub-Level - Mission A)": {
        0: [TAILS], 1: [TAILS], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
    "Sky Chase Act1 (Sub-Level - Mission B)": {
        0: [TAILS, SONIC], 1: [TAILS, SONIC], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
    "Sky Chase Act1 (Sub-Level - Mission A)": {
        0: [TAILS, SONIC], 1: [TAILS, SONIC], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
    "Sky Chase Act2 (Sub-Level - Mission B)": {
        0: [TAILS, SONIC], 1: [TAILS, SONIC], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
    "Sky Chase Act2 (Sub-Level - Mission A)": {
        0: [TAILS, SONIC], 1: [TAILS, SONIC], 2: [TAILS, SONIC], 3: [TAILS, SONIC], 4: [TAILS, SONIC]
    },
}

# Sub-level area mappings
SUB_LEVEL_AREAS = {
    "Twinkle Circuit (Sub-Level)": "TwinkleCircuit",  # single check mode
    "Twinkle Circuit (Sub-Level - Mission B)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Sonic)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Tails)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Knuckles)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Amy)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Big)": "TwinkleCircuit",
    "Twinkle Circuit (Sub-Level - Gamma)": "TwinkleCircuit",
    "Sand Hill (Sub-Level - Mission B)": "SandHill",
    "Sand Hill (Sub-Level - Mission A)": "SandHill",
    "Sky Chase Act1 (Sub-Level - Mission B)": "SkyChase1",
    "Sky Chase Act1 (Sub-Level - Mission A)": "SkyChase1",
    "Sky Chase Act2 (Sub-Level - Mission B)": "SkyChase2",
    "Sky Chase Act2 (Sub-Level - Mission A)": "SkyChase2",
}

# Chao egg location data: {egg_name: (area, characters, requirements)}
# Requirements are lists of item groups - any group satisfies the requirement
CHAO_EGG_DATA: Dict[str, Tuple[str, List[str], List[List[str]]]] = {
    "Gold Chao Egg": (
        "SSChaoGarden",
        [SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA],
        [["Hotel Key", "Police Pass"], ["Casino Key", "Shutter Key", "Station Key", "Police Pass"]]
    ),
    "Silver Chao Egg": (
        "MRChaoGarden",
        [SONIC, TAILS, KNUCKLES, AMY, BIG],
        []
    ),
    "Black Chao Egg": (
        "ECChaoGarden",
        [AMY, GAMMA, BIG],
        []
    ),
}

# Unified boss fight data: {boss_name: (area, [characters])}
# These are boss fights that can be accessed by multiple characters
# Note: Chaos 6 area is "Chaos6 Zero Beta" (same region as E-100 Zero and E-101 mkII)
UNIFIED_BOSS_DATA: Dict[str, Tuple[str, List[str]]] = {
    "Chaos 4 Boss Fight": ("Chaos4", [SONIC, TAILS, KNUCKLES]),
    "Chaos 6 Boss Fight": ("Chaos6ZeroBeta", [SONIC, KNUCKLES, BIG]),
    "Egg Hornet Boss Fight": ("EggHornet", [SONIC, TAILS]),
}

# Locked locations that need to be manually added
# These locations exist in the original apworld but are marked as locked,
# so they don't appear in sphere logs and the exporter creates placeholder regions
#
# NOTE: Perfect Chaos Fight is intentionally NOT added here because it has
# complex goal-based rules that depend on options like:
# - goal_requires_emblems, goal_requires_levels, goal_requires_missions, etc.
# These rules check can_reach on many other locations and cannot be statically exported.
# The location will naturally not be accessible in the tracker until the player
# manually unlocks it via the game's progression system.
LOCKED_LOCATIONS: Dict[str, Dict[str, Any]] = {
    # Empty - no locked locations need manual addition currently
}


class SADXGameExportHandler(GenericGameExportHandler):
    """Export handler for Sonic Adventure DX.

    Expands dynamic character/upgrade rules to static item checks.
    """

    GAME_NAME = 'Sonic Adventure DX'

    # Cache option values
    _logic_level: int = 0
    _playable_characters: Set[str] = set()

    def __init__(self, world=None):
        super().__init__(world)
        if world:
            self._load_options(world)

    def _load_options(self, world) -> None:
        """Load relevant options from the world."""
        # Default to all characters playable if options can't be loaded
        self._playable_characters = {SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA}

        if world is None:
            logger.debug("No world provided, using default options")
            return

        try:
            options = world.options

            # Logic level (0-4)
            self._logic_level = getattr(options.logic_level, 'value', 0)

            # Playable characters
            self._playable_characters = set()
            for char, opt_name in [
                (SONIC, 'playable_sonic'),
                (TAILS, 'playable_tails'),
                (KNUCKLES, 'playable_knuckles'),
                (AMY, 'playable_amy'),
                (BIG, 'playable_big'),
                (GAMMA, 'playable_gamma'),
            ]:
                opt = getattr(options, opt_name, None)
                if opt and getattr(opt, 'value', 0) > 0:
                    self._playable_characters.add(char)

            logger.debug(f"SADX options: logic_level={self._logic_level}, "
                        f"playable={self._playable_characters}")
        except Exception as e:
            logger.warning(f"Could not load SADX options: {e}")
            # Default to all characters playable
            self._playable_characters = {SONIC, TAILS, KNUCKLES, AMY, BIG, GAMMA}

    def _get_character_access_rule(
        self,
        character: str,
        upgrade: Optional[str],
        area: str
    ) -> Optional[Dict[str, Any]]:
        """Generate rule for a character (with optional upgrade) to access a location.

        Returns None if this character is not playable.
        """
        if character not in self._playable_characters:
            return None

        playable_item = PLAYABLE_ITEMS[character]
        region_name = f"{area_to_region_name(area)} ({character})"

        # Base requirement: have the playable character item
        conditions = [{'type': 'item_check', 'item': playable_item}]

        # Add upgrade requirement if needed
        if upgrade:
            conditions.append({'type': 'item_check', 'item': upgrade})

        # Add region access check
        conditions.append({'type': 'can_reach', 'region': region_name})

        if len(conditions) == 1:
            return conditions[0]
        return {'type': 'and', 'conditions': conditions}

    def _expand_emblem_rule(self, emblem_name: str) -> Dict[str, Any]:
        """Expand a field emblem rule to static character checks."""
        if emblem_name not in FIELD_EMBLEM_DATA:
            logger.warning(f"Unknown emblem: {emblem_name}")
            return {'type': 'constant', 'value': False}

        emblem_data = FIELD_EMBLEM_DATA[emblem_name]
        area = EMBLEM_AREAS.get(emblem_name, "")

        # Get character list for current logic level
        logic_level = min(self._logic_level, 4)
        char_list = emblem_data.get(logic_level, emblem_data.get(0, []))

        # Build Or of character access rules
        or_conditions = []
        for char, upgrade in char_list:
            rule = self._get_character_access_rule(char, upgrade, area)
            if rule:
                or_conditions.append(rule)

        if not or_conditions:
            return {'type': 'constant', 'value': False}
        if len(or_conditions) == 1:
            return or_conditions[0]
        return {'type': 'or', 'conditions': or_conditions}

    def _expand_sublevel_rule(self, location_name: str) -> Dict[str, Any]:
        """Expand a sub-level rule to static character checks."""
        if location_name not in SUB_LEVEL_DATA:
            logger.warning(f"Unknown sub-level: {location_name}")
            return {'type': 'constant', 'value': False}

        sublevel_data = SUB_LEVEL_DATA[location_name]
        area = SUB_LEVEL_AREAS.get(location_name, "")

        # Get character list for current logic level
        logic_level = min(self._logic_level, 4)
        char_list = sublevel_data.get(logic_level, sublevel_data.get(0, []))

        # Build Or of character access rules (no upgrades for sub-levels)
        or_conditions = []
        for char in char_list:
            rule = self._get_character_access_rule(char, None, area)
            if rule:
                or_conditions.append(rule)

        if not or_conditions:
            return {'type': 'constant', 'value': False}
        if len(or_conditions) == 1:
            return or_conditions[0]
        return {'type': 'or', 'conditions': or_conditions}

    def _expand_chao_egg_rule(self, egg_name: str) -> Dict[str, Any]:
        """Expand a chao egg rule to static character + item checks."""
        if egg_name not in CHAO_EGG_DATA:
            logger.warning(f"Unknown chao egg: {egg_name}")
            return {'type': 'constant', 'value': False}

        area, characters, requirements = CHAO_EGG_DATA[egg_name]

        # Build Or of character access rules
        or_conditions = []
        for char in characters:
            rule = self._get_character_access_rule(char, None, area)
            if rule:
                or_conditions.append(rule)

        if not or_conditions:
            return {'type': 'constant', 'value': False}

        # Base character access rule
        if len(or_conditions) == 1:
            char_rule = or_conditions[0]
        else:
            char_rule = {'type': 'or', 'conditions': or_conditions}

        # Add item requirements if any
        if not requirements:
            return char_rule

        # Requirements is a list of item groups - any group satisfies
        # Each group is an And of items
        req_conditions = []
        for item_group in requirements:
            if len(item_group) == 1:
                req_conditions.append({'type': 'item_check', 'item': item_group[0]})
            else:
                req_conditions.append({
                    'type': 'and',
                    'conditions': [{'type': 'item_check', 'item': item} for item in item_group]
                })

        if len(req_conditions) == 1:
            req_rule = req_conditions[0]
        else:
            req_rule = {'type': 'or', 'conditions': req_conditions}

        return {'type': 'and', 'conditions': [char_rule, req_rule]}

    def _expand_boss_rule(self, boss_name: str) -> Dict[str, Any]:
        """Expand a unified boss fight rule to static character checks."""
        if boss_name not in UNIFIED_BOSS_DATA:
            logger.warning(f"Unknown boss fight: {boss_name}")
            return {'type': 'constant', 'value': False}

        area, characters = UNIFIED_BOSS_DATA[boss_name]

        # Build Or of character access rules (no upgrades for boss fights)
        or_conditions = []
        for char in characters:
            rule = self._get_character_access_rule(char, None, area)
            if rule:
                or_conditions.append(rule)

        if not or_conditions:
            return {'type': 'constant', 'value': False}
        if len(or_conditions) == 1:
            return or_conditions[0]
        return {'type': 'or', 'conditions': or_conditions}

    def _expand_nested_any_all_rule(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand a nested AST_any_of/all_of pattern to static item checks.

        This handles patterns like:
            any(all(state.has(item, player) for item in group) for group in [[item1], [item2, item3]])

        Which should expand to:
            Or(HasAll([item1]), HasAll([item2, item3]))

        Returns None if the pattern doesn't match.
        """
        if rule.get('rule') != 'AST_any_of':
            return None

        args = rule.get('args', {})
        element_rule = args.get('element_rule', {})
        iterator_info = args.get('iterator_info', {})
        iterator = iterator_info.get('iterator', {})

        # Check for the nested all_of pattern
        if element_rule.get('type') != 'all_of':
            return None

        # Check if outer iterator is a constant list of lists
        if iterator.get('type') != 'constant':
            return None

        item_groups = iterator.get('value', [])
        if not isinstance(item_groups, list):
            return None

        # Check the inner element_rule is an item_check
        inner_element = element_rule.get('element_rule', {})
        if inner_element.get('type') != 'item_check':
            return None

        # Build Or of HasAll for each group
        or_conditions = []
        for group in item_groups:
            if not isinstance(group, list):
                continue
            if not group:
                # Empty group - always true for all()
                continue

            if len(group) == 1:
                or_conditions.append({'type': 'item_check', 'item': group[0]})
            else:
                or_conditions.append({
                    'type': 'and',
                    'conditions': [{'type': 'item_check', 'item': item} for item in group]
                })

        if not or_conditions:
            # No groups - any() of nothing is False
            return {'type': 'constant', 'value': False}
        if len(or_conditions) == 1:
            return or_conditions[0]
        return {'type': 'or', 'conditions': or_conditions}

    def _expand_empty_all_of_rule(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand an AST_all_of rule with empty iterator to True_.

        Pattern: all(state.has(item, player) for item in [])
        This is always true (vacuously true).
        """
        if rule.get('rule') != 'AST_all_of':
            return None

        args = rule.get('args', {})
        iterator_info = args.get('iterator_info', {})
        iterator = iterator_info.get('iterator', {})

        if iterator.get('type') == 'constant':
            value = iterator.get('value', [])
            if isinstance(value, list) and len(value) == 0:
                return {'type': 'constant', 'value': True}

        return None

    def post_process_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process SADX export data.

        Replaces False_() rules for field emblems, sub-levels, and chao eggs
        with properly expanded character access rules.

        Also expands nested AST_any_of/all_of patterns in exit rules.
        """
        logger.debug(f"SADX post_process_data called, logic_level={self._logic_level}, "
                    f"playable={self._playable_characters}")

        expanded_location_count = 0
        expanded_exit_count = 0

        for player_id, player_regions in data.get('regions', {}).items():
            for region_name, region_data in player_regions.items():
                # Process location rules
                for location_data in region_data.get('locations', []):
                    loc_name = location_data.get('name', '')
                    access_rule = location_data.get('access_rule', {})

                    # Check if this is a False_() rule that needs expansion
                    is_false_rule = (
                        access_rule.get('rule') == 'False_' or
                        access_rule.get('type') == 'constant' and access_rule.get('value') is False
                    )

                    if not is_false_rule:
                        # Also check for AST_any_of rules with function_call iterators
                        if access_rule.get('rule') == 'AST_any_of':
                            args = access_rule.get('args', {})
                            iterator_info = args.get('iterator_info', {})
                            iterator = iterator_info.get('iterator', {})
                            if iterator.get('type') == 'function_call':
                                is_false_rule = True  # Will be converted to False_() anyway
                                logger.debug(f"Found AST_any_of with function_call for {loc_name}")

                    # Also expand known locations regardless of rule type
                    needs_expansion = (
                        is_false_rule or
                        loc_name in FIELD_EMBLEM_DATA or
                        loc_name in SUB_LEVEL_DATA or
                        loc_name in CHAO_EGG_DATA or
                        loc_name in UNIFIED_BOSS_DATA
                    )

                    if needs_expansion:
                        # Try to expand based on location name
                        new_rule = None

                        if loc_name in FIELD_EMBLEM_DATA:
                            new_rule = self._expand_emblem_rule(loc_name)
                            logger.debug(f"Expanded emblem rule for {loc_name}")
                        elif loc_name in SUB_LEVEL_DATA:
                            new_rule = self._expand_sublevel_rule(loc_name)
                            logger.debug(f"Expanded sub-level rule for {loc_name}")
                        elif loc_name in CHAO_EGG_DATA:
                            new_rule = self._expand_chao_egg_rule(loc_name)
                            logger.debug(f"Expanded chao egg rule for {loc_name}")
                        elif loc_name in UNIFIED_BOSS_DATA:
                            new_rule = self._expand_boss_rule(loc_name)
                            logger.debug(f"Expanded boss rule for {loc_name}")

                        if new_rule:
                            location_data['access_rule'] = new_rule
                            expanded_location_count += 1

                # Process exit rules
                for exit_data in region_data.get('exits', []):
                    exit_name = exit_data.get('name', '')
                    access_rule = exit_data.get('access_rule', {})

                    # Try to expand nested AST_any_of/all_of patterns
                    if access_rule.get('rule') == 'AST_any_of':
                        new_rule = self._expand_nested_any_all_rule(access_rule)
                        if new_rule:
                            exit_data['access_rule'] = new_rule
                            expanded_exit_count += 1
                            logger.debug(f"Expanded nested any/all rule for exit {exit_name}")

                    # Also expand empty all_of rules to True_
                    elif access_rule.get('rule') == 'AST_all_of':
                        new_rule = self._expand_empty_all_of_rule(access_rule)
                        if new_rule:
                            exit_data['access_rule'] = new_rule
                            expanded_exit_count += 1
                            logger.debug(f"Expanded empty all_of rule for exit {exit_name}")

        logger.debug(f"SADX post_process_data expanded {expanded_location_count} location rules, "
                    f"{expanded_exit_count} exit rules")

        # Add locked locations that weren't exported
        added_locked = 0
        for player_id, player_regions in data.get('regions', {}).items():
            for loc_name, loc_info in LOCKED_LOCATIONS.items():
                region_name = loc_info['region']
                if region_name in player_regions:
                    region_data = player_regions[region_name]
                    locations = region_data.get('locations', [])

                    # Check if location already exists
                    existing_names = [loc.get('name', '') for loc in locations]
                    if loc_name not in existing_names:
                        # Add the locked location
                        new_location = {
                            'name': loc_name,
                            'id': loc_info['id'],
                            'access_rule': {'rule': 'True_'},  # Always accessible when region is
                            'locked': loc_info.get('locked', False),
                        }
                        locations.append(new_location)
                        region_data['locations'] = locations

                        # Remove placeholder flag since region now has a location
                        if region_data.get('placeholder'):
                            del region_data['placeholder']

                        added_locked += 1
                        logger.debug(f"Added locked location {loc_name} to region {region_name}")

        if added_locked > 0:
            logger.debug(f"SADX post_process_data added {added_locked} locked locations")

        return data
