"""The Messenger game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)

class MessengerGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'The Messenger'

    def __init__(self, world=None):
        super().__init__()
        self.world = world

    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Expand rules with special handling for location dependency patterns and shop capabilities.

        Detects the pattern: state.multiworld.get_location(location_name, player).can_reach(state)
        And converts it to: {"type": "location_check", "location": location_name}

        Also detects "shop" capability rules and converts them to Shards item checks.
        """
        if not rule:
            return rule

        # First, call parent implementation to handle standard expansion and recursion
        rule = super().expand_rule(rule)

        # After parent processing, check for patterns we need to transform

        # Detect location dependency pattern:
        # {type: "function_call", function: {type: "attribute", attr: "can_reach",
        #   object: {type: "function_call", function: {type: "attribute", attr: "get_location",
        #     object: {type: "attribute", attr: "multiworld",
        #       object: {type: "name", name: "state"}}}}}}

        if (rule.get('type') == 'function_call' and
            rule.get('function', {}).get('type') == 'attribute' and
            rule.get('function', {}).get('attr') == 'can_reach'):

            func = rule.get('function', {})
            obj = func.get('object', {})

            # Check if this is a get_location call
            if (obj.get('type') == 'function_call' and
                obj.get('function', {}).get('type') == 'attribute' and
                obj.get('function', {}).get('attr') == 'get_location'):

                get_loc_func = obj.get('function', {})
                multiworld_obj = get_loc_func.get('object', {})

                # Check if this is state.multiworld
                if (multiworld_obj.get('type') == 'attribute' and
                    multiworld_obj.get('attr') == 'multiworld' and
                    multiworld_obj.get('object', {}).get('type') == 'name' and
                    multiworld_obj.get('object', {}).get('name') == 'state'):

                    # Extract the location name from the args
                    location_args = obj.get('args', [])
                    if location_args and len(location_args) > 0:
                        location_name_rule = location_args[0]

                        logger.debug(f"Detected location dependency pattern, converting to location_check for: {location_name_rule}")

                        # Return a location_check rule
                        return {
                            'type': 'location_check',
                            'location': location_name_rule
                        }

        # Detect and expand helper functions that are inferred as items/capabilities
        # has_vertical: self.has_wingsuit(state) or self.has_dart(state)
        if rule.get('type') == 'item_check' and rule.get('inferred') and rule.get('item') == 'Vertical':
            logger.debug("Detected has_vertical helper, converting to Wingsuit OR Rope Dart check")
            return {
                'type': 'or',
                'conditions': [
                    {
                        'type': 'item_check',
                        'item': {'type': 'constant', 'value': 'Wingsuit'}
                    },
                    {
                        'type': 'item_check',
                        'item': {'type': 'constant', 'value': 'Rope Dart'}
                    }
                ]
            }

        # has_dart: state.has("Rope Dart", player)
        if rule.get('type') == 'item_check' and rule.get('inferred') and rule.get('item') == 'Dart':
            logger.debug("Detected has_dart helper, converting to Rope Dart check")
            return {
                'type': 'item_check',
                'item': {'type': 'constant', 'value': 'Rope Dart'}
            }

        # has_tabi: state.has("Lightfoot Tabi", player)
        if rule.get('type') == 'item_check' and rule.get('inferred') and rule.get('item') == 'Tabi':
            logger.debug("Detected has_tabi helper, converting to Lightfoot Tabi check")
            return {
                'type': 'item_check',
                'item': {'type': 'constant', 'value': 'Lightfoot Tabi'}
            }

        # Detect and expand generic helper functions
        # is_aerobatic: self.has_wingsuit(state) and state.has("Aerobatics Warrior", player)
        if rule.get('type') == 'generic_helper' and rule.get('name') == 'is_aerobatic':
            logger.debug("Detected is_aerobatic helper, converting to Wingsuit AND Aerobatics Warrior check")
            return {
                'type': 'and',
                'conditions': [
                    {
                        'type': 'item_check',
                        'item': {'type': 'constant', 'value': 'Wingsuit'}
                    },
                    {
                        'type': 'item_check',
                        'item': {'type': 'constant', 'value': 'Aerobatics Warrior'}
                    }
                ]
            }

        # Detect and expand capability rules for Messenger-specific abilities
        if rule.get('type') == 'capability':
            capability = rule.get('capability')

            # can_destroy_projectiles: state.has("Strike of the Ninja", player)
            if capability == 'destroy_projectiles':
                logger.debug("Detected can_destroy_projectiles capability, converting to Strike of the Ninja check")
                return {
                    'type': 'item_check',
                    'item': {'type': 'constant', 'value': 'Strike of the Ninja'}
                }

            # can_shop: state.has("Shards", player, self.maximum_price)
            if capability == 'shop':
                # Calculate maximum_price the same way MessengerRules does
                # maximum_price = min(cost_of_demons_bane + cost_of_focused_power, world.total_shards)
                if self.world:
                    try:
                        # Get the costs from the shop locations
                        demons_bane = self.world.multiworld.get_location("The Shop - Demon's Bane", self.world.player)
                        focused_power = self.world.multiworld.get_location("The Shop - Focused Power Sense", self.world.player)

                        max_shop_price = demons_bane.cost + focused_power.cost
                        maximum_price = min(max_shop_price, self.world.total_shards)

                        logger.debug(f"Detected can_shop capability, converting to Shards check with count={maximum_price}")

                        return {
                            'type': 'item_check',
                            'item': {
                                'type': 'constant',
                                'value': 'Shards'
                            },
                            'count': {
                                'type': 'constant',
                                'value': maximum_price
                            }
                        }
                    except Exception as e:
                        logger.warning(f"Could not calculate maximum_price for can_shop: {e}")

            # can_dboost: state.has_any({"Path of Resilience", "Meditation"}, player) and state.has("Second Wind", player)
            elif capability == 'dboost':
                logger.debug("Detected can_dboost capability, converting to item checks")
                return {
                    'type': 'and',
                    'conditions': [
                        {
                            'type': 'or',
                            'conditions': [
                                {
                                    'type': 'item_check',
                                    'item': {'type': 'constant', 'value': 'Path of Resilience'}
                                },
                                {
                                    'type': 'item_check',
                                    'item': {'type': 'constant', 'value': 'Meditation'}
                                }
                            ]
                        },
                        {
                            'type': 'item_check',
                            'item': {'type': 'constant', 'value': 'Second Wind'}
                        }
                    ]
                }

            # can_double_dboost: state.has_all({"Path of Resilience", "Meditation", "Second Wind"}, player)
            elif capability == 'double_dboost':
                logger.debug("Detected can_double_dboost capability, converting to item checks")
                return {
                    'type': 'and',
                    'conditions': [
                        {
                            'type': 'item_check',
                            'item': {'type': 'constant', 'value': 'Path of Resilience'}
                        },
                        {
                            'type': 'item_check',
                            'item': {'type': 'constant', 'value': 'Meditation'}
                        },
                        {
                            'type': 'item_check',
                            'item': {'type': 'constant', 'value': 'Second Wind'}
                        }
                    ]
                }

        # For and/or rules, recursively expand conditions to catch nested capability rules
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]

        return rule

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """
        Export progression mapping for Time Shards -> Shards accumulation.

        In Python, when a Time Shard item is collected, the world.collect() method
        adds its value to a virtual "Shards" item using state.add_item("Shards", value).

        We replicate this using the progression_mapping system with type="additive".
        """
        mapping = {}

        # Get all Time Shard items and their values
        time_shard_items = {}

        # Add all standard Time Shard items with their values
        time_shard_variants = [
            ("Time Shard", 1),
            ("Time Shard (10)", 10),
            ("Time Shard (50)", 50),
            ("Time Shard (100)", 100),
            ("Time Shard (300)", 300),
            ("Time Shard (500)", 500),
        ]

        for item_name, value in time_shard_variants:
            time_shard_items[item_name] = value

        if time_shard_items:
            mapping["Shards"] = {
                "type": "additive",
                "items": time_shard_items,
                "base_item": "Shards"
            }
            logger.debug(f"Created progression mapping for Shards with {len(time_shard_items)} Time Shard items")

        return mapping

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """
        Get game-specific location attributes to include in the export.
        For Messenger, this includes shop costs for shop locations.
        """
        attributes = {}

        # Check if this is a shop location by looking for 'cost' attribute
        if hasattr(location, 'cost'):
            try:
                cost = location.cost
                attributes['cost'] = cost
                logger.debug(f"Exported cost {cost} for shop location {location.name}")
            except Exception as e:
                logger.warning(f"Could not get cost for location {location.name}: {e}")

        return attributes

    def get_custom_location_access_rule(self, location, world):
        """
        Provide custom access rule for Messenger shop locations.

        Shop locations have an access_rule method that returns a 'can_afford' variable,
        which is defined as: state.has("Shards", player, min(self.cost, world.total_shards))

        We replace this with a direct item_check rule for "Shards" with the appropriate count.
        """
        # Check if this is a shop location with a cost attribute
        if hasattr(location, 'cost'):
            try:
                cost = location.cost
                total_shards = world.total_shards if hasattr(world, 'total_shards') else 0
                required_shards = min(cost, total_shards)

                logger.debug(f"Shop location {location.name}: cost={cost}, total_shards={total_shards}, required={required_shards}")

                # Return a custom rule that checks for the required number of shards
                return {
                    'type': 'item_check',
                    'item': {
                        'type': 'constant',
                        'value': 'Shards'
                    },
                    'count': {
                        'type': 'constant',
                        'value': required_shards
                    }
                }
            except Exception as e:
                logger.warning(f"Could not create custom access rule for shop location {location.name}: {e}")
                return None

        # For non-shop locations, return None to use the default access rule
        return None
