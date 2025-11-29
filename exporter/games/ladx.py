"""Links Awakening DX game-specific export handler."""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)

class LADXGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Links Awakening DX'
    """Export handler for Links Awakening DX."""

    def expand_helper(self, helper_name: str):
        """Expand game-specific helper functions for LADX."""
        # Start with generic expansion
        # Will add game-specific helpers as we discover them during testing
        return super().expand_helper(helper_name)

    def handle_complex_exit_rule(self, exit_name: str, access_rule_method):
        """
        Extract the actual condition from LADX entrance objects.

        LADX entrances store the actual condition in entrance.condition attribute,
        not in the access_rule method. We extract it directly here to avoid
        the isinstance pattern that the analyzer can't handle.
        """
        # access_rule_method is a bound method, so we can get the instance
        if hasattr(access_rule_method, '__self__'):
            entrance = access_rule_method.__self__

            # Check if this is a LinksAwakeningEntrance with a condition attribute
            if hasattr(entrance, 'condition'):
                condition = entrance.condition

                # Case 1: None = always accessible
                if condition is None:
                    logger.debug(f"LADX exit '{exit_name}' has no condition, always accessible")
                    return {'type': 'constant', 'value': True}

                # Case 2: String = item or event name
                elif isinstance(condition, str):
                    logger.debug(f"LADX exit '{exit_name}' requires item/event: {condition}")
                    return {
                        'type': 'item_check',
                        'item': condition
                    }

                # Case 3: LADXR condition object (AND/OR) - convert to rules
                else:
                    logger.debug(f"LADX exit '{exit_name}' has LADXR condition object, converting to rules")
                    converted_rule = self._convert_ladxr_condition_to_rule(condition)
                    if converted_rule:
                        return converted_rule
                    # If conversion failed, return None to use normal analysis
                    logger.warning(f"LADX exit '{exit_name}' LADXR condition conversion failed, using normal analysis")
                    return None

        # If we can't extract the condition, return None to use normal analysis
        return None

    def _convert_ladxr_condition_to_rule(self, condition) -> Optional[Dict[str, Any]]:
        """
        Convert a LADXR condition object (AND/OR) to a rule structure.

        LADXR uses AND and OR classes with private __items and __children attributes.
        We access them using Python's name mangling.
        """
        # Get the class name
        class_name = condition.__class__.__name__

        if class_name == 'OR':
            # Access private attributes using name mangling
            items = getattr(condition, '_OR__items', [])
            children = getattr(condition, '_OR__children', [])

            conditions = []
            # Add item checks
            for item in items:
                conditions.append(self._parse_ladxr_item(item))
            # Recursively convert children
            for child in children:
                child_rule = self._convert_ladxr_condition_to_rule(child)
                if child_rule:
                    conditions.append(child_rule)

            if len(conditions) == 1:
                return conditions[0]
            elif len(conditions) > 1:
                return {
                    'type': 'or',
                    'conditions': conditions
                }
            else:
                return None

        elif class_name == 'AND':
            # Access private attributes using name mangling
            items = getattr(condition, '_AND__items', [])
            children = getattr(condition, '_AND__children', [])

            conditions = []
            # Add item checks
            for item in items:
                conditions.append(self._parse_ladxr_item(item))
            # Recursively convert children
            for child in children:
                child_rule = self._convert_ladxr_condition_to_rule(child)
                if child_rule:
                    conditions.append(child_rule)

            if len(conditions) == 1:
                return conditions[0]
            elif len(conditions) > 1:
                return {
                    'type': 'and',
                    'conditions': conditions
                }
            else:
                return None

        elif class_name == 'COUNT':
            # COUNT checks if you have >= amount of an item in current inventory
            # Access private attributes using name mangling
            item = getattr(condition, '_COUNT__item', None)
            amount = getattr(condition, '_COUNT__amount', 1)

            if item is None:
                logger.warning(f"COUNT condition missing item attribute")
                return None

            # Map LADXR item name to Archipelago item name
            mapped_item = self._map_ladxr_item_name(item)

            logger.debug(f"LADX COUNT condition: {item} (mapped to {mapped_item}) >= {amount}")
            return {
                'type': 'item_check',
                'item': mapped_item,
                'count': {
                    'type': 'constant',
                    'value': amount
                }
            }

        elif class_name == 'FOUND':
            # FOUND checks if you have collected >= amount of an item total (current + used)
            # For now, treat it the same as COUNT since we don't track "used" items
            # Access private attributes using name mangling
            item = getattr(condition, '_FOUND__item', None)
            amount = getattr(condition, '_FOUND__amount', 1)

            if item is None:
                logger.warning(f"FOUND condition missing item attribute")
                return None

            # Map LADXR item name to Archipelago item name
            mapped_item = self._map_ladxr_item_name(item)

            logger.debug(f"LADX FOUND condition: {item} (mapped to {mapped_item}) >= {amount}")
            return {
                'type': 'item_check',
                'item': mapped_item,
                'count': {
                    'type': 'constant',
                    'value': amount
                }
            }

        else:
            # Unknown condition type
            logger.warning(f"Unknown LADXR condition type: {class_name}")
            return None

    def _parse_ladxr_condition_string(self, condition_str: str) -> Optional[Dict[str, Any]]:
        """
        Parse LADXR's special condition string format into rule structures.

        Formats:
        - "ITEM_NAME" -> simple item check
        - "and['ITEM1', 'ITEM2', ...]" -> and condition
        - "or['ITEM1', 'ITEM2', ...]" -> or condition
        """
        if not condition_str:
            return None

        # Check for and/or patterns
        and_match = re.match(r"and\[(.*)\]", condition_str)
        or_match = re.match(r"or\[(.*)\]", condition_str)

        if and_match:
            # Parse and condition
            items_str = and_match.group(1)
            items = [item.strip().strip("'\"") for item in items_str.split(',')]
            return {
                'type': 'and',
                'conditions': [
                    self._parse_ladxr_item(item) for item in items if item
                ]
            }
        elif or_match:
            # Parse or condition
            items_str = or_match.group(1)
            items = [item.strip().strip("'\"") for item in items_str.split(',')]
            return {
                'type': 'or',
                'conditions': [
                    self._parse_ladxr_item(item) for item in items if item
                ]
            }
        else:
            # Simple item name
            return self._parse_ladxr_item(condition_str)

    def _map_ladxr_item_name(self, item_str: str) -> str:
        """Map LADXR internal item names to Archipelago item names.

        These mappings must match the actual item names in worlds/ladx/Items.py
        """
        item_name_mapping = {
            'POWER_BRACELET': 'Progressive Power Bracelet',
            'SWORD': 'Progressive Sword',
            'SHIELD': 'Progressive Shield',
            'MAGIC_POWDER': 'Magic Powder',
            'MAGIC_ROD': 'Magic Rod',
            'OCARINA': 'Ocarina',
            'FEATHER': 'Feather',  # Not "Roc's Feather" - that's just the description
            'HOOKSHOT': 'Hookshot',
            'PEGASUS_BOOTS': 'Pegasus Boots',
            'SHOVEL': 'Shovel',
            'BOMB': 'Bomb',
            'BOOMERANG': 'Boomerang',
            'BOW': 'Bow',
            'BOWWOW': 'BowWow',
            'ROOSTER': 'Rooster',
            'FLIPPERS': 'Flippers',
            'RUPEES': 'RUPEES',  # Special case for currency
            # Small Keys - LADXR uses KEY1-KEY9 internally
            'KEY1': 'Small Key (Tail Cave)',
            'KEY2': 'Small Key (Bottle Grotto)',
            'KEY3': 'Small Key (Key Cavern)',
            'KEY4': 'Small Key (Angler\'s Tunnel)',
            'KEY5': 'Small Key (Catfish\'s Maw)',
            'KEY6': 'Small Key (Face Shrine)',
            'KEY7': 'Small Key (Eagle\'s Tower)',
            'KEY8': 'Small Key (Turtle Rock)',
            'KEY9': 'Small Key (Color Dungeon)',
            # Nightmare Keys - LADXR uses NIGHTMARE_KEY1-9 internally
            'NIGHTMARE_KEY1': 'Nightmare Key (Tail Cave)',
            'NIGHTMARE_KEY2': 'Nightmare Key (Bottle Grotto)',
            'NIGHTMARE_KEY3': 'Nightmare Key (Key Cavern)',
            'NIGHTMARE_KEY4': 'Nightmare Key (Angler\'s Tunnel)',
            'NIGHTMARE_KEY5': 'Nightmare Key (Catfish\'s Maw)',
            'NIGHTMARE_KEY6': 'Nightmare Key (Face Shrine)',
            'NIGHTMARE_KEY7': 'Nightmare Key (Eagle\'s Tower)',
            'NIGHTMARE_KEY8': 'Nightmare Key (Turtle Rock)',
            'NIGHTMARE_KEY9': 'Nightmare Key (Color Dungeon)',
            # Other special keys
            'BIRD_KEY': 'Bird Key',
            'ANGLER_KEY': 'Angler Key',
            # Ocarina Songs
            'SONG1': 'Ballad of the Wind Fish',
            'SONG2': 'Manbo\'s Mambo',
            'SONG3': 'Frog\'s Song of Soul',
            # Instruments
            'INSTRUMENT1': 'Full Moon Cello',
            'INSTRUMENT2': 'Conch Horn',
            'INSTRUMENT3': 'Sea Lily\'s Bell',
            'INSTRUMENT4': 'Surf Harp',
            'INSTRUMENT5': 'Wind Marimba',
            'INSTRUMENT6': 'Coral Triangle',
            'INSTRUMENT7': 'Organ of Evening Calm',
            'INSTRUMENT8': 'Thunder Drum',
            # Collectibles
            'SEASHELL': 'Seashell',
            'GOLD_LEAF': 'Gold Leaf',
            # Trading Quest Items
            'TRADING_ITEM_FISHING_HOOK': 'Fishing Hook',
            'TRADING_ITEM_NECKLACE': 'Necklace',
            'TRADING_ITEM_SCALE': 'Scale',
            # Add more mappings as needed
        }
        return item_name_mapping.get(item_str, item_str)

    def _parse_ladxr_item(self, item_str: str) -> Dict[str, Any]:
        """Parse a single LADXR item string into an item_check rule."""
        mapped_name = self._map_ladxr_item_name(item_str)
        return {
            'type': 'item_check',
            'item': mapped_name
        }

    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: str = None) -> Dict[str, Any]:
        """
        Post-process entrance rules to handle LADX's isinstance pattern.

        LADX entrances use isinstance(self.condition, str) to check if the condition
        is a simple string vs a complex condition object. We need to simplify this
        for JavaScript by removing the isinstance check.
        """
        if not rule:
            return rule

        # Detect the isinstance pattern used in LADX entrance access_rule methods
        if (rule.get('type') == 'conditional' and
            rule.get('test', {}).get('type') == 'helper' and
            rule.get('test', {}).get('name') == 'isinstance'):

            args = rule.get('test', {}).get('args', [])
            if len(args) >= 2 and args[1].get('type') == 'name' and args[1].get('name') == 'str':
                # This is checking isinstance(something, str)
                first_arg = args[0]

                # Case 1: isinstance(self.condition, str) - can't resolve at export time
                if (first_arg.get('type') == 'attribute' and
                    first_arg.get('attr') == 'condition'):
                    logger.debug(f"LADX entrance '{entrance_name}' uses isinstance(self.condition, str), treating as always accessible")
                    return None

                # Case 2: isinstance(constant, str) - can evaluate at export time
                elif first_arg.get('type') == 'constant':
                    # The constant has been resolved, so isinstance check would be True
                    # The constant value might be in LADXR format (e.g., "and['ITEM1', 'ITEM2']")
                    # Parse it and return the resulting rule
                    constant_value = first_arg.get('value')
                    if isinstance(constant_value, str):
                        parsed_rule = self._parse_ladxr_condition_string(constant_value)
                        if parsed_rule:
                            logger.debug(f"LADX entrance '{entrance_name}' parsed LADXR condition: {constant_value}")
                            return parsed_rule

                    # If parsing failed or not a string, fall back to the if_true branch
                    if_true = rule.get('if_true')
                    logger.debug(f"LADX entrance '{entrance_name}' uses isinstance on constant, simplifying to if_true branch")
                    return self._postprocess_rule_recursive(if_true) if if_true else None

        # For other rule types, continue with standard recursive postprocessing
        return self._postprocess_rule_recursive(rule)

    def _postprocess_rule_recursive(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively postprocess nested rule structures."""
        if not rule or not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Map LADXR item names to Archipelago names in item_check rules
        if rule_type == 'item_check' and 'item' in rule:
            item_name = rule['item']
            if isinstance(item_name, str):
                mapped_name = self._map_ladxr_item_name(item_name)
                if mapped_name != item_name:
                    logger.debug(f"Mapped item name: {item_name} -> {mapped_name}")
                    rule['item'] = mapped_name

        # Process nested conditions
        if rule_type in ['and', 'or'] and 'conditions' in rule:
            rule['conditions'] = [
                self._postprocess_rule_recursive(cond)
                for cond in rule['conditions']
            ]
        elif rule_type == 'not' and 'condition' in rule:
            rule['condition'] = self._postprocess_rule_recursive(rule['condition'])
        elif rule_type == 'conditional':
            if 'test' in rule:
                rule['test'] = self._postprocess_rule_recursive(rule['test'])
            if 'if_true' in rule:
                rule['if_true'] = self._postprocess_rule_recursive(rule['if_true'])
            if 'if_false' in rule:
                rule['if_false'] = self._postprocess_rule_recursive(rule['if_false'])

        return rule

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts LADX-specific game settings for export."""
        settings_dict = super().get_settings_data(world, multiworld, player)
        settings_dict['use_resolved_items'] = True
        return settings_dict
