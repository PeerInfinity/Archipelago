"""Yu-Gi-Oh! Dungeon Dice Monsters game-specific export handler.

This handler converts the apworld's rule patterns to Rule Builder format.

The DDM world uses patterns like:
- `d.duelist in self.get_available_duelists(state)` for duelist location accessibility
- `state.has_from_list(duelist_names, player, count)` for Yami Yugi's goal requirement

Key concepts:
- Each duelist has a location named "{duelist_name} defeated 1" (and optionally " 2")
- Duelists are unlocked either by starting unlocked or by collecting their unlock item
- `starting_unlocked_duelists` is determined at generation time based on the `starting_duelists` option
"""

from typing import Dict, Any, Optional, List, Set
from ..base import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)


class YuGiOhDDMExportHandler(GenericGameExportHandler):
    """Export handler for Yu-Gi-Oh! Dungeon Dice Monsters."""

    GAME_NAME = 'Yu-Gi-Oh! Dungeon Dice Monsters'

    # All duelist names in the game (from duelists.py)
    ALL_DUELISTS = [
        "Grandpa", "Demitrius the Bully", "Tea Gardner", "Tristan Taylor",
        "Joey Wheeler", "Yugi Moto", "Yami Yugi", "Miss Madusa", "Kreiger",
        "Fortuno", "Jackpot", "Fender Shrill", "Lint Greendale", "Director Lucius",
        "AD Archie", "Kane Minion B", "Kane Minion A", "Diesel Kane", "Seto Kaiba",
        "Venom C", "Venom B", "Venom A", "Scorpion Shoes Owner", "Beluga",
        "Professor Jeremy Harrison", "Shadi", "Curator Adriel Wainwright",
        "Kane Minion F", "Kane Minion E", "Kane Minion D", "Kane Minion C",
        "Cedric", "Feng Long", "Mokuba Kaiba", "Egger Baldwin", "Thug C",
        "Thug B", "Thug A", "The Greendale Zompire", "Stringer", "Game Show Producer",
        "Anton Periwig", "Chopman", "Kaibas' Butler", "Snipes Crosshair",
        "Bickford Gage", "Charlie Gale", "Rex Raptor", "Weevil Underwood",
        "Yami Bakura", "Mr. Titus", "Bakura", "Nibbles", "Damien Draco",
        "Tick-Tock", "Para", "Panik", "The Puppeteer", "Mako Tsunami",
        "Mai Valentine", "Melody", "Serenity Wheeler", "Maximillion Pegasus",
        "Espa Roba", "Bonz", "Sindin the Clown", "Duke Devlin", "Bandit Keith",
        "Kemo", "Croquet", "Dox", "The Merchant", "Strings", "Arkana",
        "Marik Ishtar", "Yugi's Mother", "Johnny Steps", "Seeker", "Ishizu Ishtar",
        "Roger", "Lloyd", "Norman", "Odion", "Umbra", "Lumis", "Paradox",
        "Doris", "Jill", "Ryan", "Paul", "Diana", "Andrea"
    ]

    # Regex patterns for location names
    DUELIST_LOCATION_PATTERN = re.compile(r'^(.+) defeated (\d)$')
    DICE_LOCATION_PATTERN = re.compile(r'^Collect (.+)$')

    # Dice shop levels: dice_name -> shop_level
    # Formula for required Shop Progression items: (shop_level + 2) // 3
    DICE_SHOP_LEVELS = {
        "B.eye White Dragon": 14, "Mystical Elf": 5, "Hitotsu-me Giant": 3,
        "Baby Dragon": 2, "Ryu-kishin": 0, "Feral Imp": 7, "Winged Dragon #1": 4,
        "Mushroom Man": 0, "Shadow Specter": 0, "Swamp Battleguard": 5,
        "Battle Steer": 4, "Flame Swordsman": 4, "Time Wizard": 6,
        "R Leg of Forbidden": 0, "L Leg of Forbidden": 0, "R Arm of Forbidden": 0,
        "L Arm of Forbidden": 0, "Exod. of Forbidden": 3, "Summoned Skull": 12,
        "Battle Ox": 4, "Beaver Warrior": 0, "Rock Ogre Grotto #1": 6,
        "Zombie Warrior": 6, "Koumori Dragon": 2, "Saggi the Dark Clown": 4,
        "Dark Magician": 11, "The Snake Hair": 6, "Gaia the Dragon Champion": 13,
        "Gaia the Fierce Knight": 13, "Curse of Dragon": 5, "Dragon Piper": 7,
        "Celtic Guardian": 1, "Faceless Mage": 6, "Karbonala Warrior": 0,
        "Rogue Doll": 8, "Sangan": 0, "Killer Needle": 1, "Giant Flea": 2,
        "Larvae Moth": 4, "Great Moth": 10, "Kuriboh": 0, "Mammoth Graveyard": 6,
        "Harpie Lady": 6, "Harpie Lady Sisters": 8, "Perfectly Ultimate": 16,
        "Thousand Dragon": 7, "Jellyfish": 6, "Cocoon of Evolution": 7,
        "Giant Rock Soldier": 9, "Red-eyes B. Dragon": 12, "Castle of D. Magic": 5,
        "Metal Guardian": 5, "Mystic Horseman": 6, "Rabid Horseman": 9,
        "Clown Zombie": 0, "Pumpking the King of Ghosts": 8, "Battle Warrior": 3,
        "The 13th Grave": 2, "Petit Dragon": 6, "Aqua Madoor": 1,
        "B. Skull Dragon": 15, "Beautiful Headhuntress": 0, "Yaranzo": 1,
        "Kanan the Swordmistress": 1, "Stuffed Animal": 0, "Three-legged Zombies": 1,
        "Flying Penguin": 0, "Millennium Shield": 1, "Black Luster Soldier": 13,
        "Fiend's Mirror": 0, "Jirai Gumo": 1, "Sanga of the Thunder": 11,
        "Kazejin": 11, "Suijin": 11, "Gate Guardian": 16, "Ryu-kishin Powered": 7,
        "B.eye Ultimate Dragon": 17, "Parrot Dragon": 7, "Mystic Lamp": 6,
        "Pendulum Machine": 7, "Zoa": 7, "Metalzoa": 9, "Dancing Elf": 3,
        "Man-eater Bug": 0, "Gemini Elf": 9, "Skelengel": 6, "Hane-Hane": 0,
        "Penguin Soldier": 0, "Twin-headed Thunder Dragon": 10,
        "Witch's Apprentice": 0, "Meteor Dragon": 10, "Meteor B. Dragon": 11,
        "Dokurorider": 6, "Magician of Black Chaos": 13, "Slot Machine": 6,
        "Red Archery Girl": 0, "Dark-eyes Illusionist": 10, "Relinquished": 11,
        "Thousand-eyes Restrict": 13, "Lord of D.": 7, "R.eye B. M. Dragon": 13,
        "Barrel Dragon": 10, "Jinzo": 0, "Twin-Headed Dragon": 1, "Gator Dragon": 4,
        "Blast Lizard": 14, "Knight of Twin Swords": 10, "Thunder Ball": 14,
        "Magician Dragon": 18, "Strike Ninja": 16, "Mighty Mage": 11,
        "Crocozaurus": 12, "Orgoth the Relentless": 13, "Medical Aid Kit": 5,
        "Exploding Disc": 4, "Time Machine": 2, "Energy Disc": 9, "Trap Bandit": 0,
        "Decleration of Despair": 0, "Gluminizer": 6, "Resurrection Scroll": 9,
        "Warp Vortex": 7, "Crater Creator": 12
    }

    # Shop Progression item name
    SHOP_PROGRESSION_ITEM = "Shop Progression"

    # Mapping from display names (Yugi Moto) to enum-style names (YUGI_MOTO)
    # Item names in the apworld use enum-style format
    DISPLAY_TO_ENUM_NAME = {
        "Grandpa": "GRANDPA", "Demitrius the Bully": "DEMITRIUS_THE_BULLY",
        "Tea Gardner": "TEA_GARDNER", "Tristan Taylor": "TRISTAN_TAYLOR",
        "Joey Wheeler": "JOEY_WHEELER", "Yugi Moto": "YUGI_MOTO",
        "Yami Yugi": "YAMI_YUGI", "Miss Madusa": "MISS_MADUSA",
        "Kreiger": "KREIGER", "Fortuno": "FORTUNO", "Jackpot": "JACKPOT",
        "Fender Shrill": "FENDER_SHRILL", "Lint Greendale": "LINT_GREENDALE",
        "Director Lucius": "DIRECTOR_LUCIUS", "AD Archie": "AD_ARCHIE",
        "Kane Minion B": "KANE_MINION_B", "Kane Minion A": "KANE_MINION_A",
        "Diesel Kane": "DIESEL_KANE", "Seto Kaiba": "SETO_KAIBA",
        "Venom C": "VENOM_C", "Venom B": "VENOM_B", "Venom A": "VENOM_A",
        "Scorpion Shoes Owner": "SCORPION_SHOES_OWNER", "Beluga": "BELUGA",
        "Professor Jeremy Harrison": "PROFESSOR_JEREMY_HARRISON", "Shadi": "SHADI",
        "Curator Adriel Wainwright": "CURATOR_ADRIEL_WAINWRIGHT",
        "Kane Minion F": "KANE_MINION_F", "Kane Minion E": "KANE_MINION_E",
        "Kane Minion D": "KANE_MINION_D", "Kane Minion C": "KANE_MINION_C",
        "Cedric": "CEDRIC", "Feng Long": "FENG_LONG", "Mokuba Kaiba": "MOKUBA_KAIBA",
        "Egger Baldwin": "EGGER_BALDWIN", "Thug C": "THUG_C", "Thug B": "THUG_B",
        "Thug A": "THUG_A", "The Greendale Zompire": "THE_GREENDALE_ZOMPIRE",
        "Stringer": "STRINGER", "Game Show Producer": "GAME_SHOW_PRODUCER",
        "Anton Periwig": "ANTON_PERIWIG", "Chopman": "CHOPMAN",
        "Kaibas' Butler": "KAIBAS_BUTLER", "Snipes Crosshair": "SNIPES_CROSSHAIR",
        "Bickford Gage": "BICKFORD_GAGE", "Charlie Gale": "CHARLIE_GALE",
        "Rex Raptor": "REX_RAPTOR", "Weevil Underwood": "WEEVIL_UNDERWOOD",
        "Yami Bakura": "YAMI_BAKURA", "Mr. Titus": "MR_TITUS", "Bakura": "BAKURA",
        "Nibbles": "NIBBLES", "Damien Draco": "DAMIEN_DRACO", "Tick-Tock": "TICK_TOCK",
        "Para": "PARA", "Panik": "PANIK", "The Puppeteer": "THE_PUPPETEER",
        "Mako Tsunami": "MAKO_TSUNAMI", "Mai Valentine": "MAI_VALENTINE",
        "Melody": "MELODY", "Serenity Wheeler": "SERENITY_WHEELER",
        "Maximillion Pegasus": "MAXIMILLION_PEGASUS", "Espa Roba": "ESPA_ROBA",
        "Bonz": "BONZ", "Sindin the Clown": "SINDIN_THE_CLOWN",
        "Duke Devlin": "DUKE_DEVLIN", "Bandit Keith": "BANDIT_KEITH",
        "Kemo": "KEMO", "Croquet": "CROQUET", "Dox": "DOX",
        "The Merchant": "THE_MERCHANT", "Strings": "STRINGS", "Arkana": "ARKANA",
        "Marik Ishtar": "MARIK_ISHTAR", "Yugi's Mother": "YUGIS_MOTHER",
        "Johnny Steps": "JOHNNY_STEPS", "Seeker": "SEEKER",
        "Ishizu Ishtar": "ISHIZU_ISHTAR", "Roger": "ROGER", "Lloyd": "LLOYD",
        "Norman": "NORMAN", "Odion": "ODION", "Umbra": "UMBRA", "Lumis": "LUMIS",
        "Paradox": "PARADOX", "Doris": "DORIS", "Jill": "JILL", "Ryan": "RYAN",
        "Paul": "PAUL", "Diana": "DIANA", "Andrea": "ANDREA"
    }

    # Mapping from enum-style names (YUGI_MOTO) to display names (Yugi Moto)
    # The world stores starting_unlocked_duelists_str using enum-style names
    ENUM_TO_DISPLAY_NAME = {
        "GRANDPA": "Grandpa", "DEMITRIUS_THE_BULLY": "Demitrius the Bully",
        "TEA_GARDNER": "Tea Gardner", "TRISTAN_TAYLOR": "Tristan Taylor",
        "JOEY_WHEELER": "Joey Wheeler", "YUGI_MOTO": "Yugi Moto",
        "YAMI_YUGI": "Yami Yugi", "MISS_MADUSA": "Miss Madusa",
        "KREIGER": "Kreiger", "FORTUNO": "Fortuno", "JACKPOT": "Jackpot",
        "FENDER_SHRILL": "Fender Shrill", "LINT_GREENDALE": "Lint Greendale",
        "DIRECTOR_LUCIUS": "Director Lucius", "AD_ARCHIE": "AD Archie",
        "KANE_MINION_B": "Kane Minion B", "KANE_MINION_A": "Kane Minion A",
        "DIESEL_KANE": "Diesel Kane", "SETO_KAIBA": "Seto Kaiba",
        "VENOM_C": "Venom C", "VENOM_B": "Venom B", "VENOM_A": "Venom A",
        "SCORPION_SHOES_OWNER": "Scorpion Shoes Owner", "BELUGA": "Beluga",
        "PROFESSOR_JEREMY_HARRISON": "Professor Jeremy Harrison", "SHADI": "Shadi",
        "CURATOR_ADRIEL_WAINWRIGHT": "Curator Adriel Wainwright",
        "KANE_MINION_F": "Kane Minion F", "KANE_MINION_E": "Kane Minion E",
        "KANE_MINION_D": "Kane Minion D", "KANE_MINION_C": "Kane Minion C",
        "CEDRIC": "Cedric", "FENG_LONG": "Feng Long", "MOKUBA_KAIBA": "Mokuba Kaiba",
        "EGGER_BALDWIN": "Egger Baldwin", "THUG_C": "Thug C", "THUG_B": "Thug B",
        "THUG_A": "Thug A", "THE_GREENDALE_ZOMPIRE": "The Greendale Zompire",
        "STRINGER": "Stringer", "GAME_SHOW_PRODUCER": "Game Show Producer",
        "ANTON_PERIWIG": "Anton Periwig", "CHOPMAN": "Chopman",
        "KAIBAS_BUTLER": "Kaibas' Butler", "SNIPES_CROSSHAIR": "Snipes Crosshair",
        "BICKFORD_GAGE": "Bickford Gage", "CHARLIE_GALE": "Charlie Gale",
        "REX_RAPTOR": "Rex Raptor", "WEEVIL_UNDERWOOD": "Weevil Underwood",
        "YAMI_BAKURA": "Yami Bakura", "MR_TITUS": "Mr. Titus", "BAKURA": "Bakura",
        "NIBBLES": "Nibbles", "DAMIEN_DRACO": "Damien Draco", "TICK_TOCK": "Tick-Tock",
        "PARA": "Para", "PANIK": "Panik", "THE_PUPPETEER": "The Puppeteer",
        "MAKO_TSUNAMI": "Mako Tsunami", "MAI_VALENTINE": "Mai Valentine",
        "MELODY": "Melody", "SERENITY_WHEELER": "Serenity Wheeler",
        "MAXIMILLION_PEGASUS": "Maximillion Pegasus", "ESPA_ROBA": "Espa Roba",
        "BONZ": "Bonz", "SINDIN_THE_CLOWN": "Sindin the Clown",
        "DUKE_DEVLIN": "Duke Devlin", "BANDIT_KEITH": "Bandit Keith",
        "KEMO": "Kemo", "CROQUET": "Croquet", "DOX": "Dox",
        "THE_MERCHANT": "The Merchant", "STRINGS": "Strings", "ARKANA": "Arkana",
        "MARIK_ISHTAR": "Marik Ishtar", "YUGIS_MOTHER": "Yugi's Mother",
        "JOHNNY_STEPS": "Johnny Steps", "SEEKER": "Seeker",
        "ISHIZU_ISHTAR": "Ishizu Ishtar", "ROGER": "Roger", "LLOYD": "Lloyd",
        "NORMAN": "Norman", "ODION": "Odion", "UMBRA": "Umbra", "LUMIS": "Lumis",
        "PARADOX": "Paradox", "DORIS": "Doris", "JILL": "Jill", "RYAN": "Ryan",
        "PAUL": "Paul", "DIANA": "Diana", "ANDREA": "Andrea"
    }

    def __init__(self, world=None):
        super().__init__(world)
        self._current_location_context: Optional[str] = None
        self._starting_unlocked_duelists: Set[str] = set()  # Uses display names
        self._location_to_duelist: Dict[str, str] = {}

        # Build location to duelist mapping
        for duelist in self.ALL_DUELISTS:
            self._location_to_duelist[f"{duelist} defeated 1"] = duelist
            self._location_to_duelist[f"{duelist} defeated 2"] = duelist

        if world:
            self._extract_starting_duelists(world)

    def _extract_starting_duelists(self, world) -> None:
        """Extract the starting unlocked duelists from the world.

        The world stores starting_unlocked_duelists_str using enum-style names
        (e.g., "YUGI_MOTO"), but we need display names for location matching
        (e.g., "Yugi Moto").
        """
        try:
            if hasattr(world, 'starting_unlocked_duelists_str'):
                # Convert enum-style names to display names
                for enum_name in world.starting_unlocked_duelists_str:
                    display_name = self.ENUM_TO_DISPLAY_NAME.get(enum_name, enum_name)
                    self._starting_unlocked_duelists.add(display_name)  # type: ignore[arg-type]
                logger.debug(f"DDM starting unlocked duelists ({len(self._starting_unlocked_duelists)}): {list(self._starting_unlocked_duelists)[:5]}...")
            elif hasattr(world, 'starting_unlocked_duelists'):
                # Fallback: convert Duelist enums to display names using str()
                self._starting_unlocked_duelists = set(str(d) for d in world.starting_unlocked_duelists)
                logger.debug(f"DDM starting unlocked duelists (from enums): {list(self._starting_unlocked_duelists)[:5]}...")
        except Exception as e:
            logger.warning(f"Could not extract starting duelists: {e}")

    def set_location_context(self, location_name: Optional[str]) -> None:
        """Set the current location context for rule processing."""
        self._current_location_context = location_name
        logger.debug(f"DDM: Set location context to '{location_name}'")

    def _get_duelist_for_location(self, location_name: str) -> Optional[str]:
        """Get the duelist name for a given location name."""
        if location_name in self._location_to_duelist:
            return self._location_to_duelist[location_name]

        # Try regex match as fallback
        match = self.DUELIST_LOCATION_PATTERN.match(location_name)
        if match:
            return match.group(1)

        return None

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand DDM-specific rules.

        Handles:
        - `location.duelist in get_available_duelists(state)` -> item check for duelist
        - `d.dice in self.get_available_dice(state)` -> Shop Progression item count check
        - `get_available_duelists` helper calls
        """
        if not isinstance(rule, dict):
            if isinstance(rule, list):
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        rule_type = rule.get('type', '') or rule.get('rule', '')

        # Handle Compare rule: location.duelist in get_available_duelists(state)
        # or: d.dice in self.get_available_dice(state)
        if rule_type in ('Compare', 'compare'):
            # Try duelist pattern first
            result = self._expand_duelist_in_available(rule)
            if result is not None:
                return result
            # Try dice pattern
            result = self._expand_dice_in_available(rule)
            if result is not None:
                return result

        # Handle get_available_duelists helper
        if rule_type == 'get_available_duelists' or (
            rule_type == 'helper' and rule.get('name') == 'get_available_duelists'
        ):
            return self._expand_get_available_duelists()

        # Handle get_available_dice helper
        if rule_type == 'get_available_dice' or (
            rule_type == 'helper' and rule.get('name') == 'get_available_dice'
        ):
            return self._expand_get_available_dice()

        # Handle AST format helper references
        if rule.get('_original_ast_type', '').endswith('helper'):
            helper_name = rule.get('rule', '')
            if helper_name == 'get_available_duelists':
                return self._expand_get_available_duelists()
            if helper_name == 'get_available_dice':
                return self._expand_get_available_dice()

        # Let parent handle other expansions
        return super().expand_rule(rule, _depth)

    def _expand_duelist_in_available(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand 'location.duelist in get_available_duelists(state)' pattern.

        This pattern checks if the duelist for the current location is accessible.
        A duelist is accessible if:
        - They are in starting_unlocked_duelists (always accessible), OR
        - The player has collected the duelist's unlock item
        """
        args = rule.get('args', rule)
        left = args.get('left', {})
        right = args.get('right', {})
        op = args.get('op', '')

        # Check if this is a 'in' comparison
        if op != 'in':
            return None

        # Check if left side is location.duelist
        if not self._is_location_duelist_access(left):
            return None

        # Check if right side is get_available_duelists call
        if not self._is_get_available_duelists(right):
            return None

        # Get the duelist for the current location
        if not self._current_location_context:
            logger.warning("DDM: No location context for duelist rule expansion")
            return None

        duelist_name = self._get_duelist_for_location(self._current_location_context)
        if not duelist_name:
            logger.warning(f"DDM: Could not determine duelist for location '{self._current_location_context}'")
            return None

        logger.debug(f"DDM: Expanding rule for location '{self._current_location_context}' (duelist: {duelist_name})")

        # Check if this duelist is starting unlocked
        if duelist_name in self._starting_unlocked_duelists:
            logger.debug(f"DDM: Duelist '{duelist_name}' is starting unlocked - returning True")
            return {'rule': 'True_'}

        # Otherwise, need to have the duelist's unlock item
        # Item names use enum-style format (PROFESSOR_JEREMY_HARRISON)
        item_name = self.DISPLAY_TO_ENUM_NAME.get(duelist_name, duelist_name)
        logger.debug(f"DDM: Duelist '{duelist_name}' requires unlock item '{item_name}'")
        return {
            'rule': 'Has',
            'args': {'item_name': item_name}
        }

    def _is_location_duelist_access(self, expr: Dict[str, Any]) -> bool:
        """Check if an expression is location.duelist access."""
        if not isinstance(expr, dict):
            return False

        # Check for Attribute rule format
        rule_type = expr.get('rule', '') or expr.get('type', '')
        if rule_type in ('Attribute', 'attribute'):
            args = expr.get('args', expr)
            attr = args.get('attr', '')
            obj = args.get('object', {})

            if attr == 'duelist':
                # Check if object is 'location' or 'd' (the lambda parameter)
                obj_args = obj.get('args', obj)
                obj_name = obj_args.get('name', '')
                if obj_name in ('location', 'd'):
                    return True

                # Also check Name rule format
                obj_type = obj.get('rule', '') or obj.get('type', '')
                if obj_type in ('Name', 'name'):
                    inner_name = obj_args.get('name', '')
                    if inner_name in ('location', 'd'):
                        return True

        return False

    def _is_get_available_duelists(self, expr: Dict[str, Any]) -> bool:
        """Check if an expression is a get_available_duelists call."""
        if not isinstance(expr, dict):
            return False

        rule_type = expr.get('rule', '') or expr.get('type', '')

        # Direct helper reference
        if rule_type == 'get_available_duelists':
            return True

        # Helper with name
        if rule_type == 'helper' and expr.get('name') == 'get_available_duelists':
            return True

        # AST helper format
        if expr.get('_original_ast_type', '').endswith('helper') and expr.get('rule') == 'get_available_duelists':
            return True

        return False

    def _expand_get_available_duelists(self) -> Dict[str, Any]:
        """Expand get_available_duelists helper to a rule that returns the list.

        This is called when the helper is used standalone (not in an 'in' comparison).
        Since we can't return a dynamic list at export time, this should only be used
        in the context of an 'in' comparison which we handle separately.
        """
        # If we have location context, expand for that specific duelist
        if self._current_location_context:
            duelist_name = self._get_duelist_for_location(self._current_location_context)
            if duelist_name:
                if duelist_name in self._starting_unlocked_duelists:
                    return {'rule': 'True_'}
                # Item names use enum-style format
                item_name = self.DISPLAY_TO_ENUM_NAME.get(duelist_name, duelist_name)
                return {'rule': 'Has', 'args': {'item_name': item_name}}

        # Fallback: can't meaningfully expand without context
        logger.warning("DDM: get_available_duelists called without location context")
        return {'rule': 'True_'}

    def _get_dice_for_location(self, location_name: str) -> Optional[str]:
        """Get the dice name for a given location name.

        Dice collection locations are named "Collect {dice_name}".
        """
        match = self.DICE_LOCATION_PATTERN.match(location_name)
        if match:
            return match.group(1)
        return None

    def _expand_dice_in_available(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand 'd.dice in self.get_available_dice(state)' pattern.

        This pattern checks if a dice is available in the shop.
        A dice is available when the player has enough Shop Progression items.
        Required items = (shop_level + 2) // 3
        """
        args = rule.get('args', rule)
        left = args.get('left', {})
        right = args.get('right', {})
        op = args.get('op', '')

        # Check if this is a 'in' comparison
        if op != 'in':
            return None

        # Check if left side is d.dice access (or location.dice)
        if not self._is_location_dice_access(left):
            return None

        # Check if right side is get_available_dice call OR already expanded to HasGroup/True_
        # The right side may already be expanded if this is a second pass through expand_rule
        right_rule = right.get('rule', '') or right.get('type', '')
        if right_rule in ('HasGroup', 'True_'):
            # Already expanded - return the right side directly
            return right

        # Check if right side is get_available_dice call
        if not self._is_get_available_dice(right):
            return None

        # Get the dice for the current location
        if not self._current_location_context:
            logger.warning("DDM: No location context for dice rule expansion")
            return None

        dice_name = self._get_dice_for_location(self._current_location_context)
        if not dice_name:
            logger.warning(f"DDM: Could not determine dice for location '{self._current_location_context}'")
            return None

        logger.debug(f"DDM: Expanding dice rule for location '{self._current_location_context}' (dice: {dice_name})")

        # Get shop level for this dice
        shop_level = self.DICE_SHOP_LEVELS.get(dice_name)
        if shop_level is None:
            logger.warning(f"DDM: Unknown dice '{dice_name}' - not in DICE_SHOP_LEVELS")
            # Fallback: assume always available
            return {'rule': 'True_'}

        # Calculate required Shop Progression items
        required_items = (shop_level + 2) // 3

        if required_items == 0:
            # No Shop Progression items needed
            logger.debug(f"DDM: Dice '{dice_name}' (shop_level={shop_level}) requires 0 items - always accessible")
            return {'rule': 'True_'}

        # Need to have at least required_items Shop Progression items
        logger.debug(f"DDM: Dice '{dice_name}' (shop_level={shop_level}) requires {required_items} Shop Progression items")
        return {
            'rule': 'HasGroup',
            'args': {
                'item_name_group': [self.SHOP_PROGRESSION_ITEM],
                'count': required_items
            }
        }

    def _is_location_dice_access(self, expr: Dict[str, Any]) -> bool:
        """Check if an expression is d.dice or location.dice access."""
        if not isinstance(expr, dict):
            return False

        # Check for Attribute rule format
        rule_type = expr.get('rule', '') or expr.get('type', '')
        if rule_type in ('Attribute', 'attribute'):
            args = expr.get('args', expr)
            attr = args.get('attr', '')
            obj = args.get('object', {})

            if attr == 'dice':
                # Check if object is 'd' or 'location' (the lambda parameter or resolved name)
                obj_args = obj.get('args', obj)
                obj_name = obj_args.get('name', '')
                if obj_name in ('d', 'location'):
                    return True

                # Also check Name rule format
                obj_type = obj.get('rule', '') or obj.get('type', '')
                if obj_type in ('Name', 'name'):
                    inner_name = obj_args.get('name', '')
                    if inner_name in ('d', 'location'):
                        return True

                # Also check 'id' key used in some AST formats
                obj_id = obj_args.get('id', '')
                if obj_id in ('d', 'location'):
                    return True

        return False

    def _is_get_available_dice(self, expr: Dict[str, Any]) -> bool:
        """Check if an expression is a get_available_dice call."""
        if not isinstance(expr, dict):
            return False

        rule_type = expr.get('rule', '') or expr.get('type', '')

        # Direct helper reference
        if rule_type == 'get_available_dice':
            return True

        # Helper with name
        if rule_type == 'helper' and expr.get('name') == 'get_available_dice':
            return True

        # AST helper format
        if expr.get('_original_ast_type', '').endswith('helper') and expr.get('rule') == 'get_available_dice':
            return True

        # Check for method_call format: {'type': 'method_call', 'method': 'get_available_dice', ...}
        if rule_type == 'method_call':
            method = expr.get('method', '')
            if method == 'get_available_dice':
                return True

        # Also check for self.get_available_dice(state) format
        # This shows up as an Attribute access on self
        if rule_type in ('Call', 'call'):
            func = expr.get('args', {}).get('func', expr.get('func', {}))
            if self._is_get_available_dice_method(func):
                return True

        return False

    def _is_get_available_dice_method(self, expr: Dict[str, Any]) -> bool:
        """Check if expression is self.get_available_dice method access."""
        if not isinstance(expr, dict):
            return False

        rule_type = expr.get('rule', '') or expr.get('type', '')
        if rule_type in ('Attribute', 'attribute'):
            args = expr.get('args', expr)
            attr = args.get('attr', '')
            if attr == 'get_available_dice':
                return True

        return False

    def _expand_get_available_dice(self) -> Dict[str, Any]:
        """Expand get_available_dice helper to a rule.

        This is called when the helper is used standalone (not in an 'in' comparison).
        Since we can't return a dynamic list at export time, this should only be used
        in the context of an 'in' comparison which we handle separately.
        """
        # If we have location context, expand for that specific dice
        if self._current_location_context:
            dice_name = self._get_dice_for_location(self._current_location_context)
            if dice_name:
                shop_level = self.DICE_SHOP_LEVELS.get(dice_name, 0)
                required_items = (shop_level + 2) // 3
                if required_items == 0:
                    return {'rule': 'True_'}
                return {
                    'rule': 'HasGroup',
                    'args': {
                        'item_name_group': [self.SHOP_PROGRESSION_ITEM],
                        'count': required_items
                    }
                }

        # Fallback: can't meaningfully expand without context
        logger.warning("DDM: get_available_dice called without location context")
        return {'rule': 'True_'}
