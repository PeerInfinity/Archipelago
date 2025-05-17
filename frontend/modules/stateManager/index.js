// Remove unused legacy imports
// import { StateManager } from './stateManager.js';
// import stateManagerSingleton from './stateManagerSingleton.js';

// Import the singleton proxy instance
import stateManagerProxySingleton from './stateManagerProxySingleton.js';
// REMOVE: import { createStateSnapshotInterface } from './stateManagerProxy.js';
import eventBus from '../../app/core/eventBus.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import settingsManager from '../../app/core/settingsManager.js';

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
  console.log('[StateManager Module] Registering...');

  // Register events published by the StateManagerProxy on the EventBus
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:rulesLoaded' // Confirms worker loaded initial rules and sent snapshot
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:snapshotUpdated' // Indicates a new state snapshot is available in the proxy cache
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:computationProgress' // Progress updates during long computations
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:workerQueueStatus' // Updates on the worker's internal queue status
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:workerError' // Non-critical errors reported by the worker during processing
  );
  registrationApi.registerEventBusPublisher(
    'stateManager',
    'stateManager:error' // Critical errors (e.g., worker init failure, communication failure)
  );
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

  // Register JSON Data Handler
  registrationApi.registerJsonDataHandler(
    'stateManagerRuntime', // Data Key
    {
      displayName: 'Game State (Inv/Checks)', // Checkbox Label
      defaultChecked: false, // Checkbox default state
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

  console.log('[StateManager Module] Registration complete.');
}

/**
 * Initialization function for the StateManager module.
 * Basic setup, stores the init API.
 * @param {string} moduleId - The unique ID for this module ('stateManager').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[StateManager Module] Initializing with priority ${priorityIndex}...`
  );
  // Store the full API for use in postInitialize
  initApi = initializationApi;

  // The proxy singleton instance is created automatically when this module is imported.
  // No explicit instance creation needed here.

  console.log(
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
  console.log(
    '[StateManager Module] Post-initializing... triggering initial proxy setup and rule load...'
  );
  const eventBus = initApi?.getEventBus(); // eventBus might still be needed for publishing
  if (!initApi) {
    // Removed eventBus from critical check if only used for publishing optional events
    console.error(
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

    if (!rulesConfigToUse) {
      console.log(
        '[StateManager Module] rulesConfig not in moduleSpecificConfig, fetching default_rules.json...'
      );
      const response = await fetch('./default_rules.json');
      if (!response.ok) {
        throw new Error(
          `HTTP error fetching default_rules.json! status: ${response.status}`
        );
      }
      jsonData = await response.json();
      rulesConfigToUse = jsonData;
      console.log(
        '[StateManager Module] Successfully fetched and parsed default_rules.json'
      );
    }

    const playerIds = Object.keys(rulesConfigToUse.player_names || {});
    const playerNames = rulesConfigToUse.player_names || {};

    if (!playerIdToUse) {
      if (playerIds.length === 0) {
        console.warn(
          '[StateManager Module] No players found in rules data. Defaulting to player 1.'
        );
        playerIdToUse = '1';
      } else {
        playerIdToUse = playerIds[0];
        console.log(
          `[StateManager Module] Auto-selected player ID from rules: ${playerIdToUse}`
        );
      }
    }
    playerInfo = {
      playerId: playerIdToUse,
      playerName: playerNames[playerIdToUse] || `Player ${playerIdToUse}`,
    };
    console.log(`[StateManager Module] Effective player info:`, playerInfo);

    if (rulesConfigToUse.game && !moduleSpecificConfig.gameId) {
      gameId = rulesConfigToUse.game;
      console.log(`[StateManager Module] Game ID from rules: ${gameId}`);
    }

    console.log(
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
    console.log(
      '[StateManager Module] StateManagerProxy.initialize() call completed.'
    );

    // The worker will now process the raw rulesConfig and send back the processed static data.
    // The proxy will cache this data upon receiving 'rulesLoadedConfirmation' from the worker.
    console.log(
      '[StateManager Module] Raw rulesConfig sent to worker via initialize(). Worker will process and return static data.'
    );

    console.log(
      '[StateManager Module] Calling StateManagerProxy.loadRules()...'
    );
    await stateManagerProxySingleton.loadRules(rulesConfigToUse, playerInfo);
    console.log(
      '[StateManager Module] StateManagerProxy.loadRules() call completed.'
    );

    if (eventBus) {
      eventBus.publish('stateManager:rawJsonDataLoaded', {
        source:
          rulesConfigToUse === jsonData
            ? 'default_rules.json'
            : 'moduleSpecificConfig',
        rawJsonData: rulesConfigToUse,
        selectedPlayerInfo: playerInfo,
      });
      console.log(
        '[StateManager Module] Published stateManager:rawJsonDataLoaded.'
      );
    } else {
      console.warn(
        '[StateManager Module] EventBus not available for rawJsonDataLoaded event.'
      );
    }
  } catch (error) {
    console.error(
      `[StateManager Module] CRITICAL ERROR during initial proxy/rule setup: ${error.message}`,
      error
    );
    if (eventBus) {
      eventBus.publish('stateManager:error', {
        message: `Failed to initialize proxy or load rules: ${error.message}`,
        isCritical: true,
      });
    } else {
      console.error(
        '[StateManager Module] EventBus not available to publish critical error.'
      );
    }
  }
}

async function handleUserLocationCheckForStateManager(eventData) {
  console.log(
    '[StateManagerModule] handleUserLocationCheckForStateManager received event:',
    JSON.parse(JSON.stringify(eventData))
  );
  console.log(
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
    console.log(
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
                    if (loc && !snapshot.flags.includes(loc.name)) {
                        const parentRegionName = loc.parent_region || loc.region;
                        const parentRegionReachable = snapshot.reachability[parentRegionName] === 'reachable' || snapshot.reachability[parentRegionName] === 'checked';
                        const ruleResult = loc.access_rule ? evaluateRule(loc.access_rule, snapshotInterface) : true;
                        if (parentRegionReachable && ruleResult) {
                            nextLocationToCheck = loc.name;
                            break;
                        }
                    }
                }
            } else { // Fallback: iterate all locations if no original order
                for (const loc of allLocations) {
                    if (!snapshot.flags.includes(loc.name)) {
                        const parentRegionName = loc.parent_region || loc.region;
                        const parentRegionReachable = snapshot.reachability[parentRegionName] === 'reachable' || snapshot.reachability[parentRegionName] === 'checked';
                        const ruleResult = loc.access_rule ? evaluateRule(loc.access_rule, snapshotInterface) : true;
                        if (parentRegionReachable && ruleResult) {
                            nextLocationToCheck = loc.name;
                            break;
                        }
                    }
                }
            }

            if (nextLocationToCheck) {
                console.log(`[StateManagerModule] Auto-checking next available location: ${nextLocationToCheck}`);
                await stateManagerProxySingleton.checkLocation(nextLocationToCheck);
            } else {
                console.log("[StateManagerModule] No accessible, unchecked locations found to auto-check.");
            }
        } else {
            console.warn("[StateManagerModule] Cannot auto-check next location: snapshot or static data not available.");
        }
        */
  }
}
