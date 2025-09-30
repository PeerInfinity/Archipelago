// frontend/modules/sphereState/index.js

import { createSphereStateSingleton, getSphereStateSingleton } from './singleton.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('sphereStateModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[sphereStateModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'sphereState',
  description: 'Manages sphere log data and player progression through spheres.',
  // NO componentType - this is a non-UI module
};

// Store module-level references
let moduleEventBus = null;
const moduleId = 'sphereState';

/**
 * Registration function for the sphereState module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export async function register(registrationApi) {
  log('info', '[sphereState Module] Registering...');

  // Register public functions
  registrationApi.registerPublicFunction(moduleId, 'getSphereData', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getSphereData();
  });

  registrationApi.registerPublicFunction(moduleId, 'getCurrentSphere', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getCurrentSphere();
  });

  registrationApi.registerPublicFunction(moduleId, 'getCurrentIntegerSphere', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getCurrentIntegerSphere();
  });

  registrationApi.registerPublicFunction(moduleId, 'getCurrentFractionalSphere', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getCurrentFractionalSphere();
  });

  registrationApi.registerPublicFunction(moduleId, 'getCheckedLocations', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getCheckedLocations();
  });

  registrationApi.registerPublicFunction(moduleId, 'isLocationChecked', (locationName) => {
    const sphereState = getSphereStateSingleton();
    return sphereState.isLocationChecked(locationName);
  });

  registrationApi.registerPublicFunction(moduleId, 'getAccessibleLocations', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getAccessibleLocations();
  });

  registrationApi.registerPublicFunction(moduleId, 'getAccessibleRegions', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getAccessibleRegions();
  });

  registrationApi.registerPublicFunction(moduleId, 'isSphereComplete', (integerSphere, fractionalSphere) => {
    const sphereState = getSphereStateSingleton();
    return sphereState.isSphereComplete(integerSphere, fractionalSphere);
  });

  registrationApi.registerPublicFunction(moduleId, 'isIntegerSphereComplete', (integerSphere) => {
    const sphereState = getSphereStateSingleton();
    return sphereState.isIntegerSphereComplete(integerSphere);
  });

  registrationApi.registerPublicFunction(moduleId, 'getSphereByIndex', (integerSphere, fractionalSphere) => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getSphereByIndex(integerSphere, fractionalSphere);
  });

  registrationApi.registerPublicFunction(moduleId, 'getAllSpheresForInteger', (integerSphere) => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getAllSpheresForInteger(integerSphere);
  });

  registrationApi.registerPublicFunction(moduleId, 'getCurrentPlayerId', () => {
    const sphereState = getSphereStateSingleton();
    return sphereState.getCurrentPlayerId();
  });

  // Register event publishers
  registrationApi.registerEventBusPublisher('sphereState:dataLoaded');
  registrationApi.registerEventBusPublisher('sphereState:dataCleared');
  registrationApi.registerEventBusPublisher('sphereState:currentSphereChanged');
  registrationApi.registerEventBusPublisher('sphereState:allSpheresComplete');

  log('info', '[sphereState Module] Registration complete.');
}

/**
 * Initialization function for the sphereState module.
 * @param {string} mId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(mId, priorityIndex, initializationApi) {
  log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

  // Store the event bus reference
  moduleEventBus = initializationApi.getEventBus();

  // Create the singleton instance
  createSphereStateSingleton(moduleEventBus);

  // Subscribe to stateManager:rulesLoaded via eventBus
  if (moduleEventBus) {
    moduleEventBus.subscribe('stateManager:rulesLoaded', handleRulesLoaded, moduleId);
    log('info', `[${moduleId} Module] Subscribed to stateManager:rulesLoaded via eventBus`);

    moduleEventBus.subscribe('stateManager:snapshotUpdated', handleSnapshotUpdated, moduleId);
    log('info', `[${moduleId} Module] Subscribed to stateManager:snapshotUpdated via eventBus`);
  }

  log('info', `[${moduleId} Module] Initialization complete.`);
}

/**
 * Handle rules loaded event
 */
function handleRulesLoaded(data, propagationOptions) {
  log('info', `[${moduleId} Module] Received stateManager:rulesLoaded event`, data);

  const sphereState = getSphereStateSingleton();

  // Reset sphere state when new rules are loaded
  sphereState.reset();

  // Extract current player ID from event data or static data
  let playerId = data?.playerId;
  if (!playerId) {
    playerId = sphereState.updatePlayerIdFromStaticData();
  } else {
    sphereState.setCurrentPlayerId(playerId);
  }

  if (!playerId) {
    log('warn', 'Could not determine current player ID from event or static data');
  } else {
    log('info', `Current player ID: ${playerId}`);
  }

  // Try to get sourceName from event data or stateManager
  let sourceName = data?.source || stateManager.getCurrentRulesSource?.();

  if (!sourceName) {
    log('warn', 'Source name not available, cannot auto-load sphere log');
    return;
  }

  log('info', `Rules source: ${sourceName}`);

  // Extract game directory and preset ID from sourceName
  // Expected format: "./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json"
  const match = sourceName.match(/presets\/([^/]+)\/([^/]+)\/\2_rules\.json$/);
  if (!match) {
    log('warn', `Could not parse sourceName format: ${sourceName}`);
    return;
  }

  const gameDir = match[1];
  const presetId = match[2];

  log('info', `Extracted game: ${gameDir}, preset: ${presetId}`);

  const sphereLogPath = `./presets/${gameDir}/${presetId}/${presetId}_spheres_log.jsonl`;
  log('info', `Attempting to auto-load sphere log from: ${sphereLogPath}`);

  // Load sphere log (async, but we don't await)
  sphereState.loadSphereLog(sphereLogPath).then(success => {
    if (success) {
      log('info', 'Sphere log auto-loaded successfully');
    } else {
      log('warn', `Sphere log not found or failed to load: ${sphereLogPath}`);
    }
  });
}

/**
 * Handle snapshot updated event
 */
function handleSnapshotUpdated(data, propagationOptions) {
  const sphereState = getSphereStateSingleton();

  // Update current sphere based on new snapshot
  sphereState.updateCurrentSphere();
}