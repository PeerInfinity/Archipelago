# Universal Tracker Fuzz Test Results (Original Seeded)

[<- Back to Fuzz Summary](./test-results-fuzz-summary.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-03-22 17:48:53 UTC

**Source Data Created:** 2026-03-21T23:48:22.213445+00:00

**Source Data Last Updated:** 2026-03-21T23:48:22.213455+00:00

**Universal Tracker Version:** Original Seeded (original with generation seed number)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 10

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 88
- **Games with 100% Pass Rate:** 48 (54.5%)
- **Games with Failures:** 40 (45.5%)
- **Total Fuzz Runs:** 880
- **Successful Runs:** 549 (62.4%)
- **Failed Runs:** 292
- **Timed Out Runs:** 1
- **Ignored Runs:** 38

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 0 (passes original_seeded mode per config)
- **Unexpected Passes:** 48 (expected to fail but passed)
- **Expected Failures:** 40 (doesn't pass original_seeded mode per config)
- **Unexpected Failures (logic):** 0 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| A Link to the Past | ❌ | 10 | 0 | 9 | 0 | 1 | ❌ 0.0% |
| A Short Hike | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| APQuest | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Aquaria | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Baking Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Blasphemous | ✅ | 10 | 4 | 0 | 0 | 6 | ❌ 40.0% |
| *Bomb Rush Cyberfunk* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Bumper Stickers | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Castlevania - Circle of the Moon | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Castlevania 64 | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| *Celeste (Open World)* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Celeste 64 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| ChecksFinder | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Choo-Choo Charles | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Civilization VI | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Coding Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| DLCQuest | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *DOOM 1993* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *DOOM II* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Dark Souls III | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| DepGraph | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Donkey Kong Country 3 | ❌ | 10 | 7 | 3 | 0 | 0 | ⚠️ 70.0% |
| EarthBound | ❌ | 10 | 5 | 5 | 0 | 0 | ⚠️ 50.0% |
| Factorio | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Faxanadu | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| Final Fantasy | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Final Fantasy Mystic Quest | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% |
| *Heretic* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Hollow Knight | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Hylics 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Inscryption | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Jak and Daxter: The Precursor Legacy | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *Journey to Ascension* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| *Kingdom Hearts* | ❌ | 10 | 4 | 6 | 0 | 0 | ❌ 40.0% |
| *Kingdom Hearts 2* | ❌ | 10 | 7 | 3 | 0 | 0 | ⚠️ 70.0% |
| *Kirby's Dream Land 3* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Landstalker - The Treasures of King Nole | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% |
| *Lingo* | ✅ | 10 | 3 | 0 | 0 | 7 | ❌ 30.0% |
| Links Awakening DX | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| Lufia II Ancient Cave | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Mario & Luigi Superstar Saga | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Mega Man 2 | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% |
| Mega Man 3 | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| MegaMan Battle Network 3 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Meritous | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Metamath | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *Muse Dash* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% |
| Noita | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Ocarina of Time | ❌ | 10 | 0 | 8 | 0 | 2 | ❌ 0.0% |
| Old School Runescape | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Overcooked! 2 | ❌ | 10 | 3 | 2 | 0 | 5 | ❌ 30.0% |
| *Paint* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Pokemon Emerald | ❌ | 10 | 3 | 4 | 0 | 3 | ❌ 30.0% |
| Pokemon Red and Blue | ❌ | 10 | 0 | 8 | 0 | 2 | ❌ 0.0% |
| *Raft* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Risk of Rain 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| SMZ3 | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% |
| *Satisfactory* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Saving Princess | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *Secret of Evermore* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Shivers | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Sonic Adventure 2 Battle | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% |
| *Starcraft 2* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| *Stardew Valley* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% |
| Subnautica | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| Super Mario 64 | ❌ | 10 | 4 | 6 | 0 | 0 | ❌ 40.0% |
| Super Mario Land 2 | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| Super Mario World | ❌ | 10 | 7 | 3 | 0 | 0 | ⚠️ 70.0% |
| *Super Metroid* | ❌ | 10 | 0 | 6 | 0 | 4 | ❌ 0.0% |
| TOEM original | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| TOEM rule builder | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *TUNIC* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Terraria | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% |
| The Legend of Zelda | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| The Messenger | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% |
| The Wind Waker | ❌ | 10 | 1 | 4 | 0 | 5 | ❌ 10.0% |
| *The Witness* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| Timespinner | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Undertale | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| VVVVVV | ❌ | 10 | 8 | 2 | 0 | 0 | ⚠️ 80.0% |
| Wargroove | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |
| *Yacht Dice* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% |
| Yoshi's Island | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% |
| Yu-Gi-Oh! 2006 | ❌ | 10 | 5 | 5 | 0 | 0 | ⚠️ 50.0% |
| Zillion | ❌ | 10 | 0 | 8 | 1 | 1 | ❌ 0.0% |
| shapez | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** |

## Results Breakdown

### Unexpected Passes (48)

Games NOT expected to pass original_seeded mode (not in config or mode not listed) but passed anyway.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Short Hike | 10 | 10 | 0 | 0 | 100.0% |
| APQuest | 10 | 10 | 0 | 0 | 100.0% |
| Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Aquaria | 10 | 10 | 0 | 0 | 100.0% |
| Baking Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Blasphemous | 10 | 4 | 0 | 0 | 40.0% |
| Bomb Rush Cyberfunk | 10 | 10 | 0 | 0 | 100.0% |
| Bumper Stickers | 10 | 10 | 0 | 0 | 100.0% |
| Castlevania - Circle of the Moon | 10 | 10 | 0 | 0 | 100.0% |
| Celeste (Open World) | 10 | 10 | 0 | 0 | 100.0% |
| Celeste 64 | 10 | 10 | 0 | 0 | 100.0% |
| ChecksFinder | 10 | 10 | 0 | 0 | 100.0% |
| Choo-Choo Charles | 10 | 10 | 0 | 0 | 100.0% |
| Civilization VI | 10 | 10 | 0 | 0 | 100.0% |
| Coding Adventure | 10 | 10 | 0 | 0 | 100.0% |
| DLCQuest | 10 | 10 | 0 | 0 | 100.0% |
| DOOM 1993 | 10 | 10 | 0 | 0 | 100.0% |
| DOOM II | 10 | 10 | 0 | 0 | 100.0% |
| Dark Souls III | 10 | 10 | 0 | 0 | 100.0% |
| DepGraph | 10 | 10 | 0 | 0 | 100.0% |
| Final Fantasy | 10 | 10 | 0 | 0 | 100.0% |
| Final Fantasy Mystic Quest | 10 | 9 | 0 | 0 | 90.0% |
| Heretic | 10 | 10 | 0 | 0 | 100.0% |
| Hylics 2 | 10 | 10 | 0 | 0 | 100.0% |
| Inscryption | 10 | 10 | 0 | 0 | 100.0% |
| Jak and Daxter: The Precursor Legacy | 10 | 10 | 0 | 0 | 100.0% |
| Lingo | 10 | 3 | 0 | 0 | 30.0% |
| Lufia II Ancient Cave | 10 | 10 | 0 | 0 | 100.0% |
| Mario & Luigi Superstar Saga | 10 | 10 | 0 | 0 | 100.0% |
| MegaMan Battle Network 3 | 10 | 10 | 0 | 0 | 100.0% |
| Meritous | 10 | 10 | 0 | 0 | 100.0% |
| Metamath | 10 | 10 | 0 | 0 | 100.0% |
| Noita | 10 | 10 | 0 | 0 | 100.0% |
| Old School Runescape | 10 | 10 | 0 | 0 | 100.0% |
| Paint | 10 | 10 | 0 | 0 | 100.0% |
| Raft | 10 | 10 | 0 | 0 | 100.0% |
| Risk of Rain 2 | 10 | 10 | 0 | 0 | 100.0% |
| Saving Princess | 10 | 10 | 0 | 0 | 100.0% |
| Secret of Evermore | 10 | 10 | 0 | 0 | 100.0% |
| TOEM original | 10 | 10 | 0 | 0 | 100.0% |
| TOEM rule builder | 10 | 10 | 0 | 0 | 100.0% |
| TUNIC | 10 | 10 | 0 | 0 | 100.0% |
| Terraria | 10 | 9 | 0 | 0 | 90.0% |
| The Legend of Zelda | 10 | 10 | 0 | 0 | 100.0% |
| The Witness | 10 | 10 | 0 | 0 | 100.0% |
| Undertale | 10 | 10 | 0 | 0 | 100.0% |
| Wargroove | 10 | 10 | 0 | 0 | 100.0% |
| shapez | 10 | 10 | 0 | 0 | 100.0% |

### Expected Failures (40)

Games NOT expected to pass original_seeded mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Hat in Time | 10 | 1 | 9 | 0 | 10.0% |
| A Link to the Past | 10 | 0 | 9 | 0 | 0.0% |
| Castlevania 64 | 10 | 0 | 10 | 0 | 0.0% |
| Donkey Kong Country 3 | 10 | 7 | 3 | 0 | 70.0% |
| EarthBound | 10 | 5 | 5 | 0 | 50.0% |
| Factorio | 10 | 0 | 10 | 0 | 0.0% |
| Faxanadu | 10 | 1 | 9 | 0 | 10.0% |
| Hollow Knight | 10 | 0 | 10 | 0 | 0.0% |
| Journey to Ascension | 10 | 0 | 10 | 0 | 0.0% |
| Kingdom Hearts | 10 | 4 | 6 | 0 | 40.0% |
| Kingdom Hearts 2 | 10 | 7 | 3 | 0 | 70.0% |
| Kirby's Dream Land 3 | 10 | 0 | 10 | 0 | 0.0% |
| Landstalker - The Treasures of King Nole | 10 | 3 | 7 | 0 | 30.0% |
| Links Awakening DX | 10 | 1 | 9 | 0 | 10.0% |
| Mega Man 2 | 10 | 9 | 1 | 0 | 90.0% |
| Mega Man 3 | 10 | 0 | 10 | 0 | 0.0% |
| Muse Dash | 10 | 3 | 7 | 0 | 30.0% |
| Ocarina of Time | 10 | 0 | 8 | 0 | 0.0% |
| Overcooked! 2 | 10 | 3 | 2 | 0 | 30.0% |
| Pokemon Emerald | 10 | 3 | 4 | 0 | 30.0% |
| Pokemon Red and Blue | 10 | 0 | 8 | 0 | 0.0% |
| SMZ3 | 10 | 2 | 8 | 0 | 20.0% |
| Satisfactory | 10 | 0 | 10 | 0 | 0.0% |
| Shivers | 10 | 0 | 10 | 0 | 0.0% |
| Sonic Adventure 2 Battle | 10 | 2 | 8 | 0 | 20.0% |
| Starcraft 2 | 10 | 0 | 10 | 0 | 0.0% |
| Stardew Valley | 10 | 3 | 7 | 0 | 30.0% |
| Subnautica | 10 | 1 | 9 | 0 | 10.0% |
| Super Mario 64 | 10 | 4 | 6 | 0 | 40.0% |
| Super Mario Land 2 | 10 | 1 | 9 | 0 | 10.0% |
| Super Mario World | 10 | 7 | 3 | 0 | 70.0% |
| Super Metroid | 10 | 0 | 6 | 0 | 0.0% |
| The Messenger | 10 | 1 | 9 | 0 | 10.0% |
| The Wind Waker | 10 | 1 | 4 | 0 | 10.0% |
| Timespinner | 10 | 0 | 10 | 0 | 0.0% |
| VVVVVV | 10 | 8 | 2 | 0 | 80.0% |
| Yacht Dice | 10 | 0 | 10 | 0 | 0.0% |
| Yoshi's Island | 10 | 2 | 8 | 0 | 20.0% |
| Yu-Gi-Oh! 2006 | 10 | 5 | 5 | 0 | 50.0% |
| Zillion | 10 | 0 | 8 | 1 | 0.0% |

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
