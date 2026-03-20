# Archipelago JSON Schema Documentation

This directory contains JSON Schema files for validating Archipelago rules export files.

## Schema Files

### `rules.schema.json`
The **generic base schema** that defines the structure for all Archipelago games. This includes:
- Standard fields like `schema_version`, `game_name`, `archipelago_version`, `seed_name`, etc.
- Region structure with entrances, exits, and locations
- Item definitions with `classification` string (current) or legacy `advancement`/`useful`/`trap` booleans
- Dungeon structure with bosses
- Access rules in both **Rule Builder** and **AST** formats (see [Rule Formats](#rule-formats))
- World metadata, exporter settings, and game-specific info
- Helper function definitions
- Canonical placements for deterministic seed generation

This schema validates any rules.json file from any supported Archipelago game.

### `rules-alttp.schema.json`
The **ALTTP-specific schema** that extends the base schema with game-specific constraints and fields:
- Enforces `game_name` must be "A Link to the Past"
- Adds ALTTP-specific settings with proper enums (mode, dark_room_logic, etc.)
- Adds region attributes (`is_light_world`, `is_dark_world`)
- Adds location attributes (`crystal` for dungeon prizes)
- Validates medallion requirements and crystal counts

## Schema Composition Strategy

Game-specific schemas use JSON Schema's `allOf` to extend the base schema without duplication:

```json
{
  "allOf": [
    { "$ref": "rules.schema.json" },
    {
      "type": "object",
      "properties": {
        // Game-specific overrides and additions
      }
    }
  ]
}
```

This approach provides:
- **No duplication**: Common structure defined once in base schema
- **Layered validation**: Base schema + game-specific constraints
- **Easy maintenance**: Update base schema affects all games
- **Strict validation**: Game schemas can enforce specific values (like `const` for game name)

## Rule Formats

The schema supports two rule formats via `oneOf` in the `rule` definition. All current exports use Rule Builder format; AST format is retained for compatibility with the AST export option.

### Rule Builder format (current)

Rules have a `rule` field naming the rule type, with optional `args` and `children`:

```json
{"rule": "True_"}
{"rule": "Has", "args": {"item_name": "Flippers"}}
{"rule": "And", "children": [
  {"rule": "Has", "args": {"item_name": "Hookshot"}},
  {"rule": "CanReachRegion", "args": {"region_name": "Dark World"}}
]}
```

Built-in rule types include `True_`, `False_`, `Has`, `HasAll`, `HasAny`, `HasGroup`, `HasAllCounts`, `CountItem`, `And`, `Or`, `CanReachRegion`, `CanReachLocation`, `OptionValue`, `Compare`, `Conditional`, `Constant`. Games also define their own helper rules with arbitrary names (e.g., `can_use_hookshot`, `has_sword`).

Rules converted from AST format include metadata fields `_original_ast_type` and `_converted_from_ast`.

### AST format (legacy)

Rules have a `type` field describing the AST node type:

```json
{"type": "constant", "value": true}
{"type": "item_check", "item": "Flippers"}
{"type": "and", "conditions": [
  {"type": "item_check", "item": "Hookshot"},
  {"type": "can_reach", "region": "Dark World"}
]}
```

See `$defs/astRule` in the schema for the full set of AST properties.

## Validation

### Automated test

The schema is validated against all exported rules.json files by:

```bash
python -m pytest test/general/test_schema_validation.py -v
```

This validates every file in `frontend/presets/*/AP_*/AP_*_rules.json` against the schema. The test requires the `jsonschema` package (`pip install jsonschema`) and is skipped if it's not installed.

### Manual validation

Validate a single file against the generic schema:
```bash
python3 -c "
import json, jsonschema

with open('frontend/schema/rules.schema.json') as f:
    schema = json.load(f)
with open('path/to/rules.json') as f:
    data = json.load(f)
jsonschema.validate(instance=data, schema=schema)
"
```

Validate against a game-specific schema:
```bash
python3 -c "
import json, jsonschema, os
from jsonschema import RefResolver

schema_dir = 'frontend/schema'
with open(os.path.join(schema_dir, 'rules-alttp.schema.json')) as f:
    schema = json.load(f)
resolver = RefResolver(
    base_uri=f'file://{os.path.abspath(schema_dir)}/',
    referrer=schema
)
with open('path/to/alttp_rules.json') as f:
    data = json.load(f)
jsonschema.validate(instance=data, schema=schema, resolver=resolver)
"
```

## Creating New Game Schemas

To create a schema for a new game:

1. **Examine the game's exporter** (`exporter/games/{game}.py`) to identify:
   - Game-specific settings and their types/enums
   - Additional region attributes
   - Additional location attributes
   - Any game-specific top-level fields

2. **Create `rules-{game}.schema.json`** following this template:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "rules-{game}.schema.json",
  "title": "{Game Name} Archipelago Rules JSON Schema",
  "description": "Game-specific schema extending the generic Archipelago rules schema",
  "allOf": [
    {
      "$ref": "rules.schema.json"
    },
    {
      "type": "object",
      "properties": {
        "game_name": {
          "const": "{Exact Game Name}",
          "description": "Game name must match exactly"
        },
        "game_directory": {
          "const": "{game_dir}",
          "description": "Game directory name"
        },
        "world": {
          "type": "object",
          "patternProperties": {
            "^[0-9]+$": {
              "type": "object",
              "properties": {
                "game": { "const": "{Exact Game Name}" }
                // Add game-specific world properties here
              },
              "required": ["game"]
            }
          }
        },
        "regions": {
          "type": "object",
          "patternProperties": {
            "^[0-9]+$": {
              "type": "object",
              "patternProperties": {
                "^.*$": {
                  "allOf": [
                    { "$ref": "rules.schema.json#/$defs/region" },
                    {
                      "type": "object",
                      "properties": {
                        // Add game-specific region attributes
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

3. **Test validation** against actual generated rules files
4. **Document** any game-specific constraints or fields

## Key Design Decisions

### Why inline instead of `$defs`?
Initially we tried using `$defs` to avoid repetition within the game schema, but encountered issues with `$ref` resolution paths when definitions are nested inside `allOf` blocks. Inlining properties is simpler and more maintainable for game-specific extensions.

### Why `allOf` instead of just extending?
JSON Schema doesn't have inheritance. `allOf` provides composition: the instance must satisfy ALL schemas in the array. This allows us to:
1. Validate against the base schema (ensuring structural correctness)
2. Add additional constraints (like `const` values for game name)
3. Add new properties specific to the game

### Handling `$ref` across files
The `RefResolver` is needed when schemas reference other schema files. Always use absolute URIs with `file://` protocol and the schema directory path.
