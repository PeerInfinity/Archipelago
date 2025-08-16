#!/usr/bin/env python3
"""
Simple script to update host.yaml settings for testing
"""
import yaml
import sys
import os

def update_host_yaml(skip_required_files=None, save_sphere_log=None):
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
    if skip_required_files is not None:
        data['general_options']['skip_required_files'] = skip_required_files
        print(f"Set skip_required_files = {skip_required_files}")
    
    if save_sphere_log is not None:
        data['general_options']['save_sphere_log'] = save_sphere_log
        print(f"Set save_sphere_log = {save_sphere_log}")
    
    # Write back to file
    with open(host_yaml_path, 'w') as f:
        yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    
    print(f"Updated {host_yaml_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python update_host_settings.py testing    # Enable testing settings")
        print("  python update_host_settings.py normal     # Disable testing settings")
        print("  python update_host_settings.py skip=true save_log=false  # Set specific values")
        sys.exit(1)
    
    if sys.argv[1] == "testing":
        update_host_yaml(skip_required_files=True, save_sphere_log=True)
    elif sys.argv[1] == "normal":
        update_host_yaml(skip_required_files=False, save_sphere_log=False)
    else:
        # Parse individual settings
        skip = None
        save_log = None
        for arg in sys.argv[1:]:
            if arg.startswith("skip="):
                skip = arg.split("=")[1].lower() == "true"
            elif arg.startswith("save_log="):
                save_log = arg.split("=")[1].lower() == "true"
        
        if skip is None and save_log is None:
            print("Invalid arguments. Use 'testing', 'normal', or 'skip=true/false save_log=true/false'")
            sys.exit(1)
        
        update_host_yaml(skip_required_files=skip, save_sphere_log=save_log)
