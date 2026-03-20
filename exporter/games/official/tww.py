"""The Wind Waker game-specific export handler.

This exporter handles TWW-specific patterns:
- Chart randomization: When randomize_charts is enabled, the mapping of
  island numbers to chart names is shuffled. The _tww_has_chart_for_island
  state method uses this dynamic mapping, which must be expanded during
  export to the actual chart item names.
"""

from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class TWWGameExportHandler(GenericGameExportHandler):
    """Export handler for The Wind Waker."""

    def __init__(self, world=None):
        """Initialize with optional world reference."""
        super().__init__(world)
        self._chart_mapping: Optional[Dict[int, str]] = None

        # Extract chart mapping from world if available
        if world is not None:
            self._extract_chart_mapping(world)

    def _extract_chart_mapping(self, world) -> None:
        """Extract the island-to-chart mapping from the world.

        This mapping is randomized when randomize_charts is enabled, so we
        need to capture it during export to properly expand _tww_has_chart_for_island
        calls.
        """
        try:
            if hasattr(world, 'charts') and hasattr(world.charts, 'island_number_to_chart_name'):
                self._chart_mapping = dict(world.charts.island_number_to_chart_name)
                logger.debug(f"TWW: Extracted chart mapping with {len(self._chart_mapping)} entries")
        except Exception as e:
            logger.warning(f"TWW: Could not extract chart mapping: {e}")

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand a rule, handling TWW-specific state methods.

        Intercepts _tww_has_chart_for_island state_method calls and expands
        them to the actual chart item requirements using the world's chart
        mapping.
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type') or rule.get('rule')

        # Handle StateMethod rules from the AST converter
        if rule.get('rule') == 'StateMethod':
            args = rule.get('args', {})
            method = args.get('method', '')

            if method == '_tww_has_chart_for_island':
                return self._expand_chart_for_island(args, _depth)

        # Handle state_method rules (lowercase type)
        if rule_type == 'state_method':
            method = rule.get('method', '')

            if method == '_tww_has_chart_for_island':
                return self._expand_chart_for_island_from_state_method(rule, _depth)

        # Fall through to parent implementation for everything else
        return super().expand_rule(rule, _depth)

    def _expand_chart_for_island(self, args: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Expand a _tww_has_chart_for_island StateMethod call.

        Args structure from AST converter:
        {
            "method": "_tww_has_chart_for_island",
            "args": [{"type": "constant", "value": 47}]
        }
        """
        method_args = args.get('args', [])

        if not method_args:
            logger.warning("TWW: _tww_has_chart_for_island called without island_number argument")
            return {'type': 'constant', 'value': False}

        # Extract island number from the first argument
        first_arg = method_args[0]
        island_number = None

        if isinstance(first_arg, dict):
            if first_arg.get('type') == 'constant':
                island_number = first_arg.get('value')
        elif isinstance(first_arg, (int, float)):
            island_number = int(first_arg)

        if island_number is None:
            logger.warning(f"TWW: Could not extract island_number from args: {method_args}")
            # Return the original state_method call if we can't expand it
            return {
                'rule': 'StateMethod',
                'args': args
            }

        return self._build_chart_rule(island_number, _depth)

    def _expand_chart_for_island_from_state_method(self, rule: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Expand a _tww_has_chart_for_island state_method call.

        Rule structure:
        {
            "type": "state_method",
            "method": "_tww_has_chart_for_island",
            "args": [island_number or {"type": "constant", "value": island_number}]
        }
        """
        method_args = rule.get('args', [])

        if not method_args:
            logger.warning("TWW: _tww_has_chart_for_island called without island_number argument")
            return {'type': 'constant', 'value': False}

        # Extract island number from the first argument
        first_arg = method_args[0]
        island_number = None

        if isinstance(first_arg, dict):
            if first_arg.get('type') == 'constant':
                island_number = first_arg.get('value')
        elif isinstance(first_arg, (int, float)):
            island_number = int(first_arg)

        if island_number is None:
            logger.warning(f"TWW: Could not extract island_number from args: {method_args}")
            return rule  # Return original if we can't expand

        return self._build_chart_rule(island_number, _depth)

    def _build_chart_rule(self, island_number: int, _depth: int) -> Dict[str, Any]:
        """Build the actual chart requirement rule for an island.

        For Triforce Charts, also requires Wallet Capacity Upgrade.
        For regular Treasure Charts, just requires the chart.

        Args:
            island_number: The island number to build the rule for
            _depth: Current expansion depth

        Returns:
            A rule dict that checks for the required chart (and wallet if needed)
        """
        if self._chart_mapping is None:
            logger.warning(f"TWW: No chart mapping available, cannot expand island {island_number}")
            return {
                'type': 'state_method',
                'method': '_tww_has_chart_for_island',
                'args': [{'type': 'constant', 'value': island_number}]
            }

        chart_name = self._chart_mapping.get(island_number)

        if chart_name is None:
            logger.warning(f"TWW: No chart mapping for island {island_number}")
            return {'type': 'constant', 'value': False}

        logger.debug(f"TWW: Expanding _tww_has_chart_for_island({island_number}) -> {chart_name}")

        # Build the chart requirement rule
        chart_has_rule = {
            'rule': 'Has',
            'args': {'item_name': chart_name}
        }

        # For Triforce Charts, also require Wallet Capacity Upgrade
        # (per the original _tww_has_chart_for_island logic)
        if 'Triforce Chart' in chart_name:
            wallet_has_rule = {
                'rule': 'Has',
                'args': {'item_name': 'Wallet Capacity Upgrade'}
            }
            return {
                'rule': 'And',
                'children': [chart_has_rule, wallet_has_rule]
            }

        return chart_has_rule
