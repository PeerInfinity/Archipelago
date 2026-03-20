# Universal Tracker Fuzz Test Comparison: Worldgen vs Hybrid (APWorlds)

**Generated:** 2026-02-19 21:59:55 UTC

**Source Data Last Updated:** 2026-01-24T05:05:20

This report compares fuzz test results between the Worldgen Universal Tracker (regenerates world from rules.json) and the Hybrid Universal Tracker (worldgen with native UT preference).

[<- Back to Fuzz Summary](./test-results-fuzz-summary-apworlds.md) | [Main Test Results](./test-results-summary.md)

[📖 Learn about fuzz tests](../tests/test-fuzz.md)

### Individual Test Results

- [Worldgen UT Results (APWorlds)](./test-results-ut-fuzz-apworlds-worldgen.md)
- [Hybrid UT Results (APWorlds)](./test-results-ut-fuzz-apworlds-hybrid.md)

## Summary

- **Total Games Tested:** 124
- **Passing Both:** 49 (39.5%)
- **Passing Worldgen Only:** 1 (0.8%)
- **Passing Hybrid Only:** 25 (20.2%)
- **Passing Neither:** 49 (39.5%)

## Full Comparison

| Game Name | Worldgen Result | Hybrid Result | Exporter | GameLogic | Rules Size |
|-----------|:---------------------:|:---------------------:|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | ✅ | ✅ | ✅ | N/A |
| A Difficult Game About Climbing | ✅ | ✅ | ✅ | ✅ | N/A |
| A Link Between Worlds | ❌ | ❌ 2/10 | ✅ | ✅ | N/A |
| ANIMAL WELL | ❌ 3/9 | ✅ | 1.5KB | ✅ | N/A |
| Actraiser | ✅ | ✅ | ✅ | ✅ | N/A |
| Against the Storm | ❌ | ❌ | ✅ | ✅ | N/A |
| Air Delivery | ❌ 4/10 | ✅ | 6.6KB | ✅ | N/A |
| An Untitled Story | ✅ | ✅ | 8.7KB | ✅ | N/A |
| Anodyne | ❌ 1/10 | ✅ | 10.7KB | ✅ | N/A |
| Another Crabs Treasure | ✅ | ✅ | 3.1KB | ✅ | N/A |
| Ape Escape | ⚠️ 6/10 | ✅ | ✅ | ✅ | N/A |
| Ape Escape 3 | ❌ | ❌ 4/10 | ✅ | ✅ | N/A |
| Astalon | ❌ | ⚠️ 5/8 | ✅ | ✅ | N/A |
| Autopelago | ✅ | ✅ | 9.2KB | ✅ | N/A |
| Axiom Verge | ❌ | ✅ | ✅ | ✅ | N/A |
| Balatro | ❌ | ❌ | ✅ | ✅ | N/A |
| Brotato | ✅ | ✅ | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | ✅ | ✅ | ✅ | N/A |
| Cavern of Dreams | ❌ | ❌ 2/8 | ✅ | ✅ | N/A |
| ChecksMate | ❌ | ⚠️ 9/10 | ✅ | ✅ | N/A |
| Chrono Trigger Jets of Time | ❌ | ❌ | ✅ | ✅ | N/A |
| ClusterTruck | ❌ 3/10 | ❌ 3/10 | ✅ | ✅ | N/A |
| Corn Kidz 64 | ❌ | ✅ | ✅ | ✅ | N/A |
| CrossCode | ❌ | ✅ | ✅ | ✅ | N/A |
| Crystal Project | ❌ | ❌ 3/10 | ✅ | ✅ | N/A |
| Crystalis | ❌ | ✅ | 9.2KB | ✅ | N/A |
| Cuphead | ✅ | ✅ | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | ✅ | ✅ | ✅ | N/A |
| Deep Rock Galactic | ⚠️ 5/10 | ❌ | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | ✅ | ✅ | ✅ | N/A |
| Digimon World | ❌ | ✅ | ✅ | ✅ | N/A |
| Dome Keeper | ✅ | ✅ | ✅ | ✅ | N/A |
| Duke Nukem 3D | ❌ 1/9 | ❌ 1/9 | ✅ | ✅ | N/A |
| Final Fantasy Tactics A2 | ❌ | ❌ | ✅ | ✅ | N/A |
| Final Fantasy Tactics Advance | ⚠️ 9/10 | ✅ | ✅ | ✅ | N/A |
| Fire Emblem Sacred Stones | ❌ | ❌ 3/10 | ✅ | ✅ | N/A |
| Frogmonster | ❌ | ✅ | ✅ | ✅ | N/A |
| GZDoom | ❌ | ❌ | ✅ | ✅ | N/A |
| Garfield Kart - Furious Racing | ❌ | ❌ | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | ✅ | ✅ | ✅ | N/A |
| Grim Dawn | ⚠️ 6/9 | ⚠️ 7/9 | ✅ | ✅ | N/A |
| Hammerwatch | ⚠️ 5/9 | ❌ 4/9 | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | ✅ | ✅ | ✅ | N/A |
| Here Comes Niko! | ✅ | ✅ | ✅ | ✅ | N/A |
| Iji | ❌ | ✅ | ✅ | ✅ | N/A |
| Into the Breach | ❌ | ❌ 2/10 | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | ✅ | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | ✅ | ✅ | ✅ | N/A |
| Jigsaw | ✅ | ✅ | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | ✅ | ✅ | ✅ | N/A |
| Keep Talking and Nobody Explodes | ❌ | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | ✅ | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | ✅ | ✅ | ✅ | N/A |
| Kirby Super Star | ✅ | ✅ | ✅ | ✅ | N/A |
| League of Legends | ✅ | ✅ | ✅ | ✅ | N/A |
| Lego Star Wars: The Complete Saga | ⚠️ 8/9 | ✅ | ✅ | ✅ | N/A |
| Lil Gator Game | ✅ | ✅ | ✅ | ✅ | N/A |
| Lingo 2 | ❌ | ✅ | 17.1KB | ✅ | N/A |
| Little Witch Nobeta | ✅ | ✅ | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | ✅ | ✅ | ✅ | N/A |
| Lunacid | ❌ 3/10 | ❌ 1/10 | 8.2KB | ✅ | N/A |
| Majora's Mask Recompiled | ❌ 4/10 | ✅ | 10.4KB | ✅ | N/A |
| Mario Kart Double Dash | ❌ | ✅ | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | ✅ | ✅ | ✅ | N/A |
| Metroid Zero Mission | ❌ | ✅ | 9.7KB | ✅ | N/A |
| Minishoot Adventures | ❌ 4/10 | ❌ | 25.9KB | ✅ | N/A |
| Minit | ⚠️ 6/10 | ✅ | 23.9KB | ✅ | N/A |
| Monster Sanctuary | ❌ | ❌ 3/10 | ✅ | ✅ | N/A |
| Nine Sols | ❌ | ❌ 3/8 | ✅ | ✅ | N/A |
| Ori and the Blind Forest | ⚠️ 6/10 | ✅ | 23.2KB | ✅ | N/A |
| Ori and the Will of the Wisps | ❌ | ❌ 3/8 | ✅ | ✅ | N/A |
| Oxygen Not Included | ⚠️ 8/9 | ⚠️ 8/9 | ✅ | ✅ | N/A |
| Pizza Tower | ✅ | ⚠️ 6/10 | 7.0KB | ✅ | N/A |
| Pokemon FireRed and LeafGreen | ❌ | ⚠️ 9/10 | ✅ | ✅ | N/A |
| Pokemon Mystery Dungeon Explorers of Sky | ❌ | ⚠️ 8/10 | ✅ | ✅ | N/A |
| Pseudoregalia | ❌ | ✅ | 17.1KB | ✅ | N/A |
| Rabi-Ribi | ❌ | ⚠️ 3/4 | ✅ | ✅ | N/A |
| Rain World | ✅ | ✅ | 11.7KB | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | ✅ | ✅ | ✅ | N/A |
| Reventure | ❌ | ✅ | ✅ | ✅ | N/A |
| Rift Wizard | ✅ | ✅ | 7.7KB | ✅ | N/A |
| Rift of the Necrodancer | ⚠️ 3/6 | ⚠️ 3/6 | ✅ | ✅ | N/A |
| Rusted Moss | ❌ | ⚠️ 6/10 | ✅ | ✅ | N/A |
| Sentinels of the Multiverse | ❌ | ❌ | ✅ | ✅ | N/A |
| Shadow The Hedgehog | ❌ | ✅ | ✅ | ✅ | N/A |
| Ship of Harkinian | ❌ | ❌ 2/10 | ✅ | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ✅ | ✅ | ✅ | ✅ | N/A |
| Sly 2: Band of Thieves | ❌ | ❌ | ✅ | ✅ | N/A |
| Sly Cooper and the Thievius Raccoonus | ⚠️ 8/10 | ⚠️ 8/10 | ✅ | ✅ | N/A |
| Sonic Adventure DX | ❌ | ❌ | 29.9KB | ✅ | N/A |
| Sonic Heroes | ✅ | ✅ | ✅ | ✅ | N/A |
| Sonic Rush | ❌ 4/10 | ✅ | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | ✅ | ✅ | 9.4KB | ✅ | N/A |
| Soul Blazer | ⚠️ 8/10 | ✅ | 10.6KB | ✅ | N/A |
| Spinball | ✅ | ✅ | ✅ | ✅ | N/A |
| Spyro 3 | ❌ | ❌ 3/8 | 15.2KB | ✅ | N/A |
| Stacklands | ❌ | ⚠️ 9/10 | 12.7KB | ✅ | N/A |
| Star Fox 64 | ✅ | ✅ | 17.1KB | ✅ | N/A |
| Star Wars Episode I Racer | ✅ | ✅ | 5.7KB | ✅ | N/A |
| Super Cat Planet | ✅ | ✅ | ✅ | ✅ | N/A |
| Symphony of the Night | ✅ | ✅ | ✅ | ✅ | N/A |
| System Shock 2 | ❌ | ⚠️ 6/9 | 15.0KB | ✅ | N/A |
| TCG Card Shop Simulator | ❌ | ❌ | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | ✅ | ✅ | ✅ | N/A |
| Tetris Attack | ❌ | ✅ | 23.1KB | ✅ | N/A |
| Tevi | ✅ | ✅ | ✅ | ✅ | N/A |
| The Legend of Zelda - Oracle of Seasons | ❌ | ❌ 2/10 | ✅ | ✅ | N/A |
| The Legend of Zelda - Phantom Hourglass | ❌ | ❌ | ✅ | ✅ | N/A |
| The Sims 4 | ✅ | ✅ | 5.5KB | ✅ | N/A |
| ToeJam and Earl | ❌ | N/A | N/A | N/A | N/A |
| TurnipBoy | ✅ | ✅ | ✅ | ✅ | N/A |
| Tyrian | ⚠️ 3/6 | ⚠️ 5/6 | ✅ | ✅ | N/A |
| Vampire Survivors | ✅ | ✅ | ✅ | ✅ | N/A |
| Wario Land | ❌ | ❌ | ✅ | ✅ | N/A |
| Watery Words | ✅ | ✅ | 9.1KB | ✅ | N/A |
| Wordipelago | ✅ | ✅ | 19.5KB | ✅ | N/A |
| XCOM 2 War of the Chosen | ❌ | N/A | ✅ | ✅ | N/A |
| Yu-Gi-Oh! Dungeon Dice Monsters | ✅ | ❌ | 28.7KB | ✅ | N/A |
| Yu-Gi-Oh! Forbidden Memories | ❌ | ❌ | ✅ | ✅ | N/A |
| Zelda II: The Adventure of Link | ✅ | ✅ | ✅ | ✅ | N/A |
| osu! | ✅ | ✅ | ✅ | ✅ | N/A |
| plateup | ⚠️ 8/9 | ❌ 2/9 | ✅ | ✅ | N/A |

## Games Passing Both (49)

These games have 100% success rate in both Universal Tracker versions.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| A Dance of Fire and Ice | ✅ | ✅ | N/A |
| A Difficult Game About Climbing | ✅ | ✅ | N/A |
| Actraiser | ✅ | ✅ | N/A |
| An Untitled Story | 8.7KB | ✅ | N/A |
| Another Crabs Treasure | 3.1KB | ✅ | N/A |
| Autopelago | 9.2KB | ✅ | N/A |
| Brotato | ✅ | ✅ | N/A |
| Castlevania: Dawn of Sorrow | ✅ | ✅ | N/A |
| Cuphead | ✅ | ✅ | N/A |
| DORONKO WANKO | ✅ | ✅ | N/A |
| Diddy Kong Racing | ✅ | ✅ | N/A |
| Dome Keeper | ✅ | ✅ | N/A |
| Golden Sun The Lost Age | ✅ | ✅ | N/A |
| Hatsune Miku Project Diva Mega Mix+ | ✅ | ✅ | N/A |
| Here Comes Niko! | ✅ | ✅ | N/A |
| Isles Of Sea And Sky | ✅ | ✅ | N/A |
| Ittle Dew 2 | ✅ | ✅ | N/A |
| Jigsaw | 1.6KB | ✅ | N/A |
| K-On! After School Live!! | ✅ | ✅ | N/A |
| Kingdom Hearts Birth by Sleep | ✅ | ✅ | N/A |
| Kingdom Hearts Chain of Memories | ✅ | ✅ | N/A |
| Kingdom Hearts RE Chain of Memories | ✅ | ✅ | N/A |
| Kirby Super Star | ✅ | ✅ | N/A |
| League of Legends | ✅ | ✅ | N/A |
| Lil Gator Game | ✅ | ✅ | N/A |
| Little Witch Nobeta | ✅ | ✅ | N/A |
| Luigi's Mansion | ✅ | ✅ | N/A |
| MetroCUBEvania | ✅ | ✅ | N/A |
| Metroid Fusion | ✅ | ✅ | N/A |
| Rain World | 11.7KB | ✅ | N/A |
| Ratchet & Clank 2 | ✅ | ✅ | N/A |
| Rift Wizard | 7.7KB | ✅ | N/A |
| Simon Tatham's Portable Puzzle Collection | ✅ | ✅ | N/A |
| Sonic Heroes | ✅ | ✅ | N/A |
| Sonic the Hedgehog 1 | 9.4KB | ✅ | N/A |
| Spinball | ✅ | ✅ | N/A |
| Star Fox 64 | 17.1KB | ✅ | N/A |
| Star Wars Episode I Racer | 5.7KB | ✅ | N/A |
| Super Cat Planet | ✅ | ✅ | N/A |
| Symphony of the Night | ✅ | ✅ | N/A |
| TOEM: A Photo Adventure | ✅ | ✅ | N/A |
| Tevi | ✅ | ✅ | N/A |
| The Sims 4 | 5.5KB | ✅ | N/A |
| TurnipBoy | ✅ | ✅ | N/A |
| Vampire Survivors | ✅ | ✅ | N/A |
| Watery Words | 9.1KB | ✅ | N/A |
| Wordipelago | 19.5KB | ✅ | N/A |
| Zelda II: The Adventure of Link | ✅ | ✅ | N/A |
| osu! | ✅ | ✅ | N/A |

## Games Passing Worldgen Only (1)

These games pass in the Worldgen UT but fail in the Hybrid UT.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| Yu-Gi-Oh! Dungeon Dice Monsters | 28.7KB | ✅ | N/A |

## Games Passing Hybrid Only (25)

These games pass in the Hybrid UT but fail in the Worldgen UT.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| ANIMAL WELL | 1.5KB | ✅ | N/A |
| Air Delivery | 6.6KB | ✅ | N/A |
| Anodyne | 10.7KB | ✅ | N/A |
| Ape Escape | ✅ | ✅ | N/A |
| Axiom Verge | ✅ | ✅ | N/A |
| Corn Kidz 64 | ✅ | ✅ | N/A |
| CrossCode | ✅ | ✅ | N/A |
| Crystalis | 9.2KB | ✅ | N/A |
| Digimon World | ✅ | ✅ | N/A |
| Final Fantasy Tactics Advance | ✅ | ✅ | N/A |
| Frogmonster | ✅ | ✅ | N/A |
| Iji | ✅ | ✅ | N/A |
| Keep Talking and Nobody Explodes | ✅ | ✅ | N/A |
| Lego Star Wars: The Complete Saga | ✅ | ✅ | N/A |
| Majora's Mask Recompiled | 10.4KB | ✅ | N/A |
| Mario Kart Double Dash | ✅ | ✅ | N/A |
| Metroid Zero Mission | 9.7KB | ✅ | N/A |
| Minit | 23.9KB | ✅ | N/A |
| Ori and the Blind Forest | 23.2KB | ✅ | N/A |
| Pseudoregalia | 17.1KB | ✅ | N/A |
| Reventure | ✅ | ✅ | N/A |
| Shadow The Hedgehog | ✅ | ✅ | N/A |
| Sonic Rush | ✅ | ✅ | N/A |
| Soul Blazer | 10.6KB | ✅ | N/A |
| Tetris Attack | 23.1KB | ✅ | N/A |

## Games Passing Neither (49)

These games fail in both Universal Tracker versions.

| Game Name | Exporter | GameLogic | Rules Size |
|-----------|:--------:|:---------:|:----------:|
| A Link Between Worlds | ✅ | ✅ | N/A |
| Against the Storm | ✅ | ✅ | N/A |
| Ape Escape 3 | ✅ | ✅ | N/A |
| Astalon | ✅ | ✅ | N/A |
| Balatro | ✅ | ✅ | N/A |
| Cavern of Dreams | ✅ | ✅ | N/A |
| ChecksMate | ✅ | ✅ | N/A |
| Chrono Trigger Jets of Time | ✅ | ✅ | N/A |
| ClusterTruck | ✅ | ✅ | N/A |
| Crystal Project | ✅ | ✅ | N/A |
| Deep Rock Galactic | ✅ | ✅ | N/A |
| Duke Nukem 3D | ✅ | ✅ | N/A |
| Final Fantasy Tactics A2 | ✅ | ✅ | N/A |
| Fire Emblem Sacred Stones | ✅ | ✅ | N/A |
| GZDoom | ✅ | ✅ | N/A |
| Garfield Kart - Furious Racing | ✅ | ✅ | N/A |
| Grim Dawn | ✅ | ✅ | N/A |
| Hammerwatch | ✅ | ✅ | N/A |
| Into the Breach | ✅ | ✅ | N/A |
| Lingo 2 | 17.1KB | ✅ | N/A |
| Lunacid | 8.2KB | ✅ | N/A |
| Minishoot Adventures | 25.9KB | ✅ | N/A |
| Monster Sanctuary | ✅ | ✅ | N/A |
| Nine Sols | ✅ | ✅ | N/A |
| Ori and the Will of the Wisps | ✅ | ✅ | N/A |
| Oxygen Not Included | ✅ | ✅ | N/A |
| Pizza Tower | 7.0KB | ✅ | N/A |
| Pokemon FireRed and LeafGreen | ✅ | ✅ | N/A |
| Pokemon Mystery Dungeon Explorers of Sky | ✅ | ✅ | N/A |
| Rabi-Ribi | ✅ | ✅ | N/A |
| Rift of the Necrodancer | ✅ | ✅ | N/A |
| Rusted Moss | ✅ | ✅ | N/A |
| Sentinels of the Multiverse | ✅ | ✅ | N/A |
| Ship of Harkinian | ✅ | ✅ | N/A |
| Sly 2: Band of Thieves | ✅ | ✅ | N/A |
| Sly Cooper and the Thievius Raccoonus | ✅ | ✅ | N/A |
| Sonic Adventure DX | 29.9KB | ✅ | N/A |
| Spyro 3 | 15.2KB | ✅ | N/A |
| Stacklands | 12.7KB | ✅ | N/A |
| System Shock 2 | 15.0KB | ✅ | N/A |
| TCG Card Shop Simulator | ✅ | ✅ | N/A |
| The Legend of Zelda - Oracle of Seasons | ✅ | ✅ | N/A |
| The Legend of Zelda - Phantom Hourglass | ✅ | ✅ | N/A |
| ToeJam and Earl | N/A | N/A | N/A |
| Tyrian | ✅ | ✅ | N/A |
| Wario Land | ✅ | ✅ | N/A |
| XCOM 2 War of the Chosen | ✅ | ✅ | N/A |
| Yu-Gi-Oh! Forbidden Memories | ✅ | ✅ | N/A |
| plateup | ✅ | ✅ | N/A |

## Notes

- **Worldgen Result:** ✅ if all runs passed, ❌ if none passed, or passes/total as a fraction (success/failure only, excludes timeouts and ignored)
- **Hybrid Result:** ✅ if all runs passed, ❌ if none passed, or passes/total as a fraction (success/failure only, excludes timeouts and ignored)
- **Exporter:** ✅ Uses generic exporter, or shows file size of custom Python exporter script
- **GameLogic:** ✅ Uses generic logic, or shows total size of custom JavaScript game logic files
- **Rules Size:** File size of rules.json for seed 1 (N/A if not generated)
- A game is considered "passing" if it has a 100% success rate (0 failures, 0 timeouts)
