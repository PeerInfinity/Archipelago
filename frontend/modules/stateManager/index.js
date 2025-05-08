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
async function postInitialize(initializationApi) {
  console.log('[StateManager Module] Post-initializing...');
  // Ensure we have the full initApi stored from the initialize step
  const eventBus = initApi?.getEventBus();
  if (!initApi || !eventBus) {
    console.error(
      '[StateManager Module] Initialization API or EventBus not available in postInitialize. Cannot load rules.'
    );
    // Publish a critical error?
    return;
  }

  // Listen for the signal that all modules are post-initialized
  console.log(
    '[StateManager Module] Subscribing to init:postInitComplete on eventBus...'
  );
  eventBus.subscribe('init:postInitComplete', async () => {
    console.log(
      '[StateManager Module] Received init:postInitComplete, triggering load of default rules...'
    );

    // --- RESTRUCTURED LOGIC --- >
    let jsonData = null;
    let playerInfo = null;
    let itemData = null;
    let groupData = null;
    let regionData = null;
    const aggregatedLocationData = {};
    const aggregatedExitData = {};
    const trueOriginalLocationOrder = []; // New array for true original order
    const trueOriginalExitOrder = []; // New array for true original order
    const trueOriginalRegionOrder = []; // New array for true original region order

    try {
      // 1. Fetch Rules JSON
      console.log(
        '[StateManager Module] Attempting to load default_rules.json...'
      );
      const response = await fetch('./default_rules.json');
      if (!response.ok) {
        throw new Error(
          `HTTP error fetching default_rules.json! status: ${response.status}`
        );
      }
      jsonData = await response.json();
      console.log(
        '[StateManager Module] Successfully fetched default_rules.json'
      );

      // 2. Select Player
      const playerIds = Object.keys(jsonData.player_names || {});
      const playerNames = jsonData.player_names || {};
      let selectedPlayerId = null;

      if (playerIds.length === 0) {
        throw new Error('No players found in the JSON data.');
      } else if (playerIds.length === 1) {
        selectedPlayerId = playerIds[0];
        console.log(
          `[StateManager Module] Auto-selected single player ID: ${selectedPlayerId}`
        );
      } else {
        selectedPlayerId = playerIds[0]; // Default to first for now
        console.warn(
          `[StateManager Module] Multiple players found, auto-selecting first ID: ${selectedPlayerId}. Implement proper selection.`
        );
      }
      playerInfo = {
        playerId: selectedPlayerId,
        playerName:
          playerNames[selectedPlayerId] || `Player ${selectedPlayerId}`,
        team: 0,
      };
      console.log(`[StateManager Module] Selected player info:`, playerInfo);

      // 3. Extract Core Static Data
      const playerKey = playerInfo.playerId;
      itemData = jsonData.items?.[playerKey];
      groupData = jsonData.item_groups;
      regionData = jsonData.regions?.[playerKey] ?? jsonData.regions;

      if (!itemData) {
        console.warn(
          '[StateManager Module] itemData not found for player',
          playerKey
        );
        // Decide if this is critical? Maybe not if default items exist?
      }
      if (!groupData) {
        console.warn('[StateManager Module] groupData not found globally.');
        // Decide if this is critical?
      }
      if (!regionData) {
        console.warn(
          '[StateManager Module] regionData not found for player or globally',
          playerKey
        );
        // This IS critical for aggregation
        throw new Error('Region data is missing, cannot proceed.');
      }

      // 4. Aggregate Locations and Exits (if regionData exists)
      console.log(
        '[StateManager Module] Aggregating locations/exits from regions...'
      );
      for (const regionName in regionData) {
        trueOriginalRegionOrder.push(regionName);
        const region = regionData[regionName];
        // Locations
        if (region && region.locations) {
          // Assuming region.locations is an array or an object that iterates in original file order
          for (const locationKey in region.locations) {
            const location = region.locations[locationKey];
            const uniqueLocationName = location.name;

            if (!aggregatedLocationData.hasOwnProperty(uniqueLocationName)) {
              trueOriginalLocationOrder.push(uniqueLocationName); // Add to true order list only once
            }
            if (aggregatedLocationData.hasOwnProperty(uniqueLocationName)) {
              console.warn(
                `[StateManager Aggregation] Overwriting location key: ${uniqueLocationName} (New region: ${regionName}, Existing region: ${aggregatedLocationData[uniqueLocationName].parentRegion})`
              );
            }

            aggregatedLocationData[uniqueLocationName] = {
              ...location,
              parent_region: regionName,
            };
          }
        }
        // Exits
        if (region && region.exits) {
          // Assuming region.exits is an array or an object that iterates in original file order
          for (const exitKey in region.exits) {
            const exit = region.exits[exitKey];
            const uniqueExitName = exit.name; // Assuming exits also have a unique .name property for their key in aggregatedExitData

            if (!aggregatedExitData.hasOwnProperty(uniqueExitName)) {
              trueOriginalExitOrder.push(uniqueExitName); // Add to true order list only once
            }
            if (aggregatedExitData.hasOwnProperty(uniqueExitName)) {
              // Optional: Add overwrite check for exits too if needed
              // if (aggregatedExitData.hasOwnProperty(uniqueExitName)) {
              //    console.warn(...);
              // }
            }

            aggregatedExitData[uniqueExitName] = {
              ...exit,
              parentRegion: regionName,
              connectedRegion: exit.connected_region,
            };
          }
        }
      }
      console.log(
        `[StateManager Module] Aggregated ${
          Object.keys(aggregatedLocationData).length
        } locations and ${Object.keys(aggregatedExitData).length} exits.`
      );
      console.log(
        `[StateManager Module] True original location order captured: ${trueOriginalLocationOrder.length} items`
      );
      console.log(
        `[StateManager Module] True original exit order captured: ${trueOriginalExitOrder.length} items`
      );
      console.log(
        `[StateManager Module] True original region order captured: ${trueOriginalRegionOrder.length} items`
      );

      // 5. Cache ALL Static Data on Proxy
      console.log('[StateManager Module] Caching static data on proxy...');
      stateManagerProxySingleton.setStaticData(
        itemData, // Might be null/undefined, proxy should handle
        groupData, // Might be null/undefined
        aggregatedLocationData,
        regionData, // Original regions
        aggregatedExitData,
        trueOriginalLocationOrder, // Pass the true original order array
        trueOriginalExitOrder, // Pass the true original order array
        trueOriginalRegionOrder // Pass the true original region order array
      );
      console.log(
        '[StateManager Module] Static data successfully cached on proxy.'
      );

      // 6. Send Rules to Worker (only after static data is cached)
      console.log('[StateManager Module] Sending rules to worker via proxy...');
      await stateManagerProxySingleton.loadRules(jsonData, playerInfo);
      console.log(
        '[StateManager Module] Worker confirmed rules loaded (proxy loadRules resolved).'
      );

      // 7. Publish Raw Data (Optional)
      eventBus.publish('stateManager:rawJsonDataLoaded', {
        source: 'default_rules.json',
        rawJsonData: jsonData,
        selectedPlayerInfo: playerInfo,
      });
      console.log(
        '[StateManager Module] Published stateManager:rawJsonDataLoaded.'
      );
    } catch (error) {
      // Catch ANY error during the fetch/process/cache/load sequence
      console.error(
        `[StateManager Module] CRITICAL ERROR during rule loading/processing: ${error.message}`,
        error
      );
      eventBus.publish('stateManager:error', {
        message: `Failed to load/process default rules: ${error.message}`,
        isCritical: true,
      });
    }
    // --- END RESTRUCTURED LOGIC --- >
  });
}
