#!/usr/bin/env python3
"""
Simple script to update host.yaml settings for testing
"""
import yaml
import argparse
import os

# Settings that stay under general_options
GENERAL_OPTIONS_BOOLEAN_SETTINGS = [
]

# Settings that go under json_tools namespace
JSON_TOOLS_BOOLEAN_SETTINGS = [
    'skip_required_files',
    'save_rules_json',
    'save_tracker_pickle',
    'skip_preset_copy_if_rules_identical',
    'save_sphere_log',
    'verbose_sphere_log',
    'extend_sphere_log_to_all_locations',
    'log_fractional_sphere_details',
    'log_integer_sphere_details',
    'auto_collect_events',
    'filter_event_items',
    'update_frontend_presets',
    'clear_game_presets',
    'clear_all_presets',
    'resolve_options_to_constants',
    'use_tracking_mode_config',
]

# Combined list for CLI argument generation
BOOLEAN_SETTINGS = GENERAL_OPTIONS_BOOLEAN_SETTINGS + JSON_TOOLS_BOOLEAN_SETTINGS

STRING_SETTINGS = {
    'rules_json_format': ['rule_builder', 'ast', 'both'],  # list of valid choices
}

# Preset configurations
# Settings are split between general_options (skip_required_files) and json_tools (everything else)
PRESETS = {
    'normal': {
        'skip_required_files': False,
        'save_rules_json': False,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': False,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': False,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
    'minimal-spoilers': {
        'skip_required_files': True,
        'save_rules_json': True,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
    'full-spoilers': {
        'skip_required_files': True,
        'save_rules_json': True,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': True,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
    'ut-hybrid': {
        'skip_required_files': True,
        'save_rules_json': False,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': True,  # Config picks best tracking mode per game
    },
    'ut-worldgen': {
        'skip_required_files': True,
        'save_rules_json': True,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
    'ut-pickle': {
        'skip_required_files': True,
        'save_rules_json': False,
        'save_tracker_pickle': True,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
    'ut-original': {
        'skip_required_files': True,
        'save_rules_json': False,
        'save_tracker_pickle': False,
        'rules_json_format': 'rule_builder',
        'skip_preset_copy_if_rules_identical': False,
        'save_sphere_log': True,
        'verbose_sphere_log': False,
        'extend_sphere_log_to_all_locations': False,
        'log_fractional_sphere_details': True,
        'log_integer_sphere_details': False,
        'auto_collect_events': False,
        'filter_event_items': False,
        'update_frontend_presets': True,
        'clear_game_presets': False,
        'clear_all_presets': False,
        'resolve_options_to_constants': True,
        'use_tracking_mode_config': False,
    },
}


def update_host_yaml(settings=None):
    """Update specific settings in host.yaml.

    Routes settings to the correct namespace:
    - skip_required_files -> general_options
    - all other export settings -> json_tools
    """
    # Get the project root directory (parent of scripts directory)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up two levels: setup -> scripts -> project root
    project_root = os.path.dirname(os.path.dirname(script_dir))
    host_yaml_path = os.path.join(project_root, "host.yaml")

    if not os.path.exists(host_yaml_path):
        print(f"Error: {host_yaml_path} not found. Run 'python Launcher.py --update_settings' first from the project root.")
        return False

    # Read current settings
    with open(host_yaml_path, 'r') as f:
        data = yaml.safe_load(f)

    # Update settings if provided
    if settings:
        # Ensure sections exist
        if 'general_options' not in data:
            data['general_options'] = {}
        if 'json_tools' not in data:
            data['json_tools'] = {}

        for key, value in settings.items():
            if key in GENERAL_OPTIONS_BOOLEAN_SETTINGS:
                data['general_options'][key] = value
            else:
                data['json_tools'][key] = value
            print(f"Set {key} = {value}")

    # Write back to file
    with open(host_yaml_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)

    print(f"Updated {host_yaml_path}")
    return True


def create_parser():
    """Create the argument parser with all options"""
    parser = argparse.ArgumentParser(
        description='Update host.yaml settings for testing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  %(prog)s normal                          # Apply normal preset
  %(prog)s minimal-spoilers                # Apply minimal spoiler testing settings
  %(prog)s full-spoilers                   # Apply full spoiler testing settings
  %(prog)s ut-hybrid                       # Apply UT hybrid mode (config picks best mode per game)
  %(prog)s ut-worldgen                     # Apply UT worldgen mode (rules.json export)
  %(prog)s ut-pickle                       # Apply UT pickle mode (pickle export)
  %(prog)s ut-original                     # Apply UT original mode (YAML-based tracking)
  %(prog)s --save-rules-json               # Enable save_rules_json only
  %(prog)s --no-save-rules-json            # Disable save_rules_json only
  %(prog)s minimal-spoilers --no-verbose-sphere-log  # Apply preset then override
'''
    )

    # Preset argument (optional positional)
    parser.add_argument(
        'preset',
        nargs='?',
        choices=list(PRESETS.keys()),
        help='Apply a preset configuration: normal, minimal-spoilers, or full-spoilers'
    )

    # Add boolean flag pairs for each boolean setting
    for setting in BOOLEAN_SETTINGS:
        flag_name = setting.replace('_', '-')
        group = parser.add_mutually_exclusive_group()
        group.add_argument(
            f'--{flag_name}',
            dest=setting,
            action='store_true',
            default=None,
            help=f'Enable {setting}'
        )
        group.add_argument(
            f'--no-{flag_name}',
            dest=setting,
            action='store_false',
            default=None,
            help=f'Disable {setting}'
        )

    # Add string settings
    for setting, choices in STRING_SETTINGS.items():
        flag_name = setting.replace('_', '-')
        parser.add_argument(
            f'--{flag_name}',
            dest=setting,
            choices=choices,
            default=None,
            help=f'Set {setting} (choices: {", ".join(choices)})'
        )

    return parser


def main():
    parser = create_parser()
    args = parser.parse_args()

    # Check if any arguments were provided
    has_preset = args.preset is not None
    has_individual_settings = any(
        getattr(args, setting) is not None
        for setting in BOOLEAN_SETTINGS + list(STRING_SETTINGS.keys())
    )

    if not has_preset and not has_individual_settings:
        parser.print_help()
        return 1

    # Start with preset settings if provided
    settings = {}
    if has_preset:
        settings = PRESETS[args.preset].copy()
        print(f"Applying '{args.preset}' preset...")

    # Override with any individual settings
    for setting in BOOLEAN_SETTINGS + list(STRING_SETTINGS.keys()):
        value = getattr(args, setting)
        if value is not None:
            settings[setting] = value

    # Apply the settings
    if not update_host_yaml(settings):
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
