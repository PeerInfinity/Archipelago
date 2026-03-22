# Fuzz Test Results Summary (APWorlds)

**Generated:** 2026-03-22 17:48:53 UTC

**Source Data Created:** 2026-03-22T08:50:05.260306+00:00

**Source Data Last Updated:** 2026-03-22T08:50:05.260317+00:00

[<- Back to Main Test Results Summary](./test-results-summary.md)

[View Bundled Worlds Fuzz Results](./test-results-fuzz-summary.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

This summary combines results from fuzz tests that validate game configurations across randomized option combinations:

- **Javascript:** Frontend spoiler playthrough fuzz tests - [View Details](./test-results-spoiler-fuzz-apworlds.md)
- **UT Fuzz Original:** Universal Tracker (original) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-original.md)
- **UT Fuzz Orig Seeded:** Universal Tracker (original with seed) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-original_seeded.md)
- **UT Fuzz Worldgen:** Universal Tracker (worldgen-based) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-worldgen.md)
- **UT Fuzz Pickle:** Universal Tracker (pickle) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-pickle.md)
- **UT Fuzz Hybrid:** Universal Tracker (hybrid) fuzz tests - [View Details](./test-results-ut-fuzz-apworlds-hybrid.md)

## Summary Statistics

### Individual Test Results

- **Javascript:** 35/50 passed (70.0%)
- **UT Fuzz Original:** 38/123 passed (30.9%)
- **UT Fuzz Orig Seeded:** 67/123 passed (54.5%)
- **UT Fuzz Worldgen:** 42/98 passed (42.9%)
- **UT Fuzz Pickle:** 75/123 passed (61.0%)
- **UT Fuzz Hybrid:** 55/123 passed (44.7%)

### Combined Results (All 6 Tests)

- **Games passing all 6 fuzz tests:** 10/124 (8.1%)
- **Games passing 5 fuzz tests:** 19/124 (15.3%)
- **Games passing 4 fuzz tests:** 18/124 (14.5%)
- **Games passing 3 fuzz tests:** 17/124 (13.7%)
- **Games passing 2 fuzz tests:** 7/124 (5.6%)
- **Games passing 1 fuzz test:** 20/124 (16.1%)
- **Games passing 0 fuzz tests:** 33/124 (26.6%)

### Combined Results (Excluding UT Original/Orig Seeded)

This view excludes UT Original and UT Orig Seeded, showing results for Javascript, UT Worldgen, UT Pickle, and UT Hybrid.

- **Games passing all 4 fuzz tests:** 15/124 (12.1%)
- **Games passing 3 fuzz tests:** 24/124 (19.4%)
- **Games passing 2 fuzz tests:** 28/124 (22.6%)
- **Games passing 1 fuzz test:** 19/124 (15.3%)
- **Games passing 0 fuzz tests:** 38/124 (30.6%)

## Test Results

| Game Name | [Javascript](./test-results-spoiler-fuzz-apworlds.md) | [UT Original](./test-results-ut-fuzz-apworlds-original.md) | [UT Orig Seeded](./test-results-ut-fuzz-apworlds-original_seeded.md) | [UT Worldgen](./test-results-ut-fuzz-apworlds-worldgen.md) | [UT Pickle](./test-results-ut-fuzz-apworlds-pickle.md) | [UT Hybrid](./test-results-ut-fuzz-apworlds-hybrid.md) | Rules Size |
|-----------|:----------:|:------------:|:--------------:|:------------:|:----------:|:----------:|:----------:|
| A Dance of Fire and Ice | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | N/A |
| A Difficult Game About Climbing | ✅ | 🔶 67/100 | ✅ | — | ✅ | ✅ | N/A |
| A Link Between Worlds | — | ❌ 14/100 | ❌ 3/10 | ❌ | ❌ 14/100 | ❌ 15/100 | N/A |
| ANIMAL WELL | — | ⚠️ 92/100 | ✅ | — | ✅ | ✅ | N/A |
| Actraiser | ✅ | 🔶 86/100 | ✅ | ✅ | ✅ | ✅ | N/A |
| Against the Storm | — | 🔶 64/99 | 🔶 6/10 | ❌ | 🔶 64/99 | 🔶 64/99 | N/A |
| Air Delivery | — | ✅ | ✅ | 🔶 71/100 | ✅ | ✅ | N/A |
| An Untitled Story | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Anodyne | — | ✅ | ✅ | ❌ 31/100 | ✅ | ✅ | N/A |
| Another Crabs Treasure | ❌ | 🔶 53/100 | 🔶 5/10 | 🔶 55/100 | ✅ | 🔶 51/100 | N/A |
| Ape Escape | — | ⚠️ 97/100 | ✅ | — | ✅ | ⚠️ 99/100 | N/A |
| Ape Escape 3 | — | ✅ | ✅ | ✅ | ✅ | ❌ | N/A |
| Astalon | — | ✅ | ✅ | ❌ 1/87 | ✅ | ✅ | N/A |
| Autopelago | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Axiom Verge | — | 🔶 65/100 | ✅ | ✅ | ✅ | ❌ | N/A |
| Balatro | — | ❌ 9/36 | ❌ | ❌ 7/19 | ⚠️ 18/19 | ❌ 7/19 | N/A |
| Brotato | ✅ | 🔶 42/79 | ❌ 3/7 | ✅ | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Cavern of Dreams | — | ❌ 20/100 | ❌ 2/5 | ❌ 20/63 | ⚠️ 60/63 | ❌ 20/63 | N/A |
| ChecksMate | — | 🔶 85/100 | 🔶 8/10 | ❌ | 🔶 83/98 | 🔶 87/98 | N/A |
| Chrono Trigger Jets of Time | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| ClusterTruck | — | 🔶 52/100 | ❌ 3/10 | — | 🔶 51/100 | 🔶 52/100 | N/A |
| Corn Kidz 64 | — | ⚠️ 98/100 | ✅ | ✅ | ✅ | ❌ | N/A |
| CrossCode | — | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Crystal Project | — | ❌ 28/100 | ❌ 3/10 | ❌ | 🔶 71/100 | ❌ 28/100 | N/A |
| Crystalis | — | 🔶 59/80 | ✅ | ⚠️ 58/61 | ⚠️ 59/61 | ⚠️ 59/61 | N/A |
| Cuphead | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| DORONKO WANKO | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Deep Rock Galactic | — | ❌ 38/100 | 🔶 6/10 | 🔶 71/100 | ⚠️ 97/100 | ❌ 35/100 | N/A |
| Diddy Kong Racing | ✅ | ⚠️ 99/100 | ✅ | ✅ | ✅ | ✅ | N/A |
| Digimon World | — | 🔶 75/100 | ✅ | ✅ | ✅ | ❌ 1/75 | N/A |
| Dome Keeper | ✅ | ⚠️ 99/100 | ✅ | — | ✅ | ✅ | N/A |
| Duke Nukem 3D | — | ❌ 4/100 | ❌ 1/9 | ❌ 5/95 | ⚠️ 89/95 | ❌ 2/95 | N/A |
| Final Fantasy Tactics A2 | — | ❌ 10/100 | ❌ | — | ❌ 10/98 | ❌ 10/98 | N/A |
| Final Fantasy Tactics Advance | — | ✅ | ✅ | 🔶 78/100 | ✅ | ✅ | N/A |
| Fire Emblem Sacred Stones | — | ❌ 43/99 | 🔶 5/10 | ❌ 42/97 | ✅ | ❌ 39/97 | N/A |
| Frogmonster | — | 🔶 76/100 | 🔶 8/10 | 🔶 76/100 | ✅ | 🔶 76/100 | N/A |
| GZDoom | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Garfield Kart - Furious Racing | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Golden Sun The Lost Age | ✅ | 🔶 48/90 | ⚠️ 9/10 | ✅ | ⚠️ 87/90 | ✅ | N/A |
| Grim Dawn | — | 🔶 62/74 | ✅ | ✅ | ✅ | ❌ | N/A |
| Hammerwatch | — | ❌ 27/100 | ❌ 2/10 | — | 🔶 88/98 | ❌ 26/98 | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | ❌ 7/100 | ✅ | ✅ | ✅ | ✅ | N/A |
| Here Comes Niko! | ✅ | 🔶 61/100 | 🔶 8/10 | — | ✅ | 🔶 61/99 | N/A |
| Iji | — | 🔶 62/100 | ✅ | ✅ | ✅ | ❌ | N/A |
| Into the Breach | — | ❌ 45/100 | ❌ 2/10 | ❌ | ❌ 45/100 | ❌ 45/100 | N/A |
| Isles Of Sea And Sky | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | 🔶 66/97 | ✅ | ✅ | ✅ | ✅ | N/A |
| Jigsaw | ✅ | ❌ 48/100 | ❌ 3/10 | ✅ | ❌ 48/100 | ✅ | N/A |
| K-On! After School Live!! | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Keep Talking and Nobody Explodes | — | 🔶 79/100 | ✅ | ✅ | ✅ | ❌ 26/79 | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | ⚠️ 96/100 | ✅ | — | ✅ | ✅ | N/A |
| Kirby Super Star | ✅ | ❌ 18/98 | ❌ | ❌ 4/96 | ❌ 16/96 | ❌ 19/99 | N/A |
| League of Legends | 🔶 6/10 | 🔶 61/100 | 🔶 8/10 | ✅ | 🔶 61/98 | ✅ | N/A |
| Lego Star Wars: The Complete Saga | — | ✅ | ✅ | 🔶 69/85 | ❌ 12/85 | ✅ | N/A |
| Lil Gator Game | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Lingo 2 | — | 🔶 9/18 | 🔶 2/4 | ❌ 8/17 | ✅ | ❌ 8/17 | N/A |
| Little Witch Nobeta | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Lunacid | — | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Majora's Mask Recompiled | — | 🔶 89/100 | ✅ | 🔶 89/100 | ✅ | 🔶 89/100 | N/A |
| Mario Kart Double Dash | — | ⚠️ 99/100 | ✅ | — | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid Fusion | ❌ | 🔶 84/100 | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid: Zero Mission | — | ❌ 1/100 | ❌ 1/10 | ❌ 8/94 | ✅ | ❌ 8/94 | N/A |
| Minishoot Adventures | — | ❌ 18/100 | ❌ | ❌ 18/100 | ✅ | ❌ 18/100 | N/A |
| Minit | — | ⚠️ 99/100 | ✅ | ✅ | ✅ | 🔶 75/99 | N/A |
| Monster Sanctuary | — | ❌ 18/100 | ❌ 3/10 | ❌ | ❌ 36/100 | ❌ 20/100 | N/A |
| Nine Sols | — | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Ori and the Blind Forest | — | ⚠️ 98/100 | ✅ | — | ✅ | ✅ | N/A |
| Ori and the Will of the Wisps | — | ❌ 19/100 | ❌ 2/6 | ❌ | 🔶 56/71 | ❌ 19/72 | N/A |
| Oxygen Not Included | — | 🔶 64/100 | 🔶 8/9 | — | 🔶 66/91 | 🔶 64/91 | N/A |
| Pizza Tower | — | ❌ 49/100 | 🔶 6/10 | 🔶 49/86 | ✅ | 🔶 49/86 | N/A |
| PlateUp | ❌ | ❌ 5/90 | ❌ 1/5 | 🔶 45/59 | 🔶 41/64 | ❌ 5/65 | N/A |
| Pokemon FireRed and LeafGreen | — | 🔶 80/100 | 🔶 6/10 | 🔶 80/100 | ✅ | 🔶 80/100 | N/A |
| Pokemon Mystery Dungeon Explorers of Sky | — | 🔶 78/100 | 🔶 8/10 | ❌ | 🔶 78/100 | 🔶 78/100 | N/A |
| Pseudoregalia | — | ✅ | ✅ | ❌ | ✅ | ✅ | N/A |
| Rabi-Ribi | — | 🔶 50/63 | 🔶 2/4 | 🔶 50/63 | ✅ | 🔶 50/63 | N/A |
| Rain World | ❌ | ⚠️ 36/37 | ✅ | ✅ | ✅ | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Reventure | — | ✅ | ✅ | ❌ | ✅ | ✅ | N/A |
| Rift Wizard | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Rift of the Necrodancer | — | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Rusted Moss | — | ❌ 43/100 | 🔶 6/10 | ❌ | ❌ 43/100 | ❌ 43/100 | N/A |
| Sentinels of the Multiverse | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Shadow The Hedgehog | — | ❌ 8/21 | ✅ | 🔶 8/15 | 🔶 14/18 | 🔶 8/16 | N/A |
| Ship of Harkinian | — | ❌ 31/100 | ❌ 2/10 | ❌ | ❌ 30/100 | ❌ 29/100 | N/A |
| Simon Tatham's Portable Puzzle Collection | ❌ 2/10 | ⚠️ 94/94 | ✅ | ⚠️ 94/94 | ⚠️ 94/94 | ⚠️ 94/94 | N/A |
| Sly 2: Band of Thieves | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Sly Cooper and the Thievius Raccoonus | — | 🔶 89/100 | 🔶 8/10 | — | 🔶 87/100 | 🔶 89/100 | N/A |
| Sonic Adventure DX | — | ❌ 16/66 | ❌ | ❌ 16/44 | ⚠️ 39/43 | ❌ 16/47 | N/A |
| Sonic Heroes | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| Sonic Rush | — | ⚠️ 99/100 | ✅ | ❌ 26/99 | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | ⚠️ 9/10 | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Soul Blazer | — | ✅ | ✅ | 🔶 51/100 | ✅ | ✅ | N/A |
| Spinball | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Spyro 3 | — | ❌ 9/99 | ❌ 2/9 | ❌ 10/99 | ✅ | ❌ 11/99 | N/A |
| Stacklands | — | ✅ | ✅ | ✅ | ✅ | ❌ | N/A |
| Star Fox 64 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Star Wars Episode I Racer | ✅ | ❌ 4/100 | ❌ | — | ✅ | ❌ 4/100 | N/A |
| Super Cat Planet | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Symphony of the Night | ✅ | ✅ | ✅ | — | ✅ | ✅ | N/A |
| System Shock 2 | — | ❌ 42/100 | 🔶 6/9 | ❌ 6/61 | 🔶 43/60 | 🔶 40/61 | N/A |
| TCG Card Shop Simulator | — | ❌ | ❌ | ❌ 8/98 | 🔶 82/98 | ❌ | N/A |
| TOEM: A Photo Adventure | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Tetris Attack | — | ⚠️ 83/87 | ✅ | ✅ | ✅ | ❌ 2/83 | N/A |
| Tevi | ❌ | — | — | — | — | — | N/A |
| The Legend of Zelda - Oracle of Seasons | — | ❌ | ❌ | ❌ | ❌ 41/100 | ❌ | N/A |
| The Legend of Zelda - Phantom Hourglass | — | ❌ 9/100 | ❌ 3/10 | ❌ | 🔶 54/98 | ❌ 13/98 | N/A |
| The Sims 4 | — | ❌ | ❌ | ✅ | ❌ | ✅ | N/A |
| ToeJam and Earl | — | ❌ 4/100 | ❌ 1/10 | — | ✅ | ❌ 4/91 | N/A |
| TurnipBoy | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| Tyrian | — | 🔶 41/75 | ✅ | — | ⚠️ 70/71 | 🔶 39/71 | N/A |
| Vampire Survivors | ✅ | ✅ | ✅ | ✅ | ✅ | 🔶 27/48 | N/A |
| Wario Land | — | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |
| Watery Words | ✅ | ⚠️ 98/98 | ✅ | ⚠️ 96/96 | ⚠️ 98/98 | ⚠️ 98/98 | N/A |
| Wordipelago | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| XCOM 2 War of the Chosen | — | ✅ | ✅ | ❌ | ✅ | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | 🔶 6/10 | 🔶 84/100 | ✅ | ⚠️ 90/100 | ❌ 47/100 | 🔶 82/100 | N/A |
| Yu-Gi-Oh! Forbidden Memories | — | ❌ 15/100 | ❌ | ❌ 15/100 | ✅ | ❌ 18/100 | N/A |
| Zelda II: The Adventure of Link | ✅ | ❌ 12/100 | ❌ 2/10 | — | ❌ 12/100 | ❌ 12/100 | N/A |
| osu! | ✅ | ❌ 1/100 | ❌ | ✅ | ❌ 1/100 | ✅ | N/A |

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
