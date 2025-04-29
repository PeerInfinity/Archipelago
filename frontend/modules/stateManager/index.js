import { StateManager } from './stateManager.js';
import stateManagerSingleton from './stateManagerSingleton.js';

// Keep track of when initialization is complete
let isInitialized = false;
let initializationPromise = null;
let initApi = null; // Store the full init API

// --- Module Info ---
export const moduleInfo = {
  name: 'stateManager', // No panel title, use ID
  description: 'Core game state management.',
};

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
  // Store the full API
  initApi = initializationApi;

  // Keep track of the instance creation and singleton setup
  if (!isInitialized) {
    if (!initializationPromise) {
      initializationPromise = new Promise((resolve) => {
        console.log(
          '[StateManager Module] Creating real StateManager instance...'
        );
        const realInstance = new StateManager();
        stateManagerSingleton.setInstance(realInstance);
        isInitialized = true;
        console.log('[StateManager Module] Real StateManager instance created');
        resolve(realInstance);
      });
    }
    // Wait for the instance creation promise to resolve
    await initializationPromise;
  }

  console.log(
    '[StateManager Module] Basic initialization complete (instance ready).'
  );
}

/**
 * Post-initialization function for the StateManager module.
 * Loads default rules and publishes the 'state:rulesLoaded' event after all modules
 * have had a chance to run their basic initialize function.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function postInitialize(initializationApi) {
  console.log('[StateManager Module] Post-initializing...');
  const eventBus = initApi?.getEventBus() || initializationApi.getEventBus(); // Use stored or passed API

  // Ensure the instance is definitely created before proceeding
  if (!isInitialized) {
    console.warn(
      '[StateManager Module] Post-initialize called before basic initialize completed. Waiting...'
    );
    await initializationPromise;
    if (!isInitialized) {
      console.error(
        '[StateManager Module] StateManager instance failed to initialize. Cannot proceed with post-initialization.'
      );
      return;
    }
  }

  // --- Trigger loading of default rules MOVED TO EVENT LISTENER --- //
  // console.log('[StateManager Module] Triggering load of default rules...');
  // await loadAndProcessDefaultRules(initApi?.getDispatcher()); // Need dispatcher access
  // ------------------------------------------------------------ //

  // Listen for the signal that all modules are post-initialized
  if (eventBus) {
    console.log(
      '[StateManager Module] Subscribing to init:postInitComplete on eventBus...'
    );
    eventBus.subscribe('init:postInitComplete', async () => {
      console.log(
        '[StateManager Module] Received init:postInitComplete, triggering load of default rules...'
      );
      const dispatcher = initApi?.getDispatcher(); // Get dispatcher from stored API
      if (!dispatcher) {
        console.error(
          '[StateManager Module] Cannot load rules: Dispatcher not available from stored initApi.'
        );
        return;
      }
      await loadAndProcessDefaultRules(dispatcher);
    });
  } else {
    console.error(
      '[StateManager Module] EventBus not available, cannot subscribe to init:postInitComplete.'
    );
  }

  console.log(
    '[StateManager Module] Post-initialization complete (subscribed to init:postInitComplete).' // Updated log
  );
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

// --- Moved from client/app.js: Function to load default rules ---
async function loadAndProcessDefaultRules(dispatcher) {
  // Pass eventBus if needed for publishing
  console.log('[StateManager Module] Attempting to load default_rules.json...');
  try {
    const response = await fetch('./default_rules.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const jsonData = await response.json();
    console.log(
      '[StateManager Module] Successfully fetched default_rules.json'
    );

    // === Player Selection Logic ===
    let selectedPlayerId = null;
    const playerIds = Object.keys(jsonData.player_names || {});

    if (playerIds.length === 0) {
      throw new Error('No players found in the JSON data.');
    } else if (playerIds.length === 1) {
      selectedPlayerId = playerIds[0];
      console.log(
        `[StateManager Module] Auto-selected single player ID: ${selectedPlayerId}`
      );
    } else {
      const playerOptions = playerIds
        .map((id) => `${id}: ${jsonData.player_names[id]}`)
        .join('\n');
      const choice = prompt(
        `Multiple players found. Please enter the ID of the player to load:\n${playerOptions}`
      );

      if (choice && jsonData.player_names[choice]) {
        selectedPlayerId = choice;
        console.log(
          `[StateManager Module] User selected player ID: ${selectedPlayerId}`
        );
      } else {
        throw new Error('Invalid player selection or prompt cancelled.');
      }
    }
    // === End Player Selection Logic ===

    // --- Directly process the data --- //
    console.log(
      `[StateManager Module] Processing rules for player ${selectedPlayerId}...`
    );
    const currentInstance = stateManagerSingleton.instance;
    currentInstance.clearState();
    console.log('[StateManager Module] Cleared existing state.');
    currentInstance.initializeInventory(
      [],
      jsonData.progression_mapping[selectedPlayerId],
      jsonData.items[selectedPlayerId]
    );
    console.log('[StateManager Module] Initialized inventory.');
    currentInstance.loadFromJSON(jsonData, selectedPlayerId);
    console.log('[StateManager Module] Loaded rules data from JSON.');
    // --- End processing --- //

    // Publish event via the DISPATCHER indicating rules are processed
    if (dispatcher) {
      dispatcher.publish('state:rulesLoaded', {
        source: 'default_rules.json',
        jsonData: jsonData, // Pass the raw JSON data
        selectedPlayerId: selectedPlayerId,
      });
      console.log(
        '[StateManager Module] Published state:rulesLoaded via dispatcher.'
      );
    } else {
      console.warn(
        '[StateManager Module] Dispatcher not provided, cannot publish state:rulesLoaded.'
      );
    }
  } catch (error) {
    console.error(
      '[StateManager Module] Failed to load or process default rules:',
      error
    );
    // Optionally publish an error event
    if (eventBus) {
      eventBus.publish('rules:loadError', { error: error, source: 'default' });
    }
    // Display error to the user?
    if (window.consoleManager) {
      window.consoleManager.print(
        `Error loading default rules: ${error.message}`,
        'error'
      );
    }
  }
}
