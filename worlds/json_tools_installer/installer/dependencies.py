"""
Dependency installer for JSON Tools.

Installs Python packages required by JSON Tools components (exporter, etc.)
that aren't included in vanilla Archipelago's dependencies.
"""

import logging
import subprocess
import sys
from pathlib import Path
from typing import List, Optional, Tuple

from Utils import local_path

logger = logging.getLogger(__name__)

# Packages required by JSON Tools components beyond vanilla AP's deps
REQUIRED_PACKAGES = [
    "astunparse>=1.6.3",
    "dill>=0.3.8",
]


def check_missing_packages() -> List[str]:
    """
    Check which required packages are not installed.

    Returns:
        List of package requirement strings that are missing.
    """
    missing = []
    for req in REQUIRED_PACKAGES:
        # Extract package name (before any version specifier)
        pkg_name = req.split(">=")[0].split("==")[0].split("<")[0].strip()
        try:
            __import__(pkg_name)
        except ImportError:
            missing.append(req)
    return missing


def install_packages(packages: List[str]) -> Tuple[bool, str]:
    """
    Install Python packages using pip.

    Args:
        packages: List of package requirement strings to install.

    Returns:
        Tuple of (success, output_message).
    """
    if not packages:
        return True, "No packages to install"

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", *packages],
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode == 0:
            return True, f"Installed: {', '.join(packages)}"
        else:
            return False, f"pip failed: {result.stderr.strip()}"

    except subprocess.TimeoutExpired:
        return False, "pip install timed out"
    except Exception as e:
        return False, f"Failed to run pip: {e}"


def install_missing_dependencies() -> Tuple[bool, str]:
    """
    Check for and install any missing dependencies.

    Returns:
        Tuple of (success, message).
    """
    missing = check_missing_packages()
    if not missing:
        return True, "All dependencies already installed"

    logger.info(f"Installing missing dependencies: {missing}")
    return install_packages(missing)
