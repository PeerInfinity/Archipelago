/**
 * StateManager Inventory Management Module
 *
 * Handles all inventory operations including adding, removing, and querying items.
 * Extracted from stateManager.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Item operations (add/remove)
 *   - itemName: string (canonical item name)
 *   - count: number (quantity, default 1)
 *   - Batch mode flag
 *
 * Processing:
 *   1. Validate item exists in itemData
 *   2. Check for progression mapping (virtual items like "rep")
 *   3. Update canonical inventory {itemName: count}
 *   4. Handle max_count constraints
 *   5. Update related virtual items via progression_mapping
 *   6. Batch mode: queue updates; Non-batch: immediate with cache invalidation
 *
 * Output: Updated inventory + side effects
 *   - Inventory updated: {itemName: count}
 *   - Cache invalidated (if not batch mode)
 *   - Snapshot sent to proxy (if not batch mode)
 *   - Events published (for addItemToInventoryByName)
 *
 * INVENTORY FORMAT (Canonical):
 *   Plain object: {itemName: count}
 *   - All items initialized to 0 in initialization
 *   - Direct property access for O(1) lookups
 *   - Max count enforced from itemData.max_count
 *
 * PROGRESSION MAPPING:
 *   Virtual items (like "rep" in Bomb Rush Cyberfunk):
 *   - Type "additive": Auto-calculated from component items
 *   - Type "level-based": Normal items (Progressive Sword, etc.)
 *   - Component items update virtual items automatically
 */

// Log function is not directly imported - we use StateManager's _logDebug method
// which is passed in via the 'sm' parameter

/**
 * Adds an item to the inventory with batch mode support
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item to add
 * @param {number} count - Quantity to add (default 1)
 */
export function addItemToInventory(sm, itemName, count = 1) {
  if (!sm._batchMode) {
    // Non-batch mode: Apply immediately and update
    if (sm.inventory) {
      _addItemToInventory(sm, itemName, count);
      sm._logDebug(
        `[InventoryManager] addItemToInventory: Added "${itemName}" x${count} (canonical format)`
      );
      sm.invalidateCache(); // Adding an item can change reachability
      sm._sendSnapshotUpdate(); // Send a new snapshot
    } else {
      sm._logDebug(
        `[InventoryManager] addItemToInventory: Inventory not available for "${itemName}"`,
        null,
        'warn'
      );
    }
  } else {
    // Batch mode: Record the item update for later processing by commitBatchUpdate
    sm._logDebug(
      `[InventoryManager] addItemToInventory: Batching item "${itemName}" with count ${count}`
    );
    const currentBatchedCount = sm._batchedUpdates.get(itemName) || 0;
    sm._batchedUpdates.set(itemName, currentBatchedCount + count);
    // DO NOT call sm.inventory updates, invalidateCache(), or _sendSnapshotUpdate() here
  }
}

/**
 * Removes an item from the inventory with batch mode support
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item to remove
 * @param {number} count - Quantity to remove (default 1)
 */
export function removeItemFromInventory(sm, itemName, count = 1) {
  if (!sm._batchMode) {
    // Non-batch mode: Apply immediately and update
    if (sm.inventory) {
      _removeItemFromInventory(sm, itemName, count);
      sm._logDebug(
        `[InventoryManager] removeItemFromInventory: Removed "${itemName}" x${count} (canonical format)`
      );
      sm.invalidateCache(); // Removing items can change reachability
      sm._sendSnapshotUpdate(); // Send a new snapshot
    } else {
      sm._logDebug(
        `[InventoryManager] removeItemFromInventory: Inventory not available for "${itemName}"`,
        null,
        'warn'
      );
    }
  } else {
    // Batch mode: Record the item update for later processing by commitBatchUpdate
    sm._logDebug(
      `[InventoryManager] removeItemFromInventory: Batching item removal "${itemName}" with count ${count}`
    );
    const currentBatchedCount = sm._batchedUpdates.get(itemName) || 0;
    sm._batchedUpdates.set(itemName, currentBatchedCount - count);
    // DO NOT call invalidateCache() or _sendSnapshotUpdate() here
  }
}

/**
 * Adds an item by name with event publishing (used by external code)
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item to add
 * @param {number} count - Quantity to add (default 1)
 * @param {boolean} fromServer - Whether item came from server
 */
export function addItemToInventoryByName(sm, itemName, count = 1, fromServer = false) {
  if (!itemName) {
    sm._logDebug(
      '[InventoryManager addItemToInventoryByName] Attempted to add null or undefined item.',
      null,
      'warn'
    );
    return;
  }

  sm._logDebug(
    `[InventoryManager addItemToInventoryByName] Attempting to add: ${itemName}, Count: ${count}, FromServer: ${fromServer}`
  );

  // Use format-agnostic helper method
  _addItemToInventory(sm, itemName, count);
  sm._logDebug(
    `[InventoryManager addItemToInventoryByName] Added ${count} of "${itemName}" using format-agnostic method.`
  );

  // Publish events and update state
  sm._publishEvent('stateManager:inventoryItemAdded', {
    itemName,
    count,
    currentInventory: sm.inventory, // Canonical format is always a plain object
  });
  sm.invalidateCache(); // Adding items can change reachability
  sm._sendSnapshotUpdate(); // Send a new snapshot

  // If the item is an event item and settings indicate auto-checking event locations
  const itemDetails = sm.itemData[itemName];
  if (
    itemDetails &&
    itemDetails.event &&
    sm.settings?.gameSpecific?.auto_check_event_locations
  ) {
    sm.checkEventLocation(itemName); // Check the corresponding event location
  }
}

/**
 * Clears all items from inventory (resets all to 0)
 *
 * @param {Object} sm - StateManager instance
 */
export function clearInventory(sm) {
  // Canonical format: reset all items to 0
  if (sm.inventory && sm.itemData) {
    for (const itemName in sm.itemData) {
      if (Object.hasOwn(sm.itemData, itemName)) {
        sm.inventory[itemName] = 0;
      }
    }
    // Also clear virtual progression items (items that exist in inventory but not in itemData)
    // These are items created by progression_mapping (e.g., "rep" in Bomb Rush Cyberfunk)
    if (sm.progressionMapping) {
      for (const virtualItemName in sm.progressionMapping) {
        if (virtualItemName in sm.inventory) {
          sm.inventory[virtualItemName] = 0;
        }
      }
    }
  }
  sm._logDebug('[InventoryManager] Inventory cleared.');

  // Only invalidate cache and recompute if NOT in batch mode
  if (!sm._batchMode) {
    sm.invalidateCache();
    sm.computeReachableRegions(); // Recompute first
  } else {
    sm._logDebug(
      '[InventoryManager] clearInventory: In batch mode, deferring cache invalidation and recomputation.'
    );
    sm.invalidateCache(); // Still need to invalidate cache for batch commit to know to recompute
  }
}

/**
 * Gets the count of a specific item
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item
 * @returns {number} Item count
 */
export function getItemCount(sm, itemName) {
  return countItem(sm, itemName);
}

// ============================================================================
// INTERNAL HELPER FUNCTIONS (used by other StateManager methods)
// These are exported so StateManager can call them directly when needed
// ============================================================================

/**
 * Internal: Adds items to canonical inventory
 * Handles progression mapping and max_count constraints
 *
 * DATA TRANSFORMATION:
 *   Input: itemName, count
 *   Processing: Update inventory[itemName], handle progression_mapping
 *   Output: Modified sm.inventory
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item to add
 * @param {number} count - Quantity to add
 */
export function _addItemToInventory(sm, itemName, count = 1) {
  // Skip virtual progression counter items with type="additive" (e.g., "rep" in Bomb Rush Cyberfunk)
  // These are managed automatically by progression_mapping when their component items are added
  // DO NOT skip level-based progressive items (e.g., "Progressive Sword") - those should be added normally
  if (sm.progressionMapping && itemName in sm.progressionMapping) {
    const mapping = sm.progressionMapping[itemName];
    if (mapping && mapping.type === 'additive') {
      sm._logDebug(
        `[InventoryManager] Skipping additive progression counter "${itemName}" - it's managed by progression_mapping`
      );
      return;
    }
    // If it's not additive (e.g., level-based like Progressive Sword), continue to add it normally
  }

  // Canonical format: plain object
  if (!(itemName in sm.inventory)) {
    sm.logger.warn('InventoryManager', `Adding unknown item: ${itemName}`);
    sm.inventory[itemName] = 0;
  }

  const currentCount = sm.inventory[itemName];
  const itemDef = sm.itemData[itemName];
  const maxCount = itemDef?.max_count ?? Infinity;

  sm.inventory[itemName] = Math.min(currentCount + count, maxCount);

  // Handle progression mapping (e.g., REP items in Bomb Rush Cyberfunk)
  if (sm.progressionMapping) {
    for (const [virtualItemName, mapping] of Object.entries(sm.progressionMapping)) {
      if (mapping.type === 'additive' && mapping.items && itemName in mapping.items) {
        const valueToAdd = mapping.items[itemName] * count;
        if (!(virtualItemName in sm.inventory)) {
          sm.inventory[virtualItemName] = 0;
        }
        sm.inventory[virtualItemName] += valueToAdd;
        sm._logDebug(
          `[InventoryManager] Progression mapping: Added ${valueToAdd} to "${virtualItemName}" from "${itemName}"`
        );
      }
    }
  }
}

/**
 * Internal: Removes items from canonical inventory
 * Handles progression mapping
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item to remove
 * @param {number} count - Quantity to remove
 */
export function _removeItemFromInventory(sm, itemName, count = 1) {
  // Canonical format: plain object
  if (!(itemName in sm.inventory)) {
    sm._logDebug(`[InventoryManager] Attempting to remove unknown item: ${itemName}`, null, 'warn');
    return;
  }

  const currentCount = sm.inventory[itemName];
  const newCount = Math.max(0, currentCount - count);

  sm.inventory[itemName] = newCount;

  sm._logDebug(
    `[InventoryManager] _removeItemFromInventory: "${itemName}" count changed from ${currentCount} to ${newCount}`
  );

  // Handle progression mapping removal (e.g., REP items in Bomb Rush Cyberfunk)
  if (sm.progressionMapping) {
    for (const [virtualItemName, mapping] of Object.entries(sm.progressionMapping)) {
      if (mapping.type === 'additive' && mapping.items && itemName in mapping.items) {
        const valueToRemove = mapping.items[itemName] * count;
        if (virtualItemName in sm.inventory) {
          sm.inventory[virtualItemName] = Math.max(0, sm.inventory[virtualItemName] - valueToRemove);
          sm._logDebug(
            `[InventoryManager] Progression mapping: Removed ${valueToRemove} from "${virtualItemName}" due to "${itemName}"`
          );
        }
      }
    }
  }
}

/**
 * Checks if inventory has a specific item (count > 0)
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item
 * @returns {boolean} True if item count > 0
 */
export function hasItem(sm, itemName) {
  return (sm.inventory[itemName] || 0) > 0;
}

/**
 * Counts a specific item in inventory
 *
 * @param {Object} sm - StateManager instance
 * @param {string} itemName - Name of the item
 * @returns {number} Item count
 */
export function countItem(sm, itemName) {
  return sm.inventory[itemName] || 0;
}

/**
 * Counts all items in a group
 *
 * DATA FLOW:
 *   Input: groupName
 *   Processing: Iterate itemData, check groups array, sum inventory counts
 *   Output: Total count of all items in group
 *
 * @param {Object} sm - StateManager instance
 * @param {string} groupName - Name of the group
 * @returns {number} Total count of items in group
 */
export function countGroup(sm, groupName) {
  // In canonical format, inventory is a plain object, so we need to manually count group items
  let count = 0;
  if (sm.itemData) {
    for (const itemName in sm.itemData) {
      const itemInfo = sm.itemData[itemName];
      if (itemInfo?.groups?.includes(groupName)) {
        const itemCount = sm.inventory[itemName] || 0;
        count += itemCount;
      }
    }
  }
  return count;
}

/**
 * Checks if any item in a group exists in inventory
 *
 * @param {Object} sm - StateManager instance
 * @param {string} groupName - Name of the group
 * @returns {boolean} True if group has any items
 */
export function hasGroup(sm, groupName) {
  return countGroup(sm, groupName) > 0;
}

/**
 * Checks if inventory has ANY of the specified items
 * Python equivalent: state.has_any([items])
 *
 * @param {Object} sm - StateManager instance
 * @param {Array<string>} items - Array of item names
 * @returns {boolean} True if at least one item is in inventory
 */
export function has_any(sm, items) {
  if (!Array.isArray(items)) {
    sm._logDebug('[InventoryManager has_any] Argument is not an array:', items);
    return false;
  }
  const result = items.some(itemName => {
    const hasIt = hasItem(sm, itemName);
    sm._logDebug(`[InventoryManager has_any] Checking ${itemName}: ${hasIt} (inventory count: ${sm.inventory[itemName] || 0})`);
    return hasIt;
  });
  sm._logDebug(`[InventoryManager has_any] Final result for ${JSON.stringify(items)}: ${result}`);
  return result;
}

/**
 * Checks if inventory has ALL of the specified items
 * Python equivalent: state.has_all([items])
 *
 * @param {Object} sm - StateManager instance
 * @param {Array<string>} items - Array of item names
 * @returns {boolean} True if all items are in inventory
 */
export function has_all(sm, items) {
  if (!Array.isArray(items)) {
    return false;
  }
  return items.every(itemName => hasItem(sm, itemName));
}

/**
 * Checks if inventory has all specified items with required counts
 * Python equivalent: state.has_all_counts({item: count})
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} itemCounts - Object mapping item names to required counts
 * @returns {boolean} True if all items meet or exceed their required counts
 */
export function has_all_counts(sm, itemCounts) {
  if (typeof itemCounts !== 'object' || itemCounts === null) {
    return false;
  }
  for (const [itemName, requiredCount] of Object.entries(itemCounts)) {
    if (countItem(sm, itemName) < requiredCount) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if inventory has at least N items from a list
 * Used by ChecksFinder - counts ALL copies of items from the list
 * Python equivalent: state.has_from_list([items], count)
 *
 * DATA FLOW:
 *   Input: items array, required count
 *   Processing: Sum counts of all items in the list
 *   Output: True if total >= count
 *
 * @param {Object} sm - StateManager instance
 * @param {Array<string>} items - Array of item names
 * @param {number} count - Minimum number of items required
 * @returns {boolean} True if total count of items from list >= count
 */
export function has_from_list(sm, items, count) {
  if (!Array.isArray(items)) {
    console.warn('[InventoryManager has_from_list] First argument is not an array:', items);
    return false;
  }
  if (typeof count !== 'number' || count < 0) {
    console.warn('[InventoryManager has_from_list] Count is not a valid number:', count);
    return false;
  }

  // Count how many items from the list we have
  let itemsFound = 0;
  for (const itemName of items) {
    itemsFound += (countItem(sm, itemName) || 0);
  }

  return itemsFound >= count;
}
