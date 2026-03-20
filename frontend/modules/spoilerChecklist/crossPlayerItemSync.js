/**
 * Cross-Player Item Sync (Checklist-specific)
 *
 * Manages the spoiler checklist's "Simulate Received Items" feature.
 * Tracks the frontier sphere (first unchecked location) and triggers
 * item grants so the player can progress through the checklist.
 *
 * The underlying sphere-inventory computation (computeCrossPlayerItems,
 * getCumulativeBaseItems, grantUpToSphere, etc.) lives in the sphereState
 * module at sphereState/crossPlayerItems.js.
 */

import { stateManagerProxySingleton } from '../stateManager/index.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

// Re-export compareSphereIndex from its canonical location so existing
// imports (e.g., spoilerChecklistUI.js) continue to work unchanged.
import { compareSphereIndex } from '../sphereState/crossPlayerItems.js';
export { compareSphereIndex };

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('crossPlayerItemSync', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[crossPlayerItemSync] ${message}`, ...data);
  }
}

export class CrossPlayerItemSync {
  constructor() {
    this._lastCheckedCount = -1;
    this._lastSyncResult = null;
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  _getPlayerId() {
    const getIdFn = centralRegistry.getPublicFunction('sphereState', 'getCurrentPlayerId');
    return String(getIdFn?.() || DEFAULT_PLAYER_ID);
  }

  _getSphereData() {
    const getSphereData = centralRegistry.getPublicFunction('sphereState', 'getSphereData');
    if (!getSphereData) return null;
    const data = getSphereData();
    return (data && Array.isArray(data) && data.length > 0) ? data : null;
  }

  _getLocations() {
    return stateManagerProxySingleton.getStaticData()?.locations || null;
  }

  // -----------------------------------------------------------------------
  // Frontier logic (checklist-specific)
  // -----------------------------------------------------------------------

  /**
   * Find the frontier sphere — the first sphere containing an unchecked
   * location for the current player. Spheres are scanned in order.
   *
   * @param {Set<string>} checkedLocations - Set of checked location names
   * @returns {string|null} Sphere index of the frontier, or null if all checked
   */
  findFrontierSphere(checkedLocations) {
    const sphereData = this._getSphereData();
    if (!sphereData) return null;

    const sorted = [...sphereData].sort((a, b) =>
      compareSphereIndex(a.sphereIndex, b.sphereIndex)
    );

    for (const sphere of sorted) {
      // Skip sphere 0 base (starting items)
      if (sphere.integerSphere === 0 &&
          (sphere.fractionalSphere === 0 || sphere.fractionalSphere == null)) {
        continue;
      }

      const locations = sphere.locations || [];
      for (const loc of locations) {
        if (!checkedLocations.has(loc)) {
          return sphere.sphereIndex;
        }
      }
    }

    return null; // All locations checked
  }

  // -----------------------------------------------------------------------
  // Sync workflow
  // -----------------------------------------------------------------------

  /**
   * Execute a full sync: find frontier, compute expected inventory,
   * grant missing items.
   *
   * @returns {Promise<{ grantedCount: number, frontierSphere: string|null }>}
   */
  async sync() {
    const snapshot = stateManagerProxySingleton.getLatestStateSnapshot();
    if (!snapshot) return { grantedCount: 0, frontierSphere: null };

    const checkedLocations = new Set(snapshot.checkedLocations || []);
    // Update tracked count so snapshot-triggered _maybeSyncReceivedItems
    // doesn't redundantly re-sync after our batch commit fires a snapshot.
    this._lastCheckedCount = checkedLocations.size;
    const frontierSphere = this.findFrontierSphere(checkedLocations);

    // Use total expected inventory for the delta to avoid the overlap bug
    // where own-player items mask the need for cross-player items of the same name.
    const getCumulativeBaseItemsFn = centralRegistry.getPublicFunction('sphereState', 'getCumulativeBaseItems');
    const totalExpected = getCumulativeBaseItemsFn?.(frontierSphere, false);
    const currentInventory = snapshot.inventory || {};

    const itemsToGrant = [];
    if (totalExpected) {
      for (const [name, expectedCount] of Object.entries(totalExpected)) {
        const actualCount = currentInventory[name] || 0;
        const delta = expectedCount - actualCount;
        for (let i = 0; i < delta; i++) {
          itemsToGrant.push(name);
        }
      }
    }

    if (itemsToGrant.length > 0) {
      await stateManagerProxySingleton.beginBatchUpdate();
      for (const itemName of itemsToGrant) {
        await stateManagerProxySingleton.addItemToInventory(itemName, 1);
      }
      await stateManagerProxySingleton.commitBatchUpdate();
      log('info', `Synced ${itemsToGrant.length} cross-player items (frontier: ${frontierSphere})`);
    }

    // Compute cross-player items for reporting only
    const computeCrossPlayerItemsFn = centralRegistry.getPublicFunction('sphereState', 'computeCrossPlayerItems');
    const crossPlayerItems = computeCrossPlayerItemsFn?.(frontierSphere) || new Map();

    this._lastSyncResult = {
      grantedCount: itemsToGrant.length,
      frontierSphere,
      totalCrossPlayerItems: [...crossPlayerItems.values()].reduce((sum, arr) => sum + arr.length, 0),
    };

    return { grantedCount: itemsToGrant.length, frontierSphere };
  }

  // -----------------------------------------------------------------------
  // State tracking
  // -----------------------------------------------------------------------

  /**
   * Check if checked locations have changed since last sync.
   * @param {number} currentCheckedCount
   * @returns {boolean}
   */
  hasCheckedLocationsChanged(currentCheckedCount) {
    if (currentCheckedCount === this._lastCheckedCount) return false;
    this._lastCheckedCount = currentCheckedCount;
    return true;
  }

  /**
   * Get last sync result for UI display.
   * @returns {{ grantedCount: number, frontierSphere: string|null, totalCrossPlayerItems: number }|null}
   */
  getLastSyncResult() {
    return this._lastSyncResult;
  }

  /**
   * Check if this is a multiworld game with cross-player items.
   * @returns {boolean}
   */
  isMultiworld() {
    const sphereData = this._getSphereData();
    if (!sphereData) return false;
    const locations = this._getLocations();
    if (!locations) return false;
    const playerId = this._getPlayerId();

    for (const sphere of sphereData) {
      for (const locName of (sphere.locations || [])) {
        const locData = locations.get?.(locName);
        if (locData?.item?.player != null) {
          const itemPlayer = String(locData.item.player);
          if (itemPlayer !== playerId) return true;
        }
      }
    }
    return false;
  }
}
