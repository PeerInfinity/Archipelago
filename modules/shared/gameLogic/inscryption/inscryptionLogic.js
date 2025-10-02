/**
 * Inscryption helper functions
 */

/**
 * Inscryption state management module
 */
export const inscryptionStateModule = {
  /**
   * Initializes a new, empty Inscryption game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations
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
   * Process special event items if any
   */
  processEventItem(gameState, itemName) {
    return null; // No special event processing for Inscryption
  },

  /**
   * Returns the Inscryption state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Inscryption helper functions
 */
export const helperFunctions = {
  /**
   * Check if player has access to Act 2
   * Requires Film Roll item
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if Act 2 requirements are met
   */
  has_act2_requirements(state, playerId) {
    const filmRoll = state?.inventory?.['Film Roll'] || 0;
    return filmRoll > 0;
  },

  /**
   * Check if player has all epitaph pieces
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if all epitaph pieces are collected
   */
  has_all_epitaph_pieces(state, playerId) {
    // Check for "Epitaph Pieces" item (might be plural form)
    const epitaphPieces = state?.inventory?.['Epitaph Pieces'] || 0;
    if (epitaphPieces >= 1) {
      return true;
    }
    
    // Also check for individual "Epitaph Piece" items
    // Inscryption typically has 9 epitaph pieces total
    const epitaphPiece = state?.inventory?.['Epitaph Piece'] || 0;
    return epitaphPiece >= 9;
  },

  /**
   * Check if player has camera and meat
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if both camera and meat are collected
   */
  has_camera_and_meat(state, playerId) {
    const camera = state?.inventory?.['Camera Replica'] || 0;
    const meat = state?.inventory?.['Pile Of Meat'] || 0;
    return camera > 0 && meat > 0;
  },

  /**
   * Check if player has monocle
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if monocle is collected
   */
  has_monocle(state, playerId) {
    const monocle = state?.inventory?.['Monocle'] || 0;
    return monocle > 0;
  },

  /**
   * Check if player has access to Act 3
   * Requires Act 2 requirements plus additional items
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if Act 3 requirements are met
   */
  has_act3_requirements(state, playerId) {
    // Act 3 requires Act 2 access plus the other items
    return helperFunctions.has_act2_requirements(state, playerId) &&
           helperFunctions.has_all_epitaph_pieces(state, playerId) &&
           helperFunctions.has_camera_and_meat(state, playerId) &&
           helperFunctions.has_monocle(state, playerId);
  },

  /**
   * Check if player has transcendence requirements
   * Requires Quill and gems/battery in addition to Act 3 access
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if transcendence requirements are met
   */
  has_transcendence_requirements(state, playerId) {
    const quill = state?.inventory?.['Quill'] || 0;
    return quill > 0 && helperFunctions.has_gems_and_battery(state, playerId);
  },

  /**
   * Check if player has all items in a list
   * This is a state_method used by various locations
   * @param {Object} state - Game state snapshot
   * @param {*} world - World object (unused)
   * @param {Array} itemList - List of item names to check
   * @returns {boolean} True if all items are collected
   */
  has_all(state, world, itemList) {
    // Handle the case where itemList is wrapped in another array
    let items = itemList;
    if (Array.isArray(itemList) && itemList.length === 1 && Array.isArray(itemList[0])) {
      items = itemList[0];
    }
    
    // Check if player has all items
    for (const item of items) {
      const count = state?.inventory?.[item] || 0;
      if (count === 0) {
        return false;
      }
    }
    return true;
  },

  /**
   * Check if player has Act 2 bridge requirements
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if Act 2 bridge requirements are met
   */
  has_act2_bridge_requirements(state, playerId) {
    // Bridge typically requires having camera and meat
    return helperFunctions.has_camera_and_meat(state, playerId);
  },

  /**
   * Check if player has gems module and battery
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if gems module and battery are collected
   */
  has_gems_and_battery(state, playerId) {
    const gems = state?.inventory?.['Gems Module'] || 0;
    const battery = state?.inventory?.['Inspectometer Battery'] || 0;
    return gems > 0 && battery > 0;
  },

  /**
   * Check if player has inspectometer battery
   * @param {Object} state - Game state snapshot
   * @param {number} playerId - Player ID
   * @returns {boolean} True if inspectometer battery is collected
   */
  has_inspectometer_battery(state, playerId) {
    const battery = state?.inventory?.['Inspectometer Battery'] || 0;
    return battery > 0;
  },
};