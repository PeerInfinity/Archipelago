"""SMZ3 game-specific export handler.

SMZ3 (Super Metroid & A Link to the Past Crossover) uses the TotalSMZ3 library
which has its own Region and Progression classes with complex game logic.
This exporter handles the conversion of SMZ3-specific patterns to JavaScript-compatible rules.
"""

from typing import Dict, Any, Optional
from .generic import GenericGameExportHandler
import logging
import inspect

logger = logging.getLogger(__name__)


class SMZ3GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'SMZ3'

    def __init__(self):
        super().__init__()
        logger.info("SMZ3 exporter initialized")
        with open('/tmp/smz3_debug.log', 'a') as f:
            f.write("SMZ3 exporter __init__ called\n")

    def get_progression_mapping(self, world) -> Dict[str, Any]:
        """
        Export progressive item mappings for SMZ3.

        SMZ3 includes ALTTP content, so we export the ALTTP progressive item mappings.
        This allows the frontend to properly handle items like:
        - Progressive Sword -> Fighter Sword, Master Sword, Tempered Sword, Golden Sword
        - Progressive Glove -> Power Glove, Titan's Mitt
        - Progressive Shield -> Fighter Shield, Fire Shield, Mirror Shield
        - Progressive Bow -> Bow, Silver Bow
        - Progressive Mail -> Blue Mail, Red Mail
        """
        # Define the progressive item mappings based on ALTTP
        # Format: { base_item: { items: [ { name, level }, ... ] } }
        mapping_data = {
            'ProgressiveSword': {
                'base_item': 'ProgressiveSword',
                'items': [
                    {'name': 'Fighter Sword', 'level': 1, 'provides': ['Fighter Sword']},
                    {'name': 'Master Sword', 'level': 2, 'provides': ['Master Sword', 'MasterSword']},
                    {'name': 'Tempered Sword', 'level': 3, 'provides': ['Tempered Sword', 'TemperedSword']},
                    {'name': 'Golden Sword', 'level': 4, 'provides': ['Golden Sword', 'GoldenSword']}
                ]
            },
            'ProgressiveGlove': {
                'base_item': 'ProgressiveGlove',
                'items': [
                    {'name': 'Power Glove', 'level': 1, 'provides': ['Power Glove', 'PowerGlove']},
                    {'name': 'Titan\'s Mitt', 'level': 2, 'provides': ['Titan\'s Mitt', 'TitansMitt']}
                ]
            },
            'ProgressiveShield': {
                'base_item': 'ProgressiveShield',
                'items': [
                    {'name': 'Fighter Shield', 'level': 1, 'provides': ['Fighter Shield']},
                    {'name': 'Fire Shield', 'level': 2, 'provides': ['Fire Shield']},
                    {'name': 'Mirror Shield', 'level': 3, 'provides': ['Mirror Shield']}
                ]
            },
            'ProgressiveBow': {
                'base_item': 'ProgressiveBow',
                'items': [
                    {'name': 'Bow', 'level': 1, 'provides': ['Bow']},
                    {'name': 'Silver Bow', 'level': 2, 'provides': ['Silver Bow', 'Silver Arrows']}
                ]
            },
            'ProgressiveTunic': {
                'base_item': 'ProgressiveTunic',
                'items': [
                    {'name': 'Blue Mail', 'level': 1, 'provides': ['Blue Mail', 'BlueMail']},
                    {'name': 'Red Mail', 'level': 2, 'provides': ['Red Mail', 'RedMail']}
                ]
            }
        }

        # Note: Progressive Bow (Alt) not needed for SMZ3

        logger.info(f"Exported {len(mapping_data)} progressive item types for SMZ3")
        return mapping_data

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Override to fix item classifications.

        Some items are marked as non-advancement (filler) by the game's ItemPool logic,
        but they're still needed for progression and should be marked as advancement
        so the frontend properly tracks them during spoiler tests.
        """
        # Get base item data from parent class
        item_data = super().get_item_data(world)

        # List of Super Metroid security card items that should be advancement
        card_items = [
            'CardCrateriaL1', 'CardCrateriaL2', 'CardCrateriaBoss',
            'CardBrinstarL1', 'CardBrinstarL2', 'CardBrinstarBoss',
            'CardNorfairL1', 'CardNorfairL2', 'CardNorfairBoss',
            'CardMaridiaL1', 'CardMaridiaL2', 'CardMaridiaBoss',
            'CardWreckedShipL1', 'CardWreckedShipBoss',
            'CardLowerNorfairL1', 'CardLowerNorfairBoss'
        ]

        # Mark Card items as advancement (they gate access to locations)
        for card_name in card_items:
            if card_name in item_data:
                item_data[card_name]['advancement'] = True
                logger.info(f"Marked {card_name} as advancement item")

        # Mark progressive items as advancement - these can be marked as non-advancement
        # by the ItemPool when there are duplicates, but they're still progression items
        # that gate access to regions (e.g., ProgressiveSword gates Castle Tower)
        progressive_items = [
            'ProgressiveSword', 'ProgressiveGlove', 'ProgressiveShield',
            'ProgressiveBow', 'ProgressiveTunic'
        ]

        for prog_item in progressive_items:
            if prog_item in item_data:
                item_data[prog_item]['advancement'] = True
                logger.info(f"Marked {prog_item} as advancement item")

        # Mark Bottle as advancement - it gates access to locations like "Sick Kid"
        # and may be placed as non-advancement (filler) by the item pool
        if 'Bottle' in item_data:
            item_data['Bottle']['advancement'] = True
            logger.info("Marked Bottle as advancement item")

        return item_data

    def post_process_location_data(self, location_data: Dict[str, Any], location_name: str) -> Dict[str, Any]:
        """
        Post-process location data to fix advancement flags on placed items.

        Some items like ProgressiveSword may be placed as non-advancement (filler)
        in some locations, but they're still progression items that gate access.
        This ensures the frontend correctly tracks these items during spoiler tests.
        """
        # Items that should always be marked as advancement regardless of placement
        always_advancement_items = {
            'ProgressiveSword', 'ProgressiveGlove', 'ProgressiveShield',
            'ProgressiveBow', 'ProgressiveTunic', 'Bottle'
        }

        if location_data.get('item'):
            item_name = location_data['item'].get('name')
            if item_name in always_advancement_items:
                if not location_data['item'].get('advancement'):
                    logger.info(f"Marking {item_name} at '{location_name}' as advancement")
                    location_data['item']['advancement'] = True

        return location_data

    def get_settings_data(self, world, multiworld, player: int) -> Dict[str, Any]:
        """
        Override to add SMZ3-specific reward data to settings.

        This exports which reward (pendant/crystal) is assigned to which dungeon,
        which is necessary for evaluating CanAcquire() rules.

        Also exports allow_regressive_accessibility_mismatches setting to handle
        the semantic difference between Python's cumulative sphere calculation
        and the frontend's real-time rule evaluation for anti-softlock key logic.
        """
        # Get base settings from parent class
        settings = super().get_settings_data(world, multiworld, player)

        # SMZ3 has anti-softlock logic where acquiring certain items (Bow+Hammer+Lamp)
        # INCREASES the key requirements for Palace of Darkness locations. This creates
        # a semantic mismatch:
        # - Python sphere calculation: Cumulative (once accessible, always accessible)
        # - Frontend evaluation: Real-time (current inventory determines accessibility)
        #
        # When enabled, the spoiler test will treat "accessible in LOG but not in STATE"
        # as an acceptable mismatch (warning instead of error) for locations that may
        # have regressive accessibility due to anti-softlock key requirements.
        settings['allow_regressive_accessibility_mismatches'] = True

        # SMZ3's Python Progression class uses boolean flags for items like PowerBomb
        # and TwoPowerBombs. The TwoPowerBombs flag is set to True when you've collected
        # at least 2 PowerBomb items, regardless of whether they're marked as advancement.
        # Since filler PowerBombs still contribute to the count for logic purposes,
        # we need to count all items (not just advancement) in spoiler test mode.
        settings['count_non_advancement_items'] = True

        logger.info(f"Getting settings data for SMZ3 world")
        logger.info(f"World type: {type(world)}")
        logger.info(f"World attributes: {dir(world)[:10]}")  # First 10 attributes

        try:
            # Import RewardType to check for IReward regions
            from worlds.smz3.TotalSMZ3.Region import IReward

            # Get the TotalSMZ3 world (not the Archipelago wrapper)
            if not hasattr(world, 'smz3World'):
                logger.warning(f"SMZ3 world does not have smz3World attribute, cannot export rewards. Available attrs: {[a for a in dir(world) if not a.startswith('_')][:20]}")
                return settings

            smz3_world = world.smz3World
            logger.info(f"Found smz3World: {type(smz3_world)}")

            # Get all regions that have rewards
            reward_regions = {}
            for region in smz3_world.Regions:
                # Check if this region implements IReward (has a Reward attribute)
                if hasattr(region, 'Reward') and isinstance(region, IReward):
                    reward = region.Reward
                    # Get the reward value (enum int value)
                    reward_value = reward.value if hasattr(reward, 'value') else 0

                    if reward_value != 0:  # Skip Null rewards
                        region_name = region.Name if hasattr(region, 'Name') else str(region)
                        reward_regions[region_name] = {
                            'reward_type': reward_value,
                            'reward_name': reward.name if hasattr(reward, 'name') else str(reward)
                        }
                        logger.info(f"Region '{region_name}' has reward: {reward.name} (value={reward_value})")

            if reward_regions:
                logger.info(f"Exported {len(reward_regions)} reward regions for SMZ3")
                settings['reward_regions'] = reward_regions

        except Exception as e:
            logger.error(f"Error exporting SMZ3 reward data: {e}")
            logger.exception(e)

        return settings

    def _handle_medallion_entrance(self, region_object, entrance_name: str) -> Optional[Dict[str, Any]]:
        """
        Handle entrances to dungeons that require medallions (Misery Mire, Turtle Rock).

        These dungeons have a CanEnter method that checks self.Medallion against enum values.
        We need to convert this to a rule that checks for the actual medallion item.

        Args:
            region_object: The TotalSMZ3 Region object
            entrance_name: Name of the entrance

        Returns:
            Analyzed rule dict with medallion check
        """
        from exporter.analyzer import analyze_rule

        # Get the medallion enum value (0=Bombos, 1=Ether, 2=Quake)
        medallion = region_object.Medallion
        medallion_names = ['Bombos', 'Ether', 'Quake']

        # Get the actual medallion value (it's an enum)
        if hasattr(medallion, 'value'):
            medallion_value = medallion.value
        else:
            medallion_value = int(medallion) if isinstance(medallion, int) else 0

        medallion_item = medallion_names[medallion_value]
        logger.info(f"Medallion requirement for '{entrance_name}': {medallion_item} (value={medallion_value})")

        # Build the medallion check
        medallion_rule = {
            'type': 'item_check',
            'item': medallion_item
        }

        # For Misery Mire: Sword, MoonPearl, (Boots or Hookshot), and can enter Dark World Mire
        # For Turtle Rock: Sword, MoonPearl, CanLiftHeavy, Hammer, Somaria, and can enter Light World Death Mountain East

        # Common requirements for both
        common_requirements = [
            medallion_rule,
            {'type': 'item_check', 'item': 'ProgressiveSword'},
            {'type': 'item_check', 'item': 'MoonPearl'}
        ]

        # Region-specific requirements
        region_name = region_object.Name
        if region_name == "Misery Mire":
            # Boots OR Hookshot
            specific_requirements = [
                {
                    'type': 'or',
                    'conditions': [
                        {'type': 'item_check', 'item': 'Boots'},
                        {'type': 'item_check', 'item': 'Hookshot'}
                    ]
                },
                # Can enter Dark World Mire (this will be a region check)
                {'type': 'region_check', 'region': 'Dark World Mire'}
            ]
        elif region_name == "Turtle Rock":
            # CanLiftHeavy, Hammer, Somaria
            specific_requirements = [
                {'type': 'helper', 'name': 'smz3_CanLiftHeavy', 'args': []},
                {'type': 'item_check', 'item': 'Hammer'},
                {'type': 'item_check', 'item': 'Somaria'},
                # Can enter Light World Death Mountain East (this will be a region check)
                {'type': 'region_check', 'region': 'Light World Death Mountain East'}
            ]
        else:
            logger.warning(f"Unknown medallion dungeon: {region_name}")
            return None

        # Combine all requirements with AND
        all_requirements = common_requirements + specific_requirements

        result = {
            'type': 'and',
            'conditions': all_requirements
        }

        logger.info(f"Built medallion entrance rule for '{entrance_name}'")
        return result

    def _handle_entrance_rule(self, rule_func, entrance_name: str) -> Optional[Dict[str, Any]]:
        """
        Handle SMZ3 entrance rules by extracting the region's CanEnter method.

        SMZ3 entrance rules have signature: lambda state, region=region: region.CanEnter(state.smz3state[player])
        We extract the region object and analyze its CanEnter method.

        Args:
            rule_func: The entrance rule function
            entrance_name: Name of the entrance (e.g., "Menu->Castle Tower")

        Returns:
            Analyzed rule dict, or None to fall back to standard analysis
        """
        logger.info(f"Processing entrance: {entrance_name}")

        # Try to extract the 'region' object from default arguments
        region_object = None
        if hasattr(rule_func, '__code__') and hasattr(rule_func, '__defaults__'):
            arg_names = rule_func.__code__.co_varnames[:rule_func.__code__.co_argcount]
            defaults = rule_func.__defaults__ or ()

            logger.info(f"Entrance args for {entrance_name}: {arg_names}, defaults: {len(defaults)}")

            # SMZ3 entrance rules have signature: lambda state, region=region: ...
            if len(arg_names) >= 2 and 'region' in arg_names:
                region_index = list(arg_names).index('region')
                defaults_offset = len(arg_names) - len(defaults)
                if region_index >= defaults_offset:
                    region_object = defaults[region_index - defaults_offset]
                    logger.info(f"Found 'region' object from defaults: {type(region_object)}")

        if not region_object:
            logger.info(f"No 'region' object found in defaults for {entrance_name}")
            return None

        # Check if this looks like a TotalSMZ3 Region object
        has_can_enter = hasattr(region_object, 'CanEnter')
        logger.info(f"region_object attributes - CanEnter: {has_can_enter}, type: {type(region_object)}")

        if not has_can_enter:
            logger.info(f"Not a TotalSMZ3 Region object for {entrance_name}")
            return None

        logger.info(f"Found TotalSMZ3 Region object for '{entrance_name}', extracting CanEnter logic")

        # Check if this region requires a medallion (Misery Mire or Turtle Rock)
        has_medallion = hasattr(region_object, 'Medallion') and region_object.Medallion is not None

        if has_medallion:
            logger.info(f"Region '{entrance_name}' has medallion requirement: {region_object.Medallion}")
            # Handle medallion-based entrance specially
            return self._handle_medallion_entrance(region_object, entrance_name)

        # Extract and analyze the CanEnter method
        try:
            can_enter_func = region_object.CanEnter

            # Import the analyzer here to avoid circular imports
            from exporter.analyzer import analyze_rule

            # Analyze the CanEnter function
            # This function has signature: lambda items: <requirements>
            # where items is a TotalSMZ3 Progression object
            analyzed_rule = analyze_rule(can_enter_func)

            if analyzed_rule:
                logger.info(f"Successfully extracted entrance logic for '{entrance_name}'")
                return analyzed_rule
            else:
                logger.warning(f"Failed to analyze CanEnter for '{entrance_name}', falling back to default")
                return None

        except Exception as e:
            logger.error(f"Error analyzing TotalSMZ3 entrance logic for '{entrance_name}': {e}")
            return None

    def override_rule_analysis(self, rule_func, rule_target_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Override rule analysis for SMZ3-specific patterns.

        This method is called before the standard rule analysis. It handles:
        1. Location access rules that use loc.Available()
        2. Entrance rules that use region.CanEnter()

        Returns None to fall back to standard analysis, or a dict with the analyzed rule.
        """
        # Only handle rules with a target name
        if not rule_target_name:
            return None

        # Skip item rules
        if "Item Rule" in str(rule_target_name):
            return None

        # Handle entrance rules (contain "->")
        if "->" in str(rule_target_name):
            return self._handle_entrance_rule(rule_func, rule_target_name)

        logger.info(f"Processing location: {rule_target_name}")

        # Try to extract the 'loc' object from default arguments (SMZ3 uses lambda state, loc=loc: ...)
        loc_object = None
        if hasattr(rule_func, '__code__') and hasattr(rule_func, '__defaults__'):
            # Get the parameter names
            arg_names = rule_func.__code__.co_varnames[:rule_func.__code__.co_argcount]
            defaults = rule_func.__defaults__ or ()

            # SMZ3 location rules have signature: lambda state, loc=loc: ...
            # So 'loc' should be the second parameter with a default value
            if len(arg_names) >= 2 and 'loc' in arg_names:
                loc_index = list(arg_names).index('loc')
                # Defaults are aligned to the end of the parameter list
                # If we have 2 params and 1 default, the default is for the last param
                defaults_offset = len(arg_names) - len(defaults)
                if loc_index >= defaults_offset:
                    loc_object = defaults[loc_index - defaults_offset]

        if not loc_object:
            return None

        # Check if this looks like a TotalSMZ3 Location object
        has_can_access = hasattr(loc_object, 'canAccess')
        has_available = hasattr(loc_object, 'Available')
        logger.info(f"loc_object attributes - canAccess: {has_can_access}, Available: {has_available}, type: {type(loc_object)}")

        if not has_available:
            logger.info(f"Not a TotalSMZ3 Location object for {rule_target_name}")
            return None

        logger.info(f"Found TotalSMZ3 Location object for '{rule_target_name}', extracting Available logic")

        # Now we have the TotalSMZ3 Location object!
        # The Available method is: return self.Region.CanEnter(items) and self.canAccess(items)
        # We want to extract just the canAccess function, not the full Available method
        # because the region accessibility is handled separately
        try:
            # Import the analyzer here to avoid circular imports
            from exporter.analyzer import analyze_rule

            # Extract the canAccess lambda from the location object
            # This contains the location-specific access requirements
            can_access_func = loc_object.canAccess

            logger.info(f"Analyzing canAccess function for '{rule_target_name}'")

            # Store the region name and location object so postprocess_rule can use them
            # to inline region-specific methods like CanBeatBoss and resolve GetLocation().ItemIs()
            self._current_location_region = loc_object.Region.Name if hasattr(loc_object, 'Region') else None
            self._current_location_object = loc_object
            self._current_location_name = rule_target_name

            # Analyze the canAccess function
            # This function has signature: lambda items: <requirements>
            # where items is a TotalSMZ3 Progression object
            analyzed_rule = analyze_rule(can_access_func)

            if analyzed_rule:
                # Log the analyzed rule to see what we got
                logger.info(f"Analyzed rule for '{rule_target_name}' in region '{self._current_location_region}': {analyzed_rule}")
                # Post-process the rule while _current_location_region is still set
                # This allows us to inline region-specific logic like CanBeatBoss
                analyzed_rule = self.postprocess_rule(analyzed_rule)
                logger.info(f"Post-processed rule for '{rule_target_name}': {analyzed_rule}")
                logger.info(f"Successfully extracted and post-processed location logic for '{rule_target_name}'")
                return analyzed_rule
            else:
                logger.warning(f"Failed to analyze canAccess for '{rule_target_name}', falling back to default")
                return None

        except Exception as e:
            logger.error(f"Error analyzing TotalSMZ3 location logic for '{rule_target_name}': {e}")
            logger.exception(e)  # Log full traceback
            return None
        finally:
            self._current_location_region = None
            self._current_location_object = None
            self._current_location_name = None

    def postprocess_rule(self, rule: Dict[str, Any], simplify_nested_regressive: bool = False) -> Dict[str, Any]:
        """
        Post-process SMZ3 rules to handle TotalSMZ3-specific patterns.

        Specifically handles:
        1. region.CanEnter(state.smz3state[player]) patterns
        2. loc.Available(state.smz3state[player]) patterns (if override_rule_analysis didn't handle it)
        3. Custom smz3state collection state access
        4. Convert "items" variable references to proper state lookups
        5. Regressive accessibility simplification

        Args:
            rule: The rule to process
            simplify_nested_regressive: If True, simplify regressive conditionals in this subtree.
                                       This flag is set when we resolve an ItemIs conditional to a constant,
                                       indicating that nested conditionals represent anti-softlock logic
                                       for a known item placement and should be simplified.
        """
        if not isinstance(rule, dict):
            return rule

        # Handle attribute access patterns
        if rule.get('type') == 'attribute':
            obj = rule.get('object')
            attr = rule.get('attr')

            # Handle items.AttributeName - convert to item check
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'items':
                logger.debug(f"Converting items.{attr} to item_check")
                return {
                    'type': 'item_check',
                    'item': attr
                }

            # Handle self.AttributeName - try to resolve to static data or constant
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'self':
                # For SMZ3-specific config attributes, convert to constant values
                # Assume Normal logic (0) as default since that's most common
                if attr == 'Logic':
                    logger.debug(f"Converting self.Logic to constant value 0 (Normal)")
                    return {
                        'type': 'constant',
                        'value': 0
                    }
                # For other self attributes, log a warning and return constant True
                # Note: self.world is also converted to constant True, and the
                # GetLocation().Available() pattern is detected later at the function_call level
                logger.debug(f"Converting self.{attr} to constant True (unknown attribute)")
                return {
                    'type': 'constant',
                    'value': True
                    }

            # Handle SMLogic.AttributeName - convert enum values to constants
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'SMLogic':
                # Convert SMLogic enum values to their integer equivalents
                if attr == 'Normal':
                    logger.debug(f"Converting SMLogic.Normal to constant value 0")
                    return {
                        'type': 'constant',
                        'value': 0
                    }
                elif attr == 'Hard':
                    logger.debug(f"Converting SMLogic.Hard to constant value 1")
                    return {
                        'type': 'constant',
                        'value': 1
                    }
                # Unknown SMLogic value
                logger.warning(f"Unknown SMLogic attribute: {attr}, defaulting to 0")
                return {
                    'type': 'constant',
                    'value': 0
                }

            # Handle RewardType.AttributeName - convert enum values to constants
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'RewardType':
                # RewardType enum values (bit flags)
                reward_type_values = {
                    'Null': 0,
                    'Agahnim': 1,
                    'PendantGreen': 2,
                    'PendantNonGreen': 4,
                    'CrystalBlue': 8,
                    'CrystalRed': 16,
                    'BossTokenKraid': 32,
                    'BossTokenPhantoon': 64,
                    'BossTokenDraygon': 128,
                    'BossTokenRidley': 256,
                    'AnyPendant': 6,  # PendantGreen | PendantNonGreen
                    'AnyCrystal': 24,  # CrystalBlue | CrystalRed
                    'AnyBossToken': 480  # All boss tokens
                }

                if attr in reward_type_values:
                    logger.debug(f"Converting RewardType.{attr} to constant value {reward_type_values[attr]}")
                    return {
                        'type': 'constant',
                        'value': reward_type_values[attr]
                    }
                else:
                    logger.warning(f"Unknown RewardType attribute: {attr}, defaulting to 0")
                    return {
                        'type': 'constant',
                        'value': 0
                    }

            # Handle ItemType.AttributeName - convert to constant with the attribute name as value
            # This is used in GetLocation().ItemIs(ItemType.X) patterns
            if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'ItemType':
                logger.debug(f"Converting ItemType.{attr} to constant value '{attr}'")
                return {
                    'type': 'constant',
                    'value': attr
                }

            # Recursively process the object part of attribute access
            rule['object'] = self.postprocess_rule(obj)

        # Handle region.CanEnter() and loc.Available() patterns
        # These appear as: {type: "function_call", function: {type: "attribute", object: {type: "name", name: "region"/"loc"}, attr: "CanEnter"/"Available"}, args: [...]}
        if (rule.get('type') == 'function_call' and
            isinstance(rule.get('function'), dict)):

            func = rule['function']

            # Check if this is region.CanEnter pattern
            if (func.get('type') == 'attribute' and
                func.get('attr') == 'CanEnter' and
                isinstance(func.get('object'), dict) and
                func['object'].get('type') == 'name' and
                func['object'].get('name') == 'region'):

                logger.debug("Found region.CanEnter pattern - converting to helper call")

                # Convert to a helper function call
                # The helper will need access to the region name and the state
                # For now, we'll create a helper that always returns true
                # TODO: Implement proper SMZ3 region logic in JavaScript helpers
                return {
                    'type': 'helper',
                    'name': 'smz3_can_enter_region',
                    'args': []
                }

            # Check if this is loc.Available pattern
            if (func.get('type') == 'attribute' and
                func.get('attr') == 'Available' and
                isinstance(func.get('object'), dict) and
                func['object'].get('type') == 'name' and
                func['object'].get('name') == 'loc'):

                logger.debug("Found loc.Available pattern - this should have been handled by override_rule_analysis")

                # This should have been handled by override_rule_analysis
                # If we get here, something went wrong, so fall back to constant true
                return {
                    'type': 'constant',
                    'value': True
                }

        # Handle function calls
        if rule.get('type') == 'function_call':
            func = rule.get('function')
            args = rule.get('args', [])

            # Filter out 'items' name arguments (JavaScript helpers get items from snapshot)
            filtered_args = [arg for arg in args if not (isinstance(arg, dict) and arg.get('type') == 'name' and arg.get('name') == 'items')]

            if isinstance(func, dict) and func.get('type') == 'attribute':
                obj = func.get('object')
                method_name = func.get('attr')

                # Handle world.GetLocation(location).Available() pattern
                # Pattern: self.world.GetLocation("Space Jump").Available(items)
                # This checks if a specific location is accessible with current items
                # Convert to a location_accessible rule for runtime evaluation
                if method_name == 'Available':
                    # Check if this is world.GetLocation().Available() or GetLocation().Available()
                    inner_func = None
                    inner_obj = None
                    if isinstance(obj, dict) and obj.get('type') == 'function_call':
                        inner_func = obj.get('function', {})
                        if inner_func.get('type') == 'attribute' and inner_func.get('attr') == 'GetLocation':
                            inner_obj = inner_func.get('object', {})

                    # Match world_reference.GetLocation() or constant(true).GetLocation()
                    if (inner_obj and (inner_obj.get('type') == 'world_reference' or
                        (inner_obj.get('type') == 'constant' and inner_obj.get('value') == True))):

                        # Extract the location name from GetLocation args
                        get_location_args = obj.get('args', [])
                        location_name = None
                        if get_location_args and len(get_location_args) > 0:
                            location_name_arg = get_location_args[0]
                            if isinstance(location_name_arg, dict) and location_name_arg.get('type') == 'constant':
                                location_name = location_name_arg.get('value')
                            elif isinstance(location_name_arg, str):
                                location_name = location_name_arg

                        if location_name:
                            logger.info(f"Converting world.GetLocation('{location_name}').Available() to location_check")
                            return {
                                'type': 'location_check',
                                'location': location_name
                            }
                        else:
                            logger.warning("GetLocation().Available() pattern without location name, returning true")
                            return {'type': 'constant', 'value': True}

                # Handle GetLocation().ItemIs() pattern - evaluate at export time
                # Pattern: GetLocation("location_name").ItemIs(ItemType.KeyPD, world)
                # This checks if the item placed at a specific location matches a given type
                # Since items are already placed by export time, we can evaluate this statically
                if (isinstance(obj, dict) and obj.get('type') == 'helper' and
                    (obj.get('name') == 'GetLocation' or obj.get('name') == 'smz3_GetLocation') and
                    method_name == 'ItemIs'):

                    logger.debug("Evaluating GetLocation().ItemIs() at export time")

                    # Extract the location name
                    get_location_args = obj.get('args', [])
                    location_name = None
                    if get_location_args and len(get_location_args) > 0:
                        location_name_arg = get_location_args[0]
                        # Extract the constant value if it's a constant rule
                        if isinstance(location_name_arg, dict) and location_name_arg.get('type') == 'constant':
                            location_name = location_name_arg.get('value')
                        # Also check for string directly (shouldn't happen but be safe)
                        elif isinstance(location_name_arg, str):
                            location_name = location_name_arg

                    # Extract the item type being checked
                    item_type_name = None
                    if filtered_args and len(filtered_args) > 0:
                        item_type_arg = filtered_args[0]
                        # Handle ItemType.KeyPD pattern (attribute access) - extract just the attribute name
                        if isinstance(item_type_arg, dict):
                            if item_type_arg.get('type') == 'attribute':
                                item_type_name = item_type_arg.get('attr')
                            elif item_type_arg.get('type') == 'constant':
                                item_type_name = item_type_arg.get('value')

                    # Try to evaluate ItemIs at export time using the location object
                    if location_name and item_type_name and hasattr(self, '_current_location_object'):
                        loc_obj = self._current_location_object

                        # Get the region's GetLocation method to find the target location
                        if hasattr(loc_obj, 'Region') and hasattr(loc_obj.Region, 'GetLocation'):
                            try:
                                target_location = loc_obj.Region.GetLocation(location_name)
                                if target_location:
                                    # Import ItemType enum to check against
                                    from worlds.smz3.TotalSMZ3.Item import ItemType

                                    # Get the ItemType enum value
                                    item_type_enum = getattr(ItemType, item_type_name, None)

                                    if item_type_enum is not None and hasattr(target_location, 'ItemIs'):
                                        # Get the world object
                                        world = loc_obj.Region.world if hasattr(loc_obj.Region, 'world') else None

                                        if world:
                                            # Evaluate ItemIs at export time!
                                            result = target_location.ItemIs(item_type_enum, world)
                                            logger.info(f"Evaluated GetLocation('{location_name}').ItemIs({item_type_name}) = {result}")
                                            return {
                                                'type': 'constant',
                                                'value': result
                                            }
                            except Exception as e:
                                logger.warning(f"Could not evaluate ItemIs at export time: {e}")

                    # Fall back to runtime helper if we couldn't evaluate at export time
                    logger.info(f"Falling back to runtime helper for GetLocation('{location_name}').ItemIs('{item_type_name}')")
                    location_name_rule = {'type': 'constant', 'value': location_name} if location_name else None
                    item_type_rule = {'type': 'constant', 'value': item_type_name} if item_type_name else None

                    if location_name_rule and item_type_rule:
                        return {
                            'type': 'function_call',
                            'function': {
                                'type': 'attribute',
                                'object': {
                                    'type': 'helper',
                                    'name': 'smz3_GetLocation',
                                    'args': [location_name_rule]
                                },
                                'attr': 'ItemIs'
                            },
                            'args': [item_type_rule]
                        }

                    logger.warning("Could not fully process GetLocation().ItemIs() pattern")
                    return {
                        'type': 'constant',
                        'value': False
                    }

                # Handle items.MethodName() - convert to helper call
                if isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'items':
                    logger.debug(f"Converting items.{method_name}() to helper call")
                    return {
                        'type': 'helper',
                        'name': f'smz3_{method_name}',
                        'args': [self.postprocess_rule(arg) for arg in filtered_args]
                    }

                # Handle self.CanBeatBoss() - inline region-specific logic
                # Different dungeons have different boss requirements
                if (isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'self' and
                    method_name == 'CanBeatBoss'):
                    region_name = getattr(self, '_current_location_region', None)
                    logger.debug(f"Inlining self.CanBeatBoss() for region: {region_name}")

                    # Tower of Hera: Sword OR Hammer
                    if region_name == "Tower of Hera":
                        return {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': 'ProgressiveSword'},
                                {'type': 'item_check', 'item': 'Hammer'}
                            ]
                        }

                    # Turtle Rock: Firerod AND Icerod
                    elif region_name == "Turtle Rock":
                        return {
                            'type': 'and',
                            'conditions': [
                                {'type': 'item_check', 'item': 'Firerod'},
                                {'type': 'item_check', 'item': 'Icerod'}
                            ]
                        }

                    # Thieves' Town: Sword OR Hammer OR Somaria OR Byrna
                    elif region_name == "Thieves' Town":
                        return {
                            'type': 'or',
                            'conditions': [
                                {'type': 'item_check', 'item': 'ProgressiveSword'},
                                {'type': 'item_check', 'item': 'Hammer'},
                                {'type': 'item_check', 'item': 'Somaria'},
                                {'type': 'item_check', 'item': 'Byrna'}
                            ]
                        }

                    # Desert Palace or any other: use generic helper
                    # Sword OR Hammer OR Bow OR Firerod OR Icerod OR Byrna OR Somaria
                    else:
                        return {
                            'type': 'helper',
                            'name': 'smz3_CanBeatBoss',
                            'args': []
                        }

                # Handle other self.MethodName() calls
                if (isinstance(obj, dict) and obj.get('type') == 'name' and obj.get('name') == 'self'):
                    logger.debug(f"Found self.{method_name}() call - converting to helper")
                    # Convert to helper call with smz3_ prefix
                    return {
                        'type': 'helper',
                        'name': f'smz3_{method_name}',
                        'args': [self.postprocess_rule(arg) for arg in filtered_args]
                    }

                # Handle self.world.CanAcquire(reward_type) - convert to helper
                if (isinstance(obj, dict) and obj.get('type') == 'attribute' and
                    obj.get('attr') == 'world' and
                    isinstance(obj.get('object'), dict) and
                    obj['object'].get('type') == 'name' and
                    obj['object'].get('name') == 'self' and
                    method_name == 'CanAcquire'):

                    if filtered_args and len(filtered_args) > 0:
                        reward_type_arg = self.postprocess_rule(filtered_args[0])
                        logger.debug(f"Converting self.world.CanAcquire() to helper")
                        return {
                            'type': 'helper',
                            'name': 'smz3_CanAcquire',
                            'args': [reward_type_arg]
                        }

                # Handle self.world.CanAcquireAll(reward_type) - convert to helper
                # or world.CanAcquireAll(reward_type) where world was converted to constant
                if (method_name == 'CanAcquireAll' and
                    (isinstance(obj, dict) and obj.get('type') == 'attribute' and
                     obj.get('attr') == 'world' and
                     isinstance(obj.get('object'), dict) and
                     obj['object'].get('type') == 'name' and
                     obj['object'].get('name') == 'self' or
                     # Handle case where world became a constant
                     isinstance(obj, dict) and obj.get('type') == 'constant')):

                    if filtered_args and len(filtered_args) > 0:
                        reward_type_arg = self.postprocess_rule(filtered_args[0])
                        logger.debug(f"Converting world.CanAcquireAll() to helper")
                        return {
                            'type': 'helper',
                            'name': 'smz3_CanAcquireAll',
                            'args': [reward_type_arg]
                        }

                # Handle self.world.CanEnter(region_name, items) - convert to region_accessible
                if (isinstance(obj, dict) and obj.get('type') == 'attribute' and
                    obj.get('attr') == 'world' and
                    isinstance(obj.get('object'), dict) and
                    obj['object'].get('type') == 'name' and
                    obj['object'].get('name') == 'self' and
                    method_name == 'CanEnter'):

                    if filtered_args and len(filtered_args) > 0:
                        region_name_arg = self.postprocess_rule(filtered_args[0])
                        logger.debug(f"Converting self.world.CanEnter() to region_check")
                        return {
                            'type': 'region_check',
                            'region': region_name_arg.get('value') if isinstance(region_name_arg, dict) and region_name_arg.get('type') == 'constant' else region_name_arg
                        }

            # Update args in the rule if we filtered anything
            if len(filtered_args) != len(args):
                rule = rule.copy()
                rule['args'] = [self.postprocess_rule(arg) for arg in filtered_args]
                # Recursively process the function
                if func:
                    rule['function'] = self.postprocess_rule(func)
                return rule

        # Handle helper rules - add smz3_ prefix if not already present
        if rule.get('type') == 'helper':
            helper_name = rule.get('name', '')

            # Special handling for CanBeatBoss - inline region-specific logic
            if helper_name == 'CanBeatBoss':
                region_name = getattr(self, '_current_location_region', None)
                logger.debug(f"Inlining CanBeatBoss helper for region: {region_name}")

                # Tower of Hera: Sword OR Hammer
                if region_name == "Tower of Hera":
                    return {
                        'type': 'or',
                        'conditions': [
                            {'type': 'item_check', 'item': 'ProgressiveSword'},
                            {'type': 'item_check', 'item': 'Hammer'}
                        ]
                    }

                # Turtle Rock: Firerod AND Icerod
                elif region_name == "Turtle Rock":
                    return {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': 'Firerod'},
                            {'type': 'item_check', 'item': 'Icerod'}
                        ]
                    }

                # Thieves' Town: Sword OR Hammer OR Somaria OR Byrna
                elif region_name == "Thieves' Town":
                    return {
                        'type': 'or',
                        'conditions': [
                            {'type': 'item_check', 'item': 'ProgressiveSword'},
                            {'type': 'item_check', 'item': 'Hammer'},
                            {'type': 'item_check', 'item': 'Somaria'},
                            {'type': 'item_check', 'item': 'Byrna'}
                        ]
                    }

                # For other regions or if region is unknown, use generic helper
                logger.debug(f"Using generic smz3_CanBeatBoss for region: {region_name}")

            if helper_name and not helper_name.startswith('smz3_'):
                logger.debug(f"Adding smz3_ prefix to helper: {helper_name}")
                rule = rule.copy()
                rule['name'] = f'smz3_{helper_name}'
            # Filter out 'items' arguments (JavaScript helpers get items from snapshot)
            if rule.get('args'):
                filtered_args = [arg for arg in rule['args'] if not (isinstance(arg, dict) and arg.get('type') == 'name' and arg.get('name') == 'items')]
                rule['args'] = [self.postprocess_rule(arg, simplify_nested_regressive) for arg in filtered_args]

        # Recursively process nested rules
        if rule.get('type') == 'and' and rule.get('conditions'):
            rule['conditions'] = [self.postprocess_rule(cond, simplify_nested_regressive) for cond in rule['conditions']]
        elif rule.get('type') == 'or' and rule.get('conditions'):
            rule['conditions'] = [self.postprocess_rule(cond, simplify_nested_regressive) for cond in rule['conditions']]

        # Simplify conditional rules with constant false tests to use the if_false branch
        # This handles the regressive accessibility issue where acquiring boss items
        # would increase key requirements. We always use the minimum key requirement.
        if rule.get('type') == 'conditional':
            # First, recursively process nested rules
            if rule.get('test'):
                rule['test'] = self.postprocess_rule(rule['test'], simplify_nested_regressive)
            if rule.get('if_true'):
                rule['if_true'] = self.postprocess_rule(rule['if_true'], simplify_nested_regressive)
            if rule.get('if_false'):
                rule['if_false'] = self.postprocess_rule(rule['if_false'], simplify_nested_regressive)

            # Now simplify based on the test value
            test = rule.get('test')
            if_true = rule.get('if_true')
            if_false = rule.get('if_false')

            # If test is constant false, use the if_false branch
            # This happens when ItemIs is evaluated at export time and returns false.
            if isinstance(test, dict) and test.get('type') == 'constant' and test.get('value') == False:
                if if_false:
                    # Continue processing but don't force simplification of nested conditionals
                    # The nested conditionals represent anti-softlock logic that should be
                    # evaluated dynamically based on current player items
                    return self.postprocess_rule(if_false, simplify_nested_regressive)
            # If test is constant true, use the if_true branch
            elif isinstance(test, dict) and test.get('type') == 'constant' and test.get('value') == True:
                if if_true:
                    return self.postprocess_rule(if_true, simplify_nested_regressive)
            # If test is OR with constant false, simplify by removing the constant false
            elif isinstance(test, dict) and test.get('type') == 'or':
                conditions = test.get('conditions', [])
                non_false_conditions = [c for c in conditions if not (isinstance(c, dict) and c.get('type') == 'constant' and c.get('value') == False)]
                if len(non_false_conditions) == 0:
                    # All conditions are false, use if_false branch
                    if if_false:
                        return self.postprocess_rule(if_false, simplify_nested_regressive=True)
                elif len(non_false_conditions) == 1:
                    # Only one non-false condition, simplify the test
                    rule['test'] = non_false_conditions[0]  # Already processed
                else:
                    # Multiple non-false conditions, keep the OR but remove false ones
                    rule['test'] = {
                        'type': 'or',
                        'conditions': non_false_conditions  # Already processed
                    }

            # Handle regressive accessibility: if both branches are numeric constants
            # and the if_true value is GREATER than if_false, use the minimum value.
            #
            # SMZ3 has "anti-softlock" key logic where acquiring certain items
            # (Bow+Hammer+Lamp) INCREASES key requirements. This creates a semantic
            # mismatch between Python and JavaScript evaluation:
            # - Python: Marks locations accessible at time of discovery (cumulative)
            # - JavaScript: Re-evaluates accessibility with current inventory (real-time)
            #
            # Solution: Always use the minimum key requirement for regressive conditionals.
            # This ensures that once Python marks a location accessible, JavaScript agrees.
            #
            # Example: Palace of Darkness - Dark Maze requires:
            #   KeyPD >= (6 if Bow+Hammer else 5)
            # When player has 5 keys and no Bow+Hammer, location is accessible.
            # Later gaining Bow+Hammer shouldn't "un-access" the location.
            # Solution: Export as KeyPD >= 5 (always use minimum).

            if (isinstance(if_true, dict) and if_true.get('type') == 'constant' and
                isinstance(if_false, dict) and if_false.get('type') == 'constant'):
                true_val = if_true.get('value')
                false_val = if_false.get('value')
                # Only apply to numeric values (key counts) where acquiring items
                # INCREASES the requirement (true_val > false_val = regressive)
                if isinstance(true_val, (int, float)) and isinstance(false_val, (int, float)):
                    if true_val > false_val:
                        # ALWAYS simplify regressive conditionals in SMZ3
                        # This is critical because:
                        # 1. Python's sphere calculation marks locations accessible at time of discovery
                        # 2. Later gaining items (Bow+Hammer) shouldn't make the location inaccessible
                        # 3. The regressive logic is anti-softlock and doesn't affect accessibility tracking
                        #
                        # Example: Palace of Darkness - Dark Maze requires KeyPD >= (6 if Bow+Hammer else 5)
                        # If player has 5 keys and no Bow+Hammer, location is accessible.
                        # Later gaining Bow+Hammer shouldn't un-access the location.
                        # Solution: Always use minimum requirement (5 keys).
                        logger.info(f"Simplified regressive conditional: using minimum value {false_val} instead of ({true_val} if test else {false_val})")
                        return {'type': 'constant', 'value': false_val}
                    # If true_val <= false_val, this is normal behavior (having items helps)
                    # Keep the conditional as-is
        elif rule.get('type') == 'not' and rule.get('condition'):
            rule['condition'] = self.postprocess_rule(rule['condition'], simplify_nested_regressive)
        elif rule.get('type') == 'compare':
            # Process both left and right sides of comparisons
            if rule.get('left'):
                rule['left'] = self.postprocess_rule(rule['left'], simplify_nested_regressive)
            if rule.get('right'):
                rule['right'] = self.postprocess_rule(rule['right'], simplify_nested_regressive)
        elif rule.get('type') == 'function_call':
            # Process function and args if not already handled above
            if rule.get('function'):
                rule['function'] = self.postprocess_rule(rule['function'], simplify_nested_regressive)
            if rule.get('args'):
                rule['args'] = [self.postprocess_rule(arg, simplify_nested_regressive) for arg in rule['args']]
        elif rule.get('type') == 'any_of':
            # Process any_of rules (all_of in Python)
            # Special handling: if element_rule is constant false, the any_of is false
            # But first, try to properly evaluate the any_of if it involves GetLocation().ItemIs()
            element_rule = rule.get('element_rule')
            iterator_info = rule.get('iterator_info')

            logger.info(f"Processing any_of: element_rule={element_rule}, has_iterator_info={iterator_info is not None}")
            if iterator_info:
                logger.info(f"  iterator_info: {iterator_info}")
                logger.info(f"  iterator type: {iterator_info.get('iterator', {}).get('type')}")

            # Check if this is a GetLocation().ItemIs() pattern that we can evaluate at export time
            # Pattern: any(loc.ItemIs(type, world) for type in [ItemType.X, ItemType.Y])
            has_location = hasattr(self, '_current_location_object') and self._current_location_object is not None
            logger.info(f"  has_location: {has_location}, location_name: {getattr(self, '_current_location_name', None)}")

            if (iterator_info and
                iterator_info.get('iterator', {}).get('type') == 'list' and
                has_location):

                # Get the list of item types to check
                iterator_list = iterator_info.get('iterator', {}).get('value', [])
                if iterator_list:
                    # Try to evaluate ItemIs for each type in the list
                    try:
                        loc_obj = self._current_location_object
                        from worlds.smz3.TotalSMZ3.Item import ItemType

                        any_match = False
                        for item_type_rule in iterator_list:
                            item_type_name = None
                            # Handle constant types (already processed)
                            if item_type_rule.get('type') == 'constant':
                                item_type_name = item_type_rule.get('value')
                            # Handle attribute types like ItemType.KeyGT
                            elif item_type_rule.get('type') == 'attribute':
                                obj = item_type_rule.get('object', {})
                                if obj.get('type') == 'name' and obj.get('name') == 'ItemType':
                                    item_type_name = item_type_rule.get('attr')

                            if isinstance(item_type_name, str):
                                item_type_enum = getattr(ItemType, item_type_name, None)
                                if item_type_enum is not None and hasattr(loc_obj, 'ItemIs'):
                                    world = loc_obj.Region.world if hasattr(loc_obj.Region, 'world') else None
                                    if world:
                                        result = loc_obj.ItemIs(item_type_enum, world)
                                        logger.info(f"Evaluated any_of ItemIs({item_type_name}) = {result}")
                                        if result:
                                            any_match = True
                                            break

                        logger.info(f"any_of ItemIs evaluation complete: any_match = {any_match}")
                        return {'type': 'constant', 'value': any_match}
                    except Exception as e:
                        logger.warning(f"Could not evaluate any_of ItemIs at export time: {e}")

            # If element_rule is constant false, the any_of is false
            if isinstance(element_rule, dict) and element_rule.get('type') == 'constant':
                if element_rule.get('value') == False:
                    logger.info("Simplifying any_of with constant false element_rule to false")
                    return {'type': 'constant', 'value': False}
                elif element_rule.get('value') == True:
                    # any(True for x in [non-empty]) is True
                    iterator_list = iterator_info.get('iterator', {}).get('value', []) if iterator_info else []
                    if iterator_list:
                        return {'type': 'constant', 'value': True}

            # Recursively process children
            if element_rule:
                rule['element_rule'] = self.postprocess_rule(element_rule, simplify_nested_regressive)
            if iterator_info:
                # Process the iterator (list of values to iterate over)
                if iterator_info.get('iterator'):
                    iterator_info['iterator'] = self.postprocess_rule(iterator_info['iterator'], simplify_nested_regressive)
                # Process the target (variable name being iterated)
                if iterator_info.get('target'):
                    iterator_info['target'] = self.postprocess_rule(iterator_info['target'], simplify_nested_regressive)
        elif rule.get('type') == 'list':
            # Process list rules - recursively process each element in the list
            if rule.get('value') and isinstance(rule['value'], list):
                rule['value'] = [self.postprocess_rule(elem, simplify_nested_regressive) for elem in rule['value']]

        return rule
