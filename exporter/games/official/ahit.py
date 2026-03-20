"""A Hat in Time game-specific exporter handler.

Handles:
- can_clear_required_act: Resolved at export-time to can_reach + location_rule_ref
- Stamps pseudo-item: Converts Has("Stamps", count=N) to WeightedSum for worldgen
- Game-specific data: chapter_costs, relic_groups for frontend

Note: hat_yarn_costs and hat_craft_order are auto-discovered and available
in the world section, so they're not duplicated in game_info.
"""

from typing import Any, Dict, List, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

# All Death Wish names for generating stamp items
DEATH_WISHES = [
    'Beat the Heat', "Snatcher's Hit List", "So You're Back From Outer Space",
    'Collect-a-thon', 'Rift Collapse: Mafia of Cooks', 'She Speedran from Outer Space',
    "Mafia's Jumps", 'Vault Codes in the Wind', 'Encore! Encore!',
    'Snatcher Coins in Mafia Town', 'Security Breach', 'The Great Big Hootenanny',
    'Rift Collapse: Dead Bird Studio', '10 Seconds until Self-Destruct',
    'Killing Two Birds', 'Snatcher Coins in Battle of the Birds', 'Zero Jumps',
    'Speedrun Well', 'Rift Collapse: Sleepy Subcon', 'Boss Rush',
    'Quality Time with Snatcher', 'Breaching the Contract',
    'Snatcher Coins in Subcon Forest', 'Bird Sanctuary', 'Rift Collapse: Alpine Skyline',
    'Wound-Up Windmill', 'The Illness has Speedrun', 'Snatcher Coins in Alpine Skyline',
    'Camera Tourist', 'The Mustache Gauntlet', 'No More Bad Guys', 'Seal the Deal',
    'Rift Collapse: Deep Sea', "Cruisin' for a Bruisin'",
    'Community Rift: Rhythm Jump Studio', 'Community Rift: Twilight Travels',
    'Community Rift: The Mountain Rift', 'Snatcher Coins in Nyakuza Metro'
]

# All Zero Jumps location items (locations completed with zero jumps)
# Each increments the "Zero Jumps" counter by 1 when collected
ZERO_JUMPS_LOCATIONS = [
    "Time Rift - Sewers (Zero Jumps)", "Time Rift - Bazaar (Zero Jumps)",
    "The Big Parade (Zero Jumps)", "Time Rift - Pipe (Zero Jumps)",
    "Time Rift - Curly Tail Trail (Zero Jumps)", "Time Rift - The Twilight Bell (Zero Jumps)",
    "The Illness has Spread (Zero Jumps)", "The Finale (Zero Jumps)",
    "Pink Paw Station (Zero Jumps)", "The Birdhouse (Zero Jumps)",
    "The Lava Cake (Zero Jumps)", "The Windmill (Zero Jumps)",
    "The Twilight Bell (Zero Jumps)", "Sleepy Subcon (Zero Jumps)",
    "Ship Shape (Zero Jumps)", "Welcome to Mafia Town (Zero Jumps)",
    "Down with the Mafia! (Zero Jumps)", "Cheating the Race (Zero Jumps)",
    "The Golden Vault (Zero Jumps)", "Dead Bird Studio (Zero Jumps)",
    "Murder on the Owl Express (Zero Jumps)", "Picture Perfect (Zero Jumps)",
    "Train Rush (Zero Jumps)", "Contractual Obligations (Zero Jumps)",
    "Your Contract has Expired (Zero Jumps)", "Toilet of Doom (Zero Jumps)",
    "Mail Delivery Service (Zero Jumps)", "Time Rift - Alpine Skyline (Zero Jumps)",
    "Time Rift - The Lab (Zero Jumps)", "Yellow Overpass Station (Zero Jumps)",
    "Green Clean Station (Zero Jumps)"
]

# Enemy items (from hit_list, excluding bosses)
# Each increments the "Enemy" counter ONCE when first collected (unique types only)
# Note: "Triple Enemy Photo" is NOT included - it's not in hit_list.keys()
ENEMY_ITEMS = [
    "Mafia Goon", "Sleepy Raccoon", "UFO", "Rat", "Shock Squid",
    "Shromb Egg", "Spider", "Crow", "Pompous Crow", "Fiery Crow",
    "Express Owl", "Ninja Cat"
]

# Boss items (from hit_list bosses)
# Each increments the "Boss" counter when collected
BOSS_ITEMS = [
    "Mafia Boss", "Director", "Toilet", "Snatcher", "Toxic Flower", "Mustache Girl"
]

# Chapter index to name mapping for timepiece costs
CHAPTER_NAMES = {
    0: 'Spaceship',
    1: 'Mafia Town',
    2: 'Battle of the Birds',
    3: 'Subcon Forest',
    4: 'Alpine Skyline',
    5: "Time's End",
    6: 'Arctic Cruise',
    7: 'Nyakuza Metro'
}


class AHitGameExportHandler(GenericGameExportHandler):
    """A Hat in Time export handler."""

    # Disable location attribute discovery (not needed for AHIT)
    AUTO_DISCOVER_LOCATION_ATTRIBUTES = False

    # Don't export these helpers as definitions since we expand them at export time
    HELPERS_TO_EXPORT_BLACKLIST = {'can_clear_required_act', 'has_relic_combo'}

    def _get_entrance_connected_region(self, entrance_name: str) -> Optional[str]:
        """Get the connected region name for an entrance (cached)."""
        if self.world is None:
            return None

        # Build cache on first access (lazy initialization)
        if getattr(self, '_entrance_cache', None) is None:
            self._entrance_cache = {}
            try:
                multiworld = self.world.multiworld
                player = self.world.player
                for region in multiworld.get_regions(player):
                    for exit in region.exits:
                        if exit.connected_region:
                            self._entrance_cache[exit.name] = exit.connected_region.name
            except Exception as e:
                logger.debug(f"Error building entrance cache: {e}")
                return None

        return self._entrance_cache.get(entrance_name)

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand helpers at export time.

        Handles:
        - can_clear_required_act(entrance): Expands to can_reach + location_rule_ref
        - has_relic_combo(relic): Expands to group_check with actual count from world
        """
        # Handle has_relic_combo: expand to group_check with actual count
        if helper_name == 'has_relic_combo' and args:
            relic_arg = args[0]

            # Extract relic name from argument (constant dict or raw string)
            if isinstance(relic_arg, dict) and relic_arg.get('type') == 'constant':
                relic_name = relic_arg.get('value')
            elif isinstance(relic_arg, str):
                relic_name = relic_arg
            else:
                relic_name = None

            if relic_name and self.world and hasattr(self.world, 'item_name_groups'):
                group_items = self.world.item_name_groups.get(relic_name)
                if group_items:
                    count = len(group_items)
                    logger.debug(f"Expanding has_relic_combo({relic_name}) -> group_check with count={count}")
                    return {
                        'type': 'group_check',
                        'group': relic_name,
                        'count': count
                    }

        # Handle can_clear_required_act
        if helper_name == 'can_clear_required_act' and args:
            entrance_arg = args[0]

            # Extract entrance name from argument (constant dict or raw string)
            if isinstance(entrance_arg, dict) and entrance_arg.get('type') == 'constant':
                entrance_name = entrance_arg.get('value')
            elif isinstance(entrance_arg, str):
                entrance_name = entrance_arg
            else:
                entrance_name = None

            if entrance_name:
                connected_region = self._get_entrance_connected_region(entrance_name)

                if connected_region:
                    logger.debug(f"Expanding can_clear_required_act({entrance_name}) -> {connected_region}")

                    can_reach_rule = {'type': 'can_reach', 'region': connected_region}

                    # Free Roam regions just need to be reachable
                    if "Free Roam" in connected_region:
                        return can_reach_rule

                    # Non-Free-Roam regions also need the Act Completion location's rule
                    return {
                        'type': 'and',
                        'conditions': [
                            can_reach_rule,
                            {'type': 'location_rule_ref', 'location': f"Act Completion ({connected_region})"}
                        ]
                    }

        return super().expand_helper(helper_name, args)

    def postprocess_helper(self, helper_name: str, helper_def: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process helper definitions to fix known issues.

        Fixes has_paintings helper structure where nested if statements without else
        incorrectly have if_false=None instead of the fallthrough item_check.
        """
        if helper_name == 'has_paintings':
            return self._fix_has_paintings_helper(helper_def)

        return helper_def

    def _fix_has_paintings_helper(self, helper_def: Dict[str, Any]) -> Dict[str, Any]:
        """Fix has_paintings helper structure.

        The original Python has_paintings function has this structure:
            if not painting_logic(world):
                return True
            if not NoPaintingSkips and allow_skip:
                if difficulty >= MODERATE:
                    return True
            return state.has("Progressive Painting Unlock", count)

        The AST analyzer incorrectly captures the nested if's else as None instead of
        the fallthrough item_check. This method fixes that structure.
        """
        body = helper_def.get('body', {})
        if body.get('type') != 'conditional':
            return helper_def

        # Structure: if not painting_logic: True else: (inner conditional)
        if_false = body.get('if_false', {})
        if not isinstance(if_false, dict) or if_false.get('type') != 'conditional':
            return helper_def

        # Inner: if not NoPaintingSkips and allow_skip: (difficulty check) else: item_check
        inner_if_true = if_false.get('if_true', {})
        inner_if_false = if_false.get('if_false', {})

        # Check if inner_if_true is the difficulty check with if_false=None
        if (isinstance(inner_if_true, dict) and
            inner_if_true.get('type') == 'conditional' and
            inner_if_true.get('if_false') is None):

            # The fallthrough should be the outer if_false (item_check)
            # If inner_if_false is the item_check, use it as the fallthrough
            if isinstance(inner_if_false, dict) and inner_if_false.get('type') == 'item_check':
                # Fix: set the innermost if_false to the item_check
                inner_if_true['if_false'] = inner_if_false
                logger.debug("Fixed has_paintings helper: nested if_false now points to item_check")

        return helper_def

    def get_game_info(self, world):
        """Get A Hat in Time specific game information.

        Note: hat_yarn_costs and hat_craft_order are auto-discovered and
        available in the world section, so they're not duplicated here.
        """
        game_info = super().get_game_info(world)

        # Add chapter timepiece costs (convert enum keys to chapter names)
        if hasattr(world, 'chapter_timepiece_costs'):
            game_info["chapter_costs"] = {
                CHAPTER_NAMES.get(int(idx), f'Chapter_{idx}'): cost
                for idx, cost in world.chapter_timepiece_costs.items()
            }

        # Add item name groups (relic groups for frontend)
        if hasattr(world, 'item_name_groups'):
            game_info["relic_groups"] = {
                name: sorted(items) for name, items in world.item_name_groups.items()
            }

        return game_info

    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: Optional[str] = None, connected_region: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Post-process entrance/exit rules to handle AHIT-specific pseudo-items.

        Converts Has("Stamps", count=N) to weighted_sum format because:
        - "Stamps" is a virtual item tracked by AHIT's custom collect() method
        - The worldgen world doesn't have this custom tracking
        - We convert to weighted_sum which counts actual stamp items:
          - "1 Stamp - X" items have weight 1.0
          - "2 Stamp - X" items have weight 2.0
        """
        if not isinstance(rule, dict):
            return rule

        # Process children recursively to convert Stamps checks
        result = self._postprocess_rule_recursive(rule)

        return result

    def postprocess_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Post-process location rules to handle AHIT-specific pseudo-items."""
        if not isinstance(rule, dict):
            return rule

        # Process children recursively first
        rule = self._postprocess_rule_recursive(rule)

        return rule

    def _postprocess_rule_recursive(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively post-process a rule, converting Stamps checks.

        Handles both formats:
        - Rule Builder format: {'rule': 'Has', 'args': {'item_name': 'Stamps'}}
        - AST format: {'type': 'item_check', 'item': 'Stamps'}
        """
        if not isinstance(rule, dict):
            return rule

        # Check for Rule Builder format: Has for pseudo-items
        if rule.get('rule') == 'Has':
            args = rule.get('args', {})
            item_name = args.get('item_name')
            count = args.get('count', 1)

            if item_name == 'Stamps':
                return self._create_stamps_weighted_sum(count)
            elif item_name == 'Zero Jumps':
                return self._create_zero_jumps_weighted_sum(count)
            elif item_name == 'Enemy':
                return self._create_enemy_unique_count(count)
            elif item_name == 'Boss':
                return self._create_boss_unique_count(count)

        # Check for AST format: item_check for pseudo-items
        if rule.get('type') == 'item_check':
            item = rule.get('item')
            count_val = rule.get('count', 1)
            # In AST format, count might be a dict like {'type': 'constant', 'value': N}
            if isinstance(count_val, dict):
                count = count_val.get('value', 1)
            else:
                count = count_val

            if item == 'Stamps':
                return self._create_stamps_weighted_sum(count)
            elif item == 'Zero Jumps':
                return self._create_zero_jumps_weighted_sum(count)
            elif item == 'Enemy':
                return self._create_enemy_unique_count(count)
            elif item == 'Boss':
                return self._create_boss_unique_count(count)

        # Recursively process children for Rule Builder And/Or
        if rule.get('rule') in ('And', 'Or'):
            children = rule.get('children', [])
            rule['children'] = [self._postprocess_rule_recursive(c) for c in children]

        # Recursively process conditions for AST format and/or
        if rule.get('type') in ('and', 'or'):
            conditions = rule.get('conditions', [])
            rule['conditions'] = [self._postprocess_rule_recursive(c) for c in conditions]

        # Handle nested rules in args (for Rule Builder format)
        if 'args' in rule and isinstance(rule['args'], list):
            rule['args'] = [self._postprocess_rule_recursive(a) if isinstance(a, dict) else a
                           for a in rule['args']]

        return rule

    def _create_stamps_weighted_sum(self, threshold: int) -> Dict[str, Any]:
        """Create a weighted_sum rule for stamp counting.

        Each Death Wish has two stamp items:
        - "1 Stamp - {DW name}": worth 1 stamp
        - "2 Stamp - {DW name}": worth 2 stamps (bonus completion)
        """
        items = []
        for dw_name in DEATH_WISHES:
            items.append([f"1 Stamp - {dw_name}", 1.0])
            items.append([f"2 Stamp - {dw_name}", 2.0])

        logger.debug(f"Converting Has('Stamps', {threshold}) to weighted_sum with {len(items)} items")

        return {
            "rule": "weighted_sum",
            "_original_ast_type": "helper",
            "_converted_from_ast": True,
            "args": [
                {"rule": "Constant", "args": {"value": float(threshold)}},
                {"rule": "Constant", "args": {"value": items}}
            ]
        }

    def _create_zero_jumps_weighted_sum(self, threshold: int) -> Dict[str, Any]:
        """Create a weighted_sum rule for Zero Jumps counting.

        Zero Jumps items are location achievements like "{Location} (Zero Jumps)".
        Each item counts as 1 toward the "Zero Jumps" counter.
        """
        items = []
        for loc_name in ZERO_JUMPS_LOCATIONS:
            items.append([loc_name, 1.0])

        logger.debug(f"Converting Has('Zero Jumps', {threshold}) to weighted_sum with {len(items)} items")

        return {
            "rule": "weighted_sum",
            "_original_ast_type": "helper",
            "_converted_from_ast": True,
            "args": [
                {"rule": "Constant", "args": {"value": float(threshold)}},
                {"rule": "Constant", "args": {"value": items}}
            ]
        }

    def _create_enemy_unique_count(self, threshold: int) -> Dict[str, Any]:
        """Create a unique_count rule for Enemy counting.

        Enemy items are from the hit_list (excluding bosses).
        Each UNIQUE item type counts as 1 toward the "Enemy" counter.
        Unlike weighted_sum, this counts unique types, not total items collected.
        """
        items = []
        for item_name in ENEMY_ITEMS:
            items.append([item_name, 1.0])

        logger.debug(f"Converting Has('Enemy', {threshold}) to unique_count with {len(items)} items")

        return {
            "rule": "unique_count",
            "_original_ast_type": "helper",
            "_converted_from_ast": True,
            "args": [
                {"rule": "Constant", "args": {"value": float(threshold)}},
                {"rule": "Constant", "args": {"value": items}}
            ]
        }

    def _create_boss_unique_count(self, threshold: int) -> Dict[str, Any]:
        """Create a unique_count rule for Boss counting.

        Boss items are from the bosses list in hit_list.
        Each UNIQUE boss type counts as 1 toward the "Boss" counter.
        Unlike weighted_sum, this counts unique types, not total items collected.
        """
        items = []
        for item_name in BOSS_ITEMS:
            items.append([item_name, 1.0])

        logger.debug(f"Converting Has('Boss', {threshold}) to unique_count with {len(items)} items")

        return {
            "rule": "unique_count",
            "_original_ast_type": "helper",
            "_converted_from_ast": True,
            "args": [
                {"rule": "Constant", "args": {"value": float(threshold)}},
                {"rule": "Constant", "args": {"value": items}}
            ]
        }

