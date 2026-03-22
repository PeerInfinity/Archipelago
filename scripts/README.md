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

See [Testing Pipeline Guide](../docs/json/developer/guides/testing-pipeline.md) for an overview of the complete testing workflow.

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

  # Multiclient tests
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

- **`test/test-bidirectional-detection.js`** - Test bidirectional entrance detection
  ```bash
  node scripts/test/test-bidirectional-detection.js
  ```

#### Fuzzer Test Scripts

See [Fuzz Testing Guide](../docs/json/developer/tests/test-fuzz.md) and [Fuzzer Debugging Guide](../docs/json/developer/guides/fuzzer-debugging.md) for detailed documentation.

- **`test/test-all-ut-fuzz.py`** - Batch Universal Tracker fuzz test runner
  ```bash
  python scripts/test/test-all-ut-fuzz.py --runs 10                        # Test all games
  python scripts/test/test-all-ut-fuzz.py --runs 10 --include-list Adventure.yaml
  python scripts/test/test-all-ut-fuzz.py --every-nth 10 --skip-first 0    # For parallel CI
  ```

- **`test/test-all-spoiler-fuzz.py`** - Batch spoiler fuzz test runner
  ```bash
  python scripts/test/test-all-spoiler-fuzz.py --runs 10                   # Test all games
  python scripts/test/test-all-spoiler-fuzz.py --runs 10 --include-list Adventure.yaml
  python scripts/test/test-all-spoiler-fuzz.py --every-nth 10 --skip-first 0  # For parallel CI
  ```

- **`test/test-multiworld-ut-fuzz.py`** - Test multiworld UT fuzz scenarios
  ```bash
  python scripts/test/test-multiworld-ut-fuzz.py -p   # Run with post-processing
  ```

#### World Generator Tests

See [World Generator Test Guide](../docs/json/developer/tests/test-world-generator.md) and [World Generator Guide](../docs/json/developer/guides/world-generator.md) for detailed documentation.

- **`test/test-world-generator.py`** - World generator round-trip testing
  ```bash
  python scripts/test/test-world-generator.py                              # Test all games
  python scripts/test/test-world-generator.py --include-list "Adventure.yaml"
  python scripts/test/test-world-generator.py --skip-original-gen          # Only test worldgen
  ```

- **`test/test-json-world-builder.py`** - Test JSON world builder functionality
  ```bash
  python scripts/test/test-json-world-builder.py
  ```

#### Integration Tests

- **`test/run_multiclient_test.py`** - Orchestrate multiclient integration tests
  ```bash
  python scripts/test/run_multiclient_test.py --game alttp --seed 14089154938208861744
  python scripts/test/run_multiclient_test.py --player-file path/to/player.yaml
  ```

- **`test/test-ut-bounce-protocol.py`** - Test Universal Tracker bounce protocol
  ```bash
  python scripts/test/test-ut-bounce-protocol.py
  ```

- **`test/TestDriverClient.py`** - Test driver client for automated testing
  ```bash
  python scripts/test/TestDriverClient.py
  ```

#### Comparison and Export Scripts

- **`test/combine-test-results.py`** - Combine parallel test results
  ```bash
  python scripts/test/combine-test-results.py \
    --input-files scripts/output/spoiler-minimal/test-results-seed-*.json \
    --output-file scripts/output/spoiler-minimal/test-results.json
  ```

- **`test/compare-pickle-json-export.py`** - Compare pickle and JSON export formats
  ```bash
  python scripts/test/compare-pickle-json-export.py
  ```

- **`test/compare_rules_json.py`** - Compare rules.json files between versions
  ```bash
  python scripts/test/compare_rules_json.py rules1.json rules2.json
  ```

- **`test/export-pickle-to-json.py`** - Export pickle data to JSON format
  ```bash
  python scripts/test/export-pickle-to-json.py input.pickle output.json
  ```

#### Configuration and Utility Scripts

- **`test/generate-tracking-mode-config.py`** - Generate tracking mode configuration files
  ```bash
  python scripts/test/generate-tracking-mode-config.py
  ```

- **`test/test_ast_format_parsing.py`** - Test AST format parsing functionality
  ```bash
  python scripts/test/test_ast_format_parsing.py
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

- **`build/pack_apworld.py`** - Package world directories into .apworld files
  ```bash
  python scripts/build/pack_apworld.py <world_name>
  ```

- **`build/bundle-frontend.js`** - Bundle the frontend for production using esbuild
  ```bash
  node scripts/build/bundle-frontend.js            # Production build
  node scripts/build/bundle-frontend.js --watch    # Watch mode for development
  node scripts/build/bundle-frontend.js --no-minify  # Debug build without minification
  ```

- **`build/pack_json_tools_installer.py`** - Package the JSON Tools Installer as an APWorld
  ```bash
  python scripts/build/pack_json_tools_installer.py            # Create installer apworld
  python scripts/build/pack_json_tools_installer.py --dry-run  # Preview what would be packaged
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

- **`docs/generate-all-docs.py`** - Master script to run all document generators
  ```bash
  python scripts/docs/generate-all-docs.py              # Generate all documentation
  python scripts/docs/generate-all-docs.py --list       # List available generators
  python scripts/docs/generate-all-docs.py --only fuzz  # Run only fuzz-related generators
  python scripts/docs/generate-all-docs.py --skip freshness  # Skip specific generators
  ```

- **`docs/generate-freshness-report.py`** - Generate test results freshness report
  ```bash
  python scripts/docs/generate-freshness-report.py
  ```

- **`docs/generate-world-generator-report.py`** - Generate world generator test report
  ```bash
  python scripts/docs/generate-world-generator-report.py
  ```

- **`docs/generate_ut_fuzz_chart.py`** - Generate Universal Tracker fuzz test charts
  ```bash
  python scripts/docs/generate_ut_fuzz_chart.py --original   # Original UT results
  python scripts/docs/generate_ut_fuzz_chart.py --worldgen   # WorldGen results
  python scripts/docs/generate_ut_fuzz_chart.py --hybrid     # Hybrid results
  python scripts/docs/generate_ut_fuzz_chart.py --apworld    # APWorld results
  ```

- **`docs/generate_spoiler_fuzz_chart.py`** - Generate spoiler fuzz test charts
  ```bash
  python scripts/docs/generate_spoiler_fuzz_chart.py           # Bundled results
  python scripts/docs/generate_spoiler_fuzz_chart.py --apworld # APWorld results
  ```

- **`docs/generate_fuzz_summary_chart.py`** - Generate combined fuzz test summary
  ```bash
  python scripts/docs/generate_fuzz_summary_chart.py           # Bundled summary
  python scripts/docs/generate_fuzz_summary_chart.py --apworld # APWorld summary
  ```

- **`docs/generate_multiworld_ut_fuzz_chart.py`** - Generate multiworld UT fuzz charts
  ```bash
  python scripts/docs/generate_multiworld_ut_fuzz_chart.py
  ```

- **`docs/compare_ut_fuzz_results.py`** - Compare UT fuzz results between versions
  ```bash
  python scripts/docs/compare_ut_fuzz_results.py               # Compare bundled results
  python scripts/docs/compare_ut_fuzz_results.py --apworld     # Compare APWorld results
  ```

- **`docs/compare_ut_fuzz_vs_worldgen.py`** - Compare UT fuzz results vs worldgen
  ```bash
  python scripts/docs/compare_ut_fuzz_vs_worldgen.py
  ```

- **`docs/find_orphaned_docs.py`** - Find markdown files not linked from entry points
  ```bash
  python scripts/docs/find_orphaned_docs.py               # Find orphaned docs
  python scripts/docs/find_orphaned_docs.py --verbose     # Show detailed link info
  python scripts/docs/find_orphaned_docs.py --json        # JSON output for CI
  ```

- **`docs/sync-rule-docs.py`** - Check which rule types are documented
  ```bash
  python scripts/docs/sync-rule-docs.py                   # Check documentation coverage
  python scripts/docs/sync-rule-docs.py --json            # JSON output for CI
  python scripts/docs/sync-rule-docs.py --generate        # Generate doc stubs
  ```

- **`docs/sync-rule-tests.py`** - Check which rule types have test coverage
  ```bash
  python scripts/docs/sync-rule-tests.py                  # Check test coverage
  python scripts/docs/sync-rule-tests.py --json           # JSON output for CI
  ```

- **`docs/sync-script-docs.py`** - Check which scripts are documented
  ```bash
  python scripts/docs/sync-script-docs.py                 # Check documentation coverage
  python scripts/docs/sync-script-docs.py --verbose       # Show all scripts
  python scripts/docs/sync-script-docs.py --json          # JSON output for CI
  python scripts/docs/sync-script-docs.py --generate      # Generate doc stubs
  ```

- **`docs/generate-file-diff-lists.py`** - Generate categorized file diff lists comparing fork vs upstream Archipelago
  ```bash
  python scripts/docs/generate-file-diff-lists.py                           # Generate all diff lists
  python scripts/docs/generate-file-diff-lists.py --upstream-commit fb45a2f8  # Specify upstream commit
  python scripts/docs/generate-file-diff-lists.py --dry-run                 # Preview without writing
  ```

- **`docs/check-annotations.py`** - Verify that every item in the fork-vs-upstream diff has a corresponding entry in `file-annotations.json`. Reports missing annotations and stale entries.
  ```bash
  python scripts/docs/check-annotations.py --upstream-commit fb45a2f8       # Check against specific commit
  python scripts/docs/check-annotations.py                                  # Check against latest upstream/main
  ```

### Release Scripts (scripts/release/)

- **`release/sync-to-stable.sh`** - Sync the dev repository to the stable repository (`PeerInfinity/Archipelago` @ `JSONExport`) via rsync. Deletes all files in the destination (preserving `.git`, `.github`, `README.md`, `.gitignore`, `.claude`), copies all files from dev, then restores non-root `README.md` and `.gitignore` files.
  ```bash
  bash scripts/release/sync-to-stable.sh /path/to/stable/Archipelago
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

- **`utils/list-template-files.py`** - List template file names from world-mapping.json, excluding WorldGen/Vanilla entries and excluded games
  ```bash
  python scripts/utils/list-template-files.py                                          # List with permanent excludes only
  python scripts/utils/list-template-files.py --exclude main_test_exclude_list         # Apply additional excludes
  ```

- **`utils/generate_extra_templates.sh`** - Generate additional template variations
  ```bash
  bash scripts/utils/generate_extra_templates.sh
  ```

- **`utils/generate_all_templates.sh`** - Generate seed exports (`_rules.json`, `_sphere_log.jsonl`) for all supported games. This is the primary script for regenerating the `frontend/presets/` data. It runs `Generate.py` for each game, optionally generates WorldGen and WorldGen2 worlds, and produces multiworld presets.

  ```bash
  # Default: generate seed 1 for all games, seeds 1-3 for core games, plus multiworld
  bash scripts/utils/generate_all_templates.sh

  # With WorldGen world generation
  GENERATE_WORLDGEN=true bash scripts/utils/generate_all_templates.sh

  # Quick run: skip extra seeds and multiworld
  GENERATE_EXTRA_SEEDS=false GENERATE_MULTIWORLD=false bash scripts/utils/generate_all_templates.sh
  ```

  Environment variables:
  | Variable | Default | Description |
  |----------|---------|-------------|
  | `GENERATE_MULTIWORLD` | `true` | Generate multiworld presets (4 games combined) |
  | `GENERATE_EXTRA_SEEDS` | `true` | Generate seeds 2 and 3 for core games |
  | `GENERATE_WORLDGEN` | `false` | Generate WorldGen worlds from exported rules |
  | `WORLDGEN_CANONICAL_SEED` | `1` | Canonical seed number for WorldGen (empty to disable) |
  | `GENERATE_WORLDGEN2` | `false` | Generate WorldGen2 worlds from WorldGen worlds |

  Some games are excluded (commented out) because they take too long: Jak and Daxter, Pokemon Emerald, Pokemon Red and Blue, SMZ3, Yu-Gi-Oh! 2006. Their preset data may be stale.

- **`utils/generate_full_multiworld.sh`** - Generate a full multiworld seed
  ```bash
  bash scripts/utils/generate_full_multiworld.sh
  ```

- **`utils/generate_test_templates.sh`** - Generate test template files
  ```bash
  bash scripts/utils/generate_test_templates.sh
  ```

- **`utils/generated_commands.sh`** - Auto-generated script output from `generate_all_templates.sh --script`. Not intended to be run directly; produced for CI workflow use.

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

- **`setup/setup_dev_environment_cc.py`** - Setup script for cloud/container environments (Claude Code). See [Cloud Setup Guide](../CC/cloud-setup.md) for detailed instructions.
  ```bash
  python scripts/setup/setup_dev_environment_cc.py
  ```

- **`setup/apply_romless_patches.py`** - Apply patches for ROM-less generation testing
  ```bash
  python scripts/setup/apply_romless_patches.py              # Apply patches
  python scripts/setup/apply_romless_patches.py --dry-run    # Preview patches
  python scripts/setup/apply_romless_patches.py --revert     # Revert patches
  ```

### Root Scripts (scripts/)

- **`install_json_tools.py`** - End-to-end installation test script. Verifies that JSON Tools can be
  installed from scratch into a fresh Archipelago clone and that the resulting installation works
  correctly. Not intended for end users — this is a developer tool for testing the installation
  pipeline. It clones Archipelago, creates a venv, downloads and runs the JSON Tools installer,
  sets up the dev environment, optionally applies ROM-less patches, and runs verification tests.

  ```bash
  # Basic installation (monkey patching, tests with Adventure)
  python scripts/install_json_tools.py --dev --target-dir ~/Archipelago-vanilla

  # ROM-less + ALTTP test
  python scripts/install_json_tools.py --dev --romless --target-dir ~/Archipelago-vanilla

  # Fresh install (delete existing target first)
  python scripts/install_json_tools.py --dev --fresh --target-dir ~/Archipelago-vanilla

  # Dev version with all components, skip tests
  python scripts/install_json_tools.py --dev --all --skip-tests --target-dir ~/Archipelago-vanilla

  # Dry run (preview what would be done)
  python scripts/install_json_tools.py --dev --dry-run --target-dir ~/Archipelago-vanilla
  ```

  **Key options:**
  | Option | Description |
  |--------|-------------|
  | `--dev` | Use development branch (Archipelago-CC @ main). Default is stable. |
  | `--target-dir DIR` | Installation directory (default: `./archipelago-json-tools`) |
  | `--patch-mode MODE` | `monkey` (default, runtime patching) or `none` |
  | `--romless` | Apply ROM-less patches (enables ALTTP and other ROM-based game testing) |
  | `--fresh` | Delete existing target directory before cloning |
  | `--test MODE` | `auto` (default: ALTTP if --romless, else Adventure), `adventure`, `alttp`, or `none` |
  | `--all` | Install all components (frontend, presets, docs, etc.) |
  | `--skip-clone` | Skip cloning (assume Archipelago already exists in target) |
  | `--skip-setup` | Skip development environment setup |
  | `--skip-tests` | Same as `--test none` |
  | `--dry-run` / `-n` | Show what would be done without making changes |

  **Verification tests** run both a spoiler test (`test-all-templates.py`) and a UT fuzz test
  (`test-all-ut-fuzz.py --runs 1`) for a single game, ensuring the installation works end-to-end.

- **`install_apworlds.py`** - Bulk install APWorlds from community index
  ```bash
  python scripts/install_apworlds.py                         # List available worlds
  python scripts/install_apworlds.py --install-all           # Install all matching worlds
  python scripts/install_apworlds.py --install balatro hades # Install specific worlds
  python scripts/install_apworlds.py --status Stable Unstable  # Filter by status
  ```

- **`restore_apworlds.py`** - Restore APWorlds from disabled directory
  ```bash
  python scripts/restore_apworlds.py                         # Restore Stable only
  python scripts/restore_apworlds.py --status Stable Unstable  # Restore multiple statuses
  python scripts/restore_apworlds.py --list                  # List what would be restored
  python scripts/restore_apworlds.py --dry-run               # Preview restoration
  ```

- **`combine_apworld_data.py`** - Combine APWorld info into comprehensive JSON
  ```bash
  python scripts/combine_apworld_data.py                     # Create combined data file
  python scripts/combine_apworld_data.py --output path/to/output.json
  ```

- **`generate_apworld_mapping.py`** - Generate APWorld spreadsheet mapping
  ```bash
  python scripts/generate_apworld_mapping.py                 # Generate mapping
  python scripts/generate_apworld_mapping.py --fetch         # Fetch latest spreadsheet first
  python scripts/generate_apworld_mapping.py --dry-run       # Preview without writing
  ```

- **`fetch-archipelago-games-sheet.py`** - Fetch community spreadsheet data
  ```bash
  python scripts/fetch-archipelago-games-sheet.py            # Download latest data
  python scripts/fetch-archipelago-games-sheet.py --output-dir path/to/output
  ```

### Debugging Scripts (scripts/debug/)

- **`debug/extract_bunny_closures.py`** - Diagnostic script for ALttP bunny rule closure extraction
  ```bash
  python scripts/debug/extract_bunny_closures.py
  ```

- **`debug/investigate_explain_support.py`** - Investigate which locations lack explain support
  ```bash
  python scripts/debug/investigate_explain_support.py                          # Default: ALTTP
  python scripts/debug/investigate_explain_support.py path/to/rules.json "Game Name"
  ```

### World-Specific Scripts (scripts/worlds/)

- **`worlds/yachtdice/export_yacht_weights.py`** - Export Yacht Dice item weights
  ```bash
  python scripts/worlds/yachtdice/export_yacht_weights.py
  ```

### Vanilla ALttP Scripts (scripts/vanilla-alttp/)

Tools for placing items in their vanilla (original game) locations in A Link to the Past. See the **[Vanilla ALttP README](vanilla-alttp/README.md)** for full documentation.

### Journey to Ascension Scripts (scripts/jta/)

- **`jta/cost-adjust.js`** - Adjust costMult values in randomized JtA game data so perk tasks are completable within a target number of energy resets per sphere
  ```bash
  node scripts/jta/cost-adjust.js \
    --gamedata frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_gamedata.json \
    --spherelog frontend/presets/jta/AP_SEED/AP_SEED_sphere_log.jsonl \
    --output frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_costs.json \
    --resets-per-sphere 5
  ```

- **`jta/cost-plan.js`** - Generate cost data using simulated playthrough with binary search solver (more accurate than cost-adjust.js)
  ```bash
  node scripts/jta/cost-plan.js \
    --gamedata path/to/gamedata.json \
    --spherelog path/to/sphere_log.jsonl \
    --output path/to/costs.json \
    --two-pass --normal-attempts 2
  ```

- **`jta/cost-generate-game.js`** - Generate costs using real game engine via Playwright in a headless browser
  ```bash
  node scripts/jta/cost-generate-game.js \
    -g path/to/gamedata.json \
    -s path/to/sphere_log.jsonl \
    --port 8000 --two-pass
  ```

- **`jta/cost-debugger.js`** - Generate costs via simulated playthrough and output a detailed step-by-step debug report
  ```bash
  node scripts/jta/cost-debugger.js \
    --gamedata path/to/gamedata.json \
    --spherelog path/to/sphere_log.jsonl \
    --output jta_cost_debug_report.json
  ```

- **`jta/game-verify.js`** - Run cost debugger's planned steps through the actual game engine in a headless browser, comparing planned vs actual results
  ```bash
  node scripts/jta/game-verify.js \
    -g path/to/gamedata.json \
    -s path/to/sphere_log.jsonl \
    --port 8000
  ```

## Test Output Directories

Test results are organized under `scripts/output/` by test type:

- **`output/spoiler-minimal/`** - Results for advancement items only tests
- **`output/spoiler-full/`** - Results for all locations tests
- **`output/multiplayer/`** - Results for multiplayer tests
- **`output/multiworld/`** - Results for multiworld tests

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

   # Multiclient test
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
python scripts/test/test-all-templates.py --multiplayer      # Multiclient

# Then run multiworld tests
python scripts/test/test-all-templates.py --multiworld
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
│   ├── run-tests.js             # Test runner wrapper
│   ├── test-seed-range.js       # Seed range testing
│   ├── test-health-check.js     # Environment validation
│   ├── analyze-test-results.js  # Test report generation
│   └── run_multiplayer_test.py  # Multiclient integration tests
│
├── setup/                        # Setup and configuration
│   ├── setup_dev_environment.py # Dev environment setup
│   ├── setup_ap_server.py       # Server management
│   └── update_host_settings.py  # Configuration updates
│
├── build/                        # Build and generation
│   ├── build-world-mapping.py   # World mapping generation
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
├── vanilla-alttp/                # ALttP vanilla item placement tools
│   └── README.md             # Vanilla placement documentation
│
├── data/                         # Generated data files
├── output/                       # Test output directories
│   ├── spoiler-minimal/
│   ├── spoiler-full/
│   ├── multiplayer/
│   └── multiworld/
│
├── test/fixtures/                # Test fixture data
│   ├── fuzzer_original/          # Original fuzzer test data
│   │   └── README.md             # Fuzzer fixture documentation
│   └── tracker_original/         # Universal Tracker test data
│       └── docs/                 # Tracker integration docs
│           ├── setup.md          # Setup instructions
│           ├── apworld-integration.md  # APWorld integration
│           ├── client-integration.md   # Client integration
│           ├── map-integration.md      # Map integration
│           └── re-gen-passthrough.md   # Re-generation passthrough
│
├── jta/                          # Journey to Ascension cost tools
│   ├── cost-adjust.js        # Cost adjustment CLI
│   ├── cost-plan.js          # Cost planner with binary search
│   ├── cost-debugger.js      # Step-by-step cost debug report
│   ├── cost-generate-game.js # Browser-based cost generation
│   └── game-verify.js        # Planned vs actual game verification
│
└── README.md                     # This file
```

**Benefits of this structure:**
- Clear separation between library modules and executable scripts
- Scripts grouped by function for easy discovery
- Prevents accidental execution of library modules
- Scalable as the number of scripts grows
- Easier to maintain and document

## Test Fixtures

The `test/fixtures/` directory contains test data and documentation for integration testing:

### Fuzzer Fixtures

- **[Fuzzer Original README](test/fixtures/fuzzer_original/README.md)** - Documentation for the original fuzzer test data

### Universal Tracker Fixtures

Documentation for Universal Tracker integration testing:

- **[Setup](test/fixtures/tracker_original/docs/setup.md)** - Initial setup instructions
- **[APWorld Integration](test/fixtures/tracker_original/docs/apworld-integration.md)** - APWorld packaging integration
- **[Client Integration](test/fixtures/tracker_original/docs/client-integration.md)** - Client connection integration
- **[Map Integration](test/fixtures/tracker_original/docs/map-integration.md)** - Map display integration
- **[Re-Gen Passthrough](test/fixtures/tracker_original/docs/re-gen-passthrough.md)** - Re-generation passthrough behavior

## Contributing

When adding new scripts:
1. Add shebang line: `#!/usr/bin/env python3` or `#!/usr/bin/env node`
2. Include docstring/comment describing purpose
3. Add `--help` argument parsing
4. Update this README with usage examples
5. Follow existing naming conventions
6. Consider appropriate subdirectory if structure is reorganized
