# Rule Format Converter

Bidirectional converter between Archipelago-CC and Rule Builder (PR #5048) JSON formats.

## Quick Start

```bash
# Auto-detect and convert
python -m exporter.converter input.json -o output.json

# Explicit format conversion
python -m exporter.converter input.json -o output.json --format cc   # -> Archipelago-CC
python -m exporter.converter input.json -o output.json --format rb   # -> Rule Builder
```

## Python API

```python
from exporter.converter import (
    convert_rule_builder_to_cc,
    convert_cc_to_rule_builder,
)

# Single rule conversion
cc_rule, warnings = convert_rule_builder_to_cc(rb_rule)
rb_rule, warnings = convert_cc_to_rule_builder(cc_rule)
```

## Documentation

See the full documentation at [docs/json/developer/guides/format-converter.md](../../docs/json/developer/guides/format-converter.md).

## Tests

```bash
python -m pytest exporter/converter/test_round_trip.py -v
python -m pytest exporter/converter/test_rule_builder_to_cc.py -v
```
