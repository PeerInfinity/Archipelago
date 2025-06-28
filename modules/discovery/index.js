import { DiscoveryState } from './state.js'; // Import the class
import discoveryStateSingleton from './singleton.js'; // <<< IMPORT SINGLETON
// REMOVED: import eventBus from '../../app/core/eventBus.js';

// Import singletons needed for injection
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('discoveryModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[discoveryModule] ${message}`, ...data);
  }
}

// import stateManagerSingleton from '../stateManager/stateManagerSingleton.js'; // OLD

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
  log('info', '[Discovery Module] Registering...');

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
  log('info', 
    `[Discovery Module] Initializing with priority ${priorityIndex}...`
  );

  // Store APIs
  _moduleEventBus = initializationApi.getEventBus();
  _moduleDispatcher = initializationApi.getDispatcher(); // Store the whole API object

  // REMOVED: Create DiscoveryState instance
  // log('info', '[Discovery Module] Creating DiscoveryState instance...');
  // _discoveryStateInstance = new DiscoveryState();

  // Inject dependencies into the SINGLETON instance
  if (discoveryStateSingleton && _moduleEventBus && stateManager) {
    discoveryStateSingleton.setDependencies({
      eventBus: _moduleEventBus,
      stateManager: stateManager,
    });
    log('info', 
      '[Discovery Module] Dependencies injected into DiscoveryState Singleton.'
    );
  } else {
    log('error', 
      '[Discovery Module] Failed to inject dependencies into DiscoveryState Singleton: Missing instance or APIs.'
    );
  }

  // Clean up previous subscriptions
  _unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  _unsubscribeHandles = [];

  // Subscribe to loop reset event via INJECTED event bus
  if (_moduleEventBus) {
    log('info', '[Discovery Module] Subscribing to loop:reset');
    const unsubscribe = _moduleEventBus.subscribe('loop:reset', () => {
      log('info', '[Discovery Module] Clearing discovery on loop:reset.');
      if (discoveryStateSingleton) {
        // <<< Use singleton
        discoveryStateSingleton.clearDiscovery();
        // initialize() is now called by handleRulesLoaded
      } else {
        log('error', 
          '[Discovery Module] Cannot clear discovery: Singleton not available.'
        );
      }
    });
    _unsubscribeHandles.push(unsubscribe);
  } else {
    log('error', 
      '[Discovery Module] EventBus not available for loop:reset subscription.'
    );
  }

  log('info', '[Discovery Module] Initialization complete.');

  // Return cleanup function
  return () => {
    log('info', '[Discovery Module] Cleaning up... Unsubscribing & disposing.');
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
  log('info', '[Discovery Module] Received state:rulesLoaded via dispatcher.');

  if (!discoveryStateSingleton) {
    // <<< Use singleton
    log('error', 
      '[Discovery Module] Cannot initialize: DiscoveryState singleton missing.'
    );
    return; // Cannot proceed
  }

  // Initialize or re-initialize based on the loaded rules
  log('info', 
    '[Discovery Module] Initializing discoverables from state:rulesLoaded handler...'
  );
  try {
    discoveryStateSingleton.initialize(); // <<< Use singleton
  } catch (error) {
    log('error', 
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
    log('error', 
      '[Discovery Module] Cannot propagate state:rulesLoaded: Dispatcher not available.'
    );
  }
}

function handleExploreCompleted(eventData) {
  log('info', '[Discovery Module] Handling loop:exploreCompleted', eventData);
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
  log('info', '[Discovery Module] Handling loop:moveCompleted', eventData);
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
  log('info', '[Discovery Module] Handling loop:locationChecked', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData?.locationName) {
    discoveryStateSingleton.discoverLocation(eventData.locationName); // <<< Use singleton
    if (eventData.regionName) {
      discoveryStateSingleton.discoverRegion(eventData.regionName); // <<< Use singleton
    }
  }
}

// REMOVED: export { discoveryStateSingleton };
