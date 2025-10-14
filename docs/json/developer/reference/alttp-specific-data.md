# ALTTP-Specific Snapshot and Static Data Extensions

This document details the additional data that is added to snapshots and staticData specifically for "A Link to the Past" (ALTTP). ALTTP is one of the most complex games in the Archipelago system, with extensive custom logic and state management.

## Overview

ALTTP extends the standard snapshot and staticData structures in three ways:
1. **Runtime State Extensions**: Additional properties added to snapshots via `gameStateModule`
2. **Static Data Extensions**: Additional settings and configuration in staticData
3. **Export-Time Enhancements**: Data transformations and additions made by the custom exporter

---

## Snapshot Extensions

ALTTP adds the following properties to snapshots through the `gameStateModule` (see `frontend/modules/shared/gameLogic/alttp/alttpLogic.js:1323-1552`).

### `difficultyRequirements` (Object)

**Type**: `Object`
**Source**: `snapshot.difficultyRequirements` (from `gameStateModule`)
**Description**: Contains limits on progressive item upgrades based on difficulty settings.

**Properties**:
- **`progressive_bottle_limit`** (number): Maximum number of bottles that can be obtained
  - Default: 4
  - Set from `__max_progressive_bottle` in itempool (line 434 in stateManager.js)
  - Used by `bottle_count()` helper to cap effective bottle count

- **`boss_heart_container_limit`** (number): Maximum boss heart containers that count toward health
  - Default: 10
  - Set from `__max_boss_heart_container` in itempool (line 438 in stateManager.js)
  - Used by `heart_count()` helper to calculate total hearts

- **`heart_piece_limit`** (number): Maximum heart pieces that count toward health
  - Default: 24
  - Set from `__max_heart_piece` in itempool (line 442 in stateManager.js)
  - Used by `heart_count()` helper (4 pieces = 1 heart)

**Example**:
```javascript
{
  progressive_bottle_limit: 4,
  boss_heart_container_limit: 10,
  heart_piece_limit: 24
}
```

### `requiredMedallions` (Array<string>)

**Type**: `Array<string>`
**Source**: `snapshot.requiredMedallions` (from `gameStateModule`)
**Description**: List of medallions required to enter Misery Mire and Turtle Rock.

**Default**: `['Ether', 'Quake']`
**Possible Values**: Any combination of `'Ether'`, `'Quake'`, `'Bombos'`

**Usage**: Determines which medallions are needed for dungeon access. Index 0 is Misery Mire, index 1 is Turtle Rock.

### `shops` (Array<Object>)

**Type**: `Array<Object>`
**Source**: `snapshot.shops` (from `gameStateModule`)
**Description**: Array of shop data objects containing shop inventory and pricing information.

**Structure**: Game-specific, varies by shop configuration. Used by helper functions like `can_buy()` and `can_buy_unlimited()`.

### `treasureHuntRequired` (number)

**Type**: `number`
**Source**: `snapshot.treasureHuntRequired` (from `gameStateModule`)
**Description**: Number of Triforce Pieces or Power Stars required to complete triforce hunt goal.

**Default**: 20
**Usage**: Used by `has_triforce_pieces()` helper to determine if victory condition is met.

### `flags` (Array<string>)

**Type**: `Array<string>`
**Source**: `snapshot.flags` (from `gameStateModule`)
**Description**: Array of game-specific configuration flags that affect logic evaluation.

**Common Flags**:
- `'bombless_start'`: Player starts without bombs (requires acquiring bomb capacity)
- `'retro_bow'`: Must buy arrows from shops (arrows not automatically obtained with bow)
- `'swordless'`: No swords in item pool (hammer becomes primary weapon)
- `'enemy_shuffle'`: Enemies are randomized (affects combat logic)

**Source in Code**: Set during `loadSettings()` in alttpStateModule (alttpLogic.js:1378-1389)

### `events` (Array<string>)

**Type**: `Array<string>`
**Source**: `snapshot.events` (from `gameStateModule`)
**Description**: Array of story progression events that have occurred.

**Event Types**:

**Boss Defeats**:
- `'Beat Agahnim 1'`: First Agahnim defeated at Castle Tower
- `'Beat Agahnim 2'`: Second Agahnim defeated at Ganon's Tower

**Dungeon Prizes**:
- `'Crystal 1'` through `'Crystal 7'`: Crystal obtained from dungeon boss
- `'Red Pendant'`, `'Blue Pendant'`, `'Green Pendant'`: Pendants from first three dungeons

**Story Events**:
- `'Open Floodgate'`: Floodgate opened (affects Dam access)
- `'Get Frog'`: Frog obtained (leads to Smithy quest)
- `'Pick Up Purple Chest'`: Purple Chest collected
- `'Return Smith'`: Smithy returned home (enables sword tempering)

**Flute Events**:
- `'Shovel'`: Shovel obtained
- `'Flute'`: Flute obtained (inactive)
- `'Activated Flute'`: Flute activated (can fast travel)

**Usage**: Events are checked by `has()` helper and affect accessibility of various locations and regions.

### `gameMode` (string)

**Type**: `string`
**Source**: `snapshot.gameMode` (from `gameStateModule`)
**Description**: The specific game mode being played.

**Possible Values**:
- `'standard'`: Normal game progression (default)
- `'open'`: Hyrule Castle front door unlocked from start
- `'inverted'`: Dark World and Light World swapped
- `'retro'`: Various old-school restrictions

**Usage**: Affects region accessibility and logic evaluation throughout the game.

---

## Static Data Extensions

ALTTP adds extensive settings data to staticData through both the game logic initialization and the custom exporter.

### Settings Object Extensions

The following properties are added to `staticData.settings` (or `staticData.settings['1']` for player 1).

#### Core Game Mode Settings

**`mode` / `game_mode`** (string)
- **Values**: `'standard'`, `'open'`, `'inverted'`, `'retro'`
- **Source**: Exporter line 431, mapped from numeric enum
- **Mapping**: 0='standard', 1='open', 2='inverted', 3='retro'

**`swordless`** (boolean)
- **Description**: Whether swords are excluded from the item pool
- **Source**: Exporter line 428, boolean setting
- **Default**: false

**`retro_bow`** (boolean)
- **Description**: Whether arrows must be purchased from shops
- **Source**: Exporter line 428, boolean setting
- **Default**: false

**`bombless_start`** (boolean)
- **Description**: Whether player starts without bomb capacity
- **Source**: Exporter line 428, boolean setting
- **Default**: false

**`goal`** (number)
- **Description**: The victory condition for this game
- **Source**: Exported via `fill_slot_data()` in `worlds/alttp/__init__.py:874`
- **Values**:
  - `0` = ganon (default) - Climb GT, defeat Agahnim 2, then kill Ganon
  - `1` = crystals - Only killing Ganon is required
  - `2` = bosses - Defeat the boss of all dungeons
  - `3` = pedestal - Pull the Triforce from the Master Sword pedestal
  - `4` = ganon_pedestal - Pull the pedestal, then kill Ganon
  - `5` = triforce_hunt - Collect Triforce pieces spread throughout worlds
  - `6` = local_triforce_hunt - Collect Triforce pieces in your world
  - `7` = ganon_triforce_hunt - Collect Triforce pieces, then kill Ganon
  - `8` = local_ganon_triforce_hunt - Collect pieces in your world, then kill Ganon
- **Usage**: Used in `is_invincible()` to check if triforce hunt mode makes player invincible
- **Note**: Values are numeric in exported data (not strings)

**`assume_bidirectional_exits`** (boolean)
- **Description**: Whether exits can be traversed in both directions
- **Source**: Exporter line 417
- **Value**: Always `true` for ALTTP

#### Enemy and Combat Settings

**`enemy_shuffle`** (boolean)
- **Description**: Whether enemies are randomized
- **Source**: Exporter line 428, boolean setting
- **Default**: false

**`enemy_health`** (string)
- **Description**: Enemy health difficulty
- **Values**: `'default'`, `'easy'`, `'hard'`, `'expert'`
- **Source**: Exporter line 428, mapped from numeric (0-3)

**`enemy_damage`** (string)
- **Description**: Enemy damage pattern
- **Values**: `'default'`, `'shuffled'`, `'chaos'`
- **Source**: Exporter line 428, mapped from numeric (0-2)

#### Logic and Accessibility Settings

**`glitches_required`** (string)
- **Description**: Level of glitches allowed/required in logic
- **Values**: `'none'`, `'overworld_glitches'`, `'major_glitches'`, `'no_logic'`
- **Source**: Exporter line 429, mapped from numeric (0-3)
- **Usage**: Affects what tricks are considered in logic

**`dark_room_logic`** (string)
- **Description**: What's required to navigate dark rooms
- **Values**: `'lamp'`, `'torches'`, `'none'`
- **Source**: Exporter line 428, mapped from numeric (0-2)

**`accessibility`** (string)
- **Description**: Accessibility guarantee level
- **Values**: `'items'`, `'locations'`, `'none'`
- **Source**: Exporter line 430, mapped from numeric (0-2)

#### Shuffle Settings

**`pot_shuffle`** (string)
- **Description**: Whether pots contain shuffled items
- **Values**: `'off'`, `'on'`
- **Source**: Exporter line 429, mapped from numeric (0-1)

**`shuffle_capacity_upgrades`** (boolean/string)
- **Description**: Whether capacity upgrades are shuffled into locations
- **Values**: `false`, `true`, or `'progressive'`
- **Source**: Exporter line 441
- **Default**: false

**`dungeon_counters`** (string)
- **Description**: Display setting for dungeon item counters
- **Values**: `'default'`, `'on'`, `'off'`
- **Source**: Exporter line 430, mapped from numeric (0-2)

#### Glitch-Specific Settings

**`glitch_boots`** (string)
- **Description**: Whether Pegasus Boots glitches are enabled
- **Values**: `'off'`, `'on'`
- **Source**: Exporter line 430, mapped from numeric (0-1)

#### Crystal and Goal Requirements

**`crystals_needed_for_gt`** (number)
- **Description**: Number of crystals required to enter Ganon's Tower
- **Source**: Exporter line 432
- **Default**: 7
- **Range**: 0-7

**`crystals_needed_for_ganon`** (number)
- **Description**: Number of crystals required to fight Ganon
- **Source**: Exporter line 432
- **Default**: 7
- **Range**: 0-7

**`treasure_hunt_required`** (number)
- **Description**: Triforce pieces needed for triforce hunt goal
- **Source**: Exporter line 446
- **Default**: 0 (not triforce hunt mode)
- **Usage**: When goal is triforce hunt, determines victory condition

#### Combat and Damage Settings

**`can_take_damage`** (boolean)
- **Description**: Whether the player is allowed to take damage
- **Source**: Exporter line 449
- **Default**: true
- **Usage**: Some logic checks can be bypassed if damage is allowed

**`item_functionality`** (string)
- **Description**: Affects potion effectiveness
- **Values**: `'normal'`, `'hard'`, `'expert'`
- **Usage**: Used in `can_extend_magic()` helper to calculate magic capacity with potions

#### Medallion Requirements

**`required_medallions`** (Array<string>)
- **Description**: List of medallions for dungeon access
- **Source**: Exporter lines 473
- **Default**: `['Ether', 'Quake']`
- **Values**: Each element is `'Ether'`, `'Quake'`, or `'Bombos'`

**`misery_mire_medallion`** (string)
- **Description**: Specific medallion required for Misery Mire
- **Source**: Exporter line 477
- **Values**: `'Ether'`, `'Quake'`, or `'Bombos'`
- **Default**: `'Ether'`

**`turtle_rock_medallion`** (string)
- **Description**: Specific medallion required for Turtle Rock
- **Source**: Exporter line 478
- **Values**: `'Ether'`, `'Quake'`, or `'Bombos'`
- **Default**: `'Quake'`

#### Difficulty Requirements Object

**`difficulty_requirements`** (Object)
- **Source**: Exporter lines 452-459
- **Description**: Contains item-specific limits based on difficulty

**Structure**:
```javascript
{
  progressive_bottle_limit: 4,        // Max bottles (default 4)
  boss_heart_container_limit: 10,     // Max boss hearts (default 10)
  heart_piece_limit: 24               // Max heart pieces (default 24)
}
```

### Item Data Extensions

ALTTP adds the following to the item data in staticData:

#### Progressive Item Mapping

**`progressionMapping`** (Object)
- **Source**: Exporter `get_progression_mapping()` (lines 335-354)
- **Description**: Maps progressive items to their upgrade tiers

**Structure**:
```javascript
{
  "Progressive Sword": {
    "base_item": "Progressive Sword",
    "items": [
      {"name": "Fighter Sword", "level": 1},
      {"name": "Master Sword", "level": 2},
      {"name": "Tempered Sword", "level": 3},
      {"name": "Golden Sword", "level": 4}
    ]
  },
  "Progressive Shield": {
    "base_item": "Progressive Shield",
    "items": [
      {"name": "Blue Shield", "level": 1},
      {"name": "Red Shield", "level": 2},
      {"name": "Mirror Shield", "level": 3}
    ]
  },
  // ... similar for Progressive Glove, Progressive Mail, Progressive Bow
}
```

**Usage**: Used by `has()` and `count()` helpers to determine if player has specific upgrade tiers.

#### Item Max Counts

**Source**: Exporter `get_item_max_counts()` (lines 312-333)
**Description**: Maximum obtainable quantity for each item type

**Key Limits**:
```javascript
{
  'Piece of Heart': 24,
  'Boss Heart Container': 10,
  'Sanctuary Heart Container': 1,
  'Magic Upgrade (1/2)': 1,
  'Magic Upgrade (1/4)': 1,
  'Progressive Sword': 4,
  'Progressive Shield': 3,
  'Progressive Glove': 2,
  'Progressive Mail': 2,
  'Progressive Bow': 2,
  'Bottle': 4,
  'Bottle (Red Potion)': 4,
  'Bottle (Green Potion)': 4,
  'Bottle (Blue Potion)': 4,
  'Bottle (Fairy)': 4,
  'Bottle (Bee)': 4,
  'Bottle (Good Bee)': 4
}
```

#### Always-Event Items

**Source**: Exporter ALWAYS_EVENT_ITEMS constant (lines 20-29)
**Description**: Items that are always treated as events, regardless of static definition

**List**:
- `'Activated Flute'`: Placed as event at Flute Activation Spot
- `'Beat Agahnim 1'`: Event for first Agahnim defeat
- `'Beat Agahnim 2'`: Event for second Agahnim defeat
- `'Get Frog'`: Event for obtaining frog
- `'Return Smith'`: Event for returning smithy
- `'Pick Up Purple Chest'`: Event for purple chest
- `'Open Floodgate'`: Event for opening floodgate
- `'Capacity Upgrade Shop'`: Event item for capacity shop access

**Impact**: These items have `event: true` and `id: null` in the exported item data.

### Itempool Count Extensions

**Source**: Exporter `get_itempool_counts()` (lines 357-410)

#### Dungeon-Specific Items

For each dungeon, the exporter adds:
- **Small Keys**: `"Small Key (Dungeon Name)": count`
  - Example: `"Small Key (Eastern Palace)": 2`
- **Big Keys**: `"Big Key (Dungeon Name)": 1`
  - Example: `"Big Key (Eastern Palace)": 1`

**Dungeon Names**:
- Hyrule Castle, Eastern Palace, Desert Palace, Tower of Hera
- Palace of Darkness, Swamp Palace, Skull Woods, Thieves Town
- Ice Palace, Misery Mire, Turtle Rock, Ganons Tower

#### Special Max Count Markers

Prefixed with `__max_` to distinguish from regular items:
- **`__max_progressive_bottle`**: Maximum bottles from difficulty settings
- **`__max_boss_heart_container`**: Maximum boss hearts from difficulty settings
- **`__max_heart_piece`**: Maximum heart pieces from difficulty settings

**Usage**: These are read during state initialization (stateManager.js:433-443) to set `difficultyRequirements` in the snapshot.

### Region Attribute Extensions

**Source**: Exporter `get_region_attributes()` (lines 555-571)

Each region gets additional attributes:
- **`is_light_world`** (boolean): Whether region is in Light World
- **`is_dark_world`** (boolean): Whether region is in Dark World

**Usage**: Used by logic to determine if Moon Pearl is needed and for region-specific accessibility rules.

### Location Attribute Extensions

**Source**: Exporter `get_location_attributes()` (lines 573-589)

Each location gets additional attributes:
- **`crystal`** (boolean or null): Whether location awards a crystal/pendant

**Usage**: Used to identify dungeon prize locations.

### Known Collections

**Source**: Exporter `get_collection_data()` (lines 591-619)

ALTTP defines several location collections used in complex rules:

```javascript
{
  'randomizer_room_chests': [
    "Ganons Tower - Randomizer Room - Top Left",
    "Ganons Tower - Randomizer Room - Top Right",
    "Ganons Tower - Randomizer Room - Bottom Left",
    "Ganons Tower - Randomizer Room - Bottom Right"
  ],
  'compass_room_chests': [
    "Ganons Tower - Compass Room - Top Left",
    "Ganons Tower - Compass Room - Top Right",
    "Ganons Tower - Compass Room - Bottom Left",
    "Ganons Tower - Compass Room - Bottom Right",
    "Ganons Tower - Conveyor Star Pits Pot Key"
  ],
  'back_chests': [
    "Ganons Tower - Bob's Chest",
    "Ganons Tower - Big Chest",
    "Ganons Tower - Big Key Room - Left",
    "Ganons Tower - Big Key Room - Right",
    "Ganons Tower - Big Key Chest"
  ]
}
```

**Usage**: Used with `zip()` and `item_name_in_location_names()` helpers to check item placement patterns.

---

## Helper Functions

ALTTP provides 100+ helper functions (defined in `alttpLogic.js:1212-1313`) that use the snapshot and staticData. Key categories:

### Combat and Weapons
- `can_kill_most_things()`, `can_defeat_ganon()`, `can_defeat_boss()`
- `has_sword()`, `has_beam_sword()`, `has_melee_weapon()`
- `can_shoot_arrows()`, `can_shoot_silver_arrows()`

### Magic and Capacity
- `can_extend_magic()`: Checks magic capacity with upgrades and potions
- `can_use_bombs()`: Checks bomb capacity with upgrades
- `can_hold_arrows()`: Checks arrow capacity

### Movement and Traversal
- `is_not_bunny()`: Requires Moon Pearl for Dark World
- `can_lift_rocks()`, `can_lift_heavy_rocks()`
- `can_fly()`, `can_dash()`, `can_swim()`

### Dungeon and Progression
- `has_crystals()`, `has_crystals_for_ganon()`
- `has_misery_mire_medallion()`, `has_turtle_rock_medallion()`
- `has_triforce_pieces()`

### Health Management
- `heart_count()`: Calculates total hearts with difficulty limits
- `bottle_count()`: Calculates effective bottle count with limits

### Glitches and Advanced Techniques
- `can_bomb_clip()`, `can_spin_speed()`
- `can_boots_clip_lw()`, `can_boots_clip_dw()`

### Utility Functions
- `location_item_name()`: Looks up what item is at a location
- `item_name_in_location_names()`: Checks if item is in location set
- `tr_big_key_chest_keys_needed()`: Complex TR key logic

---

## Data Flow Summary

```
Python Generation (exporter)
├─> Item Data
│   ├─> Max counts for progressive items
│   ├─> Event item identification
│   └─> Progressive item tier mapping
│
├─> Settings
│   ├─> Numeric values mapped to strings
│   ├─> Boolean flags extracted
│   └─> Medallion requirements extracted
│
├─> Itempool Counts
│   ├─> Dungeon keys added dynamically
│   └─> Special __max_* markers added
│
└─> Collections (location groups)

↓ Exported as staticData

JavaScript StateManager Initialization
├─> Reads __max_* from itempool
│   └─> Sets difficultyRequirements in gameStateModule
│
├─> Initializes gameStateModule via alttpStateModule
│   ├─> Sets flags from settings
│   ├─> Sets requiredMedallions
│   └─> Initializes events array
│
└─> Creates snapshot with gameStateModule data

↓ Snapshot sent to UI

UI Components
├─> Use snapshot for dynamic state (inventory, events, flags)
├─> Use staticData for fixed structure (settings, items, locations)
└─> Call helpers with both snapshot and staticData
```

---

## Key Design Patterns

1. **Dual Storage**: Difficulty limits stored in both itempool (`__max_*`) and snapshot (`difficultyRequirements`)
   - Itempool: Source of truth during export
   - Snapshot: Accessible to runtime logic

2. **Flag-Based Logic**: Settings like `swordless`, `retro_bow` stored as:
   - Settings in staticData (configuration)
   - Flags in snapshot (runtime state)

3. **Event Tracking**: Story progression tracked through:
   - Event items in inventory (item-based events)
   - Events array in snapshot (story events)
   - Both checked by `has()` helper

4. **Progressive Items**: Complex tier system:
   - Mapping in staticData (structure)
   - Count in snapshot inventory (current state)
   - Helpers resolve tier from count

5. **Collections**: Predefined location sets:
   - Defined in exporter
   - Used in rule evaluation
   - Enable complex "all items in these locations" logic

---

## Usage Examples

### Example 1: Checking Heart Count with Limits

```javascript
// Helper function uses both snapshot and staticData
function heart_count(snapshot, staticData) {
  // Get limits from settings (staticData)
  const diffReqs = staticData.settings?.['1']?.difficulty_requirements || {};
  const bossHeartLimit = diffReqs.boss_heart_container_limit || 10;
  const heartPieceLimit = diffReqs.heart_piece_limit || 24;

  // Get actual counts from snapshot
  const bossHearts = Math.min(
    count(snapshot, staticData, 'Boss Heart Container'),
    bossHeartLimit
  );
  const pieceHearts = Math.floor(
    Math.min(
      count(snapshot, staticData, 'Piece of Heart'),
      heartPieceLimit
    ) / 4
  );

  return bossHearts + pieceHearts + 3; // +3 starting hearts
}
```

### Example 2: Checking Swordless Mode

```javascript
// Setting stored in staticData
const isSwordless = staticData.settings?.['1']?.swordless === true;

// Flag may also be in snapshot
const isSwordlessFlag = snapshot.flags?.includes('swordless');

// Logic checks both
if (isSwordless || isSwordlessFlag) {
  // Hammer required instead of sword
  return has(snapshot, staticData, 'Hammer');
}
```

### Example 3: Medallion Requirements

```javascript
// Read from staticData which medallion is required
const medallion = staticData.settings?.['1']?.misery_mire_medallion || 'Ether';

// Check if player has it in snapshot
return has(snapshot, staticData, medallion);
```

---

## Comparison with Base System

| Aspect | Base System | ALTTP Extensions |
|--------|-------------|------------------|
| **Snapshot Fields** | 15 standard fields | +6 ALTTP-specific fields via gameStateModule |
| **Settings** | ~5 generic settings | +30 ALTTP-specific settings |
| **Item Properties** | 7 standard properties | +progressive mapping, max counts, event overrides |
| **Itempool Data** | Basic counts | +dungeon keys, +special __max_* markers |
| **Helper Functions** | Generic (has, count) | 100+ game-specific helpers |
| **Collections** | None | 3 predefined location collections |
| **Region Attributes** | None | +is_light_world, +is_dark_world |
| **Location Attributes** | None | +crystal |

---

## Technical Notes

1. **Settings Mapping**: The exporter converts numeric enum values to strings for human readability and easier debugging.

2. **Event Items**: Multiple systems ensure event items are correctly identified:
   - Static list in exporter (ALWAYS_EVENT_ITEMS)
   - Runtime check (item.code === None)
   - Type field in item_table

3. **Difficulty Propagation**: Difficulty limits flow through three stages:
   - World generation → world.difficulty_requirements
   - Exporter → itempool __max_* markers
   - StateManager → snapshot.difficultyRequirements

4. **Medallion Dual Storage**: Medallions stored in two forms:
   - `required_medallions` array (both medallions)
   - Individual `misery_mire_medallion` and `turtle_rock_medallion` (for direct access)

5. **Progressive Item Flexibility**: Progressive item system allows:
   - Different upgrade paths per difficulty
   - Non-linear progression (skip tiers)
   - "Provides" relationships (one item grants multiple)
