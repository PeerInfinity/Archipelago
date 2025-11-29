"""Bomb Rush Cyberfunk helper expander."""

from typing import Dict, Any, List
from .base import BaseGameExportHandler
import re
import logging

logger = logging.getLogger(__name__)

class BombRushCyberfunkGameExportHandler(BaseGameExportHandler):
    GAME_NAME = 'Bomb Rush Cyberfunk'
    """Bomb Rush Cyberfunk expander that handles game-specific rules."""

    def __init__(self, world=None):
        """Initialize with world instance to access options."""
        super().__init__()
        self.world = world
        self.current_location_name = None  # Track current location being processed

        # Extract option values if world is available
        self.options = {}
        if world:
            try:
                self.options = {
                    'movestyle': int(world.options.starting_movestyle.value) if hasattr(world.options, 'starting_movestyle') else 2,
                    'limit': bool(world.options.limited_graffiti.value) if hasattr(world.options, 'limited_graffiti') else False,
                    'glitched': bool(world.options.logic.value) if hasattr(world.options, 'logic') else False,
                }
                logger.info(f"Bomb Rush Cyberfunk options: {self.options}")
            except Exception as e:
                logger.warning(f"Could not extract Bomb Rush Cyberfunk options: {e}")
                self.options = {
                    'movestyle': 2,
                    'limit': False,
                    'glitched': False,
                }

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """Check if a function should be preserved as a helper call instead of being inlined.

        Args:
            func_name: The name of the function being analyzed

        Returns:
            True if the function should be kept as a helper call, False if it should be inlined
        """
        # Preserve graffiti_spots and related spot counting functions as helpers
        # These functions build an access cache internally and have complex logic
        # that shouldn't be inlined
        #
        # Also preserve region access functions that have complex conditional logic
        # to avoid analysis issues
        preserve_list = [
            'graffiti_spots',
            'spots_s_glitchless',
            'spots_s_glitched',
            'spots_m_glitchless',
            'spots_m_glitched',
            'spots_l_glitchless',
            'spots_l_glitched',
            'spots_xl_glitchless',
            'spots_xl_glitched',
            'build_access_cache',
            # Region entrance and sub-region access functions
            'versum_hill_entrance',
            'versum_hill_ch1_roadblock',
            'versum_hill_oldhead',
            'versum_hill_all_challenges',
            'versum_hill_basketball_court',
            'millennium_square_entrance',
            'brink_terminal_entrance',
            'brink_terminal_plaza',
            'brink_terminal_tower',
            'brink_terminal_oldhead_underground',
            'brink_terminal_oldhead_dock',
            'millennium_mall_entrance',
            'millennium_mall_theater',
            'millennium_mall_oldhead_ceiling',
            'millennium_mall_oldhead_race',
            'pyramid_island_entrance',
            'pyramid_island_gate',
            'pyramid_island_oldhead',
            'pyramid_island_top',
            'pyramid_island_upper_half',
            'mataan_entrance',
            'mataan_smoke_wall',
            'mataan_oldhead',
            # Region access/challenge functions
            'versum_hill_rietveld',
            'versum_hill_crew_battle',
            'versum_hill_rave',
            'brink_terminal_crew_battle',
            'brink_terminal_mesh',
            'millennium_mall_switch',
            'millennium_mall_big',
            'millennium_mall_crew_battle',
            'pyramid_island_all_challenges',
            'pyramid_island_crew_battle',
            'pyramid_island_race',
            'mataan_challenge1',
            'mataan_deep_city',
            'mataan_challenge2',
            'mataan_all_challenges',
            'mataan_smoke_wall2',
            'mataan_deepest',
            'mataan_crew_battle',
            'mataan_faux',
            # Individual challenge functions
            'versum_hill_challenge1',
            'versum_hill_challenge2',
            'versum_hill_challenge3',
            'brink_terminal_challenge1',
            'brink_terminal_challenge2',
            'brink_terminal_challenge3',
            'millennium_mall_challenge1',
            'millennium_mall_challenge2',
            'millennium_mall_challenge3',
            'millennium_mall_challenge4',
            'pyramid_island_challenge1',
            'pyramid_island_challenge2',
            'pyramid_island_challenge3',
            'mataan_challenge3'
        ]
        return func_name in preserve_list
    
    def set_context(self, location_name: str = None):
        """Set context for rule expansion."""
        self.current_location_name = location_name
    
    def expand_helper(self, helper_name: str, args: List[Any] = None):
        """Expand Bomb Rush Cyberfunk specific helper functions."""
        if args is None:
            args = []
            
        # TODO: Add game-specific helper expansions as they are identified
        # This will be populated based on test failures
        
        return None  # Preserve helper nodes as-is for now
        
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively expand rule functions with Bomb Rush Cyberfunk-specific analysis."""
        if not rule:
            return rule
            
        # Handle helper functions with variable resolution
        if rule.get('type') == 'helper':
            # Resolve the arguments for all helper functions
            resolved_args = []
            for arg in rule.get('args', []):
                if arg.get('type') == 'name':
                    # Resolve variable names to actual values
                    var_name = arg.get('name')
                    if var_name == 'movestyle':
                        resolved_args.append({'type': 'constant', 'value': self.options.get('movestyle', 2)})
                    elif var_name == 'limit':
                        resolved_args.append({'type': 'constant', 'value': self.options.get('limit', False)})
                    elif var_name == 'glitched':
                        resolved_args.append({'type': 'constant', 'value': self.options.get('glitched', False)})
                    elif var_name == 'spot_count':
                        # Try to extract the spot count from the location name if available
                        # This is a workaround since lambda defaults aren't being captured properly
                        if self.current_location_name and 'Tagged' in self.current_location_name:
                            import re
                            match = re.search(r'Tagged (\d+) Graffiti Spots', self.current_location_name)
                            if match:
                                spot_count = int(match.group(1))
                                resolved_args.append({'type': 'constant', 'value': spot_count})
                            else:
                                resolved_args.append(arg)
                        else:
                            resolved_args.append(arg)
                    else:
                        resolved_args.append(arg)
                else:
                    resolved_args.append(arg)

            return {
                'type': 'helper',
                'name': rule['name'],
                'args': resolved_args
            }
            
        # Special handling for __analyzed_func__ - try to extract meaningful information
        if rule.get('type') == 'state_method' and rule.get('method') == '__analyzed_func__':
            # Try to extract more detailed information from original rule if available
            if 'original' in rule:
                return self._analyze_original_rule(rule['original'])
                
            # Attempt to infer rule type from any available information
            return self._infer_rule_type(rule)
            
        # Recursively process nested rules
        if rule.get('type') in ['and', 'or']:
            processed_rules = []
            for sub_rule in rule.get('rules', []):
                processed_rules.append(self.expand_rule(sub_rule))
            return {
                'type': rule['type'],
                'rules': processed_rules
            }
            
        # Standard processing from base class
        return super().expand_rule(rule)
    
    def _analyze_original_rule(self, original_rule):
        """Analyze the original rule structure before it became __analyzed_func__."""
        # Look for state method calls in the original rule
        if original_rule.get('type') == 'state_method':
            method = original_rule.get('method', '')
            args = original_rule.get('args', [])
            
            # Handle 'has' method for item requirements
            if method == 'has' and len(args) >= 1:
                base_rule = {
                    'type': 'item_check',
                    'item': args[0]
                }
                # Handle count requirements
                if len(args) >= 3:
                    base_rule['count'] = {'type': 'constant', 'value': args[2]}
                return base_rule
                
            # Handle other known state methods
            if method in ['can_reach', 'has_group', 'has_any']:
                return {
                    'type': 'game_specific_check',
                    'method': method,
                    'args': args,
                    'description': f"Requires {method}({', '.join(str(a) for a in args)})"
                }
        
        return {
            'type': 'generic_rule',
            'description': 'Bomb Rush Cyberfunk-specific rule',
            'details': 'This rule could not be fully analyzed due to game-specific implementation'
        }
    
    def _infer_rule_type(self, rule):
        """Attempt to infer rule type based on context clues."""
        args = rule.get('args', [])
        rule_str = str(rule)
        
        # Item check patterns
        if 'has(' in rule_str.lower() or 'state.has' in rule_str.lower():
            item_match = re.search(r"has\(['\"](.*?)['\"]\s*,", rule_str)
            if item_match:
                return {
                    'type': 'item_check',
                    'item': item_match.group(1),
                    'inferred': True
                }
        
        # Location access patterns
        if 'can_reach' in rule_str.lower():
            return {
                'type': 'can_reach',
                'inferred': True,
                'description': 'Requires reaching a specific location'
            }
        
        return {
            'type': 'generic_rule',
            'description': 'Bomb Rush Cyberfunk-specific rule',
            'details': 'This rule could not be fully analyzed but may involve item requirements'
        }
    
    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return Bomb Rush Cyberfunk item definitions with classification flags."""
        from worlds.bomb_rush_cyberfunk.Items import item_table, BRCType
        from worlds.bomb_rush_cyberfunk.Locations import event_table
        from BaseClasses import ItemClassification

        item_data = {}

        for item_dict in item_table:
            name = item_dict["name"]
            item_type = item_dict["type"]

            # Get classification from the world instance
            classification = world.get_item_classification(item_type)

            # Convert classification to string
            classification_str = "filler"
            if classification == ItemClassification.progression:
                classification_str = "progression"
            elif classification == ItemClassification.progression_skip_balancing:
                classification_str = "progression_skip_balancing"
            elif classification == ItemClassification.useful:
                classification_str = "useful"

            # Map BRCType to readable category
            category_mapping = {
                BRCType.Music: "music",
                BRCType.GraffitiM: "graffiti_m",
                BRCType.GraffitiL: "graffiti_l",
                BRCType.GraffitiXL: "graffiti_xl",
                BRCType.Skateboard: "skateboard",
                BRCType.InlineSkates: "inline_skates",
                BRCType.BMX: "bmx",
                BRCType.Character: "character",
                BRCType.Outfit: "outfit",
                BRCType.REP: "rep",
                BRCType.Camera: "camera"
            }

            item_data[name] = {
                "classification": classification_str,
                "category": category_mapping.get(item_type, "unknown"),
                "type_value": item_type.value
            }

        # Process event items from event_table
        # These are items like "Chapter Completed" and "Victory" that are placed at event locations
        event_items_seen = set()
        for event_dict in event_table:
            event_item_name = event_dict.get("item")
            if event_item_name and event_item_name not in event_items_seen:
                event_items_seen.add(event_item_name)
                item_data[event_item_name] = {
                    'name': event_item_name,
                    'id': None,  # Event items have no ID
                    'groups': ['Event'],
                    'advancement': True,  # Event items are progression
                    'useful': False,
                    'trap': False,
                    'event': True,  # This is an event item
                    'type': 'Event',
                    'max_count': 1
                }
                logger.info(f"Added event item: {event_item_name}")

        # Also scan locations for dynamically created event items
        if hasattr(world, 'multiworld'):
            multiworld = world.multiworld
            player = world.player

            for location in multiworld.get_locations(player):
                if location.item and location.item.player == player:
                    item_name = location.item.name
                    # Check if this is an event item (no code/ID) that we haven't processed yet
                    if (location.item.code is None and
                        item_name not in item_data and
                        hasattr(location.item, 'classification')):

                        item_data[item_name] = {
                            'name': item_name,
                            'id': None,
                            'groups': ['Event'],
                            'advancement': location.item.classification == ItemClassification.progression or
                                          location.item.classification == ItemClassification.progression_skip_balancing,
                            'useful': location.item.classification == ItemClassification.useful,
                            'trap': location.item.classification == ItemClassification.trap,
                            'event': True,
                            'type': 'Event',
                            'max_count': 1
                        }
                        logger.info(f"Added dynamically created event item from location: {item_name}")

        return item_data
    
    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """Return progression mapping for REP items.

        In Bomb Rush Cyberfunk, REP items like "8 REP", "16 REP", etc. contribute
        their numeric value to a virtual "rep" counter in state.prog_items.
        """
        return {
            "rep": {
                "type": "additive",
                "items": {
                    "8 REP": 8,
                    "16 REP": 16,
                    "24 REP": 24,
                    "32 REP": 32,
                    "48 REP": 48
                }
            }
        }

    def get_game_info(self, world) -> Dict[str, Any]:
        """Get information about Bomb Rush Cyberfunk's rule formats and structure."""
        return {
            "name": "Bomb Rush Cyberfunk",
            "rule_format": {
                "version": "1.0"
            }
        }