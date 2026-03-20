// frontend/modules/spoilerTest/index.js
import { TestSpoilerUI } from './testSpoilerUI.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('spoilerTestModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[spoilerTestModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'spoilerTest',
  title: 'Spoiler Test',
  componentType: 'spoilerTestPanel',
  icon: '🔍',
  column: 2, // Middle column,
  description: 'Provides UI for loading and running test Spoilers.',
};

// --- Module Scope Variables ---
// let testSpoilerUIInstance = null;
let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'spoilerTest'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'spoilerTest'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'spoilerTest'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

/**
 * Registration function for the TestSpoilers module.
 * Registers the panel component and declares event intentions.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[SpoilerTest Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent('spoilerTestPanel', TestSpoilerUI);

  // Declare events published by TestSpoilerUI
  registrationApi.registerEventBusPublisher('editor:loadJsonData');
  registrationApi.registerEventBusPublisher('files:jsonLoaded');
  registrationApi.registerEventBusPublisher('ui:notification');

  // Declare events subscribed to by TestSpoilerUI
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'ui:fileViewChanged'
  );

  // ADDED: Declare that this module sends 'user:locationCheck' via the dispatcher
  registrationApi.registerDispatcherSender('user:locationCheck', 'bottom', 'first');

  log('info', '[SpoilerTest Module] Registration complete.');
}

/**
 * Initialization function for the SpoilerTest module.
 * Currently minimal.
 * @param {string} moduleId - The unique ID for this module ('spoilerTest').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log(
    'info',
    `[SpoilerTest Module] Initializing with priority ${priorityIndex}...`
  );

  _moduleEventBus = initializationApi.getEventBus();

  log('info', '[SpoilerTest Module] Initialization complete.');

  return null; // No cleanup needed
}

// No postInitialize needed
