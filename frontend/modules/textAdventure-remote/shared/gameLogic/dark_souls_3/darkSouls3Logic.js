/**
 * Dark Souls III-specific game logic and helper functions
 * Following the thread-agnostic helper function pattern.
 */

/**
 * Dark Souls III helper functions for rule evaluation.
 * All helpers follow the standardized signature: (snapshot, staticData, ...args)
 */
export const helperFunctions = {
  /**
   * Check if a location can be reached
   * This matches the Python behavior of self._can_get(state, location)
   *
   * In Python, state.can_reach_location() checks two things:
   * 1. Whether the location's region is reachable
   * 2. Whether the location's access_rule evaluates to true
   *
   * For the spoiler test context, we check if the location is in the accessible
   * regions and has a satisfied access rule. This is approximated by checking
   * if it's in the accessibleLocations list which is maintained by the state manager.
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} locationName - Name of the location to check
   * @returns {boolean} True if the location is reachable
   */
  _can_get(snapshot, staticData, locationName) {
    // First check if it's already in accessible locations (fast path)
    const accessibleLocations = snapshot?.accessibleLocations || [];
    if (accessibleLocations.includes(locationName)) {
      return true;
    }

    // For Dark Souls III boss soul locations, we need to check if the location's
    // access rule can be satisfied with the current state (inventory).
    //
    // Note: In the spoiler test context, we can't rely on accessibleRegions being
    // populated, so we just check if the access rule is satisfied.

    // Find the location in static data
    const regions = staticData?.regions;

    if (!regions) {
      return false;
    }

    // Search for the location across all regions
    const regionEntries = regions instanceof Map ? regions.entries() : Object.entries(regions);

    for (const [regionName, region] of regionEntries) {
      if (region.locations) {
        const location = region.locations.find(loc => loc.name === locationName);
        if (location) {
          // If the location has no access rule or it's a constant true, consider it accessible
          if (!location.access_rule ||
              (location.access_rule.type === 'constant' && location.access_rule.value === true)) {
            return true;
          }

          // For item_check rules, verify we have the item
          if (location.access_rule.type === 'item_check') {
            const itemName = location.access_rule.item?.value || location.access_rule.item;
            return this.has(snapshot, staticData, itemName);
          }

          // For other rule types, conservatively assume it's not accessible to avoid
          // infinite recursion. The state manager will handle complex rules.
          return false;
        }
      }
    }

    return false;
  },

  /**
   * Generic has implementation for Dark Souls III
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to check
   * @returns {boolean} True if player has the item
   */
  has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
  },

  /**
   * Generic count implementation for Dark Souls III
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to count
   * @returns {number} Count of the item
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },
};

/**
 * Generic state module for Dark Souls III
 * Using the generic state module since DS3 doesn't need custom state management
 */
export const darkSouls3StateModule = {
  /**
   * Initializes a new Dark Souls III game state
   */
  initializeState() {
    return {
      flags: [],
      events: [],
    };
  },

  /**
   * Loads settings into the game state
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Process event items
   */
  processEventItem(gameState, itemName) {
    return null; // No special event processing
  },

  /**
   * Returns the state properties for a snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};
