/**
 * VVVVVV helper functions
 * Translated from worlds/v6/Rules.py
 */

/**
 * VVVVVV state management module
 */
export const v6StateModule = {
  /**
   * Initializes a new, empty VVVVVV game state.
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
    return null; // No special event processing for VVVVVV
  },

  /**
   * Returns the VVVVVV state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * VVVVVV helper functions
 */
export const helperFunctions = {
  /**
   * Check if the player has all trinkets in a range
   * Translated from _has_trinket_range in worlds/v6/Rules.py
   *
   * Python implementation:
   * def _has_trinket_range(state, player, start, end) -> bool:
   *     for i in range(start, end):
   *         if not state.has("Trinket " + str(i + 1).zfill(2), player):
   *             return False
   *     return True
   *
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {number} start - Start of trinket range (inclusive)
   * @param {number} end - End of trinket range (exclusive)
   * @returns {boolean} True if player has all trinkets in range
   */
  _has_trinket_range(snapshot, staticData, start, end) {
    // Check if player has all trinkets from start to end-1
    for (let i = start; i < end; i++) {
      // Trinket names are formatted as "Trinket 01", "Trinket 02", etc.
      // Python: str(i + 1).zfill(2) - add 1 to i and zero-pad to 2 digits
      const trinketNumber = (i + 1).toString().padStart(2, '0');
      const trinketName = `Trinket ${trinketNumber}`;

      // Check if player has this trinket
      const trinketCount = snapshot?.inventory?.[trinketName] || 0;
      if (trinketCount === 0) {
        return false;
      }
    }

    return true;
  },
};
