#!/usr/bin/env python3
"""
Comprehensive setup script for Archipelago JSON Export Tools development environment.
Runs all steps from the getting-started.md guide automatically.
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path

def print_step(step_num, step_name):
    """Print a formatted step header"""
    print(f"\n{'='*60}")
    print(f"STEP {step_num}: {step_name}")
    print('='*60)

def run_command(cmd, description, shell=False, check_exit=True, cwd=None):
    """Run a command and handle errors"""
    print(f"\nRunning: {description}")
    print(f"Command: {cmd}")
    
    try:
        if shell:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
        
        if result.stdout:
            print("Output:", result.stdout.strip())
        if result.stderr and result.returncode != 0:
            print("Error output:", result.stderr.strip())
            
        if check_exit and result.returncode != 0:
            print(f"❌ Command failed with exit code {result.returncode}")
            return False
        else:
            print("✅ Command completed successfully")
            return True
            
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return False

def check_command_exists(cmd):
    """Check if a command exists in PATH"""
    return shutil.which(cmd) is not None

def main():
    print("🚀 Archipelago JSON Export Tools - Development Environment Setup")
    print("This script will set up your development environment automatically.")
    print("Steps that are already completed will be skipped.")
    
    # Get the project root directory (parent of scripts directory)
    script_dir = Path(__file__).parent.absolute()
    project_root = script_dir.parent
    os.chdir(project_root)
    
    print(f"\nProject root: {project_root}")
    
    # Step 1: Check Prerequisites
    print_step(1, "Checking Prerequisites")
    
    # Check Python
    if not check_command_exists("python") and not check_command_exists("python3"):
        print("❌ Python not found. Please install Python 3.8+ first.")
        return False
    
    # On Windows, prefer 'python' over 'python3' as it's more reliable
    if os.name == 'nt':  # Windows
        python_cmd = "python" if check_command_exists("python") else "python3"
    else:  # Unix-like
        python_cmd = "python3" if check_command_exists("python3") else "python"
    print(f"✅ Python found: {python_cmd}")
    
    # Check Node.js (optional but recommended)
    if check_command_exists("node") and check_command_exists("npm"):
        print("✅ Node.js and npm found")
        node_available = True
    else:
        print("⚠️  Node.js/npm not found - automated tests will not be available")
        node_available = False
    
    # Step 2: Set Up Python Virtual Environment
    print_step(2, "Setting Up Python Virtual Environment")
    
    venv_path = project_root / ".venv"
    if venv_path.exists():
        print("✅ Virtual environment already exists")
    else:
        print("Creating virtual environment...")
        if not run_command([python_cmd, "-m", "venv", ".venv"], "Create virtual environment"):
            return False
    
    # Determine activation script
    if os.name == 'nt':  # Windows
        activate_script = venv_path / "Scripts" / "activate"
        pip_cmd = str(venv_path / "Scripts" / "pip")
        python_venv = str(venv_path / "Scripts" / "python")
    else:  # Unix-like
        activate_script = venv_path / "bin" / "activate"
        pip_cmd = str(venv_path / "bin" / "pip")
        python_venv = str(venv_path / "bin" / "python")
    
    # Install base requirements
    print("Installing base Python requirements...")
    if not run_command([pip_cmd, "install", "-r", "requirements.txt"], "Install base requirements"):
        return False
    
    # Step 3: Install Additional Dependencies (Advanced Setup)
    print_step(3, "Installing Additional Dependencies")
    
    print("Running ModuleUpdate.py to install game-specific dependencies...")
    if not run_command([python_venv, "ModuleUpdate.py", "--yes"], "Install additional dependencies"):
        print("⚠️  Some additional dependencies may have failed to install")
        print("This is normal for some optional game modules")
    
    # Step 4: Generate Game Template Files
    print_step(4, "Generating Game Template Files")
    
    templates_dir = project_root / "Players" / "Templates"
    if templates_dir.exists() and any(templates_dir.glob("*.yaml")):
        print("✅ Template files already exist")
    else:
        print("Generating template YAML files...")
        cmd = [python_venv, "-c", "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"]
        if not run_command(cmd, "Generate template files"):
            print("⚠️  Template generation may have failed, but this won't prevent basic development")
    
    # Step 5: Set Up Host Configuration
    print_step(5, "Setting Up Host Configuration")
    
    host_yaml_path = project_root / "host.yaml"
    if host_yaml_path.exists():
        print("✅ host.yaml already exists")
    else:
        print("Creating host.yaml...")
        if not run_command([python_venv, "Launcher.py", "--update_settings"], "Create host.yaml"):
            return False
    
    # Configure for testing
    print("Configuring host.yaml for minimal spoiler testing...")
    update_script = project_root / "scripts" / "update_host_settings.py"
    if not run_command([python_venv, str(update_script), "minimal-spoilers"], "Configure testing settings"):
        print("⚠️  Failed to configure testing settings - you may need to edit host.yaml manually")
    
    # Step 6: Install Node.js Dependencies (if available)
    if node_available:
        print_step(6, "Installing Node.js Dependencies")
        
        package_json = project_root / "package.json"
        node_modules = project_root / "node_modules"
        
        if node_modules.exists():
            print("✅ Node.js dependencies already installed")
        else:
            print("Installing Node.js dependencies...")
            if not run_command(["npm", "install"], "Install Node.js dependencies"):
                print("⚠️  npm install failed - automated tests may not work")
    
    # Step 7: Verify Setup
    print_step(7, "Verifying Setup")
    
    print("Checking virtual environment...")
    result = subprocess.run([python_venv, "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✅ Python in venv: {result.stdout.strip()}")
    else:
        print("❌ Virtual environment verification failed")
        return False
    
    print("Checking if key files exist...")
    key_files = [
        ("host.yaml", "Host configuration"),
        ("requirements.txt", "Python requirements"),
        ("frontend/index.html", "Frontend application"),
        (".venv", "Virtual environment")
    ]
    
    for file_path, description in key_files:
        if (project_root / file_path).exists():
            print(f"✅ {description}: {file_path}")
        else:
            print(f"❌ Missing: {file_path}")
    
    # Final Instructions
    print_step("COMPLETE", "Setup Complete!")
    
    print("🎉 Development environment setup is complete!")
    print("\nNext steps:")
    print("1. Start the development server:")
    print("   source .venv/bin/activate  # (or .venv\\Scripts\\activate on Windows)")
    print("   python -m http.server 8000")
    print("\n2. Open your browser to: http://localhost:8000/frontend/")
    
    if node_available:
        print("\n3. Run tests (in a new terminal):")
        print("   npm test")
    
    print("\n4. See docs/json/developer/getting-started.md for detailed next steps")
    
    print(f"\nNote: Remember to activate your virtual environment in new terminals:")
    if os.name == 'nt':
        print("   .venv\\Scripts\\activate")
    else:
        print("   source .venv/bin/activate")
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        sys.exit(1)