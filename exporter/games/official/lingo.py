"""Game-specific export handler for Lingo."""

import re
import logging
from typing import Dict, Any, Optional
from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class LingoGameExportHandler(GenericGameExportHandler):
    """Export handler for Lingo with door variable resolution and door-related data export.

    Lingo requires custom export logic due to its unique game mechanics:

    1. **AccessRequirements**: Lingo uses AccessRequirements NamedTuples to track what's needed
       to access locations (rooms, doors, colors, items, progression requirements).

    2. **Door/Entrance System**: Lingo has complex door and entrance naming conventions:
       - Exit names follow patterns like "Room A to Room B (through Room C - Door Name)"
       - Entrance rules are parsed and simplified based on door information

    3. **player_logic Data**: Exports game state from world.player_logic:
       - item_by_door: Maps rooms to doors and their required items
       - door_reqs: AccessRequirements for doors without items
       - mastery_reqs: Requirements for mastery achievements
       - counting_panel_reqs: Panel count requirements for LEVEL 2

    4. **Worldgen Support**: Generated worlds require special handling:
       - Load settings from _worldgen_settings.json
       - Generate exit rules from parsed exit names
       - Read location access from location_table instead of player_logic
    """

    # Use auto sweep for indirect region dependencies since Lingo's custom Rules.py
    # sets access_rule directly without registering indirect_connections
    USE_AUTO_INDIRECT_CONDITIONS = True

    # Note: HELPER_MODULES is not specified - worlds.lingo.rules is auto-discovered
    # by the base class from AUTO_DISCOVER_WORLD_HELPER_MODULES = True (default)

    # Note: Internal helpers (_lingo_can_open_door, _lingo_can_satisfy_requirements)
    # are auto-discovered during rule analysis when they're directly called.
    # These are called indirectly through blacklisted helpers, so they're inlined
    # rather than exported as separate helper definitions.

    # Blacklist helpers with loops or complex logic that cannot be auto-exported
    # These helpers iterate over collections (rooms, doors, colors, items, etc.)
    # and require JavaScript implementations for runtime evaluation
    HELPERS_TO_EXPORT_BLACKLIST = {
        'lingo_can_use_entrance',         # accesses NamedTuple attributes (door.room, door.door)
        'lingo_can_do_pilgrimage',        # uses all() with generator (loop)
        'lingo_can_use_mastery_location', # has for loop counting satisfied requirements
        'lingo_can_use_level_2_location', # has nested for loops over regions and panels
    }

    # Preserve these helpers as helper calls instead of inlining them
    # This prevents the analyzer from recursively analyzing and inlining function bodies
    # that contain complex logic like state.update_reachable_regions()
    # Note: 'lingo_can_use_location' is intentionally not preserved - it inlines to _lingo_can_satisfy_requirements
    HELPERS_TO_PRESERVE = {
        'lingo_can_use_entrance',
        'lingo_can_do_pilgrimage',
        'lingo_can_use_mastery_location',
        'lingo_can_use_level_2_location',
        '_lingo_can_satisfy_requirements',
        '_lingo_can_open_door',
    }

    # Export these options at the top level of settings (for rule engine compatibility)
    EXPORTED_OPTIONS = [
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

    @staticmethod
    def _serialize_access_requirements(access_req) -> Dict[str, Any]:
        """Serialize an AccessRequirements object to a JSON-compatible dict."""
        return {
            'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
            'doors': [{'room': d.room, 'door': d.door} for d in sorted(access_req.doors, key=lambda d: (d.room or '', d.door))] if hasattr(access_req, 'doors') else [],
            'colors': sorted(list(access_req.colors)) if hasattr(access_req, 'colors') else [],
            'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
            'progression': dict(access_req.progression) if hasattr(access_req, 'progression') else {},
            'the_master': access_req.the_master if hasattr(access_req, 'the_master') else False,
            'postgame': access_req.postgame if hasattr(access_req, 'postgame') else False
        }

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand analyzed rule with Lingo-specific transformations.

        - Resolves the 'door' variable in lingo_can_use_entrance calls
        - Converts world.player_logic.X references to settings.X
        - Converts PROGRESSIVE_ITEMS/PROGRESSIVE_DOORS_BY_ROOM to settings references
        - Converts RoomAndDoor namedtuples to arrays
        """
        rule = super().expand_rule(rule, _depth)

        # Replace world.player_logic references with settings
        # This is essential for helper definitions to work in the frontend
        rule = self._replace_world_references(rule)

        # Convert RoomAndDoor namedtuples to arrays for JavaScript compatibility
        rule = self._convert_namedtuples_to_arrays(rule)

        # Resolve door variables in helper calls
        rule = self._resolve_door_variables(rule)

        return rule

    def _convert_namedtuples_to_arrays(self, obj: Any) -> Any:
        """
        Recursively convert RoomAndDoor namedtuple objects to arrays.

        The analyzer serializes namedtuples as:
        {
            "_namedtuple_type": "RoomAndDoor",
            "_namedtuple_fields": ["room", "door"],
            "_namedtuple_values": ["Starting Room", "Back Right Door"]
        }

        The JavaScript helper expects arrays:
        ["Starting Room", "Back Right Door"]
        """
        if isinstance(obj, dict):
            # Check if this is a RoomAndDoor namedtuple
            if obj.get('_namedtuple_type') == 'RoomAndDoor':
                values = obj.get('_namedtuple_values', [])
                logger.debug(f"Converting RoomAndDoor namedtuple to array: {values}")
                return values

            # Also check for constant values that contain RoomAndDoor
            if obj.get('type') == 'constant' or obj.get('rule') == 'Constant':
                value = obj.get('value') or (obj.get('args', {}).get('value') if isinstance(obj.get('args'), dict) else None)
                if isinstance(value, dict) and value.get('_namedtuple_type') == 'RoomAndDoor':
                    converted = value.get('_namedtuple_values', [])
                    logger.debug(f"Converting RoomAndDoor constant to array: {converted}")
                    # Return a new constant with the converted value
                    if 'value' in obj:
                        return {'type': 'constant', 'value': converted}
                    elif 'args' in obj:
                        new_args = dict(obj.get('args', {}))
                        new_args['value'] = converted
                        return {k: (new_args if k == 'args' else v) for k, v in obj.items()}

            # Recursively process dict values
            return {k: self._convert_namedtuples_to_arrays(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_namedtuples_to_arrays(item) for item in obj]
        else:
            return obj

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

    def get_custom_location_access_rule(self, location, world) -> Dict[str, Any]:
        """
        Generate a custom access rule for Lingo locations.

        Instead of trying to analyze the lambda `lingo_can_use_location(state, location, world)`,
        we generate a rule that references the location's exported `access` attribute directly.

        The rule engine has access to `location` in the context (set in reachabilityEngine.js:597),
        so we can reference `location.access` and pass it to `_lingo_can_satisfy_requirements`.

        Special cases:
        - Mastery location: uses lingo_can_use_mastery_location helper
        - Level 2 location: uses lingo_can_use_level_2_location helper
        """
        location_name = location.name

        # Check for mastery location
        if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'mastery_location'):
            if location_name == world.player_logic.mastery_location:
                return {
                    'type': 'helper',
                    'name': 'lingo_can_use_mastery_location',
                    'args': []
                }

        # Check for level 2 location (original world)
        if hasattr(world, 'options') and hasattr(world.options, 'level_2_requirement'):
            if world.options.level_2_requirement.value > 1:
                if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'level_2_location'):
                    if location_name == "Second Room - ANOTHER TRY" or location_name == world.player_logic.level_2_location:
                        return {
                            'type': 'helper',
                            'name': 'lingo_can_use_level_2_location',
                            'args': []
                        }

        # Check for level 2 location (worldgen world)
        if self.is_worldgen_world(world):
            worldgen_data = self._get_worldgen_settings(world)  # type: ignore[attr-defined]
            # Check options section (new format), then top-level (legacy)
            options = worldgen_data.get('options', worldgen_data)
            level_2_req = options.get('level_2_requirement', 1)
            if level_2_req > 1:
                # In worldgen, the level 2 locations are "Second Room - LEVEL 2" and "Second Room - ANOTHER TRY"
                if location_name == "Second Room - LEVEL 2" or location_name == "Second Room - ANOTHER TRY":
                    return {
                        'type': 'helper',
                        'name': 'lingo_can_use_level_2_location',
                        'args': []
                    }

        # Standard location: reference location.access (which is exported via get_location_attributes)
        return {
            'type': 'helper',
            'name': '_lingo_can_satisfy_requirements',
            'args': [
                {
                    'type': 'attribute',
                    'object': {'type': 'name', 'name': 'location'},
                    'attr': 'access'
                }
            ]
        }

    def set_exit_info(self, exit_name: str, connected_region: str):
        """Store exit info for use in handle_complex_exit_rule."""
        self._current_exit_name = exit_name
        self._current_connected_region = connected_region

    def _parse_exit_name(self, exit_name: str) -> Optional[tuple]:
        """
        Parse a Lingo exit name to extract the target room and door path.

        Exit name format: "Source Room to Target Room (through Door Room - Door Name)"
        Returns: (target_room, door_room, door_name) or None if parsing fails.
        """
        if not exit_name:
            return None

        # Pattern: "X to Y (through Z - W)"
        match = re.match(r'^(.+?) to (.+?) \(through (.+?) - (.+?)\)$', exit_name)
        if match:
            source_room, target_room, door_room, door_name = match.groups()
            return (target_room, door_room, door_name)

        return None

    def handle_complex_exit_rule(self, exit_name: str, exit_rule) -> Optional[Dict[str, Any]]:  # noqa: ARG002
        """
        Generate proper exit rules for worldgen Lingo worlds.

        For worldgen worlds, the Rules.py has True_() for all exits, but we need
        to generate the proper lingo_can_use_entrance helper call by parsing
        the exit name to get the door information.

        Args:
            exit_name: The name of the exit (e.g., "Starting Room to Hidden Room (through ...)")
            exit_rule: The original rule function (usually True_() for worldgen)

        Returns:
            A rule dict with lingo_can_use_entrance helper call, or None to use default handling.
        """
        # Check if we have a world reference
        if not hasattr(self, 'world') or self.world is None:
            return None

        # Only apply to worldgen worlds
        if not self.is_worldgen_world(self.world):
            return None

        # Parse the exit name to get door information
        parsed = self._parse_exit_name(exit_name)
        if parsed:
            target_room, door_room, door_name = parsed
            # Generate the lingo_can_use_entrance helper call
            return {
                'type': 'helper',
                'name': 'lingo_can_use_entrance',
                'args': [
                    {'type': 'constant', 'value': target_room},
                    {'type': 'constant', 'value': [door_room, door_name]}
                ]
            }

        # For non-standard exits (like "Sun Painting"), use the connected_region
        # to generate the proper lingo_can_use_entrance helper call
        connected_region = getattr(self, '_current_connected_region', None)
        if connected_region:
            # Generate the lingo_can_use_entrance helper call using connected_region and exit_name
            return {
                'type': 'helper',
                'name': 'lingo_can_use_entrance',
                'args': [
                    {'type': 'constant', 'value': connected_region},
                    {'type': 'constant', 'value': [connected_region, exit_name]}
                ]
            }

        return None

    def _get_worldgen_location_access(self, world) -> Dict[str, Dict[str, Any]]:
        """Load location access data from the location_table for worldgen worlds."""
        if not hasattr(self, '_worldgen_location_access'):
            self._worldgen_location_access = {}
            try:
                import importlib
                world_module = type(world).__module__
                base_module = world_module.split('.')[0] + '.' + world_module.split('.')[1]
                locations_module = importlib.import_module(f"{base_module}.Locations")
                location_table = getattr(locations_module, 'location_table', {})

                for loc_name, loc_data in location_table.items():
                    if hasattr(loc_data, 'access') and loc_data.access:
                        self._worldgen_location_access[loc_name] = loc_data.access
                        logger.debug(f"Loaded access for location {loc_name}")
            except Exception as e:
                logger.warning(f"Failed to load worldgen location access: {e}")

        return self._worldgen_location_access

    def _get_worldgen_world_attributes(self, world) -> Dict[str, Any]:
        """Get world attributes from a worldgen world's instance attributes.

        Worldgen worlds have their world_attributes code-generated in __init__,
        so we can read them directly from the world object.
        """
        if not hasattr(self, '_worldgen_world_attrs'):
            self._worldgen_world_attrs = {}
            # Get attributes from world object's __dict__
            if hasattr(world, '__dict__'):
                for key in ['item_by_door', 'mastery_reqs', 'door_reqs', 'counting_panel_reqs',
                            'PROGRESSIVE_ITEMS', 'PROGRESSIVE_DOORS_BY_ROOM']:
                    if key in world.__dict__:
                        self._worldgen_world_attrs[key] = world.__dict__[key]
                        logger.debug(f"Found worldgen attribute {key}")
        return self._worldgen_world_attrs

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """
        Add AccessRequirements data to Lingo locations.

        This exports the location.access field which contains AccessRequirements data
        needed by the _lingo_can_satisfy_requirements helper function.

        For worldgen worlds, reads access from the location_table instead of player_logic.
        """
        attributes = {}
        location_name = location.name

        # Check if this is a worldgen world
        if self.is_worldgen_world(world):
            # For worldgen, read from location_table
            worldgen_access = self._get_worldgen_location_access(world)
            if location_name in worldgen_access:
                attributes['access'] = worldgen_access[location_name]
                logger.debug(f"Added worldgen access to location {location_name}")
            return attributes

        # The location is a LingoLocation, not a PlayerLocation
        # We need to look up the PlayerLocation from world.player_logic
        if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'locations_by_room'):
            # Extract room name from location name (format: "Room Name - Panel Name")
            # Some locations don't have a dash (achievements, etc.), so handle both cases

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
                attributes['access'] = self._serialize_access_requirements(player_location.access)

                logger.debug(f"Added AccessRequirements to location {location_name}: {attributes['access']}")

        return attributes

    def get_world_data(self, world, multiworld, player) -> Dict[str, Any]:
        """
        Export Lingo-specific world data needed for rule evaluation.

        This exports data structures that the rule engine needs to evaluate
        entrance access rules that contain unresolved variable references.

        For worldgen worlds, reads from world instance attributes (code-generated in __init__).
        """
        # Get base world data from parent class
        settings = super().get_world_data(world, multiworld, player)

        # Check if this is a worldgen world - read from instance attributes
        if self.is_worldgen_world(world):
            world_attrs = self._get_worldgen_world_attributes(world)
            # Load game-specific data (options are already exported by EXPORTED_OPTIONS)
            for key in ['item_by_door', 'mastery_reqs', 'door_reqs', 'counting_panel_reqs',
                        'PROGRESSIVE_ITEMS', 'PROGRESSIVE_DOORS_BY_ROOM']:
                if key in world_attrs:
                    settings[key] = world_attrs[key]
            return settings

        # Options are exported by EXPORTED_OPTIONS class attribute (handled by base class)

        if hasattr(world, 'player_logic'):
            # Export item_by_door: which doors require which items
            if hasattr(world.player_logic, 'item_by_door'):
                settings['item_by_door'] = {}
                for room, doors in world.player_logic.item_by_door.items():
                    settings['item_by_door'][room] = dict(doors)
                logger.debug(f"Exported item_by_door with {len(settings['item_by_door'])} rooms")

            # Export mastery_reqs: AccessRequirements for mastery achievements
            if hasattr(world.player_logic, 'mastery_reqs'):
                settings['mastery_reqs'] = [
                    self._serialize_access_requirements(req)
                    for req in world.player_logic.mastery_reqs
                ]
                logger.debug(f"Exported mastery_reqs with {len(settings['mastery_reqs'])} requirements")

            # Export door_reqs: AccessRequirements for doors without items
            if hasattr(world.player_logic, 'door_reqs'):
                settings['door_reqs'] = {
                    room: {
                        door_name: self._serialize_access_requirements(access_req)
                        for door_name, access_req in doors.items()
                    }
                    for room, doors in world.player_logic.door_reqs.items()
                }
                logger.debug(f"Exported door_reqs with {len(settings['door_reqs'])} rooms")

            # Export counting_panel_reqs: panel count requirements for LEVEL 2 location
            if hasattr(world.player_logic, 'counting_panel_reqs'):
                settings['counting_panel_reqs'] = {
                    room: [
                        [self._serialize_access_requirements(access_req), panel_count]
                        for access_req, panel_count in panel_reqs
                    ]
                    for room, panel_reqs in world.player_logic.counting_panel_reqs.items()
                }
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

    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: str = None, connected_region: str = None) -> Dict[str, Any]:  # type: ignore[override]
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
        return self._simplify_entrance_rule(rule, door_room, door_name, entrance_name) or rule

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

        # Replace world.player_logic.X and world.options.X with settings.X
        if obj_type == 'attribute':
            inner_obj = obj.get('object', {})
            attr = obj.get('attr')

            # Check if this is world.player_logic.X or world.options.X
            if isinstance(inner_obj, dict) and inner_obj.get('type') == 'attribute':
                inner_attr = inner_obj.get('attr')
                innermost = inner_obj.get('object', {})

                if isinstance(innermost, dict) and innermost.get('type') == 'name' and innermost.get('name') == 'world':
                    # Handle both world.player_logic.X and world.options.X
                    if inner_attr in ('player_logic', 'options'):
                        # Replace with settings.X
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

    def _simplify_entrance_rule(self, rule: Optional[Dict[str, Any]], door_room: Optional[str], door_name: Optional[str], entrance_name: str) -> Optional[Dict[str, Any]]:
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

    def _replace_door_variable(self, rule: Optional[Dict[str, Any]], door_room: Optional[str], door_name: Optional[str]) -> Optional[Dict[str, Any]]:
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
