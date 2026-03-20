"""
Version detection for Archipelago installations.

Detects the installed AP version and determines compatibility with JSON Tools.
"""

import hashlib
import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Tuple

from Utils import local_path


class SupportLevel(Enum):
    """Level of support for an AP version."""
    FULL = "full"           # Pre-made patched files available
    MONKEY = "monkey"       # Monkey patching only
    EXPERIMENTAL = "experimental"  # Untested, may work
    UNSUPPORTED = "unsupported"    # Known incompatible


@dataclass
class VersionInfo:
    """Information about the detected AP version."""
    version_string: str
    version_tuple: Tuple[int, ...]
    support_level: SupportLevel
    notes: str = ""

    @property
    def is_supported(self) -> bool:
        return self.support_level in (SupportLevel.FULL, SupportLevel.MONKEY)


# Known version support levels
# Key is version string, value is (support_level, notes)
KNOWN_VERSIONS: Dict[str, Tuple[SupportLevel, str]] = {
    "0.6.7": (SupportLevel.FULL, "Fully supported with pre-made patches"),
    "0.6.6": (SupportLevel.MONKEY, "Supported via monkey patching"),
    "0.6.5": (SupportLevel.MONKEY, "Supported via monkey patching"),
    "0.6.5-rc1": (SupportLevel.MONKEY, "Supported via monkey patching"),
    "0.6.4": (SupportLevel.MONKEY, "Supported via monkey patching"),
    "0.6.3": (SupportLevel.MONKEY, "Supported via monkey patching"),
}

# File hashes for known versions (used for verification)
# Format: {version: {filename: sha256_hash}}
KNOWN_FILE_HASHES: Dict[str, Dict[str, str]] = {
    # These will be populated with actual hashes
    "0.6.7": {},
}


def detect_ap_version() -> VersionInfo:
    """
    Detect the installed Archipelago version.

    Returns:
        VersionInfo with version details and support level.
    """
    version_string = _get_version_string()
    version_tuple = _parse_version(version_string)
    support_level, notes = _get_support_level(version_string, version_tuple)

    return VersionInfo(
        version_string=version_string,
        version_tuple=version_tuple,
        support_level=support_level,
        notes=notes,
    )


def _get_version_string() -> str:
    """Get the version string from Archipelago."""
    try:
        from Utils import __version__
        return __version__
    except ImportError:
        pass

    # Fallback: try to read from version file or setup.py
    version_file = Path(local_path("VERSION"))
    if version_file.exists():
        return version_file.read_text().strip()

    # Last resort: unknown
    return "unknown"


def _parse_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse a version string into a tuple of integers.

    Examples:
        "0.6.5" -> (0, 6, 5)
        "0.6.5-rc1" -> (0, 6, 5)
        "0.6.5.1" -> (0, 6, 5, 1)
    """
    # Extract numeric parts
    match = re.match(r"(\d+(?:\.\d+)*)", version_string)
    if match:
        parts = match.group(1).split(".")
        return tuple(int(p) for p in parts)
    return (0,)


def _get_support_level(
    version_string: str,
    version_tuple: Tuple[int, ...]
) -> Tuple[SupportLevel, str]:
    """Determine the support level for a version."""
    # Check exact version match
    if version_string in KNOWN_VERSIONS:
        return KNOWN_VERSIONS[version_string]

    # Check base version (without rc suffix, etc.)
    base_version = ".".join(str(v) for v in version_tuple[:3])
    if base_version in KNOWN_VERSIONS:
        level, notes = KNOWN_VERSIONS[base_version]
        return level, f"{notes} (version {version_string})"

    # Unknown version - try to determine based on version number
    if version_tuple >= (0, 6, 7):
        return SupportLevel.EXPERIMENTAL, "Untested version, may work with monkey patching"
    elif version_tuple >= (0, 6, 0):
        return SupportLevel.MONKEY, "Older version, monkey patching only"
    else:
        return SupportLevel.UNSUPPORTED, "Version too old, not compatible"


def get_version_support_status(version_info: VersionInfo = None) -> str:
    """Get a human-readable status string for the version support."""
    if version_info is None:
        version_info = detect_ap_version()

    status_messages = {
        SupportLevel.FULL: "Fully supported",
        SupportLevel.MONKEY: "Supported (monkey patching)",
        SupportLevel.EXPERIMENTAL: "Experimental (may work)",
        SupportLevel.UNSUPPORTED: "Not supported",
    }

    return status_messages.get(version_info.support_level, "Unknown")


def is_version_supported(version_info: VersionInfo = None) -> bool:
    """Check if the current version is supported."""
    if version_info is None:
        version_info = detect_ap_version()
    return version_info.is_supported


def get_file_hash(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def verify_file_integrity(version: str, filename: str) -> Optional[bool]:
    """
    Verify a file matches the expected hash for a version.

    Returns:
        True if matches, False if doesn't match, None if no hash available.
    """
    if version not in KNOWN_FILE_HASHES:
        return None
    if filename not in KNOWN_FILE_HASHES[version]:
        return None

    expected_hash = KNOWN_FILE_HASHES[version][filename]
    filepath = Path(local_path(filename))

    if not filepath.exists():
        return False

    actual_hash = get_file_hash(filepath)
    return actual_hash == expected_hash
