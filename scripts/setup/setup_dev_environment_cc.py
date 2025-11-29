#!/usr/bin/env python3
"""
Setup script for Archipelago JSON Export Tools development environment.
Designed for cloud/container environments (e.g., Claude Code).

Based on CC/cloud-setup.md - attempts all setup steps with graceful
error handling so setup continues even if some steps fail.
"""
import os
import sys
import subprocess
import shutil
from pathlib import Path


def safe_print(text):
    """
    Print text safely, falling back to ASCII if encoding fails.
    """
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode(sys.stdout.encoding, errors='replace').decode(sys.stdout.encoding))


def print_step(step_num, step_name):
    """Print a formatted step header"""
    print(f"\n{'='*60}")
    print(f"STEP {step_num}: {step_name}")
    print('='*60)


def run_command(cmd, description, shell=False, check_exit=True, cwd=None, timeout=300):
    """Run a command and handle errors"""
    print(f"\nRunning: {description}")
    print(f"Command: {cmd}")

    try:
        if shell:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd, timeout=timeout)
        else:
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd, timeout=timeout)

        if result.stdout:
            # Limit output to avoid overwhelming the console
            output = result.stdout.strip()
            lines = output.split('\n')
            if len(lines) > 20:
                print("Output (truncated):")
                print('\n'.join(lines[:10]))
                print(f"... ({len(lines) - 20} lines omitted) ...")
                print('\n'.join(lines[-10:]))
            else:
                print("Output:", output)
        if result.stderr and result.returncode != 0:
            print("Error output:", result.stderr.strip()[:500])

        if check_exit and result.returncode != 0:
            safe_print(f"[FAIL] Command failed with exit code {result.returncode}")
            return False
        else:
            safe_print("[OK] Command completed successfully")
            return True

    except subprocess.TimeoutExpired:
        safe_print(f"[FAIL] Command timed out after {timeout} seconds")
        return False
    except Exception as e:
        safe_print(f"[FAIL] Error running command: {e}")
        return False


def check_command_exists(cmd):
    """Check if a command exists in PATH"""
    return shutil.which(cmd) is not None


def main():
    safe_print("[START] Archipelago JSON Export Tools - Cloud Environment Setup")
    print("Full setup for cloud/container environments (based on CC/cloud-setup.md)")
    print("Steps that fail will be skipped, allowing setup to continue.")

    # Get the project root directory (parent of scripts directory)
    script_dir = Path(__file__).parent.absolute()
    project_root = script_dir.parent.parent
    os.chdir(project_root)

    print(f"\nProject root: {project_root}")

    # Track results
    results = {}

    # Step 1: Check Prerequisites
    print_step(1, "Checking Prerequisites")

    # Check Python
    if not check_command_exists("python") and not check_command_exists("python3"):
        safe_print("[FAIL] Python not found. Please install Python 3.8+ first.")
        return False

    python_cmd = "python3" if check_command_exists("python3") else "python"
    safe_print(f"[OK] Python found: {python_cmd}")

    # Check Node.js
    node_available = check_command_exists("node") and check_command_exists("npm")
    if node_available:
        safe_print("[OK] Node.js and npm found")
    else:
        safe_print("[WARN] Node.js/npm not found - Node.js steps will be skipped")

    results['prerequisites'] = True

    # Step 2: Set Up Python Virtual Environment
    print_step(2, "Setting Up Python Virtual Environment")

    venv_path = project_root / ".venv"
    if venv_path.exists():
        safe_print("[OK] Virtual environment already exists")
        results['venv'] = True
    else:
        print("Creating virtual environment...")
        results['venv'] = run_command([python_cmd, "-m", "venv", ".venv"], "Create virtual environment")
        if not results['venv']:
            safe_print("[FAIL] Could not create virtual environment - cannot continue")
            return False

    # Determine paths for venv
    pip_cmd = str(venv_path / "bin" / "pip")
    python_venv = str(venv_path / "bin" / "python")

    # Upgrade pip first to avoid warnings
    print("Upgrading pip...")
    run_command([pip_cmd, "install", "--upgrade", "pip"], "Upgrade pip", check_exit=False)

    # Install base requirements
    print("Installing base Python requirements...")
    results['requirements'] = run_command([pip_cmd, "install", "-r", "requirements.txt"], "Install base requirements")
    if not results['requirements']:
        safe_print("[WARN] Some requirements may have failed to install - continuing anyway")

    # Step 3: Install Game-Specific Dependencies
    print_step(3, "Installing Game-Specific Dependencies")

    print("Running ModuleUpdate.py to install game-specific dependencies...")
    results['module_update'] = run_command(
        [python_venv, "ModuleUpdate.py", "--yes"],
        "Install game-specific dependencies",
        timeout=600  # May take a while
    )
    if not results['module_update']:
        safe_print("[WARN] ModuleUpdate.py failed - some game modules may not work")
        print("This is normal for some optional game modules")

    # Step 4: Generate Game Template Files
    print_step(4, "Generating Game Template Files")

    templates_dir = project_root / "Players" / "Templates"
    if templates_dir.exists() and any(templates_dir.glob("*.yaml")):
        safe_print("[OK] Template files already exist")
        results['templates'] = True
    else:
        print("Generating template YAML files...")
        cmd = [python_venv, "-c", "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"]
        results['templates'] = run_command(cmd, "Generate template files", timeout=120)
        if not results['templates']:
            safe_print("[WARN] Template generation failed - templates can be generated later if needed")

    # Step 5: Set Up Host Configuration
    print_step(5, "Setting Up Host Configuration")

    host_yaml_path = project_root / "host.yaml"
    if host_yaml_path.exists():
        safe_print("[OK] host.yaml already exists")
        results['host_yaml'] = True
    else:
        print("Creating host.yaml...")
        results['host_yaml'] = run_command(
            [python_venv, "Launcher.py", "--update_settings"],
            "Create host.yaml",
            timeout=60
        )
        if not results['host_yaml']:
            safe_print("[WARN] host.yaml creation failed - can be created manually later")

    # Configure for testing (only if host.yaml exists)
    if host_yaml_path.exists():
        print("Configuring host.yaml for minimal spoiler testing...")
        update_script = project_root / "scripts" / "setup" / "update_host_settings.py"
        results['host_config'] = run_command(
            [python_venv, str(update_script), "minimal-spoilers"],
            "Configure testing settings"
        )
        if not results['host_config']:
            safe_print("[WARN] Failed to configure host.yaml - may need manual configuration")
    else:
        results['host_config'] = False

    # Step 6: Install Node.js Dependencies
    if node_available:
        print_step(6, "Installing Node.js Dependencies")

        node_modules = project_root / "node_modules"
        if node_modules.exists():
            safe_print("[OK] Node.js dependencies already installed")
            results['npm'] = True
        else:
            print("Installing Node.js dependencies...")
            results['npm'] = run_command(["npm", "install"], "Install Node.js dependencies", timeout=300)
            if not results['npm']:
                safe_print("[WARN] npm install failed - frontend tests may not work")

        # Step 7: Install Playwright Browsers
        print_step(7, "Installing Playwright Browsers")

        print("Installing Chromium browser for automated testing...")
        results['playwright'] = run_command(
            ["npx", "playwright", "install", "chromium"],
            "Install Playwright Chromium",
            timeout=300
        )
        if not results['playwright']:
            safe_print("[WARN] Playwright installation failed - browser tests may not work")
    else:
        results['npm'] = False
        results['playwright'] = False

    # Step 8: Verify Setup
    print_step(8, "Verifying Setup")

    print("Checking virtual environment...")
    result = subprocess.run([python_venv, "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        safe_print(f"[OK] Python in venv: {result.stdout.strip()}")
    else:
        safe_print("[FAIL] Virtual environment verification failed")
        return False

    # Check key Python imports
    print("Checking Python packages...")
    check_imports = run_command(
        [python_venv, "-c", "import websockets, yaml, jinja2; print('Core packages: OK')"],
        "Verify core Python packages",
        check_exit=False
    )

    print("\nChecking key files...")
    key_files = [
        ("requirements.txt", "Python requirements"),
        ("frontend/index.html", "Frontend application"),
        (".venv", "Virtual environment"),
        ("host.yaml", "Host configuration"),
        ("Players/Templates", "Template files"),
        ("node_modules", "Node.js packages")
    ]

    for file_path, description in key_files:
        path = project_root / file_path
        if path.exists():
            safe_print(f"[OK] {description}: {file_path}")
        else:
            safe_print(f"[MISSING] {description}: {file_path}")

    # Final Summary
    print_step("COMPLETE", "Setup Summary")

    print("\nSetup Results:")
    step_names = {
        'prerequisites': 'Prerequisites check',
        'venv': 'Virtual environment',
        'requirements': 'Base requirements',
        'module_update': 'Game-specific dependencies',
        'templates': 'Template files',
        'host_yaml': 'host.yaml creation',
        'host_config': 'host.yaml configuration',
        'npm': 'Node.js dependencies',
        'playwright': 'Playwright browsers'
    }

    success_count = 0
    for key, name in step_names.items():
        status = results.get(key, False)
        if status:
            safe_print(f"  [OK] {name}")
            success_count += 1
        else:
            safe_print(f"  [SKIP/FAIL] {name}")

    print(f"\n{success_count}/{len(step_names)} steps completed successfully")

    if success_count >= 3:  # At minimum venv and requirements should work
        safe_print("\n[SUCCESS] Cloud environment setup is complete!")
    else:
        safe_print("\n[WARN] Setup completed with some failures")

    print("\nTo activate the virtual environment:")
    print("   source .venv/bin/activate")

    print("\nTo verify Python packages:")
    print(f"   {python_venv} -c \"import websockets, yaml, jinja2; print('OK')\"")

    if results.get('templates'):
        template_count = len(list(templates_dir.glob("*.yaml"))) if templates_dir.exists() else 0
        print(f"\nTemplate files generated: {template_count}")

    return True


if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        safe_print("\n\n[WARN] Setup interrupted by user")
        sys.exit(1)
    except Exception as e:
        safe_print(f"\n\n[FAIL] Unexpected error: {e}")
        sys.exit(1)
