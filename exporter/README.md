# Exporter

The exporter converts Archipelago game logic — Python rules, regions, items, locations, and options — into JSON files that the [web frontend](../frontend/README.md) uses for item tracking and logic visualization. It is the bridge between Archipelago's Python-based randomizer and the browser-based tracker.

## How It Works

During seed generation (`python Generate.py ...`), Archipelago builds an in-memory `MultiWorld` object containing all the game logic: which items exist, which locations are available, what rules govern access, and how regions connect. The exporter hooks into this process (via the `json_tools_installer` post-output hook) and converts that Python object graph into JSON.

The core of this conversion is **rule analysis**: Python access-rule functions (lambdas like `lambda state: state.has('Sword')`) are decompiled via AST analysis into a portable JSON representation (e.g., `{"type": "has", "args": ["Sword"]}`). Game-specific handlers customize the export for each of the 43+ supported games.

The exporter produces two main output formats:
- **Rules JSON** — A complete JSON export of rules, regions, items, locations, and options. Available in Rule Builder format (default) or Archipelago-CC AST format.
- **Pickle** — A compressed `dill` pickle of the entire `MultiWorld` object, preserving lambdas and closures directly. Faster to load since no regeneration is needed.

## Usage

The exporter runs automatically during seed generation when enabled in `host.yaml`. No manual invocation is needed for normal use.

### Enabling Export

Configure which exports to produce in `host.yaml` under `json_tools`:

```yaml
json_tools:
  save_rules_json: true           # Export rules as JSON
  rules_json_format: "rule_builder" # "rule_builder", "ast", or "both"
  save_tracker_pickle: true       # Export multiworld as pickle
  update_frontend_presets: true   # Copy exports to frontend/presets/
  save_sphere_log: true           # Export sphere log (playthrough data)
```

Or use a preset to configure common combinations:

```bash
python scripts/setup/update_host_settings.py full-spoilers    # enables rules JSON + sphere log
python scripts/setup/update_host_settings.py ut-pickle         # enables pickle export
```

### Running Seed Generation

Once configured, just run seed generation as normal:

```bash
python Generate.py --weights_file_path "Templates/GameName.yaml" --multi 1 --seed 1
```

The exporter runs automatically after generation completes. Output goes to the same directory as other seed files, and optionally copies to `frontend/presets/` for the web tracker.

### Programmatic Use

```python
from exporter import export_game_rules

# Export rules for a generated multiworld
export_game_rules(
    multiworld,
    output_dir="frontend/presets/",
    filename_base="rules",
    rules_json_format="rule_builder"  # or "ast" or "both"
)
```

## Pickle Export

The pickle exporter provides an alternative export format that preserves the multiworld object directly, including lambdas and closures in access rules. This is faster than JSON-based worldgen tracking since no regeneration is needed.

```python
from exporter import export_multiworld_pickle

# Export multiworld as pickle for tracker use
export_multiworld_pickle(
    multiworld,
    output_dir="frontend/presets/game/AP_seed/",
    filename_base="AP_seed",
    save_presets=True
)
```

### Output Files

| File | Description |
|------|-------------|
| `{filename_base}.pkl.gz` | Gzip-compressed dill pickle of the multiworld |
| `{filename_base}_pickle_meta.json` | JSON metadata for discovery and validation |

### Metadata Format

The metadata JSON contains:
- `schema_version`: Metadata format version
- `archipelago_version`: Archipelago version used for generation
- `generation_seed`: Numeric seed value
- `seed_name`: Seed name string (e.g., "14089154938208861744")
- `players`: Per-player info (name, game, world_directory)

### Settings

Enable pickle export in `host.yaml`:

```yaml
general_options:
  save_tracker_pickle: true
```

Or use the `ut-pickle` preset:

```bash
python scripts/setup/update_host_settings.py ut-pickle
```

### Loading Pickles

```python
from exporter import load_multiworld_pickle, find_pickle_for_seed

# Load directly from path
multiworld = load_multiworld_pickle("path/to/AP_seed.pkl.gz")

# Find and load by seed name
pickle_path = find_pickle_for_seed("14089154938208861744", game_directory="adventure")
if pickle_path:
    multiworld = load_multiworld_pickle(pickle_path)
```

### Requirements

Pickle export requires the `dill` library for serializing lambdas:

```
dill>=0.3.8
```

## Directory Structure

```
exporter/
├── exporter.py              # Main export orchestrator
├── pickle_exporter.py       # Pickle-based multiworld export
├── constants.py             # Safety limits & configuration
├── sphere_logger.py         # Sphere tracking during generation
├── profiling.py             # Performance profiling
│
├── analyzer/                # Python → JSON rule conversion
│   ├── analysis.py          # Main entry point: analyze_rule()
│   ├── rule_analyzer.py     # Core AST visitor (RuleAnalyzer)
│   ├── expression_resolver.py
│   ├── cache.py
│   └── ast_visitors/        # Modular AST node handlers
│
├── converter/               # Bidirectional format conversion
│   ├── cli.py               # Command-line interface
│   ├── python_to_json.py    # Python → JSON
│   ├── json_to_python.py    # JSON → Python
│   ├── ast_to_rule_builder.py
│   └── rule_builder_to_ast.py
│
└── games/                   # Game-specific handlers (43 games)
    ├── generic.py           # GenericGameExportHandler (default)
    ├── base/                # Base classes & mixins
    └── [game handlers]      # alttp.py, sm.py, witness.py, etc.
```

## Key Components

### Analyzer (`analyzer/`)

Converts Python rule functions to JSON rule trees using AST analysis.

```python
from exporter.analyzer import analyze_rule

# Analyze a rule function
rule_dict = analyze_rule(
    rule_func=lambda state: state.has('Sword'),
    game_handler=handler,
    player_context=1
)
# Result: {"type": "has", "args": ["Sword"]}
```

**Key files:**
- `analysis.py` - Main API entry point
- `rule_analyzer.py` - `RuleAnalyzer` class that traverses Python AST
- `ast_visitors/` - Modular visitors for different AST node types

### Converter (`converter/`)

Bidirectional conversion between rule formats.

```bash
# CLI usage
python -m exporter.converter input.json -o output.json --format cc
python -m exporter.converter --python "state.has('Sword')" --to-json
```

**Supported conversions:**
- Python code ↔ Archipelago-CC JSON format
- Archipelago-CC ↔ Rule Builder format

See `converter/README.md` for detailed usage.

### Game Handlers (`games/`)

Game-specific export customization. Each game can have a handler that:
- Defines which helpers to export
- Customizes option handling
- Provides game-specific rule transformations

```python
from exporter.games import get_game_export_handler

# Get handler for a world (falls back to GenericGameExportHandler)
handler = get_game_export_handler(world=my_world)
```

**Creating a custom handler:**

```python
from exporter.games.generic import GenericGameExportHandler

class MyGameHandler(GenericGameExportHandler):
    GAME_NAME = "My Game"
    HELPER_MODULES = ['worlds.mygame.rules']
    EXPORTED_OPTIONS = ['difficulty', 'starting_items']
    AUTO_EXPORT_DISCOVERED_HELPERS = True
```

**43 game handlers available** including:
- `alttp.py` - A Link to the Past (complex bunny/glitch modes)
- `sm.py` - Super Metroid
- `witness.py` - The Witness
- `tunic.py` - TUNIC
- And 39 more...

## Configuration

### Handler Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `GAME_NAME` | World class name | Display name for the game |
| `HELPER_MODULES` | `[]` | Modules containing helper functions |
| `EXPORTED_OPTIONS` | `[]` | Game options to include in export |
| `AUTO_EXPORT_DISCOVERED_HELPERS` | `True` | Auto-export discovered helpers |
| `EXPORT_CHOICE_OPTIONS_AS_NUMERIC` | `True` | Export choices as numbers vs strings |
| `HELPERS_TO_EXPORT_WHITELIST` | `set()` | Explicitly export these helpers |
| `HELPERS_TO_EXPORT_BLACKLIST` | `set()` | Never export these helpers |

### Safety Limits (`constants.py`)

| Constant | Default | Purpose |
|----------|---------|---------|
| `MAX_ANALYZE_RULE_CALLS` | 10000 | Prevent infinite loops |
| `MAX_ANALYZER_OPERATIONS` | 5000 | Limit AST visits per rule |
| `MAX_RULE_EXPANSION_DEPTH` | 100 | Prevent circular helper references |
| `MAX_RULE_SIZE_KB` | 100 | Flag unusually large rules |

## Base Classes & Mixins

The handler system uses composition via mixins:

- **`BaseGameExportHandler`** - Core class with configuration
- **`GenericGameExportHandler`** - Recommended base with intelligent defaults
- **`RuleExpansionMixin`** - Recursive helper expansion
- **`WorldDataMixin`** - Extract world data (items, regions, options)
- **`HelperDiscoveryMixin`** - Auto-discover helper functions
- **`OptionNormalizationMixin`** - Convert options to export format

## World Attribute Auto-Discovery

When `AUTO_DISCOVER_WORLD_ATTRIBUTES` is `True` (the default), the exporter automatically exports simple instance attributes from the world object into the `world.{player}` section of the JSON. This includes dicts, lists, strings, numbers, and booleans set on the world during generation.

One notable use of this is **name substitutions**: if a world sets `self.name_substitutions` (a dict mapping generic names to meaningful names), the exporter includes it in the JSON. The [world generator](../world_generator/README.md#name-substitutions) then applies these substitutions before extraction, so WorldGen worlds get meaningful item/location/region names automatically.

## Output Format

The exporter produces JSON files containing:

- **`rules`** - Location access rules as JSON AST
- **`regions`** - Region definitions and connections
- **`items`** - Item definitions and classifications
- **`locations`** - Location definitions
- **`options`** - Game option values
- **`helpers`** - Exported helper function definitions

## Related Documentation

- **[Format Converter](converter/README.md)** - Bidirectional conversion between Rule Builder and AST formats
- **[JSON Schema](../frontend/schema/README.md)** - Schema documentation for the rules files the exporter produces
- **[World Generator Guide](../docs/json/developer/guides/world-generator.md)** - Convert JSON back to Python worlds
- **[Testing Pipeline](../docs/json/developer/guides/testing-pipeline.md)** - How exports are validated
- **[Rule Types Reference](../docs/json/developer/reference/rule-types-reference.md)** - Supported rule types
- **[Handler Configuration Reference](../docs/json/developer/reference/handler-configuration.md)** - All handler class attributes
- **[State Method Transformations](../docs/json/developer/reference/state-method-transformations.md)** - How Python state calls become JSON
- **[Closure Function Analyzer](../docs/json/developer/reference/closure-function-analyzer.md)** - Closure analysis architecture
- **[Binary Operation Optimizations](../docs/json/developer/reference/binary-op-optimizations.md)** - Compile-time optimizations

## Development

### Running Tests

```bash
# Analyzer tests
python -m pytest exporter/analyzer/test_ast_visitors.py

# Converter tests
python -m pytest exporter/converter/
```

### Profiling

```python
from exporter.profiling import ExporterProfiler

with ExporterProfiler() as profiler:
    export_game_rules(multiworld, ...)

profiler.print_stats()
```
