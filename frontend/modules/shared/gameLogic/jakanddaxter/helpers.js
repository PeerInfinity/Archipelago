/**
 * Jak and Daxter: The Precursor Legacy Helper Functions
 *
 * Only contains helpers that cannot be expressed through the rule system.
 * Most helpers are now inlined by the Python exporter.
 */

/**
 * Check if player can reach enough orbs for trading.
 * This is used when orbsanity is off (default). "Reachable Orbs" is a virtual
 * progressive item that gets calculated based on accessible orb regions.
 *
 * This helper cannot be exported because it iterates through regions
 * and sums orb counts based on reachability - complex runtime logic.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data (regions is a Map)
 * @param {number} requiredOrbs - Number of orbs required
 * @returns {boolean} True if player has enough reachable orbs
 */
export function can_reach_orbs(snapshot, staticData, requiredOrbs) {
  try {
    if (!staticData || !staticData.regions) {
      console.warn('[can_reach_orbs] Missing staticData or regions');
      return false;
    }
    if (!snapshot.regionReachability) {
      console.warn('[can_reach_orbs] Missing regionReachability in snapshot');
      return false;
    }

    // Calculate reachable orbs by summing orb_count from all accessible regions
    let totalReachableOrbs = 0;

    // staticData.regions is a Map of region name -> region object
    // Iterate through all regions and sum orb counts for reachable ones
    for (const [regionName, region] of staticData.regions) {
      // Check if this region is reachable
      const reachability = snapshot.regionReachability[regionName];
      if (reachability === 'reachable') {
        if (region && typeof region.orb_count === 'number' && region.orb_count > 0) {
          totalReachableOrbs += region.orb_count;
        }
      }
    }

    return totalReachableOrbs >= requiredOrbs;
  } catch (error) {
    console.error('[can_reach_orbs] Error:', error);
    return false;
  }
}

/**
 * Check if player can reach enough orbs for a specific level.
 * This is used when per-level orbsanity is enabled. Each level tracks
 * its own "Reachable Orbs" count based on accessible orb regions within that level.
 *
 * This helper cannot be exported because it iterates through regions
 * and sums orb counts based on reachability - complex runtime logic.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data (regions is a Map)
 * @param {string} levelName - The level to check (e.g., "Forbidden Jungle")
 * @param {number} requiredOrbs - Number of orbs required
 * @returns {boolean} True if player has enough reachable orbs in this level
 */
export function can_reach_orbs_level(snapshot, staticData, levelName, requiredOrbs) {
  try {
    if (!staticData || !staticData.regions) {
      console.warn('[can_reach_orbs_level] Missing staticData or regions');
      return false;
    }
    if (!snapshot.regionReachability) {
      console.warn('[can_reach_orbs_level] Missing regionReachability in snapshot');
      return false;
    }

    // Calculate reachable orbs by summing orb_count from accessible regions in this level
    let totalReachableOrbs = 0;

    // staticData.regions is a Map of region name -> region object
    // Iterate through all regions and sum orb counts for reachable ones in this level
    for (const [regionName, region] of staticData.regions) {
      // Check if this region belongs to the specified level
      // Region names are formatted as "Level Name Region Name" (e.g., "Forbidden Jungle Main Area")
      if (regionName.startsWith(levelName + ' ')) {
        const reachability = snapshot.regionReachability[regionName];
        if (reachability === 'reachable') {
          if (region && typeof region.orb_count === 'number' && region.orb_count > 0) {
            totalReachableOrbs += region.orb_count;
          }
        }
      }
    }

    return totalReachableOrbs >= requiredOrbs;
  } catch (error) {
    console.error('[can_reach_orbs_level] Error:', error);
    return false;
  }
}

// Export all helpers as default for game logic registry
export default {
  can_reach_orbs,
  can_reach_orbs_level
};
