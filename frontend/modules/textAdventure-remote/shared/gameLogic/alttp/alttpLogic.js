import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

/**
 * @module gameLogic/alttp/alttpLogic
 * @description Thread-agnostic ALTTP game logic functions
 *
 * These pure functions operate on a canonical state snapshot and return results
 * without modifying the state. All helper functions follow the standardized signature:
 *
 * `(snapshot, staticData, ...args) => boolean | number | any`
 *
 * **DATA FLOW:**
 *
 * Input: Canonical state snapshot + static game data
 * - snapshot: { inventory, flags, events, player, regionReachability, evaluateRule }
 * - staticData: { settings, progressionMapping, regions, locations, items }
 *
 * Processing: Pure functional logic evaluation
 * - No state mutation
 * - Thread-safe execution
 * - Deterministic results
 *
 * Output: Boolean, number, or structured data based on function purpose
 */

// ============================================================================
// ALTTP Goal Constants
// ============================================================================
// Goal values from worlds/alttp/Options.py (Goal class)

/**
 * Goal: Climb GT, defeat Agahnim 2, and then kill Ganon
 */
export const GOAL_GANON = 0;

/**
 * Goal: Only killing Ganon is required. Items may still be placed in GT.
 */
export const GOAL_CRYSTALS = 1;

/**
 * Goal: Defeat the boss of all dungeons, including Agahnim's tower and GT (Aga 2)
 */
export const GOAL_BOSSES = 2;

/**
 * Goal: Pull the Triforce from the Master Sword pedestal
 */
export const GOAL_PEDESTAL = 3;

/**
 * Goal: Pull the Master Sword pedestal, then kill Ganon
 */
export const GOAL_GANON_PEDESTAL = 4;

/**
 * Goal: Collect Triforce pieces spread throughout the worlds
 */
export const GOAL_TRIFORCE_HUNT = 5;

/**
 * Goal: Collect Triforce pieces spread throughout your world
 */
export const GOAL_LOCAL_TRIFORCE_HUNT = 6;

/**
 * Goal: Collect Triforce pieces, then kill Ganon
 */
export const GOAL_GANON_TRIFORCE_HUNT = 7;

/**
 * Goal: Collect Triforce pieces in your world, then kill Ganon
 */
export const GOAL_LOCAL_GANON_TRIFORCE_HUNT = 8;

/**
 * Check if player has an item, handling progressive items and events.
 *
 * This is the core item-checking function used throughout ALTTP logic.
 * It checks inventory, flags, events, and progressive item upgrades.
 *
 * @param {Object} snapshot - Canonical state snapshot containing:
 *   - inventory: Map of item names to counts
 *   - flags: Array of flag names (settings, modes)
 *   - events: Array of event names (boss defeats, etc.)
 *   - player: { slot: string } - Player information
 * @param {Object} staticData - Static game data containing:
 *   - progressionMapping: Progressive item definitions by player slot
 * @param {string} itemName - Name of the item to check (can be item, flag, or event)
 * @returns {boolean} True if player has the item (count > 0), flag, or event
 *
 * @example
 * has(snapshot, staticData, 'Progressive Sword') // true if count >= 1
 * has(snapshot, staticData, 'Beat Agahnim 1')    // true if event triggered
 * has(snapshot, staticData, 'bombless_start')    // true if flag set
 */
export function has(snapshot, staticData, itemName) {
  // First check if it's in flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Also check snapshot.events (promoted from snapshot.snapshot.events)
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Special handling for generic item aliases that mean "any level"
  // "Sword" means "any sword level" (ProgressiveSword > 0)
  if (itemName === 'Sword') {
    return (snapshot.inventory['ProgressiveSword'] || 0) > 0;
  }

  // Direct item check
  if ((snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    // Get player-specific progression mapping (progression_mapping is organized by player slot)
    const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
    // Convert playerSlot to string for reliable object key access (handles both numeric and string slots)
    const playerSlotKey = String(playerSlot);
    const playerProgressionMapping = staticData.progressionMapping[playerSlotKey] || staticData.progressionMapping;

    // Check if this item is provided by any progressive item
    for (const [progressiveBase, progression] of Object.entries(playerProgressionMapping)) {
      let baseCount = snapshot.inventory[progressiveBase] || 0;

      // Special case: Progressive Bow and Progressive Bow (Alt) should be combined
      // This handles the server's runtime conversion of one bow to (Alt) in ItemPool.py
      if (progressiveBase === 'Progressive Bow') {
        baseCount += snapshot.inventory['Progressive Bow (Alt)'] || 0;
      } else if (progressiveBase === 'Progressive Bow (Alt)') {
        baseCount += snapshot.inventory['Progressive Bow'] || 0;
      }

      if (baseCount > 0 && progression && progression.items) {
        // Check each upgrade in the progression
        for (const upgrade of progression.items) {
          if (baseCount >= upgrade.level) {
            // Check if this upgrade provides the item we're looking for
            if (upgrade.name === itemName ||
              (upgrade.provides && upgrade.provides.includes(itemName))) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Count how many of an item the player has, handling progressive items.
 *
 * For progressive items, returns 1 if the player has reached the specified tier,
 * otherwise returns 0. For non-progressive items, returns the direct count.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data with progressionMapping
 * @param {string} itemName - Name of the item to count
 * @returns {number} Count of the item (or 1/0 for progressive item tiers)
 *
 * @example
 * count(snapshot, staticData, 'Progressive Sword')  // Returns actual count: 0, 1, 2, 3, 4
 * count(snapshot, staticData, 'Master Sword')       // Returns 1 if have 2+ Progressive Swords, else 0
 * count(snapshot, staticData, 'Bomb Upgrade (+5)')  // Returns actual count of this upgrade
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;

  // Get player-specific progression mapping (progression_mapping is organized by player slot)
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  // Convert playerSlot to string for reliable object key access (handles both numeric and string slots)
  const playerSlotKey = String(playerSlot);
  const playerProgressionMapping = staticData?.progressionMapping?.[playerSlotKey] || staticData?.progressionMapping;

  // If the item itself is a base progressive item, return its direct count
  if (playerProgressionMapping && playerProgressionMapping[itemName]) {
    return snapshot.inventory[itemName] || 0;
  }

  // Check if itemName is a specific tier of any progressive item we hold
  if (playerProgressionMapping) {
    for (const [progressiveBase, progression] of Object.entries(playerProgressionMapping)) {
      let baseCount = snapshot.inventory[progressiveBase] || 0;

      // Special case: Progressive Bow and Progressive Bow (Alt) should be combined
      // This handles the server's runtime conversion of one bow to (Alt) in ItemPool.py
      if (progressiveBase === 'Progressive Bow') {
        baseCount += snapshot.inventory['Progressive Bow (Alt)'] || 0;
      } else if (progressiveBase === 'Progressive Bow (Alt)') {
        baseCount += snapshot.inventory['Progressive Bow'] || 0;
      }

      if (baseCount > 0 && progression && progression.items) {
        // Check each upgrade in the progression
        for (const upgrade of progression.items) {
          if (upgrade.name === itemName ||
            (upgrade.provides && upgrade.provides.includes(itemName))) {
            // Return 1 if we have enough of the base item to have reached this tier, 0 otherwise
            return baseCount >= upgrade.level ? 1 : 0;
          }
        }
      }
    }
  }

  // Not a progressive item tier, return direct count
  return snapshot.inventory[itemName] || 0;
}

// ============================================================================
// ALTTP-Specific Helper Functions
// ============================================================================

/**
 * Check if player can traverse dark world without becoming a bunny.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has Moon Pearl
 */
export function is_not_bunny(snapshot, staticData) {
  return has(snapshot, staticData, 'Moon Pearl');
}

/**
 * Check if player can lift small rocks (requires Power Glove or higher).
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has Power Glove or Titans Mitts
 */
export function can_lift_rocks(snapshot, staticData) {
  return has(snapshot, staticData, 'Power Glove') || has(snapshot, staticData, 'Titans Mitts');
}

/**
 * Check if player can lift heavy rocks (requires Titans Mitts).
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has Titans Mitts
 */
export function can_lift_heavy_rocks(snapshot, staticData) {
  return has(snapshot, staticData, 'Titans Mitts');
}

/**
 * Check if player can light torches using Fire Rod or Lamp.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has Fire Rod or Lamp
 */
export function can_light_torches(snapshot, staticData) {
  return has(snapshot, staticData, 'Fire Rod') || has(snapshot, staticData, 'Lamp');
}

export function can_melt_things(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  return has(snapshot, staticData, 'Fire Rod') ||
    (has(snapshot, staticData, 'Bombos') &&
      (has_sword(snapshot, staticData) || staticData.settings?.[playerSlot]?.swordless));
}

export function can_fly(snapshot, staticData) {
  return has(snapshot, staticData, 'Flute');
}

export function can_dash(snapshot, staticData) {
  return has(snapshot, staticData, 'Pegasus Boots');
}

export function is_invincible(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  return has(snapshot, staticData, 'Cape') ||
    has(snapshot, staticData, 'Cane of Byrna') ||
    staticData.settings?.[playerSlot]?.goal === GOAL_TRIFORCE_HUNT;
}

export function can_block_lasers(snapshot, staticData) {
  return has(snapshot, staticData, 'Mirror Shield');
}

/**
 * Check if player has enough magic capacity to cast a spell requiring specific magic points.
 *
 * Calculates total magic capacity including upgrades and potion refills.
 * Takes into account difficulty settings that affect potion effectiveness.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data with settings
 * @param {number} [smallmagic=16] - Magic points required (default: 16)
 * @param {boolean} [fullrefill=false] - Whether full magic refill is needed
 * @returns {boolean} True if player has sufficient magic capacity
 *
 * @example
 * can_extend_magic(snapshot, staticData, 16)      // Can cast Fire Rod (16 MP)
 * can_extend_magic(snapshot, staticData, 32)      // Can cast Bombos medallion (32 MP)
 * can_extend_magic(snapshot, staticData, 16, true) // Needs full refill for 16 MP
 */
export function can_extend_magic(snapshot, staticData, smallmagic, fullrefill) {
  // Parameters match Python signature: can_extend_magic(state, player, smallmagic=16, fullrefill=False)
  // JavaScript signature: can_extend_magic(snapshot, staticData, smallmagic=16, fullrefill=false)
  const magicNeeded = typeof smallmagic === 'number' ? smallmagic : 16;
  const needsFullRefill = typeof fullrefill === 'boolean' ? fullrefill : false;

  // Calculate base magic
  let basemagic = 8;
  if (has(snapshot, staticData, 'Magic Upgrade (1/4)')) {
    basemagic = 32;
  } else if (has(snapshot, staticData, 'Magic Upgrade (1/2)')) {
    basemagic = 16;
  }

  // Add bottle refills if unlimited potions are available
  if (can_buy_unlimited(snapshot, staticData, 'Green Potion') ||
    can_buy_unlimited(snapshot, staticData, 'Blue Potion')) {
    const bottles = bottle_count(snapshot, staticData);
    const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
    const functionality = staticData.settings?.[playerSlot]?.item_functionality || 'normal';

    if (functionality === 'hard' && !needsFullRefill) {
      basemagic += Math.floor(basemagic * 0.5 * bottles);
    } else if (functionality === 'expert' && !needsFullRefill) {
      basemagic += Math.floor(basemagic * 0.25 * bottles);
    } else {
      basemagic += basemagic * bottles;
    }
  }

  return basemagic >= magicNeeded;
}

/**
 * Check if player can defeat most standard enemies.
 *
 * This function handles two modes:
 * - Normal mode: Any weapon works (sword, bow, bombs, rods, canes)
 * - Enemizer mode: Requires all weapons (much stricter)
 *
 * Takes into account enemy health settings and enemy shuffle mode.
 *
 * @param {Object} snapshot - State snapshot
 * @param {Object} staticData - Static game data with enemy_shuffle and enemy_health settings
 * @param {string|number} [enemyCount="5"] - Number of enemies to defeat (default: 5)
 * @returns {boolean} True if player can defeat the specified number of enemies
 *
 * @example
 * can_kill_most_things(snapshot, staticData, "5")  // Can defeat 5 normal enemies
 * can_kill_most_things(snapshot, staticData, "10") // Can defeat 10 enemies (harder)
 */
export function can_kill_most_things(snapshot, staticData, enemyCount) {
  const enemies = parseInt(enemyCount, 10) || 5;
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if enemy shuffle is enabled
  const enemyShuffle = staticData.settings?.[playerSlot]?.enemy_shuffle;

  if (enemyShuffle) {
    // Enemizer mode - need everything
    return has_melee_weapon(snapshot, staticData) &&
      has(snapshot, staticData, 'Cane of Somaria') &&
      has(snapshot, staticData, 'Cane of Byrna') &&
      can_extend_magic(snapshot, staticData) &&
      can_shoot_arrows(snapshot, staticData, '0') &&
      has(snapshot, staticData, 'Fire Rod') &&
      can_use_bombs(snapshot, staticData, (enemies * 4).toString());
  } else {
    // Normal enemy logic - any of these work
    if (has_melee_weapon(snapshot, staticData)) return true;
    if (has(snapshot, staticData, 'Cane of Somaria')) return true;
    if (has(snapshot, staticData, 'Cane of Byrna') &&
      (enemies < 6 || can_extend_magic(snapshot, staticData))) return true;
    if (can_shoot_arrows(snapshot, staticData, '0')) return true;
    if (has(snapshot, staticData, 'Fire Rod')) return true;

    // Bombs work on easy/default enemy health
    const enemyHealth = staticData.settings?.[playerSlot]?.enemy_health || 'default';
    if ((enemyHealth === 'easy' || enemyHealth === 'default') &&
      can_use_bombs(snapshot, staticData, (enemies * 4).toString())) {
      return true;
    }

    return false;
  }
}

export function can_shoot_silver_arrows(snapshot, staticData) {
  return has(snapshot, staticData, 'Progressive Bow') &&
    has(snapshot, staticData, 'Silver Arrows');
}

export function can_defeat_ganon(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  if (has(snapshot, staticData, 'Triforce')) {
    return true;
  }

  return can_shoot_silver_arrows(snapshot, staticData) &&
    (has(snapshot, staticData, 'Lamp') ||
      (has(snapshot, staticData, 'Fire Rod') && can_extend_magic(snapshot, staticData))) &&
    (has_beam_sword(snapshot, staticData) ||
      (has(snapshot, staticData, 'Hammer') &&
        (staticData.settings?.[playerSlot]?.game_mode === 'swordless' || staticData.settings?.[playerSlot]?.swordless)));
}

export function can_defeat_boss(snapshot, staticData, locationName, bossType) {
  // For Desert Palace and most other bosses, just need to be able to kill things
  // The specific requirements are already checked in the location's access rules
  // This is a simplified version - the actual boss defeat is handled by the dungeon's rules
  return can_kill_most_things(snapshot, staticData, "1");
}

export function can_take_damage(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if the game settings allow taking damage
  // Default is true unless explicitly set to false in settings
  const canTakeDamage = staticData.settings?.[playerSlot]?.can_take_damage;
  // If not explicitly set to false, assume true
  return canTakeDamage !== false;
}

// ============================================================================
// Bomb and Capacity Management
// ============================================================================

/**
 * Check if player has enough bomb capacity to use a specified number of bombs.
 *
 * Calculates total bomb capacity from:
 * - Base bombs (10, or 0 for bombless start)
 * - Bomb upgrades (+5, +10, +50)
 * - Capacity Upgrade Shop (if applicable)
 *
 * Special rule: Bomb Upgrade (+5) beyond 6th upgrade gives +10 instead of +5.
 *
 * @param {Object} snapshot - State snapshot with inventory and flags
 * @param {Object} staticData - Static game data with bombless_start and shuffle_capacity_upgrades settings
 * @param {string|number} [quantity="1"] - Number of bombs needed (max 50)
 * @returns {boolean} True if player has sufficient bomb capacity
 *
 * @example
 * can_use_bombs(snapshot, staticData, "1")  // Can use 1 bomb
 * can_use_bombs(snapshot, staticData, "20") // Can use 20 bombs (needs upgrades)
 */
export function can_use_bombs(snapshot, staticData, quantity) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const bombsNeeded = parseInt(quantity, 10) || 1;

  // Start with base bombs (10 unless bombless start)
  let bombs = 0;
  const bomblessStart = staticData.settings?.[playerSlot]?.bombless_start ||
    (snapshot.flags && snapshot.flags.includes('bombless_start'));
  if (!bomblessStart) {
    bombs = 10;
  }

  // Add bomb upgrades
  bombs += count(snapshot, staticData, 'Bomb Upgrade (+5)') * 5;
  bombs += count(snapshot, staticData, 'Bomb Upgrade (+10)') * 10;
  bombs += count(snapshot, staticData, 'Bomb Upgrade (50)') * 50;

  // Bomb Upgrade (+5) beyond the 6th gives +10
  const upgrade5Count = count(snapshot, staticData, 'Bomb Upgrade (+5)');
  bombs += Math.max(0, (upgrade5Count - 6) * 10);

  // If capacity upgrades are NOT shuffled and we have Capacity Upgrade Shop, add 40
  const shuffleUpgrades = staticData.settings?.[playerSlot]?.shuffle_capacity_upgrades;
  if (!shuffleUpgrades && has(snapshot, staticData, 'Capacity Upgrade Shop')) {
    bombs += 40;
  }

  return bombs >= Math.min(bombsNeeded, 50);
}

export function can_bomb_or_bonk(snapshot, staticData) {
  return has(snapshot, staticData, 'Pegasus Boots') || can_use_bombs(snapshot, staticData, '1');
}

export function can_activate_crystal_switch(snapshot, staticData) {
  return has_melee_weapon(snapshot, staticData) ||
    can_use_bombs(snapshot, staticData, '1') ||
    can_shoot_arrows(snapshot, staticData, '0') ||
    has(snapshot, staticData, 'Hookshot') ||
    has(snapshot, staticData, 'Cane of Somaria') ||
    has(snapshot, staticData, 'Cane of Byrna') ||
    has(snapshot, staticData, 'Fire Rod') ||
    has(snapshot, staticData, 'Ice Rod') ||
    has(snapshot, staticData, 'Blue Boomerang') ||
    has(snapshot, staticData, 'Red Boomerang');
}

export function can_buy(snapshot, staticData, shopItemName) {
  // TODO: Implement proper shop logic
  // Requires: staticData.shops array with shop inventory and region data
  // For now, assume basic purchases are always available
  return true;
}

export function can_buy_unlimited(snapshot, staticData, shopItemName) {
  // TODO: Implement proper unlimited shop logic
  // Requires: staticData.shops array with:
  //   - shop.region_name for reachability checks
  //   - shop.inventory array with { item, max } objects
  //   - max === 0 or max > 99 indicates unlimited
  // Current implementation assumes no unlimited shops available

  // ALTTP-specific fallback for potions - basic implementation
  if (shopItemName === 'Green Potion' || shopItemName === 'Blue Potion') {
    const potionShopReachable = snapshot.regionReachability && snapshot.regionReachability['Potion Shop'];
    return potionShopReachable === 'reachable';
  }

  return false;
}

/**
 * Check if player has enough arrow capacity to hold a specified number of arrows.
 *
 * Arrow capacity calculation depends on whether capacity upgrades are shuffled:
 * - Shuffled: Start at 30, add upgrades (+5, +10, or +70), max 70
 * - Non-shuffled: 30 base, or 70 if Capacity Upgrade Shop obtained
 *
 * @param {Object} snapshot - State snapshot with inventory
 * @param {Object} staticData - Static game data with shuffle_capacity_upgrades setting
 * @param {string|number} [arrowCount="0"] - Number of arrows needed
 * @returns {boolean} True if player has sufficient arrow capacity
 *
 * @example
 * can_hold_arrows(snapshot, staticData, "0")  // Always true (no arrows needed)
 * can_hold_arrows(snapshot, staticData, "40") // Needs arrow upgrades
 */
export function can_hold_arrows(snapshot, staticData, arrowCount) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const quantity = parseInt(arrowCount, 10) || 0;

  // Check if capacity upgrades are shuffled
  const shuffleUpgrades = staticData.settings?.[playerSlot]?.shuffle_capacity_upgrades;

  if (shuffleUpgrades) {
    if (quantity === 0) return true;

    let arrows = 30; // Base capacity

    if (has(snapshot, staticData, 'Arrow Upgrade (70)')) {
      arrows = 70;
    } else {
      arrows += count(snapshot, staticData, 'Arrow Upgrade (+5)') * 5;
      arrows += count(snapshot, staticData, 'Arrow Upgrade (+10)') * 10;

      // Arrow Upgrade (+5) beyond the 6th gives +10
      const upgrade5Count = count(snapshot, staticData, 'Arrow Upgrade (+5)');
      arrows += Math.max(0, (upgrade5Count - 6) * 10);
    }

    return Math.min(70, arrows) >= quantity;
  } else {
    // Non-shuffled capacity upgrades
    if (quantity <= 30) return true;
    return has(snapshot, staticData, 'Capacity Upgrade Shop');
  }
}

export function can_get_good_bee(snapshot, staticData) {
  const bottleCount = count(snapshot, staticData, 'Bottle');
  return (has(snapshot, staticData, 'Bug Catching Net') &&
    bottleCount > 0 &&
    (has(snapshot, staticData, 'Pegasus Boots') ||
      (has_sword(snapshot, staticData) && has(snapshot, staticData, 'Quake'))));
}

export function can_retrieve_tablet(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  return has(snapshot, staticData, 'Book of Mudora') &&
    (has_beam_sword(snapshot, staticData) ||
      (staticData.settings?.[playerSlot]?.swordless && has(snapshot, staticData, 'Hammer')));
}

export function can_flute(snapshot, staticData) {
  return has(snapshot, staticData, 'Flute');
}

export function can_flute_spot_5(snapshot, staticData) {
  return has(snapshot, staticData, 'Flute') && has(snapshot, staticData, 'Titans Mitts');
}

export function has_bottle(snapshot, staticData) {
  return count(snapshot, staticData, 'Bottle') > 0;
}

export function has_hearts(snapshot, staticData, heartCount) {
  // Get heart count from parameters
  const heartsRequired = parseInt(heartCount, 10) || 0;
  if (heartsRequired === 0) return true;

  // Use heart_count function which applies difficulty limits
  const actualHearts = heart_count(snapshot, staticData);
  const result = actualHearts >= heartsRequired;

  return result;
}

export function can_heart_skip(snapshot, staticData) {
  return is_invincible(snapshot, staticData);
}

export function has_fire_source(snapshot, staticData) {
  return has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod');
}

export function can_anima_transfigure(snapshot, staticData) {
  const pendantCount =
    (has(snapshot, staticData, 'Green Pendant') ? 1 : 0) +
    (has(snapshot, staticData, 'Blue Pendant') ? 1 : 0) +
    (has(snapshot, staticData, 'Red Pendant') ? 1 : 0);
  return pendantCount >= 2;
}

export function has_crystals(snapshot, staticData, crystalCount) {
  const crystalsRequired = parseInt(crystalCount, 10) || 0;
  if (crystalsRequired === 0) return true;

  let totalCrystals = 0;
  for (let i = 1; i <= 7; i++) {
    if (has(snapshot, staticData, `Crystal ${i}`)) {
      totalCrystals++;
    }
  }

  return totalCrystals >= crystalsRequired;
}

export function has_beam_sword(snapshot, staticData) {
  return has(snapshot, staticData, 'Master Sword') ||
    has(snapshot, staticData, 'Tempered Sword') ||
    has(snapshot, staticData, 'Golden Sword') ||
    count(snapshot, staticData, 'Progressive Sword') >= 2;
}

export function has_melee_weapon(snapshot, staticData) {
  return has_sword(snapshot, staticData) ||
    has(snapshot, staticData, 'Hammer');
}

export function has_sword(snapshot, staticData) {
  return has(snapshot, staticData, 'Fighter Sword') ||
    has(snapshot, staticData, 'Master Sword') ||
    has(snapshot, staticData, 'Tempered Sword') ||
    has(snapshot, staticData, 'Golden Sword') ||
    has(snapshot, staticData, 'Progressive Sword');
}

export function has_rod(snapshot, staticData) {
  return has(snapshot, staticData, 'Fire Rod') ||
    has(snapshot, staticData, 'Ice Rod');
}

// ============================================================================
// Bottle Management
// ============================================================================

/**
 * Count the effective number of bottles the player has, respecting difficulty limits.
 *
 * The count is limited by the progressive_bottle_limit setting (default: 4).
 * Uses countGroup to handle all bottle types (empty, with potions, etc.).
 *
 * @param {Object} snapshot - State snapshot with inventory
 * @param {Object} staticData - Static game data with difficulty_requirements
 * @returns {number} Effective bottle count (capped by difficulty limit)
 *
 * @example
 * bottle_count(snapshot, staticData) // Returns 0-4 (depending on limit)
 */
export function bottle_count(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Get bottle limit from difficulty requirements in settings
  const diffReqs = staticData.settings?.[playerSlot]?.difficulty_requirements || {};
  const bottleLimit = diffReqs.progressive_bottle_limit || 4; // Default to 4

  // Use countGroup to count all items in the "Bottles" group
  // This handles items like "Bottle (Red Potion)", "Bottle (Blue Potion)", etc.
  const currentBottles = countGroup(snapshot, staticData, 'Bottles');
  return Math.min(currentBottles, bottleLimit);
}

// ============================================================================
// Glitch and Mode-Specific Logic
// ============================================================================

export function can_bomb_clip(snapshot, staticData) {
  // Need bombs, boots, and to not be bunny
  return can_use_bombs(snapshot, staticData, '1') &&
    has(snapshot, staticData, 'Pegasus Boots') &&
    is_not_bunny(snapshot, staticData);
}

export function can_spin_speed(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  return has(snapshot, staticData, 'Pegasus Boots') &&
    has_sword(snapshot, staticData) &&
    staticData.settings?.[playerSlot]?.mode === 'minor_glitches';
}

export function can_boots_clip_lw(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  return has(snapshot, staticData, 'Pegasus Boots') &&
    staticData.settings?.[playerSlot]?.mode === 'minor_glitches';
}

export function can_boots_clip_dw(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  return has(snapshot, staticData, 'Pegasus Boots') &&
    has(snapshot, staticData, 'Moon Pearl') &&
    staticData.settings?.[playerSlot]?.mode === 'minor_glitches';
}

// ============================================================================
// Dungeon and Boss Logic
// ============================================================================

export function can_complete_gt_climb(snapshot, staticData) {
  return (has(snapshot, staticData, 'Hammer') ||
    (has(snapshot, staticData, 'Hookshot') &&
      (has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod')))) &&
    has(snapshot, staticData, 'Progressive Bow') &&
    has(snapshot, staticData, 'Big Key (Ganons Tower)');
}

// ============================================================================
// Medallion Requirements
// ============================================================================

export function has_misery_mire_medallion(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  const medallion = staticData.settings?.[playerSlot]?.misery_mire_medallion || 'Ether';
  return has(snapshot, staticData, medallion);
}

export function has_turtle_rock_medallion(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  const medallion = staticData.settings?.[playerSlot]?.turtle_rock_medallion || 'Quake';
  return has(snapshot, staticData, medallion);
}

// ============================================================================
// Arrow and Bow Logic
// ============================================================================

/**
 * Check if player can shoot arrows.
 *
 * Requirements:
 * - Must have Bow or Silver Bow
 * - Retro bow mode: Must be able to buy arrows
 * - Normal mode: Must have sufficient arrow capacity
 *
 * @param {Object} snapshot - State snapshot with inventory and flags
 * @param {Object} staticData - Static game data with retro_bow setting
 * @param {string|number} [arrowCount="0"] - Number of arrows needed
 * @returns {boolean} True if player can shoot the specified number of arrows
 *
 * @example
 * can_shoot_arrows(snapshot, staticData, "0")  // Just needs bow
 * can_shoot_arrows(snapshot, staticData, "40") // Needs bow + 40 arrow capacity
 */
export function can_shoot_arrows(snapshot, staticData, arrowCount) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const count_param = parseInt(arrowCount, 10) || 0;

  // Must have bow first
  if (!has(snapshot, staticData, 'Bow') && !has(snapshot, staticData, 'Silver Bow')) {
    return false;
  }

  // Check retro bow mode
  const retroBow = staticData.settings?.[playerSlot]?.retro_bow ||
    (snapshot.flags && snapshot.flags.includes('retro_bow'));

  if (retroBow) {
    // In retro bow mode, need to buy arrows from shops
    return can_buy(snapshot, staticData, 'Single Arrow');
  } else {
    // Normal mode - need arrow capacity
    return can_hold_arrows(snapshot, staticData, count_param.toString());
  }
}

export function has_triforce_pieces(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Get required count from world settings
  const requiredCount = staticData.settings?.[playerSlot]?.treasure_hunt_required ||
    snapshot.treasureHuntRequired || 0;

  const triforceCount = count(snapshot, staticData, 'Triforce Piece');
  const powerStarCount = count(snapshot, staticData, 'Power Star');

  return triforceCount + powerStarCount >= requiredCount;
}



export function has_any(snapshot, staticData, itemNames) {
  // itemNames should be an array of item names for this function
  const items = Array.isArray(itemNames) ? itemNames : [itemNames];

  return items.some(item => has(snapshot, staticData, item));
}

/**
 * Look up what item is placed at a specific location.
 *
 * Searches through multiple data sources to find item placement:
 * 1. staticData.locations (direct mapping or Map)
 * 2. staticData.regions (searching through location arrays)
 * 3. staticData.locationItems (fallback placement data)
 *
 * @param {Object} snapshot - State snapshot with player info
 * @param {Object} staticData - Static game data with locations, regions, locationItems
 * @param {string} locationName - Name of the location to query
 * @returns {Array|null} [itemName, playerNumber] array, or null if not found
 *
 * @example
 * location_item_name(snapshot, staticData, 'Uncle - Prize')
 * // Returns: ['Progressive Sword', 1]
 *
 * location_item_name(snapshot, staticData, 'Turtle Rock - Big Key Chest')
 * // Returns: ['Big Key (Turtle Rock)', 1]
 */
export function location_item_name(snapshot, staticData, locationName) {
  // Look up what item is placed at a specific location

  // First check if we have location-item mapping in static data locations object
  if (staticData && staticData.locations) {
    // staticData.locations is always a Map after initialization
    const locationData = staticData.locations.get(locationName);
    if (locationData && locationData.item) {
      // Return array format: [item_name, player_number]
      return [locationData.item.name, locationData.item.player || 1];
    }
  }

  // Search through regions for the location
  if (staticData && staticData.regions) {
    const playerSlot = snapshot.player?.id || snapshot.player?.slot || DEFAULT_PLAYER_ID;

    // staticData.regions is always a Map after initialization
    if (!staticData.regions) return null;

    // Iterate through regions
    for (const [regionName, region] of staticData.regions.entries()) {
      if (region && region.locations && Array.isArray(region.locations)) {
        const location = region.locations.find(loc => loc.name === locationName);
        if (location && location.item) {
          // Return array format: [item_name, player_number]
          return [location.item.name, location.item.player || 1];
        }
      }
    }
  }

  // Check if we have item placement data in the static data
  if (staticData && staticData.locationItems && staticData.locationItems.get(locationName)) {
    const item = staticData.locationItems.get(locationName);
    if (typeof item === 'string') {
      return [item, snapshot.player?.slot || 1];
    } else if (item && item.name) {
      return [item.name, item.player || snapshot.player?.slot || 1];
    }
  }

  // Return null if no data available
  return null;
}

export function tr_big_key_chest_keys_needed(snapshot, staticData) {
  // This function handles the key requirements for the TR Big Chest
  // Based on the Python function in worlds/alttp/Rules.py

  const item = location_item_name(snapshot, staticData, 'Turtle Rock - Big Key Chest');

  if (!item) {
    // If we can't determine the item, use the default (6 keys)
    return 6;
  }

  const [itemAtLocation, locationPlayer] = item;
  const currentPlayer = snapshot.player?.slot || 1;

  // Only consider items for the current player
  if (locationPlayer != currentPlayer) {
    return 6;
  }

  // Implement tr_big_key_chest_keys_needed logic:
  // - Small Key (Turtle Rock): 0 keys needed
  // - Big Key (Turtle Rock): 4 keys needed
  // - Anything else: 6 keys needed
  if (itemAtLocation === 'Small Key (Turtle Rock)') {
    return 0;
  } else if (itemAtLocation === 'Big Key (Turtle Rock)') {
    return 4;
  } else {
    return 6;
  }
}

export function item_name_in_location_names(snapshot, staticData, searchItem, locationPairs) {
  // Check if a specific item is placed in any of the given locations
  // New signature: (snapshot, staticData, searchItem, locationPairs)
  // searchItem: string - the item name to search for (e.g., "Big Key (Ganons Tower)")
  // locationPairs: array - list of [locationName, playerNumber] pairs to check

  if (!Array.isArray(locationPairs)) {
    return false;
  }

  const currentPlayer = snapshot.player?.slot || parseInt(snapshot.player) || 1;

  for (const locationPair of locationPairs) {
    if (!Array.isArray(locationPair) || locationPair.length < 2) continue;

    const [locationName, locationPlayer] = locationPair;
    if (typeof locationName !== 'string') continue;

    const itemAtLocation = location_item_name(snapshot, staticData, locationName);
    if (itemAtLocation && Array.isArray(itemAtLocation)) {
      const [foundItem, foundPlayer] = itemAtLocation;
      // Check if this is the item we're looking for and it belongs to the right player
      if (foundItem === searchItem && parseInt(foundPlayer) === parseInt(locationPlayer)) {
        return true;
      }
    }
  }

  return false;
}


export function has_crystals_for_ganon(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if player has required number of crystals for Ganon
  // The required number comes from settings
  const requiredCrystals = staticData.settings?.[playerSlot]?.crystals_needed_for_ganon || 7;

  // Use the simpler has_crystals function that counts Crystal 1-7 directly
  return has_crystals(snapshot, staticData, requiredCrystals.toString());
}

export function GanonDefeatRule(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const isSwordless = staticData.settings?.[playerSlot]?.swordless ||
    (snapshot.flags && snapshot.flags.includes('swordless'));

  if (isSwordless) {
    // Swordless mode requirements
    return has(snapshot, staticData, 'Hammer') &&
      has_fire_source(snapshot, staticData) &&
      has(snapshot, staticData, 'Silver Bow') &&
      can_shoot_arrows(snapshot, staticData, '0');
  } else {
    // Normal mode requirements
    const hasBeamSword = has_beam_sword(snapshot, staticData);
    const hasFireSource = has_fire_source(snapshot, staticData);

    if (!hasBeamSword || !hasFireSource) {
      return false;
    }

    // Check for glitches - 'none' and 'no_glitches' both mean no glitches allowed
    const glitchesRequired = staticData.settings?.[playerSlot]?.glitches_required;
    const isGlitchesAllowed = glitchesRequired &&
      glitchesRequired !== 'none' &&
      glitchesRequired !== 'no_glitches';

    if (isGlitchesAllowed) {
      // With glitches, more options available
      return has(snapshot, staticData, 'Tempered Sword') ||
        has(snapshot, staticData, 'Golden Sword') ||
        (has(snapshot, staticData, 'Silver Bow') && can_shoot_arrows(snapshot, staticData, '0')) ||
        has(snapshot, staticData, 'Lamp') ||
        can_extend_magic(snapshot, staticData, '12');
    } else {
      // No glitches (default) - need silver arrows
      return has(snapshot, staticData, 'Silver Bow') &&
        can_shoot_arrows(snapshot, staticData, '0');
    }
  }
}

export function can_get_glitched_speed_dw(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  if (!has(snapshot, staticData, 'Pegasus Boots')) {
    return false;
  }

  if (!has(snapshot, staticData, 'Hookshot') && !has_sword(snapshot, staticData)) {
    return false;
  }

  // Check if in inverted mode
  const gameMode = staticData.settings?.[playerSlot]?.mode || staticData.settings?.[playerSlot]?.game_mode || 'standard';
  if (gameMode !== 'inverted') {
    // Need Moon Pearl for dark world in standard mode
    return has(snapshot, staticData, 'Moon Pearl');
  }

  return true; // In inverted mode, no Moon Pearl needed
}

export function _has_specific_key_count(snapshot, staticData, keyCountSpec) {
  const [keyName, requiredCountStr] = keyCountSpec.split(',');
  const requiredCount = parseInt(requiredCountStr, 10) || 1;

  return count(snapshot, staticData, keyName.trim()) >= requiredCount;
}

export function basement_key_rule(snapshot, staticData) {
  // This is a complex rule that checks if Key Rat has the key
  // For now, assume we need 3 keys (simplified)
  return count(snapshot, staticData, 'Small Key (Hyrule Castle)') >= 3;
}

export function cross_peg_bridge(snapshot, staticData) {
  return has(snapshot, staticData, 'Hammer') && has(snapshot, staticData, 'Moon Pearl');
}

// Update existing can_extend_magic to match Python implementation
export function can_extend_magic_complex(snapshot, staticData, magicSpec) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const smallmagic = parseInt(magicSpec, 10) || 16;
  const fullrefill = magicSpec?.includes('fullrefill') || false;

  let basemagic = 8;

  if (has(snapshot, staticData, 'Magic Upgrade (1/4)')) {
    basemagic = 32;
  } else if (has(snapshot, staticData, 'Magic Upgrade (1/2)')) {
    basemagic = 16;
  }

  if (can_buy_unlimited(snapshot, staticData, 'Green Potion') ||
    can_buy_unlimited(snapshot, staticData, 'Blue Potion')) {

    const bottles = bottle_count(snapshot, staticData);
    const functionality = staticData.settings?.[playerSlot]?.item_functionality || 'normal';

    if (functionality === 'hard' && !fullrefill) {
      basemagic += Math.floor(basemagic * 0.5 * bottles);
    } else if (functionality === 'expert' && !fullrefill) {
      basemagic += Math.floor(basemagic * 0.25 * bottles);
    } else {
      basemagic += basemagic * bottles;
    }
  }

  return basemagic >= smallmagic;
}

// ============================================================================
// Health and Heart Management
// ============================================================================

/**
 * Calculate the total heart count respecting difficulty limits.
 *
 * Counts hearts from:
 * - Boss Heart Containers (limited by boss_heart_container_limit)
 * - Sanctuary Heart Container
 * - Piece of Heart (4 pieces = 1 heart, limited by heart_piece_limit)
 * - Base 3 starting hearts
 *
 * @param {Object} snapshot - State snapshot with inventory
 * @param {Object} staticData - Static game data with difficulty_requirements
 * @returns {number} Total heart count (minimum 3)
 *
 * @example
 * heart_count(snapshot, staticData) // Returns 3-13+ depending on items and limits
 */
export function heart_count(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Get difficulty requirements from settings
  const diffReqs = staticData.settings?.[playerSlot]?.difficulty_requirements || {};
  const bossHeartLimit = diffReqs.boss_heart_container_limit || 10;
  const heartPieceLimit = diffReqs.heart_piece_limit || 24;

  const bossHeartsRaw = count(snapshot, staticData, 'Boss Heart Container');
  const bossHearts = Math.min(bossHeartsRaw, bossHeartLimit);
  const sanctuaryHearts = count(snapshot, staticData, 'Sanctuary Heart Container');
  const piecesRaw = count(snapshot, staticData, 'Piece of Heart');
  const pieceHearts = Math.floor(Math.min(piecesRaw, heartPieceLimit) / 4);

  const total = bossHearts + sanctuaryHearts + pieceHearts + 3;

  return total; // +3 for starting hearts
}

export function enhanceLocationsWithShopData(snapshot, staticData) {
  // TODO: Implement shop data enhancement for locations
  // This function appears to be a worker-specific utility for enhancing location data with shop information
  // Requires: Complex integration between location data and shop data
  // Not critical for rule evaluation, more of a data processing utility
  return undefined;
}

export function can_revival_fairy_shop(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  const hasBottle = count(snapshot, staticData, 'Bottle') > 0;
  const minorGlitches = staticData.settings?.[playerSlot]?.mode === 'minor_glitches' ||
    staticData.settings?.[playerSlot]?.glitches_required === 'minor_glitches';
  return hasBottle && minorGlitches;
}

export function countGroup(snapshot, staticData, groupName) {
  // Count items in a specific group (e.g., "Bottles", "Crystals")

  if (!snapshot?.inventory) return 0;

  // Get player-specific item data
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  const itemsData = staticData?.itemsByPlayer?.[playerSlot] || staticData?.itemData || staticData?.items?.[playerSlot];

  if (!itemsData) return 0;

  let totalCount = 0;

  // Iterate through all items and check if they belong to the requested group
  for (const itemKey in itemsData) {
    const itemInfo = itemsData[itemKey];
    if (itemInfo?.groups?.includes(groupName)) {
      totalCount += count(snapshot, staticData, itemKey);
    }
  }

  return totalCount;
}

export function has_crystals_count(snapshot, staticData, crystalCount) {
  // Alternative crystal counting that uses group data
  const requiredCount = parseInt(crystalCount, 10) || 7;
  const actualCrystalCount = countGroup(snapshot, staticData, 'Crystals');
  return actualCrystalCount >= requiredCount;
}

export function can_reach_region(snapshot, staticData, regionName) {
  // Check if a specific region is reachable

  if (!snapshot.regionReachability) return false;
  return snapshot.regionReachability?.[regionName] === 'reachable';
}

export function can_get_bottle(snapshot, staticData) {
  // Check if player can obtain any bottle
  // This is a simplified version - full implementation would check specific bottle locations
  return count(snapshot, staticData, 'Bottle') > 0 ||
    can_reach_region(snapshot, staticData, 'Bottle Merchant') ||
    can_reach_region(snapshot, staticData, 'Magic Shop');
}

export function zip(snapshot, staticData, arrays) {
  // Python's zip function - combines multiple iterables element-wise
  // Expected usage: zip([list1], [list2], ...) -> [[item1_from_list1, item1_from_list2], ...]
  // When called from rule engine, arrays is an array of arguments: [arg1, arg2, ...]

  if (!Array.isArray(arrays) || arrays.length === 0) {
    return [];
  }

  // arrays contains the arguments to zip together

  // Ensure we have valid arrays to work with
  const validArrays = arrays.filter(arr => Array.isArray(arr));

  if (validArrays.length === 0) {
    return [];
  }

  // Get the shortest length among all arrays
  const minLength = Math.min(...validArrays.map(arr => arr.length));

  // Create the zipped result
  const result = [];
  for (let i = 0; i < minLength; i++) {
    const tuple = validArrays.map(arr => arr[i]);
    result.push(tuple);
  }

  return result;
}

export function len(snapshot, staticData, collection) {
  // Python's len function - returns the length of a collection
  if (Array.isArray(collection)) {
    return collection.length;
  } else if (typeof collection === 'string') {
    return collection.length;
  } else if (collection && typeof collection === 'object') {
    return Object.keys(collection).length;
  }
  return 0;
}

// ============================================================================
// Python Utility Functions (for rule compatibility)
// ============================================================================

// Additional utility functions that provide Python-like functionality for rules

export function can_bomb_things(snapshot, staticData, quantity) {
  // Alias for can_use_bombs for rule compatibility
  return can_use_bombs(snapshot, staticData, quantity);
}

export function can_pass_curtains(snapshot, staticData) {
  // Curtains can be passed with lantern or fire rod
  return has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod');
}

export function can_see_in_dark(snapshot, staticData) {
  // Alias for can_pass_curtains
  return can_pass_curtains(snapshot, staticData);
}

export function can_pass_rocks(snapshot, staticData) {
  // Rocks can be lifted or bombed
  return can_lift_rocks(snapshot, staticData) ||
    can_use_bombs(snapshot, staticData, '1');
}

export function can_swim(snapshot, staticData) {
  // Need flippers to swim
  return has(snapshot, staticData, 'Flippers');
}

export function can_waterwalk(snapshot, staticData) {
  // Water walking boots or hookshot for crossing water
  return has(snapshot, staticData, 'Flippers') || has(snapshot, staticData, 'Hookshot');
}

export function can_reach_light_world(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if light world is accessible
  const gameMode = staticData.settings?.[playerSlot]?.mode || staticData.settings?.[playerSlot]?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    // In inverted mode, need Moon Pearl to access light world safely
    return has(snapshot, staticData, 'Moon Pearl');
  }
  return true; // Always accessible in standard mode
}

export function can_reach_dark_world(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if dark world is accessible
  const gameMode = staticData.settings?.[playerSlot]?.mode || staticData.settings?.[playerSlot]?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    return true; // Always accessible in inverted mode
  } else {
    // Need access to dark world portals or magic mirror
    return has(snapshot, staticData, 'Moon Pearl') &&
      (has(snapshot, staticData, 'Magic Mirror') ||
        can_reach_region(snapshot, staticData, 'Dark World'));
  }
}

export function open_mode(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if this is open mode (affects certain accessibility rules)
  return staticData.settings?.[playerSlot]?.mode === 'open' ||
    staticData.settings?.[playerSlot]?.open_pyramid === true;
}

export function swordless_mode(snapshot, staticData) {
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Check if this is swordless mode
  return staticData.settings?.[playerSlot]?.swordless === true ||
    (snapshot.flags && snapshot.flags.includes('swordless'));
}

// Helper function registry
export const helperFunctions = {
  // Core inventory functions
  has,
  count,

  // Movement and traversal
  is_not_bunny,
  can_fly,
  can_dash,
  can_flute,
  can_flute_spot_5,

  // Physical abilities
  can_lift_rocks,
  can_lift_heavy_rocks,
  can_light_torches,
  can_melt_things,
  can_bomb_or_bonk,

  // Combat and weapons
  can_kill_most_things,
  can_shoot_silver_arrows,
  can_defeat_ganon,
  can_defeat_boss,
  has_beam_sword,
  has_melee_weapon,
  has_rod,
  can_take_damage,

  // Magic and special abilities
  is_invincible,
  can_block_lasers,
  can_extend_magic,
  can_activate_crystal_switch,

  // Items and equipment
  has_bottle,
  bottle_count,
  can_get_good_bee,
  can_retrieve_tablet,
  has_hearts,
  can_heart_skip,
  has_fire_source,
  can_hold_arrows,

  // Game progression
  can_anima_transfigure,
  has_crystals,
  has_misery_mire_medallion,
  has_turtle_rock_medallion,

  // Glitches and advanced techniques
  can_bomb_clip,
  can_spin_speed,
  can_boots_clip_lw,
  can_boots_clip_dw,

  // Dungeon-specific
  can_complete_gt_climb,

  // Economy
  can_buy,
  can_buy_unlimited,

  // Critical functions from StateHelpers.py
  can_use_bombs,
  can_shoot_arrows,
  has_triforce_pieces,
  has_sword,
  has_any,
  location_item_name,
  tr_big_key_chest_keys_needed,
  item_name_in_location_names,
  GanonDefeatRule,
  has_crystals_for_ganon,
  can_get_glitched_speed_dw,
  _has_specific_key_count,
  basement_key_rule,
  cross_peg_bridge,
  can_extend_magic_complex,
  heart_count,
  enhanceLocationsWithShopData,
  can_revival_fairy_shop,
  countGroup,
  has_crystals_count,
  can_reach_region,
  can_get_bottle,
  zip,
  len,

  // Additional utility functions
  can_bomb_things,
  can_pass_curtains,
  can_see_in_dark,
  can_pass_rocks,
  can_swim,
  can_waterwalk,
  can_reach_light_world,
  can_reach_dark_world,
  open_mode,
  swordless_mode
};

// ============================================================================
// ALTTP State Management Module (Option 2 implementation)
// ============================================================================

/**
 * ALTTP-specific state management module
 * Handles game-specific state properties that were previously in ALTTPState
 */
export const alttpStateModule = {
  /**
   * Initialize ALTTP-specific state
   * @returns {Object} Initial ALTTP state object
   */
  initializeState() {
    return {
      gameMode: null,
      difficultyRequirements: {
        progressive_bottle_limit: 4,
        boss_heart_container_limit: 10,
        heart_piece_limit: 24,
      },
      requiredMedallions: ['Ether', 'Quake'], // Default medallions
      shops: [],
      treasureHuntRequired: 20,
      // BATCH 2: Add flags and events management
      flags: [], // Array of flags (replaces Set from ALTTPState)
      events: [], // Array of events (replaces Set from ALTTPState)
    };
  },

  /**
   * Load game settings and update ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {Object} settings - Settings from rules JSON
   * @returns {Object} Updated ALTTP state
   */
  loadSettings(gameState, settings) {
    if (!settings) return gameState;

    const updatedState = { ...gameState };

    // Store game mode
    updatedState.gameMode = settings.game_mode || 'standard';

    // Store difficulty requirements
    if (settings.difficulty_requirements) {
      updatedState.difficultyRequirements = {
        ...updatedState.difficultyRequirements,
        ...settings.difficulty_requirements,
      };
    }

    // Store medallions
    if (settings.required_medallions && Array.isArray(settings.required_medallions)) {
      updatedState.requiredMedallions = settings.required_medallions;
    }

    // Store treasure hunt count
    if (typeof settings.treasure_hunt_required === 'number') {
      updatedState.treasureHuntRequired = settings.treasure_hunt_required;
    }

    // BATCH 2: Set common flags based on settings (from ALTTPState.loadSettings)
    if (settings.bombless_start) {
      updatedState = this.setFlag(updatedState, 'bombless_start');
    }
    if (settings.retro_bow) {
      updatedState = this.setFlag(updatedState, 'retro_bow');
    }
    if (settings.swordless) {
      updatedState = this.setFlag(updatedState, 'swordless');
    }
    if (settings.enemy_shuffle) {
      updatedState = this.setFlag(updatedState, 'enemy_shuffle');
    }

    return updatedState;
  },

  /**
   * Load shop data
   * @param {Object} gameState - Current ALTTP game state
   * @param {Array} shops - Array of shop data objects
   * @returns {Object} Updated ALTTP state
   */
  loadShops(gameState, shops) {
    return {
      ...gameState,
      shops: shops || [],
    };
  },

  /**
   * Get state data for snapshot (backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Object} State data for snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      gameMode: gameState.gameMode,
      difficultyRequirements: gameState.difficultyRequirements,
      requiredMedallions: gameState.requiredMedallions,
      shops: gameState.shops,
      treasureHuntRequired: gameState.treasureHuntRequired,
      // BATCH 2: Include flags and events in snapshot
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },

  /**
   * Reset ALTTP state to defaults
   * @returns {Object} Reset ALTTP state
   */
  resetState() {
    return this.initializeState();
  },

  // BATCH 2: Flags and Events Management Functions

  /**
   * Set a flag in the ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} flagName - Name of the flag to set
   * @returns {Object} Updated ALTTP state
   */
  setFlag(gameState, flagName) {
    const updatedState = { ...gameState };
    if (!updatedState.flags.includes(flagName)) {
      updatedState.flags = [...updatedState.flags, flagName];
    }
    return updatedState;
  },

  /**
   * Check if a flag is set
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} flagName - Name of the flag to check
   * @returns {boolean} True if flag is set
   */
  hasFlag(gameState, flagName) {
    return gameState.flags && gameState.flags.includes(flagName);
  },

  /**
   * Set an event in the ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} eventName - Name of the event to set
   * @returns {Object} Updated ALTTP state
   */
  setEvent(gameState, eventName) {
    const updatedState = { ...gameState };
    if (!updatedState.events.includes(eventName)) {
      updatedState.events = [...updatedState.events, eventName];
    }
    return updatedState;
  },

  /**
   * Check if an event is set (checks both flags and events)
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} eventName - Name of the event to check
   * @returns {boolean} True if event is set
   */
  hasEvent(gameState, eventName) {
    return (gameState.flags && gameState.flags.includes(eventName)) ||
      (gameState.events && gameState.events.includes(eventName));
  },

  /**
   * Process an event item and set appropriate event flag
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} itemName - Name of the item that triggers an event
   * @returns {Object} Updated ALTTP state or null if no event triggered
   */
  processEventItem(gameState, itemName) {
    // Event mapping from ALTTPState
    const eventMapping = {
      'Beat Agahnim 1': 'Beat Agahnim 1',
      'Beat Agahnim 2': 'Beat Agahnim 2',
      'Open Floodgate': 'Open Floodgate',
      'Crystal 1': 'Crystal 1',
      'Crystal 2': 'Crystal 2',
      'Crystal 3': 'Crystal 3',
      'Crystal 4': 'Crystal 4',
      'Crystal 5': 'Crystal 5',
      'Crystal 6': 'Crystal 6',
      'Crystal 7': 'Crystal 7',
      'Red Pendant': 'Red Pendant',
      'Blue Pendant': 'Blue Pendant',
      'Green Pendant': 'Green Pendant',
      'Get Frog': 'Get Frog',
      'Pick Up Purple Chest': 'Pick Up Purple Chest',
      'Return Smith': 'Return Smith',
      'Shovel': 'Shovel',
      'Flute': 'Flute',
      'Activated Flute': 'Activated Flute',
    };

    if (eventMapping[itemName]) {
      return this.setEvent(gameState, eventMapping[itemName]);
    }
    return null; // No event triggered
  },

  /**
   * Check if an item/flag/event exists (unified check)
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} itemName - Name to check (could be flag or event)
   * @returns {boolean} True if item/flag/event exists
   */
  has(gameState, itemName) {
    // Check if it's an event first
    if (this.hasEvent(gameState, itemName)) {
      return true;
    }
    // Else fall back to flag check
    return this.hasFlag(gameState, itemName);
  },

  /**
   * Get flags array (for backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Array} Array of flags
   */
  getFlags(gameState) {
    return gameState.flags || [];
  },

  /**
   * Get events array (for backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Array} Array of events
   */
  getEvents(gameState) {
    return gameState.events || [];
  },

  /**
   * Build state object with multiworld structure for rule compatibility
   * This creates a state object that matches the structure expected by Python rules
   * @param {Object} gameState - Current ALTTP game state
   * @param {Object} settings - Game settings
   * @param {number} playerSlot - Player slot number
   * @returns {Object} State object with multiworld structure
   */
  buildStateWithMultiworld(gameState, settings, playerSlot) {
    return {
      ...gameState,
      multiworld: {
        worlds: {
          [playerSlot]: {
            options: {
              ...settings // Include all settings as options (exported from Python)
            }
          }
        }
      }
    };
  }
};