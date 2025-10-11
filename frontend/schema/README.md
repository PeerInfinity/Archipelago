# Archipelago JSON Schema Documentation

This directory contains JSON Schema files for validating Archipelago rules export files.

## Schema Files

### `rules.schema.json`
The **generic base schema** that defines the structure for all Archipelago games. This includes:
- Standard fields like `schema_version`, `game_name`, `archipelago_version`, etc.
- Region structure with entrances, exits, and locations
- Item definitions and groups
- Dungeon structure with bosses
- Access rule format
- Settings framework

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

## Validation

### Install jsonschema (required):
```bash
pip install jsonschema
```

### Validate against generic schema:
```bash
python3 -c "
import json
import jsonschema

with open('frontend/schema/rules.schema.json') as f:
    schema = json.load(f)
with open('path/to/rules.json') as f:
    data = json.load(f)
jsonschema.validate(instance=data, schema=schema)
"
```

### Validate against game-specific schema:
```bash
python3 -c "
import json
import jsonschema
from jsonschema import RefResolver
import os

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
        "settings": {
          "type": "object",
          "patternProperties": {
            "^[0-9]+$": {
              "type": "object",
              "properties": {
                "game": { "const": "{Exact Game Name}" },
                // Add game-specific settings here with proper types/enums
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
