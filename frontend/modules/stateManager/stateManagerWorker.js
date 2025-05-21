console.log('[stateManagerWorker] Worker starting...');

// ADDED: Top-level error handler for the worker
self.onerror = function (message, source, lineno, colno, error) {
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
import { evaluateRule } from './ruleEngine.js';
// Import StateManagerProxy to access its COMMANDS enum
import { StateManagerProxy } from './stateManagerProxy.js';
// NOTE: ALTTPInventory, ALTTPState, ALTTPHelpers are imported
// and instantiated *inside* StateManager.js constructor or used directly.

console.log(
  '[stateManagerWorker] Dependencies loaded (StateManager, evaluateRule).'
);

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
      console.error(
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
        console.error(
          '[stateManagerWorker] Failed to post even the error message back:',
          finalError
        );
      }
    }
  });
}

// --- Restored and Simplified onmessage Handler ---
self.onmessage = async function (e) {
  const message = e.data;
  console.log('[stateManagerWorker onmessage] Received message:', message);

  if (!message || !message.command) {
    console.warn(
      '[stateManagerWorker onmessage] Received invalid message structure:',
      message
    );
    return;
  }

  try {
    switch (message.command) {
      case 'initialize':
        console.log(
          '[stateManagerWorker onmessage] Processing initialize command...'
        );
        workerConfig = message.config;
        if (!workerConfig) {
          throw new Error('Initialization failed: workerConfig is missing.');
        }
        stateManagerInstance = new StateManager(evaluateRule);
        setupCommunicationChannel(stateManagerInstance);
        // Pass initial settings if available in workerConfig
        if (workerConfig.settings) {
          stateManagerInstance.applySettings(workerConfig.settings);
        }
        workerInitialized = true; // Mark as initialized
        console.log(
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

      case StateManagerProxy.COMMANDS.BEGIN_BATCH_UPDATE: // Using COMMANDS object
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

      case StateManagerProxy.COMMANDS.COMMIT_BATCH_UPDATE: // Using COMMANDS object
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot commit batch update.'
          );
        }
        stateManagerInstance.commitBatchUpdate();
        // commitBatchUpdate internally sends a snapshot update if changes occurred.
        break;

      case 'applyRuntimeState':
        console.log(
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
        console.log(
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

        stateManagerInstance.loadFromJSON(rulesData, playerId);
        // computeReachableRegions is called internally by loadFromJSON
        const initialSnapshot = stateManagerInstance.getSnapshot();

        // MODIFIED: Construct static data object directly from instance properties
        const workerStaticGameData = {
          items: stateManagerInstance.itemData,
          groups: stateManagerInstance.groupData, // This should now be the processed array of strings
          locations: stateManagerInstance.locations,
          regions: stateManagerInstance.regions,
          exits: stateManagerInstance.exits, // Ensure exits are included
          originalLocationOrder: stateManagerInstance.originalLocationOrder, // Ensure orders are included
          originalExitOrder: stateManagerInstance.originalExitOrder,
          originalRegionOrder: stateManagerInstance.originalRegionOrder,
          // Add other static data pieces if needed by the proxy or UI later
        };

        console.log(
          '[stateManagerWorker onmessage] Rules loaded. About to postMessage. WorkerStaticGameData details:'
        );
        console.log(
          '  workerStaticGameData keys:',
          Object.keys(workerStaticGameData)
        );
        console.log(
          '  workerStaticGameData.originalExitOrder type:',
          typeof workerStaticGameData.originalExitOrder,
          'Is Array:',
          Array.isArray(workerStaticGameData.originalExitOrder),
          'Length:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.length
            : 'N/A'
        );
        console.log(
          '  Sample originalExitOrder from workerStaticGameData:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.slice(0, 5)
            : 'N/A'
        );

        console.log(
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
          console.error(
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
            console.error(
              '[stateManagerWorker] Invalid payload for addItemToInventory: item name missing or not a string.',
              message.payload
            );
          }
        } catch (e) {
          console.error(
            '[stateManagerWorker] Error processing addItemToInventory:',
            e
          );
          // Optionally send an error back
        }
        break;

      // Basic query handling for commands that expect a response via queryId
      case 'getFullSnapshot':
      case 'checkLocation':
      case 'evaluateRuleRequest':
      case 'getStaticData':
        if (!workerInitialized || !stateManagerInstance) {
          console.error(
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
        console.log(
          `[SMW] Grouped command dispatch. Command: ${
            message.command
          }. Has queryId: ${!!message.queryId}. Payload type: ${typeof message.payload}`
        );
        if (message.payload && typeof message.payload === 'object') {
          console.log(
            `[SMW] Payload locationName: ${message.payload.locationName}`
          );
        }

        if (message.queryId) {
          // LOG 2: Inside if (message.queryId)
          console.log(
            `[SMW] Entered message.queryId block. Command: ${message.command}`
          );

          if (message.command === 'getFullSnapshot') {
            console.log(`[SMW] Matched command: getFullSnapshot`);
            const snapshot = stateManagerInstance.getSnapshot();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: snapshot,
            });
          } else if (message.command === 'getStaticData') {
            console.log(`[SMW] Matched command: getStaticData`);
            const staticData = stateManagerInstance.getStaticGameData();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: staticData,
            });
          } else if (message.command === 'checkLocation') {
            // LOG 3: Matched command checkLocation
            console.log(
              `[SMW] Matched command: checkLocation. Current payload:`,
              message.payload
                ? JSON.stringify(message.payload)
                : 'undefined/null'
            );
            try {
              // LOG 4: Start of try block for checkLocation
              console.log(`[SMW] checkLocation: try block entered.`);
              const locationName = message.payload.locationName;
              console.log(
                `[SMW] checkLocation: locationName extracted: "${locationName}" (type: ${typeof locationName})`
              );

              if (typeof locationName !== 'string') {
                console.error(
                  `[SMW] checkLocation: locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation: expected a string locationName in payload.locationName.'
                );
              }

              // LOG 5: Before calling instance.checkLocation
              console.log(
                `[SMW] checkLocation: About to call stateManagerInstance.checkLocation("${locationName}")`
              );
              stateManagerInstance.checkLocation(locationName);
              // LOG 6: After calling instance.checkLocation
              console.log(
                `[SMW] checkLocation: stateManagerInstance.checkLocation completed for "${locationName}".`
              );

              // Query response still sent if queryId was present
              console.log(
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
              console.error(
                `[SMW] checkLocation: CATCH block. Error for payload ${
                  message.payload
                    ? JSON.stringify(message.payload)
                    : 'undefined/null'
                }:`,
                error.message,
                error.stack
              );
              console.error(
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
            console.log(
              `[SMW] Command ${message.command} in queryId block, but not getFullSnapshot, getStaticData, or checkLocation.`
            );
            // This is a simplification for now to get the init/loadRules flow working.
            console.warn(
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
              if (typeof locationName !== 'string') {
                console.error(
                  `[SMW] checkLocation (no queryId): locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation (no queryId): expected a string locationName in payload.locationName.'
                );
              }
              console.log(
                `[SMW] checkLocation (no queryId): About to call stateManagerInstance.checkLocation("${locationName}")`
              );
              stateManagerInstance.checkLocation(locationName);
              console.log(
                `[SMW] checkLocation (no queryId): stateManagerInstance.checkLocation completed for "${locationName}".`
              );
            } catch (error) {
              console.error(
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
            console.warn(
              `[SMW] Command ${message.command} in grouped case did NOT have a queryId. This is unexpected for these commands if a response is awaited.`
            );
          }
        }
        break;

      default:
        console.warn(
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
    console.error(
      '[stateManagerWorker onmessage] Error processing command:',
      message.command,
      error
    );
    self.postMessage({
      type: 'workerError',
      command: message.command,
      errorMessage: error.message,
      errorStack: error.stack,
      queryId: message.queryId, // Include queryId if present, so proxy can reject promise
    });
  }
};
// --- END: Restored and Simplified onmessage Handler ---

console.log(
  '[stateManagerWorker] Worker is ready to receive messages via new onmessage handler.'
);
