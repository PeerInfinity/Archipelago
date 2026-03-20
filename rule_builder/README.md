# Rule Builder

Declarative rule definition system for Archipelago, based on [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048).

## Overview

Rule Builder provides a clean, declarative API for defining game logic rules that are inherently serializable to JSON.

```python
from rule_builder import Has, HasAll, And, Or, CanReachRegion

# Define rules using builder classes
rule = Has("Sword") & Has("Shield")
rule = HasAll(["Key1", "Key2"]) | CanReachRegion("Shortcut")

# Serialize to JSON
rule_dict = rule.to_dict()

# Deserialize from JSON
rule = Rule.from_dict(rule_dict)
```

## Features

- Easy-to-use Python-first design with type safety
- Rule caching and serialization
- Logic optimization and human-readable explanations
- Custom rule support for game-specific logic
- Automatic indirect connection registration

## Source

The code in `rules.py` is from [PR #5048](https://github.com/ArchipelagoMW/Archipelago/pull/5048) by drtchops. The original `rules-engine` branch is no longer available.

## Dependencies

This module requires Archipelago core modules:
- `BaseClasses` (CollectionState, Entrance, Item, Location, MultiWorld, Region)
- `NetUtils` (JSONMessagePart)
- `Options` (CommonOptions, Option)

It will only work when running within the Archipelago environment.

## Related

- [Format Converter](exporter/converter/README.md) - Convert between Rule Builder and Archipelago-CC AST formats
- [Format Converter Docs](docs/json/developer/guides/format-converter.md) - Full documentation
- [Rule Exporter Comparison](docs/json/developer/comparison/rule-exporter-comparison.md) - Comparison of approaches
