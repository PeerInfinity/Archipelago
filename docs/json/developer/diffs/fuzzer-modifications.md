# Fuzzer Modifications

This document describes the modifications made to the fuzzer compared to the original [Archipelago-fuzzer](https://github.com/Eijebong/Archipelago-fuzzer) by Eijebong.

- **Original version:** 0.5.1
- **Modified version:** 0.5.1-modified
- **Location in this repository:** `fuzz.py`
- **Original copy for comparison:** `scripts/test/fixtures/fuzzer_original/`
- **Last compared:** 2026-02-03

## Summary of Changes

The modifications add several features:
1. **Reproducible fuzzing** via a `--seed` argument
2. **Default options exclusion** via a `--default-options` argument
3. **Option value exclusion** via a `--disallow-options` argument
4. **Fractional sphere logic** via a `--fractional-spheres` argument (for UT hooks)
5. **Seed-based output numbering** via a `--number-by-seed` argument
6. **Early termination** via a `--stop-on-first-failure` argument
7. **ALttP entrance shuffle seed handling** for deterministic regeneration

Additionally, there are bug fixes for specific edge cases encountered during testing.

### Features from Upstream (Backported)

The following features were backported from upstream v0.5.1:
- **Fuzz constraints system** - Sophisticated constraint handling for option combinations via meta files
- **Triggers support** - Archipelago triggers in meta files
- **option_defs tracking** - For Range validation in constraints

---

## New Command-Line Arguments

### `--starting-seed`

```bash
python fuzz.py -g alttp -r 100 --starting-seed 12345
```

Sets the starting seed number for generation. Each run uses `starting_seed + iteration` as the actual Archipelago generation seed. When provided:
- Run 0 uses seed 12345, run 1 uses seed 12346, etc.
- Python's `random` is also seeded with the same value for deterministic YAML option generation
- If not set, each run uses a random generation seed

### `--default-options`

```bash
python fuzz.py -g alttp -r 100 --default-options mode,entrance_shuffle,glitches_required
```

Comma-separated list of option names to leave at their default values instead of randomizing. Useful for:
- Testing specific option combinations while randomizing others
- Excluding problematic options that cause known issues
- Focusing fuzzing on particular aspects of a world

### `--disallow-options`

```bash
python fuzz.py -g alttp -r 100 --disallow-options glitches_required=minor_glitches,overworld_glitches;mode=inverted
```

Disallow specific values for options. Format: `option=value1,value2;option2=value`. Useful for:
- Excluding specific option values known to cause issues
- Testing without certain problematic combinations while still randomizing other values

### `--fractional-spheres`

```bash
python fuzz.py -g alttp -r 100 --hook worlds.tracker.fuzzer_hook:Hook --fractional-spheres
```

Enable fractional sphere logic for UT comparison hooks. This iterates within each integer sphere to handle cascading item dependencies, where collecting items from one location enables access to other locations in the same sphere.

**Note:** It is unclear whether this option is ever helpful in practice.

### `--number-by-seed`

```bash
python fuzz.py -g alttp -r 100 --starting-seed 1000 --number-by-seed
```

Number output files and errors by actual seed (`starting_seed + iteration`) instead of iteration index. Requires `--starting-seed` to be set. Makes it easier to reproduce specific failures by using the seed number directly.

### `--stop-on-first-failure`

```bash
python fuzz.py -g alttp -r 100 --stop-on-first-failure
```

Stop fuzzing after the first failure or timeout. Useful for debugging when you want to investigate the first issue encountered.

---

## Code Modifications

### 1. `generate_random_yaml()` Function

**Change:** Added `default_options`, `disallow_options`, and `max_item_dict_value` parameters.

```python
# Original
def generate_random_yaml(world_name, meta):

# Modified
def generate_random_yaml(world_name, meta, default_options=None, disallow_options=None, max_item_dict_value=None):
    """Generate a random YAML for the given world.

    Args:
        world_name: The apworld name to generate for
        meta: Dictionary of option overrides
        default_options: Set of option names to leave at their defaults instead of randomizing
        disallow_options: Dict mapping option names to sets of values to disallow
        max_item_dict_value: Max value for OptionCounter items (e.g., start_inventory). Default 1000.
    """
```

The function now checks if an option is in `default_options` before randomizing, and passes `disallowed` values to `get_random_value()`:

```python
for option_name, option_value in options.items():
    # Check if this option should be left at default
    if option_name in default_options:
        game_options[option_name] = sanitize(option_value.default)
        continue
    # ...
    disallowed = disallow_options.get(option_name, set())
    game_options[option_name] = sanitize(
        get_random_value(option_name, option_value, disallowed, max_item_dict_value)
    )
```

The `sanitize()` function was also extended to handle custom option defaults that aren't YAML-serializable (e.g., autopelago's `RatChatMessagesHack`).

### 2. `get_random_value()` Function

**Change:** Added `disallowed` and `max_item_dict_value` parameters, plus several special case handlers.

```python
# Original
def get_random_value(name, option):

# Modified
def get_random_value(name, option, disallowed=None, max_item_dict_value=None):
    """Get a random value for the given option.

    Args:
        name: The option name
        option: The option class
        disallowed: Set of values to exclude from randomization
        max_item_dict_value: Max value for OptionCounter items. Default 1000.
    """
```

**New special cases:**

1. **ALttP entrance_shuffle_seed**: Always generates a numeric string to ensure deterministic entrance shuffle regeneration:
```python
if name == "entrance_shuffle_seed":
    return str(random.randint(0, 2 ** 64))
```

2. **Choice with disallowed values**: Filters out disallowed values before selecting:
```python
if disallowed:
    valid_choices = [c for c in valid_choices if c not in disallowed]
if not valid_choices:
    return option.default
```

3. **OptionList with empty valid_keys**: Returns default for options like RGB colors that have custom formats:
```python
if issubclass(option, OptionList):
    if not option.valid_keys:
        return option.default
```

4. **OptionCounter max value**: Uses `max_item_dict_value` parameter (default 1000) instead of hardcoded value.

### 3. `get_run_id()` Function (New)

**Change:** Added new function to determine output file naming.

```python
def get_run_id(i, args):
    """Get the run identifier for output files and error reporting.

    When --number-by-seed is set, returns the actual seed (base_seed + iteration).
    Otherwise returns the iteration index (default behavior).
    """
    if getattr(args, 'number_by_seed', False) and args.seed is not None:
        return args.seed + i
    return i
```

This enables the `--number-by-seed` flag functionality.

### 4. `gen_wrapper()` Function

**Change:** Added random seeding for worker process reproducibility.

```python
# Seed random for reproducibility if seed is provided
# Use seed + iteration to ensure each worker gets a unique but deterministic seed
if args.seed is not None:
    random.seed(args.seed + i)
```

### 5. Main Loop

**Change:** Added random seeding before YAML generation and `STOP_REQUESTED` handling.

```python
while i < args.runs and not STOP_REQUESTED:
    # Seed random for this iteration if seed is provided
    # This ensures YAML generation in main process is deterministic
    if args.seed is not None:
        random.seed(args.seed + i)
```

### 6. Argument Parser

**Change:** Added new arguments.

```python
parser.add_argument("--seed", default=None, type=int,
                    help="Random seed for reproducible fuzzing")
parser.add_argument("--default-options", default=None, type=str,
                    help="Comma-separated list of option names to leave at their defaults "
                         "instead of randomizing. "
                         "Example: --default-options mode,entrance_shuffle,glitches_required")
parser.add_argument("--disallow-options", default=None, type=str,
                    help="Disallow specific values for options. Format: option=value1,value2;option2=value. "
                         "Example: --disallow-options glitches_required=minor_glitches,overworld_glitches;mode=inverted")
parser.add_argument("--fractional-spheres", default=False, action="store_true",
                    help="Enable fractional sphere logic for UT comparison.")
parser.add_argument("--number-by-seed", default=False, action="store_true",
                    help="Number output files and errors by actual seed instead of iteration index.")
parser.add_argument("--stop-on-first-failure", default=False, action="store_true",
                    help="Stop fuzzing after the first failure or timeout.")
```

---

## Diff Statistics

| Metric | Value |
|--------|-------|
| Original lines (v0.5.1) | 991 |
| Modified lines | 1146 |
| Lines added | 155 |

---

## Usage Examples

### Basic reproducible fuzzing
```bash
python fuzz.py -g tunic -r 100 --starting-seed 42
```

### Exclude specific options from randomization
```bash
python fuzz.py -g alttp -r 50 --default-options glitches_required,entrance_shuffle
```

### Disallow specific option values
```bash
python fuzz.py -g alttp -r 50 --disallow-options glitches_required=minor_glitches,overworld_glitches
```

### Combined usage with seed-based numbering
```bash
python fuzz.py -g alttp -r 200 --starting-seed 12345 --default-options shuffle_doors --number-by-seed
```

### Debugging with early termination
```bash
python fuzz.py -g alttp -r 1000 --starting-seed 1 --stop-on-first-failure
```

### UT fuzz testing with fractional spheres
```bash
python fuzz.py -g alttp -r 100 --hook worlds.tracker.fuzzer_hook:Hook --fractional-spheres
```

---

## Related Files

- **Original repository:** https://github.com/Eijebong/Archipelago-fuzzer
- **Original copy for comparison:** `scripts/test/fixtures/fuzzer_original/`
- **This project's fuzzer:** `fuzz.py`
- **Fuzzer testing documentation:** [`test-fuzz.md`](../tests/test-fuzz.md)
