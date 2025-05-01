import { DiscoveryState } from './state.js'; // Import the class
import discoveryStateSingleton from './singleton.js'; // <<< IMPORT SINGLETON
// REMOVED: import eventBus from '../../app/core/eventBus.js';

// Import singletons needed for injection
import { stateManagerSingleton } from '../stateManager/index.js';

// --- Module Scope Variables ---
// REMOVED: let _discoveryStateInstance = null;
let _moduleEventBus = null;
let _moduleDispatcher = null;
let _unsubscribeHandles = []; // Renamed for clarity

// --- Module Info ---
export const moduleInfo = {
  name: 'discovery', // Use ID for consistency
  description: 'Manages discovery state in loop mode.',
};

/**
 * Registration function for the Discovery module.
 * Registers dispatcher receivers for loop actions that trigger discovery.
 */
export function register(registrationApi) {
  console.log('[Discovery Module] Registering...');

  // Register dispatcher receivers for loop events
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'loop:exploreCompleted',
    handleExploreCompleted,
    null
  );
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'loop:moveCompleted',
    handleMoveCompleted,
    null
  );
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'loop:locationChecked',
    handleLocationChecked,
    null
  );
  // ADDED: Register handler for state:rulesLoaded
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'state:rulesLoaded',
    handleRulesLoaded,
    null // Or define priority if needed
  );
}

/**
 * Initialization function for the Discovery module.
 * Creates instance, injects dependencies, subscribes to reset event.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Discovery Module] Initializing with priority ${priorityIndex}...`
  );

  // Store APIs
  _moduleEventBus = initializationApi.getEventBus();
  _moduleDispatcher = initializationApi.getDispatcher(); // Store the whole API object

  // REMOVED: Create DiscoveryState instance
  // console.log('[Discovery Module] Creating DiscoveryState instance...');
  // _discoveryStateInstance = new DiscoveryState();

  // Inject dependencies into the SINGLETON instance
  if (discoveryStateSingleton && _moduleEventBus && stateManagerSingleton) {
    discoveryStateSingleton.setDependencies({
      eventBus: _moduleEventBus,
      stateManager: stateManagerSingleton,
    });
    console.log(
      '[Discovery Module] Dependencies injected into DiscoveryState Singleton.'
    );
  } else {
    console.error(
      '[Discovery Module] Failed to inject dependencies into DiscoveryState Singleton: Missing instance or APIs.'
    );
  }

  // Clean up previous subscriptions
  _unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  _unsubscribeHandles = [];

  // Subscribe to loop reset event via INJECTED event bus
  if (_moduleEventBus) {
    console.log('[Discovery Module] Subscribing to loop:reset');
    const unsubscribe = _moduleEventBus.subscribe('loop:reset', () => {
      console.log('[Discovery Module] Clearing discovery on loop:reset.');
      if (discoveryStateSingleton) {
        // <<< Use singleton
        discoveryStateSingleton.clearDiscovery();
        // initialize() is now called by handleRulesLoaded
      } else {
        console.error(
          '[Discovery Module] Cannot clear discovery: Singleton not available.'
        );
      }
    });
    _unsubscribeHandles.push(unsubscribe);
  } else {
    console.error(
      '[Discovery Module] EventBus not available for loop:reset subscription.'
    );
  }

  console.log('[Discovery Module] Initialization complete.');

  // Return cleanup function
  return () => {
    console.log('[Discovery Module] Cleaning up... Unsubscribing & disposing.');
    _unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    _unsubscribeHandles = [];

    if (
      discoveryStateSingleton && // <<< Use singleton
      typeof discoveryStateSingleton.dispose === 'function'
    ) {
      discoveryStateSingleton.dispose();
    }

    // Clear references
    // REMOVED: _discoveryStateInstance = null;
    _moduleEventBus = null;
    _moduleDispatcher = null;
  };
}

// REMOVED: postInitialize function

// --- Event Handlers (Updated to use _discoveryStateInstance and _moduleDispatcher) --- //

// Handler for state:rulesLoaded event - Primary Initialization Point for Discovery
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Discovery Module] Received state:rulesLoaded via dispatcher.');

  if (!discoveryStateSingleton) {
    // <<< Use singleton
    console.error(
      '[Discovery Module] Cannot initialize: DiscoveryState singleton missing.'
    );
    return; // Cannot proceed
  }

  // Initialize or re-initialize based on the loaded rules
  console.log(
    '[Discovery Module] Initializing discoverables from state:rulesLoaded handler...'
  );
  try {
    discoveryStateSingleton.initialize(); // <<< Use singleton
  } catch (error) {
    console.error(
      '[Discovery Module] Error initializing DiscoveryState from rulesLoaded:',
      error
    );
  }

  // Propagate the event to the next module in the chain using stored dispatcher
  if (
    _moduleDispatcher &&
    typeof _moduleDispatcher.publishToNextModule === 'function'
  ) {
    const direction = propagationOptions?.direction || 'up'; // Use incoming direction or default
    _moduleDispatcher.publishToNextModule(
      moduleInfo.name,
      'state:rulesLoaded',
      eventData,
      { direction: direction }
    );
  } else {
    console.error(
      '[Discovery Module] Cannot propagate state:rulesLoaded: Dispatcher not available.'
    );
  }
}

function handleExploreCompleted(eventData) {
  console.log('[Discovery Module] Handling loop:exploreCompleted', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData.regionName) {
    discoveryStateSingleton.discoverRegion(eventData.regionName); // <<< Use singleton
  }
  if (
    eventData.discoveredLocations &&
    Array.isArray(eventData.discoveredLocations)
  ) {
    eventData.discoveredLocations.forEach(
      (locName) => discoveryStateSingleton.discoverLocation(locName) // <<< Use singleton
    );
  }
  if (eventData.discoveredExits && Array.isArray(eventData.discoveredExits)) {
    if (eventData.regionName) {
      eventData.discoveredExits.forEach(
        (exitName) =>
          discoveryStateSingleton.discoverExit(eventData.regionName, exitName) // <<< Use singleton
      );
    }
  }
}

function handleMoveCompleted(eventData) {
  console.log('[Discovery Module] Handling loop:moveCompleted', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData?.destinationRegion) {
    discoveryStateSingleton.discoverRegion(eventData.destinationRegion); // <<< Use singleton
    if (eventData.sourceRegion && eventData.exitName) {
      discoveryStateSingleton.discoverExit(
        // <<< Use singleton
        eventData.sourceRegion,
        eventData.exitName
      );
    }
  }
}

function handleLocationChecked(eventData) {
  console.log('[Discovery Module] Handling loop:locationChecked', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData?.locationName) {
    discoveryStateSingleton.discoverLocation(eventData.locationName); // <<< Use singleton
    if (eventData.regionName) {
      discoveryStateSingleton.discoverRegion(eventData.regionName); // <<< Use singleton
    }
  }
}

// REMOVED: export { discoveryStateSingleton };
