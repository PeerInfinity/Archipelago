"""Super Mario 64 EX game-specific exporter handler.

SM64EX uses a custom RuleFactory that converts string expressions into lambda functions.
This exporter parses the Rules.py file directly to extract rule expressions before they're
converted to lambdas, then converts them to JSON format.
"""

from typing import Dict, Any, List, Optional
from .generic import GenericGameExportHandler
import logging
import re
import os

logger = logging.getLogger(__name__)

class SM64EXGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Super Mario 64'

    # Movement abilities - affected by enable_move_rando
    MOVEMENT_TOKENS = {
        "TJ": "Triple Jump",
        "DJ": "Triple Jump",
        "LJ": "Long Jump",
        "BF": "Backflip",
        "SF": "Side Flip",
        "WK": "Wall Kick",
        "DV": "Dive",
        "GP": "Ground Pound",
        "KK": "Kick",
        "CL": "Climb",
        "LG": "Ledge Grab"
    }

    # Cap items - always collectible items, not affected by enable_move_rando
    CAP_TOKENS = {
        "WC": "Wing Cap",
        "MC": "Metal Cap",
        "VC": "Vanish Cap"
    }

    # Combined token table for backwards compatibility
    TOKEN_TABLE = {**MOVEMENT_TOKENS, **CAP_TOKENS}

    def __init__(self, world=None):
        super().__init__()
        self._rule_expressions = {}  # Cache for parsed rules
        self._options = {}  # Store world options
        self._world = world  # Store world reference

        # Parse rules file and extract options if world is available
        if world:
            self.parse_rules_file(world)
            self.extract_world_options(world)

    def parse_rules_file(self, world):
        """Parse the SM64 Rules.py file to extract rule expressions."""
        try:
            # Get path to worlds/sm64ex/Rules.py
            import inspect
            world_module = inspect.getmodule(world.__class__)
            if not world_module:
                logger.error("Could not get world module")
                return

            module_file = inspect.getfile(world_module)
            rules_file = os.path.join(os.path.dirname(module_file), 'Rules.py')

            if not os.path.exists(rules_file):
                logger.error(f"Rules.py not found at {rules_file}")
                return

            # Parse the file for rf.assign_rule calls
            with open(rules_file, 'r', encoding='utf-8') as f:
                content = f.read()

            # Pattern: rf.assign_rule("location/region name", "rule expression")
            pattern = r'rf\.assign_rule\(\s*["\']([^"\']+)["\']\s*,\s*["\']([^"\']+)["\']\s*\)'
            matches = re.findall(pattern, content)

            for location_name, rule_expr in matches:
                self._rule_expressions[location_name] = rule_expr

            logger.info(f"Parsed {len(self._rule_expressions)} rule expressions from Rules.py")

        except Exception as e:
            logger.error(f"Error parsing Rules.py: {e}", exc_info=True)

    def extract_world_options(self, world):
        """Extract and store world options for rule parsing."""
        if hasattr(world, 'options'):
            try:
                if hasattr(world.options, 'enable_move_rando'):
                    self._options['enable_move_rando'] = bool(world.options.enable_move_rando.value)
                else:
                    self._options['enable_move_rando'] = False

                if hasattr(world.options, 'strict_cap_requirements'):
                    self._options['capless'] = not bool(world.options.strict_cap_requirements.value)

                if hasattr(world.options, 'strict_cannon_requirements'):
                    self._options['cannonless'] = not bool(world.options.strict_cannon_requirements.value)

                if hasattr(world.options, 'strict_move_requirements'):
                    self._options['moveless'] = not bool(world.options.strict_move_requirements.value)

                if hasattr(world.options, 'area_rando'):
                    self._options['area_randomizer'] = int(world.options.area_rando.value) > 0

            except Exception as e:
                logger.error(f"Error extracting SM64 options: {e}")

    def get_settings_data(self, world, multiworld, player):
        """Extract SM64 settings."""
        settings = super().get_settings_data(world, multiworld, player)

        # Ensure options are extracted
        self.extract_world_options(world)

        # Add settings to the output
        if hasattr(world, 'options'):
            try:
                if hasattr(world.options, 'enable_move_rando'):
                    settings['enable_move_rando'] = bool(world.options.enable_move_rando.value)

                if hasattr(world.options, 'strict_cap_requirements'):
                    settings['strict_cap_requirements'] = bool(world.options.strict_cap_requirements.value)

                if hasattr(world.options, 'strict_cannon_requirements'):
                    settings['strict_cannon_requirements'] = bool(world.options.strict_cannon_requirements.value)

                if hasattr(world.options, 'strict_move_requirements'):
                    settings['strict_move_requirements'] = bool(world.options.strict_move_requirements.value)

                if hasattr(world.options, 'area_rando'):
                    settings['area_rando'] = int(world.options.area_rando.value)

            except Exception as e:
                logger.error(f"Error extracting SM64 options: {e}")

        return settings

    def parse_rule_expression(self, rule_expr: str, cannon_area: Optional[str] = None) -> Dict[str, Any]:
        """Parse a SM64 rule expression string into JSON rule format.

        Rule expression syntax:
        - | for OR
        - & for AND
        - / for OR (alternative, used within tokens)
        - + for AND with has_all (used within tokens)
        - {region} for region reachability
        - {{location}} for location reachability
        - MOVELESS, CAPLESS, CANNLESS - special flags
        - CANN - cannon for specific area
        - NAR - area randomizer flag
        - Other tokens: TJ, LJ, BF, SF, WK, DV, GP, KK, CL, LG, WC, MC, VC
        """

        # Handle | (OR) at top level
        or_parts = [part.strip() for part in rule_expr.split(' | ')]

        if len(or_parts) > 1:
            # Multiple OR clauses
            conditions = [self.parse_and_expression(part, cannon_area) for part in or_parts]

            # Check if any condition is True (OR short-circuits to True)
            for cond in conditions:
                if cond.get('type') == 'constant' and cond.get('value') == True:
                    return {'type': 'constant', 'value': True}

            # Filter out False conditions (they don't affect OR)
            conditions = [c for c in conditions if c.get('type') != 'constant' or c.get('value') != False]

            if not conditions:
                return {'type': 'constant', 'value': False}
            if len(conditions) == 1:
                return conditions[0]
            return {
                'type': 'or',
                'conditions': conditions
            }
        else:
            # Single expression
            return self.parse_and_expression(or_parts[0], cannon_area)

    def parse_and_expression(self, expr: str, cannon_area: Optional[str] = None) -> Dict[str, Any]:
        """Parse AND expression (tokens separated by &)."""
        and_parts = [part.strip() for part in expr.split(' & ')]

        if len(and_parts) > 1:
            # Multiple AND clauses
            conditions = [self.parse_token_expression(part, cannon_area) for part in and_parts]

            # Check if any condition is False (AND short-circuits to False)
            for cond in conditions:
                if cond.get('type') == 'constant' and cond.get('value') == False:
                    return {'type': 'constant', 'value': False}

            # Filter out True conditions (they don't affect AND)
            conditions = [c for c in conditions if c.get('type') != 'constant' or c.get('value') != True]

            if not conditions:
                return {'type': 'constant', 'value': True}
            if len(conditions) == 1:
                return conditions[0]
            return {
                'type': 'and',
                'conditions': conditions
            }
        else:
            # Single token
            return self.parse_token_expression(and_parts[0], cannon_area)

    def parse_token_expression(self, token_expr: str, cannon_area: Optional[str] = None) -> Dict[str, Any]:
        """Parse a single token or token group."""
        token_expr = token_expr.strip()

        # Handle region reachability: {region name} or {{location name}}
        if token_expr.startswith('{{') and token_expr.endswith('}}'):
            # Location reachability - use state_method to match Python's state.can_reach()
            location_name = token_expr[2:-2].strip()
            return {
                'type': 'state_method',
                'method': 'can_reach',
                'args': [
                    {'type': 'constant', 'value': location_name},
                    {'type': 'constant', 'value': 'Location'}
                ]
            }
        elif token_expr.startswith('{') and token_expr.endswith('}'):
            # Region reachability - use state_method to match Python's state.can_reach()
            region_name = token_expr[1:-1].strip()
            return {
                'type': 'state_method',
                'method': 'can_reach',
                'args': [
                    {'type': 'constant', 'value': region_name},
                    {'type': 'constant', 'value': 'Region'}
                ]
            }

        # Handle + (has_all) - items required together
        if '+' in token_expr:
            tokens = [t.strip() for t in token_expr.split('+')]
            items = []
            for token in tokens:
                item_name = self.resolve_token(token, cannon_area)
                if item_name and item_name != True:
                    items.append(item_name)

            if not items:
                return {'type': 'constant', 'value': True}
            if len(items) == 1:
                return {'type': 'item_check', 'item': items[0]}
            return {
                'type': 'helper',
                'name': 'has_all_items',
                'args': [{'type': 'constant', 'value': items}]
            }

        # Handle / (has_any) - any one of these items
        if '/' in token_expr:
            tokens = [t.strip() for t in token_expr.split('/')]
            items = []
            for token in tokens:
                item_name = self.resolve_token(token, cannon_area)
                if item_name and item_name != True:
                    items.append(item_name)

            if not items:
                return {'type': 'constant', 'value': True}
            if len(items) == 1:
                return {'type': 'item_check', 'item': items[0]}
            return {
                'type': 'helper',
                'name': 'has_any_item',
                'args': [{'type': 'constant', 'value': items}]
            }

        # Single token
        item_name = self.resolve_token(token_expr, cannon_area)
        if item_name == True:
            return {'type': 'constant', 'value': True}
        if item_name == False:
            return {'type': 'constant', 'value': False}
        if item_name:
            return {'type': 'item_check', 'item': item_name}

        # Unknown token - preserve as helper
        return {
            'type': 'helper',
            'name': f'sm64_token_{token_expr.lower()}',
            'args': []
        }

    def resolve_token(self, token: str, cannon_area: Optional[str] = None):
        """Resolve a single token to an item name or boolean."""
        token = token.strip()

        # Handle special tokens
        if token == 'MOVELESS':
            return True if self._options.get('moveless', False) else False
        if token == 'CAPLESS':
            return True if self._options.get('capless', False) else False
        if token == 'CANNLESS':
            return True if self._options.get('cannonless', False) else False
        if token == 'NAR':
            return True if self._options.get('area_randomizer', False) else False
        if token == 'CANN':
            # Cannon for specific area
            if cannon_area:
                return f"Cannon Unlock {cannon_area}"
            return "Cannon"  # Generic cannon item

        # Check if it's a cap item (always collectible, never "always available")
        if token in self.CAP_TOKENS:
            return self.CAP_TOKENS[token]

        # Check if it's a movement ability token
        if token in self.MOVEMENT_TOKENS:
            # If move randomizer is disabled, all moves are available from the start
            if not self._options.get('enable_move_rando', False):
                return True  # Move is always available
            return self.MOVEMENT_TOKENS[token]

        # Unknown token
        logger.warning(f"Unknown SM64 token: {token}")
        return None

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Override rule analysis for locations with known rule expressions.

        This is called by the exporter before analyzing the rule function.
        If we have the original expression for this location, we parse it
        and return the parsed rule, bypassing the normal analysis.
        """
        # Skip override for locations that have additional rules applied via add_rule
        # These locations need the full lambda analysis
        locations_with_additional_rules = [
            "MIPS 1", "MIPS 2",
            "Toad (Basement)", "Toad (Second Floor)", "Toad (Third Floor)"
        ]
        if rule_target_name in locations_with_additional_rules:
            logger.debug(f"Skipping override for {rule_target_name} - using generic analysis for additional rules")
            return None

        # Check if we have the original expression for this location
        if rule_target_name and rule_target_name in self._rule_expressions:
            rule_expr = self._rule_expressions[rule_target_name]

            # Extract cannon area from location name (e.g., "WF: Location" -> "WF")
            cannon_area = None
            if ':' in rule_target_name:
                cannon_area = rule_target_name.split(':')[0].strip()

            try:
                logger.debug(f"Overriding rule analysis for {rule_target_name}: {rule_expr}")
                return self.parse_rule_expression(rule_expr, cannon_area)
            except Exception as e:
                logger.error(f"Error parsing rule for {rule_target_name}: {rule_expr} - {e}", exc_info=True)
                # Return None to fall back to normal analysis
                return None

        # Return None to use normal analysis
        return None
