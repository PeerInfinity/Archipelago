import EventsUI from './eventsUI.js';

let moduleInitApi = null; // Store the Initialization API

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
  console.log('[Events Module] Registering...');
  // Register the panel component class constructor
  registrationApi.registerPanelComponent('eventsPanel', EventsUI);
}

/**
 * Initialization function for the Events module.
 * Stores the init API for later use (e.g., accessing the registry).
 * @param {string} moduleId - The unique ID of this module ('events').
 * @param {number} index - The load priority index.
 * @param {object} initApi - API provided by the initialization script.
 */
export async function initialize(moduleId, index, initApi) {
  console.log(
    `[Events Module] Initializing (ID: ${moduleId}, Priority: ${index})...`
  );
  moduleInitApi = initApi;
  // We might not need to do anything else immediately,
  // the UI component will fetch data when it's created/shown.
}

// Export the initApi for the UI component to use (or pass it during construction)
export function getInitApi() {
  if (!moduleInitApi) {
    console.warn(
      '[Events Module] Attempted to get initApi before initialization.'
    );
  }
  return moduleInitApi;
}

// Optional: Post-initialization logic if needed
// export async function postInitialize(initApi) {
//   console.log('[Events Module] Post-initializing...');
// }

// Optional: Uninitialization logic if the module can be disabled/unloaded
// export async function uninitialize() {
//   console.log('[Events Module] Uninitializing...');
//   moduleInitApi = null;
// }
