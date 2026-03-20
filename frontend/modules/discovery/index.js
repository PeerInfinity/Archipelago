import { DiscoveryState } from './state.js'; // Import the class
import discoveryStateSingleton from './singleton.js'; // <<< IMPORT SINGLETON
// REMOVED: import eventBus from '../../app/core/eventBus.js';

// Import singletons needed for injection
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import settingsManager from '../../app/core/settingsManager.js';

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

// Module settings cache
let _settings = {
  enableDiscoveryMode: false,
  regionDiscoveryTrigger: 'onEnter',
  autoDiscoverLocations: false,
  autoDiscoverExits: false,
  undiscoveredDisplay: 'hidden',
  showDebugOptions: true,
  clickDiscoversLocation: true,
  clickDiscoversRegion: false,
  disableLocationCheckUI: false,
  showUndiscoveredDetails: false,
  showUndiscoveredRegionNames: false
};

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
  registrationApi.registerEventBusPublisher('discovery:exitDiscovered');
  registrationApi.registerEventBusPublisher('discovery:modeChanged');
  registrationApi.registerEventBusPublisher('discovery:settingsChanged');

  // Register settings schema for discovery module
  registrationApi.registerSettingsSchema(moduleInfo.name, {
    enableDiscoveryMode: {
      type: 'boolean',
      default: false,
      description: 'Enable discovery mode - filters locations and exits to only show discovered items'
    },
    regionDiscoveryTrigger: {
      type: 'string',
      default: 'onEnter',
      description: 'When to discover regions: onEnter (when first entered) or onExitDiscovered (when an exit leading to them is discovered)'
    },
    autoDiscoverLocations: {
      type: 'boolean',
      default: false,
      description: 'Automatically discover all locations when their region is discovered'
    },
    autoDiscoverExits: {
      type: 'boolean',
      default: false,
      description: 'Automatically discover all exits when their region is discovered'
    },
    undiscoveredDisplay: {
      type: 'string',
      default: 'hidden',
      description: 'How to display items in undiscovered regions: hidden (not shown) or placeholder (shown as ???)'
    },
    showDebugOptions: {
      type: 'boolean',
      default: true,
      description: 'Show debug options in Discovery Panel (region/location/exit lists and debug settings)'
    },
    clickDiscoversLocation: {
      type: 'boolean',
      default: true,
      description: 'Clicking an undiscovered location in the Locations panel discovers it'
    },
    clickDiscoversRegion: {
      type: 'boolean',
      default: false,
      description: 'Clicking an undiscovered region in the Region Graph or Regions panel discovers it'
    },
    disableLocationCheckUI: {
      type: 'boolean',
      default: false,
      description: 'Disable location check UI elements - clicking locations will not trigger checks'
    },
    showUndiscoveredDetails: {
      type: 'boolean',
      default: false,
      description: 'Show full details (region, rules, status) for undiscovered locations instead of minimal info'
    }
  });

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

  // Register dispatcher receiver for user:exitClicked
  // Chain: Loops (intercepts if loop mode) → Discovery (discovers + blocks if discovery mode) → Regions (moves)
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:exitClicked',
    handleExitClickedForDiscovery,
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
  );

  // Register dispatcher receiver for user:locationCheck
  // Chain: Loops (intercepts if loop mode) → Discovery (discovers + blocks if discovery mode) → PlayerState → StateManager
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:locationCheck',
    handleLocationCheckForDiscovery,
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
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

  // Load initial settings
  await loadSettings();

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

    // Subscribe to stateManager:rulesLoaded to reinitialize when rules change
    log('info', '[Discovery Module] Subscribing to stateManager:rulesLoaded');
    const rulesLoadedUnsubscribe = _moduleEventBus.subscribe(
      'stateManager:rulesLoaded',
      handleRulesLoaded
    );
    _unsubscribeHandles.push(rulesLoadedUnsubscribe);

    // Subscribe to settings changes
    log('info', '[Discovery Module] Subscribing to settings:changed');
    const settingsChangedUnsubscribe = _moduleEventBus.subscribe(
      'settings:changed',
      handleSettingsChanged
    );
    _unsubscribeHandles.push(settingsChangedUnsubscribe);

    // Subscribe to UI click events for discovery handling
    log('info', '[Discovery Module] Subscribing to UI click events');
    _unsubscribeHandles.push(
      _moduleEventBus.subscribe('regionGraph:nodeSelected', handleRegionClicked),
      _moduleEventBus.subscribe('ui:regionHeaderClicked', handleRegionClicked),
      // user:locationCheck and user:exitClicked are handled via dispatcher chains
      _moduleEventBus.subscribe('playerState:regionChanged', handlePlayerRegionChanged)
    );
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

  // Clear existing discovery state and re-initialize for the new rules.
  // Using clearDiscovery() instead of initialize() ensures previously discovered
  // regions/locations/exits don't persist when loading a different preset.
  log('info',
    '[Discovery Module] Clearing and re-initializing discoverables from stateManager:rulesLoaded handler...'
  );
  try {
    discoveryStateSingleton.clearDiscovery();

    // Apply onExitDiscovered cascade for start regions.
    // state.initialize() discovers start region exits directly, but doesn't
    // know about regionDiscoveryTrigger. If the trigger is 'onExitDiscovered',
    // we need to discover the regions those exits lead to.
    if (_settings.regionDiscoveryTrigger === 'onExitDiscovered') {
      applyExitDiscoveryCascade(discoveryStateSingleton.getStartRegions());
    }
  } catch (error) {
    log('error',
      '[Discovery Module] Error clearing/initializing DiscoveryState from rulesLoaded:',
      error
    );
  }
}

function handleExploreCompleted(eventData) {
  log('info', '[Discovery Module] Handling loop:exploreCompleted', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData.regionName) {
    const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(eventData.regionName);

    // Each explore action discovers one random undiscovered location or exit
    // in the region. Build a pool of undiscovered candidates and pick one.
    try {
      const staticData = stateManager?.getStaticData();
      const region = staticData?.regions?.get(eventData.regionName);
      if (region) {
        const candidates = [];

        if (region.locations) {
          for (const location of region.locations) {
            if (!discoveryStateSingleton.isLocationDiscovered(location.name)) {
              candidates.push({ type: 'location', name: location.name });
            }
          }
        }

        if (region.exits) {
          for (const exit of region.exits) {
            if (!discoveryStateSingleton.isExitDiscovered(eventData.regionName, exit.name)) {
              candidates.push({ type: 'exit', name: exit.name, connectedRegion: exit.connected_region });
            }
          }
        }

        if (candidates.length > 0) {
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          if (pick.type === 'location') {
            discoveryStateSingleton.discoverLocation(pick.name);
            log('info', `[Discovery Module] Explore discovered location: ${pick.name}`);
          } else {
            discoveryStateSingleton.discoverExit(eventData.regionName, pick.name);
            log('info', `[Discovery Module] Explore discovered exit: ${pick.name}`);
            // If trigger is 'onExitDiscovered', also discover the connected region
            if (_settings.regionDiscoveryTrigger === 'onExitDiscovered' && pick.connectedRegion) {
              discoveryStateSingleton.discoverRegion(pick.connectedRegion);
            }
          }
        }
      }
    } catch (error) {
      log('error', '[Discovery Module] Error discovering from explore:', error);
    }

    // Auto-discover exits only if the region is newly discovered
    if (wasNewlyDiscovered) {
      autoDiscoverExitsInRegion(eventData.regionName);
    }
  }

  // Also discover any explicitly listed locations
  if (
    eventData.discoveredLocations &&
    Array.isArray(eventData.discoveredLocations)
  ) {
    eventData.discoveredLocations.forEach(
      (locName) => discoveryStateSingleton.discoverLocation(locName)
    );
  }

  // Also discover any explicitly listed exits
  if (eventData.discoveredExits && Array.isArray(eventData.discoveredExits)) {
    if (eventData.regionName) {
      eventData.discoveredExits.forEach(
        (exitName) =>
          discoveryStateSingleton.discoverExit(eventData.regionName, exitName)
      );
    }
  }
}

function handleMoveCompleted(eventData) {
  log('info', '[Discovery Module] Handling loop:moveCompleted', eventData);
  if (!eventData || !discoveryStateSingleton) return; // <<< Use singleton

  if (eventData?.destinationRegion) {
    // Only discover the region on move if trigger is 'onEnter'
    if (_settings.regionDiscoveryTrigger === 'onEnter') {
      const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(eventData.destinationRegion);

      // If region was newly discovered, trigger auto-discovery of locations and exits
      if (wasNewlyDiscovered) {
        autoDiscoverLocationsInRegion(eventData.destinationRegion);
        autoDiscoverExitsInRegion(eventData.destinationRegion);
      }
    }

    // Always discover the exit that was used
    if (eventData.sourceRegion && eventData.exitName) {
      discoveryStateSingleton.discoverExit(
        eventData.sourceRegion,
        eventData.exitName
      );

      // If trigger is 'onExitDiscovered', discovering an exit also discovers the connected region
      if (_settings.regionDiscoveryTrigger === 'onExitDiscovered') {
        const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(eventData.destinationRegion);
        if (wasNewlyDiscovered) {
          autoDiscoverLocationsInRegion(eventData.destinationRegion);
          autoDiscoverExitsInRegion(eventData.destinationRegion);
        }
      }
    }
  }
}

// --- UI Click Event Handlers ---

/**
 * Handle region click from region graph or regions panel.
 * Discovers the region if clickDiscoversRegion is enabled.
 */
function handleRegionClicked(eventData) {
  if (!_settings.enableDiscoveryMode || !_settings.clickDiscoversRegion) return;
  if (!discoveryStateSingleton) return;

  // regionGraph:nodeSelected uses nodeId, ui:regionHeaderClicked uses regionName
  const regionName = eventData?.regionName || eventData?.nodeId;
  if (!regionName) return;

  if (!discoveryStateSingleton.isRegionDiscovered(regionName)) {
    log('info', `[Discovery Module] Discovering region via click: ${regionName}`);
    const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(regionName);
    if (wasNewlyDiscovered) {
      autoDiscoverLocationsInRegion(regionName);
      autoDiscoverExitsInRegion(regionName);
    }
  }
}

/**
 * Handle user:locationCheck for discovery purposes.
 * If discovery mode is active, discovers the location before propagating.
 * Always propagates to the next handler (playerState → stateManager) — the
 * UI layer (locationUI, regionGraph) is responsible for blocking clicks that
 * shouldn't produce events during discovery mode.
 */
function handleLocationCheckForDiscovery(eventData) {
  // Discovery mode is active - discover the location if settings allow
  if (_settings.enableDiscoveryMode && _settings.clickDiscoversLocation && discoveryStateSingleton) {
    const { locationName, regionName } = eventData || {};
    if (locationName) {
      if (!discoveryStateSingleton.isLocationDiscovered(locationName)) {
        log('info', `[Discovery Module] Discovering location via click: ${locationName}`);
        discoveryStateSingleton.discoverLocation(locationName);
      }

      if (regionName && !discoveryStateSingleton.isRegionDiscovered(regionName)) {
        const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(regionName);
        if (wasNewlyDiscovered) {
          autoDiscoverLocationsInRegion(regionName);
          autoDiscoverExitsInRegion(regionName);
        }
      }
    }
  }

  // Always propagate to playerState → stateManager
  if (_moduleDispatcher) {
    _moduleDispatcher.publishToNextModule(
      moduleInfo.name,
      'user:locationCheck',
      eventData,
      { direction: 'up' }
    );
  }
}

/**
 * Handle user:exitClicked for discovery purposes.
 * If discovery mode is active: discovers the exit, then blocks propagation
 * (regions module should not perform a move when discovery mode is active).
 * If discovery mode is NOT active: propagates to the next handler (regions module).
 */
function handleExitClickedForDiscovery(eventData) {
  if (!_settings.enableDiscoveryMode) {
    // Discovery mode not active - propagate to regions module
    if (_moduleDispatcher) {
      _moduleDispatcher.publishToNextModule(
        moduleInfo.name,
        'user:exitClicked',
        eventData,
        { direction: 'up' }
      );
    }
    return;
  }

  // Discovery mode is active - discover the exit if settings allow
  if (_settings.clickDiscoversLocation && discoveryStateSingleton) {
    const { exitName, sourceRegion } = eventData || {};
    if (exitName && sourceRegion) {
      if (!discoveryStateSingleton.isExitDiscovered(sourceRegion, exitName)) {
        log('info', `[Discovery Module] Discovering exit via click: ${exitName} in ${sourceRegion}`);
        discoveryStateSingleton.discoverExit(sourceRegion, exitName);
      }

      if (!discoveryStateSingleton.isRegionDiscovered(sourceRegion)) {
        const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(sourceRegion);
        if (wasNewlyDiscovered) {
          autoDiscoverLocationsInRegion(sourceRegion);
          autoDiscoverExitsInRegion(sourceRegion);
        }
      }
    }
  }

  // Block propagation - don't let regions module perform a move in discovery mode
}

/**
 * Handle player region change (e.g. from text adventure or other sources).
 * Auto-discovers locations and exits in the new region if settings allow.
 * This complements the loop:moveCompleted handler for non-loop region changes.
 */
function handlePlayerRegionChanged(eventData) {
  if (!_settings.enableDiscoveryMode) return;
  if (!discoveryStateSingleton) return;

  const regionName = eventData?.newRegion;
  if (!regionName) return;

  // Discover the region on enter if the trigger is 'onEnter'
  if (_settings.regionDiscoveryTrigger === 'onEnter') {
    const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(regionName);
    if (wasNewlyDiscovered) {
      log('info', `[Discovery Module] Discovered region on enter: ${regionName}`);
    }
  }

  // Auto-discover locations and exits if the region is discovered and settings allow
  if (discoveryStateSingleton.isRegionDiscovered(regionName)) {
    autoDiscoverLocationsInRegion(regionName);
    autoDiscoverExitsInRegion(regionName);
  }
}

// --- Settings Functions ---

/**
 * Load all discovery settings from settingsManager
 */
async function loadSettings() {
  try {
    _settings.enableDiscoveryMode = await settingsManager.getSetting(
      'moduleSettings.discovery.enableDiscoveryMode', false
    );
    _settings.regionDiscoveryTrigger = await settingsManager.getSetting(
      'moduleSettings.discovery.regionDiscoveryTrigger', 'onEnter'
    );
    _settings.autoDiscoverLocations = await settingsManager.getSetting(
      'moduleSettings.discovery.autoDiscoverLocations', false
    );
    _settings.autoDiscoverExits = await settingsManager.getSetting(
      'moduleSettings.discovery.autoDiscoverExits', false
    );
    _settings.undiscoveredDisplay = await settingsManager.getSetting(
      'moduleSettings.discovery.undiscoveredDisplay', 'hidden'
    );
    _settings.showDebugOptions = await settingsManager.getSetting(
      'moduleSettings.discovery.showDebugOptions', true
    );
    _settings.clickDiscoversLocation = await settingsManager.getSetting(
      'moduleSettings.discovery.clickDiscoversLocation', true
    );
    _settings.clickDiscoversRegion = await settingsManager.getSetting(
      'moduleSettings.discovery.clickDiscoversRegion', false
    );
    _settings.disableLocationCheckUI = await settingsManager.getSetting(
      'moduleSettings.discovery.disableLocationCheckUI', false
    );
    _settings.showUndiscoveredDetails = await settingsManager.getSetting(
      'moduleSettings.discovery.showUndiscoveredDetails', false
    );
    _settings.showUndiscoveredRegionNames = await settingsManager.getSetting(
      'moduleSettings.discovery.showUndiscoveredRegionNames', false
    );
    log('info', '[Discovery Module] Settings loaded:', _settings);
  } catch (error) {
    log('error', '[Discovery Module] Error loading settings:', error);
  }
}

/**
 * Handle settings changes
 */
async function handleSettingsChanged({ key }) {
  if (key === '*' || key.startsWith('moduleSettings.discovery')) {
    log('info', '[Discovery Module] Settings changed, reloading...');
    const previousEnableMode = _settings.enableDiscoveryMode;
    const previousTrigger = _settings.regionDiscoveryTrigger;
    await loadSettings();

    // If enableDiscoveryMode changed, publish the modeChanged event
    if (_settings.enableDiscoveryMode !== previousEnableMode && _moduleEventBus) {
      _moduleEventBus.publish('discovery:modeChanged', {
        active: _settings.enableDiscoveryMode
      });
    }

    // If regionDiscoveryTrigger changed to 'onExitDiscovered', apply cascade
    // from start regions to discover regions their exits lead to.
    // We cascade from start regions (not all discovered regions) because when
    // multiple concurrent settings changes fire this handler, cascading from
    // all discovered regions causes amplification: the first cascade discovers
    // new regions, then the second cascade expands from the larger set.
    // Cascading from start regions is idempotent and matches handleRulesLoaded.
    if (_settings.regionDiscoveryTrigger === 'onExitDiscovered' && previousTrigger !== 'onExitDiscovered') {
      if (discoveryStateSingleton) {
        applyExitDiscoveryCascade(discoveryStateSingleton.getStartRegions());
      }
    }

    // Always publish settingsChanged with current settings so other modules can react
    if (_moduleEventBus) {
      _moduleEventBus.publish('discovery:settingsChanged', {
        settings: { ..._settings }
      });
    }
  }
}

/**
 * Auto-discover all locations in a region based on settings
 * @param {string} regionName - The region to auto-discover locations for
 */
function autoDiscoverLocationsInRegion(regionName) {
  if (!_settings.autoDiscoverLocations) return;
  if (!discoveryStateSingleton || !stateManager) return;

  try {
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.regions) return;

    const region = staticData.regions.get(regionName);
    if (!region || !region.locations) return;

    for (const location of region.locations) {
      discoveryStateSingleton.discoverLocation(location.name);
    }
    log('info', `[Discovery Module] Auto-discovered locations in region: ${regionName}`);
  } catch (error) {
    log('error', '[Discovery Module] Error auto-discovering locations:', error);
  }
}

/**
 * Auto-discover all exits in a region based on settings
 * @param {string} regionName - The region to auto-discover exits for
 */
function autoDiscoverExitsInRegion(regionName) {
  if (!_settings.autoDiscoverExits) return;
  if (!discoveryStateSingleton || !stateManager) return;

  try {
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.regions) return;

    const region = staticData.regions.get(regionName);
    if (!region || !region.exits) return;

    for (const exit of region.exits) {
      discoveryStateSingleton.discoverExit(regionName, exit.name);

      // If regionDiscoveryTrigger is 'onExitDiscovered', also discover the connected region
      if (_settings.regionDiscoveryTrigger === 'onExitDiscovered') {
        discoveryStateSingleton.discoverRegion(exit.connected_region);
      }
    }
    log('info', `[Discovery Module] Auto-discovered exits in region: ${regionName}`);
  } catch (error) {
    log('error', '[Discovery Module] Error auto-discovering exits:', error);
  }
}

/**
 * For a set of already-discovered regions, discover the regions their exits lead to.
 * This applies the 'onExitDiscovered' cascade without requiring autoDiscoverExits.
 * Also discovers locations/exits in the newly discovered regions if auto-discover is on.
 * @param {string[]} regionNames - Regions whose exits should cascade
 */
function applyExitDiscoveryCascade(regionNames) {
  if (!discoveryStateSingleton || !stateManager) return;

  try {
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.regions) return;

    for (const regionName of regionNames) {
      const region = staticData.regions.get(regionName);
      if (!region || !region.exits) continue;

      for (const exit of region.exits) {
        const wasNewlyDiscovered = discoveryStateSingleton.discoverRegion(exit.connected_region);
        if (wasNewlyDiscovered) {
          log('info', `[Discovery Module] onExitDiscovered cascade: discovered region ${exit.connected_region} via ${regionName} exit ${exit.name}`);
          autoDiscoverLocationsInRegion(exit.connected_region);
          autoDiscoverExitsInRegion(exit.connected_region);
        }
      }
    }
  } catch (error) {
    log('error', '[Discovery Module] Error in applyExitDiscoveryCascade:', error);
  }
}

/**
 * Get the current discovery settings (for use by other modules)
 * @returns {Object} Current discovery settings
 */
export function getDiscoverySettings() {
  return { ..._settings };
}

/**
 * Apply discovery settings directly, bypassing the global settings:changed event.
 * Updates the internal cache, publishes discovery-specific events, and persists
 * to settingsManager without triggering a global broadcast.
 * @param {Object} newSettings - Partial settings object to merge
 */

// REMOVED: export { discoveryStateSingleton };
