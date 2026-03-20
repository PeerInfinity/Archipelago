"""Secret of Evermore game-specific export handler.

SOE uses pyevermizer for logic. Unlike most games, SOE locations don't have
Python lambda rules. Instead, pyevermizer provides requirements/provides data
that we convert to helper calls.
"""

from functools import cached_property
import inspect
import itertools
import logging
from typing import Any, Dict, List, Optional

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class SoEGameExportHandler(GenericGameExportHandler):
    """Export handler for Secret of Evermore."""

    # SOE uses resolved_items instead of base_items for sphere inventory
    USE_RESOLVED_ITEMS = True

    @cached_property
    def pyevermizer(self):
        """Lazy-load pyevermizer module."""
        try:
            import pyevermizer
            return pyevermizer
        except ImportError:
            logger.warning("Could not import pyevermizer")
            return None

    @cached_property
    def progress_id_to_name(self) -> Dict[int, str]:
        """Build progress ID to name mapping from pyevermizer P_* constants."""
        if not self.pyevermizer:
            return {}
        return {
            val: name
            for name, val in inspect.getmembers(self.pyevermizer)
            if name.startswith('P_') and isinstance(val, int)
        }

    @cached_property
    def location_name_to_raw(self) -> Dict[str, Any]:
        """Build location name to raw pyevermizer location mapping."""
        if not self.pyevermizer:
            return {}
        result = {}
        for loc in itertools.chain(
            self.pyevermizer.get_locations(),  # type: ignore[attr-defined]
            self.pyevermizer.get_sniff_locations()  # type: ignore[attr-defined]
        ):
            # Use the AP location name format
            if loc.type == self.pyevermizer.CHECK_GOURD:  # type: ignore[attr-defined]
                loc_name = f"{loc.name} #{loc.index}"
            elif loc.type == self.pyevermizer.CHECK_SNIFF:  # type: ignore[attr-defined]
                loc_name = f"{loc.name} Sniff #{loc.index}"
            else:
                loc_name = loc.name
            result[loc_name] = loc
        return result

    def _create_has_helper(self, progress_id: int, count: int = 1) -> Dict[str, Any]:
        """Create a helper call rule for checking progress."""
        progress_name = self.progress_id_to_name.get(progress_id, f"P_{progress_id}")
        return {
            'type': 'helper',
            'name': 'has',
            'args': [
                {'type': 'constant', 'value': progress_id},
                {'type': 'constant', 'value': count}
            ],
            'comment': f"Requires {count}x {progress_name}"
        }

    def _transform_requirements(self, requires: List[tuple]) -> Optional[Dict[str, Any]]:
        """Transform pyevermizer requirements to rule format."""
        if not requires:
            return None
        conditions = [self._create_has_helper(pid, count) for count, pid in requires]
        if len(conditions) == 1:
            return conditions[0]
        return {'type': 'and', 'conditions': conditions}

    def get_item_data(self, world) -> Dict[str, Dict[str, Any]]:
        """Return SOE item data including pyevermizer provides information."""
        # Get base item data from GenericGameExportHandler
        item_data = super().get_item_data(world)

        if not self.pyevermizer:
            return item_data

        # Extend with pyevermizer provides information
        for item in itertools.chain(
            self.pyevermizer.get_items(),  # type: ignore[attr-defined]
            self.pyevermizer.get_extra_items(),  # type: ignore[attr-defined]
            self.pyevermizer.get_sniff_items()  # type: ignore[attr-defined]
        ):
            if item.name in item_data and item.provides:
                item_data[item.name]['provides'] = [
                    {
                        'count': count,
                        'progress_id': pid,
                        'progress_name': self.progress_id_to_name.get(pid, f"P_{pid}")
                    }
                    for count, pid in item.provides
                ]

        # Add logic rules that provide progress when requirements are met
        logic_rules = [
            {
                'requires': [{'count': c, 'progress_id': p} for c, p in rule.requires],
                'provides': [{'count': c, 'progress_id': p} for c, p in rule.provides]
            }
            for rule in self.pyevermizer.get_logic()  # type: ignore[attr-defined]
            if rule.provides
        ]
        if logic_rules:
            item_data['__soe_logic_rules__'] = {'name': '__soe_logic_rules__', 'rules': logic_rules}

        return item_data

    def get_location_attributes(self, location, world) -> Dict[str, Any]:
        """Get location access rules from pyevermizer."""
        location_name = getattr(location, 'name', None)
        if not location_name:
            return {}

        # "Done" event location needs P_FINAL_BOSS
        if location_name == 'Done':
            if self.pyevermizer:
                return {'access_rule': self._create_has_helper(self.pyevermizer.P_FINAL_BOSS)}  # type: ignore[attr-defined]
            return {}

        # Get rules from pyevermizer for regular locations
        evermizer_loc = self.location_name_to_raw.get(location_name)
        if evermizer_loc:
            if evermizer_loc.requires:
                rule = self._transform_requirements(evermizer_loc.requires)
                if rule:
                    return {'access_rule': rule}
            return {'access_rule': {'type': 'constant', 'value': True}}

        return {}
