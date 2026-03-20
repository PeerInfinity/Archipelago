"""Game-specific export handler for Lingo 2.

Lingo 2 uses AccessRequirements objects to track what's needed to access locations
and entrances. These objects contain items, progressives, rooms, letters, cyans,
or_logic, complete_at, and possibilities fields.

The original world uses closure-captured AccessRequirements in lambdas:
    lambda state: lingo2_can_satisfy_requirements(state, new_reqs, required_regions, world)

This handler:
1. Serializes AccessRequirements objects to JSON-compatible dicts
2. Exports location/entrance access data from the captured closures
3. Generates rules that reference the serialized access data
4. Exports player_logic.double_letter_amount for cyan letter checks

See: https://github.com/hatkirby/lingo2-archipelago
"""

import logging
from typing import Any, Dict, List, Optional, Set

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class Lingo2GameExportHandler(GenericGameExportHandler):
    """Export handler for Lingo 2 with AccessRequirements serialization."""

    GAME_NAME = "Lingo 2"

    # Use auto sweep for indirect region dependencies
    USE_AUTO_INDIRECT_CONDITIONS = True

    # Don't preserve any helpers - we inline all rules
    HELPERS_TO_PRESERVE: Set[str] = set()

    # Don't export any helpers - we generate inline rules instead
    AUTO_EXPORT_DISCOVERED_HELPERS = False

    # Export these options at the top level of settings
    EXPORTED_OPTIONS = [
        'shuffle_doors',
        'shuffle_worldports',
        'shuffle_gallery_paintings',
        'shuffle_control_center_colors',
        'enable_icarus',
        'enable_gift_maps',
        'daedalus_roof_access',
        'masteries_requirement',
        'endings_requirement',
        'victory_condition',
        'shuffle_letters',
        'cyan_door_behavior',
        'strict_purple_ending',
        'strict_cyan_ending',
    ]

    def __init__(self, world=None):
        super().__init__(world)
        self._access_requirements_cache: Dict[str, Dict[str, Any]] = {}
        self._double_letter_amount: Dict[str, int] = {}
        if world:
            logger.debug(f"Initialized Lingo 2 export handler for player {world.player}")
            # Cache double_letter_amount for cyan checks
            if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'double_letter_amount'):
                self._double_letter_amount = dict(world.player_logic.double_letter_amount)

    @staticmethod
    def _serialize_access_requirements(access_req) -> Dict[str, Any]:
        """Serialize an AccessRequirements object to a JSON-compatible dict.

        The AccessRequirements class has these fields:
        - items: set[str] - required items
        - progressives: dict[str, int] - progressive item counts
        - rooms: set[str] - required room access
        - letters: dict[str, int] - letter level requirements
        - cyans: bool - requires any cyan letter
        - or_logic: list[list[AccessRequirements]] - AND of ORs
        - complete_at: int | None - minimum required from possibilities
        - possibilities: list[AccessRequirements] - options for complete_at
        """
        if access_req is None:
            return {
                'items': [],
                'progressives': {},
                'rooms': [],
                'letters': {},
                'cyans': False,
                'or_logic': [],
                'complete_at': None,
                'possibilities': []
            }

        result = {
            'items': sorted(list(access_req.items)) if hasattr(access_req, 'items') else [],
            'progressives': dict(access_req.progressives) if hasattr(access_req, 'progressives') else {},
            'rooms': sorted(list(access_req.rooms)) if hasattr(access_req, 'rooms') else [],
            'letters': dict(access_req.letters) if hasattr(access_req, 'letters') else {},
            'cyans': access_req.cyans if hasattr(access_req, 'cyans') else False,
            'or_logic': [],
            'complete_at': access_req.complete_at if hasattr(access_req, 'complete_at') else None,
            'possibilities': []
        }

        # Recursively serialize or_logic (AND of ORs)
        if hasattr(access_req, 'or_logic') and access_req.or_logic:
            for disjunction in access_req.or_logic:
                serialized_disjunction = [
                    Lingo2GameExportHandler._serialize_access_requirements(sub_req)
                    for sub_req in disjunction
                ]
                result['or_logic'].append(serialized_disjunction)

        # Recursively serialize possibilities
        if hasattr(access_req, 'possibilities') and access_req.possibilities:
            result['possibilities'] = [
                Lingo2GameExportHandler._serialize_access_requirements(poss)
                for poss in access_req.possibilities
            ]

        return result

    def _extract_access_requirements_from_closure(self, rule_func) -> Optional[Dict[str, Any]]:
        """Extract AccessRequirements from a lambda's closure.

        Lingo 2 rules are lambdas like:
            lambda state: lingo2_can_satisfy_requirements(state, new_reqs, required_regions, world)

        We extract new_reqs and required_regions from the closure.
        """
        if not hasattr(rule_func, '__closure__') or not rule_func.__closure__:
            return None

        new_reqs = None
        required_regions = None

        for cell in rule_func.__closure__:
            try:
                cell_contents = cell.cell_contents
                # Check if this is an AccessRequirements object
                if hasattr(cell_contents, 'items') and hasattr(cell_contents, 'progressives'):
                    if hasattr(cell_contents, 'letters') and hasattr(cell_contents, 'cyans'):
                        new_reqs = cell_contents
                # Check if this is the required_regions list
                elif isinstance(cell_contents, list):
                    # Check if it's a list of Region objects
                    if len(cell_contents) == 0 or hasattr(cell_contents[0], 'name'):
                        required_regions = cell_contents
            except (AttributeError, ValueError):
                continue

        if new_reqs is not None:
            # Serialize the AccessRequirements
            serialized = self._serialize_access_requirements(new_reqs)

            # Add the required_regions as room names
            if required_regions:
                # required_regions are Region objects - extract their names
                region_names = []
                for region in required_regions:
                    if hasattr(region, 'name'):
                        region_names.append(region.name)
                serialized['required_regions'] = region_names

            return serialized

        return None

    def _access_requirements_to_rule(self, access_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert serialized AccessRequirements to an inline rule.

        This generates a rule using Rule Builder format that combines:
        - Item checks (HasAll for items)
        - Progressive item checks (Has with count)
        - Room/region access (CanReachRegion)
        - Letter checks (Has with count)
        - Cyan checks (HasAny for double letters)
        - Or logic (Or of multiple requirement sets)
        - Complete at (CountTrue for N of possibilities)
        """
        conditions = []

        # Item checks: all items must be had
        items = access_data.get('items', [])
        if items:
            conditions.append({
                'rule': 'HasAll',
                'args': {
                    'item_names': sorted(items)
                }
            })

        # Progressive item checks: each must be had with the required count
        progressives = access_data.get('progressives', {})
        for item, count in progressives.items():
            conditions.append({
                'rule': 'Has',
                'args': {
                    'item_name': item,
                    'count': count
                }
            })

        # Room checks: must be able to reach each room
        rooms = access_data.get('rooms', [])
        for room in rooms:
            conditions.append({
                'rule': 'CanReachRegion',
                'args': {
                    'region_name': room
                }
            })

        # Required regions (from closure-captured Region objects)
        required_regions = access_data.get('required_regions', [])
        for region in required_regions:
            conditions.append({
                'rule': 'CanReachRegion',
                'args': {
                    'region_name': region
                }
            })

        # Letter checks: each letter must be had with the required level
        letters = access_data.get('letters', {})
        for letter, level in letters.items():
            conditions.append({
                'rule': 'Has',
                'args': {
                    'item_name': letter,
                    'count': level
                }
            })

        # Cyan check: must have any double letter at its required count
        # The rule is: any(has(letter, count) for letter, count in double_letter_amount.items())
        if access_data.get('cyans') and self._double_letter_amount:
            cyan_options = []
            for letter, count in self._double_letter_amount.items():
                cyan_options.append({
                    'rule': 'Has',
                    'args': {
                        'item_name': letter,
                        'count': count
                    }
                })
            if cyan_options:
                if len(cyan_options) == 1:
                    conditions.append(cyan_options[0])
                else:
                    conditions.append({
                        'rule': 'Or',
                        'children': cyan_options
                    })

        # Or logic: each disjunction is a list of requirement sets, at least one must pass
        or_logic = access_data.get('or_logic', [])
        for disjunction in or_logic:
            # Each disjunction is a list of AccessRequirements, at least one must be satisfied
            disjunction_rules = []
            for sub_req in disjunction:
                sub_rule = self._access_requirements_to_rule(sub_req)
                if sub_rule:
                    disjunction_rules.append(sub_rule)

            if disjunction_rules:
                if len(disjunction_rules) == 1:
                    conditions.append(disjunction_rules[0])
                else:
                    conditions.append({
                        'rule': 'Or',
                        'children': disjunction_rules
                    })

        # Complete at: at least N of the possibilities must be satisfied
        complete_at = access_data.get('complete_at')
        possibilities = access_data.get('possibilities', [])
        if complete_at is not None and possibilities:
            # Generate rules for each possibility
            poss_rules = []
            for poss in possibilities:
                poss_rule = self._access_requirements_to_rule(poss)
                if poss_rule:
                    poss_rules.append(poss_rule)

            if poss_rules:
                conditions.append({
                    'rule': 'CountTrue',
                    'args': {
                        'count': complete_at
                    },
                    'children': poss_rules
                })

        # Combine all conditions with AND
        if not conditions:
            return {'rule': 'True_', 'args': {}}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {
                'rule': 'And',
                'children': conditions
            }

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """Generate a custom access rule for Lingo 2 locations.

        Instead of analyzing the lambda, we extract the AccessRequirements
        from the closure and generate an inline rule structure.
        """
        location_name = location.name

        # Try to extract AccessRequirements from the closure
        if hasattr(location, 'access_rule') and location.access_rule:
            access_data = self._extract_access_requirements_from_closure(location.access_rule)
            if access_data:
                # Cache the access data for later export via get_location_attributes
                self._access_requirements_cache[location_name] = access_data

                # Generate an inline rule from the access data
                return self._access_requirements_to_rule(access_data)

        return None

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """Add AccessRequirements data to Lingo 2 locations.

        This exports the location's access requirements which were extracted
        from the closure during get_custom_location_access_rule.
        """
        attributes = {}
        location_name = location.name

        # Check if we have cached access requirements
        if location_name in self._access_requirements_cache:
            attributes['access'] = self._access_requirements_cache[location_name]
            logger.debug(f"Added access requirements to location {location_name}")
        else:
            # Try to extract from the closure if not cached
            if hasattr(location, 'access_rule') and location.access_rule:
                access_data = self._extract_access_requirements_from_closure(location.access_rule)
                if access_data:
                    attributes['access'] = access_data
                    logger.debug(f"Extracted access requirements for location {location_name}")

        return attributes

    def handle_complex_exit_rule(self, exit_name: str, exit_rule) -> Optional[Dict[str, Any]]:
        """Handle Lingo 2 entrance rules by extracting AccessRequirements.

        Entrance rules in Lingo 2 are also lambdas with closure-captured AccessRequirements.
        """
        # Try to extract AccessRequirements from the closure
        access_data = self._extract_access_requirements_from_closure(exit_rule)
        if access_data:
            # Store for potential use
            self._access_requirements_cache[f"entrance:{exit_name}"] = access_data

            # Generate an inline rule from the access data
            return self._access_requirements_to_rule(access_data)

    def get_world_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Export Lingo 2-specific world data needed for rule evaluation.

        This exports:
        - double_letter_amount: dict mapping letters to their counts (for cyans check)
        - Options from EXPORTED_OPTIONS
        """
        # Get base world data from parent class
        settings = super().get_world_data(world, multiworld, player)

        # Export double_letter_amount from player_logic
        if hasattr(world, 'player_logic') and hasattr(world.player_logic, 'double_letter_amount'):
            settings['double_letter_amount'] = dict(world.player_logic.double_letter_amount)
            logger.debug(f"Exported double_letter_amount with {len(settings['double_letter_amount'])} letters")

        return settings

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand analyzed rule with Lingo 2-specific transformations.

        - Converts world.player_logic references to settings references
        """
        rule = super().expand_rule(rule, _depth)

        # Replace world.player_logic references with settings
        rule = self._replace_world_references(rule)

        return rule

    def _replace_world_references(self, obj: Any) -> Any:
        """Replace all references to world.player_logic with settings."""
        if not isinstance(obj, dict):
            return obj

        obj_type = obj.get('type')

        # Replace world.player_logic.X with settings.X
        if obj_type == 'attribute':
            inner_obj = obj.get('object', {})
            attr = obj.get('attr')

            # Check if this is world.player_logic.X
            if isinstance(inner_obj, dict) and inner_obj.get('type') == 'attribute':
                inner_attr = inner_obj.get('attr')
                innermost = inner_obj.get('object', {})

                if isinstance(innermost, dict) and innermost.get('type') == 'name' and innermost.get('name') == 'world':
                    if inner_attr == 'player_logic':
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
                result[key] = [
                    self._replace_world_references(item) if isinstance(item, (dict, list)) else item
                    for item in value
                ]
            else:
                result[key] = value

        return result
