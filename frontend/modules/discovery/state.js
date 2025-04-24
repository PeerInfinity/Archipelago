import eventBus from '../../app/core/eventBus.js';

// Assume stateManager is accessible for initialization or provide it.
// For now, assume it needs to be passed or accessed via singleton pattern.
// Let's import the stateManager singleton directly for now.
import stateManager from '../../modules/stateManager/stateManagerSingleton.js';

/**
 * Manages the discovery state of regions, locations, and exits within the game.
 * Tracks what the player has encountered in the loop mode.
 */
export class DiscoveryState {
  constructor() {
    this.discoveredRegions = new Set(['Menu']); // Start with Menu discovered
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map(); // regionName -> Set of exit names

    console.log('[DiscoveryState] Initialized');
  }

  /**
   * Initializes the discoverable data based on the loaded game state.
   * Should be called after stateManager has loaded JSON data.
   */
  initialize() {
    console.log('[DiscoveryState] Initializing discoverable data...');
    // Ensure Menu region starts as discovered with its exits visible
    this.discoveredRegions.add('Menu');

    if (!this.discoveredExits.has('Menu')) {
      this.discoveredExits.set('Menu', new Set());
    }

    // Add all exits from Menu to the discovered exits
    try {
      const menuRegion = stateManager.regions['Menu'];
      if (menuRegion && menuRegion.exits) {
        const menuExits = this.discoveredExits.get('Menu');
        menuRegion.exits.forEach((exit) => {
          // Check if already discovered to avoid duplicate events
          if (!menuExits.has(exit.name)) {
            menuExits.add(exit.name);
            // No event needed for initial Menu exits typically
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

    // Maybe subscribe to stateManager:jsonDataLoaded here?
    // eventBus.subscribe('stateManager:jsonDataLoaded', () => this.initialize());
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
    if (!this.discoveredRegions.has(regionName)) {
      this.discoveredRegions.add(regionName);
      console.log(`[DiscoveryState] Discovered Region: ${regionName}`);

      // Ensure the exit map entry exists for this newly discovered region
      if (!this.discoveredExits.has(regionName)) {
        this.discoveredExits.set(regionName, new Set());
      }

      eventBus.publish('discovery:regionDiscovered', { regionName });
      eventBus.publish('discovery:changed', {}); // General change event
      return true; // Indicate that a change occurred
    }
    return false;
  }

  discoverLocation(locationName) {
    if (!this.discoveredLocations.has(locationName)) {
      this.discoveredLocations.add(locationName);
      console.log(`[DiscoveryState] Discovered Location: ${locationName}`);
      eventBus.publish('discovery:locationDiscovered', { locationName });
      eventBus.publish('discovery:changed', {});
      return true;
    }
    return false;
  }

  discoverExit(regionName, exitName) {
    // Ensure the region itself is discovered first
    this.discoverRegion(regionName);

    const exits = this.discoveredExits.get(regionName);
    if (exits && !exits.has(exitName)) {
      exits.add(exitName);
      console.log(
        `[DiscoveryState] Discovered Exit: ${regionName} -> ${exitName}`
      );
      eventBus.publish('discovery:exitDiscovered', { regionName, exitName });
      eventBus.publish('discovery:changed', {});
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
    eventBus.publish('discovery:changed', {}); // Notify UI after loading
  }

  clearDiscovery() {
    console.log('[DiscoveryState] Clearing discovery state.');
    this.discoveredRegions = new Set(['Menu']);
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map();
    this.discoveredExits.set('Menu', new Set()); // Re-initialize Menu exits map
    this.initialize(); // Re-initialize based on current game data
    eventBus.publish('discovery:changed', {});
  }
}
