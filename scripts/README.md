# Scripts Directory

This directory contains automation scripts for testing, building, and managing the Archipelago JSON Export Tools project.

## Quick Start

### Setup Scripts (scripts/setup/)

- **`setup/setup_dev_environment.py`** - Automated setup for development environment
  - Creates virtual environment
  - Installs dependencies
  - Generates template files
  - Configures host.yaml
  ```bash
  python scripts/setup/setup_dev_environment.py
  ```

- **`setup/setup_ap_server.py`** - Start and manage Archipelago test servers
  ```bash
  # Start server for adventure seed 1
  python scripts/setup/setup_ap_server.py --game adventure --seed 1

  # Stop server only
  python scripts/setup/setup_ap_server.py --stop-only
  ```

### Testing Scripts (scripts/test/)

#### Main Test Runner

- **`test/test-all-templates.py`** - Comprehensive template testing framework ([detailed documentation](test/test-all-templates-README.md))
  ```bash
  # Test all templates with spoiler tests
  python scripts/test/test-all-templates.py

  # Test specific templates
  python scripts/test/test-all-templates.py --include-list "A Link to the Past.yaml" "Super Metroid.yaml"

  # Test with seed range
  python scripts/test/test-all-templates.py --seed-range 1-10

  # Retest failed templates
  python scripts/test/test-all-templates.py --retest

  # Multiplayer tests
  python scripts/test/test-all-templates.py --multiplayer

  # Multiworld tests
  python scripts/test/test-all-templates.py --multiworld
  ```

#### JavaScript Test Scripts

- **`test/run-tests.js`** - Test runner wrapper for npm test commands
  ```bash
  node scripts/test/run-tests.js --mode=test-spoilers --game=adventure
  ```

- **`test/test-seed-range.js`** - Run tests across multiple seeds
  ```bash
  node scripts/test/test-seed-range.js 1 100
  ```

- **`test/test-health-check.js`** - Validate test environment
  ```bash
  node scripts/test/test-health-check.js
  ```

- **`test/analyze-test-results.js`** - Generate human-readable test reports
  ```bash
  node scripts/test/analyze-test-results.js playwright-report.json
  ```

#### Supporting Test Modules (scripts/lib/)

These modules are imported by `test-all-templates.py` and are not meant to be run directly:

- **`lib/test_utils.py`** - Shared utility functions (YAML config, world mapping, environment checks)
- **`lib/test_results.py`** - Test result management, merging, and persistence
- **`lib/test_runner.py`** - Core test execution logic for different modes (single seed, seed range, multiworld)
- **`lib/seed_utils.py`** - Seed ID computation utilities

These files are located in the `scripts/lib/` subdirectory to clearly separate library modules from executable scripts.

### Build and Generation Scripts (scripts/build/)

- **`build/build-world-mapping.py`** - Build mapping between game names and world directories
  ```bash
  python scripts/build/build-world-mapping.py
  ```

- **`build/generate-multitemplate-configs.py`** - Generate multiple template variations for testing
  ```bash
  python scripts/build/generate-multitemplate-configs.py --game "A Link to the Past"
  ```

- **`build/pack_apworld.py`** - Package world directories into .apworld files
  ```bash
  python scripts/build/pack_apworld.py <world_name>
  ```

### Documentation and Reporting Scripts (scripts/docs/)

- **`docs/generate-test-chart.py`** - Generate markdown test result charts
  ```bash
  # Generate all charts
  python scripts/docs/generate-test-chart.py

  # Generate specific chart
  python scripts/docs/generate-test-chart.py --input-file scripts/output/spoiler-minimal/test-results.json \
    --output-file docs/json/developer/test-results/test-results-spoilers-minimal.md \
    --test-type minimal
  ```

- **`docs/update-preset-files.py`** - Update preset_files.json with test results
  ```bash
  python scripts/docs/update-preset-files.py --test-results scripts/output/spoiler-full/test-results.json
  ```

- **`docs/generate_moduleinfo_table.js`** - Generate module info status report
  ```bash
  node scripts/docs/generate_moduleinfo_table.js
  ```

### Utility Scripts (scripts/utils/)

- **`utils/cleanup-output-directories.py`** - Clean up test output directories
  ```bash
  python scripts/utils/cleanup-output-directories.py
  ```

- **`utils/remove-error-details.py`** - Remove error details from test results
  ```bash
  # Dry run
  python scripts/utils/remove-error-details.py --dry-run

  # Apply changes
  python scripts/utils/remove-error-details.py
  ```

- **`utils/dev-server-nocache.py`** - Development server with caching disabled
  ```bash
  python scripts/utils/dev-server-nocache.py
  ```

- **`utils/list-games.py`** - List games from preset files and templates
  ```bash
  python scripts/utils/list-games.py
  ```

- **`utils/generate_extra_templates.sh`** - Generate additional template variations
  ```bash
  bash scripts/utils/generate_extra_templates.sh
  ```

### Configuration Scripts (scripts/setup/)

- **`setup/update_host_settings.py`** - Update host.yaml configuration
  ```bash
  # Enable normal settings
  python scripts/setup/update_host_settings.py normal

  # Enable minimal spoiler testing
  python scripts/setup/update_host_settings.py minimal-spoilers

  # Enable full spoiler testing
  python scripts/setup/update_host_settings.py full-spoilers
  ```

## Test Output Directories

Test results are organized under `scripts/output/` by test type:

- **`output/spoiler-minimal/`** - Results for advancement items only tests
- **`output/spoiler-full/`** - Results for all locations tests
- **`output/multiplayer/`** - Results for multiplayer tests
- **`output/multiworld/`** - Results for multiworld tests
- **`output/multitemplate-minimal/`** - Results for multi-template minimal tests
- **`output/multitemplate-full/`** - Results for multi-template full tests

Each directory contains:
- `test-results.json` - Latest test results
- `test-results_<timestamp>.json` - Timestamped backups
- `test-results_backup_<timestamp>.json` - Pre-run backups

## Test Workflow

### Basic Testing Flow

1. **Setup Environment**
   ```bash
   python scripts/setup/setup_dev_environment.py
   ```

2. **Start HTTP Server** (in separate terminal)
   ```bash
   python -m http.server 8000
   ```

3. **Run Tests**
   ```bash
   # Minimal spoiler test (fast)
   python scripts/setup/update_host_settings.py minimal-spoilers
   python scripts/test/test-all-templates.py

   # Full spoiler test (comprehensive)
   python scripts/setup/update_host_settings.py full-spoilers
   python scripts/test/test-all-templates.py

   # Multiplayer test
   python scripts/test/test-all-templates.py --multiplayer
   ```

4. **Generate Reports**
   ```bash
   python scripts/docs/generate-test-chart.py
   ```

### Advanced Testing Workflows

#### Seed Range Testing
Test multiple seeds to find flaky tests:
```bash
python scripts/test/test-all-templates.py --seed-range 1-10
```

#### Retest Failed Templates
Quickly retest only failed templates:
```bash
python scripts/test/test-all-templates.py --retest
```

#### Multiworld Testing
Test templates in multiworld configurations:
```bash
# First pass all prerequisite tests
python scripts/test/test-all-templates.py                    # Spoiler minimal
python scripts/setup/update_host_settings.py full-spoilers
python scripts/test/test-all-templates.py                    # Spoiler full
python scripts/test/test-all-templates.py --multiplayer      # Multiplayer

# Then run multiworld tests
python scripts/test/test-all-templates.py --multiworld
```

#### Multi-Template Testing
Test multiple configurations of the same game:
```bash
# Generate template variations
python scripts/build/generate-multitemplate-configs.py --game "A Link to the Past"

# Test all variations
python scripts/test/test-all-templates.py --templates-dir Players/presets/multitemplate/alttp --multitemplate
```

## Configuration Files

- **`data/world-mapping.json`** - Generated mapping of games to world directories
- **`output/`** - General output directory (deprecated, use test-type-specific directories)

## Common Options

### Test Mode Options

- `--export-only` - Only run generation, skip tests
- `--test-only` - Only run tests, skip generation (requires existing files)
- `--headed` - Run Playwright tests with visible browser
- `--post-process` - Run post-processing scripts after tests

### Filtering Options

- `--include-list <files...>` - Test only specified templates
- `--skip-list <files...>` - Skip specified templates
- `--start-from <file>` - Start from specific template alphabetically

### Seed Options

- `--seed <number>` - Use specific seed (default: 1)
- `--seed-range <start-end>` - Test range of seeds
- `--seed-range-continue-on-failure` - Test all seeds even after failures

### Result Management

- `--retest` - Retest only previously failed tests
- `--retest-continue <max>` - Continue testing seeds up to max after pass
- `--include-error-details` - Include first_error_line fields in results

## Environment Requirements

### Python Requirements
- Python 3.8+
- Virtual environment recommended
- Dependencies from `requirements.txt`

### Node.js Requirements
- Node.js 16+
- npm packages from `package.json`
- Playwright browsers: `npx playwright install`

### Runtime Requirements
- HTTP server on port 8000 for spoiler tests
- Archipelago server on port 38281 for multiplayer tests

## Troubleshooting

### Common Issues

1. **"Virtual environment not detected"**
   ```bash
   source .venv/bin/activate  # Linux/Mac
   .venv\Scripts\activate     # Windows
   ```

2. **"HTTP server not running"**
   ```bash
   python -m http.server 8000
   ```

3. **"Rules file not found"**
   - Run generation first: `python scripts/test/test-all-templates.py --export-only`
   - Or ensure test files exist before using `--test-only`

4. **"Playwright browsers not installed"**
   ```bash
   npx playwright install
   ```

### Getting Help

- Run scripts with `--help` for usage information
- Check `test/test-all-templates-README.md` for detailed test documentation
- Check `docs/json/developer/getting-started.md` for setup guide
- See `docs/json/developer/guides/` for detailed documentation

## Script Dependencies

### Python Dependencies
- `yaml` - YAML file parsing
- `json` - JSON file handling
- `subprocess` - Process execution
- `pathlib` - File path operations
- Project modules: `BaseClasses`, `Options`, `Generate`, etc.

### Node.js Dependencies
- `@playwright/test` - Browser automation
- Standard Node.js modules: `fs`, `path`, `child_process`

## Best Practices

1. **Always activate virtual environment** before running Python scripts
2. **Start HTTP server** before running spoiler tests
3. **Use `--post-process`** for automated chart generation
4. **Use `--retest`** to quickly verify fixes
5. **Use `--include-list`** for targeted testing during development
6. **Use `--dry-run`** with utility scripts to preview changes
7. **Check test health** before long test runs: `node scripts/test/test-health-check.js`

## Directory Structure

Scripts are organized into subdirectories by function:

```
scripts/
├── lib/                          # Library modules (not standalone)
│   ├── __init__.py
│   ├── test_utils.py            # Shared utility functions
│   ├── test_results.py          # Test result management
│   ├── test_runner.py           # Core test execution logic
│   └── seed_utils.py            # Seed ID computation
│
├── test/                         # Testing scripts
│   ├── test-all-templates.py    # Main test runner
│   ├── test-all-templates-README.md  # Detailed test runner docs
│   ├── README-multitemplate-alttp.md  # Multi-template testing docs
│   ├── run-tests.js             # Test runner wrapper
│   ├── test-seed-range.js       # Seed range testing
│   ├── test-health-check.js     # Environment validation
│   ├── analyze-test-results.js  # Test report generation
│   └── run_multiplayer_test.py  # Multiplayer integration tests
│
├── setup/                        # Setup and configuration
│   ├── setup_dev_environment.py # Dev environment setup
│   ├── setup_ap_server.py       # Server management
│   └── update_host_settings.py  # Configuration updates
│
├── build/                        # Build and generation
│   ├── build-world-mapping.py   # World mapping generation
│   ├── generate-multitemplate-configs.py  # Template variations
│   └── pack_apworld.py          # APWorld packaging
│
├── docs/                         # Documentation generation
│   ├── generate-test-chart.py   # Test result charts
│   ├── update-preset-files.py   # Preset file updates
│   └── generate_moduleinfo_table.js  # Module info reports
│
├── utils/                        # Utility scripts
│   ├── cleanup-output-directories.py  # Output cleanup
│   ├── remove-error-details.py  # Result file cleanup
│   ├── dev-server-nocache.py    # Development server
│   ├── list-games.py            # Game listing
│   └── generate_extra_templates.sh    # Generate additional templates
│
├── data/                         # Generated data files
├── output/                       # Test output directories
│   ├── spoiler-minimal/
│   ├── spoiler-full/
│   ├── multiplayer/
│   ├── multiworld/
│   ├── multitemplate-minimal/
│   └── multitemplate-full/
└── README.md                     # This file
```

**Benefits of this structure:**
- Clear separation between library modules and executable scripts
- Scripts grouped by function for easy discovery
- Prevents accidental execution of library modules
- Scalable as the number of scripts grows
- Easier to maintain and document

## Contributing

When adding new scripts:
1. Add shebang line: `#!/usr/bin/env python3` or `#!/usr/bin/env node`
2. Include docstring/comment describing purpose
3. Add `--help` argument parsing
4. Update this README with usage examples
5. Follow existing naming conventions
6. Consider appropriate subdirectory if structure is reorganized
