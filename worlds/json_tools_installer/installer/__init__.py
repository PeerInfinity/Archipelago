"""
Installer module for JSON Tools.

Provides functionality for:
- Detecting Archipelago version
- Downloading tools from GitHub
- Extracting and installing files
- ROM-less patching with backup/restore
"""

from .version_detector import (
    detect_ap_version,
    get_version_support_status,
    is_version_supported,
    VersionInfo,
)
from .downloader import (
    download_archive,
    get_download_url,
)
from .extractor import (
    extract_tools,
    get_extractable_components,
)
from .romless_patcher import (
    apply_romless_patches,
    revert_romless_patches,
    check_romless_patch_status,
    get_romless_patch_summary,
)

__all__ = [
    "detect_ap_version",
    "get_version_support_status",
    "is_version_supported",
    "VersionInfo",
    "download_archive",
    "get_download_url",
    "extract_tools",
    "get_extractable_components",
    "apply_romless_patches",
    "revert_romless_patches",
    "check_romless_patch_status",
    "get_romless_patch_summary",
]
