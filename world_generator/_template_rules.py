"""Rules template generation for Archipelago world files.

Contains the rules generator and rule analysis utilities.
"""

import re
from typing import Dict, List, Optional, Set

from rule_builder import BOOLEAN_RULE_TYPES
from .constants import BUILTIN_SETTINGS
from .extractors import ExtractedData, HelperData
from .rule_codegen import RuleCodeGenerator, HelperCodeGenerator, is_trivial_rule, ANALYZER_RUNTIME_TYPES
from ._sanitization import sanitize_for_class_name, sanitize_for_identifier


def _extract_region_dependencies(rule: dict, helpers: Dict[str, 'HelperData'] = None, visited_helpers: Set[str] = None) -> List[str]:
    """Extract region names from can_reach calls in a rule.

    This finds all state.can_reach("RegionName", "Region") calls
    that indicate the rule depends on a region's accessibility.
    Also resolves helper function calls to find can_reach calls in helper bodies.

    Returns dependencies in the order they are encountered (preserves input order).

    Args:
        rule: The rule dict to analyze
        helpers: Dictionary of helper name to HelperData for resolving helper calls
        visited_helpers: Set of already visited helper names to prevent infinite recursion
    """
    dependencies = []

    if not isinstance(rule, dict):
        return dependencies

    if helpers is None:
        helpers = {}
    if visited_helpers is None:
        visited_helpers = set()

    rule_type = rule.get('type', '')

    # Check for state_method can_reach calls
    if rule_type == 'state_method' and rule.get('method') == 'can_reach':
        args = rule.get('args', [])
        if len(args) >= 2:
            # args[0] should be the target name, args[1] should be the type
            target_arg = args[0]
            type_arg = args[1]

            # Get the target name value
            target_name = None
            if isinstance(target_arg, dict) and target_arg.get('type') == 'constant':
                target_name = target_arg.get('value')

            # Get the target type
            target_type = None
            if isinstance(type_arg, dict) and type_arg.get('type') == 'constant':
                target_type = type_arg.get('value')

            # Only include Region dependencies (not Location or Entrance)
            if target_name and target_type == 'Region':
                if target_name not in dependencies:
                    dependencies.append(target_name)

    # Check for state_method can_reach_region calls (takes 1 arg: region name)
    if rule_type == 'state_method' and rule.get('method') == 'can_reach_region':
        args = rule.get('args', [])
        if len(args) >= 1:
            region_arg = args[0]
            region_name = None
            if isinstance(region_arg, dict) and region_arg.get('type') == 'constant':
                region_name = region_arg.get('value')
            if region_name and region_name not in dependencies:
                dependencies.append(region_name)

    # Check for can_reach type (used in helper bodies)
    if rule_type == 'can_reach':
        region = rule.get('region')
        if isinstance(region, dict) and region.get('type') == 'constant':
            region_name = region.get('value')
            if region_name and region_name not in dependencies:
                dependencies.append(region_name)
        elif isinstance(region, str):
            if region not in dependencies:
                dependencies.append(region)

    # Check for Rule Builder CanReachRegion rules
    # Rule Builder format: {"rule": "CanReachRegion", "args": {"region_name": "RegionName"}}
    rb_rule = rule.get('rule', '')
    if rb_rule == 'CanReachRegion':
        args = rule.get('args', {})
        region_name = args.get('region_name', '')
        if isinstance(region_name, str) and region_name and region_name not in dependencies:
            dependencies.append(region_name)

    # Check for helper calls and resolve them
    # Handle both formats:
    # 1. type='helper' with name='helper_name' (standard format)
    # 2. _original_ast_type='helper' with rule='helper_name' (AST export format)
    helper_name = None
    if rule_type == 'helper':
        helper_name = rule.get('name', '')
    elif rule.get('_original_ast_type', '').endswith('helper'):
        # AST export format: helper name is in 'rule' field
        helper_name = rule.get('rule', '')

    if helper_name and helper_name not in visited_helpers and helper_name in helpers:
        visited_helpers.add(helper_name)
        helper_data = helpers[helper_name]
        if helper_data.body:
            for dep in _extract_region_dependencies(helper_data.body, helpers, visited_helpers):
                if dep not in dependencies:
                    dependencies.append(dep)

    # Recurse into nested rules
    for key in ('conditions', 'children', 'if_true', 'if_false', 'test', 'args', 'left', 'right', 'statements'):
        value = rule.get(key)
        if isinstance(value, list):
            for item in value:
                for dep in _extract_region_dependencies(item, helpers, visited_helpers):
                    if dep not in dependencies:
                        dependencies.append(dep)
        elif isinstance(value, dict):
            for dep in _extract_region_dependencies(value, helpers, visited_helpers):
                if dep not in dependencies:
                    dependencies.append(dep)

    # Check helper body field for inline helpers
    body = rule.get('body')
    if body:
        for dep in _extract_region_dependencies(body, helpers, visited_helpers):
            if dep not in dependencies:
                dependencies.append(dep)

    return dependencies


def _rule_needs_lambda(rule: dict) -> bool:
    """
    Check if a rule needs to use lambda-based generation instead of Rule Builder.

    Returns True if the rule contains:
    - Block statements (loops, assignments, etc.) that aren't AST_block
    - Dynamic references (setting_value, placement_lookup, etc.) that need
      runtime access to world options/attributes

    Note: Most rule types including helpers, not, compare, and conditional
    can now be handled by RuleCodeGenerator with the new Rule Builder classes.
    AST_block rules can also be handled by RuleCodeGenerator.
    """
    if not isinstance(rule, dict):
        return False

    # AST_block rules can be handled by RuleCodeGenerator
    # even if they contain nested block types
    rule_name = rule.get('rule', '')
    if rule_name == 'AST_block':
        return False

    rule_type = rule.get('type', '')

    # Block statements require lambda (for loops, assignments, etc.)
    if rule_type == 'block':
        return True

    # Dynamic references need lambda to generate proper runtime access patterns
    # These are evaluated to constants in Rule Builder but should be preserved
    # as dynamic option/attribute access for proper re-export
    # - setting_value: legacy setting access
    # - placement_lookup: location_item_name() calls require state
    # - option_value: world options require state.multiworld access
    if rule_type in ('setting_value', 'placement_lookup', 'option_value'):
        return True

    # AST format dynamic references also need lambda
    # WorldAttribute and OptionValue need lambda because they generate
    # state.multiworld.worlds[player].attr/options.xxx which requires 'state'
    # to be defined (only available in lambda context).
    # AST_capability needs lambda because it calls helper functions with runtime arguments
    # from options/world attributes.
    if rule_name in ('AST_setting_value', 'AST_placement_lookup', 'AST_placement_search', 'WorldAttribute', 'OptionValue', 'AST_capability'):
        return True

    # AST_function_call may need lambda, but not if the function is a Rule Builder rule
    # (e.g., And, Or, Has, CanReachEntrance) - those can be converted directly.
    # This happens when bunny rules are analyzed and path_to_access_rule returns
    # nested Rule Builder expressions wrapped in AST_function_call.
    if rule_name == 'AST_function_call':
        args = rule.get('args', {})
        function = args.get('function', {})
        if isinstance(function, dict):
            if function.get('rule'):
                func_rule = function.get('rule')
                if func_rule in BOOLEAN_RULE_TYPES:
                    # Function is a Rule Builder rule - check if IT needs lambda
                    # (it might have nested dynamic references)
                    return _rule_needs_lambda(function)
            # state_method and item_check types produce complete expressions
            # (e.g., has_all, has_any, has, can_reach) that can be converted
            # to Rule Builder format without needing a lambda wrapper
            func_type = function.get('type', '')
            if func_type in ANALYZER_RUNTIME_TYPES - {'helper'}:
                return False
        # Unknown function call structure - needs lambda
        return True

    # HasFromList/HasFromListUnique with dynamic count (dict instead of int) need lambda
    # because the Rule Builder class expects count to be a static int
    if rule_name in ('HasFromList', 'HasFromListUnique'):
        args = rule.get('args', {})
        count = args.get('count', 1)
        if isinstance(count, dict):
            return True

    # Recursively check all dict and list values
    for value in rule.values():
        if isinstance(value, dict):
            if _rule_needs_lambda(value):
                return True
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, dict) and _rule_needs_lambda(item):
                    return True

    return False


def generate_rules_py(data: ExtractedData) -> str:
    """Generate Rules.py file content.

    Uses a hybrid approach:
    - Rule Builder for most rules (item checks, and/or, helpers, etc.)
    - Lambda expressions only for complex rules with blocks (loops, assignments)
    """
    game_name = data.metadata.game_name

    # Build helper bodies dict for explain support
    helper_bodies = {
        name: helper_data.body
        for name, helper_data in data.helpers.items()
        if helper_data.body
    }

    # Build helper params dict for proper argument binding
    helper_params = {
        name: helper_data.params
        for name, helper_data in data.helpers.items()
        if helper_data.params
    }

    # Build helper defaults dict for default parameter values
    helper_defaults = {
        name: helper_data.defaults
        for name, helper_data in data.helpers.items()
        if helper_data.defaults
    }

    rule_builder_generator = RuleCodeGenerator(game_name, data.metadata.resolved_values, data.metadata.option_definitions)
    rule_builder_generator.set_helpers(set(data.helpers.keys()), helper_bodies, helper_params, helper_defaults, data.original_placements)

    # Build set of obtainable items (in pool, canonical placements, or starting inventory)
    # Used to detect unsatisfiable Has rules referencing virtual/computed items
    obtainable_items: set = set(data.itempool_counts.keys())
    for loc_name, loc_data in data.locations.items():
        if loc_data.original_item:
            obtainable_items.add(loc_data.original_item)
    if data.starting_items:
        obtainable_items.update(data.starting_items.keys())
    # Include resolved progressive item names (e.g., 'logistic-science-pack' from
    # 'progressive-science-pack') - these are obtainable through the progressive mechanism
    if data.progression_mapping:
        for components in data.progression_mapping.values():
            obtainable_items.update(components)
    # Include all items that have definitions in the items table. These are real items
    # that may not be in the pool due to option settings (e.g., "Key for Front Door"
    # when front_door_usable=false in Shivers). Their Has() rules should be preserved
    # as-is (evaluating to false = permanently locked), not converted to True_().
    # The lossy True_() fallback should only apply to items not defined in the items
    # table at all (truly virtual/computed items with no item definition).
    obtainable_items.update(data.items.keys())
    rule_builder_generator.set_obtainable_items(obtainable_items)

    # Build entrance-to-parent-region mapping for resolving Attribute rules
    # like entrance.parent_region (used by ALttP glitch rules)
    entrance_regions = {}
    for exit_name, exit_data in data.exits.items():
        # Normalize entrance name: lowercase, no spaces (matches how exporter creates variable names)
        normalized_name = exit_name.lower().replace(' ', '')
        entrance_regions[normalized_name] = exit_data.source_region
    rule_builder_generator.set_entrance_regions(entrance_regions)

    # Build entrance-to-connected-region mapping for resolving dict_lambda_lookup patterns
    # like rule_map.get(world.get_entrance('X').connected_region.name, default)
    # With vanilla entrance shuffle, we can resolve the key to return just the matching case
    entrance_connections = {}
    for exit_name, exit_data in data.exits.items():
        if exit_data.target_region:
            entrance_connections[exit_name] = exit_data.target_region
    rule_builder_generator.set_entrance_connections(entrance_connections)

    helper_generator = HelperCodeGenerator(
        game_name,
        resolved_values=data.metadata.resolved_values,
        option_definitions=data.metadata.option_definitions
    )
    helper_generator.set_known_helpers(set(data.helpers.keys()))
    helper_generator.set_placements(data.original_placements)

    # Build helper data dict with param_mappings for AST_capability resolution
    helper_data_dict = {}
    for helper_name, helper_obj in data.helpers.items():
        helper_data_dict[helper_name] = {
            'params': helper_obj.params,
            'param_mappings': helper_obj.param_mappings,
            'defaults': helper_obj.defaults,
        }
    helper_generator.set_helper_data(helper_data_dict)

    # Check if any rules need helpers or lambda
    has_helpers = bool(data.helpers)
    needs_lambda = False

    for exit_data in data.exits.values():
        if exit_data.access_rule and _rule_needs_lambda(exit_data.access_rule):
            needs_lambda = True
            break

    if not needs_lambda:
        for loc_data in data.locations.values():
            if loc_data.access_rule and _rule_needs_lambda(loc_data.access_rule):
                needs_lambda = True
                break

    # Generate helper functions
    helper_functions = []
    if has_helpers:
        # Pre-scan all helper bodies for NamedTuple types
        # This is needed so constructor calls can be resolved before code generation
        for helper_data in data.helpers.values():
            if helper_data.body:
                helper_generator.prescan_for_namedtuples(helper_data.body)

        for helper_name, helper_data in data.helpers.items():
            func_code = helper_generator.generate_helper_function(
                helper_name,
                helper_data.params,
                helper_data.body,
                helper_data.defaults
            )
            helper_functions.append(func_code)

    # Collect all rules
    entrance_rules = []
    location_rules = []
    indirect_conditions = []  # (entrance_name, region_name) pairs

    # Process entrance rules (preserve original order)
    for exit_name, exit_data in data.exits.items():
        if not is_trivial_rule(exit_data.access_rule):
            exit_escaped = exit_name.replace('\\', '\\\\').replace('"', '\\"')

            # Extract region dependencies for indirect condition registration
            # Pass helpers dict so helper calls can be resolved to find can_reach calls
            region_deps = _extract_region_dependencies(exit_data.access_rule, data.helpers)
            for region_name in region_deps:
                indirect_conditions.append((exit_name, region_name))

            if _rule_needs_lambda(exit_data.access_rule):
                # Use lambda with helper code generator
                # Set context so 'entrance' variable references can be substituted
                helper_generator.set_context(entrance=exit_name)
                rule_expr = helper_generator._generate_expression(exit_data.access_rule)
                helper_generator.set_context()  # Clear context
                entrance_rules.append(
                    f'    multiworld.get_entrance("{exit_escaped}", player).access_rule = \\\n'
                    f'        lambda state: {rule_expr}'
                )
            else:
                # Use Rule Builder
                # Set context so 'entrance' variable references can be substituted
                rule_builder_generator.set_context(entrance=exit_name)
                rule_code = rule_builder_generator.generate(exit_data.access_rule)
                rule_builder_generator.set_context()  # Clear context
                entrance_rules.append(
                    f'    world.set_rule(\n'
                    f'        multiworld.get_entrance("{exit_escaped}", player),\n'
                    f'        {rule_code}\n'
                    f'    )'
                )

    # Process location rules (preserve original order)
    for loc_name, loc_data in data.locations.items():
        if not is_trivial_rule(loc_data.access_rule):
            loc_escaped = loc_name.replace('\\', '\\\\').replace('"', '\\"')

            if _rule_needs_lambda(loc_data.access_rule):
                # Use lambda with helper code generator
                # Set context so 'location' variable references can be substituted
                helper_generator.set_context(location=loc_name)
                rule_expr = helper_generator._generate_expression(loc_data.access_rule)
                helper_generator.set_context()  # Clear context
                location_rules.append(
                    f'    multiworld.get_location("{loc_escaped}", player).access_rule = \\\n'
                    f'        lambda state: {rule_expr}'
                )
            else:
                # Use Rule Builder
                # Set context so 'location' variable references can be substituted
                rule_builder_generator.set_context(location=loc_name)
                rule_code = rule_builder_generator.generate(loc_data.access_rule)
                rule_builder_generator.set_context()  # Clear context
                location_rules.append(
                    f'    world.set_rule(\n'
                    f'        multiworld.get_location("{loc_escaped}", player),\n'
                    f'        {rule_code}\n'
                    f'    )'
                )

    # Build imports
    rule_builder_imports = rule_builder_generator.get_imports()
    rule_builder_imports_str = ', '.join(rule_builder_imports)

    # Generate boss defeat rule functions if dungeons exist
    defeat_rule_functions = []
    defeat_func_names = []
    if data.dungeons:
        for dungeon_name, dungeon_data in data.dungeons.items():
            for boss_key, boss_data in dungeon_data.bosses.items():
                if boss_data.defeat_rule:
                    safe_dungeon = re.sub(r'[^a-zA-Z0-9]', '_', dungeon_name)
                    safe_key = 'default' if boss_key == 'None' else boss_key
                    func_name = f"_can_defeat_{safe_dungeon}_{safe_key}"
                    defeat_func_names.append(func_name)

                    try:
                        rule_expr = helper_generator._generate_expression(boss_data.defeat_rule)
                        defeat_rule_functions.append(f'''
def {func_name}(state: "CollectionState", player: int) -> bool:
    """Defeat rule for {boss_data.name} in {dungeon_name}."""
    return {rule_expr}
{func_name}._internal_function = True
''')
                    except Exception as e:
                        defeat_rule_functions.append(f'''
def {func_name}(state: "CollectionState", player: int) -> bool:
    """Defeat rule for {boss_data.name} in {dungeon_name} (fallback: {e})."""
    return True
{func_name}._internal_function = True
''')

    # Build helper section
    helpers_section = ''
    if helper_functions:
        # Generate NamedTuple class definitions if any were encountered
        namedtuple_classes = helper_generator.generate_namedtuple_classes()
        if namedtuple_classes:
            helpers_section = '\n\n# NamedTuple types for helper functions\n' + namedtuple_classes + '\n'
            helpers_section += '\n# Helper functions\n' + '\n\n\n'.join(helper_functions) + '\n'
        else:
            helpers_section = '\n\n# Helper functions\n' + '\n\n\n'.join(helper_functions) + '\n'

    # Add defeat rule functions after helpers
    if defeat_rule_functions:
        helpers_section += '\n\n# Boss defeat rule functions\n' + '\n'.join(defeat_rule_functions)

    # Build indirect condition registrations
    indirect_section = ''
    if indirect_conditions:
        indirect_lines = []
        for entrance_name, region_name in indirect_conditions:
            entrance_escaped = entrance_name.replace('\\', '\\\\').replace('"', '\\"')
            region_escaped = region_name.replace('\\', '\\\\').replace('"', '\\"')
            indirect_lines.append(
                f'    multiworld.register_indirect_condition(\n'
                f'        world.get_region("{region_escaped}"),\n'
                f'        multiworld.get_entrance("{entrance_escaped}", player)\n'
                f'    )'
            )
        indirect_section = '\n    # Register indirect conditions for proper sphere calculation\n' + '\n'.join(indirect_lines)

    # Build rule sections
    entrance_section = ''
    if entrance_rules:
        entrance_section = '\n    # Entrance rules\n' + '\n\n'.join(entrance_rules)

    location_section = ''
    if location_rules:
        location_section = '\n    # Location rules\n' + '\n\n'.join(location_rules)

    rules_content = entrance_section + indirect_section + location_section
    if not rules_content.strip():
        rules_content = '    pass  # No non-trivial rules'

    # Note: We intentionally do NOT add no_logic early return here.
    # The exported rules already represent the correct logic for the seed.
    # In particular, shop price rules (has_hearts, can_use_bombs, can_hold_arrows)
    # were exported because they should be enforced even in no_logic mode.
    # In the original ALttP world, shop price rules are added in create_shops()
    # before set_rules(), so they're not skipped by the no_logic early return.
    # By applying all exported rules, we correctly match the original behavior.

    # Add dungeon boss setup call if dungeons exist
    dungeon_setup_section = ''
    dungeon_setup_function = ''
    if defeat_func_names:
        # Add call to setup function at end of set_rules
        dungeon_setup_section = '''

    # Wire up boss defeat functions to dungeon objects
    _setup_dungeon_bosses(multiworld, player)'''

        # Generate the setup function
        func_lookups = []
        for func_name in defeat_func_names:
            func_lookups.append(f'        "{func_name}": {func_name},')
        func_lookup_content = '\n'.join(func_lookups)

        dungeon_setup_function = f'''


def _setup_dungeon_bosses(multiworld, player: int) -> None:
    """Wire up boss defeat functions to dungeon objects.

    This is called at the end of set_rules() to connect the defeat
    rule functions to the Boss objects created in Regions.py.
    """
    # Map function names to actual functions
    defeat_funcs = {{
{func_lookup_content}
    }}

    # Find all regions and wire up their dungeon bosses
    for region in multiworld.get_regions(player):
        if hasattr(region, 'dungeon') and region.dungeon is not None:
            dungeon = region.dungeon
            if hasattr(dungeon, 'bosses'):
                for boss in dungeon.bosses.values():
                    if hasattr(boss, '_defeat_func_name') and boss._defeat_func_name:
                        func = defeat_funcs.get(boss._defeat_func_name)
                        if func:
                            boss._defeat_func = func
'''

    # Build import section
    imports_section = ''
    if rule_builder_imports:
        imports_section = f'\nfrom rule_builder import {rule_builder_imports_str}\n'

    # Add CollectionState import if we have helpers, lambda rules, or dungeons
    collection_state_import = ''
    if has_helpers or needs_lambda or defeat_rule_functions:
        collection_state_import = 'from BaseClasses import CollectionState\n'

    # Add math import if needed for sqrt, floor, etc.
    math_import = ''
    if helper_generator.uses_math:
        math_import = 'import math\n'

    # Add logging import if needed for logging.debug, etc.
    logging_import = ''
    if helper_generator.uses_logging:
        logging_import = 'import logging\n'

    # Add placement function imports if placement_lookup/search is used
    placement_lookup_import = ''
    if helper_generator.uses_placement_lookup:
        placement_lookup_import = 'from worlds.generic.Rules import location_item_name, item_name_in_location_names\n'

    # Note: Helper definitions for frontend evaluation are no longer stored as AST
    # in the generated Rules.py. Instead, when the exporter runs on a worldgen world,
    # it analyzes the Python helper functions and converts them back to AST format.
    # This keeps the generated code clean and readable.

    typing_import_str = 'TYPE_CHECKING'

    return f'''"""
Access rules for {game_name}.

Auto-generated by world_generator.
"""

from typing import {typing_import_str}
{math_import}{logging_import}
{placement_lookup_import}{collection_state_import}{imports_section}
if TYPE_CHECKING:
    from BaseClasses import CollectionState
    from worlds.AutoWorld import World
{helpers_section}

def set_rules(world: "World") -> None:
    """Set access rules for all locations and entrances."""
    player = world.player
    multiworld = world.multiworld
{rules_content}{dungeon_setup_section}
{dungeon_setup_function}'''
