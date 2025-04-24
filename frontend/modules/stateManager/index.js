import { StateManager } from './stateManager.js';
import stateManagerSingleton from './stateManagerSingleton.js';

/**
 * Registration function for the StateManager module.
 * Currently, it does not register anything specific like panels or complex event handlers.
 * It could potentially register settings schema snippets if StateManager had configurable options.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  console.log('[StateManager Module] Registering...');
  // Example: Register settings schema if StateManager had options
  // registrationApi.registerSettingsSchema({
  //     type: 'object',
  //     properties: {
  //         debugLogDepth: { type: 'integer', default: 1 }
  //     }
  // });
  // No primary event handlers or panels registered here.
}

/**
 * Initialization function for the StateManager module.
 * The core singleton instance is created outside the lifecycle, so this function
 * might perform additional setup if needed, like subscribing to specific bus events
 * or accessing initial settings.
 * @param {string} moduleId - The unique ID for this module ('stateManager').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[StateManager Module] Initializing with priority ${priorityIndex}...`
  );
  // The singleton instance handles its own constructor logic.
  // We could use initializationApi here if the StateManager needed
  // access to settings or the dispatcher during its setup.
  // Example: const settings = await initializationApi.getSettings();
}

// Export the class if direct instantiation is ever needed elsewhere (unlikely for a singleton module)
export { StateManager };

// Export the singleton instance as the primary export for this module
// Consumers should import { stateManager } from '.../stateManager/index.js'
export { stateManagerSingleton as stateManager };
