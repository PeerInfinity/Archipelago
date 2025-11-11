# Developer Guide: Testing Pipeline

This project contains a comprehensive testing pipeline designed to validate that the frontend JavaScript implementation of the game logic correctly simulates a full playthrough, behaving identically to the authoritative Python implementation from the main Archipelago project. Understanding this data flow is essential for debugging rules, fixing test failures, and ensuring the accuracy of the web client.

## Testing Philosophy

The core principle is **progression equivalence**. The JavaScript `StateManager` and `RuleEngine` must unlock locations in the same order (or "spheres") as the original Python game generator given the same world seed and settings. The entire pipeline is built to automate this comparison.

## The Data Flow: From Python Generation to JavaScript Validation

The testing process involves several stages, moving data from the original game generation process to the frontend for validation.

```
┌──────────────────┐   1. Generates   ┌────────────────────────┐
│ Generate.py      ├───────────────►│   Spoiler Log & Rules  │
│ (Python Backend) │                  │ (..._spheres_log.jsonl)│
└──────────────────┘                  │ (..._rules.json)       │
                                      └───────────┬────────────┘
                                                  │ 2. Consumes
                                                  ▼
┌──────────────────┐   4. Validates   ┌────────────────────────┐
│  Test Results    │◄───────────────┤  Frontend TestSpoilers │
│     (UI)         │                  │    (testSpoilerUI.js)  │
└──────────────────┘                  └────────────────────────┘
```

### Stage 1: Python Source & Spoiler Log Generation

-   **Source of Truth:** The game generation process, orchestrated by `Generate.py`, is the source of truth. When run with a spoiler level of 2 or higher (`--spoiler 2`), it produces a detailed log of the game's logical progression.
-   **Spoiler Log (`_spheres_log.jsonl`):** This file is the ground truth for our testing. It contains a sequence of "spheres," where each sphere lists the locations that become accessible after collecting all the items from the previous spheres.

### Stage 2: The Exporter (`exporter/`)

-   During the same `Generate.py` run, our custom exporter is triggered.
-   **`exporter.py`**: This script orchestrates the process of parsing the game's rules, regions, and items.
-   **`analyzer.py`**: This uses Python's `ast` module to convert the game's logic into our standardized JSON rule tree format.

### Stage 3: JSON Data Files

The generation and export process creates two critical JSON files for each seed:

1.  **`..._rules.json`**: A complete dump of the entire game's logic, including all region data, location rules, item definitions, and game settings, translated into the JSON format that our frontend understands. This is the logic that will be **under test**. The structure of this file follows the schema defined in `frontend/schema/rules.schema.json`.
2.  **`..._spheres_log.jsonl`**: The list of progression spheres, which serves as the **expected result**. Each sphere contains the set of locations that should become accessible at that stage.

### Stage 4: Frontend Test Execution (`frontend/modules/testSpoilers/`)

The **Test Spoilers** panel in the web client is the user interface for this pipeline.

-   **Loading:** The test automatically loads the `_rules.json` file into the `StateManager` worker, configuring it with the specific logic for that seed. It then loads the corresponding `_spheres_log.jsonl` file.
-   **Execution & Validation:** When you click "Run Full Test," the `testSpoilerUI.js` module simulates a full playthrough sphere by sphere:
    1.  It starts with an empty inventory.
    2.  It gets the list of accessible locations from the frontend `StateManager`.
    3.  It compares this list against the locations in Sphere 0 from the spoiler log. Any mismatch is reported as a failure.
    4.  It commands the `StateManager` to "check" all locations from the current sphere, which adds all of their items to the inventory.
    5.  After the state updates, it again gets the list of accessible locations.
    6.  It compares this new list against the locations in the next sphere from the spoiler log.
    7.  This process repeats until all spheres have been checked or a mismatch is found.

### Stage 5: Results

-   **Pass/Fail:** The result of each sphere comparison is displayed in the UI. A green entry indicates a match, while a red entry indicates a mismatch.
-   **Mismatch Details:** In case of a failure, the UI provides a detailed report showing which locations were accessible in the frontend but not in the log, and vice-versa. Location names in the report are clickable links for easier debugging in the "Regions" panel.

## Running Automated Tests with Playwright

The entire pipeline can be run automatically from the command line using Playwright, which is the primary method for ensuring code quality.

-   **Test Mode:** Running `npm test` launches the web client with URL parameters. You can specify `--mode`, `--game`, `--seed`, and `--rules` parameters to customize the test configuration.
-   **Auto-Execution:** In "test" mode, the application automatically loads a predefined test configuration (`playwright_tests_config.json`).
-   **Window Property Bridge:** Upon completion, the in-browser test writes a summary of the results to `window.__playwrightTestResults__`.
-   **Validation:** The Playwright script (`tests/e2e/app.spec.js`) waits for the `window.__playwrightTestsComplete__` flag, reads the results, and asserts that all tests passed, reporting the final outcome to the command line.

This end-to-end pipeline ensures a high degree of confidence that the frontend client is a faithful and accurate implementation of Archipelago's game progression logic.

### Multiplayer Testing

The project includes end-to-end multiplayer tests that verify client-server communication and location check synchronization between multiple clients.

**Test Configurations:**

The multiplayer tests (`tests/e2e/multiplayer.spec.js`) support two configurations:

1. **Multi-Client Test (Default)**: Tests both clients simultaneously
   - Client 1: Sends location checks via automatic timer
   - Client 2: Receives location checks from the server
   - Verifies that both clients stay synchronized
   - Run with: `npx playwright test tests/e2e/multiplayer.spec.js`

2. **Single-Client Test**: Tests only one client
   - Useful for debugging client connection and timer functionality
   - Run with: `ENABLE_SINGLE_CLIENT=true npx playwright test tests/e2e/multiplayer.spec.js`

**Running Multiplayer Tests:**

```bash
# Run multi-client test (default)
npx playwright test tests/e2e/multiplayer.spec.js

# Run multi-client test in headed mode (visible browser)
npx playwright test tests/e2e/multiplayer.spec.js --headed

# Run single-client test
ENABLE_SINGLE_CLIENT=true npx playwright test tests/e2e/multiplayer.spec.js

# Run single-client test in headed mode
ENABLE_SINGLE_CLIENT=true npx playwright test tests/e2e/multiplayer.spec.js --headed

# Run specific test by name
npx playwright test tests/e2e/multiplayer.spec.js -g "multiplayer timer test"
```

**What the Tests Verify:**

- **Server Connection**: Both clients successfully connect to the Archipelago server
- **Auto-Connect**: URL parameters (`autoConnect=true`, `server`, `playerName`) work correctly
- **Location Checks**: Client 1 sends location checks that are received by the server
- **Synchronization**: Client 2 receives all location checks sent by Client 1
- **Inventory Updates**: Both clients maintain synchronized inventory state
- **Server Management**: Tests automatically start and stop a local Archipelago server

**Test Architecture:**

- Tests use URL parameters to configure clients: `?mode=test-multiplayer-client1&autoConnect=true&server=ws://localhost:38281&playerName=Player1`
- Each test mode loads a specific test configuration (`playwright_tests_config-client1.json` or `playwright_tests_config-client2.json`)
- The tests automatically handle server lifecycle (start before test, stop after test)
- Results are saved to `test_results/multiplayer/` with detailed logs and summaries

**Prerequisites:**

- A development server running on `localhost:8000` (start with `python -m http.server 8000`)
- The `MultiServer.py` script must be accessible in the project root
- An Archipelago seed file in `frontend/presets/adventure/AP_14089154938208861744/`

## Automated Testing Across All Templates

For testing multiple games efficiently, use the automated testing script that handles the complete pipeline for all templates:

### Quick Start with Automation

**⚠️ IMPORTANT: Prerequisites Required**

```bash
# 1. Activate your virtual environment (REQUIRED)
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Start the development server (REQUIRED - in another terminal)
python -m http.server 8000

# 3. Run the automation script
# Test all templates in the default Templates directory
python scripts/test/test-all-templates.py

# Test templates from a custom directory
python scripts/test/test-all-templates.py --templates-dir /path/to/templates

# Custom output file location
python scripts/test/test-all-templates.py --output-file custom-results.json

# Customize which files to skip (default skips non-game templates)
python scripts/test/test-all-templates.py --skip-list "Archipelago.yaml" "Universal Tracker.yaml"

# Test all files (including non-games) by providing an empty skip list
python scripts/test/test-all-templates.py --skip-list

# Test only specific templates (include list overrides skip list)
python scripts/test/test-all-templates.py --include-list "Adventure.yaml" "A Short Hike.yaml"

# Test a single template
python scripts/test/test-all-templates.py --include-list "Adventure.yaml"

# NEW: Partial execution modes
# Only run generation (export) step, skip spoiler tests
python scripts/test/test-all-templates.py --export-only

# Only run spoiler tests, skip generation (requires existing rules files)
python scripts/test/test-all-templates.py --spoiler-only

# Start processing from a specific template file (alphabetically ordered)
python scripts/test/test-all-templates.py --start-from "Adventure.yaml"
```

**Prerequisites:**
- **Virtual Environment**: The script will detect and warn if not activated. Generation may freeze without proper dependencies.
- **HTTP Server**: Required for spoiler tests (not needed for `--export-only`). The script will exit with a clear error if not running on `localhost:8000`.
- **Playwright Setup**: If running spoiler tests, ensure you've installed Playwright browsers: `npx playwright install chromium` (see `../getting-started.md` for details).

### New Execution Modes

The script now supports partial execution and resumption options for more flexible testing workflows:

**`--export-only`**: Only runs the generation (export) step, skipping all spoiler tests
- **Use case**: Quickly generate rules files for multiple games without running time-consuming tests
- **No HTTP server required**: Can run without the development server
- **Fast bulk processing**: Ideal for generating data files for later analysis

**`--spoiler-only`**: Only runs spoiler tests, skipping the generation step  
- **Use case**: Re-test games after fixing JavaScript rule engine issues without regenerating data
- **Requires existing files**: Rules and sphere log files must already exist from a previous run
- **Efficient debugging**: Test logic fixes without waiting for generation

**`--start-from`**: Begin processing from a specific template file, skipping all files before it alphabetically
- **Use case**: Resume testing after interruption or start from a specific game
- **Alphabetical ordering**: Files are processed in sorted order, so you can predict the sequence
- **Recovery**: Perfect for continuing long test runs that were interrupted

The automation script (`scripts/test/test-all-templates.py`) provides:

- **Complete Pipeline Automation**: Runs Generate.py, spoiler tests, and analysis for each template
- **Partial Execution Modes**: Use `--export-only` or `--spoiler-only` to run specific pipeline stages
- **Resume from Point**: Use `--start-from` to continue processing from a specific template file  
- **Comprehensive Metrics**: Captures error/warning counts, sphere progression, and pass/fail status
- **Smart Filtering**: Automatically skips non-game templates by default, with options for custom skip/include lists
- **Targeted Testing**: Use `--include-list` to test only specific templates, perfect for retesting after fixes
- **Incremental Updates**: Results saved after each template to prevent data loss
- **Detailed JSON Output**: Structured results with timestamps and diagnostic information
- **Progress Tracking**: Real-time feedback and summary statistics

**Output Location**: Results are saved to `scripts/output/template-test-results.json` with complete metrics for each game including:
- Generation success/failure with error and warning counts
- Spoiler test results with sphere progression details  
- First error/warning lines for quick debugging
- Execution timestamps and performance data

This automated approach is ideal for regression testing, validating multiple games simultaneously, or generating comprehensive test reports across the entire game catalog.

### Test Results Visualization

After running the automation script, generate a visual chart of the test results:

```bash
# Generate chart with default settings (outputs to docs/json/developer/guides/test-results.md)
python scripts/docs/generate-test-chart.py

# Use custom input/output locations
python scripts/docs/generate-test-chart.py --input-file custom-results.json --output-file custom-chart.md
```

The chart generation script (`scripts/docs/generate-test-chart.py`) creates a comprehensive markdown table showing:

- **Game Name**: Human-readable game names
- **Test Result**: Pass/fail status with visual indicators (✅ ❌ ❓)
- **Generation Errors**: Count of errors during world generation
- **Sphere Reached**: How far the test progressed before completion/failure
- **Max Spheres**: Total logical spheres available in the game
- **Progress**: Visual progress indicators with percentages

**📊 [View Current Test Results](test-results.md)** - Live status of all template tests

The generated chart includes summary statistics, color-coded progress indicators, and detailed notes explaining each metric. This provides an at-a-glance overview of the health of all game templates and helps identify which games may need attention.

## Running the Complete Testing Pipeline (Manual Process)

To test a new game implementation, follow these steps:

### Prerequisites

**⚠️ IMPORTANT: Complete Development Environment Setup First**

Before following these testing instructions, you must first set up your development environment by following the steps in `../getting-started.md`. This includes:

- Setting up a Python virtual environment (`.venv`)
- Installing required dependencies (`pip install -r requirements.txt`)
- Configuring your local development server

If you skip the getting-started setup, you may encounter dependency errors or other issues during the testing process.

### Testing-Specific Prerequisites

1. **Clear Players Directory:** Ensure the main `Players/` directory contains no `.yaml` files. This prevents Archipelago from treating them as additional players in multiworld generation. The `Players/Templates/` subdirectory should contain all template files.

2. **Generate Template Files:** If not already done, generate template files:
   ```bash
   python -c "from Options import generate_yaml_templates; generate_yaml_templates('Players/Templates')"
   ```

3. **Configure Settings:** In `host.yaml`, verify the appropriate testing settings are enabled. Use the `scripts/setup/update_host_settings.py` script for easy configuration:

   **For minimal spoiler testing** (basic sphere validation):
   ```bash
   python scripts/setup/update_host_settings.py minimal-spoilers
   ```

   **For full spoiler testing** (includes all location tracking):
   ```bash
   python scripts/setup/update_host_settings.py full-spoilers
   ```

   **For normal operation** (disable testing features):
   ```bash
   python scripts/setup/update_host_settings.py normal
   ```

4. **Understand Spoiler Levels:** The `spheres_log.jsonl` file is only generated when spoiler level is 2 or higher. Since the default is level 3, sphere logs are generated by default. Command line options:
   - `--spoiler 0` (NONE): No spoiler files generated
   - `--spoiler 1` (BASIC): Only Spoiler.txt without playthrough or paths
   - `--spoiler 2` (PLAYTHROUGH): Spoiler.txt with playthrough + spheres_log.jsonl
   - `--spoiler 3` (FULL): Spoiler.txt with playthrough and paths + spheres_log.jsonl

### Step-by-Step Process

1. **Choose Your Game:** Select a game to test (e.g., "A Hat in Time"). Find the corresponding:
   - Template file name (e.g., "A Hat in Time.yaml")
   - Python directory (e.g., "worlds/ahit")

2. **Create Game-Specific Exporter (if needed):** In `exporter/games/`, create a new file for your game if it doesn't exist (e.g., `exporter/games/ahit.py`). Base it on `exporter/games/generic.py`.

3. **Generate Test Data:** Run Generate.py for your chosen game:
   ```bash
   # Activate your virtual environment first
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   
   # Then run the generation command
   python Generate.py --weights_file_path "Templates/A Hat in Time.yaml" --multi 1 --seed 1 > generate_output.txt
   ```
   
   **Understanding Seeds and Output Filenames:**
   
   When you specify `--seed 1`, the output filename will always be predictable and consistent: `AP_14089154938208861744`. This makes automation and testing easier because you know exactly what files will be generated.
   
   The output directory structure follows this pattern:
   - **Template file:** `Templates/A Hat in Time.yaml`
   - **Output directory:** `frontend/presets/ahit/` (based on world_directory mapping)
   - **Generated files:** All prefixed with `AP_14089154938208861744`
   
   Examples of the directory naming convention:
   - `"A Hat in Time.yaml"` → `ahit/`
   - `"A Short Hike.yaml"` → `shorthike/`  
   - `"Adventure.yaml"` → `adventure/`
   
   **Note:** Directory names are determined by the `world_directory` field in `scripts/data/world-mapping.json`, not by converting spaces to underscores.
   
   **Important:** Use `"Templates/[GameName].yaml"` as the path, **not** `"Players/Templates/[GameName].yaml"`. The `--weights_file_path` is relative to the `player_files_path` setting in `host.yaml` (which defaults to "Players"), so the full path becomes `Players/Templates/[GameName].yaml` automatically.
   
   **Check for Export Errors:** Examine `generate_output.txt` for error messages or parsing failures. If errors exist:
   - Fix game-specific issues in your `exporter/games/[game].py` file
   - Fix general exporter bugs in the main exporter code
   
   This creates files in `frontend/presets/[game]/AP_[seed]/`:
   - `AP_[seed].archipelago`
   - `AP_[seed]_rules.json` (the logic under test)
   - `AP_[seed]_spheres_log.jsonl` (the expected progression)
   - `AP_[seed]_Spoiler.txt`

4. **Run the Test:** Execute the spoiler validation using URL parameters to specify your test configuration.

   **Note:** If this is your first time running tests, make sure you've completed the test setup in `../getting-started.md` including `npm install` and `npx playwright install chromium`.

   **Basic Usage:**
   ```bash
   # Test with game parameter (recommended, seed defaults to 1)
   npm test --mode=test-spoilers --game=ahit
   
   # Test with specific seed (if different from default)
   npm test --mode=test-spoilers --game=ahit --seed=5
   
   # Test with specific rules file (alternative)
   npm test --rules=./presets/ahit/AP_14089154938208861744/AP_14089154938208861744_rules.json
   ```
   
   **Available Test Variants:**
   ```bash
   # Basic test (seed defaults to 1)
   npm test --mode=test-spoilers --game=alttp
   
   # With visible browser (useful for debugging)
   npm run test:headed --mode=test-spoilers --game=alttp
   
   # With debug mode
   npm run test:debug --mode=test-spoilers --game=alttp
   
   # With Playwright UI
   npm run test:ui --mode=test-spoilers --game=alttp
   
   # Test with specific seed (if different from default)
   npm test --mode=test-spoilers --game=adventure --seed=5
   ```
   
   **Parameter Methods Explained:**
   
   There are two ways to specify test parameters:
   
   1. **URL Parameters (Recommended):**
      - `npm test --mode=test-spoilers --game=ahit`
      - Parameters become URL query strings in the test browser
      - Clean and intuitive command-line interface
   
   2. **Environment Variables (Legacy):**
      - `RULES_OVERRIDE=./presets/ahit/AP_14089154938208861744/AP_14089154938208861744_rules.json npm test`
      - Direct file path specification
      - Still supported but less convenient
   
   **Advantages of URL Parameter Approach:**
   - No need to modify configuration files for temporary testing
   - Easy to test multiple rule sets without file conflicts
   - Cleaner git history (no configuration file changes)
   - Command-line friendly for automation and scripting
   - Preserves original modes.json configuration
   
   **Alternative Method (not recommended):** You can also configure the test by editing `frontend/modes.json`, but using the URL parameter is preferred:
   ```json
   "test-spoilers": {
     "rulesConfig": {
       "path": "./presets/a_hat_in_time/AP_14089154938208861744/AP_14089154938208861744_rules.json",
       "enabled": true
     },
     "testsConfig": {
       "path": "./playwright_tests_config-spoilers.json",
       "enabled": true
     }
   }
   ```
   
   **Result Analysis:** After testing, run `npm run test:analyze` to generate a comprehensive, easier-to-read analysis saved to `playwright-analysis.txt`.
   
   **Available Parameters:**
   - `--mode`: Specifies the test mode (e.g., `test`, `test-spoilers`, `test-full`, `test-regression`)
   - `--game`: Specifies the game to test (e.g., `alttp`, `adventure`, `a_hat_in_time`)
   - `--seed`: Specifies the seed number for testing (defaults to 1 if not specified)
   - `--rules`: Path to the rules JSON file to use for testing
   
   This analysis includes:
   - Structured test failure details with clear error messages
   - Performance metrics and timing information
   - Organized error logs grouped by category
   - Specific mismatch details for failed spoiler tests

### Understanding Test Results

**Success:** If the JavaScript implementation matches the Python logic perfectly, the test passes with no mismatches.

**Failures:** Mismatches indicate areas where the JavaScript `RuleEngine` needs improvement:
- **Unknown rule types:** Missing support for game-specific rule types (e.g., "capability" rules)
- **Region reachability issues:** Incorrect logic for determining accessible areas
- **Helper function gaps:** Missing game-specific logic implementations

### Common Issues and Solutions

#### Issue: Unknown Rule Types
```
[ruleEngine] [evaluateRule] Unknown rule type: capability
```
**Solution:** Implement support for the rule type in the JavaScript `RuleEngine`.

#### Issue: Region Reachability Mismatches
```
REGION MISMATCH: Regions accessible in LOG but NOT in STATE: Badge Seller, Mafia Town Area
```
**Solution:** Check region access rules and implement missing helper functions.

#### Issue: Location Accessibility Mismatches
```
> Locations accessible in STATE (and unchecked) but NOT in LOG: Collect 15 Seashells
```
**Solution:** The JavaScript rule engine is making a location accessible that shouldn't be at this sphere. Check the corresponding rule in `worlds/[game]/Rules.py`. For example, "Collect 15 Seashells" might have a rule like:
```python
add_rule(multiworld.get_location("Collect 15 Seashells", player),
    lambda state: state.has("Seashell", player, 15))
```
This indicates the location requires collecting 15 Seashells before being accessible.

#### Issue: Players Directory Conflicts
If Generate.py picks up the wrong game, ensure no `.yaml` files exist in the main `Players/` directory.

### Implementing Fixes

When tests fail, create game-specific helper functions:

1. **Create Game Directory:** In `frontend/modules/shared/gameLogic/`, create a subdirectory for your game (e.g., `a_hat_in_time/`) based on the contents of the "generic" subdirectory

2. **Implement Helpers:** Base your JavaScript implementations on the Python functions found in `worlds/[game]/` directory. Key files to examine:
   - **`worlds/[game]/Rules.py`**: Contains the main location access rules and helper function calls
   - **`worlds/[game]/Regions.py`**: Defines region connections and exit rules  
   - **`worlds/[game]/Items.py`**: Item definitions and properties
   - **`worlds/[game]/Options.py`**: Game-specific settings that affect rule logic
   
   Look for `add_rule()` calls in `Rules.py` that reference your failing location name. The spoiler test will report missing helper functions or logic mismatches.

3. **Test Iteratively:** Re-run `npm test --mode=test-spoilers --game=[yourgame]` after each fix until all mismatches are resolved

### Debugging Tips

**Recommended Debugging Workflow:**
1. **Run Analysis**: Always run `npm run test:analyze` after a failed test for cleaner error reporting
2. **Identify Root Cause**: Look for the specific location name in the mismatch details
3. **Find Python Rule**: Search for the location name in `worlds/[game]/Rules.py` using grep or your editor
4. **Understand Requirements**: Examine the `add_rule()` call to understand what items/conditions are needed
5. **Check Item Names**: Verify that item names in the Python rules match those in your JavaScript implementation
6. **Test Incrementally**: Make one fix at a time and re-run tests to isolate issues

**Interactive Debugging:**
- Use `npm run test:headed --mode=test-spoilers --game=[yourgame]` to see the test running in a visible browser
- Check browser console for detailed rule evaluation logs
- Use the "Regions" panel to manually verify accessibility logic
- Compare failing locations between the spoiler log and current state output

**Example Debugging Session:**
```bash
# 1. Run test and get failure
npm test --mode=test-spoilers --game=a_short_hike

# 2. Generate readable analysis
npm run test:analyze

# 3. Examine the analysis file
cat playwright-analysis.txt

# 4. Look up the failing location rule
grep -n "Collect 15 Seashells" worlds/shorthike/Rules.py

# 5. Implement fix in exporter and retry
```

### Advanced Debugging Patterns

**Pattern 1: Multiple Location Failures → Variable Resolution Issue**

If you see many locations failing simultaneously that should require different counts of the same item:
```
> Locations accessible in STATE but NOT in LOG: Secret Island Peak, Lighthouse Golden Chest, North Cliff Golden Chest...
```

**Root Cause**: Lambda default parameters with variable references aren't being resolved.
```python
# Python uses closure variables
lambda state, min_feathers=min_feathers: state.has("Golden Feather", player, min_feathers)
```

**Solution**: Implement variable resolution in the analyzer to access function `__defaults__`.

**Pattern 2: Single Location with Count Requirements → Rule Engine Bug**

If one specific location fails that should require a certain quantity:
```
> Locations accessible in STATE but NOT in LOG: Collect 15 Seashells
```

**Root Cause**: Rule engine not properly handling count fields in `item_check` rules.
```json
// Generated rule has count field
{"type": "item_check", "item": "Seashell", "count": {"type": "constant", "value": 15}}
```

**Solution**: Enhance JavaScript rule engine to check `rule.count` in `item_check` cases.

**Pattern 3: Progressive Test Improvement**

Good debugging shows **progressive sphere advancement**:
1. **Initial**: Fails at Sphere 1.1 with 8 locations (major issue)
2. **After fix**: Fails at Sphere 1.2 with 1 location (minor issue)  
3. **After final fix**: All 37 spheres pass (success)

This indicates you're systematically resolving issues from major to minor.

**Pattern 4: Systematic Issue Classification**

| Error Type | Typical Cause | Fix Location |
|------------|---------------|--------------|
| 8+ locations failing | Variable resolution | `exporter/analyzer.py` |
| 1-2 locations failing | Rule engine logic | `frontend/modules/shared/ruleEngine.js` |
| Helper function errors | Missing game helpers | `exporter/games/[game].py` |
| Region mismatches | Area access logic | Game-specific helpers |

### Common Anti-Patterns to Avoid

**❌ Location-Specific Hardcoding**
```python
# Don't do this
if location_name == "Secret Island Peak":
    return {"type": "item_check", "item": "Golden Feather", "count": 5}
```

**✅ General Pattern Recognition**
```python
# Do this instead - resolve variables generically
if rule.count and rule.count.type == 'name':
    resolved_value = self.resolve_variable(rule.count.name)
    if resolved_value is not None:
        rule.count = {'type': 'constant', 'value': resolved_value}
```

**❌ Game-Specific Rule Engine Changes**
Don't modify the rule engine for specific games - make it handle patterns generically.

**✅ Universal Rule Engine Enhancements**
```javascript
// Enhance item_check to handle count universally
if (rule.count !== undefined) {
  // Use count-based checking for any game
  result = currentCount >= requiredCount;
}
```

### Recognizing Systemic vs Game-Specific Issues

**🔧 Systemic Issues (Fix in Core Code)**
- **Multiple games affected**: If the same pattern fails across different games
- **Fundamental rule types**: Issues with `item_check`, `count_check`, `and`, `or` logic
- **Variable resolution**: Lambda default parameters not being resolved
- **Count handling**: Any item quantity requirement failures

**🎮 Game-Specific Issues (Fix in Game Exporter)**  
- **Unknown helper functions**: `can_fly`, `has_sword`, `can_melt_things`
- **Custom rule types**: Game-specific logic patterns
- **Unique mechanics**: Special item interactions or requirements
- **Single game failures**: Only one game shows the issue

**💡 Key Insight**: Our A Short Hike debugging revealed **two systemic issues** that benefit all games:
1. **Variable resolution in analyzer** - helps any game using lambda defaults
2. **Count support in rule engine** - fixes item quantity checks universally

This systematic approach ensures the JavaScript client faithfully replicates the authoritative Python game logic for accurate progression tracking.