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

  /**
   * Get Hollow Knight option value from settings
   * This is a state_method used by rules to check game options
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} optionName - Name of the option to check
   * @returns {number|boolean} Value of the option
   */
  _hk_option(snapshot, staticData, optionName) {
    // Get the settings for the current player
    const playerId = snapshot?.player?.slot;
    if (!playerId || !staticData?.settings) {
      return 0; // Default to 0 if settings not available
    }

    const playerSettings = staticData.settings[playerId]; // Object key coercion handles numeric playerId
    if (!playerSettings) {
      return 0;
    }

    // Return the option value, defaulting to 0 if not found
    return playerSettings[optionName] ?? 0;
  },

  /**
   * Check if the start location matches the given location
   * This is a state_method used by rules to check start location
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} startLocation - Start location to check
   * @returns {boolean} True if the start location matches
   */
  _hk_start(snapshot, staticData, startLocation) {
    // Get the settings for the current player
    const playerId = snapshot?.player?.slot;
    if (!playerId || !staticData?.settings) {
      return false;
    }

    const playerSettings = staticData.settings[playerId]; // Object key coercion handles numeric playerId
    if (!playerSettings) {
      return false;
    }

    // Check if StartLocation setting matches the given location
    return playerSettings.StartLocation === startLocation;
  },
};