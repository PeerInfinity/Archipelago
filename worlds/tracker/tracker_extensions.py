"""
Tracker Extensions for UT Comparison Testing

This module contains extensions to TrackerCore that support UT comparison testing,
including sphere log mode, event filtering options, and debug logging.

These extensions modify the behavior of updateTracker() to support:
- Lenient error handling for datapackage mismatches
- Configurable event item filtering
- Debug logging for test analysis
"""

import logging
from collections import Counter
from typing import Any, Callable, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from BaseClasses import CollectionState, MultiWorld
    from NetUtils import NetworkItem


class TrackerTestingMixin:
    """
    Mixin that adds testing-related extensions to TrackerCore.

    This mixin provides:
    - sphere_log_mode: Lenient error handling for UT comparison tests
    - filter_event_items: Control whether to include event items in output
    - auto_collect_events: Control whether to auto-collect events
    - Debug logging callback support

    Required attributes from base class:
    - logger: logging.Logger
    - multiworld: Optional[MultiWorld]
    - player_id: Optional[int]
    - tracker_items_received: list[NetworkItem]
    """

    # Testing mode attributes
    seed_override: Optional[int] = None
    sphere_log_mode: bool = False
    auto_collect_events: bool = True
    filter_event_items: bool = True

    # Debug logging
    _debug_logger: Optional[Callable[[str, dict], None]] = None

    def _init_testing_mixin(self):
        """Initialize testing mixin attributes. Call from __init__."""
        self.seed_override = None
        self.sphere_log_mode = False
        self.auto_collect_events = True
        self.filter_event_items = True
        self._debug_logger = None

    def set_debug_logger(self, debug_logger: Optional[Callable[[str, dict], None]]):
        """Set callback for debug logging (used by TrackerClient for debug log file)."""
        self._debug_logger = debug_logger

    def _log_debug(self, event_type: str, data: dict):
        """Log a debug event if debug logger is configured."""
        if self._debug_logger:
            self._debug_logger(event_type, data)

    def _filter_invalid_items(self, items_received: list, item_id_to_name: dict) -> list:
        """
        Filter out invalid items when in sphere_log_mode.

        In sphere_log_mode, we log a warning but continue processing with valid items.
        In normal mode, we don't filter (the caller should raise an exception).

        Args:
            items_received: List of NetworkItem objects
            item_id_to_name: Mapping of item IDs to names

        Returns:
            Filtered list of items (only valid ones if sphere_log_mode, else all)
        """
        if not self.sphere_log_mode:
            return items_received

        valid_items = [item for item in items_received if item.item in item_id_to_name]
        invalid_count = len(items_received) - len(valid_items)

        if invalid_count > 0:
            invalid_items = [str(item.item) for item in items_received if item.item not in item_id_to_name]
            self.logger.warning(
                f"Skipping {invalid_count} unknown items (datapackage mismatch?): "
                f"{invalid_items[:5]}{'...' if len(invalid_items) > 5 else ''}"
            )

        return valid_items

    def _should_include_location(self, location, address_is_none_or_list: bool) -> bool:
        """
        Determine if a location should be included in the tracker output.

        Args:
            location: The location object
            address_is_none_or_list: True if location.address is None or a list

        Returns:
            True if the location should be included
        """
        # Filter event locations if filter_event_items is enabled
        if self.filter_event_items and address_is_none_or_list:
            return False
        return True

    def _should_include_item_in_count(self, item) -> bool:
        """
        Determine if an item should be included in all_items count.

        Args:
            item: The item object

        Returns:
            True if the item should be counted
        """
        # Filter event items (code is None) if filter_event_items is enabled
        if self.filter_event_items and item.code is None:
            return False
        return True

    def _should_sweep_for_advancements(self) -> bool:
        """
        Determine if we should sweep for event advancements.

        Returns:
            True if auto_collect_events is enabled
        """
        return self.auto_collect_events
