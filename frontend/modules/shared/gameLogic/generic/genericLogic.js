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
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to check
   * @returns {boolean} True if player has the item
   */
  has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has (generic implementation)
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item to count
   * @returns {number} Count of the item
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
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
    const locations = staticData?.locations || [];

    // Handle both array and object formats
    let location;
    if (Array.isArray(locations)) {
      location = locations.find(loc => loc?.name === locationName);
    } else if (typeof locations === 'object') {
      location = locations[locationName];
    }

    if (!location || !location.item) {
      return null;
    }

    // Return tuple of [item_name, player_id]
    return [location.item.name, location.item.player];
  },
};