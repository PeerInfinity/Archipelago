# JSON Tools Installer APWorld

An APWorld package that provides tools for installing, updating, and managing JSON Tools for Archipelago.

## Overview

This installer allows vanilla Archipelago users to easily install the JSON Tools suite (exporter, rule builder, world generator, frontend) without needing to clone or manage the full development repository.

## Features

- **Download Tools**: Fetch JSON Tools from GitHub (stable or development versions)
- **Automatic Patching**: Patch core Archipelago files with backup/restore capability
- **Version Detection**: Automatically detect AP version and offer compatible patches
- **GUI Integration**: Kivy-based GUIs integrated into Archipelago Launcher
- **CLI Support**: Full command-line interface for scripted/headless usage
- **Monkey Patching**: Runtime patching fallback for unsupported AP versions

## Installation

### Option 1: Install as APWorld

If you already have Archipelago running from source, place the APWorld and launch:

1. Download [`json_tools_installer.apworld`](https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld) into your Archipelago `custom_worlds/` directory
2. Restart the Launcher to load the new APWorld

If you need to set up Archipelago from source first:

**Linux / macOS:**
```bash
git clone https://github.com/ArchipelagoMW/Archipelago.git
cd Archipelago
mkdir -p custom_worlds
wget -O custom_worlds/json_tools_installer.apworld \
    https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld
python3 -m venv .venv
source .venv/bin/activate
python ModuleUpdate.py -y
python Launcher.py
```

**Windows (cmd.exe):**
```cmd
git clone https://github.com/ArchipelagoMW/Archipelago.git
cd Archipelago
mkdir custom_worlds
curl -L -o custom_worlds\json_tools_installer.apworld https://github.com/PeerInfinity/Archipelago-CC/raw/main/apworlds/json_tools_installer.apworld
python -m venv .venv
.venv\Scripts\activate.bat
python ModuleUpdate.py -y
python Launcher.py
```

### Option 2: From Source

If you have the Archipelago-CC repository:
```bash
python scripts/build/pack_json_tools_installer.py
```
The APWorld will be created in `apworlds/json_tools_installer.apworld`.

## Usage

### Via Archipelago Launcher

After installation, new components appear in the Launcher:

- **JSON Tools Installer**: Main installation/update GUI
- **JSON Tools Status**: Check installation status, toggle monkey patches
- **JSON Tools Scripts**: Run utility scripts

### Via Command Line

```bash
# Install stable version with default components
python -m worlds.json_tools_installer install

# Install development version with all components
python -m worlds.json_tools_installer install --version dev --all

# Install specific components
python -m worlds.json_tools_installer install --frontend --presets

# Install with JSON export enabled (minimal-spoilers preset)
python -m worlds.json_tools_installer install --export-preset minimal-spoilers

# Install without configuring host.yaml export settings
python -m worlds.json_tools_installer install --no-configure-export

# Check installation status
python -m worlds.json_tools_installer status

# Check status with full configuration details
python -m worlds.json_tools_installer status --verbose --config

# Uninstall
python -m worlds.json_tools_installer install --uninstall

# Revert patches only (keep tools)
python -m worlds.json_tools_installer install --revert-patches
```

### Direct CLI Module

```bash
# Alternative: run the install CLI directly
python -m worlds.json_tools_installer.cli.install [options]
python -m worlds.json_tools_installer.cli.status [options]
```

## Components

The installer can install these components:

| Component | Description | Default |
|-----------|-------------|---------|
| `exporter` | Export game logic to JSON format | Yes |
| `rule_builder` | Build access rules from JSON definitions | Yes |
| `world_generator` | Generate world packages from JSON rules | Yes |
| `frontend` | Web UI for viewing game logic (excludes presets) | Yes |
| `presets` | Pre-generated game data (~75MB, requires frontend) | No |
| `docs` | JSON Tools documentation | Yes |
| `scripts` | Utility scripts for testing and setup | Yes |
| `romless_patches` | Patched world files for generation without ROMs | Yes |
| `demo_worlds` | Example worlds (bakingadventure, codingadventure, etc.) | Yes |
| `tracker` | PopTracker integration world for auto-tracking | No |
| `testing` | Test config files (package.json, playwright, vitest) | No |
| `worldgen_worlds` | Auto-generated world packages from JSON rules (~15MB) | No |

## Version Sources

- **Stable**: `PeerInfinity/Archipelago` @ `JSONExport` branch
- **Development**: `PeerInfinity/Archipelago-CC` @ `main` branch

Configure custom sources:
```bash
python -m worlds.json_tools_installer config --stable-repo owner/repo --stable-branch branch
python -m worlds.json_tools_installer config --dev-repo owner/repo --dev-branch branch
```

## Patching Methods

### Monkey Patching
Runtime patching that hooks into Archipelago's core functions without modifying any files. This works across AP versions.

Monkey patching is initially disabled when the APWorld is first loaded. Running the installer enables it by default (the checkbox is checked). You can also toggle it at any time through the **JSON Tools Status** GUI, or disable it during installation with `--no-patch`:
```bash
# Install with monkey patching enabled (default)
python -m worlds.json_tools_installer install

# Install without monkey patching
python -m worlds.json_tools_installer install --no-patch
```

For technical details on how monkey patching works internally, see [docs/monkey-patching.md](docs/monkey-patching.md).

**Limitations of monkey patching:**
- Exported files are not included in the output `.zip` archive (they go directly to `frontend/presets/`)
- Requires either configured `host.yaml` export settings or installer config for settings
- The exporter module must be installed separately for actual export functionality

For full integration without these limitations, use the Archipelago-CC fork.

### ROM-less Patches
Additionally, ROM-less patches can be applied to allow generation without ROM files. These patches modify world `__init__.py` files and add supporting infrastructure (`settings.py`, `worlds/RomlessUtils.py`):
```bash
# Enable ROM-less patches during install
python -m worlds.json_tools_installer install --romless
```

### GUI Patch Options
In the installer GUI, you'll see two checkboxes under "Apply patches after download:":
- **Monkey patch** (checked by default) - Enables runtime hooks for JSON export
- **ROM-less patches** - Patches for testing without ROM files

You can also toggle monkey patching after installation through the **JSON Tools Status** GUI.

## Export Settings Configuration

The installer can automatically configure export settings in your `host.yaml` file. This eliminates the need to manually run setup scripts after installation.

### Export Presets

| Preset | Description |
|--------|-------------|
| `normal` | Export features disabled (default) |
| `minimal-spoilers` | Enables JSON export and sphere logging for the frontend UI |

### CLI Options

```bash
# Configure with minimal-spoilers preset (enables JSON export)
python -m worlds.json_tools_installer install --export-preset minimal-spoilers

# Skip export settings configuration entirely
python -m worlds.json_tools_installer install --no-configure-export
```

By default, the installer configures `host.yaml` with the `normal` preset. Use `--export-preset minimal-spoilers` if you want JSON rules files and sphere logs to be generated automatically when creating seeds.

### GUI Options

In the installer GUI, you'll see options under "Configure export settings in host.yaml:":
- **Configure host.yaml** (checked by default) - Whether to update export settings
- **Disable JSON Export** - Standard settings with export disabled
- **Enable JSON Export - Minimal Spoilers** - Enables JSON export and sphere logging

## Backup and Restore

The installer automatically backs up original files before patching:
- Backups are stored in `json_tools_backups/`
- Original file hashes are recorded in the configuration
- Use `--revert-patches` to restore originals

## Configuration

Configuration is stored in `json_tools_config.json`:

```json
{
  "sources": {
    "stable": {
      "repo": "PeerInfinity/Archipelago",
      "branch": "JSONExport"
    },
    "dev": {
      "repo": "PeerInfinity/Archipelago-CC",
      "branch": "main"
    }
  },
  "installation": {
    "version": "stable",
    "components": ["exporter", "rule_builder", "world_generator", "frontend", "docs", "scripts"],
    "installed_at": "2025-01-04T12:00:00",
    "commit_hash": "abc123..."
  },
  "patches": {
    "method": "none",
    "backups": [],
    "applied_at": null,
    "romless_applied": false
  },
  "export_settings": {
    "save_rules_json": false,
    "rules_json_format": "rule_builder",
    "save_sphere_log": false,
    "update_frontend_presets": false
  }
}
```

The `export_settings` section mirrors the settings written to `host.yaml` and serves as a fallback when running with monkey patching on vanilla Archipelago installations that don't have these options in their settings.

## Supported AP Versions

| AP Version | Support Level | Method |
|------------|---------------|--------|
| 0.6.3+ | Supported | Monkey patches |
| < 0.6.3 | Unsupported | N/A |

## Troubleshooting

### "Cannot reach GitHub"
Check your internet connection. The installer needs to download files from GitHub.

### "No bundled patches for version X"
Your AP version doesn't have pre-made patches. Monkey patching works across all versions and is enabled by default when using the installer.

### "File already patched"
Use `--revert-patches` first, then reinstall:
```bash
python -m worlds.json_tools_installer install --revert-patches
python -m worlds.json_tools_installer install
```

### Reverting to Original Files
```bash
python -m worlds.json_tools_installer install --revert-patches
```

## Development

### Building the APWorld

```bash
python scripts/build/pack_json_tools_installer.py
```

### Testing Imports

```python
from worlds.json_tools_installer import JSONToolsInstallerWorld
from worlds.json_tools_installer.config import load_config, save_config
from worlds.json_tools_installer.installer import detect_ap_version, download_archive
from worlds.json_tools_installer.monkey_patches import install_hooks
```

### Project Structure

```
worlds/json_tools_installer/
├── __init__.py           # Hidden world stub
├── __main__.py           # CLI entry point
├── archipelago.json      # APWorld manifest
├── config.py             # Configuration management
├── components.py         # Launcher components
├── requirements.txt      # Python dependencies for this module
├── README.md             # This file
├── installer/
│   ├── __init__.py
│   ├── version_detector.py  # AP version detection
│   ├── dependencies.py      # Auto-install missing pip packages
│   ├── downloader.py        # GitHub download with retry
│   ├── extractor.py         # Archive extraction
│   └── romless_patcher.py   # ROM-less world patching
├── cli/
│   ├── __init__.py
│   ├── install.py        # Install CLI
│   └── status.py         # Status CLI
├── gui/
│   ├── __init__.py
│   ├── installer_gui.py  # Install/update GUI
│   ├── status_gui.py     # Status GUI
│   └── scripts_gui.py    # Scripts GUI
└── monkey_patches/
    ├── __init__.py
    └── hooks.py          # Runtime patching hooks

# Patches are downloaded to (not bundled in the module):
json_tools_patches/
└── 0.6.7/
    └── romless/          # ROM-less world patches + infrastructure files
```

## License

This project is part of Archipelago and follows its licensing terms.
