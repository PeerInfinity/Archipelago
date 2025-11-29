"""Secret of Evermore game-specific export handler."""

from typing import Any, Dict, List, Optional
from .base import BaseGameExportHandler
import logging

logger = logging.getLogger(__name__)

class SoEGameExportHandler(BaseGameExportHandler):
    """Export handler for Secret of Evermore.

    Secret of Evermore uses pyevermizer for logic. Unlike most games,
    SOE locations don't have Python lambda rules. Instead, the pyevermizer
    C++ library provides requirements/provides data that we need to convert
    to helper calls.
    """
    GAME_NAME = 'Secret of Evermore'

    def __init__(self):
        super().__init__()
        # Import pyevermizer to get progress constants
        try:
            import pyevermizer
            self.pyevermizer = pyevermizer
            # Map progress IDs to names
            self.progress_id_to_name = self._build_progress_map()
            # Get location mapping
            self.location_id_to_raw = self._get_location_mapping()
            logger.info(f"SOE exporter initialized with {len(self.location_id_to_raw)} evermizer locations")
        except ImportError:
            logger.warning("Could not import pyevermizer - SOE export may be incomplete")
            self.pyevermizer = None
            self.progress_id_to_name = {}
            self.location_id_to_raw = {}

    def _build_progress_map(self) -> Dict[int, str]:
        """Build a mapping from progress ID to name."""
        import inspect
        progress_map = {}
        for name, val in inspect.getmembers(self.pyevermizer):
            if name.startswith('P_') and isinstance(val, int):
                progress_map[val] = name
        return progress_map

    def _get_location_mapping(self) -> Dict[str, Any]:
        """Get pyevermizer locations mapped by name."""
        import itertools

        _id_base = 64000
        _id_offset = {
            self.pyevermizer.CHECK_ALCHEMY: _id_base + 0,
            self.pyevermizer.CHECK_BOSS: _id_base + 50,
            self.pyevermizer.CHECK_GOURD: _id_base + 100,
            self.pyevermizer.CHECK_NPC: _id_base + 400,
            self.pyevermizer.CHECK_EXTRA: _id_base + 800,
            self.pyevermizer.CHECK_TRAP: _id_base + 900,
            self.pyevermizer.CHECK_SNIFF: _id_base + 1000
        }

        _locations = self.pyevermizer.get_locations()
        _sniff_locations = self.pyevermizer.get_sniff_locations()

        loc_map = {}
        for loc in itertools.chain(_locations, _sniff_locations):
            ap_id = _id_offset[loc.type] + loc.index
            # Use the AP location name format (with # for gourds)
            loc_name = f"{loc.name} #{loc.index}" if loc.type == self.pyevermizer.CHECK_GOURD else loc.name
            if loc.type == self.pyevermizer.CHECK_SNIFF:
                loc_name = f"{loc.name} Sniff #{loc.index}"
            loc_map[loc_name] = loc

        return loc_map

    def transform_pyevermizer_requirements(self, requires: List[tuple]) -> Optional[Dict[str, Any]]:
        """
        Transform pyevermizer requirements to rule format.

        Args:
            requires: List of (count, progress_id) tuples

        Returns:
            Rule dict or None if no requirements
        """
        if not requires:
            return None

        conditions = []
        for count, progress_id in requires:
            progress_name = self.progress_id_to_name.get(progress_id, f"UNKNOWN_{progress_id}")

            # Create a helper call for this requirement
            # The frontend will need to implement these helpers
            conditions.append({
                'type': 'helper',
                'name': 'has',
                'args': [
                    {'type': 'constant', 'value': progress_id},
                    {'type': 'constant', 'value': count}
                ],
                'comment': f"Requires {count}x {progress_name}"
            })

        if len(conditions) == 1:
            return conditions[0]
        elif len(conditions) > 1:
            return {
                'type': 'and',
                'conditions': conditions
            }

        return None

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """
        Return SOE item data including pyevermizer provides information.
        """
        if not self.pyevermizer:
            return {}

        import itertools

        item_data = {}

        # Get all items including extra items
        all_items = list(itertools.chain(
            self.pyevermizer.get_items(),
            self.pyevermizer.get_extra_items(),
            self.pyevermizer.get_sniff_items()
        ))

        # Build item data with provides information
        for item in all_items:
            if item.name not in item_data:
                item_data[item.name] = {
                    'name': item.name,
                    'provides': []
                }

                # Add provides information (list of [count, progress_id])
                # Only add provides once per unique item name
                if item.provides:
                    for count, progress_id in item.provides:
                        progress_name = self.progress_id_to_name.get(progress_id, f"P_{progress_id}")
                        item_data[item.name]['provides'].append({
                            'count': count,
                            'progress_id': progress_id,
                            'progress_name': progress_name
                        })

                # Add standard item fields that all items need
                # These ensure compatibility with the state manager
                if 'event' not in item_data[item.name]:
                    item_data[item.name]['event'] = False
                if 'type' not in item_data[item.name]:
                    item_data[item.name]['type'] = None
                if 'max_count' not in item_data[item.name]:
                    item_data[item.name]['max_count'] = 1

        # Also add logic rules that provide progress when requirements are met
        # These act like "virtual items" that the frontend can check
        rules = self.pyevermizer.get_logic()
        logic_rules = []
        for i, rule in enumerate(rules):
            if rule.provides:
                rule_data = {
                    'requires': [{'count': count, 'progress_id': pid} for count, pid in rule.requires],
                    'provides': [{'count': count, 'progress_id': pid} for count, pid in rule.provides]
                }
                logic_rules.append(rule_data)

        # Store logic rules in a special metadata section
        if logic_rules:
            item_data['__soe_logic_rules__'] = {
                'name': '__soe_logic_rules__',
                'rules': logic_rules
            }

        logger.info(f"Exported {len(item_data)} SOE items with provides data")

        return item_data

    def _convert_logic_has_call(self, rule) -> Optional[Dict[str, Any]]:
        """
        Convert a self.logic.has(...) call to a helper call.

        Expected input patterns:
        1. With constant progress ID (already resolved):
           {
               'type': 'function_call',
               'function': {
                   'type': 'attribute',
                   'object': {'type': 'attribute', 'object': {'type': 'name', 'name': 'self'}, 'attr': 'logic'},
                   'attr': 'has'
               },
               'args': [{'type': 'constant', 'value': 11}]  # progress_id
           }

        2. With pyevermizer.P_XXX reference (not yet resolved):
           {
               'type': 'function_call',
               'function': {'type': 'attribute', 'object': {...'self.logic'...}, 'attr': 'has'},
               'args': [{'type': 'attribute', 'object': {'type': 'name', 'name': 'pyevermizer'}, 'attr': 'P_XXX'}]
           }
        """
        if not isinstance(rule, dict) or rule.get('type') != 'function_call':
            return None

        # Check if it's a call to self.logic.has
        func = rule.get('function', {})
        if not (func.get('type') == 'attribute' and func.get('attr') == 'has'):
            return None

        # Verify it's self.logic.has (not just any .has method)
        func_obj = func.get('object', {})
        if func_obj.get('type') == 'attribute' and func_obj.get('attr') == 'logic':
            logic_obj = func_obj.get('object', {})
            if logic_obj.get('type') == 'name' and logic_obj.get('name') == 'self':
                # This is self.logic.has - now extract the progress ID
                args = rule.get('args', [])
                if len(args) >= 1:
                    progress_id = None
                    progress_name = None
                    count = 1  # default count

                    # Case 1: First arg is a constant (already resolved progress ID)
                    if args[0].get('type') == 'constant':
                        progress_id = args[0].get('value')
                        progress_name = self.progress_id_to_name.get(progress_id, f"P_{progress_id}")

                    # Case 2: First arg is pyevermizer.P_XXX
                    elif args[0].get('type') == 'attribute' and args[0].get('object', {}).get('name') == 'pyevermizer':
                        progress_name = args[0].get('attr', '')
                        # Look up the progress ID
                        for pid, name in self.progress_id_to_name.items():
                            if name == progress_name:
                                progress_id = pid
                                break

                    # Extract count if provided (second argument)
                    if len(args) >= 2 and args[1].get('type') == 'constant':
                        count = args[1].get('value', 1)

                    if progress_id is not None:
                        # Convert to a helper call
                        return {
                            'type': 'helper',
                            'name': 'has',
                            'args': [
                                {'type': 'constant', 'value': progress_id},
                                {'type': 'constant', 'value': count}
                            ],
                            'comment': f"Requires {count}x {progress_name}"
                        }

        return None

    def _rule_has_unresolved_names(self, rule) -> bool:
        """Check if a rule contains unresolved Python-specific names like 'self' or 'pyevermizer'."""
        if not isinstance(rule, dict):
            return False

        # Check if this is a name reference to Python-specific objects
        if rule.get('type') == 'name' and rule.get('name') in ('self', 'pyevermizer'):
            return True

        # Recursively check nested structures
        for key, value in rule.items():
            if isinstance(value, dict):
                if self._rule_has_unresolved_names(value):
                    return True
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and self._rule_has_unresolved_names(item):
                        return True

        return False

    def postprocess_rule(self, rule) -> Dict[str, Any]:
        """
        Post-process analyzed rules to convert SOE-specific patterns.
        This is called after the analyzer processes Python rules.
        """
        if not rule:
            return rule

        # Try to convert self.logic.has() calls
        converted = self._convert_logic_has_call(rule)
        if converted:
            return converted

        # If the rule has unresolved names, return None to signal it should be replaced
        if self._rule_has_unresolved_names(rule):
            logger.debug("Discarding malformed rule with unresolved names")
            return None

        return rule

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """
        Override to add pyevermizer requirements for locations that don't have Python rules.
        """
        try:
            location_name = getattr(location, 'name', None)
            attrs = {}

            # Try to get evermizer requirements from the raw location data
            # Note: If the location has a Python rule, it will be processed by postprocess_rule first.
            # If postprocess_rule returns None, the main exporter will call this method to get a replacement.
            in_map = location_name in self.location_id_to_raw if location_name else False
            if location_name and in_map:
                evermizer_loc = self.location_id_to_raw[location_name]
                if evermizer_loc.requires:
                    # Convert pyevermizer requirements to rule format
                    rule = self.transform_pyevermizer_requirements(evermizer_loc.requires)
                    if rule:
                        attrs['access_rule'] = rule
                        logger.debug(f"Added helper rule to {location_name}")
                else:
                    # Explicitly set to True for locations with no requirements
                    attrs['access_rule'] = {'type': 'constant', 'value': True}
                    logger.debug(f"Added constant True rule to {location_name}")
            else:
                # Location not in evermizer mapping (e.g., event locations)
                # The rule should have been provided by postprocess_rule
                logger.debug(f"Location {location_name} not in evermizer mapping")

            return attrs
        except Exception as e:
            logger.error(f"ERROR in get_location_attributes for {location_name}: {e}")
            import traceback
            traceback.print_exc()
            return {}

    def get_settings_data(self, world, multiworld, player) -> Dict[str, Any]:
        """Extracts SOE-specific game settings for export."""
        settings_dict = super().get_settings_data(world, multiworld, player)
        settings_dict['use_resolved_items'] = True
        return settings_dict
