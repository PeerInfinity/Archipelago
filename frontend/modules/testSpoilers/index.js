// frontend/modules/testSpoilers/index.js
import { TestSpoilerUI } from './testSpoilerUI.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testSpoilersModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testSpoilersModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'testSpoilers',
  title: 'Test Spoilers',
  componentType: 'testSpoilersPanel',
  icon: '🔍',
  column: 2, // Middle column,
  description: 'Provides UI for loading and running test Spoilers.',
};

// --- Module Scope Variables ---
// let testSpoilerUIInstance = null;
// let moduleEventBus = null;

/**
 * Registration function for the TestSpoilers module.
 * Registers the panel component and declares event intentions.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[TestSpoilers Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent('testSpoilersPanel', TestSpoilerUI);

  // Declare events published by TestSpoilerUI
  registrationApi.registerEventBusPublisher('editor:loadJsonData');
  registrationApi.registerEventBusPublisher('files:jsonLoaded');
  registrationApi.registerEventBusPublisher('ui:notification');

  // Declare events subscribed to by TestSpoilerUI
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'ui:fileViewChanged'
  );

  log('info', '[TestSpoilers Module] Registration complete.');
}

/**
 * Initialization function for the TestSpoilers module.
 * Currently minimal.
 * @param {string} moduleId - The unique ID for this module ('testSpoilers').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log(
    'info',
    `[TestSpoilers Module] Initializing with priority ${priorityIndex}...`
  );

  // moduleEventBus = initializationApi.getEventBus();
  // No dependency injection needed via this function for now.

  log('info', '[TestSpoilers Module] Initialization complete.');

  return null; // No cleanup needed
}

// No postInitialize needed
