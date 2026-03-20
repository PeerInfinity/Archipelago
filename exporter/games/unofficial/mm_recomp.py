"""Majora's Mask Recompiled export handler.

This handler provides special support for the MM Recomp apworld's shop pricing logic.

The apworld uses `can_purchase(state, player, prices, price_index)` for shop locations
where `prices` is a list generated at runtime based on the `shop_prices` option.
The logic is:
- If price > 200: requires Progressive Wallet x2 (Giant's Wallet)
- If price > 99: requires Progressive Wallet x1 (Adult's Wallet)
- Otherwise: always accessible (True)

This handler intercepts shop location rules and converts them to explicit wallet requirements
based on the actual prices generated for the current seed.
"""

from typing import Dict, Any, List, Optional, Callable
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


# Shop location to price index mapping (from Constants.py in the apworld)
# Note: Special locations with additional requirements (like "Stop Thief" variants)
# are NOT in this dict - they're handled separately with their extra conditions
SHOP_LOCATION_TO_PRICE_INDEX = {
    # Trading Post
    "Clock Town Trading Post Shop Item 1": 0x0A,
    "Clock Town Trading Post Shop Item 2": 0x05,
    "Clock Town Trading Post Shop Item 3": 0x06,
    "Clock Town Trading Post Shop Item 4": 0x03,
    "Clock Town Trading Post Shop Item 5": 0x07,
    "Clock Town Trading Post Shop Item 6": 0x08,
    "Clock Town Trading Post Shop Item 7": 0x09,
    "Clock Town Trading Post Shop Item 8": 0x04,
    # Trading Post (Night)
    "Clock Town Trading Post Shop (Night) Item 1": 0x12,
    "Clock Town Trading Post Shop (Night) Item 2": 0x0E,
    "Clock Town Trading Post Shop (Night) Item 3": 0x11,
    "Clock Town Trading Post Shop (Night) Item 4": 0x0B,
    "Clock Town Trading Post Shop (Night) Item 5": 0x10,
    "Clock Town Trading Post Shop (Night) Item 6": 0x0C,
    "Clock Town Trading Post Shop (Night) Item 7": 0x0F,
    "Clock Town Trading Post Shop (Night) Item 8": 0x0D,
    # Bomb Shop (note: "Item 3 (Stop Thief)" is handled separately)
    "Clock Town Bomb Shop Item 1": 0x1A,
    "Clock Town Bomb Shop Item 2": 0x19,
    "Clock Town Bomb Shop Item 3": 0x17,
    # Curiosity Shop (note: "Stop Thief" variants handled separately)
    "Curiosity Shop Night 3 Thief Stolen Item": 0x15,
    # Magic Hags' Potion Shop (note: Item 1 has special requirements, handled separately)
    "Southern Swamp Witch Shop Item 2": 0x01,
    "Southern Swamp Witch Shop Item 3": 0x00,
    # Goron Village Shop
    "Goron Village Shop Item 1": 0x1E,
    "Goron Village Shop Item 2": 0x1F,
    "Goron Village Shop Item 3": 0x20,
    # Goron Village Shop (Spring)
    "Goron Village Shop (Spring) Item 1": 0x21,
    "Goron Village Shop (Spring) Item 2": 0x22,
    "Goron Village Shop (Spring) Item 3": 0x23,
    # Zora Hall Shop
    "Zora Hall Shop Item 1": 0x1B,
    "Zora Hall Shop Item 2": 0x1C,
    "Zora Hall Shop Item 3": 0x1D,
}

# Default prices (from Constants.py in the apworld)
# Used when shopsanity is disabled or shop_prices is vanilla
DEFAULT_SHOP_PRICES = [
    20,     # 0x00 SI_POTION_RED_1
    10,     # 0x01 SI_POTION_GREEN_1
    60,     # 0x02 SI_POTION_BLUE
    50,     # 0x03 SI_FAIRY_1
    40,     # 0x04 SI_ARROWS_LARGE_1
    30,     # 0x05 SI_POTION_GREEN_2
    80,     # 0x06 SI_SHIELD_HERO_1
    10,     # 0x07 SI_STICK_1
    30,     # 0x08 SI_ARROWS_MEDIUM_1
    30,     # 0x09 SI_NUTS_1
    30,     # 0x0A SI_POTION_RED_2
    50,     # 0x0B SI_FAIRY_2
    30,     # 0x0C SI_ARROWS_MEDIUM_2
    40,     # 0x0D SI_ARROWS_LARGE_2
    30,     # 0x0E SI_POTION_GREEN_3
    30,     # 0x0F SI_NUTS_2
    10,     # 0x10 SI_STICK_2
    80,     # 0x11 SI_SHIELD_HERO_2
    30,     # 0x12 SI_POTION_RED_3
    500,    # 0x13 SI_MASK_ALL_NIGHT
    100,    # 0x14 SI_BOMB_BAG_20_1 (unused)
    100,    # 0x15 SI_BOMB_BAG_30_1
    100,    # 0x16 SI_BOMB_BAG_40 (unused)
    50,     # 0x17 SI_BOMB_BAG_20_2
    90,     # 0x18 SI_BOMB_BAG_30_2
    40,     # 0x19 SI_BOMBCHU
    30,     # 0x1A SI_BOMB_1
    90,     # 0x1B SI_SHIELD_HERO_3
    20,     # 0x1C SI_ARROWS_SMALL_1
    60,     # 0x1D SI_POTION_RED_4
    40,     # 0x1E SI_BOMB_2
    40,     # 0x1F SI_ARROWS_SMALL_2
    80,     # 0x20 SI_POTION_RED_5
    10,     # 0x21 SI_BOMB_3
    20,     # 0x22 SI_ARROWS_SMALL_3
    50,     # 0x23 SI_POTION_RED_6
]


class MMRecompExportHandler(GenericGameExportHandler):
    """Export handler for Majora's Mask Recompiled.

    Handles the shop pricing logic by looking up actual prices from the world
    and converting `can_purchase` calls to explicit wallet requirements.
    """

    GAME_NAME = "Majora's Mask Recompiled"

    def __init__(self, world=None):
        super().__init__(world)
        self._prices: Optional[List[int]] = None
        self._load_prices()

    def _load_prices(self) -> None:
        """Load prices from the world if available."""
        if self.world and hasattr(self.world, 'prices_ints'):
            self._prices = self.world.prices_ints
            logger.info(f"[MMRecomp] Loaded {len(self._prices)} shop prices from world")  # type: ignore[arg-type]
        else:
            # Fall back to default prices
            self._prices = DEFAULT_SHOP_PRICES
            logger.info(f"[MMRecomp] Using default shop prices (world prices not available)")

    def _get_price(self, price_index: int) -> int:
        """Get the price for a given index."""
        if self._prices and 0 <= price_index < len(self._prices):
            return self._prices[price_index]
        # Fall back to default if index is out of range
        if 0 <= price_index < len(DEFAULT_SHOP_PRICES):
            return DEFAULT_SHOP_PRICES[price_index]
        return 0

    def _price_to_wallet_rule(self, price: int) -> Dict[str, Any]:
        """Convert a price to a wallet requirement rule.

        Logic from can_purchase():
        - price > 200: requires Progressive Wallet x2
        - price > 99: requires Progressive Wallet x1
        - otherwise: True (always accessible)
        """
        if price > 200:
            return {
                'type': 'item_check',
                'item': 'Progressive Wallet',
                'count': 2
            }
        elif price > 99:
            return {
                'type': 'item_check',
                'item': 'Progressive Wallet',
                'count': 1
            }
        else:
            return {'type': 'constant', 'value': True}

    def override_rule_analysis(self, rule_func: Callable, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for shop locations.

        When we detect a shop location, we look up the price and convert to
        an explicit wallet requirement rule.

        Args:
            rule_func: The rule function to analyze
            rule_target_name: The name of the location or entrance

        Returns:
            Analyzed rule dict, or None to use standard analysis
        """
        # Skip for worldgen worlds - they already have the rules from JSON export
        is_worldgen = self.is_worldgen_world()
        if is_worldgen:
            logger.debug(f"[MMRecomp] Skipping override for worldgen world, target={rule_target_name}")
            return None

        if not rule_target_name:
            return None

        # Check if this is a shop location we know about
        if rule_target_name in SHOP_LOCATION_TO_PRICE_INDEX:
            price_index = SHOP_LOCATION_TO_PRICE_INDEX[rule_target_name]
            price = self._get_price(price_index)
            rule = self._price_to_wallet_rule(price)

            logger.info(f"[MMRecomp] {rule_target_name}: price={price}, rule={rule}")
            return rule

        # Check for special shop locations with additional rules
        # These locations use can_purchase but also have other conditions

        # Clock Town Bomb Shop Item 3 (Stop Thief) - requires reaching Save Old Lady + wallet
        if rule_target_name == "Clock Town Bomb Shop Item 3 (Stop Thief)":
            price_index = 0x18  # SHOP_ID_BOMB_SHOP_3_UPGRADE
            price = self._get_price(price_index)
            wallet_rule = self._price_to_wallet_rule(price)

            conditions = [
                {'type': 'location_check', 'location': 'North Clock Town Save Old Lady'},
            ]
            # Only add wallet rule if it's not always True
            if wallet_rule.get('type') != 'constant' or wallet_rule.get('value') != True:
                conditions.append(wallet_rule)

            if len(conditions) == 1:
                return conditions[0]
            return {'type': 'and', 'conditions': conditions}

        # Curiosity Shop Night 3 (Stop Thief) - requires reaching Save Old Lady + wallet
        if rule_target_name == "Curiosity Shop Night 3 (Stop Thief)":
            price_index = 0x13  # SHOP_ID_CURIOSITY_SHOP_MASK
            price = self._get_price(price_index)
            wallet_rule = self._price_to_wallet_rule(price)

            conditions = [
                {'type': 'location_check', 'location': 'North Clock Town Save Old Lady'},
            ]
            if wallet_rule.get('type') != 'constant' or wallet_rule.get('value') != True:
                conditions.append(wallet_rule)

            if len(conditions) == 1:
                return conditions[0]
            return {'type': 'and', 'conditions': conditions}

        # Southern Swamp Witch Shop Item 1 - requires Mask of Scents + has_bottle + wallet
        if rule_target_name == "Southern Swamp Witch Shop Item 1":
            price_index = 0x02  # SHOP_ID_WITCH_POTION_1
            price = self._get_price(price_index)
            wallet_rule = self._price_to_wallet_rule(price)

            conditions = [
                {'type': 'item_check', 'item': 'Mask of Scents'},
                # has_bottle requires any of several bottle items
                {'type': 'or', 'conditions': [
                    {'type': 'item_check', 'item': 'Bottle of Milk'},
                    {'type': 'item_check', 'item': 'Bottle of Chateau Romani'},
                    {'type': 'item_check', 'item': 'Bottle of Red Potion'},
                    {'type': 'item_check', 'item': 'Bottle of Gold Dust'},
                    {'type': 'item_check', 'item': 'Empty Bottle'},
                ]},
            ]
            if wallet_rule.get('type') != 'constant' or wallet_rule.get('value') != True:
                conditions.append(wallet_rule)

            logger.info(f"[MMRecomp] {rule_target_name}: price={price}, rule=and({len(conditions)} conditions)")
            return {'type': 'and', 'conditions': conditions}

        # Fall back to standard analysis for other rules
        return None
