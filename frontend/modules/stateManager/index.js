import { StateManager } from './stateManager.js';
import stateManagerSingleton from './stateManagerSingleton.js';

// Keep track of when initialization is complete
let isInitialized = false;
let initializationPromise = null;

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
 * Creates a real StateManager instance and ensures it's fully loaded
 * before other modules that depend on it are initialized.
 * @param {string} moduleId - The unique ID for this module ('stateManager').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[StateManager Module] Initializing with priority ${priorityIndex}...`
  );

  // Fully initialize the real StateManager instance if not already done
  if (!isInitialized) {
    // Create a proper StateManager instance
    if (!initializationPromise) {
      initializationPromise = new Promise((resolve) => {
        console.log(
          '[StateManager Module] Creating real StateManager instance...'
        );
        const realInstance = new StateManager();

        // Replace the temporary stub with the real instance
        stateManagerSingleton.setInstance(realInstance);

        isInitialized = true;
        console.log('[StateManager Module] Real StateManager instance created');
        resolve(realInstance);
      });
    }

    // Wait for initialization to complete
    await initializationPromise;
  }

  console.log('[StateManager Module] Initialization complete.');
}

// Export the class if direct instantiation is ever needed elsewhere (unlikely for a singleton module)
export { StateManager };

// Export the singleton - both the direct singleton object and a "stateManager"
// convenience export for backward compatibility
export { stateManagerSingleton };

// Create a convenience constant that accesses the instance
// This still uses the getter, so it will return the stub until initialized
const stateManager = stateManagerSingleton.instance;
export { stateManager };
