"""Lunacid game-specific export handler.

Lunacid uses a LunacidRules helper class that encapsulates complex rule logic.
This handler expands certain helper method calls to their equivalent rule builder
expressions to prevent code generation errors.

KNOWN LIMITATIONS:
The LunacidRules class has 30+ helper methods that evaluate complex, option-dependent
logic. Many of these methods check multiple conditions, option values, and item
combinations that are difficult to express in rule builder format.

Helper methods that ARE properly supported:
- has_coins_for_door: Converted to HasCount("Strange Coin", required_strange_coin)

Helper methods that are expanded to True (may cause logic mismatches):
- has_light_source: Depends on starting_area, quenchsanity, etnas_pupil options
- has_door_key: Depends on door_locks option and which door is being checked
- can_jump_given_height: Depends on tricks_and_glitches, items obtained
- has_every_spell: Very complex spell collection logic
- And many other methods...

Because of these limitations, Lunacid may have logic mismatches in the Universal
Tracker - the tracker may think more locations are accessible than they actually are.
This is expected behavior for apworlds with complex option-dependent logic.

The fix in this handler prevents the previous error where LunacidRules method calls
were generating invalid Python code like `True.has_coins_for_door(...)`.
"""

from typing import Dict, Any, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class LunacidGameExportHandler(GenericGameExportHandler):
    """Export handler for Lunacid.

    Expands LunacidRules helper method calls to rule builder expressions.
    """

    GAME_NAME = 'Lunacid'

    # LunacidRules helper methods that may be exported as standalone helpers
    # These are complex option-dependent methods that we expand to True
    LUNACID_HELPERS = {
        'can_reach_and_hurt_enemy',
        'has_aoe_spell',
        'can_reach_any_region',
        'can_reach_all_regions',
        'can_reach_location',
        'can_jump_given_height',
        'has_door_key',
        'has_light_source',
        'can_reach_level_in_levelsanity',
        'can_level_reasonably',
        'has_spell',
        'has_all_spells',
        'has_every_spell',
        'can_reach_every_necessary_mob_for_spells',
        'can_purchase_item',
        'has_blood_spell_access',
        'has_keys_for_basin_or_canopy',
        'has_switch_key',
        'has_crystal_orb',
        'has_element_access',
        'has_ranged_element_access',
        'has_coins_for_door',
        'has_black_book_count',
        'can_buy_jotunn',
        'can_defeat_the_prince',
        'can_reach_monster',
        'can_get_weapon',
        'can_kill_death',
        'can_obtain_alchemy_item',
        'can_obtain_all_alchemy_items',
        'can_rock_bridge_skip',
    }

    # Cache option values
    _required_strange_coin: int = 30  # default

    def __init__(self, world=None):
        super().__init__(world)
        self._required_strange_coin = 30
        if world:
            self._extract_options(world)

    def _extract_options(self, world) -> None:
        """Extract option values from the world for rule resolution."""
        try:
            options = world.options
            if hasattr(options, 'required_strange_coin'):
                self._required_strange_coin = options.required_strange_coin.value
                logger.debug(f"Lunacid: required_strange_coin = {self._required_strange_coin}")
        except Exception as e:
            logger.debug(f"Could not extract Lunacid options: {e}")

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Lunacid-specific rules.

        Converts LunacidRules.method() calls to Rule Builder format.
        """
        if not isinstance(rule, dict):
            if isinstance(rule, list):
                return [self.expand_rule(r, _depth) for r in rule]
            return rule

        rule_type = rule.get('rule', '') or rule.get('type', '')

        # Handle both AST format (type='function_call') and Rule Builder format (rule='AST_function_call')
        if rule_type in ('AST_function_call', 'function_call'):
            result = self._expand_lunacid_rules_call(rule)
            if result is not None:
                return result

        # Handle helper type - LunacidRules methods exported as standalone helpers
        if rule_type == 'helper':
            helper_name = rule.get('name', '')
            if helper_name in self.LUNACID_HELPERS:
                logger.debug(f"Lunacid: Expanding standalone helper '{helper_name}' to True")
                return {'type': 'constant', 'value': True}

        # Recurse into children to handle nested function calls
        if 'children' in rule:
            rule = dict(rule)
            rule['children'] = [self.expand_rule(c, _depth + 1) for c in rule['children']]

        # Also recurse into conditions (for and/or types)
        if 'conditions' in rule:
            rule = dict(rule)
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in rule['conditions']]

        # Also recurse into args if it's a dict with nested rules
        if 'args' in rule and isinstance(rule.get('args'), dict):
            rule = dict(rule) if 'children' not in rule and 'conditions' not in rule else rule
            args = dict(rule['args'])
            for key, value in args.items():
                if isinstance(value, dict):
                    args[key] = self.expand_rule(value, _depth + 1)
                elif isinstance(value, list):
                    args[key] = [self.expand_rule(v, _depth + 1) if isinstance(v, dict) else v for v in value]
            rule['args'] = args

        # Delegate to parent for standard expansion
        return super().expand_rule(rule, _depth)

    def _expand_lunacid_rules_call(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand LunacidRules.method() calls to rule builder expressions."""
        # Handle both AST format (function at top level) and Rule Builder format (function in args)
        function = rule.get('function', {})
        if not function:
            args = rule.get('args', {})
            function = args.get('function', {})

        if not isinstance(function, dict):
            return None

        # Check if this is an attribute access on a LunacidRules helper call
        if function.get('type') == 'attribute':
            obj = function.get('object', {})
            attr = function.get('attr', '')

            # Check if obj is a LunacidRules(self) helper call
            if (isinstance(obj, dict) and
                obj.get('type') == 'helper' and
                obj.get('name') == 'LunacidRules'):

                # Handle has_coins_for_door specially with actual item count
                if attr == 'has_coins_for_door':
                    return self._expand_has_coins_for_door()

                # All other LunacidRules methods - expand to True
                # This prevents invalid code generation and allows the game to be tracked
                # but may result in logic mismatches (more locations appear accessible)
                if attr in self.LUNACID_HELPERS or attr.startswith(('has_', 'can_', 'is_')):
                    logger.debug(f"Lunacid: Expanding LunacidRules.{attr}() to True")
                    return {'type': 'constant', 'value': True}

                # Unknown method - also expand to True
                logger.warning(f"Lunacid: Unknown LunacidRules method '{attr}', expanding to True")
                return {'type': 'constant', 'value': True}

        return None

    def _expand_has_coins_for_door(self) -> Dict[str, Any]:
        """Expand has_coins_for_door to HasCount rule.

        Original: state.has(Coins.strange_coin, self.player, options.required_strange_coin.value)
        Expands to: HasCount("Strange Coin", required_strange_coin)
        """
        logger.debug(f"Lunacid: has_coins_for_door expanded to HasCount('Strange Coin', {self._required_strange_coin})")

        return {
            'rule': 'HasCount',
            'args': {
                'item_name': 'Strange Coin',
                'count': self._required_strange_coin
            }
        }
