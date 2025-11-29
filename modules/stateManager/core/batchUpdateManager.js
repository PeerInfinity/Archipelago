/**
 * Batch Update Manager Module
 *
 * Handles batch update operations for StateManager to optimize performance
 * when applying multiple inventory changes at once.
 *
 * Purpose:
 * - Collect multiple inventory changes without triggering UI updates after each change
 * - Process all changes in a single batch, then update UI once
 * - Defer expensive region reachability computation until batch is complete
 * - Reduce overhead of multiple cache invalidations and snapshot updates
 *
 * Data Flow:
 *
 * Begin Batch Update (beginBatchUpdate):
 *   Input: deferRegionComputation flag (boolean)
 *     ├─> true: Defer region computation until commit (default)
 *     ├─> false: Allow region computation during batch
 *
 *   Processing:
 *     ├─> Set _batchMode flag to true
 *     ├─> Set _deferRegionComputation flag
 *     ├─> Initialize _batchedUpdates Map to collect changes
 *
 *   Output: StateManager enters batch mode
 *     ├─> Inventory operations queue updates instead of applying immediately
 *     ├─> No cache invalidation or snapshot updates during batch
 *
 * Commit Batch Update (commitBatchUpdate):
 *   Input: Current StateManager state with batched updates
 *     ├─> _batchedUpdates: Map of item name -> count to add
 *     ├─> _batchMode: true (batch mode active)
 *     ├─> _deferRegionComputation: flag from begin
 *
 *   Processing:
 *     ├─> Exit batch mode (_batchMode = false)
 *     ├─> Iterate through all batched updates
 *     ├─> Apply each item addition to inventory
 *     ├─> Track if inventory changed
 *     ├─> Clear batched updates map
 *     ├─> If inventory changed:
 *       ├─> Invalidate reachability cache
 *       ├─> Recompute regions (if not deferred OR if changed)
 *       ├─> Send snapshot update to proxy
 *
 *   Output: All batched changes applied
 *     ├─> Inventory updated with all changes
 *     ├─> Cache invalidated if needed
 *     ├─> Regions recomputed if needed
 *     ├─> Single snapshot sent (not one per item)
 *
 * Update Inventory From List (updateInventoryFromList):
 *   Input: Array of item names to add
 *     ├─> items: string[] (item names to add)
 *
 *   Processing:
 *     ├─> Begin batch update (defer region computation)
 *     ├─> Add each item to inventory (queued in batch)
 *     ├─> Commit batch update (apply all at once)
 *
 *   Output: All items added efficiently
 *     ├─> Single reachability computation
 *     ├─> Single snapshot update
 *     ├─> Much faster than individual additions
 *
 * Performance Benefits:
 * - Reduces N snapshot updates to 1 snapshot update
 * - Reduces N cache invalidations to 1 cache invalidation
 * - Reduces N region computations to 1 region computation
 * - Critical for loading state with many items (e.g., 50+ items from server)
 *
 * Example Usage:
 * ```javascript
 * // Without batch (slow - 50 snapshot updates):
 * for (const item of items) {
 *   stateManager.addItemToInventory(item);  // Recomputes regions + sends snapshot each time
 * }
 *
 * // With batch (fast - 1 snapshot update):
 * stateManager.beginBatchUpdate();
 * for (const item of items) {
 *   stateManager.addItemToInventory(item);  // Queued only
 * }
 * stateManager.commitBatchUpdate();  // Recomputes regions + sends snapshot once
 *
 * // Convenience method:
 * stateManager.updateInventoryFromList(items);  // Does begin/loop/commit automatically
 * ```
 *
 * Integration with InventoryManager:
 * - InventoryManager checks _batchMode flag
 * - If _batchMode is true, inventory operations queue updates to _batchedUpdates
 * - If _batchMode is false, inventory operations apply immediately
 * - This module commits the queued updates when ready
 *
 * @module stateManager/core/batchUpdateManager
 */

import { createUniversalLogger } from '../../../app/core/universalLogger.js';

const moduleLogger = createUniversalLogger('batchUpdateManager');

function log(level, message, ...data) {
  moduleLogger[level](message, ...data);
}

/**
 * Begin a batch update to collect inventory changes without triggering UI updates
 *
 * @param {StateManager} manager - The StateManager instance
 * @param {boolean} deferRegionComputation - Whether to defer region computation until commit (default: true)
 */
export function beginBatchUpdate(manager, deferRegionComputation = true) {
  manager._logDebug('[BatchUpdateManager] Beginning batch update...', { deferRegionComputation });

  manager._batchMode = true;
  manager._deferRegionComputation = deferRegionComputation;
  manager._batchedUpdates = new Map();

  manager._logDebug('[BatchUpdateManager] Batch mode enabled.');
}

/**
 * Commit a batch update and process all collected inventory changes
 *
 * @param {StateManager} manager - The StateManager instance
 */
export function commitBatchUpdate(manager) {
  if (!manager._batchMode) {
    manager._logDebug('[BatchUpdateManager] Not in batch mode, nothing to commit.');
    return; // Not in batch mode, nothing to do
  }

  manager._logDebug('[BatchUpdateManager] Committing batch update...', {
    batchedUpdateCount: manager._batchedUpdates.size
  });

  manager._batchMode = false;
  let inventoryChanged = false;

  // Process all batched updates
  for (const [itemName, count] of manager._batchedUpdates.entries()) {
    if (count > 0) {
      // Use format-agnostic helper from InventoryManager
      manager._addItemToInventory(itemName, count);
      inventoryChanged = true;
    } else if (count < 0) {
      // This case is not currently used as we only add items in batch mode
      log(
        'warn',
        `Batch commit with count ${count} needs inventory.removeItem for ${itemName}`
      );
    }
  }

  manager._batchedUpdates.clear();

  let needsSnapshotUpdate = false;

  if (inventoryChanged) {
    manager._logDebug('[BatchUpdateManager] Inventory changed during batch update.');
    manager.invalidateCache();
    needsSnapshotUpdate = true;
  }

  // Compute regions if not deferred OR if inventory changed (which invalidates cache)
  if (!manager._deferRegionComputation || inventoryChanged) {
    manager._logDebug(
      '[BatchUpdateManager] Recomputing regions after batch commit (if cache was invalid).'
    );
    manager.computeReachableRegions(); // This will update cache if invalid. Does not send snapshot.
    needsSnapshotUpdate = true; // Ensure snapshot is sent if recomputation happened or was due.
  }

  if (needsSnapshotUpdate) {
    manager._sendSnapshotUpdate();
  }

  manager._logDebug('[BatchUpdateManager] Batch update committed.', {
    inventoryChanged,
    snapshotSent: needsSnapshotUpdate
  });
}

/**
 * Update the inventory with multiple items at once using batch processing
 *
 * This is a convenience method that wraps beginBatchUpdate/commitBatchUpdate
 * around adding multiple items. Much more efficient than adding items individually.
 *
 * @param {StateManager} manager - The StateManager instance
 * @param {string[]} items - Array of item names to add
 */
export function updateInventoryFromList(manager, items) {
  manager._logDebug('[BatchUpdateManager] Updating inventory from list...', {
    itemCount: items.length
  });

  beginBatchUpdate(manager);

  items.forEach((item) => {
    manager.addItemToInventory(item);
  });

  commitBatchUpdate(manager);

  manager._logDebug('[BatchUpdateManager] Inventory updated from list.');
}
