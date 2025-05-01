// REMOVED: import eventBus from '../../app/core/eventBus.js';

// REMOVED: import stateManagerSingleton from '../stateManager/stateManagerSingleton.js';

/**
 * Manages the discovery state of regions, locations, and exits within the game.
 * Tracks what the player has encountered in the loop mode.
 */
export class DiscoveryState {
  constructor() {
    // Dependencies (injected via setDependencies)
    this.stateManager = null;
    this.eventBus = null;

    // State
    this.discoveredRegions = new Set(['Menu']); // Start with Menu discovered
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map(); // regionName -> Set of exit names

    console.log('[DiscoveryState] Constructed');
  }

  /**
   * Sets the required dependencies for the DiscoveryState instance.
   * Should be called before initialize.
   * @param {object} dependencies - Object containing dependencies.
   * @param {EventBus} dependencies.eventBus - The application's event bus instance.
   * @param {StateManager} dependencies.stateManager - The application's state manager instance.
   */
  setDependencies(dependencies) {
    if (!dependencies.eventBus || !dependencies.stateManager) {
      console.error(
        '[DiscoveryState] Missing required dependencies (eventBus, stateManager).'
      );
      return;
    }
    console.log('[DiscoveryState] Setting dependencies...');
    this.eventBus = dependencies.eventBus;
    this.stateManager = dependencies.stateManager;
  }

  /**
   * Initializes the discoverable data based on the loaded game state.
   * Should be called after dependencies are set and stateManager has loaded JSON data.
   */
  initialize() {
    console.log('[DiscoveryState] Initializing discoverable data...');
    if (!this.stateManager || !this.eventBus) {
      console.error(
        '[DiscoveryState] Cannot initialize: Dependencies not set.'
      );
      return;
    }

    // Ensure Menu region starts as discovered with its exits visible
    this.discoveredRegions.add('Menu');

    if (!this.discoveredExits.has('Menu')) {
      this.discoveredExits.set('Menu', new Set());
    }

    // Add all exits from Menu to the discovered exits
    try {
      const currentStateManager = this.stateManager.instance; // Use injected instance
      if (!currentStateManager) {
        throw new Error('StateManager instance is not available.');
      }

      const menuRegion = currentStateManager.regions['Menu'];
      if (menuRegion && menuRegion.exits) {
        const menuExits = this.discoveredExits.get('Menu');
        menuRegion.exits.forEach((exit) => {
          if (!menuExits.has(exit.name)) {
            menuExits.add(exit.name);
          }
        });
        console.log('[DiscoveryState] Initialized Menu exits:', menuExits);
      } else {
        console.warn(
          '[DiscoveryState] Menu region or its exits not found during initialization.'
        );
      }
    } catch (error) {
      console.error(
        '[DiscoveryState] Error accessing stateManager during initialization:',
        error
      );
    }
  }

  // --- Discovery Checking Methods ---

  isRegionDiscovered(regionName) {
    return this.discoveredRegions.has(regionName);
  }

  isLocationDiscovered(locationName) {
    return this.discoveredLocations.has(locationName);
  }

  isExitDiscovered(regionName, exitName) {
    return (
      this.discoveredExits.has(regionName) &&
      this.discoveredExits.get(regionName).has(exitName)
    );
  }

  // --- Discovery Action Methods ---

  discoverRegion(regionName) {
    if (!this.eventBus) return false; // Need eventBus to publish
    if (!this.discoveredRegions.has(regionName)) {
      this.discoveredRegions.add(regionName);
      console.log(`[DiscoveryState] Discovered Region: ${regionName}`);

      // Ensure the exit map entry exists for this newly discovered region
      if (!this.discoveredExits.has(regionName)) {
        this.discoveredExits.set(regionName, new Set());
      }

      this.eventBus.publish('discovery:regionDiscovered', { regionName });
      this.eventBus.publish('discovery:changed', {}); // General change event
      return true; // Indicate that a change occurred
    }
    return false;
  }

  discoverLocation(locationName) {
    if (!this.eventBus) return false;
    if (!this.discoveredLocations.has(locationName)) {
      this.discoveredLocations.add(locationName);
      console.log(`[DiscoveryState] Discovered Location: ${locationName}`);
      this.eventBus.publish('discovery:locationDiscovered', { locationName });
      this.eventBus.publish('discovery:changed', {});
      return true;
    }
    return false;
  }

  discoverExit(regionName, exitName) {
    if (!this.eventBus) return false;
    // Ensure the region itself is discovered first
    this.discoverRegion(regionName); // This uses eventBus internally

    const exits = this.discoveredExits.get(regionName);
    if (exits && !exits.has(exitName)) {
      exits.add(exitName);
      console.log(
        `[DiscoveryState] Discovered Exit: ${regionName} -> ${exitName}`
      );
      this.eventBus.publish('discovery:exitDiscovered', {
        regionName,
        exitName,
      });
      this.eventBus.publish('discovery:changed', {});
      return true;
    }
    return false;
  }

  // --- State Management ---

  getSerializableState() {
    return {
      regions: Array.from(this.discoveredRegions),
      locations: Array.from(this.discoveredLocations),
      exits: Array.from(this.discoveredExits.entries()).map(
        ([region, exitsSet]) => [region, Array.from(exitsSet)]
      ),
    };
  }

  loadFromSerializedState(state) {
    if (!state) return;
    console.log('[DiscoveryState] Loading state...');
    this.discoveredRegions = new Set(state.regions || ['Menu']); // Ensure Menu is always there
    this.discoveredLocations = new Set(state.locations || []);
    this.discoveredExits = new Map(
      (state.exits || []).map(([region, exitsArray]) => [
        region,
        new Set(exitsArray),
      ])
    );
    // Ensure Menu exists in exits map after load
    if (!this.discoveredExits.has('Menu')) {
      this.discoveredExits.set('Menu', new Set());
    }
    console.log('[DiscoveryState] State loaded.');
    if (this.eventBus) {
      this.eventBus.publish('discovery:changed', {}); // Notify UI after loading
    } else {
      console.warn(
        '[DiscoveryState] Cannot publish discovery:changed after load, eventBus not set.'
      );
    }
  }

  clearDiscovery() {
    console.log('[DiscoveryState] Clearing discovery state.');
    this.discoveredRegions = new Set(['Menu']);
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map();
    this.discoveredExits.set('Menu', new Set()); // Re-initialize Menu exits map
    this.initialize(); // Re-initialize based on current game data
    if (this.eventBus) {
      this.eventBus.publish('discovery:changed', {});
    } else {
      console.warn(
        '[DiscoveryState] Cannot publish discovery:changed after clear, eventBus not set.'
      );
    }
  }

  /**
   * Placeholder for cleanup logic.
   */
  dispose() {
    console.log('[DiscoveryState] Disposing...');
    // No subscriptions managed internally in this version yet.
  }
}
