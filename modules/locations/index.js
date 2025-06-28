// UI Class for this module
import { LocationUI } from './locationUI.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('locationsModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[locationsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'Locations',
  description: 'Locations display panel.',
};

let moduleDispatcher = null;
let moduleId = 'locations'; // Store module ID

export function getDispatcher() {
  // if (!moduleDispatcher) {
  //   log('warn',
  //     '[Locations Module] Dispatcher accessed before initialization.'
  //   );
  // }
  return moduleDispatcher;
}

/**
 * Registration function for the Locations module.
 * Registers the locations panel component and declares event sending.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[Locations Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('locationsPanel', LocationUI);

  // Declare that this module sends 'user:locationCheck' via the dispatcher
  registrationApi.registerDispatcherSender('user:locationCheck', {
    initialTarget: 'bottom',
  });

  // Register settings schema if needed
  // No settings schema specific to Locations registration.

  // Register EventBus publisher intentions (used by LocationUI)
  registrationApi.registerEventBusPublisher(
    moduleId,
    'stateManager:locationCollectionChanged'
  );
  registrationApi.registerEventBusPublisher(moduleId, 'ui:activatePanel');
  registrationApi.registerEventBusPublisher(moduleId, 'ui:navigateToDungeon');
}

export function initialize(mId, priorityIndex, initializationApi) {
  moduleId = mId;
  log(
    'info',
    `[${moduleId} Module] Initializing with priority ${priorityIndex}...`
  );
  moduleDispatcher = initializationApi.getDispatcher();
  log('info', `[${moduleId} Module] Dispatcher stored.`);

  // No specific async operations for initialization, so return a simple cleanup
  return () => {
    log('info', `[${moduleId} Module] Cleaning up...`);
    moduleDispatcher = null;
  };
}
