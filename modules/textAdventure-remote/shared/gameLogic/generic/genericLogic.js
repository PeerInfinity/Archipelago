/**
 * Generic state management module for games without custom state logic.
 */
export const genericStateModule = {
  /**
   * Initializes a new, empty generic game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
      // Other generic state properties can be added here if needed
    };
  },

  /**
   * Loads settings into the game state. For generic games, it's a simple merge.
   */
  loadSettings(gameState, settings) {
    // This function doesn't need to do much for a generic game,
    // as settings are already on the top-level state object.
    // It's here to fulfill the interface.
    return { ...gameState }; 
  },

  /**
   * Generic event processing does nothing, as there are no special events.
   */
  processEventItem(gameState, itemName) {
    return null; // Return null to indicate no state change
  },

  /**
   * Returns the generic state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Generic helper functions that work for any game using the canonical state format.
 */
export const helperFunctions = {
  /**
   * Check if the player has an item (generic implementation)
   * Handles progressive items by checking if the player has the progressive base item
   * at a level that would grant the requested resolved item.
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to check
   * @returns {boolean} True if player has the item
   */
  has(snapshot, staticData, itemName) {
    // Check flags (events, checked locations, etc.)
    if (snapshot?.flags?.includes(itemName)) {
      return true;
    }

    // Check events
    if (snapshot?.events?.includes(itemName)) {
      return true;
    }

    // Check inventory
    if (snapshot?.inventory?.[itemName] > 0) {
      return true;
    }

    // Check if this item is a resolved form of a progressive item
    const playerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || '1';
    const playerIdKey = String(playerId);
    const progressionMapping = staticData?.progression_mapping?.[playerIdKey];

    if (progressionMapping) {
      // Search through all progressive items to find if itemName is a resolved form
      for (const [progressiveItemName, mapping] of Object.entries(progressionMapping)) {
        const items = mapping.items || [];
        const itemIndex = items.findIndex(item => item.name === itemName);
        if (itemIndex !== -1) {
          // itemName is a resolved form of this progressive item
          // Check if player has enough of the base item to reach this level
          const requiredLevel = items[itemIndex].level || (itemIndex + 1);

          // Use base_item if specified, otherwise use the progressiveItemName directly
          // The base_item allows multiple progressive items to contribute to the same count
          // (e.g., "Progressive Bow" and "Progressive Bow (Alt)" both count toward Silver Bow)
          const baseItem = mapping.base_item || progressiveItemName;

          // Count ALL progressive items that share the same base_item
          let totalCount = 0;
          for (const [otherItemName, otherMapping] of Object.entries(progressionMapping)) {
            const otherBaseItem = otherMapping.base_item || otherItemName;
            if (otherBaseItem === baseItem) {
              totalCount += snapshot?.inventory?.[otherItemName] || 0;
            }
          }

          if (totalCount >= requiredLevel) {
            return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * Count how many of an item the player has (generic implementation)
   * For progressive items, returns the resolved count at the current level.
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to count
   * @returns {number} Count of the item
   */
  count(snapshot, staticData, itemName) {
    // Check events first (events are binary - either 1 or 0)
    if (snapshot?.events?.includes(itemName)) {
      return 1;
    }

    // Check flags (also binary)
    if (snapshot?.flags?.includes(itemName)) {
      return 1;
    }

    // Check inventory
    const directCount = snapshot?.inventory?.[itemName] || 0;
    if (directCount > 0) {
      return directCount;
    }

    // Check prog_items (virtual/computed items like "Tradeable Orbs", "Reachable Orbs", etc.)
    // These are items that don't exist in the item pool but are computed/tracked by the game
    const playerId = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || '1';
    const playerIdKey = String(playerId);
    const progItemCount = snapshot?.prog_items?.[playerIdKey]?.[itemName];
    if (typeof progItemCount === 'number' && progItemCount > 0) {
      return progItemCount;
    }

    // Check if this item is a resolved form of a progressive item
    const progressionMapping = staticData?.progression_mapping?.[playerIdKey];

    if (progressionMapping) {
      // Search through all progressive items to find if itemName is a resolved form
      for (const [progressiveItemName, mapping] of Object.entries(progressionMapping)) {
        const items = mapping.items || [];
        const itemIndex = items.findIndex(item => item.name === itemName);
        if (itemIndex !== -1) {
          // itemName is a resolved form of this progressive item
          // Check if player has enough of the base item to reach this level
          const requiredLevel = items[itemIndex].level || (itemIndex + 1);

          // Use base_item if specified, otherwise use the progressiveItemName directly
          // The base_item allows multiple progressive items to contribute to the same count
          // (e.g., "Progressive Bow" and "Progressive Bow (Alt)" both count toward Silver Bow)
          const baseItem = mapping.base_item || progressiveItemName;

          // Count ALL progressive items that share the same base_item
          let totalCount = 0;
          for (const [otherItemName, otherMapping] of Object.entries(progressionMapping)) {
            const otherBaseItem = otherMapping.base_item || otherItemName;
            if (otherBaseItem === baseItem) {
              totalCount += snapshot?.inventory?.[otherItemName] || 0;
            }
          }

          if (totalCount >= requiredLevel) {
            // Player has at least this level - count how many times they've "passed" this level
            // For most games, having the item once is enough (return 1)
            return 1;
          }
        }
      }
    }

    return 0;
  },

  /**
   * Get the item placed at a specific location
   * Used for self-locking item logic (allow_self_locking_items)
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data (contains locations with item data)
   * @param {string} locationName - Name of the location to check
   * @returns {Array|null} Array of [itemName, playerId] or null if no item
   */
  location_item_name(snapshot, staticData, locationName) {
    // Find the location in staticData
    let location = null;

    // Helper to check if something is a Map (handles cross-realm cases)
    const isMap = (obj) => obj && typeof obj.get === 'function' && typeof obj.has === 'function';

    // First try: Check staticData.locations directly (handles array, Map, and object formats)
    const locations = staticData?.locations;
    if (locations) {
      if (Array.isArray(locations)) {
        location = locations.find(loc => loc?.name === locationName);
      } else if (isMap(locations)) {
        location = locations.get(locationName);
      } else if (typeof locations === 'object') {
        location = locations[locationName];
      }
    }

    // Second try: Search in regions if not found in flat locations
    // This handles the case where locations are nested inside region objects
    if (!location && staticData?.regions) {
      const regions = staticData.regions;
      const regionEntries = isMap(regions)
        ? Array.from(regions.values())
        : (typeof regions === 'object' ? Object.values(regions) : []);

      for (const region of regionEntries) {
        if (region?.locations && Array.isArray(region.locations)) {
          const foundLoc = region.locations.find(l => l?.name === locationName);
          if (foundLoc) {
            location = foundLoc;
            break;
          }
        }
      }
    }

    if (!location || !location.item) {
      return null;
    }

    // Return tuple of [item_name, player_id]
    return [location.item.name, location.item.player];
  },
};