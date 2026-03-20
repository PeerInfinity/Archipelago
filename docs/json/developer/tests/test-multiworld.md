# Multiworld Test

[← Back to Test Results](../test-results/test-results-multiworld.md)

## Overview

The Multiworld Test validates that multiple different games can be combined together in a single Archipelago multiworld without conflicts. Unlike the spoiler tests (which test one game at a time), the multiworld test generates a world with multiple game templates and validates that all players can complete the game.

This test does **not** require a network connection - it runs the same offline logic validation as the spoiler tests, but with multiple games combined in one world.

## What It Tests

1. **Multi-game generation**: Multiple different game templates can be combined into a single multiworld without generation errors
2. **Cross-game item placement**: Items can be placed across different games without causing logic errors
3. **Combined rule evaluation**: The Rule Builder correctly evaluates rules when multiple games share a world
4. **Player isolation**: Each player's game logic works correctly when other games are present

## Test Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Test Orchestration                            │
│            (test-all-templates.py --multiworld)                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. Check prerequisites                                             │
│     - Spoiler minimal test must pass                                │
│     - Spoiler full test must pass                                   │
│     - Multiclient test must pass                                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Add template to multiworld directory                            │
│     - Templates are sorted alphabetically                           │
│     - Position determines player number                             │
│     - Maximum templates configurable (default: 10)                  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Generate multiworld (Generate.py)                               │
│     - All templates in directory are combined                       │
│     - Items distributed across all games                            │
│     - Rules exported for each player                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Run spoiler test for each player                                │
│     - Validates sphere-by-sphere progression                        │
│     - Each player tested independently                              │
│     - All players must pass for test to succeed                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Handle results                                                  │
│     - Pass: Keep template in multiworld for next test               │
│     - Fail: Remove template, optionally run bisection               │
└─────────────────────────────────────────────────────────────────────┘
```

## First Pass vs Second Pass

The multiworld test runs in two passes to efficiently test all templates:

### First Pass (Incremental Build)

1. Templates are added one at a time to the multiworld directory
2. After each addition, a new multiworld is generated and tested
3. Only the newly added player is tested (not all players)
4. Failing templates are removed from the multiworld

This allows the multiworld to grow incrementally, testing each new combination.

### Second Pass (Full Multiworld Retest)

1. All templates that passed first pass are retested
2. Tests run with the complete final multiworld configuration
3. All players are validated together
4. Ensures templates work with the final set of games, not just the partial set they were initially tested with

**Why Second Pass?**

A template might pass first pass (when tested with games A, B, C) but fail when the complete multiworld includes games D, E, F. The second pass catches these cases.

## Bisection Testing

When a template fails in a multiworld with multiple games, it's not immediately clear which game combination causes the conflict. Bisection testing helps identify the problematic pair:

1. The failing template is tested with each other template individually (2-template tests)
2. If a specific pair fails, that combination is flagged
3. If all pairs pass, the failure requires 3+ templates interacting

This helps developers identify which game combinations have conflicts.

## Understanding the Results Table

### Result Columns

| Column | Description |
|--------|-------------|
| **Game Name** | Display name from the game's template YAML file |
| **First Pass** | Result of incremental multiworld test |
| **Second Pass** | Result of full multiworld retest (— if not applicable) |
| **Player #** | Player number assigned to this template |
| **MW Size** | Number of players in the multiworld when tested |
| **Exporter** | ✅ = generic exporter, file size = custom Python exporter |
| **GameLogic** | ✅ = generic logic, file size = custom JavaScript logic |

### Pass Criteria

A test passes when:
- All prerequisite tests pass (spoiler minimal, spoiler full, multiclient)
- Multiworld generation succeeds without errors
- All players in the multiworld pass their spoiler tests
- Second pass (if run) also passes

### Result States

| State | Meaning |
|-------|---------|
| ✅ Passed | Template works in multiworld |
| ❌ Failed | Template caused failures in multiworld |
| ⚫ Skipped | Prerequisites not met |
| — (Second Pass) | Template tested with full multiworld in first pass |

## Prerequisites

Before a template can be multiworld tested, it must pass:

1. **Spoiler Minimal Test**: Basic logic validation
2. **Spoiler Full Test**: Complete logic validation
3. **Multiclient Test**: Client-server communication

Templates that fail prerequisites are skipped to avoid wasting time on known-broken games.

## Key Files and Components

### Test Scripts

| File | Purpose |
|------|---------|
| `scripts/test/test-all-templates.py` | Main orchestration (with `--multiworld` flag) |
| `scripts/lib/test_runner.py` | Contains `test_template_multiworld()` and `test_template_multiworld_bisect()` |

### Directories

| Directory | Purpose |
|-----------|---------|
| `Players/Multiworld/` | Working directory where templates are collected |
| `frontend/presets/multiworld/` | Generated multiworld output files |

### Results

| File | Purpose |
|------|---------|
| `scripts/output/multiworld/test-results.json` | Raw test results |
| `docs/json/developer/test-results/test-results-multiworld.md` | Human-readable results chart |

## GitHub Actions Workflow

The multiworld test runs in the `test-all-sequential.yml` workflow after all other tests:

1. **Runs after**: Multiclient test (all prerequisites must be available)
2. **Execution**: Sequential within each parallel job (multiworld builds incrementally)
3. **Per-job steps**:
   - Check prerequisites from previous test results
   - Build multiworld incrementally
   - Run second pass for full validation
4. **Combine results**: Merge artifacts into single results file

### Workflow Options

| Option | Description | Default |
|--------|-------------|---------|
| `enable_multiworld` | Enable/disable multiworld tests | `true` |
| `multiworld_bisect` | Run bisection on failures | `true` |
| `template_type` | `original`, `worldgen`, or `apworld` | `original` |

## Running Locally

### Prerequisites

1. Virtual environment activated: `source .venv/bin/activate`
2. Previous test results available (spoiler and multiclient)

### Quick Test

```bash
source .venv/bin/activate

# Run multiworld tests (requires prerequisite test results)
python scripts/test/test-all-templates.py --multiworld -p
```

### Test Without Prerequisites

```bash
# Skip prerequisite checking (useful for debugging)
python scripts/test/test-all-templates.py --multiworld --no-require-prerequisites -p
```

### Test Specific Games

```bash
python scripts/test/test-all-templates.py --multiworld --include-list "Adventure.yaml" "TUNIC.yaml" -p
```

### Test Existing Multiworld (No Changes)

```bash
# Test the existing templates in the multiworld directory without adding or removing any
python scripts/test/test-all-templates.py --multiworld --multiworld-keep-templates -p
```

This is useful for re-running tests on an existing multiworld configuration.

## Interpreting Failures

| Failure Type | Meaning | Debugging Steps |
|--------------|---------|-----------------|
| **Prerequisites not met** | Previous tests failed | Fix spoiler/multiclient tests first |
| **Generation failed** | Templates can't be combined | Check generation output for errors |
| **Player X failed** | Specific player's logic broken | Run spoiler test for that game alone |
| **Second pass failed** | Works alone, fails with full set | Check bisection results for conflicting pair |

### Using Bisection Results

When a test fails:

1. Check the "Bisection Results" section in the results markdown
2. Look for failing pairs - these games have direct conflicts
3. If no pairs fail, the issue requires 3+ games interacting
4. Investigate the specific games to find naming or logic conflicts

## Comparison with Other Tests

| Test | Games Per World | Network | Purpose |
|------|-----------------|---------|---------|
| **Spoiler Test** | 1 | No | Single-game logic validation |
| **Multiclient Test** | 1 | Yes | Client-server communication |
| **Multiworld Test** | 2-10+ | No | Multi-game compatibility |

The multiworld test is the final validation step, ensuring games work together in the real-world scenario where players combine different games.

## Related Documentation

- [Test Results Summary](../test-results/test-results-summary.md)
- [Spoiler Tests](./test-spoilers.md)
- [Multiclient Test](./test-multiclient.md)
