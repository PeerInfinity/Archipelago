"""
Test runner for shared rule type fixtures.

This module loads test cases from test_json/fixtures/rule_type_tests.json
and validates that the frontend rule engine produces expected results.

The fixtures provide a single source of truth for rule evaluation behavior
that can be validated by both Python and JavaScript test suites.

Requirements:
    - Full Archipelago environment set up

Running tests:
    # From the Archipelago-CC root directory with virtual environment active:
    python -m pytest test_json/test_rule_fixtures.py -v

    # Or with unittest:
    python -m unittest test_json.test_rule_fixtures -v

    # Run specific test suite:
    python -m pytest test_json/test_rule_fixtures.py -k "negate" -v
"""

import json
import os
import unittest
from pathlib import Path


# Path to the fixtures file
FIXTURES_PATH = Path(__file__).parent / 'fixtures' / 'rule_type_tests.json'


def load_fixtures():
    """Load test fixtures from JSON file."""
    with open(FIXTURES_PATH, 'r') as f:
        return json.load(f)


class MockContext:
    """
    Mock context that simulates StateManager for rule evaluation.

    This provides the same interface that ruleEngine.js expects from
    the context object, allowing us to test rule evaluation without
    a full StateManager instance.
    """

    def __init__(self, inventory=None, groups=None, settings=None,
                 regions=None, player_id=1, helpers=None):
        self.inventory = inventory or {}
        self.groups = groups or {}
        self.settings = settings or {}
        self.regions = regions or set()
        self.player_id = player_id
        self.helpers = helpers or {}  # Pre-configured helper results

    def hasItem(self, item_name):
        """Check if player has at least one of the item."""
        return self.inventory.get(item_name, 0) > 0

    def countItem(self, item_name):
        """Get the count of an item."""
        return self.inventory.get(item_name, 0)

    def hasGroup(self, group_name, count=1):
        """Check if player has items from a group."""
        return self.groups.get(group_name, 0) >= count

    def countGroup(self, group_name):
        """Get the count of items in a group."""
        return self.groups.get(group_name, 0)

    def canReach(self, region_name):
        """Check if a region is reachable."""
        return region_name in self.regions

    def getPlayerId(self):
        """Get the current player ID."""
        return self.player_id

    def getSetting(self, setting_name):
        """Get a setting value."""
        return self.settings.get(setting_name)

    def executeHelper(self, helper_name, *args):
        """Execute a helper function."""
        # Check for pre-configured result
        if helper_name in self.helpers:
            result = self.helpers[helper_name]
            return result(args) if callable(result) else result

        # Implement common helpers
        if helper_name == 'has':
            return self.hasItem(args[0]) if args else False
        elif helper_name == 'count':
            return self.countItem(args[0]) if args else 0
        elif helper_name == 'has_group':
            return self.hasGroup(args[0], args[1] if len(args) > 1 else 1)
        elif helper_name == 'count_group':
            return self.countGroup(args[0]) if args else 0
        return None

    def hasAny(self, items):
        """Check if player has any of the items."""
        if isinstance(items, list):
            return any(self.hasItem(item) for item in items)
        return False

    def hasAll(self, items):
        """Check if player has all items."""
        if isinstance(items, list):
            return all(self.hasItem(item) for item in items)
        return False

    def hasCapability(self, capability):
        """Check if a capability is available."""
        return self.settings.get(f'capability_{capability}', False)

    def isLocationAccessible(self, location):
        """Check if a location is accessible."""
        accessible = self.settings.get('accessible_locations', set())
        return location in accessible

    def getCheckedLocationsCount(self):
        """Get the number of checked locations."""
        return self.settings.get('checked_locations_count', 0)

    def getTotalItemCount(self):
        """Get the total number of items collected."""
        return sum(self.inventory.values())

    def getProgItemCount(self, key):
        """Get the count of a progression item category."""
        prog_items = self.settings.get('prog_items', {})
        return prog_items.get(key, 0)

    def getPlacement(self, location):
        """Get the item placed at a location."""
        placements = self.settings.get('placements', {})
        return placements.get(location)

    def searchPlacement(self, item, player, locations):
        """Search for an item in a list of locations."""
        placements = self.settings.get('placements', {})
        for loc in locations:
            placed = placements.get(loc)
            if placed:
                # Placements are stored as [item_name, player] lists
                if isinstance(placed, list) and len(placed) >= 2:
                    if placed[0] == item and placed[1] == player:
                        return True
        return False

    def countGroupUnique(self, group):
        """Count unique items in a group."""
        return self.groups.get(f'{group}_unique', self.groups.get(group, 0))

    def isEntranceAccessible(self, entrance):
        """Check if an entrance is accessible."""
        accessible = self.settings.get('accessible_entrances', set())
        return entrance in accessible

    @classmethod
    def from_test_context(cls, context_dict):
        """Create a MockContext from a test case context dictionary."""
        if not context_dict:
            return cls()

        # Build settings dict from various context keys
        settings = dict(context_dict.get('settings', {}))

        # Add special context keys to settings
        if 'progItems' in context_dict:
            settings['prog_items'] = context_dict['progItems']
        if 'checkedLocations' in context_dict:
            settings['checked_locations_count'] = context_dict['checkedLocations']
        if 'placements' in context_dict:
            settings['placements'] = context_dict['placements']
        if 'regionAttributes' in context_dict:
            settings['region_attributes'] = context_dict['regionAttributes']
        if 'accessibleLocations' in context_dict:
            settings['accessible_locations'] = set(context_dict['accessibleLocations'])
        if 'accessibleEntrances' in context_dict:
            settings['accessible_entrances'] = set(context_dict['accessibleEntrances'])
        if 'totalItems' in context_dict:
            settings['total_items'] = context_dict['totalItems']
        if 'locationRules' in context_dict:
            settings['location_rules'] = context_dict['locationRules']
        if 'entrances' in context_dict:
            settings['entrances'] = context_dict['entrances']

        return cls(
            inventory=context_dict.get('inventory', {}),
            groups=context_dict.get('groups', {}),
            settings=settings,
            regions=set(context_dict.get('regions', [])),
            player_id=context_dict.get('playerId', 1),
            helpers=context_dict.get('helpers', {})
        )


def evaluate_rule_python(rule, context):
    """
    Pure Python implementation of rule evaluation.

    This mirrors the behavior of ruleEngine.js evaluateRule function,
    allowing us to validate that the fixtures produce expected results.
    """
    if not isinstance(rule, dict):
        return rule

    rule_type = rule.get('type')

    if rule_type == 'constant':
        return rule.get('value')

    elif rule_type == 'negate':
        operand = evaluate_rule_python(rule.get('operand'), context)
        if operand is None:
            return None
        return -operand

    elif rule_type == 'player_id':
        return context.getPlayerId()

    elif rule_type == 'binary_op' or rule_type == 'binop':
        left = evaluate_rule_python(rule.get('left'), context)
        right = evaluate_rule_python(rule.get('right'), context)
        op = rule.get('op')

        if left is None or right is None:
            return None

        if op == '+':
            return left + right
        elif op == '-':
            return left - right
        elif op == '*':
            return left * right
        elif op == '/':
            return left / right
        elif op == '//':
            return left // right
        elif op == '%':
            return left % right
        elif op == '**':
            return left ** right

        return None

    elif rule_type == 'compare' or rule_type == 'comparison':
        left = evaluate_rule_python(rule.get('left'), context)
        right = evaluate_rule_python(rule.get('right'), context)
        op = rule.get('op')

        if left is None or right is None:
            return None

        if op == '==':
            return left == right
        elif op == '!=':
            return left != right
        elif op == '<':
            return left < right
        elif op == '>':
            return left > right
        elif op == '<=':
            return left <= right
        elif op == '>=':
            return left >= right
        elif op == 'in':
            return left in right
        elif op == 'not in':
            return left not in right

        return None

    elif rule_type == 'and':
        conditions = rule.get('conditions', [])
        if not conditions:
            return True  # Empty AND is vacuously true
        for cond in conditions:
            result = evaluate_rule_python(cond, context)
            if result is None:
                return None
            if not result:
                return False
        return True

    elif rule_type == 'or':
        conditions = rule.get('conditions', [])
        if not conditions:
            return False  # Empty OR is vacuously false
        for cond in conditions:
            result = evaluate_rule_python(cond, context)
            if result is None:
                return None
            if result:
                return True
        return False

    elif rule_type == 'not':
        # Handle both 'operand' and 'condition' fields
        operand = rule.get('operand') or rule.get('condition')
        result = evaluate_rule_python(operand, context)
        if result is None:
            return None
        return not result

    elif rule_type == 'conditional':
        test = evaluate_rule_python(rule.get('test'), context)
        if test is None:
            return None
        if test:
            return evaluate_rule_python(rule.get('if_true'), context)
        else:
            return evaluate_rule_python(rule.get('if_false'), context)

    elif rule_type == 'min':
        args = rule.get('args', [])
        values = [evaluate_rule_python(arg, context) for arg in args]
        if any(v is None for v in values):
            return None
        return min(values)

    elif rule_type == 'max':
        args = rule.get('args', [])
        values = [evaluate_rule_python(arg, context) for arg in args]
        if any(v is None for v in values):
            return None
        return max(values)

    elif rule_type == 'item_check':
        item = rule.get('item')
        if isinstance(item, dict):
            item = evaluate_rule_python(item, context)

        count_rule = rule.get('count')
        if count_rule:
            required = evaluate_rule_python(count_rule, context)
            return context.countItem(item) >= required
        return context.hasItem(item)

    elif rule_type == 'count_item':
        item = rule.get('item')
        if isinstance(item, dict):
            item = evaluate_rule_python(item, context)
        return context.countItem(item)

    elif rule_type == 'group_check':
        group = rule.get('group')
        count = rule.get('count', 1)
        return context.hasGroup(group, count)

    elif rule_type == 'group_count':
        group = rule.get('group')
        return context.countGroup(group)

    elif rule_type == 'list':
        values = rule.get('value', [])
        return [evaluate_rule_python(v, context) for v in values]

    elif rule_type == 'name':
        # In block execution, names are resolved from local scope
        # For standalone tests, return None (unknown)
        name = rule.get('name')
        return context._local_scope.get(name) if hasattr(context, '_local_scope') else None

    elif rule_type == 'block':
        # Execute statements and return the return value
        local_scope = {}
        context._local_scope = local_scope

        for stmt in rule.get('statements', []):
            result = execute_statement(stmt, context, local_scope)
            if isinstance(result, dict) and result.get('_return'):
                return result['_value']

        return None

    elif rule_type == 'setting_value':
        setting = rule.get('setting')
        return context.getSetting(setting)

    elif rule_type == 'helper':
        helper_name = rule.get('name')
        args = rule.get('args', [])
        evaluated_args = [evaluate_rule_python(arg, context) for arg in args]
        return context.executeHelper(helper_name, *evaluated_args)

    elif rule_type == 'state_method':
        method = rule.get('method')
        args = rule.get('args', [])
        evaluated_args = [evaluate_rule_python(arg, context) for arg in args]

        if method == 'can_reach':
            return context.canReach(evaluated_args[0]) if evaluated_args else False
        elif method == 'has':
            return context.hasItem(evaluated_args[0]) if evaluated_args else False
        elif method == 'count':
            return context.countItem(evaluated_args[0]) if evaluated_args else 0
        elif method == 'has_group':
            count = evaluated_args[1] if len(evaluated_args) > 1 else 1
            return context.hasGroup(evaluated_args[0], count) if evaluated_args else False
        elif method == 'count_group':
            return context.countGroup(evaluated_args[0]) if evaluated_args else 0
        elif method == 'has_any':
            return context.hasAny(evaluated_args[0]) if evaluated_args else False
        elif method == 'has_all':
            return context.hasAll(evaluated_args[0]) if evaluated_args else False
        return None

    elif rule_type == 'can_reach':
        region = rule.get('region')
        if isinstance(region, dict):
            region = evaluate_rule_python(region, context)
        return context.canReach(region)

    # === Basic data types ===

    elif rule_type == 'tuple':
        elements = rule.get('elements', [])
        return [evaluate_rule_python(e, context) for e in elements]

    elif rule_type == 'set':
        elements = rule.get('elements', [])
        return [evaluate_rule_python(e, context) for e in elements]

    elif rule_type == 'attribute':
        obj = evaluate_rule_python(rule.get('object'), context)
        attr = rule.get('attr')
        if obj is None:
            return None
        if isinstance(obj, dict):
            return obj.get(attr)
        return getattr(obj, attr, None)

    elif rule_type == 'subscript':
        value = evaluate_rule_python(rule.get('value'), context)
        index = evaluate_rule_python(rule.get('index'), context)
        if value is None or index is None:
            return None
        try:
            return value[index]
        except (IndexError, KeyError, TypeError):
            return None

    elif rule_type == 'slice':
        value = evaluate_rule_python(rule.get('value'), context)
        lower = evaluate_rule_python(rule.get('lower'), context) if rule.get('lower') else None
        upper = evaluate_rule_python(rule.get('upper'), context) if rule.get('upper') else None
        if value is None:
            return None
        return value[lower:upper]

    # === Builtin function calls ===

    elif rule_type == 'call':
        func = rule.get('func')
        args = rule.get('args', [])
        evaluated_args = [evaluate_rule_python(arg, context) for arg in args]

        if func == 'len':
            return len(evaluated_args[0]) if evaluated_args else 0
        elif func == 'sum':
            return sum(evaluated_args[0]) if evaluated_args else 0
        elif func == 'int':
            return int(evaluated_args[0]) if evaluated_args else 0
        elif func == 'bool':
            return bool(evaluated_args[0]) if evaluated_args else False
        elif func == 'all':
            return all(evaluated_args[0]) if evaluated_args else True
        elif func == 'any':
            return any(evaluated_args[0]) if evaluated_args else False
        return None

    elif rule_type == 'sum':
        iterable = evaluate_rule_python(rule.get('iterable'), context)
        start = evaluate_rule_python(rule.get('start'), context) if rule.get('start') else 0
        if iterable is None:
            return None
        return sum(iterable, start)

    # === Iteration rules ===

    elif rule_type == 'all_of':
        iterator_info = rule.get('iterator_info', {})
        target = iterator_info.get('target', {})
        iterator = evaluate_rule_python(iterator_info.get('iterator'), context)
        element_rule = rule.get('element_rule')

        if iterator is None:
            return None

        var_name = target.get('name') if isinstance(target, dict) else None
        if not var_name:
            return None

        # Save and restore local scope
        old_scope = getattr(context, '_local_scope', {})
        context._local_scope = dict(old_scope)

        result = True
        for item in iterator:
            context._local_scope[var_name] = item
            val = evaluate_rule_python(element_rule, context)
            if not val:
                result = False
                break

        context._local_scope = old_scope
        return result

    elif rule_type == 'any_of':
        iterator_info = rule.get('iterator_info', {})
        target = iterator_info.get('target', {})
        iterator = evaluate_rule_python(iterator_info.get('iterator'), context)
        element_rule = rule.get('element_rule')

        if iterator is None:
            return None

        var_name = target.get('name') if isinstance(target, dict) else None
        if not var_name:
            return None

        old_scope = getattr(context, '_local_scope', {})
        context._local_scope = dict(old_scope)

        result = False
        for item in iterator:
            context._local_scope[var_name] = item
            val = evaluate_rule_python(element_rule, context)
            if val:
                result = True
                break

        context._local_scope = old_scope
        return result

    elif rule_type == 'sum_of':
        iterator_info = rule.get('iterator_info', {})
        target = iterator_info.get('target', {})
        iterator = evaluate_rule_python(iterator_info.get('iterator'), context)
        element_rule = rule.get('element_rule')

        if iterator is None:
            return None

        var_name = target.get('name') if isinstance(target, dict) else None
        if not var_name:
            return None

        old_scope = getattr(context, '_local_scope', {})
        context._local_scope = dict(old_scope)

        total = 0
        for item in iterator:
            context._local_scope[var_name] = item
            val = evaluate_rule_python(element_rule, context)
            if val is not None:
                total += val

        context._local_scope = old_scope
        return total

    elif rule_type == 'generator_expression':
        # Used inside sum() - evaluate it as a list
        element = rule.get('element')
        comp = rule.get('comprehension', {})
        target = comp.get('target', {})
        iterator = evaluate_rule_python(comp.get('iterator'), context)

        if iterator is None:
            return None

        var_name = target.get('name') if isinstance(target, dict) else None
        if not var_name:
            return []

        old_scope = getattr(context, '_local_scope', {})
        context._local_scope = dict(old_scope)

        result = []
        for item in iterator:
            context._local_scope[var_name] = item
            val = evaluate_rule_python(element, context)
            result.append(val)

        context._local_scope = old_scope
        return result

    # === Game-specific rules ===

    elif rule_type == 'capability':
        capability = rule.get('capability')
        # Capability checks use helpers like 'can_swim' for 'swim'
        helper_name = f'can_{capability}'
        return context.executeHelper(helper_name)

    elif rule_type == 'counts':
        items = rule.get('items', [])
        count_rule = rule.get('count')
        required = evaluate_rule_python(count_rule, context) if count_rule else 1
        actual = sum(1 for item in items if context.hasItem(item))
        return actual >= required

    elif rule_type == 'count_true':
        count = rule.get('count', 0)
        conditions = rule.get('conditions', [])
        true_count = sum(1 for cond in conditions if evaluate_rule_python(cond, context))
        return true_count >= count

    elif rule_type == 'weighted_count_true':
        count = rule.get('count', 0)
        weighted_conditions = rule.get('weighted_conditions', [])
        total_weight = 0
        for cond, weight in weighted_conditions:
            if evaluate_rule_python(cond, context):
                total_weight += weight
        return total_weight >= count

    elif rule_type == 'unique_count':
        args = rule.get('args', [])
        if len(args) >= 2:
            threshold = evaluate_rule_python(args[0], context)
            items_list = evaluate_rule_python(args[1], context)
            if threshold is None or items_list is None:
                return None
            unique_count = sum(1 for item in items_list if context.hasItem(item))
            return unique_count >= threshold
        return None

    # === Settings and world rules ===

    elif rule_type == 'option_value':
        setting = rule.get('setting')
        return context.getSetting(setting)

    elif rule_type == 'setting_check':
        setting = rule.get('setting')
        value = rule.get('value')
        return context.getSetting(setting) == value

    elif rule_type == 'world_attribute':
        setting = rule.get('setting')
        return context.getSetting(setting)

    elif rule_type == 'world_reference':
        return None  # Returns the world object, which we mock as None

    elif rule_type == 'region_reference':
        region = rule.get('region')
        return {'__regionRef': True, 'regionName': region}

    elif rule_type == 'region_attribute':
        region_rule = rule.get('region')
        attr = rule.get('attr')
        region = evaluate_rule_python(region_rule, context)
        if region is None:
            return None
        # Get region name from the region reference
        region_name = region.get('regionName') if isinstance(region, dict) else region
        # Look up the attribute from region_attributes in settings
        region_attrs = context.settings.get('region_attributes', {})
        if region_name in region_attrs:
            return region_attrs[region_name].get(attr)
        return None

    # === Location and placement rules ===

    elif rule_type == 'location_rule_ref':
        location = rule.get('location')
        location_rules = context.settings.get('location_rules', {})
        return location_rules.get(location, False)

    elif rule_type == 'locations_checked':
        count_rule = rule.get('count')
        required = evaluate_rule_python(count_rule, context) if count_rule else 0
        checked = context.getCheckedLocationsCount() if hasattr(context, 'getCheckedLocationsCount') else 0
        return checked >= required

    elif rule_type == 'placement_lookup':
        location = evaluate_rule_python(rule.get('location'), context)
        return context.getPlacement(location) if hasattr(context, 'getPlacement') else None

    elif rule_type == 'placement_search':
        item = evaluate_rule_python(rule.get('item'), context)
        player = evaluate_rule_python(rule.get('player'), context)
        locations = evaluate_rule_python(rule.get('locations'), context)
        return context.searchPlacement(item, player, locations)

    elif rule_type == 'total_items_count':
        count_rule = rule.get('count')
        required = evaluate_rule_python(count_rule, context) if count_rule else 0
        total = context.getTotalItemCount() if hasattr(context, 'getTotalItemCount') else 0
        return total >= required

    elif rule_type == 'prog_item_count':
        key = rule.get('key')
        return context.getProgItemCount(key) if hasattr(context, 'getProgItemCount') else 0

    # === Function and method calls ===

    elif rule_type == 'function_call':
        func_rule = rule.get('function')
        args = rule.get('args', [])
        evaluated_args = [evaluate_rule_python(arg, context) for arg in args]
        # In test context, function_call often represents state.has() style calls
        # The function rule is usually {"type": "attribute", "object": {...}, "attr": "has"}
        if func_rule and func_rule.get('type') == 'attribute':
            method = func_rule.get('attr')
            if method == 'has':
                return context.hasItem(evaluated_args[0]) if evaluated_args else False
            elif method == 'count':
                return context.countItem(evaluated_args[0]) if evaluated_args else 0
        return None

    elif rule_type == 'method_call':
        # Used in block execution for things like list.append()
        obj_rule = rule.get('object')
        method = rule.get('method')
        args = rule.get('args', [])
        # This is handled in execute_statement for blocks
        return None

    elif rule_type == 'generic_helper':
        name = rule.get('name')
        args = rule.get('args', [])
        evaluated_args = [evaluate_rule_python(arg, context) for arg in args]
        return context.executeHelper(name, *evaluated_args)

    # === String formatting ===

    elif rule_type == 'f_string':
        parts = rule.get('parts', [])
        result = ''
        for part in parts:
            val = evaluate_rule_python(part, context)
            result += str(val) if val is not None else ''
        return result

    elif rule_type == 'dict_lambda_lookup':
        key = evaluate_rule_python(rule.get('key'), context)
        cases = rule.get('cases', {})
        default = rule.get('default')
        if key in cases:
            return evaluate_rule_python(cases[key], context)
        return evaluate_rule_python(default, context) if default else None

    # === Rule Builder format support ===
    # Handle {"rule": "RuleName", "args": {...}} format

    if 'rule' in rule and 'type' not in rule:
        rule_name = rule.get('rule')
        args = rule.get('args', {})

        if rule_name == 'Constant':
            return args.get('value')

        elif rule_name == 'Tuple':
            value = args.get('value', [])
            return [evaluate_rule_python(v, context) for v in value]

        elif rule_name == 'Attribute':
            obj = evaluate_rule_python(args.get('object'), context)
            attr = args.get('attr')
            if obj is None:
                return None
            if isinstance(obj, dict):
                return obj.get(attr)
            return getattr(obj, attr, None)

        elif rule_name == 'OptionValue':
            option = args.get('option')
            return context.getSetting(option)

        elif rule_name == 'WorldAttribute':
            attribute = args.get('attribute')
            return context.getSetting(attribute)

        elif rule_name == 'CountCheck':
            item = args.get('item')
            count = args.get('count', 1)
            return context.countItem(item) >= count

        elif rule_name == 'HasFromList':
            items = args.get('items', [])
            count = args.get('count', 1)
            actual = sum(context.countItem(item) for item in items)
            return actual >= count

        elif rule_name == 'HasFromListUnique':
            items = args.get('items', [])
            count = args.get('count', 1)
            unique = sum(1 for item in items if context.hasItem(item))
            return unique >= count

        elif rule_name == 'HasAllCounts':
            items = args.get('items', {})
            for item, required in items.items():
                if context.countItem(item) < required:
                    return False
            return True

        elif rule_name == 'HasAnyCount':
            items = args.get('items', {})
            for item, required in items.items():
                if context.countItem(item) >= required:
                    return True
            return False

        elif rule_name == 'CountFromList':
            item_names = args.get('item_names', [])
            return sum(context.countItem(item) for item in item_names)

        elif rule_name == 'CountGroupUnique':
            group = args.get('group')
            return context.countGroupUnique(group) if hasattr(context, 'countGroupUnique') else 0

        elif rule_name == 'UniqueCount':
            threshold = args.get('threshold', 0)
            items = args.get('items', [])
            unique = 0
            for item_data in items:
                item_name = item_data[0] if isinstance(item_data, list) else item_data
                if context.hasItem(item_name):
                    unique += 1
            return unique >= threshold

        elif rule_name == 'EntranceAccessRule':
            entrance = args.get('entrance')
            entrances = context.settings.get('entrances', {})
            return entrances.get(entrance, False)

        elif rule_name == 'AST_all_of':
            element_rule = args.get('element_rule')
            iterator_info = args.get('iterator_info', {})
            target = iterator_info.get('target', {})
            iterator = evaluate_rule_python(iterator_info.get('iterator'), context)

            if iterator is None:
                return None

            var_name = target.get('name') if isinstance(target, dict) else None
            if not var_name:
                return None

            old_scope = getattr(context, '_local_scope', {})
            context._local_scope = dict(old_scope)

            result = True
            for item in iterator:
                context._local_scope[var_name] = item
                val = evaluate_rule_python(element_rule, context)
                if not val:
                    result = False
                    break

            context._local_scope = old_scope
            return result

        elif rule_name == 'AST_any_of':
            element_rule = args.get('element_rule')
            iterator_info = args.get('iterator_info', {})
            target = iterator_info.get('target', {})
            iterator = evaluate_rule_python(iterator_info.get('iterator'), context)

            if iterator is None:
                return None

            var_name = target.get('name') if isinstance(target, dict) else None
            if not var_name:
                return None

            old_scope = getattr(context, '_local_scope', {})
            context._local_scope = dict(old_scope)

            result = False
            for item in iterator:
                context._local_scope[var_name] = item
                val = evaluate_rule_python(element_rule, context)
                if val:
                    result = True
                    break

            context._local_scope = old_scope
            return result

        elif rule_name == 'AST_dict_lambda_lookup':
            key = args.get('key')
            cases = args.get('cases', {})
            return cases.get(key)

        elif rule_name == 'weighted_sum':
            # args is a list: [threshold, weighted_items]
            if isinstance(args, list) and len(args) >= 2:
                threshold = evaluate_rule_python(args[0], context)
                weighted_items = evaluate_rule_python(args[1], context)
                if threshold is None or weighted_items is None:
                    return None
                total = 0
                for item_data in weighted_items:
                    if isinstance(item_data, list) and len(item_data) >= 2:
                        item, weight = item_data[0], item_data[1]
                        total += context.countItem(item) * weight
                return total >= threshold
            return None

        elif rule_name == 'WeightedSum':
            threshold = args.get('threshold', 0)
            items = args.get('items', [])
            total = 0
            for item_data in items:
                if isinstance(item_data, list) and len(item_data) >= 2:
                    item, weight = item_data[0], item_data[1]
                    total += context.countItem(item) * weight
            return total >= threshold

        return None

    # Unknown rule type
    return None


def execute_statement(stmt, context, local_scope):
    """Execute a statement in block mode."""
    stmt_type = stmt.get('type')

    if stmt_type == 'return':
        value = evaluate_rule_with_scope(stmt.get('value'), context, local_scope)
        return {'_return': True, '_value': value}

    elif stmt_type == 'assign':
        var_name = stmt.get('var')
        op = stmt.get('op', '=')
        value = evaluate_rule_with_scope(stmt.get('value'), context, local_scope)

        if op == '=':
            local_scope[var_name] = value
        elif op == '+=':
            local_scope[var_name] = local_scope.get(var_name, 0) + value
        elif op == '-=':
            local_scope[var_name] = local_scope.get(var_name, 0) - value
        elif op == '*=':
            local_scope[var_name] = local_scope.get(var_name, 1) * value

        return None

    elif stmt_type == 'aug_assign':
        # Augmented assignment: x += 3 -> {"type": "aug_assign", "target": "x", "op": "+", "value": ...}
        target = stmt.get('target')
        op = stmt.get('op')
        value = evaluate_rule_with_scope(stmt.get('value'), context, local_scope)

        current = local_scope.get(target, 0)
        if op == '+':
            local_scope[target] = current + value
        elif op == '-':
            local_scope[target] = current - value
        elif op == '*':
            local_scope[target] = current * value
        elif op == '/':
            local_scope[target] = current / value
        elif op == '//':
            local_scope[target] = current // value
        elif op == '%':
            local_scope[target] = current % value

        return None

    elif stmt_type == 'for_range':
        var_name = stmt.get('var')
        start = evaluate_rule_with_scope(stmt.get('start'), context, local_scope)
        end = evaluate_rule_with_scope(stmt.get('end'), context, local_scope)
        body = stmt.get('body', [])

        for i in range(start, end):
            local_scope[var_name] = i
            should_break = False
            for body_stmt in body:
                result = execute_statement(body_stmt, context, local_scope)
                if isinstance(result, dict):
                    if result.get('_return'):
                        return result
                    if result.get('_break'):
                        should_break = True
                        break
                    if result.get('_continue'):
                        break
            if should_break:
                break

        return None

    elif stmt_type == 'for_iter':
        var_name = stmt.get('var')
        iterable = evaluate_rule_with_scope(stmt.get('iterable'), context, local_scope)
        body = stmt.get('body', [])

        if iterable is None:
            return None

        for item in iterable:
            local_scope[var_name] = item
            should_break = False
            for body_stmt in body:
                result = execute_statement(body_stmt, context, local_scope)
                if isinstance(result, dict):
                    if result.get('_return'):
                        return result
                    if result.get('_break'):
                        should_break = True
                        break
                    if result.get('_continue'):
                        break
            if should_break:
                break

        return None

    elif stmt_type == 'while_loop':
        test = stmt.get('test')
        body = stmt.get('body', [])
        max_iterations = 1000  # Safety limit

        iterations = 0
        while iterations < max_iterations:
            iterations += 1
            condition = evaluate_rule_with_scope(test, context, local_scope)
            if not condition:
                break

            should_break = False
            for body_stmt in body:
                result = execute_statement(body_stmt, context, local_scope)
                if isinstance(result, dict):
                    if result.get('_return'):
                        return result
                    if result.get('_break'):
                        should_break = True
                        break
                    if result.get('_continue'):
                        break
            if should_break:
                break

        return None

    elif stmt_type == 'if_statement':
        test = stmt.get('test')
        body = stmt.get('body', [])
        orelse = stmt.get('orelse', [])

        condition = evaluate_rule_with_scope(test, context, local_scope)
        statements = body if condition else orelse

        for body_stmt in statements:
            result = execute_statement(body_stmt, context, local_scope)
            if isinstance(result, dict) and (result.get('_return') or result.get('_break') or result.get('_continue')):
                return result

        return None

    elif stmt_type == 'break':
        return {'_break': True}

    elif stmt_type == 'continue':
        return {'_continue': True}

    elif stmt_type == 'method_call':
        obj_rule = stmt.get('object')
        method = stmt.get('method')
        args = stmt.get('args', [])

        obj = evaluate_rule_with_scope(obj_rule, context, local_scope)
        evaluated_args = [evaluate_rule_with_scope(arg, context, local_scope) for arg in args]

        if obj is not None and method == 'append' and isinstance(obj, list):
            if evaluated_args:
                obj.append(evaluated_args[0])
        elif obj is not None and method == 'extend' and isinstance(obj, list):
            if evaluated_args and isinstance(evaluated_args[0], list):
                obj.extend(evaluated_args[0])

        return None

    return None


def evaluate_rule_with_scope(rule, context, local_scope):
    """Evaluate a rule with access to local scope for variable resolution."""
    if not isinstance(rule, dict):
        return rule

    rule_type = rule.get('type')

    if rule_type == 'name':
        name = rule.get('name')
        if name in local_scope:
            return local_scope[name]
        return None

    # For other types, use the main evaluator
    context._local_scope = local_scope
    return evaluate_rule_python(rule, context)


class TestRuleFixtures(unittest.TestCase):
    """Test class that dynamically generates tests from fixtures."""

    @classmethod
    def setUpClass(cls):
        """Load fixtures once for all tests."""
        cls.fixtures = load_fixtures()

    def run_fixture_test(self, suite_name, test_case):
        """Run a single fixture test case."""
        rule = test_case['rule']
        expected = test_case['expected']
        context_dict = test_case.get('context', {})

        context = MockContext.from_test_context(context_dict)
        result = evaluate_rule_python(rule, context)

        self.assertEqual(
            result,
            expected,
            f"Test '{test_case['name']}' in suite '{suite_name}' failed"
        )


def get_unsupported_rule_types(rule):
    """
    Check if a rule uses types not supported by the Python evaluator.
    Returns a set of unsupported type names found.
    """
    unsupported = set()

    # Rule types supported by evaluate_rule_python
    SUPPORTED_TYPES = {
        # Basic types
        'constant', 'negate', 'player_id', 'binary_op', 'binop', 'compare', 'comparison',
        'and', 'or', 'not', 'conditional', 'min', 'max', 'list', 'name', 'block',
        # Data types
        'tuple', 'set', 'attribute', 'subscript', 'slice',
        # Item/inventory
        'item_check', 'count_item', 'group_check', 'group_count', 'counts', 'count_true',
        'weighted_count_true', 'unique_count', 'total_items_count', 'prog_item_count',
        # Settings/world
        'setting_value', 'option_value', 'setting_check', 'world_attribute', 'world_reference',
        # Regions
        'can_reach', 'region_reference', 'region_attribute',
        # Helpers/methods
        'helper', 'state_method', 'generic_helper', 'function_call', 'method_call',
        # Builtins
        'call', 'sum',
        # Iteration
        'all_of', 'any_of', 'sum_of', 'generator_expression',
        # Locations/placements
        'location_rule_ref', 'locations_checked', 'placement_lookup', 'placement_search',
        # Other
        'capability', 'f_string', 'dict_lambda_lookup',
        # Statement types (used in blocks)
        'return', 'assign', 'aug_assign', 'for_range', 'for_iter', 'while_loop',
        'if_statement', 'break', 'continue',
    }

    # Rule Builder format rules supported
    SUPPORTED_RULE_BUILDERS = {
        'Constant', 'Tuple', 'Attribute', 'OptionValue', 'WorldAttribute',
        'CountCheck', 'HasFromList', 'HasFromListUnique', 'HasAllCounts', 'HasAnyCount',
        'CountFromList', 'CountGroupUnique', 'UniqueCount', 'EntranceAccessRule',
        'AST_all_of', 'AST_any_of', 'AST_dict_lambda_lookup', 'weighted_sum', 'WeightedSum',
    }

    def check_rule(r):
        if not isinstance(r, dict):
            return

        # Check for Rule Builder format
        if 'rule' in r and 'type' not in r:
            rule_name = r.get('rule')
            if rule_name not in SUPPORTED_RULE_BUILDERS:
                unsupported.add(f"rule:{rule_name}")
            # Check nested rules in args
            args = r.get('args', {})
            if isinstance(args, dict):
                for key, value in args.items():
                    if isinstance(value, dict):
                        check_rule(value)
                    elif isinstance(value, list):
                        for item in value:
                            check_rule(item)
            elif isinstance(args, list):
                for item in args:
                    check_rule(item)
            return

        rule_type = r.get('type')
        if rule_type and rule_type not in SUPPORTED_TYPES:
            unsupported.add(rule_type)

        # Recursively check nested rules, but skip 'value' in constants
        # (since constant values are data, not rule definitions)
        for key, value in r.items():
            # Skip the 'value' field of constants - it's data, not a rule
            if rule_type == 'constant' and key == 'value':
                continue
            if isinstance(value, dict):
                check_rule(value)
            elif isinstance(value, list):
                for item in value:
                    check_rule(item)

    check_rule(rule)
    return unsupported


def generate_test_methods():
    """
    Generate test methods for each fixture test case.

    This allows pytest/unittest to report each test case individually.
    Tests using unsupported rule types are skipped.
    """
    fixtures = load_fixtures()

    for suite_name, suite in fixtures.get('test_suites', {}).items():
        for test_case in suite.get('tests', []):
            test_name = f"test_{suite_name}_{test_case['name']}"
            unsupported = get_unsupported_rule_types(test_case.get('rule', {}))

            # Create a closure to capture the test case
            def make_test(sn, tc, skip_types):
                if skip_types:
                    @unittest.skip(f"Uses unsupported rule types: {', '.join(sorted(skip_types))}")
                    def test_method(self):
                        self.run_fixture_test(sn, tc)
                else:
                    def test_method(self):
                        self.run_fixture_test(sn, tc)
                return test_method

            # Add the test method to the class
            setattr(TestRuleFixtures, test_name, make_test(suite_name, test_case, unsupported))


# Generate test methods when module loads
if FIXTURES_PATH.exists():
    generate_test_methods()


class TestMockContext(unittest.TestCase):
    """Tests for the MockContext class itself."""

    def test_inventory_operations(self):
        """Test inventory hasItem and countItem."""
        ctx = MockContext(inventory={'Sword': 1, 'Key': 5})

        self.assertTrue(ctx.hasItem('Sword'))
        self.assertFalse(ctx.hasItem('Shield'))
        self.assertEqual(ctx.countItem('Key'), 5)
        self.assertEqual(ctx.countItem('Shield'), 0)

    def test_group_operations(self):
        """Test group hasGroup and countGroup."""
        ctx = MockContext(groups={'swords': 3, 'keys': 7})

        self.assertTrue(ctx.hasGroup('swords'))
        self.assertTrue(ctx.hasGroup('swords', 3))
        self.assertFalse(ctx.hasGroup('swords', 4))
        self.assertEqual(ctx.countGroup('keys'), 7)

    def test_settings(self):
        """Test settings lookup."""
        ctx = MockContext(settings={'difficulty': 'hard', 'hearts': 3})

        self.assertEqual(ctx.getSetting('difficulty'), 'hard')
        self.assertEqual(ctx.getSetting('hearts'), 3)
        self.assertIsNone(ctx.getSetting('unknown'))

    def test_player_id(self):
        """Test player ID."""
        ctx1 = MockContext()
        ctx2 = MockContext(player_id=2)

        self.assertEqual(ctx1.getPlayerId(), 1)
        self.assertEqual(ctx2.getPlayerId(), 2)


if __name__ == '__main__':
    unittest.main()
