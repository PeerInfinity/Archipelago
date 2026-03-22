# World Generator Test Results

[<- Back to Test Results Summary](./test-results-summary.md)

[📖 Learn about this test](../tests/test-world-generator.md)

**Generated:** 2026-03-22 17:48:54 UTC

**Source Data Created:** 2026-03-22 02:33:19

**Source Data Last Updated:** 2026-03-22 02:33:19

**Seed:** 1

**Mode:** Both (Canonical and Random)

This report shows the results of round-trip testing the world generator.
Each game's rules.json is converted to a `_worldgen` world, and the generated
world is validated to produce equivalent game logic.

Tests are run in two modes:
- **Canonical**: Uses `--canonical-seed` which places items in their original locations when seed matches
- **Random**: Standard randomized item placement

## Legend

- ✅ - Success/Pass
- ❌ - Failure
- `-` - Not applicable (previous step failed)
- `Skipped` - Test was skipped
- `Error` - An error occurred

### Columns

**Original World Tests** (prerequisite - must pass before worldgen testing):
- **Original Gen**: Generate a seed with the original Archipelago world
- **Original Spoiler**: Validate the original world's sphere log against its rules.json

**World Generator Tests** (the actual round-trip test):
- **World Gen** (Stage 1): Create `_worldgen` Python world files from rules.json
- **Seed Gen** (Stage 2): Generate a seed with the `_worldgen` world
- **Rules Comp** (Stage 3): Compare original rules.json with `_worldgen` rules.json
- **WorldGen Spoiler** (Stage 4): Validate the `_worldgen` world's sphere log against its rules
- **Cross-Validation** (Stage 5): Validate the **original** sphere log against `_worldgen` rules (proves equivalent logic)

---

# Canonical Mode Results

Tests run with `--canonical-seed` (items placed in original locations).

## Canonical Summary

**Total Templates:** 56

| Step | Passed | Failed | Total |
|------|--------|--------|-------|
| Original Generation | 56 | 0 | 56 |
| Original Spoiler Test | 56 | 0 | 56 |
| Stage 1: World Generation | 56 | 0 | 56 |
| Stage 2: Seed Generation | 56 | 0 | 56 |
| Stage 3: Rules Comparison | 40 | 16 | 56 |
| Stage 4: WorldGen Spoiler Test | 56 | 0 | 56 |
| Stage 5: Cross-Validation | 52 | 4 | 56 |

## Canonical Detailed Results

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | Rules Comp | WorldGen Spoiler | Cross-Validation |
|------|--------------|------------------|-----------|----------|------------|------------------|------------------|
| A Hat in Time | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A Link to the Past | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| A Short Hike | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| APQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aquaria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baking Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Error |
| Bumper Stickers | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Castlevania - Circle of the Moon | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Castlevania 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Celeste 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| ChecksFinder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Choo-Choo Charles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Civilization VI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Coding Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Error |
| DLCQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DepGraph | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Donkey Kong Country 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| EarthBound | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Factorio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Faxanadu | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Final Fantasy Mystic Quest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hylics 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inscryption | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Landstalker - The Treasures of King Nole | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Links Awakening DX | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Lufia II Ancient Cave | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mario & Luigi Superstar Saga | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mega Man 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mega Man 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MegaMan Battle Network 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Meritous | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Metamath | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Noita | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Old School Runescape | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Overcooked! 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Risk of Rain 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Saving Princess | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shivers | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Sonic Adventure 2 Battle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subnautica | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario 64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario Land 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario World | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| TOEM original | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TOEM rule builder | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Terraria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| The Legend of Zelda | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| The Messenger | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| The Wind Waker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timespinner | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Undertale | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VVVVVV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wargroove | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Yoshi's Island | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| shapez | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Random Mode Results

Tests run with standard randomized item placement.

## Random Summary

**Total Templates:** 56

| Step | Passed | Failed | Total |
|------|--------|--------|-------|
| Original Generation | 56 | 0 | 56 |
| Original Spoiler Test | 56 | 0 | 56 |
| Stage 1: World Generation | 56 | 0 | 56 |
| Stage 2: Seed Generation | 56 | 0 | 56 |
| Stage 3: Rules Comparison | 0 | 56 | 56 |
| Stage 4: WorldGen Spoiler Test | 56 | 0 | 56 |
| Stage 5: Cross-Validation | 39 | 17 | 56 |

## Random Detailed Results

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | Rules Comp | WorldGen Spoiler | Cross-Validation |
|------|--------------|------------------|-----------|----------|------------|------------------|------------------|
| A Hat in Time | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| A Link to the Past | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| A Short Hike | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| APQuest | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Adventure | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Aquaria | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Baking Adventure | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Bumper Stickers | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Castlevania - Circle of the Moon | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Castlevania 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Celeste 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| ChecksFinder | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Choo-Choo Charles | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Civilization VI | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Coding Adventure | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| DLCQuest | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| DepGraph | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Donkey Kong Country 3 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| EarthBound | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Factorio | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Faxanadu | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Final Fantasy Mystic Quest | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Hylics 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Inscryption | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Landstalker - The Treasures of King Nole | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Links Awakening DX | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Lufia II Ancient Cave | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mario & Luigi Superstar Saga | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mega Man 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mega Man 3 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| MegaMan Battle Network 3 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Meritous | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Metamath | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Noita | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Old School Runescape | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Overcooked! 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Risk of Rain 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Saving Princess | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Shivers | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Sonic Adventure 2 Battle | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Subnautica | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Super Mario 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Super Mario Land 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Super Mario World | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| TOEM original | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| TOEM rule builder | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Terraria | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| The Legend of Zelda | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| The Messenger | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| The Wind Waker | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Timespinner | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Undertale | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| VVVVVV | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Wargroove | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Yoshi's Island | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| shapez | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |

---

# Processing Times

## Canonical Processing Times

Processing times for each test phase. Times are in seconds.

### Summary Statistics

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Total | 217.2s | 399.5s | 30.0s | 191.2s | 377.7s | 411.4s |
| Average | 3.9s | 7.1s | 0.5s | 3.4s | 6.7s | 7.3s |
| Max | 10.3s | 15.2s | 0.6s | 5.9s | 15.8s | 14.8s |
| Min | 2.9s | 5.5s | 0.5s | 2.8s | 5.5s | 5.5s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (10.3s) | A Link to the Past (15.2s) | A Link to the Past (0.6s) | A Link to the Past (5.9s) | Links Awakening DX (15.8s) | Links Awakening DX (14.8s) |
| Fastest | VVVVVV (2.9s) | VVVVVV (5.5s) | VVVVVV (0.5s) | VVVVVV (2.8s) | VVVVVV (5.5s) | VVVVVV (5.5s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 4.5s | 10.0s | 0.5s | 3.8s | 7.7s | 7.7s |
| A Link to the Past | 7.3s | 15.2s | 0.6s | 5.9s | 12.8s | 12.7s |
| A Short Hike | 3.4s | 6.0s | 0.5s | 3.1s | 5.5s | 5.5s |
| APQuest | 3.4s | 6.3s | 0.5s | 3.0s | 5.7s | 5.7s |
| Adventure | 3.9s | 6.8s | 0.6s | 3.1s | 5.7s | 5.7s |
| Aquaria | 4.8s | 10.3s | 0.5s | 3.6s | 6.7s | 6.7s |
| Baking Adventure | 3.3s | 8.3s | 0.5s | 3.0s | 5.7s | 14.4s |
| Bumper Stickers | 3.5s | 9.3s | 0.5s | 3.1s | 5.7s | 5.7s |
| Castlevania - Circle of the Moon | 3.6s | 6.3s | 0.6s | 3.2s | 5.7s | 5.7s |
| Castlevania 64 | 3.9s | 6.7s | 0.5s | 3.6s | 5.7s | 5.7s |
| Celeste 64 | 3.1s | 5.8s | 0.5s | 3.1s | 5.7s | 5.8s |
| ChecksFinder | 3.0s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Choo-Choo Charles | 3.1s | 9.6s | 0.5s | 3.2s | 9.6s | 9.6s |
| Civilization VI | 8.3s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Coding Adventure | 3.0s | 5.7s | 0.5s | 3.0s | 5.7s | 14.4s |
| DLCQuest | 3.3s | 5.8s | 0.5s | 3.1s | 5.7s | 5.7s |
| DepGraph | 3.0s | 6.7s | 0.5s | 3.1s | 5.7s | 14.5s |
| Donkey Kong Country 3 | 3.3s | 6.7s | 0.5s | 3.3s | 6.7s | 6.7s |
| EarthBound | 3.9s | 6.7s | 0.6s | 3.8s | 6.7s | 6.8s |
| Factorio | 3.9s | 6.8s | 0.6s | 3.3s | 6.7s | 6.7s |
| Faxanadu | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Final Fantasy Mystic Quest | 3.8s | 8.8s | 0.6s | 3.7s | 8.7s | 8.7s |
| Hylics 2 | 3.3s | 5.6s | 0.5s | 3.2s | 5.5s | 5.5s |
| Inscryption | 3.2s | 5.8s | 0.5s | 3.2s | 5.7s | 5.7s |
| Landstalker - The Treasures of King Nole | 3.4s | 6.7s | 0.6s | 3.2s | 6.8s | 6.7s |
| Links Awakening DX | 6.1s | 14.8s | 0.6s | 3.9s | 15.8s | 14.8s |
| Lufia II Ancient Cave | 3.2s | 5.8s | 0.5s | 3.3s | 5.7s | 5.7s |
| Mario & Luigi Superstar Saga | 3.9s | 9.8s | 0.6s | 4.3s | 9.7s | 9.8s |
| Mega Man 2 | 3.2s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| Mega Man 3 | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| MegaMan Battle Network 3 | 3.3s | 6.7s | 0.5s | 3.1s | 6.7s | 6.7s |
| Meritous | 3.1s | 5.8s | 0.5s | 3.0s | 5.7s | 5.7s |
| Metamath | 10.3s | 5.5s | 0.5s | 2.9s | 5.5s | 13.9s |
| Noita | 3.1s | 5.7s | 0.5s | 3.2s | 5.8s | 5.7s |
| Old School Runescape | 4.0s | 5.9s | 0.6s | 4.0s | 5.8s | 5.7s |
| Overcooked! 2 | 3.6s | 7.8s | 0.6s | 3.3s | 7.7s | 7.8s |
| Risk of Rain 2 | 3.5s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| Saving Princess | 3.2s | 5.7s | 0.6s | 3.2s | 5.7s | 5.7s |
| Shivers | 3.4s | 6.8s | 0.5s | 3.5s | 6.7s | 6.7s |
| Sonic Adventure 2 Battle | 4.5s | 6.7s | 0.5s | 4.2s | 6.7s | 6.7s |
| Subnautica | 3.5s | 9.7s | 0.5s | 3.6s | 9.7s | 9.7s |
| Super Mario 64 | 3.4s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Super Mario Land 2 | 3.6s | 12.6s | 0.5s | 3.7s | 12.6s | 12.6s |
| Super Mario World | 4.6s | 5.7s | 0.5s | 3.5s | 5.7s | 5.7s |
| TOEM original | 3.2s | 5.7s | 0.6s | 3.0s | 5.8s | 5.7s |
| TOEM rule builder | 3.0s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Terraria | 3.6s | 9.8s | 0.6s | 3.1s | 8.7s | 8.8s |
| The Legend of Zelda | 3.9s | 6.7s | 0.6s | 3.3s | 5.7s | 5.7s |
| The Messenger | 3.4s | 8.8s | 0.5s | 3.4s | 8.8s | 8.8s |
| The Wind Waker | 5.5s | 6.8s | 0.5s | 5.4s | 6.7s | 6.7s |
| Timespinner | 4.1s | 5.7s | 0.5s | 4.0s | 5.8s | 5.7s |
| Undertale | 3.3s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| VVVVVV | 2.9s | 5.5s | 0.5s | 2.8s | 5.5s | 5.5s |
| Wargroove | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Yoshi's Island | 4.3s | 6.7s | 0.6s | 4.1s | 6.8s | 6.7s |
| shapez | 4.0s | 5.7s | 0.6s | 3.3s | 5.7s | 5.7s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 10.3s |
| 2 | Civilization VI | 8.3s |
| 3 | A Link to the Past | 7.3s |
| 4 | Links Awakening DX | 6.1s |
| 5 | The Wind Waker | 5.5s |
| 6 | Aquaria | 4.8s |
| 7 | Super Mario World | 4.6s |
| 8 | A Hat in Time | 4.5s |
| 9 | Sonic Adventure 2 Battle | 4.5s |
| 10 | Yoshi's Island | 4.3s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 15.2s |
| 2 | Links Awakening DX | 14.8s |
| 3 | Super Mario Land 2 | 12.6s |
| 4 | Aquaria | 10.3s |
| 5 | A Hat in Time | 10.0s |
| 6 | Mario & Luigi Superstar Saga | 9.8s |
| 7 | Terraria | 9.8s |
| 8 | Subnautica | 9.7s |
| 9 | Choo-Choo Charles | 9.6s |
| 10 | Bumper Stickers | 9.3s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 0.6s |
| 2 | Terraria | 0.6s |
| 3 | Yoshi's Island | 0.6s |
| 4 | Mario & Luigi Superstar Saga | 0.6s |
| 5 | The Legend of Zelda | 0.6s |
| 6 | Factorio | 0.6s |
| 7 | Final Fantasy Mystic Quest | 0.6s |
| 8 | Landstalker - The Treasures of King Nole | 0.6s |
| 9 | Links Awakening DX | 0.6s |
| 10 | Old School Runescape | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 5.9s |
| 2 | The Wind Waker | 5.4s |
| 3 | Mario & Luigi Superstar Saga | 4.3s |
| 4 | Sonic Adventure 2 Battle | 4.2s |
| 5 | Yoshi's Island | 4.1s |
| 6 | Old School Runescape | 4.0s |
| 7 | Timespinner | 4.0s |
| 8 | Links Awakening DX | 3.9s |
| 9 | A Hat in Time | 3.8s |
| 10 | EarthBound | 3.8s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 15.8s |
| 2 | A Link to the Past | 12.8s |
| 3 | Super Mario Land 2 | 12.6s |
| 4 | Mario & Luigi Superstar Saga | 9.7s |
| 5 | Subnautica | 9.7s |
| 6 | Choo-Choo Charles | 9.6s |
| 7 | The Messenger | 8.8s |
| 8 | Final Fantasy Mystic Quest | 8.7s |
| 9 | Terraria | 8.7s |
| 10 | A Hat in Time | 7.7s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 14.8s |
| 2 | DepGraph | 14.5s |
| 3 | Baking Adventure | 14.4s |
| 4 | Coding Adventure | 14.4s |
| 5 | Metamath | 13.9s |
| 6 | A Link to the Past | 12.7s |
| 7 | Super Mario Land 2 | 12.6s |
| 8 | Mario & Luigi Superstar Saga | 9.8s |
| 9 | Subnautica | 9.7s |
| 10 | Choo-Choo Charles | 9.6s |

---

## Random Processing Times

Processing times for each test phase. Times are in seconds.

### Summary Statistics

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Total | 222.1s | 407.7s | 30.3s | 197.0s | 378.6s | 510.9s |
| Average | 4.0s | 7.3s | 0.5s | 3.5s | 6.8s | 9.1s |
| Max | 10.3s | 17.0s | 0.6s | 6.0s | 14.6s | 17.6s |
| Min | 2.9s | 5.5s | 0.5s | 2.9s | 5.5s | 5.5s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (10.3s) | A Link to the Past (17.0s) | Mario & Luigi Superstar Saga (0.6s) | A Link to the Past (6.0s) | Links Awakening DX (14.6s) | A Link to the Past (17.6s) |
| Fastest | ChecksFinder (2.9s) | shapez (5.5s) | TOEM rule builder (0.5s) | APQuest (2.9s) | DLCQuest (5.5s) | TOEM rule builder (5.5s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 5.0s | 11.2s | 0.6s | 4.3s | 7.8s | 7.8s |
| A Link to the Past | 7.0s | 17.0s | 0.6s | 6.0s | 13.8s | 17.6s |
| A Short Hike | 3.5s | 8.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| APQuest | 3.3s | 6.8s | 0.5s | 2.9s | 5.7s | 5.7s |
| Adventure | 3.7s | 6.5s | 0.6s | 3.3s | 5.7s | 5.7s |
| Aquaria | 4.6s | 9.8s | 0.5s | 3.4s | 6.5s | 6.5s |
| Baking Adventure | 3.2s | 6.3s | 0.5s | 2.9s | 5.7s | 5.5s |
| Bumper Stickers | 3.8s | 10.7s | 0.6s | 3.6s | 5.9s | 14.7s |
| Castlevania - Circle of the Moon | 4.0s | 8.3s | 0.6s | 3.4s | 5.7s | 5.7s |
| Castlevania 64 | 4.1s | 7.9s | 0.5s | 3.8s | 5.7s | 5.7s |
| Celeste 64 | 3.4s | 5.9s | 0.6s | 3.4s | 5.8s | 14.6s |
| ChecksFinder | 2.9s | 5.8s | 0.5s | 2.9s | 5.7s | 5.7s |
| Choo-Choo Charles | 3.2s | 9.7s | 0.5s | 3.1s | 9.8s | 9.7s |
| Civilization VI | 8.3s | 5.7s | 0.5s | 3.0s | 5.7s | 14.6s |
| Coding Adventure | 3.2s | 5.9s | 0.6s | 3.1s | 5.7s | 5.8s |
| DLCQuest | 3.2s | 5.8s | 0.5s | 3.0s | 5.5s | 5.5s |
| DepGraph | 3.0s | 6.5s | 0.5s | 3.0s | 5.6s | 14.0s |
| Donkey Kong Country 3 | 3.6s | 6.8s | 0.6s | 3.7s | 6.8s | 14.8s |
| EarthBound | 4.1s | 6.9s | 0.6s | 4.1s | 6.8s | 6.8s |
| Factorio | 3.8s | 6.7s | 0.6s | 3.4s | 6.8s | 6.7s |
| Faxanadu | 3.4s | 5.7s | 0.6s | 3.4s | 5.8s | 14.5s |
| Final Fantasy Mystic Quest | 3.7s | 8.7s | 0.5s | 3.6s | 8.7s | 8.7s |
| Hylics 2 | 3.4s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Inscryption | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Landstalker - The Treasures of King Nole | 3.5s | 6.8s | 0.6s | 3.5s | 6.8s | 6.8s |
| Links Awakening DX | 5.9s | 14.6s | 0.5s | 4.0s | 14.6s | 14.6s |
| Lufia II Ancient Cave | 3.3s | 5.6s | 0.5s | 3.2s | 5.5s | 5.5s |
| Mario & Luigi Superstar Saga | 4.5s | 9.9s | 0.6s | 4.5s | 9.8s | 9.9s |
| Mega Man 2 | 3.4s | 5.7s | 0.5s | 3.4s | 5.7s | 5.8s |
| Mega Man 3 | 3.3s | 5.7s | 0.5s | 3.3s | 5.7s | 14.4s |
| MegaMan Battle Network 3 | 3.6s | 6.8s | 0.6s | 3.2s | 6.8s | 14.6s |
| Meritous | 3.0s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Metamath | 10.3s | 5.7s | 0.5s | 3.1s | 5.7s | 14.5s |
| Noita | 3.1s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Old School Runescape | 4.2s | 5.8s | 0.6s | 4.1s | 5.8s | 5.8s |
| Overcooked! 2 | 3.4s | 8.6s | 0.5s | 3.4s | 8.5s | 14.2s |
| Risk of Rain 2 | 3.5s | 5.5s | 0.5s | 3.4s | 5.5s | 5.5s |
| Saving Princess | 3.7s | 5.8s | 0.6s | 3.5s | 5.8s | 5.8s |
| Shivers | 3.6s | 6.8s | 0.6s | 3.6s | 6.8s | 14.6s |
| Sonic Adventure 2 Battle | 4.7s | 6.8s | 0.6s | 4.4s | 6.7s | 14.5s |
| Subnautica | 3.7s | 9.8s | 0.6s | 3.9s | 9.8s | 14.7s |
| Super Mario 64 | 3.3s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Super Mario Land 2 | 3.6s | 11.8s | 0.6s | 4.0s | 11.9s | 11.8s |
| Super Mario World | 4.6s | 5.7s | 0.6s | 3.3s | 5.7s | 5.7s |
| TOEM original | 3.2s | 5.8s | 0.6s | 3.3s | 5.7s | 5.8s |
| TOEM rule builder | 3.0s | 5.5s | 0.5s | 2.9s | 5.5s | 5.5s |
| Terraria | 3.2s | 9.6s | 0.5s | 3.2s | 8.6s | 8.6s |
| The Legend of Zelda | 4.6s | 6.8s | 0.6s | 3.6s | 5.8s | 14.8s |
| The Messenger | 3.7s | 8.9s | 0.6s | 3.6s | 8.9s | 8.9s |
| The Wind Waker | 5.8s | 6.9s | 0.6s | 5.7s | 6.8s | 14.6s |
| Timespinner | 4.5s | 5.8s | 0.6s | 4.2s | 5.8s | 5.8s |
| Undertale | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| VVVVVV | 3.0s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Wargroove | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Yoshi's Island | 4.2s | 6.8s | 0.6s | 4.2s | 6.8s | 6.8s |
| shapez | 3.9s | 5.5s | 0.5s | 3.2s | 5.5s | 14.1s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 10.3s |
| 2 | Civilization VI | 8.3s |
| 3 | A Link to the Past | 7.0s |
| 4 | Links Awakening DX | 5.9s |
| 5 | The Wind Waker | 5.8s |
| 6 | A Hat in Time | 5.0s |
| 7 | Sonic Adventure 2 Battle | 4.7s |
| 8 | Aquaria | 4.6s |
| 9 | The Legend of Zelda | 4.6s |
| 10 | Super Mario World | 4.6s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 17.0s |
| 2 | Links Awakening DX | 14.6s |
| 3 | Super Mario Land 2 | 11.8s |
| 4 | A Hat in Time | 11.2s |
| 5 | Bumper Stickers | 10.7s |
| 6 | Mario & Luigi Superstar Saga | 9.9s |
| 7 | Subnautica | 9.8s |
| 8 | Aquaria | 9.8s |
| 9 | Choo-Choo Charles | 9.7s |
| 10 | Terraria | 9.6s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Mario & Luigi Superstar Saga | 0.6s |
| 2 | Old School Runescape | 0.6s |
| 3 | The Legend of Zelda | 0.6s |
| 4 | Saving Princess | 0.6s |
| 5 | Shivers | 0.6s |
| 6 | Yoshi's Island | 0.6s |
| 7 | A Hat in Time | 0.6s |
| 8 | A Link to the Past | 0.6s |
| 9 | Coding Adventure | 0.6s |
| 10 | EarthBound | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 6.0s |
| 2 | The Wind Waker | 5.7s |
| 3 | Mario & Luigi Superstar Saga | 4.5s |
| 4 | Sonic Adventure 2 Battle | 4.4s |
| 5 | A Hat in Time | 4.3s |
| 6 | Timespinner | 4.2s |
| 7 | Yoshi's Island | 4.2s |
| 8 | EarthBound | 4.1s |
| 9 | Old School Runescape | 4.1s |
| 10 | Super Mario Land 2 | 4.0s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 14.6s |
| 2 | A Link to the Past | 13.8s |
| 3 | Super Mario Land 2 | 11.9s |
| 4 | Mario & Luigi Superstar Saga | 9.8s |
| 5 | Subnautica | 9.8s |
| 6 | Choo-Choo Charles | 9.8s |
| 7 | The Messenger | 8.9s |
| 8 | Final Fantasy Mystic Quest | 8.7s |
| 9 | Terraria | 8.6s |
| 10 | Overcooked! 2 | 8.5s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 17.6s |
| 2 | The Legend of Zelda | 14.8s |
| 3 | Donkey Kong Country 3 | 14.8s |
| 4 | Bumper Stickers | 14.7s |
| 5 | Subnautica | 14.7s |
| 6 | MegaMan Battle Network 3 | 14.6s |
| 7 | Celeste 64 | 14.6s |
| 8 | Shivers | 14.6s |
| 9 | Links Awakening DX | 14.6s |
| 10 | The Wind Waker | 14.6s |
