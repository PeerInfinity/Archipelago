"""Handles preparation and formatting of rule data for export."""

import logging
import collections
import json
import os
import asyncio
from automate_frontend_tests import run_frontend_tests
from typing import Any, Dict, List, Optional

from .analyzer import analyze_rule
from .games import get_game_helpers

logger = logging.getLogger(__name__)

def export_test_data(multiworld, access_pool, output_dir, filename_base="test_output"):
    os.makedirs(output_dir, exist_ok=True)

    # Export the rules data
    from worlds.generic.RuleParser import export_game_rules
    export_game_rules(multiworld, output_dir, filename_base)
    
    # Convert the test cases to the format needed for JSON
    test_cases = []
    for location, access, *item_pool in access_pool:
        items = item_pool[0]
        all_except = item_pool[1] if len(item_pool) > 1 else None
        if all_except is not None:
            test_cases.append([location, access, items, all_except])
        else:
            test_cases.append([location, access, items])
    
    # Write to JSON file
    test_cases_data = {"location_tests": test_cases}
    test_cases_path = os.path.join(output_dir, "test_cases.json")
    with open(test_cases_path, 'w') as f:
        json.dump(test_cases_data, f, indent=2)
    
    asyncio.run(run_frontend_tests())
    print("Automated frontend tests finished.")

    return True
    
def prepare_export_data(multiworld) -> Dict[str, Any]:
    """
    Prepares rule and location data for export to frontend.
    """
    locations_export = {}
    items_export = {}
    item_groups_export = {}
    progression_mapping_export = {}
    
    for player in multiworld.player_ids:
        locations_export[str(player)] = _process_locations(
            multiworld, player
        )
        
        items_export[str(player)] = _process_items(
            multiworld, player
        )
        
        item_groups_export[str(player)] = _process_item_groups(
            multiworld, player
        )
        
        # Export progression mapping for this player
        progression_mapping_export[str(player)] = _process_progression_mapping(
            multiworld, player
        )

    return {
        'locations': locations_export,
        'items': items_export,
        'item_groups': item_groups_export,
        'progression_mapping': progression_mapping_export,
        'version': 2,
        'export_config': {
            'access_rules': True,
            'item_rules': True,
            'always_allow': True,
            'collect_rules': True,
            'items': True,
            'location_items': True
        }
    }

def _process_progression_mapping(multiworld, player) -> Dict[str, Any]:
    """Extract progression mapping data from the game."""
    from worlds.alttp.Items import progression_mapping
    
    # Convert the mapping to a more frontend-friendly format
    mapping_data = {}
    for target_item, (base_item, level) in progression_mapping.items():
        if base_item not in mapping_data:
            mapping_data[base_item] = {
                'items': [],
                'base_item': base_item
            }
        mapping_data[base_item]['items'].append({
            'name': target_item,
            'level': level
        })
    
    # Sort items by level for each progression type
    for prog_type in mapping_data.values():
        prog_type['items'].sort(key=lambda x: x['level'])
    
    return mapping_data

def _process_locations(multiworld, player) -> Dict[str, Any]:
    game = multiworld.game[player]
    helper_expander = get_game_helpers(game)
    result = {}
    
    # Create an empty state to test for trivially satisfied rules
    empty_state = multiworld.state.__class__(multiworld)
    
    for location in multiworld.get_locations(player):
        print(f"\nProcessing location: {location.name}")
        
        location_data = {
            'name': location.name,
            'region': location.parent_region.name if location.parent_region else None
        }
                
        # Add item information if it exists
        if location.item:
            location_data['item'] = {
                'name': location.item.name,
                'player': location.item.player
            }

        if location.parent_region:
            # Initialize path finding
            paths = []
            seen = {multiworld.get_region('Menu', player)}
            start_region = multiworld.get_region('Menu', player)
            queue = collections.deque([(start_region, [])])
            
            # Find all paths to this location
            while queue:
                current_region, path = queue.popleft()
                
                for entrance in current_region.exits:
                    if entrance.connected_region == location.parent_region:
                        full_path = path + [entrance]
                        paths.append(full_path)
                        
                        print(f"\nFound path to {location.name} via entrances:")
                        for e in full_path:
                            has_rule = hasattr(e, 'access_rule')
                            rule_exists = has_rule and e.access_rule is not None
                            
                            print(f"  - {e.name}:")
                            print(f"    Has access_rule attribute: {has_rule}")
                            print(f"    Rule exists and not None: {rule_exists}")
                            if rule_exists:
                                print(f"    Rule: {e.access_rule}")
                                # Test if rule is satisfied with empty state
                                is_satisfied = e.access_rule(empty_state)
                                print(f"    Rule satisfied with no items: {is_satisfied}")
                            
                    elif entrance.connected_region not in seen:
                        queue.append((entrance.connected_region, path + [entrance]))
                        seen.add(entrance.connected_region)

            # Check each path for requirements
            has_free_path = False
            for path in paths:
                path_is_free = True
                
                for entrance in path:
                    has_rule = hasattr(entrance, 'access_rule')
                    rule_exists = has_rule and entrance.access_rule is not None
                    
                    if rule_exists:
                        # Check if rule is satisfied with empty state
                        if not entrance.access_rule(empty_state):
                            path_is_free = False
                            break
                
                if path_is_free:
                    has_free_path = True
                    print(f"\nFound free path via: {[e.name for e in path]}")
                    break

            print(f"\nhas_free_path determined to be: {has_free_path}")

            if not has_free_path:
                path_rules = []
                for path in paths:
                    path_conditions = []
                    
                    for entrance in path:
                        if hasattr(entrance, 'access_rule') and entrance.access_rule:
                            if not entrance.access_rule(empty_state):  # Only add rules that aren't trivially satisfied
                                rule = helper_expander.expand_rule(analyze_rule(entrance.access_rule))
                                if rule:
                                    path_conditions.append(rule)
                    
                    if path_conditions:
                        if len(path_conditions) == 1:
                            path_rules.append(path_conditions[0])
                        else:
                            path_rules.append({'type': 'and', 'conditions': path_conditions})

                if path_rules:
                    if len(path_rules) == 1:
                        location_data['path_rules'] = path_rules[0]
                    else:
                        location_data['path_rules'] = {'type': 'or', 'conditions': path_rules}

        # Process location's own access rules
        if hasattr(location, 'access_rule') and location.access_rule:
            rule = helper_expander.expand_rule(analyze_rule(location.access_rule))
            if rule:
                location_data['access_rule'] = rule

        result[location.name] = location_data
    
    return result

def _process_items(multiworld, player) -> Dict[str, Any]:
    """Process item data including groups and flags."""
    items_data = {}
    world = multiworld.worlds[player]
    
    if hasattr(world, 'item_name_groups'):
        item_groups = world.item_name_groups
        
        for item_id, item_name in getattr(world, 'item_id_to_name', {}).items():
            groups = [
                group_name for group_name, items in item_groups.items() 
                if item_name in items
            ]
            
            items_data[item_name] = {
                'name': item_name,
                'id': item_id,
                'groups': sorted(groups),
                'advancement': False,
                'priority': False,
                'useful': False,
                'trap': False
            }

        # Update flags based on placed items
        for location in multiworld.get_locations(player):
            if location.item and location.item.name in items_data:
                item_data = items_data[location.item.name]
                item_data['advancement'] = getattr(location.item, 'advancement', False)
                item_data['priority'] = getattr(location.item, 'priority', False)
                item_data['useful'] = getattr(location.item, 'useful', False)
                item_data['trap'] = getattr(location.item, 'trap', False)
                
    return items_data

def _process_item_groups(multiworld, player) -> List[str]:
    """Get sorted list of item group names."""
    world = multiworld.worlds[player]
    if hasattr(world, 'item_name_groups'):
        return sorted(world.item_name_groups.keys())
    return []