# Universal Tracker Fuzz Test Results

[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-02-19 21:59:55 UTC

**Source Data Created:** 2026-02-19T21:13:17.198294+00:00

**Source Data Last Updated:** 2026-02-19T21:13:17.198303+00:00

**Universal Tracker Version:** Worldgen (regenerates world from rules.json)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 10

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 87
- **Games with 100% Pass Rate:** 68 (78.2%)
- **Games with Failures:** 19 (21.8%)
- **Total Fuzz Runs:** 870
- **Successful Runs:** 701 (80.6%)
- **Failed Runs:** 131
- **Timed Out Runs:** 1
- **Ignored Runs:** 37

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 56 (passes worldgen mode per config)
- **Unexpected Passes:** 12 (expected to fail but passed)
- **Expected Failures:** 14 (doesn't pass worldgen mode per config)
- **Unexpected Failures (logic):** 5 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

### Explain Support Summary

- **Games with Explain Stats:** 68
- **Games with 100% Explain Coverage:** 61
- **Games with No Explain Support:** 0
- **Locations with Explain Support:** 6,977
- **Locations without Explain Support:** 528
- **Locations with Default Rule:** 13,758
- **Overall Explain Coverage:** 93.0%

### Generic Exporter/Logic Statistics

Of the 68 games with 100% pass rate:

- **Passing with Generic Exporter:** 40/68 (58.8%)
- **Passing with Generic Logic:** 64/68 (94.1%)
- **Passing with Both Generic:** 40/68 (58.8%)

**Combined Custom Code Size:**

- **Total Exporter Code:** 616.6KB
- **Total Game Logic Code:** 655.3KB
- **Combined Total:** 1271.9KB

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate | Exporter | GameLogic | Rules Size |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|:--------:|:---------:|:----------:|
| A Hat in Time | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 18.2KB | ✅ | 230.1KB |
| A Link to the Past | ❌ | 10 | 8 | 1 | 0 | 1 | ⚠️ 80.0% | 14.0KB | ✅ | 664.1KB |
| A Short Hike | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 71.6KB |
| APQuest | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 10.9KB |
| Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 25.6KB |
| Aquaria | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 1.8KB | ✅ | 272.0KB |
| Baking Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 17.8KB |
| Blasphemous | ✅ | 10 | 4 | 0 | 0 | 6 | ❌ 40.0% | ✅ | ✅ | 2760.7KB |
| *Bomb Rush Cyberfunk* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 1.4KB | 40.3KB | 325.2KB |
| Bumper Stickers | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 50.1KB |
| Castlevania - Circle of the Moon | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 4.0KB | ✅ | 93.7KB |
| Castlevania 64 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 137.7KB |
| *Celeste (Open World)* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 1039.3KB |
| Celeste 64 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 4.1KB | ✅ | 53.3KB |
| ChecksFinder | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 16.1KB |
| Choo-Choo Charles | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 281.3KB |
| Civilization VI | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 163.0KB |
| Coding Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 54.1KB |
| DLCQuest | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 1.2KB | ✅ | 49.7KB |
| DOOM 1993 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 275.6KB |
| DOOM II | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 322.4KB |
| Dark Souls III | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 1033.9KB |
| Donkey Kong Country 3 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 122.3KB |
| EarthBound | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 337.5KB |
| Factorio | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% | 8.8KB | ✅ | 290.0KB |
| Faxanadu | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 68.0KB |
| Final Fantasy | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 50.2KB |
| Final Fantasy Mystic Quest | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | 13.9KB | ✅ | 548.0KB |
| Heretic | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 361.3KB |
| Hollow Knight | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | 3500.0KB |
| Hylics 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 100.3KB |
| Inscryption | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 8.0KB | ✅ | 83.0KB |
| Jak and Daxter: The Precursor Legacy | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 21.7KB | 4.6KB | 257.6KB |
| *Kingdom Hearts* | ❌ | 10 | 4 | 6 | 0 | 0 | ❌ 40.0% | ✅ | ✅ | 748.6KB |
| *Kingdom Hearts 2* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 20.4KB | ✅ | 1630.5KB |
| *Kirby's Dream Land 3* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 10.1KB | ✅ | 528.6KB |
| Landstalker - The Treasures of King Nole | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 3.6KB | ✅ | 209.1KB |
| *Lingo* | ✅ | 10 | 3 | 0 | 0 | 7 | ❌ 30.0% | 38.2KB | 10.7KB | 939.9KB |
| Links Awakening DX | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 7.3KB | ✅ | 703.0KB |
| Lufia II Ancient Cave | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 122.7KB |
| Mario & Luigi Superstar Saga | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 395.4KB |
| Math Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 12.4KB |
| Mega Man 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 51.6KB |
| MegaMan Battle Network 3 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 204.6KB |
| Meritous | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 56.7KB |
| Metamath | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 45.8KB |
| Muse Dash | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 217.4KB |
| Noita | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 73.8KB |
| Ocarina of Time | ❌ | 10 | 0 | 8 | 0 | 2 | ❌ 0.0% | ✅ | ✅ | 1274.3KB |
| Old School Runescape | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 1.0KB | ✅ | 305.1KB |
| Overcooked! 2 | ✅ | 10 | 5 | 0 | 0 | 5 | ⚠️ 50.0% | 28.5KB | ✅ | 488.2KB |
| Paint | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 2.7KB | ✅ | 123.0KB |
| Pokemon Emerald | ❌ | 10 | 3 | 4 | 0 | 3 | ❌ 30.0% | 5.2KB | 8.7KB | 1350.0KB |
| Pokemon Red and Blue | ❌ | 10 | 0 | 8 | 0 | 2 | ❌ 0.0% | 12.2KB | 13.0KB | 1270.1KB |
| *Raft* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 6.5KB | ✅ | 198.3KB |
| Risk of Rain 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 145.0KB |
| SMZ3 | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% | 54.2KB | 51.3KB | 1886.9KB |
| Satisfactory | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 41.8KB | ✅ | 1618.9KB |
| Saving Princess | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 33.3KB |
| *Secret of Evermore* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 5.6KB | 7.5KB | 414.9KB |
| Shivers | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 149.8KB |
| Sonic Adventure 2 Battle | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 262.1KB |
| *Starcraft 2* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 29.3KB | 90.1KB | 1086.7KB |
| *Stardew Valley* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 18.8KB | 8.0KB | 2407.6KB |
| Subnautica | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 2.2KB | ✅ | 205.4KB |
| Sudoku | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 2.1KB |
| Super Mario 64 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 100.9KB |
| Super Mario Land 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 96.3KB | ✅ | 919.0KB |
| Super Mario World | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 177.6KB |
| *Super Metroid* | ❌ | 10 | 0 | 7 | 0 | 3 | ❌ 0.0% | 61.0KB | 114.5KB | 625.0KB |
| TOEM original | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 0.6KB | ✅ | 99.6KB |
| TOEM rule builder | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 0.5KB | ✅ | 99.6KB |
| *TUNIC* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 3.1KB | ✅ | 649.1KB |
| Terraria | ❌ | 10 | 2 | 7 | 0 | 1 | ❌ 20.0% | 16.9KB | ✅ | 278.6KB |
| The Legend of Zelda | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 554.5KB |
| The Messenger | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 15.2KB | ✅ | 210.3KB |
| The Wind Waker | ✅ | 10 | 5 | 0 | 0 | 5 | ⚠️ 50.0% | 7.0KB | ✅ | 250.1KB |
| *The Witness* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 14.2KB | ✅ | 392.1KB |
| Timespinner | ❌ | 10 | 4 | 6 | 0 | 0 | ❌ 40.0% | 2.2KB | ✅ | 262.7KB |
| Undertale | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 56.0KB |
| VVVVVV | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 3.8KB | ✅ | 22.4KB |
| Wargroove | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 44.0KB |
| *Yacht Dice* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 0.9KB | 285.0KB | 248.4KB |
| Yoshi's Island | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 9.2KB | ✅ | 295.2KB |
| Yu-Gi-Oh! 2006 | ❌ | 10 | 5 | 5 | 0 | 0 | ⚠️ 50.0% | 1.3KB | 21.4KB | 643.9KB |
| Zillion | ❌ | 10 | 0 | 8 | 1 | 1 | ❌ 0.0% | ✅ | ✅ | 321.1KB |
| shapez | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% | ✅ | ✅ | 153.7KB |

## Results Breakdown

### Expected Passes (56)

Games that pass worldgen mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | 10 | 10 | 0 | 0 | 100.0% |
| A Short Hike | 10 | 10 | 0 | 0 | 100.0% |
| APQuest | 10 | 10 | 0 | 0 | 100.0% |
| Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Aquaria | 10 | 10 | 0 | 0 | 100.0% |
| Baking Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Bumper Stickers | 10 | 10 | 0 | 0 | 100.0% |
| Castlevania - Circle of the Moon | 10 | 10 | 0 | 0 | 100.0% |
| Castlevania 64 | 10 | 10 | 0 | 0 | 100.0% |
| Celeste 64 | 10 | 10 | 0 | 0 | 100.0% |
| ChecksFinder | 10 | 10 | 0 | 0 | 100.0% |
| Choo-Choo Charles | 10 | 10 | 0 | 0 | 100.0% |
| Civilization VI | 10 | 10 | 0 | 0 | 100.0% |
| Coding Adventure | 10 | 10 | 0 | 0 | 100.0% |
| DLCQuest | 10 | 10 | 0 | 0 | 100.0% |
| DOOM 1993 | 10 | 10 | 0 | 0 | 100.0% |
| DOOM II | 10 | 10 | 0 | 0 | 100.0% |
| Dark Souls III | 10 | 10 | 0 | 0 | 100.0% |
| Donkey Kong Country 3 | 10 | 10 | 0 | 0 | 100.0% |
| Faxanadu | 10 | 10 | 0 | 0 | 100.0% |
| Final Fantasy | 10 | 10 | 0 | 0 | 100.0% |
| Heretic | 10 | 10 | 0 | 0 | 100.0% |
| Hylics 2 | 10 | 10 | 0 | 0 | 100.0% |
| Inscryption | 10 | 10 | 0 | 0 | 100.0% |
| Landstalker - The Treasures of King Nole | 10 | 10 | 0 | 0 | 100.0% |
| Links Awakening DX | 10 | 10 | 0 | 0 | 100.0% |
| Lufia II Ancient Cave | 10 | 10 | 0 | 0 | 100.0% |
| Mario & Luigi Superstar Saga | 10 | 10 | 0 | 0 | 100.0% |
| Math Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Mega Man 2 | 10 | 10 | 0 | 0 | 100.0% |
| MegaMan Battle Network 3 | 10 | 10 | 0 | 0 | 100.0% |
| Meritous | 10 | 10 | 0 | 0 | 100.0% |
| Metamath | 10 | 10 | 0 | 0 | 100.0% |
| Muse Dash | 10 | 10 | 0 | 0 | 100.0% |
| Noita | 10 | 10 | 0 | 0 | 100.0% |
| Old School Runescape | 10 | 10 | 0 | 0 | 100.0% |
| Overcooked! 2 | 10 | 5 | 0 | 0 | 50.0% |
| Paint | 10 | 10 | 0 | 0 | 100.0% |
| Risk of Rain 2 | 10 | 10 | 0 | 0 | 100.0% |
| Saving Princess | 10 | 10 | 0 | 0 | 100.0% |
| Shivers | 10 | 10 | 0 | 0 | 100.0% |
| Sonic Adventure 2 Battle | 10 | 10 | 0 | 0 | 100.0% |
| Subnautica | 10 | 10 | 0 | 0 | 100.0% |
| Sudoku | 10 | 10 | 0 | 0 | 100.0% |
| Super Mario 64 | 10 | 10 | 0 | 0 | 100.0% |
| Super Mario Land 2 | 10 | 10 | 0 | 0 | 100.0% |
| Super Mario World | 10 | 10 | 0 | 0 | 100.0% |
| TOEM original | 10 | 10 | 0 | 0 | 100.0% |
| TOEM rule builder | 10 | 10 | 0 | 0 | 100.0% |
| The Legend of Zelda | 10 | 10 | 0 | 0 | 100.0% |
| The Messenger | 10 | 10 | 0 | 0 | 100.0% |
| The Wind Waker | 10 | 5 | 0 | 0 | 50.0% |
| Undertale | 10 | 10 | 0 | 0 | 100.0% |
| VVVVVV | 10 | 10 | 0 | 0 | 100.0% |
| Wargroove | 10 | 10 | 0 | 0 | 100.0% |
| Yoshi's Island | 10 | 10 | 0 | 0 | 100.0% |

### Unexpected Passes (12)

Games NOT expected to pass worldgen mode (not in config or mode not listed) but passed anyway.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Blasphemous | 10 | 4 | 0 | 0 | 40.0% |
| Bomb Rush Cyberfunk | 10 | 10 | 0 | 0 | 100.0% |
| Celeste (Open World) | 10 | 10 | 0 | 0 | 100.0% |
| EarthBound | 10 | 10 | 0 | 0 | 100.0% |
| Final Fantasy Mystic Quest | 10 | 9 | 0 | 0 | 90.0% |
| Jak and Daxter: The Precursor Legacy | 10 | 10 | 0 | 0 | 100.0% |
| Lingo | 10 | 3 | 0 | 0 | 30.0% |
| Raft | 10 | 10 | 0 | 0 | 100.0% |
| Satisfactory | 10 | 10 | 0 | 0 | 100.0% |
| Secret of Evermore | 10 | 10 | 0 | 0 | 100.0% |
| TUNIC | 10 | 10 | 0 | 0 | 100.0% |
| The Witness | 10 | 10 | 0 | 0 | 100.0% |

### Expected Failures (14)

Games NOT expected to pass worldgen mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Hollow Knight | 10 | 0 | 10 | 0 | 0.0% |
| Kingdom Hearts | 10 | 4 | 6 | 0 | 40.0% |
| Kingdom Hearts 2 | 10 | 0 | 10 | 0 | 0.0% |
| Kirby's Dream Land 3 | 10 | 0 | 10 | 0 | 0.0% |
| Ocarina of Time | 10 | 0 | 8 | 0 | 0.0% |
| Pokemon Emerald | 10 | 3 | 4 | 0 | 30.0% |
| Pokemon Red and Blue | 10 | 0 | 8 | 0 | 0.0% |
| SMZ3 | 10 | 1 | 9 | 0 | 10.0% |
| Starcraft 2 | 10 | 0 | 10 | 0 | 0.0% |
| Stardew Valley | 10 | 0 | 10 | 0 | 0.0% |
| Super Metroid | 10 | 0 | 7 | 0 | 0.0% |
| Yacht Dice | 10 | 0 | 10 | 0 | 0.0% |
| Yu-Gi-Oh! 2006 | 10 | 5 | 5 | 0 | 50.0% |
| Zillion | 10 | 0 | 8 | 1 | 0.0% |

### Unexpected Failures (Logic Mismatch) (5)

Games expected to pass worldgen mode but failed due to logic mismatches.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Link to the Past | 10 | 8 | 1 | 0 | 80.0% |
| Factorio | 10 | 9 | 1 | 0 | 90.0% |
| Terraria | 10 | 2 | 7 | 0 | 20.0% |
| Timespinner | 10 | 4 | 6 | 0 | 40.0% |
| shapez | 10 | 9 | 1 | 0 | 90.0% |

## Explain Support Details

This section shows which games have rules that support the `explain_json()` method, which provides human-readable explanations of access rule logic.

| Game Name | Total Locs | With Explain | Without Explain | Default Rule | Coverage |
|-----------|:----------:|:------------:|:---------------:|:------------:|:--------:|
| Timespinner | 725 | 178 | 447 | 100 | 🔶 28% |
| Kingdom Hearts 2 | 669 | 46 | 30 | 593 | ⚠️ 61% |
| A Link to the Past | 226 | 113 | 28 | 85 | ⚠️ 80% |
| Super Mario 64 | 164 | 30 | 4 | 130 | ⚠️ 88% |
| The Wind Waker | 228 | 173 | 16 | 39 | ⚠️ 92% |
| The Messenger | 136 | 52 | 2 | 82 | ⚠️ 96% |
| Mega Man 2 | 44 | 29 | 1 | 14 | ⚠️ 97% |
| A Hat in Time | 279 | 104 | 0 | 175 | ✅ 100% |
| A Short Hike | 131 | 82 | 0 | 49 | ✅ 100% |
| APQuest | 7 | 1 | 0 | 6 | ✅ 100% |
| Adventure | 21 | 0 | 0 | 21 | ✅ 100% |
| Aquaria | 218 | 35 | 0 | 183 | ✅ 100% |
| Baking Adventure | 15 | 8 | 0 | 7 | ✅ 100% |
| Bumper Stickers | 100 | 38 | 0 | 62 | ✅ 100% |
| Castlevania - Circle of the Moon | 124 | 46 | 0 | 78 | ✅ 100% |
| Castlevania 64 | 294 | 0 | 0 | 294 | ✅ 100% |
| Celeste 64 | 42 | 21 | 0 | 21 | ✅ 100% |
| ChecksFinder | 25 | 20 | 0 | 5 | ✅ 100% |
| Choo-Choo Charles | 691 | 64 | 0 | 627 | ✅ 100% |
| Civilization VI | 270 | 91 | 0 | 179 | ✅ 100% |
| Coding Adventure | 61 | 43 | 0 | 18 | ✅ 100% |
| DLCQuest | 31 | 22 | 0 | 9 | ✅ 100% |
| DOOM 1993 | 474 | 0 | 0 | 474 | ✅ 100% |
| DOOM II | 479 | 0 | 0 | 479 | ✅ 100% |
| Dark Souls III | 1190 | 208 | 0 | 982 | ✅ 100% |
| Donkey Kong Country 3 | 220 | 1 | 0 | 219 | ✅ 100% |
| EarthBound | 251 | 44 | 0 | 207 | ✅ 100% |
| Factorio | 309 | 288 | 0 | 21 | ✅ 100% |
| Faxanadu | 110 | 24 | 0 | 86 | ✅ 100% |
| Final Fantasy | 0 | 0 | 0 | 0 | ✅ 100% |
| Final Fantasy Mystic Quest | 251 | 61 | 0 | 190 | ✅ 100% |
| Heretic | 691 | 0 | 0 | 691 | ✅ 100% |
| Hylics 2 | 166 | 88 | 0 | 78 | ✅ 100% |
| Inscryption | 100 | 65 | 0 | 35 | ✅ 100% |
| Landstalker - The Treasures of King Nole | 291 | 1 | 0 | 290 | ✅ 100% |
| Links Awakening DX | 220 | 0 | 0 | 220 | ✅ 100% |
| Lufia II Ancient Cave | 97 | 92 | 0 | 5 | ✅ 100% |
| Mario & Luigi Superstar Saga | 598 | 372 | 0 | 226 | ✅ 100% |
| Math Adventure | 10 | 5 | 0 | 5 | ✅ 100% |
| MegaMan Battle Network 3 | 263 | 80 | 0 | 183 | ✅ 100% |
| Meritous | 104 | 0 | 0 | 104 | ✅ 100% |
| Metamath | 6 | 0 | 0 | 6 | ✅ 100% |
| Muse Dash | 828 | 828 | 0 | 0 | ✅ 100% |
| Noita | 376 | 0 | 0 | 376 | ✅ 100% |
| Ocarina of Time | 849 | 61 | 0 | 788 | ✅ 100% |
| Old School Runescape | 76 | 67 | 0 | 9 | ✅ 100% |
| Overcooked! 2 | 43 | 9 | 0 | 34 | ✅ 100% |
| Paint | 167 | 167 | 0 | 0 | ✅ 100% |
| Risk of Rain 2 | 672 | 672 | 0 | 0 | ✅ 100% |
| Satisfactory | 549 | 104 | 0 | 445 | ✅ 100% |
| Saving Princess | 36 | 16 | 0 | 20 | ✅ 100% |
| Shivers | 76 | 22 | 0 | 54 | ✅ 100% |
| Sonic Adventure 2 Battle | 1046 | 227 | 0 | 819 | ✅ 100% |
| Stardew Valley | 1070 | 927 | 0 | 143 | ✅ 100% |
| Subnautica | 161 | 161 | 0 | 0 | ✅ 100% |
| Super Mario Land 2 | 59 | 35 | 0 | 24 | ✅ 100% |
| Super Mario World | 743 | 396 | 0 | 347 | ✅ 100% |
| Super Metroid | 91 | 91 | 0 | 0 | ✅ 100% |
| TOEM original | 191 | 4 | 0 | 187 | ✅ 100% |
| TOEM rule builder | 214 | 4 | 0 | 210 | ✅ 100% |
| Terraria | 128 | 92 | 0 | 36 | ✅ 100% |
| The Legend of Zelda | 155 | 151 | 0 | 4 | ✅ 100% |
| Undertale | 106 | 95 | 0 | 11 | ✅ 100% |
| VVVVVV | 20 | 2 | 0 | 18 | ✅ 100% |
| Wargroove | 38 | 28 | 0 | 10 | ✅ 100% |
| Yoshi's Island | 221 | 121 | 0 | 100 | ✅ 100% |
| Zillion | 147 | 147 | 0 | 0 | ✅ 100% |
| shapez | 2870 | 25 | 0 | 2845 | ✅ 100% |

## Notes

- *Italic game names* are in the exclude list for this test type
- **Result:** ✅ if all fuzz runs passed (0 failures, 0 timeouts), ❌ otherwise
- **Total:** Number of fuzz runs attempted for this game
- **Success:** Number of runs where UT matched Python sphere log
- **Failure:** Number of runs where UT mismatched or encountered errors
- **Timeout:** Number of runs that exceeded the time limit
- **Ignored:** Number of runs skipped due to option errors
- **Success Rate:** Percentage of successful runs
- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script
- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files
- **Rules Size:** File size of rules.json for seed 1 (N/A if not generated)

### Explain Support Columns

- **Total Locs:** Total number of locations with addresses (excludes events)
- **With Explain:** Locations with rules that have `explain_json()` support
- **Without Explain:** Locations with custom rules but no explain support (lambdas/functions)
- **Default Rule:** Locations with no access rule set (always accessible)
- **Coverage:** Percentage of custom-rule locations that have explain support

### About This Test

The UT fuzzer tests Universal Tracker compatibility by:
1. Generating random game configurations (YAML options)
2. Creating an Archipelago seed with those options
3. Exporting the seed to JSON rules
4. Regenerating the world using the world generator
5. Comparing UT's accessibility calculations to the Python sphere log

Failures indicate that for certain option combinations, UT's logic differs from Python's logic. This helps identify edge cases that need fixing.

## Excluded Templates

These templates are excluded from testing:

| Template | Reason |
|----------|--------|
| APWorld Manager.yaml | Not a game. |
| Archipelago.yaml | Not a game. |
| Bomb Rush Cyberfunk.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Celeste (Open World).yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| JSON Tools Installer.yaml | Not a game. |
| Kingdom Hearts 2.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Kingdom Hearts.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Kirby's Dream Land 3.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Lingo.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Raft.yaml | Temporarily excluded. The WorldGen spoiler test times out at 300 seconds. |
| Secret of Evermore.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Starcraft 2.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Stardew Valley.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Super Metroid.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| TUNIC.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| The Witness.yaml | Temporarily excluded. The WorldGen spoiler test takes 261 seconds. |
| Universal Tracker.yaml | Not a game. |
| Yacht Dice.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
