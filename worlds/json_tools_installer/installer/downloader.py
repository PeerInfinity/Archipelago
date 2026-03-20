"""
Download manager for JSON Tools.

Handles downloading archives from GitHub repositories.
"""

import json
import tempfile
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Callable, Tuple
from dataclasses import dataclass

from ..config import SourceConfig

# Requirements file that specifies minimum installer version
REQUIREMENTS_FILENAME = "json_tools_installer_requirements.json"

# Approximate archive size in bytes (GitHub sometimes omits Content-Length)
APPROXIMATE_ARCHIVE_SIZE = 37 * 1024 * 1024  # ~37 MB


@dataclass
class InstallerRequirements:
    """Requirements fetched from the repository."""
    minimum_version: str
    download_url: str
    message: str


@dataclass
class CompatibilityResult:
    """Result of an installer compatibility check."""
    compatible: bool
    current_version: str
    required_version: Optional[str] = None
    download_url: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


@dataclass
class DownloadResult:
    """Result of a download operation."""
    success: bool
    filepath: Optional[Path] = None
    error: Optional[str] = None
    size_bytes: int = 0


def get_download_url(source: SourceConfig) -> str:
    """
    Get the download URL for a GitHub archive.

    Args:
        source: Source configuration with repo and branch.

    Returns:
        URL to download the zip archive.
    """
    return f"https://github.com/{source.repo}/archive/refs/heads/{source.branch}.zip"


def _download_once(
    url: str,
    dest_path: Path,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> DownloadResult:
    """Download a file from a URL (single attempt)."""
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Archipelago-JSON-Tools-Installer/1.0"}
        )

        with urllib.request.urlopen(request, timeout=60) as response:
            total_size = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 8192

            with open(dest_path, "wb") as f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if progress_callback:
                        progress_callback(downloaded, total_size)

        # Validate the downloaded file is a valid zip
        import zipfile
        try:
            with zipfile.ZipFile(dest_path, "r") as zf:
                zf.namelist()  # Force reading the central directory
        except (zipfile.BadZipFile, Exception) as e:
            return DownloadResult(
                success=False,
                error=f"Download incomplete ({downloaded / 1024 / 1024:.1f} MB) - file is not a valid zip",
            )

        return DownloadResult(
            success=True,
            filepath=dest_path,
            size_bytes=downloaded,
        )

    except urllib.error.HTTPError as e:
        return DownloadResult(
            success=False,
            error=f"HTTP error {e.code}: {e.reason}",
        )
    except urllib.error.URLError as e:
        return DownloadResult(
            success=False,
            error=f"URL error: {e.reason}",
        )
    except Exception as e:
        return DownloadResult(
            success=False,
            error=f"Download failed: {str(e)}",
        )


def download_archive(
    source: SourceConfig,
    dest_path: Optional[Path] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    max_retries: int = 3,
) -> DownloadResult:
    """
    Download a repository archive from GitHub.

    Validates the downloaded zip and retries on failure.

    Args:
        source: Source configuration with repo and branch.
        dest_path: Destination path for the downloaded file.
                   If None, uses a temporary file.
        progress_callback: Optional callback(downloaded_bytes, total_bytes)
                          for progress updates.
        max_retries: Maximum number of download attempts.

    Returns:
        DownloadResult with success status and filepath or error.
    """
    url = get_download_url(source)

    # Determine destination
    if dest_path is None:
        fd, temp_path = tempfile.mkstemp(suffix=".zip")
        dest_path = Path(temp_path)
        import os
        os.close(fd)
    else:
        dest_path = Path(dest_path)
        dest_path.parent.mkdir(parents=True, exist_ok=True)

    last_error = None
    for attempt in range(1, max_retries + 1):
        result = _download_once(url, dest_path, progress_callback)
        if result.success:
            return result
        last_error = result.error
        if attempt < max_retries:
            import time
            time.sleep(2)

    return DownloadResult(
        success=False,
        error=f"Download failed after {max_retries} attempts: {last_error}",
    )


def get_latest_commit_hash(source: SourceConfig) -> Optional[str]:
    """
    Get the latest commit hash for a branch.

    Uses GitHub API to fetch the latest commit SHA.

    Args:
        source: Source configuration with repo and branch.

    Returns:
        Commit SHA string, or None if failed.
    """
    api_url = f"https://api.github.com/repos/{source.repo}/commits/{source.branch}"

    try:
        request = urllib.request.Request(
            api_url,
            headers={
                "User-Agent": "Archipelago-JSON-Tools-Installer/1.0",
                "Accept": "application/vnd.github.v3+json",
            }
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            import json
            data = json.loads(response.read().decode("utf-8"))
            return data.get("sha")

    except Exception:
        return None


def check_connectivity() -> bool:
    """
    Check if we can reach GitHub.

    Returns:
        True if GitHub is reachable, False otherwise.
    """
    try:
        request = urllib.request.Request(
            "https://api.github.com",
            headers={"User-Agent": "Archipelago-JSON-Tools-Installer/1.0"}
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status == 200
    except Exception:
        return False


def get_requirements_url(source: SourceConfig) -> str:
    """
    Get the URL for the installer requirements file.

    Uses GitHub's raw content API to fetch the file directly.

    Args:
        source: Source configuration with repo and branch.

    Returns:
        URL to fetch the requirements JSON file.
    """
    return f"https://raw.githubusercontent.com/{source.repo}/{source.branch}/{REQUIREMENTS_FILENAME}"


def fetch_installer_requirements(source: SourceConfig) -> Optional[InstallerRequirements]:
    """
    Fetch the installer requirements from the repository.

    Args:
        source: Source configuration with repo and branch.

    Returns:
        InstallerRequirements if successfully fetched, None otherwise.
    """
    url = get_requirements_url(source)

    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "Archipelago-JSON-Tools-Installer/1.0"}
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
            return InstallerRequirements(
                minimum_version=data.get("minimum_installer_version", "0.0.0"),
                download_url=data.get("download_url", ""),
                message=data.get("message", ""),
            )

    except Exception:
        return None


def parse_version(version_string: str) -> Tuple[int, ...]:
    """
    Parse a version string into a tuple of integers for comparison.

    Args:
        version_string: Version string like "1.0.0" or "1.2.3"

    Returns:
        Tuple of integers, e.g., (1, 0, 0)
    """
    try:
        # Strip any leading 'v' and split on dots
        clean = version_string.lstrip('v').strip()
        parts = clean.split('.')
        return tuple(int(p) for p in parts)
    except (ValueError, AttributeError):
        return (0, 0, 0)


def get_installer_version() -> str:
    """
    Get the current installer version.

    Returns:
        Version string of the installed JSON Tools Installer.
    """
    try:
        from .. import __version__
        return __version__
    except ImportError:
        return "0.0.0"


def check_installer_compatibility(source: SourceConfig) -> CompatibilityResult:
    """
    Check if the current installer is compatible with the repository.

    Fetches the requirements file from the repository and compares
    the minimum required version against the current installer version.

    Args:
        source: Source configuration with repo and branch.

    Returns:
        CompatibilityResult indicating whether installation can proceed.
    """
    current_version = get_installer_version()

    # Fetch requirements from repository
    requirements = fetch_installer_requirements(source)

    if requirements is None:
        # Requirements file not found or couldn't be fetched - abort
        return CompatibilityResult(
            compatible=False,
            current_version=current_version,
            error=(
                f"Could not fetch installer requirements from repository.\n"
                f"The file '{REQUIREMENTS_FILENAME}' must exist in the repository.\n"
                f"URL attempted: {get_requirements_url(source)}"
            ),
        )

    # Compare versions
    current = parse_version(current_version)
    required = parse_version(requirements.minimum_version)

    if current >= required:
        return CompatibilityResult(
            compatible=True,
            current_version=current_version,
            required_version=requirements.minimum_version,
        )
    else:
        return CompatibilityResult(
            compatible=False,
            current_version=current_version,
            required_version=requirements.minimum_version,
            download_url=requirements.download_url,
            message=requirements.message,
        )
