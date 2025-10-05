/**
 * DLCQuest state management module with coin tracking support.
 */
export const dlcquestStateModule = {
  /**
   * Initializes a new DLCQuest game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
      // DLCQuest doesn't need special state beyond the standard
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    // DLCQuest doesn't need special settings handling
    return { ...gameState }; 
  },

  /**
   * Process special DLCQuest event items.
   */
  processEventItem(gameState, itemName) {
    // DLCQuest doesn't have special event processing
    // Coin items are handled as normal prog_items
    return null; // Return null to indicate no state change
  },

  /**
   * Returns the DLCQuest state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * DLCQuest helper functions.
 * Note: DLCQuest uses special coin items with a leading space (e.g., " coins")
 * to track total coins. These are handled automatically by the state manager.
 */
export const helperFunctions = {
  /**
   * Check if the player has an item (generic implementation)
   * @param {Object} snapshot - Game state snapshot
   * @param {number} player - Player ID
   * @param {string} item - Item name
   * @param {number} [count=1] - Required count
   * @returns {boolean} True if player has at least count of the item
   */
  can_access(state, player, item, count = 1) {
    const progItems = snapshot.prog_items?.[player] || {};
    return (progItems[item] || 0) >= count;
  },
  
  /**
   * Generic has method for item checking
   */
  has(state, player, item, count = 1) {
    return this.can_access(state, player, item, count);
  },
  
  /**
   * Check if player has visited/checked a location
   */
  has_flag(state, player, flag) {
    return snapshot.flags?.includes(flag) || false;
  },
  
  /**
   * Check if player has an event
   */
  has_event(state, player, event) {
    return snapshot.events?.includes(event) || false;
  }
};