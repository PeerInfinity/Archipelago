# Universal Tracker Fuzz Test Results (Hybrid)

[<- Back to Fuzz Summary](./test-results-fuzz-summary-apworlds.md) | [Main Test Results](./test-results-summary.md)

[View Comparison (Original vs Orig Seeded)](./test-results-ut-fuzz-apworlds-comparison-original-original_seeded.md) | [View Comparison (Original vs Worldgen)](./test-results-ut-fuzz-apworlds-comparison-original-worldgen.md) | [View Comparison (Original vs Hybrid)](./test-results-ut-fuzz-apworlds-comparison-original-hybrid.md) | [View Comparison (Original vs Pickle)](./test-results-ut-fuzz-apworlds-comparison-original-pickle.md) | [View Comparison (Worldgen vs Hybrid)](./test-results-ut-fuzz-apworlds-comparison-worldgen-hybrid.md) | [View Comparison (Worldgen vs Pickle)](./test-results-ut-fuzz-apworlds-comparison-worldgen-pickle.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

**Generated:** 2026-02-19 21:59:55 UTC

**Source Data Created:** 2026-02-04T21:03:09.652326

**Source Data Last Updated:** 2026-02-04T21:03:09.652333

**Universal Tracker Version:** Hybrid (worldgen with native UT preference)

**Seed Mode:** Random

**Runs Per Game:** 10

**Parallel Jobs:** 4

**Timeout Per Generation:** 60s

## Summary

- **Total Games:** 122
- **Games with 100% Pass Rate:** 74 (60.7%)
- **Games with Failures:** 48 (39.3%)
- **Total Fuzz Runs:** 1210
- **Successful Runs:** 807 (66.7%)
- **Failed Runs:** 277
- **Timed Out Runs:** 3
- **Ignored Runs:** 123

### Expected vs Unexpected Results (based on tracking-mode-config.json)

- **Expected Passes:** 58 (passes hybrid mode per config)
- **Unexpected Passes:** 16 (expected to fail but passed)
- **Expected Failures:** 46 (doesn't pass hybrid mode per config)
- **Unexpected Failures (logic):** 1 (expected to pass but had logic mismatch)
- **Unexpected Failures (timeout only):** 1 (expected to pass but timed out)

### Explain Support Summary

- **Games with Explain Stats:** 41
- **Games with 100% Explain Coverage:** 40
- **Games with No Explain Support:** 0
- **Locations with Explain Support:** 6,351
- **Locations without Explain Support:** 20
- **Locations with Default Rule:** 5,125
- **Overall Explain Coverage:** 99.7%

### Generic Exporter/Logic Statistics

Of the 74 games with 100% pass rate:

- **Passing with Generic Exporter:** 51/74 (68.9%)
- **Passing with Generic Logic:** 74/74 (100.0%)
- **Passing with Both Generic:** 51/74 (68.9%)

**Combined Custom Code Size:**

- **Total Exporter Code:** 414.0KB
- **Total Game Logic Code:** 0.0KB
- **Combined Total:** 414.0KB

## Test Results

| Game Name | Result | Total | Success | Failure | Timeout | Ignored | Success Rate | Exporter | GameLogic | Rules Size |
|-----------|:------:|:-----:|:-------:|:-------:|:-------:|:-------:|:------------:|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| A Difficult Game About Climbing | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | ✅ | ✅ | N/A |
| *A Link Between Worlds* | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% | ✅ | ✅ | N/A |
| *ANIMAL WELL* | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | 1.5KB | ✅ | N/A |
| Actraiser | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | ✅ | ✅ | N/A |
| *Against the Storm* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Air Delivery* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 6.6KB | ✅ | N/A |
| An Untitled Story | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 8.7KB | ✅ | N/A |
| *Anodyne* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 10.7KB | ✅ | N/A |
| Another Crabs Treasure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 3.1KB | ✅ | N/A |
| *Ape Escape* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Ape Escape 3* | ❌ | 10 | 4 | 6 | 0 | 0 | ❌ 40.0% | ✅ | ✅ | N/A |
| *Astalon* | ❌ | 10 | 5 | 3 | 0 | 2 | ⚠️ 50.0% | ✅ | ✅ | N/A |
| Autopelago | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 9.2KB | ✅ | N/A |
| *Axiom Verge* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Balatro* | ❌ | 10 | 0 | 6 | 0 | 4 | ❌ 0.0% | ✅ | ✅ | N/A |
| Brotato | ✅ | 10 | 7 | 0 | 0 | 3 | ⚠️ 70.0% | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Cavern of Dreams* | ❌ | 10 | 2 | 6 | 0 | 2 | ❌ 20.0% | ✅ | ✅ | N/A |
| *ChecksMate* | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% | ✅ | ✅ | N/A |
| *Chrono Trigger Jets of Time* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *ClusterTruck* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Corn Kidz 64* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *CrossCode* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Crystal Project* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Crystalis* | ✅ | 10 | 7 | 0 | 0 | 3 | ⚠️ 70.0% | 9.2KB | ✅ | N/A |
| Cuphead | ✅ | 10 | 0 | 0 | 0 | 10 | ❌ 0.0% | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Deep Rock Galactic* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Digimon World* | ✅ | 10 | 6 | 0 | 0 | 4 | ⚠️ 60.0% | ✅ | ✅ | N/A |
| Dome Keeper | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Duke Nukem 3D* | ❌ | 10 | 1 | 8 | 0 | 1 | ❌ 10.0% | ✅ | ✅ | N/A |
| *Final Fantasy Tactics A2* | ❌ | 10 | 0 | 7 | 0 | 3 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Final Fantasy Tactics Advance* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Fire Emblem Sacred Stones* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Frogmonster* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *GZDoom* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Garfield Kart - Furious Racing* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Grim Dawn* | ❌ | 10 | 7 | 2 | 0 | 1 | ⚠️ 70.0% | ✅ | ✅ | N/A |
| *Hammerwatch* | ❌ | 10 | 4 | 5 | 0 | 1 | ❌ 40.0% | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Here Comes Niko! | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Iji* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Into the Breach* | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | ✅ | ✅ | N/A |
| Jigsaw | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Keep Talking and Nobody Explodes* | ✅ | 10 | 7 | 0 | 0 | 3 | ⚠️ 70.0% | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Kirby Super Star | ✅ | 10 | 0 | 0 | 0 | 10 | ❌ 0.0% | ✅ | ✅ | N/A |
| League of Legends | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Lego Star Wars: The Complete Saga* | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | ✅ | ✅ | N/A |
| Lil Gator Game | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Lingo 2* | ❌ | 10 | 9 | 0 | 1 | 0 | 90.0% | 17.1KB | ✅ | N/A |
| Little Witch Nobeta | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | 10 | 7 | 0 | 0 | 3 | ⚠️ 70.0% | ✅ | ✅ | N/A |
| *Lunacid* | ❌ | 10 | 1 | 9 | 0 | 0 | ❌ 10.0% | 8.2KB | ✅ | N/A |
| *Majora's Mask Recompiled* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 10.4KB | ✅ | N/A |
| *Mario Kart Double Dash* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Metroid Zero Mission* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 9.7KB | ✅ | N/A |
| *Minishoot Adventures* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | 25.9KB | ✅ | N/A |
| *Minit* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 23.9KB | ✅ | N/A |
| *Monster Sanctuary* | ❌ | 10 | 3 | 7 | 0 | 0 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Nine Sols* | ❌ | 10 | 3 | 5 | 0 | 2 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Ori and the Blind Forest* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 23.2KB | ✅ | N/A |
| *Ori and the Will of the Wisps* | ❌ | 10 | 3 | 5 | 0 | 2 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Oxygen Not Included* | ❌ | 10 | 8 | 1 | 0 | 1 | ⚠️ 80.0% | ✅ | ✅ | N/A |
| *Pizza Tower* | ❌ | 10 | 6 | 4 | 0 | 0 | ⚠️ 60.0% | 7.0KB | ✅ | N/A |
| *Pokemon FireRed and LeafGreen* | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% | ✅ | ✅ | N/A |
| *Pokemon Mystery Dungeon Explorers of Sky* | ❌ | 10 | 8 | 2 | 0 | 0 | ⚠️ 80.0% | ✅ | ✅ | N/A |
| *Pseudoregalia* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 17.1KB | ✅ | N/A |
| *Rabi-Ribi* | ❌ | 10 | 3 | 1 | 0 | 6 | ❌ 30.0% | ✅ | ✅ | N/A |
| Rain World | ✅ | 10 | 3 | 0 | 0 | 7 | ❌ 30.0% | 11.7KB | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Reventure* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Rift Wizard | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 7.7KB | ✅ | N/A |
| *Rift of the Necrodancer* | ❌ | 10 | 3 | 3 | 0 | 4 | ❌ 30.0% | ✅ | ✅ | N/A |
| *Rusted Moss* | ❌ | 10 | 6 | 4 | 0 | 0 | ⚠️ 60.0% | ✅ | ✅ | N/A |
| *Sentinels of the Multiverse* | ❌ | 10 | 0 | 8 | 2 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Shadow The Hedgehog* | ✅ | 10 | 2 | 0 | 0 | 8 | ❌ 20.0% | ✅ | ✅ | N/A |
| *Ship of Harkinian* | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% | ✅ | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Sly 2: Band of Thieves* | ❌ | 10 | 0 | 6 | 0 | 4 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Sly Cooper and the Thievius Raccoonus* | ❌ | 10 | 8 | 2 | 0 | 0 | ⚠️ 80.0% | ✅ | ✅ | N/A |
| *Sonic Adventure DX* | ❌ | 10 | 0 | 5 | 0 | 5 | ❌ 0.0% | 29.9KB | ✅ | N/A |
| Sonic Heroes | ✅ | 10 | 0 | 0 | 0 | 10 | ❌ 0.0% | ✅ | ✅ | N/A |
| *Sonic Rush* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 9.4KB | ✅ | N/A |
| *Soul Blazer* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 10.6KB | ✅ | N/A |
| Spinball | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Spyro 3* | ❌ | 10 | 3 | 5 | 0 | 2 | ❌ 30.0% | 15.2KB | ✅ | N/A |
| *Stacklands* | ❌ | 10 | 9 | 1 | 0 | 0 | 90.0% | 12.7KB | ✅ | N/A |
| Star Fox 64 | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 17.1KB | ✅ | N/A |
| Star Wars Episode I Racer | ✅ | 10 | 9 | 0 | 0 | 1 | 90.0% | 5.7KB | ✅ | N/A |
| Super Cat Planet | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| Symphony of the Night | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *System Shock 2* | ❌ | 10 | 6 | 3 | 0 | 1 | ⚠️ 60.0% | 15.0KB | ✅ | N/A |
| *TCG Card Shop Simulator* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Tetris Attack* | ✅ | 10 | 8 | 0 | 0 | 2 | ⚠️ 80.0% | 23.1KB | ✅ | N/A |
| Tevi | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *The Legend of Zelda - Oracle of Seasons* | ❌ | 10 | 2 | 8 | 0 | 0 | ❌ 20.0% | ✅ | ✅ | N/A |
| *The Legend of Zelda - Phantom Hourglass* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| *The Sims 4* | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 5.5KB | ✅ | N/A |
| TurnipBoy | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *Tyrian* | ❌ | 10 | 5 | 1 | 0 | 4 | ⚠️ 50.0% | ✅ | ✅ | N/A |
| Vampire Survivors | ✅ | 10 | 4 | 0 | 0 | 6 | ❌ 40.0% | ✅ | ✅ | N/A |
| *Wario Land* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Watery Words | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | 9.1KB | ✅ | N/A |
| Wordipelago | ✅ | 10 | 8 | 0 | 0 | 2 | ⚠️ 80.0% | 19.5KB | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | ❌ | 0 | 0 | 0 | 0 | 0 | ❌ 0.0% | 28.7KB | ✅ | N/A |
| *Yu-Gi-Oh! Forbidden Memories* | ❌ | 10 | 0 | 10 | 0 | 0 | ❌ 0.0% | ✅ | ✅ | N/A |
| Zelda II: The Adventure of Link | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| osu! | ✅ | 10 | 10 | 0 | 0 | 0 | **100.0%** | ✅ | ✅ | N/A |
| *plateup* | ❌ | 10 | 2 | 7 | 0 | 1 | ❌ 20.0% | ✅ | ✅ | N/A |

## Results Breakdown

### Expected Passes (58)

Games that pass hybrid mode per tracking-mode-config.json and passed the test.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Dance of Fire and Ice | 10 | 10 | 0 | 0 | 100.0% |
| A Difficult Game About Climbing | 10 | 9 | 0 | 0 | 90.0% |
| Actraiser | 10 | 9 | 0 | 0 | 90.0% |
| Air Delivery | 10 | 10 | 0 | 0 | 100.0% |
| An Untitled Story | 10 | 10 | 0 | 0 | 100.0% |
| Anodyne | 10 | 10 | 0 | 0 | 100.0% |
| Another Crabs Treasure | 10 | 10 | 0 | 0 | 100.0% |
| Autopelago | 10 | 10 | 0 | 0 | 100.0% |
| Brotato | 10 | 7 | 0 | 0 | 70.0% |
| Castlevania: Dawn of Sorrow | 10 | 10 | 0 | 0 | 100.0% |
| Cuphead | 10 | 0 | 0 | 0 | 0.0% |
| DORONKO WANKO | 10 | 10 | 0 | 0 | 100.0% |
| Diddy Kong Racing | 10 | 10 | 0 | 0 | 100.0% |
| Dome Keeper | 10 | 10 | 0 | 0 | 100.0% |
| Final Fantasy Tactics Advance | 10 | 10 | 0 | 0 | 100.0% |
| Frogmonster | 10 | 10 | 0 | 0 | 100.0% |
| Golden Sun The Lost Age | 10 | 10 | 0 | 0 | 100.0% |
| Hatsune Miku Project Diva Mega Mix+ | 10 | 10 | 0 | 0 | 100.0% |
| Here Comes Niko! | 10 | 10 | 0 | 0 | 100.0% |
| Isles Of Sea And Sky | 10 | 10 | 0 | 0 | 100.0% |
| Ittle Dew 2 | 10 | 9 | 0 | 0 | 90.0% |
| Jigsaw | 10 | 10 | 0 | 0 | 100.0% |
| K-On! After School Live!! | 10 | 10 | 0 | 0 | 100.0% |
| Kingdom Hearts Birth by Sleep | 10 | 10 | 0 | 0 | 100.0% |
| Kingdom Hearts Chain of Memories | 10 | 10 | 0 | 0 | 100.0% |
| Kingdom Hearts RE Chain of Memories | 10 | 10 | 0 | 0 | 100.0% |
| Kirby Super Star | 10 | 0 | 0 | 0 | 0.0% |
| League of Legends | 10 | 10 | 0 | 0 | 100.0% |
| Lego Star Wars: The Complete Saga | 10 | 9 | 0 | 0 | 90.0% |
| Lil Gator Game | 10 | 10 | 0 | 0 | 100.0% |
| Little Witch Nobeta | 10 | 10 | 0 | 0 | 100.0% |
| Luigi's Mansion | 10 | 7 | 0 | 0 | 70.0% |
| MetroCUBEvania | 10 | 10 | 0 | 0 | 100.0% |
| Metroid Fusion | 10 | 10 | 0 | 0 | 100.0% |
| Pseudoregalia | 10 | 10 | 0 | 0 | 100.0% |
| Rain World | 10 | 3 | 0 | 0 | 30.0% |
| Ratchet & Clank 2 | 10 | 10 | 0 | 0 | 100.0% |
| Reventure | 10 | 10 | 0 | 0 | 100.0% |
| Rift Wizard | 10 | 10 | 0 | 0 | 100.0% |
| Simon Tatham's Portable Puzzle Collection | 10 | 10 | 0 | 0 | 100.0% |
| Sonic Heroes | 10 | 0 | 0 | 0 | 0.0% |
| Sonic Rush | 10 | 10 | 0 | 0 | 100.0% |
| Sonic the Hedgehog 1 | 10 | 10 | 0 | 0 | 100.0% |
| Soul Blazer | 10 | 10 | 0 | 0 | 100.0% |
| Spinball | 10 | 10 | 0 | 0 | 100.0% |
| Star Fox 64 | 10 | 10 | 0 | 0 | 100.0% |
| Star Wars Episode I Racer | 10 | 9 | 0 | 0 | 90.0% |
| Super Cat Planet | 10 | 10 | 0 | 0 | 100.0% |
| Symphony of the Night | 10 | 10 | 0 | 0 | 100.0% |
| TOEM: A Photo Adventure | 10 | 10 | 0 | 0 | 100.0% |
| Tevi | 10 | 10 | 0 | 0 | 100.0% |
| The Sims 4 | 10 | 10 | 0 | 0 | 100.0% |
| TurnipBoy | 10 | 10 | 0 | 0 | 100.0% |
| Vampire Survivors | 10 | 4 | 0 | 0 | 40.0% |
| Watery Words | 10 | 10 | 0 | 0 | 100.0% |
| Wordipelago | 10 | 8 | 0 | 0 | 80.0% |
| Zelda II: The Adventure of Link | 10 | 10 | 0 | 0 | 100.0% |
| osu! | 10 | 10 | 0 | 0 | 100.0% |

### Unexpected Passes (16)

Games NOT expected to pass hybrid mode (not in config or mode not listed) but passed anyway.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| ANIMAL WELL | 10 | 9 | 0 | 0 | 90.0% |
| Ape Escape | 10 | 10 | 0 | 0 | 100.0% |
| Axiom Verge | 10 | 10 | 0 | 0 | 100.0% |
| Corn Kidz 64 | 10 | 10 | 0 | 0 | 100.0% |
| CrossCode | 10 | 10 | 0 | 0 | 100.0% |
| Crystalis | 10 | 7 | 0 | 0 | 70.0% |
| Digimon World | 10 | 6 | 0 | 0 | 60.0% |
| Iji | 10 | 10 | 0 | 0 | 100.0% |
| Keep Talking and Nobody Explodes | 10 | 7 | 0 | 0 | 70.0% |
| Majora's Mask Recompiled | 10 | 10 | 0 | 0 | 100.0% |
| Mario Kart Double Dash | 10 | 10 | 0 | 0 | 100.0% |
| Metroid Zero Mission | 10 | 10 | 0 | 0 | 100.0% |
| Minit | 10 | 10 | 0 | 0 | 100.0% |
| Ori and the Blind Forest | 10 | 10 | 0 | 0 | 100.0% |
| Shadow The Hedgehog | 10 | 2 | 0 | 0 | 20.0% |
| Tetris Attack | 10 | 8 | 0 | 0 | 80.0% |

### Expected Failures (46)

Games NOT expected to pass hybrid mode and failed as expected.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| A Link Between Worlds | 10 | 2 | 8 | 0 | 20.0% |
| Against the Storm | 10 | 0 | 10 | 0 | 0.0% |
| Ape Escape 3 | 10 | 4 | 6 | 0 | 40.0% |
| Balatro | 10 | 0 | 6 | 0 | 0.0% |
| Cavern of Dreams | 10 | 2 | 6 | 0 | 20.0% |
| ChecksMate | 10 | 9 | 1 | 0 | 90.0% |
| Chrono Trigger Jets of Time | 10 | 0 | 10 | 0 | 0.0% |
| ClusterTruck | 10 | 3 | 7 | 0 | 30.0% |
| Crystal Project | 10 | 3 | 7 | 0 | 30.0% |
| Deep Rock Galactic | 10 | 0 | 10 | 0 | 0.0% |
| Duke Nukem 3D | 10 | 1 | 8 | 0 | 10.0% |
| Final Fantasy Tactics A2 | 10 | 0 | 7 | 0 | 0.0% |
| Fire Emblem Sacred Stones | 10 | 3 | 7 | 0 | 30.0% |
| GZDoom | 10 | 0 | 10 | 0 | 0.0% |
| Garfield Kart - Furious Racing | 10 | 0 | 10 | 0 | 0.0% |
| Grim Dawn | 10 | 7 | 2 | 0 | 70.0% |
| Hammerwatch | 10 | 4 | 5 | 0 | 40.0% |
| Into the Breach | 10 | 2 | 8 | 0 | 20.0% |
| Lingo 2 | 10 | 9 | 0 | 1 | 90.0% |
| Lunacid | 10 | 1 | 9 | 0 | 10.0% |
| Minishoot Adventures | 10 | 0 | 10 | 0 | 0.0% |
| Monster Sanctuary | 10 | 3 | 7 | 0 | 30.0% |
| Nine Sols | 10 | 3 | 5 | 0 | 30.0% |
| Ori and the Will of the Wisps | 10 | 3 | 5 | 0 | 30.0% |
| Oxygen Not Included | 10 | 8 | 1 | 0 | 80.0% |
| Pizza Tower | 10 | 6 | 4 | 0 | 60.0% |
| Pokemon FireRed and LeafGreen | 10 | 9 | 1 | 0 | 90.0% |
| Pokemon Mystery Dungeon Explorers of Sky | 10 | 8 | 2 | 0 | 80.0% |
| Rabi-Ribi | 10 | 3 | 1 | 0 | 30.0% |
| Rift of the Necrodancer | 10 | 3 | 3 | 0 | 30.0% |
| Rusted Moss | 10 | 6 | 4 | 0 | 60.0% |
| Sentinels of the Multiverse | 10 | 0 | 8 | 2 | 0.0% |
| Ship of Harkinian | 10 | 2 | 8 | 0 | 20.0% |
| Sly 2: Band of Thieves | 10 | 0 | 6 | 0 | 0.0% |
| Sly Cooper and the Thievius Raccoonus | 10 | 8 | 2 | 0 | 80.0% |
| Sonic Adventure DX | 10 | 0 | 5 | 0 | 0.0% |
| Spyro 3 | 10 | 3 | 5 | 0 | 30.0% |
| Stacklands | 10 | 9 | 1 | 0 | 90.0% |
| System Shock 2 | 10 | 6 | 3 | 0 | 60.0% |
| TCG Card Shop Simulator | 10 | 0 | 10 | 0 | 0.0% |
| The Legend of Zelda - Oracle of Seasons | 10 | 2 | 8 | 0 | 20.0% |
| The Legend of Zelda - Phantom Hourglass | 10 | 0 | 10 | 0 | 0.0% |
| Tyrian | 10 | 5 | 1 | 0 | 50.0% |
| Wario Land | 10 | 0 | 10 | 0 | 0.0% |
| Yu-Gi-Oh! Forbidden Memories | 10 | 0 | 10 | 0 | 0.0% |
| plateup | 10 | 2 | 7 | 0 | 20.0% |

### Unexpected Failures (Logic Mismatch) (1)

Games expected to pass hybrid mode but failed due to logic mismatches.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Astalon | 10 | 5 | 3 | 0 | 50.0% |

### Unexpected Failures (Timeout Only) (1)

Games expected to pass hybrid mode but failed only due to timeouts.

| Game Name | Total | Success | Failure | Timeout | Success Rate |
|-----------|:-----:|:-------:|:-------:|:-------:|:------------:|
| Yu-Gi-Oh! Dungeon Dice Monsters | 0 | 0 | 0 | 0 | 0.0% |

## Explain Support Details

This section shows which games have rules that support the `explain_json()` method, which provides human-readable explanations of access rule logic.

| Game Name | Total Locs | With Explain | Without Explain | Default Rule | Coverage |
|-----------|:----------:|:------------:|:---------------:|:------------:|:--------:|
| Diddy Kong Racing | 59 | 11 | 20 | 28 | 🔶 35% |
| A Dance of Fire and Ice | 142 | 135 | 0 | 7 | ✅ 100% |
| A Difficult Game About Climbing | 16 | 0 | 0 | 16 | ✅ 100% |
| Actraiser | 173 | 55 | 0 | 118 | ✅ 100% |
| An Untitled Story | 166 | 101 | 0 | 65 | ✅ 100% |
| Another Crabs Treasure | 614 | 181 | 0 | 433 | ✅ 100% |
| Autopelago | 246 | 21 | 0 | 225 | ✅ 100% |
| Brotato | 153 | 0 | 0 | 153 | ✅ 100% |
| Castlevania: Dawn of Sorrow | 226 | 90 | 0 | 136 | ✅ 100% |
| DORONKO WANKO | 95 | 4 | 0 | 91 | ✅ 100% |
| Dome Keeper | 94 | 0 | 0 | 94 | ✅ 100% |
| Golden Sun The Lost Age | 319 | 216 | 0 | 103 | ✅ 100% |
| Hatsune Miku Project Diva Mega Mix+ | 500 | 500 | 0 | 0 | ✅ 100% |
| Here Comes Niko! | 979 | 319 | 0 | 660 | ✅ 100% |
| Isles Of Sea And Sky | 610 | 361 | 0 | 249 | ✅ 100% |
| Ittle Dew 2 | 235 | 235 | 0 | 0 | ✅ 100% |
| Jigsaw | 759 | 759 | 0 | 0 | ✅ 100% |
| K-On! After School Live!! | 181 | 178 | 0 | 3 | ✅ 100% |
| Kingdom Hearts Birth by Sleep | 223 | 56 | 0 | 167 | ✅ 100% |
| Kingdom Hearts Chain of Memories | 151 | 29 | 0 | 122 | ✅ 100% |
| League of Legends | 668 | 663 | 0 | 5 | ✅ 100% |
| Lil Gator Game | 219 | 178 | 0 | 41 | ✅ 100% |
| Little Witch Nobeta | 55 | 15 | 0 | 40 | ✅ 100% |
| Luigi's Mansion | 744 | 436 | 0 | 308 | ✅ 100% |
| MetroCUBEvania | 9 | 2 | 0 | 7 | ✅ 100% |
| Ratchet & Clank 2 | 123 | 74 | 0 | 49 | ✅ 100% |
| Rift Wizard | 92 | 89 | 0 | 3 | ✅ 100% |
| Simon Tatham's Portable Puzzle Collection | 758 | 758 | 0 | 0 | ✅ 100% |
| Sonic the Hedgehog 1 | 208 | 0 | 0 | 208 | ✅ 100% |
| Spinball | 2 | 1 | 0 | 1 | ✅ 100% |
| Star Wars Episode I Racer | 101 | 91 | 0 | 10 | ✅ 100% |
| Super Cat Planet | 244 | 51 | 0 | 193 | ✅ 100% |
| Symphony of the Night | 187 | 20 | 0 | 167 | ✅ 100% |
| TOEM: A Photo Adventure | 214 | 4 | 0 | 210 | ✅ 100% |
| The Sims 4 | 706 | 396 | 0 | 310 | ✅ 100% |
| TurnipBoy | 45 | 22 | 0 | 23 | ✅ 100% |
| Vampire Survivors | 170 | 64 | 0 | 106 | ✅ 100% |
| Watery Words | 150 | 150 | 0 | 0 | ✅ 100% |
| Wordipelago | 160 | 6 | 0 | 154 | ✅ 100% |
| Zelda II: The Adventure of Link | 106 | 80 | 0 | 26 | ✅ 100% |
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
