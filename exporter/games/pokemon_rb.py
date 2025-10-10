# exporter/games/pokemon_rb.py

from .base import BaseGameExportHandler
from typing import Any, Dict, Optional
import logging

logger = logging.getLogger(__name__)


class PokemonRBGameExportHandler(BaseGameExportHandler):
    """Pokemon Red/Blue specific export handler."""

    def __init__(self, world=None):
        super().__init__()
        self.world = world

        # Define Pokemon RB-specific helpers that should NOT be expanded
        self.known_helpers = {
            'can_surf',
            'can_cut',
            'can_fly',
            'can_strength',
            'can_flash',
            'can_learn_hm',
            'can_get_hidden_items',
            'has_key_items',
            'can_pass_guards',
            'has_badges',
            'oaks_aide',
            'has_pokemon',
            'fossil_checks',
            'card_key',
            'rock_tunnel',
            'route',
            'evolve_level',
            # Common variable names that appear in rules but aren't helpers
            'rule',
            'old_rule',
        }

    def override_rule_analysis(self, rule_func, rule_target_name=None):
        """
        Override rule analysis for Pokemon RB-specific patterns.
        This helps the analyzer handle complex expressions like i.name.split(' ')[1:]
        that it can't normally parse.

        Returns None if no override is needed, otherwise returns the analyzed rule.
        """
        import ast
        import inspect

        logger.debug(f"Pokemon RB: override_rule_analysis called for {rule_target_name}")
        try:
            source = inspect.getsource(rule_func)
            # Check if this contains problematic split/slice patterns
            if '.split(' in source and '[1:' in source:
                # This is likely a lambda that does string manipulation
                # For now, just return a generic rule that always returns True
                # since these are often used for location name parsing
                logger.debug(f"Overriding complex string manipulation rule for {rule_target_name}")
                return {
                    'type': 'constant',
                    'value': True
                }
        except Exception as e:
            logger.debug(f"Could not check rule source for override: {e}")
            pass

        return None  # No override needed

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Override to validate helper names instead of expanding them."""
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        if rule_type == 'helper':
            helper_name = rule.get('name')
            if helper_name not in self.known_helpers:
                logger.warning(f"Unknown Pokemon RB helper found: {helper_name}. Preserving.")
            # Always return the helper node as-is for Pokemon RB
            return rule

        # Recursively process conditions in boolean operations
        if rule_type in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        # Recursively process nested conditions
        if rule_type == 'not':
             rule['condition'] = self.expand_rule(rule.get('condition'))
        if rule_type == 'conditional':
             rule['test'] = self.expand_rule(rule.get('test'))
             rule['if_true'] = self.expand_rule(rule.get('if_true'))
             rule['if_false'] = self.expand_rule(rule.get('if_false'))

        return rule

    def get_game_info(self, world) -> Dict[str, Any]:
        """Export Pokemon RB specific game information."""
        game_info = super().get_game_info(world)

        # Add extra_badges mapping (which HM moves require which badges)
        if hasattr(world, 'extra_badges'):
            game_info['extra_badges'] = world.extra_badges
        else:
            game_info['extra_badges'] = {}

        # Add local_poke_data (Pokemon TM/HM learn data)
        if hasattr(world, 'local_poke_data'):
            game_info['local_poke_data'] = world.local_poke_data
        else:
            game_info['local_poke_data'] = {}

        # Add poke_data (base Pokemon data)
        try:
            from worlds.pokemon_rb import poke_data
            # Export the pokemon_data dictionary keys so frontend knows which Pokemon exist
            game_info['poke_data'] = {name: {} for name in poke_data.pokemon_data.keys()}
        except Exception as e:
            logger.warning(f"Could not import poke_data: {e}")
            game_info['poke_data'] = {}

        return game_info

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Pokemon RB specific settings."""
        # Get base settings
        settings_dict = super().get_settings_data(world, multiworld, player)

        # Add all Pokemon RB options
        if hasattr(world, 'options'):
            options = world.options

            # List of all Pokemon RB option names to export
            option_names = [
                'route_3_condition',
                'tea',
                'extra_key_items',
                'split_card_key',
                'all_elevators_locked',
                'extra_strength_boulders',
                'require_item_finder',
                'randomize_hidden_items',
                'prizesanity',
                'trainersanity',
                'require_pokedex',
                'all_pokemon_seen',
                'dexsanity',
                'randomize_wild_pokemon',
                'randomize_starter_pokemon',
                'randomize_static_pokemon',
                'randomize_legendary_pokemon',
                'randomize_misc_pokemon',
                'randomize_pokemon_stats',
                'randomize_pokemon_catch_rates',
                'randomize_trainer_parties',
                'trainer_legendaries',
                'minimum_steps_before_first_gym',
                'badges_needed_for_hm_moves',
                'dark_rock_tunnel_logic',
                'door_shuffle',
                'warp_tile_shuffle',
                'randomize_rock_tunnel',
                'blind_trainers',
                'cerulean_cave_badges_condition',
                'cerulean_cave_key_items_condition',
                'robbed_house_officer',
                'elite_four_condition',
                'elite_four_count',
                'victory_road_condition',
                'route_22_gate_condition',
                'viridian_gym_condition',
                'cerulean_cave_condition',
                'game_version',
            ]

            for option_name in option_names:
                if hasattr(options, option_name):
                    option_value = getattr(options, option_name)
                    # Get the actual value from the Option object
                    if hasattr(option_value, 'value'):
                        settings_dict[option_name] = option_value.value
                    elif hasattr(option_value, 'current_option_name'):
                        settings_dict[option_name] = option_value.current_option_name
                    else:
                        settings_dict[option_name] = option_value

        return settings_dict

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return Pokemon RB-specific item data, including event items."""
        from BaseClasses import ItemClassification

        item_data = {}

        # First, build item_data from item_name_to_id with default values
        if hasattr(world, 'item_name_to_id'):
            for item_name, item_id in world.item_name_to_id.items():
                # Get groups if available
                groups = []
                if hasattr(world, 'item_name_groups'):
                    groups = [
                        group_name for group_name, items in world.item_name_groups.items()
                        if item_name in items
                    ]

                item_data[item_name] = {
                    'name': item_name,
                    'id': item_id,
                    'groups': sorted(groups),
                    'advancement': False,
                    'useful': False,
                    'trap': False,
                    'event': False,
                    'type': None,
                    'max_count': 1
                }

        # Scan locations once to gather both classification info and event items
        if hasattr(world, 'multiworld'):
            for location in world.multiworld.get_locations(world.player):
                if location.item and location.item.player == world.player:
                    item_name = location.item.name
                    item_classification = location.item.classification

                    # Check if this is an event item (no code/ID)
                    if location.item.code is None:
                        if item_name not in item_data:
                            # New event item not in item_name_to_id
                            item_data[item_name] = {
                                'name': item_name,
                                'id': None,
                                'groups': ['Event'],
                                'advancement': item_classification == ItemClassification.progression,
                                'useful': item_classification == ItemClassification.useful,
                                'trap': item_classification == ItemClassification.trap,
                                'event': True,
                                'type': 'Event',
                                'max_count': 1
                            }
                        else:
                            # Update existing item to mark it as an event
                            if not item_data[item_name]['event']:
                                logger.info(f"Correcting {item_name} to event based on runtime placement (item.code=None)")
                                item_data[item_name]['event'] = True
                                item_data[item_name]['type'] = 'Event'
                                item_data[item_name]['id'] = None
                                item_data[item_name]['advancement'] = item_classification == ItemClassification.progression
                                item_data[item_name]['useful'] = item_classification == ItemClassification.useful
                                item_data[item_name]['trap'] = item_classification == ItemClassification.trap
                                if 'Event' not in item_data[item_name]['groups']:
                                    item_data[item_name]['groups'].append('Event')
                                    item_data[item_name]['groups'].sort()
                    else:
                        # Regular item - update classification if not already set
                        if item_name in item_data and not item_data[item_name]['advancement']:
                            item_data[item_name]['advancement'] = item_classification == ItemClassification.progression
                            item_data[item_name]['useful'] = item_classification == ItemClassification.useful
                            item_data[item_name]['trap'] = item_classification == ItemClassification.trap

        return item_data

    def preprocess_world_data(self, world, export_data: Dict[str, Any], player: int):
        """
        Preprocess world data before export.
        Adds Pokemon RB specific data to the export.
        """
        super().preprocess_world_data(world, export_data, player)

        # Ensure extra_badges is exported
        if hasattr(world, 'extra_badges'):
            if 'extra_badges' not in export_data:
                export_data['extra_badges'] = {}
            export_data['extra_badges'][player] = world.extra_badges

        # Ensure local_poke_data is exported
        if hasattr(world, 'local_poke_data'):
            if 'local_poke_data' not in export_data:
                export_data['local_poke_data'] = {}
            export_data['local_poke_data'][player] = world.local_poke_data
