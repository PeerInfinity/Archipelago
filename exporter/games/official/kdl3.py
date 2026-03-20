"""Kirby's Dream Land 3 game-specific export handler."""

from typing import Any, Callable, Dict, Optional
from ..base import GenericGameExportHandler


def _compute_level_names_inverse(world, multiworld, player) -> Dict[Any, Any]:
    """Compute level_names_inverse for f-string resolution in can_reach_boss."""
    from worlds.kdl3.names import location_name
    return location_name.level_names_inverse


def _compute_ability_map(world, multiworld, player) -> Dict[str, str]:
    """Compute ability_map mapping ability names to helper function names."""
    from worlds.kdl3 import rules as kdl3_rules
    if not hasattr(kdl3_rules, 'ability_map'):
        return {}
    return {
        name: (func.__name__ if callable(func) else str(func))
        for name, func in kdl3_rules.ability_map.items()
    }


class KDL3GameExportHandler(GenericGameExportHandler):
    """Handle KDL3-specific rule expansions and f-string conversions.

    KDL3 requires custom helper expansion for:
    - can_assemble_rob: Complex logic for R.O.B. assembly puzzle
    - can_fix_angel_wings: Complex logic for angel wings puzzle

    World attributes like copy_abilities and player_levels are auto-discovered
    via AUTO_DISCOVER_WORLD_ATTRIBUTES (default True).
    """

    # Export additional world data for frontend use
    WORLD_ATTRIBUTES: Dict[str, Callable] = {
        'level_names_inverse': _compute_level_names_inverse,
        'ability_map': _compute_ability_map,
    }

    # Blacklist helpers that have loops or complex logic (don't export as definitions)
    # Blacklisted helpers are automatically preserved as helper calls
    HELPERS_TO_EXPORT_BLACKLIST = {'can_assemble_rob', 'can_fix_angel_wings', 'can_reach_boss'}

    # Level number to level name mapping for can_reach_boss helper
    LEVEL_NAMES = {
        1: "Grass Land",
        2: "Ripple Field",
        3: "Sand Canyon",
        4: "Cloudy Park",
        5: "Iceberg",
    }

    # Map parameter names used in inlined functions to actual setting names
    NAME_REMAPPING = {
        'ow_boss_req': 'ow_boss_requirement',
    }

    # Setting names that should be converted from 'name' type to 'setting_value' type
    SETTINGS_TO_CONVERT = {
        'open_world',
        'ow_boss_requirement',
    }

    # The restrictive enemy/ability pairs for Sand Canyon 6 (R.O.B. assembly)
    ENEMY_RESTRICTIVE_ROB = [
        (["Parasol Ability", "Cutter Ability"], ["Bukiset (Parasol)", "Bukiset (Cutter)"]),
        (["Spark Ability", "Clean Ability"], ["Bukiset (Spark)", "Bukiset (Clean)"]),
        (["Ice Ability", "Needle Ability"], ["Bukiset (Ice)", "Bukiset (Needle)"]),
        (["Stone Ability", "Burning Ability"], ["Bukiset (Stone)", "Bukiset (Burning)"]),
    ]

    # Enemies required for fixing angel wings (Iceberg 6 - Angel location)
    ANGEL_WINGS_ENEMIES = [
        "Sparky", "Blocky", "Jumper Shoot", "Yuki",
        "Sir Kibble", "Haboki", "Boboo", "Captain Stitch"
    ]

    # Map ability names to item requirements
    ABILITY_REQUIREMENTS = {
        "No Ability": None,
        "Burning Ability": ("Burning", "Burning Ability"),
        "Stone Ability": ("Stone", "Stone Ability"),
        "Ice Ability": ("Ice", "Ice Ability"),
        "Needle Ability": ("Needle", "Needle Ability"),
        "Clean Ability": ("Clean", "Clean Ability"),
        "Parasol Ability": ("Parasol", "Parasol Ability"),
        "Spark Ability": ("Spark", "Spark Ability"),
        "Cutter Ability": ("Cutter", "Cutter Ability"),
    }

    # Map animal names to item requirements
    ANIMAL_REQUIREMENTS = {
        "Coo": ("Coo", "Coo Spawn"),
        "Kine": ("Kine", "Kine Spawn"),
        "Rick": ("Rick", "Rick Spawn"),
        "Nago": ("Nago", "Nago Spawn"),
        "ChuChu": ("ChuChu", "ChuChu Spawn"),
        "Pitch": ("Pitch", "Pitch Spawn"),
    }

    def expand_helper(self, helper_name: str, args=None) -> Optional[Dict[str, Any]]:
        """Expand complex KDL3 helpers with constant arguments into simplified rules."""
        if args is None:
            args = []

        # Handle can_reach_boss helper
        # Arguments: level (constant), open_world (option), ow_boss_req (option), player_levels (constant)
        if helper_name == 'can_reach_boss':
            return self._expand_can_reach_boss(args)

        # For can_assemble_rob and can_fix_angel_wings, get copy_abilities from first argument
        copy_abilities = None
        if args and isinstance(args[0], dict):
            arg = args[0]
            if arg.get('type') == 'constant':
                copy_abilities = arg.get('value', {})
            elif arg.get('rule') == 'Constant':
                copy_abilities = arg.get('args', {}).get('value', {})

        if copy_abilities is None:
            return None

        if helper_name == 'can_assemble_rob':
            return self._expand_can_assemble_rob(copy_abilities)
        elif helper_name == 'can_fix_angel_wings':
            return self._expand_can_fix_angel_wings(copy_abilities)

        return None

    def _make_ability_check(self, ability_name: str) -> Optional[Dict[str, Any]]:
        """Create an item check rule for an ability."""
        reqs = self.ABILITY_REQUIREMENTS.get(ability_name)
        if reqs is None:
            return {'type': 'constant', 'value': True}
        base_item, ability_item = reqs
        return {
            'type': 'and',
            'conditions': [
                {'type': 'item_check', 'item': base_item},
                {'type': 'item_check', 'item': ability_item}
            ]
        }

    def _make_animal_check(self, animal_name: str) -> Optional[Dict[str, Any]]:
        """Create an item check rule for an animal."""
        reqs = self.ANIMAL_REQUIREMENTS.get(animal_name)
        if reqs is None:
            return None
        animal_item, spawn_item = reqs
        return {
            'type': 'and',
            'conditions': [
                {'type': 'item_check', 'item': animal_item},
                {'type': 'item_check', 'item': spawn_item}
            ]
        }

    def _expand_can_assemble_rob(self, copy_abilities: Dict[str, str]) -> Dict[str, Any]:
        """Expand can_assemble_rob helper with specific copy_abilities into a rule."""
        conditions = []

        conditions.append(self._make_animal_check('Coo'))
        conditions.append(self._make_animal_check('Kine'))

        for allowed_abilities, bukisets in self.ENEMY_RESTRICTIVE_ROB:
            pair_conditions = []
            for bukiset in bukisets:
                enemy_ability = copy_abilities.get(bukiset)
                if enemy_ability and enemy_ability in allowed_abilities:
                    ability_check = self._make_ability_check(enemy_ability)
                    if ability_check:
                        pair_conditions.append(ability_check)

            if pair_conditions:
                if len(pair_conditions) == 1:
                    conditions.append(pair_conditions[0])
                else:
                    conditions.append({'type': 'or', 'conditions': pair_conditions})
            else:
                return {'type': 'constant', 'value': False}

        conditions.append(self._make_ability_check('Parasol Ability'))
        conditions.append(self._make_ability_check('Stone Ability'))

        return {'type': 'and', 'conditions': conditions}

    def _expand_can_fix_angel_wings(self, copy_abilities: Dict[str, str]) -> Dict[str, Any]:
        """Expand can_fix_angel_wings helper with specific copy_abilities into a rule."""
        conditions = []

        for enemy in self.ANGEL_WINGS_ENEMIES:
            enemy_ability = copy_abilities.get(enemy)
            if enemy_ability:
                ability_check = self._make_ability_check(enemy_ability)
                if ability_check and ability_check.get('type') != 'constant':
                    conditions.append(ability_check)
            else:
                return {'type': 'constant', 'value': False}

        if not conditions:
            return {'type': 'constant', 'value': True}

        return {'type': 'and', 'conditions': conditions}

    def _expand_can_reach_boss(self, args: list) -> Optional[Dict[str, Any]]:
        """Expand can_reach_boss helper into a conditional rule.

        Arguments:
        - level: constant int (1-5)
        - open_world: option value
        - ow_boss_req: option value
        - player_levels: constant dict mapping level to location list

        Logic:
        - If open_world: has("{level_name} - Stage Completion", ow_boss_req)
        - Else: can_reach("{level_name} 6 - Complete", "Location")
        """
        if len(args) < 4:
            return None

        # Extract level constant
        level = None
        level_arg = args[0]
        if isinstance(level_arg, dict):
            if level_arg.get('type') == 'constant':
                level = level_arg.get('value')
            elif level_arg.get('rule') == 'Constant':
                level = level_arg.get('args', {}).get('value')

        if level is None or level not in self.LEVEL_NAMES:
            return None

        # Get level name for the item check and location name
        level_name = self.LEVEL_NAMES[level]
        stage_completion_item = f"{level_name} - Stage Completion"
        # Boss location is always stage 6 of the level (the last regular stage)
        boss_location_name = f"{level_name} 6 - Complete"

        # Build the conditional rule:
        # if open_world: has(stage_completion_item, ow_boss_requirement)
        # else: can_reach(boss_location_name, "Location")
        return {
            'type': 'conditional',
            'test': {
                'type': 'option_value',
                'option': 'open_world'
            },
            'if_true': {
                'type': 'item_check',
                'item': stage_completion_item,
                'count': {
                    'type': 'option_value',
                    'option': 'ow_boss_requirement'
                }
            },
            'if_false': {
                'type': 'state_method',
                'method': 'can_reach',
                'args': [
                    {'type': 'constant', 'value': boss_location_name},
                    {'type': 'constant', 'value': 'Location'}
                ]
            }
        }
