# Universal Tracker Fuzz Test Results (Pickle)

[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-03-24 19:12:10 UTC

**Source Data Created:** 2026-03-24T03:34:39.043481+00:00

**Source Data Last Updated:** 2026-03-24T03:34:39.043491+00:00

**Universal Tracker Version:** Pickle (loads serialized multiworld)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 100

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 88
- **Games with 100% Pass Rate:** 74 (84.1%)
- **Games with Failures:** 14 (15.9%)
- **Total Fuzz Runs:** 8800
- **Successful Runs:** 7944 (90.3%)
- **Failed Runs:** 549
- **Timed Out Runs:** 20
- **Ignored Runs:** 287

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 74 (passes pickle mode per config)
- **Unexpected Passes:** 0 (expected to fail but passed)
- **Expected Failures:** 14 (doesn't pass pickle mode per config)
- **Unexpected Failures (logic):** 0 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| A Link to the Past | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% |
| A Short Hike | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| APQuest | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Adventure | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| Aquaria | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Baking Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Blasphemous | ✅ | 100 | 56 | 0 | 0 | 44 | ⚠️ 56.0% |
| *Bomb Rush Cyberfunk* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Bumper Stickers | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Castlevania - Circle of the Moon | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Castlevania 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Celeste (Open World)* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Celeste 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| ChecksFinder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Choo-Choo Charles | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Civilization VI | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Coding Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| DLCQuest | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *DOOM 1993* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| *DOOM II* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Dark Souls III | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| DepGraph | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Donkey Kong Country 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| EarthBound | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Factorio | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Faxanadu | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Final Fantasy | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Final Fantasy Mystic Quest | ✅ | 100 | 89 | 0 | 0 | 11 | ⚠️ 89.0% |
| *Heretic* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Hollow Knight | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Hylics 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Inscryption | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Jak and Daxter: The Precursor Legacy | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Journey to Ascension* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| *Kingdom Hearts* | ❌ | 100 | 99 | 0 | 1 | 0 | 99.0% |
| *Kingdom Hearts 2* | ❌ | 100 | 44 | 51 | 0 | 5 | ❌ 44.0% |
| *Kirby's Dream Land 3* | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% |
| Landstalker - The Treasures of King Nole | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Lingo* | ✅ | 100 | 45 | 0 | 0 | 55 | ❌ 45.0% |
| Links Awakening DX | ❌ | 100 | 23 | 77 | 0 | 0 | ❌ 23.0% |
| Lufia II Ancient Cave | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Mario & Luigi Superstar Saga | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Mega Man 2 | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| Mega Man 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| MegaMan Battle Network 3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Meritous | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Metamath | ❌ | 100 | 99 | 1 | 0 | 0 | 99.0% |
| *Muse Dash* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| Noita | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Ocarina of Time | ❌ | 100 | 96 | 2 | 0 | 2 | 96.0% |
| Old School Runescape | ✅ | 100 | 91 | 0 | 0 | 9 | 91.0% |
| Overcooked! 2 | ✅ | 100 | 67 | 0 | 0 | 33 | ⚠️ 67.0% |
| *Paint* | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% |
| Pokemon Emerald | ❌ | 100 | 86 | 6 | 0 | 8 | ⚠️ 86.0% |
| Pokemon Red and Blue | ✅ | 100 | 89 | 0 | 0 | 11 | ⚠️ 89.0% |
| *Raft* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Risk of Rain 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| SMZ3 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Satisfactory* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% |
| Saving Princess | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Secret of Evermore* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Shivers | ❌ | 100 | 99 | 0 | 1 | 0 | 99.0% |
| Sonic Adventure 2 Battle | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Starcraft 2* | ❌ | 100 | 0 | 99 | 0 | 1 | ❌ 0.0% |
| *Stardew Valley* | ❌ | 100 | 14 | 86 | 0 | 0 | ❌ 14.0% |
| Subnautica | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Super Mario 64 | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| Super Mario Land 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Super Mario World | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% |
| *Super Metroid* | ❌ | 100 | 51 | 8 | 0 | 41 | ⚠️ 51.0% |
| TOEM original | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| TOEM rule builder | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *TUNIC* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Terraria | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% |
| The Legend of Zelda | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| The Messenger | ❌ | 100 | 81 | 19 | 0 | 0 | ⚠️ 81.0% |
| The Wind Waker | ✅ | 100 | 54 | 0 | 0 | 46 | ⚠️ 54.0% |
| *The Witness* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Timespinner | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Undertale | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| VVVVVV | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Wargroove | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| *Yacht Dice* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Yoshi's Island | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Yu-Gi-Oh! 2006 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |
| Zillion | ❌ | 100 | 75 | 0 | 18 | 7 | ⚠️ 75.0% |
| shapez | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** |

## Results Breakdown

### Expected Passes (74)

Games that pass pickle mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | 100 | 100 | 0 | 0 | 100.0% |
| A Link to the Past | 100 | 98 | 0 | 0 | 98.0% |
| A Short Hike | 100 | 100 | 0 | 0 | 100.0% |
| APQuest | 100 | 100 | 0 | 0 | 100.0% |
| Adventure | 100 | 99 | 0 | 0 | 99.0% |
| Aquaria | 100 | 100 | 0 | 0 | 100.0% |
| Baking Adventure | 100 | 100 | 0 | 0 | 100.0% |
| Blasphemous | 100 | 56 | 0 | 0 | 56.0% |
| Bomb Rush Cyberfunk | 100 | 100 | 0 | 0 | 100.0% |
| Bumper Stickers | 100 | 100 | 0 | 0 | 100.0% |
| Castlevania - Circle of the Moon | 100 | 100 | 0 | 0 | 100.0% |
| Castlevania 64 | 100 | 100 | 0 | 0 | 100.0% |
| Celeste (Open World) | 100 | 100 | 0 | 0 | 100.0% |
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
| Hollow Knight | 100 | 100 | 0 | 0 | 100.0% |
| Hylics 2 | 100 | 100 | 0 | 0 | 100.0% |
| Inscryption | 100 | 100 | 0 | 0 | 100.0% |
| Jak and Daxter: The Precursor Legacy | 100 | 100 | 0 | 0 | 100.0% |
| Kirby's Dream Land 3 | 100 | 98 | 0 | 0 | 98.0% |
| Landstalker - The Treasures of King Nole | 100 | 100 | 0 | 0 | 100.0% |
| Lingo | 100 | 45 | 0 | 0 | 45.0% |
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
| Pokemon Red and Blue | 100 | 89 | 0 | 0 | 89.0% |
| Raft | 100 | 100 | 0 | 0 | 100.0% |
| Risk of Rain 2 | 100 | 100 | 0 | 0 | 100.0% |
| SMZ3 | 100 | 100 | 0 | 0 | 100.0% |
| Saving Princess | 100 | 100 | 0 | 0 | 100.0% |
| Secret of Evermore | 100 | 100 | 0 | 0 | 100.0% |
| Sonic Adventure 2 Battle | 100 | 100 | 0 | 0 | 100.0% |
| Subnautica | 100 | 100 | 0 | 0 | 100.0% |
| Super Mario 64 | 100 | 99 | 0 | 0 | 99.0% |
| Super Mario Land 2 | 100 | 100 | 0 | 0 | 100.0% |
| Super Mario World | 100 | 99 | 0 | 0 | 99.0% |
| TOEM original | 100 | 100 | 0 | 0 | 100.0% |
| TOEM rule builder | 100 | 100 | 0 | 0 | 100.0% |
| TUNIC | 100 | 100 | 0 | 0 | 100.0% |
| Terraria | 100 | 98 | 0 | 0 | 98.0% |
| The Legend of Zelda | 100 | 100 | 0 | 0 | 100.0% |
| The Wind Waker | 100 | 54 | 0 | 0 | 54.0% |
| The Witness | 100 | 100 | 0 | 0 | 100.0% |
| Timespinner | 100 | 100 | 0 | 0 | 100.0% |
| Undertale | 100 | 100 | 0 | 0 | 100.0% |
| VVVVVV | 100 | 100 | 0 | 0 | 100.0% |
| Wargroove | 100 | 100 | 0 | 0 | 100.0% |
| Yacht Dice | 100 | 100 | 0 | 0 | 100.0% |
| Yoshi's Island | 100 | 100 | 0 | 0 | 100.0% |
| Yu-Gi-Oh! 2006 | 100 | 100 | 0 | 0 | 100.0% |
| shapez | 100 | 100 | 0 | 0 | 100.0% |

### Expected Failures (14)

Games NOT expected to pass pickle mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Journey to Ascension | 100 | 0 | 100 | 0 | 0.0% |
| Kingdom Hearts | 100 | 99 | 0 | 1 | 99.0% |
| Kingdom Hearts 2 | 100 | 44 | 51 | 0 | 44.0% |
| Links Awakening DX | 100 | 23 | 77 | 0 | 23.0% |
| Metamath | 100 | 99 | 1 | 0 | 99.0% |
| Ocarina of Time | 100 | 96 | 2 | 0 | 96.0% |
| Pokemon Emerald | 100 | 86 | 6 | 0 | 86.0% |
| Satisfactory | 100 | 0 | 100 | 0 | 0.0% |
| Shivers | 100 | 99 | 0 | 1 | 99.0% |
| Starcraft 2 | 100 | 0 | 99 | 0 | 0.0% |
| Stardew Valley | 100 | 14 | 86 | 0 | 14.0% |
| Super Metroid | 100 | 51 | 8 | 0 | 51.0% |
| The Messenger | 100 | 81 | 19 | 0 | 81.0% |
| Zillion | 100 | 75 | 0 | 18 | 75.0% |

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
