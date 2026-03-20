"""
Converter from Rule Builder format (PR #5048) to AST format.

Rule Builder Format (B):
    {
        "rule": "Has",
        "options": [...],
        "args": {"item_name": "Sword", "count": 1}
    }

AST Format (A):
    {
        "type": "item_check",
        "item": "Sword",
        "count": 1
    }
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ConversionResult:
    """Result of a rule conversion operation."""
    rule: Dict[str, Any]
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return len(self.errors) == 0


class RuleBuilderToAST:
    """
    Converter from Rule Builder format to AST format.

    Handles conversion of:
    - Boolean rules (True_, False_)
    - Item rules (Has, HasAll, HasAny, HasAllCounts, HasAnyCount, HasFromList, HasGroup, etc.)
    - Composite rules (And, Or)
    - Reachability rules (CanReachRegion, CanReachLocation, CanReachEntrance)
    - Custom/unknown rules (preserved with metadata)
    """

    # Mapping of Rule Builder rule names to converter methods
    RULE_CONVERTERS = {}

    def __init__(self):
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self._init_converters()

    def _init_converters(self):
        """Initialize the rule converter mapping."""
        self.RULE_CONVERTERS = {
            # Boolean rules
            'True_': self._convert_true,
            'False_': self._convert_false,

            # Item rules
            'Has': self._convert_has,
            'HasAll': self._convert_has_all,
            'HasAny': self._convert_has_any,
            'HasAllCounts': self._convert_has_all_counts,
            'HasAnyCount': self._convert_has_any_count,
            'HasFromList': self._convert_has_from_list,
            'HasFromListUnique': self._convert_has_from_list_unique,
            'HasGroup': self._convert_has_group,
            'HasGroupUnique': self._convert_has_group_unique,

            # Composite rules
            'And': self._convert_and,
            'Or': self._convert_or,

            # Reachability rules
            'CanReachRegion': self._convert_can_reach_region,
            'CanReachLocation': self._convert_can_reach_location,
            'CanReachEntrance': self._convert_can_reach_entrance,

            # Wrapper/utility rules
            'Filtered': self._convert_filtered,
            'WrapperRule': self._convert_wrapper,

            # Helper calls
            'HelperCall': self._convert_helper_call,

            # Comparison rules
            'Compare': self._convert_compare,
        }

    def convert(self, rule: Any) -> ConversionResult:
        """
        Convert a Rule Builder format rule to AST format.

        Args:
            rule: Rule in Rule Builder format

        Returns:
            ConversionResult with converted rule and any warnings/errors
        """
        self.warnings = []
        self.errors = []

        try:
            converted = self._convert_rule(rule)
            return ConversionResult(
                rule=converted,
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )
        except Exception as e:
            self.errors.append(f"Conversion failed: {str(e)}")
            return ConversionResult(
                rule={'type': 'error', 'message': str(e), 'original': rule},
                warnings=self.warnings.copy(),
                errors=self.errors.copy()
            )

    def _convert_rule(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Internal method to convert a single rule.

        Args:
            rule: Rule in Rule Builder format

        Returns:
            Rule in AST format
        """
        if not isinstance(rule, dict):
            # Handle primitive values
            return {'type': 'constant', 'value': rule}

        rule_name = rule.get('rule')
        if not rule_name:
            # Not a Rule Builder format rule, might already be AST format or invalid
            if 'type' in rule:
                # Already in AST format, return as-is
                return rule
            self.warnings.append(f"Rule missing 'rule' field: {rule}")
            return {'type': 'unknown', 'original': rule}

        # Check for option filters
        options = rule.get('options', [])
        if options:
            # Wrap the converted rule in a conditional based on options
            inner_rule = self._convert_rule_inner(rule)
            return self._wrap_with_options(inner_rule, options)

        return self._convert_rule_inner(rule)

    def _convert_rule_inner(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a rule without handling options."""
        rule_name = rule.get('rule')

        # Look up converter
        converter = self.RULE_CONVERTERS.get(rule_name)  # type: ignore[arg-type]
        if converter:
            return converter(rule)

        # Unknown rule type - preserve as helper
        return self._convert_unknown(rule)

    def _wrap_with_options(self, inner_rule: Dict[str, Any], options: List[Dict]) -> Dict[str, Any]:
        """
        Wrap a rule with option-based conditionals.

        Option filters in Rule Builder become conditional rules in AST format.
        """
        if not options:
            return inner_rule

        # Convert options to conditions
        option_conditions = []
        for opt in options:
            opt_condition = self._convert_option_filter(opt)
            if opt_condition:
                option_conditions.append(opt_condition)

        if not option_conditions:
            return inner_rule

        # Create conditional: if all options match, apply inner rule; else true
        if len(option_conditions) == 1:
            test_condition = option_conditions[0]
        else:
            test_condition = {'type': 'and', 'conditions': option_conditions}

        return {
            'type': 'conditional',
            'test': test_condition,
            'if_true': inner_rule,
            'if_false': {'type': 'constant', 'value': True}
        }

    def _convert_option_filter(self, opt: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Convert an OptionFilter to a comparison rule."""
        # OptionFilter format: {"option": "OptionName", "op": "eq", "value": X}
        # or simpler: {"option": "OptionName", "value": X} (implicit eq)
        option_name = opt.get('option')
        if not option_name:
            self.warnings.append(f"OptionFilter missing 'option' field: {opt}")
            return None

        value = opt.get('value')
        op = opt.get('op', 'eq')

        # Map operator names to symbols
        op_map = {
            'eq': '==',
            'ne': '!=',
            'gt': '>',
            'lt': '<',
            'ge': '>=',
            'le': '<=',
            'contains': 'in',
        }

        op_symbol = op_map.get(op, '==')

        return {
            'type': 'compare',
            'left': {
                'type': 'attribute',
                'object': {'type': 'name', 'name': 'options'},
                'attr': option_name
            },
            'op': op_symbol,
            'right': {'type': 'constant', 'value': value}
        }

    # -------------------------------------------------------------------------
    # Boolean Rule Converters
    # -------------------------------------------------------------------------

    def _convert_true(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert True_ rule."""
        return {'type': 'constant', 'value': True}

    def _convert_false(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Convert False_ rule."""
        return {'type': 'constant', 'value': False}

    # -------------------------------------------------------------------------
    # Item Rule Converters
    # -------------------------------------------------------------------------

    def _convert_has(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert Has rule.

        Rule Builder: {"rule": "Has", "args": {"item_name": "Sword", "count": 1}}
        AST Format: {"type": "item_check", "item": "Sword", "count": 1}
        """
        args = rule.get('args', {})
        item_name = args.get('item_name', args.get('item', ''))
        count = args.get('count', 1)

        result = {'type': 'item_check', 'item': item_name}
        if count != 1:
            result['count'] = count

        return result

    def _convert_has_all(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasAll rule.

        Rule Builder: {"rule": "HasAll", "args": {"items": ["Key1", "Key2"]}}
        AST Format: {"type": "and", "conditions": [{"type": "item_check", "item": "Key1"}, ...]}

        Or as state_method for efficiency:
        AST Format: {"type": "state_method", "method": "has_all", "args": [{"type": "constant", "value": ["Key1", "Key2"]}]}
        """
        args = rule.get('args', {})
        items = args.get('items', [])

        if not items:
            return {'type': 'constant', 'value': True}

        # Use state_method representation for efficiency
        return {
            'type': 'state_method',
            'method': 'has_all',
            'args': [{'type': 'constant', 'value': sorted(items)}]
        }

    def _convert_has_any(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasAny rule.

        Rule Builder: {"rule": "HasAny", "args": {"items": ["Sword", "Axe"]}}
        AST Format: {"type": "or", "conditions": [{"type": "item_check", "item": "Sword"}, ...]}

        Or as state_method:
        AST Format: {"type": "state_method", "method": "has_any", "args": [{"type": "constant", "value": ["Sword", "Axe"]}]}
        """
        args = rule.get('args', {})
        items = args.get('items', [])

        if not items:
            return {'type': 'constant', 'value': False}

        # Use state_method representation
        return {
            'type': 'state_method',
            'method': 'has_any',
            'args': [{'type': 'constant', 'value': sorted(items)}]
        }

    def _convert_has_all_counts(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasAllCounts rule.

        Rule Builder: {"rule": "HasAllCounts", "args": {"items": {"Sword": 2, "Shield": 1}}}
        AST Format: {"type": "state_method", "method": "has_all_counts", "args": [{"type": "constant", "value": {...}}]}
        """
        args = rule.get('args', {})
        items = args.get('items', {})

        if not items:
            return {'type': 'constant', 'value': True}

        # Sort for consistency
        sorted_items = {k: items[k] for k in sorted(items.keys())}

        return {
            'type': 'state_method',
            'method': 'has_all_counts',
            'args': [{'type': 'constant', 'value': sorted_items}]
        }

    def _convert_has_any_count(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasAnyCount rule.

        Rule Builder: {"rule": "HasAnyCount", "args": {"items": {"Sword": 2, "Axe": 3}}}
        AST Format: {"type": "or", "conditions": [{"type": "item_check", "item": "Sword", "count": 2}, ...]}
        """
        args = rule.get('args', {})
        items = args.get('items', {})

        if not items:
            return {'type': 'constant', 'value': False}

        conditions = []
        for item_name, count in sorted(items.items()):
            cond = {'type': 'item_check', 'item': item_name}
            if count != 1:
                cond['count'] = count
            conditions.append(cond)

        if len(conditions) == 1:
            return conditions[0]

        return {'type': 'or', 'conditions': conditions}

    def _convert_has_from_list(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasFromList rule.

        Rule Builder: {"rule": "HasFromList", "args": {"items": ["A", "B", "C"], "count": 2}}
        AST Format: {"type": "state_method", "method": "has_from_list", "args": [...]}

        This checks if player has at least 'count' total items from the list.
        """
        args = rule.get('args', {})
        items = args.get('items', [])
        count = args.get('count', 1)

        if not items:
            return {'type': 'constant', 'value': count <= 0}

        return {
            'type': 'state_method',
            'method': 'has_from_list',
            'args': [
                {'type': 'constant', 'value': sorted(items)},
                {'type': 'constant', 'value': count}
            ]
        }

    def _convert_has_from_list_unique(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasFromListUnique rule.

        Similar to HasFromList but counts unique items only.
        """
        args = rule.get('args', {})
        items = args.get('items', [])
        count = args.get('count', 1)

        if not items:
            return {'type': 'constant', 'value': count <= 0}

        return {
            'type': 'state_method',
            'method': 'has_from_list_unique',
            'args': [
                {'type': 'constant', 'value': sorted(items)},
                {'type': 'constant', 'value': count}
            ]
        }

    def _convert_has_group(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasGroup rule.

        Rule Builder: {"rule": "HasGroup", "args": {"group": "Keys", "count": 3}}
        AST Format: {"type": "group_check", "group": "Keys", "count": 3}
        """
        args = rule.get('args', {})
        group = args.get('group', '')
        count = args.get('count', 1)

        result = {'type': 'group_check', 'group': group}
        if count != 1:
            result['count'] = count

        return result

    def _convert_has_group_unique(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HasGroupUnique rule.

        Similar to HasGroup but counts unique items only.
        """
        args = rule.get('args', {})
        group = args.get('group', '')
        count = args.get('count', 1)

        return {
            'type': 'state_method',
            'method': 'has_group_unique',
            'args': [
                {'type': 'constant', 'value': group},
                {'type': 'constant', 'value': count}
            ]
        }

    # -------------------------------------------------------------------------
    # Composite Rule Converters
    # -------------------------------------------------------------------------

    def _convert_and(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert And rule.

        Rule Builder: {"rule": "And", "children": [...]}
        AST Format: {"type": "and", "conditions": [...]}
        """
        children = rule.get('children', [])

        if not children:
            return {'type': 'constant', 'value': True}

        converted_children = [self._convert_rule(child) for child in children]

        # Flatten nested ANDs
        flattened = []
        for child in converted_children:
            if child.get('type') == 'and':
                flattened.extend(child.get('conditions', []))
            else:
                flattened.append(child)

        # Remove constant True values (they don't affect AND)
        filtered = [c for c in flattened if not (c.get('type') == 'constant' and c.get('value') is True)]

        # Check for constant False (short-circuit)
        for c in filtered:
            if c.get('type') == 'constant' and c.get('value') is False:
                return {'type': 'constant', 'value': False}

        if not filtered:
            return {'type': 'constant', 'value': True}

        if len(filtered) == 1:
            return filtered[0]

        return {'type': 'and', 'conditions': filtered}

    def _convert_or(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert Or rule.

        Rule Builder: {"rule": "Or", "children": [...]}
        AST Format: {"type": "or", "conditions": [...]}
        """
        children = rule.get('children', [])

        if not children:
            return {'type': 'constant', 'value': False}

        converted_children = [self._convert_rule(child) for child in children]

        # Flatten nested ORs
        flattened = []
        for child in converted_children:
            if child.get('type') == 'or':
                flattened.extend(child.get('conditions', []))
            else:
                flattened.append(child)

        # Remove constant False values (they don't affect OR)
        filtered = [c for c in flattened if not (c.get('type') == 'constant' and c.get('value') is False)]

        # Check for constant True (short-circuit)
        for c in filtered:
            if c.get('type') == 'constant' and c.get('value') is True:
                return {'type': 'constant', 'value': True}

        if not filtered:
            return {'type': 'constant', 'value': False}

        if len(filtered) == 1:
            return filtered[0]

        return {'type': 'or', 'conditions': filtered}

    # -------------------------------------------------------------------------
    # Reachability Rule Converters
    # -------------------------------------------------------------------------

    def _convert_can_reach_region(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert CanReachRegion rule.

        Rule Builder: {"rule": "CanReachRegion", "args": {"region_name": "Castle"}}
        AST Format: {"type": "can_reach", "region": "Castle"}
        """
        args = rule.get('args', {})
        region_name = args.get('region_name', args.get('region', ''))

        return {'type': 'can_reach', 'region': region_name}

    def _convert_can_reach_location(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert CanReachLocation rule.

        Rule Builder: {"rule": "CanReachLocation", "args": {"location_name": "Chest1"}}
        AST Format: {"type": "location_check", "location": "Chest1"}
        """
        args = rule.get('args', {})
        location_name = args.get('location_name', args.get('location', ''))

        return {'type': 'location_check', 'location': location_name}

    def _convert_can_reach_entrance(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert CanReachEntrance rule.

        Rule Builder: {"rule": "CanReachEntrance", "args": {"entrance_name": "Door1"}}
        AST Format: {"type": "can_reach_entrance", "entrance": "Door1"}
        """
        args = rule.get('args', {})
        entrance_name = args.get('entrance_name', args.get('entrance', ''))

        return {'type': 'can_reach_entrance', 'entrance': entrance_name}

    # -------------------------------------------------------------------------
    # Wrapper/Utility Rule Converters
    # -------------------------------------------------------------------------

    def _convert_filtered(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert Filtered rule (rule with option filters).

        The Filtered rule wraps another rule with option-based conditions.
        """
        args = rule.get('args', {})
        inner_rule = args.get('rule', args.get('inner', {}))
        options = rule.get('options', [])

        converted_inner = self._convert_rule(inner_rule)

        if options:
            return self._wrap_with_options(converted_inner, options)

        return converted_inner

    def _convert_wrapper(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert WrapperRule.

        WrapperRule simply wraps another rule, so we just convert the inner rule.
        """
        args = rule.get('args', {})
        inner_rule = args.get('rule', args.get('inner', {}))

        return self._convert_rule(inner_rule)

    # -------------------------------------------------------------------------
    # Compare Handler
    # -------------------------------------------------------------------------

    def _convert_compare(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert Compare rule to AST format comparison.

        Rule Builder: {"rule": "Compare", "args": {"left": {...}, "op": ">=", "right": {...}}}
        AST Format: {"type": "compare", "left": {...}, "op": ">=", "right": {...}}
        """
        args = rule.get('args', {})
        left = args.get('left', {})
        op = args.get('op', '==')
        right = args.get('right', {})

        # Convert left and right operands if they're Rule Builder format
        converted_left = left
        converted_right = right

        if isinstance(left, dict) and 'rule' in left:
            converted_left = self._convert_rule(left)
        elif isinstance(left, dict) and 'type' not in left:
            # Might be a primitive value wrapped in a dict
            converted_left = {'type': 'constant', 'value': left}

        if isinstance(right, dict) and 'rule' in right:
            converted_right = self._convert_rule(right)
        elif isinstance(right, dict) and 'type' not in right:
            # Might be a primitive value wrapped in a dict
            converted_right = {'type': 'constant', 'value': right}

        # Handle primitive values
        if not isinstance(converted_left, dict):
            converted_left = {'type': 'constant', 'value': converted_left}
        if not isinstance(converted_right, dict):
            converted_right = {'type': 'constant', 'value': converted_right}

        return {
            'type': 'compare',
            'left': converted_left,
            'op': op,
            'right': converted_right
        }

    # -------------------------------------------------------------------------
    # Helper Call Handler
    # -------------------------------------------------------------------------

    def _convert_helper_call(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert HelperCall rule to AST format helper call.

        Rule Builder: {"rule": "HelperCall", "args": {"helper_name": "can_swim", "args": (), "body_data": {...}}}
        AST Format: {"type": "helper", "name": "can_swim", "args": [...]}
        """
        args = rule.get('args', {})
        helper_name = args.get('helper_name', 'unknown_helper')
        helper_args = args.get('args', ())
        body_data = args.get('body_data')

        # Convert helper arguments to AST format
        converted_args = []
        for arg in helper_args:
            if isinstance(arg, dict) and 'rule' in arg:
                converted_args.append(self._convert_rule(arg))
            elif isinstance(arg, dict) and 'type' in arg:
                # Already AST format
                converted_args.append(arg)
            else:
                converted_args.append({'type': 'constant', 'value': arg})

        result: Dict[str, Any] = {
            'type': 'helper',
            'name': helper_name,
        }
        if converted_args:
            result['args'] = converted_args

        # Include body_data if present - this allows the frontend to evaluate
        # helpers that are inlined in the rule rather than in the helpers dictionary
        if body_data:
            # body_data may be wrapped with params: {'params': [...], 'body': {...}}
            # or just the body directly for backward compatibility
            if isinstance(body_data, dict) and 'params' in body_data and 'body' in body_data:
                result['params'] = body_data['params']
                result['body'] = body_data['body']
            else:
                result['body'] = body_data

        return result

    # -------------------------------------------------------------------------
    # Unknown/Custom Rule Handler
    # -------------------------------------------------------------------------

    def _convert_unknown(self, rule: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle unknown/custom rule types.

        Custom rules are preserved as helper nodes with metadata.
        """
        rule_name = rule.get('rule', 'Unknown')
        args = rule.get('args', {})
        children = rule.get('children', [])

        self.warnings.append(f"Unknown rule type '{rule_name}' converted to helper")

        # Convert args to a list format
        args_list = []
        for key, value in sorted(args.items()):
            if isinstance(value, dict) and 'rule' in value:
                # Nested rule - convert it
                args_list.append(self._convert_rule(value))
            else:
                args_list.append({'type': 'constant', 'value': value})

        # Convert children if present
        if children:
            converted_children = [self._convert_rule(child) for child in children]
            args_list.append({'type': 'list', 'value': converted_children})

        result: Dict[str, Any] = {
            'type': 'helper',
            'name': rule_name,
        }
        if args_list:
            result['args'] = args_list

        # Add metadata for round-trip conversion
        result['_converted_from_rule_builder'] = True
        result['_original_args'] = args

        return result


# -------------------------------------------------------------------------
# Convenience Functions
# -------------------------------------------------------------------------

def convert_rule_builder_to_ast(rule: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert a single rule from Rule Builder format to AST format.

    Args:
        rule: Rule in Rule Builder format

    Returns:
        Tuple of (converted_rule, warnings)
    """
    converter = RuleBuilderToAST()
    result = converter.convert(rule)
    return result.rule, result.warnings + result.errors


def convert_rules_file_to_ast(data: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """
    Convert an entire rules file from Rule Builder format to AST format.

    This handles the full file structure including regions, locations, etc.

    Args:
        data: Full rules file data in Rule Builder format

    Returns:
        Tuple of (converted_data, all_warnings)
    """
    converter = RuleBuilderToAST()
    all_warnings = []

    def convert_access_rule(rule):
        """Convert an access_rule field if it exists."""
        if rule is None:
            return None
        result = converter.convert(rule)
        all_warnings.extend(result.warnings)
        all_warnings.extend(result.errors)
        return result.rule

    # Deep copy the data structure
    import copy
    converted_data = copy.deepcopy(data)

    # Convert rules in regions
    if 'regions' in converted_data:
        for player_id, regions in converted_data['regions'].items():
            for region_name, region_data in regions.items():
                # Convert exit rules
                if 'exits' in region_data:
                    for exit_data in region_data['exits']:
                        if 'access_rule' in exit_data and exit_data['access_rule']:
                            exit_data['access_rule'] = convert_access_rule(exit_data['access_rule'])

                # Convert entrance rules
                if 'entrances' in region_data:
                    for entrance_data in region_data['entrances']:
                        if 'access_rule' in entrance_data and entrance_data['access_rule']:
                            entrance_data['access_rule'] = convert_access_rule(entrance_data['access_rule'])

                # Convert location rules
                if 'locations' in region_data:
                    for location_data in region_data['locations']:
                        if 'access_rule' in location_data and location_data['access_rule']:
                            location_data['access_rule'] = convert_access_rule(location_data['access_rule'])
                        if 'item_rule' in location_data and location_data['item_rule']:
                            location_data['item_rule'] = convert_access_rule(location_data['item_rule'])

    # Convert dungeon rules if present
    if 'dungeons' in converted_data:
        for player_id, dungeons in converted_data['dungeons'].items():
            for dungeon_name, dungeon_data in dungeons.items():
                if 'medallion_check' in dungeon_data and dungeon_data['medallion_check']:
                    dungeon_data['medallion_check'] = convert_access_rule(dungeon_data['medallion_check'])

                if 'bosses' in dungeon_data:
                    for boss_key, boss_data in dungeon_data['bosses'].items():
                        if 'defeat_rule' in boss_data and boss_data['defeat_rule']:
                            boss_data['defeat_rule'] = convert_access_rule(boss_data['defeat_rule'])

    return converted_data, all_warnings
