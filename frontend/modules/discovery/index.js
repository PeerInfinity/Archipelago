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

  // No panel component for Discovery module.
  // No settings schema specific to Discovery module itself.
}

/**
 * Initialization function for the Discovery module.
 * Initializes the singleton and potentially subscribes to other events.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Discovery Module] Initializing with priority ${priorityIndex}...`
  );
  initApi = initializationApi;

  // Initialize the DiscoveryState singleton (reads initial stateManager data)
  discoveryStateSingleton.initialize();

  // Clean up previous subscriptions
  unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  unsubscribeHandles = [];

  const subscribe = (eventName, handler) => {
    const unsubscribe = eventBus.subscribe(eventName, handler);
    unsubscribeHandles.push(unsubscribe);
  };

  // Subscribe to game data loading to re-initialize discovery
  subscribe('stateManager:jsonDataLoaded', () => {
    console.log('[Discovery Module] Re-initializing on jsonDataLoaded.');
    discoveryStateSingleton.clearDiscovery(); // Clear and re-init based on new data
    discoveryStateSingleton.initialize();
  });

  // Subscribe to loop reset events
  subscribe('loop:reset', () => {
    console.log('[Discovery Module] Clearing discovery on loop:reset.');
    discoveryStateSingleton.clearDiscovery();
    discoveryStateSingleton.initialize(); // Re-initialize base state
  });

  console.log('[Discovery Module] Initialization complete.');
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

// Export the singleton if direct access is needed (less preferred)
export { discoveryStateSingleton };
