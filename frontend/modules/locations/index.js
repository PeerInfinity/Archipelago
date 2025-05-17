// UI Class for this module
import { LocationUI } from './locationUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Locations',
  description: 'Locations display panel.',
};

let moduleDispatcher = null;

export function getDispatcher() {
  // if (!moduleDispatcher) {
  //   console.warn(
  //     '[Locations Module] Dispatcher accessed before initialization.'
  //   );
  // }
  return moduleDispatcher;
}

/**
 * Registration function for the Locations module.
 * Registers the locations panel component.
 */
export function register(registrationApi) {
  console.log('[Locations Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('locationsPanel', LocationUI);

  // Register settings schema if needed
  // No settings schema specific to Locations registration.
}

export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Locations Module] Initializing with priority ${priorityIndex}...`
  );
  moduleDispatcher = initializationApi.getDispatcher();
  console.log('[Locations Module] Dispatcher stored.');

  // No specific async operations for initialization, so return a simple cleanup
  return () => {
    console.log('[Locations Module] Cleaning up...');
    moduleDispatcher = null;
  };
}
