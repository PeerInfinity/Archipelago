#!/usr/bin/env python3
"""
Simple script to update host.yaml settings for testing
"""
import yaml
import sys
import os

def update_host_yaml(settings=None):
    """Update specific settings in host.yaml"""
    # Get the project root directory (parent of scripts directory)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    host_yaml_path = os.path.join(project_root, "host.yaml")
    
    if not os.path.exists(host_yaml_path):
        print(f"Error: {host_yaml_path} not found. Run 'python Launcher.py --update_settings' first from the project root.")
        return False
    
    # Read current settings
    with open(host_yaml_path, 'r') as f:
        data = yaml.safe_load(f)
    
    # Update settings if provided
    if settings:
        for key, value in settings.items():
            data['general_options'][key] = value
            print(f"Set {key} = {value}")
    
    # Write back to file
    with open(host_yaml_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    
    print(f"Updated {host_yaml_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python update_host_settings.py testing    # Enable testing settings")
        print("  python update_host_settings.py normal     # Enable normal settings")
        sys.exit(1)
    
    if sys.argv[1] == "testing":
        testing_settings = {
            'skip_required_files': True,
            'save_rules_json': True,
            'save_sphere_log': True,
            'log_fractional_sphere_details': True,
            'log_integer_sphere_details': False,
            'update_frontend_presets': True
        }
        update_host_yaml(testing_settings)
    elif sys.argv[1] == "normal":
        normal_settings = {
            'skip_required_files': False,
            'save_rules_json': False,
            'save_sphere_log': False,
            'log_fractional_sphere_details': True,
            'log_integer_sphere_details': False,
            'update_frontend_presets': False
        }
        update_host_yaml(normal_settings)
    else:
        print("Invalid arguments. Use 'testing' or 'normal'")
        sys.exit(1)
