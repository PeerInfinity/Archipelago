#!/usr/bin/env python3

import os
import shutil
import subprocess
import sys
from pathlib import Path

def main():
    """Main function to generate presets from template YAML files"""
    # Define base paths
    base_dir = Path(__file__).parent
    players_dir = base_dir / "Players"
    temp_dir = players_dir / "temp"
    templates_dir = players_dir / "Templates"
    generate_script = base_dir / "Generate.py"

    print(f"Starting preset generation process...")
    
    # Ensure the Generate.py script exists
    if not generate_script.exists():
        print(f"Error: Generate.py not found at {generate_script}", file=sys.stderr)
        return 1

    # Create temp directory if it doesn't exist
    os.makedirs(temp_dir, exist_ok=True)
    print(f"Created temporary directory at {temp_dir}")

    # Move existing .yaml files to temp directory
    yaml_files = list(players_dir.glob("*.yaml")) + list(players_dir.glob("*.yml"))
    print(f"Found {len(yaml_files)} existing YAML files in Players directory")
    
    for yaml_file in yaml_files:
        # Skip if file is in a subdirectory (like Templates or temp)
        if yaml_file.parent == players_dir:
            target = temp_dir / yaml_file.name
            print(f"Moving {yaml_file.name} to temp directory")
            shutil.move(yaml_file, target)
    
    # Get list of templates
    template_files = list(templates_dir.glob("*.yaml")) + list(templates_dir.glob("*.yml"))
    
    if not template_files:
        print("No template files found in Templates directory.", file=sys.stderr)
        print("Restoring original files...")
        # Restore files and exit
        restore_files(temp_dir, players_dir)
        return 1
    
    print(f"Found {len(template_files)} template files to process")
    
    # Process each template
    success_count = 0
    for template_file in template_files:
        try:
            process_template(template_file, players_dir, generate_script)
            success_count += 1
        except Exception as e:
            print(f"Error processing template {template_file.name}: {e}", file=sys.stderr)
            print("Continuing with next template...")
    
    # Clean up and restore original files
    print("Cleaning up...")
    
    # Delete any remaining .yaml files in Players directory
    for yaml_file in players_dir.glob("*.ya*ml"):
        if yaml_file.parent == players_dir:  # Skip subdirectories
            print(f"Removing {yaml_file.name}")
            os.remove(yaml_file)
    
    # Restore original files
    restore_files(temp_dir, players_dir)
    
    print(f"Preset generation complete! Successfully processed {success_count} of {len(template_files)} templates.")
    return 0

def process_template(template_file, players_dir, generate_script):
    """Process a single template file"""
    template_name = template_file.name
    print(f"\nProcessing template: {template_name}")
    
    # Delete any existing .yaml files in Players directory
    for yaml_file in players_dir.glob("*.ya*ml"):
        if yaml_file.parent == players_dir:  # Skip subdirectories
            os.remove(yaml_file)
    
    # Copy template file to Players directory
    dest_file = players_dir / template_name
    print(f"Copying {template_name} to Players directory")
    shutil.copy2(template_file, dest_file)
    
    # Run Generate.py
    print(f"Running Generate.py with template {template_name}")
    try:
        # Using subprocess.run with check=True to raise an exception if the command fails
        result = subprocess.run([sys.executable, generate_script], 
                                check=True, 
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                text=True)
        
        # Print output if there's an error
        if result.stderr.strip():
            print("Error output from Generate.py:")
            print(result.stderr.strip())
            
    except subprocess.CalledProcessError as e:
        print(f"Generate.py failed with exit code {e.returncode}")
        if e.stderr:
            print(f"Error output: {e.stderr}")
        raise
    
    print(f"Successfully processed template: {template_name}")

def restore_files(temp_dir, players_dir):
    """Restore original files from temp directory"""
    for file in temp_dir.glob("*"):
        target = players_dir / file.name
        print(f"Restoring {file.name}")
        shutil.move(file, target)
    
    # Remove temp directory if it's empty
    if not os.listdir(temp_dir):
        print("Removing empty temp directory")
        os.rmdir(temp_dir)

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"Unhandled error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        
        # Try to restore files even if there's an unhandled error
        try:
            base_dir = Path(__file__).parent
            players_dir = base_dir / "Players"
            temp_dir = players_dir / "temp"
            if temp_dir.exists():
                print("Attempting to restore files after error...")
                restore_files(temp_dir, players_dir)
        except Exception as cleanup_error:
            print(f"Error during cleanup: {cleanup_error}", file=sys.stderr)
        sys.exit(1)