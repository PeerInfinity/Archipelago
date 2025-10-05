/**
 * Celeste 64 helper functions
 * Translated from worlds/celeste64/Rules.py
 */

/**
 * Celeste 64 state management module
 */
export const celeste64StateModule = {
  /**
   * Initializes a new, empty Celeste 64 game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations
      events: [], // Event items
      // Celeste 64 specific state
      active_logic_mapping: {},
      active_region_logic_mapping: {},
      strawberries_required: 0,
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
    return null; // No special event processing for Celeste 64
  },

  /**
   * Returns the Celeste 64 state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Celeste 64 helper functions
 */
export const helperFunctions = {
  /**
   * Check if a location is accessible based on its rule requirements
   * Based on location_rule from Rules.py
   * @param {Object} snapshot - Game state snapshot
   * @param {number} playerId - Player ID (unused but part of standard interface)
   * @param {string} locationName - Name of the location to check
   * @param {Object} staticData - Static game data containing logic mappings
   * @returns {boolean} True if location is accessible
   */
  location_rule(state, playerId, locationName, staticData) {
    // Get the appropriate logic mapping based on difficulty
    const logicDifficulty = staticData?.settings?.logic_difficulty || 'standard';
    const logicMappingKey = logicDifficulty === 'standard' ? 
      'location_standard_moves_logic' : 'location_hard_moves_logic';
    
    // Try to get the logic mapping from staticData
    const activeLogicMapping = staticData?.[logicMappingKey] || {};
    
    // If location has no requirements, it's accessible
    if (!activeLogicMapping[locationName]) {
      return true;
    }
    
    // Check each possible access method (OR logic between access methods)
    const possibleAccessMethods = activeLogicMapping[locationName];
    for (const requiredItems of possibleAccessMethods) {
      // Check if player has all required items for this access method (AND logic)
      let hasAllItems = true;
      for (const item of requiredItems) {
        const itemCount = snapshot?.inventory?.[item] || 0;
        if (itemCount === 0) {
          hasAllItems = false;
          break;
        }
      }
      
      if (hasAllItems) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * Check if a region connection is accessible
   * Based on region_connection_rule from Rules.py
   * @param {Object} snapshot - Game state snapshot
   * @param {number} playerId - Player ID (unused but part of standard interface)
   * @param {string} fromRegion - Source region name
   * @param {string} toRegion - Destination region name
   * @param {Object} staticData - Static game data containing logic mappings
   * @returns {boolean} True if connection is accessible
   */
  region_connection_rule(state, playerId, fromRegion, toRegion, staticData) {
    // Get the appropriate logic mapping based on difficulty
    const logicDifficulty = staticData?.settings?.logic_difficulty || 'standard';
    const logicMappingKey = logicDifficulty === 'standard' ? 
      'region_standard_moves_logic' : 'region_hard_moves_logic';
    
    // Try to get the logic mapping from staticData
    const activeRegionLogicMapping = staticData?.[logicMappingKey] || {};
    
    // Create the connection tuple key
    const connectionKey = `${fromRegion},${toRegion}`;
    
    // If connection has no requirements, it's accessible
    if (!activeRegionLogicMapping[connectionKey]) {
      return true;
    }
    
    // Check each possible access method (OR logic between access methods)
    const possibleAccessMethods = activeRegionLogicMapping[connectionKey];
    for (const requiredItems of possibleAccessMethods) {
      // Special case: if the requirement is "cannot_access", this connection is blocked
      if (requiredItems.length === 1 && requiredItems[0] === 'cannot_access') {
        return false;
      }
      
      // Check if player has all required items for this access method (AND logic)
      let hasAllItems = true;
      for (const item of requiredItems) {
        const itemCount = snapshot?.inventory?.[item] || 0;
        if (itemCount === 0) {
          hasAllItems = false;
          break;
        }
      }
      
      if (hasAllItems) {
        return true;
      }
    }
    
    return false;
  },

  /**
   * Check if the goal condition is met
   * Based on goal_rule from Rules.py
   * @param {Object} snapshot - Game state snapshot
   * @param {number} playerId - Player ID
   * @param {Object} staticData - Static game data
   * @returns {boolean} True if goal is met
   */
  goal_rule(snapshot, staticData, playerId) {
    const strawberriesRequired = staticData?.settings?.strawberries_required || 0;
    const strawberryCount = snapshot?.inventory?.['Strawberry'] || 0;
    
    // Check if player has enough strawberries
    if (strawberryCount < strawberriesRequired) {
      return false;
    }
    
    // Check if player can reach Badeline Island region
    // This would need to be checked through the region reachability system
    // For now, we'll just check if the region is in the accessible regions
    const accessibleRegions = snapshot?.accessibleRegions || [];
    return accessibleRegions.includes('Badeline Island');
  },
};