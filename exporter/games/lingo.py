"""Game-specific export handler for Lingo."""

import re
import logging
from typing import Dict, Any
from .generic import GenericGameExportHandler

logger = logging.getLogger(__name__)


class LingoGameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Lingo'
    """Export handler for Lingo that handles AccessRequirements string sorting, door variable resolution,
    and exporting door-related data structures for rule evaluation."""

    def should_preserve_as_helper(self, func_name: str) -> bool:
        """
        Preserve Lingo helper functions as helper calls instead of inlining them.

        This prevents the analyzer from recursively analyzing and inlining the function bodies,
        which can cause issues when the functions contain complex logic like state.update_reachable_regions().

        Args:
            func_name: The name of the function being analyzed

        Returns:
            True if the function should be preserved as a helper, False otherwise
        """
        lingo_helpers = [
            'lingo_can_use_entrance',
            'lingo_can_do_pilgrimage',
            # 'lingo_can_use_location' - intentionally not preserved, will be inlined to _lingo_can_satisfy_requirements
            'lingo_can_use_mastery_location',
            'lingo_can_use_level_2_location',
            '_lingo_can_satisfy_requirements',
            '_lingo_can_open_door',
        ]
        return func_name in lingo_helpers

    def expand_rule(self, analyzed_rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Expand analyzed rule, with special handling for AccessRequirements string representations
        and door variable resolution.

        Lingo's AccessRequirements objects contain sets that have unpredictable string ordering.
        This method sorts the set contents when they appear in constant values.

        Additionally, it resolves the 'door' variable in lingo_can_use_entrance calls to actual values.
        """
        rule = super().expand_rule(analyzed_rule)

        # Resolve door variables in helper calls
        rule = self._resolve_door_variables(rule)

        # Recursively fix AccessRequirements in the rule
        return self._fix_access_requirements(rule)

    def _resolve_door_variables(self, obj: Any) -> Any:
        """
        Recursively resolve 'door' variable references in lingo_can_use_entrance helper calls.

        The door variable is a RoomAndDoor NamedTuple or None. When it's None,
        the helper function returns True, so we can simplify the rule.
        """
        if isinstance(obj, dict):
            # Check if this is a lingo_can_use_entrance helper call
            if obj.get('type') == 'helper' and obj.get('name') == 'lingo_can_use_entrance':
                args = obj.get('args', [])
                if len(args) >= 2:
                    # The second argument should be the door parameter
                    door_arg = args[1]
                    # Check if it's a name reference that needs resolution
                    if isinstance(door_arg, dict) and door_arg.get('type') == 'name' and door_arg.get('name') == 'door':
                        # Leave as-is for frontend helper to handle
                        logger.debug(f"Found lingo_can_use_entrance with unresolved door variable")
                    # Check if it's a constant null/None value
                    elif isinstance(door_arg, dict) and door_arg.get('type') == 'constant' and door_arg.get('value') is None:
                        # door is None, so lingo_can_use_entrance returns True
                        # Replace the entire helper call with a constant True
                        logger.debug(f"Simplified lingo_can_use_entrance with door=None to constant True")
                        return {'type': 'constant', 'value': True}

            # Recursively process dict values
            return {k: self._resolve_door_variables(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._resolve_door_variables(item) for item in obj]
        else:
            return obj

    def _fix_access_requirements(self, obj: Any) -> Any:
        """Recursively sort sets within AccessRequirements string representations."""
        if isinstance(obj, dict):
            # Recursively process dict values
            return {k: self._fix_access_requirements(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            # Process list items, with special handling for constant values containing AccessRequirements
            result = []
            for item in obj:
                if isinstance(item, str) and 'AccessRequirements(' in item:
                    # Parse and sort the sets in the AccessRequirements string
                    result.append(self._sort_access_requirements_string(item))
                else:
                    result.append(self._fix_access_requirements(item))
            return result
        else:
            return obj

    def _sort_access_requirements_string(self, s: str) -> str:
        """Sort sets within an AccessRequirements string representation."""
        # Pattern to match set literals like {'item1', 'item2', 'item3'}
        def sort_set(match):
            # Extract the set contents
            set_contents = match.group(1)
            if not set_contents.strip():
                return "{}"
            # Split by comma, strip whitespace and quotes, sort, then rebuild
            items = [item.strip().strip("'\"") for item in set_contents.split(',')]
            sorted_items = sorted(items)
            return "{" + ", ".join(f"'{item}'" for item in sorted_items) + "}"

        # Replace all set literals with sorted versions
        result = re.sub(r'\{([^{}]*)\}', sort_set, s)
        return result

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """
        Add AccessRequirements data to Lingo locations.

        This exports the location.access field which contains AccessRequirements data
        needed by the _lingo_can_satisfy_requirements helper function.
        """
        attributes = {}

        # The location is a LingoLocation, not a PlayerLocation
        # We need to look up the PlayerLocation from world.player_logic
        if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'locations_by_room'):
            # Extract room name from location name (format: "Room Name - Panel Name")
            # Some locations don't have a dash (achievements, etc.), so handle both cases
            location_name = location.name

            # Search for the PlayerLocation in all rooms
            player_location = None
            for room_locations in world.player_logic.locations_by_room.values():
                for ploc in room_locations:
                    if ploc.name == location_name:
                        player_location = ploc
                        break
                if player_location:
                    break

            if player_location and hasattr(player_location, 'access'):
                access_req = player_location.access

                # Serialize the AccessRequirements object
                attributes['access'] = {
                    'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
                    'doors': [{'room': door.room, 'door': door.door} for door in sorted(access_req.doors, key=lambda d: (d.room or '', d.door))] if hasattr(access_req, 'doors') else [],
                    'colors': sorted(list(access_req.colors)) if hasattr(access_req, 'colors') else [],
                    'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
                    'progression': dict(access_req.progression) if hasattr(access_req, 'progression') else {},
                    'the_master': access_req.the_master if hasattr(access_req, 'the_master') else False,
                    'postgame': access_req.postgame if hasattr(access_req, 'postgame') else False
                }

                logger.debug(f"Added AccessRequirements to location {location_name}: {attributes['access']}")

        return attributes

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """
        Export Lingo-specific settings needed for rule evaluation.

        This exports data structures that the rule engine needs to evaluate
        entrance access rules that contain unresolved variable references.
        """
        # Get base settings from parent class
        settings = super().get_settings_data(world, multiworld, player)

        # Export world-specific options
        if hasattr(world, 'options'):
            # List of Lingo-specific options to export
            lingo_options = [
                'shuffle_colors',
                'shuffle_doors',
                'shuffle_panels',
                'shuffle_paintings',
                'shuffle_sunwarps',
                'shuffle_postgame',
                'group_doors',
                'mastery_achievements',
                'level_2_requirement',
            ]

            for option_name in lingo_options:
                if hasattr(world.options, option_name):
                    option_value = getattr(world.options, option_name)
                    # Get the actual value (options are often Option objects)
                    settings[option_name] = getattr(option_value, 'value', option_value)
                    logger.debug(f"Exported option {option_name}={settings[option_name]}")

        if hasattr(world, 'player_logic'):
            # Export item_by_door: which doors require which items
            if hasattr(world.player_logic, 'item_by_door'):
                settings['item_by_door'] = {}
                for room, doors in world.player_logic.item_by_door.items():
                    settings['item_by_door'][room] = dict(doors)
                logger.debug(f"Exported item_by_door with {len(settings['item_by_door'])} rooms")

            # Export mastery_reqs: AccessRequirements for mastery achievements
            if hasattr(world.player_logic, 'mastery_reqs'):
                settings['mastery_reqs'] = []
                for access_req in world.player_logic.mastery_reqs:
                    serialized_req = {
                        'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
                        'doors': [{'room': d.room, 'door': d.door} for d in sorted(access_req.doors, key=lambda d: (d.room or '', d.door))] if hasattr(access_req, 'doors') else [],
                        'colors': sorted(list(access_req.colors)) if hasattr(access_req, 'colors') else [],
                        'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
                        'progression': dict(access_req.progression) if hasattr(access_req, 'progression') else {},
                        'the_master': access_req.the_master if hasattr(access_req, 'the_master') else False,
                        'postgame': access_req.postgame if hasattr(access_req, 'postgame') else False
                    }
                    settings['mastery_reqs'].append(serialized_req)
                logger.debug(f"Exported mastery_reqs with {len(settings['mastery_reqs'])} requirements")

            # Export door_reqs: AccessRequirements for doors without items
            if hasattr(world.player_logic, 'door_reqs'):
                settings['door_reqs'] = {}
                for room, doors in world.player_logic.door_reqs.items():
                    settings['door_reqs'][room] = {}
                    for door_name, access_req in doors.items():
                        settings['door_reqs'][room][door_name] = {
                            'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
                            'doors': [{'room': d.room, 'door': d.door} for d in sorted(access_req.doors, key=lambda d: (d.room or '', d.door))] if hasattr(access_req, 'doors') else [],
                            'colors': sorted(list(access_req.colors)) if hasattr(access_req, 'colors') else [],
                            'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
                            'progression': dict(access_req.progression) if hasattr(access_req, 'progression') else {},
                            'the_master': access_req.the_master if hasattr(access_req, 'the_master') else False,
                            'postgame': access_req.postgame if hasattr(access_req, 'postgame') else False
                        }
                logger.debug(f"Exported door_reqs with {len(settings['door_reqs'])} rooms")

            # Export counting_panel_reqs: panel count requirements for LEVEL 2 location
            if hasattr(world.player_logic, 'counting_panel_reqs'):
                settings['counting_panel_reqs'] = {}
                for room, panel_reqs in world.player_logic.counting_panel_reqs.items():
                    settings['counting_panel_reqs'][room] = []
                    for access_req, panel_count in panel_reqs:
                        serialized_req = {
                            'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
                            'doors': [{'room': d.room, 'door': d.door} for d in sorted(access_req.doors, key=lambda d: (d.room or '', d.door))] if hasattr(access_req, 'doors') else [],
                            'colors': sorted(list(access_req.colors)) if hasattr(access_req, 'colors') else [],
                            'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
                            'progression': dict(access_req.progression) if hasattr(access_req, 'progression') else {},
                            'the_master': access_req.the_master if hasattr(access_req, 'the_master') else False,
                            'postgame': access_req.postgame if hasattr(access_req, 'postgame') else False
                        }
                        settings['counting_panel_reqs'][room].append([serialized_req, panel_count])
                logger.debug(f"Exported counting_panel_reqs with {len(settings['counting_panel_reqs'])} rooms")

        # Export PROGRESSIVE_ITEMS constant (sorted for consistency)
        try:
            from worlds.lingo.static_logic import PROGRESSIVE_ITEMS
            settings['PROGRESSIVE_ITEMS'] = sorted(list(PROGRESSIVE_ITEMS))
            logger.debug(f"Exported PROGRESSIVE_ITEMS: {settings['PROGRESSIVE_ITEMS']}")
        except ImportError:
            logger.warning("Could not import PROGRESSIVE_ITEMS from worlds.lingo.static_logic")

        # Export PROGRESSIVE_DOORS_BY_ROOM constant
        try:
            from worlds.lingo.static_logic import PROGRESSIVE_DOORS_BY_ROOM
            settings['PROGRESSIVE_DOORS_BY_ROOM'] = {}
            for room, doors in PROGRESSIVE_DOORS_BY_ROOM.items():
                settings['PROGRESSIVE_DOORS_BY_ROOM'][room] = {}
                for door_name, progression_info in doors.items():
                    # progression_info is a ProgressiveDoorInfo namedtuple
                    settings['PROGRESSIVE_DOORS_BY_ROOM'][room][door_name] = {
                        'item_name': progression_info.item_name if hasattr(progression_info, 'item_name') else None,
                        'index': progression_info.index if hasattr(progression_info, 'index') else 1
                    }
            logger.debug(f"Exported PROGRESSIVE_DOORS_BY_ROOM with {len(settings['PROGRESSIVE_DOORS_BY_ROOM'])} rooms")
        except ImportError:
            logger.warning("Could not import PROGRESSIVE_DOORS_BY_ROOM from worlds.lingo.static_logic")

        return settings

    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: str, connected_region: str = None) -> Dict[str, Any]:
        """
        Postprocess entrance access rules to resolve variable references.

        Lingo entrance rules contain complex conditionals with unresolved variables like
        'door', 'room', 'world', etc. This method extracts the door information from the
        entrance name and simplifies the rule accordingly.

        Entrance name patterns:
        - "Region A to Region B" - no door
        - "Region A to Region B (through Region C - Door Name)" - has door
        - "Simple Name" (e.g., "Sun Painting") - the name is the door name, room inferred from connected_region
        """
        if not rule:
            return rule

        # Extract door information from entrance name
        door_room = None
        door_name = None
        target_region = None

        # Extract target region from entrance name (format: "Source to Target" or "Source to Target (through ...)")
        to_match = re.search(r'to ([^(]+)', entrance_name)
        if to_match:
            target_region = to_match.group(1).strip()
        elif connected_region:
            # If no "to" pattern, use the connected_region parameter
            target_region = connected_region

        # Pattern: "... (through Room Name - Door Name)"
        through_match = re.search(r'\(through ([^-]+) - ([^)]+)\)', entrance_name)
        if through_match:
            door_room = through_match.group(1).strip()
            door_name = through_match.group(2).strip()
            logger.debug(f"Entrance '{entrance_name}' uses door '{door_name}' in room '{door_room}'")

        # Handle special case: Simple entrance names (e.g., "Sun Painting", "Pilgrimage Part 1")
        # These are typically paintings or special doors that don't follow the standard naming pattern
        # For these, the entrance name itself is the door name, and the door room is the connected_region
        if not to_match and not through_match and connected_region:
            # The entrance name itself is the door name
            # The door room is the connected region (target region)
            door_name = entrance_name
            door_room = connected_region
            logger.debug(f"Entrance '{entrance_name}' is a simple door/painting, using connected_region '{connected_region}' as door room")

        # Check if the rule is broken (returns strings instead of booleans)
        # This happens when the analyzer fails to properly analyze lingo_can_use_entrance
        is_broken_rule = self._is_broken_entrance_rule(rule)

        # Temporary logging
        if entrance_name == "Sun Painting":
            import traceback
            logger.info(f"DEBUG Sun Painting: door_name={door_name}, door_room={door_room}, target_region={target_region}, connected_region={connected_region}")
            logger.info(f"DEBUG Sun Painting: is_broken_rule={is_broken_rule}")
            logger.info(f"DEBUG Sun Painting: rule={rule}")
            logger.info(f"DEBUG Sun Painting: Called from: {traceback.extract_stack()[-3]}")

        if is_broken_rule and door_name is not None:
            # Replace with a proper helper call
            logger.debug(f"Replacing broken entrance rule for '{entrance_name}' with helper call")
            return {
                'type': 'helper',
                'name': 'lingo_can_use_entrance',
                'args': [
                    {'type': 'constant', 'value': target_region},
                    {
                        'type': 'tuple',
                        'elements': [
                            {'type': 'constant', 'value': door_room},
                            {'type': 'constant', 'value': door_name}
                        ]
                    }
                ]
            }
        elif is_broken_rule and door_name is None:
            # No door, should just return true
            logger.debug(f"Replacing broken entrance rule for '{entrance_name}' with constant true")
            return {'type': 'constant', 'value': True}

        # For non-broken rules (like Menu exits), keep them as-is or do normal processing
        # First, replace all world.player_logic references with settings
        rule = self._replace_world_references(rule)

        # Simplify the rule based on door information
        return self._simplify_entrance_rule(rule, door_room, door_name, entrance_name)

    def _replace_world_references(self, obj: Any) -> Any:
        """
        Replace all references to world.player_logic with settings, and bare references
        to PROGRESSIVE_ITEMS and PROGRESSIVE_DOORS_BY_ROOM with settings references.
        """
        if not isinstance(obj, dict):
            return obj

        obj_type = obj.get('type')

        # Replace bare name references to PROGRESSIVE_ITEMS and PROGRESSIVE_DOORS_BY_ROOM
        if obj_type == 'name':
            name = obj.get('name')
            if name == 'PROGRESSIVE_ITEMS':
                return {
                    'type': 'attribute',
                    'object': {'type': 'name', 'name': 'settings'},
                    'attr': 'PROGRESSIVE_ITEMS'
                }
            elif name == 'PROGRESSIVE_DOORS_BY_ROOM':
                return {
                    'type': 'attribute',
                    'object': {'type': 'name', 'name': 'settings'},
                    'attr': 'PROGRESSIVE_DOORS_BY_ROOM'
                }

        # Replace world.player_logic.X with settings.X
        if obj_type == 'attribute':
            inner_obj = obj.get('object', {})
            attr = obj.get('attr')

            # Check if this is world.player_logic
            if (isinstance(inner_obj, dict) and
                inner_obj.get('type') == 'attribute' and
                inner_obj.get('attr') == 'player_logic'):

                innermost = inner_obj.get('object', {})
                if isinstance(innermost, dict) and innermost.get('type') == 'name' and innermost.get('name') == 'world':
                    # This is world.player_logic.X, replace with settings.X
                    return {
                        'type': 'attribute',
                        'object': {'type': 'name', 'name': 'settings'},
                        'attr': attr
                    }

        # Recursively process nested structures
        result = {}
        for key, value in obj.items():
            if isinstance(value, dict):
                result[key] = self._replace_world_references(value)
            elif isinstance(value, list):
                result[key] = [self._replace_world_references(item) if isinstance(item, (dict, list)) else item for item in value]
            else:
                result[key] = value

        return result

    def _simplify_entrance_rule(self, rule: Dict[str, Any], door_room: str, door_name: str, entrance_name: str) -> Dict[str, Any]:
        """
        Recursively simplify entrance rules by resolving door and room variables.

        The general pattern is:
        if door is None:
            return True
        else:
            ... check door requirements ...
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Handle conditional: if door is None: return True
        if rule_type == 'conditional':
            test = rule.get('test', {})

            # Check if this is testing "door is None" or "None is None"
            is_door_none_test = False

            # Pattern 1: door is None (before variable replacement)
            if (isinstance(test, dict) and
                test.get('type') == 'compare' and
                test.get('op') in ['is', '=='] and
                isinstance(test.get('left'), dict) and
                test.get('left', {}).get('type') == 'name' and
                test.get('left', {}).get('name') == 'door' and
                isinstance(test.get('right'), dict) and
                test.get('right', {}).get('type') == 'constant' and
                test.get('right', {}).get('value') is None):
                is_door_none_test = True

            # Pattern 2: None is None (after variable replacement when door_name is None)
            if (isinstance(test, dict) and
                test.get('type') == 'compare' and
                test.get('op') in ['is', '=='] and
                isinstance(test.get('left'), dict) and
                test.get('left', {}).get('type') == 'constant' and
                test.get('left', {}).get('value') is None and
                isinstance(test.get('right'), dict) and
                test.get('right', {}).get('type') == 'constant' and
                test.get('right', {}).get('value') is None):
                is_door_none_test = True

            if is_door_none_test:
                # This is "if door is None:" or "if None is None:"
                if door_name is None:
                    # door is indeed None, take the if_true branch
                    logger.debug(f"Simplified '{entrance_name}': door is None, using if_true branch")
                    return self._simplify_entrance_rule(rule.get('if_true', {'type': 'constant', 'value': True}), door_room, door_name, entrance_name)
                else:
                    # door is not None, take the if_false branch
                    logger.debug(f"Simplified '{entrance_name}': door is '{door_name}', using if_false branch")
                    # In the if_false branch, replace door variable references with the actual door value
                    if_false = rule.get('if_false')
                    if_false_simplified = self._replace_door_variable(if_false, door_room, door_name)
                    return self._simplify_entrance_rule(if_false_simplified, door_room, door_name, entrance_name)

        # Recursively process all dict values
        result = {}
        for key, value in rule.items():
            if key in ['test', 'if_true', 'if_false', 'conditions', 'left', 'right', 'condition']:
                result[key] = self._simplify_entrance_rule(value, door_room, door_name, entrance_name)
            elif key == 'args' and isinstance(value, list):
                result[key] = [self._simplify_entrance_rule(item, door_room, door_name, entrance_name) for item in value]
            else:
                result[key] = value

        return result

    def _is_broken_entrance_rule(self, rule: Dict[str, Any]) -> bool:
        """
        Check if an entrance rule is broken (returns strings instead of booleans).

        Broken rules have patterns like:
        - Conditional with constant string values in if_true/if_false branches
        - Testing string constants against null

        This method recursively checks nested conditionals.
        """
        if not isinstance(rule, dict):
            return False

        rule_type = rule.get('type')

        # Check if this node is a constant string (broken return value)
        if rule_type == 'constant' and isinstance(rule.get('value'), str):
            return True

        # Check for the broken pattern: conditional that returns constant strings
        if rule_type == 'conditional':
            if_true = rule.get('if_true', {})
            if_false = rule.get('if_false', {})

            # Recursively check both branches
            if self._is_broken_entrance_rule(if_true) or self._is_broken_entrance_rule(if_false):
                return True

        return False

    def _replace_door_variable(self, rule: Dict[str, Any], door_room: str, door_name: str) -> Dict[str, Any]:
        """
        Replace door and room variable references with actual constant values.

        This method evaluates checks against world.player_logic data structures at export time
        and replaces complex patterns with simpler ones using the exported settings data.
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type')

        # Replace name references to 'room' with the constant door_room
        if rule_type == 'name' and rule.get('name') == 'room':
            return {'type': 'constant', 'value': door_room}

        # Simplify subscript: world.player_logic.door_reqs[room][door_name]
        #   becomes: door_reqs lookup from settings
        if rule_type == 'subscript':
            value = rule.get('value')
            index = rule.get('index')

            # Check if this is world.player_logic.door_reqs[room][door_name]
            if (isinstance(value, dict) and value.get('type') == 'subscript' and
                isinstance(index, dict) and index.get('type') == 'constant'):

                inner_value = value.get('value', {})
                inner_index = value.get('index', {})

                # Check if inner is world.player_logic.door_reqs
                if (isinstance(inner_value, dict) and inner_value.get('type') == 'attribute' and
                    inner_value.get('attr') == 'door_reqs' and
                    isinstance(inner_index, dict) and inner_index.get('type') == 'name' and
                    inner_index.get('name') == 'room'):

                    # Replace with a settings lookup: settings.door_reqs[door_room][door_name]
                    door_name_constant = index.get('value')
                    logger.debug(f"Simplifying door_reqs lookup for room='{door_room}', door='{door_name_constant}'")

                    return {
                        'type': 'subscript',
                        'value': {
                            'type': 'subscript',
                            'value': {
                                'type': 'attribute',
                                'object': {
                                    'type': 'name',
                                    'name': 'settings'
                                },
                                'attr': 'door_reqs'
                            },
                            'index': {
                                'type': 'constant',
                                'value': door_room
                            }
                        },
                        'index': {
                            'type': 'constant',
                            'value': door_name_constant
                        }
                    }

        # Recursively process all dict and list values
        result = {}
        for key, value in rule.items():
            if isinstance(value, dict):
                result[key] = self._replace_door_variable(value, door_room, door_name)
            elif isinstance(value, list):
                result[key] = [self._replace_door_variable(item, door_room, door_name) if isinstance(item, dict) else item for item in value]
            else:
                result[key] = value

        return result
