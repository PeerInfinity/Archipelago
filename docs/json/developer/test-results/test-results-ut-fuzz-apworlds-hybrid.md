# Universal Tracker Fuzz Test Results (Hybrid)

[<- Back to Fuzz Summary](./test-results-fuzz-summary-apworlds.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-apworlds-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-apworlds-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-apworlds-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-apworlds-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-apworlds-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-apworlds-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-03-22 17:48:53 UTC

**Source Data Created:** 2026-03-22T17:18:59.876988+00:00

**Source Data Last Updated:** 2026-03-22T17:18:59.876998+00:00

**Universal Tracker Version:** Hybrid (worldgen with native UT preference)

**Seed Mode:** Fixed (seed=1)

**Runs Per Game:** 100

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 123
- **Games with 100% Pass Rate:** 55 (44.7%)
- **Games with Failures:** 68 (55.3%)
- **Total Fuzz Runs:** 12300
- **Successful Runs:** 7068 (57.5%)
- **Failed Runs:** 3857
- **Timed Out Runs:** 54
- **Ignored Runs:** 1321

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 55 (passes hybrid mode per config)
- **Unexpected Passes:** 0 (expected to fail but passed)
- **Expected Failures:** 41 (doesn't pass hybrid mode per config)
- **Unexpected Failures (logic):** 27 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 0 (expected to pass but timed out)

### Explain Support Summary

- **Games with Explain Stats:** 39
- **Games with 100% Explain Coverage:** 35
- **Games with No Explain Support:** 0
- **Locations with Explain Support:** 6,832
- **Locations without Explain Support:** 172
- **Locations with Default Rule:** 4,279
- **Overall Explain Coverage:** 97.5%

### Generic Exporter/Logic Statistics

Of the 55 games with 100% pass rate:

- **Passing with Generic Exporter:** 39/55 (70.9%)
- **Passing with Generic Logic:** 55/55 (100.0%)
- **Passing with Both Generic:** 39/55 (70.9%)

**Combined Custom Code Size:**

- **Total Exporter Code:** 414.4KB
- **Total Game Logic Code:** 0.0KB
- **Combined Total:** 414.4KB

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate | Exporter | GameLogic | Rules Size |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| A Difficult Game About Climbing | ✅ | 100 | 67 | 0 | 0 | 33 | ⚠️ 67.0% | ✅ | ✅ | N/A |
| *A Link Between Worlds* | ❌ | 100 | 15 | 85 | 0 | 0 | ❌ 15.0% | ✅ | ✅ | N/A |
| *ANIMAL WELL* | ✅ | 100 | 92 | 0 | 0 | 8 | 92.0% | 1.5KB | ✅ | N/A |
| Actraiser | ✅ | 100 | 84 | 0 | 0 | 16 | ⚠️ 84.0% | ✅ | ✅ | N/A |
| *Against the Storm* | ❌ | 100 | 64 | 35 | 1 | 0 | ⚠️ 64.0% | ✅ | ✅ | N/A |
| *Air Delivery* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 6.6KB | ✅ | N/A |
| An Untitled Story | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 8.7KB | ✅ | N/A |
| *Anodyne* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 10.7KB | ✅ | N/A |
| Another Crabs Treasure | ❌ | 100 | 51 | 49 | 0 | 0 | ⚠️ 51.0% | 3.1KB | ✅ | N/A |
| *Ape Escape* | ❌ | 100 | 99 | 1 | 0 | 0 | 99.0% | ✅ | ✅ | N/A |
| *Ape Escape 3* | ❌ | 100 | 0 | 23 | 0 | 77 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Astalon* | ✅ | 100 | 87 | 0 | 0 | 13 | ⚠️ 87.0% | ✅ | ✅ | N/A |
| Autopelago | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 9.2KB | ✅ | N/A |
| *Axiom Verge* | ❌ | 100 | 0 | 99 | 0 | 1 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Balatro* | ❌ | 100 | 7 | 12 | 0 | 81 | ❌ 7.0% | ✅ | ✅ | N/A |
| Brotato | ✅ | 100 | 79 | 0 | 0 | 21 | ⚠️ 79.0% | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Cavern of Dreams* | ❌ | 100 | 20 | 43 | 0 | 37 | ❌ 20.0% | ✅ | ✅ | N/A |
| *ChecksMate* | ❌ | 100 | 87 | 11 | 0 | 2 | ⚠️ 87.0% | ✅ | ✅ | N/A |
| *Chrono Trigger Jets of Time* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *ClusterTruck* | ❌ | 100 | 52 | 48 | 0 | 0 | ⚠️ 52.0% | ✅ | ✅ | N/A |
| *Corn Kidz 64* | ❌ | 100 | 0 | 98 | 0 | 2 | ❌ 0.0% | ✅ | ✅ | N/A |
| *CrossCode* | ✅ | 100 | 76 | 0 | 0 | 24 | ⚠️ 76.0% | ✅ | ✅ | N/A |
| *Crystal Project* | ❌ | 100 | 28 | 72 | 0 | 0 | ❌ 28.0% | ✅ | ✅ | N/A |
| *Crystalis* | ❌ | 100 | 59 | 2 | 0 | 39 | ⚠️ 59.0% | 9.2KB | ✅ | N/A |
| Cuphead | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Deep Rock Galactic* | ❌ | 100 | 35 | 65 | 0 | 0 | ❌ 35.0% | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | N/A |
| *Digimon World* | ❌ | 100 | 1 | 74 | 0 | 25 | ❌ 1.0% | ✅ | ✅ | N/A |
| Dome Keeper | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | N/A |
| *Duke Nukem 3D* | ❌ | 100 | 2 | 93 | 0 | 5 | ❌ 2.0% | ✅ | ✅ | N/A |
| *Final Fantasy Tactics A2* | ❌ | 100 | 10 | 88 | 0 | 2 | ❌ 10.0% | ✅ | ✅ | N/A |
| *Final Fantasy Tactics Advance* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Fire Emblem Sacred Stones* | ❌ | 100 | 39 | 58 | 0 | 3 | ❌ 39.0% | ✅ | ✅ | N/A |
| *Frogmonster* | ❌ | 100 | 76 | 24 | 0 | 0 | ⚠️ 76.0% | ✅ | ✅ | N/A |
| *GZDoom* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Garfield Kart - Furious Racing* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | 100 | 90 | 0 | 0 | 10 | 90.0% | ✅ | ✅ | N/A |
| *Grim Dawn* | ❌ | 100 | 0 | 62 | 0 | 38 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Hammerwatch* | ❌ | 100 | 26 | 72 | 0 | 2 | ❌ 26.0% | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Here Comes Niko! | ❌ | 100 | 61 | 38 | 0 | 1 | ⚠️ 61.0% | ✅ | ✅ | N/A |
| *Iji* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Into the Breach* | ❌ | 100 | 45 | 55 | 0 | 0 | ❌ 45.0% | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | 100 | 91 | 0 | 0 | 9 | 91.0% | ✅ | ✅ | N/A |
| Jigsaw | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Keep Talking and Nobody Explodes* | ❌ | 100 | 26 | 53 | 0 | 21 | ❌ 26.0% | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | 100 | 96 | 0 | 0 | 4 | 96.0% | ✅ | ✅ | N/A |
| Kirby Super Star | ❌ | 100 | 19 | 80 | 0 | 1 | ❌ 19.0% | ✅ | ✅ | N/A |
| League of Legends | ✅ | 100 | 98 | 0 | 0 | 2 | 98.0% | ✅ | ✅ | N/A |
| *Lego Star Wars: The Complete Saga* | ✅ | 100 | 85 | 0 | 0 | 15 | ⚠️ 85.0% | ✅ | ✅ | N/A |
| Lil Gator Game | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Lingo 2* | ❌ | 100 | 8 | 9 | 0 | 83 | ❌ 8.0% | 17.1KB | ✅ | N/A |
| Little Witch Nobeta | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | 100 | 49 | 0 | 0 | 51 | ❌ 49.0% | ✅ | ✅ | N/A |
| *Lunacid* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 8.2KB | ✅ | N/A |
| *Majora's Mask Recompiled* | ❌ | 100 | 89 | 11 | 0 | 0 | ⚠️ 89.0% | 10.4KB | ✅ | N/A |
| *Mario Kart Double Dash* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | 100 | 97 | 0 | 0 | 3 | 97.0% | ✅ | ✅ | N/A |
| *Metroid: Zero Mission* | ❌ | 100 | 8 | 86 | 0 | 6 | ❌ 8.0% | 9.8KB | ✅ | N/A |
| *Minishoot Adventures* | ❌ | 100 | 18 | 82 | 0 | 0 | ❌ 18.0% | 25.9KB | ✅ | N/A |
| *Minit* | ❌ | 100 | 75 | 24 | 0 | 1 | ⚠️ 75.0% | 23.9KB | ✅ | N/A |
| *Monster Sanctuary* | ❌ | 100 | 20 | 80 | 0 | 0 | ❌ 20.0% | ✅ | ✅ | N/A |
| *Nine Sols* | ✅ | 100 | 54 | 0 | 0 | 46 | ⚠️ 54.0% | ✅ | ✅ | N/A |
| *Ori and the Blind Forest* | ✅ | 100 | 97 | 0 | 0 | 3 | 97.0% | 23.2KB | ✅ | N/A |
| *Ori and the Will of the Wisps* | ❌ | 100 | 19 | 53 | 0 | 28 | ❌ 19.0% | ✅ | ✅ | N/A |
| *Oxygen Not Included* | ❌ | 100 | 64 | 27 | 0 | 9 | ⚠️ 64.0% | ✅ | ✅ | N/A |
| *Pizza Tower* | ❌ | 100 | 49 | 37 | 0 | 14 | ❌ 49.0% | 7.0KB | ✅ | N/A |
| PlateUp | ❌ | 100 | 5 | 60 | 11 | 24 | ❌ 5.0% | ✅ | ✅ | N/A |
| *Pokemon FireRed and LeafGreen* | ❌ | 100 | 80 | 20 | 0 | 0 | ⚠️ 80.0% | ✅ | ✅ | N/A |
| *Pokemon Mystery Dungeon Explorers of Sky* | ❌ | 100 | 78 | 22 | 0 | 0 | ⚠️ 78.0% | ✅ | ✅ | N/A |
| *Pseudoregalia* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 17.1KB | ✅ | N/A |
| *Rabi-Ribi* | ❌ | 100 | 50 | 13 | 0 | 37 | ⚠️ 50.0% | ✅ | ✅ | N/A |
| Rain World | ✅ | 100 | 36 | 0 | 0 | 64 | ❌ 36.0% | 11.8KB | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Reventure* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Rift Wizard | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 7.7KB | ✅ | N/A |
| *Rift of the Necrodancer* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Rusted Moss* | ❌ | 100 | 43 | 57 | 0 | 0 | ❌ 43.0% | ✅ | ✅ | N/A |
| *Sentinels of the Multiverse* | ❌ | 100 | 0 | 65 | 34 | 1 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Shadow The Hedgehog* | ❌ | 100 | 8 | 8 | 0 | 84 | ❌ 8.0% | ✅ | ✅ | N/A |
| *Ship of Harkinian* | ❌ | 100 | 29 | 71 | 0 | 0 | ❌ 29.0% | ✅ | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ❌ | 100 | 94 | 0 | 6 | 0 | 94.0% | ✅ | ✅ | N/A |
| *Sly 2: Band of Thieves* | ❌ | 100 | 0 | 53 | 0 | 47 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Sly Cooper and the Thievius Raccoonus* | ❌ | 100 | 89 | 11 | 0 | 0 | ⚠️ 89.0% | ✅ | ✅ | N/A |
| *Sonic Adventure DX* | ❌ | 100 | 16 | 31 | 0 | 53 | ❌ 16.0% | 29.9KB | ✅ | N/A |
| Sonic Heroes | ✅ | 100 | 0 | 0 | 0 | 100 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Sonic Rush* | ✅ | 100 | 99 | 0 | 0 | 1 | 99.0% | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 9.4KB | ✅ | N/A |
| *Soul Blazer* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 10.5KB | ✅ | N/A |
| Spinball | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Spyro 3* | ❌ | 100 | 11 | 88 | 0 | 1 | ❌ 11.0% | 15.3KB | ✅ | N/A |
| *Stacklands* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | 12.7KB | ✅ | N/A |
| Star Fox 64 | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 17.2KB | ✅ | N/A |
| Star Wars Episode I Racer | ❌ | 100 | 4 | 96 | 0 | 0 | ❌ 4.0% | 5.7KB | ✅ | N/A |
| Super Cat Planet | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Symphony of the Night | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *System Shock 2* | ❌ | 100 | 40 | 21 | 0 | 39 | ❌ 40.0% | 15.1KB | ✅ | N/A |
| *TCG Card Shop Simulator* | ❌ | 100 | 0 | 98 | 0 | 2 | ❌ 0.0% | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Tetris Attack* | ❌ | 100 | 2 | 81 | 0 | 17 | ❌ 2.0% | 23.1KB | ✅ | N/A |
| *The Legend of Zelda - Oracle of Seasons* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *The Legend of Zelda - Phantom Hourglass* | ❌ | 100 | 13 | 85 | 0 | 2 | ❌ 13.0% | ✅ | ✅ | N/A |
| *The Sims 4* | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | 5.5KB | ✅ | N/A |
| *ToeJam and Earl* | ❌ | 100 | 4 | 87 | 0 | 9 | ❌ 4.0% | ✅ | ✅ | N/A |
| TurnipBoy | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Tyrian* | ❌ | 100 | 39 | 32 | 0 | 29 | ❌ 39.0% | ✅ | ✅ | N/A |
| Vampire Survivors | ❌ | 100 | 27 | 21 | 0 | 52 | ❌ 27.0% | ✅ | ✅ | N/A |
| *Wario Land* | ❌ | 100 | 0 | 100 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Watery Words | ❌ | 100 | 98 | 0 | 2 | 0 | 98.0% | 9.1KB | ✅ | N/A |
| Wordipelago | ✅ | 100 | 95 | 0 | 0 | 5 | 95.0% | 19.5KB | ✅ | N/A |
| *XCOM 2 War of the Chosen* | ✅ | 100 | 85 | 0 | 0 | 15 | ⚠️ 85.0% | ✅ | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | ❌ | 100 | 82 | 18 | 0 | 0 | ⚠️ 82.0% | 28.8KB | ✅ | N/A |
| *Yu-Gi-Oh! Forbidden Memories* | ❌ | 100 | 18 | 82 | 0 | 0 | ❌ 18.0% | ✅ | ✅ | N/A |
| Zelda II: The Adventure of Link | ❌ | 100 | 12 | 88 | 0 | 0 | ❌ 12.0% | ✅ | ✅ | N/A |
| osu! | ✅ | 100 | 100 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |

## Results Breakdown

### Expected Passes (55)

Games that pass hybrid mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Dance of Fire and Ice | 100 | 100 | 0 | 0 | 100.0% |
| A Difficult Game About Climbing | 100 | 67 | 0 | 0 | 67.0% |
| ANIMAL WELL | 100 | 92 | 0 | 0 | 92.0% |
| Actraiser | 100 | 84 | 0 | 0 | 84.0% |
| Air Delivery | 100 | 100 | 0 | 0 | 100.0% |
| An Untitled Story | 100 | 100 | 0 | 0 | 100.0% |
| Anodyne | 100 | 100 | 0 | 0 | 100.0% |
| Astalon | 100 | 87 | 0 | 0 | 87.0% |
| Autopelago | 100 | 100 | 0 | 0 | 100.0% |
| Brotato | 100 | 79 | 0 | 0 | 79.0% |
| Castlevania: Dawn of Sorrow | 100 | 100 | 0 | 0 | 100.0% |
| CrossCode | 100 | 76 | 0 | 0 | 76.0% |
| DORONKO WANKO | 100 | 100 | 0 | 0 | 100.0% |
| Diddy Kong Racing | 100 | 99 | 0 | 0 | 99.0% |
| Dome Keeper | 100 | 99 | 0 | 0 | 99.0% |
| Final Fantasy Tactics Advance | 100 | 100 | 0 | 0 | 100.0% |
| Golden Sun The Lost Age | 100 | 90 | 0 | 0 | 90.0% |
| Hatsune Miku Project Diva Mega Mix+ | 100 | 100 | 0 | 0 | 100.0% |
| Isles Of Sea And Sky | 100 | 100 | 0 | 0 | 100.0% |
| Ittle Dew 2 | 100 | 91 | 0 | 0 | 91.0% |
| Jigsaw | 100 | 100 | 0 | 0 | 100.0% |
| K-On! After School Live!! | 100 | 100 | 0 | 0 | 100.0% |
| Kingdom Hearts Birth by Sleep | 100 | 100 | 0 | 0 | 100.0% |
| Kingdom Hearts Chain of Memories | 100 | 100 | 0 | 0 | 100.0% |
| Kingdom Hearts RE Chain of Memories | 100 | 96 | 0 | 0 | 96.0% |
| League of Legends | 100 | 98 | 0 | 0 | 98.0% |
| Lego Star Wars: The Complete Saga | 100 | 85 | 0 | 0 | 85.0% |
| Little Witch Nobeta | 100 | 100 | 0 | 0 | 100.0% |
| Luigi's Mansion | 100 | 49 | 0 | 0 | 49.0% |
| Lunacid | 100 | 100 | 0 | 0 | 100.0% |
| Mario Kart Double Dash | 100 | 99 | 0 | 0 | 99.0% |
| MetroCUBEvania | 100 | 100 | 0 | 0 | 100.0% |
| Metroid Fusion | 100 | 97 | 0 | 0 | 97.0% |
| Nine Sols | 100 | 54 | 0 | 0 | 54.0% |
| Ori and the Blind Forest | 100 | 97 | 0 | 0 | 97.0% |
| Pseudoregalia | 100 | 100 | 0 | 0 | 100.0% |
| Rain World | 100 | 36 | 0 | 0 | 36.0% |
| Ratchet & Clank 2 | 100 | 100 | 0 | 0 | 100.0% |
| Reventure | 100 | 100 | 0 | 0 | 100.0% |
| Rift Wizard | 100 | 100 | 0 | 0 | 100.0% |
| Rift of the Necrodancer | 100 | 100 | 0 | 0 | 100.0% |
| Sonic Heroes | 100 | 0 | 0 | 0 | 0.0% |
| Sonic Rush | 100 | 99 | 0 | 0 | 99.0% |
| Sonic the Hedgehog 1 | 100 | 100 | 0 | 0 | 100.0% |
| Soul Blazer | 100 | 100 | 0 | 0 | 100.0% |
| Spinball | 100 | 100 | 0 | 0 | 100.0% |
| Star Fox 64 | 100 | 100 | 0 | 0 | 100.0% |
| Super Cat Planet | 100 | 100 | 0 | 0 | 100.0% |
| Symphony of the Night | 100 | 100 | 0 | 0 | 100.0% |
| TOEM: A Photo Adventure | 100 | 100 | 0 | 0 | 100.0% |
| The Sims 4 | 100 | 100 | 0 | 0 | 100.0% |
| TurnipBoy | 100 | 100 | 0 | 0 | 100.0% |
| Wordipelago | 100 | 95 | 0 | 0 | 95.0% |
| XCOM 2 War of the Chosen | 100 | 85 | 0 | 0 | 85.0% |
| osu! | 100 | 100 | 0 | 0 | 100.0% |

### Expected Failures (41)

Games NOT expected to pass hybrid mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Link Between Worlds | 100 | 15 | 85 | 0 | 15.0% |
| Against the Storm | 100 | 64 | 35 | 1 | 64.0% |
| Balatro | 100 | 7 | 12 | 0 | 7.0% |
| Cavern of Dreams | 100 | 20 | 43 | 0 | 20.0% |
| ChecksMate | 100 | 87 | 11 | 0 | 87.0% |
| Chrono Trigger Jets of Time | 100 | 0 | 100 | 0 | 0.0% |
| ClusterTruck | 100 | 52 | 48 | 0 | 52.0% |
| Crystal Project | 100 | 28 | 72 | 0 | 28.0% |
| Crystalis | 100 | 59 | 2 | 0 | 59.0% |
| Cuphead | 100 | 0 | 100 | 0 | 0.0% |
| Deep Rock Galactic | 100 | 35 | 65 | 0 | 35.0% |
| Duke Nukem 3D | 100 | 2 | 93 | 0 | 2.0% |
| Final Fantasy Tactics A2 | 100 | 10 | 88 | 0 | 10.0% |
| GZDoom | 100 | 0 | 100 | 0 | 0.0% |
| Garfield Kart - Furious Racing | 100 | 0 | 100 | 0 | 0.0% |
| Hammerwatch | 100 | 26 | 72 | 0 | 26.0% |
| Into the Breach | 100 | 45 | 55 | 0 | 45.0% |
| Kirby Super Star | 100 | 19 | 80 | 0 | 19.0% |
| Lil Gator Game | 100 | 0 | 100 | 0 | 0.0% |
| Monster Sanctuary | 100 | 20 | 80 | 0 | 20.0% |
| Ori and the Will of the Wisps | 100 | 19 | 53 | 0 | 19.0% |
| Oxygen Not Included | 100 | 64 | 27 | 0 | 64.0% |
| PlateUp | 100 | 5 | 60 | 11 | 5.0% |
| Pokemon Mystery Dungeon Explorers of Sky | 100 | 78 | 22 | 0 | 78.0% |
| Rusted Moss | 100 | 43 | 57 | 0 | 43.0% |
| Sentinels of the Multiverse | 100 | 0 | 65 | 34 | 0.0% |
| Shadow The Hedgehog | 100 | 8 | 8 | 0 | 8.0% |
| Ship of Harkinian | 100 | 29 | 71 | 0 | 29.0% |
| Simon Tatham's Portable Puzzle Collection | 100 | 94 | 0 | 6 | 94.0% |
| Sly 2: Band of Thieves | 100 | 0 | 53 | 0 | 0.0% |
| Sly Cooper and the Thievius Raccoonus | 100 | 89 | 11 | 0 | 89.0% |
| Sonic Adventure DX | 100 | 16 | 31 | 0 | 16.0% |
| System Shock 2 | 100 | 40 | 21 | 0 | 40.0% |
| TCG Card Shop Simulator | 100 | 0 | 98 | 0 | 0.0% |
| The Legend of Zelda - Oracle of Seasons | 100 | 0 | 100 | 0 | 0.0% |
| The Legend of Zelda - Phantom Hourglass | 100 | 13 | 85 | 0 | 13.0% |
| Tyrian | 100 | 39 | 32 | 0 | 39.0% |
| Wario Land | 100 | 0 | 100 | 0 | 0.0% |
| Watery Words | 100 | 98 | 0 | 2 | 98.0% |
| Yu-Gi-Oh! Dungeon Dice Monsters | 100 | 82 | 18 | 0 | 82.0% |
| Zelda II: The Adventure of Link | 100 | 12 | 88 | 0 | 12.0% |

### Unexpected Failures (Logic Mismatch) (27)

Games expected to pass hybrid mode but failed due to logic mismatches.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Another Crabs Treasure | 100 | 51 | 49 | 0 | 51.0% |
| Ape Escape | 100 | 99 | 1 | 0 | 99.0% |
| Ape Escape 3 | 100 | 0 | 23 | 0 | 0.0% |
| Axiom Verge | 100 | 0 | 99 | 0 | 0.0% |
| Corn Kidz 64 | 100 | 0 | 98 | 0 | 0.0% |
| Digimon World | 100 | 1 | 74 | 0 | 1.0% |
| Fire Emblem Sacred Stones | 100 | 39 | 58 | 0 | 39.0% |
| Frogmonster | 100 | 76 | 24 | 0 | 76.0% |
| Grim Dawn | 100 | 0 | 62 | 0 | 0.0% |
| Here Comes Niko! | 100 | 61 | 38 | 0 | 61.0% |
| Iji | 100 | 0 | 100 | 0 | 0.0% |
| Keep Talking and Nobody Explodes | 100 | 26 | 53 | 0 | 26.0% |
| Lingo 2 | 100 | 8 | 9 | 0 | 8.0% |
| Majora's Mask Recompiled | 100 | 89 | 11 | 0 | 89.0% |
| Metroid: Zero Mission | 100 | 8 | 86 | 0 | 8.0% |
| Minishoot Adventures | 100 | 18 | 82 | 0 | 18.0% |
| Minit | 100 | 75 | 24 | 0 | 75.0% |
| Pizza Tower | 100 | 49 | 37 | 0 | 49.0% |
| Pokemon FireRed and LeafGreen | 100 | 80 | 20 | 0 | 80.0% |
| Rabi-Ribi | 100 | 50 | 13 | 0 | 50.0% |
| Spyro 3 | 100 | 11 | 88 | 0 | 11.0% |
| Stacklands | 100 | 0 | 100 | 0 | 0.0% |
| Star Wars Episode I Racer | 100 | 4 | 96 | 0 | 4.0% |
| Tetris Attack | 100 | 2 | 81 | 0 | 2.0% |
| ToeJam and Earl | 100 | 4 | 87 | 0 | 4.0% |
| Vampire Survivors | 100 | 27 | 21 | 0 | 27.0% |
| Yu-Gi-Oh! Forbidden Memories | 100 | 18 | 82 | 0 | 18.0% |

## Explain Support Details

This section shows which games have rules that support the `explain_json()` method, which provides human-readable explanations of access rule logic.

| Game Name | Total Locs | With Explain | Without Explain | Default Rule | Coverage |
|-----------|:----------:|:------------:|:---------------:|:------------:|:--------:|
| Axiom Verge | 184 | 59 | 125 | 0 | 🔶 32% |
| Diddy Kong Racing | 59 | 11 | 20 | 28 | 🔶 35% |
| An Untitled Story | 169 | 80 | 22 | 67 | ⚠️ 78% |
| Minit | 50 | 43 | 5 | 2 | ⚠️ 90% |
| A Dance of Fire and Ice | 142 | 135 | 0 | 7 | ✅ 100% |
| Actraiser | 173 | 55 | 0 | 118 | ✅ 100% |
| Ape Escape 3 | 660 | 342 | 0 | 318 | ✅ 100% |
| Brotato | 305 | 0 | 0 | 305 | ✅ 100% |
| Castlevania: Dawn of Sorrow | 226 | 90 | 0 | 136 | ✅ 100% |
| Corn Kidz 64 | 187 | 187 | 0 | 0 | ✅ 100% |
| DORONKO WANKO | 95 | 4 | 0 | 91 | ✅ 100% |
| Digimon World | 217 | 215 | 0 | 2 | ✅ 100% |
| Golden Sun The Lost Age | 319 | 157 | 0 | 162 | ✅ 100% |
| Grim Dawn | 37 | 3 | 0 | 34 | ✅ 100% |
| Hatsune Miku Project Diva Mega Mix+ | 500 | 500 | 0 | 0 | ✅ 100% |
| Iji | 279 | 0 | 0 | 279 | ✅ 100% |
| Isles Of Sea And Sky | 586 | 345 | 0 | 241 | ✅ 100% |
| Ittle Dew 2 | 235 | 235 | 0 | 0 | ✅ 100% |
| Jigsaw | 759 | 759 | 0 | 0 | ✅ 100% |
| K-On! After School Live!! | 589 | 589 | 0 | 0 | ✅ 100% |
| Keep Talking and Nobody Explodes | 116 | 72 | 0 | 44 | ✅ 100% |
| Kingdom Hearts Chain of Memories | 151 | 29 | 0 | 122 | ✅ 100% |
| League of Legends | 667 | 662 | 0 | 5 | ✅ 100% |
| Little Witch Nobeta | 55 | 15 | 0 | 40 | ✅ 100% |
| Luigi's Mansion | 721 | 470 | 0 | 251 | ✅ 100% |
| MetroCUBEvania | 13 | 2 | 0 | 11 | ✅ 100% |
| Nine Sols | 318 | 85 | 0 | 233 | ✅ 100% |
| Rift of the Necrodancer | 294 | 294 | 0 | 0 | ✅ 100% |
| Sonic the Hedgehog 1 | 208 | 0 | 0 | 208 | ✅ 100% |
| Spinball | 2 | 1 | 0 | 1 | ✅ 100% |
| Stacklands | 216 | 190 | 0 | 26 | ✅ 100% |
| Super Cat Planet | 244 | 51 | 0 | 193 | ✅ 100% |
| TOEM: A Photo Adventure | 214 | 4 | 0 | 210 | ✅ 100% |
| Tetris Attack | 300 | 300 | 0 | 0 | ✅ 100% |
| The Sims 4 | 706 | 419 | 0 | 287 | ✅ 100% |
| TurnipBoy | 45 | 22 | 0 | 23 | ✅ 100% |
| Vampire Survivors | 481 | 401 | 0 | 80 | ✅ 100% |
| Wordipelago | 167 | 6 | 0 | 161 | ✅ 100% |
| osu! | 594 | 0 | 0 | 594 | ✅ 100% |

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

## Excluded Templates (APWorlds)

These community APWorlds are excluded from UT fuzz testing due to incompatible rule patterns or APWorld bugs:

| APWorld | Reason |
|---------|--------|
| A Link Between Worlds.yaml | Uses compiled Rust extension (albwrandomizer) for game logic. Rules reference self.seed_info.can_traverse() and self.seed_info.can_reach() which evaluate dynamically randomized crack/portal connections (Cracksanity). These methods live in the external library and cannot be exported to static rules - worldgen generates lambdas with 'self' references that fail with NameError. |
| ANIMAL WELL.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Against the Storm.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Air Delivery.yaml | Python closure bug in apworld causes OR rules to only check the last condition. APWorld bug, not exporter issue. |
| Anodyne.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Ape Escape 3.yaml | Uses Rulesets class with condense() method that returns closure (lambda state: self.check(state, player)). Exporter cannot trace through closure to extract actual rules stored in self.critical/self.rules lists. Rules export as unknown 'check' helper which defaults to True. |
| Ape Escape.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Astalon.yaml | Uses custom RuleInstance pattern with caching that serializes incorrectly. Exporter captures caching logic instead of actual rules. |
| Axiom Verge.yaml | Uses non-standard (state, context) helper signature where context is a LogicContext object containing player and options. Lambda rules use (s, c) parameters mapping to (state, context). Exporter misidentifies these as separate params, creating helpers with inconsistent signatures. Generated worldgen calls like has_trenchcoat(state, player, s, c) pass 4 args to functions expecting 3, causing TypeError. |
| Balatro.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Cavern of Dreams.yaml | Uses custom carryable system with CavernOfDreamsLocation/CavernOfDreamsEntrance classes. Rules stored in carryable_access_rules, inverse_carryable_access_rules, and dont_care_access_rule dictionaries instead of standard access_rule lambdas. Fixed @final class method dispatches to check_any_access() which evaluates carryable-specific rules. Exporter gets IndentationError parsing class method and exports null rules. |
| ChecksMate.yaml | Uses custom Material accumulator system. Items add numeric material values to state.prog_items[player]['Material'], and rules use meets_material_expectations() to check accumulated totals. Rule Builder cannot track computed properties. |
| Chrono Trigger Jets of Time.yaml | Requires YAML generated from external web tool (multiworld.ctjot.com). World validates seed_share_link and raises InvalidYamlException for standard YAML configurations. |
| ClusterTruck.yaml | APWorld bug: Unconditional filler item addition in create_items() causes item/location imbalance when start_level is also in skipped_levels. Results in FillError with ~30-60% of randomized configurations. |
| Corn Kidz 64.yaml | Uses custom CK64Rule enum system with data-driven rule evaluation. Incompatible with rule exporter architecture. |
| CrossCode.yaml | Uses custom Condition class system (ItemCondition, QuestCondition, etc.) with c.satisfied() method calls. Exporter serializes condition objects as string representations instead of extracting item requirements. Progressive item replacements in cond_args dict are not processed. |
| Crystal Project.yaml | Uses class-level helper methods (can_fight_gran, can_push_ice_block_and_goat, is_area_in_level_range) that combine item checks with game-specific level calculations. Exporter converts these to AST_capability/AST_generic_helper rules, but worldgen generates function calls without defining the functions, causing NameError at runtime. |
| Crystalis.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Deep Rock Galactic.yaml | APWorld bug: remove_locations() uses random.sample() with locations_to_remove option (0-150 range), but for goal_mode 2/3 only ~64 locations are available, causing ValueError. Also has logic mismatches from has_from_list rules that don't export correctly. |
| Digimon World.yaml | Uses iterative calculate_prosperity helper that accumulates prosperity by simulating digimon recruitment. Cannot export recursive state-tracking logic to Rule Builder format. |
| Duke Nukem 3D.yaml | Uses dynamic location/region creation in interpret_slot_data() instead of static definitions. Locations are created when level.create_region() is called based on slot_data['levels']. Rules use nested classes (HasRule, LambdaRule) defined inside Rules.__init__() that cannot be serialized. Exporter captures 0 locations and null rules. Tracker fails with 'location already exists' assertion when interpret_slot_data tries to create locations that already exist. |
| Final Fantasy Tactics A2.yaml | APWorld bug: StartingUnits option allows selecting more than 5 non-special units, but rom.py raises exception during output generation. Fails before UT tracking phase with randomized options. |
| Final Fantasy Tactics Advance.yaml | APWorld bug: In create_gates() when last_gate=True with gate_paths>1 and gate_items=dispatch_gate, the dispatch_gate region is never added to multiworld.regions. Dispatch locations are orphaned, causing ~50% logic mismatch failures. |
| Fire Emblem Sacred Stones.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Frogmonster.yaml | Uses functools.partial wrapping lambdas (unexportable) and has bug where 40 bug regions are not registered with multiworld. |
| GZDoom.yaml | Base framework apworld with hidden=True. Not a standalone game - requires WAD-specific apworlds (e.g., zdoom_doom_2.apworld) that extend GZDoomWorld and provide wad_logic. Accessing wad_logic on base class raises AttributeError because the attribute is only declared, not initialized. |
| Garfield Kart - Furious Racing.yaml | APWorld bug: Compares Choice options against invalid string 'on' (e.g., randomize_spoilers in ['on', 'progressive']). Valid option keys are 'off', 'progressive', 'combine_tiers'. Archipelago's option __eq__ asserts valid comparisons, causing AssertionError during seed generation. |
| Grim Dawn.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Hammerwatch.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Iji.yaml | Uses module-level constant lists (EventNames.Levels, ItemNames.Sector_Access) with subscript access in rules. Exporter captures AST instead of resolved values. Chained helper functions cause rule expansion to hit size limits, falling back to True_(). |
| Into the Breach.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Keep Talking and Nobody Explodes.yaml | Uses custom getModuleCounts() helper function with nested list counting logic. Exporter cannot translate this to Rule Builder - falls back to True_() making UT think all locations are accessible. |
| Lego Star Wars The Complete Saga.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Lingo 2.yaml | Uses closure-captured AccessRequirements objects in make_location_lambda(). Exporter captures variable name 'new_reqs' but cannot serialize the object, resulting in None passed to lingo2_can_satisfy_requirements helper causing AttributeError. Would need custom handler like original Lingo. |
| Lunacid.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Majora's Mask Recompiled.yaml | Shop price randomization incompatible with tracker: (1) Rules.json path discovery fails due to apostrophe in directory name. (2) Randomized prices not exported to game_info. (3) Prices are non-deterministic - regenerating world creates different prices causing wallet requirement mismatches. |
| Mario Kart Double Dash.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Metroid Zero Mission.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Minishoot Adventures.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Minit.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Monster Sanctuary.yaml | Uses custom AccessCondition class with data-driven rule evaluation. Exporter sees lambda calling rules.has_access() but cannot introspect the AccessCondition tree structure. |
| Nine Sols.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Ori and the Blind Forest.yaml | Uses oribf_has helper with special keywords ('Free', 'Lure', 'DoubleBash', etc.) and item tuples. Exporter hits infinite loop analyzing helper. Custom exporter improves to 30-60% success but glitched logic settings still fail due to complex option-dependent rules in RulesData.py. |
| Ori and the Will of the Wisps.yaml | Uses LogicMixin with dynamic resource/combat calculations (wotw_max_resources, wotw_enemies). Exporter hits infinite loop analyzing complex cached state patterns. |
| Oxygen Not Included.yaml | APWorld bug: Duplicate location names created when bionic=true with base-game-only clusters (spaced_out=false). Four Bionic DLC items have empty tech_base values, causing locations named ' - 1' to collide in the global location cache. |
| Pizza Tower.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Pokemon FireRed and LeafGreen.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Pokemon Mystery Dungeon Explorers of Sky.yaml | APWorld bug: 'Team Name' classification not handled in create_regions(), causing KeyError when subx_rules() tries to access 'Team Name Location'. Also has logic mismatches from complex rule patterns. |
| Pseudoregalia.yaml | Uses virtual items ('Kick Count', 'Cling Count') managed through custom collect/remove hooks. Collecting physical items like 'Air Kick' adds virtual counters via state.add_item(). Rules check virtual item counts but worldgen can't replicate collect hooks, so virtual items are never in collection state. |
| Rabi-Ribi.yaml | Helper complexity exceeds rule analyzer limits (30+ interdependent helpers). Analyzer hits 10000 call limit before full analysis. |
| Reventure.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Rift of the Necrodancer.yaml | APWorld bugs: (1) Option validation allows empty song pool causing ValueError in randrange(). (2) Duplicate item IDs - Medium and Hard variants share same ID (e.g., both 'Take a Breather (Medium)' and 'Take a Breather (Hard)' use ID 2013), causing item_id_to_name mismatches and logic errors. |
| Rusted Moss.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Sentinels of the Multiverse.yaml | APWorld issue: Option combinations create more items than locations (required_scions can be 10000+, location_density.hero can be 0). Fails with FillError during seed generation before UT tracking runs. Not a UT compatibility issue. |
| Shadow The Hedgehog.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Ship of Harkinian.yaml | Uses rule_wrapper class pattern that wraps lambda rules in closures. Access rules are wrapped via rule_wrapper.wrap(parent_region, rule, world).evaluate, where 'rule' is a Callable[[tuple[state, region, world]], bool]. Exporter extracts AST from evaluate() method which only shows wrapper call, not the actual rule logic stored in the closure. APWorld has native UT support (ut_can_gen_without_yaml=True) but the fuzzer's sphere comparison validation has minor edge-case mismatches with Fire Temple locations. |
| Sly 2 Band of Thieves.yaml | APWorld bug: uses generation_is_fake to apply different rules during tracking vs generation. ThiefNet locations skip Episode requirements and Pickpocket locations get wrong region assignments during tracking. |
| Sly Cooper and the Thievius Raccoonus.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Sonic Adventure DX.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Sonic Rush.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Soul Blazer.yaml | Uses closure-based data-driven rule pattern with RuleFlag enum dispatch. Cannot reconstruct rules without original closure context. |
| Spyro 3.yaml | All 40+ helper functions nested inside set_rules() cause RecursionError during AST parsing. Complex gem counting logic (has_all_gems, get_gems_accessible_in_level) cannot be serialized. 4329 locations cause export timeout even with custom handler. |
| Stacklands.yaml | Uses custom StacklandsLogic mixin with sl_* helper methods (sl_has_pack, sl_has_idea, sl_has_all_packs, etc.) that exporter cannot analyze. 98% of rules export as null. Board capacity methods use complex option-dependent logic with captured closure variables. |
| System Shock 2.yaml | Uses custom cyb_mod_count helper that calculates weighted sums of multiple Cyber Module item types. Also uses walrus operator (:=) in lambdas which cannot be analyzed. Would require WeightedSum rule support in worldgen. |
| TCG Card Shop Simulator.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| Tetris Attack.yaml | Temporarily excluded. Fixing this is currently not a priority. |
| The Legend of Zelda - Oracle of Seasons.yaml | Uses parameterized helper functions with extra parameters beyond (state, player) such as oos_can_jump_1_wide_liquid(state, player, can_summon_companion), oos_self_locking_item(state, player, region_name, item_name). Exporter hits infinite loop limit (10000+ calls) analyzing these helpers due to complex interdependencies and runtime option access. Results in undefined helpers in worldgen Rules.py causing NameError. |
| The Legend of Zelda - Phantom Hourglass.yaml | Entrance randomization fails frequently with complex option combinations. GER algorithm fails after 10 attempts with mixed pool settings. |
| The Sims 4.yaml | APWorld bug: fill_slot_data() returns keys like 'goal' but generate_early() expects 'goal_value'. Key mismatch causes KeyError during worldgen regeneration. |
| ToeJam and Earl.yaml | Uses custom collect method with point-based rank progression. Rules check pseudo-item 'ranks' which only exists via custom state tracking, not exportable. |
| Tyrian.yaml | Uses DPS dataclass objects captured in lambda closures via default parameters (lambda state, dps1=dps_active: can_deal_damage(state, player, dps1)). Exporter captures variable name 'dps1' but cannot serialize the DPS dataclass value, resulting in None passed to helpers. get_front_weapon_state() fails with AttributeError: 'NoneType' object has no attribute '_type_piercing'. DamageTables system requires complex runtime calculations that cannot be exported to static rules. |
| Wario Land.yaml | Requires ROM file (Wario Land - Super Mario Land 3 (World).gb) for seed generation. APWorld doesn't check skip_required_files setting, causing FileNotFoundError in headless testing environments. |
| XCOM 2 War of the Chosen.yaml | Uses custom RuleManager class with power-based access rules. Pattern incompatible with exporter/worldgen pipeline. |
| Yu-Gi-Oh! Forbidden Memories.yaml | Uses instance-level state (duelist_unlock_order, final_6_order) set randomly in generate_early() based on options. Access rules call is_card_location_accessible() which depends on this state and cannot be exported to static rules. |
| plateup.yaml | Temporarily excluded. Fixing this is currently not a priority. |
