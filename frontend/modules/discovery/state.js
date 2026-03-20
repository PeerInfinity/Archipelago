// REMOVED: import eventBus from '../../app/core/eventBus.js';

// REMOVED: import stateManagerSingleton from '../stateManager/stateManagerSingleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('discoveryState', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[discoveryState] ${message}`, ...data);
  }
}

/**
 * Manages the discovery state of regions, locations, and exits within the game.
 * Tracks what the player has encountered in the loop mode.
 */
export class DiscoveryState {
  constructor() {
    // Dependencies (injected via setDependencies)
    this.stateManager = null;
    this.eventBus = null;

    // State - start with empty sets, will be initialized with start regions
    this.discoveredRegions = new Set();
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map(); // regionName -> Set of exit names

    log('info', '[DiscoveryState] Constructed');
  }

  /**
   * Get the start regions from stateManager, falling back to the first
   * region in static data if start regions aren't available yet.
   * @returns {string[]} Array of starting region names
   */
  getStartRegions() {
    if (this.stateManager && typeof this.stateManager.getStartRegions === 'function') {
      const startRegions = this.stateManager.getStartRegions();
      if (Array.isArray(startRegions) && startRegions.length > 0) {
        return startRegions;
      }
    }
    // Fallback: use the first region from static data
    if (this.stateManager) {
      const staticData = this.stateManager.getStaticData?.();
      if (staticData && staticData.regions && staticData.regions.size > 0) {
        return [staticData.regions.keys().next().value];
      }
    }
    return [];
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
      log(
        'error',
        '[DiscoveryState] Missing required dependencies (eventBus, stateManager).'
      );
      return;
    }
    log('info', '[DiscoveryState] Setting dependencies...');
    this.eventBus = dependencies.eventBus;
    this.stateManager = dependencies.stateManager;
  }

  /**
   * Initializes the discoverable data based on the loaded game state.
   * Should be called after dependencies are set and stateManager has loaded JSON data.
   */
  initialize() {
    log('info', '[DiscoveryState] Initializing discoverable data...');
    if (!this.stateManager || !this.eventBus) {
      log('error', '[DiscoveryState] Cannot initialize: Dependencies not set.');
      return;
    }

    // Get start regions and ensure they are discovered
    const startRegions = this.getStartRegions();
    log('info', '[DiscoveryState] Using start regions:', startRegions);

    for (const regionName of startRegions) {
      this.discoveredRegions.add(regionName);

      if (!this.discoveredExits.has(regionName)) {
        this.discoveredExits.set(regionName, new Set());
      }
    }

    // Add all exits from start regions to the discovered exits
    try {
      const staticData = this.stateManager.getStaticData(); // Get static data from proxy
      if (!staticData || !staticData.regions) {
        throw new Error('StateManager static data is not available.');
      }

      for (const regionName of startRegions) {
        const region = staticData.regions.get(regionName);
        if (region) {
          // Discover all exits in start regions
          if (region.exits) {
            const regionExits = this.discoveredExits.get(regionName);
            region.exits.forEach((exit) => {
              if (!regionExits.has(exit.name)) {
                regionExits.add(exit.name);
              }
            });
            log('info', `[DiscoveryState] Initialized ${regionName} exits:`, regionExits);
          }

          // Discover all locations in start regions (fully explored)
          if (region.locations) {
            region.locations.forEach((location) => {
              if (location.name && !this.discoveredLocations.has(location.name)) {
                this.discoveredLocations.add(location.name);
              }
            });
            log('info', `[DiscoveryState] Initialized ${regionName} locations (fully explored):`,
              region.locations.map(l => l.name));
          }
        } else {
          log(
            'warn',
            `[DiscoveryState] Region ${regionName} not found during initialization.`
          );
        }
      }
    } catch (error) {
      log(
        'error',
        '[DiscoveryState] Error accessing stateManager during initialization:',
        error
      );
    }

    // Notify listeners that discovery state has been initialized
    if (this.eventBus) {
      this.eventBus.publish('discovery:changed', {});
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
      log('info', `[DiscoveryState] Discovered Region: ${regionName}`);

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
      log('info', `[DiscoveryState] Discovered Location: ${locationName}`);
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
      log(
        'info',
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
    log('info', '[DiscoveryState] Loading state...');

    // Get start regions to ensure they are always included
    const startRegions = this.getStartRegions();

    // Load regions, ensuring start regions are included
    this.discoveredRegions = new Set(state.regions || startRegions);
    for (const startRegion of startRegions) {
      this.discoveredRegions.add(startRegion);
    }

    this.discoveredLocations = new Set(state.locations || []);
    this.discoveredExits = new Map(
      (state.exits || []).map(([region, exitsArray]) => [
        region,
        new Set(exitsArray),
      ])
    );

    // Ensure start regions exist in exits map after load
    for (const startRegion of startRegions) {
      if (!this.discoveredExits.has(startRegion)) {
        this.discoveredExits.set(startRegion, new Set());
      }
    }

    log('info', '[DiscoveryState] State loaded.');
    if (this.eventBus) {
      this.eventBus.publish('discovery:changed', {}); // Notify UI after loading
    } else {
      log(
        'warn',
        '[DiscoveryState] Cannot publish discovery:changed after load, eventBus not set.'
      );
    }
  }

  clearDiscovery() {
    log('info', '[DiscoveryState] Clearing discovery state.');

    // Reset to empty state
    this.discoveredRegions = new Set();
    this.discoveredLocations = new Set();
    this.discoveredExits = new Map();

    // Re-initialize with start regions
    this.initialize();

    if (this.eventBus) {
      this.eventBus.publish('discovery:changed', {});
    } else {
      log(
        'warn',
        '[DiscoveryState] Cannot publish discovery:changed after clear, eventBus not set.'
      );
    }
  }

  // --- Manual Discovery Toggle Methods ---

  /**
   * Manually undiscover a region
   * @param {string} regionName - Name of the region to undiscover
   * @returns {boolean} True if state changed
   */
  undiscoverRegion(regionName) {
    // Don't allow undiscovering start regions
    const startRegions = this.getStartRegions();
    if (startRegions.includes(regionName)) {
      log('warn', `[DiscoveryState] Cannot undiscover start region: ${regionName}`);
      return false;
    }

    if (this.discoveredRegions.has(regionName)) {
      this.discoveredRegions.delete(regionName);
      this.discoveredExits.delete(regionName);
      log('info', `[DiscoveryState] Undiscovered Region: ${regionName}`);

      if (this.eventBus) {
        this.eventBus.publish('discovery:changed', {});
      }
      return true;
    }
    return false;
  }

  /**
   * Manually undiscover a location
   * @param {string} locationName - Name of the location to undiscover
   * @returns {boolean} True if state changed
   */
  undiscoverLocation(locationName) {
    if (this.discoveredLocations.has(locationName)) {
      this.discoveredLocations.delete(locationName);
      log('info', `[DiscoveryState] Undiscovered Location: ${locationName}`);

      if (this.eventBus) {
        this.eventBus.publish('discovery:changed', {});
      }
      return true;
    }
    return false;
  }

  /**
   * Manually undiscover an exit
   * @param {string} regionName - Name of the region containing the exit
   * @param {string} exitName - Name of the exit to undiscover
   * @returns {boolean} True if state changed
   */
  undiscoverExit(regionName, exitName) {
    const exits = this.discoveredExits.get(regionName);
    if (exits && exits.has(exitName)) {
      exits.delete(exitName);
      log('info', `[DiscoveryState] Undiscovered Exit: ${regionName} -> ${exitName}`);

      if (this.eventBus) {
        this.eventBus.publish('discovery:changed', {});
      }
      return true;
    }
    return false;
  }

  /**
   * Toggle discovery state of a region
   * @param {string} regionName - Name of the region
   * @returns {boolean} New discovery state (true = discovered)
   */
  toggleRegionDiscovery(regionName) {
    if (this.discoveredRegions.has(regionName)) {
      this.undiscoverRegion(regionName);
      return false;
    } else {
      this.discoverRegion(regionName);
      return true;
    }
  }

  /**
   * Toggle discovery state of a location
   * @param {string} locationName - Name of the location
   * @returns {boolean} New discovery state (true = discovered)
   */
  toggleLocationDiscovery(locationName) {
    if (this.discoveredLocations.has(locationName)) {
      this.undiscoverLocation(locationName);
      return false;
    } else {
      this.discoverLocation(locationName);
      return true;
    }
  }

  /**
   * Toggle discovery state of an exit
   * @param {string} regionName - Name of the region containing the exit
   * @param {string} exitName - Name of the exit
   * @returns {boolean} New discovery state (true = discovered)
   */
  toggleExitDiscovery(regionName, exitName) {
    if (this.isExitDiscovered(regionName, exitName)) {
      this.undiscoverExit(regionName, exitName);
      return false;
    } else {
      this.discoverExit(regionName, exitName);
      return true;
    }
  }

  /**
   * Get all discovered regions
   * @returns {Set<string>} Set of discovered region names
   */
  getDiscoveredRegions() {
    return new Set(this.discoveredRegions);
  }

  /**
   * Get all discovered locations
   * @returns {Set<string>} Set of discovered location names
   */
  getDiscoveredLocations() {
    return new Set(this.discoveredLocations);
  }

  /**
   * Get all discovered exits
   * @returns {Map<string, Set<string>>} Map of region name to set of exit names
   */
  getDiscoveredExits() {
    const result = new Map();
    for (const [region, exits] of this.discoveredExits) {
      result.set(region, new Set(exits));
    }
    return result;
  }

  /**
   * Placeholder for cleanup logic.
   */
  dispose() {
    log('info', '[DiscoveryState] Disposing...');
    // No subscriptions managed internally in this version yet.
  }
}
