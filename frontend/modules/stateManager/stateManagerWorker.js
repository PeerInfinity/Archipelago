console.log('[stateManagerWorker] Worker starting...');

// Import the StateManager class
import { StateManager } from './stateManager.js';
// Import the actual rule evaluation function
import { evaluateRule } from './ruleEngine.js';
// NOTE: ALTTPInventory, ALTTPState, ALTTPHelpers are imported
// and instantiated *inside* StateManager.js constructor or used directly.

console.log(
  '[stateManagerWorker] Dependencies loaded (StateManager, evaluateRule).'
);

// Instantiate the main StateManager, passing the evaluateRule function from ruleEngine
const stateManagerInstance = new StateManager(evaluateRule);

// Set the communication channel using an arrow function to preserve 'self' context for postMessage
stateManagerInstance.setCommunicationChannel((message) => {
  try {
    self.postMessage(message);
  } catch (error) {
    // Handle potential errors during postMessage (e.g., non-transferable objects)
    console.error(
      '[stateManagerWorker] Error posting message back to main thread:',
      error,
      message
    );
    // Optionally, try sending a simplified error message back
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

console.log(
  '[stateManagerWorker] StateManager instance created and communication channel set.'
);

// --- Message Handling ---

// Internal message queue and processing loop
const internalQueue = [];
let isProcessing = false;

async function processInternalQueue() {
  if (isProcessing) return;
  isProcessing = true;
  console.log(
    `[stateManagerWorker] Starting processing of ${internalQueue.length} queued messages.`
  );

  while (internalQueue.length > 0) {
    const message = internalQueue.shift();
    //console.log(
    //  '[stateManagerWorker processInternalQueue] Dequeued message:',
    //  JSON.stringify(message)
    //);
    console.log('[stateManagerWorker] Processing message:', message);
    try {
      // Route command/query to stateManagerInstance method
      // This requires StateManager methods to be adapted for the worker context
      // (e.g., return data directly or use the communication channel instead of eventBus)
      switch (message.command) {
        case 'loadRules':
          console.log(
            '[stateManagerWorker] Handling loadRules command...',
            message.payload
          );
          if (
            !message.payload ||
            !message.payload.rulesData ||
            !message.payload.playerInfo ||
            !message.payload.playerInfo.playerId
          ) {
            throw new Error('Invalid payload for loadRules command.');
          }
          // TODO: Refactor loadFromJSON to not need eventBus directly
          // For now, it might log errors about eventBus being null, which is expected in worker.
          stateManagerInstance.loadFromJSON(
            message.payload.rulesData,
            message.payload.playerInfo.playerId
          );
          console.log(
            '[stateManagerWorker] stateManagerInstance.loadFromJSON completed.'
          );

          // TODO: loadFromJSON likely needs to trigger computeReachableRegions internally.
          // We might need to ensure that computation finishes before snapshotting.
          // For now, assume loadFromJSON handles initial computation or call it explicitly if needed.
          // stateManagerInstance.computeReachableRegions(); // Example if needed
          console.log(
            '[stateManagerWorker] Computing initial reachable regions...'
          );
          await stateManagerInstance.computeReachableRegions(); // Ensure initial computation runs
          console.log(
            '[stateManagerWorker] Initial reachability computation complete.'
          );

          // Get the initial snapshot after loading AND computation
          const initialSnapshot = stateManagerInstance.getSnapshot();
          if (!initialSnapshot) {
            throw new Error(
              'Failed to generate initial snapshot after loading rules and computing reachability.'
            );
          }

          // Send confirmation and initial state back to the proxy
          self.postMessage({
            type: 'rulesLoadedConfirmation',
            initialSnapshot: initialSnapshot,
            // Optionally include initial queue status (empty after this first task)
            workerQueueSummary: [],
          });
          console.log(
            '[stateManagerWorker] Sent rulesLoadedConfirmation with initial snapshot.'
          );
          break;
        case 'addItemToInventory':
          console.log(
            '[stateManagerWorker] Handling addItemToInventory...',
            message.payload
          );
          stateManagerInstance.addItemToInventory(message.payload.item); // Assuming quantity is handled internally or refactored
          // TODO: StateManager needs modification to trigger snapshot/event posting via self.postMessage
          // console.log(
          //   '[stateManagerWorker] addItemToInventory handled (placeholder).'
          // ); // REMOVED placeholder log
          break;
        case 'getFullSnapshot':
          console.log('[stateManagerWorker] Handling getFullSnapshot query...');
          // const snapshot = await stateManagerInstance.getSnapshot();
          // self.postMessage({ type: 'queryResponse', queryId: message.queryId, result: snapshot });
          console.log(
            '[stateManagerWorker] getFullSnapshot handled (placeholder).'
          );
          break;
        case 'checkLocation':
          console.log(
            '[stateManagerWorker] Handling checkLocation...',
            message.payload // Payload is expected to be the location name string
          );
          if (typeof message.payload === 'string') {
            stateManagerInstance.checkLocation(message.payload);
            // StateManager.checkLocation now handles calling _sendSnapshotUpdate internally
            console.log(
              `[stateManagerWorker] checkLocation handled for ${message.payload}.`
            );
          } else {
            console.warn(
              '[stateManagerWorker] Invalid payload type for checkLocation (expected string): ',
              typeof message.payload
            );
          }
          // --- ADDED: Send confirmation back to proxy --- >
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: { success: true, checked: message.payload }, // Indicate success
          });
          // --- END ADDED --- >
          break;
        // --- ADDED HANDLER for evaluateRuleRequest ---
        case 'evaluateRuleRequest':
          console.log(
            '[stateManagerWorker] Handling evaluateRuleRequest...',
            message.payload
          );
          if (message.payload?.rule && message.queryId) {
            try {
              const result = stateManagerInstance.evaluateRuleFromEngine(
                message.payload.rule,
                stateManagerInstance._createSelfSnapshotInterface() // Use the worker's internal context
              );
              self.postMessage({
                type: 'queryResponse',
                queryId: message.queryId,
                result: result,
              });
              console.log(
                `[stateManagerWorker] Sent evaluateRuleResponse for query ${message.queryId}.`
              );
            } catch (evalError) {
              console.error(
                '[stateManagerWorker] Error evaluating rule for evaluateRuleRequest:',
                evalError
              );
              self.postMessage({
                type: 'queryResponse',
                queryId: message.queryId,
                error:
                  evalError.message || 'Error during remote rule evaluation',
              });
            }
          } else {
            console.warn(
              '[stateManagerWorker] Invalid payload for evaluateRuleRequest.'
            );
            if (message.queryId) {
              self.postMessage({
                type: 'queryResponse',
                queryId: message.queryId,
                error: 'Invalid payload for evaluateRuleRequest',
              });
            }
          }
          break;
        // --- END ADDED HANDLER ---
        default:
          console.warn(
            `[stateManagerWorker] Unknown command/query: ${
              message.command || 'N/A'
            }`
          );
          // If it was a query, reject it
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
        '[stateManagerWorker] Error processing message:',
        message,
        error
      );
      // Send error message back to proxy
      const errorMessage = {
        type: 'error',
        message: error.message,
        stack: error.stack,
        originalCommand: message,
      };
      // If it was a query, include the queryId in the error response
      if (message.queryId) {
        errorMessage.type = 'queryResponse';
        errorMessage.queryId = message.queryId;
        errorMessage.error = error.message; // Specific field for query errors
      }
      self.postMessage(errorMessage);
    }
  }

  console.log('[stateManagerWorker] Finished processing queue.');
  isProcessing = false;
}

self.onmessage = (event) => {
  //console.log(
  //  '[stateManagerWorker onmessage] Raw event.data:',
  //  JSON.stringify(event.data)
  //);
  //console.log('[stateManagerWorker] Received message:', event.data);
  internalQueue.push(event.data);
  // Trigger processing asynchronously
  setTimeout(processInternalQueue, 0);
};

console.log('[stateManagerWorker] Worker is ready to receive messages.');
