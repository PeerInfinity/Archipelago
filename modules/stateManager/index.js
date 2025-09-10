// Remove unused legacy imports
// import { StateManager } from './stateManager.js';
// import stateManagerSingleton from './stateManagerSingleton.js';

// Import the singleton proxy instance
import stateManagerProxySingleton from './stateManagerProxySingleton.js';
// REMOVE: import { createStateSnapshotInterface } from './stateManagerProxy.js';
import eventBus from '../../app/core/eventBus.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import settingsManager from '../../app/core/settingsManager.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('stateManagerModule', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[stateManagerModule] ${message}`, ...data);
    }
  }
}

// Keep track of when initialization is complete
// let isInitialized = false; // No longer needed directly here
// let initializationPromise = null; // Handled by the proxy internally
let initApi = null; // Store the full init API

// --- Module Info ---
export const moduleInfo = {
  name: 'stateManager', // No panel title, use ID
  description: 'Core game state management via Web Worker.',
};

// --- Exports for init system & other modules ---
// Export the registration function
export { register };
// Export the initialization functions
export { initialize, postInitialize };
// Export the singleton instance of the proxy
export { stateManagerProxySingleton };

/**
 * Registration function for the StateManager module.
 * Registers events published by the StateManagerProxy.
 * @param {object} registrationApi - API provided by the initialization script.
 */
function register(registrationApi) {
  log('info', '[StateManager Module] Registering...');

  // Register events published by the StateManagerProxy on the EventBus
  registrationApi.registerEventBusPublisher('stateManager:rulesLoaded'); // Confirms worker loaded initial rules and sent snapshot
  registrationApi.registerEventBusPublisher('stateManager:ready'); // Confirms worker is ready
  registrationApi.registerEventBusPublisher('stateManager:snapshotUpdated'); // Indicates a new state snapshot is available in the proxy cache
  registrationApi.registerEventBusPublisher('stateManager:computationProgress'); // Progress updates during long computations
  registrationApi.registerEventBusPublisher('stateManager:workerQueueStatus'); // Updates on the worker's internal queue status
  registrationApi.registerEventBusPublisher('stateManager:workerError'); // Non-critical errors reported by the worker during processing
  registrationApi.registerEventBusPublisher('stateManager:error'); // Critical errors (e.g., worker init failure, communication failure)
  registrationApi.registerEventBusPublisher('stateManager:loadingRules'); // Status updates during rule loading
  registrationApi.registerEventBusPublisher('stateManager:pongReceived'); // Response to ping requests
  registrationApi.registerEventBusPublisher('stateManager:inventoryChanged'); // Inventory changes
  registrationApi.registerEventBusPublisher('stateManager:checkedLocationsCleared'); // Inventory changes
  registrationApi.registerEventBusPublisher('stateManager:locationCheckRejected'); // Location check rejected
  // Add other specific events forwarded by the proxy if needed (e.g., 'stateManager:itemAdded')

  // Register events this module (or the proxy logic implicitly) might subscribe to
  registrationApi.registerEventBusSubscriberIntent('init:postInitComplete');
  // TODO: Add intents for events the proxy might need to listen for (e.g., server messages for sync)

  // Register dispatcher receiver for user:locationCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name, // 'stateManager'
    'user:locationCheck', // Explicitly the event name we want
    handleUserLocationCheckForStateManager,
    null // No further propagation
  );

  // Register dispatcher receiver for user:itemCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name, // 'stateManager'
    'user:itemCheck', // Explicitly the event name we want
    handleUserItemCheckForStateManager,
    null // No further propagation
  );

  // Register JSON Data Handler
  registrationApi.registerJsonDataHandler(
    'stateManagerRuntime', // Data Key
    {
      displayName: 'Game State (Inv/Checks)', // Checkbox Label
      defaultChecked: true, // Checkbox default state
      requiresReload: false, // Can this data be applied live?
      getSaveDataFunction: async () => {
        // Assumes stateManagerProxySingleton is the proxy instance
        return stateManagerProxySingleton.getSavableStateData();
      },
      applyLoadedDataFunction: (loadedData) => {
        // Assumes stateManagerProxySingleton is the proxy instance
        stateManagerProxySingleton.applyRuntimeStateData(loadedData);
      },
    }
  );

  log('info', '[StateManager Module] Registration complete.');
}

/**
 * Initialization function for the StateManager module.
 * Basic setup, stores the init API.
 * @param {string} moduleId - The unique ID for this module ('stateManager').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
async function initialize(moduleId, priorityIndex, initializationApi) {
  log(
    'info',
    `[StateManager Module] Initializing with priority ${priorityIndex}...`
  );
  // Store the full API for use in postInitialize
  initApi = initializationApi;

  // The proxy singleton instance is created automatically when this module is imported.
  // No explicit instance creation needed here.

  // Subscribe to settings changes to update worker logging configuration
  const eventBus = initializationApi.getEventBus();
  if (eventBus) {
    eventBus.subscribe('settings:changed', handleSettingsChanged, moduleId);
    log('info', '[StateManager Module] Subscribed to settings:changed events');
  }

  log(
    'info',
    '[StateManager Module] Basic initialization complete (proxy singleton exists).'
  );
}

/**
 * Post-initialization function for the StateManager module.
 * Loads default rules by fetching them and sending them to the worker via the proxy.
 * Waits for the worker to confirm loading is complete.
 * @param {object} initializationApi - API provided by the initialization script.
 */
async function postInitialize(initializationApi, moduleSpecificConfig = {}) {
  const eventBus = initializationApi.getEventBus();
  const dispatcher = initializationApi.getDispatcher();
  const logger = initializationApi.getLogger();

  logger.info(
    moduleInfo.name,
    'Post-initializing... triggering initial proxy setup and rule load...'
  );

  if (!initializationApi) {
    logger.error(
      moduleInfo.name,
      '[StateManager Module] Initialization API not available in postInitialize. Cannot load rules.'
    );
    return;
  }

  let jsonData = null; // This will hold rules fetched if moduleSpecificConfig doesn't have them
  let playerInfo = {}; // Default empty, to be populated
  let gameId = moduleSpecificConfig.gameId || 'ALTTP';

  try {
    let rulesConfigToUse = moduleSpecificConfig.rulesConfig;
    let playerIdToUse = moduleSpecificConfig.playerId;
    let settingsToUse = moduleSpecificConfig.settings;

    // Determine the source name for these rules
    let sourceNameForTheseRules =
      moduleSpecificConfig.id || moduleSpecificConfig.sourceName;

    if (!rulesConfigToUse) {
      logger.info(
        moduleInfo.name,
        '[StateManager Module] rulesConfig not in moduleSpecificConfig, fetching ./presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json...'
      );
      const response = await fetch(
        './presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json'
      );
      if (!response.ok) {
        throw new Error(
          `HTTP error fetching ./presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json! status: ${response.status}`
        );
      }
      jsonData = await response.json(); // jsonData is used later for a direct comparison
      rulesConfigToUse = jsonData;
      sourceNameForTheseRules =
        './presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json'; // If we fetch it, this is the definitive source
      logger.info(
        moduleInfo.name,
        '[StateManager Module] Successfully fetched and parsed ./presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json'
      );
    } else {
      // rulesConfigToUse was provided directly by moduleSpecificConfig
      if (!sourceNameForTheseRules) {
        sourceNameForTheseRules = 'moduleSpecificConfigProvidedRules'; // More descriptive fallback
        logger.warn(
          moduleInfo.name,
          `[StateManager Module] rulesConfig was provided directly, but no explicit sourceName or id. Defaulting source to '${sourceNameForTheseRules}'.`
        );
      }
    }

    const playerIds = Object.keys(rulesConfigToUse.player_names || {});
    const playerNames = rulesConfigToUse.player_names || {};

    if (!playerIdToUse) {
      if (playerIds.length === 0) {
        logger.warn(
          moduleInfo.name,
          '[StateManager Module] No players found in rules data. Defaulting to player 1.'
        );
        playerIdToUse = '1';
      } else {
        playerIdToUse = playerIds[0];
        logger.info(
          moduleInfo.name,
          `[StateManager Module] Auto-selected player ID from rules: ${playerIdToUse}`
        );
      }
    }
    playerInfo = {
      playerId: playerIdToUse,
      playerName: playerNames[playerIdToUse] || `Player ${playerIdToUse}`,
    };
    logger.info(
      moduleInfo.name,
      `[StateManager Module] Effective player info:`,
      playerInfo
    );

    if (rulesConfigToUse.game && !moduleSpecificConfig.gameId) {
      gameId = rulesConfigToUse.game;
      logger.info(
        moduleInfo.name,
        `[StateManager Module] Game ID from rules: ${gameId}`
      );
    }

    logger.info(
      moduleInfo.name,
      '[StateManager Module] Initializing StateManagerProxy with derived config...'
    );
    const proxyInitConfig = {
      rulesConfig: rulesConfigToUse,
      playerId: playerInfo.playerId,
      settings:
        settingsToUse ||
        (rulesConfigToUse.settings
          ? rulesConfigToUse.settings[playerInfo.playerId]
          : {}),
    };
    await stateManagerProxySingleton.initialize(proxyInitConfig);
    logger.info(
      moduleInfo.name,
      '[StateManager Module] StateManagerProxy.initialize() call completed.'
    );

    // The worker will now process the raw rulesConfig and send back the processed static data.
    // The proxy will cache this data upon receiving 'rulesLoadedConfirmation' from the worker.
    logger.info(
      moduleInfo.name,
      '[StateManager Module] Raw rulesConfig sent to worker via initialize(). Worker will process and return static data.'
    );

    logger.info(
      moduleInfo.name,
      '[StateManager Module] Calling StateManagerProxy.loadRules()...'
    );
    await stateManagerProxySingleton.loadRules(
      rulesConfigToUse,
      playerInfo,
      sourceNameForTheseRules // Pass the accurately determined source name
    );
    logger.info(
      moduleInfo.name,
      '[StateManager Module] StateManagerProxy.loadRules() call completed.'
    );

    if (eventBus) {
      eventBus.publish('stateManager:rawJsonDataLoaded', {
        source: sourceNameForTheseRules, // MODIFIED: Use the same accurately determined source
        rawJsonData: rulesConfigToUse,
        selectedPlayerInfo: playerInfo,
      }, 'stateManager');
      logger.info(
        moduleInfo.name,
        '[StateManager Module] Published stateManager:rawJsonDataLoaded.'
      );
    } else {
      logger.warn(
        moduleInfo.name,
        '[StateManager Module] EventBus not available for rawJsonDataLoaded event.'
      );
    }
  } catch (error) {
    logger.error(
      moduleInfo.name,
      `[StateManager Module] CRITICAL ERROR during initial proxy/rule setup: ${error.message}`,
      error
    );
    if (eventBus) {
      eventBus.publish('stateManager:error', {
        message: `Failed to initialize proxy or load rules: ${error.message}`,
        isCritical: true,
      }, 'stateManager');
    } else {
      logger.error(
        moduleInfo.name,
        '[StateManager Module] EventBus not available to publish critical error.'
      );
    }
  }
}

async function handleUserLocationCheckForStateManager(eventData) {
  log(
    'info',
    '[StateManagerModule] handleUserLocationCheckForStateManager received event:',
    JSON.parse(JSON.stringify(eventData))
  );
  log(
    'info',
    '[StateManagerModule] Handling user:locationCheck locally.',
    eventData
  );
  if (eventData.locationName) {
    await stateManagerProxySingleton.checkLocation(eventData.locationName); // Command worker
  } else {
    // Handle "check next available" locally.
    // This requires StateManagerProxySingleton to expose a method that commands the worker
    // to find and check the next available local location.
    // e.g., await stateManagerProxySingleton.checkNextLocalLocation();
    log(
      'info',
      '[StateManagerModule] Received generic check request. Logic to find and check next local location needed.'
    );
    // For now, you might need to add a new command to StateManager worker
    // or replicate the logic from the old timerState._checkNextAvailableLocation here,
    // using await stateManagerProxySingleton.getSnapshot() etc.
    // Example of finding and checking next available (conceptual):
    /*
        const snapshot = await stateManagerProxySingleton.getLatestStateSnapshot();
        const staticData = stateManagerProxySingleton.getStaticData();
        if (snapshot && staticData && staticData.locations) {
            const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
            const allLocations = Object.values(staticData.locations);
            let nextLocationToCheck = null;

            // Find the first accessible, unchecked location based on original order if available
            const originalOrder = stateManagerProxySingleton.getOriginalLocationOrder();
            if (originalOrder && originalOrder.length > 0) {
                for (const locName of originalOrder) {
                    const loc = staticData.locations[locName];
                    if (loc && !snapshot.checkedLocations.includes(loc.name)) {
                        const parentRegionName = loc.parent_region || loc.region;
                        const parentRegionReachable = snapshot.regionReachability?.[parentRegionName] === 'reachable' || snapshot.regionReachability?.[parentRegionName] === 'checked';
                        const ruleResult = loc.access_rule ? evaluateRule(loc.access_rule, snapshotInterface) : true;
                        if (parentRegionReachable && ruleResult) {
                            nextLocationToCheck = loc.name;
                            break;
                        }
                    }
                }
            } else { // Fallback: iterate all locations if no original order
                for (const loc of allLocations) {
                    if (!snapshot.checkedLocations.includes(loc.name)) {
                        const parentRegionName = loc.parent_region || loc.region;
                        const parentRegionReachable = snapshot.regionReachability?.[parentRegionName] === 'reachable' || snapshot.regionReachability?.[parentRegionName] === 'checked';
                        const ruleResult = loc.access_rule ? evaluateRule(loc.access_rule, snapshotInterface) : true;
                        if (parentRegionReachable && ruleResult) {
                            nextLocationToCheck = loc.name;
                            break;
                        }
                    }
                }
            }

            if (nextLocationToCheck) {
                log('info', `[StateManagerModule] Auto-checking next available location: ${nextLocationToCheck}`);
                await stateManagerProxySingleton.checkLocation(nextLocationToCheck);
            } else {
                log('info', "[StateManagerModule] No accessible, unchecked locations found to auto-check.");
            }
        } else {
            log('warn', "[StateManagerModule] Cannot auto-check next location: snapshot or static data not available.");
        }
        */
  }
}

async function handleUserItemCheckForStateManager(eventData) {
  log(
    'info',
    '[StateManagerModule] handleUserItemCheckForStateManager received event:',
    JSON.parse(JSON.stringify(eventData))
  );
  log(
    'info',
    '[StateManagerModule] Handling user:itemCheck locally.',
    eventData
  );
  if (eventData.itemName) {
    if (eventData.isShiftPressed) {
      log('info', 
        '[StateManagerModule] Shift-click detected, removing item from inventory:', eventData.itemName
      );
      await stateManagerProxySingleton.removeItemFromInventory(eventData.itemName, 1); // Command worker
    } else {
      await stateManagerProxySingleton.addItemToInventory(eventData.itemName); // Command worker
    }
  } else {
    log(
      'warn',
      '[StateManagerModule] Received user:itemCheck with no itemName.'
    );
  }
}

/**
 * Handle settings changes and update worker logging configuration if logging settings changed
 * @param {Object} eventData - Event data containing the changed settings
 */
function handleSettingsChanged(eventData) {
  // Check if the change involves logging settings
  if (eventData.key && (eventData.key.startsWith('logging') || eventData.key === '*')) {
    log('info', '[StateManagerModule] Logging settings changed, updating worker configuration');
    
    // Get the current logging configuration from the logger
    if (typeof window !== 'undefined' && window.logger) {
      const newLoggingConfig = window.logger.getConfig();
      stateManagerProxySingleton.updateWorkerLoggingConfig(newLoggingConfig);
    } else {
      log('warn', '[StateManagerModule] Window logger not available for worker config update');
    }
  }
}
