/**
 * Thread-agnostic Landstalker game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

/**
 * Check if player has an item, handling progressive items
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including progressionMapping
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // First check if it's in flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Also check state.events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Direct item check
  if ((snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    // Check if this item is provided by any progressive item
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = snapshot.inventory[progressiveBase] || 0;
      if (baseCount > 0 && progression && progression.items) {
        // Check each upgrade in the progression
        for (const upgrade of progression.items) {
          if (baseCount >= upgrade.level) {
            // Check if this upgrade provides the item we're looking for
            if (upgrade.name === itemName ||
                (upgrade.provides && upgrade.provides.includes(itemName))) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Number of items
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has visited all required regions
 * This is the JavaScript implementation of _landstalker_has_visited_regions from Rules.py
 *
 * Python code:
 * def _landstalker_has_visited_regions(state: CollectionState, player: int, regions):
 *     return all(state.has("event_visited_" + region.code, player) for region in regions)
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array|Object} regions - Array of region objects/codes, or an unresolved variable reference
 * @returns {boolean} True if player has visited all required regions
 */
export function _landstalker_has_visited_regions(snapshot, staticData, regions) {
  // Handle unresolved variable references from the analyzer
  // These come from lambda parameters that couldn't be resolved statically
  // The rule engine tries to resolve them via resolveName() and returns undefined if it can't
  if (regions === undefined || regions === null) {
    // Unresolved variable reference - the analyzer couldn't determine which regions are required
    // This is a limitation of the static analysis - the actual region requirements
    // would need to be extracted from the world data during export
    // For now, treat unresolved references as "no regions required" (always pass)
    return true;
  }

  if (typeof regions === 'object' && !Array.isArray(regions)) {
    // Check if this is a "name" type node (unresolved variable reference)
    // This shouldn't happen since the rule engine resolves names first, but handle it just in case
    if (regions.type === 'name') {
      console.warn(`_landstalker_has_visited_regions: Cannot resolve variable reference '${regions.name}', defaulting to true`);
      return true;
    }
  }

  if (regions.length === 0) {
    return true;
  }

  // regions could be either an array of region objects or an array of region codes
  for (const region of regions) {
    // If region is an object, get its code property; otherwise use it directly as a string
    const regionCode = typeof region === 'object' && region.code ? region.code : region;
    const eventName = `event_visited_${regionCode}`;

    if (!has(snapshot, staticData, eventName)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if player has enough health (Life Stock items)
 * This is the JavaScript implementation of _landstalker_has_health from Rules.py
 *
 * Python code:
 * def _landstalker_has_health(state: CollectionState, player: int, health):
 *     return state.has("Life Stock", player, health)
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} health - Required health amount
 * @returns {boolean} True if player has enough Life Stock items
 */
export function _landstalker_has_health(snapshot, staticData, health) {
  const lifeStockCount = count(snapshot, staticData, "Life Stock");
  return lifeStockCount >= health;
}

// State module for managing Landstalker specific state
export const landstalkerStateModule = {
  /**
   * Initialize Landstalker specific state
   * @param {Object} gameState - Game state object to initialize (optional)
   */
  initializeState(gameState = {}) {
    // Initialize Landstalker specific flags and events
    if (!gameState.flags) gameState.flags = [];
    if (!gameState.events) gameState.events = [];

    return gameState;
  },

  /**
   * Load settings into the game state
   * @param {Object} gameState - Current Landstalker game state
   * @param {Object} settings - Game settings object
   * @returns {Object} Updated game state
   */
  loadSettings(gameState, settings) {
    // Landstalker specific settings loading
    // For now, just return the gameState unchanged
    return gameState;
  },

  /**
   * Set a flag in the game state
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} flagName - Name of the flag to set
   * @returns {Object} Updated game state (or null if no change)
   */
  setFlag(gameState, flagName) {
    if (!gameState.flags) gameState.flags = [];
    if (!gameState.flags.includes(flagName)) {
      gameState.flags.push(flagName);
      return gameState;
    }
    return null; // No change needed
  },

  /**
   * Check if a flag is set
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} flagName - Name of the flag to check
   * @returns {boolean} True if flag is set
   */
  hasFlag(gameState, flagName) {
    return gameState.flags && gameState.flags.includes(flagName);
  },

  /**
   * Set an event in the game state
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} eventName - Name of the event to set
   * @returns {Object} Updated game state (or null if no change)
   */
  setEvent(gameState, eventName) {
    if (!gameState.events) gameState.events = [];
    if (!gameState.events.includes(eventName)) {
      gameState.events.push(eventName);
      return gameState;
    }
    return null; // No change needed
  },

  /**
   * Check if an event is set
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} eventName - Name of the event to check
   * @returns {boolean} True if event is set
   */
  hasEvent(gameState, eventName) {
    return gameState.events && gameState.events.includes(eventName);
  },

  /**
   * Handle item collection events for Landstalker
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} itemName - Name of the collected item
   * @returns {Object|null} Updated game state if an event was triggered, null otherwise
   */
  handleItemCollection(gameState, itemName) {
    // Landstalker specific item collection logic
    // Map certain items to events/flags they should trigger
    const eventMapping = {
      // Add Landstalker specific mappings as needed
    };

    if (eventMapping[itemName]) {
      return this.setEvent(gameState, eventMapping[itemName]);
    }
    return null; // No event triggered
  },

  /**
   * Check if an item/flag/event exists (unified check)
   * @param {Object} gameState - Current Landstalker game state
   * @param {string} itemName - Name to check (could be flag or event)
   * @returns {boolean} True if item/flag/event exists
   */
  has(gameState, itemName) {
    // Check if it's an event first
    if (this.hasEvent(gameState, itemName)) {
      return true;
    }
    // Else fall back to flag check
    return this.hasFlag(gameState, itemName);
  },

  /**
   * Get flags array (for backward compatibility)
   * @param {Object} gameState - Current Landstalker game state
   * @returns {Array} Array of flags
   */
  getFlags(gameState) {
    return gameState.flags || [];
  },

  /**
   * Get events array (for backward compatibility)
   * @param {Object} gameState - Current Landstalker game state
   * @returns {Array} Array of events
   */
  getEvents(gameState) {
    return gameState.events || [];
  }
};

// Helper function registry
export const helperFunctions = {
  // Core inventory functions
  has,
  count,

  // Landstalker specific helpers
  _landstalker_has_visited_regions,
  _landstalker_has_health,
};
