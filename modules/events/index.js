import EventsUI from './eventsUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('eventsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[eventsModule] ${message}`, ...data);
  }
}

// let moduleInitApi = null; // REMOVED - Store the Initialization API

// Module metadata (optional but good practice)
export const moduleInfo = {
  name: 'Events Inspector',
  description:
    'Displays registered event publishers, subscribers, senders, and receivers.',
};

/**
 * Registration function for the Events module.
 * Registers the panel component.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[Events Module] Registering...');
  // Register the panel component class constructor
  registrationApi.registerPanelComponent('eventsPanel', EventsUI);
  // Register intent to subscribe to module state changes for UI refresh
  /* // REMOVED - Registration will happen in UI constructor
  registrationApi.registerEventBusSubscriber(
    'module:stateChanged',
    EventsUI.prototype.handleModuleStateChange // Pass the prototype method
  );
  */
}

/**
 * Initialization function for the Events module.
 * Stores the init API for later use (e.g., accessing the registry).
 * @param {string} moduleId - The unique ID of this module ('events').
 * @param {number} index - The load priority index.
 * @param {object} initApi - API provided by the initialization script.
 */
export async function initialize(moduleId, index, initApi) {
  log('info', 
    `[Events Module] Initializing (ID: ${moduleId}, Priority: ${index})...`
  );
  // moduleInitApi = initApi; // REMOVED assignment
  // We might not need to do anything else immediately,
  // the UI component will fetch data when it's created/shown.
}

// Export the initApi for the UI component to use (or pass it during construction)
/* REMOVED getInitApi function
export function getInitApi() {
  if (!moduleInitApi) {
    log('warn', 
      '[Events Module] Attempted to get initApi before initialization.'
    );
  }
  return moduleInitApi;
}
*/

// Optional: Post-initialization logic if needed
// export async function postInitialize(initApi) {
//   log('info', '[Events Module] Post-initializing...');
// }

// Optional: Uninitialization logic if the module can be disabled/unloaded
// export async function uninitialize() {
//   log('info', '[Events Module] Uninitializing...');
//   moduleInitApi = null;
// }
