// frontend/modules/spoilerChecklist/index.js

import { SpoilerChecklistUI } from './spoilerChecklistUI.js';
import { CrossPlayerItemSync } from './crossPlayerItemSync.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('spoilerChecklistModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[spoilerChecklistModule] ${message}`, ...data);
  }
}

// --- Module Scope Variables ---
let _moduleEventBus = null;
const crossPlayerItemSync = new CrossPlayerItemSync();

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'spoilerChecklist'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'spoilerChecklist'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'spoilerChecklist'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export function getCrossPlayerItemSync() {
  return crossPlayerItemSync;
}

// --- Module Info ---
export const moduleInfo = {
  name: 'spoilerChecklist',
  title: 'Spoiler Checklist',
  componentType: 'spoilerChecklistPanel',
  icon: '📋',
  column: 2, // Middle column
  description: 'Displays sphere log data as an interactive checklist.',
};

/**
 * Registration function for the spoilerChecklist module.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[spoilerChecklist Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent('spoilerChecklistPanel', SpoilerChecklistUI);

  // Declare that this module sends 'user:locationCheck' via the dispatcher
  // (We use the locations module's dispatcher, so we don't need to register as sender)

  // Register checklist-specific public functions.
  // Sphere-inventory computation (computeCrossPlayerItems, grantItemsUpToSphere, etc.)
  // is registered by the sphereState module.
  registrationApi.registerPublicFunction(moduleInfo.name, 'getCrossPlayerItemSync', () => crossPlayerItemSync);
  registrationApi.registerPublicFunction(moduleInfo.name, 'syncReceivedItems',
    () => crossPlayerItemSync.sync());

  // Register event publisher for sync completion
  registrationApi.registerEventBusPublisher('spoilerChecklist:itemsSynced');

  log('info', '[spoilerChecklist Module] Registration complete.');
}

/**
 * Initialization function for the spoilerChecklist module.
 * @param {string} moduleId - The unique ID for this module.
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[${moduleId} Module] Initializing with priority ${priorityIndex}...`);

  _moduleEventBus = initializationApi.getEventBus();

  log('info', `[${moduleId} Module] Initialization complete.`);
}