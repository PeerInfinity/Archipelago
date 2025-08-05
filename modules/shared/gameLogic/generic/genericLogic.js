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
   * @param {Object} state - Game state snapshot
   * @param {string} itemName - Name of the item to check
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if player has the item
   */
  has(state, itemName, staticData) {
    return !!(state?.inventory && state.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has (generic implementation)
   * @param {Object} state - Game state snapshot  
   * @param {string} itemName - Name of the item to count
   * @param {Object} staticData - Static game data
   * @returns {number} Count of the item
   */
  count(state, itemName, staticData) {
    return state?.inventory?.[itemName] || 0;
  },
};