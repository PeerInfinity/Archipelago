/**
 * Thread-agnostic A Hat in Time game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

/**
 * Check if player has an item, handling progressive items
 * @param {Object} state - Canonical state object
 * @param {string} itemName - Name of the item to check
 * @param {Object} staticData - Static game data including progressionMapping
 * @returns {boolean} True if player has the item
 */
export function has(state, itemName, staticData) {
  // First check if it's in flags (events, checked locations, etc.)
  if (state.flags && state.flags.includes(itemName)) {
    return true;
  }
  
  // Also check state.events (promoted from state.state.events)
  if (state.events && state.events.includes(itemName)) {
    return true;
  }
  
  // Check inventory
  if (!state.inventory) return false;
  
  // Direct item check
  if ((state.inventory[itemName] || 0) > 0) {
    return true;
  }
  
  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    // Check if this item is provided by any progressive item
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = state.inventory[progressiveBase] || 0;
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
 * @param {Object} state - Canonical state object
 * @param {string} itemName - Name of the item to count
 * @param {Object} staticData - Static game data
 * @returns {number} Number of items
 */
export function count(state, itemName, staticData) {
  if (!state.inventory) return 0;
  return state.inventory[itemName] || 0;
}

/**
 * Check if player has enough painting unlocks
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object (not used in this implementation)
 * @param {number} countRequired - Required number of painting unlocks
 * @param {Object} staticData - Static game data
 * @param {boolean} allowSkip - Whether to allow skipping in higher difficulties
 * @returns {boolean}
 */
export function has_paintings(state, world, countRequired, staticData, allowSkip = true) {
  // If painting logic is disabled, always return true
  if (!painting_logic(state, world, null, staticData)) {
    return true;
  }

  // Check for painting skip options based on difficulty
  if (allowSkip) {
    const difficulty = get_difficulty(state, world, null, staticData);
    // In Moderate or higher, there are tricks to skip painting walls
    if (difficulty >= 0) { // 0 = Moderate, 1 = Hard, 2 = Expert
      return true;
    }
  }

  // Check if player has enough Progressive Painting Unlock items
  return count(state, 'Progressive Painting Unlock', staticData) >= countRequired;
}

/**
 * Check if painting shuffle logic is enabled
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {any} itemName - Not used for this helper
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function painting_logic(state, world, itemName, staticData) {
  // Default to false for now - this should come from game settings
  // In a full implementation, this would check world.options.ShuffleSubconPaintings
  return false;
}

/**
 * Get the current difficulty setting
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {any} itemName - Not used for this helper
 * @param {Object} staticData - Static game data
 * @returns {number} -1=Normal, 0=Moderate, 1=Hard, 2=Expert
 */
export function get_difficulty(state, world, itemName, staticData) {
  // Default to Normal difficulty
  // In a full implementation, this would check world.options.LogicDifficulty
  return -1;
}

/**
 * Check if a required act can be completed
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {string} actEntrance - The entrance name for the act
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */

export function can_clear_required_act(state, world, actEntrance, staticData) {
  // This function checks if a required act can be cleared by:
  // 1. Finding the entrance by name in the static data
  // 2. Getting the connected region from that entrance
  // 3. Checking if the "Act Completion" location for that region is accessible
  
  // Handle case where no actEntrance is provided (defensive check)
  if (!actEntrance) {
    return false;
  }
  
  // Debug logging for key acts
  const debugActs = ['Mafia Town - Act 4', 'Mafia Town - Act 6'];
  const shouldDebug = debugActs.includes(actEntrance);

  // Find the entrance in the staticData
  if (!staticData || !staticData.regions) {
    return false;
  }

  let connectedRegion = null;
  
  // Search through all regions to find the entrance
  for (const playerId in staticData.regions) {
    for (const regionName in staticData.regions[playerId]) {
      const region = staticData.regions[playerId][regionName];
      if (region.exits) {
        for (const exit of region.exits) {
          if (exit.name === actEntrance) {
            connectedRegion = exit.connected_region;
            break;
          }
        }
      }
      if (connectedRegion) break;
    }
    if (connectedRegion) break;
  }

  if (!connectedRegion) {
    // Unknown entrance, assume it's accessible
    if (shouldDebug) {
      console.log(`[can_clear_required_act] ${actEntrance}: No connected region found, returning true`);
    }
    return true;
  }
  
  if (shouldDebug) {
    console.log(`[can_clear_required_act] ${actEntrance} connects to ${connectedRegion}`);
  }

  // First check if the connected region is reachable
  if (state.regionReachability && state.regionReachability[connectedRegion] !== undefined) {
    const regionReachable = state.regionReachability[connectedRegion] === true || state.regionReachability[connectedRegion] === 'reachable';
    if (!regionReachable) {
      console.log(`[can_clear_required_act] ${actEntrance}: ${connectedRegion} is NOT reachable (status: ${state.regionReachability[connectedRegion]})`);
      return false;
    }
    console.log(`[can_clear_required_act] ${actEntrance}: ${connectedRegion} IS reachable`);
  } else {
    console.log(`[can_clear_required_act] ${actEntrance}: No regionReachability data for ${connectedRegion}`);
  }

  // Check if it's a "Free Roam" area (these are always clearable if reachable)
  if (connectedRegion.includes('Free Roam')) {
    return true;
  }

  // For act regions, during BFS traversal we can't check location accessibility
  // due to recursion protection, so we assume acts are clearable if the region
  // is reachable (which we already checked above)
  // This matches the Python backend behavior where act completion locations
  // typically have no additional access rules beyond region reachability
  return true;
}

// Movement and abilities

/**
 * Check if player can use a specific hat
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {string} hatType - The hat type to check
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function can_use_hat(state, world, hatType, staticData) {
  // Map hat types to item names
  const hatToItem = {
    'Sprint': 'Sprint Hat',
    'Brewing': 'Brewing Hat',
    'Ice': 'Ice Hat',
    'Dweller': 'Dweller Mask',
    'Time Stop': 'Time Stop Hat'
  };

  const itemName = hatToItem[hatType];
  if (!itemName) {
    return false;
  }

  return has(state, itemName, staticData);
}

/**
 * Check if player can use hookshot
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {any} itemName - Not used for this helper
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function can_use_hookshot(state, world, itemName, staticData) {
  return has(state, 'Hookshot Badge', staticData);
}

/**
 * Check if player can hit things
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {boolean} umbrellaOnly - Whether only umbrella attacks count
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function can_hit(state, world, umbrellaOnly, staticData) {
  if (umbrellaOnly) {
    return has(state, 'Umbrella', staticData);
  }
  
  // Can hit with umbrella or diving
  return has(state, 'Umbrella', staticData) || has(state, 'Dive', staticData);
}

// State module for managing A Hat in Time specific state
export const ahitStateModule = {
  /**
   * Initialize A Hat in Time specific state
   * @param {Object} gameState - Game state object to initialize (optional)
   */
  initializeState(gameState = {}) {
    // Initialize A Hat in Time specific flags and events
    if (!gameState.flags) gameState.flags = [];
    if (!gameState.events) gameState.events = [];
    
    // A Hat in Time specific initialization
    // Add any default flags or events that should be set initially
    
    return gameState;
  },

  /**
   * Load settings into the game state
   * @param {Object} gameState - Current A Hat in Time game state
   * @param {Object} settings - Game settings object
   * @returns {Object} Updated game state
   */
  loadSettings(gameState, settings) {
    // A Hat in Time specific settings loading
    // For now, just return the gameState unchanged
    return gameState;
  },

  /**
   * Set a flag in the game state
   * @param {Object} gameState - Current A Hat in Time game state
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
   * @param {Object} gameState - Current A Hat in Time game state
   * @param {string} flagName - Name of the flag to check
   * @returns {boolean} True if flag is set
   */
  hasFlag(gameState, flagName) {
    return gameState.flags && gameState.flags.includes(flagName);
  },

  /**
   * Set an event in the game state
   * @param {Object} gameState - Current A Hat in Time game state
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
   * @param {Object} gameState - Current A Hat in Time game state
   * @param {string} eventName - Name of the event to check
   * @returns {boolean} True if event is set
   */
  hasEvent(gameState, eventName) {
    return gameState.events && gameState.events.includes(eventName);
  },

  /**
   * Handle item collection events for A Hat in Time
   * @param {Object} gameState - Current A Hat in Time game state
   * @param {string} itemName - Name of the collected item
   * @returns {Object|null} Updated game state if an event was triggered, null otherwise
   */
  handleItemCollection(gameState, itemName) {
    // A Hat in Time specific item collection logic
    // Map certain items to events/flags they should trigger
    const eventMapping = {
      // Add A Hat in Time specific mappings as needed
    };

    if (eventMapping[itemName]) {
      return this.setEvent(gameState, eventMapping[itemName]);
    }
    return null; // No event triggered
  },

  /**
   * Check if an item/flag/event exists (unified check)
   * @param {Object} gameState - Current A Hat in Time game state
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
   * @param {Object} gameState - Current A Hat in Time game state
   * @returns {Array} Array of flags
   */
  getFlags(gameState) {
    return gameState.flags || [];
  },

  /**
   * Get events array (for backward compatibility)
   * @param {Object} gameState - Current A Hat in Time game state
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
  
  // A Hat in Time specific helpers
  has_paintings,
  painting_logic,
  get_difficulty,
  can_clear_required_act,
  
  // Movement and abilities
  can_use_hat,
  can_use_hookshot,
  can_hit,
};