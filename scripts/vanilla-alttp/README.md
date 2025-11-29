# ALTTP Vanilla Item Placement

This directory contains data and scripts for placing items in their vanilla (original game) locations in A Link to the Past.

## Quick Start

To generate an Archipelago game with vanilla item placements:

```bash
# Enable vanilla placement
export VANILLA_PLACEMENT=1

# Generate the game (spoiler must be disabled)
python3 Generate.py --player_files_path Players --spoiler 0
```

This places all items in their original ALTTP locations while maintaining Archipelago's multiworld capabilities.

## Files

### Core Data Files
- `alttp_vanilla_consolidated.json` - Vanilla item placements with Archipelago names (226 locations)
- `alttp_vanilla_items.json` - Original vanilla data from sahasrahbot (230 locations)
- `vanilla.yaml` - Original vanilla preset file from the sahasrahbot repository

### Mapping Files
- `item_name_mapping.json` - Maps sahasrahbot item names to Archipelago item names
- `location_name_mapping.json` - Maps sahasrahbot location names to Archipelago names

### Name Lists (Generated)
- `sahasrahbot_items.json` - List of all item names in sahasrahbot data (159 items)
- `sahasrahbot_locations.json` - List of all location names in sahasrahbot data (230 locations)
- `archipelago_items.json` - List of all item names in Archipelago worlds/alttp (163 items)
- `archipelago_locations.json` - List of all location names in Archipelago worlds/alttp (305 locations)

## Scripts

### Main Scripts

#### `generate_consolidated_vanilla.py`
Consolidates vanilla data with Archipelago names. Reads the three JSON files and outputs a single consolidated file.
```bash
python3 generate_consolidated_vanilla.py
# Creates: alttp_vanilla_consolidated.json
```

#### `extract_vanilla_items.py`
Extracts and decodes vanilla item placements from the sahasrahbot YAML file.
```bash
python3 extract_vanilla_items.py vanilla.yaml alttp_vanilla_items.json
```

### Data Extraction Scripts

#### `extract_sahasrahbot_names.py`
Extracts all item and location names from sahasrahbot data.
```bash
python3 extract_sahasrahbot_names.py
# Creates: sahasrahbot_items.json and sahasrahbot_locations.json
```

#### `extract_archipelago_names.py`
Extracts all item and location names from Archipelago worlds/alttp.
```bash
python3 extract_archipelago_names.py
# Creates: archipelago_items.json and archipelago_locations.json
```

### Analysis Scripts

#### `analyze_name_matches.py`
Analyzes matches between sahasrahbot and Archipelago names.
```bash
python3 analyze_name_matches.py
```

#### `validate_mappings.py`
Validates that mapped item names exist in Archipelago.
```bash
python3 validate_mappings.py
```

#### `generate_vanilla_plando.py`
Generates a plando YAML file with vanilla item placements (old method, not recommended).
```bash
python3 generate_vanilla_plando.py
# Creates: Players/custom/A Link to the Past - vanilla.yaml
```

## How It Works

1. **Normal Generation**: Archipelago generates and places items normally
2. **Vanilla Overwrite**: The system overwrites these placements with vanilla item locations
3. **Medallion Requirements**: Sets to vanilla (Ether for Misery Mire, Quake for Turtle Rock)
4. **Key Placement**: Places small keys and pot keys in their appropriate locations
5. **Bottle Consolidation**: Shows only 4 plain bottles in item pool counts (no variants)

## Implementation Details

The vanilla placement system is implemented in:
- `scripts/vanilla-alttp/VanillaPlacement.py` - Core vanilla placement logic (must be moved to `worlds/alttp/` to use)
- `Main.py` - Triggers vanilla overwrite when `VANILLA_PLACEMENT=1`
- `exporter/games/alttp.py` - Consolidates bottle counts in exported data

**Note:** `VanillaPlacement.py` is stored here for organizational purposes but must be copied/moved to `worlds/alttp/VanillaPlacement.py` in order to function. See the file header for detailed requirements.

### Key Features
- Places 226 items in vanilla locations
- Places 33 additional keys in key drop/pot locations
- Skips accessibility checks (vanilla placement may not satisfy randomizer logic)
- Excludes 2 medallion requirement "locations" that aren't actual item locations

## Testing

To verify vanilla placement is working:
```bash
export VANILLA_PLACEMENT=1
python3 Generate.py --player_files_path Players --spoiler 0 2>&1 | grep "Overwrote.*locations"
# Should show: "=== Overwrote 226 locations with vanilla items ==="
```

## Additional Files (Development Artifacts)

These files were created during development and are kept for reference:

### Generated Plando Files
- `A Link to the Past - vanilla.yaml` - Generated plando YAML with vanilla placements
- `A Link to the Past - vanilla - abridged.yaml` - Shortened version of plando YAML

### Development Scripts
- `analyze_item_mappings.py` - Analyzes item name mapping coverage
- `analyze_location_mappings.py` - Analyzes location name mapping coverage
- `compare_vanilla_data.py` - Compares different vanilla data sources
- `fix_item_mappings.py` - Script used to fix item mapping issues
- `fix_location_mappings.py` - Script used to fix location mapping issues
- `sort_mappings.py` - Sorts mapping JSON files alphabetically
- `trim_item_mappings.py` - Removes unnecessary item mappings

### Intermediate Data Files
- `item_name_comparison.json` - Detailed comparison of item names between sources
- `item_name_mapping_before_trim.json` - Item mappings before cleanup
- `location_name_comparison.json` - Detailed comparison of location names
- `vanilla_data_comparison.json` - Comparison of vanilla data sources
- `AP_*_rules.json` - Exported rules from test generations
- `item_pool.txt` - Debug output of item pool contents

## Data Source

The vanilla item data is derived from the [sahasrahbot](https://github.com/tcprescott/sahasrahbot) project's vanilla preset file, which contains the original ALTTP item placements.