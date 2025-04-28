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
  registrationApi.registerEventHandler(
    'loop:exploreCompleted',
    handleExploreCompleted
  );
  registrationApi.registerEventHandler(
    'loop:moveCompleted',
    handleMoveCompleted
  );
  registrationApi.registerEventHandler(
    'loop:locationChecked',
    handleLocationChecked
  ); // Although check happens in stateManager, loop might trigger rediscovery?

  // Register handler for rules loaded
  registrationApi.registerEventHandler('state:rulesLoaded', handleRulesLoaded);

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

// Handler for rules loaded event
function handleRulesLoaded(eventData) {
  console.log('[Discovery Module] Received state:rulesLoaded');
  // Re-initialize discovery state based on the loaded rules
  // Check if the singleton exists before trying to clear
  if (discoveryStateSingleton) {
    discoveryStateSingleton.clearDiscovery();
    // ADDED: Initialize discoverables now that rules are loaded
    try {
      console.log(
        '[Discovery Module] Initializing discoverables from state:rulesLoaded handler...'
      );
      discoveryStateSingleton.initialize();
    } catch (error) {
      console.error(
        '[Discovery Module] Error initializing discoverables after rules loaded:',
        error
      );
    }
  } else {
    console.warn(
      '[Discovery Module] Discovery singleton not available for state:rulesLoaded handler.'
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
