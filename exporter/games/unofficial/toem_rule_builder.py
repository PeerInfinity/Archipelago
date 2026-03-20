"""TOEM Rule Builder game-specific export handler.

Same root cause as toem_original: location groups are stored as sets, so
locations are added to regions in non-deterministic set iteration order.
Enabling SORT_REGION_LOCATIONS_BY_NAME ensures deterministic output.

This handler covers both toem_rule_builder and toem_rule_builder_worldgen.
"""

from ..base import GenericGameExportHandler


class ToemRuleBuilderExportHandler(GenericGameExportHandler):
    """Export handler for TOEM Rule Builder."""

    SORT_REGION_LOCATIONS_BY_NAME: bool = True
