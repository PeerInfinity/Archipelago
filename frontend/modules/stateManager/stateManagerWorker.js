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
            gameId: workerConfig.gameId,
            playerId: workerConfig.playerId,
            rulesDataIsPresent: !!workerConfig.rulesData,
            settingsArePresent: !!workerConfig.settings,
          },
        });
        // Process any pre-init queue messages if we had such a mechanism
        // For now, direct initialization is assumed.
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
        console.log(
          '[stateManagerWorker onmessage] Rules loaded. Posting confirmation with snapshot.'
        );
        self.postMessage({
          type: 'rulesLoadedConfirmation',
          initialSnapshot: initialSnapshot,
          gameId: workerConfig.gameId,
          playerId: playerId,
          // workerQueueSummary: [] // Keeping this if proxy expects it, but internalQueue isn't used by this simple handler
        });
        break;

      // Basic query handling for commands that expect a response via queryId
      case 'getFullSnapshot':
      case 'checkLocation':
      case 'evaluateRuleRequest':
      case 'getStaticData':
        if (!workerInitialized || !stateManagerInstance) {
          console.error(
            `[stateManagerWorker] Worker not initialized. Cannot process ${message.command}.`
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
        // For simplicity, we'll assume the old processInternalQueue can handle these if adapted
        // or we would reimplement the logic directly here.
        // For now, just acknowledge and log for these specific query types.
        console.log(
          `[stateManagerWorker onmessage] Forwarding ${message.command} to internal processing (conceptual).`
        );
        // This is a placeholder. The actual command logic (like in the old processInternalQueue)
        // would need to be invoked here or refactored.
        // For now, let's just post a dummy ack if it has a queryId to avoid timeouts on the proxy.
        if (message.queryId) {
          if (message.command === 'getFullSnapshot') {
            const snapshot = stateManagerInstance.getSnapshot();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: snapshot,
            });
          } else if (message.command === 'getStaticData') {
            const staticData = stateManagerInstance.getStaticGameData();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: staticData,
            });
          } else {
            // For checkLocation, evaluateRuleRequest, we'd need more complex handling.
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
