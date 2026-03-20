"""Watery Words game-specific export handler.

Watery Words uses a calculate_score_in_logic helper function that computes
accessible score thresholds based on collected letters, turns, and bonuses.

This helper doesn't follow the standard (state, player, ...) signature -
it takes pre-computed values as parameters. The exporter expands these
helper calls inline with the arguments substituted into the body.

See: https://github.com/spineraks-org/ArchipelagoWateryWords
"""

from typing import Any, Dict, List, Set
import copy
import logging

from ..base import GenericGameExportHandler

logger = logging.getLogger(__name__)


class WateryWordsGameExportHandler(GenericGameExportHandler):
    """Watery Words game handler - expands calculate_score_in_logic inline."""

    # Don't preserve the helper as a HelperCall - we expand it inline
    HELPERS_TO_PRESERVE: Set[str] = set()

    AUTO_DISCOVER_WORLD_HELPER_MODULES = True
    AUTO_EXPORT_DISCOVERED_HELPERS = False  # We handle this manually

    # ==========================================================================
    # Rule construction helpers
    # ==========================================================================

    def _constant(self, value: Any) -> Dict[str, Any]:
        """Create a constant value."""
        return {'type': 'constant', 'value': value}

    def _compare(self, left: Any, op: str, right: Any) -> Dict[str, Any]:
        """Create a comparison rule."""
        return {
            'type': 'compare',
            'left': left,
            'op': op,
            'right': right
        }

    def _binary_op(self, left: Any, op: str, right: Any) -> Dict[str, Any]:
        """Create a binary operation."""
        return {
            'type': 'binary_op',
            'left': left,
            'op': op,
            'right': right
        }

    def _add(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create an addition."""
        return self._binary_op(left, '+', right)

    def _sub(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create a subtraction."""
        return self._binary_op(left, '-', right)

    def _mult(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create a multiplication."""
        return self._binary_op(left, '*', right)

    def _div(self, left: Any, right: Any) -> Dict[str, Any]:
        """Create a division."""
        return self._binary_op(left, '/', right)

    def _or(self, *conditions) -> Dict[str, Any]:
        """Create an OR rule."""
        return {'type': 'or', 'conditions': list(conditions)}

    def _conditional(self, test: Dict, if_true: Any, if_false: Any) -> Dict[str, Any]:
        """Create a conditional expression."""
        return {
            'type': 'conditional',
            'test': test,
            'if_true': if_true,
            'if_false': if_false
        }

    def _min(self, *args) -> Dict[str, Any]:
        """Create a min() call."""
        return {
            'type': 'min',
            'args': list(args)
        }

    # ==========================================================================
    # Helper expansion
    # ==========================================================================

    def _build_score_body(self, letters: Any, turns: Any, bonuses: Any,
                          factor: Any, max_items: Any) -> Dict[str, Any]:
        """Build the calculate_score_in_logic body with arguments substituted.

        The original function:
        def calculate_score_in_logic(letters, turns, bonuses, factor, max_items):
            if letters < 8 or turns < 2:
                return min(letters, 7)
            bonus = 1
            if turns > 3:
                bonus = 1 + 0.025 * bonuses
            logic_factor = 1 + (factor - 1) * (letters + turns + bonuses) / max_items
            return logic_factor * min(letters * 2, turns * 18) * bonus
        """
        # Inner expression when letters >= 8 AND turns >= 2:
        # bonus = 1 if turns <= 3 else (1 + 0.025 * bonuses)
        bonus_expr = self._conditional(
            self._compare(turns, '<=', self._constant(3)),
            self._constant(1),
            self._add(
                self._constant(1),
                self._mult(self._constant(0.025), bonuses)
            )
        )

        # logic_factor = 1 + (factor - 1) * (letters + turns + bonuses) / max_items
        logic_factor_expr = self._add(
            self._constant(1),
            self._div(
                self._mult(
                    self._sub(factor, self._constant(1)),
                    self._add(self._add(letters, turns), bonuses)
                ),
                max_items
            )
        )

        # result = logic_factor * min(letters * 2, turns * 18) * bonus
        main_result = self._mult(
            self._mult(
                logic_factor_expr,
                self._min(
                    self._mult(letters, self._constant(2)),
                    self._mult(turns, self._constant(18))
                )
            ),
            bonus_expr
        )

        # Early return when letters < 8 or turns < 2: min(letters, 7)
        early_return = self._min(letters, self._constant(7))

        # Full conditional: if letters < 8 or turns < 2, return early, else return main
        return self._conditional(
            self._or(
                self._compare(letters, '<', self._constant(8)),
                self._compare(turns, '<', self._constant(2))
            ),
            early_return,
            main_result
        )

    def _expand_helper_call(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand a calculate_score_in_logic helper call inline.

        Takes the helper call and its arguments, substitutes them into the
        body, and returns the expanded rule.
        """
        args = rule.get('args', [])
        if len(args) < 5:
            logger.warning(f"calculate_score_in_logic has {len(args)} args, expected 5")
            return rule

        # Args are: [letters, turns, bonuses, factor, max_items]
        letters = args[0]
        turns = args[1]
        bonuses = args[2]
        factor = args[3]
        max_items = args[4]

        # Build the body with arguments substituted
        return self._build_score_body(letters, turns, bonuses, factor, max_items)

    def _expand_helpers_in_rule(self, rule: Any) -> Any:
        """Recursively expand calculate_score_in_logic calls in a rule."""
        if not isinstance(rule, dict):
            return rule

        # Check if this is a calculate_score_in_logic helper call
        # Can be in Rule Builder format ('rule' key) or AST format ('type' key)
        rule_type = rule.get('rule', rule.get('type', ''))
        helper_name = rule.get('name', '')
        original_type = rule.get('_original_ast_type', '')

        # Match Rule Builder format: {'rule': 'calculate_score_in_logic', '_original_ast_type': 'helper'}
        is_rb_helper = rule_type == 'calculate_score_in_logic' and original_type.endswith('helper')
        # Match AST format: {'type': 'helper', 'name': 'calculate_score_in_logic'}
        is_ast_helper = rule_type == 'helper' and helper_name == 'calculate_score_in_logic'

        if is_rb_helper or is_ast_helper:
            return self._expand_helper_call(rule)

        # Recursively process all nested rules
        result = {}
        for key, value in rule.items():
            if key == 'args' and isinstance(value, dict):
                # Recurse into args dict (for Rule Builder format)
                new_value = {}
                for arg_key, arg_val in value.items():
                    if isinstance(arg_val, dict):
                        new_value[arg_key] = self._expand_helpers_in_rule(arg_val)
                    else:
                        new_value[arg_key] = arg_val
                result[key] = new_value
            elif isinstance(value, dict):
                result[key] = self._expand_helpers_in_rule(value)
            elif isinstance(value, list):
                result[key] = [self._expand_helpers_in_rule(item) for item in value]
            else:
                result[key] = value

        return result

    # ==========================================================================
    # Override expand_rule to handle calculate_score_in_logic
    # ==========================================================================

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand rule, including inline expansion of calculate_score_in_logic."""
        # Only apply helper expansion to dict rules
        if not isinstance(rule, dict):
            return super().expand_rule(rule, _depth)

        # First, apply our custom helper expansion
        rule = self._expand_helpers_in_rule(rule)

        # Then call parent's expand_rule for standard expansion
        return super().expand_rule(rule, _depth)

    # ==========================================================================
    # Don't export the helper as a standalone definition
    # ==========================================================================

    def get_helper_definitions(self, world) -> Dict[str, Any]:
        """Don't export any helpers - we expand them inline."""
        return {}
