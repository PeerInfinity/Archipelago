/**
 * Helper functions for The Witness
 *
 * These helpers handle special cases in The Witness logic that cannot be
 * directly exported from the Python access rules.
 */

/**
 * Check if a region is reachable
 * @param {Object} state - The state manager instance
 * @param {string} regionName - The name of the region to check
 * @returns {boolean} True if the region is reachable
 */
function can_reach_region(state, regionName) {
  // Ensure reachable regions are up to date
  if (state.stale && state.stale[state.player]) {
    state.updateReachableRegions(state.player);
  }

  // Check if the region is in the reachable regions set
  const reachableRegions = state.reachableRegions && state.reachableRegions[state.player];
  if (!reachableRegions) {
    return false;
  }

  // The reachableRegions is a Set of region names
  return reachableRegions.has(regionName);
}

/**
 * Export helper functions to be available to the rule engine
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    can_reach_region,
  };
}
