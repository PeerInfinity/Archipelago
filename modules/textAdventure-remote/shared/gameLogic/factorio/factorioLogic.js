/**
 * Factorio game logic module
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

export const factorioStateModule = {
  /**
   * Initializes a new, empty Factorio game state.
   */
  initializeState() {
    return {
      flags: [], // Checked locations and game-specific flags
      events: [], // Event items
      // Other factorio-specific state properties can be added here if needed
    };
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Generic event processing - no special events for Factorio currently.
   */
  processEventItem(gameState, itemName) {
    return null; // Return null to indicate no state change
  },

  /**
   * Returns the Factorio state properties for a snapshot.
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },
};

/**
 * Factorio helper functions for rule evaluation.
 */
export const helperFunctions = {
  /**
   * Check if the player has an item (including technologies)
   * Handles progressive item resolution for Factorio
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item/technology to check
   * @returns {boolean} True if player has the item
   */
  has(snapshot, staticData, itemName) {
    if (!snapshot?.inventory) {
      return false;
    }

    // Direct check: does the inventory have this exact item?
    if (snapshot.inventory[itemName] > 0) {
      return true;
    }

    // Progressive item resolution: Check if this item is a resolved form of a progressive item
    // For Factorio, technologies like "logistic-science-pack" can be obtained through "progressive-science-pack"
    const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

    // Try player-indexed progression_mapping first (from rules.json), then fall back to camelCase progressionMapping (from sm.progressionMapping)
    const progressionMapping = staticData?.progression_mapping?.[playerSlot] || staticData?.progressionMapping;

    if (progressionMapping) {
      // Check each progressive item in the mapping
      for (const [progressiveItemName, mapping] of Object.entries(progressionMapping)) {
        if (!mapping.items || !Array.isArray(mapping.items)) {
          continue;
        }

        // Check if the requested item is one of the resolved forms
        const matchingLevel = mapping.items.find(levelData => levelData.name === itemName);
        if (matchingLevel) {
          // Found it! Now check if the player has enough of the progressive item
          const progressiveCount = snapshot.inventory[progressiveItemName] || 0;
          if (progressiveCount >= matchingLevel.level) {
            return true;
          }
        }
      }
    }

    return false;
  },

  /**
   * Count how many of an item the player has
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} itemName - Name of the item/technology to count
   * @returns {number} Count of the item
   */
  count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
  },

  /**
   * Get the item placed at a specific location
   * Used for self-locking item logic
   * @param {Object} snapshot - Game state snapshot
   * @param {Object} staticData - Static game data
   * @param {string} locationName - Name of the location to check
   * @returns {Array|null} Array of [itemName, playerId] or null if no item
   */
  location_item_name(snapshot, staticData, locationName) {
    // Find the location in staticData
    const locations = staticData?.locations || [];

    // Handle both array and object formats
    let location;
    if (Array.isArray(locations)) {
      location = locations.find(loc => loc?.name === locationName);
    } else if (typeof locations === 'object') {
      location = locations[locationName];
    }

    if (!location || !location.item) {
      return null;
    }

    // Return tuple of [item_name, player_id]
    return [location.item.name, location.item.player];
  },
};
