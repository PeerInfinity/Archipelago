"""
Configuration management for JSON Tools Installer.

Handles loading/saving installer configuration and tracking installation state.
"""

import json
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from Utils import user_path


# Default configuration values
DEFAULT_STABLE_REPO = "PeerInfinity/Archipelago"
DEFAULT_STABLE_BRANCH = "JSONExport"
DEFAULT_DEV_REPO = "PeerInfinity/Archipelago-CC"
DEFAULT_DEV_BRANCH = "main"

CONFIG_FILENAME = "json_tools_config.json"


@dataclass
class SourceConfig:
    """Configuration for a download source."""
    repo: str
    branch: str

    def to_dict(self) -> Dict[str, str]:
        return {"repo": self.repo, "branch": self.branch}

    @classmethod
    def from_dict(cls, data: Dict[str, str]) -> "SourceConfig":
        return cls(repo=data.get("repo", ""), branch=data.get("branch", ""))


@dataclass
class BackupInfo:
    """Information about a backed up file."""
    path: str
    original_hash: str
    backup_path: str
    backed_up_at: str


@dataclass
class InstallationInfo:
    """Information about current installation."""
    version: str = "stable"  # "stable" or "dev"
    components: List[str] = field(default_factory=lambda: ["core", "scripts"])
    installed_at: Optional[str] = None
    commit_hash: Optional[str] = None
    source_repo: Optional[str] = None
    source_branch: Optional[str] = None


@dataclass
class PatchInfo:
    """Information about applied patches."""
    method: str = "none"  # "none" or "monkey"
    backups: List[BackupInfo] = field(default_factory=list)
    applied_at: Optional[str] = None
    romless_applied: bool = False
    romless_applied_at: Optional[str] = None


@dataclass
class ExportSettings:
    """
    Export settings used when host.yaml doesn't have these options.

    These settings mirror the GeneralOptions settings from the fork's settings.py.
    When running with monkey patching on vanilla Archipelago, these settings
    serve as the configuration source since vanilla AP doesn't have these options.
    """
    skip_required_files: bool = False
    save_rules_json: bool = False
    rules_json_format: str = "rule_builder"  # "rule_builder", "ast", "both"
    skip_preset_copy_if_rules_identical: bool = False
    save_sphere_log: bool = False
    verbose_sphere_log: bool = False
    extend_sphere_log_to_all_locations: bool = False
    log_fractional_sphere_details: bool = True
    log_integer_sphere_details: bool = False
    auto_collect_events: bool = False
    filter_event_items: bool = False
    update_frontend_presets: bool = False
    use_tracking_mode_config: bool = False
    resolve_options_to_constants: bool = True
    # Preset clearing settings
    clear_game_presets: bool = False
    clear_all_presets: bool = False
    # Pickle export settings
    save_tracker_pickle: bool = False


@dataclass
class InstallerConfig:
    """Main configuration for JSON Tools Installer."""
    stable_source: SourceConfig = field(
        default_factory=lambda: SourceConfig(DEFAULT_STABLE_REPO, DEFAULT_STABLE_BRANCH)
    )
    dev_source: SourceConfig = field(
        default_factory=lambda: SourceConfig(DEFAULT_DEV_REPO, DEFAULT_DEV_BRANCH)
    )
    installation: InstallationInfo = field(default_factory=InstallationInfo)
    patches: PatchInfo = field(default_factory=PatchInfo)
    export_settings: ExportSettings = field(default_factory=ExportSettings)

    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary for JSON serialization."""
        return {
            "sources": {
                "stable": self.stable_source.to_dict(),
                "dev": self.dev_source.to_dict(),
            },
            "installation": {
                "version": self.installation.version,
                "components": self.installation.components,
                "installed_at": self.installation.installed_at,
                "commit_hash": self.installation.commit_hash,
                "source_repo": self.installation.source_repo,
                "source_branch": self.installation.source_branch,
            },
            "patches": {
                "method": self.patches.method,
                "backups": [asdict(b) for b in self.patches.backups],
                "applied_at": self.patches.applied_at,
                "romless_applied": self.patches.romless_applied,
                "romless_applied_at": self.patches.romless_applied_at,
            },
            "export_settings": asdict(self.export_settings),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "InstallerConfig":
        """Create config from dictionary."""
        config = cls()

        sources = data.get("sources", {})
        if "stable" in sources:
            config.stable_source = SourceConfig.from_dict(sources["stable"])
        if "dev" in sources:
            config.dev_source = SourceConfig.from_dict(sources["dev"])

        installation = data.get("installation", {})
        config.installation = InstallationInfo(
            version=installation.get("version", "stable"),
            components=installation.get("components", ["core", "scripts"]),
            installed_at=installation.get("installed_at"),
            commit_hash=installation.get("commit_hash"),
            source_repo=installation.get("source_repo"),
            source_branch=installation.get("source_branch"),
        )

        patches = data.get("patches", {})
        backups = [
            BackupInfo(**b) for b in patches.get("backups", [])
        ]
        config.patches = PatchInfo(
            method=patches.get("method", "none"),
            backups=backups,
            applied_at=patches.get("applied_at"),
            romless_applied=patches.get("romless_applied", False),
            romless_applied_at=patches.get("romless_applied_at"),
        )

        export_settings = data.get("export_settings", {})
        config.export_settings = ExportSettings(
            skip_required_files=export_settings.get("skip_required_files", False),
            save_rules_json=export_settings.get("save_rules_json", False),
            rules_json_format=export_settings.get("rules_json_format", "rule_builder"),
            skip_preset_copy_if_rules_identical=export_settings.get("skip_preset_copy_if_rules_identical", False),
            save_sphere_log=export_settings.get("save_sphere_log", False),
            verbose_sphere_log=export_settings.get("verbose_sphere_log", False),
            extend_sphere_log_to_all_locations=export_settings.get("extend_sphere_log_to_all_locations", False),
            log_fractional_sphere_details=export_settings.get("log_fractional_sphere_details", True),
            log_integer_sphere_details=export_settings.get("log_integer_sphere_details", False),
            auto_collect_events=export_settings.get("auto_collect_events", False),
            filter_event_items=export_settings.get("filter_event_items", False),
            update_frontend_presets=export_settings.get("update_frontend_presets", False),
            use_tracking_mode_config=export_settings.get("use_tracking_mode_config", False),
            resolve_options_to_constants=export_settings.get("resolve_options_to_constants", True),
            clear_game_presets=export_settings.get("clear_game_presets", False),
            clear_all_presets=export_settings.get("clear_all_presets", False),
            save_tracker_pickle=export_settings.get("save_tracker_pickle", False),
        )

        return config

    def get_source(self, version: str = None) -> SourceConfig:
        """Get the source configuration for the specified version."""
        if version is None:
            version = self.installation.version
        if version == "dev":
            return self.dev_source
        return self.stable_source


def get_config_path() -> Path:
    """Get the path to the configuration file."""
    return Path(user_path(CONFIG_FILENAME))


def load_config() -> InstallerConfig:
    """Load configuration from file, or return defaults if not found."""
    config_path = get_config_path()
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return InstallerConfig.from_dict(data)
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"Warning: Failed to load config, using defaults: {e}")
    return InstallerConfig()


def save_config(config: InstallerConfig) -> None:
    """Save configuration to file."""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config.to_dict(), f, indent=2)


def update_installation_info(
    config: InstallerConfig,
    version: str,
    components: List[str],
    commit_hash: Optional[str] = None,
) -> None:
    """Update installation information in config."""
    source = config.get_source(version)
    config.installation = InstallationInfo(
        version=version,
        components=components,
        installed_at=datetime.now().isoformat(),
        commit_hash=commit_hash,
        source_repo=source.repo,
        source_branch=source.branch,
    )
    save_config(config)


def add_backup_info(
    config: InstallerConfig,
    path: str,
    original_hash: str,
    backup_path: str,
) -> None:
    """Add backup information to config."""
    backup = BackupInfo(
        path=path,
        original_hash=original_hash,
        backup_path=backup_path,
        backed_up_at=datetime.now().isoformat(),
    )
    # Remove any existing backup for the same path
    config.patches.backups = [
        b for b in config.patches.backups if b.path != path
    ]
    config.patches.backups.append(backup)
    config.patches.applied_at = datetime.now().isoformat()
    save_config(config)


def clear_installation(config: InstallerConfig) -> None:
    """Clear installation information (for uninstall)."""
    config.installation = InstallationInfo()
    config.patches = PatchInfo()
    save_config(config)


# Export settings presets for host.yaml configuration
# All settings go under the 'json_tools' namespace in host.yaml
EXPORT_PRESETS: Dict[str, Dict[str, Any]] = {
    "normal": {
        "json_tools": {
            "skip_required_files": False,
            "save_rules_json": False,
            "rules_json_format": "rule_builder",
            "skip_preset_copy_if_rules_identical": False,
            "save_sphere_log": False,
            "verbose_sphere_log": False,
            "extend_sphere_log_to_all_locations": False,
            "log_fractional_sphere_details": True,
            "log_integer_sphere_details": False,
            "auto_collect_events": False,
            "filter_event_items": False,
            "update_frontend_presets": False,
            "use_tracking_mode_config": False,
            "resolve_options_to_constants": True,
            "clear_game_presets": False,
            "clear_all_presets": False,
            "save_tracker_pickle": False,
        },
    },
    "minimal-spoilers": {
        "json_tools": {
            "skip_required_files": True,
            "save_rules_json": True,
            "rules_json_format": "rule_builder",
            "skip_preset_copy_if_rules_identical": False,
            "save_sphere_log": True,
            "verbose_sphere_log": False,
            "extend_sphere_log_to_all_locations": False,
            "log_fractional_sphere_details": True,
            "log_integer_sphere_details": False,
            "auto_collect_events": False,
            "filter_event_items": False,
            "update_frontend_presets": True,
            "use_tracking_mode_config": False,
            "resolve_options_to_constants": True,
            "clear_game_presets": False,
            "clear_all_presets": False,
            "save_tracker_pickle": False,
        },
    },
}


def get_host_yaml_path() -> Optional[Path]:
    """
    Get the path to host.yaml.

    Returns:
        Path to host.yaml if found, None otherwise.
    """
    # Check common locations
    locations = [
        Path.cwd() / "host.yaml",
        Path(user_path("host.yaml")),
        Path.cwd() / "options.yaml",
        Path(user_path("options.yaml")),
    ]

    for loc in locations:
        if loc.exists():
            return loc

    return None


def configure_export_settings(
    preset: str = "normal",
    create_if_missing: bool = True,
) -> bool:
    """
    Configure export settings in host.yaml.

    This adds the export-related settings to host.yaml's json_tools section.
    These settings are needed for JSON export and sphere logging to work.

    Args:
        preset: Which preset to use ("normal" or "minimal-spoilers").
        create_if_missing: If True, create host.yaml if it doesn't exist.

    Returns:
        True if settings were configured successfully, False otherwise.
    """
    import subprocess

    try:
        import yaml
    except ImportError:
        print("Warning: PyYAML not available, cannot configure host.yaml")
        return False

    if preset not in EXPORT_PRESETS:
        print(f"Warning: Unknown preset '{preset}', using 'normal'")
        preset = "normal"

    preset_config = EXPORT_PRESETS[preset]

    # Find or create host.yaml
    host_yaml_path = get_host_yaml_path()
    data = None

    if host_yaml_path is None:
        if create_if_missing:
            # Try to create host.yaml using Launcher.py --update_settings
            # This creates a properly structured host.yaml with all standard settings
            try:
                import sys
                python_exe = sys.executable
                # Find Launcher.py - it should be in the Archipelago root
                launcher_locations = [
                    Path.cwd() / "Launcher.py",
                    Path(__file__).parent.parent.parent.parent / "Launcher.py",
                ]
                launcher_path = None
                for loc in launcher_locations:
                    if loc.exists():
                        launcher_path = loc
                        break

                if launcher_path:
                    result = subprocess.run(
                        [python_exe, str(launcher_path), "--update_settings"],
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode == 0:
                        # Re-check for host.yaml after creation
                        host_yaml_path = get_host_yaml_path()
            except (subprocess.TimeoutExpired, Exception) as e:
                print(f"Warning: Failed to run Launcher.py --update_settings: {e}")

            # If Launcher.py didn't create it, fall back to minimal creation
            if host_yaml_path is None:
                host_yaml_path = Path(user_path("host.yaml"))
                data = {"general_options": {}, "json_tools": {}}
        else:
            print("Warning: host.yaml not found, cannot configure export settings")
            return False
    else:
        data = None  # Will read from file below

    # Read existing file if we haven't already set data
    if data is None:
        try:
            with open(host_yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Warning: Failed to read host.yaml: {e}")
            return False

    # Apply settings from preset to their respective namespaces
    for namespace, settings in preset_config.items():
        if namespace not in data:
            data[namespace] = {}
        for key, value in settings.items():
            data[namespace][key] = value

    # Write back to file
    try:
        host_yaml_path.parent.mkdir(parents=True, exist_ok=True)
        with open(host_yaml_path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
    except Exception as e:
        print(f"Warning: Failed to write host.yaml: {e}")
        return False

    # Also update installer config so get_export_setting() works on vanilla AP
    # (vanilla AP's settings.json_tools doesn't exist,
    # so the fallback to installer config is needed)
    try:
        config = load_config()
        jt_settings = preset_config.get("json_tools", {})
        for key, value in jt_settings.items():
            if hasattr(config.export_settings, key):
                setattr(config.export_settings, key, value)
        save_config(config)
    except Exception as e:
        print(f"Warning: Failed to update installer config: {e}")

    return True


def get_export_setting(setting_name: str, default: Any = None) -> Any:
    """
    Get an export setting, checking host.yaml first then installer config.

    Args:
        setting_name: The name of the setting (e.g., 'save_rules_json')
        default: Default value if setting is not found

    Returns:
        The setting value from host.yaml, installer config, or the default.
    """
    # First try host.yaml json_tools namespace (fork's settings)
    try:
        from .json_tools_settings import get_json_tools_settings
        jt = get_json_tools_settings()
        value = getattr(jt, setting_name, None)
        if value is not None:
            return value
    except (ImportError, AttributeError):
        pass

    # Fall back to installer config (for vanilla AP with monkey patching)
    try:
        config = load_config()
        if hasattr(config.export_settings, setting_name):
            return getattr(config.export_settings, setting_name)
    except Exception:
        pass

    return default
