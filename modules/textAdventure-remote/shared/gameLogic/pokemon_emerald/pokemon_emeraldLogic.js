/**
 * Thread-agnostic Pokemon Emerald game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 *
 * Ported from worlds/pokemon_emerald/logic.py
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

/**
 * Check if player has an item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // Check flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Check events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;
  return (snapshot.inventory[itemName] || 0) > 0;
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has all items in a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - List of item names
 * @returns {boolean} True if player has all items
 */
export function has_all(snapshot, staticData, items) {
  for (const item of items) {
    if (!has(snapshot, staticData, item)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if player has any item in a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - List of item names
 * @returns {boolean} True if player has any item
 */
export function has_any(snapshot, staticData, items) {
  for (const item of items) {
    if (has(snapshot, staticData, item)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if inventory has at least N unique items from a group
 * Counts each item type only once (ignores duplicates)
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} groupName - Name of the item group
 * @param {number} count - Minimum number of unique items required
 * @returns {boolean} True if unique items from group >= count
 */
export function has_group_unique(snapshot, staticData, groupName, requiredCount = 1) {
  if (typeof groupName !== 'string') {
    console.warn('[Pokemon Emerald has_group_unique] groupName is not a string:', groupName);
    return false;
  }
  if (typeof requiredCount !== 'number' || requiredCount < 0) {
    console.warn('[Pokemon Emerald has_group_unique] count is not a valid number:', requiredCount);
    return false;
  }

  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  const playerItemGroups = staticData?.item_groups?.[playerSlot] || staticData?.item_groups;

  let uniqueItemsFound = 0;

  if (Array.isArray(playerItemGroups)) {
    // ALTTP-style with group names as array
    const playerItemsData = staticData.itemsByPlayer && staticData.itemsByPlayer[playerSlot];
    if (playerItemsData) {
      for (const itemName in playerItemsData) {
        if (playerItemsData[itemName]?.groups?.includes(groupName)) {
          const itemCount = snapshot.inventory[itemName] || 0;
          if (itemCount > 0) {
            uniqueItemsFound++;
            if (uniqueItemsFound >= requiredCount) {
              return true;
            }
          }
        }
      }
    }
  } else if (
    typeof playerItemGroups === 'object' &&
    playerItemGroups[groupName] &&
    Array.isArray(playerItemGroups[groupName])
  ) {
    // Item_groups is an object { groupName: [itemNames...] }
    for (const itemInGroup of playerItemGroups[groupName]) {
      const itemCount = snapshot.inventory[itemInGroup] || 0;
      if (itemCount > 0) {
        uniqueItemsFound++;
        if (uniqueItemsFound >= requiredCount) {
          return true;
        }
      }
    }
  } else if (staticData?.groups) {
    // Fallback to old groups structure if available
    const playerGroups = staticData.groups[playerSlot] || staticData.groups;
    if (
      typeof playerGroups === 'object' &&
      playerGroups[groupName] &&
      Array.isArray(playerGroups[groupName])
    ) {
      for (const itemInGroup of playerGroups[groupName]) {
        const itemCount = snapshot.inventory[itemInGroup] || 0;
        if (itemCount > 0) {
          uniqueItemsFound++;
          if (uniqueItemsFound >= requiredCount) {
            return true;
          }
        }
      }
    }
  }

  return uniqueItemsFound >= requiredCount;
}

// Helper function to get world options
function getOptions(staticData) {
  // Settings are nested by player ID
  const playerId = staticData?.playerId || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerId] || staticData?.settings || {};
  return settings;
}

// Helper function to get game-specific data from game_info
function getGameData(staticData, key) {
  const playerId = staticData?.playerId || DEFAULT_PLAYER_ID;

  // Try to get from game_info first (nested by player)
  if (staticData?.game_info?.[playerId]?.[key]) {
    return staticData.game_info[playerId][key];
  }

  // Fallback to settings for backward compatibility
  if (staticData?.settings?.[playerId]?.[key]) {
    return staticData.settings[playerId][key];
  }

  // Fallback to top-level (for backward compatibility)
  if (staticData?.[key]) {
    return staticData[key];
  }

  return null;
}

/**
 * Get HM requirements from game data
 * Returns a mapping of HM names to badge requirements
 * Badge requirements can be either:
 * - Array of badge names (all required)
 * - Number (count of unique badges required)
 */
function getHMRequirements(staticData) {
  return getGameData(staticData, 'hm_requirements') || {};
}

/**
 * Check if player can use a specific HM
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} hmName - Name of the HM (e.g., "HM01 Cut")
 * @returns {boolean} True if player can use the HM
 */
export function can_use_hm(snapshot, staticData, hmName) {
  const hmRequirements = getHMRequirements(staticData);
  const badges = hmRequirements[hmName];

  // Must have the HM item
  if (!has(snapshot, staticData, hmName)) {
    return false;
  }

  // No badge requirements
  if (!badges) {
    return true;
  }

  // Check badge requirements
  if (Array.isArray(badges)) {
    // Specific badges required
    return has_all(snapshot, staticData, badges);
  } else if (typeof badges === 'number') {
    // Any N unique badges required
    return has_group_unique(snapshot, staticData, 'Badge', badges);
  }

  return true;
}

/**
 * Check if player can use Cut
 */
export function can_cut(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM01 Cut");
}

/**
 * Check if player can use Flash
 */
export function can_flash(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM05 Flash");
}

/**
 * Check if player can use Rock Smash
 */
export function can_rock_smash(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM06 Rock Smash");
}

/**
 * Check if player can use Strength
 */
export function can_strength(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM04 Strength");
}

/**
 * Check if player can use Surf
 */
export function can_surf(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM03 Surf");
}

/**
 * Check if player can use Fly
 */
export function can_fly(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM02 Fly");
}

/**
 * Check if player can use Dive
 */
export function can_dive(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM08 Dive");
}

/**
 * Check if player can use Waterfall
 */
export function can_waterfall(snapshot, staticData) {
  return can_use_hm(snapshot, staticData, "HM07 Waterfall");
}

/**
 * Check if player has a certain number of badges
 */
export function has_badges(snapshot, staticData, badgeCount) {
  return has_group_unique(snapshot, staticData, 'Badge', badgeCount);
}

// Export all helper functions
export const helperFunctions = {
  has,
  count,
  has_all,
  has_any,
  has_group_unique,
  can_use_hm,
  can_cut,
  can_flash,
  can_rock_smash,
  can_strength,
  can_surf,
  can_fly,
  can_dive,
  can_waterfall,
  has_badges
};

// Use generic state module
import { genericStateModule } from '../generic/genericLogic.js';
export const pokemon_emeraldStateModule = genericStateModule;
