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
  // This function checks if a required act can be cleared.
  // Python logic:
  // 1. Check if the connected region is reachable
  // 2. If it's a "Free Roam" region, return true
  // 3. Otherwise, the act is clearable if the region is reachable
  //    (since Act Completion locations typically have access_rule: true)

  // Handle multiple calling conventions:
  // 1. From rule engine: (state, 'world', 'world', 'Mafia Town - Act 4', staticData)
  // 2. Direct call: (state, world, actEntrance, staticData)

  // If actEntrance is an array, it means we got args passed incorrectly
  if (Array.isArray(actEntrance)) {
    // Args array contains ['world', 'Mafia Town - Act 4']
    // We want the second element
    // When this happens, staticData is in the 4th parameter position
    actEntrance = actEntrance[1];
    staticData = arguments[3];  // Get the actual staticData
  } else if (world === 'world' && actEntrance === 'world' && staticData && typeof staticData === 'string') {
    // We have (state, 'world', 'world', 'Mafia Town - Act 4', realStaticData)
    // Shift parameters
    actEntrance = staticData;
    staticData = arguments[4];  // Get the 5th argument
  }

  // Handle case where no actEntrance is provided
  if (!actEntrance) {
    return false;
  }

  // Handle case where actEntrance is not a string (could be an object from args)
  if (typeof actEntrance === 'object' && actEntrance?.type === 'constant') {
    actEntrance = actEntrance.value;
  }

  // Find the entrance in the staticData
  if (!staticData || !staticData.regions) {
    return false;
  }

  let connectedRegion = null;

  // Search through all regions to find the entrance
  // staticData.regions is {regionName: regionData}, not {playerId: {regionName: regionData}}
  for (const regionName in staticData.regions) {
    const region = staticData.regions[regionName];
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

  if (!connectedRegion) {
    // Unknown entrance, assume not reachable
    return false;
  }

  // Step 1: Check if the connected region is reachable
  let regionReachable = false;
  if (state.regionReachability && state.regionReachability[connectedRegion] !== undefined) {
    regionReachable = state.regionReachability[connectedRegion] === true ||
                      state.regionReachability[connectedRegion] === 'reachable';
  }

  if (!regionReachable) {
    return false;
  }

  // Step 2: If it's a "Free Roam" region, return true
  if (connectedRegion.includes("Free Roam")) {
    return true;
  }

  // Step 3: For non-Free Roam regions, the act is clearable if the region is reachable
  // In A Hat in Time, Act Completion locations typically have access_rule: true,
  // meaning they're accessible as soon as you can reach the region.
  // We've already verified the region is reachable in step 1.
  return true;
}

// Movement and abilities

/**
 * Calculate the cumulative yarn cost to craft a specific hat
 * @param {Object} staticData - Static game data containing hat_info
 * @param {number} hatType - HatType enum value
 * @returns {number} Total yarn cost needed
 */
function get_hat_cost(staticData, hatType) {
  if (!staticData || !staticData.game_info || !staticData.game_info['1'] || !staticData.game_info['1'].hat_info) {
    return 0;
  }

  const hatInfo = staticData.game_info['1'].hat_info;
  const hatYarnCosts = hatInfo.hat_yarn_costs || {};
  const hatCraftOrder = hatInfo.hat_craft_order || [];

  let cost = 0;
  for (const h of hatCraftOrder) {
    // Keys in JSON are strings, so convert h to string when accessing the costs
    cost += hatYarnCosts[String(h)] || 0;
    if (h === hatType) {
      break;
    }
  }

  return cost;
}

/**
 * Check if player can use a specific hat
 * @param {Object} state - Canonical state object
 * @param {Object} world - World/settings object
 * @param {string|number} hatType - The hat type to check (string name or HatType enum value)
 * @param {Object} staticData - Static game data
 * @returns {boolean}
 */
export function can_use_hat(state, world, hatType, staticData) {
  console.log(`[can_use_hat] Called with hatType=${hatType}, typeof=${typeof hatType}`);

  // Map HatType enum values (integers) to item names
  const hatEnumToItem = {
    0: 'Sprint Hat',      // HatType.SPRINT
    1: 'Brewing Hat',     // HatType.BREWING
    2: 'Ice Hat',         // HatType.ICE
    3: 'Dweller Mask',    // HatType.DWELLER
    4: 'Time Stop Hat'    // HatType.TIME_STOP
  };

  // Map string names to item names (for backwards compatibility)
  const hatNameToItem = {
    'Sprint': 'Sprint Hat',
    'Brewing': 'Brewing Hat',
    'Ice': 'Ice Hat',
    'Dweller': 'Dweller Mask',
    'Time Stop': 'Time Stop Hat'
  };

  let itemName;
  let hatTypeNum;
  if (typeof hatType === 'number') {
    hatTypeNum = hatType;
    itemName = hatEnumToItem[hatType];
  } else {
    itemName = hatNameToItem[hatType];
    // Find the numeric hat type for Yarn cost calculation
    for (const [num, name] of Object.entries(hatEnumToItem)) {
      if (name === itemName) {
        hatTypeNum = parseInt(num);
        break;
      }
    }
  }

  console.log(`[can_use_hat] itemName=${itemName}, hatTypeNum=${hatTypeNum}`);

  if (!itemName) {
    console.log(`[can_use_hat] No itemName found, returning false`);
    return false;
  }

  // Check if HatItems option is enabled (hats are separate items)
  const hatItemsEnabled = staticData?.settings?.['1']?.HatItems;
  console.log(`[can_use_hat] HatItems enabled: ${hatItemsEnabled}`);
  if (hatItemsEnabled) {
    const result = has(state, itemName, staticData);
    console.log(`[can_use_hat] Checking for hat item ${itemName}: ${result}`);
    return result;
  }

  // HatItems is disabled, check Yarn count instead
  if (hatTypeNum !== undefined) {
    const hatInfo = staticData?.game_info?.['1']?.hat_info;
    if (hatInfo && hatInfo.hat_yarn_costs) {
      // Keys in JSON are strings, so convert hatTypeNum to string
      const hatYarnCost = hatInfo.hat_yarn_costs[String(hatTypeNum)];
      console.log(`[can_use_hat] hatYarnCost for ${hatTypeNum}: ${hatYarnCost}`);
      // Check if hat cost is 0 or negative (in starting inventory)
      if (hatYarnCost !== undefined && hatYarnCost <= 0) {
        console.log(`[can_use_hat] Hat in starting inventory, returning true`);
        return true;
      }

      // Check if player has enough Yarn to craft this hat
      const requiredYarn = get_hat_cost(staticData, hatTypeNum);
      const yarnCount = count(state, 'Yarn', staticData);
      console.log(`[can_use_hat] Required Yarn: ${requiredYarn}, Player Yarn: ${yarnCount}`);
      const result = yarnCount >= requiredYarn;
      console.log(`[can_use_hat] Returning ${result}`);
      return result;
    }
  }

  // Fallback: check for hat item directly
  console.log(`[can_use_hat] Fallback: checking for hat item ${itemName}`);
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