/**
 * Stardew Valley game-specific logic module
 *
 * Handles virtual event items that are computed based on progression item collection:
 * - "Received Progression Item": Incremented by 1 for each item collected (ALL items, not just advancement)
 * - "Received Progression Percent": Computed as (received_progression_item_count * 100) // total_progression_items
 * - "Received Progressive Weapon": Max count across all weapon types (Progressive Weapon/Sword/Club/Dagger)
 *
 * IMPORTANT: In Python's StardewValleyWorld.collect(), the received_progression_item counter
 * is incremented for EVERY item that gets successfully collected, not just advancement items.
 * The total_progression_items denominator only counts advancement items, but the numerator
 * (received_progression_item) counts all received items.
 *
 * These items are tracked by the Python CollectionState and need to be mirrored in JavaScript.
 */

import * as helpers from './helpers.js';

// Weapon types that contribute to "Received Progressive Weapon" (matches APWeapon.all_weapons)
const ALL_WEAPONS = ['Progressive Weapon', 'Progressive Sword', 'Progressive Club', 'Progressive Dagger'];

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
    if (!('Received Progressive Weapon' in sm.inventory)) {
      sm.inventory['Received Progressive Weapon'] = 0;
      sm._logDebug('[Stardew Valley Logic] Created Received Progressive Weapon (was missing)');
    }

    sm._logDebug(
      `[Stardew Valley Logic] Virtual items initialized: Progression Item=${sm.inventory['Received Progression Item']}, Progression Percent=${sm.inventory['Received Progression Percent']}, Progressive Weapon=${sm.inventory['Received Progressive Weapon']}, total=${sm.totalProgressionItems || 0}`
    );
  },

  /**
   * Hook called after an item is added to inventory.
   * Updates virtual progression items for EVERY item added (not just advancement items).
   *
   * IMPORTANT: Python's StardewValleyWorld.collect() increments received_progression_item
   * for ALL items that get successfully collected, regardless of advancement status.
   * This matches the behavior where total_progression_items counts advancement items,
   * but received_progression_item counts all received items.
   *
   * @param {Object} sm - StateManager instance
   * @param {string} itemName - Name of the item that was added
   * @param {number} count - How many were added
   */
  afterItemAdded(sm, itemName, count) {
    // When use_resolved_items is enabled, the sphere log's resolved_items already
    // contain the correct virtual item values. Skip hooks to avoid double-counting.
    if (sm._skipGameLogicHooks) {
      return;
    }

    // Check if this item is a known game item
    // We count ALL items toward progression, not just advancement items
    // This matches Python's StardewValleyWorld.collect() behavior
    const itemDef = sm.itemData[itemName];

    if (!itemDef) {
      // Unknown item (e.g., virtual items like "Received Progression Percent" itself)
      // Don't count these to avoid infinite recursion
      return;
    }

    // Skip virtual progression items to avoid counting them recursively
    if (itemName === 'Received Progression Item' || itemName === 'Received Progression Percent' || itemName === 'Received Progressive Weapon') {
      return;
    }

    // Update "Received Progression Item" for ALL items (matches Python behavior)
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

    // Update "Received Progressive Weapon" = max count across all weapon types
    if (ALL_WEAPONS.includes(itemName)) {
      let maxWeapon = 0;
      for (const weapon of ALL_WEAPONS) {
        maxWeapon = Math.max(maxWeapon, sm.inventory[weapon] || 0);
      }
      sm.inventory['Received Progressive Weapon'] = maxWeapon;
      sm._logDebug(`[Stardew Valley Logic] Updated Progressive Weapon: ${maxWeapon}`);
    }
  },

  /**
   * Hook called after an item is removed from inventory.
   * Updates virtual progression items for EVERY item removed (not just advancement items).
   *
   * @param {Object} sm - StateManager instance
   * @param {string} itemName - Name of the item that was removed
   * @param {number} count - How many were removed
   */
  afterItemRemoved(sm, itemName, count) {
    // When use_resolved_items is enabled, skip hooks to avoid double-counting.
    if (sm._skipGameLogicHooks) {
      return;
    }

    // Check if this item is a known game item
    const itemDef = sm.itemData[itemName];
    if (!itemDef) {
      // Unknown item - don't count
      return;
    }

    // Skip virtual progression items to avoid counting them recursively
    if (itemName === 'Received Progression Item' || itemName === 'Received Progression Percent' || itemName === 'Received Progressive Weapon') {
      return;
    }

    // Update "Received Progression Item" for ALL items (matches Python behavior)
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

    // Recompute "Received Progressive Weapon" on weapon removal
    if (ALL_WEAPONS.includes(itemName)) {
      let maxWeapon = 0;
      for (const weapon of ALL_WEAPONS) {
        maxWeapon = Math.max(maxWeapon, sm.inventory[weapon] || 0);
      }
      sm.inventory['Received Progressive Weapon'] = maxWeapon;
      sm._logDebug(`[Stardew Valley Logic] Updated Progressive Weapon (after removal): ${maxWeapon}`);
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
