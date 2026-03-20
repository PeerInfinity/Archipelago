"""Crystalis game-specific export handler.

Crystalis uses local variable references in its rules that need to be resolved to
actual location/region names. For example:

    insect_reward = self.get_location("Giant Insect")
    oak_mom_reward = self.get_location("Oak Mother")
    set_rule(oak_elder_reward, lambda state: state.has("Telepathy", player) and
             (state.can_reach(insect_reward) or state.can_reach(oak_mom_reward)))

The analyzer produces `{type: "name", name: "insect_reward"}` as a placeholder,
but we need to resolve these to the actual location names for proper tracking.

This handler:
1. Maps local variable names to their actual location/region names
2. Transforms state_method can_reach rules with name references to proper format
3. Transforms CanReachRegion rules with name references to CanReachLocation rules

FIXED ISSUES:
- Oak Elder location now correctly exports with CanReachLocation("Giant Insect")
  and CanReachLocation("Oak Mother") instead of CanReachRegion('') which caused
  KeyError: '' crashes.

REMAINING ISSUES (require deeper exporter changes):
- Some locations use `location.access_rule = region.can_reach` which directly
  assigns the Region.can_reach method. The exporter analyzes the internal
  implementation of Region.can_reach instead of treating it as CanReachRegion.
  Affected locations include: Clark, Leaf Elder, and others.
- These cases export as complex Conditional rules checking state.stale and
  state.reachable_regions instead of simple CanReachRegion rules.

Known local variable mappings from Crystalis logic.py:
- insect_reward -> "Giant Insect" (Location)
- oak_mom_reward -> "Oak Mother" (Location)
- Many region variables (see LOCAL_VAR_TO_NAME dict below)
"""

from typing import Dict, Any, Optional
from ..base import GenericGameExportHandler
import logging

logger = logging.getLogger(__name__)


class CrystalisGameExportHandler(GenericGameExportHandler):
    """Export handler for Crystalis.

    Resolves local variable references in rules to actual location/region names.
    """

    GAME_NAME = 'Crystalis'

    # Mapping of local variable names used in Crystalis logic.py to their actual
    # location or region names. These variables are created like:
    #   var_name = self.get_location("Location Name")  or
    #   var_name = multiworld.get_region("Region Name", player)
    LOCAL_VAR_TO_NAME: Dict[str, Dict[str, str]] = {
        # Locations (from self.get_location)
        'insect_reward': {'name': 'Giant Insect', 'type': 'Location'},
        'oak_mom_reward': {'name': 'Oak Mother', 'type': 'Location'},
        'oak_elder_reward': {'name': 'Oak Elder', 'type': 'Location'},
        'dolphin': {'name': 'Injured Dolphin', 'type': 'Location'},

        # Regions (from multiworld.get_region)
        'windmill_region': {'name': 'Windmill', 'type': 'Region'},
        'swamp_interior': {'name': 'Swamp - Interior', 'type': 'Region'},
        'oak_mom_house': {'name': 'Oak Mother House', 'type': 'Region'},
        'zebu_front': {'name': "Zebu's Cave - Front", 'type': 'Region'},
        'zebu_back': {'name': "Zebu's Cave - Back", 'type': 'Region'},
        'leaf_elder': {'name': "Leaf Elder's House", 'type': 'Region'},
        'zebu_student': {'name': "Zebu Student's House", 'type': 'Region'},
        'rabbit_shed': {'name': "Leaf Rabbit Shed", 'type': 'Region'},
        'teller_front': {'name': 'Fortune Teller - Front', 'type': 'Region'},
        'teller_back': {'name': 'Fortune Teller - Back', 'type': 'Region'},
        'gift_trigger': {'name': 'Portoa Palace - Gift Trigger', 'type': 'Region'},
        'asina': {'name': 'Asina', 'type': 'Region'},
        'shyron_region': {'name': 'Shyron', 'type': 'Region'},
        'shyron_temple': {'name': 'Shyron Temple', 'type': 'Region'},
        'massacre_trigger': {'name': 'Goa Entrance - Massacre Trigger', 'type': 'Region'},
        'mado_1_region': {'name': 'Mado 1', 'type': 'Region'},
    }

    def expand_rule(self, rule: Dict[str, Any], _depth: int = 0) -> Dict[str, Any]:
        """Expand Crystalis-specific rules, resolving local variable references."""
        if not rule or not isinstance(rule, dict):
            return rule

        # Debug logging
        if _depth == 0:
            logger.debug(f"Crystalis expand_rule called at depth 0: {rule.get('rule', rule.get('type', 'unknown'))}")

        # Handle AST-format state_method with can_reach that has name references
        # This is called BEFORE the converter transforms to RB format
        if rule.get('type') == 'state_method' and rule.get('method') == 'can_reach':
            expanded = self._expand_can_reach_state_method(rule)
            if expanded:
                logger.debug(f"Crystalis: Expanded can_reach state_method: {rule} -> {expanded}")
                return expanded

        # Handle RB-format CanReachRegion with name references (for post-conversion rules)
        if rule.get('rule') == 'CanReachRegion':
            expanded = self._expand_can_reach_region(rule)
            if expanded:
                logger.debug(f"Crystalis: Expanded CanReachRegion: {rule} -> {expanded}")
                return expanded

        # Recursively expand nested rules in RB-format children BEFORE calling super
        # The base class only handles AST-format (type: and, conditions) not RB-format (rule: And, children)
        if 'children' in rule:
            rule['children'] = [self.expand_rule(c, _depth + 1) for c in rule['children']]

        # Let parent class handle common expansions (AST format, helpers, etc.)
        rule = super().expand_rule(rule, _depth)

        # Also expand conditions for AST-format rules (in case super didn't already)
        if 'conditions' in rule:
            rule['conditions'] = [self.expand_rule(c, _depth + 1) for c in rule['conditions']]

        return rule

    def _expand_can_reach_state_method(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand AST-format state_method with can_reach that has name references.

        AST format: {"type": "state_method", "method": "can_reach", "args": [{"type": "name", "name": "insect_reward"}]}
        """
        args = rule.get('args', [])
        if not args:
            return None

        first_arg = args[0]

        # Check if first argument is a name reference (unresolved variable)
        if isinstance(first_arg, dict) and first_arg.get('type') == 'name':
            var_name = first_arg.get('name', '')

            if var_name in self.LOCAL_VAR_TO_NAME:
                mapping = self.LOCAL_VAR_TO_NAME[var_name]
                actual_name = mapping['name']
                var_type = mapping['type']

                logger.debug(f"Crystalis: Resolved '{var_name}' to {var_type} '{actual_name}' (AST format)")

                # Return AST format that the converter will properly handle
                if var_type == 'Location':
                    return {
                        'type': 'state_method',
                        'method': 'can_reach',
                        'args': [
                            {'type': 'constant', 'value': actual_name},
                            {'type': 'constant', 'value': 'Location'}
                        ]
                    }
                else:  # Region
                    return {
                        'type': 'state_method',
                        'method': 'can_reach',
                        'args': [
                            {'type': 'constant', 'value': actual_name},
                            {'type': 'constant', 'value': 'Region'}
                        ]
                    }
            else:
                logger.warning(f"Crystalis: Unknown local variable reference '{var_name}' in can_reach - "
                             f"may need to add mapping to CrystalisGameExportHandler.LOCAL_VAR_TO_NAME")

        return None

    def _expand_can_reach_region(self, rule: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Expand RB-format CanReachRegion rules with name references to proper location/region rules."""
        args = rule.get('args', {})
        region_name_value = args.get('region_name', {})

        # Check if region_name is a name reference (unresolved variable)
        if isinstance(region_name_value, dict) and region_name_value.get('type') == 'name':
            var_name = region_name_value.get('name', '')

            if var_name in self.LOCAL_VAR_TO_NAME:
                mapping = self.LOCAL_VAR_TO_NAME[var_name]
                actual_name = mapping['name']
                var_type = mapping['type']

                logger.debug(f"Crystalis: Resolved '{var_name}' to {var_type} '{actual_name}' (RB format)")

                if var_type == 'Location':
                    return {
                        'rule': 'CanReachLocation',
                        'args': {
                            'location_name': actual_name
                        }
                    }
                else:  # Region
                    return {
                        'rule': 'CanReachRegion',
                        'args': {
                            'region_name': actual_name
                        }
                    }
            else:
                logger.warning(f"Crystalis: Unknown local variable reference '{var_name}' - "
                             f"may need to add mapping to CrystalisGameExportHandler.LOCAL_VAR_TO_NAME")

        return None
