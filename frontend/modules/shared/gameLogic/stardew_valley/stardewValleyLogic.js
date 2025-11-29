/**
 * Stardew Valley game-specific logic module
 *
 * Handles virtual event items that are computed based on progression item collection:
 * - "Received Progression Item": Incremented by 1 for each advancement item collected
 * - "Received Progression Percent": Computed as (received_progression_item_count * 100) // total_progression_items
 *
 * These items are tracked by the Python CollectionState and need to be mirrored in JavaScript.
 */

import * as helpers from './helpers.js';

/**
 * State module for Stardew Valley
 */
export const stardewValleyStateModule = {
  /**
   * Initializes Stardew Valley game state.
   * Sets up virtual progression tracking.
   *
   * @returns {Object} Initial game state
   */
  initializeState() {
    return {
      flags: [],
      events: [],
      // Virtual progression tracking is done directly in inventory
      // No need for separate state
    };
  },

  /**
   * Initialize virtual progression items in the inventory.
   * Called after starting items are processed.
   *
   * NOTE: Starting items are processed in batch mode, and when the batch is committed,
   * _addItemToInventory is called for each item, which triggers the afterItemAdded hook.
   * So by the time this function is called, the hooks have already been triggered for
   * starting items and the virtual items should already have correct values.
   *
   * This function just ensures the virtual items exist in the inventory if they weren't
   * created yet (though they should have been by the hooks).
   *
   * @param {Object} sm - StateManager instance
   */
  initializeVirtualItems(sm) {
    // Ensure virtual items exist (they should already have been set by hooks)
    if (!('Received Progression Item' in sm.inventory)) {
      sm.inventory['Received Progression Item'] = 0;
      sm._logDebug('[Stardew Valley Logic] Created Received Progression Item (was missing)');
    }
    if (!('Received Progression Percent' in sm.inventory)) {
      sm.inventory['Received Progression Percent'] = 0;
      sm._logDebug('[Stardew Valley Logic] Created Received Progression Percent (was missing)');
    }

    sm._logDebug(
      `[Stardew Valley Logic] Virtual items initialized: Progression Item=${sm.inventory['Received Progression Item']}, Progression Percent=${sm.inventory['Received Progression Percent']}, total=${sm.totalProgressionItems || 0}`
    );
  },

  /**
   * Hook called after an item is added to inventory.
   * Updates virtual progression items if the added item is an advancement item.
   *
   * @param {Object} sm - StateManager instance
   * @param {string} itemName - Name of the item that was added
   * @param {number} count - How many were added
   */
  afterItemAdded(sm, itemName, count) {
    // Check if this is an advancement item
    const itemDef = sm.itemData[itemName];

    if (!itemDef || !itemDef.advancement) {
      // Not an advancement item
      return;
    }

    // NOTE: We DO count event items if they have advancement=true
    // Python's CollectionState counts all advancement items, including events like "Copper Ore (Logic event)"

    // Update "Received Progression Item"
    const currentProgItemCount = sm.inventory['Received Progression Item'] || 0;
    sm.inventory['Received Progression Item'] = currentProgItemCount + count;

    // Update "Received Progression Percent"
    // Formula: (received_progression_item_count * 100) // total_progression_items
    const totalProgItems = sm.totalProgressionItems || 0;
    if (totalProgItems > 0) {
      const newPercent = Math.floor((sm.inventory['Received Progression Item'] * 100) / totalProgItems);
      sm.inventory['Received Progression Percent'] = newPercent;

      sm._logDebug(
        `[Stardew Valley Logic] Updated progression: items=${sm.inventory['Received Progression Item']}, percent=${newPercent} (total=${totalProgItems})`
      );
    }
  },

  /**
   * Hook called after an item is removed from inventory.
   * Updates virtual progression items if the removed item was an advancement item.
   *
   * @param {Object} sm - StateManager instance
   * @param {string} itemName - Name of the item that was removed
   * @param {number} count - How many were removed
   */
  afterItemRemoved(sm, itemName, count) {
    // Check if this is an advancement item
    const itemDef = sm.itemData[itemName];
    if (!itemDef || !itemDef.advancement) {
      // Not an advancement item
      return;
    }

    // NOTE: We DO count event items if they have advancement=true
    // Python's CollectionState counts all advancement items, including events

    // Update "Received Progression Item"
    const currentProgItemCount = sm.inventory['Received Progression Item'] || 0;
    sm.inventory['Received Progression Item'] = Math.max(0, currentProgItemCount - count);

    // Update "Received Progression Percent"
    const totalProgItems = sm.totalProgressionItems || 0;
    if (totalProgItems > 0) {
      const newPercent = Math.floor((sm.inventory['Received Progression Item'] * 100) / totalProgItems);
      sm.inventory['Received Progression Percent'] = newPercent;

      sm._logDebug(
        `[Stardew Valley Logic] Updated progression (after removal): items=${sm.inventory['Received Progression Item']}, percent=${newPercent}`
      );
    }
  },

  /**
   * Loads settings into the game state.
   */
  loadSettings(gameState, settings) {
    return { ...gameState };
  },

  /**
   * Generic event processing - not needed for Stardew Valley
   */
  processEventItem(gameState, itemName) {
    return null;
  },

  /**
   * Returns the game state properties for a snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      flags: gameState?.flags || [],
      events: gameState?.events || []
    };
  }
};

/**
 * Export helper functions for use by rule engine
 */
export const helperFunctions = helpers;
