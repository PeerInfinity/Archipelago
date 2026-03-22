# World Generator

The world generator converts JSON rules files into complete, functional Archipelago world packages. Its primary purpose is enabling the [Universal Tracker's worldgen tracking mode](../docs/json/features/universal-tracker.md) — rebuilding a game's logic from exported JSON so the tracker can evaluate reachability and explain rules for any game.

## How It Fits Into Tracking

The standard Universal Tracker works by regenerating a world from YAML template files. This breaks for games with randomized logic (entrance shuffle, random starting locations, etc.) because the regenerated world won't match the actual seed.

The worldgen tracking mode solves this. During seed generation, the [exporter](../exporter/README.md) captures the game's actual logic — items, locations, regions, access rules, options — into a `_rules.json` file. When the tracker connects to a server, it uses the world generator to rebuild the world from that JSON, producing a world that matches the real seed exactly.

Because the rebuilt world uses [Rule Builder](../rule_builder/README.md) objects for all access rules, the tracker gets full `/explain` support — colored rule trees showing why a location is or isn't reachable given your current items. This works for every game, even those without native Rule Builder integration, since all rules are converted to Rule Builder objects during the rebuild.

The tracker's [hybrid mode](../worlds/tracker/docs/hybrid-mode.md) automatically selects the best tracking mode per game based on fuzz test results, trying worldgen first, then falling back to pickle or original regeneration.

## Other Uses

- **Testing and validation** — Generate a worldgen copy of any game and compare its behavior against the original to verify the export pipeline.
- **Bootstrapping new worlds** — Start from an exported rules file and customize the generated code, rather than writing everything from scratch.

Generated worlds use the `_worldgen` suffix by convention (e.g., `tunic_worldgen`) to avoid conflicts with the original world.

## Quick Start

```bash
# Generate a world from exported rules
python -m world_generator frontend/presets/tunic/AP_14089154938208861744/AP_14089154938208861744_rules.json

# Specify output directory and game name
python -m world_generator rules.json -o worlds/mygame_worldgen --game-name "My Game WorldGen"

# Preview without writing files
python -m world_generator rules.json --dry-run
```

## CLI Options

| Option | Description |
|--------|-------------|
| `input` | Path to JSON rules file (required) |
| `-o, --output` | Output directory (default: auto-derived from game name) |
| `--game-name` | Override game name (useful to avoid conflicts) |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview output without writing |
| `--validate` | Validate JSON and report issues only |
| `--canonical-seed N` | Enable seed=N canonical placement |
| `--player-id` | Player ID to extract for multiworld (default: '1') |
| `-v, --verbose` | Verbose output |

## Directory Structure

```
world_generator/
├── __init__.py           # Public API exports
├── __main__.py           # CLI entry point
├── cli.py                # Command-line interface
├── generator.py          # Main orchestrator (WorldGenerator)
├── extractors.py         # JSON parsing and data extraction
├── rule_codegen.py       # Rule → Python code generation
├── templates.py          # File template generation
├── json_world_builder.py # Live world instantiation from JSON
└── constants.py          # Configuration constants
```

## Generated Output

Running the generator creates a complete Archipelago world package:

```
worlds/{game_directory}/
├── __init__.py           # World class (inherits RuleWorldMixin)
├── Items.py              # Item definitions with classifications
├── Locations.py          # Location definitions with regions
├── Regions.py            # Region structure and entrances
├── Rules.py              # Access rules (Rule Builder syntax)
├── Options.py            # Game-specific options
├── archipelago.json      # APWorld manifest
├── _worldgen_options.json # Options for canonical seed
└── docs/en/setup.md      # Setup guide
```

## Python API

### Generate a World

```python
from world_generator import WorldGenerator

generator = WorldGenerator(
    json_path='path/to/rules.json',
    output_dir='worlds/mygame/',
    game_name='My Game WorldGen',  # Optional override
    canonical_seed=1               # Optional: enable canonical placement
)
generator.load()
generator.generate()
```

### Instantiate a World from JSON

For tracking or testing, you can create a live world instance:

```python
from world_generator import create_world_from_json

# One-shot creation
world, multiworld, state = create_world_from_json('path/to/rules.json')

# Or use the builder for more control
from world_generator import JSONWorldBuilder

builder = JSONWorldBuilder('path/to/rules.json')
builder.load()
world = builder.build_world()
```

### Extract Data from JSON

```python
from world_generator import (
    extract_game_metadata,
    extract_items,
    extract_locations,
    extract_regions
)

with open('rules.json') as f:
    data = json.load(f)

metadata = extract_game_metadata(data)
items = extract_items(data)
locations = extract_locations(data)
regions = extract_regions(data)
```

## Key Features

### Canonical Seed Placement

When generating with `--canonical-seed 1`, the world will place items in their original locations when seed=1 is used. This enables perfect reproduction of the original world's item placement.

```bash
python -m world_generator rules.json --canonical-seed 1
```

### Rule Builder Integration

Generated worlds use Rule Builder syntax for clean, readable access rules:

```python
# Generated Rules.py example
def set_rules(world):
    set_rule(world.get_location("Fortress - East Shortcut"),
        Has("Ladder") | Has("Magic Orb"))
```

### Name Substitutions

Some worlds must use generic names at the class level (e.g. `"Statement 1"`, `"Prove Statement 1"`) because Archipelago's datapackage contract requires `item_name_to_id` to be fixed at class definition time. But when the world generator creates a *new* world from the exported JSON, it can use whatever names it wants.

If the source world publishes a `name_substitutions` attribute, the generator applies it to the raw JSON **before** extraction — so all generated code (Items.py, Locations.py, Rules.py, Regions.py) automatically gets meaningful names with zero manual fixup.

The substitutions dict has three sub-dicts:

```python
self.name_substitutions = {
    "items":     {"Statement 1": "2cn: |- 2 e. CC", ...},
    "locations": {"Prove Statement 1": "Prove 2cn: |- 2 e. CC", ...},
    "regions":   {"Prove Statement 1": "Prove 2cn: |- 2 e. CC", ...},
}
```

The generator replaces every occurrence of each generic name across all JSON sections (items, regions, access rules, canonical placements, starting items, itempool counts, completion condition, dependencies, etc.) before any data extraction happens.

See [Name Substitutions](../docs/json/developer/guides/world-generator.md#name-substitutions) in the developer guide for implementation details.

### Helper Function Expansion

The generator expands helper function references into self-contained rules, making the generated code independent of external helper modules.

### State Counter Detection

Automatically detects counter item patterns like:
- `"50 coins"` - Space-prefixed format
- `"5 REP"` - Numeric + uppercase suffix
- `"50 Rupees"` - Numeric + title case suffix

## Key Classes

| Class | Purpose |
|-------|---------|
| `WorldGenerator` | Main orchestrator for generation |
| `JSONWorldBuilder` | Instantiate live world from JSON |
| `RuleCodeGenerator` | Convert JSON rules to Python code |
| `ExtractedData` | Container for all extracted data |

## Dependencies

The world generator uses only:
- Python standard library
- Archipelago base classes (`BaseClasses`, `Options`, `worlds.AutoWorld`)
- `rule_builder` module (for `RuleWorldMixin`)

No external packages required.

## Related Documentation

- **[World Generator Guide](../docs/json/developer/guides/world-generator.md)** - Detailed usage guide
- **[World Generator Tests](../docs/json/developer/tests/test-world-generator.md)** - Round-trip testing documentation
- **[Exporter](../exporter/README.md)** - Creates the JSON files this consumes
- **[Rule Builder](../rule_builder/README.md)** - Rule definition system used in generated worlds
- **[Universal Tracker Enhancements](../docs/json/features/universal-tracker.md)** - Tracking modes that use generated worlds
- **[CLAUDE.md](../CLAUDE.md)** - Quick reference with common commands

## Example Workflow

1. **Export rules** from an existing world:
   ```bash
   python Generate.py --weights_file_path "Templates/TUNIC.yaml" --multi 1 --seed 1
   ```

2. **Generate a worldgen world**:
   ```bash
   python -m world_generator frontend/presets/tunic/AP_14089154938208861744/AP_14089154938208861744_rules.json \
       -o worlds/tunic_worldgen \
       --game-name "TUNIC WorldGen" \
       --canonical-seed 1
   ```

3. **Create templates** for the new world:
   ```bash
   python -c "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"
   ```

4. **Test the generated world**:
   ```bash
   python scripts/test/test-all-templates.py --include-list "TUNIC WorldGen.yaml" -p
   ```
