# Multiworld Sphere Fuzz Test

[<- Back to Fuzz Tests Overview](./test-fuzz.md) | [View Test Results](../test-results/test-results-multiworld-ut-fuzz.md)

## Overview

The Multiworld Sphere Fuzz test validates that games can work together in a **multiworld** configuration with **randomized options**. Unlike single-player fuzz tests that test one game at a time, this test builds an increasingly large multiworld by adding games one-by-one and validating the entire multiworld after each addition.

**Note:** Despite the filename (`test-multiworld-ut-fuzz.py`), this test does **not** use Universal Tracker. It validates purely through Python-side sphere analysis, checking that each player's victory condition can be met. The "UT" in the name is historical — the original intent was to run UT validation against multiworld seeds, but UT creates single-player worlds internally, so cross-world item dependencies are lost. Proper multiworld UT support would require extensive changes to how UT tracks state across players. This may be revisited in the future.

## How It Works

### Assembly Process

1. **Start with an empty multiworld** directory
2. **For each game template:**
   - Generate a random YAML configuration using `fuzz.py`
   - Add the YAML to the multiworld directory
   - Attempt to generate a combined seed with all games
   - Run sphere validation on the generated multiworld
   - If validation passes, keep the game; if it fails, remove it
3. **Track results** for each game tested

### Sphere Validation

| What It Checks | How |
|----------------|-----|
| Victory condition | Collects all items, verifies each player's completion condition is met |
| Cross-world item flow | Items from other players can unlock expected locations |
| Multiworld compatibility | Games work correctly together |

Sphere validation catches:
- Victory conditions that cannot be met with certain option combinations
- Cross-world interactions that break game completion
- Option combinations that create impossible configurations

### Victory vs Reachability

The test uses **victory condition** as the pass/fail criterion, not full location reachability. This is important because some games have **self-locking items** — locations that are intentionally unreachable because the item needed to access them is placed at that location. These games are designed so that not all locations need to be checkable for the game to be completable.

When unreachable locations are detected but the victory condition is met, the test **passes** and logs the unreachable count as informational.

### Example Output

```
Player 3 (Game Name): Victory OK, but 12 unreachable locations (self-locking items?)
```

This means the game can be completed (victory condition met) even though 12 locations can't be reached. This is expected behavior for some games.

### Validation Failure

A test fails when the victory condition **cannot be met** even with all items collected:

```
Player 1 (Super Mario Land 2): Victory condition not met (101 unreachable locations)
```

This indicates a real problem — the game cannot be completed with the given option combination in this multiworld configuration.

## Test Results Interpretation

### Status Types

| Status | Meaning |
|--------|---------|
| **Passed** | All validation runs succeeded |
| **Failed** | One or more validation failures occurred |
| **All Gen Failed** | All generation attempts failed (couldn't even generate the multiworld) |
| **Pending** | Game added but not yet tested (need 2+ players) |
| **Error** | Infrastructure error during testing |

### Success Rate Breakdown

The success rate shows: `X% (success/total, Y gen fail)`

- **success**: Runs where generation AND validation both succeeded
- **total**: Total number of test runs attempted
- **gen fail**: Runs where generation failed (option-related errors, timeouts)

Example: `67% (2/3, 1 gen fail)` means:
- 3 total runs
- 1 run had a generation failure (e.g., timeout or option conflict)
- 2 runs generated successfully
- Both successful generations passed validation
- Result: 2/3 = 67% success rate

### Generation Failures vs Validation Failures

| Type | When It Occurs | Counted As |
|------|----------------|------------|
| **Generation Failure** | Seed couldn't be generated (timeout, option conflict, fill error) | Tracked separately, doesn't count as test failure |
| **Validation Failure** | Seed generated but victory condition not met | Counts as test failure |

Generation failures are often caused by:
- Option combinations that create impossible fills
- Timeouts during complex generation
- Game-specific validation errors

These are tracked separately because they indicate option incompatibility, not logic bugs.

## Player Attribution

When a validation failure occurs, the error shows which **player** failed:

```
Players failed: 1
  - Player 1: Player 1 (Super Mario Land 2): Victory condition not met (9 unreachable locations)
```

**Important:** The failure is attributed to the **newly added game**, even if a different player in the multiworld actually failed. This is because adding a new game changes the item distribution and can affect other games' completion.

For example:
- Testing "TOEM original" (newly added as Player 10)
- Player 1 "Super Mario Land 2" fails validation
- The test marks "TOEM original" as failed

This happens because:
1. Adding TOEM original changed how items are distributed across the multiworld
2. This redistribution may have moved critical items away from Super Mario Land 2
3. The specific random option combination created an incompatible configuration

## Running the Test

### Basic Usage

```bash
# Run with default settings (3 runs per game, seed=1, sphere validation)
python scripts/test/test-multiworld-ut-fuzz.py

# Custom number of runs
python scripts/test/test-multiworld-ut-fuzz.py --runs 5

# Custom seed
python scripts/test/test-multiworld-ut-fuzz.py --seed 42

# Longer timeout for slow games
python scripts/test/test-multiworld-ut-fuzz.py --timeout 120

# Test specific games
python scripts/test/test-multiworld-ut-fuzz.py --include-list "Adventure.yaml" "Dark Souls III.yaml"
```

### GitHub Workflow

The workflow (`test-multiworld-ut-fuzz.yml`) runs sphere validation with configurable parameters:
- `runs_per_test`: Number of test runs per game addition
- `seed`: Base random seed for reproducibility
- `max_players`: Maximum number of players in multiworld
- `timeout`: Timeout per generation in seconds

### Output

Results are saved to:
- `scripts/output/multiworld-ut-fuzz/test-results-fixed-seed.json` (seed=1)
- `scripts/output/multiworld-ut-fuzz/test-results-random-seed.json` (random seeds)

The markdown report is generated at:
- `docs/json/developer/test-results/test-results-multiworld-ut-fuzz.md`

## Files and Components

| Component | Path |
|-----------|------|
| Test script | `scripts/test/test-multiworld-ut-fuzz.py` |
| Fuzzer hook | `worlds/tracker/fuzzer_hook.py` |
| Results JSON | `scripts/output/multiworld-ut-fuzz/` |
| Chart generator | `scripts/docs/generate_multiworld_ut_fuzz_chart.py` |
| Results markdown | `docs/json/developer/test-results/test-results-multiworld-ut-fuzz.md` |

## Ignored Error Patterns

Certain generation errors are "ignored" (not counted as failures) because they're expected from random option combinations:

- Fill errors: "Not enough filler/trap items", "No more spots to place"
- Pool errors: "Failed to limit item pool size", "Too many locations created"
- Game-specific: "Invalid OC2 settings", "OC2 needs at least"
- Option conflicts: "You cannot make bosses required when progression dungeons are disabled"

See `IGNORED_ERROR_PATTERNS` in `worlds/tracker/fuzzer_hook.py` for the full list.

## Relationship to Other Tests

| Test | Single-Player | Multi-Player | Random Options |
|------|:-------------:|:------------:|:--------------:|
| Spoiler Test | Yes | No | No |
| UT Fuzz Test | Yes | No | Yes |
| **Multiworld Sphere Fuzz** | No | Yes | Yes |
| Multiclient Test | No | Yes | No |

The Multiworld Sphere Fuzz test is unique in testing both multiworld compatibility AND random option combinations together.

## Related Documentation

- [Fuzz Tests Overview](./test-fuzz.md) - General fuzz testing concepts
- [Fuzzer Debugging Guide](../guides/fuzzer-debugging.md) - Debugging fuzz test failures
