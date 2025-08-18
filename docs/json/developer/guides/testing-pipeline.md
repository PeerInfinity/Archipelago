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

1.  **`..._rules.json`**: A complete dump of the entire game's logic, including all region data, location rules, item definitions, and game settings, translated into the JSON format that our frontend understands. This is the logic that will be **under test**.
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

-   **Test Mode:** Running `npm test` launches the web client with the `?mode=test` URL parameter.
-   **Auto-Execution:** In "test" mode, the application automatically loads a predefined test configuration (`playwright_tests_config.json`).
-   **`localStorage` Bridge:** Upon completion, the in-browser test writes a summary of the results to `localStorage`.
-   **Validation:** The Playwright script (`tests/e2e/app.spec.js`) waits for this `localStorage` flag, reads the results, and asserts that all tests passed, reporting the final outcome to the command line.

This end-to-end pipeline ensures a high degree of confidence that the frontend client is a faithful and accurate implementation of Archipelago's game progression logic.

## Running the Complete Testing Pipeline

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

3. **Configure Settings:** In `host.yaml`, verify:
   ```yaml
   skip_required_files: true
   save_sphere_log: true
   log_fractional_sphere_details: true
   log_integer_sphere_details: false
   ```
   (Use the `scripts/update_host_settings.py` script for easy configuration)

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
   
   **Important:** Use `"Templates/[GameName].yaml"` as the path, **not** `"Players/Templates/[GameName].yaml"`. The `--weights_file_path` is relative to the `player_files_path` setting in `host.yaml` (which defaults to "Players"), so the full path becomes `Players/Templates/[GameName].yaml` automatically.
   
   **Check for Export Errors:** Examine `generate_output.txt` for error messages or parsing failures. If errors exist:
   - Fix game-specific issues in your `exporter/games/[game].py` file
   - Fix general exporter bugs in the main exporter code
   
   This creates files in `frontend/presets/[game]/AP_[seed]/`:
   - `AP_[seed].archipelago`
   - `AP_[seed]_rules.json` (the logic under test)
   - `AP_[seed]_spheres_log.jsonl` (the expected progression)
   - `AP_[seed]_Spoiler.txt`

4. **Run the Test:** Execute the spoiler validation using the `rules` URL parameter to specify your rules file:
   
   **Basic Usage:**
   ```bash
   # Test with your specific rules file using the rules parameter
   RULES_OVERRIDE=./presets/a_hat_in_time/AP_14089154938208861744/AP_14089154938208861744_rules.json npm run test:spoilers
   
   # Or use the pre-configured script for rules override
   npm run test:spoilers:rules
   ```
   
   **Available Test Variants:**
   ```bash
   # Basic test with rules override
   RULES_OVERRIDE=./presets/[game]/AP_[seed]/AP_[seed]_rules.json npm run test:spoilers
   
   # With visible browser (useful for debugging)
   RULES_OVERRIDE=./presets/[game]/AP_[seed]/AP_[seed]_rules.json npm run test:spoilers:headed
   
   # With debug mode
   RULES_OVERRIDE=./presets/[game]/AP_[seed]/AP_[seed]_rules.json npm run test:spoilers:debug
   
   # With Playwright UI
   RULES_OVERRIDE=./presets/[game]/AP_[seed]/AP_[seed]_rules.json npm run test:spoilers:ui
   
   # Using the pre-configured Adventure rules script
   npm run test:spoilers:rules
   npm run test:spoilers:rules:headed
   ```
   
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
   
   **Result Analysis:** After testing, run `npm run test:analyze` to generate a comprehensive, easier-to-read analysis saved to `playwright-analysis.txt`. This analysis includes:
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

3. **Test Iteratively:** Re-run `npm run test:spoilers` after each fix until all mismatches are resolved

### Debugging Tips

**Recommended Debugging Workflow:**
1. **Run Analysis**: Always run `npm run test:analyze` after a failed test for cleaner error reporting
2. **Identify Root Cause**: Look for the specific location name in the mismatch details
3. **Find Python Rule**: Search for the location name in `worlds/[game]/Rules.py` using grep or your editor
4. **Understand Requirements**: Examine the `add_rule()` call to understand what items/conditions are needed
5. **Check Item Names**: Verify that item names in the Python rules match those in your JavaScript implementation
6. **Test Incrementally**: Make one fix at a time and re-run tests to isolate issues

**Interactive Debugging:**
- Use `npm run test:spoilers:headed` to see the test running in a visible browser
- Check browser console for detailed rule evaluation logs
- Use the "Regions" panel to manually verify accessibility logic
- Compare failing locations between the spoiler log and current state output

**Example Debugging Session:**
```bash
# 1. Run test and get failure
RULES_OVERRIDE=./presets/a_short_hike/AP_[seed]/AP_[seed]_rules.json npm run test:spoilers

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