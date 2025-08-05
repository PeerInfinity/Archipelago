// Initial startup message using console directly to avoid circular dependency
// console.log('[stateManagerWorker] Worker starting...');

// RACE CONDITION FIX: Command queue for serialized command processing
let commandQueue = [];
let isProcessingCommand = false;

// ADDED: Top-level error handler for the worker
self.onerror = function (message, source, lineno, colno, error) {
  // Use console directly to avoid circular dependency with log function
  console.error('[stateManagerWorker] Uncaught Worker Error:', {
    message,
    source,
    lineno,
    colno,
    error,
  });
  try {
    self.postMessage({
      type: 'workerGlobalError',
      error: {
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        errorMessage: error ? error.message : 'N/A',
        errorStack: error ? error.stack : 'N/A',
      },
    });
  } catch (e) {
    console.error(
      '[stateManagerWorker] FATAL: Could not even postMessage from self.onerror',
      e
    );
  }
  return true; // Prevent default handling
};

// ADDED: Immediate ping to confirm worker script execution and basic postMessage
// try {
//   self.postMessage({
//     type: 'workerDebugPing',
//     message: 'Worker script started and postMessage functional.',
//   });
// } catch (e) {
//   console.error(
//     '[stateManagerWorker] FATAL: Could not send initial debug ping:',
//     e
//   );
// }

// Import the StateManager class
import { StateManager } from './stateManager.js';
// Import the actual rule evaluation function
import { evaluateRule } from '../shared/ruleEngine.js';
// Import shared commands instead of StateManagerProxy to avoid window references
import { STATE_MANAGER_COMMANDS } from './stateManagerCommands.js';
// Import universal logger
import { initializeWorkerLogger, updateWorkerLoggerConfig, createUniversalLogger, workerLoggerInstance } from '../../app/core/universalLogger.js';

// Initialize worker logger with basic settings
initializeWorkerLogger({
  defaultLevel: 'WARN',
  categoryLevels: {
    stateManagerWorker: 'WARN',
    StateManager: 'WARN',
    stateManager: 'WARN',
    ALTTPState: 'WARN',
  },
  enabled: true,
});

// Create logger for this worker module
const logger = createUniversalLogger('stateManagerWorker');

// Legacy log function for backward compatibility (can be removed once all calls are updated)
function log(level, message, ...data) {
  logger[level](message, ...data);
}

// NOTE: ALTTPState and game-specific helpers are imported
// and instantiated *inside* StateManager.js constructor or used directly.

// Dependencies loaded message using console directly to avoid circular dependency
// console.log(
//   '[stateManagerWorker] Dependencies loaded (StateManager, evaluateRule).'
// );

let stateManagerInstance = null;
let workerConfig = null;
let workerInitialized = false;
const preInitQueue = [];

// Function to set the communication channel on the instance
function setupCommunicationChannel(instance) {
  instance.setCommunicationChannel((message) => {
    try {
      self.postMessage(message);
    } catch (error) {
      log(
        'error',
        '[stateManagerWorker] Error posting message back to main thread:',
        error,
        message
      );
      try {
        self.postMessage({
          type: 'error',
          message: `Worker failed to post original message: ${error.message}`,
        });
      } catch (finalError) {
        log(
          'error',
          '[stateManagerWorker] Failed to post even the error message back:',
          finalError
        );
      }
    }
  });
}

// RACE CONDITION FIX: Command queue processing functions
async function processCommandQueue() {
  if (isProcessingCommand || commandQueue.length === 0) {
    return;
  }
  
  isProcessingCommand = true;
  
  while (commandQueue.length > 0) {
    const messageData = commandQueue.shift();
    try {
      await handleMessage(messageData);
    } catch (error) {
      log('error', '[stateManagerWorker] Error processing queued command:', error);
      // Send error response if this was a query
      if (messageData.queryId) {
        self.postMessage({
          type: 'queryResponse',
          queryId: messageData.queryId,
          error: error.message,
        });
      }
    }
  }
  
  isProcessingCommand = false;
}

// RACE CONDITION FIX: Original message handler logic moved to separate function
async function handleMessage(message) {
  log('info', '[stateManagerWorker handleMessage] Processing message:', message);

  if (!message || !message.command) {
    log(
      'warn',
      '[stateManagerWorker onmessage] Received invalid message structure:',
      message
    );
    return;
  }

  try {
    switch (message.command) {
      case 'initialize':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing initialize command...'
        );
        workerConfig = message.config;
        if (!workerConfig) {
          throw new Error('Initialization failed: workerConfig is missing.');
        }

        // Configure worker logger with settings from main thread
        if (workerConfig.loggingConfig) {
          updateWorkerLoggerConfig(workerConfig.loggingConfig);
          logger.info(
            `Worker logger configured. Default: ${
              workerConfig.loggingConfig.defaultLevel || 'N/A'
            }, StateManager: ${
              workerConfig.loggingConfig.categoryLevels?.StateManager || 'N/A'
            }`
          );
        }

        // Pass the configured logger to StateManager
        stateManagerInstance = new StateManager(evaluateRule, workerLoggerInstance);
        setupCommunicationChannel(stateManagerInstance);
        // Pass initial settings if available in workerConfig
        if (workerConfig.settings) {
          stateManagerInstance.applySettings(workerConfig.settings);
        }
        workerInitialized = true; // Mark as initialized
        log(
          'info',
          '[stateManagerWorker onmessage] Worker initialized successfully. Config:',
          workerConfig
        );
        self.postMessage({
          type: 'workerInitializedConfirmation',
          message: 'Worker has been initialized.',
          configEcho: {
            playerId: workerConfig.playerId,
            rulesDataIsPresent: !!workerConfig.rulesData,
            settingsArePresent: !!workerConfig.settings,
          },
        });
        // Process any pre-init queue messages if we had such a mechanism
        // For now, direct initialization is assumed.
        break;

      case STATE_MANAGER_COMMANDS.BEGIN_BATCH_UPDATE: // Using COMMANDS object
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot begin batch update.');
        }
        // Payload might indicate if region computation should be deferred.
        // For now, assume the default deferral behavior in StateManager.beginBatchUpdate()
        // If payload contains { deferRegionComputation: true/false }, pass it along:
        // stateManagerInstance.beginBatchUpdate(message.payload?.deferRegionComputation);
        stateManagerInstance.beginBatchUpdate(
          message.payload?.deferRegionComputation !== undefined
            ? message.payload.deferRegionComputation
            : true
        );
        // No explicit response needed, batching is an internal state change for the worker.
        break;

      case STATE_MANAGER_COMMANDS.COMMIT_BATCH_UPDATE: // Using COMMANDS object
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot commit batch update.'
          );
        }
        stateManagerInstance.commitBatchUpdate();
        // commitBatchUpdate internally sends a snapshot update if changes occurred.
        break;

      case 'updateLogConfig':
        if (message.payload) {
          updateWorkerLoggerConfig(message.payload);
          logger.info(
            `Worker logging configuration updated. Default: ${
              message.payload.defaultLevel || 'N/A'
            }, StateManager: ${
              message.payload.categoryLevels?.StateManager || 'N/A'
            }`
          );
        }
        break;

      case 'applyRuntimeState':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing applyRuntimeState command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot apply runtime state.'
          );
        }
        if (!message.payload) {
          throw new Error('Invalid payload for applyRuntimeState command.');
        }
        stateManagerInstance.applyRuntimeState(message.payload);
        // applyRuntimeState in StateManager should handle sending a snapshot update if necessary
        break;

      case 'loadRules':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing loadRules command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot load rules.');
        }
        if (
          !message.payload ||
          !message.payload.rulesData ||
          !message.payload.playerInfo ||
          !message.payload.playerInfo.playerId
        ) {
          throw new Error('Invalid payload for loadRules command.');
        }
        const rulesData = message.payload.rulesData;
        const playerId = String(message.payload.playerInfo.playerId);

        await stateManagerInstance.loadFromJSON(rulesData, playerId);
        const initialSnapshot = stateManagerInstance.getSnapshot();

        // MODIFIED: Construct static data object directly from instance properties
        const workerStaticGameData = {
          items: stateManagerInstance.itemData,
          groups: stateManagerInstance.groupData, // This should now be the processed array of strings
          locations: stateManagerInstance.locations,
          regions: stateManagerInstance.regions,
          exits: stateManagerInstance.exits, // Ensure exits are included
          dungeons: stateManagerInstance.dungeons, // ADDED: Include dungeons data
          originalLocationOrder: stateManagerInstance.originalLocationOrder, // Ensure orders are included
          originalExitOrder: stateManagerInstance.originalExitOrder,
          originalRegionOrder: stateManagerInstance.originalRegionOrder,
          // ID mappings for location and item names to server IDs
          locationNameToId: stateManagerInstance.locationNameToId,
          itemNameToId: stateManagerInstance.itemNameToId,
          // Add other static data pieces if needed by the proxy or UI later
        };

        log(
          'info',
          '[stateManagerWorker onmessage] Rules loaded. About to postMessage. WorkerStaticGameData details:'
        );
        log(
          'info',
          '  workerStaticGameData keys:',
          Object.keys(workerStaticGameData)
        );
        log(
          'info',
          '  workerStaticGameData.originalExitOrder type:',
          typeof workerStaticGameData.originalExitOrder,
          'Is Array:',
          Array.isArray(workerStaticGameData.originalExitOrder),
          'Length:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.length
            : 'N/A'
        );
        log(
          'info',
          '  Sample originalExitOrder from workerStaticGameData:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.slice(0, 5)
            : 'N/A'
        );

        log(
          'info',
          '[stateManagerWorker onmessage] Rules loaded. Posting confirmation with snapshot and full newStaticData.'
        );
        self.postMessage({
          type: 'rulesLoadedConfirmation',
          initialSnapshot: initialSnapshot,
          gameId: stateManagerInstance.gameId,
          playerId: playerId,
          newStaticData: workerStaticGameData, // Send the entire new static data object
        });
        break;

      case 'ping': // New case for ping command
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot process ping.');
        }
        // Construct the object that StateManager.ping expects
        stateManagerInstance.ping({
          queryId: message.queryId, // Pass the queryId from the incoming message
          payload: message.payload, // Pass the actual dataToEcho (e.g., 'uiSimSyncAfterClick')
        });
        // The ping method itself will post the 'pingResponse' message
        break;

      case 'addItemToInventory':
        if (!stateManagerInstance) {
          log(
            'error',
            '[stateManagerWorker] StateManager not initialized for addItemToInventory'
          );
          break;
        }
        try {
          const { item, quantity } = message.payload;
          if (typeof item === 'string') {
            stateManagerInstance.addItemToInventory(item, quantity || 1);
            // stateManagerInstance.addItemToInventory already sends a snapshot update
          } else {
            log(
              'error',
              '[stateManagerWorker] Invalid payload for addItemToInventory: item name missing or not a string.',
              message.payload
            );
          }
        } catch (e) {
          log(
            'error',
            '[stateManagerWorker] Error processing addItemToInventory:',
            e
          );
          // Optionally send an error back
        }
        break;

      case 'removeItemFromInventory':
        if (!stateManagerInstance) {
          log(
            'error',
            '[stateManagerWorker] StateManager not initialized for removeItemFromInventory'
          );
          break;
        }
        try {
          const { item, quantity } = message.payload;
          if (typeof item === 'string') {
            // Check if StateManager has a removeItemFromInventory method
            if (typeof stateManagerInstance.removeItemFromInventory === 'function') {
              stateManagerInstance.removeItemFromInventory(item, quantity || 1);
              log(
                'info',
                `[stateManagerWorker] Removed ${quantity || 1} of "${item}" from inventory`
              );
            } else {
              log(
                'error',
                '[stateManagerWorker] StateManager.removeItemFromInventory method not available'
              );
            }
          } else {
            log(
              'error',
              '[stateManagerWorker] Invalid payload for removeItemFromInventory: item name missing or not a string.',
              message.payload
            );
          }
        } catch (e) {
          log(
            'error',
            '[stateManagerWorker] Error processing removeItemFromInventory:',
            e
          );
          // Optionally send an error back
        }
        break;

      // Basic query handling for commands that expect a response via queryId
      case 'getFullSnapshot':
      case 'getFullSnapshotQuery':
      case 'checkLocation':
      case 'evaluateRuleRequest':
      case 'getStaticData':
        if (!workerInitialized || !stateManagerInstance) {
          log(
            'error',
            `[SMW] ${message.command} received but worker not ready.`
          );
          if (message.queryId) {
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              error: 'Worker not initialized',
            });
          }
          return;
        }

        // LOG 1: Confirm command and presence of queryId
        log(
          'info',
          `[SMW] Grouped command dispatch. Command: ${
            message.command
          }. Has queryId: ${!!message.queryId}. Payload type: ${typeof message.payload}`
        );
        if (message.payload && typeof message.payload === 'object') {
          log(
            'info',
            `[SMW] Payload locationName: ${message.payload.locationName}`
          );
        }

        if (message.queryId) {
          // LOG 2: Inside if (message.queryId)
          log(
            'info',
            `[SMW] Entered message.queryId block. Command: ${message.command}`
          );

          if (message.command === 'getFullSnapshot' || message.command === 'getFullSnapshotQuery') {
            log('info', `[SMW] Matched command: ${message.command}`);
            const snapshot = stateManagerInstance.getSnapshot();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: snapshot,
            });
          } else if (message.command === 'getStaticData') {
            log('info', `[SMW] Matched command: getStaticData`);
            const staticData = stateManagerInstance.getStaticGameData();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: staticData,
            });
          } else if (message.command === 'checkLocation') {
            // LOG 3: Matched command checkLocation
            log(
              'info',
              `[SMW] Matched command: checkLocation. Current payload:`,
              message.payload
                ? JSON.stringify(message.payload)
                : 'undefined/null'
            );
            try {
              // LOG 4: Start of try block for checkLocation
              log('info', `[SMW] checkLocation: try block entered.`);
              const locationName = message.payload.locationName;
              const addItems = message.payload.addItems !== undefined ? message.payload.addItems : true;
              log(
                'info',
                `[SMW] checkLocation: locationName extracted: "${locationName}" (type: ${typeof locationName}), addItems: ${addItems}`
              );

              if (typeof locationName !== 'string') {
                log(
                  'error',
                  `[SMW] checkLocation: locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation: expected a string locationName in payload.locationName.'
                );
              }

              // LOG 5: Before calling instance.checkLocation
              log(
                'info',
                `[SMW] checkLocation: About to call stateManagerInstance.checkLocation("${locationName}", ${addItems})`
              );
              stateManagerInstance.checkLocation(locationName, addItems);
              // LOG 6: After calling instance.checkLocation
              log(
                'info',
                `[SMW] checkLocation: stateManagerInstance.checkLocation completed for "${locationName}".`
              );

              // Query response still sent if queryId was present
              log(
                'info',
                `[SMW] checkLocation: Sending success queryResponse for queryId ${message.queryId}`
              );
              self.postMessage({
                type: 'queryResponse',
                queryId: message.queryId,
                result: {
                  success: true,
                  locationName: locationName,
                  status: 'processed_by_state_manager',
                },
              });
            } catch (error) {
              // LOG 7: In catch block for checkLocation
              log(
                'error',
                `[SMW] checkLocation: CATCH block. Error for payload ${
                  message.payload
                    ? JSON.stringify(message.payload)
                    : 'undefined/null'
                }:`,
                error.message,
                error.stack
              );
              log(
                'error',
                `[SMW] checkLocation: Sending error queryResponse for queryId ${message.queryId}`
              );
              self.postMessage({
                type: 'queryResponse',
                queryId: message.queryId,
                error: `Error processing checkLocation: ${error.message}`,
              });
            }

          } else {
            // Presumed 'evaluateRuleRequest'
            log(
              'info',
              `[SMW] Command ${message.command} in queryId block, but not getFullSnapshot, getStaticData, or checkLocation.`
            );
            // This is a simplification for now to get the init/loadRules flow working.
            log(
              'warn',
              `[stateManagerWorker] Command ${message.command} needs full handler beyond this basic switch.`
            );
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: {
                status: 'acknowledged_needs_full_handler',
                command: message.command,
              },
            });
          }
        } else {
          // queryId was NOT present
          if (message.command === 'checkLocation') {
            // Process checkLocation without warning, as this is an expected path.
            try {
              const locationName = message.payload.locationName;
              const addItems = message.payload.addItems !== undefined ? message.payload.addItems : true;
              if (typeof locationName !== 'string') {
                log(
                  'error',
                  `[SMW] checkLocation (no queryId): locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation (no queryId): expected a string locationName in payload.locationName.'
                );
              }
              log(
                'info',
                `[SMW] checkLocation (no queryId): About to call stateManagerInstance.checkLocation("${locationName}", ${addItems})`
              );
              stateManagerInstance.checkLocation(locationName, addItems);
              log(
                'info',
                `[SMW] checkLocation (no queryId): stateManagerInstance.checkLocation completed for "${locationName}".`
              );
            } catch (error) {
              log(
                'error',
                `[SMW] checkLocation (no queryId): CATCH block. Error for payload ${
                  message.payload
                    ? JSON.stringify(message.payload)
                    : 'undefined/null'
                }:`,
                error.message,
                error.stack
              );
            }

          } else {
            // For other commands without queryId in this grouped case, issue the general warning.
            log(
              'warn',
              `[SMW] Command ${message.command} in grouped case did NOT have a queryId. This is unexpected for these commands if a response is awaited.`
            );
          }
        }
        break;

      // Add new command handler here
      case 'SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT':
        if (!stateManagerInstance) {
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: 'StateManager instance not available in worker.',
          });
          break;
        }
        try {
          // It's crucial that initializeInventoryForTest does NOT compute/send its own snapshot here
          stateManagerInstance.initializeInventoryForTest(
            message.payload.requiredItems,
            message.payload.excludedItems
          );
          stateManagerInstance.computeReachableRegions(); // Ensure reachability is updated for this inventory
          const snapshot = stateManagerInstance.getSnapshot();
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: snapshot,
          });
        } catch (e) {
          log(
            'error',
            '[StateManagerWorker] Error during SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT:',
            e
          );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: e.message,
          });
        }
        break;

      case STATE_MANAGER_COMMANDS.EVALUATE_ACCESSIBILITY_FOR_TEST:
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot evaluate test.');
        }
        if (!message.payload || !message.payload.locationName) {
          throw new Error(
            'Invalid payload for EVALUATE_ACCESSIBILITY_FOR_TEST command.'
          );
        }
        if (!message.queryId) {
          throw new Error(
            'Missing queryId for EVALUATE_ACCESSIBILITY_FOR_TEST command.'
          );
        }

        try {
          const { locationName, requiredItems, excludedItems } =
            message.payload;
          const isAccessible =
            stateManagerInstance.evaluateAccessibilityForTest(
              locationName,
              requiredItems,
              excludedItems
            );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: { result: isAccessible },
          });
        } catch (evalError) {
          log(
            'error',
            '[StateManagerWorker] Error during EVALUATE_ACCESSIBILITY_FOR_TEST:',
            evalError
          );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Error evaluating test: ${evalError.message}`,
          });
        }
        break;

      case STATE_MANAGER_COMMANDS.APPLY_TEST_INVENTORY_AND_EVALUATE:
        log(
          'info',
          '[stateManagerWorker onmessage] Processing APPLY_TEST_INVENTORY_AND_EVALUATE command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot apply test inventory and evaluate.'
          );
        }
        if (!message.payload || !message.payload.locationName) {
          throw new Error(
            'Invalid payload for APPLY_TEST_INVENTORY_AND_EVALUATE command.'
          );
        }
        if (!message.queryId) {
          // This command specifically needs a queryId to send the result back to the correct promise.
          throw new Error(
            'Missing queryId for APPLY_TEST_INVENTORY_AND_EVALUATE command.'
          );
        }

        try {
          const {
            locationName,
            requiredItems = [],
            excludedItems = [],
          } = message.payload;

          // Start batch mode to prevent multiple cache invalidations and snapshot updates
          stateManagerInstance.beginBatchUpdate(true);

          // 1. Clear current inventory and state for the test
          stateManagerInstance.clearInventory();

          // 2. Populate base inventory, considering excludedItems
          const itemPool = stateManagerInstance.getItemPoolCounts(); // Assumes getter for itempool_counts
          const allItemData = stateManagerInstance.getAllItemData(); // Assumes getter for all item data

          log(
            'info',
            '[SMW APPLY_TEST] Item Pool for test:',
            JSON.stringify(itemPool)
          );
          log(
            'info',
            '[SMW APPLY_TEST] Excluded items for test:',
            JSON.stringify(excludedItems)
          );

          // Populate base inventory only if there are excluded items or required items
          // If both requiredItems and excludedItems are empty, start with empty inventory
          const shouldPopulateBaseInventory =
            excludedItems.length > 0 || requiredItems.length > 0;

          if (shouldPopulateBaseInventory) {
            // Create a combined exclusion list that includes both explicit exclusions and required items
            // This prevents double-adding items that are both in the item pool and in the required items list
            const combinedExclusions = [...excludedItems];
            requiredItems.forEach((item) => {
              const itemName = typeof item === 'string' ? item : item.name;
              if (itemName && !combinedExclusions.includes(itemName)) {
                combinedExclusions.push(itemName);
              }
            });

            if (itemPool && Object.keys(itemPool).length > 0) {
              log(
                'info',
                '[SMW APPLY_TEST] Using itempool_counts for base inventory (respecting exclusions and required items).'
              );
              Object.entries(itemPool).forEach(([itemName, count]) => {
                if (itemName.startsWith('__')) return; // Skip special config values like __max_progressive_bottle
                if (combinedExclusions.includes(itemName)) return; // Skip excluded items AND required items
                if (
                  itemName.includes('Bottle') &&
                  combinedExclusions.includes('AnyBottle')
                )
                  return;

                const itemDef = allItemData ? allItemData[itemName] : null;
                if (itemDef && (itemDef.event || itemDef.type === 'Event'))
                  return; // Skip event items

                for (let i = 0; i < count; i++) {
                  stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
                }
              });
            } else if (allItemData) {
              log(
                'info',
                '[SMW APPLY_TEST] No itempool_counts available. Using all non-event items for base inventory (respecting exclusions and required items).'
              );
              Object.keys(allItemData).forEach((itemName) => {
                if (combinedExclusions.includes(itemName)) return; // Skip excluded items AND required items
                if (
                  itemName.includes('Bottle') &&
                  combinedExclusions.includes('AnyBottle')
                )
                  return;

                const itemDef = allItemData[itemName];
                if (itemDef && (itemDef.event || itemDef.type === 'Event'))
                  return; // Skip event items
                stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
              });
            } else {
              log(
                'warn',
                '[SMW APPLY_TEST] No itemPool or allItemData available to derive base inventory.'
              );
            }
          } else {
            log(
              'info',
              '[SMW APPLY_TEST] Both requiredItems and excludedItems are empty. Starting with empty inventory.'
            );
          }

          // 3. Handle progressive items that might have been excluded
          // This ensures that if a base progressive item (e.g., "ProgressiveSword") is excluded,
          // its constituent items (e.g., "FighterSword", "MasterSword") are also not present
          // if they were part of the base set.
          if (excludedItems.length > 0 && stateManagerInstance.inventory) {
            excludedItems.forEach((excludedItemName) => {
              if (
                stateManagerInstance.inventory.isProgressiveBaseItem(
                  excludedItemName
                )
              ) {
                const providedItems =
                  stateManagerInstance.inventory.getProgressiveProvidedItems(
                    excludedItemName
                  );
                providedItems.forEach((providedItemName) => {
                  // If the inventory somehow has this item after the base population, remove it.
                  // This is more of a safeguard; ideally, they wouldn't be added if the base is excluded.
                  // stateManagerInstance.removeItemFromInventory(providedItemName, stateManagerInstance.inventory.count(providedItemName), true);
                  // For now, we rely on the initial exclusion. More complex progressive removal might be needed
                  // if the base set could add individual progressive stages.
                  // The primary goal here is that `addItemToInventory` for the *required* progressive item later
                  // will correctly set its stage.
                });
              }
            });
          }

          // 4. Add required items
          if (requiredItems.length > 0) {
            requiredItems.forEach((item) => {
              const itemName = typeof item === 'string' ? item : item.name;
              const quantity =
                typeof item === 'string' ? 1 : item.quantity || 1;
              if (itemName) {
                for (let i = 0; i < quantity; i++) {
                  stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
                }
              }
            });
          }

          // 5. Commit batch update - this will trigger cache invalidation, region computation, and snapshot update
          stateManagerInstance.commitBatchUpdate();

          // 6. Get the new full snapshot
          const newSnapshot = stateManagerInstance.getSnapshot();
          const newInventory =
            newSnapshot.inventory || stateManagerInstance.getInventory(); // Prefer snapshot, fallback to direct getter

          // 7. Get the specific accessibility result for the location under test
          let locationAccessibilityResult = false;
          // The result should be determined based on the newSnapshot
          if (newSnapshot.locations && newSnapshot.locations[locationName]) {
            locationAccessibilityResult =
              newSnapshot.locations[locationName].accessible;
          } else {
            // Find the location object and evaluate accessibility directly
            try {
              const locationObject = stateManagerInstance.locations.find(
                (loc) => loc.name === locationName
              );
              if (locationObject) {
                locationAccessibilityResult =
                  stateManagerInstance.isLocationAccessible(locationObject);
              } else {
                log(
                  'warn',
                  `[stateManagerWorker] Location object not found: ${locationName}`
                );
                locationAccessibilityResult = false;
              }
            } catch (locEvalError) {
              log(
                'error',
                `[SMW] Error explicitly evaluating ${locationName} after inventory set:`,
                locEvalError
              );
              locationAccessibilityResult = false; // Default to false on error
            }
          }

          log(
            'info',
            `[stateManagerWorker] APPLY_TEST_INVENTORY_AND_EVALUATE for "${locationName}" - Evaluated Accessibility: ${locationAccessibilityResult}`
          );

          // 8. Post back the response via queryId
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: {
              newSnapshot: newSnapshot,
              newInventory: newInventory,
              locationAccessibilityResult: locationAccessibilityResult,
              originalLocationName: locationName, // Echo back for clarity in proxy
            },
          });
        } catch (testEvalError) {
          log(
            'error',
            '[StateManagerWorker] Error during APPLY_TEST_INVENTORY_AND_EVALUATE logic:',
            testEvalError
          );

          // Ensure batch mode is properly cleaned up if an error occurs
          if (stateManagerInstance && stateManagerInstance._batchMode) {
            try {
              stateManagerInstance.commitBatchUpdate();
            } catch (batchError) {
              log(
                'error',
                '[StateManagerWorker] Error cleaning up batch mode after test error:',
                batchError
              );
            }
          }

          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Error processing APPLY_TEST_INVENTORY_AND_EVALUATE: ${testEvalError.message}`,
          });
        }
        break;

      case 'clearStateAndReset':
        log('debug', '[Worker] Received clearStateAndReset command');
        if (stateManagerInstance) {
          stateManagerInstance.clearState({ recomputeAndSendUpdate: true });
        }
        break;

      case 'setAutoCollectEventsConfig':
        log(
          'debug',
          '[Worker] Received setAutoCollectEventsConfig command',
          message.payload
        );
        if (
          stateManagerInstance &&
          message.payload &&
          typeof message.payload.enabled === 'boolean'
        ) {
          stateManagerInstance.setAutoCollectEventsConfig(
            message.payload.enabled
          );
        } else {
          log(
            'warn',
            '[Worker] Invalid payload for setAutoCollectEventsConfig:',
            message.payload
          );
        }
        break;

      case 'updateWorkerLogConfig':
        log(
          'debug',
          '[Worker] Received updateWorkerLogConfig command',
          message.payload
        );
        if (message.payload && typeof message.payload.config === 'object') {
          if (typeof self.setWorkerLogConfig === 'function') {
            self.setWorkerLogConfig(message.payload.config);
            log('info', '[Worker] Updated worker log config.');
          } else {
            log('warn', '[Worker] self.setWorkerLogConfig is not a function.');
          }
        } else {
          log(
            'warn',
            '[Worker] Invalid payload for updateWorkerLogConfig:',
            message.payload
          );
        }
        break;

      default:
        log(
          'warn',
          '[stateManagerWorker onmessage] Received unhandled command:',
          message.command,
          message
        );
        if (message.queryId) {
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Unknown command: ${message.command}`,
          });
        }
    }
  } catch (error) {
    log(
      'error',
      '[stateManagerWorker onmessage] Error processing command:',
      message.command,
      error
    );
    self.postMessage({
      type: 'workerError',
      command: message.command,
      errorMessage: error.message,
      errorStack: error.stack,
      queryId: message.queryId,
    });
  }
}

// RACE CONDITION FIX: New queue-based message handler
self.onmessage = async function (e) {
  const message = e.data;
  log('info', '[stateManagerWorker onmessage] Queuing message:', message);
  
  commandQueue.push(message);
  processCommandQueue();
};

// --- END: Queue-based onmessage Handler ---

// Worker ready message using console directly to avoid circular dependency
// console.log(
//   '[stateManagerWorker] Worker is ready to receive messages via new onmessage handler.'
// );
