# Rule Format Converter

## Overview

The `exporter/converter` module provides bidirectional conversion between two Archipelago rule JSON formats:

- **AST format** - The AST-based rule representation used by this repository
- **Rule Builder format** - The declarative rule format from [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048)

This converter enables interoperability between the two systems and supports lossless round-trip conversion for compatible rule types.

## Quick Start

### Command Line Usage

```bash
# Auto-detect format and convert to opposite
python -m exporter.converter input.json -o output.json

# Explicitly convert Rule Builder -> AST
python -m exporter.converter input.json -o output.json --format cc

# Explicitly convert AST -> Rule Builder
python -m exporter.converter input.json -o output.json --format rb

# Verbose output with warnings
python -m exporter.converter input.json -o output.json -v

# Output to stdout
python -m exporter.converter input.json --format cc
```

### Python API

```python
from exporter.converter import (
    convert_rule_builder_to_cc,
    convert_cc_to_rule_builder,
    convert_rules_file_to_cc,
    convert_rules_file_to_rule_builder,
)

# Convert a single rule
cc_rule, warnings = convert_rule_builder_to_cc(rule_builder_json)
rb_rule, warnings = convert_cc_to_rule_builder(cc_json)

# Convert an entire rules file
cc_data, warnings = convert_rules_file_to_cc(rule_builder_file_data)
rb_data, warnings = convert_rules_file_to_rule_builder(cc_file_data)
```

## Format Comparison

### AST Format

Rules use a `type` field to identify the rule kind:

```json
{
  "type": "item_check",
  "item": "Sword",
  "count": 2
}
```

```json
{
  "type": "and",
  "conditions": [
    {"type": "item_check", "item": "Key"},
    {"type": "can_reach", "region": "Castle"}
  ]
}
```

### Rule Builder Format

Rules use a `rule` field with the class name, plus `options` and `args`/`children`:

```json
{
  "rule": "Has",
  "options": [],
  "args": {"item_name": "Sword", "count": 2}
}
```

```json
{
  "rule": "And",
  "options": [],
  "children": [
    {"rule": "Has", "options": [], "args": {"item_name": "Key"}},
    {"rule": "CanReachRegion", "options": [], "args": {"region_name": "Castle"}}
  ]
}
```

## Supported Conversions

### Fully Bidirectional (Lossless Round-Trip)

| AST | Rule Builder | Description |
|----------------|--------------|-------------|
| `constant` (true) | `True_` | Boolean true |
| `constant` (false) | `False_` | Boolean false |
| `item_check` | `Has` | Item requirement |
| `group_check` | `HasGroup` | Item group requirement |
| `and` | `And` | Logical AND |
| `or` | `Or` | Logical OR |
| `can_reach` | `CanReachRegion` | Region reachability |
| `location_check` | `CanReachLocation` | Location reachability |
| `can_reach_entrance` | `CanReachEntrance` | Entrance reachability |

### State Method Mappings

| AST `state_method` | Rule Builder |
|-------------------------------|--------------|
| `has_all` | `HasAll` |
| `has_any` | `HasAny` |
| `has_all_counts` | `HasAllCounts` |
| `has_from_list` | `HasFromList` |
| `has_from_list_unique` | `HasFromListUnique` |
| `has_group_unique` | `HasGroupUnique` |

### Partial/Preserved Conversions

Some rule types don't have direct equivalents. These are preserved with metadata for potential round-trip:

| AST | Conversion Notes |
|----------------|------------------|
| `not` | Preserved as custom `Not` rule (no RB equivalent) |
| `helper` | Preserved as custom rule with original data |
| `compare` | Preserved as `Compare` custom rule |
| `binary_op` | Preserved as `BinaryOp` custom rule |
| `conditional` | May convert to `options` filter if pattern matches |
| `attribute` | Preserved as custom rule |

| Rule Builder | Conversion Notes |
|--------------|------------------|
| `options` filters | Converted to `conditional` wrapper |
| Custom/unknown rules | Converted to `helper` with metadata |

## CLI Reference

```
usage: python -m exporter.converter [-h] [-o OUTPUT] [-f {cc,rb}]
                                     [--indent INDENT] [-v] input

Convert between Archipelago rule JSON formats

positional arguments:
  input                 Input JSON file path

optional arguments:
  -h, --help            show this help message and exit
  -o OUTPUT, --output OUTPUT
                        Output JSON file path (default: stdout)
  -f {cc,rb}, --format {cc,rb}
                        Target format (default: auto-detect and convert)
  --indent INDENT       JSON indentation (default: 2, use 0 for compact)
  -v, --verbose         Print warnings and progress information
```

### Examples

```bash
# Convert a Rule Builder file to AST format
python -m exporter.converter rules_rb.json -o rules_cc.json --format cc

# Convert with verbose output to see all warnings
python -m exporter.converter rules.json -o converted.json -v

# Compact output (no indentation)
python -m exporter.converter rules.json -o compact.json --indent 0

# Pipe output to another tool
python -m exporter.converter rules.json --format rb | jq '.regions'
```

## Python API Reference

### Single Rule Conversion

```python
from exporter.converter import convert_rule_builder_to_cc, convert_cc_to_rule_builder

# Rule Builder -> AST
rb_rule = {
    "rule": "Has",
    "options": [],
    "args": {"item_name": "Sword", "count": 2}
}
cc_rule, warnings = convert_rule_builder_to_cc(rb_rule)
# Result: {"type": "item_check", "item": "Sword", "count": 2}

# AST -> Rule Builder
cc_rule = {
    "type": "and",
    "conditions": [
        {"type": "item_check", "item": "Key"},
        {"type": "can_reach", "region": "Castle"}
    ]
}
rb_rule, warnings = convert_cc_to_rule_builder(cc_rule)
# Result: {"rule": "And", "options": [], "children": [...]}
```

### Full File Conversion

```python
from exporter.converter import convert_rules_file_to_cc, convert_rules_file_to_rule_builder
import json

# Load a Rule Builder format file
with open('rules_rb.json') as f:
    rb_data = json.load(f)

# Convert entire file structure
cc_data, warnings = convert_rules_file_to_cc(rb_data)

# Check warnings
if warnings:
    print(f"Conversion produced {len(warnings)} warnings:")
    for w in warnings:
        print(f"  - {w}")

# Save result
with open('rules_cc.json', 'w') as f:
    json.dump(cc_data, f, indent=2)
```

### Using Converter Classes Directly

For more control, use the converter classes directly:

```python
from exporter.converter import RuleBuilderToCC, CCToRuleBuilder

# Rule Builder -> CC
converter = RuleBuilderToCC()
result = converter.convert(rule)
if result.success:
    print(result.rule)
else:
    print(f"Errors: {result.errors}")
print(f"Warnings: {result.warnings}")

# CC -> Rule Builder
converter = CCToRuleBuilder()
result = converter.convert(rule)
# Same interface
```

## Round-Trip Conversion

Both converters preserve metadata to enable lossless round-trip conversions where possible.

### B → A → B (Rule Builder → CC → Rule Builder)

```python
# Original Rule Builder rule
original = {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}

# Convert to AST format
cc_rule, _ = convert_rule_builder_to_cc(original)
# {"type": "item_check", "item": "Sword"}

# Convert back to Rule Builder
restored, _ = convert_cc_to_rule_builder(cc_rule)
# {"rule": "Has", "options": [], "args": {"item_name": "Sword"}}

assert original == restored  # True for supported types
```

### A → B → A (CC → Rule Builder → CC)

```python
# Original CC rule
original = {"type": "item_check", "item": "Sword", "count": 2}

# Convert to Rule Builder
rb_rule, _ = convert_cc_to_rule_builder(original)
# {"rule": "Has", "options": [], "args": {"item_name": "Sword", "count": 2}}

# Convert back to CC
restored, _ = convert_rule_builder_to_cc(rb_rule)
# {"type": "item_check", "item": "Sword", "count": 2}

assert original == restored  # True for supported types
```

### Metadata Preservation

For rules that don't have direct equivalents, metadata is preserved:

```python
# CC helper rule (no direct RB equivalent)
cc_helper = {
    "type": "helper",
    "name": "canSwim",
    "args": [{"type": "constant", "value": 5}]
}

# Converted to RB with metadata
rb_result, warnings = convert_cc_to_rule_builder(cc_helper)
# {
#     "rule": "canSwim",
#     "options": [],
#     "args": {...},
#     "_converted_from_cc": True
# }

# When converted back, original structure is restored
cc_restored, _ = convert_rule_builder_to_cc(rb_result)
# Original helper structure preserved
```

## Option Filters

Rule Builder supports `options` arrays for conditional rule application. These are converted to/from `conditional` rules in AST format.

### Rule Builder with Options

```json
{
  "rule": "Has",
  "options": [
    {"option": "Difficulty", "op": "ge", "value": 2}
  ],
  "args": {"item_name": "Armor"}
}
```

### Converted to AST Format

```json
{
  "type": "conditional",
  "test": {
    "type": "compare",
    "left": {
      "type": "attribute",
      "object": {"type": "name", "name": "options"},
      "attr": "Difficulty"
    },
    "op": ">=",
    "right": {"type": "constant", "value": 2}
  },
  "if_true": {"type": "item_check", "item": "Armor"},
  "if_false": {"type": "constant", "value": true}
}
```

## Handling Warnings

Both conversion directions may produce warnings for rules that can't be perfectly converted:

```python
from exporter.converter import convert_cc_to_rule_builder

# Complex CC rule with no direct RB equivalent
cc_rule = {
    "type": "compare",
    "left": {"type": "attribute", "object": {...}, "attr": "count"},
    "op": ">=",
    "right": {"type": "constant", "value": 10}
}

rb_rule, warnings = convert_cc_to_rule_builder(cc_rule)

# warnings might contain:
# ["Compare expression preserved as custom rule"]
```

Common warning messages:

| Warning | Meaning |
|---------|---------|
| `Unknown rule type 'X' converted to helper` | RB rule has no direct CC equivalent |
| `Helper 'X' preserved as custom rule` | CC helper has no direct RB equivalent |
| `'not' rule has no direct Rule Builder equivalent` | Negation preserved as custom |
| `Compare expression preserved as custom rule` | Comparison operation preserved |
| `Complex conditional preserved as custom rule` | Non-standard conditional pattern |

## File Structure Support

The converter handles full rule file structures, converting `access_rule` fields within:

- `regions[player][region].exits[].access_rule`
- `regions[player][region].entrances[].access_rule`
- `regions[player][region].locations[].access_rule`
- `regions[player][region].locations[].item_rule`
- `dungeons[player][dungeon].medallion_check`
- `dungeons[player][dungeon].bosses[].defeat_rule`

Other parts of the file structure (items, item_groups, metadata) are preserved unchanged.

## Testing

The converter includes comprehensive test suites:

```bash
# Run round-trip tests
python -m pytest exporter/converter/test_round_trip.py -v

# Run Rule Builder -> CC specific tests
python -m pytest exporter/converter/test_rule_builder_to_cc.py -v
```

## Related Documentation

- [Format Conversion Feasibility Analysis](../comparison/format-conversion-feasibility.md) - Detailed analysis of conversion coverage
- [Rule Exporter Comparison](../comparison/rule-exporter-comparison.md) - Comparison of AST analysis vs Rule Builder approaches
