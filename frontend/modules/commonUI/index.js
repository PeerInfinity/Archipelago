import {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
} from './commonUI.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'CommonUI',
  description: 'Provides shared UI utility functions and components.',
};

// No registration, initialization, or post-initialization needed for this utility module.

// Re-export the imported functions and the locally defined one
export {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  createStateSnapshotInterface,
};

/**
 * Creates a consistent interface object for accessing state information,
 * primarily for use with evaluateRule on the main thread.
 * @param {object} snapshot - The state snapshot (from StateManagerProxy).
 * @param {object} staticData - Static game data (items, groups, locations, regions).
 * @returns {object} An interface object with methods like hasItem, countItem, etc.
 */
export function createStateSnapshotInterface(snapshot, staticData) {
  if (!snapshot || !staticData) {
    console.warn(
      '[createStateSnapshotInterface] Called with null snapshot or staticData. Returning limited interface.'
    );
    // Return a dummy interface that always returns false/0/null to prevent errors
    return {
      hasItem: () => false,
      getItemCount: () => 0,
      hasGroup: () => false,
      countGroup: () => 0,
      hasFlag: () => false,
      getSetting: () => undefined,
      getAllSettings: () => ({}),
      isRegionReachable: () => false,
      isLocationChecked: () => false,
      executeHelper: () => false, // Cannot execute helpers
      executeStateManagerMethod: () => false, // Cannot execute manager methods
      getCurrentRegion: () => null,
      getAllItems: () => ({}),
      getAllLocations: () => [],
      getAllRegions: () => ({}),
      getPlayerSlot: () => 1,
      getDifficultyRequirements: () => ({}),
      getShops: () => [],
      getGameMode: () => null,
      getStaticData: () => staticData || {},
      // --- ADDED: Staleness Check --- >
      isPotentiallyStale: () =>
        stateManagerProxySingleton.isSnapshotPotentiallyStale(),
    };
  }

  // Helper to safely get item data
  const getItemData = (itemName) => staticData.items?.[itemName];
  const getGroupData = (groupName) => staticData.groups?.[groupName];

  return {
    // Inventory checks (use snapshot.inventory)
    hasItem: (itemName) => (snapshot.inventory?.[itemName] ?? 0) > 0,
    getItemCount: (itemName) => snapshot.inventory?.[itemName] ?? 0,

    // Group checks (iterate through group items and sum counts from snapshot)
    hasGroup: (groupName) => {
      const groupInfo = getGroupData(groupName);
      if (!groupInfo || !groupInfo.items) return false;
      return groupInfo.items.some(
        (item) => (snapshot.inventory?.[item] ?? 0) > 0
      );
    },
    countGroup: (groupName) => {
      const groupInfo = getGroupData(groupName);
      if (!groupInfo || !groupInfo.items) return 0;
      return groupInfo.items.reduce(
        (sum, item) => sum + (snapshot.inventory?.[item] ?? 0),
        0
      );
    },

    // Flag checks (use snapshot.flags or snapshot.checkedLocations)
    hasFlag: (flagName) =>
      snapshot.flags?.includes(flagName) ||
      snapshot.checkedLocations?.includes(flagName) ||
      false,

    // Setting checks (use snapshot.settings)
    getSetting: (settingName) => snapshot.settings?.[settingName],
    getAllSettings: () => snapshot.settings || {},

    // --- MODIFIED: Reachability Check (use snapshot.reachability) --- >
    isRegionReachable: (regionName) =>
      snapshot.reachability?.[regionName] === true,

    // Checked location checks (use snapshot.checkedLocations)
    isLocationChecked: (locName) =>
      snapshot.checkedLocations?.includes(locName) || false,

    // --- Cannot execute helpers or manager methods on main thread --- >
    executeHelper: (name /* ...args */) => {
      console.warn(
        `[SnapshotInterface] Attempted to execute helper '${name}' on main thread.`
      );
      return false;
    },
    executeStateManagerMethod: (name /* ...args */) => {
      console.warn(
        `[SnapshotInterface] Attempted to execute StateManager method '${name}' on main thread.`
      );
      return false;
    },

    // Other potential methods needed by rules/helpers, based on snapshot/static data
    getCurrentRegion: () => null, // Often requires live state, return null from snapshot
    getAllItems: () => staticData.items || {},
    getAllLocations: () => staticData.locations || [], // Use aggregated static data
    getAllRegions: () => staticData.regions || {}, // Use original static data
    getPlayerSlot: () => snapshot.playerSlot ?? 1,
    getDifficultyRequirements: () => snapshot.difficultyRequirements || {},
    getShops: () => snapshot.shops || [],
    getGameMode: () => snapshot.gameMode || null,

    // Provide access to static data if needed directly
    getStaticData: () => staticData,

    // --- ADDED: Staleness Check --- >
    isPotentiallyStale: () =>
      stateManagerProxySingleton.isSnapshotPotentiallyStale(),
  };
}

// Provide a default export object containing all functions for convenience,
// matching the previous structure consumers might expect.
export default {
  renderLogicTree,
  debounce,
  setColorblindMode,
  createRegionLink,
  createLocationLink,
  applyColorblindClass,
  createStateSnapshotInterface,
};
