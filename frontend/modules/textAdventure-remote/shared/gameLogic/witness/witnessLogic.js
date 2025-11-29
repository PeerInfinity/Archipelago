/**
 * The Witness Game Logic Module
 *
 * Provides helper functions for The Witness-specific rule evaluation.
 */

/**
 * Check if a region is reachable
 * @param {Object} snapshot - The state snapshot
 * @param {Object} staticData - The static data
 * @param {string} regionName - The name of the region to check
 * @returns {boolean} True if the region is reachable
 */
function can_reach_region(snapshot, staticData, regionName) {
  // Access region reachability from snapshot
  // The snapshot uses regionReachability (an object mapping region names to 'reachable'/'unreachable')
  const regionReachability = snapshot?.regionReachability;

  if (!regionReachability) {
    return false;
  }

  // Check if the region is marked as reachable
  return regionReachability[regionName] === 'reachable';
}

/**
 * Export helper functions
 */
export const helperFunctions = {
  can_reach_region,
};
