# Universal Tracker Fuzz Test Results (Original UT)

[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-03-22 17:48:53 UTC

**Source Data Created:** 2026-03-22T05:22:37.374705+00:00

**Source Data Last Updated:** 2026-03-22T05:22:37.374717+00:00

**Universal Tracker Version:** Original (FarisTheAncient)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 100

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 88
- **Games with 100% Pass Rate:** 37 (42.0%)
- **Games with Failures:** 51 (58.0%)
- **Total Fuzz Runs:** 8800
- **Successful Runs:** 5119 (58.2%)
- **Failed Runs:** 3502
- **Timed Out Runs:** 15
- **Ignored Runs:** 164

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 37 (passes original mode per config)
- **Unexpected Passes:** 0 (expected to fail but passed)
- **Expected Failures:** 51 (doesn't pass original mode per config)
- **Unexpected Failures (logic):** 0 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | ❌ | 100 | 15 | 85 | 0 | 0 | ❌ 15.0% |
| A Link to the Past | ❌ | 100 | 0 | 98 | 0 | 2 | ❌ 0.0% |
| A Short Hike | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| APQuest | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Adventure | ❌ | 100 | 86 | 14 | 0 | 0 | ⚠️ 86.0% |
| Aquaria | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Baking Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Blasphemous | ✅ | 100 | 56 | 0 | 0 | 44 | ⚠️ 56.0% |
| *Bomb Rush Cyberfunk* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Bumper Stickers | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Castlevania - Circle of the Moon | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Castlevania 64 | ❌ | 100 | 6 | 94 | 0 | 0 | ❌ 6.0% |
| *Celeste (Open World)* | ❌ | 100 | 46 | 54 | 0 | 0 | ❌ 46.0% |
| Celeste 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| ChecksFinder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Choo-Choo Charles | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Civilization VI | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Coding Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| DLCQuest | ❌ | 100 | 92 | 8 | 0 | 0 | 92.0% |
| *DOOM 1993* | ❌ | 100 | 99 | 1 | 0 | 0 | 99.0% |
| *DOOM II* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Dark Souls III | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| DepGraph | ❌ | 100 | 81 | 19 | 0 | 0 | ⚠️ 81.0% |
| Donkey Kong Country 3 | ❌ | 100 | 52 | 48 | 0 | 0 | ⚠️ 52.0% |
| EarthBound | ❌ | 100 | 29 | 71 | 0 | 0 | ❌ 29.0% |
| Factorio | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Faxanadu | ❌ | 100 | 17 | 83 | 0 | 0 | ❌ 17.0% |
| Final Fantasy | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Final Fantasy Mystic Quest | ❌ | 100 | 89 | 11 | 0 | 0 | ⚠️ 89.0% |
| *Heretic* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Hollow Knight | ❌ | 100 | 9 | 91 | 0 | 0 | ❌ 9.0% |
| Hylics 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Inscryption | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Jak and Daxter: The Precursor Legacy | ❌ | 100 | 62 | 38 | 0 | 0 | ⚠️ 62.0% |
| *Journey to Ascension* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| *Kingdom Hearts* | ❌ | 100 | 18 | 82 | 0 | 0 | ❌ 18.0% |
| *Kingdom Hearts 2* | ❌ | 100 | 44 | 56 | 0 | 0 | ❌ 44.0% |
| *Kirby's Dream Land 3* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Landstalker - The Treasures of King Nole | ❌ | 100 | 31 | 69 | 0 | 0 | ❌ 31.0% |
| *Lingo* | ❌ | 100 | 19 | 26 | 0 | 55 | ❌ 19.0% |
| Links Awakening DX | ❌ | 100 | 23 | 77 | 0 | 0 | ❌ 23.0% |
| Lufia II Ancient Cave | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Mario & Luigi Superstar Saga | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Mega Man 2 | ❌ | 100 | 95 | 5 | 0 | 0 | 95.0% |
| Mega Man 3 | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| MegaMan Battle Network 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Meritous | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Metamath | ❌ | 100 | 89 | 11 | 0 | 0 | ⚠️ 89.0% |
| *Muse Dash* | ❌ | 100 | 0 | 99 | 0 | 1 | ❌ 0.0% |
| Noita | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Ocarina of Time | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Old School Runescape | ✅ | 100 | 91 | 0 | 0 | 9 | 91.0% |
| Overcooked! 2 | ❌ | 100 | 9 | 91 | 0 | 0 | ❌ 9.0% |
| *Paint* | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% |
| Pokemon Emerald | ❌ | 100 | 56 | 36 | 0 | 8 | ⚠️ 56.0% |
| Pokemon Red and Blue | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| *Raft* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Risk of Rain 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| SMZ3 | ❌ | 100 | 1 | 99 | 0 | 0 | ❌ 1.0% |
| *Satisfactory* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Saving Princess | ❌ | 100 | 24 | 76 | 0 | 0 | ❌ 24.0% |
| *Secret of Evermore* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Shivers | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Sonic Adventure 2 Battle | ❌ | 100 | 6 | 94 | 0 | 0 | ❌ 6.0% |
| *Starcraft 2* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| *Stardew Valley* | ❌ | 100 | 10 | 90 | 0 | 0 | ❌ 10.0% |
| Subnautica | ❌ | 100 | 12 | 88 | 0 | 0 | ❌ 12.0% |
| Super Mario 64 | ❌ | 100 | 28 | 72 | 0 | 0 | ❌ 28.0% |
| Super Mario Land 2 | ❌ | 100 | 24 | 76 | 0 | 0 | ❌ 24.0% |
| Super Mario World | ❌ | 100 | 55 | 45 | 0 | 0 | ⚠️ 55.0% |
| *Super Metroid* | ❌ | 100 | 6 | 93 | 1 | 0 | ❌ 6.0% |
| TOEM original | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| TOEM rule builder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *TUNIC* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Terraria | ❌ | 100 | 98 | 2 | 0 | 0 | 98.0% |
| The Legend of Zelda | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| The Messenger | ❌ | 100 | 9 | 91 | 0 | 0 | ❌ 9.0% |
| The Wind Waker | ❌ | 100 | 4 | 53 | 0 | 43 | ❌ 4.0% |
| *The Witness* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Timespinner | ❌ | 100 | 6 | 94 | 0 | 0 | ❌ 6.0% |
| Undertale | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| VVVVVV | ❌ | 100 | 64 | 36 | 0 | 0 | ⚠️ 64.0% |
| Wargroove | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Yacht Dice* | ❌ | 100 | 1 | 99 | 0 | 0 | ❌ 1.0% |
| Yoshi's Island | ❌ | 100 | 25 | 75 | 0 | 0 | ❌ 25.0% |
| Yu-Gi-Oh! 2006 | ❌ | 100 | 34 | 66 | 0 | 0 | ❌ 34.0% |
| Zillion | ❌ | 100 | 0 | 86 | 14 | 0 | ❌ 0.0% |
| shapez | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |

## Results Breakdown

### Expected Passes (37)

Games that pass original mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Short Hike | 100 | 100 | 0 | 0 | 100.0% |
| APQuest | 100 | 100 | 0 | 0 | 100.0% |
| Aquaria | 100 | 100 | 0 | 0 | 100.0% |
| Baking Adventure | 100 | 100 | 0 | 0 | 100.0% |
| Blasphemous | 100 | 56 | 0 | 0 | 56.0% |
| Bomb Rush Cyberfunk | 100 | 100 | 0 | 0 | 100.0% |
| Bumper Stickers | 100 | 100 | 0 | 0 | 100.0% |
| Castlevania - Circle of the Moon | 100 | 100 | 0 | 0 | 100.0% |
| Celeste 64 | 100 | 100 | 0 | 0 | 100.0% |
| ChecksFinder | 100 | 100 | 0 | 0 | 100.0% |
| Choo-Choo Charles | 100 | 100 | 0 | 0 | 100.0% |
| Civilization VI | 100 | 100 | 0 | 0 | 100.0% |
| Coding Adventure | 100 | 100 | 0 | 0 | 100.0% |
| DOOM II | 100 | 100 | 0 | 0 | 100.0% |
| Dark Souls III | 100 | 100 | 0 | 0 | 100.0% |
| Final Fantasy | 100 | 100 | 0 | 0 | 100.0% |
| Heretic | 100 | 100 | 0 | 0 | 100.0% |
| Hylics 2 | 100 | 100 | 0 | 0 | 100.0% |
| Inscryption | 100 | 100 | 0 | 0 | 100.0% |
| Lufia II Ancient Cave | 100 | 100 | 0 | 0 | 100.0% |
| Mario & Luigi Superstar Saga | 100 | 100 | 0 | 0 | 100.0% |
| MegaMan Battle Network 3 | 100 | 100 | 0 | 0 | 100.0% |
| Meritous | 100 | 100 | 0 | 0 | 100.0% |
| Noita | 100 | 100 | 0 | 0 | 100.0% |
| Old School Runescape | 100 | 91 | 0 | 0 | 91.0% |
| Paint | 100 | 98 | 0 | 0 | 98.0% |
| Raft | 100 | 100 | 0 | 0 | 100.0% |
| Risk of Rain 2 | 100 | 100 | 0 | 0 | 100.0% |
| Secret of Evermore | 100 | 100 | 0 | 0 | 100.0% |
| TOEM original | 100 | 100 | 0 | 0 | 100.0% |
| TOEM rule builder | 100 | 100 | 0 | 0 | 100.0% |
| TUNIC | 100 | 100 | 0 | 0 | 100.0% |
| The Legend of Zelda | 100 | 100 | 0 | 0 | 100.0% |
| The Witness | 100 | 100 | 0 | 0 | 100.0% |
| Undertale | 100 | 100 | 0 | 0 | 100.0% |
| Wargroove | 100 | 100 | 0 | 0 | 100.0% |
| shapez | 100 | 100 | 0 | 0 | 100.0% |

### Expected Failures (51)

Games NOT expected to pass original mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | 100 | 15 | 85 | 0 | 15.0% |
| A Link to the Past | 100 | 0 | 98 | 0 | 0.0% |
| Adventure | 100 | 86 | 14 | 0 | 86.0% |
| Castlevania 64 | 100 | 6 | 94 | 0 | 6.0% |
| Celeste (Open World) | 100 | 46 | 54 | 0 | 46.0% |
| DLCQuest | 100 | 92 | 8 | 0 | 92.0% |
| DOOM 1993 | 100 | 99 | 1 | 0 | 99.0% |
| DepGraph | 100 | 81 | 19 | 0 | 81.0% |
| Donkey Kong Country 3 | 100 | 52 | 48 | 0 | 52.0% |
| EarthBound | 100 | 29 | 71 | 0 | 29.0% |
| Factorio | 100 | 0 | 100 | 0 | 0.0% |
| Faxanadu | 100 | 17 | 83 | 0 | 17.0% |
| Final Fantasy Mystic Quest | 100 | 89 | 11 | 0 | 89.0% |
| Hollow Knight | 100 | 9 | 91 | 0 | 9.0% |
| Jak and Daxter: The Precursor Legacy | 100 | 62 | 38 | 0 | 62.0% |
| Journey to Ascension | 100 | 0 | 100 | 0 | 0.0% |
| Kingdom Hearts | 100 | 18 | 82 | 0 | 18.0% |
| Kingdom Hearts 2 | 100 | 44 | 56 | 0 | 44.0% |
| Kirby's Dream Land 3 | 100 | 0 | 100 | 0 | 0.0% |
| Landstalker - The Treasures of King Nole | 100 | 31 | 69 | 0 | 31.0% |
| Lingo | 100 | 19 | 26 | 0 | 19.0% |
| Links Awakening DX | 100 | 23 | 77 | 0 | 23.0% |
| Mega Man 2 | 100 | 95 | 5 | 0 | 95.0% |
| Mega Man 3 | 100 | 0 | 100 | 0 | 0.0% |
| Metamath | 100 | 89 | 11 | 0 | 89.0% |
| Muse Dash | 100 | 0 | 99 | 0 | 0.0% |
| Ocarina of Time | 100 | 0 | 100 | 0 | 0.0% |
| Overcooked! 2 | 100 | 9 | 91 | 0 | 9.0% |
| Pokemon Emerald | 100 | 56 | 36 | 0 | 56.0% |
| Pokemon Red and Blue | 100 | 0 | 100 | 0 | 0.0% |
| SMZ3 | 100 | 1 | 99 | 0 | 1.0% |
| Satisfactory | 100 | 0 | 100 | 0 | 0.0% |
| Saving Princess | 100 | 24 | 76 | 0 | 24.0% |
| Shivers | 100 | 0 | 100 | 0 | 0.0% |
| Sonic Adventure 2 Battle | 100 | 6 | 94 | 0 | 6.0% |
| Starcraft 2 | 100 | 0 | 100 | 0 | 0.0% |
| Stardew Valley | 100 | 10 | 90 | 0 | 10.0% |
| Subnautica | 100 | 12 | 88 | 0 | 12.0% |
| Super Mario 64 | 100 | 28 | 72 | 0 | 28.0% |
| Super Mario Land 2 | 100 | 24 | 76 | 0 | 24.0% |
| Super Mario World | 100 | 55 | 45 | 0 | 55.0% |
| Super Metroid | 100 | 6 | 93 | 1 | 6.0% |
| Terraria | 100 | 98 | 2 | 0 | 98.0% |
| The Messenger | 100 | 9 | 91 | 0 | 9.0% |
| The Wind Waker | 100 | 4 | 53 | 0 | 4.0% |
| Timespinner | 100 | 6 | 94 | 0 | 6.0% |
| VVVVVV | 100 | 64 | 36 | 0 | 64.0% |
| Yacht Dice | 100 | 1 | 99 | 0 | 1.0% |
| Yoshi's Island | 100 | 25 | 75 | 0 | 25.0% |
| Yu-Gi-Oh! 2006 | 100 | 34 | 66 | 0 | 34.0% |
| Zillion | 100 | 0 | 86 | 14 | 0.0% |

## Notes

- *Italic game names* are in the exclude list for this test type
- **Result:** ✅ if all fuzz runs passed (0 failures, 0 timeouts), ❌ otherwise
- **Total:** Number of fuzz runs attempted for this game
- **Success:** Number of runs where UT matched Python sphere log
- **Failure:** Number of runs where UT mismatched or encountered errors
- **Timeout:** Number of runs that exceeded the time limit
- **Ignored:** Number of runs skipped due to option errors
- **Success Rate:** Percentage of successful runs

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
