"""Raft game-specific export handler.

Raft uses dictionary-based rule lookups (regionChecks/itemChecks) that can't be
analyzed by the standard AST analyzer. This handler uses locations.json to resolve
which rules apply to each location, then constructs the appropriate rule structures.
"""

from typing import Optional, Set
from ..base import GenericGameExportHandler
import json
import logging
import os

logger = logging.getLogger(__name__)


# Helper functions to create rule structures compactly
def _h(name):
    """Create a helper call rule."""
    return {'type': 'helper', 'name': name, 'args': []}


def _and(*helpers):
    """Create an AND of helper calls."""
    return {'type': 'and', 'conditions': [_h(h) for h in helpers]}


def _or(*helpers):
    """Create an OR of helper calls."""
    return {'type': 'or', 'conditions': [_h(h) for h in helpers]}


_TRUE = {'type': 'constant', 'value': True}


class RaftGameExportHandler(GenericGameExportHandler):
    """Export handler for Raft."""

    # Use resolved_items for progressive item tracking (e.g., "Smelter" not "progressive-metals")
    USE_RESOLVED_ITEMS = True
    ADD_SPHERE_ITEMS_UPFRONT = True

    # Export all helper functions used in the manually constructed rules
    # These helpers are defined in worlds/raft/Rules.py as methods on RaftLogic class
    HELPERS_TO_EXPORT_WHITELIST: Set[str] = {
        # Region access helpers
        'raft_can_access_radio_tower',
        'raft_can_access_vasagatan',
        'raft_can_access_balboa_island',
        'raft_can_access_caravan_island',
        'raft_can_access_tangaroa',
        'raft_can_access_varuna_point',
        'raft_can_access_temperance',
        'raft_can_access_utopia',
        'raft_can_complete_temperance',
        # Item/crafting helpers
        'raft_big_islands_available',
        'raft_can_smelt_items',
        'raft_can_craft_bolt',
        'raft_can_craft_hinge',
        'raft_can_craft_circuitBoard',
        'raft_can_craft_plasticBottle',
        'raft_can_craft_birdNest',
        'raft_can_craft_shears',
        'raft_can_craft_machete',
        'raft_can_craft_ziplineTool',
        'raft_can_capture_animals',
        'raft_can_get_dirt',
        'raft_can_find_titanium',
    }

    # Maps material/item names to their access rules (from itemChecks in Rules.py)
    ITEM_CHECK_RULES = {
        # Basic materials - always available
        "Plank": _TRUE, "Plastic": _TRUE, "Clay": _TRUE, "Stone": _TRUE,
        "Rope": _TRUE, "Nail": _TRUE, "Scrap": _TRUE, "SeaVine": _TRUE,
        "Brick_Dry": _TRUE, "Thatch": _TRUE, "Placeable_GiantClam": _TRUE,
        # Materials from big islands
        "Leather": _h('raft_big_islands_available'),
        "Feather": _or('raft_big_islands_available', 'raft_can_craft_birdNest'),
        # Smelted items
        "MetalIngot": _h('raft_can_smelt_items'),
        "CopperIngot": _h('raft_can_smelt_items'),
        "VineGoo": _h('raft_can_smelt_items'),
        "Glass": _h('raft_can_smelt_items'),
        "ExplosivePowder": _and('raft_big_islands_available', 'raft_can_smelt_items'),
        # Crafted items
        "Bolt": _h('raft_can_craft_bolt'),
        "Hinge": _h('raft_can_craft_hinge'),
        "CircuitBoard": _h('raft_can_craft_circuitBoard'),
        "PlasticBottle_Empty": _h('raft_can_craft_plasticBottle'),
        "Wool": _and('raft_can_capture_animals', 'raft_can_craft_shears'),
        "HoneyComb": _h('raft_can_access_balboa_island'),
        "Jar_Bee": _and('raft_can_access_balboa_island', 'raft_can_smelt_items'),
        "Dirt": _h('raft_can_get_dirt'),
        "Egg": _h('raft_can_capture_animals'),
        "TitaniumIngot": _and('raft_can_smelt_items', 'raft_can_find_titanium'),
        # Story island requirements
        "Machete": _h('raft_can_craft_machete'),
        "Zipline tool": _h('raft_can_craft_ziplineTool'),
    }

    # Maps region names to their access rules (from regionChecks in Rules.py)
    REGION_ACCESS_RULES = {
        "Raft": _TRUE,
        "ResearchTable": _TRUE,
        "RadioTower": _h('raft_can_access_radio_tower'),
        "Vasagatan": _h('raft_can_access_vasagatan'),
        "BalboaIsland": _h('raft_can_access_balboa_island'),
        "CaravanIsland": _h('raft_can_access_caravan_island'),
        "Tangaroa": _h('raft_can_access_tangaroa'),
        "Varuna Point": _h('raft_can_access_varuna_point'),
        "Temperance": _h('raft_can_access_temperance'),
        "Utopia": _and('raft_can_complete_temperance', 'raft_can_access_utopia'),
    }

    def __init__(self):
        super().__init__()
        # Load locations.json to get location→region mapping and required items
        self.location_to_region = {}
        self.location_to_items = {}
        raft_dir = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'worlds', 'raft')
        locations_file = os.path.join(raft_dir, 'locations.json')
        try:
            with open(locations_file, 'r') as f:
                for loc in json.load(f):
                    self.location_to_region[loc['name']] = loc['region']
                    if 'requiresAccessToItems' in loc:
                        self.location_to_items[loc['name']] = loc['requiresAccessToItems']
            logger.info(f"Loaded {len(self.location_to_region)} Raft locations")
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.error(f"Error loading Raft locations.json: {e}")

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None):
        """Resolve location rules from regionChecks/itemChecks dictionary lookups."""
        if not rule_target_name or rule_target_name not in self.location_to_region:
            return None

        region = self.location_to_region[rule_target_name]
        region_rule = self.REGION_ACCESS_RULES.get(region, _TRUE)
        region_is_free = region_rule.get('value') is True

        # Build item conditions (skip always-True items)
        item_conditions = []
        for item in self.location_to_items.get(rule_target_name, []):
            item_rule = self.ITEM_CHECK_RULES.get(item)
            if item_rule and not (item_rule.get('type') == 'constant' and item_rule.get('value')):
                item_conditions.append(item_rule)

        # Combine region and item requirements
        conditions = item_conditions if region_is_free else [region_rule] + item_conditions
        if not conditions:
            result = _TRUE
        elif len(conditions) == 1:
            result = conditions[0]
        else:
            result = {'type': 'and', 'conditions': conditions}

        self.register_helpers_from_rule(result)
        return result
