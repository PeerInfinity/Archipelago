"""
CLI interface for JSON Tools Installer.

Provides command-line tools for:
- Installing/updating JSON Tools
- Checking installation status
- Managing configuration
- Running utility scripts
"""

from .install import main as install_main
from .status import main as status_main

__all__ = ["install_main", "status_main"]
