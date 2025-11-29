/**
 * Thread-agnostic Kirby's Dream Land 3 game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 *
 * Corresponds to helper functions in worlds/kdl3/rules.py
 */

/**
 * Check if player has an item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {string} itemName - Name of the item to check
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // First check if it's in flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Also check state.events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Direct item check
  if ((snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  return false;
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {string} itemName - Name of the item to count
 * @param {Object} staticData - Static game data
 * @returns {number} Number of items
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player can reach Rick (has Rick and Rick Spawn)
 * Corresponds to can_reach_rick in worlds/kdl3/rules.py:20
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Rick
 */
export function can_reach_rick(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Rick') && has(snapshot, staticData, 'Rick Spawn');
}

/**
 * Check if player can reach Kine (has Kine and Kine Spawn)
 * Corresponds to can_reach_kine in worlds/kdl3/rules.py:24
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Kine
 */
export function can_reach_kine(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Kine') && has(snapshot, staticData, 'Kine Spawn');
}

/**
 * Check if player can reach Coo (has Coo and Coo Spawn)
 * Corresponds to can_reach_coo in worlds/kdl3/rules.py:28
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Coo
 */
export function can_reach_coo(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Coo') && has(snapshot, staticData, 'Coo Spawn');
}

/**
 * Check if player can reach Nago (has Nago and Nago Spawn)
 * Corresponds to can_reach_nago in worlds/kdl3/rules.py:32
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Nago
 */
export function can_reach_nago(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Nago') && has(snapshot, staticData, 'Nago Spawn');
}

/**
 * Check if player can reach ChuChu (has ChuChu and ChuChu Spawn)
 * Corresponds to can_reach_chuchu in worlds/kdl3/rules.py:36
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach ChuChu
 */
export function can_reach_chuchu(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'ChuChu') && has(snapshot, staticData, 'ChuChu Spawn');
}

/**
 * Check if player can reach Pitch (has Pitch and Pitch Spawn)
 * Corresponds to can_reach_pitch in worlds/kdl3/rules.py:40
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Pitch
 */
export function can_reach_pitch(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pitch') && has(snapshot, staticData, 'Pitch Spawn');
}

/**
 * Check if player can reach Burning ability (has Burning and Burning Ability)
 * Corresponds to can_reach_burning in worlds/kdl3/rules.py:44
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Burning ability
 */
export function can_reach_burning(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Burning') && has(snapshot, staticData, 'Burning Ability');
}

/**
 * Check if player can reach Stone ability (has Stone and Stone Ability)
 * Corresponds to can_reach_stone in worlds/kdl3/rules.py:48
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Stone ability
 */
export function can_reach_stone(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Stone') && has(snapshot, staticData, 'Stone Ability');
}

/**
 * Check if player can reach Ice ability (has Ice and Ice Ability)
 * Corresponds to can_reach_ice in worlds/kdl3/rules.py:52
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Ice ability
 */
export function can_reach_ice(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Ice') && has(snapshot, staticData, 'Ice Ability');
}

/**
 * Check if player can reach Needle ability (has Needle and Needle Ability)
 * Corresponds to can_reach_needle in worlds/kdl3/rules.py:56
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Needle ability
 */
export function can_reach_needle(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Needle') && has(snapshot, staticData, 'Needle Ability');
}

/**
 * Check if player can reach Clean ability (has Clean and Clean Ability)
 * Corresponds to can_reach_clean in worlds/kdl3/rules.py:60
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Clean ability
 */
export function can_reach_clean(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Clean') && has(snapshot, staticData, 'Clean Ability');
}

/**
 * Check if player can reach Parasol ability (has Parasol and Parasol Ability)
 * Corresponds to can_reach_parasol in worlds/kdl3/rules.py:64
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Parasol ability
 */
export function can_reach_parasol(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Parasol') && has(snapshot, staticData, 'Parasol Ability');
}

/**
 * Check if player can reach Spark ability (has Spark and Spark Ability)
 * Corresponds to can_reach_spark in worlds/kdl3/rules.py:68
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Spark ability
 */
export function can_reach_spark(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Spark') && has(snapshot, staticData, 'Spark Ability');
}

/**
 * Check if player can reach Cutter ability (has Cutter and Cutter Ability)
 * Corresponds to can_reach_cutter in worlds/kdl3/rules.py:72
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {any} itemName - Not used for this helper
 * @returns {boolean} True if player can reach Cutter ability
 */
export function can_reach_cutter(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Cutter') && has(snapshot, staticData, 'Cutter Ability');
}

/**
 * Check if player can reach a boss location
 * Corresponds to can_reach_boss in worlds/kdl3/rules.py:12
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} level - The level number (1-5)
 * @param {number} open_world - Whether open world mode is enabled (0 or 1)
 * @param {number} ow_boss_req - Number of stage completions required in open world mode
 * @param {Object} player_levels - Dictionary mapping level numbers to location IDs
 * @returns {boolean} True if player can reach the boss
 */
export function can_reach_boss(snapshot, staticData, level, open_world, ow_boss_req, player_levels) {
  // Map of level number to level name
  const level_names = {
    1: 'Grass Land',
    2: 'Ripple Field',
    3: 'Sand Canyon',
    4: 'Cloudy Park',
    5: 'Iceberg'
  };

  if (open_world) {
    // In open world mode, check if player has enough stage completions for this level
    const level_name = level_names[level];
    if (!level_name) return false;

    const stage_completion_item = `${level_name} - Stage Completion`;
    return count(snapshot, staticData, stage_completion_item) >= ow_boss_req;
  } else {
    // In non-open world mode, check if player can reach the boss location
    // The boss location is the last location in the level (index 6)
    const level_locations = player_levels[level];
    if (!level_locations || level_locations.length < 7) return false;

    const boss_location_id = level_locations[6]; // Index 6 is the boss location

    // Check if the boss location is accessible
    if (!snapshot.accessible_locations) return false;
    return snapshot.accessible_locations.includes(boss_location_id);
  }
}

/**
 * Check if player can assemble R.O.B (specific enemy/ability combination check)
 * Corresponds to can_assemble_rob in worlds/kdl3/rules.py:89
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Object} copy_abilities - Dictionary mapping enemy names to their abilities
 * @returns {boolean} True if player can assemble R.O.B
 */
export function can_assemble_rob(snapshot, staticData, copy_abilities) {
  // Check animal requirements: must have both Coo and Kine
  if (!can_reach_coo(snapshot, staticData) || !can_reach_kine(snapshot, staticData)) {
    return false;
  }

  // Enemy restrictive requirements from worlds/kdl3/names/enemy_abilities.py:810-822
  // This is indices 1-4 of the enemy_restrictive array (Python's [1:5])
  const enemy_restrictive = [
    // Index 1: Parasol OR Cutter from Bukisets
    {
      abilities: ['Parasol Ability', 'Cutter Ability'],
      bukisets: ['Bukiset (Parasol)', 'Bukiset (Cutter)']
    },
    // Index 2: Spark OR Clean from Bukisets
    {
      abilities: ['Spark Ability', 'Clean Ability'],
      bukisets: ['Bukiset (Spark)', 'Bukiset (Clean)']
    },
    // Index 3: Ice OR Needle from Bukisets
    {
      abilities: ['Ice Ability', 'Needle Ability'],
      bukisets: ['Bukiset (Ice)', 'Bukiset (Needle)']
    },
    // Index 4: Stone OR Burning from Bukisets
    {
      abilities: ['Stone Ability', 'Burning Ability'],
      bukisets: ['Bukiset (Stone)', 'Bukiset (Burning)']
    }
  ];

  // Ability map: maps ability names to their check functions
  const ability_map = {
    'No Ability': () => true,
    'Burning Ability': can_reach_burning,
    'Stone Ability': can_reach_stone,
    'Ice Ability': can_reach_ice,
    'Needle Ability': can_reach_needle,
    'Clean Ability': can_reach_clean,
    'Parasol Ability': can_reach_parasol,
    'Spark Ability': can_reach_spark,
    'Cutter Ability': can_reach_cutter
  };

  // Check each restrictive requirement
  for (const {abilities, bukisets} of enemy_restrictive) {
    // Find bukisets where the copy ability is in the required abilities list
    const matching_bukisets = bukisets.filter(bukiset =>
      copy_abilities[bukiset] && abilities.includes(copy_abilities[bukiset])
    );

    // Check if we can reach any of the matching abilities
    let can_reach_any = false;
    for (const bukiset of matching_bukisets) {
      const ability = copy_abilities[bukiset];
      const ability_checker = ability_map[ability];
      if (ability_checker && ability_checker(snapshot, staticData)) {
        can_reach_any = true;
        break;
      }
    }

    // If we can't reach any of the required abilities for this group, fail
    if (!can_reach_any) {
      return false;
    }
  }

  // Finally, must have both Parasol and Stone abilities
  return can_reach_parasol(snapshot, staticData) && can_reach_stone(snapshot, staticData);
}

/**
 * Check if player can fix Angel Wings (specific enemy/ability combination check)
 * Corresponds to can_fix_angel_wings in worlds/kdl3/rules.py:106
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Object} copy_abilities - Dictionary mapping enemy names to their abilities
 * @returns {boolean} True if player can fix Angel Wings
 */
export function can_fix_angel_wings(snapshot, staticData, copy_abilities) {
  // Must be able to reach the abilities of these specific enemies
  const required_enemies = [
    'Sparky', 'Blocky', 'Jumper Shoot', 'Yuki',
    'Sir Kibble', 'Haboki', 'Boboo', 'Captain Stitch'
  ];

  // Ability map: maps ability names to their check functions
  const ability_map = {
    'No Ability': () => true,
    'Burning Ability': can_reach_burning,
    'Stone Ability': can_reach_stone,
    'Ice Ability': can_reach_ice,
    'Needle Ability': can_reach_needle,
    'Clean Ability': can_reach_clean,
    'Parasol Ability': can_reach_parasol,
    'Spark Ability': can_reach_spark,
    'Cutter Ability': can_reach_cutter
  };

  // Check if we can reach all required abilities
  for (const enemy of required_enemies) {
    const ability = copy_abilities[enemy];
    if (!ability) {
      return false; // Enemy not found in mapping
    }

    const ability_checker = ability_map[ability];
    if (!ability_checker) {
      return false; // Unknown ability
    }

    if (!ability_checker(snapshot, staticData)) {
      return false; // Can't reach this ability
    }
  }

  return true;
}

// Helper function registry
export const helperFunctions = {
  // Core inventory functions
  has,
  count,

  // Animal friend helpers
  can_reach_rick,
  can_reach_kine,
  can_reach_coo,
  can_reach_nago,
  can_reach_chuchu,
  can_reach_pitch,

  // Copy ability helpers
  can_reach_burning,
  can_reach_stone,
  can_reach_ice,
  can_reach_needle,
  can_reach_clean,
  can_reach_parasol,
  can_reach_spark,
  can_reach_cutter,

  // Boss access helper
  can_reach_boss,

  // Complex enemy/ability helpers
  can_assemble_rob,
  can_fix_angel_wings,
};
