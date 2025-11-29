"""Castlevania 64 (CV64) game-specific export handler."""

from typing import Dict, Any
from .generic import GenericGameExportHandler
import logging
import re

logger = logging.getLogger(__name__)

class Cv64GameExportHandler(GenericGameExportHandler):
    GAME_NAME = 'Castlevania 64'
    """Export handler for Castlevania 64."""
    
    def __init__(self, world):
        super().__init__()  # Base class doesn't take arguments
        self.world = world
        # Import iname to resolve item references
        from worlds.cv64.data import iname
        self.iname = iname
        # Get world properties for warp calculations
        self.s1s_per_warp = getattr(world, 's1s_per_warp', 1)
    
    def expand_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Expand CV64-specific rules."""
        if not rule:
            return rule

        # Handle attribute access on location name constants (for allow_self_locking_items logic)
        # Convert location.item to location_item_name(location) helper call
        if rule.get('type') == 'attribute' and rule.get('attr') == 'item':
            obj = rule.get('object', {})
            # If accessing .item on a constant string (location name)
            if obj.get('type') == 'constant' and isinstance(obj.get('value'), str):
                # This is likely a location name, convert to helper call
                location_name = obj.get('value')
                return {
                    'type': 'helper',
                    'name': 'location_item_name',
                    'args': [{'type': 'constant', 'value': location_name}]
                }

        # Handle state_method with has_all that contains iname references
        if rule.get('type') == 'state_method' and rule.get('method') == 'has_all':
            args = rule.get('args', [])
            if args and isinstance(args[0], dict) and args[0].get('type') == 'list':
                items_list = args[0].get('value', [])
                resolved_items = []
                for item in items_list:
                    if isinstance(item, dict) and item.get('type') == 'attribute':
                        obj = item.get('object', {})
                        if obj.get('type') == 'name' and obj.get('name') == 'iname':
                            attr_name = item.get('attr')
                            if hasattr(self.iname, attr_name):
                                resolved_items.append(getattr(self.iname, attr_name))
                            else:
                                logger.warning(f"Unknown iname attribute: {attr_name}")
                                resolved_items.append(attr_name)
                        else:
                            resolved_items.append(item)
                    else:
                        resolved_items.append(item)
                
                # Convert to an AND condition with item checks
                if resolved_items:
                    return {
                        'type': 'and',
                        'conditions': [
                            {'type': 'item_check', 'item': item_name}
                            for item_name in resolved_items
                        ]
                    }
            
        # Handle item references with iname attributes
        if rule.get('type') == 'item_check':
            item_ref = rule.get('item')
            if isinstance(item_ref, dict) and item_ref.get('type') == 'attribute':
                obj = item_ref.get('object', {})
                if obj.get('type') == 'name' and obj.get('name') == 'iname':
                    # Resolve the iname attribute to the actual item name
                    attr_name = item_ref.get('attr')
                    if hasattr(self.iname, attr_name):
                        rule['item'] = getattr(self.iname, attr_name)
                    else:
                        logger.warning(f"Unknown iname attribute: {attr_name}")
                        rule['item'] = attr_name
        
        # Handle count references with variables
        if 'count' in rule and isinstance(rule['count'], dict):
            if rule['count'].get('type') == 'binary_op':
                # Try to resolve binary operations for warp access rules
                left = rule['count'].get('left', {})
                right = rule['count'].get('right', {})
                op = rule['count'].get('op')
                
                # Resolve self.s1s_per_warp reference
                if (left.get('type') == 'attribute' and 
                    left.get('object', {}).get('type') == 'name' and
                    left.get('object', {}).get('name') == 'self' and
                    left.get('attr') == 's1s_per_warp'):
                    left_val = self.s1s_per_warp
                    
                    # For warp_num, we keep it as a variable for the frontend to handle
                    if right.get('type') == 'name' and right.get('name') == 'warp_num':
                        # Keep the structure but with resolved s1s_per_warp
                        rule['count'] = {
                            'type': 'binary_op',
                            'left': {'type': 'constant', 'value': left_val},
                            'op': op,
                            'right': right
                        }
                else:
                    # Keep binary operations as-is if we can't resolve them
                    pass
            elif rule['count'].get('type') == 'name':
                # Simple variable reference - try to resolve
                var_name = rule['count'].get('name')
                # For warp_num, we'll let the frontend handle it
                if var_name != 'warp_num':
                    logger.debug(f"Unresolved count variable: {var_name}")
        
        # Recursively process nested rules in all rule types
        if rule.get('type') in ['and', 'or']:
            rule['conditions'] = [self.expand_rule(cond) for cond in rule.get('conditions', [])]
        elif rule.get('type') == 'conditional':
            # Process all parts of the conditional
            if 'test' in rule:
                rule['test'] = self.expand_rule(rule['test'])
            if 'if_true' in rule and isinstance(rule['if_true'], dict):
                rule['if_true'] = self.expand_rule(rule['if_true'])
            if 'if_false' in rule and isinstance(rule['if_false'], dict):
                rule['if_false'] = self.expand_rule(rule['if_false'])
        elif rule.get('type') == 'compare':
            # Process both sides of the comparison
            if 'left' in rule and isinstance(rule['left'], dict):
                rule['left'] = self.expand_rule(rule['left'])
            if 'right' in rule and isinstance(rule['right'], dict):
                rule['right'] = self.expand_rule(rule['right'])
        elif rule.get('type') == 'attribute':
            # Process the object being accessed (in case it's nested)
            if 'object' in rule and isinstance(rule['object'], dict):
                rule['object'] = self.expand_rule(rule['object'])
        elif rule.get('type') == 'list':
            # Process list elements
            if 'value' in rule and isinstance(rule['value'], list):
                rule['value'] = [self.expand_rule(item) if isinstance(item, dict) else item
                                 for item in rule['value']]

        # After recursion, simplify conditionals that check location_item_name results
        # Pattern: conditional(location_item_name(...) is null, null, [location_item_name(...).name, location_item_name(...).player])
        # Should become: location_item_name(...)
        # Because the helper already returns [name, player] or null
        if rule.get('type') == 'conditional':
            test = rule.get('test', {})
            if_true = rule.get('if_true')
            if_false = rule.get('if_false', {})

            # Check if test is "location_item_name(...) is null"
            if (test.get('type') == 'compare' and
                test.get('op') == 'is' and
                test.get('left', {}).get('type') == 'helper' and
                test.get('left', {}).get('name') == 'location_item_name' and
                test.get('right', {}).get('type') == 'constant' and
                test.get('right', {}).get('value') is None):

                # Check if if_true is null
                if isinstance(if_true, dict) and if_true.get('type') == 'constant' and if_true.get('value') is None:
                    # Check if if_false is a list trying to extract .name and .player from location_item_name
                    if (isinstance(if_false, dict) and
                        if_false.get('type') == 'list' and
                        len(if_false.get('value', [])) == 2):

                        # Verify the list elements are trying to access .name and .player
                        elements = if_false.get('value', [])
                        if (len(elements) == 2 and
                            elements[0].get('type') == 'attribute' and
                            elements[0].get('attr') == 'name' and
                            elements[0].get('object', {}).get('type') == 'helper' and
                            elements[0].get('object', {}).get('name') == 'location_item_name' and
                            elements[1].get('type') == 'attribute' and
                            elements[1].get('attr') == 'player' and
                            elements[1].get('object', {}).get('type') == 'helper' and
                            elements[1].get('object', {}).get('name') == 'location_item_name'):

                            # Simplify: just return the helper call directly
                            return test['left']

        return rule
    
    def expand_helper(self, helper_name: str, args=None):
        """Expand CV64-specific helper functions."""
        if helper_name == "Dracula" or helper_name == "can_enter_dracs_chamber":
            # Get the Dracula's condition from the world
            from worlds.cv64.options import DraculasCondition
            drac_condition = getattr(self.world, 'drac_condition', 0)
            required_s2s = getattr(self.world, 'required_s2s', 0)
            
            # Determine what item is needed based on the condition
            if drac_condition == DraculasCondition.option_crystal:
                return {'type': 'item_check', 'item': 'Crystal'}
            elif drac_condition == DraculasCondition.option_bosses:
                return {'type': 'item_check', 'item': 'Trophy', 
                        'count': {'type': 'constant', 'value': required_s2s}}
            elif drac_condition == DraculasCondition.option_specials:
                return {'type': 'item_check', 'item': 'Special2',
                        'count': {'type': 'constant', 'value': required_s2s}}
            else:
                # No condition - always accessible
                return {'type': 'constant', 'value': True}
        
        return None
    
    def postprocess_entrance_rule(self, rule: Dict[str, Any], entrance_name: str) -> Dict[str, Any]:
        """Post-process entrance rules to resolve warp-specific values and handle Dracula's door."""
        if not rule:
            return rule

        # Special handling for Dracula's door
        if entrance_name == "Dracula's door":
            # Check if it's a null constant or a conditional with Dracula-related items
            if (rule.get('type') == 'constant' and rule.get('value') is None):
                # Expand the Dracula helper directly
                return self.expand_helper("Dracula")
            elif rule.get('type') == 'conditional':
                # The analyzer exported a complex conditional for Dracula's door
                # Instead of trying to parse it, just use our helper which knows the correct logic
                return self.expand_helper("Dracula")
        
        # Check if this is a warp entrance
        warp_match = re.match(r'Warp (\d+)', entrance_name)
        if warp_match and rule.get('type') == 'item_check':
            warp_num = int(warp_match.group(1))
            
            # Check if this has a count with warp_num variable
            count = rule.get('count')
            if isinstance(count, dict) and count.get('type') == 'binary_op':
                left = count.get('left', {})
                right = count.get('right', {})
                op = count.get('op')
                
                # If left is constant (s1s_per_warp) and right is warp_num variable
                if (left.get('type') == 'constant' and 
                    right.get('type') == 'name' and right.get('name') == 'warp_num'):
                    
                    # Calculate the final value
                    if op == '*':
                        final_count = left.get('value', 1) * warp_num
                    else:
                        logger.warning(f"Unexpected operator {op} in warp rule")
                        final_count = warp_num
                    
                    # Replace with constant value
                    rule['count'] = {'type': 'constant', 'value': final_count}
        
        return rule