/**
 * Shared UI helper functions for proof modules.
 *
 * Provides common utilities used by ProofQueueUI and ProofGraphUI:
 *   - Event bus fallback wrapper
 *   - Logger factory
 *   - Proof structure detection
 *   - Snapshot sync
 *   - Region lookup for location checks
 *   - Location check dispatch
 */

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js';

/**
 * Create an event bus getter with fallback to global eventBus.
 * Used before index.js initialize() sets the module event bus.
 *
 * @param {string} moduleName - e.g. 'proofQueue'
 * @param {Function} getModuleEventBus - Returns the module-level event bus (may be null)
 * @returns {Function} Getter that returns the active event bus
 */
export function createEventBusGetter(moduleName, getModuleEventBus) {
  return () => {
    const bus = getModuleEventBus();
    if (bus) return bus;
    // Fallback wrapper before initialize() runs
    return {
      publish: (event, data) => eventBus.publish(event, data, moduleName),
      subscribe: (event, callback) => eventBus.subscribe(event, callback, moduleName),
      unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, moduleName),
    };
  };
}

/**
 * Create a logger function for a proof module UI.
 *
 * @param {string} component - e.g. 'proofQueueUI'
 * @returns {Function} log(level, message, ...data)
 */
export function createLogger(component) {
  return function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
      window.logger[level](component, message, ...data);
    } else {
      const method = console[level === 'info' ? 'log' : level] || console.log;
      method(`[${component}] ${message}`, ...data);
    }
  };
}

/**
 * Detect the structure type of the current game.
 * @returns {'proof'|'graph'|null} 'proof' for MetaMath, 'graph' for DepGraph, null if neither
 */
export function getStructureType() {
  const staticData = stateManager.getStaticData();
  if (!staticData?.world) return null;
  const playerId = staticData.playerId || '1';
  const slotData = staticData.world[playerId]?.slot_data;
  if (slotData?.proof_structure) return 'proof';
  if (slotData?.graph_structure) return 'graph';
  return null;
}

/**
 * Check if the current game has a proof or graph structure.
 * Accepts either proof_structure (MetaMath) or graph_structure (DepGraph).
 * @returns {boolean}
 */
export function hasProofStructure() {
  const staticData = stateManager.getStaticData();
  if (!staticData?.world) return false;
  const playerId = staticData.playerId || '1';
  const playerWorld = staticData.world[playerId];
  const slotData = playerWorld?.slot_data;
  return !!(slotData?.proof_structure || slotData?.graph_structure);
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
 * Find the region name containing a given location.
 *
 * @param {string} locationName - The location to look up
 * @returns {string} Region name, or locationName as fallback
 */
export function findRegionForLocation(locationName) {
  const staticData = stateManager.getStaticData();
  if (staticData?.regions) {
    for (const [rName, rData] of Object.entries(staticData.regions)) {
      if (rData.locations && rData.locations.some(loc => loc.name === locationName)) {
        return rName;
      }
    }
  }
  return locationName; // fallback
}

/**
 * Dispatch a location check for a proof step.
 *
 * Verifies the location exists, finds its region, and dispatches the event.
 * If the location doesn't exist in static data, marks it as pre-checked.
 *
 * @param {Object} step - The proof step to check
 * @param {Object} state - The proof state instance
 * @param {Object} dispatcher - The module dispatcher
 * @param {string} originator - e.g. 'ProofQueueCheck'
 * @param {Function} log - Logger function
 * @param {Function} [onPreChecked] - Called if location was pre-checked (not found in static data)
 * @returns {boolean} Whether a location check was dispatched
 */
export function dispatchLocationCheck(step, state, dispatcher, originator, log, onPreChecked) {
  if (!step || !dispatcher) return false;

  // Verify the location actually exists before trying to check it
  const staticData = stateManager.getStaticData();
  if (staticData?.locations && !staticData.locations.has(step.locationName)) {
    log('warn', `Location "${step.locationName}" not found — marking as pre-checked`);
    state.checkedLocations.add(step.locationName);
    if (onPreChecked) onPreChecked();
    return false;
  }

  const regionName = findRegionForLocation(step.locationName);

  const payload = {
    locationName: step.locationName,
    regionName: regionName,
    originator: originator,
    originalDOMEvent: true,
  };

  log('info', `Checking location: ${step.locationName}`, payload);
  dispatcher.publish('user:locationCheck', payload, {
    initialTarget: 'bottom',
  });

  return true;
}

/**
 * Load proof/graph state from static data if not already loaded.
 * Common pattern used by all UI _handleRulesLoaded methods.
 *
 * Accepts either proof_structure (MetaMath) or graph_structure (DepGraph).
 *
 * @param {Object} state - The proof state instance
 * @returns {boolean} Whether state is loaded after this call
 */
export function ensureStateLoaded(state) {
  if (state.isLoaded) return true;

  const staticData = stateManager.getStaticData();
  if (!staticData?.world) return false;

  const playerId = staticData.playerId || '1';
  const playerWorld = staticData.world[playerId];
  const slotData = playerWorld?.slot_data;
  if (!slotData?.proof_structure && !slotData?.graph_structure) return false;

  state.loadFromSlotData(slotData, playerWorld.name_substitutions, playerWorld.options);
  return state.isLoaded;
}
