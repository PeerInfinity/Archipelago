# World Generator

## Overview

The World Generator automates the process of converting a JSON rules file (exported from an Archipelago world) into a fully functional Archipelago world package. This enables a complete development workflow where game definitions can be created, edited, and converted back into working Python worlds.

## Quick Start

### Generate a World from JSON

```bash
# Basic usage - generate world to default location (worlds/{game_name}/)
python -m world_generator path/to/rules.json

# Specify output directory
python -m world_generator rules.json --output worlds/mygame/

# Force overwrite existing files
python -m world_generator rules.json --output worlds/mygame/ --force

# Dry run - see what would be generated without writing files
python -m world_generator rules.json --dry-run
```

### Test the Generated World

```bash
# Import test
python -c "from worlds.mygame import MyGameWorld; print('Success!')"

# Generate a seed
python Generate.py --weights_file_path "Templates/MyGame.yaml" --multi 1 --seed 1
```

## Complete Workflow Example

This example uses the Adventure world to demonstrate the full process.

### Step 1: Export JSON from an Existing World

First, generate a seed and export the rules to JSON using the exporter:

```bash
# Generate a seed for Adventure (assuming Adventure world exists)
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 1

# Export to JSON (via the frontend or exporter)
# This creates a file like: frontend/presets/adventure/AP_Adventure/AP_Adventure_rules.json
```

### Step 2: Generate World from JSON

```bash
# Generate the world package with a new game name (to avoid conflicts)
python -m world_generator \
    frontend/presets/adventure/AP_Adventure/AP_Adventure_rules.json \
    --output worlds/adventure_test/ \
    --game-name "Adventure Test"

# Expected output:
# INFO: Renamed game from 'Adventure' to 'Adventure Test'
# Created worlds/adventure_test/__init__.py
# Created worlds/adventure_test/Items.py
# Created worlds/adventure_test/Locations.py
# Created worlds/adventure_test/Regions.py
# Created worlds/adventure_test/Rules.py
# Created worlds/adventure_test/Options.py
# Generation complete!
```

The `--game-name` parameter automatically renames the game and updates all class names to avoid conflicts with the original world. Without this, you would get:
```
RuntimeError: Game Adventure already registered in worlds/adventure/__init__.py
```

### Step 3: Generate Template YAML

Generate a player template file for the new world:

```bash
python -c "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"
```

This creates `Players/Templates/Adventure Test.yaml` with all available options.

### Step 4: Test Generation

```bash
# Generate a seed with the new world
python Generate.py --weights_file_path "Templates/Adventure Test.yaml" --multi 1 --seed 1
```

## Generated File Structure

The generator creates a complete Archipelago world package:

```
worlds/{game_name}/
├── __init__.py      # Main world class with RuleWorldMixin
├── Items.py         # Item definitions and classifications
├── Locations.py     # Location definitions with region assignments
├── Regions.py       # Region structure and entrance connections
├── Rules.py         # Rule Builder access rules
└── Options.py       # Game options (randomize_items toggle)
```

### __init__.py

The main world class inherits from `RuleWorldMixin` to enable Rule Builder rules:

```python
from rule_builder import RuleWorldMixin
from worlds.AutoWorld import World

class MyGameWorld(RuleWorldMixin, World):
    game: ClassVar[str] = "My Game"

    # Disable rule caching (requires PR #5048 changes to CollectionState)
    rule_caching_enabled: ClassVar[bool] = False

    def set_rules(self) -> None:
        set_rules(self)  # Calls Rules.py
```

### Rules.py

Access rules use Rule Builder syntax for clean, readable logic:

```python
from rule_builder import True_, False_, Has

def set_rules(world) -> None:
    player = world.player
    multiworld = world.multiworld

    # Entrance rules
    world.set_rule(
        multiworld.get_entrance("Castle Door", player),
        Has("Castle Key")
    )

    world.set_rule(
        multiworld.get_entrance("Secret Passage", player),
        (Has("Hammer")) | (Has("Bombs"))
    )

    # Location rules
    world.set_rule(
        multiworld.get_location("Boss Reward", player),
        (Has("Sword")) & (Has("Shield"))
    )
```

## CLI Reference

```
usage: python -m world_generator [-h] [-o OUTPUT]
                                                     [--game-name NAME]
                                                     [--force] [--dry-run]
                                                     [--canonical-seed [N]] input

Generate Archipelago world from JSON rules file

positional arguments:
  input                 Path to JSON rules file

optional arguments:
  -h, --help            show this help message and exit
  -o OUTPUT, --output OUTPUT
                        Output directory (default: worlds/{game_name}/)
  --game-name NAME      Override the game name (to avoid conflicts)
  --force               Overwrite existing files
  --dry-run             Show what would be generated without writing files
  --canonical-seed [N]  Enable canonical placement for seed N (default: 1).
                        Places items in original locations when seed matches.
```

### Examples

```bash
# Generate to default location
python -m world_generator game_rules.json

# Generate with a new game name (to avoid conflicts with existing worlds)
python -m world_generator game_rules.json --game-name "My Game Test"

# Generate to specific directory
python -m world_generator game_rules.json -o worlds/my_game/

# Preview generation without writing
python -m world_generator game_rules.json --dry-run

# Overwrite existing world
python -m world_generator game_rules.json -o worlds/my_game/ --force

# Enable canonical placement for seed=1 (for testing/validation)
python -m world_generator game_rules.json --canonical-seed 1
```

## Python API

### Basic Usage

```python
from world_generator import WorldGenerator

# Create generator
generator = WorldGenerator(
    json_path="path/to/rules.json",
    output_dir="worlds/my_game/",
    game_name="My Game Test",  # Optional: override game name
    canonical_seed=None,       # Optional: enable canonical placement for seed N
)

# Generate all files
generator.generate()
```

### Accessing Extracted Data

```python
from world_generator import WorldGenerator

generator = WorldGenerator("rules.json", "worlds/my_game/")

# Access extracted game data
print(generator.data.metadata.game_name)
print(generator.data.metadata.world_class_name)

# List items
for item_name, item_data in generator.data.items.items():
    print(f"{item_name}: {item_data.classification}")

# List locations
for loc_name, loc_data in generator.data.locations.items():
    print(f"{loc_name} in {loc_data.region}")
```

## Rule Conversion

The generator converts Archipelago-CC AST format rules to Rule Builder Python code.

### Supported Conversions

| AST Rule Type | Generated Python |
|--------------|------------------|
| `{"type": "constant", "value": true}` | `True_()` |
| `{"type": "constant", "value": false}` | `False_()` |
| `{"type": "item_check", "item": "X"}` | `Has("X")` |
| `{"type": "item_check", "item": "X", "count": N}` | `Has("X", N)` |
| `{"type": "and", "conditions": [...]}` | `(cond1) & (cond2)` |
| `{"type": "or", "conditions": [...]}` | `(cond1) \| (cond2)` |
| `{"type": "can_reach", "region": "X"}` | `CanReachRegion("X")` |
| `{"type": "location_check", "location": "X"}` | `CanReachLocation("X")` |
| `{"type": "can_reach_entrance", "entrance": "X"}` | `CanReachEntrance("X")` |
| `{"type": "group_check", "group": "X"}` | `HasGroup("X")` |
| `{"type": "state_method", "method": "has_all", ...}` | `HasAll([...])` |
| `{"type": "state_method", "method": "has_any", ...}` | `HasAny([...])` |

### Example Conversion

**Input JSON:**
```json
{
  "access_rule": {
    "type": "and",
    "conditions": [
      {"type": "item_check", "item": "Sword"},
      {"type": "or", "conditions": [
        {"type": "item_check", "item": "Bow"},
        {"type": "item_check", "item": "Bombs", "count": 3}
      ]}
    ]
  }
}
```

**Generated Python:**
```python
world.set_rule(
    multiworld.get_location("Boss Room", player),
    (Has("Sword")) & ((Has("Bow")) | (Has("Bombs", 3)))
)
```

## Item Classification Mapping

The generator maps JSON item flags to Archipelago classifications:

| JSON Fields | Python Classification |
|-------------|----------------------|
| `advancement: true` | `ItemClassification.progression` |
| `useful: true` | `ItemClassification.useful` |
| `trap: true` | `ItemClassification.trap` |
| `id: null` (event items) | `ItemClassification.progression` |
| Default | `ItemClassification.filler` |

## Seed 1 Behavior (Canonical Placement)

By default, generated worlds always randomize items. However, you can enable "canonical placement" mode using the `--canonical-seed` flag:

```bash
python -m world_generator game_rules.json --canonical-seed 1
```

When this flag is enabled, the generated world will:

- Automatically set `randomize_items` to `false` when seed is 1
- Place items in their original locations (as defined in JSON)
- This is useful for testing that the world matches the original source

The generated code includes:

```python
def generate_early(self) -> None:
    if self.multiworld.seed == 1:
        self.options.randomize_items.value = False
```

Without the `--canonical-seed` flag, the generated world simply creates a randomized item pool for all seeds.

## Name Substitutions

### The Problem

Some Archipelago worlds must use generic names at the class level. For example, the Metamath world registers `"Statement 1"` through `"Statement 1000"` in its class-level `item_name_to_id` because the actual theorem labels aren't known until `generate_early()` runs — and the datapackage contract requires those dicts to be fixed at class definition time.

These generic names work fine for the original world, but when the world generator creates a *new* WorldGen world from the exported JSON, it creates its own datapackage and can use any names it wants. Meaningful names like `"2cn: |- 2 e. CC"` are far more readable than `"Statement 1"`.

### How It Works

The solution has two parts:

**1. The source world publishes `name_substitutions`**

In `generate_early()`, the world builds a dict mapping generic → meaningful names and stores it as an instance attribute:

```python
from .Items import statement_item_name
from .Locations import statement_location_name

# In generate_early(), after building the proof structure:
self.name_substitutions = {"items": {}, "locations": {}, "regions": {}}
for i, stmt in self.proof_structure.statements.items():
    generic_item = f"Statement {i}"
    generic_loc = f"Prove Statement {i}"
    meaningful_item = statement_item_name(stmt.label, stmt.expression)
    meaningful_loc = statement_location_name(stmt.label, stmt.expression)
    if generic_item != meaningful_item:
        self.name_substitutions["items"][generic_item] = meaningful_item
    if generic_loc != meaningful_loc:
        self.name_substitutions["locations"][generic_loc] = meaningful_loc
        self.name_substitutions["regions"][generic_loc] = meaningful_loc
```

The exporter auto-discovers this attribute (via `AUTO_DISCOVER_WORLD_ATTRIBUTES`) and includes it in the rules JSON under `world.1.name_substitutions`.

**2. The world generator applies substitutions before extraction**

In `WorldGenerator.load()`, before `extract_all()` processes the JSON, `apply_name_substitutions()` replaces every occurrence of each generic name with its meaningful counterpart. This is done at the raw JSON level so all downstream code — extractors, rule codegen, templates — automatically gets correct names.

### What Gets Substituted

The function walks these JSON sections:

| Section | Item names | Location names | Region names |
|---------|-----------|----------------|--------------|
| `items.{player}` | dict keys | — | — |
| `regions.{player}.*.locations[].name` | — | location names | — |
| `regions.{player}.*.locations[].item.name` | placed items | — | — |
| `regions.{player}.*.locations[].access_rule` | rule args | — | — |
| `regions.{player}.*.exits[].access_rule` | rule args | — | — |
| `regions.{player}.*.exits[].connected_region` | — | — | region refs |
| `regions.{player}` (keys) | — | — | dict keys |
| `canonical_placements.{player}` | values | keys | — |
| `starting_items.{player}` | list items | — | — |
| `itempool_counts.{player}` | dict keys | — | — |
| `game_info.{player}.completion_condition.item` | item name | — | — |
| `progression_mapping.{player}` | keys + values | — | — |
| `world.{player}.canonical_placements` | values | keys | — |
| `world.{player}.location_dependencies` | value lists | keys | — |
| `world.{player}.entrance_dependencies` | value lists | — | — |
| `world.{player}.exit_dependencies` | value lists | — | — |

Inside access rules, the function recursively walks the rule tree and substitutes item names in `args.item_name` (used by `Has`, `CountItem`), `args.items` (used by `HasAll`, `HasAny`, `CountFromList`), and `args.item` fields. Compound rules (`And`, `Or`, `Not`, `Compare`) are traversed recursively.

After applying substitutions, the `name_substitutions` key is removed from the world section so it doesn't appear as a world attribute in the generated code.

### Result

Without name substitutions, the generated Metamath WorldGen code looks like:

```python
# Rules.py
world.set_rule(
    multiworld.get_entrance("From 2cn to addassi", player),
    HasAll('Statement 1', 'Statement 2')
)
```

With name substitutions applied:

```python
# Rules.py
world.set_rule(
    multiworld.get_entrance("From 2cn to addassi", player),
    HasAll('2cn: |- 2 e. CC', 'ax-1cn: |- 1 e. CC')
)
```

### When to Use This

Name substitutions are useful when a world:
- Uses generic/numbered names at the class level due to datapackage constraints
- Has meaningful names available at runtime (e.g. from parsing game data)
- Wants WorldGen worlds to use those meaningful names instead

The pattern is general-purpose — any world can publish `name_substitutions` and the world generator will apply them automatically.

## Rule Caching

Generated worlds have rule caching disabled by default:

```python
rule_caching_enabled: ClassVar[bool] = False
```

This is required because the Rule Builder's caching system uses `CollectionState.rule_builder_cache`, which is added by [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) but isn't present in the base Archipelago codebase. Disabling caching ensures compatibility.

## Troubleshooting

### Import Errors

**Problem:** `ModuleNotFoundError: No module named 'rule_builder'`

**Solution:** Ensure the `rule_builder` module is in your Python path. It should be at the repository root level.

### Game Name Conflicts

**Problem:** `Exception: Game 'MyGame' already registered by module...`

**Solution:** Rename the game in the JSON file before generation, or use the `--output` flag to generate to a different directory with a modified game name in `__init__.py`.

### Rule Syntax Errors

**Problem:** Generated rules have syntax errors

**Solution:** Check if the source JSON contains unsupported rule types. The generator logs warnings for rules it can't fully convert. Complex rules may need manual adjustment.

### CollectionState Missing rule_builder_cache

**Problem:** `AttributeError: 'CollectionState' object has no attribute 'rule_builder_cache'`

**Solution:** Ensure the generated world has `rule_caching_enabled = False` in the world class. This is set by default in the generator.

## Limitations

1. **Complex Rules:** Some advanced rule patterns (custom helpers, complex conditionals) may not convert perfectly and require manual adjustment.

2. **Game-Specific Logic:** The generator creates a basic world structure. Game-specific features (ROM patching, client integration) need to be added manually.

3. **Victory Conditions:** The generator attempts to detect victory locations/items from the JSON, but complex victory conditions may need manual setup.

4. **Options:** Currently only generates a basic `randomize_items` toggle. Additional game options need to be added manually.

## Related Documentation

- [Rule Format Converter](./format-converter.md) - Converting between CC and Rule Builder JSON formats
- [Rule Builder README](../../../../rule_builder/README.md) - Rule Builder syntax and usage

## Module Location

The world generator is located at:

```
world_generator/
├── __init__.py      # Module exports
├── __main__.py      # Entry point for python -m
├── generator.py     # Main WorldGenerator class
├── extractors.py    # JSON data extraction
├── rule_codegen.py  # CC rules → Python code generation
├── templates.py     # File content templates
└── cli.py           # Command-line interface
```
