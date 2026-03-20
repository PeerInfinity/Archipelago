# World Generator Test Results

[<- Back to Test Results Summary](./test-results-summary.md)

[📖 Learn about this test](../tests/test-world-generator.md)

**Generated:** 2026-02-14 02:28:14 UTC

**Source Data Created:** 2026-02-13 02:34:28

**Source Data Last Updated:** 2026-02-13 02:34:28

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

**Total Templates:** 62

| Step | Passed | Failed | Total |
|------|--------|--------|-------|
| Original Generation | 62 | 0 | 62 |
| Original Spoiler Test | 62 | 0 | 62 |
| Stage 1: World Generation | 62 | 0 | 62 |
| Stage 2: Seed Generation | 62 | 0 | 62 |
| Stage 3: Rules Comparison | 62 | 0 | 62 |
| Stage 4: WorldGen Spoiler Test | 62 | 0 | 62 |
| Stage 5: Cross-Validation | 62 | 0 | 62 |

## Canonical Detailed Results

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | Rules Comp | WorldGen Spoiler | Cross-Validation |
|------|--------------|------------------|-----------|----------|------------|------------------|------------------|
| A Hat in Time | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A Link to the Past | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A Short Hike | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| APQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Aquaria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Baking Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bumper Stickers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Castlevania - Circle of the Moon | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Castlevania 64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Celeste 64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ChecksFinder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Choo-Choo Charles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Civilization VI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Coding Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DLCQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DOOM 1993 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DOOM II | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Dark Souls III | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Donkey Kong Country 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| EarthBound | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Factorio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Faxanadu | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Final Fantasy Mystic Quest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Heretic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hylics 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inscryption | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Landstalker - The Treasures of King Nole | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Links Awakening DX | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lufia II Ancient Cave | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mario & Luigi Superstar Saga | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Math Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mega Man 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MegaMan Battle Network 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Meritous | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Metamath | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Muse Dash | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Noita | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Old School Runescape | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Overcooked! 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Paint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Risk of Rain 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Satisfactory | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Saving Princess | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shivers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sonic Adventure 2 Battle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subnautica | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario 64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario Land 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Super Mario World | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TOEM original | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| TOEM rule builder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Terraria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| The Legend of Zelda | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| The Messenger | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| The Wind Waker | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timespinner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Undertale | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VVVVVV | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wargroove | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Yoshi's Island | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| shapez | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# Random Mode Results

Tests run with standard randomized item placement.

## Random Summary

**Total Templates:** 62

| Step | Passed | Failed | Total |
|------|--------|--------|-------|
| Original Generation | 62 | 0 | 62 |
| Original Spoiler Test | 62 | 0 | 62 |
| Stage 1: World Generation | 62 | 0 | 62 |
| Stage 2: Seed Generation | 62 | 0 | 62 |
| Stage 3: Rules Comparison | 0 | 62 | 62 |
| Stage 4: WorldGen Spoiler Test | 62 | 0 | 62 |
| Stage 5: Cross-Validation | 43 | 19 | 62 |

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
| DOOM 1993 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| DOOM II | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Dark Souls III | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Donkey Kong Country 3 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| EarthBound | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Factorio | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Faxanadu | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Final Fantasy Mystic Quest | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Heretic | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Hylics 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Inscryption | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Landstalker - The Treasures of King Nole | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Links Awakening DX | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Lufia II Ancient Cave | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mario & Luigi Superstar Saga | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Math Adventure | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Mega Man 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| MegaMan Battle Network 3 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Meritous | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Metamath | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Muse Dash | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Noita | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Old School Runescape | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Overcooked! 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
| Paint | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Risk of Rain 2 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Satisfactory | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Error |
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
| Total | 222.0s | 426.6s | 32.9s | 199.8s | 406.4s | 406.7s |
| Average | 3.6s | 6.9s | 0.5s | 3.2s | 6.6s | 6.6s |
| Max | 10.7s | 21.8s | 0.6s | 5.8s | 21.7s | 21.7s |
| Min | 2.7s | 5.5s | 0.5s | 2.7s | 5.5s | 5.4s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (10.7s) | Satisfactory (21.8s) | Satisfactory (0.6s) | A Link to the Past (5.8s) | Satisfactory (21.7s) | Satisfactory (21.7s) |
| Fastest | Meritous (2.7s) | Coding Adventure (5.5s) | The Messenger (0.5s) | Coding Adventure (2.7s) | Adventure (5.5s) | Adventure (5.4s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 3.9s | 7.2s | 0.6s | 3.6s | 6.7s | 6.7s |
| A Link to the Past | 6.5s | 11.0s | 0.6s | 5.8s | 8.7s | 8.7s |
| A Short Hike | 2.9s | 8.8s | 0.5s | 3.0s | 5.7s | 5.7s |
| APQuest | 2.9s | 7.0s | 0.6s | 3.2s | 5.7s | 5.7s |
| Adventure | 2.8s | 7.7s | 0.5s | 2.7s | 5.5s | 5.4s |
| Aquaria | 4.1s | 7.1s | 0.6s | 3.3s | 5.7s | 5.7s |
| Baking Adventure | 2.8s | 9.8s | 0.5s | 2.8s | 5.5s | 5.5s |
| Bumper Stickers | 2.7s | 6.3s | 0.5s | 2.8s | 5.6s | 5.6s |
| Castlevania - Circle of the Moon | 2.9s | 7.4s | 0.5s | 3.0s | 5.6s | 5.6s |
| Castlevania 64 | 3.2s | 7.2s | 0.5s | 3.2s | 5.7s | 5.7s |
| Celeste 64 | 2.9s | 5.7s | 0.6s | 3.0s | 5.7s | 5.7s |
| ChecksFinder | 2.9s | 5.7s | 0.5s | 2.9s | 5.6s | 5.7s |
| Choo-Choo Charles | 3.0s | 7.7s | 0.5s | 3.0s | 7.7s | 7.8s |
| Civilization VI | 8.2s | 5.7s | 0.6s | 3.0s | 5.9s | 5.8s |
| Coding Adventure | 2.8s | 5.5s | 0.5s | 2.7s | 5.5s | 5.5s |
| DLCQuest | 3.1s | 5.7s | 0.6s | 3.0s | 5.7s | 5.7s |
| DOOM 1993 | 3.4s | 6.5s | 0.5s | 3.2s | 6.5s | 6.5s |
| DOOM II | 3.3s | 7.7s | 0.5s | 3.1s | 7.7s | 7.7s |
| Dark Souls III | 3.7s | 18.8s | 0.6s | 3.7s | 18.7s | 18.7s |
| Donkey Kong Country 3 | 2.9s | 6.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| EarthBound | 3.6s | 5.7s | 0.5s | 3.4s | 5.7s | 5.8s |
| Factorio | 3.6s | 5.7s | 0.5s | 3.4s | 5.7s | 5.7s |
| Faxanadu | 2.9s | 5.7s | 0.5s | 2.8s | 5.7s | 5.7s |
| Final Fantasy Mystic Quest | 3.7s | 6.8s | 0.6s | 3.4s | 6.7s | 6.7s |
| Heretic | 3.3s | 7.5s | 0.5s | 3.2s | 7.5s | 7.5s |
| Hylics 2 | 3.2s | 5.7s | 0.6s | 3.1s | 5.7s | 5.7s |
| Inscryption | 2.9s | 5.5s | 0.5s | 2.9s | 5.6s | 5.5s |
| Landstalker - The Treasures of King Nole | 3.1s | 5.7s | 0.5s | 3.0s | 5.8s | 5.7s |
| Links Awakening DX | 5.8s | 8.7s | 0.6s | 3.5s | 8.7s | 8.7s |
| Lufia II Ancient Cave | 3.0s | 5.8s | 0.5s | 3.0s | 5.7s | 5.6s |
| Mario & Luigi Superstar Saga | 3.6s | 7.8s | 0.6s | 4.1s | 7.7s | 7.7s |
| Math Adventure | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 5.8s |
| Mega Man 2 | 3.0s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| MegaMan Battle Network 3 | 3.3s | 5.8s | 0.6s | 3.1s | 5.8s | 5.8s |
| Meritous | 2.7s | 5.6s | 0.5s | 2.8s | 5.5s | 5.5s |
| Metamath | 10.7s | 5.7s | 0.6s | 2.9s | 5.7s | 5.7s |
| Muse Dash | 3.1s | 5.5s | 0.5s | 3.1s | 5.5s | 5.5s |
| Noita | 2.8s | 5.6s | 0.5s | 2.8s | 5.7s | 5.6s |
| Old School Runescape | 3.7s | 5.7s | 0.5s | 3.4s | 5.7s | 5.7s |
| Overcooked! 2 | 3.2s | 7.7s | 0.5s | 3.1s | 7.7s | 7.7s |
| Paint | 2.9s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Risk of Rain 2 | 3.5s | 5.7s | 0.5s | 3.4s | 5.7s | 5.7s |
| Satisfactory | 4.7s | 21.8s | 0.6s | 3.6s | 21.7s | 21.7s |
| Saving Princess | 3.2s | 5.8s | 0.5s | 2.9s | 5.7s | 5.7s |
| Shivers | 2.9s | 5.5s | 0.5s | 2.9s | 5.5s | 5.5s |
| Sonic Adventure 2 Battle | 4.5s | 5.7s | 0.5s | 4.3s | 5.7s | 5.7s |
| Subnautica | 3.2s | 7.5s | 0.5s | 3.4s | 7.5s | 7.5s |
| Super Mario 64 | 3.1s | 5.7s | 0.5s | 2.9s | 5.7s | 5.6s |
| Super Mario Land 2 | 3.5s | 5.7s | 0.6s | 3.6s | 5.7s | 5.7s |
| Super Mario World | 4.3s | 5.6s | 0.5s | 3.1s | 5.7s | 5.6s |
| TOEM original | 2.8s | 5.7s | 0.5s | 2.8s | 5.7s | 5.7s |
| TOEM rule builder | 2.9s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Terraria | 3.2s | 7.7s | 0.5s | 3.0s | 7.7s | 7.7s |
| The Legend of Zelda | 3.8s | 5.8s | 0.6s | 3.0s | 5.7s | 5.7s |
| The Messenger | 3.1s | 9.6s | 0.5s | 3.0s | 9.6s | 9.6s |
| The Wind Waker | 5.3s | 5.7s | 0.6s | 5.8s | 5.7s | 5.8s |
| Timespinner | 4.0s | 5.5s | 0.5s | 3.9s | 5.5s | 5.6s |
| Undertale | 2.9s | 5.6s | 0.5s | 2.8s | 5.6s | 5.6s |
| VVVVVV | 2.8s | 5.6s | 0.5s | 2.8s | 5.7s | 5.7s |
| Wargroove | 2.8s | 5.7s | 0.5s | 2.8s | 5.6s | 5.7s |
| Yoshi's Island | 3.8s | 5.7s | 0.5s | 3.7s | 5.7s | 5.7s |
| shapez | 3.8s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 10.7s |
| 2 | Civilization VI | 8.2s |
| 3 | A Link to the Past | 6.5s |
| 4 | Links Awakening DX | 5.8s |
| 5 | The Wind Waker | 5.3s |
| 6 | Satisfactory | 4.7s |
| 7 | Sonic Adventure 2 Battle | 4.5s |
| 8 | Super Mario World | 4.3s |
| 9 | Aquaria | 4.1s |
| 10 | Timespinner | 4.0s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 21.8s |
| 2 | Dark Souls III | 18.8s |
| 3 | A Link to the Past | 11.0s |
| 4 | Baking Adventure | 9.8s |
| 5 | The Messenger | 9.6s |
| 6 | A Short Hike | 8.8s |
| 7 | Links Awakening DX | 8.7s |
| 8 | Mario & Luigi Superstar Saga | 7.8s |
| 9 | Overcooked! 2 | 7.7s |
| 10 | Terraria | 7.7s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 0.6s |
| 2 | The Legend of Zelda | 0.6s |
| 3 | A Hat in Time | 0.6s |
| 4 | A Link to the Past | 0.6s |
| 5 | Dark Souls III | 0.6s |
| 6 | Final Fantasy Mystic Quest | 0.6s |
| 7 | Aquaria | 0.6s |
| 8 | Civilization VI | 0.6s |
| 9 | MegaMan Battle Network 3 | 0.6s |
| 10 | Super Mario Land 2 | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | A Link to the Past | 5.8s |
| 2 | The Wind Waker | 5.8s |
| 3 | Sonic Adventure 2 Battle | 4.3s |
| 4 | Mario & Luigi Superstar Saga | 4.1s |
| 5 | Timespinner | 3.9s |
| 6 | Yoshi's Island | 3.7s |
| 7 | Dark Souls III | 3.7s |
| 8 | A Hat in Time | 3.6s |
| 9 | Satisfactory | 3.6s |
| 10 | Super Mario Land 2 | 3.6s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 21.7s |
| 2 | Dark Souls III | 18.7s |
| 3 | The Messenger | 9.6s |
| 4 | A Link to the Past | 8.7s |
| 5 | Links Awakening DX | 8.7s |
| 6 | Choo-Choo Charles | 7.7s |
| 7 | Mario & Luigi Superstar Saga | 7.7s |
| 8 | Overcooked! 2 | 7.7s |
| 9 | DOOM II | 7.7s |
| 10 | Terraria | 7.7s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 21.7s |
| 2 | Dark Souls III | 18.7s |
| 3 | The Messenger | 9.6s |
| 4 | A Link to the Past | 8.7s |
| 5 | Links Awakening DX | 8.7s |
| 6 | Choo-Choo Charles | 7.8s |
| 7 | Overcooked! 2 | 7.7s |
| 8 | DOOM II | 7.7s |
| 9 | Mario & Luigi Superstar Saga | 7.7s |
| 10 | Terraria | 7.7s |

---

## Random Processing Times

Processing times for each test phase. Times are in seconds.

### Summary Statistics

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Total | 227.8s | 431.1s | 33.7s | 202.4s | 405.8s | 550.9s |
| Average | 3.7s | 7.0s | 0.5s | 3.3s | 6.5s | 8.9s |
| Max | 12.4s | 22.0s | 0.7s | 6.5s | 21.8s | 32.9s |
| Min | 2.5s | 5.4s | 0.5s | 2.6s | 5.4s | 5.4s |

### Slowest and Fastest Games

| Metric | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|--------|--------------|------------------|-----------|----------|------------------|-----------|
| Slowest | Metamath (12.4s) | Satisfactory (22.0s) | Sonic Adventure 2 Battle (0.7s) | The Wind Waker (6.5s) | Satisfactory (21.8s) | Dark Souls III (32.9s) |
| Fastest | TOEM original (2.5s) | Celeste 64 (5.4s) | TOEM original (0.5s) | TOEM original (2.6s) | Yoshi's Island (5.4s) | TOEM original (5.4s) |

### Individual Game Processing Times

| Game | Original Gen | Original Spoiler | World Gen | Seed Gen | WorldGen Spoiler | Cross-Val |
|------|--------------|------------------|-----------|----------|------------------|-----------|
| A Hat in Time | 3.5s | 10.4s | 0.5s | 3.4s | 6.4s | 6.5s |
| A Link to the Past | 6.7s | 9.3s | 0.6s | 5.8s | 8.7s | 14.5s |
| A Short Hike | 2.9s | 10.4s | 0.5s | 3.2s | 5.7s | 5.7s |
| APQuest | 2.8s | 7.1s | 0.5s | 2.9s | 5.7s | 5.7s |
| Adventure | 3.0s | 7.5s | 0.5s | 3.0s | 5.7s | 5.7s |
| Aquaria | 4.7s | 8.6s | 0.6s | 3.4s | 5.7s | 5.7s |
| Baking Adventure | 3.0s | 8.6s | 0.6s | 3.1s | 5.7s | 5.7s |
| Bumper Stickers | 2.7s | 7.9s | 0.5s | 2.8s | 5.6s | 14.2s |
| Castlevania - Circle of the Moon | 3.1s | 6.2s | 0.5s | 3.2s | 5.7s | 5.7s |
| Castlevania 64 | 3.2s | 7.0s | 0.5s | 3.2s | 5.7s | 5.7s |
| Celeste 64 | 2.6s | 5.4s | 0.5s | 2.7s | 5.5s | 13.7s |
| ChecksFinder | 2.8s | 5.8s | 0.5s | 2.8s | 5.7s | 5.7s |
| Choo-Choo Charles | 2.9s | 7.7s | 0.6s | 3.0s | 7.7s | 7.7s |
| Civilization VI | 8.2s | 5.7s | 0.5s | 3.0s | 5.7s | 14.5s |
| Coding Adventure | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| DLCQuest | 3.5s | 5.9s | 0.6s | 3.0s | 5.7s | 5.7s |
| DOOM 1993 | 3.6s | 6.8s | 0.6s | 3.5s | 6.8s | 14.5s |
| DOOM II | 3.3s | 7.7s | 0.5s | 3.2s | 7.7s | 14.4s |
| Dark Souls III | 4.0s | 18.8s | 0.6s | 3.8s | 17.7s | 32.9s |
| Donkey Kong Country 3 | 3.0s | 5.7s | 0.6s | 3.1s | 5.7s | 14.4s |
| EarthBound | 3.3s | 5.5s | 0.5s | 3.1s | 5.4s | 5.4s |
| Factorio | 3.4s | 5.7s | 0.5s | 3.3s | 5.7s | 5.7s |
| Faxanadu | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 14.3s |
| Final Fantasy Mystic Quest | 3.5s | 6.7s | 0.6s | 3.4s | 6.8s | 6.7s |
| Heretic | 3.5s | 7.7s | 0.6s | 3.4s | 7.7s | 14.4s |
| Hylics 2 | 3.9s | 5.9s | 0.6s | 3.1s | 5.7s | 5.7s |
| Inscryption | 3.1s | 5.7s | 0.6s | 3.0s | 5.7s | 5.7s |
| Landstalker - The Treasures of King Nole | 3.1s | 5.7s | 0.6s | 3.0s | 5.7s | 5.6s |
| Links Awakening DX | 6.0s | 8.7s | 0.6s | 3.8s | 8.7s | 8.8s |
| Lufia II Ancient Cave | 3.2s | 5.7s | 0.6s | 3.3s | 5.8s | 5.8s |
| Mario & Luigi Superstar Saga | 3.3s | 6.4s | 0.5s | 3.7s | 6.4s | 6.5s |
| Math Adventure | 2.8s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Mega Man 2 | 3.0s | 5.7s | 0.5s | 2.8s | 5.7s | 5.6s |
| MegaMan Battle Network 3 | 3.1s | 5.7s | 0.5s | 3.0s | 5.7s | 14.4s |
| Meritous | 2.9s | 5.8s | 0.6s | 2.9s | 5.7s | 5.7s |
| Metamath | 12.4s | 5.8s | 0.6s | 2.9s | 5.7s | 5.7s |
| Muse Dash | 3.3s | 5.8s | 0.6s | 3.2s | 5.7s | 5.7s |
| Noita | 2.8s | 5.6s | 0.5s | 2.8s | 5.7s | 5.6s |
| Old School Runescape | 4.0s | 5.7s | 0.6s | 3.7s | 5.8s | 5.7s |
| Overcooked! 2 | 3.3s | 7.7s | 0.6s | 3.2s | 7.8s | 14.7s |
| Paint | 2.6s | 5.4s | 0.5s | 2.8s | 5.4s | 5.4s |
| Risk of Rain 2 | 3.3s | 5.7s | 0.5s | 3.2s | 5.7s | 5.7s |
| Satisfactory | 4.8s | 22.0s | 0.6s | 4.1s | 21.8s | 15.8s |
| Saving Princess | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 5.7s |
| Shivers | 3.2s | 5.7s | 0.5s | 3.1s | 5.7s | 14.4s |
| Sonic Adventure 2 Battle | 5.3s | 6.7s | 0.7s | 4.3s | 5.7s | 14.7s |
| Subnautica | 3.5s | 7.8s | 0.6s | 3.4s | 7.7s | 14.5s |
| Super Mario 64 | 3.1s | 5.6s | 0.5s | 3.0s | 5.7s | 5.7s |
| Super Mario Land 2 | 3.5s | 5.7s | 0.6s | 3.8s | 5.7s | 5.7s |
| Super Mario World | 4.3s | 5.7s | 0.6s | 3.3s | 5.7s | 5.7s |
| TOEM original | 2.5s | 5.4s | 0.5s | 2.6s | 5.4s | 5.4s |
| TOEM rule builder | 2.9s | 5.7s | 0.5s | 2.9s | 5.7s | 5.6s |
| Terraria | 3.1s | 7.8s | 0.6s | 3.0s | 7.7s | 7.7s |
| The Legend of Zelda | 3.9s | 5.7s | 0.6s | 3.1s | 5.7s | 14.5s |
| The Messenger | 3.3s | 9.8s | 0.5s | 3.3s | 9.8s | 9.8s |
| The Wind Waker | 5.8s | 5.8s | 0.6s | 6.5s | 5.9s | 14.9s |
| Timespinner | 4.3s | 5.9s | 0.6s | 3.8s | 5.7s | 5.7s |
| Undertale | 2.9s | 5.6s | 0.5s | 2.8s | 5.6s | 5.6s |
| VVVVVV | 2.9s | 5.6s | 0.5s | 2.8s | 5.6s | 5.7s |
| Wargroove | 3.0s | 5.7s | 0.5s | 3.0s | 5.7s | 5.7s |
| Yoshi's Island | 3.5s | 5.4s | 0.5s | 3.5s | 5.4s | 5.4s |
| shapez | 3.8s | 5.7s | 0.5s | 3.2s | 5.7s | 14.4s |

### Top 10 Longest Processing Times

#### Original Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Metamath | 12.4s |
| 2 | Civilization VI | 8.2s |
| 3 | A Link to the Past | 6.7s |
| 4 | Links Awakening DX | 6.0s |
| 5 | The Wind Waker | 5.8s |
| 6 | Sonic Adventure 2 Battle | 5.3s |
| 7 | Satisfactory | 4.8s |
| 8 | Aquaria | 4.7s |
| 9 | Super Mario World | 4.3s |
| 10 | Timespinner | 4.3s |

#### Original Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 22.0s |
| 2 | Dark Souls III | 18.8s |
| 3 | A Short Hike | 10.4s |
| 4 | A Hat in Time | 10.4s |
| 5 | The Messenger | 9.8s |
| 6 | A Link to the Past | 9.3s |
| 7 | Links Awakening DX | 8.7s |
| 8 | Aquaria | 8.6s |
| 9 | Baking Adventure | 8.6s |
| 10 | Bumper Stickers | 7.9s |

#### World Generation

| Rank | Game | Time |
|------|------|------|
| 1 | Sonic Adventure 2 Battle | 0.7s |
| 2 | Hylics 2 | 0.6s |
| 3 | DLCQuest | 0.6s |
| 4 | Aquaria | 0.6s |
| 5 | Dark Souls III | 0.6s |
| 6 | Metamath | 0.6s |
| 7 | Satisfactory | 0.6s |
| 8 | A Link to the Past | 0.6s |
| 9 | DOOM 1993 | 0.6s |
| 10 | Subnautica | 0.6s |

#### Seed Generation

| Rank | Game | Time |
|------|------|------|
| 1 | The Wind Waker | 6.5s |
| 2 | A Link to the Past | 5.8s |
| 3 | Sonic Adventure 2 Battle | 4.3s |
| 4 | Satisfactory | 4.1s |
| 5 | Dark Souls III | 3.8s |
| 6 | Links Awakening DX | 3.8s |
| 7 | Super Mario Land 2 | 3.8s |
| 8 | Timespinner | 3.8s |
| 9 | Old School Runescape | 3.7s |
| 10 | Mario & Luigi Superstar Saga | 3.7s |

#### WorldGen Spoiler Test

| Rank | Game | Time |
|------|------|------|
| 1 | Satisfactory | 21.8s |
| 2 | Dark Souls III | 17.7s |
| 3 | The Messenger | 9.8s |
| 4 | Links Awakening DX | 8.7s |
| 5 | A Link to the Past | 8.7s |
| 6 | Overcooked! 2 | 7.8s |
| 7 | Heretic | 7.7s |
| 8 | Subnautica | 7.7s |
| 9 | Choo-Choo Charles | 7.7s |
| 10 | Terraria | 7.7s |

#### Cross-Validation

| Rank | Game | Time |
|------|------|------|
| 1 | Dark Souls III | 32.9s |
| 2 | Satisfactory | 15.8s |
| 3 | The Wind Waker | 14.9s |
| 4 | Overcooked! 2 | 14.7s |
| 5 | Sonic Adventure 2 Battle | 14.7s |
| 6 | A Link to the Past | 14.5s |
| 7 | DOOM 1993 | 14.5s |
| 8 | Civilization VI | 14.5s |
| 9 | Subnautica | 14.5s |
| 10 | The Legend of Zelda | 14.5s |
