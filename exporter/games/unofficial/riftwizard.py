"""Rift Wizard game-specific export handler.

This exporter handles Rift Wizard-specific patterns:
- _riftwizard_mana state method: Checks if the player has enough mana from
  Mana Dot and Double Mana Dot items. Mana Dot gives 1 mana, Double Mana Dot
  gives 2 mana. The rule passes if total mana >= required amount.
"""

from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class RiftWizardGameExportHandler(GenericGameExportHandler):
    """Export handler for Rift Wizard."""

    GAME_NAME = 'Rift Wizard'

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand a rule, handling Rift Wizard-specific state methods.

        Intercepts _riftwizard_mana state_method calls and expands them to
        WeightedSum rules that check if the player has enough mana items.

        The _riftwizard_mana method calculates:
            mana = count("Mana Dot") + 2 * count("Double Mana Dot")
            return mana >= required_amount
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type') or rule.get('rule')

        # Handle StateMethod rules from the AST converter
        if rule.get('rule') == 'StateMethod':
            args = rule.get('args', {})
            method = args.get('method', '')

            if method == '_riftwizard_mana':
                return self._expand_riftwizard_mana(args, _depth)

        # Handle state_method rules (lowercase type)
        if rule_type == 'state_method':
            method = rule.get('method', '')

            if method == '_riftwizard_mana':
                return self._expand_riftwizard_mana_from_state_method(rule, _depth)

        # Fall through to parent implementation for everything else
        return super().expand_rule(rule, _depth)

    def _expand_riftwizard_mana(self, args: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Expand a _riftwizard_mana StateMethod call to a WeightedSum rule.

        Args structure from AST converter:
        {
            "method": "_riftwizard_mana",
            "args": [{"type": "constant", "value": 5}]  # required mana amount
        }

        Returns a WeightedSum rule:
        WeightedSum(threshold=5, items=[("Mana Dot", 1.0), ("Double Mana Dot", 2.0)])
        """
        method_args = args.get('args', [])

        if not method_args:
            logger.warning("Rift Wizard: _riftwizard_mana called without amount argument")
            return {'rule': 'True_'}

        # Extract required mana amount from the first argument
        first_arg = method_args[0]
        required_mana = self._extract_constant_or_evaluate(first_arg)

        if required_mana is None:
            logger.warning(f"Rift Wizard: Could not extract mana amount from args: {method_args}")
            # Return the original state_method call if we can't expand it
            return {
                'rule': 'StateMethod',
                'args': args
            }

        # Convert to WeightedSum rule
        return self._create_weighted_sum_rule(required_mana)

    def _expand_riftwizard_mana_from_state_method(self, rule: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Expand a state_method format _riftwizard_mana call to a WeightedSum rule.

        Args structure from state_method format:
        {
            "type": "state_method",
            "method": "_riftwizard_mana",
            "args": [{"type": "constant", "value": 5}]
        }
        """
        method_args = rule.get('args', [])

        if not method_args:
            logger.warning("Rift Wizard: _riftwizard_mana called without amount argument")
            return {'rule': 'True_'}

        # Extract required mana amount from the first argument
        first_arg = method_args[0]
        required_mana = self._extract_constant_or_evaluate(first_arg)

        if required_mana is None:
            logger.warning(f"Rift Wizard: Could not extract mana amount from args: {method_args}")
            return rule

        # Convert to WeightedSum rule
        return self._create_weighted_sum_rule(required_mana)

    def _extract_constant_or_evaluate(self, arg: Any) -> Optional[int]:
        """Extract a constant value from an argument, evaluating simple expressions.

        Handles:
        - {"type": "constant", "value": 5}
        - {"type": "helper", "name": "int", "args": [...]}
        - {"type": "binary_op", ...}
        - Literal integers

        Note: Uses _extract_as_float internally to preserve floating point precision
        during intermediate calculations, only converting to int at the end.
        """
        # Handle int() helper wrapping - apply int() after evaluating inner expression
        if isinstance(arg, dict):
            arg_type = arg.get('type')
            if arg_type == 'helper' and arg.get('name') == 'int':
                inner_args = arg.get('args', [])
                if inner_args:
                    # Evaluate inner expression as float, then convert to int
                    result = self._extract_as_float(inner_args[0])
                    return int(result) if result is not None else None

        # For all other cases, evaluate as float and convert to int
        result = self._extract_as_float(arg)
        return int(result) if result is not None else None

    def _extract_as_float(self, arg: Any) -> Optional[float]:
        """Extract a value from an argument as a float, preserving precision.

        This is used internally to evaluate complex expressions without
        premature truncation from int() conversion.

        Handles:
        - {"type": "constant", "value": 5}
        - {"type": "binary_op", ...}
        - Literal integers/floats
        """
        if isinstance(arg, (int, float)):
            return float(arg)

        if not isinstance(arg, dict):
            return None

        arg_type = arg.get('type')

        if arg_type == 'constant':
            value = arg.get('value', 0)
            return float(value) if isinstance(value, (int, float)) else None

        # Handle binary operations (e.g., 3 * 25 / 8 * 3 - 3)
        # Keep intermediate values as floats to avoid premature truncation
        if arg_type == 'binary_op':
            left = self._extract_as_float(arg.get('left'))
            right = self._extract_as_float(arg.get('right'))
            op = arg.get('op', '')

            if left is not None and right is not None:
                if op == '*':
                    return left * right
                elif op == '+':
                    return left + right
                elif op == '-':
                    return left - right
                elif op == '/':
                    return left / right if right != 0 else None
                elif op == '//':
                    return float(int(left) // int(right)) if right != 0 else None

        return None

    def _create_weighted_sum_rule(self, required_mana: int) -> Dict[str, Any]:
        """Create a WeightedSum rule for mana checking.

        Equivalent to:
            count("Mana Dot") + 2 * count("Double Mana Dot") >= required_mana

        Uses the weighted_sum helper format that the rule_codegen expects:
        {
            "rule": "weighted_sum",
            "_original_ast_type": "helper",
            "args": [threshold, items_list]
        }
        """
        # Use weighted_sum helper format that rule_codegen expects
        return {
            'rule': 'weighted_sum',
            '_original_ast_type': 'helper',
            'args': [
                {'rule': 'Constant', 'args': {'value': float(required_mana)}},
                {'rule': 'Constant', 'args': {'value': [
                    ['Mana Dot', 1.0],
                    ['Double Mana Dot', 2.0]
                ]}}
            ]
        }
