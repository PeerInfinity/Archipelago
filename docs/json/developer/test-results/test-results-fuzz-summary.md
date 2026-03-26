# Fuzz Test Results Summary

**Generated:** 2026-03-24 19:12:10 UTC

**Source Data Created:** 2026-03-24T03:35:37.045542+00:00

**Source Data Last Updated:** 2026-03-24T03:35:37.045574+00:00

[<- Back to Main Test Results Summary](./test-results-summary.md)

[View APWorlds Fuzz Results](./test-results-fuzz-summary-apworlds.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

This summary combines results from fuzz tests that validate game configurations across randomized option combinations:

- **Javascript:** Frontend spoiler playthrough fuzz tests - [View Details](./test-results-spoiler-fuzz.md)
- **UT Fuzz Original:** Universal Tracker (original) fuzz tests - [View Details](./test-results-ut-fuzz-original.md)
- **UT Fuzz Orig Seeded:** Universal Tracker (original with seed) fuzz tests - [View Details](./test-results-ut-fuzz-original_seeded.md)
- **UT Fuzz Worldgen:** Universal Tracker (worldgen-based) fuzz tests - [View Details](./test-results-ut-fuzz-worldgen.md)
- **UT Fuzz Pickle:** Universal Tracker (pickle) fuzz tests - [View Details](./test-results-ut-fuzz-pickle.md)
- **UT Fuzz Hybrid:** Universal Tracker (hybrid) fuzz tests - [View Details](./test-results-ut-fuzz-hybrid.md)

## Summary Statistics

### Individual Test Results

- **Javascript:** 61/75 passed (81.3%)
- **UT Fuzz Original:** 37/88 passed (42.0%)
- **UT Fuzz Orig Seeded:** 44/88 passed (50.0%)
- **UT Fuzz Worldgen:** 63/88 passed (71.6%)
- **UT Fuzz Pickle:** 74/88 passed (84.1%)
- **UT Fuzz Hybrid:** 78/88 passed (88.6%)

### Combined Results (All 6 Tests)

- **Games passing all 6 fuzz tests:** 28/88 (31.8%)
- **Games passing 5 fuzz tests:** 9/88 (10.2%)
- **Games passing 4 fuzz tests:** 27/88 (30.7%)
- **Games passing 3 fuzz tests:** 7/88 (8.0%)
- **Games passing 2 fuzz tests:** 7/88 (8.0%)
- **Games passing 1 fuzz test:** 1/88 (1.1%)
- **Games passing 0 fuzz tests:** 9/88 (10.2%)

### Combined Results (Excluding UT Original/Orig Seeded)

This view excludes UT Original and UT Orig Seeded, showing results for Javascript, UT Worldgen, UT Pickle, and UT Hybrid.

- **Games passing all 4 fuzz tests:** 55/88 (62.5%)
- **Games passing 3 fuzz tests:** 9/88 (10.2%)
- **Games passing 2 fuzz tests:** 14/88 (15.9%)
- **Games passing 1 fuzz test:** 1/88 (1.1%)
- **Games passing 0 fuzz tests:** 9/88 (10.2%)

## Test Results

| Game Name | [Javascript](./test-results-spoiler-fuzz.md) | [UT Original](./test-results-ut-fuzz-original.md) | [UT Orig Seeded](./test-results-ut-fuzz-original_seeded.md) | [UT Worldgen](./test-results-ut-fuzz-worldgen.md) | [UT Pickle](./test-results-ut-fuzz-pickle.md) | [UT Hybrid](./test-results-ut-fuzz-hybrid.md) | Rules Size |
|-----------|:----------:|:------------:|:--------------:|:------------:|:----------:|:----------:|:----------:|
| A Hat in Time | ✅ | ❌ 15/100 | ❌ 15/100 | ✅ | ✅ | ✅ | 230.2KB |
| A Link to the Past | ✅ | ❌ | ❌ 3/98 | ✅ | ✅ | ✅ | 664.0KB |
| A Short Hike | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 74.4KB |
| APQuest | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 11.0KB |
| Adventure | ✅ | 🔶 89/100 | 🔶 86/99 | ✅ | ✅ | ✅ | 25.7KB |
| Aquaria | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 277.3KB |
| Baking Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 17.9KB |
| Blasphemous | — | ✅ | ✅ | ❌ | ✅ | ✅ | 2760.8KB |
| Bomb Rush Cyberfunk | 🔶 8/10 | ✅ | ✅ | ❌ | ✅ | ✅ | 325.3KB |
| Bumper Stickers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 50.4KB |
| Castlevania - Circle of the Moon | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 93.8KB |
| Castlevania 64 | ✅ | ❌ 10/100 | ❌ 9/100 | ✅ | ✅ | ✅ | 137.8KB |
| Celeste (Open World) | ⚠️ 9/10 | ❌ 46/100 | ✅ | ❌ | ✅ | ✅ | 1039.8KB |
| Celeste 64 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 53.6KB |
| ChecksFinder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 16.4KB |
| Choo-Choo Charles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 281.4KB |
| Civilization VI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 163.1KB |
| Coding Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 54.2KB |
| DLCQuest | ✅ | ⚠️ 92/100 | ✅ | ✅ | ✅ | ✅ | 49.8KB |
| DOOM 1993 | ✅ | ⚠️ 99/100 | ✅ | ✅ | ✅ | ✅ | 281.9KB |
| DOOM II | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 327.5KB |
| Dark Souls III | — | ✅ | ✅ | ✅ | ✅ | ✅ | 1034.1KB |
| DepGraph | ✅ | 🔶 82/100 | 🔶 81/100 | ✅ | ✅ | ✅ | 201.9KB |
| Donkey Kong Country 3 | ✅ | 🔶 52/100 | 🔶 52/100 | ✅ | ✅ | ✅ | 122.4KB |
| EarthBound | ✅ | ❌ 30/100 | ❌ 30/100 | ✅ | ✅ | ✅ | 337.6KB |
| Factorio | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | 290.1KB |
| Faxanadu | ✅ | ❌ 16/100 | ❌ 20/100 | ✅ | ✅ | ✅ | 68.1KB |
| Final Fantasy | — | ✅ | ✅ | ✅ | ✅ | ✅ | 50.3KB |
| Final Fantasy Mystic Quest | ✅ | 🔶 89/100 | ✅ | ✅ | ✅ | ✅ | 548.1KB |
| Heretic | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 367.6KB |
| Hollow Knight | — | ❌ 9/100 | ❌ 8/100 | ❌ | ✅ | ✅ | 3501.1KB |
| Hylics 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 100.4KB |
| Inscryption | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 84.3KB |
| Jak and Daxter: The Precursor Legacy | — | 🔶 62/100 | ✅ | ❌ 1/100 | ✅ | ✅ | 257.9KB |
| Journey to Ascension | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 48.3KB |
| Kingdom Hearts | 🔶 8/10 | ❌ 19/99 | ❌ 19/100 | ❌ 45/100 | ⚠️ 99/99 | ❌ 20/100 | 748.7KB |
| Kingdom Hearts 2 | ❌ 3/7 | ❌ 44/100 | ❌ 44/95 | ❌ | ❌ 44/95 | ❌ 43/95 | 1630.7KB |
| Kirby's Dream Land 3 | ❌ 3/10 | ❌ | ❌ | 🔶 88/98 | ✅ | ✅ | 528.7KB |
| Landstalker - The Treasures of King Nole | ✅ | ❌ 31/100 | ❌ 30/100 | ✅ | ✅ | ✅ | 209.2KB |
| Lingo | 🔶 2/3 | ❌ 20/45 | ❌ 19/45 | ❌ 2/45 | ✅ | ✅ | 940.0KB |
| Links Awakening DX | ✅ | ❌ 23/100 | ❌ 23/100 | ✅ | ❌ 23/100 | ✅ | 703.1KB |
| Lufia II Ancient Cave | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 122.8KB |
| Mario & Luigi Superstar Saga | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 395.5KB |
| Mega Man 2 | ✅ | ⚠️ 93/100 | ⚠️ 93/99 | ✅ | ✅ | ✅ | 51.7KB |
| Mega Man 3 | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | 71.7KB |
| MegaMan Battle Network 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 204.7KB |
| Meritous | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 57.0KB |
| Metamath | ✅ | ⚠️ 90/100 | ⚠️ 90/100 | ⚠️ 99/100 | ⚠️ 99/100 | 🔶 84/100 | 56.0KB |
| Muse Dash | ✅ | ❌ | ❌ 25/99 | ✅ | ✅ | ✅ | 228.3KB |
| Noita | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 73.9KB |
| Ocarina of Time | — | ❌ | ❌ 1/98 | ❌ | ⚠️ 96/98 | ❌ | 1274.4KB |
| Old School Runescape | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 305.2KB |
| Overcooked! 2 | ✅ | ❌ 9/100 | ❌ 33/67 | ✅ | ✅ | ✅ | 488.3KB |
| Paint | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 123.5KB |
| Pokemon Emerald | — | 🔶 55/92 | 🔶 56/92 | ❌ 32/92 | ⚠️ 86/92 | 🔶 55/92 | 1350.2KB |
| Pokemon Red and Blue | — | ❌ | ❌ | ❌ | ✅ | ✅ | 1270.2KB |
| Raft | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | 198.4KB |
| Risk of Rain 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 131.4KB |
| SMZ3 | — | ❌ 1/100 | ❌ 1/100 | ❌ | ✅ | ✅ | 1890.6KB |
| Satisfactory | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | 1619.5KB |
| Saving Princess | ✅ | ❌ 24/100 | ✅ | ✅ | ✅ | ✅ | 33.6KB |
| Secret of Evermore | 🔶 5/10 | ✅ | ✅ | ❌ | ✅ | ✅ | 415.0KB |
| Shivers | ✅ | ❌ | ❌ | ✅ | ⚠️ 99/99 | ✅ | 150.1KB |
| Sonic Adventure 2 Battle | ⚠️ 9/10 | ❌ 6/100 | ❌ 13/100 | ✅ | ✅ | ✅ | 262.2KB |
| Starcraft 2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 1086.9KB |
| Stardew Valley | — | ❌ 6/99 | ❌ 24/98 | ❌ | ❌ 14/100 | ❌ 25/100 | 2558.2KB |
| Subnautica | ✅ | ❌ 13/100 | ❌ 12/100 | ✅ | ✅ | ✅ | 205.5KB |
| Super Mario 64 | ✅ | ❌ 28/100 | ❌ 28/99 | ✅ | ✅ | ✅ | 101.2KB |
| Super Mario Land 2 | ✅ | ❌ 20/100 | ❌ 28/100 | ✅ | ✅ | ✅ | 919.1KB |
| Super Mario World | ✅ | 🔶 55/100 | 🔶 55/99 | ✅ | ✅ | ✅ | 177.7KB |
| Super Metroid | ❌ | ❌ 6/100 | ❌ 5/58 | ❌ | 🔶 51/59 | ❌ 5/59 | 625.1KB |
| TOEM original | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 99.7KB |
| TOEM rule builder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 99.7KB |
| TUNIC | ❌ 2/10 | ✅ | ✅ | 🔶 58/100 | ✅ | ✅ | 649.2KB |
| Terraria | ✅ | ⚠️ 98/100 | ✅ | ✅ | ✅ | ✅ | 279.0KB |
| The Legend of Zelda | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 554.6KB |
| The Messenger | ✅ | ❌ 7/100 | ❌ 10/100 | ✅ | 🔶 81/100 | ✅ | 210.4KB |
| The Wind Waker | ✅ | ❌ 4/57 | ❌ 5/54 | ✅ | ✅ | ✅ | 250.2KB |
| The Witness | ❌ 2/10 | ✅ | ✅ | ❌ 15/100 | ✅ | ✅ | 468.1KB |
| Timespinner | ✅ | ❌ 4/100 | ❌ 4/100 | ✅ | ✅ | ✅ | 262.9KB |
| Undertale | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 56.3KB |
| VVVVVV | ✅ | 🔶 64/100 | 🔶 62/100 | ✅ | ✅ | ✅ | 22.7KB |
| Wargroove | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 44.1KB |
| Yacht Dice | — | ❌ 1/100 | ❌ | ❌ | ✅ | ✅ | 248.5KB |
| Yoshi's Island | ✅ | ❌ 22/100 | ❌ 22/100 | ✅ | ✅ | ✅ | 295.3KB |
| Yu-Gi-Oh! 2006 | — | ❌ 34/100 | ❌ 34/100 | ❌ | ✅ | ✅ | 644.0KB |
| Zillion | — | ❌ | ❌ | ❌ | ⚠️ 75/75 | ❌ | 321.2KB |
| shapez | 🔶 8/10 | ✅ | ✅ | ✅ | ✅ | ✅ | 153.8KB |

## Notes

- **✅:** All fuzz runs passed
- **⚠️ X/Y:** Most runs passed (90-99%, shown as passes/total)
- **🔶 X/Y:** Some runs passed (50-89%, shown as passes/total)
- **❌ X/Y:** Most runs failed (<50%, shown as passes/total)
- **❌:** No runs passed
- **—:** No test results available for this game
- **Rules Size:** File size of rules.json for seed 1

### About Fuzz Tests

Fuzz tests validate game configurations by generating random YAML option combinations and running various tests:

- **Javascript:** Tests frontend spoiler playthrough with randomized configurations
- **UT Fuzz:** Tests Universal Tracker's accessibility calculations against Python's sphere log
  - **Original:** Uses native game integration (random internal seed)
  - **Orig Seeded:** Uses native game integration with the actual generation seed number
  - **Worldgen:** Uses worldgen-based tracking (regenerates from JSON rules)
  - **Pickle:** Uses pickle-based tracking (loads serialized multiworld)
  - **Hybrid:** Prefers native integration, falls back to worldgen
