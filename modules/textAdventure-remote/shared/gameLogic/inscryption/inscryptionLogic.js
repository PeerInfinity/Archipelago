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
 *
 * All helper functions follow the standardized signature:
 * `(snapshot, staticData, ...args) => boolean | number | any`
 *
 * Where:
 * - snapshot: { inventory, flags, events, player, regionReachability, evaluateRule }
 * - staticData: { settings, progressionMapping, regions, locations, items }
 */
export const helperFunctions = {
  /**
   * Check if player has access to Act 2
   * Requires Film Roll item
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if Act 2 requirements are met
   */
  has_act2_requirements(snapshot, staticData) {
    const filmRoll = snapshot?.inventory?.['Film Roll'] || 0;
    return filmRoll > 0;
  },

  /**
   * Check if player has all epitaph pieces
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if all epitaph pieces are collected
   */
  has_all_epitaph_pieces(snapshot, staticData) {
    // Check for "Epitaph Pieces" item (might be plural form)
    const epitaphPieces = snapshot?.inventory?.['Epitaph Pieces'] || 0;
    if (epitaphPieces >= 1) {
      return true;
    }

    // Also check for individual "Epitaph Piece" items
    // Inscryption typically has 9 epitaph pieces total
    const epitaphPiece = snapshot?.inventory?.['Epitaph Piece'] || 0;
    return epitaphPiece >= 9;
  },

  /**
   * Check if player has camera and meat
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if both camera and meat are collected
   */
  has_camera_and_meat(snapshot, staticData) {
    const camera = snapshot?.inventory?.['Camera Replica'] || 0;
    const meat = snapshot?.inventory?.['Pile Of Meat'] || 0;
    return camera > 0 && meat > 0;
  },

  /**
   * Check if player has monocle
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if monocle is collected
   */
  has_monocle(snapshot, staticData) {
    const monocle = snapshot?.inventory?.['Monocle'] || 0;
    return monocle > 0;
  },

  /**
   * Check if player has access to Act 3
   * Requires Act 2 requirements plus additional items
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if Act 3 requirements are met
   */
  has_act3_requirements(snapshot, staticData) {
    // Act 3 requires Act 2 access plus the other items
    return helperFunctions.has_act2_requirements(snapshot, staticData) &&
           helperFunctions.has_all_epitaph_pieces(snapshot, staticData) &&
           helperFunctions.has_camera_and_meat(snapshot, staticData) &&
           helperFunctions.has_monocle(snapshot, staticData);
  },

  /**
   * Check if player has transcendence requirements
   * Requires Quill and gems/battery in addition to Act 3 access
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if transcendence requirements are met
   */
  has_transcendence_requirements(snapshot, staticData) {
    const quill = snapshot?.inventory?.['Quill'] || 0;
    return quill > 0 && helperFunctions.has_gems_and_battery(snapshot, staticData);
  },

  /**
   * Check if player has all items in a list
   * This is a state_method used by various locations
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {Array} itemList - List of item names to check
   * @returns {boolean} True if all items are collected
   */
  has_all(snapshot, staticData, itemList) {
    // Handle the case where itemList is wrapped in another array
    let items = itemList;
    if (Array.isArray(itemList) && itemList.length === 1 && Array.isArray(itemList[0])) {
      items = itemList[0];
    }

    // Check if player has all items
    for (const item of items) {
      const count = snapshot?.inventory?.[item] || 0;
      if (count === 0) {
        return false;
      }
    }
    return true;
  },

  /**
   * Check if player has Act 2 bridge requirements
   * Requires EITHER camera+meat OR all epitaph pieces
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if Act 2 bridge requirements are met
   */
  has_act2_bridge_requirements(snapshot, staticData) {
    // Bridge requires camera+meat OR all epitaph pieces
    return helperFunctions.has_camera_and_meat(snapshot, staticData) ||
           helperFunctions.has_all_epitaph_pieces(snapshot, staticData);
  },

  /**
   * Check if player has gems module and battery
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if gems module and battery are collected
   */
  has_gems_and_battery(snapshot, staticData) {
    const gems = snapshot?.inventory?.['Gems Module'] || 0;
    const battery = snapshot?.inventory?.['Inspectometer Battery'] || 0;
    return gems > 0 && battery > 0;
  },

  /**
   * Check if player has inspectometer battery
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if inspectometer battery is collected
   */
  has_inspectometer_battery(snapshot, staticData) {
    const battery = snapshot?.inventory?.['Inspectometer Battery'] || 0;
    return battery > 0;
  },
};