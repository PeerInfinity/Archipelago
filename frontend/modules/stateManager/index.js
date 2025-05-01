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

  // Register events published by this module on the EventBus
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'state:rulesLoaded'
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'state:inventoryChanged'
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'state:locationChecked'
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'state:exitChecked'
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'state:regionViewed'
  );
  registrationApi.registerEventBusPublisher('stateManager', 'rules:loadError');
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:rulesLoaded' // Processed rules event (Published by internal class)
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:rawJsonDataLoaded' // Raw rules event (Published by this module)
  );

  // Register events this module subscribes to on the EventBus
  registrationApi.registerEventBusSubscriberIntent('init:postInitComplete');

  // Note: StateManager currently uses the DISPATCHER to publish state:rulesLoaded
  // as a test case. We register the intent to send it, but the actual handler
  // registration (registerDispatcherReceiver) would happen in the module(s)
  // intended to *receive* this prioritized event.
  // If StateManager were also intended to *receive* dispatcher events, we'd use:
  // registrationApi.registerDispatcherReceiver('stateManager', 'someEventName', someHandler);
  // ~~If StateManager *sends* dispatcher events (like state:rulesLoaded currently):~~
  // registrationApi.registerDispatcherSender(
  //   'stateManager',
  //   'state:rulesLoaded',
  //   'highestFirst', // Default direction
  //   'first' // Default target
  // );

  console.log('[StateManager Module] Registration complete.');
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

        // <<< ADDED: Inject EventBus >>>
        const eventBusInstance = initializationApi.getEventBus();
        if (eventBusInstance) {
          realInstance.setEventBus(eventBusInstance);
        } else {
          console.error(
            '[StateManager Module] Failed to get EventBus instance from API. Event publishing may fail.'
          );
        }
        // <<< END ADDED >>>

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
  // Ensure we have the full initApi stored from the initialize step
  const eventBus = initApi?.getEventBus();

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

      try {
        // Load and process rules, which populates stateManagerSingleton.instance
        // and internally publishes the 'stateManager:rulesLoaded' event.
        const rulesLoadResult = await loadAndProcessDefaultRules();

        // Check if loading succeeded and we have raw JSON data
        if (rulesLoadResult && rulesLoadResult.jsonData) {
          // Publish the RAW JSON data for modules like the editor
          if (eventBus) {
            eventBus.publish('stateManager:rawJsonDataLoaded', {
              source: 'default_rules.json',
              rawJsonData: rulesLoadResult.jsonData, // Pass the original raw JSON
            });
            console.log(
              '[StateManager Module] Published stateManager:rawJsonDataLoaded via eventBus.'
            );
          } else {
            console.warn(
              '[StateManager Module] EventBus not available, cannot publish rawJsonDataLoaded.'
            );
          }
        } else if (rulesLoadResult) {
          console.warn(
            '[StateManager Module] Rules loaded, but no jsonData found in result to publish for rawJsonDataLoaded.'
          );
        }
        // Note: The processed 'stateManager:rulesLoaded' event is published internally by StateManager.js
      } catch (error) {
        // Errors during fetch/processing are caught and logged within loadAndProcessDefaultRules
        // We just need to prevent crashing the postInitialize chain
        console.error(
          `[StateManager Module] Error during rule loading triggered by init:postInitComplete: ${error.message}`
        );
        // The rules:loadError event should have been published by loadAndProcessDefaultRules
      }
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
// export { StateManager };

// Export the singleton - both the direct singleton object and a "stateManager"
// convenience export for backward compatibility
export { stateManagerSingleton };

// Create a convenience constant that accesses the instance
// This still uses the getter, so it will return the stub until initialized
const stateManager = stateManagerSingleton.instance;
export { stateManager };

// --- Moved from client/app.js: Function to load default rules ---
// Now returns { jsonData, selectedPlayerId } on success, or throws error on failure.
async function loadAndProcessDefaultRules() {
  console.log('[StateManager Module] Attempting to load default_rules.json...');
  let jsonData = null;
  let selectedPlayerId = null;

  try {
    const response = await fetch('./default_rules.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    jsonData = await response.json();
    console.log(
      '[StateManager Module] Successfully fetched default_rules.json'
    );

    // === Player Selection Logic ===
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
        .join('\\n');
      const choice = prompt(
        `Multiple players found. Please enter the ID of the player to load:\\n${playerOptions}`
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

    // Return the processed data
    return { jsonData, selectedPlayerId };
  } catch (error) {
    console.error(
      '[StateManager Module] Failed to load or process default rules:',
      error
    );
    // Optionally publish an error event via EventBus
    const eventBus = initApi?.getEventBus(); // Access stored initApi for eventBus
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
    // Re-throw the error to signal failure to the caller (postInitialize)
    throw error;
  }
}
