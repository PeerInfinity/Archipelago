/**
 * Shared helper functions for proof/graph module index.js files.
 *
 * Provides common utilities used by all proof module entry points:
 *   - Player world extraction from static data
 *   - Structure detection (proof_structure or graph_structure)
 *   - State snapshot synchronization
 */

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

/**
 * Get the player-specific world data from static data.
 * @param {Object} staticData
 * @returns {Object|null}
 */
export function getPlayerWorld(staticData) {
  if (!staticData?.world) return null;
  const playerId = staticData.playerId || '1';
  return staticData.world[playerId] || null;
}

/**
 * Sync a proof state from a stateManager snapshot.
 * Handles the { snapshot: ... } wrapper and falls back to getLatestStateSnapshot().
 *
 * @param {Object} state - A proof state instance (must have syncInventory, syncLocations)
 * @param {Object} [snapshotData] - Event data (may be wrapped)
 */
export function syncStateFromSnapshot(state, snapshotData) {
  if (!state) return;
  const snapshot = snapshotData?.snapshot || snapshotData || stateManager.getLatestStateSnapshot();
  if (!snapshot) return;

  if (snapshot.inventory) {
    state.syncInventory(snapshot.inventory);
  }
  if (snapshot.checkedLocations) {
    state.syncLocations(snapshot.checkedLocations);
  }
}

/**
 * Create a logger function for a proof module.
 *
 * @param {string} moduleName - e.g. 'proofQueue'
 * @returns {Function} log(level, message, ...data)
 */
export function createLogger(moduleName) {
  return function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
      window.logger[level](moduleName, message, ...data);
    } else {
      const method = console[level === 'info' ? 'log' : level] || console.log;
      method(`[${moduleName}] ${message}`, ...data);
    }
  };
}

/**
 * Check if slot data contains a proof or graph structure.
 * @param {Object} slotData
 * @returns {boolean}
 */
export function hasStructureData(slotData) {
  return !!(slotData?.proof_structure || slotData?.graph_structure);
}

/**
 * Initialize proof/graph state from static data.
 * Common pattern used by all proof module index.js initialize functions.
 *
 * Accepts either proof_structure (MetaMath) or graph_structure (DepGraph).
 *
 * @param {Object} state - The proof state instance
 * @param {Object} staticData - Static data from stateManager
 * @param {Function} log - Logger function
 * @param {Function} wirePublishing - Function to wire event bus publishing
 * @returns {boolean} Whether initialization succeeded
 */
export function initializeProofState(state, staticData, log, wirePublishing) {
  const playerWorld = getPlayerWorld(staticData);
  const slotData = playerWorld?.slot_data;
  if (!hasStructureData(slotData)) {
    log('info', 'No proof_structure or graph_structure — not a proof/graph game');
    return false;
  }

  // If already loaded (UI handler may have loaded it first), just wire up
  // event bus publishing without re-loading or overwriting existing callbacks.
  if (state.isLoaded) {
    log('info', 'Structure already loaded, wiring event bus publishing');
    wirePublishing();
    syncStateFromSnapshot(state);
    return true;
  }

  const structureType = slotData.proof_structure ? 'proof' : 'graph';
  log('info', `Found ${structureType} structure, initializing...`);

  const success = state.loadFromSlotData(
    slotData,
    playerWorld.name_substitutions,
    playerWorld.options
  );

  if (!success) {
    log('warn', `Failed to load ${structureType} structure from slot data`);
    return false;
  }

  log('info', `Loaded ${structureType} "${state.theoremName}" with ${state.steps.size} steps`);

  syncStateFromSnapshot(state);
  wirePublishing();
  return true;
}
