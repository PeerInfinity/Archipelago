"""Ocarina of Time game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import ast
import logging
import re
import json
import os

logger = logging.getLogger(__name__)

# Monkey-patch the OOT RuleParser to capture AST nodes for subrule events
# This is done at module import time, before any worlds are generated
def _patch_oot_rule_parser():
    """
    Patch the OOT RuleParser.create_delayed_rules() method to store unparsed AST
    as rule_string on event locations. This allows the exporter to access the
    original rule strings without modifying files in the worlds directory.
    """
    try:
        from worlds.oot.RuleParser import Rule_AST_Transformer

        original_create_delayed_rules = Rule_AST_Transformer.create_delayed_rules

        def patched_create_delayed_rules(self):
            """Patched version that stores unparsed AST on event locations."""
            from worlds.oot.Location import OOTLocation
            from worlds.oot.Rules import set_rule

            for region_name, node, subrule_name in self.delayed_rules:
                region = self.world.multiworld.get_region(region_name, self.player)
                event = OOTLocation(self.player, subrule_name, type='Event', parent=region, internal=True)
                event.show_in_spoiler = False

                # Store the unparsed AST as a rule_string for the exporter
                # This allows the exporter to access the original rule even though the lambda is dynamically compiled
                try:
                    event.rule_string = ast.unparse(node)
                except Exception as e:
                    logging.getLogger('').warning(f'Failed to unparse AST for {subrule_name}: {e}')
                    event.rule_string = None

                self.current_spot = event
                # This could, in theory, create further subrules.
                access_rule = self.make_access_rule(self.visit(node))
                if access_rule is self.rule_cache.get('NameConstant(False)'):
                    event.access_rule = None
                    event.never = True
                    logging.getLogger('').debug('Dropping unreachable delayed event: %s', event.name)
                else:
                    if access_rule is self.rule_cache.get('NameConstant(True)'):
                        event.always = True
                    set_rule(event, access_rule)
                    region.locations.append(event)

            self.delayed_rules.clear()

        # Apply the patch
        Rule_AST_Transformer.create_delayed_rules = patched_create_delayed_rules
        logger.info("OOT: Successfully patched RuleParser.create_delayed_rules to capture AST nodes")

    except ImportError as e:
        logger.debug(f"OOT: Could not patch RuleParser (worlds.oot not available): {e}")
    except Exception as e:
        logger.warning(f"OOT: Failed to patch RuleParser: {e}")

# Apply the patch when this module is imported
_patch_oot_rule_parser()

class OOTGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Ocarina of Time'

    def __init__(self):
        super().__init__()
        self.rule_string_map = {}  # Maps rule_target_name -> rule_string
        self.world = None

    def _load_logic_helpers(self):
        """Load subrule definitions from LogicHelpers.json."""
        try:
            # Find the OOT world directory
            import worlds.oot
            oot_dir = os.path.dirname(worlds.oot.__file__)
            logic_helpers_path = os.path.join(oot_dir, 'data', 'LogicHelpers.json')

            if not os.path.exists(logic_helpers_path):
                logger.warning(f"OOT: LogicHelpers.json not found at {logic_helpers_path}")
                return {}

            with open(logic_helpers_path, 'r', encoding='utf-8') as f:
                # Read the file, stripping out comments
                content = []
                for line in f:
                    # Remove comments (anything after # on each line)
                    line = line.split('#', 1)[0]
                    if line.strip():
                        content.append(line)
                json_content = ''.join(content)

            logic_helpers = json.loads(json_content)
            logger.info(f"OOT: Loaded {len(logic_helpers)} subrule definitions from LogicHelpers.json")
            return logic_helpers

        except Exception as e:
            logger.error(f"OOT: Failed to load LogicHelpers.json: {e}")
            return {}

    def _load_world_json_files(self):
        """Load region/entrance/location data from World JSON files."""
        try:
            import worlds.oot
            import glob
            oot_dir = os.path.dirname(worlds.oot.__file__)
            world_dir = os.path.join(oot_dir, 'data', 'World')

            if not os.path.exists(world_dir):
                logger.warning(f"OOT: World directory not found at {world_dir}")
                return {}

            # Find all JSON files in the World directory
            json_files = glob.glob(os.path.join(world_dir, '*.json'))

            entrance_rules = {}
            location_rules = {}

            for json_file in json_files:
                try:
                    with open(json_file, 'r', encoding='utf-8') as f:
                        # Read the file, stripping out comments
                        content = []
                        for line in f:
                            # Remove comments (anything after # on each line)
                            line = line.split('#', 1)[0]
                            if line.strip():
                                content.append(line)
                        json_content = ''.join(content)

                    regions = json.loads(json_content)

                    # Extract exit and location rules from each region
                    for region in regions:
                        region_name = region.get('region_name', '')

                        # Extract exit rules
                        exits = region.get('exits', {})
                        for exit_target, rule_string in exits.items():
                            # The exit name format matches what Archipelago creates
                            exit_name = f"{region_name} -> {exit_target}"
                            entrance_rules[exit_name] = rule_string

                        # Extract location rules
                        locations = region.get('locations', {})
                        for location_name, rule_string in locations.items():
                            location_rules[location_name] = rule_string

                except Exception as e:
                    logger.debug(f"OOT: Error loading {os.path.basename(json_file)}: {e}")
                    continue

            logger.info(f"OOT: Loaded {len(entrance_rules)} entrance rules and {len(location_rules)} location rules from World JSON files")
            return {'entrances': entrance_rules, 'locations': location_rules}

        except Exception as e:
            logger.error(f"OOT: Failed to load World JSON files: {e}")
            return {}

    def build_rule_string_map(self, world):
        """Build a mapping of location/entrance names to their rule strings."""
        self.world = world
        self.rule_string_map = {}

        # Load subrule definitions from LogicHelpers.json
        # This avoids needing to modify files in the worlds directory
        logic_helpers = self._load_logic_helpers()

        # Add all the logic helper rules to our map
        for subrule_name, rule_string in logic_helpers.items():
            self.rule_string_map[subrule_name] = rule_string
            logger.debug(f"OOT: Loaded subrule '{subrule_name}' from LogicHelpers: {rule_string[:80]}")

        # Load entrance and location rules from World JSON files
        world_data = self._load_world_json_files()
        entrance_rules = world_data.get('entrances', {})
        location_rules = world_data.get('locations', {})

        # Add entrance rules to the map
        for exit_name, rule_string in entrance_rules.items():
            self.rule_string_map[exit_name] = rule_string
            logger.debug(f"OOT: Loaded entrance '{exit_name}' from World JSON: {rule_string[:80]}")

        # Add location rules to the map (but don't overwrite subrules)
        for location_name, rule_string in location_rules.items():
            if location_name not in self.rule_string_map:
                self.rule_string_map[location_name] = rule_string
                logger.debug(f"OOT: Loaded location '{location_name}' from World JSON: {rule_string[:80]}")

        # Collect rule_string attributes from all locations and exits
        # Regular locations and exits have rule_string set from JSON data
        # Event locations from subrules have rule_string set by our monkey-patch
        for region in world.get_regions():
            for location in region.locations:
                if hasattr(location, 'rule_string') and location.rule_string:
                    # Don't overwrite if we already got it from LogicHelpers
                    if location.name not in self.rule_string_map:
                        self.rule_string_map[location.name] = location.rule_string
                        logger.debug(f"OOT: Captured location '{location.name}' rule_string attribute")

            # Collect rule strings from all exits/entrances
            for exit in region.exits:
                if hasattr(exit, 'rule_string') and exit.rule_string:
                    # Don't overwrite if we already got it from LogicHelpers
                    if exit.name not in self.rule_string_map:
                        self.rule_string_map[exit.name] = exit.rule_string
                        logger.debug(f"OOT: Captured exit '{exit.name}' rule_string attribute")

        logger.info(f"OOT: Built rule string map with {len(self.rule_string_map)} entries")

    def override_rule_analysis(self, rule_func, rule_target_name: str = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis to use OOT's rule strings instead of analyzing lambdas."""
        if not rule_target_name:
            return None

        # Look up the rule string for this location/entrance
        rule_string = self.rule_string_map.get(rule_target_name)
        if not rule_string:
            logger.debug(f"OOT: No rule string found for {rule_target_name}")
            return None

        # Remove comments and strip
        rule_string = rule_string.split('#', 1)[0].strip()

        # Check if the rule_string is just "True" but the rule_func is not trivial
        # This happens when add_rule() was used to add requirements to a shop item
        # In this case, we should NOT use the rule_string and let the analyzer handle it
        if rule_string == "True" and rule_func is not None:
            # Try to analyze the lambda to see if it has additional logic
            # If it's a simple "always true" lambda, we can use the rule_string
            # But if add_rule() was called, the lambda will be more complex
            try:
                import inspect
                source = inspect.getsource(rule_func).strip()
                # If the source contains "and" or "or", it's a combined rule from add_rule()
                if " and " in source or " or " in source:
                    logger.debug(f"OOT: {rule_target_name} has combined rule from add_rule(), skipping rule_string")
                    return None  # Let the analyzer handle it
            except (OSError, TypeError):
                # Can't get source, continue with rule_string
                pass

        logger.debug(f"OOT: Parsing rule string for {rule_target_name}: {rule_string[:100]}")

        try:
            # Parse the rule string into a JSON-compatible format
            return self.parse_oot_rule_string(rule_string)
        except Exception as e:
            logger.error(f"OOT: Failed to parse rule string for {rule_target_name}: {e}")
            logger.debug(f"OOT: Rule string was: {rule_string}")
            return None

    def parse_oot_rule_string(self, rule_string: str) -> Dict[str, Any]:
        """
        Parse OOT's custom rule DSL into JSON format.

        Examples:
        - "True" -> {"type": "constant", "value": True}
        - "is_adult" -> {"type": "helper", "name": "is_adult"}
        - "is_adult and Hover_Boots" -> {"type": "and", "conditions": [...]}

        Also handles Python AST unparsed strings from Subrule locations.
        """
        # Handle simple constants
        if rule_string == "True":
            return {"type": "constant", "value": True}
        if rule_string == "False":
            return {"type": "constant", "value": False}

        # Check if this is a Python-style rule string (from ast.unparse of Subrule locations)
        # These will have Python syntax like "state.has('Item', player)" instead of OOT DSL "Item"
        if "state." in rule_string or ".has" in rule_string or "__ast_dump__:" in rule_string:
            # This is a Python code string, we need to convert it to OOT DSL
            # For now, return a helper that will handle the Python-style rule
            return {
                "type": "helper",
                "name": "parse_oot_python_rule",
                "args": [
                    {"type": "constant", "value": rule_string}
                ]
            }

        # For now, return a placeholder helper that includes the original rule string
        # This will allow us to see what rules are being used and implement them progressively
        return {
            "type": "helper",
            "name": "parse_oot_rule",
            "args": [
                {"type": "constant", "value": rule_string}
            ]
        }

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export OOT-specific settings needed for logic evaluation."""
        # Start with common settings from base handler
        settings_dict = super().get_settings_data(world, multiworld, player)

        # OOT-specific settings that affect logic
        oot_settings = [
            'starting_age',           # Critical: determines initial age state
            'open_forest',            # Affects Kokiri Forest access
            'shuffle_child_trade',    # Affects child trade item locations
            'shuffle_dungeon_entrances', # Affects dungeon access
            'entrance_shuffle',       # General entrance shuffle setting
            'bombchus_in_logic',      # Whether bombchus are required logic
            'plant_beans',            # Whether beans are planted
            'logic_no_night_tokens_without_suns_song', # Night token logic
            'logic_rules',            # Overall logic difficulty
            'logic_tricks',           # Enabled logic tricks
            'big_poe_count',          # Required big poe count
            'shuffle_medigoron_carpet_salesman',
            'shuffle_grotto_entrances',
            'shuffle_interior_entrances',
            'shuffle_overworld_entrances',
            'shuffle_scrubs',
            'shuffle_pots',
            'shuffle_crates',
            'shuffle_cows',
            'shuffle_beehives',
            'warp_songs',
            'spawn_positions',
            'owl_drops',
        ]

        # Extract settings from world object
        for setting_name in oot_settings:
            if hasattr(world, setting_name):
                value = getattr(world, setting_name)
                # Handle Option objects vs direct values
                if hasattr(value, 'value'):
                    settings_dict[setting_name] = value.value
                elif hasattr(value, 'current_key'):
                    settings_dict[setting_name] = value.current_key
                else:
                    settings_dict[setting_name] = value
                logger.debug(f"OOT: Exported setting {setting_name} = {settings_dict[setting_name]}")

        return settings_dict

    def post_process_location_data(self, location_data: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """Post-process location data after export, adding OOT-specific requirements."""
        # Add shop wallet requirements
        return self.add_shop_wallet_requirements(location_data, location_name)

    def add_shop_wallet_requirements(self, location_data: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """Add wallet requirements to shop items based on the item being sold."""
        item_name = location_data.get('item', {}).get('name', '')
        access_rule = location_data.get('access_rule')

        # Only process if access_rule is constant True (original rule before add_rule())
        if not (access_rule and access_rule.get('type') == 'constant' and access_rule.get('value') is True):
            return location_data

        # Shop items that require Progressive Wallet (from worlds/oot/Rules.py set_shop_rules)
        wallet_items = ['Buy Arrows (50)', 'Buy Fish', 'Buy Goron Tunic', 'Buy Bombchu (20)', 'Buy Bombs (30)']
        wallet2_items = ['Buy Zora Tunic', 'Buy Blue Fire']
        bombchu_items = ['Buy Bombchu (10)', 'Buy Bombchu (20)', 'Buy Bombchu (5)']

        new_rule = None

        # Buy Bombchu (20) requires BOTH wallet AND found_bombchus
        if item_name == 'Buy Bombchu (20)':
            new_rule = {
                "type": "helper",
                "name": "parse_oot_rule",
                "args": [{"type": "constant", "value": "Progressive_Wallet and found_bombchus"}]
            }
        elif item_name in wallet_items:
            new_rule = {
                "type": "helper",
                "name": "parse_oot_rule",
                "args": [{"type": "constant", "value": "Progressive_Wallet"}]
            }
        elif item_name in wallet2_items:
            new_rule = {
                "type": "helper",
                "name": "parse_oot_rule",
                "args": [{"type": "constant", "value": "(Progressive_Wallet, 2)"}]
            }
        elif item_name in bombchu_items:
            new_rule = {
                "type": "helper",
                "name": "parse_oot_rule",
                "args": [{"type": "constant", "value": "found_bombchus"}]
            }

        if new_rule:
            logger.debug(f"OOT: Adding requirement to shop item {location_name} ({item_name})")
            location_data['access_rule'] = new_rule

        return location_data

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand OOT-specific rules, handling special closure variables."""
        if not rule:
            return rule

        # Handle the special 'rule' and 'old_rule' helpers from add_rule/exclusion_rules
        # These are closure variables from worlds/generic/Rules.py that can't be analyzed
        # When they appear as helpers with no args, we need to handle them specially
        if rule.get('type') == 'helper' and rule.get('name') in ['rule', 'old_rule']:
            # These are typically from add_rule() which combines rules
            # When old_rule is the default (empty) rule, it returns True
            # Since we can't analyze them, we'll treat them as always-true
            logger.debug(f"Replacing unanalyzable helper '{rule['name']}' with constant True")
            return {'type': 'constant', 'value': True}

        # Handle 'and' conditions that contain rule/old_rule
        if rule.get('type') == 'and':
            conditions = rule.get('conditions', [])
            # Expand each condition first
            expanded_conditions = [self.expand_rule(cond) for cond in conditions]
            # Filter out constant True values (they don't affect AND logic)
            filtered_conditions = [
                cond for cond in expanded_conditions
                if not (cond.get('type') == 'constant' and cond.get('value') is True)
            ]
            # If all conditions were removed, return True
            if not filtered_conditions:
                return {'type': 'constant', 'value': True}
            # If only one condition remains, return it directly
            if len(filtered_conditions) == 1:
                return filtered_conditions[0]
            # Otherwise return the simplified AND
            return {'type': 'and', 'conditions': filtered_conditions}

        # Handle 'or' conditions
        if rule.get('type') == 'or':
            conditions = rule.get('conditions', [])
            expanded_conditions = [self.expand_rule(cond) for cond in conditions]
            # If any condition is constant False, remove it (doesn't affect OR logic)
            filtered_conditions = [
                cond for cond in expanded_conditions
                if not (cond.get('type') == 'constant' and cond.get('value') is False)
            ]
            if not filtered_conditions:
                return {'type': 'constant', 'value': False}
            if len(filtered_conditions) == 1:
                return filtered_conditions[0]
            return {'type': 'or', 'conditions': filtered_conditions}

        # Handle 'not' conditions
        if rule.get('type') == 'not':
            if 'condition' in rule:
                rule['condition'] = self.expand_rule(rule['condition'])
            if 'conditions' in rule:
                rule['conditions'] = [self.expand_rule(cond) for cond in rule['conditions']]

        # Handle function_call nodes - recursively expand the function and args
        if rule.get('type') == 'function_call':
            if 'function' in rule:
                rule['function'] = self.expand_rule(rule['function'])
            if 'args' in rule:
                rule['args'] = [self.expand_rule(arg) for arg in rule['args']]

        return super().expand_rule(rule)
