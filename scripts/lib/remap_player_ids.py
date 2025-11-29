#!/usr/bin/env python3
"""
Script to remap player IDs in a rules.json file and associated spheres_log.jsonl file.
This is useful for testing if the frontend works correctly with non-1 player IDs.
"""

import json
import sys
import os
from pathlib import Path


def _remap_rule_player_ids(rule: dict, target_player_id: int) -> None:
    """
    Recursively remap player IDs in access rules.
    Modifies the rule dict in place.

    Args:
        rule: The access rule dict to modify
        target_player_id: The player ID to remap to
    """
    if not isinstance(rule, dict):
        return

    # Handle list type - may contain [item_name, player_id] tuples
    if rule.get('type') == 'list' and 'value' in rule:
        value = rule['value']
        if isinstance(value, list):
            # Check if this is a 2-element list that might be [item_name, player_id] format
            if len(value) == 2:
                if isinstance(value[0], dict) and value[0].get('type') == 'constant':
                    if isinstance(value[1], dict) and value[1].get('type') == 'constant':
                        # Check if second value is player ID 1
                        if value[1].get('value') == 1:
                            value[1]['value'] = target_player_id
                    elif isinstance(value[1], int) and value[1] == 1:
                        # Direct integer value
                        rule['value'][1] = target_player_id

            # Also recursively process all list items (handles nested lists)
            for item in value:
                if isinstance(item, dict):
                    _remap_rule_player_ids(item, target_player_id)

    # Recursively process nested structures
    for key, val in rule.items():
        if isinstance(val, dict):
            _remap_rule_player_ids(val, target_player_id)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    _remap_rule_player_ids(item, target_player_id)


def remap_spheres_log(spheres_log_file: str, target_player_id: int = 2) -> bool:
    """
    Remap player IDs in a spheres_log.jsonl file.

    Args:
        spheres_log_file: Path to the spheres_log.jsonl file
        target_player_id: The player ID to remap to (default: 2)

    Returns:
        True if successful, False otherwise
    """
    try:
        if not os.path.exists(spheres_log_file):
            # File doesn't exist, that's okay
            return True

        # Read all lines from the JSONL file
        with open(spheres_log_file, 'r') as f:
            lines = f.readlines()

        # Process each line
        updated_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue

            data = json.loads(line)

            # Remap player_data if it exists
            if 'player_data' in data and '1' in data['player_data']:
                player_data = data['player_data']['1']
                del data['player_data']['1']
                data['player_data'][str(target_player_id)] = player_data

            updated_lines.append(json.dumps(data))

        # Write back to file
        with open(spheres_log_file, 'w') as f:
            for line in updated_lines:
                f.write(line + '\n')

        return True

    except Exception as e:
        print(f"Error remapping player IDs in spheres log {spheres_log_file}: {e}", file=sys.stderr)
        return False


def remap_player_ids(rules_file: str, target_player_id: int = 2) -> bool:
    """
    Remap all player IDs in a rules.json file from 1 to the target player ID.

    Args:
        rules_file: Path to the rules.json file
        target_player_id: The player ID to remap to (default: 2)

    Returns:
        True if successful, False otherwise
    """
    try:
        # Read the rules file
        with open(rules_file, 'r') as f:
            data = json.load(f)

        # Remap player_names
        if 'player_names' in data and '1' in data['player_names']:
            player_name = data['player_names']['1']
            del data['player_names']['1']
            data['player_names'][str(target_player_id)] = player_name

        # Remap world_classes (note: uses integer keys, not string keys)
        if 'world_classes' in data:
            if 1 in data['world_classes']:
                world_class = data['world_classes'][1]
                del data['world_classes'][1]
                data['world_classes'][target_player_id] = world_class
            elif '1' in data['world_classes']:
                world_class = data['world_classes']['1']
                del data['world_classes']['1']
                data['world_classes'][str(target_player_id)] = world_class

        # Remap game_info
        if 'game_info' in data:
            if '1' in data['game_info']:
                game_info = data['game_info']['1']
                del data['game_info']['1']
                data['game_info'][str(target_player_id)] = game_info
            elif 1 in data['game_info']:
                game_info = data['game_info'][1]
                del data['game_info'][1]
                data['game_info'][target_player_id] = game_info

        # Remap items
        if 'items' in data and '1' in data['items']:
            items = data['items']['1']
            del data['items']['1']
            data['items'][str(target_player_id)] = items

        # Remap regions
        if 'regions' in data and '1' in data['regions']:
            regions = data['regions']['1']
            del data['regions']['1']
            data['regions'][str(target_player_id)] = regions

        # Remap dungeons
        if 'dungeons' in data and '1' in data['dungeons']:
            dungeons = data['dungeons']['1']
            del data['dungeons']['1']
            data['dungeons'][str(target_player_id)] = dungeons

        # Remap settings
        if 'settings' in data and '1' in data['settings']:
            settings = data['settings']['1']
            del data['settings']['1']
            data['settings'][str(target_player_id)] = settings

        # Remap starting_items
        if 'starting_items' in data and '1' in data['starting_items']:
            starting_items = data['starting_items']['1']
            del data['starting_items']['1']
            data['starting_items'][str(target_player_id)] = starting_items

        # Remap itempool_counts
        if 'itempool_counts' in data and '1' in data['itempool_counts']:
            itempool_counts = data['itempool_counts']['1']
            del data['itempool_counts']['1']
            data['itempool_counts'][str(target_player_id)] = itempool_counts

        # Remap progression_mapping
        if 'progression_mapping' in data and '1' in data['progression_mapping']:
            progression_mapping = data['progression_mapping']['1']
            del data['progression_mapping']['1']
            data['progression_mapping'][str(target_player_id)] = progression_mapping

        # Remap item_groups
        if 'item_groups' in data and '1' in data['item_groups']:
            item_groups = data['item_groups']['1']
            del data['item_groups']['1']
            data['item_groups'][str(target_player_id)] = item_groups

        # Remap start_regions
        if 'start_regions' in data and '1' in data['start_regions']:
            start_regions = data['start_regions']['1']
            del data['start_regions']['1']
            data['start_regions'][str(target_player_id)] = start_regions

        # Remap player field in location items and access rules (for all players' regions)
        if 'regions' in data:
            for player_id_key in data['regions']:
                player_regions = data['regions'][player_id_key]
                if isinstance(player_regions, dict):
                    for region_name, region_data in player_regions.items():
                        if 'locations' in region_data and isinstance(region_data['locations'], list):
                            for location in region_data['locations']:
                                # Remap player field in location item
                                if 'item' in location and isinstance(location['item'], dict):
                                    if 'player' in location['item'] and location['item']['player'] == 1:
                                        location['item']['player'] = target_player_id

                                # Remap player IDs in access rules
                                if 'access_rule' in location:
                                    _remap_rule_player_ids(location['access_rule'], target_player_id)

                        # Also remap player IDs in exit access rules
                        if 'exits' in region_data:
                            exits = region_data['exits']
                            if isinstance(exits, dict):
                                # Exits as dictionary (exit_name -> exit_data)
                                for exit_name, exit_data in exits.items():
                                    if 'access_rule' in exit_data:
                                        _remap_rule_player_ids(exit_data['access_rule'], target_player_id)
                            elif isinstance(exits, list):
                                # Exits as list of exit objects
                                for exit_data in exits:
                                    if isinstance(exit_data, dict) and 'access_rule' in exit_data:
                                        _remap_rule_player_ids(exit_data['access_rule'], target_player_id)

        # Write the updated file
        with open(rules_file, 'w') as f:
            json.dump(data, f, indent=2)

        # Also remap the spheres_log.jsonl file if it exists
        rules_dir = os.path.dirname(rules_file)
        rules_basename = os.path.basename(rules_file)
        seed_id = rules_basename.replace('_rules.json', '')
        spheres_log_file = os.path.join(rules_dir, f'{seed_id}_spheres_log.jsonl')

        if not remap_spheres_log(spheres_log_file, target_player_id):
            print(f"Warning: Failed to remap spheres log file", file=sys.stderr)

        return True

    except Exception as e:
        print(f"Error remapping player IDs in {rules_file}: {e}", file=sys.stderr)
        return False


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python remap_player_ids.py <rules_file> [target_player_id]")
        sys.exit(1)

    rules_file = sys.argv[1]
    target_player_id = int(sys.argv[2]) if len(sys.argv) > 2 else 2

    success = remap_player_ids(rules_file, target_player_id)
    sys.exit(0 if success else 1)
