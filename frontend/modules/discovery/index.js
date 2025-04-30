import discoveryStateSingleton from './singleton.js';
import eventBus from '../../app/core/eventBus.js';

// Store initialization API if needed for event handlers
let initApi = null;
let unsubscribeHandles = [];

/**
 * Registration function for the Discovery module.
 * Registers event handlers for loop actions that trigger discovery.
 */
export function register(registrationApi) {
  console.log('[Discovery Module] Registering...');

  // Register event handlers for events published by the Loops module
  // These handlers will call the discovery methods on the singleton.
  registrationApi.registerDispatcherReceiver(
    'loop:exploreCompleted',
    handleExploreCompleted,
    null // No specific propagation details needed
  );
  registrationApi.registerDispatcherReceiver(
    'loop:moveCompleted',
    handleMoveCompleted,
    null // No specific propagation details needed
  );
  registrationApi.registerDispatcherReceiver(
    'loop:locationChecked',
    handleLocationChecked,
    null // No specific propagation details needed
  ); // Although check happens in stateManager, loop might trigger rediscovery?

  // Register handler for rules loaded
  registrationApi.registerDispatcherReceiver(
    'state:rulesLoaded',
    handleRulesLoaded,
    {
      direction: 'highestFirst',
      condition: 'unconditional',
      timing: 'immediate',
    } // Propagates
  );

  // No panel component for Discovery module.
  // No settings schema specific to Discovery module itself.
}

/**
 * Initialization function for the Discovery module.
 * Minimal setup.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Discovery Module] Initializing with priority ${priorityIndex}...`
  );
  // Store initApi if needed later, although currently not used in postInitialize
  initApi = initializationApi;

  // Clean up previous subscriptions if any
  unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  unsubscribeHandles = [];

  console.log('[Discovery Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Discovery module.
 * Initializes the singleton and subscribes to events.
 */
export function postInitialize(initializationApi) {
  console.log('[Discovery Module] Post-initializing...');

  // Initialize the DiscoveryState singleton (reads initial stateManager data)
  // Ensure stateManager has loaded its data first.
  // console.log('[Discovery Module] Initializing DiscoveryState singleton...');
  // REMOVED: Initialization call - Moved to handleRulesLoaded
  // try {
  //   discoveryStateSingleton.initialize();
  //   console.log('[Discovery Module] DiscoveryState singleton initialized.');
  // } catch (error) {
  //   console.error(
  //     '[Discovery Module] Error initializing DiscoveryState singleton:',
  //     error
  //   );
  //   // Decide how to handle this - maybe prevent loop mode?
  // }

  // Use global eventBus or get from API
  const currentEventBus = eventBus || initializationApi.getEventBus();

  if (currentEventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Discovery Module] Subscribing to ${eventName}`);
      const unsubscribe = currentEventBus.subscribe(eventName, handler);
      unsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to loop reset events
    subscribe('loop:reset', () => {
      console.log('[Discovery Module] Clearing discovery on loop:reset.');
      discoveryStateSingleton.clearDiscovery();
      // Re-initialize base state, potentially reloading from stateManager if needed
      discoveryStateSingleton.initialize();
    });
  } else {
    console.error(
      '[Discovery Module] EventBus not available for post-initialization subscriptions.'
    );
  }

  console.log('[Discovery Module] Post-initialization complete.');
}

// --- Event Handlers --- //

function handleExploreCompleted(eventData) {
  // eventData should contain { regionName, discoveredLocations, discoveredExits }
  console.log('[Discovery Module] Handling loop:exploreCompleted', eventData);
  if (!eventData) return;

  if (eventData.regionName) {
    discoveryStateSingleton.discoverRegion(eventData.regionName);
  }
  if (
    eventData.discoveredLocations &&
    Array.isArray(eventData.discoveredLocations)
  ) {
    eventData.discoveredLocations.forEach((locName) =>
      discoveryStateSingleton.discoverLocation(locName)
    );
  }
  if (eventData.discoveredExits && Array.isArray(eventData.discoveredExits)) {
    // Assuming discoveredExits is an array of { regionName, exitName } pairs, though the source event might need adjustment
    // For now, let's assume it's just exit names for the explored region
    if (eventData.regionName) {
      eventData.discoveredExits.forEach((exitName) =>
        discoveryStateSingleton.discoverExit(eventData.regionName, exitName)
      );
    }
  }
}

function handleMoveCompleted(eventData) {
  // eventData should contain { destinationRegion, exitName, sourceRegion }
  console.log('[Discovery Module] Handling loop:moveCompleted', eventData);
  if (eventData?.destinationRegion) {
    // Discover the region the player moved *to*
    discoveryStateSingleton.discoverRegion(eventData.destinationRegion);
    // Discover the exit used to get there (from the source region)
    if (eventData.sourceRegion && eventData.exitName) {
      discoveryStateSingleton.discoverExit(
        eventData.sourceRegion,
        eventData.exitName
      );
    }
  }
}

function handleLocationChecked(eventData) {
  // eventData should contain { locationName, regionName }
  console.log('[Discovery Module] Handling loop:locationChecked', eventData);
  // When a location is checked in loop mode, ensure it's marked as discovered.
  if (eventData?.locationName) {
    discoveryStateSingleton.discoverLocation(eventData.locationName);
    // Also ensure the region is discovered
    if (eventData.regionName) {
      discoveryStateSingleton.discoverRegion(eventData.regionName);
    }
  }
}

// Handler for rules loaded event - Primary Initialization Point for Discovery
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Discovery Module] Received state:rulesLoaded');

  // Initialize or re-initialize based on the loaded rules
  console.log(
    '[Discovery Module] Initializing discoverables from state:rulesLoaded handler...'
  );
  try {
    discoveryStateSingleton.initialize(eventData); // Pass event data if needed
    // Optionally: Use eventData.jsonData or eventData.selectedPlayerId
  } catch (error) {
    console.error(
      '[Discovery Module] Error initializing DiscoveryState from rulesLoaded:',
      error
    );
  }

  // Propagate the event to the next module in the chain
  const dispatcher = initApi?.getDispatcher(); // Corrected variable name from moduleInitApi
  if (dispatcher) {
    const direction = propagationOptions.propagationDirection || 'highestFirst'; // Use incoming direction or default
    dispatcher.publishToNextModule(
      'discovery',
      'state:rulesLoaded',
      eventData,
      {
        direction: direction,
      }
    );
  } else {
    console.error(
      '[Discovery Module] Cannot propagate state:rulesLoaded: Dispatcher not available (initApi missing?).'
    );
  }
}

// Export the singleton if direct access is needed (less preferred)
export { discoveryStateSingleton };

// --- Module Info ---
export const moduleInfo = {
  name: 'discovery', // No panel title, use ID
  description: 'Loop mode discovery state.',
};
