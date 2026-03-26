# Universal Tracker Fuzz Test Results

[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-03-24 19:12:10 UTC

**Source Data Created:** 2026-03-24T03:35:37.045542+00:00

**Source Data Last Updated:** 2026-03-24T03:35:37.045574+00:00

**Universal Tracker Version:** Worldgen (regenerates world from rules.json)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 100

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 88
- **Games with 100% Pass Rate:** 63 (71.6%)
- **Games with Failures:** 25 (28.4%)
- **Total Fuzz Runs:** 8800
- **Successful Runs:** 6529 (74.2%)
- **Failed Runs:** 1966
- **Timed Out Runs:** 19
- **Ignored Runs:** 286

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 63 (passes worldgen mode per config)
- **Unexpected Passes:** 0 (expected to fail but passed)
- **Expected Failures:** 25 (doesn't pass worldgen mode per config)
- **Unexpected Failures (logic):** 0 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

### Explain Support Summary

- **Games with Explain Stats:** 86
- **Games with 100% Explain Coverage:** 76
- **Games with No Explain Support:** 0
- **Locations with Explain Support:** 11,189
- **Locations without Explain Support:** 600
- **Locations with Default Rule:** 23,254
- **Overall Explain Coverage:** 94.9%

### Generic Exporter/Logic Statistics

Of the 63 games with 100% pass rate:

- **Passing with Generic Exporter:** 38/63 (60.3%)
- **Passing with Generic Logic:** 63/63 (100.0%)
- **Passing with Both Generic:** 38/63 (60.3%)

**Combined Custom Code Size:**

- **Total Exporter Code:** 618.2KB
- **Total Game Logic Code:** 662.0KB
- **Combined Total:** 1280.2KB

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate | Exporter | GameLogic | Rules Size |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|:--------:|:---------:|:----------:|
| A Hat in Time | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 18.2KB | ✅ | 230.2KB |
| A Link to the Past | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% | 14.0KB | ✅ | 664.0KB |
| A Short Hike | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 74.4KB |
| APQuest | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 11.0KB |
| Adventure | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 25.7KB |
| Aquaria | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 1.8KB | ✅ | 277.3KB |
| Baking Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 17.9KB |
| Blasphemous | ❌ | 100 | 0 | 56 | 0 | 44 | ❌ 0.0% | ✅ | ✅ | 2760.8KB |
| *Bomb Rush Cyberfunk* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 1.4KB | 40.3KB | 325.3KB |
| Bumper Stickers | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 50.4KB |
| Castlevania - Circle of the Moon | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 4.0KB | ✅ | 93.8KB |
| Castlevania 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 137.8KB |
| *Celeste (Open World)* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | 1039.8KB |
| Celeste 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 4.1KB | ✅ | 53.6KB |
| ChecksFinder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 16.4KB |
| Choo-Choo Charles | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 281.4KB |
| Civilization VI | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 163.1KB |
| Coding Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 54.2KB |
| DLCQuest | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 1.2KB | ✅ | 49.8KB |
| *DOOM 1993* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 281.9KB |
| *DOOM II* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 327.5KB |
| Dark Souls III | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 1034.1KB |
| DepGraph | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 201.9KB |
| Donkey Kong Country 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 122.4KB |
| EarthBound | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 337.6KB |
| Factorio | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 8.8KB | ✅ | 290.1KB |
| Faxanadu | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 68.1KB |
| Final Fantasy | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 50.3KB |
| Final Fantasy Mystic Quest | ✅ | 100 | 89 | 0 | 0 | 11 | ⚠️ 89.0% | 13.9KB | ✅ | 548.1KB |
| *Heretic* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 367.6KB |
| Hollow Knight | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | 3501.1KB |
| Hylics 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 100.4KB |
| Inscryption | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 8.0KB | ✅ | 84.3KB |
| Jak and Daxter: The Precursor Legacy | ❌ | 100 | 1 | 99 | 0 | 0 | ❌ 1.0% | 21.7KB | 4.6KB | 257.9KB |
| *Journey to Ascension* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | 48.3KB |
| *Kingdom Hearts* | ❌ | 100 | 45 | 55 | 0 | 0 | ❌ 45.0% | ✅ | ✅ | 748.7KB |
| *Kingdom Hearts 2* | ❌ | 100 | 0 | 95 | 0 | 5 | ❌ 0.0% | 20.4KB | ✅ | 1630.7KB |
| *Kirby's Dream Land 3* | ❌ | 100 | 88 | 10 | 0 | 2 | ⚠️ 88.0% | 10.1KB | ✅ | 528.7KB |
| Landstalker - The Treasures of King Nole | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 3.6KB | ✅ | 209.2KB |
| *Lingo* | ❌ | 100 | 2 | 43 | 0 | 55 | ❌ 2.0% | 38.2KB | 10.7KB | 940.0KB |
| Links Awakening DX | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 7.3KB | ✅ | 703.1KB |
| Lufia II Ancient Cave | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 122.8KB |
| Mario & Luigi Superstar Saga | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 395.5KB |
| Mega Man 2 | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 51.7KB |
| Mega Man 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 71.7KB |
| MegaMan Battle Network 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 204.7KB |
| Meritous | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 57.0KB |
| Metamath | ❌ | 100 | 99 | 1 | 0 | 0 | 99.0% | ✅ | ✅ | 56.0KB |
| *Muse Dash* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 228.3KB |
| Noita | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 73.9KB |
| Ocarina of Time | ❌ | 100 | 0 | 98 | 0 | 2 | ❌ 0.0% | ✅ | ✅ | 1274.4KB |
| Old School Runescape | ✅ | 100 | 91 | 0 | 0 | 9 | 91.0% | 1.0KB | ✅ | 305.2KB |
| Overcooked! 2 | ✅ | 100 | 67 | 0 | 0 | 33 | ⚠️ 67.0% | 28.5KB | ✅ | 488.3KB |
| *Paint* | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% | 2.7KB | ✅ | 123.5KB |
| Pokemon Emerald | ❌ | 100 | 32 | 60 | 0 | 8 | ❌ 32.0% | 5.2KB | 8.7KB | 1350.2KB |
| Pokemon Red and Blue | ❌ | 100 | 0 | 89 | 0 | 11 | ❌ 0.0% | 12.2KB | 13.0KB | 1270.2KB |
| *Raft* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 6.5KB | ✅ | 198.4KB |
| Risk of Rain 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 131.4KB |
| SMZ3 | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 54.2KB | 51.3KB | 1890.6KB |
| *Satisfactory* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 41.8KB | ✅ | 1619.5KB |
| Saving Princess | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 33.6KB |
| *Secret of Evermore* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 5.6KB | 7.5KB | 415.0KB |
| Shivers | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 150.1KB |
| Sonic Adventure 2 Battle | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 262.2KB |
| *Starcraft 2* | ❌ | 100 | 0 | 99 | 1 | 0 | ❌ 0.0% | 29.3KB | 90.1KB | 1086.9KB |
| *Stardew Valley* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 20.0KB | 9.8KB | 2558.2KB |
| Subnautica | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 2.2KB | ✅ | 205.5KB |
| Super Mario 64 | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 101.2KB |
| Super Mario Land 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 96.3KB | ✅ | 919.1KB |
| Super Mario World | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | 177.7KB |
| *Super Metroid* | ❌ | 100 | 0 | 59 | 0 | 41 | ❌ 0.0% | 61.0KB | 119.4KB | 625.1KB |
| TOEM original | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 0.6KB | ✅ | 99.7KB |
| TOEM rule builder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 0.5KB | ✅ | 99.7KB |
| *TUNIC* | ❌ | 100 | 58 | 42 | 0 | 0 | ⚠️ 58.0% | 3.1KB | ✅ | 649.2KB |
| Terraria | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% | 16.9KB | ✅ | 279.0KB |
| The Legend of Zelda | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 554.6KB |
| The Messenger | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 15.2KB | ✅ | 210.4KB |
| The Wind Waker | ✅ | 100 | 54 | 0 | 0 | 46 | ⚠️ 54.0% | 7.0KB | ✅ | 250.2KB |
| *The Witness* | ❌ | 100 | 15 | 85 | 0 | 0 | ❌ 15.0% | 14.6KB | ✅ | 468.1KB |
| Timespinner | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 2.2KB | ✅ | 262.9KB |
| Undertale | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 56.3KB |
| VVVVVV | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 3.8KB | ✅ | 22.7KB |
| Wargroove | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 44.1KB |
| *Yacht Dice* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 0.9KB | 285.0KB | 248.5KB |
| Yoshi's Island | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 9.2KB | ✅ | 295.3KB |
| Yu-Gi-Oh! 2006 | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 1.3KB | 21.4KB | 644.0KB |
| Zillion | ❌ | 100 | 0 | 75 | 18 | 7 | ❌ 0.0% | ✅ | ✅ | 321.2KB |
| shapez | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | 153.8KB |

## Results Breakdown

### Expected Passes (63)

Games that pass worldgen mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | 100 | 100 | 0 | 0 | 100.0% |
| A Link to the Past | 100 | 98 | 0 | 0 | 98.0% |
| A Short Hike | 100 | 100 | 0 | 0 | 100.0% |
| APQuest | 100 | 100 | 0 | 0 | 100.0% |
| Adventure | 100 | 99 | 0 | 0 | 99.0% |
| Aquaria | 100 | 100 | 0 | 0 | 100.0% |
| Baking Adventure | 100 | 100 | 0 | 0 | 100.0% |
| Bumper Stickers | 100 | 100 | 0 | 0 | 100.0% |
| Castlevania - Circle of the Moon | 100 | 100 | 0 | 0 | 100.0% |
| Castlevania 64 | 100 | 100 | 0 | 0 | 100.0% |
| Celeste 64 | 100 | 100 | 0 | 0 | 100.0% |
| ChecksFinder | 100 | 100 | 0 | 0 | 100.0% |
| Choo-Choo Charles | 100 | 100 | 0 | 0 | 100.0% |
| Civilization VI | 100 | 100 | 0 | 0 | 100.0% |
| Coding Adventure | 100 | 100 | 0 | 0 | 100.0% |
| DLCQuest | 100 | 100 | 0 | 0 | 100.0% |
| DOOM 1993 | 100 | 99 | 0 | 0 | 99.0% |
| DOOM II | 100 | 100 | 0 | 0 | 100.0% |
| Dark Souls III | 100 | 100 | 0 | 0 | 100.0% |
| DepGraph | 100 | 100 | 0 | 0 | 100.0% |
| Donkey Kong Country 3 | 100 | 100 | 0 | 0 | 100.0% |
| EarthBound | 100 | 100 | 0 | 0 | 100.0% |
| Factorio | 100 | 100 | 0 | 0 | 100.0% |
| Faxanadu | 100 | 100 | 0 | 0 | 100.0% |
| Final Fantasy | 100 | 100 | 0 | 0 | 100.0% |
| Final Fantasy Mystic Quest | 100 | 89 | 0 | 0 | 89.0% |
| Heretic | 100 | 100 | 0 | 0 | 100.0% |
| Hylics 2 | 100 | 100 | 0 | 0 | 100.0% |
| Inscryption | 100 | 100 | 0 | 0 | 100.0% |
| Landstalker - The Treasures of King Nole | 100 | 100 | 0 | 0 | 100.0% |
| Links Awakening DX | 100 | 100 | 0 | 0 | 100.0% |
| Lufia II Ancient Cave | 100 | 100 | 0 | 0 | 100.0% |
| Mario & Luigi Superstar Saga | 100 | 100 | 0 | 0 | 100.0% |
| Mega Man 2 | 100 | 99 | 0 | 0 | 99.0% |
| Mega Man 3 | 100 | 100 | 0 | 0 | 100.0% |
| MegaMan Battle Network 3 | 100 | 100 | 0 | 0 | 100.0% |
| Meritous | 100 | 100 | 0 | 0 | 100.0% |
| Muse Dash | 100 | 99 | 0 | 0 | 99.0% |
| Noita | 100 | 100 | 0 | 0 | 100.0% |
| Old School Runescape | 100 | 91 | 0 | 0 | 91.0% |
| Overcooked! 2 | 100 | 67 | 0 | 0 | 67.0% |
| Paint | 100 | 98 | 0 | 0 | 98.0% |
| Risk of Rain 2 | 100 | 100 | 0 | 0 | 100.0% |
| Satisfactory | 100 | 100 | 0 | 0 | 100.0% |
| Saving Princess | 100 | 100 | 0 | 0 | 100.0% |
| Shivers | 100 | 100 | 0 | 0 | 100.0% |
| Sonic Adventure 2 Battle | 100 | 100 | 0 | 0 | 100.0% |
| Subnautica | 100 | 100 | 0 | 0 | 100.0% |
| Super Mario 64 | 100 | 99 | 0 | 0 | 99.0% |
| Super Mario Land 2 | 100 | 100 | 0 | 0 | 100.0% |
| Super Mario World | 100 | 99 | 0 | 0 | 99.0% |
| TOEM original | 100 | 100 | 0 | 0 | 100.0% |
| TOEM rule builder | 100 | 100 | 0 | 0 | 100.0% |
| Terraria | 100 | 98 | 0 | 0 | 98.0% |
| The Legend of Zelda | 100 | 100 | 0 | 0 | 100.0% |
| The Messenger | 100 | 100 | 0 | 0 | 100.0% |
| The Wind Waker | 100 | 54 | 0 | 0 | 54.0% |
| Timespinner | 100 | 100 | 0 | 0 | 100.0% |
| Undertale | 100 | 100 | 0 | 0 | 100.0% |
| VVVVVV | 100 | 100 | 0 | 0 | 100.0% |
| Wargroove | 100 | 100 | 0 | 0 | 100.0% |
| Yoshi's Island | 100 | 100 | 0 | 0 | 100.0% |
| shapez | 100 | 100 | 0 | 0 | 100.0% |

### Expected Failures (25)

Games NOT expected to pass worldgen mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Blasphemous | 100 | 0 | 56 | 0 | 0.0% |
| Bomb Rush Cyberfunk | 100 | 0 | 100 | 0 | 0.0% |
| Celeste (Open World) | 100 | 0 | 100 | 0 | 0.0% |
| Hollow Knight | 100 | 0 | 100 | 0 | 0.0% |
| Jak and Daxter: The Precursor Legacy | 100 | 1 | 99 | 0 | 1.0% |
| Journey to Ascension | 100 | 0 | 100 | 0 | 0.0% |
| Kingdom Hearts | 100 | 45 | 55 | 0 | 45.0% |
| Kingdom Hearts 2 | 100 | 0 | 95 | 0 | 0.0% |
| Kirby's Dream Land 3 | 100 | 88 | 10 | 0 | 88.0% |
| Lingo | 100 | 2 | 43 | 0 | 2.0% |
| Metamath | 100 | 99 | 1 | 0 | 99.0% |
| Ocarina of Time | 100 | 0 | 98 | 0 | 0.0% |
| Pokemon Emerald | 100 | 32 | 60 | 0 | 32.0% |
| Pokemon Red and Blue | 100 | 0 | 89 | 0 | 0.0% |
| Raft | 100 | 0 | 100 | 0 | 0.0% |
| SMZ3 | 100 | 0 | 100 | 0 | 0.0% |
| Secret of Evermore | 100 | 0 | 100 | 0 | 0.0% |
| Starcraft 2 | 100 | 0 | 99 | 1 | 0.0% |
| Stardew Valley | 100 | 0 | 100 | 0 | 0.0% |
| Super Metroid | 100 | 0 | 59 | 0 | 0.0% |
| TUNIC | 100 | 58 | 42 | 0 | 58.0% |
| The Witness | 100 | 15 | 85 | 0 | 15.0% |
| Yacht Dice | 100 | 0 | 100 | 0 | 0.0% |
| Yu-Gi-Oh! 2006 | 100 | 0 | 100 | 0 | 0.0% |
| Zillion | 100 | 0 | 75 | 18 | 0.0% |

## Explain Support Details

This section shows which games have rules that support the `explain_json()` method, which provides human-readable explanations of access rule logic.

| Game Name | Total Locs | With Explain | Without Explain | Default Rule | Coverage |
|-----------|:----------:|:------------:|:---------------:|:------------:|:--------:|
| Timespinner | 720 | 182 | 434 | 104 | 🔶 30% |
| Pokemon Red and Blue | 280 | 79 | 58 | 143 | ⚠️ 58% |
| Kingdom Hearts 2 | 669 | 46 | 30 | 593 | ⚠️ 61% |
| A Link to the Past | 226 | 114 | 27 | 85 | ⚠️ 81% |
| Super Mario 64 | 164 | 36 | 7 | 121 | ⚠️ 84% |
| Blasphemous | 305 | 104 | 20 | 181 | ⚠️ 84% |
| The Wind Waker | 228 | 173 | 16 | 39 | ⚠️ 92% |
| Kirby's Dream Land 3 | 832 | 118 | 5 | 709 | ⚠️ 96% |
| The Messenger | 136 | 57 | 2 | 77 | ⚠️ 97% |
| Mega Man 2 | 44 | 29 | 1 | 14 | ⚠️ 97% |
| A Hat in Time | 279 | 104 | 0 | 175 | ✅ 100% |
| A Short Hike | 131 | 82 | 0 | 49 | ✅ 100% |
| APQuest | 7 | 1 | 0 | 6 | ✅ 100% |
| Adventure | 24 | 3 | 0 | 21 | ✅ 100% |
| Aquaria | 219 | 36 | 0 | 183 | ✅ 100% |
| Baking Adventure | 15 | 8 | 0 | 7 | ✅ 100% |
| Bomb Rush Cyberfunk | 247 | 136 | 0 | 111 | ✅ 100% |
| Bumper Stickers | 100 | 38 | 0 | 62 | ✅ 100% |
| Castlevania - Circle of the Moon | 124 | 46 | 0 | 78 | ✅ 100% |
| Castlevania 64 | 339 | 0 | 0 | 339 | ✅ 100% |
| Celeste (Open World) | 1035 | 123 | 0 | 912 | ✅ 100% |
| Celeste 64 | 42 | 21 | 0 | 21 | ✅ 100% |
| ChecksFinder | 25 | 20 | 0 | 5 | ✅ 100% |
| Choo-Choo Charles | 691 | 64 | 0 | 627 | ✅ 100% |
| Civilization VI | 270 | 91 | 0 | 179 | ✅ 100% |
| Coding Adventure | 61 | 43 | 0 | 18 | ✅ 100% |
| DLCQuest | 31 | 22 | 0 | 9 | ✅ 100% |
| DOOM 1993 | 474 | 0 | 0 | 474 | ✅ 100% |
| DOOM II | 479 | 0 | 0 | 479 | ✅ 100% |
| Dark Souls III | 1469 | 228 | 0 | 1241 | ✅ 100% |
| DepGraph | 7 | 0 | 0 | 7 | ✅ 100% |
| Donkey Kong Country 3 | 219 | 0 | 0 | 219 | ✅ 100% |
| EarthBound | 250 | 38 | 0 | 212 | ✅ 100% |
| Factorio | 309 | 288 | 0 | 21 | ✅ 100% |
| Faxanadu | 110 | 25 | 0 | 85 | ✅ 100% |
| Final Fantasy | 0 | 0 | 0 | 0 | ✅ 100% |
| Final Fantasy Mystic Quest | 251 | 61 | 0 | 190 | ✅ 100% |
| Heretic | 691 | 0 | 0 | 691 | ✅ 100% |
| Hollow Knight | 731 | 731 | 0 | 0 | ✅ 100% |
| Hylics 2 | 166 | 88 | 0 | 78 | ✅ 100% |
| Inscryption | 100 | 65 | 0 | 35 | ✅ 100% |
| Jak and Daxter: The Precursor Legacy | 439 | 309 | 0 | 130 | ✅ 100% |
| Kingdom Hearts | 523 | 464 | 0 | 59 | ✅ 100% |
| Landstalker - The Treasures of King Nole | 291 | 1 | 0 | 290 | ✅ 100% |
| Lingo | 800 | 800 | 0 | 0 | ✅ 100% |
| Links Awakening DX | 220 | 0 | 0 | 220 | ✅ 100% |
| Lufia II Ancient Cave | 77 | 72 | 0 | 5 | ✅ 100% |
| Mario & Luigi Superstar Saga | 598 | 372 | 0 | 226 | ✅ 100% |
| Mega Man 3 | 64 | 22 | 0 | 42 | ✅ 100% |
| MegaMan Battle Network 3 | 263 | 80 | 0 | 183 | ✅ 100% |
| Meritous | 104 | 0 | 0 | 104 | ✅ 100% |
| Metamath | 5 | 0 | 0 | 5 | ✅ 100% |
| Muse Dash | 704 | 704 | 0 | 0 | ✅ 100% |
| Noita | 376 | 0 | 0 | 376 | ✅ 100% |
| Ocarina of Time | 434 | 58 | 0 | 376 | ✅ 100% |
| Old School Runescape | 76 | 67 | 0 | 9 | ✅ 100% |
| Overcooked! 2 | 43 | 9 | 0 | 34 | ✅ 100% |
| Paint | 89 | 89 | 0 | 0 | ✅ 100% |
| Pokemon Emerald | 846 | 191 | 0 | 655 | ✅ 100% |
| Raft | 154 | 141 | 0 | 13 | ✅ 100% |
| Risk of Rain 2 | 204 | 180 | 0 | 24 | ✅ 100% |
| SMZ3 | 316 | 316 | 0 | 0 | ✅ 100% |
| Satisfactory | 549 | 104 | 0 | 445 | ✅ 100% |
| Saving Princess | 36 | 16 | 0 | 20 | ✅ 100% |
| Secret of Evermore | 913 | 724 | 0 | 189 | ✅ 100% |
| Shivers | 76 | 22 | 0 | 54 | ✅ 100% |
| Sonic Adventure 2 Battle | 1046 | 227 | 0 | 819 | ✅ 100% |
| Stardew Valley | 988 | 849 | 0 | 139 | ✅ 100% |
| Subnautica | 136 | 136 | 0 | 0 | ✅ 100% |
| Super Mario Land 2 | 53 | 29 | 0 | 24 | ✅ 100% |
| Super Mario World | 743 | 396 | 0 | 347 | ✅ 100% |
| Super Metroid | 91 | 91 | 0 | 0 | ✅ 100% |
| TOEM original | 156 | 4 | 0 | 152 | ✅ 100% |
| TOEM rule builder | 191 | 4 | 0 | 187 | ✅ 100% |
| TUNIC | 6804 | 528 | 0 | 6276 | ✅ 100% |
| Terraria | 128 | 92 | 0 | 36 | ✅ 100% |
| The Legend of Zelda | 155 | 151 | 0 | 4 | ✅ 100% |
| The Witness | 295 | 156 | 0 | 139 | ✅ 100% |
| Undertale | 45 | 34 | 0 | 11 | ✅ 100% |
| VVVVVV | 20 | 2 | 0 | 18 | ✅ 100% |
| Wargroove | 38 | 28 | 0 | 10 | ✅ 100% |
| Yacht Dice | 65 | 65 | 0 | 0 | ✅ 100% |
| Yoshi's Island | 221 | 121 | 0 | 100 | ✅ 100% |
| Yu-Gi-Oh! 2006 | 151 | 63 | 0 | 88 | ✅ 100% |
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
| DOOM 1993.yaml | Temporarily excluded. Helper references original module data (Maps.map_names, self.all_boss_levels, self.included_episodes, Locations.location_table) causing NameError. |
| DOOM II.yaml | Temporarily excluded. Same pattern as DOOM 1993 — helper references original module data (Maps.map_names) causing NameError. |
| Heretic.yaml | Temporarily excluded. Same pattern as DOOM 1993 — helper references original module data (Maps.map_names) causing NameError. |
| JSON Tools Installer.yaml | Not a game. |
| Journey to Ascension.yaml | JtA is not compatible with WorldGen. |
| Kingdom Hearts 2.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Kingdom Hearts.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Kirby's Dream Land 3.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Lingo.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Muse Dash.yaml | Temporarily excluded. Block-bodied helper inlined into expression context causes SyntaxError. |
| Paint.yaml | Temporarily excluded. Helper paint_percent_available not in JSON helpers dict causing NameError (calculate_paint_percent_available is present but referenced under wrong name). |
| Raft.yaml | Temporarily excluded. The WorldGen spoiler test times out at 300 seconds. |
| Satisfactory.yaml | Temporarily excluded. Calls self.state_logic.can_produce_all() which resolves to state.has_all() but is not exported, causing AttributeError. |
| Secret of Evermore.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Starcraft 2.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Stardew Valley.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| Super Metroid.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| TUNIC.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
| The Witness.yaml | Temporarily excluded. The WorldGen spoiler test takes 261 seconds. |
| Universal Tracker.yaml | Not a game. |
| Yacht Dice.yaml | Temporarily excluded. Supporting this game through WorldGen might not be possible. |
