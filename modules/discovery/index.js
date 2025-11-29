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

  // Register events that discovery publishes
  registrationApi.registerEventBusPublisher('discovery:changed');
  registrationApi.registerEventBusPublisher('discovery:locationDiscovered');
  registrationApi.registerEventBusPublisher('discovery:regionDiscovered');

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
    // Note: We don't call initialize() here because static data isn't available yet.
    // Discovery will be initialized when stateManager:rulesLoaded is published.
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
    }, 'discovery');
    _unsubscribeHandles.push(unsubscribe);

    // Subscribe to stateManager:rulesLoaded to reinitialize when rules change
    log('info', '[Discovery Module] Subscribing to stateManager:rulesLoaded');
    const rulesLoadedUnsubscribe = _moduleEventBus.subscribe(
      'stateManager:rulesLoaded',
      handleRulesLoaded,
      'discovery'
    );
    _unsubscribeHandles.push(rulesLoadedUnsubscribe);
  } else {
    log('error',
      '[Discovery Module] EventBus not available for subscriptions.'
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

// Handler for stateManager:rulesLoaded event - Primary Initialization Point for Discovery
function handleRulesLoaded(eventData) {
  log('info', '[Discovery Module] Received stateManager:rulesLoaded via eventBus.');

  if (!discoveryStateSingleton) {
    // <<< Use singleton
    log('error',
      '[Discovery Module] Cannot initialize: DiscoveryState singleton missing.'
    );
    return; // Cannot proceed
  }

  // Check if dependencies have been injected yet
  if (!discoveryStateSingleton.stateManager || !discoveryStateSingleton.eventBus) {
    log('warn',
      '[Discovery Module] Dependencies not yet injected, skipping initialization. Will initialize when module initialize() runs.'
    );
    return;
  }

  // Initialize or re-initialize based on the loaded rules
  log('info',
    '[Discovery Module] Initializing discoverables from stateManager:rulesLoaded handler...'
  );
  try {
    discoveryStateSingleton.initialize(); // <<< Use singleton
  } catch (error) {
    log('error',
      '[Discovery Module] Error initializing DiscoveryState from rulesLoaded:',
      error
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
