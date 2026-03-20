"""Soul Blazer game-specific export handler.

Soul Blazer uses a closure-based data-driven rule pattern where entrance rules
dispatch through a dictionary lookup: `rule_for_flag[data.rule_flag](state, player)`.

This handler intercepts the closure-based rules and expands them to proper
item checks by extracting the RuleFlag value from the closure variable.
"""

from typing import Dict, Any, List, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class SoulBlazerExportHandler(GenericGameExportHandler):
    """Export handler for Soul Blazer.

    Soul Blazer's entrance rules use a data-driven pattern where an ExitData
    named tuple is captured in the rule closure:

        def get_rule_for_exit(data: ExitData, player: int):
            def rule(state):
                return (
                    rule_for_flag[data.rule_flag](state, player)
                    and state.has_all(data.has_all, player)
                    and (not data.has_any or state.has_any(data.has_any, player))
                )
            return rule

    The AST analyzer captures this but can't resolve the closure variable `data`.
    This handler extracts the data from the closure and builds proper rules.
    """

    GAME_NAME = 'Soul Blazer'

    # Item names for each RuleFlag - extracted from Soul Blazer's Rules.py
    METAL_CUTTING_SWORDS = ['Zantetsu Sword', 'The Soul Blade']
    SPIRIT_CUTTING_SWORDS = ['Spirit Sword', 'The Soul Blade']
    THUNDER_ITEMS = ['Thunder Ring', 'Zantetsu Sword', 'The Soul Blade']
    ALL_SWORDS = [
        'Sword of Life', 'Psycho Sword', 'Critical Sword', 'Lucky Blade',
        'Zantetsu Sword', 'Spirit Sword', 'Recovery Sword', 'The Soul Blade'
    ]
    CASTABLE_MAGIC = [
        'Flame Ball', 'Light Arrow', 'Magic Flare', 'Rotator',
        'Spark Bomb', 'Flame Pillar', 'Tornado'
    ]
    SOUL_OF_MAGICIAN = 'Soul of Magician'

    def handle_complex_entrance_rule(self, entrance_name: str, rule: Any) -> Optional[Dict[str, Any]]:
        """Extract Soul Blazer entrance rules from closure variables.

        Soul Blazer rules capture an ExitData object in the closure which contains:
        - rule_flag: RuleFlag enum indicating special requirements
        - has_all: list of items that must all be obtained
        - has_any: list of items where at least one must be obtained

        We extract these values and build the proper rule structure.
        """
        if not callable(rule):
            return None

        # Get the closure variables
        try:
            freevars = rule.__code__.co_freevars
            closure = rule.__closure__
        except AttributeError:
            return None

        if not closure or 'data' not in freevars:
            return None

        # Extract the 'data' closure variable (ExitData object)
        data = None
        player = None
        for i, name in enumerate(freevars):
            try:
                val = closure[i].cell_contents
                if name == 'data':
                    data = val
                elif name == 'player':
                    player = val
            except ValueError:
                # Empty cell
                continue

        if data is None:
            return None

        # Extract rule components from ExitData
        try:
            rule_flag = data.rule_flag
            has_all = list(data.has_all) if data.has_all else []
            has_any = list(data.has_any) if data.has_any else []
        except AttributeError:
            logger.warning(f"Soul Blazer entrance '{entrance_name}' has unexpected data structure")
            return None

        logger.debug(f"Soul Blazer entrance '{entrance_name}': flag={rule_flag}, has_all={has_all}, has_any={has_any}")

        # Build the rule from components
        conditions = []

        # Add rule_flag-based condition
        flag_rule = self._expand_rule_flag(rule_flag)
        if flag_rule:
            conditions.append(flag_rule)

        # Add has_all condition
        if has_all:
            if len(has_all) == 1:
                conditions.append({
                    'type': 'item_check',
                    'item': has_all[0]
                })
            else:
                conditions.append({
                    'type': 'item_check_all',
                    'items': has_all
                })

        # Add has_any condition
        if has_any:
            if len(has_any) == 1:
                conditions.append({
                    'type': 'item_check',
                    'item': has_any[0]
                })
            else:
                conditions.append({
                    'type': 'item_check_any',
                    'items': has_any
                })

        # Combine conditions
        if not conditions:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}

    def _expand_rule_flag(self, rule_flag) -> Optional[Dict[str, Any]]:
        """Expand a RuleFlag enum to an item check rule.

        RuleFlag values:
        - NONE: No requirement (returns None, not added to conditions)
        - HAS_SWORD: Requires any sword
        - CAN_CUT_METAL: Requires Zantetsu Sword or Soul Blade
        - CAN_CUT_SPIRIT: Requires Spirit Sword or Soul Blade
        - HAS_THUNDER: Requires Thunder Ring or metal-cutting sword
        - HAS_MAGIC: Requires Soul of Magician AND any castable magic
        - HAS_STONES: Requires stones (count based on option) - uses group check
        - PHOENIX_CUTSCENE: Requires reaching Mountain King location
        """
        flag_name = rule_flag.name if hasattr(rule_flag, 'name') else str(rule_flag)

        if flag_name == 'NONE':
            return None  # No additional requirement

        if flag_name == 'HAS_SWORD':
            return {
                'type': 'item_check_any',
                'items': self.ALL_SWORDS
            }

        if flag_name == 'CAN_CUT_METAL':
            return {
                'type': 'item_check_any',
                'items': self.METAL_CUTTING_SWORDS
            }

        if flag_name == 'CAN_CUT_SPIRIT':
            return {
                'type': 'item_check_any',
                'items': self.SPIRIT_CUTTING_SWORDS
            }

        if flag_name == 'HAS_THUNDER':
            return {
                'type': 'item_check_any',
                'items': self.THUNDER_ITEMS
            }

        if flag_name == 'HAS_MAGIC':
            # Requires Soul of Magician AND any castable magic
            return {
                'type': 'and',
                'conditions': [
                    {'type': 'item_check', 'item': self.SOUL_OF_MAGICIAN},
                    {'type': 'item_check_any', 'items': self.CASTABLE_MAGIC}
                ]
            }

        if flag_name == 'HAS_STONES':
            # Requires stones group with count from options
            # The actual count is option-dependent, so we use a group check
            # The world generator will need to handle the count appropriately
            return {
                'type': 'group_check',
                'group': 'stones',
                'count': {'type': 'option_value', 'option': 'stones_count'}
            }

        if flag_name == 'PHOENIX_CUTSCENE':
            # Requires being able to reach the Mountain King NPC reward location
            return {
                'type': 'location_check',
                'location': 'Mountain King'
            }

        # Unknown flag - log warning and return True
        logger.warning(f"Soul Blazer unknown RuleFlag: {flag_name}")
        return None

    def handle_complex_exit_rule(self, exit_name: str, exit_rule: Any) -> Optional[Dict[str, Any]]:
        """Handle exit rules the same as entrance rules."""
        return self.handle_complex_entrance_rule(exit_name, exit_rule)

    def get_custom_location_access_rule(self, location, world) -> Optional[Dict[str, Any]]:
        """Extract Soul Blazer location rules from the location data or closure.

        Soul Blazer locations use get_rule_for_location which creates a closure with:
        - flag: RuleFlag enum
        - player: player number
        - dependencies: list of required items from location_dependencies

        The location object has a 'data' attribute with 'flag' property.
        """
        location_name = location.name

        # Try to get the rule components from the location's access_rule closure
        access_rule = getattr(location, 'access_rule', None)
        if not callable(access_rule):
            return None

        try:
            freevars = access_rule.__code__.co_freevars
            closure = access_rule.__closure__
        except AttributeError:
            return None

        if not closure:
            return None

        # Extract closure variables
        flag = None
        dependencies = None
        player = None

        for i, name in enumerate(freevars):
            try:
                val = closure[i].cell_contents
                if name == 'flag':
                    flag = val
                elif name == 'dependencies':
                    dependencies = val
                elif name == 'player':
                    player = val
            except ValueError:
                continue

        # If we couldn't get flag from closure, try location data
        if flag is None:
            if hasattr(location, 'data') and hasattr(location.data, 'flag'):
                flag = location.data.flag
            else:
                return None

        # Get dependencies if not found in closure
        if dependencies is None:
            dependencies = []

        logger.debug(f"Soul Blazer location '{location_name}': flag={flag}, dependencies={dependencies}")

        # Build the rule from components
        conditions = []

        # Add rule_flag-based condition
        flag_rule = self._expand_rule_flag(flag)
        if flag_rule:
            conditions.append(flag_rule)

        # Add dependencies condition
        if dependencies:
            if len(dependencies) == 1:
                conditions.append({
                    'type': 'item_check',
                    'item': dependencies[0]
                })
            else:
                conditions.append({
                    'type': 'item_check_all',
                    'items': list(dependencies)
                })

        # Combine conditions
        if not conditions:
            return {'type': 'constant', 'value': True}
        elif len(conditions) == 1:
            return conditions[0]
        else:
            return {'type': 'and', 'conditions': conditions}
