# Universal Tracker Fuzz Test Comparison: Worldgen vs Hybrid (APWorlds)

**Generated:** 2026-03-22 17:48:53 UTC

**Source Data Last Updated:** 2026-03-22T08:50:05

This report compares fuzz test results between the Worldgen Universal Tracker (regenerates world from rules.json) and the Hybrid Universal Tracker (worldgen with native UT preference).

[<- Back to Fuzz Summary](./test-results-fuzz-summary-apworlds.md) | [Main Test Results](./test-results-summary.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

### Individual Test Results

- [Worldgen UT Results (APWorlds)](./test-results-ut-fuzz-apworlds-worldgen.md)
- [Hybrid UT Results (APWorlds)](./test-results-ut-fuzz-apworlds-hybrid.md)

## Summary

- **Total Games Tested:** 123
- **Passing Both:** 31 (25.2%)
- **Passing Worldgen Only:** 11 (8.9%)
- **Passing Hybrid Only:** 24 (19.5%)
- **Passing Neither:** 57 (46.3%)

## Full Comparison

| Game Name | Worldgen Result | Hybrid Result | Exporter | GameLogic | Rules Size |
|-----------|:---------------------:|:---------------------:|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | ✅ | ✅ | ✅ | N/A |
| A Difficult Game About Climbing | N/A | ✅ | ✅ | ✅ | N/A |
| A Link Between Worlds | ❌ | ❌ 15/100 | ✅ | ✅ | N/A |
| ANIMAL WELL | N/A | ✅ | 1.5KB | ✅ | N/A |
| Actraiser | ✅ | ✅ | ✅ | ✅ | N/A |
| Against the Storm | ❌ | ⚠️ 64/99 | ✅ | ✅ | N/A |
| Air Delivery | ⚠️ 71/100 | ✅ | 6.6KB | ✅ | N/A |
| An Untitled Story | ✅ | ✅ | 8.7KB | ✅ | N/A |
| Anodyne | ❌ 31/100 | ✅ | 10.7KB | ✅ | N/A |
| Another Crabs Treasure | ⚠️ 55/100 | ⚠️ 51/100 | 3.1KB | ✅ | N/A |
| Ape Escape | N/A | ⚠️ 99/100 | ✅ | ✅ | N/A |
| Ape Escape 3 | ✅ | ❌ | ✅ | ✅ | N/A |
| Astalon | ❌ 1/87 | ✅ | ✅ | ✅ | N/A |
| Autopelago | N/A | ✅ | 9.2KB | ✅ | N/A |
| Axiom Verge | ✅ | ❌ | ✅ | ✅ | N/A |
| Balatro | ❌ 7/19 | ❌ 7/19 | ✅ | ✅ | N/A |
| Brotato | ✅ | ✅ | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | ✅ | ✅ | ✅ | N/A |
| Cavern of Dreams | ❌ 20/63 | ❌ 20/63 | ✅ | ✅ | N/A |
| ChecksMate | ❌ | ⚠️ 87/98 | ✅ | ✅ | N/A |
| Chrono Trigger Jets of Time | ❌ | ❌ | ✅ | ✅ | N/A |
| ClusterTruck | N/A | ⚠️ 52/100 | ✅ | ✅ | N/A |
| Corn Kidz 64 | ✅ | ❌ | ✅ | ✅ | N/A |
| CrossCode | N/A | ✅ | ✅ | ✅ | N/A |
| Crystal Project | ❌ | ❌ 28/100 | ✅ | ✅ | N/A |
| Crystalis | ⚠️ 58/61 | ⚠️ 59/61 | 9.2KB | ✅ | N/A |
| Cuphead | ❌ | ❌ | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | ✅ | ✅ | ✅ | N/A |
| Deep Rock Galactic | ⚠️ 71/100 | ❌ 35/100 | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | ✅ | ✅ | ✅ | N/A |
| Digimon World | ✅ | ❌ 1/75 | ✅ | ✅ | N/A |
| Dome Keeper | N/A | ✅ | ✅ | ✅ | N/A |
| Duke Nukem 3D | ❌ 5/95 | ❌ 2/95 | ✅ | ✅ | N/A |
| Final Fantasy Tactics A2 | N/A | ❌ 10/98 | ✅ | ✅ | N/A |
| Final Fantasy Tactics Advance | ⚠️ 78/100 | ✅ | ✅ | ✅ | N/A |
| Fire Emblem Sacred Stones | ❌ 42/97 | ❌ 39/97 | ✅ | ✅ | N/A |
| Frogmonster | ⚠️ 76/100 | ⚠️ 76/100 | ✅ | ✅ | N/A |
| GZDoom | ❌ | ❌ | ✅ | ✅ | N/A |
| Garfield Kart - Furious Racing | ❌ | ❌ | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | ✅ | ✅ | ✅ | N/A |
| Grim Dawn | ✅ | ❌ | ✅ | ✅ | N/A |
| Hammerwatch | N/A | ❌ 26/98 | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | ✅ | ✅ | ✅ | N/A |
| Here Comes Niko! | N/A | ⚠️ 61/99 | ✅ | ✅ | N/A |
| Iji | ✅ | ❌ | ✅ | ✅ | N/A |
| Into the Breach | ❌ | ❌ 45/100 | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | ✅ | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | ✅ | ✅ | ✅ | N/A |
| Jigsaw | ✅ | ✅ | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | ✅ | ✅ | ✅ | N/A |
| Keep Talking and Nobody Explodes | ✅ | ❌ 26/79 | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | N/A | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | N/A | ✅ | ✅ | ✅ | N/A |
| Kirby Super Star | ❌ 4/96 | ❌ 19/99 | ✅ | ✅ | N/A |
| League of Legends | ✅ | ✅ | ✅ | ✅ | N/A |
| Lego Star Wars: The Complete Saga | ⚠️ 69/85 | ✅ | ✅ | ✅ | N/A |
| Lil Gator Game | ❌ | ❌ | ✅ | ✅ | N/A |
| Lingo 2 | ❌ 8/17 | ❌ 8/17 | 17.1KB | ✅ | N/A |
| Little Witch Nobeta | ✅ | ✅ | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | ✅ | ✅ | ✅ | N/A |
| Lunacid | N/A | ✅ | 8.2KB | ✅ | N/A |
| Majora's Mask Recompiled | ⚠️ 89/100 | ⚠️ 89/100 | 10.4KB | ✅ | N/A |
| Mario Kart Double Dash | N/A | ✅ | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid: Zero Mission | ❌ 8/94 | ❌ 8/94 | 9.8KB | ✅ | N/A |
| Minishoot Adventures | ❌ 18/100 | ❌ 18/100 | 25.9KB | ✅ | N/A |
| Minit | ✅ | ⚠️ 75/99 | 23.9KB | ✅ | N/A |
| Monster Sanctuary | ❌ | ❌ 20/100 | ✅ | ✅ | N/A |
| Nine Sols | ✅ | ✅ | ✅ | ✅ | N/A |
| Ori and the Blind Forest | N/A | ✅ | 23.2KB | ✅ | N/A |
| Ori and the Will of the Wisps | ❌ | ❌ 19/72 | ✅ | ✅ | N/A |
| Oxygen Not Included | N/A | ⚠️ 64/91 | ✅ | ✅ | N/A |
| Pizza Tower | ⚠️ 49/86 | ⚠️ 49/86 | 7.0KB | ✅ | N/A |
| PlateUp | ⚠️ 45/59 | ❌ 5/65 | ✅ | ✅ | N/A |
| Pokemon FireRed and LeafGreen | ⚠️ 80/100 | ⚠️ 80/100 | ✅ | ✅ | N/A |
| Pokemon Mystery Dungeon Explorers of Sky | ❌ | ⚠️ 78/100 | ✅ | ✅ | N/A |
| Pseudoregalia | ❌ | ✅ | 17.1KB | ✅ | N/A |
| Rabi-Ribi | ⚠️ 50/63 | ⚠️ 50/63 | ✅ | ✅ | N/A |
| Rain World | ✅ | ✅ | 11.8KB | ✅ | N/A |
| Ratchet & Clank 2 | N/A | ✅ | ✅ | ✅ | N/A |
| Reventure | ❌ | ✅ | ✅ | ✅ | N/A |
| Rift Wizard | N/A | ✅ | 7.7KB | ✅ | N/A |
| Rift of the Necrodancer | ✅ | ✅ | ✅ | ✅ | N/A |
| Rusted Moss | ❌ | ❌ 43/100 | ✅ | ✅ | N/A |
| Sentinels of the Multiverse | ❌ | ❌ | ✅ | ✅ | N/A |
| Shadow The Hedgehog | ⚠️ 8/15 | ⚠️ 8/16 | ✅ | ✅ | N/A |
| Ship of Harkinian | ❌ | ❌ 29/100 | ✅ | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ✅ | ✅ | ✅ | ✅ | N/A |
| Sly 2: Band of Thieves | ❌ | ❌ | ✅ | ✅ | N/A |
| Sly Cooper and the Thievius Raccoonus | N/A | ⚠️ 89/100 | ✅ | ✅ | N/A |
| Sonic Adventure DX | ❌ 16/44 | ❌ 16/47 | 29.9KB | ✅ | N/A |
| Sonic Heroes | N/A | ✅ | ✅ | ✅ | N/A |
| Sonic Rush | ❌ 26/99 | ✅ | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | ✅ | ✅ | 9.4KB | ✅ | N/A |
| Soul Blazer | ⚠️ 51/100 | ✅ | 10.5KB | ✅ | N/A |
| Spinball | ✅ | ✅ | ✅ | ✅ | N/A |
| Spyro 3 | ❌ 10/99 | ❌ 11/99 | 15.3KB | ✅ | N/A |
| Stacklands | ✅ | ❌ | 12.7KB | ✅ | N/A |
| Star Fox 64 | ✅ | ✅ | 17.2KB | ✅ | N/A |
| Star Wars Episode I Racer | N/A | ❌ 4/100 | 5.7KB | ✅ | N/A |
| Super Cat Planet | ✅ | ✅ | ✅ | ✅ | N/A |
| Symphony of the Night | N/A | ✅ | ✅ | ✅ | N/A |
| System Shock 2 | ❌ 6/61 | ⚠️ 40/61 | 15.1KB | ✅ | N/A |
| TCG Card Shop Simulator | ❌ 8/98 | ❌ | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | ✅ | ✅ | ✅ | N/A |
| Tetris Attack | ✅ | ❌ 2/83 | 23.1KB | ✅ | N/A |
| The Legend of Zelda - Oracle of Seasons | ❌ | ❌ | ✅ | ✅ | N/A |
| The Legend of Zelda - Phantom Hourglass | ❌ | ❌ 13/98 | ✅ | ✅ | N/A |
| The Sims 4 | ✅ | ✅ | 5.5KB | ✅ | N/A |
| ToeJam and Earl | N/A | ❌ 4/91 | ✅ | ✅ | N/A |
| TurnipBoy | ✅ | ✅ | ✅ | ✅ | N/A |
| Tyrian | N/A | ⚠️ 39/71 | ✅ | ✅ | N/A |
| Vampire Survivors | ✅ | ⚠️ 27/48 | ✅ | ✅ | N/A |
| Wario Land | ❌ | ❌ | ✅ | ✅ | N/A |
| Watery Words | ✅ | ✅ | 9.1KB | ✅ | N/A |
| Wordipelago | ✅ | ✅ | 19.5KB | ✅ | N/A |
| XCOM 2 War of the Chosen | ❌ | ✅ | ✅ | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | ⚠️ 90/100 | ⚠️ 82/100 | 28.8KB | ✅ | N/A |
| Yu-Gi-Oh! Forbidden Memories | ❌ 15/100 | ❌ 18/100 | ✅ | ✅ | N/A |
| Zelda II: The Adventure of Link | N/A | ❌ 12/100 | ✅ | ✅ | N/A |
| osu! | ✅ | ✅ | ✅ | ✅ | N/A |

## Games Passing Both (31)

These games have 100% success rate in both Universal Tracker versions.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | ✅ | N/A |
| Actraiser | ✅ | ✅ | N/A |
| An Untitled Story | 8.7KB | ✅ | N/A |
| Brotato | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | ✅ | N/A |
| Jigsaw | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | ✅ | N/A |
| League of Legends | ✅ | ✅ | N/A |
| Little Witch Nobeta | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | ✅ | N/A |
| Nine Sols | ✅ | ✅ | N/A |
| Rain World | 11.8KB | ✅ | N/A |
| Rift of the Necrodancer | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | 9.4KB | ✅ | N/A |
| Spinball | ✅ | ✅ | N/A |
| Star Fox 64 | 17.2KB | ✅ | N/A |
| Super Cat Planet | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | ✅ | N/A |
| The Sims 4 | 5.5KB | ✅ | N/A |
| TurnipBoy | ✅ | ✅ | N/A |
| Wordipelago | 19.5KB | ✅ | N/A |
| osu! | ✅ | ✅ | N/A |

## Games Passing Worldgen Only (11)

These games pass in the Worldgen UT but fail in the Hybrid UT.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| Ape Escape 3 | ✅ | ✅ | N/A |
| Axiom Verge | ✅ | ✅ | N/A |
| Corn Kidz 64 | ✅ | ✅ | N/A |
| Digimon World | ✅ | ✅ | N/A |
| Grim Dawn | ✅ | ✅ | N/A |
| Iji | ✅ | ✅ | N/A |
| Keep Talking and Nobody Explodes | ✅ | ✅ | N/A |
| Minit | 23.9KB | ✅ | N/A |
| Stacklands | 12.7KB | ✅ | N/A |
| Tetris Attack | 23.1KB | ✅ | N/A |
| Vampire Survivors | ✅ | ✅ | N/A |

## Games Passing Hybrid Only (24)

These games pass in the Hybrid UT but fail in the Worldgen UT.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| A Difficult Game About Climbing | ✅ | ✅ | N/A |
| ANIMAL WELL | 1.5KB | ✅ | N/A |
| Air Delivery | 6.6KB | ✅ | N/A |
| Anodyne | 10.7KB | ✅ | N/A |
| Astalon | ✅ | ✅ | N/A |
| Autopelago | 9.2KB | ✅ | N/A |
| CrossCode | ✅ | ✅ | N/A |
| Dome Keeper | ✅ | ✅ | N/A |
| Final Fantasy Tactics Advance | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | ✅ | N/A |
| Lego Star Wars: The Complete Saga | ✅ | ✅ | N/A |
| Lunacid | 8.2KB | ✅ | N/A |
| Mario Kart Double Dash | ✅ | ✅ | N/A |
| Ori and the Blind Forest | 23.2KB | ✅ | N/A |
| Pseudoregalia | 17.1KB | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | ✅ | N/A |
| Reventure | ✅ | ✅ | N/A |
| Rift Wizard | 7.7KB | ✅ | N/A |
| Sonic Heroes | ✅ | ✅ | N/A |
| Sonic Rush | ✅ | ✅ | N/A |
| Soul Blazer | 10.5KB | ✅ | N/A |
| Symphony of the Night | ✅ | ✅ | N/A |
| XCOM 2 War of the Chosen | ✅ | ✅ | N/A |

## Games Passing Neither (57)

These games fail in both Universal Tracker versions.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| A Link Between Worlds | ✅ | ✅ | N/A |
| Against the Storm | ✅ | ✅ | N/A |
| Another Crabs Treasure | 3.1KB | ✅ | N/A |
| Ape Escape | ✅ | ✅ | N/A |
| Balatro | ✅ | ✅ | N/A |
| Cavern of Dreams | ✅ | ✅ | N/A |
| ChecksMate | ✅ | ✅ | N/A |
| Chrono Trigger Jets of Time | ✅ | ✅ | N/A |
| ClusterTruck | ✅ | ✅ | N/A |
| Crystal Project | ✅ | ✅ | N/A |
| Crystalis | 9.2KB | ✅ | N/A |
| Cuphead | ✅ | ✅ | N/A |
| Deep Rock Galactic | ✅ | ✅ | N/A |
| Duke Nukem 3D | ✅ | ✅ | N/A |
| Final Fantasy Tactics A2 | ✅ | ✅ | N/A |
| Fire Emblem Sacred Stones | ✅ | ✅ | N/A |
| Frogmonster | ✅ | ✅ | N/A |
| GZDoom | ✅ | ✅ | N/A |
| Garfield Kart - Furious Racing | ✅ | ✅ | N/A |
| Hammerwatch | ✅ | ✅ | N/A |
| Here Comes Niko! | ✅ | ✅ | N/A |
| Into the Breach | ✅ | ✅ | N/A |
| Kirby Super Star | ✅ | ✅ | N/A |
| Lil Gator Game | ✅ | ✅ | N/A |
| Lingo 2 | 17.1KB | ✅ | N/A |
| Majora's Mask Recompiled | 10.4KB | ✅ | N/A |
| Metroid: Zero Mission | 9.8KB | ✅ | N/A |
| Minishoot Adventures | 25.9KB | ✅ | N/A |
| Monster Sanctuary | ✅ | ✅ | N/A |
| Ori and the Will of the Wisps | ✅ | ✅ | N/A |
| Oxygen Not Included | ✅ | ✅ | N/A |
| Pizza Tower | 7.0KB | ✅ | N/A |
| PlateUp | ✅ | ✅ | N/A |
| Pokemon FireRed and LeafGreen | ✅ | ✅ | N/A |
| Pokemon Mystery Dungeon Explorers of Sky | ✅ | ✅ | N/A |
| Rabi-Ribi | ✅ | ✅ | N/A |
| Rusted Moss | ✅ | ✅ | N/A |
| Sentinels of the Multiverse | ✅ | ✅ | N/A |
| Shadow The Hedgehog | ✅ | ✅ | N/A |
| Ship of Harkinian | ✅ | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ✅ | ✅ | N/A |
| Sly 2: Band of Thieves | ✅ | ✅ | N/A |
| Sly Cooper and the Thievius Raccoonus | ✅ | ✅ | N/A |
| Sonic Adventure DX | 29.9KB | ✅ | N/A |
| Spyro 3 | 15.3KB | ✅ | N/A |
| Star Wars Episode I Racer | 5.7KB | ✅ | N/A |
| System Shock 2 | 15.1KB | ✅ | N/A |
| TCG Card Shop Simulator | ✅ | ✅ | N/A |
| The Legend of Zelda - Oracle of Seasons | ✅ | ✅ | N/A |
| The Legend of Zelda - Phantom Hourglass | ✅ | ✅ | N/A |
| ToeJam and Earl | ✅ | ✅ | N/A |
| Tyrian | ✅ | ✅ | N/A |
| Wario Land | ✅ | ✅ | N/A |
| Watery Words | 9.1KB | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | 28.8KB | ✅ | N/A |
| Yu-Gi-Oh! Forbidden Memories | ✅ | ✅ | N/A |
| Zelda II: The Adventure of Link | ✅ | ✅ | N/A |

## Notes

- **Worldgen Result:** ✅ if all runs passed, ❌ if none passed, or passes/total as a fraction (success/failure only, excludes timeouts and ignored)
- **Hybrid Result:** ✅ if all runs passed, ❌ if none passed, or passes/total as a fraction (success/failure only, excludes timeouts and ignored)
- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script
- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files
- **Rules Size:** File size of rules.json for seed 1 (N/A if not generated)
- A game is considered "passing" if it has a 100% success rate (0 failures, 0 timeouts)
