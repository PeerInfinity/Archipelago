# World Generator Test Results

[<- Back to Test Results Summary](./test-results-summary.md)

[📖 Learn about this test](../tests/test-world-generator.md)

**Generated:** 2026-03-24 19:12:10 UTC

**Source Data Created:** 2026-03-24 02:25:33

**Source Data Last Updated:** 2026-03-24 02:25:33

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
| Stage 5: Cross-Validation | 54 | 2 | 56 |

## Canonical Detailed Results

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | Rules Comp | WorldGen Spoiler | Cross-Validation |
|------|--------------|------------------|-----------|----------|------------|------------------|------------------|
| A Hat in Time | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A Link to the Past | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| A Short Hike | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| APQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aquaria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baking Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bumper Stickers | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Castlevania - Circle of the Moon | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Castlevania 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Celeste 64 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| ChecksFinder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Choo-Choo Charles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Civilization VI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Coding Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
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
| Total | 217.7s | 401.9s | 32.3s | 192.3s | 377.7s | 396.7s |
| Average | 3.9s | 7.2s | 0.6s | 3.4s | 6.7s | 7.1s |
| Max | 10.6s | 15.8s | 2.7s | 5.9s | 15.8s | 15.8s |
| Min | 2.9s | 5.4s | 0.5s | 2.9s | 5.5s | 5.4s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (10.6s) | Links Awakening DX (15.8s) | A Link to the Past (2.7s) | A Link to the Past (5.9s) | Links Awakening DX (15.8s) | Links Awakening DX (15.8s) |
| Fastest | Mega Man 2 (2.9s) | Mega Man 2 (5.4s) | Mega Man 2 (0.5s) | Mega Man 2 (2.9s) | Shivers (5.5s) | Castlevania - Circle of the Moon (5.4s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 4.7s | 12.8s | 0.6s | 4.0s | 7.7s | 8.8s |
| A Link to the Past | 7.0s | 14.1s | 2.7s | 5.9s | 12.8s | 12.8s |
| A Short Hike | 3.7s | 9.6s | 0.5s | 3.3s | 5.7s | 5.7s |
| APQuest | 3.5s | 6.9s | 0.5s | 3.0s | 5.7s | 5.7s |
| Adventure | 3.8s | 6.8s | 0.5s | 3.2s | 5.7s | 5.7s |
| Aquaria | 5.0s | 7.3s | 0.6s | 3.7s | 6.8s | 6.8s |
| Baking Adventure | 3.3s | 7.2s | 0.5s | 3.0s | 5.8s | 5.7s |
| Bumper Stickers | 3.5s | 6.5s | 0.5s | 3.1s | 5.8s | 5.7s |
| Castlevania - Circle of the Moon | 3.2s | 8.6s | 0.5s | 2.9s | 5.5s | 5.4s |
| Castlevania 64 | 3.8s | 7.1s | 0.5s | 3.5s | 5.7s | 5.7s |
| Celeste 64 | 3.2s | 5.8s | 0.6s | 3.2s | 5.7s | 5.7s |
| ChecksFinder | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Choo-Choo Charles | 3.3s | 9.8s | 0.6s | 3.3s | 9.8s | 9.8s |
| Civilization VI | 8.5s | 5.7s | 0.6s | 3.2s | 5.7s | 5.7s |
| Coding Adventure | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| DLCQuest | 3.5s | 5.9s | 0.6s | 3.2s | 5.7s | 5.7s |
| DepGraph | 3.0s | 6.7s | 0.5s | 3.1s | 5.7s | 14.4s |
| Donkey Kong Country 3 | 3.4s | 7.0s | 0.6s | 3.3s | 6.7s | 6.7s |
| EarthBound | 3.6s | 6.5s | 0.5s | 3.3s | 6.5s | 6.5s |
| Factorio | 3.6s | 6.7s | 0.5s | 3.3s | 6.7s | 6.7s |
| Faxanadu | 3.2s | 5.7s | 0.6s | 3.2s | 5.7s | 5.7s |
| Final Fantasy Mystic Quest | 3.8s | 8.7s | 0.6s | 3.6s | 8.7s | 8.7s |
| Hylics 2 | 3.5s | 5.9s | 0.6s | 3.4s | 5.7s | 5.7s |
| Inscryption | 3.2s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Landstalker - The Treasures of King Nole | 3.4s | 6.7s | 0.5s | 3.4s | 6.7s | 6.8s |
| Links Awakening DX | 6.3s | 15.8s | 0.6s | 4.0s | 15.8s | 15.8s |
| Lufia II Ancient Cave | 3.2s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Mario & Luigi Superstar Saga | 3.9s | 9.8s | 0.6s | 4.3s | 9.8s | 9.8s |
| Mega Man 2 | 2.9s | 5.4s | 0.5s | 2.9s | 5.6s | 5.5s |
| Mega Man 3 | 3.1s | 5.7s | 0.5s | 3.1s | 5.8s | 5.7s |
| MegaMan Battle Network 3 | 3.4s | 6.7s | 0.6s | 3.2s | 6.8s | 6.8s |
| Meritous | 3.0s | 5.8s | 0.5s | 3.0s | 5.7s | 5.7s |
| Metamath | 10.6s | 5.8s | 0.6s | 3.0s | 5.8s | 14.4s |
| Noita | 3.2s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Old School Runescape | 4.1s | 5.7s | 0.5s | 4.1s | 5.8s | 5.7s |
| Overcooked! 2 | 3.6s | 8.8s | 0.6s | 3.5s | 8.8s | 8.8s |
| Risk of Rain 2 | 3.5s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| Saving Princess | 3.2s | 5.9s | 0.6s | 3.2s | 5.7s | 5.7s |
| Shivers | 3.0s | 6.4s | 0.5s | 3.0s | 5.5s | 6.5s |
| Sonic Adventure 2 Battle | 4.5s | 6.7s | 0.5s | 4.1s | 6.7s | 6.7s |
| Subnautica | 3.6s | 9.8s | 0.6s | 3.7s | 9.7s | 9.7s |
| Super Mario 64 | 3.3s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Super Mario Land 2 | 3.8s | 11.9s | 0.6s | 4.0s | 11.9s | 11.9s |
| Super Mario World | 4.6s | 5.7s | 0.6s | 3.5s | 5.7s | 5.7s |
| TOEM original | 3.1s | 5.8s | 0.5s | 3.2s | 5.7s | 5.8s |
| TOEM rule builder | 3.3s | 5.7s | 0.5s | 3.2s | 5.8s | 5.7s |
| Terraria | 3.2s | 9.7s | 0.5s | 3.2s | 8.7s | 8.7s |
| The Legend of Zelda | 3.9s | 6.7s | 0.6s | 3.2s | 5.7s | 5.8s |
| The Messenger | 3.0s | 8.6s | 0.5s | 3.0s | 8.6s | 8.6s |
| The Wind Waker | 5.5s | 6.7s | 0.5s | 5.4s | 6.7s | 6.7s |
| Timespinner | 4.2s | 5.8s | 0.6s | 4.1s | 5.8s | 5.7s |
| Undertale | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| VVVVVV | 3.2s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Wargroove | 3.3s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Yoshi's Island | 4.2s | 6.7s | 0.6s | 4.2s | 6.8s | 6.8s |
| shapez | 4.0s | 5.8s | 0.6s | 3.5s | 5.7s | 5.8s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 10.6s |
| 2 | Civilization VI | 8.5s |
| 3 | A Link to the Past | 7.0s |
| 4 | Links Awakening DX | 6.3s |
| 5 | The Wind Waker | 5.5s |
| 6 | Aquaria | 5.0s |
| 7 | A Hat in Time | 4.7s |
| 8 | Super Mario World | 4.6s |
| 9 | Sonic Adventure 2 Battle | 4.5s |
| 10 | Timespinner | 4.2s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 15.8s |
| 2 | A Link to the Past | 14.1s |
| 3 | A Hat in Time | 12.8s |
| 4 | Super Mario Land 2 | 11.9s |
| 5 | Choo-Choo Charles | 9.8s |
| 6 | Mario & Luigi Superstar Saga | 9.8s |
| 7 | Subnautica | 9.8s |
| 8 | Terraria | 9.7s |
| 9 | A Short Hike | 9.6s |
| 10 | Overcooked! 2 | 8.8s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 2.7s |
| 2 | Super Mario Land 2 | 0.6s |
| 3 | A Hat in Time | 0.6s |
| 4 | Aquaria | 0.6s |
| 5 | Links Awakening DX | 0.6s |
| 6 | Mario & Luigi Superstar Saga | 0.6s |
| 7 | Faxanadu | 0.6s |
| 8 | Overcooked! 2 | 0.6s |
| 9 | The Legend of Zelda | 0.6s |
| 10 | Timespinner | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 5.9s |
| 2 | The Wind Waker | 5.4s |
| 3 | Mario & Luigi Superstar Saga | 4.3s |
| 4 | Yoshi's Island | 4.2s |
| 5 | Sonic Adventure 2 Battle | 4.1s |
| 6 | Timespinner | 4.1s |
| 7 | Old School Runescape | 4.1s |
| 8 | Links Awakening DX | 4.0s |
| 9 | A Hat in Time | 4.0s |
| 10 | Super Mario Land 2 | 4.0s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 15.8s |
| 2 | A Link to the Past | 12.8s |
| 3 | Super Mario Land 2 | 11.9s |
| 4 | Choo-Choo Charles | 9.8s |
| 5 | Mario & Luigi Superstar Saga | 9.8s |
| 6 | Subnautica | 9.7s |
| 7 | Overcooked! 2 | 8.8s |
| 8 | Terraria | 8.7s |
| 9 | Final Fantasy Mystic Quest | 8.7s |
| 10 | The Messenger | 8.6s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 15.8s |
| 2 | DepGraph | 14.4s |
| 3 | Metamath | 14.4s |
| 4 | A Link to the Past | 12.8s |
| 5 | Super Mario Land 2 | 11.9s |
| 6 | Choo-Choo Charles | 9.8s |
| 7 | Mario & Luigi Superstar Saga | 9.8s |
| 8 | Subnautica | 9.7s |
| 9 | Overcooked! 2 | 8.8s |
| 10 | A Hat in Time | 8.8s |

---

## Random Processing Times

Processing times for each test phase. Times are in seconds.

### Summary Statistics

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Total | 220.3s | 404.2s | 32.4s | 194.4s | 375.8s | 508.2s |
| Average | 3.9s | 7.2s | 0.6s | 3.5s | 6.7s | 9.1s |
| Max | 11.7s | 16.6s | 2.8s | 6.2s | 14.7s | 17.6s |
| Min | 3.0s | 5.5s | 0.5s | 2.9s | 5.5s | 5.5s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (11.7s) | A Link to the Past (16.6s) | A Link to the Past (2.8s) | A Link to the Past (6.2s) | Links Awakening DX (14.7s) | A Link to the Past (17.6s) |
| Fastest | ChecksFinder (3.0s) | Faxanadu (5.5s) | Faxanadu (0.5s) | APQuest (2.9s) | Celeste 64 (5.5s) | Timespinner (5.5s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 4.4s | 9.8s | 0.5s | 3.8s | 7.5s | 7.5s |
| A Link to the Past | 7.2s | 16.6s | 2.8s | 6.2s | 12.8s | 17.6s |
| A Short Hike | 3.6s | 7.8s | 0.5s | 3.2s | 5.7s | 5.7s |
| APQuest | 3.4s | 12.2s | 0.5s | 2.9s | 5.7s | 5.6s |
| Adventure | 3.7s | 6.8s | 0.5s | 3.2s | 5.7s | 5.7s |
| Aquaria | 5.0s | 8.1s | 0.6s | 3.6s | 6.7s | 6.7s |
| Baking Adventure | 3.4s | 7.3s | 0.6s | 3.0s | 5.7s | 5.7s |
| Bumper Stickers | 3.3s | 8.3s | 0.5s | 3.0s | 5.7s | 14.4s |
| Castlevania - Circle of the Moon | 3.7s | 7.5s | 0.6s | 3.2s | 5.7s | 5.7s |
| Castlevania 64 | 4.4s | 6.3s | 0.6s | 3.9s | 5.8s | 5.9s |
| Celeste 64 | 3.1s | 5.5s | 0.5s | 3.1s | 5.5s | 14.0s |
| ChecksFinder | 3.0s | 5.8s | 0.6s | 3.0s | 5.7s | 5.7s |
| Choo-Choo Charles | 3.2s | 9.8s | 0.5s | 3.2s | 9.8s | 9.7s |
| Civilization VI | 8.2s | 5.7s | 0.5s | 3.1s | 5.7s | 14.4s |
| Coding Adventure | 3.0s | 5.7s | 0.6s | 3.1s | 5.7s | 5.7s |
| DLCQuest | 3.4s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| DepGraph | 3.1s | 6.8s | 0.6s | 3.2s | 5.7s | 14.4s |
| Donkey Kong Country 3 | 3.2s | 6.7s | 0.5s | 3.1s | 6.7s | 14.4s |
| EarthBound | 3.9s | 6.8s | 0.5s | 3.8s | 6.7s | 6.7s |
| Factorio | 4.1s | 6.8s | 0.6s | 3.6s | 6.7s | 6.8s |
| Faxanadu | 3.0s | 5.5s | 0.5s | 3.1s | 5.5s | 14.1s |
| Final Fantasy Mystic Quest | 3.9s | 8.8s | 0.6s | 3.7s | 8.8s | 8.8s |
| Hylics 2 | 3.4s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| Inscryption | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Landstalker - The Treasures of King Nole | 3.4s | 6.7s | 0.6s | 3.3s | 6.7s | 6.7s |
| Links Awakening DX | 6.3s | 14.9s | 0.6s | 4.3s | 14.7s | 14.8s |
| Lufia II Ancient Cave | 3.4s | 5.9s | 0.5s | 3.4s | 5.7s | 5.7s |
| Mario & Luigi Superstar Saga | 3.6s | 9.9s | 0.6s | 4.3s | 8.7s | 8.7s |
| Mega Man 2 | 3.3s | 5.8s | 0.6s | 3.2s | 5.7s | 5.7s |
| Mega Man 3 | 3.5s | 5.7s | 0.6s | 3.4s | 5.7s | 14.5s |
| MegaMan Battle Network 3 | 3.1s | 6.6s | 0.5s | 3.0s | 6.5s | 14.1s |
| Meritous | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Metamath | 11.7s | 5.7s | 0.5s | 3.1s | 5.7s | 14.3s |
| Noita | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Old School Runescape | 4.1s | 5.9s | 0.6s | 3.9s | 5.7s | 5.7s |
| Overcooked! 2 | 3.6s | 7.7s | 0.5s | 3.5s | 8.7s | 14.6s |
| Risk of Rain 2 | 3.6s | 5.8s | 0.6s | 3.5s | 5.7s | 5.7s |
| Saving Princess | 3.0s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Shivers | 3.5s | 6.8s | 0.5s | 3.4s | 6.7s | 14.4s |
| Sonic Adventure 2 Battle | 4.9s | 6.8s | 0.6s | 4.6s | 6.7s | 14.5s |
| Subnautica | 3.3s | 9.5s | 0.5s | 3.7s | 9.6s | 14.2s |
| Super Mario 64 | 3.4s | 5.7s | 0.6s | 3.3s | 5.7s | 5.7s |
| Super Mario Land 2 | 3.7s | 11.8s | 0.6s | 4.0s | 11.8s | 11.8s |
| Super Mario World | 4.5s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| TOEM original | 3.1s | 5.7s | 0.6s | 3.1s | 5.7s | 5.7s |
| TOEM rule builder | 3.1s | 5.7s | 0.5s | 3.1s | 5.7s | 5.7s |
| Terraria | 3.3s | 9.8s | 0.6s | 3.2s | 8.7s | 8.8s |
| The Legend of Zelda | 3.7s | 6.7s | 0.6s | 3.2s | 5.7s | 14.5s |
| The Messenger | 3.4s | 8.8s | 0.5s | 3.4s | 8.8s | 8.8s |
| The Wind Waker | 6.1s | 6.7s | 0.6s | 5.7s | 6.7s | 14.5s |
| Timespinner | 4.0s | 5.5s | 0.5s | 4.0s | 5.6s | 5.5s |
| Undertale | 3.4s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| VVVVVV | 3.1s | 5.8s | 0.6s | 3.0s | 5.7s | 5.7s |
| Wargroove | 3.1s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Yoshi's Island | 4.1s | 6.7s | 0.6s | 4.1s | 6.7s | 6.7s |
| shapez | 4.1s | 5.7s | 0.6s | 3.4s | 5.7s | 14.5s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 11.7s |
| 2 | Civilization VI | 8.2s |
| 3 | A Link to the Past | 7.2s |
| 4 | Links Awakening DX | 6.3s |
| 5 | The Wind Waker | 6.1s |
| 6 | Aquaria | 5.0s |
| 7 | Sonic Adventure 2 Battle | 4.9s |
| 8 | Super Mario World | 4.5s |
| 9 | A Hat in Time | 4.4s |
| 10 | Castlevania 64 | 4.4s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 16.6s |
| 2 | Links Awakening DX | 14.9s |
| 3 | APQuest | 12.2s |
| 4 | Super Mario Land 2 | 11.8s |
| 5 | Mario & Luigi Superstar Saga | 9.9s |
| 6 | A Hat in Time | 9.8s |
| 7 | Terraria | 9.8s |
| 8 | Choo-Choo Charles | 9.8s |
| 9 | Subnautica | 9.5s |
| 10 | The Messenger | 8.8s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 2.8s |
| 2 | Links Awakening DX | 0.6s |
| 3 | Old School Runescape | 0.6s |
| 4 | The Wind Waker | 0.6s |
| 5 | Castlevania 64 | 0.6s |
| 6 | Castlevania - Circle of the Moon | 0.6s |
| 7 | Factorio | 0.6s |
| 8 | Mario & Luigi Superstar Saga | 0.6s |
| 9 | Mega Man 3 | 0.6s |
| 10 | Sonic Adventure 2 Battle | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 6.2s |
| 2 | The Wind Waker | 5.7s |
| 3 | Sonic Adventure 2 Battle | 4.6s |
| 4 | Links Awakening DX | 4.3s |
| 5 | Mario & Luigi Superstar Saga | 4.3s |
| 6 | Yoshi's Island | 4.1s |
| 7 | Super Mario Land 2 | 4.0s |
| 8 | Timespinner | 4.0s |
| 9 | Castlevania 64 | 3.9s |
| 10 | Old School Runescape | 3.9s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Links Awakening DX | 14.7s |
| 2 | A Link to the Past | 12.8s |
| 3 | Super Mario Land 2 | 11.8s |
| 4 | Choo-Choo Charles | 9.8s |
| 5 | Subnautica | 9.6s |
| 6 | The Messenger | 8.8s |
| 7 | Final Fantasy Mystic Quest | 8.8s |
| 8 | Mario & Luigi Superstar Saga | 8.7s |
| 9 | Terraria | 8.7s |
| 10 | Overcooked! 2 | 8.7s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 17.6s |
| 2 | Links Awakening DX | 14.8s |
| 3 | Overcooked! 2 | 14.6s |
| 4 | Sonic Adventure 2 Battle | 14.5s |
| 5 | The Legend of Zelda | 14.5s |
| 6 | The Wind Waker | 14.5s |
| 7 | Mega Man 3 | 14.5s |
| 8 | shapez | 14.5s |
| 9 | DepGraph | 14.4s |
| 10 | Shivers | 14.4s |
