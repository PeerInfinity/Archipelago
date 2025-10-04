/**
 * Hollow Knight state management and helper functions
 */

/**
 * State management module for Hollow Knight
 */
export const hkStateModule = {
  /**
   * Initializes a new, empty Hollow Knight game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Process event items for Hollow Knight.
   */
  processEventItem(gameState, itemName) {
    return null; // Return null to indicate no state change for now
  },

  /**
   * Returns the state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Hollow Knight helper functions
 */
export const helperFunctions = {
  /**
   * Check if the player has an item
   * @param {Object} snapshot - Game state snapshot
   * @param {string} itemName - Name of the item to check
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if player has the item
   */
  has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has
   * @param {Object} snapshot - Game state snapshot  
   * @param {string} itemName - Name of the item to count
   * @param {Object} staticData - Static game data
   * @returns {number} Count of the item
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },
};