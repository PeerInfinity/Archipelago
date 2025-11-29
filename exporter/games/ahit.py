"""A Hat in Time game-specific exporter handler."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class AHitGameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'A Hat in Time'
    """A Hat in Time specific rule expander with game-specific helper functions."""

    def __init__(self):
        # Define AHIT-specific helpers that should NOT be expanded
        self.known_helpers = {
            'can_clear_required_act',
            'can_use_hat',
            'can_use_hookshot',
            'can_hit',
            'has_paintings',
            'painting_logic',
            'has_relic_combo',
            'get_difficulty',
        }

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """Check if a function should be preserved as a helper call."""
        return func_name in self.known_helpers

    def get_settings_data(self, world, multiworld, player):
        """Extract A Hat in Time settings including HatItems and UmbrellaLogic options."""
        # Get base settings
        settings = super().get_settings_data(world, multiworld, player)

        # Add AHIT-specific settings
        try:
            if hasattr(world, 'options') and hasattr(world.options, 'HatItems'):
                settings['HatItems'] = bool(world.options.HatItems.value)
            else:
                settings['HatItems'] = False  # Default value
        except Exception as e:
            logger.error(f"Error extracting HatItems option: {e}")
            settings['HatItems'] = False

        try:
            if hasattr(world, 'options') and hasattr(world.options, 'UmbrellaLogic'):
                settings['UmbrellaLogic'] = bool(world.options.UmbrellaLogic.value)
            else:
                settings['UmbrellaLogic'] = False  # Default value
        except Exception as e:
            logger.error(f"Error extracting UmbrellaLogic option: {e}")
            settings['UmbrellaLogic'] = False

        try:
            if hasattr(world, 'options') and hasattr(world.options, 'ShuffleSubconPaintings'):
                settings['ShuffleSubconPaintings'] = bool(world.options.ShuffleSubconPaintings.value)
            else:
                settings['ShuffleSubconPaintings'] = False  # Default value
        except Exception as e:
            logger.error(f"Error extracting ShuffleSubconPaintings option: {e}")
            settings['ShuffleSubconPaintings'] = False

        try:
            if hasattr(world, 'options') and hasattr(world.options, 'LogicDifficulty'):
                settings['LogicDifficulty'] = int(world.options.LogicDifficulty.value)
            else:
                settings['LogicDifficulty'] = -1  # Default to Normal
        except Exception as e:
            logger.error(f"Error extracting LogicDifficulty option: {e}")
            settings['LogicDifficulty'] = -1

        try:
            if hasattr(world, 'options') and hasattr(world.options, 'NoPaintingSkips'):
                settings['NoPaintingSkips'] = bool(world.options.NoPaintingSkips.value)
            else:
                settings['NoPaintingSkips'] = False  # Default value
        except Exception as e:
            logger.error(f"Error extracting NoPaintingSkips option: {e}")
            settings['NoPaintingSkips'] = False

        try:
            if hasattr(world, 'options') and hasattr(world.options, 'ShuffleAlpineZiplines'):
                settings['ShuffleAlpineZiplines'] = bool(world.options.ShuffleAlpineZiplines.value)
            else:
                settings['ShuffleAlpineZiplines'] = False  # Default value
        except Exception as e:
            logger.error(f"Error extracting ShuffleAlpineZiplines option: {e}")
            settings['ShuffleAlpineZiplines'] = False

        return settings

    def get_chapter_costs(self, world):
        """Extract A Hat in Time chapter costs for telescope access rules."""
        try:
            chapter_costs = {}
            if hasattr(world, 'chapter_timepiece_costs'):
                # Map ChapterIndex to chapter names (correct mapping from Types.py)
                chapter_names = {
                    0: 'Spaceship',  # SPACESHIP = 0 (not a telescope)
                    1: 'Mafia Town',  # MAFIA = 1 
                    2: 'Battle of the Birds',  # BIRDS = 2
                    3: 'Subcon Forest',  # SUBCON = 3
                    4: 'Alpine Skyline',  # ALPINE = 4
                    5: 'Time\'s End',  # FINALE = 5
                    6: 'Arctic Cruise',  # CRUISE = 6
                    7: 'Nyakuza Metro'  # METRO = 7
                }
                
                for chapter_index, cost in world.chapter_timepiece_costs.items():
                    chapter_name = chapter_names.get(int(chapter_index), f'Chapter_{chapter_index}')
                    chapter_costs[chapter_name] = cost
                    
                #logger.info(f"A Hat in Time chapter costs: {chapter_costs}")
                return chapter_costs
            else:
                logger.warning("World object has no chapter_timepiece_costs attribute")
                return {}
        except Exception as e:
            logger.error(f"Error extracting chapter costs: {e}")
            return {}

    def apply_chapter_costs_to_rule(self, rule, exit_name, world):
        """Apply chapter costs to telescope exit rules during export."""
        try:
            # Only modify telescope rules
            if not exit_name or not exit_name.startswith("Telescope -> "):
                return rule
                
            # Get chapter costs
            chapter_costs = self.get_chapter_costs(world)
            if not chapter_costs:
                logger.warning("No chapter costs available for telescope rule modification")
                return rule
                
            # Map telescope names to chapter names
            telescope_to_chapter = {
                "Telescope -> Mafia Town": "Mafia Town",
                "Telescope -> Battle of the Birds": "Battle of the Birds", 
                "Telescope -> Subcon Forest": "Subcon Forest",
                "Telescope -> Alpine Skyline": "Alpine Skyline",
                "Telescope -> Time's End": "Time's End"
            }
            
            chapter_name = telescope_to_chapter.get(exit_name)
            if not chapter_name or chapter_name not in chapter_costs:
                logger.warning(f"No chapter cost found for {exit_name}")
                return rule
                
            cost = chapter_costs[chapter_name]
            #logger.info(f"Applying chapter cost {cost} to {exit_name}")
            
            if cost == 0:
                # Free access
                return {
                    'type': 'constant',
                    'value': True
                }
            else:
                # Requires Time Pieces
                return {
                    'type': 'count_check',
                    'item': 'Time Piece',
                    'count': cost
                }
                
        except Exception as e:
            logger.error(f"Error applying chapter costs to {exit_name}: {e}")
            return rule

    def get_hat_costs(self, world):
        """Extract A Hat in Time hat yarn costs and crafting order."""
        try:
            hat_info = {}
            if hasattr(world, 'hat_yarn_costs'):
                hat_info['hat_yarn_costs'] = {int(k): v for k, v in world.hat_yarn_costs.items()}
            if hasattr(world, 'hat_craft_order'):
                hat_info['hat_craft_order'] = [int(h) for h in world.hat_craft_order]
            return hat_info
        except Exception as e:
            logger.error(f"Error extracting hat costs: {e}")
            return {}

    def get_relic_groups(self, world):
        """Extract A Hat in Time relic groups (item_name_groups)."""
        try:
            relic_groups = {}
            if hasattr(world, 'item_name_groups'):
                # Convert sets/frozensets to sorted lists for JSON serialization
                for group_name, items in world.item_name_groups.items():
                    if isinstance(items, (set, frozenset)):
                        relic_groups[group_name] = sorted(list(items))
                    elif isinstance(items, list):
                        relic_groups[group_name] = sorted(items)
                    else:
                        # Attempt to convert to list
                        try:
                            relic_groups[group_name] = sorted(list(items))
                        except:
                            logger.warning(f"Could not convert relic group {group_name} to list: {type(items)}")
                            relic_groups[group_name] = []
            return relic_groups
        except Exception as e:
            logger.error(f"Error extracting relic groups: {e}")
            return {}

    def get_game_info(self, world):
        """Get A Hat in Time specific game information including chapter costs and relic groups."""
        try:
            game_info = {
                "name": "A Hat in Time",
                "rule_format": {
                    "version": "1.0"
                },
                "chapter_costs": self.get_chapter_costs(world),
                "hat_info": self.get_hat_costs(world),
                "relic_groups": self.get_relic_groups(world)
            }
            return game_info
        except Exception as e:
            logger.error(f"Error getting A Hat in Time game info: {e}")
            return {
                "name": "A Hat in Time",
                "rule_format": {"version": "1.0"},
                "chapter_costs": {},
                "hat_info": {},
                "relic_groups": {}
            }

    def expand_helper(self, helper_name: str, args: List[Any] = None):
        """Expand A Hat in Time specific helper functions."""
        if args is None:
            args = []

        # A Hat in Time helper function mappings
        helper_mappings = {
            # Movement and traversal abilities
            'can_walk': {
                'type': 'item_check',
                'item': 'Walk',
                'description': 'Requires basic walking ability'
            },
            'can_jump': {
                'type': 'item_check', 
                'item': 'Jump',
                'description': 'Requires jumping ability'
            },
            'can_dive': {
                'type': 'item_check',
                'item': 'Dive',
                'description': 'Requires diving ability'
            },
            'can_double_jump': {
                'type': 'item_check',
                'item': 'Double Jump',
                'description': 'Requires double jump ability'
            },
            'can_wall_jump': {
                'type': 'item_check',
                'item': 'Wall Jump',
                'description': 'Requires wall jump ability'
            },
            'can_umbrella': {
                'type': 'item_check',
                'item': 'Umbrella',
                'description': 'Requires umbrella ability'
            },
            'can_hookshot': {
                'type': 'item_check',
                'item': 'Hookshot',
                'description': 'Requires hookshot ability'
            },
            'can_sprint': {
                'type': 'item_check',
                'item': 'Sprint Hat',
                'description': 'Requires Sprint Hat'
            },
            'can_brewing': {
                'type': 'item_check',
                'item': 'Brewing Hat',
                'description': 'Requires Brewing Hat'
            },
            'can_ice': {
                'type': 'item_check',
                'item': 'Ice Hat',
                'description': 'Requires Ice Hat'
            },
            'can_dweller': {
                'type': 'item_check',
                'item': 'Dweller Mask',
                'description': 'Requires Dweller Mask'
            },
            'can_time_stop': {
                'type': 'item_check',
                'item': 'Time Stop Hat',
                'description': 'Requires Time Stop Hat'
            },
            
            # Badge requirements
            'has_badge': {
                'type': 'helper',
                'name': 'has_badge',
                'description': 'Requires specific badge'
            },
            'has_hookshot_badge': {
                'type': 'item_check',
                'item': 'Hookshot Badge',
                'description': 'Requires Hookshot Badge'
            },
            'has_camera_badge': {
                'type': 'item_check',
                'item': 'Camera Badge',
                'description': 'Requires Camera Badge'
            },
            'has_mumble_badge': {
                'type': 'item_check',
                'item': 'Mumble Badge',
                'description': 'Requires Mumble Badge'
            },
            
            # World access checks
            'can_access_mafia_town': {
                'type': 'region_access',
                'region': 'Mafia Town',
                'description': 'Requires access to Mafia Town'
            },
            'can_access_battle_of_the_birds': {
                'type': 'region_access',
                'region': 'Battle of the Birds',
                'description': 'Requires access to Battle of the Birds'
            },
            'can_access_subcon_forest': {
                'type': 'region_access',
                'region': 'Subcon Forest',
                'description': 'Requires access to Subcon Forest'
            },
            'can_access_alpine_skyline': {
                'type': 'region_access',
                'region': 'Alpine Skyline',
                'description': 'Requires access to Alpine Skyline'
            },
            'can_access_time_rifts': {
                'type': 'region_access',
                'region': 'Time Rifts',
                'description': 'Requires access to Time Rifts'
            },
            
            # Act and chapter completion
            'completed_act': {
                'type': 'helper',
                'name': 'completed_act',
                'description': 'Requires completing specific act'
            },
            'completed_chapter': {
                'type': 'helper',
                'name': 'completed_chapter',
                'description': 'Requires completing specific chapter'
            },
            'has_contract': {
                'type': 'helper',
                'name': 'has_contract',
                'description': 'Requires specific contract'
            },
            
            # Yarn and time piece requirements
            'has_yarn': {
                'type': 'item_check',
                'item': 'Yarn',
                'description': 'Requires yarn for hat crafting'
            },
            'has_time_pieces': {
                'type': 'helper',
                'name': 'has_time_pieces',
                'description': 'Requires specific number of time pieces'
            },

            # Death Wish specific
            'death_wish_enabled': {
                'type': 'helper',
                'name': 'death_wish_enabled',
                'description': 'Requires Death Wish DLC enabled'
            },
            'can_access_death_wish': {
                'type': 'region_access',
                'region': 'Death Wish',
                'description': 'Requires access to Death Wish'
            },
            
            # Painting and act completion logic
            'has_paintings': {
                'type': 'helper',
                'name': 'has_paintings',
                'description': 'Checks if player has enough painting unlocks'
            },
            'can_clear_required_act': {
                'type': 'helper',
                'name': 'can_clear_required_act',
                'description': 'Checks if a specific act can be completed'
            },
            'painting_logic': {
                'type': 'helper',
                'name': 'painting_logic',
                'description': 'Checks if painting shuffle is enabled'
            },
            'get_difficulty': {
                'type': 'helper',
                'name': 'get_difficulty',
                'description': 'Gets the current difficulty setting'
            },
            
            # Special movement checks
            'can_ground_pound': {
                'type': 'item_check',
                'item': 'Ground Pound',
                'description': 'Requires ground pound ability'
            },
            'can_crawl': {
                'type': 'item_check',
                'item': 'Crawl',
                'description': 'Requires crawling ability'
            },
            'can_climb': {
                'type': 'item_check',
                'item': 'Climb',
                'description': 'Requires climbing ability'
            }
        }
        
        # Get the mapping for this helper
        mapping = helper_mappings.get(helper_name)

        # If we have a mapping and it's a helper type, preserve args
        if mapping and mapping.get('type') == 'helper':
            result = mapping.copy()
            # Include args if provided
            if args:
                result['args'] = args
            return result

        # For other types (item_check, region_access), return as-is
        return mapping
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return A Hat in Time item table data including event items."""
        ahit_items_data = {}

        # Import the item table from the AHIT world
        try:
            from worlds.ahit.Items import item_table
        except ImportError:
            logger.error("Could not import AHIT item_table")
            return {}

        # Process regular items from item_table
        for item_name, item_data in item_table.items():
            # Get groups this item belongs to
            groups = [
                group_name for group_name, items in getattr(world, 'item_name_groups', {}).items()
                if item_name in items
            ]

            try:
                from BaseClasses import ItemClassification
                item_classification = getattr(item_data, 'classification', None)
                is_advancement = item_classification == ItemClassification.progression if item_classification else False
                is_useful = item_classification == ItemClassification.useful if item_classification else False
                is_trap = item_classification == ItemClassification.trap if item_classification else False
            except Exception as e:
                logger.debug(f"Could not determine classification for {item_name}: {e}")
                is_advancement = False
                is_useful = False
                is_trap = False

            ahit_items_data[item_name] = {
                'name': item_name,
                'id': getattr(item_data, 'code', None),
                'groups': sorted(groups),
                'advancement': is_advancement,
                'useful': is_useful,
                'trap': is_trap,
                'event': False,  # Regular items are not events
                'type': None,
                'max_count': 1
            }

        # Handle dynamically created event items (like Act Completion events)
        # These are created at runtime via create_event() but not in the static item_table
        if hasattr(world, 'multiworld'):
            multiworld = world.multiworld
            player = world.player

            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID)
                    if (location.item.code is None and
                        item_name not in ahit_items_data and
                        hasattr(location.item, 'classification')):

                        from BaseClasses import ItemClassification
                        ahit_items_data[item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['Event'],
                            'advancement': location.item.classification == ItemClassification.progression,
                            'useful': location.item.classification == ItemClassification.useful,
                            'trap': location.item.classification == ItemClassification.trap,
                            'event': True,
                            'type': 'Event',
                            'max_count': 1
                        }

        return ahit_items_data

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand A Hat in Time specific rules with enhanced processing."""
        if not rule:
            return rule

        # Note: Constant conditional elimination is now handled in
        # resolve_attribute_nodes_in_rule in exporter.py after attributes are resolved

        # Eliminate constant conditionals (this may catch some early cases)
        if rule.get('type') == 'conditional':
            test = rule.get('test')
            if test and test.get('type') == 'constant':
                # Evaluate constant test value
                test_value = test.get('value')
                if test_value:  # Truthy
                    # Return if_true branch (recursively expand it)
                    if_true = rule.get('if_true')
                    return self.expand_rule(if_true) if if_true is not None else None
                else:  # Falsy (0, False, None, etc.)
                    # Return if_false branch (recursively expand it)
                    if_false = rule.get('if_false')
                    return self.expand_rule(if_false) if if_false is not None else None
            else:
                # Non-constant conditional - recurse into branches
                if 'test' in rule:
                    rule['test'] = self.expand_rule(rule['test'])
                if 'if_true' in rule:
                    rule['if_true'] = self.expand_rule(rule['if_true'])
                if 'if_false' in rule:
                    rule['if_false'] = self.expand_rule(rule['if_false'])
                return rule

        # Handle helper functions
        if rule.get('type') == 'helper':
            # Filter out 'world' argument - it's automatically provided by executeHelper
            if 'args' in rule:
                rule['args'] = [arg for arg in rule['args'] if not (isinstance(arg, dict) and arg.get('type') == 'name' and arg.get('name') == 'world')]

            expanded = self.expand_helper(rule['name'], rule.get('args', []))
            if expanded:
                return expanded
            # If no specific mapping, preserve the helper node
            return rule

        # Handle logical operators recursively
        if rule['type'] in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]
            # Filter out None conditions (which came from eliminated conditionals)
            rule['conditions'] = [c for c in rule['conditions'] if c is not None]
            # If only one condition remains, return it directly
            if len(rule['conditions']) == 1:
                return rule['conditions'][0]
            # If no conditions remain, return None
            if len(rule['conditions']) == 0:
                return None

        return rule