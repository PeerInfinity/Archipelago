/**
 * Lingo game-specific logic functions
 * These pure functions operate on a canonical state object
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

/**
 * Get the player ID from snapshot and staticData using the standard pattern
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @returns {string|number} Player ID
 */
function getPlayerId(snapshot, staticData) {
  return snapshot?.player?.id || snapshot?.player?.slot || snapshot?.player || staticData?.playerId || DEFAULT_PLAYER_ID;
}

/**
 * Check if player can use an entrance
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @param {string} room - Target room name
 * @param {*} door - Door parameter (RoomAndDoor object or null/undefined)
 * @returns {boolean} True if entrance can be used
 */
export function lingo_can_use_entrance(snapshot, staticData, room, door) {
  // If door is null or undefined, the entrance is always accessible
  // This matches the Python logic: if door is None: return True
  if (door === null || door === undefined) {
    return true;
  }

  // Door is a RoomAndDoor tuple: [room_name, door_name]
  // door[0] is the room (can be null)
  // door[1] is the door name
  if (!Array.isArray(door) || door.length < 2) {
    console.error(`[lingo_can_use_entrance] Invalid door format: ${JSON.stringify(door)}`);
    return false;
  }

  // Determine the effective room: use door[0] if not null, otherwise use room parameter
  const effectiveRoom = door[0] !== null ? door[0] : room;
  const doorName = door[1];

  // Get player ID from snapshot (usually 1 for single-player)
  const playerId = getPlayerId(snapshot, staticData);
  const settings = staticData?.settings?.[playerId];

  // First, check if this door has access requirements
  const doorReqs = settings?.door_reqs?.[effectiveRoom]?.[doorName];

  if (doorReqs) {
    // This door has access requirements - check them first
    if (!_lingo_can_satisfy_requirements(snapshot, staticData, doorReqs)) {
      return false;
    }
  }

  // Then, check if this door requires an item (listed in item_by_door)
  const itemByDoor = settings?.item_by_door?.[effectiveRoom];
  if (itemByDoor && doorName in itemByDoor) {
    // This door requires an item - check if player has it
    const doorItemName = itemByDoor[doorName];
    const hasItem = !!(snapshot?.inventory && snapshot.inventory[doorItemName] > 0);
    return hasItem;
  }

  // Door has no requirements or item requirement - it's accessible
  return true;
}

/**
 * Check if player can access a location
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @param {*} location - Location access requirements
 * @returns {boolean} True if location can be accessed
 */
export function lingo_can_use_location(snapshot, staticData, location) {
  // This is a placeholder implementation
  // The actual logic would need to evaluate AccessRequirements
  // For now, return true to allow progression
  // TODO: Implement proper location access checking
  return true;
}

/**
 * Check if player has achieved enough mastery requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @returns {boolean} True if player has achieved mastery
 */
export function lingo_can_use_mastery_location(snapshot, staticData) {
  const playerId = getPlayerId(snapshot, staticData);
  const settings = staticData?.settings?.[playerId];

  if (!settings) {
    console.error('[lingo_can_use_mastery_location] No settings found');
    return false;
  }

  // Get the mastery requirements from settings
  const masteryReqs = settings.mastery_reqs;
  if (!masteryReqs || !Array.isArray(masteryReqs)) {
    console.warn('[lingo_can_use_mastery_location] No mastery_reqs in settings');
    return false;
  }

  // Get the mastery achievements requirement from settings
  const masteryAchievements = settings.mastery_achievements;
  if (!masteryAchievements || masteryAchievements <= 0) {
    // Mastery is disabled
    return true;
  }

  // Count how many mastery requirements are satisfied
  let satisfiedCount = 0;
  for (const accessReq of masteryReqs) {
    if (_lingo_can_satisfy_requirements(snapshot, staticData, accessReq)) {
      satisfiedCount++;
    }
  }

  // Return true if we've satisfied enough requirements
  return satisfiedCount >= masteryAchievements;
}

/**
 * Check if player can satisfy access requirements
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @param {Object} access - AccessRequirements object
 * @returns {boolean} True if all requirements are satisfied
 */
export function _lingo_can_satisfy_requirements(snapshot, staticData, access) {
  // Access should be an AccessRequirements object with these fields:
  // - rooms: array of room names that must be reachable
  // - doors: array of {room, door} objects that must be openable
  // - colors: array of color names required (if shuffle_colors)
  // - items: array of item names required
  // - progression: object mapping progressive item names to required counts
  // - the_master: boolean for mastery requirement
  // - postgame: boolean for postgame flag

  if (!access) {
    // No requirements means always accessible
    return true;
  }

  const playerId = getPlayerId(snapshot, staticData);

  // Check room requirements - all required rooms must be reachable
  if (access.rooms && access.rooms.length > 0) {
    const regionReachability = snapshot?.regionReachability || {};
    for (const roomName of access.rooms) {
      if (regionReachability[roomName] !== 'reachable') {
        return false;
      }
    }
  }

  // Check door requirements - all required doors must be openable
  if (access.doors && access.doors.length > 0) {
    for (const doorReq of access.doors) {
      // doorReq is {room, door}
      if (!_lingo_can_open_door(snapshot, staticData, doorReq.room, doorReq.door)) {
        return false;
      }
    }
  }

  // Check color requirements (only if shuffle_colors is enabled)
  // For now, we'll check if the setting is in staticData
  const settings = staticData?.settings?.[playerId] || {};
  const shuffleColors = settings.shuffle_colors;

  if (access.colors && access.colors.length > 0 && shuffleColors) {
    const inventory = snapshot?.inventory || {};
    for (const color of access.colors) {
      // Colors are capitalized in the item pool
      const colorItem = color.charAt(0).toUpperCase() + color.slice(1);
      if (!inventory[colorItem] || inventory[colorItem] < 1) {
        return false;
      }
    }
  }

  // Check item requirements - all required items must be in inventory
  if (access.items && access.items.length > 0) {
    const inventory = snapshot?.inventory || {};
    for (const itemName of access.items) {
      if (!inventory[itemName] || inventory[itemName] < 1) {
        return false;
      }
    }
  }

  // Check progressive item requirements - must have specific counts
  if (access.progression && Object.keys(access.progression).length > 0) {
    const inventory = snapshot?.inventory || {};
    for (const [itemName, requiredCount] of Object.entries(access.progression)) {
      const actualCount = inventory[itemName] || 0;
      if (actualCount < requiredCount) {
        return false;
      }
    }
  }

  // Check mastery requirement
  if (access.the_master) {
    // Check if player has achieved enough mastery requirements
    if (!lingo_can_use_mastery_location(snapshot, staticData)) {
      return false;
    }
  }

  // Check postgame requirement - if postgame is false and player has "Prevent Victory", deny access
  if (access.postgame === false) {
    const inventory = snapshot?.inventory || {};
    if (inventory['Prevent Victory'] && inventory['Prevent Victory'] > 0) {
      return false;
    }
  }

  return true;
}

/**
 * Helper function to check if a door can be opened
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @param {string} room - Room name
 * @param {string} door - Door name
 * @returns {boolean} True if the door can be opened
 */
function _lingo_can_open_door(snapshot, staticData, room, door) {
  const playerId = getPlayerId(snapshot, staticData);
  const settings = staticData?.settings?.[playerId];

  // First, check if this door has access requirements
  const doorReqs = settings?.door_reqs?.[room]?.[door];

  if (doorReqs) {
    // This door has access requirements - check them first
    if (!_lingo_can_satisfy_requirements(snapshot, staticData, doorReqs)) {
      return false;
    }
  }

  // Then, check if this door requires an item (listed in item_by_door)
  const itemByDoor = settings?.item_by_door?.[room];
  if (itemByDoor && door in itemByDoor) {
    // This door requires an item - check if player has it
    const doorItemName = itemByDoor[door];
    const inventory = snapshot?.inventory || {};
    const hasItem = !!(inventory[doorItemName] && inventory[doorItemName] > 0);
    return hasItem;
  }

  // Door has no requirements or item requirement - it's accessible
  return true;
}

/**
 * Check if player can access the LEVEL 2 location
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including rules
 * @returns {boolean} True if LEVEL 2 can be accessed
 */
export function lingo_can_use_level_2_location(snapshot, staticData) {
  const playerId = getPlayerId(snapshot, staticData);
  const settings = staticData?.settings?.[playerId];

  if (!settings) {
    console.error('[lingo_can_use_level_2_location] No settings found');
    return false;
  }

  // Get the level 2 requirement from settings
  const level2Requirement = settings.level_2_requirement;
  if (!level2Requirement || level2Requirement <= 1) {
    // Panel hunt is disabled
    return true;
  }

  // Count panels that satisfy requirements across all reachable regions
  let countedPanels = 0;
  const regionReachability = snapshot?.regionReachability || {};
  const countingPanelReqs = settings.counting_panel_reqs || {};

  // Iterate through all regions in the regionReachability map
  for (const [regionName, reachability] of Object.entries(regionReachability)) {
    // Only count panels in reachable regions
    if (reachability !== 'reachable') {
      continue;
    }

    // Get the counting panel requirements for this region
    const regionPanelReqs = countingPanelReqs[regionName];
    if (!regionPanelReqs || !Array.isArray(regionPanelReqs)) {
      continue;
    }

    // Each entry in regionPanelReqs is [access_req, panel_count]
    for (const [accessReq, panelCount] of regionPanelReqs) {
      if (_lingo_can_satisfy_requirements(snapshot, staticData, accessReq)) {
        countedPanels += panelCount;
      }
    }

    // Early exit if we've met the requirement
    // Note: Python code checks >= level_2_requirement - 1
    if (countedPanels >= level2Requirement - 1) {
      return true;
    }
  }

  // Check if we've met the requirement
  return countedPanels >= level2Requirement - 1;
}

/**
 * Generic helper functions module export
 */
export const helperFunctions = {
  lingo_can_use_entrance,
  lingo_can_use_location,
  lingo_can_use_mastery_location,
  lingo_can_use_level_2_location,
  _lingo_can_satisfy_requirements,
};
