# test-all-templates.py

Comprehensive automation script for testing Archipelago template files through generation and validation.

## Overview

`test-all-templates.py` is the main test automation framework for the Archipelago JSON Export Tools project. It iterates through YAML template files, runs the generation script (Generate.py) for each template, and executes validation tests including spoiler tests, multiplayer tests, and multiworld tests.

## Features

- **Multiple Test Modes**: Spoiler tests, multiplayer tests, and multiworld tests
- **Seed Range Testing**: Test templates across multiple seeds to detect flaky tests
- **Retest Mode**: Intelligently retest only previously failed templates
- **Incremental Results**: Results saved after each template for safe interruption
- **Result Merging**: New test results merged with existing data
- **Post-Processing**: Automated chart generation and preset file updates
- **Flexible Filtering**: Include/exclude specific templates or start from a specific file

## Basic Usage

### Simple Test Run

Test all templates with default settings (spoiler tests, seed 1):
```bash
python scripts/test/test-all-templates.py
```

### Test Specific Templates

```bash
# Test specific templates
python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml" "Super Metroid.yaml"

# Test all except specified templates
python scripts/test/test-all-templates.py --skip-list "Archipelago.yaml" "Universal Tracker.yaml"
```

### Test Modes

```bash
# Spoiler tests (default)
python scripts/test/test-all-templates.py

# Multiplayer tests
python scripts/test/test-all-templates.py --multiplayer

# Multiworld tests
python scripts/test/test-all-templates.py --multiworld
```

## Test Modes

### Spoiler Tests (Default)

Tests the JSON export and spoiler log generation:
- Runs `Generate.py` to create rules and spoiler files
- Opens spoiler log in browser (Playwright)
- Validates JSON structure and game-specific data
- Results saved to `scripts/output/spoiler-minimal/` or `scripts/output/spoiler-full/`

The output directory depends on the `extend_sphere_log_to_all_locations` setting in `host.yaml`:
- `true`: Results in `output/spoiler-full/` (tests all locations)
- `false`: Results in `output/spoiler-minimal/` (tests advancement items only)

### Multiplayer Tests

Tests the multiplayer timer functionality:
- Starts Archipelago server with template
- Connects players via Playwright
- Validates multiplayer timer display and updates
- Results saved to `scripts/output/multiplayer/`

Options:
- `--single-client`: Use single-client mode (simpler test, one browser)

### Multiworld Tests

Tests templates in multiworld configurations:
- Incrementally adds templates to multiworld directory
- Tests each template as a new player in the multiworld
- Validates interaction between different games
- Results saved to `scripts/output/multiworld/`

Requirements:
- All other test types (spoiler minimal, spoiler full, multiplayer) must pass first
- Templates must have passing prerequisite tests

Options:
- `--multiworld-keep-templates`: Don't clear multiworld directory (use existing templates)
- `--multiworld-test-all-players`: Test all players each time (not just newly added)

## Command-Line Options

### Test Control Options

#### `--export-only`
Only run the generation (export) step, skip validation tests.

```bash
python scripts/test/test-all-templates.py --export-only
```

Use when you want to generate rules files without running time-consuming browser tests.

#### `--test-only`
Only run validation tests, skip generation (requires existing rules files).

```bash
python scripts/test/test-all-templates.py --test-only
```

Use when rules files already exist and you want to re-run tests without regeneration.

### Seed Options

#### `--seed <number>`
Use a specific seed number (default: 1).

```bash
python scripts/test/test-all-templates.py --seed 42
```

#### `--seed-range <start-end>`
Test a range of seeds. Reports how many seeds passed before the first failure.

```bash
# Test seeds 1 through 10
python scripts/test/test-all-templates.py --seed-range 1-10

# Single seed (equivalent to --seed 5)
python scripts/test/test-all-templates.py --seed-range 5
```

By default, stops at the first failing seed per template.

#### `--seed-range-continue-on-failure`
Continue testing all seeds in the range even after failures.

```bash
python scripts/test/test-all-templates.py --seed-range 1-10 --seed-range-continue-on-failure
```

Useful for identifying multiple problematic seeds rather than just the first one.

### Filtering Options

#### `--include-list <files...>`
Test only the specified template files.

```bash
# With .yaml extension
python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml"

# Without .yaml extension (automatically added)
python scripts/test/test-all-templates.py --include-list "A Link to the Past" "Super Metroid"

# Multiple files
python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml" "Super Metroid.yaml" "Adventure.yaml"
```

When specified, overrides `--skip-list`.

#### `--skip-list <files...>`
Skip the specified template files.

```bash
python scripts/test/test-all-templates.py --skip-list "Archipelago.yaml" "Universal Tracker.yaml"
```

Default skip list: `Archipelago.yaml`, `Universal Tracker.yaml`, `Final Fantasy.yaml`, `Sudoku.yaml`

#### `--start-from <file>`
Start processing from the specified template file (alphabetically ordered), skipping all files before it.

```bash
python scripts/test/test-all-templates.py --start-from "Super Metroid.yaml"
```

Useful for resuming after interruptions or focusing on later templates.

### Retest Options

#### `--retest`
Retest only previously failed tests, stopping at the first test that still fails.

```bash
python scripts/test/test-all-templates.py --retest
```

The script:
1. Loads existing test results from the appropriate results file
2. Identifies templates that failed
3. Retests only those templates with their failing seeds
4. Stops at the first template that still fails
5. Reports which tests are now passing

Cannot be used with `--include-list` or `--start-from`.

#### `--retest-continue <max_seed>`
When used with `--retest`, if a failing seed passes, continue testing subsequent seeds up to the specified maximum.

```bash
# Retest failed templates, and if they pass, continue testing through seed 10
python scripts/test/test-all-templates.py --retest --retest-continue 10
```

This is useful for:
- Verifying fixes work across multiple seeds, not just the failing one
- Completing seed range testing that was interrupted
- Ensuring no regression in subsequent seeds

### Directory Options

#### `--templates-dir <path>`
Path to alternate template directory (default: `Players/Templates`).

```bash
python scripts/test/test-all-templates.py --templates-dir Players/presets/multitemplate/alttp
```

Required for `--multitemplate` mode.

#### `--output-file <path>`
Output file path for test results.

```bash
python scripts/test/test-all-templates.py --output-file scripts/custom-output/results.json
```

Default varies by test mode:
- Spoiler: `scripts/output/spoiler-{minimal|full}/test-results.json`
- Multiplayer: `scripts/output/multiplayer/test-results.json`
- Multiworld: `scripts/output/multiworld/test-results.json`
- Multitemplate: `scripts/output/multitemplate-{minimal|full}/test-results.json`

### Post-Processing Options

#### `--post-process`
Run post-processing scripts after testing:
- `generate-test-chart.py`: Creates markdown test result charts
- `update-preset-files.py`: Updates preset_files.json with test data (only if `extend_sphere_log_to_all_locations` is true)

```bash
python scripts/test/test-all-templates.py --post-process
```

Post-processing runs after each template test when this flag is enabled.

#### `--include-error-details`
Include `first_error_line` and `first_warning_line` fields in test results.

```bash
python scripts/test/test-all-templates.py --include-error-details
```

Disabled by default to reduce result file size.

### Multiworld-Specific Options

#### `--multiworld-keep-templates`
Keep existing templates in Multiworld directory (do not clear or add new templates).

```bash
python scripts/test/test-all-templates.py --multiworld --multiworld-keep-templates
```

Only valid with `--multiworld`.

#### `--multiworld-test-all-players`
Test all players each time (not just the newly added player).

```bash
python scripts/test/test-all-templates.py --multiworld --multiworld-test-all-players
```

Only valid with `--multiworld`.

### Multitemplate Mode

#### `--multitemplate`
Run tests on multiple template configurations for the same game.

```bash
python scripts/test/test-all-templates.py --templates-dir Players/presets/multitemplate/alttp --multitemplate
```

Requires `--templates-dir` to be specified. Results are nested by game name and template name.

### Multiplayer-Specific Options

#### `--single-client`
Use single-client mode for multiplayer tests.

```bash
python scripts/test/test-all-templates.py --multiplayer --single-client
```

Only valid with `--multiplayer`. Simpler test with one browser instance.

### Browser Options

#### `--headed`
Run Playwright tests in headed mode (with visible browser windows).

```bash
python scripts/test/test-all-templates.py --headed
```

Useful for debugging test failures.

## Output Structure

### Results Files

Test results are saved in JSON format with the following structure:

```json
{
  "metadata": {
    "created": "2025-01-10T12:00:00.000000",
    "last_updated": "2025-01-10T12:30:00.000000",
    "script_version": "1.0.0",
    "total_batch_time_seconds": 1800.5,
    "templates_tested": 50
  },
  "results": {
    "A Link to the Past.yaml": {
      "template_name": "A Link to the Past.yaml",
      "timestamp": "2025-01-10T12:00:00.000000",
      "generation": {
        "success": true,
        "duration_seconds": 2.5,
        "seed_used": "1",
        "seed_id": "14089154938208861744"
      },
      "spoiler_test": {
        "pass_fail": "passed",
        "duration_seconds": 15.3,
        "errors": 0,
        "warnings": 0
      },
      "world_info": {
        "game_name_from_yaml": "A Link to the Past",
        "world_directory": "tloz_alttp"
      }
    }
  }
}
```

### Output Directories

Results are organized under `scripts/output/` by test type:

- **`output/spoiler-minimal/`** - Spoiler tests with advancement items only
  - Used when `extend_sphere_log_to_all_locations = false` in host.yaml
- **`output/spoiler-full/`** - Spoiler tests with all locations
  - Used when `extend_sphere_log_to_all_locations = true` in host.yaml
- **`output/multiplayer/`** - Multiplayer timer tests
- **`output/multiworld/`** - Multiworld integration tests
- **`output/multitemplate-minimal/`** - Multi-template tests (minimal)
- **`output/multitemplate-full/`** - Multi-template tests (full)

Each directory contains:
- `test-results.json` - Latest merged results (includes all templates ever tested)
- `test-results_<timestamp>.json` - Timestamped snapshot of current run only
- `test-results_backup_<timestamp>.json` - Backup before current run

### Incremental Results

Results are saved incrementally after each template is tested. This means:
- Safe to interrupt long test runs (Ctrl+C)
- Progress is never lost
- Can resume testing with `--start-from` or `--retest`

### Result Merging

When the script runs:
1. Existing results file is backed up
2. New tests run and generate results
3. New results are merged into existing results
4. Templates not tested in current run retain their previous results
5. Both merged results and timestamped snapshot are saved

## Environment Requirements

### Prerequisites

1. **Python Environment**
   ```bash
   # Activate virtual environment
   source .venv/bin/activate  # Linux/Mac
   .venv\Scripts\activate     # Windows
   ```

2. **HTTP Server** (for spoiler tests)
   ```bash
   python -m http.server 8000
   ```

   The script will auto-start the server if not running.

3. **Archipelago Server** (for multiplayer tests only)
   ```bash
   python scripts/setup/setup_ap_server.py --game <game> --seed <seed>
   ```

4. **Playwright Browsers**
   ```bash
   npx playwright install
   ```

### Configuration

The script respects the following settings in `host.yaml`:

- `extend_sphere_log_to_all_locations`: Controls which output directory is used
  - `true`: Uses `output/spoiler-full/` (tests all locations)
  - `false`: Uses `output/spoiler-minimal/` (tests advancement items only)

Update this setting using:
```bash
# Minimal spoiler testing
python scripts/setup/update_host_settings.py minimal-spoilers

# Full spoiler testing
python scripts/setup/update_host_settings.py full-spoilers
```

## Examples

### Basic Testing Workflows

**Test all templates with default settings:**
```bash
python scripts/test/test-all-templates.py
```

**Test specific game:**
```bash
python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml"
```

**Quick generation without tests:**
```bash
python scripts/test/test-all-templates.py --export-only
```

**Run only tests (rules files already exist):**
```bash
python scripts/test/test-all-templates.py --test-only
```

### Seed Range Testing

**Test multiple seeds to find flaky tests:**
```bash
# Stop at first failure for each template
python scripts/test/test-all-templates.py --seed-range 1-10

# Test all 10 seeds regardless of failures
python scripts/test/test-all-templates.py --seed-range 1-10 --seed-range-continue-on-failure
```

### Retest Workflows

**Retest failed templates after fixes:**
```bash
python scripts/test/test-all-templates.py --retest
```

**Retest and continue to seed 10 if they pass:**
```bash
python scripts/test/test-all-templates.py --retest --retest-continue 10
```

### Multiplayer Testing

**Test all templates in multiplayer mode:**
```bash
python scripts/test/test-all-templates.py --multiplayer
```

**Test with single client (simpler):**
```bash
python scripts/test/test-all-templates.py --multiplayer --single-client
```

### Multiworld Testing

**Full multiworld test workflow:**
```bash
# 1. Ensure all prerequisites pass
python scripts/setup/update_host_settings.py minimal-spoilers
python scripts/test/test-all-templates.py

python scripts/setup/update_host_settings.py full-spoilers
python scripts/test/test-all-templates.py

python scripts/test/test-all-templates.py --multiplayer

# 2. Run multiworld tests
python scripts/test/test-all-templates.py --multiworld
```

### Multi-Template Testing

**Test multiple configurations of the same game:**
```bash
# 1. Generate template variations
python scripts/build/generate-multitemplate-configs.py --game "A Link to the Past"

# 2. Test all variations
python scripts/test/test-all-templates.py --templates-dir Players/presets/multitemplate/alttp --multitemplate
```

### Advanced Workflows

**Partial testing and resuming:**
```bash
# Start from a specific template
python scripts/test/test-all-templates.py --start-from "Super Metroid.yaml"

# Test specific templates with seed range
python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml" --seed-range 1-5
```

**Generate charts after testing:**
```bash
python scripts/test/test-all-templates.py --post-process
```

**Debugging test failures:**
```bash
# Run with visible browser for a specific template
python scripts/test/test-all-templates.py --include-list "Adventure.yaml" --headed
```

## Error Handling

### Script Validation

The script validates mutually exclusive options and will exit with an error if conflicting options are specified:

- `--export-only` and `--test-only`
- `--multiplayer` and `--multiworld`
- `--seed` and `--seed-range`
- `--retest` and `--include-list`
- `--retest` and `--start-from`

### Prerequisite Checks

Before running, the script checks:
1. Virtual environment is active (warning if not)
2. Required dependencies are available (error if missing)
3. HTTP server is running for spoiler tests (auto-starts if missing)
4. Templates directory exists
5. YAML files exist in templates directory

### Interruption Handling

The script handles interruptions gracefully:
- **Ctrl+C**: Saves current results and exits
- **Script Error**: Saves error result for failed template and continues
- **Test Failure in Retest Mode**: Saves results and exits on first still-failing test

## Performance

### Timing Information

The script tracks and reports:
- Duration for each template (generation + test)
- Total batch processing time
- Average time per template

Example output:
```
Processed 50 templates
Total batch processing time: 1800.5 seconds (30.0 minutes)
Average time per template: 36.0 seconds
```

### Optimization Tips

1. **Use `--export-only` for fast generation**: Skip time-consuming browser tests
2. **Use `--include-list` during development**: Test only relevant templates
3. **Use `--retest` after fixes**: Only test previously failed templates
4. **Use `--test-only` when rules exist**: Skip regeneration if files are up-to-date
5. **Run tests in parallel** (advanced): Use multiple terminals with `--include-list`

## Troubleshooting

### Common Issues

**"Virtual environment not detected"**
```bash
source .venv/bin/activate  # Linux/Mac
.venv\Scripts\activate     # Windows
```

**"HTTP server not running"**
```bash
python -m http.server 8000
```

The script will auto-start the server if missing.

**"Rules file not found" (with --test-only)**
```bash
# Generate rules first
python scripts/test/test-all-templates.py --export-only
```

**"Cannot use --retest because results file not found"**
```bash
# Run a full test first to generate results
python scripts/test/test-all-templates.py
```

**"No templates need retesting"**

All previously failed tests are now passing. This is good news!

### Getting Help

```bash
python scripts/test/test-all-templates.py --help
```

## Related Scripts

### Library Modules (scripts/lib/)

- **`lib/test_utils.py`** - Shared utility functions for tests
- **`lib/test_results.py`** - Test result management and merging logic
- **`lib/test_runner.py`** - Core test execution logic for different modes
- **`lib/seed_utils.py`** - Seed ID computation utilities

### Supporting Scripts

- **`generate-test-chart.py`** - Generate markdown charts from test results
- **`update-preset-files.py`** - Update preset files with test data
- **`setup_dev_environment.py`** - Initial development environment setup
- **`update_host_settings.py`** - Configure host.yaml settings

## Contributing

When modifying this script:
1. Maintain backward compatibility with existing result files
2. Update result merging logic if changing result structure
3. Add new options to argument parser with clear help text
4. Update this README with new functionality
5. Test with various combinations of options
6. Ensure incremental saving still works after changes
