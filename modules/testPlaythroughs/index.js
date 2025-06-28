// frontend/modules/testPlaythroughs/index.js
import { TestPlaythroughUI } from './testPlaythroughUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testPlaythroughsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testPlaythroughsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'testPlaythroughs',
  title: 'Test Playthroughs', // Title for the panel
  description: 'Provides UI for loading and running test playthroughs.',
};

// --- Module Scope Variables ---
// let testPlaythroughUIInstance = null;
// let moduleEventBus = null;

/**
 * Registration function for the TestPlaythroughs module.
 * Registers the panel component and declares event intentions.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[TestPlaythroughs Module] Registering...');

  // Register the panel component
  registrationApi.registerPanelComponent(
    'testPlaythroughsPanel',
    TestPlaythroughUI
  );

  // Declare events published by TestPlaythroughUI
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'editor:loadJsonData'
  );
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'files:jsonLoaded'
  );
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'ui:notification');

  // Declare events subscribed to by TestPlaythroughUI
  registrationApi.registerEventBusSubscriberIntent(
    moduleInfo.name,
    'ui:fileViewChanged'
  );

  log('info', '[TestPlaythroughs Module] Registration complete.');
}

/**
 * Initialization function for the TestPlaythroughs module.
 * Currently minimal.
 * @param {string} moduleId - The unique ID for this module ('testPlaythroughs').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[TestPlaythroughs Module] Initializing with priority ${priorityIndex}...`
  );

  // moduleEventBus = initializationApi.getEventBus();
  // No dependency injection needed via this function for now.

  log('info', '[TestPlaythroughs Module] Initialization complete.');

  return null; // No cleanup needed
}

// No postInitialize needed
