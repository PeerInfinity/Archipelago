#!/usr/bin/env python3
"""
Script to generate multiple template configurations for testing.

This script creates various template files by:
1. Creating single-setting variations (min, max, mid-range values)
2. Creating multi-setting combinations
3. Creating a fully randomized template

Currently supports: A Link to the Past
"""

import argparse
import copy
import os
import shutil
import yaml
from pathlib import Path
from typing import Dict, Any, List, Tuple


def load_template(template_path: str) -> Dict[str, Any]:
    """Load a YAML template file."""
    with open(template_path, 'r', encoding='utf-8-sig') as f:
        return yaml.safe_load(f)


def save_template(data: Dict[str, Any], output_path: str):
    """Save a YAML template file."""
    with open(output_path, 'w', encoding='utf-8') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False, allow_unicode=True)
    print(f"Created: {output_path}")


def get_default_value(setting_dict: Dict[str, int]) -> Tuple[str, int]:
    """Get the default (highest weight) value from a setting dictionary."""
    if not setting_dict:
        return None, 0
    max_key = max(setting_dict, key=setting_dict.get)
    return max_key, setting_dict[max_key]


def create_base_template(original: Dict[str, Any], game: str) -> Dict[str, Any]:
    """Create a base template with all settings at their default values."""
    # Use deep copy to avoid modifying the original
    base = copy.deepcopy(original)

    # The original template already has defaults set correctly
    # We don't need to modify anything - just return the deep copy
    return base


def get_numeric_range_settings(game_settings: Dict[str, Any]) -> List[Tuple[str, Dict, int, int]]:
    """
    Identify settings that have numeric ranges (min/max values).
    Returns list of (setting_name, setting_dict, min_val, max_val)
    """
    numeric_settings = []

    for setting_name, setting_value in game_settings.items():
        if not isinstance(setting_value, dict):
            continue

        # Try to extract min/max from the setting values themselves
        numeric_keys = [k for k in setting_value.keys()
                      if isinstance(k, int) or (isinstance(k, str) and k.lstrip('-').isdigit())]

        # Look for settings with random options AND numeric keys
        # These typically have min/max ranges in comments
        has_random = 'random' in setting_value or 'random-low' in setting_value or 'random-high' in setting_value

        if has_random and numeric_keys:
            # Parse all numeric keys
            int_keys = [int(k) if isinstance(k, str) else k for k in numeric_keys]
            min_val = min(int_keys)
            max_val = max(int_keys)
            if min_val < max_val:  # Only include if there's a real range
                numeric_settings.append((setting_name, setting_value, min_val, max_val))

    return numeric_settings


def get_categorical_settings(game_settings: Dict[str, Any]) -> List[Tuple[str, Dict, List[str]]]:
    """
    Identify settings that have categorical options (non-numeric choices).
    Returns list of (setting_name, setting_dict, option_list)
    """
    categorical_settings = []

    for setting_name, setting_value in game_settings.items():
        if not isinstance(setting_value, dict):
            continue

        # Exclude settings that are primarily numeric ranges
        numeric_keys = [k for k in setting_value.keys()
                       if isinstance(k, int) or (isinstance(k, str) and str(k).lstrip('-').isdigit())]

        # If most keys are non-numeric, it's categorical
        if len(setting_value) > 1 and len(numeric_keys) < len(setting_value) / 2:
            options = [k for k in setting_value.keys()
                      if k not in ['random', 'random-low', 'random-high']]
            if len(options) > 1:
                categorical_settings.append((setting_name, setting_value, options))

    return categorical_settings


def create_single_setting_templates(base: Dict[str, Any], game: str, output_dir: str) -> int:
    """
    Create templates with single setting variations.
    Returns count of templates created.
    """
    # Define cosmetic settings to skip (game-specific)
    cosmetic_settings = {
        'A Link to the Past': {
            'ow_palettes', 'uw_palettes', 'hud_palettes', 'sword_palettes',
            'shield_palettes', 'heartbeep', 'heartcolor', 'quickswap',
            'menuspeed', 'music', 'reduceflashing', 'triforcehud'
        }
    }

    # Get cosmetic settings for this game (empty set if game not in dict)
    skip_settings = cosmetic_settings.get(game, set())
    if skip_settings:
        print(f"Skipping {len(skip_settings)} cosmetic settings: {', '.join(sorted(skip_settings))}")

    game_settings = base.get(game, {})
    count = 0

    # Handle numeric range settings (min, max, mid)
    numeric_settings = get_numeric_range_settings(game_settings)
    print(f"\nFound {len(numeric_settings)} numeric range settings")

    for setting_name, setting_dict, min_val, max_val in numeric_settings:
        # Skip cosmetic settings
        if setting_name in skip_settings:
            continue
        # Create min value template
        template = create_base_template(base, game)
        template['description'] = f"{setting_name} = {min_val}"
        for key in template[game][setting_name]:
            template[game][setting_name][key] = 0
        template[game][setting_name][min_val] = 50

        filename = f"{sanitize_filename(setting_name)}_min_{min_val}.yaml"
        save_template(template, os.path.join(output_dir, filename))
        count += 1

        # Create max value template
        template = create_base_template(base, game)
        template['description'] = f"{setting_name} = {max_val}"
        for key in template[game][setting_name]:
            template[game][setting_name][key] = 0
        template[game][setting_name][max_val] = 50

        filename = f"{sanitize_filename(setting_name)}_max_{max_val}.yaml"
        save_template(template, os.path.join(output_dir, filename))
        count += 1

        # Create mid value template (if there's a meaningful middle)
        if max_val - min_val > 2:
            mid_val = (min_val + max_val) // 2
            template = create_base_template(base, game)
            template['description'] = f"{setting_name} = {mid_val}"
            for key in template[game][setting_name]:
                template[game][setting_name][key] = 0
            # Find closest actual value to mid_val
            numeric_keys = [int(k) if isinstance(k, str) else k for k in setting_dict.keys()
                           if isinstance(k, int) or (isinstance(k, str) and str(k).lstrip('-').isdigit())]
            closest = min(numeric_keys, key=lambda x: abs(x - mid_val))
            template[game][setting_name][closest] = 50

            filename = f"{sanitize_filename(setting_name)}_mid_{closest}.yaml"
            save_template(template, os.path.join(output_dir, filename))
            count += 1

    # Handle categorical settings (each option)
    categorical_settings = get_categorical_settings(game_settings)
    print(f"Found {len(categorical_settings)} categorical settings")

    for setting_name, setting_dict, options in categorical_settings:
        # Skip cosmetic settings
        if setting_name in skip_settings:
            continue
        for option in options:
            template = create_base_template(base, game)
            template['description'] = f"{setting_name} = {option}"

            # Set all options to 0, then the chosen one to 50
            for key in template[game][setting_name]:
                template[game][setting_name][key] = 0
            template[game][setting_name][option] = 50

            filename = f"{sanitize_filename(setting_name)}_{sanitize_filename(option)}.yaml"
            save_template(template, os.path.join(output_dir, filename))
            count += 1

    return count


def sanitize_filename(name: str) -> str:
    """Convert a setting name to a safe filename component."""
    # Replace spaces and special chars with underscores
    safe = name.replace(' ', '_').replace('/', '_').replace('\\', '_')
    safe = safe.replace("'", '').replace('"', '')
    safe = ''.join(c for c in safe if c.isalnum() or c in '_-')
    return safe.lower()


def create_multi_setting_templates(base: Dict[str, Any], game: str, output_dir: str, count: int) -> int:
    """
    Create templates with multiple settings changed.
    Creates approximately 'count' templates with various combinations.
    Returns count of templates created.
    """
    game_settings = base.get(game, {})
    templates_created = 0

    # Get all settings that can be varied
    numeric_settings = get_numeric_range_settings(game_settings)
    categorical_settings = get_categorical_settings(game_settings)

    # Define some interesting multi-setting combinations
    combinations = [
        {
            'name': 'hard_mode',
            'description': 'Hard mode combination',
            'settings': {
                'item_pool': 'hard',
                'item_functionality': 'hard',
                'enemy_health': 'hard',
                'enemy_damage': 'shuffled',
            }
        },
        {
            'name': 'expert_mode',
            'description': 'Expert mode combination',
            'settings': {
                'item_pool': 'expert',
                'item_functionality': 'expert',
                'enemy_health': 'expert',
                'enemy_damage': 'chaos',
            }
        },
        {
            'name': 'entrance_shuffle_full',
            'description': 'Full entrance shuffle with hints',
            'settings': {
                'entrance_shuffle': 'full',
                'hints': 'full',
                'dungeon_counters': 'on',
            }
        },
        {
            'name': 'key_shuffle_extreme',
            'description': 'All keys shuffled to any world',
            'settings': {
                'big_key_shuffle': 'any_world',
                'small_key_shuffle': 'any_world',
                'compass_shuffle': 'any_world',
                'map_shuffle': 'any_world',
            }
        },
        {
            'name': 'triforce_hunt_easy',
            'description': 'Easy triforce hunt',
            'settings': {
                'goal': 'triforce_hunt',
                'triforce_pieces_required': 10,
                'triforce_pieces_available': 50,
                'hints': 'full',
            }
        },
        {
            'name': 'open_inverted',
            'description': 'Open mode with inverted world',
            'settings': {
                'mode': 'inverted',
                'entrance_shuffle': 'dungeons_crossed',
                'hints': 'on',
            }
        },
        {
            'name': 'retro_mode',
            'description': 'Retro Zelda-1 style',
            'settings': {
                'retro_bow': True,
                'retro_caves': True,
                'item_pool': 'hard',
            }
        },
        {
            'name': 'swordless_challenge',
            'description': 'Swordless with item shuffle',
            'settings': {
                'swordless': True,
                'item_functionality': 'hard',
                'progressive': 'off',
            }
        },
        {
            'name': 'boss_chaos',
            'description': 'Chaos boss and enemy shuffle',
            'settings': {
                'boss_shuffle': 'chaos',
                'enemy_shuffle': True,
                'enemy_health': 'hard',
            }
        },
        {
            'name': 'shop_randomizer',
            'description': 'Randomized shops and prices',
            'settings': {
                'shop_item_slots': 15,
                'randomize_shop_inventories': 'randomize_each',
                'randomize_shop_prices': True,
                'randomize_cost_types': True,
                'shop_price_modifier': 200,
            }
        },
        {
            'name': 'minimal_access',
            'description': 'Minimal accessibility with hard settings',
            'settings': {
                'accessibility': 'minimal',
                'item_pool': 'hard',
                'dark_room_logic': 'none',
            }
        },
        {
            'name': 'glitched_logic',
            'description': 'Overworld glitches required',
            'settings': {
                'glitches_required': 'overworld_glitches',
                'glitch_boots': True,
                'entrance_shuffle': 'restricted',
            }
        },
        {
            'name': 'timer_challenge',
            'description': 'Timed OHKO mode',
            'settings': {
                'timer': 'timed_ohko',
                'countdown_start_time': 20,
                'item_pool': 'easy',
            }
        },
        {
            'name': 'beemizer',
            'description': 'Beemizer trap mode',
            'settings': {
                'beemizer_total_chance': 80,
                'beemizer_trap_chance': 75,
            }
        },
        {
            'name': 'shuffled_everything',
            'description': 'Shuffle all the things',
            'settings': {
                'entrance_shuffle': 'crossed',
                'pot_shuffle': True,
                'enemy_shuffle': True,
                'bush_shuffle': True,
                'tile_shuffle': True,
                'shuffle_prizes': 'both',
                'shuffle_capacity_upgrades': 'on',
            }
        },
    ]

    for combo in combinations:
        template = create_base_template(base, game)
        template['description'] = combo['description']

        # Apply the settings
        for setting_name, value in combo['settings'].items():
            if setting_name in template[game]:
                setting_dict = template[game][setting_name]

                # Handle boolean settings
                if isinstance(value, bool):
                    value_str = 'true' if value else 'false'
                    if value_str in setting_dict:
                        for key in setting_dict:
                            setting_dict[key] = 0
                        setting_dict[value_str] = 50
                # Handle numeric or string settings
                elif isinstance(setting_dict, dict):
                    for key in setting_dict:
                        setting_dict[key] = 0
                    if value in setting_dict:
                        setting_dict[value] = 50
                    elif isinstance(value, int) and value in setting_dict:
                        setting_dict[value] = 50

        filename = f"{combo['name']}.yaml"
        save_template(template, os.path.join(output_dir, filename))
        templates_created += 1

    return templates_created


def create_fully_randomized_template(base: Dict[str, Any], game: str, output_dir: str):
    """
    Create a template with all settings that support randomization set to random.
    For settings with multiple random options, distribute weight evenly.
    """
    template = create_base_template(base, game)
    template['description'] = 'Fully randomized - all settings use random options'

    game_settings = template[game]

    for setting_name, setting_value in game_settings.items():
        if not isinstance(setting_value, dict):
            continue

        # Check if this setting has random options
        random_options = [k for k in setting_value.keys()
                         if 'random' in str(k).lower()]

        if random_options:
            # Set all to 0
            for key in setting_value:
                setting_value[key] = 0

            # Distribute weight evenly among random options
            weight_per_option = 50 // len(random_options) if random_options else 0
            remaining = 50 - (weight_per_option * len(random_options))

            for i, option in enumerate(random_options):
                # Give the remainder to the first option
                setting_value[option] = weight_per_option + (remaining if i == 0 else 0)

    filename = "fully_randomized.yaml"
    save_template(template, os.path.join(output_dir, filename))
    print(f"\nCreated fully randomized template")


def main():
    parser = argparse.ArgumentParser(
        description='Generate multiple template configurations for testing'
    )
    parser.add_argument(
        '--game',
        type=str,
        default='A Link to the Past',
        help='Game name to generate templates for (default: A Link to the Past)'
    )
    parser.add_argument(
        '--template',
        type=str,
        help='Path to the base template file (default: Players/Templates/<game>.yaml)'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        help='Output directory for generated templates (default: Players/presets/multitemplate/<game_abbrev>)'
    )

    args = parser.parse_args()

    # Determine paths
    # Script is at scripts/build/generate-multitemplate-configs.py, go up 2 levels to reach project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent

    # Default template path
    if args.template:
        template_path = args.template
    else:
        template_path = project_root / 'Players' / 'Templates' / f'{args.game}.yaml'

    if not os.path.exists(template_path):
        print(f"Error: Template file not found: {template_path}")
        return 1

    # Default output directory
    if args.output_dir:
        output_dir = args.output_dir
    else:
        game_abbrev = 'alttp' if args.game == 'A Link to the Past' else sanitize_filename(args.game)
        output_dir = project_root / 'Players' / 'presets' / 'multitemplate' / game_abbrev

    print(f"Generating multi-template configurations for: {args.game}")
    print(f"Base template: {template_path}")
    print(f"Output directory: {output_dir}")

    # Create output directory (clear if it exists)
    if os.path.exists(output_dir):
        print(f"\nClearing existing output directory...")
        shutil.rmtree(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output directory ready: {output_dir}")

    # Load the original template
    original = load_template(template_path)

    # Create base template with defaults
    base = create_base_template(original, args.game)

    # Generate single-setting templates
    print("\n=== Generating Single-Setting Templates ===")
    single_count = create_single_setting_templates(base, args.game, output_dir)
    print(f"Created {single_count} single-setting templates")

    # Generate multi-setting templates (approximately same count as single)
    print("\n=== Generating Multi-Setting Templates ===")
    multi_count = create_multi_setting_templates(base, args.game, output_dir, single_count)
    print(f"Created {multi_count} multi-setting templates")

    # Generate fully randomized template
    print("\n=== Generating Fully Randomized Template ===")
    create_fully_randomized_template(base, args.game, output_dir)

    total = single_count + multi_count + 1
    print(f"\n=== Complete ===")
    print(f"Total templates created: {total}")
    print(f"Output directory: {output_dir}")

    return 0


if __name__ == '__main__':
    exit(main())
