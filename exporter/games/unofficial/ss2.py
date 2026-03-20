"""System Shock 2 game-specific export handler.

This exporter handles System Shock 2-specific patterns:
- cyb_mod_count helper: Calculates total cyber modules from multiple item types.
  Each "N Cyber Modules" item contributes N to the total.
  Used in rules like: a <= cyb_mod_count(state) (i.e., has at least 'a' cyber modules)

- upgrade_or_cybmod helper: Checks if player has an upgrade item OR enough cyber modules
  to afford buying it. The helper signature is:
  upgrade_or_cybmod(state, item, amount, cybmodamount, curcybmodamount)
  where cybmodamount is the cyber module cost threshold.

- has_functional_weapon / Functional_Weapon: Checks if the player has any functional
  weapon combination. This is approximated as having any weapon item.
"""

from typing import Dict, Any, Optional, List
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


# All cyber module item denominations and their values
CYBER_MODULE_ITEMS = [
    ("2 Cyber Modules", 2),
    ("3 Cyber Modules", 3),
    ("4 Cyber Modules", 4),
    ("5 Cyber Modules", 5),
    ("6 Cyber Modules", 6),
    ("7 Cyber Modules", 7),
    ("8 Cyber Modules", 8),
    ("10 Cyber Modules", 10),
    ("13 Cyber Modules", 13),
    ("14 Cyber Modules", 14),
    ("15 Cyber Modules", 15),
    ("16 Cyber Modules", 16),
    ("20 Cyber Modules", 20),
    ("25 Cyber Modules", 25),
    ("30 Cyber Modules", 30),
]

# Naturally Able OS Upgrade adds 20 cyber modules
NATURALLY_ABLE_BONUS = 20

# Weapon items that can constitute a "functional weapon"
# This is a simplified check - the original logic involves repairs, upgrades, and ammo
# For tracking purposes, we check if the player has any of these weapon items
WEAPON_ITEMS = [
    # Pistols group
    "Pistol",
    "Damaged Pistol",
    "Broken Pistol",
    # Shotguns group
    "Shotgun",
    "Damaged Shotgun",
    "Broken Shotgun",
    # Laser Pistols group
    "Laser Pistol",
    "Damaged Laser Pistol",
    "Broken Laser Pistol",
    # Grenade Launcher
    "Grenade Launcher",
    "Broken Grenade Launcher",
    # Psi (requires Psi Amp)
    "Psi Amp",
]


class SystemShock2GameExportHandler(GenericGameExportHandler):
    """Export handler for System Shock 2."""

    GAME_NAME = 'System Shock 2'

    def expand_helper(self, helper_name: str, args: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Expand SS2-specific helpers.

        Handles:
        - cyb_mod_count: Returns a weighted_sum rule for cyber module counting
        - upgrade_or_cybmod: Returns rule for checking upgrade OR cyber module threshold
        - has_functional_weapon / Functional_Weapon: Returns HasAny for weapon items
        """
        # Check base class expansions first
        result = super().expand_helper(helper_name, args)
        if result:
            return result

        if helper_name == 'cyb_mod_count':
            return self._create_cyb_mod_count_rule()

        if helper_name == 'upgrade_or_cybmod':
            return self._expand_upgrade_or_cybmod(args or [])

        if helper_name in ('has_functional_weapon', 'Functional_Weapon'):
            return self._create_functional_weapon_rule()

        return None

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand a rule, handling SS2-specific patterns.

        Intercepts helper calls for cyb_mod_count, upgrade_or_cybmod, and Functional_Weapon.
        """
        if not isinstance(rule, dict):
            return rule

        rule_type = rule.get('type') or rule.get('rule')

        # Handle helper rules
        if rule_type == 'helper' or rule.get('_original_ast_type', '').endswith('helper'):
            helper_name = rule.get('name') or rule.get('rule')
            args = rule.get('args', [])

            if helper_name == 'cyb_mod_count':
                return self._create_cyb_mod_count_rule()

            if helper_name == 'upgrade_or_cybmod':
                return self._expand_upgrade_or_cybmod(args)

            if helper_name in ('has_functional_weapon', 'Functional_Weapon'):
                return self._create_functional_weapon_rule()

        # Handle item_check rules that reference Functional_Weapon (it's not an item!)
        if rule_type == 'item_check' or rule.get('rule') == 'Has':
            item_name = rule.get('item') or rule.get('args', {}).get('item_name')
            if item_name == 'Functional_Weapon':
                return self._create_functional_weapon_rule()

        # Handle HasAll/HasAny that might include Functional_Weapon
        if rule.get('rule') in ('HasAll', 'HasAny'):
            return self._expand_has_with_functional_weapon(rule, _depth)

        # Handle Compare rules where right side is cyb_mod_count
        # Pattern: Compare(threshold, "<=", cyb_mod_count)
        if rule_type == 'compare' or rule.get('rule') == 'Compare':
            return self._maybe_expand_cyb_mod_compare(rule, _depth)

        # Fall through to parent implementation
        return super().expand_rule(rule, _depth)

    def _expand_has_with_functional_weapon(self, rule: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Expand HasAll/HasAny rules that contain Functional_Weapon.

        If Functional_Weapon is in the items list, we need to replace it with
        the actual weapon check.
        """
        rule_type = rule.get('rule')
        args = rule.get('args', {})
        items = args.get('items', [])

        if 'Functional_Weapon' not in items:
            # No Functional_Weapon, use parent expansion
            return super().expand_rule(rule, _depth)

        # Remove Functional_Weapon from items and add it as a separate condition
        other_items = [item for item in items if item != 'Functional_Weapon']
        functional_weapon_rule = self._create_functional_weapon_rule()

        if not other_items:
            # Only Functional_Weapon was in the list
            return functional_weapon_rule

        # Build the combined rule
        if rule_type == 'HasAll':
            # HasAll(Functional_Weapon, items...) -> And(Functional_Weapon_check, HasAll(items...))
            other_rule = {
                'rule': 'HasAll',
                'args': {'items': other_items}
            } if len(other_items) > 1 else {
                'type': 'item_check',
                'item': other_items[0]
            }
            return {
                'type': 'and',
                'conditions': [functional_weapon_rule, super().expand_rule(other_rule, _depth)]
            }
        else:  # HasAny
            # HasAny(Functional_Weapon, items...) -> Or(Functional_Weapon_check, HasAny(items...))
            other_rule = {
                'rule': 'HasAny',
                'args': {'items': other_items}
            } if len(other_items) > 1 else {
                'type': 'item_check',
                'item': other_items[0]
            }
            return {
                'type': 'or',
                'conditions': [functional_weapon_rule, super().expand_rule(other_rule, _depth)]
            }

    def _maybe_expand_cyb_mod_compare(self, rule: Dict[str, Any], _depth: int) -> Dict[str, Any]:
        """Check if this is a Compare with cyb_mod_count and expand it.

        Pattern: threshold <= cyb_mod_count(state)
        Exported as: Compare(threshold, "<=", cyb_mod_count_helper)

        This should become: WeightedSum(threshold, cyber_module_items)

        IMPORTANT: This must be called BEFORE the Compare's children are expanded,
        otherwise cyb_mod_count will already be converted to WeightedSum(threshold=0).
        """
        args = rule.get('args', {})
        left = args.get('left')
        op = args.get('op', '')
        right = args.get('right')

        # Check if right side is cyb_mod_count helper (before expansion)
        is_cyb_mod = False
        if isinstance(right, dict):
            right_rule = right.get('rule') or right.get('name')
            right_type = right.get('_original_ast_type')
            if right_rule == 'cyb_mod_count':
                is_cyb_mod = True
            elif right_type == 'helper' and right.get('name') == 'cyb_mod_count':
                is_cyb_mod = True
            # Also check for already-expanded weighted_sum with threshold=0
            # (this means cyb_mod_count was already converted)
            elif right_rule == 'weighted_sum' or (right_type == 'helper' and right_rule == 'weighted_sum'):
                # Check if this is our cyb_mod_count expansion (threshold=0)
                ws_args = right.get('args', [])
                if ws_args and len(ws_args) >= 1:
                    threshold_arg = ws_args[0]
                    ws_threshold = self._extract_constant(threshold_arg)
                    if ws_threshold == 0:
                        is_cyb_mod = True

        if not is_cyb_mod:
            # Not a cyb_mod_count comparison - use parent expansion
            return super().expand_rule(rule, _depth)

        # Extract threshold from left side
        threshold = self._extract_constant(left)
        if threshold is None:
            logger.warning(f"SS2: Could not extract threshold from Compare: {left}")
            return super().expand_rule(rule, _depth)

        # Handle the comparison operator
        # "threshold <= cyb_mod_count" means we need at least 'threshold' cyber modules
        if op == '<=' or op == '<':
            # threshold <= count  =>  WeightedSum(threshold, items)
            return self._create_weighted_sum_rule(float(threshold))
        elif op == '>=' or op == '>':
            # threshold >= count  =>  NOT WeightedSum(threshold, items)
            # This is unusual but handle it
            return {
                'type': 'not',
                'condition': self._create_weighted_sum_rule(float(threshold))
            }

        # Unknown operator - return original
        return super().expand_rule(rule, _depth)

    def _expand_upgrade_or_cybmod(self, args: List[Any]) -> Dict[str, Any]:
        """Expand upgrade_or_cybmod helper.

        The helper checks:
        - If include_stats_skills_psi option is True: Has(item, amount)
        - Otherwise: cybmodamount <= cyb_mod_count(state)

        Since we're exporting for a specific seed, the option is already resolved.
        We need to check the world's options to determine which branch to take.

        For now, we output an Or rule that covers both cases, letting the tracker
        determine which applies based on what items exist in the pool.
        """
        if len(args) < 4:
            logger.warning(f"SS2: upgrade_or_cybmod called with insufficient args: {args}")
            return {'type': 'constant', 'value': True}

        # Extract arguments:
        # args[0] = item name
        # args[1] = amount (how many of the item needed)
        # args[2] = cybmodamount (cyber module cost)
        # args[3] = curcybmodamount (current count - we replace this with weighted_sum)

        item_arg = args[0]
        amount_arg = args[1]
        cybmod_threshold_arg = args[2]

        item_name = self._extract_constant(item_arg)
        amount = self._extract_constant(amount_arg)
        cybmod_threshold = self._extract_constant(cybmod_threshold_arg)

        if item_name is None:
            logger.warning(f"SS2: Could not extract item name from upgrade_or_cybmod args")
            return {'type': 'constant', 'value': True}

        # Build the rule: Has(item, amount) OR WeightedSum(cybmod_threshold, items)
        conditions = []

        # Has item condition
        if amount is not None and amount > 0:
            conditions.append({
                'type': 'item_check',
                'item': item_name,
                'count': amount
            })
        else:
            conditions.append({
                'type': 'item_check',
                'item': item_name
            })

        # Cyber module threshold condition
        if cybmod_threshold is not None and cybmod_threshold > 0:
            conditions.append(self._create_weighted_sum_rule(float(cybmod_threshold)))

        if len(conditions) == 1:
            return conditions[0]

        return {
            'type': 'or',
            'conditions': conditions
        }

    def _create_cyb_mod_count_rule(self) -> Dict[str, Any]:
        """Create a rule that returns the cyber module count.

        This is used when cyb_mod_count is called directly (not in a comparison).
        We return a weighted_sum helper with threshold 0 so it always passes,
        but the actual value can be used in comparisons.

        Actually, cyb_mod_count returns an integer, not a boolean. When used
        in a comparison like "threshold <= cyb_mod_count()", we need to return
        something that evaluates correctly.

        For the worldgen/tracker, we return a weighted_sum helper that the
        Compare rule can use to get the actual count value.
        """
        return self._create_weighted_sum_rule(0)

    def _create_functional_weapon_rule(self) -> Dict[str, Any]:
        """Create a rule that checks if the player has a functional weapon.

        The original has_functional_weapon() method checks for complex combinations
        of weapons, repairs, upgrades, and ammo. For tracking purposes, we simplify
        this to checking if the player has any weapon item.

        This is an approximation - the actual game logic is more complex and requires
        matching weapons with appropriate upgrades and ammunition.

        Returns a HasAny rule checking for any weapon item.
        """
        return {
            'rule': 'HasAny',
            'args': {'items': list(WEAPON_ITEMS)}
        }

    def _create_weighted_sum_rule(self, threshold: float) -> Dict[str, Any]:
        """Create a WeightedSum rule for cyber module checking.

        Equivalent to checking if the total cyber modules >= threshold.

        The weighted sum calculates:
            sum(count(item) * weight for item, weight in CYBER_MODULE_ITEMS)
            + (20 if has("Naturally Able OSUpgrade") else 0)
            >= threshold

        Uses the weighted_sum helper format that rule_codegen expects.
        """
        # Build the items list with weights
        items_list = [[item, float(weight)] for item, weight in CYBER_MODULE_ITEMS]

        # Add Naturally Able OS Upgrade bonus
        items_list.append(["Naturally Able OSUpgrade", float(NATURALLY_ABLE_BONUS)])

        return {
            'rule': 'weighted_sum',
            '_original_ast_type': 'helper',
            'args': [
                {'rule': 'Constant', 'args': {'value': threshold}},
                {'rule': 'Constant', 'args': {'value': items_list}}
            ]
        }

    def _extract_constant(self, arg: Any) -> Optional[Any]:
        """Extract a constant value from an argument.

        Handles:
        - {"type": "constant", "value": X}
        - {"rule": "Constant", "args": {"value": X}}
        - Literal values (int, float, str)
        """
        if isinstance(arg, (int, float, str)):
            return arg

        if not isinstance(arg, dict):
            return None

        arg_type = arg.get('type')
        arg_rule = arg.get('rule')

        if arg_type == 'constant':
            return arg.get('value')

        if arg_rule == 'Constant':
            return arg.get('args', {}).get('value')

        return None
