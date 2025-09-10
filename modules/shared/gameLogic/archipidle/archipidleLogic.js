/**
 * ArchipIDLE state management module
 */
export const archipidleStateModule = {
  /**
   * Initialize ArchipIDLE game state
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
      // ArchipIDLE-specific state properties
    };
  },

  /**
   * Load settings into the ArchipIDLE game state
   */
  loadSettings(gameState, settings) {
    // Simple merge for ArchipIDLE
    return { ...gameState }; 
  },

  /**
   * ArchipIDLE event processing
   */
  processEventItem(gameState, itemName) {
    return null; // Return null to indicate no state change
  },

  /**
   * Returns the ArchipIDLE state properties for a snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * ArchipIDLE-specific helper functions
 */
export const helperFunctions = {
  /**
   * Check if the player has enough progression items to access a location
   * @param {Object} state - Game state snapshot
   * @param {string} world - World object (not used, passed as 'world')
   * @param {number} requiredCount - Number of progression items required
   * @param {Object} staticData - Static game data including items
   * @returns {boolean} True if player has enough progression items
   */
  _archipidle_location_is_accessible(state, world, requiredCount, staticData) {
    // Count progression items in inventory
    let progressionCount = 0;
    const inventory = state?.inventory || {};
    
    // Get item data from staticData
    const itemData = staticData?.items;
    
    for (const [itemName, count] of Object.entries(inventory)) {
      if (count > 0) {
        // Check if this item is a progression item
        const itemInfo = itemData?.[itemName] || (itemData?.['1'] && itemData['1'][itemName]);
        if (itemInfo && (itemInfo.advancement === true || itemInfo.classification === 'progression')) {
          progressionCount += count;
        }
      }
    }
    
    // Return true if we have at least the required number of progression items
    const required = typeof requiredCount === 'number' ? requiredCount : 0;
    return progressionCount >= required;
  },

  /**
   * Generic has function
   * @param {Object} state - Game state snapshot
   * @param {string} itemName - Name of the item to check
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if player has the item
   */
  has(state, itemName, staticData) {
    return !!(state?.inventory && state.inventory[itemName] > 0);
  },

  /**
   * Generic count function
   * @param {Object} state - Game state snapshot  
   * @param {string} itemName - Name of the item to count
   * @param {Object} staticData - Static game data
   * @returns {number} Count of the item
   */
  count(state, itemName, staticData) {
    return state?.inventory?.[itemName] || 0;
  },
};