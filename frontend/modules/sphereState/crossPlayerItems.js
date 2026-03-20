/**
 * Cross-Player Item Computation
 *
 * Sphere-based inventory computation for multiworld games.
 * Computes which items a player should have at a given sphere,
 * distinguishes own-player items (granted by checkLocation) from
 * cross-player items (received from other players), and grants
 * missing items to the stateManager worker.
 *
 * These functions live in the sphereState module because they
 * operate on sphere data and inventory state — not on checklist
 * UI or frontier-based sync logic.
 */

import { getSphereStateSingleton } from './singleton.js';
import { stateManagerProxySingleton } from '../stateManager/index.js';
import { DEFAULT_PLAYER_ID } from '../shared/playerIdUtils.js';

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('crossPlayerItems', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[crossPlayerItems] ${message}`, ...data);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSphereData() {
  const sphereState = getSphereStateSingleton();
  if (!sphereState) return null;
  const data = sphereState.getSphereData();
  return (data && Array.isArray(data) && data.length > 0) ? data : null;
}

function getPlayerId() {
  const sphereState = getSphereStateSingleton();
  return String(sphereState?.getCurrentPlayerId() || DEFAULT_PLAYER_ID);
}

function getLocations() {
  return stateManagerProxySingleton.getStaticData()?.locations || null;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Compare sphere index strings like "0", "0.41", "0.100", "1.31".
 * Format is "major.minor" where both parts are integers.
 * "0.100" > "0.98" (100 > 98), unlike numeric comparison.
 */
export function compareSphereIndex(a, b) {
  const [aMajor, aMinor = 0] = String(a).split('.').map(Number);
  const [bMajor, bMinor = 0] = String(b).split('.').map(Number);
  if (aMajor !== bMajor) return aMajor - bMajor;
  return aMinor - bMinor;
}

/**
 * Compute cross-player items using the dedup pattern.
 *
 * sphereState.inventoryDetails.base_items is CUMULATIVE (accumulated by
 * _mergeInventory), so we use the last included sphere's cumulative total
 * and subtract own-player items from ALL included locations at once.
 *
 * @param {string} [upToSphere] - Only include spheres up to this index.
 *                                 If null/undefined, include all spheres.
 * @param {boolean} [inclusive=false] - If true, include upToSphere itself.
 *                                      If false, exclude it (strictly before).
 * @returns {Map<string, string[]>} sphereIndex → array of item names to grant
 */
export function computeCrossPlayerItems(upToSphere, inclusive = false) {
  const locations = getLocations();
  if (!locations) return new Map();

  const playerId = getPlayerId();
  const sphereData = getSphereData();
  if (!sphereData) return new Map();

  const sorted = [...sphereData].sort((a, b) =>
    compareSphereIndex(a.sphereIndex, b.sphereIndex)
  );

  let lastIncludedSphere = null;
  const allOwnLocationItems = {};

  for (const sphere of sorted) {
    if (upToSphere != null) {
      const cmp = compareSphereIndex(sphere.sphereIndex, upToSphere);
      if (inclusive ? cmp > 0 : cmp >= 0) continue;
    }

    // Collect own-player items from ALL spheres (including sphere 0)
    // so they are properly subtracted from the cumulative base_items
    for (const locName of (sphere.locations || [])) {
      const locData = locations.get?.(locName);
      if (locData?.item?.name) {
        const itemPlayer = String(locData.item.player ?? playerId);
        if (itemPlayer === playerId) {
          const name = locData.item.name;
          allOwnLocationItems[name] = (allOwnLocationItems[name] || 0) + 1;
        }
      }
    }

    // Track last included sphere (skip sphere 0 base — its cumulative
    // base_items are just starting items)
    if (sphere.integerSphere === 0 &&
        (sphere.fractionalSphere === 0 || sphere.fractionalSphere == null)) {
      continue;
    }
    lastIncludedSphere = sphere;
  }

  if (!lastIncludedSphere) return new Map();

  const cumulativeItems = lastIncludedSphere.inventoryDetails?.base_items || {};
  if (Object.keys(cumulativeItems).length === 0) return new Map();

  // Expand cumulative items to array
  const allItems = [];
  for (const [name, count] of Object.entries(cumulativeItems)) {
    for (let i = 0; i < count; i++) allItems.push(name);
  }

  // Subtract all own-location items (what checkLocation will grant)
  const itemsToGrant = [...allItems];
  for (const [name, count] of Object.entries(allOwnLocationItems)) {
    let remaining = count;
    for (let i = itemsToGrant.length - 1; i >= 0 && remaining > 0; i--) {
      if (itemsToGrant[i] === name) {
        itemsToGrant.splice(i, 1);
        remaining--;
      }
    }
  }

  if (itemsToGrant.length > 0) {
    return new Map([[lastIncludedSphere.sphereIndex, itemsToGrant]]);
  }
  return new Map();
}

/**
 * Compute the delta between expected cross-player items and actual inventory.
 * Returns only items that still need to be granted.
 *
 * @param {Map<string, string[]>} crossPlayerItems - from computeCrossPlayerItems()
 * @param {object} currentInventory - snapshot.inventory ({itemName: count})
 * @returns {string[]} Item names to grant (may contain duplicates for count > 1)
 */
export function computeGrantDelta(crossPlayerItems, currentInventory) {
  const expectedCounts = {};
  for (const [, items] of crossPlayerItems) {
    for (const name of items) {
      expectedCounts[name] = (expectedCounts[name] || 0) + 1;
    }
  }

  const itemsToGrant = [];
  for (const [name, expectedCount] of Object.entries(expectedCounts)) {
    const actualCount = currentInventory?.[name] || 0;
    const delta = expectedCount - actualCount;
    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        itemsToGrant.push(name);
      }
    }
  }

  return itemsToGrant;
}

/**
 * Get cumulative base_items from sphereState up to a given sphere index.
 * Returns the total inventory the player should have by that sphere.
 *
 * @param {string} upToSphere - Sphere index boundary
 * @param {boolean} [inclusive=false] - Whether to include the boundary sphere
 * @returns {object|null} {itemName: count} or null if unavailable
 */
export function getCumulativeBaseItems(upToSphere, inclusive = false) {
  const sphereData = getSphereData();
  if (!sphereData) return null;

  const sorted = [...sphereData].sort((a, b) =>
    compareSphereIndex(a.sphereIndex, b.sphereIndex)
  );

  let lastIncludedSphere = null;
  for (const sphere of sorted) {
    if (upToSphere != null) {
      const cmp = compareSphereIndex(sphere.sphereIndex, upToSphere);
      if (inclusive ? cmp > 0 : cmp >= 0) continue;
    }
    // Skip sphere 0 base (starting items only)
    if (sphere.integerSphere === 0 &&
        (sphere.fractionalSphere === 0 || sphere.fractionalSphere == null)) {
      continue;
    }
    lastIncludedSphere = sphere;
  }

  return lastIncludedSphere?.inventoryDetails?.base_items || null;
}

/**
 * Grant items up to and including a specific sphere index.
 *
 * Uses total expected inventory (cumulative base_items) for the delta
 * instead of just cross-player items. This avoids a bug where items that
 * appear as both own-player and cross-player (e.g., "Yarn") would not be
 * granted because the own-player copies already satisfy the cross-player
 * expected count.
 *
 * @param {string} sphereIndex - Grant items for all spheres up to and including this one
 * @returns {Promise<{ grantedCount: number }>}
 */
export async function grantUpToSphere(sphereIndex) {
  const totalExpected = getCumulativeBaseItems(sphereIndex, true);
  if (!totalExpected || Object.keys(totalExpected).length === 0) {
    return { grantedCount: 0 };
  }

  const snapshot = stateManagerProxySingleton.getLatestStateSnapshot();
  const currentInventory = snapshot?.inventory || {};

  const itemsToGrant = [];
  for (const [name, expectedCount] of Object.entries(totalExpected)) {
    const actualCount = currentInventory[name] || 0;
    const delta = expectedCount - actualCount;
    for (let i = 0; i < delta; i++) {
      itemsToGrant.push(name);
    }
  }

  if (itemsToGrant.length > 0) {
    await stateManagerProxySingleton.beginBatchUpdate();
    for (const itemName of itemsToGrant) {
      await stateManagerProxySingleton.addItemToInventory(itemName, 1);
    }
    await stateManagerProxySingleton.commitBatchUpdate();
    log('info', `Granted ${itemsToGrant.length} items up to sphere ${sphereIndex}`);
  }

  return { grantedCount: itemsToGrant.length };
}
