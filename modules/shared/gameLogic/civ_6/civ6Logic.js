/**
 * Civilization VI state management module
 */
export const civ6StateModule = {
  /**
   * Initializes a new Civilization VI game state.
   */
  initializeState() {
    return {
      flags: [],
      events: [],
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Process event items for Civilization VI.
   */
  processEventItem(gameState, itemName) {
    return null;
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
 * Civilization VI helper functions
 */
export const helperFunctions = {
  /**
   * Check if the player has an item
   */
  has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
  },

  /**
   * Count how many of an item the player has
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },

  /**
   * Get the item placed at a specific location
   */
  location_item_name(snapshot, staticData, locationName) {
    const locations = staticData?.locations || [];

    let location;
    if (Array.isArray(locations)) {
      location = locations.find(loc => loc?.name === locationName);
    } else if (typeof locations === 'object') {
      location = locations[locationName];
    }

    if (!location || !location.item) {
      return null;
    }

    return [location.item.name, location.item.player];
  },

  /**
   * Check if the player has all required non-progressive items for an era.
   *
   * This function checks if the player has collected all the non-progressive items
   * required to advance from the given era to the next era.
   *
   * Python equivalent:
   * def has_non_progressive_items(state: CollectionState, era: EraType, world: "CivVIWorld") -> bool:
   *     return state.has_all(world.era_required_non_progressive_items[era], world.player)
   *
   * @param {Object} snapshot - Game state snapshot with inventory
   * @param {Object} staticData - Static game data containing era_required_non_progressive_items
   * @param {string} eraName - Name of the era (e.g., "ERA_ANCIENT")
   * @returns {boolean} True if all required non-progressive items are collected
   */
  has_non_progressive_items(snapshot, staticData, eraName) {
    // Get the era requirements from game_info
    const gameInfo = staticData?.game_info?.['1'];
    if (!gameInfo || !gameInfo.era_required_non_progressive_items) {
      console.warn(`[civ6Logic] No era requirements found in game_info`);
      return false;
    }

    const requiredItems = gameInfo.era_required_non_progressive_items[eraName];
    if (!requiredItems || requiredItems.length === 0) {
      // If no items are required, the condition is satisfied
      return true;
    }

    // Check if all required items are in inventory
    for (const itemName of requiredItems) {
      if (!snapshot?.inventory || (snapshot.inventory[itemName] || 0) <= 0) {
        return false;
      }
    }

    return true;
  },

  /**
   * Check if the player has all required progressive items (with counts) for an era.
   *
   * This function checks if the player has collected enough of each progressive item
   * required to advance from the given era to the next era.
   *
   * Python equivalent:
   * def has_progressive_items(state: CollectionState, era: EraType, world: "CivVIWorld") -> bool:
   *     return state.has_all_counts(world.era_required_progressive_items_counts[era], world.player)
   *
   * @param {Object} snapshot - Game state snapshot with inventory
   * @param {Object} staticData - Static game data containing era_required_progressive_items_counts
   * @param {string} eraName - Name of the era (e.g., "ERA_ANCIENT")
   * @returns {boolean} True if all required progressive items with counts are collected
   */
  has_progressive_items(snapshot, staticData, eraName) {
    // Get the era requirements from game_info
    const gameInfo = staticData?.game_info?.['1'];
    if (!gameInfo || !gameInfo.era_required_progressive_items_counts) {
      console.warn(`[civ6Logic] No progressive era requirements found in game_info`);
      return false;
    }

    const requiredItemCounts = gameInfo.era_required_progressive_items_counts[eraName];
    if (!requiredItemCounts || Object.keys(requiredItemCounts).length === 0) {
      // If no items are required, the condition is satisfied
      return true;
    }

    // Check if all required items are in inventory with sufficient counts
    for (const [itemName, requiredCount] of Object.entries(requiredItemCounts)) {
      const currentCount = snapshot?.inventory?.[itemName] || 0;
      if (currentCount < requiredCount) {
        return false;
      }
    }

    return true;
  },
};
